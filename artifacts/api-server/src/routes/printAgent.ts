/**
 * routes/printAgent.ts — Certxa Print Agent (remote check printing to a salon's own printer)
 *
 * The Print Agent is a small Windows tray app on the salon's PC. Certxa queues a PDF (a payroll or
 * contractor check) for the store; the agent, which only ever makes OUTBOUND HTTPS calls, picks it
 * up, prints it silently on the salon's printer, and reports what happened.
 *
 * Owner endpoints (signed-in owner web session, own store only) — /api/print-agent:
 *   GET    /status                 paired computers (online?, printer, version), latest setup code state, recent jobs
 *   POST   /enrollments            "Generate Setup Code": one-time code, 5 minutes, bound to the caller's public IP
 *   POST   /agents/:id/revoke      revoke a computer (kept in the table, marked revoked)
 *   POST   /agents/:id/default     choose which computer prints checks when several are paired
 *   POST   /checks                 start a check print transaction (the check WITHOUT bank details)
 *   POST   /jobs/:id/cancel        cancel a transaction that hasn't been picked up yet
 *
 * Agent endpoints — /api/print-agent/agent:
 *   GET    /time                   server clock, so a PC with a wrong clock can still sign (no auth)
 *   POST   /enroll                 { code, publicKey, signature, … } → device token      (no auth; rate limited)
 *   POST   /heartbeat              printer + version                                      (device auth)
 *   GET    /jobs/next?wait=25      long-poll; atomically claims the oldest queued job and
 *                                  carries the one-time bank-details request for it       (device auth)
 *   POST   /jobs/:id/render        agent answers the request; the reply IS the finished PDF (device auth)
 *   POST   /jobs/:id/ack           PRINT_STARTED | PRINT_WAITING | PRINT_COMPLETED | PRINT_UNCONFIRMED | PRINT_FAILED
 *
 * Pairing (enrollment). The salon slug identifies a salon; it never authorises anything. A computer
 * is authorised only by ALL of:
 *   • a setup code generated inside the owner's signed-in session — 8 characters from a 31-letter
 *     alphabet (~40 bits) from crypto.randomInt, stored only as an HMAC, valid 5 minutes, one use
 *   • the same public IP as the browser that generated it (req.ip behind the one trusted proxy hop)
 *   • at most 5 wrong attempts against that enrollment, after which it is LOCKED for good
 *   • an ECDSA P-256 key pair generated on the PC; the public key is registered and the enrollment
 *     request must be signed with the private key (proof of possession)
 * Consuming the code is a single UPDATE … WHERE status = 'PENDING' …, so two computers racing with
 * the same code cannot both win. Every failure returns the same generic message.
 *
 * Device auth, every request after pairing:
 *   Authorization: Bearer <device token>            (random 256-bit, stored here only as SHA-256)
 *   X-Certxa-Timestamp / X-Certxa-Signature         ECDSA signature over method, URL, time and body
 * so a copied token is useless without the PC's private key, which never leaves the PC.
 *
 * Bank details (routing number, account number, bank name/address) are NEVER stored by Certxa. They
 * live on the salon PC, encrypted by Windows. (The authorized signature image is different: it is
 * already kept on this server by the check-signature feature, and is added to the check here.)
 * One check = one transaction:
 *   1. The owner's browser posts the check WITHOUT bank details → a print_jobs row (payload), 5 minutes to live.
 *   2. The paired agent's long poll claims it (exactly once) and is handed a request: transaction id, a
 *      fresh 256-bit nonce (only its hash is stored), a ~90 second expiry, and the exact fields wanted.
 *   3. The agent answers on its authenticated, signed channel with the nonce and the bank details.
 *      The nonce is consumed in one UPDATE, so an answer is accepted once, from the claiming device,
 *      for its own salon, before the expiry — a replay, a late answer or another salon's device gets 409.
 *   4. That same request handler renders the PDF in memory and returns it as the HTTP response.
 * So the bank details and the finished PDF exist only in the memory of that one request: never in the
 * database, Redis, a queue, a file, object storage, a log line, an error message or anything sent to
 * a browser. Nothing sensitive is held while waiting for the agent, so a timeout or a disconnect
 * leaves nothing to clean up beyond marking the transaction failed.
 *
 * Several computers: a salon may pair more than one. One of them is the computer that prints checks
 * (print_agents.is_default — the first one paired, until the owner picks another). Each transaction is
 * addressed to it (print_jobs.target_agent_id) and only that computer can claim it.
 *
 * Other guarantees:
 *   • A store's jobs only ever reach computers paired to that store (token → agent → store_id).
 *   • At-most-once: a job is handed out exactly once (FOR UPDATE SKIP LOCKED claim, safe across the
 *     pm2 cluster workers). A job that was handed out but never acknowledged is NOT re-sent — a
 *     check must never print twice; the owner sees it as "sent, not confirmed" and decides.
 *   • Revocation takes effect on the device's very next request, including a parked long poll.
 *   • The check payload (no bank details) is erased from the database when the job reaches a final state.
 *   • Logs carry ids and statuses only — never document contents, codes, tokens or keys.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "node:crypto";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import rateLimit from "express-rate-limit";
import { pool } from "../db";
import { resolveSessionStoreId } from "../lib/sessionStore";

const router = Router();

const ENROLLMENT_TTL_MIN = 5;
const ENROLLMENT_MAX_ATTEMPTS = 5;
const JOB_TTL_MIN = 5;               // a check transaction is short-lived: the salon PC must pick it up within this
const BANK_REQUEST_TTL_SEC = 90;     // …and answer the bank-details request within this of claiming it
const MAX_CHECK_PAYLOAD_BYTES = 64 * 1024;
// Exactly what the agent is asked for — and all it is allowed to send.
const BANK_FIELDS = ["routingNumber", "accountNumber", "bankName", "bankAddress", "bankCity"] as const;
// Keys that must never be stored with a check, whatever a browser sends.
const NEVER_STORE_KEYS = ["routing", "account", "routingNumber", "accountNumber", "bankName", "bankAddress", "bankCity", "bankPhone", "signature"];   // (signature: the server adds its own)
const ONLINE_WINDOW_SEC = 90;        // an agent long-polls continuously; silent for this long = offline
const MAX_WAIT_SEC = 25;
const SIGNATURE_SKEW_SEC = 300;
const FINAL_STATUSES = ["PRINTED", "FAILED", "CANCELLED", "EXPIRED", "UNCONFIRMED"];

// No 0/O, 1/I/L — nothing a person can misread off a screen.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 8;

const GENERIC_ENROLL_ERROR = "Unable to connect this computer. Please generate a new setup code in Certxa and try again.";

const sha256 = (data: Buffer | string) => crypto.createHash("sha256").update(data).digest("hex");

/** Setup codes are low-entropy by nature, so they are stored as a keyed hash: a copy of the table alone can't be brute-forced. */
function hashSetupCode(code: string): string {
  const secret = process.env.PRINT_AGENT_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error("PRINT_AGENT_SECRET or SESSION_SECRET must be configured");
  return crypto.createHmac("sha256", secret).update("print-agent-setup-code:" + code).digest("hex");
}

