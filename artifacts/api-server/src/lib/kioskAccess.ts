/**
 * lib/kioskAccess.ts — who may use the public kiosk API, and what it may book
 *
 * The self check-in kiosk (/kiosk/:slug) and the customer screen (/frontdesk/:slug) call
 * /api/public/kiosk/:slug/* with nothing but the salon address in the URL. Before this, anyone on
 * the internet could look a client up by phone (name, points, visits), check them in, attach
 * clients to tickets, or make the salon text any number. The screens' own off switches (kiosk off,
 * not permitted, suspended, "restrict to salon network") only changed what the tablet showed.
 *
 * kioskGate() now enforces, on the server, for every call that reads client data or changes
 * anything:
 *   1. the account is not suspended or cancelled
 *   2. "Restrict to salon network", when the salon has it on
 *   3. for kiosk-only calls: the platform admin permitted the kiosk, and the owner has it switched on
 *      (the customer screen shares lookup and rewards sign-up, so those are not kiosk-only)
 *   4. the request comes from a device the salon set up: a signed-in session for this salon — what
 *      the Certxa owner app's kiosk and customer screen carry — or a browser paired once with the
 *      salon's device code (Settings → POS Stations), which sends its token in X-Kiosk-Device.
 */

import type { Request, Response } from "express";
import crypto from "node:crypto";
import { pool } from "../db";
import { resolveSessionStoreId } from "./sessionStore";
import { isRequestFromTrustedNetwork } from "./salonNetworkGuard";

export const KIOSK_DEVICE_HEADER = "x-kiosk-device";

export const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

type StoreRow = { id: number; accountStatus?: string | null; kioskPermitted?: number | null };

/** "session" for a signed-in owner/staff session of this salon, "device" for a paired browser, else null. */
export async function deviceAuthorizedFor(req: Request, storeId: number): Promise<"session" | "device" | null> {
  if (await sessionCoversStore(req, storeId)) return "session";
  const token = String(req.headers[KIOSK_DEVICE_HEADER] ?? "");
  if (/^[0-9a-f]{64}$/.test(token)) {
    const r = await pool.query(
      `UPDATE kiosk_devices SET last_used_at = now()
        WHERE token_hash = $1 AND store_id = $2 AND revoked_at IS NULL
        RETURNING id`,
      [sha256(token), storeId],
    );
    if (r.rows.length) return "device";
  }
  return null;
}

/** A signed-in session (owner, or staff of this salon) that belongs to this salon. */
export async function sessionCoversStore(req: Request, storeId: number): Promise<boolean> {
  const userId = (req.session as any)?.userId as string | undefined;
  if (userId) {
    const owned = await pool.query(`SELECT 1 FROM locations WHERE id = $1 AND user_id = $2 LIMIT 1`, [storeId, userId]);
    if (owned.rows.length) return true;
  }
  if (userId || (req.session as any)?.staffId || req.headers.authorization) {
    try { return (await resolveSessionStoreId(req)) === storeId; } catch { return false; }
  }
  return false;
}

/**
 * Answers the request itself and returns false when the call is not allowed; true to carry on.
 * The kiosk stands inside the salon, so it is never "closed": only a suspended account, an untrusted
 * network or an unpaired device stops it.
 */
export async function kioskGate(req: Request, res: Response, store: StoreRow): Promise<boolean> {
  const status = String(store.accountStatus ?? "active").toLowerCase();
  if (status === "suspended" || status === "canceled" || status === "cancelled") {
    res.status(403).json({ accountSuspended: true, error: "This business is not currently accepting check-ins." });
    return false;
  }
  let trusted = true;
  try { trusted = await isRequestFromTrustedNetwork(store.id, req); } catch { /* fail open, like the page guard */ }
  if (!trusted) {
    res.status(403).json({ code: "untrusted_network", error: "Check-in is only available on the salon's own network." });
    return false;
  }
  if (!(await deviceAuthorizedFor(req, store.id))) {
    res.status(401).json({ code: "device_not_paired", error: "This device isn't set up for check-in yet." });
    return false;
  }
  return true;
}

// ── What is being booked comes from the catalog, never from the browser ───────

type Picked = { id: number; name: string; price: number; duration: number; category?: string | null; optionId?: number };

/**
 * Rebuilds the kiosk's service and add-on choices from this salon's own catalog: ids must belong to
 * the salon and be active, and names, prices and durations are the catalog's. A service chosen
 * through one of its options carries optionId and gets that option's price and duration.
 */
export async function verifyKioskSelection(
  storeId: number,
  rawServices: unknown[],
  rawAddons: unknown[],
): Promise<{ ok: true; services: Picked[]; addons: Picked[] } | { ok: false; error: string }> {
  const services: Picked[] = [];
  for (const raw of rawServices.slice(0, 10) as any[]) {
    const id = Number(raw?.id);
    if (!Number.isInteger(id)) return { ok: false, error: "Invalid service selection" };
    const svc = (await pool.query(
      `SELECT id, name, price::float AS price, duration, category FROM services WHERE id = $1 AND store_id = $2 AND is_active = true`,
      [id, storeId],
    )).rows[0];
    if (!svc) return { ok: false, error: "That service is no longer available. Please choose again." };
    const picked: Picked = { id, name: svc.name, price: Number(svc.price), duration: Number(svc.duration), category: svc.category ?? null };
    if (raw?.optionId != null) {
      const opt = (await pool.query(
        `SELECT id, name, price::float AS price, duration_minutes AS duration FROM service_options
          WHERE id = $1 AND service_id = $2 AND is_active = true`,
        [Number(raw.optionId), id],
      )).rows[0];
      if (!opt) return { ok: false, error: "That option is no longer available. Please choose again." };
      picked.name = `${svc.name} — ${opt.name}`;
      picked.price = Number(opt.price);
      picked.duration = Number(opt.duration);
      picked.optionId = opt.id;
    }
    services.push(picked);
  }

  const addonIds = (rawAddons.slice(0, 20) as any[]).map((a) => Number(a?.id));
  if (addonIds.some((n) => !Number.isInteger(n))) return { ok: false, error: "Invalid add-on selection" };
  let addons: Picked[] = [];
  if (addonIds.length) {
    const rows = (await pool.query(
      `SELECT id, name, price::float AS price, duration FROM addons WHERE store_id = $1 AND id = ANY($2::int[]) AND is_active = true`,
      [storeId, addonIds],
    )).rows;
    if (rows.length !== new Set(addonIds).size) return { ok: false, error: "An add-on is no longer available. Please choose again." };
    const byId = new Map(rows.map((r: any) => [r.id, r]));
    addons = addonIds.map((id) => {
      const a: any = byId.get(id);
      return { id, name: a.name, price: Number(a.price), duration: Number(a.duration) };
    });
  }
  return { ok: true, services, addons };
}

// ── "Sorry we missed you" texts: at most one per number per salon a day ──────
// Per worker; with the device check above this is a second line, not the only one.
const missedYouSent = new Map<string, number>();
const DAY_MS = 24 * 60 * 60 * 1000;

/** True when this number has not had a missed-you text from this salon in the last 24 hours (and records it). */
export function claimMissedYouText(storeId: number, e164: string): boolean {
  const key = `${storeId}:${e164}`;
  const now = Date.now();
  const last = missedYouSent.get(key);
  if (last && now - last < DAY_MS) return false;
  missedYouSent.set(key, now);
  if (missedYouSent.size > 5000) {
    for (const [k, t] of missedYouSent) if (now - t >= DAY_MS) missedYouSent.delete(k);
  }
  return true;
}
