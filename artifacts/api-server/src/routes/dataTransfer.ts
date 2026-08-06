import { Router } from "express";
import type { Request, Response } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db, pool } from "../db";
import { isAuthenticated } from "../auth";
import {
  clients, clientEmails, clientPhones, clientNotes,
  services, products, giftCards, appointments,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { buildFieldMap, PLATFORM_MAPPINGS } from "../lib/platformMappings";
import type { DataType } from "../lib/platformMappings";
import {
  sendDataTransferCompleteEmail,
  sendDataTransferRejectedEmail,
} from "../lib/systemEmails";
import { broadcastNotification } from "../notifications";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseFile(buffer: Buffer, filename: string): any[] {
  if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws);
  }
  // CSV
  const text = buffer.toString("utf-8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim());
  return lines.slice(1).map((line) => {
    const vals = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) ?? line.split(",");
    const obj: any = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ? String(vals[i]).replace(/^"|"$/g, "").trim() : ""; });
    return obj;
  });
}

function applyMapping(row: any, fieldMap: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [srcCol, appField] of Object.entries(fieldMap)) {
    if (row[srcCol] !== undefined && row[srcCol] !== "") out[appField] = String(row[srcCol]).trim();
  }
  return out;
}

function getUserId(req: Request): string {
  return String((req.user as any)?.id ?? "");
}

// ─── Upload & Preview ────────────────────────────────────────────────────────

const uploadFields = upload.fields([
  { name: "clients", maxCount: 1 },
  { name: "appointments", maxCount: 1 },
  { name: "services", maxCount: 1 },
  { name: "products", maxCount: 1 },
  { name: "giftCards", maxCount: 1 },
]);

