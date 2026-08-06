---
name: bookingEngine timezone fix
description: toSalonDateKey and validateBookingSlot business-hours check were using toZonedTime+getUTC* (broken in date-fns-tz v3); fixed to use formatInTimeZone directly.
---

## Rule
`bookingEngine.ts` must never use `toZonedTime` + `getUTCHours/getUTCMinutes/getUTCDay`.

**Why:** date-fns-tz v3 `toZonedTime` no longer shifts the UTC representation — `getUTCHours()` on its result returns the raw UTC hour, not the salon-local hour. This made `toSalonDateKey` return the wrong date for non-UTC salons, and the business-hours check compare UTC hours against salon open/close times.

**How to apply:**
- `toSalonDateKey` → `formatInTimeZone(utcDate, tz, "yyyy-MM-dd")`
- Day-of-week → `parseInt(formatInTimeZone(date, tz, "i"), 10) % 7` (0=Sun…6=Sat)
- Hour → `parseInt(formatInTimeZone(date, tz, "H"), 10)`
- Minute → `parseInt(formatInTimeZone(date, tz, "m"), 10)`
- `fromZonedTime` is still used for `salonDayBoundaries` (local→UTC conversion) and is fine.
