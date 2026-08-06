#!/usr/bin/env node
/**
 * check-nullability.mjs — pre-push NOT NULL safety check.
 *
 * Parses every schema file that drizzle.config.ts reads and extracts columns
 * defined with .notNull().  For each one it checks the live DB via
 * information_schema:
 *
 *   1. Is the column currently nullable in the DB?
 *   2. If so, does it contain any NULL values right now?
 *
 * If both are true, drizzle-kit push will fail with a cryptic "contains null
 * values" Postgres error.  This script catches that BEFORE the push and tells
 * you exactly which column to fix (and how many rows are affected).
 *
 * Requires: DATABASE_URL env var (Postgres connection string).
 * Exits 0 if safe, 1 if a blocking problem is found.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Client } = pg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, "../..");

const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN  = "\x1b[32m";
const BOLD   = "\x1b[1m";
const RESET  = "\x1b[0m";

// ── Files drizzle.config.ts reads (must stay in sync with drizzle.config.ts) ─
const DRIZZLE_SCHEMA_FILES = [
  "lib/db/src/schema/index.ts",
  "shared/schema.ts",
  "shared/models/auth.ts",
  "shared/schema/billing.ts",
  "shared/schema/intelligence.ts",
  "shared/schema/clients.ts",
  "shared/schema/api-keys.ts",
  "shared/schema/campaigns.ts",
  "shared/schema/payouts.ts",
  "shared/schema/orphaned-tables.ts",
].map(f => resolve(ROOT, f));

// ── Schema parser ─────────────────────────────────────────────────────────────

function readFile(absPath) {
  if (!existsSync(absPath)) return "";
  return readFileSync(absPath, "utf8");
}

/**
 * Extract every EXPORTED pgTable with its NOT NULL columns.
 * Returns Map<tableName, Set<columnSnakeName>>
 *
 * Strategy:
 *   - Only exported tables (export const x = pgTable(...)) are seen by drizzle-kit.
 *   - A column is NOT NULL if its definition line contains .notNull() but NOT
 *     immediately cancelled by an outer .nullable() call.
 *   - We extract the DB column name from the first string arg of the type
 *     function (e.g. text("col_name")) or fall back to the camelCase key
 *     converted to snake_case.
 */
