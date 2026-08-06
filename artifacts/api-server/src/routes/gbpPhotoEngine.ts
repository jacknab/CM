/**
 * GBP Photo Automation Engine — API Routes (Phase 3.2)
 *
 * All routes are owner-authenticated and store-scoped.
 *
 * GET  /api/google-business/photo-engine/settings/:storeId
 * PUT  /api/google-business/photo-engine/settings/:storeId
 * GET  /api/google-business/photo-engine/queue/:storeId
 * POST /api/google-business/photo-engine/queue/:id/cancel
 * POST /api/google-business/photo-engine/queue/:id/retry
 * GET  /api/google-business/photo-engine/stats/:storeId
 * POST /api/google-business/photo-engine/trigger/:storeId
 */

import { Router } from "express";
import { db } from "../db";
import {
  gbpPhotoQueue,
  gbpPhotoSettings,
} from "@shared/schema";
import { eq, and, desc, count, inArray, gte, sql } from "drizzle-orm";
import { storage } from "../storage";
import {
  detectAndEnqueuePhoto,
  type GBPPhotoEventType,
  type GBPPhotoEventData,
} from "../services/gbpPhotoEngine";
import { extractR2KeyFromUrl } from "../lib/r2";

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
      .from(gbpPhotoSettings)
      .where(eq(gbpPhotoSettings.storeId, storeId))
      .limit(1);

    if (existing.length) return res.json(existing[0]);

    // Return defaults without persisting (created lazily on first event)
    return res.json({
      storeId,
      enabled:           true,
      maxPhotosPerDay:   3,
      minHoursBetween:   4,
    });
  } catch (err: any) {
    console.error("[GBP Photos] GET settings error:", err);
    return res.status(500).json({ message: "Failed to load settings" });
  }
});

// ── PUT settings ──────────────────────────────────────────────────────────────

router.put("/settings/:storeId", async (req, res) => {
  const storeId = Number(req.params.storeId);
  if (!(await assertStoreOwner(req, res, storeId))) return;

  const { enabled, maxPhotosPerDay, minHoursBetween } = req.body;

  try {
    const existing = await db
      .select({ id: gbpPhotoSettings.id })
      .from(gbpPhotoSettings)
      .where(eq(gbpPhotoSettings.storeId, storeId))
      .limit(1);

    const payload: Record<string, any> = { updatedAt: new Date() };
    if (enabled           !== undefined) payload.enabled          = Boolean(enabled);
    if (maxPhotosPerDay   !== undefined) payload.maxPhotosPerDay  = Math.max(1, Math.min(10, Number(maxPhotosPerDay)));
    if (minHoursBetween   !== undefined) payload.minHoursBetween  = Math.max(0, Number(minHoursBetween));

    let row;
    if (existing.length) {
      const rows = await db
        .update(gbpPhotoSettings)
        .set(payload)
        .where(eq(gbpPhotoSettings.storeId, storeId))
        .returning();
      row = rows[0];
    } else {
      const rows = await db
        .insert(gbpPhotoSettings)
        .values({ storeId, ...payload })
        .returning();
      row = rows[0];
    }

    return res.json(row);
  } catch (err: any) {
    console.error("[GBP Photos] PUT settings error:", err);
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
    const conditions: any[] = [eq(gbpPhotoQueue.storeId, storeId)];

    if (statusFilter) {
      const statuses = statusFilter.split(",").map((s) => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        conditions.push(eq(gbpPhotoQueue.status, statuses[0]));
      } else if (statuses.length > 1) {
        conditions.push(inArray(gbpPhotoQueue.status, statuses));
      }
    }

    const rows = await db
      .select()
      .from(gbpPhotoQueue)
      .where(and(...conditions))
      .orderBy(desc(gbpPhotoQueue.createdAt))
      .limit(limit)
      .offset(offset);

    return res.json(rows);
  } catch (err: any) {
    console.error("[GBP Photos] GET queue error:", err);
    return res.status(500).json({ message: "Failed to load queue" });
  }
});

// ── POST cancel ───────────────────────────────────────────────────────────────

router.post("/queue/:id/cancel", async (req, res) => {
  const queueId = Number(req.params.id);

  try {
    const rows = await db
      .select()
      .from(gbpPhotoQueue)
      .where(eq(gbpPhotoQueue.id, queueId))
      .limit(1);

    if (!rows.length) return res.status(404).json({ message: "Queue item not found" });
    const item = rows[0];

    if (!(await assertStoreOwner(req, res, item.storeId))) return;
    if (item.status === "uploaded") {
      return res.status(400).json({ message: "Cannot cancel an already-uploaded photo" });
    }

    await db
      .update(gbpPhotoQueue)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(gbpPhotoQueue.id, queueId));

    return res.json({ success: true });
  } catch (err: any) {
    console.error("[GBP Photos] cancel error:", err);
    return res.status(500).json({ message: "Failed to cancel" });
  }
});

