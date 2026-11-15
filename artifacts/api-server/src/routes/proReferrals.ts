/**
 * Certxa Pro client referrals and credit (owner, 2026-11-15: "match GlossGenius"; migration 0368).
 *
 *   GET  /api/pro/referrals                      the program (reward amounts, on/off) and every referral
 *   PUT  /api/pro/referrals/program              { enabled, referrerRewardCents, friendRewardCents }
 *   GET  /api/pro/clients/:id/credit             { balanceCents, referredBy, referred: [...] }
 *   POST /api/pro/clients/:id/referred-by        { referrerId } — once per client; the new client's credit at once
 *   POST /api/pro/appointments/:id/credit        { amountCents } — spends credit on a booking (once per booking)
 *   POST /api/pro/appointments/:id/credit/give-back  — the credit back, when the checkout couldn't finish
 *
 * The referrer's credit is added (hourly, and right after a referred-by is saved) once the new client has a paid visit.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { pushOwnerMessage } from "../lib/ownerPush";

const router = Router();
const id = z.coerce.number().int().positive();

async function store(req: Request, res: Response): Promise<number | null> {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) res.status(403).json({ error: "No store context" });
  return storeId;
}
function unexpected(res: Response, error: unknown) {
  console.error("[pro-referrals] failed", error instanceof Error ? error.message : "unknown error");
  return res.status(500).json({ error: "Something went wrong. Please try again." });
}

export async function creditBalance(storeId: number, customerId: number): Promise<number> {
  return Number((await pool.query(`SELECT COALESCE(SUM(amount_cents), 0)::int AS n FROM client_credits WHERE store_id = $1 AND customer_id = $2`, [storeId, customerId])).rows[0].n);
}

async function program(storeId: number) {
  const r = (await pool.query(`SELECT * FROM referral_programs WHERE store_id = $1`, [storeId])).rows[0];
  return { enabled: r ? !!r.enabled : false, referrerRewardCents: r?.referrer_reward_cents ?? 1000, friendRewardCents: r?.friend_reward_cents ?? 1000, set: !!r };
}

/** Referrers whose friend now has a paid visit get their credit. */
export async function rewardReferrers(storeId?: number): Promise<number> {
  const due = (await pool.query(
    `SELECT r.* FROM client_referrals r
      WHERE r.rewarded_at IS NULL AND ($1::int IS NULL OR r.store_id = $1)
        AND EXISTS (SELECT 1 FROM appointments a WHERE a.store_id = r.store_id AND a.customer_id = r.friend_id AND a.total_paid IS NOT NULL AND a.status IN ('completed', 'paid'))`,
    [storeId ?? null])).rows;
  let n = 0;
  for (const r of due) {
    const done = await pool.query(`UPDATE client_referrals SET rewarded_at = now() WHERE id = $1 AND rewarded_at IS NULL`, [r.id]);
    if (!done.rowCount) continue;
    if (r.referrer_reward_cents > 0) {
      await pool.query(
        `INSERT INTO client_credits (store_id, customer_id, amount_cents, reason, referral_id) VALUES ($1,$2,$3,'referral_referrer',$4)
         ON CONFLICT (referral_id, reason) WHERE referral_id IS NOT NULL DO NOTHING`, [r.store_id, r.referrer_id, r.referrer_reward_cents, r.id]);
      const names = (await pool.query(`SELECT id, full_name FROM clients WHERE id = ANY($1::int[])`, [[r.referrer_id, r.friend_id]])).rows;
      const name = (cid: number) => names.find((x) => x.id === cid)?.full_name || "A client";
      void pushOwnerMessage(r.store_id, { title: "Referral reward", body: `${name(r.referrer_id)} earned $${(r.referrer_reward_cents / 100).toFixed(2)} credit for referring ${name(r.friend_id)}.`, data: { type: "referral_reward", customerId: r.referrer_id } }).catch(() => {});
    }
    n++;
  }
  return n;
}

router.get("/api/pro/referrals", isAuthenticated, async (req, res) => {
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const list = (await pool.query(
      `SELECT r.id, r.referrer_id AS "referrerId", a.full_name AS "referrerName", r.friend_id AS "friendId", b.full_name AS "friendName",
              r.referrer_reward_cents AS "referrerRewardCents", r.friend_reward_cents AS "friendRewardCents", r.rewarded_at AS "rewardedAt", r.created_at AS "createdAt"
         FROM client_referrals r LEFT JOIN clients a ON a.id = r.referrer_id LEFT JOIN clients b ON b.id = r.friend_id
        WHERE r.store_id = $1 ORDER BY r.id DESC LIMIT 500`, [storeId])).rows;
    return res.json({ program: await program(storeId), referrals: list });
  } catch (error) { return unexpected(res, error); }
});

router.put("/api/pro/referrals/program", isAuthenticated, async (req, res) => {
  const body = z.object({ enabled: z.boolean(), referrerRewardCents: z.number().int().min(0).max(100000), friendRewardCents: z.number().int().min(0).max(100000) }).strict().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Enter rewards from $0 to $1,000." });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    await pool.query(
      `INSERT INTO referral_programs (store_id, enabled, referrer_reward_cents, friend_reward_cents) VALUES ($1,$2,$3,$4)
       ON CONFLICT (store_id) DO UPDATE SET enabled = $2, referrer_reward_cents = $3, friend_reward_cents = $4, updated_at = now()`,
      [storeId, body.data.enabled, body.data.referrerRewardCents, body.data.friendRewardCents]);
    return res.json(await program(storeId));
  } catch (error) { return unexpected(res, error); }
});

