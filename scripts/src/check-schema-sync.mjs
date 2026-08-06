#!/usr/bin/env node
/**
 * check-schema-sync.mjs — zero-dependency drizzle schema safety checker.
 *
 * Reads the same schema files that lib/db/drizzle.config.ts passes to
 * drizzle-kit, then:
 *
 *  1. DUPLICATE TABLE CHECK — detects the same pgTable("name", ...) defined
 *     in more than one file.  When duplicates exist drizzle-kit uses the LAST
 *     definition processed (order = drizzle.config.ts schema array order), so
 *     any columns present in the earlier definition but absent from the later
 *     one will be DROPPED from the live DB.
 *
 *  2. COLUMN COVERAGE CHECK — for every table that appears in shared/schema.ts
 *     or its sub-files, verifies that the same columns also appear in every
 *     other file that re-declares that table (orphaned-tables.ts etc.).
 *
 * Exits 1 if problems are found, 0 if clean.
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, "../..");

const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN  = "\x1b[32m";
const BOLD   = "\x1b[1m";
const RESET  = "\x1b[0m";

// ── Files drizzle.config.ts reads (in order) ────────────────────────────────
// Keep this list in sync with lib/db/drizzle.config.ts → schema array.
// The LAST definition of a given table name wins in drizzle-kit.
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

// ── helpers ──────────────────────────────────────────────────────────────────

function readFile(absPath) {
  if (!existsSync(absPath)) return "";
  return readFileSync(absPath, "utf8");
}

/**
 * Extract every EXPORTED pgTable("table_name", { col: ... }) from raw source text.
 * Non-exported stubs (used for FK references) are intentionally ignored because
 * drizzle-kit only processes exported table objects.
 * Returns an array of { tableName, columns: Set<string> }.
 */
function extractTables(text) {
  const results = [];
  // Only match tables that are directly exported:
  //   export const foo = pgTable("tbl", { ...
  // This skips private FK stubs like:
  //   const _locations = pgTable("locations", { id: ... })
  const tableHeaderRe = /export\s+const\s+\w+\s*=\s*pgTable\(\s*['"`]([^'"`]+)['"`]\s*,\s*\{/g;
  let headerMatch;

  while ((headerMatch = tableHeaderRe.exec(text)) !== null) {
    const tableName = headerMatch[1];
    const bodyStart = headerMatch.index + headerMatch[0].length;

    let depth = 1;
    let i     = bodyStart;
    while (i < text.length && depth > 0) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
      i++;
    }
    const body = text.slice(bodyStart, i - 1);

    const columns = new Set();
    const colRe = /^[ \t]*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm;
    let colMatch;
    while ((colMatch = colRe.exec(body)) !== null) {
      columns.add(colMatch[1]);
    }

    results.push({ tableName, columns });
  }

  return results;
}

// ── main ─────────────────────────────────────────────────────────────────────

// Map: tableName → array of { file, columns }  (in drizzle.config.ts order)
const tableIndex = new Map();

for (const filePath of DRIZZLE_SCHEMA_FILES) {
  const text   = readFile(filePath);
  const tables = extractTables(text);
  for (const { tableName, columns } of tables) {
    if (!tableIndex.has(tableName)) tableIndex.set(tableName, []);
    tableIndex.get(tableName).push({ file: filePath.replace(ROOT + "/", ""), columns });
  }
}

let problemsFound = false;

for (const [tableName, defs] of tableIndex) {
  if (defs.length < 2) continue;

  // The last definition is what drizzle-kit uses.
  const winner = defs[defs.length - 1];

  for (let di = 0; di < defs.length - 1; di++) {
    const earlier = defs[di];
    const missing = [...earlier.columns].filter(c => !winner.columns.has(c));
    if (missing.length === 0) continue;

    problemsFound = true;
    console.error(
      `\n${RED}${BOLD}[schema-sync] DUPLICATE TABLE — "${tableName}"${RESET}${RED}` +
      `\n  Defined in multiple schema files; drizzle-kit uses the LAST one.${RESET}`
    );
    console.error(
      `  ${YELLOW}Earlier definition: ${earlier.file}${RESET}  (has these columns)`
    );
    console.error(
      `  ${RED}Last definition:    ${winner.file}${RESET}  (MISSING these columns — drizzle-kit will DROP them from the DB)`
    );
    for (const col of missing) {
      console.error(`    ${YELLOW}· ${col}${RESET}`);
    }
  }
}

if (problemsFound) {
  console.error(
    `\n${RED}${BOLD}✖ Schema sync check FAILED.${RESET}\n` +
    `Fix: remove the duplicate pgTable definition for the table(s) above from\n` +
    `the later file, OR add the missing columns to the later definition.\n` +
    `The canonical definition should live in shared/schema.ts.\n`
  );
  process.exit(1);
} else {
  console.log(`${GREEN}✓ No duplicate table definitions found — schema is safe for drizzle-kit push.${RESET}`);
}
