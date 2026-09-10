/**
 * External calendar sync — OAuth connect, connection management, and the Google
 * push webhook. Mounted at /api/calendar-sync (see routes.ts).
 *
 * v1 scope: Google Calendar, owner-initiated. `staffId` on the connect call ties
 * the connection to one technician (NULL = store-level). Microsoft Graph / CalDAV
 * are separate adapters added later behind the same routes.
 *
 * The heavy lifting (outbound event push, inbound busy-block pull, channel renew)
 * lives in workers/calendarSyncWorker.ts. This file only sets connections up and
 * pokes the worker's inbound path when Google sends a change notification.
 */

import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { isAuthenticated } from "../auth";
import { pool } from "../db";
import { encryptToken } from "../lib/googleTokenCrypto";
import * as gcal from "../lib/calendar/googleCalendar";
import { runInboundSync } from "../workers/calendarSyncWorker";

const router = Router();

const STATE_TTL_MS = 10 * 60 * 1000;
const stateSecret = () => process.env.SESSION_SECRET ?? process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ?? "certxa-calendar-state";

function signState(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify({ ...payload, ts: Date.now() })).toString("base64url");
  const sig = crypto.createHmac("sha256", stateSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyState(state: string): Record<string, any> | null {
  try {
    const [body, sig] = String(state).split(".");
    if (!body || !sig) return null;
    const expected = crypto.createHmac("sha256", stateSecret()).update(body).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof parsed.ts !== "number" || Date.now() - parsed.ts > STATE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function resolveStoreId(req: Request): Promise<number | null> {
  const userId = (req.session as any)?.userId;
  const staffId = (req.session as any)?.staffId;
  if (userId) {
    const r = await pool.query<{ id: number }>("SELECT id FROM locations WHERE user_id = $1 LIMIT 1", [userId]);
    return r.rows[0]?.id ?? null;
  }
  if (staffId) {
    const r = await pool.query<{ store_id: number }>("SELECT store_id FROM staff WHERE id = $1 LIMIT 1", [staffId]);
    return r.rows[0]?.store_id ?? null;
  }
  return null;
}

const SETTINGS_RETURN =
  (process.env.APP_URL ?? "https://certxa.com").replace(/\/$/, "") + "/settings/calendar-sync";

// ── List connections for the caller's store ─────────────────────────────────
router.get("/connections", isAuthenticated, async (req, res) => {
  const storeId = await resolveStoreId(req);
  if (!storeId) return res.status(404).json({ error: "No store for this account" });
  const r = await pool.query(
    `SELECT c.id, c.provider, c.provider_account_email, c.staff_id, s.name AS staff_name,
            c.target_calendar_id, c.sync_direction, c.show_client_names, c.status,
            c.last_synced_at, c.last_error, c.channel_expires_at, c.created_at
       FROM calendar_connections c
       LEFT JOIN staff s ON s.id = c.staff_id
      WHERE c.store_id = $1
      ORDER BY c.created_at DESC`,
    [storeId],
  );
  res.json({ connections: r.rows });
});

// ── Begin Google OAuth ─────────────────────────────────────────────────────
// Returns { url } — the client redirects the browser there.
router.get("/google/start", isAuthenticated, async (req, res) => {
  const storeId = await resolveStoreId(req);
  if (!storeId) return res.status(404).json({ error: "No store for this account" });

  const staffId = req.query.staffId ? Number(req.query.staffId) : null;
  const direction = ["both", "outbound", "inbound"].includes(String(req.query.direction))
    ? String(req.query.direction)
    : "both";

  if (staffId != null) {
    const ok = await pool.query("SELECT 1 FROM staff WHERE id = $1 AND store_id = $2", [staffId, storeId]);
    if (!ok.rowCount) return res.status(400).json({ error: "staffId is not in this store" });
  }

  const url = gcal.getAuthUrl(signState({ storeId, staffId, direction }));
  res.json({ url });
});

// ── Google OAuth callback (PUBLIC — Google redirects the browser here) ──────
router.get("/google/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;
  if (error) return res.redirect(`${SETTINGS_RETURN}?error=${encodeURIComponent(error)}`);

  const intent = state ? verifyState(state) : null;
  if (!code || !intent) return res.redirect(`${SETTINGS_RETURN}?error=invalid_state`);

  try {
    const tok = await gcal.exchangeCode(code);
    if (!tok.refreshToken && !tok.accessToken) {
      return res.redirect(`${SETTINGS_RETURN}?error=no_tokens`);
    }

    // One connection per (staff_id, provider). Store-level (staff_id NULL) is
    // matched on (store_id, provider) with staff_id IS NULL.
    const existing = await pool.query<{ id: number }>(
      `SELECT id FROM calendar_connections
        WHERE store_id = $1 AND provider = 'google'
          AND staff_id IS NOT DISTINCT FROM $2
        LIMIT 1`,
      [intent.storeId, intent.staffId],
    );

    const expiresAt = tok.expiryDate ? new Date(tok.expiryDate) : null;

    if (existing.rows[0]) {
      await pool.query(
        `UPDATE calendar_connections
            SET provider_account_email = COALESCE($2, provider_account_email),
                access_token_enc  = $3,
                refresh_token_enc = COALESCE($4, refresh_token_enc),
                token_expires_at  = $5,
                scopes            = $6,
                sync_direction    = $7,
                status            = 'active',
                sync_token        = NULL,
                last_error        = NULL,
                updated_at        = now()
          WHERE id = $1`,
        [
          existing.rows[0].id,
          tok.email,
          encryptToken(tok.accessToken),
          tok.refreshToken ? encryptToken(tok.refreshToken) : null,
          expiresAt,
          tok.scope,
          intent.direction,
        ],
      );
    } else {
      await pool.query(
        `INSERT INTO calendar_connections
           (store_id, staff_id, provider, provider_account_email,
            access_token_enc, refresh_token_enc, token_expires_at, scopes, sync_direction)
         VALUES ($1, $2, 'google', $3, $4, $5, $6, $7, $8)`,
        [
          intent.storeId,
          intent.staffId,
          tok.email,
          encryptToken(tok.accessToken),
          tok.refreshToken ? encryptToken(tok.refreshToken) : null,
          expiresAt,
          tok.scope,
          intent.direction,
        ],
      );
    }

    return res.redirect(`${SETTINGS_RETURN}?connected=google`);
  } catch (err: any) {
    console.error("[calendar-sync] google callback failed:", err?.message);
    return res.redirect(`${SETTINGS_RETURN}?error=exchange_failed`);
  }
});

// ── Update a connection ────────────────────────────────────────────────────
router.patch("/connections/:id", isAuthenticated, async (req, res) => {
  const storeId = await resolveStoreId(req);
  if (!storeId) return res.status(404).json({ error: "No store for this account" });
  const id = Number(req.params.id);

  const sets: string[] = [];
  const vals: unknown[] = [id, storeId];
  const add = (col: string, val: unknown) => {
    vals.push(val);
    sets.push(`${col} = $${vals.length}`);
  };

  if (["both", "outbound", "inbound"].includes(req.body.syncDirection)) add("sync_direction", req.body.syncDirection);
  if (typeof req.body.showClientNames === "boolean") add("show_client_names", req.body.showClientNames);
  if (typeof req.body.targetCalendarId === "string" && req.body.targetCalendarId) add("target_calendar_id", req.body.targetCalendarId);
  if (["active", "disabled"].includes(req.body.status)) add("status", req.body.status);
  if (!sets.length) return res.status(400).json({ error: "Nothing to update" });

  const r = await pool.query(
    `UPDATE calendar_connections SET ${sets.join(", ")}, updated_at = now()
      WHERE id = $1 AND store_id = $2 RETURNING id`,
    vals,
  );
  if (!r.rowCount) return res.status(404).json({ error: "Connection not found" });
  res.json({ ok: true });
});

// ── Disconnect ────────────────────────────────────────────────────────────
router.delete("/connections/:id", isAuthenticated, async (req, res) => {
  const storeId = await resolveStoreId(req);
  if (!storeId) return res.status(404).json({ error: "No store for this account" });
  const id = Number(req.params.id);

  const r = await pool.query<{
    id: number; channel_id: string | null; channel_resource_id: string | null;
    access_token_enc: string | null; refresh_token_enc: string | null;
    token_expires_at: Date | null; target_calendar_id: string;
  }>(
    `SELECT id, channel_id, channel_resource_id, access_token_enc, refresh_token_enc,
            token_expires_at, target_calendar_id
       FROM calendar_connections WHERE id = $1 AND store_id = $2`,
    [id, storeId],
  );
  const conn = r.rows[0];
  if (!conn) return res.status(404).json({ error: "Connection not found" });

  if (conn.channel_id && conn.channel_resource_id) {
    await gcal.stopChannel(conn as any, conn.channel_id, conn.channel_resource_id);
  }
  await pool.query("DELETE FROM calendar_connections WHERE id = $1", [id]);
  res.json({ ok: true });
});

// ── Google push webhook (PUBLIC) ──────────────────────────────────────────
// Google sends header-only POSTs. We ack immediately and run an incremental
// inbound sync out of band.
router.post("/webhook/google", async (req: Request, res: Response) => {
  const channelId = req.header("X-Goog-Channel-ID");
  const resourceState = req.header("X-Goog-Resource-State");
  res.status(200).end(); // ack fast — Google retries on non-2xx

  if (!channelId || resourceState === "sync") return; // "sync" = channel-created handshake
  try {
    const r = await pool.query<{ id: number }>(
      "SELECT id FROM calendar_connections WHERE channel_id = $1 AND status = 'active' LIMIT 1",
      [channelId],
    );
    const connId = r.rows[0]?.id;
    if (connId) void runInboundSync(connId).catch((e) => console.error("[calendar-sync] inbound (webhook) failed:", e?.message));
  } catch (err: any) {
    console.error("[calendar-sync] webhook lookup failed:", err?.message);
  }
});

export default router;
