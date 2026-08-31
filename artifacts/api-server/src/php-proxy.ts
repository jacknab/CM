import { createProxyMiddleware } from "http-proxy-middleware";
import { spawn, type ChildProcess } from "child_process";
import net from "net";
import path from "path";
import fs from "fs";
import type { Request, Response, NextFunction } from "express";
import { IS_SCHEDULER_INSTANCE } from "./lib/clusterInfo";

// esbuild injects __dirname into CJS bundles pointing to dist/.
// In ESM dev (tsx), it is undefined — process.cwd() is the project root instead.
const _cjsDir: string | undefined = (globalThis as any).__dirname;

// Directory where Vite serves its static public assets (client/public/).
// Files here take priority over the PHP site for the same URL path.
const CLIENT_PUBLIC_DIR = path.resolve(process.cwd(), "client", "public");

// In production, Vite writes hashed assets (index-XXXX.css, etc.) to dist/public.
// We check here too so PHP never intercepts /assets/index-HASH.css|js files.
const DIST_PUBLIC_DIR = _cjsDir
  ? path.resolve(_cjsDir, "public")                 // prod: dist/public/
  : path.resolve(process.cwd(), "dist", "public");  // dev fallback

// Derive a PHP port from this process's own HTTP port rather than a fixed
// default. Multiple copies of this server run concurrently in dev (the
// "Start application" workflow on :9200 and the artifact-managed
// "artifacts/api-server: API Server" workflow on :8080 both boot this same
// code). A shared hardcoded PHP_PORT meant whichever instance started last
// would evict the other's PHP child via evictStalePhpProcess() and never
// restart it, permanently breaking PHP-served pages for the loser. Offsetting
// by the HTTP port keeps each instance's PHP server on its own port.
// Any other module that needs the PHP port (health checks, status routes)
// MUST import resolvePhpPort() rather than recompute this — see systemStatus.ts.
export function resolvePhpPort(): number {
  return parseInt(
    process.env.PHP_PORT || String(parseInt(process.env.PORT || "5000", 10) + 4000),
    10,
  );
}

const PHP_PORT = resolvePhpPort();
const PHP_HOST = process.env.PHP_HOST || "127.0.0.1";
const PHP_BASE_URL = `http://${PHP_HOST}:${PHP_PORT}`;

let phpProcess: ChildProcess | null = null;
let phpReady = false;
let phpReadyPromise: Promise<void> | null = null;

function shouldSuppressPhpStdout(msg: string): boolean {
  // Routine built-in PHP server connection chatter can be very noisy in PM2 logs.
  // Keep startup/readiness and real warnings/errors visible.
  return (
    /\bAccepted\b/.test(msg) ||
    /\bClosing\b/.test(msg) ||
    /Closed without sending a request; it was probably just an unused speculative preconnection/i.test(msg)
  );
}

// Resolve the php/ directory safely in both ESM (dev) and esbuild CJS (prod).
// PHP_DIR env var takes priority so a separate php repo (e.g. /apps/CM/php)
// can be used without moving files.  Falls back through a candidate list so
// deploys work even if PHP_DIR was never set in the environment.
function resolvePhpDir(): string {
  if (process.env.PHP_DIR) return path.resolve(process.env.PHP_DIR);

  const candidates: string[] = [];

  if (_cjsDir) {
    // prod esbuild: dist/index.mjs → dist/ → artifacts/api-server/ → project root
    candidates.push(
      path.resolve(_cjsDir, "..", "php"),          // artifacts/api-server/php/
      path.resolve(_cjsDir, "..", "..", "php"),     // project-root/php/  (repo layout)
      path.resolve(_cjsDir, "..", "..", "..", "php"), // one level above repo
    );
  }

  // cwd candidates (PM2 sets cwd to artifacts/api-server in prod)
  candidates.push(
    path.resolve(process.cwd(), "php"),            // artifacts/api-server/php/
    path.resolve(process.cwd(), "..", "..", "php"), // project-root/php/
  );

  // Return the first candidate that actually exists on disk
  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      console.log(`[PHP] Using php directory: ${dir}`);
      return dir;
    }
  }

  // Last resort: first candidate regardless (will fail loudly at PHP boot time)
  const fallback = candidates[0]!;
  console.warn(`[PHP] WARNING: No php/ directory found in any candidate path. Using ${fallback}`);
  return fallback;
}

const phpDir = resolvePhpDir();

/** Poll the PHP port until it accepts a TCP connection (max 10 s). */
function waitForPhpReady(maxMs = 10_000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function attempt() {
      const socket = net.connect(PHP_PORT, PHP_HOST);
      socket.once("connect", () => {
        socket.destroy();
        phpReady = true;
        console.log("[PHP] Server is ready");
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - start >= maxMs) {
          reject(new Error(`PHP server did not become ready within ${maxMs}ms`));
        } else {
          setTimeout(attempt, 150);
        }
      });
    }
    attempt();
  });
}

