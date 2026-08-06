/**
 * export-tenant-data.ts
 *
 * Exports one JSON file per location/account in the Certxa booking system.
 * Each file matches the data contract used by the Website Builder's
 * GET /api/tenant/:slug/data endpoint and the useSiteData hook in
 * template_master/src/hooks/useSiteData.ts.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run export-tenant-data
 *   pnpm --filter @workspace/scripts run export-tenant-data -- --out ./my-dir
 *   pnpm --filter @workspace/scripts run export-tenant-data -- --slug mysalon
 *   pnpm --filter @workspace/scripts run export-tenant-data -- --id 42
 *   pnpm --filter @workspace/scripts run export-tenant-data -- --active-only
 *
 * Options:
 *   --out <dir>       Output directory (default: ./tenant-data)
 *   --slug <slug>     Export only the location with this booking_slug
 *   --id <n>          Export only the location with this id
 *   --active-only     Skip locations where account_status != 'Active'
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

const OUT_DIR    = path.resolve(getArg("--out") ?? "./tenant-data");
const FILTER_SLUG = getArg("--slug");
const FILTER_ID   = getArg("--id") ? Number(getArg("--id")) : undefined;
const ACTIVE_ONLY = hasFlag("--active-only");
const PRETTY      = hasFlag("--pretty");
const DRY_RUN     = hasFlag("--dry-run");
const INDENT      = PRETTY ? 2 : undefined;

// ── DB contract types (matching the API endpoint response shape) ──────────────

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
  account_status: string | null;
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

export interface TenantDataFile {
  meta: {
    location_id: number;
    exported_at: string;
    slug: string;
  };
  business: BusinessRow | null;
  hours: HourRow[];
  serviceCategories: ServiceCategoryRow[];
  services: ServiceRow[];
  staff: StaffRow[];
  reviews: ReviewRow[];
}

// ── helpers ───────────────────────────────────────────────────────────────────

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

function filename(loc: BusinessRow): string {
  // Prefer the booking_slug as the filename; fall back to id
  const base = loc.booking_slug
    ? loc.booking_slug.replace(/[^a-z0-9-]/gi, "-")
    : String(loc.id);
  return `${base}.json`;
}

function write(filePath: string, data: TenantDataFile): void {
  if (DRY_RUN) {
    console.log(`  [dry-run] would write ${filePath}`);
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, INDENT), "utf-8");
}

// ── per-location data assembly ────────────────────────────────────────────────

async function buildTenantData(
  client: pg.PoolClient,
  loc: BusinessRow
): Promise<TenantDataFile> {
  const id = loc.id;

  const hours = await safeQuery<HourRow>(
    client,
    `SELECT day_of_week, open_time, close_time, is_closed
     FROM business_hours
     WHERE store_id = $1
     ORDER BY day_of_week`,
    [id],
    "business_hours"
  );

  const serviceCategories = await safeQuery<ServiceCategoryRow>(
    client,
    `SELECT id, name
     FROM service_categories
     WHERE store_id = $1
     ORDER BY sort_order NULLS LAST, id`,
    [id],
    "service_categories"
  );

  const services = await safeQuery<ServiceRow>(
    client,
    `SELECT id, name, price, duration, category_id
     FROM services
     WHERE store_id = $1
     ORDER BY category_id NULLS LAST, id`,
    [id],
    "services"
  );

  const staff = await safeQuery<StaffRow>(
    client,
    `SELECT id, name, role,
            CASE WHEN avatar_url LIKE 'data:%' THEN NULL ELSE avatar_url END AS avatar_url,
            bio
     FROM staff
     WHERE store_id = $1
       AND (status IS NULL OR status = 'active')
     ORDER BY id
     LIMIT 20`,
    [id],
    "staff"
  );

  // Reviews: try Google reviews first; fall back to the internal reviews table
  let reviews = await safeQuery<ReviewRow>(
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
    [id],
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
      [id],
      "reviews (fallback)"
    );
  }

  return {
    meta: {
      location_id: id,
      exported_at: new Date().toISOString(),
      slug: loc.booking_slug ?? String(id),
    },
    business: loc,
    hours,
    serviceCategories,
    services,
    staff,
    reviews,
  };
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("ERROR: DATABASE_URL environment variable is not set.");
    process.exit(1);
  }

  console.log("Certxa tenant-data exporter");
  console.log(`  Output dir : ${DRY_RUN ? "(dry-run)" : OUT_DIR}`);
  if (FILTER_SLUG) console.log(`  Filter slug: ${FILTER_SLUG}`);
  if (FILTER_ID)   console.log(`  Filter id  : ${FILTER_ID}`);
  if (ACTIVE_ONLY) console.log(`  Active only: yes`);
  console.log("");

  const pool = new pg.Pool({ connectionString: dbUrl, max: 3 });
  const client = await pool.connect();

  try {
    // ── fetch locations ───────────────────────────────────────────────────────
    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (FILTER_ID) {
      params.push(FILTER_ID);
      whereClauses.push(`id = $${params.length}`);
    }
    if (FILTER_SLUG) {
      params.push(FILTER_SLUG);
      whereClauses.push(`booking_slug = $${params.length}`);
    }
    if (ACTIVE_ONLY) {
      whereClauses.push(`account_status = 'Active'`);
    }

    const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    let locations: BusinessRow[];
    try {
      const result = await client.query<BusinessRow>(
        `SELECT id, name, address, phone, email, city, state, postcode,
                booking_slug, category, account_status
         FROM locations
         ${where}
         ORDER BY id`,
        params
      );
      locations = result.rows;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`ERROR: Could not query locations table: ${msg}`);
      process.exit(1);
    }

    if (locations.length === 0) {
      console.log("No locations found matching the given filters. Nothing to export.");
      process.exit(0);
    }

    console.log(`Found ${locations.length} location(s) to export.\n`);

    if (!DRY_RUN) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
    }

    const index: Array<{ id: number; slug: string; name: string; file: string }> = [];
    let successCount = 0;
    let errorCount = 0;

    for (const loc of locations) {
      const label = `[${loc.id}] ${loc.name} (${loc.booking_slug ?? "no-slug"})`;
      process.stdout.write(`  Exporting ${label}... `);

      try {
        const data = await buildTenantData(client, loc);
        const file = filename(loc);
        const outPath = path.join(OUT_DIR, file);

        write(outPath, data);

        index.push({
          id: loc.id,
          slug: loc.booking_slug ?? String(loc.id),
          name: loc.name,
          file,
        });

        console.log("done");
        successCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`FAILED: ${msg}`);
        errorCount++;
      }
    }

    // ── write index.json ─────────────────────────────────────────────────────
    const indexPath = path.join(OUT_DIR, "index.json");
    const indexData = {
      exported_at: new Date().toISOString(),
      count: index.length,
      locations: index,
    };

    if (DRY_RUN) {
      console.log(`\n  [dry-run] would write ${indexPath}`);
    } else {
      fs.writeFileSync(indexPath, JSON.stringify(indexData, null, INDENT), "utf-8");
      console.log(`\n  Index written → ${indexPath}`);
    }

    console.log("\n══════════════════════════════════════════");
    console.log(`  Export complete`);
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
