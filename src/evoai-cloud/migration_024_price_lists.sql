-- migration_024_price_lists.sql
-- Tech price list and client service requests. NOT applied to the live project.
-- Idempotent. Run backup_024.sql first. Rollback: rollback_024.sql
-- Requires migrations through 023.
begin;

do $$ begin
  if to_regclass('public.service_requests') is null
     or to_regclass('public.tech_grant_vehicles') is null
     or to_regprocedure('private.grant_covers_vehicle(uuid,uuid)') is null then
    raise exception 'migration_024 needs migrations through 023 applied first';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Price list
-- ---------------------------------------------------------------------------
create table if not exists public.tech_price_lists (
  id uuid primary key default gen_random_uuid(),
  tech_id uuid not null unique references public.profiles(id) on delete cascade,
  website_url text,
  pay_url text,
  attested_at timestamptz,
  published_at timestamptz,
  draft_fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tech_price_lists_website_https check (website_url is null or website_url ~ '^https://[^[:space:]@]+'),
  constraint tech_price_lists_pay_https check (pay_url is null or pay_url ~ '^https://[^[:space:]@]+')
);

create table if not exists public.tech_services (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.tech_price_lists(id) on delete cascade,
  tech_id uuid not null references public.profiles(id) on delete cascade,
  lane text not null,
  category text not null,
  name text not null,
  description text,
  price_mode text not null,
  amount numeric(12,2),
  currency text,
  duration_label text,
  source_url text,
  needs_review boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tech_services_lane_chk check (lane in ('draft','live')),
  constraint tech_services_price_chk check (
    price_mode in ('fixed','from','on_request')
    and (
      (price_mode = 'on_request' and amount is null)
      or (price_mode in ('fixed','from') and amount is not null and amount >= 0 and amount < 100000000)
    )
  ),
  constraint tech_services_currency_chk check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint tech_services_name_chk check (char_length(btrim(name)) between 1 and 120),
  constraint tech_services_category_chk check (char_length(btrim(category)) between 1 and 40),
  constraint tech_services_desc_chk check (description is null or char_length(description) <= 500)
);
create index if not exists tech_services_list_lane on public.tech_services (list_id, lane, sort_order);

alter table public.tech_price_lists enable row level security;
alter table public.tech_price_lists force row level security;
alter table public.tech_services enable row level security;
alter table public.tech_services force row level security;
revoke all on public.tech_price_lists, public.tech_services from public, anon, authenticated;
grant select, insert, update, delete on public.tech_price_lists, public.tech_services to authenticated;

drop policy if exists tech_price_lists_select on public.tech_price_lists;
create policy tech_price_lists_select on public.tech_price_lists for select to authenticated
  using (
    tech_id = (select auth.uid())
    or (
      published_at is not null
      and exists (
        select 1 from public.tech_access ta
         where ta.tech_id = tech_price_lists.tech_id
           and ta.status = 'active'
           and private.is_collection_owner(ta.owner_id)
      )
    )
    or (select private.is_admin())
  );
drop policy if exists tech_price_lists_write on public.tech_price_lists;
create policy tech_price_lists_write on public.tech_price_lists for all to authenticated
  using (tech_id = (select auth.uid()) and exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('tech','admin')))
  with check (tech_id = (select auth.uid()) and exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('tech','admin')));

drop policy if exists tech_services_select on public.tech_services;
create policy tech_services_select on public.tech_services for select to authenticated
  using (
    tech_id = (select auth.uid())
    or (
      lane = 'live'
      and exists (
        select 1 from public.tech_access ta
         where ta.tech_id = tech_services.tech_id
           and ta.status = 'active'
           and private.is_collection_owner(ta.owner_id)
      )
    )
    or (select private.is_admin())
  );
-- Direct writes may create drafts only. Live rows are copied by publish_price_list.
drop policy if exists tech_services_insert on public.tech_services;
create policy tech_services_insert on public.tech_services for insert to authenticated
  with check (lane = 'draft' and tech_id = (select auth.uid()) and exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('tech','admin')));
drop policy if exists tech_services_update on public.tech_services;
create policy tech_services_update on public.tech_services for update to authenticated
  using (lane = 'draft' and tech_id = (select auth.uid()))
  with check (lane = 'draft' and tech_id = (select auth.uid()));
