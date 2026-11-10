-- migration_019_short_invites.sql   NOT APPLIED. Review, run sql_v19_backup section first, then this, in the Supabase SQL editor (postgres).
-- Short, peppered, rate-limited invite codes. Idempotent (safe to run twice). Rollback: rollback_019_short_invites.sql
-- * New invites get an 8-char code from ABCDEFGHJKMNPQRSTUVWXYZ23456789 (no 0/O/1/I/L), shown as ABCD-EFGH.
-- * Stored only as sha256(pepper || code) (pepper in private.invite_pepper, unreadable by API roles), expire in 7 days, single use.
-- * Old 32-char codes keep working until they expire (legacy sha256 path untouched).
-- * Creation limited to 20 per user per hour; redeem limited to 10 failed tries per user per hour (counted even on failure).
-- * Implementation: the existing creator / redeem functions are moved to schema private as *_core (bodies unchanged,
--   no API access) and thin public wrappers keep the same names, arguments and return shapes.

-- 0) BACKUP of the current function definitions (rollback reads it)
create table if not exists private.backup_019 (fn text primary key, def text not null, saved_at timestamptz not null default now());
revoke all on private.backup_019 from public, anon, authenticated;
do $$ declare r record; begin
  for r in select p.oid, p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.proname in ('create_invite','create_co_owner_invite','create_managed_client_invite','redeem_invite') loop
    insert into private.backup_019(fn,def) values (r.sig, pg_get_functiondef(r.oid)) on conflict (fn) do nothing;
  end loop; end $$;

-- 1) pepper + attempt log
create table if not exists private.invite_pepper (id int primary key default 1 check (id=1), pepper text not null);
insert into private.invite_pepper(id,pepper) values (1, replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','')) on conflict (id) do nothing;
revoke all on private.invite_pepper from public, anon, authenticated;
create table if not exists private.invite_attempts (user_id uuid not null, at timestamptz not null default now(), ok boolean not null);
create index if not exists invite_attempts_idx on private.invite_attempts (user_id, at desc);
revoke all on private.invite_attempts from public, anon, authenticated;

create or replace function private.short_code() returns text language plpgsql volatile set search_path = '' as $$
declare a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; b bytea; s text := ''; i int; v int;
begin
  while length(s) < 8 loop
    b := uuid_send(gen_random_uuid());
    for i in 0..15 loop
      v := get_byte(b, i);
      if v < 248 and length(s) < 8 then s := s || substr(a, (v % 31) + 1, 1); end if;   -- rejection sampling: no modulo bias
    end loop;
  end loop;
  return s;
end $$;
-- normalise what a person pasted: strip spaces/dashes, upper-case
create or replace function private.norm_code(p text) returns text language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(p,''), '[^A-Za-z0-9]', '', 'g')) $$;
-- the value handed to the legacy core so it stores/looks up sha256(lower(token)); token = sha256(pepper||code)
create or replace function private.short_token(p_code text) returns text language sql stable security definer set search_path = '' as $$
  select encode(sha256(convert_to((select pepper from private.invite_pepper where id=1) || private.norm_code(p_code), 'UTF8')), 'hex') $$;
revoke execute on function private.short_code(), private.norm_code(text), private.short_token(text) from public, anon, authenticated;

-- 2) move the current functions to private.*_core (only once)
do $$ begin
  if to_regprocedure('private.create_invite_core(text,uuid,text)') is null and to_regprocedure('public.create_invite(text,uuid,text)') is not null then
    alter function public.create_invite(text,uuid,text) rename to create_invite_core; alter function public.create_invite_core(text,uuid,text) set schema private; end if;
  if to_regprocedure('private.create_invite_core(text,uuid,text,text)') is null and to_regprocedure('public.create_invite(text,uuid,text,text)') is not null then
    alter function public.create_invite(text,uuid,text,text) rename to create_invite_core; alter function public.create_invite_core(text,uuid,text,text) set schema private; end if;
  if to_regprocedure('private.create_co_owner_invite_core(text)') is null and to_regprocedure('public.create_co_owner_invite(text)') is not null then
    alter function public.create_co_owner_invite(text) rename to create_co_owner_invite_core; alter function public.create_co_owner_invite_core(text) set schema private; end if;
  if to_regprocedure('private.create_managed_client_invite_core(uuid,text)') is null and to_regprocedure('public.create_managed_client_invite(uuid,text)') is not null then
    alter function public.create_managed_client_invite(uuid,text) rename to create_managed_client_invite_core; alter function public.create_managed_client_invite_core(uuid,text) set schema private; end if;
  if to_regprocedure('private.redeem_invite_core(text)') is null and to_regprocedure('public.redeem_invite(text)') is not null then
    alter function public.redeem_invite(text) rename to redeem_invite_core; alter function public.redeem_invite_core(text) set schema private; end if;
end $$;
do $$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like '%invite%_core' loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop; end $$;

