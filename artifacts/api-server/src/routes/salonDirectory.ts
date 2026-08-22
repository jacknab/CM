/**
 * Salon Business Directory
 *
 * Routes:
 *   /nail-salons                        — national directory (all states)
 *   /nail-salons/united-states          — alias → /nail-salons
 *   /nail-salons/:stateSlug             — state browse page
 *   /nail-salons/:stateSlug/:citySlug   — city page, paginated
 *   /salon/sitemap.xml                  — sitemap (index if >50k records)
 *   /salon/sitemap-:page.xml            — paginated sitemap slice
 *   /salon/:slug                        — individual salon page
 *
 * Data: public/salon-data.json (~17MB, ~51k records) loaded once at first
 * request and cached in memory for the process lifetime.
 *
 * Task #4: when a salon record's phone matches a Certxa store, the page
 * renders with real services, real hours, and a live booking CTA.
 */

import path from "path";
import fs from "fs";
import { Router } from "express";
import type { Request, Response } from "express";
import { pool } from "../db";
import { logger } from "../lib/logger";

const router = Router();

// ── Types ──────────────────────────────────────────────────────────────────────

interface SalonRecord {
  s:  string; // slug
  n:  string; // name
  p:  string; // phone
  a:  string; // full address
  st: string; // street
  c:  string; // city
  ss: string; // state abbreviation
  z:  string; // zip
  la: string; // latitude
  lo: string; // longitude
  r:  string; // rating
  rc: string; // review count
  w:  string; // website
  pi: string; // place_id
}

interface LiveStoreData {
  storeId: number;
  name: string;
  bookingSlug: string | null;
  services: Array<{ name: string; price: string }>;
  hours: Array<{ day: number; open: string; close: string; closed: boolean }>;
}

interface StateIndex {
  code: string;   // "CA"
  name: string;   // "California"
  slug: string;   // "california"
  count: number;
  cities: CityIndex[];
}

interface CityIndex {
  name: string;  // "Los Angeles"
  slug: string;  // "los-angeles"
  count: number;
}

// ── Data loading ───────────────────────────────────────────────────────────────

let _salonMap: Map<string, SalonRecord> | null = null;
let _salonList: SalonRecord[] | null = null;
let _loadError: Error | null = null;

// Resolve the data file path — works whether the server is run from the
// workspace root (production: `node artifacts/api-server/dist/index.mjs`)
// or from the api-server package directory (dev: `pnpm --filter … exec tsx`).
function resolveDataFile(): string {
  const candidates = [
    path.resolve(process.cwd(), "public/salon-data.json"),        // prod: cwd = workspace root
    path.resolve(process.cwd(), "../../public/salon-data.json"),  // dev: cwd = artifacts/api-server
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0]; // will give a clear ENOENT at read time
}
const DATA_FILE = resolveDataFile();

function loadSalonData(): Map<string, SalonRecord> {
  if (_salonMap) return _salonMap;
  if (_loadError) throw _loadError;
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const records: SalonRecord[] = JSON.parse(raw);
    const map = new Map<string, SalonRecord>();
    for (const rec of records) map.set(rec.s, rec);
    _salonMap = map;
    _salonList = records;
    logger.info({ count: map.size }, "[salonDir] loaded salon data");
    return map;
  } catch (err) {
    _loadError = err as Error;
    logger.error({ err }, "[salonDir] failed to load salon data");
    throw err;
  }
}

