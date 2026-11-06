/**
 * The card on file of a Certxa Pro (Solo) account, for the Solo billing page (owner, 2026-11-06;
 * plans/solo-web-dashboard.md). One card pays for everything: Plus, Business Phone and text credits
 * (routes/soloCredits.ts savedCard). It is kept on the business's Stripe customer as its default card, and on the
 * Plus billing row when there is one — savedCard reads that row first, so a change updates both.
 *
 *   GET    /api/solo/billing/card               the card, and whether it can be removed
 *   POST   /api/solo/billing/card/setup-intent  card form secret (Stripe SetupIntent, off-session use)
 *   POST   /api/solo/billing/card               { setupIntentId } → the new card replaces the old one everywhere
 *   DELETE /api/solo/billing/card               removes it — not while Plus or Business Phone is still running
 *                                               (cancelled ones too, until their paid month ends)
 */
import { Router, type Request, type Response } from "express";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { stripe, isStripeConfigured } from "../lib/stripe";
import { soloPlanCode } from "../lib/soloSmsCredits";
import { savedCard, ensureCustomer } from "./soloCredits";

const router = Router();

async function soloStore(req: Request, res: Response): Promise<number | null> {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId || !(await soloPlanCode(storeId))) { res.status(403).json({ error: "Billing here is for Certxa Pro accounts" }); return null; }
  return storeId;
}

/** What still needs the card: Plus, and a business number that is still the pro's (any billing state). */
async function cardNeededBy(storeId: number): Promise<("plus" | "phone")[]> {
  const out: ("plus" | "phone")[] = [];
  if ((await soloPlanCode(storeId)) === "solo_plus") out.push("plus");
  if ((await pool.query(`SELECT 1 FROM business_phone_lines WHERE store_id = $1`, [storeId])).rows[0]) out.push("phone");
  return out;
}

async function cardInfo(storeId: number) {
  const card = await savedCard(storeId);
  if (!card) return null;
  // The expiry as the Plus row keeps it, else as Stripe has it.
  const row = (await pool.query(
    `SELECT card_exp_month, card_exp_year FROM saas_billing_profiles WHERE store_id = $1 AND stripe_payment_method_id = $2`,
    [storeId, card.paymentMethodId])).rows[0];
  let expMonth: number | null = row?.card_exp_month ?? null, expYear: number | null = row?.card_exp_year ?? null;
  if (!expMonth || !expYear) {
    try {
      const pm = await stripe.paymentMethods.retrieve(card.paymentMethodId);
      expMonth = pm.card?.exp_month ?? null; expYear = pm.card?.exp_year ?? null;
    } catch { /* expiry unknown */ }
  }
  return { brand: card.brand, last4: card.last4, expMonth, expYear };
}

router.get("/api/solo/billing/card", isAuthenticated, async (req, res) => {
  try {
    const storeId = await soloStore(req, res); if (!storeId) return;
    const neededBy = await cardNeededBy(storeId);
    return res.json({ card: await cardInfo(storeId), neededBy, canRemove: neededBy.length === 0 });
  } catch (err: any) {
    console.error("[solo-card]", err?.message ?? err);
    return res.status(500).json({ error: "Could not load your card" });
  }
});

router.post("/api/solo/billing/card/setup-intent", isAuthenticated, async (req, res) => {
  try {
    const storeId = await soloStore(req, res); if (!storeId) return;
    if (!isStripeConfigured() || !process.env.STRIPE_PUBLISHABLE_KEY) return res.status(503).json({ error: "Card payments are not available right now" });
    const customerId = await ensureCustomer(storeId);
    const si = await stripe.setupIntents.create({
      customer: customerId, usage: "off_session", payment_method_types: ["card"],
      metadata: { type: "solo_card_change", storeId: String(storeId) },
    });
    return res.json({ clientSecret: si.client_secret, publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
  } catch (err: any) {
    console.error("[solo-card/setup-intent]", err?.message ?? err);
    return res.status(500).json({ error: "Could not open the card form" });
  }
});

router.post("/api/solo/billing/card", isAuthenticated, async (req, res) => {
  try {
    const storeId = await soloStore(req, res); if (!storeId) return;
    const siId = String(req.body?.setupIntentId ?? "");
    if (!/^seti_[A-Za-z0-9]+$/.test(siId)) return res.status(400).json({ error: "The card is missing" });
    const si = await stripe.setupIntents.retrieve(siId);
    if (si.metadata?.type !== "solo_card_change" || si.metadata?.storeId !== String(storeId)) return res.status(403).json({ error: "This card was not saved for your account" });
    if (si.status !== "succeeded") return res.status(409).json({ error: "The card has not been saved yet" });
    const pmId = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id;
    const customerId = typeof si.customer === "string" ? si.customer : si.customer?.id;
    if (!pmId || !customerId) return res.status(409).json({ error: "The card has not been saved yet" });

    const old = await savedCard(storeId);
    const pm = await stripe.paymentMethods.retrieve(pmId);
    await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pmId } });
    // Plus (and through savedCard, Business Phone and credits) charge the card on the Plus row.
    await pool.query(
      `UPDATE saas_billing_profiles SET stripe_customer_id = $2, stripe_payment_method_id = $3, card_brand = $4, card_last4 = $5,
              card_exp_month = $6, card_exp_year = $7, updated_at = now()
        WHERE store_id = $1`,
      [storeId, customerId, pmId, pm.card?.brand ?? null, pm.card?.last4 ?? null, pm.card?.exp_month ?? null, pm.card?.exp_year ?? null],
    );
    // The old card is replaced, not kept as a second card.
    if (old && old.paymentMethodId !== pmId) {
      await stripe.paymentMethods.detach(old.paymentMethodId).catch((e: any) => console.warn("[solo-card] detach old", e?.message ?? e));
    }
    console.log(`[solo-card] store=${storeId} card changed`);
    return res.json({ ok: true, card: await cardInfo(storeId) });
  } catch (err: any) {
    console.error("[solo-card/save]", err?.message ?? err);
    return res.status(500).json({ error: "The card could not be saved. Please try again." });
  }
});

router.delete("/api/solo/billing/card", isAuthenticated, async (req, res) => {
  try {
    const storeId = await soloStore(req, res); if (!storeId) return;
    const neededBy = await cardNeededBy(storeId);
    if (neededBy.length) {
      const what = neededBy.map((n) => (n === "plus" ? "Plus" : "Business Phone")).join(" and ");
      return res.status(409).json({ code: "CARD_IN_USE", neededBy, error: `This card pays for ${what}. You can remove it after ${neededBy.length > 1 ? "they end" : "it ends"}.` });
    }
    const card = await savedCard(storeId);
    if (!card) return res.json({ ok: true, card: null });
    await stripe.customers.update(card.customerId, { invoice_settings: { default_payment_method: "" as any } }).catch(() => {});
    await stripe.paymentMethods.detach(card.paymentMethodId).catch((e: any) => console.warn("[solo-card] detach", e?.message ?? e));
    // The Plus row keeps its (ended) history; an empty card there means none (savedCard skips it).
    await pool.query(
      `UPDATE saas_billing_profiles SET stripe_payment_method_id = '', card_brand = NULL, card_last4 = NULL,
              card_exp_month = NULL, card_exp_year = NULL, updated_at = now() WHERE store_id = $1`,
      [storeId],
    );
    console.log(`[solo-card] store=${storeId} card removed`);
    return res.json({ ok: true, card: null });
  } catch (err: any) {
    console.error("[solo-card/remove]", err?.message ?? err);
    return res.status(500).json({ error: "The card could not be removed. Please try again." });
  }
});

export default router;
