# v27 Sign-up / invite fix + form safety + identify speed + VIN trim  (TEST ONLY, nothing live changed)

## Root causes
1. **"Entering an email sends nothing."** The invite flow has never sent email. `create_invite(p_email)` only *locks* the code to that
   address (stored lowercased in `invites.email`); the app never calls Supabase Auth, an Edge Function or SMTP for invites.
   "Email it" was only a `mailto:` link that had to be tapped. There is no email function in /workspace/evoai-cloud/functions.
   Also, Supabase's built-in mailer (used for the confirmation / magic-link mail) is rate-limited (about 2 per hour) and only delivers
   to the project's team-member addresses unless custom SMTP is set, so it can't send invites to clients as is.
2. **"Not available while viewing as another role."** `redeemCodeFrom()` blocks redeem in admin View-as mode. Even without that guard the
   server would refuse: `redeem_invite` rejects `role = 'admin'` (`role_not_eligible`) and the creator's own code (`cannot_redeem_own_invite`).
   An admin cannot test sign-up from his own account at all; it needs a second account (private tab / other device).
3. **Clumsy codes.** 32 hex characters (two UUIDs), 14-day expiry, grouped 4-4-4-...; easy to mangle when pasting by text.

## New flow (implemented in test)
- A tech/owner/admin creates an invite and gets **an 8-character code** from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O/1/I/L),
  shown as `K7QM-4XPA`, plus a link `https://wade0764.github.io/EvoAI/cloud/?invite=K7QM4XPA`.
