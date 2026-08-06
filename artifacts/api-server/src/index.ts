// Load environment variables.
// Priority (highest → lowest):
//   1. /etc/certxa.env                   (VPS production env file)
//   2. Variables already in process.env  (Replit secrets, PM2 ecosystem, shell exports)
//   3. .env in cwd                       (local dev fallback)
// `/etc/certxa.env` is authoritative in production and should override any older
// values already present in process.env when the server starts.
import dotenv from "dotenv";
import fs from "fs";
if (fs.existsSync("/etc/certxa.env")) {
  dotenv.config({ path: "/etc/certxa.env", override: false });
  dotenv.config({ override: false }); // load .env fallback for any unset vars
  console.log("[env] Loaded /etc/certxa.env");
} else {
  dotenv.config({ override: false }); // loads .env from cwd if present
  const localEnv = fs.existsSync(".env") ? ".env" : "(none found — using process environment only)";
  console.log(`[env] /etc/certxa.env not found — loaded ${localEnv}`);
}
import { getWssHealth } from "./lib/wsHealth";
import { getLastDriftResult } from "./startup/checkSchemaDrift";

// ─── Startup environment validation ────────────────────────────────────────
// Runs before anything else. Hard-exits if required vars are missing so
// a misconfigured deployment fails immediately with a clear message instead
// of silently serving a broken app.
(function validateEnv() {
  // Derive APP_URL from Replit env vars if not explicitly set.
  // REPLIT_DEV_DOMAIN  — present in dev workspace (riker.replit.dev host)
  // REPLIT_DOMAINS     — present in BOTH dev and deployment; use first entry
  //                      as the canonical public hostname in production.
  if (!process.env.APP_URL) {
    const devDomain = process.env.REPLIT_DEV_DOMAIN ?? "";
    const firstReplitDomain = (process.env.REPLIT_DOMAINS ?? "").split(",")[0].trim();
    const domain = devDomain || firstReplitDomain;
    if (domain) process.env.APP_URL = `https://${domain}`;
  }

  const REQUIRED: Record<string, string> = {
    DATABASE_URL:   "PostgreSQL connection string (postgresql://user:pass@host/db)",
    SESSION_SECRET: "Session cookie signing secret — generate with: openssl rand -hex 64",
    APP_URL:        "Public base URL e.g. https://certxa.com",
  };
  const missing = Object.entries(REQUIRED).filter(([k]) => !process.env[k]);
  if (missing.length) {
    console.error("\n[certxa] STARTUP FAILURE — missing required environment variables:");
    missing.forEach(([k, desc]) => console.error(`  MISSING: ${k}\n          ${desc}`));
    console.error("\nFix: add the missing vars to your .env file or PM2 ecosystem config, then restart.\n");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production") {
    const recommendedChecks = [
      {
        key: "CORS_ORIGINS",
        desc: "Comma-separated allowed origins e.g. https://certxa.com",
        present: Boolean(
          process.env.CORS_ORIGINS || process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN
        ),
      },
    ] as const;
    const missingRec = recommendedChecks.filter((item) => !item.present);
    if (missingRec.length) {
      console.warn("\n[certxa] WARNING — missing optional environment variables (some features may be disabled):");
      missingRec.forEach((item) => console.warn(`  MISSING: ${item.key}\n          ${item.desc}`));
      console.warn("");
    }
  }
  // Port validation removed — Replit requires port 5000 for web preview

  // Google token encryption key — warn if absent so ops teams notice on deploy.
  // The system degrades gracefully (plaintext storage) rather than hard-failing,
  // because existing deployments may not yet have the key set.
  if (!process.env.GOOGLE_TOKEN_ENCRYPTION_KEY) {
    console.warn(
      "[certxa] WARNING — GOOGLE_TOKEN_ENCRYPTION_KEY is not set. " +
      "Google OAuth tokens will be stored as plaintext. " +
      "Generate a 32-byte key with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" " +
      "and set it as a secret before going to production.",
    );
  } else {
    const keyBuf = Buffer.from(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY, "hex");
    if (keyBuf.length !== 32) {
      console.error(
        "[certxa] ERROR — GOOGLE_TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). " +
        "Token encryption is disabled until this is corrected.",
      );
    } else {
      console.log("[certxa] Google OAuth token encryption: ACTIVE (AES-256-GCM)");
    }
  }

  // "Continue with Google" login/registration — optional, degrades to a
  // redirect-with-error rather than hard-failing startup when unset.
  const hasGoogleLoginCreds =
    !!(process.env.GOOGLE_LOGIN_CLIENT_ID || process.env.GOOGLE_CLIENT_ID) &&
    !!(process.env.GOOGLE_LOGIN_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET);
  if (!hasGoogleLoginCreds) {
    console.warn(
      "[certxa] WARNING — Google login is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing). " +
      "\"Continue with Google\" will redirect back with an error until these are set.",
    );
  } else if (!process.env.GOOGLE_LOGIN_CALLBACK_URL && !process.env.REPLIT_DEV_DOMAIN) {
    console.warn(
      "[certxa] WARNING — GOOGLE_LOGIN_CALLBACK_URL is not set. Falling back to the certxa.com callback URL, " +
      "which will break Google login on any other domain (including your VPS). Set it to " +
      "https://<your-domain>/api/auth/google/callback and register that exact URI in Google Cloud Console.",
    );
  }
})();

