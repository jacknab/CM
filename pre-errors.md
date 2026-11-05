# Pre-existing errors log

Bugs/type-errors Claude noticed while working on an unrelated task, in files it did not intend to change, and did not fix. Each entry is a candidate for its own small follow-up task — pick one when convenient.

Convention: newest entries at the top. Include date found, file:line, the exact error, and enough context for someone to pick it up cold.

## 2026-11-05 — Certxa Pro browser version: delete/remove confirmations do nothing (found testing Add-on Groups)

- `certxa-pro-replit/staff-app-latest/artifacts/certxa-pro` (every screen that confirms with `Alert.alert` before removing: `app/catalog/addons.tsx` "Remove add-on", `app/services.tsx` "Remove service", `app/catalog/addon-groups.tsx` "Delete group", and others): react-native-web's `Alert.alert` is a no-op, so on the browser build (pro.certxa.com, `scripts/build-web-preview.sh`) tapping these shows nothing and nothing is removed. The iPhone app is unaffected. Found while driving the web build in a headless browser; deletes were tested through the API instead.
- Not fixed now: it is app-wide (every confirm in the app), and the right fix (a small cross-platform confirm sheet used everywhere) is its own change.

## 2026-11-05 — Booking themes link to a privacy page that doesn't exist (found during SEO Phase 1 Batch 1)

- `artifacts/booking/src/pages/public-booking/SimpleTheme.tsx:1044`, `MobileTheme1.tsx` and `ClassicTheme1.tsx` (the text-message consent box): the PRIVACY link goes to `/policy`, which returns 404 on certxa.com and every subdomain. Certxa's privacy page is `/privacy`. The consent text is reviewed for Twilio, so a dead privacy link there matters. Not fixed: outside Batch 1's scope (C1–C3).

## 2026-11-05 — Salons with a published website get none of the salon SEO files (found in GEO platform audit)

- `artifacts/api-server/src/middleware/subdomain.ts:353-356`: for any salon with a published website, `handleTenantSiteBySlug` returns before the salon SEO block at line ~392, so `<slug>.certxa.com/llms.txt` (and robots.txt / sitemap.xml) serve the website HTML instead of `lib/salonSeo.ts` output. Live 11-05: `bella-nails` and `jims` return `text/html` for `/llms.txt`; `tobys` (no published site) returns the real markdown. 7 of 9 salons sampled by the audit were affected. Fix: answer those three paths from salonSeo before the published-website return, and add salonSeo's FAQ/summary/JSON-LD to the template-served pages.
- Not fixed now: it changes how every published salon website is served, so it needs its own change + test pass rather than a same-day audit edit.

## 2026-11-05 — Bloom template: found while correcting reviews, wording and privacy (not in that task's scope)

- `templates-storage/nail-salon-bloom/project/package-lock.json`: every package points at `http://package-firewall.replit.local/npm/`, which doesn't resolve on this server, so `npm install` crashes ("Exit handler never called"). `lib/screenshot.ts` builds templates that way, and `startup/seedNailSalonBloomTemplate.ts` deletes `dist/` when `src/context/SiteContext.tsx` is newer than `dist/index.html`. So editing that file and restarting could take all Bloom sites down ("Template not yet built") with a failing rebuild. On 11-05 Bloom was built by hand in a temp copy with the lockfile URLs pointed at registry.npmjs.org, and `dist` swapped by rename. Not fixed: the lockfile and the delete-before-build order are outside the task.
- `templates-storage/nail-salon-bloom/project/src/components/Hero.tsx:5` and `src/utils/contentHelpers.ts:7-11`: the hero photo and service placeholder photos are nail photos on every site, including barbers and hair salons. Left alone: replacing them changes the design and needs images chosen.
- `templates-storage/nail-salon-bloom/project/src/components/FeaturedServices.tsx`: "Real results from real clients" shows on salons with no reviews. It claims no rating, so it was left; a product call. `src/context/SiteContext.tsx` still falls back to the demo team and uses 'Nail Technician' as a default role, but no component on the site shows the team. `src/components/About.tsx` has nail copy and isn't used anywhere.
- `src/lib/render-salon-page.ts`: its email row is now always empty, because tenant data no longer carries the e-mail. Not live.

