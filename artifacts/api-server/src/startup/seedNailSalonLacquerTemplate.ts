/**
 * seedNailSalonLacquerTemplate.ts
 *
 * Ensures the "Nail Salon — Lacquer" template is registered in wb_templates
 * and its dist/ reflects the current source (data-wired version).
 *
 * Stale-dist detection: if dist/index.html predates src/context/SiteContext.tsx
 * (the live-data wiring file), the old static build is still being served.
 * In that case we wipe dist/ and trigger a fresh build so the VPS picks it up
 * automatically on the next API restart without any manual intervention.
 *
 * Idempotent: safe to run on every startup.
 */

import path from "path";
import fs from "fs";
import { db, templatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { buildAndScreenshot } from "../lib/screenshot";

function isDistStale(projectDir: string): boolean {
  // The context file was introduced with the data-wiring update.
  // If it's newer than dist/index.html the dist was built from the old static code.
  const contextFile = path.join(projectDir, "src", "context", "SiteContext.tsx");
  const distIndex = path.join(projectDir, "dist", "index.html");

  if (!fs.existsSync(contextFile)) return false; // safety guard
  if (!fs.existsSync(distIndex)) return true;     // no dist at all → rebuild

  const distMtime = fs.statSync(distIndex).mtimeMs;
  const srcMtime  = fs.statSync(contextFile).mtimeMs;
  return srcMtime > distMtime;
}

export async function seedNailSalonLacquerTemplate(): Promise<void> {
  try {
    const candidatePaths = [
      path.resolve(process.cwd(), "templates-storage", "nail-salon-lacquer"),
      path.resolve(process.cwd(), "..", "..", "templates-storage", "nail-salon-lacquer"),
    ];
    const filesPath = candidatePaths.find((c) => fs.existsSync(c));

    if (!filesPath) {
      console.warn(
        `[seed] nail-salon-lacquer template not found. Checked: ${candidatePaths.join(", ")}`,
      );
      return;
    }

    // Resolve the actual project directory (may be filesPath/project/ or filesPath itself)
    const projectDir = (() => {
      const sub = path.join(filesPath, "project");
      return fs.existsSync(sub) ? sub : filesPath;
    })();

    const existing = await db
      .select({
        id: templatesTable.id,
        thumbnail: templatesTable.thumbnail,
        buildStatus: templatesTable.buildStatus,
      })
      .from(templatesTable)
      .where(eq(templatesTable.filesPath, filesPath))
      .limit(1);

    if (existing.length > 0) {
      const template = existing[0];
      const stale = isDistStale(projectDir);

      if (stale) {
        // Wipe the old dist so serveDistFile stops serving stale HTML while
        // buildAndScreenshot rebuilds in the background.
        const oldDist = path.join(projectDir, "dist");
        if (fs.existsSync(oldDist)) {
          fs.rmSync(oldDist, { recursive: true, force: true });
          console.log(`[seed] Removed stale dist/ for nail-salon-lacquer (id=${template.id}); triggering rebuild.`);
        }
        await db
          .update(templatesTable)
          .set({ buildStatus: "building", thumbnail: null })
          .where(eq(templatesTable.id, template.id));
        void buildAndScreenshot(template.id, filesPath).catch((err) => {
          console.warn("[seed] nail-salon-lacquer rebuild failed:", err);
        });
        return;
      }

      if (!template.thumbnail) {
        console.log(
          `[seed] nail-salon-lacquer template ${template.id} has no thumbnail (status=${template.buildStatus ?? "unset"}); rebuilding preview.`,
        );
        void buildAndScreenshot(template.id, filesPath).catch((err) => {
          console.warn("[seed] nail-salon-lacquer preview rebuild failed:", err);
        });
      }
      return;
    }

    // No record yet — insert and build for the first time
    const [template] = await db
      .insert(templatesTable)
      .values({
        name: "Nail Salon — Lacquer",
        category: "nail_salon",
        description:
          "A luxury nail salon template with a rose & warm-taupe palette, Cormorant Garamond serif headings, scroll-reveal animations, category-filtered service grid, live team section, Google reviews, and contact info — all auto-populated from your Certxa store.",
        thumbnail: null,
        filesPath,
        buildStatus: "building",
      })
      .returning({ id: templatesTable.id });

    console.log("[seed] nail-salon-lacquer template registered in wb_templates.");
    void buildAndScreenshot(template.id, filesPath).catch((err) => {
      console.warn("[seed] nail-salon-lacquer preview build failed:", err);
    });
  } catch (err: any) {
    console.warn("[seed] seedNailSalonLacquerTemplate non-fatal error:", err.message);
  }
}
