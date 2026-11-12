/**
 * Hairstyle library — reference-image approval (Last Cut Formula Phase 4). Certxa platform admins only
 * (isAdminAuthenticated: users.is_admin). Global styles only (store_id NULL); store styles are never listed or changed.
 * Mounted at /api/admin/hairstyles. Page: /isadmin/hairstyle-library.
 *
 *   GET   /api/admin/hairstyles?q=&category=&images=missing|pending      the global styles with image counts per view
 *   GET   /api/admin/hairstyles/:id                                      one style with ALL its images (any status), for preview
 *   POST  /api/admin/hairstyles/:id/images        (multipart: image, view, source?, altText?)   upload → pending
 *   POST  /api/admin/hairstyles/images/:imageId/replace   (multipart: image)   a new pending image for the same style + view;
 *                                                          approving it rejects the one it replaces
 *   PATCH /api/admin/hairstyles/images/:imageId   { view?, altText?, displayOrder?, templateId? }  (moving to another style: pending only)
 *   POST  /api/admin/hairstyles/images/:imageId/approve
 *   POST  /api/admin/hairstyles/images/:imageId/reject   { reason? }
 *
 * Only `approved` images are ever sent to barbers (/api/hairstyles/:id, the Last Cut Formula panels). Files go to
 * Cloudflare R2 through uploadToR2 (WebP), under hairstyles/global/<slug>/. Without R2 configured, uploads are refused.
 */
import { Router, type Request, type Response } from "express";
import { pool } from "../db";
import { isAdminAuthenticated } from "../auth";
import { extractR2KeyFromUrl, isR2Configured, memoryUpload, uploadToR2 } from "../lib/r2";
import { r2Url } from "../lib/haircutFormulas";
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
  id: i.id, templateId: i.template_id, view: i.view, url: r2Url(i.r2_key), r2Key: i.r2_key, source: i.source, status: i.approval_status,
  approvedAt: i.approved_at, approvedBy: i.approved_by_user_id, altText: i.alt_text, displayOrder: i.display_order, metadata: i.metadata, createdAt: i.created_at,
});
const fail = (res: Response, label: string, err: unknown) => { console.error(`[hairstyle-admin] ${label}:`, err); return res.status(500).json({ message: "Could not complete the hairstyle library request" }); };

async function globalStyle(id: number) {
  return (await pool.query(`SELECT id, slug, name, status, is_active FROM hairstyle_templates WHERE id = $1 AND store_id IS NULL`, [id])).rows[0] ?? null;
}

/** Puts one uploaded file in R2 under the style's folder and returns its key (never invented: it is the key written). */
async function store(file: Express.Multer.File, slug: string): Promise<string> {
  const url = await uploadToR2(file.buffer, `hairstyles/global/${slug}`, file.originalname, file.mimetype);
  const key = extractR2KeyFromUrl(url);
  if (!key) throw new Error("R2 did not return a key");
  return key;
}