function getSalonList(): SalonRecord[] {
  loadSalonData();
  return _salonList!;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const HERO_IMAGES = [
  "https://images.pexels.com/photos/3997389/pexels-photo-3997389.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/939836/pexels-photo-939836.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/704815/pexels-photo-704815.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/3997383/pexels-photo-3997383.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/1570827/pexels-photo-1570827.jpeg?auto=compress&cs=tinysrgb&w=1200",
  "https://images.pexels.com/photos/3997385/pexels-photo-3997385.jpeg?auto=compress&cs=tinysrgb&w=1200",
];

const STATE_NAMES: Record<string, string> = {
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

const US_STATES = new Set(Object.keys(STATE_NAMES));

const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

const PLACEHOLDER_SERVICES: Array<[string, string]> = [
  ["Classic Manicure", "$25"],
  ["Gel Manicure", "$40"],
  ["Acrylic Full Set", "$45"],
  ["Dip Powder Nails", "$50"],
  ["Classic Pedicure", "$35"],
  ["Spa Pedicure", "$50"],
  ["Gel Nail Extensions", "$55"],
  ["Nail Art", "$10+"],
  ["French Manicure", "$30"],
  ["Solar Nails", "$55"],
];

const PLACEHOLDER_HOURS: Array<[string, string]> = [
  ["Monday",    "9:30 AM – 7:00 PM"],
  ["Tuesday",   "9:30 AM – 7:00 PM"],
  ["Wednesday", "9:30 AM – 7:00 PM"],
  ["Thursday",  "9:30 AM – 7:00 PM"],
  ["Friday",    "9:30 AM – 7:00 PM"],
  ["Saturday",  "9:30 AM – 7:00 PM"],
  ["Sunday",    "12:00 PM – 5:00 PM"],
];

const CERTXA_DOMAIN = "https://certxa.com";
// Google permits up to 50,000 URLs per sitemap, but using that maximum creates
// multi-megabyte responses that are slower to generate, transfer, parse, and
// retry. Smaller shards keep every request fast and isolate crawl failures.
const SITEMAP_PAGE_SIZE = 5_000;
const CITY_PAGE_SIZE = 20;

// ── Helpers ────────────────────────────────────────────────────────────────────

function heroImage(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = ((hash * 31) | 0) + slug.charCodeAt(i);
  return HERO_IMAGES[Math.abs(hash) % HERO_IMAGES.length];
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function xmlEsc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatPhone(p: string): string {
  const d = p.replace(/\D/g, "");
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === "1") return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return p;
}

function telHref(p: string): string {
  const d = p.replace(/\D/g, "");
  return d.length >= 10 ? `tel:+1${d.slice(-10)}` : `tel:${p}`;
}

function toStateSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

function toCitySlug(city: string): string {
  return city.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function formatHour12(t: string): string {
  const [hStr, mStr = "00"] = t.split(":");
  let h = parseInt(hStr, 10);
  const ampm = h < 12 ? "AM" : "PM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${mStr} ${ampm}`;
}

// ── Haversine distance ─────────────────────────────────────────────────────────

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
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

  // Group: stateCode → citySlug → records[]
  const raw = new Map<string, Map<string, SalonRecord[]>>();
  for (const r of list) {
    if (!US_STATES.has(r.ss) || !r.c) continue;
    if (!raw.has(r.ss)) raw.set(r.ss, new Map());
    const cities = raw.get(r.ss)!;
    const slug = toCitySlug(r.c);
    if (!cities.has(slug)) cities.set(slug, []);
    cities.get(slug)!.push(r);
  }

  // Build city lookup: stateCode → citySlug → { name, records }
  const cityLookup = new Map<string, Map<string, { name: string; records: SalonRecord[] }>>();
  for (const [sc, cities] of raw) {
    const m = new Map<string, { name: string; records: SalonRecord[] }>();
    for (const [slug, recs] of cities) {
      m.set(slug, { name: recs[0].c, records: recs });
    }
    cityLookup.set(sc, m);
  }
  _cityData = cityLookup;

  // Build state index
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

function getStateIndex(): StateIndex[] {
  buildStateIndex();
  return _stateIndex!;
}

function getStateBySlug(slug: string): StateIndex | undefined {
  buildStateIndex();
  return _stateBySlug!.get(slug);
}

function getCityData(stateCode: string, citySlug: string): { name: string; records: SalonRecord[] } | undefined {
  buildStateIndex();
  return _cityData?.get(stateCode)?.get(citySlug);
}

// ── Live store matching (Task #4) ──────────────────────────────────────────────
// On the first request for a given salon slug we check whether a Certxa store
// has the same phone number.  Result (including "no match") is cached forever
// since store ownership doesn't change at high frequency.

const _storeCache = new Map<string, LiveStoreData | null>();

async function findMatchingStore(slug: string, phone: string): Promise<LiveStoreData | null> {
  if (_storeCache.has(slug)) return _storeCache.get(slug) ?? null;

  const digits = phone.replace(/\D/g, "");
  const phone10 = digits.length >= 10 ? digits.slice(-10) : "";

  if (!phone10) {
    _storeCache.set(slug, null);
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
      [phone10]
    );

    if (locRes.rows.length === 0) {
      _storeCache.set(slug, null);
      return null;
    }

    const loc = locRes.rows[0];

    const [svcRes, hoursRes] = await Promise.all([
      pool.query<{ name: string; price: string }>(
        `SELECT name, price::text FROM services
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
      })),
      hours: hoursRes.rows.map(r => ({
        day: r.day_of_week,
        open: r.open_time,
        close: r.close_time,
        closed: r.is_closed,
      })),
    };

    _storeCache.set(slug, live);
    logger.info({ slug, storeId: loc.id }, "[salonDir] matched salon to Certxa store");
    return live;
  } catch (err) {
    logger.warn({ err, slug }, "[salonDir] store lookup failed — using placeholder data");
    _storeCache.set(slug, null);
    return null;
  }
}

// ── Shared HTML fragments ──────────────────────────────────────────────────────

const FONT_PRELOAD = `
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@700&family=Inter:wght@400;500;600;700&display=swap" onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@700&family=Inter:wght@400;500;600;700&display=swap"></noscript>`;

const BASE_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-size: 16px; }
  body { font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #fff; color: #111; line-height: 1.5; }
  a { color: inherit; text-decoration: none; }
  img { display: block; max-width: 100%; }
  .site-header { background: #fff; border-bottom: 1px solid #e5e5e5; }
  .site-header-inner { max-width: 1200px; margin: 0 auto; padding: 0 20px; height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .site-logo { display: flex; align-items: center; font-family: 'Cormorant Garamond', serif; font-size: 1.55rem; font-weight: 700; color: #3B0764; letter-spacing: -.02em; }
  .site-logo-dot { color: #F59E0B; }
  .site-header-cta { display: inline-flex; align-items: center; gap: 6px; background: #111; color: #fff; border-radius: 9999px; padding: 8px 18px; font-size: 13px; font-weight: 600; white-space: nowrap; transition: background .15s; }
  .site-header-cta:hover { background: #333; }
  .breadcrumb { padding: 12px 20px; background: #fafafa; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #555; }
  .breadcrumb ol { list-style: none; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; max-width: 1200px; margin: 0 auto; }
  .breadcrumb li + li::before { content: "›"; margin-right: 4px; color: #bbb; }
  .breadcrumb a { color: #555; }
  .breadcrumb a:hover { color: #111; text-decoration: underline; }
  .breadcrumb li:last-child { color: #111; font-weight: 500; }
  .page-footer { border-top: 1px solid #e5e5e5; padding: 24px 20px; text-align: center; font-size: 13px; color: #777; }
  .page-footer a { color: #555; }
  .page-footer a:hover { text-decoration: underline; }`;

const SITE_HEADER = `
<header class="site-header">
  <div class="site-header-inner">
    <a class="site-logo" href="/nail-salons" aria-label="Certxa nail salon directory">
      Certxa<span class="site-logo-dot">.</span>
    </a>
  </div>
</header>`;

function renderStars(rating: number): string {
  const filled = Math.round(rating);
  return Array.from({ length: 5 }, (_, i) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="${i < filled ? "#f59e0b" : "#d1d5db"}" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`
  ).join("");
}

// ── Individual salon page renderer ─────────────────────────────────────────────

function renderSalonPage(salon: SalonRecord, live: LiveStoreData | null): string {
  const name      = (live?.name || salon.n || "Nail Salon");
  const city      = salon.c || "";
  const state     = salon.ss || "";
  const zip       = salon.z || "";
  const street    = salon.st || "";
  const fullAddr  = salon.a.replace(/, USA$/, "");
  const phone     = salon.p || "";
  const rating    = salon.r ? parseFloat(salon.r) : 0;
  const reviewCount = salon.rc ? parseInt(salon.rc) : 0;
  const lat       = salon.la || "";
  const lng       = salon.lo || "";
  const slug      = salon.s;
  const canonical = `${CERTXA_DOMAIN}/salon/${slug}`;
  const stateName = STATE_NAMES[state] || state;
  const img       = heroImage(slug);
  const isVerified = live !== null;
  const bookingUrl = (live?.bookingSlug)
    ? `${CERTXA_DOMAIN}/${live.bookingSlug}`
    : CERTXA_DOMAIN;

  // Services & hours: real data if available, placeholders otherwise
  const displayServices: Array<[string, string]> = (live?.services.length)
    ? live.services.map(s => [s.name, s.price] as [string, string])
    : PLACEHOLDER_SERVICES;

  const displayHours: Array<[string, string]> = (live?.hours.length)
    ? live.hours.map(h => [
        DAY_NAMES[h.day],
        h.closed ? "Closed" : `${formatHour12(h.open)} – ${formatHour12(h.close)}`,
      ] as [string, string])
    : PLACEHOLDER_HOURS;

  const pageTitle = `${name} - ${street}, ${city}, ${state} ${zip} | Nail Salon`;
  const ratingStr = rating > 0 ? ` Rated ${rating}/5 from ${reviewCount} reviews.` : "";
  const metaDesc  = `${name} is a nail salon located at ${fullAddr}. Book manicures, pedicures, gel nails, acrylic nails, and more.${ratingStr} View services and hours.`;

  // LD+JSON: LocalBusiness
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "NailSalon",
    "@id": `${canonical}#business`,
    name,
    url: canonical,
    image: img,
    address: {
      "@type": "PostalAddress",
      streetAddress: street,
      addressLocality: city,
      addressRegion: state,
      postalCode: zip,
      addressCountry: "US",
    },
    ...(phone ? { telephone: phone } : {}),
    ...(lat && lng ? { geo: { "@type": "GeoCoordinates", latitude: lat, longitude: lng } } : {}),
    ...(lat && lng ? { hasMap: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` } : {}),
    openingHoursSpecification: displayHours.map(([day, time]) => {
      if (time === "Closed") return { "@type": "OpeningHoursSpecification", dayOfWeek: day, opens: "00:00", closes: "00:00" };
      const [open, close] = time.split(" – ");
      return { "@type": "OpeningHoursSpecification", dayOfWeek: day, opens: open, closes: close };
    }),
    makesOffer: displayServices.map(([svcName]) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Service", name: svcName },
    })),
    ...(rating > 0 && reviewCount > 0
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: rating, reviewCount } }
      : {}),
    priceRange: "$$",
    currenciesAccepted: "USD",
    paymentAccepted: "Cash, Credit Card",
    ...(isVerified ? { sameAs: bookingUrl } : {}),
  };

  // LD+JSON: Breadcrumb
  const stateSlug = toStateSlug(stateName);
  const citySlug  = toCitySlug(city);
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Nail Salons", item: `${CERTXA_DOMAIN}/nail-salons` },
      { "@type": "ListItem", position: 2, name: "United States", item: `${CERTXA_DOMAIN}/nail-salons/united-states` },
      ...(state ? [{ "@type": "ListItem", position: 3, name: stateName, item: `${CERTXA_DOMAIN}/nail-salons/${stateSlug}` }] : []),
      ...(city  ? [{ "@type": "ListItem", position: state ? 4 : 3, name: city, item: `${CERTXA_DOMAIN}/nail-salons/${stateSlug}/${citySlug}` }] : []),
      { "@type": "ListItem", position: (state ? 1 : 0) + (city ? 1 : 0) + 3, name, item: canonical },
    ],
  };

  const starsHtml = rating > 0 ? renderStars(rating) : "";
  const mapSrc = lat && lng
    ? `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`
    : `https://maps.google.com/maps?q=${encodeURIComponent(fullAddr)}&z=15&output=embed`;
  const directionsUrl = lat && lng
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddr)}`;

  const breadcrumbItems = [
    { label: "Nail Salons", href: "/nail-salons" },
    { label: "United States", href: "/nail-salons/united-states" },
    ...(state ? [{ label: stateName, href: `/nail-salons/${stateSlug}` }] : []),
    ...(city  ? [{ label: city, href: `/nail-salons/${stateSlug}/${citySlug}` }] : []),
    { label: name, href: null },
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(pageTitle)}</title>
  <meta name="description" content="${esc(metaDesc)}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
  <link rel="canonical" href="${esc(canonical)}">
  ${lat && lng ? `<meta name="geo.position" content="${esc(lat)};${esc(lng)}">` : ""}
  ${state ? `<meta name="geo.region" content="US-${esc(state)}">` : ""}
  ${city ? `<meta name="geo.placename" content="${esc(city)}">` : ""}
  <meta property="og:type" content="place">
  <meta property="og:title" content="${esc(pageTitle)}">
  <meta property="og:description" content="${esc(metaDesc)}">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:image" content="${esc(img)}">
  <meta property="og:site_name" content="Certxa">
  ${lat ? `<meta property="place:location:latitude" content="${esc(lat)}">` : ""}
  ${lng ? `<meta property="place:location:longitude" content="${esc(lng)}">` : ""}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(pageTitle)}">
  <meta name="twitter:description" content="${esc(metaDesc)}">
  <meta name="twitter:image" content="${esc(img)}">
  <script type="application/ld+json">${JSON.stringify(jsonLd).replace(/<\/script/gi, "<\\/script")}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbLd).replace(/<\/script/gi, "<\\/script")}</script>
  ${FONT_PRELOAD}
  <style>
    ${BASE_CSS}
    .hero { background: #f5f5f5; }
    .hero-inner { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; min-height: 340px; }
    .hero-left { padding: 40px 40px 40px 20px; display: flex; flex-direction: column; justify-content: center; gap: 14px; }
    .hero-name { font-size: 2rem; font-weight: 700; line-height: 1.1; color: #111; }
    .hero-badge { display: inline-flex; align-items: center; gap: 6px; background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; border-radius: 9999px; padding: 4px 12px; font-size: 12px; font-weight: 600; width: fit-content; }
    .hero-rating { display: flex; align-items: center; gap: 6px; font-size: 14px; color: #444; }
    .hero-addr { font-size: 15px; color: #444; }
    .hero-addr a { color: #0055ff; font-weight: 500; margin-left: 8px; }
    .hero-addr a:hover { text-decoration: underline; }
    .hero-phone-link { color: #0055ff; font-weight: 500; font-size: 15px; }
    .hero-phone-link:hover { text-decoration: underline; }
    .hero-ctas { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 6px; }
    .btn-primary { display: inline-flex; align-items: center; gap: 8px; background: #111; color: #fff; border: 2px solid #111; border-radius: 9999px; padding: 11px 24px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background .15s; }
    .btn-primary:hover { background: #333; }
    .btn-outline { display: inline-flex; align-items: center; gap: 8px; background: #fff; color: #111; border: 2px solid #111; border-radius: 9999px; padding: 11px 24px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background .15s; }
    .btn-outline:hover { background: #f5f5f5; }
    .hero-img-wrap { overflow: hidden; }
    .hero-img-wrap img { width: 100%; height: 100%; object-fit: cover; }
    .body-wrap { max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: 1fr 340px; gap: 48px; padding: 48px 20px; }
    .section-title { font-size: 1.6rem; font-weight: 700; margin-bottom: 20px; }
    .services-list { list-style: none; }
    .services-list li { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border: 1px solid #e5e5e5; border-radius: 8px; margin-bottom: 8px; font-size: 15px; font-weight: 500; color: #111; }
    .svc-price { color: #555; font-weight: 400; white-space: nowrap; }
    .about-section { margin-top: 40px; }
    .about-section p { color: #444; font-size: 15px; line-height: 1.7; }
    .suggest-box { margin-top: 36px; background: #eef0f8; border-radius: 12px; padding: 22px 24px; }
    .suggest-box-title { font-size: 15px; font-weight: 700; color: #111; margin-bottom: 8px; }
    .suggest-box-body { font-size: 14px; color: #444; line-height: 1.6; margin-bottom: 14px; }
    .suggest-box-link { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; color: #111; }
    .suggest-box-link:hover { text-decoration: underline; }
    .claimed-box { margin-top: 36px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 20px 24px; display: flex; align-items: flex-start; gap: 12px; }
    .claimed-box svg { flex-shrink: 0; margin-top: 2px; }
    .claimed-box-title { font-size: 14px; font-weight: 700; color: #065f46; margin-bottom: 4px; }
    .claimed-box-body { font-size: 13px; color: #047857; line-height: 1.5; }
    .sidebar-map { border-radius: 12px; overflow: hidden; border: 1px solid #e5e5e5; height: 240px; }
    .sidebar-map iframe { width: 100%; height: 100%; border: 0; }
    .sidebar-address { margin-top: 12px; font-size: 14px; color: #444; line-height: 1.6; }
    .sidebar-address a { color: #0055ff; }
    .sidebar-address a:hover { text-decoration: underline; }
    .hours-section { margin-top: 32px; }
    .hours-title { font-size: 1.15rem; font-weight: 700; margin-bottom: 12px; }
    .hours-table { width: 100%; border-collapse: collapse; font-size: 14px; }
    .hours-table tr { border-bottom: 1px solid #f0f0f0; }
    .hours-table tr:last-child { border-bottom: none; }
    .hours-table td { padding: 8px 0; color: #444; }
    .hours-table td:first-child { font-weight: 500; color: #111; width: 50%; }
    .hours-closed { color: #999 !important; }
    @media (max-width: 768px) {
      .hero-inner { grid-template-columns: 1fr; }
      .hero-img-wrap { display: none; }
      .hero-left { padding: 28px 20px; }
      .hero-name { font-size: 1.5rem; }
      .body-wrap { grid-template-columns: 1fr; gap: 32px; padding: 28px 16px; }
    }
  </style>
</head>
<body>
${SITE_HEADER}
<nav class="breadcrumb" aria-label="Breadcrumb">
  <div style="max-width:1200px;margin:0 auto">
    <ol>
      ${breadcrumbItems.map((item, i) =>
        i < breadcrumbItems.length - 1
          ? `<li><span>${esc(item.label)}</span></li>`
          : `<li aria-current="page">${esc(item.label)}</li>`
      ).join("")}
    </ol>
  </div>
</nav>

<div class="hero" role="banner">
  <div class="hero-inner">
    <div class="hero-left">
      <h1 class="hero-name">${esc(name)}</h1>

      ${isVerified ? `<div class="hero-badge"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Listed on Certxa</div>` : ""}

      ${rating > 0 ? `
      <div class="hero-rating" aria-label="${rating} stars from ${reviewCount} reviews">
        <span aria-hidden="true">${starsHtml}</span>
        <span>${rating} (${reviewCount.toLocaleString()} reviews)</span>
      </div>` : ""}

      ${phone ? `<a class="hero-phone-link" href="${esc(telHref(phone))}">${esc(formatPhone(phone))}</a>` : ""}

      <p class="hero-addr">
        ${esc(fullAddr)}
        <a href="${esc(directionsUrl)}" target="_blank" rel="noopener noreferrer">Get directions</a>
      </p>

      <div class="hero-ctas">
        ${isVerified
          ? `<a class="btn-primary" href="${esc(bookingUrl)}" aria-label="Book an appointment at ${esc(name)}">
              <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Book Appointment
            </a>`
          : `${salon.w ? `<a class="btn-primary" href="${esc(salon.w)}" target="_blank" rel="noopener noreferrer" aria-label="Visit website for ${esc(name)}">
              <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              Visit Website
            </a>` : ""}
            ${phone ? `<a class="btn-${salon.w ? "outline" : "primary"}" href="${esc(telHref(phone))}" aria-label="Call ${esc(name)}">
              <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.81a16 16 0 0 0 6.29 6.29l1.6-1.6a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              Call
            </a>` : ""}`
        }
        <a class="btn-outline" href="${esc(directionsUrl)}" target="_blank" rel="noopener noreferrer">
          <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
          Get Directions
        </a>
      </div>
    </div>

    <div class="hero-img-wrap">
      <img
        src="${esc(img)}"
        alt="Nail salon services at ${esc(name)} in ${esc(city)}, ${esc(state)}"
        fetchpriority="high"
        width="600"
        height="400"
      >
    </div>
  </div>
</div>

<div class="body-wrap">
  <main>
    <section aria-labelledby="services-heading">
      <h2 class="section-title" id="services-heading">Services</h2>
      <ul class="services-list">
        ${displayServices.map(([svcName]) =>
          `<li><span>${esc(svcName)}</span></li>`
        ).join("")}
      </ul>
    </section>

    <section class="about-section" aria-labelledby="about-heading">
      <h2 class="section-title" id="about-heading">About ${esc(name)}</h2>
      <p>${esc(name)} is a nail salon located at ${esc(fullAddr)}.
      We offer a full range of nail services including manicures, pedicures, gel nails, acrylic nails,
      dip powder nails, nail art, and more. Our experienced nail technicians are committed to providing
      high-quality nail care in a clean and relaxing environment.
      ${city ? `Conveniently located in ${esc(city)}${state ? `, ${esc(state)}` : ""}, we welcome walk-ins and appointments.` : ""}
      Book your appointment online or call us today.</p>
    </section>

    ${isVerified
      ? `<div class="claimed-box" role="note">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#065f46" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <div>
            <p class="claimed-box-title">This business is on Certxa</p>
            <p class="claimed-box-body">The owner of ${esc(name)} manages their listing, services, and bookings through Certxa. Information shown is up to date.</p>
          </div>
        </div>`
      : `<div class="suggest-box" role="note">
          <p class="suggest-box-title">Suggest an update</p>
          <p class="suggest-box-body">This page uses publicly available information to help people discover this venue. The business is not currently affiliated with or partnered with Certxa — get in touch with us to update the information or claim this listing.</p>
          <a class="suggest-box-link" href="${esc(CERTXA_DOMAIN)}/contact">
            Get in touch
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </a>
        </div>`
    }
  </main>

  <aside class="sidebar" aria-label="Location and hours">
    <div class="sidebar-map">
      <iframe
        title="Map to ${esc(name)}"
        src="${esc(mapSrc)}"
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
        aria-label="Google map showing ${esc(name)} location"
      ></iframe>
    </div>

    <address class="sidebar-address" itemscope itemtype="https://schema.org/PostalAddress">
      <span itemprop="streetAddress">${esc(street)}</span><br>
      <span itemprop="addressLocality">${esc(city)}</span>${state ? `, <span itemprop="addressRegion">${esc(state)}</span>` : ""} <span itemprop="postalCode">${esc(zip)}</span><br>
      <a href="${esc(directionsUrl)}" target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
    </address>

    <section class="hours-section" aria-labelledby="hours-heading">
      <h2 class="hours-title" id="hours-heading">Opening times</h2>
      <table class="hours-table">
        <tbody>
          ${displayHours.map(([day, time]) =>
            `<tr><td>${esc(day)}</td><td${time === "Closed" ? ' class="hours-closed"' : ""}>${esc(time)}</td></tr>`
          ).join("")}
        </tbody>
      </table>
    </section>
  </aside>
</div>

<footer class="page-footer">
  <p>
    <a href="https://certxa.com">certxa.com</a> &nbsp;·&nbsp;
    Nail salon directory &nbsp;·&nbsp;
    <a href="/nail-salons">Browse all nail salons</a>
  </p>
</footer>

</body>
</html>`;
}

// ── National directory page — Google Maps-style interactive finder ─────────────

function renderNationalPage(): string {
  let totalCount = 0;
  try { totalCount = getSalonList().length; } catch { /* not loaded yet */ }

  const canonical = `${CERTXA_DOMAIN}/nail-salons`;
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ "@type": "ListItem", position: 1, name: "Nail Salons", item: canonical }],
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nail Salons Near Me — Find &amp; Book | Certxa</title>
  <meta name="description" content="Find nail salons near you. Browse ${totalCount.toLocaleString()} nail salons across the United States. Share your location for instant nearby results.">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${esc(canonical)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="Nail Salons Near Me | Certxa">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:site_name" content="Certxa">
  <script type="application/ld+json">${JSON.stringify(breadcrumbLd).replace(/<\/script/gi, "<\\/script")}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@700&family=Inter:wght@400;500;600;700&display=swap">
  <link rel="stylesheet" href="/lib/leaflet.css">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; overflow: hidden; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f5f5; color: #111; }

    /* ── Header ── */
    #hdr {
      position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
      height: 60px; background: #fff; border-bottom: 1px solid #e8e8e8;
      display: flex; align-items: center; gap: 12px; padding: 0 16px;
      box-shadow: 0 1px 4px rgba(0,0,0,.08);
    }
    #logo {
      display: flex; align-items: center; font-family: 'Cormorant Garamond', serif;
      font-size: 1.55rem; font-weight: 700; color: #3B0764; letter-spacing: -.02em;
      white-space: nowrap; text-decoration: none; flex-shrink: 0;
    }
    #logo span { color: #F59E0B; }
    #search-wrap {
      flex: 1; max-width: 440px; position: relative;
    }
    #search-input {
      width: 100%; height: 40px; padding: 0 40px 0 40px;
      border: 1.5px solid #e0e0e0; border-radius: 999px;
      font-size: 14px; font-family: inherit; color: #111;
      background: #f8f8f8; outline: none; transition: border-color .15s, background .15s;
    }
    #search-input:focus { border-color: #6366f1; background: #fff; }
    #search-icon {
      position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
      color: #999; pointer-events: none;
    }
    #search-btn {
      position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
      background: #6366f1; color: #fff; border: none; border-radius: 999px;
      height: 28px; padding: 0 12px; font-size: 12px; font-weight: 600;
      cursor: pointer; font-family: inherit; white-space: nowrap;
      transition: background .15s;
    }
    #search-btn:hover { background: #4f46e5; }
    #locate-btn {
      display: flex; align-items: center; gap: 6px;
      background: none; border: 1.5px solid #e0e0e0; border-radius: 999px;
      height: 40px; padding: 0 14px; font-size: 13px; font-weight: 500;
      cursor: pointer; font-family: inherit; color: #333; white-space: nowrap;
      transition: border-color .15s, color .15s; flex-shrink: 0;
    }
    #locate-btn:hover { border-color: #6366f1; color: #6366f1; }

    /* ── App body ── */
    #app-body {
      position: fixed; top: 60px; left: 0; right: 0; bottom: 0;
      display: flex;
    }

    /* ── Sidebar ── */
    #sidebar {
      width: 380px; background: #fff; overflow-y: auto;
      border-right: 1px solid #e8e8e8; flex-shrink: 0;
      display: flex; flex-direction: column;
    }
    #sidebar-status {
      padding: 16px 16px 0; flex-shrink: 0;
    }
    #status-msg {
      display: flex; align-items: center; gap: 10px;
      background: #f0f0ff; border: 1px solid #c7d2fe;
      border-radius: 10px; padding: 12px 14px;
      font-size: 13.5px; color: #3730a3; font-weight: 500;
    }
    #status-msg.success { background: #f0fdf4; border-color: #bbf7d0; color: #14532d; }
    #status-msg.error   { background: #fff7ed; border-color: #fed7aa; color: #7c2d12; }
    #salon-count {
      padding: 10px 16px 4px; font-size: 12px; font-weight: 600;
      color: #999; text-transform: uppercase; letter-spacing: .06em;
    }
    #salon-list { flex: 1; padding: 6px 8px 80px; }

    /* ── Salon card ── */
    .sc {
      padding: 14px 12px; border-radius: 10px; cursor: pointer;
      transition: background .12s; border: 1.5px solid transparent; margin-bottom: 4px;
    }
    .sc:hover { background: #f8f8f8; }
    .sc.active { background: #f0f0ff; border-color: #c7d2fe; }
    .sc-row1 { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
    .sc-name { font-size: 14.5px; font-weight: 700; color: #111; line-height: 1.3; }
    .sc-dist { font-size: 12px; font-weight: 600; color: #6366f1; white-space: nowrap; margin-top: 2px; flex-shrink: 0; }
    .sc-stars { display: flex; align-items: center; gap: 4px; margin-bottom: 3px; }
    .sc-star { font-size: 13px; }
    .sc-rcount { font-size: 12px; color: #888; }
    .sc-addr { font-size: 12.5px; color: #666; margin-bottom: 6px; line-height: 1.45; }
    .sc-phone { font-size: 12.5px; color: #6366f1; font-weight: 500; text-decoration: none; }
    .sc-phone:hover { text-decoration: underline; }
    .sc-actions { display: flex; gap: 6px; margin-top: 8px; }
    .sc-btn {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 5px 12px; border-radius: 999px; font-size: 12px;
      font-weight: 600; cursor: pointer; text-decoration: none; font-family: inherit;
      border: 1.5px solid #e0e0e0; background: #fff; color: #333;
      transition: border-color .12s, color .12s;
    }
    .sc-btn:hover { border-color: #6366f1; color: #6366f1; }
    .sc-btn.primary { background: #6366f1; border-color: #6366f1; color: #fff; }
    .sc-btn.primary:hover { background: #4f46e5; border-color: #4f46e5; }
    .sc-divider { border: none; border-top: 1px solid #f0f0f0; margin: 0 0 4px; }

    /* ── Browse by state (collapsed) ── */
    #browse-section {
      padding: 12px 12px 20px; border-top: 1px solid #f0f0f0; flex-shrink: 0;
    }
    #browse-toggle {
      background: none; border: none; cursor: pointer; font-family: inherit;
      font-size: 12px; font-weight: 600; color: #888; display: flex;
      align-items: center; gap: 6px; padding: 4px 0; width: 100%;
    }
    #browse-toggle:hover { color: #555; }
    #states-grid {
      display: none; margin-top: 10px;
      display: grid; grid-template-columns: 1fr 1fr; gap: 5px;
    }
    #states-grid.collapsed { display: none; }
    .ssg-link {
      padding: 8px 10px; border-radius: 8px; border: 1px solid #e8e8e8;
      font-size: 12px; font-weight: 500; color: #333; text-decoration: none;
      transition: border-color .12s; display: flex; justify-content: space-between;
    }
    .ssg-link:hover { border-color: #c7d2fe; color: #4f46e5; }
    .ssg-cnt { color: #aaa; font-size: 11px; }

    /* ── Location permission splash ── */
    #location-splash {
      position: absolute; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(255,255,255,.97); z-index: 500;
      display: flex; align-items: center; justify-content: center;
      flex-direction: column; gap: 0; padding: 24px;
    }
    #location-splash.hidden { display: none; }
    .splash-icon {
      width: 72px; height: 72px; background: #f0f0ff; border-radius: 50%;
      display: flex; align-items: center; justify-content: center; margin-bottom: 20px;
    }
    .splash-title { font-size: 1.4rem; font-weight: 700; color: #111; margin-bottom: 8px; text-align: center; }
    .splash-sub { font-size: 14px; color: #666; text-align: center; max-width: 300px; line-height: 1.6; margin-bottom: 24px; }
    .splash-allow {
      display: flex; align-items: center; gap: 8px; background: #6366f1; color: #fff;
      border: none; border-radius: 999px; padding: 13px 28px; font-size: 15px;
      font-weight: 600; cursor: pointer; font-family: inherit; margin-bottom: 12px;
      transition: background .15s;
    }
    .splash-allow:hover { background: #4f46e5; }
    .splash-skip {
      background: none; border: none; color: #999; font-size: 13px;
      cursor: pointer; font-family: inherit; text-decoration: underline;
    }

    /* ── Map ── */
    #map { flex: 1; }
    .leaflet-popup-content-wrapper { border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,.12); }
    .leaflet-popup-content { margin: 10px 14px; }
    .lp-name { font-weight: 700; font-size: 13.5px; color: #111; margin-bottom: 3px; }
    .lp-addr { font-size: 12px; color: #666; margin-bottom: 6px; line-height: 1.4; }
    .lp-row  { display: flex; gap: 8px; align-items: center; }
    .lp-link {
      display: inline-flex; align-items: center; gap: 4px; padding: 5px 11px;
      border-radius: 999px; font-size: 12px; font-weight: 600; text-decoration: none;
      background: #6366f1; color: #fff;
    }
    .lp-dir  {
      display: inline-flex; align-items: center; gap: 4px; padding: 5px 11px;
      border-radius: 999px; font-size: 12px; font-weight: 600; text-decoration: none;
      border: 1.5px solid #e0e0e0; color: #333;
    }

    /* ── Mobile ── */
    #mob-tab-bar {
      display: none; position: fixed; bottom: 0; left: 0; right: 0; z-index: 900;
      background: #fff; border-top: 1px solid #e8e8e8;
      height: 52px;
    }
    #mob-tab-bar button {
      flex: 1; height: 100%; border: none; background: none; font-family: inherit;
      font-size: 13px; font-weight: 600; color: #888; cursor: pointer; display: flex;
      align-items: center; justify-content: center; gap: 6px;
    }
    #mob-tab-bar button.active { color: #6366f1; }

    @media (max-width: 767px) {
      #sidebar { width: 100%; border-right: none; display: none; }
      #sidebar.mob-visible { display: flex; position: fixed; top: 60px; left: 0; right: 0; bottom: 52px; z-index: 600; }
      #map { position: fixed; top: 60px; left: 0; right: 0; bottom: 52px; }
      #map.mob-hidden { display: none; }
      #mob-tab-bar { display: flex; }
      #app-body { position: fixed; top: 60px; left: 0; right: 0; bottom: 52px; }
      #locate-btn .locate-label, #book-cta { display: none; }
    }
    @media (max-width: 480px) {
      #hdr { padding: 0 10px; gap: 8px; }
      #search-wrap { max-width: none; }
    }

    /* ── Spinner ── */
    .spin {
      width: 16px; height: 16px; border: 2px solid currentColor;
      border-top-color: transparent; border-radius: 50%; animation: spin .6s linear infinite; flex-shrink: 0;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>

<!-- ── Header ─────────────────────────────────────────────────── -->
<header id="hdr">
  <a id="logo" href="/nail-salons" aria-label="Certxa nail salon directory">Certxa<span>.</span></a>
  <div id="search-wrap">
    <svg id="search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <input id="search-input" type="text" placeholder="Search city, state or zip…" autocomplete="off" aria-label="Search for a city, state or zip code">
    <button id="search-btn" aria-label="Search">Search</button>
  </div>
  <button id="locate-btn" title="Use my location" aria-label="Use my location">
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
    <span class="locate-label">Near me</span>
  </button>
</header>

<!-- ── App body ───────────────────────────────────────────────── -->
<div id="app-body">

  <!-- Sidebar -->
  <div id="sidebar">
    <!-- Location permission splash (shown inside sidebar on desktop) -->
    <div id="location-splash">
      <div class="splash-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
      </div>
      <p class="splash-title">Find nail salons near you</p>
      <p class="splash-sub">Share your location to instantly discover nail salons within a few miles.</p>
      <button class="splash-allow" id="allow-location-btn">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
        Use my location
      </button>
      <button class="splash-skip" id="skip-location-btn">Search manually instead</button>
    </div>

    <div id="sidebar-status" style="display:none">
      <div id="status-msg"><div class="spin"></div> <span id="status-text">Finding salons near you…</span></div>
    </div>
    <div id="salon-count" style="display:none"></div>
    <div id="salon-list"></div>

    <!-- Browse by state -->
    <div id="browse-section">
      <button id="browse-toggle" aria-expanded="true" aria-controls="states-grid">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
        Browse by state
      </button>
      <div id="states-grid" class="collapsed"></div>
    </div>
  </div>

  <!-- Map -->
  <div id="map" role="region" aria-label="Salon map"></div>
</div>

<!-- Mobile tab bar -->
<nav id="mob-tab-bar" role="navigation" aria-label="View switcher">
  <button id="tab-list" class="active" aria-pressed="true">
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
    List
  </button>
  <button id="tab-map" aria-pressed="false">
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
    Map
  </button>
</nav>

<!-- Radius control -->
<script src="/lib/leaflet.js"></script>
<script>
(function () {
  'use strict';

  /* ── State ── */
  var map, userMarker, currentLat, currentLng, markers = [], currentRadius = 2;

  /* ── Map init ── */
  map = L.map('map', { zoomControl: true }).setView([39.5, -98.35], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  /* ── Custom marker icons ── */
  function makePinIcon(color, size) {
    var s = size || 32;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s + '" viewBox="0 0 32 40">'
      + '<path d="M16 0C9.4 0 4 5.4 4 12c0 9 12 28 12 28S28 21 28 12C28 5.4 22.6 0 16 0z" fill="' + color + '"/>'
      + '<circle cx="16" cy="12" r="5" fill="#fff" opacity=".9"/>'
      + '</svg>';
    return L.divIcon({
      html: svg,
      iconSize: [s, s * 1.25],
      iconAnchor: [s / 2, s * 1.25],
      popupAnchor: [0, -(s * 1.25)],
      className: '',
    });
  }

  var pinIcon     = makePinIcon('#6366f1', 28);
  var pinIconHot  = makePinIcon('#e11d48', 34);
  var userIcon    = makePinIcon('#0ea5e9', 28);

  /* ── Helpers ── */
  function stars(r) {
    var full = Math.round(parseFloat(r) || 0);
    var html = '';
    for (var i = 0; i < 5; i++) {
      html += '<span class="sc-star" aria-hidden="true">' + (i < full ? '★' : '☆') + '</span>';
    }
    return html;
  }

  function fmtPhone(p) {
    var d = p.replace(/\D/g, '');
    if (d.length === 10) return '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6);
    if (d.length === 11 && d[0] === '1') return '(' + d.slice(1,4) + ') ' + d.slice(4,7) + '-' + d.slice(7);
    return p;
  }

  function safeTxt(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function setStatus(msg, type) {
    var el = document.getElementById('status-msg');
    var wrap = document.getElementById('sidebar-status');
    wrap.style.display = 'block';
    el.className = type || '';
    if (type === 'success') {
      el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> <span>' + safeTxt(msg) + '</span>';
    } else if (type === 'error') {
      el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> <span>' + safeTxt(msg) + '</span>';
    } else {
      el.innerHTML = '<div class="spin"></div> <span>' + safeTxt(msg) + '</span>';
    }
  }

  function hideSplash() {
    var s = document.getElementById('location-splash');
    s.classList.add('hidden');
    document.getElementById('sidebar-status').style.display = 'block';
  }

  /* ── Clear existing markers ── */
  function clearMarkers() {
    for (var i = 0; i < markers.length; i++) map.removeLayer(markers[i]);
    markers = [];
  }

  /* ── Render results ── */
  function renderResults(salons, label) {
    clearMarkers();
    var list = document.getElementById('salon-list');
    var countEl = document.getElementById('salon-count');
    list.innerHTML = '';

    if (!salons.length) {
      setStatus('No salons found nearby.', 'error');
      countEl.style.display = 'none';
      return;
    }

    setStatus(label || (salons.length + ' salon' + (salons.length !== 1 ? 's' : '') + ' found'), 'success');
    countEl.style.display = 'block';
    countEl.textContent = salons.length + ' result' + (salons.length !== 1 ? 's' : '');

    var bounds = [];
    if (currentLat && currentLng) bounds.push([currentLat, currentLng]);

    for (var i = 0; i < salons.length; i++) {
      (function (s, idx) {
        var lat = parseFloat(s.la), lng = parseFloat(s.lo);
        var hasCoords = !isNaN(lat) && !isNaN(lng);

        /* card */
        var card = document.createElement('div');
        card.className = 'sc';
        card.setAttribute('data-idx', idx);
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', s.n);

        var rVal = parseFloat(s.r) || 0;
        var rHtml = rVal > 0
          ? ('<div class="sc-stars">' + stars(s.r) + '<span class="sc-rcount">(' + parseInt(s.rc || '0').toLocaleString() + ')</span></div>')
          : '';

        var distHtml = (typeof s.dist === 'number') ? ('<span class="sc-dist">' + s.dist + ' mi</span>') : '';
        var phoneHtml = s.p ? ('<a class="sc-phone" href="tel:+1' + s.p.replace(/\D/g,'').slice(-10) + '">' + safeTxt(fmtPhone(s.p)) + '</a>') : '';

        var dirUrl = hasCoords
          ? 'https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng
          : 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(s.a || s.n);

        card.innerHTML = ''
          + '<div class="sc-row1"><span class="sc-name">' + safeTxt(s.n) + '</span>' + distHtml + '</div>'
          + rHtml
          + '<div class="sc-addr">' + safeTxt((s.st ? s.st + ', ' : '') + s.c + ', ' + s.ss + ' ' + s.z) + '</div>'
          + phoneHtml
          + '<div class="sc-actions">'
          + '  <a class="sc-btn primary" href="/salon/' + safeTxt(s.s) + '">View</a>'
          + '  <a class="sc-btn" href="' + safeTxt(dirUrl) + '" target="_blank" rel="noopener noreferrer">Directions</a>'
          + '</div>';

        /* marker */
        var marker = null;
        if (hasCoords) {
          bounds.push([lat, lng]);
          marker = L.marker([lat, lng], { icon: pinIcon, title: s.n }).addTo(map);
          marker.bindPopup(
            '<div class="lp-name">' + safeTxt(s.n) + '</div>'
            + '<div class="lp-addr">' + safeTxt(s.a ? s.a.replace(/, USA$/, '') : '') + '</div>'
            + '<div class="lp-row">'
            + '  <a class="lp-link" href="/salon/' + safeTxt(s.s) + '">View</a>'
            + '  <a class="lp-dir" href="' + safeTxt(dirUrl) + '" target="_blank" rel="noopener noreferrer">Directions</a>'
            + '</div>',
            { maxWidth: 220 }
          );

          marker.on('click', function () {
            var cards = document.querySelectorAll('.sc');
            for (var j = 0; j < cards.length; j++) cards[j].classList.remove('active');
            card.classList.add('active');
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          });

          markers.push(marker);
        }

        card.addEventListener('click', function () {
          var cards = document.querySelectorAll('.sc');
          for (var j = 0; j < cards.length; j++) cards[j].classList.remove('active');
          card.classList.add('active');
          if (marker) {
            map.setView([lat, lng], 15, { animate: true });
            marker.openPopup();
            /* swap icon briefly */
            marker.setIcon(pinIconHot);
            setTimeout(function () { if (marker) marker.setIcon(pinIcon); }, 1200);
          }
          /* mobile: switch to map */
          if (window.innerWidth < 768) showTab('map');
        });

        card.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') card.click();
        });

        /* divider */
        if (idx > 0) {
          var hr = document.createElement('hr');
          hr.className = 'sc-divider';
          list.appendChild(hr);
        }
        list.appendChild(card);
      })(salons[i], i);
    }

    /* fit map */
    if (bounds.length > 1) {
      try { map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 }); } catch (e) { /* ignore */ }
    } else if (currentLat && currentLng) {
      map.setView([currentLat, currentLng], 13);
    }

  }

  /* ── Fetch nearby ── */
  function fetchNearby(lat, lng, radius) {
    var r = radius || currentRadius;
    setStatus('Searching nearby…');
    fetch('/nail-salons/nearby.json?lat=' + lat + '&lng=' + lng + '&radius=' + r + '&limit=10')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        renderResults(data, 'Showing ' + data.length + ' nearby salon' + (data.length !== 1 ? 's' : ''));
      })
      .catch(function () {
        setStatus('Could not load salons. Please try again.', 'error');
      });
  }

  /* ── Geocode search via Nominatim ── */
  function geocodeAndFetch(query) {
    if (!query.trim()) return;
    setStatus('Searching for "' + query + '"…');
    hideSplash();
    var url = 'https://nominatim.openstreetmap.org/search?format=json&q='
      + encodeURIComponent(query + ', USA') + '&countrycodes=us&limit=1&addressdetails=0';
    fetch(url, { headers: { 'Accept-Language': 'en' } })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.length) {
          setStatus('Location not found. Try a different search.', 'error');
          return;
        }
        currentLat = parseFloat(data[0].lat);
        currentLng = parseFloat(data[0].lon);
        placeUserMarker(currentLat, currentLng);
        fetchNearby(currentLat, currentLng);
      })
      .catch(function () { setStatus('Search failed. Please try again.', 'error'); });
  }

  /* ── User marker ── */
  function placeUserMarker(lat, lng) {
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker([lat, lng], {
      icon: userIcon, title: 'Your location', zIndexOffset: 1000,
    }).addTo(map);
    userMarker.bindPopup('<b>Your location</b>');
  }

  /* ── Geolocation ── */
  function requestLocation() {
    if (!navigator.geolocation) {
      setStatus('Geolocation not supported. Use the search box above.', 'error');
      return;
    }
    setStatus('Getting your location…');
    hideSplash();
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        currentLat = pos.coords.latitude;
        currentLng = pos.coords.longitude;
        placeUserMarker(currentLat, currentLng);
        fetchNearby(currentLat, currentLng);
      },
      function () {
        setStatus('Location access denied. Use the search box to find salons.', 'error');
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  }

  /* ── Mobile tab switcher ── */
  function showTab(tab) {
    var sidebar = document.getElementById('sidebar');
    var mapEl   = document.getElementById('map');
    var btnList = document.getElementById('tab-list');
    var btnMap  = document.getElementById('tab-map');
    if (tab === 'list') {
      sidebar.classList.add('mob-visible');
      mapEl.classList.add('mob-hidden');
      btnList.classList.add('active'); btnList.setAttribute('aria-pressed', 'true');
      btnMap.classList.remove('active'); btnMap.setAttribute('aria-pressed', 'false');
    } else {
      sidebar.classList.remove('mob-visible');
      mapEl.classList.remove('mob-hidden');
      btnMap.classList.add('active'); btnMap.setAttribute('aria-pressed', 'true');
      btnList.classList.remove('active'); btnList.setAttribute('aria-pressed', 'false');
      setTimeout(function () { map.invalidateSize(); }, 50);
    }
  }

  /* ── Populate state grid ── */
  var STATE_LIST = [
    ['Alabama','alabama'],['Alaska','alaska'],['Arizona','arizona'],['Arkansas','arkansas'],
    ['California','california'],['Colorado','colorado'],['Connecticut','connecticut'],['Delaware','delaware'],
    ['Florida','florida'],['Georgia','georgia'],['Hawaii','hawaii'],['Idaho','idaho'],
    ['Illinois','illinois'],['Indiana','indiana'],['Iowa','iowa'],['Kansas','kansas'],
    ['Kentucky','kentucky'],['Louisiana','louisiana'],['Maine','maine'],['Maryland','maryland'],
    ['Massachusetts','massachusetts'],['Michigan','michigan'],['Minnesota','minnesota'],['Mississippi','mississippi'],
    ['Missouri','missouri'],['Montana','montana'],['Nebraska','nebraska'],['Nevada','nevada'],
    ['New Hampshire','new-hampshire'],['New Jersey','new-jersey'],['New Mexico','new-mexico'],['New York','new-york'],
    ['North Carolina','north-carolina'],['North Dakota','north-dakota'],['Ohio','ohio'],['Oklahoma','oklahoma'],
    ['Oregon','oregon'],['Pennsylvania','pennsylvania'],['Rhode Island','rhode-island'],['South Carolina','south-carolina'],
    ['South Dakota','south-dakota'],['Tennessee','tennessee'],['Texas','texas'],['Utah','utah'],
    ['Vermont','vermont'],['Virginia','virginia'],['Washington','washington'],['West Virginia','west-virginia'],
    ['Wisconsin','wisconsin'],['Wyoming','wyoming'],['Washington DC','washington-dc']
  ];
  var grid = document.getElementById('states-grid');
  STATE_LIST.forEach(function (pair) {
    var a = document.createElement('a');
    a.className = 'ssg-link';
    a.href = '/nail-salons/' + pair[1];
    a.innerHTML = '<span>' + safeTxt(pair[0]) + '</span>';
    grid.appendChild(a);
  });

  var browseOpen = false;
  document.getElementById('browse-toggle').addEventListener('click', function () {
    browseOpen = !browseOpen;
    grid.classList.toggle('collapsed', !browseOpen);
    this.setAttribute('aria-expanded', browseOpen ? 'true' : 'false');
    var icon = browseOpen
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    this.innerHTML = icon + ' Browse by state';
  });

  /* ── Event listeners ── */
  document.getElementById('allow-location-btn').addEventListener('click', requestLocation);
  document.getElementById('locate-btn').addEventListener('click', requestLocation);

  document.getElementById('skip-location-btn').addEventListener('click', function () {
    hideSplash();
    setStatus('Enter a city, state or zip above to find nearby salons.', 'error');
  });

  document.getElementById('search-btn').addEventListener('click', function () {
    geocodeAndFetch(document.getElementById('search-input').value);
  });

  document.getElementById('search-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') geocodeAndFetch(this.value);
  });

  document.getElementById('tab-list').addEventListener('click', function () { showTab('list'); });
  document.getElementById('tab-map').addEventListener('click', function () { showTab('map'); });

  /* ── Mobile: default to list view ── */
  if (window.innerWidth < 768) showTab('list');

  /* ── Invalidate map size on resize ── */
  window.addEventListener('resize', function () { map.invalidateSize(); });

})();
</script>
</body>
</html>`;
}

// ── State directory page ───────────────────────────────────────────────────────

function renderStatePage(state: StateIndex): string {
  const canonical = `${CERTXA_DOMAIN}/nail-salons/${state.slug}`;

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Nail Salons", item: `${CERTXA_DOMAIN}/nail-salons` },
      { "@type": "ListItem", position: 2, name: `Nail Salons in ${state.name}`, item: canonical },
    ],
  };

  const topCities = state.cities.slice(0, 150);
  const cityLinks = topCities.map(c =>
    `<a class="city-card" href="/nail-salons/${esc(state.slug)}/${esc(c.slug)}">
      <span class="cc-name">${esc(c.name)}</span>
      <span class="cc-count">${c.count.toLocaleString()} salon${c.count !== 1 ? "s" : ""}</span>
    </a>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nail Salons in ${esc(state.name)} — Book Manicures &amp; Pedicures | Certxa</title>
  <meta name="description" content="Find ${state.count.toLocaleString()} nail salons across ${esc(state.name)}. Browse by city and book manicures, pedicures, gel nails, and more.">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${esc(canonical)}">
  <meta name="geo.region" content="US-${esc(state.code)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="Nail Salons in ${esc(state.name)} | Certxa">
  <meta property="og:url" content="${esc(canonical)}">
  <script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>
  ${FONT_PRELOAD}
  <style>
    ${BASE_CSS}
    .dir-hero { max-width: 1200px; margin: 0 auto; padding: 56px 20px 36px; }
    .dir-hero h1 { font-size: 2.2rem; font-weight: 700; color: #111; margin-bottom: 10px; }
    .dir-hero p { color: #555; font-size: 16px; }
    .section-label { max-width: 1200px; margin: 0 auto; padding: 0 20px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; color: #aaa; }
    .cities-grid { max-width: 1200px; margin: 0 auto; padding: 0 20px 80px; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
    .city-card { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 14px 18px; border: 1px solid #e5e5e5; border-radius: 10px; transition: border-color .15s, box-shadow .15s; }
    .city-card:hover { border-color: #ccc; box-shadow: 0 2px 10px rgba(0,0,0,.07); }
    .cc-name { font-weight: 600; font-size: 14px; color: #111; }
    .cc-count { font-size: 12px; color: #888; white-space: nowrap; }
    @media (max-width: 600px) { .cities-grid { grid-template-columns: 1fr 1fr; } .dir-hero h1 { font-size: 1.6rem; } }
  </style>
</head>
<body>
${SITE_HEADER}
<nav class="breadcrumb" aria-label="Breadcrumb">
  <ol>
    <li><a href="/nail-salons">Nail Salons</a></li>
    <li aria-current="page">Nail Salons in ${esc(state.name)}</li>
  </ol>
</nav>
<div class="dir-hero">
  <h1>Nail Salons in ${esc(state.name)}</h1>
  <p>${state.count.toLocaleString()} nail salons across ${topCities.length} cities in ${esc(state.name)}.</p>
</div>
<p class="section-label">Cities in ${esc(state.name)}</p>
<div class="cities-grid">${cityLinks}</div>
<footer class="page-footer">
  <p><a href="${esc(CERTXA_DOMAIN)}">certxa.com</a> &nbsp;·&nbsp; <a href="/nail-salons">Browse all states</a></p>
</footer>
</body>
</html>`;
}

// ── City directory page ────────────────────────────────────────────────────────

function renderCityPage(
  state: StateIndex,
  cityName: string,
  citySlug: string,
  records: SalonRecord[],
  page: number
): string {
  const totalPages = Math.ceil(records.length / CITY_PAGE_SIZE);
  const pg = Math.max(1, Math.min(page, totalPages || 1));
  const slice = records.slice((pg - 1) * CITY_PAGE_SIZE, pg * CITY_PAGE_SIZE);
  const canonical = `${CERTXA_DOMAIN}/nail-salons/${state.slug}/${citySlug}`;
  const pageParam = pg > 1 ? `?page=${pg}` : "";
  const pageSuffix = pg > 1 ? ` — Page ${pg}` : "";

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Nail Salons", item: `${CERTXA_DOMAIN}/nail-salons` },
      { "@type": "ListItem", position: 2, name: state.name, item: `${CERTXA_DOMAIN}/nail-salons/${state.slug}` },
      { "@type": "ListItem", position: 3, name: `Nail Salons in ${cityName}`, item: canonical },
    ],
  };

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Nail Salons in ${cityName}, ${state.name}`,
    numberOfItems: records.length,
    itemListElement: slice.map((r, i) => ({
      "@type": "ListItem",
      position: (pg - 1) * CITY_PAGE_SIZE + i + 1,
      url: `${CERTXA_DOMAIN}/salon/${r.s}`,
      name: r.n || "Nail Salon",
    })),
  };

  const salonCards = slice.map(r => {
    const rt = r.r ? parseFloat(r.r) : 0;
    const rc = r.rc ? parseInt(r.rc) : 0;
    return `
    <a class="salon-card" href="/salon/${esc(r.s)}">
      <div class="sc-body">
        <h2 class="sc-name">${esc(r.n || "Nail Salon")}</h2>
        ${rt > 0 ? `<div class="sc-rating">${renderStars(rt)}<span>${rt} (${rc.toLocaleString()})</span></div>` : ""}
        <p class="sc-addr">${esc(r.st || r.a.split(",")[0] || "")}</p>
      </div>
      <span class="sc-cta" aria-hidden="true">View →</span>
    </a>`;
  }).join("");

  // Smart pagination: always show first/last, ellipsis around gaps
  let paginationHtml = "";
  if (totalPages > 1) {
    const shown = new Set<number>();
    for (let p = 1; p <= totalPages; p++) {
      if (p <= 2 || p >= totalPages - 1 || Math.abs(p - pg) <= 1) shown.add(p);
    }
    const sortedPages = [...shown].sort((a, b) => a - b);
    const parts: string[] = [];
    let prev = 0;
    for (const p of sortedPages) {
      if (prev && p - prev > 1) parts.push(`<span class="pg-ellipsis">…</span>`);
      const href = p === 1 ? `/nail-salons/${state.slug}/${citySlug}` : `/nail-salons/${state.slug}/${citySlug}?page=${p}`;
      parts.push(p === pg
        ? `<span class="pg-cur">${p}</span>`
        : `<a class="pg-link" href="${esc(href)}">${p}</a>`);
      prev = p;
    }
    paginationHtml = `<nav class="pagination" aria-label="Pages">${parts.join("")}</nav>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nail Salons in ${esc(cityName)}, ${esc(state.code)}${esc(pageSuffix)} | Certxa</title>
  <meta name="description" content="${records.length} nail salons in ${esc(cityName)}, ${esc(state.name)}. Book manicures, pedicures, gel nails, and more.${pg > 1 ? ` Page ${pg}.` : ""}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${esc(canonical + pageParam)}">
  ${pg > 1 ? `<link rel="prev" href="${esc(canonical + (pg > 2 ? `?page=${pg - 1}` : ""))}">` : ""}
  ${pg < totalPages ? `<link rel="next" href="${esc(canonical + `?page=${pg + 1}`)}">` : ""}
  <meta name="geo.region" content="US-${esc(state.code)}">
  <meta name="geo.placename" content="${esc(cityName)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="Nail Salons in ${esc(cityName)}, ${esc(state.code)} | Certxa">
  <meta property="og:url" content="${esc(canonical)}">
  <script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>
  <script type="application/ld+json">${JSON.stringify(itemListLd)}</script>
  ${FONT_PRELOAD}
  <style>
    ${BASE_CSS}
    .dir-hero { max-width: 1200px; margin: 0 auto; padding: 56px 20px 36px; }
    .dir-hero h1 { font-size: 2.2rem; font-weight: 700; color: #111; margin-bottom: 10px; }
    .dir-hero p { color: #555; font-size: 16px; }
    .salons-list { max-width: 1200px; margin: 0 auto; padding: 0 20px; display: flex; flex-direction: column; gap: 8px; }
    .salon-card { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border: 1px solid #e5e5e5; border-radius: 10px; transition: border-color .15s, box-shadow .15s; color: #111; }
    .salon-card:hover { border-color: #ccc; box-shadow: 0 2px 10px rgba(0,0,0,.07); }
    .sc-name { font-weight: 600; font-size: 15px; margin-bottom: 4px; }
    .sc-rating { display: flex; align-items: center; gap: 4px; font-size: 13px; color: #555; margin-bottom: 4px; }
    .sc-addr { font-size: 13px; color: #888; }
    .sc-cta { font-size: 13px; font-weight: 600; color: #0055ff; white-space: nowrap; margin-left: 20px; flex-shrink: 0; }
    .pagination { max-width: 1200px; margin: 36px auto 72px; padding: 0 20px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
    .pg-link, .pg-cur { display: inline-flex; align-items: center; justify-content: center; min-width: 36px; height: 36px; padding: 0 8px; border-radius: 8px; font-size: 14px; font-weight: 500; }
    .pg-link { border: 1px solid #e5e5e5; color: #333; }
    .pg-link:hover { border-color: #999; }
    .pg-cur { background: #111; color: #fff; font-weight: 700; }
    .pg-ellipsis { color: #ccc; font-size: 14px; width: 28px; text-align: center; line-height: 36px; }
    @media (max-width: 600px) { .dir-hero h1 { font-size: 1.6rem; } .sc-cta { display: none; } }
  </style>
</head>
<body>
${SITE_HEADER}
<nav class="breadcrumb" aria-label="Breadcrumb">
  <ol>
    <li><a href="/nail-salons">Nail Salons</a></li>
    <li><a href="/nail-salons/${esc(state.slug)}">${esc(state.name)}</a></li>
    <li aria-current="page">${esc(cityName)}</li>
  </ol>
</nav>
<div class="dir-hero">
  <h1>Nail Salons in ${esc(cityName)}, ${esc(state.name)}</h1>
  <p>${records.length.toLocaleString()} nail salon${records.length !== 1 ? "s" : ""}${pg > 1 ? ` — page ${pg} of ${totalPages}` : ""}.</p>
</div>
<div class="salons-list">${salonCards}</div>
${paginationHtml}
<footer class="page-footer">
  <p>
    <a href="${esc(CERTXA_DOMAIN)}">certxa.com</a> &nbsp;·&nbsp;
    <a href="/nail-salons/${esc(state.slug)}">${esc(state.name)}</a> &nbsp;·&nbsp;
    <a href="/nail-salons">Browse all states</a>
  </p>
</footer>
</body>
</html>`;
}

// ── Sitemap protection ─────────────────────────────────────────────────────────
//
// Goal: let Googlebot/Bingbot crawl freely for SEO, while making it
// impractical for a competitor to bulk-download the full 51k-record list in
// one sitting.
//
// Policy (per IP, sliding window):
//   • Verified search-engine bots (UA contains googlebot / bingbot / yandex /
//     duckduckbot / baidu / slurp / ia_archiver) — unlimited
//   • Everyone else — 10 requests per 10 minutes
//     (enough for a curious human or a CI health-check, not for a bulk scrape)

const SITEMAP_WINDOW_MS  = 10 * 60 * 1000; // 10 minutes
const SITEMAP_MAX_REQ    = 10;              // per window, non-bot IPs

interface SitemapRLEntry { count: number; windowStart: number }
const sitemapRateLimits = new Map<string, SitemapRLEntry>();

// Purge stale entries every 15 minutes so the map doesn't grow forever
setInterval(() => {
  const cutoff = Date.now() - SITEMAP_WINDOW_MS;
  for (const [ip, e] of sitemapRateLimits) {
    if (e.windowStart < cutoff) sitemapRateLimits.delete(ip);
  }
}, 15 * 60 * 1000).unref?.();

// The repository's SEO contract check is a low-volume, deterministic health
// check rather than a scraper. Allow it to validate both sitemap endpoints
// without being affected by the ordinary non-bot request window.
const KNOWN_BOT_RE = /googlebot|bingbot|yandexbot|duckduckbot|baiduspider|slurp|ia_archiver|applebot|msnbot|certxa-seo-contract/i;

function sitemapRateLimit(req: Request, res: Response, next: () => void): void {
  const ua = req.headers["user-agent"] ?? "";
  if (KNOWN_BOT_RE.test(ua)) { next(); return; }  // let verified crawlers through

  const ip  = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
              ?? req.socket.remoteAddress
              ?? "unknown";
  const now = Date.now();
  const entry = sitemapRateLimits.get(ip);

  if (!entry || now - entry.windowStart > SITEMAP_WINDOW_MS) {
    sitemapRateLimits.set(ip, { count: 1, windowStart: now });
    next(); return;
  }
  if (entry.count >= SITEMAP_MAX_REQ) {
    const retryAfter = Math.ceil((SITEMAP_WINDOW_MS - (now - entry.windowStart)) / 1000);
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).send("Too many sitemap requests — please slow down.");
    return;
  }
  entry.count++;
  next();
}

// ── Sitemap routes ─────────────────────────────────────────────────────────────

router.get("/salon/sitemap.xml", (_req: Request, res: Response) => {
  try {
    const list = getSalonList();
    const totalPages = Math.ceil(list.length / SITEMAP_PAGE_SIZE);

    if (totalPages <= 1) {
      const entries = list.map(r =>
        `  <url><loc>${xmlEsc(`${CERTXA_DOMAIN}/salon/${r.s}`)}</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>`
      ).join("\n");
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`);
    }

    const sitemapEntries = Array.from({ length: totalPages }, (_, i) =>
      `  <sitemap><loc>${xmlEsc(`${CERTXA_DOMAIN}/salon/sitemap-${i + 1}.xml`)}</loc></sitemap>`
    ).join("\n");
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries}\n</sitemapindex>`);
  } catch {
    res.status(503).send("Salon data unavailable");
  }
});

router.get("/salon/sitemap-:page.xml", (req: Request, res: Response) => {
  try {
    const list = getSalonList();
    const page = parseInt(String(req.params.page), 10);
    if (isNaN(page) || page < 1) { res.status(404).send("Not found"); return; }
    const start = (page - 1) * SITEMAP_PAGE_SIZE;
    const slice = list.slice(start, start + SITEMAP_PAGE_SIZE);
    if (slice.length === 0) { res.status(404).send("Not found"); return; }

    const entries = slice.map(r =>
      `  <url><loc>${xmlEsc(`${CERTXA_DOMAIN}/salon/${r.s}`)}</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>`
    ).join("\n");
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`);
  } catch {
    res.status(503).send("Salon data unavailable");
  }
});

// ── Directory routes ───────────────────────────────────────────────────────────

// National
router.get("/nail-salons", (_req: Request, res: Response) => {
  try {
    const html = renderNationalPage();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.send(html);
  } catch (err) {
    logger.error({ err }, "[salonDir] national page error");
    res.status(500).send("Internal server error");
  }
});

// Alias: /nail-salons/united-states → /nail-salons
router.get("/nail-salons/united-states", (_req: Request, res: Response) => {
  res.redirect(301, "/nail-salons");
});

// ── Nearby salons JSON API — must be registered before /:stateSlug ────────────
router.get("/nail-salons/nearby.json", (req: Request, res: Response) => {
  const lat     = parseFloat(String(req.query.lat));
  const lng     = parseFloat(String(req.query.lng));
  const radius  = Math.min(Math.max(parseFloat(String(req.query.radius  || "2")), 1), 50);
  const limit   = Math.min(parseInt(String(req.query.limit   || "10"), 10), 10);

  if (isNaN(lat) || isNaN(lng)) {
    res.status(400).json({ error: "lat and lng query params are required" });
    return;
  }

  try {
    const list = getSalonList();
    const results: Array<SalonRecord & { dist: number }> = [];
    for (const s of list) {
      const sLat = parseFloat(s.la);
      const sLng = parseFloat(s.lo);
      if (isNaN(sLat) || isNaN(sLng)) continue;
      const d = haversineMiles(lat, lng, sLat, sLng);
      if (d <= radius) results.push({ ...s, dist: Math.round(d * 10) / 10 });
    }
    results.sort((a, b) => a.dist - b.dist);
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(results.slice(0, limit));
  } catch (err) {
    logger.error({ err }, "[salonDir] nearby.json error");
    res.status(503).json({ error: "Salon data unavailable" });
  }
});

// State page: /nail-salons/california
router.get("/nail-salons/:stateSlug", (req: Request, res: Response) => {
  try {
    const state = getStateBySlug(String(req.params.stateSlug));
    if (!state) {
      res.status(404).send(`<!DOCTYPE html><html><head><title>Not found</title><meta name="robots" content="noindex"></head><body><h1>State not found</h1><p><a href="/nail-salons">Browse all states</a></p></body></html>`);
      return;
    }
    const html = renderStatePage(state);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.send(html);
  } catch (err) {
    logger.error({ err }, "[salonDir] state page error");
    res.status(500).send("Internal server error");
  }
});

// City page: /nail-salons/california/los-angeles
router.get("/nail-salons/:stateSlug/:citySlug", (req: Request, res: Response) => {
  try {
    const state = getStateBySlug(String(req.params.stateSlug));
    if (!state) {
      res.status(404).send(`<!DOCTYPE html><html><head><title>Not found</title><meta name="robots" content="noindex"></head><body><h1>State not found</h1><p><a href="/nail-salons">Browse all states</a></p></body></html>`);
      return;
    }
    const city = getCityData(state.code, String(req.params.citySlug));
    if (!city) {
      res.status(404).send(`<!DOCTYPE html><html><head><title>Not found</title><meta name="robots" content="noindex"></head><body><h1>City not found</h1><p><a href="/nail-salons/${esc(state.slug)}">${esc(state.name)}</a></p></body></html>`);
      return;
    }
    const page = parseInt((req.query.page as string) || "1", 10);
    const html = renderCityPage(state, city.name, String(req.params.citySlug), city.records, page);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.send(html);
  } catch (err) {
    logger.error({ err }, "[salonDir] city page error");
    res.status(500).send("Internal server error");
  }
});

// ── Individual salon page ──────────────────────────────────────────────────────

router.get("/salon/:slug", async (req: Request, res: Response) => {
  try {
    const map = loadSalonData();
    const salon = map.get(String(req.params.slug));

    if (!salon) {
      res.status(404).send(`<!DOCTYPE html><html><head><title>Salon not found</title><meta name="robots" content="noindex"></head><body><h1>Salon not found</h1><p><a href="/nail-salons">Browse nail salons</a></p></body></html>`);
      return;
    }

    // Attempt to match a registered Certxa store by phone number
    const live = salon.p ? await findMatchingStore(salon.s, salon.p) : null;

    const html = renderSalonPage(salon, live);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.send(html);
  } catch (err) {
    logger.error({ err }, "[salonDir] render error");
    res.status(500).send("Internal server error");
  }
});

export default router;