const normalizeSetupCode = (raw: unknown) => String(raw ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");

function newSetupCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
}

/**
 * The caller's public IP as Express resolved it through the one trusted proxy hop (auth.ts sets
 * `trust proxy` to 1) — never anything the client put in the body. IPv4-mapped IPv6 collapses to
 * IPv4. A real IPv6 address is reduced to its /64 network, because each device on a salon's network
 * has its own (and rotating) IPv6 address while sharing the prefix.
 */
export function normalizeIp(raw: string | undefined | null): string | null {
  let ip = String(raw ?? "").trim().toLowerCase();
  if (!ip) return null;
  if (ip.startsWith("::ffff:") && net.isIPv4(ip.slice(7))) ip = ip.slice(7);
  if (net.isIPv4(ip)) return ip;
  if (!net.isIPv6(ip)) return null;
  const zone = ip.indexOf("%");
  if (zone >= 0) ip = ip.slice(0, zone);
  const [head, tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h;
  if (groups.length !== 8) return null;
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

const callerIp = (req: Request) => normalizeIp(req.ip);

// ─── Device keys (ECDSA P-256) ────────────────────────────────────────────────

const B64URL_32_BYTES = /^[A-Za-z0-9_-]{43}$/;

/** Builds the key object from the agent's {x, y}; null unless it is a well-formed P-256 point. */
function importPublicKey(x: unknown, y: unknown): crypto.KeyObject | null {
  if (typeof x !== "string" || typeof y !== "string" || !B64URL_32_BYTES.test(x) || !B64URL_32_BYTES.test(y)) return null;
  try { return crypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x, y }, format: "jwk" }); } catch { return null; }
}

function verifySignature(key: crypto.KeyObject, message: string, signatureB64: unknown): boolean {
  if (typeof signatureB64 !== "string") return false;
  try {
    const signature = Buffer.from(signatureB64, "base64");
    if (signature.length !== 64) return false;   // r || s
    return crypto.verify("sha256", Buffer.from(message, "utf8"), { key, dsaEncoding: "ieee-p1363" }, signature);
  } catch { return false; }
}

const timestampIsFresh = (raw: unknown) => {
  const t = Number(raw);
  return Number.isFinite(t) && Math.abs(Date.now() / 1000 - t) <= SIGNATURE_SKEW_SEC;
};

// ─── Owner side ───────────────────────────────────────────────────────────────

/**
 * The signed-in OWNER's store id, or null after replying. Same rules as the check signature: a real
 * owner web session only — never a technician (staff) login and never a native-app Bearer token.
 */
async function ownerStore(req: Request, res: Response): Promise<{ storeId: number; userId: string } | null> {
  const session = req.session as any;
  if (!session?.userId || session?.staffId || String(req.headers.authorization ?? "").startsWith("Bearer ")) {
    res.status(403).json({ error: "Only the salon owner can manage the salon printer." });
    return null;
  }
  const storeId = await resolveSessionStoreId(req);
  if (storeId) {
    const owned = await pool.query(`SELECT 1 FROM locations WHERE id = $1 AND user_id = $2 LIMIT 1`, [storeId, session.userId]);
    if (owned.rows.length) return { storeId, userId: String(session.userId) };
  }
  res.status(403).json({ error: "Only the salon owner can manage the salon printer." });
  return null;
}

