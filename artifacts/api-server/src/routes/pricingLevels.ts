/**
 * Pricing levels — the owner's side (owner, 2026-11-02; lib/pricingLevels.ts, migration 0289). Barbershops and hair
 * salons only; any other business is told the feature is not for it.
 *
 *   GET    /api/pricing-levels                    everything the Pricing Levels page shows
 *   POST   /api/pricing-levels                    { name, description? } a new level
 *   PATCH  /api/pricing-levels/:id                { name?, description?, sortOrder?, active? }
 *   DELETE /api/pricing-levels/:id                only when nobody is on it (409 with who is, otherwise)
 *   PUT    /api/pricing-levels/:id/prices         { prices: [{ serviceId, price: number | null }] }
 *   PUT    /api/staff/:id/pricing-level           { levelId: number | null }
 *   PUT    /api/staff/:id/service-price           { serviceId, price: number | null } — their own price (null: none)
 *
 * Past appointments keep the price and level name they were booked with; nothing here changes them.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { missingPrices, usesPricingLevels } from "../lib/pricingLevels";

const router = Router();
const price = z.number().finite().min(0).max(100000);

/** The session's store, when it is a barbershop or hair salon. */
async function levelStore(req: Request, res: Response): Promise<number | null> {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(403).json({ message: "No store context" }); return null; }
  const { rows } = await pool.query(`SELECT category FROM locations WHERE id = $1`, [storeId]);
  if (!usesPricingLevels(rows[0]?.category)) { res.status(404).json({ message: "Pricing levels are for barbershops and hair salons." }); return null; }
  return storeId;
}
const ownLevel = async (storeId: number, id: number) =>
  (await pool.query(`SELECT id FROM pricing_levels WHERE id = $1 AND store_id = $2`, [id, storeId])).rowCount === 1;
const ownStaff = async (storeId: number, id: number) =>
  (await pool.query(`SELECT id FROM staff WHERE id = $1 AND store_id = $2`, [id, storeId])).rowCount === 1;

router.get("/api/pricing-levels", isAuthenticated, async (req, res) => {
  try {
    const storeId = await levelStore(req, res); if (!storeId) return;
    const [levels, services, levelPrices, staff, overrides, missing] = await Promise.all([
      pool.query(`SELECT id, name, description, sort_order, is_active FROM pricing_levels WHERE store_id = $1 ORDER BY sort_order, id`, [storeId]),
      pool.query(`SELECT s.id, s.name, s.price, COALESCE(c.name, s.category) AS category, COALESCE(c.sort_order, 9999) AS cat_order
                    FROM services s LEFT JOIN service_categories c ON c.id = s.category_id
                   WHERE s.store_id = $1 AND s.is_active ORDER BY cat_order, category, s.id`, [storeId]),
      pool.query(`SELECT slp.service_id, slp.pricing_level_id, slp.price FROM service_level_prices slp
                    JOIN pricing_levels pl ON pl.id = slp.pricing_level_id WHERE pl.store_id = $1`, [storeId]),
      pool.query(`SELECT id, name, pricing_level_id FROM staff WHERE store_id = $1 AND COALESCE(status, 'active') NOT IN ('removed', 'deactivated') ORDER BY name`, [storeId]),
      pool.query(`SELECT ss.staff_id, ss.service_id, ss.price_override FROM staff_services ss JOIN staff st ON st.id = ss.staff_id
                   WHERE st.store_id = $1`, [storeId]),
      missingPrices(storeId),
    ]);
    return res.json({
      levels: levels.rows.map((r: any) => ({ id: r.id, name: r.name, description: r.description, sortOrder: r.sort_order, active: r.is_active })),
      services: services.rows.map((r: any) => ({ id: r.id, name: r.name, category: r.category, price: Number(r.price) })),
      levelPrices: levelPrices.rows.map((r: any) => ({ serviceId: r.service_id, levelId: r.pricing_level_id, price: Number(r.price) })),
      staff: staff.rows.map((r: any) => ({ id: r.id, name: r.name, levelId: r.pricing_level_id ?? null })),
      // Who does what, with their own price where they have one.
      staffServices: overrides.rows.map((r: any) => ({ staffId: r.staff_id, serviceId: r.service_id, price: r.price_override != null ? Number(r.price_override) : null })),
      missing,
    });
  } catch (err: any) {
    console.error("[pricing-levels get]", err?.message ?? err);
    return res.status(500).json({ message: "Could not load the pricing levels" });
  }
});

router.post("/api/pricing-levels", isAuthenticated, async (req, res) => {
  try {
    const storeId = await levelStore(req, res); if (!storeId) return;
    const body = z.object({ name: z.string().trim().min(1).max(40), description: z.string().trim().max(200).optional() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "Give the level a name (up to 40 letters)." });
    const { rows } = await pool.query(
      `INSERT INTO pricing_levels (store_id, name, description, sort_order)
       VALUES ($1, $2, $3, COALESCE((SELECT MAX(sort_order) + 1 FROM pricing_levels WHERE store_id = $1), 0)) RETURNING id`,
      [storeId, body.data.name, body.data.description || null],
    );
    return res.status(201).json({ id: rows[0].id });
  } catch (err: any) {
    console.error("[pricing-levels create]", err?.message ?? err);
    return res.status(500).json({ message: "Could not add the level" });
  }
});

