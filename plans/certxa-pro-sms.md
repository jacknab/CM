# Certxa Pro app — SMS credits and the $3 Plus plan

Owner request, 2026-10-30. The Certxa Pro app (Solo plan) stays free. Text-message notifications are not free:
- Every new Solo account gets **50 free SMS credits**. The number is a backend setting.
- 1 credit = 1 text.
- Owners buy credit packs on the website, or take **Plus at $3/month** (was $5; owner changed it 2026-10-30) for unlimited notification texts. Plus will unlock more features later.
- Payments use Certxa's Stripe account and our own renewal system, not Stripe Subscriptions.

## What exists today (audit, 2026-10-30)

**Texts are free to every salon.**
- `sendSms()` in `artifacts/api-server/src/sms.ts` only charges `campaign`, `campaign_test` and `bulk_sms`.
- Every automatic text (confirmations, reminders, review requests, booking requests, replies and so on) is platform-paid. Review requests even pass `skipCreditDeduction`.

**There are three balances on `locations`:**
- `sms_allowance`: a monthly plan bucket, used first for campaigns.
- `platform_credits`: a dollar wallet, $0.02 per text, used second.
- `sms_credits` and `sms_credits_total_purchased`: credited by the old `sms_topup` Stripe Checkout (`POST /api/billing/sms-bucket/checkout`, packs $10/333, $25/833, $50/1,667). **`sendSms()` never spends `sms_credits`**, and no store has any.

**The renewal system** is `services/saas-billing.ts` + `services/saasBillingCore.ts`:
- Stripe only stores the card (SetupIntent).
- Each store has one `saas_billing_profiles` row (amount, `interval_days` 31 or 365, `next_charge_at`).
- An hourly run charges due rows off-session with an idempotency key and logs every attempt in `saas_billing_charges`. Retries come 1, 3 and 5 days later.
- After the last failure, **the account is Suspended**.
- `startInHouseSubscription()` takes the first charge and opens `store_subscriptions`.
- **It has never run in production.** `SAAS_BILLING_MODE` is not set (= off), and there are 0 billing profiles and 0 charges. A first charge at signup still goes through. Renewals only happen once the mode is `live`.

**The Solo plan:**
- It is `subscription_plans.code = 'solo'`, $0, and opened on signup by `POST /api/solo/register` (routes.ts).
- `resolveStorePlan(storeId).planCode === 'solo'` identifies it.
- There is 1 Solo store today (#41, the test account).

**Apple** (App Review Guideline 3.1.1):
- Credits used inside the app count as digital goods.
- On the **US App Store** a button that links to buying on the website is allowed, with no Apple fee and no entitlement, since the 2025 Epic ruling.
- Outside the US it needs Apple in-app purchase, or an external-link entitlement in a few regions.
- Plan: US-only link-out, shown only when the App Store storefront is the US.

## Owner decisions (2026-10-30)
- **Every text to a client** from a Solo account without Plus costs 1 credit. That includes confirmations, reminders, review requests, booking-request replies, reschedule notices and two-way replies.
- **Out of credits:** the text is not sent and is logged. E-mail still goes. The owner is alerted at 10 credits left and at 0.
- **Packs:** $5/100, $10/250, $20/600 (admin-editable).
- **Billing run:** turn `SAAS_BILLING_MODE` on when Plus launches. Run dry_run for a day first, then live.

## Phases

### Phase 1 — Credits are spent (backend)
- **Setting:** a platform setting "free SMS credits for new Solo accounts", default 50, editable by admins.
- **Grant at signup:** `POST /api/solo/register` adds the free credits to `sms_credits` and writes a ledger row.
- **Spending in `sendSms()`, Solo stores only:**
  - Plus active → the text is free.
  - Otherwise, take 1 from `sms_credits` atomically (`WHERE sms_credits > 0`), and refund it if Twilio fails.
  - At 0 credits → the text is not sent and is logged as `skipped`, with the reason "no SMS credits". E-mail notifications still go.
- **Ledger:** every grant, purchase and spend gets one row in its own table, so the balance can always be explained.
- **Owner alerts:** one e-mail or notification at 10 credits left, and one at 0.
- Salon plans (Starter and up) are unchanged.

### Phase 2 — Buying credits on the website
- **Pack prices** are set by admins, not in code (the old `SMS_PACKAGES` are hard-coded).
- **A web page** for Solo owners shows the balance, the packs and Plus. Purchases are paid with Stripe (PaymentIntent or Checkout, `metadata.type = 'sms_topup'`), and the existing webhook path adds to `sms_credits` and writes a ledger row.
- **Sign-in handoff:** the app opens the page already signed in, using a one-time link created from the app's login, so the owner doesn't log in again in the browser.
- A receipt e-mail goes out after each purchase.

### Phase 3 — Plus, $3/month — BUILT 2026-10-30
Built as `routes/soloPlus.ts` + `/pro-plus` page: the app's Plus card (More) asks for a one-time link (`POST /api/solo/plus/web-link`) and opens certxa.com/pro-plus signed in; card via SetupIntent; `startInHouseSubscription()` takes the first $3; plan row `solo_plus` (migration 0272, not public). `SAAS_BILLING_MODE=dry_run` since 2026-10-30 — switch to `live` after a day. Failed or cancelled Plus → back to free Solo (`backToSolo` in services/saas-billing.ts).

- **Plan row:** a new plan `solo_plus` ($3 monthly) in `subscription_plans`, admin-editable like the others.
- **Signing up:** card saved with a SetupIntent, then `startInHouseSubscription()` takes the first $3 now and opens the plan.
- **Renewals:** the hourly billing run charges $3 every 31 days. This needs `SAAS_BILLING_MODE=live` (it currently is off for everyone).
- **Failed payment:** after the last retry, a Plus account **drops back to free Solo**. It is not Suspended (today the run suspends the whole account). Unused credits stay.
- **Cancel:** Plus stays until the paid period ends, then the account returns to Solo.
- **Abuse guard:** "unlimited" is still capped by a hidden daily safety limit.

### Phase 4 — The app
- **New Settings screen, "Text messages":**
  - Shows the credits left, or "Plus — unlimited".
  - Shows recent use.
  - A "Buy credits / Get Plus" button opens the website page (US storefront only).
- **Client notifications screen:** shows the balance and a warning when it is low or empty.
- Needs a new iOS build.

### Phase 5 — Plus features
To be decided later.
