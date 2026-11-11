/**
 * Certxa Pro Plus — $5/month (owner, 2026-10-30, $3 until 2026-11-04; plans/certxa-pro-sms.md phase 3).
 *
 * Apple only lets a US app send people to a website to buy a digital subscription, so the app's Plus card opens
 * certxa.com/pro-plus, already signed in through a one-time link:
 *   POST /api/solo/plus/web-link      (app)  → { url }   a single-use, 15-minute link
 *   GET  /pro-plus/start?code=…       (web)  → signs the owner in, then the Plus page (/pro-plus)
 * The page saves a card and Plus starts, billed by Certxa's own renewal run (services/saas-billing.ts):
 *   GET  /api/solo/plus               status
 *   POST /api/solo/plus/setup-intent  card form secret (Stripe SetupIntent, off-session use)
 *   POST /api/solo/plus/subscribe     { setupIntentId } → first $3 charged now, Plus on
 *   POST /api/solo/plus/cancel        stops at the end of the paid month (then free Solo again)
 *   POST /api/solo/plus/resume        keeps it going after a cancel
 * Only Solo (Certxa Pro) accounts can take Plus.
 *
 * Settings › Billing in the app (owner, 2026-11-05) opens the website's billing page the same way:
 *   POST /api/solo/billing/web-link   (app)  → { url }   a single-use, 15-minute link
 *   GET  /billing/start?code=…        (web)  → signs the owner in, then the Solo billing page (/solo/billing)
 * These sign-ins reach billing only and end with the browser session (lib/appWebSession.ts).
 */
import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { stripe, isStripeConfigured } from "../lib/stripe";
import { setSmsPlus, soloPlanCode } from "../lib/soloSmsCredits";
import { startInHouseSubscription, setCancelAtPeriodEnd } from "../services/saas-billing";
import { pushPlanChange } from "../lib/ownerPush";
import { claimAppWebLink, startAppWebSession } from "../lib/appWebSession";

const router = Router();
const SITE = () => (process.env.APP_URL ?? "https://certxa.com").replace(/\/+$/, "");
const LINK_MINUTES = 15;
const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

async function soloStore(req: Request, res: Response): Promise<number | null> {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(403).json({ error: "No business found for this sign-in" }); return null; }
  if (!(await soloPlanCode(storeId))) { res.status(403).json({ error: "Plus is for Certxa Pro accounts" }); return null; }
  return storeId;
}

async function plusPlan() {
  const r = await pool.query(`SELECT id, name, price_monthly_cents, price_yearly_cents FROM subscription_plans WHERE code = 'solo_plus' AND is_active = true LIMIT 1`);
  return r.rows[0] ?? null;
}

// ── App → website, signed in ────────────────────────────────────────────────
router.post("/api/solo/plus/web-link", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const storeId = await soloStore(req, res); if (!storeId) return;
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ error: "Please sign in again" });
    const token = crypto.randomBytes(32).toString("base64url");
    await pool.query(`DELETE FROM app_web_links WHERE expires_at < now() - interval '1 day'`).catch(() => {});
    await pool.query(
      `INSERT INTO app_web_links (token_hash, user_id, store_id, purpose, expires_at) VALUES ($1, $2, $3, 'plus', now() + ($4 || ' minutes')::interval)`,
      [hash(token), userId, storeId, String(LINK_MINUTES)],
    );
    return res.json({ url: `${SITE()}/pro-plus/start?code=${token}` });
  } catch (err: any) {
    console.error("[solo-plus/web-link]", err?.message ?? err);
    return res.status(500).json({ error: "Could not open the Plus page" });
  }
});

router.get("/pro-plus/start", async (req: Request, res: Response) => {
  const code = String(req.query.code ?? "");
  const fail = () => res.redirect(302, "/pro-plus?link=expired");
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(code)) return fail();
  try {
    // Used once: the update only succeeds for an unused, unexpired link.
    const claimed = await claimAppWebLink(req, hash(code), 'plus');
    const userId = claimed?.user_id;
    if (!userId) return fail();
    // Billing only, for this browser session only (lib/appWebSession.ts).
    startAppWebSession(req, res, userId, claimed!.store_id ?? null, "/pro-plus", fail);
  } catch (err: any) {
    console.error("[solo-plus/start]", err?.message ?? err);
    return fail();
  }
});