drop policy if exists tech_services_delete on public.tech_services;
create policy tech_services_delete on public.tech_services for delete to authenticated
  using (tech_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Request columns and per-request vehicles
-- ---------------------------------------------------------------------------
alter table public.service_requests add column if not exists service_id uuid references public.tech_services(id) on delete set null;
alter table public.service_requests add column if not exists service_name text;
alter table public.service_requests add column if not exists listed_price_mode text;
alter table public.service_requests add column if not exists listed_amount numeric(12,2);
alter table public.service_requests add column if not exists listed_currency text;
alter table public.service_requests add column if not exists listed_label text;
alter table public.service_requests add column if not exists preferred_end date;
alter table public.service_requests add column if not exists target_tech uuid references public.profiles(id) on delete set null;
alter table public.service_requests drop constraint if exists service_requests_window_chk;
alter table public.service_requests add constraint service_requests_window_chk
  check (preferred_end is null or preferred_date is null or preferred_end >= preferred_date);
alter table public.service_requests drop constraint if exists service_requests_listed_chk;
alter table public.service_requests add constraint service_requests_listed_chk check (
  listed_price_mode is null
  or listed_price_mode in ('fixed','from','on_request')
);

create table if not exists public.request_vehicles (
  request_id uuid not null references public.service_requests(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  share text not null,
  primary key (request_id, vehicle_id),
  constraint request_vehicles_share_chk check (share in ('granted','request_only'))
);
alter table public.request_vehicles enable row level security;
alter table public.request_vehicles force row level security;
revoke all on public.request_vehicles from public, anon, authenticated;
grant select on public.request_vehicles to authenticated;

drop policy if exists request_vehicles_select on public.request_vehicles;
create policy request_vehicles_select on public.request_vehicles for select to authenticated
  using (exists (
    select 1 from public.service_requests r
     where r.id = request_id
       and (
         private.is_collection_owner(r.owner_id)
         or (select private.is_admin())
         or r.target_tech = (select auth.uid())
         or r.assigned_tech = (select auth.uid())
         or r.created_by = (select auth.uid())
       )
  ));

-- ---------------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------------
create or replace function private.tech_share_for(p_tech uuid, p_owner uuid, p_vehicle uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when not exists (
      select 1 from public.vehicles v
       where v.id = p_vehicle and v.owner_id = p_owner and v.archived = false
    ) then null
    when not exists (
      select 1 from public.tech_access ta
       where ta.tech_id = p_tech and ta.owner_id = p_owner and ta.status = 'active'
    ) then null
    when exists (
      select 1 from public.tech_access ta
       where ta.tech_id = p_tech and ta.owner_id = p_owner and ta.status = 'active'
         and (
           ta.vehicle_id = p_vehicle
           or (
             ta.vehicle_id is null and (
               not exists (select 1 from public.tech_grant_vehicles g where g.access_id = ta.id)
               or exists (select 1 from public.tech_grant_vehicles g where g.access_id = ta.id and g.vehicle_id = p_vehicle)
             )
           )
         )
    ) then 'granted'
    else 'request_only'
  end
$$;

create or replace function private.tech_estimates_open(p_owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.tech_access ta
      left join public.tech_permissions tp
        on tp.access_id = ta.id and tp.vehicle_id is null
     where ta.tech_id = (select auth.uid())
       and ta.owner_id = p_owner
       and ta.status = 'active'
       and coalesce(tp.can_send_estimates, true)
  )
$$;

create or replace function private.request_share_allows_estimate(p_vehicle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.request_vehicles rv
      join public.service_requests r on r.id = rv.request_id
     where rv.vehicle_id = p_vehicle
       and rv.share = 'request_only'
       and r.request_kind = 'client'
       and r.target_tech = (select auth.uid())
       and r.status not in ('done','declined')
       and private.tech_estimates_open(r.owner_id)
  )
$$;

create or replace function private.menu_request_visible(p_request uuid, p_owner uuid, p_vehicle uuid, p_target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_target = (select auth.uid())
     and exists (
       select 1 from public.tech_access ta
        where ta.tech_id = (select auth.uid())
          and ta.owner_id = p_owner
          and ta.status = 'active'
     )
     and (
       private.has_active_tech_access(p_vehicle)
       or exists (select 1 from public.request_vehicles rv where rv.request_id = p_request)
     )
$$;

revoke all on function
  private.tech_share_for(uuid,uuid,uuid),
  private.tech_estimates_open(uuid),
  private.request_share_allows_estimate(uuid),
  private.menu_request_visible(uuid,uuid,uuid,uuid)
  from public, anon;
grant execute on function
  private.tech_share_for(uuid,uuid,uuid),
  private.tech_estimates_open(uuid),
  private.request_share_allows_estimate(uuid),
  private.menu_request_visible(uuid,uuid,uuid,uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Guard, policies, transfer cleanup
-- ---------------------------------------------------------------------------
create or replace function private.service_requests_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('evoai.transfer', true), '') = '1' then return new; end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.vehicles v where v.id = new.vehicle_id and v.owner_id = new.owner_id) then
      raise exception 'vehicle_not_in_collection' using errcode = '42501'; end if;
    if new.request_kind = 'estimate' and new.decision is distinct from 'pending' then
      raise exception 'estimate_starts_pending' using errcode = '42501'; end if;
    if (new.target_tech is not null or new.service_id is not null or new.listed_label is not null)
       and coalesce(current_setting('evoai.menu_request', true), '') <> '1' then
      raise exception 'menu_request_rpc_only' using errcode = '42501'; end if;
  else
    if new.owner_id is distinct from old.owner_id or new.vehicle_id is distinct from old.vehicle_id
       or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at
       or new.request_kind is distinct from old.request_kind
       or new.service_id is distinct from old.service_id
       or new.service_name is distinct from old.service_name
       or new.listed_price_mode is distinct from old.listed_price_mode
       or new.listed_amount is distinct from old.listed_amount
       or new.listed_currency is distinct from old.listed_currency
       or new.listed_label is distinct from old.listed_label
       or new.preferred_end is distinct from old.preferred_end
       or new.target_tech is distinct from old.target_tech then
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
    or private.menu_request_visible(id, owner_id, vehicle_id, target_tech)
    or (
      request_kind = 'estimate'
      and created_by = (select auth.uid())
      and (
        private.has_active_tech_access(vehicle_id)
        or private.request_share_allows_estimate(vehicle_id)
      )
    )
  );
drop policy if exists service_requests_insert on public.service_requests;
create policy service_requests_insert on public.service_requests for insert to authenticated
  with check (
    (request_kind = 'client' and private.is_collection_owner(owner_id) and created_by = (select auth.uid())
      and status = 'new' and decision is null and assigned_tech is null and scheduled_for is null
      and target_tech is null and service_id is null and listed_label is null)
    or
    (request_kind = 'estimate' and created_by = (select auth.uid()) and assigned_tech = (select auth.uid())
      and status = 'new' and decision = 'pending'
      and not private.is_collection_owner(owner_id)
      and (
        (private.has_active_tech_access(vehicle_id) and private.tech_can(vehicle_id, 'can_send_estimates'))
        or private.request_share_allows_estimate(vehicle_id)
      ))
  );
drop policy if exists service_requests_update on public.service_requests;
create policy service_requests_update on public.service_requests for update to authenticated
  using (
    (request_kind = 'client' and (
      private.request_staff(vehicle_id, owner_id)
      or private.menu_request_visible(id, owner_id, vehicle_id, target_tech)
    ))
    or (request_kind = 'estimate' and created_by = (select auth.uid()) and decision = 'pending'
        and (private.has_active_tech_access(vehicle_id) or private.request_share_allows_estimate(vehicle_id)))
  )
  with check (
    (request_kind = 'client' and (
      private.request_staff(vehicle_id, owner_id)
      or private.menu_request_visible(id, owner_id, vehicle_id, target_tech)
    ))
    or (request_kind = 'estimate' and created_by = (select auth.uid())
        and (private.has_active_tech_access(vehicle_id) or private.request_share_allows_estimate(vehicle_id)))
  );

create or replace function private.request_vehicles_on_request_move() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('evoai.transfer', true), '') = '1'
     and new.owner_id is distinct from old.owner_id then
    delete from public.request_vehicles
     where request_id = new.id and vehicle_id is distinct from new.vehicle_id;
  end if;
  return new;
end $$;
drop trigger if exists request_vehicles_request_move on public.service_requests;
create trigger request_vehicles_request_move
  after update of owner_id on public.service_requests
  for each row execute function private.request_vehicles_on_request_move();

create or replace function private.request_vehicles_on_vehicle_move() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.owner_id is distinct from old.owner_id then
    delete from public.request_vehicles rv
     using public.service_requests r
     where rv.vehicle_id = new.id
       and rv.request_id = r.id
       and r.owner_id is distinct from new.owner_id;
  end if;
  return new;
end $$;
drop trigger if exists request_vehicles_vehicle_move on public.vehicles;
create trigger request_vehicles_vehicle_move
  after update of owner_id on public.vehicles
  for each row execute function private.request_vehicles_on_vehicle_move();

-- ---------------------------------------------------------------------------
-- 5. RPCs
-- ---------------------------------------------------------------------------
create or replace function public.save_price_draft(
  p_website text, p_pay text, p_attest boolean, p_services jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_list uuid;
  v_item jsonb;
  v_i int := 0;
  v_mode text;
  v_amount numeric;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role in ('tech','admin')) then
    raise exception 'not_a_tech' using errcode = '42501'; end if;
  if p_website is not null and btrim(p_website) <> '' and btrim(p_website) !~ '^https://[^[:space:]@]+' then
    raise exception 'https_url_required' using errcode = '22023'; end if;
  if p_pay is not null and btrim(p_pay) <> '' and btrim(p_pay) !~ '^https://[^[:space:]@]+' then
    raise exception 'https_url_required' using errcode = '22023'; end if;
  if coalesce(p_attest, false) is not true and p_services is not null and jsonb_typeof(p_services) = 'array' and jsonb_array_length(p_services) > 0 then
    raise exception 'attestation_required' using errcode = '42501'; end if;
  insert into public.tech_price_lists (tech_id, website_url, pay_url, attested_at)
  values (
    v_uid,
    nullif(btrim(coalesce(p_website, '')), ''),
    nullif(btrim(coalesce(p_pay, '')), ''),
    case when coalesce(p_attest, false) then now() else null end
  )
  on conflict (tech_id) do update set
    website_url = coalesce(nullif(btrim(coalesce(p_website, '')), ''), tech_price_lists.website_url),
    pay_url = case when p_pay is null then tech_price_lists.pay_url else nullif(btrim(p_pay), '') end,
    attested_at = case
      when coalesce(p_attest, false) then coalesce(tech_price_lists.attested_at, now())
      else tech_price_lists.attested_at end,
    updated_at = now()
  returning id into v_list;
  if p_services is null then
    return public.get_my_price_list();
  end if;
  if jsonb_typeof(p_services) <> 'array' then raise exception 'services_must_be_a_list' using errcode = '22023'; end if;
  delete from public.tech_services where list_id = v_list and lane = 'draft';
  for v_item in select value from jsonb_array_elements(p_services) loop
    v_mode := coalesce(v_item->>'price_mode', 'on_request');
    if v_mode not in ('fixed','from','on_request') then v_mode := 'on_request'; end if;
    v_amount := nullif(v_item->>'amount', '')::numeric;
    if char_length(btrim(coalesce(v_item->>'name', ''))) < 3 then
      raise exception 'service_name_too_short' using errcode = '22023'; end if;
    if v_mode = 'on_request' then v_amount := null; end if;
    if v_mode <> 'on_request' and v_amount is null then
      v_mode := 'on_request';
    end if;
    insert into public.tech_services (
      list_id, tech_id, lane, category, name, description, price_mode, amount, currency,
      duration_label, source_url, needs_review, sort_order
    ) values (
      v_list, v_uid, 'draft',
      left(coalesce(nullif(btrim(v_item->>'category'), ''), 'Services'), 40),
      left(btrim(coalesce(v_item->>'name', '')), 120),
      nullif(left(coalesce(v_item->>'description', ''), 500), ''),
      v_mode, v_amount,
      case when v_amount is null then null else coalesce(nullif(v_item->>'currency', ''), 'USD') end,
      nullif(left(coalesce(v_item->>'duration_label', ''), 40), ''),
      nullif(left(coalesce(v_item->>'source_url', ''), 400), ''),
      coalesce((v_item->>'needs_review')::boolean, v_mode = 'on_request' and v_amount is null),
      v_i
    );
    v_i := v_i + 1;
  end loop;
  update public.tech_price_lists set draft_fetched_at = now(), updated_at = now() where id = v_list;
  return public.get_my_price_list();
end $$;

create or replace function public.get_my_price_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_row public.tech_price_lists%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_row from public.tech_price_lists where tech_id = v_uid;
  if not found then return jsonb_build_object('list', null, 'draft', '[]'::jsonb, 'live', '[]'::jsonb); end if;
  return jsonb_build_object(
    'list', jsonb_build_object(
      'id', v_row.id, 'website_url', v_row.website_url, 'pay_url', v_row.pay_url,
      'attested_at', v_row.attested_at, 'published_at', v_row.published_at,
      'draft_fetched_at', v_row.draft_fetched_at
    ),
    'draft', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order) from public.tech_services s where s.list_id = v_row.id and s.lane = 'draft'), '[]'::jsonb),
    'live', coalesce((select jsonb_agg(to_jsonb(s) order by s.sort_order) from public.tech_services s where s.list_id = v_row.id and s.lane = 'live'), '[]'::jsonb)
  );
