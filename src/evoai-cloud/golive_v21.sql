-- golive_v21.sql  EvoAI v21 (import + portfolios + cost check). STATUS: NOT APPLIED.
-- Paste into Supabase SQL editor (project xosbchskdtkxogppmkex) and run once. Re-runnable.
-- 1) backups  2) migration_013  3) migration_014  4) migration_015  5) verification select
create schema if not exists evo_backup;
create table if not exists evo_backup.vehicles_20261026 as table public.vehicles;
create table if not exists evo_backup.vehicle_financials_20261026 as table public.vehicle_financials;
revoke all on all tables in schema evo_backup from anon, authenticated;

-- ===== migration_013_portfolios.sql
do $$ begin
  if to_regprocedure('private.is_collection_owner(uuid)') is null then
    raise exception 'migration_013 needs migration_010_co_owners.sql applied first';
  end if;
end $$;

create table if not exists public.portfolios (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  country     text check (country is null or country ~ '^[A-Z]{2}$'),
  currency    text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  sort_order  int  not null default 0,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists portfolios_owner on public.portfolios (owner_id, sort_order);
create unique index if not exists portfolios_one_default on public.portfolios (owner_id) where is_default;
create unique index if not exists portfolios_owner_name on public.portfolios (owner_id, lower(btrim(name)));

create or replace function private.default_portfolio(p_owner uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r uuid;
begin
  select id into r from public.portfolios where owner_id = p_owner and is_default;
  if r is null then
    insert into public.portfolios(owner_id, name, is_default) values (p_owner, 'My collection', true)
      on conflict do nothing;
    select id into r from public.portfolios where owner_id = p_owner and is_default;
  end if;
  return r;
end $$;
revoke all on function private.default_portfolio(uuid) from public, anon, authenticated;

insert into public.portfolios(owner_id, name, is_default)
select o, 'My collection', true from (
  select distinct owner_id o from public.vehicles
  union
  select p.id from public.profiles p where p.role = 'owner'
    and not exists (select 1 from public.collection_members m where m.user_id = p.id)
) s
where not exists (select 1 from public.portfolios x where x.owner_id = s.o and x.is_default);

alter table public.vehicles add column if not exists portfolio_id uuid references public.portfolios(id) on delete restrict;
update public.vehicles v set portfolio_id = private.default_portfolio(v.owner_id) where v.portfolio_id is null;
alter table public.vehicles alter column portfolio_id set not null;
create index if not exists vehicles_portfolio on public.vehicles (portfolio_id);

create or replace function private.vehicles_portfolio_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id
     and new.portfolio_id is not distinct from old.portfolio_id then
    new.portfolio_id := null;                       -- transfer: land in the new owner's default
  end if;
  if new.portfolio_id is null then
    new.portfolio_id := private.default_portfolio(new.owner_id);
  elsif not exists (select 1 from public.portfolios p where p.id = new.portfolio_id and p.owner_id = new.owner_id) then
    raise exception 'portfolio_wrong_collection' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists vehicles_portfolio_guard on public.vehicles;
create trigger vehicles_portfolio_guard before insert or update of owner_id, portfolio_id on public.vehicles
  for each row execute function private.vehicles_portfolio_guard();

create or replace function private.portfolios_default_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.is_default and pg_trigger_depth() <= 1 then   -- allowed only via profile delete cascade
      raise exception 'portfolio_default_locked' using errcode = '42501'; end if;
    return old;
  end if;
  if old.is_default and not new.is_default then raise exception 'portfolio_default_locked' using errcode = '42501'; end if;
  if new.owner_id is distinct from old.owner_id then raise exception 'portfolio_owner_locked' using errcode = '42501'; end if;
  return new;
end $$;
drop trigger if exists portfolios_default_guard on public.portfolios;
create trigger portfolios_default_guard before update or delete on public.portfolios
  for each row execute function private.portfolios_default_guard();

alter table public.portfolios enable row level security;
alter table public.portfolios force row level security;
revoke all on public.portfolios from anon;
grant select, insert, update, delete on public.portfolios to authenticated;
drop policy if exists portfolios_select on public.portfolios;
create policy portfolios_select on public.portfolios for select to authenticated using (
  private.is_collection_owner(owner_id) or private.is_admin()
  or exists (select 1 from public.vehicles v where v.portfolio_id = portfolios.id));   -- vehicles RLS limits this to cars the user can see
drop policy if exists portfolios_insert on public.portfolios;
create policy portfolios_insert on public.portfolios for insert to authenticated
  with check ((private.is_collection_owner(owner_id) or private.is_admin()) and not is_default);
drop policy if exists portfolios_update on public.portfolios;
create policy portfolios_update on public.portfolios for update to authenticated
  using (private.is_collection_owner(owner_id) or private.is_admin())
  with check (private.is_collection_owner(owner_id) or private.is_admin());
drop policy if exists portfolios_delete on public.portfolios;
create policy portfolios_delete on public.portfolios for delete to authenticated
  using ((private.is_collection_owner(owner_id) or private.is_admin()) and not is_default);

-- ===== migration_014_import_log.sql
create table if not exists public.ai_import_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null,
  import_id   text not null check (char_length(import_id) between 8 and 64),
  mode        text not null check (mode in ('headers','rows')),
  created_at  timestamptz not null default now(),
  status      text not null,             -- ok | error | rate_limited | not_configured | bad_request
  provider    text, model text,
  rows_found  integer, latency_ms integer, input_bytes integer,
  prompt_tokens integer, output_tokens integer,
  error       text
);
create index if not exists ai_import_log_user_time on public.ai_import_log (user_id, created_at desc);
alter table public.ai_import_log enable row level security;
revoke all on public.ai_import_log from anon, authenticated;

-- ===== migration_015_cost_confirm.sql
alter table public.vehicle_financials add column if not exists cost_confirmed boolean not null default true;
alter table public.vehicle_financials add column if not exists cost_flag_reason text;
comment on column public.vehicle_financials.cost_confirmed is 'false = purchase_price was flagged by the cost check and still needs confirming';
comment on column public.vehicle_financials.cost_flag_reason is 'Why the cost was flagged (e.g. Looks low for this car)';

-- ===== verification (expect: portfolios_rows >= 1 per owner with cars, vehicles_without_portfolio = 0, all has_* = true)
select
  (select count(*) from public.portfolios) as portfolios_rows,
  (select count(*) from public.vehicles where portfolio_id is null) as vehicles_without_portfolio,
  (select count(*) from public.vehicles) as vehicles_total,
  (select count(*) from evo_backup.vehicles_20261026) as backup_vehicles,
  (select count(*) from evo_backup.vehicle_financials_20261026) as backup_financials,
  to_regclass('public.portfolios') is not null as has_portfolios_table,
  to_regclass('public.ai_import_log') is not null as has_ai_import_log_table,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='vehicles' and column_name='portfolio_id') as has_vehicles_portfolio_id,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='vehicle_financials' and column_name='cost_confirmed') as has_cost_confirmed,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='vehicle_financials' and column_name='cost_flag_reason') as has_cost_flag_reason;