/** Lazy housekeeping before reads: overdue setup codes and overdue queued jobs get their final status. */
async function expireStale(storeId?: number): Promise<void> {
  await pool.query(`UPDATE print_agent_enrollments SET status = 'EXPIRED' WHERE status = 'PENDING' AND expires_at <= now()`);
  if (storeId === undefined) return;
  await pool.query(
    `UPDATE print_jobs
        SET status = 'EXPIRED', payload = NULL, finished_at = now(),
            status_message = 'The salon computer did not pick this up in time. Check that it is on and connected.'
      WHERE store_id = $1 AND status = 'QUEUED' AND expires_at <= now()`,
    [storeId],
  );
  // Claimed, but the agent never answered the bank-details request in time. Nothing sensitive was ever held.
  await pool.query(
    `UPDATE print_jobs
        SET status = 'FAILED', payload = NULL, bank_nonce_hash = NULL, finished_at = now(),
            status_message = 'The salon computer did not respond in time. Nothing was printed.'
      WHERE store_id = $1 AND status = 'SENT' AND bank_nonce_hash IS NOT NULL AND bank_request_expires_at <= now()`,
    [storeId],
  );
}

router.get("/status", async (req, res) => {
  try {
    const owner = await ownerStore(req, res);
    if (!owner) return;
    await expireStale(owner.storeId);

    const [agents, enrollment, jobs, store] = await Promise.all([
      pool.query(
        `SELECT id, machine_name AS "machineName", printer_name AS "printerName", printer_status AS "printerStatus",
                agent_version AS "agentVersion", last_seen_at AS "lastSeenAt", created_at AS "pairedAt",
                revoked_at AS "revokedAt", bank_ready AS "bankReady", (is_default AND revoked_at IS NULL) AS "isDefault",
                (revoked_at IS NULL AND last_seen_at IS NOT NULL AND last_seen_at > now() - make_interval(secs => $2)) AS online
           FROM print_agents
          WHERE store_id = $1 AND (revoked_at IS NULL OR revoked_at > now() - interval '90 days')
          ORDER BY (revoked_at IS NOT NULL), created_at DESC`,
        [owner.storeId, ONLINE_WINDOW_SEC],
      ),
      // The newest setup code's state (never the code itself) so the page can show "connected" / "expired".
      pool.query(
        `SELECT id, status, expires_at AS "expiresAt", paired_device_id AS "pairedDeviceId"
           FROM print_agent_enrollments
          WHERE store_id = $1
          ORDER BY created_at DESC
          LIMIT 1`,
        [owner.storeId],
      ),
      pool.query(
        `SELECT id, document_type AS "documentType", title, copies, status, status_message AS "statusMessage",
                created_at AS "createdAt", finished_at AS "finishedAt"
           FROM print_jobs
          WHERE store_id = $1
          ORDER BY created_at DESC
          LIMIT 25`,
        [owner.storeId],
      ),
      pool.query(`SELECT name FROM locations WHERE id = $1`, [owner.storeId]),
    ]);
    res.json({ storeName: store.rows[0]?.name ?? null, agents: agents.rows, enrollment: enrollment.rows[0] ?? null, jobs: jobs.rows });
  } catch (err) {
    console.error("[print-agent/status]", err);
    res.status(500).json({ error: "Could not load the salon printer status." });
  }
});

// An owner clicking the button repeatedly is fine; a script minting codes is not.
const enrollmentCreateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many setup codes requested. Wait a few minutes and try again." },
});

router.post("/enrollments", enrollmentCreateLimiter, async (req, res) => {
  try {
    const owner = await ownerStore(req, res);
    if (!owner) return;
    const ip = callerIp(req);
    if (!ip) return res.status(400).json({ error: "Could not create a setup code from this connection." });

    // One live code per store: asking again retires the previous one.
    await pool.query(`UPDATE print_agent_enrollments SET status = 'CANCELLED' WHERE store_id = $1 AND status = 'PENDING'`, [owner.storeId]);

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newSetupCode();
      const inserted = await pool.query(
        `INSERT INTO print_agent_enrollments (store_id, code_hash, requesting_ip, created_by, max_attempts, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + make_interval(mins => $6))
         ON CONFLICT (code_hash) DO NOTHING
         RETURNING id, expires_at AS "expiresAt"`,
        [owner.storeId, hashSetupCode(code), ip, owner.userId, ENROLLMENT_MAX_ATTEMPTS, ENROLLMENT_TTL_MIN],
      );
      if (inserted.rows.length) {
        console.log(`[print-agent] setup code generated for store ${owner.storeId} (enrollment ${inserted.rows[0].id})`);
        // The only time the code itself ever leaves the server.
        return res.status(201).json({
          enrollmentId: inserted.rows[0].id,
          code: `${code.slice(0, 4)}-${code.slice(4)}`,
          expiresAt: inserted.rows[0].expiresAt,
        });
      }
    }
    res.status(500).json({ error: "Could not create a setup code. Try again." });
  } catch (err) {
    console.error("[print-agent/enrollments]", err);
    res.status(500).json({ error: "Could not create a setup code." });
  }
});

