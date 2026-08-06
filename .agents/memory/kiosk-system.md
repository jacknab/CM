---
name: Kiosk Check-In System
description: GoCheckin-style self-service tablet kiosk; public API routes, DB table, frontend pages, URL pattern, image uploads, timezone handling.
---

## URL Pattern
- `/kiosk/:slug` — client-facing kiosk (KioskCheckIn.tsx) — same slug as `/q/:slug`
- `/kiosk/:slug/ticket/:token` — staff QR scan page (KioskTicket.tsx)
- `/kiosk-settings` — admin settings page (KioskSettings.tsx) — authenticated, in Settings section

## Public API Routes (no auth required)
- `GET  /api/public/kiosk/:slug/config` — store info + services + clocked-in staff + categoryImages + timezone
- `POST /api/public/kiosk/:slug/lookup` — client phone lookup; returns client + matching todayAppointment
- `POST /api/public/kiosk/:slug/checkin` — create kiosk_checkins record + best-effort walk-in appointment
- `GET  /api/public/kiosk/ticket/:token` — fetch ticket by token (expires 4 hours)
- `PUT  /api/public/kiosk/ticket/:token/status` — update status (waiting/called/serving/completed)

## Authenticated API Routes
- `GET  /api/kiosk-settings` — load kioskEnabled, welcomeHeadline, loyaltyPromoText, categoryImages, bookingSlug, storeName
- `PUT  /api/kiosk-settings` — save all kiosk settings (stored in storeSettings.preferences.kioskSettings JSON)
- `POST /api/kiosk-settings/category-image` — upload card image; multipart: fields `image` (file) + `categoryKey` (hand|foot|combo); uploads to R2 via uploadToR2(), falls back to local /uploads

## Database
`kiosk_checkins` table created with `CREATE TABLE IF NOT EXISTS` at API startup (registerRoutes, before `return httpServer`).
Columns: id, store_id, client_id, phone, client_name, services (JSONB), token (unique), appointment_id, status, staff_id, assigned_staff_name, created_at, expires_at (4h).

## Kiosk Settings Storage
Stored as JSON blob inside `storeSettings.preferences` (text column). Key path: `prefs.kioskSettings`.
Shape:
```json
{
  "kioskEnabled": true,
  "welcomeHeadline": "string",
  "loyaltyPromoText": "string",
  "categoryImages": {
    "hand": "https://...",
    "foot": "https://...",
    "combo": "https://..."
  }
}
```

## Category Card Images (service_type screen)
Three fixed nail-salon groups displayed as large photo cards on the "What brings you in today?" screen:
- `hand` → Hand Services (manicures, nails, acrylic, gel, dip…)
- `foot` → Foot Services (pedicures, foot, toe, callus…)
- `combo` → Mani-Pedi Packages (catch-all for unmatched services)

Images uploaded via `/api/kiosk-settings/category-image` (POST, multipart). Stored in R2 bucket under `kiosk/` prefix, auto-converted to WebP by sharp. URLs saved into `categoryImages` map in kioskSettings. Emoji fallbacks (💅 🦶 ✨) shown when no image is uploaded.

**How to apply:** Service assignment uses keyword matching on service.category + service.name. Last group (combo) absorbs anything unmatched. If ALL groups are empty, all services fall into the first group.

## Timezone Handling
All time operations use `store.timezone` (IANA string, e.g. `America/New_York`) from the `locations` table. The kiosk config API response always includes `timezone`.

**Where timezone is applied:**
1. **Clocked-in staff query** — `todayDate` computed via `toZonedTime(new Date(), storeTz)` so "today" is in the salon's local date, not UTC.
2. **Appointment lookup window** — end-of-day upper bound computed in store's local timezone via `fromZonedTime(localEnd, storeTzLookup)`.
3. **Frontend fmtTime()** — uses `Intl.DateTimeFormat` with `timeZone: kioskConfig.timezone` so all displayed times are in the salon's local clock regardless of the tablet's system timezone.
4. **Walk-ins today query (`GET /api/kiosk/walkins/today`)** — fetches `store.timezone` from `locations` table and passes it as `$2` to the SQL `AT TIME ZONE $2` expression. Was previously hardcoded to `'UTC'`, which caused check-ins made late in the evening (e.g. 11pm EST = 4am UTC next day) to vanish from the board at midnight UTC.

**Critical rule:** Any SQL query that filters `kiosk_checkins.created_at` by calendar date ("today") MUST use `AT TIME ZONE storeTz`, not hardcoded `'UTC'`. Relative interval comparisons (`created_at < NOW() - INTERVAL '1 hour'`) are fine in UTC — they measure elapsed seconds, not date boundaries.

## Appointment Lookup Rules (lookup endpoint)
When a client enters their phone, the system searches for a matching appointment:
- **Lower bound:** `NOW() - INTERVAL '30 minutes'` (PostgreSQL) — appointments more than 30 minutes in the past are ignored; client is treated as a walk-in
- **Upper bound:** end of today in the salon's local timezone
- **Status filter:** excludes `cancelled`, `no_show`, `completed`, `checked_in`
- **Match method:** raw pool.query via LIKE on `client_phones.phone_number_e164` + `display_phone`; also checks legacy `customers.phone`
- On match: appointment is immediately marked `checked_in` and `checked_in_at = NOW()`

**Why:** Prevents a client who missed a 9am appointment from being auto-checked-in against it when they walk in at 2pm.

## Frontend (KioskCheckIn.tsx)
Full screen state machine: `idle → phone → loading → welcome/name_entry → service_type → services → stylist → upsell → ticket → appointment_confirmed`

Key interfaces:
```ts
KioskConfig { kioskEnabled, welcomeHeadline, loyaltyPromoText, categoryImages, timezone }
StoreConfig  { name, phone, address }
```

- `service_type` screen: 3 fixed nail-group cards with large photo images + bullet list; reads `kioskConfig.categoryImages[key]`
- Phone entry: custom circular numpad (onPointerDown, no native keyboard), auto-submits at 10 digits
- Name entry: QWERTY touch keyboard (20 char max)
- Service grid: 3 columns, touch-friendly, multi-select
- Ticket screen: auto-resets to idle after 30s countdown
- Idle timer: resets to idle after 90s of inactivity
- All buttons use `onPointerDown` (not `onClick`) for faster touch response — no 300ms delay

## Frontend (KioskSettings.tsx)
Admin UI at `/kiosk-settings`. Sections:
1. **Your Kiosk URL** — copyable URL + QR code (print for tablet)
2. **Category Card Images** — 3 upload rows (hand/foot/combo), thumbnail preview, green checkmark on done, "Replace" button after upload
3. **Enable Kiosk** — toggle; disabled → clients see "closed" screen
4. **Display Text** — welcomeHeadline + loyaltyPromoText fields
5. **Save changes** button — PUT /api/kiosk-settings

## Other Frontend Files
- `artifacts/booking/src/pages/KioskTicket.tsx` — staff scan page, shows services + action buttons
- Routes added to App.tsx near the public queue routes
- Uses `qrcode.react` v4: `import { QRCodeCanvas } from 'qrcode.react'`
