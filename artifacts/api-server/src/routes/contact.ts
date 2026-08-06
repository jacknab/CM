/**
 * POST /api/contact — public contact form
 *
 * Hardened against:
 *   - spam bots (honeypot, timing check)
 *   - rate abuse  (5 / 10 min + 20 / hr per IP)
 *   - SQL injection (ORM only, parameterized)
 *   - XSS (sanitize on store; escape on render)
 *   - oversized payloads (express bodyParser limit + explicit check)
 *   - repetitive strings / abuse patterns
 *   - information leakage (generic error messages)
 *
 * On success, creates a support_ticket (channel='WEB') + opening message.
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod/v4";
import { pool } from "../db";

export const contactRouter = Router();

// ─── In-memory rate limiter ────────────────────────────────────────────────────
type RateEntry = { times: number[] };
const ipRates = new Map<string, RateEntry>();

setInterval(() => {
  const cutoff = Date.now() - 3_600_000; // 1 hour
  for (const [ip, entry] of ipRates) {
    entry.times = entry.times.filter(t => t > cutoff);
    if (!entry.times.length) ipRates.delete(ip);
  }
}, 60_000);

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipRates.get(ip) ?? { times: [] };
  entry.times = entry.times.filter(t => t > now - 3_600_000);

  const last10min = entry.times.filter(t => t > now - 600_000).length;
  const lastHour  = entry.times.length;

  if (last10min >= 5 || lastHour >= 20) return false;

  entry.times.push(now);
  ipRates.set(ip, entry);
  return true;
}

// ─── Input sanitizer ──────────────────────────────────────────────────────────
function sanitize(raw: string): string {
  return raw
    .replace(/\0/g, "")                        // null bytes
    .replace(/<[^>]*>/g, "")                   // HTML tags
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/javascript:/gi, "")
    .normalize("NFKC");                        // unicode normalization
}

// ─── Abuse pattern detector ────────────────────────────────────────────────────
const ABUSE_PATTERNS = [
  /<script/i,
  /drop\s+table/i,
  /select\s+\*/i,
  /insert\s+into/i,
  /union\s+select/i,
  /exec\s*\(/i,
  /xp_/i,
  /eval\s*\(/i,
  /document\.cookie/i,
  /window\.location/i,
  /\bdata:text\/html/i,
];

function hasAbusePattern(text: string): boolean {
  if (ABUSE_PATTERNS.some(p => p.test(text))) return true;
  // Base64 blob over 200 chars
  if (/[A-Za-z0-9+/]{200,}={0,2}/.test(text)) return true;
  // Repeated characters (e.g. "aaaa....") over 80 of same char
  if (/(.)\1{80,}/.test(text)) return true;
  return false;
}

// ─── Zod schema ───────────────────────────────────────────────────────────────
const ContactSchema = z.object({
  name:             z.string().max(100).optional().default(""),
  email:            z.email().max(255),
  subject:          z.string().max(200).optional().default(""),
  message:          z.string().min(10).max(5000),
  company_website:  z.string().optional().default(""),  // honeypot
  _started:         z.number().optional(),              // timing token
});

// ─── Logger (safe) ────────────────────────────────────────────────────────────
function logContact(ip: string, status: string, ticketId?: number) {
  const ts = new Date().toISOString();
  console.log(`[contact] ${ts} ip=${ip} status=${status}${ticketId ? ` ticket=${ticketId}` : ""}`);
}

// ─── Route ────────────────────────────────────────────────────────────────────
contactRouter.post("/api/contact", async (req: Request, res: Response) => {
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown";

  // 1. Payload size guard (belt-and-suspenders, bodyParser limit handles the main case)
  const raw = JSON.stringify(req.body ?? {});
  if (raw.length > 50_000) {
    logContact(ip, "oversized");
    return res.status(400).json({ success: false, error: "Unable to process request" });
  }

  // 2. Rate limit
  if (!checkRateLimit(ip)) {
    logContact(ip, "rate_limited");
    return res.status(429).json({ success: false, error: "Too many requests. Please try again later." });
  }

  // 3. Validate
  const parse = ContactSchema.safeParse(req.body);
  if (!parse.success) {
    logContact(ip, "invalid");
    return res.status(400).json({ success: false, error: "Unable to process request" });
  }

  const { name, email, subject, message, company_website, _started } = parse.data;

  // 4. Honeypot — bots fill hidden fields
  if (company_website && company_website.trim().length > 0) {
    logContact(ip, "honeypot");
    return res.json({ success: true }); // silent drop
  }

  // 5. Timing check — reject submissions under 2 seconds (bots)
  if (_started && Date.now() - _started < 2000) {
    logContact(ip, "too_fast");
    return res.json({ success: true }); // silent drop
  }

  // 6. Abuse pattern check
  const fieldsToCheck = [name, email, subject, message].join(" ");
  if (hasAbusePattern(fieldsToCheck)) {
    logContact(ip, "abuse_pattern");
    return res.json({ success: true }); // silent drop
  }

  // 7. Sanitize
  const cleanName    = sanitize(name);
  const cleanEmail   = sanitize(email).toLowerCase().trim();
  const cleanSubject = sanitize(subject).trim() || "Contact Form Submission";
  const cleanMessage = sanitize(message);

  // 8. Create ticket
  try {
    const ticketNum = `WEB-${Date.now().toString(36).toUpperCase()}`;

    const ticketResult = await pool.query(
      `INSERT INTO support_tickets
         (ticket_number, subject, priority, status, channel, customer_email, customer_name, ip_address)
       VALUES ($1, $2, 'normal', 'open', 'WEB', $3, $4, $5)
       RETURNING id`,
      [ticketNum, cleanSubject, cleanEmail, cleanName || null, ip]
    );
    const ticketId = ticketResult.rows[0].id;

    // Opening message with metadata stored as structured content (safe text)
    const msgContent = [
      cleanMessage,
      "",
      "---",
      `Name: ${cleanName || "(not provided)"}`,
      `Email: ${cleanEmail}`,
      `User-Agent: ${(req.headers["user-agent"] ?? "").slice(0, 200)}`,
      `IP: ${ip}`,
    ].join("\n");

    await pool.query(
      `INSERT INTO support_ticket_messages (ticket_id, author_type, author_name, content)
       VALUES ($1, 'user', $2, $3)`,
      [ticketId, cleanName || cleanEmail, msgContent]
    );

    logContact(ip, "success", ticketId);
    return res.json({ success: true });

  } catch (e: any) {
    console.error("[contact] db error:", e?.message);
    return res.status(500).json({ success: false, error: "Unable to process request" });
  }
});
