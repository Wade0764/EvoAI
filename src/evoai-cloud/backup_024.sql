-- backup_024.sql  Snapshot before migration_024. NOT applied to the live project.
-- Safe to re-run: the first copy is kept. Nothing in public is modified.
begin;
create schema if not exists evo_backup;
revoke all on schema evo_backup from public, anon, authenticated;
do $b$
declare t text;
begin
  foreach t in array array['service_requests','request_photos','tech_access','tech_grant_vehicles','tech_permissions','vehicles','profiles'] loop
    if to_regclass('public.'||t) is not null and to_regclass('evo_backup.'||t||'_20261117') is null then
      execute format('create table evo_backup.%I as table public.%I', t||'_20261117', t);
      execute format('revoke all on evo_backup.%I from public, anon, authenticated', t||'_20261117');
    end if;
  end loop;
end $b$;
commit;
