-- EVOai RLS + grants. DESIGN ONLY. Run after schema.sql.
-- Model: owner sees own; tech sees only vehicles with ACTIVE tech_access (revoked => nothing); admin sees all.
-- service_role bypasses RLS (BYPASSRLS) and is the only writer of ai_estimates.

-- ---------------------------------------------------------------------------
-- 1. Table privileges: start from zero, grant minimum. RLS then narrows rows.
-- ---------------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;

grant select on public.profiles, public.vehicles, public.tech_access, public.service_records, public.expenses,
                public.documents, public.vehicle_photos, public.reminders, public.advisories, public.invites,
                public.transfers, public.vehicle_archives, public.ai_estimates, public.audit_log,
                public.vehicle_financials, public.tech_permissions
  to authenticated;

grant update (display_name, phone, business_name, role) on public.profiles to authenticated;  -- role guarded by trigger+policy
grant insert, update, delete on public.vehicles, public.vehicle_financials, public.service_records, public.expenses, public.documents,
                                public.vehicle_photos, public.reminders, public.advisories to authenticated;
grant update (revoked_at) on public.invites to authenticated;     -- (functions are the preferred path)
-- tech_access, tech_permissions (RPC only), transfers, vehicle_archives, ai_estimates, audit_log: NO client write grants at all.

grant all on all tables in schema public to service_role;

-- RPCs callable by signed-in users
grant execute on function public.create_invite(text, uuid, text)       to authenticated;
grant execute on function public.redeem_invite(text)                   to authenticated;
grant execute on function public.revoke_invite(uuid)                   to authenticated;
grant execute on function public.revoke_tech_access(uuid)              to authenticated;
grant execute on function public.set_tech_permission(uuid, text, boolean, uuid) to authenticated;
grant execute on function public.reset_tech_permission_override(uuid, uuid)     to authenticated;
grant select on public.tech_effective_permissions, public.my_tech_visibility    to authenticated;
grant execute on function public.initiate_transfer(uuid, text)         to authenticated;
grant execute on function public.cancel_transfer(uuid)                 to authenticated;
grant execute on function public.complete_reminder(uuid, date, int)    to authenticated;
-- cron-only (service_role): authenticated must NOT be able to enumerate everyone's reminders
revoke execute on function public.due_reminders(date, int)             from public, anon, authenticated;
revoke execute on function public.mark_reminders_notified(uuid[])      from public, anon, authenticated;
grant  execute on function public.due_reminders(date, int)             to service_role;
grant  execute on function public.mark_reminders_notified(uuid[])      to service_role;
-- internal helpers: private schema functions
revoke execute on all functions in schema private from public, anon;
grant  execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Enable + FORCE RLS on every table
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','vehicles','tech_access','service_records','expenses','documents',
                           'vehicle_photos','reminders','advisories','invites','transfers','vehicle_archives',
                           'ai_estimates','audit_log','vehicle_financials','tech_permissions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);  -- definer fns owned by postgres still bypass (superuser/BYPASSRLS); see notes
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Policies  ((select auth.uid()) form => evaluated once per statement)
-- ---------------------------------------------------------------------------
-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()) or private.shares_access(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_update_admin on public.profiles for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- vehicles
create policy vehicles_select on public.vehicles for select to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_admin()) or private.has_active_tech_access(id));
create policy vehicles_insert on public.vehicles for insert to authenticated
  with check (owner_id = (select auth.uid()) or (select private.is_admin()) or private.is_client_tech(owner_id));
create policy vehicles_update on public.vehicles for update to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_admin()))
  with check (owner_id = (select auth.uid()) or (select private.is_admin()));   -- owner_id change blocked by trigger
create policy vehicles_delete on public.vehicles for delete to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_admin()));

-- tech_access (read-only to clients; mutate via functions)
create policy tech_access_select on public.tech_access for select to authenticated
  using (owner_id = (select auth.uid()) or tech_id = (select auth.uid()) or (select private.is_admin()));

