-- migration_013_portfolios.sql  (v21 import)  STATUS: NOT APPLIED. Additive; safe to re-run.
-- Portfolios = named groups of cars inside ONE collection (e.g. "Florida Garage").
-- * Every collection owner gets one default portfolio ("My collection").
-- * vehicles.portfolio_id: backfilled to the owner's default, then NOT NULL.
-- * A trigger fills portfolio_id when missing, refuses a portfolio from another collection,
--   and re-points a car to the new owner's default when the car changes owner (transfer).
-- * RLS: owner / co-owner (private.is_collection_owner) or admin. Techs read portfolio names only
--   for collections they have a grant in (so the app can label cars); no per-portfolio tech grants.
-- * The app works without this migration (one implicit portfolio, no "+ New portfolio").
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

-- default portfolio for a collection (created on demand)
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

-- seed: every owner with cars, and every owner profile that is not a co-owner of another collection
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

-- the default portfolio cannot be deleted or un-defaulted; a portfolio with cars cannot be deleted (FK restrict)
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
