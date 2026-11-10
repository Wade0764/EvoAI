-- golive_portfolio_v30.sql  EvoAI v30 "Which portfolio?" go-live (portfolio layer 013/014/015 + 021 ZAR).
-- STATUS: NOT APPLIED. Project xosbchskdtkxogppmkex. Paste into the Supabase SQL editor as ONE script; run as postgres.
-- Idempotent: safe to run more than once. Everything between begin/commit is one transaction (all or nothing).
-- IMPORTANT (read-only probe 2026-10-30 via PostgREST/anon): live ALREADY has public.portfolios (013 columns),
-- vehicles.portfolio_id, ai_import_log, import_batches, vehicle_financials.cost_confirmed/purchase_currency.
-- 016/017 depend on 013 (save_vehicle_order, vehicles_portfolio_sort index), so on live this script mostly
-- RE-ASSERTS 013/014/015 (no-ops / identical create-or-replace) and the real change is 021 (purchase_currency accepts ZAR).
-- Order: 0) preflight  1) state + backups  2) 013  3) 014  4) 015  5) 021  6) verification SELECTs (after commit)
-- Rollback: rollback_portfolio_v30.sql
begin;
-- 0) preflight -------------------------------------------------------------
do $$ begin
  if to_regprocedure('private.is_collection_owner(uuid)') is null then
    raise exception 'golive_v30 needs migration_010_co_owners.sql applied first'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='vehicle_financials' and column_name='purchase_currency') then
    raise exception 'golive_v30 needs migration_012_missing_fields.sql applied first'; end if;
  if to_regclass('public.portfolios') is not null and not exists (select 1 from information_schema.columns
       where table_schema='public' and table_name='portfolios' and column_name='is_default') then
    raise exception 'golive_v30: public.portfolios exists but is not the migration_013 shape; stop and review'; end if;
end $$;

-- 1) state (first run only) + backups of every table this script can change -----------------
create schema if not exists evo_backup;
revoke all on schema evo_backup from public, anon, authenticated;
create table if not exists evo_backup.golive_v30_state (k text primary key, v text, taken_at timestamptz default now());
insert into evo_backup.golive_v30_state(k,v) values
  ('had_portfolios',       (to_regclass('public.portfolios') is not null)::text),
  ('had_vehicles_portfolio_id', exists(select 1 from information_schema.columns where table_schema='public' and table_name='vehicles' and column_name='portfolio_id')::text),
  ('had_ai_import_log',    (to_regclass('public.ai_import_log') is not null)::text),
  ('had_cost_confirmed',   exists(select 1 from information_schema.columns where table_schema='public' and table_name='vehicle_financials' and column_name='cost_confirmed')::text),
  ('had_cost_flag_reason', exists(select 1 from information_schema.columns where table_schema='public' and table_name='vehicle_financials' and column_name='cost_flag_reason')::text),
  ('had_backup_021',       (to_regclass('private.backup_021') is not null)::text),
  ('old_currency_check',   (select pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid='public.vehicle_financials'::regclass
                              and c.contype='c' and pg_get_constraintdef(c.oid) like '%purchase_currency%' order by c.conname limit 1))
on conflict (k) do nothing;
create table if not exists evo_backup.vehicles_20261030           as table public.vehicles;
create table if not exists evo_backup.vehicle_financials_20261030 as table public.vehicle_financials;
create table if not exists evo_backup.profiles_20261030           as table public.profiles;   -- read by 013 only; kept for completeness
do $b$ begin
  if to_regclass('public.portfolios') is not null then
    execute 'create table if not exists evo_backup.portfolios_20261030 as table public.portfolios'; end if;
  if to_regclass('public.ai_import_log') is not null then
    execute 'create table if not exists evo_backup.ai_import_log_20261030 as table public.ai_import_log'; end if;
end $b$;
do $b$ declare t text; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='evo_backup' and (c.relname like '%\_20261030' or c.relname='golive_v30_state') and c.relkind='r' loop
    execute format('revoke all on evo_backup.%I from public, anon, authenticated', t);
  end loop;
end $b$;

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


-- ===== migration_021_portfolio_zar.sql (backup row in private.backup_021)
create table if not exists private.backup_021 (k text primary key, v text, taken_at timestamptz default now());
insert into private.backup_021(k,v)
  select 'old_check', pg_get_constraintdef(c.oid) from pg_constraint c
   where c.conrelid='public.vehicle_financials'::regclass and c.contype='c' and pg_get_constraintdef(c.oid) like '%purchase_currency%'
   limit 1
on conflict (k) do nothing;
-- 2. widen the currency check
do $$ declare r record; begin
  for r in select conname from pg_constraint where conrelid='public.vehicle_financials'::regclass and contype='c'
           and pg_get_constraintdef(oid) like '%purchase_currency%' and conname <> 'vehicle_financials_purchase_currency_v21' loop
    execute format('alter table public.vehicle_financials drop constraint %I', r.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conname='vehicle_financials_purchase_currency_v21') then
    alter table public.vehicle_financials add constraint vehicle_financials_purchase_currency_v21
      check (purchase_currency in ('USD','EUR','GBP','ZAR'));
  end if;
end $$;
commit;

-- 6) verification (expect: vehicles_without_portfolio = 0, owners_with_cars_without_default = 0,
--    vehicles_in_foreign_portfolio = 0, every has_* / ok_* = true, backup_* counts = live counts at run time)
select
  (select count(*) from public.portfolios) as portfolios_rows,
  (select count(*) from public.vehicles) as vehicles_total,
  (select count(*) from public.vehicles where portfolio_id is null) as vehicles_without_portfolio,
  (select count(*) from public.vehicles v join public.portfolios p on p.id=v.portfolio_id where p.owner_id<>v.owner_id) as vehicles_in_foreign_portfolio,
  (select count(distinct v.owner_id) from public.vehicles v where not exists (select 1 from public.portfolios p where p.owner_id=v.owner_id and p.is_default)) as owners_with_cars_without_default,
  (select count(*) from evo_backup.vehicles_20261030) as backup_vehicles,
  (select count(*) from evo_backup.vehicle_financials_20261030) as backup_financials,
  to_regclass('public.ai_import_log') is not null as has_ai_import_log,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='vehicle_financials' and column_name='cost_confirmed') as has_cost_confirmed,
  exists(select 1 from pg_constraint where conname='vehicle_financials_purchase_currency_v21') as has_zar_check,
  exists(select 1 from pg_trigger where tgname='vehicles_portfolio_guard' and not tgisinternal) as has_portfolio_guard,
  exists(select 1 from pg_trigger where tgname='vehicles_guard_017' and not tgisinternal) as ok_017_guard_still_there,
  to_regprocedure('public.save_vehicle_order(uuid,uuid[])') is not null as ok_017_save_order,
  to_regprocedure('public.set_collection_name(uuid,text)') is not null as ok_020_rename,
  (select relrowsecurity and relforcerowsecurity from pg_class where oid='public.portfolios'::regclass) as ok_portfolios_rls;
select p.owner_id, p.name, p.is_default, p.currency, count(v.id) as cars
  from public.portfolios p left join public.vehicles v on v.portfolio_id=p.id
 group by p.id order by p.owner_id, p.sort_order, p.name;
select k, v from evo_backup.golive_v30_state order by k;
