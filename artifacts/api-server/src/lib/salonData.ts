/**
 * Salon marketplace data layer — DB access shared by the JSON API
 * (routes/salonApi.ts) and the SSR-serving routes (routes/salonDirectory.ts).
 *
 * Data: the `nail_salons` table (migrated from the asset_discovery scraper
 * DB) plus its normalized `salon_google_*` enrichment tables. `nail_salons`
 * also carries internal lead-scoring/CRM columns used by the sales/
 * prospecting pipeline (lead_score, contract_risk, signal_tags, status,
 * notes, enrichment_status, opportunity_score/badge, has_*) — this file
 * only ever selects the public-safe columns, never those.
 *
 * Task #4: when a salon record's phone matches a Certxa store, real
 * services/hours/a live booking URL are available via findMatchingStore().
 */

import { pool } from "../db";
import { logger } from "./logger";

// Both _enrichmentCache and _storeCache below cache forever, keyed by every
// unique salon touched — with ~50k possible salons and heavy crawler/search
// traffic hitting distinct pages, both grew unboundedly and were the real
// driver behind certxa-api repeatedly climbing to its pm2 max_memory_restart
// ceiling every 1-2 hours (see ecosystem.config.js's comment on that
// setting). FIFO eviction once a cache exceeds maxSize — not true LRU, but
// enough to put a firm ceiling on memory while still caching the hot set of
// pages that make up the bulk of real traffic.
function boundedSet<K, V>(map: Map<K, V>, key: K, value: V, maxSize: number): void {
  map.set(key, value);
  while (map.size > maxSize) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SalonRecord {
  id: number; // nail_salons.id — used for enrichment lookups and inquiries
  s:  string; // slug
  n:  string; // name
  p:  string; // phone
  a:  string; // full address
  st: string; // street
  c:  string; // city
  ss: string; // state abbreviation (or province code for non-US)
  z:  string; // zip
  la: string; // latitude
  lo: string; // longitude
  r:  string; // rating
  rc: string; // review count
  w:  string; // website
  pi: string; // place_id
  ab: string; // AI-generated about text (nail_salons.about_text) — "" until backfilled
  lm: string; // last_seen_at, as YYYY-MM-DD — real per-record sitemap <lastmod>, not a wholesale today's-date stamp
}

export interface LiveStoreData {
  storeId: number;
  name: string;
  bookingSlug: string | null;
  services: Array<{ name: string; price: string; durationMinutes: number }>;
  hours: Array<{ day: number; open: string; close: string; closed: boolean }>;
}

export interface StateIndex {
  code: string;   // "CA"
  name: string;   // "California"
  slug: string;   // "california"
  count: number;
  cities: CityIndex[];
}

export interface CityIndex {
  name: string;  // "Los Angeles"
  slug: string;  // "los-angeles"
  count: number;
}

export interface EnrichmentData {
  attributes: {
    priceLevel: string | null;
    primaryTypeDisplayName: string | null;
    wheelchairAccessibleEntrance: boolean | null;
    goodForChildren: boolean | null;
    allowsDogs: boolean | null;
  } | null;
  hours: Array<{ day: number; open: string | null; close: string | null; closedAllDay: boolean }>;
  reviews: Array<{ author: string; rating: number | null; text: string | null }>;
}

// ── Address parsing ────────────────────────────────────────────────────────────
// `nail_salons.address` is Google's formatted full address string
// ("street, City, ST zip, Country"). There is no separate pre-split
// street/city/state/zip column, so it's derived here, once, at load time.

export const US_STATES = new Set<string>(); // populated below, after STATE_NAMES

export const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", CA: "Canada", MX: "Mexico", BS: "The Bahamas",
};

const ADDRESS_COUNTRY_NAMES: Record<string, "US" | "CA" | "MX" | "BS"> = {
  "usa": "US", "united states": "US", "united states of america": "US",
  "canada": "CA",
  "mexico": "MX",
  "the bahamas": "BS", "bahamas": "BS",
};

