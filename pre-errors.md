# Pre-existing errors log

Bugs/type-errors Claude noticed while working on an unrelated task, in files it did not intend to change, and did not fix. Each entry is a candidate for its own small follow-up task — pick one when convenient.

Convention: newest entries at the top. Include date found, file:line, the exact error, and enough context for someone to pick it up cold.

---

## 2026-10-12 — Marketing pages contradict each other on four product facts (found by the GEO audit)

Each needs the owner to say which statement is true; the wrong side can then be edited in a minute. Not fixed because the correct fact is a product/pricing decision, not something the code can tell me.

1. **Autumn price.** `php/pricing/default.php:677` ("From $29 /mo", and "$0.50 per call handled" elsewhere on the page) vs `php/autumn/default.php` ("There's no additional monthly fee", billed per minute of active call time).
2. **Deposits.** `php/pricing/default.php` comparison table: "Deposits & prepayments — Coming Soon" on all plans, vs `php/online-booking/default.php` ("You can require a deposit (fixed amount or percentage)") and `php/best-free-salon-booking-system/default.php` ("Deposits, POS, and a kiosk included").
3. **Support hours.** `php/overview/default.php` ("24/7 live support") vs `php/contact/default.php` ("Monday – Friday · 9:00 am – 6:00 pm ET · Closed weekends").
4. **Native apps.** `php/overview/default.php` ("Certxa has native apps for both iOS … and Android") vs `php/pricing/default.php` ("iOS & Android app — Coming Soon").

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
