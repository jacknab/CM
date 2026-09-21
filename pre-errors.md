# Pre-existing errors log

Bugs/type-errors Claude noticed while working on an unrelated task, in files it did not intend to change, and did not fix. Each entry is a candidate for its own small follow-up task — pick one when convenient.

Convention: newest entries at the top. Include date found, file:line, the exact error, and enough context for someone to pick it up cold.

---

---

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

---

## Resolved 2026-09-21

- **Kiosk demo images** — the three dead `<img>` records (screens 3, 4, 6) are removed from `php/checkin-kiosk/default.php`; the demo now runs welcome → stylist → a CSS-drawn "You're checked in" confirmation (checked live in a browser).
- **"Open now" badge** — removed from both marketplace cards and the dead `isOpen` fields deleted; marketplace client + SSR bundles rebuilt and live.
- **`bufferTime`** — now a real setting: Calendar Settings → "Time between appointments" (None / 5 / 10 / 15 min), stored in `calendar_settings.buffer_minutes` (migration 0195, applied). Enforced in the booking engine, staff create route, reschedule, online/AI/staff availability lists, precomputed slots, auto-assign and the nail walk-in flow; both onboarding flows now save it (the setup-hub flow's save call and online-booking step were also broken and are fixed).
- **Suspended accounts vs Packages/Deals** — the page gate already blocked them; the server now also refuses `/api/packages` and `/api/deals` for suspended/locked stores, and the public marketplace hides a suspended store's deals and refuses checkout.
- **Commission rule (decided 2026-09-21: services + add-ons at the service rate; products only at the product rate)** — one shared function, `shared/commissionBasis.ts`, now drives the accrual ledger, payroll runs (new and legacy), contractor payout runs, the Commission report, the Salon Earnings report and the staff-portal earnings card. The checkout freezes the service/product split on each ticket (`appointments.service_revenue` / `product_revenue`, migration 0196; retail lines are the "retail" kind). Fixes along the way: add-ons were being paid twice in payroll (service rate inside the total *and* the product rate again) and were the only thing the "product rate" ever applied to; retail money was never recorded, so a product rate could not be honoured; the ledger now refreshes a still-pending amount when a ticket is completed a second time (card-reader capture completes first, the checkout sheet's split arrives second). Old tickets keep the legacy amount (everything paid, pre-discount, minus tip, at the service rate) — nothing was backfilled. `/pos` sales send retail money too. Not changed: sales tax is not in the new basis (it was inside the legacy one).
