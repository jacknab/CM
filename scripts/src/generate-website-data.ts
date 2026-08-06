/**
 * generate-website-data.ts
 *
 * Generates static JSON files for all published websites in the Certxa booking system.
 * Each JSON file contains the complete data needed to render a website template
 * with live salon data (business info, hours, services, staff, reviews).
 *
 * This script is designed to be run:
 * - As a cron job (e.g., every 5 minutes)
 * - On demand when a website is published
 * - During deployment to pre-generate all website data
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run generate-website-data
 *   pnpm --filter @workspace/scripts run generate-website-data -- --out ./website-data
 *   pnpm --filter @workspace/scripts run generate-website-data -- --slug mysalon
 *   pnpm --filter @workspace/scripts run generate-website-data -- --active-only
 *   pnpm --filter @workspace/scripts run generate-website-data -- --pretty --dry-run
 *
 * Options:
 *   --out <dir>       Output directory (default: ./website-data)
 *   --slug <slug>     Generate only the website with this slug
 *   --id <n>          Generate only the website with this id
 *   --active-only     Skip websites where the associated location account_status != 'Active'
 *   --pretty          Pretty-print JSON (default: compact)
 *   --dry-run         Print what would be written; don't write files
 */

import pg from "pg";
import fs from "fs";
import path from "path";

// ── CLI argument parsing ──────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : undefined;
}

function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

const OUT_DIR = path.resolve(getArg("--out") ?? "./website-data");
const FILTER_SLUG = getArg("--slug");
const FILTER_ID = getArg("--id") ? Number(getArg("--id")) : undefined;
const ACTIVE_ONLY = hasFlag("--active-only");
const PRETTY = hasFlag("--pretty");
const DRY_RUN = hasFlag("--dry-run");
const INDENT = PRETTY ? 2 : undefined;

// ── Types (matching the website builder data contract) ────────────────────────

interface WebsiteRow {
  id: number;
  name: string;
  slug: string;
  storeid: string | null;
}

interface BusinessRow {
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
}

interface HourRow {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
}

interface ServiceCategoryRow {
  id: number;
  name: string;
}

interface ServiceRow {
  id: number;
  name: string;
  price: string;
  duration: number;
  category_id: number | null;
}

interface StaffRow {
  id: number;
  name: string;
  role: string | null;
  avatar_url: string | null;
  bio: string | null;
}

interface ReviewRow {
  customer_name: string | null;
  rating: number;
  comment: string | null;
  created_at: string | null;
}

