/**
 * New marketing site (artifacts/marketing) — a server-rendered React app that
 * is replacing the PHP pages one path at a time.
 *
 * Only the paths listed in MARKETING_SITE_PATHS are rendered from it; every
 * other path falls through to whatever served it before (PHP, the booking
 * app). Any failure here also falls through, so a broken build can never take
 * a page down — the PHP version answers instead. Set MARKETING_SITE=off to
 * switch the whole thing off.
 *
 *   /_site/*                    the app's own JS, CSS and public files
 *   /airo-assets/images/<slot>  its images, copied into artifacts/marketing/media
 */
import express, { type NextFunction, type Request, type Response, type Router } from "express";
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

const SITE_ORIGIN = "https://certxa.com";
const APEX_HOSTS = new Set(["certxa.com", "www.certxa.com", "localhost", "127.0.0.1"]);

/** Paths the new app owns. Add a path here (or in the env var) to move it off PHP. */
const DEFAULT_PATHS = ["/about", "/careers", "/changelog", "/roadmap"];

/**
 * Where a link in the new design should point while its own page has not
 * been moved over yet: the page that covers the same subject today.
 */
const INTERIM_LINKS: Record<string, string> = {
  "/booking": "/online-booking",
  "/products": "/card-reader-pos",
  "/features": "/nail-salon-software",
};

type Render = (url: string, siteOrigin?: string) => Promise<{
  html: string;
  head: string;
  status: number;
  redirect?: string;
}>;

function resolveSiteDir(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "..", "marketing"),
    path.resolve(process.cwd(), "artifacts", "marketing"),
  ];
  return candidates.find((dir) => fs.existsSync(path.join(dir, "dist", "client", "index.html"))) ?? null;
}

export function marketingPaths(): Set<string> {
  const raw = process.env.MARKETING_SITE_PATHS;
  const list = raw ? raw.split(",").map((p) => p.trim()).filter(Boolean) : DEFAULT_PATHS;
  return new Set(list);
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Points links to pages this app does not own yet at their current equivalents. */
export function applyInterimLinks(html: string, owned: Set<string>): string {
  return html.replace(/href="(\/[a-z0-9\-/]*)"/g, (match, href: string) => {
    const target = INTERIM_LINKS[href];
    return target && !owned.has(href) ? `href="${target}"` : match;
  });
}

export function createMarketingSite(): Router {
  const router = express.Router();
  const siteDir = resolveSiteDir();
  if (process.env.MARKETING_SITE === "off" || !siteDir) {
    if (!siteDir) console.warn("[marketing-site] build not found; PHP serves every page");
    return router;
  }

  const clientDir = path.join(siteDir, "dist", "client");
  const mediaDir = path.join(siteDir, "media");
  const owned = marketingPaths();

  let template: string;
  let media: Record<string, { file: string; type: string }> = {};
  try {
    template = fs.readFileSync(path.join(clientDir, "index.html"), "utf-8");
    if (!template.includes("<!--app-head-->") || !template.includes("<!--app-html-->")) {
      throw new Error("index.html is missing its render markers");
    }
    const manifestPath = path.join(mediaDir, "manifest.json");
    if (fs.existsSync(manifestPath)) media = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  } catch (err: any) {
    console.error("[marketing-site] disabled:", err.message);
    return router;
  }

  let render: Render | null = null;
  import(pathToFileURL(path.join(siteDir, "dist", "render", "entry-server.mjs")).href).then(
    (mod) => {
      render = mod.render as Render;
      console.log(`[marketing-site] serving ${[...owned].join(", ")}`);
    },
    (err) => console.error("[marketing-site] renderer failed to load; PHP serves every page:", err?.message),
  );

  router.use(
    "/_site",
    express.static(clientDir, {
      index: false,
      fallthrough: false,
      setHeaders(res, filePath) {
        res.set(
          "Cache-Control",
          filePath.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "public, max-age=3600",
        );
      },
    }),
  );

  router.get(/^\/airo-assets\/images\/(.+)$/, (req: Request, res: Response, next: NextFunction) => {
    const entry = media[String(req.params[0]).replace(/\/+$/, "")];
    if (!entry) return next();
    res.set("Cache-Control", "public, max-age=86400");
    res.type(entry.type).sendFile(path.join(mediaDir, entry.file));
  });

  router.get(/.*/, async (req: Request, res: Response, next: NextFunction) => {
    const pagePath = req.path.replace(/\/+$/, "") || "/";
    if (!render || !owned.has(pagePath) || !APEX_HOSTS.has(req.hostname)) return next();
    try {
      const result = await render(pagePath, SITE_ORIGIN);
      if (result.redirect || !result.html) return next();
      const head =
        `<link rel="canonical" href="${escapeAttr(SITE_ORIGIN + pagePath)}">` +
        result.head +
        // Sections fade in on scroll and are rendered hidden until the script
        // runs; without JavaScript they must simply be visible.
        `<noscript><style>[style*="opacity:0"]{opacity:1!important;transform:none!important}</style></noscript>` +
        `<script>window.__SITE_PATHS__=${JSON.stringify([...owned])}</script>`;
      const page = template
        .replace("<!--app-head-->", () => head)
        .replace("<!--app-html-->", () => applyInterimLinks(result.html, owned));
      res
        .status(result.status)
        .set("Content-Type", "text/html; charset=utf-8")
        .set("Cache-Control", "no-cache")
        .send(page);
    } catch (err: any) {
      console.error(`[marketing-site] render failed for ${pagePath}, falling back:`, err?.stack || err);
      next();
    }
  });

  return router;
}
