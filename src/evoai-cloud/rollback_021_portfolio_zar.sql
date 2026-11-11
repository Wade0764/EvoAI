-- rollback migration_021: restore the USD/EUR/GBP check. Refuses if any ZAR prices exist (convert or clear them first:
--   select vehicle_id, purchase_price from public.vehicle_financials where purchase_currency='ZAR';)
begin;
do $$ begin
  if exists (select 1 from public.vehicle_financials where purchase_currency='ZAR') then
    raise exception 'rollback_021: ZAR prices exist; clear them first'; end if;
end $$;
alter table public.vehicle_financials drop constraint if exists vehicle_financials_purchase_currency_v21;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.vehicle_financials'::regclass and contype='c' and pg_get_constraintdef(oid) like '%purchase_currency%') then
    alter table public.vehicle_financials add constraint vehicle_financials_purchase_currency_check check (purchase_currency in ('USD','EUR','GBP'));
  end if;
end $$;
drop table if exists private.backup_021;
commit;
