/**
 * Last Cut Formula Phase 4: import Certxa's 200-style global hairstyle library (shared/hairstyleCatalog.ts) into
 * hairstyle_templates (store_id NULL). Idempotent and restart-safe (see artifacts/api-server/src/lib/hairstyleCatalogImport.ts).
 * DRY RUN by default: the import runs inside a transaction that is rolled back, and prints what it would do.
 *
 * Run (disposable/staging database first):
 *   cd artifacts/api-server && set -a; . /etc/certxa.env; set +a; \
 *     pnpm tsx ../../scripts/import-hairstyle-catalog.ts [--apply]
 */
import { pool } from "../artifacts/api-server/src/db";
import { importHairstyleCatalog } from "../artifacts/api-server/src/lib/hairstyleCatalogImport";

const apply = process.argv.includes("--apply");
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(`SELECT set_config('certxa.actor', 'script:import-hairstyle-catalog', true)`);
  const r = await importHairstyleCatalog(client);
  await client.query(apply ? "COMMIT" : "ROLLBACK");
  console.log(`${apply ? "Imported" : "Dry run (nothing written)"}: ${r.total} styles · ${r.inserted.length} new · ${r.updated.length} updated · ${r.unchanged} unchanged`);
  if (r.updated.length) console.log("updated:", r.updated.join(", "));
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("Hairstyle catalog import failed, nothing written:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