router.post("/upload", isAuthenticated, uploadFields, async (req: Request, res: Response) => {
  try {
    const { platform = "csv" } = req.body;
    const files = req.files as Record<string, Express.Multer.File[]>;
    if (!files || Object.keys(files).length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const preview: Record<string, any> = {};
    const mappings: Record<string, Record<string, string>> = {};
    const fileMeta: Array<{ type: string; name: string; rows: number }> = [];

    for (const [dataType, fileArr] of Object.entries(files)) {
      const file = fileArr[0];
      const rows = parseFile(file.buffer, file.originalname);
      if (rows.length === 0) continue;

      const headers = Object.keys(rows[0] ?? {});
      const fieldMap = buildFieldMap(headers, platform, dataType as DataType);

      mappings[dataType] = fieldMap;
      preview[dataType] = {
        totalRows: rows.length,
        headers,
        sample: rows.slice(0, 5),
        detectedMapping: fieldMap,
      };
      fileMeta.push({ type: dataType, name: file.originalname, rows: rows.length });
    }

    return res.json({ platform, files: fileMeta, preview, mappings });
  } catch (err: any) {
    console.error("[dataTransfer] upload error:", err);
    return res.status(500).json({ error: "Upload failed" });
  }
});

// ─── Create Job ──────────────────────────────────────────────────────────────

router.post("/start", isAuthenticated, uploadFields, async (req: Request, res: Response) => {
  try {
    const { storeId, platform = "csv", mode = "self_service", mappings: mappingsRaw } = req.body;
    if (!storeId) return res.status(400).json({ error: "storeId required" });

    const files = req.files as Record<string, Express.Multer.File[]>;
    const parsedMappings = typeof mappingsRaw === "string" ? JSON.parse(mappingsRaw) : (mappingsRaw ?? {});

    const fileData: Record<string, any[]> = {};
    const fileMeta: Array<{ type: string; name: string; rows: number }> = [];
    const previewData: Record<string, any> = {};

    for (const [dataType, fileArr] of Object.entries(files ?? {})) {
      const file = fileArr[0];
      const rows = parseFile(file.buffer, file.originalname);
      fileData[dataType] = rows;

      const headers = Object.keys(rows[0] ?? {});
      const fieldMap = parsedMappings[dataType] ?? buildFieldMap(headers, platform, dataType as DataType);
      parsedMappings[dataType] = fieldMap;

      previewData[dataType] = { totalRows: rows.length, sample: rows.slice(0, 5) };
      fileMeta.push({ type: dataType, name: file.originalname, rows: rows.length });
    }

    const result = await pool.query(
      `INSERT INTO data_transfer_jobs
         (store_id, user_id, mode, status, source_platform, files_json, mapping_json, preview_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [
        Number(storeId),
        getUserId(req),
        mode,
        mode === "self_service" ? "pending_upload" : "pending_review",
        platform,
        JSON.stringify(fileMeta),
        JSON.stringify(parsedMappings),
        JSON.stringify(previewData),
      ]
    );

    const jobId = result.rows[0].id;

    // Store file data temporarily in-memory for immediate self-service execution
    (global as any).__dtjFileData ??= {};
    (global as any).__dtjFileData[jobId] = fileData;

    return res.json({ jobId, mode, status: mode === "self_service" ? "pending_upload" : "pending_review" });
  } catch (err: any) {
    console.error("[dataTransfer] start error:", err);
    return res.status(500).json({ error: "Failed to create transfer job" });
  }
});

// ─── List Jobs ───────────────────────────────────────────────────────────────

router.get("/jobs", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { storeId } = req.query;
    if (!storeId) return res.status(400).json({ error: "storeId required" });
    const result = await pool.query(
      `SELECT id, mode, status, source_platform, files_json, imported_counts_json,
              errors_json, reject_reason, created_at, completed_at
       FROM data_transfer_jobs WHERE store_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [Number(storeId)]
    );
    return res.json(result.rows);
  } catch (err: any) {
    console.error("[dataTransfer] list jobs error:", err);
    return res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

// ─── Get Job ─────────────────────────────────────────────────────────────────

router.get("/jobs/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM data_transfer_jobs WHERE id = $1`,
      [Number(req.params.id)]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Job not found" });
    return res.json(result.rows[0]);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to fetch job" });
  }
});

// ─── Execute (self-service: clients only) ────────────────────────────────────

router.post("/jobs/:id/execute", isAuthenticated, async (req: Request, res: Response) => {
  const jobId = Number(req.params.id);
  let _execStoreId = 0;
  try {
    const jobResult = await pool.query(
      `SELECT * FROM data_transfer_jobs WHERE id = $1`,
      [jobId]
    );
    const job = jobResult.rows[0];
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.mode !== "self_service") {
      return res.status(400).json({ error: "Only self-service jobs can be executed directly" });
    }
    if (!["pending_upload", "pending_review"].includes(job.status)) {
      return res.status(400).json({ error: `Job is in status: ${job.status}` });
    }

    await pool.query(`UPDATE data_transfer_jobs SET status = 'processing' WHERE id = $1`, [jobId]);

    const fileData: Record<string, any[]> = (global as any).__dtjFileData?.[jobId] ?? {};
    const mappings: Record<string, Record<string, string>> = job.mapping_json ?? {};
    const storeId = job.store_id;
    _execStoreId = storeId;
    broadcastNotification({ type: "job_status_updated", storeId, jobId, status: "processing" });

    const importIds: Record<string, number[]> = { clients: [], appointments: [], services: [], products: [], giftCards: [] };
    const counts: Record<string, number> = { clients: 0, skipped: 0, errors: 0 };

    // Import clients only for self-service
    const clientRows = fileData["clients"] ?? [];
    for (const row of clientRows) {
      try {
        const mapped = applyMapping(row, mappings["clients"] ?? {});
        let firstName = mapped.firstName ?? "";
        let lastName = mapped.lastName ?? "";
        if (!firstName && !lastName && mapped.fullName) {
          const parts = mapped.fullName.trim().split(/\s+/);
          firstName = parts[0] ?? "";
          lastName = parts.slice(1).join(" ") ?? "";
        }
        if (!firstName && !lastName) { counts.skipped++; continue; }

        const [inserted] = await db.insert(clients).values({
          storeId,
          firstName: firstName || mapped.fullName?.split(" ")[0] || "Unknown",
          lastName: lastName || "",
          fullName: mapped.fullName || `${firstName} ${lastName}`.trim(),
          dateOfBirth: mapped.dateOfBirth || null,
          gender: (mapped.gender as any) || null,
          allergies: mapped.allergies || null,
          source: "import",
          clientStatus: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        }).returning();

        importIds.clients.push(inserted.id);

        if (mapped.email) {
          await db.insert(clientEmails).values({
            clientId: inserted.id,
            emailAddress: mapped.email,
            isPrimary: true,
            marketingOptIn: true,
          }).onConflictDoNothing();
        }
        if (mapped.phone) {
          await db.insert(clientPhones).values({
            clientId: inserted.id,
            displayPhone: mapped.phone,
            phoneNumberE164: mapped.phone,
            phoneType: "mobile",
            smsOptIn: false,
            isPrimary: true,
          }).onConflictDoNothing();
        }
        if (mapped.notes) {
          await db.insert(clientNotes).values({
            clientId: inserted.id,
            storeId,
            noteType: "import",
            noteContent: mapped.notes,
          });
        }
        counts.clients++;
      } catch {
        counts.errors++;
      }
    }

    await pool.query(
      `UPDATE data_transfer_jobs
       SET status = 'completed', import_ids_json = $1, imported_counts_json = $2, completed_at = now()
       WHERE id = $3`,
      [JSON.stringify(importIds), JSON.stringify(counts), jobId]
    );

    delete (global as any).__dtjFileData?.[jobId];

    broadcastNotification({ type: "job_status_updated", storeId: storeId, jobId, status: "completed" });

    // Notify owner (self-service complete)
    const ownerRow = await pool.query(`SELECT email, first_name FROM users WHERE id = $1`, [job.user_id]);
    if (ownerRow.rows[0]) {
      sendDataTransferCompleteEmail(ownerRow.rows[0].email, ownerRow.rows[0].first_name, counts).catch(() => {});
    }

    return res.json({ success: true, counts });
  } catch (err: any) {
    console.error("[dataTransfer] execute error:", err);
    await pool.query(`UPDATE data_transfer_jobs SET status = 'failed' WHERE id = $1`, [jobId]);
    if (_execStoreId) broadcastNotification({ type: "job_status_updated", storeId: _execStoreId, jobId, status: "failed" });
    return res.status(500).json({ error: err.message ?? "Import failed" });
  }
});

// ─── Rollback ────────────────────────────────────────────────────────────────

router.post("/jobs/:id/rollback", isAuthenticated, async (req: Request, res: Response) => {
  const jobId = Number(req.params.id);
  try {
    const jobResult = await pool.query(
      `SELECT * FROM data_transfer_jobs WHERE id = $1`,
      [jobId]
    );
    const job = jobResult.rows[0];
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.status !== "completed") {
      return res.status(400).json({ error: "Only completed jobs can be rolled back" });
    }

    const ids = job.import_ids_json as Record<string, number[]>;

    // Delete in reverse dependency order
    if (ids.appointments?.length) {
      await db.delete(appointments).where(inArray(appointments.id, ids.appointments));
    }
    if (ids.giftCards?.length) {
      await db.delete(giftCards).where(inArray(giftCards.id, ids.giftCards));
    }
    if (ids.products?.length) {
      await db.delete(products).where(inArray(products.id, ids.products));
    }
    if (ids.services?.length) {
      await db.delete(services).where(inArray(services.id, ids.services));
    }
    if (ids.clients?.length) {
      await db.delete(clients).where(inArray(clients.id, ids.clients));
    }

    await pool.query(
      `UPDATE data_transfer_jobs SET status = 'rolled_back', completed_at = now() WHERE id = $1`,
      [jobId]
    );

    return res.json({ success: true, deleted: Object.fromEntries(Object.entries(ids).map(([k, v]) => [k, v?.length ?? 0])) });
  } catch (err: any) {
    console.error("[dataTransfer] rollback error:", err);
    return res.status(500).json({ error: "Rollback failed" });
  }
});

