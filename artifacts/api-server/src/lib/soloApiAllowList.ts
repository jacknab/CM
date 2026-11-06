/**
 * The server addresses a Solo account may use (owner, 2026-11-06; plans/solo-web-dashboard.md step 3).
 *
 * A Solo account is one made in the Certxa Pro app (users.account_type certxa_pro) or one whose store is on the Solo
 * or Plus plan. It may only call what the Certxa Pro app and the Solo pages on the website call; anything else (a
 * salon feature: the front-desk POS, payroll, cash drawers, AI receptionist …) is not for it. An allow-list rather
 * than a list of forbidden areas, so salon features added later are closed to Solo without anyone remembering to.
 *
 * SOLO_API_LOCK sets what happens to an address that is not on the list:
 *   "report"  (default) — let it through and count it in solo_api_report, to find what the list is missing;
 *   "enforce" — refuse it (403, code NOT_ON_SOLO);
 *   "off"     — do nothing.
 * Requests nobody is signed in to (public pages, booking, webhooks) and the app's billing-only website sign-in
 * (lib/appWebSession.ts, which has its own, smaller list) are not touched here.
 */
import type { Request, Response, NextFunction } from "express";
import { pool } from "../db";
import { verifySoloToken } from "./soloAuth";
import { isProAccount } from "@shared/proAccount";
import { isSoloPlanCode } from "@shared/soloPlan";
import { appWebLink } from "./appWebSession";

/**
 * "/api/x/*" allows /api/x and everything under it; ":id" stands for one path segment.
 * The app's list was read from its source (certxa-pro-replit/staff-app-latest/artifacts/certxa-pro) on 2026-11-06.
 */
export const SOLO_API_ALLOW: string[] = [
  // Signing in and out, everywhere
  "/api/auth/*", "/api/app-web-session/end", "/api/solo/*",
  // Public pages and booking (the pro's own booking page, previews)
  "/api/public/*", "/api/book/*",
  // The Certxa Pro app
  "/api/account/phone/*",
  "/api/addon-groups/*", "/api/addons/*", "/api/service-addons/*", "/api/service-addon-mappings/*",
  "/api/appointments/*", "/api/quick-sales/*", "/api/time-blocks/*", "/api/calendar-settings/*",
  "/api/assistant/actions/*", "/api/pro-assistant/*",
  "/api/booking-ban-list/*", "/api/booking-policies/*", "/api/booking-requests/*", "/api/booking-site/*",
  "/api/business-hours/*", "/api/work-places/*",
  "/api/campaigns/*", "/api/win-back/settings/*", "/api/mail-settings/*", "/api/sms-settings/*", "/api/sms-inbox/*",
  "/api/client-photos/*", "/api/clients/*", "/api/customers/*", "/api/intelligence/client/*",
  "/api/deals/*", "/api/gift-cards/*", "/api/packages/*", "/api/products/*", "/api/portfolio/*",
  "/api/services/*", "/api/service-categories/*", "/api/staff/:id/services",
  "/api/manage/overview",
  "/api/payments/overview", "/api/payments/stripe/*", "/api/payments/terminal/*", "/api/payments/transactions/*",
  "/api/pos/email-receipt", "/api/pos/sms-receipt", "/api/pos-settings/*", "/api/tip-presets/*",
  "/api/pro/*", "/api/reviews/*",
  "/api/stores/*", "/api/user/delete-account", "/api/waitlist/*",
];

const ALLOW = SOLO_API_ALLOW.map((p) => {
  const any = p.endsWith("/*");
  return { parts: (any ? p.slice(0, -2) : p).split("/"), any };
});

export function soloApiAllowed(path: string): boolean {
  const parts = path.replace(/\/+$/, "").split("/");
  return ALLOW.some(({ parts: want, any }) => {
    if (any ? parts.length < want.length : parts.length !== want.length) return false;
    return want.every((w, i) => w === ":id" || w === parts[i]);
  });
}

// ── Who is Solo (cached a minute per account) ────────────────────────────────
const CACHE_MS = 60_000;
const soloCache = new Map<string, { solo: boolean; storeId: number | null; at: number }>();

