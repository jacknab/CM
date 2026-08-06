# Error Code System

## Overview

Every API error logged to the Activity Timeline in the Support Back Office is automatically classified into a structured error code. Codes are displayed as clickable badges on `api_error` events, letting support agents instantly understand what went wrong and how to resolve it — without digging through raw logs.

**Code format:** `ERRORCODE=NNN` where `NNN` is a unique 3-digit number (no zeros in any position).

When talking to a customer or filing a ticket, agents reference just the numeric value (e.g. *"I see error 347 on your account"*).

---

## How It Works

### 1. Classification (server-side)

When any API route returns a `4xx` or `5xx` response, the API error logger middleware (`artifacts/api-server/src/index.ts`) calls `classifyApiError()` from `artifacts/api-server/src/lib/apiErrorCodes.ts`. This function pattern-matches the request method, path, HTTP status code, and error message against the lookup table.

If a match is found, two fields are added to the `metadata` JSON stored in `store_activity_events`:

```json
{
  "method": "POST",
  "path": "/api/bookings",
  "status": 422,
  "errorCode": "ERRORCODE=347",
  "errorNumeric": "347"
}
```

If no pattern matches (e.g. an uncommon 4xx on an unclassified route), the event is still logged — just without an error code badge.

### 2. Lookup Endpoint

```
GET /api/support/error-codes
```

Returns the full static lookup table as JSON, keyed by the 3-digit numeric code. The Support Back Office fetches this once per page load and caches it client-side (TanStack Query with `staleTime: Infinity`). No database involved — the data lives entirely in `apiErrorCodes.ts`.

### 3. Activity Timeline UI

In the **Account → Activity Timeline** view, `api_error` events that carry an `errorNumeric` value show a red `ERRORCODE=NNN` pill badge next to the event title.

Clicking the badge expands an inline panel (no modal) directly below the row showing:

- **Code + Title** — e.g. `ERRORCODE=347 — Booking Slot Unavailable`
- **Description** — plain-English explanation of what the error means
- **Common Causes** — bullet list of the most likely root causes
- **Resolution Steps** — actionable steps for the agent to investigate and fix

Clicking the badge again collapses the panel.

---

## Error Code Reference

### Booking

| Code | Title | Trigger Conditions |
|---|---|---|
| `ERRORCODE=347` | Booking Slot Unavailable | `POST /api/book*`, status 422, message contains "slot" / "unavailable" / "available" |
| `ERRORCODE=582` | Appointment Not Found | Path contains `/appointment`, status 404 |
| `ERRORCODE=761` | Deposit Payment Failed | Message contains "deposit" (any path, any status) |

### SMS

| Code | Title | Trigger Conditions |
|---|---|---|
| `ERRORCODE=293` | SMS Credits Exhausted | Path contains `/sms`, status 402, message contains "credit" / "balance" / "allowance" |
| `ERRORCODE=854` | Invalid Phone / SMS Delivery Failed | Path contains `/sms`, message contains "invalid phone" / "undelivered" / "delivery" / "invalid number" |

### Payments

| Code | Title | Trigger Conditions |
|---|---|---|
| `ERRORCODE=419` | Payment Card Declined | Path contains `/payment`, message contains "declined" / "card" / "insufficient" |
| `ERRORCODE=673` | Refund Processing Error | Path contains `/payment`, message contains "refund" |

### Scheduling

| Code | Title | Trigger Conditions |
|---|---|---|
| `ERRORCODE=528` | Availability Engine Error | Path contains `/availability`, status 500 |

### Catalog

| Code | Title | Trigger Conditions |
|---|---|---|
| `ERRORCODE=941` | Service Not Found | Path contains `/service`, status 404 |

### Auth & Access

| Code | Title | Trigger Conditions |
|---|---|---|
| `ERRORCODE=187` | Authentication Failed | Path contains `/auth`, status 401 or 403 |