function extractNotNullColumns(text) {
  /** @type {Map<string, Set<string>>} */
  const result = new Map();

  const tableRe = /export\s+const\s+\w+\s*=\s*pgTable\(\s*['"`]([^'"`]+)['"`]\s*,\s*\{/g;
  let tableMatch;

  while ((tableMatch = tableRe.exec(text)) !== null) {
    const tableName = tableMatch[1];
    const bodyStart = tableMatch.index + tableMatch[0].length;

    // Walk to the matching closing brace of the column object.
    let depth = 1;
    let i     = bodyStart;
    while (i < text.length && depth > 0) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
      i++;
    }
    const body = text.slice(bodyStart, i - 1);

    const notNullCols = new Set();

    // Split body into top-level property lines.
    // We do a character-scan to handle nested braces/parens correctly.
    let propStart = 0;
    let propDepth = 0;
    const props = [];
    for (let j = 0; j < body.length; j++) {
      const ch = body[j];
      if (ch === "{" || ch === "(" || ch === "[") propDepth++;
      else if (ch === "}" || ch === ")" || ch === "]") propDepth--;
      else if (ch === "," && propDepth === 0) {
        props.push(body.slice(propStart, j).trim());
        propStart = j + 1;
      }
    }
    props.push(body.slice(propStart).trim());

    for (const prop of props) {
      // Must start with a camelCase key: "  colName: ..."
      const keyMatch = prop.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);
      if (!keyMatch) continue;

      // Skip relation/index pseudo-columns that aren't column builders.
      // Real column defs contain a drizzle type call.
      if (!/\b(?:text|varchar|integer|serial|boolean|numeric|timestamp|jsonb|uuid|bigint|smallint|real|doublePrecision|char|date|time|interval|bit|bytea|inet|cidr|macaddr|point|line|lseg|box|path|polygon|circle|tsquery|tsvector|xml|json|money|oid)\s*\(/.test(prop)) continue;

      const isNotNull = /\.notNull\(\)/.test(prop);
      const isNullable = /\.nullable\(\)/.test(prop);

      if (!isNotNull || isNullable) continue;

      // Derive the DB column name: prefer the explicit string arg to the type fn.
      const dbNameMatch = prop.match(/\b(?:text|varchar|integer|serial|boolean|numeric|timestamp|jsonb|uuid|bigint|smallint|real|doublePrecision|char|date|time|interval|bytea|inet|cidr|macaddr)\s*\(\s*['"`]([^'"`]+)['"`]/);
      let dbColName;
      if (dbNameMatch) {
        dbColName = dbNameMatch[1];
      } else {
        // Fall back: convert camelCase key → snake_case
        dbColName = keyMatch[1].replace(/([A-Z])/g, "_$1").toLowerCase();
      }

      notNullCols.add(dbColName);
    }

    if (notNullCols.size > 0) {
      if (!result.has(tableName)) result.set(tableName, new Set());
      for (const c of notNullCols) result.get(tableName).add(c);
    }
  }

  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error(`${RED}${BOLD}[nullability-check] DATABASE_URL is not set — skipping check.${RESET}`);
  process.exit(0); // non-fatal: can't check without DB
}

// 1. Collect all NOT NULL columns from every schema file.
/** @type {Map<string, Set<string>>} */
const schemaNotNull = new Map();

for (const filePath of DRIZZLE_SCHEMA_FILES) {
  const text = readFile(filePath);
  const tables = extractNotNullColumns(text);
  for (const [tbl, cols] of tables) {
    if (!schemaNotNull.has(tbl)) schemaNotNull.set(tbl, new Set());
    for (const c of cols) schemaNotNull.get(tbl).add(c);
  }
}

// 2. Query information_schema to find which of those columns are CURRENTLY
//    nullable in the live DB.
const client = new Client({ connectionString: dbUrl });
await client.connect();

let problems = false;

try {
  // Build a values list for the query.
  const pairs = [];
  for (const [tbl, cols] of schemaNotNull) {
    for (const col of cols) {
      pairs.push({ tbl, col });
    }
  }

  if (pairs.length === 0) {
    console.log(`${GREEN}✓ No NOT NULL columns found in schema — nothing to check.${RESET}`);
    process.exit(0);
  }

  // Find columns that are nullable in the DB but NOT NULL in the schema.
  const valuesSql = pairs
    .map((_, idx) => `($${idx * 2 + 1}, $${idx * 2 + 2})`)
    .join(", ");
  const flatParams = pairs.flatMap(p => [p.tbl, p.col]);

  const nullableRes = await client.query(
    `SELECT c.table_name, c.column_name
     FROM information_schema.columns c
     JOIN (VALUES ${valuesSql}) AS v(tbl, col)
       ON c.table_name = v.tbl AND c.column_name = v.col
     WHERE c.table_schema = 'public'
       AND c.is_nullable  = 'YES'`,
    flatParams
  );

  if (nullableRes.rows.length === 0) {
    console.log(`${GREEN}✓ Nullability check passed — no NOT NULL conflicts found.${RESET}`);
    process.exit(0);
  }

  // 3. For each currently-nullable column, count existing NULL rows.
  for (const { table_name, column_name } of nullableRes.rows) {
    // Safely quote identifiers.
    const countRes = await client.query(
      `SELECT COUNT(*) AS n FROM "${table_name}" WHERE "${column_name}" IS NULL`
    );
    const nullCount = parseInt(countRes.rows[0].n, 10);
    if (nullCount === 0) continue; // nullable in schema but no NULLs in DB — push will succeed

    problems = true;
    console.error(
      `\n${RED}${BOLD}[nullability-check] BLOCKING — "${table_name}.${column_name}"${RESET}${RED}` +
      `\n  Schema says .notNull() but the column is nullable in the DB` +
      `\n  and has ${nullCount} row(s) with NULL values.` +
      `\n  drizzle-kit push will fail with "contains null values".${RESET}`
    );
    console.error(
      `\n  ${YELLOW}Fix options (choose one):${RESET}` +
      `\n  ${YELLOW}a) Make the column nullable in shared/schema.ts:${RESET}` +
      `\n       Change  .notNull()  →  (remove it)` +
      `\n  ${YELLOW}b) Back-fill NULLs in the DB first, then re-run deploy:${RESET}` +
      `\n       UPDATE "${table_name}" SET "${column_name}" = '<value>' WHERE "${column_name}" IS NULL;`
    );
  }
} finally {
  await client.end();
}

if (problems) {
  console.error(
    `\n${RED}${BOLD}✖ Nullability check FAILED — fix the issue(s) above before running drizzle-kit push.${RESET}\n`
  );
  process.exit(1);
} else {
  console.log(`${GREEN}✓ Nullability check passed — no NOT NULL conflicts found.${RESET}`);
}