-- tech_permissions: owner/admin and the tech themself can READ; nobody writes via API (set_tech_permission RPC only)
create policy tech_permissions_select on public.tech_permissions for select to authenticated
  using (owner_id = (select auth.uid()) or tech_id = (select auth.uid()) or (select private.is_admin()));

-- vehicle_financials (purchase price/date): owner/admin, or tech with view_purchase_info. Writes owner/admin only.
create policy vehicle_financials_select on public.vehicle_financials for select to authenticated
  using (private.tech_can(vehicle_id, 'view_purchase_info'));
create policy vehicle_financials_write on public.vehicle_financials for all to authenticated
  using (private.is_owner_or_admin(vehicle_id)) with check (private.is_owner_or_admin(vehicle_id));

-- service_records
create policy service_records_select on public.service_records for select to authenticated
  using (private.tech_can(vehicle_id, 'view_service_records'));
create policy service_records_insert on public.service_records for insert to authenticated
  with check (created_by = (select auth.uid()) and private.can_write_vehicle(vehicle_id) and private.tech_can(vehicle_id, 'can_add_service'));
create policy service_records_update on public.service_records for update to authenticated
  using (private.is_owner_or_admin(vehicle_id) or (created_by = (select auth.uid()) and private.can_write_vehicle(vehicle_id) and private.tech_can(vehicle_id, 'can_add_service')))
  with check (private.is_owner_or_admin(vehicle_id) or (created_by = (select auth.uid()) and private.can_write_vehicle(vehicle_id) and private.tech_can(vehicle_id, 'can_add_service')));
create policy service_records_delete on public.service_records for delete to authenticated
  using (private.is_owner_or_admin(vehicle_id));

-- expenses: owner/admin full; tech reads with view_expenses, INSERT only with can_add_expenses (no tech update/delete)
create policy expenses_select on public.expenses for select to authenticated
  using (private.tech_can(vehicle_id, 'view_expenses'));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (private.is_owner_or_admin(vehicle_id)
              or (created_by = (select auth.uid()) and private.can_write_vehicle(vehicle_id) and private.tech_can(vehicle_id, 'can_add_expenses')));
create policy expenses_update on public.expenses for update to authenticated
  using (private.is_owner_or_admin(vehicle_id)) with check (private.is_owner_or_admin(vehicle_id));
create policy expenses_delete on public.expenses for delete to authenticated
  using (private.is_owner_or_admin(vehicle_id));

-- documents (owner_only docs never visible to techs, whatever the toggles)
create policy documents_select on public.documents for select to authenticated
  using (private.is_owner_or_admin(vehicle_id) or (not owner_only and private.tech_can(vehicle_id, 'view_documents')));
create policy documents_insert on public.documents for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and private.can_write_vehicle(vehicle_id)
              and (private.is_owner_or_admin(vehicle_id) or (not owner_only and private.tech_can(vehicle_id, 'can_add_documents'))));
create policy documents_update on public.documents for update to authenticated
  using (private.is_owner_or_admin(vehicle_id)
         or (uploaded_by = (select auth.uid()) and not owner_only and private.can_write_vehicle(vehicle_id) and private.tech_can(vehicle_id, 'can_add_documents')))
  with check (private.is_owner_or_admin(vehicle_id)
         or (uploaded_by = (select auth.uid()) and not owner_only and private.can_write_vehicle(vehicle_id) and private.tech_can(vehicle_id, 'can_add_documents')));
create policy documents_delete on public.documents for delete to authenticated
  using (private.is_owner_or_admin(vehicle_id)
         or (uploaded_by = (select auth.uid()) and not owner_only and private.can_write_vehicle(vehicle_id) and private.tech_can(vehicle_id, 'can_add_documents')));

-- vehicle_photos (no separate add-photo toggle: a tech who may see photos may add/manage their own)
create policy vehicle_photos_select on public.vehicle_photos for select to authenticated
  using (private.tech_can(vehicle_id, 'view_photos'));