import cors from "cors";
import express, { type Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { setupAuth } from "./auth";
import { subdomainMiddleware } from "./middleware/subdomain";
import { createServer } from "http";
import compression from "compression";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import path from "path";
import { startPhpServer, phpMiddleware, isPhpReady, isPhpRoute, resolvePhpPort } from "./php-proxy";
import { pool } from "./db";
import { resolveSessionStoreId } from "./lib/sessionStore";
import { createRequire } from "module";
// esbuild injects __filename as a real global in CJS output (same as __dirname).
// Using it as the base for createRequire avoids the import.meta.url warning
// that appears when targeting CJS format, and works reliably in both dev (tsx)
// and the minified production bundle.
const _require: NodeRequire = createRequire(
  (globalThis as any).__filename ?? process.argv[1]
);

// Landing page routes that get server-side rendered for SEO
// Note: /hair-salons, /barbershops, /nail-salons are now served by the PHP site
const SSR_ROUTES = new Set([
  "/industries",
  "/handyman",
  "/house-cleaning",
  "/lawn-care",
  "/snow-removal",
  "/dog-walking",
  "/tutoring",
  "/hvac",
  "/plumbing",
  "/electrical",
  "/carpet-cleaning",
  "/pressure-washing",
  "/window-cleaning",
  "/barbers",
  "/nails",
  "/tattoo",
  "/haircuts",
  "/groomers",
  "/estheticians",
  "/ride-service",
]);
// In the esbuild CJS production bundle, __dirname is a real global that points
// to the dist/ directory. Capture it here before any async code runs.
// (globalThis cast avoids TypeScript errors in ESM source mode.)
const _cjsDirname: string | undefined = (globalThis as any).__dirname;

// Replace with your actual DB functions
import { storage } from "./storage";
import { seoPageMiddleware } from "./seo-pages";
import salonDirectoryRouter from "./routes/salonDirectory";

const app = express();
const httpServer = createServer(app);

// --- CORS Setup ---
const rawCorsOrigins =
  process.env.CORS_ORIGINS ||
  process.env.ALLOWED_ORIGINS ||
  process.env.CORS_ORIGIN ||
  "";
const allowAllCorsOrigins = process.env.CORS_ALLOW_ALL === "true";

// Derive the public-facing domain from APP_URL so no domain name is hardcoded.
// In Replit dev, REPLIT_DEV_DOMAIN always reflects the CURRENT session's hostname,
// whereas APP_URL may point to a stale domain from a previous session. Prefer the
// live Replit domain so CORS, CSP, and cookie settings are always correct.
const _replitDevDomain = process.env.REPLIT_DEV_DOMAIN || "";
const _replitDevUrl = _replitDevDomain ? `https://${_replitDevDomain}` : "";
const _appUrl = _replitDevUrl || process.env.APP_URL || "";
const _appDomain = (() => { try { return _appUrl ? new URL(_appUrl).hostname : ""; } catch { return ""; } })();

const defaultCorsOrigins: string[] = [
  ...(_appUrl ? [_appUrl] : []),
  // Also allow the static APP_URL so production custom domains still work
  ...(process.env.APP_URL && process.env.APP_URL !== _appUrl ? [process.env.APP_URL] : []),
  ...(_appDomain ? [`https://www.${_appDomain}`, `https://manage.${_appDomain}`] : []),
];
if (process.env.NODE_ENV !== "production") {
  // Allow additional local-dev ports via DEV_CORS_PORTS env var (comma-separated).
  // The main app is on port 5000 (same-origin), so extra ports are only needed
  // when running a standalone Vite dev server separately.
  const devPorts = (process.env.DEV_CORS_PORTS || "").split(",").map(p => p.trim()).filter(Boolean);
  devPorts.forEach(p => defaultCorsOrigins.push(`http://localhost:${p}`));
}
const allowedCorsOrigins = (rawCorsOrigins ? rawCorsOrigins.split(",") : defaultCorsOrigins)
  .map((origin) => origin.trim())
  .filter(Boolean);

// --- CORS Origin Validation ---
// Runs once at startup to catch misconfigured origins early.
(function validateCorsOrigins() {
  if (allowAllCorsOrigins) return; // CORS_ALLOW_ALL bypasses the list entirely

  for (const origin of allowedCorsOrigins) {
    const tag = `[CORS] Warning: origin "${origin}"`;

    // Must start with https:// (or http:// for localhost/local dev)
    const hasProtocol = origin.startsWith("https://") || origin.startsWith("http://");
    if (!hasProtocol) {
      console.warn(`${tag} is missing a protocol (expected https:// or http://). It will never match a browser Origin header.`);
      continue; // remaining checks need a valid protocol, skip them
    }

    // No trailing slash — browsers send origins without one
    if (origin.endsWith("/")) {
      console.warn(`${tag} has a trailing slash. Remove it; browsers omit the trailing slash in the Origin header.`);
    }

    // No path component — origin is scheme + host (+ optional port) only
    try {
      const url = new URL(origin);
      if (url.pathname !== "/") {
        console.warn(`${tag} contains a path ("${url.pathname}"). Origins must be scheme + host only (no path).`);
      }
      if (url.search) {
        console.warn(`${tag} contains a query string. Origins must be scheme + host only.`);
      }
      if (url.hash) {
        console.warn(`${tag} contains a hash fragment. Origins must be scheme + host only.`);
      }
    } catch {
      console.warn(`${tag} is not a valid URL and will never match.`);
    }

    // Warn on plain http:// for non-localhost origins in production
    if (
      process.env.NODE_ENV === "production" &&
      origin.startsWith("http://") &&
      !origin.includes("localhost") &&
      !origin.includes("127.0.0.1")
    ) {
      console.warn(`${tag} uses http:// in production. Use https:// for all non-local origins.`);
    }
  }
})();

const corsOptions: cors.CorsOptionsDelegate<Request> = (req, callback) => {
  // Trust the first forwarded host when behind nginx; otherwise use direct host.
  const requestHost = String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim()
    .toLowerCase();

  const options: cors.CorsOptions = {
    origin: (origin, originCallback) => {
      if (!origin) return originCallback(null, true);
      if (allowAllCorsOrigins) return originCallback(null, true);
      if (allowedCorsOrigins.includes(origin)) return originCallback(null, true);

      // Allow same-origin requests for custom domains proxied by nginx.
      // Example: Origin=https://4star.shop and Host=4star.shop
      try {
        const originHost = new URL(origin).host.toLowerCase();
        if (requestHost && originHost === requestHost) return originCallback(null, true);
      } catch {
        // Fall through to strict checks below.
      }

      // Allow any subdomain of the configured app domain (manage., booking slugs, etc.)
      if (_appDomain && (origin.endsWith(`.${_appDomain}`) || origin === _appUrl)) {
        return originCallback(null, true);
      }

      return originCallback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  };

  callback(null, options);
};

// app.use(cors) with preflightContinue:false (the default) automatically responds
// to all OPTIONS preflight requests with 204 + correct headers before any other
// middleware runs — no explicit app.options() needed.
app.use(cors(corsOptions));

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
    user?: any; // passport user typing
  }
}

// --- Security Headers ---
app.use((req, res, next) => {
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  // In development, omit X-Frame-Options so the Replit preview iframe can load.
  if (process.env.NODE_ENV === "production") {
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  // In production, explicitly allow wss: connections back to the same host so
  // the dashboard WebSocket works without relying on 'self' covering wss:.
  // (Some browsers do not extend 'self' to cover the ws/wss schemes.)
  const cspConnectSrc = process.env.NODE_ENV !== "production"
    ? "connect-src 'self' https: ws: wss:;"
    : `connect-src 'self' https: wss:${_appUrl ? ` ${_appUrl.replace(/^https?:/, "wss:")}` : ""};`;
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com${_appUrl ? ` ${_appUrl}` : ""}; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://js.stripe.com https://connect-js.stripe.com https://unpkg.com${_appUrl ? ` ${_appUrl}` : ""}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; media-src 'self' https:; ${cspConnectSrc} frame-src 'self' https://js.stripe.com https://connect-js.stripe.com https://hooks.stripe.com https://www.google.com https://maps.google.com${_appUrl ? ` ${_appUrl}` : ""};`
  );
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  next();
});

// --- Middleware ---
// Skip compression for PHP-proxied routes — the PHP built-in server streams
// chunked HTML (e.g. admin-install.php progress steps) and gzip buffering
// prevents that output from reaching the browser until the full response
// is complete, making streaming pages appear frozen.
// Also skip compression for SSE (text/event-stream) routes — gzip buffering
// holds events in the compressor until the buffer fills, which breaks streaming.
const SSE_PATHS = ["/api/intelligence/demo/launch"];
app.use(compression({
  filter: (req: Request, res: Response) => {
    if (isPhpRoute(req.path)) return false;
    if (SSE_PATHS.some((p) => req.path.startsWith(p))) return false;
    return compression.filter(req, res);
  },
}));
app.use(cookieParser());

// --- Stripe Webhook (raw body required for signature verification) ---
// Must be registered BEFORE express.json() consumes the body — uses express.raw() here.
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req: any, res: any) => {
    try {
      const { default: webhookRouter } = await import("./routes/stripeWebhook.js");
      req.url = "/";
      webhookRouter(req, res, () => res.status(404).json({ error: "Not found" }));
    } catch (err: any) {
      console.error("[stripe/webhook] Failed to load handler:", err?.message);
      res.status(500).json({ error: "Webhook handler unavailable" });
    }
  }
);

// --- Stripe Connect Webhook (raw body — separate from SaaS subscription webhook) ---
// Handles connected account events: account.updated, capability.updated,
// account.application.deauthorized, etc.
app.post(
  "/api/stripe/connect-webhook",
  express.raw({ type: "application/json" }),
  async (req: any, res: any) => {
    try {
      const { default: connectWebhookRouter } = await import("./routes/stripeConnectWebhook.js");
      req.url = "/";
      connectWebhookRouter(req, res, () => res.status(404).json({ error: "Not found" }));
    } catch (err: any) {
      console.error("[connect-webhook] Failed to load handler:", err?.message);
      res.status(500).json({ error: "Webhook handler unavailable" });
    }
  }
);

