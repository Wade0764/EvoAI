-- Local-only stand-ins for Supabase auth and storage. Not applied to the live project.
create schema if not exists auth;
create schema if not exists storage;
create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'sub', nullif(current_setting('request.jwt.claim.sub', true), ''),
    'email', nullif(current_setting('request.jwt.claim.email', true), ''),
    'role', coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated')
  )
$$;

create table if not exists storage.buckets (
  id text primary key,
  name text,
  public boolean,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Supabase foldername() is the directory segments only, not the file name.
create or replace function storage.foldername(p_name text) returns text[]
language sql immutable as $$
  select case
    when coalesce(p_name, '') = '' then '{}'::text[]
    else (string_to_array(p_name, '/'))[1:array_length(string_to_array(p_name, '/'), 1) - 1]
  end
$$;
alter table storage.objects enable row level security;
alter table storage.objects force row level security;
grant usage on schema auth, storage, public to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
grant select on storage.buckets to authenticated, service_role;
