import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, imageLibraryTable } from "@workspace/db";
import path from "path";
import fs from "fs";
import https from "https";
import http from "http";
import crypto from "crypto";
import { logger } from "../lib/logger";
import multer from "multer";
import { uploadToR2, deleteFromR2, memoryUpload, R2_PUBLIC_BASE } from "../lib/r2";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";

const router: IRouter = Router();

const IMAGE_LIBRARY_DIR = path.resolve(process.cwd(), "image-library-storage");
const TEMPLATES_DIR = path.resolve(process.cwd(), "templates-storage");

const VALID_CATEGORIES = ["nail_salon", "barbershop", "hair_salon", "other"];

function safeCategory(category: string): string {
  return VALID_CATEGORIES.includes(category) ? category : "other";
}

// ── Static serve / redirect ──────────────────────────────────────────────────
// New uploads go to R2; this route redirects to R2 or falls back to local disk
// for any images that were uploaded before the R2 migration.

router.get("/image-library/images/:category/:filename", async (req, res): Promise<void> => {
  const category = Array.isArray(req.params.category) ? req.params.category[0] : req.params.category;
  const filename = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;

  // Check DB for an R2 URL stored in originalUrl
  try {
    const [item] = await db
      .select({ originalUrl: imageLibraryTable.originalUrl })
      .from(imageLibraryTable)
      .where(and(eq(imageLibraryTable.category, category), eq(imageLibraryTable.filename, filename)));

    if (item?.originalUrl?.startsWith("http")) {
      res.redirect(301, item.originalUrl);
      return;
    }
  } catch {
    // fall through to local disk
  }

  // Legacy: serve from local disk
  const filePath = path.join(IMAGE_LIBRARY_DIR, category, filename);
  if (!filePath.startsWith(IMAGE_LIBRARY_DIR) || !fs.existsSync(filePath)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.sendFile(filePath);
});

// ── List images ───────────────────────────────────────────────────────────────

router.get("/image-library", async (req, res): Promise<void> => {
  try {
    const { category } = req.query as { category?: string };
    const items = category && VALID_CATEGORIES.includes(category)
      ? await db.select().from(imageLibraryTable).where(eq(imageLibraryTable.category, category)).orderBy(imageLibraryTable.createdAt)
      : await db.select().from(imageLibraryTable).orderBy(imageLibraryTable.createdAt);
    res.json(items);
  } catch (err) {
    logger.error({ err }, "Failed to list image library");
    res.status(500).json({ error: "Internal error" });
  }
});

// ── Upload (drag & drop → R2) ─────────────────────────────────────────────────

const upload = memoryUpload({ maxSizeMb: 20 });

router.post(
  "/image-library/upload",
  upload.single("image"),
  async (req, res): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }
      const category = (req.query as { category?: string }).category ?? "other";
      const safe = safeCategory(category);

      // Upload to R2
      const r2Url = await uploadToR2(
        req.file.buffer,
        `image-library/${safe}`,
        req.file.originalname,
        req.file.mimetype
      );
      // Store R2 key as filename (path after bucket), full URL as originalUrl
      const r2Key = r2Url.replace(`${R2_PUBLIC_BASE}/`, "");

      const [inserted] = await db
        .insert(imageLibraryTable)
        .values({
          filename: r2Key,
          category: safe,
          originalUrl: r2Url,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
        })
        .returning();
      logger.info({ id: inserted.id, r2Url }, "Image uploaded to R2");
      res.status(201).json(inserted);
    } catch (err) {
      logger.error({ err }, "Upload failed");
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

// ── Delete ────────────────────────────────────────────────────────────────────

router.delete("/image-library/:id", isAuthenticated, async (req, res): Promise<void> => {
  try {
    const id = parseInt(
      Array.isArray(req.params.id) ? req.params.id[0] : req.params.id,
      10
    );
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [item] = await db
      .select()
      .from(imageLibraryTable)
      .where(eq(imageLibraryTable.id, id));
    if (!item) { res.status(404).json({ error: "Not found" }); return; }
    // Note: imageLibraryTable has no storeId column (images are shared across the platform).
    // Authorization is enforced at the session level (isAuthenticated).
    await resolveSessionStoreId(req);
    // Delete from R2 (if it's an R2 URL) or local disk (legacy)
    if (item.originalUrl?.startsWith("http")) {
      await deleteFromR2(item.originalUrl);
    } else {
      const filePath = path.join(IMAGE_LIBRARY_DIR, item.category, item.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await db.delete(imageLibraryTable).where(eq(imageLibraryTable.id, id));
    res.json({ deleted: true });
  } catch (err) {
    logger.error({ err }, "Delete failed");
    res.status(500).json({ error: "Delete failed" });
  }
});

// ── Harvest: scan template HTML/CSS for external image URLs ──────────────────

/** Download a URL into a Buffer (follows one redirect). */
function downloadBuffer(url: string): Promise<{ buffer: Buffer; mime: string }> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    const req = proto.get(url, { timeout: 15000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadBuffer(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (!res.statusCode || res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode ?? "?"} for ${url}`));
        return;
      }
      const mime = res.headers["content-type"]?.split(";")[0] ?? "image/jpeg";
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({ buffer: Buffer.concat(chunks), mime }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

function extractImageUrls(html: string): string[] {
  const urls = new Set<string>();
  // <img src="..."> and <img src='...'>
  const imgRe = /<img[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html))) urls.add(m[1]);
  // CSS url("...") and url('...')
  const cssRe = /url\(["']?(https?:\/\/[^"')]+)["']?\)/gi;
  while ((m = cssRe.exec(html))) urls.add(m[1]);
  // srcset
  const srcsetRe = /srcset=["']([^"']+)["']/gi;
  while ((m = srcsetRe.exec(html))) {
    m[1].split(",").forEach((part) => {
      const u = part.trim().split(/\s+/)[0];
      if (u?.startsWith("http")) urls.add(u);
    });
  }
  return Array.from(urls).filter(
    (u) => /\.(jpe?g|png|webp|gif|svg|avif)(\?.*)?$/i.test(u) && u.startsWith("http")
  );
}

router.post("/image-library/harvest", async (req, res): Promise<void> => {
  // Respond immediately — harvest runs in background
  res.json({ message: "Harvest started" });

  (async () => {
    logger.info("Starting image harvest from templates");
    if (!fs.existsSync(TEMPLATES_DIR)) return;

    // Gather existing originalUrls to skip duplicates
    const existing = await db.select({ originalUrl: imageLibraryTable.originalUrl }).from(imageLibraryTable);
    const seen = new Set(existing.map((r) => r.originalUrl).filter(Boolean));

    // Get all templates from DB to know category
    const templates = await db.query.templatesTable.findMany();
    let downloaded = 0;
    let skipped = 0;

    for (const tmpl of templates) {
      const distDir = path.join(TEMPLATES_DIR, tmpl.filesPath, "dist");
      if (!fs.existsSync(distDir)) continue;
      const category = tmpl.category;

      // Read all .html and .css files in dist
      const files: string[] = [];
      function walk(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (/\.(html|css|js)$/.test(entry.name)) files.push(full);
        }
      }
      try { walk(distDir); } catch { continue; }

      const allUrls = new Set<string>();
      for (const f of files) {
        try {
          const content = fs.readFileSync(f, "utf8");
          extractImageUrls(content).forEach((u) => allUrls.add(u));
        } catch { /* skip */ }
      }

      for (const url of allUrls) {
        if (seen.has(url)) { skipped++; continue; }
        seen.add(url);
        const ext = (url.match(/\.(jpe?g|png|webp|gif|svg|avif)/i)?.[0] ?? ".jpg").toLowerCase();
        const fakeName = `harvested${ext}`;
        try {
          const { buffer, mime } = await downloadBuffer(url);
          const safe = safeCategory(category);
          const r2Url = await uploadToR2(buffer, `image-library/${safe}`, fakeName, mime);
          const r2Key = r2Url.replace(`${R2_PUBLIC_BASE}/`, "");
          await db.insert(imageLibraryTable).values({
            filename: r2Key,
            category: safe,
            originalUrl: r2Url,
            fileSize: buffer.length,
            mimeType: mime,
          });
          downloaded++;
          logger.info({ url, category, r2Url }, "Harvested image → R2");
        } catch (err) {
          logger.warn({ url, err }, "Failed to harvest image");
        }
      }
    }
    logger.info({ downloaded, skipped }, "Harvest complete");
  })().catch((err) => logger.error({ err }, "Harvest failed"));
});

export default router;
