/**
 * The Solo website's shop (owner, 2026-11-04): gift cards and prepaid packages bought on the pro's own website, paid by
 * card to the pro's Stripe account like a payment link (routes/payLinks.ts), with the same connection fee.
 *
 * Public (the website, components in booking public-booking/SoloShop.tsx):
 *   GET  /api/public/store/:slug/shop            what's on sale, and the card form's keys
 *   POST /api/public/store/:slug/shop/order      save the order and open the card form
 *   POST /api/public/store/:slug/shop/confirm    after the card goes through: deliver the order
 * A sale is saved in site_orders before the card is charged and delivered once, whichever of the page or Stripe's webhook
 * (fulfilSiteOrder from routes/stripeWebhook.ts) comes first, so nothing is lost if the page closes after paying.
 *
 * The app (Certxa Pro):
 *   GET · PUT /api/pro/shop                      the gift card switch, packages on sale, what has sold
 *   POST /api/pro/packages · PUT /api/pro/packages/:id
 *   GET  /api/pro/clients/:id/packages           a client's visits left
 *   POST /api/pro/packages/use · /give-back      a visit on an appointment, once; given back if the sale can't finish
 */
import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { getStripe, isStripeConfigured } from "../lib/stripe";
import { PLATFORM_CONNECTION_FEE_CENTS } from "../lib/stripeConnect";
import { toE164US } from "../lib/phoneUtils";
import { pushOwnerMessage } from "../lib/ownerPush";
import { mutateStorePreferences } from "../lib/storePreferences";
import { emailCode, emailDetails, emailText, escapeEmailHtml } from "../lib/emailLayout";
import { sendEmail } from "../mail";
import { storage } from "../storage";

const router = Router();
const publicLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
export const GIFT_AMOUNTS_CENTS = [2500, 5000, 10000, 15000];
const GIFT_MIN_CENTS = 1000;
const GIFT_MAX_CENTS = 100000;

