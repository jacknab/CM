# Pre-existing errors log

Bugs/type-errors Claude noticed while working on an unrelated task, in files it did not intend to change, and did not fix. Each entry is a candidate for its own small follow-up task — pick one when convenient.

Convention: newest entries at the top. Include date found, file:line, the exact error, and enough context for someone to pick it up cold.

---

## 2026-10-13 — Certxa Pro app: "Notify client" switch does nothing; edit screen offers six fixed times

- **File:** `certxa-pro-replit/staff-app-latest/artifacts/certxa-pro/app/(tabs)/index.tsx` (reschedule dialog, `notifyClient`) and `app/appointment/[id].tsx:11` (`timeSlots`).
- **Symptom 1:** after dragging an appointment, the dialog has a "Notify client" switch. Its value is never sent to the server, so the client gets no message whichever way it is set.
- **Symptom 2:** the appointment edit screen can only move a booking to one of six hard-coded times (9:00, 10:30, 12:00, 2:00, 3:30, 5:00), not to the times the business is actually open and free.
- **Context:** found while fixing the day view and overlap check. The server has no "reschedule and notify" option on `PATCH /api/appointments/:id` today, so symptom 1 needs a decision on what the client should be sent (SMS, e-mail, both).
- **Why not fixed now:** both are product decisions rather than defects in what was asked for.

## 2026-10-12 — Support ticket closure emails are failing to send

**Where:** server error log (`/root/.pm2/logs/certxa-api-error*.log`), lines `[AutoClose] Could not send closure email for ticket #TK-…: Invalid login: 454 4.7.0 Account is temporarily unavailable.`

**Symptom:** when the support system auto-closes a ticket, the email telling the customer fails because the mail account's sign-in is refused by the provider ("account temporarily unavailable"). The ticket still closes; the customer is not told.

**Context:** seen while checking logs after an unrelated /nail deploy. The same mailbox may be the one the support inbox reads from, so inbound support mail could be affected too — not checked.

**Why not fixed:** it is a mail-account problem at the provider (credentials or a lock on the account), not code; needs the owner to check that mailbox's sign-in.

---

## 2026-10-12 — Marketing site move: what is still open

The new site (`artifacts/marketing`) now serves `/`, `/pricing`, `/features`, `/booking`, `/autumn`, `/about`, `/contact`, `/careers`, `/changelog`, `/roadmap`. Still to do, each needing the owner or more work:

