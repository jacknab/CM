/**
 * lib/kioskLayouts.ts — each store's check-in kiosk layout (plans/kiosk-builder.md)
 *
 * kiosk_layouts (migration 0357) holds one draft per store and numbered published versions. The kiosk shows
 * the published one; with none, its business type's preset carrying the store's old kiosk settings
 * (shared/kiosk/presets.ts), which is exactly the kiosk it had before the builder.
 *
 * Published and archived rows are never edited. Publishing archives the current version and adds the draft
 * as the next number; going back to an old version copies it into the draft, to be published again.
 */

import { pool } from "../db";
import { businessTypeOf } from "@shared/kiosk/businessTypes";
import { normalizeKioskLayout, type KioskLayout } from "@shared/kiosk/layout";
import { defaultKioskLayout } from "@shared/kiosk/presets";

export interface StoreKioskContext {
  storeId: number;
  /** locations.category */
  category: string | null;
  /** store_settings.preferences.kioskSettings, the settings that came before the builder. */
  legacy: Record<string, unknown>;
}

export interface KioskLayoutVersion {
  version: number;
  status: "published" | "archived";
  note: string | null;
  createdBy: number | null;
  publishedAt: string;
}

const fallbackPreset = (ctx: StoreKioskContext) => businessTypeOf(ctx.category).key;

/** A store's business type and old kiosk settings. null: no such store. */
export async function kioskContext(storeId: number): Promise<StoreKioskContext | null> {
  const r = await pool.query(
    `SELECT l.category, ss.preferences FROM locations l LEFT JOIN store_settings ss ON ss.store_id = l.id WHERE l.id = $1`,
    [storeId],
  );
  if (!r.rows[0]) return null;
  let prefs: any = {};
  try { prefs = JSON.parse(r.rows[0].preferences ?? "{}") || {}; } catch { prefs = {}; }
  return { storeId, category: r.rows[0].category ?? null, legacy: prefs.kioskSettings ?? {} };
}

/** The layout the kiosk shows, and which version it is (null: the preset, never published). */
export async function publishedKioskLayout(ctx: StoreKioskContext): Promise<{ layout: KioskLayout; version: number | null }> {
  const r = await pool.query(
    `SELECT layout, version FROM kiosk_layouts WHERE store_id = $1 AND status = 'published' LIMIT 1`,
    [ctx.storeId],
  );
  if (!r.rows[0]) return { layout: defaultKioskLayout(ctx.category, ctx.legacy), version: null };
  return { layout: normalizeKioskLayout(r.rows[0].layout, fallbackPreset(ctx)), version: Number(r.rows[0].version) };
}

/** The builder's working copy: the draft, else what is published, else the preset. */
export async function draftKioskLayout(ctx: StoreKioskContext): Promise<{ layout: KioskLayout; savedAt: string | null }> {
  const r = await pool.query(
    `SELECT layout, updated_at FROM kiosk_layouts WHERE store_id = $1 AND status = 'draft' LIMIT 1`,
    [ctx.storeId],
  );
  if (r.rows[0]) return { layout: normalizeKioskLayout(r.rows[0].layout, fallbackPreset(ctx)), savedAt: new Date(r.rows[0].updated_at).toISOString() };
  return { layout: (await publishedKioskLayout(ctx)).layout, savedAt: null };
}

/** Saves the draft (normalized). The caller has validated it. */
export async function saveKioskDraft(ctx: StoreKioskContext, raw: unknown, userId: number | null): Promise<KioskLayout> {
  const layout = normalizeKioskLayout(raw, fallbackPreset(ctx));
  await pool.query(
    `INSERT INTO kiosk_layouts (store_id, status, version, schema_version, layout, created_by)
     VALUES ($1, 'draft', NULL, $2, $3::jsonb, $4)
     ON CONFLICT (store_id) WHERE status = 'draft'
     DO UPDATE SET layout = EXCLUDED.layout, schema_version = EXCLUDED.schema_version, created_by = EXCLUDED.created_by, updated_at = now()`,
    [ctx.storeId, layout.schemaVersion, JSON.stringify(layout), userId],
  );
  return layout;
}

/** Publishes the draft as the next version. null: there is no draft. */
export async function publishKioskDraft(ctx: StoreKioskContext, userId: number | null, note: string | null): Promise<number | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // One publish at a time per store.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('kiosk_layouts'), $1::int)`, [ctx.storeId]);
    const draft = await client.query(`SELECT layout FROM kiosk_layouts WHERE store_id = $1 AND status = 'draft'`, [ctx.storeId]);
    if (!draft.rows[0]) { await client.query("ROLLBACK"); return null; }
    const layout = normalizeKioskLayout(draft.rows[0].layout, fallbackPreset(ctx));
    const next = await client.query(`SELECT COALESCE(MAX(version), 0) + 1 AS v FROM kiosk_layouts WHERE store_id = $1`, [ctx.storeId]);
    const version = Number(next.rows[0].v);
    await client.query(`UPDATE kiosk_layouts SET status = 'archived' WHERE store_id = $1 AND status = 'published'`, [ctx.storeId]);
    await client.query(
      `INSERT INTO kiosk_layouts (store_id, status, version, schema_version, layout, note, created_by, published_at)
       VALUES ($1, 'published', $2, $3, $4::jsonb, $5, $6, now())`,
      [ctx.storeId, version, layout.schemaVersion, JSON.stringify(layout), note?.trim().slice(0, 200) || null, userId],
    );
    await client.query("COMMIT");
    return version;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function listKioskVersions(storeId: number): Promise<KioskLayoutVersion[]> {
  const r = await pool.query(
    `SELECT version, status, note, created_by, published_at FROM kiosk_layouts
      WHERE store_id = $1 AND status IN ('published', 'archived') ORDER BY version DESC LIMIT 100`,
    [storeId],
  );
  return r.rows.map((row) => ({
    version: Number(row.version), status: row.status, note: row.note ?? null,
    createdBy: row.created_by == null ? null : Number(row.created_by),
    publishedAt: new Date(row.published_at).toISOString(),
  }));
}

