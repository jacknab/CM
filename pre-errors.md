# Pre-existing errors log

Bugs/type-errors Claude noticed while working on an unrelated task, in files it did not intend to change, and did not fix. Each entry is a candidate for its own small follow-up task — pick one when convenient.

Convention: newest entries at the top. Include date found, file:line, the exact error, and enough context for someone to pick it up cold.

---

## 2026-10-23 — ALL texts failing: Twilio account "not active" (needs the account owner)

- **Symptom:** every `sendSms` since between 21:58 and 22:15 server time on 2026-10-23 fails with `authentication failed, account AC311f…(masked) with status 4 is not active` (see `sms_log.error_message`). Texts at 21:58 (store 2, cancellation_recovery) still went out; the first failure was store 2's winback at 22:15:06. `twilioLookup` fails the same way.
- **Impact:** booking confirmations, reminders, receipts, booking-request texts, and probably sign-in codes. Nothing the code can fix.
- **Next:** someone with access to that Twilio account checks why it is suspended/closed (billing, compliance review), reactivates it or puts new credentials in `/etc/certxa.env`, then `export` them and `pm2 restart certxa-api --update-env` (see owner-apk-url-env-gotcha in memory).
- **Not caused by** the booking-request test: that test's first text was at 22:15:22, after the first failure.

## 2026-10-23 — FIXED: deleting an appointment failed once any text about it was logged

- `storage.deleteAppointment` hit `sms_log_appointment_id_appointments_id_fk`, so the app's and website's Delete returned 500 ("Failed query: delete from appointments") for any booking with a logged confirmation text. Now the SMS and AI-call log rows are unlinked (kept) first. Payment, loyalty and gift-card rows still block a delete on purpose (main `0d00f589`).

## 2026-10-22 — FIXED: `/api/pos/email-receipt` trusted the request's storeId and storeName

- **File:** `artifacts/api-server/src/routes.ts` (`/api/pos/email-receipt`), `mail.ts` (`sendPOSReceiptEmail`).
- **Symptom:** any signed-in account could send a receipt e-mail as any store, with any store name and unescaped HTML in the names.
- **Fix:** the store now comes from `resolveSessionStoreId`, which only honours a storeId the user owns, and the name from the store record; all text is HTML-escaped. Fixed the same day it was found.

## 2026-10-22 — Certxa Pro app: checkout and appointment defects found in the GlossGenius audit

Full list with context: `plans/certxa-pro-glossgenius-audit.md`, section 3 (B1–B11). The ones that are defects rather than missing features:
- **Sales tax not charged** (`app/(tabs)/checkout.native.tsx`). Settings → Sales tax says "Tax added at checkout"; checkout never adds it. Needs a decision on taxing services.
- **Mark as paid records no amount or method** (`app/appointment/[id].tsx`, `markPaid`), so cash income never reaches reports. The "gift card / record manually" checkout screen is unreachable dead code (the second `return` after `TipCheckout`) and saves nothing to the server.
- **Notes row opens an edit screen with no notes field** (`app/appointment/[id].tsx`).
- **Drag starts on touch, not press-and-hold** (`DraggableAppointment` in `app/(tabs)/index.tsx`, `onStartShouldSetPanResponder: () => true`), so scrolling over a booking moves it. Needs device testing.
- **Client list uses the name as the React key** (`app/(tabs)/clients.tsx`), so two clients with the same name collide; visits/spend are hard-coded placeholders.
- **Why not fixed now:** the user asked for an audit; these need product decisions or a device to test on. Fixed the same day: add-ons/extra services missing from the charged amount, `offeredAt` missing, sample clients on empty days, Week/Month views, Text/Call/Email (main `947a002b`, Pro `b855cee`).

## 2026-10-13 — Certxa Pro app: "Notify client" switch does nothing; edit screen offers six fixed times

- **File:** `certxa-pro-replit/staff-app-latest/artifacts/certxa-pro/app/(tabs)/index.tsx` (reschedule dialog, `notifyClient`) and `app/appointment/[id].tsx:11` (`timeSlots`).
- **Symptom 1:** after dragging an appointment, the dialog has a "Notify client" switch. Its value is never sent to the server, so the client gets no message whichever way it is set.
- **Symptom 2:** the appointment edit screen can only move a booking to one of six hard-coded times (9:00, 10:30, 12:00, 2:00, 3:30, 5:00), not to the times the business is actually open and free.
- **Context:** found while fixing the day view and overlap check. The server has no "reschedule and notify" option on `PATCH /api/appointments/:id` today, so symptom 1 needs a decision on what the client should be sent (SMS, e-mail, both).
- **Why not fixed now:** both are product decisions rather than defects in what was asked for.

## 2026-10-12 — Marketing site move: what is still open (updated 2026-10-21)

