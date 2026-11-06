/**
 * Buying text message credits for a Certxa Pro (Solo) account (owner, 2026-11-03).
 *
 * The app's Credit balance screen shows the balance and three packages. Tapping one:
 *   • with a card on file (saved for Plus or an earlier purchase) it is charged at once and the credits added:
 *       POST /api/solo/credits/buy          { packId, idempotencyKey } → { credits }   or 409 { needsCard }
 *   • otherwise the app opens certxa.com/pro-credits, signed in through a one-time link (Apple lets a US app send
 *     people to a website to buy; a card form inside the app is not allowed), where the card is entered and saved:
 *       POST /api/solo/credits/web-link     { packId } → { url }
 *       GET  /pro-credits/start?code=…&pack=…  signs in → /pro-credits?pack=…
 *       POST /api/solo/credits/payment-intent  { packId } → card form secret (the card is kept for next time)
 *       POST /api/solo/credits/confirm      { paymentIntentId } → { credits }
 * Credits are added once per payment (sms_credit_ledger reference = the PaymentIntent id), also by the Stripe
 * webhook (stripeWebhook.ts) should the page close before confirming.
 *
 * The same page also just saves a card (?card=1), for a charge the app makes with the card on file, like changing the
 * business phone number (routes/businessPhone.ts): POST /api/solo/credits/setup-intent · POST /api/solo/credits/card-saved.
 *
 * The packages are set in /isAdmin › Platform Settings (platform_settings.solo_credit_packs, lib/soloSmsCredits.ts).
 */
import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { stripe, isStripeConfigured } from "../lib/stripe";
import { addSoloCredits, smsPlusOn, soloCreditPacks, soloPlanCode } from "../lib/soloSmsCredits";
import { startAppWebSession } from "../lib/appWebSession";

const packById = async (id: unknown) => (await soloCreditPacks()).find((p) => p.id === id) ?? null;

const router = Router();
const SITE = () => (process.env.APP_URL ?? "https://certxa.com").replace(/\/+$/, "");
const LINK_MINUTES = 15;
const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

async function soloStore(req: Request, res: Response): Promise<number | null> {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(403).json({ error: "No business found for this sign-in" }); return null; }
  if (!(await soloPlanCode(storeId))) { res.status(403).json({ error: "Credits are for Certxa Pro accounts" }); return null; }
  return storeId;
}

/** The business's card on file at Stripe: the one Plus charges, else the customer's default card. */
export async function savedCard(storeId: number): Promise<{ customerId: string; paymentMethodId: string; brand: string | null; last4: string | null } | null> {
  if (!isStripeConfigured()) return null;
  const plus = (await pool.query(
    `SELECT stripe_customer_id, stripe_payment_method_id, card_brand, card_last4 FROM saas_billing_profiles
      WHERE store_id = $1 AND stripe_payment_method_id IS NOT NULL ORDER BY updated_at DESC NULLS LAST LIMIT 1`, [storeId])).rows[0];
  if (plus?.stripe_customer_id && plus.stripe_payment_method_id) {
    return { customerId: plus.stripe_customer_id, paymentMethodId: plus.stripe_payment_method_id, brand: plus.card_brand ?? null, last4: plus.card_last4 ?? null };
  }
  const customerId = (await pool.query(`SELECT stripe_customer_id FROM locations WHERE id = $1`, [storeId])).rows[0]?.stripe_customer_id;
  if (!customerId) return null;
  try {
    const customer: any = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return null;
    const pmId = customer.invoice_settings?.default_payment_method;
    const id = typeof pmId === "string" ? pmId : pmId?.id;
    if (!id) return null;
    const pm = await stripe.paymentMethods.retrieve(id);
    return { customerId, paymentMethodId: id, brand: pm.card?.brand ?? null, last4: pm.card?.last4 ?? null };
  } catch {
    return null;
  }
}

async function ensureCustomer(storeId: number): Promise<string> {
  const store = (await pool.query(`SELECT name, email, stripe_customer_id FROM locations WHERE id = $1`, [storeId])).rows[0];
  let customerId: string | null = store?.stripe_customer_id ?? null;
  if (customerId) {
    try { const c: any = await stripe.customers.retrieve(customerId); if (c.deleted) customerId = null; } catch { customerId = null; }
  }
  if (!customerId) {
    const c = await stripe.customers.create({ name: store?.name ?? undefined, email: store?.email ?? undefined, metadata: { storeId: String(storeId) } });
    customerId = c.id;
    await pool.query(`UPDATE locations SET stripe_customer_id = $2 WHERE id = $1`, [storeId, customerId]);
  }
  return customerId;
}

/** Adds a paid package's credits once (by its PaymentIntent). Returns the balance, or null when already added. */
export async function creditPaidPack(pi: { id: string; status: string; metadata?: Record<string, string> | null }): Promise<number | null> {
  if (pi.status !== "succeeded" || pi.metadata?.type !== "solo_credits") return null;
  const storeId = Number(pi.metadata.storeId);
  const credits = Number(pi.metadata.credits);
  if (!Number.isInteger(storeId) || !Number.isInteger(credits) || credits <= 0) return null;
  return addSoloCredits(storeId, credits, "purchase", { reference: pi.id, note: `${credits} credits bought` });
}

