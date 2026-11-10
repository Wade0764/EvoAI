-- migration_001.sql  (OPTIONAL, NOT APPLIED, NOT REQUIRED)
-- evoai-cloud.html works against the schema exactly as applied. Everything below only removes
-- workarounds (see CLOUD_NOTES.md "Workarounds"). Review before running; run in the SQL editor as postgres.
-- Safe to run more than once.

-- 1) Invite labels: lets an owner name an invite ("Tom, mechanic"). The app already tries the 4-arg
--    create_invite(p_label) first and falls back to the 3-arg call when it is missing (PGRST202).
alter table public.invites add column if not exists label text check (label is null or length(label) <= 80);

-- Replacement for the 3-arg function, same body plus label. Copy the current body of
-- public.create_invite (schema.sql ~line 691) and add `label` to the INSERT column list/values:
--   create or replace function public.create_invite(p_kind text, p_vehicle_id uuid default null,
--                                                   p_email text default null, p_label text default null)
--   returns table (invite_id uuid, code text, expires_at timestamptz) ... insert into public.invites (..., label) values (..., nullif(btrim(p_label),''));
-- Then: grant execute on function public.create_invite(text, uuid, text, text) to authenticated;
--       drop function public.create_invite(text, uuid, text);   -- only after the grant above
-- (Left as a comment on purpose: do not paste partial function bodies blindly.)

-- 2) First-class columns instead of the "~evo~" JSON suffix the app packs into free-text columns.
--    Today: vehicles.notes carries trim/insured value/service interval; documents.title carries type/expiry/notes;
--    expenses.notes carries category/value-add/receipt link; advisories.body carries category/cost text.
alter table public.vehicles   add column if not exists trim text;
alter table public.vehicles   add column if not exists insured_value numeric(12,2) check (insured_value is null or insured_value >= 0);
alter table public.documents  add column if not exists expires_on date;
alter table public.documents  add column if not exists notes text;
alter table public.expenses   add column if not exists value_add boolean not null default false;
alter table public.expenses   add column if not exists document_id uuid references public.documents(id) on delete set null;
-- After applying these, the app's packX()/unpackX() calls in p1_data.js (KIND.* insert/update + loadAll) should be switched
-- to the real columns. Until then the app keeps working and ignores the new columns.

-- 3) Private (tech-to-tech/owner-invisible) advisory notes: the app drops the old "Internal notes" field because
--    advisories are readable by the owner. If wanted back, add a table readable only by the authoring tech/admin:
create table if not exists public.advisory_private_notes (
  advisory_id uuid primary key references public.advisories(id) on delete cascade,
  author_id   uuid not null references public.profiles(id),
  note        text not null check (length(note) <= 1000),
  created_at  timestamptz not null default now()
);
alter table public.advisory_private_notes enable row level security;
create policy apn_author_rw on public.advisory_private_notes for all to authenticated
  using (author_id = auth.uid() or private.is_admin()) with check (author_id = auth.uid() or private.is_admin());
grant select, insert, update, delete on public.advisory_private_notes to authenticated;