## 2026-11-05 — Founder image 404 in schema, and two different ratings per salon (found in GEO schema audit)

- FIXED 2026-11-05 (same day): founder Person `image` in `php/includes/header.php:124` and `php/about/default.php:138` pointed at a 404 R2 file; both now use `/airo-assets/images/team/thanh-lam-founder`.
- `artifacts/api-server/src/lib/tenant-seo.ts:187` vs `artifacts/api-server/src/lib/salonSeo.ts:118,253`: one salon gets two different `aggregateRating`s under two `@id`s. Sample `jims`: `https://jims.certxa.com/` says 5.0 from 20 with `@id` `https://jims.certxa.com#business`; `https://certxa.com/book/jims` says 4.5 from 52 Google reviews with `@id` `https://jims.certxa.com/#business`, and canonicalises to the first. Google's review snippet rules also don't accept ratings aggregated from another site, so whether to publish Google ratings is a decision to make.

Not fixed: the task was an audit only, with no site code changes. Details in `geo-reports/certxa.com/2026-11-05/GEO-SCHEMA-REPORT.md`.

## 2026-11-05 — Found in GEO technical audit: old prices on subdomains, API CORS open, dead directory links

Audit-only task, so none of these were fixed. Details in `geo-reports/certxa.com/2026-11-05/GEO-TECHNICAL-AUDIT.md`.

- `artifacts/api-server/src/marketing-site.ts:331`: retired PHP pages answer on every `*.certxa.com` host because only `APEX_HOSTS` get the new site. `https://salons.certxa.com/pricing` is 200, `index, follow`, and shows "Professional From $18/mo", "Elite From $39/mo" (real prices are $29/$99/$179). The directory footer links to `/solo-professionals` and `/booth-renters` on that host.
- `artifacts/api-server/src/index.ts:211,297`: `CORS_ALLOW_ALL` is set in `/etc/certxa.env`, so any Origin is reflected with `access-control-allow-credentials: true`, including a preflight to `/api/auth/login`. `SameSite=Lax` cookies limit the harm. Needs an owner decision on removing the flag.
- `artifacts/marketplace/src/App.tsx:106,108,128,130,139`: on `salons.certxa.com`, `/for-business`, `/saved` and `/search` return 404, the footer spotlight salon returns 410, and `/overview` 301s back to the directory.
- `artifacts/api-server/src/marketing-site.ts:294`: `no-store` is set for every marketing image response, so the 208 KB home hero and the logo redirect are never cached.

## 2026-11-04 — /isTeam Tickets: backend with no screen, and marketing mail becoming tickets

- `artifacts/api-server/src/routes/support.ts` (ticket tasks, escalations, related tickets, macros routes): these work but nothing in `/isTeam` calls them, so agents can't escalate a ticket or use saved replies. Left alone because whether to build screens for them or remove them is a product decision.
- `artifacts/api-server/src/services/emailTicketSync.ts`: every e-mail to support becomes a ticket, including LinkedIn, Stripe and marketing mail (415 of 688 tickets were auto-closed with no reply, nearly all of this kind). Now that unanswered tickets stay open, agents will see these until they mark them Junk. A sender filter needs a decision on which senders to drop.

## 2026-11-04 — /isTeam Incidents page is unreachable, and its service health is made up

`artifacts/booking/src/pages/isTeam/IncidentsPage.tsx` isn't routed: `/isTeam/incidents` shows Live Visitors (`TeamApp.tsx`). The API behind it, `/api/support/service-health/:key` and `/heal` (`artifacts/api-server/src/routes/support.ts`, near SERVICE_HEAL_ACTIONS), invents its numbers and log lines with jitter and Math.random, and most Heal actions wait a random delay and report success without doing anything (only `clear_sessions` and `gc` are real). Nothing reaches it today. Not fixed: whether to delete it or build real monitoring is the owner's decision. Don't re-route the page before that.

Also open: `/api/support/sales-leads` (`routes/salesAgent.ts`) has no department check, only the sidebar link is hidden, because that file is the sales-agent work. Add `requireDepartment("sales")` when it's next touched.

## 2026-11-02 — RESOLVED: local hub dropped the customer screen every 20 s; hub host election never reached the server

