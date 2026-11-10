-- EVOai cloud schema (Supabase / Postgres 15+). DESIGN ONLY - not applied to any live project.
-- Run order: schema.sql -> rls.sql -> storage.sql  (seed_test.sql only on throwaway/test DBs)
-- No secrets in this file. Helper functions live in schema "private" (not exposed by PostgREST).

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Generic trigger helpers
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Raise if any listed column changes (args = column names). Used for immutability.
create or replace function private.forbid_change() returns trigger
language plpgsql set search_path = '' as $$
declare c text;
begin
  foreach c in array tg_argv loop
    if to_jsonb(new) -> c is distinct from to_jsonb(old) -> c then
      raise exception 'column % is immutable on %', c, tg_table_name using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- profiles  (1:1 with auth.users). Role is never taken from client input.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         text not null default 'owner' check (role in ('admin','tech','owner')),
  display_name text,
  email        text,
  phone        text,
  business_name text,                       -- techs: shop / business
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index profiles_email_lower_uq on public.profiles (lower(email)) where email is not null;
create index profiles_role_idx on public.profiles (role);

-- New auth user => profile with role 'owner' ALWAYS (ignores user-supplied metadata).
-- Promotion to tech happens only by redeeming a tech invite; admin only via SQL by a DB admin.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Role is writable only by admins / DB-level callers (service role, SQL editor, definer functions).
create or replace function private.guard_profile_role() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.role is distinct from old.role
     and current_user in ('authenticated','anon')
     and not private.is_admin() then
    raise exception 'role can only be changed by an admin' using errcode = '42501';
  end if;
  if new.id is distinct from old.id then
    raise exception 'id is immutable' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- vehicles