// ─── Support: List concierge jobs ────────────────────────────────────────────

router.get("/support/queue", async (req: Request, res: Response) => {
  // Require support session (reuse same session key)
  if (!(req.session as any).supportAgentId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const result = await pool.query(`
      SELECT dtj.*, l.name AS store_name, u.email AS user_email,
             u.first_name || ' ' || u.last_name AS user_name
      FROM data_transfer_jobs dtj
      LEFT JOIN locations l ON l.id = dtj.store_id
      LEFT JOIN users u ON u.id = dtj.user_id
      WHERE dtj.mode = 'concierge'
      ORDER BY
        CASE dtj.status WHEN 'pending_review' THEN 0 WHEN 'approved' THEN 1 WHEN 'processing' THEN 2 ELSE 3 END,
        dtj.created_at DESC
      LIMIT 100
    `);
    return res.json(result.rows);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to fetch queue" });
  }
});

router.get("/support/jobs/:id", async (req: Request, res: Response) => {
  if (!(req.session as any).supportAgentId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const result = await pool.query(`
      SELECT dtj.*, l.name AS store_name, u.email AS user_email,
             u.first_name || ' ' || u.last_name AS user_name
      FROM data_transfer_jobs dtj
      LEFT JOIN locations l ON l.id = dtj.store_id
      LEFT JOIN users u ON u.id = dtj.user_id
      WHERE dtj.id = $1
    `, [Number(req.params.id)]);
    if (!result.rows[0]) return res.status(404).json({ error: "Job not found" });
    return res.json(result.rows[0]);
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to fetch job" });
  }
});

