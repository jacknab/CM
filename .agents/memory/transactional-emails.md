---
name: Transactional email system
description: All platform-level transactional emails — where they live, what triggers them, and what env vars are required.
---

## Central module
`artifacts/api-server/src/lib/systemEmails.ts` — all platform email templates and send functions.
Uses `sendEmail()` from `mail.ts` which requires `MAILGUN_API_KEY` + `MAILGUN_DOMAIN` env vars.
`getStoreOwnerContact(storeId)` looks up owner email via `locations JOIN users` (used by all store-scoped emails).

## Email inventory

| Email | Trigger file | Trigger point |
| --- | --- | --- |
| Welcome | `auth.ts` | After registration + trial setup |
| Password reset | `auth.ts` | `/api/auth/forgot-password` (pre-existing, uses sendEmail directly) |
| Subscription renewal | `routes/billing-webhooks.ts` | `handleInvoicePaymentSucceeded`, only when `amount_paid > 0` |
| Payment failed | `routes/billing-webhooks.ts` | `handleInvoicePaymentFailed` → after `suspendAccount` |
| Account suspended | `services/billing-service.ts` | `suspendAccount()` — after DB update, fire-and-forget |
| Account locked | `services/billing-service.ts` | `lockAccount()` — after DB update |
| Account restored | `services/billing-service.ts` | `restoreAccount()` — after DB update |
| Trial expired | `services/trial-expiration.ts` | `runTrialExpirationCheck()` loop |
| Platform credits receipt | `routes/billing-webhooks.ts` | `handleCheckoutSessionCompleted`, purchase_type=credits_topup |
| SMS credits receipt | `routes/billing-webhooks.ts` | `handleCheckoutSessionCompleted`, purchase_type=sms_bucket |
| Low balance alert | `services/low-balance-scheduler.ts` | Daily at 9am; thresholds: platform < $5, SMS < 50 |
| Data transfer complete | `routes/dataTransfer.ts` | After self-service execute OR concierge approve |
| Data transfer rejected | `routes/dataTransfer.ts` | After support reject |

## Pre-existing (not in systemEmails.ts)
- Booking confirmation, appointment reminder, review request, POS receipt — `mail.ts`
- Staff invite, staff welcome — `routes.ts`
- Trial 30/7/1 day reminders — `services/trial-reminders.ts`
- Weekly digest — `intelligence/weekly-digest-email.ts`
- Lapsed client winback — `lapsed-client-scheduler.ts`

## Low-balance scheduler
`services/low-balance-scheduler.ts` — registered in `routes.ts` alongside other schedulers.
In-memory dedup (Map) prevents duplicate alerts; resets on server restart (acceptable).

**Why:** All billing email hooks must be fire-and-forget (`.catch(() => {})`) so a Mailgun failure never breaks the billing transaction.
