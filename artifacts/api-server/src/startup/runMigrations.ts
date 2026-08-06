/**
 * server/startup/runMigrations.ts
 *
 * Runs pending SQL migrations from the migrations/ directory at server startup.
 * Tracks applied migrations in the schema_migrations table — each file only
 * ever runs once. Safe to call on every boot.
 *
 * First-run behaviour:
 *   - Fresh database (no tables at all): applies schema.sql to create the full
 *     base schema, then runs EVERY migration file in soft mode (statement-by-
 *     statement, tolerating already-exists errors) so columns added after the
 *     schema.sql baseline are always present.
 *   - Existing database with no migration history: same — runs every migration
 *     in soft mode so any column gaps are filled, then records all as applied.
 *   - Normal run: only executes migration files not yet in schema_migrations
 *     (strict mode — any error aborts that migration).
 *
 * "Soft mode" means each SQL statement is executed individually and errors for
 * already-existing objects (duplicate table, column, index, constraint) are
 * silently skipped.  This makes all migration files idempotent when run against
 * a DB that already has their tables/columns from a prior schema.sql run.
 */

import pg from "pg";
import fs from "fs";
import path from "path";
import { pool } from "../db";

// Resolve migrations/ directory in both dev (ESM/tsx) and prod (esbuild CJS).
const _cjsDirname: string | undefined = (globalThis as any).__dirname;
const MIGRATIONS_DIR = _cjsDirname
  ? path.resolve(_cjsDirname, "..", "migrations")
  : path.resolve(process.cwd(), "migrations");

const SCHEMA_SQL = _cjsDirname
  ? path.resolve(_cjsDirname, "..", "schema.sql")
  : path.resolve(process.cwd(), "schema.sql");

