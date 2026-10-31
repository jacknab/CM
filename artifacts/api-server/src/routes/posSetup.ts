/**
 * POS setup — the first-time setup of the /nail POS (owner, 2026-10-31; plans/pos-setup.md).
 *
 * The wizard (booking pages/nail/PosSetupWizard.tsx) saves most answers through the settings endpoints that
 * already exist (sales tax, cash price, CARD button, tip presets, turn method, lock screen, manager PIN). These
 * routes add what has no endpoint of its own:
 *   GET  /api/nail/pos-setup          status: done or not, may this login run it, the main drawer, team + Tech IDs
 *   PUT  /api/nail/pos-setup/drawer   the first cash drawer, on the main POS register: { name, startingCash }
 *   POST /api/nail/pos-setup/complete setup finished
 * Only the salon owner's own login can run it (the turn and CARD settings are the owner's).
 */
import { Router, type Request, type Response } from "express";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { mutateStorePreferences } from "../lib/storePreferences";
import { ensureBarberNumbers } from "../lib/nailTickets";

const router = Router();

async function ownerStore(req: Request, res: Response): Promise<{ storeId: number; isOwner: boolean } | null> {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(403).json({ message: "No store context" }); return null; }
  const userId = (req.session as any)?.userId;
  const r = await pool.query(`SELECT 1 FROM locations WHERE id = $1 AND user_id = $2`, [storeId, userId ?? ""]);
  return { storeId, isOwner: !!r.rows[0] };
}

/**
 * The drawer the main POS register uses: the default station's own drawer, else the main-station drawer
 * (which also serves a salon that has no station rows yet — see lib/stationDrawer.ts).
 */
async function mainDrawer(storeId: number): Promise<{ id: number; name: string; startingCash: number } | null> {
  const r = await pool.query(
    `SELECT d.id, d.name, d.target_float FROM cash_drawers d
      WHERE d.store_id = $1 AND d.is_active
        AND (d.id = (SELECT cash_drawer_id FROM registers WHERE store_id = $1 AND is_default AND is_active LIMIT 1) OR d.main_station)
      ORDER BY (d.id = (SELECT cash_drawer_id FROM registers WHERE store_id = $1 AND is_default AND is_active LIMIT 1)) DESC NULLS LAST, d.id
      LIMIT 1`,
    [storeId],
  );
  const d = r.rows[0];
  return d ? { id: Number(d.id), name: d.name, startingCash: Number(d.target_float ?? 0) } : null;
}

router.get("/api/nail/pos-setup", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const who = await ownerStore(req, res); if (!who) return;
    const { storeId } = who;
    await ensureBarberNumbers(storeId).catch(() => {});
    const prefs = await pool.query(`SELECT preferences FROM store_settings WHERE store_id = $1`, [storeId]);
    let p: any = {};
    try { p = JSON.parse(prefs.rows[0]?.preferences ?? "{}") || {}; } catch { p = {}; }
    const team = await pool.query(
      `SELECT id, name, role, barber_number, front_desk, employment_type FROM staff
        WHERE store_id = $1 AND COALESCE(status, 'active') NOT IN ('removed', 'deactivated')
        ORDER BY (employment_type = 'owner') DESC, barber_number NULLS LAST, id`,
      [storeId],
    );
    const owner = await pool.query(`SELECT u.staff_id FROM locations l JOIN users u ON u.id = l.user_id WHERE l.id = $1`, [storeId]);
    const ownerStaffId = owner.rows[0]?.staff_id ?? null;
    const stripe = await pool.query(
      `SELECT 1 FROM store_payment_accounts WHERE store_id = $1 AND provider = 'stripe' AND status = 'connected' LIMIT 1`,
      [storeId],
    ).catch(() => ({ rows: [] as any[] }));
    return res.json({
      completed: !!p.posSetup?.completedAt,
      completedAt: p.posSetup?.completedAt ?? null,
      canSetUp: who.isOwner,
      stripeConnected: !!stripe.rows[0],
      mainDrawer: await mainDrawer(storeId),
      managerPinIsDefault: !p.nailScreen?.managerPinHash,
      team: team.rows.map((s: any) => ({
        id: Number(s.id),
        name: s.name,
        role: s.role,
        techId: s.barber_number != null ? Number(s.barber_number) : null,
        frontDesk: !!s.front_desk,
        isOwner: s.employment_type === "owner" || Number(s.id) === Number(ownerStaffId),
      })),
    });
  } catch (err: any) {
    console.error("[pos-setup] status", err?.message ?? err);
    return res.status(500).json({ message: "Could not load the POS setup" });
  }
});

router.put("/api/nail/pos-setup/drawer", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const who = await ownerStore(req, res); if (!who) return;
    if (!who.isOwner) return res.status(403).json({ message: "Only the salon owner's login can set up the POS." });
    const { storeId } = who;
    const name = String(req.body?.name ?? "").trim().slice(0, 40) || "Drawer 1";
    const amount = Number(req.body?.startingCash);
    if (!Number.isFinite(amount) || amount < 0 || amount > 10000) return res.status(400).json({ message: "Enter the starting cash, from $0 to $10,000." });
    const cash = amount.toFixed(2);
    const existing = await mainDrawer(storeId);
    if (existing) {
      await pool.query(`UPDATE cash_drawers SET name = $3, target_float = $4 WHERE id = $1 AND store_id = $2`, [existing.id, storeId, name, cash]);
    } else {
      // The main-station drawer: the salon's one POS uses it, and so does its default register once stations exist.
      await pool.query(
        `INSERT INTO cash_drawers (store_id, name, target_float, main_station, is_active, sort_order) VALUES ($1, $2, $3, true, true, 0)`,
        [storeId, name, cash],
      );
    }
    return res.json({ mainDrawer: await mainDrawer(storeId) });
  } catch (err: any) {
    console.error("[pos-setup] drawer", err?.message ?? err);
    return res.status(500).json({ message: "Could not save the cash drawer" });
  }
});

router.post("/api/nail/pos-setup/complete", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const who = await ownerStore(req, res); if (!who) return;
    if (!who.isOwner) return res.status(403).json({ message: "Only the salon owner's login can set up the POS." });
    const completedAt = new Date().toISOString();
    await mutateStorePreferences(who.storeId, (p) => ({ ...p, posSetup: { ...(p.posSetup ?? {}), completedAt } }));
    return res.json({ completed: true, completedAt });
  } catch (err: any) {
    console.error("[pos-setup] complete", err?.message ?? err);
    return res.status(500).json({ message: "Could not finish the POS setup" });
  }
});

export default router;