function checkFile(req: Request, res: Response): req is Request & { file: Express.Multer.File } {
  if (!isR2Configured()) { res.status(503).json({ message: "Image storage (R2) is not configured on this server" }); return false; }
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

router.post("/:id/images", upload.single("image"), async (req, res) => {
  try {
    if (!checkFile(req, res)) return;
    const t = await globalStyle(posInt(req.params.id) ?? 0);
    if (!t) return res.status(404).json({ message: "Hairstyle not found" });
    const view = String(req.body?.view ?? "");
    if (!(IMAGE_VIEWS as readonly string[]).includes(view)) return res.status(400).json({ message: "Pick the view: front, left, right, back or detail" });
    const source = SOURCES.has(String(req.body?.source)) ? String(req.body.source) : "certxa_artwork";
    const key = await store(req.file, t.slug);
    const r = (await pool.query(
      `INSERT INTO hairstyle_template_images (template_id, view, r2_key, source, approval_status, alt_text, metadata)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6) RETURNING *`,
      [t.id, view, key, source, typeof req.body?.altText === "string" ? req.body.altText.slice(0, 300) || null : null,
       JSON.stringify({ uploadedBy: adminId(req), originalName: req.file.originalname.slice(0, 200) })])).rows[0];
    return res.status(201).json({ image: toImage(r) });
  } catch (err) { return fail(res, "upload", err); }
});

router.post("/images/:imageId/replace", upload.single("image"), async (req, res) => {
  try {
    if (!checkFile(req, res)) return;
    const old = (await pool.query(
      `SELECT i.*, t.slug FROM hairstyle_template_images i JOIN hairstyle_templates t ON t.id = i.template_id AND t.store_id IS NULL WHERE i.id = $1`,
      [posInt(req.params.imageId) ?? 0])).rows[0];
    if (!old) return res.status(404).json({ message: "Image not found" });
    const key = await store(req.file, old.slug);
    const r = (await pool.query(
      `INSERT INTO hairstyle_template_images (template_id, view, r2_key, source, approval_status, alt_text, display_order, metadata)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7) RETURNING *`,
      [old.template_id, old.view, key, old.source, old.alt_text, old.display_order,
       JSON.stringify({ uploadedBy: adminId(req), originalName: req.file.originalname.slice(0, 200), replaces: old.id })])).rows[0];
    return res.status(201).json({ image: toImage(r) });
  } catch (err) { return fail(res, "replace", err); }
});

router.patch("/images/:imageId", async (req, res) => {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const img = (await db.query(
      `SELECT i.* FROM hairstyle_template_images i JOIN hairstyle_templates t ON t.id = i.template_id AND t.store_id IS NULL WHERE i.id = $1 FOR UPDATE OF i`,
      [posInt(req.params.imageId) ?? 0])).rows[0];
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
    // A view change on an approved image would show it as a different angle: it goes back to pending.
    const viewChanged = b.view !== undefined && b.view !== img.view;
    const r = (await db.query(
      `UPDATE hairstyle_template_images SET template_id = $1, view = $2, alt_text = $3, display_order = $4,
              approval_status = CASE WHEN $5 THEN 'pending' ELSE approval_status END,
              approved_at = CASE WHEN $5 THEN NULL ELSE approved_at END, approved_by_user_id = CASE WHEN $5 THEN NULL ELSE approved_by_user_id END,
              updated_at = now()
        WHERE id = $6 RETURNING *`,
      [templateId, b.view ?? img.view, typeof b.altText === "string" ? b.altText.slice(0, 300) || null : img.alt_text,
       Number.isInteger(b.displayOrder) ? b.displayOrder : img.display_order, viewChanged, img.id])).rows[0];
    await db.query("COMMIT");
    return res.json({ image: toImage(r) });
  } catch (err) { await db.query("ROLLBACK").catch(() => {}); return fail(res, "patch", err); } finally { db.release(); }
});

router.post("/images/:imageId/approve", async (req, res) => {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const img = (await db.query(
      `SELECT i.* FROM hairstyle_template_images i JOIN hairstyle_templates t ON t.id = i.template_id AND t.store_id IS NULL WHERE i.id = $1 FOR UPDATE OF i`,
      [posInt(req.params.imageId) ?? 0])).rows[0];
    if (!img) { await db.query("ROLLBACK"); return res.status(404).json({ message: "Image not found" }); }
    const r = (await db.query(
      `UPDATE hairstyle_template_images SET approval_status = 'approved', approved_by_user_id = $1, approved_at = now(), updated_at = now()
        WHERE id = $2 RETURNING *`, [adminId(req), img.id])).rows[0];
    // A replacement retires the image it replaces (kept as rejected, never deleted).
    const replaces = posInt(img.metadata?.replaces);
    if (replaces) {
      await db.query(
        `UPDATE hairstyle_template_images SET approval_status = 'rejected', approved_at = NULL, approved_by_user_id = NULL,
                metadata = metadata || jsonb_build_object('replacedBy', $1::int, 'rejectedBy', $2::text), updated_at = now()
          WHERE id = $3 AND template_id = $4`, [img.id, adminId(req), replaces, img.template_id]);
    }
    await db.query("COMMIT");
    return res.json({ image: toImage(r), retired: replaces ?? null });
  } catch (err) { await db.query("ROLLBACK").catch(() => {}); return fail(res, "approve", err); } finally { db.release(); }
});

router.post("/images/:imageId/reject", async (req, res) => {
  try {
    const r = (await pool.query(
      `UPDATE hairstyle_template_images i SET approval_status = 'rejected', approved_at = NULL, approved_by_user_id = NULL,
              metadata = i.metadata || jsonb_build_object('rejectedBy', $1::text, 'rejectReason', $2::text), updated_at = now()
         FROM hairstyle_templates t
        WHERE i.id = $3 AND t.id = i.template_id AND t.store_id IS NULL RETURNING i.*`,
      [adminId(req), typeof req.body?.reason === "string" ? req.body.reason.slice(0, 300) : "", posInt(req.params.imageId) ?? 0])).rows[0];
    if (!r) return res.status(404).json({ message: "Image not found" });
    return res.json({ image: toImage(r) });
  } catch (err) { return fail(res, "reject", err); }
});

export default router;
