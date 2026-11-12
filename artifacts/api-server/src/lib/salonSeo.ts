/**
 * Each salon's booking page, made findable by search engines and AI answer engines (owner, 2026-11-02: SEO, GEO, AEO).
 *
 * A salon's booking page — <slug>.certxa.com, which the booking app shows at /book/<slug> — used to go out with the
 * app's generic head ("Certxa - Online Booking Service", certxa.com as canonical, `noindex`), the same for every salon,
 * and an empty page to anything that doesn't run JavaScript (most AI crawlers). Now, from the salon's own details:
 *   • SEO — its title, description, canonical, picture, keywords, indexable; schema.org business data (address,
 *     phone, hours, services and prices, booking action).
 *   • AEO — questions people ask, answered (FAQPage): where, when, how to book, what it costs, rating.
 *   • GEO — the same facts as plain readable text inside the page before the app starts (what AI crawlers read),
 *     and the salon's own robots.txt (AI crawlers welcome), sitemap.xml and llms.txt on its subdomain.
 * A private street address is never shown (only the city), as on the page itself (lib/publicStore.ts); prices only
 * when the salon shows them on its booking page; the rating only from 3 reviews up (Google first, then its own), as
 * on the salon's website pages (tenant-seo.ts) and GlossGenius's salon pages.
 */
import { isSoloPlanCode } from "@shared/soloPlan";
import { pool } from "../db";
import { offersOnlineLine } from "./onlineLine";
import { loadLineSettings } from "./onlineLineService";
import { addressIsPrivate } from "./publicStore";
import { displayPhone, toE164 } from "./tenant-seo";
import { resolveStorePlan } from "./featureAccess";
import { isBookingSystemOff } from "./bookingSystem";
import { craftFor, craftTitle, placesSentence, proByLabel, soloKeywords, type SoloPlaces } from "./proCraft";
import { TEST_STORE_IDS } from "./testStores";

export interface SalonFacts {
  slug: string;
  storeId?: number;
  name: string;
  category: string;
  city: string | null;
  state: string | null;
  cityState: string;
  /** The street address line(s) the public may see (empty when private). */
  streetAddress: string | null;
  postcode: string | null;
  phone: string | null;
  /** Only when the street address is public. */
  latitude: number | null;
  longitude: number | null;
  canonical: string;
  about: string | null;
  image: string | null;
  instagram: string | null;
  showPrices: boolean;
  /** Most booked first. */
  services: { name: string; price: number | null; duration: number | null; category: string | null }[];
  hours: { day: string; opens: string | null; closes: string | null }[];
  rating: { value: number; count: number; source: "Google" | "Certxa" } | null;
  /** A Solo-plan professional (booth/suite, home studio, house calls): described by their craft, not as a salon (lib/proCraft.ts). */
  solo: boolean;
  /** A Solo pro's label: "Nails by Toby" (lib/proCraft.ts). */
  byLabel: string | null;
  places: SoloPlaces;
  /** A barbershop or haircut studio with the Online Check-In Line on: where walk-ins check in from their phone. */
  onlineCheckin: string | null;
  /** False when the business switched its booking system off: nothing then says it can be booked online. */
  bookingOn: boolean;
}

const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { facts: SalonFacts | null; at: number }>();
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…`);
const money = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);
const time12 = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")} ${ap}` : `${h12} ${ap}`;
};

/** The schema.org kind for the salon's business type. */
function schemaType(category: string): string {
  const c = category.toLowerCase();
  if (/nail/.test(c)) return "NailSalon";
  if (/barber|hair|haircut/.test(c)) return "HairSalon";
  if (/spa/.test(c)) return "DaySpa";
  if (/salon|beauty|lash|brow|wax|esthetic|makeup/.test(c)) return "BeautySalon";
  return "LocalBusiness";
}

/** What the public may know about the salon whose booking slug this is, or null (no such salon, or closed). */
export async function salonFacts(slug: string): Promise<SalonFacts | null> {
  const key = slug.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.facts;
  const facts = await loadFacts(key).catch(() => null);
  cache.set(key, { facts, at: Date.now() });
  return facts;
}

