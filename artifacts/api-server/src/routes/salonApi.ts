/**
 * Marketplace JSON API — backs the React app in artifacts/marketplace (both
 * client-side fetches and the SSR entry's server-side prefetches call these
 * same shapes). Real data from nail_salons + locations, matching the
 * Salon/SalonProfile contract the frontend expects. No Google ratings,
 * reviews, hours or attributes and no generated text are published
 * (plans/salon-directory.md); a salon's hours, menu and reviews come from
 * its own Certxa store.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { pool } from "../db";
import { logger } from "../lib/logger";
import {
  ensureLoaded, getSalonMap, getSalonList, getClaimedSalonList, getIndexableHubs,
  findMatchingStore, deriveAddress, heroImage, forgetSalon,
  formatHour12, DAY_NAMES, CERTXA_DOMAIN,
  getStateBySlug, getCityData, getStateIndex, toCitySlug,
  STATE_NAMES, US_STATES, haversineMiles, getSalonRedirectSlug,
  salonPath, statePath, cityPath, LICENSE_SOURCES,
  type SalonRecord,
} from "../lib/salonData";
import { requestIp, resolveVisitorCity } from "../lib/geoLookup";
import rateLimit from "express-rate-limit";
import { sendEmail } from "../mail";

const router = Router();

// ── Response shapes (mirrors artifacts/marketplace/src/lib/api.ts) ────────────

interface ApiSalon {
  id: number;
  slug: string;
  name: string;
  category: string;
  city: string;
  state: string;
  rating: number;
  reviewCount: number;
  priceLevel: string;
  imageUrl: string;
  tags: string[];
  distance: string;
  featured?: boolean;
  description: string;
  latitude?: number;
  longitude?: number;
  street: string;
  /** The salon's directory page, /salons/{state}/{city}/{salon}. */
  url: string;
  /** "Active" / "Current" license from the state board that issued it. */
  licensed: boolean;
}

function formatDistanceMiles(miles: number): string {
  return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
}

function toApiSalon(r: SalonRecord, claimedSet: Set<string>, distanceMiles?: number): ApiSalon {
  const addr = deriveAddress(r);
  // Google's rating is not republished (plans/salon-directory.md); list cards
  // carry no rating, and a salon profile shows only Certxa's own reviews.
  const rating = 0;
  const reviewCount = 0;
  const lat = r.la ? parseFloat(r.la) : undefined;
  const lng = r.lo ? parseFloat(r.lo) : undefined;
  return {
    id: r.id,
    slug: r.s,
    name: r.n || "Nail Salon",
    category: "Nail Salon",
    city: addr.city,
    state: addr.state,
    rating,
    reviewCount,
    priceLevel: "",
    imageUrl: heroImage(r.s),
    tags: [],
    distance: typeof distanceMiles === "number" ? formatDistanceMiles(distanceMiles) : "",
    featured: claimedSet.has(r.s),
    description: addr.city ? `Nail salon in ${addr.city}${addr.state ? `, ${addr.state}` : ""}.` : "Nail salon.",
    ...(lat != null && !Number.isNaN(lat) ? { latitude: lat } : {}),
    ...(lng != null && !Number.isNaN(lng) ? { longitude: lng } : {}),
    street: addr.street,
    url: salonPath(r),
    licensed: /^(active|current)$/i.test(r.lst),
  };
}

function resolveLocationRecords(value: string): SalonRecord[] | null {
  const raw = value.trim();
  if (!raw) return null;

  const [cityPart, statePart = ""] = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (!cityPart || !statePart) return null;

  const stateToken = statePart.toUpperCase();
  let stateCode = US_STATES.has(stateToken) ? stateToken : "";
  if (!stateCode) {
    const normalizedState = statePart.toLowerCase().replace(/\s+/g, "-");
    const state = getStateIndex().find((item) =>
      item.slug === normalizedState || item.name.toLowerCase() === statePart.toLowerCase()
    );
    stateCode = state?.code || "";
  }
  if (!stateCode || !STATE_NAMES[stateCode]) return null;

  return getCityData(stateCode, toCitySlug(cityPart))?.records || [];
}

