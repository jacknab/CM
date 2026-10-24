/**
 * /api/tax-filing — 1099-NEC filing packages (plans/1099-filing-taxbandits.md, 2026-10-24).
 *
 *   GET  /payer                      the salon's payer details (EIN shown as last 4 only)
 *   PUT  /payer                      save them (EIN encrypted)
 *   GET  /summary?year=2026          each contractor's total for the year, what is missing, filing status; price
 *   POST /checkout                   { year, staffIds, mailCopies } → TaxBandits checks the forms, then Stripe checkout
 *   POST /orders/:id/confirm         back from Stripe: confirm the payment and file (the webhook does the same)
 *   GET  /orders?year=2026           orders and each form's status
 *   POST /orders/:id/refresh         ask TaxBandits for the latest status
 *
 * Owner / admin / manager of the salon can see it; only an owner or admin can buy.
 */
import { Router, type Request, type Response } from "express";
import type Stripe from "stripe";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { encryptTaxValue, taxStorageReady } from "../lib/staffTaxCrypto";
import { getStripe, isStripeConfigured } from "../lib/stripe";
import { canRefile, contractorsForYear, fileOrder, MAIL_PER_FORM_CENTS, necThreshold, payerFor, PRICE_PER_FORM_CENTS, recipientFor, refileForm, refreshOrderStatus } from "../lib/tax1099";
import { taxBanditsConfigured, taxBanditsSandbox, validateNec } from "../lib/taxbandits";

const router = Router();
export const TAX_FILING_KIND = "tax_1099_filing";

async function access(req: Request, res: Response, buying = false): Promise<{ storeId: number; userId: string } | null> {
  const userId = (req.session as any)?.userId;
  const role = userId ? (await pool.query<{ role: string }>("SELECT role FROM users WHERE id = $1 LIMIT 1", [userId])).rows[0]?.role : null;
  const allowed = buying ? ["owner", "admin"] : ["owner", "admin", "manager"];
  if (!role || !allowed.includes(role)) {
    res.status(403).json({ error: buying ? "Only the salon owner can buy 1099 filing" : "Only an owner or manager can see 1099s" });
    return null;
  }
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(404).json({ error: "No salon found" }); return null; }
  return { storeId, userId: String(userId) };
}

