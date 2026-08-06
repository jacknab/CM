---
name: Kiosk check-in duplicate/auto-cancel bug
description: Why a kiosk walk-in appointment could silently flip to CANCELLED shortly after being created, and the general risk in the background reconciliation job.
---

A walk-in appointment created via the check-in kiosk was observed being auto-cancelled with no user action shortly after appearing on the calendar.

Root cause: `artifacts/api-server/src/routes/sync-jobs.ts` runs a background reconciliation job (30s after boot, then every 5 min) that finds any two overlapping, non-cancelled appointments for the *same customerId* and cancels the one with the higher id, assuming it's a duplicate. It did not exempt `checked_in`/`started` appointments — a client physically standing at the kiosk could have their real walk-in cancelled just because it overlapped with a stale/unarrived booking and happened to have a higher id.

**Why:** the kiosk check-in route (`POST /api/public/kiosk/:slug/checkin`) had no idempotency guard, so a double-tapped submit (or check-in while an online booking already existed) could create two active rows for the same client, feeding the reconciler's "duplicate" heuristic.

**How to apply:** any status meaning "client is physically present / being served" (checked_in, started) must never be the side auto-cancelled by background dedup/reconciliation jobs — prefer cancelling the non-present side, or skip and log for manual review if both sides are present. Any public-facing creation endpoint that can be double-submitted (kiosk, public booking forms) should have an idempotency guard (recent-window duplicate check, ideally under a Postgres advisory lock keyed on storeId+clientId) before insert.

Also fixed in the same pass: `autoAssignTechnician` (appointment-assignment.ts) computed "today"/"start of today" using the server's local time instead of the salon's stored timezone — inconsistent with the rest of the codebase's date-fns-tz convention (`fromZonedTime`/`toZonedTime` against `locations.timezone`).

**Follow-up fix — closing the dedupe-lock/booking-insert race:** the client-dedupe advisory lock (`pg_advisory_xact_lock(storeId, clientId)`) and `atomicCreateBooking`'s staff-conflict lock (`pg_advisory_xact_lock(storeId, staffId)`) must run inside the *same* transaction, or the dedupe lock is released before the booking INSERT and a double-tapped submit can still create two active rows. `atomicCreateBooking` takes an optional `externalTx` param specifically so a caller can compose its own pre-check transactionally instead of opening a second transaction.

**Pitfall:** when re-checking "any duplicate row created in the last N minutes" inside such a transaction, don't bound the query with `<= now` where `now` was captured at request-entry time. A concurrent request's just-inserted row can carry a timestamp a few ms later than this request's captured `now`, so an upper bound silently excludes it and reopens the race. Use a lower-bound-only recent window (e.g. `date >= now - 15min`) plus a non-terminal status filter instead.