- **Where:** `artifacts/booking/src/lib/local-hub.ts` `heal()`; `artifacts/api-server/src/routes.ts` `POST /api/nail/hub/heartbeat`.
- **Symptom (store 2, offline test 2026-11-01 ~09:45 UTC):** after the cash sale the customer screen never showed the receipt options. Server log: the POS went `serving peers=0` and the screen `connecting` every 20 s, then reconnected ~4 s later; `POST /api/nail/hub/heartbeat 404` every minute.
- **Cause:** the uncommitted hub-election change was live on the web (09:09 UTC) but the API was never reloaded after its 09:03 build, so the server never sent `hostRegisterId`; `heal()` then saw the main POS as "not the host" and sent `HUB_STOP` + `HUB_SERVE` every 20 s, dropping every tablet. A message the POS sent in that gap was lost.
- **Fixed 2026-11-02:** the host never stops its own hub in `heal()`/`start()`; checkout messages held while a screen reconnects; the screen asks for the checkout again on reconnect and the POS re-sends a payment that is already settled; leases kept in Redis so `store_settings` (copied to every tablet) is written only on a host change; API reloaded.

## 2026-11-01 — RESOLVED: Billing routes reference an unimported account-status helper

- **Where:** `artifacts/api-server/src/routes/billing.ts:220` and `:1208`.
- **Symptom:** API-server typecheck reports `TS2304: Cannot find name 'isAccountStopped'` at both call sites. The billing account-status and blocked-notice handlers invoke it, but the file has no import or local declaration for the helper.
- **Why not fixed now:** unrelated to enabling payroll and commission lookups in the `/manage` assistant.
- **Resolved:** the import from `../lib/accountSuspension` is in the working tree (seen 2026-11-02).

## 2026-10-31 — trial-expiration's launch-site switch-off/on does nothing (column doesn't exist)

- **Where:** artifacts/api-server/src/services/trial-expiration.ts `deactivateLaunchSite` / `reactivateLaunchSite`.
- **Symptom:** both queries filter `onboarding_submissions` by `store_id` (and `os.store_id`), but that table has no store_id column (`column "store_id" does not exist`). Errors are swallowed by the empty catch, so suspending/reopening a salon never changes its launch-site row.
- **Impact:** none seen — a suspended salon's sites are already taken down by the account-status checks (middleware/subdomain.ts, template-serve.ts, websites.ts use isAccountStopped / account_status). Found while reopening store 2.
- **Why not fixed now:** harmless; fixing needs the real link from onboarding_submissions to a store (probably via subdomains/user) and would start changing launch-site rows that have never been touched.


## 2026-10-31 — /nail and /barber ignore the "Add-ons are taxed" switch; "Gift cards are taxed" is used nowhere

