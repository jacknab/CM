/**
 * tenant-data.ts
 *
 * Shared library for generating tenant data JSON files.
 * Used by both the export script and the API server for serving
 * pre-generated website data.
 *
 * The data contract matches the useSiteData hook in template_master.
 */

import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

// ── Types (matching useSiteData.ts data contract) ─────────────────────────────

export interface BusinessData {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  booking_slug: string | null;
  category: string | null;
  yelp_alias: string | null;
  facebook_page_id: string | null;
  timezone: string | null;
  parking_options: string[] | null;
  accessibility_features: string[] | null;
  latitude: string | null;
  longitude: string | null;
}

export interface HoursEntry {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
}

export interface ServiceEntry {
  id: number;
  name: string;
  price: string | number;
  duration: number;
  category_id: number | null;
  description: string | null;
  image_url: string | null;
}

export interface CategoryEntry {
  id: number;
  name: string;
}

export interface StaffEntry {
  id: number;
  name: string;
  role: string | null;
  avatar_url: string | null;
  bio: string | null;
}

export interface ReviewEntry {
  customer_name: string | null;
  reviewer_photo_url: string | null;
  rating: number;
  review_text: string | null;
  review_create_time: string | null;
  review_image_urls: string[] | null;
  review_media_items: Array<Record<string, unknown>> | null;
  owner_reply: Record<string, unknown> | null;
  /** Legacy aliases retained for existing templates. */
  comment: string | null;
  created_at: string | null;
}

