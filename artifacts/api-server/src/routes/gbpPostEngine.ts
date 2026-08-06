/**
 * GBP Post Automation Engine — API Routes (Phase 3.1)
 *
 * All routes are owner-authenticated and store-scoped.
 *
 * GET  /api/google-business/post-engine/settings/:storeId
 * PUT  /api/google-business/post-engine/settings/:storeId
 * GET  /api/google-business/post-engine/queue/:storeId
 * POST /api/google-business/post-engine/queue/:id/approve
 * POST /api/google-business/post-engine/queue/:id/cancel
 * PATCH /api/google-business/post-engine/queue/:id/content
 * POST /api/google-business/post-engine/queue/:id/reschedule
 * POST /api/google-business/post-engine/queue/:id/retry
 * GET  /api/google-business/post-engine/stats/:storeId
 * POST /api/google-business/post-engine/trigger/:storeId
 */

import { Router } from "express";
import { db } from "../db";
import {
  gbpPostQueue,
  gbpPostSettings,
  locations,
} from "@shared/schema";
import { eq, and, desc, count, inArray } from "drizzle-orm";
import { storage } from "../storage";
import {
  detectAndEnqueuePost,
  scheduleApprovedPost,
  type GBPPostEventType,
  type GBPPostEventData,
} from "../services/gbpPostEngine";

const router = Router();

// ── Auth helper ───────────────────────────────────────────────────────────────

async function assertStoreOwner(req: any, res: any, storeId: number): Promise<boolean> {
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
      .from(gbpPostSettings)
      .where(eq(gbpPostSettings.storeId, storeId))
      .limit(1);

    if (existing.length) return res.json(existing[0]);

    // Return defaults without persisting (created lazily on first event)
    return res.json({
      storeId,
      autoPostEnabled:  true,
      requireApproval:  true,
      maxPostsPerWeek:  2,
      postDelayHours:   2,
    });
  } catch (err: any) {
    console.error("[GBP Posts] GET settings error:", err);
    return res.status(500).json({ message: "Failed to load settings" });
  }
});

// ── PUT settings ──────────────────────────────────────────────────────────────

router.put("/settings/:storeId", async (req, res) => {
  const storeId = Number(req.params.storeId);
  if (!(await assertStoreOwner(req, res, storeId))) return;

  const { autoPostEnabled, requireApproval, maxPostsPerWeek, postDelayHours } = req.body;

  try {
    const existing = await db
      .select({ id: gbpPostSettings.id })
      .from(gbpPostSettings)
      .where(eq(gbpPostSettings.storeId, storeId))
      .limit(1);

    const payload: Record<string, any> = { updatedAt: new Date() };
    if (autoPostEnabled  !== undefined) payload.autoPostEnabled  = Boolean(autoPostEnabled);
    if (requireApproval  !== undefined) payload.requireApproval  = Boolean(requireApproval);
    if (maxPostsPerWeek  !== undefined) payload.maxPostsPerWeek  = Math.max(1, Math.min(7, Number(maxPostsPerWeek)));
    if (postDelayHours   !== undefined) payload.postDelayHours   = Math.max(0, Number(postDelayHours));

    let row;
    if (existing.length) {
      const rows = await db
        .update(gbpPostSettings)
        .set(payload)
        .where(eq(gbpPostSettings.storeId, storeId))
        .returning();
      row = rows[0];
    } else {
      const rows = await db
        .insert(gbpPostSettings)
        .values({ storeId, ...payload })
        .returning();
      row = rows[0];
    }

    return res.json(row);
  } catch (err: any) {
    console.error("[GBP Posts] PUT settings error:", err);
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
    const conditions = [eq(gbpPostQueue.storeId, storeId)];

    if (statusFilter) {
      const statuses = statusFilter.split(",").map((s) => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        conditions.push(eq(gbpPostQueue.status, statuses[0]));
      } else if (statuses.length > 1) {
        conditions.push(inArray(gbpPostQueue.status, statuses));
      }
    }

    const rows = await db
      .select()
      .from(gbpPostQueue)
      .where(and(...conditions))
      .orderBy(desc(gbpPostQueue.createdAt))
      .limit(limit)
      .offset(offset);

    return res.json(rows);
  } catch (err: any) {
    console.error("[GBP Posts] GET queue error:", err);
    return res.status(500).json({ message: "Failed to load queue" });
  }
});

// ── POST approve ──────────────────────────────────────────────────────────────

