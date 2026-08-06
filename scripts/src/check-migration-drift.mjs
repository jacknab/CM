#!/usr/bin/env node
/**
 * check-migration-drift.mjs — post-push migration integrity check.
 *
 * Detects "baseline-seeding drift": a migration file recorded as applied in
 * schema_migrations, whose CREATE TABLE / ADD COLUMN statements do NOT
 * actually exist in the live DB.
 *
 * Background: runMigrations.ts has a first-run path that seeds ALL current
 * migration files into schema_migrations as "applied" without necessarily
 * having run every statement successfully in every historical case (e.g. an
 * existing DB whose baseline predates a given migration file, or a migration
 * that partially failed and was still recorded). When this happens the API
 * server crashes at runtime with "column does not exist" / "relation does
 * not exist" — see .agents/memory/support-backoffice-migration.md and
 * .agents/memory/missing-db-columns.md for real incidents.
 *
 * This script re-derives what each *applied* migration should have created
 * and cross-checks it against information_schema, so drift is caught in CI /
 * deploy.sh instead of at server-startup crash time.
 *
 * Severity:
 *   - Missing TABLE  -> hard failure (exit 1). A missing table means every
 *     query against it will crash the server.
 *   - Missing COLUMN -> warning only (exit 0). Columns are sometimes
 *     legitimately dropped or renamed by a later migration, so this alone
 *     is not proof of drift — surfaced for a human to sanity-check.
 *
 * Requires: DATABASE_URL env var. Read-only — makes no writes.
 *
 * Environment variables (all optional, sensible defaults used):
 *   MIGRATIONS_DIR — migrations directory (default: 3 levels up + /migrations)
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = process.env.MIGRATIONS_DIR
  ? resolve(process.env.MIGRATIONS_DIR)
  : resolve(__dirname, "../../..", "migrations");

const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN  = "\x1b[32m";
const CYAN   = "\x1b[36m";
const BOLD   = "\x1b[1m";
const RESET  = "\x1b[0m";

function stripDollarQuotes(sql) {
  return sql.replace(/\$\$[\s\S]*?\$\$/g, "$$ /* stripped */ $$");
}

function stripComments(sql) {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}

/**
 * Extract { tables: Set<string>, columns: Map<table, Set<column>> } that a
 * migration file's own statements assert should exist. Only CREATE TABLE and
 * ALTER TABLE ... ADD COLUMN are considered — these are the only statement
 * types that make a durable "this must exist afterwards" claim.
 */
