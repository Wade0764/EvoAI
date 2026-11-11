-- migration_003_managed_clients.sql  (NOT APPLIED. Review, then run ONCE in the Supabase SQL editor as postgres.)
-- Run after schema.sql + rls.sql + storage.sql (and optionally migration_001/002). Safe to run more than once.
-- Whole file is one transaction: if anything fails nothing changes.
--
-- PURPOSE: "Managed clients". A tech (or admin) can create a client who is NOT on the app yet (name, optional
-- email/phone/notes) and immediately add vehicles, service records, documents, photos, reminders for that client.
-- When the real client signs up (matching verified email) or redeems an invite code, all of that data moves
-- to their real account; the tech keeps access, now governed by the owner's permissions menu.
--
-- DESIGN: a managed client is a normal row in public.profiles (role 'owner') WITHOUT an auth user.
--   * profiles.id had a FK to auth.users. That FK is replaced by an equivalent trigger-enforced rule
--     ("must exist in auth.users unless managed") + a trigger on auth.users that deletes the profile (old ON DELETE CASCADE).
--   * new columns on profiles: managed, managed_by (tech), claimed_by (real account), claimed_at, notes.
--   * every existing table keeps pointing at profiles(id), so vehicles/records/RLS/storage paths ({owner_id}/{vehicle_id}/...)
--     work unchanged. While the client is unclaimed, the managing tech is treated like the owner for that client's cars
--     (private.is_owner_or_admin); after the claim that power ends and the permissions menu applies.
--   * claim = re-point owner_id (vehicles, financials, expenses, reminders, advisories, tech_access, tech_permissions,
--     invites) from the placeholder to the real account. Files already in storage keep the old {placeholder_id}/ prefix
--     (access always follows vehicle_id, same as after a vehicle transfer); new uploads use the real owner id.
--
-- ROLLBACK NOTES (manual; only if no managed clients exist yet, or after you have deleted/claimed them):
--   1. delete from public.profiles where managed;   -- fails if cars remain (vehicles.owner_id is ON DELETE RESTRICT): move/delete those first
--   2. drop function public.create_managed_client(text,text,text,text), public.update_managed_client(uuid,text,text,text,text),
--      public.delete_managed_client(uuid), public.create_managed_client_invite(uuid,text), public.claim_managed_clients();
--      drop function private.claim_managed(uuid,uuid), private.claim_managed_by_email(uuid,uuid), private.is_managing_tech(uuid);
--   3. restore redeem_invite from schema.sql (the version in schema.sql has no managed logic);
--      restore private.forbid_change (schema.sql), private.is_owner_or_admin (schema.sql) and the vehicles_insert/update/delete policies (rls.sql).
--   4. drop trigger profiles_require_auth_user on public.profiles; drop trigger auth_users_delete_profile on auth.users;
--      drop function private.profiles_require_auth_user(), private.auth_user_deleted();
--   5. drop index profiles_email_lower_uq; create unique index profiles_email_lower_uq on public.profiles (lower(email)) where email is not null;
--      alter table public.profiles drop constraint profiles_managed_chk, drop column managed, drop column managed_by,
--        drop column claimed_by, drop column claimed_at, drop column notes;
--      alter table public.profiles add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;
--
-- RISKS (also in the report): (1) auto-claim by email trusts auth's verified email: keep "Confirm email" ON in Supabase Auth
--   (the function also requires auth.users.email_confirmed_at). (2) the managing tech can edit/delete that client's cars until
--   claimed (by design). (3) profiles.id no longer has a database FK to auth.users (trigger enforces it instead).

begin;

-- ---------------------------------------------------------------------------
-- 1. profiles: placeholder owners
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists managed    boolean not null default false;
alter table public.profiles add column if not exists managed_by uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists claimed_by uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists claimed_at timestamptz;
alter table public.profiles add column if not exists notes      text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_managed_chk' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_managed_chk check (
      (not managed or role = 'owner') and (notes is null or length(notes) <= 1000));
  end if;
end $$;

-- drop the FK profiles.id -> auth.users (whatever its name)
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.profiles'::regclass and contype = 'f' and confrelid = 'auth.users'::regclass loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;

-- same guarantee as the FK, for real (non-managed) profiles
create or replace function private.profiles_require_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not new.managed and not exists (select 1 from auth.users u where u.id = new.id) then
    raise exception 'profile % has no auth user', new.id using errcode = '23503';
  end if;
  return new;
