/**
 * routes/kioskDevice.ts — setting a kiosk / customer-screen browser up for a salon
 *
 *   GET  /api/public/kiosk/:slug/device                     is this browser set up for the salon?
 *   POST /api/public/kiosk/:slug/pair                       { code } → { token }  (rate limited)
 *   POST /api/public/kiosk/:slug/checkin/:token/cancel      a client typed their number, then left
 *
 * Pairing uses the salon's device code (Settings → POS Stations): the same 12-digit code that sets
 * up a POS or customer-screen tablet in the Certxa owner app. A browser running inside the owner
 * app is already signed in for the salon and never needs pairing. See lib/kioskAccess.ts.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import { pool } from "../db";
import { resolveActivationCode } from "../lib/activationCodes";
import { deviceAuthorizedFor, kioskGate, sha256 } from "../lib/kioskAccess";

const router = Router();

async function storeBySlug(slug: string) {
  const r = await pool.query(
    `SELECT id, name, booking_slug, account_status AS "accountStatus", kiosk_permitted AS "kioskPermitted"
       FROM locations WHERE booking_slug = $1 LIMIT 1`,
    [slug],
  );
  return r.rows[0] ?? null;
}

router.get("/api/public/kiosk/:slug/device", async (req: Request, res: Response) => {
  try {
    const store = await storeBySlug(String(req.params.slug));
    if (!store) return res.status(404).json({ error: "Store not found" });
    const via = await deviceAuthorizedFor(req, store.id);
    res.setHeader("Cache-Control", "no-store");
    res.json({ authorized: !!via, via });
  } catch (err) {
    console.error("[kiosk/device]", (err as Error)?.message);
    res.status(500).json({ error: "Could not check this device" });
  }
});

const pairLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Wait a few minutes and try again." },
});

router.post("/api/public/kiosk/:slug/pair", pairLimiter, async (req: Request, res: Response) => {
  try {
    const store = await storeBySlug(String(req.params.slug));
    if (!store) return res.status(404).json({ error: "Store not found" });
    const code = String(req.body?.code ?? "").replace(/\D/g, "");
    const match = code.length >= 6 ? await resolveActivationCode(code) : null;
    // Every failure gives the same answer, so the endpoint says nothing about which codes exist.
    if (!match || match.slug !== store.booking_slug) {
      return res.status(400).json({ error: "That code didn't work. Check Settings → POS Stations for this salon's device code." });
    }
    const token = crypto.randomBytes(32).toString("hex");
    await pool.query(
      `INSERT INTO kiosk_devices (store_id, token_hash, user_agent) VALUES ($1, $2, $3)`,
      [store.id, sha256(token), String(req.headers["user-agent"] ?? "").slice(0, 300)],
    );
    console.log("[kiosk/pair] device paired for store", store.id);
    res.json({ token, storeName: store.name });
  } catch (err) {
    console.error("[kiosk/pair]", (err as Error)?.message);
    res.status(500).json({ error: "Could not set this device up. Try again." });
  }
});

// A returning client's phone number puts them on staff's Arrived list straight away (the lookup).
// When they then tap "No thanks" or walk away, the kiosk takes that entry back off. Only an entry
// that never became a ticket can be cancelled this way.
router.post("/api/public/kiosk/:slug/checkin/:token/cancel", async (req: Request, res: Response) => {
  try {
    const store = await storeBySlug(String(req.params.slug));
    if (!store) return res.status(404).json({ error: "Store not found" });
    if (!(await kioskGate(req, res, store))) return;
    const token = String(req.params.token);
    if (!/^[0-9a-f]{16,128}$/i.test(token)) return res.status(400).json({ error: "Invalid check-in" });
    const r = await pool.query(
      `UPDATE kiosk_checkins SET status = 'expired'
        WHERE token = $1 AND store_id = $2 AND appointment_id IS NULL AND status IN ('waiting', 'called')
        RETURNING id`,
      [token, store.id],
    );
    res.json({ ok: true, cancelled: r.rows.length > 0 });
  } catch (err) {
    console.error("[kiosk/checkin-cancel]", (err as Error)?.message);
    res.status(500).json({ error: "Could not cancel the check-in" });
  }
});

export default router;