/**
 * Splits Google's formatted address string into street/city/state/zip.
 * Handles the standard 4-part US format ("street, City, ST zip, USA") and
 * the 3-part format some non-US/no-street-number listings come back as
 * ("City, ST/Province postal, Country") — e.g. "Fenelon Falls, ON K0M 1N0,
 * Canada" → city="Fenelon Falls", state="ON", zip="K0M 1N0", street="".
 * When the trailing country token isn't recognizable at all (a handful of
 * incomplete addresses), falls back to a best-effort city guess and leaves
 * state/zip blank rather than asserting something unverified.
 */
export function splitAddress(a: string): { street: string; city: string; state: string; zip: string } {
  const parts = (a || "").split(",").map((s) => s.trim()).filter(Boolean);
  const country = ADDRESS_COUNTRY_NAMES[(parts[parts.length - 1] || "").toLowerCase()];

  if (!country) {
    // Exactly "street, city" — a handful of scraped listings have no
    // state/zip/country segment at all (e.g. "43801 Central Station Dr
    // #140, Ashburn"). The general fallback below assumes the
    // second-to-last part is the city, which only holds when something
    // (state/zip or country) trails it; with only 2 parts the LAST one is
    // the city, and treating the second-to-last as city instead grabs the
    // street — which is exactly what produced an empty city/state and a
    // malformed breadcrumb (city name = the street address) for these
    // listings.
    if (parts.length === 2) {
      return { street: parts[0], city: parts[1], state: "", zip: "" };
    }
    const city = parts.length >= 2 ? parts[parts.length - 2] : (parts[0] || "");
    const street = parts.length >= 3 ? parts.slice(0, parts.length - 2).join(", ") : "";
    return { street, city, state: "", zip: "" };
  }

  const regionPostal = parts.length >= 2 ? parts[parts.length - 2] : "";
  const m = regionPostal.match(/^([A-Za-z.]{2,3})\s+(.+)$/);
  const city = parts.length >= 3 ? parts[parts.length - 3] : (parts[0] || "");
  return {
    street: parts.length >= 4 ? parts.slice(0, parts.length - 3).join(", ") : "",
    city,
    state: m ? m[1].replace(/\./g, "").toUpperCase() : "",
    zip: m ? m[2].toUpperCase() : "",
  };
}

// A handful of listings' `website` value is Google's own generic
// "claim your business profile" page rather than a real business site —
// linking "Visit Website" there would send visitors to a dead end.
const GOOGLE_PLACEHOLDER_WEBSITE_RE = /^https?:\/\/business\.google\.com\//i;

// ── Data loading (DB-backed) ────────────────────────────────────────────────────

let _salonMap: Map<string, SalonRecord> | null = null;
let _salonList: SalonRecord[] | null = null;
let _loadError: Error | null = null;
let _loadPromise: Promise<void> | null = null;

async function loadSalonDataFromDb(): Promise<void> {
  const res = await pool.query<{
    id: number; slug: string; name: string; phone: string | null; address: string | null;
    website: string | null; latitude: number; longitude: number;
    place_id: string; rating: number | null; review_count: number | null;
    about_text: string | null; last_seen_at: Date | null;
  }>(
    `SELECT id, slug, name, phone, address, website, latitude, longitude, place_id, rating, review_count, about_text, last_seen_at
     FROM nail_salons WHERE slug IS NOT NULL`
  );
  const todayIso = new Date().toISOString().slice(0, 10);

  const map = new Map<string, SalonRecord>();
  const list: SalonRecord[] = [];
  for (const row of res.rows) {
    const addr = splitAddress(row.address || "");
    const website = row.website && !GOOGLE_PLACEHOLDER_WEBSITE_RE.test(row.website) ? row.website : "";
    const rec: SalonRecord = {
      id: row.id,
      s: row.slug,
      n: row.name,
      p: row.phone || "",
      a: row.address || "",
      st: addr.street,
      c: addr.city,
      ss: addr.state,
      z: addr.zip,
      la: row.latitude != null ? String(row.latitude) : "",
      lo: row.longitude != null ? String(row.longitude) : "",
      r: row.rating != null ? String(row.rating) : "",
      rc: row.review_count != null ? String(row.review_count) : "",
      w: website,
      pi: row.place_id,
      ab: row.about_text || "",
      lm: row.last_seen_at ? row.last_seen_at.toISOString().slice(0, 10) : todayIso,
    };
    map.set(rec.s, rec);
    list.push(rec);
  }
  _salonMap = map;
  _salonList = list;
  logger.info({ count: map.size }, "[salonData] loaded salon data from DB");

  try {
    const imgRes = await pool.query<{ r2_url: string }>(
      `SELECT r2_url FROM site_assets WHERE key NOT LIKE 'kiosk-%' ORDER BY key`
    );
    if (imgRes.rows.length > 0) {
      _salonImagePool = imgRes.rows.map((r) => r.r2_url);
      logger.info({ count: _salonImagePool.length }, "[salonData] loaded salon image pool from site_assets");
    } else {
      logger.warn("[salonData] site_assets has no usable images — falling back to stock photos");
    }
  } catch (err) {
    logger.warn({ err }, "[salonData] failed to load site_assets image pool — falling back to stock photos");
  }
}