1. **Hardware shop is built but closed.** Cart, UPS Ground quote, Stripe checkout (card + Affirm, no tax), order table and the admin Fulfillment queue exist (`artifacts/api-server/src/lib/shop.ts`). It stays closed until the server has UPS credentials (`UPS_CLIENT_ID`, `UPS_CLIENT_SECRET`, `UPS_SHIPPER_NUMBER`), a ship-from address (`SHOP_SHIP_FROM_*`) and a boxed weight for every product in `shared/shopCatalog.ts`. The UPS call and a real payment have never been run; Affirm must be enabled in the Stripe dashboard; no email goes out on a new order. /products still shows "Buy now" while the shop is closed, and says the card reader is "free with every Professional plan" — owner to confirm both.
2. **Stock photographs** (Getty images) are not hosted here; `/airo-assets/images/<slot>` redirects to GoDaddy's CDN (since 2026-10-21 at 1280 px). They disappear if the Airo site is cancelled.
3. **Logo.** Header uses the owner's logo file ("cirtXa", at the owner's instruction); the dark footer still uses the text wordmark (`BrandWordmark.tsx`) because no light-on-dark logo exists. The home page's Autumn screenshot (`media/pages__autumn__new-screenshot`) still shows the older "sirtXa" logo.
4. **/data-transfer** (PHP, `php/data-transfer/default.php` ~line 512) shows "24h average transfer time · 0 data lost · 7+ platforms" and a GDPR claim. Keep only if true — owner to confirm.
5. **Launchit template catalogue is empty** (`launchsite_templates` has 0 rows). Since 2026-10-21 the empty page is `noindex` and out of the sitemap until templates are added. Owner: add templates or retire the page.
6. **nginx sends some security headers twice** (`/etc/nginx/conf.d/certxa.conf` lines 77–80 repeat what `artifacts/api-server/src/index.ts` sets; `X-XSS-Protection` goes out as both `0` and `1; mode=block`). Server change for the owner: delete those lines, `nginx -t && systemctl reload nginx`.

Fixed 2026-10-21: the PHP pages now show the chat launcher only 10am–9pm Eastern (`php/includes/footer.php`); /products card fees match /pricing and the code (Stripe's rate + $0.60 Certxa fee); all old-address redirects are 301; `llms-full.txt` regenerated (`scripts/gen-llms-full.py`, run after changing marketing pages).

---

## 2026-10-12 — Autumn on the Enterprise plan (updated 2026-10-21)

Call billing (`artifacts/api-server/src/lib/autumnCallBilling.ts`) includes 20 handled calls on Solo, 50 on `professional` (shown as Starter) and 100 on `elite` (shown as Professional), then $0.50 a call. The `enterprise` plan has no entry, so it includes **0** calls — fewer than Starter. The website says nothing about Enterprise's calls until the owner decides.

---

## 2026-10-09 — Log cleared

Every entry logged up to 2026-10-09 was worked through. Fixed entries were removed (their details are in git history). What is left below cannot be closed by a code fix alone: each needs a decision, an account only the owner can reach, or a test on real hardware.

Fixed in the final pass on 2026-10-09: a ticket left "started" more than two days ago no longer blocks Day Close (`findUnpaidTickets`, `routes.ts`); `POST /api/image-library/upload` and `/harvest` now need a signed-in account; app screens served by the final page fallback are `noindex` again (`index.ts` — the 2026-09-22 fix had been lost, which is how `/book/jims` became a Soft 404); the kiosk stops with "already checked in" when the client is already on a ticket (`alreadyOnTicket` from the lookup).

---

## Decided 2026-10-09 and done

Solo is free (migration 0234; billing activates it without a checkout; site and app copy updated). Salons set their own tip presets (POS Settings → Tip presets, `shared/tipPresets.ts`). Discounts on the calendar checkout need no approval, the same as /nail. Kiosk walk-ins are tickets at barbershops as well as nail salons. Reprint on the /nail checkout reprints the last receipt printed on that device.

## Still to build or decide

**1. Plan prices — fixed 2026-10-21.** Stripe now has prices for Starter $29, Professional $99, Enterprise $179 (monthly + yearly) and `subscription_plans` points at them; the billing pages read the admin plans. Left: `billing_plans` (used by `/api/public/plan-prices`) still names the plans Professional/Elite.

**2. Buttons that still only say "COMING SOON"** (to be built, decided 2026-10-09): Sell Gift Card on /nail (`GiftCardSheet.tsx`, `CheckoutMode.tsx`), and Gift Card (Sell / Redeem / Check Balance), Membership and Reprint on the calendar checkout sheet (`Calendar.tsx`, `handlePosAction`). Selling a gift card is a sale: it needs to be paid for (cash and card), counted in Day Close, and kept out of commission, tips and turns. "Membership" has nothing behind it yet — what a membership is has to be defined first.

**3. Tip screen leftovers:** the preset notes ("Good service." …) are English only, and the tip page does not use the salon's theme or show the technician's name.

**4. Two services per visit (built 2026-10-13) — what is left.** A client can now choose two services (2½ hours at most) at the kiosk and in online booking. Left: the Mobile and Bloom booking themes still take one service; the second service at the kiosk cannot be one with size options; a kiosk walk-in at a business with no staff screen (hair salon, spa) still records only the first service; the kiosk two-service path was not run end to end (the test server's kiosk is switched off).

**5. Kiosk walk-ins at businesses without a staff screen** (hair salon, spa…) still go through the booking engine and can be refused. Nail salons and barbershops make tickets.

**6. Group Pay tip split by duration ignores extras added at checkout.**
`shared/nailCheckout.ts`: an `Extra` has no duration, so a technician who did extra work gets no larger share. Needs a rule for how long an extra counts for.

**7. Calendar (non-nail) Group Pay: a linked ticket's retail items earn no product commission.**
`Calendar.tsx` `ticketSubtotal`: a linked appointment has no field for retail lines, only the ticket being checked out does (`posExtraItems`). Fixing it means giving every linked ticket its own lines.

**8. Day Close.**
(a) An assigned, unpaid ticket that was never started does not block the close and stays on the next day's board. (A ticket marked DONE but not paid does block it, and since 2026-10-21 the sheet lists it as "Done, waiting for payment".) (b) A close cannot be undone, and the drawer is locked for 12 hours afterwards, even after a mistaken count. (c) The count is blind by design: the expected cash is not shown to the person closing. (d) Store 38 (Floyd's 99 Barbershop) has had one shift open since 2026-10-03; someone there has to run Day Close.

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
