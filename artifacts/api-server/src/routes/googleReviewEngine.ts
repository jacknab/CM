/**
 * Google Review Management Engine — API Routes (Phase 2)
 *
 * All routes are owner-authenticated and store-scoped.
 *
 * GET  /api/google-business/review-engine/settings/:storeId
 * PUT  /api/google-business/review-engine/settings/:storeId
 * GET  /api/google-business/review-engine/queue/:storeId
 * POST /api/google-business/review-engine/queue/:queueId/approve
 * POST /api/google-business/review-engine/queue/:queueId/cancel
 * PATCH /api/google-business/review-engine/queue/:queueId/response
 * POST /api/google-business/review-engine/queue/:queueId/reschedule
 * GET  /api/google-business/review-engine/stats/:storeId
 */

import { Router } from "express";
import { db } from "../db";
import {
  googleReviewEngineSettings,
  googleReviewResponseQueue,
  googleReviews,
  googleReviewResponses,
  locations,
  googleBusinessAccounts,
  googleBusinessLocations,
} from "@shared/schema";
import { eq, and, desc, count, inArray, not, sql } from "drizzle-orm";
import { storage } from "../storage";
import { processNewReviewsForStore } from "../services/google-review-engine";

const router = Router();

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function assertStoreOwner(
  req: any,
  res: any,
  storeId: number,
): Promise<boolean> {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }
  const store = await storage.getStore(storeId);
  if (!store || store.userId !== userId) {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}

// ── GET settings ──────────────────────────────────────────────────────────────

router.get("/settings/:storeId", async (req, res) => {
  const storeId = Number(req.params.storeId);
  if (!(await assertStoreOwner(req, res, storeId))) return;

  try {
    const existing = await db
      .select()
      .from(googleReviewEngineSettings)
      .where(eq(googleReviewEngineSettings.storeId, storeId))
      .limit(1);

    if (existing.length) return res.json(existing[0]);

    // Return defaults without persisting (created lazily on first processNewReviews call)
    return res.json({
      storeId,
      autoRespondEnabled:      true,
      minResponseDelayMinutes: 60,
      autoRespond5Star:        true,
      autoRespond4Star:        true,
      requireApproval3Star:    true,
      notifyOwner12Star:       true,
      maxReviewAgeDays:        30,
    });
  } catch (err: any) {
    console.error("[ReviewEngine] GET settings error:", err);
    return res.status(500).json({ message: "Failed to load settings" });
  }
});

// ── PUT settings ──────────────────────────────────────────────────────────────

router.put("/settings/:storeId", async (req, res) => {
  const storeId = Number(req.params.storeId);
  if (!(await assertStoreOwner(req, res, storeId))) return;

  const {
    autoRespondEnabled,
    minResponseDelayMinutes,
    autoRespond5Star,
    autoRespond4Star,
    requireApproval3Star,
    notifyOwner12Star,
    maxReviewAgeDays,
  } = req.body;

  try {
    const existing = await db
      .select({ id: googleReviewEngineSettings.id })
      .from(googleReviewEngineSettings)
      .where(eq(googleReviewEngineSettings.storeId, storeId))
      .limit(1);

    const payload: Record<string, any> = { updatedAt: new Date() };
    if (autoRespondEnabled      !== undefined) payload.autoRespondEnabled      = Boolean(autoRespondEnabled);
    if (minResponseDelayMinutes !== undefined) payload.minResponseDelayMinutes = Math.max(0, Number(minResponseDelayMinutes));
    if (autoRespond5Star        !== undefined) payload.autoRespond5Star        = Boolean(autoRespond5Star);
    if (autoRespond4Star        !== undefined) payload.autoRespond4Star        = Boolean(autoRespond4Star);
    if (requireApproval3Star    !== undefined) payload.requireApproval3Star    = Boolean(requireApproval3Star);
    if (notifyOwner12Star       !== undefined) payload.notifyOwner12Star       = Boolean(notifyOwner12Star);
    if (maxReviewAgeDays        !== undefined) payload.maxReviewAgeDays        = Math.max(0, Number(maxReviewAgeDays));

    let row;
    if (existing.length) {
      const rows = await db
        .update(googleReviewEngineSettings)
        .set(payload)
        .where(eq(googleReviewEngineSettings.storeId, storeId))
        .returning();
      row = rows[0];
    } else {
      const rows = await db
        .insert(googleReviewEngineSettings)
        .values({ storeId, ...payload })
        .returning();
      row = rows[0];
    }

    return res.json(row);
  } catch (err: any) {
    console.error("[ReviewEngine] PUT settings error:", err);
    return res.status(500).json({ message: "Failed to save settings" });
  }
});

// ── GET queue ─────────────────────────────────────────────────────────────────

