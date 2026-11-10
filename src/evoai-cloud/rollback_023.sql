-- rollback_023.sql  Undo migration_023_roles_estimates.sql. NOT for the live project.
-- Restores the function and view text saved on the first run of migration_023, then drops the new objects.
-- Idempotent. Rows copied by backup_023.sql stay in evo_backup.
begin;

drop trigger if exists service_requests_estimate_notify on public.service_requests;
drop trigger if exists vehicles_history_trigger on public.vehicles;
drop trigger if exists reminders_history_trigger on public.reminders;
drop trigger if exists documents_scan_guard on public.documents;
drop trigger if exists notifications_guard on public.notifications;

do $$ declare r record; begin
  if to_regclass('private.backup_023_fn') is null then
    raise exception 'private.backup_023_fn is missing; migration_023 has not been applied here';
  end if;
  for r in select def from private.backup_023_fn order by fn loop
    execute r.def;
  end loop;
end $$;

-- service_requests_guard is not in the function snapshot (it is replaced in place). Put the 022 body back.
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

drop view if exists public.my_tech_visibility;
drop view if exists public.tech_effective_permissions;
do $$ declare r record; begin
  for r in select name, def from private.backup_023_views order by case name when 'tech_effective_permissions' then 1 else 2 end loop
    execute format('create view public.%I with (security_invoker = true) as ', r.name) || r.def;
  end loop;
end $$;
grant select on public.tech_effective_permissions, public.my_tech_visibility to authenticated;

-- policies that migration_023 replaced, back to the pre-023 text
drop policy if exists service_requests_select on public.service_requests;
create policy service_requests_select on public.service_requests for select to authenticated
  using (private.is_collection_owner(owner_id) or private.request_staff(vehicle_id, owner_id));
drop policy if exists service_requests_insert on public.service_requests;
create policy service_requests_insert on public.service_requests for insert to authenticated
  with check (private.is_collection_owner(owner_id) and created_by = (select auth.uid())
              and status = 'new' and assigned_tech is null and scheduled_for is null);
drop policy if exists service_requests_update on public.service_requests;
create policy service_requests_update on public.service_requests for update to authenticated
  using (private.request_staff(vehicle_id, owner_id)) with check (private.request_staff(vehicle_id, owner_id));

drop policy if exists vehicles_update on public.vehicles;
create policy vehicles_update on public.vehicles for update to authenticated
  using (private.is_collection_owner(owner_id) or (select private.is_admin()) or private.is_managing_tech(owner_id))
  with check (private.is_collection_owner(owner_id) or (select private.is_admin()) or private.is_managing_tech(owner_id));
drop policy if exists vehicles_delete on public.vehicles;
create policy vehicles_delete on public.vehicles for delete to authenticated
  using (private.is_collection_owner(owner_id) or (select private.is_admin()) or private.is_managing_tech(owner_id));
drop policy if exists vehicles_insert on public.vehicles;
create policy vehicles_insert on public.vehicles for insert to authenticated
  with check (private.is_collection_owner(owner_id) or (select private.is_admin()) or private.is_client_tech(owner_id)
              or private.is_managing_tech(owner_id));

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and private.can_write_vehicle(vehicle_id)
              and (private.is_owner_or_admin(vehicle_id) or (not owner_only and private.tech_can(vehicle_id, 'can_add_documents'))));
drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents for update to authenticated
  using (private.is_owner_or_admin(vehicle_id)
         or (uploaded_by = (select auth.uid()) and not owner_only and private.can_write_vehicle(vehicle_id) and private.tech_can(vehicle_id, 'can_add_documents')))
  with check (private.is_owner_or_admin(vehicle_id)
         or (uploaded_by = (select auth.uid()) and not owner_only and private.can_write_vehicle(vehicle_id) and private.tech_can(vehicle_id, 'can_add_documents')));
drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete to authenticated
  using (private.is_owner_or_admin(vehicle_id)
         or (uploaded_by = (select auth.uid()) and not owner_only and private.can_write_vehicle(vehicle_id) and private.tech_can(vehicle_id, 'can_add_documents')));

