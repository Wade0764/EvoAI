# Database changes needed (plain language) — nothing done yet

1. Client Requests (mockups 1 + 2) — NEW table `service_requests`:
   who asked (client), which vehicle, service type (one of the existing categories or "other"),
   free-text description for "Something else", preferred date + time window, notes,
   status (new / accepted / scheduled / done / declined), assigned tech, scheduled date, timestamps.
   Photos: a storage folder (e.g. `request-photos/`) plus a small `request_photos` table (or a photo-path list column).
   Security (RLS): a client sees/creates only their own requests and cannot change the status;
   the client's assigned tech/admin can read and update them.
   The count badge = number of "new" rows (no extra table).

2. Comments (mockup 3) — NEW table `comments`:
   author, client (collection), optional vehicle and optional request link, message text, created time,
   plus "read" tracking (a `comment_reads` table or a last-read time per user) for the "2 new" label.
   RLS: only that client and their tech/admin can read or post; people can edit/delete only their own comments.

3. Overview layout options (mockups 4A/4B/4C) — NO database change. This is just a front-end reordering.