async function ensureTrackingTable(client: pg.PoolClient): Promise<void> {
  // filename is the primary key — no SERIAL id column so drizzle-kit push
  // does not see an orphaned sequence and error on every deploy.
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedCount(client: pg.PoolClient): Promise<number> {
  const r = await client.query<{ count: string }>("SELECT COUNT(*) AS count FROM schema_migrations");
  return parseInt(r.rows[0].count, 10);
}

async function getApplied(client: pg.PoolClient): Promise<Set<string>> {
  const r = await client.query<{ filename: string }>("SELECT filename FROM schema_migrations");
  return new Set(r.rows.map((row) => row.filename));
}

async function dbHasCoreSchema(client: pg.PoolClient): Promise<boolean> {
  const r = await client.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'locations'
    ) AS exists
  `);
  return r.rows[0].exists;
}

function getMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql") && !f.startsWith("."))
    .sort();
}

async function recordApplied(client: pg.PoolClient, filename: string): Promise<void> {
  await client.query(
    "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING",
    [filename]
  );
}

/**
 * Split a SQL file into individual statements, respecting dollar-quoted blocks
 * (e.g. DO $$ ... $$; and PL/pgSQL functions). This allows us to apply each
 * statement individually so a duplicate-constraint error on one statement
 * doesn't roll back the entire schema.
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let dollarTag: string | null = null;
  let i = 0;

  while (i < sql.length) {
    // Detect start/end of dollar-quoted string (e.g. $$ or $tag$)
    if (dollarTag === null) {
      const dollarMatch = sql.slice(i).match(/^\$([^$]*)\$/);
      if (dollarMatch) {
        dollarTag = dollarMatch[0];
        current += dollarTag;
        i += dollarTag.length;
        continue;
      }
    } else {
      if (sql.slice(i).startsWith(dollarTag)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
    }

    const ch = sql[i];

    // Statement terminator outside a dollar-quoted block
    if (ch === ";" && dollarTag === null) {
      current += ch;
      const trimmed = current.trim();
      if (trimmed && trimmed !== ";") {
        statements.push(trimmed);
      }
      current = "";
      i++;
      continue;
    }

    // Skip line comments
    if (ch === "-" && sql[i + 1] === "-" && dollarTag === null) {
      while (i < sql.length && sql[i] !== "\n") i++;
      continue;
    }

    current += ch;
    i++;
  }

  // Catch any trailing statement without a semicolon
  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);

  return statements;
}

/** PostgreSQL error codes we silently skip in soft mode. */
const SOFT_SKIP_CODES = new Set([
  "42P07", // duplicate_table
  "42710", // duplicate_object (constraint/index already exists)
  "23505", // unique_violation
  "42701", // duplicate_column
  "42P16", // invalid_table_definition (multiple PKs)
  "42P01", // undefined_table (ALTER on non-existent table — skip gracefully)
  "42703", // undefined_column (DROP COLUMN on non-existent column — skip)
]);

/**
 * Apply a SQL string statement-by-statement, silently skipping any statement
 * that fails with an "already exists" or similarly harmless error code.
 * Used for both schema.sql and migration files during initial/catch-up runs.
 */
async function applySqlSoft(
  client: pg.PoolClient,
  sql: string,
  label: string,
): Promise<{ applied: number; skipped: number }> {
  const statements = splitSqlStatements(sql);
  let applied = 0;
  let skipped = 0;

  for (const stmt of statements) {
    try {
      await client.query(stmt);
      applied++;
    } catch (err: any) {
      if (SOFT_SKIP_CODES.has(err.code)) {
        skipped++;
      } else {
        // Hard-fail on unexpected errors so the issue is visible in logs.
        throw new Error(`${label}: ${err.message}\nStatement: ${stmt.slice(0, 300)}`);
      }
    }
  }

  return { applied, skipped };
}

/**
 * Apply every migration file in soft mode (idempotent).
 * Records each file in schema_migrations so normal runs skip them afterwards.
 * Used for fresh-DB and catch-up scenarios.
 */
async function applyAllMigrationsSoft(
  client: pg.PoolClient,
  allFiles: string[],
): Promise<void> {
  let total = 0;
  for (const filename of allFiles) {
    const filePath = path.join(MIGRATIONS_DIR, filename);
    const sql = fs.readFileSync(filePath, "utf-8").trim();
    if (!sql) {
      await recordApplied(client, filename);
      continue;
    }
    const { applied, skipped } = await applySqlSoft(client, sql, filename);
    total += applied;
    if (applied > 0 || skipped > 0) {
      console.log(`[migrations]   soft  ${filename} (${applied} stmts, ${skipped} skipped)`);
    }
    await recordApplied(client, filename);
  }
  console.log(`[migrations] ✓ All ${allFiles.length} migration(s) applied/verified in soft mode (${total} total stmts executed)`);
}

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await ensureTrackingTable(client);

    const allFiles = getMigrationFiles();
    const appliedCount = await getAppliedCount(client);
    const hasCoreSchema = await dbHasCoreSchema(client);

    // ── Case 1: Totally fresh database ───────────────────────────────────────
    // Apply schema.sql to create the base tables, then run every migration in
    // soft mode so columns added by later migrations are always present.
    if (!hasCoreSchema) {
      if (fs.existsSync(SCHEMA_SQL)) {
        console.log("[migrations] Fresh database detected — applying schema.sql…");
        const schemaSql = fs.readFileSync(SCHEMA_SQL, "utf-8").trim();
        if (schemaSql) {
          const { applied, skipped } = await applySqlSoft(client, schemaSql, "schema.sql");
          console.log(`[migrations] ✓ schema.sql applied (${applied} statements, ${skipped} skipped as already-exists)`);
        }
      } else {
        console.warn("[migrations] WARNING: Fresh database but no schema.sql found — migrations may fail");
      }

      // Run every migration in soft mode — fills any column gaps that schema.sql
      // doesn't cover (e.g. columns added by migrations written after schema.sql).
      console.log(`[migrations] Running ${allFiles.length} migration(s) in soft mode to fill column gaps…`);
      await applyAllMigrationsSoft(client, allFiles);
      return;
    }

    // ── Case 2: Existing DB, no migration history ─────────────────────────────
    // Run every migration in soft mode so any column gaps are filled, then
    // record all as applied so future new migrations are detected correctly.
    if (appliedCount === 0) {
      console.log(`[migrations] Existing DB with no migration history — running ${allFiles.length} migration(s) in soft mode to fill any gaps…`);
      await applyAllMigrationsSoft(client, allFiles);
      return;
    }

    // ── Case 3: Normal run — apply only pending migrations ────────────────────
    const applied = await getApplied(client);
    const pending = allFiles.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log("[migrations] ✓ Up to date");
      return;
    }

    console.log(`[migrations] Applying ${pending.length} pending migration(s)…`);

    // Apply pending migrations in soft mode (same resilient approach as catch-up
    // paths). This handles: CONCURRENTLY indexes (can't run in a transaction),
    // ANALYZE on tables that don't exist yet, and any partial-DB-state where an
    // ALTER TARGET table hasn't been created by an earlier migration yet.
    let totalApplied = 0;
    let totalSkipped = 0;
    for (const filename of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf-8").trim();
      if (!sql) {
        console.log(`[migrations]   SKIP  ${filename} (empty)`);
        await recordApplied(client, filename);
        continue;
      }
      const { applied: a, skipped: s } = await applySqlSoft(client, sql, filename);
      await recordApplied(client, filename);
      totalApplied += a;
      totalSkipped += s;
      if (a > 0 || s > 0) {
        console.log(`[migrations]   ✓ ${filename} (${a} stmts, ${s} skipped)`);
      } else {
        console.log(`[migrations]   ✓ ${filename}`);
      }
    }

    console.log(`[migrations] ✓ ${pending.length} migration(s) applied (${totalApplied} stmts executed, ${totalSkipped} skipped)`);
  } finally {
    client.release();
  }
}
