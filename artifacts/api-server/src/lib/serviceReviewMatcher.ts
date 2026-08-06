/**
 * serviceReviewMatcher.ts
 *
 * Two matching strategies, unified into a single pipeline:
 *
 * 1. CLIENT REVIEWS (keyword-based, no OpenAI cost)
 *    - Source: `reviews` table (native Certxa reviews)
 *    - Filter: photo_url IS NOT NULL — only reviews with an attached photo
 *    - No date cutoff — all reviews are considered
 *    - Matching: word-overlap between service name tokens and review comment
 *    - Results stored in service_review_matches with review_id set
 *
 * 2. GOOGLE REVIEWS (OpenAI gpt-4o-mini, semantic understanding)
 *    - Source: `google_reviews` table
 *    - No date cutoff — all reviews considered, prefer those with uploaded review media
 *    - Results stored in service_review_matches with google_review_id set
 *
 * WHY: Service cards on the website show real social proof per service.
 * Only actual customer-result media makes a service card visually rich.
 * Reviewer profile avatars remain reviewer metadata and are never service images.
 */

import OpenAI from "openai";
import { db } from "../db";
import { sql } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GoogleReviewRow {
  id: number;
  customer_name: string | null;
  rating: number;
  review_text: string | null;
  review_create_time: Date | string | null;
  reviewer_photo_url: string | null;
}

interface ClientReviewRow {
  id: number;
  customer_name: string | null;
  rating: number;
  comment: string | null;
  photo_url: string;
  created_at: Date | string | null;
}

interface ServiceRow {
  id: number;
  name: string;
  category_id: number | null;
  category_name: string | null;
}

export interface ServiceReviewMatch {
  reviewId: number;
  serviceId: number;
  confidence: number;
  customerName: string | null;
  rating: number;
  comment: string;
  createdAt: string | null;
}

export interface ServiceReviewResult {
  serviceId: number;
  customerName: string | null;
  rating: number;
  comment: string;
  createdAt: string | null;
  /** Actual customer-result photo; never a Google reviewer profile photo. */
  photoUrl: string | null;
  /** Google reviewer profile picture — always a headshot, safe to use as avatar */
  reviewerAvatarUrl: string | null;
  reviewMediaItems: Array<Record<string, unknown>>;
  ownerReply: Record<string, unknown> | null;
}

// ── OpenAI singleton ──────────────────────────────────────────────────────────

function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey: key });
}

// ── Keyword matching helpers ──────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with",
  "is","it","its","be","was","are","do","so","my","me","we","our","your",
  "i","had","has","this","that","they","their","not","no","by","get",
  "got","very","just","really","too","up","also","can","did","all","her",
  "him","his","she","he","who","how","what","when","where","would","could",
  "been","have","will","from","more","than","then","there","these","those",
  "some","any","about","out","into","over","after","before","between",
]);

/**
 * Tokenise a string into lowercase meaningful words (>= 3 chars, no stop words).
 */
function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

/**
 * Compute the keyword-overlap confidence between a service signal and review text.
 *
 * @param serviceSignal - service name + category joined (e.g. "Gel Manicure Extensions")
 * @param reviewText    - raw review comment
 *
 * Returns 0 if no words overlap, 1.0 if every service word appears in the review.
 */
function keywordConfidence(serviceSignal: string, reviewText: string): number {
  const serviceTokens = tokenise(serviceSignal);
  if (serviceTokens.length === 0) return 0;

  const reviewTokenSet = new Set(tokenise(reviewText));
  // Build array once — used for substring scanning only; avoids O(n²) spread inside the loop.
  const reviewTokenArr = [...reviewTokenSet];

  let hits = 0;
  for (const token of serviceTokens) {
    if (reviewTokenSet.has(token)) {
      // Exact match — highest confidence signal.
      hits++;
    } else if (
      // Substring fallback for longer tokens only (>= 5 chars) to prevent
      // false positives like "gel" matching "angel" or "egel".
      token.length >= 5 &&
      reviewTokenArr.some(
        (rt) => rt.length >= 5 && (rt.includes(token) || token.includes(rt)),
      )
    ) {
      hits++;
    }
  }

  if (hits === 0) return 0;

  // Confidence: proportion of service words matched, scaled to [0.55, 1.0]
  const raw = hits / serviceTokens.length;
  return Math.min(1.0, 0.55 + raw * 0.45);
}

// ── Database I/O ──────────────────────────────────────────────────────────────