/** Call before touching the sync helpers below. */
export async function ensureLoaded(): Promise<void> {
  if (_salonMap) return;
  if (_loadError) throw _loadError;
  if (!_loadPromise) {
    _loadPromise = loadSalonDataFromDb().catch((err) => {
      _loadError = err as Error;
      logger.error({ err }, "[salonData] failed to load salon data");
      _loadPromise = null;
      throw err;
    });
  }
  return _loadPromise;
}

export function getSalonMap(): Map<string, SalonRecord> {
  if (!_salonMap) throw _loadError ?? new Error("salon data not loaded — call ensureLoaded() first");
  return _salonMap;
}

export function getSalonList(): SalonRecord[] {
  if (!_salonList) throw _loadError ?? new Error("salon data not loaded — call ensureLoaded() first");
  return _salonList;
}

// Resolves a slug that no longer exists (e.g. one cleaned up by
// scripts/regenerate-promo-slugs.ts) to that salon's current slug, so an
// already-indexed old URL 301s instead of 404ing. Only consulted on a
// getSalonMap() miss — not on the normal request path.
export async function getSalonRedirectSlug(oldSlug: string): Promise<string | null> {
  const res = await pool.query<{ salon_id: number }>(
    `SELECT salon_id FROM nail_salon_slug_redirects WHERE old_slug = $1`,
    [oldSlug]
  );
  const salonId = res.rows[0]?.salon_id;
  if (!salonId) return null;
  const salon = getSalonList().find((s) => s.id === salonId);
  return salon?.s ?? null;
}

// Only *claimed* listings (a registered Certxa store whose phone matches) get
// indexed. Unclaimed listings are necessarily thinner content — at 47k pages
// that footprint is a sitewide quality risk, so they are `noindex` and kept
// out of the sitemaps.
let _claimedCache: { list: SalonRecord[]; at: number } | null = null;
const CLAIMED_TTL_MS = 10 * 60 * 1000;