router.post("/agents/:id/revoke", async (req, res) => {
  try {
    const owner = await ownerStore(req, res);
    if (!owner) return;
    // The row stays (auditable); its token and key simply stop being accepted, on the very next request.
    const done = await pool.query(
      `UPDATE print_agents SET revoked_at = now(), revoked_by = $3
        WHERE id = $1 AND store_id = $2 AND revoked_at IS NULL RETURNING id`,
      [Number(req.params.id), owner.storeId, owner.userId],
    );
    if (!done.rows.length) return res.status(404).json({ error: "That computer is not connected." });
    console.log(`[print-agent] computer ${done.rows[0].id} revoked for store ${owner.storeId}`);
    await ensureDefaultComputer(owner.storeId);
    res.json({ ok: true });
  } catch (err) {
    console.error("[print-agent/agents revoke]", err);
    res.status(500).json({ error: "Could not revoke that computer." });
  }
});

/**
 * If the salon has no check-printing computer chosen and exactly one connected, that one is it.
 * (With two or more and none chosen, the owner decides — nothing is picked for them.)
 */
async function ensureDefaultComputer(storeId: number): Promise<void> {
  try {
    await pool.query(
      `UPDATE print_agents SET is_default = true
        WHERE store_id = $1 AND revoked_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM print_agents WHERE store_id = $1 AND revoked_at IS NULL AND is_default)
          AND (SELECT count(*) FROM print_agents WHERE store_id = $1 AND revoked_at IS NULL) = 1`,
      [storeId],
    );
  } catch { /* two enrollments racing: the unique index lets only one become the default */ }
}

router.post("/agents/:id/default", async (req, res) => {
  try {
    const owner = await ownerStore(req, res);
    if (!owner) return;
    const id = Number(req.params.id);
    const exists = await pool.query(`SELECT 1 FROM print_agents WHERE id = $1 AND store_id = $2 AND revoked_at IS NULL`, [id, owner.storeId]);
    if (!exists.rows.length) return res.status(404).json({ error: "That computer is not connected." });
    // Two steps: at most one default per salon is enforced by a unique index.
    await pool.query(`UPDATE print_agents SET is_default = false WHERE store_id = $1 AND is_default AND id <> $2`, [owner.storeId, id]);
    await pool.query(`UPDATE print_agents SET is_default = true WHERE id = $1 AND store_id = $2 AND revoked_at IS NULL`, [id, owner.storeId]);
    console.log(`[print-agent] computer ${id} chosen to print checks for store ${owner.storeId}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[print-agent/agents default]", (err as Error)?.name);
    res.status(500).json({ error: "Could not change which computer prints checks." });
  }
});

const checkCreateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many checks sent at once. Wait a few minutes and try again." },
});

/**
 * Starts a check print transaction. The body carries the check as the Print Checks page built it,
 * MINUS bank details — and any bank-looking key is stripped here regardless, so they cannot reach
 * the database even if a browser sends them.
 */
router.post("/checks", checkCreateLimiter, async (req, res) => {
  try {
    const owner = await ownerStore(req, res);
    if (!owner) return;

    const clientRequestId = String(req.body?.clientRequestId ?? "").trim();
    if (!/^[0-9a-f-]{16,64}$/i.test(clientRequestId)) return res.status(400).json({ error: "A request id is required." });

    const raw = req.body?.check;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return res.status(400).json({ error: "The check is missing." });
    const check: Record<string, unknown> = { ...raw };
    for (const key of NEVER_STORE_KEYS) delete check[key];

    const checkNumber = String(check.checkNumber ?? "").trim();
    const payee = String(check.payee ?? "").trim();
    const amount = Number(check.amount);
    if (!/^\d{1,12}$/.test(checkNumber) || !payee || payee.length > 120 || !Number.isFinite(amount) || amount < 0 || amount >= 10_000_000) {
      return res.status(400).json({ error: "The check is missing its number, payee or amount." });
    }
    const payload = JSON.stringify(check);
    if (Buffer.byteLength(payload) > MAX_CHECK_PAYLOAD_BYTES) return res.status(400).json({ error: "That check is too large to print." });

    const paired = await pool.query(
      `SELECT id, is_default AS "isDefault" FROM print_agents WHERE store_id = $1 AND revoked_at IS NULL ORDER BY is_default DESC, created_at`,
      [owner.storeId],
    );
    if (!paired.rows.length) return res.status(409).json({ error: "No salon computer is connected yet.", code: "NO_AGENT" });
    // Addressed to the computer chosen to print checks (or the only one). With several and none chosen: any of them.
    const targetAgentId: number | null = paired.rows[0].isDefault || paired.rows.length === 1 ? paired.rows[0].id : null;

    // The same request id (a double click, a retried request) returns the transaction that already exists.
    const inserted = await pool.query(
      `INSERT INTO print_jobs (store_id, document_type, title, copies, payload, client_request_id, created_by, expires_at, target_agent_id)
       VALUES ($1, 'check', $2, 1, $3::jsonb, $4, $5, now() + make_interval(mins => $6), $7)
       ON CONFLICT (store_id, client_request_id) WHERE client_request_id IS NOT NULL DO NOTHING
       RETURNING id, status, created_at AS "createdAt"`,
      [owner.storeId, `Check #${checkNumber} – ${payee}`.slice(0, 120), payload, clientRequestId, owner.userId, JOB_TTL_MIN, targetAgentId],
    );
    if (!inserted.rows.length) {
      const existing = await pool.query(
        `SELECT id, status, created_at AS "createdAt" FROM print_jobs WHERE store_id = $1 AND client_request_id = $2`,
        [owner.storeId, clientRequestId],
      );
      return res.status(200).json({ ...existing.rows[0], duplicate: true });
    }
    console.log(`[print-agent] check transaction ${inserted.rows[0].id} started for store ${owner.storeId}`);
    res.status(201).json(inserted.rows[0]);
  } catch (err) {
    console.error("[print-agent/checks create]", (err as Error)?.name);
    res.status(500).json({ error: "Could not send the check to the salon printer." });
  }
});

