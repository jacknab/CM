/**
 * Add-on Groups — the owner's side (owner, 2026-11-05; lib/addonGroups.ts, migration 0320). Web Catalog › Add-on
 * Groups and the Certxa Pro app's Catalog both use these.
 *
 *   GET    /api/addon-groups                     every group: { id, name, sortOrder, addonIds (in order), serviceIds }
 *   POST   /api/addon-groups                     { name, addonIds? } a new group
 *   PATCH  /api/addon-groups/:id                 { name?, addonIds? } addonIds replaces the list, in that order
 *   DELETE /api/addon-groups/:id                 the group and its links (hand-made links stay)
 *   POST   /api/addon-groups/:id/duplicate       { name } a separate copy: same add-ons and order, no services
 *   GET    /api/services/:id/addon-groups        { groupIds }
 *   PUT    /api/services/:id/addon-groups        { groupIds } the service's groups
 *
 * Everything is the session's salon only: groups, add-ons and services of another salon are refused or ignored.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { servicesOfGroup, setGroupItems, syncGroupLinks, withAddonLock } from "../lib/addonGroups";

const router = Router();
const name = z.string().trim().min(1, "Enter a group name.").max(80);
const ids = z.array(z.number().int().positive()).max(500);

async function storeOf(req: Request, res: Response): Promise<number | null> {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) res.status(403).json({ message: "No store context" });
  return storeId;
}

const ownGroup = async (storeId: number, id: number) =>
  (await pool.query(`SELECT id FROM addon_groups WHERE id = $1 AND store_id = $2`, [id, storeId])).rowCount === 1;

/** The ids among `addonIds` that are this salon's add-ons, in the order given. */
async function ownAddons(storeId: number, addonIds: number[]): Promise<number[] | null> {
  if (!addonIds.length) return [];
  const { rows } = await pool.query(`SELECT id FROM addons WHERE id = ANY($1::int[]) AND store_id = $2`, [addonIds, storeId]);
  const own = new Set(rows.map((r: any) => r.id));
  return addonIds.every((id) => own.has(id)) ? addonIds : null;
}

/** True when another group of the salon already has this name (any case). */
const nameTaken = async (storeId: number, groupName: string, exceptId = 0) =>
  ((await pool.query(`SELECT 1 FROM addon_groups WHERE store_id = $1 AND lower(name) = lower($2) AND id <> $3`, [storeId, groupName, exceptId])).rowCount ?? 0) > 0;
const TAKEN = "A group with this name already exists.";

function badInput(res: Response, error: z.ZodError) {
  return res.status(400).json({ message: error.issues[0]?.message ?? "Invalid input" });
}

router.get("/api/addon-groups", isAuthenticated, async (req, res) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const [groups, items, services] = await Promise.all([
      pool.query(`SELECT id, name, sort_order FROM addon_groups WHERE store_id = $1 ORDER BY sort_order, lower(name), id`, [storeId]),
      pool.query(`SELECT agi.group_id, agi.addon_id FROM addon_group_items agi JOIN addon_groups g ON g.id = agi.group_id
                   WHERE g.store_id = $1 ORDER BY agi.sort_order, agi.id`, [storeId]),
      pool.query(`SELECT sag.group_id, sag.service_id FROM service_addon_groups sag JOIN addon_groups g ON g.id = sag.group_id
                   WHERE g.store_id = $1 ORDER BY sag.id`, [storeId]),
    ]);
    return res.json(groups.rows.map((g: any) => ({
      id: g.id,
      name: g.name,
      sortOrder: g.sort_order,
      addonIds: items.rows.filter((r: any) => r.group_id === g.id).map((r: any) => r.addon_id),
      serviceIds: services.rows.filter((r: any) => r.group_id === g.id).map((r: any) => r.service_id),
    })));
  } catch (error) {
    console.error("[addon-groups] list failed", error);
    return res.status(500).json({ message: "Failed to load add-on groups" });
  }
});

router.post("/api/addon-groups", isAuthenticated, async (req, res) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const parsed = z.object({ name, addonIds: ids.optional() }).safeParse(req.body);
    if (!parsed.success) return badInput(res, parsed.error);
    const addonIds = await ownAddons(storeId, [...new Set(parsed.data.addonIds ?? [])]);
    if (!addonIds) return res.status(400).json({ message: "One of those add-ons isn't in this salon." });
    if (await nameTaken(storeId, parsed.data.name)) return res.status(409).json({ message: TAKEN });
    const id = await withAddonLock(storeId, async (c) => {
      const { rows } = await c.query(
        `INSERT INTO addon_groups (store_id, name, sort_order)
         VALUES ($1, $2, (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM addon_groups WHERE store_id = $1)) RETURNING id`,
        [storeId, parsed.data.name],
      );
      await setGroupItems(c, rows[0].id, addonIds);
      return rows[0].id as number;
    });
    return res.status(201).json({ id });
  } catch (error) {
    console.error("[addon-groups] create failed", error);
    return res.status(500).json({ message: "Failed to create the group" });
  }
});

