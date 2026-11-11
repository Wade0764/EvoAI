-- migration_008_photo_tags.sql -- AI photo dump: 8 portfolio sections + AI tag provenance + tag-photos usage log. NOT APPLIED.
-- Depends on migration_007_doc_ai.sql (and 006). Safe to re-run.
-- Tags: Exterior, Interior, Engine, Wheels, Details, Documents, Work, Other.
-- 'Detail' (v11-v13 clients) stays accepted so a not-yet-refreshed app never fails; existing rows are renamed to 'Details'.
-- ROLLBACK: drop table public.ai_photo_log; alter table public.vehicle_photos drop column tag_source, drop column tag_confidence;
--           update public.vehicle_photos set tag=null where tag in ('Wheels','Documents','Other'); update ... set tag='Detail' where tag='Details'; then re-add the 006 check.
do $$ begin
  if to_regclass('public.ai_doc_log') is null then
    raise exception 'migration_008 needs migration_007_doc_ai.sql applied first';
  end if;
end $$;

alter table public.vehicle_photos drop constraint if exists vehicle_photos_tag_chk;
update public.vehicle_photos set tag = 'Details' where tag = 'Detail';
alter table public.vehicle_photos add constraint vehicle_photos_tag_chk
  check (tag is null or tag in ('Exterior','Interior','Engine','Wheels','Details','Documents','Work','Other','Detail'));

alter table public.vehicle_photos add column if not exists tag_source text;
alter table public.vehicle_photos add column if not exists tag_confidence numeric(4,3);
alter table public.vehicle_photos drop constraint if exists vehicle_photos_tag_source_chk;
alter table public.vehicle_photos add  constraint vehicle_photos_tag_source_chk check (tag_source is null or tag_source in ('ai','manual'));
alter table public.vehicle_photos drop constraint if exists vehicle_photos_tag_conf_chk;
alter table public.vehicle_photos add  constraint vehicle_photos_tag_conf_chk check (tag_confidence is null or tag_confidence between 0 and 1);

-- usage log (service role only; no policies). photo_count drives the per-user daily cap.
create table if not exists public.ai_photo_log (
  id           bigint generated always as identity primary key,
  user_id      uuid not null,
  created_at   timestamptz not null default now(),
  status       text not null,            -- ok | error | rate_limited | not_configured | not_allowed
  vehicle_id   uuid,
  photo_count  integer not null default 0 check (photo_count >= 0 and photo_count <= 16),
  provider     text, model text,
  latency_ms   integer, prompt_tokens integer, output_tokens integer,
  error        text
);
create index if not exists ai_photo_log_user_time on public.ai_photo_log (user_id, created_at desc);
alter table public.ai_photo_log enable row level security;
revoke all on public.ai_photo_log from anon, authenticated;