router.get("/queue/:storeId", async (req, res) => {
  const storeId = Number(req.params.storeId);
  if (!(await assertStoreOwner(req, res, storeId))) return;

  const statusFilter = req.query.status as string | undefined;
  const limit  = Math.min(Number(req.query.limit  ?? 50), 100);
  const offset = Number(req.query.offset ?? 0);

  try {
    const conditions = [eq(googleReviewResponseQueue.storeId, storeId)];
    if (statusFilter) {
      const statuses = statusFilter.split(",").map((s) => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        conditions.push(eq(googleReviewResponseQueue.status, statuses[0]));
      } else if (statuses.length > 1) {
        conditions.push(inArray(googleReviewResponseQueue.status, statuses));
      }
    }

    const rows = await db
      .select({
        queue:   googleReviewResponseQueue,
        review:  googleReviews,
      })
      .from(googleReviewResponseQueue)
      .leftJoin(googleReviews, eq(googleReviewResponseQueue.googleReviewId, googleReviews.id))
      .where(and(...conditions))
      .orderBy(desc(googleReviewResponseQueue.createdAt))
      .limit(limit)
      .offset(offset);

    return res.json(rows);
  } catch (err: any) {
    console.error("[ReviewEngine] GET queue error:", err);
    return res.status(500).json({ message: "Failed to load queue" });
  }
});

// ── POST approve (3-star awaiting approval) ───────────────────────────────────

router.post("/queue/:queueId/approve", async (req, res) => {
  const queueId = Number(req.params.queueId);

  try {
    const rows = await db
      .select()
      .from(googleReviewResponseQueue)
      .where(eq(googleReviewResponseQueue.id, queueId))
      .limit(1);

    if (!rows.length) return res.status(404).json({ message: "Queue item not found" });
    const item = rows[0];

    if (!(await assertStoreOwner(req, res, item.storeId))) return;
    if (item.status !== "awaiting_approval") {
      return res.status(400).json({ message: `Cannot approve item with status '${item.status}'` });
    }

    // BUG-5 FIX: Require non-empty response text before approving.
    // Without this check, the dispatcher picks up the approved item and immediately
    // marks it failed because there is no text to publish.
    if (!item.generatedResponseText || !item.generatedResponseText.trim()) {
      return res.status(400).json({
        message: "Cannot approve: no response text. Please edit the response before approving.",
      });
    }

    // Schedule for the next available business-hours slot.
    // Respect the original minimum delay: if eligible_after is still in the future, use that
    // as the floor so we don't publish sooner than the configured delay allows.
    const { getNextBusinessHourSlot } = await import("../services/google-review-engine");

    const baseline = item.eligibleAfter && item.eligibleAfter > new Date()
      ? item.eligibleAfter
      : new Date();

    // Find the next business-hours window starting from the baseline.
    // If no business hours are configured, fall back to 2 minutes from now.
    const nextSlot = await getNextBusinessHourSlot(item.storeId, baseline);
    const scheduledFor = nextSlot ?? new Date(Math.max(baseline.getTime(), Date.now() + 2 * 60 * 1000));

    await db
      .update(googleReviewResponseQueue)
      .set({ status: "approved", scheduledFor, updatedAt: new Date() })
      .where(eq(googleReviewResponseQueue.id, queueId));

    return res.json({ success: true, scheduledFor });
  } catch (err: any) {
    console.error("[ReviewEngine] approve error:", err);
    return res.status(500).json({ message: "Failed to approve" });
  }
});

// ── POST cancel ───────────────────────────────────────────────────────────────

router.post("/queue/:queueId/cancel", async (req, res) => {
  const queueId = Number(req.params.queueId);

  try {
    const rows = await db
      .select()
      .from(googleReviewResponseQueue)
      .where(eq(googleReviewResponseQueue.id, queueId))
      .limit(1);

    if (!rows.length) return res.status(404).json({ message: "Queue item not found" });
    const item = rows[0];

    if (!(await assertStoreOwner(req, res, item.storeId))) return;
    if (item.status === "published") {
      return res.status(400).json({ message: "Cannot cancel a published response" });
    }

    await db
      .update(googleReviewResponseQueue)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(googleReviewResponseQueue.id, queueId));

    return res.json({ success: true });
  } catch (err: any) {
    console.error("[ReviewEngine] cancel error:", err);
    return res.status(500).json({ message: "Failed to cancel" });
  }
});

// ── PATCH response text ───────────────────────────────────────────────────────

