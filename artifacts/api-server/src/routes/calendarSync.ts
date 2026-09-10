/**
 * Calendar Sync — one-way iCalendar subscription feed.
 *
 *   GET /api/calendar-sync/feed-url          (session)  → the shareable feed URLs
 *   GET /api/calendar-sync/feed/:ref.ics     (PUBLIC)   → the iCalendar document
 *
 * The public feed route is allow-listed past the global /api auth gate in
 * routes.ts. The ref is HMAC-signed (see lib/calendar/icsFeed.ts) so it needs
 * no session and no database row.
 *
 * (The earlier two-way Google OAuth sync was removed in favour of this. Its
 * dormant tables from migration 0168 are left in place, unused.)
 */

import { Router, type Request, type Response } from "express";
import { isAuthenticated } from "../auth";
import { pool } from "../db";
import { feedRef, feedUrl, parseFeedRef, buildIcs, type FeedEvent } from "../lib/calendar/icsFeed";

const router = Router();

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

// ── The shareable links ───────────────────────────────────────────────────
router.get("/feed-url", isAuthenticated, async (req, res) => {
  const storeId = await resolveStoreId(req);
  if (!storeId) return res.status(404).json({ error: "No store for this account" });

  const staff = await pool.query<{ id: number; name: string }>(
    `SELECT id, name FROM staff
      WHERE store_id = $1 AND COALESCE(status, 'active') <> 'removed'
      ORDER BY name`,
    [storeId],
  );

  res.json({
    storeUrl: feedUrl(storeId),
    ref: feedRef(storeId),
    staff: staff.rows.map((s) => ({ id: s.id, name: s.name, url: feedUrl(storeId, s.id) })),
  });
});

// ── The feed itself (public, signed ref) ──────────────────────────────────
router.get("/feed/:ref", async (req: Request, res: Response) => {
  const parsed = parseFeedRef(String(req.params.ref ?? ""));
  if (!parsed) return res.status(404).type("text/plain").send("Not found");

  const { storeId, staffId } = parsed;
  const from = new Date(Date.now() - 14 * 24 * 3600_000);
  const to = new Date(Date.now() + 120 * 24 * 3600_000);

  try {
    const rows = await pool.query<{
      id: number;
      date: Date;
      duration: number;
      status: string | null;
      notes: string | null;
      service_name: string | null;
      client_first: string | null;
      client_last: string | null;
      staff_name: string | null;
      loc_name: string | null;
      loc_address: string | null;
    }>(
      `SELECT a.id, a.date, a.duration, a.status, a.notes,
              svc.name AS service_name,
              cl.first_name AS client_first, cl.last_name AS client_last,
              stf.name AS staff_name,
              loc.name AS loc_name, loc.address AS loc_address
         FROM appointments a
         LEFT JOIN services  svc ON svc.id = a.service_id
         LEFT JOIN clients   cl  ON cl.id  = a.customer_id
         LEFT JOIN staff     stf ON stf.id = a.staff_id
         LEFT JOIN locations loc ON loc.id = a.store_id
        WHERE a.store_id = $1
          AND a.date >= $2 AND a.date < $3
          ${staffId ? "AND a.staff_id = $4" : ""}
        ORDER BY a.date`,
      staffId ? [storeId, from, to, staffId] : [storeId, from, to],
    );

    const events: FeedEvent[] = rows.rows.map((r) => {
      const client = [r.client_first, r.client_last].filter(Boolean).join(" ").trim();
      const svc = r.service_name ?? "Appointment";
      const cancelled = r.status === "cancelled" || r.status === "no-show";
      return {
        id: r.id,
        start: new Date(r.date),
        durationMin: r.duration || 60,
        summary: client ? `${svc} — ${client}` : svc,
        description: [
          client ? `Client: ${client}` : null,
          `Service: ${svc}`,
          r.staff_name && !staffId ? `Technician: ${r.staff_name}` : null,
          r.notes ? `Notes: ${r.notes}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        location: r.loc_address ?? r.loc_name ?? undefined,
        cancelled,
      };
    });

    const label = staffId
      ? `${rows.rows[0]?.staff_name ?? "Technician"} — Certxa`
      : `${rows.rows[0]?.loc_name ?? "Certxa"} bookings`;

    res
      .status(200)
      .type("text/calendar; charset=utf-8")
      .set("Cache-Control", "public, max-age=900")
      .set("Content-Disposition", `inline; filename="certxa-${staffId ? "staff" : "store"}.ics"`)
      .send(buildIcs(label, events));
  } catch (err: any) {
    console.error("[calendar-feed] error:", err?.message);
    res.status(500).type("text/plain").send("Feed temporarily unavailable");
  }
});

export default router;