end $$;

create or replace function public.publish_price_list() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_list public.tech_price_lists%rowtype; n int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_list from public.tech_price_lists where tech_id = v_uid for update;
  if not found or v_list.attested_at is null or v_list.website_url is null then
    raise exception 'attestation_required' using errcode = '42501'; end if;
  select count(*) into n from public.tech_services where list_id = v_list.id and lane = 'draft';
  if n < 1 then raise exception 'empty_draft' using errcode = '22023'; end if;
  delete from public.tech_services where list_id = v_list.id and lane = 'live';
  insert into public.tech_services (
    list_id, tech_id, lane, category, name, description, price_mode, amount, currency,
    duration_label, source_url, needs_review, sort_order
  )
  select list_id, tech_id, 'live', category, name, description, price_mode, amount, currency,
         duration_label, source_url, needs_review, sort_order
    from public.tech_services where list_id = v_list.id and lane = 'draft';
  update public.tech_price_lists set published_at = now(), updated_at = now() where id = v_list.id;
  return public.get_my_price_list();
end $$;

create or replace function public.keep_price_list() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_list uuid;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select id into v_list from public.tech_price_lists where tech_id = v_uid;
  if v_list is not null then
    delete from public.tech_services where list_id = v_list and lane = 'draft';
  end if;
  return public.get_my_price_list();
