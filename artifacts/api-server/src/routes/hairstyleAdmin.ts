/**
 * Hairstyle library — reference-image approval (Last Cut Formula Phases 4–5). Certxa platform admins only
 * (isAdminAuthenticated: users.is_admin). Global styles only (store_id NULL); store styles are never listed or changed.
 * Mounted at /api/admin/hairstyles. Page: /isadmin/hairstyle-library.
 *
 *   GET   /api/admin/hairstyles?q=&category=&images=missing|pending      the global styles with image counts per view
 *   GET   /api/admin/hairstyles/:id                                      one style with ALL its images (any status), for preview
 *   GET   /api/admin/hairstyles/images/:imageId/file                     the image file itself (admins only; never cached)
 *   POST  /api/admin/hairstyles/:id/images        (multipart: image, view, source?, altText?)   upload → pending
 *   POST  /api/admin/hairstyles/images/:imageId/replace   (multipart: image)   a new pending image for the same style + view;
 *                                                          approving it retires the one it replaces
 *   PATCH /api/admin/hairstyles/images/:imageId   { view?, altText?, displayOrder?, templateId? }  (moving to another style: pending only)
 *   POST  /api/admin/hairstyles/images/:imageId/approve
 *   POST  /api/admin/hairstyles/images/:imageId/reject   { reason? }
 *
 * Image security (Phase 5, lib/hairstyleImageStore.ts): pending and rejected images are NOT in R2 — every R2 object is
 * public through /api/r2/<key> — but in a private folder on the server, viewable only through the admin file route.
 * Approving publishes the file to R2 under a fresh key; rejecting, replacing or re-angling an approved image takes it
 * out of R2 again. Barbers only ever get approved, published images.
 */
import { Router, type Request, type Response } from "express";
import type pg from "pg";
import { pool } from "../db";
import { isAdminAuthenticated } from "../auth";
import { getObjectFromR2, isR2Configured, memoryUpload, publicUrlForKey } from "../lib/r2";
import { addPendingImage, afterPublish, copyToReview, discardPublished, isReviewKey, publish, readReview } from "../lib/hairstyleImageStore";
import { IMAGE_VIEWS } from "@shared/hairstyleImageManifest";

const router = Router();
router.use(isAdminAuthenticated);
const multerUpload = memoryUpload({ maxSizeMb: 15 }).single("image");
/** The upload middleware, with its refusals (not an image, too large) answered as 400 instead of a server error. */
const upload = { single: (_field: "image") => (req: Request, res: Response, next: (err?: unknown) => void) =>
  multerUpload(req, res, (err?: unknown) => (err ? res.status(400).json({ message: /size|large/i.test(String((err as Error)?.message)) ? "The image is too large (15 MB at most)" : "PNG, JPEG or WebP only" }) : next())) };
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const SOURCES = new Set(["certxa_artwork", "ai_generated", "approved_reference"]);

const posInt = (v: unknown): number | null => { const n = Number(v); return Number.isSafeInteger(n) && n > 0 ? n : null; };
const adminId = (req: Request): string => (req.session as any).userId;
const toImage = (i: any) => ({
  id: i.id, templateId: i.template_id, view: i.view, source: i.source, status: i.approval_status,
  // Pending / rejected: only through the admin file route. Approved: the public URL barbers get.
  url: isReviewKey(i.r2_key) ? `/api/admin/hairstyles/images/${i.id}/file` : publicUrlForKey(i.r2_key),
  published: !isReviewKey(i.r2_key),
  approvedAt: i.approved_at, approvedBy: i.approved_by_user_id, altText: i.alt_text, displayOrder: i.display_order, metadata: i.metadata, createdAt: i.created_at,
});
const fail = (res: Response, label: string, err: unknown) => { console.error(`[hairstyle-admin] ${label}:`, err); return res.status(500).json({ message: "Could not complete the hairstyle library request" }); };

