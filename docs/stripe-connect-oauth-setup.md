# Stripe Connect OAuth — Setup & Troubleshooting Guide

## What Stripe Connect Does in Certxa

When a salon owner clicks **"Connect Stripe Account"** in their Payment Settings, the following flow runs:

1. Your server generates a Stripe OAuth URL that includes a `redirect_uri` pointing back to your API.
2. The salon owner is sent to Stripe's site to log in and grant permission.
3. Stripe sends an authorization `code` back to your `redirect_uri`.
4. Your server exchanges that single-use code for the salon's Stripe Account ID.
5. Certxa stores the account ID and uses it to process payments on the salon's behalf.

---

## The Exact Redirect URI Your Stripe Account Needs

### Production (certxa.com)

```
https://certxa.com/api/payments/stripe/callback
```

This is the **one URI you must register** in your Stripe Connect settings for production to work.

### Development (Replit preview)

Your Replit dev environment uses a different domain. The server automatically detects this via the `REPLIT_DEV_DOMAIN` environment variable and builds a dev-specific redirect URI. You must also add this to Stripe during testing:

```
https://af5b3252-502d-4392-a7b0-2b4be3671385-00-2y8uyxmvfm6e8.picard.replit.dev/api/payments/stripe/callback
```

> **Important:** Stripe requires an exact match. The `redirect_uri` in the OAuth request must exactly match one of the URIs you've registered — no trailing slashes, no extra paths.

---

## How to Register the Redirect URI in Stripe

