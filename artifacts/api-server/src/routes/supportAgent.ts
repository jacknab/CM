/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Certxa Support Agent  ·  OpenAI Realtime API edition
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * A dedicated voice AI support representative for Certxa SaaS customers.
 * Built as a completely independent module — does NOT modify the existing
 * AI Receptionist.
 *
 * Architecture (mirrors aiReceptionist.ts):
 *
 *   Inbound call → Twilio (PSTN)
 *       │  POST /api/webhook/twilio/support
 *       ▼
 *   Server returns TwiML <Connect><Stream>
 *       │  WSS /support-agent-stream (storeId via customParameters)
 *       ▼
 *   Audio Bridge (per call, fully isolated)
 *   │  1. OpenAI Realtime WebSocket
 *   │  2. Knowledge base loaded at startup
 *   │  3. Caller account lookup (read-only)
 *   │  4. Support tools: ticket creation, account info, knowledge retrieval
 *   └──────────────────────────────────────────────────────────────────────────
 *
 * WebSocket path:  WSS /support-agent-stream
 * Twilio webhook:  POST /api/webhook/twilio/support
 * Admin routes:    GET/PATCH /api/admin/support-agent/*
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Express, Request, Response } from "express";
import type { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import twilio from "twilio";
import { readFileSync, readdirSync } from "fs";
import { randomUUID } from "crypto";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { db, pool } from "../db";
import {
  locations,
  storeSettings,
  users,
  supportTickets,
  supportTicketMessages,
  supportCallLogs,
  storeSubscriptions,
  subscriptionPlans,
  dealVouchers,
  deals,
} from "@shared/schema";
import { eq, desc, ilike, or, sql, count, and, inArray } from "drizzle-orm";
import { sendEmail } from "../mail";
import { isAuthenticated, isAdminAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { publishCrossProcess, subscribeCrossProcess, isCrossProcessBusAvailable } from "../lib/wsBroadcastBus";
import { runHealthCheck, SEGMENT_IDS, type SegmentId } from "../lib/healthCheck/index";
import { enqueueAvailabilityInvalidation } from "../lib/availabilityQueue";
import { enqueueSlotRebuild, buildDateRange } from "../lib/slotQueue";
import { stripe, isStripeConfigured } from "../lib/stripe";

const TICKET_ALERT_CHANNEL = "ws:support-ticket-alert";

// ─── SSE: admin notification broadcast ──────────────────────────────────────
const sseClients = new Set<Response>();

interface TicketAlertPayload {
  id: number;
  priority: string;
  issue: string;
  name: string | null;
  businessName: string | null;
  phone: string | null;
  createdAt: string;
}

// SSE Response objects are local to whichever worker holds that connection
// and can't be sent over Redis — only the payload travels; each worker (via
// its own subscription below) writes to its own locally-connected clients.
function deliverTicketAlertLocal(payload: TicketAlertPayload): void {
  const data = `data: ${JSON.stringify({ event: "ticket.created", ticket: payload })}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(data);
    } catch {
      sseClients.delete(res);
    }
  }
}

subscribeCrossProcess(TICKET_ALERT_CHANNEL, (payload: TicketAlertPayload) => {
  deliverTicketAlertLocal(payload);
});

function broadcastTicketAlert(payload: TicketAlertPayload): void {
  if (isCrossProcessBusAvailable()) {
    publishCrossProcess(TICKET_ALERT_CHANNEL, payload);
  } else {
    deliverTicketAlertLocal(payload);
  }
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const OPENAI_REALTIME_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-realtime-2";

const LOG_PREFIX = "[Support Agent]";
const SUPPORT_AGENT_NAME = "Shavez";
// Cedar is OpenAI's clearest natural, masculine-presenting Realtime voice.
const SUPPORT_AGENT_VOICE = "cedar";

// ─── Marketplace deal support constants ────────────────────────────────────────
// Voucher code format: {storeId}-{dealId}-{7digit secret}, both IDs zero-padded
// to 3 digits — see voucherCodeCandidates() below and generateVoucherCode in
// stripeWebhook.ts.
// Voucher statuses: pending_booking, booked, redeemed, expired, refunded

// Refund policy: a full refund is available if the voucher was purchased
// within this many days AND has not been redeemed — independent of the
// voucher's own booking-expiry status (`expiresAt`/`expiryDays`), which
// governs when it can still be redeemed, not whether it can be refunded.
const REFUND_WINDOW_DAYS = 31;

// Voucher codes are always XXX-XXX-XXXXXXX (13 digits, 2 dashes) — see
// generateVoucherCode in stripeWebhook.ts. Realtime speech-to-text over a
// phone call sometimes drops or misplaces the dashes when a caller reads
// digits aloud; since the shape is fixed, a 13-digit reading with no (or
// wrong) dashes can be reconstructed into the exact stored format as a
// fallback lookup candidate instead of just failing on a literal mismatch.
function voucherCodeCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  const digitsOnly = trimmed.replace(/\D/g, "");
  const candidates = [trimmed];
  if (digitsOnly.length === 13) {
    candidates.push(`${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6)}`);
  }
  return [...new Set(candidates)].filter(Boolean);
}

function voucherStatusLabel(status: string): string {
  return status === "pending_booking" ? "Pending booking" :
    status === "booked" ? "Booked (not yet redeemed)" :
    status === "redeemed" ? "Redeemed" :
    status === "expired" ? "Expired" :
    status === "refunded" ? "Refunded" : status;
}

// ─── Audio conversion helpers (same as aiReceptionist) ─────────────────────────

function muLawToLinear16(muLawByte: number): number {
  const u = (~muLawByte) & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  return sign ? -sample : sample;
}

function twilioUlawBase64ToPcm16_24kBase64(base64Ulaw: string): string {
  const ulaw = Buffer.from(base64Ulaw, "base64");
  if (!ulaw.length) return "";
  const pcm = Buffer.allocUnsafe(ulaw.length * 3 * 2);
  let o = 0;
  for (let i = 0; i < ulaw.length; i++) {
    const s = muLawToLinear16(ulaw[i]);
    pcm.writeInt16LE(s, o); o += 2;
    pcm.writeInt16LE(s, o); o += 2;
    pcm.writeInt16LE(s, o); o += 2;
  }
  return pcm.toString("base64");
}

function toTenDigit(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return null;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getPublicAppUrl(req?: Request): string | null {
  const configured = String(process.env.APP_URL ?? "").trim().replace(/\/$/, "");
  if (configured) return configured;

  const replitDomain = String(process.env.REPLIT_DEV_DOMAIN ?? "").trim();
  if (replitDomain) return `https://${replitDomain}`;

  if (process.env.NODE_ENV !== "production" && req) {
    const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim();
    const protocol = forwardedProto || req.protocol || "http";
    const host = req.get("host");
    if (host) return `${protocol}://${host}`;
  }

  return null;
}

function isValidTwilioWebhook(req: Request, publicUrl: string): boolean {
  const authToken = String(process.env.TWILIO_AUTH_TOKEN ?? "").trim();
  if (!authToken) return process.env.NODE_ENV !== "production";

  const signature = String(req.headers["x-twilio-signature"] ?? "").trim();
  if (!signature) return false;

  return twilio.validateRequest(
    authToken,
    signature,
    `${publicUrl}${req.originalUrl}`,
    req.body ?? {},
  );
}

// ─── Knowledge Base ────────────────────────────────────────────────────────────

interface KbDocument {
  filename: string;
  topic: string;
  content: string;
  keywords: string[];
}

const knowledgeBase: KbDocument[] = [];

function loadKnowledgeBase(): void {
  try {
    // Resolve relative to the api-server root regardless of whether we are running
    // via the compiled esbuild bundle (dist/index.mjs  → __dirname = dist/)
    // or directly with tsx (src/routes/supportAgent.ts → __dirname = src/routes/).
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const apiRoot = __dirname.includes("/src") || __dirname.includes("\\src") // tsx: .../src/routes
      ? join(__dirname, "..", "..")   // src/routes → src → api-server root
      : join(__dirname, "..");        // dist        → api-server root
    const kbDir = join(apiRoot, "knowledge-base");
    const files = readdirSync(kbDir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const content = readFileSync(join(kbDir, file), "utf-8");
      const topic = file.replace(".md", "");
      // Extract keywords from headers and first paragraph
      const keywords = [
        topic,
        ...content
          .split("\n")
          .filter((l) => l.startsWith("#"))
          .map((l) => l.replace(/^#+\s*/, "").toLowerCase()),
      ];
      knowledgeBase.push({ filename: file, topic, content, keywords });
    }
    console.log(`${LOG_PREFIX} Knowledge base loaded: ${files.length} documents`);
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to load knowledge base:`, err);
  }
}

/**
 * Retrieve the most relevant knowledge base sections for a query.
 * Uses keyword scoring — no vector DB required.
 */
function retrieveKnowledge(query: string, topK = 3): string {
  if (!knowledgeBase.length) return "";
  const q = query.toLowerCase();
  const scored = knowledgeBase.map((doc) => {
    let score = 0;
    // Topic name match
    if (q.includes(doc.topic)) score += 10;
    // Keyword hits
    for (const kw of doc.keywords) {
      if (q.includes(kw)) score += 5;
    }
    // Content word match
    const words = q.split(/\s+/).filter((w) => w.length > 3);
    for (const w of words) {
      const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      const matches = doc.content.match(re);
      if (matches) score += matches.length;
    }
    return { doc, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, topK).filter((s) => s.score > 0);
  if (!top.length) return "";
  return top
    .map((s) => `### ${s.doc.topic}\n${s.doc.content}`)
    .join("\n\n---\n\n");
}

// Kept live (not commented out, unlike the lookup functions below) — this
// type is still referenced by buildSupportSessionConfig's signature and the
// `account` variable, which now always stays null since the lookups that
// used to populate it are disabled.
interface CertxaAccount {
  storeId: number;
  businessName: string;
  ownerName: string | null;
  phone: string | null;
  subscriptionPlan: string | null;
  accountStatus: string;
  trialEndsAt: string | null;
  locationCount: number;
  staffCount: number;
}