/** An old version, for the builder to load into its draft. null: no such version. */
export async function kioskVersionLayout(ctx: StoreKioskContext, version: number): Promise<KioskLayout | null> {
  const r = await pool.query(
    `SELECT layout FROM kiosk_layouts WHERE store_id = $1 AND version = $2 AND status IN ('published', 'archived')`,
    [ctx.storeId, version],
  );
  return r.rows[0] ? normalizeKioskLayout(r.rows[0].layout, fallbackPreset(ctx)) : null;
}

/** Whether the draft differs from what the kiosk shows. */
export function sameKioskLayout(a: KioskLayout, b: KioskLayout): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ── Saved configurations (kiosk_configs, migration 0359) ───────────────────────

export const KIOSK_CONFIGS_MAX = 50;

export interface KioskConfigRow { id: number; name: string; source: "saved" | "imported"; createdAt: string; updatedAt: string }

const configRow = (r: any): KioskConfigRow => ({
  id: Number(r.id), name: r.name, source: r.source,
  createdAt: new Date(r.created_at).toISOString(), updatedAt: new Date(r.updated_at).toISOString(),
});

export async function listKioskConfigs(storeId: number): Promise<KioskConfigRow[]> {
  const r = await pool.query(
    `SELECT id, name, source, created_at, updated_at FROM kiosk_configs WHERE store_id = $1 ORDER BY updated_at DESC LIMIT ${KIOSK_CONFIGS_MAX}`,
    [storeId],
  );
  return r.rows.map(configRow);
}

/** A saved configuration's layout. null: not this store's. */
export async function kioskConfigLayout(ctx: StoreKioskContext, id: number): Promise<{ name: string; layout: KioskLayout } | null> {
  const r = await pool.query(`SELECT name, layout FROM kiosk_configs WHERE id = $1 AND store_id = $2`, [id, ctx.storeId]);
  return r.rows[0] ? { name: r.rows[0].name, layout: normalizeKioskLayout(r.rows[0].layout, fallbackPreset(ctx)) } : null;
}

/** "Spring menu" → "Spring menu (2)" when the store already has one of that name. */
async function freeConfigName(storeId: number, name: string, exceptId?: number): Promise<string> {
  const r = await pool.query(`SELECT name FROM kiosk_configs WHERE store_id = $1 AND id <> $2`, [storeId, exceptId ?? 0]);
  const taken = new Set(r.rows.map((x) => String(x.name).toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${name.slice(0, 54)} (${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${name.slice(0, 50)} ${Date.now()}`;
}

/** Saves a layout as a new configuration. null: the store already has the most it may keep. */
export async function createKioskConfig(ctx: StoreKioskContext, name: string, raw: unknown, source: "saved" | "imported", userId: number | null): Promise<KioskConfigRow | null> {
  const count = await pool.query(`SELECT count(*)::int AS n FROM kiosk_configs WHERE store_id = $1`, [ctx.storeId]);
  if (count.rows[0].n >= KIOSK_CONFIGS_MAX) return null;
  const layout = normalizeKioskLayout(raw, fallbackPreset(ctx));
  const r = await pool.query(
    `INSERT INTO kiosk_configs (store_id, name, layout, source, created_by) VALUES ($1, $2, $3::jsonb, $4, $5)
     RETURNING id, name, source, created_at, updated_at`,
    [ctx.storeId, await freeConfigName(ctx.storeId, name), JSON.stringify(layout), source, userId],
  );
  return configRow(r.rows[0]);
}

export async function renameKioskConfig(storeId: number, id: number, name: string): Promise<KioskConfigRow | null> {
  const r = await pool.query(
    `UPDATE kiosk_configs SET name = $3, updated_at = now() WHERE id = $1 AND store_id = $2 RETURNING id, name, source, created_at, updated_at`,
    [id, storeId, await freeConfigName(storeId, name, id)],
  );
  return r.rows[0] ? configRow(r.rows[0]) : null;
}

export async function deleteKioskConfig(storeId: number, id: number): Promise<boolean> {
  return ((await pool.query(`DELETE FROM kiosk_configs WHERE id = $1 AND store_id = $2`, [id, storeId])).rowCount ?? 0) > 0;
}

/** The store's active services and add-ons by name, for configuration files (shared/kiosk/configFile.ts). */
export async function kioskCatalogRefs(storeId: number) {
  const [s, a] = await Promise.all([
    pool.query(`SELECT id, name, category FROM services WHERE store_id = $1 AND is_active = true ORDER BY id`, [storeId]),
    pool.query(`SELECT id, name FROM addons WHERE store_id = $1 AND is_active = true ORDER BY id`, [storeId]),
  ]);
  return {
    services: s.rows.map((r) => ({ id: Number(r.id), name: String(r.name), category: r.category ?? null })),
    addons: a.rows.map((r) => ({ id: Number(r.id), name: String(r.name) })),
  };
}