end $$;
drop trigger if exists profiles_require_auth_user on public.profiles;
create trigger profiles_require_auth_user before insert on public.profiles
  for each row execute function private.profiles_require_auth_user();

-- replaces ON DELETE CASCADE from auth.users
create or replace function private.auth_user_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.profiles where id = old.id and not managed;
  return old;
end $$;
drop trigger if exists auth_users_delete_profile on auth.users;
create trigger auth_users_delete_profile after delete on auth.users
  for each row execute function private.auth_user_deleted();

-- managed rows may share an email with a real account (that is how the claim finds them)
drop index if exists public.profiles_email_lower_uq;
create unique index profiles_email_lower_uq on public.profiles (lower(email)) where email is not null and not managed;
create index if not exists profiles_managed_email_idx on public.profiles (lower(email)) where managed and claimed_by is null;
create index if not exists profiles_managed_by_idx on public.profiles (managed_by) where managed;

-- managed/claimed columns are not client-writable (existing column grant only covers display_name, phone, business_name, role)

-- ---------------------------------------------------------------------------
-- 2. owner_id may be re-pointed by the claim function only (definer role, flag set inside the function)
-- ---------------------------------------------------------------------------
create or replace function private.forbid_change() returns trigger
language plpgsql set search_path = '' as $$
declare c text;
begin
  foreach c in array tg_argv loop
    if to_jsonb(new) -> c is distinct from to_jsonb(old) -> c then
      if c = 'owner_id' and current_user not in ('authenticated','anon')
         and coalesce(current_setting('evoai.claiming', true), '') = '1' then
        continue;   -- private.claim_managed re-pointing a placeholder owner
      end if;
      raise exception 'column % is immutable on %', c, tg_table_name using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 3. access helpers: managing tech acts as owner for an UNCLAIMED managed client
-- ---------------------------------------------------------------------------
create or replace function private.is_managing_tech(p_owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_owner and p.managed and p.claimed_by is null and p.managed_by = auth.uid()
       and exists (select 1 from public.tech_access ta
                    where ta.tech_id = auth.uid() and ta.owner_id = p.id and ta.vehicle_id is null and ta.status = 'active'));
$$;

create or replace function private.is_owner_or_admin(p_vehicle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin() or private.is_vehicle_owner(p_vehicle)
      or exists (select 1 from public.vehicles v where v.id = p_vehicle and private.is_managing_tech(v.owner_id));
$$;

grant execute on function private.is_managing_tech(uuid), private.profiles_require_auth_user(), private.auth_user_deleted() to authenticated, service_role;

drop policy if exists vehicles_insert on public.vehicles;
create policy vehicles_insert on public.vehicles for insert to authenticated
  with check (owner_id = (select auth.uid()) or (select private.is_admin()) or private.is_client_tech(owner_id)
              or private.is_managing_tech(owner_id));
drop policy if exists vehicles_update on public.vehicles;
create policy vehicles_update on public.vehicles for update to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_admin()) or private.is_managing_tech(owner_id))
  with check (owner_id = (select auth.uid()) or (select private.is_admin()) or private.is_managing_tech(owner_id));
drop policy if exists vehicles_delete on public.vehicles;
create policy vehicles_delete on public.vehicles for delete to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_admin()) or private.is_managing_tech(owner_id));
-- Storage: no policy change needed. private.can_write_object / can_read_object / evoai_objects_delete call
-- private.is_owner_or_admin + private.tech_can, which now include the managing tech, and segment 1 of the path must equal the
-- vehicle's owner_id (= the managed profile id), i.e. {managed_owner_id}/{vehicle_id}/{file}.

