-- v17 pre-deploy backup in a non-API schema
create schema if not exists evo_backup;
revoke all on schema evo_backup from anon, authenticated;
create table evo_backup.vehicles_20261019 as select * from public.vehicles where owner_id='bb0f122f-6e7d-4ba2-a8ac-c626b85db75a';
create table evo_backup.vehicle_photos_20261019 as select * from public.vehicle_photos where vehicle_id in (select id from evo_backup.vehicles_20261019);
create table evo_backup.documents_20261019 as select * from public.documents where vehicle_id in (select id from evo_backup.vehicles_20261019);
create table evo_backup.ai_estimates_20261019 as select * from public.ai_estimates where vehicle_id in (select id from evo_backup.vehicles_20261019);
create table evo_backup.reminders_20261019 as select * from public.reminders where vehicle_id in (select id from evo_backup.vehicles_20261019);
select (select count(*) from evo_backup.vehicles_20261019) v,(select count(*) from evo_backup.vehicle_photos_20261019) p,(select count(*) from evo_backup.documents_20261019) d,(select count(*) from evo_backup.ai_estimates_20261019) e,(select count(*) from evo_backup.reminders_20261019) r;
