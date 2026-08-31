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
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { db } from "../db";
import {
  locations,
  storeSettings,
  users,
  supportTickets,
  supportCallLogs,
  storeSubscriptions,
  subscriptionPlans,
} from "@shared/schema";
import { eq, desc, ilike, or, sql, count, and, inArray } from "drizzle-orm";
import { sendEmail } from "../mail";
import { isAuthenticated, isAdminAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { publishCrossProcess, subscribeCrossProcess, isCrossProcessBusAvailable } from "../lib/wsBroadcastBus";

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

// ─── Audio conversion helpers (same as aiReceptionist) ─────────────────────────

function linear16ToMuLaw(sample: number): number {
  const MU_LAW_MAX = 0x1fff;
  const BIAS = 0x84;
  let pcm = Math.max(-32768, Math.min(32767, sample));
  let sign = 0;
  if (pcm < 0) { pcm = -pcm; sign = 0x80; }
  pcm = pcm + BIAS;
  if (pcm > MU_LAW_MAX) pcm = MU_LAW_MAX;
  let exponent = 7;
  for (let expMask = 0x4000; (pcm & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) { }
  const mantissa = (pcm >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

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

function pcm16Base64ToTwilioUlawBase64(base64Pcm16: string): string {
  const pcm = Buffer.from(base64Pcm16, "base64");
  if (pcm.length < 2) return "";
  const sampleCount = Math.floor(pcm.length / 2);
  const outLen = Math.floor(sampleCount / 3);
  const ulaw = Buffer.allocUnsafe(Math.max(outLen, 0));
  let outIdx = 0;
  for (let i = 0; i + 1 < pcm.length; i += 6) {
    const sample = pcm.readInt16LE(i);
    ulaw[outIdx++] = linear16ToMuLaw(sample);
  }
  return ulaw.subarray(0, outIdx).toString("base64");
}

function toTenDigit(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return null;
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

// ─── Customer Account Lookup ───────────────────────────────────────────────────

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

async function lookupAccountByPhone(callerPhone: string): Promise<CertxaAccount | null> {
  if (!callerPhone) return null;
  const tenDigit = toTenDigit(callerPhone);
  if (!tenDigit) return null;

  try {
    // Try to find by location phone number
    const rows = await db
      .select({
        id: locations.id,
        name: locations.name,
        phone: locations.phone,
        storeId: locations.id,
      })
      .from(locations)
      .where(
        or(
          ilike(locations.phone, `%${tenDigit}%`),
          ilike(locations.phone, `%${callerPhone}%`),
        )
      )
      .limit(1);

    if (!rows.length) return null;
    const loc = rows[0];

    // Count locations for this business group (same name prefix)
    const allLocs = await db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.name, loc.name));

    // Get subscription info from store settings
    let subscriptionPlan: string | null = null;
    let trialEndsAt: string | null = null;
    try {
      const [settings] = await db
        .select({ preferences: storeSettings.preferences })
        .from(storeSettings)
        .where(eq(storeSettings.storeId, loc.storeId))
        .limit(1);
      if (settings?.preferences) {
        const prefs = JSON.parse(settings.preferences) as Record<string, unknown>;
        if (typeof prefs.planId === "string") subscriptionPlan = prefs.planId;
        if (typeof prefs.trialEndsAt === "string") trialEndsAt = prefs.trialEndsAt;
      }
    } catch { /* non-critical */ }

    return {
      storeId: loc.storeId,
      businessName: loc.name,
      ownerName: null,
      phone: loc.phone,
      subscriptionPlan: subscriptionPlan ?? "Unknown",
      accountStatus: "active",
      trialEndsAt,
      locationCount: allLocs.length,
      staffCount: 0,
    };
  } catch (err) {
    console.error(`${LOG_PREFIX} Account lookup error:`, err);
    return null;
  }
}

// ─── Emergency Phrase Detection ───────────────────────────────────────────────

const EMERGENCY_PHRASES = [
  "system down",
  "cannot process payment",
  "can't process payment",
  "booking system not working",
  "appointments disappeared",
  "customers missing",
  "payroll incorrect",
  "reports incorrect",
  "website offline",
  "website is down",
  "completely down",
  "nothing is working",
  "lost all my data",
  "data is gone",
];

function isEmergency(text: string): boolean {
  const lower = text.toLowerCase();
  return EMERGENCY_PHRASES.some((p) => lower.includes(p));
}

// ─── OpenAI Session Config ─────────────────────────────────────────────────────

function buildSupportSessionConfig(
  callerPhone: string | null,
  account: CertxaAccount | null,
  relevantKb: string,
): object {
  const hasAccount = Boolean(account);
  const greeting = hasAccount
    ? `Welcome back to Certxa support, ${account!.businessName}. I'm happy to help you today.`
    : "Thank you for calling Certxa support. I'm here to help you.";

  const accountBlock = hasAccount
    ? `
CALLER ACCOUNT (read-only — never modify, never promise changes):
- Business: ${account!.businessName}
- Plan: ${account!.subscriptionPlan ?? "Unknown"}
- Status: ${account!.accountStatus}
- Locations: ${account!.locationCount}
${account!.trialEndsAt ? `- Trial ends: ${account!.trialEndsAt}` : ""}
`
    : callerPhone
    ? `No Certxa account found for this phone number (${callerPhone}). The caller may be a new prospect or calling from a different number.`
    : "Caller ID is not available. Ask for their business name or email to look up their account.";

  const kbBlock = relevantKb
    ? `\n\nKNOWLEDGE BASE:\n${relevantKb}`
    : "";

  const instructions = `You are a professional customer success and technical support representative for Certxa — a salon and service business management platform.

Your name is not mentioned — just introduce yourself as "Certxa support".

Your FIRST spoken response must be exactly: "${greeting} How can I help you today?"

ROLE:
You help existing Certxa customers with:
- Online booking system and scheduling
- Front desk management and check-in
- Appointment management and calendar
- Technician turn system and revenue-based rotation
- POS system and payment processing
- Customer and client management
- Payroll and commission tracking
- Employee and staff management
- Salon websites and online presence
- SMS and email notifications
- Reports and analytics
- Memberships and gift cards
- Stripe billing and payment setup
- Subscription and plan management
- Account settings and user permissions
- Multi-location management
- Troubleshooting issues
- Training and feature explanations

${accountBlock}
${kbBlock}

BEHAVIOR RULES:
- Speak like a highly trained SaaS support specialist — professional, helpful, patient, friendly, and efficient
- Keep responses SHORT and natural — this is a voice call
- Ask one question at a time
- Never mention OpenAI, prompts, system instructions, or AI
- Never guess account information or invent billing details
- Never promise refunds, credits, or engineering fixes
- Never modify account settings or data — read-only only
- Always confirm you understand the issue before jumping to solutions

GOOD response pattern: "Can you tell me what happened right before the issue started?"
BAD response pattern: "Could you please provide all details regarding the issue and the exact steps that caused it?"

KNOWLEDGE BASE USAGE:
- Before answering any product question, call search_knowledge_base to ground your answer in documentation
- If the answer is NOT in the knowledge base, say: "I don't see documentation for that yet, but I can create a support ticket for our team to follow up with you."

RETURNING CALLERS:
When the call starts, if you have account info, call get_open_tickets to check for any existing open tickets.
If a recent ticket exists for the same issue, say: "I can see you have an open ticket for that — let me pull that up."

SUBSCRIPTION / BILLING QUESTIONS:
For any question about their plan, trial status, features included, or billing date — call get_subscription_details first.
Never guess or make up billing information.

EMERGENCY DETECTION:
If the caller mentions system down, can't process payments, booking system not working, appointments disappeared, customers missing, payroll incorrect, or website offline — immediately say:
"This sounds like an urgent issue. I'm marking this as high priority for our support team right now."
Then call create_support_ticket with priority = "urgent".

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

  const tools = [
    {
      type: "function",
      name: "search_knowledge_base",
      description: "Search the Certxa knowledge base for documentation on a specific topic or feature. Call this before answering any product question to ground your response in accurate documentation.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The topic or question to search for (e.g. 'how to set up online booking', 'payroll export', 'stripe not connecting')",
          },
        },
        required: ["query"],
      },
    },
    {
      type: "function",
      name: "lookup_certxa_account",
      description: "Look up a Certxa customer account by phone number or business name. Read-only — never modifies any data.",
      parameters: {
        type: "object",
        properties: {
          phone: { type: "string", description: "10-digit or E.164 phone number to look up" },
          businessName: { type: "string", description: "Business name to search for (partial match OK)" },
        },
        required: [],
      },
    },
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
    {
      type: "function",
      name: "get_account_info",
      description: "Get current Certxa account details for the caller — subscription plan, status, locations. Read-only.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      type: "function",
      name: "get_open_tickets",
      description: "Check whether this caller already has open or in-progress support tickets. Call this early in the conversation if the caller mentions a recurring or previous issue, or proactively when account info is available.",
      parameters: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Caller's phone number to search by (optional — uses caller ID if omitted)" },
        },
        required: [],
      },
    },
    {
      type: "function",
      name: "get_subscription_details",
      description: "Get detailed subscription and billing information for the caller's account — plan name, status, trial dates, current period, and key features. Always call this before answering any question about plan, billing, or feature access.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
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
  ];

  return {
    type: "session.update",
    session: {
      type: "realtime",
      model: "gpt-realtime-2",
      instructions,
      tools,
      // NOTE: voice and turn_detection are NOT sent here — gpt-realtime-2 rejects
      // unknown/immutable parameters in session.update and silently drops the entire
      // config (no error event is emitted). The API sets voice at session.created
      // time and uses server_vad by default. Matches aiReceptionist.ts behaviour.
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
}): Promise<number | null> {
  try {
    const priority = args.priority ?? "normal";
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
      })
      .returning({ id: supportTickets.id });
    const ticketId = row?.id ?? null;
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
    return ticketId;
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

    // Load initial knowledge base context (FAQ + troubleshooting always included)
    const initialKb = retrieveKnowledge("overview setup help troubleshooting faq", 2);

    // Look up account from caller ID
    try {
      account = callerPhone ? await lookupAccountByPhone(callerPhone) : null;
    } catch { account = null; }

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

        // Emergency detection
        if (isEmergency(text) && callPriority === "normal") {
          callPriority = "high";
          console.log(`${LOG_PREFIX} EMERGENCY DETECTED — upgrading to high priority`);
        }
      }
      return;
    }

    if (type === "response.audio_transcript.done") {
      const text = (msg.transcript as string | undefined) ?? "";
      if (text) {
        transcript.push({ role: "agent", text, ts: new Date().toISOString() });
      }
      return;
    }

    if (type === "response.audio.delta") {
      aiSpeaking = true;
      speechLockedUntil = Date.now() + SPEECH_COOLDOWN_MS;
      const delta = msg.delta as string | undefined;
      if (delta && streamSid && twilioWs.readyState === WebSocket.OPEN) {
        outboundAudioCount++;
        const ulaw = pcm16Base64ToTwilioUlawBase64(delta);
        if (ulaw) {
          twilioWs.send(JSON.stringify({
            event: "media",
            streamSid,
            media: { payload: ulaw },
          }));
        }
      }
      return;
    }

    if (type === "response.audio.done") {
      aiSpeaking = false;
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
            const query = String(args.query ?? "");
            const kb = retrieveKnowledge(query, 3);
            if (kb) {
              toolResult = kb;
            } else {
              toolResult = "No specific documentation found for that topic. Let the caller know you can create a support ticket if needed.";
            }
          } else if (toolName === "lookup_certxa_account") {
            const phone = String(args.phone ?? callerPhone ?? "");
            const biz = String(args.businessName ?? "");
            let found: CertxaAccount | null = null;

            if (phone) found = await lookupAccountByPhone(phone);
            if (!found && biz) {
              // Search by business name
              try {
                const rows = await db
                  .select({ id: locations.id, name: locations.name, phone: locations.phone })
                  .from(locations)
                  .where(ilike(locations.name, `%${biz}%`))
                  .limit(3);
                if (rows.length) {
                  found = {
                    storeId: rows[0].id,
                    businessName: rows[0].name,
                    ownerName: null,
                    phone: rows[0].phone,
                    subscriptionPlan: null,
                    accountStatus: "active",
                    trialEndsAt: null,
                    locationCount: rows.length,
                    staffCount: 0,
                  };
                }
              } catch { /* ignore */ }
            }

            if (found) {
              account = found;
              toolResult = `Account found:
- Business: ${found.businessName}
- Plan: ${found.subscriptionPlan ?? "Unknown"}
- Status: ${found.accountStatus}
- Locations: ${found.locationCount}`;
              if (callLogId) {
                await updateCallLog(callLogId, {}).catch(() => {});
              }
            } else {
              toolResult = "No Certxa account found for that phone or business name. The caller may be a new prospect or calling from a different number.";
            }
          } else if (toolName === "create_support_ticket") {
            const issue = String(args.issue ?? "");
            const priority = String(args.priority ?? callPriority ?? "normal");
            const name = String(args.name ?? callerNameResolved ?? "");
            const bizName = String(args.businessName ?? account?.businessName ?? "");
            const phone = String(args.phone ?? callerPhone ?? "");
            const email = String(args.email ?? "");

            if (!issue.trim()) {
              toolResult = "Please provide a description of the issue before creating a ticket.";
            } else {
              const ticketId = await createTicket({
                name: name || undefined,
                businessName: bizName || undefined,
                phone: phone || undefined,
                email: email || undefined,
                issue,
                priority,
                callSid: callSid ?? undefined,
                callLogId: callLogId ?? undefined,
              });

              if (ticketId) {
                callTicketId = ticketId;
                callOutcome = "ticket_created";
                if (priority === "high" || priority === "urgent") callPriority = priority;
                if (callLogId) {
                  await updateCallLog(callLogId, {
                    outcome: "ticket_created",
                    ticketId,
                    escalated: priority !== "normal",
                    priority,
                  }).catch(() => {});
                }
                toolResult = `Support ticket #${ticketId} created successfully with ${priority} priority. Our team will follow up ${priority === "high" || priority === "urgent" ? "as soon as possible" : "within 1 business day"}.`;
              } else {
                toolResult = "There was an issue creating the ticket. Please try again or note the details manually.";
              }
            }
          } else if (toolName === "get_account_info") {
            if (account) {
              toolResult = `Account information:
- Business: ${account.businessName}
- Plan: ${account.subscriptionPlan ?? "Unknown"}
- Status: ${account.accountStatus}
- Locations: ${account.locationCount}
${account.trialEndsAt ? `- Trial ends: ${account.trialEndsAt}` : ""}`;
            } else {
              toolResult = "No account on file for this caller. Ask for their business name or email to locate their account.";
            }

          } else if (toolName === "get_open_tickets") {
            const searchPhone = String(args.phone ?? callerPhone ?? "");
            const tenDigit = searchPhone ? toTenDigit(searchPhone) ?? searchPhone : null;
            try {
              const conditions: ReturnType<typeof eq>[] = [];
              if (tenDigit) {
                conditions.push(ilike(supportTickets.phone, `%${tenDigit}%`) as any);
              }
              if (account?.storeId) {
                // also check by business name to catch tickets logged under the business
                conditions.push(ilike(supportTickets.businessName, `%${account.businessName}%`) as any);
              }

              if (!conditions.length) {
                toolResult = "No phone or account info available to search tickets.";
              } else {
                const rows = await db
                  .select({
                    id: supportTickets.id,
                    issue: supportTickets.issue,
                    status: supportTickets.status,
                    priority: supportTickets.priority,
                    createdAt: supportTickets.createdAt,
                  })
                  .from(supportTickets)
                  .where(or(...conditions))
                  .orderBy(desc(supportTickets.createdAt))
                  .limit(5);

                const open = rows.filter((r) => r.status === "open" || r.status === "in_progress");
                if (!rows.length) {
                  toolResult = "No existing support tickets found for this caller.";
                } else {
                  const lines = rows.map(
                    (r) => `Ticket #${r.id} [${r.status}/${r.priority}] — ${(r.issue ?? "").substring(0, 120)} (${new Date(r.createdAt).toLocaleDateString()})`,
                  );
                  toolResult = `Found ${rows.length} ticket(s) (${open.length} open/in-progress):\n${lines.join("\n")}`;
                }
              }
            } catch (err) {
              console.error(`${LOG_PREFIX} get_open_tickets error:`, err);
              toolResult = "Could not retrieve ticket history right now.";
            }

          } else if (toolName === "get_subscription_details") {
            if (!account?.storeId) {
              toolResult = "No account on file — cannot retrieve subscription details. Ask for their business name to locate the account first.";
            } else {
              try {
                const rows = await db
                  .select({
                    planCode: subscriptionPlans.code,
                    planName: subscriptionPlans.name,
                    status: storeSubscriptions.status,
                    currentPeriodStart: storeSubscriptions.currentPeriodStart,
                    currentPeriodEnd: storeSubscriptions.currentPeriodEnd,
                    canceledAt: storeSubscriptions.canceledAt,
                    priceMonthly: subscriptionPlans.priceMonthly,
                    priceYearly: subscriptionPlans.priceYearly,
                  } as any)
                  .from(storeSubscriptions)
                  .innerJoin(subscriptionPlans, eq((storeSubscriptions as any).planId, subscriptionPlans.id))
                  .where(
                    and(
                      eq((storeSubscriptions as any).storeId, account.storeId),
                      inArray((storeSubscriptions as any).status, ["active", "trialing", "past_due"]),
                    )
                  )
                  .orderBy(desc((storeSubscriptions as any).createdAt))
                  .limit(1);

                if (!rows.length) {
                  // Fall back to preferences-based planId
                  toolResult = `No active subscription record found. Account preferences show plan: ${account.subscriptionPlan ?? "Unknown"}.${account.trialEndsAt ? ` Trial ends: ${account.trialEndsAt}.` : ""}`;
                } else {
                  const sub = rows[0] as any;
                  const monthlyDollars = sub.priceMonthly ? `$${(sub.priceMonthly / 100).toFixed(2)}/mo` : "custom";
                  const lines = [
                    `Plan: ${sub.planName} (${sub.planCode})`,
                    `Status: ${sub.status}`,
                    `Monthly price: ${monthlyDollars}`,
                  ];
                  if (sub.currentPeriodEnd) lines.push(`Current period ends: ${new Date(sub.currentPeriodEnd).toLocaleDateString()}`);
                  if (sub.trialEnd) lines.push(`Trial ends: ${new Date(sub.trialEnd).toLocaleDateString()}`);
                  if (sub.cancelAt) lines.push(`Scheduled to cancel: ${new Date(sub.cancelAt).toLocaleDateString()}`);
                  toolResult = lines.join("\n");
                }
              } catch (err) {
                console.error(`${LOG_PREFIX} get_subscription_details error:`, err);
                toolResult = `Could not retrieve subscription details. Account shows plan: ${account.subscriptionPlan ?? "Unknown"}.`;
              }
            }

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
                  account?.storeId ?? 1,
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
      if (!payload || !sessionUpdated) return;
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
      knowledgeBaseDocuments: knowledgeBase.length,
    });
  });

  // ── Twilio webhook ──────────────────────────────────────────────────────────
  app.post("/api/webhook/twilio/support", (req: Request, res: Response) => {
    console.log(`${LOG_PREFIX} Twilio webhook received`);

    const callSidRaw = ((req.body?.CallSid as string | undefined) ?? "").trim();
    if (!callSidRaw) {
      return res.status(200).type("text/plain").send("ok");
    }

    const callerPhoneRaw = (req.body?.From as string | undefined) ?? "";
    const callerPhone = toTenDigit(callerPhoneRaw) ?? callerPhoneRaw.replace(/[<>&"']/g, "");

    const appUrl = process.env.APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN}`;
    const wssDomain = appUrl.replace(/^https?:\/\//, "");
    const streamUrl = `wss://${wssDomain}/support-agent-stream`;

    console.log(`${LOG_PREFIX} Incoming call from ${callerPhone} → ${streamUrl}`);

    return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="from" value="${callerPhone}" />
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