// ── The app ─────────────────────────────────────────────────────────────────
router.get("/api/solo/credits", isAuthenticated, async (req, res) => {
  try {
    const storeId = await soloStore(req, res); if (!storeId) return;
    const balance = (await pool.query(`SELECT sms_credits FROM locations WHERE id = $1`, [storeId])).rows[0];
    const card = await savedCard(storeId);
    return res.json({
      credits: Number(balance?.sms_credits ?? 0),
      unlimited: await smsPlusOn(storeId),
      packs: await soloCreditPacks(),
      card: card ? { brand: card.brand, last4: card.last4 } : null,
    });
  } catch (err: any) {
    console.error("[solo-credits]", err?.message ?? err);
    return res.status(500).json({ error: "Could not load your credits" });
  }
});

router.post("/api/solo/credits/buy", isAuthenticated, async (req, res) => {
  try {
    const storeId = await soloStore(req, res); if (!storeId) return;
    const pack = await packById(req.body?.packId);
    const key = String(req.body?.idempotencyKey ?? "");
    if (!pack || !/^[A-Za-z0-9_-]{8,80}$/.test(key)) return res.status(400).json({ error: "Choose a package" });
    const card = await savedCard(storeId);
    if (!card) return res.status(409).json({ needsCard: true, error: "No card on file" });
    let pi;
    try {
      pi = await stripe.paymentIntents.create({
        amount: pack.priceCents, currency: "usd", customer: card.customerId, payment_method: card.paymentMethodId,
        off_session: true, confirm: true, description: `${pack.credits} text message credits (store #${storeId})`,
        metadata: { type: "solo_credits", storeId: String(storeId), packId: pack.id, credits: String(pack.credits) },
      }, { idempotencyKey: `solo_credits_${storeId}_${key}` });
    } catch (err: any) {
      // Declined, or the bank wants the cardholder to confirm: buy on the website instead.
      console.warn(`[solo-credits/buy] store=${storeId} card charge failed:`, err?.code ?? err?.message);
      return res.status(409).json({ needsCard: true, error: err?.message || "Your card was declined" });
    }
    if (pi.status !== "succeeded") return res.status(409).json({ needsCard: true, error: "Your bank needs you to confirm this payment" });
    await creditPaidPack(pi as any);
    const balance = (await pool.query(`SELECT sms_credits FROM locations WHERE id = $1`, [storeId])).rows[0];
    console.log(`[solo-credits] store=${storeId} bought ${pack.credits} credits (${pi.id})`);
    return res.json({ ok: true, credits: Number(balance?.sms_credits ?? 0), added: pack.credits });
  } catch (err: any) {
    console.error("[solo-credits/buy]", err?.message ?? err);
    return res.status(500).json({ error: "The credits could not be bought. You have not been charged twice; please try again." });
  }
});

router.post("/api/solo/credits/web-link", isAuthenticated, async (req, res) => {
  try {
    const storeId = await soloStore(req, res); if (!storeId) return;
    const pack = await packById(req.body?.packId);
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ error: "Please sign in again" });
    const token = crypto.randomBytes(32).toString("base64url");
    await pool.query(
      `INSERT INTO app_web_links (token_hash, user_id, store_id, purpose, expires_at) VALUES ($1, $2, $3, 'credits', now() + ($4 || ' minutes')::interval)`,
      [hash(token), userId, storeId, String(LINK_MINUTES)],
    );
    const target = req.body?.card === true ? "&card=1" : pack ? `&pack=${pack.id}` : "";
    return res.json({ url: `${SITE()}/pro-credits/start?code=${token}${target}` });
  } catch (err: any) {
    console.error("[solo-credits/web-link]", err?.message ?? err);
    return res.status(500).json({ error: "Could not open the credits page" });
  }
});

router.get("/pro-credits/start", async (req, res) => {
  const code = String(req.query.code ?? "");
  const pack = await packById(req.query.pack);
  const fail = () => res.redirect(302, "/pro-credits?link=expired");
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(code)) return fail();
  try {
    const r = await pool.query(
      `UPDATE app_web_links SET used_at = now() WHERE token_hash = $1 AND purpose = 'credits' AND used_at IS NULL AND expires_at > now()
       RETURNING user_id, store_id`, [hash(code)]);
    const userId = r.rows[0]?.user_id;
    if (!userId) return fail();
    // Billing only, for this browser session only (lib/appWebSession.ts).
    startAppWebSession(req, res, userId, r.rows[0].store_id ?? null,
      `/pro-credits${req.query.card === "1" ? "?card=1" : pack ? `?pack=${pack.id}` : ""}`, fail);
  } catch (err: any) {
    console.error("[solo-credits/start]", err?.message ?? err);
    return fail();
  }
});