router.patch("/api/pricing-levels/:id", isAuthenticated, async (req, res) => {
  try {
    const storeId = await levelStore(req, res); if (!storeId) return;
    const id = Number(req.params.id);
    if (!(await ownLevel(storeId, id))) return res.status(404).json({ message: "Level not found" });
    const body = z.object({ name: z.string().trim().min(1).max(40).optional(), description: z.string().trim().max(200).nullable().optional(),
      sortOrder: z.number().int().min(0).max(1000).optional(), active: z.boolean().optional() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "Check the level's name." });
    const d = body.data;
    await pool.query(
      `UPDATE pricing_levels SET name = COALESCE($3, name), description = CASE WHEN $4::boolean THEN $5 ELSE description END,
              sort_order = COALESCE($6, sort_order), is_active = COALESCE($7, is_active) WHERE id = $1 AND store_id = $2`,
      [id, storeId, d.name ?? null, d.description !== undefined, d.description || null, d.sortOrder ?? null, d.active ?? null],
    );
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[pricing-levels update]", err?.message ?? err);
    return res.status(500).json({ message: "Could not save the level" });
  }
});

router.delete("/api/pricing-levels/:id", isAuthenticated, async (req, res) => {
  try {
    const storeId = await levelStore(req, res); if (!storeId) return;
    const id = Number(req.params.id);
    if (!(await ownLevel(storeId, id))) return res.status(404).json({ message: "Level not found" });
    // Never leaves someone on a level that is gone: they are moved first (or the level is switched off instead).
    const onIt = await pool.query(`SELECT name FROM staff WHERE pricing_level_id = $1 AND COALESCE(status, 'active') NOT IN ('removed', 'deactivated') ORDER BY name`, [id]);
    if (onIt.rowCount) return res.status(409).json({ message: `Move ${onIt.rows.map((r: any) => r.name).join(", ")} to another level first, or switch this level off.`, staff: onIt.rows.map((r: any) => r.name) });
    // Past team members on it keep no level; past appointments keep the level's name they were booked with.
    await pool.query(`UPDATE staff SET pricing_level_id = NULL WHERE pricing_level_id = $1`, [id]);
    await pool.query(`DELETE FROM pricing_levels WHERE id = $1 AND store_id = $2`, [id, storeId]);
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[pricing-levels delete]", err?.message ?? err);
    return res.status(500).json({ message: "Could not delete the level" });
  }
});

router.put("/api/pricing-levels/:id/prices", isAuthenticated, async (req, res) => {
  try {
    const storeId = await levelStore(req, res); if (!storeId) return;
    const id = Number(req.params.id);
    if (!(await ownLevel(storeId, id))) return res.status(404).json({ message: "Level not found" });
    const body = z.object({ prices: z.array(z.object({ serviceId: z.number().int().positive(), price: price.nullable() })).max(500) }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "Prices must be $0 or more." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const p of body.data.prices) {
        const own = await client.query(`SELECT 1 FROM services WHERE id = $1 AND store_id = $2`, [p.serviceId, storeId]);
        if (!own.rowCount) continue;
        if (p.price == null) await client.query(`DELETE FROM service_level_prices WHERE service_id = $1 AND pricing_level_id = $2`, [p.serviceId, id]);
        else await client.query(
          `INSERT INTO service_level_prices (service_id, pricing_level_id, price) VALUES ($1, $2, $3)
           ON CONFLICT (service_id, pricing_level_id) DO UPDATE SET price = EXCLUDED.price`, [p.serviceId, id, p.price.toFixed(2)]);
      }
      await client.query("COMMIT");
    } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[pricing-levels prices]", err?.message ?? err);
    return res.status(500).json({ message: "Could not save the prices" });
  }
});

router.put("/api/staff/:id/pricing-level", isAuthenticated, async (req, res) => {
  try {
    const storeId = await levelStore(req, res); if (!storeId) return;
    const staffId = Number(req.params.id);
    if (!(await ownStaff(storeId, staffId))) return res.status(404).json({ message: "Team member not found" });
    const levelId = req.body?.levelId == null ? null : Number(req.body.levelId);
    if (levelId != null && !(await ownLevel(storeId, levelId))) return res.status(404).json({ message: "Level not found" });
    await pool.query(`UPDATE staff SET pricing_level_id = $2 WHERE id = $1`, [staffId, levelId]);
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[staff pricing-level]", err?.message ?? err);
    return res.status(500).json({ message: "Could not change the level" });
  }
});

router.put("/api/staff/:id/service-price", isAuthenticated, async (req, res) => {
  try {
    const storeId = await levelStore(req, res); if (!storeId) return;
    const staffId = Number(req.params.id);
    if (!(await ownStaff(storeId, staffId))) return res.status(404).json({ message: "Team member not found" });
    const body = z.object({ serviceId: z.number().int().positive(), price: price.nullable() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "The price must be $0 or more." });
    const r = await pool.query(`UPDATE staff_services SET price_override = $3 WHERE staff_id = $1 AND service_id = $2`,
      [staffId, body.data.serviceId, body.data.price == null ? null : body.data.price.toFixed(2)]);
    if (!r.rowCount) return res.status(409).json({ message: "They don't do this service. Add it to their services first." });
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[staff service-price]", err?.message ?? err);
    return res.status(500).json({ message: "Could not save their price" });
  }
});

export default router;
