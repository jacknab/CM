/**
 * Marketplace JSON API — backs the React app in artifacts/marketplace (both
 * client-side fetches and the SSR entry's server-side prefetches call these
 * same shapes). Real data from nail_salons + salon_google_* + locations,
 * matching the Salon/SalonProfile contract the frontend expects. No
 * fabricated content: unclaimed listings only ever include what's actually
 * known (see salonData.ts's findEnrichment for the enrichment story).
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { pool } from "../db";
import { logger } from "../lib/logger";
import {
  ensureLoaded, getSalonMap, getSalonList, getClaimedSalonList,
  findMatchingStore, findEnrichment, deriveAddress, heroImage,
  formatHour12, DAY_NAMES, CERTXA_DOMAIN,
  getStateBySlug, getCityData, getStateIndex, toCitySlug,
  STATE_NAMES, US_STATES, haversineMiles,
  type SalonRecord,
} from "../lib/salonData";
import { requestIp, resolveVisitorCity } from "../lib/geoLookup";

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
  isOpen?: boolean;
  featured?: boolean;
  description: string;
  latitude?: number;
  longitude?: number;
}

function formatDistanceMiles(miles: number): string {
  return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
}

function toApiSalon(r: SalonRecord, claimedSet: Set<string>, distanceMiles?: number): ApiSalon {
  const addr = deriveAddress(r);
  const rating = r.r ? parseFloat(r.r) : 0;
  const reviewCount = r.rc ? parseInt(r.rc, 10) : 0;
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
// Optional ?citySlug=&stateSlug= (set from IP-detected city, see /api/geo)
// scopes the pool to that city; falls back to the global pool when the city
// has too few rated listings to make a meaningful "featured" list.

router.get("/api/salons/featured", async (req: Request, res: Response) => {
  try {
    await ensureLoaded();
    const claimedList = await getClaimedSalonList();
    const claimed = new Set(claimedList.map((r) => r.s));

    const citySlug = typeof req.query.citySlug === "string" ? req.query.citySlug : "";
    const stateSlug = typeof req.query.stateSlug === "string" ? req.query.stateSlug : "";
    let pool_: SalonRecord[] | null = null;
    if (citySlug && stateSlug) {
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
      res.status(404).json({ error: "Salon not found" });
      return;
    }

    const live = salon.p ? await findMatchingStore(salon.s, salon.p) : null;
    const enrichment = live ? { attributes: null, hours: [], reviews: [] } : await findEnrichment(salon.id);
    const addr = deriveAddress(salon);
    const claimedSet = new Set(live ? [salon.s] : []);
    const base = toApiSalon(salon, claimedSet);

    const hours = live?.hours.length
      ? live.hours.map((h) => ({ day: DAY_NAMES[h.day], open: h.closed ? "Closed" : formatHour12(h.open), close: h.closed ? "" : formatHour12(h.close) }))
      : enrichment.hours.length
      ? enrichment.hours.map((h) => ({ day: DAY_NAMES[h.day], open: h.closedAllDay || !h.open ? "Closed" : formatHour12(h.open), close: h.closedAllDay || !h.close ? "" : formatHour12(h.close) }))
      : [];

    const services = live?.services.length
      ? live.services.map((s, i) => ({ id: i + 1, name: s.name, durationMinutes: s.durationMinutes, price: parseFloat(s.price.replace(/[^0-9.]/g, "")) || 0 }))
      : [];

    const highlights: string[] = [];
    if (!live && enrichment.attributes) {
      const attr = enrichment.attributes;
      if (attr.priceLevel) highlights.push(attr.priceLevel.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()));
      if (attr.wheelchairAccessibleEntrance) highlights.push("Wheelchair accessible");
      if (attr.goodForChildren) highlights.push("Good for children");
      if (attr.allowsDogs) highlights.push("Dog friendly");
    }

    res.json({
      ...base,
      name: live?.name || base.name,
      address: salon.a,
      phone: salon.p,
      website: salon.w || undefined,
      hours,
      services,
      gallery: [],
      highlights,
      about: salon.ab || undefined,
      bookingUrl: live?.bookingSlug ? `${CERTXA_DOMAIN}/${live.bookingSlug}` : undefined,
      city: addr.city,
      state: addr.state,
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

// ── GET /api/listings/:param — state or city--state listing hub ────────────
// param without "--" is a state slug; with "--" it's "citySlug--stateSlug".

router.get("/api/listings/:param", async (req: Request, res: Response) => {
  try {
    await ensureLoaded();
    const param = String(req.params.param);
    const sep = param.lastIndexOf("--");
    const claimed = new Set((await getClaimedSalonList()).map((r) => r.s));

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
        cities: state.cities.map((c) => ({ name: c.name, slug: c.slug, count: c.count })),
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
      salons: city.records.map((r) => toApiSalon(r, claimed)),
    });
  } catch (err) {
    logger.error({ err }, "[salonApi] listings lookup failed");
    res.status(503).json({ error: "Salon data unavailable" });
  }
});

export default router;
