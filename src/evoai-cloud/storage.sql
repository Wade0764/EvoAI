-- EVOai storage buckets + policies. DESIGN ONLY. Run after schema.sql (needs tables + helpers).
-- Path convention: {owner_id}/{vehicle_id}/{filename}
--   * segment 1 must equal the vehicle's CURRENT owner at upload time
--   * ACCESS ALWAYS FOLLOWS segment 2 (vehicle_id) -> vehicles/tech_access, NOT segment 1.
--     After a transfer, old objects keep the seller's prefix but the seller loses access and the buyer gains it.
--   Objects are never public; use signed URLs (short expiry) from the client.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('vehicle-photos',    'vehicle-photos',    false, 15 * 1024 * 1024,
     array['image/jpeg','image/png','image/webp','image/heic','image/heif']),
  ('vehicle-documents', 'vehicle-documents', false, 25 * 1024 * 1024,
     array['application/pdf','image/jpeg','image/png','image/webp','image/heic','text/plain'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- safe uuid cast (bad path segments => NULL => deny)
create or replace function private.try_uuid(p text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- path vehicle id = 2nd folder segment
create or replace function private.object_vehicle(p_name text) returns uuid
language sql immutable set search_path = '' as $$
  select private.try_uuid((storage.foldername(p_name))[2]);
$$;

create or replace function private.can_read_object(p_bucket text, p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_bucket in ('vehicle-photos','vehicle-documents')
     and array_length(storage.foldername(p_name), 1) = 2
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

-- writes: owner/admin always; techs need the vehicle writable AND the matching toggle
-- (photos bucket: view_photos; documents bucket: can_add_documents)
create or replace function private.can_write_object(p_bucket text, p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_bucket in ('vehicle-photos','vehicle-documents')
     and array_length(storage.foldername(p_name), 1) = 2
     and private.object_vehicle(p_name) is not null
     and private.try_uuid((storage.foldername(p_name))[1]) = (select v.owner_id from public.vehicles v where v.id = private.object_vehicle(p_name))
     and private.can_write_vehicle(private.object_vehicle(p_name))
     and private.tech_can(private.object_vehicle(p_name),
                          case p_bucket when 'vehicle-photos' then 'view_photos' else 'can_add_documents' end);
$$;

grant execute on function private.try_uuid(text), private.object_vehicle(text),
  private.can_read_object(text, text), private.can_write_object(text, text) to authenticated, service_role;

-- NOTE: RLS on storage.objects is already enabled by Supabase.
create policy evoai_objects_select on storage.objects for select to authenticated
  using (private.can_read_object(bucket_id, name));

create policy evoai_objects_insert on storage.objects for insert to authenticated
  with check (private.can_write_object(bucket_id, name));

-- update is needed for upsert / metadata; same rule on old and new name
create policy evoai_objects_update on storage.objects for update to authenticated
  using (private.can_write_object(bucket_id, name) and (owner_id = (select auth.uid())::text or private.is_owner_or_admin(private.object_vehicle(name))))
  with check (private.can_write_object(bucket_id, name));

-- delete: owner/admin of the vehicle, or the tech who uploaded it while still active
create policy evoai_objects_delete on storage.objects for delete to authenticated
  using (bucket_id in ('vehicle-photos','vehicle-documents')
         and private.object_vehicle(name) is not null
         and (private.is_owner_or_admin(private.object_vehicle(name))
              or (owner_id = (select auth.uid())::text and private.can_write_object(bucket_id, name))));
