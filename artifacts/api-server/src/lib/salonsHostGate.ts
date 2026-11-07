/**
 * salons.certxa.com is retired (owner, 2026-11-07): the salon directory and the marketplace (Deals, Wallet) were
 * removed. Backup: /root/salons-certxa-backup-2026-11-07.zip (code, built files, directory tables).
 *   - Anything on salons.certxa.com → certxa.com (301): directory pages to the homepage, any other address (the old
 *     website copy it used to serve) to the same address on certxa.com.
 *   - The marketplace's addresses on certxa.com (/salons, /listings, /salon, /deals, /wallet) answer 410 Gone, so
 *     search engines drop them.
 */
import type { RequestHandler } from "express";

export const SALONS_HOST = "salons.certxa.com";

/** The removed directory / marketplace addresses. */
export function isRetiredMarketplacePath(path: string): boolean {
  return /^\/(salons|listings|salon|deals)(\/|$)/.test(path) || path === "/wallet" || path === "/wallet/";
}

function hostOf(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return String(v ?? "").split(",")[0].trim().split(":")[0].toLowerCase();
}

export function salonsHostGate(goneHtml: string): RequestHandler {
  return (req, res, next) => {
    const host = hostOf(req.headers["x-forwarded-host"] || req.headers.host);
    if (host === SALONS_HOST) {
      const toHome = req.path === "/" || isRetiredMarketplacePath(req.path);
      res.redirect(301, toHome ? "https://certxa.com/" : `https://certxa.com${req.originalUrl}`);
      return;
    }
    if ((host === "certxa.com" || host === "www.certxa.com") && (req.method === "GET" || req.method === "HEAD") && isRetiredMarketplacePath(req.path)) {
      res.status(410).set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=86400" }).send(goneHtml);
      return;
    }
    next();
  };
}
