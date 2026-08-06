---
name: Dashboard timezone display
description: Wall-clock Date values must not be passed through timezone formatters a second time.
---

Dashboard greetings may use a wall-clock helper for local hour comparisons, but visible dates and times must format the raw current instant with the store timezone exactly once.

**Why:** Formatting a Date that was already shifted to a store's wall-clock representation applies the timezone offset twice, causing the dashboard clock to show the wrong date and time when the browser is in another zone.

**How to apply:** Use `getHourInTz(new Date(), timezone)` for greeting logic and `formatInTz(rawInstant, timezone, pattern)` for visible dates/times. Do not pass `getNowInTimezone()` output to `formatInTz()`.