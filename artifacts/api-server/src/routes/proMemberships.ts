/**
 * Certxa Pro memberships (owner, 2026-11-15; lib/proMemberships.ts has the rules).
 *
 *   GET    /api/pro/membership-plans                    plans, with what they include and how many members
 *   POST   /api/pro/membership-plans                    { name, description?, priceCents, interval, discountPercent, includes: [{ serviceId, visits }] }
 *   PUT    /api/pro/membership-plans/:id                the same (members keep what they joined with), or { isActive }
 *   GET    /api/pro/memberships?customerId=             a client's memberships (or every member, without customerId)
 *   POST   /api/pro/memberships/start                   { planId, customerId } — card on file, charged now
 *   POST   /api/pro/memberships/link                    { planId, customerId, send } → { link, sentVia }
 *   POST   /api/pro/memberships/:id/cancel              { now } — at the end of the paid period, or at once
 *   GET    /api/pro/memberships/appointment/:id         what covers a booking: an included visit left, the member discount
 *   POST   /api/pro/memberships/use · /give-back        { membershipId, appointmentId } / { appointmentId }
 *   GET    /api/public/join/:token                      the join page (certxa.com/join/<code>)
 *   POST   /api/public/join/:token/intent · /confirm
 */
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { cancelMembership, confirmJoin, connectedAccount, coverageForAppointment, createJoinLink, describe, giveBackVisit, joinIntent, membershipByToken, startWithCardOnFile, useVisit } from "../lib/proMemberships";

const router = Router();
const id = z.coerce.number().int().positive();

function unexpected(res: Response, error: unknown) {
  console.error("[memberships] failed", error instanceof Error ? error.message : "unknown error");
  return res.status(500).json({ error: "Something went wrong. Please try again." });
}
async function store(req: Request, res: Response): Promise<number | null> {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) res.status(403).json({ error: "No store context" });
  return storeId;
}

const planInput = z.object({
  name: z.string().trim().min(1, "Give the membership a name").max(120),
  description: z.string().trim().max(2000).nullish(),
  priceCents: z.number().int().min(50, "Enter a price of at least $0.50").max(10_000_000),
  interval: z.enum(["month", "year"]).default("month"),
  discountPercent: z.number().int().min(0).max(100).default(0),
  includes: z.array(z.object({ serviceId: id, visits: z.number().int().min(1).max(100) }).strict()).max(50).default([]),
}).strict();

router.get("/api/pro/membership-plans", isAuthenticated, async (req, res) => {
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const plans = (await pool.query(
      `SELECT p.id, p.name, p.description, p.price_cents AS "priceCents", p.interval, p.discount_percent AS "discountPercent", p.is_active AS "isActive",
         COALESCE((SELECT json_agg(json_build_object('serviceId', s.service_id, 'visits', s.visits_per_period, 'name', sv.name) ORDER BY sv.name)
                     FROM membership_plan_services s JOIN services sv ON sv.id = s.service_id WHERE s.plan_id = p.id), '[]') AS includes,
         (SELECT COUNT(*)::int FROM client_memberships m WHERE m.plan_id = p.id AND m.status IN ('active', 'past_due')) AS members
       FROM membership_plans p WHERE p.store_id = $1 ORDER BY p.is_active DESC, p.id`, [storeId])).rows;
    return res.json(plans);
  } catch (error) { return unexpected(res, error); }
});