router.post("/jobs/:id/cancel", async (req, res) => {
  try {
    const owner = await ownerStore(req, res);
    if (!owner) return;
    const done = await pool.query(
      `UPDATE print_jobs SET status = 'CANCELLED', payload = NULL, finished_at = now(), status_message = 'Cancelled before printing.'
        WHERE id = $1 AND store_id = $2 AND status = 'QUEUED' RETURNING id`,
      [String(req.params.id), owner.storeId],
    );
    if (!done.rows.length) return res.status(409).json({ error: "That job has already been sent to the printer." });
    res.json({ ok: true });
  } catch (err) {
    console.error("[print-agent/jobs cancel]", err);
    res.status(500).json({ error: "Could not cancel that job." });
  }
});

// ─── Enrollment (pairing) ─────────────────────────────────────────────────────

// Per-IP ceiling on guesses, on top of the per-enrollment attempt limit below.
const enrollLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: GENERIC_ENROLL_ERROR },
});

/**
 * A failed attempt counts against the enrollment the code named (if any) AND against every live
 * enrollment requested from the caller's network — a wrong guess can't name its target, so guesses
 * from the salon's own network burn that salon's pending code. At max_attempts it is LOCKED.
 */
async function recordFailedEnrollment(codeHash: string, ip: string | null): Promise<void> {
  const locked = await pool.query(
    `UPDATE print_agent_enrollments
        SET attempts = attempts + 1,
            status = CASE WHEN attempts + 1 >= max_attempts THEN 'LOCKED' ELSE status END
      WHERE status = 'PENDING' AND expires_at > now() AND (code_hash = $1 OR requesting_ip = $2)
      RETURNING id, status`,
    [codeHash, ip ?? ""],
  );
  for (const row of locked.rows) {
    if (row.status === "LOCKED") console.warn(`[print-agent] enrollment ${row.id} locked after too many failed attempts`);
  }
}

// Signatures carry a timestamp; a salon PC with a wrong clock would otherwise never be able to pair.
// The agent reads the server's time here and signs with that. Not a secret.
router.get("/agent/time", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ now: Math.floor(Date.now() / 1000) });
});

router.post("/agent/enroll", enrollLimiter, async (req, res) => {
  const fail = () => res.status(403).json({ error: GENERIC_ENROLL_ERROR });
  try {
    const code = normalizeSetupCode(req.body?.code);
    const installationId = String(req.body?.installationId ?? "").trim();
    const timestamp = String(req.body?.timestamp ?? "");
    const ip = callerIp(req);
    const codeHash = hashSetupCode(code);
    await expireStale();

    // 1. The device must hold the private key for the public key it is registering.
    const publicKey = importPublicKey(req.body?.publicKey?.x, req.body?.publicKey?.y);
    const wellFormed = code.length === CODE_LENGTH && /^[0-9a-f-]{8,64}$/i.test(installationId) && !!publicKey && !!ip
      && timestampIsFresh(timestamp)
      && verifySignature(publicKey!, `certxa-print-agent-enroll\n${code}\n${installationId}\n${timestamp}`, req.body?.signature);
    if (!wellFormed) {
      await recordFailedEnrollment(codeHash, ip);
      console.warn(`[print-agent] enrollment attempt rejected`);
      return fail();
    }

    // 2. Consume the code. One statement, so exactly one caller can ever win a given code: it must be
    //    PENDING, unexpired, under its attempt limit, requested from this same IP, for an active salon.
    const consumed = await pool.query(
      `UPDATE print_agent_enrollments e
          SET status = 'USED', used_at = now()
         FROM locations l
        WHERE e.code_hash = $1 AND e.status = 'PENDING' AND e.expires_at > now()
          AND e.attempts < e.max_attempts AND e.requesting_ip = $2
          AND l.id = e.store_id
          AND lower(coalesce(l.account_status, 'active')) NOT IN ('suspended', 'canceled', 'cancelled')
        RETURNING e.id, e.store_id AS "storeId", l.name AS "storeName", l.booking_slug AS slug`,
      [codeHash, ip],
    );
    if (!consumed.rows.length) {
      await recordFailedEnrollment(codeHash, ip);
      console.warn(`[print-agent] enrollment attempt rejected`);
      return fail();
    }
    const { id: enrollmentId, storeId, storeName, slug } = consumed.rows[0];

    // 3. Register the computer and hand it its credential.
    const token = crypto.randomBytes(32).toString("base64url");
    const device = await pool.query(
      `INSERT INTO print_agents (store_id, installation_id, machine_name, public_key, token_hash, agent_version, paired_ip, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       RETURNING id`,
      [storeId, installationId, String(req.body?.machineName ?? "").trim().slice(0, 80) || null,
       JSON.stringify({ kty: "EC", crv: "P-256", x: req.body.publicKey.x, y: req.body.publicKey.y }),
       sha256(token), String(req.body?.version ?? "").trim().slice(0, 20) || null, ip],
    );
    await pool.query(`UPDATE print_agent_enrollments SET paired_device_id = $2 WHERE id = $1`, [enrollmentId, device.rows[0].id]);
    await ensureDefaultComputer(storeId);   // the salon's first computer is the one that prints checks

    console.log(`[print-agent] computer ${device.rows[0].id} enrolled for store ${storeId} (enrollment ${enrollmentId})`);
    res.json({ token, deviceId: device.rows[0].id, slug, storeName });
  } catch (err) {
    console.error("[print-agent/enroll]", err);
    fail();
  }
});

