/**
 * routes/stationPairing.ts — which POS station a tablet is, and which customer screen goes with it
 *
 * POS tablets (signed-in POS session):
 *   POST /api/registers/my-station          { deviceId } → this tablet's station. Assigned
 *                                           automatically the first time and kept; also the heartbeat.
 *   POST /api/frontdesk/pair                { code, deviceId } → pair the customer screen showing
 *                                           that code with this tablet's station
 *   POST /api/frontdesk/unpair              { deviceId } → let go of this station's customer screen,
 *                                           which then shows a code again
 *   GET  /api/frontdesk/my-salon            the signed-in salon's address name (for screen setup)
 *
 * Customer screens (a device the salon set up — signed in, or paired with the device code):
 *   GET  /api/public/frontdesk/:slug/pairing?screenId=   which station this screen belongs to
 *   POST /api/public/frontdesk/:slug/pair-code           { screenId } → a 4-digit code to show
 *
 * Why: a POS used to pick its station from a list any staff member could reset or "take over", and
 * a customer screen was set up by typing a station number. Wrong picks sent one customer's checkout
 * to another station's screen and became support tickets. Now:
 *   • a POS tablet takes a free station on its own and keeps it. A station counts as held while its
 *     tablet has been seen in the last 7 days; Settings → POS Stations → Release frees it at once.
 *   • a screen shows a code; whoever is at the POS types it. Pairing again replaces the old link, so
 *     a station never has two screens and a screen never has two stations.
 * Salons with a single checkout station need none of this: their screen just uses the salon address.
 * The one tablet and the one screen are still remembered, so both stay "POS #1" when a second
 * station is added (POST /api/registers moves them onto the new POS #1 row).
 */

import { Router } from "express";
import type { Request, Response } from "express";
import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { kioskGate } from "../lib/kioskAccess";
import { broadcastNotification } from "../notifications";

const router = Router();

const STATION_HELD_DAYS = 7;
const CODE_TTL_SEC = 600;
const ID_RE = /^[A-Za-z0-9_.:-]{8,200}$/;

type StationOption = { id: number; name: string };

/** The stations a tablet can be, in order. Mirrors the old picker: a store whose stations predate the
 *  real "POS #1" row still has the original station as id 0. Fewer than two = single-station salon. */
async function stationOptions(storeId: number): Promise<StationOption[]> {
  const rows = (await pool.query(
    `SELECT id, name, is_default FROM registers WHERE store_id = $1 AND is_active = true ORDER BY sort_order, id`,
    [storeId],
  )).rows as { id: number; name: string; is_default: boolean }[];
  if (!rows.length) return [];
  const options = rows.map((r) => ({ id: r.id, name: r.name }));
  return rows.some((r) => r.is_default) ? options : [{ id: 0, name: "POS #1" }, ...options];
}

async function storeBySlug(slug: string) {
  const r = await pool.query(
    `SELECT id, booking_slug, account_status AS "accountStatus", kiosk_permitted AS "kioskPermitted"
       FROM locations WHERE booking_slug = $1 LIMIT 1`,
    [slug],
  );
  return r.rows[0] ?? null;
}

/** The station this POS tablet holds, if any. */
async function stationForDevice(storeId: number, deviceId: string, options: StationOption[]): Promise<StationOption | undefined> {
  const station = (await pool.query(
    `SELECT register_id FROM register_claims WHERE store_id = $1 AND device_id = $2 ORDER BY claimed_at DESC LIMIT 1`,
    [storeId, deviceId],
  )).rows[0];
  return station ? options.find((o) => o.id === station.register_id) : undefined;
}

/** Tells the screens on a station to check their pairing now instead of at their next minute. */
function announcePairingChange(storeId: number, registerId: number) {
  broadcastNotification({ type: "kiosk_checkout_pairing_changed", storeId, registerId });
}

// ── POS tablets ──────────────────────────────────────────────────────────────

