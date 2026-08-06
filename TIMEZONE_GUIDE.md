# Certxa Timezone Guide

## The Rule: One System, UTC In, Local Out

All timestamps in Certxa are stored as **UTC** in PostgreSQL (`TIMESTAMPTZ`).
All display and business-logic comparisons use the **salon's IANA timezone** from `locations.timezone`.

**Never** use the server clock, browser clock, or any manual UTC offset.

---

## The Confirmed Bug (Fixed 2026-07-27)

| | Value |
|---|---|
| UTC timestamp | `2026-07-27T06:17:00Z` |
| Was shown as | July 26, 2026 6:17 PM ❌ |
| Must show as | July 27, 2026 12:17 AM ✅ (America/Denver, MDT) |

**Root cause:** `AccountOverview.tsx` used `new Date(utcStr).toLocaleDateString()`, which applied the *browser's* timezone instead of the salon's configured timezone. Dashboard and Analytics used `storeNow.getHours()` on a "fake-UTC" date object, which similarly applied the browser offset a second time.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     PostgreSQL                          │
│  All timestamps stored as TIMESTAMPTZ (UTC)             │
│  locations.timezone = "America/Denver"  ← source of    │
│                                           truth         │
└────────────────────┬────────────────────────────────────┘
                     │ UTC strings (ISO-8601 ending in Z)
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  API Server                             │
│  lib/timeService.ts — createTimeService(timezone)       │
│  • No timezone conversion in API responses              │
│  • Returns raw UTC; frontend converts for display       │
└────────────────────┬────────────────────────────────────┘
                     │ UTC strings
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  Frontend                               │
│  src/lib/timezone.ts — formatInTz / getNowInTimezone    │
│  • All display goes through formatInTz(date, tz, fmt)   │
│  • Never .toLocaleDateString() / .getHours()            │
└─────────────────────────────────────────────────────────┘
```

---

## Backend: `createTimeService`

```typescript
import { createTimeService } from "@/lib/timeService";

// Get timezone from the database, not from process.env.TZ
const ts = createTimeService(store.timezone); // "America/Denver"

// ✅ Correct usages
ts.todayString()                     // "2026-07-27"   — salon's local date
ts.toLocalDateString(utcDate)        // "2026-07-27"   — local YYYY-MM-DD
ts.format(utcDate, "h:mm a")         // "12:17 AM"     — display string
ts.toUtc("2026-07-27T00:17:00")      // Date (UTC)     — input → storage
ts.localTimeToUtc("2026-07-27","00:17") // Date (UTC)  — form → storage
ts.dayUtcRange("2026-07-27")         // {start,end}    — DB query range
ts.getLocalHour(utcDate)             // 0              — 0–23 local hour
ts.getLocalDayOfWeek(utcDate)        // 1              — 0=Sun…6=Sat
ts.isSameLocalDay(utcA, utcB)        // boolean        — same calendar day?
ts.isOnDate(utcDate, "2026-07-27")   // boolean        — on this local date?
```

### Never do on the backend
```typescript
// ❌ All of these are wrong for business logic
new Date().getHours()               // server timezone
new Date().toLocaleDateString()     // server timezone
process.env.TZ                      // server timezone
startOfDay(new Date())              // date-fns, uses local TZ
```

---

## Frontend: `timezone.ts`

```typescript
import { formatInTz, getNowInTimezone, storeLocalToUtc } from "@/lib/timezone";

const timezone = selectedStore?.timezone ?? "UTC";

// ✅ Display a UTC timestamp in the salon's timezone
formatInTz(utcDate, timezone, "MMMM d, yyyy h:mm a")   // "July 27, 2026 12:17 AM"
formatInTz(utcDate, timezone, "yyyy-MM-dd")             // "2026-07-27"

