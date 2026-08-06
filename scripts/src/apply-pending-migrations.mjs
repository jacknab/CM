#!/usr/bin/env node
/**
 * apply-pending-migrations.mjs — pre-push migration applier.
 *
 * Runs BEFORE drizzle-kit push in deploy.sh. Applies every migration file
 * not yet recorded in schema_migrations, using the same idempotent
 * "soft mode" semantics as the API server's own runMigrations() startup
 * routine (server/startup/runMigrations.ts): each statement is executed
 * individually, and errors for already-existing objects (duplicate table,
 * column, index, constraint) are silently skipped.
 *
 * Why this exists: drizzle-kit push does a live schema diff against the DB.
 * If a brand-new table (defined via a raw SQL migration, e.g. blog_posts)
 * doesn't exist yet at push time, drizzle-kit heuristically treats it as an
 * ambiguous "created vs renamed from an existing table" case and throws up
 * an interactive select prompt — which hangs forever with no TTY attached
 * (deploy.sh has none, and there is no CLI flag to disable this prompt).
 *
 * By applying all pending migrations first, every migration-defined table
 * already exists by the time drizzle-kit push runs, so it sees no diff for
 * them and never asks the question — for any current or future migration,
 * not just one hardcoded table.
 *
 * Requires: DATABASE_URL env var. Exits 0 on success (including "nothing to
 * do"), 1 on any unexpected SQL error.
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
// MIGRATIONS_DIR env var lets deploy.sh pass an explicit path, avoiding any
// ambiguity when this script runs from different package locations in the
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

/**
 * Split a SQL file into individual statements, respecting dollar-quoted
 * blocks (e.g. DO $$ ... $$;) so a duplicate-object error on one statement
 * doesn't abort statements after it.
 */
function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let dollarTag = null;
  let i = 0;

  while (i < sql.length) {
    if (dollarTag === null) {
      const dollarMatch = sql.slice(i).match(/^\$([^$]*)\$/);
      if (dollarMatch) {
        dollarTag = dollarMatch[0];
        current += dollarTag;
        i += dollarTag.length;
        continue;
      }
    } else if (sql.slice(i).startsWith(dollarTag)) {
      current += dollarTag;
      i += dollarTag.length;
      dollarTag = null;
      continue;
    }

    const ch = sql[i];

    if (ch === ";" && dollarTag === null) {
      current += ch;
      const trimmed = current.trim();
      if (trimmed && trimmed !== ";") statements.push(trimmed);
      current = "";
      i++;
      continue;
    }

    if (ch === "-" && sql[i + 1] === "-" && dollarTag === null) {
      while (i < sql.length && sql[i] !== "\n") i++;
      continue;
    }

    current += ch;
    i++;
  }

  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);

  return statements;
}

/** PostgreSQL error codes we silently skip in soft mode (already-exists). */
const SOFT_SKIP_CODES = new Set([
  "42P07", // duplicate_table
  "42710", // duplicate_object (constraint/index already exists)
  "23505", // unique_violation
  "42701", // duplicate_column
  "42P16", // invalid_table_definition (multiple PKs)
  "42P01", // undefined_table (ALTER on non-existent table — skip gracefully)
  "42703", // undefined_column (DROP COLUMN on non-existent column — skip)
]);

async function applySqlSoft(client, sql, label) {
  const statements = splitSqlStatements(sql);
  let applied = 0;
  let skipped = 0;

  for (const stmt of statements) {
    try {
      await client.query(stmt);
      applied++;
    } catch (err) {
      if (SOFT_SKIP_CODES.has(err.code)) {
        skipped++;
      } else {
        throw new Error(`${label}: ${err.message}\nStatement: ${stmt.slice(0, 300)}`);
      }
    }
  }

  return { applied, skipped };
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.warn(`${YELLOW}[apply-pending-migrations] DATABASE_URL not set — skipping.${RESET}`);
  process.exit(0);
}

if (!existsSync(MIGRATIONS)) {
  console.log(`${GREEN}✓ No migrations/ directory found — nothing to apply.${RESET}`);
  process.exit(0);
}

const client = new Client({ connectionString: dbUrl });
await client.connect();

let exitCode = 0;

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  let applied = new Set();
  try {
    const r = await client.query("SELECT filename FROM schema_migrations");
    applied = new Set(r.rows.map((row) => row.filename));
  } catch {
    // Table just created — no rows yet.
  }

  const allFiles = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql") && !f.startsWith("."))
    .sort();

  const pending = allFiles.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log(`${GREEN}✓ No pending migrations — nothing to pre-apply before push.${RESET}`);
    process.exit(0);
  }

  console.log(`${CYAN}[apply-pending-migrations] Pre-applying ${pending.length} pending migration(s) in soft mode before drizzle-kit push…${RESET}`);

  for (const filename of pending) {
    const filePath = join(MIGRATIONS, filename);
    const sql = readFileSync(filePath, "utf-8").trim();
    if (!sql) {
      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING",
        [filename]
      );
      continue;
    }
    const { applied: appliedCount, skipped } = await applySqlSoft(client, sql, filename);
    console.log(`  ${GREEN}✓${RESET} ${filename} (${appliedCount} stmts, ${skipped} skipped)`);
    await client.query(
      "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING",
      [filename]
    );
  }

  console.log(`${GREEN}✓ ${pending.length} migration(s) pre-applied — drizzle-kit push will see no diff for these tables.${RESET}`);
} catch (err) {
  console.error(`\n${RED}${BOLD}✖ apply-pending-migrations FAILED: ${err.message}${RESET}\n`);
  exitCode = 1;
} finally {
  await client.end();
}

process.exit(exitCode);
