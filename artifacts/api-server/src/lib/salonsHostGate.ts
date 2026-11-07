/**
 * salons.certxa.com is the salon directory only (owner, 2026-11-07). Every other address there used to show a copy of
 * the old main website (pricing, about, blog, sign-in…); those now go to the same address on certxa.com (301), so
 * search engines drop the copies and old links still land somewhere.
 * Kept on salons.certxa.com: the directory pages (/salons/…, "/" → /salons in routes/salonDirectory.ts), its client
 * files (/mp-assets/…), the API it calls (/api/…), and its robots.txt, sitemaps and icon.
 */
import type { RequestHandler } from "express";

export const SALONS_HOST = "salons.certxa.com";

export function isDirectoryPath(path: string): boolean {
  return path === "/"
    || path === "/salons" || path.startsWith("/salons/")
    || path.startsWith("/mp-assets/")
    || path.startsWith("/api/")
    || path === "/robots.txt"
    || /^\/sitemap[a-z0-9_-]*\.xml$/i.test(path)
    || path === "/favicon.svg" || path === "/favicon.ico";
}

function hostOf(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return String(v ?? "").split(",")[0].trim().split(":")[0].toLowerCase();
}

export const salonsHostGate: RequestHandler = (req, res, next) => {
  if (hostOf(req.headers["x-forwarded-host"] || req.headers.host) !== SALONS_HOST) return next();
  if (isDirectoryPath(req.path)) return next();
  res.redirect(301, `https://certxa.com${req.originalUrl}`);
};
