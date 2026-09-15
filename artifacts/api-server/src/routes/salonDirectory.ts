/**
 * Salon Marketplace — the certxa.com homepage and consumer directory.
 *
 * URL structure matches Vagaro's (vagaro.com/listings/{city}--{state},
 * vagaro.com/{business-slug}): flat and root-level, not tucked under a
 * feature-specific prefix — this *is* the main site now, not a bolted-on
 * directory. `export default router` (mounted BEFORE phpMiddleware) owns
 * "/" and "/listings/*"; `salonSlugFallbackRouter` (mounted AFTER
 * phpMiddleware) owns the flat "/:slug" individual listing page — see the
 * comments at both mount points in index.ts for why the split matters:
 * every real marketing page must get first refusal before a scraped salon
 * slug is ever allowed to match.
 *
 * Actual page rendering is real React SSR (artifacts/marketplace's built
 * entry-server.tsx, loaded via lib/marketplaceSsr.ts) — this file is just
 * routing + the sitemaps. Data access lives in lib/salonData.ts, shared
 * with the JSON API in routes/salonApi.ts.
 *
 * Routes:
 *   /                                    — homepage: national search/map
 *   /listings/:stateSlug                 — state browse page
 *   /listings/:citySlug--:stateSlug      — city page, paginated
 *   /sitemap-salons.xml                  — sitemap (index if >50k records)
 *   /sitemap-salons-:page.xml            — paginated sitemap slice
 *   /sitemap-listings.xml                — sitemap of state/city hub pages
 *   /:slug                               — individual salon page (fallback router)
 *
 * No redirects or references to the earlier /nail-salons and /salon/:slug
 * build of this feature are kept — this is a clean cutover, not a migration
 * of those URLs. Those old paths now 404 like any other unknown path.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { logger } from "../lib/logger";
import { renderMarketplacePage } from "../lib/marketplaceSsr";
import { requestIp, resolveVisitorCity } from "../lib/geoLookup";
import {
  ensureLoaded, getSalonList, getStateIndex,
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

router.get("/sitemap-salons.xml", sitemapRateLimit, async (_req: Request, res: Response) => {
  try {
    await ensureLoaded();
    const list = getSalonList();
    const lastmod = new Date().toISOString().slice(0, 10);
    const totalPages = Math.max(1, Math.ceil(list.length / SITEMAP_PAGE_SIZE));

    if (totalPages <= 1) {
      const entries = list.map(r =>
        `  <url><loc>${xmlEsc(`${CERTXA_DOMAIN}/${r.s}`)}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`
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
    const list = getSalonList();
    const page = parseInt(String(req.params.page), 10);
    if (isNaN(page) || page < 1) { res.status(404).send("Not found"); return; }
    const start = (page - 1) * SITEMAP_PAGE_SIZE;
    const slice = list.slice(start, start + SITEMAP_PAGE_SIZE);
    if (slice.length === 0) { res.status(404).send("Not found"); return; }

    const lastmod = new Date().toISOString().slice(0, 10);
    const entries = slice.map(r =>
      `  <url><loc>${xmlEsc(`${CERTXA_DOMAIN}/${r.s}`)}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`
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
// covered by /sitemap-salons.xml instead (all real records, not just
// claimed listings — see GEO-AUDIT-REPORT.md).
router.get("/sitemap-listings.xml", sitemapRateLimit, async (_req: Request, res: Response) => {
  try {
    await ensureLoaded();
    const lastmod = new Date().toISOString().slice(0, 10);
    const urls: string[] = [`${CERTXA_DOMAIN}/`];
    for (const state of getStateIndex()) {
      urls.push(`${CERTXA_DOMAIN}/listings/${state.slug}`);
      for (const city of state.cities) {
        urls.push(`${CERTXA_DOMAIN}/listings/${city.slug}--${state.slug}`);
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

// Homepage — isPhpRoute() hardcodes "/" as a PHP route, but this router is
// mounted before phpMiddleware, so Express matches this exact "/" handler
// first and the marketplace becomes the actual certxa.com homepage.
router.get("/", (req: Request, res: Response) => serveSsrPage(req, res, { withGeo: true }));

// State + city hub pages, Vagaro-style: /listings/california (state) and
// /listings/los-angeles--california (city) — disambiguated inside the SSR
// entry itself by whether the param contains "--".
router.get("/listings/:param", (req: Request, res: Response) => serveSsrPage(req, res));

export default router;

// ── Flat individual listing page — mounted AFTER phpMiddleware in index.ts ─────
// See the file header comment: every real marketing/app route must get first
// refusal before a scraped salon slug is ever allowed to match "/:slug".

export const salonSlugFallbackRouter = Router();

// Cheap defensive guard: never even attempt this for well-known paths —
// keeps the fallback from doing pointless work on hot, common paths.
const RESERVED_SLUGS = new Set([
  "api", "app", "auth", "admin", "manage", "assets", "uploads", "lib", "mp-assets",
  "login", "signup", "logout", "favicon.ico", "robots.txt", "health",
]);

salonSlugFallbackRouter.get("/:slug", async (req: Request, res: Response, next) => {
  const slug = String(req.params.slug);
  if (RESERVED_SLUGS.has(slug)) { next(); return; }
  try {
    const port = process.env.PORT || "9200";
    const page = await renderMarketplacePage(req.originalUrl, `http://127.0.0.1:${port}`);
    if (!page) { next(); return; }
    // Not a real salon slug — let the request continue exactly as it would
    // have before this router existed (tenant SPA / final 404), rather than
    // claiming every unmatched single-segment path as "salon not found".
    if (page.statusCode === 404) { next(); return; }
    if (page.redirectTo) {
      res.redirect(page.statusCode === 301 ? 301 : 302, page.redirectTo);
      return;
    }
    res.status(page.statusCode);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    res.send(page.html);
  } catch (err) {
    logger.error({ err, slug }, "[salonDirectory] SSR fallback render error");
    next();
  }
});
