/**
 * Hardware shop: quotes, checkout and the fulfillment queue.
 *
 * Payment is taken on certxa.com/cart itself (owner, 2026-10-24): a Stripe PaymentIntent on the platform account,
 * card only, paid with Stripe's card fields on our page. No sales tax is collected. Orders ship UPS Ground to US
 * street addresses only. Prices are the admin's (shop_prices), falling back to shared/shopCatalog.ts.
 */
import type Stripe from "stripe";
import { pool } from "../db";
import { getStripe, isStripeConfigured } from "./stripe";
import { upsConfigured, upsGroundRateCents, UPS_SERVICE_NAME } from "./upsRates";
import {
  SHOP_CATALOG,
  findShopProduct,
  type ShopProduct,
  priceShopCart,
  shopAddressProblem,
  type ShopAddress,
  type ShopCartLine,
} from "@shared/shopCatalog";

export const SHOP_ORDER_KIND = "shop_order";

export class ShopError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

/** The catalog with the prices set on the admin Hardware Prices page. Kept for 30 seconds. */
let catalogCache: { at: number; catalog: ShopProduct[] } | null = null;
export async function shopCatalogNow(): Promise<ShopProduct[]> {
  if (catalogCache && Date.now() - catalogCache.at < 30_000) return catalogCache.catalog;
  const rows = (await pool.query<{ sku: string; price_cents: number }>(`SELECT sku, price_cents FROM shop_prices`)).rows;
  const set = new Map(rows.map((r) => [r.sku, Number(r.price_cents)]));
  const catalog = SHOP_CATALOG.map((p) => (set.has(p.sku) ? { ...p, priceCents: set.get(p.sku)! } : p));
  catalogCache = { at: Date.now(), catalog };
  return catalog;
}

/** The admin's Hardware Prices page: every product with its price now and the price it has with none set. */
export async function shopPricesForAdmin() {
  const catalog = await shopCatalogNow();
  return catalog.map((p) => ({ sku: p.sku, name: p.name, priceCents: p.priceCents, defaultCents: findShopProduct(p.sku)!.priceCents }));
}

/** Saves prices from the admin page ({ sku: cents }). A price equal to the default still saves (it's what was asked). */
export async function setShopPrices(prices: Record<string, unknown>, by: string | null) {
  const entries = Object.entries(prices ?? {});
  if (!entries.length) throw new ShopError(400, "Nothing to save.");
  for (const [sku, cents] of entries) {
    if (!findShopProduct(sku)) throw new ShopError(400, `Unknown product: ${sku}`);
    if (!Number.isInteger(cents) || (cents as number) < 0 || (cents as number) > 10_000_000) throw new ShopError(400, "Enter each price in dollars, like 99 or 149.99.");
  }
  for (const [sku, cents] of entries) {
    await pool.query(
      `INSERT INTO shop_prices (sku, price_cents, updated_at, updated_by) VALUES ($1, $2, now(), $3)
       ON CONFLICT (sku) DO UPDATE SET price_cents = EXCLUDED.price_cents, updated_at = now(), updated_by = EXCLUDED.updated_by`,
      [sku, cents, by],
    );
  }
  catalogCache = null;
  return shopPricesForAdmin();
}

/** Why the shop cannot take orders right now, or null when it can. */
export function shopClosedReason(): string | null {
  if (!isStripeConfigured()) return "payments are not configured";
  if (!upsConfigured()) return "UPS shipping is not configured";
  const missing = SHOP_CATALOG.filter((p) => p.weightLb == null).map((p) => p.name);
  if (missing.length) return `shipping weights are missing for: ${missing.join(", ")}`;
  return null;
}

function cleanAddress(raw: any): ShopAddress {
  const t = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  return {
    name: t(raw?.name, 120),
    line1: t(raw?.line1, 120),
    line2: t(raw?.line2, 120) || undefined,
    city: t(raw?.city, 80),
    state: t(raw?.state, 2).toUpperCase(),
    zip: t(raw?.zip, 10),
  };
}

export async function quoteShopOrder(rawLines: ShopCartLine[], rawAddress: unknown) {
  const closed = shopClosedReason();
  if (closed) throw new ShopError(503, "Online ordering is not available yet. Please contact us to order.", "SHOP_CLOSED");
  const cart = priceShopCart(rawLines, await shopCatalogNow());
  if (!cart) throw new ShopError(400, "Your cart has an item we don't recognise. Please refresh and try again.");
  const address = cleanAddress(rawAddress);
  const problem = shopAddressProblem(address);
  if (problem) throw new ShopError(400, problem, "ADDRESS");
  let shippingCents: number;
  try {
    shippingCents = await upsGroundRateCents(
      address,
      cart.items.map((i) => ({ product: findShopProduct(i.sku)!, qty: i.qty })),
    );
  } catch (err: any) {
    console.error("[shop] UPS quote failed:", err?.message);
    throw new ShopError(502, "We couldn't get a shipping cost for that address. Please check it and try again.", "SHIPPING");
  }
  return {
    address,
    items: cart.items,
    subtotalCents: cart.subtotalCents,
    shippingCents,
    shippingService: UPS_SERVICE_NAME,
    totalCents: cart.subtotalCents + shippingCents,
  };
}

