/**
 * GBP Photo Automation Engine — Phase 3.2
 *
 * Automatically uploads salon photos to Google Business Profile using
 * real Certxa image data. Never invents content.
 *
 * ENTRY POINTS:
 *   detectAndEnqueuePhoto(storeId, eventType, data)  — called after image upload events
 *   runPhotoDispatcher()                              — runs every 5 min, uploads due photos
 *
 * SUPPORTED EVENTS:
 *   service_image   → triggered when a service's image_url is set/updated
 *   staff_avatar    → triggered when a staff member's avatar is uploaded
 */

import crypto from "node:crypto";
import { db } from "../db";
import { decryptToken, encryptToken } from "../lib/googleTokenCrypto";
import { OAuth2Client } from "google-auth-library";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  gbpPhotoQueue,
  gbpPhotoSettings,
  googleBusinessAccounts,
  googleBusinessLocations,
  googleBusinessProfiles,
  locations,
  calendarSettings,
  businessHours,
} from "@shared/schema";
import { eq, and, lte, inArray, gte, count, sql } from "drizzle-orm";
import {
  createGBPMediaItem,
  isGBPAuthError,
  markGBPAuthFailed,
} from "../google-business-api";
import { recordQuota429, isQuotaCoolingDown } from "../google-quota-guard";
import { extractR2KeyFromUrl } from "../lib/r2";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_UPLOAD_ATTEMPTS    = 3;
const RETRY_BACKOFF_MINUTES  = [15, 60, 240] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export type GBPPhotoEventType = "service_image" | "staff_avatar" | "gallery_photo";

