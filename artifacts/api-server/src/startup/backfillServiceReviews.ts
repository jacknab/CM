import { db } from "../db";
import { sql } from "drizzle-orm";

/**
 * Boot-time backfill for AI service-review matching.
 *
 * The website template service cards show a real customer review per service,
 * read from `service_review_matches`. That table is normally kept fresh by
 * Phase 3 of the 24h Google-review sync sweep — but a store that isn't syncing
 * (or was last synced before Phase 3 existed) never gets populated, so its
 * cards stay blank.
 *
 * This runs once, a short while after boot, in the scheduler instance only.
 * It finds stores that have candidate reviews but zero matches and runs the
 * matcher for each, sequentially with a gap so we don't spike OpenAI. It is a
 * no-op on the next restart once matches exist (the lazy self-heal in
 * serviceReviewMatcher.ensureServiceReviewsFresh keeps them fresh after that).
 */

const MAX_STORES_PER_BOOT = 50;
const GAP_MS = 5_000;

export async function backfillServiceReviews(): Promise<void> {
  try {
    const res = await db.execute(sql`
      SELECT l.id
      FROM locations l
      WHERE (
              EXISTS (
                SELECT 1 FROM google_reviews gr
                WHERE gr.store_id = l.id
                  AND gr.review_text IS NOT NULL AND gr.review_text <> ''
              )
              OR EXISTS (
                SELECT 1 FROM reviews r
                WHERE r.store_id = l.id
                  AND r.photo_url IS NOT NULL AND r.photo_url <> ''
                  AND r.rating >= 5
              )
            )
        AND NOT EXISTS (
              SELECT 1 FROM service_review_matches srm WHERE srm.store_id = l.id
            )
      ORDER BY l.id
      LIMIT ${MAX_STORES_PER_BOOT}
    `);

    const storeIds = (res.rows as Array<{ id: number }>).map((r) => Number(r.id)).filter(Boolean);
    if (storeIds.length === 0) {
      console.log("[ServiceReviewBackfill] nothing to backfill");
      return;
    }

    console.log(`[ServiceReviewBackfill] ${storeIds.length} store(s) to backfill: ${storeIds.join(", ")}`);
    const { matchServiceReviewsForStore } = await import("../lib/serviceReviewMatcher");

    for (const storeId of storeIds) {
      try {
        const r = await matchServiceReviewsForStore(storeId);
        console.log(
          `[ServiceReviewBackfill] storeId=${storeId} reviewed=${r.reviewed} matched=${r.matched}`,
        );
      } catch (err) {
        console.warn(
          `[ServiceReviewBackfill] storeId=${storeId} failed:`,
          err instanceof Error ? err.message : err,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, GAP_MS));
    }

    console.log("[ServiceReviewBackfill] done");
  } catch (err) {
    console.warn(
      "[ServiceReviewBackfill] sweep failed:",
      err instanceof Error ? err.message : err,
    );
  }
}