- The invite sheet has **Share via text** (iOS share sheet, falls back to `sms:`), **Copy link**, **Send email** (opens the
  sender's own mail app pre-filled, so it works with no SMTP at all). (su-01)
- Opening the link removes `?invite=` from the address bar, stores the code and shows "You are invited to EvoAI" with the code
  prefilled, name and email (su-02). **Email me a sign-in code** calls `signInWithOtp` (no password; account created if new; 60 s resend
  cooldown). The person types the **6-digit code** or taps the magic link in the same email (su-03).
- After sign-in the code **auto-redeems** (existing bootWithUser path, code also in user metadata) and a Welcome sheet appears (su-04).
- Existing password sign-up and sign-in stay below, unchanged; old 32-char codes still work until they expire.
- **Admin / View-as**: Redeem now shows "You're signed in as admin. To test sign-up, open this link in a private tab or on another
  device" with the link and a **Copy link** button, and makes no server call (su-05).
- Sign in with Apple: not built. Later it is one `sb.auth.signInWithOAuth({provider:'apple'})` button plus Apple Developer setup ($99/yr).

## Server: /workspace/evoai-cloud/migration_019_short_invites.sql (NOT applied)
- Section 0 is the **backup**: copies the current definitions of create_invite / create_co_owner_invite / create_managed_client_invite /
  redeem_invite into `private.backup_019`.
- Moves those functions to `private.*_core` (bodies untouched, no API access) and puts thin wrappers under the same public names/args.
- Codes: 8 chars via rejection sampling from gen_random_uuid bytes; stored **only as sha256(pepper || code)** (pepper in
  `private.invite_pepper`, unreadable by anon/authenticated); 7-day expiry; single use (row lock in the core); still bound to the
  kind (role) and owner_id/vehicle (collection) as before.
- Rate limits: 20 invites per user per hour; 10 failed redeems per user per hour (`private.invite_attempts`). Failures are returned
  as `{"error":"..."}` so the attempt row is kept; the app maps that back to the same friendly messages.
- Rollback: `rollback_019_short_invites.sql` (moves the cores back, drops wrappers/helpers; short codes issued in between stop working,
  legacy codes keep working).
- Tested with PGlite: `cd /workspace/evoai-cloud/tests/pglite && node short_invites_pglite.mjs`: applied twice, 14/14 checks
  (format, 7 days, no plaintext, own-code / admin refused, dashes+lowercase accepted, access granted, single use, rate limit, grants,
  pepper hidden, co-owner short), rollback x2 + re-apply ok.
- Note: after 019 the older SQL suites that use `tests.denied(redeem_invite(...))` would need updating (redeem now returns {error}).
- The app works **before** 019 too: it accepts both 8-char and long codes; until 019 is applied, new codes are still the long ones.

## Also in scope (approved fixes) - tools/p27_formsafe.js
1. **Pull-to-refresh lost the form**: `overscroll-behavior-y:none` on html/body, `contain` on modals/scroll containers. Add/Edit
   vehicle, service, expense, new client, note and inspection forms autosave to localStorage on every input (per vehicle for Edit),
   restore with "Restored your unsaved details." + **Discard** (fs-01), clear on Save, and `beforeunload` warns while unsaved
   (`pagehide` saves the draft). Drafts expire after 7 days.
2. **Slow photo identify**: the app sent the 1280px / up to 1.5 MB gallery photo. Identify now sends its own copy resized to
   1024px / <=300 KB (test: 265 KB -> 55 KB), shows progress text ("Preparing...", "Identifying...", "Still working - checking the
   trim and year...") (fs-02), and gives up after 30 s instead of 70 s. Server side (not changed, recommendation): set
   `VISION_TIMEOUT_MS=20000` on identify-vehicle; the function defaults to gemini-3.5-flash with flash-lite fallback (40 s each, so up to
   80 s); flash-lite as primary would be faster if accuracy holds.
3. **Trim (SR5 vs TRD Off-Road)**: VIN is decoded with the free NHTSA vPIC API (DecodeVinValuesExtended, already used since v17).
   Now fields the photo AI guessed are replaced by the VIN without a conflict question, vPIC "TRD Off Road" is normalised to
   "TRD Off-Road", and the trim shows as a suggestion ("Trim from VIN" / "suggested from photo") with one-tap alternatives
   (Toyota trucks: SR, SR5, TRD Sport, TRD Off-Road, TRD Pro, Limited, ...; also F-150, Bronco, Silverado, Wrangler) (fs-03).
   Caveat: vPIC often leaves Trim blank for Toyota trucks; then the photo guess stays as a suggestion the user confirms.

## Files
- New: tools/p27_signup.js, tools/p27_formsafe.js, tools/patches_signup.py, tests/signup.js (23 checks), tests/formsafe.js (21).
- Touched (one line each): tools/build_cloud.py (exec patches_signup.py after values25b), tests/run_all.sh (+2 suites),
  tests/e2e.js (3 invite-modal assertions updated to the new sheet), tests/identify.js (clear form drafts per case).
- DB: migration_019_short_invites.sql, rollback_019_short_invites.sql, tests/short_invites_test.sql, tests/pglite/short_invites_pglite.mjs.
- No publish folder built; p25*/value files untouched. `tests/run_all.sh`: all suites pass.

## What Wade must do
1. Publish this build (after the next14 work is merged) - nothing is live yet.
2. Run `migration_019_short_invites.sql` in the Supabase SQL editor (it backs up first). Optional before that: migration_002 (re-copy codes).
3. Supabase > Authentication > Email Templates > **Magic Link**: include the code, e.g. `Your EvoAI code is {{ .Token }}` above the
   `{{ .ConfirmationURL }}` link (otherwise only the link is sent; both work). Auth > URL Configuration: keep
   `https://wade0764.github.io/EvoAI/cloud/` (and `/cloud/?*` / `/**`) in Redirect URLs.
4. **Custom SMTP** (needed for sign-in codes to reach anyone other than project team members, beyond ~2 emails/hour):
   - Resend (resend.com) free tier: 3,000 emails/month, 100/day, 1 domain - $0. (Paid starts at $20/mo for 50k.)
   - Add domain evolvemobiledetail.com in Resend, add the DNS records it shows (SPF/DKIM TXT, MX on a `send.` subdomain) at the
     domain registrar, wait for Verified, create an API key.
   - Supabase > Project Settings > Authentication > SMTP Settings > Enable custom SMTP: host `smtp.resend.com`, port `465`,
     user `resend`, password = the API key, sender `no-reply@evolvemobiledetail.com`, name `EvoAI`.
   - Then Auth > Rate Limits: raise "emails sent per hour" (e.g. 30-60).
   - Alternatives at $0: Brevo (300/day), Amazon SES (~$0.10 per 1,000, needs AWS account). Nothing was signed up for.
5. To test sign-up himself: create an invite, tap Copy link, open it in a Safari **private tab**, use a different address
   (e.g. wade+test1@evolvemobiledetail.com once SMTP is on, or any team-member address before).

## v28 Rename collection (test only, not live)
- Account sheet has a new line, **Rename collection**, with the current name in gold. Tapping it opens a sheet with the current name, a text field (60 chars max, spaces trimmed and collapsed, can't be empty) and Cancel/Save.
- Who sees it:
  - Owners and co-owners, for their own collection.
  - Admins, for their own collection, the client they have open, or the owner they're viewing as.
  - Techs, only on a managed client they have edit rights on. A tech with view-only access doesn't see it.
- On save, the home large title, the client page title, and the View-as picker update straight away. The name is stored in `profiles.collection_name`. If a name is set, it's shown exactly as typed (no "The … Collection" wrapping). If not, the old default is used.
- Backend: `/workspace/evoai-cloud/migration_020_collection_name.sql` (not applied).
  - Adds a column with a 1..60 trimmed check, plus `public.set_collection_name(p_owner, p_name)`. It's a security definer that checks owner/co-owner, admin, or managing tech.
  - Profile UPDATE grants are not widened, so RLS is unchanged. You can't write the column directly.
  - Backup marker table: `private.backup_020`. Rollback: `rollback_020_collection_name.sql`.
  - PGlite test: `tests/pglite/collection_name_pglite.mjs`, 11/11 passing. It applies twice cleanly, and rollback x2 plus re-apply is ok.
  - Until 020 runs, Save shows "Needs one backend update".
- Files: `tools/p28_rename.js` and `tools/patches_rename.py`, plus one exec line in `build_cloud.py`. Tests: `tests/rename.js` (20 pass). Screens: `rn-01..03`.

## v29 Sort by (test only)
- A **Sort: …** button sits under the hero carousel, right after "Hold a car for options". The client page vehicle list has one too.
- The sheet offers:
  - My order (default: the press-and-hold sort_order)
  - Year newest first
  - Year oldest first
  - Name A–Z (make + model)
  - Date added (newest)
  - Value (highest; cars with no value or no permission go last)
- The choice is saved in localStorage as `evo_sort_<userId>_<clientId>|<portfolioId>`. The button shows the active choice (e.g. "Sort: Year ↓"). Move mode always uses My order.
- Files: `tools/p29_sort.js` and `tools/patches_sort.py`, plus one exec line. Tests: `tests/sort.js` (20 pass). Screens: `st-01..03`.
