/**
 * Google Review Management Engine — Phase 2
 *
 * Orchestrates automated, natural-sounding responses to Google reviews with:
 *   • Configurable minimum delay (default 1 hour after review creation)
 *   • Business-hours gating — responses only go out when the salon is open
 *   • Sentiment-aware rules:
 *       4–5 ★ → auto-respond after delay
 *       3 ★   → generate draft, require owner approval
 *       1–2 ★ → notify owner, never auto-publish
 *   • Anti-repetition: passes recent published responses to AI so it varies wording
 *   • Full audit trail in google_review_response_queue
 *
 * ENTRY POINTS:
 *   processNewReviewsForStore(storeId)  — called after every review sync
 *   runResponseDispatcher()             — runs every 5 min, publishes due responses
 */

import { db } from "../db";
import { encryptToken, decryptToken } from "../lib/googleTokenCrypto";
import { OAuth2Client } from "google-auth-library";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import {
  googleReviews,
  googleReviewResponses,
  googleReviewEngineSettings,
  googleReviewResponseQueue,
  googleBusinessLocations,
  googleBusinessAccounts,
  googleBusinessProfiles,
  businessHours,
  appointments,
  locations,
  calendarSettings,
  staff,
  clients,
} from "@shared/schema";
import { eq, and, lte, inArray, ne, isNull, desc, lt, gte } from "drizzle-orm";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_PUBLISH_ATTEMPTS = 3;
const RETRY_BACKOFF_MINUTES = [5, 15, 60]; // wait before retry on failure

// ─── Timezone Helper ──────────────────────────────────────────────────────────

/** Returns the store's IANA timezone string from calendar_settings, defaulting to UTC. */
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

// ─── Business Hours Utilities ─────────────────────────────────────────────────

/**
 * Returns true if `moment` (a UTC Date) falls within any open business-hours
 * window for the store, evaluated in the store's local timezone.
 *
 * BUG-1 FIX: Previously used server local time (UTC on Replit) instead of the
 * salon's IANA timezone. Now uses formatInTimeZone from date-fns-tz.
 */
async function isWithinBusinessHours(storeId: number, moment: Date): Promise<boolean> {
  const tz = await getStoreTimezone(storeId);

  // Get local time components in the salon's timezone
  const localHHmm = formatInTimeZone(moment, tz, "HH:mm");
  // ISO day: 1=Mon…7=Sun → convert to JS convention 0=Sun…6=Sat via % 7
  const isoDay = parseInt(formatInTimeZone(moment, tz, "i"), 10);
  const dow = isoDay % 7;

  const [hh, mm] = localHHmm.split(":").map(Number);
  const nowMinutes = hh * 60 + mm;

  const rows = await db
    .select()
    .from(businessHours)
    .where(and(eq(businessHours.storeId, storeId), eq(businessHours.dayOfWeek, dow)))
    .limit(1);

  if (!rows.length) return false; // no hours row → assume closed
  const bh = rows[0];
  if (bh.isClosed) return false;

  const [openH, openM]   = bh.openTime.split(":").map(Number);
  const [closeH, closeM] = bh.closeTime.split(":").map(Number);
  const openMinutes  = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
}

/**
 * Finds the next UTC Date that falls within the store's business hours,
 * starting from `earliest`. All comparisons use the salon's local timezone.
 * Looks forward up to 14 days before giving up.
 *
 * BUG-1 FIX: Uses formatInTimeZone + fromZonedTime instead of server-local getDay/getHours.
 */
export async function getNextBusinessHourSlot(storeId: number, earliest: Date): Promise<Date | null> {
  const tz = await getStoreTimezone(storeId);

  // Load all business_hours rows for this store once
  const allHours = await db
    .select()
    .from(businessHours)
    .where(eq(businessHours.storeId, storeId));

  if (!allHours.length) return null;

  // Build a lookup: dow (JS 0=Sun..6=Sat) → { isClosed, openMinutes, closeMinutes, openTime }
  const hoursByDow: Record<number, {
    isClosed:     boolean;
    openMinutes:  number;
    closeMinutes: number;
    openTime:     string;
  }> = {};
  for (const bh of allHours) {
    const [oh, om] = bh.openTime.split(":").map(Number);
    const [ch, cm] = bh.closeTime.split(":").map(Number);
    hoursByDow[bh.dayOfWeek] = {
      isClosed:     bh.isClosed,
      openMinutes:  oh * 60 + om,
      closeMinutes: ch * 60 + cm,
      openTime:     bh.openTime,
    };
  }

  let candidate = new Date(earliest.getTime());

  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    // All time comparisons use the salon's local timezone
    const localHHmm    = formatInTimeZone(candidate, tz, "HH:mm");
    const isoDay       = parseInt(formatInTimeZone(candidate, tz, "i"), 10);
    const dow          = isoDay % 7; // JS convention: 0=Sun..6=Sat
    const localDateStr = formatInTimeZone(candidate, tz, "yyyy-MM-dd");

    const [hh, mm]     = localHHmm.split(":").map(Number);
    const candidateMin = hh * 60 + mm;

    const bhRow = hoursByDow[dow];
    if (bhRow && !bhRow.isClosed) {
      if (candidateMin < bhRow.openMinutes) {
        // Before open — snap to the opening time on this local day
        const [openH, openM] = bhRow.openTime.split(":").map(Number);
        const snapStr = `${localDateStr}T${String(openH).padStart(2, "0")}:${String(openM).padStart(2, "0")}:00`;
        return fromZonedTime(snapStr, tz);
      }
      if (candidateMin < bhRow.closeMinutes) {
        // Already within business hours
        return candidate;
      }
    }

    // Roll forward to the start of the next local day (handles DST correctly)
    const nextApprox   = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
    const nextLocalDate = formatInTimeZone(nextApprox, tz, "yyyy-MM-dd");
    candidate = fromZonedTime(`${nextLocalDate}T00:00:00`, tz);
  }

  return null; // no open slot found within 14 days
}

