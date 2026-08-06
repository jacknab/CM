import { type Request, type Response, type NextFunction } from 'express';
import { db } from '../db';
import { locations } from '@shared/schema';
import { eq, sql, and } from 'drizzle-orm';
import { handleTenantSiteByDomain, handleTenantSiteBySlug } from '../lib/template-serve';
import { websitesTable } from '@workspace/db';
import path from 'path';
import fs from 'fs';

declare global {
  namespace Express {
    interface Request {
      store?: typeof locations.$inferSelect;
      launchsiteSlug?: string;
    }
  }
}

// Derive the app domain from APP_URL so no domain name is hardcoded here.
const _appUrl = process.env.APP_URL || "";
const _appDomain = (() => { try { return _appUrl ? new URL(_appUrl).hostname : ""; } catch { return ""; } })();

// Reserved subdomains that should never be treated as user sites
const RESERVED_SUBDOMAINS = new Set([
  'www', 'app', 'api', 'mail', 'ftp', 'admin', 'certxa',
  'launchit', 'support', 'help', 'blog', 'shop', 'store',
  'test', 'demo', 'staging', 'dev', 'secure',
  'manage', // unified subscriber hub — handled by Express/React, not a user site
]);

// ── Jaro-Winkler similarity ──────────────────────────────────────────────────
// Returns a score between 0 (no match) and 1 (identical).
// Works well for short strings like slugs/subdomains.
function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;

  const matchWindow = Math.max(Math.floor(Math.max(len1, len2) / 2) - 1, 0);
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;

  // Winkler prefix bonus (up to 4 chars)
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

// Similarity threshold: 0.85 catches close typos like "toby" → "tobys" (~95%)
const SIMILARITY_THRESHOLD = 0.85;

interface SlugMatch {
  slug: string;
  businessName: string;
  type: 'booking' | 'launchsite';
}

async function findCloseSlugs(subdomain: string): Promise<SlugMatch[]> {
  const candidates: SlugMatch[] = [];

  try {
    // Gather all booking slugs
    const stores = await db.execute(sql`
      SELECT booking_slug, name FROM locations WHERE booking_slug IS NOT NULL
    `) as any;
    for (const row of (stores?.rows ?? [])) {
      if (row.booking_slug) {
        candidates.push({ slug: row.booking_slug, businessName: row.name || row.booking_slug, type: 'booking' });
      }
    }
  } catch { /* table may not exist */ }

  try {
    // Gather all launchsite slugs
    const sites = await db.execute(sql`
      SELECT s.slug, os.business_name
      FROM subdomains s
      JOIN onboarding_submissions os ON os.id = s.submission_id
      WHERE os.status NOT IN ('inactive', 'pending_payment')
    `) as any;
    for (const row of (sites?.rows ?? [])) {
      if (row.slug) {
        candidates.push({ slug: row.slug, businessName: row.business_name || row.slug, type: 'launchsite' });
      }
    }
  } catch { /* tables may not exist yet */ }

  // Score and filter to close matches, excluding exact match (already handled)
  return candidates
    .map(c => ({ ...c, score: jaroWinkler(subdomain.toLowerCase(), c.slug.toLowerCase()) }))
    .filter(c => c.score >= SIMILARITY_THRESHOLD && c.slug !== subdomain)
    .sort((a, b) => (b as any).score - (a as any).score)
    .slice(0, 5);
}

