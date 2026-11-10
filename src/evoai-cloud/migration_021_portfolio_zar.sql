-- migration_021_portfolio_zar.sql  (v33 "Which portfolio?" import step)  STATUS: NOT APPLIED. Idempotent.
-- Lets a South Africa portfolio hold prices in rand: vehicle_financials.purchase_currency accepts ZAR
-- (was USD/EUR/GBP from migration_012). portfolios.currency (migration_013) already accepts any 3-letter code.
-- Requires: migration_012_missing_fields.sql, migration_013_portfolios.sql (via golive_v21.sql).
-- Backup: private.backup_021 keeps the old constraint definition. Rollback: rollback_021_portfolio_zar.sql
begin;
do $$ begin
  if to_regclass('public.portfolios') is null then raise exception 'migration_021 needs migration_013_portfolios.sql applied first'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='vehicle_financials' and column_name='purchase_currency') then
    raise exception 'migration_021 needs migration_012_missing_fields.sql applied first'; end if;
end $$;
-- 1. backup
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
