/**
 * seedSalonLuxeTemplate.ts — the "Nail Salon — Luxe" template (owner, 2026-11-11), made from a Bolt.new design and
 * wired to Certxa like Lacquer (templates-storage/salon-luxe/project/src/context/SiteContext.tsx).
 *
 * Ensures the "Nail Salon — Luxe" template is registered in wb_templates
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

export async function seedSalonLuxeTemplate(): Promise<void> {
  try {
    const candidatePaths = [
      path.resolve(process.cwd(), "templates-storage", "salon-luxe"),
      path.resolve(process.cwd(), "..", "..", "templates-storage", "salon-luxe"),
    ];
    const filesPath = candidatePaths.find((c) => fs.existsSync(c));

    if (!filesPath) {
      console.warn(
        `[seed] salon-luxe template not found. Checked: ${candidatePaths.join(", ")}`,
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
          console.log(`[seed] Removed stale dist/ for salon-luxe (id=${template.id}); triggering rebuild.`);
        }
        await db
          .update(templatesTable)
          .set({ buildStatus: "building", thumbnail: null })
          .where(eq(templatesTable.id, template.id));
        void buildAndScreenshot(template.id, filesPath).catch((err) => {
          console.warn("[seed] salon-luxe rebuild failed:", err);
        });
        return;
      }

      if (!template.thumbnail) {
        console.log(
          `[seed] salon-luxe template ${template.id} has no thumbnail (status=${template.buildStatus ?? "unset"}); rebuilding preview.`,
        );
        void buildAndScreenshot(template.id, filesPath).catch((err) => {
          console.warn("[seed] salon-luxe preview rebuild failed:", err);
        });
      }
      return;
    }

    // No record yet — insert and build for the first time
    const [template] = await db
      .insert(templatesTable)
      .values({
        name: "Nail Salon — Luxe",
        category: "nail_salon",
        description:
          "A premium nail salon template from a Bolt.new design: a full-screen photo hero, Cormorant Garamond headings, rose and gold, six pages (Home, Services, Gallery, About, Reviews, Visit) — the salon's services and prices, photos, reviews, hours, map and Certxa booking, all from your Certxa store. Works for hair salons and barbershops too (their own words and photos).",
        thumbnail: null,
        filesPath,
        buildStatus: "building",
      })
      .returning({ id: templatesTable.id });

    console.log("[seed] salon-luxe template registered in wb_templates.");
    void buildAndScreenshot(template.id, filesPath).catch((err) => {
      console.warn("[seed] salon-luxe preview build failed:", err);
    });
  } catch (err: any) {
    console.warn("[seed] seedSalonLuxeTemplate non-fatal error:", err.message);
  }
}