function renderNotFoundPage(requestedDomain: string, matches: SlugMatch[]): string {
  const hasSuggestions = matches.length > 0;

  const suggestions = matches
    .map(m => {
      const url = `https://${m.slug}.${_appDomain || "localhost"}`;
      return `<a href="${url}" class="match-link">
        <span class="match-icon">🌐</span>
        <span class="match-text">
          <span class="match-url">${m.slug}.${_appDomain || "localhost"}</span>
          <span class="match-name">${m.businessName}</span>
        </span>
        <span class="match-arrow">→</span>
      </a>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Website Not Found — Certxa</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0f;
      color: #fff;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .logo {
      font-size: 1.5rem;
      font-weight: 800;
      color: #fff;
      letter-spacing: -0.03em;
      margin-bottom: 3rem;
      opacity: 0.9;
    }
    .logo span { color: #a78bfa; }
    .card {
      max-width: 520px;
      width: 100%;
      text-align: center;
    }
    .icon {
      font-size: 3rem;
      margin-bottom: 1.25rem;
    }
    h1 {
      font-size: 1.6rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
      line-height: 1.3;
    }
    .domain-badge {
      display: inline-block;
      background: rgba(167,139,250,0.15);
      border: 1px solid rgba(167,139,250,0.3);
      color: #c4b5fd;
      font-size: 0.9rem;
      font-weight: 600;
      padding: 0.3rem 0.8rem;
      border-radius: 999px;
      margin-bottom: 1.5rem;
      letter-spacing: 0.01em;
    }
    .subtitle {
      color: rgba(255,255,255,0.5);
      font-size: 0.95rem;
      line-height: 1.6;
      margin-bottom: 2rem;
    }
    .suggestions-label {
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(255,255,255,0.35);
      margin-bottom: 0.75rem;
    }
    .matches {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-bottom: 2rem;
    }
    .match-link {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 0.9rem 1.1rem;
      text-decoration: none;
      color: inherit;
      transition: background 0.15s, border-color 0.15s;
      text-align: left;
    }
    .match-link:hover {
      background: rgba(167,139,250,0.12);
      border-color: rgba(167,139,250,0.35);
    }
    .match-icon { font-size: 1.1rem; flex-shrink: 0; }
    .match-text { flex: 1; display: flex; flex-direction: column; gap: 0.15rem; }
    .match-url { font-size: 0.95rem; font-weight: 600; color: #a78bfa; }
    .match-name { font-size: 0.78rem; color: rgba(255,255,255,0.45); }
    .match-arrow { color: rgba(255,255,255,0.3); font-size: 0.9rem; flex-shrink: 0; }
    .back-link {
      display: inline-block;
      color: rgba(255,255,255,0.4);
      font-size: 0.85rem;
      text-decoration: none;
      margin-top: 0.5rem;
    }
    .back-link:hover { color: rgba(255,255,255,0.7); }
  </style>
</head>
<body>
  <div class="logo">Certxa<span>.</span></div>
  <div class="card">
    <div class="icon">${hasSuggestions ? '🔍' : '🌐'}</div>
    <h1>We couldn't find a website for</h1>
    <div class="domain-badge">${requestedDomain}</div>
    ${hasSuggestions
      ? `<p class="subtitle">That address doesn't exist, but we found ${matches.length === 1 ? 'a website that looks similar' : 'some websites that look similar'}:</p>
         <div class="suggestions-label">Did you mean?</div>
         <div class="matches">${suggestions}</div>`
      : `<p class="subtitle">That address doesn't exist on Certxa and we couldn't find anything similar. Double-check the URL and try again.</p>`
    }
    <a href="${_appUrl || "/"}" class="back-link">← Back to ${_appDomain || "home"}</a>
  </div>
</body>
</html>`;
}

export async function subdomainMiddleware(req: Request, res: Response, next: NextFunction) {
  // Resolve host first — we need it to decide whether /assets/* should be passed
  // through to express.static (app domain) or served from the tenant template dist
  // (custom domain, e.g. certxa.com).
  const forwardedHost = req.headers["x-forwarded-host"];
  const hostHeader = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
  const host = (hostHeader || req.headers.host || "").split(":")[0];
  const parts = host.split('.');

  // Replit dev/preview domains and loopback addresses are never tenant sites — pass through unconditionally.
  if (
    host.endsWith('.replit.dev') ||
    host.endsWith('.replit.app') ||
    host.endsWith('.repl.co') ||
    host === '127.0.0.1' ||
    host === 'localhost'
  ) {
    return next();
  }

  const rootDomain = parts.slice(-2).join('.');
  const isAppDomain = rootDomain === _appDomain || rootDomain === 'localhost';

  let subdomain = '';
  let isCustomDomain = false;

  if (isAppDomain) {
    if (parts.length < 2) return next();
    subdomain = parts[0];
  } else {
    isCustomDomain = true;
  }

  // API, webhook, and WebSocket paths are never tenant sites — always pass through.
  if (
    req.path.startsWith('/api/') ||
    req.path.startsWith('/uploads/') ||
    req.path.startsWith('/media-stream')
  ) {
    return next();
  }

  // For the app domain (certxa.com subdomains), static assets are served by
  // express.static from dist/public — pass through so Express handles them.
  // For custom domains, /assets/* and /favicon.ico must be routed to the tenant's
  // template dist directory, so we do NOT skip them here.
  if (!isCustomDomain && (req.path.startsWith('/assets/') || req.path === '/favicon.ico')) {
    return next();
  }

  // manage.certxa.com → unified subscriber hub served by the React SPA
  if (subdomain === 'manage' && !isCustomDomain) {
    (req as any).isManageSubdomain = true;
    return next();
  }

  if (!isCustomDomain && RESERVED_SUBDOMAINS.has(subdomain)) return next();

  try {
    // 1. Check if this is a website-builder subdomain (wb_websites.slug) — only for app domain.
    //    A published website takes priority over the booking-app subdomain so that
    //    every path on <slug>.certxa.com is handled by the website, not the React SPA.
    //    The booking app remains accessible at /book/:slug.
    if (!isCustomDomain) {
      try {
        const [website] = await db
          .select()
          .from(websitesTable)
          .where(and(eq(websitesTable.slug, subdomain), eq(websitesTable.published, true)));
        if (website) {
          req.launchsiteSlug = subdomain;
          Object.assign(req.params, { slug: subdomain });
          return handleTenantSiteBySlug(req, res);
        }
      } catch {
        // websitesTable may not exist yet — continue
      }
    }

    // 2. Check if this is a booking-app store subdomain (bookingSlug) — only for app domain.
    //    Only reached when no published website exists for this slug.
    if (!isCustomDomain) {
      const [store] = await db.select().from(locations).where(eq(locations.bookingSlug, subdomain));
      if (store) {
        const acctStatus = ((store as any).accountStatus ?? store.accountStatus ?? "active").toLowerCase();
        if (acctStatus === "suspended" || acctStatus === "canceled" || acctStatus === "cancelled") {
          const storeName = (store as any).name ?? "This business";
          return res.status(402).send(`<!DOCTYPE html><html><head><title>${storeName}</title>
            <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fff;}
            .box{text-align:center;padding:2rem;max-width:480px;} h1{font-size:2rem;margin-bottom:0.5rem;} p{color:rgba(255,255,255,0.6);margin:0.5rem 0;}
            a{color:#a78bfa;text-decoration:none;} a:hover{text-decoration:underline;}</style>
            </head><body><div class="box"><h1>${storeName}</h1>
            <p>This business is not currently accepting online bookings.</p>
            </div></body></html>`);
        }

        // Rewrite the root path so the booking SPA receives the slug while the
        // browser remains at https://<slug>.certxa.com/.
        try {
          const currentPath = req.path || (req as any).url || '';
          if ((currentPath === '/' || currentPath === '') && !currentPath.startsWith(`/book/${subdomain}`)) {
            (req as any).url = `/book/${subdomain}${(req as any).url || ''}`;
          }
        } catch (err) {
          // Non-fatal — if rewrite fails, fall back to default behavior
        }

        req.store = store;
        return next();
      }
    }

    // 2. Check if this is a launchsite user subdomain (subdomain.certxa.com)
    let row: any = null;
    if (!isCustomDomain) {
      try {
        const result = await db.execute(sql`
          SELECT os.template_id, os.business_name, os.hours, os.status, os.domain_type,
                 os.store_id, l.account_status
          FROM subdomains s
          JOIN onboarding_submissions os ON os.id = s.submission_id
          LEFT JOIN locations l ON l.id = os.store_id
          WHERE s.slug = ${subdomain}
          LIMIT 1
        `) as any;
        row = result?.rows?.[0];
      } catch {
        // subdomains/onboarding_submissions tables not yet created — skip launchsite lookup
      }
    }

    // 3. If no subdomain match, check for custom domain
    if (!row && isCustomDomain) {
      try {
        const result = await db.execute(sql`
          SELECT os.id, os.template_id, os.business_name, os.hours, os.status, os.domain_type, os.domain_payment_status,
                 os.store_id, l.account_status
          FROM onboarding_submissions os
          LEFT JOIN locations l ON l.id = os.store_id
          WHERE os.custom_domain = ${host}
          AND os.domain_type = 'custom'
          LIMIT 1
        `) as any;
        row = result?.rows?.[0];
      } catch {
        // Table not yet created or custom domain lookup failed
      }
    }

    // Authoritative account-status check for launchsite rows.
    // The LEFT JOIN on account_status can silently return NULL when store_id is
    // missing or the join fails — which would let suspended sites slip through.
    // Instead, always do a direct lookup by store_id when we have one.
    let launchsiteAcctStatus = "";
    if (row?.store_id) {
      try {
        const locResult = await db.execute(sql`
          SELECT account_status FROM locations WHERE id = ${row.store_id} LIMIT 1
        `) as any;
        const loc = locResult?.rows?.[0];
        launchsiteAcctStatus = String(loc?.account_status ?? "").toLowerCase();
      } catch { /* table may not exist yet */ }
    }

    if (row && (launchsiteAcctStatus === "suspended" || launchsiteAcctStatus === "cancelled" || launchsiteAcctStatus === "canceled")) {
      return res.status(503).send(`<!DOCTYPE html><html><head><title>${row.business_name ?? "Website Unavailable"}</title>
        <style>
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                 display: flex; align-items: center; justify-content: center;
                 min-height: 100vh; background: #0a0a0f; color: #fff; padding: 2rem; }
          .box { text-align: center; max-width: 480px; }
          .logo { font-size: 1.2rem; font-weight: 800; color: #fff; letter-spacing: -0.03em;
                  margin-bottom: 2.5rem; opacity: 0.6; }
          .logo span { color: #a78bfa; }
          h1 { font-size: 1.75rem; font-weight: 700; margin-bottom: 0.75rem; }
          p { color: rgba(255,255,255,0.55); line-height: 1.6; }
        </style>
        </head><body><div class="box">
          <div class="logo">Certxa<span>.</span></div>
          <h1>Website Unavailable</h1>
          <p>This website is not currently available. Please contact the business directly for assistance.</p>
        </div></body></html>`);
    }

    // Handle inactive sites
    if (row && row.status === 'inactive') {
      return res.status(402).send(`<!DOCTYPE html><html><head><title>${row.business_name}</title>
        <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fff;}
        .box{text-align:center;padding:2rem;max-width:480px;} h1{font-size:2rem;margin-bottom:0.5rem;} p{color:rgba(255,255,255,0.6);margin:0.5rem 0;}
        a{color:#a78bfa;text-decoration:none;} a:hover{text-decoration:underline;}</style>
        </head><body><div class="box"><h1>${row.business_name}</h1>
        <p>This website is currently inactive.</p>
        <p>The account's free trial has ended. <a href="${_appUrl || "/"}">Learn more</a></p>
        </div></body></html>`);
    }

    // Handle pending payment on custom domains — show DNS setup page
    if (row && row.status === 'pending_payment' && isCustomDomain) {
      return res.status(402).send(`<!DOCTYPE html><html><head><title>${row.business_name}</title>
        <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fff;}
        .box{text-align:center;padding:2rem;max-width:480px;} h1{font-size:1.5rem;margin-bottom:0.5rem;} p{color:rgba(255,255,255,0.7);margin:0.8rem 0;}
        .code{background:#1a1a1a;padding:1rem;border-radius:0.5rem;font-family:monospace;margin:1rem 0;text-align:left;overflow-x:auto;}
        a{color:#a78bfa;text-decoration:none;} a:hover{text-decoration:underline;}</style>
        </head><body><div class="box"><h1>${row.business_name}</h1>
        <p>DNS verification in progress.</p>
        <p>Your domain is being set up. Please verify your DNS records and complete payment to go live.</p>
        <p><a href="${_appUrl || "/"}">Return to dashboard</a></p>
        </div></body></html>`);
    }

    // Serve active/pending site templates
    if (row && row.status !== 'pending_payment') {
      req.launchsiteSlug = subdomain || host;

      // Serve the built template for this user's site
      const templateId: string = row.template_id;
      const templateDir = path.resolve(process.cwd(), 'php', 'templates', templateId);
      const indexPath = path.join(templateDir, 'index.html');

      if (fs.existsSync(indexPath)) {
        res.setHeader('Cache-Control', 'no-cache');
        return res.sendFile(indexPath);
      }

      // Template build not found — show a friendly holding page
      return res.send(`<!DOCTYPE html><html><head><title>${row.business_name}</title>
        <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fff;}
        .box{text-align:center;padding:2rem;} h1{font-size:2rem;margin-bottom:0.5rem;} p{color:rgba(255,255,255,0.6);}</style>
        </head><body><div class="box"><h1>${row.business_name}</h1><p>Your website is being set up. Check back soon.</p></div></body></html>`);
    }

    // For custom domains not in the launchsite system, let the website builder
    // handle it — it looks up websitesTable by custom_domain and serves the
    // appropriate page (verification token page for pending_dns/pending_payment,
    // the live site for active+published, or a 404 if truly unknown).
    if (isCustomDomain) {
      return handleTenantSiteByDomain(req, res);
    }

    // 4. No exact match found — look for close slug matches and show smart not-found page
    // Only trigger this for subdomains that look like user sites (not API/asset paths)
    if ((req.path === '/' || req.path === '') && !isCustomDomain) {
      const requestedDomain = `${subdomain}.${_appDomain || "localhost"}`;
      const closeMatches = await findCloseSlugs(subdomain);
      return res.status(404).send(renderNotFoundPage(requestedDomain, closeMatches));
    }

  } catch (error) {
    console.error('[Subdomain] Error:', error);
  }

  next();
}
