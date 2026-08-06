---
name: Offline-first booking system
description: What was built to make Calendar, NewBooking, and client flows work offline.
---

## What exists (fully wired)
- `artifacts/booking/src/lib/appointments-cache-db.ts` — IndexedDB with `day_cache` + `local_bookings` stores.
- `artifacts/booking/src/lib/local-clients-db.ts` — IndexedDB for offline-created clients (temp UUIDs).
- `artifacts/booking/src/lib/action-queue-db.ts` — added `CREATE_CLIENT` and `UPDATE_CLIENT` action types.
- `artifacts/api-server/src/routes/sync.ts` — `handleCreateClient` and `handleUpdateClient` functions added; dedup check on phone/name; returns real ID in mappings.

## Hook changes
- `use-appointments.ts` — `useAppointments` reads from cache when offline; `useCreateAppointment` queues locally when offline, saves `LocalBooking` to IndexedDB.
- `use-customers.ts` — `useCustomers` falls back to snapshot.customers + local offline clients; `useCreateCustomer` queues `CREATE_CLIENT` action offline.
- `use-addons.ts` — `useAddonsForService` falls back to all snapshot addons when offline.
- `use-clients.ts` — `useClientDetail` builds a ClientDetail stub from snapshot.customers offline.

## Already worked offline (before this session)
- `useServices`, `useStaffList`, `useAddons`, `useServiceCategories` — all had `networkMode: "offlineFirst"` + snapshot placeholderData.

## SnapshotProvider
- Pre-warms appointment cache (yesterday through tomorrow) on boot and reconnect via `prewarmAppointmentsCache()`.
- Reconnect sequence: sync queue → refresh snapshot → bulk sync → re-warm appointments cache.

## Existing infrastructure (don't re-create)
- `OfflineStatusBanner` component — already imported in App.tsx, shows offline/syncing/reconciling states.
- `snapshot-db.ts`, `snapshot-service.ts`, `sync-engine.ts`, `enterprise-sync-engine.ts` — all pre-existing and working.
- Backend `/api/offline/snapshot` returns categories, services, addons, staff, customers.

**Why:** Salon front desks need to continue taking bookings during internet/server outages with zero data loss, auto-syncing when reconnected.
