-- migration_011_doc_files.sql  -- document thumbnails (EvoAI v18 docthumbs). NOT APPLIED. Safe to re-run.
-- Depends on migration_006_portfolio.sql (storage helpers) and migration_007_doc_ai.sql.
-- Original files were already kept in the private 'vehicle-documents' bucket ({owner}/{vehicle}/{uuid}.{ext});
-- the AI scan only reads them. This migration adds a small stored thumbnail per document
-- ({owner}/{vehicle}/{uuid}_t.jpg, ~360px JPEG made in the browser) and keeps it under the same access rules.
-- Without it the app still works: it renders thumbnails on the device from the file itself.
begin;
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='ai_status') then
    raise exception 'migration_011 needs migration_007_doc_ai.sql applied first';
  end if;
end $$;

-- 1. documents.thumb_path (same vehicle folder as the file, never equal to it)
alter table public.documents add column if not exists thumb_path text;
alter table public.documents drop constraint if exists documents_thumb_path_chk;
alter table public.documents add  constraint documents_thumb_path_chk check (
  thumb_path is null or (split_part(thumb_path,'/',2) = vehicle_id::text and split_part(thumb_path,'/',3) <> ''
                         and split_part(thumb_path,'/',4) = '' and thumb_path <> storage_path and length(thumb_path) <= 300));
create unique index if not exists documents_thumb_path_key on public.documents (thumb_path) where thumb_path is not null;

-- 2. storage read rule: a thumbnail of an owner_only document is as private as the document
--    (identical to migration_006 otherwise)
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
                      and not exists (select 1 from public.documents d
                                       where (d.storage_path = p_name or d.thumb_path = p_name) and d.owner_only)
               end)
     );
$$;
grant execute on function private.can_read_object(text, text) to authenticated, service_role;

-- 3. (only if migration 005b is installed) client purge also lists document thumbnails
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
          select 'vehicle-documents'::text, x.path
            from public.documents d join public.vehicles v on v.id = d.vehicle_id,
                 lateral (values (d.storage_path), (d.thumb_path)) as x(path)
           where v.owner_id = p_id and x.path is not null;
      end $b$
    $f$;
  end if;
end $mig$;

-- 4. the export snapshot already strips storage_path; nothing else to change.
commit;
