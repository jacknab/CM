/**
 * Public marketplace "Deals" API — backs the certxa.com marketplace's deals
 * browse/detail pages (artifacts/marketplace). Read-only: no purchase flow
 * yet. Real data only — a deal's image is the salon's own package/hero image
 * or nothing at all, never a stand-in stock photo, since a deal promises a
 * specific package and a substituted photo would misrepresent it.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import crypto from "crypto";
import { eq, and, gt, desc, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { deals, packages, packageItems, services, addons, locations, dealVouchers, dealWalletTokens, googleReviews } from "@shared/schema";
import { getDealAvailability, dealDiscountPercent } from "../lib/dealAvailability";
import { haversineMiles } from "../lib/salonData";
import { logger } from "../lib/logger";
import { stripe, isStripeConfigured, getReturnBaseUrl } from "../lib/stripe";
import { sendEmail } from "../mail";
import { toE164US } from "../lib/phoneUtils";

/** Suspended / locked / cancelled stores can't sell deals: hide them and refuse checkout. */
function storeCanSellDeals(store: { accountStatus?: string | null }): boolean {
  const status = String(store.accountStatus ?? "active").toLowerCase();
  return status !== "suspended" && status !== "locked" && status !== "canceled" && status !== "cancelled";
}

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WALLET_TOKEN_TTL_DAYS = 30;

function formatDistanceMiles(miles: number): string {
  return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
}

interface ApiMarketplaceDeal {
  id: number;
  title: string;
  description: string | null;
  heroImage: string | null;
  dealPrice: number;
  listPrice: number;
  discountPercent: number;
  capacity: number;
  purchasedCount: number;
  spotsLeft: number;
  endsAt: string;
  /** Real average from the salon's synced Google reviews — null when it has none yet (never fabricated). */
  rating: number | null;
  reviewCount: number;
  /** Formatted like "2.4 mi" — only present when the caller sent lat/lng AND the salon has real coordinates on file. */
  distance: string | null;
  salon: {
    name: string;
    city: string | null;
    state: string | null;
    address: string | null;
    phone: string | null;
  };
}

/** Real per-store rating average + count from google_reviews, batched for a list of stores. Never fabricated — a store with no synced reviews simply gets `null`. */
async function getRatingsByStore(storeIds: number[]): Promise<Map<number, { rating: number; reviewCount: number }>> {
  if (!storeIds.length) return new Map();
  const rows = await db
    .select({
      storeId: googleReviews.storeId,
      avgRating: sql<string>`avg(${googleReviews.rating})`,
      count: sql<string>`count(*)`,
    })
    .from(googleReviews)
    .where(inArray(googleReviews.storeId, storeIds))
    .groupBy(googleReviews.storeId);
  return new Map(rows.map((r) => [r.storeId, { rating: Math.round(Number(r.avgRating) * 10) / 10, reviewCount: Number(r.count) }]));
}

function toMarketplaceDeal(
  row: typeof deals.$inferSelect,
  pkg: Pick<typeof packages.$inferSelect, "description" | "imageUrl">,
  store: Pick<typeof locations.$inferSelect, "name" | "city" | "state" | "address" | "phone" | "storeLatitude" | "storeLongitude">,
  ratingInfo: { rating: number; reviewCount: number } | undefined,
  userCoords: { lat: number; lng: number } | null,
): ApiMarketplaceDeal {
  let distance: string | null = null;
  const storeLat = store.storeLatitude ? Number(store.storeLatitude) : null;
  const storeLng = store.storeLongitude ? Number(store.storeLongitude) : null;
  if (userCoords && storeLat != null && storeLng != null && Number.isFinite(storeLat) && Number.isFinite(storeLng)) {
    distance = formatDistanceMiles(haversineMiles(userCoords.lat, userCoords.lng, storeLat, storeLng));
  }
  return {
    id: row.id,
    title: row.title,
    description: row.marketingDescription || pkg.description || null,
    heroImage: row.heroImage || pkg.imageUrl || null,
    dealPrice: Number(row.dealPrice),
    listPrice: Number(row.listPrice),
    discountPercent: dealDiscountPercent(row.dealPrice, row.listPrice),
    capacity: row.capacity,
    purchasedCount: row.purchasedCount,
    spotsLeft: Math.max(0, row.capacity - row.purchasedCount),
    endsAt: row.endsAt.toISOString(),
    rating: ratingInfo?.rating ?? null,
    reviewCount: ratingInfo?.reviewCount ?? 0,
    distance,
    salon: { name: store.name, city: store.city, state: store.state, address: store.address, phone: store.phone },
  };
}

// ── GET /api/marketplace/deals — browse active deals ───────────────────────