router.get("/api/pro/clients/:id/credit", isAuthenticated, async (req, res) => {
  const cid = id.safeParse(req.params.id);
  if (!cid.success) return res.status(400).json({ error: "Invalid client" });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const by = (await pool.query(
      `SELECT r.referrer_id AS id, c.full_name AS name FROM client_referrals r LEFT JOIN clients c ON c.id = r.referrer_id WHERE r.store_id = $1 AND r.friend_id = $2`, [storeId, cid.data])).rows[0] ?? null;
    const referred = (await pool.query(
      `SELECT r.friend_id AS id, c.full_name AS name, r.rewarded_at AS "rewardedAt" FROM client_referrals r LEFT JOIN clients c ON c.id = r.friend_id
        WHERE r.store_id = $1 AND r.referrer_id = $2 ORDER BY r.id DESC`, [storeId, cid.data])).rows;
    return res.json({ balanceCents: await creditBalance(storeId, cid.data), referredBy: by, referred, program: await program(storeId) });
  } catch (error) { return unexpected(res, error); }
});

router.post("/api/pro/clients/:id/referred-by", isAuthenticated, async (req, res) => {
  const cid = id.safeParse(req.params.id);
  const body = z.object({ referrerId: id }).strict().safeParse(req.body);
  if (!cid.success || !body.success) return res.status(400).json({ error: "Choose who referred this client." });
  if (cid.data === body.data.referrerId) return res.status(400).json({ error: "A client can't refer themselves." });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const both = (await pool.query(`SELECT COUNT(*)::int AS n FROM clients WHERE store_id = $1 AND id = ANY($2::int[])`, [storeId, [cid.data, body.data.referrerId]])).rows[0].n;
    if (both !== 2) return res.status(404).json({ error: "Client not found" });
    const p = await program(storeId);
    if (!p.enabled) return res.status(409).json({ error: "Turn on referrals first (More › Referrals)." });
    const r = (await pool.query(
      `INSERT INTO client_referrals (store_id, referrer_id, friend_id, referrer_reward_cents, friend_reward_cents) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (store_id, friend_id) DO NOTHING RETURNING id`, [storeId, body.data.referrerId, cid.data, p.referrerRewardCents, p.friendRewardCents])).rows[0];
    if (!r) return res.status(409).json({ error: "This client's referral is already saved." });
    if (p.friendRewardCents > 0) {
      await pool.query(`INSERT INTO client_credits (store_id, customer_id, amount_cents, reason, referral_id) VALUES ($1,$2,$3,'referral_friend',$4)`,
        [storeId, cid.data, p.friendRewardCents, r.id]);
    }
    await rewardReferrers(storeId);
    return res.json({ balanceCents: await creditBalance(storeId, cid.data) });
  } catch (error) { return unexpected(res, error); }
});

router.post("/api/pro/appointments/:id/credit", isAuthenticated, async (req, res) => {
  const aid = id.safeParse(req.params.id);
  const body = z.object({ amountCents: z.number().int().positive().max(10_000_000) }).strict().safeParse(req.body);
  if (!aid.success || !body.success) return res.status(400).json({ error: "Please check the amount." });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      const appt = (await db.query(`SELECT customer_id, status, total_paid FROM appointments WHERE id = $1 AND store_id = $2`, [aid.data, storeId])).rows[0];
      if (!appt?.customer_id) { await db.query("ROLLBACK"); return res.status(404).json({ error: "Booking not found" }); }
      if (appt.total_paid != null || appt.status === "cancelled") { await db.query("ROLLBACK"); return res.status(409).json({ error: "This booking is closed." }); }
      // One client's credit is spent one booking at a time.
      await db.query(`SELECT pg_advisory_xact_lock(hashtext('client_credit'), $1)`, [appt.customer_id]);
      const prior = (await db.query(`SELECT -amount_cents AS cents FROM client_credits WHERE appointment_id = $1 AND reason = 'spent'`, [aid.data])).rows[0];
      if (prior) { await db.query("COMMIT"); return res.json({ usedCents: prior.cents }); }
      const balance = Number((await db.query(`SELECT COALESCE(SUM(amount_cents), 0)::int AS n FROM client_credits WHERE store_id = $1 AND customer_id = $2`, [storeId, appt.customer_id])).rows[0].n);
      const use = Math.min(balance, body.data.amountCents);
      if (use <= 0) { await db.query("ROLLBACK"); return res.status(409).json({ error: "This client has no credit." }); }
      await db.query(`INSERT INTO client_credits (store_id, customer_id, amount_cents, reason, appointment_id) VALUES ($1,$2,$3,'spent',$4)`, [storeId, appt.customer_id, -use, aid.data]);
      await db.query("COMMIT");
      return res.json({ usedCents: use });
    } catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
    finally { db.release(); }
  } catch (error) { return unexpected(res, error); }
});

router.post("/api/pro/appointments/:id/credit/give-back", isAuthenticated, async (req, res) => {
  const aid = id.safeParse(req.params.id);
  if (!aid.success) return res.status(400).json({ error: "Invalid booking" });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    await pool.query(
      `DELETE FROM client_credits c USING appointments a WHERE c.appointment_id = $1 AND c.reason = 'spent' AND a.id = c.appointment_id AND a.store_id = $2 AND a.total_paid IS NULL`,
      [aid.data, storeId]);
    return res.json({ ok: true });
  } catch (error) { return unexpected(res, error); }
});

let timer: ReturnType<typeof setInterval> | null = null;
export function startReferralRewards() {
  if (timer) return;
  timer = setInterval(() => void rewardReferrers().catch((e) => console.error("[pro-referrals] rewards failed", e instanceof Error ? e.message : e)), 60 * 60_000);
}

export default router;
