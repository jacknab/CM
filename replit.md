# Certxa

A service-business SaaS platform targeting nail salons and service professionals. Covers online booking, front desk, POS, loyalty rewards, self-service kiosk check-in, waitlist, AI receptionist, contractor payroll, and a support back-office.

## Run & Operate

The **"Start application"** workflow is the primary entry point — it runs both the API and the booking frontend:

| Workflow | Port | URL |
|---|---|---|
| Start application (booking app + API) | 5000 (Vite) / 9200 (API) | Main preview pane |
| Support Back Office | 3001 | Port 3001 |
| Certxa POS (Web) | 8083 | Port 8083 |
| Staff Mobile (Expo) | 8082 | Tunnel QR code (mobile only) |
| Mockup Sandbox | 8080 | Port 8080 |

Individual commands:
- `pnpm --filter @workspace/booking run dev` — booking frontend on port 5000
- `pnpm --filter @workspace/api-server run dev` — API server on port 9200
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

Env vars already configured (shared):
- `NODE_ENV=development`, `API_PROXY_TARGET=http://localhost:9200`, `CORS_ALLOW_ALL=true`
- `TRIAL_PERIOD_DAYS=60`, `ADMIN_DB_HEALTH_KEY=certxa-db-health-2025`
- `MAILGUN_DOMAIN=mg.certxa.com`, `MAILGUN_FROM_EMAIL=noreply@mg.certxa.com`
- `SUPPORT_EMAIL_USER=support@certxa.com`

Secrets configured:
- `SESSION_SECRET` — set ✅

## Template Master — Booking Integration

The `template_master/` project is the public-facing salon website template. The booking engine is **natively embedded** — no iframe, no redirect.

**How it works:**
- `BookingPanelContext` carries `preSelectedServiceId` and exposes `openWithService(id)`
- Service cards call `openWithService(service.id)` → panel slides open with that service pre-selected
- `BookingPanel.tsx` renders `BookingFlow.tsx` (not an iframe)
- `BookingFlow.tsx` is the full booking engine ported from `artifacts/booking/src/pages/public-booking/MobileTheme.tsx`
- All API calls are identical: `/api/public/store/:slug/services`, `/availability`, `/book`, payment intents, etc.
- Build: `cd template_master && npm run build` (separate npm project, not pnpm workspace)
- Dependencies added: `@tanstack/react-query`, `date-fns-tz`, `@stripe/stripe-js`, `@stripe/react-stripe-js`

**One source of truth rule:** If booking logic changes in `MobileTheme.tsx`, the same change must be applied to `template_master/src/components/BookingFlow.tsx`.

## Stack

- pnpm workspaces, Node.js 20, TypeScript 5.9
- Frontend: React 19 + react-router-dom v6, Tailwind v4, Vite 7
- API: Express 5
- DB: PostgreSQL 16 (Replit built-in) + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Build: esbuild (CJS bundle)
- Mobile: Expo SDK 56 + Expo Router 4

## Where things live

- `artifacts/booking/src/` — main booking app source
- `artifacts/booking/src/pages/` — all page components
- `artifacts/booking/src/components/` — shared UI components and layout
- `artifacts/api-server/` — Express API backend
- `artifacts/api-server/routes/` — API route handlers
- `artifacts/api-server/lib/` — shared server-side libs (mail, stripe, r2, etc.)
- `artifacts/api-server/migrations/` — numbered SQL migrations (applied automatically at startup)
- `shared/` — shared schema, permissions, routes, auth models (`@workspace/shared`)
- `apps/support-backoffice/` — support team dashboard (React + Vite, port 3001)
- `apps/staff-mobile/` — Staff mobile app (Expo, requires device/tunnel)
- `apps/certxa-pos/` — POS tablet app (Expo web mode, port 8083)

## Optional services (disabled until secrets are set)

