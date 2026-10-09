# Certxa Pro mobile API

The native app authenticates with `POST /api/solo/login` (email/password), then
sends `Authorization: Bearer <token>` on each request. The API uses the user's
existing store, PostgreSQL `clients`, `services`, and `appointments` tables;
data from another store is never returned. The existing cookie-based web API
keeps its legacy response shapes. Native owner clients use the compact shapes
below; staff continue through the legacy permission-scoped routes.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Health diagnostics including `ok: true` when healthy (503 otherwise) |
| GET | `/api/customers` | List store customers, including `name`, `fullName`, `firstName`, `lastName`, `phone`, `email`, `notes` |
| POST | `/api/customers` | Create a customer; required nonempty `name`, optional `phone`, `email`, `notes` |
| GET | `/api/services` | List active store services (`id`, `name`, `duration`, `price`) |
| GET | `/api/appointments?from=2026-09-29T00:00:00.000Z&to=2026-09-30T00:00:00.000Z` | List store appointments in inclusive range, ordered by date, including cancelled |
| POST | `/api/appointments` | Create a pending appointment |
| PATCH | `/api/appointments/:id` | Partially update date, serviceId, duration, status, notes |
| POST | `/api/appointments/:id/cancel` | Soft-cancel one appointment (also accepts cookie authentication) |

`duration` is minutes; `price` is **dollars** (not cents). Dates are ISO 8601
with timezone and returned in UTC. Statuses supported by this mobile contract:
`pending`, `confirmed`, `started`, `paid`, `cancelled`. The broader web API
also uses other statuses. A cancelled appointment cannot be restored, edited,
paid or checked out through this contract (409); create a new booking instead.

Create customer example:

```json
{"name":"Jane Smith","phone":"555-0100","email":"jane@example.com","notes":"Afternoons"}
```

Response (201):

```json
{"id":1,"name":"Jane Smith","fullName":"Jane Smith","firstName":"Jane","lastName":"Smith","phone":"555-0100","email":"jane@example.com","notes":"Afternoons"}
```

Create appointment example:

```json
{"customerId":1,"serviceId":1,"duration":90,"date":"2026-09-29T16:00:00.000Z","notes":"Optional"}
```

Response (201), also returned from update and list:

```json
{"id":1,"date":"2026-09-29T16:00:00.000Z","duration":90,"status":"pending","notes":"Optional","customer":{"id":1,"name":"Jane Smith","phone":"555-0100","email":"jane@example.com"},"service":{"id":1,"name":"Classic Lash Set","duration":90,"price":120}}
```

Reschedule: `PATCH /api/appointments/1` with
`{"date":"2026-09-29T17:30:00.000Z","serviceId":1,"duration":90,"status":"confirmed","notes":"Updated"}`.

Cancel: `POST /api/appointments/1/cancel` with
`{"notifyClient":false,"reason":"Client request"}` returns 200:

```json
{"appointment":{"id":1,"status":"cancelled","cancelledAt":"2026-09-29T12:00:00.000Z","cancellationReason":"Client request"},"notification":{"requested":false,"status":"not_requested"}}
```

The appointment object also includes the date, duration, notes, customer and
service as above. Repeated cancellation is idempotent: it retains the first
reason and timestamp. Original date and payment history stay in the database.
`notifyClient:true` currently returns `status:"not_configured"`; **no message
is sent**. Only the selected appointment is cancelled, even if it belongs to a
recurring series. The legacy DELETE route still exists for old web clients,
but the cancellation flow never invokes it. Invalid bodies/queries receive
400 JSON `{ "error": "Invalid input", "details": [...] }`; missing bookings
receive 404; cancelled transitions receive 409.

## Setup

Configure `DATABASE_URL`, `SESSION_SECRET` (or dedicated `SOLO_JWT_SECRET`),
and `APP_URL` in the deployment environment. Configure `CORS_ORIGINS` for any
Expo web origin; native clients normally omit the Origin header. Do not put
credentials in the native app. Existing store services are used as-is; no
production mock data or automatic seed is installed.

Run migrations with `pnpm --dir artifacts/api-server run start` after building;
the server's startup migration runner applies pending files in `migrations/`,
including `0213_mobile_appointment_cancellation.sql`. Alternatively run the
repository's normal deployment migration step before starting. Build with
`pnpm --dir artifacts/api-server run build`, start with
`pnpm --dir artifacts/api-server run start`, typecheck with
`pnpm --dir artifacts/api-server run typecheck` and test with
`pnpm --dir artifacts/api-server run test`.