function orderNumber(): string {
  const d = new Date();
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `CX-${ymd}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

/**
 * Starts paying for an order on certxa.com/cart: the order is saved waiting for payment and a card PaymentIntent is
 * made for its total (shipping re-quoted here; the browser's figures are never trusted). The page pays it with
 * Stripe's card fields (client secret) and then asks confirmShopPayment; the webhook marks it paid as well.
 */
export async function startShopCheckout(
  rawLines: ShopCartLine[],
  rawAddress: unknown,
  contact: { email?: unknown; phone?: unknown },
): Promise<{ clientSecret: string; orderNumber: string; totalCents: number }> {
  const email = typeof contact.email === "string" ? contact.email.trim().slice(0, 200) : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ShopError(400, "Please enter a valid email address.");
  const phone = typeof contact.phone === "string" ? contact.phone.trim().slice(0, 40) : "";
  if (phone.replace(/\D/g, "").length < 10) throw new ShopError(400, "Please enter a phone number, so UPS can reach you about the delivery.");
  const quote = await quoteShopOrder(rawLines, rawAddress);
  const number = orderNumber();

  const inserted = await pool.query(
    `INSERT INTO shop_orders (order_number, customer_name, customer_email, customer_phone, address_line1, address_line2,
       city, state, zip, items, subtotal_cents, shipping_cents, total_cents, shipping_service)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [number, quote.address.name, email, phone, quote.address.line1, quote.address.line2 || null,
     quote.address.city, quote.address.state, quote.address.zip, JSON.stringify(quote.items),
     quote.subtotalCents, quote.shippingCents, quote.totalCents, quote.shippingService],
  );
  const orderId: number = inserted.rows[0].id;

  const intent = await getStripe().paymentIntents.create({
    amount: quote.totalCents,
    currency: "usd",
    payment_method_types: ["card"],
    receipt_email: email,
    description: `Certxa hardware order ${number}`,
    shipping: {
      name: quote.address.name,
      phone,
      address: { line1: quote.address.line1, line2: quote.address.line2 || undefined, city: quote.address.city, state: quote.address.state, postal_code: quote.address.zip, country: "US" },
    },
    metadata: { kind: SHOP_ORDER_KIND, shop_order_id: String(orderId), order_number: number },
  }, { idempotencyKey: `shop-order-${number}` });
  if (!intent.client_secret) throw new ShopError(502, "We couldn't start the payment. Please try again.");
  await pool.query(`UPDATE shop_orders SET payment_intent_id = $1 WHERE id = $2`, [intent.id, orderId]);
  return { clientSecret: intent.client_secret, orderNumber: number, totalCents: quote.totalCents };
}

/** A PaymentIntent that succeeded: its order is paid (webhook and confirmShopPayment both land here; once only). */
export async function markShopIntentPaid(pi: Stripe.PaymentIntent): Promise<boolean> {
  if (pi.metadata?.kind !== SHOP_ORDER_KIND) return false;
  if (pi.status !== "succeeded") return true;
  const updated = await pool.query(
    `UPDATE shop_orders SET status = 'paid', paid_at = now() WHERE payment_intent_id = $1 AND status = 'pending_payment' RETURNING order_number`,
    [pi.id],
  );
  if (updated.rowCount) console.log(`[shop] order ${updated.rows[0].order_number} paid`);
  return true;
}

/** The cart page, after the card was taken: checks with Stripe and marks the order paid. */
export async function confirmShopPayment(orderNumberRaw: unknown): Promise<{ orderNumber: string; paid: boolean }> {
  const number = typeof orderNumberRaw === "string" ? orderNumberRaw.trim().slice(0, 40) : "";
  const row = (await pool.query(`SELECT payment_intent_id, status FROM shop_orders WHERE order_number = $1`, [number])).rows[0];
  if (!row?.payment_intent_id) throw new ShopError(404, "We couldn't find that order.");
  if (row.status !== "pending_payment") return { orderNumber: number, paid: row.status === "paid" || row.status === "shipped" };
  const pi = await getStripe().paymentIntents.retrieve(String(row.payment_intent_id));
  await markShopIntentPaid(pi);
  return { orderNumber: number, paid: pi.status === "succeeded" };
}

/** Called from the Stripe webhook for orders started before payment moved onto our page (Checkout Sessions).
 *  Returns true when the session was a shop order. */
export async function markShopOrderPaid(session: Stripe.Checkout.Session): Promise<boolean> {
  if (session.metadata?.kind !== SHOP_ORDER_KIND) return false;
  // Affirm and cards both settle at checkout; an unpaid session must not release an order.
  if (session.payment_status !== "paid") return true;
  const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  const updated = await pool.query(
    `UPDATE shop_orders SET status = 'paid', paid_at = now(), payment_intent_id = $2
      WHERE checkout_session_id = $1 AND status = 'pending_payment' RETURNING order_number`,
    [session.id, pi],
  );
  if (updated.rowCount) console.log(`[shop] order ${updated.rows[0].order_number} paid`);
  return true;
}

export async function shopOrdersAwaitingShipment() {
  const r = await pool.query(
    `SELECT id, order_number, customer_name, customer_email, customer_phone, address_line1, address_line2, city, state, zip,
            items, subtotal_cents, shipping_cents, total_cents, shipping_service, paid_at
       FROM shop_orders WHERE status = 'paid' ORDER BY paid_at ASC`,
  );
  return r.rows;
}

export async function recordShopShipment(orderId: number, tracking: string, serials: string) {
  const t = tracking.trim();
  if (!t) throw new ShopError(400, "Enter the UPS tracking number.");
  const r = await pool.query(
    `UPDATE shop_orders SET status = 'shipped', shipped_at = now(), tracking_number = $2, serial_numbers = $3
      WHERE id = $1 AND status = 'paid' RETURNING order_number`,
    [orderId, t.slice(0, 60), serials.trim().slice(0, 500) || null],
  );
  if (!r.rowCount) throw new ShopError(409, "That order is not waiting to ship.");
  return r.rows[0].order_number as string;
}
