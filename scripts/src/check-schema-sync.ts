/**
 * check-schema-sync.ts
 *
 * Compares the authoritative Drizzle schema (shared/schema.ts) against the
 * drizzle-kit push schema (lib/db/drizzle/schema.ts) and reports any table /
 * column drift.  Exits with code 1 if drift is detected so it can gate
 * deploys before `drizzle-kit push` runs.
 *
 * Run via:
 *   pnpm --filter @workspace/scripts run check-schema-sync
 */

import * as sharedSchema  from "../../shared/schema.js";
import * as drizzleSchema from "../../lib/db/drizzle/schema.js";
import { isTable, getTableName } from "drizzle-orm";

// ── helpers ──────────────────────────────────────────────────────────────────

interface TableInfo {
  columns: Set<string>;
}

function extractTables(schema: Record<string, unknown>): Map<string, TableInfo> {
  const map = new Map<string, TableInfo>();
  for (const val of Object.values(schema)) {
    if (!isTable(val)) continue;
    const tableName = getTableName(val);
    const cols = (val as any)._?.columns as Record<string, unknown> | undefined;
    map.set(tableName, {
      columns: new Set(cols ? Object.keys(cols) : []),
    });
  }
  return map;
}

// ── main ─────────────────────────────────────────────────────────────────────

const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN  = "\x1b[32m";
const BOLD   = "\x1b[1m";
const RESET  = "\x1b[0m";

const shared  = extractTables(sharedSchema  as Record<string, unknown>);
const drizzle = extractTables(drizzleSchema as Record<string, unknown>);

let driftFound = false;

// ── 1. Columns in shared but missing from drizzle-kit schema ─────────────────
//    (drizzle-kit push will try to DROP these from the live DB)
for (const [table, info] of shared) {
  const dk = drizzle.get(table);
  if (!dk) continue; // table not in drizzle schema at all — skip (may be intentional)

  const missing = [...info.columns].filter(col => !dk.columns.has(col));
  if (missing.length > 0) {
    driftFound = true;
    console.error(
      `${RED}${BOLD}[schema-sync] DRIFT — table "${table}" has columns in shared/schema.ts` +
      ` that are MISSING from lib/db/drizzle/schema.ts:${RESET}`
    );
    for (const col of missing) {
      console.error(`  ${YELLOW}  - ${col}${RESET}  ← drizzle-kit push will DROP this from the DB`);
    }
  }
}

// ── 2. Tables in shared but entirely absent from drizzle-kit schema ──────────
for (const table of shared.keys()) {
  if (!drizzle.has(table)) {
    // Only warn — some shared tables may intentionally not be in the drizzle-kit schema
    console.warn(
      `${YELLOW}[schema-sync] WARN — table "${table}" is in shared/schema.ts` +
      ` but not in lib/db/drizzle/schema.ts (drizzle-kit push won't manage it)${RESET}`
    );
  }
}

// ── 3. Columns in drizzle-kit schema but absent from shared schema ───────────
//    (drizzle-kit push will try to ADD these — usually fine, but worth flagging)
for (const [table, info] of drizzle) {
  const sh = shared.get(table);
  if (!sh) continue;

  const extra = [...info.columns].filter(col => !sh.columns.has(col));
  if (extra.length > 0) {
    // This direction is safe (adds columns) but still a code smell
    console.warn(
      `${YELLOW}[schema-sync] WARN — table "${table}" has columns in lib/db/drizzle/schema.ts` +
      ` not in shared/schema.ts (these will be added by push):${RESET}`
    );
    for (const col of extra) {
      console.warn(`    + ${col}`);
    }
  }
}

if (driftFound) {
  console.error(
    `\n${RED}${BOLD}Schema sync check FAILED.${RESET}\n` +
    `Add the missing column(s) to lib/db/drizzle/schema.ts before running drizzle-kit push.\n` +
    `See artifacts/api-server/migrations/ for the migration that introduced the column.\n`
  );
  process.exit(1);
} else {
  console.log(
    `${GREEN}[schema-sync] ✓ shared/schema.ts and lib/db/drizzle/schema.ts are in sync.${RESET}`
  );
}
