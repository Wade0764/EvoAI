-- migration_016_import_undo.sql  (v23 undo import)  STATUS: NOT APPLIED (test only). Additive; safe to re-run.
-- Needs: schema.sql, rls.sql, migration_010 (co-owners), golive_v21 (013/014/015).
-- What it adds
--   public.import_batches          one row per master-sheet import (who, which collection, which cars it added, field changes)
--   vehicles.import_batch_id / imported_at   tags every car an import ADDED
--   private.storage_cleanup        queue of photo/document files to delete after an undo (drained by service role, see bottom)
--   public.record_import_batch()   app calls once after the import's cars are saved
--   public.import_undo_preview()   list of cars that would be removed + which were edited after import
--   public.undo_import()           the undo itself (SECURITY DEFINER, one transaction)
-- Rollback: rollback_016_import_undo.sql

-- 1) backups (copies, never touched by this migration)
create schema if not exists evo_backup;
create table if not exists evo_backup.vehicles_20261026b           as table public.vehicles;
create table if not exists evo_backup.vehicle_financials_20261026b as table public.vehicle_financials;
create table if not exists evo_backup.vehicle_photos_20261026b     as table public.vehicle_photos;
create table if not exists evo_backup.documents_20261026b          as table public.documents;
create table if not exists evo_backup.reminders_20261026b          as table public.reminders;
create table if not exists evo_backup.expenses_20261026b           as table public.expenses;
create table if not exists evo_backup.ai_estimates_20261026b       as table public.ai_estimates;
create table if not exists evo_backup.service_records_20261026b    as table public.service_records;
revoke all on all tables in schema evo_backup from anon, authenticated;

-- 2) child tables must cascade when a car is deleted (all already do in schema.sql; this enforces it idempotently)
do $$
declare t text; c record;
begin
  foreach t in array array['vehicle_photos','documents','vehicle_financials','reminders','expenses','ai_estimates','service_records'] loop
    for c in
      select con.conname, con.confdeltype from pg_constraint con
      where con.conrelid = ('public.'||t)::regclass and con.contype = 'f'
        and con.confrelid = 'public.vehicles'::regclass
        and con.conkey = array[(select attnum from pg_attribute where attrelid = con.conrelid and attname = 'vehicle_id')]::smallint[]
    loop
      if c.confdeltype <> 'c' then
        execute format('alter table public.%I drop constraint %I', t, c.conname);
        execute format('alter table public.%I add constraint %I foreign key (vehicle_id) references public.vehicles(id) on delete cascade', t, c.conname);
        raise notice 'migration_016: % now cascades on vehicle delete', t;
      end if;
    end loop;
  end loop;
end $$;

-- 3) import_batches
create table if not exists public.import_batches (
  id           uuid primary key,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  portfolio_id uuid,
  file_name    text check (file_name is null or char_length(file_name) <= 200),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '30 days',
  added_ids    uuid[] not null default '{}',
  changed      jsonb  not null default '[]'::jsonb,   -- [{id, before:{col:val}, after:{col:val}}] DB column names
  undone_at    timestamptz,
  undone_by    uuid,
  undo_result  jsonb
);
create index if not exists import_batches_user on public.import_batches (user_id, created_at desc);
create index if not exists import_batches_owner on public.import_batches (owner_id, created_at desc);
alter table public.import_batches enable row level security;
alter table public.import_batches force row level security;
revoke all on public.import_batches from anon, authenticated;
grant select on public.import_batches to authenticated;
drop policy if exists import_batches_select on public.import_batches;
create policy import_batches_select on public.import_batches for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
-- no insert/update/delete policies: writes only through the functions below

-- 4) tag cars added by an import
alter table public.vehicles add column if not exists import_batch_id uuid;
alter table public.vehicles add column if not exists imported_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vehicles_import_batch_fk') then
    alter table public.vehicles add constraint vehicles_import_batch_fk foreign key (import_batch_id)
      references public.import_batches(id) on delete set null;
  end if;
end $$;
create index if not exists vehicles_import_batch on public.vehicles (import_batch_id) where import_batch_id is not null;