/**
 * Upsert a Google review match into service_review_matches.
 */
async function persistGoogleMatch(
  storeId: number,
  googleReviewId: number,
  serviceId: number,
  confidence: number,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO service_review_matches
      (store_id, google_review_id, service_id, confidence, matched_at)
    VALUES
      (${storeId}, ${googleReviewId}, ${serviceId}, ${confidence}, NOW())
    ON CONFLICT (google_review_id)
      WHERE google_review_id IS NOT NULL
    DO UPDATE SET
      service_id  = EXCLUDED.service_id,
      confidence  = EXCLUDED.confidence,
      matched_at  = NOW()
  `);
}

/**
 * Upsert a client review match into service_review_matches.
 */
async function persistClientMatch(
  storeId: number,
  reviewId: number,
  serviceId: number,
  confidence: number,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO service_review_matches
      (store_id, review_id, service_id, confidence, matched_at)
    VALUES
      (${storeId}, ${reviewId}, ${serviceId}, ${confidence}, NOW())
    ON CONFLICT (review_id)
      WHERE review_id IS NOT NULL
    DO UPDATE SET
      service_id  = EXCLUDED.service_id,
      confidence  = EXCLUDED.confidence,
      matched_at  = NOW()
  `);
}

// ── OpenAI matching (Google reviews) ─────────────────────────────────────────

/**
 * Match a batch of Google reviews to services using OpenAI semantic matching.
 */