end $$;

create or replace function public.get_tech_menu(p_tech uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_list public.tech_price_lists%rowtype; v_name text; v_biz text;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_tech is distinct from auth.uid() and not exists (
    select 1 from public.tech_access ta
     where ta.tech_id = p_tech and ta.status = 'active' and private.is_collection_owner(ta.owner_id)
  ) and not private.is_admin() then
    raise exception 'not_your_tech' using errcode = '42501'; end if;
  select * into v_list from public.tech_price_lists where tech_id = p_tech and published_at is not null;
  if not found then return jsonb_build_object('published', false, 'services', '[]'::jsonb); end if;
  select display_name, business_name into v_name, v_biz from public.profiles where id = p_tech;
  return jsonb_build_object(
    'published', true,
    'tech_id', p_tech,
    'name', v_name,
    'business_name', v_biz,
    'website_url', v_list.website_url,
    'pay_url', v_list.pay_url,
    'published_at', v_list.published_at,
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'category', s.category, 'name', s.name, 'description', s.description,
        'price_mode', s.price_mode, 'amount', s.amount, 'currency', s.currency,
        'duration_label', s.duration_label, 'source_url', s.source_url
      ) order by s.sort_order)
      from public.tech_services s where s.list_id = v_list.id and s.lane = 'live'
    ), '[]'::jsonb)
  );