export interface GBPPhotoEventData {
  /** Public or proxy URL of the image */
  imageUrl: string;
  /** R2 key — used for binary fetch (preferred) */
  r2Key?: string;
  /** Related service ID */
  serviceId?: number;
  /** Related staff ID */
  staffId?: number;
  /** Human-readable name for description generation */
  entityName?: string;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

async function getOrCreatePhotoSettings(storeId: number) {
  const existing = await db
    .select()
    .from(gbpPhotoSettings)
    .where(eq(gbpPhotoSettings.storeId, storeId))
    .limit(1);

  if (existing.length) return existing[0];

  const rows = await db
    .insert(gbpPhotoSettings)
    .values({ storeId })
    .returning();
  return rows[0];
}

// ─── OAuth + Location Resource Resolution (mirrors Post Engine) ───────────────

async function resolveGBPPhotoConnection(storeId: number): Promise<{
  client: OAuth2Client;
  locationResourceName: string;
} | null> {
  const oauthParams = [
    process.env.GOOGLE_BUSINESS_CLIENT_ID     ?? process.env.GOOGLE_CLIENT_ID     ?? "",
    process.env.GOOGLE_BUSINESS_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "",
    process.env.GOOGLE_BUSINESS_CALLBACK_URL  ?? `${process.env.APP_URL ?? "https://certxa.com"}/api/google-business/callback`,
  ] as const;

  // ── New schema: google_business_accounts / google_business_locations ──────
  const selectedLocs = await db
    .select({
      locationResourceName: googleBusinessLocations.locationResourceName,
      businessAccountId:    googleBusinessLocations.businessAccountId,
    })
    .from(googleBusinessLocations)
    .where(and(
      eq(googleBusinessLocations.storeId, storeId),
      eq(googleBusinessLocations.isSelected, true),
    ))
    .limit(1);

  if (selectedLocs.length) {
    const locRow = selectedLocs[0];
    const accountRows = await db
      .select()
      .from(googleBusinessAccounts)
      .where(eq(googleBusinessAccounts.id, locRow.businessAccountId))
      .limit(1);

    const account = accountRows[0];
    if (account && (account.accessToken || account.refreshToken) && locRow.locationResourceName) {
      const client = new OAuth2Client(...oauthParams);
      client.setCredentials({
        access_token:  decryptToken(account.accessToken),
        refresh_token: decryptToken(account.refreshToken),
        expiry_date:   account.tokenExpiry?.getTime() ?? undefined,
      });
      client.on("tokens", (tokens) => {
        db.update(googleBusinessAccounts)
          .set({
            accessToken: encryptToken(tokens.access_token) ?? undefined,
            tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
            updatedAt:   new Date(),
          })
          .where(eq(googleBusinessAccounts.id, account.id))
          .catch((e) => console.warn("[GBP Photos] Failed to persist refreshed token (account):", e));
      });
      return { client, locationResourceName: locRow.locationResourceName };
    }
  }

  // ── Legacy: google_business_profiles ─────────────────────────────────────
  const profileRows = await db
    .select()
    .from(googleBusinessProfiles)
    .where(and(
      eq(googleBusinessProfiles.storeId, storeId),
      eq(googleBusinessProfiles.isConnected, true),
    ))
    .limit(1);

  const profile = profileRows[0];
  if (profile && (profile.accessToken || profile.refreshToken) && profile.locationResourceName) {
    const client = new OAuth2Client(...oauthParams);
    client.setCredentials({
      access_token:  decryptToken(profile.accessToken),
      refresh_token: decryptToken(profile.refreshToken),
      expiry_date:   profile.tokenExpiresAt?.getTime() ?? undefined,
    });
    client.on("tokens", (tokens) => {
      db.update(googleBusinessProfiles)
        .set({
          accessToken:    encryptToken(tokens.access_token) ?? undefined,
          tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
          updatedAt:      new Date(),
        })
        .where(eq(googleBusinessProfiles.id, profile.id))
        .catch((e) => console.warn("[GBP Photos] Failed to persist refreshed token (profile):", e));
    });
    return { client, locationResourceName: profile.locationResourceName };
  }

  return null;
}

// ─── Timezone + Business Hours (mirrors Post Engine) ──────────────────────────

async function getStoreTimezone(storeId: number): Promise<string> {
  try {
    const rows = await db
      .select({ timezone: locations.timezone })
      .from(locations)
      .where(eq(locations.id, storeId))
      .limit(1);
    return rows[0]?.timezone ?? "UTC";
  } catch {
    return "UTC";
  }
}

async function isWithinBusinessHours(storeId: number, moment: Date): Promise<boolean> {
  const tz = await getStoreTimezone(storeId);
  const localHHmm = formatInTimeZone(moment, tz, "HH:mm");
  const isoDay    = parseInt(formatInTimeZone(moment, tz, "i"), 10);
  const dow       = isoDay % 7;
  const [hh, mm]  = localHHmm.split(":").map(Number);
  const nowMin    = hh * 60 + mm;

  const rows = await db
    .select()
    .from(businessHours)
    .where(and(eq(businessHours.storeId, storeId), eq(businessHours.dayOfWeek, dow)))
    .limit(1);

  // No business hours configured for this store/day → treat as always open
  if (!rows.length) return true;
  const bh = rows[0];
  if (bh.isClosed) return false;
  const [oh, om] = bh.openTime.split(":").map(Number);
  const [ch, cm] = bh.closeTime.split(":").map(Number);
  return nowMin >= oh * 60 + om && nowMin < ch * 60 + cm;
}

async function getNextBusinessHourSlot(storeId: number, earliest: Date): Promise<Date | null> {
  const tz = await getStoreTimezone(storeId);
  const allHours = await db.select().from(businessHours).where(eq(businessHours.storeId, storeId));
  if (!allHours.length) return null;

  const hoursByDow: Record<number, { isClosed: boolean; openMinutes: number; closeMinutes: number; openTime: string }> = {};
  for (const bh of allHours) {
    const [oh, om] = bh.openTime.split(":").map(Number);
    const [ch, cm] = bh.closeTime.split(":").map(Number);
    hoursByDow[bh.dayOfWeek] = { isClosed: bh.isClosed, openMinutes: oh * 60 + om, closeMinutes: ch * 60 + cm, openTime: bh.openTime };
  }

  let candidate = new Date(earliest.getTime());
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const localHHmm    = formatInTimeZone(candidate, tz, "HH:mm");
    const isoDay       = parseInt(formatInTimeZone(candidate, tz, "i"), 10);
    const dow          = isoDay % 7;
    const localDateStr = formatInTimeZone(candidate, tz, "yyyy-MM-dd");
    const [hh, mm]     = localHHmm.split(":").map(Number);
    const candidateMin = hh * 60 + mm;

    const bhRow = hoursByDow[dow];
    if (bhRow && !bhRow.isClosed) {
      if (candidateMin < bhRow.openMinutes) {
        const [openH, openM] = bhRow.openTime.split(":").map(Number);
        const snapStr = `${localDateStr}T${String(openH).padStart(2, "0")}:${String(openM).padStart(2, "0")}:00`;
        return fromZonedTime(snapStr, tz);
      }
      if (candidateMin < bhRow.closeMinutes) return candidate;
    }
    const nextApprox    = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
    const nextLocalDate = formatInTimeZone(nextApprox, tz, "yyyy-MM-dd");
    candidate = fromZonedTime(`${nextLocalDate}T00:00:00`, tz);
  }
  return null;
}