// ── GET /api/salons — search / list ─────────────────────────────────────────

router.get("/api/salons", async (req: Request, res: Response) => {
  try {
    await ensureLoaded();
    const rawSearch = typeof req.query.search === "string" ? req.query.search.trim() : "";
    let search = rawSearch.toLowerCase();
    const rawLocation = typeof req.query.location === "string" ? req.query.location.trim() : "";
    const userLat = typeof req.query.lat === "string" ? Number(req.query.lat) : NaN;
    const userLng = typeof req.query.lng === "string" ? Number(req.query.lng) : NaN;
    const hasUserCoords = Number.isFinite(userLat) && Number.isFinite(userLng);
    const service = typeof req.query.service === "string" ? req.query.service.trim().toLowerCase() : "";
    const sort = typeof req.query.sort === "string" ? req.query.sort : "recommended";
    const radius = Math.min(Math.max(parseInt(String(req.query.radius ?? "0"), 10) || 0, 0), 100);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "12"), 10) || 12, 1), 50);

    // The dataset is nail salons only — an honest empty result for any other
    // service filter beats silently showing nail salons under "Hair".
    if (service && !service.includes("nail")) {
      res.json([]);
      return;
    }

    const claimed = new Set((await getClaimedSalonList()).map((r) => r.s));
    const locationRecords = rawLocation ? resolveLocationRecords(rawLocation) : null;
    const searchLocationRecords = !locationRecords && rawSearch.includes(",") ? resolveLocationRecords(rawSearch) : null;
    let list = locationRecords ?? searchLocationRecords ?? getSalonList();
    if (searchLocationRecords) search = "";
    if (search) {
      list = list.filter((r) =>
        r.n.toLowerCase().includes(search) ||
        r.c.toLowerCase().includes(search) ||
        r.ss.toLowerCase().includes(search)
      );
    }

    const scored = list.map((r) => {
      const salonLat = r.la ? Number(r.la) : NaN;
      const salonLng = r.lo ? Number(r.lo) : NaN;
      const distanceMiles = hasUserCoords && Number.isFinite(salonLat) && Number.isFinite(salonLng)
        ? haversineMiles(userLat, userLng, salonLat, salonLng)
        : null;
      return {
        r,
        rating: r.r ? parseFloat(r.r) : 0,
        reviews: r.rc ? parseInt(r.rc, 10) : 0,
        distanceMiles,
      };
    });
    if (sort === "rating") {
      scored.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
    } else if (hasUserCoords) {
      scored.sort((a, b) => {
        if (a.distanceMiles == null && b.distanceMiles == null) return b.rating - a.rating || b.reviews - a.reviews;
        if (a.distanceMiles == null) return 1;
        if (b.distanceMiles == null) return -1;
        return a.distanceMiles - b.distanceMiles || b.rating - a.rating || b.reviews - a.reviews;
      });
    } else {
      // Without precise coordinates, "recommended" and "distance" degrade to
      // city-scoped recommended order: claimed listings first, then rating.
      scored.sort((a, b) => {
        const aClaimed = claimed.has(a.r.s) ? 1 : 0;
        const bClaimed = claimed.has(b.r.s) ? 1 : 0;
        if (aClaimed !== bClaimed) return bClaimed - aClaimed;
        return b.rating - a.rating || b.reviews - a.reviews;
      });
    }

    // When a radius is requested and the user has precise coordinates, drop
    // anything beyond that many miles — the map should only show what's
    // genuinely reachable from where they are.
    const visible = radius > 0 && hasUserCoords
      ? scored.filter((s) => s.distanceMiles != null && s.distanceMiles <= radius)
      : scored;
    res.json(visible.slice(0, limit).map(({ r, distanceMiles }) => toApiSalon(r, claimed, distanceMiles ?? undefined)));
  } catch (err) {
    logger.error({ err }, "[salonApi] list salons failed");
    res.status(503).json({ error: "Salon data unavailable" });
  }
});

