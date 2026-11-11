-- migration_017_sort_order.sql  (EvoAI v25: press-and-hold reorder / remove / merge duplicates)
-- Idempotent: safe to run more than once. Paste into the Supabase SQL editor as one script.
-- What it does
--   0. Backs up every table this release can change to evo_backup.*_20261027 (first run only).
--   1. vehicles.sort_order (per-portfolio card order), vehicles.created_by (who added the car), vehicles.merged_into.
--      created_by is back-filled from the audit log ("insert" rows); cars with no record stay null
--      (null = only the owner or an admin may delete them permanently).
--   2. public.save_vehicle_order(portfolio, ids[])   one call, permission-checked, SECURITY DEFINER.
--   3. Permanent delete rule: owner/co-owner/admin any car, a tech only cars they added.
--      Enforced in the RLS delete policy AND in public.delete_vehicle_permanently(id).
--   4. Merge duplicates: public.vehicle_merges (log), public.merge_vehicles(keep, drop, fields), public.undo_merge(id).
--   5. Final verification SELECT (every row should say ok = true).
-- ROLLBACK: rollback_017_sort_order.sql
begin;

-- 0. backups ---------------------------------------------------------------
create schema if not exists evo_backup;
create table if not exists evo_backup.vehicles_20261027           as table public.vehicles;
create table if not exists evo_backup.vehicle_financials_20261027 as table public.vehicle_financials;
create table if not exists evo_backup.vehicle_photos_20261027     as table public.vehicle_photos;
create table if not exists evo_backup.documents_20261027          as table public.documents;
create table if not exists evo_backup.reminders_20261027          as table public.reminders;
create table if not exists evo_backup.expenses_20261027           as table public.expenses;
create table if not exists evo_backup.ai_estimates_20261027       as table public.ai_estimates;
create table if not exists evo_backup.service_records_20261027    as table public.service_records;
create table if not exists evo_backup.advisories_20261027         as table public.advisories;
do $b$ begin
  if to_regclass('public.vehicle_owner_values') is not null then
    execute 'create table if not exists evo_backup.vehicle_owner_values_20261027 as table public.vehicle_owner_values';
  end if;
end $b$;
do $b$ declare t text; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='evo_backup' and c.relname like '%\_20261027' and c.relkind='r' loop
    execute format('revoke all on evo_backup.%I from public, anon, authenticated', t);
  end loop;
end $b$;
revoke all on schema evo_backup from public, anon, authenticated;

-- 1. columns ---------------------------------------------------------------
alter table public.vehicles add column if not exists sort_order integer;
alter table public.vehicles add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.vehicles alter column created_by set default auth.uid();
alter table public.vehicles add column if not exists merged_into uuid references public.vehicles(id) on delete set null;
create index if not exists vehicles_portfolio_sort on public.vehicles (portfolio_id, sort_order);

-- back-fill created_by from the audit log (first insert of each car); only where still null
update public.vehicles v set created_by = a.actor_id
  from (select distinct on (entity_id) entity_id, actor_id from public.audit_log
         where entity_table='vehicles' and action='insert' and actor_id is not null
         order by entity_id, created_at) a
 where v.id = a.entity_id and v.created_by is null
   and exists (select 1 from public.profiles p where p.id = a.actor_id);

-- created_by and merged_into can't be set by the client: created_by is fixed at insert, merged_into only by the merge functions
create or replace function private.guard_vehicle_017() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated','anon') then
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
      new.merged_into := null;
    else
      new.created_by := old.created_by;
      new.merged_into := old.merged_into;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists vehicles_guard_017 on public.vehicles;
create trigger vehicles_guard_017 before insert or update on public.vehicles
  for each row execute function private.guard_vehicle_017();

