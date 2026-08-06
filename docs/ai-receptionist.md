# AI Voice Booking Receptionist

A real-time, voice-driven receptionist that answers inbound phone calls on behalf of any salon in the platform. The AI recognises returning callers by their phone number, can **book new appointments, cancel existing ones, and reschedule** — fully automated, 24/7.

---

## Table of Contents

1. [Overview](#overview)
2. [Capabilities](#capabilities)
3. [How It Works](#how-it-works)
4. [Architecture Deep-Dive](#architecture-deep-dive)
5. [Audio Pipeline](#audio-pipeline)
6. [Security Model](#security-model)
7. [Webhook URL Reference (Internal — Do Not Share with Salons)](#webhook-url-reference-internal)
8. [Multi-Store Setup — How to Configure Each Salon](#multi-store-setup)
9. [Admin Toggle (Platform Operator)](#admin-toggle-platform-operator)
10. [Owner Toggle (Salon Settings)](#owner-toggle-salon-settings)
11. [Call Flow — What the Caller Experiences](#call-flow)
12. [Tools & Data Writes](#tools--data-writes)
13. [Interruption Handling](#interruption-handling)
14. [Environment Variables Reference](#environment-variables-reference)
15. [API Reference](#api-reference)
16. [Troubleshooting](#troubleshooting)

---

## Overview

When a customer calls a salon's Twilio phone number:

1. Twilio POSTs the call to your server's webhook. The server **verifies the request came from Twilio** (X-Twilio-Signature) and validates the `storeId`.
2. The server fetches the salon's name, timezone, and service menu, plus **looks up upcoming appointments for the caller's phone number**.
3. The server returns TwiML that opens a bi-directional audio WebSocket between Twilio and OpenAI's Realtime API.
4. The AI greets the caller by name (if known) and offers context-aware options:
   - "I see you have a Color & Cut on Saturday at 3pm — would you like to confirm, cancel, reschedule, or book something new?"
   - Or, for new callers: "How can I help you book today?"
5. Once the caller confirms an action, the AI calls a structured tool — `complete_booking`, `cancel_booking`, or `reschedule_booking` — which writes the change directly to the database.
6. The AI says goodbye and the call ends.

**Salon owners see a simple on/off toggle** in their Settings sidebar. They do not see or manage the phone number or webhook — that is all controlled by you in the Twilio account.

---

## Capabilities

| Capability | Trigger | Tool fired | DB effect |
|---|---|---|---|
| **Book new appointment** | Caller asks to book | `complete_booking` | Inserts a new row in `appointments` with `status="confirmed"`, creates customer record if new |
| **Cancel existing appointment** | Caller asks to cancel a booking shown in their upcoming list | `cancel_booking` | Sets `status="cancelled"` and `cancellationReason` on the appointment |
| **Reschedule existing appointment** | Caller asks to move a booking shown in their upcoming list | `reschedule_booking` | Updates the appointment's `date` field; status stays `"confirmed"` |
| **Just confirm details** | Caller wants to verify their booking | (none) | Read-only — AI reads back the details and ends warmly |
| **Caller recognition** | Always (when caller ID is available) | (none) | The AI is told the caller's upcoming appointments at session start |

---

## How It Works

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Inbound Phone Call                                 │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ PSTN
                               ▼
                       ┌───────────────┐
                       │    Twilio     │
                       └───────┬───────┘
                               │ POST (HTTP) + X-Twilio-Signature header
                               ▼
         ┌──────────────────────────────────────────────────┐
         │  POST /api/webhook/twilio?storeId=7              │
         │  ─ verifies X-Twilio-Signature                   │
         │  ─ validates storeId against DB                  │
         │  ─ fetches salon name, services, timezone        │
         │  ─ extracts caller phone from `From` field       │
         │  ─ returns TwiML <Connect><Stream> with caller   │
         │    phone embedded as <Parameter name="from">     │
         └──────────────────────────────────────────────────┘
                               │
                               │ Twilio opens WSS
                               ▼
         ┌──────────────────────────────────────────────────┐
         │  WSS /media-stream?storeId=7                     │
         │                                                  │
         │  1. Opens OpenAI Realtime WebSocket              │
         │  2. Waits for BOTH: OpenAI ready + Twilio start │
         │  3. Reads caller phone from start parameters    │
         │  4. Looks up that caller's upcoming appointments │
         │  5. Builds & sends session.update with context  │
         │  6. AI greets the caller with their booking info │
         │                                                  │
         │  Caller voice ──► 8 kHz µ-law ─────► OpenAI Realtime API
         │  AI response  ◄── 8 kHz µ-law ◄─────              │
         └──────────────────────────────────────────────────┘
```

---

## Architecture Deep-Dive

All backend code lives in one file:
**`artifacts/api-server/src/routes/aiReceptionist.ts`**

Frontend pages:
- Salon-owner toggle: **`artifacts/booking/src/pages/AiReceptionist.tsx`**
- Admin toggle (per-store): **`artifacts/booking/src/pages/admin/AccountsAdmin.tsx`** — the "AI Receptionist" column

Integration into the platform required two lines added to `routes.ts`. No existing code was modified.

### Key functions

| Function | Purpose |
|---|---|
| `getSalonContext(storeId)` | Queries DB for salon name, timezone, and service menu |
| `getCallerUpcomingAppointments(phone, storeId)` | Returns the caller's future, non-cancelled, non-completed appointments at that store |
| `buildOpenAiSessionConfig(salon, callerPhone, appointments)` | Constructs the OpenAI session config: instructions, voice, VAD, and the three booking tools |
| `createCallSession(twilioWs, salon)` | Manages one active call — bridges Twilio ↔ OpenAI WebSockets and coordinates session bootstrap |
| `handleNewBooking(storeId, args, salon)` | Creates customer (if needed) + writes a confirmed appointment |
| `handleCancel(storeId, args, allowlist)` | Validates the appointment is in the caller's allowlist, re-checks storeId, then sets `status="cancelled"` |
| `handleReschedule(storeId, args, allowlist)` | Validates allowlist + storeId, then updates the appointment's `date` field |
| `getReceptionistEnabled / setReceptionistEnabled` | Read/write the per-store enabled flag in `storeSettings.preferences` |
| `setupAiReceptionistRoutes(httpServer, app)` | Registers all REST routes and the WebSocket upgrade handler |

### Session bootstrap coordination

The OpenAI WebSocket connects in parallel with the Twilio WebSocket. The session config can only be sent **after both** conditions are met:

- `openAiReady` — OpenAI WebSocket opened
- `startReceived` — Twilio sent its `start` event with the caller's phone in `customParameters.from`

A `sessionConfigured` flag ensures `session.update` is sent **exactly once**, and inbound caller audio is **dropped** until that flag flips true (so the AI never responds to the caller before its instructions and tools have loaded).

---

## Audio Pipeline

**OpenAI's Realtime API accepts `g711_ulaw` (8 kHz µ-law) natively — the exact same format Twilio sends.**
**There is zero audio conversion in either direction. Audio is piped directly.**

```
Twilio → 8 kHz µ-law base64 → OpenAI input_audio_buffer.append
OpenAI → 8 kHz µ-law base64 → Twilio media event
```

This is the primary latency advantage over alternative providers that require multi-step format conversion.

---

## Security Model

The receptionist is gated by **four** layers because cancel/reschedule capabilities are sensitive:

### 1. Twilio webhook signature validation

Every POST to `/api/webhook/twilio` must include a valid `X-Twilio-Signature` HMAC computed with your `TWILIO_AUTH_TOKEN`. Without it, anyone who guessed your webhook URL could POST a forged `From=+15551234567` and the AI would treat them as the owner of that phone's bookings. Unsigned/invalid requests are rejected with HTTP 403.

```
[AI Receptionist] ❌ Rejected unsigned/forged Twilio webhook from 1.2.3.4 for https://app.certxa.com/api/webhook/twilio?storeId=7
```

### 2. Per-call appointment allowlist

When the session starts, the server builds an `allowlist` of appointment IDs that belong to the caller's phone at that store. The AI is told only these IDs. The `cancel_booking` and `reschedule_booking` handlers refuse any `appointmentId` not in this set.

### 3. Defense-in-depth storeId verification

Even after the allowlist check passes, the cancel/reschedule handlers re-load the appointment from the database and verify its `storeId` matches the call's `storeId` before mutating. Belt and suspenders.

### 4. Audio gate

Inbound caller audio is dropped until `sessionConfigured` is true. This prevents OpenAI from processing the caller's first words before the session instructions, tools, and appointment allowlist have been loaded.

### What is intentionally NOT a barrier

- **Phone-number identity is not "authentication"** — caller ID can be spoofed at the PSTN level. However, with Twilio signature validation in place, the only path to influence `customParameters.from` is through a legitimately-routed Twilio call. If you need stronger identity guarantees (e.g. callers must enter a PIN to manage existing bookings), add that flow before the `getCallerUpcomingAppointments` call.

---

## Webhook URL Reference (Internal)

> **These URLs are for your Twilio account configuration only.
> Do not display them to salon owners.**

### Twilio Inbound Webhook

```
POST https://<your-domain>/api/webhook/twilio?storeId=<N>
```

- The base URL is identical for every salon: `/api/webhook/twilio`
- The only thing that changes is the `?storeId=N` query parameter
- Replace `<N>` with the salon's numeric ID from the `locations` table

### WebSocket Media Stream (set automatically by TwiML — not configured in Twilio)

```
WSS https://<your-domain>/media-stream?storeId=<N>
```

This URL is generated server-side and returned inside the TwiML. Twilio connects to it automatically. You do not configure this in the Twilio console.

### Owner Settings API (per-store, authenticated)

```
GET   /api/ai-receptionist/settings   → { enabled: bool, apiKeyConfigured: bool }
PATCH /api/ai-receptionist/settings   → body: { enabled: bool }
```

### Admin Settings API (platform operator, per-store)

```
GET   /api/admin/stores/:storeId/ai-receptionist   → { enabled, apiKeyConfigured }
PATCH /api/admin/stores/:storeId/ai-receptionist   → body: { enabled: bool }
```

---

## Multi-Store Setup

This is a multi-tenant platform. **Each salon gets its own Twilio phone number with its own webhook URL.** The AI behavior is automatically customised per salon on every call — no static config per salon required.

### Finding a storeId

```sql
SELECT id, name, phone FROM locations ORDER BY id;
```

Or open the admin panel at `/isAdmin → Accounts` — the storeId is visible per row.

### Per-salon Twilio configuration

For each salon that should have AI answering:

1. In the [Twilio Console](https://console.twilio.com) → **Phone Numbers → Manage → Active Numbers**
2. Click the phone number assigned to that salon
3. Under **Voice & Fax → A CALL COMES IN**, set:
   - **Webhook type:** HTTP POST
   - **URL:** `https://your-domain/api/webhook/twilio?storeId=<that salon's ID>`

**Example — three salons, one platform:**

| Salon | Store ID | Twilio phone | Webhook URL |
|---|---|---|---|
| Glam Studio NYC | 1 | +1 212-555-0101 | `…/api/webhook/twilio?storeId=1` |
| Shear Bliss LA | 2 | +1 310-555-0202 | `…/api/webhook/twilio?storeId=2` |
| The Mane Event Chicago | 7 | +1 312-555-0707 | `…/api/webhook/twilio?storeId=7` |

Each call is completely isolated — simultaneous calls across different salons never share state.

### What the AI knows per salon (loaded dynamically on each call)

- The salon's business name (from `locations.name` or `storeSettings.preferences.businessName`)
- The salon's timezone (from `locations.timezone`)
- The full service menu — name, duration, price, and service ID (from the `services` table)
- The caller's upcoming appointments at that salon (looked up by caller-ID phone match)

Adding a new service or changing a price is reflected on the very next call with no code changes.

---

## Admin Toggle (Platform Operator)

As the platform operator, you control which salons have the AI active:

1. Go to `https://<your-domain>/isAdmin` → **Accounts**
2. The summary row shows an **"AI Enabled"** stat card with the platform-wide count
3. Find the salon in the table
4. In the **AI Receptionist** column, click the pill — it toggles **On** (indigo) ↔ **Off** (grey)

The change writes immediately to `storeSettings.preferences.aiReceptionistEnabled` and is live on the next inbound call. No restart required.

---

## Owner Toggle (Salon Settings)

Salon owners can also toggle it themselves through their dashboard:

**Settings → AI Receptionist**

The page shows:
- A **system status badge** — green "Ready" if the OpenAI key is configured, red "Not configured" if not
- A **toggle switch** to enable or disable AI answering for that specific salon
- A **"how it works"** explanation card

**Salon owners never see a webhook URL** — they just see an on/off switch.

---

## Call Flow

The AI adapts each conversation naturally — the four flows below are paraphrased examples.

### Flow A — New caller, new booking

```
AI:     "Hello and welcome to Glam Studio! I'm the virtual receptionist.
         How can I help you today?"
Caller: "I'd like to book a balayage."

AI:     "Lovely! Could I get your full name?"
Caller: "Sophie Clarke"

AI:     "Thanks, Sophie. And the best number to reach you?"
Caller: "555-867-5309"

AI:     "Perfect. We have Balayage + Toner — 90 minutes, $145. What day works?"
Caller: "This Thursday at 2 PM."

AI:     "Just to confirm — Sophie Clarke, 555-867-5309, Balayage + Toner,
         Thursday at 2 PM. Does that all sound right?"
Caller: "Yes, perfect."

AI:     "Wonderful! You're all set. See you Thursday at 2."

[OpenAI fires complete_booking → handleNewBooking writes appointment → call ends]
```

### Flow B — Returning caller, just confirming

```
AI:     "Hi Sophie! I see you have a Balayage + Toner this Thursday at 2 PM.
         How can I help — confirm, cancel, reschedule, or book something else?"
Caller: "Just wanted to make sure it was still on."

AI:     "Yes — Thursday at 2 PM for your Balayage + Toner. See you then!"

[No tool fired — call ends]
```

### Flow C — Returning caller, cancellation

```
AI:     "Hi! I see you have a Cut + Colour on Saturday at 3 PM.
         How can I help?"
Caller: "I need to cancel — something came up."

AI:     "No problem. Cancelling your Cut + Colour for Saturday at 3 PM.
         Could I ask why, just so the team knows? Totally optional."
Caller: "Family emergency."

AI:     "Of course. Just to confirm — cancelling your Cut + Colour, Saturday
         3 PM. Is that right?"
Caller: "Yes."

AI:     "Done. Take care, and we'll see you next time."

[OpenAI fires cancel_booking → handleCancel sets status=cancelled with reason → call ends]
```

### Flow D — Returning caller, reschedule

```
AI:     "Hi! I see your Blowout is booked for tomorrow at 10 AM. How can I help?"
Caller: "Can I move it to Friday at 4?"

AI:     "Absolutely. So we'd move your Blowout from tomorrow 10 AM to Friday
         at 4 PM. Does that sound right?"
Caller: "Yes please."

AI:     "All set — your Blowout is now Friday at 4 PM. See you then!"

[OpenAI fires reschedule_booking → handleReschedule updates date → call ends]
```

---

## Tools & Data Writes

The AI never parses free text to take action — it calls one of three OpenAI **tools** (function-calling) and the server receives structured JSON.

### `complete_booking`

```json
{
  "customerName": "Sophie Clarke",
  "customerPhone": "555-867-5309",
  "serviceId": 5,
  "appointmentDateTime": "2026-05-28T14:00:00"
}
```

**Server action:**
1. `storage.searchCustomerByPhone` — find existing customer
2. If none, `storage.createCustomer({ name, phone, storeId })`
3. `storage.createAppointment({ date, duration, status:"confirmed", serviceId, customerId, storeId })`
4. Returns `{ success, message }` to OpenAI so the AI can confirm
5. Closes the Twilio WebSocket 7 seconds later

### `cancel_booking`

```json
{ "appointmentId": 42, "reason": "Family emergency" }
```

**Server action:**
1. Verify `appointmentId` is in the per-call allowlist (built from caller's upcoming bookings at this store)
2. Re-fetch the appointment and verify its `storeId` matches the call's `storeId`
3. `storage.updateAppointment(id, { status:"cancelled", cancellationReason })`
4. Closes the Twilio WebSocket 7 seconds later

### `reschedule_booking`

```json
{ "appointmentId": 42, "newDateTime": "2026-05-30T16:00:00" }
```

**Server action:**
1. Verify `appointmentId` is in the per-call allowlist
2. Re-fetch the appointment and verify its `storeId` matches the call's `storeId`
3. Validate `newDateTime` parses to a valid Date
4. `storage.updateAppointment(id, { date: newDate, status:"confirmed" })`
5. Closes the Twilio WebSocket 7 seconds later

---

## Interruption Handling

When a caller speaks while the AI is talking:

1. **Detected:** an inbound audio chunk arrives while `aiSpeaking === true`
2. **Cancel OpenAI generation:** `{ "type": "response.cancel" }` is sent to OpenAI immediately — the AI stops mid-sentence
3. **Clear Twilio buffer:** `{ "event": "clear" }` is sent to Twilio — the caller stops hearing queued audio instantly
4. **OpenAI VAD** picks up the new caller speech and the AI listens and responds afresh

The result is a natural, interruptible conversation — the AI does not talk over the caller.

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `AI_INTEGRATIONS_OPENAI_API_KEY` | **Yes** | OpenAI API key with access to `gpt-4o-realtime-preview-2024-12-17`. Auto-provisioned by Replit's OpenAI integration in dev. |
| `APP_URL` | **Yes (production)** | Public base URL, e.g. `https://app.certxa.com`. Used to build the `wss://` stream URL inside TwiML and to compute the URL passed to Twilio's signature validator. Auto-derived from `REPLIT_DEV_DOMAIN` in development. |
| `TWILIO_ACCOUNT_SID` | Existing | Already used by the SMS system. |
| `TWILIO_AUTH_TOKEN` | **Yes (production)** | Required by the AI receptionist for `X-Twilio-Signature` validation on `/api/webhook/twilio`. Without it, anyone could POST a forged caller-ID and the AI would treat them as the owner of those bookings. The server logs a warning and skips validation if missing — never deploy that way. |

---

## API Reference

### `POST /api/webhook/twilio?storeId=<N>`

Called by Twilio when an inbound call is received.

| Query param | Type | Description |
|---|---|---|
| `storeId` | integer | Numeric ID of the salon (`locations.id`) |

**Headers:** Must include `X-Twilio-Signature` — validated against `TWILIO_AUTH_TOKEN` when set.

**Body (form-encoded, sent by Twilio):**

| Field | Description |
|---|---|
| `From` | Caller's phone number (E.164 format, e.g. `+15551234567`). Extracted, sanitised, and passed through to the WebSocket session as `customParameters.from`. |
| `CallSid` | Twilio call identifier (logged) |

**Returns:** TwiML XML

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://your-domain/media-stream?storeId=7">
      <Parameter name="storeId" value="7" />
      <Parameter name="from" value="+15551234567" />
    </Stream>
  </Connect>
</Response>
```

**Error responses:**

| Condition | Response |
|---|---|
| `X-Twilio-Signature` missing or invalid (when `TWILIO_AUTH_TOKEN` is set) | `<Reject/>` (HTTP 403) |
| `storeId` missing or not an integer | `<Reject/>` (HTTP 400) |
| Store not found in DB | `<Reject/>` (HTTP 404) |

---

### `WSS /media-stream?storeId=<N>`

Bi-directional WebSocket endpoint. Twilio connects here automatically after receiving the TwiML.

**Not called directly** — Twilio manages the connection.

**Inbound Twilio events handled:**

| Event | Action |
|---|---|
| `connected` | Logged |
| `start` | Reads `streamSid`, `callSid`, and `customParameters.from` (caller phone). Triggers session bootstrap: appointment lookup → `session.update` to OpenAI. |
| `media` (track: inbound) | Forwarded to OpenAI as `input_audio_buffer.append` — but only after `sessionConfigured === true` |
| `stop` | Both WebSockets closed cleanly |

**Outbound messages sent to Twilio:**

| Event | When |
|---|---|
| `media` | Each `response.audio.delta` chunk from OpenAI |
| `clear` | When caller interrupts while AI is speaking |

---

### `GET /api/ai-receptionist/settings`

Returns the current enabled state for the logged-in store. Requires authentication.

**Response:**
```json
{ "enabled": true, "apiKeyConfigured": true }
```

### `PATCH /api/ai-receptionist/settings`

Enables or disables the AI receptionist for the logged-in store. Requires authentication.

**Body:** `{ "enabled": true }`
**Response:** `{ "enabled": true, "apiKeyConfigured": true }`

---

### `GET /api/admin/stores/:storeId/ai-receptionist`

Admin-scope read of a specific store's enabled state. Requires an authenticated session.

**Response:** `{ "enabled": bool, "apiKeyConfigured": bool }`

### `PATCH /api/admin/stores/:storeId/ai-receptionist`

Admin-scope write. Used by the AccountsAdmin page's per-row toggle.

**Body:** `{ "enabled": true }`
**Response:** `{ "enabled": bool, "apiKeyConfigured": bool }`

---

## Troubleshooting

### "AI_INTEGRATIONS_OPENAI_API_KEY is not set" in logs

Either the Replit OpenAI integration isn't connected (dev) or the env var is missing from `.env.production` (VPS). Verify with `pm2 env certxa-api | grep OPENAI`.

### "TWILIO_AUTH_TOKEN is not set" in logs

The webhook will work, but **signature validation is skipped** — never run production this way. Set `TWILIO_AUTH_TOKEN` in `.env.production`, reload PM2, and the warning will disappear.

### "Rejected unsigned/forged Twilio webhook"

This appears when the signature header is missing or the HMAC doesn't match. Causes:

1. **`APP_URL` doesn't match what Twilio is calling.** The validator hashes the full URL Twilio used. If Twilio calls `https://app.certxa.com/...` but `APP_URL=https://certxa.com`, the hash won't match. Set `APP_URL` to the exact public hostname configured in Twilio.
2. **Wrong auth token.** Make sure `TWILIO_AUTH_TOKEN` matches the account that owns the Twilio phone number. Check at <https://console.twilio.com> → Account → API keys & tokens.
3. **A proxy is rewriting the body or URL.** Nginx with default settings does not — but custom middleware that re-encodes form data will break signature validation.

To test the signature path locally, you can disable it temporarily by unsetting `TWILIO_AUTH_TOKEN`. **Re-set it before going live.**

### Calls connect but I hear silence

- Check logs for `[AI Receptionist] OpenAI Realtime connected` — if missing, the WebSocket to OpenAI failed to open
- Check logs for `[AI Receptionist] OpenAI error:` — the session config may have been rejected
- Verify the OpenAI account has Realtime API access enabled

### Twilio shows "Application Error" or "11200"

- The webhook URL is not reachable from Twilio's servers
- Confirm `APP_URL` is set to the deployed domain with `https://`
- Confirm the server is running: `pm2 status` should show `certxa-api` as `online`

### The AI doesn't recognise the caller

- Confirm the caller is calling from a number stored on a customer record at that store: `SELECT * FROM customers WHERE phone LIKE '%5551234567%' AND store_id = N;`
- Check logs for `from="(unknown)"` — this means caller ID was blocked or not sent. The AI will fall back to asking for the number.

### Cancel/reschedule refused with "not one I can modify"

This is the allowlist firing. It means the AI tried to act on an appointment ID that wasn't in the caller's upcoming-appointments list. Causes:
- The appointment is at a different store
- The customer record's phone doesn't match the caller's phone (e.g. customer is stored as `(555) 123-4567` but caller ID is `+15551234567`). The lookup normalises to digits — if it still misses, check the customer record's phone formatting.
- The AI hallucinated an appointment ID. The session instructions explicitly tell it not to, but if it persists, check the `[AI Receptionist] Refusing to cancel…` log line.

### How to test without a real phone call

Sign a fake request with your auth token and POST it:

```bash
node -e "const t = require('twilio'); const url = 'https://app.certxa.com/api/webhook/twilio?storeId=1'; const params = { CallSid: 'CAtest', From: '+15551234567' }; console.log(t.getExpectedTwilioSignature(process.env.TWILIO_AUTH_TOKEN, url, params))"
```

Then:

```bash
curl -X POST "https://app.certxa.com/api/webhook/twilio?storeId=1" \
  -H "X-Twilio-Signature: <output from above>" \
  -d "CallSid=CAtest&From=%2B15551234567"
```

Expected output — a `<Response>` block with a `<Stream url="wss://…">` element and two `<Parameter>` lines (`storeId` and `from`).

For end-to-end testing of the WebSocket bridge, place a real call from your phone to the Twilio number — there is no shortcut for testing live OpenAI audio.