// ─── Agent side ───────────────────────────────────────────────────────────────

interface AgentContext { id: number; storeId: number }

/** Device token + a fresh signature from the device's private key over this exact request. */
async function agentAuth(req: Request, res: Response, next: NextFunction) {
  const deny = () => res.status(401).json({ error: "This computer is not connected to Certxa." });
  try {
    const header = String(req.headers.authorization ?? "");
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return deny();

    const found = await pool.query(
      `SELECT id, store_id AS "storeId", public_key AS "publicKey" FROM print_agents WHERE token_hash = $1 AND revoked_at IS NULL`,
      [sha256(token)],
    );
    if (!found.rows.length) return deny();

    const timestamp = String(req.headers["x-certxa-timestamp"] ?? "");
    const jwk = JSON.parse(found.rows[0].publicKey);
    const key = importPublicKey(jwk.x, jwk.y);
    const body: Buffer = (req as any).rawBody ?? Buffer.alloc(0);
    const message = `${req.method}\n${req.originalUrl}\n${timestamp}\n${sha256(body)}`;
    if (!key || !timestampIsFresh(timestamp) || !verifySignature(key, message, req.headers["x-certxa-signature"])) return deny();

    await pool.query(`UPDATE print_agents SET last_seen_at = now() WHERE id = $1`, [found.rows[0].id]);
    (req as any).printAgent = { id: found.rows[0].id, storeId: found.rows[0].storeId } as AgentContext;
    next();
  } catch (err) {
    console.error("[print-agent/auth]", (err as Error)?.name);
    res.status(500).json({ error: "Could not verify this computer." });
  }
}

const agentOf = (req: Request) => (req as any).printAgent as AgentContext;

router.post("/agent/heartbeat", agentAuth, async (req, res) => {
  try {
    const agent = agentOf(req);
    const updated = await pool.query(
      `UPDATE print_agents a
          SET printer_name = $2, printer_status = $3, agent_version = COALESCE($4, a.agent_version), bank_ready = $5
         FROM locations l
        WHERE a.id = $1 AND l.id = a.store_id
        RETURNING l.booking_slug AS slug, l.name AS "storeName"`,
      [agent.id, String(req.body?.printerName ?? "").trim().slice(0, 200) || null,
       String(req.body?.printerStatus ?? "").trim().slice(0, 80) || null,
       String(req.body?.version ?? "").trim().slice(0, 20) || null,
       req.body?.bankReady === true],
    );
    res.json({ ok: true, ...updated.rows[0] });
  } catch (err) {
    console.error("[print-agent/heartbeat]", (err as Error)?.name);
    res.status(500).json({ error: "Heartbeat failed." });
  }
});

/**
 * Atomically hands the oldest queued transaction of the agent's store to this agent — exactly once —
 * and issues the one-time bank-details request for it. Only the nonce's hash is stored.
 */
async function claimNextJob(agent: AgentContext) {
  const nonce = crypto.randomBytes(32).toString("base64url");
  const claimed = await pool.query(
    `UPDATE print_jobs j
        SET status = 'SENT', agent_id = $2, claimed_at = now(),
            bank_nonce_hash = $3, bank_request_expires_at = now() + make_interval(secs => $4)
       FROM locations l
      WHERE j.id = (
              SELECT id FROM print_jobs
               WHERE store_id = $1 AND status = 'QUEUED' AND expires_at > now()
                 AND (target_agent_id IS NULL OR target_agent_id = $2)
               ORDER BY created_at
               FOR UPDATE SKIP LOCKED
               LIMIT 1)
        AND l.id = j.store_id
        AND EXISTS (SELECT 1 FROM print_agents WHERE id = $2 AND store_id = $1 AND revoked_at IS NULL)
      RETURNING j.id, j.document_type AS "documentType", j.copies,
                extract(epoch FROM j.bank_request_expires_at)::bigint AS "expiresAt", l.booking_slug AS slug`,
    [agent.storeId, agent.id, sha256(nonce), BANK_REQUEST_TTL_SEC],
  );
  const job = claimed.rows[0];
  if (!job) return null;
  return {
    id: job.id,
    documentType: job.documentType,
    copies: job.copies,
    bankRequest: {
      transactionId: job.id,
      nonce,
      expiresAt: Number(job.expiresAt),
      fields: BANK_FIELDS,
      deviceId: agent.id,
      storeSlug: job.slug,
    },
  };
}