-- children may change vehicle_id only inside the merge functions (definer, transaction-local flag)
create or replace function private.forbid_change() returns trigger
language plpgsql set search_path = '' as $$
declare c text;
begin
  foreach c in array tg_argv loop
    if to_jsonb(new) -> c is distinct from to_jsonb(old) -> c then
      if c = 'owner_id' and current_user not in ('authenticated','anon')
         and coalesce(current_setting('evoai.claiming', true), '') = '1' then
        continue;   -- private.claim_managed re-pointing a placeholder owner (migration_003)
      end if;
      if c = 'vehicle_id' and current_user not in ('authenticated','anon')
         and coalesce(current_setting('evo.allow_move', true), '') = 'on' then
        continue;   -- merge_vehicles / undo_merge moving rows between duplicate cars (017)
      end if;
      raise exception 'column % is immutable on %', c, tg_table_name using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;


-- photos/documents: their files live in the {owner}/{vehicle}/ folder of the car they were uploaded to.
-- The path checks compared that folder with vehicle_id; they now compare it with folder_vehicle_id,
-- which is set to vehicle_id at insert (client can't choose it) and never changes, so a merge can move
-- the row to the kept car while the file stays where it is. Insert-time rules are unchanged.
create table if not exists evo_backup.check_constraints_20261027 (tbl text, conname text, def text, primary key (tbl, conname));
revoke all on evo_backup.check_constraints_20261027 from public, anon, authenticated;
alter table public.vehicle_photos add column if not exists folder_vehicle_id uuid;
alter table public.documents      add column if not exists folder_vehicle_id uuid;
update public.vehicle_photos set folder_vehicle_id = vehicle_id where folder_vehicle_id is null;
update public.documents      set folder_vehicle_id = vehicle_id where folder_vehicle_id is null;
create or replace function private.set_folder_vehicle_017() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then new.folder_vehicle_id := new.vehicle_id;
  else new.folder_vehicle_id := old.folder_vehicle_id; end if;
  return new;
end $$;
drop trigger if exists vehicle_photos_folder_017 on public.vehicle_photos;
create trigger vehicle_photos_folder_017 before insert or update on public.vehicle_photos
  for each row execute function private.set_folder_vehicle_017();
drop trigger if exists documents_folder_017 on public.documents;
create trigger documents_folder_017 before insert or update on public.documents
  for each row execute function private.set_folder_vehicle_017();
do $c$ declare r record; d text; begin
  for r in select c.conrelid::regclass::text tbl, c.conname, pg_get_constraintdef(c.oid) def
             from pg_constraint c
            where c.conrelid in ('public.vehicle_photos'::regclass, 'public.documents'::regclass)
              and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%(vehicle_id)::text%' loop
    insert into evo_backup.check_constraints_20261027 values (r.tbl, r.conname, r.def) on conflict do nothing;
    d := replace(r.def, '(vehicle_id)::text', '(folder_vehicle_id)::text');
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I %s', r.tbl, r.conname, d);
  end loop;
end $c$;
alter table public.vehicle_photos alter column folder_vehicle_id set not null;
alter table public.documents      alter column folder_vehicle_id set not null;

-- who may edit a collection (same rule as the vehicles_update policy)
create or replace function private.can_edit_collection(p_owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and (private.is_collection_owner(p_owner) or private.is_admin() or private.is_managing_tech(p_owner));
$$;

-- 2. save the card order -----------------------------------------------------
-- p_ids: the cars of ONE portfolio in their new order (position 1..n). Cars not listed keep their order.
create or replace function public.save_vehicle_order(p_portfolio uuid, p_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; n int;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode='42501'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then return 0; end if;
  if cardinality(p_ids) > 2000 then raise exception 'too_many' using errcode='22023'; end if;
  if (select count(distinct x) from unnest(p_ids) x) <> cardinality(p_ids) then
    raise exception 'duplicate_ids' using errcode='22023';
  end if;
  select owner_id into v_owner from public.portfolios where id = p_portfolio;
  if v_owner is null then raise exception 'no_portfolio' using errcode='42501'; end if;
  if not private.can_edit_collection(v_owner) then raise exception 'not_allowed' using errcode='42501'; end if;
  if exists (select 1 from unnest(p_ids) x left join public.vehicles v on v.id = x
              where v.id is null or v.portfolio_id is distinct from p_portfolio) then
    raise exception 'car_not_in_portfolio' using errcode='42501';
  end if;
  update public.vehicles v set sort_order = o.pos
    from unnest(p_ids) with ordinality as o(id, pos)
   where v.id = o.id and v.sort_order is distinct from o.pos;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.save_vehicle_order(uuid, uuid[]) from public, anon;
grant execute on function public.save_vehicle_order(uuid, uuid[]) to authenticated;

-- 4. merge log (created before the policy/function bodies that reference it) --
create table if not exists public.vehicle_merges (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null,
  keep_id     uuid not null references public.vehicles(id) on delete cascade,
  drop_id     uuid not null references public.vehicles(id) on delete cascade,
  keep_before jsonb not null,
  drop_before jsonb not null,
  fields      jsonb not null default '{}'::jsonb,
  moved       jsonb not null default '{}'::jsonb,
  financials  jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  undone_at   timestamptz
);
create index if not exists vehicle_merges_owner on public.vehicle_merges (owner_id, created_at desc);
create index if not exists vehicle_merges_drop on public.vehicle_merges (drop_id) where undone_at is null;
alter table public.vehicle_merges enable row level security;
alter table public.vehicle_merges force row level security;
revoke all on public.vehicle_merges from anon;
revoke insert, update, delete on public.vehicle_merges from authenticated;
grant select on public.vehicle_merges to authenticated;
drop policy if exists vehicle_merges_select on public.vehicle_merges;
create policy vehicle_merges_select on public.vehicle_merges for select to authenticated
  using (private.can_edit_collection(owner_id));

-- 3. permanent delete rule ---------------------------------------------------
create or replace function private.can_delete_vehicle(p_vehicle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.vehicles v
     where v.id = p_vehicle and auth.uid() is not null
       -- a car that was merged into another still holds the moved photos/docs files: undo the merge first
       and not exists (select 1 from public.vehicle_merges m where m.drop_id = v.id and m.undone_at is null)
       and (private.is_collection_owner(v.owner_id) or private.is_admin()
            or (v.created_by = auth.uid()
                and (private.is_managing_tech(v.owner_id) or private.has_active_tech_access(v.id)))));
$$;

drop policy if exists vehicles_delete on public.vehicles;
create policy vehicles_delete on public.vehicles for delete to authenticated
  using (private.can_delete_vehicle(id));

create or replace function public.delete_vehicle_permanently(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_delete_vehicle(p_id) then raise exception 'not_allowed' using errcode='42501'; end if;
  delete from public.vehicles where id = p_id;
  return found;
end $$;
revoke all on function public.delete_vehicle_permanently(uuid) from public, anon;
grant execute on function public.delete_vehicle_permanently(uuid) to authenticated;

-- may the current user delete this car? (the app asks before offering "Delete permanently")
create or replace function public.can_delete_vehicles(p_ids uuid[])
returns table (id uuid, can_delete boolean) language sql stable security definer set search_path = '' as $$
  select x, private.can_delete_vehicle(x) from unnest(p_ids) x
   where exists (select 1 from public.vehicles v where v.id = x and private.can_read_vehicle(v.id));
$$;
revoke all on function public.can_delete_vehicles(uuid[]) from public, anon;
grant execute on function public.can_delete_vehicles(uuid[]) to authenticated;

-- 4b. merge ---------------------------------------------------------------
-- p_fields: {"year":1961,"model":"500", ...} the values the user picked for the kept car
--           (only year make model color nickname vin plate plate_region mileage notes),
--           plus optional "fin_<column>" (e.g. fin_purchase_price) to pick a money value when both cars have one.
create or replace function public.merge_vehicles(p_keep uuid, p_drop uuid, p_fields jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  k public.vehicles; d public.vehicles;
  v_f jsonb; v_fin jsonb := '{}'::jsonb; v_moved jsonb := '{}'::jsonb; v_ids jsonb; v_id uuid;
  t text; v_ok boolean; kf public.vehicle_financials; df public.vehicle_financials; v_fin_fields jsonb;
  allowed text[] := array['year','make','model','color','nickname','vin','plate','plate_region','mileage','notes'];
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode='42501'; end if;
  if p_keep is null or p_drop is null or p_keep = p_drop then raise exception 'pick_two_cars' using errcode='22023'; end if;
  select * into k from public.vehicles where id = p_keep for update;
  select * into d from public.vehicles where id = p_drop for update;
  if k.id is null or d.id is null then raise exception 'not_allowed' using errcode='42501'; end if;
  if k.owner_id <> d.owner_id then raise exception 'different_collections' using errcode='42501'; end if;
  if not private.can_edit_collection(k.owner_id) then raise exception 'not_allowed' using errcode='42501'; end if;
  if k.archived then raise exception 'keep_car_archived' using errcode='22023'; end if;
  if d.merged_into is not null then raise exception 'already_merged' using errcode='22023'; end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then p_fields := '{}'::jsonb; end if;

  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_f from jsonb_each(p_fields) where key = any(allowed);
  if v_f ? 'vin' and v_f->>'vin' is not null then
    v_f := jsonb_set(v_f, '{vin}', to_jsonb(upper(regexp_replace(v_f->>'vin', '[^A-Za-z0-9]', '', 'g'))));
  end if;

  perform set_config('evo.allow_move', 'on', true);
  -- the dropped car gives up its VIN/plate when the kept car takes it (unique VIN per owner)
  if v_f ? 'vin' and (v_f->>'vin') is not distinct from d.vin then
    update public.vehicles set vin = null where id = d.id;
  end if;

  update public.vehicles v set year = r.year, make = r.make, model = r.model, color = r.color, nickname = r.nickname,
         vin = r.vin, plate = r.plate, plate_region = r.plate_region, mileage = r.mileage, notes = r.notes
    from jsonb_populate_record(null::public.vehicles, to_jsonb(k) || v_f) r
   where v.id = k.id;

  foreach t in array array['vehicle_photos','documents','reminders','expenses','service_records','ai_estimates','advisories'] loop
    execute format('with m as (update public.%I set vehicle_id = $1 where vehicle_id = $2 returning id)
                    select coalesce(jsonb_agg(id), ''[]''::jsonb) from m', t) into v_ids using k.id, d.id;
    v_moved := v_moved || jsonb_build_object(t, v_ids);
  end loop;

  -- financials: move them when the kept car has none, otherwise fill its blanks (or take the user's choice)
  select * into kf from public.vehicle_financials where vehicle_id = k.id;
  select * into df from public.vehicle_financials where vehicle_id = d.id;
  if df.vehicle_id is not null then
    if kf.vehicle_id is null then
      update public.vehicle_financials set vehicle_id = k.id where vehicle_id = d.id;
      v_fin := jsonb_build_object('moved', true);
    else
      -- fill the kept car's blank money fields from the other car; "fin_<column>" in p_fields is the user's pick
      select coalesce(jsonb_object_agg(e.key, case when p_fields ? ('fin_' || e.key) then p_fields -> ('fin_' || e.key) else to_jsonb(df) -> e.key end), '{}'::jsonb)
        into v_fin_fields
        from jsonb_each(to_jsonb(kf)) e
       where e.key not in ('vehicle_id','owner_id','created_at','updated_at')
         and (p_fields ? ('fin_' || e.key) or (e.value = 'null'::jsonb and (to_jsonb(df) -> e.key) <> 'null'::jsonb));
      if v_fin_fields <> '{}'::jsonb then
        execute format('update public.vehicle_financials f set (%1$s) = (select %1$s from jsonb_populate_record(null::public.vehicle_financials, $1)) where f.vehicle_id = $2',
                       (select string_agg(quote_ident(x.k), ',') from jsonb_object_keys(v_fin_fields) x(k)))
          using to_jsonb(kf) || v_fin_fields, k.id;
        v_fin := jsonb_build_object('filled', true, 'keep_before',
                   (select jsonb_object_agg(x.k, to_jsonb(kf) -> x.k) from jsonb_object_keys(v_fin_fields) x(k)));
      end if;
    end if;
  end if;
  if to_regclass('public.vehicle_owner_values') is not null then
    execute 'with m as (update public.vehicle_owner_values set vehicle_id = $1 where vehicle_id = $2
                         and not exists (select 1 from public.vehicle_owner_values where vehicle_id = $1) returning 1)
             select count(*) > 0 from m' into v_ok using k.id, d.id;
    if v_ok then v_fin := v_fin || jsonb_build_object('owner_value_moved', true); end if;
  end if;

  update public.vehicles set archived = true, merged_into = k.id, sort_order = null where id = d.id;

  insert into public.vehicle_merges (owner_id, user_id, keep_id, drop_id, keep_before, drop_before, fields, moved, financials)
  values (k.owner_id, auth.uid(), k.id, d.id,
          (select jsonb_object_agg(key, value) from jsonb_each(to_jsonb(k)) where key = any(allowed)),
          jsonb_build_object('archived', d.archived, 'vin', d.vin, 'sort_order', d.sort_order),
          v_f, v_moved, v_fin)
  returning id into v_id;
  perform set_config('evo.allow_move', 'off', true);
  return jsonb_build_object('merge_id', v_id, 'keep_id', k.id, 'drop_id', d.id,
    'moved', (select coalesce(jsonb_object_agg(key, jsonb_array_length(value)), '{}'::jsonb) from jsonb_each(v_moved)),
    'financials', v_fin);
end $$;
revoke all on function public.merge_vehicles(uuid, uuid, jsonb) from public, anon;
grant execute on function public.merge_vehicles(uuid, uuid, jsonb) to authenticated;

create or replace function public.undo_merge(p_merge uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.vehicle_merges; r public.vehicles; t text; n int := 0; c int;
begin
  if auth.uid() is null then raise exception 'not_signed_in' using errcode='42501'; end if;
  select * into m from public.vehicle_merges where id = p_merge for update;
  if m.id is null or not private.can_edit_collection(m.owner_id) then raise exception 'not_allowed' using errcode='42501'; end if;
  if m.undone_at is not null then raise exception 'already_undone' using errcode='22023'; end if;
  perform set_config('evo.allow_move', 'on', true);
  foreach t in array array['vehicle_photos','documents','reminders','expenses','service_records','ai_estimates','advisories'] loop
    if m.moved ? t then
      execute format('update public.%I set vehicle_id = $1 where vehicle_id = $2 and id in (select (jsonb_array_elements_text($3))::uuid)', t)
        using m.drop_id, m.keep_id, m.moved->t;
      get diagnostics c = row_count; n := n + c;
    end if;
  end loop;
  if (m.financials->>'moved')::boolean then
    update public.vehicle_financials set vehicle_id = m.drop_id where vehicle_id = m.keep_id
       and not exists (select 1 from public.vehicle_financials where vehicle_id = m.drop_id);
  elsif (m.financials->>'filled')::boolean then
    execute format('update public.vehicle_financials f set (%1$s) = (select %1$s from jsonb_populate_record(null::public.vehicle_financials, to_jsonb(f) || $1)) where f.vehicle_id = $2',
                   (select string_agg(quote_ident(x.k), ',') from jsonb_object_keys(m.financials->'keep_before') x(k)))
      using m.financials->'keep_before', m.keep_id;
  end if;
  if (m.financials->>'owner_value_moved')::boolean and to_regclass('public.vehicle_owner_values') is not null then
    execute 'update public.vehicle_owner_values set vehicle_id = $1 where vehicle_id = $2' using m.drop_id, m.keep_id;
  end if;
  -- kept car: restore the fields the merge changed
  update public.vehicles v set vin = null where v.id = m.keep_id and (m.keep_before->>'vin') is distinct from v.vin
     and (m.drop_before->>'vin') is not null and v.vin = (m.drop_before->>'vin');
  select * into r from jsonb_populate_record(null::public.vehicles,
           (select to_jsonb(v) from public.vehicles v where v.id = m.keep_id) || m.keep_before);
  update public.vehicles v set year = r.year, make = r.make, model = r.model, color = r.color, nickname = r.nickname,
         vin = r.vin, plate = r.plate, plate_region = r.plate_region, mileage = r.mileage, notes = r.notes
   where v.id = m.keep_id;
  update public.vehicles set archived = coalesce((m.drop_before->>'archived')::boolean, false),
         vin = coalesce(m.drop_before->>'vin', vin), merged_into = null,
         sort_order = (m.drop_before->>'sort_order')::int
   where id = m.drop_id;
  update public.vehicle_merges set undone_at = now() where id = m.id;
  perform set_config('evo.allow_move', 'off', true);
  return jsonb_build_object('merge_id', m.id, 'moved_back', n, 'restored', m.drop_id);
end $$;
revoke all on function public.undo_merge(uuid) from public, anon;
grant execute on function public.undo_merge(uuid) to authenticated;

commit;

-- 5. verification (every row should say ok = true) ----------------------------
select 'backup vehicles_20261027' as check, to_regclass('evo_backup.vehicles_20261027') is not null as ok
union all select 'backup documents_20261027', to_regclass('evo_backup.documents_20261027') is not null
union all select 'backup service_records_20261027', to_regclass('evo_backup.service_records_20261027') is not null
union all select 'vehicles.sort_order', exists (select 1 from information_schema.columns where table_schema='public' and table_name='vehicles' and column_name='sort_order')
union all select 'vehicles.created_by', exists (select 1 from information_schema.columns where table_schema='public' and table_name='vehicles' and column_name='created_by')
union all select 'vehicles.merged_into', exists (select 1 from information_schema.columns where table_schema='public' and table_name='vehicles' and column_name='merged_into')
union all select 'save_vehicle_order is security definer', coalesce((select prosecdef from pg_proc where oid='public.save_vehicle_order(uuid,uuid[])'::regprocedure), false)
union all select 'merge_vehicles is security definer', coalesce((select prosecdef from pg_proc where oid='public.merge_vehicles(uuid,uuid,jsonb)'::regprocedure), false)
union all select 'undo_merge is security definer', coalesce((select prosecdef from pg_proc where oid='public.undo_merge(uuid)'::regprocedure), false)
union all select 'delete_vehicle_permanently exists', to_regprocedure('public.delete_vehicle_permanently(uuid)') is not null
union all select 'vehicles_delete uses can_delete_vehicle', exists (select 1 from pg_policies where schemaname='public' and tablename='vehicles' and policyname='vehicles_delete' and qual like '%can_delete_vehicle%')
union all select 'vehicle_merges forced RLS', (select relrowsecurity and relforcerowsecurity from pg_class where oid='public.vehicle_merges'::regclass)
union all select 'photo path checks use folder_vehicle_id', not exists (select 1 from pg_constraint where conrelid='public.vehicle_photos'::regclass and contype='c' and pg_get_constraintdef(oid) like '%(vehicle_id)::text%')
union all select 'anon cannot run merge_vehicles', not has_function_privilege('anon', 'public.merge_vehicles(uuid,uuid,jsonb)', 'execute');
