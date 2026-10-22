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
import rateLimit from "express-rate-limit";
import { sendEmail } from "./mail";
import { pingIndexNow } from "./lib/indexNow";

const SITE_ORIGIN = "https://certxa.com";
const APEX_HOSTS = new Set(["certxa.com", "www.certxa.com", "localhost", "127.0.0.1"]);

/** Paths the new app owns. Add a path here (or in the env var) to move it off PHP. */
const DEFAULT_PATHS = [
  "/",
  "/pricing",
  "/features",
  "/booking",
  "/autumn",
  "/products",
  "/cart",
  "/order-confirmed",
  "/compare/certxa-vs-glossgenius",
  "/compare/certxa-vs-vagaro",
  "/compare/certxa-vs-fresha",
  "/compare/certxa-vs-square",
  "/about",
  "/contact",
  "/careers",
  "/changelog",
  "/roadmap",
  "/vietnamese-nail-salon-software",
  "/vi/phan-mem-tiem-nail",
];

/**
 * Old PHP addresses that have no page of their own in the new site, and the
 * new page that covers the subject. A redirect applies only once its target
 * is being served by the new app; until then the PHP page keeps answering.
 * Permanent (301): the move is settled, so search engines move the old
 * address's standing to the new page.
 */
const MOVED: Record<string, string> = {
  "/online-booking": "/booking",
  "/overview": "/",
  "/salonos": "/features",
  "/checkin-kiosk": "/features",
  "/nail-salon-software": "/vietnamese-nail-salon-software",
  "/barbershop-software": "/features",
  "/hair-salon-software": "/features",
  "/client-management": "/features",
  "/client-notifications": "/features",
  "/client-reviews": "/features",
  "/get-more-reviews": "/features",
  "/google-business-profile": "/features",
  "/reserve-with-google": "/features",
  "/revenue-intelligence": "/features",
  "/staff-management": "/features",
  "/payment-processing": "/features",
  "/custom-website-builder": "/features",
  "/tools": "/features",
  "/payments": "/pricing",
  "/solo-professionals": "/pricing",
  "/booth-renters": "/pricing",
  "/best-free-salon-booking-system": "/pricing",
  "/card-reader-pos": "/products",
  "/case-studies": "/about",
  "/vietnamese-salon-software": "/vietnamese-nail-salon-software",
  "/certxa-vs-glossgenius": "/compare/certxa-vs-glossgenius",
  "/certxa-vs-vagaro": "/compare/certxa-vs-vagaro",
  "/certxa-vs-fresha": "/compare/certxa-vs-fresha",
  "/certxa-vs-gocheckin": "/pricing",
};

/** Hosts a stock-image slot may be redirected to (where the design's photos are hosted). */
const IMAGE_HOSTS = new Set(["img1.wsimg.com", "isteam.wsimg.com"]);

/**
 * Where a link in the new design should point while its own page has not
 * been moved over yet: the page that covers the same subject today.
 */
const INTERIM_LINKS: Record<string, string> = {
  "/booking": "/online-booking",
  "/products": "/features",
  "/features": "/nail-salon-software",
  "/compare/certxa-vs-glossgenius": "/certxa-vs-glossgenius",
  "/compare/certxa-vs-vagaro": "/certxa-vs-vagaro",
  "/compare/certxa-vs-fresha": "/certxa-vs-fresha",
  "/compare/certxa-vs-square": "/pricing",
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

const SUPPORT_INBOX = "support@certxa.com";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface ContactMessage {
  name: string;
  email: string;
  topic: string;
  message: string;
}

/** Checks a contact form submission; returns the cleaned message or the reason it is refused. */
export function readContactMessage(body: unknown): ContactMessage | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const name = text(b.name, 120);
  const email = text(b.email, 200);
  const topic = text(b.topic, 120);
  const message = text(b.message, 5000);
  if (!name) return { error: "Please enter your name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Please enter a valid email address." };
  if (!message) return { error: "Please enter a message." };
  return { name, email, topic, message };
}

