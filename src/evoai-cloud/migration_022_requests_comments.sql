-- migration_022_requests_comments.sql  (EvoAI v40 / p40: Client Requests + Comments)  STATUS: NOT APPLIED. Idempotent.
-- Paste into the Supabase SQL editor as one script (run backup_022_20261031.sql first, or rely on step 0 below).
-- What it adds (no existing table or column is changed):
--   1. public.service_requests   a client asks for a service (or "Something else" + free text) on one of their cars.
--        Owners / co-owners create and read their own; they can withdraw (delete) while still 'new'; they can NOT change
--        status. The collection's tech (active tech_access) and admins read and update (accept / schedule / done).
--   2. public.request_photos     optional photos for a request. Files live in the existing private 'vehicle-photos'
--        bucket under <owner>/<vehicle>/req-*.jpg, so the existing storage policies apply (no storage change).
--   3. public.comments           one comment thread per collection (optionally tagged to a car or a request).
--        Readable/postable by the collection's owners, its tech and admins. Only the author edits (body only) or deletes;
--        admins may also delete.
--   4. public.comment_reads      per-user "last read" time per collection thread (drives the "2 new" label). Own rows only.
-- Requires migration_010_co_owners.sql (private.is_collection_owner).
-- ROLLBACK: rollback_022.sql   (copies any rows to evo_backup first, then drops the four tables).
begin;
do $$ begin
  if to_regprocedure('private.is_collection_owner(uuid)') is null then
    raise exception 'migration_022 needs migration_010_co_owners.sql applied first'; end if;
end $$;

-- 0. backups (first run only; nothing existing is modified, these are a safety snapshot) -------------------------
create schema if not exists evo_backup;
create table if not exists evo_backup.profiles_20261031    as table public.profiles;
create table if not exists evo_backup.vehicles_20261031    as table public.vehicles;
create table if not exists evo_backup.tech_access_20261031 as table public.tech_access;
do $b$ declare t text; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='evo_backup' and c.relname like '%\_20261031' and c.relkind='r' loop
    execute format('revoke all on evo_backup.%I from public, anon, authenticated', t);
  end loop;
end $b$;
revoke all on schema evo_backup from public, anon, authenticated;