router.post("/api/registers/my-station", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(404).json({ message: "Store not found" });
    const deviceId = String(req.body?.deviceId ?? "").trim();
    if (!ID_RE.test(deviceId)) return res.status(400).json({ message: "deviceId is required" });

    const options = await stationOptions(storeId);
    const legacyId = String(req.body?.legacyDeviceId ?? "").trim();
    if (options.length < 2) {
      // One station: nothing to choose, but remember which tablet it is on (the first one seen, kept
      // while it keeps checking in) so that tablet stays POS #1 when a second station is added.
      const only = options[0]?.id ?? 0;
      await pool.query(
        `INSERT INTO register_claims (store_id, register_id, device_id, claimed_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (store_id, register_id) DO UPDATE SET device_id = EXCLUDED.device_id, claimed_at = now()
           WHERE register_claims.device_id IN (EXCLUDED.device_id, $5)
              OR register_claims.claimed_at < now() - ($4 || ' days')::interval`,
        [storeId, only, deviceId, String(STATION_HELD_DAYS), ID_RE.test(legacyId) ? legacyId : ""],
      );
      return res.json({ registerId: only, name: options[0]?.name ?? null, multiStation: false });
    }

    const claims = (await pool.query(
      `SELECT register_id, device_id, claimed_at FROM register_claims WHERE store_id = $1`,
      [storeId],
    )).rows as { register_id: number; device_id: string; claimed_at: string }[];
    const optionById = new Map(options.map((o) => [o.id, o]));

    // Already has a station: keep it (and this call is the heartbeat that keeps it held).
    const mine = claims.filter((c) => c.device_id === deviceId && optionById.has(c.register_id));
    if (mine.length) {
      const keep = mine[0];
      await pool.query(`UPDATE register_claims SET claimed_at = now() WHERE store_id = $1 AND register_id = $2`, [storeId, keep.register_id]);
      if (mine.length > 1) {
        await pool.query(`DELETE FROM register_claims WHERE store_id = $1 AND device_id = $2 AND register_id <> $3`, [storeId, deviceId, keep.register_id]);
      }
      return res.json({ registerId: keep.register_id, name: optionById.get(keep.register_id)!.name, multiStation: true });
    }

    // A tablet identified the old way (a fingerprint that changes when the tablet rotates or the app
    // updates) moves its station over to its stable id, instead of being treated as a new tablet.
    if (ID_RE.test(legacyId) && legacyId !== deviceId) {
      const moved = (await pool.query(
        `UPDATE register_claims SET device_id = $3, claimed_at = now()
          WHERE store_id = $1 AND device_id = $2
          RETURNING register_id`,
        [storeId, legacyId, deviceId],
      )).rows.find((r: any) => optionById.has(r.register_id));
      if (moved) return res.json({ registerId: moved.register_id, name: optionById.get(moved.register_id)!.name, multiStation: true });
    }

    // New tablet: the first station nobody holds (never held, or its tablet unseen for a week).
    // The conditional upsert makes two tablets starting at once land on different stations.
    for (const o of options) {
      const r = await pool.query(
        `INSERT INTO register_claims (store_id, register_id, device_id, claimed_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (store_id, register_id) DO UPDATE SET device_id = EXCLUDED.device_id, claimed_at = now()
           WHERE register_claims.claimed_at < now() - ($4 || ' days')::interval
         RETURNING register_id`,
        [storeId, o.id, deviceId, String(STATION_HELD_DAYS)],
      );
      if (r.rows.length) {
        console.log(`[stations] store ${storeId}: a POS tablet took ${o.name}`);
        return res.json({ registerId: o.id, name: o.name, multiStation: true });
      }
    }
    return res.json({ registerId: null, name: null, multiStation: true, allTaken: true });
  } catch (err) {
    console.error("[POST /api/registers/my-station]", (err as Error)?.message);
    return res.status(500).json({ message: "Failed to resolve this tablet's station" });
  }
});

router.get("/api/frontdesk/my-salon", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(404).json({ message: "Store not found" });
    const r = await pool.query(`SELECT booking_slug FROM locations WHERE id = $1`, [storeId]);
    return res.json({ slug: r.rows[0]?.booking_slug ?? null });
  } catch (err) {
    console.error("[GET /api/frontdesk/my-salon]", (err as Error)?.message);
    return res.status(500).json({ message: "Failed to load the salon" });
  }
});

const pairLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Wait a few minutes and try again." },
});