router.get("/api/marketplace/deals", async (req: Request, res: Response) => {
  try {
    const city = typeof req.query.city === "string" ? req.query.city.trim().toLowerCase() : "";
    const state = typeof req.query.state === "string" ? req.query.state.trim().toLowerCase() : "";
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "24"), 10) || 24, 1), 50);
    const userLat = typeof req.query.lat === "string" ? Number(req.query.lat) : NaN;
    const userLng = typeof req.query.lng === "string" ? Number(req.query.lng) : NaN;
    const userCoords = Number.isFinite(userLat) && Number.isFinite(userLng) ? { lat: userLat, lng: userLng } : null;

    const now = new Date();
    const rows = await db
      .select({ deal: deals, pkg: packages, store: locations })
      .from(deals)
      .innerJoin(packages, eq(deals.packageId, packages.id))
      .innerJoin(locations, eq(deals.storeId, locations.id))
      .where(and(eq(deals.status, "active"), gt(deals.endsAt, now)))
      .orderBy(desc(deals.createdAt));

    const available = rows.filter(({ deal, store }) => storeCanSellDeals(store) && getDealAvailability(deal, now) === "active");
    const filtered = available.filter(({ store }) => {
      if (city && (store.city || "").toLowerCase() !== city) return false;
      if (state && (store.state || "").toLowerCase() !== state) return false;
      return true;
    });

    const sliced = filtered.slice(0, limit);
    const ratingsByStore = await getRatingsByStore([...new Set(sliced.map(({ store }) => store.id))]);
    const result = sliced.map(({ deal, pkg, store }) => toMarketplaceDeal(deal, pkg, store, ratingsByStore.get(store.id), userCoords));
    res.json(result);
  } catch (err) {
    logger.error({ err }, "[marketplace-deals] list failed");
    res.status(503).json({ error: "Deals unavailable" });
  }
});

// ── GET /api/marketplace/deals/:id — single deal + what's included ─────────

router.get("/api/marketplace/deals/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(404).json({ error: "Deal not found" }); return; }

    const [row] = await db
      .select({ deal: deals, pkg: packages, store: locations })
      .from(deals)
      .innerJoin(packages, eq(deals.packageId, packages.id))
      .innerJoin(locations, eq(deals.storeId, locations.id))
      .where(eq(deals.id, id));
    if (!row) { res.status(404).json({ error: "Deal not found" }); return; }

    const availability = getDealAvailability(row.deal);
    if (availability === "archived" || !storeCanSellDeals(row.store)) { res.status(404).json({ error: "Deal not found" }); return; }

    const itemRows = await db.select().from(packageItems).where(eq(packageItems.packageId, row.pkg.id));
    const svcIds = itemRows.filter(i => i.serviceId).map(i => i.serviceId as number);
    const adnIds = itemRows.filter(i => i.addonId).map(i => i.addonId as number);
    const svcRows = svcIds.length ? await db.select({ id: services.id, name: services.name, duration: services.duration }).from(services).where(inArray(services.id, svcIds)) : [];
    const adnRows = adnIds.length ? await db.select({ id: addons.id, name: addons.name, duration: addons.duration }).from(addons).where(inArray(addons.id, adnIds)) : [];
    const svcMap = new Map(svcRows.map(s => [s.id, s]));
    const adnMap = new Map(adnRows.map(a => [a.id, a]));
    const includes = itemRows
      .map(i => i.itemType === "addon" ? adnMap.get(i.addonId as number) : svcMap.get(i.serviceId as number))
      .filter((x): x is { id: number; name: string; duration: number } => !!x)
      .map(x => ({ name: x.name, durationMinutes: x.duration }));

    const ratingsByStore = await getRatingsByStore([row.store.id]);
    const base = toMarketplaceDeal(row.deal, row.pkg, row.store, ratingsByStore.get(row.store.id), null);
    // Reuses the store's own real, owner-configured booking cancellation
    // policy — no deal-specific freeform text field to fill in.
    const cancellationPolicy = row.store.cancellationPolicyText?.trim()
      || "Contact the salon directly regarding cancellations or refunds.";
    res.json({ ...base, availability, includes, expiryDays: row.deal.expiryDays, cancellationPolicy });
  } catch (err) {
    logger.error({ err }, "[marketplace-deals] detail failed");
    res.status(503).json({ error: "Deal unavailable" });
  }
});

// ── POST /api/marketplace/deals/:id/checkout — embedded Payment Element ────
// Creates a PaymentIntent directly on Certxa's own platform Stripe account
// (no stripeAccount scoping — Certxa collects the payment and settles with
// the salon separately, see lib/dealVoucherPayouts.ts). The client mounts
// Stripe's Payment Element inline against the returned clientSecret — the
// customer never leaves certxa.com. Fulfillment (voucher issuance) happens
// server-side off the payment_intent.succeeded webhook, not this response,
// since a client-reported "success" is never trusted on its own.

