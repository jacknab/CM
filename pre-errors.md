# Pre-existing errors log

Bugs/type-errors Claude noticed while working on an unrelated task, in files it did not intend to change, and did not fix. Each entry is a candidate for its own small follow-up task — pick one when convenient.

Convention: newest entries at the top. Include date found, file:line, the exact error, and enough context for someone to pick it up cold.

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