router.post("/api/frontdesk/pair", pairLimiter, isAuthenticated, async (req: Request, res: Response) => {
  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(404).json({ error: "Store not found" });
    const code = String(req.body?.code ?? "").replace(/\D/g, "");
    const deviceId = String(req.body?.deviceId ?? "").trim();
    if (code.length !== 4) return res.status(400).json({ error: "Enter the 4-digit code shown on the customer screen." });
    if (!ID_RE.test(deviceId)) return res.status(400).json({ error: "This tablet couldn't be identified. Reload and try again." });

    const options = await stationOptions(storeId);
    if (options.length < 2) {
      return res.status(400).json({ error: "This salon has one checkout station, so its customer screen doesn't need pairing." });
    }
    const stationOption = await stationForDevice(storeId, deviceId, options);
    if (!stationOption) return res.status(409).json({ error: "This tablet isn't linked to a POS station yet. Reload the POS and try again." });

    const client = await pool.connect();
    let pending: { screen_id: string } | undefined;
    try {
      await client.query("BEGIN");
      // The code is used up inside the same transaction that pairs: two POS tablets typing one code at
      // the same moment can't both be told they paired — the second finds no code.
      pending = (await client.query(
        `DELETE FROM frontdesk_pair_codes WHERE store_id = $1 AND code = $2 AND expires_at > now() RETURNING screen_id`,
        [storeId, code],
      )).rows[0];
      if (!pending) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "That code didn't match a customer screen. Check the code on the screen and try again." });
      }
      // Pairing replaces: this station's old screen, and this screen's old station, are let go.
      await client.query(
        `DELETE FROM frontdesk_screens WHERE store_id = $1 AND (register_id = $2 OR screen_id = $3)`,
        [storeId, stationOption.id, pending.screen_id],
      );
      await client.query(
        `INSERT INTO frontdesk_screens (store_id, screen_id, register_id) VALUES ($1, $2, $3)`,
        [storeId, pending.screen_id, stationOption.id],
      );
      await client.query(`DELETE FROM frontdesk_pair_codes WHERE store_id = $1 AND screen_id = $2`, [storeId, pending.screen_id]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    console.log(`[stations] store ${storeId}: customer screen paired with ${stationOption.name}`);
    // The screen this station had before is still listening on it: send it back to setup now.
    announcePairingChange(storeId, stationOption.id);
    return res.json({ ok: true, stationName: stationOption.name, registerId: stationOption.id });
  } catch (err) {
    console.error("[POST /api/frontdesk/pair]", (err as Error)?.message);
    return res.status(500).json({ error: "Couldn't pair the screen. Try again." });
  }
});

// Lets go of this station's screen, so that screen shows a code and can be paired where it belongs.
// A paired screen shows no code, so without this two screens on each other's stations can't be swapped.
router.post("/api/frontdesk/unpair", pairLimiter, isAuthenticated, async (req: Request, res: Response) => {
  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(404).json({ error: "Store not found" });
    const deviceId = String(req.body?.deviceId ?? "").trim();
    if (!ID_RE.test(deviceId)) return res.status(400).json({ error: "This tablet couldn't be identified. Reload and try again." });

    const options = await stationOptions(storeId);
    if (options.length < 2) {
      return res.status(400).json({ error: "This salon has one checkout station, so its customer screen doesn't need pairing." });
    }
    const stationOption = await stationForDevice(storeId, deviceId, options);
    if (!stationOption) return res.status(409).json({ error: "This tablet isn't linked to a POS station yet. Reload the POS and try again." });

    const removed = await pool.query(
      `DELETE FROM frontdesk_screens WHERE store_id = $1 AND register_id = $2`,
      [storeId, stationOption.id],
    );
    const unpaired = (removed.rowCount ?? 0) > 0;
    if (unpaired) {
      console.log(`[stations] store ${storeId}: customer screen unpaired from ${stationOption.name}`);
      announcePairingChange(storeId, stationOption.id);
    }
    return res.json({ ok: true, unpaired, stationName: stationOption.name });
  } catch (err) {
    console.error("[POST /api/frontdesk/unpair]", (err as Error)?.message);
    return res.status(500).json({ error: "Couldn't unpair the screen. Try again." });
  }
});

