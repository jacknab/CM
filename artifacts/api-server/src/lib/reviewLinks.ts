/**
 * Review-gating shared helpers — used by both the review-request SMS sender
 * (sms.ts) and the public review-gating API (routes/reviewGating.ts).
 *
 * Pattern: a customer taps a unique, one-time link sent by SMS. They pick
 * Great / Just OK / Bad. Great and Just OK redirect out to the store's real
 * Google/Yelp review page; Bad stays on Certxa and collects private feedback
 * instead, so an unhappy customer never lands on a public review site.
 */

import { pool } from "../db";

/**
 * Only the token itself is a new concept — actual review content is stored
 * in the existing `reviews` table (see routes.ts's REVIEWS section and
 * shared/schema.ts's `reviews` export), same as the pre-existing
 * /api/reviews/form/:appointmentId + /api/reviews/submit flow. This just adds
 * secure, one-time, expiring links in front of it instead of a raw
 * appointment id in the URL.
 */
export async function ensureReviewTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS review_tokens (
      id             SERIAL PRIMARY KEY,
      token          TEXT NOT NULL UNIQUE,
      store_id       INTEGER NOT NULL REFERENCES locations(id),
      appointment_id INTEGER REFERENCES appointments(id),
      customer_id    INTEGER,
      customer_name  TEXT,
      customer_phone TEXT,
      expires_at     TIMESTAMPTZ NOT NULL,
      used_at        TIMESTAMPTZ,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_review_tokens_store_id ON review_tokens(store_id)`);
}

/**
 * Resolve the store's public review destination — Google only for this
 * codebase (no Yelp). Priority order:
 *   1. Manually-entered Google review URL in SMS settings
 *   2. The official "write a review" deep link Google returns once the
 *      store's Business Profile is fully OAuth-connected (metadata.newReviewUri,
 *      fetched by fetchAndStoreReviewLink in google-business-api.ts)
 *   3. A URL constructed from the Place ID discovered during the "search
 *      Google for your business" onboarding step (google_business_profiles.
 *      discovered_place_id) — lets a store get review-request SMS working
 *      even before it finishes full OAuth connection.
 * Returns null if none of the three are available.
 */
export async function resolveExternalReviewUrl(storeId: number): Promise<string | null> {
  const result = await pool.query(
    `SELECT ss.google_review_url AS sms_google_review_url,
            gbp.google_review_link AS gbp_review_link,
            gbp.discovered_place_id AS discovered_place_id
     FROM locations l
     LEFT JOIN sms_settings ss ON ss.store_id = l.id
     LEFT JOIN google_business_profiles gbp ON gbp.store_id = l.id
     WHERE l.id = $1
     LIMIT 1`,
    [storeId]
  );
  const row = result.rows[0];
  if (!row) return null;

  const googleUrl = row.sms_google_review_url?.trim() || row.gbp_review_link?.trim();
  if (googleUrl) return googleUrl;

  const placeId = row.discovered_place_id?.trim();
  if (placeId) return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;

  return null;
}

export interface ReviewTokenRow {
  id: number;
  storeId: number;
  appointmentId: number | null;
  customerId: number | null;
  customerName: string | null;
  customerPhone: string | null;
  expiresAt: Date;
  usedAt: Date | null;
  storeName: string | null;
}

export async function getReviewToken(token: string): Promise<ReviewTokenRow | null> {
  const result = await pool.query(
    `SELECT rt.id, rt.store_id, rt.appointment_id, rt.customer_id, rt.customer_name, rt.customer_phone,
            rt.expires_at, rt.used_at, l.name AS store_name
     FROM review_tokens rt
     LEFT JOIN locations l ON l.id = rt.store_id
     WHERE rt.token = $1
     LIMIT 1`,
    [token]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    storeId: row.store_id,
    appointmentId: row.appointment_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    expiresAt: new Date(row.expires_at),
    usedAt: row.used_at ? new Date(row.used_at) : null,
    storeName: row.store_name,
  };
}

export async function markReviewTokenUsed(tokenId: number): Promise<void> {
  await pool.query(`UPDATE review_tokens SET used_at = NOW() WHERE id = $1`, [tokenId]);
}
