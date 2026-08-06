---
name: Timezone Architecture
description: Permanent timezone architecture for Certxa — TIMESTAMPTZ, TimeService, and where timezone calculations live.
---

# Timezone Architecture

## The Rule
- **DB**: All appointment timestamps are TIMESTAMPTZ (UTC). Migration 0097 applied.
- **API**: Accepts and returns UTC ISO-8601 strings (ending in "Z"). Conversion to/from local time uses `fromZonedTime`/`toZonedTime` from `date-fns-tz` with `locations.timezone` (IANA string).
- **Server**: Never use `getHours()`/`getDay()`/`getMinutes()` on raw Date objects for timezone-sensitive operations. Use `formatInTimeZone(date, tz, "H")` etc. OR use `getUTC*` on a `toZonedTime()` result.
- **Frontend**: All timezone ops go through `artifacts/booking/src/lib/timezone.ts`. Never call `date-fns-tz` or `Intl` directly in components.

## Schema
`appointments.date`, `.started_at`, `.completed_at`, `.checked_in_at` — all `TIMESTAMPTZ` (Drizzle: `{ withTimezone: true }`). Migration 0097.

## Server TimeService
`artifacts/api-server/src/lib/timeService.ts` — `createTimeService(tz)` → TimeService with:
- `todayString()`, `format()`, `toUtc()`, `toLocal()`, `dayUtcRange()`, `getLocalHour()`, `getLocalDayOfWeek()`, `isSameLocalDay()`

## Frontend timezone.ts utilities
`artifacts/booking/src/lib/timezone.ts`:
- `formatInTz`, `toStoreLocal`, `getNowInTimezone`, `storeLocalToUtc`, `isSameDayTz`
- `getHourInTz`, `getMinuteInTz`, `getDayOfWeekInTz`, `toLocalDateStringInTz`, `isSameLocalDay`

## toZonedTime pattern
When using `toZonedTime(date, tz)`, ALWAYS use `getUTC*` getters on the result (`getUTCHours()`, `getUTCDay()`, etc.) — NOT `getHours()`/`getDay()` which use the server's process TZ and would break on non-UTC servers.

## Key fixes applied
- `bookingEngine.ts`: getDay/getHours/getMinutes → getUTCDay/getUTCHours/getUTCMinutes
- `intelligence/sms-guard.ts`: replaced `new Date(toLocaleString(...))` hack with `formatInTimeZone`
- `intelligence/dead-seats.ts`: fetches `locations.timezone` at function start, uses it for DOW/hour bucketing
- `intelligence/no-show.ts`: same — fetches timezone, uses for early/late hour check
- `intelligence/weekly-digest-email.ts`: `isMondayMorning` uses `formatInTimeZone`
- `storeContext.ts`: `formatLocalDate`/`formatSlotTime` use `formatInTimeZone` directly
- `lapsed-client-scheduler.ts`: `getUTCHours()` for daily trigger
- `Calendar.tsx`: nowTime, todayDate, clockTime, receipt timestamps all use `formatInTz(date, timezone, ...)`

## Data Migration Safety
0097 used `AT TIME ZONE 'UTC'` cast because all pre-migration data was written via `fromZonedTime()` → already UTC. Safe for production.