drop policy if exists vehicle_photos_insert on public.vehicle_photos;
create policy vehicle_photos_insert on public.vehicle_photos for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and private.can_write_vehicle(vehicle_id) and private.tech_can(vehicle_id, 'view_photos'));
drop policy if exists vehicle_photos_update on public.vehicle_photos;
create policy vehicle_photos_update on public.vehicle_photos for update to authenticated
  using (private.is_owner_or_admin(vehicle_id) or (uploaded_by = (select auth.uid()) and private.can_write_vehicle(vehicle_id) and private.tech_can(vehicle_id, 'view_photos')))
  with check (private.is_owner_or_admin(vehicle_id) or (uploaded_by = (select auth.uid()) and private.can_write_vehicle(vehicle_id) and private.tech_can(vehicle_id, 'view_photos')));
drop policy if exists vehicle_photos_delete on public.vehicle_photos;
create policy vehicle_photos_delete on public.vehicle_photos for delete to authenticated
  using (private.is_owner_or_admin(vehicle_id) or (uploaded_by = (select auth.uid()) and private.can_write_vehicle(vehicle_id) and private.tech_can(vehicle_id, 'view_photos')));

drop policy if exists reminders_insert on public.reminders;
create policy reminders_insert on public.reminders for insert to authenticated
  with check (private.is_owner_or_admin(vehicle_id));
drop policy if exists reminders_update on public.reminders;
create policy reminders_update on public.reminders for update to authenticated
  using (private.is_owner_or_admin(vehicle_id)) with check (private.is_owner_or_admin(vehicle_id));
drop policy if exists reminders_delete on public.reminders;
create policy reminders_delete on public.reminders for delete to authenticated
  using (private.is_owner_or_admin(vehicle_id));

drop policy if exists vehicle_financials_write on public.vehicle_financials;
create policy vehicle_financials_write on public.vehicle_financials for all to authenticated
  using (private.is_owner_or_admin(vehicle_id)) with check (private.is_owner_or_admin(vehicle_id));

drop policy if exists service_records_delete on public.service_records;
create policy service_records_delete on public.service_records for delete to authenticated
  using (private.is_owner_or_admin(vehicle_id));

drop policy if exists request_photos_insert_tech on public.request_photos;

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
  using ((select private.is_admin()) or owner_id = (select auth.uid()));

drop function if exists public.decide_estimate(uuid, text, text);
drop function if exists public.complete_service_job(uuid, text, int);
drop function if exists public.create_tech_invite(uuid[], boolean, text, jsonb);
drop function if exists public.create_co_owner_invite(text, text);
drop function if exists private.apply_invite_grant(uuid, uuid);
drop function if exists private.notify_user(uuid, uuid, uuid, uuid, text, text, text);
drop function if exists private.history_add(uuid, uuid, text, uuid, text, text);
drop function if exists private.estimate_notify();
drop function if exists private.notifications_guard();
drop function if exists private.vehicles_history_trigger();
drop function if exists private.reminders_history_trigger();
drop function if exists private.documents_scan_guard();
drop function if exists private.can_review_scan(uuid);
drop function if exists private.owner_rank(uuid);
drop function if exists private.can_manage_collection(uuid);
drop function if exists private.can_write_vehicle_as_owner(uuid);
drop function if exists private.grant_covers_vehicle(uuid, uuid);
drop function if exists private.perm_allowed(text);

drop table if exists public.notifications;
drop table if exists public.vehicle_history;
drop table if exists public.tech_grant_vehicles;
drop table if exists private.invite_grants;

alter table public.service_requests drop constraint if exists service_requests_kind_chk;
alter table public.service_requests drop constraint if exists service_requests_estimate_shape;
alter table public.service_requests drop constraint if exists service_requests_decision_chk;
alter table public.service_requests drop column if exists request_kind;
alter table public.service_requests drop column if exists work_summary;
alter table public.service_requests drop column if exists price_amount;
alter table public.service_requests drop column if exists price_currency;
alter table public.service_requests drop column if exists proposed_start;
alter table public.service_requests drop column if exists proposed_tz;
alter table public.service_requests drop column if exists duration_minutes;
alter table public.service_requests drop column if exists decision;
alter table public.service_requests drop column if exists decided_at;
alter table public.service_requests drop column if exists decided_by;
alter table public.service_requests drop column if exists completed_at;
alter table public.service_requests drop column if exists completion_note;
alter table public.service_requests drop column if exists history_id;

alter table public.tech_permissions drop column if exists can_upload_photos;
alter table public.tech_permissions drop column if exists can_scan_documents;
alter table public.tech_permissions drop column if exists can_add_reminders;
alter table public.tech_permissions drop column if exists can_send_estimates;

alter table public.collection_members drop constraint if exists collection_members_management_chk;
alter table public.collection_members drop column if exists management;

commit;