app.use(
  express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
// --- Rate Limiting ---
// Strict limiter for credential endpoints (login, register, password reset, etc.)
// /api/auth/user is intentionally excluded — it is a passive session check called
// on every page load and must not be throttled, or a brief server restart will
// lock every browser tab out for a full minute.
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
  skip: (req) => process.env.NODE_ENV !== "production",
});
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
  skip: (req) => process.env.NODE_ENV !== "production",
});
// Apply strict limiter only to credential-mutating endpoints, NOT /api/auth/user
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/logout", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/reset-password", authLimiter);
app.use("/api/auth/staff-request-otp", authLimiter);
app.use("/api/auth/staff-otp-login", authLimiter);
app.use("/api/auth/google", authLimiter);
app.use("/api/public", publicLimiter);
app.use("/api/book", publicLimiter);
// Prevent log-spamming / disk-filling via the client error reporter.
// 10 reports per IP per minute is more than enough for a real browser error.
const clientErrorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many error reports, please slow down." },
  skip: (req) => process.env.NODE_ENV !== "production",
});
app.use("/api/client-errors", clientErrorLimiter);
// Admin endpoints are already gated behind requireAdmin, but rate-limit at
// the transport layer too so brute-force probing is stopped before auth checks.
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many admin requests, please try again later." },
  skip: (req) => process.env.NODE_ENV !== "production",
});
app.use("/api/admin", adminLimiter);

// ─── Health checks ──────────────────────────────────────────────────────────
// No auth required. /api/health returns full diagnostics; /api/healthz is a
// lightweight alias used by deploy scripts and uptime monitors.
// Both must be registered here — BEFORE setupAuth — so they are always public.
app.get("/api/healthz", (_req, res) => res.json({ status: "ok" }));

// No auth required. Returns 200 when healthy, 503 when degraded.
// Useful for monitoring tools and AI agents diagnosing VPS deployments.
// See VPS_DEPLOYMENT_GUIDE.md §17b for full documentation.
app.get("/api/health", async (_req, res) => {
  const uptimeSeconds = Math.floor(process.uptime());
  const startedAt = new Date(Date.now() - uptimeSeconds * 1000).toISOString();

  // 1. Database — quick SELECT 1 with 2 s timeout
  let dbStatus: "ok" | "error" = "error";
  let dbError: string | undefined;
  try {
    const client = await Promise.race<any>([
      pool.connect(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("connection timeout after 2s")), 2000)
      ),
    ]);
    await client.query("SELECT 1");
    client.release();
    dbStatus = "ok";
  } catch (err: any) {
    dbError = err?.message ?? "unknown error";
  }

  // 2. PHP server
  const phpStatus = isPhpReady() ? "ok" : "starting";

  // 3. Required env vars (presence only — never expose values)
  const envVars = {
    DATABASE_URL:            !!process.env.DATABASE_URL,
    SESSION_SECRET:          !!process.env.SESSION_SECRET,
    APP_URL:                 !!process.env.APP_URL,
    CORS_ORIGINS:            !!process.env.CORS_ORIGINS,
    GOOGLE_CLIENT_ID:        !!process.env.GOOGLE_CLIENT_ID,
    GOOGLE_AUTH_CALLBACK_URL:!!process.env.GOOGLE_AUTH_CALLBACK_URL,
    TWILIO_ACCOUNT_SID:      !!process.env.TWILIO_ACCOUNT_SID,
    MAILGUN_API_KEY:         !!process.env.MAILGUN_API_KEY,
  };

  const requiredPresent = envVars.DATABASE_URL && envVars.SESSION_SECRET && envVars.APP_URL;
  const wssHealth = getWssHealth();
  const healthy = dbStatus === "ok" && requiredPresent;

  res.status(healthy ? 200 : 503).json({
    status:          healthy ? "ok" : "degraded",
    timestamp:       new Date().toISOString(),
    uptime_seconds:  uptimeSeconds,
    started_at:      startedAt,
    node_env:        process.env.NODE_ENV ?? "unknown",
    port:            process.env.PORT ?? "5000",
    app_url:         process.env.APP_URL ?? "(not set)",
    checks: {
      database: { status: dbStatus, ...(dbError ? { error: dbError } : {}) },
      php:      { status: phpStatus, port: resolvePhpPort() },
      websocket: wssHealth,
      env_vars: envVars,
    },
    schema_drift: getLastDriftResult() ?? { checkedAt: null, ok: null, tables: [] },
  });
});

app.use(subdomainMiddleware);

// Root (/) is served by the PHP middleware below — phpMiddleware handles isPhpRoute("/")
// and proxies it to the PHP built-in server running router.php, which loads
// index.php → overview/default.php with canonical set to https://certxa.com/.

// --- Site Assets: serve admin-managed R2 images at /assets/:filename ---
// This intercepts /assets/* requests BEFORE phpMiddleware. If the filename
// has been uploaded via /isadmin/illustration-library → Site Images, we
// redirect the browser straight to the R2 CDN URL. Unknown filenames fall
// through to the PHP proxy (which serves from phpDir/assets/).
//
// Cache: refresh every 60 s to pick up new uploads without a restart.
(async () => {
  const { db: _saDb } = await import("@workspace/db");
  const { sql: _saSql } = await import("drizzle-orm");
  const { initSiteAssetsTable } = await import("./routes/siteAssets.js");
  await initSiteAssetsTable();

  let _saCache = new Map<string, string>();
  let _saExpiry = 0;

  async function _getSiteAssetUrl(filename: string): Promise<string | null> {
    const now = Date.now();
    if (now > _saExpiry) {
      try {
        const rows = await _saDb.execute(_saSql`SELECT key, r2_url FROM site_assets`);
        _saCache = new Map((rows.rows as Array<{ key: string; r2_url: string }>).map(r => [r.key, r.r2_url]));
        _saExpiry = now + 60_000;
      } catch { /* table may not exist on fresh DB — skip silently */ }
    }
    return _saCache.get(filename) ?? null;
  }

  app.use("/assets/", async (req: Request, res: Response, next: NextFunction) => {
    if (/[a-f0-9]{8}\./.test(req.path)) return next(); // Vite hashed asset — skip DB
    const filename = req.path.replace(/^\/+/, "");
    const r2Url = await _getSiteAssetUrl(filename);
    if (r2Url) return res.redirect(302, r2Url);
    return next();
  });
})();

// --- Sitemaps ---
// Delegate all sitemap XML routes to the PHP router/files so a single source of
// truth is used (php/sitemap.xml, php/sitemap-pages.xml, php/blog/sitemap.xml.php).
app.get("/sitemap.xml", (_req: Request, _res: Response, next: NextFunction) => next());
app.get("/sitemap-pages.xml", (_req: Request, _res: Response, next: NextFunction) => next());
app.get("/blog/sitemap.xml", (_req: Request, _res: Response, next: NextFunction) => next());

