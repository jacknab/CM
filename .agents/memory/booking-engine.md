---
name: Booking Engine
description: Unified scheduling authority — all booking creation, reschedule, and validation routes through bookingEngine.ts
---

## Location
`artifacts/api-server/src/bookingEngine.ts`

## What it enforces
- Timezone normalization: salon local time only (never server/user tz)
- Same-day booking rule: rejected unless `allowSameDay: true`
- Business hours: dynamic from `storage.getBusinessHours()` — never hardcoded
- Overlap detection: `(existing.start < new.end) AND (existing.end > new.start)`
- Duration rule: ALWAYS `appointment.duration` (incl. addons), NEVER `service.duration`

## Exports
- `toSalonDateKey(date, tz)` — padded YYYY-MM-DD in salon local tz (getMonth()+1, padded)
- `salonDayBoundaries(dateKey, tz)` — UTC dayStart/dayEnd for a salon local date
- `validateBookingSlot(input)` — non-atomic pre-check: past-date, same-day, business hours, overlap
- `atomicCreateBooking(input)` — overlap check + INSERT in one DB transaction
- `atomicRescheduleBooking(input)` — overlap check (excl. self via `ne`) + UPDATE in one DB transaction

## Calling sites
- `aiReceptionist.ts` `createBookingViaBookingRules` — uses `validateBookingSlot` as pre-check before HTTP book call
- `aiReceptionist.ts` `handleReschedule` — uses `validateBookingSlot` (pre-check) + `atomicRescheduleBooking` (atomic write)
- `routes.ts` public `/book` endpoint — uses `atomicCreateBooking` (replaced inline overlap + storage.createAppointment)
- `routes.ts` admin POST `/api/appointments` — uses dynamic business hours check (replaced hardcoded 9-18)

**Why:** Booking logic was duplicated across 4+ call sites with inconsistent timezone handling, hardcoded hours (9-18), and TOCTOU race conditions. Centralized engine is the single source of truth.

**How to apply:** Any new booking-related feature must call the engine functions, not inline overlap checks. Never add `service.duration` to conflict math.
