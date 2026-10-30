/**
 * Site Assets — admin-managed images stored in R2 and served at /assets/:key
 *
 * GET    /api/admin/site-assets            — list all
 * POST   /api/admin/site-assets/upload     — upload image (form fields: key, label)
 * DELETE /api/admin/site-assets/:key       — delete
 * GET    /api/admin/site-assets/lookup/:key — resolve a key to its R2 url (public)
 */

import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { waitForDb } from "../db";
import { sql } from "drizzle-orm";
import { memoryUpload, uploadToR2, deleteFromR2 } from "../lib/r2";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import {
  MARKETING_IMAGES,
  marketingAssetKey,
} from "../lib/marketingImages";

const router = Router();

/** The colour around the photo's edge (average of its four corners); transparent if the photo has transparency. */
async function edgeBackground(input: Buffer): Promise<{ r: number; g: number; b: number; alpha: number }> {
  const clear = { r: 255, g: 255, b: 255, alpha: 0 };
  try {
    const { data, info } = await sharp(input).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    const at = (x: number, y: number) => { const i = (y * width + x) * channels; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; };
    const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)];
    if (corners.some((c) => c[3] < 250)) return clear;
    const avg = (k: number) => Math.round(corners.reduce((sum, c) => sum + c[k], 0) / corners.length);
    return { r: avg(0), g: avg(1), b: avg(2), alpha: 1 };
  } catch {
    return clear;
  }
}

function projectRoot(): string {
  const candidates = [
    path.resolve(process.cwd(), "../.."),
    process.cwd(),
  ];
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, "artifacts", "booking"))) ?? candidates[0];
}

function writeNativeAssets(targets: string[] | undefined, buffer: Buffer): void {
  if (!targets?.length) return;
  const root = projectRoot();
  for (const target of targets) {
    const destination = path.join(root, target);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, buffer);
  }
}

/** Ensure the table exists before any request uses it. */
export async function initSiteAssetsTable(): Promise<void> {
  try {
    await waitForDb("site-assets");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS site_assets (
        key         TEXT PRIMARY KEY,
        label       TEXT NOT NULL DEFAULT '',
        r2_url      TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  } catch (err: any) {
    console.warn("[site-assets] table init warning:", err?.message);
  }
}

// ─── List ──────────────────────────────────────────────────────────────────────
router.get("/admin/site-assets", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`SELECT * FROM site_assets ORDER BY key ASC`);
    return res.json({ assets: result.rows });
  } catch (err: any) {
    console.error("[site-assets] list error:", err?.message);
    return res.status(500).json({ error: "Failed to load site assets" });
  }
});

// ─── Marketing website image audit ────────────────────────────────────────────
router.get("/admin/marketing-images", async (_req: Request, res: Response) => {
  try {
    const keys = MARKETING_IMAGES.map((item) => marketingAssetKey(item.slot));
    const result = keys.length
      ? await db.execute(sql`
          SELECT key, r2_url, updated_at
          FROM site_assets
          WHERE key IN (${sql.join(keys.map((key) => sql`${key}`), sql`, `)})
        `)
      : { rows: [] };
    const replacements = new Map(result.rows.map((row: any) => [row.key, row]));
    return res.json({
      images: MARKETING_IMAGES.map((item) => {
        const replacement = replacements.get(marketingAssetKey(item.slot)) as any;
        const { nativeAssetTargets: _nativeAssetTargets, ...publicItem } = item;
        return {
          ...publicItem,
          url: `/airo-assets/images/${item.slot}`,
          replacementUrl: replacement?.r2_url ?? null,
          updatedAt: replacement?.updated_at ?? null,
        };
      }),
    });
  } catch (err: any) {
    console.error("[marketing-images] list error:", err?.message);
    return res.status(500).json({ error: "Failed to load marketing images" });
  }
});