// --- Certxa Owner App Download ---
app.get("/app", (req: Request, res: Response) => {
  const ua = req.headers["user-agent"] || "";
  const isAndroid = /android/i.test(ua);
  const APK_URL =
    process.env.OWNER_APK_URL ||
    "https://expo.dev/artifacts/eas/SJzOZ7YVLQtGOPsRojrwnMtTiwpNcTlDRwnB2_FdPAo.apk";

  if (isAndroid) {
    return res.redirect(302, APK_URL);
  }

  const pageUrl = "https://certxa.com/app";
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(pageUrl)}&size=200x200&color=4ade80&bgcolor=050C18&margin=12`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Certxa Owner App</title>
  <meta name="description" content="Download the Certxa Owner app for Android to manage your salon on the go.">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #050C18;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem 1.5rem;
    }
    .card {
      background: #0d1a2d;
      border: 1px solid #1e3a5f;
      border-radius: 1.5rem;
      padding: 3rem 2.5rem;
      max-width: 480px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 60px rgba(0,0,0,0.5);
    }
    .logo {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.6rem;
      margin-bottom: 2rem;
    }
    .logo-icon {
      width: 44px; height: 44px;
      background: #4ade80;
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.4rem; font-weight: 900; color: #050C18;
    }
    .logo-name { font-size: 1.5rem; font-weight: 700; color: #f8fafc; letter-spacing: -0.02em; }
    h1 { font-size: 1.75rem; font-weight: 800; color: #f8fafc; margin-bottom: 0.75rem; letter-spacing: -0.02em; }
    .subtitle { color: #94a3b8; font-size: 1rem; line-height: 1.6; margin-bottom: 2rem; }
    .badges {
      display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;
      margin-bottom: 2rem;
    }
    .badge {
      font-size: 0.75rem; font-weight: 600;
      padding: 0.3rem 0.8rem; border-radius: 99px;
      background: rgba(74,222,128,0.12); color: #4ade80; border: 1px solid rgba(74,222,128,0.25);
    }
    .download-btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 0.6rem;
      background: #4ade80; color: #050C18;
      font-size: 1.05rem; font-weight: 700;
      padding: 0.9rem 2.2rem; border-radius: 0.75rem;
      text-decoration: none; border: none; cursor: pointer;
      transition: background 0.15s, transform 0.1s;
      width: 100%; margin-bottom: 1rem;
    }
    .download-btn:hover { background: #86efac; transform: translateY(-1px); }
    .download-btn svg { width: 22px; height: 22px; }
    .size-note { color: #64748b; font-size: 0.8rem; margin-bottom: 2rem; }
    .divider { border: none; border-top: 1px solid #1e3a5f; margin: 1.5rem 0; }
    .qr-section { }
    .qr-label { font-size: 0.85rem; color: #94a3b8; margin-bottom: 1rem; }
    .qr-img {
      width: 160px; height: 160px; border-radius: 0.75rem;
      border: 2px solid #1e3a5f;
    }
    .footer { margin-top: 2.5rem; color: #475569; font-size: 0.8rem; }
    .footer a { color: #4ade80; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <div class="logo-icon">C</div>
      <span class="logo-name">Certxa</span>
    </div>

    <h1>Owner App</h1>
    <p class="subtitle">Manage your salon, process payments with Stripe Terminal, and print receipts via Bluetooth — all from your Android device.</p>

    <div class="badges">
      <span class="badge">POS &amp; Card Reader</span>
      <span class="badge">Bluetooth Printing</span>
      <span class="badge">Dashboard</span>
      <span class="badge">Android</span>
    </div>

    <a class="download-btn" href="${APK_URL}" download="certxa-owner.apk">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85a.637.637 0 0 0-.83.22l-1.88 3.24a11.463 11.463 0 0 0-8.94 0L5.65 5.67a.643.643 0 0 0-.87-.2c-.28.18-.37.54-.19.83L6.4 9.48A10.78 10.78 0 0 0 1 18h22a10.78 10.78 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z"/></svg>
      Download for Android
    </a>
    <p class="size-note">APK · ~95 MB · Android 8.0+</p>

    <hr class="divider">

    <div class="qr-section">
      <p class="qr-label">Scan with your Android phone to download</p>
      <img class="qr-img" src="${qrUrl}" alt="QR code to download Certxa Owner app" loading="lazy">
    </div>
  </div>

  <p class="footer">
    <a href="https://certxa.com">certxa.com</a> &nbsp;·&nbsp; Need help? <a href="mailto:support@certxa.com">support@certxa.com</a>
  </p>
</body>
</html>`);
});

// --- Salon Business Directory (/salon/:slug, /salon/sitemap.xml) ---
// Must be BEFORE phpMiddleware so these Node-rendered pages are never
// accidentally proxied to the PHP built-in server.
app.use(salonDirectoryRouter);

// --- PHP Site Proxy (certxa.com root pages, template catalog, assets) ---
// Must run before auth setup so PHP pages (/, /hair-salons, etc.) are
// served directly without needing a session.
app.use(phpMiddleware);

// --- Friendly redirects for common booking-app paths ---
app.get("/login", (_req, res) => res.redirect(301, "/auth"));
app.get("/signup", (_req, res) => res.redirect(301, "/auth"));

// --- Logging Helper ---
export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      log(logLine);
    }
  });

  next();
});

// --- Passport Google OAuth Setup ---
// Moved to server/passport.ts

// ─── Stripe Connectivity Check ──────────────────────────────────────────────
// Called once after the server starts listening. Non-blocking — never exits
// the process. Uses native fetch (Node 20+) to avoid a cold Stripe SDK import.
async function checkStripeConnectivity() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.warn("[Stripe] ⚠️  STRIPE_SECRET_KEY is not set — billing features will be disabled.");
    return;
  }
  try {
    const resp = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (resp.ok) {
      console.log("[Stripe] ✓ Connected successfully — billing features active.");
    } else {
      const body = await resp.json() as any;
      console.error(`[Stripe] ✗ Key rejected — ${(body as any)?.error?.message ?? resp.statusText}`);
    }
  } catch (err: any) {
    console.error(`[Stripe] ✗ Connection failed — ${err?.message ?? String(err)}`);
  }
}

// Ensures the shared TWILIO_PHONE_NUMBER has its SMS webhook pointed at our
// inbound handler. Runs once at startup — idempotent, never throws.
async function repairTwilioSmsWebhook() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const phoneNum   = process.env.TWILIO_PHONE_NUMBER;
  const appUrl     = (process.env.APP_URL ?? "").replace(/\/$/, "");

  if (!accountSid || !authToken || !phoneNum || !appUrl) return; // not configured

  const smsWebhookUrl = `${appUrl}/api/webhooks/twilio/incoming`;

  try {
    const twilio = (await import("twilio")).default;
    const client = twilio(accountSid, authToken);

    const numbers = await client.incomingPhoneNumbers.list({ phoneNumber: phoneNum, limit: 1 });
    if (!numbers.length) {
      console.warn(`[TwilioRepair] ⚠️  ${phoneNum} not found in Twilio account — skipping SMS webhook repair`);
      return;
    }

    const existing = numbers[0];
    if (existing.smsUrl === smsWebhookUrl) {
      console.log(`[TwilioRepair] ✓ SMS webhook already correct for ${phoneNum}`);
      return;
    }

    await client.incomingPhoneNumbers(existing.sid).update({
      smsUrl:    smsWebhookUrl,
      smsMethod: "POST",
    });

    console.log(`[TwilioRepair] ✓ SMS webhook repaired for ${phoneNum} → ${smsWebhookUrl} (was: "${existing.smsUrl || "(unset)"}")`);
  } catch (err: any) {
    const msg = String(err?.message ?? err ?? "Unknown Twilio error");
    // Bad credentials are common in partially configured environments.
    // Treat as non-fatal warning with clear remediation, not a scary error.
    if (/authenticate|auth token|account sid|20003/i.test(msg)) {
      console.warn("[TwilioRepair] Skipped webhook repair: Twilio credentials were rejected (non-fatal). Verify TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN.");
      return;
    }
    console.error(`[TwilioRepair] ✗ Failed to repair SMS webhook: ${msg}`);
  }
}