router.patch("/queue/:queueId/response", async (req, res) => {
  const queueId = Number(req.params.queueId);
  const { responseText } = req.body;

  if (!responseText || typeof responseText !== "string" || !responseText.trim()) {
    return res.status(400).json({ message: "responseText is required" });
  }

  try {
    const rows = await db
      .select()
      .from(googleReviewResponseQueue)
      .where(eq(googleReviewResponseQueue.id, queueId))
      .limit(1);

    if (!rows.length) return res.status(404).json({ message: "Queue item not found" });
    const item = rows[0];

    if (!(await assertStoreOwner(req, res, item.storeId))) return;
    if (item.status === "published" || item.status === "cancelled") {
      return res.status(400).json({ message: `Cannot edit a ${item.status} response` });
    }

    await db
      .update(googleReviewResponseQueue)
      .set({ generatedResponseText: responseText.trim(), updatedAt: new Date() })
      .where(eq(googleReviewResponseQueue.id, queueId));

    return res.json({ success: true });
  } catch (err: any) {
    console.error("[ReviewEngine] patch response error:", err);
    return res.status(500).json({ message: "Failed to update response text" });
  }
});

// ── POST reschedule ───────────────────────────────────────────────────────────

router.post("/queue/:queueId/reschedule", async (req, res) => {
  const queueId = Number(req.params.queueId);
  const { scheduledFor } = req.body;

  if (!scheduledFor) {
    return res.status(400).json({ message: "scheduledFor is required" });
  }

  const scheduledDate = new Date(scheduledFor);
  if (isNaN(scheduledDate.getTime())) {
    return res.status(400).json({ message: "Invalid scheduledFor date" });
  }

  try {
    const rows = await db
      .select()
      .from(googleReviewResponseQueue)
      .leftJoin(googleReviewEngineSettings, eq(googleReviewEngineSettings.storeId, googleReviewResponseQueue.storeId))
      .where(eq(googleReviewResponseQueue.id, queueId))
      .limit(1);

    if (!rows.length) return res.status(404).json({ message: "Queue item not found" });
    const item    = rows[0].google_review_response_queue;
    const settings = rows[0].google_review_engine_settings;

    if (!(await assertStoreOwner(req, res, item.storeId))) return;
    if (item.status === "published" || item.status === "cancelled") {
      return res.status(400).json({ message: `Cannot reschedule a ${item.status} response` });
    }

    // RISK-5 FIX: Validate the requested time against the minimum delay constraint.
    // A past date or a date before eligibleAfter would cause the dispatcher to fire
    // immediately, bypassing the configured minimum delay.
    const now         = Date.now();
    const minDelayMs  = (settings?.minResponseDelayMinutes ?? 0) * 60 * 1000;
    const floor       = item.eligibleAfter
      ? Math.max(item.eligibleAfter.getTime(), now)
      : now + minDelayMs;

    if (scheduledDate.getTime() < floor) {
      const floorDate = new Date(floor);
      return res.status(400).json({
        message: `scheduledFor must be at or after ${floorDate.toISOString()} (minimum delay constraint).`,
        earliestAllowed: floorDate.toISOString(),
      });
    }

    await db
      .update(googleReviewResponseQueue)
      .set({ scheduledFor: scheduledDate, updatedAt: new Date() })
      .where(eq(googleReviewResponseQueue.id, queueId));

    return res.json({ success: true, scheduledFor: scheduledDate });
  } catch (err: any) {
    console.error("[ReviewEngine] reschedule error:", err);
    return res.status(500).json({ message: "Failed to reschedule" });
  }
});

// ── GET stats ─────────────────────────────────────────────────────────────────

router.get("/stats/:storeId", async (req, res) => {
  const storeId = Number(req.params.storeId);
  if (!(await assertStoreOwner(req, res, storeId))) return;

  try {
    // RISK-2 FIX: Use SQL GROUP BY aggregation instead of loading all rows into
    // Node memory and filtering in JS. For high-volume stores this could be thousands
    // of rows; a single SQL aggregate is O(1) network + O(n) DB scan vs O(n) network.
    const [statusCounts, ratingCounts] = await Promise.all([
      db
        .select({
          status: googleReviewResponseQueue.status,
          cnt:    count(),
        })
        .from(googleReviewResponseQueue)
        .where(eq(googleReviewResponseQueue.storeId, storeId))
        .groupBy(googleReviewResponseQueue.status),

      db
        .select({
          rating: googleReviewResponseQueue.rating,
          cnt:    count(),
        })
        .from(googleReviewResponseQueue)
        .where(eq(googleReviewResponseQueue.storeId, storeId))
        .groupBy(googleReviewResponseQueue.rating),
    ]);

    const byStatus = Object.fromEntries(statusCounts.map((r) => [r.status, Number(r.cnt)]));
    const byRating = Object.fromEntries(ratingCounts.map((r) => [r.rating, Number(r.cnt)]));
    const total    = statusCounts.reduce((s, r) => s + Number(r.cnt), 0);

    const stats = {
      total,
      scheduled:        byStatus.scheduled        ?? 0,
      awaitingApproval: byStatus.awaiting_approval ?? 0,
      ownerNotified:    byStatus.owner_notified    ?? 0,
      approved:         byStatus.approved          ?? 0,
      published:        byStatus.published         ?? 0,
      cancelled:        byStatus.cancelled         ?? 0,
      failed:           byStatus.failed            ?? 0,
      notFound:         byStatus.not_found         ?? 0,
      byRating: {
        5: byRating[5] ?? 0,
        4: byRating[4] ?? 0,
        3: byRating[3] ?? 0,
        2: byRating[2] ?? 0,
        1: byRating[1] ?? 0,
      },
    };

    return res.json(stats);
  } catch (err: any) {
    console.error("[ReviewEngine] GET stats error:", err);
    return res.status(500).json({ message: "Failed to load stats" });
  }
});

