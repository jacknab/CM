/**
 * certxa.com/salon-sitemap.xml — one sitemap listing every live salon website, so search engines can find them.
 *
 * Each salon is listed once, at the canonical URL its own page declares:
 *  - a published template website (wb_websites): siteBaseUrl(), no trailing slash, as template-serve's canonical;
 *  - any other salon whose address shows its booking page (no published template website — none yet, or only an
 *    unpublished draft): https://<booking_slug>.certxa.com/, as salonSeo's canonical, plus its Solo category pages —
 *    when that page has something on it (at least one public, active service) and is open: a salon that switched its
 *    booking system off shows only a "not taking bookings" notice there, unless it uses the Solo design (which stays up).
 * Every genuine salon appears by itself once it qualifies, and leaves when it no longer does (owner, 2026-11-06).
 * Left out: websites whose store was deleted, test salons, accounts that are stopped (suspended, closed, trial over —
 * their site is blocked), booking URLs and old slugs that only redirect.
 */
import { pool } from "../db";
import { siteBaseUrl } from "./template-serve";
import { isAccountStopped } from "./accountSuspension";
import { isBookingSystemOff } from "./bookingSystem";
import { buildTenantData } from "./tenant-data";
import { CATEGORY_PAGE_STORE_IDS, categoryPagesFor, categoryPageUrl } from "./categoryPages";
import { isSoloDesign, soloCategoryPages } from "./soloCategoryPages";

// Salons that exist only for testing (lib/testStores.ts); re-exported for existing imports.
import { TEST_STORE_IDS } from "./testStores";
export { TEST_STORE_IDS };

export interface SalonSitemapEntry { storeId: number; loc: string }

export async function salonSitemapEntries(): Promise<SalonSitemapEntry[]> {
  // Starting from locations leaves out websites whose store no longer exists.
  const { rows } = await pool.query<{
    store_id: number; booking_slug: string | null; slug: string | null;
    custom_domain: string | null; custom_domain_status: string | null;
    category: string | null; booking_theme: string | null;
  }>(
    `SELECT l.id AS store_id, l.booking_slug, w.slug, w.custom_domain, w.custom_domain_status, l.category, l.booking_theme
       FROM locations l
       LEFT JOIN LATERAL (
         SELECT slug, custom_domain, custom_domain_status
           FROM wb_websites
          WHERE storeid = l.id::text AND published = true
          ORDER BY id LIMIT 1
       ) w ON true
      WHERE w.slug IS NOT NULL
         -- No published template website: the salon's address shows its booking page, listed when it has at least one
         -- public, active service (an empty page is nothing to show anyone).
         OR (NULLIF(l.booking_slug, '') IS NOT NULL
             AND EXISTS (SELECT 1 FROM services s WHERE s.store_id = l.id AND COALESCE(s.is_active, true)
                                                    AND COALESCE(s.hidden_from_public, false) = false))
      ORDER BY l.id`,
  );

  const seen = new Set<string>();
  const out: SalonSitemapEntry[] = [];
  for (const r of rows) {
    if (TEST_STORE_IDS.has(r.store_id)) continue;
    if (await isAccountStopped(r.store_id)) continue;
    // Booking switched off: a booking page (other than the Solo design) shows only "not taking online bookings".
    if (!r.slug && r.booking_theme !== "solo" && await isBookingSystemOff(r.store_id)) continue;
    const loc = r.slug
      ? siteBaseUrl({ slug: r.slug, customDomain: r.custom_domain, customDomainStatus: r.custom_domain_status })
      : `${siteBaseUrl({ slug: r.booking_slug!, customDomain: null, customDomainStatus: null })}/`;
    if (!loc.startsWith("https://") || seen.has(loc)) continue;
    seen.add(loc);
    out.push({ storeId: r.store_id, loc });
    // The website's service category pages, where they're on (lib/categoryPages.ts).
    if (r.slug && CATEGORY_PAGE_STORE_IDS.has(r.store_id)) {
      try {
        const td = await buildTenantData(r.store_id, { id: 0, name: "", slug: r.slug });
        for (const page of categoryPagesFor(td, r.store_id)) out.push({ storeId: r.store_id, loc: categoryPageUrl(loc, page) });
      } catch { /* the homepage stays listed */ }
    }
    // A Solo website's service category pages (lib/soloCategoryPages.ts), at the same address as its pages give.
    if (!r.slug && isSoloDesign(r.booking_theme)) {
      try {
        for (const page of await soloCategoryPages(r.store_id, r.category)) out.push({ storeId: r.store_id, loc: `${loc}services/${page.slug}/` });
      } catch { /* the homepage stays listed */ }
    }
  }
  return out;
}

function xmlEsc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function salonSitemapXml(entries: SalonSitemapEntry[]): string {
  // No <lastmod>: nothing records when a salon's page content (services, photos, reviews) last changed.
  const urls = entries.map(e => `  <url><loc>${xmlEsc(e.loc)}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}${urls ? "\n" : ""}</urlset>\n`;
}
