# EVOai cloud build - notes

Single file app: `evoai-cloud.html` (Obsidian UI + inlined supabase-js 2.45.4 + the app). Built from
`../improved/evoai-obsidian.html` (never modified) by `tools/build_cloud.py` (sources: `tools/p1_data.js`, `p2_auth.js`,
`p3_fns.js`, `patches_js.py`, `patches_html.py`, `auth.html`, `extra.css`). Rebuild + test: `tests/run_all.sh`.

Backend: `https://xosbchskdtkxogppmkex.supabase.co`, anon JWT embedded (role=anon, public by design). No service-role key anywhere.
`vendor/supabase.js` has ONE edit vs the CDN file: the webpack "Automatic publicPath" throw was replaced by `e="./"`
(otherwise the bundle throws when inlined in an HTML page and `window.supabase` never exists).

## What the app calls

### Auth (supabase-js)
`signUp` (options.emailRedirectTo = current page URL, options.data = {display_name, pending_invite}), `signInWithPassword`,
`resend({type:'signup'})`, `resetPasswordForEmail(redirectTo)`, `updateUser({password})` / `updateUser({data:{pending_invite:null}})`,
`getSession`, `getUser`, `signOut`, `onAuthStateChange` (SIGNED_IN, SIGNED_OUT, PASSWORD_RECOVERY). Session persists in localStorage key `evoai-cloud-auth`.

### Tables (reads are `select('*')`; every column below was probed live, see "Verification")
| table | read | write (columns) |
|---|---|---|
| profiles | all visible | none (role/name come from the signup trigger) |
| vehicles | yes | insert/update: id, owner_id(insert), year, make, model, color, nickname, vin(upper-cased), mileage, notes, archived; delete |
| vehicle_financials | yes | insert/update/delete: vehicle_id, purchase_price, purchase_date (owner/admin only; owner_id set by trigger) |
| reminders | yes | insert/update/delete: id, vehicle_id, kind(tag/insurance/inspection/service/custom), title, due_date, due_mileage, repeat_months, repeat_miles, completed_at, created_by |
| service_records | yes | insert: id, vehicle_id, created_by, title, description, category('maintenance'), performed_on, mileage, cost; delete |
| expenses | yes | insert/update/delete: id, vehicle_id, category, amount, incurred_on, notes, created_by |
| documents | yes | insert/delete: id, vehicle_id, uploaded_by, kind, title, storage_path, mime_type, size_bytes, owner_only |
| vehicle_photos | yes | insert/update/delete: id, vehicle_id, uploaded_by, storage_path, is_cover, sort_order |
| advisories | yes | insert: id, vehicle_id, from_tech_id, title, body, severity, estimated_cost; update: status, owner_response; delete |
| ai_estimates | read only | none (service role writes) |
| tech_access, tech_permissions | read | none directly (RPCs only) |
| invites, transfers, vehicle_archives | read | none directly (RPCs only) |
| audit_log | read (admin/owner only) | none |
| my_tech_visibility (view) | read (techs) | - |

### RPC functions
`create_invite(p_kind, p_vehicle_id, p_email[, p_label])`, `redeem_invite(p_code)`, `revoke_invite(p_invite_id)`,
`revoke_tech_access(p_access_id)`, `set_tech_permission(p_access_id, p_permission, p_value, p_vehicle_id)`,
`reset_tech_permission_override(p_access_id, p_vehicle_id)`, `initiate_transfer(p_vehicle_id, p_buyer_email)`, `cancel_transfer(p_transfer_id)`.
`create_invite` is first tried with `p_label`; on PGRST202 (current live state) it falls back to the 3-arg call. `complete_reminder` is not used.

### Storage
`vehicle-photos` and `vehicle-documents` (private). Path `{owner_id}/{vehicle_id}/{uuid}.{ext}`; display via `createSignedUrl(s)` (1 hour, re-signed on every load).

