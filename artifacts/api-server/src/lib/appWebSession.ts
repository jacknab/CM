/**
 * A website sign-in opened from the Certxa Pro app (owner, 2026-11-06; plans/solo-web-dashboard.md).
 *
 * The app opens billing, Plus and text credits on the website through a single-use, 15-minute link
 * (app_web_links). The sign-in that link gives is kept as small as possible:
 *  - the cookie lives only while the browser is open (no expiry date);
 *  - after 30 minutes without a request it ends on the server, even if the browser keeps the cookie;
 *  - it reaches only the billing pages and their data, never the rest of the website or the app's endpoints;
 *  - it never becomes a remembered device (the certxa.device cookie that signs a browser back in);
 *  - the page ends it when it is closed or when "Back to Certxa Pro" is tapped (POST /api/app-web-session/end).
 */
import type { Request, Response, NextFunction } from "express";

export const APP_WEB_IDLE_MS = 30 * 60 * 1000;

type AppWebLink = { scope: "billing"; storeId: number | null; lastSeen: number };

/** Where a billing sign-in may go: its pages, and the data those pages read. */
const PAGE_PATHS = ["/solo/billing", "/pro-plus", "/pro-credits"];
const API_PATHS = [
  "/api/solo/plus", "/api/solo/credits", "/api/solo/billing/history", "/api/solo/billing/card",
  "/api/app-web-session/end", "/api/auth/user", "/api/auth/logout",
];
/** Exactly these (method + address, nothing under them): Business Phone's billing, not its calls, texts or settings. */
const API_EXACT = ["GET /api/pro/phone", "POST /api/pro/phone/cancel"];

const under = (path: string, bases: string[]) => bases.some((b) => path === b || path.startsWith(b + "/"));

export function appWebLink(req: Request): AppWebLink | null {
  const link = (req.session as any)?.appWebLink;
  return link && link.scope === "billing" ? link : null;
}

/** Signs the app's owner in on this browser for billing only, then sends them to `to`. */
export function startAppWebSession(req: Request, res: Response, userId: string, storeId: number | null, to: string, onFail: () => void): void {
  req.session.regenerate((regenErr) => {
    if (regenErr) { console.error("[app-web-session] regenerate", regenErr); return onFail(); }
    (req.session as any).userId = userId;
    (req.session as any).appWebLink = { scope: "billing", storeId, lastSeen: Date.now() } satisfies AppWebLink;
    // No maxAge: a cookie for this browser session only. It stays that way when the session is renewed.
    req.session.cookie.maxAge = null as any;
    req.session.save((saveErr) => {
      if (saveErr) { console.error("[app-web-session] save", saveErr); return onFail(); }
      res.redirect(302, to);
    });
  });
}

function endSession(req: Request, res: Response, then: () => void): void {
  const domain = process.env.REPLIT_DEV_DOMAIN ? undefined : process.env.COOKIE_DOMAIN || undefined;
  req.session.destroy(() => {
    res.clearCookie("certxa.sid", { path: "/", domain });
    then();
  });
}

/**
 * Runs after the session middleware on every request. A billing sign-in that has been idle too long is ended;
 * one that asks for anything outside billing is refused (data) or sent to the billing page (pages).
 */
export function appWebSessionGuard(req: Request, res: Response, next: NextFunction): void {
  const link = appWebLink(req);
  if (!link) return next();
  const path = req.path || "/";
  const isApi = path.startsWith("/api/");

  if (Date.now() - Number(link.lastSeen || 0) > APP_WEB_IDLE_MS) {
    return endSession(req, res, () => {
      if (isApi) res.status(401).json({ error: "This page has expired. Open it again from the Certxa Pro app.", code: "APP_LINK_EXPIRED" });
      else if (req.method === "GET" && under(path, PAGE_PATHS)) next();
      else res.redirect(302, "/solo/billing");
    });
  }

  if (isApi) {
    // Never a new app link from here (…/web-link): each one is made by the signed-in app.
    if ((!under(path, API_PATHS) && !API_EXACT.includes(`${req.method} ${path.replace(/\/+$/, "")}`)) || /\/web-link$/.test(path)) {
      res.status(403).json({ error: "Not available from this page.", code: "APP_LINK_SCOPE" });
      return;
    }
  } else if (req.method === "GET" && !under(path, PAGE_PATHS) && !/\.[a-z0-9]{1,8}$/i.test(path) && (req.headers.accept ?? "").includes("text/html")) {
    // Any other website page: back to billing (files such as scripts, images and fonts load as usual).
    res.redirect(302, "/solo/billing");
    return;
  }

  link.lastSeen = Date.now();
  next();
}

/** POST /api/app-web-session/end — the page was closed or the owner went back to the app. */
export function endAppWebSession(req: Request, res: Response): void {
  if (!appWebLink(req)) { res.status(204).end(); return; }
  endSession(req, res, () => res.status(204).end());
}
