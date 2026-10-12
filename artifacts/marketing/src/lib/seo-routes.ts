/**
 * Auto-synced registry of publicly-crawlable routes. Consumed by the
 * /sitemap.xml handler in src/server/entry.ts.
 *
 * DO NOT add or remove paths by hand. Static paths are mirrored here from
 * src/routes.tsx automatically whenever that file is edited (any manual
 * path edit would be overwritten on the next routes.tsx change). For sync
 * to pick up a route, its `path` must be a literal string starting with "/";
 * template literals and identifier refs are skipped, and dynamic-param routes
 * like "/products/:id" are excluded.
 *
 * The only fields safe to hand-edit are the per-entry metadata below, after a
 * sync:
 * - `priority` (0.0–1.0): Home = 1.0, main sections = 0.8, deep pages = 0.5.
 * - `changefreq` and `lastmod`.
 */

export interface SeoRoute {
  path: string;
  changefreq?:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority?: number;
  lastmod?: string;
}

export const seoRoutes: SeoRoute[] = [
  { path: "/", changefreq: "weekly", priority: 1.0, lastmod: "2026-10-12" },
  { path: "/features", changefreq: "monthly", priority: 0.9, lastmod: "2026-10-12" },
  { path: "/pricing", changefreq: "monthly", priority: 0.9, lastmod: "2026-10-12" },
  { path: "/products", changefreq: "monthly", priority: 0.8 },
  { path: "/contact", changefreq: "monthly", priority: 0.7 },
  { path: "/about", changefreq: "monthly", priority: 0.7 },
  { path: "/booking", changefreq: "monthly", priority: 0.9, lastmod: "2026-10-12" },
  { path: "/autumn", changefreq: "monthly", priority: 0.9, lastmod: "2026-10-12" },
  { path: "/blog", changefreq: "weekly", priority: 0.8 },
  { path: "/careers", changefreq: "weekly", priority: 0.6 },
  { path: "/changelog", changefreq: "weekly", priority: 0.6 },
  { path: "/roadmap", changefreq: "weekly", priority: 0.6 },
  { path: "/privacy", changefreq: "yearly", priority: 0.3 },
  { path: "/terms", changefreq: "yearly", priority: 0.3 },
  { path: "/compare/certxa-vs-glossgenius", changefreq: "monthly", priority: 0.85, lastmod: "2026-10-12" },
  { path: "/compare/certxa-vs-vagaro", changefreq: "monthly", priority: 0.85, lastmod: "2026-10-12" },
  { path: "/compare/certxa-vs-fresha", changefreq: "monthly", priority: 0.85, lastmod: "2026-10-12" },
  { path: "/compare/certxa-vs-square", changefreq: "monthly", priority: 0.85, lastmod: "2026-10-12" },
  // /backlinks/* — internal tools, all excluded from sitemap (noindex/nofollow)
];
