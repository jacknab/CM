/**
 * Illustration Category routes
 * GET    /api/illustration-categories            — list all (filter by ?industry=)
 * GET    /api/illustration-categories/usage      — usage counts per category (for a store)
 * GET    /api/illustration-categories/:id        — single category
 * POST   /api/illustration-categories            — create (admin)
 * PATCH  /api/illustration-categories/:id        — update (admin)
 * DELETE /api/illustration-categories/:id        — delete (admin)
 * POST   /api/illustration-categories/:id/upload — upload image
 * POST   /api/illustration-categories/auto-assign/:serviceId — auto-assign illustration to a service
 * POST   /api/illustration-categories/bulk-auto-assign       — bulk auto-assign for entire store
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { serviceIllustrationCategories, services } from "@shared/schema";
import { eq, sql, asc } from "drizzle-orm";
import { memoryUpload, uploadToR2, deleteFromR2, extractR2KeyFromUrl } from "../lib/r2";
import sharp from "sharp";
import { findIllustrationSlug, type Industry } from "../lib/illustrationMatcher";

/**
 * Fallback: find a category slug by matching the service name against actual
 * category names in the DB (exact → prefix → all-words).
 */
function nameMatchSlug(
  serviceName: string,
  cats: Array<{ slug: string; name: string }>
): string | null {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const svc = norm(serviceName);

  // 1) Exact name match
  for (const cat of cats) {
    if (norm(cat.name) === svc) return cat.slug;
  }

  // 2) Service name starts with or contains the full category name
  for (const cat of cats) {
    const cn = norm(cat.name);
    if (svc.startsWith(cn) || svc.includes(cn)) return cat.slug;
  }

  // 3) All significant words of the category name appear in the service name
  for (const cat of cats) {
    const words = norm(cat.name).split(" ").filter(w => w.length > 2);
    if (words.length >= 2 && words.every(w => svc.includes(w))) return cat.slug;
  }

  return null;
}

const router = Router();

// ─── List ─────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { industry, activeOnly } = req.query as Record<string, string>;
    const filters: any[] = [];
    if (industry) filters.push(eq(serviceIllustrationCategories.industry, industry.toUpperCase()));
    if (activeOnly === "true") filters.push(eq(serviceIllustrationCategories.isActive, true));
    const rows = await db.select().from(serviceIllustrationCategories)
      .where(filters.length ? sql`${sql.join(filters, sql` AND `)}` : undefined)
      .orderBy(asc(serviceIllustrationCategories.industry), asc(serviceIllustrationCategories.sortOrder), asc(serviceIllustrationCategories.name));
    return res.json({ categories: rows });
  } catch (err: any) {
    console.error("[illustration-categories] list error:", err?.message);
    return res.status(500).json({ error: "Failed to load illustration categories" });
  }
});

// ─── Usage counts ─────────────────────────────────────────────────────────────
// NOTE: must be declared BEFORE /:id so "usage" is not swallowed as an id param
router.get("/usage", async (req: any, res) => {
  try {
    const storeId = Number(req.query.storeId);
    const rows = await db.execute(sql`
      SELECT ic.id, ic.slug, COUNT(s.id)::int AS usage_count
      FROM service_illustration_categories ic
      LEFT JOIN services s ON s.illustration_category_id = ic.id
        ${storeId ? sql`AND s.store_id = ${storeId}` : sql``}
      GROUP BY ic.id, ic.slug
    `);
    const map: Record<number, number> = {};
    for (const r of rows.rows as any[]) map[r.id] = r.usage_count;
    return res.json({ usage: map });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to load usage" });
  }
});

// ─── Bulk auto-assign for an entire store ─────────────────────────────────────
// NOTE: must be before /:id routes
router.post("/bulk-auto-assign", async (req: any, res) => {
  const { storeId, industry, overwrite } = req.body;
  if (!storeId) return res.status(400).json({ error: "storeId is required" });
  try {
    const ind = (industry || "NAIL_SALON") as Industry;
    const allServices = await db.select().from(services).where(eq(services.storeId, Number(storeId)));
    const cats = await db.select().from(serviceIllustrationCategories).where(eq(serviceIllustrationCategories.isActive, true));
    const catBySlug = Object.fromEntries(cats.map(c => [c.slug, c]));

    let assigned = 0;
    let skipped = 0;
    for (const svc of allServices) {
      if (!overwrite && svc.illustrationCategoryId) { skipped++; continue; }
      // 1) Try keyword rules first, then fall back to name matching
      const slug = findIllustrationSlug(svc.name, ind) ?? nameMatchSlug(svc.name, cats);
      if (!slug || !catBySlug[slug]) { skipped++; continue; }
      await db.update(services)
        .set({ illustrationCategoryId: catBySlug[slug].id, autoAssigned: true })
        .where(eq(services.id, svc.id));
      assigned++;
    }
    return res.json({ assigned, skipped, total: allServices.length });
  } catch (err: any) {
    return res.status(500).json({ error: "Bulk auto-assign failed" });
  }
});