### AI Receptionist

| Code | Title | Trigger Conditions |
|---|---|---|
| `ERRORCODE=356` | AI Receptionist Error | Path contains `/ai-receptionist` or `/ai_receptionist` (any status) |

### System

| Code | Title | Trigger Conditions |
|---|---|---|
| `ERRORCODE=799` | Internal Server Error | Any path, status 500 (catch-all) |
| `ERRORCODE=624` | Rate Limit Exceeded | Any path, status 429 (checked first) |

---

## Detailed Code Entries

### ERRORCODE=347 — Booking Slot Unavailable

The requested appointment time could not be confirmed — the staff member or resource is not available during that window.

**Common causes:**
- Staff member is already booked at that time
- The time slot falls outside configured business hours
- A buffer period is blocking the slot between appointments
- The slot was taken by another booking between selection and submission

**Resolution steps:**
- Open the Calendar tab and check for conflicts at the requested time
- Verify business hours in Settings → Business Hours
- Check buffer/padding settings for the relevant service
- Ask the customer to choose an alternative time or staff member

---

### ERRORCODE=582 — Appointment Not Found

A requested appointment record could not be located. It may have been deleted, cancelled, or the ID is incorrect.

**Common causes:**
- Appointment was cancelled or deleted
- The appointment ID in the URL or request is stale/incorrect
- Customer is looking at a link from a different account

**Resolution steps:**
- Search for the appointment in the owner's Calendar or Appointments list
- Check if the appointment appears in the cancelled/deleted records
- Verify the customer is logged into the correct account

---

### ERRORCODE=761 — Deposit Payment Failed

The required deposit payment could not be charged at the time of booking.

**Common causes:**
- Card was declined by the issuer
- Stripe Connect account is not properly configured for this salon
- Customer's card has insufficient funds or is expired
- Payment method was not provided when a deposit is required

**Resolution steps:**
- Check Stripe dashboard for the specific decline reason
- Verify the salon's Stripe Connect account is active in Settings → Payments
- Ask the customer to use a different payment method
- Check if the deposit policy is configured correctly for the service

---

### ERRORCODE=293 — SMS Credits Exhausted

The account has run out of SMS allowance and has insufficient platform credits to send the message.

**Common causes:**
- Monthly SMS allowance included in the subscription plan has been used up
- Platform credit wallet balance is too low to cover the per-message cost ($0.02/SMS)
- Unusually high SMS volume this billing period

**Resolution steps:**
- Check remaining SMS allowance in the account's billing details
- Issue platform credits from Billing Investigation → Apply Credit
- Review SMS usage and advise the customer to upgrade their plan if needed
- Check if reminder storms (e.g. bulk send) caused rapid depletion

---

### ERRORCODE=854 — Invalid Phone / SMS Delivery Failed

The SMS could not be delivered because the destination phone number is invalid, not reachable, or the carrier rejected the message.

**Common causes:**
- Phone number is not in E.164 format or is missing country code
- Number is a landline, VoIP, or not SMS-capable
- Carrier blocked the message (short code compliance, content filtering)
- Customer has opted out of SMS (STOP keyword)

**Resolution steps:**
- Verify the client's phone number is correct and mobile
- Check Twilio delivery logs for the specific carrier error code
- If the customer previously sent STOP, they need to send START to re-enable
- Confirm the sending number is approved for A2P messaging

---

### ERRORCODE=419 — Payment Card Declined

A payment attempt was declined by the card issuer or payment processor.

**Common causes:**
- Insufficient funds on the card
- Card is expired or the CVC/ZIP code is incorrect
- Issuer's fraud detection flagged the transaction
- Card is not enabled for online/international transactions

**Resolution steps:**
- Check Stripe dashboard for the specific decline code and reason
- Ask the customer to try a different card or payment method
- Advise the customer to contact their bank if the card should be valid
- Verify the billing address matches the card on file