## Mapping decisions / mismatches (schema vs the Obsidian data model) - all handled without schema changes
1. Roles: profile `owner` -> Owner views; `tech` -> Advisor/Tech views; `admin` -> advisor views plus "View as" (owner/tech) and Team page.
2. Techs cannot use the old "advisor does everything" powers. Every action is gated by `can()` using `my_tech_visibility`; owners/admin always pass.
   Tech UI hides Edit/Archive/Transfer/Reminder/Expense actions unless granted; vehicle updates by techs are never sent (RLS would drop them silently).
3. Owner-only vs shared: expenses, reminders and purchase data are only written by owner/admin. A tech's "Log service" with a cost writes the
   service record (cost stored there) and creates an expense only when `can_add_expenses` is on.
4. "Extras" encoding: columns the schema does not have are packed after a `~evo~` marker (JSON) at the end of a free-text column:
   vehicles.notes (trim, insured value, service interval, ins repeat), documents.title (app type, expiry, notes), expenses.notes (UI category,
   value-add flag, receipt document id), advisories.body (category, value impact, cost text). The visible text is unpacked on load.
   `migration_001.sql` (optional, not applied) would replace this with real columns.
5. Documents are file-backed. A document saved without a file uploads a tiny text placeholder (`record.txt`) so the row satisfies the path rules.
   Expense receipts become a linked `documents` row (kind `receipt`). PDFs and images accepted (PDF max 10 MB, images resized to <=1.5 MB).
6. Dates the old app kept on the vehicle (registration, insurance, inspection, next service) are real `reminders` rows (kinds tag/insurance/inspection/service),
   kept in sync by diff (per-kind ids live in `v._rem`). Custom reminders = kind `custom`. "Mark renewed" updates `due_date`.
7. Advisories: "Internal notes (never shown to owner)" removed (advisories are owner-readable). Status `open` <-> `pending`; owner response text -> `owner_response`.
   Re-send of declined advisories is disabled (DB trigger forbids it): send a new advisory. Completion note prompt removed (no column).
   Advisories require a vehicle (column not null).
8. Transfers: seller picks nothing from a client list anymore; `initiate_transfer` returns a one-time code; the buyer redeems it under Account > Redeem a code.
   Sale price/note fields dropped (no columns). Seller's read-only archive comes from `vehicle_archives` (label-only snapshot).
9. Invites: owner creates tech invites on the Techs page (all vehicles, or one vehicle); techs create client invites ("Invite client"). Label is stored only if migration_001 is applied.
10. AI estimates: read-only from `ai_estimates`; "Calculated by AI once connected" when none or not permitted.
11. Removed on purpose: device-local accounts/hashes, backup import, demo wipe, add-tech modal, delete-my-account (shows a calm message; deleting an auth user needs the service role).
12. Audit "Activity": admin/owner see `audit_log`; techs see only this-session actions (RLS).

## Sign-up and email confirmation (Confirm email = ON)
Sign-up shows a "Check your email" panel (with resend). `emailRedirectTo` = the URL of the page the user is on (e.g. `https://wade0764.github.io/EvoAI/`).
An optional invite code typed at sign-up is stored in user metadata and redeemed automatically on the first sign-in after confirming (works across devices).
Password reset: login -> Forgot password -> email link -> PASSWORD_RECOVERY panel -> new password.

## Verification done
* `tests/e2e.js` (68 assertions, all pass): mocked supabase-js with RLS-style read/write rules; every insert/update column and enum is validated against
  columns parsed from `schema.sql` (`tests/schema_cols.json`) plus CHECK rules (vin, reminders due, storage path). Covers auth, owner, tech, admin view-as, offline/failed-write, desktop+mobile overflow.
* `tests/live_probe.py` (read-only, anon key only; no users created, nothing written): every table/view column the app uses exists in the live project
  (PostgREST answers 42703 for unknown columns, 42501 for known ones), and all 8 RPC names + argument names resolve (42501 for anon, not PGRST202).
  `create_invite` with `p_label` does not exist yet (expected).
* Real (unmocked) page boot in Chrome: supabase-js initialises, login screen shows, no console errors.
* PWA: manifest + icons 200, SW registers and caches the shell, never touches Supabase/cross-origin, iOS hint shows only on iOS and not when standalone.

