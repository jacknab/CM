---
name: Stripe Billing & Wallet Funding System
description: Architecture, key decisions, and activation steps for the Stripe billing integration
---

## Architecture

- **Billing unit = Store (location)**, not user. `stripe_customer_id` lives on `locations` table.
- **Lazy Stripe singleton** in `lib/stripe.ts` — uses a Proxy that only calls `getStripe()` at property access time. This is critical: Stripe SDK throws `"Neither apiKey nor config.authenticator provided"` at constructor time if `STRIPE_SECRET_KEY` is empty string. Never use `new Stripe("")`.
- All billing routes behind `isAuthenticated` at `/api/billing/*`.
- Stripe webhook at `POST /api/stripe/webhook` — registered in `index.ts` with `express.raw({ type: 'application/json' })` BEFORE the main JSON middleware.

## Key Files

- `artifacts/api-server/src/lib/stripe.ts` — lazy singleton + `isStripeConfigured()` + `getReturnBaseUrl()`
- `artifacts/api-server/src/routes/billing.ts` — all billing endpoints
- `artifacts/api-server/src/routes/stripeWebhook.ts` — idempotent webhook handler
- `artifacts/booking/src/pages/manage/BillingPage.tsx` — full billing UI including wallet section
- `artifacts/booking/src/pages/Admin/BillingDashboard.tsx` — admin MRR stats dashboard

## DB Tables (migration 0035)

- `wallet_transactions` — immutable funding ledger; balance = SUM(completed deposits)
- `webhook_events` — idempotency guard (unique on event_id)
- `store_invoices` — Stripe invoice mirror

## Activation Checklist

Set these in Replit secrets:
1. `STRIPE_SECRET_KEY` — from Stripe dashboard → Developers → API keys
2. `STRIPE_PUBLISHABLE_KEY` — from Stripe dashboard
3. `STRIPE_WEBHOOK_SECRET` — from Stripe dashboard → Webhooks (point to `POST /api/stripe/webhook`)

Then set Stripe price IDs on subscription plans (admin panel or DB):
- `subscription_plans.strip_price_id_monthly` 
- `subscription_plans.strip_price_id_yearly`

## Wallet

- Preset deposit amounts: $10, $25, $50, $100, $250
- Stripe Checkout one-time payment
- Balance derived from SUM of completed wallet_transactions
- Pending → completed on `checkout.session.completed` or `payment_intent.succeeded` webhook

**Why:** Store-scoped billing was chosen because locations are the billing/subscription unit; a single user account may own multiple stores, each with independent subscriptions.