// ─── Settings ─────────────────────────────────────────────────────────────────

async function getOrCreateSettings(storeId: number) {
  const existing = await db
    .select()
    .from(googleReviewEngineSettings)
    .where(eq(googleReviewEngineSettings.storeId, storeId))
    .limit(1);

  if (existing.length) return existing[0];

  const rows = await db
    .insert(googleReviewEngineSettings)
    .values({ storeId })
    .returning();
  return rows[0];
}

// ─── AI Response Generation ───────────────────────────────────────────────────

/** Builds a natural response prompt that avoids the N most recent published replies. */
async function generateReviewResponse(opts: {
  storeId:       number;
  businessName:  string;
  customerName:  string | null;
  rating:        number;
  reviewText:    string | null;
  serviceName?:  string | null;
  staffName?:    string | null;
}): Promise<string | null> {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return buildFallbackResponse(opts);

  // Fetch up to 5 recent published responses for this store to avoid repetition
  const recentResponses = await db
    .select({ responseText: googleReviewResponses.responseText })
    .from(googleReviewResponses)
    .where(and(
      eq(googleReviewResponses.storeId, opts.storeId),
      eq(googleReviewResponses.responseStatus, "published"),
    ))
    .orderBy(desc(googleReviewResponses.updatedAt))
    .limit(5);

  const recentTexts = recentResponses.map((r) => r.responseText).join("\n---\n");

  const ratingLabel =
    opts.rating >= 5 ? "5-star (excellent)" :
    opts.rating === 4 ? "4-star (positive)" :
    opts.rating === 3 ? "3-star (neutral/mixed)" :
    opts.rating === 2 ? "2-star (disappointed)" :
    "1-star (very unhappy)";

  const contextLines = [];
  if (opts.serviceName) contextLines.push(`Service received: ${opts.serviceName}`);
  if (opts.staffName)   contextLines.push(`Staff member: ${opts.staffName}`);
  const contextBlock = contextLines.length ? contextLines.join("\n") : "(no appointment context)";

  const avoidBlock = recentTexts
    ? `\nDo NOT use phrases or sentence structures from these recent replies (vary the wording):\n---\n${recentTexts}\n---`
    : "";

  const instructions =
    opts.rating >= 4
      ? "Thank them warmly and genuinely. Invite them back. Mention the service or staff if provided — it feels more personal."
      : opts.rating === 3
      ? "Acknowledge mixed feedback with empathy. Show commitment to improvement. Don't be defensive."
      : "Apologise sincerely and thank them genuinely for taking the time to share their feedback. Express that their thoughts are important and that you're committed to making every visit a great one. Express hope to welcome them back soon. Do NOT invite them to contact you privately. Do NOT offer discounts, refunds, or any form of compensation. Keep a warm, humble tone.";

  const prompt = [
    `You are the owner of "${opts.businessName}", a professional salon.`,
    `Write ONE natural, warm reply to a Google review. You are replying publicly on behalf of the business.`,
    ``,
    `Customer: ${opts.customerName || "a customer"}`,
    `Rating: ${ratingLabel}`,
    `Review: ${opts.reviewText ? `"${opts.reviewText}"` : "(rating only — no written comment)"}`,
    `Appointment context: ${contextBlock}`,
    ``,
    `Instructions: ${instructions}`,
    `- Keep it 50–130 words. One paragraph.`,
    `- Address the customer by first name if available.`,
    `- Be warm and authentic. No corporate stiffness.`,
    `- Do NOT mention private appointment details (exact times, prices, medical info).`,
    `- Do NOT make promises ("we will", "we guarantee").`,
    `- Do NOT argue with the customer.`,
    `- Do NOT add a sign-off like "Sincerely" or "Best regards".`,
    `- Do NOT add a label like "Response:" or "Reply:".`,
    avoidBlock,
    ``,
    `Return ONLY the reply text as a plain string (no JSON, no labels).`,
  ].join("\n");

  try {
    const { default: OpenAI } = await import("openai");
    const openai = new OpenAI({
      apiKey,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 300,
      temperature: 0.85, // some variety
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (text && text.length > 10) {
      console.log(`[ReviewEngine] AI response generated for storeId=${opts.storeId} rating=${opts.rating} len=${text.length}`);
      return text;
    }
    return buildFallbackResponse(opts);
  } catch (err: any) {
    console.warn("[ReviewEngine] AI generation failed, using fallback:", err?.message ?? err);
    return buildFallbackResponse(opts);
  }
}

function buildFallbackResponse(opts: {
  businessName: string;
  customerName: string | null;
  rating:       number;
}): string {
  const name = (opts.customerName ?? "").split(" ")[0] || "there";
  const biz  = opts.businessName;

  if (opts.rating >= 5) {
    const opts5 = [
      `Thank you so much, ${name}! We truly appreciate your kind words and your trust in ${biz}. It means everything to our team, and we can't wait to welcome you back.`,
      `We're so grateful for your review, ${name}! Hearing that you had a great experience at ${biz} really makes our day. We look forward to seeing you again soon.`,
      `Thank you, ${name}! Your support motivates our whole team at ${biz}. We're delighted you enjoyed your visit and hope to see you again very soon.`,
    ];
    return opts5[Math.floor(Math.random() * opts5.length)];
  }
  if (opts.rating === 4) {
    const opts4 = [
      `Thank you for your review, ${name}! We're glad you had a positive experience at ${biz} and we appreciate you taking the time to share it. We'd love to have you back soon.`,
      `We appreciate the feedback, ${name}! It's great to hear you enjoyed your visit to ${biz}. We're always looking to improve, and we look forward to seeing you again.`,
    ];
    return opts4[Math.floor(Math.random() * opts4.length)];
  }
  if (opts.rating === 3) {
    return `Thank you for your honest feedback, ${name}. We take every review seriously at ${biz} and are always working to improve. We'd love the chance to make your next visit better — please don't hesitate to reach out.`;
  }
  const negOpts = [
    `Hi ${name}, thank you for taking the time to leave a review. We appreciate your feedback and are truly sorry to hear that your experience didn't fully meet your expectations. Your thoughts are important to us, and we're committed to making every visit a great one. We hope to have the opportunity to welcome you back soon and provide you with the exceptional service we strive for.`,
    `Thank you for your feedback, ${name}. We sincerely apologize that your experience at ${biz} fell short of what you deserved. We take every review seriously and are truly grateful you shared your thoughts — it helps us improve. We hope to welcome you back and show you the quality we're committed to delivering.`,
    `Hi ${name}, we're so sorry your visit to ${biz} didn't meet your expectations. Thank you for taking the time to share your feedback — it genuinely means a lot to us. We're dedicated to making every experience a positive one, and we hope you'll give us the chance to do better for you in the future.`,
  ];
  return negOpts[Math.floor(Math.random() * negOpts.length)];
}

// ─── Owner Notification ───────────────────────────────────────────────────────

/**
 * Notifies the owner of a 1–2★ review via email AND activity feed.
 *
 * L-3 FIX: Activity feed was always fired regardless of notifyOwner12Star setting.
 *          Now both email AND activity log are gated together inside this function,
 *          which is only called when settings.notifyOwner12Star === true.
 * L-2 FIX: Replaced hardcoded https://certxa.com with APP_URL env var.
 */
async function notifyOwnerOfLowRating(storeId: number, review: {
  id: number;
  customerName: string | null;
  rating:       number;
  reviewText:   string | null;
}): Promise<void> {
  const appUrl = process.env.APP_URL ?? "https://certxa.com";

  // Activity feed entry (visible in the owner dashboard)
  try {
    const { logActivityEvent } = await import("../lib/activityFeed");
    await logActivityEvent({
      storeId,
      eventType: "review",
      message: `⚠️ ${review.rating}-star Google review received from ${review.customerName ?? "Anonymous"} — your attention required.`,
    });
  } catch (e) {
    console.warn("[ReviewEngine] Could not log activity event:", e);
  }

  // Email notification if mail is configured
  try {
    const storeRows = await db
      .select({ name: locations.name, userId: locations.userId })
      .from(locations)
      .where(eq(locations.id, storeId))
      .limit(1);

    if (!storeRows.length || !storeRows[0].userId) return;

    const { users } = await import("@shared/schema");
    const userRows = await db
      .select({ email: users.email, firstName: users.firstName })
      .from(users)
      .where(eq(users.id, storeRows[0].userId))
      .limit(1);

    if (!userRows.length || !userRows[0].email) return;

    const { sendEmail } = await import("../mail");
    const stars = "★".repeat(review.rating) + "☆".repeat(5 - review.rating);
    const ownerName = userRows[0].firstName ?? "there";
    const businessName = storeRows[0].name ?? "your salon";

    await sendEmail(
      storeId,
      userRows[0].email,
      `[Action Required] ${review.rating}-star review needs your attention — ${businessName}`,
      `
        <div style="font-family:sans-serif;max-width:560px;margin:auto">
          <h2 style="color:#dc2626">New ${review.rating}-star Google Review</h2>
          <p>Hi ${ownerName},</p>
          <p>A new low-rating review has been received for <strong>${businessName}</strong> and requires your attention.</p>
          <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px;margin:16px 0;border-radius:4px">
            <p style="margin:0;font-size:18px">${stars}</p>
            <p style="margin:8px 0 0"><strong>From:</strong> ${review.customerName ?? "Anonymous"}</p>
            ${review.reviewText ? `<p style="margin:8px 0 0;font-style:italic">"${review.reviewText}"</p>` : ""}
          </div>
          <p>Log in to Certxa to view this review and write a response.</p>
          <p><a href="${appUrl}/google-business" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">View &amp; Respond</a></p>
          <p style="color:#6b7280;font-size:12px;margin-top:24px">You're receiving this because you have low-rating review notifications enabled. Manage your settings in the Google Business section of Certxa.</p>
        </div>
      `,
    );
    console.log(`[ReviewEngine] Owner notified by email for storeId=${storeId} rating=${review.rating}`);
  } catch (e: any) {
    console.warn("[ReviewEngine] Could not send owner notification email:", e?.message ?? e);
  }
}

// ─── Process New Reviews ──────────────────────────────────────────────────────

/**
 * Called after every successful review sync.
 * For each NEW review (no queue entry yet), decides the action and enqueues it.
 *
 * BUG-3 FIX: No longer exits early when autoRespondEnabled=false.
 *   The master toggle only gates auto-publishing (schedule/await_approval paths).
 *   1–2★ owner notifications must fire regardless — owners rely on these alerts.
 *   The per-action skip is now handled inside processOneReview.
 *
 * L-6 FIX: Validates that the store actually exists before burning OpenAI credits.
 */
export async function processNewReviewsForStore(storeId: number): Promise<void> {
  const settings = await getOrCreateSettings(storeId);
  // NOTE: Do NOT early-exit on autoRespondEnabled=false here.
  // Low-rating owner alerts must still run — see BUG-3 fix above.

  // Get store name for AI responses — also validates the store exists (L-6)
  const storeRows = await db
    .select({ name: locations.name })
    .from(locations)
    .where(eq(locations.id, storeId))
    .limit(1);

  if (!storeRows.length) {
    console.warn(`[ReviewEngine] storeId=${storeId} — location record not found, aborting to avoid wasting AI credits`);
    return;
  }

  const businessName = storeRows[0].name ?? "our salon";

  // Find all reviews for this store that have no active queue entry yet.
  // BUG-10 FIX: 'failed' entries are intentionally excluded from the exclusion set so that
  // reviews which failed due to transient errors (expired OAuth, API 5xx) can be re-queued.
  // 'not_found' IS included — a 404 means the review was permanently deleted by Google; it
  // must never be re-queued or it will loop forever.
  const existingQueueReviewIds = await db
    .select({ googleReviewId: googleReviewResponseQueue.googleReviewId })
    .from(googleReviewResponseQueue)
    .where(and(
      eq(googleReviewResponseQueue.storeId, storeId),
      // 'failed' excluded intentionally (allows retry on transient errors).
      // 'not_found' included — permanent terminal state, never re-queue.
      inArray(googleReviewResponseQueue.status, ["pending", "scheduled", "awaiting_approval", "approved", "owner_notified", "published", "not_found"]),
    ));
  const queuedIds = new Set(existingQueueReviewIds.map((r) => r.googleReviewId));

  const unqueuedReviews = await db
    .select()
    .from(googleReviews)
    .where(and(
      eq(googleReviews.storeId, storeId),
      // Only reviews that haven't already been responded to on Google
      eq(googleReviews.responseStatus, "not_responded"),
    ))
    .orderBy(desc(googleReviews.reviewCreateTime));

  const newReviews = unqueuedReviews.filter((r) => !queuedIds.has(r.id));

  console.log(`[ReviewEngine] storeId=${storeId} — ${newReviews.length} new review(s) to process`);

  for (const review of newReviews) {
    try {
      await processOneReview({ review, settings, businessName, storeId });
    } catch (err: any) {
      console.error(`[ReviewEngine] Failed to process reviewId=${review.id}:`, err?.message ?? err);
    }
  }
}

async function processOneReview(opts: {
  review:       typeof googleReviews.$inferSelect;
  settings:     typeof googleReviewEngineSettings.$inferSelect;
  businessName: string;
  storeId:      number;
}): Promise<void> {
  const { review, settings, businessName, storeId } = opts;
  const rating = review.rating;

  // BUG-4 FIX: Guard against RATING_UNSPECIFIED (rating=0) and any other out-of-range value.
  // Google occasionally returns these for pending/moderated reviews.
  if (rating < 1 || rating > 5) {
    console.log(`[ReviewEngine] reviewId=${review.id} — invalid rating=${rating}, skipping (RATING_UNSPECIFIED or out of range)`);
    return;
  }

  // AGE GUARD: Skip reviews older than maxReviewAgeDays.
  // When an owner first connects GBP, Google returns all reviews from all time.
  // Without this guard the engine would auto-reply to years of old reviews.
  // maxReviewAgeDays=0 means no age gate (opt-in to reply to everything).
  const maxAgeDays = settings.maxReviewAgeDays ?? 21;
  if (maxAgeDays > 0) {
    const reviewDate = review.reviewCreateTime ?? review.createdAt ?? null;
    if (reviewDate) {
      const ageMs   = Date.now() - new Date(reviewDate).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      if (ageDays > maxAgeDays) {
        console.log(
          `[ReviewEngine] reviewId=${review.id} — skipped (age ${Math.floor(ageDays)}d > maxReviewAgeDays ${maxAgeDays})`,
        );
        return;
      }
    }
  }

  // Resolve appointment context (staff + service) if linked
  let serviceName: string | null = null;
  let staffName:   string | null = null;
  if (review.appointmentId) {
    try {
      const apptRows = await db
        .select({ staffName: staff.name })
        .from(appointments)
        .leftJoin(staff, eq(appointments.staffId, staff.id))
        .where(eq(appointments.id, review.appointmentId))
        .limit(1);

      if (apptRows.length && apptRows[0].staffName) {
        staffName = apptRows[0].staffName;
      }
    } catch {
      // Non-fatal — continue without appointment context
    }
  }

  // Calculate timing
  const receivedAt = review.reviewCreateTime ?? new Date();
  const delayMs    = settings.minResponseDelayMinutes * 60 * 1000;
  const eligibleAt = new Date(receivedAt.getTime() + delayMs);

  // ── Determine action ──────────────────────────────────────────────────────
  //
  // All reviews (1–5★) are auto-scheduled when autoRespondEnabled is true.
  //   • Tone is rating-aware: warm thanks for 4–5★, empathetic for 3★,
  //     sincere apology + thank-you for 1–2★.
  //   • 1–2★ reviews also trigger an owner email alert when notifyOwner12Star=true.
  //   • Per-rating toggles (autoRespond5Star etc.) are no longer consulted —
  //     the master toggle is the single control.

  console.log(`[ReviewEngine] reviewId=${review.id} rating=${rating} autoRespondEnabled=${settings.autoRespondEnabled}`);

  if (!settings.autoRespondEnabled) {
    // When the engine is off, still send the low-rating owner alert if configured.
    if (rating <= 2 && settings.notifyOwner12Star) {
      await notifyOwnerOfLowRating(storeId, {
        id:           review.id,
        customerName: review.customerName,
        rating,
        reviewText:   review.reviewText,
      });
    }
    console.log(`[ReviewEngine] reviewId=${review.id} — skipped (auto-respond disabled)`);
    return;
  }

  // Generate the AI (or fallback) response for every review.
  const responseText = await generateReviewResponse({
    storeId,
    businessName,
    customerName: review.customerName,
    rating,
    reviewText:   review.reviewText,
    serviceName,
    staffName,
  });

  // Find the next business-hours slot for this review
  let scheduledFor: Date | null = await getNextBusinessHourSlot(storeId, eligibleAt);
  if (!scheduledFor) {
    console.warn(`[ReviewEngine] No business hours found for storeId=${storeId} — will schedule at eligibleAt`);
    scheduledFor = eligibleAt;
  }

  const queueStatus = "scheduled";

  // BUG-6 FIX: Use INSERT ... ON CONFLICT DO NOTHING instead of the pre-flight
  // Set-based check. The unique partial index (grrq_review_unique_idx) prevents
  // duplicates at the DB level; concurrent calls no longer throw constraint errors.
  const insertedRows = await db
    .insert(googleReviewResponseQueue)
    .values({
      storeId,
      googleReviewId:        review.id,
      rating,
      status:                queueStatus,
      reviewReceivedAt:      receivedAt,
      eligibleAfter:         eligibleAt,
      scheduledFor:          scheduledFor ?? undefined,
      generatedResponseText: responseText ?? undefined,
    })
    .onConflictDoNothing()
    .returning();

  // If the row was a duplicate (ON CONFLICT hit), insertedRows is empty — skip notify.
  if (!insertedRows.length) {
    console.log(`[ReviewEngine] reviewId=${review.id} — duplicate, already queued (ON CONFLICT DO NOTHING)`);
    return;
  }

  const queueRow = insertedRows[0];

  // For 1–2★ reviews: also notify the owner via email (gated by settings.notifyOwner12Star).
  // The auto-reply is already scheduled above — this is an additional alert to the owner.
  if (rating <= 2 && settings.notifyOwner12Star) {
    await notifyOwnerOfLowRating(storeId, {
      id:           review.id,
      customerName: review.customerName,
      rating,
      reviewText:   review.reviewText,
    });
    await db
      .update(googleReviewResponseQueue)
      .set({ ownerNotifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(googleReviewResponseQueue.id, queueRow.id));
  }

  console.log(`[ReviewEngine] Queued reviewId=${review.id} queueId=${queueRow.id} status=${queueStatus} scheduledFor=${scheduledFor?.toISOString() ?? "N/A"}`);
}

// ─── Response Dispatcher ──────────────────────────────────────────────────────

/**
 * Runs on a timer (every 5 minutes).
 * Checks for scheduled/approved responses that are now due and publishes them to Google.
 */
export async function runResponseDispatcher(): Promise<void> {
  const now = new Date();

  // Find all rows that are ready to publish
  const dueItems = await db
    .select()
    .from(googleReviewResponseQueue)
    .where(and(
      inArray(googleReviewResponseQueue.status, ["scheduled", "approved"]),
      lte(googleReviewResponseQueue.scheduledFor, now),
    ))
    .orderBy(googleReviewResponseQueue.scheduledFor)
    .limit(20); // process at most 20 at a time to avoid burst

  if (dueItems.length) {
    console.log(`[ReviewEngine] Dispatcher — ${dueItems.length} response(s) due for publishing`);
  }

  for (const item of dueItems) {
    try {
      await publishQueuedResponse(item, now);
    } catch (err: any) {
      console.error(`[ReviewEngine] Dispatcher — failed for queueId=${item.id}:`, err?.message ?? err);
    }
  }
}

async function publishQueuedResponse(
  item: typeof googleReviewResponseQueue.$inferSelect,
  now: Date,
): Promise<void> {
  if (!item.generatedResponseText) {
    console.warn(`[ReviewEngine] queueId=${item.id} — no response text, skipping`);
    await db.update(googleReviewResponseQueue).set({
      status: "failed",
      failureReason: "No response text generated",
      updatedAt: new Date(),
    }).where(eq(googleReviewResponseQueue.id, item.id));
    return;
  }

  // TESTING MODE: Business hours gate is temporarily disabled so replies can be
  // sent at any time. Re-enable this block (remove the outer comment) before
  // going to production to restore the business-hours gating behaviour.
  //
  // const withinHours = await isWithinBusinessHours(item.storeId, now);
  // if (!withinHours) {
  //   const nextSlot = await getNextBusinessHourSlot(item.storeId, now);
  //   if (nextSlot) {
  //     await db.update(googleReviewResponseQueue).set({
  //       scheduledFor: nextSlot,
  //       updatedAt: new Date(),
  //     }).where(eq(googleReviewResponseQueue.id, item.id));
  //     console.log(`[ReviewEngine] queueId=${item.id} — outside business hours, rescheduled to ${nextSlot.toISOString()}`);
  //     return;
  //   }
  //   console.log(`[ReviewEngine] queueId=${item.id} — no business hours configured, bypassing hours gate and publishing now`);
  // }
  console.log(`[ReviewEngine] queueId=${item.id} — business hours gate DISABLED (testing mode), publishing immediately`);

  // Fetch the review resource name for the GBP API call
  const reviewRows = await db
    .select({
      googleReviewId: googleReviews.googleReviewId,
      googleLocationId: googleReviews.googleLocationId,
      gbLocationId: googleReviews.gbLocationId,
      responseStatus: googleReviews.responseStatus,
      googleReviewResourceName: googleReviews.googleReviewResourceName,
      reviewCreateTime: googleReviews.reviewCreateTime,
      createdAt: googleReviews.createdAt,
    })
    .from(googleReviews)
    .where(eq(googleReviews.id, item.googleReviewId))
    .limit(1);

  if (!reviewRows.length) {
    await markFailed(item.id, "Review record not found");
    return;
  }

  const review = reviewRows[0];

  // AGE GUARD at dispatch time — cancel queued items for reviews older than maxReviewAgeDays.
  // This catches items that were already in the queue before the age guard was introduced,
  // and items retried manually that are too old to reply to.
  const dispatchSettings = await getOrCreateSettings(item.storeId);
  const dispatchMaxAgeDays = dispatchSettings.maxReviewAgeDays ?? 21;
  if (dispatchMaxAgeDays > 0) {
    const reviewDate = review.reviewCreateTime ?? review.createdAt ?? null;
    if (reviewDate) {
      const ageDays = (Date.now() - new Date(reviewDate).getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays > dispatchMaxAgeDays) {
        console.log(
          `[ReviewEngine] queueId=${item.id} — cancelled at dispatch (review age ${Math.floor(ageDays)}d > ${dispatchMaxAgeDays}d limit)`,
        );
        await db.update(googleReviewResponseQueue).set({
          status: "cancelled",
          failureReason: `Review is ${Math.floor(ageDays)} days old — older than the ${dispatchMaxAgeDays}-day auto-reply window`,
          updatedAt: new Date(),
        }).where(eq(googleReviewResponseQueue.id, item.id));
        return;
      }
    }
  }

  // Skip if already responded on Google
  if (review.responseStatus === "responded") {
    await db.update(googleReviewResponseQueue).set({
      status: "published",
      publishedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(googleReviewResponseQueue.id, item.id));
    console.log(`[ReviewEngine] queueId=${item.id} — already responded on Google, marking published`);
    return;
  }

  // Build the OAuth client for this store
  const oauthClient = await buildOAuthClientForStore(item.storeId);
  if (!oauthClient) {
    await markFailed(item.id, "No connected Google account found for this store");
    return;
  }

  // Build the reply URL for mybusinessreviews.googleapis.com/v1/
  // Required format: accounts/{accountId}/locations/{locationId}/reviews/{reviewId}/reply
  //
  // The FULL resource name (including "accounts/{id}/" prefix) is required by the API.
  // Stripping the accounts prefix produces a URL that Google cannot route and returns
  // an HTML 404 page (not a JSON API error).
  //
  // Resolution order (most → least reliable):
  //  1. googleReviewResourceName stored on the review — already the full correct path from Google
  //  2. Join gbLocationId → googleBusinessLocations → googleBusinessAccounts to reconstruct
  //  3. Fallback: store's selected location lookup (covers reviews with no gbLocationId)
  let reviewResourceName: string | null = null;

  if (review.googleReviewResourceName) {
    // Best path: the full resource name was captured at sync time — use it directly.
    reviewResourceName = review.googleReviewResourceName;
    console.log(`[ReviewEngine] queueId=${item.id} — using stored googleReviewResourceName`);
  } else {
    // Need to reconstruct from parts
    let locationId = review.googleLocationId;
    let accountResourceName: string | null = null;

    if (review.gbLocationId) {
      const locRows = await db
        .select({
          locationId: googleBusinessLocations.locationId,
          googleAccountId: googleBusinessAccounts.googleAccountId,
        })
        .from(googleBusinessLocations)
        .leftJoin(
          googleBusinessAccounts,
          eq(googleBusinessLocations.businessAccountId, googleBusinessAccounts.id),
        )
        .where(eq(googleBusinessLocations.id, review.gbLocationId))
        .limit(1);
      if (locRows[0]) {
        locationId = locRows[0].locationId;
        accountResourceName = locRows[0].googleAccountId ?? null;
      }
    }

    // Fallback: look up the store's selected location when gbLocationId is missing/unresolved
    if (!accountResourceName) {
      const fallbackRows = await db
        .select({
          locationId: googleBusinessLocations.locationId,
          googleAccountId: googleBusinessAccounts.googleAccountId,
        })
        .from(googleBusinessLocations)
        .leftJoin(
          googleBusinessAccounts,
          eq(googleBusinessLocations.businessAccountId, googleBusinessAccounts.id),
        )
        .where(
          and(
            eq(googleBusinessLocations.storeId, item.storeId),
            eq(googleBusinessLocations.isSelected, true),
          ),
        )
        .limit(1);
      if (fallbackRows[0]) {
        if (!locationId) locationId = fallbackRows[0].locationId;
        accountResourceName = fallbackRows[0].googleAccountId ?? null;
        console.log(`[ReviewEngine] queueId=${item.id} — used fallback account lookup`);
      }
    }

    if (!locationId) {
      await markFailed(item.id, "Could not resolve GBP location ID for this review");
      return;
    }
    if (!accountResourceName) {
      await markFailed(item.id, "Could not resolve Google account resource name — please reconnect Google Business Profile");
      return;
    }

    reviewResourceName = `${accountResourceName}/locations/${locationId}/reviews/${review.googleReviewId}`;
  }

  // Use the full resource name as-is. mybusinessreviews.googleapis.com/v1 requires
  // the complete path: accounts/{accountId}/locations/{locationId}/reviews/{reviewId}.
  // DO NOT strip the "accounts/{id}/" prefix — without it the URL matches no API route
  // and Google returns an HTML 404 page instead of a JSON error.
  const replyUrl = `https://mybusinessreviews.googleapis.com/v1/${reviewResourceName}/reply`;
  console.log(`[ReviewEngine] queueId=${item.id} — reply URL: ${replyUrl}`);

  // Update attempt count
  await db.update(googleReviewResponseQueue).set({
    attempts: item.attempts + 1,
    updatedAt: new Date(),
  }).where(eq(googleReviewResponseQueue.id, item.id));

  try {
    const tokenResp = await oauthClient.getAccessToken();
    const accessToken = tokenResp.token;
    if (!accessToken) throw new Error("Could not obtain Google access token");

    const res = await fetch(replyUrl, {
      method:  "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ comment: item.generatedResponseText }),
    });

    // Handle HTTP 404 — the review no longer exists on Google (deleted by reviewer or removed
    // by Google).  Mark as not_found (permanent terminal state) so the dispatcher never retries
    // it and processNewReviewsForStore never re-queues it.
    // NOTE: URL-construction bugs that used to cause spurious 404s are fixed — the resource
    // name is now taken directly from googleReviewResourceName stored at sync time, so a 404
    // here genuinely means the review is gone.
    if (res.status === 404) {
      const body404 = await res.text();
      console.warn(`[ReviewEngine] queueId=${item.id} — HTTP 404 from Google (review deleted/not found), marking not_found: ${body404.slice(0, 120)}`);
      await markNotFound(item.id, `HTTP 404 from Google — review no longer exists: ${body404.slice(0, 200)}`);
      return;
    }

    // L-5 FIX: Handle HTTP 429 Retry-After header instead of falling through to generic retry.
    if (res.status === 429) {
      const retryAfterHeader = res.headers.get("Retry-After");
      const retryAfterSecs   = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 0;
      const delayMinutes     = retryAfterSecs > 0 ? Math.ceil(retryAfterSecs / 60) + 2 : 60;
      const retryAt          = new Date(Date.now() + delayMinutes * 60 * 1000);
      await db.update(googleReviewResponseQueue).set({
        scheduledFor:  retryAt,
        failureReason: `HTTP 429: GBP rate limited — retry in ${delayMinutes}m`,
        updatedAt:     new Date(),
      }).where(eq(googleReviewResponseQueue.id, item.id));
      console.warn(`[ReviewEngine] queueId=${item.id} — HTTP 429 rate limited, rescheduled ${delayMinutes}m from now`);
      return;
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    // ── Success ──────────────────────────────────────────────────────────────
    console.log(`[ReviewEngine] ✓ Published reply for queueId=${item.id} reviewId=${item.googleReviewId}`);
    const generatedResponseText = item.generatedResponseText;
    if (!generatedResponseText) {
      throw new Error("No response text generated");
    }

    // RISK-1 FIX: Wrap the three post-publish DB writes in a transaction so they're
    // atomic. If any step fails, the queue item stays in 'scheduled' and the dispatcher
    // re-evaluates on the next tick (the already-responded guard at the top of this
    // function will catch it and mark it published cleanly).
    await db.transaction(async (tx) => {
      const [responseRow] = await tx.insert(googleReviewResponses).values({
        storeId:        item.storeId,
        googleReviewId: item.googleReviewId,
         responseText:   generatedResponseText,
        responseStatus: "published",
      }).returning();

      await tx.update(googleReviewResponseQueue).set({
        status:                 "published",
        publishedAt:            new Date(),
        googleReviewResponseId: responseRow?.id ?? undefined,
        updatedAt:              new Date(),
      }).where(eq(googleReviewResponseQueue.id, item.id));

      await tx.update(googleReviews).set({
        responseStatus: "responded",
        updatedAt:      new Date(),
      }).where(eq(googleReviews.id, item.googleReviewId));
    });

  } catch (err: any) {
    const errMsg = err?.message ?? String(err);
    console.error(`[ReviewEngine] Publish failed for queueId=${item.id}:`, errMsg);

    if (item.attempts + 1 >= MAX_PUBLISH_ATTEMPTS) {
      await markFailed(item.id, errMsg);
    } else {
      // Retry with backoff
      const backoffMinutes = RETRY_BACKOFF_MINUTES[item.attempts] ?? 60;
      const retryAt = new Date(Date.now() + backoffMinutes * 60 * 1000);
      await db.update(googleReviewResponseQueue).set({
        scheduledFor:  retryAt,
        failureReason: errMsg,
        updatedAt:     new Date(),
      }).where(eq(googleReviewResponseQueue.id, item.id));
    }
  }
}

async function markFailed(queueId: number, reason: string) {
  await db.update(googleReviewResponseQueue).set({
    status:        "failed",
    failureReason: reason,
    updatedAt:     new Date(),
  }).where(eq(googleReviewResponseQueue.id, queueId));
  console.error(`[ReviewEngine] queueId=${queueId} marked FAILED: ${reason}`);
}

/**
 * Marks a queue item as 'not_found' — a permanent terminal state distinct from 'failed'.
 * Used exclusively for HTTP 404 responses from Google, meaning the review was deleted
 * by the reviewer or removed by Google and can never be replied to.
 *
 * Unlike 'failed' (which allows re-queue on next sync for transient errors), 'not_found'
 * is included in the exclusion set in processNewReviewsForStore so this review is never
 * re-queued. The source google_reviews row is also marked "responded" as a belt-and-suspenders
 * guard (the exclusion-set check gates on queue status; this gates on the review itself).
 */
async function markNotFound(queueId: number, reason: string): Promise<void> {
  // Look up the googleReviewId so we can update the source review table too.
  const queueRows = await db
    .select({ googleReviewId: googleReviewResponseQueue.googleReviewId })
    .from(googleReviewResponseQueue)
    .where(eq(googleReviewResponseQueue.id, queueId))
    .limit(1);

  // Use 'not_found' — a distinct terminal status that is never retried.
  await db.update(googleReviewResponseQueue).set({
    status:        "not_found",
    failureReason: reason,
    updatedAt:     new Date(),
  }).where(eq(googleReviewResponseQueue.id, queueId));

  // Belt-and-suspenders: also mark the source review "responded" so processNewReviewsForStore
  // never creates a new queue entry for it even if the not_found exclusion were somehow missed.
  if (queueRows[0]?.googleReviewId) {
    await db.update(googleReviews).set({
      responseStatus: "responded",
      updatedAt:      new Date(),
    }).where(eq(googleReviews.id, queueRows[0].googleReviewId));
  }

  console.warn(
    `[ReviewEngine] queueId=${queueId} — review no longer exists on Google (status → not_found): ${reason}` +
    (queueRows[0]?.googleReviewId ? ` | google_reviews id=${queueRows[0].googleReviewId} marked "responded"` : ""),
  );
}

// ─── OAuth Client Helper ──────────────────────────────────────────────────────

/**
 * Builds an OAuth2Client for the store's connected Google account and registers
 * a 'tokens' listener that persists refreshed access tokens back to the DB.
 *
 * BUG-2 FIX: The original buildOAuth2Client() had no 'tokens' listener, so
 * refreshed access tokens were never written back to the DB. This caused
 * accumulating orphaned sessions and eventual refresh token invalidation by Google.
 * The fix mirrors the pattern already used in google-review-sync.ts.
 */
async function buildOAuthClientForStore(storeId: number): Promise<OAuth2Client | null> {
  const oauthParams = [
    process.env.GOOGLE_BUSINESS_CLIENT_ID     ?? process.env.GOOGLE_CLIENT_ID     ?? "",
    process.env.GOOGLE_BUSINESS_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "",
    process.env.GOOGLE_BUSINESS_CALLBACK_URL  ?? `${process.env.APP_URL ?? "https://certxa.com"}/api/google-business/callback`,
  ] as const;

  // ── New schema: google_business_accounts ──────────────────────────────────
  const selectedLocs = await db
    .select({ businessAccountId: googleBusinessLocations.businessAccountId })
    .from(googleBusinessLocations)
    .where(and(
      eq(googleBusinessLocations.storeId, storeId),
      eq(googleBusinessLocations.isSelected, true),
    ))
    .limit(1);

  if (selectedLocs.length) {
    const accountRows = await db
      .select()
      .from(googleBusinessAccounts)
      .where(eq(googleBusinessAccounts.id, selectedLocs[0].businessAccountId))
      .limit(1);

    const account = accountRows[0];
    if (account && (account.accessToken || account.refreshToken)) {
      const client = new OAuth2Client(...oauthParams);
      client.setCredentials({
        access_token:  decryptToken(account.accessToken),
        refresh_token: decryptToken(account.refreshToken),
        expiry_date:   account.tokenExpiry?.getTime() ?? undefined,
      });
      // Persist refreshed tokens back to DB (BUG-2 FIX)
      client.on("tokens", (tokens) => {
        console.log(`[ReviewEngine] OAuth token auto-refreshed for account id=${account.id}`);
        db.update(googleBusinessAccounts)
          .set({
            accessToken: encryptToken(tokens.access_token) ?? undefined,
            tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
            updatedAt:   new Date(),
          })
          .where(eq(googleBusinessAccounts.id, account.id))
          .catch((e) => console.warn("[ReviewEngine] Failed to persist refreshed token:", e));
      });
      return client;
    }
  }

  // ── Fallback: legacy google_business_profiles ─────────────────────────────
  const profileRows = await db
    .select()
    .from(googleBusinessProfiles)
    .where(and(
      eq(googleBusinessProfiles.storeId, storeId),
      eq(googleBusinessProfiles.isConnected, true),
    ))
    .limit(1);

  const profile = profileRows[0];
  if (profile && (profile.accessToken || profile.refreshToken)) {
    const client = new OAuth2Client(...oauthParams);
    client.setCredentials({
      access_token:  decryptToken(profile.accessToken),
      refresh_token: decryptToken(profile.refreshToken),
      expiry_date:   profile.tokenExpiresAt?.getTime() ?? undefined,
    });
    // Persist refreshed tokens back to DB (BUG-2 FIX)
    client.on("tokens", (tokens) => {
      console.log(`[ReviewEngine] OAuth token auto-refreshed for profile id=${profile.id}`);
      db.update(googleBusinessProfiles)
        .set({
          accessToken:    encryptToken(tokens.access_token) ?? undefined,
          tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
          updatedAt:      new Date(),
        })
        .where(eq(googleBusinessProfiles.id, profile.id))
        .catch((e) => console.warn("[ReviewEngine] Failed to persist refreshed token (profile):", e));
    });
    return client;
  }

  return null;
}

// ─── Scheduler Starter ────────────────────────────────────────────────────────

export function startReviewEngineDispatcher(): void {
  const INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
  const INITIAL_DELAY_MS = 90 * 1000; // 90 seconds after boot

  setTimeout(async () => {
    console.log("[ReviewEngine] Dispatcher — initial run");
    await runResponseDispatcher().catch((e) =>
      console.error("[ReviewEngine] Dispatcher error:", e),
    );
    setInterval(async () => {
      await runResponseDispatcher().catch((e) =>
        console.error("[ReviewEngine] Dispatcher error:", e),
      );
    }, INTERVAL_MS);
  }, INITIAL_DELAY_MS);

  console.log("[ReviewEngine] Response dispatcher started (5-minute interval)");
}
