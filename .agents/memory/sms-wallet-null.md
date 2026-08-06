---
name: SMS wallet NULL bug — platform_credits
description: platform_credits column starts NULL; writes without COALESCE silently leave it NULL, blocking SMS even when wallet has funds.
---

# platform_credits NULL bug

**The rule:** Every SQL write to `platform_credits` must use `COALESCE(platform_credits, 0)` as the base — never bare `platform_credits + x` or `platform_credits - x`.

**Why:** PostgreSQL evaluates `NULL + 5.00 = NULL`. When a store's `platform_credits` column is NULL (the default for new rows) and a top-up runs `SET platform_credits = platform_credits + $1`, the column stays NULL. The SMS gate in `resolveSmsAccess` then reads NULL as 0 and blocks sending even though the wallet UI (which reads from `walletTransactions`) shows a positive balance.

**How to apply:**
- `stripeWebhook.ts` — wallet deposit webhook: `COALESCE(platform_credits, 0) + $1` ✓ (fixed)
- `lib/autoRefill.ts` — auto-refill charge: `COALESCE(platform_credits, 0) + amount` ✓ (fixed)
- `lib/costMeter.ts` — AI call deduction: `COALESCE(platform_credits, 0) - charge` ✓ (fixed)
- `routes/aiReceptionist.ts` — phone purchase deduction: `COALESCE(platform_credits, 0) - 5.00` ✓ (fixed)
- `lib/featureAccess.ts` `deductSmsWalletCharge`: already correct ✓
- `routes.ts` manual admin credit: already correct ✓

**Startup repair:** `index.ts` runs a one-time UPDATE on startup that syncs `platform_credits` from `platform_credit_transactions` ledger sum for any store where the column is still NULL. Requires `platform_credit_transactions` table (migration 0030_credit_transactions.sql).