const money = (cents: number) => `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
function giftCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(12), (b) => chars[b % chars.length]).join("").replace(/(.{4})(?=.)/g, "$1-");
}

async function storeBySlug(slug: string) {
  const r = await pool.query<{ id: number; name: string; preferences: string | null }>(
    `SELECT l.id, l.name, s.preferences FROM locations l LEFT JOIN store_settings s ON s.store_id = l.id WHERE l.booking_slug = $1`, [slug]);
  return r.rows[0] ?? null;
}
async function connectedAccount(storeId: number): Promise<string | null> {
  const r = await pool.query(`SELECT provider_account_id FROM store_payment_accounts WHERE store_id = $1 AND provider = 'stripe' AND status = 'connected' LIMIT 1`, [storeId]);
  return r.rows[0]?.provider_account_id ?? null;
}
function giftCardsOn(preferences: string | null): boolean {
  try { return JSON.parse(preferences ?? "{}")?.siteGiftCards === true; } catch { return false; }
}
async function packagesOnSale(storeId: number) {
  const r = await pool.query(
    `SELECT p.id, p.name, p.description, p.service_id, p.visits, p.price_cents, p.is_active, s.name AS service_name, s.price AS service_price
       FROM prepaid_packages p JOIN services s ON s.id = p.service_id AND s.store_id = p.store_id
      WHERE p.store_id = $1 ORDER BY p.price_cents`, [storeId]);
  return r.rows.map((p) => {
    const regularCents = Math.round(Number(p.service_price ?? 0) * 100) * p.visits;
    return { id: p.id, name: p.name, description: p.description, serviceId: p.service_id, serviceName: p.service_name, visits: p.visits, priceCents: p.price_cents,
      isActive: p.is_active, regularCents, savingsCents: Math.max(0, regularCents - p.price_cents) };
  });
}

// ── The website ──────────────────────────────────────────────────────────────
router.get("/api/public/store/:slug/shop", publicLimiter, async (req: Request, res: Response) => {
  try {
    const store = await storeBySlug(String(req.params.slug));
    if (!store) return res.status(404).json({ error: "Not found" });
    const account = isStripeConfigured() ? await connectedAccount(store.id) : null;
    if (!account) return res.json({ giftCards: false, amounts: [], packages: [] });
    const packages = (await packagesOnSale(store.id)).filter((p) => p.isActive);
    return res.json({ giftCards: giftCardsOn(store.preferences), amounts: GIFT_AMOUNTS_CENTS, minCents: GIFT_MIN_CENTS, maxCents: GIFT_MAX_CENTS, packages,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null, stripeAccount: account });
  } catch (err: any) {
    console.error("[site-shop]", err?.message ?? err);
    return res.status(500).json({ error: "Something went wrong." });
  }
});

const buyer = { buyerName: z.string().trim().min(1).max(120), buyerEmail: z.string().trim().toLowerCase().email().max(254) };
const orderInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("gift_card"), amountCents: z.number().int().min(GIFT_MIN_CENTS).max(GIFT_MAX_CENTS), ...buyer,
    recipientName: z.string().trim().max(120).optional(), recipientEmail: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal("")), message: z.string().trim().max(300).optional() }).strict(),
  // The phone puts the visits on the right client.
  z.object({ kind: z.literal("package"), packageId: z.number().int().positive(), ...buyer, buyerPhone: z.string().trim().min(10).max(30) }).strict(),
]);

router.post("/api/public/store/:slug/shop/order", publicLimiter, async (req: Request, res: Response) => {
  const parsed = orderInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Please check your details." });
  const o = parsed.data;
  try {
    const store = await storeBySlug(String(req.params.slug));
    if (!store) return res.status(404).json({ error: "Not found" });
    const account = isStripeConfigured() ? await connectedAccount(store.id) : null;
    if (!account) return res.status(409).json({ error: "Card payments aren't available right now." });
    let amountCents: number;
    let what: string;
    let details: Record<string, unknown> = { ...o };
    if (o.kind === "gift_card") {
      if (!giftCardsOn(store.preferences)) return res.status(409).json({ error: "Gift cards aren't on sale right now." });
      amountCents = o.amountCents;
      what = `${money(amountCents)} gift card`;
    } else {
      const phone = toE164US(o.buyerPhone);
      if (!phone) return res.status(400).json({ error: "Enter a 10-digit phone number." });
      const pack = (await packagesOnSale(store.id)).find((p) => p.id === o.packageId && p.isActive);
      if (!pack) return res.status(409).json({ error: "That package is no longer available." });
      amountCents = pack.priceCents;
      what = pack.name;
      details = { ...details, buyerPhone: phone };
    }
    const order = (await pool.query<{ id: number }>(`INSERT INTO site_orders (store_id, kind, amount_cents, details) VALUES ($1, $2, $3, $4) RETURNING id`,
      [store.id, o.kind, amountCents, JSON.stringify(details)])).rows[0];
    const stripe = getStripe();
    const pi = await stripe.paymentIntents.create({
      amount: amountCents, currency: "usd", payment_method_types: ["card"], receipt_email: o.buyerEmail,
      application_fee_amount: amountCents > PLATFORM_CONNECTION_FEE_CENTS ? PLATFORM_CONNECTION_FEE_CENTS : 0,
      description: `${what} (${store.name})`,
      metadata: { type: "site_order", site_order_id: String(order.id), certxa_store_id: String(store.id) },
    }, { stripeAccount: account });
    await pool.query(`UPDATE site_orders SET payment_intent = $2 WHERE id = $1`, [order.id, pi.id]);
    return res.json({ clientSecret: pi.client_secret, paymentIntentId: pi.id });
  } catch (err: any) {
    console.error("[site-shop order]", err?.message ?? err);
    return res.status(500).json({ error: "The card form could not be opened." });
  }
});

/** Deliver a paid order, once. Safe to call from the page and from Stripe's webhook. Returns what the buyer sees. */
export async function fulfilSiteOrder(paymentIntentId: string): Promise<{ kind: string; code?: string; visits?: number; name?: string } | null> {
  const claimed = await pool.query(
    `UPDATE site_orders SET status = 'paid', paid_at = now() WHERE payment_intent = $1 AND status = 'open' RETURNING id, store_id, kind, amount_cents, details`, [paymentIntentId]);
  const order = claimed.rows[0];
  if (!order) return (await pool.query(`SELECT result FROM site_orders WHERE payment_intent = $1`, [paymentIntentId])).rows[0]?.result ?? null;
  const d = order.details as Record<string, any>;
  const storeName = (await pool.query(`SELECT name FROM locations WHERE id = $1`, [order.store_id])).rows[0]?.name ?? "Your booking";
  let result: { kind: string; code?: string; visits?: number; name?: string };
  if (order.kind === "gift_card") {
    const amount = (order.amount_cents / 100).toFixed(2);
    const code = giftCode();
    await pool.query(
      `INSERT INTO gift_cards (store_id, code, original_amount, remaining_balance, issued_to_name, issued_to_email, is_active, notes)
       VALUES ($1, $2, $3, $3, $4, $5, true, $6)`,
      [order.store_id, code, amount, d.recipientName || d.buyerName, d.recipientEmail || d.buyerEmail, `Bought online by ${d.buyerName}`]);
    result = { kind: "gift_card", code };
    const body = (forRecipient: boolean) => [
      emailText(forRecipient ? `${escapeEmailHtml(d.buyerName)} sent you a ${money(order.amount_cents)} gift card for ${escapeEmailHtml(storeName)}.` : `Your ${money(order.amount_cents)} gift card for ${escapeEmailHtml(storeName)}.`),
      d.message ? emailText(`“${escapeEmailHtml(d.message)}”`) : "",
      emailCode(code, "Show this code at your visit"),
    ].join("");
    if (d.recipientEmail && d.recipientEmail !== d.buyerEmail) {
      await sendEmail(order.store_id, d.recipientEmail, `A gift card for ${storeName}`, body(true), undefined, undefined, { business: storeName }).catch((e) => console.warn("[site-shop] gift e-mail:", e?.message));
    }
    await sendEmail(order.store_id, d.buyerEmail, `Your gift card for ${storeName}`, body(false), undefined, undefined, { business: storeName }).catch((e) => console.warn("[site-shop] gift e-mail:", e?.message));
    void pushOwnerMessage(order.store_id, { title: "Gift card sold", body: `${d.buyerName} bought a ${money(order.amount_cents)} gift card on your website.`, data: { type: "shop", to: "gift-cards" } });
  } else {
    const pack = (await pool.query(`SELECT * FROM prepaid_packages WHERE id = $1 AND store_id = $2`, [d.packageId, order.store_id])).rows[0];
    let clientId = (await pool.query(
      `SELECT c.id FROM client_phones p JOIN clients c ON c.id = p.client_id WHERE p.store_id = $1 AND p.phone_number_e164 = $2 AND c.archived_at IS NULL LIMIT 1`,
      [order.store_id, d.buyerPhone])).rows[0]?.id;
    if (!clientId) clientId = (await storage.createCustomer({ name: d.buyerName, phone: d.buyerPhone, email: d.buyerEmail, storeId: order.store_id } as any)).id;
    await pool.query(
      `INSERT INTO client_packages (store_id, package_id, client_id, name, service_id, visits_total, visits_left, price_cents) VALUES ($1, $2, $3, $4, $5, $6, $6, $7)`,
      [order.store_id, pack.id, clientId, pack.name, pack.service_id, pack.visits, order.amount_cents]);
    result = { kind: "package", visits: pack.visits, name: pack.name };
    await sendEmail(order.store_id, d.buyerEmail, `Your ${pack.name} from ${storeName}`, [
      emailText(`Thanks for buying ${escapeEmailHtml(pack.name)}.`),
      emailDetails([["Visits", String(pack.visits)], ["Paid", money(order.amount_cents)]]),
      emailText("Book as usual; your visits are saved with your phone number and are used at checkout."),
    ].join(""), undefined, undefined, { business: storeName }).catch((e) => console.warn("[site-shop] package e-mail:", e?.message));
    void pushOwnerMessage(order.store_id, { title: "Package sold", body: `${d.buyerName} bought ${pack.name} on your website.`, data: { type: "shop", to: "packages" } });
  }
  await pool.query(`UPDATE site_orders SET result = $2 WHERE id = $1`, [order.id, JSON.stringify(result)]);
  console.log(`[site-shop] store=${order.store_id} order ${order.id} (${order.kind}) delivered`);
  return result;
}

/** Orders paid but not delivered (the page closed and no webhook came): checked at Stripe and delivered. */
export async function sweepSiteOrders(): Promise<void> {
  if (!isStripeConfigured()) return;
  const open = await pool.query<{ payment_intent: string; store_id: number }>(
    `SELECT payment_intent, store_id FROM site_orders WHERE status = 'open' AND payment_intent IS NOT NULL
       AND created_at < now() - interval '2 minutes' AND created_at > now() - interval '2 days' ORDER BY id LIMIT 50`);
  for (const o of open.rows) {
    try {
      const account = await connectedAccount(o.store_id);
      if (!account) continue;
      const pi = await getStripe().paymentIntents.retrieve(o.payment_intent, {}, { stripeAccount: account });
      if (pi.status === "succeeded") await fulfilSiteOrder(o.payment_intent);
    } catch (err: any) {
      console.warn("[site-shop sweep]", err?.message ?? err);
    }
  }
}
export function startSiteOrderSweep(): void {
  setInterval(() => { void sweepSiteOrders().catch((e) => console.error("[site-shop sweep] failed:", e?.message)); }, 5 * 60_000);
}

router.post("/api/public/store/:slug/shop/confirm", publicLimiter, async (req: Request, res: Response) => {
  const piId = String(req.body?.paymentIntentId ?? "");
  if (!/^pi_[A-Za-z0-9]+$/.test(piId)) return res.status(400).json({ error: "The payment is missing." });
  try {
    const store = await storeBySlug(String(req.params.slug));
    const account = store ? await connectedAccount(store.id) : null;
    if (!store || !account) return res.status(404).json({ error: "Not found" });
    const pi = await getStripe().paymentIntents.retrieve(piId, {}, { stripeAccount: account });
    if (pi.status !== "succeeded" || pi.metadata?.type !== "site_order" || pi.metadata?.certxa_store_id !== String(store.id)) return res.status(409).json({ error: "The payment hasn't gone through." });
    return res.json(await fulfilSiteOrder(piId));
  } catch (err: any) {
    console.error("[site-shop confirm]", err?.message ?? err);
    return res.status(500).json({ error: "Your payment went through, but it couldn't be finished yet. You'll get an e-mail shortly." });
  }
});

// ── The app ──────────────────────────────────────────────────────────────────
async function storeOf(req: Request, res: Response): Promise<number | null> {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) res.status(403).json({ message: "No business on this sign-in" });
  return storeId;
}

router.get("/api/pro/shop", isAuthenticated, async (req, res) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const prefs = (await pool.query(`SELECT preferences FROM store_settings WHERE store_id = $1`, [storeId])).rows[0]?.preferences ?? null;
    const sold = await pool.query(
      `SELECT cp.id, cp.name, cp.visits_total, cp.visits_left, cp.created_at, COALESCE(NULLIF(c.full_name, ''), TRIM(CONCAT_WS(' ', c.first_name, c.last_name))) AS client_name, cp.client_id
         FROM client_packages cp JOIN clients c ON c.id = cp.client_id WHERE cp.store_id = $1 ORDER BY cp.id DESC LIMIT 100`, [storeId]);
    return res.json({ giftCardsOn: giftCardsOn(prefs), cardsReady: !!(await connectedAccount(storeId)), packages: await packagesOnSale(storeId),
      sold: sold.rows.map((s) => ({ id: s.id, name: s.name, clientId: s.client_id, clientName: s.client_name, visitsTotal: s.visits_total, visitsLeft: s.visits_left, createdAt: s.created_at })) });
  } catch (err: any) {
    console.error("[pro shop]", err?.message ?? err);
    return res.status(500).json({ message: "Something went wrong." });
  }
});

router.put("/api/pro/shop", isAuthenticated, async (req, res) => {
  const parsed = z.object({ giftCardsOn: z.boolean() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid input" });
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    await mutateStorePreferences(storeId, (current) => ({ ...current, siteGiftCards: parsed.data.giftCardsOn }));
    return res.json({ giftCardsOn: parsed.data.giftCardsOn });
  } catch (err: any) {
    console.error("[pro shop put]", err?.message ?? err);
    return res.status(500).json({ message: "That could not be saved." });
  }
});

const packageInput = z.object({
  name: z.string().trim().min(1).max(80), description: z.string().trim().max(300).nullish(),
  serviceId: z.number().int().positive(), visits: z.number().int().min(2).max(50), priceCents: z.number().int().min(100).max(1000000),
}).strict();

router.post("/api/pro/packages", isAuthenticated, async (req, res) => {
  const parsed = packageInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Please check the name, service, visits and price." });
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const service = await pool.query(`SELECT 1 FROM services WHERE id = $1 AND store_id = $2`, [parsed.data.serviceId, storeId]);
    if (!service.rows.length) return res.status(400).json({ message: "Choose one of your services." });
    const d = parsed.data;
    const r = await pool.query(`INSERT INTO prepaid_packages (store_id, name, description, service_id, visits, price_cents) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [storeId, d.name, d.description || null, d.serviceId, d.visits, d.priceCents]);
    return res.status(201).json({ id: r.rows[0].id });
  } catch (err: any) {
    console.error("[pro packages]", err?.message ?? err);
    return res.status(500).json({ message: "The package could not be saved." });
  }
});

