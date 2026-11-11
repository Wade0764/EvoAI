-- migration_014_import_log.sql  (v21 import)  STATUS: NOT APPLIED. Additive; safe to re-run.
-- Usage log for the import-sheet edge function (service role only; no policies).
-- Daily cap = 5 distinct import_id per user per UTC day (enforced in the function, fails closed).
create table if not exists public.ai_import_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null,
  import_id   text not null check (char_length(import_id) between 8 and 64),
  mode        text not null check (mode in ('headers','rows')),
  created_at  timestamptz not null default now(),
  status      text not null,             -- ok | error | rate_limited | not_configured | bad_request
  provider    text, model text,
  rows_found  integer, latency_ms integer, input_bytes integer,
  prompt_tokens integer, output_tokens integer,
  error       text
);
create index if not exists ai_import_log_user_time on public.ai_import_log (user_id, created_at desc);
alter table public.ai_import_log enable row level security;
revoke all on public.ai_import_log from anon, authenticated;