router.get("/agent/jobs/next", agentAuth, async (req, res) => {
  const agent = agentOf(req);
  const waitSec = Math.min(Math.max(parseInt(String(req.query.wait ?? "0"), 10) || 0, 0), MAX_WAIT_SEC);
  const deadline = Date.now() + waitSec * 1000;
  let gone = false;
  req.on("close", () => { gone = true; });

  try {
    for (;;) {
      if (gone) return;                       // agent went away — claim nothing on its behalf
      const job = await claimNextJob(agent);
      if (job) return res.json(job);
      if (Date.now() >= deadline) return res.status(204).end();
      await new Promise((resolve) => setTimeout(resolve, 2000));
      // Stay "online" while parked in a long poll — and drop the connection the moment the owner revokes.
      const alive = await pool.query(`UPDATE print_agents SET last_seen_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING id`, [agent.id]);
      if (!alive.rows.length) return res.status(401).json({ error: "This computer is not connected to Certxa." });
    }
  } catch (err) {
    console.error("[print-agent/jobs next]", (err as Error)?.name);
    if (!res.headersSent) res.status(500).json({ error: "Could not check for print jobs." });
  }
});

// ─── Rendering the check with the agent's bank details ────────────────────────

type RenderCheckPdf = (props: Record<string, unknown>) => Promise<Buffer>;
let rendererPromise: Promise<RenderCheckPdf> | null = null;

/**
 * The check document itself lives with the web app (booking/src/components/pdf/CheckDocumentPDF.tsx)
 * so a printed check and a downloaded one are the same layout. api-server/build.mjs bundles it for
 * Node as booking/dist-server/checkPdfServer.mjs, next to the packages it needs.
 */
function loadRenderer(): Promise<RenderCheckPdf> {
  if (!rendererPromise) {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const file = process.env.CHECK_PDF_RENDERER || path.resolve(here, "../../booking/dist-server/checkPdfServer.mjs");
    rendererPromise = import(pathToFileURL(file).href).then((m) => m.renderCheckPdf as RenderCheckPdf);
    rendererPromise.catch(() => { rendererPromise = null; });
  }
  return rendererPromise;
}

/**
 * Nine digits. The ABA checksum is deliberately NOT enforced here: the Print Agent warns the owner
 * when a number fails it and lets them confirm, and that decision stands.
 */
function isValidRoutingNumber(r: string): boolean {
  return /^\d{9}$/.test(r) && r !== "000000000";
}

const cleanText = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

/** A PNG's pixel size from its IHDR header; null if the bytes are not a PNG. */
function pngSize(png: Buffer): { width: number; height: number } | null {
  if (png.length < 24 || png.readUInt32BE(0) !== 0x89504e47 || png.readUInt32BE(4) !== 0x0d0a1a0a || png.toString("latin1", 12, 16) !== "IHDR") return null;
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  return width > 0 && height > 0 && width <= 6000 && height <= 6000 ? { width, height } : null;
}

const signatureDir = () => process.env.CHECK_SIGNATURE_DIR || "/var/lib/certxa/check-signatures";

/**
 * The salon's authorized signature for the check, exactly as the check-signature feature stores it
 * (lib/checkSignature.ts: store-<id>.png plus the owner's nudge/size in store-<id>.json). Read-only
 * here. null when the salon has none on file — the check then prints with a plain signature line.
 */
async function readStoreSignature(storeId: number): Promise<Record<string, unknown> | null> {
  let png: Buffer;
  try { png = await fs.promises.readFile(path.join(signatureDir(), `store-${Number(storeId)}.png`)); } catch { return null; }
  const size = pngSize(png);
  if (!size) return null;
  let offsetPx = 0, scale = 1;
  try {
    const raw = JSON.parse(await fs.promises.readFile(path.join(signatureDir(), `store-${Number(storeId)}.json`), "utf8"));
    offsetPx = Math.max(-20, Math.min(20, Number(raw?.offsetPx) || 0));
    scale = Math.max(0.7, Math.min(1.3, Number(raw?.scale) || 1));
  } catch { /* no placement saved: defaults */ }
  return { src: "data:image/png;base64," + png.toString("base64"), aspect: size.width / size.height, offsetPx, scale };
}

// A paired device answers one request per check; this is far above any real salon's rate.
const renderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `print-agent:${(req as any).printAgent?.id ?? "?"}`,
  message: { error: "Too many print requests. Try again in a minute." },
});