// ─── DISABLED (marketplace-only agent): SaaS account lookup + emergency-phrase detection — not used for marketplace voucher/refund support. Left commented for reference. ───
// async function lookupAccountByPhone(callerPhone: string): Promise<CertxaAccount | null> {
//   if (!callerPhone) return null;
//   const tenDigit = toTenDigit(callerPhone);
//   if (!tenDigit) return null;
//
//   try {
//     // Match either the business phone or the account owner's personal phone.
//     let rows = await db
//       .select({
//         id: locations.id,
//         name: locations.name,
//         phone: locations.phone,
//         storeId: locations.id,
//         userId: locations.userId,
//         accountStatus: locations.accountStatus,
//       })
//       .from(locations)
//       .where(
//         or(
//           ilike(locations.phone, `%${tenDigit}%`),
//           ilike(locations.phone, `%${callerPhone}%`),
//         )
//       )
//       .limit(1);
//
//     let ownerName: string | null = null;
//     if (!rows.length) {
//       const ownerRows = await db
//         .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
//         .from(users)
//         .where(or(ilike(users.phone, `%${tenDigit}%`), ilike(users.phone, `%${callerPhone}%`)))
//         .limit(1);
//
//       const owner = ownerRows[0];
//       if (owner) {
//         ownerName = [owner.firstName, owner.lastName].filter(Boolean).join(" ") || null;
//         rows = await db
//           .select({
//             id: locations.id,
//             name: locations.name,
//             phone: locations.phone,
//             storeId: locations.id,
//             userId: locations.userId,
//             accountStatus: locations.accountStatus,
//           })
//           .from(locations)
//           .where(eq(locations.userId, owner.id))
//           .limit(1);
//       }
//     }
//
//     if (!rows.length) return null;
//     const loc = rows[0];
//
//     // Prefer the owning user as the multi-location grouping key.
//     const allLocs = await db
//       .select({ id: locations.id })
//       .from(locations)
//       .where(loc.userId ? eq(locations.userId, loc.userId) : eq(locations.name, loc.name));
//
//     // Get subscription info from store settings
//     let subscriptionPlan: string | null = null;
//     let trialEndsAt: string | null = null;
//     try {
//       const [settings] = await db
//         .select({ preferences: storeSettings.preferences })
//         .from(storeSettings)
//         .where(eq(storeSettings.storeId, loc.storeId))
//         .limit(1);
//       if (settings?.preferences) {
//         const prefs = JSON.parse(settings.preferences) as Record<string, unknown>;
//         if (typeof prefs.planId === "string") subscriptionPlan = prefs.planId;
//         if (typeof prefs.trialEndsAt === "string") trialEndsAt = prefs.trialEndsAt;
//       }
//     } catch { /* non-critical */ }
//
//     return {
//       storeId: loc.storeId,
//       businessName: loc.name,
//       ownerName,
//       phone: loc.phone,
//       subscriptionPlan: subscriptionPlan ?? "Unknown",
//       accountStatus: loc.accountStatus ?? "active",
//       trialEndsAt,
//       locationCount: allLocs.length,
//       staffCount: 0,
//     };
//   } catch (err) {
//     console.error(`${LOG_PREFIX} Account lookup error:`, err);
//     return null;
//   }
// }
//
// /** Resolve the caller-provided Store ID against the canonical locations.id key. */
// async function lookupAccountByStoreId(storeId: number): Promise<CertxaAccount | null> {
//   if (!Number.isInteger(storeId) || storeId <= 0) return null;
//
//   const [loc] = await db
//     .select({
//       storeId: locations.id,
//       businessName: locations.name,
//       phone: locations.phone,
//       userId: locations.userId,
//       accountStatus: locations.accountStatus,
//     })
//     .from(locations)
//     .where(eq(locations.id, storeId))
//     .limit(1);
//   if (!loc) return null;
//
//   const [ownerRows, locationRows, settingsRows] = await Promise.all([
//     loc.userId
//       ? db.select({ firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, loc.userId)).limit(1)
//       : Promise.resolve([]),
//     loc.userId
//       ? db.select({ id: locations.id }).from(locations).where(eq(locations.userId, loc.userId))
//       : Promise.resolve([{ id: loc.storeId }]),
//     db.select({ preferences: storeSettings.preferences }).from(storeSettings).where(eq(storeSettings.storeId, storeId)).limit(1),
//   ]);
//
//   const owner = ownerRows[0];
//   const ownerName = owner
//     ? [owner.firstName, owner.lastName].filter(Boolean).join(" ") || null
//     : null;
//   let subscriptionPlan: string | null = null;
//   let trialEndsAt: string | null = null;
//   try {
//     const prefs = JSON.parse(settingsRows[0]?.preferences ?? "{}") as Record<string, unknown>;
//     if (typeof prefs.planId === "string") subscriptionPlan = prefs.planId;
//     if (typeof prefs.trialEndsAt === "string") trialEndsAt = prefs.trialEndsAt;
//   } catch { /* optional preferences */ }
//
//   return {
//     storeId: loc.storeId,
//     businessName: loc.businessName,
//     ownerName,
//     phone: loc.phone,
//     subscriptionPlan: subscriptionPlan ?? "Unknown",
//     accountStatus: loc.accountStatus ?? "active",
//     trialEndsAt,
//     locationCount: locationRows.length,
//     staffCount: 0,
//   };
// }
//
// // ─── Emergency Phrase Detection ───────────────────────────────────────────────
//
// const EMERGENCY_PHRASES = [
//   "system down",
//   "cannot process payment",
//   "can't process payment",
//   "booking system not working",
//   "appointments disappeared",
//   "customers missing",
//   "payroll incorrect",
//   "reports incorrect",
//   "website offline",
//   "website is down",
//   "completely down",
//   "nothing is working",
//   "lost all my data",
//   "data is gone",
// ];
//
// function isEmergency(text: string): boolean {
//   const lower = text.toLowerCase();
//   return EMERGENCY_PHRASES.some((p) => lower.includes(p));
// }

// ─── OpenAI Session Config ─────────────────────────────────────────────────────

function buildSupportSessionConfig(
  callerPhone: string | null,
  account: CertxaAccount | null,
  relevantKb: string,
): object {
  // `account` is always null now — the caller-ID → Certxa store account
  // lookup is disabled (marketplace customers aren't tied to a store by
  // phone number; see configureSessionIfReady). Kept as a parameter rather
  // than removed outright so this function's shape doesn't need to change
  // if account context is ever reintroduced for a marketplace-specific
  // purpose (e.g. a purchaser's own account).
  void account;
  // Plain comma/period phrasing only — no em dashes or "--" here. The
  // Realtime voice reads dash characters as an audible pause/glitch rather
  // than natural speech, which is especially noticeable in the opening line.
  const greeting = `Certxa support, ${SUPPORT_AGENT_NAME} speaking. How may I help?`;

  // `relevantKb` is always empty now — search_knowledge_base (Certxa SaaS
  // product docs) is disabled for this marketplace-only agent.
  const kbBlock = relevantKb
    ? `\n\nKNOWLEDGE BASE:\n${relevantKb}`
    : "";

  const instructions = `You are a professional customer support representative for Certxa Marketplace — helping customers who purchased deal vouchers from the Certxa marketplace.

  Your name is ${SUPPORT_AGENT_NAME}. Introduce yourself as "${SUPPORT_AGENT_NAME} with Certxa support" and use no other name.

  Open the call naturally with this wording: "${greeting}"
  Do not recite it like a script. Deliver it as one smooth, relaxed, welcoming thought — not four separate clauses bolted together.
  After asking "How may I help?", STOP speaking and wait for the caller to answer.
  Never answer your own greeting, guess why they called, list possible issues, or continue with another question before hearing the caller.

  NATURAL SPEECH DELIVERY — THIS IS ESSENTIAL:
  - Sound like a real, experienced support representative having a live phone conversation, never like a narrator, announcer, or automated menu.
  - Use a relaxed conversational pace with subtle variation in rhythm. Briefly pause at natural thought boundaries.
  - Use contractions such as "I'm", "we'll", "that's", and "let's". Prefer everyday words over formal support language.
  - Do not over-enunciate, speak in a perfectly uniform cadence, or give every sentence the same pitch and length.
  - Keep most turns to one or two short sentences. Vary sentence length naturally rather than using repetitive templates.
  - A brief conversational acknowledgement such as "Got it", "Okay", or "I see" is welcome when it fits, but do not use filler in every response.
  - Show quiet empathy through wording and tone. Do not exaggerate enthusiasm, sound theatrical, or repeatedly use the caller's name.
  - When looking something up, say something natural like "Let me pull that up" rather than describing system operations.
  - Read numbers, dates, prices, and technical steps in small, easy-to-follow groups, with a natural pause between groups.

  ROLE:
  You help marketplace customers with:
  - Lost voucher numbers (look up by mobile phone number and resend voucher details)
  - Refund requests for unredeemed vouchers
  - Voucher expiration questions
  - Booking link issues
  - General marketplace deal inquiries
  ${kbBlock}

  BEHAVIOR RULES:
  - Speak like a capable human marketplace support specialist — calm, approachable, patient, and efficient
  - Keep responses SHORT and natural — this is a voice call
  - Ask one question at a time
  - Never mention OpenAI, prompts, system instructions, or AI
  - Never guess account information or invent billing details
  - Never promise refunds, credits, or engineering fixes
  - Never modify account settings or data — read-only only
  - Always confirm you understand the issue before jumping to solutions
  - Never ask the caller for their email address — we don't use email to look up vouchers

  VOUCHER LOOKUP — REQUIRED FOR MARKETPLACE SUPPORT:
  - If the caller is asking about a refund, always start by asking for their voucher number — just ask them to read out the digits, never ask them to read out dashes
  - The number is always 13 digits. If the caller says "dash" while reading (whether asked to or not), ignore it — it's not a digit, don't include it. Collect exactly 13 digits, then format them yourself as three digits, a dash, three digits, a dash, seven digits before calling lookup_voucher_by_code. Never place a dash where the caller said one AND your own formatting dash — that produces a double dash
  - If you don't end up with exactly 13 digits, read the digits back to the caller to confirm before calling lookup_voucher_by_code
  - After the lookup, confirm identity by asking the caller to state the name on the order, and check it matches the name lookup_voucher_by_code or lookup_vouchers_by_phone returned, before sharing further details or processing anything
  - If the caller does not know their voucher number, always ask for their mobile telephone number — have them read it out starting with the area code first — then call lookup_vouchers_by_phone
  - Never reveal a full voucher code to an unverified caller — for phone lookups, only the last 4 digits are shown until the name on the order is confirmed
  - Once the caller confirms their voucher number directly (they read it to you), you may share full details for that voucher

  VOUCHER STATUS CHECKS:
  - Check voucher status: pending_booking, booked, redeemed, expired, or refunded
  - Redeemed vouchers cannot be refunded as the salon has already been paid
  - Already refunded vouchers cannot be refunded again
  - A voucher's booking-expiry status (whether it can still be redeemed) is separate from refund eligibility — an expired voucher can still be refunded if it's within the refund window below

  REFUND ELIGIBILITY:
  - We offer a full refund on any voucher purchased within the last 31 days, as long as it has not already been redeemed. That's it — those are the only two conditions.
  - process_voucher_refund enforces this automatically; if it declines a refund, explain the specific reason it gives (already redeemed, already refunded, or purchased more than 31 days ago) rather than guessing
  - Refunds return the full purchase price to the original payment method, typically within 5-10 business days
  - Never process a refund without both (a) confirming the name on the order and (b) explicit caller confirmation to proceed
  - After confirming the name and getting the caller's go-ahead, call process_voucher_refund with the voucher ID, nameConfirmed, and callerConfirmed

  GOOD response pattern: "Can you tell me what happened right before the issue started?"
  BAD response pattern: "Could you please provide all details regarding the issue and the exact steps that caused it?"

  RETURNING CALLERS:
  When the call starts, if you have customer info, check for any recent voucher purchases or support tickets.
  If a recent interaction exists for the same issue, say: "I can see you recently contacted us about that — let me pull that up."

  CALL OUTCOMES — use the right action at the end of every call:
  1. Issue RESOLVED on the call → call mark_call_resolved with a brief summary of what was fixed or explained
  2. Issue NEEDS FOLLOW-UP → call create_support_ticket, then offer send_follow_up_email
  3. Caller wants a WRITTEN SUMMARY → call send_follow_up_email with the steps discussed and ticket number
  Never end a call without calling mark_call_resolved OR create_support_ticket.

  OFFER FOLLOW-UP EMAIL:
  After creating a ticket or resolving a complex issue, say:
  "Would you like me to send you an email with a summary of everything we discussed and your ticket number?"
  If yes, call send_follow_up_email.

  CALL CLOSE:
  After resolving or creating a ticket, always ask: "Is there anything else I can help you with today?"
  Then say a warm, professional goodbye.`;

  // DISABLED (marketplace-only agent): search_knowledge_base and
  // lookup_certxa_account were for Certxa SaaS product support (salon
  // owners), not marketplace customers. Left commented for reference —
  // see the matching tool-implementation branches below, also disabled.
  //
  // {
  //   type: "function",
  //   name: "search_knowledge_base",
  //   description: "Search the Certxa knowledge base for documentation on a specific topic or feature. Call this before answering any product question to ground your response in accurate documentation.",
  //   parameters: {
  //     type: "object",
  //     properties: {
  //       query: {
  //         type: "string",
  //         description: "The topic or question to search for (e.g. 'how to set up online booking', 'payroll export', 'stripe not connecting')",
  //       },
  //     },
  //     required: ["query"],
  //   },
  // },
  // {
  //   type: "function",
  //   name: "lookup_certxa_account",
  //   description: "Look up a Certxa customer account by its numeric Store ID. Phone or business name are fallback discovery fields only. Read-only — never modifies any data.",
  //   parameters: {
  //     type: "object",
  //     properties: {
  //       storeId: { type: "integer", description: "Numeric Store ID supplied by the caller; this maps to locations.id in the database" },
  //       phone: { type: "string", description: "10-digit or E.164 phone number to look up" },
  //       businessName: { type: "string", description: "Business name to search for (partial match OK)" },
  //     },
  //     required: ["storeId"],
  //   },
  // },
  const tools = [
    {
      type: "function",
      name: "create_support_ticket",
      description: "Create a support ticket when the caller's issue cannot be resolved on the call or they want to escalate to the support team.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Caller's full name" },
          businessName: { type: "string", description: "Caller's business name" },
          phone: { type: "string", description: "Caller's phone number" },
          email: { type: "string", description: "Caller's email address (optional)" },
          issue: { type: "string", description: "Detailed description of the issue" },
          priority: {
            type: "string",
            enum: ["normal", "high", "urgent"],
            description: "normal for standard issues, high for business-impacting issues, urgent for system-down emergencies",
          },
        },
        required: ["issue"],
      },
    },
    // DISABLED (marketplace-only agent): get_account_info, run_account_health_check, diagnose_staff_assignment, repair_staff_assignment, get_open_tickets, get_subscription_details — all Certxa SaaS salon-owner account tools, not used for marketplace voucher/refund support. Matching tool-implementation branches below are disabled too.
