import { Router } from "express";
import { isAdminAuthenticated } from "../auth";
import { pool } from "../db";
import { isSafeExternalWebsite } from "../lib/salonAccountCreationCore";
import {
  getSalonAccountCreationStatus,
  inspectOneRecord,
  pauseSalonAccountQueue,
  queueEligibleSalonJobs,
  resumeSalonAccountQueue,
  scanSalonSource,
} from "../services/salonAccountCreation";

const router = Router();
router.use(isAdminAuthenticated);

router.get("/status", async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    return res.json(await getSalonAccountCreationStatus());
  } catch (error) {
    console.error("[SalonAccountCreation] status read failed", error instanceof Error ? error.message : "unknown error");
    return res.status(503).json({ message: "Account creation status is unavailable; verify the migration has been applied." });
  }
});

router.get("/logs", async (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50));
  try {
    const result = await pool.query(
      `SELECT id, source_salon_id, event, message, details, created_at
         FROM salon_account_creation_logs ORDER BY id DESC LIMIT $1`, [limit],
    );
    return res.json({ logs: result.rows });
  } catch {
    return res.status(503).json({ message: "Processing logs are unavailable." });
  }
});

// Small, no-write sample check: performs a Places lookup but creates no account or queue job.
router.post("/test-record", async (req, res) => {
  const sourceSalonId = Number(req.body?.sourceSalonId);
  if (!Number.isSafeInteger(sourceSalonId) || sourceSalonId <= 0) return res.status(400).json({ message: "sourceSalonId must be a positive integer" });
  try {
    return res.json({ sample: await inspectOneRecord(sourceSalonId), writesPerformed: false });
  } catch (error) {
    return res.status(502).json({ message: error instanceof Error ? error.message : "Google Places lookup failed" });
  }
});

// Read-only eligibility scan, capped so the admin explicitly controls Google API usage.
router.post("/scan", async (req, res) => {
  const limit = Math.floor(Number(req.body?.limit) || 5);
  if (limit < 1 || limit > 5) return res.status(400).json({ message: "Scan batch must be between 1 and 5 records." });
  try {
    return res.json(await scanSalonSource(limit));
  } catch (error) {
    return res.status(502).json({ message: error instanceof Error ? error.message : "Record scan failed" });
  }
});

router.post("/start", async (req: any, res) => {
  if (req.body?.confirmation !== "START PRODUCTION RUN") {
    return res.status(400).json({ message: "Type START PRODUCTION RUN to confirm account creation." });
  }
  if (req.body?.googleDataPolicyApproved !== true) {
    return res.status(400).json({ message: "An administrator must confirm review of the current Google Places data-use and attribution requirements before starting." });
  }
  try {
    const eligible = await pool.query<{ count: number }>(`SELECT count(*)::int AS count FROM salon_account_creation_jobs WHERE status='eligible'`);
    const userId = String(req.session?.userId ?? "");
    // Queue jobs while the queue remains paused. If Redis is down, fail before recording approval.
    const queued = await queueEligibleSalonJobs();
    await pool.query(
      `UPDATE salon_account_creation_control SET production_approved=true, approved_by=$1,
         approved_at=now(), paused=false, updated_at=now() WHERE singleton=true`, [userId],
    );
    await resumeSalonAccountQueue();
    await pool.query(
      `INSERT INTO salon_account_creation_logs (source_salon_id, event, message, details)
       VALUES (0,'production_run_started','Platform administrator approved and started a production run.',$1::jsonb)`,
      [JSON.stringify({ adminUserId: userId, eligible: Number(eligible.rows[0].count), queued, googleDataPolicyApproved: true })],
    );
    return res.json({ started: true, queued, message: `Production run started. ${queued} currently eligible record(s) were queued; additional records will be scanned/processed automatically at a maximum of 10 account creations per hour.` });
  } catch (error) {
    return res.status(503).json({ message: error instanceof Error ? error.message : "Could not start the account queue" });
  }
});

router.post("/pause", async (_req, res) => {
  try {
    await pauseSalonAccountQueue();
    await pool.query(
      `INSERT INTO salon_account_creation_logs (source_salon_id, event, message)
       VALUES (0,'queue_paused','Platform administrator paused the account creation queue.')`,
    );
    return res.json({ paused: true });
  } catch {
    return res.status(503).json({ message: "Could not pause the account queue." });
  }
});

router.post("/resume", async (_req, res) => {
  try {
    await resumeSalonAccountQueue();
    await pool.query(
      `INSERT INTO salon_account_creation_logs (source_salon_id, event, message)
       VALUES (0,'queue_resumed','Platform administrator resumed the account creation queue.')`,
    );
    return res.json({ paused: false });
  } catch (error) {
    return res.status(409).json({ message: error instanceof Error ? error.message : "Could not resume the account queue." });
  }
});

