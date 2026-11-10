-- migration_015_cost_confirm.sql  (v21c cost check)  STATUS: NOT APPLIED. Additive; safe to re-run.
-- Flagged "What you paid" amounts are saved but marked unconfirmed until the owner/admin confirms or edits them.
-- Existing rows default to confirmed. The app falls back to hidden notes extras (cfc/cfr) when these columns are absent.
alter table public.vehicle_financials add column if not exists cost_confirmed boolean not null default true;
alter table public.vehicle_financials add column if not exists cost_flag_reason text;
comment on column public.vehicle_financials.cost_confirmed is 'false = purchase_price was flagged by the cost check and still needs confirming';
comment on column public.vehicle_financials.cost_flag_reason is 'Why the cost was flagged (e.g. Looks low for this car)';