async function globalStyle(id: number) {
  return (await pool.query(`SELECT id, slug, name, status, is_active FROM hairstyle_templates WHERE id = $1 AND store_id IS NULL`, [id])).rows[0] ?? null;
}
async function lockImage(db: pg.PoolClient, imageId: number) {
  return (await db.query(
    `SELECT i.*, t.slug FROM hairstyle_template_images i JOIN hairstyle_templates t ON t.id = i.template_id AND t.store_id IS NULL
      WHERE i.id = $1 FOR UPDATE OF i`, [imageId])).rows[0] ?? null;
}

function checkFile(req: Request, res: Response): req is Request & { file: Express.Multer.File } {
  if (!req.file) { res.status(400).json({ message: "Choose an image file" }); return false; }
  if (!IMAGE_TYPES.has(req.file.mimetype)) { res.status(400).json({ message: "PNG, JPEG or WebP only" }); return false; }
  return true;
}

router.get("/", async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
    const category = typeof req.query.category === "string" ? req.query.category : null;
    const images = req.query.images === "missing" || req.query.images === "pending" ? req.query.images : null;
    const rows = (await pool.query(
      `SELECT t.id, t.slug, t.name, t.status, t.is_active, c.slug AS category_slug, c.name AS category_name,
              coalesce(jsonb_object_agg(i.view, i.n) FILTER (WHERE i.view IS NOT NULL AND i.approval_status = 'approved'), '{}') AS approved,
              coalesce(sum(i.n) FILTER (WHERE i.approval_status = 'pending'), 0)::int AS pending
         FROM hairstyle_templates t JOIN hairstyle_categories c ON c.id = t.category_id
         LEFT JOIN (SELECT template_id, view, approval_status, count(*)::int AS n FROM hairstyle_template_images GROUP BY 1, 2, 3) i ON i.template_id = t.id
        WHERE t.store_id IS NULL
          AND ($1 = '' OR t.name ILIKE '%' || $1 || '%' OR t.slug ILIKE '%' || $1 || '%')
          AND ($2::text IS NULL OR c.slug = $2)
        GROUP BY t.id, c.slug, c.name, c.display_order
        ORDER BY c.display_order, t.name`, [q.replace(/[%_\\]/g, (m) => `\\${m}`), category])).rows;
    const out = rows.map((r) => ({
      id: r.id, slug: r.slug, name: r.name, status: r.status, isActive: r.is_active, category: { slug: r.category_slug, name: r.category_name },
      approved: r.approved as Record<string, number>, pending: r.pending,
      missingViews: ["front", "left", "right", "back"].filter((v) => !(r.approved as Record<string, number>)[v]),
    })).filter((r) => (images === "missing" ? r.missingViews.length > 0 : images === "pending" ? r.pending > 0 : true));
    return res.json({ hairstyles: out });
  } catch (err) { return fail(res, "list", err); }
});

router.get("/:id", async (req, res) => {
  try {
    const id = posInt(req.params.id);
    const t = id ? (await pool.query(
      `SELECT t.*, c.slug AS category_slug, c.name AS category_name FROM hairstyle_templates t JOIN hairstyle_categories c ON c.id = t.category_id
        WHERE t.id = $1 AND t.store_id IS NULL`, [id])).rows[0] : null;
    if (!t) return res.status(404).json({ message: "Hairstyle not found" });
    const images = (await pool.query(`SELECT * FROM hairstyle_template_images WHERE template_id = $1 ORDER BY view, display_order, id`, [t.id])).rows.map(toImage);
    return res.json({
      hairstyle: { id: t.id, slug: t.slug, name: t.name, description: t.description, aliases: t.aliases, status: t.status, isActive: t.is_active,
        category: { slug: t.category_slug, name: t.category_name }, defaultSpec: t.default_spec },
      images,
    });
  } catch (err) { return fail(res, "get", err); }
});

router.get("/images/:imageId/file", async (req, res) => {
  try {
    const img = (await pool.query(
      `SELECT i.r2_key FROM hairstyle_template_images i JOIN hairstyle_templates t ON t.id = i.template_id AND t.store_id IS NULL WHERE i.id = $1`,
      [posInt(req.params.imageId) ?? 0])).rows[0];
    if (!img) return res.status(404).json({ message: "Image not found" });
    const body = isReviewKey(img.r2_key)
      ? await readReview(img.r2_key)
      : Buffer.from(await ((await getObjectFromR2(img.r2_key)).Body as any).transformToByteArray());
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.send(body);
  } catch (err) { return fail(res, "file", err); }
});