| Service | Secret(s) needed | Feature unlocked |
|---|---|---|
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` | Subscriptions, billing, Connect payments |
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | SMS reminders, AI voice receptionist |
| OpenAI | `OPENAI_API_KEY` | AI receptionist, support agent |
| Mailgun | `MAILGUN_API_KEY` | Transactional emails |
| R2/Cloudflare | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | File/image uploads |
| Google OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Business Profile sync |

See `.env.example` for the full list.

## Architecture decisions

- `shared/` is a proper pnpm workspace package (`@workspace/shared`) so drizzle-orm/drizzle-zod resolve correctly when Vite processes shared files
- `@shared` alias in vite.config.ts and tsconfig.json paths points to `../../shared`
- `@` alias points to `./src` within the booking artifact
- All Launchsite/Launchit! code was stripped completely — booking app is purely Certxa-branded
- API server runs on port 9200; booking Vite dev server runs on port 5000 and proxies `/api`, `/uploads`, `/ws`, `/media-stream` to 9200

## Replit Setup Status (verified 2026-07-26)

| Component | Status | Notes |
|---|---|---|
| Main app (booking + API) | ✅ Running | Port 5000 (prod build) / 9200 (API) |
| Database | ✅ Connected | Replit built-in PostgreSQL 16, auto-provisioned |
| Migrations | ✅ Applied | All migrations applied in soft mode at startup |
| Redis | ✅ Running | Local Redis on port 6379 |
| SESSION_SECRET | ✅ Set | Required for auth session cookies |
| Staff Mobile (Expo) | ✅ Running | Metro on port 8082 (LAN mode; set NGROK_AUTHTOKEN for tunnel) |
| Certxa POS (Expo web) | ✅ Running | Port 8083; metro.config.js blocks debugger-frontend to avoid ENOSPC |
| Support Back Office | ⚠️ Platform issue | Vite starts fine on port 3001 (curl confirmed); Replit's port-detection times out — platform-side forwarding issue |
| Stripe | ⚠️ Not configured | Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` |
| Twilio | ⚠️ Not configured | Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` |
| OpenAI | ⚠️ Not configured | Set `OPENAI_API_KEY` |
| Mailgun | ⚠️ Not configured | Set `MAILGUN_API_KEY` |
| Cloudflare R2 | ⚠️ Not configured | Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` |

## Database

Replit's built-in PostgreSQL 16 is configured automatically (no manual `DATABASE_URL` needed).
87 numbered migrations in `artifacts/api-server/migrations/` run automatically at API startup in **soft mode** (idempotent — skips already-applied statements).

## Product

- Service-business SaaS platform (Certxa) targeting salon/service pros
- Features: bookings, front desk, POS, loyalty rewards, check-in, waitlist, AI receptionist, contractor payouts, subscription/billing, support back-office, live chat
- Multi-tenant: each salon owner has their own `store`; staff log in separately

## User preferences

- Strip all Launchsite/Launchit! code completely — no references should remain
- Merge two apps into one pnpm workspace; first app is the booking/salon management frontend

## Business & Legal Rules

- **Data retention — payroll/earnings:** Account data (appointments, payroll, staff earnings, invoices, payments) must NEVER be deleted for any reason — including suspension or cancellation — until February 1st of the following calendar year. This is a tax/legal compliance requirement. Suspension and cancellation must only gate *access*, never delete rows.

## Gotchas

- `shared/` must remain in pnpm-workspace.yaml packages list so drizzle-orm resolves correctly
- react-leaflet has peer dep warnings (wants React 18, workspace has 19) — acceptable, ignore
- API server runs on port 9200; booking app (Vite dev) runs on port 5000 and proxies /api/* to 9200
- API server workflow must be running for auth endpoints to work (otherwise 502s on login)
- Staff Mobile (`apps/staff-mobile`): `typedRoutes` must stay `false` in `app.json` — expo-router 4.0.22 does not export `internal/routing`, which crashes the Expo CLI type-generation step when `typedRoutes: true`
- DB migrations are applied in **soft mode** at startup — new columns added to `shared/schema.ts` need a corresponding numbered migration file in `artifacts/api-server/migrations/` or Drizzle explicit SELECTs will crash in production
- Replit's built-in PostgreSQL module provides `DATABASE_URL` automatically — do not overwrite it

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
