/**
 * Salon Marketplace — the certxa.com homepage and consumer directory.
 *
 * Every directory page lives under /salons (plans/salon-directory.md):
 * /salons, /salons/{state}, /salons/{state}/{city}, /salons/{state}/{city}/{salon}
 * and /salons/about. Listings come from state license records
 * (directory_listings), not Google Places.
 *
 * Actual page rendering is real React SSR (artifacts/marketplace's built
 * entry-server.tsx, loaded via lib/marketplaceSsr.ts) — this file is just
 * routing + the sitemaps. Data access lives in lib/salonData.ts, shared
 * with the JSON API in routes/salonApi.ts.
 *
 * Earlier addresses all answer with a 301 to the matching /salons page, or 410 Gone when the
 * salon isn't in the license-based directory: /:slug and /salon/:slug (salon pages until
 * Oct 2026), /listings/:state and /listings/:city--:state (hubs), /nail-salons/... (before that).
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { logger } from "../lib/logger";
import { renderMarketplacePage } from "../lib/marketplaceSsr";
import { requestIp, resolveVisitorCity } from "../lib/geoLookup";
import {
  ensureLoaded, getCityData, getClaimedSalonList, getIndexableHubs, getSalonMap, getSalonRedirectSlug, getStateBySlug, getStateIndex,
  isRetiredSalonSlug, salonPath, statePath, cityPath,
  CERTXA_DOMAIN, SITEMAP_PAGE_SIZE,
} from "../lib/salonData";

function xmlEsc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function serveSsrPage(req: Request, res: Response, opts: { withGeo?: boolean } = {}): Promise<void> {
  try {
    const port = process.env.PORT || "9200";
    const internalApiOrigin = `http://127.0.0.1:${port}`;
    // resolveVisitorCity() reads the in-memory salon/city index synchronously
    // — must be loaded first (a fresh process otherwise throws here on its
    // very first "/" request, before any /api/* handler has had a chance to
    // lazily trigger the load itself).
    if (opts.withGeo) await ensureLoaded();
    // Homepage content is IP-personalized (see lib/geoLookup.ts) — must
    // never be cached publicly/shared, or one visitor's detected city could
    // be served to a visitor elsewhere.
    const geo = opts.withGeo ? resolveVisitorCity(requestIp(req)) : null;
    const page = await renderMarketplacePage(req.originalUrl, internalApiOrigin, geo);
    if (!page) {
      res.status(503).send("Marketplace unavailable — SSR bundle not built. Run `pnpm --filter @workspace/marketplace run build && run build:ssr`.");
      return;
    }
    if (page.redirectTo) {
      res.redirect(page.statusCode === 301 ? 301 : 302, page.redirectTo);
      return;
    }
    res.status(page.statusCode);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", opts.withGeo ? "private, no-cache" : "public, max-age=3600, stale-while-revalidate=86400");
    res.send(page.html);
  } catch (err) {
    logger.error({ err, url: req.originalUrl }, "[salonDirectory] SSR render error");
    res.status(500).send("Internal server error");
  }
}

// ── Sitemap protection ─────────────────────────────────────────────────────────
//
// Goal: let Googlebot/Bingbot crawl freely for SEO, while making it
// impractical for a competitor to bulk-download the full 47k-record list in
// one sitting.

const SITEMAP_WINDOW_MS  = 10 * 60 * 1000; // 10 minutes
const SITEMAP_MAX_REQ    = 10;              // per window, non-bot IPs

interface SitemapRLEntry { count: number; windowStart: number }
const sitemapRateLimits = new Map<string, SitemapRLEntry>();

setInterval(() => {
  const cutoff = Date.now() - SITEMAP_WINDOW_MS;
  for (const [ip, e] of sitemapRateLimits) {
    if (e.windowStart < cutoff) sitemapRateLimits.delete(ip);
  }
}, 15 * 60 * 1000).unref?.();

const KNOWN_BOT_RE = /googlebot|bingbot|yandexbot|duckduckbot|baiduspider|slurp|ia_archiver|applebot|msnbot|certxa-seo-contract/i;

function sitemapRateLimit(req: Request, res: Response, next: () => void): void {
  const ua = req.headers["user-agent"] ?? "";
  if (KNOWN_BOT_RE.test(ua)) { next(); return; }

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

const router = Router();

// ── Sitemap routes ─────────────────────────────────────────────────────────────

// Only claimed listings are indexable (see the isVerified gate in
// artifacts/marketplace/src/entry-server.tsx) — keep this sitemap in sync
// with that page-level robots directive. Restored 2026-09-22 after commit
// 2acebbf5 (2026-09-15) switched this to the full getSalonList(), which
// re-indexed the entire unclaimed ~47-55k record directory; see
// GEO-AUDIT-REPORT.md.
router.get("/sitemap-salons.xml", sitemapRateLimit, async (_req: Request, res: Response) => {
  try {
    await ensureLoaded();
    const list = await getClaimedSalonList();
    const lastmod = new Date().toISOString().slice(0, 10);
    const totalPages = Math.max(1, Math.ceil(list.length / SITEMAP_PAGE_SIZE));

    if (totalPages <= 1) {
      const entries = list.map(r =>
        `  <url><loc>${xmlEsc(`${CERTXA_DOMAIN}${salonPath(r)}`)}</loc><lastmod>${r.lm}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`
      ).join("\n");
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`);
    }

    const sitemapEntries = Array.from({ length: totalPages }, (_, i) =>
      `  <sitemap><loc>${xmlEsc(`${CERTXA_DOMAIN}/sitemap-salons-${i + 1}.xml`)}</loc><lastmod>${lastmod}</lastmod></sitemap>`
    ).join("\n");
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries}\n</sitemapindex>`);
  } catch {
    res.status(503).send("Salon data unavailable");
  }
});

router.get("/sitemap-salons-:page.xml", sitemapRateLimit, async (req: Request, res: Response) => {
  try {
    await ensureLoaded();
    const list = await getClaimedSalonList();
    const page = parseInt(String(req.params.page), 10);
    if (isNaN(page) || page < 1) { res.status(404).send("Not found"); return; }
    const start = (page - 1) * SITEMAP_PAGE_SIZE;
    const slice = list.slice(start, start + SITEMAP_PAGE_SIZE);
    if (slice.length === 0) { res.status(404).send("Not found"); return; }

    const entries = slice.map(r =>
      `  <url><loc>${xmlEsc(`${CERTXA_DOMAIN}${salonPath(r)}`)}</loc><lastmod>${r.lm}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`
    ).join("\n");
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`);
  } catch {
    res.status(503).send("Salon data unavailable");
  }
});

// State and city hub pages (e.g. /listings/arizona, /listings/tucson--arizona)
// are real aggregator pages, each listing many real businesses — this
// sitemap covers only the hub pages themselves; individual salon URLs are
// covered by /sitemap-salons.xml instead (claimed listings only, as of
// 2026-09-22 — see GEO-AUDIT-REPORT.md).
router.get("/sitemap-listings.xml", sitemapRateLimit, async (_req: Request, res: Response) => {
  try {
    await ensureLoaded();
    const lastmod = new Date().toISOString().slice(0, 10);
    // Only hub pages that pass getIndexableHubs() — the same rule that sets
    // their robots tag — so the sitemap never lists a noindex page.
    const hubs = await getIndexableHubs();
    const urls: string[] = hubs.states.size ? [`${CERTXA_DOMAIN}/salons`] : [];
    for (const state of getStateIndex()) {
      if (!hubs.states.has(state.code)) continue;
      urls.push(`${CERTXA_DOMAIN}${statePath(state.code)}`);
      for (const city of state.cities) {
        if (hubs.cities.has(`${state.code}:${city.slug}`)) urls.push(`${CERTXA_DOMAIN}${cityPath(state.code, city.slug)}`);
      }
    }
    const entries = urls.map(u =>
      `  <url><loc>${xmlEsc(u)}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.5</priority></url>`
    ).join("\n");
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`);
  } catch {
    res.status(503).send("Salon data unavailable");
  }
});

// ── Page routes (real React SSR) ─────────────────────────────────────────────

// Homepage reverted to PHP (php/index.php -> php/overview/default.php) on 2026-09-22 — certxa.com/
// goes back to the marketing site. isPhpRoute() hardcodes "/" as a PHP route; not registering a "/"
// handler here is what lets it fall through to phpMiddleware. The rest of the marketplace (listings,
// deals, wallet, /api/marketplace/*) is untouched and still live at its own paths.

// The directory: /salons, /salons/about, /salons/{state}, /salons/{state}/{city},
// /salons/{state}/{city}/{salon}. Which one is decided inside the SSR entry.
router.get("/salons", (req: Request, res: Response) => serveSsrPage(req, res));
router.get("/salons/:a", (req: Request, res: Response) => serveSsrPage(req, res));
router.get("/salons/:a/:b", (req: Request, res: Response) => serveSsrPage(req, res));
router.get("/salons/:a/:b/:c", (req: Request, res: Response) => serveSsrPage(req, res));

// Hub pages' earlier addresses: /listings/{state} and /listings/{city}--{state}.
router.get("/listings/:param", async (req: Request, res: Response, next) => {
  try {
    await ensureLoaded();
    const param = String(req.params.param);
    const sep = param.lastIndexOf("--");
    const state = getStateBySlug(sep === -1 ? param : param.slice(sep + 2));
    if (state && sep !== -1 && getCityData(state.code, param.slice(0, sep))) {
      res.redirect(301, cityPath(state.code, param.slice(0, sep)));
      return;
    }
    if (state) { res.redirect(301, statePath(state.code)); return; }
  } catch (err) {
    logger.warn({ err }, "[salonDirectory] old /listings/ address lookup failed");
    next();
    return;
  }
  gone(res);
});

// Deals browse + detail — real first-class content pages (not a
// directory-scraped slug guess), so they're routed explicitly here rather
// than relying on salonSlugFallbackRouter's single-segment /:slug guess,
// which would never match the two-segment /deals/:id anyway.
router.get("/deals", (req: Request, res: Response) => serveSsrPage(req, res));
router.get("/deals/:id", (req: Request, res: Response) => serveSsrPage(req, res));

// ── The directory's earlier addresses → where those pages are now (301) ───────────
// One with nowhere right to go is answered 410 Gone: removed for good, so search engines drop it sooner than a 404.
function gone(res: Response): void {
  res.status(410).type("html").setHeader("Cache-Control", "public, max-age=86400");
  res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>No longer listed | Certxa</title></head>`
    + `<body><h1>This salon page is no longer listed</h1><p><a href="/">Find a salon on Certxa</a></p></body></html>`);
}
router.get("/salon/:slug", async (req: Request, res: Response, next) => {
  try {
    const target = await currentSalonPath(String(req.params.slug));
    if (target) { res.redirect(301, target); return; }
  } catch (err) {
    logger.warn({ err }, "[salonDirectory] old /salon/ address lookup failed");
    next(); // the lookup itself failed: say nothing permanent
    return;
  }
  gone(res);
});

/** Where an earlier salon address lives now, if the salon is still listed. */
async function currentSalonPath(slug: string): Promise<string | null> {
  await ensureLoaded();
  const rec = getSalonMap().get(slug) ?? getSalonMap().get((await getSalonRedirectSlug(slug)) ?? "");
  return rec ? salonPath(rec) : null;
}
router.get("/nail-salons", (_req: Request, res: Response) => res.redirect(301, "/salons"));
// Only to a page that exists: an old address whose state or city isn't in the directory stays a plain 404
// (a redirect that lands on "not found" reads as a soft 404).
router.get("/nail-salons/:state", async (req: Request, res: Response, next) => {
  try {
    await ensureLoaded();
    const state = getStateBySlug(String(req.params.state));
    if (state) { res.redirect(301, statePath(state.code)); return; }
  } catch (err) {
    logger.warn({ err }, "[salonDirectory] old /nail-salons/ address lookup failed");
    next();
    return;
  }
  gone(res);
});
router.get("/nail-salons/:state/:city", async (req: Request, res: Response, next) => {
  try {
    await ensureLoaded();
    const state = getStateBySlug(String(req.params.state));
    const citySlug = String(req.params.city);
    if (state && getCityData(state.code, citySlug)) { res.redirect(301, cityPath(state.code, citySlug)); return; }
    if (state) { res.redirect(301, statePath(state.code)); return; }
  } catch (err) {
    logger.warn({ err }, "[salonDirectory] old /nail-salons/ address lookup failed");
    next();
    return;
  }
  gone(res);
});

