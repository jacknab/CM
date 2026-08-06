import { type Request, type Response, type NextFunction } from "express";
import fs from "fs";
import path from "path";

const SEO_PAGE_ROUTES: Record<string, string> = {
  "/salons":            "salons.html",
  "/barbers":           "barbers.html",
  "/hair-salons":       "hair-salons.html",
  "/haircuts":          "hair-salons.html",
  "/nails":             "nails.html",
  "/tattoo":            "tattoo.html",
  "/estheticians":      "estheticians.html",
  "/groomers":          "groomers.html",
  "/handyman":          "handyman.html",
  "/hvac":              "hvac.html",
  "/plumbing":          "plumbing.html",
  "/electrical":        "electrical.html",
  "/lawn-care":         "lawn-care.html",
  "/house-cleaning":    "house-cleaning.html",
  "/tutoring":          "tutoring.html",
  "/snow-removal":      "snow-removal.html",
  "/dog-walking":       "dog-walking.html",
  "/carpet-cleaning":   "carpet-cleaning.html",
  "/pressure-washing":  "pressure-washing.html",
  "/window-cleaning":   "window-cleaning.html",
  "/ride-service":      "ride-service.html",
  "/industries":        "industries.html",
};

const SEO_PAGES_DIRS = [
  path.resolve(process.cwd(), "seo-pages"),
  path.resolve(process.cwd(), "artifacts", "booking", "public"),
  path.resolve(process.cwd(), "dist", "public"),
];

// Clean URLs for region landing pages — maps /dallas-tx-booking → dallas-tx-booking.html
// served from client/public (dev) or dist/public (prod).
const REGION_PAGES = [
  "dallas-tx-booking",
  "houston-tx-hair-salons",
  "houston-tx-nail-salons",
  "phoenix-az-hair-salons",
  "phoenix-az-nail-salons",
  "tempe-az-nail-salons",
];

const REGION_PUBLIC_DIRS = [
  path.resolve(process.cwd(), "artifacts", "booking", "public"),
  path.resolve(process.cwd(), "client", "public"),
  path.resolve(process.cwd(), "dist", "public"),
];

export function seoPageMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "GET" && req.method !== "HEAD") return next();

  // 1) Industry SEO pages from /seo-pages
  const filename = SEO_PAGE_ROUTES[req.path];
  if (filename) {
    for (const dir of SEO_PAGES_DIRS) {
      const filePath = path.join(dir, filename);
      if (fs.existsSync(filePath)) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        return res.sendFile(filePath);
      }
    }
  }

  // 2) Clean-URL region pages: /dallas-tx-booking → dallas-tx-booking.html
  const slug = req.path.replace(/^\/+/, "").replace(/\/$/, "");
  if (slug && REGION_PAGES.includes(slug)) {
    for (const dir of REGION_PUBLIC_DIRS) {
      const filePath = path.join(dir, `${slug}.html`);
      if (fs.existsSync(filePath)) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        return res.sendFile(filePath);
      }
    }
  }

  return next();
}
