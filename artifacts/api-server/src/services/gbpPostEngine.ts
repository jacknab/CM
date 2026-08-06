/**
 * GBP Post Automation Engine — Phase 3.1
 *
 * Automatically creates and publishes relevant Google Business Profile posts
 * using real Certxa salon data. Never invents discounts, prices, or services.
 *
 * ENTRY POINTS:
 *   detectAndEnqueuePost(storeId, eventType, data)  — called after relevant Certxa CRUD events
 *   runPostDispatcher()                              — runs every 5 min, publishes due posts
 *
 * SUPPORTED EVENTS:
 *   service_created   → WHATS_NEW post ("Now offering: {service}")
 *   service_updated   → WHATS_NEW post (name/price/description changes)
 *   staff_added       → WHATS_NEW post ("Meet {name}, joining our team")
 *   gift_cards_enabled→ OFFER post ("Gift cards now available")
 *   announcement      → ALERT post (manual trigger via API)
 */

import crypto from "node:crypto";
import { db } from "../db";
import { encryptToken, decryptToken } from "../lib/googleTokenCrypto";
import { OAuth2Client } from "google-auth-library";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import {
  gbpPostQueue,
  gbpPostSettings,
  googleBusinessAccounts,
  googleBusinessLocations,
  googleBusinessProfiles,
  locations,
  calendarSettings,
  businessHours,
} from "@shared/schema";
import { eq, and, lte, inArray, gte, count, sql } from "drizzle-orm";
import {
  createGBPLocalPost,
  isGBPAuthError,
  markGBPAuthFailed,
  type GBPPostTopicType,
  type GBPCTAType,
} from "../google-business-api";
import { recordQuota429, isQuotaCoolingDown } from "../google-quota-guard";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_PUBLISH_ATTEMPTS = 3;
const RETRY_BACKOFF_MINUTES = [10, 30, 120];

// ─── Source Event Types ───────────────────────────────────────────────────────

export type GBPPostEventType =
  | "service_created"
  | "service_updated"
  | "staff_added"
  | "gift_cards_enabled"
  | "announcement";

// ─── Settings ─────────────────────────────────────────────────────────────────

async function getOrCreatePostSettings(storeId: number) {
  const existing = await db
    .select()
    .from(gbpPostSettings)
    .where(eq(gbpPostSettings.storeId, storeId))
    .limit(1);

  if (existing.length) return existing[0];

  const rows = await db
    .insert(gbpPostSettings)
    .values({ storeId })
    .returning();
  return rows[0];
}

// ─── Dedup Hash ───────────────────────────────────────────────────────────────

/**
 * Computes a SHA-256 topic hash used to prevent duplicate posts for the same
 * entity. The partial unique index on (store_id, topic_hash) enforces this at
 * the DB level for active (non-cancelled/failed) statuses.
 */
export function computeTopicHash(
  storeId: number,
  eventType: GBPPostEventType,
  entityId: string | number,
): string {
  const input = `${storeId}:${eventType}:${entityId}`;
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 64);
}

// ─── OAuth + Location Resource Resolution ────────────────────────────────────

/**
 * Returns the OAuth2Client AND the FULL location resource name
 * (accounts/{id}/locations/{id}) required by the v4 Local Posts API.
 *
 * Tries the new google_business_accounts/locations schema first,
 * then falls back to legacy google_business_profiles.
 */
async function resolveGBPPostConnection(storeId: number): Promise<{
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
      locationId:           googleBusinessLocations.locationId,
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
    if (account && (account.accessToken || account.refreshToken)) {
      // locationResourceName is stored as the FULL "accounts/{id}/locations/{id}" path
      const locationResourceName = locRow.locationResourceName;
      if (!locationResourceName) return null;

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
          .catch((e) => console.warn("[GBP Posts] Failed to persist refreshed token (account):", e));
      });
      return { client, locationResourceName };
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
        .catch((e) => console.warn("[GBP Posts] Failed to persist refreshed token (profile):", e));
    });
    return { client, locationResourceName: profile.locationResourceName };
  }

  return null;
}