function extractExpectedSchema(rawSql) {
  const stripped = stripDollarQuotes(stripComments(rawSql));

  const tables = new Set();
  for (const m of stripped.matchAll(
    /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["']?\w+["']?\.)?["']?(\w+)["']?/gi
  )) {
    tables.add(m[1].toLowerCase());
  }

  const columns = new Map();
  // Capture each ALTER TABLE statement body up to its terminating semicolon.
  // The optional (?:schema\.)? group handles schema-qualified names like
  // "public.billing_plans" so "public" is never mistaken for the table name.
  for (const m of stripped.matchAll(
    /\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:["']?\w+["']?\.)?["']?(\w+)["']?([^;]*);/gi
  )) {
    const table = m[1].toLowerCase();
    const body = m[2];
    for (const cm of body.matchAll(
      /\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?/gi
    )) {
      const col = cm[1].toLowerCase();
      if (!columns.has(table)) columns.set(table, new Set());
      columns.get(table).add(col);
    }
  }

  return { tables, columns };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.warn(`${YELLOW}[migration-drift] DATABASE_URL not set — skipping.${RESET}`);
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
  let applied = new Set();
  try {
    const r = await client.query("SELECT filename FROM schema_migrations");
    applied = new Set(r.rows.map(row => row.filename));
  } catch {
    console.log(`${GREEN}✓ schema_migrations table doesn't exist yet — nothing applied, nothing to drift-check.${RESET}`);
    process.exit(0);
  }

  if (applied.size === 0) {
    console.log(`${GREEN}✓ No migrations recorded as applied — nothing to drift-check.${RESET}`);
    process.exit(0);
  }

  const allFiles = readdirSync(MIGRATIONS)
    .filter(f => f.endsWith(".sql") && !f.startsWith("."))
    .sort();
  const appliedFiles = allFiles.filter(f => applied.has(f));

  const liveTablesRes = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
  );
  const liveTables = new Set(liveTablesRes.rows.map(r => r.table_name.toLowerCase()));

  const liveColumnsRes = await client.query(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = 'public'`
  );
  const liveColumns = new Map();
  for (const row of liveColumnsRes.rows) {
    const t = row.table_name.toLowerCase();
    if (!liveColumns.has(t)) liveColumns.set(t, new Set());
    liveColumns.get(t).add(row.column_name.toLowerCase());
  }

  // ── Columns intentionally removed by later migrations ────────────────────
  // A migration may ADD COLUMN for a column that was subsequently dropped by
  // a later migration (e.g. 0079_drop_staff_password.sql drops staff.password
  // which was added much earlier). These are not drift — suppress the warning.
  // Format: "table:column" in lowercase.
  const KNOWN_DROPPED_COLUMNS = new Set([
    // Dropped by 0079_drop_staff_password.sql — staff no longer authenticate
    // with a password column; login is handled via invite/token flow.
    "staff:password",
    // password_changed tracked whether staff had reset their initial password.
    // Obsolete now that the password column itself was dropped; not in the
    // Drizzle schema so drizzle-kit push removes it on every deploy.
    "staff:password_changed",
    // website_builder_token / website_builder_secret removed from the Drizzle
    // schema (locations table) — drizzle-kit push dropped them as orphaned.
    "locations:website_builder_token",
    "locations:website_builder_secret",
    // air_minutes removed from locations after the AI-receptionist billing
    // model was replaced with smsAllowance/platformCredits.
    "locations:air_minutes",
    // Training-sandbox columns added by 0011_vps_schema_sync.sql but never
    // added to the Drizzle TypeScript schema — drizzle-kit push drops them on
    // every deploy. The training-sandbox feature is migration-only.
    "locations:is_training_sandbox",
    "locations:sandbox_parent_store_id",
  ]);

  // ── Tables intentionally removed by later migrations ──────────────────────
  // Format: "table" in lowercase.
  const KNOWN_DROPPED_TABLES = new Set([
    // Dropped by 0082_drop_training_tables.sql (training feature retired)
    "training_action_categories",
    "training_action_steps",
    "training_user_state",
    "training_events",
    "training_user_profile",
    "training_settings",
  ]);

  const tableDrift = [];
  const columnDrift = [];

  for (const filename of appliedFiles) {
    const sql = readFileSync(join(MIGRATIONS, filename), "utf-8");
    const { tables, columns } = extractExpectedSchema(sql);

    const missingTables = [...tables].filter(
      t => !liveTables.has(t) && !KNOWN_DROPPED_TABLES.has(t)
    );
    if (missingTables.length > 0) {
      tableDrift.push({ filename, missing: missingTables });
    }

    for (const [table, cols] of columns) {
      // If the table itself is missing we already reported it above — skip
      // redundant column noise for that case.
      if (!liveTables.has(table)) continue;
      const existingCols = liveColumns.get(table) || new Set();
      const missingCols = [...cols].filter(c =>
        !existingCols.has(c) && !KNOWN_DROPPED_COLUMNS.has(`${table}:${c}`)
      );
      if (missingCols.length > 0) {
        columnDrift.push({ filename, table, missing: missingCols });
      }
    }
  }

  if (tableDrift.length === 0 && columnDrift.length === 0) {
    console.log(
      `${GREEN}✓ Migration drift check passed — all ${appliedFiles.length} applied migration(s) ` +
      `match the live DB schema.${RESET}`
    );
    process.exit(0);
  }

  if (tableDrift.length > 0) {
    console.error(
      `\n${RED}${BOLD}✖ Migration drift FAILED — ${tableDrift.length} migration(s) recorded as ` +
      `applied are missing table(s) they should have created.${RESET}\n` +
      `${RED}This is the "baseline-seeding trap": schema_migrations says the file ran, but it ` +
      `didn't (or was skipped as a pre-existing baseline). The API server will crash on any ` +
      `query against these tables.${RESET}\n`
    );
    for (const { filename, missing } of tableDrift) {
      console.error(`  ${BOLD}${RED}${filename}${RESET}`);
      for (const tbl of missing) {
        console.error(`    ${YELLOW}✗  table "${tbl}" does not exist in the live DB${RESET}`);
      }
    }
    console.error(
      `\n${CYAN}Fix: apply the missing SQL manually, e.g.:${RESET}\n` +
      `  ${CYAN}psql "$DATABASE_URL" -f migrations/<file>.sql${RESET}\n`
    );
    exitCode = 1;
  }

  if (columnDrift.length > 0) {
    console.warn(
      `\n${YELLOW}${BOLD}⚠ Migration drift WARNING — ${columnDrift.length} applied migration(s) ` +
      `reference column(s) that don't currently exist.${RESET}\n` +
      `${YELLOW}This is the baseline-seeding trap: schema_migrations says the file ran but the ` +
      `ALTER TABLE did not execute. deploy.sh will auto-repair by re-applying the listed ` +
      `migration(s) (all use IF NOT EXISTS so re-applying is safe).${RESET}\n`
    );
    for (const { filename, table, missing } of columnDrift) {
      console.warn(`  ${BOLD}${YELLOW}${filename}${RESET} (table: ${table})`);
      for (const col of missing) {
        console.warn(`    ${YELLOW}?  column "${col}" not found on "${table}"${RESET}`);
      }
    }
    console.warn("");
    // Exit 2 (not 1) so deploy.sh distinguishes column drift (auto-repairable)
    // from table drift (hard failure). Both trigger the auto-repair block;
    // exit 1 is reserved for missing tables which will crash the server.
    if (exitCode === 0) exitCode = 2;
  }
} finally {
  await client.end();
}

process.exit(exitCode);