// ─── Support: Approve & Execute Full Concierge Import ────────────────────────

router.post("/support/jobs/:id/approve", async (req: Request, res: Response) => {
  if (!(req.session as any).supportAgentId) return res.status(401).json({ error: "Unauthorized" });
  const jobId = Number(req.params.id);
  const agentId = (req.session as any).supportAgentId;

  try {
    const jobResult = await pool.query(`SELECT * FROM data_transfer_jobs WHERE id = $1`, [jobId]);
    const job = jobResult.rows[0];
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (!["pending_review", "approved"].includes(job.status)) {
      return res.status(400).json({ error: `Job cannot be approved from status: ${job.status}` });
    }

    // Mark as processing
    await pool.query(
      `UPDATE data_transfer_jobs SET status = 'processing', reviewed_by_user_id = $1, reviewed_at = now() WHERE id = $2`,
      [agentId, jobId]
    );

    const { review_notes } = req.body;
    if (review_notes) {
      await pool.query(`UPDATE data_transfer_jobs SET review_notes = $1 WHERE id = $2`, [review_notes, jobId]);
    }

    const fileData: Record<string, any[]> = (global as any).__dtjFileData?.[jobId] ?? {};
    const mappings: Record<string, Record<string, string>> = job.mapping_json ?? {};
    const storeId = job.store_id;
    const preview = job.preview_json ?? {};
    broadcastNotification({ type: "job_status_updated", storeId, jobId, status: "processing" });

    // NOTE: for concierge jobs, file data may not be in memory if server restarted.
    // In that case, counts will be 0 and we mark complete without rows.
    // In production this would use persistent file storage (S3/object storage).
    const importIds: Record<string, number[]> = { clients: [], appointments: [], services: [], products: [], giftCards: [] };
    const counts: Record<string, number> = {};

    // Import services
    for (const row of fileData["services"] ?? []) {
      try {
        const m = applyMapping(row, mappings["services"] ?? {});
        if (!m.name) continue;
        const [svc] = await db.insert(services).values({
          storeId,
          name: m.name,
          description: m.description || null,
          duration: parseInt(m.duration) || 60,
          price: m.price || "0",
          category: m.category || "Imported",
        }).returning();
        importIds.services.push(svc.id);
        counts.services = (counts.services ?? 0) + 1;
      } catch { /* skip */ }
    }

    // Import products
    for (const row of fileData["products"] ?? []) {
      try {
        const m = applyMapping(row, mappings["products"] ?? {});
        if (!m.name) continue;
        const [prod] = await db.insert(products).values({
          storeId,
          name: m.name,
          brand: m.brand || null,
          price: m.price || "0",
          purchasePrice: m.purchasePrice || null,
          stock: parseInt(m.stock) || 0,
          category: m.category || null,
          upc: m.upc || null,
        }).returning();
        importIds.products.push(prod.id);
        counts.products = (counts.products ?? 0) + 1;
      } catch { /* skip */ }
    }

    // Import clients
    for (const row of fileData["clients"] ?? []) {
      try {
        const m = applyMapping(row, mappings["clients"] ?? {});
        let firstName = m.firstName ?? "";
        let lastName = m.lastName ?? "";
        if (!firstName && !lastName && m.fullName) {
          const parts = m.fullName.trim().split(/\s+/);
          firstName = parts[0] ?? "";
          lastName = parts.slice(1).join(" ") ?? "";
        }
        if (!firstName && !lastName) continue;

        const [cl] = await db.insert(clients).values({
          storeId,
          firstName: firstName || m.fullName?.split(" ")[0] || "Unknown",
          lastName: lastName || "",
          fullName: m.fullName || `${firstName} ${lastName}`.trim(),
          dateOfBirth: m.dateOfBirth || null,
          gender: (m.gender as any) || null,
          allergies: m.allergies || null,
          source: "import",
          clientStatus: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        }).returning();

        importIds.clients.push(cl.id);
        if (m.email) await db.insert(clientEmails).values({ clientId: cl.id, emailAddress: m.email, isPrimary: true, marketingOptIn: true }).onConflictDoNothing();
        if (m.phone) await db.insert(clientPhones).values({ clientId: cl.id, displayPhone: m.phone, phoneNumberE164: m.phone, phoneType: "mobile", smsOptIn: false, isPrimary: true }).onConflictDoNothing();
        counts.clients = (counts.clients ?? 0) + 1;
      } catch { /* skip */ }
    }

    // Import gift cards
    for (const row of fileData["giftCards"] ?? []) {
      try {
        const m = applyMapping(row, mappings["giftCards"] ?? {});
        if (!m.code || !m.originalAmount) continue;
        const [gc] = await db.insert(giftCards).values({
          storeId,
          code: m.code,
          originalAmount: m.originalAmount,
          remainingBalance: m.remainingBalance ?? m.originalAmount,
          issuedToName: m.issuedToName || null,
          issuedToEmail: m.issuedToEmail || null,
          notes: "Imported via data transfer",
        }).returning();
        importIds.giftCards.push(gc.id);
        counts.giftCards = (counts.giftCards ?? 0) + 1;
      } catch { /* skip */ }
    }

    await pool.query(
      `UPDATE data_transfer_jobs
       SET status = 'completed', import_ids_json = $1, imported_counts_json = $2, completed_at = now()
       WHERE id = $3`,
      [JSON.stringify(importIds), JSON.stringify(counts), jobId]
    );

    delete (global as any).__dtjFileData?.[jobId];

    // Notify owner (concierge complete)
    const ownerRow2 = await pool.query(`SELECT email, first_name FROM users WHERE id = $1`, [job.user_id]);
    if (ownerRow2.rows[0]) {
      sendDataTransferCompleteEmail(ownerRow2.rows[0].email, ownerRow2.rows[0].first_name, counts).catch(() => {});
    }

    broadcastNotification({ type: "job_status_updated", storeId, jobId, status: "completed" });
    return res.json({ success: true, counts });
  } catch (err: any) {
    console.error("[dataTransfer] approve error:", err);
    await pool.query(`UPDATE data_transfer_jobs SET status = 'failed' WHERE id = $1`, [jobId]);
    return res.status(500).json({ error: err.message ?? "Import failed" });
  }
});

