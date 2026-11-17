# MOCKUPS – not for merge

Static screens for owner approval. Nothing here is wired into the app, nothing was written to the live database, and nothing should be merged.

The look follows the current EvoAI shell: obsidian background, Cormorant titles in wide gold caps, champagne hairline rules, white body text at 15px or larger, and emerald only on the primary button, the active tab, focus, and the existing “New” count. Red is not used. There is no checkout and no in-app payment.

## What the screens show

1. **Tech profile, empty.** Account for Marcus Hale. “My website & price list” has a website field, a confirmation that he owns the site or may use its wording and prices, an optional pay/book link, and **Draft my price list with AI**. No services yet. Clients see nothing.
2. **AI draft, in review.** Services grouped as Exterior, Interior, Ceramic, and Maintenance. Each line has a name, a price (`$185`, `from $850`, or `On request`), a duration when the page had one, and `Found on haleatelier.com/services`. Paint protection film is marked **Please check** in gold because coverage and price were not on the page. Edit, Remove, and Add a service are on the list. **Publish to my clients** is the only primary button, with the line that nothing is visible until he publishes. The desktop shot also shows the one-line description under each name. The phone shot keeps name, price, time, source, and the gold flag so the whole draft fits the phone.
3. **Published.** Last updated 16 Nov 2026. Website and the optional pay/book link are shown as his own site. **Refresh from website** is not a primary button: it reads the site again and opens a draft. It does not change the live menu.
4. **Refresh, waiting for approval.** A price change (`$185` to `$210`) and a new service, Wheel faces, marked Please check. **Publish these changes** or **Keep current list**. Clients still see the 16 Nov menu until he publishes.
5. **Client, services and prices.** Opened from My team. Hale Atelier’s published menu. Prices are worded as a listed estimate. **Pay / book on their site** is a separate link: haleatelier.com/book, labeled as leaving EvoAI for the tech’s own site. Ceramic coating is selected, with **Request this service**.
6. **Request this service.** The client picks vehicles, a date window, an optional note, and optional photos, then **Send request**. The DBS and the E-Type are already on this tech’s access. The 911 GT3 is marked “Shared for this request only. Standing access stays as it is.”
7. **Request sent.** The confirmation says it went to Marcus Hale as a Client Request. He will confirm a time or send an estimate. Nothing is charged in EvoAI.
8. **Tech, incoming request.** The Client Requests card now includes the service, the listed price (`from $1,800`, his list, an estimate until he confirms), and the three vehicles with the same access labels. **Accept**, **Send estimate** (the existing estimate, not a new one), and **Reply**. Accepting does not charge the client.

## Vehicle sharing and tech_grant_vehicles

Today a tech sees a car only when `tech_grant_vehicles` covers it. If that allow-list is empty and the access row is for the whole collection, the tech already sees every car. If the allow-list has rows, only those cars are in scope. Client Requests are also one car per row (`service_requests.vehicle_id`), and the tech can read or update a request only for a car they can already access.

The mockup does not widen that standing grant.

- Cars the tech may already see are chosen as they are. No new permission is written.
- A car outside the grant can be included only when the client turns on “share for this request.” That share is for this request only: the name, plate, and the photos the client attaches. It does not add a row to `tech_grant_vehicles`, and it does not open the rest of that car (documents, title, value, history).
- The owner can later add the car to the tech’s usual access from My team, if they want that.
- If the tech already has the whole collection, every car is already allowed and this extra share is unnecessary.
- An estimate stays the current estimate: one car, `request_kind = 'estimate'`, permission `can_send_estimates`, and the client answers with `decide_estimate`. A request that covers three cars would send one estimate per car. For a car shared only with this request, that permission has to allow the estimate for that car and that request, and nothing else.

## Proposed data model

Not applied. No migration in this branch.

`tech_price_lists` — one row per tech

