-- rollback_022.sql  undo migration_022_requests_comments.sql. Idempotent.
-- Keeps a copy of every request / photo row / comment / read marker in evo_backup.*_rb022 before dropping the tables.
-- Request photo FILES stay in the vehicle-photos bucket (paths are in evo_backup.request_photos_rb022).
begin;
create schema if not exists evo_backup;
revoke all on schema evo_backup from public, anon, authenticated;
do $b$ declare t text; begin
  foreach t in array array['service_requests','request_photos','comments','comment_reads'] loop
    if to_regclass('public.'||t) is not null and to_regclass('evo_backup.'||t||'_rb022') is null then
      execute format('create table evo_backup.%I as table public.%I', t||'_rb022', t);
      execute format('revoke all on evo_backup.%I from public, anon, authenticated', t||'_rb022');
    end if;
  end loop;
end $b$;
drop table if exists public.comment_reads;
drop table if exists public.comments;
drop table if exists public.request_photos;
drop table if exists public.service_requests;
drop function if exists private.service_requests_guard();
drop function if exists private.comments_guard();
drop function if exists private.request_staff(uuid,uuid);
drop function if exists private.thread_member(uuid,uuid);
commit;