router.patch("/api/addon-groups/:id", isAuthenticated, async (req, res) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const id = Number(req.params.id);
    if (!(await ownGroup(storeId, id))) return res.status(404).json({ message: "Group not found" });
    const parsed = z.object({ name: name.optional(), addonIds: ids.optional() }).safeParse(req.body);
    if (!parsed.success) return badInput(res, parsed.error);
    const addonIds = parsed.data.addonIds ? await ownAddons(storeId, [...new Set(parsed.data.addonIds)]) : undefined;
    if (addonIds === null) return res.status(400).json({ message: "One of those add-ons isn't in this salon." });
    if (parsed.data.name && await nameTaken(storeId, parsed.data.name, id)) return res.status(409).json({ message: TAKEN });
    await withAddonLock(storeId, async (c) => {
      if (parsed.data.name) await c.query(`UPDATE addon_groups SET name = $1 WHERE id = $2`, [parsed.data.name, id]);
      if (addonIds) {
        await setGroupItems(c, id, addonIds);
        await syncGroupLinks(c, await servicesOfGroup(c, id));
      }
    });
    return res.json({ id });
  } catch (error) {
    console.error("[addon-groups] update failed", error);
    return res.status(500).json({ message: "Failed to save the group" });
  }
});

router.delete("/api/addon-groups/:id", isAuthenticated, async (req, res) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const id = Number(req.params.id);
    if (!(await ownGroup(storeId, id))) return res.status(404).json({ message: "Group not found" });
    await withAddonLock(storeId, async (c) => {
      const services = await servicesOfGroup(c, id);
      await c.query(`DELETE FROM addon_groups WHERE id = $1`, [id]); // items and assignments go with it (cascade)
      await syncGroupLinks(c, services);
    });
    return res.status(204).end();
  } catch (error) {
    console.error("[addon-groups] delete failed", error);
    return res.status(500).json({ message: "Failed to delete the group" });
  }
});

router.post("/api/addon-groups/:id/duplicate", isAuthenticated, async (req, res) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const id = Number(req.params.id);
    if (!(await ownGroup(storeId, id))) return res.status(404).json({ message: "Group not found" });
    const parsed = z.object({ name }).safeParse(req.body);
    if (!parsed.success) return badInput(res, parsed.error);
    if (await nameTaken(storeId, parsed.data.name)) return res.status(409).json({ message: TAKEN });
    const newId = await withAddonLock(storeId, async (c) => {
      const { rows } = await c.query(
        `INSERT INTO addon_groups (store_id, name, sort_order)
         VALUES ($1, $2, (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM addon_groups WHERE store_id = $1)) RETURNING id`,
        [storeId, parsed.data.name],
      );
      // Same add-ons in the same order; the copy starts with no services.
      await c.query(
        `INSERT INTO addon_group_items (group_id, addon_id, sort_order)
         SELECT $1, addon_id, sort_order FROM addon_group_items WHERE group_id = $2`,
        [rows[0].id, id],
      );
      return rows[0].id as number;
    });
    return res.status(201).json({ id: newId });
  } catch (error) {
    console.error("[addon-groups] duplicate failed", error);
    return res.status(500).json({ message: "Failed to duplicate the group" });
  }
});

const ownService = async (storeId: number, id: number) =>
  (await pool.query(`SELECT id FROM services WHERE id = $1 AND store_id = $2`, [id, storeId])).rowCount === 1;

router.get("/api/services/:id/addon-groups", isAuthenticated, async (req, res) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const id = Number(req.params.id);
    if (!(await ownService(storeId, id))) return res.status(404).json({ message: "Service not found" });
    const { rows } = await pool.query(`SELECT group_id FROM service_addon_groups WHERE service_id = $1 ORDER BY id`, [id]);
    return res.json({ groupIds: rows.map((r: any) => r.group_id) });
  } catch (error) {
    console.error("[addon-groups] service groups failed", error);
    return res.status(500).json({ message: "Failed to load the service's add-on groups" });
  }
});

router.put("/api/services/:id/addon-groups", isAuthenticated, async (req, res) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const id = Number(req.params.id);
    if (!(await ownService(storeId, id))) return res.status(404).json({ message: "Service not found" });
    const parsed = z.object({ groupIds: ids }).safeParse(req.body);
    if (!parsed.success) return badInput(res, parsed.error);
    const wanted = [...new Set(parsed.data.groupIds)];
    if (wanted.length) {
      const { rows } = await pool.query(`SELECT id FROM addon_groups WHERE id = ANY($1::int[]) AND store_id = $2`, [wanted, storeId]);
      if (rows.length !== wanted.length) return res.status(400).json({ message: "One of those groups isn't in this salon." });
    }
    await withAddonLock(storeId, async (c) => {
      await c.query(`DELETE FROM service_addon_groups WHERE service_id = $1 AND NOT (group_id = ANY($2::int[]))`, [id, wanted]);
      if (wanted.length) {
        await c.query(
          `INSERT INTO service_addon_groups (service_id, group_id) SELECT $1, g FROM unnest($2::int[]) AS g
           ON CONFLICT (service_id, group_id) DO NOTHING`,
          [id, wanted],
        );
      }
      await syncGroupLinks(c, [id]);
    });
    return res.json({ groupIds: wanted });
  } catch (error) {
    console.error("[addon-groups] set service groups failed", error);
    return res.status(500).json({ message: "Failed to save the service's add-on groups" });
  }
});

export default router;
