-- rollback_018: back to the v25 log shape. Rows of the new kinds are removed first (they would violate the old check).
delete from public.ai_value_log where kind in ('first','collection');
alter table public.ai_value_log drop constraint if exists ai_value_log_kind_chk;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.ai_value_log'::regclass and conname = 'ai_value_log_kind_check') then
    alter table public.ai_value_log add constraint ai_value_log_kind_check check (kind in ('user','weekly'));
  end if;
end $$;
drop index if exists public.ai_value_log_owner_time;
drop index if exists public.ai_value_log_month;
alter table public.ai_value_log drop column if exists owner_id;