router.post("/:id/images", upload.single("image"), async (req, res) => {
  try {
    if (!checkFile(req, res)) return;
    const t = await globalStyle(posInt(req.params.id) ?? 0);
    if (!t) return res.status(404).json({ message: "Hairstyle not found" });
    const view = String(req.body?.view ?? "");
    if (!(IMAGE_VIEWS as readonly string[]).includes(view)) return res.status(400).json({ message: "Pick the view: front, left, right, back or detail" });
    const r = await addPendingImage(pool, {
      templateId: t.id, view, buffer: req.file.buffer, source: SOURCES.has(String(req.body?.source)) ? String(req.body.source) : "certxa_artwork",
      altText: typeof req.body?.altText === "string" ? req.body.altText.slice(0, 300) || null : null,
      metadata: { uploadedBy: adminId(req), originalName: req.file.originalname.slice(0, 200) },
    });
    return res.status(201).json({ image: toImage(r) });
  } catch (err) { return fail(res, "upload", err); }
});

router.post("/images/:imageId/replace", upload.single("image"), async (req, res) => {
  try {
    if (!checkFile(req, res)) return;
    const old = (await pool.query(
      `SELECT i.* FROM hairstyle_template_images i JOIN hairstyle_templates t ON t.id = i.template_id AND t.store_id IS NULL WHERE i.id = $1`,
      [posInt(req.params.imageId) ?? 0])).rows[0];
    if (!old) return res.status(404).json({ message: "Image not found" });
    const r = await addPendingImage(pool, {
      templateId: old.template_id, view: old.view, buffer: req.file.buffer, source: old.source, altText: old.alt_text, displayOrder: old.display_order,
      metadata: { uploadedBy: adminId(req), originalName: req.file.originalname.slice(0, 200), replaces: old.id },
    });
    return res.status(201).json({ image: toImage(r) });
  } catch (err) { return fail(res, "replace", err); }
});

router.patch("/images/:imageId", async (req, res) => {
  const db = await pool.connect();
  let toDiscard: string | null = null;
  try {
    await db.query("BEGIN");
    const img = await lockImage(db, posInt(req.params.imageId) ?? 0);
    if (!img) { await db.query("ROLLBACK"); return res.status(404).json({ message: "Image not found" }); }
    const b = req.body ?? {};
    if (b.view !== undefined && !(IMAGE_VIEWS as readonly string[]).includes(b.view)) { await db.query("ROLLBACK"); return res.status(400).json({ message: "Unknown view" }); }
    let templateId = img.template_id;
    if (b.templateId !== undefined && posInt(b.templateId) !== img.template_id) {
      // Assigning to another style: only before approval, and only to a global style.
      if (img.approval_status !== "pending") { await db.query("ROLLBACK"); return res.status(409).json({ message: "Only a pending image can be moved to another style" }); }
      const t = await globalStyle(posInt(b.templateId) ?? 0);
      if (!t) { await db.query("ROLLBACK"); return res.status(404).json({ message: "Hairstyle not found" }); }
      templateId = t.id;
    }
    // A view change on an approved image would show it as a different angle: it goes back to pending, out of R2.
    const viewChanged = b.view !== undefined && b.view !== img.view;
    let key = img.r2_key;
    if (viewChanged && !isReviewKey(img.r2_key)) { key = await copyToReview(img.r2_key); toDiscard = img.r2_key; }
    const r = (await db.query(
      `UPDATE hairstyle_template_images SET template_id = $1, view = $2, alt_text = $3, display_order = $4, r2_key = $5,
              approval_status = CASE WHEN $6 THEN 'pending' ELSE approval_status END,
              approved_at = CASE WHEN $6 THEN NULL ELSE approved_at END, approved_by_user_id = CASE WHEN $6 THEN NULL ELSE approved_by_user_id END,
              updated_at = now()
        WHERE id = $7 RETURNING *`,
      [templateId, b.view ?? img.view, typeof b.altText === "string" ? b.altText.slice(0, 300) || null : img.alt_text,
       Number.isInteger(b.displayOrder) ? b.displayOrder : img.display_order, key, viewChanged, img.id])).rows[0];
    await db.query("COMMIT");
    if (toDiscard) await discardPublished(toDiscard);
    return res.json({ image: toImage(r) });
  } catch (err) { await db.query("ROLLBACK").catch(() => {}); return fail(res, "patch", err); } finally { db.release(); }
});

