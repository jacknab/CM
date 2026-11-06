/**
 * Salons that exist only for testing: kept out of the central salon sitemap (salonSitemap.ts), the Bloom readable
 * summary (siteSummary.ts) and Solo service category pages (soloCategoryPages.ts). The database has no test flag,
 * so they are named here.
 */
export const TEST_STORE_IDS = new Set<number>([
  40, // "Test Salon — Evaluation Only" (test-salon-evaluation-only)
  41, // Certxa Pro test store (tobys, shown as "Massage By Josh") — owner, 2026-11-06
]);