- **Where:** shared/nailCheckout.ts:32-42 (`salesTaxCents`, `SalesTaxSettings` has only `services` + `products`), artifacts/api-server/src/routes.ts:20708 (server builds the same two flags), shared/schema.ts:244/246.
- **Symptom:** POS Settings and the new Front Desk Setup both offer "Add-ons are taxed" and "Gift cards are taxed". On /nail and /barber (and the server's settlement) add-ons are counted as service revenue, so they are taxed exactly when services are, whatever the add-ons switch says. Only the main POS (pages/POSInterface.tsx:695) reads `taxAddonsTaxable`. `taxGiftCardsTaxable` is saved and returned by GET/PATCH /api/pos-settings but no checkout reads it.
- **Why not fixed now:** found while investigating owner-defined tax rules (several named taxes, each with its own rate and what it applies to). That redesign replaces these flags and the three separate tax calculations (nailCheckout.ts, POSInterface.tsx, Calendar), so patching them first would be throwaway. Fix as part of it, or on its own if the redesign isn't approved.


---

## 2026-10-30 — E-mail audit: open items (not fixed)

Found in the e-mail system audit (fixed items are in commit "E-mail audit fixes"). These need a decision or a
larger change:

1. **Lifecycle e-mails fire once per owner, ever.** `services/platform-email-engine.ts` `emitPlatformEmailEvent` uses
   the event key `${eventName}:${userId}` (unique in `platform_email_event_log`) and enrollments are unique on
   `(campaign_id, user_id)`; deliveries on `(campaign_id, step_id, user_id)`. So "payment failed", "account
   suspended" and "account reactivated" are sent the first time only; a second failed payment months later sends
   nothing. Fix needs per-occurrence event keys (e.g. invoice id) and re-enrollment once the earlier enrollment is
   completed.
2. **Bounces and spam complaints never stop future mail.** `routes/platformEmailCampaigns.ts`
   `/api/webhooks/mailgun/platform-email` only records the event; it does not add the address to
   `platform_email_suppressions`, and it only covers platform campaign mail. `MAILGUN_WEBHOOK_SIGNING_KEY` is not
   set in `/etc/certxa.env`, and it is unknown whether the webhook is registered in Mailgun at all.
3. **Client marketing e-mails have no unsubscribe link or postal address** (US CAN-SPAM). `services/campaign-scheduler.ts`
   ("Message from <salon>") and `lapsed-client-scheduler.ts` ("We miss you"). Opted-out clients are now skipped, but a
   client has no way to opt out from the e-mail itself. Neither has been sent yet (no e-mail campaigns in the database).
4. **Sender is a bare `Certxa@mg.certxa.com`** with no reply-to. Receipts and client e-mails from a salon come from
   Certxa and replies don't reach the salon; the welcome series says "reply to this email".

## 2026-10-30 — Support "magic link" sign-in links lead nowhere

`artifacts/api-server/src/routes/support.ts:3355` — `POST /api/support/accounts/:id/magic-link` stores a token in
`support_magic_links` and returns `${APP_URL}/api/auth/magic?token=…`, but no route serves `/api/auth/magic`
(grep finds nothing), so the link a support agent sends can never sign the owner in. Not fixed now: found while
building the Certxa Pro Plus sign-in link (routes/soloPlus.ts has a working single-use link that could be the
model). Needs a decision on whether support should be able to sign owners in by link at all.

---

## 2026-10-30 — Admin platform-settings Save rewrites the text/e-mail provider keys

`artifacts/api-server/src/routes.ts` — `PUT /api/admin/platform-settings` (just below the new `/api/admin/solo-sms-settings`).
Saving the admin Platform Settings page (`PlatformSettingsManager.tsx`) sets `process.env.TWILIO_*` and `MAILGUN_*` in
memory from whatever the form sent, and writes them to a `.env` file in the process's working directory (not
`/etc/certxa.env`). A save with an empty or wrong Twilio/Mailgun field would stop every text or e-mail on that pm2 worker
until a restart, and the two cluster workers can disagree. `GET` also returns the live Twilio auth token and Mailgun key
to the browser. Not fixed now: found while adding the Solo free-credits setting (given its own save to stay clear of
this). The fix would be to stop the page from editing provider keys, or to store them properly; that needs a decision
about whether admins should edit keys from the web at all.

---

## 2026-10-29 — App-wide sweep (logs, browser errors, live data)