-- 5) storage cleanup queue (files cannot be deleted from SQL in Supabase; the storage RLS also stops the app
--    from deleting files of a car that no longer exists, so the server drains this with the service role)
create table if not exists private.storage_cleanup (
  id         bigint generated always as identity primary key,
  bucket     text not null,
  path       text not null,
  reason     text not null,
  batch_id   uuid,
  queued_at  timestamptz not null default now(),
  done_at    timestamptz,
  error      text,
  unique (bucket, path)
);
revoke all on private.storage_cleanup from public, anon, authenticated;

-- helper: was this imported car changed by a person after the import?
create or replace function private.import_car_edited(p_vehicle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vehicles v where v.id = p_vehicle and v.imported_at is not null and (
       v.updated_at > v.imported_at + interval '5 seconds'
    or exists (select 1 from public.vehicle_photos  x where x.vehicle_id = v.id and x.created_at > v.imported_at + interval '5 seconds')
    or exists (select 1 from public.documents       x where x.vehicle_id = v.id and x.created_at > v.imported_at + interval '5 seconds')
    or exists (select 1 from public.expenses        x where x.vehicle_id = v.id and x.created_at > v.imported_at + interval '5 seconds')
    or exists (select 1 from public.service_records x where x.vehicle_id = v.id and x.created_at > v.imported_at + interval '5 seconds')
    or exists (select 1 from public.vehicle_financials x where x.vehicle_id = v.id and x.updated_at > v.imported_at + interval '5 seconds')));
$$;
revoke all on function private.import_car_edited(uuid) from public, anon, authenticated;

-- can the caller remove this car?  same rule as the vehicles_delete policy (owner/co-owner or admin), never archived cars
create or replace function private.import_can_remove(p_vehicle uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vehicles v where v.id = p_vehicle and not v.archived)
     and (private.is_vehicle_owner(p_vehicle) or private.is_admin());
$$;
revoke all on function private.import_can_remove(uuid) from public, anon, authenticated;

-- 6) record_import_batch: called once after the import's cars are inserted
create or replace function public.record_import_batch(p_id uuid, p_owner uuid, p_portfolio uuid, p_file text,
                                                     p_added uuid[], p_changed jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); n int; ok_ids uuid[];
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_id is null or p_owner is null then raise exception 'bad request' using errcode = '22023'; end if;
  if exists (select 1 from public.import_batches where id = p_id) then
    if (select user_id from public.import_batches where id = p_id) <> me then raise exception 'not allowed' using errcode = '42501'; end if;
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  if not (p_owner = me or private.is_admin() or private.is_collection_owner(p_owner) or private.is_client_tech(p_owner)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_changed is null or jsonb_typeof(p_changed) <> 'array' or pg_column_size(p_changed) > 200000 then p_changed := '[]'::jsonb; end if;
  -- only fresh, untagged cars of this owner that the caller can read
  select coalesce(array_agg(v.id), '{}') into ok_ids from public.vehicles v
   where v.id = any(coalesce(p_added, '{}')) and v.owner_id = p_owner and v.import_batch_id is null
     and v.created_at > now() - interval '1 day' and private.can_read_vehicle(v.id);
  insert into public.import_batches (id, user_id, owner_id, portfolio_id, file_name, added_ids, changed)
  values (p_id, me, p_owner, p_portfolio, left(nullif(btrim(p_file), ''), 200), ok_ids,
          (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(p_changed) e
            where private.try_uuid(e ->> 'id') is not null and private.can_write_vehicle((e ->> 'id')::uuid)));
  update public.vehicles set import_batch_id = p_id, imported_at = now() where id = any(ok_ids);
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'tagged', n);
end $$;

-- 7) preview for the confirm sheet
create or replace function public.import_undo_preview(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare b public.import_batches;
begin
  select * into b from public.import_batches where id = p_id;
  if not found or not (b.user_id = auth.uid() or private.is_admin()) then raise exception 'not found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'id', b.id, 'file', b.file_name, 'created_at', b.created_at, 'expires_at', b.expires_at,
    'undone_at', b.undone_at, 'expired', now() > b.expires_at,
    'restorable', jsonb_array_length(b.changed),
    'cars', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'year', v.year, 'make', v.make, 'model', v.model,
              'edited', private.import_car_edited(v.id), 'can_remove', private.import_can_remove(v.id),
              'photos', (select count(*) from public.vehicle_photos x where x.vehicle_id = v.id),
              'documents', (select count(*) from public.documents x where x.vehicle_id = v.id)) order by v.year, v.make)
            from public.vehicles v where v.import_batch_id = b.id and v.id = any(b.added_ids)), '[]'::jsonb));
