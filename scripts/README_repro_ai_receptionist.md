# AI Receptionist Repro Harness (CLI)

This script exercises the AI receptionist availability and booking APIs without Twilio/voice. It can also list services directly from the database (no caching) to find a valid serviceId.

Script: [`scripts/repro-ai-receptionist.sh`](scripts/repro-ai-receptionist.sh:1)

## Requirements

- Bash
- curl
- Optional: `psql` (for LIST_SERVICES=1) and access to `DATABASE_URL` (auto-loaded from `/etc/certxa.env` if present).

## Environment variables

Required:
- `STORE_ID` — numeric store id
- `SERVICE_ID` — numeric service id
- `DATE` — YYYY-MM-DD target date

Common options:
- `APP_URL` — base URL (default `http://127.0.0.1:5000`)
- `CUSTOMER_PHONE` — 10-digit phone (e.g., `5551234567`)
- `CUSTOMER_NAME` — booking name (default `"Test Caller"`)
- `SLOT_ISO` — ISO datetime for booking (e.g., `2025-07-01T15:00:00`)
- `AI_RECEPTIONIST_API_KEY` — sent as `x-ai-receptionist-key` if set
- `LIST_SERVICES` — set to `1` to list services from DB before HTTP calls
- `PSQL_BIN` — override psql binary (optional)

## Quick examples

Availability-only:
```bash
STORE_ID=2 SERVICE_ID=101 DATE=2025-07-01 ./scripts/repro-ai-receptionist.sh
```

Availability + booking:
```bash
STORE_ID=2 SERVICE_ID=101 DATE=2025-07-01 \
CUSTOMER_PHONE=5551234567 CUSTOMER_NAME="Test Caller" \
SLOT_ISO=2025-07-01T15:00:00 \
./scripts/repro-ai-receptionist.sh
```

List services from DB first (uses `/etc/certxa.env` if available):
```bash
LIST_SERVICES=1 STORE_ID=2 SERVICE_ID=101 DATE=2025-07-01 ./scripts/repro-ai-receptionist.sh
```

Custom base URL and API key header:
```bash
APP_URL=https://certxa.com AI_RECEPTIONIST_API_KEY=secret-key \
STORE_ID=2 SERVICE_ID=101 DATE=2025-07-01 \
CUSTOMER_PHONE=5551234567 SLOT_ISO=2025-07-01T15:00:00 \
./scripts/repro-ai-receptionist.sh
```

## What it does

1) Optional: lists services via `psql` when `LIST_SERVICES=1` and `DATABASE_URL` is available.
2) Calls availability: `GET /api/ai-receptionist/store/:storeId/availability?serviceId=...&date=...`
3) If `CUSTOMER_PHONE` and `SLOT_ISO` are provided, calls booking: `POST /api/ai-receptionist/store/:storeId/book`
4) Prints timing for each curl call.

## Notes

- No caching; every run hits live availability/booking logic.
- Phone should be 10 digits when passed to the booking endpoint.
- If the salon isn’t configured for booking or the service isn’t available for that store, the API will return a 4xx JSON message.
- For cross-environment testing, set `APP_URL` appropriately and include `AI_RECEPTIONIST_API_KEY` if the environment requires it.