## NOT tested against the real backend
Real sign-up/confirm email, sign-in, any RLS-dependent read or write, storage uploads/signed URLs, all RPC bodies, the `profiles` trigger, invite/transfer redeem flows.
RLS behaviour in the mock is a re-implementation of the intended rules, not the real policies. First real run should be: sign in as Wade (after SETUP_ADMIN.md),
create an owner + tech via sign-up, create/redeem codes, toggle permissions, upload a photo and a PDF.

## Caveats
* Hosting path: `emailRedirectTo` follows the page URL. If the cloud app is not served at `https://wade0764.github.io/EvoAI/` (that URL is the live local-only app), add the real path to the Auth redirect allow-list.
* Service worker is stale-while-revalidate: after a deploy the first launch may show the previous version once; bump `CACHE` in sw.js to force.
* Techs can only see grants made to them; a tech with no `view_photos` cannot add photos.
* Vehicle value/health shown only if `ai_estimates` rows exist and are permitted.

## Invites: sharing (2026-10-18)
Invitations are NOT emailed by the app or by create_invite. Only a code is made (hash stored; plaintext returned once).
App now saves the code on the creating device (localStorage evo_invite_codes) and shows it on each pending invite row
(Clients page, Techs page) with Copy code / Share invite (navigator.share, fallback copy) / Email it (mailto).
Optional migration: /workspace/evoai-cloud/migration_002_invites.sql adds get_invite_code (creator-only) so codes are
recoverable on any device; the app calls it only if present. Not applied. Pre-existing invites cannot be recovered: revoke and recreate.


## Managed clients, enter-invite-code cards, ?invite= links (migration_003)
RPCs used (all new, all from `/workspace/evoai-cloud/migration_003_managed_clients.sql`): `create_managed_client(p_name,p_email,p_phone,p_notes)`,
`create_managed_client_invite(p_managed_id,p_email)`, `claim_managed_clients()` (called silently after every owner sign-in; skipped if missing). `redeem_invite` now also returns `claimed:[{vehicles,...}]`.
If an RPC is missing (PGRST202 / schema cache) the app shows "Needs one backend update - Appy is applying it" instead of failing.
UI: New client (Overview + Clients page) = managed client form (name required; email/phone/notes optional) then "Add vehicle for <client>". Clients are marked "Not on app yet"; per-row Add vehicle / Invite to app.
Techs act as owner (`managedMine()`) for an unclaimed managed client, mirroring `private.is_managing_tech`. Old invite-only flow is under "Invite by code" (modal-invite-client, `inviteClientOnly`).
Owner side: "Enter invite code" card on Account and on the empty Overview (`redeemCardHTML`, inline helpful errors). `?invite=CODE` is stored (localStorage `evo_pending_invite`), removed from the URL, pre-fills sign-up and is redeemed after login; share/email messages link to https://wade0764.github.io/EvoAI/cloud/?invite=CODE.
Tests: e2e.js "MANAGED CLIENTS" block (mock handlers in seed.js, RLS shape in mock_sb.js). Screenshots: screens/20-26.

## Health score + AI value (v9-value)
- tools/p5_value.js (new, appended last) + tools/patches_value.py: health is computed on the device (healthCompute/healthInfo), never stored server-side or typed; per account+vehicle snapshot in localStorage `evoai_health_v1` keeps the "Updated" date (day the result last changed).
- Value comes only from ai_estimates (service-role writes by /workspace/evoai-cloud/functions/estimate-value). App states: "No value estimates yet" / "Value estimates are not turned on yet" / "Value is not shared with you". Refresh button: 1 per vehicle per day (client + server).
- tests/value.js added to run_all.sh; mock_sb.js has an estimate-value mock (S.est.mode).

