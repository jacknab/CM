/**
 * Imports Certxa's global hairstyle library (shared/hairstyleCatalog.ts, 200 styles) into hairstyle_templates with
 * store_id NULL. Idempotent and restart-safe:
 *   - one transaction under an advisory lock, so two runs (two servers, a retry) never interleave;
 *   - keyed by the global slug (unique index hairstyle_templates_global_slug_uidx): a new slug is inserted as
 *     `published`, an existing one is updated only if its content changed (name, category, description, aliases,
 *     default spec); its id, status and is_active are never changed, so an archived style stays archived;
 *   - nothing is ever deleted, store styles (store_id NOT NULL) are never read or written, and client formulas and
 *     haircut history are not touched (they point at template ids, which stay the same);
 *   - images are not created here: they go through the admin approval workflow (routes/hairstyleAdmin.ts).
 * Run: scripts/import-hairstyle-catalog.ts (dry run by default; --apply to write).
 */
import type pg from "pg";
import { HAIRSTYLE_CATALOG, type CatalogStyle } from "@shared/hairstyleCatalog";
import { checkSpecForSave } from "@shared/haircutFormula";

export type CatalogImportResult = { inserted: string[]; updated: string[]; unchanged: number; total: number };

const canonical = (x: unknown): unknown =>
  Array.isArray(x) ? x.map(canonical) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, canonical((x as any)[k])])) : x;
const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/** Runs inside the caller's transaction (BEGIN … COMMIT, or ROLLBACK for a dry run). */
export async function importHairstyleCatalog(db: pg.PoolClient, catalog: CatalogStyle[] = HAIRSTYLE_CATALOG): Promise<CatalogImportResult> {
  await db.query(`SELECT pg_advisory_xact_lock(hashtext('hairstyle-catalog-import'))`);
  for (const s of catalog) {
    const c = checkSpecForSave(s.spec);
    if (!c.ok) throw new Error(`Catalog style ${s.slug}: ${c.message}`);
  }
  const cats = new Map<string, number>((await db.query(`SELECT id, slug FROM hairstyle_categories`)).rows.map((r) => [r.slug, r.id]));
  const missing = [...new Set(catalog.map((s) => s.category))].filter((c) => !cats.has(c));
  if (missing.length) throw new Error(`Missing hairstyle categories (run migration 0356 first): ${missing.join(", ")}`);

  const existing = new Map<string, any>((await db.query(
    `SELECT id, slug, name, category_id, description, aliases, default_spec FROM hairstyle_templates WHERE store_id IS NULL`)).rows.map((r) => [r.slug, r]));
  const result: CatalogImportResult = { inserted: [], updated: [], unchanged: 0, total: catalog.length };
  for (const s of catalog) {
    const categoryId = cats.get(s.category)!;
    const row = existing.get(s.slug);
    if (!row) {
      await db.query(
        `INSERT INTO hairstyle_templates (store_id, category_id, slug, name, description, aliases, default_spec, spec_version, status)
         VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, 'published')`,
        [categoryId, s.slug, s.name, s.description, s.aliases, JSON.stringify(s.spec), s.spec.v]);
      result.inserted.push(s.slug);
      continue;
    }
    const changed = row.name !== s.name || row.category_id !== categoryId || row.description !== s.description
      || !same(row.aliases, s.aliases) || !same(row.default_spec, s.spec);
    if (!changed) { result.unchanged++; continue; }
    await db.query(
      `UPDATE hairstyle_templates SET name = $1, category_id = $2, description = $3, aliases = $4, default_spec = $5, spec_version = $6, updated_at = now()
        WHERE id = $7 AND store_id IS NULL`,
      [s.name, categoryId, s.description, s.aliases, JSON.stringify(s.spec), s.spec.v, row.id]);
    result.updated.push(s.slug);
  }
  return result;
}
