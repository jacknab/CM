/**
 * The one safe way to write a salon's preferences (store_settings.preferences).
 *
 * That column is a single JSON document shared by many features — turn system, kiosk, loyalty,
 * payroll, feature switches, permission levels… Each feature used to read the whole document, change
 * its own part, and write the whole document back. Two of those at the same moment meant the later
 * save put back the earlier reader's stale copy of everything else: a turn-system change could be
 * undone by someone saving kiosk settings, and the other way round.
 *
 * Every write now happens with the salon's settings row locked, against what is saved at that instant.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";

export type StorePreferences = Record<string, any>;

function parse(raw: unknown): StorePreferences {
  if (typeof raw !== "string" || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Change the preferences in one step. `change` receives what is saved right now and returns the whole
 * document to save, or null to leave it alone. With `createIfMissing: false` a salon that has no
 * settings row yet is left without one (and `change` is not called).
 */
export async function mutateStorePreferences(
  storeId: number,
  change: (current: StorePreferences) => StorePreferences | null,
  opts: { createIfMissing?: boolean } = {},
): Promise<StorePreferences> {
  return db.transaction(async (tx) => {
    if (opts.createIfMissing !== false) {
      await tx.execute(sql`INSERT INTO store_settings (store_id, preferences) VALUES (${storeId}, '{}') ON CONFLICT (store_id) DO NOTHING`);
    }
    const locked = await tx.execute(sql`SELECT preferences FROM store_settings WHERE store_id = ${storeId} FOR UPDATE`);
    if (locked.rows.length === 0) return {};
    const current = parse((locked.rows[0] as any).preferences);
    const next = change(current);
    if (!next) return current;
    await tx.execute(sql`UPDATE store_settings SET preferences = ${JSON.stringify(next)}, updated_at = now() WHERE store_id = ${storeId}`);
    return next;
  });
}

/**
 * The top-level parts of `next` that differ from `basedOn` (what the caller read before deciding).
 * `removed` are parts the caller deleted. Pure — this is the rule writeStorePreferences applies.
 */
export function changedPreferenceKeys(basedOn: StorePreferences, next: StorePreferences): { changed: string[]; removed: string[] } {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const changed = Object.keys(next).filter((key) => !same(next[key], basedOn[key]));
  const removed = Object.keys(basedOn).filter((key) => !(key in next));
  return { changed, removed };
}

/** Apply only the caller's own changes on top of what is saved now. Pure. */
export function mergePreferenceChanges(savedNow: StorePreferences, basedOn: StorePreferences, next: StorePreferences): StorePreferences {
  const { changed, removed } = changedPreferenceKeys(basedOn, next);
  const merged: StorePreferences = { ...savedNow };
  for (const key of changed) merged[key] = next[key];
  for (const key of removed) delete merged[key];
  return merged;
}

/**
 * For code that has already read the preferences (`basedOn`), worked out the document it wants
 * (`next`), and now saves it: only the top-level parts it actually changed are written, on top of
 * what is saved at this instant. Anything another feature saved in between is kept.
 */
export async function writeStorePreferences(
  storeId: number,
  basedOn: StorePreferences,
  next: StorePreferences,
  opts: { createIfMissing?: boolean } = {},
): Promise<StorePreferences> {
  return mutateStorePreferences(storeId, (savedNow) => {
    const { changed, removed } = changedPreferenceKeys(basedOn, next);
    if (changed.length === 0 && removed.length === 0) return null;
    return mergePreferenceChanges(savedNow, basedOn, next);
  }, opts);
}