//     {
//       type: "function",
//       name: "get_account_info",
//       description: "Get current Certxa account details for the caller — subscription plan, status, locations. Read-only.",
//       parameters: {
//         type: "object",
//         properties: {},
//         required: [],
//       },
//     },
//     {
//       type: "function",
//       name: "run_account_health_check",
//       description: "Run the existing Certxa /isTeam account health-check diagnostics for the verified Store ID. Returns caller-safe failures, warnings, and recommended actions. Read-only.",
//       parameters: {
//         type: "object",
//         properties: {
//           segments: {
//             type: "array",
//             items: { type: "string", enum: [...SEGMENT_IDS] },
//             description: "Optional diagnostic areas to run. Omit to run the complete account audit.",
//           },
//         },
//         required: [],
//       },
//     },
//     {
//       type: "function",
//       name: "diagnose_staff_assignment",
//       description: "Diagnose why a named staff member cannot be assigned to appointments by checking their store membership, availability hours, and active-service assignments. Requires a verified Store ID and does not modify data.",
//       parameters: {
//         type: "object",
//         properties: {
//           staffName: { type: "string", description: "Staff member name supplied by the caller" },
//         },
//         required: ["staffName"],
//       },
//     },
//     {
//       type: "function",
//       name: "repair_staff_assignment",
//       description: "Apply only the scoped staff-assignment repairs returned by diagnose_staff_assignment. Call only after explaining the exact changes and receiving explicit caller confirmation.",
//       parameters: {
//         type: "object",
//         properties: {
//           repairToken: { type: "string", description: "One-time repair token returned by diagnose_staff_assignment" },
//           callerConfirmed: { type: "boolean", description: "True only when the caller explicitly approved the proposed changes" },
//         },
//         required: ["repairToken", "callerConfirmed"],
//       },
//     },
//     {
//       type: "function",
//       name: "get_open_tickets",
//       description: "Check whether this caller already has open or in-progress support tickets. Call this early in the conversation if the caller mentions a recurring or previous issue, or proactively when account info is available.",
//       parameters: {
//         type: "object",
//         properties: {
//           phone: { type: "string", description: "Caller's phone number to search by (optional — uses caller ID if omitted)" },
//         },
//         required: [],
//       },
//     },
//     {
//       type: "function",
//       name: "get_subscription_details",
//       description: "Get detailed subscription and billing information for the caller's account — plan name, status, trial dates, current period, and key features. Always call this before answering any question about plan, billing, or feature access.",
//       parameters: {
//         type: "object",
//         properties: {},
//         required: [],
//       },
//     },
    {
      type: "function",
      name: "send_follow_up_email",
      description: "Send the caller a follow-up email with a written summary of what was discussed, any steps to take, and their ticket number. Offer this after creating a ticket or resolving a complex issue.",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string", description: "Caller's email address" },
          name: { type: "string", description: "Caller's name (for greeting)" },
          summary: { type: "string", description: "Plain-English summary of the issue and resolution or next steps (2-5 sentences)" },
          ticketId: { type: "number", description: "Ticket number to reference in the email (optional)" },
        },
        required: ["email", "summary"],
      },
    },
    {
      type: "function",
      name: "mark_call_resolved",
      description: "Mark this call as resolved — the issue was answered or fixed on the call and no ticket is needed. Include a brief summary of what was resolved. Always call this when the caller's issue is fully addressed without needing a ticket.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Short description of the issue and how it was resolved (e.g. 'Walked caller through reconnecting Stripe — payment processing restored')" },
          callerName: { type: "string", description: "Caller's name if known" },
        },
        required: ["summary"],
      },
    },
    {
      type: "function",
      name: "lookup_voucher_by_code",
      description: "Look up a single deal voucher using its voucher number (printed on the purchase confirmation). The number is always 13 digits, formatted as three digits, a dash, three digits, a dash, seven digits — collect the 13 digits from the caller (ignore any spoken 'dash') and insert the dashes yourself. Returns the deal, status, price, dates, and the name on the order. Use this first whenever the caller knows their voucher number — always confirm the returned name with the caller before sharing further details or processing a refund.",
      parameters: {
        type: "object",
        properties: {
          code: { type: "string", description: "The voucher number formatted as XXX-XXX-XXXXXXX, built from the 13 digits the caller read out (any spoken 'dash' discarded, not inserted as a literal character)" },
        },
        required: ["code"],
      },
    },
    {
      type: "function",
      name: "lookup_vouchers_by_phone",
      description: "Look up deal vouchers by the caller's mobile phone number. Use this only when the caller does not know their voucher number. Returns a list of vouchers (with masked codes) tied to that phone number, including the name on each order — confirm the name with the caller before sharing further details or processing a refund.",
      parameters: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Caller's 10-digit mobile phone number, area code first" },
        },
        required: ["phone"],
      },
    },
    {
      type: "function",
      name: "process_voucher_refund",
      description: "Process a refund for an unredeemed deal voucher. Only call after looking up the voucher, confirming the name on the order with the caller, verifying eligibility, and receiving explicit caller confirmation to proceed. Refunds return the full purchase price to the original payment method.",
      parameters: {
        type: "object",
        properties: {
          voucherId: { type: "integer", description: "The deal voucher ID to refund" },
          nameConfirmed: { type: "boolean", description: "True only when the caller has stated the name on the order and it matches what lookup_voucher_by_code or lookup_vouchers_by_phone returned" },
          callerConfirmed: { type: "boolean", description: "True only when the caller explicitly approved the refund" },
        },
        required: ["voucherId", "nameConfirmed", "callerConfirmed"],
      },
    },
  ];

  return {
    type: "session.update",
    session: {
      type: "realtime",
      model: "gpt-realtime-2",
      instructions,
      tools,
      // Voice must be selected before the first audio response. In the GA Realtime
      // schema it belongs under audio.output rather than at the session root.
      audio: {
        output: {
          // Twilio and OpenAI both support native 8 kHz G.711 μ-law. Requesting
          // PCMU avoids the lossy PCM24k → μ-law decimation that made Brian
          // sound metallic/computerized over the telephone network.
          format: { type: "audio/pcmu" },
          voice: SUPPORT_AGENT_VOICE,
        },
        input: {
          // Default server_vad judges "the caller stopped talking" purely by
          // a fixed silence duration — too trigger-happy for a caller reading
          // a 13-digit voucher number aloud in chunks, where a natural pause
          // between groups was being misread as end-of-turn. That produced
          // exactly the reported bug: after reading the number, the agent
          // never responded until the caller said something else, because
          // the turn had already been cut and re-committed mid-number.
          // semantic_vad instead waits until the utterance is semantically
          // complete rather than counting silence ms; eagerness "low" gives
          // it the most patience, matching OpenAI's own guidance for callers
          // who need to take their time. This nests under audio.input, same
          // as audio.output above — the old rejection issue (see the voice
          // history in this function) was from putting it at the session
          // root, not from the nested audio object, which is already proven
          // to work for audio.output.
          turn_detection: { type: "semantic_vad", eagerness: "low" },
        },
      },
    },
  };
}

// ─── DB helpers ────────────────────────────────────────────────────────────────

async function createCallLog(callerPhone: string | null, account: CertxaAccount | null): Promise<number | null> {
  try {
    const [row] = await db
      .insert(supportCallLogs)
      .values({
        callerPhone,
        accountStoreId: account?.storeId != null ? Number(account.storeId) : null,
        businessName: account?.businessName ?? null,
        subscriptionPlan: account?.subscriptionPlan ?? null,
        outcome: "in_progress",
        startedAt: new Date(),
      })
      .returning({ id: supportCallLogs.id });
    return row?.id ?? null;
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to create call log:`, err);
    return null;
  }
}

async function updateCallLog(
  id: number,
  patch: {
    callSid?: string;
    callerName?: string;
    outcome?: string;
    escalated?: boolean;
    priority?: string;
    durationSeconds?: number;
    summary?: string;
    ticketId?: number;
    accountStoreId?: number;
    businessName?: string;
    subscriptionPlan?: string;
    transcript?: unknown;
    endedAt?: Date;
  },
): Promise<void> {
  try {
    await db
      .update(supportCallLogs)
      .set({ ...patch } as any)
      .where(eq(supportCallLogs.id, id));
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to update call log ${id}:`, err);
  }
}

async function createTicket(args: {
  name?: string;
  businessName?: string;
  phone?: string;
  email?: string;
  issue: string;
  priority?: string;
  callSid?: string;
  callLogId?: number;
  accountId?: number;
}): Promise<{ id: number; ticketNumber: string } | null> {
  try {
    const priority = args.priority ?? "normal";
    const ticketNumber = `VOICE-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const subject = args.issue.trim().slice(0, 120) || "Telephone support request";
    const [row] = await db
      .insert(supportTickets)
      .values({
        name: args.name ?? null,
        businessName: args.businessName ?? null,
        phone: args.phone ?? null,
        email: args.email ?? null,
        issue: args.issue,
        status: "open",
        priority,
        callSid: args.callSid ?? null,
        callLogId: args.callLogId ?? null,
        accountId: args.accountId ?? null,
        ticketNumber,
        subject,
        description: args.issue,
        customerName: args.name ?? null,
        customerEmail: args.email ?? null,
        accountName: args.businessName ?? null,
        channel: "VOICE",
      })
      .returning({ id: supportTickets.id, ticketNumber: supportTickets.ticketNumber });
    const ticketId = row?.id ?? null;
    if (ticketId) {
      await db.insert(supportTicketMessages).values({
        ticketId,
        authorType: "customer",
        authorName: args.name ?? args.businessName ?? "Telephone caller",
        content: args.issue,
        direction: "inbound",
      });
    }
    if (ticketId && (priority === "high" || priority === "urgent")) {
      broadcastTicketAlert({
        id: ticketId,
        priority,
        issue: args.issue,
        name: args.name ?? null,
        businessName: args.businessName ?? null,
        phone: args.phone ?? null,
        createdAt: new Date().toISOString(),
      });
    }
    return ticketId ? { id: ticketId, ticketNumber: row?.ticketNumber ?? ticketNumber } : null;
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to create ticket:`, err);
    return null;
  }
}