async function savePlan(storeId: number, planId: number | null, body: z.infer<typeof planInput>) {
  if (body.includes.length === 0 && body.discountPercent === 0) return { error: "Add included visits or a member discount." };
  const serviceIds = [...new Set(body.includes.map((i) => i.serviceId))];
  if (serviceIds.length !== body.includes.length) return { error: "Each service can be listed once." };
  if (serviceIds.length) {
    const n = (await pool.query(`SELECT COUNT(*)::int AS n FROM services WHERE store_id = $1 AND id = ANY($2::int[])`, [storeId, serviceIds])).rows[0].n;
    if (n !== serviceIds.length) return { error: "One of the services isn't in your menu." };
  }
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    let pid = planId;
    if (pid) {
      const r = await db.query(`UPDATE membership_plans SET name=$3, description=$4, price_cents=$5, interval=$6, discount_percent=$7, updated_at=now() WHERE id=$1 AND store_id=$2`,
        [pid, storeId, body.name, body.description ?? null, body.priceCents, body.interval, body.discountPercent]);
      if (!r.rowCount) { await db.query("ROLLBACK"); return { notFound: true }; }
    } else {
      pid = (await db.query(`INSERT INTO membership_plans (store_id, name, description, price_cents, interval, discount_percent) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [storeId, body.name, body.description ?? null, body.priceCents, body.interval, body.discountPercent])).rows[0].id;
    }
    await db.query(`DELETE FROM membership_plan_services WHERE plan_id = $1`, [pid]);
    for (const i of body.includes) await db.query(`INSERT INTO membership_plan_services (plan_id, service_id, visits_per_period) VALUES ($1,$2,$3)`, [pid, i.serviceId, i.visits]);
    await db.query("COMMIT");
    return { id: pid };
  } catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
  finally { db.release(); }
}

router.post("/api/pro/membership-plans", isAuthenticated, async (req, res) => {
  const body = planInput.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0]?.message ?? "Please check the membership." });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const r = await savePlan(storeId, null, body.data);
    if ("error" in r) return res.status(400).json({ error: r.error });
    return res.status(201).json({ id: r.id });
  } catch (error) { return unexpected(res, error); }
});

router.put("/api/pro/membership-plans/:id", isAuthenticated, async (req, res) => {
  const pid = id.safeParse(req.params.id);
  if (!pid.success) return res.status(400).json({ error: "Invalid plan" });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    if (req.body && Object.keys(req.body).length === 1 && typeof req.body.isActive === "boolean") {
      const r = await pool.query(`UPDATE membership_plans SET is_active = $3, updated_at = now() WHERE id = $1 AND store_id = $2`, [pid.data, storeId, req.body.isActive]);
      if (!req.body.isActive) await pool.query(`DELETE FROM client_memberships WHERE plan_id = $1 AND status = 'pending'`, [pid.data]);
      return r.rowCount ? res.json({ id: pid.data }) : res.status(404).json({ error: "Plan not found" });
    }
    const body = planInput.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.issues[0]?.message ?? "Please check the membership." });
    const r = await savePlan(storeId, pid.data, body.data);
    if ("notFound" in r) return res.status(404).json({ error: "Plan not found" });
    if ("error" in r) return res.status(400).json({ error: r.error });
    return res.json({ id: r.id });
  } catch (error) { return unexpected(res, error); }
});

router.get("/api/pro/memberships", isAuthenticated, async (req, res) => {
  const cid = req.query.customerId ? id.safeParse(req.query.customerId) : null;
  if (cid && !cid.success) return res.status(400).json({ error: "Invalid client" });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const rows = (await pool.query(
      `SELECT m.*, c.full_name AS client_name FROM client_memberships m LEFT JOIN clients c ON c.id = m.customer_id
        WHERE m.store_id = $1 AND ($2::int IS NULL OR m.customer_id = $2) AND ($2::int IS NOT NULL OR m.status IN ('active', 'past_due'))
        ORDER BY (m.status = 'cancelled'), m.id DESC`, [storeId, cid?.data ?? null])).rows;
    return res.json(await Promise.all(rows.map(async (m) => ({ ...(await describe(m)), clientName: m.client_name }))));
  } catch (error) { return unexpected(res, error); }
});

router.post("/api/pro/memberships/start", isAuthenticated, async (req, res) => {
  const body = z.object({ planId: id, customerId: id }).strict().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Please check the membership." });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const r = await startWithCardOnFile(storeId, body.data.planId, body.data.customerId);
    return r.ok ? res.json(r.membership) : res.status(r.status).json({ error: r.error });
  } catch (error) { return unexpected(res, error); }
});

router.post("/api/pro/memberships/link", isAuthenticated, async (req, res) => {
  const body = z.object({ planId: id, customerId: id, send: z.boolean().default(true) }).strict().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Please check the membership." });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const r = await createJoinLink(storeId, body.data.planId, body.data.customerId, body.data.send);
    return r.ok ? res.json({ link: r.link, sentVia: r.sentVia }) : res.status(r.status).json({ error: r.error });
  } catch (error) { return unexpected(res, error); }
});

router.post("/api/pro/memberships/:id/cancel", isAuthenticated, async (req, res) => {
  const mid = id.safeParse(req.params.id);
  if (!mid.success) return res.status(400).json({ error: "Invalid membership" });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const ok = await cancelMembership(storeId, mid.data, req.body?.now === true);
    return ok ? res.json({ ok: true }) : res.status(404).json({ error: "Membership not found" });
  } catch (error) { return unexpected(res, error); }
});

router.get("/api/pro/memberships/appointment/:id", isAuthenticated, async (req, res) => {
  const aid = id.safeParse(req.params.id);
  if (!aid.success) return res.status(400).json({ error: "Invalid booking" });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    return res.json(await coverageForAppointment(storeId, aid.data) ?? { visit: null, discount: null, usedMembershipId: null });
  } catch (error) { return unexpected(res, error); }
});

router.post("/api/pro/memberships/use", isAuthenticated, async (req, res) => {
  const body = z.object({ membershipId: id, appointmentId: id }).strict().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Please check the booking." });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const r = await useVisit(storeId, body.data.membershipId, body.data.appointmentId);
    return r.ok ? res.json({ left: r.left }) : res.status(r.status).json({ error: r.error });
  } catch (error) { return unexpected(res, error); }
});

router.post("/api/pro/memberships/give-back", isAuthenticated, async (req, res) => {
  const aid = id.safeParse(req.body?.appointmentId);
  if (!aid.success) return res.status(400).json({ error: "Invalid booking" });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    await giveBackVisit(storeId, aid.data);
    return res.json({ ok: true });
  } catch (error) { return unexpected(res, error); }
});

// ── The client's join page ──
const publicLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: "Too many tries. Please wait a minute." } });

router.get("/api/public/join/:token", publicLimiter, async (req, res) => {
  try {
    const m = await membershipByToken(String(req.params.token));
    if (!m) return res.status(404).json({ error: "This link isn't valid any more." });
    const plan = (await pool.query(`SELECT description, is_active FROM membership_plans WHERE id = $1`, [m.plan_id])).rows[0];
    if (!plan?.is_active && m.status === "pending") return res.status(404).json({ error: "This membership isn't offered any more." });
    return res.json({
      business: m.business, name: m.name, description: plan?.description ?? null, priceCents: m.price_cents, interval: m.interval,
      discountPercent: m.discount_percent, includes: m.includes, status: m.status,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null, stripeAccount: await connectedAccount(m.store_id),
    });
  } catch (error) { return unexpected(res, error); }
});

router.post("/api/public/join/:token/intent", publicLimiter, async (req, res) => {
  try {
    const m = await membershipByToken(String(req.params.token));
    if (!m) return res.status(404).json({ error: "This link isn't valid any more." });
    if (m.status !== "pending") return res.status(409).json({ error: "You've already joined." });
    return res.json({ clientSecret: await joinIntent(m) });
  } catch (error: any) {
    if (error?.status === 409) return res.status(409).json({ error: error.message });
    return unexpected(res, error);
  }
});

router.post("/api/public/join/:token/confirm", publicLimiter, async (req, res) => {
  try {
    const m = await membershipByToken(String(req.params.token));
    if (!m) return res.status(404).json({ error: "This link isn't valid any more." });
    const piId = String(req.body?.paymentIntentId ?? "");
    if (!/^pi_[A-Za-z0-9]+$/.test(piId)) return res.status(400).json({ error: "The payment is missing." });
    const r = await confirmJoin(m, piId);
    return r.ok ? res.json({ ok: true }) : res.status(r.status).json({ error: r.error });
  } catch (error) {
    console.error("[memberships] join confirm", error instanceof Error ? error.message : error);
    return res.status(500).json({ error: "Your payment went through, but we couldn't finish yet. The business will see it shortly." });
  }
});

export default router;
