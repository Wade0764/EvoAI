-- backup_022_20261031.sql  run BEFORE migration_022_requests_comments.sql. Read-only snapshot into the non-API evo_backup schema.
-- migration_022 only ADDS tables; these copies are a safety net for the rows its policies/foreign keys reference.
create schema if not exists evo_backup;
revoke all on schema evo_backup from public, anon, authenticated;
create table if not exists evo_backup.profiles_20261031           as table public.profiles;
create table if not exists evo_backup.vehicles_20261031           as table public.vehicles;
create table if not exists evo_backup.tech_access_20261031        as table public.tech_access;
do $b$ begin
  if to_regclass('public.collection_members') is not null then
    execute 'create table if not exists evo_backup.collection_members_20261031 as table public.collection_members'; end if;
end $b$;
do $b$ declare t text; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='evo_backup' and c.relname like '%\_20261031' and c.relkind='r' loop
    execute format('revoke all on evo_backup.%I from public, anon, authenticated', t);
  end loop;
end $b$;
select (select count(*) from evo_backup.profiles_20261031) profiles,(select count(*) from evo_backup.vehicles_20261031) vehicles,(select count(*) from evo_backup.tech_access_20261031) tech_access;