// ── App → website billing page, signed in ───────────────────────────────────
router.post("/api/solo/billing/web-link", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const storeId = await resolveSessionStoreId(req);
    const userId = (req.session as any)?.userId;
    if (!storeId || !userId) return res.status(401).json({ error: "Please sign in again" });
    const token = crypto.randomBytes(32).toString("base64url");
    await pool.query(`DELETE FROM app_web_links WHERE expires_at < now() - interval '1 day'`).catch(() => {});
    await pool.query(
      `INSERT INTO app_web_links (token_hash, user_id, store_id, purpose, expires_at) VALUES ($1, $2, $3, 'billing', now() + ($4 || ' minutes')::interval)`,
      [hash(token), userId, storeId, String(LINK_MINUTES)],
    );
    return res.json({ url: `${SITE()}/billing/start?code=${token}` });
  } catch (err: any) {
    console.error("[solo-billing/web-link]", err?.message ?? err);
    return res.status(500).json({ error: "Could not open the billing page" });
  }
});

router.get("/billing/start", async (req: Request, res: Response) => {
  const code = String(req.query.code ?? "");
  // An old or used link: the billing page says so.
  const fail = () => res.redirect(302, "/solo/billing?link=expired");
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(code)) return fail();
  try {
    const claimed = await claimAppWebLink(req, hash(code), 'billing');
    const userId = claimed?.user_id;
    if (!userId) return fail();
    // Billing only, for this browser session only (lib/appWebSession.ts).
    startAppWebSession(req, res, userId, claimed!.store_id ?? null, "/solo/billing", fail);
  } catch (err: any) {
    console.error("[solo-billing/start]", err?.message ?? err);
    return fail();
  }
});

// ── The Solo billing page: payments made ─────────────────────────────────────
// Plus charges (Certxa's own monthly billing, saas_billing_charges) and text credit packs (sms_credit_ledger, the
// amount read from the Stripe payment). Newest first, the last 24.
router.get("/api/solo/billing/history", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId || !(await soloPlanCode(storeId))) return res.status(403).json({ error: "Billing here is for Certxa Pro accounts" });
    const plus = await pool.query(
      `SELECT id, amount_cents, status, created_at, completed_at, failure_message FROM saas_billing_charges
        WHERE store_id = $1 AND status IN ('succeeded', 'failed', 'refunded') ORDER BY created_at DESC LIMIT 24`,
      [storeId],
    );
    const packs = await pool.query(
      `SELECT reference, change, created_at FROM sms_credit_ledger
        WHERE store_id = $1 AND reason = 'purchase' ORDER BY created_at DESC LIMIT 24`,
      [storeId],
    );
    const packRows = await Promise.all(packs.rows.map(async (p: any) => {
      let amountCents: number | null = null;
      if (isStripeConfigured() && typeof p.reference === "string" && p.reference.startsWith("pi_")) {
        try { amountCents = (await stripe.paymentIntents.retrieve(p.reference)).amount_received ?? null; } catch { /* amount unknown */ }
      }
      return { kind: "credits", date: p.created_at, credits: Number(p.change), amountCents, status: "succeeded" };
    }));
    const items = [
      ...plus.rows.map((c: any) => ({
        kind: "plus", date: c.completed_at ?? c.created_at, amountCents: Number(c.amount_cents),
        status: c.status, failure: c.status === "failed" ? (c.failure_message ?? null) : null,
      })),
      ...packRows,
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 24);
    return res.json({ items });
  } catch (err: any) {
    console.error("[solo-billing/history]", err?.message ?? err);
    return res.status(500).json({ error: "Could not load your payments" });
  }
});

// ── The Plus page ───────────────────────────────────────────────────────────
router.get("/api/solo/plus", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const storeId = await soloStore(req, res); if (!storeId) return;
    const plan = await plusPlan();
    const code = await soloPlanCode(storeId);
    const p = (await pool.query(
      `SELECT p.status, p.next_charge_at, p.cancel_at_period_end, p.card_brand, p.card_last4, p.amount_cents
         FROM saas_billing_profiles p JOIN subscription_plans sp ON sp.id = p.plan_id
        WHERE p.store_id = $1 AND sp.code = 'solo_plus'`,
      [storeId],
    )).rows[0];
    const store = (await pool.query(`SELECT name FROM locations WHERE id = $1`, [storeId])).rows[0];
    return res.json({
      businessName: store?.name ?? null,
      priceCents: plan?.price_monthly_cents ?? 300,
      plus: code === "solo_plus",
      nextChargeAt: code === "solo_plus" ? p?.next_charge_at ?? null : null,
      cancelAtPeriodEnd: code === "solo_plus" ? !!p?.cancel_at_period_end : false,
      paymentProblem: code === "solo_plus" && p?.status === "past_due",
      card: p?.card_last4 ? { brand: p.card_brand, last4: p.card_last4 } : null,
    });
  } catch (err: any) {
    console.error("[solo-plus/status]", err?.message ?? err);
    return res.status(500).json({ error: "Could not load Plus" });
  }
});

