import { createHash, randomBytes } from "crypto";
import bcrypt from "bcrypt";
import { Queue, Worker, type Job } from "bullmq";
import { pool } from "../db";
import { getBullMqConnectionOptions } from "../lib/redis";
import {
  DRAFT_NAIL_CATALOG,
  internalUnclaimedEmail,
  isSafeExternalWebsite,
  qualifiesSalonMatch,
  SALON_CREATION_DEFAULTS,
  scoreSalonMatch,
  uniqueSlugCandidate,
} from "../lib/salonAccountCreationCore";

export const SALON_ACCOUNT_QUEUE = "salon-account-creation";
const SIX_MINUTES = SALON_CREATION_DEFAULTS.spacingMinutes * 60 * 1000;
const MAX_ATTEMPTS = 5;
const GOOGLE_CONTENT_TTL_DAYS = 29;

interface SourceSalon {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  place_id: string;
}

interface PlacesDetails {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
  utc_offset?: number;
  opening_hours?: { periods?: Array<{ open?: { day?: number; time?: string }; close?: { day?: number; time?: string } }> };
}

interface SalonQueuePayload { accountJobId?: number; scanNext?: boolean; }

let queue: Queue | null = null;
let worker: Worker | null = null;

function safeLogMessage(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value ?? "Unknown error");
  return message.replace(/https?:\/\/\S+/gi, "[external URL]").slice(0, 500);
}

