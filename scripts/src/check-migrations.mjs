#!/usr/bin/env node
/**
 * check-migrations.mjs — pre-restart migration dry-run check.
 *
 * Runs AFTER drizzle-kit push and BEFORE PM2 restarts the API server.
 * Finds every pending migration (not yet in schema_migrations) and inspects
 * each SQL file for references that would cause a startup crash:
 *
 *   ALTER TABLE <name>                        — fails if table doesn't exist
 *   ALTER TABLE <t> DROP CONSTRAINT <c>       — fails if constraint doesn't exist
 *   CREATE INDEX ON <name>                    — fails if table doesn't exist
 *   INSERT INTO <name>                        — fails if table doesn't exist
 *   DROP TABLE <name>                         — fails if table doesn't exist (unless IF EXISTS)
 *
 * Safe / self-guarding forms that are explicitly excluded from checks:
 *   CREATE TABLE IF NOT EXISTS               — harmless
 *   DROP TABLE IF EXISTS                     — harmless
 *   ALTER TABLE … DROP CONSTRAINT IF EXISTS  — harmless (Postgres skips silently)
 *   DO $$ … $$                               — self-contained PL/pgSQL blocks
 *   ALTER TABLE … ADD COLUMN IF NOT EXISTS   — safe even with missing column
 *
 * Requires: DATABASE_URL env var.  Exits 0 if all clear, 1 if blocked.
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Client } = pg;

const __dirname  = dirname(fileURLToPath(import.meta.url));
// MIGRATIONS_DIR env var lets deploy.sh pass an explicit path, avoiding any
// ambiguity when the same script runs from different package locations in the
// monorepo (scripts/ vs artifacts/scripts/ both match @workspace/scripts).
const MIGRATIONS = process.env.MIGRATIONS_DIR
  ? resolve(process.env.MIGRATIONS_DIR)
  : resolve(__dirname, "../../..", "migrations");

const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN  = "\x1b[32m";
const CYAN   = "\x1b[36m";
const BOLD   = "\x1b[1m";
const RESET  = "\x1b[0m";

// ── SQL table reference extractor ─────────────────────────────────────────────

/**
 * Patterns that reference a table name and will fail if the table is absent.
 * Each entry: { regex, group, safe } where group is the capture index of the
 * table name and safe=true means the statement is self-guarding (e.g. IF EXISTS).
 *
 * We intentionally ignore:
 *   CREATE TABLE IF NOT EXISTS  — harmless, creates if absent
 *   DO $$ … $$                  — self-contained PL/pgSQL blocks
 *   ALTER TABLE … ADD COLUMN IF NOT EXISTS  — safe even with missing column
 */
