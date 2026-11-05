/**
 * Add-on Groups (owner, 2026-11-05, migration 0320): reusable lists of a salon's existing add-ons, assigned to
 * services. A group never copies add-on records; price, time, photo and tier stay on the shared add-on.
 *
 * How a group reaches a service: `service_addons` stays the one place every reader looks (booking pages, POS,
 * kiosk, Autumn, the tablets' offline copy, older Pro app builds). A link the owner made by hand has
 * `manual = true` (every link from before groups); a link that exists only because one of the service's groups
 * holds the add-on has `manual = false`. An add-on that is both is one link, `manual = true`, so it is never
 * shown twice, and removing the group leaves it. `syncGroupLinks` makes the group links of the given services
 * match their groups after any change.
 *
 * Every change runs in one transaction under a per-salon lock, so two saves at once can't leave a stray link.
 */
import type { PoolClient } from "pg";
import { pool } from "../db";

/** Runs `fn` in a transaction, holding the salon's add-on-groups lock. */
export async function withAddonLock<T>(storeId: number, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT pg_advisory_xact_lock(hashtext('addon_groups'), $1)`, [storeId]);
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Brings the group links (`manual = false`) of these services in line with the groups each service has. */
export async function syncGroupLinks(c: PoolClient, serviceIds: number[]): Promise<void> {
  const ids = [...new Set(serviceIds.filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) return;
  const want = `SELECT DISTINCT sag.service_id, agi.addon_id
                  FROM service_addon_groups sag JOIN addon_group_items agi ON agi.group_id = sag.group_id
                 WHERE sag.service_id = ANY($1::int[])`;
  await c.query(
    `DELETE FROM service_addons sa
      WHERE sa.service_id = ANY($1::int[]) AND sa.manual = false
        AND NOT EXISTS (SELECT 1 FROM (${want}) w WHERE w.service_id = sa.service_id AND w.addon_id = sa.addon_id)`,
    [ids],
  );
  await c.query(
    `INSERT INTO service_addons (service_id, addon_id, manual)
     SELECT w.service_id, w.addon_id, false FROM (${want}) w
      WHERE NOT EXISTS (SELECT 1 FROM service_addons sa WHERE sa.service_id = w.service_id AND sa.addon_id = w.addon_id)`,
    [ids],
  );
}

/** The services that have this group. */
export async function servicesOfGroup(c: PoolClient, groupId: number): Promise<number[]> {
  const { rows } = await c.query(`SELECT service_id FROM service_addon_groups WHERE group_id = $1`, [groupId]);
  return rows.map((r: any) => r.service_id);
}

/** Replaces a group's add-ons, in this order. */
export async function setGroupItems(c: PoolClient, groupId: number, addonIds: number[]): Promise<void> {
  const ids = [...new Set(addonIds)];
  await c.query(`DELETE FROM addon_group_items WHERE group_id = $1`, [groupId]);
  if (ids.length) {
    await c.query(
      `INSERT INTO addon_group_items (group_id, addon_id, sort_order)
       SELECT $1, a.id, a.ord - 1 FROM unnest($2::int[]) WITH ORDINALITY AS a(id, ord)`,
      [groupId, ids],
    );
  }
}

/**
 * The Add-Ons page's "which services" save: replaces the add-on's hand-made links only. A service that also gets
 * the add-on through a group keeps it (as a group link). With no groups this is exactly the old behaviour:
 * the add-on ends up linked to `serviceIds` and nothing else.
 */
export async function setManualAddonServices(addonId: number, storeId: number | null, serviceIds: number[]): Promise<void> {
  const run = async (c: PoolClient) => {
    let ids = [...new Set(serviceIds)];
    if (storeId != null && ids.length) {
      const { rows } = await c.query(`SELECT id FROM services WHERE id = ANY($1::int[]) AND store_id = $2`, [ids, storeId]);
      const own = new Set(rows.map((r: any) => r.id));
      ids = ids.filter((id) => own.has(id));
    }
    const before = await c.query(`SELECT service_id FROM service_addons WHERE addon_id = $1`, [addonId]);
    await c.query(`DELETE FROM service_addons WHERE addon_id = $1 AND (manual OR service_id = ANY($2::int[]))`, [addonId, ids]);
    if (ids.length) {
      await c.query(
        `INSERT INTO service_addons (service_id, addon_id, manual) SELECT s, $1, true FROM unnest($2::int[]) AS s`,
        [addonId, ids],
      );
    }
    await syncGroupLinks(c, [...before.rows.map((r: any) => r.service_id), ...ids]);
  };
  await withAddonLock(storeId ?? 0, run);
}
