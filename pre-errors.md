# Pre-existing errors log

Bugs/type-errors Claude noticed while working on an unrelated task, in files it did not intend to change, and did not fix. Each entry is a candidate for its own small follow-up task — pick one when convenient.

Convention: newest entries at the top. Include date found, file:line, the exact error, and enough context for someone to pick it up cold.

---

## 2026-09-20 — `pnpm run typecheck` in `artifacts/api-server` runs out of memory and reports nothing

**Found while:** typechecking the new nail-salon server code. `artifacts/api-server/package.json:13` (`"typecheck": "tsc -p tsconfig.json --noEmit"`) dies with a V8 "heap out of memory" (~2 GB default) on this box, so a plain `npx tsc --noEmit -p .` prints no `error TS` lines and looks clean even though it never finished. With `NODE_OPTIONS=--max-old-space-size=6144` it completes and reports the **65 existing errors** (test config, `intelligence/dead-seats.ts`, storage), none in recently changed files.
**Why it matters:** anyone (or CI) relying on the script's silence gets a false "0 errors". **Suggested fix:** set `NODE_OPTIONS=--max-old-space-size=6144` in the script (or split the project with `references`/`skipLibCheck`), then triage the 65.
**Why not fixed now:** unrelated to the nail-screen task; the box is RAM-starved (see memory note on certxa-api host tuning), so the right heap size is a deliberate call.

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

## 2026-09-20 — Owner app WebView reloads itself right after login: `sessionReady` Provider swap remounts the whole screen tree

**Found while:** investigating "after login the calendar loads, then reloads again" in the owner APK.
**File:line:** `apps/certxa-owner/app/_layout.tsx:234-242` — `{sessionReady ? <StripeTerminalProvider>…{screenStack}</StripeTerminalProvider> : screenStack}`.
**Symptom / evidence:** nginx access log shows `GET /app-login` (page), calendar API calls, then ~6-7s later `POST /api/live-chat/visitor/leave` (page unload) and a second `GET /app-login` from the Android WebView UA, then `/calendar` loads a second time (seen at 05:49:14→05:49:20 and 05:58:18→05:58:25 on 2026-09-20).
**Root cause:** `notifySessionReady()` (fired by `index.tsx` once the WebView leaves `/app-login`) flips `sessionReady`, which changes the parent of `screenStack` (bare → inside `StripeTerminalProvider`). React treats that as a different tree, unmounts and remounts `Stack` → `PortalScreen` → `<WebView source={{uri: PORTAL_URL}}>`, so the WebView restarts at `/app-login` and the web app redirects to `/calendar` again. The file's own comment (lines 33-35) acknowledges "the Provider swap unmounts and remounts the portal screen, so its WebView reloads" and works around it with `initialize()` retries rather than removing the remount.
**Suggested fix (not applied):** always mount `StripeTerminalProvider` so `screenStack` keeps a stable position, and gate only `<TerminalInitializer />` on `sessionReady` (`{sessionReady && <TerminalInitializer />}`); then the `INIT_MAX_ATTEMPTS` retry workaround for the WebView-still-loading race can likely be dropped. Needs an on-device check that the provider doesn't call `tokenProvider` on mount before login, then a new EAS build to ship.
**Why not fixed now:** the task was to investigate; the fix touches the Stripe Terminal initialization path (payments) and needs a new APK build plus on-device testing.

---

## 2026-09-19 — `timezone.test.ts` doesn't compile: no test-runner types configured, breaks `tsc --noEmit` for the whole api-server package

**Found while:** running `pnpm tsc --noEmit` in `artifacts/api-server` to verify the salon-slug-redirect changes (`routes/salonApi.ts`, `lib/salonData.ts`).
**Symptom:** `src/__tests__/timezone.test.ts` uses Jest/Mocha globals (`describe`, `test`, `expect`) with no corresponding `@types/jest` or `@types/mocha` installed and no `types` entry in `tsconfig.json` — ~40 `TS2304`/`TS2593` "Cannot find name" errors, e.g. `timezone.test.ts(91,3): error TS2593: Cannot find name 'test'`. This means `tsc --noEmit` never actually passes clean for this package right now — every run reports this same unrelated noise, which will mask a real new type error in the same run.
**Why not fixed now:** wasn't touched or introduced by the current task (slug regeneration); fixing it means picking a test runner (the file's own header comment says `pnpm --filter @workspace/api-server test`, implying one is intended) and wiring its types into `tsconfig.json`, which is a small but separate decision from what was asked here.

---

## 2026-09-19 — Same infinite-render-loop pattern (React error #185) likely lurking elsewhere: `useQuery({ data: x = [] })` used as an unguarded effect/memo dependency

