-- migration_007_doc_ai.sql  -- AI document scanning + AI reminders (EvoAI). NOT APPLIED.
-- Depends on migration_006_portfolio.sql (and therefore 003/004/005b). Safe to re-run.
-- Adds: extracted fields on documents, AI source/reason on reminders, a service-role-only usage log for
-- the scan-document Edge Function, and add_doc_reminders() so an owner, or a tech who may add documents,
-- can file the AI reminders that come from one document (techs cannot insert reminders directly under RLS).
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='vehicle_photos' and column_name='thumb_path') then
    raise exception 'migration_007 needs migration_006_portfolio.sql applied first';
  end if;
end $$;

-- ---------- documents: extracted fields ----------
alter table public.documents add column if not exists doc_category text;
alter table public.documents add column if not exists doc_date     date;
alter table public.documents add column if not exists vendor       text;
alter table public.documents add column if not exists mileage      int;
alter table public.documents add column if not exists amount       numeric(12,2);
alter table public.documents add column if not exists services     jsonb not null default '[]'::jsonb;
alter table public.documents add column if not exists expires_on   date;
alter table public.documents add column if not exists ai_status    text not null default 'manual';
alter table public.documents add column if not exists ai_confidence numeric(4,3);
alter table public.documents add column if not exists ai_summary   text;
alter table public.documents add column if not exists ai_model     text;
alter table public.documents add column if not exists scanned_at   timestamptz;

alter table public.documents drop constraint if exists documents_doc_category_chk;
alter table public.documents add  constraint documents_doc_category_chk check (doc_category is null or doc_category in
  ('repair_invoice','service_record','registration','insurance','title','inspection','warranty','receipt','other'));
alter table public.documents drop constraint if exists documents_ai_status_chk;
alter table public.documents add  constraint documents_ai_status_chk check (ai_status in ('manual','scanned','edited','failed'));
alter table public.documents drop constraint if exists documents_fields_chk;
alter table public.documents add  constraint documents_fields_chk check (
      (mileage is null or mileage between 0 and 5000000)
  and (amount is null or amount between 0 and 100000000)
  and jsonb_typeof(services) = 'array' and jsonb_array_length(services) <= 40
  and (vendor is null or length(vendor) <= 120)
  and (ai_summary is null or length(ai_summary) <= 600)
  and (ai_confidence is null or ai_confidence between 0 and 1));
create index if not exists documents_vehicle_docdate_idx on public.documents (vehicle_id, doc_date desc nulls last, created_at desc);

-- ---------- reminders: AI provenance ----------
alter table public.reminders add column if not exists ai_generated boolean not null default false;
alter table public.reminders add column if not exists source_document_id uuid references public.documents(id) on delete set null;
alter table public.reminders add column if not exists ai_reason text;
alter table public.reminders drop constraint if exists reminders_ai_reason_chk;
alter table public.reminders add  constraint reminders_ai_reason_chk check (ai_reason is null or length(ai_reason) <= 600);
create index if not exists reminders_source_doc_idx on public.reminders (source_document_id) where source_document_id is not null;

-- ---------- usage log (service role only; no policies) ----------
create table if not exists public.ai_doc_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null,
  created_at  timestamptz not null default now(),
  status      text not null,           -- ok | error | rate_limited | not_configured | not_allowed
  provider    text, model text, category text,
  confidence  numeric(4,3), latency_ms integer, input_bytes integer,
  prompt_tokens integer, output_tokens integer,
  error       text
);
create index if not exists ai_doc_log_user_time on public.ai_doc_log (user_id, created_at desc);
alter table public.ai_doc_log enable row level security;
revoke all on public.ai_doc_log from anon, authenticated;

-- ---------- add_doc_reminders ----------
-- p_items: [{kind,title,due_date,due_mileage,repeat_months,repeat_miles,reason}] (max 6).
-- Replaces earlier, not-completed AI reminders from the same document (so a re-scan never duplicates).
create or replace function public.add_doc_reminders(p_document_id uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d record; it jsonb; ids uuid[] := '{}'; nid uuid; k text; t text; dd date; dm int; removed int;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode='42501'; end if;
  select id, vehicle_id, owner_only into d from public.documents where id = p_document_id;
  if not found then raise exception 'document_not_found' using errcode='P0002'; end if;
  if not (private.is_owner_or_admin(d.vehicle_id)
          or (not d.owner_only and private.can_write_vehicle(d.vehicle_id)
              and private.tech_can(d.vehicle_id,'view_documents') and private.tech_can(d.vehicle_id,'can_add_documents'))) then
    raise exception 'not_allowed' using errcode='42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'bad_items' using errcode='22023'; end if;
  if jsonb_array_length(p_items) > 6 then raise exception 'too_many_items' using errcode='22023'; end if;
  delete from public.reminders where source_document_id = p_document_id and ai_generated and completed_at is null;
  get diagnostics removed = row_count;
  for it in select * from jsonb_array_elements(p_items) loop
    k := coalesce(it->>'kind','custom');
    if k not in ('tag','insurance','inspection','service','custom') then raise exception 'bad_kind' using errcode='22023'; end if;
    t := btrim(coalesce(it->>'title',''));
    if t = '' or length(t) > 120 then raise exception 'bad_title' using errcode='22023'; end if;
    dd := nullif(it->>'due_date','')::date;
    dm := nullif(it->>'due_mileage','')::int;
    if dd is null and dm is null then raise exception 'due_required' using errcode='22023'; end if;
    insert into public.reminders (vehicle_id, kind, title, due_date, due_mileage, repeat_months, repeat_miles,
                                  created_by, ai_generated, source_document_id, ai_reason)
    values (d.vehicle_id, k, t, dd, dm, nullif(it->>'repeat_months','')::int, nullif(it->>'repeat_miles','')::int,
            (select auth.uid()), true, p_document_id, left(nullif(btrim(coalesce(it->>'reason','')),''), 600))
    returning id into nid;
    ids := ids || nid;
  end loop;
  return jsonb_build_object('inserted', coalesce(array_length(ids,1),0), 'replaced', removed, 'ids', to_jsonb(ids));
end $$;
revoke all on function public.add_doc_reminders(uuid, jsonb) from public, anon;
grant execute on function public.add_doc_reminders(uuid, jsonb) to authenticated, service_role;
