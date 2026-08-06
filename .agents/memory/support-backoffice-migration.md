---
name: Support back-office migration baseline trap
description: How migration 0031 was silently skipped on Replit and what was fixed in 0032.
---

## The rule
When the migration runner first runs on an existing DB (locations table exists, schema_migrations empty), it records ALL current migration files as "applied" without running them. Any file added to migrations/ BEFORE that first run will never be executed.

**Why:** This is "Case 2" in `runMigrations.ts` — it seeds all files as baseline so already-provisioned databases don't re-run old migrations. But if a file exists in migrations/ at that moment, it gets skipped too.

**How to apply:** If you add a new migration file and `[migrations] ✓ Up to date` appears in the log but the tables don't exist, the file was baseline-seeded without running. Fix: apply the SQL manually via `psql "$DATABASE_URL" -f migrations/XXXX.sql`, then record it as applied in schema_migrations.

## What was applied manually (0031 + 0032 fixes)

Migration 0031 created the core support tables but was missing several columns the API code expects. Migration 0032 (`migrations/0032_support_schema_fixes.sql`) adds all the gaps:

- `support_notes.agent_name` (TEXT NOT NULL DEFAULT '') — INSERT uses this column
- `support_agent_activity.details` (TEXT) — activity query uses `sa.details`
- `support_account_tags`: renamed `created_by` → `created_by_agent_id`; added UNIQUE(account_id, tag) needed by ON CONFLICT clause
- `support_tickets`: added `account_name`, `assigned_agent_name`, `category`, `subcategory`, `last_response_at`, `first_response_at`
- Created `support_ticket_messages` table (used by ticket detail + reply routes)

## seedDefaultAgent upsert fix
`seedDefaultAgent()` in `support.ts` was changed from INSERT-if-empty to UPSERT (ON CONFLICT DO UPDATE SET password_hash). This ensures the correct bcrypt hash of `support2024!` is always set on server start, overriding any stale hash from the migration seed.

## Support back-office login credentials
- Email: `admin@certxa.com`
- Password: `support2024!`
- Role: `admin`
- The password is re-hashed and upserted every time the API server starts.
