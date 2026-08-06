---
name: Stack overview
description: Certxa monorepo structure, ports, and key conventions.
---

## Monorepo layout
- `/artifacts/api-server` — Express + Drizzle ORM + PostgreSQL, port 5000
- `/artifacts/booking` — Vite/React SPA, port 3000
- `/lib/shared` — shared schema (Drizzle + Zod) and API route definitions
- `/lib/db` — database client (requires build step; pre-compiled dist not committed)

## Workflows
- `API Server` — builds (`node ./build.mjs`) then starts (`node dist/index.mjs`)
- `Booking App` — `vite --host 0.0.0.0` on port 3000

## Auth
- Session-based auth via express-session (PostgreSQL session store)
- `isAuthenticated` middleware on all protected API routes
- Custom auth, NOT Replit Auth (user explicitly uses their own)

## Database
- Drizzle ORM, schema in `lib/shared/src/schema.ts`
- Migrations via `drizzle-kit push` (not migrate)

**Why:** Future sessions need this to avoid re-discovering the layout.
