-- migration_005_value_estimates.sql
-- AI value estimate (estimate-value Edge Function): extra ai_estimates columns, a 7-day market cache, a usage log (rate limits),
-- and a weekly pg_cron + pg_net schedule. Safe to re-run (idempotent). NOT applied yet.
-- Run in the Supabase SQL editor AFTER migration_004. Everything written here is service-role only (RLS on, no client policies).
-- Health score needs NO SQL: it is computed on the device from data the user can already see.

-- 1) ai_estimates: mid value, plain-language notes, the inputs used, and the cache key it came from.
alter table public.ai_estimates add column if not exists value_mid numeric(12,2);
alter table public.ai_estimates add column if not exists notes     text;
alter table public.ai_estimates add column if not exists inputs    jsonb not null default '{}'::jsonb;
alter table public.ai_estimates add column if not exists cache_key text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ai_estimates_mid_between') then
    alter table public.ai_estimates add constraint ai_estimates_mid_between
      check (value_mid is null or (value_low is not null and value_high is not null and value_mid between value_low and value_high));
  end if;
end $$;
-- ai_estimates keeps its existing policy: SELECT only (owner/admin, tech with view_value_estimate). No insert/update grant exists.

-- 2) Market cache: one researched baseline per year/make/model/trim, valid 7 days. Mileage and condition are applied locally per car.
create table if not exists public.value_estimate_cache (
  cache_key   text primary key,                 -- year|make|model|trim, lower-cased
  year        int  not null,
  make        text not null,
  model_name  text not null,
  trim        text not null default '',
  base_low    numeric(12,2) not null,
  base_mid    numeric(12,2) not null,
  base_high   numeric(12,2) not null,
  ref_mileage int  not null,                    -- typical mileage the baseline assumes
  confidence  numeric(4,3) not null default 0,
  notes       text,
  sources     jsonb not null default '[]'::jsonb,  -- [{title,url}] from Google grounding metadata only
  as_of       date not null default current_date,
  model       text,                             -- Gemini model that answered
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  check (base_low <= base_mid and base_mid <= base_high)
);
create index if not exists value_estimate_cache_exp on public.value_estimate_cache (expires_at);
alter table public.value_estimate_cache enable row level security;
revoke all on public.value_estimate_cache from anon, authenticated;

-- 3) Usage log: per-user daily limit and the 1-refresh-per-vehicle-per-day rule. No images, no VINs.
create table if not exists public.ai_value_log (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid,                             -- null for the weekly job
  vehicle_id  uuid,
  kind        text not null check (kind in ('user','weekly')),
  status      text not null,                    -- ok | cached | error | rate_limited | not_configured | not_enabled | run
  model       text,
  latency_ms  integer,
  error       text
);
create index if not exists ai_value_log_user_time    on public.ai_value_log (user_id, created_at desc);
create index if not exists ai_value_log_vehicle_time on public.ai_value_log (vehicle_id, created_at desc);
alter table public.ai_value_log enable row level security;
revoke all on public.ai_value_log from anon, authenticated;

-- 4) Weekly schedule: pg_cron calls the function through pg_net every Monday 09:00 UTC (05:00 New York in summer, 04:00 in winter).
--    The call carries a shared secret (header x-cron-secret) instead of a user JWT. The secret lives in Supabase Vault and in the
--    function secret CRON_SECRET; it is NOT in this file. Do this once, before step 5 (replace the placeholders, run separately):
--      select vault.create_secret('PASTE_LONG_RANDOM_STRING', 'evoai_cron_secret');
--      select vault.create_secret('https://xosbchskdtkxogppmkex.supabase.co', 'evoai_project_url');
--      -- and: supabase secrets set CRON_SECRET=PASTE_LONG_RANDOM_STRING   (the same string)
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.run_weekly_value_estimates() returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  u text; s text; rid bigint;
begin
  select decrypted_secret into u from vault.decrypted_secrets where name = 'evoai_project_url' limit 1;
  select decrypted_secret into s from vault.decrypted_secrets where name = 'evoai_cron_secret' limit 1;
  if u is null or s is null then
    raise notice 'evoai weekly value job skipped: vault secrets missing';
    return null;
  end if;
  select net.http_post(
    url     := u || '/functions/v1/estimate-value',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', s),
    body    := jsonb_build_object('mode', 'weekly'),
    timeout_milliseconds := 120000
  ) into rid;
  return rid;
end $$;
revoke all on function public.run_weekly_value_estimates() from public, anon, authenticated;

-- Re-runnable: drop any previous schedule of the same name, then create it.
do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'evoai-weekly-value';
  perform cron.schedule('evoai-weekly-value', '0 9 * * 1', $job$select public.run_weekly_value_estimates();$job$);
end $$;
-- The Edge Function must be deployed with JWT verification OFF for the weekly call only if your project rejects calls without a user JWT:
--   supabase functions deploy estimate-value --no-verify-jwt     (the function itself checks the user JWT or the cron secret, so this is safe)
-- Turn the schedule off any time:  select cron.unschedule('evoai-weekly-value');
-- Alternative with no SQL scheduler: Supabase dashboard > Edge Functions > estimate-value > Schedule (cron '0 9 * * 1', body {"mode":"weekly"}) plus the x-cron-secret header.