Fixed and deployed: support account Owners panel (500 — joined on a `staff.user_id` column that doesn't exist);
nail-salon tickets can no longer be closed unpaid through PATCH /api/appointments/:id (the phone calendar's Complete
button closed tickets 302, 303, 305 on 10-27 with no payment); SMS inbox crash when a load failed; error screen flash
during the after-deploy reload; calendar re-fetching "available time" ~20× per save; /api/public/plan-prices now reads
subscription_plans (item 1 below); AI coaching backs off for 10 minutes after an OpenAI failure.

Still open — needs the owner:
- **OpenAI account is out of credit** (`credit_balance_exhausted` in today's error log). Autumn's calls and every AI
  summary fail until credit is added.
- **22 paid-looking tickets at Luxury Nails (store 2) are "completed" with no payment** — 3 from 2026-10-27 (#302 $95,
  #303, #305 $85 service), 19 from Sept 22–28. Left as they are: whether money was collected is unknown.
- **Open cash-drawer shifts:** store 38 since 10-03, stores 39 and 40 since 10-09 — someone there runs Day Close.
- **AI Receptionist safety gate**: logs "Live calls not enabled for this salon — run preflight first … strict mode is
  OFF — allowing call" for some stores.
- ~~Intelligence dashboard "at risk" rule~~ — now the shared rule (intelligence/churn.ts), 2026-10-29. Unpaid tickets left as is and Autumn strict mode left off (owner, 2026-10-29).

## 2026-10-28 — Worked through (fixed today)

- **Catalog store checks — fixed and live (deployed 2026-10-28):**
  `POST /api/service-categories/reorder` now only reorders the caller's categories, and every service–add-on link
  route (`GET /api/service-addons`, `GET …/for-service`, `POST`, `DELETE`) is limited to the caller's store. Tested on
  the scratch server: another business's service can't be linked, unlinked, listed or reordered.
- **Texting opt-out on /nail "text client ready"** — the uncommitted edit that removed the `result.skipped` check is
  undone in the working tree (it was never live).
- **Duplicate security headers** — removed nginx's copies of X-Frame-Options, X-Content-Type-Options,
  X-XSS-Protection and Referrer-Policy (`/etc/nginx/conf.d/certxa.conf`, backup `.bak-dupheaders-*`); each header
  now goes out once (X-XSS-Protection `0`). Live.
- **Autumn on Enterprise** — already 100 included calls (`autumnCallBilling.ts`, 2026-10-24); entry closed.
- **Pro app client list** keyed by client id instead of name (same-name clients no longer collide).
- Removed the entries already marked resolved/fixed (Twilio outage, appointment delete, POS e-mail receipt).
- **Owner decisions 2026-10-28, tested on the scratch server and deployed 2026-10-28 05:24 UTC** (API backup
  `dist/index.mjs.bak-1793165060`; the Pro app parts reach staff with the next Pro iOS build):
  - **Day Close** lists clients still waiting on a ticket nobody started (`waitingTickets` on
    `/api/cash-drawer/day-close-status`) with one tap "Clear as no-shows" (`POST /api/cash-drawer/day-close/clear-waiting`:
    no-show with no win-back text, held technician freed, check-in closed). It does not block the close.
  - **Pro app "Notify client"** on a dragged appointment now texts the new day and time (`sendRescheduleNotice` in
    sms.ts, sent when PATCH /api/appointments/:id has `notifyClient: true` and the date changed; opt-outs respected).
  - **Pro app "Mark as paid"** now records a cash sale for the visit total (status completed, payment cash). It used to
    send status "paid", which the server turns into **pending** — it un-confirmed the booking and recorded nothing.
    Ships with the next Pro app build.
  - **Pro app sales tax** was already done (checkout uses the salon's POS tax settings; services taxed only when the
    salon turns that on).

---

## 2026-10-22 — Certxa Pro app: checkout and appointment defects found in the GlossGenius audit

Full list with context: `plans/certxa-pro-glossgenius-audit.md`, section 3 (B1–B11). The ones that are defects rather than missing features:
- **The "gift card / record manually" checkout screen** is unreachable dead code (the second `return` after `TipCheckout` in `app/(tabs)/checkout.native.tsx`) and saves nothing to the server. (Sales tax and Mark as paid: see 2026-10-28.)
- **Notes row opens an edit screen with no notes field** (`app/appointment/[id].tsx`).
- **Drag starts on touch, not press-and-hold** (`DraggableAppointment` in `app/(tabs)/index.tsx`, `onStartShouldSetPanResponder: () => true`), so scrolling over a booking moves it. Needs device testing.
- **Client list visits/spend are hard-coded placeholders** (`app/(tabs)/clients.tsx`; the name-as-key collision was fixed 2026-10-28). Real figures need visit/spend totals from the server.
- **Why not fixed now:** the user asked for an audit; these need product decisions or a device to test on. Fixed the same day: add-ons/extra services missing from the charged amount, `offeredAt` missing, sample clients on empty days, Week/Month views, Text/Call/Email (main `947a002b`, Pro `b855cee`).

## 2026-10-13 — Certxa Pro app: "Notify client" switch does nothing; edit screen offers six fixed times

- **File:** `certxa-pro-replit/staff-app-latest/artifacts/certxa-pro/app/(tabs)/index.tsx` (reschedule dialog, `notifyClient`) and `app/appointment/[id].tsx:11` (`timeSlots`).
- **Symptom 1:** fixed 2026-10-28 (see above).
- **Symptom 2:** the appointment edit screen can only move a booking to one of six hard-coded times (9:00, 10:30, 12:00, 2:00, 3:30, 5:00), not to the times the business is actually open and free.
- **Context:** found while fixing the day view and overlap check. The server has no "reschedule and notify" option on `PATCH /api/appointments/:id` today, so symptom 1 needs a decision on what the client should be sent (SMS, e-mail, both).
- **Why not fixed now:** both are product decisions rather than defects in what was asked for.

## 2026-10-12 — Marketing site move: what is still open (updated 2026-10-21)

1. **Hardware shop is built but closed.** Cart, UPS Ground quote, Stripe checkout (card + Affirm, no tax), order table and the admin Fulfillment queue exist (`artifacts/api-server/src/lib/shop.ts`). It stays closed until the server has UPS credentials (`UPS_CLIENT_ID`, `UPS_CLIENT_SECRET`, `UPS_SHIPPER_NUMBER`), a ship-from address (`SHOP_SHIP_FROM_*`) and a boxed weight for every product in `shared/shopCatalog.ts`. The UPS call and a real payment have never been run; Affirm must be enabled in the Stripe dashboard; no email goes out on a new order. /products still shows "Buy now" while the shop is closed, and says the card reader is "free with every Professional plan" — owner to confirm both.
2. **Stock photographs** (Getty images) are not hosted here; `/airo-assets/images/<slot>` redirects to GoDaddy's CDN (since 2026-10-21 at 1280 px). They disappear if the Airo site is cancelled.
3. **Logo.** Header uses the owner's logo file ("cirtXa", at the owner's instruction); the dark footer still uses the text wordmark (`BrandWordmark.tsx`) because no light-on-dark logo exists. The home page's Autumn screenshot (`media/pages__autumn__new-screenshot`) still shows the older "sirtXa" logo.
4. **/data-transfer** (PHP, `php/data-transfer/default.php` ~line 512) shows "24h average transfer time · 0 data lost · 7+ platforms" and a GDPR claim. Keep only if true — owner to confirm.
5. **Launchit template catalogue is empty** (`launchsite_templates` has 0 rows). Since 2026-10-21 the empty page is `noindex` and out of the sitemap until templates are added. Owner: add templates or retire the page.

Fixed 2026-10-21: the PHP pages now show the chat launcher only 10am–9pm Eastern (`php/includes/footer.php`); /products card fees match /pricing and the code (Stripe's rate + $0.60 Certxa fee); all old-address redirects are 301; `llms-full.txt` regenerated (`scripts/gen-llms-full.py`, run after changing marketing pages).

---

## 2026-10-09 — Log cleared

Every entry logged up to 2026-10-09 was worked through. Fixed entries were removed (their details are in git history). What is left below cannot be closed by a code fix alone: each needs a decision, an account only the owner can reach, or a test on real hardware.

Fixed in the final pass on 2026-10-09: a ticket left "started" more than two days ago no longer blocks Day Close (`findUnpaidTickets`, `routes.ts`); `POST /api/image-library/upload` and `/harvest` now need a signed-in account; app screens served by the final page fallback are `noindex` again (`index.ts` — the 2026-09-22 fix had been lost, which is how `/book/jims` became a Soft 404); the kiosk stops with "already checked in" when the client is already on a ticket (`alreadyOnTicket` from the lookup).

---

## Decided 2026-10-09 and done

Solo is free (migration 0234; billing activates it without a checkout; site and app copy updated). Salons set their own tip presets (POS Settings → Tip presets, `shared/tipPresets.ts`). Discounts on the calendar checkout need no approval, the same as /nail. Kiosk walk-ins are tickets at barbershops as well as nail salons. Reprint on the /nail checkout reprints the last receipt printed on that device.

## Still to build or decide

**1. Plan prices — fixed 2026-10-21; /api/public/plan-prices moved to `subscription_plans` 2026-10-29.**

**2. Buttons that still only say "COMING SOON"** (to be built, decided 2026-10-09): Sell Gift Card on /nail (`GiftCardSheet.tsx`, `CheckoutMode.tsx`), and Gift Card (Sell / Redeem / Check Balance), Membership and Reprint on the calendar checkout sheet (`Calendar.tsx`, `handlePosAction`). Selling a gift card is a sale: it needs to be paid for (cash and card), counted in Day Close, and kept out of commission, tips and turns. "Membership" has nothing behind it yet — what a membership is has to be defined first.

**3. Tip screen leftovers:** the preset notes ("Good service." …) are English only, and the tip page does not use the salon's theme or show the technician's name.

**4. Two services per visit (built 2026-10-13) — what is left.** A client can now choose two services (2½ hours at most) at the kiosk and in online booking. Left: the Mobile and Bloom booking themes still take one service; the second service at the kiosk cannot be one with size options; a kiosk walk-in at a business with no staff screen (hair salon, spa) still records only the first service; the kiosk two-service path was not run end to end (the test server's kiosk is switched off).

**5. Kiosk walk-ins at businesses without a staff screen** (hair salon, spa…) still go through the booking engine and can be refused. Nail salons and barbershops make tickets.

**6. Group Pay tip split by duration ignores extras added at checkout.**
`shared/nailCheckout.ts`: an `Extra` has no duration, so a technician who did extra work gets no larger share. Needs a rule for how long an extra counts for.

**7. Calendar (non-nail) Group Pay: a linked ticket's retail items earn no product commission.**
`Calendar.tsx` `ticketSubtotal`: a linked appointment has no field for retail lines, only the ticket being checked out does (`posExtraItems`). Fixing it means giving every linked ticket its own lines.

**8. Day Close.**
(a) Built 2026-10-28, not yet live: Day Close lists waiting tickets nobody started with "Clear as no-shows" (see top). (A ticket marked DONE but not paid does block it, and since 2026-10-21 the sheet lists it as "Done, waiting for payment".) (b) A close cannot be undone, and the drawer is locked for 12 hours afterwards, even after a mistaken count. (c) The count is blind by design: the expected cash is not shown to the person closing. (d) Store 38 (Floyd's 99 Barbershop) has had one shift open since 2026-10-03; someone there has to run Day Close.

**9. `/ws/notifications` has no authentication** — left as is at the user's request (2026-10-06). Because of it the server also cannot hold a customer screen to its paired station.

**10. `GOOGLE_API_KEY` in `/etc/certxa.env` has a stray `export` glued to its value** — left as is at the user's request (2026-09-24).

## Needs the Stripe dashboard or a real reader

**11. Stripe M2 / Terminal, four items left from the 2026-09-20 audit** (`routes/stripeConnect.ts`, `apps/certxa-owner`): one needs the Stripe dashboard, one is new feature work (the reader-registration screen uses a `registration_code`, which is for internet readers, not the Bluetooth M2), and two need a test with a real M2 reader.

## Offline

**16. Offline start and the 3 AM restart are untested on a real tablet.** In a desktop Chromium simulation (`artifacts/booking/scripts/offline-launch-check.cjs`) the staff screens start with the server gone, including on a tablet's first run. The owner app now retries a failed load every 20 seconds (`apps/certxa-owner/app/index.tsx`), but that needs a new APK build, and none of it has been run on Android.

**17. A tablet that is offline cannot tell the server it holds unsent cash.** Day Close refuses when another tablet has reported unsent cash. The extra confirmation for a tablet that had merely gone quiet was removed on 2026-10-13 (it fired for every tablet switched off for the night), so cash taken on a tablet that never got back in touch is not in that night's totals; it lands in the next shift when the tablet reconnects.

**18. Client profile edits from two devices are still last-write-wins.** /nail has no client edit screen, so nothing was queued for it; the calendar's older offline queue (`UPDATE_CLIENT` in `lib/sync-engine.ts`) sends edits with no version check.

## Low priority, known limits

**12. Check MICR line with an account number longer than 10 digits** (`components/pdf/CheckDocumentPDF.tsx`, `PrintChecks.tsx`): the digits print correctly, but the centred line grows, moving every field left by half a character per extra digit. The line has never been laid out to fixed ANSI positions; confirm with a bank or a MICR gauge before changing it.

**13. Duplicate numeric prefixes in `/apps/CM/migrations/`** (0000, 0001, 0025, 0123, 0132 each appear twice). Harmless: the tracking table is keyed by the full filename. Renaming applied migrations would make them run again, so leave them.

**14. Stores created before 2026-10-03 that are not nail salons still hold a copy of the nail catalogue** (only store 38 was cleaned). Removing services from a live store is that salon's call.