/** Returns true once the PHP built-in server has accepted its first TCP connection. */
export function isPhpReady(): boolean {
  return phpReady;
}

// Resolve the PHP binary: prefer PHP_BIN env var, then PATH lookup, then common Nix store paths
function findPhpBin(): string {
  if (process.env.PHP_BIN) return process.env.PHP_BIN;
  // Try to find php in PATH using execFileSync
  try {
    const { execFileSync } = require("child_process");
    const result = execFileSync("which", ["php"], { encoding: "utf8" }).trim();
    if (result) return result;
  } catch {
    // which not available or php not in PATH
  }
  // Common Nix store glob pattern — find the most recent php binary
  try {
    const { execFileSync } = require("child_process");
    const result = execFileSync("bash", ["-c", "ls /nix/store/*/bin/php 2>/dev/null | head -1"], { encoding: "utf8" }).trim();
    if (result) return result;
  } catch {
    // ignore
  }
  return "php"; // fallback to PATH lookup
}

/** Kill any process already occupying PHP_PORT before spawning a new one.
 *  This prevents "Address already in use" when PM2 hard-kills Node.js (SIGKILL)
 *  and the PHP child process is orphaned instead of cleaned up.
 */
function evictStalePhpProcess(): void {
  try {
    const { execFileSync } = require("child_process") as typeof import("child_process");
    // fuser -k sends SIGKILL to whatever owns the port — safe to call even if nothing is there
    execFileSync("fuser", ["-k", `${PHP_PORT}/tcp`], { stdio: "ignore" });
    console.log(`[PHP] Evicted stale process on port ${PHP_PORT}`);
  } catch {
    // fuser returns non-zero exit if no process was found — that's fine
  }
}

export function startPhpServer(): void {
  // In PM2 cluster mode every worker shares the same PORT env var, so
  // resolvePhpPort() (derived from PORT) resolves to the same port on every
  // worker too — spawning a PHP server in each one fails with "Address
  // already in use" on every worker after the first. Only one worker (the
  // same one that owns the interval schedulers, see clusterInfo.ts) actually
  // spawns it; every worker (including this one) still proxies PHP routes to
  // that same shared port, and still waits for it to come up below.
  if (IS_SCHEDULER_INSTANCE) {
    // Clear any orphaned PHP process from a previous hard-kill before binding the port
    evictStalePhpProcess();

    const phpBin = findPhpBin();
    const phpArgs = [
      "-d", "upload_max_filesize=55M",
      "-d", "post_max_size=60M",
      "-d", "memory_limit=256M",
      "-d", "output_buffering=Off",
      "-S", `${PHP_HOST}:${PHP_PORT}`,
      "router.php",
    ];
    // Use shell:true so the binary is resolved via sh, which has the full Nix PATH
    phpProcess = spawn(phpBin, phpArgs, {
      cwd: phpDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
      shell: false,
    });

    phpProcess.stdout?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (!msg) return;
      if (shouldSuppressPhpStdout(msg)) return;
      console.log(`[PHP] ${msg}`);
    });

    phpProcess.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (!msg) return;
      if (shouldSuppressPhpStdout(msg)) return;
      if (!msg.includes("Development Server")) {
        console.error(`[PHP] ${msg}`);
      }
    });

    phpProcess.on("error", (err) => {
      console.error("[PHP] Failed to start server:", err.message);
    });

    phpProcess.on("exit", (code, signal) => {
      phpReady = false;
      if (signal !== "SIGTERM" && signal !== "SIGKILL") {
        console.warn(`[PHP] Server exited (code=${code}, signal=${signal})`);
      }
    });

    console.log(`[PHP] Starting on port ${PHP_PORT}`);
  } else {
    console.log(`[PHP] Not this worker's job to spawn — waiting for port ${PHP_PORT} (owned by another instance)`);
  }

  phpReadyPromise = waitForPhpReady().catch((err) => {
    console.error("[PHP] Readiness check failed:", err.message);
  });
}

export function stopPhpServer(): void {
  if (phpProcess) {
    phpProcess.kill("SIGTERM");
    phpProcess = null;
  }
}

process.on("exit", stopPhpServer);
process.on("SIGINT", () => { stopPhpServer(); process.exit(); });
process.on("SIGTERM", () => { stopPhpServer(); process.exit(); });

// ── Routes that must NEVER go to PHP ────────────────────────────────────────
// Express/booking-app paths — always handled by the Node.js server
const BOOKING_APP_PREFIXES = [
  "/api/",
  "/vite-hmr",
  "/src/",
  "/node_modules/",
  "/@",
];

