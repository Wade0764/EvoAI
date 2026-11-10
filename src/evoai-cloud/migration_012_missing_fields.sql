-- migration_012_missing_fields.sql  --  STATUS: NOT APPLIED (written 2026-10-25 for v20, do not run without Wade's approval)
-- Safe + additive only: new nullable columns, no data changes, no drops, no RLS changes.
-- Already covered by existing columns (no change needed):
--   registration  -> vehicles.plate, vehicles.plate_region (schema.sql)
--   what you paid -> vehicle_financials.purchase_price (owner-only table, existing RLS)
--   year/make/model, vin (VIN or chassis no.), color, mileage -> vehicles
-- The v20 app works without this migration: location, insurance and currency are mirrored in the
-- vehicles.notes extras (keys loc, insc, cur) and the app only writes these columns once it sees them.
begin;
alter table public.vehicles add column if not exists location text
  check (location is null or length(location) <= 120);
alter table public.vehicles add column if not exists insurance_carrier text
  check (insurance_carrier is null or length(insurance_carrier) <= 80);
-- Currency of "What you paid", kept as written on the sheet/receipt (no conversion). Lives in the
-- owner-only financials table so it follows the same visibility as the price.
alter table public.vehicle_financials add column if not exists purchase_currency text not null default 'USD'
  check (purchase_currency in ('USD','EUR','GBP'));
commit;
-- Rollback (if ever needed):
--   alter table public.vehicles drop column if exists location, drop column if exists insurance_carrier;
--   alter table public.vehicle_financials drop column if exists purchase_currency;