// ── GET /api/salons/featured ─────────────────────────────────────────────────
// Optional browser coordinates take priority over the IP-derived city slugs.
// The closest indexed salon identifies the visitor's local city, keeping the
// precise coordinates out of the response while still producing a city list.

router.get("/api/salons/featured", async (req: Request, res: Response) => {
  try {
    await ensureLoaded();
    const claimedList = await getClaimedSalonList();
    const claimed = new Set(claimedList.map((r) => r.s));

    const citySlug = typeof req.query.citySlug === "string" ? req.query.citySlug : "";
    const stateSlug = typeof req.query.stateSlug === "string" ? req.query.stateSlug : "";
    const userLat = typeof req.query.lat === "string" ? Number(req.query.lat) : NaN;
    const userLng = typeof req.query.lng === "string" ? Number(req.query.lng) : NaN;
    const hasUserCoords = Number.isFinite(userLat) && Number.isFinite(userLng);
    let pool_: SalonRecord[] | null = null;
    if (hasUserCoords) {
      const closest = getSalonList().reduce<{ record: SalonRecord; miles: number } | null>((best, record) => {
        const lat = record.la ? Number(record.la) : NaN;
        const lng = record.lo ? Number(record.lo) : NaN;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return best;
        const miles = haversineMiles(userLat, userLng, lat, lng);
        return !best || miles < best.miles ? { record, miles } : best;
      }, null);
      if (closest) {
        const address = deriveAddress(closest.record);
        const state = getStateIndex().find((item) => item.code === address.state || item.name === address.state);
        const city = state ? getCityData(state.code, toCitySlug(address.city)) : undefined;
        if (city && city.records.length >= 4) pool_ = city.records;
      }
    }
    if (!pool_ && citySlug && stateSlug) {
      const state = getStateBySlug(stateSlug);
      const city = state ? getCityData(state.code, citySlug) : undefined;
      if (city && city.records.length >= 4) pool_ = city.records;
    }
    if (!pool_) pool_ = claimedList.length >= 8 ? claimedList : getSalonList();

    const scored = pool_
      .map((r) => ({ r, rating: r.r ? parseFloat(r.r) : 0, reviews: r.rc ? parseInt(r.rc, 10) : 0 }))
      .filter((x) => x.rating > 0);
    scored.sort((a, b) => (b.rating * Math.log(b.reviews + 2)) - (a.rating * Math.log(a.reviews + 2)));
    res.json(scored.slice(0, 8).map(({ r }) => toApiSalon(r, claimed)));
  } catch (err) {
    logger.error({ err }, "[salonApi] featured salons failed");
    res.status(503).json({ error: "Salon data unavailable" });
  }
});

// ── GET /api/geo — IP-detected city, used to scope the homepage's featured list ──

router.get("/api/geo", async (req: Request, res: Response) => {
  try {
    await ensureLoaded();
    const geo = resolveVisitorCity(requestIp(req));
    res.setHeader("Cache-Control", "private, max-age=300");
    res.json(geo);
  } catch (err) {
    logger.error({ err }, "[salonApi] geo lookup failed");
    res.json(null);
  }
});

// ── GET /api/salons/:slug — full profile ─────────────────────────────────────

