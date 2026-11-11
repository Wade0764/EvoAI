-- migration_009_replica_owner_value.sql -- Replica / kit car flag + builder, and a manual "Owner value" override. NOT APPLIED.
-- Depends on migration_003 (private.is_owner_or_admin). Independent of 005-008. Safe to re-run.
-- 1) vehicles.is_replica / vehicles.builder: plain vehicle facts (the existing vehicles RLS + grants apply; techs who can see
--    the car can see that it is a replica - that is not sensitive, and it is needed to value it correctly).
-- 2) Owner value lives in its OWN table so it can be hidden from techs: a column on vehicles would be visible to every tech
--    who can see the car. Readable by owner/admin (incl. managed clients) and by techs ONLY with view_value_estimate.
--    Writable by owner/admin only. It takes priority over the AI estimate in the app (vehicle + collection total).
-- ROLLBACK: drop table public.vehicle_owner_values; alter table public.vehicles drop column is_replica, drop column builder;
do $$ begin
  if to_regprocedure('private.is_owner_or_admin(uuid)') is null then
    raise exception 'migration_009 needs the base schema + migration_003 applied first';
  end if;
end $$;

alter table public.vehicles add column if not exists is_replica boolean not null default false;
alter table public.vehicles add column if not exists builder text;
alter table public.vehicles drop constraint if exists vehicles_builder_len;
alter table public.vehicles add  constraint vehicles_builder_len check (builder is null or char_length(builder) <= 80);

create table if not exists public.vehicle_owner_values (
  vehicle_id          uuid primary key references public.vehicles(id) on delete cascade,
  owner_id            uuid not null references public.profiles(id) on delete cascade,
  owner_value         numeric(12,2) not null check (owner_value > 0 and owner_value <= 500000000),
  owner_value_set_at  timestamptz not null default now(),
  set_by              uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table public.vehicle_owner_values enable row level security;
alter table public.vehicle_owner_values force row level security;
revoke all on public.vehicle_owner_values from anon, authenticated;
grant select, insert, update, delete on public.vehicle_owner_values to authenticated;
grant all on public.vehicle_owner_values to service_role;

-- owner_id always follows the vehicle; set_by / timestamps are server-set (cannot be spoofed by the client)
create or replace function private.owner_value_stamp() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.owner_id := (select v.owner_id from public.vehicles v where v.id = new.vehicle_id);
  if new.owner_id is null then raise exception 'vehicle not found'; end if;
  new.set_by := auth.uid();
  new.owner_value_set_at := now();
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_at := now(); end if;
  return new;
end $$;
drop trigger if exists owner_value_stamp on public.vehicle_owner_values;
create trigger owner_value_stamp before insert or update on public.vehicle_owner_values
  for each row execute function private.owner_value_stamp();

drop policy if exists owner_values_select on public.vehicle_owner_values;
create policy owner_values_select on public.vehicle_owner_values for select to authenticated
  using (private.is_owner_or_admin(vehicle_id) or private.tech_can(vehicle_id, 'view_value_estimate'));
drop policy if exists owner_values_insert on public.vehicle_owner_values;
create policy owner_values_insert on public.vehicle_owner_values for insert to authenticated
  with check (private.is_owner_or_admin(vehicle_id));
drop policy if exists owner_values_update on public.vehicle_owner_values;
create policy owner_values_update on public.vehicle_owner_values for update to authenticated
  using (private.is_owner_or_admin(vehicle_id)) with check (private.is_owner_or_admin(vehicle_id));
drop policy if exists owner_values_delete on public.vehicle_owner_values;
create policy owner_values_delete on public.vehicle_owner_values for delete to authenticated
  using (private.is_owner_or_admin(vehicle_id));
