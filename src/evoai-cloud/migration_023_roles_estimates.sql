-- migration_023_roles_estimates.sql  (EvoAI review: Nov 8 owner / tech / advisor scope)
-- STATUS: NOT APPLIED to the live Supabase project. Do not paste this into production from this branch.
-- Idempotent. Run backup_023.sql first. Rollback: rollback_023.sql
-- Requires migrations through 022 (private.create_invite_core, private.redeem_invite_core, collection_members, service_requests).
--
-- Adds, without a second requests system:
--   * co-owner management: full or limited. Only the original owner can invite a co-owner.
--   * tech vehicle allow-list (which cars) plus extra action toggles (upload, reviewed scan, reminders, estimates).
--   * formal estimate rows on service_requests (request_kind = 'estimate') and official notifications.
--   * vehicle_history for completion, decisions, reminder and field changes. No free-text PII, no VIN, no notes.
--   * server-side isolation: revoked and out-of-scope callers fail on data routes, not only in the UI.
-- Does not set a price, tax, reseller split, or collect a payment.
-- Coverage is one row per VIN: the first account to claim it owns it. A later claim is refused and
-- the later person gets an in-app notice. Completed jobs are kept with the vehicle. Access-ended
-- notices are hidden after 90 days and removed by public.clear_expired_notices() (the app calls it;
-- no scheduler is required). Limited co-owners do not see title documents unless the original owner
-- sets collection_members.see_title_documents.
begin;

do $$ begin
  if to_regprocedure('private.create_invite_core(text,uuid,text)') is null
     or to_regprocedure('private.redeem_invite_core(text)') is null
     or to_regclass('public.service_requests') is null
     or to_regclass('public.collection_members') is null then
    raise exception 'migration_023 needs migrations through 022 applied first';
  end if;
end $$;