export const phone10 = (p: string): string => {
  const d = (p || "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
};

export async function getClaimedSalonList(): Promise<SalonRecord[]> {
  await ensureLoaded();
  if (_claimedCache && Date.now() - _claimedCache.at < CLAIMED_TTL_MS) {
    return _claimedCache.list;
  }
  const res = await pool.query<{ phone: string | null }>(
    `SELECT phone FROM locations WHERE phone IS NOT NULL AND booking_slug IS NOT NULL`,
  );
  const claimed = new Set(
    res.rows.map((r) => phone10(r.phone ?? "")).filter(Boolean),
  );
  const list = getSalonList().filter((r) => r.p && claimed.has(phone10(r.p)));
  _claimedCache = { list, at: Date.now() };
  return list;
}

// ── Constants ──────────────────────────────────────────────────────────────────

// Used only if the site_assets image pool (below) can't be loaded — e.g. a
// fresh DB with no admin-uploaded photos yet.
const FALLBACK_HERO_IMAGES = [
  "https://images.pexels.com/photos/3997389/pexels-photo-3997389.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/939836/pexels-photo-939836.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/704815/pexels-photo-704815.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/3997383/pexels-photo-3997383.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/1570827/pexels-photo-1570827.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/3997385/pexels-photo-3997385.jpeg?auto=compress&cs=tinysrgb&w=1200",
];

// Salon records have no real per-listing photo, so each one is assigned a
// deterministic (same salon always gets the same photo, so OG tags/JSON-LD
// stay stable) but effectively random-looking pick from the admin's
// uploaded photo library (site_assets in R2 — see /isadmin/illustration-
// library's "Site Images" tab), instead of a tiny hardcoded stock-photo set.
// Pre-defined non-photo slots (kiosk UI screenshots) are excluded.
let _salonImagePool: string[] = FALLBACK_HERO_IMAGES;

export const STATE_NAMES: Record<string, string> = {
  AL:"Alabama",    AK:"Alaska",       AZ:"Arizona",      AR:"Arkansas",
  CA:"California", CO:"Colorado",     CT:"Connecticut",  DE:"Delaware",
  FL:"Florida",    GA:"Georgia",      HI:"Hawaii",       ID:"Idaho",
  IL:"Illinois",   IN:"Indiana",      IA:"Iowa",         KS:"Kansas",
  KY:"Kentucky",   LA:"Louisiana",    ME:"Maine",        MD:"Maryland",
  MA:"Massachusetts", MI:"Michigan",  MN:"Minnesota",    MS:"Mississippi",
  MO:"Missouri",   MT:"Montana",      NE:"Nebraska",     NV:"Nevada",
  NH:"New Hampshire", NJ:"New Jersey", NM:"New Mexico",  NY:"New York",
  NC:"North Carolina", ND:"North Dakota", OH:"Ohio",     OK:"Oklahoma",
  OR:"Oregon",     PA:"Pennsylvania", RI:"Rhode Island", SC:"South Carolina",
  SD:"South Dakota",   TN:"Tennessee",TX:"Texas",        UT:"Utah",
  VT:"Vermont",    VA:"Virginia",     WA:"Washington",   WV:"West Virginia",
  WI:"Wisconsin",  WY:"Wyoming",      DC:"Washington DC",
};
for (const code of Object.keys(STATE_NAMES)) US_STATES.add(code);

// Canadian province/territory codes.
export const PROVINCE_NAMES: Record<string, string> = {
  AB:"Alberta", BC:"British Columbia", MB:"Manitoba", NB:"New Brunswick",
  NL:"Newfoundland and Labrador", NS:"Nova Scotia", NT:"Northwest Territories",
  NU:"Nunavut", ON:"Ontario", PE:"Prince Edward Island", QC:"Quebec",
  SK:"Saskatchewan", YT:"Yukon",
};

/**
 * Re-derives country/region from `salon.a` (Google's formatted address)
 * whenever `salon.ss` isn't a recognized 2-letter US state.
 */
export function deriveAddress(salon: SalonRecord): {
  street: string; city: string; state: string; zip: string; country: "US" | "CA" | "MX" | "BS";
} {
  const rawState = (salon.ss || "").trim();
  if (US_STATES.has(rawState)) {
    return { street: salon.st || "", city: salon.c || "", state: rawState, zip: salon.z || "", country: "US" };
  }
  const parts = (salon.a || "").split(",").map((s) => s.trim()).filter(Boolean);
  const country = ADDRESS_COUNTRY_NAMES[(parts[parts.length - 1] || "").toLowerCase()];
  if (!country) {
    return { street: salon.st || "", city: salon.c || salon.st || "", state: "", zip: salon.z || "", country: "US" };
  }
  const regionPostal = parts.length >= 2 ? parts[parts.length - 2] : "";
  const m = regionPostal.match(/^([A-Za-z.]{2,3})\s+(.+)$/);
  const city = parts.length >= 3 ? parts[parts.length - 3] : (salon.st || salon.c || "");
  return {
    street: parts.length >= 4 ? parts.slice(0, parts.length - 3).join(", ") : "",
    city,
    state: m ? m[1].replace(/\./g, "").toUpperCase() : "",
    zip: m ? m[2].toUpperCase() : "",
    country,
  };
}

export const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
export const CERTXA_DOMAIN = "https://certxa.com";
export const CITY_PAGE_SIZE = 20;
// Google permits up to 50,000 URLs per sitemap, but using that maximum creates
// multi-megabyte responses that are slower to generate, transfer, parse, and
// retry. Smaller shards keep every request fast and isolate crawl failures.
export const SITEMAP_PAGE_SIZE = 5_000;

// ── Helpers ────────────────────────────────────────────────────────────────────

export function heroImage(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = ((hash * 31) | 0) + slug.charCodeAt(i);
  return _salonImagePool[Math.abs(hash) % _salonImagePool.length];
}

export function formatPhone(p: string): string {
  const d = p.replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === "1") return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return p;
}