async function loadFacts(slug: string): Promise<SalonFacts | null> {
  const { rows } = await pool.query(
    `SELECT id, name, category, address, city, state, postcode, phone, store_latitude, store_longitude, booking_slug, booking_site, own_place, address_private, account_status,
            house_calls, house_call_radius_miles, (SELECT first_name FROM users u WHERE u.id = locations.user_id) AS owner_first_name
       FROM locations WHERE lower(booking_slug) = $1 LIMIT 1`,
    [slug],
  );
  const s = rows[0];
  if (!s || ["suspended", "canceled", "cancelled", "locked"].includes(String(s.account_status ?? "").toLowerCase())) return null;
  const [services, hours, settings, google, own] = await Promise.all([
    pool.query(
      `SELECT sv.name, sv.price, sv.duration, sv.category FROM services sv
         LEFT JOIN (SELECT service_id, COUNT(*) AS n FROM appointments WHERE store_id = $1 AND date > now() - interval '180 days' GROUP BY service_id) a
           ON a.service_id = sv.id
        WHERE sv.store_id = $1 AND sv.is_active = true AND COALESCE(sv.hidden_from_public, false) = false
        ORDER BY a.n DESC NULLS LAST, sv.name LIMIT 24`, [s.id]).then((r) => r.rows).catch(() => [] as any[]),
    pool.query(`SELECT day_of_week, open_time, close_time, is_closed FROM business_hours WHERE store_id = $1 ORDER BY day_of_week`, [s.id])
      .then((r) => r.rows).catch(() => [] as any[]),
    pool.query(`SELECT show_prices FROM calendar_settings WHERE store_id = $1 LIMIT 1`, [s.id]).then((r) => r.rows[0]).catch(() => null),
    pool.query(`SELECT AVG(rating)::float AS avg, COUNT(*)::int AS n FROM google_reviews WHERE store_id = $1`, [s.id]).then((r) => r.rows[0]).catch(() => null),
    pool.query(`SELECT AVG(rating)::float AS avg, COUNT(*)::int AS n FROM reviews WHERE store_id = $1 AND is_public = true`, [s.id]).then((r) => r.rows[0]).catch(() => null),
  ]);
  // Solo and Solo Plus: an independent pro.
  const solo = isSoloPlanCode((await resolveStorePlan(s.id).catch(() => null))?.planCode);
  const site = (s.booking_site ?? {}) as { about?: string; coverImage?: string; logoImage?: string; instagram?: string };
  const privateAddress = addressIsPrivate({ ownPlace: s.own_place, addressPrivate: s.address_private });
  const rating = Number(google?.n) >= 3 ? { value: Math.round(Number(google.avg) * 10) / 10, count: Number(google.n), source: "Google" as const }
    : Number(own?.n) >= 3 ? { value: Math.round(Number(own.avg) * 10) / 10, count: Number(own.n), source: "Certxa" as const } : null;
  return {
    slug: s.booking_slug,
    storeId: Number(s.id),
    name: String(s.name ?? "").trim() || "Salon",
    category: String(s.category ?? "").trim(),
    city: s.city ?? null,
    state: s.state ?? null,
    cityState: [s.city, s.state].filter(Boolean).join(", "),
    streetAddress: !privateAddress && s.address ? String(s.address) : null,
    postcode: !privateAddress && s.postcode ? String(s.postcode) : null,
    phone: s.phone ?? null,
    latitude: !privateAddress && s.store_latitude != null && Number.isFinite(Number(s.store_latitude)) ? Number(s.store_latitude) : null,
    longitude: !privateAddress && s.store_longitude != null && Number.isFinite(Number(s.store_longitude)) ? Number(s.store_longitude) : null,
    canonical: `https://${s.booking_slug}.certxa.com/`,
    bookingOn: !(await isBookingSystemOff(Number(s.id))),
    about: site.about?.trim() ? site.about.trim().replace(/\s+/g, " ") : null,
    image: site.coverImage || site.logoImage || null,
    instagram: site.instagram?.trim() || null,
    showPrices: settings?.show_prices !== false,
    solo,
    byLabel: solo ? proByLabel(s.category, s.owner_first_name, String(s.name ?? "")) : null,
    places: { ownPlace: s.own_place ?? null, houseCalls: s.house_calls === true,
      radiusMiles: s.house_call_radius_miles != null && Number(s.house_call_radius_miles) > 0 ? Number(s.house_call_radius_miles) : null },
    services: services.map((x: any) => ({
      name: String(x.name), price: x.price != null && Number.isFinite(Number(x.price)) ? Number(x.price) : null,
      duration: x.duration != null ? Number(x.duration) : null, category: x.category ?? null,
    })),
    hours: DAYS.map((day, i) => {
      const h = (hours as any[]).find((r) => Number(r.day_of_week) === i);
      return h && !h.is_closed && h.open_time && h.close_time
        ? { day, opens: String(h.open_time).slice(0, 5), closes: String(h.close_time).slice(0, 5) }
        : { day, opens: null, closes: null };
    }),
    rating,
    onlineCheckin: offersOnlineLine(s.category) && (await loadLineSettings(Number(s.id)).catch(() => null))?.enabled
      ? `${(process.env.APP_URL ?? "https://certxa.com").replace(/\/$/, "")}/q/${encodeURIComponent(s.booking_slug)}` : null,
  };
}