/** Where an old address should send the visitor, or null to leave it alone. */
export function movedTo(pagePath: string, owned: Set<string>): string | null {
  const target = MOVED[pagePath];
  return target && owned.has(target) && !owned.has(pagePath) ? target : null;
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

  // Contact form on the marketing site: emailed to the support inbox.
  router.post(
    "/api/contact-form",
    rateLimit({
      windowMs: 10 * 60 * 1000,
      max: 5,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, error: "Too many messages. Please try again in a few minutes." },
    }),
    express.json({ limit: "20kb" }),
    async (req: Request, res: Response) => {
      const msg = readContactMessage(req.body);
      if ("error" in msg) return res.status(400).json({ success: false, error: msg.error });
      const html =
        `<p><strong>From:</strong> ${escapeHtml(msg.name)} &lt;${escapeHtml(msg.email)}&gt;</p>` +
        `<p><strong>Topic:</strong> ${escapeHtml(msg.topic || "Not chosen")}</p>` +
        `<p style="white-space:pre-wrap">${escapeHtml(msg.message)}</p>`;
      const text = `From: ${msg.name} <${msg.email}>\nTopic: ${msg.topic || "Not chosen"}\n\n${msg.message}`;
      try {
        const sent = await sendEmail(0, SUPPORT_INBOX, `Contact form: ${msg.topic || "message"} — ${msg.name}`, html, text);
        if (!sent.success) throw new Error(sent.error || "mail provider refused the message");
        console.log(`[marketing-site] contact form message from ${msg.email} sent to ${SUPPORT_INBOX}`);
        res.json({ success: true });
      } catch (err: any) {
        console.error("[marketing-site] contact form email failed:", err?.message);
        res.status(502).json({
          success: false,
          error: `We could not send your message. Please email ${SUPPORT_INBOX} instead.`,
        });
      }
    },
  );
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
  let slots: Record<string, { currentUrl?: string }> = {};
  try {
    template = fs.readFileSync(path.join(clientDir, "index.html"), "utf-8");
    if (!template.includes("<!--app-head-->") || !template.includes("<!--app-html-->")) {
      throw new Error("index.html is missing its render markers");
    }
    const manifestPath = path.join(mediaDir, "manifest.json");
    if (fs.existsSync(manifestPath)) media = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const slotsPath = path.join(siteDir, "airo-media.json");
    if (fs.existsSync(slotsPath)) slots = JSON.parse(fs.readFileSync(slotsPath, "utf-8"));
  } catch (err: any) {
    console.error("[marketing-site] disabled:", err.message);
    return router;
  }

  pingChangedPages(clientDir, owned);

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
    const slot = String(req.params[0]).replace(/\/+$/, "");
    const entry = media[slot];
    if (entry) {
      res.set("Cache-Control", "public, max-age=86400");
      return res.type(entry.type).sendFile(path.join(mediaDir, entry.file));
    }
    // Stock photographs are not copied here; send the browser to where the
    // design hosts them, as the original site does.
    const source = slots[slot]?.currentUrl;
    try {
      if (source && IMAGE_HOSTS.has(new URL(source).hostname)) {
        res.set("Cache-Control", "public, max-age=3600");
        // Stock photos (img1.wsimg.com/isteam/getty/…) are sent at most 1280 px wide: GoDaddy resizes them on
        // its side, a fraction of the original's size. Logos and anything already resized are sent as they are.
        const sized = /^https:\/\/img1\.wsimg\.com\/isteam\/getty\/[^/]+$/.test(source) ? `${source}/:/rs=w:1280,m` : source;
        return res.redirect(302, sized);
      }
    } catch {
      /* not an absolute URL */
    }
    next();
  });

  router.get(/.*/, async (req: Request, res: Response, next: NextFunction) => {
    const pagePath = req.path.replace(/\/+$/, "") || "/";
    if (!render || !APEX_HOSTS.has(req.hostname)) return next();
    const moved = movedTo(pagePath, owned);
    if (moved) return res.redirect(301, moved);
    if (!owned.has(pagePath)) return next();
    try {
      // /pricing and the home page show the admin's plans; they go into the page itself so the prices are in its HTML.
      // The home page's pricing cards read the same plans.
      const plans = pagePath === "/pricing" || pagePath === "/" ? await pricingPlans() : null;
      // Left in place between requests (only /pricing reads it, and the plans are the same for everyone), so two
      // pages rendering at once can't take it away from each other.
      if (plans) (globalThis as any).__CERTXA_PRICING_PLANS__ = plans;
      const result = await render(pagePath, SITE_ORIGIN);
      if (result.redirect || !result.html) return next();
      // Pages set their own canonical tag; add one only for a page that doesn't,
      // because two canonical tags on a page make search engines ignore both.
      const canonical = /rel="canonical"/.test(result.head)
        ? ""
        : `<link rel="canonical" href="${escapeAttr(SITE_ORIGIN + pagePath)}">`;
      const head =
        canonical +
        // Bing Webmaster Tools verification; same tag as php/includes/header.php.
        `<meta name="msvalidate.01" content="261005E6A952E6B004A337B7532827B4">` +
        result.head +
        // Sections fade in on scroll and are rendered hidden until the script
        // runs; without JavaScript they must simply be visible.
        `<noscript><style>[style*="opacity:0"]{opacity:1!important;transform:none!important}</style></noscript>` +
        `<script>window.__SITE_PATHS__=${JSON.stringify([...owned])}</script>` +
        (plans ? `<script>window.__CERTXA_PRICING_PLANS__=${JSON.stringify(plans).replace(/</g, "\\u003c")}</script>` : "");
      const page = template
        .replace("<!--app-head-->", () => head)
        .replace("<!--app-html-->", () => applyInterimLinks(result.html, owned))
        // Pages under /vi/ are written in Vietnamese: say so on the page itself, for search engines and screen readers.
        .replace(/<html lang="en"/, pagePath.startsWith("/vi/") ? '<html lang="vi"' : '<html lang="en"');
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

/** The public plan list (/api/public/pricing-plans), kept for five minutes. Null when it can't be had. */
let plansCache: { at: number; plans: unknown[] } | null = null;
async function pricingPlans(): Promise<unknown[] | null> {
  if (plansCache && Date.now() - plansCache.at < 300_000) return plansCache.plans;
  try {
    const res = await fetch(`http://127.0.0.1:${process.env.PORT || "5000"}/api/public/pricing-plans`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return plansCache?.plans ?? null;
    const plans = await res.json();
    if (!Array.isArray(plans)) return plansCache?.plans ?? null;
    plansCache = { at: Date.now(), plans };
    return plans;
  } catch {
    return plansCache?.plans ?? null;
  }
}

/**
 * Tells Bing (via IndexNow) about every marketing page once per new build, so
 * changed pages are recrawled without waiting for the crawler's own schedule.
 * Only one cluster worker sends it, and a marker file stops a plain restart
 * from sending it again.
 */
function pingChangedPages(clientDir: string, owned: Set<string>): void {
  if ((process.env.NODE_APP_INSTANCE ?? "0") !== "0") return;
  try {
    const built = String(fs.statSync(path.join(clientDir, "index.html")).mtimeMs);
    const marker = path.join(clientDir, "..", ".indexnow-pinged");
    if (fs.existsSync(marker) && fs.readFileSync(marker, "utf-8") === built) return;
    fs.writeFileSync(marker, built);
    void pingIndexNow([...owned].map((p) => SITE_ORIGIN + (p === "/" ? "/" : p)));
  } catch (err: any) {
    console.warn("[marketing-site] IndexNow ping skipped:", err?.message);
  }
}