export interface ServiceReviewEntry {
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

export interface GalleryPhotoEntry {
  image_url: string;
  caption: string | null;
}

export interface WebsiteMeta {
  id: number;
  name: string;
  slug: string;
}

export interface TenantData {
  website: WebsiteMeta;
  business: BusinessData | null;
  hours: HoursEntry[];
  services: ServiceEntry[];
  serviceCategories: CategoryEntry[];
  staff: StaffEntry[];
  reviews: ReviewEntry[];
  /** Total Google review count across all ratings (the real GBP number) */
  googleReviewCount: number;
  /** Aggregate average rating across all Google reviews */
  googleAvgRating: number;
  /** Keyed by service ID — best matched Google review for each service */
  serviceReviews: Record<number, ServiceReviewEntry>;
  /** Photos explicitly uploaded for the website gallery (show_on_website = true) */
  galleryPhotos: GalleryPhotoEntry[];
}

export interface TenantDataWithMeta extends TenantData {
  meta: {
    location_id: number;
    exported_at: string;
    slug: string;
    cache_version: number;
  };
}

// ── Cache version (bump to invalidate all cached data) ────────────────────────

export const CACHE_VERSION = 1;

// ── Safe query helper ─────────────────────────────────────────────────────────

async function safeQuery<T>(statement: any): Promise<T[]> {
  try {
    const result = await db.execute(statement);
    return result.rows as T[];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  [warn] Query failed (table may not exist): ${msg}`);
    return [];
  }
}

// ── Build tenant data for a given storeid ─────────────────────────────────────

export async function buildTenantData(
  storeid: number | string,
  website: { id: number; name: string; slug: string }
): Promise<TenantData> {
  const storeIdNum = typeof storeid === 'string' ? parseInt(storeid, 10) : storeid;
  if (isNaN(storeIdNum)) {
    throw new Error(`Invalid storeid: ${storeid}`);
  }

  // Business data
  const businessRows = await safeQuery<BusinessData>(
    sql`SELECT id, name, address, phone, email, city, state, postcode, booking_slug, category,
               yelp_alias, facebook_page_id, timezone,
               parking_options, accessibility_features,
               store_latitude AS latitude, store_longitude AS longitude
        FROM locations WHERE id = ${storeIdNum} LIMIT 1`
  );
  const business = businessRows.length > 0 ? businessRows[0] : null;

  // Business hours
  const hours = await safeQuery<HoursEntry>(
    sql`SELECT day_of_week, open_time, close_time, is_closed
        FROM business_hours WHERE store_id = ${storeIdNum} ORDER BY day_of_week`
  );

  // Service categories (exclude hidden-from-public)
  const serviceCategories = await safeQuery<CategoryEntry>(
    sql`SELECT id, name
        FROM service_categories
        WHERE store_id = ${storeIdNum}
          AND (hidden_from_public IS NULL OR hidden_from_public = false)
        ORDER BY sort_order NULLS LAST, id`
  );

  // Services (exclude hidden-from-public)
  const services = await safeQuery<ServiceEntry>(
    sql`SELECT id, name, price, duration, category_id, description, image_url
        FROM services
        WHERE store_id = ${storeIdNum}
          AND (is_active IS NULL OR is_active = true)
          AND (hidden_from_public IS NULL OR hidden_from_public = false)
        ORDER BY category_id NULLS LAST, id`
  );

  // Staff (active only)
  const staff = await safeQuery<StaffEntry>(
    sql`SELECT id, name, role, avatar_url, bio
        FROM staff
        WHERE store_id = ${storeIdNum}
          AND (status IS NULL OR status = 'active')
        ORDER BY id
        LIMIT 20`
  );

  // Reviews: try Google reviews first; fall back to internal reviews
  let reviews = await safeQuery<ReviewEntry>(
    sql`SELECT customer_name,
               reviewer_photo_url,
               rating,
               review_text AS comment,
               review_text,
               review_create_time AS created_at,
               review_create_time AS review_create_time,
               COALESCE(review_image_urls, '[]')::JSONB AS review_image_urls,
               review_media_items,
               owner_reply
        FROM google_reviews
        WHERE store_id = ${storeIdNum}
          AND rating >= 4
        ORDER BY review_create_time DESC
        LIMIT 20`
  );

  if (reviews.length === 0) {
    reviews = await safeQuery<ReviewEntry>(
      sql`SELECT customer_name,
                 NULL::TEXT AS reviewer_photo_url,
                 rating,
                 comment AS review_text,
                 comment,
                 created_at AS review_create_time,
                 created_at,
                 '[]'::JSONB AS review_image_urls,
                 NULL::JSONB AS review_media_items,
                 NULL::JSONB AS owner_reply
          FROM reviews
          WHERE store_id = ${storeIdNum}
            AND is_public = true
          ORDER BY created_at DESC
          LIMIT 20`
    );
  }

  // Aggregate Google review count + avg rating (all ratings, not just the sampled subset)
  let googleReviewCount = 0;
  let googleAvgRating = 0;
  try {
    const aggRows = await safeQuery<{ cnt: string | number; avg: string | number | null }>(
      sql`SELECT COUNT(*) AS cnt, AVG(rating) AS avg
          FROM google_reviews
          WHERE store_id = ${storeIdNum}`
    );
    if (aggRows.length > 0) {
      googleReviewCount = Number(aggRows[0].cnt ?? 0);
      googleAvgRating =
        googleReviewCount > 0
          ? Math.round(Number(aggRows[0].avg ?? 0) * 10) / 10
          : 0;
    }
  } catch {
    // Non-fatal — fall back to counting the sampled reviews array
    googleReviewCount = reviews.length;
    googleAvgRating =
      reviews.length > 0
        ? Math.round(
            (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10
          ) / 10
        : 0;
  }

  // Service-matched reviews (AI-matched Google reviews keyed by service_id)
  let serviceReviews: Record<number, ServiceReviewEntry> = {};
  try {
    const { getServiceReviewsForStore } = await import("./serviceReviewMatcher");
    serviceReviews = await getServiceReviewsForStore(storeIdNum);
  } catch {
    // Non-fatal — table may not exist yet in this environment
  }

  // Gallery photos (show_on_website = true, ordered by sort_order)
  const galleryPhotos = await safeQuery<GalleryPhotoEntry>(
    sql`SELECT image_url, caption
        FROM wb_gallery_photos
        WHERE store_id = ${storeIdNum}
          AND show_on_website = true
        ORDER BY sort_order ASC, created_at ASC
        LIMIT 50`
  );

  return {
    website,
    business,
    hours,
    services,
    serviceCategories,
    staff,
    reviews,
    googleReviewCount,
    googleAvgRating,
    serviceReviews,
    galleryPhotos,
  };
}

// ── Get all published websites with their storeid ─────────────────────────────

export async function getPublishedWebsites(): Promise<
  Array<{ id: number; name: string; slug: string; storeid: number }>
> {
  const result = await db.execute(sql`
    SELECT id, name, slug, storeid
    FROM wb_websites
    WHERE published = true
      AND storeid IS NOT NULL
    ORDER BY id
  `);
  return result.rows as Array<{ id: number; name: string; slug: string; storeid: number }>;
}

// ── Get website by slug ───────────────────────────────────────────────────────

export async function getWebsiteBySlug(
  slug: string
): Promise<{ id: number; name: string; slug: string; storeid: number } | null> {
  const result = await db.execute(sql`
    SELECT id, name, slug, storeid
    FROM wb_websites
    WHERE slug = ${slug}
      AND published = true
      AND storeid IS NOT NULL
    LIMIT 1
  `);
  if (result.rows.length === 0) return null;
  return result.rows[0] as { id: number; name: string; slug: string; storeid: number };
}

// ── Generate complete tenant data file with metadata ──────────────────────────

export async function generateTenantDataFile(
  slug: string
): Promise<TenantDataWithMeta | null> {
  const website = await getWebsiteBySlug(slug);
  if (!website) return null;

  const data = await buildTenantData(website.storeid, website);

  return {
    ...data,
    meta: {
      location_id: website.storeid,
      exported_at: new Date().toISOString(),
      slug: website.slug,
      cache_version: CACHE_VERSION,
    },
  };
}

// ── Generate tenant data for all published websites ───────────────────────────

export async function generateAllTenantData(): Promise<{
  success: number;
  errors: number;
  results: Array<{ slug: string; success: boolean; error?: string }>;
}> {
  const websites = await getPublishedWebsites();
  const results: Array<{ slug: string; success: boolean; error?: string }> = [];
  let success = 0;
  let errors = 0;

  for (const site of websites) {
    try {
      const data = await buildTenantData(site.storeid, site);
      // Verify data is valid by checking it serializes
      JSON.stringify(data);
      success++;
      results.push({ slug: site.slug, success: true });
    } catch (err) {
      errors++;
      results.push({
        slug: site.slug,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { success, errors, results };
}