async function writeLog(sourceSalonId: number, event: string, message?: string, details: Record<string, unknown> = {}, jobId?: number | null) {
  await pool.query(
    `INSERT INTO salon_account_creation_logs (job_id, source_salon_id, event, message, details)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [jobId ?? null, sourceSalonId, event, message ?? null, JSON.stringify(details)],
  );
}

function googleKey(): string | null {
  return process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY || null;
}

async function googleJson(url: string): Promise<any> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  const body = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw new Error(`Google Places HTTP ${response.status}`);
  if (body.status && body.status !== "OK" && body.status !== "ZERO_RESULTS") {
    throw new Error(`Google Places returned ${String(body.status).slice(0, 40)}`);
  }
  return body;
}

async function lookupPlaces(salon: SourceSalon): Promise<{ detail: PlacesDetails | null; matchScore: number }> {
  const key = googleKey();
  if (!key) throw new Error("Google Places API credential is not configured");
  let placeId = String(salon.place_id ?? "").trim();

  if (!placeId) {
    const query = [salon.name, salon.address].filter(Boolean).join(" ");
    const searchUrl = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
    searchUrl.searchParams.set("query", query);
    searchUrl.searchParams.set("key", key);
    const search = await googleJson(searchUrl.toString());
    const candidates: any[] = Array.isArray(search.results) ? search.results : [];
    const best = candidates
      .map((item) => ({ item, score: scoreSalonMatch(salon, { name: item.name ?? "", address: item.formatted_address ?? "" }) }))
      .sort((a, b) => b.score - a.score)[0];
    if (!best || !qualifiesSalonMatch(salon, { name: best.item.name ?? "", address: best.item.formatted_address ?? "" })) {
      return { detail: null, matchScore: best?.score ?? 0 };
    }
    placeId = String(best.item.place_id ?? "");
    if (!placeId) return { detail: null, matchScore: best.score };
  }

  const detailsUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  detailsUrl.searchParams.set("place_id", placeId);
  detailsUrl.searchParams.set("fields", "place_id,name,formatted_address,formatted_phone_number,international_phone_number,website,geometry,utc_offset,opening_hours");
  detailsUrl.searchParams.set("key", key);
  const response = await googleJson(detailsUrl.toString());
  const detail = response.result as PlacesDetails | undefined;
  if (!detail?.name || !detail.place_id) return { detail: null, matchScore: 0 };
  const matchScore = scoreSalonMatch(salon, { name: detail.name, address: detail.formatted_address });
  if (!qualifiesSalonMatch(salon, { name: detail.name, address: detail.formatted_address })) {
    return { detail: null, matchScore };
  }
  return { detail, matchScore };
}

function googleHoursPeriods(detail: PlacesDetails): Array<{ dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }> {
  const periods = detail.opening_hours?.periods ?? [];
  const byDay = new Map<number, { openTime: string; closeTime: string }>();
  for (const period of periods) {
    const day = Number(period.open?.day);
    const open = String(period.open?.time ?? "");
    const close = String(period.close?.time ?? "");
    if (day < 0 || day > 6 || !/^\d{4}$/.test(open) || !/^\d{4}$/.test(close)) continue;
    byDay.set(day, { openTime: `${open.slice(0, 2)}:${open.slice(2)}`, closeTime: `${close.slice(0, 2)}:${close.slice(2)}` });
  }
  return [...byDay.entries()].map(([dayOfWeek, times]) => ({ dayOfWeek, ...times, isClosed: false }));
}

async function chooseAvailableSlug(client: import("pg").PoolClient, name: string, sourceId: number): Promise<string> {
  const vanity = String(name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30);
  if (vanity.length >= 4) {
    const found = await client.query(
      `SELECT 1 FROM locations WHERE booking_slug = $1
       UNION ALL SELECT 1 FROM wb_websites WHERE slug = $1
       UNION ALL SELECT 1 FROM nail_salons WHERE slug = $1
       UNION ALL SELECT 1 FROM directory_listings WHERE slug = $1
       UNION ALL SELECT 1 FROM booking_slug_history WHERE old_slug = $1 LIMIT 1`, [vanity],
    );
    if (found.rowCount === 0) return vanity;
    for (let i = 2; i <= 99; i++) {
      const candidate = `${vanity.slice(0, Math.max(1, 30 - String(i).length - 1))}-${i}`;
      const collision = await client.query(
        `SELECT 1 FROM locations WHERE booking_slug = $1
         UNION ALL SELECT 1 FROM wb_websites WHERE slug = $1
         UNION ALL SELECT 1 FROM nail_salons WHERE slug = $1
         UNION ALL SELECT 1 FROM directory_listings WHERE slug = $1
         UNION ALL SELECT 1 FROM booking_slug_history WHERE old_slug = $1 LIMIT 1`, [candidate],
      );
      if (collision.rowCount === 0) return candidate;
    }
  }
  for (let attempt = 0; attempt < 4096; attempt++) {
    const slug = uniqueSlugCandidate(name, sourceId, attempt);
    const found = await client.query(
      `SELECT 1 FROM locations WHERE booking_slug = $1
       UNION ALL SELECT 1 FROM wb_websites WHERE slug = $1
       UNION ALL SELECT 1 FROM nail_salons WHERE slug = $1
       UNION ALL SELECT 1 FROM directory_listings WHERE slug = $1
       UNION ALL SELECT 1 FROM booking_slug_history WHERE old_slug = $1 LIMIT 1`, [slug],
    );
    if (found.rowCount === 0) return slug;
  }
  throw new Error("Unable to reserve a unique salon slug");
}

async function findExistingStore(client: import("pg").PoolClient, salon: SourceSalon, detail: PlacesDetails): Promise<number | null> {
  const placeId = detail.place_id ?? salon.place_id;
  if (placeId) {
    const placeMatch = await client.query<{ store_id: number }>(
      `SELECT store_id FROM salon_account_creation_jobs
        WHERE place_id=$1 AND source_salon_id<>$2 AND status IN ('created','claimed','expired')
          AND store_id IS NOT NULL ORDER BY id LIMIT 1`, [placeId, salon.id],
    );
    if (placeMatch.rows[0]?.store_id) return Number(placeMatch.rows[0].store_id);
  }
  const linked = await client.query<{ store_id: number }>(
    `SELECT store_id FROM directory_listings WHERE nail_salon_id = $1 AND store_id IS NOT NULL LIMIT 1`, [salon.id],
  ).catch(() => ({ rows: [], rowCount: 0 } as any));
  if (linked.rows[0]?.store_id) return Number(linked.rows[0].store_id);

  const phone = detail.international_phone_number ?? detail.formatted_phone_number ?? salon.phone;
  const row = await client.query<{ id: number }>(
    `SELECT id FROM locations
      WHERE lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g')) = lower(regexp_replace($1, '[^a-zA-Z0-9]', '', 'g'))
        AND (($2::text IS NOT NULL AND regexp_replace(COALESCE(phone,''), '[^0-9]', '', 'g') = regexp_replace($2, '[^0-9]', '', 'g'))
          OR lower(COALESCE(address,'')) = lower(COALESCE($3,'')))
      ORDER BY id LIMIT 1`, [detail.name, phone ?? null, detail.formatted_address ?? salon.address ?? null],
  );
  return row.rows[0]?.id ?? null;
}

async function createSoloShell(source: SourceSalon, detail: PlacesDetails, matchScore: number, jobId: number): Promise<void> {
  const client = await pool.connect();
  let createdUserId: string | null = null;
  let createdStoreId: number | null = null;
  try {
    await client.query("BEGIN");
    const jobRow = await client.query<{ status: string; store_id: number | null }>(
      `SELECT status, store_id FROM salon_account_creation_jobs WHERE id=$1 FOR UPDATE`, [jobId],
    );
    const job = jobRow.rows[0];
    if (!job || job.status === "created" || job.status === "claimed") {
      await client.query("ROLLBACK");
      return;
    }
    const matchedPlaceId = detail.place_id ?? source.place_id;
    if (matchedPlaceId) await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`salon-place:${matchedPlaceId}`]);
    const existingStoreId = await findExistingStore(client, source, detail);
    if (existingStoreId) {
      await client.query(
        `UPDATE salon_account_creation_jobs SET status='skipped', store_id=$2,
           last_error='Matched an existing Certxa store; no new account created.', updated_at=now() WHERE id=$1`,
        [jobId, existingStoreId],
      );
      await client.query("COMMIT");
      await writeLog(source.id, "skipped_existing_store", "Existing Certxa store matched; left unchanged.", { storeId: existingStoreId }, jobId);
      return;
    }

    const matchedName = detail.name ?? source.name;
    const slug = await chooseAvailableSlug(client, matchedName, source.id);
    // This reserved, non-routable address is an internal principal only, never an owner's contact.
    // Authentication explicitly rejects any user with unclaimed_at set.
    const internalEmail = internalUnclaimedEmail(source.id);
    const userIdResult = await client.query<{ id: string }>(
      `INSERT INTO users (email, password, role, is_admin, account_type, subscription_status, onboarding_completed, unclaimed_at)
       VALUES ($1,$2,'owner',false,'certxa_pro','active',true,now()) RETURNING id`,
      [internalEmail, await bcrypt.hash(randomBytes(48).toString("hex"), 12)],
    );
    const userId = userIdResult.rows[0].id;
    createdUserId = userId;

    const websiteUrl = isSafeExternalWebsite(detail.website) ?? isSafeExternalWebsite(source.website);
    const phone = detail.international_phone_number ?? detail.formatted_phone_number ?? source.phone;
    const address = detail.formatted_address ?? source.address;
    const location = await client.query<{ id: number }>(
      `INSERT INTO locations
        (name, timezone, address, phone, email, category, booking_slug, booking_theme, user_id,
          account_status, own_place, address_private, online_booking_mode, booking_payment_policy,
          advance_booking_enabled, setup_complete, website, store_latitude, store_longitude)
       VALUES ($1,'UTC',$2,$3,NULL,'Nail Salon',$4,'solo',$5,'Active','salon',false,'off','none',false,true,$6,$7,$8)
       RETURNING id`,
      [matchedName, address ?? null, phone ?? null, slug, userId, websiteUrl,
        detail.geometry?.location?.lat == null ? null : String(detail.geometry.location.lat),
        detail.geometry?.location?.lng == null ? null : String(detail.geometry.location.lng)],
    );
    const storeId = Number(location.rows[0].id);
    createdStoreId = storeId;

    const geoHours = googleHoursPeriods(detail);
    if (geoHours.length) {
      const byDay = new Map(geoHours.map((h) => [h.dayOfWeek, h]));
      await client.query(
        `INSERT INTO business_hours (store_id, day_of_week, open_time, close_time, is_closed)
         SELECT $1, d, COALESCE(x.open_time,'09:00'), COALESCE(x.close_time,'17:00'), (x.day_of_week IS NULL)
           FROM generate_series(0,6) AS d
           LEFT JOIN jsonb_to_recordset($2::jsonb) AS x(day_of_week integer, open_time text, close_time text, is_closed boolean)
             ON x.day_of_week=d`,
        [storeId, JSON.stringify([...byDay.values()])],
      );
    }

    const sourceCatalog = await client.query<{
      service_name: string;
      service_description: string | null;
      service_duration: number | null;
      service_price: string | null;
      service_active: boolean | null;
      service_hidden: boolean | null;
      service_unpriced: boolean | null;
      service_deposit_required: boolean | null;
      service_auto_assigned: boolean | null;
      service_offered_at: string | null;
      category_name: string | null;
      category_hidden: boolean | null;
    }>(
      `SELECT
         s.name AS service_name,
         s.description AS service_description,
         s.duration AS service_duration,
         s.price::text AS service_price,
         s.is_active AS service_active,
         s.hidden_from_public AS service_hidden,
         s.is_unpriced_placeholder AS service_unpriced,
         s.deposit_required AS service_deposit_required,
         s.auto_assigned AS service_auto_assigned,
         s.offered_at AS service_offered_at,
         COALESCE(sc.name, NULLIF(s.category, ''), 'General') AS category_name,
         COALESCE(sc.hidden_from_public, false) AS category_hidden
       FROM services s
       LEFT JOIN service_categories sc ON sc.id = s.category_id
       WHERE s.store_id = 2
       ORDER BY COALESCE(sc.sort_order, 0), s.id`,
    );

    let seededServiceCount = 0;
    if (sourceCatalog.rows.length > 0) {
      const categoryIds = new Map<string, number>();
      for (const row of sourceCatalog.rows) {
        const categoryName = String(row.category_name ?? "General").trim() || "General";
        if (categoryIds.has(categoryName)) continue;
        const inserted = await client.query<{ id: number }>(
          `INSERT INTO service_categories (name, store_id, sort_order, hidden_from_public)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [categoryName, storeId, categoryIds.size, Boolean(row.category_hidden)],
        );
        categoryIds.set(categoryName, inserted.rows[0].id);
      }
      for (const row of sourceCatalog.rows) {
        const categoryName = String(row.category_name ?? "General").trim() || "General";
        await client.query(
          `INSERT INTO services
             (name, description, duration, price, category, category_id, store_id, is_active,
              hidden_from_public, is_unpriced_placeholder, deposit_required, auto_assigned, offered_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            row.service_name,
            row.service_description,
            Number(row.service_duration ?? 30),
            Number(row.service_price ?? 0),
            categoryName,
            categoryIds.get(categoryName),
            storeId,
            Boolean(row.service_active),
            Boolean(row.service_hidden),
            Boolean(row.service_unpriced),
            Boolean(row.service_deposit_required),
            Boolean(row.service_auto_assigned),
            row.service_offered_at ?? "any",
          ],
        );
        seededServiceCount++;
      }
    } else {
      const categoryIds = new Map<string, number>();
      for (const category of [...new Set(DRAFT_NAIL_CATALOG.map((item) => item.category))]) {
        const inserted = await client.query<{ id: number }>(
          `INSERT INTO service_categories (name, store_id, sort_order, hidden_from_public)
           VALUES ($1,$2,$3,true) RETURNING id`,
          [category, storeId, categoryIds.size],
        );
        categoryIds.set(category, inserted.rows[0].id);
      }
      for (const service of DRAFT_NAIL_CATALOG) {
        await client.query(
          `INSERT INTO services
             (name, description, duration, price, category, category_id, store_id, is_active,
              hidden_from_public, is_unpriced_placeholder, deposit_required, auto_assigned, offered_at)
           VALUES ($1,'Draft catalog entry — review the service and set a price before activation.',$2,0,$3,$4,$5,false,true,true,false,false,'any')`,
          [service.name, service.duration, service.category, categoryIds.get(service.category), storeId],
        );
        seededServiceCount++;
      }
    }

    // Solo accounts require a single calendar. The neutral system label is not a person or an owner claim.
    const staff = await client.query<{ id: number }>(
      `INSERT INTO staff (name, color, store_id, status) VALUES ('Salon calendar','#3b82f6',$1,'active') RETURNING id`, [storeId],
    );
    await client.query(`UPDATE users SET staff_id=$1 WHERE id=$2`, [staff.rows[0].id, userId]);
    const soloPlan = await client.query<{ id: number }>(`SELECT id FROM subscription_plans WHERE code='solo' LIMIT 1`);
    if (soloPlan.rows[0]) {
      await client.query(
        `INSERT INTO store_subscriptions (store_id, plan_id, status, current_period_start, created_at, updated_at)
         VALUES ($1,$2,'active',now(),now(),now()) ON CONFLICT DO NOTHING`,
        [storeId, soloPlan.rows[0].id],
      );
    }

    const template = await client.query<{ id: number }>(
      `SELECT id FROM wb_templates WHERE name='Nail Salon — Bloom' AND category='nail_salon' LIMIT 1`,
    );
    if (!template.rows[0]) throw new Error("The Nail Salon — Bloom website template is not available");
    const website = await client.query<{ id: number }>(
      `INSERT INTO wb_websites (name, slug, storeid, template_id, content, published, published_at, publisher_type, auto_settings)
       VALUES ($1,$2,$3,$4,$5::jsonb,true,now(),'template','{}'::jsonb) RETURNING id`,
      [matchedName, slug, String(storeId), template.rows[0].id, JSON.stringify({ preparedByCertxa: true, ownerClaimed: false })],
    );

    const expiresAt = new Date(Date.now() + GOOGLE_CONTENT_TTL_DAYS * 86_400_000);
    await client.query(
      `UPDATE salon_account_creation_jobs SET status='created', place_id=$2, store_id=$3, user_id=$4,
         website_id=$5, assigned_slug=$6, match_score=$7, google_data_expires_at=$8,
         last_error=NULL, updated_at=now() WHERE id=$1`,
      [jobId, detail.place_id ?? source.place_id, storeId, userId, website.rows[0].id, slug, matchScore, expiresAt],
    );
    await client.query("COMMIT");
    await writeLog(source.id, "account_created", "Unclaimed Solo account and Bloom website published.", {
      storeId, websiteId: website.rows[0].id, slug, servicesDrafted: seededServiceCount,
      onlineBookingMode: SALON_CREATION_DEFAULTS.onlineBookingMode, accountType: SALON_CREATION_DEFAULTS.userAccountType, ownerEmailAvailable: false,
      googleDataExpiresAt: expiresAt.toISOString(), photosAdded: 0,
    }, jobId);
    createdUserId = null;
    createdStoreId = null;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    // The transaction owns all rows; these are defensive cleanup guards for future changes.
    if (createdStoreId || createdUserId) {
      console.error("[SalonAccountCreation] transaction rollback after partial work", { sourceSalonId: source.id, storeCreated: Boolean(createdStoreId), userCreated: Boolean(createdUserId) });
    }
    throw error;
  } finally {
    client.release();
  }
}

async function processJob(job: Job<{ accountJobId: number }>): Promise<void> {
  if ((job.data as SalonQueuePayload).scanNext) {
    const found = await scanAndProcessNextSource();
    if (!found) {
      await pool.query(`UPDATE salon_account_creation_control SET paused=true, paused_at=now(), updated_at=now() WHERE singleton=true`);
      await getQueue()?.pause();
      await pool.query(`INSERT INTO salon_account_creation_logs (source_salon_id,event,message) VALUES (0,'run_completed','No unscanned source records remain; queue paused automatically.')`);
    }
    return;
  }
  const accountJobId = Number((job.data as SalonQueuePayload).accountJobId);
  const lock = await pool.query<{ status: string }>(
    `UPDATE salon_account_creation_jobs SET status='processing', attempts=attempts+1, updated_at=now()
      WHERE id=$1 AND status IN ('queued','eligible','failed','processing') RETURNING status`, [accountJobId],
  );
  if (!lock.rowCount) return;
  const record = await pool.query<SourceSalon & { account_job_id: number }>(
    `SELECT j.id AS account_job_id, s.id, s.name, s.address, s.phone, s.website, s.place_id
       FROM salon_account_creation_jobs j JOIN nail_salons s ON s.id=j.source_salon_id
      WHERE j.id=$1 LIMIT 1`, [accountJobId],
  );
  const salon = record.rows[0];
  if (!salon) throw new Error("Source salon record no longer exists");
  try {
    const { detail, matchScore } = await lookupPlaces(salon);
    if (!detail) {
      await pool.query(`UPDATE salon_account_creation_jobs SET status='skipped', match_score=$2, last_error='Google Places did not return a reliable business match.', updated_at=now() WHERE id=$1`, [accountJobId, matchScore]);
      await writeLog(salon.id, "skipped_no_match", "Google Places match was below the confidence threshold.", { matchScore }, accountJobId);
      return;
    }
    await pool.query(`UPDATE salon_account_creation_jobs SET status='eligible', place_id=$2, match_score=$3, scanned_at=now(), updated_at=now() WHERE id=$1`, [accountJobId, detail.place_id ?? salon.place_id, matchScore]);
    await createSoloShell(salon, detail, matchScore, accountJobId);
  } catch (error) {
    const message = safeLogMessage(error);
    await pool.query(
      `UPDATE salon_account_creation_jobs SET status=CASE WHEN attempts >= $2 THEN 'failed' ELSE 'queued' END,
         next_attempt_at=CASE WHEN attempts >= $2 THEN NULL ELSE now() + interval '6 minutes' END,
         last_error=$3, updated_at=now() WHERE id=$1`,
      [accountJobId, MAX_ATTEMPTS, message],
    );
    await writeLog(salon.id, "processing_error", message, { attempt: job.attemptsMade + 1 }, accountJobId);
    throw error;
  }
}

async function scanAndProcessNextSource(): Promise<boolean> {
  await pool.query(`UPDATE salon_account_creation_jobs SET status='failed', last_error=COALESCE(last_error,'Google Places scan exceeded retry limit.'), updated_at=now() WHERE status='scan_failed' AND attempts >= $1`, [MAX_ATTEMPTS]);
  const source = await pool.query<SourceSalon>(
    `SELECT s.id, s.name, s.address, s.phone, s.website, s.place_id
       FROM nail_salons s LEFT JOIN salon_account_creation_jobs j ON j.source_salon_id=s.id
      WHERE j.id IS NULL OR j.status='pending' OR (j.status='scan_failed' AND j.attempts < $1)
      ORDER BY s.id LIMIT 1 FOR UPDATE OF s SKIP LOCKED`,
    [MAX_ATTEMPTS],
  );
  const salon = source.rows[0];
  if (!salon) return false;
  const jobResult = await pool.query<{ id: number }>(
    `INSERT INTO salon_account_creation_jobs (source_salon_id, place_id, status)
     VALUES ($1,$2,'scanning') ON CONFLICT (source_salon_id) DO UPDATE
       SET status='scanning', attempts=salon_account_creation_jobs.attempts+1, updated_at=now()
       WHERE salon_account_creation_jobs.status IN ('pending','scan_failed') RETURNING id`,
    [salon.id, salon.place_id],
  );
  const jobId = jobResult.rows[0]?.id;
  if (!jobId) return true;
  try {
    const { detail, matchScore } = await lookupPlaces(salon);
    if (!detail) {
      await pool.query(`UPDATE salon_account_creation_jobs SET status='skipped', match_score=$2, scanned_at=now(), last_error='Google Places did not return a reliable business match.', updated_at=now() WHERE id=$1`, [jobId, matchScore]);
      await writeLog(salon.id, "skipped_no_match", "Automatic scan found no reliable Google Places match.", { matchScore }, jobId);
      return true;
    }
    await pool.query(`UPDATE salon_account_creation_jobs SET status='eligible', place_id=$2, match_score=$3, scanned_at=now(), updated_at=now() WHERE id=$1`, [jobId, detail.place_id ?? salon.place_id, matchScore]);
    await writeLog(salon.id, "eligible", "Automatic scan found a reliable Google Places match.", { matchScore }, jobId);
    await createSoloShell(salon, detail, matchScore, Number(jobId));
  } catch (error) {
    const message = safeLogMessage(error);
    await pool.query(`UPDATE salon_account_creation_jobs SET status='scan_failed', attempts=attempts+1, last_error=$2, scanned_at=now(), updated_at=now() WHERE id=$1`, [jobId, message]);
    await writeLog(salon.id, "scan_error", message, {}, Number(jobId));
    throw error;
  }
  return true;
}

async function scheduleNextScanIfDrained(): Promise<void> {
  const q = getQueue();
  if (!q) return;
  const control = await pool.query<{ paused: boolean; production_approved: boolean }>(`SELECT paused, production_approved FROM salon_account_creation_control WHERE singleton=true`);
  if (!control.rows[0] || control.rows[0].paused || !control.rows[0].production_approved) return;
  const counts = await q.getJobCounts("waiting", "active", "delayed");
  // Called from completed/failed events; the just-finished job may still count active for a tick.
  if (Number(counts.waiting ?? 0) > 0 || Number(counts.delayed ?? 0) > 0 || Number(counts.active ?? 0) > 1) return;
  await q.add("scan-next-source", { scanNext: true }, { jobId: "scan-next-source", removeOnComplete: true, removeOnFail: true, attempts: MAX_ATTEMPTS, backoff: { type: "exponential", delay: SIX_MINUTES } });
}

function getQueue(): Queue | null {
  if (queue) return queue;
  const connection = getBullMqConnectionOptions();
  if (!connection) return null;
  queue = new Queue(SALON_ACCOUNT_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: MAX_ATTEMPTS,
      backoff: { type: "exponential", delay: SIX_MINUTES },
      removeOnComplete: false,
      removeOnFail: false,
    },
  });
  queue.on("error", (error) => console.warn("[SalonAccountCreation] queue unavailable:", safeLogMessage(error)));
  return queue;
}

export async function startSalonAccountWorker(): Promise<void> {
  const connection = getBullMqConnectionOptions();
  if (!connection) {
    console.warn("[SalonAccountCreation] Redis is not configured; queue worker not started");
    return;
  }
  await pool.query(
    `UPDATE salon_account_creation_jobs SET status='scan_failed', last_error='Scan interrupted by server restart.', updated_at=now()
      WHERE status='scanning' AND updated_at < now() - interval '10 minutes'`,
  );
  await pool.query(
    `UPDATE salon_account_creation_jobs SET status=CASE WHEN attempts >= $1 THEN 'failed' ELSE 'queued' END,
        last_error=COALESCE(last_error,'Processing recovered after server restart.'), updated_at=now()
      WHERE status='processing'`, [MAX_ATTEMPTS],
  );
  const q = getQueue();
  const control = await pool.query<{ paused: boolean; production_approved: boolean }>(`SELECT paused, production_approved FROM salon_account_creation_control WHERE singleton=true`);
  if (control.rows[0]?.paused || !control.rows[0]?.production_approved) await q?.pause();
  else await q?.resume();
  if (worker) return;
  worker = new Worker(SALON_ACCOUNT_QUEUE, processJob, {
    connection,
    concurrency: 1,
    // One global job per six-minute interval = 10/hour and 240/day.
    limiter: { max: 1, duration: SIX_MINUTES },
  });
  worker.on("failed", (job, error) => console.warn("[SalonAccountCreation] job failed", { jobId: job?.id, message: safeLogMessage(error) }));
  worker.on("completed", () => { void scheduleNextScanIfDrained().catch((error) => console.warn("[SalonAccountCreation] scan continuation failed:", safeLogMessage(error))); });
  worker.on("failed", (job) => {
    if (job && job.attemptsMade >= MAX_ATTEMPTS) void scheduleNextScanIfDrained().catch((error) => console.warn("[SalonAccountCreation] scan continuation failed:", safeLogMessage(error)));
  });
  worker.on("error", (error) => console.warn("[SalonAccountCreation] worker error:", safeLogMessage(error)));
  if (control.rows[0]?.paused || !control.rows[0]?.production_approved) await getQueue()?.pause();
  else {
    void queueEligibleSalonJobs().catch((error) => console.warn("[SalonAccountCreation] resume enqueue failed:", safeLogMessage(error)));
    void scheduleNextScanIfDrained().catch((error) => console.warn("[SalonAccountCreation] scan continuation failed:", safeLogMessage(error)));
  }
}

export async function stopSalonAccountWorker(): Promise<void> {
  await worker?.close(); worker = null;
  await queue?.close(); queue = null;
}

export async function queueEligibleSalonJobs(limit = 100_000): Promise<number> {
  const q = getQueue();
  if (!q) throw new Error("Redis/BullMQ is unavailable; no production jobs were queued");
  const rows = await pool.query<{ id: number; source_salon_id: number }>(
    `SELECT id, source_salon_id FROM salon_account_creation_jobs
      WHERE status IN ('eligible','queued') ORDER BY id LIMIT $1`, [Math.max(1, Math.min(100_000, limit))],
  );
  let added = 0;
  for (let offset = 0; offset < rows.rows.length; offset += 500) {
    const batch = rows.rows.slice(offset, offset + 500);
    await q.addBulk(batch.map((row) => ({
      name: "create-solo-account",
      data: { accountJobId: Number(row.id) },
      opts: { jobId: `salon-${row.source_salon_id}` },
    })));
    const ids = batch.map((row) => Number(row.id));
    const updated = await pool.query(
      `UPDATE salon_account_creation_jobs SET status='queued', updated_at=now()
        WHERE id = ANY($1::bigint[]) AND status IN ('eligible','queued')`, [ids],
    );
    added += updated.rowCount ?? 0;
  }
  return added;
}

export async function prepareAllSalonSourceJobs(): Promise<number> {
  const inserted = await pool.query(
    `INSERT INTO salon_account_creation_jobs (source_salon_id, place_id, status)
     SELECT id, place_id, 'pending' FROM nail_salons
     ON CONFLICT (source_salon_id) DO NOTHING`,
  );
  return inserted.rowCount ?? 0;
}

export async function pauseSalonAccountQueue(): Promise<void> {
  const q = getQueue();
  if (!q) throw new Error("Redis/BullMQ is unavailable; queue pause could not be confirmed");
  await q.pause();
  await pool.query(`UPDATE salon_account_creation_control SET paused=true, paused_at=now(), updated_at=now() WHERE singleton=true`);
}

export async function resumeSalonAccountQueue(): Promise<void> {
  const q = getQueue();
  if (!q) throw new Error("Redis/BullMQ is unavailable");
  const control = await pool.query<{ production_approved: boolean }>(`SELECT production_approved FROM salon_account_creation_control WHERE singleton=true`);
  if (!control.rows[0]?.production_approved) throw new Error("Production run has not been explicitly approved");
  await pool.query(`UPDATE salon_account_creation_control SET paused=false, updated_at=now() WHERE singleton=true`);
  await q.resume();
  await scheduleNextScanIfDrained();
}

export async function scanSalonSource(limit = 25): Promise<{ scanned: number; cursor: number | null; done: boolean }> {
  const safeLimit = Math.max(1, Math.min(5, Math.floor(limit)));
  await pool.query(`UPDATE salon_account_creation_jobs SET status='failed', last_error=COALESCE(last_error,'Google Places scan exceeded retry limit.'), updated_at=now() WHERE status='scan_failed' AND attempts >= $1`, [MAX_ATTEMPTS]);
  const rows = await pool.query<SourceSalon>(
    `SELECT id, name, address, phone, website, place_id FROM nail_salons s
      WHERE NOT EXISTS (SELECT 1 FROM salon_account_creation_jobs j WHERE j.source_salon_id=s.id AND j.status NOT IN ('pending','scan_failed'))
      ORDER BY id LIMIT $1`, [safeLimit],
  );
  let scanned = 0;
  for (const salon of rows.rows) {
    const inserted = await pool.query<{ id: number }>(
      `INSERT INTO salon_account_creation_jobs (source_salon_id, place_id, status)
       VALUES ($1,$2,'scanning') ON CONFLICT (source_salon_id) DO UPDATE SET status='scanning',
         attempts=salon_account_creation_jobs.attempts+1, updated_at=now()
       WHERE salon_account_creation_jobs.status='pending'
          OR (salon_account_creation_jobs.status='scan_failed' AND salon_account_creation_jobs.attempts < $3)
       RETURNING id`, [salon.id, salon.place_id, MAX_ATTEMPTS],
    );
    if (!inserted.rows[0]) continue;
    const id = Number(inserted.rows[0].id);
    try {
      const { detail, matchScore } = await lookupPlaces(salon);
      const eligible = detail != null;
      await pool.query(
        `UPDATE salon_account_creation_jobs SET status=$2, place_id=COALESCE($3,place_id), match_score=$4,
           scanned_at=now(), updated_at=now(), last_error=$5 WHERE id=$1`,
        [id, eligible ? "eligible" : "skipped", detail?.place_id ?? null, matchScore,
          eligible ? null : "Google Places did not return a reliable business match."],
      );
      await writeLog(salon.id, eligible ? "eligible" : "skipped_no_match", eligible ? "Reliable Google Places match found." : "No reliable Google Places match found.", { matchScore }, id);
      scanned++;
    } catch (error) {
      const message = safeLogMessage(error);
      await pool.query(`UPDATE salon_account_creation_jobs SET status='scan_failed', attempts=attempts+1, last_error=$2, scanned_at=now(), updated_at=now() WHERE id=$1`, [id, message]);
      await writeLog(salon.id, "scan_error", message, {}, id);
      scanned++;
    }
  }
  const cursor = rows.rows.at(-1)?.id ?? null;
  const remaining = await pool.query(`SELECT EXISTS(SELECT 1 FROM nail_salons s WHERE NOT EXISTS (SELECT 1 FROM salon_account_creation_jobs j WHERE j.source_salon_id=s.id AND j.status NOT IN ('pending','scan_failed'))) AS any`);
  return { scanned, cursor, done: !remaining.rows[0]?.any };
}

export async function getSalonAccountCreationStatus() {
  const [counts, control, jobs, redisQueue] = await Promise.all([
    pool.query<{ total: number; eligible: number; created: number; pending: number; skipped: number; failed: number; queued: number }>(
      `SELECT (SELECT count(*) FROM nail_salons)::int AS total,
       (SELECT count(*) FROM salon_account_creation_jobs WHERE status='eligible')::int AS eligible,
       (SELECT count(*) FROM salon_account_creation_jobs WHERE status IN ('created','claimed','expired'))::int AS created,
       (SELECT count(*) FROM nail_salons s WHERE NOT EXISTS (SELECT 1 FROM salon_account_creation_jobs j WHERE j.source_salon_id=s.id AND j.status NOT IN ('pending','scan_failed')))::int AS pending,
       (SELECT count(*) FROM salon_account_creation_jobs WHERE status='skipped')::int AS skipped,
       (SELECT count(*) FROM salon_account_creation_jobs WHERE status IN ('failed','scan_failed'))::int AS failed,
       (SELECT count(*) FROM salon_account_creation_jobs WHERE status IN ('queued','processing'))::int AS queued`,
    ),
    pool.query(`SELECT paused, production_approved, approved_by, approved_at, paused_at, updated_at FROM salon_account_creation_control WHERE singleton=true`),
    pool.query(`SELECT id, source_salon_id, status, store_id, assigned_slug, match_score, attempts, last_error, updated_at FROM salon_account_creation_jobs ORDER BY updated_at DESC LIMIT 100`),
    getQueue()?.getJobCounts("waiting", "active", "delayed", "failed", "completed").catch(() => null) ?? Promise.resolve(null),
  ]);
  const active = jobs.rows.find((j: any) => j.status === "processing");
  return {
    counts: counts.rows[0],
    control: control.rows[0] ?? { paused: true, production_approved: false },
    current: active ?? null,
    queue: redisQueue,
    recent: jobs.rows,
    limits: { perHour: SALON_CREATION_DEFAULTS.perHour, perDay: SALON_CREATION_DEFAULTS.perDay, spacingMinutes: SALON_CREATION_DEFAULTS.spacingMinutes },
  };
}

export async function inspectOneRecord(sourceSalonId: number): Promise<{ matched: boolean; score: number; name?: string }> {
  const row = await pool.query<SourceSalon>(`SELECT id,name,address,phone,website,place_id FROM nail_salons WHERE id=$1`, [sourceSalonId]);
  if (!row.rows[0]) throw new Error("Source salon record was not found");
  const result = await lookupPlaces(row.rows[0]);
  return { matched: Boolean(result.detail), score: result.matchScore, name: result.detail?.name };
}

/** Remove copied Places content before its 30-day storage window ends; keep only the Place ID and slug mapping. */
export async function expireUnclaimedGooglePlacesContent(): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const expired = await client.query<{ id: number; source_salon_id: number; store_id: number; website_id: number }>(
      `UPDATE salon_account_creation_jobs
          SET status='expired', updated_at=now()
        WHERE status='created' AND claimed_at IS NULL AND google_data_expires_at <= now()
        RETURNING id, source_salon_id, store_id, website_id`,
    );
    for (const row of expired.rows) {
      await client.query(
        `UPDATE locations SET name='Unclaimed Nail Salon', address=NULL, phone=NULL, website=NULL,
          city=NULL, state=NULL, postcode=NULL, store_latitude=NULL, store_longitude=NULL
         WHERE id=$1 AND user_id=(SELECT user_id FROM salon_account_creation_jobs WHERE id=$2)`,
        [row.store_id, row.id],
      );
      await client.query(`DELETE FROM business_hours WHERE store_id=$1`, [row.store_id]);
      await client.query(`UPDATE wb_websites SET name='Unclaimed Nail Salon', published=false, updated_at=now() WHERE id=$1`, [row.website_id]);
      await client.query(
        `INSERT INTO salon_account_creation_logs (job_id, source_salon_id, event, message)
         VALUES ($1,$2,'places_data_expired','Unclaimed Google Places-derived fields expired; website unpublished. The permanent slug and Place ID mapping were retained.')`,
        [row.id, row.source_salon_id],
      );
    }
    await client.query("COMMIT");
    return expired.rowCount ?? 0;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}

export function startSalonAccountDataExpiry(): void {
  const run = () => expireUnclaimedGooglePlacesContent()
    .then((count) => { if (count) console.log(`[SalonAccountCreation] expired Google-derived content for ${count} unclaimed account(s)`); })
    .catch((error) => console.warn("[SalonAccountCreation] Places-data expiry sweep failed:", safeLogMessage(error)));
  setTimeout(run, 30_000);
  setInterval(run, 60 * 60 * 1000);
}

export function safeAuditFingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
