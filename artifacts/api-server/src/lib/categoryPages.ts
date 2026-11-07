/**
 * Service category pages on a salon's Bloom website: /services/<category>/ — e.g. kims-nails.certxa.com/services/pedicures/.
 * One page per category with at least 3 public services, built on the server from the salon's own records only:
 * its services (name, price, duration, existing description), name, location (street only when public), phone and
 * hours. Each Book button opens the website's own booking panel with that service chosen ("/?book=<serviceId>",
 * read by the template's BookingContext). Turned on salon by salon (CATEGORY_PAGE_STORE_IDS).
 */
import type { TenantData, ServiceEntry } from "./tenant-data";
import { buildBreadcrumbJsonLd, buildBusinessJsonLd, displayPhone, toE164 } from "./tenant-seo";

/** Salons whose website has category pages. First rollout (owner, 2026-11-05): Kim's Nails only. */
export const CATEGORY_PAGE_STORE_IDS = new Set<number>([
  42, // Kim's Nails (kims-nails)
]);

/** A category needs this many public services for its own page, so no page is a single thin listing. */
const MIN_SERVICES = 3;

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface CategoryPage { id: number; name: string; slug: string; services: ServiceEntry[] }

export function categorySlug(name: string): string {
  return name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

/** The salon's category pages, in its own category order; none unless category pages are on for it. */
export function categoryPagesFor(td: TenantData, storeId: number): CategoryPage[] {
  // Every template website has them since 2026-11-07 (owner: the Solo site's SEO everywhere), except one Certxa
  // prepared that its owner hasn't claimed yet (no near-alike pages across prepared salons).
  void storeId;
  if (!td.business || td.isUnclaimedAutoCreated) return [];
  const seen = new Set<string>();
  const pages: CategoryPage[] = [];
  for (const c of td.serviceCategories) {
    const services = td.services.filter((s) => s.category_id === c.id);
    const slug = categorySlug(c.name);
    if (services.length < MIN_SERVICES || !slug || seen.has(slug)) continue;
    seen.add(slug);
    pages.push({ id: c.id, name: c.name.trim(), slug, services });
  }
  return pages;
}

/** Paths as the site's sitemap lists them (buildSitemapXml adds the trailing slash). */
export function categoryPagePaths(pages: CategoryPage[]): string[] {
  return pages.map((p) => `/services/${p.slug}`);
}

export function categoryPageUrl(base: string, page: CategoryPage): string {
  return `${base.replace(/\/$/, "")}/services/${page.slug}/`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function priceOf(s: ServiceEntry): number {
  const n = typeof s.price === "string" ? parseFloat(s.price) : s.price;
  return Number.isFinite(n) ? n : 0;
}

/** As the Bloom template shows a time: "9:00 AM". */
function formatTime(t: string): string {
  const [hh, mm] = t.split(":");
  const h = parseInt(hh, 10), m = parseInt(mm ?? "0", 10);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

const STYLE = `<style>
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:#FDFCFA;color:#1A1814;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.6}
a{color:inherit}
.wrap{max-width:880px;margin:0 auto;padding:0 20px}
header{border-bottom:1px solid #EDE8DF;background:#FDFCFA}
header .wrap{display:flex;align-items:center;justify-content:space-between;height:64px}
.brand{font-family:"Playfair Display",Georgia,serif;font-size:22px;font-weight:600;text-decoration:none}
.home{font-size:14px;color:#4A4540}
.crumbs{font-size:13px;color:#8C8680;margin:24px 0 8px}
.crumbs a{color:#6B6560}
h1{font-family:"Playfair Display",Georgia,serif;font-weight:600;font-size:clamp(28px,5vw,40px);line-height:1.2;margin:0 0 6px}
.where{color:#6B6560;margin:0 0 28px}
.svc{background:#fff;border:1px solid #EDE8DF;border-radius:16px;padding:20px 22px;margin-bottom:14px;display:flex;gap:16px;align-items:flex-start;justify-content:space-between}
.svc h2{font-family:"Playfair Display",Georgia,serif;font-size:19px;font-weight:600;margin:0 0 4px}
.meta{font-size:15px;color:#4A4540;margin:0}
.meta b{color:#1A1814}
.desc{font-size:14px;color:#6B6560;margin:8px 0 0}
.book{flex-shrink:0;display:inline-block;background:#1A1814;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:10px 20px;border-radius:999px;white-space:nowrap}
.book:hover{background:#2C2925}
h3{font-family:"Playfair Display",Georgia,serif;font-size:22px;font-weight:600;margin:40px 0 12px}
.cats{display:flex;flex-wrap:wrap;gap:8px;padding:0;margin:0;list-style:none}
.cats a{display:inline-block;border:1px solid #D8D0C4;border-radius:999px;padding:6px 14px;font-size:14px;text-decoration:none;background:#fff}
.cats a[aria-current]{background:#1A1814;color:#fff;border-color:#1A1814}
.visit p,.visit li{font-size:15px;color:#4A4540;margin:0 0 4px}
.visit ul{list-style:none;padding:0;margin:8px 0 0}
footer{margin-top:56px;border-top:1px solid #EDE8DF;padding:24px 0 40px;font-size:14px;color:#6B6560}
@media(max-width:560px){.svc{flex-direction:column}.book{align-self:flex-start}}
</style>`;

/**
 * The category page. `base` is the website's own canonical base (siteBaseUrl). `bookingOn` false hides the Book
 * buttons, as the website hides its own when the salon switched its booking system off.
 */
export function renderCategoryPage(td: TenantData, page: CategoryPage, pages: CategoryPage[], base: string, bookingOn: boolean): string {
  const b = td.business!;
  const name = b.name.trim();
  const cityState = [b.city?.trim(), b.state?.trim()].filter(Boolean).join(", ");
  const where = [b.address?.trim(), cityState, b.postcode?.trim()].filter(Boolean).join(", ");
  const phone = displayPhone(b.phone) || "";
  const tel = toE164(b.phone);
  const home = base.replace(/\/$/, "");
  const url = categoryPageUrl(home, page);

  const prices = page.services.map(priceOf).filter((p) => p > 0);
  const min = prices.length ? Math.min(...prices) : 0, max = prices.length ? Math.max(...prices) : 0;
  const range = prices.length ? (min === max ? `$${min}` : `$${min} to $${max}`) : "";
  const title = `${page.name}${cityState ? ` in ${cityState}` : ""} | ${name}`;
  const description = `${page.name} at ${name}${cityState ? ` in ${cityState}` : ""}: ${page.services.length} services`
    + `${range ? (min === max ? `, ${range}` : ` from ${range}`) : ""}. See prices and times${bookingOn ? " and book online" : ""}.`;

  // Structured data: breadcrumbs, and the salon (same @id as its homepage) with this category's services and prices.
  const business = buildBusinessJsonLd(td, home);
  if (business) {
    delete business.makesOffer;
    delete business.review;
    business.hasOfferCatalog = {
      "@type": "OfferCatalog",
      name: page.name,
      url,
      itemListElement: page.services.map((s) => ({
        "@type": "Offer",
        ...(priceOf(s) > 0 ? { price: priceOf(s), priceCurrency: "USD" } : {}),
        itemOffered: {
          "@type": "Service",
          name: s.name,
          ...(s.description?.trim() ? { description: s.description.trim() } : {}),
        },
      })),
    };
  }
  const crumbs = buildBreadcrumbJsonLd([{ name, url: home }, { name: page.name, url }]);
  const jsonLd = [business, crumbs].filter(Boolean)
    .map((block) => `<script type="application/ld+json">${JSON.stringify(block).replace(/</g, "\\u003c")}</script>`).join("");

  const services = page.services.map((s) => {
    const p = priceOf(s);
    const meta = [p > 0 ? `<b>$${p}</b>` : "", s.duration ? `${s.duration} min` : ""].filter(Boolean).join(" · ");
    return `<div class="svc"><div><h2>${esc(s.name)}</h2>${meta ? `<p class="meta">${meta}</p>` : ""}`
      + `${s.description?.trim() ? `<p class="desc">${esc(s.description.trim())}</p>` : ""}</div>`
      + `${bookingOn ? `<a class="book" href="/?book=${s.id}" rel="nofollow">Book</a>` : ""}</div>`;
  }).join("\n");

  const hours = [...td.hours]
    .sort((x, y) => (x.day_of_week || 7) - (y.day_of_week || 7))
    .filter((h) => DAY_NAMES[h.day_of_week] && (h.is_closed || (h.open_time && h.close_time)))
    .map((h) => `<li>${DAY_NAMES[h.day_of_week]}: ${h.is_closed ? "Closed" : `${formatTime(h.open_time)} – ${formatTime(h.close_time)}`}</li>`)
    .join("");

  const cats = pages.map((c) => `<li><a href="/services/${c.slug}/"${c.slug === page.slug ? ' aria-current="page"' : ""}>${esc(c.name)}</a></li>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="${esc(name)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
${jsonLd}
${STYLE}
</head>
<body>
<header><div class="wrap"><a class="brand" href="/">${esc(name)}</a><a class="home" href="/">Home</a></div></header>
<main class="wrap">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">${esc(name)}</a> / ${esc(page.name)}</nav>
<h1>${esc(page.name)} at ${esc(name)}</h1>
${cityState ? `<p class="where">${esc(cityState)}</p>` : ""}
${services}
<h3>More services</h3>
<ul class="cats">${cats}</ul>
<section class="visit">
<h3>Visit ${esc(name)}</h3>
${where ? `<p>${esc(where)}</p>` : ""}
${phone ? `<p>${tel ? `<a href="tel:${esc(tel)}">${esc(phone)}</a>` : esc(phone)}</p>` : ""}
${hours ? `<ul>${hours}</ul>` : ""}
</section>
</main>
<footer><div class="wrap"><a href="/">${esc(name)} home</a></div></footer>
</body>
</html>`;
}

export function categoryNotFoundHtml(name: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<meta name="robots" content="noindex"><title>Page not found</title></head>`
    + `<body style="font-family:Inter,system-ui,sans-serif;text-align:center;padding:64px 16px;color:#1A1814;background:#FDFCFA">`
    + `<h1 style="font-size:22px">Page not found</h1><p><a href="/">Go to ${esc(name)}</a></p></body></html>`;
}