## Portfolio + collection roundabout (v11, staged, NOT published; migration_006 NOT applied)
* Sources: `tools/p7_portfolio.js` (hero-title rule, gallery, lightbox, add-photos flow, canvas processing), `tools/p8_wheel.js` (3D roundabout), `tools/portfolio.css`, `tools/patches_portfolio.py` (hook, exec'd last in build_cloud.py after the team hook).
* Hero-card rule (every hero card: overview/roundabout, client-detail grid, archives list, vehicle page header): Nickname = heading, Year Make Model = sub-heading in the same font; no nickname = YMM as heading only.
* Roundabout: option B of the Desi mockups. Overview (owner + advisor) uses it; client detail keeps the card grid. Glass only on small overlays; rotating cards never use backdrop-filter.
* Portfolio reuses `vehicle_photos`; new columns thumb_path, display_path, tag come from `/workspace/evoai-cloud/migration_006_portfolio.sql`. Originals `{owner}/{vehicle}/portfolio/{uuid}.jpg`, thumb `_t.jpg` (~400px), display `_d.jpg` (~1600px), made client-side in canvas (no filters). Without the migration the gallery shows existing photos read-only and a calm notice replaces the add buttons.
* Signed URLs: only each vehicle's cover is signed at load; slides (current +/- 1) and filmstrip thumbs are signed lazily in batches (1 h, cached 50 min).
* Tests: `tests/portfolio.js` (mock backend; images served from the design assets), SQL: `/workspace/evoai-cloud/tests/portfolio_test.sql` via `tests/pglite/portfolio_pglite.mjs` (in-memory PGlite, applies the migration twice).

## dz: safe area + client title + edge swipe-back (v12, staged, NOT published)
* Sources: `tools/p9_safe.js`, `tools/safe.css`, `tools/patches_safe.py` (exec'd last in build_cloud.py, after the portfolio hook).
* Vehicle page: Back sits in a sticky bar padded by `--sat` (+8px), 44px tap target, stays reachable while scrolling (vehicle .modal max-height removed so sticky works).
* Client title (`ctitleSet`): owner overview `#cp-title` and admin/tech client page `#cd-name`: "The Private Collection" eyebrow, serif display name (title-cased; names without collection/collective become "The X Collection"), gold hairline.
* Swipe-back: touch starting within 24px of the left edge on a layer with a Back (lightbox unless zoomed, sheet, top modal, page with .backbar) claims the gesture in capture phase, follows the finger, commits past 30% / fast flick. html/body overscroll-behavior-x:none.
* Test: `tests/dz_safe.js` (in run_all.sh). Screens: `screens/dz-*`.

## AI document scanning + AI reminders (v13, staged in /workspace/publish-cloud-next/, NOT published; migration_007 NOT applied; scan-document NOT deployed)
* Sources: `tools/p10_docai.js`, `tools/docai.css`, `tools/patches_docai.py` (exec'd after patches_safe). Backend: `/workspace/evoai-cloud/migration_007_doc_ai.sql`, `/workspace/evoai-cloud/functions/scan-document/`.
* Flow: Add document -> "Save & scan with AI" uploads the file as usual (docUpload), then calls `scan-document` with `{document_id}` only. The function reads the file as the caller (storage RLS), asks Gemini for strict JSON, normalizes it, and returns it. It writes nothing except a row in `ai_doc_log`. The app shows an editable form (category, date, vendor, mileage, amount, expiry, services) plus proposed reminders with a "Why" reason; Save updates the document row (ai_status scanned / edited / manual) and calls `add_doc_reminders` (security definer, owner or tech with view_documents + can_add_documents, owner_only docs owner-only, max 6, replaces earlier open AI reminders from the same doc).
* AI reminders (`reminders.ai_generated`) are kept out of the per-kind date sync (`v._rem`) and shown on the Reminders page and the vehicle page (Done / Dismiss for owners).
* Documents list sorted newest first by doc_date (fallback created_at). "Details" reopens any document for manual editing / re-scan.
* Fallbacks: function missing/503 -> calm note + manual form; 429 limit; migration missing -> title/kind-only update and, for owners, plain reminders with the reason in `notes`; techs then see "needs one backend update".
* Tests: `tests/docai.js` (mock backend; in run_all.sh), `functions/scan-document/index_test.ts` (deno), `/workspace/evoai-cloud/tests/doc_ai_test.sql` via `tests/pglite/doc_ai_pglite.mjs`.

## v14 - AI photo dump (auto-sort) - staged in /workspace/publish-cloud-next2/
- tools/p11_phototag.js + phototag.css + patches_phototag.py (exec'd last, after patches_docai). Overrides pfShowAdd/pfAddFiles/pfAddRender/pfAddCycle/pfAddTagAll/pfAddRemove/pfUploadAll/pfSetTag; PF_TAGS = 8 sections; legacy 'Detail' displays as 'Details'.
- Up to 50 photos; 240px previews generated one at a time; uploads 2 at a time; after each upload untagged photos queue for tag-photos in batches of 8 (serial). Manual chip tap = tag_source 'manual', never overwritten by a late AI result.
- Fallbacks: tag-photos 404/503 -> untagged + "Auto-sorting is not turned on yet" + manual chips; 429/502 -> calm note. No 008 (PGRST204/42703/23514) -> drop tag_source/confidence, map to legacy tags (Wheels/Details->Detail, Documents/Other->untagged).
- Documents photos: "Scan as document?" (sheet + gallery) -> docUpload of the 1600px display JPEG -> docAiOpenEdit(id,true).
- Tests: tests/phototag.js (35 checks, pd-01..08 screens); tests/portfolio.js: 3 expectations updated for the new tag order / Details name.
- Backend: migration_008_photo_tags.sql, functions/tag-photos, tests/photo_tags_test.sql (+pglite).

## v15 (staged in /workspace/publish-cloud-next3, NOT published)
- Readability: patches_large.py scales all type ~+20% (body >=17px phone, labels >=13px), muted greys raised to WCAG AA, tap targets >=44px. tests/large.js + tests/a11y_audit.js enforce it.
- Loader: animated gold dot-spiral ring (round6 tight ring, 291 dots, 12 pulse sectors, 16s rotation), Evolve O static in the centre; reduced-motion = opacity breathe only. Splash + every inline spinner.
- Vehicle page: one calm value block (pills removed, sources/date in "Sources and details"); Owner value override (vehicle_owner_values, priority over AI in vehicle + collection total); Replica / Kit car toggle + Builder, Replica badge, VIN/identify replica hints; single Documentation section (Add Documents -> scan-document, docs newest first, compact "Coming up" reminders).
- Backend: migration_009_replica_owner_value.sql, estimate-value (collector retry, low-confidence instead of discard, model never NULL, replica valuation + cache key), identify-vehicle (replica_likely / replica_reason).
- sw.js CACHE = evoai-shell-v15-large. Tests: tests/run_all.sh (now includes large.js and vehicle_v15.js).

## v17 - value chart, auto estimates, pull-to-refresh, estimate lines, co-owners (staged in /workspace/publish-cloud-next5/, NOT published; migration_010 NOT applied)
- Sources: `tools/p14_charts.js` + `tools/charts.css` + `tools/patches_charts.py` (chart, auto estimate hook, swipe-back exclusion), `tools/p15_autoval.js` (background estimate queue + pull-to-refresh), `tools/p16_coowners.js` + `tools/patches_coowners.py` (co-owners, "Estimate, not an appraisal" stat lines, auto estimate after photo upload). Hooks exec'd after patches_vehicle, in that order.
- Chart data = real ai_estimates rows only (v.valueLog ai:true, value_mid, one point per local day; `ts` keeps the UTC timestamp so evening estimates land on the right local day). Collection line = sum of each car's latest value as of every estimate date (carry forward), ending today at portfolioTotals().value. Owner value (vehicle_owner_values, no history) = headline "Owner value" + gold point today, AI estimates as a dashed secondary line; collection uses the owner value from owner_value_set_at. Cost basis dashed line only when every charted car has a real purchase_price the viewer may see.
- < 2 points: single glowing dot, "History starts <date> - updates weekly", ranges disabled, insight "First AI estimate recorded ...". Insight lines are computed locally (no API).
- Scrub: pointer events on .vch-plot (touch-action:none, stopPropagation, rAF overlay); swipe-back skips touches that start on .vch-plot.
- Auto estimate: KIND.vehicles.insert (manual, VIN and photo identify all end here) and pfUploadAll completion call valueAutoQueue(); serial, quiet, honours VALUE.state off, view_value_estimate, 1/vehicle/day (valRef) and stops on a per-user 429. Pull-to-refresh on the collection screens (.main scrollTop 0, not from the left 32px, vertical only) -> ring loader -> reloadAll -> up to 5 estimates for cars with none.
- Co-owners: /workspace/evoai-cloud/migration_010_co_owners.sql (generated by /workspace/evoai-cloud/tools/gen_migration_010.py from the latest function bodies). My team page: Invite co-owner (code + ?invite= link, copy/share, never sent), Remove (original owner), Leave (co-owner). Tests: tests/charts.js; SQL: tests/co_owners_test.sql via tests/pglite/co_owners_pglite.mjs (+ reg010.mjs regression), run from /workspace/pgl (has node_modules).
- sw.js CACHE = evoai-shell-v17-charts.

### v17 (E) automatic VIN decode (tools/p17_vin.js, tools/patches_vin.py)
- Valid 17-char VINs (check digit, no I/O/Q, not a 1980 code) are decoded in the browser with vPIC DecodeVinValuesExtended (cached, 12 s timeout, quiet on failure).
- Triggers: VIN typed (vinChanged, 450 ms debounce, also the Fill from VIN button), VIN from photo identify (goes through vinChanged), VIN from scan-document (result.vin, check digit validated server-side, asks on the car).
- Fills year, make, model, trim, engine ("3.0L 6-cyl Gasoline"), body class. If the VIN conflicts with an existing field, one sheet: "VIN says ... Update?" Use VIN / Keep mine.
- Skips pre-1981, non-17-character VINs, replica/kit cars (checkbox or replica hint).
- Stored in the notes extras (eng/body/vdec) and synced to vehicles.trim/engine/body_class/vin_decoded_at (migration_010 section 6; a 42703 error is ignored).
- Re-estimate after a decode on an existing car (valRef cleared, valueAutoQueue). The server's 1-per-vehicle-per-day refresh limit may defer it to the next day.
- Pull-to-refresh backfill: up to 5 cars with a VIN and no vin_decoded_at, filling empty fields only, no sheet.

### v17 (F) photo size fix (tools/patches_sizefix.py), ported from the v16b hotfix (publish-cloud-next4b/SIZEFIX_NOTES.md)
- Same design as v16b: no input-size checks (readResized, handleVehicleImage, pfProcess); photoShrinkError, blobToDataUrl, shrinkPhotoBlob (pfDecode with EXIF orientation; q 0.8..0.4, then dim x0.75 for up to 8 steps), shrinkPhotoToDataUrl; pfEncode(d,max,q,bg).
- pfProcess original: kept if it is a JPEG of 14 MB or less, else 4096px q 0.92/0.85/0.75/0.65 with dim x0.75 for up to 6 steps, falling back to 1600 @0.8.
- Paths: add vehicle/identify, cover/detail photo and document/expense photos (readResized), bulk portfolio upload. Test: tests/sizefix.js (30 MB 8064x6048 JPEG, tests/fixtures/make_big.py).

## v18 - document thumbnails + full-screen viewer (staged in /workspace/publish-cloud-next6/, NOT published; migration_011 NOT applied)
- Sources: `tools/p18_docthumbs.js`, `tools/docthumbs.css`, `tools/patches_docthumbs.py` (exec'd last in build_cloud.py, after patches_sizefix). sw.js CACHE = evoai-shell-v18-docthumbs; activate keeps caches named `evoai-dt-*`.
- Storage audit: originals were already kept (`{owner}/{vehicle}/{uuid}.{ext}` in private `vehicle-documents`); scan-document only reads them. PDFs are stored byte-for-byte; photos from the vehicle page are stored as a 2200px JPEG (q 0.85, EXIF-rotated) as before. Real gap fixed: signed URLs were made once at load (1 h, first 300 docs) and never refreshed.
- Every row (vehicle Documentation section + Documents page) leads with a 96x124 thumbnail (84x108 desktop): stored `_t.jpg` (migration_011 `documents.thumb_path`) -> else rendered on device from the file (images: canvas 360px; PDFs: page 1 with pdf.js 3.11.174 from cdnjs, SRI, lazy-loaded only when needed) -> else a category tile (gold icon + AI category, PDF/Photo/Note badge). AI category label, date and newest-first order kept.
- Lazy: IntersectionObserver (240px margin), max 3 at once; cached in memory and Cache Storage `evoai-dt-v1`. Signed URLs batched, cached until 5 min before expiry, re-signed on fetch/load error.
- Tap image -> `.dtv` full-screen viewer: pinch / double-tap / wheel zoom, pan, swipe down to close, 48px close button under --sat, Escape. Edge swipe-back closes it (inert while zoomed). Tap PDF -> new window with a 10-min signed URL (pre-signed when the row is visible so iOS standalone opens it inside the tap; else window opened in the tap then redirected; if blocked, a one-tap "Open PDF" sheet).
- Upload: docUpload now calls dtInsertDoc: makes the thumb (<=6 s, best effort), uploads `{uuid}_t.jpg`, inserts with thumb_path; PGRST204/42703 -> removes the thumb, retries without, DT.col=false. Remove deletes the thumb too.
- Tests: `tests/doc_thumbs.js` (in run_all.sh; fixtures `tests/fixtures/dt_*` via make_dt.js, pdf.js copy in tests/fixtures/pdfjs). SQL: `/workspace/evoai-cloud/tests/pglite/doc_files_pglite.mjs`. Screens: `screens/dt-*`.

## v19 - Replica / Kit car toggle in the Add form (staged in /workspace/publish-cloud-next7/, NOT published)
- Before: the v15 toggle sat inside the collapsed "More details (optional)" section of the shared Add/Edit modal (modal-add-vehicle), which is closed every time the form opens, so it was easy to miss in both Add and Edit.
- tools/patches_replica_add.py + tools/replica_add.css (exec'd last): moves the row to the main Vehicle grid after Color; 19px label, helper text, role=switch, 72px row, 58x34 gold switch; Builder field shown when on.
- Fix: vrSyncCols ran only when VR.cols===true (set from loaded rows), so Add on an account with no cars never wrote is_replica/builder. Now it tries unless known missing (42703/PGRST204 -> off). Notes extras rep/bld still mirror it.
- Test: tests/replica_add.js (in run_all.sh). Screens: screens/rp-*. sw.js CACHE = evoai-shell-v19-replica-add.

## v20 - Missing indicators + completeness count (staged in /workspace/publish-cloud-next8/, NOT published; migration_012 NOT applied)
- Sources: `tools/p19_missing.js`, `tools/missing.css`, `tools/patches_missing.py` (exec'd last, after patches_replica_add). sw.js CACHE = evoai-shell-v20-missing.
- Vehicle page: a "Key details" card under the title (#vd-key): Car (year/make/model), VIN / Chassis no., Registration, Colour, Mileage, What you paid (currency as written: USD/EUR/GBP), Location, Insurance. Blank fields show a 20px white bold "Missing" with a 3px red underline; tapping it opens Edit, opens "More details" when needed, focuses and gold-outlines that field. Count chip "N of 8 complete" on by default (msSetCount(false) / localStorage evoai_ms_count='0' hides it); tapping it jumps to the first Missing.
- Missing + count only when canEditVehicle(v), not archived, and not a co-owner member (coIsMember). Techs/shared and co-owners see "Not on file"; "What you paid" is hidden from viewers without view_purchase_info. Missing is render-only (never stored, never in exports).
- Form: new Registration (plate) + State / region, Location, Insurance inputs; "Purchase price ($)" relabelled "What you paid" with a Currency select.
- Storage: plate/plate_region -> existing vehicles columns (always written). location / insurance_carrier / purchase_currency -> migration_012 columns only when the load saw them; always mirrored in notes extras (pl, plr, loc, insc, cur).
- Test: tests/missing.js (in run_all.sh). Screens: screens/ms-*.

## v21 - Master sheet import + portfolios DB layer (staged in /workspace/publish-cloud-next9/, NOT published; migrations 013/014 NOT applied; import-sheet NOT deployed)
- Sources: `tools/p20_import.js`, `tools/import.css`, `tools/patches_import.py` (exec'd after patches_missing). sw.js CACHE = evoai-shell-v21-import. Tests: `tests/import.js` (in run_all.sh), fixtures Vehicle_Intake_Summary.xlsx / Vehicle_Asset_List.pdf / sheetjs.
- Entry: "Import sheet" button in the owner header (#cp-import) and client-detail header (#cd-import). Steps: Upload -> Which portfolio? -> Review (Changes / New cars / Conflicts) -> Done (Undo).
- Parsing in the browser: SheetJS 0.20.3 (CDN + SRI) for xlsx/csv; pdf.js text layer for PDFs (column overlap; money by right edge). Scans/photos and unclear headers -> edge function import-sheet (5 imports/user/day by distinct import_id).
- Reads only year/make/model, VIN/chassis, registration, colour, mileage, what you paid (currency as written), location, insurance. Never value ranges/owner value/discrepancy notes. km readings convert only on approval.
- Matching: identical 17-char VIN (same year) or unique year/make/model (1981+, no VIN on both sides) auto-match; pre-1981 and Euro chassis never auto-match; VIN check digit tested; car in another portfolio flagged. Nothing saved until approved.
- Undo: per-batch log in localStorage `evoai_im_batches` (removes added cars, restores fields unchanged since import).
- Portfolios: PO.on only when the `portfolios` table answers (migration 013). Without it: one implicit "My collection", no "+ New portfolio". portfolio_id written on insert only when the column exists.
- DB: migration_013_portfolios.sql (portfolios table, default per owner, vehicles.portfolio_id NOT NULL, guard trigger, RLS owner/co-owner/admin) and migration_014_import_log.sql (ai_import_log). Tested in PGlite: tests/pglite/portfolios_013_pglite.mjs (27/27, both applied twice).

## v21b - Cost basis check (staged in next9, NOT published)
- Sources: `tools/p21_costcheck.js`, `tools/costcheck.css`, `tools/patches_costcheck.py` (exec'd after patches_import). Tests: `tests/costcheck.js` (in run_all.sh).
- "What you paid" is flagged (thick red box, reason, "Yes, this is correct" / "Edit") when, in USD equivalent (EUR x1.08, GBP x1.27):
  0; under $1,000; over $20,000,000; malformed sheet text (two currencies, >9 whole digits, broken thousands groups, 3+ decimals);
  under 25% or over 400% of the car's latest AI estimate, or (no estimate) of a rough typical price for the make (CB_MAKE table).
- Import: Approve all / Add all / Save never save an unconfirmed flagged cost. Flagged change = that field held back; flagged new car = car held back; both counted in "Left to check". Edit / confirm per row; editing resets confirmation.
- Vehicle form: box under Currency; Save is blocked with a toast until confirmed. An unchanged saved amount is not re-asked.

## v21c cost check: non-blocking, confirm later (2026-10-26)
- Flagged "What you paid" no longer blocks. Import (Changes/New cars), Approve all/Add all and the vehicle form save it as UNCONFIRMED.
- Storage: vehicle_financials.cost_confirmed / cost_flag_reason (migration_015, NOT APPLIED). When those columns are missing, it falls back to notes extras cfc:'0' / cfr.
- Vehicle page details card: a thick red box under "What you paid" with the reason and the buttons "Yes, this is correct" (sets confirmed, audited) and "Edit" (opens the form). Only editors see it (msCanSeeMissing). Techs, co-owners and shared views do not.
- Import done screen: "Costs to confirm N". Bar text: "N costs will be saved for confirming later".
- Go-live: /workspace/evoai-cloud/golive_v21.sql (backups + 013 + 014 + 015 + verification). Paste file: functions/import-sheet/import-sheet_PASTE.ts