// ─── Timezone Helpers (same pattern as review engine) ─────────────────────────

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

  if (!rows.length) return false;
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

// ─── Frequency Limit ──────────────────────────────────────────────────────────

/**
 * Returns true if the store has reached the maximum posts per rolling 7-day window.
 */
async function isFrequencyLimitReached(storeId: number, maxPerWeek: number): Promise<boolean> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await db
    .select({ cnt: count() })
    .from(gbpPostQueue)
    .where(and(
      eq(gbpPostQueue.storeId, storeId),
      eq(gbpPostQueue.status, "published"),
      gte(gbpPostQueue.publishedAt, sevenDaysAgo),
    ));
  return Number(result[0]?.cnt ?? 0) >= maxPerWeek;
}

// ─── Content Generation ───────────────────────────────────────────────────────

interface PostContentOpts {
  storeId:       number;
  businessName:  string;
  eventType:     GBPPostEventType;
  entityName?:   string;   // service name, staff name, etc.
  entityPrice?:  string;   // numeric string from DB, e.g. "45.00"
  entityDuration?: number; // minutes
  entityRole?:   string;   // staff role
  bookingUrl?:   string;
}

interface GeneratedPostContent {
  summary:      string;
  postType:     GBPPostTopicType;
  ctaType?:     GBPCTAType;
  ctaUrl?:      string;
}

/**
 * Generate post content using real Certxa data.
 * STRICT RULE: Never invent discounts, promotions, or prices not in the DB.
 */
