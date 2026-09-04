/**
 * One-off: move any `service_categories.image_url` that is still an inline
 * `data:` URI into Cloudflare R2 and replace the column with the public URL.
 *
 * Run:  cd artifacts/api-server && set -a; . /etc/certxa.env; set +a; \
 *       pnpm tsx ../../scripts/migrate-category-images-to-r2.ts
 * Safe to re-run — rows that already hold a normal URL are skipped.
 */
import { Pool } from "pg";
import { persistDataUriToR2 } from "../artifacts/api-server/src/lib/r2";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query<{ id: number; store_id: number | null; image_url: string }>(
    `SELECT id, store_id, image_url
       FROM service_categories
      WHERE image_url LIKE 'data:%'`,
  );

  console.log(`Found ${rows.length} category image(s) to migrate.`);
  let ok = 0;
  for (const r of rows) {
    try {
      const url = await persistDataUriToR2(r.image_url, "category");
      if (!url || url.startsWith("data:")) {
        console.warn(`  #${r.id} (store ${r.store_id}) — could not convert, left as-is`);
        continue;
      }
      await pool.query(`UPDATE service_categories SET image_url = $1 WHERE id = $2`, [url, r.id]);
      console.log(`  #${r.id} (store ${r.store_id}) → ${url}`);
      ok++;
    } catch (err) {
      console.error(`  #${r.id} failed:`, (err as Error).message);
    }
  }
  console.log(`Done. ${ok}/${rows.length} migrated.`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