router.get("/api/salons/:slug", async (req: Request, res: Response) => {
  try {
    await ensureLoaded();
    const slug = String(req.params.slug);
    const salon = getSalonMap().get(slug);
    if (!salon) {
      // Slug may have been cleaned up by scripts/regenerate-promo-slugs.ts —
      // check for a redirect before declaring a true 404, so an
      // already-indexed old URL points SSR at the new slug instead of
      // silently dying.
      const redirectTo = await getSalonRedirectSlug(slug);
      res.status(404).json(redirectTo ? { error: "Salon not found", redirectTo } : { error: "Salon not found" });
      return;
    }

    const live = salon.p ? await findMatchingStore(salon.s, salon.p) : null;
    const addr = deriveAddress(salon);
    const claimedSet = new Set(live ? [salon.s] : []);
    const base = toApiSalon(salon, claimedSet);

    // Ratings and reviews come only from Certxa's own reviews (left after a
    // completed Certxa appointment), never from Google, and only once a store
    // has at least 3 — the minimum used elsewhere before a rating is shown.
    let rating = 0;
    let reviewCount = 0;
    let reviewList: Array<{ author: string; rating: number | null; text: string | null; serviceName?: string | null; staffName?: string | null }> = [];
    if (live) {
      const nativeAgg = await pool.query<{ avg: string | null; cnt: string }>(
        `SELECT AVG(rating)::text AS avg, COUNT(*)::text AS cnt FROM reviews WHERE store_id = $1 AND is_public = true`,
        [live.storeId]
      );
      const nativeCount = Number(nativeAgg.rows[0]?.cnt ?? 0);
      if (nativeCount >= 3) {
        rating = Math.round(Number(nativeAgg.rows[0]?.avg ?? 0) * 10) / 10;
        reviewCount = nativeCount;
      }
      if (!reviewList.length) {
        const nativeReviews = await pool.query<{ customer_name: string | null; rating: number; comment: string | null; service_name: string | null; staff_name: string | null }>(
          `SELECT customer_name, rating, comment, service_name, staff_name FROM reviews
           WHERE store_id = $1 AND is_public = true AND comment IS NOT NULL
           ORDER BY created_at DESC LIMIT 10`,
          [live.storeId]
        );
        reviewList = nativeReviews.rows.map((r) => ({
          author: r.customer_name || "Certxa customer",
          rating: r.rating,
          text: r.comment,
          serviceName: r.service_name,
          staffName: r.staff_name,
        }));
      }
    }

    // Hours come only from the salon's own Certxa store, never from Google
    // Places (plans/salon-directory.md).
    const hours = live?.hours.length
      ? live.hours.map((h) => ({ day: DAY_NAMES[h.day], open: h.closed ? "Closed" : formatHour12(h.open), close: h.closed ? "" : formatHour12(h.close) }))
      : [];

    const services = live?.services.length
      ? live.services.map((s, i) => ({ id: i + 1, name: s.name, durationMinutes: s.durationMinutes, price: parseFloat(s.price.replace(/[^0-9.]/g, "")) || 0 }))
      : [];

    const highlights: string[] = [];

    // Real nearby salons (by actual distance from this salon's own real
    // coordinates) — adds genuine content depth and internal linking to
    // what would otherwise be a short, mostly-AI-written page. No
    // fabrication: every listing here is a real record, sorted by real
    // distance, and simply omitted (not faked) when this salon has no
    // coordinates on file.
    const salonLat = salon.la ? Number(salon.la) : NaN;
    const salonLng = salon.lo ? Number(salon.lo) : NaN;
    let nearby: ReturnType<typeof toApiSalon>[] = [];
    if (Number.isFinite(salonLat) && Number.isFinite(salonLng)) {
      const withDistance = getSalonList()
        .filter((r) => r.s !== salon.s && r.la && r.lo)
        .map((r) => ({ r, miles: haversineMiles(salonLat, salonLng, Number(r.la), Number(r.lo)) }))
        .filter((x) => Number.isFinite(x.miles));
      withDistance.sort((a, b) => a.miles - b.miles);
      nearby = withDistance.slice(0, 6).map(({ r, miles }) => toApiSalon(r, new Set(), miles));
    }

    const board = LICENSE_SOURCES[salon.ls];
    res.json({
      ...base,
      license: board
        ? { board: board.board, short: board.short, number: salon.ln, status: salon.lst, expires: salon.lx || undefined, verifyUrl: board.verifyUrl, checked: salon.lm }
        : undefined,
      stateUrl: US_STATES.has(salon.ss) ? statePath(salon.ss) : undefined,
      cityUrl: US_STATES.has(salon.ss) && salon.c ? cityPath(salon.ss, toCitySlug(salon.c)) : undefined,
      name: live?.name || base.name,
      rating,
      reviewCount,
      address: salon.a,
      phone: salon.p,
      website: salon.w || undefined,
      hours,
      services,
      gallery: [],
      highlights,
      bookingUrl: live?.bookingSlug ? `${CERTXA_DOMAIN}/${live.bookingSlug}` : undefined,
      city: addr.city,
      state: addr.state,
      nearby,
      reviews: reviewList,
    });
  } catch (err) {
    logger.error({ err }, "[salonApi] salon profile failed");
    res.status(503).json({ error: "Salon data unavailable" });
  }
});