// ── POST retry (re-queue a failed item) ───────────────────────────────────────

/**
 * Resets a failed queue item back to 'scheduled' status so the dispatcher
 * will attempt publication again.
 *
 * Missing functionality FIX: previously there was no owner-facing way to
 * recover a failed item — only a manual DB update worked.
 */
router.post("/queue/:queueId/retry", async (req, res) => {
  const queueId = Number(req.params.queueId);

  try {
    const rows = await db
      .select()
      .from(googleReviewResponseQueue)
      .where(eq(googleReviewResponseQueue.id, queueId))
      .limit(1);

    if (!rows.length) return res.status(404).json({ message: "Queue item not found" });
    const item = rows[0];

    if (!(await assertStoreOwner(req, res, item.storeId))) return;

    if (item.status === "not_found") {
      return res.status(400).json({ message: "Cannot retry: the review no longer exists on Google (it was deleted by the reviewer). There is nothing to respond to." });
    }

    if (item.status !== "failed") {
      return res.status(400).json({ message: `Can only retry items with status 'failed', got '${item.status}'` });
    }

    if (!item.generatedResponseText || !item.generatedResponseText.trim()) {
      return res.status(400).json({
        message: "Cannot retry: no response text. Please edit the response first.",
      });
    }

    // Retry fires immediately — do NOT use getNextBusinessHourSlot here.
    // Business-hours gating is for new auto-scheduled replies; a manual retry
    // should run on the dispatcher's very next tick (within ~5 minutes).
    const scheduledFor = new Date();

    // Cancel any other duplicate queue entries for the same review so only
    // this one item remains active.  Duplicates accumulate when the user hits
    // retry multiple times or when the bulk-retry resets several stale rows
    // that all target the same Google review.
    await db
      .update(googleReviewResponseQueue)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(googleReviewResponseQueue.googleReviewId, item.googleReviewId),
          eq(googleReviewResponseQueue.storeId, item.storeId),
          inArray(googleReviewResponseQueue.status, ["failed", "scheduled"]),
          // leave the row we are about to re-queue alone for now
          not(eq(googleReviewResponseQueue.id, queueId)),
        )
      );

    await db
      .update(googleReviewResponseQueue)
      .set({
        status:        "scheduled",
        scheduledFor,
        attempts:      0,
        failureReason: null,
        updatedAt:     new Date(),
      })
      .where(eq(googleReviewResponseQueue.id, queueId));

    return res.json({ success: true, scheduledFor });
  } catch (err: any) {
    console.error("[ReviewEngine] retry error:", err);
    return res.status(500).json({ message: "Failed to retry" });
  }
});

// ── POST manual trigger (process new reviews now) ─────────────────────────────

router.post("/trigger/:storeId", async (req, res) => {
  const storeId = Number(req.params.storeId);
  if (!(await assertStoreOwner(req, res, storeId))) return;

  try {
    await processNewReviewsForStore(storeId);
    return res.json({ success: true });
  } catch (err: any) {
    console.error("[ReviewEngine] manual trigger error:", err);
    return res.status(500).json({ message: err?.message ?? "Failed to process reviews" });
  }
});

/**
 * POST /api/google-business/review-engine/match-services/:storeId
 *
 * Manually trigger the AI service-review matching job for a store.
 * Reads up to 8 months of Google reviews and uses OpenAI to match each
 * review to the service it's most likely about, then persists to
 * service_review_matches so website template service cards can display them.
 */
router.post("/match-services/:storeId", async (req, res) => {
  const storeId = Number(req.params.storeId);
  if (!(await assertStoreOwner(req, res, storeId))) return;

  try {
    const { matchServiceReviewsForStore } = await import("../lib/serviceReviewMatcher");
    const result = await matchServiceReviewsForStore(storeId);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[ReviewEngine] match-services error:", err);
    return res.status(500).json({ message: err?.message ?? "Failed to match service reviews" });
  }
});

export default router;