/** "Nail Salon in Denver, CO" — or for a Solo pro, their craft: "Nails in Denver, CO" (never "salon"). */
const kindIn = (f: SalonFacts) => [f.solo ? craftTitle(craftFor(f.category)) : f.category, f.cityState ? `in ${f.cityState}` : ""].filter(Boolean).join(" ");
/** "Kim's Nails" → "Kim's Nails'": a name ending in s takes only the apostrophe (2026-11-10: "Happy Beauty Nails's"). */
export function possessive(name: string): string {
  return /s$/i.test(name.trim()) ? `${name.trim()}'` : `${name.trim()}'s`;
}

/**
 * Whether search engines may index the salon's page (2026-11-10 SEO review): not a test salon, and not an empty page.
 * The same rule as certxa.com/salon-sitemap.xml (lib/salonSitemap.ts), which lists a booking page only with at least
 * one public service.
 */
export function salonIndexable(f: SalonFacts): boolean {
  return !(f.storeId != null && TEST_STORE_IDS.has(f.storeId)) && f.services.length > 0;
}

/** "Toby’s nails" when the name is already possessive, else "Kim Tran — nails". */
const nameWithWork = (f: SalonFacts) => {
  const work = craftFor(f.category).work;
  return /['’]s$/i.test(f.name.trim()) ? `${f.name} ${work}` : `${f.name} — ${work}`;
};
/** How the page names them: "Nails by Toby" for a Solo pro, the business name otherwise. */
const who = (f: SalonFacts) => f.byLabel ?? f.name;
/** "Nails by Toby in Denver, CO", then the business name unless it only repeats the pro's ("Toby’s"). */
const soloTitle = (f: SalonFacts) => {
  const own = f.name.replace(/['’]s$/i, "").trim().toLowerCase();
  const repeats = f.byLabel!.toLowerCase().endsWith(` by ${own}`);
  return `${f.byLabel}${f.cityState ? ` in ${f.cityState}` : ""}${repeats ? "" : ` | ${f.name}`}`;
};
const addressLine = (f: SalonFacts) => [f.streetAddress, f.cityState, f.postcode].filter(Boolean).join(", ").replace(/, (\d{5})$/, " $1");
const hasHours = (f: SalonFacts) => f.hours.some((h) => h.opens);
const hoursText = (f: SalonFacts) => f.hours.map((h) => `${h.day}: ${h.opens && h.closes ? `${time12(h.opens)}–${time12(h.closes)}` : "Closed"}`);
const priced = (f: SalonFacts) => (f.showPrices ? f.services.filter((s) => s.price != null && s.price > 0) : []);

/** Questions people ask about a salon, answered from its own details (AEO). */
export function salonFaq(f: SalonFacts): { q: string; a: string }[] {
  const faq: { q: string; a: string }[] = [];
  const name = who(f);
  const where = addressLine(f);
  if (where) faq.push({ q: `Where is ${name} located?`, a: `${name} is ${f.streetAddress ? "at" : "in"} ${where}.` });
  if (hasHours(f)) faq.push({ q: f.byLabel ? `What are the hours for ${name}?` : `What are ${possessive(name)} hours?`, a: `${hoursText(f).join("; ")}.` });
  // A Solo pro: where the appointment happens.
  if (f.solo && f.places.houseCalls) {
    faq.push({ q: `Does ${name} come to you?`,
      a: `Yes, ${name} does house calls${f.places.radiusMiles ? ` within ${f.places.radiusMiles} miles` : ""}${f.cityState ? ` ${f.places.radiusMiles ? "of" : "in and around"} ${f.cityState}` : ""}.` });
  }
  if (f.solo && f.places.ownPlace === "home") {
    faq.push({ q: `Where do I go for my appointment with ${name}?`,
      a: `${name} works from a home studio${f.cityState ? ` in ${f.cityState}` : ""}. The address is shared once you book.` });
  } else if (f.solo && f.places.ownPlace === "salon" && addressLine(f)) {
    faq.push({ q: `Where do I go for my appointment with ${name}?`, a: `${name} works from a salon suite at ${addressLine(f)}.` });
  }
  if (f.onlineCheckin) faq.push({ q: `Does ${name} take walk-ins? Can I check in online?`,
    a: `Yes. Walk-ins are welcome, and you can join the line from your phone at ${f.onlineCheckin} — it shows the current wait and texts you when it's time to come in.` });
  faq.push({ q: `How do I book an appointment ${f.solo ? "with" : "at"} ${name}?`,
    a: f.bookingOn ? `Book online at ${f.canonical} — choose a service and an open time.${f.phone ? ` You can also call ${f.phone}.` : ""}`
      : `${name} isn't taking online bookings right now.${f.phone ? ` Call ${f.phone} to make an appointment.` : ""}` });
  if (f.services.length) faq.push({ q: `What services does ${name} offer?`, a: `${f.services.slice(0, 12).map((s) => s.name).join(", ")}.` });
  const p = priced(f);
  if (p.length) {
    const lo = Math.min(...p.map((s) => s.price!)), hi = Math.max(...p.map((s) => s.price!));
    faq.push({ q: `How much does ${name} charge?`,
      a: `Services range from ${money(lo)} to ${money(hi)}. For example: ${p.slice(0, 4).map((s) => `${s.name} ${money(s.price!)}`).join(", ")}.` });
  }
  if (f.rating) faq.push({ q: `Is ${name} good?`, a: `${name} is rated ${f.rating.value} out of 5 from ${f.rating.count} ${f.rating.source} reviews.` });
  return faq;
}

export interface SalonHead { title: string; description: string; keywords: string; jsonLd: unknown }

export function salonHead(f: SalonFacts): SalonHead {
  // "Nail Saints | Nail Salon in Lakewood, CO": the salon's name first (owner, 2026-11-02).
  const title = clip(f.byLabel ? soloTitle(f) : `${f.name}${kindIn(f) ? ` | ${kindIn(f)}` : ""}`, 70);
  // "Toby's offers Basic Manicure, Full Set Acrylics, and Gel X Full Set in Denver, CO. Book online or call (720) 243-6886."
  // Built from whole sentences that fit (the most booked services first), never cut mid-sentence.
  const phone = displayPhone(f.phone);
  const close = f.bookingOn ? `Book online${phone ? ` or call ${phone}` : ""}.` : phone ? `Call ${phone}.` : "";
  let description = "";
  for (let n = Math.min(3, f.services.length); n >= 0 && !description; n--) {
    const names = f.services.slice(0, n).map((s) => s.name);
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}` : names[0] ?? "";
    // A Solo pro: "Toby’s nails in Denver, CO: Basic Manicure, …. Home studio and house calls. Book online or call …"
    const first = f.solo
      ? `${f.byLabel ?? nameWithWork(f)}${f.cityState ? ` in ${f.cityState}` : ""}${list ? `: ${list}` : ""}.${placesSentence(f.places) ? ` ${placesSentence(f.places)}` : ""}`
      : list ? `${f.name} offers ${list}${f.cityState ? ` in ${f.cityState}` : ""}.`
      : `${f.name} is a ${f.category ? f.category.toLowerCase() : "salon"}${f.cityState ? ` in ${f.cityState}` : ""}.`;
    const both = `${first} ${close}`.trim();
    if (both.length <= 158) description = both;
    else if (n === 0) description = clip(first, 158);
  }
  const keywords = (f.solo
    ? [f.byLabel, ...soloKeywords(craftFor(f.category), f.city, f.places), f.name, ...f.services.slice(0, 6).map((s) => s.name)]
    : [
      f.category, f.category && f.city ? `${f.category} ${f.city}` : "", f.category ? `${f.category.toLowerCase()} near me` : "",
      `book ${(f.category || "appointment").toLowerCase()}${f.city ? ` ${f.city}` : ""}`, f.name, ...f.services.slice(0, 6).map((s) => s.name),
    ]).filter(Boolean).join(", ");

  const p = priced(f);
  const business: Record<string, unknown> = {
    // A Solo pro isn't a salon: the general beauty-business type.
    "@type": f.solo ? "HealthAndBeautyBusiness" : schemaType(f.category),
    "@id": `${f.canonical}#business`,
    name: f.name,
    ...(f.byLabel ? { alternateName: f.byLabel } : {}),
    url: f.canonical,
    ...(f.phone ? { telephone: toE164(f.phone) ?? f.phone } : {}),
    ...(f.image ? { image: f.image } : {}),
    ...(f.city ? { areaServed: { "@type": "City", name: f.city } } : {}),
    ...(f.latitude != null && f.longitude != null ? { geo: { "@type": "GeoCoordinates", latitude: f.latitude, longitude: f.longitude } } : {}),
    ...(f.rating ? { aggregateRating: { "@type": "AggregateRating", ratingValue: f.rating.value, reviewCount: f.rating.count, bestRating: 5, worstRating: 1 } } : {}),
    ...(f.about ? { description: clip(f.about, 300) } : {}),
    ...(f.instagram ? { sameAs: [/^https?:/.test(f.instagram) ? f.instagram : `https://instagram.com/${f.instagram.replace(/^@/, "")}`] } : {}),
    address: {
      "@type": "PostalAddress",
      ...(f.streetAddress ? { streetAddress: f.streetAddress } : {}),
      ...(f.city ? { addressLocality: f.city } : {}),
      ...(f.state ? { addressRegion: f.state } : {}),
      ...(f.postcode ? { postalCode: f.postcode } : {}),
      addressCountry: "US",
    },
    ...(hasHours(f) ? { openingHoursSpecification: f.hours.filter((h) => h.opens).map((h) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: h.day, opens: h.opens, closes: h.closes })) } : {}),
    ...(p.length ? { priceRange: `${money(Math.min(...p.map((s) => s.price!)))}–${money(Math.max(...p.map((s) => s.price!)))}` } : {}),
    ...(f.services.length ? {
      hasOfferCatalog: {
        "@type": "OfferCatalog", name: "Services",
        itemListElement: f.services.slice(0, 20).map((s) => ({
          "@type": "Offer",
          itemOffered: { "@type": "Service", name: s.name },
          ...(f.showPrices && s.price ? { price: s.price.toFixed(2), priceCurrency: "USD" } : {}),
        })),
      },
    } : {}),
    ...((actions) => (actions.length ? { potentialAction: actions } : {}))([
      ...(f.bookingOn ? [{ "@type": "ReserveAction", target: { "@type": "EntryPoint", urlTemplate: f.canonical, actionPlatform: ["https://schema.org/DesktopWebPlatform", "https://schema.org/MobileWebPlatform"] } }] : []),
      // Walk-ins join the line from their phone (Online Check-In Line).
      ...(f.onlineCheckin ? [{ "@type": "JoinAction", name: "Check in online", target: { "@type": "EntryPoint", urlTemplate: f.onlineCheckin, actionPlatform: ["https://schema.org/MobileWebPlatform", "https://schema.org/DesktopWebPlatform"] } }] : []),
    ]),
  };
  const faq = salonFaq(f);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      business,
      // The site's name in Google results is Certxa, not the web address (owner, 2026-11-12, like GlossGenius shows its own).
      { "@type": "WebSite", "@id": `${f.canonical}#website`, url: f.canonical, name: "Certxa", alternateName: ["Certxa.com"],
        publisher: { "@type": "Organization", name: "Certxa", url: "https://certxa.com/", logo: "https://certxa.com/favicon-512x512.png" } },
      { "@type": "WebPage", "@id": f.canonical, url: f.canonical, name: title, description, isPartOf: { "@id": `${f.canonical}#website` }, about: { "@id": `${f.canonical}#business` } },
      ...(faq.length ? [{ "@type": "FAQPage", mainEntity: faq.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })) }] : []),
    ],
  };
  return { title, description, keywords, jsonLd };
}

