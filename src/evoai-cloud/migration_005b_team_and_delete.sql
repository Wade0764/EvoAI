-- migration_005b_team_and_delete.sql  (NOT APPLIED. Review, then run ONCE in the Supabase SQL editor as postgres.)
-- Run AFTER migration_003 (needs managed clients). Safe to run more than once (idempotent). One transaction.
--
-- 1. REMOVE A CLIENT (soft delete / archive, undoable):
--      archive_client(id)   admin: any managed client that has not claimed an account.
--                           tech : only a managed client THEY created (managed_by = them) that is still unclaimed and
--                                  that they still have active access to.
--                           Real accounts (an owner who signed up / claimed) can NEVER be removed by anyone here.
--      restore_client(id)   undo (same authorization). Vehicles archived by the removal come back; invite codes do not.
--      purge_client(id, typed_name)  ADMIN ONLY, irreversible, only for an already-removed client, name must be typed.
--      client_removal_summary(id)    what would be affected (counts), same authorization, read-only.
--      client_storage_paths(id)      ADMIN ONLY: file paths so the app can delete the files through the Storage API before purge.
-- 2. OWNER TEAM:
--      remove_team_member(tech_id [, owner_id])  owner removes a tech/advisor: all grants revoked at once (RLS follows
--                                                 tech_access.status, so the data is hidden immediately). Records stay with the car.
--      list_ended_access()                        the tech sees "access ended by <owner>" notices.
-- ROLLBACK: drop the functions below; alter table public.profiles drop column archived_at, drop column archived_by;
--           alter table public.vehicles drop column client_archived_at; drop trigger profiles_no_claim_when_archived on public.profiles;
--           then re-run migration_003 to restore private.is_managing_tech and private.claim_managed_by_email.
begin;

-- ---------------------------------------------------------------------------
-- 1. columns (not client-writable: profiles has a column-level UPDATE grant that does not include them)
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists archived_at timestamptz;
alter table public.profiles add column if not exists archived_by uuid references public.profiles(id) on delete set null;
alter table public.vehicles add column if not exists client_archived_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_archived_chk' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_archived_chk check (archived_at is null or managed);
  end if;
end $$;
create index if not exists profiles_archived_idx on public.profiles (managed_by) where archived_at is not null;

-- an archived placeholder cannot be claimed (defence in depth; invites are also revoked on archive)
create or replace function private.profiles_no_claim_when_archived() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.archived_at is not null and new.claimed_by is distinct from old.claimed_by then
    raise exception 'managed client not claimable' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists profiles_no_claim_when_archived on public.profiles;
create trigger profiles_no_claim_when_archived before update on public.profiles
  for each row execute function private.profiles_no_claim_when_archived();

-- managing tech stops acting as owner once the client is removed
create or replace function private.is_managing_tech(p_owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_owner and p.managed and p.claimed_by is null and p.archived_at is null and p.managed_by = auth.uid()
       and exists (select 1 from public.tech_access ta
                    where ta.tech_id = auth.uid() and ta.owner_id = p.id and ta.vehicle_id is null and ta.status = 'active'));
$$;

-- email auto-claim skips removed clients (same as migration_003 plus "archived_at is null")
create or replace function private.claim_managed_by_email(p_uid uuid, p_tech uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  r record;
  res jsonb := '[]'::jsonb;
begin
  select lower(u.email) into v_email from auth.users u where u.id = p_uid and u.email_confirmed_at is not null;
  if v_email is null or v_email = '' then return res; end if;
  if not exists (select 1 from public.profiles where id = p_uid and role = 'owner' and not managed) then return res; end if;
  for r in select id from public.profiles
            where managed and claimed_by is null and archived_at is null and lower(email) = v_email and managed_by is distinct from p_uid
              and (p_tech is null or managed_by = p_tech)
            order by created_at loop
    begin
      res := res || jsonb_build_array(private.claim_managed(r.id, p_uid));
    exception when others then
      insert into public.audit_log (actor_id, action, entity_table, entity_id, owner_id, details)
      values (p_uid, 'managed_client_claim_failed', 'profiles', r.id, p_uid, jsonb_build_object('error', sqlerrm));
    end;
  end loop;
  return res;
end $$;

-- ---------------------------------------------------------------------------
-- 2. authorization helper: may the CALLER remove / restore this client?
--    Only an unclaimed managed owner profile. Admin: any. Tech: only one they created and still have active access to.
-- ---------------------------------------------------------------------------
create or replace function private.can_remove_client(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.profiles p
     where p.id = p_id and p.role = 'owner' and p.managed and p.claimed_by is null
       and (private.is_admin()
            or (p.managed_by = auth.uid()
                and exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'tech')
                and exists (select 1 from public.tech_access ta
                             where ta.tech_id = auth.uid() and ta.owner_id = p.id and ta.vehicle_id is null and ta.status = 'active'))));