// A claim is completed only by a platform administrator after independently
// verifying salon ownership and the owner's verified contact details.
router.post("/:jobId/claim", async (req: any, res) => {
  const jobId = Number(req.params.jobId);
  const ownerUserId = String(req.body?.ownerUserId ?? "").trim();
  const verifiedSalonName = String(req.body?.verifiedSalonName ?? "").trim().slice(0, 100);
  const verifiedWebsite = isSafeExternalWebsite(req.body?.verifiedWebsite);
  const verifiedPhone = String(req.body?.verifiedPhone ?? "").trim().slice(0, 32) || null;
  const verifiedAddress = String(req.body?.verifiedAddress ?? "").trim().slice(0, 300) || null;
  if (!Number.isSafeInteger(jobId) || jobId <= 0 || !ownerUserId || verifiedSalonName.length < 2 || req.body?.verifiedOwnership !== true || req.body?.verifiedEmail !== true) {
    return res.status(400).json({ message: "Job ID, owner user ID, salon name confirmed by the owner, and explicit verified ownership/email attestations are required." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const job = await client.query<any>(
      `SELECT id, source_salon_id, store_id, user_id, status FROM salon_account_creation_jobs WHERE id=$1 FOR UPDATE`, [jobId],
    );
    const row = job.rows[0];
    if (!row || !["created", "expired"].includes(row.status) || !row.store_id || !row.user_id) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "This account is not currently claimable." });
    }
    const owner = await client.query<any>(
      `SELECT id, email, phone, account_type, unclaimed_at FROM users WHERE id=$1 FOR UPDATE`, [ownerUserId],
    );
    const user = owner.rows[0];
    if (!user || user.account_type !== "certxa_pro" || user.unclaimed_at || !user.phone || !user.email || user.email.endsWith(".invalid")) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "The verified owner must have an active Certxa Pro account with a real email and verified phone." });
    }
    const otherStore = await client.query(`SELECT 1 FROM locations WHERE user_id=$1 AND id<>$2 LIMIT 1`, [ownerUserId, row.store_id]);
    if (otherStore.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "This Solo account already owns another store; support must review the multi-store claim." });
    }
    await client.query(
      `UPDATE locations SET user_id=$1, email=$2, name=$3, address=$4, phone=$5, website=$6,
         store_latitude=NULL, store_longitude=NULL WHERE id=$7 AND user_id=$8`,
      [ownerUserId, user.email, verifiedSalonName, verifiedAddress, verifiedPhone, verifiedWebsite, row.store_id, row.user_id],
    );
    // On a verified claim, retain only information the owner has just confirmed.
    await client.query(`DELETE FROM business_hours WHERE store_id=$1`, [row.store_id]);
    await client.query(`UPDATE users SET staff_id=(SELECT id FROM staff WHERE store_id=$1 ORDER BY id LIMIT 1), onboarding_completed=true WHERE id=$2`, [row.store_id, ownerUserId]);
    await client.query(`UPDATE salon_account_creation_jobs SET status='claimed', claimed_at=now(), claimed_by_user_id=$2, user_id=$2, google_data_expires_at=NULL, updated_at=now() WHERE id=$1`, [jobId, ownerUserId]);
    await client.query(`UPDATE wb_websites SET name=$1, published=true, published_at=COALESCE(published_at,now()), updated_at=now() WHERE id=$2`, [verifiedSalonName, row.website_id]);
    await client.query(
      `INSERT INTO salon_account_creation_logs (job_id, source_salon_id, event, message, details)
       VALUES ($1,$2,'owner_claimed','Administrator completed an ownership-verified Solo account claim.',$3::jsonb)`,
      [jobId, row.source_salon_id, JSON.stringify({ adminUserId: String(req.session?.userId ?? ""), ownerUserId, verifiedOwnership: true, verifiedEmail: true, ownerProvidedBusinessFields: true })],
    );
    await client.query("COMMIT");
    await pool.query(
      `UPDATE directory_listings SET store_id=$2, claimed_at=now()
        WHERE nail_salon_id=$1 AND opted_out_at IS NULL`, [row.source_salon_id, row.store_id],
    ).catch(() => {});
    await pool.query(`DELETE FROM users WHERE id=$1 AND unclaimed_at IS NOT NULL`, [row.user_id]).catch(() => {});
    return res.json({ claimed: true, storeId: row.store_id });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    return res.status(500).json({ message: error instanceof Error ? error.message : "Could not complete claim" });
  } finally { client.release(); }
});

export default router;