// ─── Daily Limit ──────────────────────────────────────────────────────────────

async function isDailyLimitReached(storeId: number, maxPerDay: number): Promise<boolean> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await db
    .select({ cnt: count() })
    .from(gbpPhotoQueue)
    .where(and(
      eq(gbpPhotoQueue.storeId, storeId),
      eq(gbpPhotoQueue.status, "uploaded"),
      gte(gbpPhotoQueue.updatedAt, oneDayAgo),
    ));
  return Number(result[0]?.cnt ?? 0) >= maxPerDay;
}

/** Compute next slot that respects the min_hours_between constraint */
async function getNextAvailableSlot(
  storeId: number,
  minHoursBetween: number,
): Promise<Date> {
  // Find when the last upload happened
  const lastUploaded = await db
    .select({ updatedAt: gbpPhotoQueue.updatedAt })
    .from(gbpPhotoQueue)
    .where(and(
      eq(gbpPhotoQueue.storeId, storeId),
      inArray(gbpPhotoQueue.status, ["uploaded", "pending", "processing"]),
    ))
    .orderBy(sql`updated_at DESC`)
    .limit(1);

  const earliestAllowed = lastUploaded.length
    ? new Date(lastUploaded[0].updatedAt.getTime() + minHoursBetween * 60 * 60 * 1000)
    : new Date();

  const floor    = earliestAllowed < new Date() ? new Date() : earliestAllowed;
  const nextSlot = await getNextBusinessHourSlot(storeId, floor);
  return nextSlot ?? floor;
}

// ─── AI Photo Classification ──────────────────────────────────────────────────

interface PhotoMetadata {
  description: string;
  tags: string[];
}