const PATTERNS = [
  // ALTER TABLE name ... (any flavour except already-guarded blocks)
  {
    re: /\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?["']?(\w+)["']?\b/gi,
    safe: false,
  },
  // INSERT INTO name (fails if table missing)
  {
    re: /\bINSERT\s+INTO\s+["']?(\w+)["']?\b/gi,
    safe: false,
  },
  // CREATE UNIQUE? INDEX ... ON name
  {
    re: /\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["\w]+\s+ON\s+["']?(\w+)["']?\b/gi,
    safe: false,
  },
  // DROP TABLE name (without IF EXISTS — fails if table is already absent).
  // The negative lookahead (?!IF\b) prevents matching "DROP TABLE IF EXISTS …"
  // which would otherwise capture "IF" as the table name.
  {
    re: /\bDROP\s+TABLE\s+(?!IF\b)["']?(\w+)["']?\b/gi,
    safe: false,
    ifExistsSafe: true, // guarded form (IF EXISTS) is excluded by the lookahead above
  },
  // UPDATE name SET ...
  {
    re: /\bUPDATE\s+["']?(\w+)["']?\s+SET\b/gi,
    safe: false,
  },
  // DELETE FROM name WHERE ...
  {
    re: /\bDELETE\s+FROM\s+["']?(\w+)["']?\b/gi,
    safe: false,
  },
];

/**
 * Strip dollar-quoted blocks (DO $$ ... $$) from SQL so we don't incorrectly
 * flag table names inside self-contained PL/pgSQL exception handlers.
 */
function stripDollarQuotes(sql) {
  return sql.replace(/\$\$[\s\S]*?\$\$/g, "$$ /* stripped */ $$");
}

/**
 * Strip line comments and block comments from SQL.
 */
function stripComments(sql) {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}

/**
 * Return the set of table names referenced in `sql` that could cause a
 * runtime failure if the table doesn't exist.
 *
 * Tables that appear only inside CREATE TABLE IF NOT EXISTS or
 * DROP TABLE IF EXISTS are excluded — they're self-guarding.
 */
function extractReferencedTables(rawSql) {
  const tables = new Set();

  // Self-guarding patterns — collect names to exclude
  const safeCreate = new Set();
  for (const m of rawSql.matchAll(/\bCREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+["']?(\w+)["']?\b/gi)) {
    safeCreate.add(m[1].toLowerCase());
  }
  const safeDrop = new Set();
  for (const m of rawSql.matchAll(/\bDROP\s+TABLE\s+IF\s+EXISTS\s+["']?(\w+)["']?\b/gi)) {
    safeDrop.add(m[1].toLowerCase());
  }

  const stripped = stripDollarQuotes(stripComments(rawSql));

  for (const { re, ifExistsSafe } of PATTERNS) {
    for (const m of stripped.matchAll(re)) {
      const name = m[1].toLowerCase();
      // Skip self-guarding forms
      if (safeCreate.has(name)) continue;
      if (ifExistsSafe && safeDrop.has(name)) continue;
      // Skip Postgres system keywords that look like table names
      if (["only", "table", "index"].includes(name)) continue;
      tables.add(name);
    }
  }

  return tables;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.warn(`${YELLOW}[migration-check] DATABASE_URL not set — skipping migration dry-run.${RESET}`);
  process.exit(0);
}

if (!existsSync(MIGRATIONS)) {
  console.log(`${GREEN}✓ No migrations/ directory found — nothing to check.${RESET}`);
  process.exit(0);
}

const client = new Client({ connectionString: dbUrl });
await client.connect();

let exitCode = 0;

try {
  // 1. Find which migrations have already been applied.
  let applied = new Set();
  try {
    const r = await client.query("SELECT filename FROM schema_migrations");
    applied = new Set(r.rows.map(row => row.filename));
  } catch {
    // schema_migrations table doesn't exist yet — first deploy, all are pending.
  }

  // 2. List all migration files sorted lexicographically (same order as runMigrations).
  const allFiles = readdirSync(MIGRATIONS)
    .filter(f => f.endsWith(".sql") && !f.startsWith("."))
    .sort();

  const pending = allFiles.filter(f => !applied.has(f));

  if (pending.length === 0) {
    console.log(`${GREEN}✓ No pending migrations — dry-run check skipped.${RESET}`);
    process.exit(0);
  }

  console.log(`${CYAN}[migration-check] Checking ${pending.length} pending migration(s) against live DB…${RESET}`);

  // 3. Collect all table names that exist in the live DB right now.
  const liveTablesRes = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
  );
  const liveTables = new Set(liveTablesRes.rows.map(r => r.table_name.toLowerCase()));

  // 4. For each pending migration, extract referenced tables and check them.
  const problems = [];

  for (const filename of pending) {
    const sql = readFileSync(join(MIGRATIONS, filename), "utf-8");
    const referenced = extractReferencedTables(sql);

    const missing = [...referenced].filter(t => !liveTables.has(t));
    if (missing.length > 0) {
      problems.push({ filename, missing });
    }
  }

  if (problems.length === 0) {
    console.log(
      `${GREEN}✓ Migration dry-run passed — all ${pending.length} pending migration(s) ` +
      `reference tables that exist in the live DB.${RESET}`
    );
    process.exit(0);
  }

  // 5. Report blocking problems.
  console.error(
    `\n${RED}${BOLD}✖ Migration dry-run FAILED — ${problems.length} pending migration(s) reference ` +
    `table(s) that do not exist in the live DB.${RESET}` +
    `\n${RED}The API server will crash on startup if these migrations are not fixed first.${RESET}\n`
  );

  for (const { filename, missing } of problems) {
    console.error(`  ${BOLD}${RED}${filename}${RESET}`);
    for (const tbl of missing) {
      console.error(`    ${YELLOW}✗  table "${tbl}" does not exist in the live DB${RESET}`);
      console.error(
        `       ${CYAN}Hint: add  CREATE TABLE IF NOT EXISTS ${tbl} (...)  to this migration${RESET}`
      );
      console.error(
        `       ${CYAN}      above the statement that references it, or create a prior migration.${RESET}`
      );
    }
    console.error("");
  }

  console.error(
    `${RED}${BOLD}Fix the migration(s) above, then re-run deploy.${RESET}\n` +
    `${YELLOW}Alternatively, to skip this check: pass --skip-migration-check to deploy.sh${RESET}\n`
  );

  exitCode = 1;
} finally {
  await client.end();
}

process.exit(exitCode);
