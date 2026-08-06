---
name: date-fns-tz v3 toZonedTime broken for getUTCHours
description: toZonedTime + getUTC* no longer reliably gives local values in date-fns-tz v3. Always use formatInTimeZone for extraction, including for getNowInTimezone.
---

# date-fns-tz v3: toZonedTime + getUTC* is broken

## The Rule
Never extract local hours/minutes/dates by calling `toZonedTime(date, tz).getUTCHours()` (or `getUTCDate`, `getUTCMonth`, etc.) in date-fns-tz v3.2+. Use `formatInTimeZone` / the `formatInTz` wrapper instead.

For the "wall-clock Date" pattern (where UTC fields store local values for use with isSameStoreDay / addStoreDays / formatStoreDate), build the date via formatInTimeZone + reparse as UTC:

```typescript
// WRONG (breaks in v3) — used in getNowInTimezone
return toZonedTime(new Date(), timezone); // getUTCDate() returns UTC date, not local

// CORRECT — v3-safe wall-clock Date construction
const localStr = formatInTimeZone(new Date(), timezone, "yyyy-MM-dd'T'HH:mm:ss");
return new Date(localStr + "Z"); // getUTCDate() now returns local date
```

## Why
In date-fns-tz v2, `toZonedTime` shifted the internal UTC timestamp so that `getUTCHours()` equalled the local hour. In v3.2, this internal shift no longer applies — the Date object is returned unchanged. `formatInTimeZone` always works correctly in all versions.

## Symptoms
- Appointment cards positioned at UTC hour instead of local hour.
- Calendar "today" showing the UTC date (e.g. July 24) when local date is still July 23 at 8 PM in a UTC-4 timezone.
- `currentDate`, `weekStart`, and "Today" highlight all one day ahead for users in UTC-negative timezones after 8 PM local time.

## How to apply
- Any `toZonedTime(date, tz).getUTCHours()` → `parseInt(formatInTz(new Date(date), tz, "H"), 10)`
- Any `toZonedTime(date, tz).getUTCMinutes()` → `parseInt(formatInTz(new Date(date), tz, "m"), 10)`
- `getNowInTimezone(tz)` must use the formatInTimeZone+reparse pattern (see above), NOT `toZonedTime`
- `format(toZonedTime(date, tz), "h:mm a")` → `formatInTz(date, tz, "h:mm a")`
