/**
 * Website pages a Solo account may open (owner, 2026-11-07; plans/solo-web-dashboard.md).
 *
 * A signed-in Solo account (lib/soloApiAllowList.ts isSoloUser: made in the Certxa Pro app, or a store on the Solo /
 * Plus plan) only ever sees the Solo dashboard (/solo) of the booking app. Typing a salon dashboard address
 * (/settings, /calendar, /nail, /manage …) is answered here, before any page is sent, with a redirect to the matching
 * Solo page. The website does the same in the browser (App.tsx SoloAccountRedirect); this is the server's half, so it
 * holds even if the page code is changed or skipped.
 *
 * An allow-list of the app's first path segments, like the API lock: a salon page added later is closed to Solo
 * without anyone remembering to. Public pages (a salon's booking site, a client's manage-booking link, pay links,
 * online check-in, the marketing pages …) stay open: an owner may look at their own site while signed in.
 * Addresses the booking app doesn't own (the marketing site, files) are never touched.
 */
import type { Request, Response, NextFunction } from "express";
import { isKnownAppFirstSegment, isRentalsHost } from "../static";
import { appWebLink } from "./appWebSession";
import { isSoloUser } from "./soloApiAllowList";

/** First path segments a Solo account may open. */
const SOLO_PAGES = new Set([
  // The Solo dashboard and what the app opens on the website
  "solo", "pro-plus", "pro-credits", "pro-payments-setup", "pro-google-connect",
  // Signing in and out
  "auth", "app-login", "forgot-password", "reset-password",
  // Public pages: booking sites, booking links, payments, check-in, receipts, reviews
  "book", "b", "complete-booking", "pay", "q", "receipt", "redeem", "review", "widget", "chat", "msg",
  // Marketing pages the booking app shows
  "contact", "faq", "features", "how-it-works", "pricing", "marketing", "spa", "tattoo-studio", "autumn",
  // Their own sign-ins (the support team's portal)
  "isteam", "isadmin",
]);

/** Salon dashboard addresses with a Solo page of their own; any other goes to Solo Home. */
const SOLO_PAGE_FOR: [string, string][] = [
  ["/calendar", "/solo/calendar"], ["/appointments", "/solo/calendar"],
  ["/customers", "/solo/clients"], ["/clients", "/solo/clients"], ["/client", "/solo/clients"], ["/client-lookup", "/solo/clients"],
  ["/services", "/solo/catalog/services"], ["/catalog", "/solo/catalog/services"], ["/products", "/solo/catalog/products"], ["/addons", "/solo/catalog/addons"],
  ["/billing", "/solo/billing"], ["/manage/billing", "/solo/billing"],
];
const under = (path: string, base: string) => path === base || path.startsWith(base + "/");

/** Where a Solo account asking for this page goes instead, or null when it may open it. */
export function soloRedirectFor(path: string): string | null {
  if (path === "/" || !isKnownAppFirstSegment(path)) return null;
  const first = (path.split("/")[1] ?? "").toLowerCase();
  if (SOLO_PAGES.has(first)) return null;
  // /booking/<id> is a client's booking confirmation (public); /booking and /booking/new are the salon's.
  if (first === "booking" && path !== "/booking" && !under(path.toLowerCase(), "/booking/new")) return null;
  const lower = path.toLowerCase().replace(/\/+$/, "") || "/";
  return SOLO_PAGE_FOR.find(([from]) => under(lower, from))?.[1] ?? "/solo";
}

/** After the session middleware: a Solo account's request for a salon page is sent to its Solo page. */
export async function soloPageGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  if ((req.method !== "GET" && req.method !== "HEAD") || req.path.startsWith("/api/") || req.path.startsWith("/uploads/")) return next();
  if (isRentalsHost(req)) return next(); // Certxa Rentals is its own product
  const last = req.path.split("/").pop() ?? "";
  if (last.includes(".")) return next(); // files (scripts, images, fonts)
  const session = req.session as { userId?: string; staffId?: number } | undefined;
  // Signed out, a staff sign-in, or the app's billing-only sign-in (it has its own, smaller list).
  if (!session?.userId || session.staffId || appWebLink(req)) return next();
  const target = soloRedirectFor(req.path);
  if (!target) return next();
  try {
    if (!(await isSoloUser(session.userId))) return next();
  } catch (err: any) {
    // Never block a page because this check failed: the website's own redirect still applies.
    console.error("[solo-page-guard]", err?.message ?? err);
    return next();
  }
  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, target);
}