-- ---------------------------------------------------------------------------
-- 4. RPCs for the tech side
-- ---------------------------------------------------------------------------
create or replace function public.create_managed_client(p_name text, p_email text default null, p_phone text default null, p_notes text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_id uuid := gen_random_uuid();
  v_access uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is null or v_role not in ('tech','admin') then raise exception 'only techs can add clients' using errcode = '42501'; end if;
  if v_name = '' or length(v_name) > 120 then raise exception 'name_required' using errcode = '22023'; end if;
  if v_email is not null and (length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if v_phone is not null and length(v_phone) > 40 then raise exception 'invalid_phone' using errcode = '22023'; end if;
  if v_notes is not null and length(v_notes) > 1000 then raise exception 'notes_too_long' using errcode = '22023'; end if;
  if (select count(*) from public.profiles where managed and managed_by = v_uid and claimed_by is null) >= 500 then
    raise exception 'too_many_managed_clients' using errcode = '54000';
  end if;
  if v_email is not null then
    -- a real client already using the app must be invited, not duplicated
    if exists (select 1 from public.profiles where not managed and role = 'owner' and lower(email) = v_email) then
      raise exception 'client_already_on_app' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.profiles where managed and claimed_by is null and managed_by = v_uid and lower(email) = v_email) then
      raise exception 'managed_client_exists' using errcode = 'P0001';
    end if;
  end if;

  insert into public.profiles (id, role, display_name, email, phone, managed, managed_by, notes)
  values (v_id, 'owner', v_name, v_email, v_phone, true, v_uid, v_notes);

  insert into public.tech_access (tech_id, owner_id, vehicle_id, status, client_origin, invited_by, accepted_at)
  values (v_uid, v_id, null, 'active', true, v_uid, now())
  returning id into v_access;   -- default tech_permissions row is created by trigger

  insert into public.audit_log (actor_id, action, entity_table, entity_id, owner_id, details)
  values (v_uid, 'managed_client_created', 'profiles', v_id, v_id, '{}'::jsonb);

  return jsonb_build_object('owner_id', v_id, 'tech_access_id', v_access, 'display_name', v_name, 'email', v_email);
end $$;

create or replace function public.update_managed_client(p_id uuid, p_name text, p_email text default null, p_phone text default null, p_notes text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if v_name = '' or length(v_name) > 120 then raise exception 'name_required' using errcode = '22023'; end if;
  if v_email is not null and (length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if length(coalesce(p_notes, '')) > 1000 or length(coalesce(p_phone, '')) > 40 then raise exception 'value_too_long' using errcode = '22023'; end if;
  update public.profiles
     set display_name = v_name, email = v_email, phone = nullif(btrim(coalesce(p_phone, '')), ''), notes = nullif(btrim(coalesce(p_notes, '')), '')
   where id = p_id and managed and claimed_by is null and (managed_by = auth.uid() or private.is_admin());
  if not found then raise exception 'managed client not found' using errcode = '42501'; end if;
end $$;

-- only while the client has no vehicles
create or replace function public.delete_managed_client(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = p_id and managed and claimed_by is null
                    and (managed_by = auth.uid() or private.is_admin())) then
    raise exception 'managed client not found' using errcode = '42501';
  end if;
  if exists (select 1 from public.vehicles where owner_id = p_id) then
    raise exception 'client_has_vehicles' using errcode = 'P0001';
  end if;
  delete from public.invites where owner_id = p_id;
  delete from public.profiles where id = p_id;   -- tech_access / tech_permissions cascade
end $$;

-- optional "Invite to app": a client_owner invite tied to the managed client (redeem_invite below claims the data)
create or replace function public.create_managed_client_invite(p_managed_id uuid, p_email text default null)
returns table (invite_id uuid, code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_id uuid;
  v_exp timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where id = p_managed_id and managed and claimed_by is null
                    and (managed_by = v_uid or private.is_admin())) then
    raise exception 'managed client not found' using errcode = '42501';
  end if;
  if (select count(*) from public.invites i
       where i.created_by = v_uid and i.redeemed_at is null and i.revoked_at is null and i.expires_at > now()) >= 50 then
    raise exception 'too_many_open_invites' using errcode = '54000';
  end if;
  v_code := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 32);
  insert into public.invites (code_hash, kind, created_by, owner_id, email)
  values (encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), 'client_owner', v_uid, p_managed_id,
          nullif(lower(btrim(coalesce(p_email, ''))), ''))
  returning id, invites.expires_at into v_id, v_exp;
  -- keep the code re-readable when migration_002 is applied
  if to_regclass('private.invite_codes') is not null then
    execute 'insert into private.invite_codes (invite_id, code) values ($1, $2)' using v_id, v_code;
  end if;
  return query select v_id, v_code, v_exp;
end $$;

-- ---------------------------------------------------------------------------
-- 5. claim: move everything from the placeholder to the real owner account
-- ---------------------------------------------------------------------------
create or replace function private.claim_managed(p_managed uuid, p_uid uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m public.profiles%rowtype;
  u public.profiles%rowtype;
  n_veh int;
begin
  select * into m from public.profiles where id = p_managed for update;
  if not found or not m.managed or m.claimed_by is not null then
    raise exception 'managed client not claimable' using errcode = 'P0001';
  end if;
  select * into u from public.profiles where id = p_uid for update;
  if not found or u.managed or u.role <> 'owner' then raise exception 'role_not_eligible' using errcode = '42501'; end if;
  if m.managed_by = p_uid then raise exception 'cannot_claim_own_client' using errcode = '42501'; end if;
  if exists (select 1 from public.vehicles a join public.vehicles b on a.vin = b.vin and a.vin is not null
              where a.owner_id = p_managed and b.owner_id = p_uid) then
    raise exception 'vin_conflict' using errcode = 'P0001';
  end if;

  perform set_config('evoai.claiming', '1', true);

  -- a live grant that would duplicate one the real owner already has: end the placeholder's copy
  update public.tech_access t set status = 'revoked', revoked_at = now(), revoked_by = p_uid
   where t.owner_id = p_managed and t.status in ('pending','active')
     and exists (select 1 from public.tech_access x
                  where x.owner_id = p_uid and x.tech_id = t.tech_id and x.status in ('pending','active')
                    and x.vehicle_id is not distinct from t.vehicle_id);

  update public.vehicles           set owner_id = p_uid where owner_id = p_managed;
  get diagnostics n_veh = row_count;
  update public.vehicle_financials set owner_id = p_uid where owner_id = p_managed;
  update public.expenses           set owner_id = p_uid where owner_id = p_managed;
  update public.reminders          set owner_id = p_uid where owner_id = p_managed;
  update public.advisories         set owner_id = p_uid where owner_id = p_managed;
  update public.tech_permissions   set owner_id = p_uid where owner_id = p_managed;
  update public.tech_access        set owner_id = p_uid, client_origin = true where owner_id = p_managed;
  update public.invites            set owner_id = p_uid where owner_id = p_managed and redeemed_at is null and revoked_at is null;

  update public.profiles set claimed_by = p_uid, claimed_at = now() where id = p_managed;
  -- fill blanks on the real profile from what the tech entered (never overwrite)
  update public.profiles set phone = coalesce(phone, m.phone) where id = p_uid;

  insert into public.audit_log (actor_id, action, entity_table, entity_id, owner_id, details)
  values (p_uid, 'managed_client_claimed', 'profiles', p_managed, p_uid, jsonb_build_object('vehicles', n_veh, 'managed_by', m.managed_by));

  return jsonb_build_object('managed_id', p_managed, 'owner_id', p_uid, 'vehicles', n_veh, 'tech_id', m.managed_by);
end $$;

-- claim every unclaimed managed client whose email equals the caller's VERIFIED email (optionally only one tech's)
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
            where managed and claimed_by is null and lower(email) = v_email and managed_by is distinct from p_uid
              and (p_tech is null or managed_by = p_tech)
            order by created_at loop
    begin
      res := res || jsonb_build_array(private.claim_managed(r.id, p_uid));
    exception when others then
      -- one bad record (e.g. vin_conflict) must not block sign-in; it stays unclaimed for a manual invite
      insert into public.audit_log (actor_id, action, entity_table, entity_id, owner_id, details)
      values (p_uid, 'managed_client_claim_failed', 'profiles', r.id, p_uid, jsonb_build_object('error', sqlerrm));
    end;
  end loop;
  return res;
end $$;

-- called by the app after every sign-in (cheap no-op when nothing matches)
create or replace function public.claim_managed_clients() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  r := private.claim_managed_by_email(auth.uid(), null);
  return jsonb_build_object('claimed', r, 'count', jsonb_array_length(r));
end $$;

-- ---------------------------------------------------------------------------
-- 6. redeem_invite: schema.sql version + managed claim (see marked block)
-- ---------------------------------------------------------------------------
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


-- ---------------------------------------------------------------------------
-- 7. grants
-- ---------------------------------------------------------------------------
revoke execute on function private.claim_managed(uuid, uuid), private.claim_managed_by_email(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.create_managed_client(text, text, text, text), public.update_managed_client(uuid, text, text, text, text),
  public.delete_managed_client(uuid), public.create_managed_client_invite(uuid, text), public.claim_managed_clients() from public, anon;
grant execute on function public.create_managed_client(text, text, text, text), public.update_managed_client(uuid, text, text, text, text),
  public.delete_managed_client(uuid), public.create_managed_client_invite(uuid, text), public.claim_managed_clients() to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;

commit;