async function matchGoogleReviewsToServices(
  reviews: GoogleReviewRow[],
  services: ServiceRow[],
): Promise<Map<number, { serviceId: number; confidence: number }>> {
  const openai = getOpenAI();

  const reviewList = reviews
    .map(
      (r) =>
        `[Review ${r.id}] ${r.rating}/5 — "${(r.review_text ?? "").replace(/"/g, "'")}"`,
    )
    .join("\n");

  const serviceList = services
    .map(
      (s) =>
        `[Service ${s.id}] ${s.name}${s.category_name ? ` (category: ${s.category_name})` : ""}`,
    )
    .join("\n");

  const prompt = `You are an expert at reading salon/spa customer reviews and determining which service each review is about.

SERVICES:
${serviceList}

REVIEWS:
${reviewList}

TASK:
For each review, determine which service ID it most likely refers to.
- Only match reviews that CLEARLY mention a specific service (keywords like "acrylic", "pedicure", "manicure", "gel", "dip", "wax", "facial", "massage", "lash", "brow", "hair", specific service names, etc.).
- If a review is too generic or mentions no specific service, skip it (do not include in output).
- If multiple services could match, pick the single best match.
- Assign a confidence from 0.50 to 1.00 (1.00 = explicit match, 0.50 = plausible but indirect).
- Only include matches with confidence >= 0.60.

Respond ONLY with a valid JSON object mapping review IDs to their best service match. Example:
{
  "12": { "serviceId": 5, "confidence": 0.95 },
  "17": { "serviceId": 2, "confidence": 0.80 }
}

Do not include any other text.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    max_tokens: 1024,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";

  let parsed: Record<string, { serviceId: number; confidence: number }> = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("[ServiceReviewMatcher] Failed to parse OpenAI response:", raw.slice(0, 300));
    return new Map();
  }

  const result = new Map<number, { serviceId: number; confidence: number }>();
  for (const [reviewIdStr, match] of Object.entries(parsed)) {
    const reviewId = parseInt(reviewIdStr, 10);
    if (isNaN(reviewId) || !match?.serviceId) continue;

    const valid = services.find((s) => s.id === match.serviceId);
    if (!valid) continue;

    result.set(reviewId, {
      serviceId: match.serviceId,
      confidence: Math.min(1.0, Math.max(0.0, Number(match.confidence) || 0.7)),
    });
  }

  return result;
}

// ── Client review keyword matching ────────────────────────────────────────────

/**
 * Match ALL client reviews that have a photo to services using keyword overlap.
 * No date limit — every good (rating >= 4) photo review from all time is considered.
 *
 * Each review maps to its best-matching service (one service per review).
 * Multiple reviews can map to the same service — getServiceReviewsForStore
 * then picks the most recent among them.
 */
async function matchClientReviewsForStore(
  storeId: number,
  services: ServiceRow[],
): Promise<{ reviewed: number; matched: number }> {
  // Fetch 5-star photo reviews for this store (no date cutoff).
  // We only match reviews that can actually show on service cards (rating >= 5).
  const reviewResult = await db.execute(sql`
    SELECT id, customer_name, rating, comment, photo_url, created_at
    FROM reviews
    WHERE store_id = ${storeId}
      AND photo_url IS NOT NULL
      AND photo_url != ''
      AND comment IS NOT NULL
      AND comment != ''
      AND rating >= 5
    ORDER BY created_at DESC
  `);
  const clientReviews = reviewResult.rows as unknown as ClientReviewRow[];

  if (clientReviews.length === 0) {
    console.log(`[ServiceReviewMatcher] No good photo client reviews for storeId=${storeId}`);
    return { reviewed: 0, matched: 0 };
  }

  console.log(
    `[ServiceReviewMatcher] Keyword-matching ${clientReviews.length} photo client reviews against ${services.length} services`,
  );

  // Each review maps to the single best-matching service.
  // Multiple reviews may map to the same service — that's intentional;
  // getServiceReviewsForStore picks the latest one per service.
  let matched = 0;
  for (const review of clientReviews) {
    const text = review.comment ?? "";
    if (!text.trim()) continue;

    let bestServiceId: number | null = null;
    let bestConf = 0.5; // minimum threshold

    for (const service of services) {
      // Combine service name + category for richer signal.
      // e.g. "Full Set" in category "Extensions" scores "gel full set extensions"
      // which correctly outscores a generic "Full Set" in "Manicures".
      const signal = `${service.name} ${service.category_name ?? ""}`.trim();
      const conf = keywordConfidence(signal, text);
      if (conf > bestConf) {
        bestConf = conf;
        bestServiceId = service.id;
      }
    }

    if (bestServiceId === null) continue;

    try {
      await persistClientMatch(storeId, review.id, bestServiceId, bestConf);
      matched++;
    } catch (err) {
      console.warn(
        `[ServiceReviewMatcher] Could not persist client match reviewId=${review.id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(
    `[ServiceReviewMatcher] Client reviews: ${clientReviews.length} considered, ${matched} matched`,
  );
  return { reviewed: clientReviews.length, matched };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Run the full match pipeline for a store.
 *
 * Pass 1 — Client reviews (keyword, free, photo-only, no date limit):
 *   Matches photo reviews from the `reviews` table to services by word overlap.
 *
 * Pass 2 — Google reviews (OpenAI semantic):
 *   All Google reviews with text and rating >= 4 are matched, but only reviews
 *   with uploaded review media are eligible for service-card display.
 *   No date cutoff — entire history is considered.
 *
 * Returns a summary { reviewed, matched } suitable for logging.
 */
export async function matchServiceReviewsForStore(storeId: number): Promise<{
  reviewed: number;
  matched: number;
}> {
  console.log(`[ServiceReviewMatcher] ── START storeId=${storeId} ──`);

  // Ensure the table + indexes exist (graceful no-op if already created via migration)
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS service_review_matches (
        id                SERIAL PRIMARY KEY,
        store_id          INTEGER NOT NULL,
        google_review_id  INTEGER,
        review_id         INTEGER,
        service_id        INTEGER NOT NULL,
        confidence        NUMERIC(4,3) NOT NULL DEFAULT 1.0,
        matched_at        TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at        TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS srm_google_review_unique
        ON service_review_matches(google_review_id)
        WHERE google_review_id IS NOT NULL
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS srm_client_review_unique
        ON service_review_matches(review_id)
        WHERE review_id IS NOT NULL
    `);
  } catch {
    // Table already exists — ignore
  }

  // ── Fetch active services with category names ────────────────────────────
  const serviceResult = await db.execute(sql`
    SELECT s.id, s.name, s.category_id, sc.name AS category_name
    FROM services s
    LEFT JOIN service_categories sc ON sc.id = s.category_id
    WHERE s.store_id = ${storeId}
      AND (s.is_active IS NULL OR s.is_active = true)
    ORDER BY s.category_id NULLS LAST, s.id
    LIMIT 200
  `);
  const services = serviceResult.rows as unknown as ServiceRow[];

  if (services.length === 0) {
    console.log(`[ServiceReviewMatcher] No active services found for storeId=${storeId}`);
    return { reviewed: 0, matched: 0 };
  }

  // ── Pass 1: Client reviews with photos (keyword matching) ────────────────
  const clientResult = await matchClientReviewsForStore(storeId, services);

  // ── Pass 2: Google reviews (OpenAI semantic) ────────────────────────────
  // Fetch ALL Google reviews (no date cutoff). Reviewer avatars are not used
  // as service images; review media is carried through separately.
  let googleReviewed = 0;
  let googleMatched = 0;

  try {
    const reviewResult = await db.execute(sql`
      SELECT id, customer_name, rating, review_text, review_create_time, reviewer_photo_url
      FROM google_reviews
      WHERE store_id = ${storeId}
        AND rating >= 5
        AND review_text IS NOT NULL
        AND review_text != ''
      ORDER BY
        -- Prefer reviews with uploaded media so they rank first in the output query
        (review_media_items IS NOT NULL AND jsonb_array_length(COALESCE(review_media_items, '[]'::jsonb)) > 0) DESC,
        review_create_time DESC
      LIMIT 150
    `);
    const googleReviews = reviewResult.rows as unknown as GoogleReviewRow[];
    googleReviewed = googleReviews.length;

    if (googleReviews.length > 0) {
      const CHUNK_SIZE = 40;
      for (let i = 0; i < googleReviews.length; i += CHUNK_SIZE) {
        const chunk = googleReviews.slice(i, i + CHUNK_SIZE);
        console.log(
          `[ServiceReviewMatcher] Google chunk ${Math.floor(i / CHUNK_SIZE) + 1}` +
            ` (${chunk.length} reviews, storeId=${storeId})`,
        );
        try {
          const matches = await matchGoogleReviewsToServices(chunk, services);
          for (const [reviewId, { serviceId, confidence }] of matches) {
            try {
              await persistGoogleMatch(storeId, reviewId, serviceId, confidence);
              googleMatched++;
            } catch (err) {
              console.warn(
                `[ServiceReviewMatcher] Could not persist google match reviewId=${reviewId}:`,
                err instanceof Error ? err.message : err,
              );
            }
          }
        } catch (err) {
          console.error(
            `[ServiceReviewMatcher] Google chunk failed:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    }
  } catch (err) {
    console.warn("[ServiceReviewMatcher] Google review pass failed:", err instanceof Error ? err.message : err);
  }

  const totalReviewed = clientResult.reviewed + googleReviewed;
  const totalMatched = clientResult.matched + googleMatched;

  console.log(
    `[ServiceReviewMatcher] ── DONE storeId=${storeId}` +
      ` client(reviewed=${clientResult.reviewed}, matched=${clientResult.matched})` +
      ` google(reviewed=${googleReviewed}, matched=${googleMatched}) ──`,
  );
  return { reviewed: totalReviewed, matched: totalMatched };
}

// ── Query matched reviews for a store (used by tenant data & website builder) ─

/**
 * Returns the best review payload for each service. Reviewer avatars are
 * reviewer metadata only and are never treated as service-result photos.
 *
 * Priority order per service:
 *   1. Google review with uploaded review media
 *   2. Client review with an uploaded customer-result photo
 *   3. Google review without approved media (falls back to service image)
 *
 * Returns a dict keyed by service_id.
 */
export async function getServiceReviewsForStore(
  storeId: number,
): Promise<Record<number, ServiceReviewResult>> {
  try {
    // Unified query: UNION of client-photo matches and Google matches,
    // scored so priorities are:
    //   1) Google review with approved media AND strong match confidence
    //   2) Client review with uploaded customer-result photo
    //   3) Google review with approved media but weaker confidence
    //   4) Google review without approved media (falls back to service image)
    const result = await db.execute(sql`
      SELECT DISTINCT ON (service_id)
        service_id,
        customer_name,
        rating,
        comment,
        created_at,
        photo_url,
        reviewer_avatar_url,
        review_media_items,
        owner_reply,
        confidence,
        service_name,
        service_category_name,
        priority
      FROM (
        -- Google reviews with uploaded review media (highest priority).
        -- reviewer_photo_url is reviewer information, never photo_url.
        SELECT
          srm.service_id,
          gr.customer_name,
          gr.rating,
          gr.review_text AS comment,
          gr.review_create_time AS created_at,
          NULL::TEXT AS photo_url,
          gr.reviewer_photo_url AS reviewer_avatar_url,
          gr.review_media_items,
          gr.owner_reply,
          srm.confidence,
          s.name AS service_name,
          sc.name AS service_category_name,
          CASE
            WHEN EXISTS (
              SELECT 1
              FROM jsonb_array_elements(COALESCE(gr.review_media_items, '[]'::jsonb)) AS media
              WHERE NULLIF(media->>'thumbnailUrl', '') IS NOT NULL
            ) AND COALESCE(srm.confidence, 0) >= 0.80 THEN 1
            WHEN EXISTS (
              SELECT 1
              FROM jsonb_array_elements(COALESCE(gr.review_media_items, '[]'::jsonb)) AS media
              WHERE NULLIF(media->>'thumbnailUrl', '') IS NOT NULL
            ) THEN 3
            ELSE 4
          END AS priority
        FROM service_review_matches srm
        JOIN google_reviews gr ON gr.id = srm.google_review_id
        JOIN services s ON s.id = srm.service_id
        LEFT JOIN service_categories sc ON sc.id = s.category_id
        WHERE srm.store_id = ${storeId}
          AND srm.google_review_id IS NOT NULL
          AND gr.rating >= 5
          AND gr.review_text IS NOT NULL

        UNION ALL

        -- Client reviews with uploaded customer-result photos.
        -- photo_url = uploaded nail-work image; reviewer_avatar_url = null (not a headshot)
        SELECT
          srm.service_id,
          r.customer_name,
          r.rating,
          r.comment,
          r.created_at,
          r.photo_url,
          NULL::TEXT AS reviewer_avatar_url,
          NULL::JSONB AS review_media_items,
          NULL::JSONB AS owner_reply,
          srm.confidence,
          s.name AS service_name,
          sc.name AS service_category_name,
          2 AS priority
        FROM service_review_matches srm
        JOIN reviews r ON r.id = srm.review_id
        JOIN services s ON s.id = srm.service_id
        LEFT JOIN service_categories sc ON sc.id = s.category_id
        WHERE srm.store_id = ${storeId}
          AND srm.review_id IS NOT NULL
          AND r.photo_url IS NOT NULL
          AND r.photo_url != ''
          AND r.rating >= 5

      ) ranked
      ORDER BY service_id, priority ASC, confidence DESC, created_at DESC NULLS LAST, rating DESC
    `);

    const dict: Record<number, ServiceReviewResult> = {};
    for (const row of result.rows as any[]) {
      const reviewMediaItems = Array.isArray(row.review_media_items)
        ? row.review_media_items.filter(
            (item: unknown) =>
              !!item &&
              typeof item === "object" &&
              typeof (item as Record<string, unknown>).thumbnailUrl === "string" &&
              Boolean((item as Record<string, unknown>).thumbnailUrl),
          )
        : [];

      const rowConfidence = Number(row.confidence ?? 0);
      const serviceName = String(row.service_name ?? "");
      const serviceCategory = String(row.service_category_name ?? "");
      const reviewText = String(row.comment ?? "");

      // Final guardrail to avoid obvious media/service mismatches on public cards.
      // If confidence is weak and the review text does not lexically align with the
      // service name/category, suppress Google media and fall back to service image.
      const lexicalSignal = keywordConfidence(
        `${serviceName} ${serviceCategory}`.trim() || serviceName,
        reviewText,
      );
      const mediaEligibleByMatch =
        rowConfidence >= 0.82 ||
        lexicalSignal >= 0.78 ||
        (rowConfidence >= 0.72 && lexicalSignal >= 0.62);

      const approvedMediaItems = mediaEligibleByMatch ? reviewMediaItems : [];

      const hasApprovedGooglePhoto = approvedMediaItems.length > 0;
      // photoUrl must be a real customer-uploaded result photo only.
      // Never put the service's own image here — clients use that as a
      // fallback themselves via the service record; stuffing it into photoUrl
      // causes isCustomerImage() to fire the badge on ordinary service photos.
      const resolvedPhotoUrl: string | null =
        typeof row.photo_url === "string" && row.photo_url.trim() ? row.photo_url : null;

      // Skip rows with absolutely no renderable content.
      // A text-only 5-star review (comment but no photo/media) is still useful.
      if (!resolvedPhotoUrl && !hasApprovedGooglePhoto && !String(row.comment ?? "").trim()) continue;

      dict[row.service_id] = {
        serviceId: row.service_id,
        customerName: row.customer_name ?? null,
        rating: Number(row.rating),
        comment: row.comment ?? "",
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        photoUrl: resolvedPhotoUrl,
        reviewerAvatarUrl: row.reviewer_avatar_url ?? null,
        reviewMediaItems: approvedMediaItems,
        ownerReply: row.owner_reply ?? null,
      };
    }
    return dict;
  } catch (err) {
    console.warn("[ServiceReviewMatcher] getServiceReviewsForStore failed:", err instanceof Error ? err.message : err);
    return {};
  }
}