export function toStateSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

export function toCitySlug(city: string): string {
  return city.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function formatHour12(t: string): string {
  const [hStr, mStr = "00"] = t.split(":");
  let h = parseInt(hStr, 10);
  const ampm = h < 12 ? "AM" : "PM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${mStr} ${ampm}`;
}

export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── State / City index ─────────────────────────────────────────────────────────

let _stateIndex: StateIndex[] | null = null;
let _stateBySlug: Map<string, StateIndex> | null = null;
let _cityData: Map<string, Map<string, { name: string; records: SalonRecord[] }>> | null = null;

function buildStateIndex(): void {
  if (_stateIndex) return;

  const list = getSalonList();

  const raw = new Map<string, Map<string, SalonRecord[]>>();
  for (const r of list) {
    if (!US_STATES.has(r.ss) || !r.c) continue;
    if (!raw.has(r.ss)) raw.set(r.ss, new Map());
    const cities = raw.get(r.ss)!;
    const slug = toCitySlug(r.c);
    if (!cities.has(slug)) cities.set(slug, []);
    cities.get(slug)!.push(r);
  }

  const cityLookup = new Map<string, Map<string, { name: string; records: SalonRecord[] }>>();
  for (const [sc, cities] of raw) {
    const m = new Map<string, { name: string; records: SalonRecord[] }>();
    for (const [slug, recs] of cities) {
      m.set(slug, { name: recs[0].c, records: recs });
    }
    cityLookup.set(sc, m);
  }
  _cityData = cityLookup;

  const states: StateIndex[] = [];
  for (const [code, cities] of raw) {
    const stateName = STATE_NAMES[code];
    if (!stateName) continue;
    const cityList: CityIndex[] = [];
    for (const [slug, recs] of cities) {
      cityList.push({ name: recs[0].c, slug, count: recs.length });
    }
    cityList.sort((a, b) => b.count - a.count);
    const total = cityList.reduce((s, c) => s + c.count, 0);
    states.push({ code, name: stateName, slug: toStateSlug(stateName), count: total, cities: cityList });
  }
  states.sort((a, b) => a.name.localeCompare(b.name));

  _stateIndex = states;
  _stateBySlug = new Map(states.map(s => [s.slug, s]));
}

export function getStateIndex(): StateIndex[] {
  buildStateIndex();
  return _stateIndex!;
}

export function getStateBySlug(slug: string): StateIndex | undefined {
  buildStateIndex();
  return _stateBySlug!.get(slug);
}

export function getCityData(stateCode: string, citySlug: string): { name: string; records: SalonRecord[] } | undefined {
  buildStateIndex();
  return _cityData?.get(stateCode)?.get(citySlug);
}

// ── Live store matching (Task #4) ──────────────────────────────────────────────
// On the first request for a given salon slug we check whether a Certxa store
// has the same phone number.  Result (including "no match") is cached forever
// since store ownership doesn't change at high frequency.

const _storeCache = new Map<string, LiveStoreData | null>();

export async function findMatchingStore(slug: string, phone: string): Promise<LiveStoreData | null> {
  if (_storeCache.has(slug)) return _storeCache.get(slug) ?? null;

  const p10 = phone10(phone);
  if (!p10) {
    boundedSet(_storeCache, slug, null, 5000);
    return null;
  }

  try {
    const locRes = await pool.query<{
      id: number; name: string; booking_slug: string | null;
    }>(
      `SELECT id, name, booking_slug
       FROM locations
       WHERE RIGHT(regexp_replace(COALESCE(phone,''), '[^0-9]', '', 'g'), 10) = $1
       LIMIT 1`,
      [p10]
    );

    if (locRes.rows.length === 0) {
      boundedSet(_storeCache, slug, null, 5000);
      return null;
    }

    const loc = locRes.rows[0];

    const [svcRes, hoursRes] = await Promise.all([
      pool.query<{ name: string; price: string; duration: number }>(
        `SELECT name, price::text, duration FROM services
         WHERE store_id = $1 AND is_active = true AND hidden_from_public = false
         ORDER BY id LIMIT 12`,
        [loc.id]
      ),
      pool.query<{ day_of_week: number; open_time: string; close_time: string; is_closed: boolean }>(
        `SELECT day_of_week, open_time, close_time, is_closed
         FROM business_hours WHERE store_id = $1 ORDER BY day_of_week`,
        [loc.id]
      ),
    ]);

    const live: LiveStoreData = {
      storeId: loc.id,
      name: loc.name,
      bookingSlug: loc.booking_slug,
      services: svcRes.rows.map(r => ({
        name: r.name,
        price: `$${parseFloat(r.price).toFixed(0)}`,
        durationMinutes: r.duration ?? 0,
      })),
      hours: hoursRes.rows.map(r => ({
        day: r.day_of_week,
        open: r.open_time,
        close: r.close_time,
        closed: r.is_closed,
      })),
    };

    boundedSet(_storeCache, slug, live, 5000);
    logger.info({ slug, storeId: loc.id }, "[salonData] matched salon to Certxa store");
    return live;
  } catch (err) {
    logger.warn({ err, slug }, "[salonData] store lookup failed — treating as unclaimed");
    boundedSet(_storeCache, slug, null, 5000);
    return null;
  }
}

// ── Enrichment lookup (Google Places hours / reviews / attributes) ─────────────
// Most listings don't have this data yet — the Places-enrichment pass has only
// run for a small pilot batch. Callers render only what's actually present
// per-listing; nothing here is ever fabricated as a fallback.

const _enrichmentCache = new Map<number, EnrichmentData>();

export async function findEnrichment(salonId: number): Promise<EnrichmentData> {
  const cached = _enrichmentCache.get(salonId);
  if (cached) return cached;

  try {
    const [placesRes, hoursRes, reviewsRes] = await Promise.all([
      pool.query<{
        price_level: string | null; primary_type_display_name: string | null;
        wheelchair_accessible_entrance: boolean | null;
        good_for_children: boolean | null; allows_dogs: boolean | null;
      }>(
        `SELECT price_level, primary_type_display_name, wheelchair_accessible_entrance, good_for_children, allows_dogs
         FROM salon_google_places WHERE salon_id = $1 LIMIT 1`,
        [salonId]
      ),
      pool.query<{ day_of_week: number; open_time: string | null; close_time: string | null; is_closed_all_day: boolean }>(
        `SELECT day_of_week, open_time, close_time, is_closed_all_day
         FROM salon_google_hours WHERE salon_id = $1 AND special_date IS NULL
         ORDER BY day_of_week, period_order`,
        [salonId]
      ),
      pool.query<{ author_display_name: string | null; rating: number | null; review_text: string | null }>(
        `SELECT author_display_name, rating, review_text
         FROM salon_google_reviews WHERE salon_id = $1 ORDER BY sort_order LIMIT 5`,
        [salonId]
      ),
    ]);

    const data: EnrichmentData = {
      attributes: placesRes.rows[0] ? {
        priceLevel: placesRes.rows[0].price_level,
        primaryTypeDisplayName: placesRes.rows[0].primary_type_display_name,
        wheelchairAccessibleEntrance: placesRes.rows[0].wheelchair_accessible_entrance,
        goodForChildren: placesRes.rows[0].good_for_children,
        allowsDogs: placesRes.rows[0].allows_dogs,
      } : null,
      hours: hoursRes.rows.map(r => ({ day: r.day_of_week, open: r.open_time, close: r.close_time, closedAllDay: r.is_closed_all_day })),
      reviews: reviewsRes.rows
        .filter(r => r.review_text)
        .map(r => ({ author: r.author_display_name || "Anonymous", rating: r.rating, text: r.review_text })),
    };
    boundedSet(_enrichmentCache, salonId, data, 5000);
    return data;
  } catch (err) {
    logger.warn({ err, salonId }, "[salonData] enrichment lookup failed — rendering without it");
    const empty: EnrichmentData = { attributes: null, hours: [], reviews: [] };
    boundedSet(_enrichmentCache, salonId, empty, 5000);
    return empty;
  }
}
