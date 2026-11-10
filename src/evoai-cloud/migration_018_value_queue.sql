-- migration_018 (v25b): automatic first values, "Refresh values now" and the monthly spend cap for estimate-value.
-- Idempotent. Rollback: rollback_018_value_queue.sql.
-- * ai_value_log.kind now also allows 'first' (auto value of a new / imported / pending car) and 'collection' (Refresh values now).
-- * ai_value_log.owner_id: which collection a call was for (per-collection daily limits).
-- * status 'capped' = refused by the monthly live-call cap (VALUE_MONTHLY_LIVE_CAP, default 200 = about $7 of grounded Gemini).
alter table public.ai_value_log add column if not exists owner_id uuid;
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.ai_value_log'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%' loop
    execute 'alter table public.ai_value_log drop constraint ' || quote_ident(c);
  end loop;
  alter table public.ai_value_log add constraint ai_value_log_kind_chk check (kind in ('user','weekly','first','collection'));
end $$;
create index if not exists ai_value_log_owner_time on public.ai_value_log (owner_id, kind, created_at desc);
create index if not exists ai_value_log_month on public.ai_value_log (created_at) where vehicle_id is not null and status in ('ok','error');
-- backfill owner_id for old rows (best effort)
update public.ai_value_log l set owner_id = v.owner_id from public.vehicles v where l.owner_id is null and l.vehicle_id = v.id;