async function generatePostContent(opts: PostContentOpts): Promise<GeneratedPostContent> {
  const { businessName, eventType, entityName, entityPrice, entityDuration, entityRole, bookingUrl } = opts;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

  // Determine post type from event
  const postType: GBPPostTopicType =
    eventType === "gift_cards_enabled" ? "OFFER" :
    eventType === "announcement"       ? "ALERT" :
    "WHATS_NEW";

  const cta: { ctaType: GBPCTAType; ctaUrl: string } | undefined = bookingUrl
    ? { ctaType: "BOOK" as GBPCTAType, ctaUrl: bookingUrl }
    : undefined;

  if (!apiKey) {
    return { ...buildFallbackPostContent(opts), postType, ...cta };
  }

  const priceStr    = entityPrice ? `$${parseFloat(entityPrice).toFixed(0)}` : null;
  const durationStr = entityDuration ? `${entityDuration} min` : null;

  const dataLines: string[] = [`Business name: ${businessName}`];
  if (entityName)     dataLines.push(`${eventType === "staff_added" ? "Staff name" : "Service name"}: ${entityName}`);
  if (entityRole)     dataLines.push(`Role: ${entityRole}`);
  if (priceStr)       dataLines.push(`Price: ${priceStr}`);
  if (durationStr)    dataLines.push(`Duration: ${durationStr}`);

  const instructions: Record<GBPPostEventType, string> = {
    service_created:     `Write a warm, 1-sentence "What's New" Google Business post announcing this new service. Include the service name and price if given. Do NOT invent discounts or special offers.`,
    service_updated:     `Write a warm, 1-sentence Google Business post about an update to this service. Mention the service name. Do NOT invent discounts or describe changes not mentioned.`,
    staff_added:         `Write a warm, 1-sentence Google Business post welcoming a new team member. Use their first name if available. Do NOT invent their qualifications.`,
    gift_cards_enabled:  `Write a warm, 1-sentence Google Business Offer post announcing that gift cards are now available at this salon. Do NOT invent specific amounts or discounts.`,
    announcement:        `Write a clear, 1-sentence Google Business announcement post for this salon.`,
  };

  const prompt = [
    `You are writing a Google Business Profile post for a professional beauty salon.`,
    ``,
    `Data (use ONLY this — never invent):`,
    ...dataLines,
    ``,
    `Task: ${instructions[eventType]}`,
    ``,
    `Rules:`,
    `- 80–200 characters total`,
    `- Warm and professional tone`,
    `- Do NOT add hashtags`,
    `- Do NOT invent prices, discounts, or promotions`,
    `- Do NOT add a sign-off like "Visit us" or "Call us" — the CTA button handles that`,
    `- Return ONLY the post text, no labels or prefixes`,
  ].join("\n");

  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({ apiKey, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 100,
      temperature: 0.7,
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (text && text.length > 20) {
      console.log(`[GBP Posts] AI post generated for storeId=${opts.storeId} event=${eventType} len=${text.length}`);
      return { summary: text, postType, ...cta };
    }
  } catch (err: any) {
    console.warn("[GBP Posts] AI generation failed, using fallback:", err?.message ?? err);
  }

  return { ...buildFallbackPostContent(opts), postType, ...cta };
}

function buildFallbackPostContent(opts: PostContentOpts): Pick<GeneratedPostContent, "summary"> {
  const { businessName, eventType, entityName, entityPrice, entityRole } = opts;
  const biz   = businessName ?? "our salon";
  const name  = entityName ?? "a new addition";
  const price = entityPrice ? ` starting at $${parseFloat(entityPrice).toFixed(0)}` : "";

  const templates: Record<GBPPostEventType, string> = {
    service_created:    `✨ New at ${biz}: ${name}${price}. Book your appointment today!`,
    service_updated:    `We've updated our ${name} service at ${biz}. Check it out!`,
    staff_added:        `Welcome ${name} to the ${biz} team${entityRole ? ` as our new ${entityRole}` : ""}!`,
    gift_cards_enabled: `🎁 Gift cards are now available at ${biz} — the perfect gift for any occasion!`,
    announcement:       `An update from ${biz} — stay tuned for exciting news!`,
  };

  return { summary: templates[eventType] };
}

// ─── Event Detector ───────────────────────────────────────────────────────────

export interface GBPPostEventData {
  /** Entity ID (service.id, staff.id, etc.) used for dedup hashing */
  entityId: number | string;
  /** Human-readable name of the entity */
  entityName?: string;
  /** Price string from DB (services.price) */
  entityPrice?: string;
  /** Duration in minutes (services.duration) */
  entityDuration?: number;
  /** Role for staff events */
  entityRole?: string;
  /** Free-form summary for announcement events */
  announcementText?: string;
}

/**
 * Main entry point for the post engine.
 * Called fire-and-forget from routes.ts after successful CRUD operations.
 *
 * Responsibility:
 *  1. Load settings — bail if auto-posting is disabled
 *  2. Check store has a GBP connection (no credits wasted otherwise)
 *  3. Compute topic hash — skip if already queued for this entity
 *  4. Generate post content via AI or fallback
 *  5. Insert into gbp_post_queue as 'draft' (ON CONFLICT DO NOTHING for safety)
 */
export async function detectAndEnqueuePost(
  storeId: number,
  eventType: GBPPostEventType,
  data: GBPPostEventData,
): Promise<void> {
  // ── 1. Settings ───────────────────────────────────────────────────────────
  const settings = await getOrCreatePostSettings(storeId);
  if (!settings.autoPostEnabled) {
    console.log(`[GBP Posts] storeId=${storeId} — auto-posting disabled, skipping event=${eventType}`);
    return;
  }

  // ── 2. Validate store has a GBP connection (don't burn OpenAI without one) ─
  const connection = await resolveGBPPostConnection(storeId);
  if (!connection) {
    console.log(`[GBP Posts] storeId=${storeId} — no GBP connection, skipping event=${eventType}`);
    return;
  }

  // ── 3. Dedup via topic hash ───────────────────────────────────────────────
  const topicHash = computeTopicHash(storeId, eventType, data.entityId);
  const existing = await db
    .select({ id: gbpPostQueue.id, status: gbpPostQueue.status })
    .from(gbpPostQueue)
    .where(and(
      eq(gbpPostQueue.storeId, storeId),
      eq(gbpPostQueue.topicHash, topicHash),
    ))
    .limit(1);

  if (existing.length && !["cancelled", "failed"].includes(existing[0].status)) {
    console.log(`[GBP Posts] storeId=${storeId} — duplicate topic_hash for event=${eventType} entityId=${data.entityId}, skipping`);
    return;
  }

  // ── 4. Load store info for content generation ─────────────────────────────
  const storeRows = await db
    .select({ name: locations.name, bookingSlug: locations.bookingSlug })
    .from(locations)
    .where(eq(locations.id, storeId))
    .limit(1);

  if (!storeRows.length) {
    console.warn(`[GBP Posts] storeId=${storeId} — store not found`);
    return;
  }

  const { name: businessName, bookingSlug } = storeRows[0];
  const bookingUrl = bookingSlug ? `https://certxa.com/book/${bookingSlug}` : undefined;

  // ── 5. Generate post content ──────────────────────────────────────────────
  let content: GeneratedPostContent;
  try {
    content = await generatePostContent({
      storeId,
      businessName: businessName ?? "Our Salon",
      eventType,
      entityName:     data.entityName,
      entityPrice:    data.entityPrice,
      entityDuration: data.entityDuration,
      entityRole:     data.entityRole,
      bookingUrl,
    });

    // Override summary for announcements if caller provides custom text
    if (eventType === "announcement" && data.announcementText?.trim()) {
      content.summary = data.announcementText.trim().slice(0, 500);
    }
  } catch (err: any) {
    console.error(`[GBP Posts] Content generation failed for storeId=${storeId}:`, err?.message ?? err);
    return;
  }

  // ── 6. Calculate eligibility window ──────────────────────────────────────
  const eligibleAfter = new Date(Date.now() + settings.postDelayHours * 60 * 60 * 1000);

  // ── 7. Insert queue row (ON CONFLICT DO NOTHING as belt-and-suspenders) ──
  const initialStatus = settings.requireApproval ? "draft" : "approved";

  const insertedRows = await db
    .insert(gbpPostQueue)
    .values({
      storeId,
      postType:        content.postType,
      status:          initialStatus,
      sourceEventType: eventType,
      sourceEventId:   `${eventType.split("_")[0]}:${data.entityId}`,
      topicHash,
      generatedSummary: content.summary,
      ctaType:          content.ctaType ?? null,
      ctaUrl:           content.ctaUrl ?? null,
      eligibleAfter,
    })
    .onConflictDoNothing()
    .returning();

  if (!insertedRows.length) {
    console.log(`[GBP Posts] storeId=${storeId} — ON CONFLICT hit for topic_hash, already queued`);
    return;
  }

  const queueRow = insertedRows[0];
  console.log(`[GBP Posts] Enqueued storeId=${storeId} event=${eventType} queueId=${queueRow.id} status=${initialStatus}`);

  // If auto-approved (requireApproval=false), schedule it immediately
  if (initialStatus === "approved") {
    await scheduleApprovedPost(queueRow.id, storeId, settings.postDelayHours);
  }
}

// ─── Schedule Approved Post ───────────────────────────────────────────────────

/**
 * Finds the next business-hours slot and sets scheduled_for on an approved post.
 * Called from the approve route and from detectAndEnqueuePost when require_approval=false.
 */
export async function scheduleApprovedPost(
  queueId: number,
  storeId: number,
  postDelayHours: number,
): Promise<Date> {
  const eligibleFloor = new Date(Date.now() + postDelayHours * 60 * 60 * 1000);
  const nextSlot = await getNextBusinessHourSlot(storeId, eligibleFloor);
  const scheduledFor = nextSlot ?? eligibleFloor;

  await db
    .update(gbpPostQueue)
    .set({ scheduledFor, updatedAt: new Date() })
    .where(eq(gbpPostQueue.id, queueId));

  return scheduledFor;
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export async function runPostDispatcher(): Promise<void> {
  const now = new Date();

  const dueItems = await db
    .select()
    .from(gbpPostQueue)
    .where(and(
      inArray(gbpPostQueue.status, ["approved", "scheduled"]),
      lte(gbpPostQueue.scheduledFor, now),
    ))
    .orderBy(gbpPostQueue.scheduledFor)
    .limit(10);

  if (dueItems.length) {
    console.log(`[GBP Posts] Dispatcher — ${dueItems.length} post(s) due for publishing`);
  }

  for (const item of dueItems) {
    try {
      await publishQueuedPost(item, now);
    } catch (err: any) {
      console.error(`[GBP Posts] Dispatcher — failed for queueId=${item.id}:`, err?.message ?? err);
    }
  }
}

async function publishQueuedPost(
  item: typeof gbpPostQueue.$inferSelect,
  now: Date,
): Promise<void> {
  if (!item.generatedSummary?.trim()) {
    await markPostFailed(item.id, "No post content");
    return;
  }

  // ── Quota guard ───────────────────────────────────────────────────────────
  const cooldown = isQuotaCoolingDown();
  if (cooldown.coolingDown) {
    const mins = Math.ceil(cooldown.retryAfterMs / 60_000);
    const retryAt = new Date(Date.now() + cooldown.retryAfterMs);
    await db.update(gbpPostQueue).set({
      scheduledFor:  retryAt,
      failureReason: `Quota cooldown active — retrying in ${mins}m`,
      updatedAt:     new Date(),
    }).where(eq(gbpPostQueue.id, item.id));
    console.warn(`[GBP Posts] queueId=${item.id} — quota cooldown, rescheduled ${mins}m`);
    return;
  }

  // ── Load settings ─────────────────────────────────────────────────────────
  const settings = await getOrCreatePostSettings(item.storeId);

  // ── Frequency limit ───────────────────────────────────────────────────────
  const limitReached = await isFrequencyLimitReached(item.storeId, settings.maxPostsPerWeek);
  if (limitReached) {
    // Re-schedule 2 days out (at next business-hours slot)
    const futureSeed = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const nextSlot   = await getNextBusinessHourSlot(item.storeId, futureSeed);
    const retryAt    = nextSlot ?? futureSeed;
    await db.update(gbpPostQueue).set({
      scheduledFor:  retryAt,
      failureReason: `Frequency limit reached (max ${settings.maxPostsPerWeek}/week) — rescheduled`,
      updatedAt:     new Date(),
    }).where(eq(gbpPostQueue.id, item.id));
    console.log(`[GBP Posts] queueId=${item.id} — frequency limit, rescheduled to ${retryAt.toISOString()}`);
    return;
  }

  // ── Business hours ────────────────────────────────────────────────────────
  const withinHours = await isWithinBusinessHours(item.storeId, now);
  if (!withinHours) {
    const nextSlot = await getNextBusinessHourSlot(item.storeId, now);
    if (nextSlot) {
      await db.update(gbpPostQueue).set({
        scheduledFor: nextSlot,
        updatedAt: new Date(),
      }).where(eq(gbpPostQueue.id, item.id));
      console.log(`[GBP Posts] queueId=${item.id} — outside business hours, rescheduled to ${nextSlot.toISOString()}`);
    }
    return;
  }

  // ── Resolve GBP connection ────────────────────────────────────────────────
  const connection = await resolveGBPPostConnection(item.storeId);
  if (!connection) {
    await markPostFailed(item.id, "No connected Google account found for this store");
    return;
  }

  // ── Increment attempts ────────────────────────────────────────────────────
  await db.update(gbpPostQueue).set({
    attempts: item.attempts + 1,
    updatedAt: new Date(),
  }).where(eq(gbpPostQueue.id, item.id));

  // ── Publish to GBP ────────────────────────────────────────────────────────
  try {
    const postResult = await createGBPLocalPost(
      {
        locationResourceName: connection.locationResourceName,
        topicType:            item.postType as GBPPostTopicType,
        summary:              item.generatedSummary,
        callToAction:         item.ctaType && item.ctaUrl
          ? { actionType: item.ctaType as GBPCTAType, url: item.ctaUrl }
          : undefined,
      },
      connection.client,
    );

    // ── Atomic success writes ───────────────────────────────────────────────
    await db.transaction(async (tx) => {
      await tx.update(gbpPostQueue).set({
        status:        "published",
        gbpPostId:     postResult.postResourceName,
        publishResult: postResult.rawResponse,
        publishedAt:   new Date(),
        failureReason: null,
        updatedAt:     new Date(),
      }).where(eq(gbpPostQueue.id, item.id));
    });

    console.log(`[GBP Posts] ✓ Published queueId=${item.id} postId=${postResult.postResourceName}`);

  } catch (err: any) {
    const errMsg = String(err?.message ?? err);

    // Auth failure — mark store as needing reconnect
    if (isGBPAuthError(err) || err?.isAuthError) {
      await markGBPAuthFailed(item.storeId, errMsg);
      await markPostFailed(item.id, `Auth failure: ${errMsg}`);
      return;
    }

    // 429 Rate limit — respect Retry-After header
    if (err?.status === 429) {
      recordQuota429(err);
      const retryAfterSecs = 0; // headers not available here from thrown error
      const delayMinutes   = retryAfterSecs > 0 ? Math.ceil(retryAfterSecs / 60) + 5 : 60;
      const retryAt        = new Date(Date.now() + delayMinutes * 60 * 1000);
      await db.update(gbpPostQueue).set({
        scheduledFor:  retryAt,
        failureReason: `HTTP 429 rate limited — retry in ${delayMinutes}m`,
        updatedAt:     new Date(),
      }).where(eq(gbpPostQueue.id, item.id));
      console.warn(`[GBP Posts] queueId=${item.id} — 429 rate limited, rescheduled ${delayMinutes}m`);
      return;
    }

    // Retry with backoff
    console.error(`[GBP Posts] Publish failed queueId=${item.id}:`, errMsg);
    if (item.attempts + 1 >= MAX_PUBLISH_ATTEMPTS) {
      await markPostFailed(item.id, errMsg);
    } else {
      const backoffMin = RETRY_BACKOFF_MINUTES[item.attempts] ?? 120;
      const retryAt    = new Date(Date.now() + backoffMin * 60 * 1000);
      await db.update(gbpPostQueue).set({
        scheduledFor:  retryAt,
        failureReason: errMsg,
        updatedAt:     new Date(),
      }).where(eq(gbpPostQueue.id, item.id));
    }
  }
}

async function markPostFailed(queueId: number, reason: string) {
  await db.update(gbpPostQueue).set({
    status:        "failed",
    failureReason: reason,
    updatedAt:     new Date(),
  }).where(eq(gbpPostQueue.id, queueId));
  console.error(`[GBP Posts] queueId=${queueId} marked FAILED: ${reason}`);
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

export function startPostEngineDispatcher(): void {
  const INTERVAL_MS     = 5 * 60 * 1000;  // every 5 minutes
  const INITIAL_DELAY   = 120 * 1000;     // 2 minutes after boot (after review engine)

  setTimeout(async () => {
    console.log("[GBP Posts] Dispatcher — initial run");
    await runPostDispatcher().catch((e) =>
      console.error("[GBP Posts] Dispatcher error:", e),
    );
    setInterval(async () => {
      await runPostDispatcher().catch((e) =>
        console.error("[GBP Posts] Dispatcher error:", e),
      );
    }, INTERVAL_MS);
  }, INITIAL_DELAY);

  console.log("[GBP Posts] Post engine dispatcher started (5-minute interval)");
}
