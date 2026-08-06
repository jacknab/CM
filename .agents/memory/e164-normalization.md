---
name: E.164 phone normalization
description: Canonical US phone normalization system — where the utility lives and every entry point that was fixed.
---

# Rule
All phone numbers must be stored and transmitted as E.164 (`+1XXXXXXXXXX`). Twilio requires E.164 in the `to:` field — passing raw input silently sends to wrong numbers or fails.

**Why:** Twilio rejects non-E.164 `to:` values. Inconsistent formats break duplicate-detection (waitlist, client lookup), SMS opt-out matching, and incoming SMS routing.

**How to apply:** Any new entry point that accepts a phone must call `toE164US()` from `lib/phoneUtils.ts` before storage or SMS dispatch. Use `requireE164US()` at strict API entry points.

# Canonical utility
`artifacts/api-server/src/lib/phoneUtils.ts`
- `toE164US(input)` — returns `+1XXXXXXXXXX` or `null` for invalid
- `requireE164US(input)` — throws with `code: "INVALID_PHONE"` for invalid
- `displayPhone(e164)` — formats as `(303) 555-1212` for display
- `normalizePhone(raw)` — returns `{ e164, display }` (used by clients.ts via import)

# Fixed entry points (as of June 2026)
- `sms.ts` `sendSms()`: normalizes to E.164 before Twilio `to:` field; bails early with `{ success: false }` if invalid
- `routes.ts` online booking (`POST /api/public/book/:slug`): validates → E.164 before customer lookup/create
- `routes.ts` waitlist join (`POST /api/stores/:storeId/waitlist`): normalizes `customerPhone` before INSERT
- `routes.ts` kiosk checkin (`POST /api/public/kiosk/:slug/checkin`): normalizes `phone` before `kiosk_checkins` INSERT
- `routes.ts` kiosk missed-you-sms (`POST /api/public/kiosk/:slug/missed-you-sms`): validates → E.164 before sendSms call
- `routes.ts` kiosk noshow-waitlist (`POST /api/public/kiosk/:slug/noshow-waitlist`): validates → E.164; client lookup uses `client_phones.phone_number_e164` NOT `clients.phone`
- `storage.ts` `createCustomer()`: uses `toE164US()` before `client_phones` INSERT
- `routes/clients.ts` `normalizePhone()`: removed local copy, now imports from `lib/phoneUtils`

# Already correct (no changes needed)
- `client_phones` table: columns `phone_number_e164` + `display_phone`, handled by `normalizePhone()` in clients.ts ✅
- `storage.searchCustomerByPhone`: normalizes via `right(regexp_replace(...), 10)` SQL — works on both raw and E.164 input ✅
- Kiosk phone lookup: uses `phone_number_e164 LIKE %digits%` — acceptable ✅
