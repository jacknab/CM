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

const SITE_ORIGIN = "https://certxa.com";
const APEX_HOSTS = new Set(["certxa.com", "www.certxa.com", "localhost", "127.0.0.1"]);

/** Paths the new app owns. Add a path here (or in the env var) to move it off PHP. */
const DEFAULT_PATHS = [
  "/",
  "/pricing",
  "/features",
  "/booking",
  "/autumn",
  "/about",
  "/contact",
  "/careers",
  "/changelog",
  "/roadmap",
];

/**
 * Old PHP addresses that have no page of their own in the new site, and the
 * new page that covers the subject. A redirect applies only once its target
 * is being served by the new app; until then the PHP page keeps answering.
 * Temporary (302) while the move is being reviewed.
 */
const MOVED: Record<string, string> = {
  "/online-booking": "/booking",
  "/overview": "/features",
  "/salonos": "/features",
  "/checkin-kiosk": "/features",
  "/nail-salon-software": "/features",
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
  "/vietnamese-salon-software": "/",
  "/certxa-vs-glossgenius": "/compare/certxa-vs-glossgenius",
  "/certxa-vs-vagaro": "/compare/certxa-vs-vagaro",
  "/certxa-vs-fresha": "/compare/certxa-vs-fresha",
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
        return res.redirect(302, source);
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
    if (moved) return res.redirect(302, moved);
    if (!owned.has(pagePath)) return next();
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