router.post("/api/solo/plus/setup-intent", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const storeId = await soloStore(req, res); if (!storeId) return;
    if (!isStripeConfigured() || !process.env.STRIPE_PUBLISHABLE_KEY) return res.status(503).json({ error: "Card payments are not available right now" });
    const plan = await plusPlan();
    if (!plan) return res.status(503).json({ error: "Plus is not available right now" });
    const store = (await pool.query(`SELECT id, name, email, stripe_customer_id FROM locations WHERE id = $1`, [storeId])).rows[0];
    let customerId: string | null = store?.stripe_customer_id ?? null;
    if (customerId) {
      try {
        const existing = await stripe.customers.retrieve(customerId);
        if ((existing as any).deleted) customerId = null;
      } catch { customerId = null; }
    }
    if (!customerId) {
      const customer = await stripe.customers.create({ name: store?.name ?? undefined, email: store?.email ?? undefined, metadata: { storeId: String(storeId) } });
      customerId = customer.id;
      await pool.query(`UPDATE locations SET stripe_customer_id = $2 WHERE id = $1`, [storeId, customerId]);
    }
    const si = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: { storeId: String(storeId), purpose: "solo_plus", planId: String(plan.id) },
    });
    return res.json({ clientSecret: si.client_secret, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
  } catch (err: any) {
    console.error("[solo-plus/setup-intent]", err?.message ?? err);
    return res.status(500).json({ error: "Could not open the card form" });
  }
});

router.post("/api/solo/plus/subscribe", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const storeId = await soloStore(req, res); if (!storeId) return;
    const setupIntentId = String(req.body?.setupIntentId ?? "");
    if (!/^seti_[A-Za-z0-9]+$/.test(setupIntentId)) return res.status(400).json({ error: "Card details are missing" });
    const plan = await plusPlan();
    if (!plan) return res.status(503).json({ error: "Plus is not available right now" });
    if ((await soloPlanCode(storeId)) === "solo_plus") return res.json({ ok: true, plus: true });

    const si = await stripe.setupIntents.retrieve(setupIntentId);
    const store = (await pool.query(`SELECT stripe_customer_id FROM locations WHERE id = $1`, [storeId])).rows[0];
    const siCustomer = typeof si.customer === "string" ? si.customer : si.customer?.id;
    if (si.status !== "succeeded") return res.status(400).json({ error: "The card has not been confirmed yet" });
    if (si.metadata?.storeId !== String(storeId) || si.metadata?.purpose !== "solo_plus" || !siCustomer || siCustomer !== store?.stripe_customer_id) {
      return res.status(403).json({ error: "This card was not saved for your account" });
    }
    const paymentMethodId = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id;
    if (!paymentMethodId) return res.status(400).json({ error: "No card was saved" });

    const result = await startInHouseSubscription({
      storeId,
      plan: { id: plan.id, name: plan.name, priceMonthly: plan.price_monthly_cents, priceYearly: plan.price_yearly_cents },
      interval: "month",
      customerId: siCustomer,
      paymentMethodId,
    });
    if (!result.ok) return res.status(result.httpStatus).json({ error: result.error });
    // Plus's switch for texts: notification texts are free from now on (lib/soloSmsCredits.ts).
    await setSmsPlus(storeId, true);
    console.log(`[solo-plus] storeId=${storeId} Plus started, next charge ${result.nextChargeAt.toISOString().slice(0, 10)}`);
    void pushPlanChange(storeId, "plus");
    return res.json({ ok: true, plus: true, nextChargeAt: result.nextChargeAt });
  } catch (err: any) {
    console.error("[solo-plus/subscribe]", err?.message ?? err);
    return res.status(500).json({ error: "Plus could not be started. You have not been charged twice; please try again or contact support." });
  }
});

router.post("/api/solo/plus/cancel", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const storeId = await soloStore(req, res); if (!storeId) return;
    if (!(await setCancelAtPeriodEnd(storeId, true))) return res.status(409).json({ error: "Plus is not active" });
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[solo-plus/cancel]", err?.message ?? err);
    return res.status(500).json({ error: "Could not cancel Plus" });
  }
});

router.post("/api/solo/plus/resume", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const storeId = await soloStore(req, res); if (!storeId) return;
    if (!(await setCancelAtPeriodEnd(storeId, false))) return res.status(409).json({ error: "Plus is not active" });
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[solo-plus/resume]", err?.message ?? err);
    return res.status(500).json({ error: "Could not keep Plus" });
  }
});

export default router;
