/**
 * Payment links (owner, 2026-11-03; plans/certxa-pro-glossgenius-audit.md): the pro texts a client a link to pay their
 * booking by card, for a client who has left or pays later. certxa.com/pay/<token> takes the card on the business's own
 * Stripe account (Certxa's usual $0.60 fee, like Tap to Pay), and the booking is then marked paid like a checkout.
 *
 *   POST /api/appointments/:id/pay-link        (pro) → { url, amountCents, sent }  — texts the client the link
 *   GET  /api/public/pay/:token                 the page: business, what for, amount, status, Stripe keys
 *   POST /api/public/pay/:token/intent          the card form's PaymentIntent (on the business's account)
 *   POST /api/public/pay/:token/confirm         { paymentIntentId } → the booking is marked paid
 */
import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { getStripe, isStripeConfigured } from "../lib/stripe";
import { PLATFORM_CONNECTION_FEE_CENTS } from "../lib/stripeConnect";
import { storage } from "../storage";

const router = Router();
const SITE = () => (process.env.APP_URL ?? "https://certxa.com").replace(/\/+$/, "");
const publicLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });

async function connectedAccount(storeId: number): Promise<string | null> {
  const r = await pool.query(`SELECT provider_account_id FROM store_payment_accounts WHERE store_id = $1 AND provider = 'stripe' AND status = 'connected' LIMIT 1`, [storeId]);
  return r.rows[0]?.provider_account_id ?? null;
}

/** What the booking comes to (service, add-ons, extra services, travel fee), less a deposit already paid, in cents. */
async function bookingDueCents(appointmentId: number, storeId: number): Promise<{ cents: number; what: string; status: string; customerId: number | null } | null> {
  const r = (await pool.query(
    `SELECT a.status, a.customer_id, a.custom_lines, COALESCE(a.travel_fee, 0) AS travel, COALESCE(a.deposit_collected, 0) AS deposit,
            s.name AS service, COALESCE(s.price, 0) AS price,
            (SELECT COALESCE(SUM(ad.price), 0) FROM appointment_addons aa JOIN addons ad ON ad.id = aa.addon_id WHERE aa.appointment_id = a.id) AS addons
       FROM appointments a LEFT JOIN services s ON s.id = a.service_id WHERE a.id = $1 AND a.store_id = $2`, [appointmentId, storeId])).rows[0];
  if (!r) return null;
  const lines = Array.isArray(r.custom_lines) ? r.custom_lines : [];
  const total = Number(r.price) + Number(r.addons) + Number(r.travel) + lines.reduce((n: number, l: any) => n + (Number(l?.price) || 0), 0) - Number(r.deposit);
  return { cents: Math.round(total * 100), what: r.service || "Your appointment", status: r.status, customerId: r.customer_id != null ? Number(r.customer_id) : null };
}

