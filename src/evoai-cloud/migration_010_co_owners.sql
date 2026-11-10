-- migration_010_co_owners.sql  (v17)  -- NOT APPLIED. Idempotent: safe to run twice. Requires migrations 001-009 (+005b).
-- Co-owners: a collection (= the owner profile that vehicles.owner_id points to) can have 2+ owners with separate logins
-- and equal owner rights. vehicles.owner_id is NOT changed; membership is a side table and every owner check goes
-- through private.is_collection_owner(owner_id) / private.is_vehicle_owner(vehicle_id).
-- Does not touch audit_log (table, trigger or policy).
-- ROLLBACK: drop function public.create_co_owner_invite(), public.remove_co_owner(uuid), public.list_co_owners();
--           re-run schema.sql/rls.sql/migration_002/003/005b definitions of the patched functions and policies;
--           drop table public.collection_members;

-- ---------------------------------------------------------------------------
-- 1. membership table (written ONLY by definer functions: redeem_invite / remove_co_owner)
-- ---------------------------------------------------------------------------
create table if not exists public.collection_members (
  collection_owner_id uuid not null references public.profiles(id) on delete cascade,
  user_id             uuid not null references public.profiles(id) on delete cascade,
  role                text not null default 'owner' check (role = 'owner'),
  added_by            uuid references public.profiles(id) on delete set null,
  invite_id           uuid references public.invites(id) on delete set null,
  created_at          timestamptz not null default now(),
  primary key (collection_owner_id, user_id),
  constraint collection_members_not_self check (collection_owner_id <> user_id),
  constraint collection_members_one_collection unique (user_id)
);
create index if not exists collection_members_owner_idx on public.collection_members (collection_owner_id);
alter table public.collection_members enable row level security;
alter table public.collection_members force row level security;
revoke all on public.collection_members from anon, authenticated;
grant select on public.collection_members to authenticated;
grant all on public.collection_members to service_role;

-- invites: new kind 'co_owner' (owner_id = the collection)
alter table public.invites drop constraint if exists invites_kind_check;
alter table public.invites add constraint invites_kind_check check (kind in ('tech_vehicle','tech_owner','client_owner','transfer','co_owner'));

