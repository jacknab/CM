/**
 * Certxa Pro checkout extras (owner, 2026-11-15: "match GlossGenius").
 *
 *   GET /api/pro/appointments/:id/checkout       the products on the visit, and what a gift card already paid on it
 *   PUT /api/pro/appointments/:id/products       { items: [{ productId, quantity }] } — the visit's products, priced now
 *
 * Products come out of stock when the booking is paid (migration 0366's trigger), so a checkout left half-way
 * changes nothing. A gift card part-payment is taken by POST /api/pro/appointments/:id/gift-card (routes/certxaPro.ts).
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";

const router = Router();
const id = z.coerce.number().int().positive();

async function store(req: Request, res: Response): Promise<number | null> {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) res.status(403).json({ error: "No store context" });
  return storeId;
}
function unexpected(res: Response, error: unknown) {
  console.error("[pro-checkout] failed", error instanceof Error ? error.message : "unknown error");
  return res.status(500).json({ error: "Something went wrong. Please try again." });
}

async function lines(appointmentId: number) {
  return (await pool.query(
    `SELECT product_id AS "productId", name, price_cents AS "priceCents", quantity FROM appointment_products WHERE appointment_id = $1 ORDER BY id`, [appointmentId])).rows;
}

router.get("/api/pro/appointments/:id/checkout", isAuthenticated, async (req, res) => {
  const aid = id.safeParse(req.params.id);
  if (!aid.success) return res.status(400).json({ error: "Invalid booking" });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const appt = (await pool.query(`SELECT id FROM appointments WHERE id = $1 AND store_id = $2`, [aid.data, storeId])).rows[0];
    if (!appt) return res.status(404).json({ error: "Booking not found" });
    const gift = (await pool.query(
      `SELECT COALESCE(SUM(t.amount), 0) AS amount, MAX(g.code) AS code FROM gift_card_transactions t JOIN gift_cards g ON g.id = t.gift_card_id
        WHERE t.appointment_id = $1 AND t.store_id = $2 AND t.type = 'redemption'`, [aid.data, storeId])).rows[0];
    return res.json({ products: await lines(aid.data), giftCard: { redeemedCents: Math.round(Number(gift.amount) * 100), code: gift.code ?? null } });
  } catch (error) { return unexpected(res, error); }
});

router.put("/api/pro/appointments/:id/products", isAuthenticated, async (req, res) => {
  const aid = id.safeParse(req.params.id);
  const body = z.object({ items: z.array(z.object({ productId: id, quantity: z.number().int().min(1).max(99) }).strict()).max(50) }).strict().safeParse(req.body);
  if (!aid.success || !body.success) return res.status(400).json({ error: "Please check the products." });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const appt = (await pool.query(`SELECT status, total_paid FROM appointments WHERE id = $1 AND store_id = $2`, [aid.data, storeId])).rows[0];
    if (!appt) return res.status(404).json({ error: "Booking not found" });
    if (appt.total_paid != null || appt.status === "cancelled") return res.status(409).json({ error: "This booking is closed." });
    const ids = [...new Set(body.data.items.map((i) => i.productId))];
    const products = ids.length ? (await pool.query(`SELECT id, name, price FROM products WHERE store_id = $1 AND id = ANY($2::int[])`, [storeId, ids])).rows : [];
    if (products.length !== ids.length) return res.status(400).json({ error: "One of the products isn't in your list." });
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query(`DELETE FROM appointment_products WHERE appointment_id = $1`, [aid.data]);
      for (const i of body.data.items) {
        const p = products.find((x) => Number(x.id) === i.productId)!;
        await db.query(`INSERT INTO appointment_products (appointment_id, store_id, product_id, name, price_cents, quantity) VALUES ($1,$2,$3,$4,$5,$6)`,
          [aid.data, storeId, i.productId, p.name, Math.round(Number(p.price) * 100), i.quantity]);
      }
      await db.query("COMMIT");
    } catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
    finally { db.release(); }
    return res.json({ products: await lines(aid.data) });
  } catch (error) { return unexpected(res, error); }
});

export default router;
