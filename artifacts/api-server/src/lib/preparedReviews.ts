/**
 * Google reviews on unclaimed prepared salon pages (owner, 2026-11-11): the real, salon-specific content a listing page
 * needs. Google's Places API (Place Details, the salon's saved place_id) gives up to five reviews ("most relevant"),
 * the rating and the total. Google's terms allow keeping them at most 30 days, so each salon is refreshed when its copy
 * is 28 days old, and any copy older than 30 days is deleted. Shown as Google's, with each reviewer's name; never marked
 * up as the business's own rating in search data (lib/salonSeo.ts). A salon that claims its page loses these: its own
 * Google Business Profile connection takes over.
 */
import { pool } from "../db";

export type PreparedReview = { author: string; authorUrl: string | null; photoUrl: string | null; rating: number; text: string; relativeTime: string | null; time: string | null };
export type PreparedReviews = { rating: number | null; total: number | null; reviews: PreparedReview[] };

const REFRESH_AFTER_DAYS = 28;
const KEEP_DAYS = 30;
const PER_RUN = 10;

/** The salon's current Google reviews, while they are within Google's 30 days and the salon is still unclaimed. */
export async function preparedReviews(storeId: number): Promise<PreparedReviews | null> {
  const { rows: [r] } = await pool.query(
    `SELECT r.rating, r.total, r.reviews FROM prepared_salon_reviews r
      WHERE r.store_id = $1 AND r.fetched_at > now() - ($2 || ' days')::interval
        AND EXISTS (SELECT 1 FROM salon_account_creation_jobs j WHERE j.store_id = r.store_id AND j.status = 'created' AND j.claimed_at IS NULL)`,
    [storeId, String(KEEP_DAYS)]).catch(() => ({ rows: [] as any[] }));
  if (!r) return null;
  return { rating: r.rating != null ? Number(r.rating) : null, total: r.total != null ? Number(r.total) : null, reviews: Array.isArray(r.reviews) ? r.reviews : [] };
}

async function fetchFromGoogle(placeId: string): Promise<PreparedReviews | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "rating,user_ratings_total,reviews");
  url.searchParams.set("reviews_sort", "most_relevant");
  url.searchParams.set("language", "en");
  url.searchParams.set("key", key);
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const body: any = await res.json().catch(() => null);
  if (!body || body.status !== "OK") throw new Error(`Places details ${body?.status ?? res.status}`);
  const p = body.result ?? {};
  return {
    rating: typeof p.rating === "number" ? p.rating : null,
    total: typeof p.user_ratings_total === "number" ? p.user_ratings_total : null,
    reviews: (Array.isArray(p.reviews) ? p.reviews : [])
      .filter((x: any) => String(x?.text ?? "").trim())
      .slice(0, 5)
      .map((x: any) => ({
        author: String(x.author_name ?? "Google user").slice(0, 80),
        authorUrl: typeof x.author_url === "string" ? x.author_url : null,
        photoUrl: typeof x.profile_photo_url === "string" ? x.profile_photo_url : null,
        rating: Math.max(1, Math.min(5, Number(x.rating) || 0)),
        text: String(x.text).replace(/\s+/g, " ").trim().slice(0, 1200),
        relativeTime: typeof x.relative_time_description === "string" ? x.relative_time_description : null,
        time: Number.isFinite(Number(x.time)) ? new Date(Number(x.time) * 1000).toISOString() : null,
      })),
  };
}

/**
 * One run (every server process calls it; a row lock gives each salon to one of them): delete copies past 30 days or
 * of claimed salons, then fetch the unclaimed salons with no copy, or one 28+ days old — a few per run.
 */
export async function refreshPreparedReviews(): Promise<void> {
  await pool.query(`DELETE FROM prepared_salon_reviews WHERE fetched_at <= now() - ($1 || ' days')::interval
                       OR NOT EXISTS (SELECT 1 FROM salon_account_creation_jobs j WHERE j.store_id = prepared_salon_reviews.store_id AND j.status = 'created' AND j.claimed_at IS NULL)`,
    [String(KEEP_DAYS)]);
  const { rows } = await pool.query(
    `SELECT j.store_id, j.place_id FROM salon_account_creation_jobs j
       LEFT JOIN prepared_salon_reviews r ON r.store_id = j.store_id
      WHERE j.status = 'created' AND j.claimed_at IS NULL AND j.store_id IS NOT NULL AND j.place_id IS NOT NULL AND j.place_id NOT LIKE 'TEST-%'
        AND (r.store_id IS NULL OR r.fetched_at <= now() - ($1 || ' days')::interval)
      ORDER BY r.fetched_at NULLS FIRST, j.id LIMIT $2`, [String(REFRESH_AFTER_DAYS), PER_RUN]);
  for (const row of rows) {
    // Claim the salon first, so two processes don't both fetch it.
    const claim = await pool.query(
      `INSERT INTO prepared_salon_reviews (store_id, place_id, fetched_at, reviews) VALUES ($1, $2, now(), '[]')
       ON CONFLICT (store_id) DO UPDATE SET fetched_at = now() WHERE prepared_salon_reviews.fetched_at <= now() - ($3 || ' days')::interval
       RETURNING store_id`, [row.store_id, row.place_id, String(REFRESH_AFTER_DAYS)]);
    if (!claim.rowCount) continue;
    try {
      const got = await fetchFromGoogle(row.place_id);
      if (!got) { await pool.query(`DELETE FROM prepared_salon_reviews WHERE store_id = $1`, [row.store_id]); continue; }
      await pool.query(`UPDATE prepared_salon_reviews SET rating = $2, total = $3, reviews = $4::jsonb, fetched_at = now() WHERE store_id = $1`,
        [row.store_id, got.rating, got.total, JSON.stringify(got.reviews)]);
    } catch (err: any) {
      // Nothing kept from a failed fetch, and it is tried again in about a week (not every run: each try costs).
      await pool.query(`UPDATE prepared_salon_reviews SET rating = NULL, total = NULL, reviews = '[]', fetched_at = now() - interval '21 days' WHERE store_id = $1`, [row.store_id]).catch(() => {});
      console.warn(`[prepared-reviews] store=${row.store_id}: ${err?.message ?? err}`);
    }
  }
  if (rows.length) console.log(`[prepared-reviews] refreshed up to ${rows.length} salons`);
}

let timer: ReturnType<typeof setInterval> | null = null;
/** Every 10 minutes, ten salons at a time: about 190 salons filled within a few hours, then kept within 30 days. */
export function startPreparedReviewsRefresh(): void {
  if (timer || !process.env.GOOGLE_MAPS_API_KEY) return;
  const run = () => { void refreshPreparedReviews().catch((e) => console.warn("[prepared-reviews] run failed:", e?.message ?? e)); };
  setTimeout(run, 60_000).unref();
  timer = setInterval(run, 10 * 60_000);
  timer.unref();
}
