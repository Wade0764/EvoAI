-- migration_020: rename collection. Adds profiles.collection_name (1..60 chars, trimmed) and an RPC to set it.
-- Who may rename: the collection owner (or a co-owner), an admin, or a tech managing an unclaimed client (edit rights).
-- profiles UPDATE grants are NOT widened; the only write path is public.set_collection_name. Idempotent. Rollback: rollback_020_collection_name.sql
-- Requires: migration_003/005b (private.is_managing_tech), migration_010 (private.is_collection_owner).
begin;
-- 1. backup (nothing to back up but the column, which is new; record what existed so rollback is exact)
create table if not exists private.backup_020 (k text primary key, v text, taken_at timestamptz default now());
insert into private.backup_020(k,v)
  select 'had_column', (exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='collection_name'))::text
  on conflict (k) do nothing;
-- 2. column
alter table public.profiles add column if not exists collection_name text;
do $b$ begin
  if not exists (select 1 from pg_constraint where conname='profiles_collection_name_chk') then
    alter table public.profiles add constraint profiles_collection_name_chk
      check (collection_name is null or (collection_name = btrim(collection_name) and char_length(collection_name) between 1 and 60));
  end if;
end $b$;
-- 3. RPC
create or replace function public.set_collection_name(p_owner uuid, p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  if auth.uid() is null then raise exception 'not_allowed' using errcode='42501'; end if;
  if p_owner is null or not exists (select 1 from public.profiles where id = p_owner) then raise exception 'not_allowed' using errcode='42501'; end if;
  if not (private.is_collection_owner(p_owner) or private.is_admin() or private.is_managing_tech(p_owner)) then
    raise exception 'not_allowed' using errcode='42501';
  end if;
  v := btrim(regexp_replace(coalesce(p_name,''), '\s+', ' ', 'g'));
  if char_length(v) < 1 or char_length(v) > 60 then raise exception 'invalid_name' using errcode='22023'; end if;
  update public.profiles set collection_name = v where id = p_owner;
  return v;
end $$;
revoke all on function public.set_collection_name(uuid,text) from public, anon;
grant execute on function public.set_collection_name(uuid,text) to authenticated;
commit;
