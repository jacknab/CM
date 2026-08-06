/**
 * startup/checkSchemaDrift.ts
 *
 * Compares the columns declared in the Drizzle schema against what actually
 * exists in the live PostgreSQL database.  Runs after runMigrations() so any
 * pending migrations are already applied before the diff is computed.
 *
 * Design goals:
 *   - NEVER throws or exits — a drift warning must not block startup.
 *   - Derives expected columns directly from the Drizzle table objects so the
 *     list stays in sync with the ORM automatically; no manual maintenance.
 *   - Covers only the tables that are most likely to cause silent runtime
 *     errors if a column is missing (i.e. tables the ORM queries unconditionally
 *     in hot paths).
 */

import { pool } from "../db";

// ─── Drizzle table imports ──────────────────────────────────────────────────
// Import at the top level so TypeScript checks the paths at build time.
import {
  locations,
  staff,
  services,
  appointments,
  addons,
  businessHours,
} from "../../../../shared/schema";
import { users, sessions } from "../../../../shared/models/auth";
import { clients } from "../../../../shared/schema/clients";
import {
  payoutRuns,
  payoutRunItems,
  contractors,
} from "../../../../shared/schema/payouts";
import {
  storeSubscriptions,
} from "../../../../shared/schema/subscriptions";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Extract the physical SQL column names from a Drizzle table object.
 * Drizzle stores these on `table[Symbol.for("drizzle:Columns")]` (v0.29+)
 * with a fallback to the older `table._.config.columns` path.
 */
function drizzleColumns(table: Record<string, any>): string[] {
  // v0.29+ canonical path
  const sym = Symbol.for("drizzle:Columns");
  const cols: Record<string, any> =
    (table as any)[sym] ??
    table?.["_"]?.["config"]?.["columns"] ??
    {};
  return Object.values(cols).map((col: any) => col.name as string);
}

// Tables to check — add new ones here as they become critical hot paths.
const TABLES_TO_CHECK: Array<{ label: string; table: Record<string, any> }> = [
  { label: "locations",           table: locations as any },
  { label: "staff",               table: staff as any },
  { label: "services",            table: services as any },
  { label: "appointments",        table: appointments as any },
  { label: "users",               table: users as any },
  { label: "sessions",            table: sessions as any },
  { label: "clients",             table: clients as any },
  { label: "addons",              table: addons as any },
  { label: "business_hours",      table: businessHours as any },
  { label: "payout_runs",         table: payoutRuns as any },
  { label: "payout_run_items",    table: payoutRunItems as any },
  { label: "contractors",         table: contractors as any },
  { label: "store_subscriptions", table: storeSubscriptions as any },
];

// ─── Cached result (readable by the health endpoint) ─────────────────────────

export interface DriftResult {
  checkedAt: string;       // ISO timestamp of last run
  ok: boolean;             // true = no drift detected
  tables: Array<{
    table: string;
    missingColumns: string[];
  }>;
  error?: string;          // set if the check itself failed
}

let lastDriftResult: DriftResult | null = null;

/** Returns the result of the most recent drift check, or null if not yet run. */
export function getLastDriftResult(): DriftResult | null {
  return lastDriftResult;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function checkSchemaDrift(): Promise<void> {
  const tag = "[schema-drift]";

  let client;
  try {
    client = await pool.connect();
  } catch (err: any) {
    console.warn(`${tag} Could not acquire DB connection — skipping drift check:`, err.message);
    return;
  }

  try {
    // Fetch all columns for public schema in one query.
    const { rows } = await client.query<{ table_name: string; column_name: string }>(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `);

    // Build a lookup: tableName → Set<columnName>
    const liveColumns = new Map<string, Set<string>>();
    for (const { table_name, column_name } of rows) {
      if (!liveColumns.has(table_name)) liveColumns.set(table_name, new Set());
      liveColumns.get(table_name)!.add(column_name);
    }

    const driftedTables: DriftResult["tables"] = [];

    for (const { label, table } of TABLES_TO_CHECK) {
      const expected = drizzleColumns(table);
      if (expected.length === 0) {
        // Could not introspect — skip silently to avoid false positives.
        continue;
      }

      const live = liveColumns.get(label);
      if (!live) {
        console.warn(`${tag} ⚠️  Table "${label}" does not exist in the database.`);
        driftedTables.push({ table: label, missingColumns: ["<table missing>"] });
        continue;
      }

      const missing = expected.filter((col) => !live.has(col));
      if (missing.length > 0) {
        console.warn(
          `${tag} ⚠️  Table "${label}" is missing ${missing.length} column(s): ${missing.join(", ")}`
        );
        driftedTables.push({ table: label, missingColumns: missing });
      }
    }

    const ok = driftedTables.length === 0;

    lastDriftResult = {
      checkedAt: new Date().toISOString(),
      ok,
      tables: driftedTables,
    };

    if (!ok) {
      console.warn(
        `${tag} Schema drift detected. Run pending migrations or apply the missing columns manually.`
      );
      console.warn(
        `${tag} Latest migration: artifacts/api-server/migrations/0045_missing_vps_columns.sql`
      );
    } else {
      console.log(`${tag} ✓ No drift detected — all checked tables are in sync.`);
    }
  } catch (err: any) {
    // Never let a drift check crash the server.
    console.warn(`${tag} Drift check failed (non-fatal):`, err.message);
    lastDriftResult = {
      checkedAt: new Date().toISOString(),
      ok: false,
      tables: [],
      error: err.message,
    };
  } finally {
    client.release();
  }
}