router.post("/queue/:id/approve", async (req, res) => {
  const queueId = Number(req.params.id);

  try {
    const rows = await db
      .select()
      .from(gbpPostQueue)
      .where(eq(gbpPostQueue.id, queueId))
      .limit(1);

    if (!rows.length) return res.status(404).json({ message: "Queue item not found" });
    const item = rows[0];

    if (!(await assertStoreOwner(req, res, item.storeId))) return;
    if (item.status !== "draft") {
      return res.status(400).json({ message: `Cannot approve item with status '${item.status}'` });
    }
    if (!item.generatedSummary?.trim()) {
      return res.status(400).json({ message: "Cannot approve: no post content. Please edit the content first." });
    }

    // Load settings for postDelayHours
    const settingsRows = await db
      .select()
      .from(gbpPostSettings)
      .where(eq(gbpPostSettings.storeId, item.storeId))
      .limit(1);
    const postDelayHours = settingsRows[0]?.postDelayHours ?? 2;

    // Mark approved and find next business-hours slot
    await db
      .update(gbpPostQueue)
      .set({ status: "approved", approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(gbpPostQueue.id, queueId));

    const scheduledFor = await scheduleApprovedPost(queueId, item.storeId, postDelayHours);

    return res.json({ success: true, scheduledFor });
  } catch (err: any) {
    console.error("[GBP Posts] approve error:", err);
    return res.status(500).json({ message: "Failed to approve" });
  }
});

// ── POST cancel ───────────────────────────────────────────────────────────────

router.post("/queue/:id/cancel", async (req, res) => {
  const queueId = Number(req.params.id);

  try {
    const rows = await db
      .select()
      .from(gbpPostQueue)
      .where(eq(gbpPostQueue.id, queueId))
      .limit(1);

    if (!rows.length) return res.status(404).json({ message: "Queue item not found" });
    const item = rows[0];

    if (!(await assertStoreOwner(req, res, item.storeId))) return;
    if (item.status === "published") {
      return res.status(400).json({ message: "Cannot cancel a published post" });
    }

    await db
      .update(gbpPostQueue)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(gbpPostQueue.id, queueId));

    return res.json({ success: true });
  } catch (err: any) {
    console.error("[GBP Posts] cancel error:", err);
    return res.status(500).json({ message: "Failed to cancel" });
  }
});

// ── PATCH content ─────────────────────────────────────────────────────────────

router.patch("/queue/:id/content", async (req, res) => {
  const queueId = Number(req.params.id);
  const { summary } = req.body;

  if (!summary || typeof summary !== "string" || !summary.trim()) {
    return res.status(400).json({ message: "summary is required" });
  }
  if (summary.trim().length > 1500) {
    return res.status(400).json({ message: "summary must be 1500 characters or fewer" });
  }

  try {
    const rows = await db
      .select()
      .from(gbpPostQueue)
      .where(eq(gbpPostQueue.id, queueId))
      .limit(1);

    if (!rows.length) return res.status(404).json({ message: "Queue item not found" });
    const item = rows[0];

    if (!(await assertStoreOwner(req, res, item.storeId))) return;
    if (item.status === "published" || item.status === "cancelled") {
      return res.status(400).json({ message: `Cannot edit a ${item.status} post` });
    }

    await db
      .update(gbpPostQueue)
      .set({ generatedSummary: summary.trim(), updatedAt: new Date() })
      .where(eq(gbpPostQueue.id, queueId));

    return res.json({ success: true });
  } catch (err: any) {
    console.error("[GBP Posts] patch content error:", err);
    return res.status(500).json({ message: "Failed to update post content" });
  }
});

// ── POST reschedule ───────────────────────────────────────────────────────────

router.post("/queue/:id/reschedule", async (req, res) => {
  const queueId = Number(req.params.id);
  const { scheduledFor } = req.body;

  if (!scheduledFor) {
    return res.status(400).json({ message: "scheduledFor is required" });
  }

  const scheduledDate = new Date(scheduledFor);
  if (isNaN(scheduledDate.getTime())) {
    return res.status(400).json({ message: "Invalid scheduledFor date" });
  }

  // Must be in the future
  if (scheduledDate.getTime() <= Date.now()) {
    return res.status(400).json({ message: "scheduledFor must be in the future" });
  }

  try {
    const rows = await db
      .select()
      .from(gbpPostQueue)
      .where(eq(gbpPostQueue.id, queueId))
      .limit(1);

    if (!rows.length) return res.status(404).json({ message: "Queue item not found" });
    const item = rows[0];

    if (!(await assertStoreOwner(req, res, item.storeId))) return;
    if (item.status === "published" || item.status === "cancelled") {
      return res.status(400).json({ message: `Cannot reschedule a ${item.status} post` });
    }
    if (item.status === "draft") {
      return res.status(400).json({ message: "Approve the post before rescheduling" });
    }

    // Validate against eligible_after floor
    if (item.eligibleAfter && scheduledDate < item.eligibleAfter) {
      return res.status(400).json({
        message: `scheduledFor must be at or after ${item.eligibleAfter.toISOString()} (minimum delay constraint)`,
        earliestAllowed: item.eligibleAfter.toISOString(),
      });
    }

    await db
      .update(gbpPostQueue)
      .set({ scheduledFor: scheduledDate, updatedAt: new Date() })
      .where(eq(gbpPostQueue.id, queueId));

    return res.json({ success: true, scheduledFor: scheduledDate });
  } catch (err: any) {
    console.error("[GBP Posts] reschedule error:", err);
    return res.status(500).json({ message: "Failed to reschedule" });
  }
});