// Path prefixes that always belong to PHP regardless of filesystem check
const PHP_PREFIXES = [
  "/assets/",    // main certxa site CSS/JS/images
  "/videos/",    // main site product videos
  "/launchsite/",// entire LaunchSite template catalog
  "/editor/",    // template editor
  "/templates/", // main certxa site templates pages
];

// Static root-level PHP files
const PHP_ROOT_FILES = new Set(["/sitemap.xml", "/sitemap-pages.xml", "/blog/sitemap.xml", "/robots.txt", "/favicon.svg"]);

export function isPhpRoute(reqPath: string): boolean {
  // Never send booking/API/Vite paths to PHP
  for (const prefix of BOOKING_APP_PREFIXES) {
    if (reqPath.startsWith(prefix)) return false;
  }

  // Always-PHP prefixes and static root files
  if (reqPath.endsWith(".php")) return true;
  if (PHP_ROOT_FILES.has(reqPath)) return true;
  for (const prefix of PHP_PREFIXES) {
    if (reqPath.startsWith(prefix)) return true;
  }

  // Root
  if (reqPath === "/") return true;

  // Dynamic check: any clean-URL path that has a matching directory in php/
  // (or php/public/) with a default.php or index.php inside it is a PHP page.
  // This automatically covers every page without a manual allowlist.
  const slug = reqPath.replace(/\/+$/, ""); // strip trailing slash
  if (slug && !slug.includes(".")) {
    const dir = path.join(phpDir, slug);
    const publicDir = path.join(phpDir, "public", slug);
    if (
      fs.existsSync(path.join(dir, "default.php")) ||
      fs.existsSync(path.join(dir, "index.php")) ||
      fs.existsSync(path.join(phpDir, slug + ".php")) ||
      fs.existsSync(path.join(publicDir, "default.php")) ||
      fs.existsSync(path.join(publicDir, "index.php")) ||
      fs.existsSync(path.join(phpDir, "public", slug + ".php"))
    ) {
      return true;
    }
  }

  return false;
}

// ── Proxy middleware ──────────────────────────────────────────────────────────
const phpProxy = createProxyMiddleware({
  target: PHP_BASE_URL,
  changeOrigin: true,
  // CRITICAL: http-proxy-middleware v4 auto-subscribes its own `upgrade` listener
  // on the underlying http.Server the first time the middleware runs. Without
  // a pathFilter, that listener would try to proxy EVERY WebSocket upgrade
  // (including /media-stream from Twilio) to the PHP backend, which speaks
  // HTTP only and answers 400 "Bad Request" — pre-empting our own upgrade
  // handler. Restricting pathFilter to actual PHP routes lets non-PHP
  // upgrades (e.g. Twilio Media Streams) reach their intended listener.
  pathFilter: (pathname: string) => isPhpRoute(pathname),
  on: {
    error: (err: Error, _req: Request, res: any) => {
      console.error("[PHP Proxy] Error:", err.message);
      if (!(res as any).headersSent) {
        (res as Response).status(502).send(
          "<!DOCTYPE html><html><body><h2>Page unavailable</h2><p>The page server failed to respond. Please try again shortly.</p></body></html>"
        );
      }
    },
  },
});

// Combined middleware: waits for PHP readiness then proxies
export async function phpMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  // manage.certxa.com is served entirely by Express/React — never send to PHP
  if ((req as any).isManageSubdomain) return next();
  if (!isPhpRoute(req.path)) return next();

  // For paths that could be served by either PHP or Vite, prefer local files
  // so React assets are never accidentally swallowed by the PHP proxy.
  // Check both client/public (dev source) and dist/public (prod build output).
  // This is critical for /assets/index-HASH.css|js — Vite hashed files only
  // exist in dist/public; without this check they'd be forwarded to PHP and
  // returned as text/html, causing "Refused to apply style" MIME errors.
  if (req.path.startsWith("/videos/") || req.path.startsWith("/assets/")) {
    // req.path is absolute-like (starts with "/"). path.join(base, "/x") would
    // discard the base and resolve to "/x", causing false negatives and forcing
    // PHP handling even when a built static file exists in dist/public.
    const relPath = req.path.replace(/^\/+/, "");
    if (fs.existsSync(path.join(CLIENT_PUBLIC_DIR, relPath))) return next();
    if (fs.existsSync(path.join(DIST_PUBLIC_DIR, relPath))) return next();
  }

  if (!phpReady && phpReadyPromise) {
    try {
      await phpReadyPromise;
    } catch {
      res.status(503).send("PHP server is starting up, please retry in a moment.");
      return;
    }
  }

  (phpProxy as any)(req, res, next);
}