**Found while:** fixing a live crash on `/team/:id` (`StaffDetail.tsx`) — see the fix below. Root cause there: `const { data: savedRules = [] } = useQuery(...)` creates a **new** `[]` reference on every render while the query is still loading (inline destructuring defaults are re-evaluated each render), and an unguarded `useEffect(() => setRules(savedRules.map(...)), [savedRules])` fired on every one of those renders, calling `setState` in a tight loop until React's "Maximum update depth exceeded" safeguard tripped.
**Scope of the risk:** `grep -rn "data: [a-zA-Z]* = \[\]"` across `artifacts/booking/src` turns up **92 occurrences** of this same destructuring-default pattern. Only a subset are actually dangerous — the bug requires the specific combination of (a) the defaulted value feeding an unguarded `useEffect`/`useMemo` that (b) calls a state setter unconditionally. Most of the 92 are probably just read directly in JSX (harmless). Did not audit all 92 to find every dangerous instance — that's a real, separate follow-up.
**Update 2026-09-20:** the same pattern caused a second real bug — `pages/team/TeamCommissions.tsx` (`data: staff = []` → `useMemo` → `useEffect(setDraft)`) looped forever whenever the store wasn't selected/loaded, starving the router so Team → Commissions → Payroll clicks changed the URL but not the page. Fixed there and in `StaffList.tsx` with a module-level `EMPTY_STAFF`. The other ~90 call sites are still unaudited.
**Why not fixed further now:** auditing 92 call sites across files unrelated to the reported crash is a much larger task than the one bug report; fixed only the confirmed, reported instance (`StaffDetail.tsx`, using stable module-level `EMPTY_*` constants instead of inline `[]` fallbacks). Whoever picks this up: grep for the pattern, then check each hit for an effect/memo keyed on that value with no reference-stability guard.

---

## 2026-09-19 — `tsc --noEmit` for `api-server` OOMs on this box without a raised Node heap; two real type errors + a test-config gap found once it could complete

