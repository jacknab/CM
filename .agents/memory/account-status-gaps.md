---
name: Account status enforcement gaps
description: Suspension/cancellation enforcement — all known gaps fixed June 2026.
---

## What IS enforced

- `AccountStatusGate.tsx` (`artifacts/booking/src/components/AccountStatusGate.tsx`) wraps all authenticated owner routes, polls `/api/billing/account-status` every 5 min, and shows `AccountSuspended` or `AccountLocked` full-screen blocks.
- Data is never deleted on suspension/cancellation — status flag only (tax/legal retention rule).

## All 4 gaps fixed (June 2026)

1. **Case sensitivity** — `billing.ts` GET /api/billing/account-status now normalises accountStatus via `.toLowerCase()` before returning. DB stores "Suspended" (capitalized); gate compared lowercase. Fixed.

2. **Public booking endpoints** — `routes.ts`: GET /api/public/store/:slug, POST /api/public/store/:slug/book, GET /api/public/queue/:slug, GET /api/public/kiosk/:slug/config all check `accountStatus` and return 403 for `suspended` / `canceled`.

3. **Websites offline** — `middleware/subdomain.ts`: booking subdomains serve an offline HTML page for suspended/canceled stores. `lib/template-serve.ts` (`handleTenantSiteByDomain`): queries `locations.account_status` via `website.storeid` (text column) and serves offline page before DNS/publish checks.

4. **Stripe cascade** — `routes/stripeWebhook.ts`: `handleSubscriptionDeleted` sets `locations.accountStatus = "Canceled"`; `handleSubscriptionUpsert` sets `locations.accountStatus = "Active"` when sub.status is "active" (reactivation path).

## Key schema notes
- `locations.account_status` column; Drizzle field `accountStatus`; DB stores title-case ("Active", "Suspended", "Canceled").
- `wb_websites.storeid` is text (not int) — cast `Number(website.storeid)` when joining to `locations.id`.
- AccountStatusGate compares lowercase — always normalize with `.toLowerCase()` when comparing.