router.post(
  "/admin/marketing-images/upload",
  memoryUpload({ maxSizeMb: 25 }).single("image"),
  async (req: any, res: Response) => {
    const slot = String(req.body?.slot || "");
    const definition = MARKETING_IMAGES.find((item) => item.slot === slot);
    if (!definition) return res.status(400).json({ error: "Unknown marketing image slot" });
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });

    const key = marketingAssetKey(slot);
    try {
      const metadata = await sharp(req.file.buffer).metadata();
      if (!metadata.width || !metadata.height) {
        return res.status(400).json({ error: "The selected file is not a readable image" });
      }

      // A fixed output canvas plus the slot's cover/contain rule guarantees the
      // replacement cannot alter the card size or rounded wrapper on the site.
      // "contain" never cuts the picture: the spare space takes the photo's own background (the colour of its
      // corners), or stays transparent when the photo has transparency, so it blends into the frame.
      const processed = await sharp(req.file.buffer)
        .rotate()
        .resize(definition.width, definition.height, {
          fit: definition.fit,
          position: definition.fit === "cover" ? "attention" : "centre",
          background: definition.fit === "contain" ? await edgeBackground(req.file.buffer) : { r: 255, g: 255, b: 255, alpha: 0 },
        })
        .webp({ quality: 88 })
        .toBuffer();
      const nativePng = definition.nativeAssetTargets?.length
        ? await sharp(req.file.buffer).rotate().resize(1024, 1024, { fit: "cover", position: "attention" }).png().toBuffer()
        : null;

      const existing = await db.execute(sql`SELECT r2_url FROM site_assets WHERE key = ${key} LIMIT 1`);
      const oldUrl = (existing.rows[0] as any)?.r2_url;
      const r2Url = await uploadToR2(processed, "marketing-images", `${slot}.webp`, "image/webp");
      await db.execute(sql`
        INSERT INTO site_assets (key, label, r2_url, updated_at)
        VALUES (${key}, ${definition.label}, ${r2Url}, NOW())
        ON CONFLICT (key) DO UPDATE SET
          label = EXCLUDED.label,
          r2_url = EXCLUDED.r2_url,
          updated_at = NOW()
      `);
      if (oldUrl) await deleteFromR2(oldUrl).catch(() => {});
      if (nativePng) writeNativeAssets(definition.nativeAssetTargets, nativePng);
      return res.json({
        slot,
        r2Url,
        width: definition.width,
        height: definition.height,
        fit: definition.fit,
      });
    } catch (err: any) {
      console.error("[marketing-images] upload error:", err?.message);
      return res.status(500).json({ error: "Image replacement failed" });
    }
  },
);

router.delete("/admin/marketing-images", async (req: Request, res: Response) => {
  const slot = String(req.query.slot || "");
  if (!MARKETING_IMAGES.some((item) => item.slot === slot)) {
    return res.status(400).json({ error: "Unknown marketing image slot" });
  }
  try {
    const key = marketingAssetKey(slot);
    const result = await db.execute(sql`DELETE FROM site_assets WHERE key = ${key} RETURNING r2_url`);
    const r2Url = (result.rows[0] as any)?.r2_url;
    if (r2Url) await deleteFromR2(r2Url).catch(() => {});
    if (MARKETING_IMAGES.find((item) => item.slot === slot)?.nativeAssetTargets?.length) {
      const definition = MARKETING_IMAGES.find((item) => item.slot === slot)!;
      const originalPath = definition.originalUrl?.replace(/^\/images\//, "artifacts/booking/public/images/");
      if (originalPath) writeNativeAssets(definition.nativeAssetTargets, fs.readFileSync(path.join(projectRoot(), originalPath)));
    }
    return res.json({ success: true });
  } catch (err: any) {
    console.error("[marketing-images] reset error:", err?.message);
    return res.status(500).json({ error: "Failed to restore the original image" });
  }
});

// ─── Lookup (public — used by middleware cache refresh) ────────────────────────
router.get("/admin/site-assets/lookup/:key", async (req: Request, res: Response) => {
  const { key } = req.params;
  try {
    const result = await db.execute(sql`SELECT r2_url FROM site_assets WHERE key = ${key} LIMIT 1`);
    const row = result.rows[0] as any;
    if (!row) return res.status(404).json({ error: "Not found" });
    return res.json({ key, r2Url: row.r2_url });
  } catch (err: any) {
    return res.status(500).json({ error: "Lookup failed" });
  }
});

// ─── Upload ────────────────────────────────────────────────────────────────────
router.post(
  "/admin/site-assets/upload",
  memoryUpload({ maxSizeMb: 20 }).single("image"),
  async (req: any, res: Response) => {
    const { key, label } = req.body as { key?: string; label?: string };
    if (!key) return res.status(400).json({ error: "key is required" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    try {
      // Delete old object from R2 if one already exists for this key
      const existing = await db.execute(sql`SELECT r2_url FROM site_assets WHERE key = ${key} LIMIT 1`);
      const oldUrl = (existing.rows[0] as any)?.r2_url;
      if (oldUrl) await deleteFromR2(oldUrl).catch(() => {});

      const r2Url = await uploadToR2(req.file.buffer, "site-assets", key, req.file.mimetype);

      await db.execute(sql`
        INSERT INTO site_assets (key, label, r2_url, updated_at)
        VALUES (${key}, ${label ?? key}, ${r2Url}, NOW())
        ON CONFLICT (key) DO UPDATE SET
          label      = EXCLUDED.label,
          r2_url     = EXCLUDED.r2_url,
          updated_at = NOW()
      `);

      return res.json({ key, r2Url });
    } catch (err: any) {
      console.error("[site-assets] upload error:", err?.message);
      return res.status(500).json({ error: "Upload failed" });
    }
  }
);

// ─── Delete ────────────────────────────────────────────────────────────────────
router.delete("/admin/site-assets/:key", async (req: Request, res: Response) => {
  const { key } = req.params;
  try {
    const result = await db.execute(sql`
      DELETE FROM site_assets WHERE key = ${key} RETURNING r2_url
    `);
    const r2Url = (result.rows[0] as any)?.r2_url;
    if (r2Url) await deleteFromR2(r2Url).catch(() => {});
    return res.json({ success: true });
  } catch (err: any) {
    console.error("[site-assets] delete error:", err?.message);
    return res.status(500).json({ error: "Failed to delete asset" });
  }
});

export default router;