end $$;

create or replace function public.list_tech_scope(p_tech uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_owner uuid := private.collection_of(auth.uid());
  v_all boolean := false;
  v_ids uuid[];
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (
    select 1 from public.tech_access ta
     where ta.tech_id = p_tech and ta.owner_id = v_owner and ta.status = 'active'
  ) then
    return jsonb_build_object('all', false, 'vehicle_ids', '[]'::jsonb);
  end if;
  v_all := exists (
    select 1 from public.tech_access ta
     where ta.tech_id = p_tech and ta.owner_id = v_owner and ta.status = 'active'
       and ta.vehicle_id is null
       and not exists (select 1 from public.tech_grant_vehicles g where g.access_id = ta.id)
  );
  if v_all then
    return jsonb_build_object('all', true, 'vehicle_ids', '[]'::jsonb);
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from (
    select ta.vehicle_id as x from public.tech_access ta
     where ta.tech_id = p_tech and ta.owner_id = v_owner and ta.status = 'active' and ta.vehicle_id is not null
    union
    select g.vehicle_id from public.tech_grant_vehicles g
      join public.tech_access ta on ta.id = g.access_id
     where ta.tech_id = p_tech and ta.owner_id = v_owner and ta.status = 'active'
  ) s;
  return jsonb_build_object('all', false, 'vehicle_ids', to_jsonb(v_ids));
end $$;

create or replace function public.submit_service_request(
  p_tech uuid, p_service uuid, p_vehicles uuid[], p_start date, p_end date, p_note text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_svc public.tech_services%rowtype;
  v_id uuid;
  v_vehicle uuid;
  v_primary uuid;
  v_share text;
  v_note text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  v_owner := private.collection_of(v_uid);
  if not private.is_collection_owner(v_owner) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_vehicles is null or cardinality(p_vehicles) < 1 or cardinality(p_vehicles) > 12 then
    raise exception 'choose_a_vehicle' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.tech_access ta
     where ta.tech_id = p_tech and ta.owner_id = v_owner and ta.status = 'active'
  ) then raise exception 'tech_not_on_this_collection' using errcode = '42501'; end if;
  select * into v_svc from public.tech_services where id = p_service and tech_id = p_tech and lane = 'live';
  if not found then raise exception 'service_not_published' using errcode = '42501'; end if;
  if p_end is not null and p_start is not null and p_end < p_start then
    raise exception 'bad_window' using errcode = '22023'; end if;
  v_note := nullif(left(btrim(coalesce(p_note, '')), 1000), '');
  foreach v_vehicle in array p_vehicles loop
    v_share := private.tech_share_for(p_tech, v_owner, v_vehicle);
    if v_share is null then raise exception 'vehicle_not_available' using errcode = '42501'; end if;
    if v_share = 'granted' and v_primary is null then v_primary := v_vehicle; end if;
  end loop;
  if v_primary is null then v_primary := p_vehicles[1]; end if;
  perform set_config('evoai.menu_request', '1', true);
  insert into public.service_requests (
    owner_id, vehicle_id, created_by, service, details, preferred_date, preferred_end, preferred_time,
    notes, status, request_kind, service_id, service_name, listed_price_mode, listed_amount,
    listed_currency, listed_label, target_tech
  ) values (
    v_owner, v_primary, v_uid, 'other',     left(v_svc.name, 1000), p_start, p_end, 'any',
    v_note, 'new', 'client', v_svc.id, v_svc.name, v_svc.price_mode, v_svc.amount,
    v_svc.currency,
    case v_svc.price_mode
      when 'from' then 'from $' || regexp_replace(trim(to_char(v_svc.amount, 'FM999999990.00')), '\.00$', '')
      when 'fixed' then '$' || regexp_replace(trim(to_char(v_svc.amount, 'FM999999990.00')), '\.00$', '')
      else 'On request' end,
    p_tech
  ) returning id into v_id;
  perform set_config('evoai.menu_request', '0', true);
  foreach v_vehicle in array p_vehicles loop
    insert into public.request_vehicles (request_id, vehicle_id, share)
    values (v_id, v_vehicle, private.tech_share_for(p_tech, v_owner, v_vehicle))
    on conflict do nothing;
  end loop;
  return v_id;
end $$;

create or replace function public.request_vehicle_cards(p_request uuid)
returns table (vehicle_id uuid, year int, make text, model text, plate text, nickname text, share text)
language plpgsql stable security definer set search_path = '' as $$
declare r public.service_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into r from public.service_requests where id = p_request;
  if not found then return; end if;
  if private.is_collection_owner(r.owner_id) or private.is_admin() then
    null;
  elsif (r.target_tech = auth.uid() or r.assigned_tech = auth.uid() or r.created_by = auth.uid())
     and exists (
       select 1 from public.tech_access ta
        where ta.tech_id = auth.uid() and ta.owner_id = r.owner_id and ta.status = 'active'
     ) then
    null;
  else
    raise exception 'not_your_request' using errcode = '42501';
  end if;
  return query
  select v.id, v.year, v.make, v.model, v.plate, v.nickname, rv.share
    from public.request_vehicles rv
    join public.vehicles v on v.id = rv.vehicle_id
   where rv.request_id = p_request
   order by v.year desc nulls last, v.make, v.model;
end $$;

revoke all on function
  public.save_price_draft(text, text, boolean, jsonb),
  public.get_my_price_list(),
  public.publish_price_list(),
  public.keep_price_list(),
  public.get_tech_menu(uuid),
  public.list_tech_scope(uuid),
  public.submit_service_request(uuid, uuid, uuid[], date, date, text),
  public.request_vehicle_cards(uuid)
  from public, anon;
grant execute on function
  public.save_price_draft(text, text, boolean, jsonb),
  public.get_my_price_list(),
  public.publish_price_list(),
  public.keep_price_list(),
  public.get_tech_menu(uuid),
  public.list_tech_scope(uuid),
  public.submit_service_request(uuid, uuid, uuid[], date, date, text),
  public.request_vehicle_cards(uuid)
  to authenticated;

commit;