// ── The website page ────────────────────────────────────────────────────────
router.post("/api/solo/credits/payment-intent", isAuthenticated, async (req, res) => {
  try {
    const storeId = await soloStore(req, res); if (!storeId) return;
    if (!isStripeConfigured() || !process.env.STRIPE_PUBLISHABLE_KEY) return res.status(503).json({ error: "Card payments are not available right now" });
    const pack = await packById(req.body?.packId);
    if (!pack) return res.status(400).json({ error: "Choose a package" });
    const customerId = await ensureCustomer(storeId);
    const pi = await stripe.paymentIntents.create({
      amount: pack.priceCents, currency: "usd", customer: customerId, payment_method_types: ["card"],
      // Kept for next time: the app then buys with one tap.
      setup_future_usage: "off_session",
      description: `${pack.credits} text message credits (store #${storeId})`,
      metadata: { type: "solo_credits", storeId: String(storeId), packId: pack.id, credits: String(pack.credits) },
    });
    return res.json({ clientSecret: pi.client_secret, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
  } catch (err: any) {
    console.error("[solo-credits/payment-intent]", err?.message ?? err);
    return res.status(500).json({ error: "Could not open the card form" });
  }
});

/** Save a card only (no purchase): the card form for ?card=1. */
router.post("/api/solo/credits/setup-intent", isAuthenticated, async (req, res) => {
  try {
    const storeId = await soloStore(req, res); if (!storeId) return;
    if (!isStripeConfigured() || !process.env.STRIPE_PUBLISHABLE_KEY) return res.status(503).json({ error: "Card payments are not available right now" });
    const customerId = await ensureCustomer(storeId);
    const si = await stripe.setupIntents.create({ customer: customerId, usage: "off_session", payment_method_types: ["card"], metadata: { type: "solo_card", storeId: String(storeId) } });
    return res.json({ clientSecret: si.client_secret, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
  } catch (err: any) {
    console.error("[solo-credits/setup-intent]", err?.message ?? err);
    return res.status(500).json({ error: "Could not open the card form" });
  }
});

/** The saved card becomes the card on file. */
router.post("/api/solo/credits/card-saved", isAuthenticated, async (req, res) => {
  try {
    const storeId = await soloStore(req, res); if (!storeId) return;
    const siId = String(req.body?.setupIntentId ?? "");
    if (!/^seti_[A-Za-z0-9]+$/.test(siId)) return res.status(400).json({ error: "The card is missing" });
    const si = await stripe.setupIntents.retrieve(siId);
    if (si.metadata?.type !== "solo_card" || si.metadata?.storeId !== String(storeId)) return res.status(403).json({ error: "This card was not saved for your account" });
    if (si.status !== "succeeded") return res.status(409).json({ error: "The card has not been saved yet" });
    const pm = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id;
    const customer = typeof si.customer === "string" ? si.customer : si.customer?.id;
    if (!pm || !customer) return res.status(409).json({ error: "The card has not been saved yet" });
    await stripe.customers.update(customer, { invoice_settings: { default_payment_method: pm } });
    const card = await savedCard(storeId);
    return res.json({ ok: true, card: card ? { brand: card.brand, last4: card.last4 } : null });
  } catch (err: any) {
    console.error("[solo-credits/card-saved]", err?.message ?? err);
    return res.status(500).json({ error: "The card could not be saved. Please try again." });
  }
});

router.post("/api/solo/credits/confirm", isAuthenticated, async (req, res) => {
  try {
    const storeId = await soloStore(req, res); if (!storeId) return;
    const piId = String(req.body?.paymentIntentId ?? "");
    if (!/^pi_[A-Za-z0-9]+$/.test(piId)) return res.status(400).json({ error: "The payment is missing" });
    const pi = await stripe.paymentIntents.retrieve(piId);
    if (pi.metadata?.type !== "solo_credits" || pi.metadata?.storeId !== String(storeId)) return res.status(403).json({ error: "This payment was not for your account" });
    if (pi.status !== "succeeded") return res.status(409).json({ error: "The payment has not gone through yet" });
    await creditPaidPack(pi as any);
    // The card this was paid with becomes the card on file.
    const pm = typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id;
    const customer = typeof pi.customer === "string" ? pi.customer : pi.customer?.id;
    if (pm && customer) await stripe.customers.update(customer, { invoice_settings: { default_payment_method: pm } }).catch(() => {});
    const balance = (await pool.query(`SELECT sms_credits FROM locations WHERE id = $1`, [storeId])).rows[0];
    return res.json({ ok: true, credits: Number(balance?.sms_credits ?? 0), added: Number(pi.metadata.credits) });
  } catch (err: any) {
    console.error("[solo-credits/confirm]", err?.message ?? err);
    return res.status(500).json({ error: "Your payment went through, but the credits could not be added yet. They will appear shortly." });
  }
});

export default router;