// ✅ Get salon-local "now" (for greeting, today's date)
const storeNow = getNowInTimezone(timezone);
// IMPORTANT: storeNow is a "fake-UTC" Date where UTC fields = local wall-clock
// Always use storeNow.getUTCHours(), never storeNow.getHours()
const hour = storeNow.getUTCHours();   // ✅
// const hour = storeNow.getHours();   // ❌ applies browser TZ again

// ✅ Submit an appointment: local form input → UTC for API
const utcDate = storeLocalToUtc("2026-07-27T00:17:00", timezone);

// ✅ Check if a UTC appointment is today
const todayStr = formatInTz(new Date(), timezone, "yyyy-MM-dd");
const isToday  = formatInTz(apt.date, timezone, "yyyy-MM-dd") === todayStr;
```

### Never do on the frontend
```typescript
// ❌ All wrong — use browser timezone, not salon timezone
new Date(utcStr).toLocaleDateString()
new Date(utcStr).toLocaleString()
storeNow.getHours()                 // use getUTCHours() instead
format(new Date(), "yyyy-MM-dd")    // date-fns without timezone
```

---

## Database Rules

1. **All appointment times** are stored as `TIMESTAMPTZ` — PostgreSQL stores UTC automatically.
2. **Never store a "local" time** as a bare `TIMESTAMP` or `TEXT` without a timezone.
3. **Every salon must have** `locations.timezone` set to a valid IANA string (e.g. `"America/Denver"`).
4. **Fallback**: if `timezone` is null or empty, `createTimeService` falls back to `"UTC"` and logs a warning.

---

## Timezone Validation

When creating or updating a salon, the timezone is validated as a real IANA zone:
```typescript
try {
  Intl.DateTimeFormat(undefined, { timeZone: tz });
} catch {
  throw new Error(`Invalid IANA timezone: ${tz}`);
}
```

---

## Debug Endpoint

To diagnose a timezone issue in production:

```
GET /api/debug/timezone
Authorization: session cookie

{
  "serverTimeUTC":     "2026-07-27T06:17:00.000Z",
  "serverTimezone":    "UTC",
  "salonTimezone":     "America/Denver",
  "convertedLocalTime":"2026-07-27 00:17:00 MDT",
  "timestampSource":   "locations.id=1",
  "denverExample": {
    "utcInput":         "2026-07-27T06:17:00Z",
    "expected_denver":  "2026-07-27 00:17:00 MDT",
    "actual_denver":    "2026-07-27 00:17:00 MDT"
  }
}
```

If `actual_denver` ≠ `expected_denver`, there is a library/environment issue.

---

## Supported Timezones

All IANA timezone strings are accepted. Common Certxa salons:

| Region | Timezone | UTC Offset (Summer) |
|--------|----------|---------------------|
| US Eastern | `America/New_York` | UTC-4 |
| US Central | `America/Chicago` | UTC-5 |
| US Mountain | `America/Denver` | UTC-6 |
| US Pacific | `America/Los_Angeles` | UTC-7 |
| Vietnam | `Asia/Ho_Chi_Minh` | UTC+7 |
| UK | `Europe/London` | UTC+1 |

---

## Running the Timezone Tests

```bash
pnpm --filter @workspace/api-server test timezone
```

The tests cover:
- Denver midnight crossing (the confirmed bug)
- New York, Los Angeles, Vietnam timezone conversions
- Same-day booking restriction across date boundaries
- UTC fallback for unconfigured salons
- `dayUtcRange()` window correctness for DB queries

---

## Adding a New Feature That Touches Dates

Checklist:
- [ ] Backend: use `createTimeService(store.timezone)` — never `new Date().getHours()`
- [ ] Frontend display: use `formatInTz(utcDate, timezone, format)`
- [ ] Frontend "now": use `getNowInTimezone(timezone)` + `getUTCHours()` not `getHours()`
- [ ] Form input → API: use `storeLocalToUtc(localStr, timezone)`
- [ ] DB query ranges: use `ts.dayUtcRange(dateStr)` for start/end boundaries
- [ ] New salon field: add timezone selection with IANA validation