- `tech_id` (the tech’s profile)
- `website_url` (the site they submit)
- `pay_url` (optional; their own pay or booking page)
- `attested_at` (they confirmed they may use the site)
- `published_at`, `draft_fetched_at`

`tech_services` — the lines

- `list_id`, `tech_id`
- `lane`: `draft` or `live`
- category, name, description
- price mode: `fixed`, `from`, or `on_request`, plus amount and currency when there is a number
- duration text, when the page had one
- `source_url` (the page the line came from)
- `needs_review` (the gold “Please check”)
- sort order

Row security:

- The tech can write only their own rows.
- A client can read only `live` rows, and only for a tech who has active access to that client’s collection.
- Draft rows are never readable by clients.
- Anonymous users get nothing.
- Publishing copies draft lines over the live lines in one step. Refresh writes a new draft and does not touch the live lines.

On the existing `service_requests` table, a price-list request would store the service id and a snapshot of the listed price (so a later edit does not rewrite history), plus a preferred end date for the window. A child table `request_vehicles` would hold each chosen car and whether it was `granted` or `request_only`. The parent `vehicle_id` can stay as the first car so today’s one-car screens still have a car.

## How the AI draft would fetch the site

A server-side edge function, not the phone.

- The tech submits their own `https` address and the ownership confirmation is stored first.
- The function fetches that host only. It reads `robots.txt` before any page and honors Disallow.
- It reads the home page, a services page, and a few same-host links. It does not follow other sites, and it does not read a client’s site.
- It stores the source URL on each suggested line.
- It caps size and time, and it reads the HTML. It does not need to run the page’s scripts.
- The result is a draft. It never publishes, and a later refresh never publishes.

## Legal and compliance, in plain language

- The tech confirms they own the site, or they are allowed to use its wording and prices. The product should keep that confirmation.
- The AI text is a draft. The tech is responsible for every price and description they publish.
- What clients see should match what the tech means to charge. “From,” “price on request,” and “estimate until confirmed” are there so a listed number is not presented as a bill.
- These screens do not make the tech compliant with advertising or consumer-price rules. They do not claim that.
- The pay/book link opens the tech’s own site. EvoAI does not take that payment.

## Future

In-app payments for tech services can be added later when it makes sense and we have our own payments system. This set does not design that, and it does not put a payment screen inside EvoAI. Until then, a tech who wants to charge uses their own site, linked from their profile and clearly marked as theirs.

## Screenshot files

Phone is 390×844. Desktop is 1280×800.

- `mockups/nov16-pricelist/screenshots/01-tech-empty-phone.png`
- `mockups/nov16-pricelist/screenshots/01-tech-empty-desktop.png`
- `mockups/nov16-pricelist/screenshots/02-tech-review-phone.png`
- `mockups/nov16-pricelist/screenshots/02-tech-review-desktop.png`
- `mockups/nov16-pricelist/screenshots/03-tech-published-phone.png`
- `mockups/nov16-pricelist/screenshots/03-tech-published-desktop.png`
- `mockups/nov16-pricelist/screenshots/04-tech-refresh-phone.png`
- `mockups/nov16-pricelist/screenshots/04-tech-refresh-desktop.png`
- `mockups/nov16-pricelist/screenshots/05-client-menu-phone.png`
- `mockups/nov16-pricelist/screenshots/05-client-menu-desktop.png`
- `mockups/nov16-pricelist/screenshots/06-client-request-phone.png`
- `mockups/nov16-pricelist/screenshots/06-client-request-desktop.png`
- `mockups/nov16-pricelist/screenshots/07-client-sent-phone.png`
- `mockups/nov16-pricelist/screenshots/07-client-sent-desktop.png`
- `mockups/nov16-pricelist/screenshots/08-tech-incoming-phone.png`
- `mockups/nov16-pricelist/screenshots/08-tech-incoming-desktop.png`

HTML for the same screens is in `mockups/nov16-pricelist/`. Open `index.html` for the list.
