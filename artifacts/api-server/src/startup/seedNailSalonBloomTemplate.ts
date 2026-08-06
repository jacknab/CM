/**
 * seedNailSalonBloomTemplate.ts
 *
 * Ensures the "Nail Salon — Bloom" template is registered in wb_templates
 * and its dist/ is up to date with the current source.
 *
 * Stale-dist detection: if dist/index.html predates src/context/SiteContext.tsx
 * the build was created from older code and needs a rebuild.
 *
 * Idempotent: safe to run on every startup.
 */

import path from "path";
import fs from "fs";
import { db, templatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { buildAndScreenshot } from "../lib/screenshot";

function isDistStale(projectDir: string): boolean {
  const contextFile = path.join(projectDir, "src", "context", "SiteContext.tsx");
  const distIndex   = path.join(projectDir, "dist", "index.html");

  if (!fs.existsSync(contextFile)) return false;
  if (!fs.existsSync(distIndex))   return true;

  return fs.statSync(contextFile).mtimeMs > fs.statSync(distIndex).mtimeMs;
}

export async function seedNailSalonBloomTemplate(): Promise<void> {
  try {
    const candidatePaths = [
      path.resolve(process.cwd(), "templates-storage", "nail-salon-bloom"),
      path.resolve(process.cwd(), "..", "..", "templates-storage", "nail-salon-bloom"),
    ];
    const filesPath = candidatePaths.find((c) => fs.existsSync(c));

    if (!filesPath) {
      console.warn(
        `[seed] nail-salon-bloom template not found. Checked: ${candidatePaths.join(", ")}`,
      );
      return;
    }

    const projectDir = (() => {
      const sub = path.join(filesPath, "project");
      return fs.existsSync(sub) ? sub : filesPath;
    })();

    const existing = await db
      .select({ id: templatesTable.id, thumbnail: templatesTable.thumbnail, buildStatus: templatesTable.buildStatus })
      .from(templatesTable)
      .where(eq(templatesTable.filesPath, filesPath))
      .limit(1);

    if (existing.length > 0) {
      const template = existing[0];
      const stale = isDistStale(projectDir);

      if (stale) {
        const oldDist = path.join(projectDir, "dist");
        if (fs.existsSync(oldDist)) {
          fs.rmSync(oldDist, { recursive: true, force: true });
          console.log(`[seed] Removed stale dist/ for nail-salon-bloom (id=${template.id}); triggering rebuild.`);
        }
        await db
          .update(templatesTable)
          .set({ buildStatus: "building", thumbnail: null })
          .where(eq(templatesTable.id, template.id));
        void buildAndScreenshot(template.id, filesPath).catch((err) => {
          console.warn("[seed] nail-salon-bloom rebuild failed:", err);
        });
        return;
      }

      if (!template.thumbnail) {
        console.log(
          `[seed] nail-salon-bloom template ${template.id} has no thumbnail (status=${template.buildStatus ?? "unset"}); rebuilding preview.`,
        );
        void buildAndScreenshot(template.id, filesPath).catch((err) => {
          console.warn("[seed] nail-salon-bloom preview rebuild failed:", err);
        });
      }
      return;
    }

    // First time — insert and build
    const [template] = await db
      .insert(templatesTable)
      .values({
        name: "Nail Salon — Bloom",
        category: "nail_salon",
        description:
          "A mobile-first nail salon template built to convert visitors into bookings. Features real client photo service cards with priority image selection, masonry gallery, AI-matched Google reviews per service, compact hero, sticky booking CTAs, and an About section — all auto-populated from your Certxa store.",
        thumbnail: null,
        filesPath,
        buildStatus: "building",
      })
      .returning({ id: templatesTable.id });

    console.log("[seed] nail-salon-bloom template registered in wb_templates.");
    void buildAndScreenshot(template.id, filesPath).catch((err) => {
      console.warn("[seed] nail-salon-bloom preview build failed:", err);
    });
  } catch (err: any) {
    console.warn("[seed] seedNailSalonBloomTemplate non-fatal error:", err.message);
  }
}
