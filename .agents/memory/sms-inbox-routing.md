---
name: SMS Inbox & Multi-Tenant Routing
description: How shared toll-free Twilio number routes inbound SMS to the correct salon, and the full SMS inbox system architecture.
---

# SMS Inbox & Multi-Tenant Routing

## Architecture
- One shared Twilio toll-free number for ALL salons (multi-tenant, shared number)
- `sms_conversations` flat table — one row per message (both inbound and outbound), keyed by storeId + clientPhone
- `sms_contact_routing` table — routing map: one row per (storeId, clientPhone) pair, updated on every send/receive

## Routing Strategy (inbound webhook: POST /api/webhooks/twilio/incoming)
1. **sms_contact_routing** — pick store with most-recent `lastInteractionAt` for the phone
2. **sms_log fallback** — search outbound log for +phone and bare phone variants
3. **client_phones / appointments fallback** — search client_phones by E164, then legacy customers via appointments
4. **Unroutable** — log warning; no message saved (no ambiguous-routing TwiML currently, can be added)

## Key rule: outbound always updates routing
Every `POST /api/sms-inbox/reply` and `POST /api/sms-inbox/start` upserts sms_contact_routing with lastOutboundAt + lastInteractionAt so future inbound from that number routes back to the same salon.

## API endpoints
- `GET  /api/sms-inbox/conversations` — tenant-isolated conversation list with unread counts
- `GET  /api/sms-inbox/messages` — full thread for a phone, marks inbound read
- `POST /api/sms-inbox/reply` — send reply, update routing
- `POST /api/sms-inbox/start` — start new conversation with a client (searches client_phones for name)
- `GET  /api/sms-inbox/clients/search?q=` — search clients by name or phone for new conversation modal

## Frontend (SmsInbox.tsx)
- Polls conversations every 10s, messages every 8s
- Search filter on conversation list
- + New Conversation button → modal with client search or manual phone entry
- Message bubbles show CheckCheck (delivered) or AlertCircle based on twilioSid presence

## Migration
- 0055_sms_contact_routing.sql — creates sms_contact_routing with UNIQUE(store_id, client_phone)

## Real-time push (WebSocket)
- Backend: inbound webhook calls `broadcastNotification({ type: "sms_inbound", storeId, clientPhone, clientName, body, createdAt })` after saving the row
- Frontend: `SmsInbox.tsx` opens a WS to `/ws/notifications?storeId=X`, listens for `sms_inbound`, invalidates conversations query immediately; if the active thread matches, also invalidates the messages query; otherwise toasts
- Polling fallback at 60s (was 8s/10s) — WS handles all real-time delivery
- Uses `selectedPhoneRef` (ref, not state) in the WS handler to avoid stale closure issues
- Auto-reconnects after 4s on close; 25s heartbeat ping to keep proxies alive

**Why:** Without the routing table, inbound messages falling back to sms_log only work if a prior outbound exists; new clients who text first can't be routed. The routing table becomes the source of truth after first contact.

## Critical bug fixed (June 2026)
Inbound Twilio sends `From: +17202436886`. Old code stripped to `"17202436886"` (11 raw digits).
Reply route stripped from frontend → `"7202436886"` (10 raw digits).
These are DIFFERENT strings → `phoneMap.has()` split them into separate conversations.

Fix: `phone = toE164US(fromRaw) ?? rawDigits` at the top of the inbound webhook.
All storage (sms_conversations.client_phone, sms_contact_routing.client_phone) now uses E.164.
sms_log.phone also E.164 (fixed in sendSms). `rawDigits` kept ONLY for opt-out table (backward compat).
sms_log fallback tries `[phone, rawDigits, `+${rawDigits}`]` to match legacy rows.

**sms_contact_routing table**: NOT auto-created — must apply 0055_sms_contact_routing.sql manually via psql or node script. Was missing on Replit; applied June 2026.
