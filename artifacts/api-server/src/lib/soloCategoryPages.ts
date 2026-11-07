/**
 * Service category pages on Solo websites: <slug>.certxa.com/services/<category>/ (owner, 2026-11-06: Solo is the
 * master template). One page per category the business set up that has at least one bookable public service, built on
 * the server from its own records only: services (name, description, price, duration, photo), portfolio photos linked
 * to those services, who does them, and the business's name, place and phone (lib/salonSeo.ts SalonFacts, which keeps a
 * private street address out). Search engines and AI crawlers read the whole page without running JavaScript.
 *
 * Booking stays the Solo website's own: each Book button opens it at /?serviceId=<id> (PublicBooking.tsx → SoloTheme's
 * preselected service), where the client chooses a professional and sees that professional's price.
 * Barbershops and hair salons price by professional (lib/pricingLevels.ts): a service whose professionals charge
 * different prices shows "From $X", never the lowest price as everyone's.
 */
import type { Request, Response } from "express";
import { pool } from "../db";
import { categorySlug } from "./categoryPages";
import { priceTable, usesPricingLevels } from "./pricingLevels";
import { salonFacts, salonHead, type SalonFacts } from "./salonSeo";
import { displayPhone, toE164 } from "./tenant-seo";
import { TEST_STORE_IDS } from "./testStores";

export interface SoloService {
  id: number;
  name: string;
  description: string | null;
  /** The lowest and highest price the professionals who do it charge (the same unless priced by professional). */
  minPrice: number;
  maxPrice: number;
  duration: number | null;
  imageUrl: string | null;
}
export interface SoloCategoryPage {
  id: number;
  name: string;
  slug: string;
  services: SoloService[];
  photos: { url: string; caption: string | null; serviceName: string }[];
  /** Who does these services, when the business has more than one professional. */
  pros: string[];
}