async function generatePhotoMetadata(
  imageUrl: string,
  opts: { storeId: number; eventType: GBPPhotoEventType; entityName?: string; businessName?: string },
): Promise<PhotoMetadata> {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  const { entityName, businessName, eventType } = opts;
  const biz  = businessName ?? "our salon";
  const name = entityName ?? (eventType === "staff_avatar" ? "team member" : "service");

  if (!apiKey) {
    return buildFallbackMetadata(eventType, entityName, businessName);
  }

  // Use a publicly accessible URL — prefer the app's dev/prod domain proxy
  const appUrl = process.env.APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN ?? "certxa.com"}`;
  // If image_url is already absolute public, use it; otherwise prepend app URL
  const publicUrl = imageUrl.startsWith("http") ? imageUrl : `${appUrl}${imageUrl}`;

  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: publicUrl, detail: "low" },
            },
            {
              type: "text",
              text: [
                `You are writing metadata for a Google Business Profile photo for a beauty salon called "${biz}".`,
                eventType === "staff_avatar"
                  ? `This is a professional headshot of a team member named "${name}".`
                  : `This is a service photo related to "${name}".`,
                ``,
                `Rules:`,
                `- Do NOT invent prices, discounts, or promotions`,
                `- Use only what you can see or what is provided`,
                ``,
                `Return JSON with exactly these fields:`,
                `{ "description": "<1 sentence, max 100 chars, warm professional tone>", "tags": ["<tag1>", "<tag2>", "<tag3>"] }`,
                `Return ONLY valid JSON, no markdown.`,
              ].join("\n"),
            },
          ],
        },
      ],
      max_completion_tokens: 150,
      temperature: 0.5,
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (raw) {
      const parsed = JSON.parse(raw) as { description?: string; tags?: string[] };
      if (parsed.description && Array.isArray(parsed.tags)) {
        console.log(`[GBP Photos] AI metadata for storeId=${opts.storeId}: "${parsed.description}" tags=[${parsed.tags.join(", ")}]`);
        return { description: parsed.description.slice(0, 500), tags: parsed.tags.slice(0, 10) };
      }
    }
  } catch (err: any) {
    console.warn("[GBP Photos] AI classification failed, using fallback:", err?.message ?? err);
  }

  return buildFallbackMetadata(eventType, entityName, businessName);
}

function buildFallbackMetadata(
  eventType: GBPPhotoEventType,
  entityName?: string,
  businessName?: string,
): PhotoMetadata {
  const biz  = businessName ?? "our salon";
  const name = entityName ?? (eventType === "staff_avatar" ? "team member" : "service");

  if (eventType === "staff_avatar") {
    return {
      description: `${name} — professional team member at ${biz}.`,
      tags: ["Staff", "Team", "Beauty Professional"],
    };
  }
  if (eventType === "gallery_photo") {
    return {
      description: name !== "team member" && name !== "service"
        ? `${name} — ${biz}.`
        : `A look inside ${biz}.`,
      tags: ["Salon", "Gallery", "Beauty"],
    };
  }
  return {
    description: `${name} service at ${biz}.`,
    tags: ["Salon", "Beauty", "Service"],
  };
}

// ─── Dedup Hash ───────────────────────────────────────────────────────────────

function computePhotoHash(storeId: number, r2Key: string, locationResourceName: string): string {
  const input = `${storeId}:${r2Key}:${locationResourceName}`;
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 64);
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Fire-and-forget entry point called from routes.ts after image uploads.
 * Returns the gbp_photo_queue row ID on success, null otherwise.
 * Never throws — all errors are caught and logged.
 */
export async function detectAndEnqueuePhoto(
  storeId: number,
  eventType: GBPPhotoEventType,
  data: GBPPhotoEventData,
): Promise<number | null> {
  try {
  // ── 1. Settings ───────────────────────────────────────────────────────────
  const settings = await getOrCreatePhotoSettings(storeId);
  if (!settings.enabled) {
    console.log(`[GBP Photos] storeId=${storeId} — photo engine disabled, skipping event=${eventType}`);
    return null;
  }

  // ── 2. Validate store has a GBP connection (skip early to avoid wasted work)
  const connection = await resolveGBPPhotoConnection(storeId);
  if (!connection) {
    console.log(`[GBP Photos] storeId=${storeId} — no GBP connection, skipping event=${eventType}`);
    return null;
  }

  // ── 3. Resolve R2 key from URL if not provided ────────────────────────────
  const r2Key = data.r2Key ?? extractR2KeyFromUrl(data.imageUrl) ?? undefined;
  if (!r2Key) {
    console.warn(`[GBP Photos] storeId=${storeId} — cannot resolve R2 key from imageUrl, skipping`);
    return null;
  }

  // ── 4. Dedup: check if this image is already queued for this location ─────
  const existing = await db
    .select({ id: gbpPhotoQueue.id, status: gbpPhotoQueue.status })
    .from(gbpPhotoQueue)
    .where(and(
      eq(gbpPhotoQueue.storeId, storeId),
      eq(gbpPhotoQueue.imageR2Key, r2Key),
      eq(gbpPhotoQueue.googleLocationId, connection.locationResourceName),
    ))
    .limit(1);

  if (existing.length && !["cancelled", "failed"].includes(existing[0].status)) {
    console.log(`[GBP Photos] storeId=${storeId} — already queued r2Key=${r2Key}, skipping`);
    return existing[0].id;
  }

  // ── 5. Load store name for metadata ──────────────────────────────────────
  const storeRows = await db
    .select({ name: locations.name })
    .from(locations)
    .where(eq(locations.id, storeId))
    .limit(1);
  const businessName = storeRows[0]?.name ?? "Our Salon";

  // ── 6. Generate AI metadata (non-blocking — don't fail enqueue on AI error)
  let metadata: PhotoMetadata = buildFallbackMetadata(eventType, data.entityName, businessName);
  try {
    metadata = await generatePhotoMetadata(data.imageUrl, {
      storeId,
      eventType,
      entityName:   data.entityName,
      businessName,
    });
  } catch (err: any) {
    console.warn(`[GBP Photos] Metadata generation failed for storeId=${storeId}:`, err?.message);
  }

  // ── 7. Compute next available slot ────────────────────────────────────────
  const scheduledFor = await getNextAvailableSlot(storeId, settings.minHoursBetween);

  // ── 8. Insert queue row ───────────────────────────────────────────────────
  const insertedRows = await db
    .insert(gbpPhotoQueue)
    .values({
      storeId,
      imageUrl:           data.imageUrl,
      imageR2Key:         r2Key,
      sourceType:         eventType,
      serviceId:          data.serviceId ?? null,
      staffId:            data.staffId ?? null,
      googleLocationId:   connection.locationResourceName,
      status:             "pending",
      scheduledFor,
      aiDescription:      metadata.description,
      aiTags:             metadata.tags,
    })
    .onConflictDoNothing()
    .returning();

  if (!insertedRows.length) {
    console.log(`[GBP Photos] storeId=${storeId} — ON CONFLICT, already queued`);
    return null;
  }

  console.log(`[GBP Photos] Enqueued storeId=${storeId} event=${eventType} queueId=${insertedRows[0].id} scheduledFor=${scheduledFor.toISOString()}`);
  return insertedRows[0].id;
  } catch (err: any) {
    console.error(`[GBP Photos] detectAndEnqueuePhoto error storeId=${storeId} event=${eventType}:`, err?.message ?? err);
    return null;
  }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export async function runPhotoDispatcher(): Promise<void> {
  const now = new Date();

  const dueItems = await db
    .select()
    .from(gbpPhotoQueue)
    .where(and(
      eq(gbpPhotoQueue.status, "pending"),
      lte(gbpPhotoQueue.scheduledFor, now),
    ))
    .orderBy(gbpPhotoQueue.scheduledFor)
    .limit(5); // max 5 per dispatcher tick to avoid bursts

  if (dueItems.length) {
    console.log(`[GBP Photos] Dispatcher — ${dueItems.length} photo(s) due for upload`);
  }

  for (const item of dueItems) {
    try {
      await uploadQueuedPhoto(item, now);
    } catch (err: any) {
      console.error(`[GBP Photos] Dispatcher — unhandled error queueId=${item.id}:`, err?.message ?? err);
    }
  }
}

async function uploadQueuedPhoto(
  item: typeof gbpPhotoQueue.$inferSelect,
  now: Date,
): Promise<void> {
  if (!item.imageR2Key) {
    await markPhotoFailed(item.id, "No R2 key — cannot fetch binary for upload");
    return;
  }

  // ── Quota guard ───────────────────────────────────────────────────────────
  const cooldown = isQuotaCoolingDown();
  if (cooldown.coolingDown) {
    const mins    = Math.ceil(cooldown.retryAfterMs / 60_000);
    const retryAt = new Date(Date.now() + cooldown.retryAfterMs);
    await db.update(gbpPhotoQueue).set({
      scheduledFor:  retryAt,
      errorMessage:  `Quota cooldown — retrying in ${mins}m`,
      updatedAt:     new Date(),
    }).where(eq(gbpPhotoQueue.id, item.id));
    console.warn(`[GBP Photos] queueId=${item.id} — quota cooldown, rescheduled ${mins}m`);
    return;
  }

  // ── Load settings ─────────────────────────────────────────────────────────
  const settings = await getOrCreatePhotoSettings(item.storeId);

  // ── Daily limit ───────────────────────────────────────────────────────────
  const limitReached = await isDailyLimitReached(item.storeId, settings.maxPhotosPerDay);
  if (limitReached) {
    // Re-schedule for tomorrow at opening
    const tomorrowSeed = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const nextSlot     = await getNextBusinessHourSlot(item.storeId, tomorrowSeed);
    const retryAt      = nextSlot ?? tomorrowSeed;
    await db.update(gbpPhotoQueue).set({
      scheduledFor: retryAt,
      errorMessage: `Daily limit reached (max ${settings.maxPhotosPerDay}/day)`,
      updatedAt:    new Date(),
    }).where(eq(gbpPhotoQueue.id, item.id));
    console.log(`[GBP Photos] queueId=${item.id} — daily limit, rescheduled to ${retryAt.toISOString()}`);
    return;
  }

  // ── Business hours check ──────────────────────────────────────────────────
  const withinHours = await isWithinBusinessHours(item.storeId, now);
  if (!withinHours) {
    const nextSlot = await getNextBusinessHourSlot(item.storeId, now);
    if (nextSlot) {
      await db.update(gbpPhotoQueue).set({
        scheduledFor: nextSlot,
        updatedAt:    new Date(),
      }).where(eq(gbpPhotoQueue.id, item.id));
      console.log(`[GBP Photos] queueId=${item.id} — outside business hours, rescheduled to ${nextSlot.toISOString()}`);
      return;
    }
    // No business hours configured for this store → upload immediately
    console.log(`[GBP Photos] queueId=${item.id} — no business hours configured, uploading immediately`);
  }

  // ── Resolve GBP connection ────────────────────────────────────────────────
  const connection = await resolveGBPPhotoConnection(item.storeId);
  if (!connection) {
    await markPhotoFailed(item.id, "No connected Google account found for this store");
    return;
  }

  // ── Mark processing + increment attempts ─────────────────────────────────
  await db.update(gbpPhotoQueue).set({
    status:    "processing",
    attempts:  item.attempts + 1,
    updatedAt: new Date(),
  }).where(eq(gbpPhotoQueue.id, item.id));

  // ── Upload to GBP ─────────────────────────────────────────────────────────
  try {
    const result = await createGBPMediaItem(
      {
        locationResourceName: item.googleLocationId ?? connection.locationResourceName,
        r2Key:                item.imageR2Key,
        sourceUrl:            item.imageUrl,
        mediaCategory:        "ADDITIONAL",
        description:          item.aiDescription ?? undefined,
      },
      connection.client,
    );

    await db.update(gbpPhotoQueue).set({
      status:           "uploaded",
      uploadedPhotoId:  result.mediaResourceName,
      apiResponse:      result.rawResponse,
      errorMessage:     null,
      updatedAt:        new Date(),
    }).where(eq(gbpPhotoQueue.id, item.id));

    console.log(`[GBP Photos] ✓ Uploaded queueId=${item.id} mediaId=${result.mediaResourceName}`);

  } catch (err: any) {
    const errMsg = String(err?.message ?? err);

    // Auth failure
    if (isGBPAuthError(err) || err?.isAuthError) {
      await markGBPAuthFailed(item.storeId, errMsg);
      await markPhotoFailed(item.id, `Auth failure: ${errMsg}`);
      return;
    }

    // 429 Rate limit
    if (err?.status === 429) {
      recordQuota429(err);
      const retryAt = new Date(Date.now() + 60 * 60 * 1000); // 1h
      await db.update(gbpPhotoQueue).set({
        status:       "pending",
        scheduledFor: retryAt,
        errorMessage: `HTTP 429 rate limited — retry in 60m`,
        updatedAt:    new Date(),
      }).where(eq(gbpPhotoQueue.id, item.id));
      console.warn(`[GBP Photos] queueId=${item.id} — 429 rate limited, rescheduled 60m`);
      return;
    }

    // Retry with backoff
    console.error(`[GBP Photos] Upload failed queueId=${item.id}:`, errMsg);
    if (item.attempts + 1 >= MAX_UPLOAD_ATTEMPTS) {
      await markPhotoFailed(item.id, errMsg);
    } else {
      const backoffMin = RETRY_BACKOFF_MINUTES[item.attempts] ?? 240;
      const retryAt    = new Date(Date.now() + backoffMin * 60 * 1000);
      await db.update(gbpPhotoQueue).set({
        status:       "pending",
        scheduledFor: retryAt,
        errorMessage: errMsg,
        updatedAt:    new Date(),
      }).where(eq(gbpPhotoQueue.id, item.id));
    }
  }
}

async function markPhotoFailed(queueId: number, reason: string) {
  await db.update(gbpPhotoQueue).set({
    status:       "failed",
    errorMessage: reason,
    updatedAt:    new Date(),
  }).where(eq(gbpPhotoQueue.id, queueId));
  console.error(`[GBP Photos] queueId=${queueId} marked FAILED: ${reason}`);
}

// ─── One-time recovery: re-queue gallery photos dropped by old constraint ─────

/**
 * Re-enqueues any wb_gallery_photos rows that have gbp_queue_id = NULL.
 * This recovers photos uploaded before migration 0129 fixed the source_type
 * CHECK constraint that excluded 'gallery_photo', causing all gallery inserts
 * to be silently rejected by Postgres.
 *
 * Safe to call on every startup — it only touches rows with gbp_queue_id IS NULL
 * and skips stores with no GBP connection or disabled photo engine.
 */
export async function reQueueOrphanGalleryPhotos(): Promise<void> {
  try {
    const { wbGalleryPhotos } = await import("@shared/schema");
    const { isNull } = await import("drizzle-orm");

    const orphans = await db
      .select()
      .from(wbGalleryPhotos)
      .where(isNull(wbGalleryPhotos.gbpQueueId));

    if (!orphans.length) return;

    console.log(`[GBP Photos] Re-queue sweep — found ${orphans.length} gallery photo(s) with no GBP queue entry`);

    for (const photo of orphans) {
      try {
        const queueId = await detectAndEnqueuePhoto(photo.storeId, "gallery_photo", {
          imageUrl:   photo.imageUrl,
          r2Key:      photo.imageR2Key ?? undefined,
          entityName: photo.caption ?? undefined,
        });
        if (queueId) {
          await db
            .update(wbGalleryPhotos)
            .set({ gbpQueueId: queueId, updatedAt: new Date() })
            .where(eq(wbGalleryPhotos.id, photo.id));
          console.log(`[GBP Photos] Re-queued gallery photo id=${photo.id} → queueId=${queueId}`);
        }
      } catch (err: any) {
        console.warn(`[GBP Photos] Re-queue failed for gallery photo id=${photo.id}:`, err?.message);
      }
    }
  } catch (err: any) {
    console.warn("[GBP Photos] Re-queue sweep error:", err?.message);
  }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

export function startPhotoEngineDispatcher(): void {
  const INTERVAL_MS   = 5 * 60 * 1000;  // every 5 minutes
  const INITIAL_DELAY = 150 * 1000;     // 2.5 minutes after boot (after post engine)

  setTimeout(async () => {
    console.log("[GBP Photos] Dispatcher — initial run");
    await runPhotoDispatcher().catch((e) =>
      console.error("[GBP Photos] Dispatcher error:", e),
    );
    setInterval(async () => {
      await runPhotoDispatcher().catch((e) =>
        console.error("[GBP Photos] Dispatcher error:", e),
      );
    }, INTERVAL_MS);
  }, INITIAL_DELAY);

  console.log("[GBP Photos] Photo engine dispatcher started (5-minute interval)");
}