/** Buying is open only when Stripe and TaxBandits are both live or both test: never a real charge for a test filing. */
const filingAvailable = () => {
  if (!taxBanditsConfigured() || !isStripeConfigured()) return false;
  const stripeTest = String(process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test");
  return taxBanditsSandbox() === stripeTest;
};

const text = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const yearOf = (v: unknown) => { const y = Number(v); return Number.isInteger(y) && y >= 2024 && y <= 2100 ? y : new Date().getFullYear(); };

router.get("/payer", isAuthenticated, async (req, res) => {
  const a = await access(req, res); if (!a) return;
  const { rows: [p] } = await pool.query(`SELECT * FROM salon_tax_payer WHERE store_id = $1`, [a.storeId]);
  res.json({
    storageReady: taxStorageReady(),
    legalName: p?.legal_name ?? "", einLast4: p?.ein_last4 ?? null,
    address1: p?.address1 ?? "", address2: p?.address2 ?? "", city: p?.city ?? "", state: p?.state ?? "", zip: p?.zip ?? "",
    contactFirstName: p?.contact_first_name ?? "", contactLastName: p?.contact_last_name ?? "", phone: p?.phone ?? "", email: p?.email ?? "",
  });
});

router.put("/payer", isAuthenticated, async (req, res) => {
  const a = await access(req, res); if (!a) return;
  const b = req.body ?? {};
  let einEnc: string | undefined; let einLast4: string | undefined;
  if (typeof b.ein === "string" && b.ein.trim()) {
    const digits = b.ein.replace(/\D/g, "");
    if (digits.length !== 9) return res.status(400).json({ error: "An EIN has 9 digits." });
    try { einEnc = encryptTaxValue(digits); } catch (err: any) { return res.status(503).json({ error: err.message }); }
    einLast4 = digits.slice(-4);
  }
  const state = text(b.state, 2).toUpperCase();
  if (state && !/^[A-Z]{2}$/.test(state)) return res.status(400).json({ error: "Use the 2-letter state code." });
  await pool.query(
    `INSERT INTO salon_tax_payer (store_id, legal_name, address1, address2, city, state, zip, contact_first_name, contact_last_name, phone, email, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
     ON CONFLICT (store_id) DO UPDATE SET legal_name=$2, address1=$3, address2=$4, city=$5, state=$6, zip=$7,
       contact_first_name=$8, contact_last_name=$9, phone=$10, email=$11, updated_at=NOW()`,
    [a.storeId, text(b.legalName), text(b.address1), text(b.address2), text(b.city, 80), state, text(b.zip, 10),
     text(b.contactFirstName, 60), text(b.contactLastName, 60), text(b.phone, 20), text(b.email, 120)],
  );
  if (einEnc) await pool.query(`UPDATE salon_tax_payer SET ein_enc = $2, ein_last4 = $3 WHERE store_id = $1`, [a.storeId, einEnc, einLast4]);
  res.json({ ok: true });
});

router.get("/summary", isAuthenticated, async (req, res) => {
  const a = await access(req, res); if (!a) return;
  const year = yearOf(req.query.year);
  const payer = await payerFor(a.storeId).catch(() => null);
  res.json({
    year, threshold: necThreshold(year),
    pricePerFormCents: PRICE_PER_FORM_CENTS(), mailPerFormCents: MAIL_PER_FORM_CENTS(),
    payerReady: !!payer, filingAvailable: filingAvailable(), sandbox: taxBanditsSandbox(),
    contractors: await contractorsForYear(a.storeId, year),
  });
});

router.post("/checkout", isAuthenticated, async (req, res) => {
  const a = await access(req, res, true); if (!a) return;
  try {
    if (!filingAvailable()) return res.status(503).json({ error: "1099 filing isn't available right now." });
    const year = yearOf(req.body?.year);
    const mailCopies = req.body?.mailCopies === true;
    const wanted = new Set<number>((Array.isArray(req.body?.staffIds) ? req.body.staffIds : []).map(Number));
    const payer = await payerFor(a.storeId);
    if (!payer) return res.status(400).json({ error: "Fill in the salon's legal name, EIN, address and contact first." });
    const list = (await contractorsForYear(a.storeId, year)).filter((c) => wanted.has(c.staffId));
    if (list.length === 0) return res.status(400).json({ error: "Choose at least one contractor." });
    const notReady = list.filter((c) => !c.ready || c.filing);
    if (notReady.length) return res.status(400).json({ error: `${notReady.map((c) => c.name).join(", ")} can't be filed yet.` });

    // TaxBandits checks every form before the salon pays for it.
    const recipients = await Promise.all(list.map((c, i) => recipientFor(c.staffId, c.amount, `c${i}`)));
    const problems = await validateNec(year, payer, recipients, mailCopies ? "POSTAL_AND_ONLINE" : "ONLINE_ACCESS");
    if (Object.keys(problems).length) {
      const byName = Object.entries(problems).map(([seq, msgs]) => `${seq === "_" ? "Salon details" : list[Number(seq.slice(1))]?.name ?? seq}: ${msgs.join("; ")}`);
      return res.status(400).json({ error: "TaxBandits found problems to fix first.", problems: byName });
    }

    const price = PRICE_PER_FORM_CENTS(), mail = mailCopies ? MAIL_PER_FORM_CENTS() : 0;
    const total = list.length * (price + mail);
    const { rows: [order] } = await pool.query(
      `INSERT INTO tax_filing_orders (store_id, tax_year, form_count, mail_copies, price_per_form_cents, mail_per_form_cents, total_cents, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [a.storeId, year, list.length, mailCopies, price, mail, total, a.userId]);
    for (const c of list) {
      await pool.query(`INSERT INTO tax_filing_forms (order_id, store_id, staff_id, tax_year, amount, recipient_name) VALUES ($1,$2,$3,$4,$5,$6)`,
        [order.id, a.storeId, c.staffId, year, c.amount, c.legalName ?? c.name]);
    }
    const origin = process.env.APP_URL || "https://certxa.com";
    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      { quantity: list.length, price_data: { currency: "usd", unit_amount: price, product_data: { name: `1099-NEC filing ${year} (federal e-file + contractor copy online)` } } },
      ...(mail ? [{ quantity: list.length, price_data: { currency: "usd", unit_amount: mail, product_data: { name: "Mailed contractor copy" } } }] : []),
    ];
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items,
      client_reference_id: `tax1099-${order.id}`,
      metadata: { kind: TAX_FILING_KIND, tax_filing_order_id: String(order.id), store_id: String(a.storeId) },
      payment_intent_data: { metadata: { kind: TAX_FILING_KIND, tax_filing_order_id: String(order.id) } },
      success_url: `${origin}/payroll/1099?year=${year}&order=${order.id}`,
      cancel_url: `${origin}/payroll/1099?year=${year}`,
    });
    await pool.query(`UPDATE tax_filing_orders SET checkout_session_id = $2 WHERE id = $1`, [order.id, session.id]);
    res.json({ url: session.url, orderId: order.id });
  } catch (err: any) {
    console.error("[tax-filing] checkout:", err?.message);
    res.status(500).json({ error: "Couldn't start the purchase. Try again." });
  }
});

/** Stripe webhook: a 1099 filing order was paid. Returns true when the session was one. */
export async function markTaxFilingPaid(session: Stripe.Checkout.Session): Promise<boolean> {
  if (session.metadata?.kind !== TAX_FILING_KIND) return false;
  if (session.payment_status !== "paid") return true;
  const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  const { rows } = await pool.query(
    `UPDATE tax_filing_orders SET status = 'paid', paid_at = NOW(), payment_intent_id = $2
      WHERE checkout_session_id = $1 AND status = 'pending_payment' RETURNING id`, [session.id, pi]);
  if (rows[0]) void fileOrder(rows[0].id);
  return true;
}

router.post("/orders/:id/confirm", isAuthenticated, async (req, res) => {
  const a = await access(req, res); if (!a) return;
  const { rows: [order] } = await pool.query(`SELECT * FROM tax_filing_orders WHERE id = $1 AND store_id = $2`, [Number(req.params.id), a.storeId]);
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.status === "pending_payment" && order.checkout_session_id) {
    const session = await getStripe().checkout.sessions.retrieve(order.checkout_session_id);
    await markTaxFilingPaid(session);
  } else if (order.status === "paid") {
    void fileOrder(order.id);
  }
  res.json({ ok: true });
});

router.get("/orders", isAuthenticated, async (req, res) => {
  const a = await access(req, res); if (!a) return;
  const year = yearOf(req.query.year);
  const { rows: orders } = await pool.query(
    `SELECT id, status, form_count, mail_copies, total_cents, paid_at, filed_at, last_error, created_at FROM tax_filing_orders
      WHERE store_id = $1 AND tax_year = $2 AND status <> 'pending_payment' ORDER BY id DESC`, [a.storeId, year]);
  const { rows: forms } = await pool.query(
    `SELECT f.id, f.order_id, f.staff_id, f.recipient_name, f.amount, f.federal_status, f.state_status, f.copy_status, f.errors, f.updated_at,
            f.refile_count, f.status_checked_at
       FROM tax_filing_forms f JOIN tax_filing_orders o ON o.id = f.order_id
      WHERE o.store_id = $1 AND o.tax_year = $2 AND o.status <> 'pending_payment' ORDER BY f.id`, [a.storeId, year]);
  res.json({ orders: orders.map((o: any) => ({ ...o, forms: forms.filter((f: any) => f.order_id === o.id)
    .map((f: any) => ({ ...f, canRefile: ["filed", "failed"].includes(o.status) && canRefile(f.federal_status) })) })) });
});

router.post("/orders/:id/refresh", isAuthenticated, async (req, res) => {
  const a = await access(req, res); if (!a) return;
  const { rows: [order] } = await pool.query(`SELECT id FROM tax_filing_orders WHERE id = $1 AND store_id = $2`, [Number(req.params.id), a.storeId]);
  if (!order) return res.status(404).json({ error: "Order not found" });
  try { await refreshOrderStatus(order.id); res.json({ ok: true }); }
  catch (err: any) { res.status(502).json({ error: "Couldn't reach TaxBandits. Try again shortly." }); }
});

/** A rejected 1099, sent again with the details as they are now (after fixing them). Same amount, no new charge. */
router.post("/forms/:id/refile", isAuthenticated, async (req, res) => {
  const a = await access(req, res); if (!a) return;
  try {
    res.json(await refileForm(Number(req.params.id), a.storeId));
  } catch (err: any) {
    res.status(400).json({ error: err?.message ?? "Couldn't send the form again." });
  }
});

export default router;
