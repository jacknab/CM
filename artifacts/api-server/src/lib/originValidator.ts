/**
 * Shared WebSocket origin validator
 *
 * Mirrors the same allowed-origins logic used by the CORS middleware in
 * index.ts so that WebSocket upgrade handlers can enforce identical rules
 * without creating a circular import from dashboardWS → index.
 *
 * Browsers always include an `Origin` header on WebSocket upgrade requests
 * (unlike regular XHR/fetch where the header is optional for same-origin).
 * Rejecting unknown origins prevents cross-site WebSocket hijacking: a
 * malicious page cannot steal session-authenticated data even if the victim's
 * browser sends a valid session cookie on the upgrade.
 */

const rawCorsOrigins =
  process.env.CORS_ORIGINS ||
  process.env.ALLOWED_ORIGINS ||
  process.env.CORS_ORIGIN ||
  "";

const allowAll = process.env.CORS_ALLOW_ALL === "true";

// Mirror index.ts domain derivation exactly.
const _replitDevDomain = process.env.REPLIT_DEV_DOMAIN || "";
const _replitDevUrl    = _replitDevDomain ? `https://${_replitDevDomain}` : "";
const _appUrl          = _replitDevUrl || process.env.APP_URL || "";
const _appDomain       = (() => {
  try { return _appUrl ? new URL(_appUrl).hostname : ""; }
  catch { return ""; }
})();

const defaultOrigins: string[] = [
  ...(_appUrl ? [_appUrl] : []),
  ...(process.env.APP_URL && process.env.APP_URL !== _appUrl ? [process.env.APP_URL] : []),
  ...(_appDomain ? [`https://www.${_appDomain}`, `https://manage.${_appDomain}`] : []),
];

if (process.env.NODE_ENV !== "production") {
  // Allow localhost variants used during local dev.
  ["3000", "4000", "4173", "5000", "5173", "8080", "9200"].forEach(p =>
    defaultOrigins.push(`http://localhost:${p}`)
  );
  // Extra ports from DEV_CORS_PORTS env var.
  (process.env.DEV_CORS_PORTS || "").split(",").map(p => p.trim()).filter(Boolean)
    .forEach(p => defaultOrigins.push(`http://localhost:${p}`));
}

const allowedOrigins = (rawCorsOrigins ? rawCorsOrigins.split(",") : defaultOrigins)
  .map(o => o.trim())
  .filter(Boolean);

/**
 * Returns true when the given `origin` is permitted to open a WebSocket
 * connection to this server.
 *
 * @param origin  The value of the `Origin` request header (may be undefined
 *                for non-browser clients — those are allowed through because
 *                they cannot carry a browser session cookie anyway).
 * @param requestHost  The `Host` (or `X-Forwarded-Host`) header value, used
 *                     to allow same-origin custom-domain requests.
 */
export function isOriginAllowed(
  origin: string | undefined,
  requestHost?: string,
): boolean {
  // Non-browser clients (curl, wscat, server-to-server) send no Origin header.
  // They can't carry HttpOnly session cookies so there's no CSRF risk.
  if (!origin) return true;

  // Explicit allow-all flag (should never be set in production).
  if (allowAll) return true;

  // Exact match against the allowlist.
  if (allowedOrigins.includes(origin)) return true;

  // Same-origin requests for custom salon domains proxied through nginx.
  // e.g. Origin=https://4star.shop, Host=4star.shop
  if (requestHost) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      if (originHost === requestHost.split(",")[0].trim().toLowerCase()) return true;
    } catch { /* ignore */ }
  }

  // Any subdomain of the configured app domain (manage., booking slugs, etc.)
  if (_appDomain && (origin.endsWith(`.${_appDomain}`) || origin === _appUrl)) {
    return true;
  }

  return false;
}
