/**
 * Service Import Routes — AI-powered menu import from photos/PDF + manual review.
 *
 * POST /api/service-import/upload       — upload images/PDF, create job, fire async AI
 * GET  /api/service-import/jobs         — list jobs for current store
 * GET  /api/service-import/jobs/:id     — get job status + ai_result
 * PATCH /api/service-import/jobs/:id/result — owner edits draft (patches ai_result)
 * POST /api/service-import/publish      — create real services from reviewed ai_result
 */

import { Router, Request, Response } from "express";
import multer from "multer";
import { db, pool } from "../db";
import { sql, eq } from "drizzle-orm";
import { services, serviceCategories, locations } from "@shared/schema";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { uploadToR2 } from "../lib/r2";
import {
  sendServiceImportSuccessEmail,
  sendServiceImportFailureEmail,
  getStoreOwnerContact,
} from "../lib/systemEmails";

const router = Router();

// ─── Auth guard ───────────────────────────────────────────────────────────────
async function requireStore(req: Request, res: Response): Promise<number | null> {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }
  return storeId;
}

// ─── Multer: images + PDFs, up to 10 files, 20 MB each ──────────────────────
const menuUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
      "image/gif",
      "application/pdf",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only images (JPEG/PNG/WebP/HEIC) and PDF files are allowed"));
    }
  },
});

// ─── DB helpers ───────────────────────────────────────────────────────────────
async function getJob(jobId: number, storeId: number) {
  const result = await pool.query(
    `SELECT * FROM service_import_jobs WHERE id = $1 AND store_id = $2 LIMIT 1`,
    [jobId, storeId]
  );
  return result.rows[0] ?? null;
}

async function updateJob(
  jobId: number,
  fields: Record<string, unknown>
) {
  const keys = Object.keys(fields);
  const values = Object.values(fields);
  const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  await pool.query(
    `UPDATE service_import_jobs SET ${setClauses} WHERE id = $1`,
    [jobId, ...values]
  );
}

// ─── Ensure table exists (startup safety) ─────────────────────────────────────
export async function ensureServiceImportTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS service_import_jobs (
      id             SERIAL PRIMARY KEY,
      store_id       INTEGER NOT NULL,
      status         TEXT    NOT NULL DEFAULT 'pending',
      import_type    TEXT    NOT NULL DEFAULT 'photos',
      uploaded_files JSONB   NOT NULL DEFAULT '[]',
      ai_result      JSONB,
      error_message  TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at   TIMESTAMPTZ,
      notified_at    TIMESTAMPTZ
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_sij_store_id ON service_import_jobs(store_id)`
  );
}

// ─── AI extraction ────────────────────────────────────────────────────────────

interface ExtractedService {
  name: string;
  price: number;
  duration: number;
  description?: string;
}

interface ExtractedCategory {
  name: string;
  services: ExtractedService[];
}

interface AIMenuResult {
  categories: ExtractedCategory[];
}

function getOpenAIConfig(): { apiKey: string; baseURL?: string } {
  const directApiKey = process.env.OPENAI_API_KEY?.trim();
  const integrationApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim();

  if (directApiKey) return { apiKey: directApiKey };
  if (integrationApiKey) {
    const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL?.trim();
    return { apiKey: integrationApiKey, ...(baseURL ? { baseURL } : {}) };
  }

  throw new Error("OpenAI API key is not configured");
}

const SYSTEM_PROMPT = `You are a nail salon service menu parser. The owner has uploaded photos or a PDF of their price board. Extract all services you can identify and return ONLY valid JSON.

Normalize service names to standard nail salon terminology:
- "Gel X" / "Gel-X" / "Gel X Full" / "GelX" → "Gel-X Full Set"
- "Fill Acrylic" / "Acrylic Fill In" / "Fill" (in acrylic context) → "Acrylic Fill"
- "SNS" / "Dipping Powder" / "Dip" → "Dipping Powder"
- "OPI Gel" / "Gel Color" / "Shellac" → "Gel Manicure"
- "Basic" / "Regular" / "Traditional" manicure → "Classic Manicure"
- "Hard Gel" / "Hard Gel Full Set" → "Hard Gel Full Set"
- "Polygel" / "Poly Gel" / "Poly-Gel" → "Polygel Full Set"
- "French" suffix → keep "French" in the name (e.g. "Gel French Manicure")
- Add-ons and variations should be captured as separate services within the closest allowed category.
Use ONLY these seven category names: Manicures, Pedicures, Enhancements, Nail Art, Waxing, Threading, Combos.
Never invent another category. Put acrylic, gel, Gel-X, dip, fills, removals, and extensions under Enhancements. Put designs, charms, French tips, and similar add-ons under Nail Art. Put bundled services under Combos.
For duration, estimate in minutes based on service type if not shown (e.g. manicure=45, pedicure=60, acrylic full set=90).
For prices, extract the numeric value only (no $ sign). If a price range is shown (e.g. "$40-50"), use the lower value.
Return ONLY valid JSON with no markdown, no commentary.

JSON format:
{
  "categories": [
    {
      "name": "Manicures",
      "services": [
        { "name": "Classic Manicure", "price": 25, "duration": 45, "description": "" }
      ]
    }
  ]
}`;

/**
 * Extract services from image files using GPT-4o (vision).
 */
async function extractServicesFromImages(
  imageBuffers: { buffer: Buffer; mimeType: string; originalName: string }[]
): Promise<AIMenuResult> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI(getOpenAIConfig());

  const content: any[] = [
    {
      type: "text",
      text: "Please analyze these nail salon price menu photos and extract all services, categories, prices, and durations. Return structured JSON only.",
    },
  ];

  for (const img of imageBuffers) {
    const base64 = img.buffer.toString("base64");
    const mimeType = img.mimeType.startsWith("image/heic") ? "image/jpeg" : img.mimeType;
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${mimeType};base64,${base64}`,
        detail: "high",
      },
    });
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content },
    ],
  });

  return parseAIResponse(completion.choices[0]?.message?.content ?? "");
}