export interface WebsiteDataFile {
  /** Metadata about when and how this file was generated */
  meta: {
    website_id: number;
    location_id: number | null;
    generated_at: string;
    slug: string;
    cache_version: number;
  };
  /** Website metadata */
  website: {
    id: number;
    name: string;
    slug: string;
  };
  /** Business/location data */
  business: BusinessRow | null;
  /** Opening hours */
  hours: HourRow[];
  /** Services offered */
  services: ServiceRow[];
  /** Service category names */
  serviceCategories: ServiceCategoryRow[];
  /** Staff members */
  staff: StaffRow[];
  /** Customer reviews (Google + internal) */
  reviews: ReviewRow[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function safeQuery<T>(
  client: pg.PoolClient,
  sql: string,
  params: unknown[] = [],
  label = "query"
): Promise<T[]> {
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  [warn] ${label} failed (table may not exist): ${msg}`);
    return [];
  }
}

function filename(website: WebsiteRow): string {
  return `${website.slug}.json`;
}

function write(filePath: string, data: WebsiteDataFile): void {
  if (DRY_RUN) {
    console.log(`  [dry-run] would write ${filePath}`);
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, INDENT), "utf-8");
}

// ── Per-website data assembly ─────────────────────────────────────────────────

async function buildWebsiteData(
  client: pg.PoolClient,
  website: WebsiteRow
): Promise<WebsiteDataFile> {
  const storeid = website.storeid ? parseInt(website.storeid, 10) : null;
  const storeIdNum = storeid && !isNaN(storeid) ? storeid : null;

  let business: BusinessRow | null = null;
  let hours: HourRow[] = [];
  let serviceCategories: ServiceCategoryRow[] = [];
  let services: ServiceRow[] = [];
  let staff: StaffRow[] = [];
  let reviews: ReviewRow[] = [];

  if (storeIdNum) {
    // Business data
    const businessRows = await safeQuery<BusinessRow>(
      client,
      `SELECT id, name, address, phone, email, city, state, postcode, booking_slug, category
       FROM locations WHERE id = $1 LIMIT 1`,
      [storeIdNum],
      "locations"
    );
    business = businessRows.length > 0 ? businessRows[0] : null;

    // Business hours
    hours = await safeQuery<HourRow>(
      client,
      `SELECT day_of_week, open_time, close_time, is_closed
       FROM business_hours WHERE store_id = $1 ORDER BY day_of_week`,
      [storeIdNum],
      "business_hours"
    );

    // Service categories
    serviceCategories = await safeQuery<ServiceCategoryRow>(
      client,
      `SELECT id, name
       FROM service_categories
       WHERE store_id = $1
       ORDER BY sort_order NULLS LAST, id`,
      [storeIdNum],
      "service_categories"
    );

    // Services
    services = await safeQuery<ServiceRow>(
      client,
      `SELECT id, name, price, duration, category_id
       FROM services
       WHERE store_id = $1
       ORDER BY category_id NULLS LAST, id`,
      [storeIdNum],
      "services"
    );

    // Staff (active only)
    staff = await safeQuery<StaffRow>(
      client,
      `SELECT id, name, role,
              CASE WHEN avatar_url LIKE 'data:%' THEN NULL ELSE avatar_url END AS avatar_url,
              bio
       FROM staff
       WHERE store_id = $1
         AND (status IS NULL OR status = 'active')
       ORDER BY id
       LIMIT 20`,
      [storeIdNum],
      "staff"
    );

    // Reviews: try Google reviews first; fall back to internal reviews
    reviews = await safeQuery<ReviewRow>(
      client,
      `SELECT customer_name,
              rating,
              review_text AS comment,
              review_create_time AS created_at
       FROM google_reviews
       WHERE store_id = $1
         AND rating >= 4
       ORDER BY review_create_time DESC
       LIMIT 20`,
      [storeIdNum],
      "google_reviews"
    );

    if (reviews.length === 0) {
      reviews = await safeQuery<ReviewRow>(
        client,
        `SELECT customer_name, rating, comment, created_at
         FROM reviews
         WHERE store_id = $1
           AND is_public = true
         ORDER BY created_at DESC
         LIMIT 20`,
        [storeIdNum],
        "reviews (fallback)"
      );
    }
  }

  return {
    meta: {
      website_id: website.id,
      location_id: storeIdNum,
      generated_at: new Date().toISOString(),
      slug: website.slug,
      cache_version: 1,
    },
    website: {
      id: website.id,
      name: website.name,
      slug: website.slug,
    },
    business,
    hours,
    services,
    serviceCategories,
    staff,
    reviews,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("ERROR: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }

  console.log("Certxa website data generator");
  console.log(`  Output dir : ${DRY_RUN ? "(dry-run)" : OUT_DIR}`);
  if (FILTER_SLUG) console.log(`  Filter slug: ${FILTER_SLUG}`);
  if (FILTER_ID) console.log(`  Filter id  : ${FILTER_ID}`);
  if (ACTIVE_ONLY) console.log(`  Active only: yes`);
  console.log("");

  const pool = new pg.Pool({ connectionString: dbUrl, max: 3 });
  const client = await pool.connect();

  try {
    // ── Fetch published websites ──────────────────────────────────────────────
    const whereClauses: string[] = ["published = true"];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (FILTER_ID) {
      params.push(FILTER_ID);
      whereClauses.push(`id = $${paramIdx++}`);
    }
    if (FILTER_SLUG) {
      params.push(FILTER_SLUG);
      whereClauses.push(`slug = $${paramIdx++}`);
    }
    if (ACTIVE_ONLY) {
      whereClauses.push(`l.account_status = 'Active'`);
    }

    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    let websites: WebsiteRow[];
    try {
      const result = await client.query<WebsiteRow>(
        `SELECT w.id, w.name, w.slug, w.storeid
         FROM wb_websites w
         LEFT JOIN locations l ON w.storeid::integer = l.id
         ${where}
         AND w.storeid IS NOT NULL
         ORDER BY w.id`,
        params
      );
      websites = result.rows;
    } catch (err) {
      // Try simpler query without location join
      try {
        const simpleWhere = whereClauses.filter(w => !w.includes('account_status')).join(" AND ");
        const result = await client.query<WebsiteRow>(
          `SELECT id, name, slug, storeid
           FROM wb_websites
           WHERE published = true
             AND storeid IS NOT NULL
           ${simpleWhere ? `AND ${simpleWhere}` : ''}
           ORDER BY id`,
          params.slice(0, FILTER_ID && FILTER_SLUG ? 2 : FILTER_ID || FILTER_SLUG ? 1 : 0)
        );
        websites = result.rows;
      } catch (err2) {
        const msg = err2 instanceof Error ? err2.message : String(err2);
        console.error(`ERROR: Could not query websites table: ${msg}`);
        process.exit(1);
      }
    }

    if (websites.length === 0) {
      console.log("No published websites found matching the given filters. Nothing to generate.");
      process.exit(0);
    }

    console.log(`Found ${websites.length} published website(s) to generate.\n`);

    if (!DRY_RUN) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
    }

    const index: Array<{ id: number; slug: string; name: string; file: string; location_id: string | null }> = [];
    let successCount = 0;
    let errorCount = 0;

    for (const website of websites) {
      const label = `[${website.id}] ${website.name} (${website.slug})`;
      process.stdout.write(`  Generating ${label}... `);

      try {
        const data = await buildWebsiteData(client, website);
        const file = filename(website);
        const outPath = path.join(OUT_DIR, file);

        write(outPath, data);

        index.push({
          id: website.id,
          slug: website.slug,
          name: website.name,
          file,
          location_id: website.storeid,
        });

        console.log("done");
        successCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`FAILED: ${msg}`);
        errorCount++;
      }
    }

    // ── Write index.json ─────────────────────────────────────────────────────
    const indexPath = path.join(OUT_DIR, "index.json");
    const indexData = {
      generated_at: new Date().toISOString(),
      count: index.length,
      cache_version: 1,
      websites: index,
    };

    if (DRY_RUN) {
      console.log(`\n  [dry-run] would write ${indexPath}`);
    } else {
      fs.writeFileSync(indexPath, JSON.stringify(indexData, null, INDENT), "utf-8");
      console.log(`\n  Index written → ${indexPath}`);
    }

    console.log("\n══════════════════════════════════════════");
    console.log(`  Generation complete`);
    console.log(`  Success : ${successCount}`);
    if (errorCount > 0) console.log(`  Errors  : ${errorCount}`);
    console.log(`  Files   : ${OUT_DIR}/`);
    console.log("══════════════════════════════════════════\n");

    if (errorCount > 0) process.exit(1);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