// Ensures any Messaging Service attached to TWILIO_PHONE_NUMBER also routes
// inbound replies to our webhook. This is required when outbound SMS are sent
// via messaging_service_sid (Twilio can ignore number-level smsUrl otherwise).
async function repairTwilioMessagingServiceInboundWebhook() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const phoneNum   = process.env.TWILIO_PHONE_NUMBER;
  const appUrl     = (process.env.APP_URL ?? "").replace(/\/$/, "");

  if (!accountSid || !authToken || !phoneNum || !appUrl) return;

  const inboundWebhookUrl = `${appUrl}/api/webhooks/twilio/incoming`;

  try {
    const twilio = (await import("twilio")).default;
    const client = twilio(accountSid, authToken);

    const services = await client.messaging.v1.services.list({ limit: 50 });
    let touched = 0;

    for (const svc of services) {
      try {
        const numbers = await client.messaging.v1.services(svc.sid).phoneNumbers.list({ limit: 200 });
        const hasPhone = numbers.some((n: any) => n.phoneNumber === phoneNum);
        if (!hasPhone) continue;

        if (svc.inboundRequestUrl === inboundWebhookUrl && svc.useInboundWebhookOnNumber === true) {
          console.log(`[TwilioRepair] ✓ Messaging Service inbound webhook already correct for ${svc.sid}`);
          continue;
        }

        await client.messaging.v1.services(svc.sid).update({
          inboundRequestUrl: inboundWebhookUrl,
          inboundMethod: "POST",
          useInboundWebhookOnNumber: true,
        });
        touched++;
        console.log(`[TwilioRepair] ✓ Messaging Service webhook repaired for ${svc.sid} → ${inboundWebhookUrl}`);
      } catch (svcErr: any) {
        console.warn(`[TwilioRepair] Messaging Service check/update failed for ${svc.sid}: ${svcErr?.message ?? svcErr}`);
      }
    }

    if (touched === 0) {
      console.log("[TwilioRepair] Messaging Service scan complete — no changes needed");
    }
  } catch (err: any) {
    const msg = String(err?.message ?? err ?? "Unknown Twilio error");
    if (/authenticate|auth token|account sid|20003/i.test(msg)) {
      console.warn("[TwilioRepair] Skipped Messaging Service repair: Twilio credentials were rejected (non-fatal).");
      return;
    }
    console.error(`[TwilioRepair] ✗ Failed Messaging Service webhook repair: ${msg}`);
  }
}