/**
 * Extract services from a PDF file using GPT-5.5 with native PDF understanding.
 * The PDF is uploaded to OpenAI's Files API then referenced in the message.
 */
async function extractServicesFromPDF(
  pdfBuffer: Buffer,
  originalName: string
): Promise<AIMenuResult> {
  const { default: OpenAI, toFile } = await import("openai");
  const openai = new OpenAI(getOpenAIConfig());

  // Upload the PDF to OpenAI Files API so the model can read it natively
  const file = await openai.files.create({
    file: await toFile(pdfBuffer, originalName, { type: "application/pdf" }),
    purpose: "user_data",
  });

  console.log(`[ServiceImport] Uploaded PDF to OpenAI Files API: ${file.id}`);

  let completion: any;
  try {
    completion = await openai.chat.completions.create({
      model: "gpt-5.5",
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Please analyze this nail salon price menu PDF and extract all services, categories, add-ons, variations, and prices. Return structured JSON only.",
            },
            {
              type: "file",
              file: { file_id: file.id },
            } as any,
          ],
        },
      ],
    });
  } finally {
    // Clean up the uploaded file regardless of success/failure
    await openai.files.delete(file.id).catch((e: any) =>
      console.warn(`[ServiceImport] Could not delete OpenAI file ${file.id}:`, e.message)
    );
  }

  return parseAIResponse(completion.choices[0]?.message?.content ?? "");
}

/**
 * Shared JSON response parser — strips markdown fences and validates structure.
 */
function parseAIResponse(raw: string): AIMenuResult {
  const jsonStr = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  const parsed = JSON.parse(jsonStr) as AIMenuResult;

  if (!Array.isArray(parsed.categories)) {
    throw new Error("AI returned unexpected structure — missing categories array");
  }

  return parsed;
}