router.put("/api/pro/packages/:id", isAuthenticated, async (req, res) => {
  const parsed = packageInput.partial().extend({ isActive: z.boolean().optional() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Please check the package." });
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const d = parsed.data;
    const r = await pool.query(
      `UPDATE prepaid_packages SET name = COALESCE($3, name), description = CASE WHEN $4::boolean THEN $5 ELSE description END, service_id = COALESCE($6, service_id),
              visits = COALESCE($7, visits), price_cents = COALESCE($8, price_cents), is_active = COALESCE($9, is_active)
        WHERE id = $1 AND store_id = $2 RETURNING id`,
      [Number(req.params.id) || 0, storeId, d.name ?? null, d.description !== undefined, d.description || null, d.serviceId ?? null, d.visits ?? null, d.priceCents ?? null, d.isActive ?? null]);
    if (!r.rows.length) return res.status(404).json({ message: "Package not found." });
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[pro packages put]", err?.message ?? err);
    return res.status(500).json({ message: "The package could not be saved." });
  }
});

router.get("/api/pro/clients/:id/packages", isAuthenticated, async (req, res) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const r = await pool.query(
      `SELECT id, name, service_id, visits_total, visits_left FROM client_packages WHERE store_id = $1 AND client_id = $2 AND visits_left > 0 ORDER BY id`,
      [storeId, Number(req.params.id) || 0]);
    return res.json(r.rows.map((p) => ({ id: p.id, name: p.name, serviceId: p.service_id, visitsTotal: p.visits_total, visitsLeft: p.visits_left })));
  } catch (err: any) {
    console.error("[pro client packages]", err?.message ?? err);
    return res.status(500).json({ message: "Something went wrong." });
  }
});