// --- Main Async Boot ---
(async () => {
  // Run any pending SQL migrations before anything else starts.
  // This keeps the VPS database in sync on every server restart/deploy.
  try {
    const { runMigrations } = await import("./startup/runMigrations");
    await runMigrations();
  } catch (err: any) {
    console.error("[migrations] FATAL: migration failed on startup:", err.message);
    process.exit(1);
  }

  // Non-fatal schema drift check — warns if the live DB is missing columns
  // that the Drizzle schema expects. Catches VPS/Replit sync gaps early.
  try {
    const { checkSchemaDrift } = await import("./startup/checkSchemaDrift");
    await checkSchemaDrift();
  } catch (err: any) {
    console.warn("[schema-drift] Check failed (non-fatal):", err.message);
  }

  // Start the PHP server for the certxa.com marketing/catalog pages
  startPhpServer();

  setupAuth(app);

  // ── POST /api/auth/mobile-token ───────────────────────────────────────────
  // Issues a short-lived bearer token for the native Certxa Terminal app.
  // MUST be registered after setupAuth() so session middleware is attached.
  // Called from within the auth WebView (credentials:include so the session
  // cookie is present), then stored in SecureStore and used for Stripe Terminal
  // API calls via Authorization: Bearer <token>.
  app.post("/api/auth/mobile-token", async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any)?.userId;
      const staffId = (req.session as any)?.staffId;

      if (!userId && !staffId) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }

      let storeId: number | null = null;
      let resolvedUserId: string;

      if (userId) {
        resolvedUserId = String(userId);
        const row = await pool.query<{ id: number }>(
          "SELECT id FROM locations WHERE user_id = $1 LIMIT 1",
          [userId]
        );
        storeId = row.rows[0]?.id ?? null;
      } else {
        resolvedUserId = `staff:${staffId}`;
        const row = await pool.query<{ store_id: number }>(
          "SELECT store_id FROM staff WHERE id = $1 LIMIT 1",
          [staffId]
        );
        storeId = row.rows[0]?.store_id ?? null;
      }

      if (!storeId) {
        res.status(400).json({ error: "No store found for this account" });
        return;
      }

      const { createMobileToken } = await import("./lib/mobileTokens.js");
      const token = createMobileToken(resolvedUserId!, storeId);
      res.json({ token, storeId });
    } catch (err: any) {
      console.error("[mobile-token]", err?.message);
      res.status(500).json({ error: "Internal error" });
    }
  });

  // Serve uploaded files (staff avatars, etc.) statically — both dev and prod.
  // Anchor to _cjsDirname (__dirname) so the path is immune to PM2 cwd differences.
  // routes.ts uses the same anchor logic in resolveUploadsRoot() so the write and
  // serve paths are always the same regardless of which directory PM2 starts from.
  const uploadsRoot = (() => {
    const explicit = String(process.env.UPLOADS_DIR ?? "").trim();
    if (explicit) return path.resolve(explicit);
    // _cjsDirname = __dirname = artifacts/api-server/dist/ in prod CJS bundle
    // Dev tsx: __dirname = artifacts/api-server/src/
    // Either way ../uploads resolves to artifacts/api-server/uploads/
    if (_cjsDirname) return path.resolve(_cjsDirname, "../uploads");
    if (fs.existsSync(path.resolve(process.cwd(), "artifacts/api-server"))) {
      return path.resolve(process.cwd(), "artifacts/api-server/uploads");
    }
    return path.resolve(process.cwd(), "uploads");
  })();
  fs.mkdirSync(path.resolve(uploadsRoot, "avatars"), { recursive: true });
  fs.mkdirSync(path.resolve(uploadsRoot, "images"), { recursive: true });
  log(`[uploads] serving static files from: ${uploadsRoot}`);

  // Ensure the data/ dir exists so the Google quota guard can persist state to disk.
  // (Without this, saveState() silently fails and cooldowns are lost on restart.)
  fs.mkdirSync(path.resolve(process.cwd(), "data"), { recursive: true });

  // Serve self-hosted third-party libraries (e.g. Leaflet) — same-origin avoids CSP issues.
  const libRoot = path.resolve(process.cwd(), "../../public/lib");
  if (fs.existsSync(libRoot)) {
    app.use("/lib", express.static(libRoot, {
      maxAge: "7d",
      immutable: false,
    }));
  }

  app.use("/uploads", express.static(uploadsRoot, {
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "public, max-age=86400");
      // Allow browsers to load avatars/images cross-origin (required when the
      // frontend and API server live on different origins or are proxied separately).
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  }));

  // In production, serve static assets BEFORE registering API routes so that
  // /assets/* requests are always handled by express.static and never reach
  // any route handler (which would return JSON and trigger MIME-type errors).
  if (process.env.NODE_ENV === "production") {
    // Resolve relative to the compiled file's directory (_cjsDirname = dist/).
    // This is immune to PM2 setting a different working directory than the project root.
    // Falls back to process.cwd()/dist/public for non-bundle environments.
    const distPath = _cjsDirname
      ? path.resolve(_cjsDirname, "public")
      : path.resolve(process.cwd(), "dist/public");
    if (!fs.existsSync(distPath)) {
      console.error(`Build directory not found: ${distPath}. Run 'npm run build' first.`);
    } else {
      // Serve pre-compressed .gz files transparently when the client supports it.
      app.use((req: Request, res: Response, next: NextFunction) => {
        const acceptEncoding = req.headers["accept-encoding"] || "";
        if (
          acceptEncoding.includes("gzip") &&
          req.path.match(/\.(js|css|html|json|svg|ico|woff2?)$/)
        ) {
          const gzPath = path.resolve(distPath, req.path.slice(1) + ".gz");
          if (fs.existsSync(gzPath)) {
            res.setHeader("Content-Encoding", "gzip");
            // Set correct Content-Type based on original extension
            if (req.path.endsWith(".js")) res.setHeader("Content-Type", "application/javascript");
            else if (req.path.endsWith(".css")) res.setHeader("Content-Type", "text/css");
            req.url = req.url + ".gz";
          }
        }
        next();
      });

      app.use(express.static(distPath, {
        setHeaders(res, filePath) {
          // Ensure correct MIME types for assets
          if (filePath.endsWith(".js") || filePath.endsWith(".js.gz")) {
            res.setHeader("Content-Type", "application/javascript");
          } else if (filePath.endsWith(".css") || filePath.endsWith(".css.gz")) {
            res.setHeader("Content-Type", "text/css");
          }
          // Cache hashed assets for 1 year, everything else no-cache
          if (filePath.includes("/assets/")) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          } else {
            res.setHeader("Cache-Control", "no-cache");
          }
        },
      }));
    }
  }

  // ── Stripe Connect OAuth callback (PUBLIC — must be before authenticated routes) ──
  // Stripe redirects the browser here after the salon owner authorises the connection.
  // It is a cross-site redirect from stripe.com, so the user's session cookie may not
  // be present (SameSite=None only works when the request is sent by JS, not a top-level
  // navigation in some browser configs). Security is provided by the one-time `code` and
  // the signed `state` parameter — NOT by session auth.
  // Registered here, before registerRoutes(), so it wins over the authenticated
  // /api/payments router that is mounted inside registerRoutes().
  app.get("/api/payments/stripe/callback", async (req: Request, res: Response) => {
    const { code, state, error } = req.query as Record<string, string>;
    const baseUrl = process.env.APP_URL ?? `${req.protocol}://${req.get("host")}`;
    const settingsUrl = `${baseUrl}/manage/payment-settings`;

    if (error) {
      console.warn("[stripeConnect/callback] OAuth error from Stripe:", error);
      return res.redirect(`${settingsUrl}?connect_error=${encodeURIComponent(error)}`);
    }
    if (!code || !state) {
      console.warn("[stripeConnect/callback] Missing code or state — params:", JSON.stringify(req.query));
      return res.redirect(`${settingsUrl}?connect_error=missing_params`);
    }

    let storeId: number;
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
      storeId = Number(decoded.storeId);
      if (!storeId) throw new Error("invalid storeId in state");
    } catch {
      return res.redirect(`${settingsUrl}?connect_error=invalid_state`);
    }

    try {
      const { exchangeOAuthCode, syncAccountFromStripe } = await import("./lib/stripeConnect.js");
      const { stripeAccountId } = await exchangeOAuthCode(code);
      await syncAccountFromStripe(storeId, stripeAccountId);
      console.log(`[stripeConnect/callback] Connected account ${stripeAccountId} → storeId=${storeId}`);
      return res.redirect(`${settingsUrl}?connect_success=1`);
    } catch (err: any) {
      console.error("[stripeConnect/callback] Exchange failed:", err?.message);
      return res.redirect(`${settingsUrl}?connect_error=${encodeURIComponent(err?.message ?? "oauth_failed")}`);
    }
  });

  // ── API Error Logger ──────────────────────────────────────────────────────
  // Wraps res.json() for store-scoped API routes: any 4xx/5xx response is
  // logged fire-and-forget to store_activity_events (event_type='api_error')
  // so support agents can filter to "API Errors" in the Activity feed.
  const API_ERROR_SKIP = [
    "/api/auth/", "/api/support/", "/api/webhooks/",
    "/api/public/", "/api/stripe/", "/api/live-chat/", "/api/session",
  ];
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api/")) return next();
    if (API_ERROR_SKIP.some(p => req.path.startsWith(p))) return next();
    const origJson = res.json.bind(res);
    (res as any).json = function (body: unknown) {
      const status = res.statusCode;
      if (status >= 400) {
        void (async () => {
          try {
            const storeId = await resolveSessionStoreId(req);
            if (!storeId) return;
            const b = body as Record<string, unknown> | null;
            const msg = (typeof b?.message === "string" ? b.message
              : typeof b?.error === "string" ? b.error
              : `HTTP ${status}`).slice(0, 500);
            const { classifyApiError } = await import("./lib/apiErrorCodes");
            const errorEntry = classifyApiError(req.method, req.path, status, msg);
            await pool.query(
              `INSERT INTO store_activity_events (store_id, event_type, message, metadata)
               VALUES ($1, $2, $3, $4)`,
              [storeId, "api_error", msg, JSON.stringify({
                method: req.method,
                path: req.path,
                status,
                ...(errorEntry ? { errorCode: errorEntry.code, errorNumeric: errorEntry.numeric } : {}),
                ...(Object.keys(req.query).length ? { query: req.query } : {}),
              })]
            );
          } catch { /* never let logging break anything */ }
        })();
      }
      return origJson(body);
    };
    next();
  });

  // ── Public Booking Error Logger ────────────────────────────────────────────
  // The main API error logger above skips /api/public/ entirely (no session).
  // This separate middleware captures failures on the three customer-facing
  // public booking paths: /book, /availability, and /available-days.
  // Store is resolved from the :slug path segment via a lightweight DB lookup.
  // All other /api/public/ routes (kiosk, queue, plan-prices, etc.) are left
  // untouched to avoid logging noise from anonymous data-fetch calls.
  const PUBLIC_BOOKING_PATTERN = /^\/api\/public\/store\/([^/]+)\/(book|availability|available-days|services)$/;

  app.use((req: Request, res: Response, next: NextFunction) => {
    const match = PUBLIC_BOOKING_PATTERN.exec(req.path);
    if (!match) return next();

    const slug = match[1];
    const origJson = res.json.bind(res);
    (res as any).json = function (body: unknown) {
      const status = res.statusCode;
      if (status >= 400) {
        void (async () => {
          try {
            const storeRow = await pool.query(
              `SELECT id FROM stores WHERE slug = $1 LIMIT 1`,
              [slug]
            );
            const storeId = storeRow.rows[0]?.id;
            if (!storeId) return;

            const b = body as Record<string, unknown> | null;
            const msg = (typeof b?.message === "string" ? b.message
              : typeof b?.error === "string" ? b.error
              : `HTTP ${status}`).slice(0, 500);

            const { classifyApiError } = await import("./lib/apiErrorCodes");
            const errorEntry = classifyApiError(req.method, req.path, status, msg);

            await pool.query(
              `INSERT INTO store_activity_events (store_id, event_type, message, metadata)
               VALUES ($1, $2, $3, $4)`,
              [storeId, "api_error", msg, JSON.stringify({
                method: req.method,
                path: req.path,
                status,
                source: "public_booking",
                ...(errorEntry ? { errorCode: errorEntry.code, errorNumeric: errorEntry.numeric } : {}),
              })]
            );
          } catch { /* never let logging break anything */ }
        })();
      }
      return origJson(body);
    };
    next();
  });

  // Register all API routes AFTER static assets so /assets/* never hits a route.
  await registerRoutes(httpServer, app);

  // Real-time service status WebSocket stream at /ws/admin-status
  const { setupStatusStream } = await import("./routes/systemStatus");
  setupStatusStream(httpServer);

  // Translations CRUD routes
  const { default: translationsRouter } = await import("./routes/translations");
  app.use("/api/translations", translationsRouter);

  // Ensure entity_translations table exists
  const { ensureTranslationsTable } = await import("./lib/translationService");
  await ensureTranslationsTable().catch((e: unknown) => console.warn("[Translations] Table init skipped:", e));

  // Live chat REST routes + WebSocket stream at /ws/live-chat
  const { setupLiveChatWS, liveChatRouter } = await import("./routes/liveChat");
  app.use(liveChatRouter);
  setupLiveChatWS(httpServer);

  // Real-time owner dashboard WebSocket stream at /ws/dashboard
  const { setupDashboardWS } = await import("./routes/dashboardWS");
  setupDashboardWS(httpServer);

  // Public contact form → creates support ticket (channel='WEB')
  const { contactRouter } = await import("./routes/contact");
  app.use(contactRouter);

  // Google Review Management Engine routes (Phase 2)
  const { default: googleReviewEngineRouter } = await import("./routes/googleReviewEngine");
  app.use("/api/google-business/review-engine", googleReviewEngineRouter);

  // Onboarding / setup progress tracking
  const { default: setupRouter } = await import("./routes/setup");
  app.use("/api/setup", setupRouter);

  // Service Import: AI-powered menu import from photos/PDF
  const { default: serviceImportRouter, ensureServiceImportTable } = await import("./routes/serviceImport");
  app.use("/api/service-import", serviceImportRouter);
  await ensureServiceImportTable().catch((e: unknown) =>
    console.warn("[ServiceImport] Table init skipped:", (e as any)?.message)
  );

  // One-time startup repair: fix any users who own a store but were left with
  // the "staff" role by legacy code paths.
  const { repairOwnerRoles } = await import("./startup/repairOwnerRoles");
  await repairOwnerRoles();

  // One-time migration: seed sms_allowance from legacy sms_tokens for existing stores
  const { migrateSmsAllowance } = await import("./startup/migrateSmsAllowance");
  await migrateSmsAllowance();

  // Repair: resync platform_credits for any store where it is NULL but has ledger entries.
  // This fixes accounts where wallet top-ups silently failed due to NULL + amount = NULL in Postgres.
  try {
    const { pool: pgPool } = await import("./db");
    const repairResult = await pgPool.query(`
      UPDATE locations l
      SET platform_credits = COALESCE(
        (SELECT SUM(amount) FROM platform_credit_transactions WHERE store_id = l.id),
        0
      )
      WHERE l.platform_credits IS NULL
    `);
    if (repairResult.rowCount && repairResult.rowCount > 0) {
      console.log(`[platform-credits-repair] Synced platform_credits for ${repairResult.rowCount} store(s) from ledger.`);
    }
  } catch (err: any) {
    console.warn("[platform-credits-repair] Non-fatal:", err.message);
  }

  // Startup backfill: ensure every store_settings row has staffPortalEnabled explicitly set.
  // The auth checks treat a missing key as "enabled", but we want it stored explicitly
  // so the value is unambiguous in the DB and visible to any future direct SQL queries.
  try {
    const { pool: pgBackfillPool } = await import("./db");
    const backfillResult = await pgBackfillPool.query(`
      UPDATE store_settings
      SET preferences = jsonb_set(
        CASE
          WHEN preferences::jsonb -> 'features' IS NULL
            THEN jsonb_set(preferences::jsonb, '{features}', '{}'::jsonb, true)
          ELSE preferences::jsonb
        END,
        '{features,staffPortalEnabled}',
        'true'::jsonb,
        true
      )::text
      WHERE (preferences::jsonb -> 'features' ->> 'staffPortalEnabled') IS NULL
    `);
    if (backfillResult.rowCount && backfillResult.rowCount > 0) {
      console.log(`[staff-portal-backfill] Set staffPortalEnabled=true on ${backfillResult.rowCount} store_settings row(s).`);
    }
  } catch (err: any) {
    console.warn("[staff-portal-backfill] Non-fatal:", err.message);
  }

  const { deduplicateClientPhones } = await import("./startup/deduplicateClientPhones");
  await deduplicateClientPhones();

  // Register the "Nail Salon — Lacquer" website template into wb_templates
  const { seedNailSalonLacquerTemplate } = await import("./startup/seedNailSalonLacquerTemplate");
  await seedNailSalonLacquerTemplate();

  // Register the "Nail Salon — Bloom" website template into wb_templates
  const { seedNailSalonBloomTemplate } = await import("./startup/seedNailSalonBloomTemplate");
  await seedNailSalonBloomTemplate();

  // Start the 60-day free trial expiration scheduler (runs every hour)
  const { startTrialExpirationScheduler } = await import("./services/trial-expiration");
  startTrialExpirationScheduler();

  // Start weekly revenue digest email scheduler (runs every Monday at 9am)
  const { startWeeklyDigestScheduler } = await import("./intelligence/weekly-digest-email");
  startWeeklyDigestScheduler();

  // Start lapsed client re-engagement scheduler (checks hourly, sends at 10am)
  const { startLapsedClientScheduler } = await import("./lapsed-client-scheduler");
  startLapsedClientScheduler();

  // Start scheduled campaign dispatcher (checks every 5 minutes for due campaigns)
  const { startCampaignScheduler } = await import("./services/campaign-scheduler");
  startCampaignScheduler();

  // Start platform lifecycle email journeys (signup, trial, billing, and account status).
  const { startPlatformEmailScheduler } = await import("./services/platform-email-engine");
  startPlatformEmailScheduler();

  // Auto clock-out: clocks out staff at each store's configured close time (checks every 5 min)
  const { startAutoClockOutScheduler } = await import("./services/auto-clock-out");
  startAutoClockOutScheduler();

  // Demo cleanup: removes stale appointments from the AI Receptionist demo store (storeId=2) every 5 min
  const { startDemoCleanupScheduler } = await import("./services/demo-cleanup");
  startDemoCleanupScheduler();

  // Payroll scheduler: auto-creates draft payout runs at period close + auto-approves after review window
  const { startPayrollScheduler } = await import("./services/payroll-scheduler");
  startPayrollScheduler();

  // Payout reminder: SMS nudge to contractors who haven't completed bank setup
  const { startPayoutReminderScheduler } = await import("./services/payout-reminder-scheduler");
  startPayoutReminderScheduler();

  // Google postcard verification: day-7 and day-10 owner reminders via existing SMS/email providers.
  const { startGbpOnboardingReminderScheduler } = await import("./services/gbp-onboarding-reminders");
  startGbpOnboardingReminderScheduler();

  // Email → Ticket sync: polls support@certxa.com IMAP inbox and creates/threads support tickets
  const { startEmailTicketSync } = await import("./services/emailTicketSync");
  startEmailTicketSync();

  // Auto-close tickets: runs every hour, closes tickets with no customer response in 7 days
  const { runAutoCloseTickets } = await import("./routes/support");
  setInterval(() => runAutoCloseTickets(), 60 * 60 * 1000);
  // Run once at startup (after a short delay so DB is ready)
  setTimeout(() => runAutoCloseTickets(), 30_000);

  // Subscription sync: daily Stripe reconciliation — keeps account_status in sync even if webhooks are missed
  const { startSubscriptionSyncScheduler } = await import("./services/subscription-sync");
  startSubscriptionSyncScheduler();

  // GBP Optimization Engine: daily sweep of all connected Google Business Profiles —
  // auto-syncs safe fields (hours, description, booking URL, services) and logs category recommendations.
  const { startGBPOptimizationScheduler } = await import("./services/gbpOptimizationWorker");
  startGBPOptimizationScheduler();

  // Google Review Management Engine dispatcher (Phase 2):
  // Checks every 5 minutes for scheduled/approved responses that are due to publish.
  const { startReviewEngineDispatcher } = await import("./services/google-review-engine");
  startReviewEngineDispatcher();

  // GBP Post Automation Engine dispatcher (Phase 3.1):
  // Checks every 5 minutes for approved/scheduled posts that are due to publish.
  const { startPostEngineDispatcher } = await import("./services/gbpPostEngine");
  startPostEngineDispatcher();

  // GBP Photo Automation Engine dispatcher (Phase 3.2):
  // Checks every 5 minutes for pending photos that are due to upload.
  const { startPhotoEngineDispatcher, reQueueOrphanGalleryPhotos } = await import("./services/gbpPhotoEngine");
  startPhotoEngineDispatcher();
  // Re-queue any gallery photos uploaded before migration 0129 fixed the
  // source_type CHECK constraint (which excluded 'gallery_photo', silently
  // blocking all gallery photo inserts into gbp_photo_queue).
  reQueueOrphanGalleryPhotos().catch((e) =>
    console.warn("[GBP Photos] Re-queue sweep failed:", e?.message),
  );

  // Staff Work Photos router (Phase 3.2A):
  // Staff upload completed-service photos that feed directly into the GBP Photo Engine.
  try {
    const { default: staffWorkPhotosRouter } = await import("./routes/staffWorkPhotos.js");
    app.use("/api", staffWorkPhotosRouter);
  } catch (err: any) {
    console.error("[WorkPhotos] Failed to load router:", err?.message);
  }

  // Smart Booking Reassignment Engine: every 5 min, prevents scheduled appointments
  // from becoming late when a technician's active walk-in/service runs long.
  const { startSmartBookingEngine } = await import("./services/smart-booking-reassignment");
  startSmartBookingEngine();

  // Redis availability cache worker (no-ops gracefully if REDIS_URL is not set)
  const { startAvailabilityWorker } = await import("./workers/availabilityWorker");
  startAvailabilityWorker();

  // Precomputed slot cache worker — builds store:{storeId}:slots:{date} keys
  const { startSlotBuilderWorker } = await import("./workers/slotBuilder");
  startSlotBuilderWorker();

  // Warm up precomputed slot cache for all stores on startup (fire-and-forget)
  try {
    const { db: _db } = await import("./db");
    const { locations: _locations } = await import("@shared/schema");
    const { enqueueSlotRebuild: _enqueue, buildDateRange: _range } = await import("./lib/slotQueue");
    const stores = await _db.select({ id: _locations.id }).from(_locations);
    const dates = _range(14);
    for (const store of stores) {
      void _enqueue(store.id, dates, "initial_warmup");
    }
    if (stores.length > 0) {
      console.log(`[SlotBuilder] Queued warmup for ${stores.length} store(s) — ${dates.length} dates each`);
    }
  } catch (err: any) {
    console.warn("[SlotBuilder] Warmup enqueue failed:", err.message);
  }

  // SEO static HTML pages — must run BEFORE Vite/SSR so HTML files win over React rendering.
  app.use(seoPageMiddleware);

  // Development: use Vite middleware. Production: SSR for landing pages + SPA catch-all.
  if (process.env.NODE_ENV === "production") {
    const distPath = _cjsDirname
      ? path.resolve(_cjsDirname, "public")
      : path.resolve(process.cwd(), "dist/public");

    if (fs.existsSync(distPath)) {
      const ssrBundlePath = _cjsDirname
        ? path.resolve(_cjsDirname, "server/entry-server.cjs")
        : path.resolve(process.cwd(), "dist/server/entry-server.cjs");

      const indexHtmlPath = path.resolve(distPath, "index.html");

      // Load SSR render function and template once at startup (not per-request)
      let ssrRender: ((url: string) => { html: string }) | null = null;
      let indexTemplate: string | null = null;

      if (fs.existsSync(ssrBundlePath) && fs.existsSync(indexHtmlPath)) {
        try {
          ssrRender = _require(ssrBundlePath).render;
          indexTemplate = fs.readFileSync(indexHtmlPath, "utf-8");
          log("SSR bundle loaded — landing pages will be server-rendered");
        } catch (err) {
          console.warn("[SSR] Failed to load SSR bundle, falling back to SPA-only:", err);
        }
      } else {
        log("SSR bundle not found — run npm run build to enable SSR in production");
      }

      // SSR handler — runs before the SPA catch-all
      app.use((req: Request, res: Response, next: NextFunction) => {
        if (req.path.startsWith("/api/")) return next();
        if (!SSR_ROUTES.has(req.path)) return next();
        if (!ssrRender || !indexTemplate) return next();

        try {
          const { html: appHtml } = ssrRender(req.originalUrl);
          const rendered = indexTemplate.replace("<!--ssr-outlet-->", appHtml);
          res
            .status(200)
            .set({ "Content-Type": "text/html", "Cache-Control": "no-cache" })
            .end(rendered);
        } catch (err) {
          console.warn(`[SSR] Render failed for ${req.path}, falling back to SPA:`, err);
          next();
        }
      });

      // SPA catch-all — handles all non-SSR, non-API routes
      app.use((req: Request, res: Response, next: NextFunction) => {
        if (req.path.startsWith("/api/")) return next();
        // Let missing /uploads/* fall through to a real 404 — never serve index.html
        // for image requests (broken <img> shows a blank icon, not a silent HTML response).
        if (req.path.startsWith("/uploads/")) return next();
        // Never cache index.html so users always pick up the latest hashed
        // asset filenames after a redeploy.
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.sendFile(indexHtmlPath);
      });
    }
  } else {
    // Dev mode: the frontend is served by its own Vite process (port 5000).
    // Proxy non-API routes to the Vite dev server so that links inside PHP
    // marketing pages (e.g. "Start Free Trial" → /auth) work correctly, and
    // so the API server's extra port (24491) also serves the SPA without
    // causing redirect loops.
    const viteTarget = process.env.BOOKING_APP_URL || "http://localhost:5000";
    const { createProxyMiddleware: createViteProxy } = await import("http-proxy-middleware");
    const viteProxy = createViteProxy({
      target: viteTarget,
      changeOrigin: true,
      ws: true,
    });

    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api/")) return next();
      if (req.path.startsWith("/uploads/")) return next();
      if (req.path.startsWith("/media-stream")) return next();
      if (req.path.startsWith("/ws")) return next();
      // The website builder is served by express.static in production; in dev it
      // is proxied from the Vite server (port 5000) → here → do NOT proxy back
      // to Vite or we create an infinite loop.
      if (req.path.startsWith("/website-builder")) return next();
      // Proxy SPA routes to the Vite dev server (avoids redirect loops)
      return (viteProxy as any)(req, res, next);
    });

    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      void checkStripeConnectivity();
      void repairTwilioSmsWebhook();
      void repairTwilioMessagingServiceInboundWebhook();
    },
  );

  // If the Replit [[ports]] config has a stale entry pointing to a different
  // local port (EXTRA_PORT), also listen there so the proxy can reach us.
  const extraPort = parseInt(process.env.EXTRA_PORT || "0", 10);
  if (extraPort > 0 && extraPort !== port) {
    const { createServer: createHttpServer } = await import("http");
    const extraServer = createHttpServer(app);
    extraServer.listen({ port: extraPort, host: "0.0.0.0" }, () => {
      log(`also listening on extra port ${extraPort} (proxy alias)`);
    });
  }
})();