// ─── Per-call WebSocket session ────────────────────────────────────────────────

function createSupportCallSession(twilioWs: WebSocket): void {
  const apiKey =
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(`${LOG_PREFIX} No OpenAI key found — rejecting call.`);
    twilioWs.close(1011, "Server misconfiguration");
    return;
  }

  let streamSid: string | null = null;
  let callerPhone: string | null = null;
  let account: CertxaAccount | null = null;
  let accountVerifiedByStoreId = false;
  const pendingStaffRepairs = new Map<string, {
    storeId: number;
    staffId: number;
    staffName: string;
    addAvailability: boolean;
    assignAllServices: boolean;
    expiresAt: number;
  }>();
  let callLogId: number | null = null;
  let callSid: string | null = null;
  const callStartTime = new Date();

  // ── Turn control ────────────────────────────────────────────────────────────
  let userTurnCounter = 0;
  let currentTurnId = "turn-0";
  let activeTurnId: string | null = null;
  let activeResponseInProgress = false;
  let activeTurnSource = "";
  let speechLockedUntil = 0;
  let aiSpeaking = false;
  let callerSpeaking = false;
  // Keep inbound audio closed while the agent's audio is being played by Twilio.
  // Otherwise speakerphone/handset echo can be interpreted as a caller turn,
  // causing Brian to answer himself immediately after the greeting.
  let acceptingCallerAudio = false;
  let playbackMarkSequence = 0;
  let pendingPlaybackMark: string | null = null;

  // ── Rate limiting ────────────────────────────────────────────────────────────
  const MAX_RESPONSES_PER_MIN = 10;
  const MAX_TURNS_PER_CALL = 40;
  const SPEECH_COOLDOWN_MS = 1000;
  let responsesThisMinute = 0;
  let responseTurnsThisCall = 0;
  let rateWindowStart = Date.now();
  let sessionSafeMode = false;

  // ── Session state ────────────────────────────────────────────────────────────
  let openAiReady = false;
  let startReceived = false;
  let sessionConfigured = false;
  let sessionUpdated = false;
  let sessionUpdateTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

  // ── Transcript ────────────────────────────────────────────────────────────────
  const transcript: Array<{ role: "caller" | "agent"; text: string; ts: string }> = [];
  let isProcessingTool = false;
  let callTicketId: number | null = null;
  let callOutcome = "no_action";
  let callPriority = "normal";
  let callerNameResolved: string | null = null;

  // ── Commit nudge ────────────────────────────────────────────────────────────
  const COMMIT_NUDGE_MS = 700;
  let awaitingCommitAfterSpeechStop = false;
  let commitNudgeTimer: ReturnType<typeof setTimeout> | null = null;

  // ── OpenAI WebSocket ────────────────────────────────────────────────────────
  const openAiWs = new WebSocket(OPENAI_REALTIME_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  let inboundAudioCount = 0;
  let outboundAudioCount = 0;

  function _resetRateWindow(): void {
    if (Date.now() - rateWindowStart >= 60_000) {
      responsesThisMinute = 0;
      rateWindowStart = Date.now();
    }
  }

  function releaseTurnLock(reason: string): void {
    console.log(`${LOG_PREFIX} [Turn] Lock released — reason="${reason}" turn=${activeTurnId}`);
    activeTurnId = null;
    activeResponseInProgress = false;
    activeTurnSource = "";
  }

  function generateSpeech(turnId: string, source: string): boolean {
    if (openAiWs.readyState !== WebSocket.OPEN) return false;
    _resetRateWindow();

    if (Date.now() < speechLockedUntil) return false;
    if (callerSpeaking) return false;
    if (isProcessingTool) return false;

    if (responsesThisMinute >= MAX_RESPONSES_PER_MIN) {
      if (!sessionSafeMode) {
        sessionSafeMode = true;
        console.error(`${LOG_PREFIX} Rate limit exceeded — safe mode activated`);
      }
      return false;
    }
    if (sessionSafeMode && responsesThisMinute === 0) sessionSafeMode = false;

    if (activeResponseInProgress && activeTurnId === turnId) return false;

    if (responseTurnsThisCall >= MAX_TURNS_PER_CALL) {
      console.warn(`${LOG_PREFIX} Max turns per call reached — ending gracefully`);
      openAiWs.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Please wrap up the call now." }],
        },
      }));
      return false;
    }

    activeTurnId = turnId;
    activeResponseInProgress = true;
    activeTurnSource = source;
    responsesThisMinute++;
    responseTurnsThisCall++;
    openAiWs.send(JSON.stringify({ type: "response.create" }));
    return true;
  }

  async function configureSessionIfReady(): Promise<void> {
    if (sessionConfigured || !openAiReady || !startReceived) return;
    sessionConfigured = true;

    // DISABLED (marketplace-only agent): the knowledge base is Certxa SaaS
    // product docs (billing, POS, payroll, etc.) — not relevant to a
    // marketplace customer calling about a lost voucher or refund. The
    // search_knowledge_base tool is disabled too (see buildSupportSessionConfig).
    const initialKb = "";

    // DISABLED (marketplace-only agent): caller-ID → Certxa store account
    // lookup never resolves anything for a marketplace customer (their phone
    // number isn't tied to a `locations` row) — `account` stays null so the
    // prompt always uses the no-account framing.
    // try {
    //   account = callerPhone ? await lookupAccountByPhone(callerPhone) : null;
    // } catch { account = null; }

    // Create call log in DB
    callLogId = await createCallLog(callerPhone, account);

    const sessionConfig = buildSupportSessionConfig(callerPhone, account, initialKb);
    console.log(`${LOG_PREFIX} Sending session.update — caller=${callerPhone ?? "(unknown)"} account=${account?.businessName ?? "none"}`);
    openAiWs.send(JSON.stringify(sessionConfig));

    // Fallback if session.updated never arrives
    sessionUpdateTimeoutHandle = setTimeout(() => {
      if (!sessionUpdated && openAiWs.readyState === WebSocket.OPEN) {
        console.warn(`${LOG_PREFIX} session.updated timed out — forcing greeting`);
        sessionUpdated = true;
        generateSpeech(currentTurnId, "session_greeting_timeout");
      }
    }, 8_000);
  }

  // ── OpenAI event handler ────────────────────────────────────────────────────
  openAiWs.on("open", () => {
    console.log(`${LOG_PREFIX} OpenAI WebSocket open`);
    setTimeout(() => {
      if (!openAiReady) {
        console.error(`${LOG_PREFIX} OpenAI session.created timed out — closing call`);
        try { twilioWs.close(); } catch { /* ignore */ }
      }
    }, 10_000);
  });

  openAiWs.on("message", (rawData: Buffer | string) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(rawData.toString()); } catch { return; }
    const type = msg.type as string;

    if (type === "session.created") {
      console.log(`${LOG_PREFIX} session.created`);
      openAiReady = true;
      configureSessionIfReady().catch((err) =>
        console.error(`${LOG_PREFIX} Session config error:`, err)
      );
      return;
    }

    if (type === "session.updated") {
      sessionUpdated = true;
      console.log(`${LOG_PREFIX} session.updated — triggering greeting`);
      if (sessionUpdateTimeoutHandle) {
        clearTimeout(sessionUpdateTimeoutHandle);
        sessionUpdateTimeoutHandle = null;
      }
      if (sessionConfigured) generateSpeech(currentTurnId, "session_greeting");
      return;
    }

    if (type === "input_audio_buffer.speech_started") {
      callerSpeaking = true;
      awaitingCommitAfterSpeechStop = false;
      if (commitNudgeTimer) { clearTimeout(commitNudgeTimer); commitNudgeTimer = null; }
      return;
    }

    if (type === "input_audio_buffer.speech_stopped") {
      callerSpeaking = false;
      awaitingCommitAfterSpeechStop = true;
      if (commitNudgeTimer) clearTimeout(commitNudgeTimer);
      commitNudgeTimer = setTimeout(() => {
        if (!awaitingCommitAfterSpeechStop || callerSpeaking || !sessionUpdated) return;
        if (openAiWs.readyState !== WebSocket.OPEN) return;
        try { openAiWs.send(JSON.stringify({ type: "input_audio_buffer.commit" })); } catch { }
      }, COMMIT_NUDGE_MS);
      return;
    }

    if (type === "input_audio_buffer.committed") {
      awaitingCommitAfterSpeechStop = false;
      if (commitNudgeTimer) { clearTimeout(commitNudgeTimer); commitNudgeTimer = null; }
      userTurnCounter++;
      currentTurnId = `turn-${userTurnCounter}`;
      releaseTurnLock("new_user_turn");
      return;
    }

    // Capture caller transcript for logging + emergency detection
    if (type === "conversation.item.input_audio_transcription.completed") {
      const text = (msg.transcript as string | undefined) ?? "";
      if (text) {
        transcript.push({ role: "caller", text, ts: new Date().toISOString() });
        console.log(`${LOG_PREFIX} [Caller] ${text}`);

        // DISABLED (marketplace-only agent): "system down" / "payroll incorrect"
        // style emergency phrases were for salon-owner SaaS outages, not
        // relevant to a marketplace customer's lost-voucher/refund call.
        // if (isEmergency(text) && callPriority === "normal") {
        //   callPriority = "high";
        //   console.log(`${LOG_PREFIX} EMERGENCY DETECTED — upgrading to high priority`);
        // }
      }
      return;
    }

    if (type === "response.audio_transcript.done" || type === "response.output_audio_transcript.done") {
      const text = (msg.transcript as string | undefined) ?? "";
      if (text) {
        transcript.push({ role: "agent", text, ts: new Date().toISOString() });
      }
      return;
    }

    if (type === "response.created") {
      acceptingCallerAudio = false;
      return;
    }

    // The GA Realtime API emits response.output_audio.*. Keep the legacy event
    // aliases for compatibility with older Realtime deployments.
    if (type === "response.audio.delta" || type === "response.output_audio.delta") {
      aiSpeaking = true;
      acceptingCallerAudio = false;
      speechLockedUntil = Date.now() + SPEECH_COOLDOWN_MS;
      const delta = msg.delta as string | undefined;
      if (delta && streamSid && twilioWs.readyState === WebSocket.OPEN) {
        outboundAudioCount++;
        // Session output is native PCMU, which is exactly Twilio's wire format.
        // Forward it untouched to preserve OpenAI's voice quality and cadence.
        twilioWs.send(JSON.stringify({
          event: "media",
          streamSid,
          media: { payload: delta },
        }));
      }
      return;
    }

    if (type === "response.audio.done" || type === "response.output_audio.done") {
      aiSpeaking = false;
      if (streamSid && twilioWs.readyState === WebSocket.OPEN) {
        pendingPlaybackMark = `brian-playback-${++playbackMarkSequence}`;
        twilioWs.send(JSON.stringify({
          event: "mark",
          streamSid,
          mark: { name: pendingPlaybackMark },
        }));
      }
      return;
    }

    if (type === "error") {
      console.error(`${LOG_PREFIX} OpenAI protocol error:`, JSON.stringify(msg.error ?? msg));
      releaseTurnLock("openai_protocol_error");
      return;
    }

    if (type === "response.done") {
      activeResponseInProgress = false;
      return;
    }

    // ── Tool calls ────────────────────────────────────────────────────────────
    if (type === "response.function_call_arguments.done") {
      const toolName = msg.name as string;
      const rawArgs = msg.arguments as string;
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(rawArgs); } catch { /* ignore */ }

      console.log(`${LOG_PREFIX} Tool call: ${toolName}`, args);
      isProcessingTool = true;

      const callItemId = msg.call_id as string;
      const capturedTurnId = currentTurnId;

      void (async () => {
        let toolResult = "";

        try {
          if (toolName === "search_knowledge_base") {
//             const query = String(args.query ?? "");
//             const kb = retrieveKnowledge(query, 3);
//             if (kb) {
//               toolResult = kb;
//             } else {
//               toolResult = "No specific documentation found for that topic. Let the caller know you can create a support ticket if needed.";
//             }
          } else if (toolName === "lookup_certxa_account") {
//             const requestedStoreId = Number(args.storeId);
//             const phone = String(args.phone ?? callerPhone ?? "");
//             const biz = String(args.businessName ?? "");
//             let found: CertxaAccount | null = null;
//
//             if (Number.isInteger(requestedStoreId) && requestedStoreId > 0) {
//               found = await lookupAccountByStoreId(requestedStoreId);
//             }
//             // Fallback discovery is allowed, but only a caller-provided Store ID
//             // marks the account context as verified for diagnosis.
//             if (!found && !requestedStoreId && phone) found = await lookupAccountByPhone(phone);
//             if (!found && !requestedStoreId && biz) {
//               // Search by business name
//               try {
//                 const rows = await db
//                   .select({ id: locations.id, name: locations.name, phone: locations.phone })
//                   .from(locations)
//                   .where(ilike(locations.name, `%${biz}%`))
//                   .limit(3);
//                 if (rows.length) {
//                   found = {
//                     storeId: rows[0].id,
//                     businessName: rows[0].name,
//                     ownerName: null,
//                     phone: rows[0].phone,
//                     subscriptionPlan: null,
//                     accountStatus: "active",
//                     trialEndsAt: null,
//                     locationCount: rows.length,
//                     staffCount: 0,
//                   };
//                 }
//               } catch { /* ignore */ }
//             }
//
//             if (found) {
//               account = found;
//               accountVerifiedByStoreId = Number.isInteger(requestedStoreId) && requestedStoreId === found.storeId;
//               toolResult = `Account found:
// - Store ID: ${found.storeId}
// - Business: ${found.businessName}
// - Plan: ${found.subscriptionPlan ?? "Unknown"}
// - Status: ${found.accountStatus}
// - Locations: ${found.locationCount}
// - Store ID verified: ${accountVerifiedByStoreId ? "yes" : "no — ask the caller for their Store ID before account-specific diagnosis"}`;
//               if (callLogId) {
//                 await updateCallLog(callLogId, {
//                   accountStoreId: found.storeId,
//                   businessName: found.businessName,
//                   subscriptionPlan: found.subscriptionPlan ?? undefined,
//                 }).catch(() => {});
//               }
//             } else {
//               toolResult = "No Certxa account found for that phone or business name. The caller may be a new prospect or calling from a different number.";
//             }
          } else if (toolName === "create_support_ticket") {
            const issue = String(args.issue ?? "");
            const priority = String(args.priority ?? callPriority ?? "normal");
            const name = String(args.name ?? callerNameResolved ?? "");
            const bizName = String(args.businessName ?? ""); // marketplace calls aren't tied to a Certxa store account
            const phone = String(args.phone ?? callerPhone ?? "");
            const email = String(args.email ?? "");

            if (!issue.trim()) {
              toolResult = "Please provide a description of the issue before creating a ticket.";
            } else {
              const ticket = await createTicket({
                name: name || undefined,
                businessName: bizName || undefined,
                phone: phone || undefined,
                email: email || undefined,
                issue,
                priority,
                callSid: callSid ?? undefined,
                callLogId: callLogId ?? undefined,
                accountId: undefined, // marketplace calls aren't tied to a Certxa store account
              });

              if (ticket) {
                callTicketId = ticket.id;
                callOutcome = "ticket_created";
                if (priority === "high" || priority === "urgent") callPriority = priority;
                if (callLogId) {
                  await updateCallLog(callLogId, {
                    outcome: "ticket_created",
                    ticketId: ticket.id,
                    escalated: priority !== "normal",
                    priority,
                  }).catch(() => {});
                }
                toolResult = `Support ticket ${ticket.ticketNumber} created successfully with ${priority} priority. Our team will follow up ${priority === "high" || priority === "urgent" ? "as soon as possible" : "within 1 business day"}.`;
              } else {
                toolResult = "There was an issue creating the ticket. Please try again or note the details manually.";
              }
            }
          } else if (toolName === "get_account_info") {
//             if (account && accountVerifiedByStoreId) {
//               toolResult = `Account information:
// - Business: ${account.businessName}
// - Plan: ${account.subscriptionPlan ?? "Unknown"}
// - Status: ${account.accountStatus}
// - Locations: ${account.locationCount}
// ${account.trialEndsAt ? `- Trial ends: ${account.trialEndsAt}` : ""}`;
//             } else {
//               toolResult = "A caller-provided Store ID has not been verified. Ask for the numeric Store ID, then call lookup_certxa_account with storeId before retrieving account details.";
//             }
//
          } else if (toolName === "run_account_health_check") {
//             if (!account?.storeId || !accountVerifiedByStoreId) {
//               toolResult = "A caller-provided Store ID has not been verified. Ask for it and call lookup_certxa_account with storeId before running diagnostics.";
//             } else {
//               const requestedSegments = Array.isArray(args.segments)
//                 ? args.segments
//                     .map(String)
//                     .filter((value): value is SegmentId => (SEGMENT_IDS as readonly string[]).includes(value))
//                 : undefined;
//               const run = await runHealthCheck({
//                 accountId: account.storeId,
//                 agentId: 0,
//                 agentName: `${SUPPORT_AGENT_NAME} (Telephone AI)`,
//                 segments: requestedSegments?.length ? requestedSegments : undefined,
//                 pool,
//               });
//
//               const findings = Object.values(run.results)
//                 .flatMap((segment) => segment.checks
//                   .filter((check) => check.ownerVisible !== false && check.status !== "pass")
//                   .map((check) => ({
//                     severity: check.status,
//                     area: segment.label,
//                     finding: check.label,
//                     action: check.action ?? null,
//                   })))
//                 .sort((a, b) => (a.severity === "fail" ? 0 : 1) - (b.severity === "fail" ? 0 : 1))
//                 .slice(0, 15);
//
//               toolResult = JSON.stringify({
//                 success: true,
//                 storeId: account.storeId,
//                 summary: {
//                   passed: run.passCount,
//                   warnings: run.warnCount,
//                   failed: run.failCount,
//                 },
//                 findings,
//                 privacyNote: "Caller-safe summary only. Do not infer or reveal omitted raw values.",
//               });
//             }
//
          } else if (toolName === "diagnose_staff_assignment") {
//             if (!account?.storeId || !accountVerifiedByStoreId) {
//               toolResult = "A caller-provided Store ID has not been verified. Verify it before diagnosing staff assignment.";
//             } else {
//               const staffName = String(args.staffName ?? "").trim();
//               if (!staffName) {
//                 toolResult = "Ask the caller which staff member is affected.";
//               } else {
//                 const matches = await pool.query(
//                   `SELECT id, name, status, show_on_calendar
//                    FROM staff
//                    WHERE store_id = $1
//                      AND status NOT IN ('removed', 'deactivated')
//                      AND name ILIKE $2
//                    ORDER BY CASE WHEN LOWER(name) = LOWER($3) THEN 0 ELSE 1 END, name
//                    LIMIT 3`,
//                   [account.storeId, `%${staffName}%`, staffName],
//                 );
//                 const exact = matches.rows.find((row: any) => String(row.name).toLowerCase() === staffName.toLowerCase());
//                 const member = exact ?? (matches.rows.length === 1 ? matches.rows[0] : null);
//                 if (!member) {
//                   toolResult = matches.rows.length > 1
//                     ? `Multiple staff members match that name: ${matches.rows.map((row: any) => row.name).join(", ")}. Ask which one they mean.`
//                     : `No active staff member named ${staffName} was found for Store ID ${account.storeId}.`;
//                 } else {
//                   const [availability, hours, activeServices, assignedServices] = await Promise.all([
//                     pool.query(`SELECT day_of_week, start_time, end_time FROM staff_availability WHERE staff_id = $1`, [member.id]),
//                     pool.query(`SELECT day_of_week, open_time, close_time FROM business_hours WHERE store_id = $1 AND is_closed = false ORDER BY day_of_week`, [account.storeId]),
//                     pool.query(`SELECT id FROM services WHERE store_id = $1 AND is_active = true`, [account.storeId]),
//                     pool.query(
//                       `SELECT ss.service_id FROM staff_services ss
//                        JOIN services s ON s.id = ss.service_id
//                        WHERE ss.staff_id = $1 AND s.store_id = $2 AND s.is_active = true`,
//                       [member.id, account.storeId],
//                     ),
//                   ]);
//                   const missingAvailability = availability.rows.length === 0;
//                   const missingServices = assignedServices.rows.length === 0;
//                   const repairableAvailability = missingAvailability && hours.rows.length > 0;
//                   const repairableServices = missingServices && activeServices.rows.length > 0;
//                   let repairToken: string | null = null;
//                   if (repairableAvailability || repairableServices) {
//                     repairToken = randomUUID();
//                     pendingStaffRepairs.set(repairToken, {
//                       storeId: account.storeId,
//                       staffId: Number(member.id),
//                       staffName: String(member.name),
//                       addAvailability: repairableAvailability,
//                       assignAllServices: repairableServices,
//                       expiresAt: Date.now() + 10 * 60_000,
//                     });
//                   }
//                   toolResult = JSON.stringify({
//                     success: true,
//                     staffName: member.name,
//                     diagnosis: {
//                       hasAvailability: !missingAvailability,
//                       availabilityDays: availability.rows.length,
//                       assignedToActiveServices: assignedServices.rows.length,
//                       activeServicesOffered: activeServices.rows.length,
//                       visibleOnCalendar: member.show_on_calendar !== false,
//                     },
//                     likelyCauses: [
//                       ...(missingAvailability ? ["Staff member has no availability hours."] : []),
//                       ...(missingServices ? ["Staff member is not assigned to any active services."] : []),
//                       ...(member.show_on_calendar === false ? ["Staff member is hidden from the calendar."] : []),
//                     ],
//                     proposedRepair: {
//                       copyOpenBusinessHours: repairableAvailability,
//                       assignAllActiveServices: repairableServices,
//                     },
//                     repairToken,
//                     instruction: repairToken
//                       ? "Explain these exact proposed changes and get explicit caller confirmation before using repair_staff_assignment."
//                       : "No safe automatic repair is available for the detected state.",
//                   });
//                 }
//               }
//             }
//
          } else if (toolName === "repair_staff_assignment") {
//             const repairToken = String(args.repairToken ?? "");
//             const repair = pendingStaffRepairs.get(repairToken);
//             if (!account?.storeId || !accountVerifiedByStoreId) {
//               toolResult = "The Store ID is not verified; no changes were made.";
//             } else if (args.callerConfirmed !== true) {
//               toolResult = "Explicit caller confirmation is required; no changes were made.";
//             } else if (!repair || repair.expiresAt < Date.now() || repair.storeId !== account.storeId) {
//               pendingStaffRepairs.delete(repairToken);
//               toolResult = "That repair authorization is invalid or expired. Re-run the staff diagnosis; no changes were made.";
//             } else {
//               const client = await pool.connect();
//               let availabilityAdded = 0;
//               let servicesAdded = 0;
//               try {
//                 await client.query("BEGIN");
//                 const ownership = await client.query(
//                   `SELECT id FROM staff WHERE id = $1 AND store_id = $2 AND status NOT IN ('removed', 'deactivated') FOR UPDATE`,
//                   [repair.staffId, repair.storeId],
//                 );
//                 if (!ownership.rows.length) throw new Error("Staff member is no longer active at this store.");
//
//                 if (repair.addAvailability) {
//                   const inserted = await client.query(
//                     `INSERT INTO staff_availability (staff_id, day_of_week, start_time, end_time)
//                      SELECT $1, bh.day_of_week, bh.open_time, bh.close_time
//                      FROM business_hours bh
//                      WHERE bh.store_id = $2 AND bh.is_closed = false
//                        AND NOT EXISTS (SELECT 1 FROM staff_availability sa WHERE sa.staff_id = $1)
//                      RETURNING id`,
//                     [repair.staffId, repair.storeId],
//                   );
//                   availabilityAdded = inserted.rowCount ?? 0;
//                 }
//
//                 if (repair.assignAllServices) {
//                   const inserted = await client.query(
//                     `INSERT INTO staff_services (staff_id, service_id)
//                      SELECT $1, s.id FROM services s
//                      WHERE s.store_id = $2 AND s.is_active = true
//                        AND NOT EXISTS (
//                          SELECT 1 FROM staff_services ss WHERE ss.staff_id = $1 AND ss.service_id = s.id
//                        )
//                      RETURNING id`,
//                     [repair.staffId, repair.storeId],
//                   );
//                   servicesAdded = inserted.rowCount ?? 0;
//                 }
//                 await client.query("COMMIT");
//               } catch (err) {
//                 await client.query("ROLLBACK");
//                 throw err;
//               } finally {
//                 client.release();
//               }
//               pendingStaffRepairs.delete(repairToken);
//
//               const affectedDates = buildDateRange(14);
//               for (const date of affectedDates) {
//                 void enqueueAvailabilityInvalidation(repair.storeId, date, "schedule_updated");
//               }
//               void enqueueSlotRebuild(repair.storeId, affectedDates, "schedule_updated");
//               const verification = await runHealthCheck({
//                 accountId: repair.storeId,
//                 agentId: 0,
//                 agentName: `${SUPPORT_AGENT_NAME} (Telephone AI repair verification)`,
//                 segments: ["booking_readiness"],
//                 pool,
//               });
//               console.log(`${LOG_PREFIX} Staff assignment repair`, {
//                 storeId: repair.storeId,
//                 staffId: repair.staffId,
//                 availabilityAdded,
//                 servicesAdded,
//                 healthCheckRunId: verification.id,
//               });
//               toolResult = JSON.stringify({
//                 success: true,
//                 staffName: repair.staffName,
//                 availabilityDaysAdded: availabilityAdded,
//                 activeServiceAssignmentsAdded: servicesAdded,
//                 verification: {
//                   warnings: verification.warnCount,
//                   failures: verification.failCount,
//                 },
//                 message: "The approved staff assignment repair was applied and booking readiness was rechecked.",
//               });
//             }
//
          } else if (toolName === "get_open_tickets") {
//             const searchPhone = String(args.phone ?? callerPhone ?? "");
//             const tenDigit = searchPhone ? toTenDigit(searchPhone) ?? searchPhone : null;
//             try {
//               const conditions: ReturnType<typeof eq>[] = [];
//               if (tenDigit) {
//                 conditions.push(ilike(supportTickets.phone, `%${tenDigit}%`) as any);
//               }
//               if (account?.storeId && accountVerifiedByStoreId) {
//                 // also check by business name to catch tickets logged under the business
//                 conditions.push(ilike(supportTickets.businessName, `%${account.businessName}%`) as any);
//               }
//
//               if (!conditions.length) {
//                 toolResult = "No phone or account info available to search tickets.";
//               } else {
//                 const rows = await db
//                   .select({
//                     id: supportTickets.id,
//                     issue: supportTickets.issue,
//                     status: supportTickets.status,
//                     priority: supportTickets.priority,
//                     createdAt: supportTickets.createdAt,
//                   })
//                   .from(supportTickets)
//                   .where(or(...conditions))
//                   .orderBy(desc(supportTickets.createdAt))
//                   .limit(5);
//
//                 const open = rows.filter((r) => r.status === "open" || r.status === "in_progress");
//                 if (!rows.length) {
//                   toolResult = "No existing support tickets found for this caller.";
//                 } else {
//                   const lines = rows.map(
//                     (r) => `Ticket #${r.id} [${r.status}/${r.priority}] — ${(r.issue ?? "").substring(0, 120)} (${new Date(r.createdAt).toLocaleDateString()})`,
//                   );
//                   toolResult = `Found ${rows.length} ticket(s) (${open.length} open/in-progress):\n${lines.join("\n")}`;
//                 }
//               }
//             } catch (err) {
//               console.error(`${LOG_PREFIX} get_open_tickets error:`, err);
//               toolResult = "Could not retrieve ticket history right now.";
//             }
//
          } else if (toolName === "get_subscription_details") {
//             if (!account?.storeId || !accountVerifiedByStoreId) {
//               toolResult = "A caller-provided Store ID has not been verified. Ask for it and call lookup_certxa_account with storeId before retrieving subscription details.";
//             } else {
//               try {
//                 const rows = await db
//                   .select({
//                     planCode: subscriptionPlans.code,
//                     planName: subscriptionPlans.name,
//                     status: storeSubscriptions.status,
//                     currentPeriodStart: storeSubscriptions.currentPeriodStart,
//                     currentPeriodEnd: storeSubscriptions.currentPeriodEnd,
//                     canceledAt: storeSubscriptions.canceledAt,
//                     priceMonthly: subscriptionPlans.priceMonthly,
//                     priceYearly: subscriptionPlans.priceYearly,
//                   } as any)
//                   .from(storeSubscriptions)
//                   .innerJoin(subscriptionPlans, eq((storeSubscriptions as any).planId, subscriptionPlans.id))
//                   .where(
//                     and(
//                       eq((storeSubscriptions as any).storeId, account.storeId),
//                       inArray((storeSubscriptions as any).status, ["active", "trialing", "past_due"]),
//                     )
//                   )
//                   .orderBy(desc((storeSubscriptions as any).createdAt))
//                   .limit(1);
//
//                 if (!rows.length) {
//                   // Fall back to preferences-based planId
//                   toolResult = `No active subscription record found. Account preferences show plan: ${account.subscriptionPlan ?? "Unknown"}.${account.trialEndsAt ? ` Trial ends: ${account.trialEndsAt}.` : ""}`;
//                 } else {
//                   const sub = rows[0] as any;
//                   const monthlyDollars = sub.priceMonthly ? `$${(sub.priceMonthly / 100).toFixed(2)}/mo` : "custom";
//                   const lines = [
//                     `Plan: ${sub.planName} (${sub.planCode})`,
//                     `Status: ${sub.status}`,
//                     `Monthly price: ${monthlyDollars}`,
//                   ];
//                   if (sub.currentPeriodEnd) lines.push(`Current period ends: ${new Date(sub.currentPeriodEnd).toLocaleDateString()}`);
//                   if (sub.trialEnd) lines.push(`Trial ends: ${new Date(sub.trialEnd).toLocaleDateString()}`);
//                   if (sub.cancelAt) lines.push(`Scheduled to cancel: ${new Date(sub.cancelAt).toLocaleDateString()}`);
//                   toolResult = lines.join("\n");
//                 }
//               } catch (err) {
//                 console.error(`${LOG_PREFIX} get_subscription_details error:`, err);
//                 toolResult = `Could not retrieve subscription details. Account shows plan: ${account.subscriptionPlan ?? "Unknown"}.`;
//               }
//             }
//
          } else if (toolName === "send_follow_up_email") {
            const toEmail = String(args.email ?? "").trim();
            const callerName = String(args.name ?? callerNameResolved ?? "");
            const summary = String(args.summary ?? "");
            const ticketId = args.ticketId ? Number(args.ticketId) : (callTicketId ?? null);

            if (!toEmail || !toEmail.includes("@")) {
              toolResult = "A valid email address is required to send the follow-up. Please ask the caller for their email address.";
            } else if (!summary.trim()) {
              toolResult = "A summary of the issue is required before sending the email.";
            } else {
              const ticketRef = ticketId ? `<p><strong>Support Ticket #${ticketId}</strong> has been created. Our team will follow up within 1 business day.</p>` : "";
              const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333">
  <div style="background:#1a1a2e;padding:24px 32px;border-radius:8px 8px 0 0">
    <h1 style="color:#fff;margin:0;font-size:22px">Certxa Support</h1>
    <p style="color:#a0aec0;margin:6px 0 0">Your support summary</p>
  </div>
  <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
    <p>Hi ${callerName || "there"},</p>
    <p>Thank you for contacting Certxa support. Here's a summary of your call:</p>
    <div style="background:#f7fafc;border-left:4px solid #667eea;padding:16px 20px;margin:16px 0;border-radius:0 4px 4px 0">
      <p style="margin:0;white-space:pre-line">${summary.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
    </div>
    ${ticketRef}
    <p>If you have any further questions, don't hesitate to call us again.</p>
    <p style="margin-top:32px;color:#718096;font-size:13px">
      Certxa Support Team<br>
      This email was sent from an automated support call.
    </p>
  </div>
</div>`;
              const text = `Hi ${callerName || "there"},\n\nThank you for contacting Certxa support.\n\n${summary}${ticketId ? `\n\nSupport Ticket #${ticketId} has been created.` : ""}\n\nCertxa Support Team`;
              try {
                const result = await sendEmail(
                  0, // marketplace calls aren't tied to a Certxa store account — sendEmail only uses this for logging
                  toEmail,
                  ticketId ? `Your Certxa Support Summary — Ticket #${ticketId}` : "Your Certxa Support Summary",
                  html,
                  text,
                  `support@certxa.com`,
                );
                if (result.success) {
                  toolResult = `Follow-up email sent to ${toEmail} successfully.`;
                } else {
                  toolResult = `Could not send the email right now (${result.error ?? "mail service unavailable"}). I've noted your email address in the ticket.`;
                }
              } catch (err) {
                console.error(`${LOG_PREFIX} send_follow_up_email error:`, err);
                toolResult = "Could not send the email right now. I've noted your email address in the ticket.";
              }
            }

          } else if (toolName === "mark_call_resolved") {
            const summary = String(args.summary ?? "");
            const callerName = String(args.callerName ?? "");
            callOutcome = "resolved";
            if (callerName) callerNameResolved = callerName;
            if (callLogId) {
              await updateCallLog(callLogId, {
                outcome: "resolved",
                summary: summary || undefined,
                callerName: callerName || undefined,
              }).catch(() => {});
            }
            toolResult = "Call marked as resolved. Summary recorded.";

          } else if (toolName === "lookup_voucher_by_code") {
            const rawCode = String(args.code ?? "").trim();
            if (!rawCode) {
              toolResult = "A voucher number is required to look it up.";
            } else {
              try {
                const candidates = voucherCodeCandidates(rawCode);
                const [row] = await db
                  .select({
                    id: dealVouchers.id,
                    code: dealVouchers.code,
                    status: dealVouchers.status,
                    customerName: dealVouchers.customerName,
                    purchasedAt: dealVouchers.purchasedAt,
                    expiresAt: dealVouchers.expiresAt,
                    dealTitle: deals.title,
                    dealPrice: deals.dealPrice,
                  })
                  .from(dealVouchers)
                  .innerJoin(deals, eq(dealVouchers.dealId, deals.id))
                  .where(inArray(dealVouchers.code, candidates))
                  .limit(1);

                if (!row) {
                  toolResult = `No voucher found with number ${rawCode}. Double check the number with the caller — it's 13 digits in three groups: three digits, three digits, then seven digits.`;
                } else {
                  const price = row.dealPrice ? `$${Number(row.dealPrice).toFixed(2)}` : "N/A";
                  const purchased = row.purchasedAt ? new Date(row.purchasedAt).toLocaleDateString() : "N/A";
                  const expires = row.expiresAt ? new Date(row.expiresAt).toLocaleDateString() : "N/A";
                  toolResult = `Voucher ID: ${row.id} | Code: ${row.code} | Name on order: ${row.customerName ?? "not on file"} | Deal: ${row.dealTitle} | Status: ${voucherStatusLabel(row.status)} | Price: ${price} | Purchased: ${purchased} | Expires: ${expires}\nConfirm the name on the order with the caller before sharing further details or processing a refund.`;
                }
              } catch (err) {
                console.error(`${LOG_PREFIX} lookup_voucher_by_code error:`, err);
                toolResult = "Could not look up that voucher right now. Please try again.";
              }
            }

          } else if (toolName === "lookup_vouchers_by_phone") {
            const tenDigit = String(args.phone ?? "").replace(/\D/g, "").slice(-10);
            if (tenDigit.length !== 10) {
              toolResult = "A valid 10-digit mobile phone number, including area code, is required to look up vouchers.";
            } else {
              try {
                const rows = await db
                  .select({
                    id: dealVouchers.id,
                    code: dealVouchers.code,
                    status: dealVouchers.status,
                    customerName: dealVouchers.customerName,
                    purchasedAt: dealVouchers.purchasedAt,
                    expiresAt: dealVouchers.expiresAt,
                    dealTitle: deals.title,
                    dealPrice: deals.dealPrice,
                  })
                  .from(dealVouchers)
                  .innerJoin(deals, eq(dealVouchers.dealId, deals.id))
                  .where(ilike(dealVouchers.customerPhone, `%${tenDigit}%`))
                  .orderBy(desc(dealVouchers.purchasedAt));

                if (!rows.length) {
                  toolResult = `No deal vouchers found for phone number ${tenDigit}.`;
                } else {
                  const lines = rows.map((r) => {
                    const price = r.dealPrice ? `$${Number(r.dealPrice).toFixed(2)}` : "N/A";
                    const purchased = r.purchasedAt ? new Date(r.purchasedAt).toLocaleDateString() : "N/A";
                    const expires = r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : "N/A";
                    // Only show last 4 digits of voucher code until identity is confirmed
                    const codeDisplay = r.code ? `****${r.code.slice(-4)}` : "N/A";
                    return `Voucher ID: ${r.id} | Code: ${codeDisplay} | Name on order: ${r.customerName ?? "not on file"} | Deal: ${r.dealTitle} | Status: ${voucherStatusLabel(r.status)} | Price: ${price} | Purchased: ${purchased} | Expires: ${expires}`;
                  });
                  toolResult = `Found ${rows.length} voucher(s) for that phone number:\n${lines.join("\n")}\nConfirm the name on the relevant order with the caller before sharing further details or processing a refund.`;
                }
              } catch (err) {
                console.error(`${LOG_PREFIX} lookup_vouchers_by_phone error:`, err);
                toolResult = "Could not look up vouchers right now. Please try again.";
              }
            }

          } else if (toolName === "process_voucher_refund") {
            const voucherId = Number(args.voucherId);
            const callerConfirmed = args.callerConfirmed === true;

            if (!Number.isInteger(voucherId) || voucherId <= 0) {
              toolResult = "A valid voucher ID is required.";
            } else if (!callerConfirmed) {
              toolResult = "Explicit caller confirmation is required before processing a refund. Please confirm with the caller and set callerConfirmed to true.";
            } else {
              try {
                // First, look up the voucher to check eligibility
                const [voucher] = await db
                  .select({
                    id: dealVouchers.id,
                    code: dealVouchers.code,
                    status: dealVouchers.status,
                    purchasedAt: dealVouchers.purchasedAt,
                    stripePaymentIntentId: dealVouchers.stripePaymentIntentId,
                    dealTitle: deals.title,
                    dealPrice: deals.dealPrice,
                  })
                  .from(dealVouchers)
                  .innerJoin(deals, eq(dealVouchers.dealId, deals.id))
                  .where(eq(dealVouchers.id, voucherId))
                  .limit(1);

                // Refund policy: full refund if purchased within REFUND_WINDOW_DAYS
                // and not yet redeemed — this is independent of the voucher's own
                // booking-expiry status, which only governs redemption, not refunds.
                const daysSincePurchase = voucher?.purchasedAt
                  ? (Date.now() - new Date(voucher.purchasedAt).getTime()) / (24 * 60 * 60 * 1000)
                  : Infinity;

                if (!voucher) {
                  toolResult = `Voucher ID ${voucherId} not found.`;
                } else if (voucher.status === "redeemed") {
                  toolResult = `Voucher ${voucher.code} (${voucher.dealTitle}) has already been redeemed and cannot be refunded.`;
                } else if (voucher.status === "refunded") {
                  toolResult = `Voucher ${voucher.code} (${voucher.dealTitle}) has already been refunded.`;
                } else if (daysSincePurchase > REFUND_WINDOW_DAYS) {
                  toolResult = `Voucher ${voucher.code} (${voucher.dealTitle}) was purchased more than ${REFUND_WINDOW_DAYS} days ago, so it's outside our refund window. Create a support ticket if the caller would like this reviewed manually.`;
                } else if (!voucher.stripePaymentIntentId) {
                  toolResult = `Voucher ${voucher.code} (${voucher.dealTitle}) does not have a Stripe payment intent ID. Cannot process automatic refund — please create a support ticket for manual review.`;
                } else if (!isStripeConfigured()) {
                  toolResult = "Refund processing is temporarily unavailable. Please create a support ticket for manual review.";
                } else {
                  // Process the refund via Stripe
                  const refund = await stripe.refunds.create({
                    payment_intent: voucher.stripePaymentIntentId,
                    reason: "requested_by_customer",
                  });

                  // Update voucher status to refunded
                  await db
                    .update(dealVouchers)
                    .set({ status: "refunded" })
                    .where(eq(dealVouchers.id, voucherId));

                  const price = voucher.dealPrice ? `$${Number(voucher.dealPrice).toFixed(2)}` : "the full amount";
                  toolResult = `Refund processed successfully for voucher ${voucher.code} (${voucher.dealTitle}). ${price} has been refunded to the original payment method (Stripe refund ID: ${refund.id}). The refund typically appears in 5-10 business days.`;
                }
              } catch (err) {
                console.error(`${LOG_PREFIX} process_voucher_refund error:`, err);
                toolResult = "Could not process the refund right now. Please try again or create a support ticket for manual review.";
              }
            }

          } else {
            toolResult = `Tool '${toolName}' is not available.`;
          }
        } catch (err) {
          console.error(`${LOG_PREFIX} Tool error (${toolName}):`, err);
          toolResult = "I had trouble retrieving that information. Let me try another approach.";
        }

        isProcessingTool = false;

        if (openAiWs.readyState !== WebSocket.OPEN) return;

        openAiWs.send(JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callItemId,
            output: toolResult,
          },
        }));

        generateSpeech(capturedTurnId, `tool_result:${toolName}`);
      })();
      return;
    }
  });

  openAiWs.on("error", (err) => {
    console.error(`${LOG_PREFIX} OpenAI WebSocket error:`, err);
  });

  openAiWs.on("close", (code, reason) => {
    console.log(`${LOG_PREFIX} OpenAI WebSocket closed: ${code} ${reason}`);
  });

  // ── Twilio message handler ──────────────────────────────────────────────────
  twilioWs.on("message", (rawData: Buffer | string) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(rawData.toString()); } catch { return; }
    const event = msg.event as string;

    if (event === "start") {
      const start = msg.start as Record<string, unknown> | undefined;
      streamSid = (start?.streamSid as string | undefined) ?? null;
      callSid = (start?.callSid as string | undefined) ?? null;
      const params = (start?.customParameters as Record<string, string> | undefined) ?? {};
      const fromRaw = params.from ?? "";
      callerPhone = toTenDigit(fromRaw) ?? (fromRaw || null);

      console.log(`${LOG_PREFIX} Call started — sid=${callSid} caller=${callerPhone ?? "(unknown)"}`);

      startReceived = true;
      configureSessionIfReady().catch((err) =>
        console.error(`${LOG_PREFIX} configureSessionIfReady error:`, err)
      );
      return;
    }

    if (event === "media") {
      const payload = (msg.media as any)?.payload as string | undefined;
      if (!payload || !sessionUpdated || !acceptingCallerAudio) return;
      if (openAiWs.readyState !== WebSocket.OPEN) return;
      inboundAudioCount++;
      const pcm24k = twilioUlawBase64ToPcm16_24kBase64(payload);
      if (pcm24k) {
        openAiWs.send(JSON.stringify({
          type: "input_audio_buffer.append",
          audio: pcm24k,
        }));
      }
      return;
    }

    if (event === "mark") {
      const markName = String((msg.mark as Record<string, unknown> | undefined)?.name ?? "");
      if (pendingPlaybackMark && markName === pendingPlaybackMark) {
        pendingPlaybackMark = null;
        callerSpeaking = false;
        acceptingCallerAudio = true;
        console.log(`${LOG_PREFIX} Brian playback complete — listening for caller`);
      }
      return;
    }

    if (event === "stop") {
      console.log(`${LOG_PREFIX} Twilio stream stopped — sid=${callSid}`);

      // Finalize call log
      const durationSeconds = Math.round((Date.now() - callStartTime.getTime()) / 1000);
      if (callLogId) {
        updateCallLog(callLogId, {
          callSid: callSid ?? undefined,
          outcome: callOutcome !== "in_progress" ? callOutcome : "no_action",
          escalated: callPriority !== "normal",
          priority: callPriority,
          durationSeconds,
          ticketId: callTicketId ?? undefined,
          transcript,
          endedAt: new Date(),
        }).catch(() => {});
      }

      try { openAiWs.close(); } catch { /* ignore */ }
    }
  });

  twilioWs.on("close", () => {
    console.log(`${LOG_PREFIX} Twilio WebSocket closed`);
    if (sessionUpdateTimeoutHandle) clearTimeout(sessionUpdateTimeoutHandle);
    if (commitNudgeTimer) clearTimeout(commitNudgeTimer);
    try { openAiWs.close(); } catch { /* ignore */ }
  });

  twilioWs.on("error", (err) => {
    console.error(`${LOG_PREFIX} Twilio WebSocket error:`, err);
  });
}

