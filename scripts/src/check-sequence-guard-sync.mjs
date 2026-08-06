#!/usr/bin/env node
/**
 * check-sequence-guard-sync.mjs — static pre-push safety check.
 *
 * Cross-checks the `tablesFilter` list in lib/db/drizzle.config.cjs against the
 * `excluded_tables` array in deploy.sh's SERIAL-sequence crash guard.
 *
 * Background: any table excluded from drizzle-kit via "!<table>" in
 * tablesFilter is also skipped by drizzle-kit's own diffing, so if that table
 * has a SERIAL column, drizzle-kit will still try to DROP the now-"orphaned"
 * sequence and crash with:
 *   "cannot drop sequence X because other objects depend on it"
 * deploy.sh works around this by converting SERIAL -> GENERATED ALWAYS AS
 * IDENTITY for every table listed in its own `excluded_tables` array — but
 * that array is maintained separately from tablesFilter, so it's easy to add
 * a table to one and forget the other.
 *
 * This script fails the build if the two lists ever drift apart, so the
 * mismatch is caught before deploy.sh runs, not during it.
 *
 * Pure static analysis — no database connection required.
 *
 * Environment variables (all optional, sensible defaults used):
 *   APP_DIR          — workspace root (default: 3 levels up from this file)
 *   DRIZZLE_CONFIG   — drizzle.config.cjs path (default: $APP_DIR/lib/db/drizzle.config.cjs)
 *   DEPLOY_SCRIPT    — deploy.sh path (default: $APP_DIR/deploy.sh)
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const APP_DIR = process.env.APP_DIR
  ? resolve(process.env.APP_DIR)
  : resolve(__dirname, "../../..");

const DRIZZLE_CFG = process.env.DRIZZLE_CONFIG
  ? resolve(process.env.DRIZZLE_CONFIG)
  : resolve(APP_DIR, "lib/db/drizzle.config.cjs");

const DEPLOY_SCRIPT = process.env.DEPLOY_SCRIPT
  ? resolve(process.env.DEPLOY_SCRIPT)
  : resolve(APP_DIR, "deploy.sh");

const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN  = "\x1b[32m";
const CYAN   = "\x1b[36m";
const BOLD   = "\x1b[1m";
const RESET  = "\x1b[0m";

// ── 1. Extract "!table_name" entries from drizzle.config.cjs tablesFilter ──────

function getTablesFilterEntries() {
  if (!existsSync(DRIZZLE_CFG)) {
    console.error(`${RED}drizzle.config.cjs not found at ${DRIZZLE_CFG}${RESET}`);
    process.exit(1);
  }
  const content = readFileSync(DRIZZLE_CFG, "utf-8");
  const tables = new Set();
  for (const m of content.matchAll(/["']!([a-z_][a-z0-9_]*)["']/g)) {
    tables.add(m[1].toLowerCase());
  }
  return tables;
}

// ── 2. Extract entries from deploy.sh's excluded_tables ARRAY[...] block ──────

function getExcludedTablesArray() {
  if (!existsSync(DEPLOY_SCRIPT)) {
    console.error(`${RED}deploy.sh not found at ${DEPLOY_SCRIPT}${RESET}`);
    process.exit(1);
  }
  const content = readFileSync(DEPLOY_SCRIPT, "utf-8");
  const match = content.match(/excluded_tables\s+TEXT\[\]\s*:=\s*ARRAY\s*\[([\s\S]*?)\]/);
  const tables = new Set();
  if (!match) return tables;
  for (const m of match[1].matchAll(/'([a-z_][a-z0-9_]*)'/g)) {
    tables.add(m[1].toLowerCase());
  }
  return tables;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const tablesFilter   = getTablesFilterEntries();
const excludedTables = getExcludedTablesArray();

// schema_migrations is intentionally the only table that never has a SERIAL
// id column managed this way (it's a bookkeeping table with a text/varchar
// key), so it's allowed to be present in only one list without flagging.
const IGNORE = new Set(["schema_migrations"]);

const missingFromDeploy = [...tablesFilter].filter(
  t => !excludedTables.has(t) && !IGNORE.has(t)
);
const missingFromFilter = [...excludedTables].filter(
  t => !tablesFilter.has(t) && !IGNORE.has(t)
);

if (missingFromDeploy.length === 0 && missingFromFilter.length === 0) {
  console.log(
    `${GREEN}✓ sequence-guard-sync check passed.${RESET} ` +
    `${tablesFilter.size} tablesFilter entries all match deploy.sh's excluded_tables.`
  );
  process.exit(0);
}

console.error(
  `\n${RED}${BOLD}✖ sequence-guard-sync check FAILED — ` +
  `tablesFilter (drizzle.config.cjs) and excluded_tables (deploy.sh) have drifted apart.${RESET}\n` +
  `${RED}A table missing from excluded_tables will crash drizzle-kit push if it has a SERIAL column ` +
  `(e.g. "cannot drop sequence X because other objects depend on it").${RESET}\n`
);

if (missingFromDeploy.length > 0) {
  console.error(
    `  ${CYAN}In tablesFilter but missing from deploy.sh's excluded_tables array:${RESET}`
  );
  for (const tbl of missingFromDeploy.sort()) {
    console.error(`    ${YELLOW}'${tbl}',${RESET}`);
  }
  console.error(
    `  ${CYAN}Fix: add the entries above to the excluded_tables ARRAY[...] in deploy.sh.${RESET}\n`
  );
}

if (missingFromFilter.length > 0) {
  console.error(
    `  ${CYAN}In deploy.sh's excluded_tables but missing from tablesFilter:${RESET}`
  );
  for (const tbl of missingFromFilter.sort()) {
    console.error(`    ${YELLOW}"!${tbl}",${RESET}`);
  }
  console.error(
    `  ${CYAN}Fix: add the entries above to tablesFilter in lib/db/drizzle.config.cjs,${RESET}\n` +
    `  ${CYAN}or remove them from deploy.sh if the table is no longer excluded.${RESET}\n`
  );
}

process.exit(1);