router.post("/api/appointments/:id/pay-link", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(403).json({ error: "No store context" });
    const appointmentId = Number(req.params.id);
    if (!Number.isSafeInteger(appointmentId) || appointmentId <= 0) return res.status(400).json({ error: "Invalid booking" });
    if (!(await connectedAccount(storeId))) return res.status(409).json({ error: "Set up card payments first." });
    const due = await bookingDueCents(appointmentId, storeId);
    if (!due) return res.status(404).json({ error: "Booking not found" });
    if (["completed", "cancelled", "no_show"].includes(due.status)) return res.status(409).json({ error: "This booking can't be paid now." });
    if (due.cents < 50) return res.status(409).json({ error: "There's nothing to pay on this booking." });
    // One open link per booking, kept up to date with the booking's amount.
    let link = (await pool.query(`SELECT * FROM pay_links WHERE appointment_id = $1 AND store_id = $2 AND status = 'open' ORDER BY id DESC LIMIT 1`, [appointmentId, storeId])).rows[0];
    if (link && (link.amount_cents !== due.cents)) {
      link = (await pool.query(`UPDATE pay_links SET amount_cents = $2, payment_intent = NULL WHERE id = $1 RETURNING *`, [link.id, due.cents])).rows[0];
    }
    if (!link) {
      link = (await pool.query(`INSERT INTO pay_links (token, store_id, appointment_id, amount_cents, description) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [crypto.randomBytes(18).toString("base64url"), storeId, appointmentId, due.cents, due.what])).rows[0];
    }
    const url = `${SITE()}/pay/${link.token}`;
    // Texted to the client (a service text, free to the business).
    let sent = false;
    if (req.body?.send !== false && due.customerId) {
      const phone = (await pool.query(`SELECT COALESCE(phone_number_e164, display_phone) AS p FROM client_phones WHERE client_id = $1 ORDER BY is_primary DESC, id LIMIT 1`, [due.customerId])).rows[0]?.p;
      const store = await storage.getStore(storeId);
      if (phone) {
        const { sendSms } = await import("../sms");
        const r = await sendSms(storeId, phone, `${(store as any)?.name ?? "Your appointment"}: pay $${(due.cents / 100).toFixed(2)} for ${due.what} here: ${url}`, "pay_link", appointmentId, due.customerId,
          { skipCreditDeduction: true, smsSource: "platform" }).catch(() => null);
        sent = !!(r?.success && !r.skipped);
      }
    }
    return res.json({ url, amountCents: due.cents, sent });
  } catch (err: any) {
    console.error("[pay-link create]", err?.message ?? err);
    return res.status(500).json({ error: "The payment link could not be made." });
  }
});

async function linkByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return null;
  return (await pool.query(`SELECT k.*, l.name AS store_name FROM pay_links k JOIN locations l ON l.id = k.store_id WHERE k.token = $1`, [token])).rows[0] ?? null;
}

router.get("/api/public/pay/:token", publicLimiter, async (req: Request, res: Response) => {
  try {
    const link = await linkByToken(String(req.params.token));
    if (!link) return res.status(404).json({ error: "This payment link wasn't found." });
    const account = await connectedAccount(link.store_id);
    return res.json({
      business: link.store_name, description: link.description, amountCents: link.amount_cents, status: link.status,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null, stripeAccount: account,
    });
  } catch (err: any) {
    console.error("[pay-link get]", err?.message ?? err);
    return res.status(500).json({ error: "Something went wrong." });
  }
});

router.post("/api/public/pay/:token/intent", publicLimiter, async (req: Request, res: Response) => {
  try {
    const link = await linkByToken(String(req.params.token));
    if (!link) return res.status(404).json({ error: "This payment link wasn't found." });
    if (link.status !== "open") return res.status(409).json({ error: "This has already been paid." });
    const account = await connectedAccount(link.store_id);
    if (!account || !isStripeConfigured()) return res.status(409).json({ error: "Card payments aren't available for this business right now." });
    const stripe = getStripe();
    if (link.payment_intent) {
      const existing = await stripe.paymentIntents.retrieve(link.payment_intent, {}, { stripeAccount: account }).catch(() => null);
      if (existing && existing.amount === link.amount_cents && !["canceled", "succeeded"].includes(existing.status)) return res.json({ clientSecret: existing.client_secret });
    }
    const pi = await stripe.paymentIntents.create({
      amount: link.amount_cents, currency: "usd", payment_method_types: ["card"],
      application_fee_amount: link.amount_cents > PLATFORM_CONNECTION_FEE_CENTS ? PLATFORM_CONNECTION_FEE_CENTS : 0,
      description: `${link.description} (${link.store_name})`,
      metadata: { type: "pay_link", pay_link_id: String(link.id), certxa_store_id: String(link.store_id), ...(link.appointment_id ? { appointment_id: String(link.appointment_id) } : {}) },
    }, { stripeAccount: account });
    await pool.query(`UPDATE pay_links SET payment_intent = $2 WHERE id = $1`, [link.id, pi.id]);
    return res.json({ clientSecret: pi.client_secret });
  } catch (err: any) {
    console.error("[pay-link intent]", err?.message ?? err);
    return res.status(500).json({ error: "The card form could not be opened." });
  }
});

router.post("/api/public/pay/:token/confirm", publicLimiter, async (req: Request, res: Response) => {
  try {
    const link = await linkByToken(String(req.params.token));
    if (!link) return res.status(404).json({ error: "This payment link wasn't found." });
    if (link.status === "paid") return res.json({ ok: true });
    const piId = String(req.body?.paymentIntentId ?? "");
    if (!/^pi_[A-Za-z0-9]+$/.test(piId) || piId !== link.payment_intent) return res.status(400).json({ error: "The payment is missing." });
    const account = await connectedAccount(link.store_id);
    if (!account) return res.status(409).json({ error: "Card payments aren't available for this business right now." });
    const pi = await getStripe().paymentIntents.retrieve(piId, {}, { stripeAccount: account });
    if (pi.status !== "succeeded" || pi.metadata?.pay_link_id !== String(link.id)) return res.status(409).json({ error: "The payment hasn't gone through." });
    const done = await pool.query(`UPDATE pay_links SET status = 'paid', paid_at = now() WHERE id = $1 AND status = 'open'`, [link.id]);
    // The booking is paid, like a checkout: sale, commission, loyalty, and the review text (storage.updateAppointment).
    if (done.rowCount && link.appointment_id) {
      const appt = await storage.getAppointment(link.appointment_id);
      if (appt && appt.status !== "completed") {
        const paid = (pi.amount / 100).toFixed(2);
        await storage.updateAppointment(link.appointment_id, {
          status: "completed", paymentMethod: "card", totalPaid: paid, serviceRevenue: paid, productRevenue: "0.00", stripePaymentIntentId: pi.id,
        } as any);
      }
    }
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("[pay-link confirm]", err?.message ?? err);
    return res.status(500).json({ error: "Your payment went through, but we couldn't record it yet. The business will see it shortly." });
  }
});

export default router;