-- 3) shared post-step: swap the long code for a short one, 7-day expiry, create rate limit
create or replace function private.shorten_invite(p_id uuid) returns table (code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_code text; v_exp timestamptz; n int;
begin
  select count(*) into n from public.invites i where i.created_by = auth.uid() and i.created_at > now() - interval '1 hour';
  if n > 20 then raise exception 'rate_limited' using errcode = '54000'; end if;
  for n in 1..5 loop
    v_code := private.short_code();
    begin
      update public.invites i set code_hash = encode(sha256(convert_to(lower(private.short_token(v_code)),'UTF8')),'hex'),
             expires_at = least(i.expires_at, now() + interval '7 days')
       where i.id = p_id returning i.expires_at into v_exp;
      exit;
    exception when unique_violation then v_code := null; end;
  end loop;
  if v_code is null then raise exception 'code_collision' using errcode = 'P0001'; end if;
  if to_regclass('private.invite_codes') is not null then
    execute 'update private.invite_codes set code = $1 where invite_id = $2' using v_code, p_id;   -- creator re-copy (migration_002)
  end if;
  return query select v_code, v_exp;
end $$;
revoke execute on function private.shorten_invite(uuid) from public, anon, authenticated;

-- 4) public wrappers (same names / args / return shapes as before)
create or replace function public.create_invite(p_kind text, p_vehicle_id uuid default null, p_email text default null)
returns table (invite_id uuid, code text, expires_at timestamptz) language plpgsql security definer set search_path = '' as $$
declare r record; s record; begin
  select * into r from private.create_invite_core(p_kind, p_vehicle_id, p_email) limit 1;
  select * into s from private.shorten_invite(r.invite_id);
  return query select r.invite_id, s.code, s.expires_at; end $$;
do $$ begin
  if to_regprocedure('private.create_invite_core(text,uuid,text,text)') is not null then
    execute $f$create or replace function public.create_invite(p_kind text, p_vehicle_id uuid, p_email text, p_label text)
      returns table (invite_id uuid, code text, expires_at timestamptz) language plpgsql security definer set search_path = '' as $b$
      declare r record; s record; begin
        select * into r from private.create_invite_core(p_kind, p_vehicle_id, p_email, p_label) limit 1;
        select * into s from private.shorten_invite(r.invite_id);
        return query select r.invite_id, s.code, s.expires_at; end $b$ $f$;
    execute 'revoke execute on function public.create_invite(text,uuid,text,text) from public, anon';
    execute 'grant execute on function public.create_invite(text,uuid,text,text) to authenticated';
  end if;
  if to_regprocedure('private.create_co_owner_invite_core(text)') is not null then
    execute $f$create or replace function public.create_co_owner_invite(p_email text default null)
      returns table (invite_id uuid, code text, expires_at timestamptz) language plpgsql security definer set search_path = '' as $b$
      declare r record; s record; begin
        select * into r from private.create_co_owner_invite_core(p_email) limit 1;
        select * into s from private.shorten_invite(r.invite_id);
        return query select r.invite_id, s.code, s.expires_at; end $b$ $f$;
    execute 'revoke execute on function public.create_co_owner_invite(text) from public, anon';
    execute 'grant execute on function public.create_co_owner_invite(text) to authenticated';
  end if;
  if to_regprocedure('private.create_managed_client_invite_core(uuid,text)') is not null then
    execute $f$create or replace function public.create_managed_client_invite(p_managed_id uuid, p_email text default null)
      returns table (invite_id uuid, code text, expires_at timestamptz) language plpgsql security definer set search_path = '' as $b$
      declare r record; s record; begin
        select * into r from private.create_managed_client_invite_core(p_managed_id, p_email) limit 1;
        select * into s from private.shorten_invite(r.invite_id);
        return query select r.invite_id, s.code, s.expires_at; end $b$ $f$;
    execute 'revoke execute on function public.create_managed_client_invite(uuid,text) from public, anon';
    execute 'grant execute on function public.create_managed_client_invite(uuid,text) to authenticated';
  end if;
end $$;
revoke execute on function public.create_invite(text,uuid,text) from public, anon;
grant  execute on function public.create_invite(text,uuid,text) to authenticated;

-- redeem: short codes go through the pepper; long legacy codes unchanged. Failures are logged and returned as
-- {"error": "..."} (not raised) so the attempt row survives; the app maps data.error to the same messages as before.
create or replace function public.redeem_invite(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); k text := private.norm_code(p_code); n int; res jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select count(*) into n from private.invite_attempts a where a.user_id = v_uid and not a.ok and a.at > now() - interval '1 hour';
  if n >= 10 then return jsonb_build_object('error','too_many_attempts'); end if;
  begin
    if length(k) = 8 then res := private.redeem_invite_core(private.short_token(k));
    else res := private.redeem_invite_core(p_code); end if;
  exception when others then
    insert into private.invite_attempts(user_id, ok) values (v_uid, false);
    if sqlerrm in ('invalid_or_expired_invite','cannot_redeem_own_invite','role_not_eligible','vin_conflict','no_profile') then
      return jsonb_build_object('error', sqlerrm); end if;
    return jsonb_build_object('error','invalid_or_expired_invite');
  end;
  insert into private.invite_attempts(user_id, ok) values (v_uid, true);
  delete from private.invite_attempts a where a.at < now() - interval '1 day';
  return res;
end $$;
revoke execute on function public.redeem_invite(text) from public, anon;
grant  execute on function public.redeem_invite(text) to authenticated;
-- new invites default to 7 days even if created by another path
alter table public.invites alter column expires_at set default (now() + interval '7 days');