// Guest "My vouchers" wallet — reached only via an emailed magic link.
router.get("/wallet", (req: Request, res: Response) => serveSsrPage(req, res));

export default router;

// ── Flat individual listing page — mounted AFTER phpMiddleware in index.ts ─────
// See the file header comment: every real marketing/app route must get first
// refusal before a scraped salon slug is ever allowed to match "/:slug".

export const salonSlugFallbackRouter = Router();

// Cheap defensive guard: never even attempt this for well-known paths —
// keeps the fallback from doing pointless work on hot, common paths.
const RESERVED_SLUGS = new Set([
  "api", "app", "auth", "admin", "manage", "assets", "uploads", "lib", "mp-assets",
  "login", "signup", "logout", "favicon.ico", "robots.txt", "health", "deals", "wallet",
  "redeem", "book",
]);

salonSlugFallbackRouter.get("/:slug", async (req: Request, res: Response, next) => {
  const slug = String(req.params.slug);
  if (RESERVED_SLUGS.has(slug)) { next(); return; }
  // Salon pages used to live at the root (/:slug). A salon still in the
  // directory moves to its /salons page; one that isn't is gone for good.
  // Anything else isn't a salon address at all: let the request carry on.
  try {
    const target = await currentSalonPath(slug);
    if (target) { res.redirect(301, target); return; }
    if (await isRetiredSalonSlug(slug)) { gone(res); return; }
  } catch (err) {
    logger.warn({ err, slug }, "[salonDirectory] old salon address lookup failed");
  }
  next();
});