-- 0. Keep the pre-023 function and view text so rollback can put them back. First run only.
create table if not exists private.backup_023_fn (
  fn text primary key,
  def text not null,
  saved_at timestamptz not null default now()
);
revoke all on private.backup_023_fn from public, anon, authenticated;
insert into private.backup_023_fn(fn, def)
select p.oid::regprocedure::text, pg_get_functiondef(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where (n.nspname, p.proname) in (
        ('private','create_invite_core'),
        ('private','redeem_invite_core'),
        ('private','has_active_tech_access'),
        ('private','is_client_tech'),
        ('private','can_write_object'),
        ('private','can_read_object'),
        ('private','thread_member'),
        ('private','request_staff'),
        ('private','tech_can'),
        ('public','set_tech_permission'),
        ('public','revoke_tech_access'),
        ('public','reset_tech_permission_override'),
        ('public','initiate_transfer'),
        ('public','delete_vehicle_permanently'),
        ('private','complete_transfer'),
        ('private','comments_guard'))
on conflict (fn) do nothing;

create table if not exists private.backup_023_views (
  name text primary key,
  def text not null
);
revoke all on private.backup_023_views from public, anon, authenticated;
insert into private.backup_023_views(name, def)
select c.relname, pg_get_viewdef(c.oid, true)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname in ('tech_effective_permissions','my_tech_visibility') and c.relkind = 'v'
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- 1. Co-owner management and tech allow-list
-- ---------------------------------------------------------------------------
alter table public.collection_members add column if not exists management text not null default 'full';
alter table public.collection_members drop constraint if exists collection_members_management_chk;
alter table public.collection_members add constraint collection_members_management_chk check (management in ('full','limited'));
alter table public.collection_members add column if not exists see_title_documents boolean not null default false;

create table if not exists public.tech_grant_vehicles (
  access_id  uuid not null references public.tech_access(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  primary key (access_id, vehicle_id)
);
alter table public.tech_grant_vehicles enable row level security;
alter table public.tech_grant_vehicles force row level security;
revoke all on public.tech_grant_vehicles from anon, authenticated;
grant select on public.tech_grant_vehicles to authenticated;
drop policy if exists tech_grant_vehicles_select on public.tech_grant_vehicles;
create policy tech_grant_vehicles_select on public.tech_grant_vehicles for select to authenticated
  using (exists (select 1 from public.tech_access ta where ta.id = access_id));

create table if not exists private.invite_grants (
  invite_id    uuid primary key references public.invites(id) on delete cascade,
  all_vehicles boolean not null default false,
  vehicle_ids  uuid[] not null default '{}',
  management   text check (management is null or management in ('full','limited')),
  perms        jsonb
);
revoke all on private.invite_grants from public, anon, authenticated;

alter table public.tech_permissions add column if not exists can_upload_photos boolean not null default true;
alter table public.tech_permissions add column if not exists can_scan_documents boolean not null default true;
alter table public.tech_permissions add column if not exists can_add_reminders boolean not null default false;
alter table public.tech_permissions add column if not exists can_send_estimates boolean not null default true;

-- primary = the profile vehicles.owner_id points at. full / limited = a co-owner. null = not an owner.
create or replace function private.owner_rank(p_owner uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p_owner is null or auth.uid() is null then null
    when p_owner = auth.uid() then 'primary'
    else (select m.management from public.collection_members m
           where m.collection_owner_id = p_owner and m.user_id = auth.uid())
  end
$$;

create or replace function private.can_manage_collection(p_owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin() or private.owner_rank(p_owner) in ('primary','full')
$$;

-- full owner, original owner, admin, or the managing tech of an unclaimed client. Not a limited co-owner.
create or replace function private.can_write_vehicle_as_owner(p_vehicle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin()
      or exists (select 1 from public.vehicles v
                  where v.id = p_vehicle and private.can_manage_collection(v.owner_id))
      or exists (select 1 from public.vehicles v
                  where v.id = p_vehicle and private.is_managing_tech(v.owner_id))
$$;

create or replace function private.grant_covers_vehicle(p_access uuid, p_vehicle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.tech_access ta
      join public.vehicles v on v.id = p_vehicle
     where ta.id = p_access
       and ta.status = 'active'
       and (
         ta.vehicle_id = v.id
         or (ta.vehicle_id is null and ta.owner_id = v.owner_id and (
               not exists (select 1 from public.tech_grant_vehicles g where g.access_id = ta.id)
               or exists (select 1 from public.tech_grant_vehicles g where g.access_id = ta.id and g.vehicle_id = v.id)
             ))
       )
  )
$$;

create or replace function private.has_active_tech_access(p_vehicle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.vehicles v
      join public.tech_access ta on ta.tech_id = auth.uid() and ta.status = 'active'
     where v.id = p_vehicle
       and private.grant_covers_vehicle(ta.id, v.id)
  )
$$;

-- owner-scoped AND not cut down to a vehicle list. Allow-listed techs cannot create cars or read the whole collection.
create or replace function private.is_client_tech(p_owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tech_access ta
     where ta.tech_id = auth.uid() and ta.owner_id = p_owner
       and ta.vehicle_id is null and ta.status = 'active'
       and not exists (select 1 from public.tech_grant_vehicles g where g.access_id = ta.id)
  )
$$;

create or replace function private.perm_allowed(p_permission text) returns boolean
language sql immutable set search_path = '' as $$
  select p_permission in (
    'view_service_records','view_expenses','view_documents','view_reminders','view_value_estimate',
    'view_health_estimate','view_purchase_info','view_photos','can_add_service','can_add_documents',
    'can_add_expenses','can_create_advisories','can_upload_photos','can_scan_documents',
    'can_add_reminders','can_send_estimates')
$$;

create or replace function private.tech_can(p_vehicle uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_owner_or_admin(p_vehicle)
      or (private.perm_allowed(p_perm) and exists (
            select 1
              from public.vehicles v
              join public.tech_access ta on ta.tech_id = auth.uid() and ta.status = 'active'
              join lateral (
                select tp.* from public.tech_permissions tp
                 where tp.access_id = ta.id and (tp.vehicle_id = v.id or tp.vehicle_id is null)
                 order by tp.vehicle_id nulls last limit 1) p on true
             where v.id = p_vehicle
               and private.grant_covers_vehicle(ta.id, v.id)
               and coalesce((to_jsonb(p) ->> p_perm)::boolean, false)))
$$;

revoke all on function private.owner_rank(uuid), private.can_manage_collection(uuid),
  private.can_write_vehicle_as_owner(uuid), private.grant_covers_vehicle(uuid,uuid),
  private.perm_allowed(text) from public, anon;
grant execute on function private.owner_rank(uuid), private.can_manage_collection(uuid),
  private.can_write_vehicle_as_owner(uuid), private.grant_covers_vehicle(uuid,uuid),
  private.has_active_tech_access(uuid), private.is_client_tech(uuid), private.tech_can(uuid,text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Invites: no escalation. Vehicle list and co-owner management travel with the code.
-- ---------------------------------------------------------------------------
create or replace function private.create_invite_core(p_kind text, p_vehicle_id uuid default null, p_email text default null)
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
    select v.owner_id into v_owner from public.vehicles v
     where v.id = p_vehicle_id and private.can_manage_collection(v.owner_id);
    if v_owner is null then raise exception 'not_vehicle_owner' using errcode = '42501'; end if;
  elsif p_kind = 'tech_owner' then
    if p_vehicle_id is not null then raise exception 'vehicle_id not allowed for tech_owner' using errcode = '22023'; end if;
    if v_role <> 'owner' and not private.is_admin() then raise exception 'not_allowed' using errcode = '42501'; end if;
    v_owner := private.collection_of(v_uid);
    if not private.can_manage_collection(v_owner) then raise exception 'not_allowed' using errcode = '42501'; end if;
  elsif p_kind = 'co_owner' then
    if p_vehicle_id is not null or v_role <> 'owner' then
      raise exception 'only collection owners can invite a co-owner' using errcode = '42501'; end if;
    v_owner := private.collection_of(v_uid);
    if private.owner_rank(v_owner) is distinct from 'primary' then
      raise exception 'only the original owner can invite a co-owner' using errcode = '42501'; end if;
    if exists (select 1 from public.profiles p where p.id = v_owner and (p.managed or p.archived_at is not null)) then
      raise exception 'not_allowed' using errcode = '42501'; end if;
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
  if to_regclass('private.invite_codes') is not null then
    insert into private.invite_codes (invite_id, code) values (v_id, v_code);
  end if;
  return query select v_id, v_code, v_exp;
end $$;

create or replace function private.apply_invite_grant(p_invite uuid, p_access uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare g private.invite_grants%rowtype; k text; v boolean;
begin
  select * into g from private.invite_grants where invite_id = p_invite;
  if not found then return; end if;
  if not g.all_vehicles and cardinality(g.vehicle_ids) > 0 then
    insert into public.tech_grant_vehicles(access_id, vehicle_id)
    select p_access, x from unnest(g.vehicle_ids) x
    on conflict do nothing;
  end if;
  if g.perms is not null then
    for k, v in select e.key, (e.value)::boolean from jsonb_each_text(g.perms) e(key, value) loop
      if private.perm_allowed(k) then
        execute format('update public.tech_permissions set %I = $1 where access_id = $2 and vehicle_id is null', k)
          using v, p_access;
      end if;
    end loop;
  end if;
end $$;
revoke all on function private.apply_invite_grant(uuid,uuid) from public, anon, authenticated;

create or replace function private.redeem_invite_core(p_code text) returns jsonb
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
  v_mgmt text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is null then raise exception 'no_profile' using errcode = '42501'; end if;
  if p_code is null or length(p_code) > 128 then raise exception 'invalid_or_expired_invite' using errcode = 'P0001'; end if;
  select * into inv from public.invites
   where code_hash = encode(sha256(convert_to(lower(btrim(p_code)), 'UTF8')), 'hex') for update;
  if not found or inv.redeemed_at is not null or inv.revoked_at is not null or inv.expires_at <= now()
     or (inv.email is not null and inv.email <> v_email) then
    raise exception 'invalid_or_expired_invite' using errcode = 'P0001';
  end if;
  if inv.created_by = v_uid then raise exception 'cannot_redeem_own_invite' using errcode = '42501'; end if;
  if v_role = 'admin' then raise exception 'role_not_eligible' using errcode = '42501'; end if;

  if inv.kind = 'co_owner' then
    if v_role <> 'owner' then raise exception 'role_not_eligible' using errcode = '42501'; end if;
    if exists (select 1 from public.tech_access where tech_id = v_uid and status = 'active') then
      raise exception 'role_not_eligible' using errcode = '42501'; end if;
    if inv.owner_id is null or inv.owner_id = v_uid then raise exception 'invalid_or_expired_invite' using errcode = 'P0001'; end if;
    if private.owner_rank(inv.owner_id) is not null then raise exception 'role_not_eligible' using errcode = '42501'; end if;
    if not (inv.created_by = inv.owner_id) then
      raise exception 'invalid_or_expired_invite' using errcode = 'P0001'; end if;
    if exists (select 1 from public.vehicles where owner_id = v_uid)
       or exists (select 1 from public.tech_access where owner_id = v_uid and status <> 'revoked')
       or exists (select 1 from public.collection_members where user_id = v_uid or collection_owner_id = v_uid) then
      raise exception 'role_not_eligible' using errcode = '42501';
    end if;
    select coalesce(management, 'full') into v_mgmt from private.invite_grants where invite_id = inv.id;
    v_mgmt := coalesce(v_mgmt, 'full');
    insert into public.collection_members (collection_owner_id, user_id, role, added_by, invite_id, management)
    values (inv.owner_id, v_uid, 'owner', inv.created_by, inv.id, v_mgmt);
    update public.invites set redeemed_by = v_uid, redeemed_at = now() where id = inv.id;
    return jsonb_build_object('kind', 'co_owner', 'owner_id', inv.owner_id, 'management', v_mgmt);
  end if;

  if inv.kind in ('tech_vehicle','tech_owner') then
    if exists (select 1 from public.collection_members where user_id = v_uid) then
      raise exception 'role_not_eligible' using errcode = '42501'; end if;
    if inv.kind = 'tech_vehicle' and not exists
       (select 1 from public.vehicles v where v.id = inv.vehicle_id and v.owner_id = inv.owner_id) then
      raise exception 'invalid_or_expired_invite' using errcode = 'P0001';
    end if;
    if v_role = 'owner' then
      if exists (select 1 from public.vehicles where owner_id = v_uid)
         or exists (select 1 from public.tech_access where owner_id = v_uid and status <> 'revoked')
         or exists (select 1 from public.collection_members where user_id = v_uid or collection_owner_id = v_uid) then
        raise exception 'role_not_eligible' using errcode = '42501';
      end if;
      update public.profiles set role = 'tech' where id = v_uid;
    end if;
    v_tech := v_uid; v_owner := inv.owner_id;
  elsif inv.kind = 'client_owner' then
    if v_role <> 'owner' then raise exception 'role_not_eligible' using errcode = '42501'; end if;
    if exists (select 1 from public.collection_members where user_id = v_uid) then
      raise exception 'role_not_eligible' using errcode = '42501'; end if;
    if not exists (select 1 from public.profiles where id = inv.created_by and role in ('tech','admin')) then
      raise exception 'invalid_or_expired_invite' using errcode = 'P0001';
    end if;
    v_tech := inv.created_by; v_owner := v_uid;
  elsif inv.kind = 'transfer' then
    if v_role <> 'owner' then raise exception 'role_not_eligible' using errcode = '42501'; end if;
    update public.invites set redeemed_by = v_uid, redeemed_at = now() where id = inv.id;
    return private.complete_transfer(inv.transfer_id, v_uid);
  else
    raise exception 'invalid_or_expired_invite' using errcode = 'P0001';
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
  perform private.apply_invite_grant(inv.id, v_access);

  update public.invites set redeemed_by = v_uid, redeemed_at = now() where id = inv.id;
  insert into public.audit_log (actor_id, action, entity_table, entity_id, vehicle_id, owner_id, details)
  values (v_uid, 'invite_redeemed', 'invites', inv.id, inv.vehicle_id, v_owner,
          jsonb_build_object('kind', inv.kind));

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

create or replace function public.create_tech_invite(
  p_vehicle_ids uuid[] default null,
  p_all boolean default false,
  p_email text default null,
  p_perms jsonb default null
) returns table (invite_id uuid, code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  s record;
  v_owner uuid;
  v_ids uuid[];
  k text;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  v_owner := private.collection_of(auth.uid());
  if not private.can_manage_collection(v_owner) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_all and p_vehicle_ids is not null and cardinality(p_vehicle_ids) > 0 then
    raise exception 'choose all vehicles or a list, not both' using errcode = '22023'; end if;
  if not p_all and (p_vehicle_ids is null or cardinality(p_vehicle_ids) = 0) then
    raise exception 'select at least one vehicle' using errcode = '22023'; end if;
  if not p_all then
    select coalesce(array_agg(distinct v.id), '{}') into v_ids
      from public.vehicles v
     where v.id = any(p_vehicle_ids) and v.owner_id = v_owner and not v.archived;
    if cardinality(v_ids) <> cardinality(p_vehicle_ids) then
      raise exception 'vehicle_not_in_collection' using errcode = '42501'; end if;
  end if;
  if p_perms is not null then
    for k in select e.key from jsonb_each(p_perms) e(key, value) loop
      if not private.perm_allowed(k) then raise exception 'unknown_permission' using errcode = '22023'; end if;
    end loop;
  end if;
  select * into r from private.create_invite_core('tech_owner', null, p_email) limit 1;
  insert into private.invite_grants(invite_id, all_vehicles, vehicle_ids, perms)
  values (r.invite_id, p_all, coalesce(v_ids, '{}'), p_perms);
  select * into s from private.shorten_invite(r.invite_id);
  return query select r.invite_id, s.code, s.expires_at;
end $$;

create or replace function public.create_co_owner_invite(p_email text, p_management text)
returns table (invite_id uuid, code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare r record; s record;
begin
  if p_management not in ('full','limited') then raise exception 'invalid_management' using errcode = '22023'; end if;
  if private.owner_rank(private.collection_of(auth.uid())) is distinct from 'primary' then
    raise exception 'only the original owner can invite a co-owner' using errcode = '42501'; end if;
  select * into r from private.create_invite_core('co_owner', null, p_email) limit 1;
  insert into private.invite_grants(invite_id, management) values (r.invite_id, p_management);
  select * into s from private.shorten_invite(r.invite_id);
  return query select r.invite_id, s.code, s.expires_at;
end $$;

revoke all on function public.create_tech_invite(uuid[], boolean, text, jsonb),
  public.create_co_owner_invite(text, text) from public, anon;
grant execute on function public.create_tech_invite(uuid[], boolean, text, jsonb),
  public.create_co_owner_invite(text, text) to authenticated;

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
  if not found or not private.can_manage_collection(ta.owner_id) then
    raise exception 'access grant not found' using errcode = '42501';
  end if;
  if ta.status = 'revoked' then raise exception 'access_revoked' using errcode = 'P0001'; end if;
  if p_value is null then raise exception 'value_required' using errcode = '22004'; end if;
  if not private.perm_allowed(p_permission) then raise exception 'unknown_permission' using errcode = '22023'; end if;
  if p_vehicle_id is not null then
    if not private.grant_covers_vehicle(ta.id, p_vehicle_id)
       and not (ta.vehicle_id is null and not exists (select 1 from public.tech_grant_vehicles g where g.access_id = ta.id)
                and exists (select 1 from public.vehicles v where v.id = p_vehicle_id and v.owner_id = ta.owner_id)) then
      raise exception 'vehicle_not_covered_by_grant' using errcode = '42501';
    end if;
    insert into public.tech_permissions (access_id, tech_id, owner_id, vehicle_id,
        view_service_records, view_expenses, view_documents, view_reminders, view_value_estimate, view_health_estimate,
        view_purchase_info, view_photos, can_add_service, can_add_documents, can_add_expenses, can_create_advisories,
        can_upload_photos, can_scan_documents, can_add_reminders, can_send_estimates)
      select d.access_id, d.tech_id, d.owner_id, p_vehicle_id,
        d.view_service_records, d.view_expenses, d.view_documents, d.view_reminders, d.view_value_estimate, d.view_health_estimate,
        d.view_purchase_info, d.view_photos, d.can_add_service, d.can_add_documents, d.can_add_expenses, d.can_create_advisories,
        d.can_upload_photos, d.can_scan_documents, d.can_add_reminders, d.can_send_estimates
      from public.tech_permissions d where d.access_id = ta.id and d.vehicle_id is null
      on conflict do nothing;
  end if;
  update public.tech_permissions tp set updated_by = auth.uid()
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
  if not found or not private.can_manage_collection(ta.owner_id) then
    raise exception 'access grant not found' using errcode = '42501';
  end if;
  if p_vehicle_id is null then raise exception 'vehicle_required' using errcode = '22004'; end if;
  delete from public.tech_permissions where access_id = ta.id and vehicle_id = p_vehicle_id;
end $$;

create or replace function public.revoke_tech_access(p_access_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ta public.tech_access%rowtype;
begin
  select * into ta from public.tech_access where id = p_access_id for update;
  if not found or not (private.can_manage_collection(ta.owner_id) or ta.tech_id = auth.uid() or private.is_admin()) then
    raise exception 'access grant not found' using errcode = '42501';
  end if;
  if ta.status <> 'revoked' then
    update public.tech_access set status = 'revoked', revoked_at = now(), revoked_by = auth.uid() where id = ta.id;
    perform set_config('evoai.estimate_rpc', '1', true);
    update public.service_requests
       set decision = 'advisor_removed'
     where request_kind = 'estimate' and created_by = ta.tech_id
       and decision = 'pending' and status not in ('done','declined');
    perform set_config('evoai.estimate_rpc', '0', true);
    update public.invites set revoked_at = now()
     where created_by in (ta.owner_id, auth.uid()) and redeemed_at is null and revoked_at is null
       and kind in ('tech_owner','tech_vehicle') and email = (select lower(email) from public.profiles where id = ta.tech_id);
    insert into public.notifications (recipient_id, owner_id, vehicle_id, kind, title, body)
    select ta.tech_id, ta.owner_id, ta.vehicle_id, 'access_ended', 'Access ended',
           'Your access to this collection has ended.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Estimates on the existing request, notifications, history
-- ---------------------------------------------------------------------------
alter table public.service_requests add column if not exists request_kind text not null default 'client';
alter table public.service_requests add column if not exists work_summary text;
alter table public.service_requests add column if not exists price_amount numeric(12,2);
alter table public.service_requests add column if not exists price_currency text;
alter table public.service_requests add column if not exists proposed_start timestamptz;
alter table public.service_requests add column if not exists proposed_tz text;
alter table public.service_requests add column if not exists duration_minutes int;
alter table public.service_requests add column if not exists decision text;
alter table public.service_requests add column if not exists decided_at timestamptz;
alter table public.service_requests add column if not exists decided_by uuid;
alter table public.service_requests add column if not exists completed_at timestamptz;
alter table public.service_requests add column if not exists completion_note text;
alter table public.service_requests add column if not exists history_id uuid;
alter table public.service_requests drop constraint if exists service_requests_kind_chk;
alter table public.service_requests add constraint service_requests_kind_chk check (request_kind in ('client','estimate'));
alter table public.service_requests drop constraint if exists service_requests_estimate_shape;
alter table public.service_requests add constraint service_requests_estimate_shape check (
  request_kind = 'client'
  or (work_summary is not null and char_length(btrim(work_summary)) between 3 and 1000
      and price_amount is not null and price_amount >= 0 and price_amount < 100000000
      and price_currency ~ '^[A-Z]{3}$'
      and proposed_start is not null
      and proposed_tz ~ '^[A-Za-z0-9_+\-/]{1,64}$'
      and duration_minutes between 15 and 20160
      and decision in ('pending','approved','denied','question','advisor_removed'))
);
alter table public.service_requests drop constraint if exists service_requests_decision_chk;
alter table public.service_requests add constraint service_requests_decision_chk
  check (decision is null or decision in ('pending','approved','denied','question','advisor_removed'));

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  request_id uuid references public.service_requests(id) on delete cascade,
  kind text not null check (kind in ('estimate_sent','estimate_decided','job_completed','access_ended','coverage_blocked','reminder_due')),
  title text not null check (char_length(title) between 1 and 140),
  body text check (body is null or char_length(body) <= 400),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_recipient on public.notifications (recipient_id, created_at desc);

create table if not exists public.vehicle_history (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid,
  kind text not null check (kind in ('field_change','reminder','estimate','decision','job_complete','comment')),
  request_id uuid,
  summary text not null check (char_length(summary) between 1 and 240),
  field_name text check (field_name is null or field_name in ('year','make','model','color','mileage','archived')),
  created_at timestamptz not null default now()
);
create index if not exists vehicle_history_vehicle on public.vehicle_history (vehicle_id, created_at desc);

create or replace function private.notify_user(
  p_recipient uuid, p_owner uuid, p_vehicle uuid, p_request uuid, p_kind text, p_title text, p_body text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_recipient is null then return; end if;
  insert into public.notifications (recipient_id, owner_id, vehicle_id, request_id, kind, title, body)
  values (p_recipient, p_owner, p_vehicle, p_request, p_kind, left(p_title, 140), left(p_body, 400));
end $$;
revoke all on function private.notify_user(uuid,uuid,uuid,uuid,text,text,text) from public, anon, authenticated;

create or replace function private.history_add(
  p_vehicle uuid, p_owner uuid, p_kind text, p_request uuid, p_summary text, p_field text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.vehicle_history (vehicle_id, owner_id, actor_id, kind, request_id, summary, field_name)
  values (p_vehicle, p_owner, auth.uid(), p_kind, p_request, left(p_summary, 240), p_field)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function private.history_add(uuid,uuid,text,uuid,text,text) from public, anon, authenticated;

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

create or replace function private.thread_member(p_owner uuid, p_vehicle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin()
      or private.is_collection_owner(p_owner)
      or private.is_managing_tech(p_owner)
      or private.is_client_tech(p_owner)
      or (p_vehicle is not null and private.has_active_tech_access(p_vehicle))
$$;

create or replace function public.decide_estimate(p_id uuid, p_decision text, p_question text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.service_requests%rowtype; v_rank text; v_hist uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_decision not in ('approved','denied','question') then raise exception 'invalid_decision' using errcode = '22023'; end if;
  select * into r from public.service_requests where id = p_id for update;
  if not found or r.request_kind <> 'estimate' then raise exception 'estimate_not_found' using errcode = '42501'; end if;
  if not private.is_collection_owner(r.owner_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  v_rank := private.owner_rank(r.owner_id);
  if v_rank = 'limited' and p_decision <> 'question' then
    raise exception 'limited_can_only_ask' using errcode = '42501'; end if;
  if r.decision in ('approved','denied','advisor_removed') or r.status in ('done','declined') then
    raise exception 'estimate_already_decided' using errcode = 'P0001'; end if;
  perform set_config('evoai.estimate_rpc', '1', true);
  if p_decision = 'question' then
    if char_length(btrim(coalesce(p_question,''))) < 1 then raise exception 'question_required' using errcode = '22023'; end if;
    insert into public.comments (owner_id, vehicle_id, request_id, author_id, body)
    values (r.owner_id, r.vehicle_id, r.id, auth.uid(), left(btrim(p_question), 2000));
    update public.service_requests set decision = 'question', decided_at = now(), decided_by = auth.uid() where id = r.id;
  elsif p_decision = 'approved' then
    update public.service_requests set decision = 'approved', status = 'accepted', decided_at = now(), decided_by = auth.uid() where id = r.id;
  else
    update public.service_requests set decision = 'denied', status = 'declined', decided_at = now(), decided_by = auth.uid() where id = r.id;
  end if;
  v_hist := private.history_add(r.vehicle_id, r.owner_id, 'decision', r.id,
    case p_decision when 'approved' then 'Estimate approved' when 'denied' then 'Estimate denied' else 'Question on an estimate' end,
    null);
  perform private.notify_user(r.created_by, r.owner_id, r.vehicle_id, r.id, 'estimate_decided',
    'Estimate decision', case p_decision when 'approved' then 'Approved' when 'denied' then 'Denied' else 'A question was asked' end);
  return jsonb_build_object('id', r.id, 'decision', p_decision, 'history_id', v_hist);
end $$;

create or replace function public.complete_service_job(p_id uuid, p_note text default null, p_mileage int default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.service_requests%rowtype; v_hist uuid; v_rec uuid; m public.collection_members%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_mileage is not null and p_mileage < 0 then raise exception 'invalid_mileage' using errcode = '22023'; end if;
  select * into r from public.service_requests where id = p_id for update;
  if not found then raise exception 'request_not_found' using errcode = '42501'; end if;
  if not private.has_active_tech_access(r.vehicle_id) or not private.tech_can(r.vehicle_id, 'can_add_service') then
    raise exception 'not_allowed' using errcode = '42501'; end if;
  if r.status = 'done' then raise exception 'already_complete' using errcode = 'P0001'; end if;
  if r.decision = 'advisor_removed' or r.status = 'declined' then
    raise exception 'advisor_removed' using errcode = 'P0001'; end if;
  if r.request_kind = 'estimate' and r.decision is distinct from 'approved' then
    raise exception 'estimate_not_approved' using errcode = 'P0001'; end if;
  if r.request_kind = 'client' and r.status not in ('accepted','scheduled') then
    raise exception 'request_not_ready' using errcode = 'P0001'; end if;
  perform set_config('evoai.estimate_rpc', '1', true);
  insert into public.service_records (vehicle_id, created_by, title, description, category, performed_on, mileage, cost)
  values (r.vehicle_id, auth.uid(),
          left(coalesce(nullif(btrim(r.work_summary),''), r.service), 200),
          left(nullif(btrim(coalesce(p_note,'')),''), 2000),
          'maintenance', current_date, p_mileage, r.price_amount)
  returning id into v_rec;
  v_hist := private.history_add(r.vehicle_id, r.owner_id, 'job_complete', r.id,
    'Job marked complete', null);
  update public.service_requests
     set status = 'done', completed_at = now(), completion_note = left(nullif(btrim(coalesce(p_note,'')),''), 1000),
         history_id = v_hist
   where id = r.id;
  perform private.notify_user(r.owner_id, r.owner_id, r.vehicle_id, r.id, 'job_completed', 'Job complete', 'A job was marked complete');
  for m in select * from public.collection_members where collection_owner_id = r.owner_id loop
    perform private.notify_user(m.user_id, r.owner_id, r.vehicle_id, r.id, 'job_completed', 'Job complete', 'A job was marked complete');
  end loop;
  return jsonb_build_object('id', r.id, 'service_record_id', v_rec, 'history_id', v_hist);
end $$;

revoke all on function public.decide_estimate(uuid, text, text), public.complete_service_job(uuid, text, int) from public, anon;
grant execute on function public.decide_estimate(uuid, text, text), public.complete_service_job(uuid, text, int) to authenticated;

-- notify the collection when an estimate is inserted
create or replace function private.estimate_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m public.collection_members%rowtype;
begin
  if new.request_kind <> 'estimate' then return new; end if;
  perform private.notify_user(new.owner_id, new.owner_id, new.vehicle_id, new.id, 'estimate_sent',
    'New estimate', 'An estimate is waiting for a decision');
  for m in select * from public.collection_members where collection_owner_id = new.owner_id loop
    perform private.notify_user(m.user_id, new.owner_id, new.vehicle_id, new.id, 'estimate_sent',
      'New estimate', 'An estimate is waiting for a decision');
  end loop;
  perform private.history_add(new.vehicle_id, new.owner_id, 'estimate', new.id, 'Estimate sent', null);
  return new;
end $$;
drop trigger if exists service_requests_estimate_notify on public.service_requests;
create trigger service_requests_estimate_notify after insert on public.service_requests
  for each row execute function private.estimate_notify();

alter table public.notifications enable row level security;
alter table public.notifications force row level security;
revoke all on public.notifications from anon;
grant select, update on public.notifications to authenticated;
drop policy if exists notifications_select on public.notifications;
-- Access-ended notices stop being readable after 90 days. clear_expired_notices() deletes them.
-- Completed job rows are not in this table's expiry path and are not deleted here.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('estimate_sent','estimate_decided','job_completed','access_ended','coverage_blocked','reminder_due'));
create policy notifications_select on public.notifications for select to authenticated
  using (
    recipient_id = (select auth.uid())
    and (kind is distinct from 'access_ended' or created_at > now() - interval '90 days')
    and (
      kind in ('access_ended','coverage_blocked')
      or private.is_collection_owner(owner_id)
      or (vehicle_id is not null and private.has_active_tech_access(vehicle_id))
      or private.is_client_tech(owner_id)
    )
  );
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));
create or replace function private.notifications_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('evoai.estimate_rpc', true), '') = '1'
     or coalesce(current_setting('evoai.transfer', true), '') = '1' then return new; end if;
  if new.recipient_id is distinct from old.recipient_id or new.owner_id is distinct from old.owner_id
     or new.vehicle_id is distinct from old.vehicle_id or new.request_id is distinct from old.request_id
     or new.kind is distinct from old.kind or new.title is distinct from old.title
     or new.body is distinct from old.body or new.created_at is distinct from old.created_at then
    raise exception 'notification_locked' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists notifications_guard on public.notifications;
create trigger notifications_guard before update on public.notifications
  for each row execute function private.notifications_guard();

alter table public.vehicle_history enable row level security;
alter table public.vehicle_history force row level security;
revoke all on public.vehicle_history from anon;
grant select on public.vehicle_history to authenticated;
drop policy if exists vehicle_history_select on public.vehicle_history;
create policy vehicle_history_select on public.vehicle_history for select to authenticated
  using (
    private.is_collection_owner(owner_id) or (select private.is_admin())
    or (private.has_active_tech_access(vehicle_id) and (
         (kind = 'reminder' and private.tech_can(vehicle_id, 'view_reminders'))
         or (kind = 'field_change' and private.tech_can(vehicle_id, 'view_service_records'))
         or (kind in ('estimate','decision','job_complete','comment')
             and (private.tech_can(vehicle_id, 'view_service_records') or private.tech_can(vehicle_id, 'can_add_service')))
       ))
  );

-- field changes: names of non-sensitive columns only. VIN, plate, notes and emails are never written here.
create or replace function private.vehicles_history_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
declare k text; oldj jsonb := to_jsonb(old); newj jsonb := to_jsonb(new);
begin
  if coalesce(current_setting('evoai.claiming', true), '') = '1' then return new; end if;
  foreach k in array array['year','make','model','color','mileage','archived'] loop
    if oldj -> k is distinct from newj -> k then
      perform private.history_add(new.id, new.owner_id, 'field_change', null,
        case k
          when 'mileage' then 'Mileage updated'
          when 'archived' then case when new.archived then 'Vehicle archived' else 'Vehicle restored' end
          else initcap(k) || ' updated'
        end, k);
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists vehicles_history_trigger on public.vehicles;
create trigger vehicles_history_trigger after update on public.vehicles
  for each row execute function private.vehicles_history_trigger();

create or replace function private.reminders_history_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform private.history_add(new.vehicle_id, new.owner_id, 'reminder', null,
      'Reminder set: ' || left(new.kind, 40), null);
  elsif new.completed_at is not null and old.completed_at is null then
    perform private.history_add(new.vehicle_id, new.owner_id, 'reminder', null,
      'Reminder completed: ' || left(new.kind, 40), null);
  end if;
  return new;
end $$;
drop trigger if exists reminders_history_trigger on public.reminders;
create trigger reminders_history_trigger after insert or update on public.reminders
  for each row execute function private.reminders_history_trigger();

-- reviewed scan: a tech must hold can_scan_documents. Owners who can manage the car are unchanged.
create or replace function private.can_review_scan(p_vehicle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.can_write_vehicle_as_owner(p_vehicle)
      or (private.has_active_tech_access(p_vehicle)
          and not private.is_vehicle_owner(p_vehicle)
          and private.tech_can(p_vehicle, 'can_add_documents')
          and private.tech_can(p_vehicle, 'can_scan_documents'))
$$;
revoke all on function private.can_review_scan(uuid) from public, anon;
grant execute on function private.can_review_scan(uuid) to authenticated, service_role;

create or replace function private.documents_scan_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.ai_status is distinct from old.ai_status and new.ai_status in ('scanned','edited') then
    if not private.can_review_scan(new.vehicle_id) then
      raise exception 'scan_not_permitted' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists documents_scan_guard on public.documents;
create trigger documents_scan_guard before update on public.documents
  for each row execute function private.documents_scan_guard();

-- ---------------------------------------------------------------------------
-- 4. Least privilege on writes. Limited co-owners keep read access.
-- ---------------------------------------------------------------------------
drop policy if exists vehicles_update on public.vehicles;
create policy vehicles_update on public.vehicles for update to authenticated
  using (private.can_write_vehicle_as_owner(id) or (select private.is_admin()))
  with check (private.can_write_vehicle_as_owner(id) or (select private.is_admin()));
drop policy if exists vehicles_delete on public.vehicles;
create policy vehicles_delete on public.vehicles for delete to authenticated
  using (private.can_write_vehicle_as_owner(id) or (select private.is_admin()));
drop policy if exists vehicles_insert on public.vehicles;
create policy vehicles_insert on public.vehicles for insert to authenticated
  with check (private.can_manage_collection(owner_id) or (select private.is_admin())
              or private.is_client_tech(owner_id) or private.is_managing_tech(owner_id));

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and (
    private.can_write_vehicle_as_owner(vehicle_id)
    or (not owner_only and not private.is_vehicle_owner(vehicle_id)
        and private.has_active_tech_access(vehicle_id) and private.tech_can(vehicle_id, 'can_add_documents'))
  ));
drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents for update to authenticated
  using (private.can_write_vehicle_as_owner(vehicle_id)
         or (uploaded_by = (select auth.uid()) and not owner_only and not private.is_vehicle_owner(vehicle_id)
             and private.has_active_tech_access(vehicle_id) and private.tech_can(vehicle_id, 'can_add_documents')))
  with check (private.can_write_vehicle_as_owner(vehicle_id)
         or (uploaded_by = (select auth.uid()) and not owner_only and not private.is_vehicle_owner(vehicle_id)
             and private.has_active_tech_access(vehicle_id) and private.tech_can(vehicle_id, 'can_add_documents')));
drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete to authenticated
  using (private.can_write_vehicle_as_owner(vehicle_id)
         or (uploaded_by = (select auth.uid()) and not owner_only and not private.is_vehicle_owner(vehicle_id)
             and private.has_active_tech_access(vehicle_id) and private.tech_can(vehicle_id, 'can_add_documents')));

drop policy if exists vehicle_photos_insert on public.vehicle_photos;
create policy vehicle_photos_insert on public.vehicle_photos for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and (
    private.can_write_vehicle_as_owner(vehicle_id)
    or (not private.is_vehicle_owner(vehicle_id) and private.has_active_tech_access(vehicle_id)
        and private.tech_can(vehicle_id, 'view_photos') and private.tech_can(vehicle_id, 'can_upload_photos'))
  ));
drop policy if exists vehicle_photos_update on public.vehicle_photos;
create policy vehicle_photos_update on public.vehicle_photos for update to authenticated
  using (private.can_write_vehicle_as_owner(vehicle_id)
         or (uploaded_by = (select auth.uid()) and not private.is_vehicle_owner(vehicle_id)
             and private.has_active_tech_access(vehicle_id)
             and private.tech_can(vehicle_id, 'view_photos') and private.tech_can(vehicle_id, 'can_upload_photos')))
  with check (private.can_write_vehicle_as_owner(vehicle_id)
         or (uploaded_by = (select auth.uid()) and not private.is_vehicle_owner(vehicle_id)
             and private.has_active_tech_access(vehicle_id)
             and private.tech_can(vehicle_id, 'view_photos') and private.tech_can(vehicle_id, 'can_upload_photos')));
drop policy if exists vehicle_photos_delete on public.vehicle_photos;
create policy vehicle_photos_delete on public.vehicle_photos for delete to authenticated
  using (private.can_write_vehicle_as_owner(vehicle_id)
         or (uploaded_by = (select auth.uid()) and not private.is_vehicle_owner(vehicle_id)
             and private.has_active_tech_access(vehicle_id)
             and private.tech_can(vehicle_id, 'view_photos') and private.tech_can(vehicle_id, 'can_upload_photos')));

drop policy if exists reminders_insert on public.reminders;
create policy reminders_insert on public.reminders for insert to authenticated
  with check (private.can_write_vehicle_as_owner(vehicle_id)
              or (created_by = (select auth.uid()) and not private.is_vehicle_owner(vehicle_id)
                  and private.has_active_tech_access(vehicle_id) and private.tech_can(vehicle_id, 'can_add_reminders')));
drop policy if exists reminders_update on public.reminders;
create policy reminders_update on public.reminders for update to authenticated
  using (private.can_write_vehicle_as_owner(vehicle_id)
         or (private.has_active_tech_access(vehicle_id)
             and private.tech_can(vehicle_id, 'can_add_reminders')
             and not private.is_vehicle_owner(vehicle_id)))
  with check (private.can_write_vehicle_as_owner(vehicle_id)
         or (private.has_active_tech_access(vehicle_id)
             and private.tech_can(vehicle_id, 'can_add_reminders')
             and not private.is_vehicle_owner(vehicle_id)));
drop policy if exists reminders_delete on public.reminders;
create policy reminders_delete on public.reminders for delete to authenticated
  using (private.can_write_vehicle_as_owner(vehicle_id));

drop policy if exists vehicle_financials_write on public.vehicle_financials;
create policy vehicle_financials_write on public.vehicle_financials for all to authenticated
  using (private.can_write_vehicle_as_owner(vehicle_id))
  with check (private.can_write_vehicle_as_owner(vehicle_id));

drop policy if exists service_records_delete on public.service_records;
create policy service_records_delete on public.service_records for delete to authenticated
  using (private.can_write_vehicle_as_owner(vehicle_id));

drop policy if exists request_photos_insert_tech on public.request_photos;
create policy request_photos_insert_tech on public.request_photos for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and exists (select 1 from public.service_requests r
                 where r.id = request_id and r.owner_id = request_photos.owner_id
                   and private.has_active_tech_access(r.vehicle_id)
                   and private.tech_can(r.vehicle_id, 'can_add_documents')
                   and split_part(request_photos.storage_path,'/',1) = r.owner_id::text
                   and split_part(request_photos.storage_path,'/',2) = r.vehicle_id::text)
  );

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
  using (
    (select private.is_admin())
    or private.is_collection_owner(owner_id)
    or (vehicle_id is not null and private.has_active_tech_access(vehicle_id) and (
         (entity_table = 'expenses' and private.tech_can(vehicle_id, 'view_expenses'))
         or (entity_table = 'vehicle_financials' and private.tech_can(vehicle_id, 'view_purchase_info'))
         or (entity_table = 'documents' and private.tech_can(vehicle_id, 'view_documents'))
         or (entity_table = 'vehicle_photos' and private.tech_can(vehicle_id, 'view_photos'))
         or (entity_table = 'reminders' and private.tech_can(vehicle_id, 'view_reminders'))
         or (entity_table not in ('expenses','vehicle_financials','documents','vehicle_photos','reminders')
             and private.tech_can(vehicle_id, 'view_service_records'))
       ))
  );

-- Title documents: primary and full co-owners see them. A limited co-owner does not, unless the
-- original owner has set see_title_documents for that person.
create or replace function private.can_see_title_docs(p_vehicle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin()
      or exists (
        select 1 from public.vehicles v
         where v.id = p_vehicle
           and (
             private.owner_rank(v.owner_id) in ('primary','full')
             or private.is_managing_tech(v.owner_id)
             or exists (
               select 1 from public.collection_members m
                where m.collection_owner_id = v.owner_id
                  and m.user_id = auth.uid()
                  and m.management = 'limited'
                  and m.see_title_documents
             )
           )
      );
$$;
revoke all on function private.can_see_title_docs(uuid) from public, anon;
grant execute on function private.can_see_title_docs(uuid) to authenticated, service_role;

create or replace function public.set_co_owner_title_access(p_user_id uuid, p_allow boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.collection_members%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_allow is null then raise exception 'value_required' using errcode = '22004'; end if;
  select * into m from public.collection_members where user_id = p_user_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if private.owner_rank(m.collection_owner_id) is distinct from 'primary' then
    raise exception 'only the original owner can change title access' using errcode = '42501'; end if;
  if m.management is distinct from 'limited' then
    raise exception 'title_toggle_is_for_limited' using errcode = '22023'; end if;
  update public.collection_members set see_title_documents = p_allow where user_id = p_user_id;
  return jsonb_build_object('user_id', p_user_id, 'see_title_documents', p_allow);
end $$;
revoke all on function public.set_co_owner_title_access(uuid, boolean) from public, anon;
grant execute on function public.set_co_owner_title_access(uuid, boolean) to authenticated;

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
  using (
    (
      private.is_owner_or_admin(vehicle_id)
      and (kind is distinct from 'title' or private.can_see_title_docs(vehicle_id))
    )
    or (
      not owner_only
      and not private.is_vehicle_owner(vehicle_id)
      and private.tech_can(vehicle_id, 'view_documents')
    )
  );

-- One coverage owner per VIN. No amount, currency, or payment is stored.
create table if not exists public.vehicle_coverage (
  vin_key     text primary key check (vin_key ~ '^[A-Z0-9]{5,25}$'),
  covered_by  uuid not null references public.profiles(id) on delete cascade,
  vehicle_id  uuid references public.vehicles(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.vehicle_coverage enable row level security;
alter table public.vehicle_coverage force row level security;
revoke all on public.vehicle_coverage from anon, authenticated;
grant select on public.vehicle_coverage to authenticated;
drop policy if exists vehicle_coverage_select on public.vehicle_coverage;
create policy vehicle_coverage_select on public.vehicle_coverage for select to authenticated
  using (covered_by = (select auth.uid()) or (select private.is_admin()));

create or replace function private.norm_vin(p_vin text) returns text
language sql immutable set search_path = '' as $$
  select nullif(upper(regexp_replace(coalesce(p_vin, ''), '[^A-Za-z0-9]', '', 'g')), '')
$$;

create or replace function public.claim_vehicle_coverage(p_vin text, p_vehicle_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_key text := private.norm_vin(p_vin);
  c public.vehicle_coverage%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_key is null then return jsonb_build_object('ok', true, 'skipped', true); end if;
  if v_key !~ '^[A-Z0-9]{5,25}$' then raise exception 'invalid_vin' using errcode = '22023'; end if;
  if p_vehicle_id is not null and not exists (select 1 from public.vehicles v where v.id = p_vehicle_id) then
    p_vehicle_id := null;
  end if;
  select * into c from public.vehicle_coverage where vin_key = v_key for update;
  if not found then
    insert into public.vehicle_coverage (vin_key, covered_by, vehicle_id)
    values (v_key, v_uid, p_vehicle_id);
    return jsonb_build_object('ok', true, 'covered_by', v_uid);
  end if;
  if c.covered_by = v_uid then
    if p_vehicle_id is not null and c.vehicle_id is null then
      update public.vehicle_coverage set vehicle_id = p_vehicle_id where vin_key = v_key;
    end if;
    return jsonb_build_object('ok', true, 'covered_by', v_uid);
  end if;
  insert into public.notifications (recipient_id, owner_id, kind, title, body)
  values (v_uid, v_uid, 'coverage_blocked', 'Vehicle already covered',
          'This vehicle is already covered, so a second coverage was not started.');
  return jsonb_build_object('ok', false, 'error', 'already_covered',
    'title', 'Vehicle already covered',
    'body', 'This vehicle is already covered, so a second coverage was not started.');
end $$;

-- Runs after the vehicle row exists so the coverage row can point at it. A second account's
-- insert of the same VIN is rolled back. The in-app notice is written by claim_vehicle_coverage,
-- which returns instead of raising so the notice commits.
create or replace function private.vehicles_coverage_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := private.norm_vin(new.vin);
  v_who uuid := coalesce(auth.uid(), new.owner_id);
  v_owner uuid;
begin
  if coalesce(current_setting('evoai.transfer', true), '') = '1' then return new; end if;
  if v_key is null or v_key !~ '^[A-Z0-9]{5,25}$' then return new; end if;
  -- Ordinary save always writes vin. If this car already holds the coverage, keep it
  -- with the car's current owner instead of treating the write as a second claim.
  if exists (select 1 from public.vehicle_coverage c where c.vin_key = v_key and c.vehicle_id = new.id)
     and (auth.uid() is null or private.is_collection_owner(new.owner_id) or private.is_managing_tech(new.owner_id)) then
    update public.vehicle_coverage set covered_by = new.owner_id
     where vin_key = v_key and vehicle_id = new.id;
    return new;
  end if;
  insert into public.vehicle_coverage (vin_key, covered_by, vehicle_id)
  values (v_key, v_who, new.id)
  on conflict (vin_key) do update
     set vehicle_id = coalesce(public.vehicle_coverage.vehicle_id, excluded.vehicle_id)
   where public.vehicle_coverage.covered_by = excluded.covered_by;
  select covered_by into v_owner from public.vehicle_coverage where vin_key = v_key;
  if v_owner is distinct from v_who and v_owner is distinct from new.owner_id then
    raise exception 'vehicle_already_covered' using errcode = '42501';
  end if;
  if v_owner is distinct from new.owner_id and private.is_collection_owner(new.owner_id) then
    update public.vehicle_coverage set covered_by = new.owner_id, vehicle_id = new.id where vin_key = v_key;
  end if;
  return new;
end $$;
drop trigger if exists vehicles_coverage_guard on public.vehicles;
create trigger vehicles_coverage_guard after insert or update of vin on public.vehicles
  for each row execute function private.vehicles_coverage_guard();

-- Deletes only access-ended notices older than 90 days. Job records are not touched.
-- The app calls this after sign-in. No external scheduler is required.
create or replace function public.clear_expired_notices() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  delete from public.notifications
   where kind = 'access_ended' and created_at < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function private.norm_vin(text), private.vehicles_coverage_guard() from public, anon, authenticated;
revoke all on function public.claim_vehicle_coverage(text, uuid), public.clear_expired_notices() from public, anon;
grant execute on function public.claim_vehicle_coverage(text, uuid), public.clear_expired_notices() to authenticated;

create or replace function private.can_read_object(p_bucket text, p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_bucket in ('vehicle-photos','vehicle-documents')
     and (array_length(storage.foldername(p_name), 1) = 2
          or (p_bucket = 'vehicle-photos' and array_length(storage.foldername(p_name), 1) = 3
              and (storage.foldername(p_name))[3] = 'portfolio'))
     and private.object_vehicle(p_name) is not null
     and (
       (
         private.is_owner_or_admin(private.object_vehicle(p_name))
         and not exists (
           select 1 from public.documents d
            where (d.storage_path = p_name or d.thumb_path = p_name)
              and d.kind = 'title'
              and not private.can_see_title_docs(private.object_vehicle(p_name))
         )
       )
       or (private.has_active_tech_access(private.object_vehicle(p_name))
           and case p_bucket
                 when 'vehicle-photos' then private.tech_can(private.object_vehicle(p_name), 'view_photos')
                 else private.tech_can(private.object_vehicle(p_name), 'view_documents')
                      and not exists (select 1 from public.documents d
                                       where (d.storage_path = p_name or d.thumb_path = p_name) and d.owner_only)
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
     and (
       private.can_write_vehicle_as_owner(private.object_vehicle(p_name))
       or (not private.is_vehicle_owner(private.object_vehicle(p_name))
           and private.has_active_tech_access(private.object_vehicle(p_name))
           and case p_bucket
                 when 'vehicle-photos' then private.tech_can(private.object_vehicle(p_name), 'view_photos')
                      and private.tech_can(private.object_vehicle(p_name), 'can_upload_photos')
                 else private.tech_can(private.object_vehicle(p_name), 'can_add_documents')
               end)
     );
$$;

-- visibility views: same shape, plus the new toggles and the allow-list
create or replace view public.tech_effective_permissions with (security_invoker = true) as
select ta.id as access_id, ta.tech_id, ta.owner_id, v.id as vehicle_id,
       ta.vehicle_id is null and not exists (select 1 from public.tech_grant_vehicles g where g.access_id = ta.id) as owner_scoped,
       p.vehicle_id is not null as has_override,
       p.view_service_records, p.view_expenses, p.view_documents, p.view_reminders, p.view_value_estimate,
       p.view_health_estimate, p.view_purchase_info, p.view_photos,
       p.can_add_service, p.can_add_documents, p.can_add_expenses, p.can_create_advisories,
       p.can_upload_photos, p.can_scan_documents, p.can_add_reminders, p.can_send_estimates
from public.tech_access ta
join public.vehicles v on private.grant_covers_vehicle(ta.id, v.id)
join lateral (select tp.* from public.tech_permissions tp
               where tp.access_id = ta.id and (tp.vehicle_id = v.id or tp.vehicle_id is null)
               order by tp.vehicle_id nulls last limit 1) p on true
where ta.status = 'active';

create or replace view public.my_tech_visibility with (security_invoker = true) as
select e.vehicle_id, e.owner_id,
       btrim(concat_ws(' ', v.year::text, v.make, v.model)) as vehicle_label,
       bool_or(e.view_service_records) as can_view_service_records,
       bool_or(e.view_expenses)        as can_view_expenses,
       bool_or(e.view_documents)       as can_view_documents,
       bool_or(e.view_reminders)       as can_view_reminders,
       bool_or(e.view_value_estimate)  as can_view_value_estimate,
       bool_or(e.view_health_estimate) as can_view_health_estimate,
       bool_or(e.view_purchase_info)   as can_view_purchase_info,
       bool_or(e.view_photos)          as can_view_photos,
       bool_or(e.can_add_service)      as can_add_service,
       bool_or(e.can_add_documents)    as can_add_documents,
       bool_or(e.can_add_expenses)     as can_add_expenses,
       bool_or(e.can_create_advisories) as can_create_advisories,
       bool_or(e.can_upload_photos)    as can_upload_photos,
       bool_or(e.can_scan_documents)   as can_scan_documents,
       bool_or(e.can_add_reminders)    as can_add_reminders,
       bool_or(e.can_send_estimates)   as can_send_estimates
from public.tech_effective_permissions e
join public.vehicles v on v.id = e.vehicle_id
where e.tech_id = auth.uid()
group by e.vehicle_id, e.owner_id, v.year, v.make, v.model;

grant select on public.tech_effective_permissions, public.my_tech_visibility to authenticated;

-- ---------------------------------------------------------------------------
-- Transfer, coverage move, co-owner management, delete vs permanent jobs
-- ---------------------------------------------------------------------------
create or replace function private.comments_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('evoai.transfer', true), '') = '1' then return new; end if;
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

create or replace function public.initiate_transfer(p_vehicle_id uuid, p_buyer_email text default null)
returns table (transfer_id uuid, code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_owner uuid; v_code text; v_tid uuid; v_exp timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select owner_id into v_owner from public.vehicles where id = p_vehicle_id;
  if v_owner is null or not private.can_manage_collection(v_owner) then
    raise exception 'not_vehicle_owner' using errcode = '42501';
  end if;
  update public.transfers set status = 'expired' where vehicle_id = p_vehicle_id and status = 'pending' and expires_at <= now();
  if exists (select 1 from public.transfers where vehicle_id = p_vehicle_id and status = 'pending') then
    raise exception 'transfer_already_pending' using errcode = '23505';
  end if;
  insert into public.transfers (vehicle_id, seller_id, buyer_email)
  values (p_vehicle_id, v_owner, nullif(lower(btrim(p_buyer_email)), ''))
  returning id, transfers.expires_at into v_tid, v_exp;
  v_code := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 32);
  insert into public.invites (code_hash, kind, created_by, owner_id, vehicle_id, transfer_id, email, expires_at)
  values (encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), 'transfer', v_uid, v_owner, p_vehicle_id, v_tid,
          nullif(lower(btrim(p_buyer_email)), ''), v_exp);
  return query select v_tid, v_code, v_exp;
end $$;

create or replace function private.complete_transfer(p_transfer uuid, p_buyer uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.transfers%rowtype;
  v public.vehicles%rowtype;
  v_snapshot jsonb;
  v_archive uuid;
  r record;
begin
  select * into t from public.transfers where id = p_transfer for update;
  if not found or t.status <> 'pending' or t.expires_at <= now() then
    raise exception 'invalid_or_expired_invite' using errcode = 'P0001';
  end if;
  if p_buyer = t.seller_id then raise exception 'cannot_transfer_to_self' using errcode = '42501'; end if;
  select * into v from public.vehicles where id = t.vehicle_id for update;
  if not found or v.owner_id <> t.seller_id then
    raise exception 'invalid_or_expired_invite' using errcode = 'P0001';
  end if;

  v_snapshot := jsonb_build_object(
    'taken_at', now(),
    'vehicle', to_jsonb(v) - 'notes',
    'service_records', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'performed_on', s.performed_on)) from public.service_records s where s.vehicle_id = v.id), '[]'::jsonb),
    'estimates', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'decision', q.decision, 'status', q.status)) from public.service_requests q where q.vehicle_id = v.id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'kind', h.kind, 'summary', h.summary)) from public.vehicle_history h where h.vehicle_id = v.id), '[]'::jsonb)
  );
  insert into public.vehicle_archives (owner_id, source_vehicle_id, transfer_id, label, snapshot)
  values (t.seller_id, v.id, t.id,
          btrim(concat_ws(' ', v.year::text, v.make, v.model)),
          v_snapshot)
  returning id into v_archive;

  for r in
    select ta.id, ta.tech_id, ta.vehicle_id
      from public.tech_access ta
     where ta.owner_id = v.owner_id and ta.status = 'active'
       and (ta.vehicle_id = v.id
            or exists (select 1 from public.tech_grant_vehicles g where g.access_id = ta.id and g.vehicle_id = v.id))
  loop
    insert into public.notifications (recipient_id, owner_id, vehicle_id, kind, title, body)
    values (r.tech_id, v.owner_id, v.id, 'access_ended', 'Access ended',
            'This vehicle was transferred. Your access to it has ended.');
    if r.vehicle_id = v.id then
      update public.tech_access set status = 'revoked', revoked_at = now(), revoked_by = t.seller_id where id = r.id;
    else
      delete from public.tech_grant_vehicles where access_id = r.id and vehicle_id = v.id;
      if not exists (select 1 from public.tech_grant_vehicles g where g.access_id = r.id) then
        update public.tech_access set status = 'revoked', revoked_at = now(), revoked_by = t.seller_id where id = r.id;
      end if;
    end if;
  end loop;

  delete from public.expenses where vehicle_id = v.id;
  delete from public.reminders where vehicle_id = v.id;
  delete from public.vehicle_financials where vehicle_id = v.id;
  update public.advisories set status = 'declined', owner_response = 'Vehicle transferred', responded_at = now()
   where vehicle_id = v.id and status = 'pending';
  update public.invites set revoked_at = now()
   where vehicle_id = v.id and redeemed_at is null and revoked_at is null and kind <> 'transfer';

  perform set_config('evoai.transfer', '1', true);
  update public.service_requests set owner_id = p_buyer where vehicle_id = v.id;
  update public.comments set owner_id = p_buyer where vehicle_id = v.id;
  update public.vehicle_history set owner_id = p_buyer where vehicle_id = v.id;
  update public.notifications set owner_id = p_buyer
   where vehicle_id = v.id and kind is distinct from 'access_ended';
  update public.vehicle_coverage set covered_by = p_buyer, vehicle_id = v.id
   where vehicle_id = v.id
      or (vin_key = private.norm_vin(v.vin) and covered_by = v.owner_id);
  update public.vehicles set owner_id = p_buyer, archived = false where id = v.id;
  perform set_config('evoai.transfer', '0', true);

  update public.transfers set status = 'completed', buyer_id = p_buyer, completed_at = now() where id = t.id;
  insert into public.audit_log (actor_id, action, entity_table, entity_id, vehicle_id, owner_id, details)
  values (p_buyer, 'transfer_completed', 'transfers', t.id, v.id, p_buyer,
          jsonb_build_object('buyer', p_buyer, 'archive_id', v_archive));
  return jsonb_build_object('kind','transfer','vehicle_id', v.id, 'archive_id', v_archive, 'owner_id', p_buyer);
end $$;

create or replace function public.set_co_owner_management(p_user_id uuid, p_management text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m public.collection_members%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_management not in ('full','limited') then raise exception 'invalid_management' using errcode = '22023'; end if;
  select * into m from public.collection_members where user_id = p_user_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if private.owner_rank(m.collection_owner_id) is distinct from 'primary' then
    raise exception 'only the original owner can change management' using errcode = '42501'; end if;
  update public.collection_members set management = p_management where user_id = p_user_id;
  if p_management = 'full' then
    update public.collection_members set see_title_documents = false where user_id = p_user_id;
  end if;
  return jsonb_build_object('user_id', p_user_id, 'management', p_management);
end $$;

create or replace function public.dismiss_removed_estimate(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.service_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into r from public.service_requests where id = p_id for update;
  if not found or r.decision is distinct from 'advisor_removed' then
    raise exception 'estimate_not_found' using errcode = '42501'; end if;
  if not private.is_collection_owner(r.owner_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  perform set_config('evoai.estimate_rpc', '1', true);
  update public.service_requests set status = 'declined' where id = r.id;
  return jsonb_build_object('id', r.id, 'dismissed', true);
end $$;

create or replace function public.delete_vehicle_permanently(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_vin text;
begin
  if not private.can_delete_vehicle(p_id) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if exists (select 1 from public.vehicle_history h where h.vehicle_id = p_id and h.kind = 'job_complete')
     or exists (select 1 from public.service_requests q where q.vehicle_id = p_id and q.status = 'done')
     or exists (select 1 from public.service_records s where s.vehicle_id = p_id) then
    raise exception 'Completed jobs stay with this vehicle. Archive it instead of deleting it.'
      using errcode = 'P0001';
  end if;
  select private.norm_vin(vin) into v_vin from public.vehicles where id = p_id;
  delete from public.vehicle_coverage where vehicle_id = p_id or (v_vin is not null and vin_key = v_vin);
  delete from public.vehicles where id = p_id;
  return found;
end $$;

create or replace function private.documents_title_class() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'title'
     or coalesce(new.title, '') ~* '(^|[^a-z])title([^a-z]|$)'
     or coalesce(new.doc_category, '') ~* 'title' then
    new.kind := 'title';
  end if;
  return new;
end $$;
drop trigger if exists documents_title_class on public.documents;
create trigger documents_title_class before insert or update of kind, title, doc_category on public.documents
  for each row execute function private.documents_title_class();

revoke all on function public.set_co_owner_management(uuid, text), public.dismiss_removed_estimate(uuid) from public, anon;
grant execute on function public.set_co_owner_management(uuid, text), public.dismiss_removed_estimate(uuid),
  public.initiate_transfer(uuid, text), public.delete_vehicle_permanently(uuid) to authenticated;

commit;
