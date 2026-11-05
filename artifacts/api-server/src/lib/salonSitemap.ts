/**
 * certxa.com/salon-sitemap.xml — one sitemap listing every live salon website, so search engines can find them.
 *
 * Each salon is listed once, at the canonical URL its own page declares:
 *  - a published template website (wb_websites): siteBaseUrl(), no trailing slash, as template-serve's canonical;
 *  - a salon that never had a template website (Solo/Pro booking page): https://<booking_slug>.certxa.com/, as salonSeo's canonical.
 * Left out: websites whose store was deleted, unpublished websites, test salons, accounts that are stopped (suspended, closed, trial over —
 * their site is blocked), booking URLs and old slugs that only redirect.
 */
import { pool } from "../db";
import { siteBaseUrl } from "./template-serve";
import { isAccountStopped } from "./accountSuspension";

/** Salons that exist only for testing. The database has no test flag, so they are named here. */
export const TEST_STORE_IDS = new Set<number>([
  40, // "Test Salon — Evaluation Only" (test-salon-evaluation-only)
]);

export interface SalonSitemapEntry { storeId: number; loc: string }

export async function salonSitemapEntries(): Promise<SalonSitemapEntry[]> {
  // Starting from locations leaves out websites whose store no longer exists.
  const { rows } = await pool.query<{
    store_id: number; booking_slug: string | null; slug: string | null;
    custom_domain: string | null; custom_domain_status: string | null;
  }>(
    `SELECT l.id AS store_id, l.booking_slug, w.slug, w.custom_domain, w.custom_domain_status
       FROM locations l
       LEFT JOIN LATERAL (
         SELECT slug, custom_domain, custom_domain_status
           FROM wb_websites
          WHERE storeid = l.id::text AND published = true
          ORDER BY id LIMIT 1
       ) w ON true
      WHERE w.slug IS NOT NULL
         -- The booking page counts only for a salon that never had a template website; an unpublished one stays out.
         OR (NULLIF(l.booking_slug, '') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM wb_websites x WHERE x.storeid = l.id::text))
      ORDER BY l.id`,
  );

  const seen = new Set<string>();
  const out: SalonSitemapEntry[] = [];
  for (const r of rows) {
    if (TEST_STORE_IDS.has(r.store_id)) continue;
    if (await isAccountStopped(r.store_id)) continue;
    const loc = r.slug
      ? siteBaseUrl({ slug: r.slug, customDomain: r.custom_domain, customDomainStatus: r.custom_domain_status })
      : `${siteBaseUrl({ slug: r.booking_slug!, customDomain: null, customDomainStatus: null })}/`;
    if (!loc.startsWith("https://") || seen.has(loc)) continue;
    seen.add(loc);
    out.push({ storeId: r.store_id, loc });
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
