-- migration_006_portfolio.sql  (NOT APPLIED. Review, then run ONCE in the Supabase SQL editor as postgres.)
-- Safe to run more than once (idempotent). One transaction. Run AFTER schema.sql, rls.sql, storage.sql (and 005b if you use it).
--
-- VEHICLE PORTFOLIO (many photos per vehicle). The existing table public.vehicle_photos is REUSED (no new table):
--   id, vehicle_id, uploaded_by (= created_by), storage_path (= original image), caption, is_cover, sort_order (= sort), created_at
--   + NEW columns: thumb_path (~400px), display_path (~1600px), tag (Exterior/Interior/Engine/Detail/Work).
-- Row access is UNCHANGED (rls.sql): owner/admin, managing tech, tech with view_photos may read; insert/update/delete of own rows
-- needs view_photos (there is no separate add-photo toggle in this schema: "may see photos" = "may add photos").
-- Storage: new objects live at {owner_id}/{vehicle_id}/portfolio/{uuid}.jpg (+ {uuid}_t.jpg, {uuid}_d.jpg). The old read/write helpers
-- only accepted exactly 2 folder levels, so they are replaced to also accept the 3-level 'portfolio' folder in the vehicle-photos bucket.
-- Storage insert/update/delete POLICIES already call these helpers and are not touched.
-- ROLLBACK: alter table public.vehicle_photos drop column thumb_path, drop column display_path, drop column tag;
--           then re-run storage.sql's two create or replace function statements for private.can_read_object / can_write_object.
begin;

-- ---------------------------------------------------------------------------
-- 1. columns + checks
-- ---------------------------------------------------------------------------
alter table public.vehicle_photos add column if not exists thumb_path   text;
alter table public.vehicle_photos add column if not exists display_path text;
alter table public.vehicle_photos add column if not exists tag          text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vehicle_photos_tag_chk' and conrelid = 'public.vehicle_photos'::regclass) then
    alter table public.vehicle_photos add constraint vehicle_photos_tag_chk
      check (tag is null or tag in ('Exterior','Interior','Engine','Detail','Work'));
  end if;
  -- derived files must sit in the same {owner}/{vehicle}/ folder as the original
  if not exists (select 1 from pg_constraint where conname = 'vehicle_photos_derived_paths_chk' and conrelid = 'public.vehicle_photos'::regclass) then
    alter table public.vehicle_photos add constraint vehicle_photos_derived_paths_chk
      check ((thumb_path   is null or (split_part(thumb_path,'/',1)   = split_part(storage_path,'/',1) and split_part(thumb_path,'/',2)   = vehicle_id::text and split_part(thumb_path,'/',3)   <> ''))
         and (display_path is null or (split_part(display_path,'/',1) = split_part(storage_path,'/',1) and split_part(display_path,'/',2) = vehicle_id::text and split_part(display_path,'/',3) <> '')));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vehicle_photos_caption_len_chk' and conrelid = 'public.vehicle_photos'::regclass) then
    alter table public.vehicle_photos add constraint vehicle_photos_caption_len_chk check (caption is null or char_length(caption) <= 200);
  end if;
end $$;

create index if not exists vehicle_photos_vehicle_tag_idx on public.vehicle_photos (vehicle_id, tag);
create index if not exists vehicle_photos_vehicle_created_idx on public.vehicle_photos (vehicle_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. storage helpers: also allow {owner_id}/{vehicle_id}/portfolio/{file} in the vehicle-photos bucket
--    (identical to storage.sql otherwise; access still follows the vehicle id in segment 2)
-- ---------------------------------------------------------------------------
create or replace function private.can_read_object(p_bucket text, p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_bucket in ('vehicle-photos','vehicle-documents')
     and (array_length(storage.foldername(p_name), 1) = 2
          or (p_bucket = 'vehicle-photos' and array_length(storage.foldername(p_name), 1) = 3
              and (storage.foldername(p_name))[3] = 'portfolio'))
     and private.object_vehicle(p_name) is not null
     and (
       private.is_owner_or_admin(private.object_vehicle(p_name))
       or (private.has_active_tech_access(private.object_vehicle(p_name))
           and case p_bucket
                 when 'vehicle-photos' then private.tech_can(private.object_vehicle(p_name), 'view_photos')
                 else private.tech_can(private.object_vehicle(p_name), 'view_documents')
                      and not exists (select 1 from public.documents d where d.storage_path = p_name and d.owner_only)
               end)
     );
$$;

create or replace function private.can_write_object(p_bucket text, p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_bucket in ('vehicle-photos','vehicle-documents')
     and (array_length(storage.foldername(p_name), 1) = 2
          or (p_bucket = 'vehicle-photos' and array_length(storage.foldername(p_name), 1) = 3
              and (storage.foldername(p_name))[3] = 'portfolio'))
     and private.object_vehicle(p_name) is not null
     and private.try_uuid((storage.foldername(p_name))[1]) = (select v.owner_id from public.vehicles v where v.id = private.object_vehicle(p_name))
     and private.can_write_vehicle(private.object_vehicle(p_name))
     and private.tech_can(private.object_vehicle(p_name),
                          case p_bucket when 'vehicle-photos' then 'view_photos' else 'can_add_documents' end);
$$;

grant execute on function private.can_read_object(text, text), private.can_write_object(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. (only if migration 005b is installed) client purge lists the thumbnail + display files too
-- ---------------------------------------------------------------------------
do $mig$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'client_storage_paths') then
    execute $f$
      create or replace function public.client_storage_paths(p_id uuid)
      returns table (bucket text, path text)
      language plpgsql stable security definer set search_path = '' as $b$
      begin
        if auth.uid() is null or not private.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
        if not exists (select 1 from public.profiles where id = p_id and managed and claimed_by is null and archived_at is not null) then
          raise exception 'client_not_removed' using errcode = 'P0001';
        end if;
        return query
          select 'vehicle-photos'::text, x.path
            from public.vehicle_photos ph join public.vehicles v on v.id = ph.vehicle_id,
                 lateral (values (ph.storage_path), (ph.thumb_path), (ph.display_path)) as x(path)
           where v.owner_id = p_id and x.path is not null
          union all
          select 'vehicle-documents'::text, d.storage_path from public.documents d join public.vehicles v on v.id = d.vehicle_id where v.owner_id = p_id;
      end $b$
    $f$;
  end if;
end $mig$;

commit;