-- ---------------------------------------------------------------------------
create table public.vehicles (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles(id) on delete restrict,
  year           int  check (year between 1885 and 2100),
  make           text not null,
  model          text not null,
  color          text,
  nickname       text,
  vin            text check (vin is null or vin ~ '^[A-Z0-9]{5,25}$'),  -- pre-1981 VINs are shorter
  plate          text,
  plate_region   text,
  mileage        int  check (mileage is null or mileage >= 0),
  archived       boolean not null default false,
  archived_at    timestamptz,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index vehicles_owner_idx on public.vehicles (owner_id) where not archived;
create index vehicles_owner_all_idx on public.vehicles (owner_id);
create unique index vehicles_owner_vin_uq on public.vehicles (owner_id, vin) where vin is not null;

-- Purchase price/date live in an OWNER-ONLY table (RLS can't hide columns of a row techs may read).
-- Techs read it only with tech_permissions.view_purchase_info. Writes: owner/admin only.
create table public.vehicle_financials (
  vehicle_id     uuid primary key references public.vehicles(id) on delete cascade,
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  purchase_price numeric(12,2) check (purchase_price is null or purchase_price >= 0),
  purchase_date  date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index vehicle_financials_owner_idx on public.vehicle_financials (owner_id);

-- owner_id may only change through the transfer function (definer) or service role.
create or replace function private.guard_vehicle_owner() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.owner_id is distinct from old.owner_id and current_user in ('authenticated','anon') then
    raise exception 'owner_id can only change via transfer' using errcode = '42501';
  end if;
  if new.archived and not old.archived then new.archived_at := coalesce(new.archived_at, now()); end if;
  if not new.archived then new.archived_at := null; end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- tech_access: vehicle-scoped (vehicle_id set) or owner-scoped (vehicle_id null = all that owner's cars)
-- Written only by definer functions (redeem_invite / revoke_tech_access). Revoke = row kept, status flips.
-- ---------------------------------------------------------------------------
create table public.tech_access (
  id          uuid primary key default gen_random_uuid(),
  tech_id     uuid not null references public.profiles(id) on delete cascade,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  vehicle_id  uuid references public.vehicles(id) on delete cascade,
  status      text not null default 'active' check (status in ('pending','active','revoked')),
  client_origin boolean not null default false,   -- true when the tech brought this owner as a client
  invited_by  uuid references public.profiles(id) on delete set null,
  invite_id   uuid,                               -- FK added after invites
  accepted_at timestamptz,
  revoked_at  timestamptz,
  revoked_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (tech_id <> owner_id),
  check ((status = 'revoked') = (revoked_at is not null))
);
create unique index tech_access_live_uq
  on public.tech_access (tech_id, owner_id, coalesce(vehicle_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status in ('pending','active');
create index tech_access_tech_idx  on public.tech_access (tech_id, status);
create index tech_access_owner_idx on public.tech_access (owner_id, status);
create index tech_access_vehicle_idx on public.tech_access (vehicle_id) where vehicle_id is not null;

-- ---------------------------------------------------------------------------
-- tech_permissions: what a tech may see/do, per tech_access grant.
--   vehicle_id NULL     = the grant's default row (exactly one per grant, created by trigger with safe defaults)
--   vehicle_id NOT NULL = optional per-vehicle OVERRIDE (full set of toggles; only for a vehicle the grant covers)
-- Effective permissions for (grant, vehicle) = override row if present, else the default row.
-- Several live grants covering the same vehicle => OR of them. Owner/admin always have everything.
-- NO client write grants: only public.set_tech_permission / reset_tech_permission_override (owner or admin).
-- ---------------------------------------------------------------------------
create table public.tech_permissions (
  id          uuid primary key default gen_random_uuid(),
  access_id   uuid not null references public.tech_access(id) on delete cascade,
  tech_id     uuid not null references public.profiles(id) on delete cascade,   -- denormalised, immutable
  owner_id    uuid not null references public.profiles(id) on delete cascade,   -- denormalised, immutable (audit)
  vehicle_id  uuid references public.vehicles(id) on delete cascade,
  view_service_records  boolean not null default true,
  view_expenses         boolean not null default false,
  view_documents        boolean not null default true,   -- owner_only documents stay hidden regardless
  view_reminders        boolean not null default true,
  view_value_estimate   boolean not null default false,
  view_health_estimate  boolean not null default true,
  view_purchase_info    boolean not null default false,
  view_photos           boolean not null default true,
  can_add_service       boolean not null default true,
  can_add_documents     boolean not null default true,
  can_add_expenses      boolean not null default false,
  can_create_advisories boolean not null default true,
  updated_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index tech_permissions_uq on public.tech_permissions
  (access_id, coalesce(vehicle_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index tech_permissions_tech_idx  on public.tech_permissions (tech_id);
create index tech_permissions_owner_idx on public.tech_permissions (owner_id);
create index tech_permissions_vehicle_idx on public.tech_permissions (vehicle_id) where vehicle_id is not null;

-- every grant gets a default permission row automatically (also for rows inserted by seed/service role)
create or replace function private.tech_access_default_permissions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.tech_permissions (access_id, tech_id, owner_id) values (new.id, new.tech_id, new.owner_id)
  on conflict do nothing;
  return new;
end $$;
create trigger tech_access_default_permissions after insert on public.tech_access
  for each row execute function private.tech_access_default_permissions();

-- ---------------------------------------------------------------------------
-- service_records (stay with the car)
-- ---------------------------------------------------------------------------
create table public.service_records (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid not null references public.vehicles(id) on delete cascade,
  created_by   uuid not null references public.profiles(id) on delete restrict,
  title        text not null,
  description  text,
  category     text check (category in ('maintenance','repair','inspection','detail','modification','other')),
  performed_on date not null default current_date,
  mileage      int check (mileage is null or mileage >= 0),
  cost         numeric(12,2) check (cost is null or cost >= 0),
  shop_name    text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index service_records_vehicle_idx on public.service_records (vehicle_id, performed_on desc);
create index service_records_creator_idx on public.service_records (created_by);

-- ---------------------------------------------------------------------------
-- expenses (owner-private: techs never see). owner_id derived from vehicle by trigger.
-- ---------------------------------------------------------------------------
create table public.expenses (
  id         uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  category   text not null check (category in ('fuel','insurance','registration','storage','maintenance','repair','parts','modification','detailing','tax','other')),
  amount     numeric(12,2) not null check (amount >= 0),
  incurred_on date not null default current_date,
  vendor     text,
  notes      text,
  service_record_id uuid references public.service_records(id) on delete set null,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,  -- who added it (tech with can_add_expenses, or owner)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index expenses_vehicle_idx on public.expenses (vehicle_id, incurred_on desc);
create index expenses_owner_idx   on public.expenses (owner_id);

-- ---------------------------------------------------------------------------
-- documents (metadata; file lives in private bucket 'vehicle-documents')
-- path convention: {owner_id}/{vehicle_id}/{filename}
-- ---------------------------------------------------------------------------
create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  vehicle_id    uuid not null references public.vehicles(id) on delete cascade,
  uploaded_by   uuid not null references public.profiles(id) on delete restrict,
  kind          text not null default 'other' check (kind in ('invoice','receipt','title','registration','insurance','inspection','manual','photo','pdf','other')),
  title         text not null,
  storage_path  text not null unique,
  mime_type     text,
  size_bytes    bigint check (size_bytes is null or size_bytes >= 0),
  service_record_id uuid references public.service_records(id) on delete set null,
  owner_only    boolean not null default false,   -- hidden from techs (e.g. insurance, title)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (split_part(storage_path,'/',3) <> ''),
  check (split_part(storage_path,'/',2) = vehicle_id::text)
);
create index documents_vehicle_idx on public.documents (vehicle_id, created_at desc);
create index documents_uploader_idx on public.documents (uploaded_by);
create index documents_service_idx on public.documents (service_record_id) where service_record_id is not null;

-- ---------------------------------------------------------------------------
-- vehicle_photos (bucket 'vehicle-photos')
-- ---------------------------------------------------------------------------
create table public.vehicle_photos (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid not null references public.vehicles(id) on delete cascade,
  uploaded_by  uuid not null references public.profiles(id) on delete restrict,
  storage_path text not null unique,
  caption      text,
  is_cover     boolean not null default false,
  sort_order   int not null default 0,
  taken_at     timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (split_part(storage_path,'/',3) <> ''),
  check (split_part(storage_path,'/',2) = vehicle_id::text)
);
create index vehicle_photos_vehicle_idx on public.vehicle_photos (vehicle_id, sort_order);
create unique index vehicle_photos_one_cover_uq on public.vehicle_photos (vehicle_id) where is_cover;
create index vehicle_photos_uploader_idx on public.vehicle_photos (uploaded_by);

-- Validate that first path segment == the vehicle's CURRENT owner at registration time.
-- (After a transfer old files keep the old prefix; access always follows vehicle_id, never the prefix.)
create or replace function private.validate_storage_path() returns trigger
language plpgsql set search_path = '' as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.vehicles where id = new.vehicle_id;
  if v_owner is null or split_part(new.storage_path,'/',1) <> v_owner::text then
    raise exception 'storage_path must start with {owner_id}/{vehicle_id}/' using errcode = '23514';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- reminders (owner-only)
-- ---------------------------------------------------------------------------
create table public.reminders (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.vehicles(id) on delete cascade,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('tag','insurance','inspection','service','custom')),
  title       text not null,
  notes       text,
  due_date    date,
  due_mileage int check (due_mileage is null or due_mileage >= 0),
  remind_days_before   int not null default 14 check (remind_days_before >= 0),
  remind_miles_before  int not null default 500 check (remind_miles_before >= 0),
  renotify_every_days  int not null default 7  check (renotify_every_days >= 1),
  repeat_months int check (repeat_months is null or repeat_months > 0),
  repeat_miles  int check (repeat_miles  is null or repeat_miles  > 0),
  snoozed_until date,
  last_notified_at timestamptz,
  completed_at timestamptz,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (due_date is not null or due_mileage is not null)
);
create index reminders_owner_idx on public.reminders (owner_id);
create index reminders_vehicle_idx on public.reminders (vehicle_id);
create index reminders_due_idx on public.reminders (due_date) where completed_at is null;

-- ---------------------------------------------------------------------------
-- advisories (tech -> owner)
-- ---------------------------------------------------------------------------
create table public.advisories (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.vehicles(id) on delete cascade,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  from_tech_id uuid not null references public.profiles(id) on delete restrict,
  title       text not null,
  body        text,
  severity    text not null default 'recommended' check (severity in ('info','recommended','urgent')),
  estimated_cost numeric(12,2) check (estimated_cost is null or estimated_cost >= 0),
  status      text not null default 'pending' check (status in ('pending','accepted','declined','completed')),
  owner_response text,
  responded_at timestamptz,
  completed_at timestamptz,
  completed_service_record_id uuid references public.service_records(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index advisories_vehicle_idx on public.advisories (vehicle_id, status);
create index advisories_owner_idx on public.advisories (owner_id, status);
create index advisories_tech_idx on public.advisories (from_tech_id);

-- State machine + field restrictions for non-privileged callers.
create or replace function private.guard_advisory_update() returns trigger
language plpgsql set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if current_user not in ('authenticated','anon') or private.is_admin() then
    return new;
  end if;
  if new.owner_id is distinct from old.owner_id or new.from_tech_id is distinct from old.from_tech_id
     or new.vehicle_id is distinct from old.vehicle_id then
    raise exception 'advisory ownership fields are immutable' using errcode = '42501';
  end if;
  if v_uid = old.owner_id then
    -- owner may not rewrite the tech's content
    if new.title is distinct from old.title or new.body is distinct from old.body
       or new.severity is distinct from old.severity or new.estimated_cost is distinct from old.estimated_cost then
      raise exception 'owner cannot edit advisory content' using errcode = '42501';
    end if;
  elsif v_uid = old.from_tech_id then
    -- tech may edit content only while pending; may never touch owner_response
    if (new.title is distinct from old.title or new.body is distinct from old.body
        or new.severity is distinct from old.severity or new.estimated_cost is distinct from old.estimated_cost)
       and old.status <> 'pending' then
      raise exception 'advisory content locked after response' using errcode = '42501';
    end if;
    if new.owner_response is distinct from old.owner_response then
      raise exception 'only the owner can respond' using errcode = '42501';
    end if;
  end if;
  if new.status is distinct from old.status then
    if old.status = 'pending' and new.status in ('accepted','declined') and v_uid = old.owner_id then
      new.responded_at := now();
    elsif old.status = 'accepted' and new.status = 'completed' then
      new.completed_at := now();            -- owner or the advising tech
    else
      raise exception 'illegal advisory transition % -> % for this user', old.status, new.status using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- invites (single-use, 14 days). Only the SHA-256 hash of the code is stored.
-- ---------------------------------------------------------------------------
create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  code_hash   text not null unique,
  kind        text not null check (kind in ('tech_vehicle','tech_owner','client_owner','transfer')),
  created_by  uuid not null references public.profiles(id) on delete cascade,
  owner_id    uuid references public.profiles(id) on delete cascade,   -- owner the access/transfer is about
  vehicle_id  uuid references public.vehicles(id) on delete cascade,
  transfer_id uuid,                                                    -- FK added after transfers
  email       text,                                                    -- optional lock to one email (lowercased)
  expires_at  timestamptz not null default (now() + interval '14 days'),
  redeemed_by uuid references public.profiles(id) on delete set null,
  redeemed_at timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  check ((kind = 'tech_vehicle') = (vehicle_id is not null and transfer_id is null) or kind = 'transfer'),
  check ((redeemed_at is null) = (redeemed_by is null))
);
create index invites_created_by_idx on public.invites (created_by, created_at desc);
create index invites_open_idx on public.invites (expires_at) where redeemed_at is null and revoked_at is null;
create index invites_vehicle_idx on public.invites (vehicle_id) where vehicle_id is not null;

alter table public.tech_access
  add constraint tech_access_invite_fk foreign key (invite_id) references public.invites(id) on delete set null;
create index tech_access_invite_idx on public.tech_access (invite_id) where invite_id is not null;

-- ---------------------------------------------------------------------------
-- transfers (seller -> buyer) + seller's read-only archive snapshot
-- ---------------------------------------------------------------------------
create table public.transfers (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.vehicles(id) on delete cascade,
  seller_id   uuid not null references public.profiles(id) on delete restrict,
  buyer_id    uuid references public.profiles(id) on delete restrict,
  status      text not null default 'pending' check (status in ('pending','completed','cancelled','expired')),
  buyer_email text,
  expires_at  timestamptz not null default (now() + interval '14 days'),
  completed_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (buyer_id is null or buyer_id <> seller_id),
  check ((status = 'completed') = (completed_at is not null and buyer_id is not null))
);
create unique index transfers_one_pending_uq on public.transfers (vehicle_id) where status = 'pending';
create index transfers_seller_idx on public.transfers (seller_id);
create index transfers_buyer_idx on public.transfers (buyer_id) where buyer_id is not null;

alter table public.invites
  add constraint invites_transfer_fk foreign key (transfer_id) references public.transfers(id) on delete cascade;
create index invites_transfer_idx on public.invites (transfer_id) where transfer_id is not null;

create table public.vehicle_archives (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,   -- the seller; sole reader
  source_vehicle_id uuid not null,                                              -- no FK: car lives on with buyer
  transfer_id uuid references public.transfers(id) on delete set null,
  label       text not null,
  snapshot    jsonb not null,
  created_at  timestamptz not null default now()
);
create index vehicle_archives_owner_idx on public.vehicle_archives (owner_id, created_at desc);
create index vehicle_archives_transfer_idx on public.vehicle_archives (transfer_id) where transfer_id is not null;

-- ---------------------------------------------------------------------------
-- ai_estimates: written ONLY by service role (no client grants / policies exist for writes)
-- ---------------------------------------------------------------------------
create table public.ai_estimates (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.vehicles(id) on delete cascade,
  kind        text not null check (kind in ('value','health')),
  value_low   numeric(12,2),
  value_high  numeric(12,2),
  currency    text default 'USD',
  confidence  numeric(4,3) check (confidence is null or confidence between 0 and 1),
  sources     jsonb not null default '[]'::jsonb,
  health_score int check (health_score is null or health_score between 0 and 100),
  reasons     jsonb not null default '[]'::jsonb,
  model_version text,
  as_of       timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  check (kind <> 'value'  or (value_low is not null and value_high is not null and value_low <= value_high)),
  check (kind <> 'health' or health_score is not null)
);
create index ai_estimates_latest_idx on public.ai_estimates (vehicle_id, kind, as_of desc);

-- ---------------------------------------------------------------------------
-- audit_log (append-only; written by triggers/definer functions only)
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,                 -- auth.uid(); null = service role / DB
  action      text not null,        -- e.g. insert/update/delete or named action (invite_redeemed, transfer_completed)
  entity_table text not null,
  entity_id   uuid,
  vehicle_id  uuid,
  owner_id    uuid,                 -- affected owner, used for owner-visible history
  details     jsonb not null default '{}'::jsonb,   -- changed column NAMES only, never values/codes
  created_at  timestamptz not null default now()
);
create index audit_log_owner_idx   on public.audit_log (owner_id, created_at desc);
create index audit_log_vehicle_idx on public.audit_log (vehicle_id, created_at desc);
create index audit_log_actor_idx   on public.audit_log (actor_id, created_at desc);

create or replace function private.audit_block_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_log is append-only' using errcode = '42501';
end $$;
create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function private.audit_block_mutation();

create or replace function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r jsonb; o jsonb; changed jsonb := '[]'::jsonb; v_owner uuid; v_vehicle uuid;
begin
  if tg_op = 'DELETE' then r := to_jsonb(old); else r := to_jsonb(new); end if;
  if tg_op = 'UPDATE' then
    o := to_jsonb(old);
    select coalesce(jsonb_agg(k), '[]'::jsonb) into changed
      from jsonb_each(r) e(k, v) where o -> k is distinct from v and k <> 'updated_at';
    if changed = '[]'::jsonb then return new; end if;
  end if;
  v_vehicle := case tg_table_name when 'vehicles' then (r ->> 'id')::uuid else nullif(r ->> 'vehicle_id','')::uuid end;
  v_owner := coalesce(nullif(r ->> 'owner_id','')::uuid, nullif(r ->> 'seller_id','')::uuid);
  if v_owner is null and v_vehicle is not null then
    select owner_id into v_owner from public.vehicles where id = v_vehicle;
  end if;
  insert into public.audit_log (actor_id, action, entity_table, entity_id, vehicle_id, owner_id, details)
  values (auth.uid(), lower(tg_op), tg_table_name, (r ->> 'id')::uuid, v_vehicle, v_owner,
          jsonb_build_object('changed', changed));
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------------
-- Access helper functions (SECURITY DEFINER, used by RLS + storage policies)
-- All take auth.uid() from the JWT; they never trust a caller-supplied user id.
-- ---------------------------------------------------------------------------
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

create or replace function private.is_vehicle_owner(p_vehicle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vehicles v where v.id = p_vehicle and v.owner_id = auth.uid());
$$;

create or replace function private.is_owner_or_admin(p_vehicle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin() or private.is_vehicle_owner(p_vehicle);
$$;

-- active tech access to this vehicle (vehicle-scoped, or owner-scoped for the vehicle's current owner)
create or replace function private.has_active_tech_access(p_vehicle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.vehicles v
    join public.tech_access ta on ta.tech_id = auth.uid() and ta.status = 'active'
     and (ta.vehicle_id = v.id or (ta.vehicle_id is null and ta.owner_id = v.owner_id))
    where v.id = p_vehicle);
$$;

-- tech holding active OWNER-scoped access (may create vehicles for that client)
create or replace function private.is_client_tech(p_owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tech_access ta
                 where ta.tech_id = auth.uid() and ta.owner_id = p_owner
                   and ta.vehicle_id is null and ta.status = 'active');
$$;

create or replace function private.can_read_vehicle(p_vehicle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin() or private.is_vehicle_owner(p_vehicle) or private.has_active_tech_access(p_vehicle);
$$;

-- techs cannot write to archived vehicles; owner/admin always can
create or replace function private.can_write_vehicle(p_vehicle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_owner_or_admin(p_vehicle)
      or (private.has_active_tech_access(p_vehicle)
          and exists (select 1 from public.vehicles v where v.id = p_vehicle and not v.archived));
$$;

-- Does the caller hold permission p_perm on p_vehicle?  owner/admin => always true.
-- Tech => true iff some ACTIVE grant covering the vehicle has the toggle on (per-vehicle override wins over the grant default).
-- Unknown permission names => false (whitelist).
create or replace function private.tech_can(p_vehicle uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_owner_or_admin(p_vehicle)
      or (p_perm in ('view_service_records','view_expenses','view_documents','view_reminders','view_value_estimate',
                     'view_health_estimate','view_purchase_info','view_photos','can_add_service','can_add_documents',
                     'can_add_expenses','can_create_advisories')
          and exists (
            select 1
            from public.vehicles v
            join public.tech_access ta on ta.tech_id = auth.uid() and ta.status = 'active'
             and (ta.vehicle_id = v.id or (ta.vehicle_id is null and ta.owner_id = v.owner_id))
            join lateral (select tp.* from public.tech_permissions tp
                           where tp.access_id = ta.id and (tp.vehicle_id = v.id or tp.vehicle_id is null)
                           order by tp.vehicle_id nulls last limit 1) p on true
            where v.id = p_vehicle and coalesce((to_jsonb(p) ->> p_perm)::boolean, false)));
$$;

-- profile visibility for counterparties with ACTIVE access (revoked => invisible)
create or replace function private.shares_access(p_profile uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tech_access ta
                 where ta.status = 'active'
                   and ((ta.tech_id = auth.uid() and ta.owner_id = p_profile)
                     or (ta.owner_id = auth.uid() and ta.tech_id = p_profile)));
$$;

-- child rows: derive owner_id from the vehicle; vehicle_id/owner_id immutable
create or replace function private.set_owner_from_vehicle() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select owner_id into new.owner_id from public.vehicles where id = new.vehicle_id;
  if new.owner_id is null then raise exception 'vehicle not found' using errcode = '23503'; end if;
  return new;
end $$;

-- keep vehicle odometer monotonic from service records
create or replace function private.bump_vehicle_mileage() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.mileage is not null then
    update public.vehicles set mileage = new.mileage
     where id = new.vehicle_id and (mileage is null or mileage < new.mileage);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','vehicles','tech_access','service_records','expenses','documents',
                           'vehicle_photos','reminders','advisories','transfers','vehicle_financials','tech_permissions'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()',
                   t || '_set_updated_at', t);
  end loop;
end $$;

create trigger profiles_guard_role before update on public.profiles
  for each row execute function private.guard_profile_role();
create trigger vehicles_guard_owner before update on public.vehicles
  for each row execute function private.guard_vehicle_owner();

create trigger vehicle_financials_set_owner before insert on public.vehicle_financials
  for each row execute function private.set_owner_from_vehicle();
create trigger vehicle_financials_immutable before update on public.vehicle_financials
  for each row execute function private.forbid_change('vehicle_id','owner_id');
create trigger tech_permissions_immutable before update on public.tech_permissions
  for each row execute function private.forbid_change('access_id','tech_id','owner_id','vehicle_id');
create trigger expenses_set_owner before insert on public.expenses
  for each row execute function private.set_owner_from_vehicle();
create trigger reminders_set_owner before insert on public.reminders
  for each row execute function private.set_owner_from_vehicle();
create trigger advisories_set_owner before insert on public.advisories
  for each row execute function private.set_owner_from_vehicle();

create trigger service_records_immutable before update on public.service_records
  for each row execute function private.forbid_change('vehicle_id','created_by');
create trigger expenses_immutable before update on public.expenses
  for each row execute function private.forbid_change('vehicle_id','owner_id');
create trigger documents_immutable before update on public.documents
  for each row execute function private.forbid_change('vehicle_id','uploaded_by','storage_path');
create trigger vehicle_photos_immutable before update on public.vehicle_photos
  for each row execute function private.forbid_change('vehicle_id','uploaded_by','storage_path');
create trigger reminders_immutable before update on public.reminders
  for each row execute function private.forbid_change('vehicle_id','owner_id');
create trigger advisories_guard before update on public.advisories
  for each row execute function private.guard_advisory_update();

create trigger documents_validate_path before insert on public.documents
  for each row execute function private.validate_storage_path();
create trigger vehicle_photos_validate_path before insert on public.vehicle_photos
  for each row execute function private.validate_storage_path();

create trigger service_records_bump_mileage after insert on public.service_records
  for each row execute function private.bump_vehicle_mileage();

do $$
declare t text;
begin
  foreach t in array array['vehicles','tech_access','tech_permissions','vehicle_financials','service_records','documents','advisories','invites','transfers'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row()',
                   t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Invite functions
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
    select v.owner_id into v_owner from public.vehicles v where v.id = p_vehicle_id and v.owner_id = v_uid;
    if v_owner is null then raise exception 'not_vehicle_owner' using errcode = '42501'; end if;
  elsif p_kind = 'tech_owner' then
    if p_vehicle_id is not null then raise exception 'vehicle_id not allowed for tech_owner' using errcode = '22023'; end if;
    v_owner := v_uid;
  elsif p_kind = 'client_owner' then
    if v_role not in ('tech','admin') or p_vehicle_id is not null then
      raise exception 'only techs can invite clients' using errcode = '42501';
    end if;
    v_owner := null;
  else
    raise exception 'invalid invite kind (transfers use initiate_transfer)' using errcode = '22023';
  end if;

  v_code := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 32);  -- CSPRNG, ~128 bits
  insert into public.invites (code_hash, kind, created_by, owner_id, vehicle_id, email)
  values (encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), p_kind, v_uid, v_owner,
          case when p_kind = 'tech_vehicle' then p_vehicle_id end, nullif(lower(btrim(p_email)), ''))
  returning id, invites.expires_at into v_id, v_exp;

  return query select v_id, v_code, v_exp;   -- plaintext code is returned ONCE and never stored
end $$;

create or replace function private.complete_transfer(p_transfer uuid, p_buyer uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t public.transfers%rowtype;
  v public.vehicles%rowtype;
  v_snapshot jsonb;
  v_archive uuid;
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
    'vehicle', to_jsonb(v),
    'financials', coalesce((select to_jsonb(f) - 'created_at' - 'updated_at' from public.vehicle_financials f where f.vehicle_id = v.id), '{}'::jsonb),
    'service_records', coalesce((select jsonb_agg(to_jsonb(s) order by s.performed_on) from public.service_records s where s.vehicle_id = v.id), '[]'::jsonb),
    'expenses',        coalesce((select jsonb_agg(to_jsonb(e) order by e.incurred_on)  from public.expenses e where e.vehicle_id = v.id), '[]'::jsonb),
    'reminders',       coalesce((select jsonb_agg(to_jsonb(r)) from public.reminders r where r.vehicle_id = v.id), '[]'::jsonb),
    'documents',       coalesce((select jsonb_agg(to_jsonb(d) - 'storage_path') from public.documents d where d.vehicle_id = v.id), '[]'::jsonb),
    'photos',          coalesce((select jsonb_agg(to_jsonb(p) - 'storage_path') from public.vehicle_photos p where p.vehicle_id = v.id), '[]'::jsonb),
    'advisories',      coalesce((select jsonb_agg(to_jsonb(a)) from public.advisories a where a.vehicle_id = v.id), '[]'::jsonb)
  );

  insert into public.vehicle_archives (owner_id, source_vehicle_id, transfer_id, label, snapshot)
  values (t.seller_id, v.id, t.id,
          btrim(concat_ws(' ', v.year::text, v.make, v.model, case when v.nickname is not null then '"' || v.nickname || '"' end)),
          v_snapshot)
  returning id into v_archive;

  -- seller-private data does not follow the car
  delete from public.expenses  where vehicle_id = v.id;
  delete from public.reminders where vehicle_id = v.id;
  delete from public.vehicle_financials where vehicle_id = v.id;
  -- seller's techs lose access to this car; pending advisories closed; other open invites for it killed
  update public.tech_access set status = 'revoked', revoked_at = now(), revoked_by = t.seller_id
   where vehicle_id = v.id and status in ('pending','active');
  update public.advisories set status = 'declined', owner_response = 'Vehicle transferred', responded_at = now()
   where vehicle_id = v.id and status = 'pending';
  update public.invites set revoked_at = now()
   where vehicle_id = v.id and redeemed_at is null and revoked_at is null and kind <> 'transfer';

  update public.vehicles
     set owner_id = p_buyer, archived = false
   where id = v.id;

  update public.transfers set status = 'completed', buyer_id = p_buyer, completed_at = now() where id = t.id;

  insert into public.audit_log (actor_id, action, entity_table, entity_id, vehicle_id, owner_id, details)
  values (p_buyer, 'transfer_completed', 'transfers', t.id, v.id, t.seller_id,
          jsonb_build_object('seller', t.seller_id, 'buyer', p_buyer, 'archive_id', v_archive));
  insert into public.audit_log (actor_id, action, entity_table, entity_id, vehicle_id, owner_id, details)
  values (p_buyer, 'transfer_received', 'transfers', t.id, v.id, p_buyer, jsonb_build_object('seller', t.seller_id));

  return jsonb_build_object('kind','transfer','vehicle_id', v.id, 'archive_id', v_archive, 'owner_id', p_buyer);
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

  return jsonb_build_object('kind', inv.kind, 'tech_access_id', v_access, 'owner_id', v_owner,
                            'vehicle_id', inv.vehicle_id, 'tech_id', v_tech);
end $$;

create or replace function public.revoke_invite(p_invite_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.invites set revoked_at = now()
   where id = p_invite_id and redeemed_at is null and revoked_at is null
     and (created_by = auth.uid() or private.is_admin());
  if not found then raise exception 'invite not found or not revocable' using errcode = '42501'; end if;
end $$;

-- Owner (or the tech themself, or admin) ends access. Row stays (history); access ends immediately.
create or replace function public.revoke_tech_access(p_access_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ta public.tech_access%rowtype;
begin
  select * into ta from public.tech_access where id = p_access_id for update;
  if not found or not (ta.owner_id = auth.uid() or ta.tech_id = auth.uid() or private.is_admin()) then
    raise exception 'access grant not found' using errcode = '42501';
  end if;
  if ta.status <> 'revoked' then
    update public.tech_access set status = 'revoked', revoked_at = now(), revoked_by = auth.uid() where id = ta.id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Transfers
-- ---------------------------------------------------------------------------
create or replace function public.initiate_transfer(p_vehicle_id uuid, p_buyer_email text default null)
returns table (transfer_id uuid, code text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_code text; v_tid uuid; v_exp timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.vehicles where id = p_vehicle_id and owner_id = v_uid) then
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
   where id = p_transfer_id and status = 'pending' and (seller_id = auth.uid() or private.is_admin());
  if not found then raise exception 'transfer not found or not cancellable' using errcode = '42501'; end if;
  update public.invites set revoked_at = now() where transfer_id = p_transfer_id and redeemed_at is null and revoked_at is null;
end $$;

-- ---------------------------------------------------------------------------
-- Reminders: due list for a future cron (service role / pg_cron only), notified marker, completion w/ repeat
-- ---------------------------------------------------------------------------
create or replace function public.due_reminders(p_as_of date default current_date, p_limit int default 1000)
returns table (reminder_id uuid, vehicle_id uuid, owner_id uuid, owner_email text, owner_name text, kind text, title text,
               due_date date, due_mileage int, current_mileage int, days_until_due int, overdue boolean, vehicle_label text)
language sql stable set search_path = '' as $$
  select r.id, r.vehicle_id, r.owner_id, p.email, p.display_name, r.kind, r.title, r.due_date, r.due_mileage, v.mileage,
         (r.due_date - p_as_of),
         coalesce(r.due_date < p_as_of, false) or coalesce(v.mileage >= r.due_mileage, false),
         btrim(concat_ws(' ', v.year::text, v.make, v.model, case when v.nickname is not null then '"' || v.nickname || '"' end))
  from public.reminders r
  join public.vehicles v on v.id = r.vehicle_id and not v.archived
  join public.profiles p on p.id = r.owner_id
  where r.completed_at is null
    and (r.snoozed_until is null or r.snoozed_until <= p_as_of)
    and ((r.due_date is not null and r.due_date - r.remind_days_before <= p_as_of)
      or (r.due_mileage is not null and v.mileage is not null and v.mileage >= r.due_mileage - r.remind_miles_before))
    and (r.last_notified_at is null or r.last_notified_at::date <= p_as_of - r.renotify_every_days)
  order by r.due_date nulls last, r.created_at
  limit greatest(p_limit, 0);
$$;

create or replace function public.mark_reminders_notified(p_ids uuid[]) returns int
language plpgsql set search_path = '' as $$
declare n int;
begin
  update public.reminders set last_notified_at = now() where id = any (p_ids);
  get diagnostics n = row_count;
  return n;
end $$;

-- SECURITY INVOKER: RLS applies, so only the owner/admin can complete.
create or replace function public.complete_reminder(p_id uuid, p_completed_on date default current_date, p_mileage int default null)
returns public.reminders
language plpgsql set search_path = '' as $$
declare r public.reminders%rowtype;
begin
  select * into r from public.reminders where id = p_id for update;
  if not found then raise exception 'reminder not found' using errcode = '42501'; end if;
  if r.repeat_months is null and r.repeat_miles is null then
    update public.reminders set completed_at = now() where id = p_id returning * into r;
  else
    update public.reminders set
      due_date = case when r.repeat_months is null then r.due_date
                      when r.kind in ('tag','insurance','inspection') and r.due_date is not null
                        then (r.due_date + make_interval(months => r.repeat_months))::date
                      else (p_completed_on + make_interval(months => r.repeat_months))::date end,
      due_mileage = case when r.repeat_miles is not null and p_mileage is not null then p_mileage + r.repeat_miles
                         else r.due_mileage end,
      last_notified_at = null, snoozed_until = null
    where id = p_id returning * into r;
  end if;
  return r;
end $$;

-- ---------------------------------------------------------------------------
-- Permission menu RPCs (owner/admin only) + visibility views
-- ---------------------------------------------------------------------------
-- Set ONE toggle on a grant. p_vehicle_id NULL => grant default; set => per-vehicle override
-- (allowed only if the grant covers that vehicle; the override row starts as a copy of the default).
-- Callable by the grant's owner or an admin. A tech can never change any permission, their own included.
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
  if not found or not (ta.owner_id = auth.uid() or private.is_admin()) then
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

-- Remove a per-vehicle override (vehicle falls back to the grant default).
create or replace function public.reset_tech_permission_override(p_access_id uuid, p_vehicle_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare ta public.tech_access%rowtype;
begin
  select * into ta from public.tech_access where id = p_access_id for update;
  if not found or not (ta.owner_id = auth.uid() or private.is_admin()) then
    raise exception 'access grant not found' using errcode = '42501';
  end if;
  if p_vehicle_id is null then raise exception 'vehicle_required' using errcode = '22004'; end if;
  delete from public.tech_permissions where access_id = ta.id and vehicle_id = p_vehicle_id;
end $$;

-- Effective permissions per (active grant, vehicle). security_invoker => RLS applies to the caller:
-- a tech sees only their own rows, an owner only their techs, admin everything. Use for the owner's permissions menu.
create or replace view public.tech_effective_permissions with (security_invoker = true) as
select ta.id as access_id, ta.tech_id, ta.owner_id, v.id as vehicle_id,
       ta.vehicle_id is null as owner_scoped, p.vehicle_id is not null as has_override,
       p.view_service_records, p.view_expenses, p.view_documents, p.view_reminders, p.view_value_estimate,
       p.view_health_estimate, p.view_purchase_info, p.view_photos,
       p.can_add_service, p.can_add_documents, p.can_add_expenses, p.can_create_advisories
from public.tech_access ta
join public.vehicles v on ta.vehicle_id = v.id or (ta.vehicle_id is null and ta.owner_id = v.owner_id)
join lateral (select tp.* from public.tech_permissions tp
               where tp.access_id = ta.id and (tp.vehicle_id = v.id or tp.vehicle_id is null)
               order by tp.vehicle_id nulls last limit 1) p on true
where ta.status = 'active';

-- "What can I (the signed-in tech) see right now": one row per vehicle, ORed across overlapping grants, with
-- a few vehicle labels. Strictly the caller's own grants. Owner_only documents are always hidden from techs.
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
       bool_or(e.can_create_advisories) as can_create_advisories
from public.tech_effective_permissions e
join public.vehicles v on v.id = e.vehicle_id
where e.tech_id = auth.uid()
group by e.vehicle_id, e.owner_id, v.year, v.make, v.model;