end $$;

-- 7b) list the caller's recent imports (for the Recent imports card on any device)
create or replace function public.list_import_batches() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'owner_id', b.owner_id, 'file', b.file_name, 'created_at', b.created_at,
           'expires_at', b.expires_at, 'undone_at', b.undone_at, 'added', cardinality(b.added_ids), 'changed', jsonb_array_length(b.changed))
           order by b.created_at desc), '[]'::jsonb)
  from (select * from public.import_batches where user_id = auth.uid() order by created_at desc limit 10) b;
$$;

-- 8) the undo (one transaction: any error rolls everything back)
create or replace function public.undo_import(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.import_batches; me uuid := auth.uid(); gone uuid[]; kept int; restored int := 0; files int := 0;
        e jsonb; k text; vid uuid; any_col boolean; cur jsonb;
        vcols text[] := array['year','make','model','vin','color','mileage','plate','plate_region','location','insurance_carrier'];
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into b from public.import_batches where id = p_id for update;
  if not found or not (b.user_id = me or private.is_admin()) then raise exception 'not found' using errcode = 'P0002'; end if;
  if b.undone_at is not null then raise exception 'already undone' using errcode = '55000'; end if;
  if now() > b.expires_at then raise exception 'undo window (30 days) has ended' using errcode = '55000'; end if;

  select coalesce(array_agg(v.id), '{}') into gone from public.vehicles v
   where v.import_batch_id = b.id and v.id = any(b.added_ids) and private.import_can_remove(v.id);
  kept := (select count(*) from public.vehicles v where v.id = any(b.added_ids) and not (v.id = any(gone)));

  -- queue their files before the rows disappear
  insert into private.storage_cleanup (bucket, path, reason, batch_id)
    select 'vehicle-photos', x.storage_path, 'import_undo', b.id from public.vehicle_photos x where x.vehicle_id = any(gone)
    union all
    select 'vehicle-documents', x.storage_path, 'import_undo', b.id from public.documents x where x.vehicle_id = any(gone)
  on conflict (bucket, path) do nothing;
  get diagnostics files = row_count;

  delete from public.vehicles where id = any(gone);   -- photos, documents, financials, reminders, expenses, estimates cascade

  -- restore fields the import changed on existing cars, only where nobody edited them since
  for e in select * from jsonb_array_elements(b.changed) loop
    vid := private.try_uuid(e ->> 'id');
    continue when vid is null or not private.can_write_vehicle(vid);
    any_col := false;
    select to_jsonb(v) into cur from public.vehicles v where v.id = vid;
    continue when cur is null;
    for k in select jsonb_object_keys(coalesce(e -> 'before', '{}'::jsonb)) loop
      if k = any(vcols) and (cur -> k) is not distinct from (e -> 'after' -> k) then
        execute format('update public.vehicles set %I = (jsonb_populate_record(null::public.vehicles, $1)).%I where id = $2', k, k)
          using jsonb_build_object(k, e -> 'before' -> k), vid;
        any_col := true;
      elsif k = 'purchase_price' then
        if (select to_jsonb(f.purchase_price) from public.vehicle_financials f where f.vehicle_id = vid) is not distinct from (e -> 'after' -> k) then
          update public.vehicle_financials set purchase_price = nullif(e -> 'before' ->> k, '')::numeric where vehicle_id = vid;
          any_col := true;
        end if;
      end if;
    end loop;
    if any_col then restored := restored + 1; end if;
  end loop;

  update public.import_batches set undone_at = now(), undone_by = me,
    undo_result = jsonb_build_object('removed', coalesce(array_length(gone, 1), 0), 'kept', kept, 'restored', restored, 'files_queued', files)
   where id = b.id;
  insert into public.audit_log (actor_id, action, entity_table, entity_id, owner_id, details)
  values (me, 'import_undone', 'import_batches', b.id, b.owner_id,
          jsonb_build_object('removed', coalesce(array_length(gone, 1), 0), 'kept', kept, 'restored', restored));
  return jsonb_build_object('ok', true, 'removed', coalesce(array_length(gone, 1), 0), 'removed_ids', to_jsonb(gone),
                            'kept', kept, 'restored', restored, 'files_queued', files);
end $$;

-- 9) storage drain helpers (service role only; a scheduled edge function lists, deletes via Storage API, then marks done)
create or replace function public.storage_cleanup_next(p_limit int default 100) returns table(id bigint, bucket text, path text)
language sql security definer set search_path = '' as $$
  select id, bucket, path from private.storage_cleanup where done_at is null order by id limit greatest(1, least(p_limit, 1000));
