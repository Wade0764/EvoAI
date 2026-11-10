-- backup_023.sql  Snapshot before migration_023. NOT applied to the live project.
-- Safe to re-run: the first copy is kept. Nothing in public is modified.
begin;
create schema if not exists evo_backup;
revoke all on schema evo_backup from public, anon, authenticated;
do $b$
declare t text;
begin
  foreach t in array array['profiles','vehicles','tech_access','tech_permissions','collection_members','invites','service_requests','comments','documents','vehicle_photos','reminders'] loop
    if to_regclass('public.'||t) is not null and to_regclass('evo_backup.'||t||'_20261110') is null then
      execute format('create table evo_backup.%I as table public.%I', t||'_20261110', t);
      execute format('revoke all on evo_backup.%I from public, anon, authenticated', t||'_20261110');
    end if;
  end loop;
end $b$;
commit;
