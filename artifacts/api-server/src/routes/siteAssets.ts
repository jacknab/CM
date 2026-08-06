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

const router = Router();

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
