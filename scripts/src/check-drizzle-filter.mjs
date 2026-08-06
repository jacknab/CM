#!/usr/bin/env node
/**
 * check-drizzle-filter.mjs — static pre-push safety check.
 *
 * Detects tables that are created by SQL migration files but are NOT defined
 * as pgTable() in any TypeScript schema file AND are NOT excluded by the
 * drizzle.config.cjs tablesFilter list.
 *
 * If such a table exists drizzle-kit push will offer to DROP it on the next
 * deploy, potentially causing data loss.  This script catches that BEFORE
 * drizzle-kit runs and tells you exactly which "!<table>" entry to add.
 *
 * Pure static analysis — no database connection required.
 *
 * Environment variables (all optional, sensible defaults used):
 *   APP_DIR          — workspace root (default: 3 levels up from this file)
 *   MIGRATIONS_DIR   — migrations directory (default: $APP_DIR/migrations)
 *   DRIZZLE_CONFIG   — drizzle.config.cjs path (default: $APP_DIR/lib/db/drizzle.config.cjs)
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const APP_DIR      = process.env.APP_DIR
  ? resolve(process.env.APP_DIR)
  : resolve(__dirname, "../../..");

const MIGRATIONS   = process.env.MIGRATIONS_DIR
  ? resolve(process.env.MIGRATIONS_DIR)
  : resolve(APP_DIR, "migrations");

const DRIZZLE_CFG  = process.env.DRIZZLE_CONFIG
  ? resolve(process.env.DRIZZLE_CONFIG)
  : resolve(APP_DIR, "lib/db/drizzle.config.cjs");

// Tables intentionally retired by later migrations. They may still appear in
// historical CREATE TABLE statements, but should NOT be forced into tablesFilter.
const KNOWN_DROPPED_TABLES = new Set([
  "training_action_categories",
  "training_action_steps",
  "training_user_state",
  "training_events",
  "training_user_profile",
  "training_settings",
]);

const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN  = "\x1b[32m";
const CYAN   = "\x1b[36m";
const BOLD   = "\x1b[1m";
const RESET  = "\x1b[0m";

// ── 1. Extract table names from migration CREATE TABLE statements ──────────────

function getMigrationTables() {
  if (!existsSync(MIGRATIONS)) return new Set();

  const tables = new Set();
  const files = readdirSync(MIGRATIONS)
    .filter(f => f.endsWith(".sql") && !f.startsWith("."))
    .sort();

  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS, f), "utf-8");
    // Strip line comments and block comments first
    const stripped = sql
      .replace(/--[^\n]*/g, " ")
      .replace(/\/\*[\s\S]*?\*\//g, " ");

    // Match both guarded and plain CREATE TABLE
    for (const m of stripped.matchAll(
      /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?([a-z_][a-z0-9_]*)["']?/gi
    )) {
      const name = m[1].toLowerCase();
      // Skip postgres reserved words that can appear as table "names" in edge cases
      if (!["only", "table", "index", "public"].includes(name)) {
        tables.add(name);
      }
    }
  }
  return tables;
}

// ── 2. Extract table names from pgTable() calls in TypeScript schema files ────

function getSchemaTables() {
  const tables = new Set();
  // Directories to scan for .ts schema files (non-recursive for speed)
  const searchRoots = [
    join(APP_DIR, "shared"),
    join(APP_DIR, "lib/db/src"),
    join(APP_DIR, "artifacts/api-server/src"),
  ];

  function scanDir(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== "node_modules") {
        scanDir(join(dir, entry.name));
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        const content = readFileSync(join(dir, entry.name), "utf-8");
        for (const m of content.matchAll(/\bpgTable\s*\(\s*["']([a-z_][a-z0-9_]*)["']/gi)) {
          tables.add(m[1].toLowerCase());
        }
      }
    }
  }

  for (const root of searchRoots) scanDir(root);
  return tables;
}

// ── 3. Extract excluded table names from drizzle.config.cjs tablesFilter ───────

function getFilteredTables() {
  const excluded = new Set();
  if (!existsSync(DRIZZLE_CFG)) return excluded;

  const content = readFileSync(DRIZZLE_CFG, "utf-8");
  // Match entries like "!table_name" (with or without surrounding quotes)
  for (const m of content.matchAll(/["']!([a-z_][a-z0-9_]*)["']/g)) {
    excluded.add(m[1].toLowerCase());
  }
  return excluded;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const migrationTables = getMigrationTables();
const schemaTables    = getSchemaTables();
const filteredTables  = getFilteredTables();

// Migration-only tables: created by SQL migrations but not defined as pgTable()
const migrationOnly = [...migrationTables].filter(t => !schemaTables.has(t));

// Of those, which are NOT excluded in tablesFilter?
const unguarded = migrationOnly.filter(
  t => !filteredTables.has(t) && !KNOWN_DROPPED_TABLES.has(t)
);

if (unguarded.length === 0) {
  const moCount = migrationOnly.length;
  console.log(
    `${GREEN}✓ drizzle-filter check passed.${RESET} ` +
    `${moCount} migration-only table(s) are all covered by tablesFilter.`
  );
  process.exit(0);
}

// Report the problem
console.error(
  `\n${RED}${BOLD}✖ drizzle-filter check FAILED — ${unguarded.length} migration-managed ` +
  `table(s) are not excluded from drizzle-kit's scope.${RESET}\n` +
  `${RED}drizzle-kit push will offer to DROP these tables on the next deploy.${RESET}\n`
);

console.error(
  `  ${CYAN}Fix: add each entry below to the ${BOLD}tablesFilter${RESET}${CYAN} array` +
  ` in ${BOLD}lib/db/drizzle.config.cjs${RESET}${CYAN}:${RESET}\n`
);

for (const tbl of unguarded.sort()) {
  console.error(`    ${YELLOW}"!${tbl}",${RESET}`);
}

console.error(
  `\n${CYAN}Example location in drizzle.config.cjs:${RESET}\n` +
  `  tablesFilter: [\n` +
  `    "!schema_migrations",\n` +
  `    ${unguarded.sort().map(t => `"!${t}",`).join("\n    ")}\n` +
  `    // ... existing entries ...\n` +
  `  ],\n`
);

console.error(
  `${YELLOW}These tables are created by migrations/*.sql but have no pgTable() ` +
  `definition in any TypeScript schema file.\n` +
  `Add them to tablesFilter, or add matching pgTable() definitions to the schema.${RESET}\n`
);

process.exit(1);
