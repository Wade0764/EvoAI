-- rollback_017_sort_order.sql: undoes migration_017 (forbid_change goes back to the migration_003 version). Card order, created_by and the merge log are dropped.
-- Merges that were NOT undone stay merged (photos/docs remain on the kept car); undo them in the app first
-- if you want them split again. The evo_backup.*_20261027 tables are kept (drop them by hand later).
begin;
drop policy if exists vehicles_delete on public.vehicles;
create policy vehicles_delete on public.vehicles for delete to authenticated
  using (private.is_collection_owner(owner_id) or (select private.is_admin()) or private.is_managing_tech(owner_id));
drop function if exists public.undo_merge(uuid);
drop function if exists public.merge_vehicles(uuid, uuid, jsonb);
drop function if exists public.delete_vehicle_permanently(uuid);
drop function if exists public.can_delete_vehicles(uuid[]);
drop function if exists public.save_vehicle_order(uuid, uuid[]);
drop function if exists private.can_delete_vehicle(uuid);
drop table if exists public.vehicle_merges;
drop function if exists private.can_edit_collection(uuid);
drop trigger if exists vehicles_guard_017 on public.vehicles;
drop function if exists private.guard_vehicle_017();
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
      raise exception 'column % is immutable on %', c, tg_table_name using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;
-- path checks back to vehicle_id (NOT VALID: rows moved by a merge keep their original folder)
do $c$ declare r record; begin
  if to_regclass('evo_backup.check_constraints_20261027') is not null then
    for r in select * from evo_backup.check_constraints_20261027 loop
      execute format('alter table %s drop constraint if exists %I', r.tbl, r.conname);
      execute format('alter table %s add constraint %I %s not valid', r.tbl, r.conname, r.def);
    end loop;
  end if;
end $c$;
drop trigger if exists vehicle_photos_folder_017 on public.vehicle_photos;
drop trigger if exists documents_folder_017 on public.documents;
drop function if exists private.set_folder_vehicle_017();
alter table public.vehicle_photos drop column if exists folder_vehicle_id;
alter table public.documents drop column if exists folder_vehicle_id;
drop index if exists public.vehicles_portfolio_sort;
alter table public.vehicles drop column if exists merged_into;
alter table public.vehicles drop column if exists created_by;
alter table public.vehicles drop column if exists sort_order;
commit;
select 'rollback 017 done' as status, not exists (select 1 from information_schema.columns where table_schema='public' and table_name='vehicles' and column_name in ('sort_order','created_by','merged_into')) as ok;