async function soloAccount(userId: string): Promise<{ solo: boolean; storeId: number | null }> {
  const hit = soloCache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;
  const r = await pool.query(
    `SELECT u.account_type,
            (SELECT l.id FROM locations l WHERE l.user_id = u.id ORDER BY l.id LIMIT 1) AS store_id,
            (SELECT p.code FROM locations l
               JOIN store_subscriptions ss ON ss.store_id = l.id AND ss.status IN ('active', 'trialing')
               JOIN subscription_plans p ON p.id = ss.plan_id
              WHERE l.user_id = u.id ORDER BY ss.id DESC LIMIT 1) AS plan_code
       FROM users u WHERE u.id = $1`,
    [userId],
  );
  const row = r.rows[0];
  const entry = {
    solo: !!row && (isProAccount(row.account_type) || isSoloPlanCode(row.plan_code)),
    storeId: row?.store_id ?? null,
    at: Date.now(),
  };
  if (soloCache.size > 5000) soloCache.clear();
  soloCache.set(userId, entry);
  return entry;
}

// ── Report: addresses Solo accounts used that are not on the list ────────────
/** One shape per address: ids, long codes and e-mail-like parts become placeholders. */
export function pathShape(path: string): string {
  return path.replace(/\/+$/, "").split("/").map((s) => {
    if (/^\d+$/.test(s)) return ":id";
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return ":id";
    if (s.length >= 20 || s.includes("@")) return ":token";
    return s;
  }).join("/") || "/";
}

const pending = new Map<string, { method: string; path: string; source: string; hits: number; stores: Set<number> }>();

function note(method: string, path: string, source: string, storeId: number | null): void {
  const key = `${method} ${path} ${source}`;
  let e = pending.get(key);
  if (!e) {
    if (pending.size > 2000) return;
    e = { method, path, source, hits: 0, stores: new Set() };
    pending.set(key, e);
  }
  e.hits++;
  if (storeId && e.stores.size < 50) e.stores.add(storeId);
}

export async function flushSoloApiReport(): Promise<void> {
  if (!pending.size) return;
  const rows = [...pending.values()];
  pending.clear();
  for (const e of rows) {
    try {
      await pool.query(
        `INSERT INTO solo_api_report (method, path, source, hits, stores) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (method, path, source) DO UPDATE SET hits = solo_api_report.hits + EXCLUDED.hits, last_seen = now(),
           stores = (SELECT COALESCE(array_agg(DISTINCT s), '{}') FROM unnest(solo_api_report.stores || EXCLUDED.stores) s)`,
        [e.method, e.path, e.source, e.hits, [...e.stores]],
      );
    } catch (err: any) {
      console.error("[solo-api-report] save", err?.message ?? err);
    }
  }
}
setInterval(() => { void flushSoloApiReport(); }, 60_000).unref();

function lockMode(): "report" | "enforce" | "off" {
  const m = (process.env.SOLO_API_LOCK ?? "report").toLowerCase();
  return m === "enforce" || m === "off" ? m : "report";
}

/** After the session middleware, for every request. */
export async function soloApiLock(req: Request, res: Response, next: NextFunction): Promise<void> {
  const path = req.path || "";
  if (!path.startsWith("/api/") || req.method === "OPTIONS") return next();
  const mode = lockMode();
  if (mode === "off" || appWebLink(req)) return next();
  try {
    let userId: string | undefined = (req.session as any)?.userId;
    let source = "web";
    if (!userId && !(req.session as any)?.staffId) {
      const auth = req.headers.authorization;
      if (auth?.startsWith("Bearer ")) {
        userId = verifySoloToken(auth.slice(7))?.userId;
        source = "app";
      }
    }
    if (!userId) return next();
    const who = await soloAccount(userId);
    if (!who.solo || soloApiAllowed(path)) return next();
    if (mode === "enforce") {
      res.status(403).json({ error: "This isn't part of Certxa Pro.", code: "NOT_ON_SOLO" });
      return;
    }
    note(req.method, pathShape(path), source, who.storeId);
  } catch (err: any) {
    // Never block a request because this check failed.
    console.error("[solo-api-lock]", err?.message ?? err);
  }
  next();
}