1. **Old contact form never sent anything.** `php/contact/default.php:259` (`handleContactForm`) only showed "Message received!" after a timer; every message typed into it was discarded. Not fixed in PHP because `/contact` now comes from the new app, whose form posts to `POST /api/contact-form` (`artifacts/api-server/src/marketing-site.ts`) and emails support@certxa.com. Live chat on the new site (launcher on every page plus a button on Contact) appears only 10am–9pm Eastern, every day (`artifacts/marketing/src/lib/live-chat-hours.ts`); the PHP pages still load the chat launcher at all hours (`php/includes/footer.php:79`).
2. **Changelog and Roadmap** were rewritten on 2026-10-13 from the real release history and the real state of the product (no version numbers beyond date stamps, no vote counts). Keep them current by hand: `artifacts/marketing/src/content/pages/changelog.json` and `roadmap.json`.
3. **Hardware shop is built but closed.** Cart, UPS Ground quote, Stripe checkout (card + Affirm, no tax), order table and the admin Fulfillment queue exist (see `artifacts/api-server/src/lib/shop.ts`). It stays closed, and Buy buttons keep going to the contact page, until the server has UPS credentials (`UPS_CLIENT_ID`, `UPS_CLIENT_SECRET`, `UPS_SHIPPER_NUMBER`), a ship-from address (`SHOP_SHIP_FROM_*`), and a boxed weight for every product in `shared/shopCatalog.ts`. The UPS call and a real payment have never been run. Affirm must be enabled in the Stripe dashboard. No email goes out on a new order. Two statements on the Hardware page carry a cost or a conflict: the card reader is "free with every Professional plan", and processing is quoted as 2.7% + 10¢ there but 2.7% + $0.05 on `/pricing`. **Still on PHP:** `/privacy` and `/terms` (owner decided: keep the current legal text — port it into the new design before PHP is removed, do not use Airo's text), `/blog` (new page is a static list; real posts are in the database).
4. **Stock photographs** (23 Getty images) are not hosted here; `/airo-assets/images/<slot>` redirects to GoDaddy's CDN. They disappear if the Airo site is cancelled.
5. **Logo.** The owner's logo file (reads "cirtXa") is in every page header at the owner's instruction (`artifacts/marketing/public/logo.png`, also used by `php/includes/nav.php`). The dark footer still uses the text wordmark `BrandWordmark.tsx` ("certXa") because no light-on-dark version of the logo exists, so header and footer spell the name differently. The home page's Autumn screenshot (`media/pages__autumn__new-screenshot`) still shows the older "sirtXa" logo.
6. **Redirects from old addresses are temporary (302)** (`MOVED` in `marketing-site.ts`); make them 301 once the owner has approved where each lands.
7. `artifacts/booking/public/llms-full.txt` still holds the text of the old PHP pages.
---

## 2026-10-12 — Open items from the GEO audit, and two Autumn fee questions

The four cross-page conflicts found by the audit (Autumn price, deposits, support hours, native apps) were settled by the owner and fixed the same day.

**Autumn fees (settled by the owner 2026-10-12).** Call billing follows `artifacts/api-server/src/lib/autumnCallBilling.ts`: Solo 20, Professional 50, Elite 100 handled calls per calendar month, then $0.50 per call; calls of 30 s or less free. The $15 one-time activation fee for the dedicated phone number still applies (`routes/aiReceptionist.ts`); there is no monthly number fee (the $2/month shown on the in-app fee card was never charged and was removed). The 60-day trial gets no free calls ($0.50 each), which is what the code does. Still open: the `enterprise` plan has no stated allowance (0 included). The pricing and Autumn pages now state the $15 activation fee and that included calls start with the paid plan.

Also open from the same audit, all listed in `GEO-AUDIT-REPORT.md` (2026-10-12): the home page FAQ markup (`php/overview/default.php:40-70`) is hand-written separately from the visible accordion (~line 815) and four answers differ; the React directory pages emit no Organization node (`artifacts/marketplace/src/entry-server.tsx`); salon profile JSON-LD puts the whole address in `streetAddress` with no `postalCode`; `/sitemap-listings.xml` stamps every URL with the generation date as `lastmod`; unsupported guarantees on `/pricing`, `/contact` and the home page. `artifacts/booking/public/llms-full.txt` is a hand-maintained snapshot of page text with no generator, so it goes stale whenever a marketing page changes (it still had the $9 Solo price until today).

---

## 2026-10-10 — The production API is restarted by pm2 for memory 6 to 22 times an hour

**Where:** pm2 app `certxa-api`, `max_memory_restart` = 1000 MB. `/root/.pm2/pm2.log`: "Process 9 restarted because it exceeds --max-memory-restart value (current_memory≈1.08 GB)" — 2,637 times in the log, 149 times on 2026-10-09 alone (6–22 an hour, sometimes every 30 seconds for several minutes). The process sits at about 985 MB when idle, so it is at the limit as soon as it starts.

**Why it matters:** every restart is a few seconds when the server does not answer. Since the offline work (Phase 2), a /nail tablet that gets no answer shows OFFLINE and saves to its own queue until the server is back — safe, but staff will see the offline pill come and go many times an hour. Each restart also applies whatever migration files are on disk: migration 0237 reached production this way on 2026-10-09 16:29 UTC without any deploy.

**Limit raised 2026-10-10:** `ecosystem.config.js` already said 2000 MB but pm2 had never been given it; it was applied with the Phase 4/5 deploy (`pm2 reload ecosystem.config.js --only certxa-api --update-env`). **Still open:** the server uses about 1 GB as soon as it starts and grows from there (the config file's own comment points at the unbounded `_enrichmentCache` in `artifacts/api-server/src/lib/salonData.ts`); if it reaches 2 GB the restarts come back.

---

## 2026-10-09 — Log cleared

Every entry logged up to 2026-10-09 was worked through. Fixed entries were removed (their details are in git history). What is left below cannot be closed by a code fix alone: each needs a decision, an account only the owner can reach, or a test on real hardware.

Fixed in the final pass on 2026-10-09: a ticket left "started" more than two days ago no longer blocks Day Close (`findUnpaidTickets`, `routes.ts`); `POST /api/image-library/upload` and `/harvest` now need a signed-in account; app screens served by the final page fallback are `noindex` again (`index.ts` — the 2026-09-22 fix had been lost, which is how `/book/jims` became a Soft 404); the kiosk stops with "already checked in" when the client is already on a ticket (`alreadyOnTicket` from the lookup).

---

## Decided 2026-10-09 and done

Solo is free (migration 0234; billing activates it without a checkout; site and app copy updated). Salons set their own tip presets (POS Settings → Tip presets, `shared/tipPresets.ts`). Discounts on the calendar checkout need no approval, the same as /nail. Kiosk walk-ins are tickets at barbershops as well as nail salons. Reprint on the /nail checkout reprints the last receipt printed on that device.

## Still to build or decide

**1. Professional and Elite: three different prices.** The site, the in-app billing page and `billing_plans` say $22 and $49 a month; `subscription_plans` says $45.95 and $79.00, and those are the Stripe prices actually charged (`price_1TtGbtRDJayCN7TT53D0FErP`, `price_1TtSdNRDJayCN7TTWqMAEqxr`, read 2026-10-09). A salon choosing Professional is shown $22 and charged $45.95. Needs the right numbers from the owner.

**2. Buttons that still only say "COMING SOON"** (to be built, decided 2026-10-09): Sell Gift Card on /nail (`GiftCardSheet.tsx`, `CheckoutMode.tsx`), and Gift Card (Sell / Redeem / Check Balance), Membership and Reprint on the calendar checkout sheet (`Calendar.tsx`, `handlePosAction`). Selling a gift card is a sale: it needs to be paid for (cash and card), counted in Day Close, and kept out of commission, tips and turns. "Membership" has nothing behind it yet — what a membership is has to be defined first.

**3. Tip screen leftovers:** the preset notes ("Good service." …) are English only, and the tip page does not use the salon's theme or show the technician's name.

**4. The kiosk takes one service per check-in.**
`KioskCheckIn.tsx` `toggleSvc` replaces the selection; the server only makes the first service the ticket's service. Allowing two (a manicure and a pedicure) touches the ticket, the slip and the wait estimate. Also needed for Smart Check-In's complementary offers.

**5. Kiosk walk-ins at businesses without a staff screen** (hair salon, spa…) still go through the booking engine and can be refused. Nail salons and barbershops make tickets.

**6. Group Pay tip split by duration ignores extras added at checkout.**
`shared/nailCheckout.ts`: an `Extra` has no duration, so a technician who did extra work gets no larger share. Needs a rule for how long an extra counts for.

**7. Calendar (non-nail) Group Pay: a linked ticket's retail items earn no product commission.**
`Calendar.tsx` `ticketSubtotal`: a linked appointment has no field for retail lines, only the ticket being checked out does (`posExtraItems`). Fixing it means giving every linked ticket its own lines.

**8. Day Close.**
(a) An assigned, unpaid ticket that was never started does not block the close and stays on the next day's board. (b) A close cannot be undone, and the drawer is locked for 12 hours afterwards, even after a mistaken count. (c) The count is blind by design: the expected cash is not shown to the person closing. (d) Store 38 (Floyd's 99 Barbershop) has had one shift open since 2026-10-03; someone there has to run Day Close.

**9. `/ws/notifications` has no authentication** — left as is at the user's request (2026-10-06). Because of it the server also cannot hold a customer screen to its paired station.

**10. `GOOGLE_API_KEY` in `/etc/certxa.env` has a stray `export` glued to its value** — left as is at the user's request (2026-09-24).

## Needs the Stripe dashboard or a real reader

**11. Stripe M2 / Terminal, four items left from the 2026-09-20 audit** (`routes/stripeConnect.ts`, `apps/certxa-owner`): one needs the Stripe dashboard, one is new feature work (the reader-registration screen uses a `registration_code`, which is for internet readers, not the Bluetooth M2), and two need a test with a real M2 reader.

## Offline

**16. Offline start and the 3 AM restart are untested on a real tablet.** In a desktop Chromium simulation (`artifacts/booking/scripts/offline-launch-check.cjs`) the staff screens start with the server gone, including on a tablet's first run. The owner app now retries a failed load every 20 seconds (`apps/certxa-owner/app/index.tsx`), but that needs a new APK build, and none of it has been run on Android.

**17. A tablet that is offline cannot tell the server it holds unsent cash.** Day Close refuses on reported cash and now asks for a confirmation when a tablet used today has gone quiet (`QUIET_DEVICES`), but whether that tablet holds money can only be found by looking at it.

**18. Client profile edits from two devices are still last-write-wins.** /nail has no client edit screen, so nothing was queued for it; the calendar's older offline queue (`UPDATE_CLIENT` in `lib/sync-engine.ts`) sends edits with no version check.

## Low priority, known limits

**12. Check MICR line with an account number longer than 10 digits** (`components/pdf/CheckDocumentPDF.tsx`, `PrintChecks.tsx`): the digits print correctly, but the centred line grows, moving every field left by half a character per extra digit. The line has never been laid out to fixed ANSI positions; confirm with a bank or a MICR gauge before changing it.

**13. Duplicate numeric prefixes in `/apps/CM/migrations/`** (0000, 0001, 0025, 0123, 0132 each appear twice). Harmless: the tracking table is keyed by the full filename. Renaming applied migrations would make them run again, so leave them.

**14. Stores created before 2026-10-03 that are not nail salons still hold a copy of the nail catalogue** (only store 38 was cleaned). Removing services from a live store is that salon's call.

**15. Live chat:** a chat re-queued after its agent disappeared stays in the queue if the visitor has also left, until an agent closes it.
