import type { Pool } from "pg";
import type { SegmentResult } from "../types";
import { pass, warn, fail, rollup } from "../types";
import { differenceInDays } from "date-fns";

export async function onlinePresence(accountId: number, pool: Pool): Promise<SegmentResult> {
  const checks = [];
  const tables: Record<string, unknown[]> = {};

  const storeRes = await pool.query(
    `SELECT booking_slug FROM locations WHERE id = $1`,
    [accountId],
  );
  const bookingSlug = storeRes.rows[0]?.booking_slug ?? null;

  // 9a. Booking slug
  if (!bookingSlug) {
    checks.push(fail("booking_slug", "Booking slug configured", "No booking slug is set — the public booking page URL is broken.", "Settings → General → Booking URL"));
  } else {
    checks.push(pass("booking_slug", "Booking slug configured", `book.certxa.com/${bookingSlug}`));
  }

  // 9b. Website
  const websiteRes = await pool.query(
    `SELECT id, name, published, published_at, updated_at
     FROM wb_websites WHERE storeid = $1::text LIMIT 1`,
    [accountId],
  );

  if (websiteRes.rows.length === 0) {
    checks.push(warn("website", "Website created", "No website record found — this account has not created a website.", "Website Builder → Create Website"));
  } else {
    const ws = websiteRes.rows[0];
    tables.website = [{
      name: ws.name,
      published: ws.published,
      publishedAt: ws.published_at,
      updatedAt: ws.updated_at,
    }];

    if (!ws.published) {
      checks.push(warn("website", "Website published", `Website "${ws.name}" exists but has never been published.`, "Website Builder → Publish"));
    } else {
      const publishedStr = ws.published_at ? new Date(ws.published_at).toLocaleDateString() : "unknown";
      checks.push(pass("website", "Website published", `"${ws.name}" — published ${publishedStr}`));
    }
  }

  // 9c. Google Business Profile
  const gbpRes = await pool.query(
    `SELECT is_connected, business_name, last_synced_at, reconnect_required
     FROM google_business_profiles WHERE store_id = $1`,
    [accountId],
  );

  if (gbpRes.rows.length === 0) {
    checks.push(pass("gbp", "Google Business Profile", "No Google Business Profile connected (informational)."));
  } else {
    const gbp = gbpRes.rows[0];
    if (gbp.reconnect_required) {
      checks.push(warn("gbp", "Google Business Profile connected", `GBP "${gbp.business_name}" requires reconnection — the OAuth token has expired.`, "Settings → Integrations → Google Business → Reconnect"));
    } else if (!gbp.is_connected) {
      checks.push(warn("gbp", "Google Business Profile connected", `GBP "${gbp.business_name ?? "account"}" is not connected.`, "Settings → Integrations → Google Business"));
    } else {
      const lastSync = gbp.last_synced_at ? new Date(gbp.last_synced_at) : null;
      const daysSince = lastSync ? differenceInDays(new Date(), lastSync) : null;
      if (daysSince !== null && daysSince > 30) {
        checks.push(warn("gbp", "Google Business Profile synced recently", `"${gbp.business_name}" connected but last synced ${daysSince} days ago.`, "Settings → Integrations → Google Business → Sync"));
      } else {
        checks.push(pass("gbp", "Google Business Profile connected", `"${gbp.business_name}" connected, last sync ${lastSync ? lastSync.toLocaleDateString() : "unknown"}`));
      }
    }
  }

  return {
    segmentId: "online_presence",
    label: "Online Presence",
    status: rollup(checks),
    runAt: new Date().toISOString(),
    checks,
    tables,
  };
}