router.post("/agent/jobs/:id/render", agentAuth, renderLimiter, async (req, res) => {
  const agent = agentOf(req);
  const jobId = String(req.params.id);
  const body = req.body ?? {};
  // From here on the request holds bank details. Nothing below logs, stores or forwards them.
  const failJob = (message: string) => pool.query(
    `UPDATE print_jobs SET status = 'FAILED', payload = NULL, bank_nonce_hash = NULL, finished_at = now(), status_message = $2
      WHERE id = $1 AND status NOT IN ('PRINTED', 'FAILED', 'CANCELLED', 'EXPIRED', 'UNCONFIRMED')`,
    [jobId, message],
  ).catch(() => {});
  let pdf: Buffer | null = null;

  try {
    // 1. Consume the nonce. One statement, so an answer is accepted exactly once — and only from the
    //    device that claimed this transaction, for its own salon, before the request expired.
    const nonce = typeof body.nonce === "string" ? body.nonce : "";
    const opened = await pool.query(
      `UPDATE print_jobs
          SET bank_nonce_hash = NULL, status = 'PRINTING', started_at = now()
        WHERE id = $1 AND store_id = $2 AND agent_id = $3 AND status = 'SENT'
          AND bank_nonce_hash = $4 AND bank_request_expires_at > now()
        RETURNING payload`,
      [jobId, agent.storeId, agent.id, sha256(nonce)],
    );
    if (!opened.rows.length || !nonce) return res.status(409).json({ error: "This print request is no longer valid." });

    // 2. Validate what the device sent. It is only ever used for this one PDF.
    const bank = body.bank ?? {};
    const routing = String(bank.routingNumber ?? "").replace(/\D/g, "");
    const account = String(bank.accountNumber ?? "").replace(/\D/g, "");
    if (!isValidRoutingNumber(routing) || account.length < 4 || account.length > 17) {
      await failJob("The bank details on the salon computer are missing or not valid. Open Bank Details in the Print Agent and check them.");
      return res.status(422).json({ error: "The bank details on this computer are missing or not valid." });
    }

    const signature = await readStoreSignature(agent.storeId);

    // 3. Build the complete check in memory.
    const render = await loadRenderer();
    pdf = await render({
      ...(opened.rows[0].payload as Record<string, unknown>),
      routing,
      account,
      bankName: cleanText(bank.bankName, 80),
      bankAddress: cleanText(bank.bankAddress, 120),
      bankCity: cleanText(bank.bankCity, 80),
      signature,
    });

    // 4. The reply is the PDF. It is never written anywhere on this server.
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Certxa-Document-SHA256", sha256(pdf));
    const sent = pdf;
    res.on("close", () => sent.fill(0));
    res.end(sent);
    console.log(`[print-agent] check transaction ${jobId} rendered and returned to the salon computer (store ${agent.storeId})`);
  } catch (err) {
    // Deliberately only the error's type: a message or stack could echo values from the request.
    console.error("[print-agent/render] failed:", (err as Error)?.name ?? "Error");
    if (pdf) pdf.fill(0);
    await failJob("Certxa could not create the check. Nothing was printed.");
    if (!res.headersSent) res.status(500).json({ error: "Certxa could not create the check." });
  } finally {
    // Drop this request's copies as early as the runtime allows.
    const rawBody: Buffer | undefined = (req as any).rawBody;
    if (rawBody) rawBody.fill(0);
    if (body.bank && typeof body.bank === "object") for (const k of Object.keys(body.bank)) body.bank[k] = undefined;
    (req as any).body = undefined;
  }
});

const ACK_STAGES: Record<string, { status: string; final: boolean }> = {
  PRINT_STARTED:     { status: "PRINTING",    final: false },
  // The printer is offline / out of paper / jammed and the check is waiting in the Windows print queue
  // (message says which). Sent again with an empty message when printing resumes.
  PRINT_WAITING:     { status: "PRINTING",    final: false },
  PRINT_COMPLETED:   { status: "PRINTED",     final: true },
  // Windows accepted the job but never confirmed it finished. Final, and never retried automatically.
  PRINT_UNCONFIRMED: { status: "UNCONFIRMED", final: true },
  PRINT_FAILED:      { status: "FAILED",      final: true },
};

router.post("/agent/jobs/:id/ack", agentAuth, async (req, res) => {
  try {
    const agent = agentOf(req);
    const stage = ACK_STAGES[String(req.body?.stage ?? "")];
    if (!stage) return res.status(400).json({ error: "Unknown stage." });
    const message = String(req.body?.message ?? "").trim().slice(0, 300) || null;

    const updated = await pool.query(
      `UPDATE print_jobs
          SET status = $4,
              status_message = $5,
              started_at  = CASE WHEN $4 = 'PRINTING' THEN COALESCE(started_at, now()) ELSE started_at END,
              finished_at = CASE WHEN $6 THEN now() ELSE finished_at END,
              payload     = CASE WHEN $6 THEN NULL ELSE payload END,
              bank_nonce_hash = CASE WHEN $6 THEN NULL ELSE bank_nonce_hash END
        WHERE id = $1 AND store_id = $2 AND agent_id = $3 AND NOT (status = ANY($7))
        RETURNING id`,
      [String(req.params.id), agent.storeId, agent.id, stage.status, message, stage.final, FINAL_STATUSES],
    );
    if (!updated.rows.length) return res.status(409).json({ error: "That job is not open for this computer." });
    console.log(`[print-agent] job ${req.params.id} → ${stage.status} (store ${agent.storeId})`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[print-agent/jobs ack]", (err as Error)?.name);
    res.status(500).json({ error: "Could not record the print result." });
  }
});

export default router;