// ── POST retry (reset a failed post) ─────────────────────────────────────────

router.post("/queue/:id/retry", async (req, res) => {
  const queueId = Number(req.params.id);

  try {
    const rows = await db
      .select()
      .from(gbpPostQueue)
      .where(eq(gbpPostQueue.id, queueId))
      .limit(1);

    if (!rows.length) return res.status(404).json({ message: "Queue item not found" });
    const item = rows[0];

    if (!(await assertStoreOwner(req, res, item.storeId))) return;
    if (item.status !== "failed") {
      return res.status(400).json({ message: `Can only retry items with status 'failed', got '${item.status}'` });
    }
    if (!item.generatedSummary?.trim()) {
      return res.status(400).json({ message: "Cannot retry: no post content. Please edit the content first." });
    }

    const scheduledFor = await scheduleApprovedPost(queueId, item.storeId, 0);

    await db
      .update(gbpPostQueue)
      .set({
        status:        "approved",
        attempts:      0,
        failureReason: null,
        scheduledFor,
        updatedAt:     new Date(),
      })
      .where(eq(gbpPostQueue.id, queueId));

    return res.json({ success: true, scheduledFor });
  } catch (err: any) {
    console.error("[GBP Posts] retry error:", err);
    return res.status(500).json({ message: "Failed to retry" });
  }
});

// ── GET stats ─────────────────────────────────────────────────────────────────

router.get("/stats/:storeId", async (req, res) => {
  const storeId = Number(req.params.storeId);
  if (!(await assertStoreOwner(req, res, storeId))) return;

  try {
    const [statusCounts, eventTypeCounts] = await Promise.all([
      db
        .select({ status: gbpPostQueue.status, cnt: count() })
        .from(gbpPostQueue)
        .where(eq(gbpPostQueue.storeId, storeId))
        .groupBy(gbpPostQueue.status),

      db
        .select({ eventType: gbpPostQueue.sourceEventType, cnt: count() })
        .from(gbpPostQueue)
        .where(eq(gbpPostQueue.storeId, storeId))
        .groupBy(gbpPostQueue.sourceEventType),
    ]);

    const byStatus    = Object.fromEntries(statusCounts.map((r) => [r.status, Number(r.cnt)]));
    const byEventType = Object.fromEntries(eventTypeCounts.map((r) => [r.eventType, Number(r.cnt)]));
    const total       = statusCounts.reduce((s, r) => s + Number(r.cnt), 0);

    return res.json({
      total,
      draft:     byStatus.draft      ?? 0,
      approved:  byStatus.approved   ?? 0,
      scheduled: byStatus.scheduled  ?? 0,
      published: byStatus.published  ?? 0,
      failed:    byStatus.failed     ?? 0,
      cancelled: byStatus.cancelled  ?? 0,
      byEventType,
    });
  } catch (err: any) {
    console.error("[GBP Posts] GET stats error:", err);
    return res.status(500).json({ message: "Failed to load stats" });
  }
});

// ── POST trigger (manual event injection) ────────────────────────────────────

router.post("/trigger/:storeId", async (req, res) => {
  const storeId = Number(req.params.storeId);
  if (!(await assertStoreOwner(req, res, storeId))) return;

  const { eventType, entityId, entityName, entityPrice, entityDuration, entityRole, announcementText } = req.body;

  const validEvents: GBPPostEventType[] = [
    "service_created", "service_updated", "staff_added",
    "gift_cards_enabled", "announcement",
  ];

  if (!eventType || !validEvents.includes(eventType)) {
    return res.status(400).json({
      message: `eventType must be one of: ${validEvents.join(", ")}`,
    });
  }

  if (!entityId) {
    return res.status(400).json({ message: "entityId is required" });
  }

  try {
    const data: GBPPostEventData = {
      entityId,
      entityName,
      entityPrice,
      entityDuration: entityDuration ? Number(entityDuration) : undefined,
      entityRole,
      announcementText,
    };

    await detectAndEnqueuePost(storeId, eventType as GBPPostEventType, data);
    return res.json({ success: true });
  } catch (err: any) {
    console.error("[GBP Posts] manual trigger error:", err);
    return res.status(500).json({ message: err?.message ?? "Failed to trigger post" });
  }
});

export default router;