1. Go to [https://dashboard.stripe.com/settings/connect](https://dashboard.stripe.com/settings/connect)
2. Under **OAuth settings**, find the **Redirects** section.
3. Click **Add URI** and enter:
   ```
   https://certxa.com/api/payments/stripe/callback
   ```
4. Click **Add URI** again and enter your Replit dev URI (for testing):
   ```
   https://af5b3252-502d-4392-a7b0-2b4be3671385-00-2y8uyxmvfm6e8.picard.replit.dev/api/payments/stripe/callback
   ```
5. Save.

---

## Required Environment Variables

Set these in your Replit Secrets (or production environment):

| Variable | Where to Find It | Required |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API Keys → Secret key (`sk_live_...`) | Yes |
| `STRIPE_CONNECT_CLIENT_ID` | Stripe Dashboard → Settings → Connect → Your platform's **Client ID** (`ca_...`) | Yes |
| `STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → Developers → API Keys → Publishable key (`pk_live_...`) | Yes |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Developers → Webhooks → your endpoint's signing secret (`whsec_...`) | Yes (for webhooks) |

> **Live vs Test keys:** Use `sk_test_` / `pk_test_` keys during development and `sk_live_` / `pk_live_` in production. Your Connect Client ID (`ca_...`) is the same for both environments — but make sure the **redirect URIs registered match the domain you're testing on**.

---

## Root Cause of "Authorization code does not belong to you"

Stripe returns this error message for **two completely different problems**. Here is how to tell them apart and fix each one:

---

### Problem 1: Redirect URI Mismatch (most likely cause)

**What happened:**

The `redirect_uri` your server sent to Stripe when starting the OAuth flow did not exactly match any URI registered in your Stripe Connect settings.

Your server builds the redirect URI dynamically:

```typescript
// In artifacts/api-server/src/routes/stripeConnect.ts
const baseUrl = getReturnBaseUrl(req);
// In dev:  https://<REPLIT_DEV_DOMAIN>
// In prod: https://certxa.com  (from APP_URL)
const callbackUrl = `${baseUrl}/api/payments/stripe/callback`;
```

**In development**, `REPLIT_DEV_DOMAIN` is set automatically by Replit, so the redirect URI becomes your Replit preview URL, not `certxa.com`. If you only registered `certxa.com` in Stripe, all dev tests will fail with this error.

**Fix:**
- Register both URIs in Stripe as shown above.
- When testing production behavior locally, you can temporarily unset `REPLIT_DEV_DOMAIN` or set `APP_URL` to override it — but the cleanest solution is simply registering both URIs.

---

### Problem 2: Reusing an Authorization Code

**What happened:**

Stripe authorization codes are **one-time use only**. If your server (or browser) calls the callback URL a second time with the same `code` — for example by:
- Refreshing the callback page
- Clicking back and re-initiating the flow without getting a new code
- A bug that calls `exchangeOAuthCode()` twice

Stripe invalidates the code after the first use and returns this error.

**Fix:**
- Never refresh the callback URL (`/api/payments/stripe/callback?code=...`).
- If testing repeatedly, always restart the flow from the **Connect Stripe Account** button — this generates a fresh authorization code each time.
- The current code handles this correctly (it calls `exchangeOAuthCode` exactly once per callback), so this is only an issue if you manually replay a URL.

---

## Full OAuth Flow — Step by Step

```
Salon Owner
    │
    │  1. Clicks "Connect Stripe Account" in Payment Settings
    ▼
GET /api/payments/stripe/connect
    │  Server generates OAuth URL with:
    │    client_id = STRIPE_CONNECT_CLIENT_ID
    │    redirect_uri = https://certxa.com/api/payments/stripe/callback
    │    state = base64url({ storeId, ts }) — anti-forgery token
    │    scope = read_write
    ▼
https://connect.stripe.com/oauth/authorize?...
    │
    │  2. Salon owner logs into Stripe and clicks "Connect"
    ▼
GET https://certxa.com/api/payments/stripe/callback
    ?code=ac_xxxxx          ← single-use authorization code
    &state=eyJzdG9yZUlk...  ← the state your server sent
    │
    │  3. Server decodes state → extracts storeId
    │  4. Server calls stripe.oauth.token({ code }) → gets stripe_user_id
    │  5. Server calls stripe.accounts.retrieve(stripe_user_id) → syncs account
    │  6. Stores in store_payment_accounts table
    ▼
Redirect → /manage/payment-settings?connect_success=1
```

---

## Stripe Dashboard: Connect Settings Checklist

Go to [https://dashboard.stripe.com/settings/connect](https://dashboard.stripe.com/settings/connect) and verify:

- [ ] **Your platform is enabled for Connect** (you should see a Client ID starting with `ca_`)
- [ ] **OAuth is enabled** (not just Express — Standard accounts need OAuth)
- [ ] **Redirect URI registered:** `https://certxa.com/api/payments/stripe/callback`
- [ ] **Redirect URI registered (dev):** your Replit dev domain callback URL
- [ ] **Scope:** `read_write` (required for Terminal / payment processing)

---

## Testing the Integration End-to-End

### In Development (Replit)

1. Set `STRIPE_SECRET_KEY` (test key: `sk_test_...`) in Replit Secrets.
2. Set `STRIPE_CONNECT_CLIENT_ID` (your `ca_...` Client ID) in Replit Secrets.
3. Ensure your Replit dev callback URI is registered in Stripe.
4. Log in as a store owner in your app.
5. Go to Payment Settings → click **Connect Stripe Account**.
6. Use Stripe's test account (or your own Stripe account in test mode).
7. On success you'll land on `/manage/payment-settings?connect_success=1`.

### In Production (certxa.com)

1. Set `STRIPE_SECRET_KEY` (live key: `sk_live_...`) in your production environment.
2. Ensure `APP_URL=https://certxa.com` is set.
3. Ensure the production callback URI is registered in Stripe.
4. Test with a real Stripe account (or a test connected account in live mode).

---

---

## Real-Time Account Updates — Connect Webhook

After a salon connects their Stripe account, Stripe sends webhook events to your server whenever that account's status changes (e.g. charges get approved, payouts enabled, or the salon revokes access from their Stripe dashboard). This keeps your database in sync automatically without polling.

### Webhook Endpoint URL

Register this URL in your Stripe Dashboard as the Connect webhook endpoint:

**Production:**
```
https://certxa.com/api/stripe/connect-webhook
```

**Development (Replit):**
```
https://af5b3252-502d-4392-a7b0-2b4be3671385-00-2y8uyxmvfm6e8.picard.replit.dev/api/stripe/connect-webhook
```

### Events to Subscribe To

When creating the webhook endpoint in Stripe, select these three events under **"Connect events"** (not platform events):

| Event | What It Does |
|---|---|
| `account.updated` | Re-syncs `charges_enabled`, `payouts_enabled`, `details_submitted` whenever the salon's account info changes |
| `capability.updated` | Re-syncs when Stripe approves or restricts a specific capability (card payments, transfers, etc.) |
| `account.application.deauthorized` | Automatically marks the salon's account as disconnected when they revoke your platform's access from their own Stripe dashboard |

### How to Register the Webhook in Stripe

1. Go to [https://dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks)
2. Click **Add endpoint**
3. Enter the endpoint URL: `https://certxa.com/api/stripe/connect-webhook`
4. Under **Listen to**, select **Events on Connected accounts** (not "Events on your account")
5. Add the three events listed above
6. Click **Add endpoint**
7. Copy the **Signing secret** (`whsec_...`) shown after saving
8. Add it to Replit Secrets as `STRIPE_CONNECT_WEBHOOK_SECRET`

### Required Secret

| Variable | Description |
|---|---|
| `STRIPE_CONNECT_WEBHOOK_SECRET` | The `whsec_...` signing secret from the Connect webhook endpoint in your Stripe Dashboard |

> Without this secret, the webhook endpoint will still accept requests (to avoid Stripe retrying indefinitely) but will skip signature verification and log a warning. Set it to enable full security.

### What Happens When a Salon Disconnects via Stripe

If a salon owner goes directly to their Stripe account settings and revokes your platform's access (bypassing your UI), Stripe fires `account.application.deauthorized`. Your server catches this and immediately marks their `store_payment_accounts` record as `disconnected`, preventing any further charges through that account.

---

## Common Errors and Fixes

| Error | Cause | Fix |
|---|---|---|
| `Authorization code does not belong to you` | Redirect URI mismatch | Register the exact callback URL in Stripe Connect settings |
| `Authorization code does not belong to you` | Code reused | Re-initiate the flow from the Connect button to get a fresh code |
| `STRIPE_CONNECT_CLIENT_ID is not configured` | Missing env var | Add `STRIPE_CONNECT_CLIENT_ID` (`ca_...`) to Replit Secrets |
| `STRIPE_SECRET_KEY is not configured` | Missing env var | Add `STRIPE_SECRET_KEY` to Replit Secrets |
| `No store found for this session` | User not logged in as owner | Ensure you're logged in as the store owner before connecting |
| `connect_error=access_denied` | User clicked Cancel on Stripe's page | Normal — user declined, they can try again |