$$;
create or replace function public.storage_cleanup_done(p_ids bigint[], p_error text default null) returns int
language sql security definer set search_path = '' as $$
  with u as (update private.storage_cleanup set done_at = case when p_error is null then now() end, error = p_error
             where id = any(p_ids) returning 1) select count(*)::int from u;
$$;

revoke all on function public.record_import_batch(uuid, uuid, uuid, text, uuid[], jsonb), public.import_undo_preview(uuid),
  public.undo_import(uuid), public.list_import_batches(), public.storage_cleanup_next(int), public.storage_cleanup_done(bigint[], text) from public, anon;
grant execute on function public.record_import_batch(uuid, uuid, uuid, text, uuid[], jsonb), public.import_undo_preview(uuid),
  public.undo_import(uuid), public.list_import_batches() to authenticated, service_role;
revoke all on function public.storage_cleanup_next(int), public.storage_cleanup_done(bigint[], text) from authenticated;
grant execute on function public.storage_cleanup_next(int), public.storage_cleanup_done(bigint[], text) to service_role;

-- 10) verification (one row; every *_ok should be true, backup_* = row counts copied, compare with live counts)
select
  to_regclass('public.import_batches') is not null                                   as import_batches_ok,
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.import_batches'::regclass) as import_batches_rls_ok,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='vehicles' and column_name='import_batch_id') as vehicles_import_batch_id_ok,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='vehicles' and column_name='imported_at')     as vehicles_imported_at_ok,
  to_regclass('private.storage_cleanup') is not null                                  as storage_cleanup_ok,
  to_regprocedure('public.undo_import(uuid)') is not null                             as undo_import_fn_ok,
  (select count(*) from pg_constraint con where con.confrelid = 'public.vehicles'::regclass and con.contype = 'f' and con.confdeltype = 'c'
     and con.conrelid in ('public.vehicle_photos'::regclass,'public.documents'::regclass,'public.vehicle_financials'::regclass,'public.reminders'::regclass,
                          'public.expenses'::regclass,'public.ai_estimates'::regclass,'public.service_records'::regclass)) as cascading_children_of_7,
  (select count(*) from evo_backup.vehicles_20261026b)           as backup_vehicles,          (select count(*) from public.vehicles)           as live_vehicles,
  (select count(*) from evo_backup.vehicle_financials_20261026b) as backup_vehicle_financials,(select count(*) from public.vehicle_financials) as live_vehicle_financials,
  (select count(*) from evo_backup.vehicle_photos_20261026b)     as backup_vehicle_photos,    (select count(*) from public.vehicle_photos)     as live_vehicle_photos,
  (select count(*) from evo_backup.documents_20261026b)          as backup_documents,         (select count(*) from public.documents)          as live_documents,
  (select count(*) from evo_backup.reminders_20261026b)          as backup_reminders,         (select count(*) from public.reminders)          as live_reminders,
  (select count(*) from evo_backup.expenses_20261026b)           as backup_expenses,          (select count(*) from public.expenses)           as live_expenses,
  (select count(*) from evo_backup.ai_estimates_20261026b)       as backup_ai_estimates,      (select count(*) from public.ai_estimates)       as live_ai_estimates,
  (select count(*) from evo_backup.service_records_20261026b)    as backup_service_records,   (select count(*) from public.service_records)    as live_service_records;