$$;
revoke all on function private.can_remove_client(uuid) from public, anon;
grant execute on function private.can_remove_client(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. summary (read-only): what will be affected
-- ---------------------------------------------------------------------------
create or replace function public.client_removal_summary(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.profiles%rowtype;
  v_ok boolean;
  v_reason text;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into p from public.profiles where id = p_id;
  if not found or not (private.is_admin()
       or exists (select 1 from public.tech_access ta where ta.tech_id = auth.uid() and ta.owner_id = p_id and ta.status = 'active')) then
    raise exception 'client_not_found' using errcode = '42501';
  end if;
  v_ok := private.can_remove_client(p_id);
  v_reason := case when v_ok then null
                   when not p.managed or p.claimed_by is not null then 'has_own_account'
                   else 'not_yours' end;
  return jsonb_build_object(
    'id', p.id, 'name', p.display_name, 'removable', v_ok, 'reason', v_reason, 'removed', p.archived_at is not null,
    'vehicles',  (select count(*) from public.vehicles v where v.owner_id = p_id),
    'records',   (select count(*) from public.service_records s join public.vehicles v on v.id = s.vehicle_id where v.owner_id = p_id),
    'documents', (select count(*) from public.documents d join public.vehicles v on v.id = d.vehicle_id where v.owner_id = p_id),
    'photos',    (select count(*) from public.vehicle_photos d join public.vehicles v on v.id = d.vehicle_id where v.owner_id = p_id),
    'expenses',  (select count(*) from public.expenses e where e.owner_id = p_id),
    'reminders', (select count(*) from public.reminders e where e.owner_id = p_id),
    'open_invites', (select count(*) from public.invites i where i.owner_id = p_id and i.redeemed_at is null and i.revoked_at is null and i.expires_at > now()));
end $$;

-- ---------------------------------------------------------------------------
-- 4. archive / restore / purge
-- ---------------------------------------------------------------------------
create or replace function public.archive_client(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := now();
  v_veh int;
  v_inv int;
  p public.profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into p from public.profiles where id = p_id for update;      -- same lock the claim takes: no race with a claim
  if not found or not private.can_remove_client(p_id) then raise exception 'client_not_removable' using errcode = '42501'; end if;
  if p.archived_at is not null then return jsonb_build_object('already_removed', true, 'archived_at', p.archived_at); end if;

  update public.profiles set archived_at = v_now, archived_by = auth.uid() where id = p_id;
  update public.vehicles set archived = true, client_archived_at = v_now where owner_id = p_id and not archived;
  get diagnostics v_veh = row_count;
  if to_regclass('private.invite_codes') is not null then
    execute 'delete from private.invite_codes where invite_id in (select id from public.invites where owner_id = $1 and redeemed_at is null and revoked_at is null)' using p_id;
  end if;
  update public.invites set revoked_at = v_now where owner_id = p_id and redeemed_at is null and revoked_at is null;
  get diagnostics v_inv = row_count;

  insert into public.audit_log (actor_id, action, entity_table, entity_id, owner_id, details)
  values (auth.uid(), 'client_removed', 'profiles', p_id, p_id, jsonb_build_object('vehicles', v_veh, 'invites_revoked', v_inv));
  return jsonb_build_object('archived_at', v_now, 'vehicles_archived', v_veh, 'invites_revoked', v_inv);
end $$;

create or replace function public.restore_client(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_veh int;
  p public.profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into p from public.profiles where id = p_id for update;
  if not found or not private.can_remove_client(p_id) then raise exception 'client_not_removable' using errcode = '42501'; end if;
  if p.archived_at is null then raise exception 'not_removed' using errcode = 'P0001'; end if;
  update public.vehicles set archived = false, client_archived_at = null
   where owner_id = p_id and client_archived_at = p.archived_at;        -- only what the removal itself archived
  get diagnostics v_veh = row_count;
  update public.profiles set archived_at = null, archived_by = null where id = p_id;
  insert into public.audit_log (actor_id, action, entity_table, entity_id, owner_id, details)
  values (auth.uid(), 'client_restored', 'profiles', p_id, p_id, jsonb_build_object('vehicles', v_veh));
  return jsonb_build_object('vehicles_restored', v_veh);
end $$;

create or replace function public.client_storage_paths(p_id uuid)
returns table (bucket text, path text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = p_id and managed and claimed_by is null and archived_at is not null) then
    raise exception 'client_not_removed' using errcode = 'P0001';
  end if;
  return query
    select 'vehicle-photos'::text, ph.storage_path from public.vehicle_photos ph join public.vehicles v on v.id = ph.vehicle_id where v.owner_id = p_id
    union all
    select 'vehicle-documents'::text, d.storage_path from public.documents d join public.vehicles v on v.id = d.vehicle_id where v.owner_id = p_id;
end $$;

create or replace function public.purge_client(p_id uuid, p_confirm_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.profiles%rowtype;
  v_veh int;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not private.is_admin() then raise exception 'admin_only' using errcode = '42501'; end if;
  select * into p from public.profiles where id = p_id for update;
  if not found or not p.managed or p.claimed_by is not null or p.role <> 'owner' then raise exception 'client_not_removable' using errcode = '42501'; end if;
  if p.archived_at is null then raise exception 'remove_first' using errcode = 'P0001'; end if;
  if btrim(coalesce(p_confirm_name, '')) is distinct from btrim(p.display_name) then raise exception 'name_mismatch' using errcode = 'P0001'; end if;
  select count(*) into v_veh from public.vehicles where owner_id = p_id;
  perform set_config('evoai.purging', '1', true);
  delete from public.vehicles where owner_id = p_id;      -- records, documents, photos, reminders... cascade
  delete from public.invites where owner_id = p_id;
  delete from public.profiles where id = p_id;            -- tech_access / tech_permissions cascade
  insert into public.audit_log (actor_id, action, entity_table, entity_id, details)
  values (auth.uid(), 'client_purged', 'profiles', p_id, jsonb_build_object('vehicles', v_veh));
  return jsonb_build_object('purged', true, 'vehicles', v_veh);
end $$;

-- ---------------------------------------------------------------------------
-- 5. owner removes a tech / advisor
-- ---------------------------------------------------------------------------
create or replace function public.remove_team_member(p_tech_id uuid, p_owner_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid := coalesce(p_owner_id, auth.uid());
  v_n int;
  v_email text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_owner <> v_uid and not private.is_admin() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = v_owner and role = 'owner' and not managed) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  perform 1 from public.tech_access where owner_id = v_owner and tech_id = p_tech_id and status in ('pending','active') for update;
  update public.tech_access set status = 'revoked', revoked_at = now(), revoked_by = v_uid
   where owner_id = v_owner and tech_id = p_tech_id and status in ('pending','active');
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'no_active_access' using errcode = 'P0001'; end if;
  select lower(email) into v_email from public.profiles where id = p_tech_id;
  if v_email is not null then   -- an unused invite for the same email must not let them straight back in
    update public.invites set revoked_at = now()
     where created_by = v_owner and kind in ('tech_owner','tech_vehicle') and redeemed_at is null and revoked_at is null and email = v_email;
  end if;
  insert into public.audit_log (actor_id, action, entity_table, entity_id, owner_id, details)
  values (v_uid, 'team_member_removed', 'tech_access', null, v_owner, jsonb_build_object('grants', v_n));
  return jsonb_build_object('revoked', v_n);
end $$;

-- the tech's own view: who ended my access (own notices only, names only, last 60 days)
create or replace function public.list_ended_access()
returns table (owner_name text, revoked_at timestamptz, ended_by text)
language sql stable security definer set search_path = '' as $$
  select o.display_name, max(ta.revoked_at),
         case when bool_or(ta.revoked_by = o.id) then 'owner' else 'admin' end
    from public.tech_access ta
    join public.profiles o on o.id = ta.owner_id and not o.managed
   where ta.tech_id = auth.uid() and ta.status = 'revoked' and ta.revoked_at > now() - interval '60 days'
     and ta.revoked_by is not null and ta.revoked_by <> ta.tech_id
     and not exists (select 1 from public.tech_access x where x.tech_id = ta.tech_id and x.owner_id = ta.owner_id and x.status in ('pending','active'))
   group by o.id, o.display_name
   order by max(ta.revoked_at) desc;
$$;

-- ---------------------------------------------------------------------------
-- 6. grants
-- ---------------------------------------------------------------------------
revoke execute on function private.profiles_no_claim_when_archived() from public, anon;
revoke execute on function public.client_removal_summary(uuid), public.archive_client(uuid), public.restore_client(uuid),
  public.client_storage_paths(uuid), public.purge_client(uuid, text), public.remove_team_member(uuid, uuid), public.list_ended_access()
  from public, anon;
grant execute on function public.client_removal_summary(uuid), public.archive_client(uuid), public.restore_client(uuid),
  public.client_storage_paths(uuid), public.purge_client(uuid, text), public.remove_team_member(uuid, uuid), public.list_ended_access()
  to authenticated;
commit;
