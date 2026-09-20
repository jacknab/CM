/**
 * Review-gating shared helpers — used by both the review-request SMS sender
 * (sms.ts) and the public review-gating API (routes/reviewGating.ts).
 *
 * Pattern: a customer taps a unique, one-time link sent by SMS. They pick
 * Great / Just OK / Bad. Great and Just OK redirect out to the store's real
 * Google/Yelp review page; Bad stays on Certxa and collects private feedback
 * instead, so an unhappy customer never lands on a public review site.
 */

import { pool, db } from "../db";
import { clientMarketingPreferences } from "@shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

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
  // email_sent_at is its own column (distinct from used_at, which only means
  // "the visitor clicked/submitted") because SMS and email are independently
  // toggled per store — one appointment's token can be emailed and texted
  // separately, and each channel needs its own send-dedup signal so enabling
  // both doesn't cause one channel's send to block the other.
  await pool.query(`ALTER TABLE review_tokens ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ`);
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

export interface CreateReviewTokenInput {
  storeId: number;
  appointmentId: number;
  customerId?: number | null;
  customerName?: string | null;
  customerPhone?: string | null;
}

/**
 * One token per appointment, shared by both the SMS and email review-request
 * senders — whichever channel fires first creates it, the other reuses the
 * same link. Safe to call from both without creating duplicate tokens for
 * the same appointment.
 */
export async function createReviewToken(input: CreateReviewTokenInput): Promise<string> {
  const existing = await pool.query(
    `SELECT token FROM review_tokens WHERE appointment_id = $1 LIMIT 1`,
    [input.appointmentId]
  );
  if (existing.rows[0]) return existing.rows[0].token as string;

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
  await pool.query(
    `INSERT INTO review_tokens (token, store_id, appointment_id, customer_id, customer_name, customer_phone, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      token,
      input.storeId,
      input.appointmentId,
      input.customerId ?? null,
      input.customerName ?? null,
      input.customerPhone ?? null,
      expiresAt,
    ]
  );
  return token;
}

/** True once an email review-request has already been sent for this appointment. */
export async function hasEmailedReviewRequest(appointmentId: number): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM review_tokens WHERE appointment_id = $1 AND email_sent_at IS NOT NULL LIMIT 1`,
    [appointmentId]
  );
  return result.rows.length > 0;
}

export async function markReviewTokenEmailed(appointmentId: number): Promise<void> {
  await pool.query(
    `UPDATE review_tokens SET email_sent_at = NOW() WHERE appointment_id = $1`,
    [appointmentId]
  );
}

/**
 * True when this customer has opted out of review-request messages via
 * client_marketing_preferences.review_requests (default true — most clients
 * never touch this setting, so absence of a row means "not opted out").
 */
export async function hasOptedOutOfReviewRequests(clientId: number | null | undefined): Promise<boolean> {
  if (!clientId) return false;
  const [prefs] = await db
    .select({ reviewRequests: clientMarketingPreferences.reviewRequests })
    .from(clientMarketingPreferences)
    .where(eq(clientMarketingPreferences.clientId, clientId));
  return prefs?.reviewRequests === false;
}
