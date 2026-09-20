# Pre-existing errors log

Bugs/type-errors Claude noticed while working on an unrelated task, in files it did not intend to change, and did not fix. Each entry is a candidate for its own small follow-up task — pick one when convenient.

Convention: newest entries at the top. Include date found, file:line, the exact error, and enough context for someone to pick it up cold.

---

---

## 2026-09-20 — Stripe M2 / Terminal card-payment path: audit findings (items 1-9 FIXED the same day; see status below)

**STATUS (same day):** items 1-9 below were fixed — server (`routes/stripeConnect.ts` capture/create/location, `lib/terminalPaymentMath.ts`, Connect webhook `payment_intent.succeeded`), checkout sheet (`Calendar.tsx`), owner app (`lib/captureRecovery.ts`, `useTerminalPayment.ts`, `useReaderDiscovery.ts`, `M2PaymentOverlay.tsx`, `ReaderStatusModal.tsx`) — and also brought in line with Stripe's docs (re-use the same PaymentIntent after a decline/timeout, show reader prompts + update progress). **Still open:** (a) the Stripe dashboard's Connect webhook endpoint must be subscribed to `payment_intent.succeeded` for the reconciliation handler to fire; (b) refunds/disputes of POS payments are still not reflected on appointments; (c) the app bundles Terminal Android SDK 5.5.1 — `@stripe/stripe-terminal-react-native@0.0.1-beta.33` bundles 5.8.0, which fixes "mobile reader software updates timing out on slow networks" (relevant to a new M2's first connect), but upgrading needs a lockfile + SDK patch change and a device test; (d) a group-pay ticket paid by M2 is recorded on the primary appointment at capture and corrected to each ticket's share when staff complete it.

**Found while:** reviewing `apps/certxa-owner` + the Checkout sheet (`CheckoutPOSPanel`) + `routes/stripeConnect.ts` for M2 payment wiring. Server-side account handling is correct (connection token, location, PaymentIntent all use `stripeAccount: <store's connected acct>`; `card_present`, manual capture, $0.60 application fee). Problems, most serious first:
1. **Failed capture is reported as success.** `apps/certxa-owner/lib/useTerminalPayment.ts:80,185` `await captureOnServer(...)` never checks the response, and the WebView RPC bridge deliberately resolves non-2xx bodies (`app/index.tsx:296`). A capture 500 (`{error}`) → `run()` returns → `M2PaymentOverlay` calls `onComplete` → web marks the ticket paid while the card is only authorized (hold later expires; money never collected).
2. **M2/Tap payments lose tip + discount (+ loyalty redemption, group pay).** Native path only PATCHes `status, paymentMethod, totalPaid` (`Calendar.tsx` ~1516-1535 handler + server capture `stripeConnect.ts:1118`), unlike `handleFinalizePayment` (`Calendar.tsx:1616`) which also saves `tipAmount`, `discountAmount`. `payrollRuns.ts:196-199` then counts the tip inside service revenue (commission overstated) and shows tips = 0; turn-queue threshold also counts the tip.
3. **Split tender under-records:** capture sets `totalPaid = pi.amount/100` (card portion only), so cash + card tickets are completed with only the card amount.
4. **No reconciliation webhook** for POS PaymentIntents: `stripeConnectWebhook.ts:222-234` handles only account/capability/deauthorize/transfer.reversed; `stripeWebhook.ts` `handlePaymentIntentSucceeded` ignores `source: certxa_pos`. If capture succeeds but the response/DB write is lost, nothing marks the appointment paid; refunds/disputes are never reflected.
5. **Capture route hardening:** no "already captured → return success" handling (a retried capture 500s though money moved); `create-payment-intent` trusts client-supplied `appointmentId` (`stripeConnect.ts:891`) with no check it belongs to the store, and capture then completes that appointment by id without a store scope.
6. **SDK init is one-shot** (`app/_layout.tsx:42-105`): if `initialize()` fails (e.g. Stripe not yet connected, early 401, slow WebView beyond ~12s) nothing retries until app restart.
7. **Retry after an error creates a fresh PaymentIntent** (`M2PaymentOverlay.tsx:165`), so an earlier authorized-but-uncaptured PI (finding 1's case) would double-hold the card. The error screen also says "DECLINED" (`:189`) for every failure (Bluetooth off, reader not found, etc.).
8. **Reader-registration UI/endpoint don't fit M2:** `ReaderStatusModal.tsx:120-146,234` + `stripeConnect.ts:1235` use a `registration_code` (for internet readers); Bluetooth M2 readers are attached via `connectReader({locationId})`, which the app already does. Confirm against Stripe docs, then remove or relabel.
9. **Placeholder Terminal Location address** (`stripeConnect.ts:829` and `:1271`: "123 Main St / Unknown / CA / 00000") is created and cached forever if the store address is blank; it is never updated after the owner fixes the address.
**Why not fixed now:** the task was to audit; items 1-3 touch payments/payroll data and need a decision plus an on-device test with a real M2 reader.

---

## 2026-09-18 — `/checkin-kiosk`'s 3 "real screenshot" images are 404 in R2, no replacement exists

**File:** `php/checkin-kiosk/default.php:983-1035` (SCREEN 3, 4, 6 of the interactive kiosk-flow demo)
**Found while:** working through a real Semrush site audit's "broken internal images" finding.
**Issue:** Three `<img>` tags point at `https://certxa.com/api/r2/site-assets/{uuid}.webp` object keys that no longer exist in R2 (confirmed 404 directly). These are meant to be real product screenshots (category selection, service selection, check-in confirmation) — checked `site_assets` in the DB for a `kiosk-*` replacement; only one exists (`kiosk-screen.png`) and it isn't referenced anywhere on this page, so there's no already-uploaded substitute to swap in.
**What was done:** added `onerror="this.style.display='none';"` to all three `<img>` tags so real visitors see a clean gap instead of a broken-image icon. This does not fix the underlying gap.
**Why not fixed further:** the actual fix is new screenshots of the real kiosk product flow, re-uploaded to R2 and re-linked here — that needs someone to actually capture them, not a code change.

---

## 2026-09-16 — `bufferTime` (buffer between appointments) has no backing field anywhere

**Files:** `artifacts/booking/src/hooks/use-onboarding-session.ts` (the `buffer_time` onboarding-chat step collects `a.bufferTime` but it is no longer sent anywhere as of this session's fix — see below); `artifacts/booking/src/pages/setup/BookingCalendarFlow.tsx:69,44-46` — a separate, non-chat setup-hub flow that independently PATCHes `bufferTime` to `/api/calendar-settings` the same broken way, and reads it back the same way on load.
**Found while:** fixing the onboarding-chat "save calendar settings" step, which was POSTing to a path with no POST handler and sending field names (`slotInterval`, `bufferTime`, `allowOnlineBooking`, `maxAdvanceDays`) that don't match `/api/calendar-settings`'s real PUT schema (`timeSlotInterval`, `startOfWeek`, `nonWorkingHoursDisplay`, `allowBookingOutsideHours`, ...). Fixed in this session: `slotInterval`→`timeSlotInterval` via `PUT /api/calendar-settings`; `allowOnlineBooking`/`maxAdvanceDays` now correctly route to `PUT /api/booking-policies` as `onlineBookingMode`/`advanceBookingEnabled`/`advanceBookingMonths` (with boolean→enum and days→months conversion).
**Issue:** `bufferTime` ("buffer time between appointments") has no matching column anywhere — grepped `shared/schema.ts` and all of `api-server/src` for "buffer" (case-insensitive); the only hits are unrelated (SMS travel-time buffer, hardcoded appointment-conflict constants, Node `Buffer`, audio/image buffers). This setting was never implemented in the schema, in either onboarding flow. It's now silently dropped from the onboarding-chat payload (rather than sent to a path that ignores it) but the underlying gap — no way to actually save a buffer-between-appointments setting — still exists, and `BookingCalendarFlow.tsx` still sends/reads it the old broken way.
**Why not fixed now:** adding real backing for this (a new column + read/write wiring in two separate flows) is schema/feature work, not a wiring fix — needs a product decision on where it belongs (`calendarSettings` table vs. elsewhere) before implementing.

---

## 2026-09-15 — DB-cached plan price ($9.00) doesn't match the live Stripe Price ($14.95) it's tied to

**File:** `subscription_plans` table, row `code='solo'` (`price_monthly_cents: 900`) vs. its `stripe_price_id_monthly` (`price_1TtSVmRDJayCN7TTfV9etfV7`), which Stripe reports as a real unit amount of $14.95/mo.
**Found while:** verifying the new embedded subscribe flow against real Stripe data — creating a test invoice against that price ID to check `latest_invoice.payment_intent` behavior surfaced `amount_due: 1495` for a plan the UI displays everywhere (`DashboardBilling.tsx`'s hardcoded `PLANS` array, `SubscriptionPage.tsx`'s DB-driven card) as $9/mo.
**Why not fixed now:** Unrelated to the checkout-embedding task; fixing it requires knowing which number is authoritative (was the Stripe Price changed after the DB was seeded, or is the DB stale?) — a business decision, not a code fix. Whoever picks this up should reconcile `subscription_plans.price_monthly_cents` with the actual Stripe Price unit amount for every plan with a `stripe_price_id_monthly`, not just `solo`.

**Update 2026-09-20 (checked against live Stripe, read-only) — it is wider than `solo`, and the billing UI disagrees with both:**

| plan | `subscription_plans` monthly / yearly | live Stripe Price monthly / yearly | `DashboardBilling.tsx` `PLANS` shows |
|---|---|---|---|
| solo | $9.00 / $90.00 | **$14.95 / $168.00** | $9 |
| professional | $45.95 / $468.00 | $45.95 / $468.00 (matches DB) | **$22** |
| elite | $79.00 / $875.00 | $79.00 / $875.00 (matches DB) | **$49** |

So Stripe would charge $14.95 for a plan the DB and billing UI advertise at $9, and $45.95 / $79 for plans the billing UI advertises at $22 / $49. There is currently exactly one store subscription row (trialing), so nobody has been charged a wrong amount yet. **Needs a decision:** which numbers are the real prices. Then either fix the Stripe Price (create a new one — Prices are immutable) or the DB + the hardcoded `PLANS` array (better: make `DashboardBilling` read the DB like `SubscriptionPage` does so there is one source).

---

## 2026-09-15 — Two divergent, independent commission calculations that can silently disagree

**Files:** `artifacts/api-server/src/lib/commissionAccrual.ts:33-73` (fires from `storage.ts`'s `updateAppointment` on every completion) vs. `artifacts/api-server/src/routes/contractorPayouts.ts:168-169`, `artifacts/api-server/src/routes/payrollRuns.ts:193`, `artifacts/booking/src/pages/CommissionReport.tsx:22-28`, `artifacts/booking/src/pages/SalonEarningsReport.tsx:300-317`
**Found while:** confirming that a voucher-covered ticket still earns the technician full commission (it does — see below), which required understanding how commission is actually computed.
**Issue:** There are two separate, independently-computed commission bases that never reconcile:
1. `recordCommissionAccrual` writes a row to `contractor_commissions`/`staff_commission_accruals` using the appointment's frozen `servicePrice` (the catalog price, snapshotted once via `commissionSnapshot.ts`) × `commissionRate` — completely unaffected by any checkout-time discount or tender.
2. Every place that actually *shows or pays* commission — real contractor payout runs, draft payroll lines, and both commission-facing report pages — ignores that accrual table entirely and recomputes independently from `(appointment.totalPaid − tipAmount) × commissionRate`.

Because #2 is driven by `totalPaid` (the sum of checkout tenders), a manual POS discount already silently reduces what these real paths show as commissionable — while accrual path #1 would still show the full catalog-price commission for the same appointment. The two numbers can diverge for any discounted ticket, not just voucher ones.
**Not fixed because:** unifying these (deciding which is authoritative, and whether the accrual table is meant to be replaced by or reconciled with the recompute-from-`totalPaid` paths) is an architectural call, not a drive-by fix — and it predates this session's voucher work entirely. Flagged here because it's directly relevant to a payroll-accuracy question raised this session; worth resolving deliberately rather than picking a winner unprompted.

---

## 2026-09-15 — `AccountStatusGate.tsx` — Packages/Deals missing from the suspended-account allowlist

**File:** `artifacts/booking/src/components/AccountStatusGate.tsx:36-46` — `SUSPENDED_ALLOWED_PATHS`
**Found while:** adding the new `/catalog/deals` page (Groupon-style deals feature) and checking how it should behave under a suspended account, alongside the pre-existing `/catalog/packages`.
**Issue:** When `accountStatus === "suspended"`, only `/catalog/categories`, `/catalog/services`, `/catalog/addons`, `/catalog/products` (plus clients/reports/account/billing) stay reachable — everything else, including `/catalog/packages`, shows the `SuspendedAccessScreen` instead. This gap already existed for Packages before this session; `/catalog/deals` was added to match the same (arguably incomplete) allowlist rather than unilaterally deciding it should be exempt.
**Not fixed because:** whether a suspended (non-paying) store should still be able to view/edit Packages and Deals is a product policy call, not something to infer — could go either way (maybe intentionally locked down since packages/deals are marketing surface, not core service delivery like the always-allowed categories/services/addons/products). Flagging for whoever owns that policy to decide, then add both paths to `SUSPENDED_ALLOWED_PATHS` if they should be included.

---

## 2026-09-15 — `SalonCard`'s "Open now" badge is never actually true

**File:** `artifacts/marketplace/src/App.tsx` — `SalonCard` component, `{salon.isOpen ? 'Open now' : 'By appointment'}`
**Found while:** adding a "Nearby salons" section to the salon profile page and checking whether `Salon.isOpen` (used by `SalonCard`'s status badge) is ever actually populated from real hours data before reusing the component.
**Issue:** `isOpen?: boolean` is declared on the `Salon` type (both `lib/api.ts` and `salonApi.ts`) but no API response ever sets it — `toApiSalon()` never includes an `isOpen` field. So every `SalonCard` renders "By appointment" unconditionally, regardless of the salon's real hours or the current time. Not a false claim (it's a static fallback, not a fabricated "Open now"), but it's dead/misleading UI — the badge implies live status that doesn't exist.
**Why not fixed now:** `SalonCard` wasn't part of the nearby-salons change (swapped to `FeaturedMarketplaceCard` instead, which has no such badge). Fixing it properly means computing real open/closed state from `salon.hours` + current time server-side or client-side, which is a small but distinct feature, not a one-line fix.

**Update 2026-09-20:** re-checked — marketplace list rows (`SalonRecord`, ~47k scraped salons) carry no hours at all; hours only exist per salon in `salon_google_hours` (detail page). A real "Open now" on cards would need hours joined into the list payload. Cheapest honest options: (a) drop the `isOpen` badge and its ternaries (`App.tsx:244` and `:518`) and the two `isOpen?: boolean` type fields, or (b) add hours to the list query. Not done: it needs a marketplace rebuild/deploy and a product call on (a) vs (b).

---

## Resolved 2026-09-20 (kept as a one-line record; details are in git history)

- **api-server `typecheck` OOM** — script now runs tsc with a 6 GB heap (`package.json`); it completes in ~1 min and reports **0 errors**.
- **`timezone.test.ts`** (65 errors, two entries) — imports `describe/test/expect` from `vitest`; 24 tests pass.
- **api-server unit tests** — `vitest.config.ts` now sets a dummy `DATABASE_URL`, so `emailTicketSync.test.ts` (which imports `db.ts`) loads instead of failing the suite; all 5 files / 99 tests pass with or without the real env var, and unit tests can never reach a real database.
- **`storage.ts` `sql.identifier([table])`** and **`dead-seats.ts` `totalDeadSlotCount`** — already fixed in the tree by an earlier change (typecheck confirms).
- **React error #185 pattern** — all 92 `data: x = []` sites (57 files) now use a shared frozen `EMPTY_ARRAY` (`booking/src/lib/empty.ts`); none of them mutated the default in place.
- **`static.ts` stale `/robots.txt`** — hardcoded fallback removed; the real `dist/public/robots.txt` is served by `express.static`.
- **`POST /api/intelligence/growth-assistant`** — implemented (`routes/intelligence.ts`): answers only from the store's own numbers (revenue vs last month, clients, seat utilisation, growth score, 90-day leakage), returns `{reply, highlights, actions}` with actions restricted to a fixed list of real routes.
- **Plan-switch trial** — `computeTrialPeriodDays` returns no trial when the store already has an active/past-due/unpaid *paid* subscription. (The billing page already routes active customers through `/api/billing/change-plan`, so this closes the direct-API gap.) Unchanged on purpose: a first-ever checkout still gets the full default trial.
- **`PayoutAccountSettings.tsx`** — confirmed the owner-level Express/OAuth flow is the intended design (only *contractors* moved to Custom accounts; see the stripe-connect-payouts skill).
- **WebSocket `ERR_NAME_NOT_RESOLVED`** — not a code bug: nginx proxies `/ws` and a fresh HTTP/1.1 upgrade to `/ws/notifications` returns 101 today; it was the tester's environment.
- **Owner-app WebView reload after login** — `StripeTerminalProvider` is now always mounted (only `TerminalInitializer` waits for login), so the screen tree/WebView is no longer remounted. **Needs an on-device check** (M2 connect + payment still work, no second `/app-login` load) — shipped in the next APK.
