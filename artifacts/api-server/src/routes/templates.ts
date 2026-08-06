import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, templatesTable } from "@workspace/db";
import {
  ListTemplatesQueryParams,
  ImportTemplateBody,
  GetTemplateParams,
  DeleteTemplateParams,
} from "@workspace/api-zod";
import path from "path";
import fs from "fs";
import { logger } from "../lib/logger";
import { buildAndScreenshot } from "../lib/screenshot";
import { handleTemplatePreview } from "../lib/template-serve";

const router: IRouter = Router();

const TEMPLATES_DIR = path.resolve(process.cwd(), "templates-storage");
const THUMBNAILS_DIR = path.resolve(process.cwd(), "thumbnails-storage");

function ensureTemplatesDir() {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  }
}

// ── Serve thumbnail images ────────────────────────────────────────────────────
router.get("/templates/thumbnails/:filename", (req, res): void => {
  const raw = Array.isArray(req.params.filename)
    ? req.params.filename[0]
    : req.params.filename;
  // Prevent path traversal
  const filename = path.basename(raw);
  const filePath = path.join(THUMBNAILS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Thumbnail not found" });
    return;
  }

  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.sendFile(filePath);
});

// ── List templates ────────────────────────────────────────────────────────────
router.get("/templates", async (req, res): Promise<void> => {
  try {
    const parsed = ListTemplatesQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    let query = db.select().from(templatesTable).$dynamic();
    if (parsed.data.category) {
      query = query.where(eq(templatesTable.category, parsed.data.category));
    }

    const templates = await query.orderBy(templatesTable.createdAt);
    res.json(templates);
  } catch (err: any) {
    logger.error({ err: err.message }, "Failed to list templates");
    res.status(500).json({ error: "Failed to list templates" });
  }
});

// ── Import template ───────────────────────────────────────────────────────────
router.post("/templates/import", async (req, res): Promise<void> => {
  const parsed = ImportTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name: reqName, category, description: reqDesc, zipBase64 } = parsed.data;

  ensureTemplatesDir();

  // Use a placeholder slug until we detect the real name
  const placeholderSlug = `template-${Date.now()}`;
  const templateDir = path.join(TEMPLATES_DIR, `${placeholderSlug}`);
  fs.mkdirSync(templateDir, { recursive: true });

  try {
    const zipBuffer = Buffer.from(zipBase64, "base64");
    const zipPath = path.join(templateDir, "template.zip");
    fs.writeFileSync(zipPath, zipBuffer);

    try {
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(templateDir, true);
      fs.unlinkSync(zipPath);
      logger.info({ templateDir }, "Template ZIP extracted successfully");
    } catch (zipErr) {
      logger.warn({ zipErr }, "Could not extract zip");
    }
  } catch (err) {
    logger.error({ err }, "Failed to process template zip");
    res.status(500).json({ error: "Failed to process template zip file" });
    return;
  }

  // Auto-detect name and description from package.json if not provided
  let resolvedName = reqName;
  let resolvedDesc = reqDesc;
  if (!resolvedName || !resolvedDesc) {
    try {
      const pkgPaths = [
        path.join(templateDir, "package.json"),
        path.join(templateDir, "project", "package.json"),
      ];
      for (const pkgPath of pkgPaths) {
        if (fs.existsSync(pkgPath)) {
          const pkgRaw = fs.readFileSync(pkgPath, "utf-8");
          const pkg = JSON.parse(pkgRaw);
          if (!resolvedName && pkg.name) {
            resolvedName = pkg.name;
          }
          if (!resolvedDesc && pkg.description) {
            resolvedDesc = pkg.description;
          }
          if (resolvedName && resolvedDesc) break;
        }
      }
    } catch (readErr) {
      logger.warn({ readErr }, "Could not read package.json for auto-detection");
    }
  }

  // Use a readable fallback if no name could be determined
  if (!resolvedName) {
    // Derive name from the ZIP filename
    const zipFilename = (req.headers["x-zip-filename"] as string) || "template";
    resolvedName = zipFilename.replace(/\.zip$/i, "").replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c: string) => c.toUpperCase());
  }

  const templateSlug = resolvedName.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  // Insert record immediately — thumbnail is null until screenshot completes
  const [template] = await db
    .insert(templatesTable)
    .values({
      name: resolvedName,
      category,
      description: resolvedDesc ?? null,
      thumbnail: null,
      filesPath: templateDir,
    })
    .returning();

  res.status(201).json(template);

  // Fire screenshot pipeline in background — do NOT await
  buildAndScreenshot(template.id, templateDir).catch((err) => {
    logger.error({ err, templateId: template.id }, "Background screenshot pipeline failed");
  });
});

// ── Live preview: serve built template dist files ─────────────────────────────
router.get("/templates/:id/preview", handleTemplatePreview);
router.get("/templates/:id/preview/*splat", handleTemplatePreview);

// ── Retrigger screenshot for a template ───────────────────────────────────────
router.post("/templates/:id/retrigger-screenshot", async (req, res): Promise<void> => {
  const params = GetTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [template] = await db
    .select()
    .from(templatesTable)
    .where(eq(templatesTable.id, params.data.id));

  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  if (!template.filesPath || !fs.existsSync(template.filesPath)) {
    res.status(422).json({ error: "Template files not found on disk" });
    return;
  }

  res.json({ message: "Screenshot retrigger started", templateId: template.id });

  buildAndScreenshot(template.id, template.filesPath).catch((err) => {
    logger.error({ err, templateId: template.id }, "Retrigger screenshot pipeline failed");
  });
});

// ── Get single template ───────────────────────────────────────────────────────
router.get("/templates/:id", async (req, res): Promise<void> => {
  const params = GetTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [template] = await db
    .select()
    .from(templatesTable)
    .where(eq(templatesTable.id, params.data.id));

  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  res.json(template);
});

// ── Delete template ───────────────────────────────────────────────────────────
router.delete("/templates/:id", async (req, res): Promise<void> => {
  const params = DeleteTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [template] = await db
    .delete(templatesTable)
    .where(eq(templatesTable.id, params.data.id))
    .returning();

  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  // Clean up extracted files
  if (template.filesPath && fs.existsSync(template.filesPath)) {
    try {
      fs.rmSync(template.filesPath, { recursive: true, force: true });
    } catch (err) {
      logger.warn({ err }, "Could not remove template files");
    }
  }

  res.sendStatus(204);
});

export default router;