router.post("/api/marketplace/deals/:id/checkout", async (req: Request, res: Response) => {
  try {
    if (!isStripeConfigured()) { res.status(503).json({ error: "Payments are not configured" }); return; }
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(404).json({ error: "Deal not found" }); return; }

    const customerEmail = typeof req.body?.customerEmail === "string" ? req.body.customerEmail.trim() : "";
    const customerName = typeof req.body?.customerName === "string" ? req.body.customerName.trim() : "";
    const quantity = Math.min(Math.max(parseInt(String(req.body?.quantity ?? "1"), 10) || 1, 1), 4);
    if (!EMAIL_RE.test(customerEmail)) { res.status(400).json({ error: "A valid email is required" }); return; }
    // A mobile number that can receive SMS is required at purchase — it's
    // how a customer identifies themselves later when calling support about
    // a lost voucher or a refund. Stored as E.164, matching every other
    // phone field in the app (see lib/phoneUtils.ts).
    const customerPhone = toE164US(typeof req.body?.customerPhone === "string" ? req.body.customerPhone : "");
    if (!customerPhone) { res.status(400).json({ error: "A valid 10-digit mobile number is required" }); return; }

    const [row] = await db
      .select({ deal: deals, store: locations })
      .from(deals)
      .innerJoin(locations, eq(deals.storeId, locations.id))
      .where(eq(deals.id, id));
    if (!row) { res.status(404).json({ error: "Deal not found" }); return; }

    const availability = getDealAvailability(row.deal);
    if (availability !== "active" || !storeCanSellDeals(row.store)) { res.status(400).json({ error: "This deal is not currently available" }); return; }
    if (row.deal.purchasedCount + quantity > row.deal.capacity) {
      res.status(400).json({ error: "Not enough vouchers remaining for that quantity" });
      return;
    }

    const amount = Math.round(Number(row.deal.dealPrice) * 100) * quantity;
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      receipt_email: customerEmail,
      description: `${row.deal.title} — ${row.store.name}${row.store.city ? ` · ${row.store.city}, ${row.store.state}` : ""}`,
      metadata: {
        type: "deal_purchase",
        dealId: String(id),
        customerEmail,
        customerName,
        customerPhone,
        quantity: String(quantity),
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null,
      amount,
    });
  } catch (err) {
    logger.error({ err }, "[marketplace-deals] checkout failed");
    res.status(503).json({ error: "Checkout is unavailable right now" });
  }
});

// ── Wallet: guest "My vouchers" access by emailed magic link ───────────────

function generateOpaqueToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

router.post("/api/marketplace/vouchers/request-link", async (req: Request, res: Response) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!EMAIL_RE.test(email)) { res.status(400).json({ error: "A valid email is required" }); return; }

    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + WALLET_TOKEN_TTL_DAYS * 86400000);
    await db.insert(dealWalletTokens).values({ token, email, expiresAt });

    const base = getReturnBaseUrl();
    const link = `${base}/wallet?token=${token}`;
    const sent = await sendEmail(
      0,
      email,
      "Your Certxa vouchers",
      `<p>Here's your link to view your vouchers on Certxa:</p><p><a href="${link}">${link}</a></p><p>This link works for the next 30 days.</p>`,
      `View your vouchers: ${link}`,
    );
    if (!sent.success) { res.status(503).json({ error: "Could not send that email right now" }); return; }
    res.json({ sent: true });
  } catch (err) {
    logger.error({ err }, "[marketplace-deals] wallet link request failed");
    res.status(503).json({ error: "Could not send that email right now" });
  }
});

router.get("/api/marketplace/vouchers/mine", async (req: Request, res: Response) => {
  try {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    if (!token) { res.status(401).json({ error: "A wallet token is required" }); return; }

    const [row] = await db.select().from(dealWalletTokens).where(eq(dealWalletTokens.token, token));
    if (!row || row.expiresAt < new Date()) { res.status(401).json({ error: "That link has expired" }); return; }

    const rows = await db
      .select({ voucher: dealVouchers, deal: deals, store: locations })
      .from(dealVouchers)
      .innerJoin(deals, eq(dealVouchers.dealId, deals.id))
      .innerJoin(locations, eq(deals.storeId, locations.id))
      .where(eq(dealVouchers.customerEmail, row.email))
      .orderBy(desc(dealVouchers.purchasedAt));

    res.json(rows.map(({ voucher, deal, store }) => ({
      id: voucher.id,
      code: voucher.code,
      status: voucher.status,
      purchasedAt: voucher.purchasedAt,
      expiresAt: voucher.expiresAt,
      redeemedAt: voucher.redeemedAt,
      deal: { id: deal.id, title: deal.title, dealPrice: Number(deal.dealPrice) },
      salon: { name: store.name, city: store.city, state: store.state },
    })));
  } catch (err) {
    logger.error({ err }, "[marketplace-deals] wallet lookup failed");
    res.status(503).json({ error: "Could not load your vouchers right now" });
  }
});

export default router;