router.post("/api/pro/packages/use", isAuthenticated, async (req, res) => {
  const parsed = z.object({ clientPackageId: z.number().int().positive(), appointmentId: z.number().int().positive() }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid input" });
  const storeId = await storeOf(req, res); if (!storeId) return;
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    // It must be this client's package, on this business's appointment, and one visit per appointment.
    const appt = (await db.query(`SELECT customer_id FROM appointments WHERE id = $1 AND store_id = $2`, [parsed.data.appointmentId, storeId])).rows[0];
    const used = await db.query(
      `UPDATE client_packages SET visits_left = visits_left - 1 WHERE id = $1 AND store_id = $2 AND client_id = $3 AND visits_left > 0 RETURNING visits_left`,
      [parsed.data.clientPackageId, storeId, appt?.customer_id ?? 0]);
    if (!used.rows.length) { await db.query("ROLLBACK"); return res.status(409).json({ message: "That package has no visits left." }); }
    const once = await db.query(`INSERT INTO client_package_uses (client_package_id, appointment_id) VALUES ($1, $2) ON CONFLICT (appointment_id) DO NOTHING RETURNING id`,
      [parsed.data.clientPackageId, parsed.data.appointmentId]);
    if (!once.rows.length) { await db.query("ROLLBACK"); return res.status(409).json({ message: "A package visit was already used on this booking." }); }
    await db.query("COMMIT");
    return res.json({ visitsLeft: used.rows[0].visits_left });
  } catch (err: any) {
    await db.query("ROLLBACK").catch(() => undefined);
    console.error("[pro packages use]", err?.message ?? err);
    return res.status(500).json({ message: "The visit could not be used." });
  } finally { db.release(); }
});

router.post("/api/pro/packages/give-back", isAuthenticated, async (req, res) => {
  const appointmentId = Number(req.body?.appointmentId) || 0;
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const r = await pool.query(
      `WITH gone AS (
         DELETE FROM client_package_uses u USING client_packages p
          WHERE u.appointment_id = $1 AND p.id = u.client_package_id AND p.store_id = $2 RETURNING p.id
       ) UPDATE client_packages SET visits_left = visits_left + 1 WHERE id IN (SELECT id FROM gone) RETURNING visits_left`, [appointmentId, storeId]);
    return res.json({ visitsLeft: r.rows[0]?.visits_left ?? null });
  } catch (err: any) {
    console.error("[pro packages give back]", err?.message ?? err);
    return res.status(500).json({ message: "The visit could not be given back." });
  }
});

export default router;