/**
 * The salon's facts as plain readable text, put inside the page before the booking app starts (GEO): what crawlers
 * that don't run JavaScript — most AI ones — read. The app replaces it as soon as it starts.
 */
/** A Solo website's service category pages (lib/soloCategoryPages.ts): where the summary, sitemap and llms.txt link. */
export type ServicePageLink = { name: string; url: string };

export function salonSummaryHtml(f: SalonFacts, servicePages: ServicePageLink[] = []): string {
  const p = priced(f);
  const faq = salonFaq(f);
  const where = addressLine(f);
  const services = f.services.slice(0, 20).map((s) =>
    `<li>${esc(s.name)}${f.showPrices && s.price ? ` — ${money(s.price)}` : ""}${s.duration ? ` (${s.duration} min)` : ""}</li>`).join("");
  return `<main data-salon-summary style="max-width:720px;margin:0 auto;padding:24px;font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a">
<h1>${esc(who(f))}</h1>
${kindIn(f) ? `<p>${esc(f.solo ? `Independent ${craftFor(f.category).pro}${f.cityState ? ` in ${f.cityState}` : ""}` : kindIn(f))}${f.rating ? ` · Rated ${f.rating.value}/5 (${f.rating.count} ${f.rating.source} reviews)` : ""}</p>` : ""}
${f.solo && placesSentence(f.places) ? `<p>${esc(placesSentence(f.places))}</p>` : ""}
${f.about ? `<p>${esc(f.about)}</p>` : ""}
${f.bookingOn ? `<p><a href="${esc(f.canonical)}">Book an appointment online</a>${f.phone ? ` · Call <a href="tel:${esc(f.phone.replace(/[^\d+]/g, ""))}">${esc(f.phone)}</a>` : ""}</p>`
  : `<p>Not taking online bookings right now.${f.phone ? ` Call <a href="tel:${esc(f.phone.replace(/[^\d+]/g, ""))}">${esc(f.phone)}</a>` : ""}</p>`}
${where ? `<h2>Location</h2><p>${esc(where)}</p>` : ""}
${hasHours(f) ? `<h2>Hours</h2><ul>${hoursText(f).map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
${services ? `<h2>Services${p.length ? " and prices" : ""}</h2><ul>${services}</ul>` : ""}
${servicePages.length ? `<h2>Services by category</h2><ul>${servicePages.map((x) => `<li><a href="${esc(x.url)}">${esc(x.name)}</a></li>`).join("")}</ul>` : ""}
${faq.length ? `<h2>Questions</h2>${faq.map((x) => `<h3>${esc(x.q)}</h3><p>${esc(x.a)}</p>`).join("")}` : ""}
</main>`;
}

/** The booking app's page with the salon's head and readable summary in place of the generic ones. */
export function applySalonPage(template: string, f: SalonFacts, servicePages: ServicePageLink[] = []): string {
  const head = salonHead(f);
  const t = esc(head.title), d = esc(head.description), c = esc(f.canonical), n = esc(f.name), k = esc(head.keywords);
  const img = f.image ? esc(f.image) : null;
  const set: Array<[RegExp, string]> = [
    [/<title>[^<]*<\/title>/i, `<title>${t}</title>`],
    [/<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${d}" />`],
    [/<meta\s+name=["']robots["'][^>]*>/i, salonIndexable(f)
      ? `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />`
      : `<meta name="robots" content="noindex, follow" />`],
    [/<meta\s+name=["']keywords["'][^>]*>/i, `<meta name="keywords" content="${k}" />`],
    // Marked as the salon's own, so the booking app's head manager leaves it alone (components/SeoManager.tsx).
    [/<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${c}" data-salon-page="true" />`],
    [/<meta\s+property=["']og:type["'][^>]*>/i, `<meta property="og:type" content="business.business" />`],
    [/<meta\s+property=["']og:title["'][^>]*>/i, `<meta property="og:title" content="${t}" />`],
    [/<meta\s+property=["']og:description["'][^>]*>/i, `<meta property="og:description" content="${d}" />`],
    [/<meta\s+property=["']og:url["'][^>]*>/i, `<meta property="og:url" content="${c}" />`],
    // Google's site name: Certxa on every salon page (the salon's name is the title and the business).
    [/<meta\s+property=["']og:site_name["'][^>]*>/i, `<meta property="og:site_name" content="Certxa" />`],
    [/<meta\s+name=["']twitter:title["'][^>]*>/i, `<meta name="twitter:title" content="${t}" />`],
    [/<meta\s+name=["']twitter:description["'][^>]*>/i, `<meta name="twitter:description" content="${d}" />`],
    [/<meta\s+name=["']apple-mobile-web-app-title["'][^>]*>/i, `<meta name="apple-mobile-web-app-title" content="${n}" />`],
  ];
  // Local search (as on the salon's website pages): region, place and, with a public address, the map position.
  if (f.state) set.push([/<meta\s+name=["']geo\.region["'][^>]*>/i, `<meta name="geo.region" content="US-${esc(f.state.toUpperCase())}" />`]);
  if (f.city) set.push([/<meta\s+name=["']geo\.placename["'][^>]*>/i, `<meta name="geo.placename" content="${esc(f.city)}" />`]);
  if (f.latitude != null && f.longitude != null) {
    set.push([/<meta\s+name=["']geo\.position["'][^>]*>/i, `<meta name="geo.position" content="${f.latitude};${f.longitude}" />`]);
    set.push([/<meta\s+name=["']ICBM["'][^>]*>/i, `<meta name="ICBM" content="${f.latitude}, ${f.longitude}" />`]);
  }
  set.push([/<link\s+rel=["']alternate["']\s+hreflang=["']en-US["'][^>]*>/i, `<link rel="alternate" hreflang="en-US" href="${c}" />`]);
  set.push([/<link\s+rel=["']alternate["']\s+hreflang=["']x-default["'][^>]*>/i, `<link rel="alternate" hreflang="x-default" href="${c}" />`]);
  if (img) {
    set.push([/<meta\s+property=["']og:image["'][^>]*>/i, `<meta property="og:image" content="${img}" />`]);
    set.push([/<meta\s+name=["']twitter:image["'][^>]*>/i, `<meta name="twitter:image" content="${img}" />`]);
  }
  let html = template;
  // No photo of its own: no picture rather than Certxa's app image, the same one on every salon's page (2026-11-10).
  if (!img) {
    html = html.replace(/\s*<meta\s+property=["']og:image["'][^>]*>/i, "").replace(/\s*<meta\s+name=["']twitter:image["'][^>]*>/i, "")
      .replace(/<meta\s+name=["']twitter:card["'][^>]*>/i, `<meta name="twitter:card" content="summary" />`);
  }
  for (const [pattern, tag] of set) html = pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `  ${tag}\n  </head>`);
  // Structured data (escaped so nothing in a salon's text can close the script) and the llms.txt pointer.
  const ld = JSON.stringify(head.jsonLd).replace(/</g, "\\u003c");
  html = html.replace("</head>", `  <link rel="alternate" type="text/markdown" href="${c}llms.txt" title="${n} — facts for AI assistants" />\n  <script type="application/ld+json">${ld}</script>\n  </head>`);
  return html.replace(/<div id="root"><\/div>/, `<div id="root">${salonSummaryHtml(f, servicePages)}</div>`);
}

/** The public, read-only data the salon's page loads: the same anyone visiting it gets (lib/publicStore.ts rules). */
export function salonPageReads(slug: string): string[] {
  const s = encodeURIComponent(slug);
  return [
    "/api/store/by-subdomain",
    `/api/public/booking-payment-policy/${s}`,
    ...["services", "reviews", "gallery", "service-reviews", "shop", "team", "service-pages"].map((part) => `/api/public/store/${s}/${part}`),
  ];
}

/** robots.txt for the salon's subdomain: everything public is open, AI crawlers included. */
export function salonRobotsTxt(f: SalonFacts): string {
  return [
    `# ${f.name} — ${f.canonical}`,
    "User-agent: *",
    "Allow: /",
    // Only the public reads this page makes as it loads, so a crawler that renders it sees the salon instead of
    // "not found". Exact paths for this salon ($ ends the match); every other /api/ address, sign-in included, stays shut.
    ...salonPageReads(f.slug).map((p) => `Allow: ${p}$`),
    "Disallow: /api/",
    "",
    "# AI search and answer engines are welcome.",
    ...["GPTBot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "ClaudeBot", "Claude-SearchBot", "Google-Extended", "Applebot-Extended", "CCBot"]
      .flatMap((bot) => [`User-agent: ${bot}`, "Allow: /", ""]),
    `Sitemap: ${f.canonical}sitemap.xml`,
    "",
  ].join("\n");
}

export function salonSitemapXml(f: SalonFacts, servicePages: ServicePageLink[] = []): string {
  const today = new Date().toISOString().slice(0, 10);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${esc(f.canonical)}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>
${servicePages.map((x) => `  <url><loc>${esc(x.url)}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>\n`).join("")}</urlset>
`;
}

/** llms.txt: the salon's facts for AI assistants, in plain Markdown (GEO). */
export function salonLlmsTxt(f: SalonFacts, servicePages: ServicePageLink[] = []): string {
  const lines = [`# ${who(f)}`, "", `> ${salonHead(f).description}`, ""];
  lines.push("## About", "");
  if (f.solo) {
    const c = craftFor(f.category);
    if (f.byLabel) lines.push(`- Business name: ${f.name}`);
    lines.push(`- Type: independent ${c.pro}${f.cityState ? ` in ${f.cityState}` : ""}`);
    if (placesSentence(f.places)) lines.push(`- Works: ${placesSentence(f.places).replace(/\.$/, "")}${f.places.houseCalls && f.places.radiusMiles ? ` (within ${f.places.radiusMiles} miles)` : ""}`);
  } else if (kindIn(f)) lines.push(`- Type: ${kindIn(f)}`);
  const where = addressLine(f);
  if (where) lines.push(`- Location: ${where}`);
  if (f.phone) lines.push(`- Phone: ${f.phone}`);
  lines.push(f.bookingOn ? `- Book online: ${f.canonical}` : `- Website: ${f.canonical} (not taking online bookings right now)`);
  if (f.onlineCheckin) lines.push(`- Walk-ins: check in online (live wait, text when it's time to come in): ${f.onlineCheckin}`);
  if (f.rating) lines.push(`- Rating: ${f.rating.value}/5 from ${f.rating.count} ${f.rating.source} reviews`);
  if (f.instagram) lines.push(`- Instagram: ${f.instagram}`);
  if (f.about) lines.push("", f.about);
  if (hasHours(f)) lines.push("", "## Hours", "", ...hoursText(f).map((h) => `- ${h}`));
  if (f.services.length) {
    lines.push("", `## Services${priced(f).length ? " and prices" : ""}`, "");
    for (const s of f.services) lines.push(`- ${s.name}${f.showPrices && s.price ? ` — ${money(s.price)}` : ""}${s.duration ? ` (${s.duration} min)` : ""}`);
  }
  if (servicePages.length) lines.push("", "## Service pages", "", ...servicePages.map((x) => `- [${x.name}](${x.url})`));
  const faq = salonFaq(f);
  if (faq.length) lines.push("", "## Questions", "", ...faq.flatMap((x) => [`### ${x.q}`, "", x.a, ""]));
  lines.push("", f.bookingOn ? "Bookings are made online at the link above (powered by Certxa)." : "Online booking is switched off for now (powered by Certxa).", "");
  return lines.join("\n");
}