-- helper: may the signed-in user act as staff (tech/admin) on this car? --------------------------------------------
create or replace function private.request_staff(p_vehicle uuid, p_owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin() or private.has_active_tech_access(p_vehicle) or private.is_client_tech(p_owner) or private.is_managing_tech(p_owner);
$$;
-- helper: may the signed-in user see / post in this collection's comment thread?
create or replace function private.thread_member(p_owner uuid, p_vehicle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin() or private.is_collection_owner(p_owner) or private.is_client_tech(p_owner) or private.is_managing_tech(p_owner)
      or (p_vehicle is not null and private.has_active_tech_access(p_vehicle));
$$;
revoke all on function private.request_staff(uuid,uuid), private.thread_member(uuid,uuid) from public, anon;
grant execute on function private.request_staff(uuid,uuid), private.thread_member(uuid,uuid) to authenticated, service_role;

-- 1. service_requests -----------------------------------------------------------------------------------------------
create table if not exists public.service_requests (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  vehicle_id     uuid not null references public.vehicles(id) on delete cascade,
  created_by     uuid references public.profiles(id) on delete set null default auth.uid(),
  service        text not null check (service in ('maintenance','detailing','tires','mechanical','electrical','cosmetic','storage','appraisal','restoration','other')),
  details        text check (details is null or char_length(details) <= 1000),
  preferred_date date,
  preferred_time text not null default 'any' check (preferred_time in ('any','morning','afternoon','evening')),
  notes          text check (notes is null or char_length(notes) <= 1000),
  status         text not null default 'new' check (status in ('new','accepted','scheduled','done','declined')),
  assigned_tech  uuid references public.profiles(id) on delete set null,
  scheduled_for  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint service_requests_other_needs_details check (service <> 'other' or char_length(btrim(coalesce(details,''))) >= 3),
  constraint service_requests_scheduled_has_time check (status <> 'scheduled' or scheduled_for is not null)
);
create index if not exists service_requests_owner   on public.service_requests (owner_id, created_at desc);
create index if not exists service_requests_vehicle on public.service_requests (vehicle_id);
create index if not exists service_requests_status  on public.service_requests (status) where status in ('new','accepted','scheduled');

-- guard: car must belong to the collection; who/what/where never change after insert
create or replace function private.service_requests_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.vehicles v where v.id = new.vehicle_id and v.owner_id = new.owner_id) then
      raise exception 'vehicle_not_in_collection' using errcode = '42501'; end if;
  else
    if new.owner_id is distinct from old.owner_id or new.vehicle_id is distinct from old.vehicle_id
       or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
      raise exception 'request_fields_locked' using errcode = '42501'; end if;
  end if;
  return new;
end $$;
drop trigger if exists service_requests_guard on public.service_requests;
create trigger service_requests_guard before insert or update on public.service_requests
  for each row execute function private.service_requests_guard();
drop trigger if exists service_requests_set_updated_at on public.service_requests;
create trigger service_requests_set_updated_at before update on public.service_requests
  for each row execute function private.set_updated_at();

alter table public.service_requests enable row level security;
revoke all on public.service_requests from anon;
grant select, insert, update, delete on public.service_requests to authenticated;
drop policy if exists service_requests_select on public.service_requests;
create policy service_requests_select on public.service_requests for select to authenticated
  using (private.is_collection_owner(owner_id) or private.request_staff(vehicle_id, owner_id));
drop policy if exists service_requests_insert on public.service_requests;
create policy service_requests_insert on public.service_requests for insert to authenticated
  with check (private.is_collection_owner(owner_id) and created_by = (select auth.uid())
              and status = 'new' and assigned_tech is null and scheduled_for is null);
-- only tech/admin update (owners have no update policy at all, so they can never change status)
drop policy if exists service_requests_update on public.service_requests;
create policy service_requests_update on public.service_requests for update to authenticated
  using (private.request_staff(vehicle_id, owner_id)) with check (private.request_staff(vehicle_id, owner_id));
drop policy if exists service_requests_delete on public.service_requests;
create policy service_requests_delete on public.service_requests for delete to authenticated
  using ((private.is_collection_owner(owner_id) and status = 'new') or (select private.is_admin()));

-- 2. request_photos ---------------------------------------------------------------------------------------------------
create table if not exists public.request_photos (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.service_requests(id) on delete cascade,
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/req-[^/]+$'),
  uploaded_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists request_photos_request on public.request_photos (request_id);
alter table public.request_photos enable row level security;
revoke all on public.request_photos from anon;
grant select, insert, delete on public.request_photos to authenticated;
drop policy if exists request_photos_select on public.request_photos;
create policy request_photos_select on public.request_photos for select to authenticated
  using (exists (select 1 from public.service_requests r where r.id = request_id));   -- inherits service_requests RLS
drop policy if exists request_photos_insert on public.request_photos;
create policy request_photos_insert on public.request_photos for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and private.is_collection_owner(owner_id)
              and exists (select 1 from public.service_requests r where r.id = request_id and r.owner_id = request_photos.owner_id
                          and split_part(request_photos.storage_path,'/',1) = r.owner_id::text
                          and split_part(request_photos.storage_path,'/',2) = r.vehicle_id::text));
drop policy if exists request_photos_delete on public.request_photos;
create policy request_photos_delete on public.request_photos for delete to authenticated
  using (uploaded_by = (select auth.uid()) or (select private.is_admin()));

-- 3. comments -----------------------------------------------------------------------------------------------------------
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,      -- the collection (thread)
  vehicle_id  uuid references public.vehicles(id) on delete cascade,
  request_id  uuid references public.service_requests(id) on delete set null,
  author_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  edited_at   timestamptz
);
create index if not exists comments_owner on public.comments (owner_id, created_at);
create index if not exists comments_request on public.comments (request_id) where request_id is not null;
create or replace function private.comments_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.vehicle_id is not null and not exists (select 1 from public.vehicles v where v.id = new.vehicle_id and v.owner_id = new.owner_id) then
      raise exception 'vehicle_not_in_collection' using errcode = '42501'; end if;
    if new.request_id is not null and not exists (select 1 from public.service_requests r where r.id = new.request_id and r.owner_id = new.owner_id) then
      raise exception 'request_not_in_collection' using errcode = '42501'; end if;
  else
    if new.owner_id is distinct from old.owner_id or new.vehicle_id is distinct from old.vehicle_id or new.request_id is distinct from old.request_id
       or new.author_id is distinct from old.author_id or new.created_at is distinct from old.created_at then
      raise exception 'comment_fields_locked' using errcode = '42501'; end if;
    if new.body is distinct from old.body then new.edited_at := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists comments_guard on public.comments;
create trigger comments_guard before insert or update on public.comments for each row execute function private.comments_guard();
drop trigger if exists comments_set_updated_at on public.comments;
create trigger comments_set_updated_at before update on public.comments for each row execute function private.set_updated_at();
alter table public.comments enable row level security;
revoke all on public.comments from anon;
grant select, insert, update, delete on public.comments to authenticated;
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select to authenticated
  using (private.thread_member(owner_id, vehicle_id));
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = (select auth.uid()) and private.thread_member(owner_id, vehicle_id));
drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = (select auth.uid()) or (select private.is_admin()));

-- 4. comment_reads ------------------------------------------------------------------------------------------------------
create table if not exists public.comment_reads (
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, owner_id)
);
alter table public.comment_reads enable row level security;
revoke all on public.comment_reads from anon;
grant select, insert, update, delete on public.comment_reads to authenticated;
drop policy if exists comment_reads_own on public.comment_reads;
create policy comment_reads_own on public.comment_reads for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.thread_member(owner_id, null));

commit;

-- 5. verification (every row should say ok = true)
select 'service_requests rls' as check, relrowsecurity as ok from pg_class where oid='public.service_requests'::regclass
union all select 'request_photos rls', relrowsecurity from pg_class where oid='public.request_photos'::regclass
union all select 'comments rls', relrowsecurity from pg_class where oid='public.comments'::regclass
union all select 'comment_reads rls', relrowsecurity from pg_class where oid='public.comment_reads'::regclass
union all select 'anon has no access', not has_table_privilege('anon','public.service_requests','select') and not has_table_privilege('anon','public.comments','select');