router.post("/images/:imageId/approve", async (req, res) => {
  if (!isR2Configured()) return res.status(503).json({ message: "Image storage (R2) is not configured on this server" });
  const db = await pool.connect();
  let published: string | null = null;
  try {
    await db.query("BEGIN");
    const img = await lockImage(db, posInt(req.params.imageId) ?? 0);
    if (!img) { await db.query("ROLLBACK"); return res.status(404).json({ message: "Image not found" }); }
    if (img.approval_status === "approved" && !isReviewKey(img.r2_key)) { await db.query("ROLLBACK"); return res.json({ image: toImage(img), retired: null }); }
    // Publish first (copy to R2 under a fresh key); if anything below fails, the copy is removed again.
    const reviewKey = img.r2_key;
    published = await publish(reviewKey, img.slug, img.view, img.id);
    const r = (await db.query(
      `UPDATE hairstyle_template_images SET approval_status = 'approved', approved_by_user_id = $1, approved_at = now(), r2_key = $2, updated_at = now()
        WHERE id = $3 RETURNING *`, [adminId(req), published, img.id])).rows[0];
    // A replacement retires the image it replaces (kept privately as rejected, never deleted).
    const replaces = posInt(img.metadata?.replaces);
    let retiredKey: string | null = null;
    if (replaces) {
      const old = await lockImage(db, replaces);
      if (old && old.template_id === img.template_id) {
        const back = await copyToReview(old.r2_key);
        if (back !== old.r2_key) retiredKey = old.r2_key;
        await db.query(
          `UPDATE hairstyle_template_images SET approval_status = 'rejected', approved_at = NULL, approved_by_user_id = NULL, r2_key = $1,
                  metadata = metadata || jsonb_build_object('replacedBy', $2::int, 'rejectedBy', $3::text), updated_at = now()
            WHERE id = $4`, [back, img.id, adminId(req), old.id]);
      }
    }
    await db.query("COMMIT");
    published = null; // kept
    await afterPublish(reviewKey);
    if (retiredKey) await discardPublished(retiredKey);
    return res.json({ image: toImage(r), retired: replaces ?? null });
  } catch (err) {
    await db.query("ROLLBACK").catch(() => {});
    if (published) await discardPublished(published);
    return fail(res, "approve", err);
  } finally { db.release(); }
});

router.post("/images/:imageId/reject", async (req, res) => {
  const db = await pool.connect();
  let toDiscard: string | null = null;
  try {
    await db.query("BEGIN");
    const img = await lockImage(db, posInt(req.params.imageId) ?? 0);
    if (!img) { await db.query("ROLLBACK"); return res.status(404).json({ message: "Image not found" }); }
    const key = await copyToReview(img.r2_key);
    if (key !== img.r2_key) toDiscard = img.r2_key;
    const r = (await db.query(
      `UPDATE hairstyle_template_images SET approval_status = 'rejected', approved_at = NULL, approved_by_user_id = NULL, r2_key = $1,
              metadata = metadata || jsonb_build_object('rejectedBy', $2::text, 'rejectReason', $3::text), updated_at = now()
        WHERE id = $4 RETURNING *`,
      [key, adminId(req), typeof req.body?.reason === "string" ? req.body.reason.slice(0, 300) : "", img.id])).rows[0];
    await db.query("COMMIT");
    if (toDiscard) await discardPublished(toDiscard);
    return res.json({ image: toImage(r) });
  } catch (err) { await db.query("ROLLBACK").catch(() => {}); return fail(res, "reject", err); } finally { db.release(); }
});

export default router;