// ── POST retry (reset a failed item) ─────────────────────────────────────────

router.post("/queue/:id/retry", async (req, res) => {
  const queueId = Number(req.params.id);

  try {
    const rows = await db
      .select()
      .from(gbpPhotoQueue)
      .where(eq(gbpPhotoQueue.id, queueId))
      .limit(1);

    if (!rows.length) return res.status(404).json({ message: "Queue item not found" });
    const item = rows[0];

    if (!(await assertStoreOwner(req, res, item.storeId))) return;
    if (item.status !== "failed") {
      return res.status(400).json({ message: `Can only retry items with status 'failed', got '${item.status}'` });
    }

    const scheduledFor = new Date(); // retry immediately

    await db
      .update(gbpPhotoQueue)
      .set({
        status:       "pending",
        attempts:     0,
        errorMessage: null,
        scheduledFor,
        updatedAt:    new Date(),
      })
      .where(eq(gbpPhotoQueue.id, queueId));

    return res.json({ success: true, scheduledFor });
  } catch (err: any) {
    console.error("[GBP Photos] retry error:", err);
    return res.status(500).json({ message: "Failed to retry" });
  }
});

// ── GET stats ─────────────────────────────────────────────────────────────────

router.get("/stats/:storeId", async (req, res) => {
  const storeId = Number(req.params.storeId);
  if (!(await assertStoreOwner(req, res, storeId))) return;

  try {
    const oneDayAgo    = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [statusCounts, sourceTypeCounts, recentUploads] = await Promise.all([
      db
        .select({ status: gbpPhotoQueue.status, cnt: count() })
        .from(gbpPhotoQueue)
        .where(eq(gbpPhotoQueue.storeId, storeId))
        .groupBy(gbpPhotoQueue.status),

      db
        .select({ sourceType: gbpPhotoQueue.sourceType, cnt: count() })
        .from(gbpPhotoQueue)
        .where(eq(gbpPhotoQueue.storeId, storeId))
        .groupBy(gbpPhotoQueue.sourceType),

      db
        .select({ cnt: count() })
        .from(gbpPhotoQueue)
        .where(and(
          eq(gbpPhotoQueue.storeId, storeId),
          eq(gbpPhotoQueue.status, "uploaded"),
          gte(gbpPhotoQueue.updatedAt, sevenDaysAgo),
        )),
    ]);

    const byStatus     = Object.fromEntries(statusCounts.map((r) => [r.status, Number(r.cnt)]));
    const bySourceType = Object.fromEntries(sourceTypeCounts.map((r) => [r.sourceType, Number(r.cnt)]));
    const total        = statusCounts.reduce((s, r) => s + Number(r.cnt), 0);

    return res.json({
      total,
      pending:    byStatus.pending    ?? 0,
      processing: byStatus.processing ?? 0,
      uploaded:   byStatus.uploaded   ?? 0,
      failed:     byStatus.failed     ?? 0,
      cancelled:  byStatus.cancelled  ?? 0,
      uploadedLast7Days: Number(recentUploads[0]?.cnt ?? 0),
      bySourceType,
    });
  } catch (err: any) {
    console.error("[GBP Photos] GET stats error:", err);
    return res.status(500).json({ message: "Failed to load stats" });
  }
});

// ── POST trigger (manual injection) ──────────────────────────────────────────

router.post("/trigger/:storeId", async (req, res) => {
  const storeId = Number(req.params.storeId);
  if (!(await assertStoreOwner(req, res, storeId))) return;

  const { eventType, imageUrl, serviceId, staffId, entityName } = req.body;

  const validEvents: GBPPhotoEventType[] = ["service_image", "staff_avatar"];

  if (!eventType || !validEvents.includes(eventType)) {
    return res.status(400).json({
      message: `eventType must be one of: ${validEvents.join(", ")}`,
    });
  }

  if (!imageUrl || typeof imageUrl !== "string") {
    return res.status(400).json({ message: "imageUrl is required" });
  }

  try {
    const r2Key = extractR2KeyFromUrl(imageUrl) ?? undefined;
    const data: GBPPhotoEventData = {
      imageUrl,
      r2Key,
      serviceId: serviceId ? Number(serviceId) : undefined,
      staffId:   staffId   ? Number(staffId)   : undefined,
      entityName,
    };

    await detectAndEnqueuePhoto(storeId, eventType as GBPPhotoEventType, data);
    return res.json({ success: true });
  } catch (err: any) {
    console.error("[GBP Photos] manual trigger error:", err);
    return res.status(500).json({ message: err?.message ?? "Failed to trigger photo upload" });
  }
});

export default router;