// ── POST /api/salons/:slug/inquiries ────────────────────────────────────────

function validateInquiry(body: unknown): { name: string; email: string; message: string } | null {
  const b = body as Record<string, unknown> | null;
  const name = typeof b?.name === "string" ? b.name.trim() : "";
  const email = typeof b?.email === "string" ? b.email.trim() : "";
  const message = typeof b?.message === "string" ? b.message.trim() : "";
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 5) return null;
  return { name, email, message };
}

router.post("/api/salons/:slug/inquiries", async (req: Request, res: Response) => {
  try {
    await ensureLoaded();
    const salon = getSalonMap().get(String(req.params.slug));
    if (!salon) {
      res.status(404).json({ error: "Salon not found" });
      return;
    }
    const data = validateInquiry(req.body);
    if (!data) {
      res.status(400).json({ error: "Please provide a valid name, email, and message." });
      return;
    }
    const result = await pool.query<{ id: number; created_at: string }>(
      `INSERT INTO directory_inquiries (salon_id, name, email, message) VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [salon.id, data.name, data.email, data.message]
    );
    logger.info({ salonId: salon.id, slug: salon.s }, "[salonApi] directory inquiry received");
    res.status(201).json({ id: result.rows[0].id, createdAt: result.rows[0].created_at, ...data });
  } catch (err) {
    logger.error({ err }, "[salonApi] inquiry insert failed");
    res.status(500).json({ error: "Something went wrong" });
  }
});

// ── POST /api/directory/:slug/removal — "Remove this listing" ───────────────
// Anyone can ask for a directory listing to be removed. It is hidden at once
// (directory_listings.opted_out_at); the request is kept and support is emailed
// so a bad-faith removal can be reversed (plans/salon-directory.md).

router.post(
  "/api/directory/:slug/removal",
  rateLimit({ windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false }),
  async (req: Request, res: Response) => {
    try {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
      const name = text(b.name, 200);
      const email = text(b.email, 200);
      const relationship = text(b.relationship, 100);
      const reason = text(b.reason, 2000);
      if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: "Please give your name and a valid email address." });
        return;
      }
      const listing = await pool.query<{ id: number; name: string; city: string | null; state: string }>(
        `UPDATE directory_listings SET opted_out_at = COALESCE(opted_out_at, now()), opt_out_reason = $2
         WHERE slug = $1 RETURNING id, name, city, state`,
        [String(req.params.slug), reason || null],
      );
      const row = listing.rows[0];
      if (!row) {
        res.status(404).json({ error: "Listing not found" });
        return;
      }
      await pool.query(
        `INSERT INTO directory_removal_requests (listing_id, name, email, relationship, reason, ip) VALUES ($1, $2, $3, $4, $5, $6)`,
        [row.id, name, email, relationship || null, reason || null, requestIp(req)],
      );
      logger.info({ listingId: row.id, slug: req.params.slug }, "[salonApi] directory listing removed on request");
      forgetSalon(String(req.params.slug));
      const where = [row.city, row.state].filter(Boolean).join(", ");
      void sendEmail(
        0,
        "support@certxa.com",
        `Directory listing removed: ${row.name}${where ? ` (${where})` : ""}`,
        `<p>${escapeHtml(name)} &lt;${escapeHtml(email)}&gt; asked for the listing <strong>${escapeHtml(row.name)}</strong> (${escapeHtml(String(req.params.slug))}) to be removed. It is now hidden.</p>` +
          `<p><strong>Relationship:</strong> ${escapeHtml(relationship || "not given")}<br><strong>Reason:</strong> ${escapeHtml(reason || "not given")}</p>` +
          `<p>To restore it: <code>UPDATE directory_listings SET opted_out_at = NULL WHERE id = ${row.id};</code></p>`,
      ).catch((err) => logger.warn({ err }, "[salonApi] removal notice email failed"));
      res.status(201).json({ removed: true });
    } catch (err) {
      logger.error({ err }, "[salonApi] directory removal failed");
      res.status(500).json({ error: "Something went wrong" });
    }
  },
);

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── POST /api/business-inquiries — "For salon owners" lead form ────────────

router.post("/api/business-inquiries", async (req: Request, res: Response) => {
  try {
    const data = validateInquiry(req.body);
    if (!data) {
      res.status(400).json({ error: "Please provide a valid name, email, and message." });
      return;
    }
    const result = await pool.query<{ id: number; created_at: string }>(
      `INSERT INTO directory_inquiries (salon_id, name, email, message) VALUES (NULL, $1, $2, $3) RETURNING id, created_at`,
      [data.name, data.email, data.message]
    );
    logger.info({ email: data.email }, "[salonApi] business inquiry received");
    res.status(201).json({ id: result.rows[0].id, createdAt: result.rows[0].created_at, ...data });
  } catch (err) {
    logger.error({ err }, "[salonApi] business inquiry insert failed");
    res.status(500).json({ error: "Something went wrong" });
  }
});

// ── GET /api/listings — every state in the directory ───────────────────────

router.get("/api/listings", async (_req: Request, res: Response) => {
  try {
    await ensureLoaded();
    const hubs = await getIndexableHubs();
    res.json(getStateIndex().map((s) => ({
      code: s.code, name: s.name, slug: s.slug, count: s.count, cities: s.cities.length,
      url: statePath(s.code), indexable: hubs.states.has(s.code),
    })));
  } catch (err) {
    logger.error({ err }, "[salonApi] state list failed");
    res.status(503).json({ error: "Salon data unavailable" });
  }
});

/** Which board licenses a state's salons, for the state and city pages. */
function stateLicenseNote(stateCode: string): { board: string; verifyUrl: string } | undefined {
  const source = { TX: "tx_tdlr", CA: "ca_bbc", FL: "fl_dbpr" }[stateCode];
  const board = source ? LICENSE_SOURCES[source] : undefined;
  return board ? { board: board.board, verifyUrl: board.verifyUrl } : undefined;
}

// ── GET /api/listings/:param — state or city--state listing hub ────────────
// param without "--" is a state slug; with "--" it's "citySlug--stateSlug".

router.get("/api/listings/:param", async (req: Request, res: Response) => {
  try {
    await ensureLoaded();
    const param = String(req.params.param);
    const sep = param.lastIndexOf("--");
    const claimed = new Set((await getClaimedSalonList()).map((r) => r.s));
    const hubs = await getIndexableHubs();

    if (sep === -1) {
      const state = getStateBySlug(param);
      if (!state) {
        res.status(404).json({ error: "State not found" });
        return;
      }
      res.json({
        code: state.code,
        name: state.name,
        slug: state.slug,
        count: state.count,
        indexable: hubs.states.has(state.code),
        url: statePath(state.code),
        license: stateLicenseNote(state.code),
        cities: state.cities.map((c) => ({ name: c.name, slug: c.slug, count: c.count, url: cityPath(state.code, c.slug) })),
      });
      return;
    }

    const citySlug = param.slice(0, sep);
    const stateSlug = param.slice(sep + 2);
    const state = getStateBySlug(stateSlug);
    if (!state) {
      res.status(404).json({ error: "State not found" });
      return;
    }
    const city = getCityData(state.code, citySlug);
    if (!city) {
      res.status(404).json({ error: "City not found" });
      return;
    }
    res.json({
      stateName: state.name,
      stateSlug: state.slug,
      cityName: city.name,
      citySlug,
      url: cityPath(state.code, citySlug),
      stateUrl: statePath(state.code),
      license: stateLicenseNote(state.code),
      indexable: hubs.cities.has(`${state.code}:${citySlug}`),
      salons: city.records.map((r) => toApiSalon(r, claimed)),
    });
  } catch (err) {
    logger.error({ err }, "[salonApi] listings lookup failed");
    res.status(503).json({ error: "Salon data unavailable" });
  }
});

export default router;