**Found while:** the user asked me to look into "an error" in `supportAgent.ts` after opening it in the IDE. A plain `pnpm --filter @workspace/api-server exec tsc --noEmit` reliably crashes with `FATAL ERROR: ... JavaScript heap out of memory` on this host (only ~1.8GB free RAM at the time — see [[certxa-api-db-and-host-tuning]]) before finishing, so it silently never reports real errors. Re-ran with `NODE_OPTIONS="--max-old-space-size=3500" node_modules/.bin/tsc --noEmit` (bypassing pnpm's wrapper) and it completed. `supportAgent.ts` itself has zero errors — whatever the user is seeing there isn't a `tsc` error. The full run did surface three real, unrelated pre-existing issues:

1. **`src/intelligence/dead-seats.ts:168`** — `computeDeadSeats()` returns a `totalDeadSlotCount` field that isn't declared on the `DeadSeatReport` interface (`intelligence/dead-seats.ts:20-26`). Runtime is unaffected (the field is genuinely returned), but any typed consumer can't see it exists. Fix is a one-line addition to the interface.
2. **`src/storage.ts:627` and `:636`** — `sql.identifier([table])` passes a `string[]` where the installed `drizzle-orm` version's types want a plain `string`. Both call sites are already wrapped in `try/catch` that silently swallows failures, so this may or may not be a real runtime issue — worth checking whether `sql.identifier` actually accepts an array at runtime in this drizzle-orm version despite the type signature, or whether these deletes have been silently no-op'ing.
3. **`src/__tests__/timezone.test.ts`** — the whole file errors (`Cannot find name 'describe'/'test'/'expect'`) because no test-runner types (`@types/jest` or `@types/mocha`) are installed/configured in `tsconfig`. Not a logic bug, but it means this test file has never actually typechecked or (likely) run.

**Why not fixed now:** all three are in files unrelated to the task at hand, and the eventual real fix for the OOM (bumping the heap flag permanently in the `typecheck` script, or reducing project size/references) is an infra decision, not a drive-by patch.

---

## 2026-09-19 — `PayoutAccountSettings.tsx` was found reduced to a single stray character `o`, restored from HEAD but flow may be stale

**File:** `artifacts/booking/src/pages/settings/PayoutAccountSettings.tsx`
**Found while:** rebuilding `booking` to ship an unrelated Sidebar.tsx nav fix — the whole-file corruption broke `tsc --noEmit` (`File is not a module` / `Cannot find name 'o'`) and would have broken the production build too.
**Issue:** the entire 415-line file's uncommitted working-tree content was just the single character `o` — clearly accidental (a bad save, not real in-progress work). Restored verbatim from the last commit (`git show HEAD:...` → `Write`) since the broken state had zero salvageable content and was blocking the build.
**Why flagged, not fully resolved:** the restored file uses an OAuth-based "Connect Stripe Account" flow (`POST /api/payments/stripe/connect` → redirect) for the salon owner's own payout account. Per [[contractor-custom-accounts]] memory, *contractor* payouts were separately migrated from Express to recipient-configured Custom accounts this session — it's unconfirmed whether the owner-level flow this file drives was meant to move to the same Custom-account pattern, or is intentionally still OAuth/Express since it's a different account type. Whoever picks this up should check `lib/stripeContractorAccounts.ts` and the Custom-accounts migration notes before assuming this restored version is the currently-intended flow.

---

## 2026-09-19 — `static.ts`'s hardcoded `/robots.txt` fallback route is stale and duplicates the real file

**File:** `artifacts/api-server/src/static.ts:210-230` (the `app.get("/robots.txt", ...)` handler, registered after `app.use(express.static(distPath, ...))`)
**Found while:** tracing exactly how `/assets/*` static requests get served, as part of fixing a Semrush "unminified JS/CSS" warning.
**Issue:** This inline handler builds a hardcoded robots.txt string from scratch — no `Content-Signal:` line, no `Allow: /api/r2/` carve-out, missing several AI-crawler user-agent blocks — that's already out of sync with the real, maintained `artifacts/booking/public/robots.txt` (built into `dist/public/robots.txt`). It's currently harmless: Express's static middleware matches the real file first and this route handler is never reached. But it's a live footgun — if `dist/public/robots.txt` is ever missing (a bad build, a wiped `dist/public`), this stale fallback would silently activate with the old, more restrictive rules (including a bare `Disallow: /api/` with no `/api/r2/` exception, re-introducing the salon-photo-blocking bug fixed earlier this session).
**Why not fixed now:** out of scope for the task at hand (fixing Semrush warnings) and touches server bootstrap code I wasn't asked to change. Fix is straightforward whenever picked up: either delete the dead handler, or have it read from the same source robots.txt file instead of a second hardcoded copy.

---

## 2026-09-18 — `/checkin-kiosk`'s 3 "real screenshot" images are 404 in R2, no replacement exists

**File:** `php/checkin-kiosk/default.php:983-1035` (SCREEN 3, 4, 6 of the interactive kiosk-flow demo)
**Found while:** working through a real Semrush site audit's "broken internal images" finding.
**Issue:** Three `<img>` tags point at `https://certxa.com/api/r2/site-assets/{uuid}.webp` object keys that no longer exist in R2 (confirmed 404 directly). These are meant to be real product screenshots (category selection, service selection, check-in confirmation) — checked `site_assets` in the DB for a `kiosk-*` replacement; only one exists (`kiosk-screen.png`) and it isn't referenced anywhere on this page, so there's no already-uploaded substitute to swap in.
**What was done:** added `onerror="this.style.display='none';"` to all three `<img>` tags so real visitors see a clean gap instead of a broken-image icon. This does not fix the underlying gap.
**Why not fixed further:** the actual fix is new screenshots of the real kiosk product flow, re-uploaded to R2 and re-linked here — that needs someone to actually capture them, not a code change. (and by a second, separate setup flow) has no backing field anywhere

**Files:** `artifacts/booking/src/hooks/use-onboarding-session.ts` (the `buffer_time` onboarding-chat step collects `a.bufferTime` but it is no longer sent anywhere as of this session's fix — see below); `artifacts/booking/src/pages/setup/BookingCalendarFlow.tsx:69,44-46` — a separate, non-chat setup-hub flow that independently PATCHes `bufferTime` to `/api/calendar-settings` the same broken way, and reads it back the same way on load.
**Found while:** fixing the onboarding-chat "save calendar settings" step, which was POSTing to a path with no POST handler and sending field names (`slotInterval`, `bufferTime`, `allowOnlineBooking`, `maxAdvanceDays`) that don't match `/api/calendar-settings`'s real PUT schema (`timeSlotInterval`, `startOfWeek`, `nonWorkingHoursDisplay`, `allowBookingOutsideHours`, ...). Fixed in this session: `slotInterval`→`timeSlotInterval` via `PUT /api/calendar-settings`; `allowOnlineBooking`/`maxAdvanceDays` now correctly route to `PUT /api/booking-policies` as `onlineBookingMode`/`advanceBookingEnabled`/`advanceBookingMonths` (with boolean→enum and days→months conversion).
**Issue:** `bufferTime` ("buffer time between appointments") has no matching column anywhere — grepped `shared/schema.ts` and all of `api-server/src` for "buffer" (case-insensitive); the only hits are unrelated (SMS travel-time buffer, hardcoded appointment-conflict constants, Node `Buffer`, audio/image buffers). This setting was never implemented in the schema, in either onboarding flow. It's now silently dropped from the onboarding-chat payload (rather than sent to a path that ignores it) but the underlying gap — no way to actually save a buffer-between-appointments setting — still exists, and `BookingCalendarFlow.tsx` still sends/reads it the old broken way.
**Why not fixed now:** adding real backing for this (a new column + read/write wiring in two separate flows) is schema/feature work, not a wiring fix — needs a product decision on where it belongs (`calendarSettings` table vs. elsewhere) before implementing.

---

## 2026-09-16 — `POST /api/intelligence/growth-assistant` called by the dashboard but never implemented on the backend

**File:** `artifacts/booking/src/pages/manage/MembersHome.tsx:153` — POSTs to `/api/intelligence/growth-assistant`, `credentials: "include"`.
**Found while:** chasing down console 404s surfaced during a live fresh-signup test of the onboarding flow (this one fires post-onboarding, once the tester reaches the dashboard, not during onboarding itself).
**Issue:** `api-server/src/routes/intelligence.ts` implements `growth-score`, `dashboard`, `revenue-leakage`, `dead-seats`, `no-show-risks`, `rebooking-rates`, `winback`, etc. — but no `growth-assistant` route exists anywhere in that router or in `routes.ts`. Always 404s.
**Why not fixed now:** this isn't a wiring bug like the others found this session — the endpoint was simply never built. Implementing it means deciding what a "growth assistant" response actually returns (likely some AI-driven synthesis of the existing intelligence endpoints), which is new feature work, not a fix.

---

## 2026-09-16 — WebSocket `wss://certxa.com/ws/notifications?storeId=15` failed with `ERR_NAME_NOT_RESOLVED` during a live test session

**Found while:** same fresh-signup console-error sweep as the two entries above.
**Investigated, not a code bug:** all 13 frontend call sites (`use-notifications.ts:86`, `enterprise-sync-engine.ts:48`, `AccountStatusGate.tsx:177`, `Calendar.tsx`, etc.) build the WS URL from `window.location.host` — never a hardcoded host or env var — and the backend upgrade handler exists at `notifications.ts:67`. A DNS-resolution failure for a same-origin request, on a page that just loaded fine over HTTPS from that same host, isn't explainable from the app code. Most likely infra (nginx not proxying the `/ws/` Upgrade for that host, or a mismatched test-environment origin) — flagging for whoever owns the reverse-proxy config, not a queued code fix.

---

## 2026-09-15 — Plan switch grants a fresh free trial to already-paying customers

**File:** `artifacts/api-server/src/routes/subscription.ts` — `computeTrialPeriodDays()` (was inlined in `POST /subscribe`, extracted verbatim into this helper while embedding Stripe's Payment Element for subscription checkout)
**Found while:** rewriting the paid-plan branch of `/subscribe` to use an embedded SetupIntent instead of a Stripe Checkout Session redirect. The trial-days logic itself was pre-existing and untouched in effect.
**Issue:** The function only checks whether the store has a *currently trialing* subscription (`inArray(status, ["trialing"])`). If none is found, it falls into the "first-ever checkout" branch and grants a brand-new default trial (`TrialService.getFreeTrialDays()`, e.g. 30 days) to any logged-in user — including a store that already has an **active, paying** subscription and is simply switching to a different paid plan. There is no check for an existing `active` subscription before granting the trial. In practice this means every plan switch by an already-paying customer would size a new SetupIntent/Subscription with a fresh trial period instead of charging immediately, effectively giving free months on every plan change.
**Why not fixed now:** Out of scope for the embedding task (UI/transport change only); this is a business-logic correctness bug that predates this session and deserves its own deliberate fix + verification (e.g. also checking for `status = "active"` before the fallback branch, and confirming `DashboardBilling.tsx`'s separate `changePlanMutation`/`/api/billing/change-plan` path — used for the same "switch plans while active" case in the live UI — doesn't already avoid this by not calling `/subscribe` at all, which would make the impact narrower than it looks here).

## 2026-09-15 — DB-cached plan price ($9.00) doesn't match the live Stripe Price ($14.95) it's tied to

**File:** `subscription_plans` table, row `code='solo'` (`price_monthly_cents: 900`) vs. its `stripe_price_id_monthly` (`price_1TtSVmRDJayCN7TTfV9etfV7`), which Stripe reports as a real unit amount of $14.95/mo.
**Found while:** verifying the new embedded subscribe flow against real Stripe data — creating a test invoice against that price ID to check `latest_invoice.payment_intent` behavior surfaced `amount_due: 1495` for a plan the UI displays everywhere (`DashboardBilling.tsx`'s hardcoded `PLANS` array, `SubscriptionPage.tsx`'s DB-driven card) as $9/mo.
**Why not fixed now:** Unrelated to the checkout-embedding task; fixing it requires knowing which number is authoritative (was the Stripe Price changed after the DB was seeded, or is the DB stale?) — a business decision, not a code fix. Whoever picks this up should reconcile `subscription_plans.price_monthly_cents` with the actual Stripe Price unit amount for every plan with a `stripe_price_id_monthly`, not just `solo`.

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

---

## 2026-09-14 — `timezone.test.ts` — missing test-runner type definitions

**Files:** `artifacts/api-server/src/__tests__/timezone.test.ts` (throughout — `describe`, `test`, `expect` all unresolved)
**Found while:** running `tsc --noEmit` across the whole api-server package to verify the salon-directory rewrite (`routes/salonDirectory.ts`) introduced no type errors — this file is unrelated.
**Error (`tsc --noEmit`):**
```
src/__tests__/timezone.test.ts(27,1): error TS2593: Cannot find name 'describe'. Do you need to install type definitions for a test runner? ...
src/__tests__/timezone.test.ts(33,5): error TS2304: Cannot find name 'expect'.
(repeats throughout the file for describe/test/expect)
```
**Context:** The project uses vitest (`"test": "vitest run"` in package.json), but `tsconfig.json`'s `types` field doesn't include vitest's globals (or the file isn't picking up `vitest/globals`), so a plain `tsc --noEmit` run treats `describe`/`test`/`expect` as undefined identifiers. `vitest run` itself likely still passes since vitest provides its own type-aware runtime, but any CI step that runs bare `tsc --noEmit` over the whole project would fail on this file.
**Not fixed because:** unrelated to the salon-directory task in progress; the fix (adding `"types": ["vitest/globals"]` to tsconfig, or importing from `"vitest"` explicitly in the test file) touches shared tsconfig/test infra that deserves its own verification pass rather than a drive-by edit.

---

## 2026-09-12 — `storage.ts` — `sql.identifier()` called with an array instead of a string

**Files:** `artifacts/api-server/src/storage.ts:578`, `:587`
**Found while:** implementing the client visit-notes / AI profile note feature (unrelated file).
**Error (`tsc --noEmit`):**
```
src/storage.ts(578,61): error TS2345: Argument of type 'string[]' is not assignable to parameter of type 'string'.
src/storage.ts(587,56): error TS2345: Argument of type 'string[]' is not assignable to parameter of type 'string'.
```
**Context:** Inside a staff-deletion transaction, two loops build a dynamic table name and call `sql.identifier([table])`:
```ts
await tx.execute(sql`DELETE FROM ${sql.identifier([table])} WHERE staff_id = ${id}`);
...
await tx.execute(sql`UPDATE ${sql.identifier([table])} SET staff_id = NULL WHERE staff_id = ${id}`);
```
The installed drizzle-orm version's `sql.identifier()` type signature wants a single `string`, not `string[]`. Likely fix is `sql.identifier(table)` (drop the array wrapper) — but verify against the actual installed drizzle-orm version's signature before changing, since array form is valid in some versions (for multi-part/schema-qualified identifiers).
**Not fixed because:** unrelated to the task in progress, and touches a staff-deletion code path that deserves its own careful look rather than a drive-by edit.

---

## 2026-09-12 — `dead-seats.ts` — `totalDeadSlotCount` missing from `DeadSeatReport` type

**File:** `artifacts/api-server/src/intelligence/dead-seats.ts:168`
**Found while:** same session as above (unrelated file).
**Error (`tsc --noEmit`):**
```
src/intelligence/dead-seats.ts(168,5): error TS2353: Object literal may only specify known properties, and 'totalDeadSlotCount' does not exist in type 'DeadSeatReport'.
```
**Context:** The function's return object sets a `totalDeadSlotCount` field (with a comment explaining it's the full count before the `deadSlots` array is truncated to the top 20), but the `DeadSeatReport` type/interface this function returns doesn't declare that field yet. Likely fix: add `totalDeadSlotCount: number;` to the `DeadSeatReport` type definition.
**Not fixed because:** unrelated to the task in progress; this file already had other uncommitted changes in progress when this session started, so a drive-by fix risked colliding with that work.
