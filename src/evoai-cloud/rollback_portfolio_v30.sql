-- rollback_portfolio_v30.sql  Undo golive_portfolio_v30.sql. STATUS: NOT APPLIED. Idempotent. One transaction.
-- Uses evo_backup.golive_v30_state (written by the first golive run) to undo ONLY what v30 changed:
--   * 021: restore the old purchase_currency check (refuses while ZAR prices exist).
--   * 013: if portfolios already existed before v30 (live case): remove only portfolios v30 created that hold no cars
--          and no import batches. If they did NOT exist before (pre-013 database): full 013 teardown, refused if
--          016/017 objects that depend on portfolios are present.
--   * 014 / 015: dropped only if v30 created them.
-- Backup tables evo_backup.*_20261030 are KEPT (drop them by hand once you are happy).
begin;
do $$ begin
  if to_regclass('evo_backup.golive_v30_state') is null then
    raise exception 'rollback_v30: evo_backup.golive_v30_state missing; golive_portfolio_v30.sql was never run'; end if;
  if exists (select 1 from public.vehicle_financials where purchase_currency='ZAR') then
    raise exception 'rollback_v30: ZAR prices exist; convert or clear them first (select vehicle_id, purchase_price from public.vehicle_financials where purchase_currency=''ZAR'')'; end if;
end $$;

-- 021 -----------------------------------------------------------------------
alter table public.vehicle_financials drop constraint if exists vehicle_financials_purchase_currency_v21;
do $$ declare d text; begin
  if not exists (select 1 from pg_constraint where conrelid='public.vehicle_financials'::regclass and contype='c'
                 and pg_get_constraintdef(oid) like '%purchase_currency%') then
    select v into d from evo_backup.golive_v30_state where k='old_currency_check';
    if d is null or d like '%ZAR%' then d := $c$CHECK (purchase_currency = ANY (ARRAY['USD'::text, 'EUR'::text, 'GBP'::text]))$c$; end if;
    execute 'alter table public.vehicle_financials add constraint vehicle_financials_purchase_currency_check ' || d;
  end if;
  if (select v from evo_backup.golive_v30_state where k='had_backup_021') = 'false' then
    drop table if exists private.backup_021; end if;
end $$;

-- 013 -----------------------------------------------------------------------
do $$ declare had boolean; n int; begin
  select v::boolean into had from evo_backup.golive_v30_state where k='had_portfolios';
  if to_regclass('public.portfolios') is null then return; end if;
  if had then
    if to_regclass('evo_backup.portfolios_20261030') is null then raise exception 'rollback_v30: evo_backup.portfolios_20261030 missing'; end if;
    alter table public.portfolios disable trigger portfolios_default_guard;
    execute $q$delete from public.portfolios p
      where not exists (select 1 from evo_backup.portfolios_20261030 b where b.id = p.id)
        and not exists (select 1 from public.vehicles v where v.portfolio_id = p.id)
        and (to_regclass('public.import_batches') is null
             or not exists (select 1 from public.import_batches i where i.portfolio_id = p.id))$q$;
    get diagnostics n = row_count;
    alter table public.portfolios enable trigger portfolios_default_guard;
    raise notice 'rollback_v30: removed % portfolio(s) created by v30', n;
  else
    if to_regprocedure('public.save_vehicle_order(uuid,uuid[])') is not null or to_regclass('public.import_batches') is not null then
      raise exception 'rollback_v30: 016/017 depend on portfolios; run rollback_017_sort_order.sql and rollback_016_import_undo.sql first'; end if;
    drop policy if exists portfolios_select on public.portfolios;   -- references vehicles.portfolio_id
    drop trigger if exists vehicles_portfolio_guard on public.vehicles;
    drop index if exists public.vehicles_portfolio;
    alter table public.vehicles drop column if exists portfolio_id;
    drop table public.portfolios;
    drop function if exists private.vehicles_portfolio_guard();
    drop function if exists private.portfolios_default_guard();
    drop function if exists private.default_portfolio(uuid);
  end if;
end $$;

-- 014 / 015 -------------------------------------------------------------------
do $$ begin
  if (select v from evo_backup.golive_v30_state where k='had_ai_import_log')='false' then drop table if exists public.ai_import_log; end if;
  if (select v from evo_backup.golive_v30_state where k='had_cost_confirmed')='false' then
    alter table public.vehicle_financials drop column if exists cost_confirmed; end if;
  if (select v from evo_backup.golive_v30_state where k='had_cost_flag_reason')='false' then
    alter table public.vehicle_financials drop column if exists cost_flag_reason; end if;
end $$;
commit;

-- verification
select
  exists(select 1 from pg_constraint where conname='vehicle_financials_purchase_currency_v21') as zar_check_still_there_expect_false,
  (select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.vehicle_financials'::regclass and contype='c'
     and pg_get_constraintdef(oid) like '%purchase_currency%' limit 1) as currency_check_now,
  to_regclass('public.portfolios') is not null as portfolios_present,
  (select count(*) from public.vehicles) as vehicles_total,
  (select count(*) from evo_backup.vehicles_20261030) as backup_vehicles;
