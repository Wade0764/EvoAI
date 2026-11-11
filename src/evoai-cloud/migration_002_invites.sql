-- migration_002_invites.sql  (NOT APPLIED. Review, then run in the Supabase SQL editor as postgres.)
-- Purpose: let the invite creator re-read the code of a still-open invite (copy / share it later).
-- Today only SHA-256(code) is stored, so a code is shown once at creation and cannot be recovered.
-- The app works WITHOUT this: it saves the code on the creating device (localStorage) and calls
-- get_invite_code only if it exists. Invites created before this migration cannot be recovered
-- (hash only) - revoke them and create new ones.
-- Safe to run more than once. Plaintext lives in a private table, never exposed by RLS/PostgREST,
-- readable only through the owner-checked function below, and deleted on redeem / revoke.

create table if not exists private.invite_codes (
  invite_id uuid primary key references public.invites(id) on delete cascade,
  code      text not null
);
revoke all on private.invite_codes from public, anon, authenticated;

-- 1) create_invite: identical to schema.sql (3-arg) plus one INSERT into private.invite_codes.
create or replace function public.create_invite(p_kind text, p_vehicle_id uuid default null, p_email text default null)
returns table (invite_id uuid, code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_owner uuid;
  v_code text;
  v_id uuid;
  v_exp timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is null then raise exception 'no_profile' using errcode = '42501'; end if;

  if (select count(*) from public.invites i
       where i.created_by = v_uid and i.redeemed_at is null and i.revoked_at is null and i.expires_at > now()) >= 50 then
    raise exception 'too_many_open_invites' using errcode = '54000';
  end if;

  if p_kind = 'tech_vehicle' then
    select v.owner_id into v_owner from public.vehicles v where v.id = p_vehicle_id and v.owner_id = v_uid;
    if v_owner is null then raise exception 'not_vehicle_owner' using errcode = '42501'; end if;
  elsif p_kind = 'tech_owner' then
    if p_vehicle_id is not null then raise exception 'vehicle_id not allowed for tech_owner' using errcode = '22023'; end if;
    v_owner := v_uid;
  elsif p_kind = 'client_owner' then
    if v_role not in ('tech','admin') or p_vehicle_id is not null then
      raise exception 'only techs can invite clients' using errcode = '42501';
    end if;
    v_owner := null;
  else
    raise exception 'invalid invite kind (transfers use initiate_transfer)' using errcode = '22023';
  end if;

  v_code := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 32);
  insert into public.invites (code_hash, kind, created_by, owner_id, vehicle_id, email)
  values (encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), p_kind, v_uid, v_owner,
          case when p_kind = 'tech_vehicle' then p_vehicle_id end, nullif(lower(btrim(p_email)), ''))
  returning id, invites.expires_at into v_id, v_exp;

  insert into private.invite_codes (invite_id, code) values (v_id, v_code);   -- NEW

  return query select v_id, v_code, v_exp;
end $$;
-- (grants on create_invite are unchanged: create or replace keeps them)

-- 2) Owner-only reveal of an OPEN invite's code (creator only; admin cannot read others' codes).
create or replace function public.get_invite_code(p_invite_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare v_code text;
begin
  select c.code into v_code
    from private.invite_codes c join public.invites i on i.id = c.invite_id
   where c.invite_id = p_invite_id and i.created_by = auth.uid()
     and i.redeemed_at is null and i.revoked_at is null and i.expires_at > now();
  return v_code;   -- null when unknown / not yours / used / revoked / expired
end $$;
revoke execute on function public.get_invite_code(uuid) from public, anon;
grant  execute on function public.get_invite_code(uuid) to authenticated;

-- 3) Drop the plaintext as soon as the invite is redeemed or revoked.
create or replace function private.purge_invite_code() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.redeemed_at is not null or new.revoked_at is not null then
    delete from private.invite_codes where invite_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists invites_purge_code on public.invites;
create trigger invites_purge_code after update of redeemed_at, revoked_at on public.invites
  for each row execute function private.purge_invite_code();