const money = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…`);
const minutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);

/** The business's category pages, in its own category order. Only categories with a bookable public service. */
export async function soloCategoryPages(storeId: number, businessCategory: string | null): Promise<SoloCategoryPage[]> {
  // A test store has none: no pages (its /services/... addresses are 404s), no links, no sitemap entries.
  if (TEST_STORE_IDS.has(storeId)) return [];
  const [cats, svcs, photos, table] = await Promise.all([
    pool.query<{ id: number; name: string }>(
      `SELECT id, name FROM service_categories
        WHERE store_id = $1 AND COALESCE(hidden_from_public, false) = false
        ORDER BY sort_order NULLS LAST, id`, [storeId]),
    // Bookable: active, public, and done by at least one professional clients can book (active, on the calendar).
    pool.query<{ id: number; name: string; description: string | null; price: string | null; duration: number | null; image_url: string | null; category_id: number | null }>(
      `SELECT s.id, s.name, s.description, s.price, s.duration, s.image_url, s.category_id
         FROM services s
        WHERE s.store_id = $1 AND COALESCE(s.is_active, true) AND COALESCE(s.hidden_from_public, false) = false
          AND EXISTS (SELECT 1 FROM staff_services ss JOIN staff st ON st.id = ss.staff_id
                       WHERE ss.service_id = s.id AND st.store_id = $1
                         AND COALESCE(st.status, 'active') NOT IN ('removed', 'deactivated') AND st.show_on_calendar IS NOT FALSE)
        ORDER BY s.name`, [storeId]),
    pool.query<{ image_url: string; caption: string | null; service_id: number }>(
      `SELECT image_url, caption, service_id FROM wb_gallery_photos
        WHERE store_id = $1 AND show_on_website AND service_id IS NOT NULL AND COALESCE(image_url, '') <> ''
        ORDER BY sort_order NULLS LAST, created_at DESC`, [storeId]).catch(() => ({ rows: [] as { image_url: string; caption: string | null; service_id: number }[] })),
    priceTable(storeId),
  ]);
  const byPro = usesPricingLevels(businessCategory);
  const team = table.staff.filter((m) => table.prices.some((p) => p.staffId === m.id));

  const pages: SoloCategoryPage[] = [];
  const seen = new Set<string>();
  for (const c of cats.rows) {
    const slug = categorySlug(String(c.name ?? ""));
    if (!slug || seen.has(slug)) continue;
    const services: SoloService[] = svcs.rows.filter((s) => s.category_id === c.id).map((s) => {
      const standard = Number(s.price ?? 0) || 0;
      // Priced by professional: the prices the professionals who do it charge (their own, their level's or standard).
      const theirs = byPro ? table.prices.filter((p) => p.serviceId === Number(s.id)).map((p) => p.price) : [];
      return {
        id: Number(s.id), name: String(s.name).trim(), description: s.description?.trim() || null,
        minPrice: theirs.length ? Math.min(...theirs) : standard, maxPrice: theirs.length ? Math.max(...theirs) : standard,
        duration: s.duration ? Number(s.duration) : null, imageUrl: s.image_url?.trim() || null,
      };
    });
    if (services.length === 0) continue;
    seen.add(slug);
    const ids = new Set(services.map((s) => s.id));
    pages.push({
      id: Number(c.id), name: String(c.name).trim(), slug, services,
      photos: photos.rows.filter((p) => ids.has(Number(p.service_id))).slice(0, 12)
        .map((p) => ({ url: p.image_url, caption: p.caption?.trim() || null, serviceName: services.find((s) => s.id === Number(p.service_id))!.name })),
      pros: team.length >= 2 ? team.filter((m) => table.prices.some((p) => p.staffId === m.id && ids.has(p.serviceId))).map((m) => m.name.trim()) : [],
    });
  }
  return pages;
}

/** The page's address: always the business's own subdomain (its canonical), with a closing slash. */
export const soloCategoryUrl = (f: Pick<SalonFacts, "canonical">, page: { slug: string }) => `${f.canonical}services/${page.slug}/`;

/** The Solo design or its copy Aspen (owner, 2026-11-07): the server treats both the same. */
export const isSoloDesign = (theme: string | null | undefined): boolean => theme === "solo" || theme === "aspen";

/** Links to the category pages of a business on the Solo design (empty for any other design): sitemap, summary, llms.txt. */
export async function soloCategoryLinks(store: { id: number; category?: string | null; bookingTheme?: string | null }, f: SalonFacts): Promise<{ name: string; url: string }[]> {
  if (!isSoloDesign(store.bookingTheme)) return [];
  return (await soloCategoryPages(store.id, store.category ?? null)).map((p) => ({ name: p.name, url: soloCategoryUrl(f, p) }));
}

/** The same, found by booking slug (the booking page's head in index.ts). */
export async function soloCategoryLinksBySlug(slug: string, f: SalonFacts): Promise<{ name: string; url: string }[]> {
  const { rows } = await pool.query<{ id: number; category: string | null; booking_theme: string | null }>(
    "SELECT id, category, booking_theme FROM locations WHERE lower(booking_slug) = lower($1) LIMIT 1", [slug]);
  return rows[0] ? soloCategoryLinks({ id: Number(rows[0].id), category: rows[0].category, bookingTheme: rows[0].booking_theme }, f) : [];
}

interface SiteLook { accent?: string; logoImage?: string }

function priceText(s: SoloService, showPrices: boolean): string {
  if (!showPrices || s.maxPrice <= 0) return "";
  return s.minPrice === s.maxPrice ? money(s.minPrice) : `From ${money(s.minPrice)}`;
}

/** The category page: the Solo website's look (its fonts, colours and the business's own accent colour). */
export function renderSoloCategoryPage(f: SalonFacts, site: SiteLook, page: SoloCategoryPage, pages: SoloCategoryPage[]): string {
  const who = f.byLabel ?? f.name;
  const url = soloCategoryUrl(f, page);
  const home = f.canonical;
  const accent = /^#[0-9a-fA-F]{6}$/.test(site.accent ?? "") ? site.accent! : "#B45309";
  const phone = displayPhone(f.phone) || "";
  const tel = toE164(f.phone);
  const where = [f.streetAddress, f.cityState, f.postcode].filter(Boolean).join(", ");
  const varies = page.services.some((s) => s.minPrice !== s.maxPrice);
  const priced = f.showPrices ? page.services.filter((s) => s.maxPrice > 0) : [];
  const low = priced.length ? Math.min(...priced.map((s) => s.minPrice)) : 0;
  const high = priced.length ? Math.max(...priced.map((s) => s.maxPrice)) : 0;
  const range = priced.length ? (low === high ? money(low) : `${money(low)} to ${money(high)}`) : "";
  const times = page.services.map((s) => s.duration).filter((d): d is number => !!d);
  const n = page.services.length;
  const svcWord = n === 1 ? "service" : "services";
  const lowerName = page.name.toLowerCase();

  // Title and description: the category, the business and its place, from its own records.
  const title = clip(`${page.name}${f.cityState ? ` in ${f.cityState}` : ""} | ${who}`, 70);
  const description = clip(`${page.name} at ${who}${f.cityState ? ` in ${f.cityState}` : ""}: ${n} ${svcWord}`
    + `${range ? (low === high ? `, ${range}` : ` from ${range}`) : ""}. ${f.bookingOn ? "See prices and times and book online." : phone ? `Call ${phone} to book.` : "See prices and times."}`, 158);
  // The introduction says only what the records say.
  const intro = `${who} offers ${n} ${lowerName} ${svcWord}${f.cityState ? ` in ${f.cityState}` : ""}`
    + `${range ? `, ${low === high ? range : `from ${range}`}` : ""}`
    + `${times.length ? `, taking ${Math.min(...times) === Math.max(...times) ? minutes(times[0]) : `${minutes(Math.min(...times))} to ${minutes(Math.max(...times))}`}` : ""}.`
    + `${varies ? " Prices depend on the professional you choose; you'll see yours before you book." : ""}`;

  // Structured data: the business (the same @id as its homepage) with this category's services and prices,
  // the breadcrumb trail and the page itself.
  const graph = ((salonHead(f).jsonLd as { "@graph"?: Record<string, unknown>[] })["@graph"] ?? []);
  const business = { ...(graph.find((x) => String(x["@id"] ?? "").endsWith("#business")) ?? {}) } as Record<string, unknown>;
  delete business.potentialAction;
  business.hasOfferCatalog = {
    "@type": "OfferCatalog", name: page.name, url,
    itemListElement: page.services.map((s) => ({
      ...(f.showPrices && s.maxPrice > 0
        ? s.minPrice === s.maxPrice
          ? { "@type": "Offer", price: s.minPrice.toFixed(2), priceCurrency: "USD" }
          : { "@type": "AggregateOffer", lowPrice: s.minPrice.toFixed(2), highPrice: s.maxPrice.toFixed(2), priceCurrency: "USD" }
        : { "@type": "Offer" }),
      ...(f.bookingOn ? { url: `${home}?serviceId=${s.id}` } : {}),
      itemOffered: { "@type": "Service", name: s.name, ...(s.description ? { description: s.description } : {}), ...(s.imageUrl ? { image: s.imageUrl } : {}), provider: { "@id": `${home}#business` } },
    })),
  };
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      business,
      { "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`, itemListElement: [
        { "@type": "ListItem", position: 1, name: who, item: home },
        { "@type": "ListItem", position: 2, name: page.name, item: url },
      ] },
      { "@type": "WebPage", "@id": url, url, name: title, description, about: { "@id": `${home}#business` }, breadcrumb: { "@id": `${url}#breadcrumb` } },
    ],
  };

  const book = (s: SoloService) => (f.bookingOn ? `<a class="book" href="/?serviceId=${s.id}" aria-label="Book ${esc(s.name)}">Book</a>` : "");
  const cards = page.services.map((s) => {
    const p = priceText(s, f.showPrices);
    const meta = [p ? `<b>${p}</b>` : "", s.duration ? minutes(s.duration) : ""].filter(Boolean).join(" · ");
    return `<article class="svc" id="service-${s.id}">
${s.imageUrl ? `<img src="${esc(s.imageUrl)}" alt="${esc(`${s.name} at ${f.name}`)}" loading="lazy" width="64" height="64">` : ""}
<div class="body"><h2>${esc(s.name)}</h2>${meta ? `<p class="meta">${meta}</p>` : ""}${s.description ? `<p class="desc">${esc(s.description)}</p>` : ""}</div>
${book(s)}
</article>`;
  }).join("\n");
  const photos = page.photos.length ? `<section aria-labelledby="work"><h3 id="work">${esc(page.name)} portfolio</h3><div class="grid">${page.photos.map((p) =>
    `<figure><img src="${esc(p.url)}" alt="${esc(p.caption ? `${p.caption} — ${p.serviceName} at ${f.name}` : `${p.serviceName} at ${f.name}`)}" loading="lazy"></figure>`).join("")}</div></section>` : "";
  const others = pages.filter((p) => p.slug !== page.slug);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="${esc(f.name)}">