// ─── Auto-assign illustration to a single service ─────────────────────────────
// NOTE: must be before /:id routes
router.post("/auto-assign/:serviceId", async (req: any, res) => {
  const serviceId = Number(req.params.serviceId);
  if (!Number.isFinite(serviceId) || serviceId <= 0) {
    return res.status(400).json({ error: "Invalid serviceId" });
  }
  try {
    const [svc] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
    if (!svc) return res.status(404).json({ error: "Service not found" });

    const industry = (req.body.industry || "NAIL_SALON") as Industry;
    const cats = await db.select().from(serviceIllustrationCategories)
      .where(eq(serviceIllustrationCategories.isActive, true));

    // 1) Try keyword rules, then fall back to name-based matching against DB categories
    const slug = findIllustrationSlug(svc.name, industry) ?? nameMatchSlug(svc.name, cats);
    if (!slug) return res.json({ assigned: false, message: "No matching illustration" });

    const [cat] = cats.filter(c => c.slug === slug);
    if (!cat) return res.json({ assigned: false, message: "Slug not seeded in DB yet" });

    await db.update(services)
      .set({ illustrationCategoryId: cat.id, autoAssigned: true })
      .where(eq(services.id, serviceId));

    return res.json({ assigned: true, slug, categoryId: cat.id, category: cat });
  } catch (err: any) {
    console.error("[illustration-categories] auto-assign error:", err?.message);
    return res.status(500).json({ error: "Auto-assign failed" });
  }
});

// ─── Single ───────────────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Invalid id" });
  const [row] = await db.select().from(serviceIllustrationCategories).where(eq(serviceIllustrationCategories.id, id)).limit(1);
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

// ─── Create ───────────────────────────────────────────────────────────────────
router.post("/", async (req: any, res) => {
  try {
    const { name, slug, description, industry, sortOrder } = req.body;
    if (!name || !slug) return res.status(400).json({ error: "name and slug are required" });

    const [existing] = await db.select({ id: serviceIllustrationCategories.id })
      .from(serviceIllustrationCategories)
      .where(eq(serviceIllustrationCategories.slug, slug))
      .limit(1);
    if (existing) return res.status(409).json({ error: "Slug already exists" });

    const [row] = await db.insert(serviceIllustrationCategories).values({
      name, slug, description: description || null,
      industry: (industry || "NAIL_SALON").toUpperCase(),
      sortOrder: sortOrder ?? 0,
    }).returning();
    return res.status(201).json(row);
  } catch (err: any) {
    console.error("[illustration-categories] create error:", err?.message);
    return res.status(500).json({ error: "Failed to create category" });
  }
});

// ─── Update ───────────────────────────────────────────────────────────────────
router.patch("/:id", async (req: any, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Invalid id" });
  try {
    const { name, slug, description, industry, isActive, sortOrder } = req.body;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (slug !== undefined) updates.slug = slug;
    if (description !== undefined) updates.description = description;
    if (industry !== undefined) updates.industry = industry.toUpperCase();
    if (isActive !== undefined) updates.isActive = isActive;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    const [row] = await db.update(serviceIllustrationCategories).set(updates)
      .where(eq(serviceIllustrationCategories.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json(row);
  } catch (err: any) {
    console.error("[illustration-categories] update error:", err?.message);
    return res.status(500).json({ error: "Failed to update category" });
  }
});

// ─── Delete ───────────────────────────────────────────────────────────────────
router.delete("/:id", async (req: any, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Invalid id" });
  try {
    const [cat] = await db.select().from(serviceIllustrationCategories).where(eq(serviceIllustrationCategories.id, id)).limit(1);
    if (!cat) return res.status(404).json({ error: "Not found" });
    if (cat.imageUrl) {
      const key = extractR2KeyFromUrl(cat.imageUrl);
      if (key) await deleteFromR2(key).catch(() => {});
    }
    await db.update(services).set({ illustrationCategoryId: null, autoAssigned: false })
      .where(eq(services.illustrationCategoryId, id));
    await db.delete(serviceIllustrationCategories).where(eq(serviceIllustrationCategories.id, id));
    return res.json({ success: true });
  } catch (err: any) {
    console.error("[illustration-categories] delete error:", err?.message);
    return res.status(500).json({ error: "Failed to delete category" });
  }
});

// ─── Upload image ─────────────────────────────────────────────────────────────
router.post("/:id/upload", memoryUpload({ maxSizeMb: 10 }).single("image"), async (req: any, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Invalid id" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const [cat] = await db.select().from(serviceIllustrationCategories).where(eq(serviceIllustrationCategories.id, id)).limit(1);
    if (!cat) return res.status(404).json({ error: "Category not found" });

    if (cat.imageUrl) {
      const key = extractR2KeyFromUrl(cat.imageUrl);
      if (key) await deleteFromR2(key).catch(() => {});
    }

    const resized = await sharp(req.file.buffer)
      .resize(300, 200, { fit: "cover", position: "attention" })
      .webp({ quality: 85 })
      .toBuffer();

    const imageUrl = await uploadToR2(resized, "illustrations", `${cat.slug}.webp`, "image/webp");

    const [updated] = await db.update(serviceIllustrationCategories)
      .set({ imageUrl, updatedAt: new Date() })
      .where(eq(serviceIllustrationCategories.id, id))
      .returning();
    return res.json({ imageUrl: updated.imageUrl });
  } catch (err: any) {
    console.error("[illustration-categories] upload error:", err?.message);
    return res.status(500).json({ error: "Upload failed" });
  }
});

export default router;