-- ---------------------------------------------------------------------------
-- 2. helpers
-- ---------------------------------------------------------------------------
-- true iff the caller IS that owner profile, or a co-owner member of it. Never true for a NULL owner.
create or replace function private.is_collection_owner(p_owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_owner is not null and auth.uid() is not null and (
         p_owner = auth.uid()
      or exists (select 1 from public.collection_members m where m.collection_owner_id = p_owner and m.user_id = auth.uid()));
$$;
-- the collection a user acts for: the one they are a member of, else themself
create or replace function private.collection_of(p_uid uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce((select m.collection_owner_id from public.collection_members m where m.user_id = p_uid), p_uid);
$$;
-- caller and p_profile are owners of the same collection (for profile visibility)
create or replace function private.shares_collection(p_profile uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and p_profile is not null and p_profile <> auth.uid()
     and private.collection_of(p_profile) = private.collection_of(auth.uid())
     and (exists (select 1 from public.collection_members m where m.user_id = p_profile)
          or exists (select 1 from public.collection_members m where m.user_id = auth.uid()));
$$;
-- vehicle-scoped owner check: every vehicle-scoped policy, storage helper, tech_can, can_write_vehicle,
-- ai_estimates / owner values / docs / photos / reminders / expenses / financials goes through this.
create or replace function private.is_vehicle_owner(p_vehicle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vehicles v where v.id = p_vehicle and private.is_collection_owner(v.owner_id));
$$;
-- profile visibility via team grants: co-owners see the collection's techs too
create or replace function private.shares_access(p_profile uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tech_access ta
                 where ta.status = 'active'
                   and ((ta.tech_id = auth.uid() and ta.owner_id = p_profile)
                     or (private.is_collection_owner(ta.owner_id) and ta.tech_id = p_profile)));
$$;
revoke all on function private.is_collection_owner(uuid), private.collection_of(uuid), private.shares_collection(uuid) from public;
grant execute on function private.is_collection_owner(uuid), private.collection_of(uuid), private.shares_collection(uuid),
  private.is_vehicle_owner(uuid), private.shares_access(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. policies that compared owner_id = auth.uid() inline (vehicle-scoped ones already use the helpers above)
-- ---------------------------------------------------------------------------
drop policy if exists collection_members_select on public.collection_members;
create policy collection_members_select on public.collection_members for select to authenticated
  using (user_id = (select auth.uid()) or private.is_collection_owner(collection_owner_id) or (select private.is_admin()));

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()) or private.shares_access(id) or private.shares_collection(id));

drop policy if exists vehicles_select on public.vehicles;
create policy vehicles_select on public.vehicles for select to authenticated
  using (private.is_collection_owner(owner_id) or (select private.is_admin()) or private.has_active_tech_access(id));
drop policy if exists vehicles_insert on public.vehicles;
create policy vehicles_insert on public.vehicles for insert to authenticated
  with check (private.is_collection_owner(owner_id) or (select private.is_admin()) or private.is_client_tech(owner_id)
              or private.is_managing_tech(owner_id));
drop policy if exists vehicles_update on public.vehicles;
create policy vehicles_update on public.vehicles for update to authenticated
  using (private.is_collection_owner(owner_id) or (select private.is_admin()) or private.is_managing_tech(owner_id))
  with check (private.is_collection_owner(owner_id) or (select private.is_admin()) or private.is_managing_tech(owner_id));
drop policy if exists vehicles_delete on public.vehicles;
create policy vehicles_delete on public.vehicles for delete to authenticated
  using (private.is_collection_owner(owner_id) or (select private.is_admin()) or private.is_managing_tech(owner_id));

drop policy if exists tech_access_select on public.tech_access;
create policy tech_access_select on public.tech_access for select to authenticated
  using (private.is_collection_owner(owner_id) or tech_id = (select auth.uid()) or (select private.is_admin()));
drop policy if exists tech_permissions_select on public.tech_permissions;
create policy tech_permissions_select on public.tech_permissions for select to authenticated
  using (private.is_collection_owner(owner_id) or tech_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists advisories_select on public.advisories;
create policy advisories_select on public.advisories for select to authenticated
  using (private.is_collection_owner(owner_id) or (select private.is_admin())
         or (from_tech_id = (select auth.uid()) and private.has_active_tech_access(vehicle_id)));
drop policy if exists advisories_update on public.advisories;
create policy advisories_update on public.advisories for update to authenticated
  using (private.is_collection_owner(owner_id) or (select private.is_admin())
         or (from_tech_id = (select auth.uid()) and private.has_active_tech_access(vehicle_id)))
  with check (private.is_collection_owner(owner_id) or (select private.is_admin())
         or (from_tech_id = (select auth.uid()) and private.has_active_tech_access(vehicle_id)));
drop policy if exists advisories_delete on public.advisories;
create policy advisories_delete on public.advisories for delete to authenticated
  using (private.is_collection_owner(owner_id) or (select private.is_admin())
         or (from_tech_id = (select auth.uid()) and status = 'pending' and private.has_active_tech_access(vehicle_id)));

drop policy if exists transfers_select on public.transfers;
create policy transfers_select on public.transfers for select to authenticated
  using (seller_id = (select auth.uid()) or buyer_id = (select auth.uid()) or private.is_vehicle_owner(vehicle_id) or (select private.is_admin()));
drop policy if exists vehicle_archives_select on public.vehicle_archives;
create policy vehicle_archives_select on public.vehicle_archives for select to authenticated
  using (private.is_collection_owner(owner_id) or (select private.is_admin()));
-- invites_select stays creator-only (codes are per creator); audit_log_select is deliberately NOT changed (no audit_log updates).

-- ---------------------------------------------------------------------------
-- 6. VIN decode fields (v17): filled by the app from the free NHTSA vPIC decode; owner-editable like the other vehicle columns.
--    Older app versions keep trim in the notes extras; the app writes both.
-- ---------------------------------------------------------------------------
alter table public.vehicles add column if not exists trim           text;
alter table public.vehicles add column if not exists engine         text;
alter table public.vehicles add column if not exists body_class     text;
alter table public.vehicles add column if not exists vin_decoded_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vehicles_vin_fields_len') then
    alter table public.vehicles add constraint vehicles_vin_fields_len
      check (coalesce(length(trim), 0) <= 60 and coalesce(length(engine), 0) <= 120 and coalesce(length(body_class), 0) <= 80);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. owner-checking RPCs: same bodies as before, owner test = any collection owner (generated by tools/gen_migration_010.py)
-- ---------------------------------------------------------------------------
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
    select v.owner_id into v_owner from public.vehicles v where v.id = p_vehicle_id and private.is_collection_owner(v.owner_id);
    if v_owner is null then raise exception 'not_vehicle_owner' using errcode = '42501'; end if;
  elsif p_kind = 'tech_owner' then
    if p_vehicle_id is not null then raise exception 'vehicle_id not allowed for tech_owner' using errcode = '22023'; end if;
    v_owner := private.collection_of(v_uid);
  elsif p_kind = 'co_owner' then
    if p_vehicle_id is not null or v_role <> 'owner' then raise exception 'only collection owners can invite a co-owner' using errcode = '42501'; end if;
    v_owner := private.collection_of(v_uid);
    if exists (select 1 from public.profiles p where p.id = v_owner and (p.managed or p.archived_at is not null)) then raise exception 'not_allowed' using errcode = '42501'; end if;
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

create or replace function public.redeem_invite(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  inv public.invites%rowtype;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_access uuid;
  v_tech uuid;
  v_owner uuid;
  v_claim jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is null then raise exception 'no_profile' using errcode = '42501'; end if;
  if p_code is null or length(p_code) > 128 then raise exception 'invalid_or_expired_invite' using errcode = 'P0001'; end if;

  -- row lock => single-use even under concurrent redemption
  select * into inv from public.invites
   where code_hash = encode(sha256(convert_to(lower(btrim(p_code)), 'UTF8')), 'hex') for update;
  -- one generic error for unknown/used/revoked/expired/email-mismatch (no oracle)
  if not found or inv.redeemed_at is not null or inv.revoked_at is not null or inv.expires_at <= now()
     or (inv.email is not null and inv.email <> v_email) then
    raise exception 'invalid_or_expired_invite' using errcode = 'P0001';
  end if;
  if inv.created_by = v_uid then raise exception 'cannot_redeem_own_invite' using errcode = '42501'; end if;
  if v_role = 'admin' then raise exception 'role_not_eligible' using errcode = '42501'; end if;

  if inv.kind = 'co_owner' then
    -- the redeemer joins the inviter's collection with equal owner rights. Only a fresh owner account is eligible:
    -- no cars of its own, no team grants as owner, not already in another collection (unique user_id).
    if v_role <> 'owner' then raise exception 'role_not_eligible' using errcode = '42501'; end if;
    if inv.owner_id is null or inv.owner_id = v_uid then raise exception 'invalid_or_expired_invite' using errcode = 'P0001'; end if;
    -- inviter must still be an owner of that collection
    if not (inv.created_by = inv.owner_id or exists (select 1 from public.collection_members m
             where m.collection_owner_id = inv.owner_id and m.user_id = inv.created_by)) then
      raise exception 'invalid_or_expired_invite' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.vehicles where owner_id = v_uid)
       or exists (select 1 from public.tech_access where owner_id = v_uid and status <> 'revoked')
       or exists (select 1 from public.collection_members where user_id = v_uid or collection_owner_id = v_uid) then
      raise exception 'role_not_eligible' using errcode = '42501';
    end if;
    insert into public.collection_members (collection_owner_id, user_id, role, added_by, invite_id)
    values (inv.owner_id, v_uid, 'owner', inv.created_by, inv.id);
    update public.invites set redeemed_by = v_uid, redeemed_at = now() where id = inv.id;
    return jsonb_build_object('kind', 'co_owner', 'owner_id', inv.owner_id);
  end if;

  if inv.kind in ('tech_vehicle','tech_owner') then
    -- inviter must still be entitled
    if inv.kind = 'tech_vehicle' and not exists
       (select 1 from public.vehicles v where v.id = inv.vehicle_id and v.owner_id = inv.owner_id) then
      raise exception 'invalid_or_expired_invite' using errcode = 'P0001';
    end if;
    if v_role = 'owner' then
      -- a brand-new account (no cars, no tech grants as owner) may become a tech; established owners may not
      if exists (select 1 from public.vehicles where owner_id = v_uid)
         or exists (select 1 from public.tech_access where owner_id = v_uid and status <> 'revoked') then
        raise exception 'role_not_eligible' using errcode = '42501';
      end if;
      update public.profiles set role = 'tech' where id = v_uid;
    end if;
    v_tech := v_uid; v_owner := inv.owner_id;
  elsif inv.kind = 'client_owner' then
    if v_role <> 'owner' then raise exception 'role_not_eligible' using errcode = '42501'; end if;
    if not exists (select 1 from public.profiles where id = inv.created_by and role in ('tech','admin')) then
      raise exception 'invalid_or_expired_invite' using errcode = 'P0001';
    end if;
    v_tech := inv.created_by; v_owner := v_uid;
  elsif inv.kind = 'transfer' then
    if v_role <> 'owner' then raise exception 'role_not_eligible' using errcode = '42501'; end if;
    update public.invites set redeemed_by = v_uid, redeemed_at = now() where id = inv.id;
    return private.complete_transfer(inv.transfer_id, v_uid);
  end if;

  select id into v_access from public.tech_access
   where tech_id = v_tech and owner_id = v_owner
     and vehicle_id is not distinct from (case when inv.kind = 'tech_vehicle' then inv.vehicle_id end)
     and status in ('pending','active');
  if v_access is null then
    insert into public.tech_access (tech_id, owner_id, vehicle_id, status, client_origin, invited_by, invite_id, accepted_at)
    values (v_tech, v_owner, case when inv.kind = 'tech_vehicle' then inv.vehicle_id end, 'active',
            inv.kind = 'client_owner', inv.created_by, inv.id, now())
    returning id into v_access;
  else
    update public.tech_access set status = 'active', accepted_at = coalesce(accepted_at, now()) where id = v_access;
  end if;

  update public.invites set redeemed_by = v_uid, redeemed_at = now() where id = inv.id;
  insert into public.audit_log (actor_id, action, entity_table, entity_id, vehicle_id, owner_id, details)
  values (v_uid, 'invite_redeemed', 'invites', inv.id, inv.vehicle_id, v_owner, jsonb_build_object('kind', inv.kind));

  -- migration_003: a client invite may carry a managed (placeholder) client; hand its data to the redeemer.
  -- Also claim any other unclaimed managed client of the inviting tech whose email matches the redeemer's verified email.
  if inv.kind = 'client_owner' then
    if inv.owner_id is not null and exists (select 1 from public.profiles m where m.id = inv.owner_id
         and m.managed and m.claimed_by is null and m.managed_by = inv.created_by) then
      v_claim := v_claim || jsonb_build_array(private.claim_managed(inv.owner_id, v_uid));
    end if;
    v_claim := v_claim || private.claim_managed_by_email(v_uid, inv.created_by);
  end if;

  return jsonb_build_object('kind', inv.kind, 'tech_access_id', v_access, 'owner_id', v_owner,
                            'vehicle_id', inv.vehicle_id, 'tech_id', v_tech, 'claimed', v_claim);
end $$;

create or replace function public.revoke_tech_access(p_access_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ta public.tech_access%rowtype;
begin
  select * into ta from public.tech_access where id = p_access_id for update;
  if not found or not (private.is_collection_owner(ta.owner_id) or ta.tech_id = auth.uid() or private.is_admin()) then
    raise exception 'access grant not found' using errcode = '42501';
  end if;
  if ta.status <> 'revoked' then
    update public.tech_access set status = 'revoked', revoked_at = now(), revoked_by = auth.uid() where id = ta.id;
  end if;
end $$;

create or replace function public.set_tech_permission(
  p_access_id uuid, p_permission text, p_value boolean, p_vehicle_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ta public.tech_access%rowtype;
  v_row uuid;
  v_res jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into ta from public.tech_access where id = p_access_id for update;
  -- same error for "no such grant" and "not yours": no existence oracle
  if not found or not (private.is_collection_owner(ta.owner_id) or private.is_admin()) then
    raise exception 'access grant not found' using errcode = '42501';
  end if;
  if ta.status = 'revoked' then raise exception 'access_revoked' using errcode = 'P0001'; end if;
  if p_value is null then raise exception 'value_required' using errcode = '22004'; end if;
  if p_permission is null or p_permission not in ('view_service_records','view_expenses','view_documents','view_reminders',
       'view_value_estimate','view_health_estimate','view_purchase_info','view_photos','can_add_service',
       'can_add_documents','can_add_expenses','can_create_advisories') then
    raise exception 'unknown_permission' using errcode = '22023';
  end if;
  if p_vehicle_id is not null then
    if not exists (select 1 from public.vehicles v where v.id = p_vehicle_id and v.owner_id = ta.owner_id
                      and (ta.vehicle_id is null or ta.vehicle_id = v.id)) then
      raise exception 'vehicle_not_covered_by_grant' using errcode = '42501';
    end if;
    insert into public.tech_permissions (access_id, tech_id, owner_id, vehicle_id,
        view_service_records, view_expenses, view_documents, view_reminders, view_value_estimate, view_health_estimate,
        view_purchase_info, view_photos, can_add_service, can_add_documents, can_add_expenses, can_create_advisories)
      select d.access_id, d.tech_id, d.owner_id, p_vehicle_id,
        d.view_service_records, d.view_expenses, d.view_documents, d.view_reminders, d.view_value_estimate, d.view_health_estimate,
        d.view_purchase_info, d.view_photos, d.can_add_service, d.can_add_documents, d.can_add_expenses, d.can_create_advisories
      from public.tech_permissions d where d.access_id = ta.id and d.vehicle_id is null
      on conflict do nothing;
  end if;
  update public.tech_permissions tp
     set updated_by = auth.uid()
   where tp.access_id = ta.id and tp.vehicle_id is not distinct from p_vehicle_id
   returning tp.id into v_row;
  if v_row is null then raise exception 'permission row missing' using errcode = 'XX000'; end if;
  execute format('update public.tech_permissions set %I = $1 where id = $2', p_permission) using p_value, v_row;
  select to_jsonb(tp) - 'created_at' - 'updated_at' into v_res from public.tech_permissions tp where tp.id = v_row;
  return v_res;
end $$;

create or replace function public.reset_tech_permission_override(p_access_id uuid, p_vehicle_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ta public.tech_access%rowtype;
begin
  select * into ta from public.tech_access where id = p_access_id for update;
  if not found or not (private.is_collection_owner(ta.owner_id) or private.is_admin()) then
    raise exception 'access grant not found' using errcode = '42501';
  end if;
  if p_vehicle_id is null then raise exception 'vehicle_required' using errcode = '22004'; end if;
  delete from public.tech_permissions where access_id = ta.id and vehicle_id = p_vehicle_id;
end $$;

create or replace function public.initiate_transfer(p_vehicle_id uuid, p_buyer_email text default null)
returns table (transfer_id uuid, code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_code text; v_tid uuid; v_exp timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.vehicles where id = p_vehicle_id and private.is_collection_owner(owner_id)) then
    raise exception 'not_vehicle_owner' using errcode = '42501';
  end if;
  update public.transfers set status = 'expired' where vehicle_id = p_vehicle_id and status = 'pending' and expires_at <= now();
  if exists (select 1 from public.transfers where vehicle_id = p_vehicle_id and status = 'pending') then
    raise exception 'transfer_already_pending' using errcode = '23505';
  end if;

  insert into public.transfers (vehicle_id, seller_id, buyer_email)
  values (p_vehicle_id, v_uid, nullif(lower(btrim(p_buyer_email)), ''))
  returning id, transfers.expires_at into v_tid, v_exp;

  v_code := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 32);
  insert into public.invites (code_hash, kind, created_by, owner_id, vehicle_id, transfer_id, email, expires_at)
  values (encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), 'transfer', v_uid, v_uid, p_vehicle_id, v_tid,
          nullif(lower(btrim(p_buyer_email)), ''), v_exp);
  return query select v_tid, v_code, v_exp;
end $$;

create or replace function public.cancel_transfer(p_transfer_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.transfers set status = 'cancelled'
   where id = p_transfer_id and status = 'pending' and (seller_id = auth.uid() or private.is_vehicle_owner(vehicle_id) or private.is_admin());
  if not found then raise exception 'transfer not found or not cancellable' using errcode = '42501'; end if;
  update public.invites set revoked_at = now() where transfer_id = p_transfer_id and redeemed_at is null and revoked_at is null;
end $$;

create or replace function public.remove_team_member(p_tech_id uuid, p_owner_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid := coalesce(p_owner_id, private.collection_of(auth.uid()));
  v_n int;
  v_email text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not private.is_collection_owner(v_owner) and not private.is_admin() then raise exception 'not_allowed' using errcode = '42501'; end if;
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

-- ---------------------------------------------------------------------------
-- 5. co-owner RPCs (the app shows the code/link to copy or share; nothing is ever sent)
-- ---------------------------------------------------------------------------
create or replace function public.create_co_owner_invite(p_email text default null)
returns table (invite_id uuid, code text, expires_at timestamptz)
language sql security definer set search_path = '' as $$
  select * from public.create_invite('co_owner', null, p_email);
$$;

-- original owner (or admin) removes a co-owner; a co-owner may remove themself (leave)
create or replace function public.remove_co_owner(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); m public.collection_members%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into m from public.collection_members where user_id = p_user_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not (m.collection_owner_id = v_uid or p_user_id = v_uid or private.is_admin()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  delete from public.collection_members where user_id = p_user_id;
  return jsonb_build_object('removed', p_user_id, 'collection_owner_id', m.collection_owner_id, 'left', p_user_id = v_uid);
end $$;

-- everyone who owns the caller's collection (primary first)
create or replace function public.list_co_owners()
returns table (user_id uuid, display_name text, email text, is_primary boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with c as (select private.collection_of(auth.uid()) as o where auth.uid() is not null)
  select p.id, p.display_name, p.email, true, p.created_at from c join public.profiles p on p.id = c.o
  union all
  select p.id, p.display_name, p.email, false, m.created_at
    from c join public.collection_members m on m.collection_owner_id = c.o join public.profiles p on p.id = m.user_id
  order by 4 desc, 5;
$$;

revoke all on function public.create_co_owner_invite(text), public.remove_co_owner(uuid), public.list_co_owners() from public, anon;
grant execute on function public.create_co_owner_invite(text), public.remove_co_owner(uuid), public.list_co_owners() to authenticated;