// ── Customer screens ─────────────────────────────────────────────────────────

router.get("/api/public/frontdesk/:slug/pairing", async (req: Request, res: Response) => {
  try {
    const store = await storeBySlug(String(req.params.slug));
    if (!store) return res.status(404).json({ error: "Store not found" });
    if (!(await kioskGate(req, res, store))) return;
    res.setHeader("Cache-Control", "no-store");

    const options = await stationOptions(store.id);
    const screenId = String(req.query.screenId ?? "");
    if (options.length < 2) {
      // One station: no pairing needed, but remember which screen it has (the first one seen, kept
      // while it keeps checking in) so that screen stays with POS #1 when a second station is added.
      const only = options[0]?.id ?? 0;
      if (ID_RE.test(screenId)) {
        try {
          await pool.query(`DELETE FROM frontdesk_screens WHERE store_id = $1 AND screen_id = $2 AND register_id <> $3`, [store.id, screenId, only]);
          await pool.query(
            `INSERT INTO frontdesk_screens (store_id, screen_id, register_id, last_seen_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (store_id, register_id) DO UPDATE SET screen_id = EXCLUDED.screen_id, last_seen_at = now()
               WHERE frontdesk_screens.screen_id = EXCLUDED.screen_id
                  OR frontdesk_screens.last_seen_at IS NULL
                  OR frontdesk_screens.last_seen_at < now() - interval '1 day'`,
            [store.id, screenId, only],
          );
        } catch (err) {
          console.error("[GET frontdesk pairing] remembering the screen", (err as Error)?.message);
        }
      }
      return res.json({ multiStation: false, registerId: only, stationName: options[0]?.name ?? null });
    }
    if (!ID_RE.test(screenId)) return res.status(400).json({ error: "screenId is required" });
    const row = (await pool.query(
      `UPDATE frontdesk_screens SET last_seen_at = now() WHERE store_id = $1 AND screen_id = $2 RETURNING register_id`,
      [store.id, screenId],
    )).rows[0];
    const station = row ? options.find((o) => o.id === row.register_id) : undefined;
    return res.json({ multiStation: true, registerId: station?.id ?? null, stationName: station?.name ?? null });
  } catch (err) {
    console.error("[GET frontdesk pairing]", (err as Error)?.message);
    return res.status(500).json({ error: "Couldn't check this screen's pairing" });
  }
});

// The customer screen asking for a code has its own allowance: a salon's tablets all share one internet
// address, and screens re-requesting codes must not use up the attempts staff need to type one in.
const pairCodeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Wait a few minutes and try again." },
});

router.post("/api/public/frontdesk/:slug/pair-code", pairCodeLimiter, async (req: Request, res: Response) => {
  try {
    const store = await storeBySlug(String(req.params.slug));
    if (!store) return res.status(404).json({ error: "Store not found" });
    if (!(await kioskGate(req, res, store))) return;
    const screenId = String(req.body?.screenId ?? "");
    if (!ID_RE.test(screenId)) return res.status(400).json({ error: "screenId is required" });

    await pool.query(`DELETE FROM frontdesk_pair_codes WHERE store_id = $1 AND (expires_at <= now() OR screen_id = $2)`, [store.id, screenId]);
    for (let attempt = 0; attempt < 25; attempt++) {
      const code = String(crypto.randomInt(10_000)).padStart(4, "0");
      const r = await pool.query(
        `INSERT INTO frontdesk_pair_codes (store_id, code, screen_id, expires_at)
         VALUES ($1, $2, $3, now() + ($4 || ' seconds')::interval)
         ON CONFLICT (store_id, code) DO NOTHING
         RETURNING code`,
        [store.id, code, screenId, String(CODE_TTL_SEC)],
      );
      if (r.rows.length) return res.json({ code, expiresInSec: CODE_TTL_SEC });
    }
    return res.status(503).json({ error: "Couldn't make a code. Try again." });
  } catch (err) {
    console.error("[POST frontdesk pair-code]", (err as Error)?.message);
    return res.status(500).json({ error: "Couldn't make a code. Try again." });
  }
});

export default router;
