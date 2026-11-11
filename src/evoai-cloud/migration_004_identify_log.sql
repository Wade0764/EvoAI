-- migration_004_identify_log.sql
-- Usage log + per-user rate limit for the identify-vehicle Edge Function.
-- Run once in the Supabase SQL editor BEFORE turning the function on. Safe to re-run.
-- Only the Edge Function (service role) touches this table. RLS is on with NO policies,
-- so anon/authenticated API users cannot read or write it. No images or VINs are stored.
create table if not exists public.ai_identify_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null,
  created_at  timestamptz not null default now(),
  kind        text not null check (kind in ('vision','vin')),
  status      text not null,          -- ok | no_vehicle | error | rate_limited | not_configured
  provider    text,
  model       text,
  confidence  numeric(4,3),
  latency_ms  integer,
  error       text
);
create index if not exists ai_identify_log_user_time on public.ai_identify_log (user_id, created_at desc);
alter table public.ai_identify_log enable row level security;
revoke all on public.ai_identify_log from anon, authenticated;