// ─── Merge helper — combines two AIMenuResult objects, merging same-name categories ──
function mergeMenuResults(base: AIMenuResult, incoming: AIMenuResult): AIMenuResult {
  const merged = { categories: [...base.categories] };
  for (const inCat of incoming.categories) {
    const existing = merged.categories.find(
      c => c.name.toLowerCase() === inCat.name.toLowerCase()
    );
    if (existing) {
      existing.services = [...existing.services, ...inCat.services];
    } else {
      merged.categories.push(inCat);
    }
  }
  return merged;
}

// ─── Async job processor ───────────────────────────────────────────────────────
async function processImportJob(
  jobId: number,
  storeId: number,
  uploadedFiles: { url: string; originalName: string; mimeType: string }[]
) {
  try {
    await updateJob(jobId, { status: "processing" });

    // Download files from their stored URLs for AI processing
    // Files are already stored in R2 / local — fetch them back as buffers
    const allBuffers: { buffer: Buffer; mimeType: string; originalName: string }[] = [];

    for (const file of uploadedFiles) {
      try {
        // If it's a relative /uploads path (local dev), read from disk
        if (file.url.startsWith("/uploads/")) {
          const fs = await import("fs");
          const path = await import("path");
          const diskPath = path.resolve(process.cwd(), "uploads", file.url.slice("/uploads/".length));
          const buffer = fs.readFileSync(diskPath);
          allBuffers.push({ buffer, mimeType: file.mimeType, originalName: file.originalName });
        } else {
          // Fetch from R2 public URL
          const res = await fetch(file.url);
          if (!res.ok) throw new Error(`Failed to fetch ${file.url}: ${res.status}`);
          const arrayBuffer = await res.arrayBuffer();
          allBuffers.push({
            buffer: Buffer.from(arrayBuffer),
            mimeType: file.mimeType,
            originalName: file.originalName,
          });
        }
      } catch (fetchErr: any) {
        console.warn(`[ServiceImport] Could not re-fetch file ${file.url}:`, fetchErr.message);
      }
    }

    if (allBuffers.length === 0) {
      throw new Error("No files could be loaded for AI processing");
    }

    // Route PDFs through GPT-5.5 (native PDF understanding).
    // Images use GPT-4o (vision). If the upload is a mix, run both and merge.
    const pdfBuffers   = allBuffers.filter(f => f.mimeType === "application/pdf");
    const imageBuffers = allBuffers.filter(f => f.mimeType !== "application/pdf");

    let result: AIMenuResult = { categories: [] };

    if (pdfBuffers.length > 0) {
      console.log(`[ServiceImport] Processing ${pdfBuffers.length} PDF(s) with GPT-5.5…`);
      // Process each PDF separately and merge categories
      for (const pdf of pdfBuffers) {
        const pdfResult = await extractServicesFromPDF(pdf.buffer, pdf.originalName);
        result = mergeMenuResults(result, pdfResult);
      }
    }

    if (imageBuffers.length > 0) {
      console.log(`[ServiceImport] Processing ${imageBuffers.length} image(s) with GPT-4o…`);
      const imgResult = await extractServicesFromImages(imageBuffers);
      result = mergeMenuResults(result, imgResult);
    }

    await updateJob(jobId, {
      status: "completed",
      ai_result: JSON.stringify(result),
      completed_at: new Date().toISOString(),
    });

    // Send success email (fire-and-forget)
    const owner = await getStoreOwnerContact(storeId);
    if (owner) {
      const categoryCount = result.categories.length;
      const serviceCount = result.categories.reduce((acc, c) => acc + c.services.length, 0);
      await sendServiceImportSuccessEmail(
        owner.email,
        owner.firstName ?? "there",
        owner.storeName,
        categoryCount,
        serviceCount
      ).catch((e: any) => console.warn("[ServiceImport] Email failed:", e.message));

      await pool
        .query(`UPDATE service_import_jobs SET notified_at = NOW() WHERE id = $1`, [jobId])
        .catch(() => {});
    }
  } catch (err: any) {
    console.error(`[ServiceImport] Job ${jobId} failed:`, err.message);

    // Classify error for friendly messaging
    let friendlyError = err.message ?? "Unknown error";
    if (/json/i.test(friendlyError) || /parse/i.test(friendlyError)) {
      friendlyError =
        "The AI could not read a structured menu from your photos. The images may have been blurry, contained glare, or the prices were not clearly visible. Please try uploading clearer photos.";
    } else if (/api key/i.test(friendlyError)) {
      friendlyError = "AI processing is temporarily unavailable. Please try again later or add your services manually.";
    }

    await updateJob(jobId, {
      status: "failed",
      error_message: friendlyError,
      completed_at: new Date().toISOString(),
    });

    // Send failure email
    const owner = await getStoreOwnerContact(storeId);
    if (owner) {
      await sendServiceImportFailureEmail(
        owner.email,
        owner.firstName ?? "there",
        owner.storeName,
        friendlyError
      ).catch((e: any) => console.warn("[ServiceImport] Failure email failed:", e.message));
    }
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/service-import/upload
 * Accepts up to 10 images or 1 PDF. Creates job + fires async AI processing.
 */
router.post(
  "/upload",
  (req, res, next) => {
    menuUpload.array("files", 10)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      } else if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    const storeId = await requireStore(req, res);
    if (!storeId) return;

    const files = (req.files as Express.Multer.File[]) ?? [];
    const importType = (req.body.importType as string) ?? "photos";

    if (files.length === 0) {
      res.status(400).json({ error: "No files uploaded" });
      return;
    }

    // Upload all files to R2
    const uploadedFiles: { url: string; originalName: string; mimeType: string }[] = [];

    for (const file of files) {
      try {
        const url = await uploadToR2(
          file.buffer,
          `service-import/${storeId}`,
          file.originalname,
          file.mimetype
        );
        uploadedFiles.push({
          url,
          originalName: file.originalname,
          mimeType: file.mimetype,
        });
      } catch (e: any) {
        console.error("[ServiceImport] Upload failed:", e.message);
        res.status(500).json({ error: "Failed to upload file. Please try again." });
        return;
      }
    }

    // Create job record
    const result = await pool.query(
      `INSERT INTO service_import_jobs (store_id, status, import_type, uploaded_files)
       VALUES ($1, 'pending', $2, $3)
       RETURNING id`,
      [storeId, importType, JSON.stringify(uploadedFiles)]
    );
    const jobId: number = result.rows[0].id;

    // Fire async AI processing — do NOT await
    setImmediate(() => {
      processImportJob(jobId, storeId, uploadedFiles).catch((e: any) =>
        console.error("[ServiceImport] Async processor crashed:", e.message)
      );
    });

    res.status(201).json({
      jobId,
      message: "Your menu has been received. Certxa is creating your services in the background.",
      filesUploaded: uploadedFiles.length,
    });
  }
);

/**
 * GET /api/service-import/jobs
 * List all import jobs for the current store.
 */
router.get("/jobs", async (req: Request, res: Response): Promise<void> => {
  const storeId = await requireStore(req, res);
  if (!storeId) return;

  const result = await pool.query(
    `SELECT id, status, import_type, uploaded_files, ai_result, error_message, created_at, completed_at
     FROM service_import_jobs
     WHERE store_id = $1
     ORDER BY created_at DESC
     LIMIT 20`,
    [storeId]
  );

  res.json({ jobs: result.rows });
});

/**
 * GET /api/service-import/jobs/:id
 * Get a specific job's status and AI result.
 */
router.get("/jobs/:id", async (req: Request, res: Response): Promise<void> => {
  const storeId = await requireStore(req, res);
  if (!storeId) return;

  const jobId = parseInt(req.params.id, 10);
  if (isNaN(jobId)) {
    res.status(400).json({ error: "Invalid job ID" });
    return;
  }

  const job = await getJob(jobId, storeId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json({ job });
});

/**
 * PATCH /api/service-import/jobs/:id/result
 * Owner edits the AI result before publishing (update ai_result JSON).
 */
router.patch("/jobs/:id/result", async (req: Request, res: Response): Promise<void> => {
  const storeId = await requireStore(req, res);
  if (!storeId) return;

  const jobId = parseInt(req.params.id, 10);
  if (isNaN(jobId)) {
    res.status(400).json({ error: "Invalid job ID" });
    return;
  }

  const job = await getJob(jobId, storeId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const { aiResult } = req.body;
  if (!aiResult || !Array.isArray(aiResult.categories)) {
    res.status(400).json({ error: "Invalid aiResult structure" });
    return;
  }

  await updateJob(jobId, { ai_result: JSON.stringify(aiResult) });
  res.json({ ok: true });
});

/**
 * POST /api/service-import/publish
 * Creates real service categories + services from the reviewed AI result.
 * Body: { jobId: number, categories: ExtractedCategory[] }
 */
// ─── Allowed Nail Salon Categories (exact order, source of truth) ────────────────
const ALLOWED_NAIL_SALON_CATEGORIES = [
  "Manicures",
  "Pedicures",
  "Enhancements",
  "Nail Art",
  "Waxing",
  "Threading",
  "Combos",
] as const;

type AllowedCategory = (typeof ALLOWED_NAIL_SALON_CATEGORIES)[number];

/**
 * Normalize a category name to one of the 7 allowed nail salon categories.
 * Returns the canonical category name if it matches (case-insensitive), otherwise null.
 */
function normalizeCategoryName(name: string): AllowedCategory | null {
  const trimmed = name.trim();
  const match = ALLOWED_NAIL_SALON_CATEGORIES.find(
    (allowed) => allowed.toLowerCase() === trimmed.toLowerCase()
  );
  return match ?? null;
}

router.post("/publish", async (req: Request, res: Response): Promise<void> => {
  const storeId = await requireStore(req, res);
  if (!storeId) return;

  const { jobId, categories } = req.body as {
    jobId: number;
    categories: ExtractedCategory[];
  };

  if (!Array.isArray(categories) || categories.length === 0) {
    res.status(400).json({ error: "No categories provided" });
    return;
  }

  // Verify job ownership (optional jobId for manual flow where there's no job)
  if (jobId) {
    const job = await getJob(jobId, storeId);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
  }

  let totalCategories = 0;
  let totalServices = 0;

  for (const cat of categories) {
    if (!cat.name?.trim() || !Array.isArray(cat.services) || cat.services.length === 0) {
      continue;
    }

    // Validate category name against allowed nail salon categories
    const canonicalName = normalizeCategoryName(cat.name);
    if (!canonicalName) {
      // Skip categories not in the allowed list — AI importer cannot create arbitrary categories
      console.warn(
        `[ServiceImport] Skipping disallowed category "${cat.name.trim()}" for store ${storeId}. Allowed: ${ALLOWED_NAIL_SALON_CATEGORIES.join(", ")}`
      );
      continue;
    }

    // Create or find category (using canonical name for consistency)
    const [existingCat] = await db
      .select({ id: serviceCategories.id })
      .from(serviceCategories)
      .where(
        sql`store_id = ${storeId} AND lower(name) = lower(${canonicalName})`
      )
      .limit(1);

    let categoryId: number;
    if (existingCat) {
      categoryId = existingCat.id;
    } else {
      const [newCat] = await db
        .insert(serviceCategories)
        .values({ name: canonicalName, storeId })
        .returning({ id: serviceCategories.id });
      categoryId = newCat.id;
      totalCategories++;
    }

    // Create services
    for (const svc of cat.services) {
      if (!svc.name?.trim()) continue;
      const price = String(Math.max(0, Number(svc.price) || 0));
      const duration = Math.max(15, Number(svc.duration) || 60);

      // AI-imported services start as inactive drafts — the owner reviews and activates them
      await db.insert(services).values({
        name:        svc.name.trim(),
        price,
        duration,
        category:    canonicalName,
        categoryId,
        storeId,
        isActive:    false,
        description: svc.description ?? null,
      });

      totalServices++;
    }
  }

  // Mark job as published
  if (jobId) {
    await updateJob(jobId, { status: "published" });
  }

  res.json({
    ok: true,
    categoriesCreated: totalCategories,
    servicesCreated:   totalServices,
  });
});

export default router;
