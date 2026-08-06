---
name: Deploy.sh pre-push guard scripts
description: Static/DB checks that run inside deploy.sh before drizzle-kit push, to catch config drift and the baseline-seeding trap early.
---

deploy.sh runs a series of guard scripts (in `scripts/src/*.mjs`, registered in `scripts/package.json`, invoked via `pnpm --filter @workspace/scripts run <name>`) before `drizzle-kit push`:

- `check-drizzle-filter` — validates `tablesFilter` config shape.
- `check-sequence-guard-sync` — compares `lib/db/drizzle.config.ts`'s `tablesFilter` list against deploy.sh's `excluded_tables` array (the raw-SQL sequence-fix guard list). Both lists must stay in sync; a table with a broken SERIAL sequence (no OWNED BY) needs to be in both or `drizzle-kit push` crashes.
- `check-migrations` — dry-run check of pending migrations.
- `check-migration-drift` — cross-checks migrations already marked "applied" in `schema_migrations` against the live DB schema. Missing tables = hard failure (this is the "baseline-seeding trap": a migration file was seeded as already-applied without actually running). Missing columns = warning only, since a later migration may have legitimately dropped/renamed a column.

**Why:** the baseline-seeding trap (see support-backoffice-migration.md) causes the API server to crash at runtime on first query against a table that was never actually created — better to catch it at deploy time.

**How to apply:** when adding a new migration or changing `tablesFilter`, run these checks locally before deploying. When writing new guard scripts that parse SQL migration files, remember schema-qualified names (`public.table_name`) are common — regexes for `CREATE TABLE` / `ALTER TABLE` must skip the optional `schema.` prefix or they'll misparse "public" as the table name.