${(page.services.find((s) => s.imageUrl)?.imageUrl ?? f.image) ? `<meta property="og:image" content="${esc((page.services.find((s) => s.imageUrl)?.imageUrl ?? f.image)!)}">` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
<style>
*,*::before,*::after{box-sizing:border-box}
:root{--accent:${accent}}
body{margin:0;background:#FDFCFA;color:#1A1814;font-family:"DM Sans",system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.55}
a{color:inherit}
.serif{font-family:"Playfair Display",Georgia,serif}
header{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.95);box-shadow:0 1px 8px rgba(0,0,0,.06)}
header .in{max-width:1120px;margin:0 auto;height:64px;padding:0 16px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.brand{display:flex;align-items:center;gap:10px;min-width:0;text-decoration:none;font-family:"Playfair Display",Georgia,serif;font-size:22px;font-weight:600}
.brand img{width:36px;height:36px;border-radius:50%;object-fit:cover}
.brand span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hd-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}
.call{display:none;border:1px solid #D8D0C4;border-radius:999px;padding:8px 14px;font-size:14px;font-weight:600;color:#4A4540;text-decoration:none}
@media(min-width:900px){.call{display:inline-block}}
.cta{background:var(--accent);color:#fff;text-decoration:none;border-radius:999px;padding:9px 18px;font-size:14px;font-weight:600;white-space:nowrap}
main{max-width:760px;margin:0 auto;padding:20px 16px 48px}
.crumbs{font-size:13px;color:#8C8680;margin:4px 0 14px}
.crumbs a{color:#6B6560}
h1{font-family:"Playfair Display",Georgia,serif;font-weight:600;font-size:clamp(28px,6vw,40px);line-height:1.15;margin:0 0 6px}
.where{color:#6B6560;margin:0 0 10px;font-size:15px}
.intro{color:#4A4540;margin:0 0 22px;font-size:16px}
.pros{font-size:14px;color:#4A4540;margin:-8px 0 22px}
.off{background:#F8F5F0;border:1px solid #EDE8DF;border-radius:12px;padding:12px 14px;margin:0 0 20px;font-size:14px;color:#4A4540}
.svc{display:flex;gap:12px;align-items:flex-start;background:#fff;border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,.08);padding:14px;margin-bottom:12px}
.svc img{width:64px;height:64px;border-radius:8px;object-fit:cover;flex-shrink:0}
.svc .body{flex:1;min-width:0}
.svc h2{font-family:"Playfair Display",Georgia,serif;font-size:17px;font-weight:600;line-height:1.3;margin:0 0 2px}
.meta{margin:0;font-size:14px;color:#4A4540}.meta b{color:#2C2925}
.desc{margin:6px 0 0;font-size:13.5px;color:#6B6560}
.book{align-self:center;flex-shrink:0;background:var(--accent);color:#fff;text-decoration:none;border-radius:999px;padding:9px 18px;font-size:14px;font-weight:600}
h3{font-family:"Playfair Display",Georgia,serif;font-size:22px;font-weight:600;margin:34px 0 12px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.grid figure{margin:0;aspect-ratio:1;overflow:hidden;border-radius:10px;background:#EDE8DF}
.grid img{width:100%;height:100%;object-fit:cover;display:block}
.cats{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0;margin:0}
.cats a{display:inline-block;background:#fff;border:1px solid #D8D0C4;border-radius:999px;padding:7px 14px;font-size:14px;font-weight:600;text-decoration:none;color:#2C2925}
.visit p{margin:0 0 4px;color:#4A4540;font-size:15px}
footer{background:#1A1814;color:#B0ABA5;padding:28px 16px;text-align:center;font-size:14px}
footer a{color:#fff;text-decoration:none;font-weight:600}
</style>
</head>
<body>
<header><div class="in">
<a class="brand" href="/">${site.logoImage ? `<img src="${esc(site.logoImage)}" alt="">` : ""}<span>${esc(f.name)}</span></a>
<div class="hd-actions">${phone && tel ? `<a class="call" href="tel:${esc(tel)}">${esc(phone)}</a>` : ""}${f.bookingOn ? `<a class="cta" href="/#services">Book Now</a>` : phone && tel ? `<a class="cta" href="tel:${esc(tel)}">Call</a>` : ""}</div>
</div></header>
<main>
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">${esc(who)}</a> / ${esc(page.name)}</nav>
<h1>${esc(page.name)}${f.byLabel ? "" : ` at ${esc(f.name)}`}</h1>
${f.cityState ? `<p class="where">${esc(f.byLabel ? `${f.byLabel} · ${f.cityState}` : f.cityState)}</p>` : ""}
<p class="intro">${esc(intro)}</p>
${page.pros.length ? `<p class="pros">With ${esc(page.pros.join(", "))}.</p>` : ""}
${f.bookingOn ? "" : `<p class="off" role="status">Online booking isn't available right now.${phone && tel ? ` Please call <a href="tel:${esc(tel)}">${esc(phone)}</a> to book.` : ""}</p>`}
${cards}
${photos}
${others.length ? `<h3>More services</h3><ul class="cats">${others.map((p) => `<li><a href="/services/${p.slug}/">${esc(p.name)}</a></li>`).join("")}</ul>` : ""}
<section class="visit"><h3>Visit ${esc(f.name)}</h3>
${where ? `<p>${esc(where)}</p>` : ""}
${phone ? `<p>${tel ? `<a href="tel:${esc(tel)}">${esc(phone)}</a>` : esc(phone)}</p>` : ""}
<p><a href="/">${esc(who)} — all services, reviews and more</a></p>
</section>
</main>
<footer><a href="/">${esc(f.name)}</a></footer>
</body>
</html>`;
}

/** A /services/... address on a Solo website: a category page, its address without the closing slash (301), or 404. */
export async function serveSoloServicesPath(req: Request, res: Response, store: { id: number; name?: string | null; category?: string | null; bookingSlug?: string | null; bookingSite?: unknown }): Promise<void> {
  const f = store.bookingSlug ? await salonFacts(String(store.bookingSlug)) : null;
  const pages = f ? await soloCategoryPages(store.id, store.category ?? null) : [];
  const m = /^\/services\/([^/]+)(\/)?$/.exec(req.path);
  const page = m ? pages.find((p) => p.slug === m[1]) : undefined;
  if (f && page && !m![2]) { res.redirect(301, soloCategoryUrl(f, page)); return; }
  if (f && page) {
    res.status(200).set("Cache-Control", "no-cache").type("html").send(renderSoloCategoryPage(f, (store.bookingSite ?? {}) as SiteLook, page, pages));
    return;
  }
  const name = esc(String(f?.name ?? store.name ?? "this business"));
  res.status(404).set("Cache-Control", "no-store").type("html").send(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<meta name="robots" content="noindex"><title>Page not found</title></head>`
    + `<body style="font-family:'DM Sans',system-ui,sans-serif;text-align:center;padding:64px 16px;color:#1A1814;background:#FDFCFA">`
    + `<h1 style="font-size:22px">Page not found</h1><p><a href="/">Go to ${name}</a></p></body></html>`);
}
