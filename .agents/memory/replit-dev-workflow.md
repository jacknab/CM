---
name: Replit dev workflow
description: How the dev environment is wired on Replit — two-process startup, schema gaps that needed fixing.
---

# Replit dev workflow

## How it runs
- `scripts/dev-start.sh` starts both processes in parallel:
  - API server: `PORT=9200 pnpm --filter @workspace/api-server run dev`
  - Vite frontend: `PORT=5000 API_PROXY_TARGET=http://localhost:9200 pnpm --filter @workspace/booking run dev`
- The "Start application" workflow runs `bash scripts/dev-start.sh` and waits for port 5000.
- Vite proxies `/api`, `/uploads`, `/ws`, `/media-stream` to the API server at 9200.

**Why:** The API server's dev mode proxies non-API routes to a Vite dev server. They can't both be on port 5000 — Vite must run on 5000 (Replit webview) and the API server on 9200.

## Schema gaps fixed during Replit migration
When the fresh DB was initialized from `schema.sql`, several newer tables/columns were missing because they were added after schema.sql was written. The Drizzle migration system marked all migrations as "baseline" (already applied) on first boot, so they were skipped. These were applied manually:

- `account_type` column on `users` (migration 0014)
- `auto_engage_enabled` on `sms_settings` (migration 0015)
- `website_builder_token`, `website_builder_secret` on `locations` (migration 0016)
- `wb_templates` and `wb_websites` tables (website builder — created via raw SQL)
- `ai_call_log` table (AI receptionist call logging — created via raw SQL)
- `call_usage_records` table (AI usage metering — created via raw SQL)
- `salon_usage_limits` table (created via raw SQL)

**How to apply:** If DB is re-created, run `pnpm --filter @workspace/db run push-force` but it is interactive. Instead use `psql $DATABASE_URL -f migrations/<file>.sql` for each migration, or apply the raw SQL CREATE TABLE statements directly.

## Environment variables
- `DATABASE_URL`, `SESSION_SECRET`, `REPLIT_DEV_DOMAIN`, `REPL_ID` are auto-provided by Replit.
- `APP_URL` in `.replit` development env must match `REPLIT_DEV_DOMAIN` (auto-set by server on startup if missing).
- `API_PROXY_TARGET` is set to `http://localhost:9200` in the dev-start.sh script (not in .replit env — the .replit env has a stale value pointing to 8080).
- Optional integrations (Stripe, Twilio, Mailgun, Google OAuth) need user-provided secrets via Replit Secrets UI.

## Workflow startup limitation
The current production-mode `Start application` workflow can log that Express is serving on port 5000 and still be marked failed by the workflow supervisor during its long database/bootstrap phase; repeated restarts do not fix that detection timeout.

**Why:** The API performs extensive startup migrations and scheduler initialization before the supervisor considers the web preview ready, and the supervisor may tear down the process after its wait window even though the server reached the configured port.

**How to apply:** Verify the latest workflow log and local port state before changing application code or retrying restarts. Treat a clean `serving on port 5000` log with no crash as an environment/startup-supervisor issue.
