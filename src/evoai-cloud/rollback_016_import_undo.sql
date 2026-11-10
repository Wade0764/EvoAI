-- rollback_016_import_undo.sql  Undoes migration_016 structure. Does NOT bring back cars already removed by an undo:
-- restore those from evo_backup.*_20261026b (or a later backup) if ever needed. Cascade FKs from step 2 are left as-is (they were already cascade).
drop function if exists public.undo_import(uuid);
drop function if exists public.import_undo_preview(uuid);
drop function if exists public.list_import_batches();
drop function if exists public.record_import_batch(uuid, uuid, uuid, text, uuid[], jsonb);
drop function if exists public.storage_cleanup_next(int);
drop function if exists public.storage_cleanup_done(bigint[], text);
drop function if exists private.import_car_edited(uuid);
drop function if exists private.import_can_remove(uuid);
alter table public.vehicles drop constraint if exists vehicles_import_batch_fk;
drop index if exists public.vehicles_import_batch;
alter table public.vehicles drop column if exists import_batch_id, drop column if exists imported_at;
drop table if exists public.import_batches;
drop table if exists private.storage_cleanup;   -- check it is empty (done_at not null everywhere) before dropping
-- backups evo_backup.*_20261026b are kept on purpose; drop manually when no longer needed.
