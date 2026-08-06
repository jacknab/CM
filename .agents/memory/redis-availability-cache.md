---
name: Redis availability cache
description: How ioredis + BullMQ were wired into the AI receptionist availability system; key files, activation, and graceful-degradation design.
---

## Rule
Redis is opt-in — the entire API server runs normally when REDIS_URL is absent. Setting REDIS_URL activates the cache and worker automatically on next restart. Never make Redis a hard dependency.

**Why:** The system was deployed without Redis; adding it as a hard dep would have broken the running app. Graceful degradation ensures zero-downtime activation on the VPS.

**How to apply:** All Redis-touching code starts with `const redis = getRedisClient(); if (!redis) return null/0/undefined;`

## Key files
- `src/lib/redis.ts` — ioredis client; reads REDIS_URL or REDIS_HOST/PORT; exports `getRedisClient()`, `isRedisAvailable()`
- `src/lib/availabilityCache.ts` — `getAvailabilityCache`, `setAvailabilityCache`, `invalidateAvailabilityForDate`, `invalidateAvailabilityForStore`; key format: `availability:{storeId}:{date}:{serviceId}:{staffId|any}`; TTL 7200s
- `src/lib/availabilityQueue.ts` — BullMQ Queue; `enqueueAvailabilityInvalidation(storeId, date, reason)`; jobId dedup prevents double-enqueue for same store+date
- `src/workers/availabilityWorker.ts` — BullMQ Worker started from index.ts; calls `invalidateAvailabilityForDate` on each job; lazy-rebuild strategy (cache repopulates on next AI tool call)

## Integration points in aiReceptionist.ts
- `getAvailabilityViaBookingRules`: Redis read-through before calling `computeAvailabilitySlots`; logs HIT/SET
- After `atomicCreateBooking` success: enqueues invalidation for `dateStr` (salon-local date)
- After cancel success: enqueues invalidation using `toSalonLocalDateString(existing.date, salonTimezone)`; `salonTimezone` added as optional param to `handleCancel`
- After reschedule success: enqueues invalidation for both old and new dates

## Activation on VPS
```bash
sudo bash scripts/setup-redis.sh   # generates .env.redis with REDIS_URL
cat .env.redis >> .env             # merge into main .env
pm2 reload certxa-api              # or systemctl restart
```
On restart look for `[Redis] Connected` and `[AvailabilityWorker] Worker started` in logs.
