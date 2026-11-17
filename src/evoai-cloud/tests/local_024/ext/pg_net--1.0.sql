create schema if not exists net;
create or replace function net.http_post(
  url text,
  body jsonb default null,
  params jsonb default null,
  headers jsonb default null,
  timeout_milliseconds integer default null
) returns bigint
language sql as $$ select 1::bigint $$;