create policy vehicle_photos_insert on public.vehicle_photos for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and private.can_write_vehicle(vehicle_id) and private.tech_can(vehicle_id, 'view_photos'));
create policy vehicle_photos_update on public.vehicle_photos for update to authenticated
  using (private.is_owner_or_admin(vehicle_id) or (uploaded_by = (select auth.uid()) and private.can_write_vehicle(vehicle_id) and private.tech_can(vehicle_id, 'view_photos')))
  with check (private.is_owner_or_admin(vehicle_id) or (uploaded_by = (select auth.uid()) and private.can_write_vehicle(vehicle_id) and private.tech_can(vehicle_id, 'view_photos')));
create policy vehicle_photos_delete on public.vehicle_photos for delete to authenticated
  using (private.is_owner_or_admin(vehicle_id) or (uploaded_by = (select auth.uid()) and private.can_write_vehicle(vehicle_id) and private.tech_can(vehicle_id, 'view_photos')));

-- reminders: owner/admin full; tech READ-ONLY with view_reminders
create policy reminders_select on public.reminders for select to authenticated
  using (private.tech_can(vehicle_id, 'view_reminders'));
create policy reminders_insert on public.reminders for insert to authenticated
  with check (private.is_owner_or_admin(vehicle_id));
create policy reminders_update on public.reminders for update to authenticated
  using (private.is_owner_or_admin(vehicle_id)) with check (private.is_owner_or_admin(vehicle_id));
create policy reminders_delete on public.reminders for delete to authenticated
  using (private.is_owner_or_admin(vehicle_id));

-- advisories: owner/admin see all for their cars; a tech sees only their own and only while access is active
create policy advisories_select on public.advisories for select to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_admin())
         or (from_tech_id = (select auth.uid()) and private.has_active_tech_access(vehicle_id)));
create policy advisories_insert on public.advisories for insert to authenticated
  with check (from_tech_id = (select auth.uid()) and status = 'pending'
              and private.has_active_tech_access(vehicle_id) and private.can_write_vehicle(vehicle_id)
              and private.tech_can(vehicle_id, 'can_create_advisories'));
create policy advisories_update on public.advisories for update to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_admin())
         or (from_tech_id = (select auth.uid()) and private.has_active_tech_access(vehicle_id)))
  with check (owner_id = (select auth.uid()) or (select private.is_admin())
         or (from_tech_id = (select auth.uid()) and private.has_active_tech_access(vehicle_id)));
create policy advisories_delete on public.advisories for delete to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_admin())
         or (from_tech_id = (select auth.uid()) and status = 'pending' and private.has_active_tech_access(vehicle_id)));

-- invites: creator sees/revokes own open invites (code is hashed, never readable)
create policy invites_select on public.invites for select to authenticated
  using (created_by = (select auth.uid()) or (select private.is_admin()));
create policy invites_revoke on public.invites for update to authenticated
  using (created_by = (select auth.uid()) and redeemed_at is null)
  with check (created_by = (select auth.uid()) and redeemed_at is null);

-- transfers / archives: read-only to parties
create policy transfers_select on public.transfers for select to authenticated
  using (seller_id = (select auth.uid()) or buyer_id = (select auth.uid()) or (select private.is_admin()));
create policy vehicle_archives_select on public.vehicle_archives for select to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_admin()));

-- ai_estimates: SELECT only. No insert/update/delete policy AND no grant => owners/techs can never write.
-- Owners/admin read all kinds; techs read 'health' with view_health_estimate and 'value' with view_value_estimate.
create policy ai_estimates_select on public.ai_estimates for select to authenticated
  using (private.is_owner_or_admin(vehicle_id)
         or (kind = 'health' and private.tech_can(vehicle_id, 'view_health_estimate'))
         or (kind = 'value'  and private.tech_can(vehicle_id, 'view_value_estimate')));

-- audit_log: admin all; owner sees events about their own cars/access
create policy audit_log_select on public.audit_log for select to authenticated
  using ((select private.is_admin()) or owner_id = (select auth.uid()));