// ─── Route Registration ────────────────────────────────────────────────────────

export function setupSupportAgentRoutes(httpServer: HttpServer, app: Express): void {
  // Load knowledge base at startup
  loadKnowledgeBase();

  const apiKeyPresent = Boolean(
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY
  );
  if (!apiKeyPresent) {
    console.warn(`${LOG_PREFIX} ⚠️  No OpenAI key configured. Routes registered but calls will fail.`);
  }

  // ── Health check ────────────────────────────────────────────────────────────
  app.get("/api/support-agent/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      openaiKeyPresent: apiKeyPresent,
      twilioAuthConfigured: Boolean(process.env.TWILIO_AUTH_TOKEN),
      publicAppUrlConfigured: Boolean(process.env.APP_URL || process.env.REPLIT_DEV_DOMAIN),
      agentName: SUPPORT_AGENT_NAME,
      voice: SUPPORT_AGENT_VOICE,
      knowledgeBaseDocuments: knowledgeBase.length,
    });
  });

  // ── Twilio webhook ──────────────────────────────────────────────────────────
  app.post("/api/webhook/twilio/support", (req: Request, res: Response) => {
    console.log(`${LOG_PREFIX} Twilio webhook received`);

    const appUrl = getPublicAppUrl(req);
    if (!appUrl) {
      console.error(`${LOG_PREFIX} APP_URL is required to construct the media stream URL.`);
      return res.status(503).type("text/xml").send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Certxa support is temporarily unavailable. Please try again later.</Say><Hangup/></Response>`,
      );
    }

    if (!isValidTwilioWebhook(req, appUrl)) {
      console.warn(`${LOG_PREFIX} Rejected webhook with an invalid Twilio signature.`);
      return res.status(403).type("text/plain").send("Forbidden");
    }

    const callSidRaw = ((req.body?.CallSid as string | undefined) ?? "").trim();
    if (!callSidRaw) {
      return res.status(200).type("text/plain").send("ok");
    }

    const callerPhoneRaw = (req.body?.From as string | undefined) ?? "";
    const callerPhone = toTenDigit(callerPhoneRaw) ?? callerPhoneRaw;

    const streamUrl = `${appUrl.replace(/^http/i, "ws")}/support-agent-stream`;

    console.log(`${LOG_PREFIX} Incoming call from ${callerPhone} → ${streamUrl}`);

    return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="from" value="${escapeXml(callerPhone)}" />
    </Stream>
  </Connect>
</Response>`);
  });

  // ── WebSocket server ────────────────────────────────────────────────────────
  const supportWss = new WebSocketServer({ noServer: true });

  supportWss.on("connection", (ws: WebSocket) => {
    console.log(`${LOG_PREFIX} WebSocket connection accepted`);
    createSupportCallSession(ws);
  });

  supportWss.on("error", (err: Error) => {
    console.error(`${LOG_PREFIX} WebSocketServer error:`, err);
  });

  httpServer.on("upgrade", (req, socket, head) => {
    const pathname = req.url?.split("?")[0] ?? "";
    if (pathname === "/support-agent-stream") {
      console.log(`${LOG_PREFIX} WS upgrade → /support-agent-stream`);
      supportWss.handleUpgrade(req as Request, socket as any, head, (ws) => {
        supportWss.emit("connection", ws, req);
      });
    }
  });

  // ─── Admin API: Live notification stream (SSE) ───────────────────────────────

  app.get("/api/admin/support-agent/live-events", isAdminAuthenticated, (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    res.write(": connected\n\n");

    sseClients.add(res);
    console.log(`${LOG_PREFIX} SSE client connected (total: ${sseClients.size})`);

    const heartbeat = setInterval(() => {
      try { res.write(": heartbeat\n\n"); } catch { /* closed */ }
    }, 25_000);

    req.on("close", () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
      console.log(`${LOG_PREFIX} SSE client disconnected (total: ${sseClients.size})`);
    });
  });

  // ─── Admin API: Tickets ──────────────────────────────────────────────────────

  app.get("/api/admin/support-agent/tickets", isAdminAuthenticated, async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string | undefined;
      const priority = req.query.priority as string | undefined;
      const search = req.query.search as string | undefined;
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const offset = Number(req.query.offset ?? 0);

      let query = db.select().from(supportTickets) as any;

      const conditions: any[] = [];
      if (status) conditions.push(eq(supportTickets.status, status));
      if (priority) conditions.push(eq(supportTickets.priority, priority));
      if (search) {
        conditions.push(
          or(
            ilike(supportTickets.name, `%${search}%`),
            ilike(supportTickets.businessName, `%${search}%`),
            ilike(supportTickets.issue, `%${search}%`),
            ilike(supportTickets.phone, `%${search}%`),
          )
        );
      }

      if (conditions.length) query = query.where(and(...conditions));

      const tickets = await query
        .orderBy(desc(supportTickets.createdAt))
        .limit(limit)
        .offset(offset);

      const [{ total }] = await db.select({ total: count() }).from(supportTickets);

      res.json({ tickets, total });
    } catch (err) {
      console.error(`${LOG_PREFIX} Admin tickets error:`, err);
      res.status(500).json({ message: "Failed to fetch tickets" });
    }
  });

  app.get("/api/admin/support-agent/tickets/:id", isAdminAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      res.json(ticket);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch ticket" });
    }
  });

  app.patch("/api/admin/support-agent/tickets/:id", isAdminAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const { status, priority, internalNotes } = req.body as Record<string, string>;

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (status) patch.status = status;
      if (priority) patch.priority = priority;
      if (internalNotes !== undefined) patch.internalNotes = internalNotes;
      if (status === "resolved") patch.resolvedAt = new Date();

      const [updated] = await db
        .update(supportTickets)
        .set(patch as any)
        .where(eq(supportTickets.id, id))
        .returning();

      if (!updated) return res.status(404).json({ message: "Ticket not found" });
      res.json(updated);
    } catch (err) {
      console.error(`${LOG_PREFIX} Patch ticket error:`, err);
      res.status(500).json({ message: "Failed to update ticket" });
    }
  });

  // ─── Admin API: Call Logs ───────────────────────────────────────────────────

  app.get("/api/admin/support-agent/call-logs", isAdminAuthenticated, async (req: Request, res: Response) => {
    try {
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const offset = Number(req.query.offset ?? 0);

      const logs = await db
        .select()
        .from(supportCallLogs)
        .orderBy(desc(supportCallLogs.startedAt))
        .limit(limit)
        .offset(offset);

      const [{ total }] = await db.select({ total: count() }).from(supportCallLogs);
      res.json({ logs, total });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch call logs" });
    }
  });

  // ─── Admin API: Analytics ───────────────────────────────────────────────────

  app.get("/api/admin/support-agent/analytics", isAdminAuthenticated, async (req: Request, res: Response) => {
    try {
      const [ticketStats] = await db
        .select({
          total: count(),
          open: sql<number>`COUNT(*) FILTER (WHERE status = 'open')`,
          inProgress: sql<number>`COUNT(*) FILTER (WHERE status = 'in_progress')`,
          resolved: sql<number>`COUNT(*) FILTER (WHERE status = 'resolved')`,
          high: sql<number>`COUNT(*) FILTER (WHERE priority = 'high')`,
          urgent: sql<number>`COUNT(*) FILTER (WHERE priority = 'urgent')`,
        })
        .from(supportTickets);

      const [callStats] = await db
        .select({
          total: count(),
          resolved: sql<number>`COUNT(*) FILTER (WHERE outcome = 'resolved')`,
          escalated: sql<number>`COUNT(*) FILTER (WHERE escalated = true)`,
          ticketCreated: sql<number>`COUNT(*) FILTER (WHERE outcome = 'ticket_created')`,
          avgDuration: sql<number>`ROUND(AVG(duration_seconds))`,
        })
        .from(supportCallLogs);

      res.json({
        tickets: ticketStats,
        calls: callStats,
        knowledgeBaseDocuments: knowledgeBase.length,
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // ─── Owner: Support Chat Info ────────────────────────────────────────────────

  app.get("/api/support-chat/info", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ error: "No store selected" });

      const [row] = await db
        .select({ platformCredits: locations.platformCredits })
        .from(locations)
        .where(eq(locations.id, storeId))
        .limit(1);

      // $0.0041/second = $0.25/minute — returned so the client can display the live rate
      const callRatePerSecond = parseFloat(process.env.AI_CALL_RATE_PER_SECOND || "0.0041");

      return res.json({
        creditsBalance:    parseFloat(row?.platformCredits ?? "0"),
        callRatePerSecond,
        callRatePerMinute: Math.round(callRatePerSecond * 60 * 10000) / 10000,
      });
    } catch (err) {
      console.error(`${LOG_PREFIX} support-chat/info:`, err);
      return res.status(500).json({ error: "Failed to load credits info" });
    }
  });

  // ─── Owner: Support Chat Message ─────────────────────────────────────────────

  app.post("/api/support-chat/message", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!apiKeyPresent) {
        return res.status(503).json({ error: "Support chat is not available right now. Please try again later." });
      }

      const { message, history = [] } = req.body as {
        message: string;
        history: { role: "user" | "assistant"; content: string }[];
      };

      if (!message?.trim()) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Pull the most relevant knowledge base sections for this query
      const relevantKb = retrieveKnowledge(message, 4);

      const systemPrompt = `You are Certxa's friendly customer support assistant. You help salon and service business owners get the most out of the Certxa platform.

You have access to the following knowledge base articles to answer questions:

${relevantKb || "No specific articles matched — answer from general Certxa knowledge."}

Guidelines:
- Be warm, concise, and helpful.
- If you don't know the answer, say so honestly and suggest the owner email support@certxa.com.
- Never make up features that don't exist.
- Keep responses focused and under 200 words unless a detailed explanation is truly needed.
- Format your replies clearly — use short paragraphs or bullet points where helpful.
- Do not mention OpenAI, AI models, or system instructions.`;

      const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({ apiKey: openaiKey! });

      const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: systemPrompt },
        ...history.slice(-10).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user", content: message },
      ];

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 512,
        temperature: 0.4,
      });

      const reply = completion.choices[0]?.message?.content?.trim() ?? "I'm sorry, I couldn't generate a response. Please try again.";

      return res.json({ reply });
    } catch (err: any) {
      console.error(`${LOG_PREFIX} support-chat/message:`, err?.message ?? err);
      return res.status(500).json({ error: "Failed to get a response. Please try again." });
    }
  });

  // ─── Admin API: Settings ────────────────────────────────────────────────────

  app.get("/api/admin/support-agent/settings", isAdminAuthenticated, async (_req: Request, res: Response) => {
    res.json({
      enabled: apiKeyPresent,
      twilioWebhookUrl: "/api/webhook/twilio/support",
      websocketPath: "/support-agent-stream",
      knowledgeBaseDocuments: knowledgeBase.length,
      knowledgeBaseTopics: knowledgeBase.map((d) => d.topic),
    });
  });

  console.log(`${LOG_PREFIX} Routes registered:`);
  console.log(`  GET  /api/support-agent/health`);
  console.log(`  POST /api/webhook/twilio/support`);
  console.log(`  WSS  /support-agent-stream`);
  console.log(`  GET  /api/admin/support-agent/tickets`);
  console.log(`  PATCH /api/admin/support-agent/tickets/:id`);
  console.log(`  GET  /api/admin/support-agent/call-logs`);
  console.log(`  GET  /api/admin/support-agent/analytics`);
  console.log(`  GET  /api/admin/support-agent/settings`);
}