---

### ERRORCODE=673 — Refund Processing Error

A refund request could not be completed through the payment processor.

**Common causes:**
- Original charge has already been refunded
- Refund window has expired (Stripe limits: 90 days)
- Stripe Connect account has insufficient balance to cover the refund
- The original payment was disputed and is locked

**Resolution steps:**
- Check the original charge in the Stripe dashboard for refund eligibility
- If the window has expired, issue a manual credit or alternative refund
- Verify the salon's Stripe Connect payout balance
- If there's a dispute, the refund must be handled through the dispute process

---

### ERRORCODE=528 — Availability Engine Error

An internal error occurred while computing available appointment slots.

**Common causes:**
- Missing or malformed business hours configuration
- Staff schedule data is corrupted or missing
- Database query timeout under high load
- Timezone configuration mismatch for the store

**Resolution steps:**
- Verify business hours are configured in Settings → Business Hours
- Check staff schedules for the affected date range
- Review API server logs for the specific error stack trace
- Confirm the store's timezone is set correctly in Settings → General

---

### ERRORCODE=941 — Service Not Found

A requested service could not be found. It may have been deleted or hidden from the public menu.

**Common causes:**
- Service was deleted or archived
- Service is hidden from the public booking page
- The service ID in a deep link or integration is stale
- Service belongs to a different store

**Resolution steps:**
- Check the store's Services list for the missing service
- Verify the service is marked as visible/active
- Update any external links or integrations with the correct service ID

---

### ERRORCODE=187 — Authentication Failed

The request was denied because the user is not authenticated or does not have permission to perform the action.

**Common causes:**
- Session expired — user needs to log in again
- Staff member's role does not have the required permission
- Token or cookie was cleared (browser privacy mode, cache clear)
- Account is suspended and access is blocked

**Resolution steps:**
- Ask the user to log out and log back in
- Check the staff member's role and permissions in Staff → Permissions
- Verify account status is active (not suspended)
- If the account is suspended, use Account Actions to unsuspend if appropriate

---

### ERRORCODE=356 — AI Receptionist Error

An error occurred in the AI Receptionist system, such as during a call, booking attempt, or configuration update.

**Common causes:**
- OpenAI API key is not configured or has expired
- Twilio webhook is not correctly provisioned for this salon
- Call handling encountered an unexpected response from the LLM
- The store has no AI Receptionist subscription feature enabled

**Resolution steps:**
- Check the AI Receptionist settings for this account
- Verify OpenAI API key is set in the platform secrets
- Use Support → AI Receptionist → Provision Webhook to re-apply the Twilio webhook
- Review the call log for the specific error detail

---

### ERRORCODE=799 — Internal Server Error

An unexpected error occurred on the server while processing the request.

**Common causes:**
- Unhandled exception in the API route handler
- Database connection issue or query failure
- Missing required data or schema drift
- Dependency (third-party service) returned an unexpected error

**Resolution steps:**
- Check the API server logs around the time of the error for the stack trace
- Verify the database is healthy via Admin → DB Health
- Reproduce the request and note the exact endpoint and payload
- Escalate to engineering if the error is persistent

---

### ERRORCODE=624 — Rate Limit Exceeded

The account or IP address has sent too many requests in a short time window and has been throttled.

**Common causes:**
- Automated scripts or integrations making excessive API calls
- Brute-force login attempts triggering the auth rate limiter
- High-frequency polling from a custom integration
- Multiple browser tabs making simultaneous requests

**Resolution steps:**
- Wait for the rate limit window to reset (typically 15 minutes for auth, 1 minute for general)
- If caused by automation, advise the customer to add delays between requests
- Check if a third-party integration is polling too aggressively
- For auth rate limits, verify there are no ongoing brute-force attempts

---

## Public Booking Error Capture

Customer-facing booking failures are logged separately from owner-session errors since public routes have no auth session. A dedicated middleware in `artifacts/api-server/src/index.ts` intercepts failures on these four paths:

| Path | What it captures |
|---|---|
| `POST /api/public/store/:slug/book` | Customer booking failures (slot unavailable, validation errors, deposit failures) |
| `GET /api/public/store/:slug/availability` | Availability engine errors |
| `GET /api/public/store/:slug/available-days` | Available-days lookup failures |
| `GET /api/public/store/:slug/services` | Service catalog fetch errors |

The store is resolved from the `:slug` path segment via a direct DB query (`SELECT id FROM stores WHERE slug = $1`). Events written by this middleware include `"source": "public_booking"` in their metadata so they can be distinguished from owner-session errors in queries.

All other `/api/public/` routes (kiosk, queue, plan-prices, health checks, etc.) are intentionally excluded to avoid noise from anonymous data-fetch calls.

---

## Source Files

| File | Purpose |
|---|---|
| `artifacts/api-server/src/lib/apiErrorCodes.ts` | Error code lookup table and `classifyApiError()` classifier |
| `artifacts/api-server/src/index.ts` | API error logger middleware (lines ~1080–1120) — calls classifier, writes `errorCode` + `errorNumeric` to DB |
| `artifacts/api-server/src/routes/support.ts` | `GET /api/support/error-codes` endpoint |
| `apps/support-backoffice/src/lib/api.ts` | `api.errorCodes.list()` client method and `ErrorCodeEntry` type |
| `apps/support-backoffice/src/components/customer360/ActivityTimeline.tsx` | `EventRow` component — badge rendering, expansion panel, `useErrorCodes` hook |

## Planned Improvements

The following enhancements have been scoped and are ready to be picked up.

---

### #4 — Error Code Reference Page in the Support Back Office

**What:** A dedicated searchable page (e.g. `/isTeam/error-codes`) in the support back office listing all error codes. Agents can look up a code by its 3-digit number or by keyword — without needing an active incident on a customer account.

**Why it matters:** Currently agents only see error details when an `api_error` event already exists on the Activity Timeline. There's no way to proactively look up what `ERRORCODE=347` means before a support call.

**Implementation notes:**
- `api.errorCodes.list()` already exists in `apps/support-backoffice/src/lib/api.ts`
- `GET /api/support/error-codes` endpoint already exists in `artifacts/api-server/src/routes/support.ts`
- The page needs a new route added to the support back office router, a search/filter input, and the same inline expansion panel layout used in the Activity Timeline

---

### #5 — Backfill Historical api_error Events with Error Codes

**What:** A one-time script that re-runs `classifyApiError()` over all existing `api_error` rows in `store_activity_events` that predate the error code system, writing the result back to their `metadata` column.

**Why it matters:** All historical events logged before this system was deployed show raw HTTP errors with no badge or explanation in the Activity Timeline.

**Implementation notes:**
- Query: `SELECT id, message, metadata FROM store_activity_events WHERE event_type = 'api_error' AND metadata->>'errorCode' IS NULL`
- For each row, call `classifyApiError(metadata.method, metadata.path, metadata.status, message)` and `UPDATE store_activity_events SET metadata = metadata || $1 WHERE id = $2`
- Script should be idempotent (skips rows that already have `errorCode`)
- Place in `scripts/backfill-error-codes.mjs` — run once against production via `node scripts/backfill-error-codes.mjs`

---

## Adding a New Error Code

1. Open `artifacts/api-server/src/lib/apiErrorCodes.ts`.
2. Choose a unique 3-digit code with **no zeros** in any position.
3. Add a new entry to `ERROR_CODE_LOOKUP` following the existing structure (include `code`, `numeric`, `title`, `description`, `causes`, `resolution`).
4. Add a matching `if` branch to `classifyApiError()` with the appropriate path/status/message patterns.
5. No database migration or frontend change needed — the lookup endpoint serves the new code automatically.
