-- rollback_024.sql  Undo migration_024_price_lists.sql. NOT for the live project.
-- Idempotent. Rows copied by backup_024.sql stay in evo_backup.
begin;

drop trigger if exists request_vehicles_request_move on public.service_requests;
drop trigger if exists request_vehicles_vehicle_move on public.vehicles;

-- Restore the 023 guard and the 023 request policies before dropping helpers they no longer need.
create or replace function private.service_requests_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('evoai.transfer', true), '') = '1' then return new; end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.vehicles v where v.id = new.vehicle_id and v.owner_id = new.owner_id) then
      raise exception 'vehicle_not_in_collection' using errcode = '42501'; end if;
    if new.request_kind = 'estimate' and new.decision is distinct from 'pending' then
      raise exception 'estimate_starts_pending' using errcode = '42501'; end if;
  else
    if new.owner_id is distinct from old.owner_id or new.vehicle_id is distinct from old.vehicle_id
       or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
       or new.request_kind is distinct from old.request_kind then
      raise exception 'request_fields_locked' using errcode = '42501'; end if;
    if new.request_kind = 'estimate' and coalesce(current_setting('evoai.estimate_rpc', true), '') <> '1' then
      if new.decision is distinct from old.decision or new.decided_by is distinct from old.decided_by
         or new.decided_at is distinct from old.decided_at or new.status is distinct from old.status
         or new.completed_at is distinct from old.completed_at or new.history_id is distinct from old.history_id then
        raise exception 'estimate_decision_rpc_only' using errcode = '42501'; end if;
      if old.decision is distinct from 'pending' and (new.work_summary is distinct from old.work_summary
         or new.price_amount is distinct from old.price_amount or new.proposed_start is distinct from old.proposed_start) then
        raise exception 'estimate_locked' using errcode = '42501'; end if;
    end if;
  end if;
  return new;
end $$;

drop policy if exists service_requests_select on public.service_requests;
create policy service_requests_select on public.service_requests for select to authenticated
  using (
    private.is_collection_owner(owner_id) or (select private.is_admin())
    or (private.has_active_tech_access(vehicle_id)
        and (private.tech_can(vehicle_id, 'view_service_records')
             or private.tech_can(vehicle_id, 'can_add_service')
             or private.tech_can(vehicle_id, 'can_send_estimates')))
  );
drop policy if exists service_requests_insert on public.service_requests;
create policy service_requests_insert on public.service_requests for insert to authenticated
  with check (
    (request_kind = 'client' and private.is_collection_owner(owner_id) and created_by = (select auth.uid())
      and status = 'new' and decision is null and assigned_tech is null and scheduled_for is null)
    or
    (request_kind = 'estimate' and created_by = (select auth.uid()) and assigned_tech = (select auth.uid())
      and status = 'new' and decision = 'pending'
      and private.has_active_tech_access(vehicle_id)
      and private.tech_can(vehicle_id, 'can_send_estimates')
      and not private.is_collection_owner(owner_id))
  );
drop policy if exists service_requests_update on public.service_requests;
create policy service_requests_update on public.service_requests for update to authenticated
  using (
    (request_kind = 'client' and private.request_staff(vehicle_id, owner_id))
    or (request_kind = 'estimate' and created_by = (select auth.uid()) and decision = 'pending'
        and private.has_active_tech_access(vehicle_id))
  )
  with check (
    (request_kind = 'client' and private.request_staff(vehicle_id, owner_id))
    or (request_kind = 'estimate' and created_by = (select auth.uid())
        and private.has_active_tech_access(vehicle_id))
  );

drop function if exists public.request_vehicle_cards(uuid);
drop function if exists public.submit_service_request(uuid, uuid, uuid[], date, date, text);
drop function if exists public.list_tech_scope(uuid);
drop function if exists public.get_tech_menu(uuid);
drop function if exists public.keep_price_list();
drop function if exists public.publish_price_list();
drop function if exists public.get_my_price_list();
drop function if exists public.save_price_draft(text, text, boolean, jsonb);
drop function if exists private.request_vehicles_on_vehicle_move();
drop function if exists private.request_vehicles_on_request_move();
drop function if exists private.menu_request_visible(uuid, uuid, uuid, uuid);
drop function if exists private.request_share_allows_estimate(uuid);
drop function if exists private.tech_estimates_open(uuid);
drop function if exists private.tech_share_for(uuid, uuid, uuid);

drop table if exists public.request_vehicles;
alter table public.service_requests drop constraint if exists service_requests_window_chk;
alter table public.service_requests drop constraint if exists service_requests_listed_chk;
alter table public.service_requests drop column if exists service_id;
alter table public.service_requests drop column if exists service_name;
alter table public.service_requests drop column if exists listed_price_mode;
alter table public.service_requests drop column if exists listed_amount;
alter table public.service_requests drop column if exists listed_currency;
alter table public.service_requests drop column if exists listed_label;
alter table public.service_requests drop column if exists preferred_end;
alter table public.service_requests drop column if exists target_tech;

drop table if exists public.tech_services;
drop table if exists public.tech_price_lists;

commit;
