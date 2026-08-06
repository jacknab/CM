/**
 * Service Images Library routes
 *
 * GET    /api/service-images                — list (filter ?category= ?q=)
 * POST   /api/service-images                — create a new record (no image yet)
 * PATCH  /api/service-images/:id            — update name/category/subcategory/etc.
 * DELETE /api/service-images/:id            — delete record + R2 image
 * POST   /api/service-images/:id/upload     — upload or replace the image for one record
 * POST   /api/service-images/bulk-upload    — upload many files at once (assign category in body)
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { serviceImages, services } from "@shared/schema";
import { eq, asc, sql, ilike, or } from "drizzle-orm";
import { memoryUpload, uploadToR2, deleteFromR2, extractR2KeyFromUrl } from "../lib/r2";
import { resolveSessionStoreId } from "../lib/sessionStore";
import sharp from "sharp";

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function overlapCount(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const bSet = new Set(b);
  let count = 0;
  for (const token of a) if (bSet.has(token)) count++;
  return count;
}

interface MatchableServiceImage {
  id: number;
  name: string;
  category: string;
  subcategory: string | null;
  imageUrl: string | null;
  sortOrder: number | null;
}

interface MatchableService {
  id: number;
  name: string;
  category: string;
  imageUrl: string | null;
}

function scoreServiceToImage(service: MatchableService, candidate: MatchableServiceImage): number {
  const serviceName = normalizeText(service.name);
  const serviceCategory = normalizeText(service.category);
  const serviceSlug = slugify(service.name);
  const serviceTokens = tokens(service.name);

  const imageName = normalizeText(candidate.name);
  const imageCategory = normalizeText(candidate.category);
  const imageSubcategory = normalizeText(candidate.subcategory ?? "");
  const imageSlug = slugify(candidate.name);
  const imageTokens = tokens(candidate.name);

  let score = 0;

  if (serviceName && imageName && serviceName === imageName) score += 120;
  if (serviceSlug && imageSlug && serviceSlug === imageSlug) score += 100;

  if (serviceName && imageName) {
    if (serviceName.includes(imageName) || imageName.includes(serviceName)) score += 60;
    if (serviceName.startsWith(imageName) || imageName.startsWith(serviceName)) score += 20;
  }

  const overlap = overlapCount(serviceTokens, imageTokens);
  if (overlap > 0) {
    const union = new Set([...serviceTokens, ...imageTokens]).size;
    const minLen = Math.max(1, Math.min(serviceTokens.length, imageTokens.length));
    const jaccard = overlap / Math.max(1, union);
    const containment = overlap / minLen;
    score += Math.round(jaccard * 45 + containment * 35);
  }

  if (serviceCategory && imageCategory) {
    if (serviceCategory === imageCategory) score += 22;
    else if (serviceCategory.includes(imageCategory) || imageCategory.includes(serviceCategory)) score += 12;
    else {
      const catOverlap = overlapCount(tokens(serviceCategory), tokens(imageCategory));
      if (catOverlap > 0) score += 8;
    }
  }

  if (serviceName && imageSubcategory) {
    if (serviceName.includes(imageSubcategory) || imageSubcategory.includes(serviceName)) score += 10;
    else if (overlapCount(tokens(serviceName), tokens(imageSubcategory)) > 0) score += 6;
  }

  return score;
}

function pickBestServiceImage(
  service: MatchableService,
  imagePool: MatchableServiceImage[],
  minScore: number,
): { image: MatchableServiceImage; score: number; matchType: "scored" | "closest_name_fallback" | "category_fallback" } | null {
  const scored = imagePool
    .map((image) => ({ image, score: scoreServiceToImage(service, image) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aOrder = a.image.sortOrder ?? 0;
      const bOrder = b.image.sortOrder ?? 0;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.image.name.localeCompare(b.image.name);
    });

  const top = scored[0];
  if (top && top.score >= minScore) {
    return { image: top.image, score: top.score, matchType: "scored" };
  }

  // Kiosk-like fallback behavior: if we couldn't hit the confidence threshold,
  // still use the closest name match rather than skipping assignment.
  if (top && top.score > 0) {
    return { image: top.image, score: top.score, matchType: "closest_name_fallback" };
  }

  const serviceCategory = normalizeText(service.category);
  if (serviceCategory) {
    const categoryFallback = imagePool
      .filter((img) => normalizeText(img.category) === serviceCategory)
      .sort((a, b) => {
        const aOrder = a.sortOrder ?? 0;
        const bOrder = b.sortOrder ?? 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.name.localeCompare(b.name);
      })[0];

    if (categoryFallback) {
      return { image: categoryFallback, score: top?.score ?? 0, matchType: "category_fallback" };
    }
  }

  return null;
}

async function isPlatformAdmin(req: any): Promise<boolean> {
  const userId = req.session?.userId;
  if (!userId) return false;
  const rows = await db.execute(
    sql`SELECT is_admin FROM users WHERE id::text = ${String(userId)} LIMIT 1`,
  );
  return Boolean((rows.rows[0] as any)?.is_admin);
}

async function canModifyStore(req: any, storeId: number): Promise<boolean> {
  if (await isPlatformAdmin(req)) return true;
  const userId = req.session?.userId;
  if (!userId) return false;

  const rows = await db.execute(
    sql`SELECT id FROM locations WHERE id = ${storeId} AND user_id::text = ${String(userId)} LIMIT 1`,
  );
  return Boolean(rows.rows[0]);
}

const router = Router();

// ─── Smart auto-link: service records -> best matching library image ──────────
// Links services.image_url for one store by matching each service name/category
// against the admin-managed service image library.
router.post("/auto-assign", async (req: any, res) => {
  try {
    const sessionStoreId = await resolveSessionStoreId(req);
    const requestedStoreId = Number(req.body?.storeId ?? req.query?.storeId ?? sessionStoreId);
    if (!Number.isFinite(requestedStoreId) || requestedStoreId <= 0) {
      return res.status(400).json({ error: "Valid storeId is required" });
    }

    if (!(await canModifyStore(req, requestedStoreId))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const overwrite = req.body?.overwrite === true || req.query?.overwrite === "true";
    const dryRun = req.body?.dryRun === true || req.query?.dryRun === "true";
    const minScoreRaw = Number(req.body?.minScore ?? req.query?.minScore ?? 46);
    const minScore = Number.isFinite(minScoreRaw)
      ? Math.max(1, Math.min(200, Math.round(minScoreRaw)))
      : 46;

    const libraryRows = await db
      .select({
        id: serviceImages.id,
        name: serviceImages.name,
        category: serviceImages.category,
        subcategory: serviceImages.subcategory,
        imageUrl: serviceImages.imageUrl,
        sortOrder: serviceImages.sortOrder,
      })
      .from(serviceImages)
      .where(eq(serviceImages.isActive, true))
      .orderBy(asc(serviceImages.sortOrder), asc(serviceImages.name));

    const imagePool = libraryRows.filter((img) => Boolean(img.imageUrl?.trim())) as MatchableServiceImage[];
    if (!imagePool.length) {
      return res.status(400).json({ error: "No active service library images found" });
    }

    const storeServices = await db
      .select({
        id: services.id,
        name: services.name,
        category: services.category,
        imageUrl: services.imageUrl,
      })
      .from(services)
      .where(eq(services.storeId, requestedStoreId))
      .orderBy(asc(services.name));

    let updated = 0;
    let skippedExisting = 0;
    let skippedNoMatch = 0;
    let unchanged = 0;

    const assignments: Array<{
      serviceId: number;
      serviceName: string;
      previousImageUrl: string | null;
      matchedImageId: number;
      matchedImageName: string;
      matchedImageUrl: string;
      score: number;
      matchType: "scored" | "closest_name_fallback" | "category_fallback";
    }> = [];

    for (const service of storeServices as MatchableService[]) {
      if (!overwrite && service.imageUrl) {
        skippedExisting++;
        continue;
      }

      const matched = pickBestServiceImage(service, imagePool, minScore);
      if (!matched || !matched.image.imageUrl) {
        skippedNoMatch++;
        continue;
      }

      if (service.imageUrl === matched.image.imageUrl) {
        unchanged++;
        continue;
      }

      if (!dryRun) {
        await db
          .update(services)
          .set({ imageUrl: matched.image.imageUrl })
          .where(eq(services.id, service.id));
      }

      updated++;
      assignments.push({
        serviceId: service.id,
        serviceName: service.name,
        previousImageUrl: service.imageUrl,
        matchedImageId: matched.image.id,
        matchedImageName: matched.image.name,
        matchedImageUrl: matched.image.imageUrl,
        score: matched.score,
        matchType: matched.matchType,
      });
    }

    return res.json({
      storeId: requestedStoreId,
      dryRun,
      overwrite,
      minScore,
      totals: {
        services: storeServices.length,
        updated,
        skippedExisting,
        skippedNoMatch,
        unchanged,
      },
      assignments,
    });
  } catch (err: any) {
    console.error("[service-images] auto-assign error:", err?.message);
    return res.status(500).json({ error: "Auto-assign failed" });
  }
});

// ─── List ─────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { category, q } = req.query as Record<string, string>;
    let whereClause: any = undefined;

    const filters: any[] = [];
    if (category) filters.push(eq(serviceImages.category, category));
    if (q?.trim()) {
      const term = `%${q.trim()}%`;
      filters.push(
        or(
          ilike(serviceImages.name, term),
          ilike(serviceImages.category, term),
          ilike(serviceImages.subcategory, term)
        )
      );
    }

    if (filters.length === 1) whereClause = filters[0];
    else if (filters.length > 1) whereClause = sql`${sql.join(filters, sql` AND `)}`;

    const rows = await db
      .select()
      .from(serviceImages)
      .where(whereClause)
      .orderBy(
        asc(serviceImages.category),
        asc(serviceImages.sortOrder),
        asc(serviceImages.name)
      );

    return res.json({ images: rows });
  } catch (err: any) {
    console.error("[service-images] list error:", err?.message);
    return res.status(500).json({ error: "Failed to load service images" });
  }
});

// ─── Bulk upload — declared before /:id so the path isn't captured as an id ──
router.post(
  "/bulk-upload",
  memoryUpload({ maxSizeMb: 10 }).array("images", 50),
  async (req: any, res) => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files?.length) return res.status(400).json({ error: "No files uploaded" });

    const { category } = req.body as { category?: string };
    if (!category) return res.status(400).json({ error: "category is required" });

    const results: Array<{ name: string; slug: string; success: boolean; error?: string }> = [];

    for (const file of files) {
      // Derive name from filename, strip extension, humanise separators
      const baseName = file.originalname
        .replace(/\.[^.]+$/, "")
        .replace(/[-_]+/g, " ")
        .trim();
      const slug = slugify(`${baseName}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);

      try {
        const [full, thumb] = await Promise.all([
          sharp(file.buffer)
            .resize(800, 600, { fit: "cover", position: "attention" })
            .webp({ quality: 85 })
            .toBuffer(),
          sharp(file.buffer)
            .resize(300, 225, { fit: "cover", position: "attention" })
            .webp({ quality: 80 })
            .toBuffer(),
        ]);

        const [imageUrl, thumbnailUrl] = await Promise.all([
          uploadToR2(full, "service-images", `${slug}.webp`, "image/webp"),
          uploadToR2(thumb, "service-images/thumbs", `${slug}-thumb.webp`, "image/webp"),
        ]);

        const r2Key = `service-images/${slug}.webp`;

        await db.insert(serviceImages).values({
          name: baseName,
          slug,
          category,
          imageUrl,
          thumbnailUrl,
          r2Key,
          isActive: true,
          sortOrder: 0,
        });

        results.push({ name: baseName, slug, success: true });
      } catch (err: any) {
        console.error("[service-images] bulk-upload item error:", err?.message);
        results.push({ name: baseName, slug, success: false, error: err?.message });
      }
    }

    return res.json({
      results,
      uploaded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    });
  }
);

// ─── Create record ─────────────────────────────────────────────────────────────
router.post("/", async (req: any, res) => {
  try {
    const { name, category, subcategory, description, sortOrder } = req.body as Record<string, any>;
    if (!name || !category) return res.status(400).json({ error: "name and category are required" });

    const slug = slugify(`${name}-${Date.now()}`);

    const [row] = await db
      .insert(serviceImages)
      .values({
        name,
        slug,
        category,
        subcategory: subcategory || null,
        description: description || null,
        sortOrder: sortOrder != null ? Number(sortOrder) : 0,
        isActive: true,
      })
      .returning();

    return res.status(201).json(row);
  } catch (err: any) {
    console.error("[service-images] create error:", err?.message);
    return res.status(500).json({ error: "Failed to create service image" });
  }
});

// ─── Update ───────────────────────────────────────────────────────────────────
router.patch("/:id", async (req: any, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Invalid id" });
  try {
    const { name, category, subcategory, description, sortOrder, isActive } = req.body as Record<string, any>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (category !== undefined) updates.category = category;
    if (subcategory !== undefined) updates.subcategory = subcategory || null;
    if (description !== undefined) updates.description = description || null;
    if (sortOrder !== undefined) updates.sortOrder = Number(sortOrder);
    if (isActive !== undefined) updates.isActive = Boolean(isActive);

    const [row] = await db
      .update(serviceImages)
      .set(updates)
      .where(eq(serviceImages.id, id))
      .returning();

    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err: any) {
    console.error("[service-images] update error:", err?.message);
    return res.status(500).json({ error: "Failed to update service image" });
  }
});

// ─── Delete ───────────────────────────────────────────────────────────────────
router.delete("/:id", async (req: any, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Invalid id" });
  try {
    const [img] = await db
      .select()
      .from(serviceImages)
      .where(eq(serviceImages.id, id))
      .limit(1);
    if (!img) return res.status(404).json({ error: "Not found" });

    const cleanups: Promise<void>[] = [];
    if (img.r2Key) cleanups.push(deleteFromR2(img.r2Key).catch(() => {}));
    if (img.thumbnailUrl) {
      const thumbKey = extractR2KeyFromUrl(img.thumbnailUrl);
      if (thumbKey && thumbKey !== img.r2Key) cleanups.push(deleteFromR2(thumbKey).catch(() => {}));
    }
    await Promise.all(cleanups);

    await db.delete(serviceImages).where(eq(serviceImages.id, id));
    return res.json({ success: true });
  } catch (err: any) {
    console.error("[service-images] delete error:", err?.message);
    return res.status(500).json({ error: "Failed to delete service image" });
  }
});

// ─── Upload / Replace image for a single record ────────────────────────────────
router.post(
  "/:id/upload",
  memoryUpload({ maxSizeMb: 10 }).single("image"),
  async (req: any, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Invalid id" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    try {
      const [img] = await db
        .select()
        .from(serviceImages)
        .where(eq(serviceImages.id, id))
        .limit(1);
      if (!img) return res.status(404).json({ error: "Not found" });

      // Remove old R2 objects
      if (img.r2Key) await deleteFromR2(img.r2Key).catch(() => {});
      if (img.thumbnailUrl) {
        const thumbKey = extractR2KeyFromUrl(img.thumbnailUrl);
        if (thumbKey && thumbKey !== img.r2Key) await deleteFromR2(thumbKey).catch(() => {});
      }

      const slug = img.slug;
      const [full, thumb] = await Promise.all([
        sharp(req.file.buffer)
          .resize(800, 600, { fit: "cover", position: "attention" })
          .webp({ quality: 85 })
          .toBuffer(),
        sharp(req.file.buffer)
          .resize(300, 225, { fit: "cover", position: "attention" })
          .webp({ quality: 80 })
          .toBuffer(),
      ]);

      const [imageUrl, thumbnailUrl] = await Promise.all([
        uploadToR2(full, "service-images", `${slug}.webp`, "image/webp"),
        uploadToR2(thumb, "service-images/thumbs", `${slug}-thumb.webp`, "image/webp"),
      ]);

      const r2Key = `service-images/${slug}.webp`;

      const [updated] = await db
        .update(serviceImages)
        .set({ imageUrl, thumbnailUrl, r2Key, updatedAt: new Date() })
        .where(eq(serviceImages.id, id))
        .returning();

      return res.json({ imageUrl: updated.imageUrl, thumbnailUrl: updated.thumbnailUrl });
    } catch (err: any) {
      console.error("[service-images] upload error:", err?.message);
      return res.status(500).json({ error: "Upload failed" });
    }
  }
);

export default router;
