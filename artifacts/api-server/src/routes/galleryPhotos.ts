/**
 * Gallery Photos API
 *
 * Lets salon owners upload photos that are simultaneously:
 *   1. Stored in wb_gallery_photos and displayed in the website gallery section
 *   2. Queued for upload to Google Business Profile via the photo engine
 *
 * GET    /api/google-business/gallery-photos/:storeId   — list photos
 * POST   /api/google-business/gallery-photos/:storeId/upload — upload a new photo
 * PATCH  /api/google-business/gallery-photos/:id        — update caption / show_on_website / sort_order
 * DELETE /api/google-business/gallery-photos/:id        — delete photo
 */

import { Router } from "express";
import { db } from "../db";
import { users, wbGalleryPhotos } from "@shared/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { storage } from "../storage";
import { memoryUpload, uploadToR2, extractR2KeyFromUrl } from "../lib/r2";
import { detectAndEnqueuePhoto } from "../services/gbpPhotoEngine";
import multer from "multer";

const router = Router();

// ── Auth helper ───────────────────────────────────────────────────────────────

/** Returns true if the session belongs to a platform admin. */
async function isAdmin(req: any): Promise<boolean> {
  const userId = req.session?.userId;
  if (!userId) return false;
  try {
    const rows = await db.execute(
      sql`SELECT is_admin FROM users WHERE id::text = ${String(userId)} LIMIT 1`
    );
    return !!(rows.rows[0] as any)?.is_admin;
  } catch {
    return false;
  }
}

async function assertStoreOwner(req: any, res: any, storeId: number): Promise<boolean> {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }
  // Platform admins can manage any store's gallery
  if (await isAdmin(req)) return true;

  const store = await storage.getStore(storeId);
  if (!store || store.userId !== userId) {
    res.status(403).json({ message: "Forbidden" });
    return false;
  }
  return true;
}

async function assertPhotoOwner(req: any, res: any, photoId: number): Promise<{ photo: any; storeId: number } | null> {
  const rows = await db
    .select()
    .from(wbGalleryPhotos)
    .where(eq(wbGalleryPhotos.id, photoId))
    .limit(1);

  if (!rows.length) {
    res.status(404).json({ message: "Photo not found" });
    return null;
  }
  const photo = rows[0];
  if (!(await assertStoreOwner(req, res, photo.storeId))) return null;
  return { photo, storeId: photo.storeId };
}

// ── GET list ─────────────────────────────────────────────────────────────────

router.get("/:storeId", async (req, res) => {
  const storeId = Number(req.params.storeId);
  if (!(await assertStoreOwner(req, res, storeId))) return;

  try {
    const photos = await db
      .select()
      .from(wbGalleryPhotos)
      .where(eq(wbGalleryPhotos.storeId, storeId))
      .orderBy(wbGalleryPhotos.sortOrder, wbGalleryPhotos.createdAt);

    return res.json(photos);
  } catch (err: any) {
    console.error("[Gallery Photos] GET list error:", err);
    return res.status(500).json({ message: "Failed to load gallery photos" });
  }
});

// ── POST upload ───────────────────────────────────────────────────────────────

const upload = memoryUpload({ maxSizeMb: 20 });

router.post("/:storeId/upload", (req, res, next) => {
  upload.single("photo")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: `Upload error: ${err.message}` });
    }
    if (err) return res.status(500).json({ message: "Upload failed" });
    next();
  });
}, async (req: any, res) => {
  const storeId = Number(req.params.storeId);
  if (!(await assertStoreOwner(req, res, storeId))) return;

  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  const caption: string | undefined = req.body.caption?.trim() || undefined;

  try {
    // Upload to R2 (auto-converted to WebP)
    const imageUrl = await uploadToR2(
      req.file.buffer,
      "gallery",
      req.file.originalname,
      req.file.mimetype,
    );
    const r2Key = extractR2KeyFromUrl(imageUrl) ?? undefined;

    // Insert into wb_gallery_photos
    const rows = await db
      .insert(wbGalleryPhotos)
      .values({
        storeId,
        imageUrl,
        imageR2Key: r2Key ?? null,
        caption:    caption ?? null,
        showOnWebsite: true,
        sortOrder:  0,
      })
      .returning();

    const photo = rows[0];

    // Queue for GBP upload (fire-and-forget — never throws)
    detectAndEnqueuePhoto(storeId, "gallery_photo", {
      imageUrl,
      r2Key,
      entityName: caption,
    })
      .then(async (queueId) => {
        if (queueId) {
          await db
            .update(wbGalleryPhotos)
            .set({ gbpQueueId: queueId, updatedAt: new Date() })
            .where(eq(wbGalleryPhotos.id, photo.id));
        }
      })
      .catch((e) => console.warn("[Gallery Photos] GBP enqueue error:", e));

    return res.json(photo);
  } catch (err: any) {
    console.error("[Gallery Photos] upload error:", err);
    return res.status(500).json({ message: err?.message ?? "Upload failed" });
  }
});

// ── PATCH update ──────────────────────────────────────────────────────────────

router.patch("/:id", async (req, res) => {
  const photoId = Number(req.params.id);
  const result = await assertPhotoOwner(req, res, photoId);
  if (!result) return;

  const { caption, showOnWebsite, sortOrder } = req.body;

  try {
    const payload: Record<string, any> = { updatedAt: new Date() };
    if (caption       !== undefined) payload.caption       = String(caption).trim() || null;
    if (showOnWebsite !== undefined) payload.showOnWebsite = Boolean(showOnWebsite);
    if (sortOrder     !== undefined) payload.sortOrder     = Number(sortOrder);

    const updated = await db
      .update(wbGalleryPhotos)
      .set(payload)
      .where(eq(wbGalleryPhotos.id, photoId))
      .returning();

    return res.json(updated[0]);
  } catch (err: any) {
    console.error("[Gallery Photos] PATCH error:", err);
    return res.status(500).json({ message: "Failed to update photo" });
  }
});

// ── DELETE ────────────────────────────────────────────────────────────────────

router.delete("/:id", async (req, res) => {
  const photoId = Number(req.params.id);
  const result = await assertPhotoOwner(req, res, photoId);
  if (!result) return;

  try {
    await db.delete(wbGalleryPhotos).where(eq(wbGalleryPhotos.id, photoId));
    return res.json({ success: true });
  } catch (err: any) {
    console.error("[Gallery Photos] DELETE error:", err);
    return res.status(500).json({ message: "Failed to delete photo" });
  }
});

export default router;
