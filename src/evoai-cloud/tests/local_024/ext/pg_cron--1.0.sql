create schema if not exists cron;
create table if not exists cron.job (
  jobid bigint generated always as identity primary key,
  jobname text unique,
  schedule text,
  command text
);
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint
language plpgsql as $$
declare id bigint;
begin
  insert into cron.job(jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid into id;
  return id;
end $$;
create or replace function cron.unschedule(p_jobid bigint) returns boolean
language plpgsql as $$
begin
  delete from cron.job j where j.jobid = p_jobid;
  return true;
end $$;
