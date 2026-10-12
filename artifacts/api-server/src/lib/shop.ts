/**
 * Hardware shop: quotes, checkout and the fulfillment queue.
 *
 * Payment is a Stripe Checkout Session on the platform account, offering card
 * and Affirm. No sales tax is collected. Orders ship UPS Ground to US street
 * addresses only.
 */
import type Stripe from "stripe";
import { pool } from "../db";
import { getStripe, isStripeConfigured } from "./stripe";
import { upsConfigured, upsGroundRateCents, UPS_SERVICE_NAME } from "./upsRates";
import {
  SHOP_CATALOG,
  findShopProduct,
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
  const cart = priceShopCart(rawLines);
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

export async function startShopCheckout(
  rawLines: ShopCartLine[],
  rawAddress: unknown,
  contact: { email?: unknown; phone?: unknown },
  siteOrigin: string,
): Promise<{ url: string; orderNumber: string }> {
  const email = typeof contact.email === "string" ? contact.email.trim().slice(0, 200) : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ShopError(400, "Please enter a valid email address.");
  const phone = typeof contact.phone === "string" ? contact.phone.trim().slice(0, 40) : "";
  // The shipping cost is always re-quoted here; the browser's figure is never trusted.
  const quote = await quoteShopOrder(rawLines, rawAddress);
  const number = orderNumber();

  const inserted = await pool.query(
    `INSERT INTO shop_orders (order_number, customer_name, customer_email, customer_phone, address_line1, address_line2,
       city, state, zip, items, subtotal_cents, shipping_cents, total_cents, shipping_service)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [number, quote.address.name, email, phone || null, quote.address.line1, quote.address.line2 || null,
     quote.address.city, quote.address.state, quote.address.zip, JSON.stringify(quote.items),
     quote.subtotalCents, quote.shippingCents, quote.totalCents, quote.shippingService],
  );
  const orderId: number = inserted.rows[0].id;

  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = quote.items.map((i) => ({
    quantity: i.qty,
    price_data: { currency: "usd", unit_amount: i.unitCents, product_data: { name: i.name } },
  }));
  line_items.push({
    quantity: 1,
    price_data: { currency: "usd", unit_amount: quote.shippingCents, product_data: { name: `Shipping — ${quote.shippingService}` } },
  });

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card", "affirm"],
    customer_email: email,
    line_items,
    client_reference_id: number,
    metadata: { kind: SHOP_ORDER_KIND, shop_order_id: String(orderId), order_number: number },
    payment_intent_data: { metadata: { kind: SHOP_ORDER_KIND, shop_order_id: String(orderId), order_number: number } },
    success_url: `${siteOrigin}/order-confirmed?order=${encodeURIComponent(number)}`,
    cancel_url: `${siteOrigin}/cart`,
  });
  if (!session.url) throw new ShopError(502, "We couldn't start the payment. Please try again.");
  await pool.query(`UPDATE shop_orders SET checkout_session_id = $1 WHERE id = $2`, [session.id, orderId]);
  return { url: session.url, orderNumber: number };
}

/** Called from the Stripe webhook. Returns true when the session was a shop order. */
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