router.post("/support/jobs/:id/reject", async (req: Request, res: Response) => {
  if (!(req.session as any).supportAgentId) return res.status(401).json({ error: "Unauthorized" });
  const { reason } = req.body;
  const jobId = Number(req.params.id);
  try {
    const jobResult = await pool.query(`SELECT * FROM data_transfer_jobs WHERE id = $1`, [jobId]);
    const job = jobResult.rows[0];

    await pool.query(
      `UPDATE data_transfer_jobs SET status = 'failed', reject_reason = $1,
       reviewed_by_user_id = $2, reviewed_at = now() WHERE id = $3`,
      [reason ?? "Rejected by support team", (req.session as any).supportAgentId, jobId]
    );

    // Notify the store owner
    if (job) {
      if (job.store_id) broadcastNotification({ type: "job_status_updated", storeId: job.store_id, jobId, status: "failed" });
      const userRow = await pool.query(`SELECT email, first_name FROM users WHERE id = $1`, [job.user_id]);
      if (userRow.rows[0]) {
        sendDataTransferRejectedEmail(
          userRow.rows[0].email,
          userRow.rows[0].first_name,
          reason ?? "Rejected by support team"
        ).catch(() => {});
      }
    }

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: "Reject failed" });
  }
});

router.post("/support/jobs/:id/rollback", async (req: Request, res: Response) => {
  if (!(req.session as any).supportAgentId) return res.status(401).json({ error: "Unauthorized" });
  const jobId = Number(req.params.id);
  try {
    const jobResult = await pool.query(`SELECT * FROM data_transfer_jobs WHERE id = $1`, [jobId]);
    const job = jobResult.rows[0];
    if (!job) return res.status(404).json({ error: "Job not found" });

    const ids = job.import_ids_json as Record<string, number[]>;
    if (ids.appointments?.length) await db.delete(appointments).where(inArray(appointments.id, ids.appointments));
    if (ids.giftCards?.length) await db.delete(giftCards).where(inArray(giftCards.id, ids.giftCards));
    if (ids.products?.length) await db.delete(products).where(inArray(products.id, ids.products));
    if (ids.services?.length) await db.delete(services).where(inArray(services.id, ids.services));
    if (ids.clients?.length) await db.delete(clients).where(inArray(clients.id, ids.clients));

    await pool.query(`UPDATE data_transfer_jobs SET status = 'rolled_back', completed_at = now() WHERE id = $1`, [jobId]);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: "Rollback failed" });
  }
});

export default router;
