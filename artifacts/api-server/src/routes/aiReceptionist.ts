/**
 * ─────────────────────────────────────────────────────────────────────────────
 * AI Voice Booking Receptionist  ·  OpenAI Realtime API edition
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Features:
 *   • New booking creation
 *   • Caller recognition by phone number (caller ID)
 *   • Existing-booking lookup at call start  — AI knows their upcoming
 *     appointments the moment the caller says hello
 *   • Booking cancellation (with reason)
 *   • Booking rescheduling
 *
 * INTERNAL WEBHOOK URLS (platform-controlled — do not expose to salon owners):
 *
 *   Twilio webhook  →  POST  /api/webhook/twilio/:storeId
 *   Media stream    →  WSS   /media-stream  (storeId via customParameters)
 *
 * Architecture:
 *
 *   Inbound call → Twilio (PSTN)
 *       │  POST /api/webhook/twilio/7   (body contains From=<callerPhone>)
 *       ▼
 *   Server validates store → returns TwiML <Connect><Stream>
 *       │   <Parameter name="storeId" value="7"/>
 *       │   <Parameter name="from" value="<callerPhone>"/>
 *       │
 *       │  Twilio opens WSS /media-stream  (storeId via customParameters)
 *       ▼
 *   ┌──────────────────────────────────────────────────────────────────────┐
 *   │  Audio Bridge (per call, fully isolated)                              │
 *   │                                                                      │
 *   │  1. Open OpenAI Realtime WebSocket                                   │
 *   │  2. Wait for BOTH: OpenAI ready + Twilio 'start' event               │
 *   │  3. Read caller phone from start.customParameters.from               │
 *   │  4. Look up upcoming appointments for that phone in this store      │
 *   │  5. Build session.update with caller context + appointment list      │
 *   │  6. Audio bridges in g711_ulaw — zero conversion                     │
 *   └──────────────────────────────────────────────────────────────────────┘
 *
 * Audio format (both directions): g711_ulaw (8 kHz µ-law — Twilio native)
 * Required secret: AI_INTEGRATIONS_OPENAI_API_KEY (or falls back to OPENAI_API_KEY
 *   — the standard variable provided by the Replit OpenAI integration)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { Express, Request, Response } from "express";
import type { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import twilio from "twilio";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { db } from "../db";
import { locations, services, storeSettings, aiCallLog, aiSilenceIncidents, callUsageRecords, staff as staffTable, appointments } from "@shared/schema";
import { eq, desc, inArray, sql, count, gt, or, isNull, and } from "drizzle-orm";
import { isAuthenticated, isAdminAuthenticated } from "../auth";
import { storage } from "../storage";
import { registerWss, trackWssConnection, trackWssError } from "../lib/wsHealth";
import { safetyGate } from "../lib/safetyGate";
import { parseIntent, formatIntentHint } from "../lib/intentParser";
import {
  toSalonDateKey,
  validateBookingSlot,
  atomicCreateBooking,
  atomicRescheduleBooking,
} from "../bookingEngine";
import { callEventBus } from "../lib/callEventBus";
import { logActivityEvent } from "../lib/activityFeed";
import { costMeter } from "../lib/costMeter";
import { sessionGuard } from "../lib/sessionGuard";
import { SilenceWatchdog } from "../lib/silenceWatchdog";
import { callHealthTracker } from "../lib/callHealthTracker";
import { getAvailabilityCache, getAvailabilityCacheStats, setAvailabilityCache } from "../lib/availabilityCache";
import { enqueueAvailabilityInvalidation } from "../lib/availabilityQueue";
import { enqueueSlotRebuild, buildDateRange } from "../lib/slotQueue";
import { broadcastNotification, broadcastSyncEvent } from "../notifications";
import { scoreCallRisk, recordBlockedNumber } from "../services/spamProtection/callFilter";
import { resolveTenantIdForRequest } from "../lib/tenantResolver";
import { CallFileLogger, NullCallFileLogger, type ICallFileLogger } from "../lib/callFileLogger";

// ─── Constants ────────────────────────────────────────────────────────────────

const OPENAI_REALTIME_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-realtime-2";

const PREF_KEY = "aiReceptionistEnabled";
const PREF_PHONE_KEY = "aiReceptionistPhone";

const TWILIO_ULAW_FRAME_BYTES = 160; // 20ms @ 8kHz, 8-bit μ-law

/**
 * Convert a single 16-bit linear PCM sample to 8-bit μ-law.
 * Implementation adapted from the standard G.711 μ-law companding algorithm.
 */
function linear16ToMuLaw(sample: number): number {
  const MU_LAW_MAX = 0x1fff;
  const BIAS = 0x84;

  let pcm = Math.max(-32768, Math.min(32767, sample));
  let sign = 0;
  if (pcm < 0) {
    pcm = -pcm;
    sign = 0x80;
  }

  pcm = pcm + BIAS;
  if (pcm > MU_LAW_MAX) pcm = MU_LAW_MAX;

  let exponent = 7;
  for (let expMask = 0x4000; (pcm & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {
    // find segment
  }
  const mantissa = (pcm >> (exponent + 3)) & 0x0f;
  const ulaw = ~(sign | (exponent << 4) | mantissa) & 0xff;
  return ulaw;
}

/** Convert one 8-bit μ-law byte to 16-bit linear PCM sample. */
function muLawToLinear16(muLawByte: number): number {
  const u = (~muLawByte) & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  return sign ? -sample : sample;
}

/**
 * Convert Twilio μ-law 8k (base64) to PCM16 24k (base64) for OpenAI input.
 * Upsampling is 3x duplication (8k -> 24k), sufficient for speech input.
 */
function twilioUlawBase64ToPcm16_24kBase64(base64Ulaw: string): string {
  const ulaw = Buffer.from(base64Ulaw, "base64");
  if (!ulaw.length) return "";

  const pcm = Buffer.allocUnsafe(ulaw.length * 3 * 2);
  let o = 0;
  for (let i = 0; i < ulaw.length; i++) {
    const s = muLawToLinear16(ulaw[i]);
    // 8k -> 24k upsample by repeating each sample 3 times
    pcm.writeInt16LE(s, o); o += 2;
    pcm.writeInt16LE(s, o); o += 2;
    pcm.writeInt16LE(s, o); o += 2;
  }
  return pcm.toString("base64");
}

/** Lightweight voice detection over Twilio μ-law payload. */
function hasVoiceInTwilioUlaw(base64Ulaw: string): boolean {
  const ulaw = Buffer.from(base64Ulaw, "base64");
  if (!ulaw.length) return false;

  // Sample sparsely for speed; voice should still show clear energy.
  let sumAbs = 0;
  let peakAbs = 0;
  let n = 0;
  for (let i = 0; i < ulaw.length; i += 4) {
    const s = muLawToLinear16(ulaw[i]);
    const abs = Math.abs(s);
    sumAbs += abs;
    if (abs > peakAbs) peakAbs = abs;
    n++;
  }
  const avgAbs = n ? sumAbs / n : 0;
  // Conservative but caller-friendly gate:
  // - average energy catches sustained speech
  // - peak catches short syllables/plosives at low gain
  return avgAbs > 650 || peakAbs > 2200;
}

/**
 * Convert OpenAI PCM16 (typically 24kHz) into Twilio μ-law (8kHz).
 * Downsampling is a simple 3:1 decimation, which is sufficient for phone-band speech.
 */
function pcm16Base64ToTwilioUlawBase64(base64Pcm16: string): string {
  const pcm = Buffer.from(base64Pcm16, "base64");
  if (pcm.length < 2) return "";

  const sampleCount = Math.floor(pcm.length / 2);
  const outLen = Math.floor(sampleCount / 3); // 24k -> 8k decimation
  const ulaw = Buffer.allocUnsafe(Math.max(outLen, 0));

  let outIdx = 0;
  for (let i = 0; i + 1 < pcm.length; i += 6) {
    const sample = pcm.readInt16LE(i);
    ulaw[outIdx++] = linear16ToMuLaw(sample);
  }

  return ulaw.subarray(0, outIdx).toString("base64");
}

/** Normalize a user-typed phone number to E.164 (very forgiving). */
function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Strip spaces, dashes, parens, dots
  const cleaned = trimmed.replace(/[\s\-().]/g, "");
  // Must start with + and 8–15 digits (E.164)
  if (/^\+\d{8,15}$/.test(cleaned)) return cleaned;
  // Bare 10-digit US number → prepend +1
  if (/^\d{10}$/.test(cleaned)) return `+1${cleaned}`;
  // 11-digit starting with 1 → +1...
  if (/^1\d{10}$/.test(cleaned)) return `+${cleaned}`;
  return null;
}

/**
 * Normalise a Twilio-supplied number to the bare 10-digit format the DB stores.
 * Handles: +12125551234  12125551234  2125551234  (212) 555-1234  212-555-1234
 * Returns null when the input contains fewer than 10 digits.
 */
function toTenDigit(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10); // slice(-10) strips +1 / country prefix
  return null;
}

// ─── Salon context ────────────────────────────────────────────────────────────

interface SalonService {
  id: number;
  name: string;
  durationMinutes: number;
  price: string;
}

interface SalonContext {
  storeId: number;
  businessName: string;
  timezone: string;
  bookingSlug: string | null;
  businessPhone: string | null;
  services: SalonService[];
  /** Active staff members at this store (loaded at call start) */
  staffMembers: { id: number; name: string }[];
  /** Parking options from onboarding (e.g. ["Street parking", "Lot behind building"]) */
  parkingOptions: string[];
  /** Accessibility features from onboarding (e.g. ["Wheelchair accessible", "Ground floor"]) */
  accessibilityFeatures: string[];
  /** Beverages offered (from onboarding) */
  beverageOptions: { complimentary?: string[]; paid?: string[] } | null;
}

/** A pre-loaded upcoming appointment for the caller, surfaced to the AI. */
interface CallerAppointment {
  id: number;
  serviceName: string;
  date: string;            // ISO 8601
  durationMinutes: number;
  status: string;
}

/** Lightweight CRM profile built from existing appointment + customer records. No schema changes required. */
interface CallerCrmProfile {
  phone: string;
  name: string | null;
  firstName: string | null;
  storeId: number;
  visitCount: number;
  lastVisit: Date | null;
  /** 'new' = 1 booking, 'returning' = 2-4, 'vip' = 5+ */
  status: "new" | "returning" | "vip";
  /** Service name from most recent completed/confirmed booking — used for rebook auto-fill */
  lastServiceName: string | null;
  lastServiceId: number | null;
  /** Days since last visit — null for new callers with no prior visits */
  daysSinceLastVisit: number | null;
  /**
   * fresh   = last visit < 30 days ago
   * regular = 30–90 days ago
   * lapsed  = 91–180 days ago ("It's been a couple months")
   * dormant = 181+ days ago ("It's been a while")
   */
  visitRecency: "fresh" | "regular" | "lapsed" | "dormant" | null;
}

/**
 * Build a lightweight CRM profile for a caller by combining the clients/client_phones
 * tables with completed appointment history. No extra DB columns needed.
 */
async function getCallerCrmProfile(callerPhone: string, storeId: number): Promise<CallerCrmProfile | null> {
  if (!callerPhone) return null;
  const phone = normalizePhoneForPublicBooking(callerPhone);
  if (!phone) return null;

  try {
    const [customer, allAppts] = await Promise.all([
      storage.searchCustomerByPhone(phone, storeId),
      storage.getAppointmentsByCustomerPhone(phone, storeId),
    ]);

    const completedAppts = allAppts.filter((a: any) => {
      const s = (a.status ?? "").toLowerCase();
      return s === "completed" || s === "confirmed" || s === "pending";
    });
    const visitCount = completedAppts.length;

    let status: CallerCrmProfile["status"] = "new";
    if (visitCount >= 5) status = "vip";
    else if (visitCount >= 2) status = "returning";

    const sorted = [...completedAppts].sort(
      (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    const lastAppt = sorted[0];
    const lastVisit = lastAppt ? new Date(lastAppt.date) : null;
    const lastServiceName = (lastAppt as any)?.service?.name ?? null;
    const lastServiceId = (lastAppt as any)?.serviceId ?? null;

    const rawName = customer?.name?.trim() ?? null;
    const firstName = rawName ? rawName.split(/\s+/)[0] : null;

    let daysSinceLastVisit: number | null = null;
    let visitRecency: CallerCrmProfile["visitRecency"] = null;
    if (lastVisit) {
      daysSinceLastVisit = Math.floor((Date.now() - lastVisit.getTime()) / 86_400_000);
      if (daysSinceLastVisit < 30) visitRecency = "fresh";
      else if (daysSinceLastVisit < 91) visitRecency = "regular";
      else if (daysSinceLastVisit < 181) visitRecency = "lapsed";
      else visitRecency = "dormant";
    }

    return {
      phone,
      name: rawName,
      firstName,
      storeId,
      visitCount,
      lastVisit,
      status,
      lastServiceName,
      lastServiceId,
      daysSinceLastVisit,
      visitRecency,
    };
  } catch {
    return null;
  }
}

async function getSalonContext(storeId: number): Promise<SalonContext | null> {
  const [store] = await db
    .select({
      id: locations.id,
      name: locations.name,
      timezone: locations.timezone,
      bookingSlug: locations.bookingSlug,
      phone: locations.phone,
      parkingOptions: locations.parkingOptions,
      accessibilityFeatures: locations.accessibilityFeatures,
      beverageOptions: locations.beverageOptions,
    })
    .from(locations)
    .where(eq(locations.id, storeId))
    .limit(1);

  if (!store) return null;

  let businessName = store.name;
  try {
    const [settings] = await db
      .select({ preferences: storeSettings.preferences })
      .from(storeSettings)
      .where(eq(storeSettings.storeId, storeId))
      .limit(1);
    if (settings?.preferences) {
      const prefs = JSON.parse(settings.preferences) as Record<string, unknown>;
      if (typeof prefs.businessName === "string" && prefs.businessName.trim()) {
        businessName = prefs.businessName.trim();
      }
    }
  } catch { /* optional */ }

  const [storeServices, storeStaff] = await Promise.all([
    db
      .select({ id: services.id, name: services.name, duration: services.duration, price: services.price })
      .from(services)
      .where(eq(services.storeId, storeId)),
    db
      .select({ id: staffTable.id, name: staffTable.name })
      .from(staffTable)
      .where(eq(staffTable.storeId, storeId)),
  ]);

  return {
    storeId,
    businessName,
    timezone: store.timezone ?? "UTC",
    bookingSlug: store.bookingSlug ?? null,
    businessPhone: store.phone ?? null,
    services: storeServices.map((s) => ({
      id: s.id,
      name: s.name,
      durationMinutes: s.duration,
      price: String(s.price ?? "0.00"),
    })),
    staffMembers: storeStaff.map((s) => ({ id: s.id, name: s.name })),
    parkingOptions: (store.parkingOptions as string[] | null) ?? [],
    accessibilityFeatures: (store.accessibilityFeatures as string[] | null) ?? [],
    beverageOptions: store.beverageOptions as { complimentary?: string[]; paid?: string[] } | null,
  };
}

/**
 * Fetches upcoming (future, not cancelled, not completed) appointments
 * for a phone number at the given store.
 */
async function getCallerUpcomingAppointments(
  callerPhone: string,
  storeId: number
): Promise<CallerAppointment[]> {
  if (!callerPhone) return [];

  try {
    const all = await storage.getAppointmentsByCustomerPhone(callerPhone, storeId);
    const now = Date.now();
    return all
      .filter((a: any) => {
        const apptTime = new Date(a.date).getTime();
        const status = (a.status ?? "").toLowerCase();
        return apptTime > now && status !== "cancelled" && status !== "completed" && status !== "no_show";
      })
      .map((a: any) => ({
        id: a.id,
        serviceName: a.service?.name ?? "Service",
        date: new Date(a.date).toISOString(),
        durationMinutes: a.duration ?? 60,
        status: a.status ?? "confirmed",
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  } catch (err) {
    console.error("[AI Receptionist] Failed to look up caller appointments:", err);
    return [];
  }
}

async function getCallerName(callerPhone: string, storeId: number): Promise<string | null> {
  if (!callerPhone) return null;
  try {
    const customer = await storage.searchCustomerByPhone(callerPhone, storeId);
    const name = customer?.name;
    return typeof name === "string" && name.trim() ? name.trim() : null;
  } catch {
    return null;
  }
}

// ─── OpenAI session config ────────────────────────────────────────────────────

function buildOpenAiSessionConfig(
  salon: SalonContext,
  callerPhone: string | null,
  crmProfile: CallerCrmProfile | null,
  existingAppointments: CallerAppointment[],
  availabilitySnapshot: string | null = null,
): object {
  const hasKnownCallerPhone = Boolean(callerPhone);
  const callerName = crmProfile?.firstName ?? null;
  const hasKnownCallerName = Boolean(callerName && callerName.trim());
  const isReturningCaller = crmProfile ? crmProfile.visitCount > 0 : false;
  const isVip = crmProfile?.status === "vip";
  const serviceList = salon.services.length
    ? salon.services
        .map((s) => `• ${s.name} — ${s.durationMinutes} min, $${s.price}  [serviceId: ${s.id}]`)
        .join("\n")
    : "• Please ask the caller to check the website for available services.";

  // ── Context blocks injected into system prompt ────────────────────────────
  const staffBlock = salon.staffMembers.length > 0
    ? `Our staff: ${salon.staffMembers.map((s) => `${s.name} [staffId: ${s.id}]`).join(", ")}.`
    : "";

  const beverageLines: string[] = [];
  if (salon.beverageOptions?.complimentary?.length) {
    beverageLines.push(`Complimentary: ${salon.beverageOptions.complimentary.join(", ")}`);
  }
  if (salon.beverageOptions?.paid?.length) {
    beverageLines.push(`Paid: ${salon.beverageOptions.paid.join(", ")}`);
  }
  const amenitiesBlock = [
    salon.parkingOptions.length ? `Parking: ${salon.parkingOptions.join(" · ")}.` : "",
    salon.accessibilityFeatures.length ? `Accessibility: ${salon.accessibilityFeatures.join(" · ")}.` : "",
    beverageLines.length ? `Beverages — ${beverageLines.join(". ")}.` : "",
  ].filter(Boolean).join("\n");

  const availabilityRule = availabilitySnapshot
    ? `A PRE-LOADED AVAILABILITY SNAPSHOT is included above.\n  For dates in the snapshot, reply with those slots DIRECTLY — do NOT call search_available_slots for those dates.\n  For any date NOT in the snapshot, call search_available_slots as usual.\n  ALWAYS call create_booking to finalize — never skip this step.`
    : `NEVER guess or assume a time slot is available. You MUST call search_available_slots FIRST before offering any time.\n  The backend is the ONLY source of truth for availability. Never invent or assume open slots.\n  Only offer times that appear in the search_available_slots tool result. If a slot is not in the result, it is not available.`;

  // ── CRM status block ─────────────────────────────────────────────────────
  const crmBlock = (() => {
    if (!crmProfile || crmProfile.visitCount === 0) return "";
    const statusLabel = isVip ? "VIP" : "returning";
    const lastVisitStr = crmProfile.lastVisit
      ? crmProfile.lastVisit.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : null;
    const lastSvcStr = crmProfile.lastServiceName
      ? ` Last service: ${crmProfile.lastServiceName}${crmProfile.lastServiceId ? ` [serviceId: ${crmProfile.lastServiceId}]` : ""}.`
      : "";

    // Lapsed-time greeting cue — injected so Autumn naturally acknowledges the gap
    let lapsedCue = "";
    if (crmProfile.visitRecency === "lapsed") {
      lapsedCue = ` LAPSED CALLER: It has been roughly ${Math.round((crmProfile.daysSinceLastVisit ?? 120) / 30)} months since their last visit.` +
        ` When they state their intent, naturally say something like "It's been a couple months — great to have you back, ${crmProfile.firstName ?? ""}!" before moving on.` +
        ` Keep it brief and warm. Do NOT make it awkward or overly apologetic.`;
    } else if (crmProfile.visitRecency === "dormant") {
      lapsedCue = ` DORMANT CALLER: It has been over ${Math.round((crmProfile.daysSinceLastVisit ?? 200) / 30)} months since their last visit.` +
        ` When they state their intent, naturally say "It's been a while — so glad you called, ${crmProfile.firstName ?? ""}!" before moving on.` +
        ` Warm but not over-the-top.`;
    }

    return (
      `CRM STATUS: ${statusLabel.toUpperCase()} CALLER — ${crmProfile.visitCount} booking(s) on record.` +
      (lastVisitStr ? ` Last visit: ${lastVisitStr}.` : "") +
      lastSvcStr +
      lapsedCue
    );
  })();

  // ── Build the existing-appointment context block ──────────────────────────
  let existingBookingsBlock: string;
  if (!callerPhone) {
    existingBookingsBlock =
      `The caller's phone number is not available (caller ID blocked). ` +
      `Greet with: "${buildTimeOfDayGreeting(salon.timezone, salon.businessName, "open_ended")}" ` +
      `Then ask: "May I ask who I'm speaking with?" and collect a callback number before proceeding.`;
  } else if (existingAppointments.length === 0) {
    existingBookingsBlock =
      `Caller's phone (from caller ID): ${callerPhone}\n` +
      (callerName ? `Caller's name on file: **${callerName}** — address them by name when natural.\n` : `This number is not yet on file — no name stored yet.\n`) +
      (crmBlock ? `${crmBlock}\n` : "") +
      `After greeting, let the caller state their intent. DO NOT say "I don't see any upcoming appointments" unless they ask.`;
  } else {
    const apptList = existingAppointments
      .map((a) => {
        const formatted = new Date(a.date).toLocaleString("en-US", {
          weekday: "long", month: "short", day: "numeric",
          hour: "numeric", minute: "2-digit",
          timeZone: salon.timezone,
        });
        return `• ${a.serviceName} on ${formatted}  [appointmentId: ${a.id}]`;
      })
      .join("\n");

    existingBookingsBlock =
      `Caller's phone (from caller ID): ${callerPhone}\n` +
      (callerName ? `Caller's name on file: **${callerName}**\n` : "") +
      (crmBlock ? `${crmBlock}\n` : "") +
      `**This caller has the following upcoming appointment(s) on file:**\n${apptList}\n\n` +
      `After greeting, let the caller explain what they need. Do NOT assume intent. ` +
      `If they ask to cancel or reschedule, use the known appointment details above and proceed immediately.`;
  }

  // ── Rebook / last-service block ───────────────────────────────────────────
  const rebookBlock = crmProfile?.lastServiceName
    ? `REBOOK INTELLIGENCE: This caller's last service was "${crmProfile.lastServiceName}"` +
      (crmProfile.lastServiceId ? ` [serviceId: ${crmProfile.lastServiceId}]` : "") +
      `. If they say "book again", "same as last time", or anything suggesting a repeat visit, ` +
      `auto-fill this service ID — do NOT ask what service they want.`
    : "";

  const instructions = `# Role and Objective
You are Autumn, a friendly, professional AI phone receptionist for ${salon.businessName}.
You help callers manage their appointments — book new ones, cancel existing ones, reschedule, or confirm details.

# Personality and Tone
Be warm, calm, efficient, and natural. Sound like a helpful front-desk professional.
Keep responses concise and action-oriented.

# Language
English is the default response language.
- Do not infer language from accent alone.
- Do not switch language because of filler words, names, or short foreign words.
- Switch only if the caller explicitly asks, or gives a full substantive request in another language.
- If uncertain, ask: "Would you like me to continue in English or another language?"

# Reasoning
- Keep reasoning effort LOW by default.
- For direct answers or simple confirmations, respond quickly without extended reasoning.
- For tool decisions, multi-step booking flow, or recovery paths, reason briefly before acting.
- If audio is unclear, do not reason or call tools — ask for clarification.

Introduce yourself as Autumn near the start of the call.
${isReturningCaller
  ? `Your FIRST spoken response must be: "${buildTimeOfDayGreeting(salon.timezone, salon.businessName, "open_ended")}"` +
    (isVip ? ` (VIP caller — warm, premium tone throughout the call.)` : "")
  : `Your FIRST spoken response in a new call must be exactly: "${buildTimeOfDayGreeting(salon.timezone, salon.businessName, "open_ended")}"`}
The greeting is open-ended — the caller will state their intent directly. Do NOT ask "are you calling to book?". Let them speak.
${hasKnownCallerName
  ? `Caller name on file is ${callerName}. Address them by name naturally when appropriate. Do NOT ask for name again — it is already known.`
  : `Do NOT ask for the caller's name at the start of the call. Only ask for a first name AFTER the caller has selected a time slot (Step 4 below). If they provide their name at any point, use it — do not ask again.`}

${hasKnownCallerPhone
  ? `The caller's phone number from caller ID is already trusted for this session (${callerPhone}). Do NOT ask "Is this a good contact number?" unless the caller says they want to use a different number.`
  : `If caller ID is unavailable, ask for the best callback/contact number early in the booking flow.`}

▶▶▶ DECISION ENGINE — MANDATORY OPERATING PROTOCOL ◀◀◀
You are a DECISION ENGINE, not a chatbot.
Every caller turn must end with a DECISION (offer slots, confirm, book) or — if genuinely missing key info — EXACTLY ONE clarifying question.

ABSOLUTE LIMIT: MAX 1 FOLLOW-UP QUESTION PER ENTIRE CALL.
After asking 1 question, take action with whatever information you have. Do not ask another question.

INTENT EXTRACTION MANDATE:
Before responding, extract EVERYTHING the caller said:
  • Service mentioned?  → store it, do NOT ask again
  • Date/day mentioned? → store it, do NOT ask again
  • Time preference?    → store it, do NOT ask again
  • Staff name?         → store it, use it in every search and booking call
  • Name provided?      → use it, do NOT ask again
  • "book again" / "same as last time" → use CRM last service, skip service question
"I'd like acrylics next Friday afternoon" gives you: service + date + time. Go straight to checking availability.
Never ask "what service?" if the caller already named one. Never ask "when?" if a date was already given.

${rebookBlock ? `\n${rebookBlock}\n` : ""}
${existingBookingsBlock}

The available services at this salon are:
${serviceList}
${staffBlock ? `\n${staffBlock}` : ""}
The salon's timezone is: ${salon.timezone}.
${amenitiesBlock ? `\n${amenitiesBlock}` : ""}
${availabilitySnapshot ? `\n${availabilitySnapshot}\n` : ""}
═══ ABSOLUTE BOOKING RULES (ENFORCED — NO EXCEPTIONS) ═══

▶ RULE — AVAILABILITY:
  ${availabilityRule}

▶ RULE — SAME-DAY BOOKINGS ARE NOT ALLOWED:
  If the caller requests an appointment for today (any time today), you MUST:
  1. Immediately say: "We don't schedule same-day appointments, but we do welcome walk-ins today."
  2. Call get_walkin_availability to check today's best walk-in windows.
  3. Tell the caller the best times to walk in based on the tool result.
  4. Ask if they would like to book for a future date instead.
  NEVER attempt to create_booking for today's date under any circumstance.
  IMPORTANT: Do NOT mention walk-ins for tomorrow or any future date.
  If the caller says "tomorrow", "next week", or any non-today date, proceed with normal booking flow only.

▶ RULE — FULL STAFF SCAN REQUIRED:
  When searching availability, NEVER limit results to one staff member unless the caller explicitly requests a specific technician by name.
  Always scan ALL available staff by omitting staffId from search_available_slots unless a staff preference was stated.
  Present 2-3 options showing different staff members when available.

▶ RULE — BUSINESS HOURS ARE ABSOLUTE:
  Never offer, suggest, or book any time outside the salon's operating hours.
  The backend enforces this — only slots returned by search_available_slots are valid.

▶ RULE — NO ESCALATION TO SALON / FRONT DESK:
  You are NEVER allowed to say "please call the salon", "contact the front desk", "we cannot help you", or any phrase that redirects the caller elsewhere.
  You MUST resolve every request internally using your tools. If you cannot resolve it, use the fallback flow below.

▶ RULE — FALLBACK TOOL (database_lookup):
  You have a fallback tool called database_lookup. Use it when ANY primary tool (search_available_slots, get_customer_appointments, create_booking, cancel_booking, reschedule_booking) fails or returns no results on first attempt.
  DO NOT tell the caller you are switching tools — just keep the conversation flowing naturally while you retry via database_lookup.
  Operations:
    • find_appointments — use when get_customer_appointments fails (pass caller phone)
    • check_availability — use when search_available_slots fails (pass serviceId + date)
    • create_booking — use when create_booking tool fails (pass serviceId, startTime, clientName)
    • cancel_appointment — use when cancel_booking fails (pass appointmentId)
  Example: if search_available_slots times out, immediately call database_lookup with operation="check_availability" and the same serviceId + date.

▶ RULE — GLOBAL FALLBACK (for unknown requests, tool errors, or anything unresolvable):
  If you encounter ANY of the following: unknown request, tool failure, missing data, booking error, unclear intent — DO NOT go silent.
  Step 1 — Switch to fallback: Try the same action via database_lookup before giving up.
  Step 2 — Redirect to what you CAN do: "I'm not able to help with that directly, but I can help you book, cancel, or reschedule an appointment. Would any of that be helpful?"
  Step 3 — Graceful close (only if truly unresolvable after retry): "I'm sorry I wasn't able to sort that out for you today. You're welcome to try calling back, or book online anytime."
  NEVER say "the manager will call you back", "someone will follow up", or anything implying a human will contact them — no such notification is sent.
  NEVER go silent. NEVER promise a callback.

▶ RULE — PREAMBLES (USE INTENTIONALLY):
  Use ONE short preamble only when it helps the caller understand work is in progress
  (for example: longer lookup, multi-step reasoning, or possible visible delay).
  Skip preambles for direct answers, quick confirmations, or unclear audio.
  Keep preambles natural and concise, such as:
  - "I'll check that now."
  - "I'll pull that up for you."
  - "I'll verify that before we make changes."
  Avoid filler like "Let me think" or "Please wait while I process".

═══ HOW TO HANDLE EACH SCENARIO ═══

▶ NEW BOOKING — DECISION TABLE (follow exactly):

  [Have SERVICE + DATE] → say "Let me check that for you" → check availability (use snapshot or call search_available_slots) → offer 2–3 slots (times only, NO staff names) → caller picks → confirm in 1 sentence → call create_booking. Done. ✓
  [Have SERVICE only]   → say "What day works best for you?" ← YOUR 1 ALLOWED QUESTION. After answer → go to row above.
  [Have DATE only]      → say "What service are we booking?" ← YOUR 1 ALLOWED QUESTION. After answer → go to row above.
  [Have NEITHER]        → say "What service and day were you thinking?" ← counts as the 1 question. After answer → row 1.

  SLOT OFFERS:
  • Always offer times ONLY — NEVER say staff names unless the caller asked for a specific person
  • Offer 2–3 slots maximum; prefer 11am–5pm window; prefer 1:30 PM then 3:30 PM when available
  • Use snapshot if date is listed; otherwise call search_available_slots
  • If caller gives a specific time and it IS available → confirm it directly (do not re-offer alternatives)
  • If caller gives a specific time and it IS NOT available → "I don't have [time], but I do have [slot_1] or [slot_2]. Which works?"
  • For add-ons (e.g. acrylic removal): add extraDurationMinutes to both search and create_booking

  STEP 4 — NAME CAPTURE (after slot is selected):
  • If name is ALREADY IN CRM: do NOT ask — skip entirely.
  • If name is NOT known: ONLY after the caller has selected a time slot, ask naturally:
    "Perfect — I've got you down for [time]. What name should I put on the booking?"
  • If caller ID phone is present but no CRM name exists for that number, this step is MANDATORY before create_booking.
    Do not finalize booking under "Guest" when caller ID exists but name is unknown.
  • NEVER ask for name at the start of the call or before a slot is selected.
  • NEVER ask twice — if caller provides a name at any point, use it.
  • Phone: use caller ID — do NOT ask unless caller ID is unavailable.

  BOOKING CONFIRMATION:
  After caller picks slot: "Perfect — I've booked you in for [service] on [day] at [time]."
  Do NOT mention cancellation policy.
  Immediately offer ONE short, relevant add-on upsell, then STOP and wait for the caller's response.
  Never assume the caller accepted or declined before they answer.
  After they answer, continue naturally and ask "Is there anything else I can help you with today?" ONCE.
  If they say no: "Perfect — have a great day."

  UPSELL — ONLY AFTER create_booking SUCCEEDS (never before):
  Say one optional upsell line (e.g. "Would you like to add a deep conditioning treatment? It only takes about 20 minutes.")
  Keep it brief. If declined, say "No problem!" and move directly to the closing line.
  Do not speak both branches in one turn. Wait for the caller response first.
  Never repeat the upsell.

▶ SERVICE CONFUSION (vague terms → one-layer clarification only):
  Triggers: "nails done", "full set", "acrylics", "something for my nails", "get my nails done"
  DO NOT ask "manicure or pedicure?" — that is the wrong question.
  Ask ONCE: "Are you looking for a full set, a refill, or something simple?"
  After ONE answer, match to the closest service in the list and proceed to availability immediately.
  If they say something like "gel" or "acrylic" — that IS enough to match a service. Do not ask again.

▶ WALK-IN REQUEST (caller wants to come in today):
  1. Immediately say: "We don't schedule same-day appointments, but we do welcome walk-ins."
  2. Say: "Let me check the best times for you today." then call get_walkin_availability.
  3. Present 2–3 best walk-in windows (times only, no staff).
  4. Ask: "Would you also like to schedule something for a future date?"

▶ URGENT / EMERGENCY REQUESTS:
  Trigger words: "broken nail", "wedding", "emergency", "last minute", "urgent", "ASAP", "right now"
  Response: "I understand — let me see what I can do for you." (then immediately check availability)
  If today → call get_walkin_availability → "I may be able to fit you in at [slot] for a quick repair — would that work?"
  If a future date → call search_available_slots for the soonest available → offer 1–2 nearest slots.
  Keep tone calm and solution-focused throughout.

▶ PRICING QUESTIONS:
  NEVER give a flat price only. Always qualify:
  "Our pricing depends on the design, but a [service] usually starts around $[price from services list]."
  If asked again: "I can give you a more exact quote when you come in, or book you in for a quick consultation."
  If caller is unsure or browsing: "I can text you our full price list — would that help?"
  If yes: ask "Is the number you're calling from a mobile that can receive texts?" → "Perfect — you'll receive a text shortly."
  Budget callers ("cheapest", "$50 budget"): suggest lowest-priced matching option; if nothing fits, say so and offer nearest above-budget option. Always end with a booking question.

▶ PACKAGE PRICING + PROACTIVE TODAY OFFER:
  If the caller asks about a manicure + pedicure package (or combo), answer price first using start-at wording.
  Then proactively check today's availability by calling get_walkin_availability.
  If times are returned, offer concrete times naturally, e.g.:
  "Were you interested in coming in today? I have 3:00 PM, 4:00 PM, and 4:30 PM available — would any of those work for you?"
  Keep this short and specific to TODAY.

▶ CALLER WANTS A REAL PERSON:
  1. Acknowledge warmly and re-engage: "I completely understand! I'm Autumn and I'm here to take care of everything for you right now. What can I help you with today?"
  2. If they still insist on a person: "I hear you — unfortunately I'm not able to transfer calls right now. But I can book, cancel, or reschedule any appointment for you in just a minute. Is there something along those lines I can help with?"
  3. If they remain firm and have nothing for Autumn to do: close warmly — "Of course — no problem at all. You're welcome to try calling back during business hours or book online anytime. Have a great day!"
  NEVER say anyone will call them back. NEVER promise follow-up. No notification is sent to any staff.

▶ CANCEL an existing appointment:
  BEFORE DOING ANYTHING — immediately say: "Let me pull up your appointment details." (NEVER go silent)
  Step 1: Call get_customer_appointments using the caller's phone number to find all upcoming bookings.
  Step 2: If no appointments found by phone, ask: "Can you please confirm the name on the appointment or the time it was scheduled?"
           Then call lookup_appointment_by_name_or_date with the name or date they provide.
           NEVER block the caller — always try the fallback before giving up.
  Step 3: If multiple appointments found, list them clearly (date, time, service) and ask which one.
           NEVER guess which appointment to cancel if there are multiple.
  Step 4: Read back: "Just to confirm, I'm cancelling your [service] on [date] at [time]. Is that correct?"
  Step 5: Once confirmed, call cancel_booking with the appointmentId.
  Step 6: Say exactly: "You're all set, I've cancelled that appointment for you."
  FAILURE: If any step fails, try the fallback: call lookup_appointment_by_name_or_date with any name/date the caller has mentioned. If that also fails, say: "I'm sorry, I'm having trouble accessing that right now. Can I help you with anything else, or would you like to try calling back in a few minutes?" NEVER promise a callback or say anyone will follow up.

▶ RESCHEDULE an existing appointment:
  BEFORE DOING ANYTHING — immediately say: "Let me check your appointment details." (NEVER go silent)
  Step 1: Call get_customer_appointments using the caller's phone number.
  Step 2: If no appointments found by phone, ask: "Can you confirm the name or time of the appointment?"
           Then call lookup_appointment_by_name_or_date. NEVER block the caller.
  Step 3: If multiple appointments, list them clearly and ask which one to move. NEVER guess.
  Step 4: Ask what new date and time they'd prefer — ask morning, afternoon, or evening first.
           CRM SHORTCUT: If only 1 appointment is on file, skip step 3 — go directly to step 4 with that appointment.
  Step 5: Call search_available_slots and offer 2-3 REAL options. NEVER invent times.
           Example: "I can help with that — I've got 1:00 PM or 3:30 PM available instead. Which works?"
  Step 6: Read back: "So you'd like to move your [service] from [old date/time] to [new date/time] — is that correct?"
  Step 7: Once confirmed, call reschedule_booking with the appointmentId and new ISO datetime.
  CRITICAL: The backend checks for conflicts automatically. If reschedule_booking fails, offer a different time.
  FAILURE: If any step fails, try the fallback: call lookup_appointment_by_name_or_date with any name/date the caller has mentioned. If that also fails, offer an alternative slot using search_available_slots and create_booking. If all tools fail, say: "I'm sorry, I'm having some trouble with our system right now. Would you like me to try booking you a new appointment instead?" NEVER promise a callback or say anyone will follow up.

▶ REBOOK (caller says "book again", "same as last time", "usual"):
  BEFORE DOING ANYTHING — if CRM last service is known, skip the service question entirely.
  Step 1: Say: "Got it — I can book your usual [last service name]. What day works for you?"
  Step 2: Call search_available_slots with the last service ID from CRM.
  Step 3: Offer 2-3 slots. Confirm and call create_booking.
  If last service is NOT known from CRM, ask: "What service were you looking for?" then proceed normally.

▶ JUST CONFIRMING DETAILS:
  Read the appointment details back to them, wish them well, and end the call warmly.

═══ TONE & STYLE (Realtime-2 tuned) ═══

- Speak like a calm, warm human receptionist. Keep replies 1–2 short sentences unless giving options.
- MAXIMUM 1 QUESTION PER CALL — choose it wisely. Never ask multiple questions in one turn.
- NEVER mention staff names in slot offers — say times only. Only use staff names if the caller asked for a specific person.
- Do NOT list all services unless the caller asks. Offer 2–3 slots maximum (times only).
- Offer at most ONE upsell after booking is confirmed; if declined, close the call.
- When asking for a name, ask for first name only. Do NOT ask to confirm the contact phone — caller ID is trusted. Do not read phone digits back unless the caller provides a different number.
- Use brief confirmations: "Got it", "Perfect", "Sounds good". Never invent appointment IDs — only use the IDs listed in context.
- At natural completion, ask: "Is there anything else I can help you with today?" only once.
- If the caller says no, close warmly: "Perfect — have a great day."

## Verbosity
- Direct answers: 1–2 short sentences.
- Clarifying questions: ask one question at a time.
- Tool results: summarize result first, then give only the next useful action.
- Troubleshooting or recovery: one step at a time unless caller asks for more detail.

## Tools
- Use only tools in the provided tool list.
- Read-only tools: call when intent and required fields are clear.
- Write tools (create/cancel/reschedule): summarize intended action and ask for confirmation before tool call.
- For exact identifiers (appointmentId, phone, date/time): confirm value before write actions when there is ambiguity.
- After tool success, state completion briefly.
- After tool failure, explain briefly, avoid raw errors, retry once only if likely transient, then offer alternate path.

## Unclear Audio
- If caller audio is unclear, noisy, partial, or ambiguous, ask a short clarification.
- Do not guess missing words.
- Do not call tools while audio is unclear.

## Handling Silence and Background Noise
- If latest audio is silence/background/side conversation and caller is not addressing you, stay brief and wait.
- Do not repeatedly prompt with "I didn't catch that" loops.
- Resume normal flow when caller clearly addresses you.

Realtime-2 operating style (latency + clarity):
- Reasoning effort: keep LOW by default; respond immediately for direct answers and confirmations.
- Preambles: one short preamble only when helpful; skip unnecessary filler.
- Tool completions: once a tool succeeds, summarize in one short sentence and move to next action.
- Unclear audio: ask once for clarification instead of reasoning or calling tools.

FAILURE RECOVERY: If technical difficulty occurs, briefly acknowledge and continue with a clear next step. Do not go silent.`;

  const realtimeTools = [
    {
      type: "function",
      name: "create_booking",
      description: "Create a new appointment after all details are confirmed.",
      parameters: {
        type: "object",
        properties: {
          customerName:        { type: "string", description: "Full name" },
          customerPhone:       { type: "string", description: "Phone number (E.164 or 10-digit US)" },
          serviceId:           { type: "integer", description: "Numeric service ID from the list" },
          staffId:             { type: "integer", description: "Optional specific staff ID when caller requests a technician." },
          staffName:           { type: "string", description: "Optional specific technician name when caller requests by name (e.g. 'Tom')." },
          appointmentDateTime: { type: "string", description: "ISO 8601 datetime (e.g. 2025-06-15T14:00:00)" },
          extraDurationMinutes: { type: "integer", description: "Optional extra minutes for add-ons (0 if none)." },
        },
        required: ["customerName", "customerPhone", "serviceId", "appointmentDateTime"],
      },
    },
    {
      type: "function",
      name: "cancel_booking",
      description: "Cancel an existing appointment after the caller has confirmed.",
      parameters: {
        type: "object",
        properties: {
          appointmentId: { type: "integer", description: "Optional appointment ID from caller's upcoming appointments." },
          customerPhone: { type: "string", description: "Optional 10-digit phone if different from caller ID." },
          reason:        { type: "string", description: "Optional reason" },
        },
        required: [],
      },
    },
    {
      type: "function",
      name: "reschedule_booking",
      description: "Reschedule an existing appointment after the caller has confirmed.",
      parameters: {
        type: "object",
        properties: {
          appointmentId: { type: "integer", description: "ID from the appointments list" },
          newDateTime:   { type: "string", description: "ISO 8601 new datetime" },
        },
        required: ["appointmentId", "newDateTime"],
      },
    },
    {
      type: "function",
      name: "search_available_slots",
      description: "Get real available booking times from the existing platform availability API.",
      parameters: {
        type: "object",
        properties: {
          storeId: { type: "integer", description: "Store ID (optional; session store is used when omitted)." },
          serviceId: { type: "integer", description: "Numeric service ID from the list" },
          date: { type: "string", description: "Date in YYYY-MM-DD" },
          preferredTimeRange: { type: "string", description: "Optional: morning, afternoon, or evening" },
          staffId: { type: "integer", description: "Optional specific staff ID" },
          staffName: { type: "string", description: "Optional specific technician name when caller requests by name (e.g. 'Tom')." },
          extraDurationMinutes: { type: "integer", description: "Optional extra minutes for add-ons (0 if none)." },
          minimumTotalDurationMinutes: { type: "integer", description: "Optional minimum total slot fit in minutes (e.g. 90)." },
        },
        required: ["serviceId", "date"],
      },
    },
    {
      type: "function",
      name: "lookup_client_by_phone",
      description: "Look up an existing client record by 10-digit phone number for this salon.",
      parameters: {
        type: "object",
        properties: {
          customerPhone: { type: "string", description: "Phone number (E.164 or 10-digit US)" },
        },
        required: ["customerPhone"],
      },
    },
    {
      type: "function",
      name: "get_customer_appointments",
      description: "Fetch upcoming appointments for a customer by phone number.",
      parameters: {
        type: "object",
        properties: {
          customerPhone: { type: "string", description: "Optional 10-digit phone. If omitted, caller phone is used." },
        },
        required: [],
      },
    },
    {
      type: "function",
      name: "lookup_appointment_by_name_or_date",
      description: "Fallback appointment search when caller ID phone lookup returns no results. Search by customer name and/or appointment date. Use this before giving up on finding an appointment.",
      parameters: {
        type: "object",
        properties: {
          customerName: { type: "string", description: "Full or partial customer name to search for (case-insensitive)." },
          date: { type: "string", description: "Optional appointment date in YYYY-MM-DD format to narrow results." },
        },
        required: [],
      },
    },
    {
      type: "function",
      name: "get_walkin_availability",
      description: "Get the best walk-in windows for TODAY based on current staff workload and schedule gaps. Call this when the caller wants a same-day appointment or asks about walk-in times.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      type: "function",
      name: "request_callback",
      description: "SILENT analytics log only — records this call for internal reporting. Do NOT mention this tool to the caller. Do NOT tell the caller anyone will follow up or call them back. Do NOT use this as an escape hatch. Only call it when the caller explicitly demands to speak to a person (after you have already tried to re-engage them). After calling it, continue the conversation normally.",
    },
    {
      type: "function",
      name: "database_lookup",
      description: "FALLBACK TOOL — use only after a primary tool has failed or timed out. Queries or writes the database directly, bypassing caches and extra guards. Supports four operations: 'find_appointments' (find client appointments by phone or name), 'check_availability' (find open slots for a service on a date), 'create_booking' (book an appointment directly), 'cancel_appointment' (cancel by appointmentId). Always try the primary tool first; switch to this only on failure.",
      parameters: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["find_appointments", "check_availability", "create_booking", "cancel_appointment"],
            description: "Which database operation to perform.",
          },
          phone:             { type: "string",  description: "Caller phone number for find_appointments." },
          name:              { type: "string",  description: "Client name for find_appointments when phone is unavailable." },
          date:              { type: "string",  description: "Date in YYYY-MM-DD format for check_availability or find_appointments." },
          serviceId:         { type: "number",  description: "Service ID for check_availability or create_booking." },
          preferredTimeRange:{ type: "string",  enum: ["morning","afternoon","evening"], description: "Optional time range filter for check_availability." },
          staffId:           { type: "number",  description: "Optional staff ID to filter by." },
          startTime:         { type: "string",  description: "ISO 8601 date-time string for create_booking." },
          durationMinutes:   { type: "number",  description: "Appointment duration for create_booking (defaults to service duration)." },
          clientName:        { type: "string",  description: "Client first name (and optional last name) for create_booking." },
          clientPhone:       { type: "string",  description: "Client phone for create_booking (defaults to caller ID)." },
          appointmentId:     { type: "number",  description: "Appointment ID to cancel for cancel_appointment." },
        },
        required: ["operation"],
      },
    },
  ];

  return {
    type: "session.update",
    session: {
      type: "realtime",
      model: "gpt-realtime-2",
      instructions,
      tools: realtimeTools,
      // NOTE: `input_audio_transcription` is intentionally omitted.
      // The current gpt-realtime-2 session schema rejects
      // `session.input_audio_transcription` as an unknown parameter, which
      // causes `session.update` to fail and leads to silent calls.
      // NOTE: turn_detection is NOT sent here — gpt-realtime-2 rejects it as an
      // unknown parameter and causes session.update to fail entirely (which means
      // the system prompt is never applied). The API uses server_vad by default.
      // The manual VAD code has been removed so double-responses no longer occur.
    },
  };
}

// ─── Booking-related tool handlers ────────────────────────────────────────────
//
// CONTRACT — enforced at every call-site in the dispatcher below:
//
//   ALLOWED  — read/write database state:
//     • create bookings       (create_booking)
//     • update/reschedule     (reschedule_booking)
//     • cancel bookings       (cancel_booking)
//     • query availability    (search_available_slots, get_walkin_availability)
//     • fetch customer data   (get_customer_appointments, lookup_client_by_phone,
//                              lookup_appointment_by_name_or_date)
//     • log callback requests (request_callback)
//
//   FORBIDDEN — never permitted inside any handler:
//     • generating speech
//     • calling response.create (or any OpenAI Realtime API method)
//     • triggering or scheduling OpenAI responses
//     • influencing conversation flow directly
//
//   OUTPUT — every handler MUST return a plain ToolResult object and nothing else.
//     The orchestrator (WebSocket closure) owns all speech and OpenAI interactions.
//     Handlers have no access to `openAiWs`, `generateSpeech`, or any session state
//     by design — they are module-scope functions, not closure members.

/** Canonical return type for every AI receptionist tool handler. */
type ToolResult = { success: boolean; message: string; [key: string]: unknown };

/**
 * Runtime guard — asserts `val` is a plain ToolResult.
 * Throws if the result carries non-serialisable values (functions, class instances)
 * that could indicate an accidental attempt to embed live objects in tool output.
 */
function assertToolResult(val: unknown, toolName: string): asserts val is ToolResult {
  if (val === null || typeof val !== "object" || Array.isArray(val)) {
    throw new Error(`[ToolContract] "${toolName}" returned a non-object result — expected ToolResult`);
  }
  const r = val as Record<string, unknown>;
  if (typeof r["success"] !== "boolean") {
    throw new Error(`[ToolContract] "${toolName}" result missing boolean "success" field`);
  }
  if (typeof r["message"] !== "string") {
    throw new Error(`[ToolContract] "${toolName}" result missing string "message" field`);
  }
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === "function") {
      throw new Error(`[ToolContract] "${toolName}" result field "${k}" is a function — tool output must be plain data`);
    }
  }
}

interface NewBookingArgs {
  customerName: string;
  customerPhone: string;
  serviceId: number;
  staffId?: number;
  staffName?: string;
  appointmentDateTime: string;
  extraDurationMinutes?: number;
}

interface CancelArgs {
  appointmentId?: number;
  customerPhone?: string;
  reason?: string;
}

function logAiToolEvent(event: string, payload: Record<string, unknown>): void {
  console.log(
    `[AI Receptionist][tool] ${JSON.stringify({
      ts: new Date().toISOString(),
      event,
      ...payload,
    })}`,
  );
}

interface RescheduleArgs {
  appointmentId: number;
  newDateTime: string;
}

interface LookupAppointmentByNameOrDateArgs {
  customerName?: string;
  date?: string; // YYYY-MM-DD
}

interface GetAvailableSlotsArgs {
  storeId?: number;
  serviceId: number;
  date: string; // YYYY-MM-DD in salon-local intent
  preferredTimeRange?: "morning" | "afternoon" | "evening";
  staffId?: number;
  staffName?: string;
  extraDurationMinutes?: number;
  minimumTotalDurationMinutes?: number;
}

interface LookupClientByPhoneArgs {
  customerPhone: string;
}

interface GetCustomerAppointmentsArgs {
  customerPhone?: string;
}

/** Used to scope cancel/reschedule to this caller's own appointments. */
type AppointmentIdAllowlist = Set<number>;

function normalizePhoneForPublicBooking(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

function parseAppointmentDateTimeInSalonTimezone(raw: string, timezone: string): Date | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;

  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(value)) {
    const dt = new Date(value);
    return isNaN(dt.getTime()) ? null : dt;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    const normalized = value.length === 16 ? `${value}:00` : value;
    const dt = fromZonedTime(new Date(normalized), timezone || "UTC");
    return isNaN(dt.getTime()) ? null : dt;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const dt = fromZonedTime(new Date(`${value}T00:00:00`), timezone || "UTC");
    return isNaN(dt.getTime()) ? null : dt;
  }

  const fallback = new Date(value);
  return isNaN(fallback.getTime()) ? null : fallback;
}

function toSalonLocalDateString(input: Date, timezone: string): string {
  const local = toZonedTime(input, timezone || "UTC");
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, "0");
  const d = String(local.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildTimeOfDayGreeting(
  timezone: string,
  businessName: string,
  style: "open_ended" | "booking" = "open_ended",
): string {
  const local = toZonedTime(new Date(), timezone || "UTC");
  const hour = local.getHours();
  const daypart = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  if (style === "booking") {
    return `${daypart}, thank you for calling ${businessName}, this is Autumn. Are you calling to book an appointment today?`;
  }

  return `${daypart}, thank you for calling ${businessName}, this is Autumn. How can I help you today?`;
}

function getAiReceptionistInternalKey(): string | null {
  const key = (process.env.AI_RECEPTIONIST_API_KEY ?? "").trim();
  return key || null;
}

function isAiInternalAuthorized(req: Request): boolean {
  const expected = getAiReceptionistInternalKey();
  if (!expected) return true; // optional hardening key
  const provided = String(req.headers["x-ai-receptionist-key"] ?? "").trim();
  return !!provided && provided === expected;
}

type AvailabilitySlot = { time: string; staffId: number; staffName: string };

function normalizeStaffNameForMatch(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveRequestedStaffForService(
  salon: SalonContext,
  serviceId: number,
  requestedStaffId?: number,
  requestedStaffName?: string,
): Promise<{
  staffId?: number;
  requestedSpecificStaff: boolean;
  requestedStaffName?: string;
  error?: string;
}> {
  const hasStaffId = typeof requestedStaffId === "number" && Number.isFinite(requestedStaffId) && requestedStaffId > 0;
  const staffName = String(requestedStaffName ?? "").trim();
  const hasStaffName = staffName.length > 0;

  if (!hasStaffId && !hasStaffName) {
    return { requestedSpecificStaff: false };
  }

  if (hasStaffId) {
    const candidates = await getCandidateStaffForService(salon.storeId, serviceId, Number(requestedStaffId));
    if (!candidates.length) {
      return {
        requestedSpecificStaff: true,
        requestedStaffName: hasStaffName ? staffName : undefined,
        error: "The requested technician is not available for that service.",
      };
    }
    return {
      requestedSpecificStaff: true,
      staffId: Number(requestedStaffId),
      requestedStaffName: candidates[0].name,
    };
  }

  const allStaff = await storage.getAllStaff(salon.storeId);
  const links = await storage.getStaffServices(undefined, serviceId);
  const serviceAllowedIds = new Set(links.map((l) => l.staffId));

  const target = normalizeStaffNameForMatch(staffName);
  const matches = allStaff.filter((s) => {
    const n = normalizeStaffNameForMatch(s.name);
    if (!n) return false;
    return n === target || n.startsWith(target) || target.startsWith(n);
  });

  if (!matches.length) {
    return {
      requestedSpecificStaff: true,
      requestedStaffName: staffName,
      error: `I couldn't find a technician named ${staffName} at this salon.`,
    };
  }

  const serviceCapable = matches.filter((m) => serviceAllowedIds.has(m.id));
  if (!serviceCapable.length) {
    return {
      requestedSpecificStaff: true,
      requestedStaffName: staffName,
      error: `${matches[0].name} is not assigned to that service.`,
    };
  }

  if (serviceCapable.length > 1) {
    const exact = serviceCapable.find((m) => normalizeStaffNameForMatch(m.name) === target);
    if (!exact) {
      return {
        requestedSpecificStaff: true,
        requestedStaffName: staffName,
        error: `I found multiple technicians matching "${staffName}". Please provide the full name.`,
      };
    }
    return {
      requestedSpecificStaff: true,
      staffId: exact.id,
      requestedStaffName: exact.name,
    };
  }

  return {
    requestedSpecificStaff: true,
    staffId: serviceCapable[0].id,
    requestedStaffName: serviceCapable[0].name,
  };
}

async function getCandidateStaffForService(
  storeId: number,
  serviceId: number,
  specificStaffId?: number,
): Promise<Array<{ id: number; name: string; storeId: number | null }>> {
  if (specificStaffId) {
    const member = await storage.getStaffMember(specificStaffId);
    if (!member || member.storeId !== storeId) return [];
    const links = await storage.getStaffServices(specificStaffId, serviceId);
    return links.length > 0 ? [{ id: member.id, name: member.name, storeId: member.storeId }] : [];
  }

  const links = await storage.getStaffServices(undefined, serviceId);
  if (!links.length) return [];

  const allowedIds = new Set(links.map((l) => l.staffId));
  const storeStaff = await storage.getAllStaff(storeId);
  return storeStaff
    .filter((s) => allowedIds.has(s.id))
    .map((s) => ({ id: s.id, name: s.name, storeId: s.storeId }));
}

async function computeAvailabilitySlots(
  salon: SalonContext,
  serviceId: number,
  date: string,
  duration: number,
  specificStaffId?: number,
): Promise<AvailabilitySlot[]> {
  const tz = salon.timezone || "UTC";
  const dayStartLocal = fromZonedTime(new Date(`${date}T00:00:00`), tz);
  const dayEndLocal   = fromZonedTime(new Date(`${date}T23:59:59.999`), tz);

  // Run all lookups in parallel — avoids serial DB round-trips
  const [calSettings, hours, dayAppointments, candidateStaff] = await Promise.all([
    storage.getCalendarSettings(salon.storeId),
    storage.getBusinessHours(salon.storeId),
    storage.getAppointments({ from: dayStartLocal, to: dayEndLocal, storeId: salon.storeId }),
    getCandidateStaffForService(salon.storeId, serviceId, specificStaffId),
  ]);
  const slotInterval = calSettings?.timeSlotInterval || 15;

  if (!candidateStaff.length) return [];

  const dateParts = date.split("-").map(Number);
  const dayOfWeek = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]).getDay();
  const dayHours = hours.find((h) => h.dayOfWeek === dayOfWeek);
  if (dayHours?.isClosed) return [];

  const businessStartHour = 9;
  const businessStartMinute = 0;
  const businessEndHour = 18;
  const businessEndMinute = 0;
  const [openHour, openMin] = dayHours && !dayHours.isClosed
    ? dayHours.openTime.split(":").map(Number)
    : [businessStartHour, businessStartMinute];
  const [closeHour, closeMin] = dayHours && !dayHours.isClosed
    ? dayHours.closeTime.split(":").map(Number)
    : [businessEndHour, businessEndMinute];

  const businessEndUtc = fromZonedTime(
    new Date(`${date}T${String(closeHour).padStart(2, "0")}:${String(closeMin).padStart(2, "0")}:00`),
    tz,
  );
  const nowUtc = new Date();


  const availabilityByStaff = new Map<number, Awaited<ReturnType<typeof storage.getStaffAvailability>>>();
  await Promise.all(
    candidateStaff.map(async (s) => {
      availabilityByStaff.set(s.id, await storage.getStaffAvailability(s.id));
    }),
  );

  const slots: AvailabilitySlot[] = [];

  for (let hour = openHour; hour <= closeHour; hour++) {
    for (let min = 0; min < 60; min += slotInterval) {
      if (hour === openHour && min < openMin) continue;
      if (hour === closeHour && min >= closeMin) break;
      if (hour > closeHour) break;

      const slotStart = fromZonedTime(new Date(`${date}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`), tz);
      const slotEnd = new Date(slotStart.getTime() + duration * 60000);

      if (slotStart < nowUtc) continue;
      if (slotEnd > businessEndUtc) continue;

      const availableForSlot: Array<{ staffMember: { id: number; name: string } }> = [];

      for (const staffMember of candidateStaff) {
        let hasConflict = false;

        for (const apt of dayAppointments) {
          if (apt.staffId !== staffMember.id || apt.status === "cancelled") continue;
          const aptStart = new Date(apt.date);
          const aptEnd = new Date(aptStart.getTime() + apt.duration * 60000);
          if (slotStart < aptEnd && slotEnd > aptStart) {
            hasConflict = true;
            break;
          }
        }

        if (!hasConflict) {
          const rules = availabilityByStaff.get(staffMember.id) ?? [];
          if (rules.length > 0) {
            const slotLocalDate = toZonedTime(slotStart, tz);
            const slotDayOfWeek = slotLocalDate.getDay();
            const dayAvailability = rules.find((r) => r.dayOfWeek === slotDayOfWeek);

            if (dayAvailability) {
              const [availStartHour, availStartMin] = dayAvailability.startTime.split(":").map(Number);
              const [availEndHour, availEndMin] = dayAvailability.endTime.split(":").map(Number);
              const slotLocalHour = slotLocalDate.getHours();
              const slotLocalMin = slotLocalDate.getMinutes();
              const slotTimeInMin = slotLocalHour * 60 + slotLocalMin;
              const slotEndLocal = toZonedTime(slotEnd, tz);
              const slotEndTimeInMin = slotEndLocal.getHours() * 60 + slotEndLocal.getMinutes();
              const availStartInMin = availStartHour * 60 + availStartMin;
              const availEndInMin = availEndHour * 60 + availEndMin;

              if (slotTimeInMin < availStartInMin || slotEndTimeInMin > availEndInMin) {
                hasConflict = true;
              }
            } else {
              hasConflict = true;
            }
          }
        }

        if (!hasConflict) {
          availableForSlot.push({ staffMember });
        }
      }

      if (availableForSlot.length > 0) {
        const chosen = availableForSlot[0];
        slots.push({
          time: slotStart.toISOString(),
          staffId: chosen.staffMember.id,
          staffName: chosen.staffMember.name,
        });
      }
    }
  }

  return slots;
}

async function createBookingViaBookingRules(
  salon: SalonContext,
  args: NewBookingArgs,
): Promise<{ success: boolean; message: string }> {
  if (!salon.bookingSlug) {
    return { success: false, message: "Salon is not configured for online booking." };
  }

  const service = salon.services.find((s) => s.id === Number(args.serviceId));
  if (!service) {
    return { success: false, message: "Requested service is not available for this salon." };
  }

  const requested = parseAppointmentDateTimeInSalonTimezone(
    String(args.appointmentDateTime ?? ""),
    salon.timezone,
  );
  if (!requested || isNaN(requested.getTime())) {
    return { success: false, message: "appointmentDateTime must be a valid ISO datetime." };
  }

  // ── RULE 4: Same-day booking prevention ───────────────────────────────────
  // toSalonDateKey returns a correctly-padded YYYY-MM-DD in salon local time.
  if (toSalonDateKey(requested, salon.timezone || "UTC") === toSalonDateKey(new Date(), salon.timezone || "UTC")) {
    logAiToolEvent("create_booking.same_day_rejected", {
      storeId: salon.storeId,
      requestedAt: requested.toISOString(),
    });
    return {
      success: false,
      message:
        "Same-day bookings are not accepted. We welcome walk-ins for today — please use get_walkin_availability to share the best walk-in windows with the caller, then offer to book for a future date.",
    };
  }

  const publicPhone = normalizePhoneForPublicBooking(String(args.customerPhone ?? ""));
  if (publicPhone.length !== 10) {
    return { success: false, message: "Please provide a valid 10-digit US phone number." };
  }

  const resolvedStaff = await resolveRequestedStaffForService(
    salon,
    Number(args.serviceId),
    typeof args.staffId === "number" ? Number(args.staffId) : undefined,
    typeof args.staffName === "string" ? args.staffName : undefined,
  );
  if (resolvedStaff.error) {
    return { success: false, message: resolvedStaff.error };
  }
  const specificStaffId = resolvedStaff.staffId;

  const dateStr = toSalonLocalDateString(requested, salon.timezone);
  const extraDuration = Math.max(0, Number(args.extraDurationMinutes ?? 0) || 0);
  const totalDuration = service.durationMinutes + extraDuration;
  logAiToolEvent("create_booking.request", {
    storeId: salon.storeId,
    bookingSlug: salon.bookingSlug,
    serviceId: Number(args.serviceId),
    staffId: specificStaffId ?? null,
    requestedAt: requested.toISOString(),
    timezone: salon.timezone,
    totalDuration,
  });

  let slots: AvailabilitySlot[];
  try {
    // IMPORTANT: AI tool path must stay fully internal (no HTTP/auth middleware dependency).
    slots = await computeAvailabilitySlots(
      salon,
      Number(args.serviceId),
      dateStr,
      totalDuration,
      specificStaffId,
    );
  } catch (err) {
    logAiToolEvent("create_booking.availability_failed", {
      storeId: salon.storeId,
      reason: "availability_lookup_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return { success: false, message: "availability_lookup_failed" };
  }

  logAiToolEvent("create_booking.availability_result", {
    storeId: salon.storeId,
    date: dateStr,
    slotsCount: slots.length,
  });

  if (!slots.length) {
    return {
      success: false,
      message: specificStaffId
        ? "No available time slots were found for that date with the requested technician."
        : "No available time slots were found for that date.",
    };
  }

  const requestedMinute = Math.floor(requested.getTime() / 60000);
  const chosen = slots.find((slot) => Math.floor(new Date(slot.time).getTime() / 60000) === requestedMinute);
  if (!chosen) {
    logAiToolEvent("create_booking.requested_slot_missing", {
      storeId: salon.storeId,
      requestedMinute,
    });
    return { success: false, message: "That time is no longer available. Please choose another time." };
  }

  // ── ENGINE: pre-write slot validation ─────────────────────────────────────
  // Fast-rejection before the atomic booking write.
  const slotCheck = await validateBookingSlot({
    storeId: salon.storeId,
    timezone: salon.timezone || "UTC",
    startTime: new Date(chosen.time),
    durationMinutes: totalDuration,
    staffId: chosen.staffId,
    allowSameDay: false,
  });
  if (!slotCheck.ok) {
    logAiToolEvent("create_booking.slot_validation_failed", {
      storeId: salon.storeId,
      slot: chosen.time,
      staffId: chosen.staffId,
      errorCode: slotCheck.error.code,
      totalDuration,
    });
    return { success: false, message: slotCheck.error.message };
  }

  // Customer upsert — required before atomicCreateBooking.
  // Also persists a newly-captured name into the CRM so future calls skip the name-ask.
  let customer: Awaited<ReturnType<typeof storage.searchCustomerByPhone>>;
  try {
    customer = await storage.searchCustomerByPhone(publicPhone, salon.storeId);
  } catch (err) {
    console.error(`[AI Receptionist] searchCustomerByPhone failed phone=${publicPhone} storeId=${salon.storeId}:`, err);
    return { success: false, message: "Could not look up client record — please try again." };
  }
  const providedName = String(args.customerName ?? "").trim();
  if (!customer) {
    if (!providedName || providedName.toLowerCase() === "guest") {
      return {
        success: false,
        message: "Before I finalize this booking, what name should I put on the appointment?",
      };
    }
    try {
      const created = await storage.createCustomer({
        name: providedName,
        email: null,
        phone: publicPhone,
        storeId: salon.storeId,
        notes: null,
      });
      if (!created || typeof created.id !== "number") {
        console.error(
          `[AI Receptionist] createCustomer returned no row for phone=${publicPhone} storeId=${salon.storeId}`,
          created,
        );
        return { success: false, message: "Could not create a client record — please try again." };
      }
      customer = created;
      console.log(`[AI Receptionist] New client created id=${customer.id} storeId=${salon.storeId} phone=${publicPhone}`);
    } catch (err: any) {
      if (err?.code === "PHONE_DUPLICATE") {
        // A concurrent call (or a race with the uniqueness guard) already created the
        // record between our searchCustomerByPhone and createCustomer calls.
        // Recover gracefully by fetching the existing client.
        const existing = await storage.searchCustomerByPhone(publicPhone, salon.storeId).catch(() => undefined);
        if (existing) {
          customer = existing;
          console.log(`[AI Receptionist] Recovered existing client id=${existing.id} after PHONE_DUPLICATE storeId=${salon.storeId}`);
        } else {
          return { success: false, message: "Could not create a client record — please try again." };
        }
      } else {
        console.error(
          `[AI Receptionist] Failed to create customer for phone=${publicPhone} storeId=${salon.storeId}:`,
          err,
        );
        return { success: false, message: "Could not create a client record — please try again." };
      }
    }
  } else if (providedName && providedName !== "Guest" && (!customer.name || customer.name === "Guest")) {
    // Back-fill name on returning callers who provided it for the first time this call
    try {
      await storage.updateCustomer(customer.id, { name: providedName });
    } catch {
      // Non-critical — booking still proceeds even if name update fails
    }
  }

  // Guard: customer must exist with a valid id before we proceed
  if (!customer || typeof customer.id !== "number") {
    console.error(`[AI Receptionist] No valid customer after upsert — storeId=${salon.storeId} phone=${publicPhone}`);
    return { success: false, message: "Could not resolve client record — please try again." };
  }

  const createResult = await atomicCreateBooking({
    storeId: salon.storeId,
    timezone: salon.timezone || "UTC",
    startTime: new Date(chosen.time),
    durationMinutes: totalDuration,
    staffId: chosen.staffId,
    serviceId: Number(args.serviceId),
    customerId: customer.id,
    notes: "Booked by AI receptionist",
    status: "pending",
    clientRequestedStaff: resolvedStaff.requestedSpecificStaff && !!specificStaffId,
  });

  if (!createResult.ok) {
    logAiToolEvent("create_booking.backend_rejected", {
      storeId: salon.storeId,
      slot: chosen.time,
      staffId: chosen.staffId,
      errorCode: createResult.error.code,
      message: createResult.error.message,
    });
    return { success: false, message: createResult.error.message };
  }

  const appointmentId = createResult.data.id;
  logAiToolEvent("create_booking.success", {
    storeId: salon.storeId,
    appointmentId,
    slot: chosen.time,
    staffId: chosen.staffId,
  });

  // Invalidate availability cache for the booked date so the next query
  // reflects the newly occupied slot, and rebuild the precomputed slot cache.
  void enqueueAvailabilityInvalidation(salon.storeId, dateStr, "booking_created");
  void enqueueSlotRebuild(salon.storeId, buildDateRange(14).filter((d) => d >= dateStr), "booking_changed");

  // ── Real-time WebSocket push so the demo calendar (and dashboard) update
  //    the instant the AI confirms the booking — no polling required.
  const bookedService = salon.services.find((s) => s.id === Number(args.serviceId));
  try {
    broadcastNotification({
      type: "new_booking",
      storeId: salon.storeId,
      customerName: customer.name ?? "Guest",
      serviceName: bookedService?.name ?? "Appointment",
      staffName: chosen.staffName,
      time: new Date(chosen.time).toISOString(),
    });
    broadcastSyncEvent({
      type: "booking_created",
      storeId: salon.storeId,
      appointmentId,
      source: "ai_receptionist",
    });
  } catch {
    // Non-critical — booking is already saved; broadcast failure just means
    // the live calendar won't refresh automatically for this call.
  }

  void logActivityEvent({
    storeId: salon.storeId,
    eventType: "ai_booking",
    message: `AI Receptionist booked ${new Date(chosen.time).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: salon.timezone || "UTC" })}${bookedService ? ` for ${bookedService.name}` : ""}`,
  });

  return {
    success: true,
    message: specificStaffId
      ? `Appointment ${appointmentId} confirmed with ${chosen.staffName} at ${new Date(chosen.time).toISOString()}.`
      : `Appointment ${appointmentId} confirmed at ${new Date(chosen.time).toISOString()}.`,
  };
}

async function getAvailabilityViaBookingRules(
  salon: SalonContext,
  args: GetAvailableSlotsArgs,
): Promise<{
  success: boolean;
  message: string;
  slots?: AvailabilitySlot[];
  error?: "availability_lookup_failed";
  retryable?: boolean;
}> {
  const service = salon.services.find((s) => s.id === Number(args.serviceId));
  if (!service) {
    return { success: false, message: "Requested service is not available for this salon." };
  }

  const extraDuration = Math.max(0, Number(args.extraDurationMinutes ?? 0) || 0);
  const minimumTotalDuration = Math.max(0, Number(args.minimumTotalDurationMinutes ?? 0) || 0);
  const totalDuration = Math.max(service.durationMinutes + extraDuration, minimumTotalDuration);

  const resolvedStaff = await resolveRequestedStaffForService(
    salon,
    Number(args.serviceId),
    typeof args.staffId === "number" ? Number(args.staffId) : undefined,
    typeof args.staffName === "string" ? args.staffName : undefined,
  );
  if (resolvedStaff.error) {
    return { success: false, message: resolvedStaff.error };
  }

  logAiToolEvent("search_available_slots.request", {
    storeId: salon.storeId,
    serviceId: Number(args.serviceId),
    date: String(args.date),
    staffId: resolvedStaff.staffId ?? null,
    staffName: resolvedStaff.requestedStaffName ?? null,
    totalDuration,
    preferredTimeRange: args.preferredTimeRange ?? null,
    timezone: salon.timezone,
  });

  const useRedisAvailabilityCache = String(process.env.AI_RECEPTIONIST_REDIS_AVAILABILITY_CACHE ?? "1") !== "0";
  let slots: AvailabilitySlot[] = [];
  let cacheHit = false;

  if (useRedisAvailabilityCache) {
    try {
      const cached = await getAvailabilityCache(
        salon.storeId,
        String(args.date),
        Number(args.serviceId),
        resolvedStaff.staffId,
      );
      if (cached !== null) {
        cacheHit = true;
        slots = cached.map((s) => ({
          time: s.time,
          staffId: s.staffId,
          staffName: s.staffName,
        }));
        logAiToolEvent("search_available_slots.cache_hit", {
          storeId: salon.storeId,
          serviceId: Number(args.serviceId),
          date: String(args.date),
          staffId: resolvedStaff.staffId ?? null,
          slotsCount: slots.length,
        });
      } else {
        logAiToolEvent("search_available_slots.cache_miss", {
          storeId: salon.storeId,
          serviceId: Number(args.serviceId),
          date: String(args.date),
          staffId: resolvedStaff.staffId ?? null,
        });
      }
    } catch {
      // Fall through to DB compute below
    }
  }

  if (!cacheHit) {
    try {
      slots = await computeAvailabilitySlots(
        salon,
        Number(args.serviceId),
        String(args.date),
        totalDuration,
        resolvedStaff.staffId,
      );

      if (useRedisAvailabilityCache) {
        const cachePayload = slots.map((s) => ({
          time: s.time,
          staffId: s.staffId,
          staffName: s.staffName,
        }));
        void setAvailabilityCache(
          salon.storeId,
          String(args.date),
          Number(args.serviceId),
          resolvedStaff.staffId,
          cachePayload,
        );
      }
    } catch (err) {
    logAiToolEvent("search_available_slots.failed", {
      storeId: salon.storeId,
      reason: "availability_lookup_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      success: false,
      error: "availability_lookup_failed",
      retryable: false,
      message: "availability_lookup_failed",
    };
    }
  }

  const range = String(args.preferredTimeRange ?? "").toLowerCase();
  if (range === "morning" || range === "afternoon" || range === "evening") {
    slots = slots.filter((slot) => {
      const local = toZonedTime(new Date(slot.time), salon.timezone || "UTC");
      const hour = local.getHours();
      if (range === "morning") return hour >= 8 && hour < 12;
      if (range === "afternoon") return hour >= 12 && hour < 17;
      return hour >= 17 && hour < 21;
    });
  }

  logAiToolEvent("search_available_slots.result", {
    storeId: salon.storeId,
    serviceId: Number(args.serviceId),
    date: String(args.date),
    slotsCount: slots.length,
    filteredByRange: range || null,
  });

  if (slots.length === 0) {
    return {
      success: true,
      slots,
      message: `No openings found for ${service.name} on ${args.date}. Ask for another date.`,
    };
  }

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: salon.timezone,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  const top = slots.slice(0, 8).map((s) => `${fmt.format(new Date(s.time))} (${s.staffName})`);
  const more = slots.length > top.length ? ` plus ${slots.length - top.length} more` : "";

  return {
    success: true,
    slots,
    message: `Available times for ${service.name} on ${args.date}: ${top.join(", ")}${more}.`,
  };
}

async function handleLookupClientByPhone(
  rawArgs: string,
  salon: SalonContext,
): Promise<{ success: boolean; message: string }> {
  let args: LookupClientByPhoneArgs;
  try {
    args = JSON.parse(rawArgs);
  } catch {
    return { success: false, message: "Could not understand client lookup arguments." };
  }

  const phone = normalizePhoneForPublicBooking(String(args.customerPhone ?? ""));
  if (phone.length !== 10) {
    return { success: false, message: "Please provide a valid 10-digit US phone number." };
  }

  const customer = await storage.searchCustomerByPhone(phone, salon.storeId);
  if (!customer) {
    return {
      success: true,
      message: `No existing client found for ${phone} in this salon.`,
    };
  }

  return {
    success: true,
    message: `Client found: clientId=${customer.id}, name=${customer.name ?? "(unknown)"}, phone=${phone}.`,
  };
}

async function handleNewBooking(
  storeId: number,
  rawArgs: string,
  salon: SalonContext
): Promise<{ success: boolean; message: string }> {
  let args: NewBookingArgs;
  try {
    args = JSON.parse(rawArgs);
  } catch {
    return { success: false, message: "Could not understand booking arguments." };
  }

  try {
    const result = await createBookingViaBookingRules(salon, args);
    if (result.success) {
      logAiToolEvent("create_booking.handler_success", {
        storeId,
        serviceId: args.serviceId,
        at: args.appointmentDateTime,
      });
    } else {
      logAiToolEvent("create_booking.handler_rejected", {
        storeId,
        serviceId: args.serviceId,
        at: args.appointmentDateTime,
        reason: result.message,
      });
    }
    return result;
  } catch (err) {
    console.error("[AI Receptionist] New booking failed:", err);
    return { success: false, message: "Failed to save the booking — please try again." };
  }
}

async function handleGetAvailableSlots(
  rawArgs: string,
  salon: SalonContext,
): Promise<{
  success: boolean;
  message: string;
  slots?: AvailabilitySlot[];
  error?: "availability_lookup_failed";
  retryable?: boolean;
}> {
  let args: GetAvailableSlotsArgs;
  try {
    args = JSON.parse(rawArgs);
  } catch {
    return { success: false, message: "Could not understand availability arguments." };
  }

  if (!args || typeof args.serviceId !== "number" || typeof args.date !== "string") {
    return { success: false, message: "Availability requires serviceId and date (YYYY-MM-DD)." };
  }

  try {
    const result = await getAvailabilityViaBookingRules(salon, args);
    if (result.success) {
      logAiToolEvent("search_available_slots.handler_success", {
        storeId: salon.storeId,
        serviceId: args.serviceId,
        date: args.date,
        staffId: args.staffId ?? null,
      });
    } else {
      logAiToolEvent("search_available_slots.handler_failed", {
        storeId: salon.storeId,
        serviceId: args.serviceId,
        date: args.date,
        staffId: args.staffId ?? null,
        reason: result.message,
      });
    }
    return result;
  } catch (err) {
    console.error("[AI Receptionist] Availability lookup failed:", err);
    return {
      success: false,
      error: "availability_lookup_failed",
      retryable: false,
      message: "availability_lookup_failed",
    };
  }
}

// ─── Walk-in availability handler (Rule 5) ────────────────────────────────────
// Analyzes today's staff schedule and returns the quietest windows for walk-ins.

async function handleGetWalkinAvailability(
  salon: SalonContext,
): Promise<{ success: boolean; message: string }> {
  try {
    const tz = salon.timezone || "UTC";
    const nowUtc = new Date();
    const todayLocal = toZonedTime(nowUtc, tz);
    const y = todayLocal.getFullYear();
    const m = String(todayLocal.getMonth() + 1).padStart(2, "0");
    const d = String(todayLocal.getDate()).padStart(2, "0");
    const todayStr = `${y}-${m}-${d}`;

    const dayStartLocal = fromZonedTime(new Date(`${todayStr}T00:00:00`), tz);
    const dayEndLocal   = fromZonedTime(new Date(`${todayStr}T23:59:59.999`), tz);

    const [hours, todayAppointments, allStaff] = await Promise.all([
      storage.getBusinessHours(salon.storeId),
      storage.getAppointments({ from: dayStartLocal, to: dayEndLocal, storeId: salon.storeId }),
      storage.getAllStaff(salon.storeId),
    ]);

  const dayOfWeek = todayLocal.getDay();
  const dayHours = hours.find((h) => h.dayOfWeek === dayOfWeek);

  // If hours are not configured for this weekday, treat it as closed.
  if (!dayHours) {
    return {
      success: true,
      message:
        "The salon is closed today. I can help you book for tomorrow or another day that works for you.",
    };
  }

  if (dayHours?.isClosed) {
      return {
        success: true,
        message:
          "The salon is closed today — no walk-in windows are available. I can help you book for tomorrow or another day.",
      };
  }

    const [openHour, openMin] = dayHours?.openTime
      ? dayHours.openTime.split(":").map(Number)
      : [9, 0];
    const [closeHour, closeMin] = dayHours?.closeTime
      ? dayHours.closeTime.split(":").map(Number)
      : [18, 0];

    const activeStaffCount = allStaff.length || 1;
  const closeTotalMinutes = closeHour * 60 + closeMin;
  const openTotalMinutes = openHour * 60 + openMin;
  const nowTotalMinutes = todayLocal.getHours() * 60 + todayLocal.getMinutes();

  // After-hours: do not present this as "fully booked". The correct state is closed.
  if (nowTotalMinutes >= closeTotalMinutes) {
    return {
      success: true,
      message:
        "The salon is closed for the rest of today. I can help you book for tomorrow — what time works best for you?",
    };
  }

    // Build concrete 30-minute suggestions for the rest of today.
    const earliestCandidate = Math.max(openTotalMinutes, nowTotalMinutes + 15);
    const roundedStart = Math.ceil(earliestCandidate / 30) * 30;
    const slotDurationMinutes = 60;
    const concreteSlots: Array<{ label: string; freeStaff: number; minuteOfDay: number }> = [];

    for (let minuteOfDay = roundedStart; minuteOfDay + slotDurationMinutes <= closeTotalMinutes; minuteOfDay += 30) {
      const h = Math.floor(minuteOfDay / 60);
      const min = minuteOfDay % 60;
      const slotStart = fromZonedTime(
        new Date(`${todayStr}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`),
        tz,
      );
      const slotEnd = new Date(slotStart.getTime() + slotDurationMinutes * 60000);
      if (slotStart < nowUtc) continue;

      let freeStaff = 0;
      for (const member of allStaff) {
        const hasConflict = todayAppointments.some((a) => {
          if (a.status === "cancelled") return false;
          if (a.staffId !== member.id) return false;
          const aptStart = new Date(a.date);
          const aptEnd = new Date(aptStart.getTime() + (a.duration ?? 60) * 60000);
          return slotStart < aptEnd && slotEnd > aptStart;
        });
        if (!hasConflict) freeStaff++;
      }

      if (freeStaff > 0) {
        const label = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          hour: "numeric",
          minute: "2-digit",
        }).format(slotStart);
        concreteSlots.push({ label, freeStaff, minuteOfDay });
      }
    }

    if (!concreteSlots.length) {
      return { success: true, message: "The salon is fully booked for the rest of today. Would you like to book for another day?" };
    }

    const best = concreteSlots.slice(0, 6);
    const allBusy = best.every((w) => w.freeStaff < 1);

    if (allBusy || activeStaffCount <= 0) {
      return { success: true, message: "All staff are fully booked for the remainder of today. I'd recommend booking for another day — would you like me to find the next available date?" };
    }

    const suggestions = best
      .filter((w) => w.freeStaff > 0)
      .slice(0, 3)
      .map((w) => w.label)
      .join(", ");

    return {
      success: true,
      message: `Were you interested in coming in today? I have ${suggestions} available — would any of those times work for you?`,
    };
  } catch (err) {
    console.error("[AI Receptionist] Walk-in availability check failed:", err);
    return { success: false, message: "I wasn't able to check today's schedule. Walk-ins are generally welcome — please feel free to come in and we'll do our best to accommodate you." };
  }
}

// ─── Callback request handler (Rule 8) ────────────────────────────────────────
// Saves a callback record to aiCallLog with outcome="callback_required".

interface RequestCallbackArgs {
  reason?: string;
}

async function handleRequestCallback(
  rawArgs: string,
  salon: SalonContext,
  callerPhone: string | null,
  existingCallLogId: number | null,
): Promise<{ success: boolean; message: string }> {
  let args: RequestCallbackArgs = {};
  try { args = JSON.parse(rawArgs || "{}"); } catch { /* ignore */ }

  const reason = (args.reason ?? "Caller requested callback — unresolved request").slice(0, 500);

  // Guardrail: don't escalate to callback for recoverable intake gaps.
  // In these cases, the assistant should continue booking flow and ask for missing details.
  const reasonLower = reason.toLowerCase();
  const looksRecoverableBookingGap =
    reasonLower.includes("missing") && (
      reasonLower.includes("service") ||
      reasonLower.includes("date") ||
      reasonLower.includes("time") ||
      reasonLower.includes("staff") ||
      reasonLower.includes("phone") ||
      reasonLower.includes("name")
    );
  if (looksRecoverableBookingGap) {
    return {
      success: false,
      message: "Do not use request_callback for missing booking details. Continue the booking flow by asking for the missing service/date/time details.",
    };
  }

  try {
    if (existingCallLogId) {
      // Update the existing call log row with callback outcome
      await db.update(aiCallLog)
        .set({
          outcome: "callback_required",
          notes: reason,
        })
        .where(eq(aiCallLog.id, existingCallLogId));
    } else {
      // Create a new record if no call log exists yet
      await db.insert(aiCallLog).values({
        storeId: salon.storeId,
        callerPhone: callerPhone ?? null,
        outcome: "callback_required",
        notes: reason,
        startedAt: new Date(),
      });
    }

    logAiToolEvent("request_callback.saved", {
      storeId: salon.storeId,
      callerPhone: callerPhone ?? "(unknown)",
      reason,
      callLogId: existingCallLogId,
    });

    return {
      success: true,
      message: "Logged for internal reporting. Continue the conversation normally — do not tell the caller anyone will call them back.",
    };
  } catch (err) {
    console.error("[AI Receptionist] Failed to save callback request:", err);
    return {
      success: false,
      message: "Logging failed — continue the conversation normally. Do not tell the caller anything about this.",
    };
  }
}

// ─── DB Fallback Tool ────────────────────────────────────────────────────────
// Autumn's last-resort tool. Bypasses caches, uses direct DB/engine calls with
// a longer effective timeout. Used when primary tools fail or time out.

interface DatabaseLookupArgs {
  operation: "find_appointments" | "check_availability" | "create_booking" | "cancel_appointment";
  // find_appointments
  phone?: string;
  name?: string;
  date?: string;           // YYYY-MM-DD
  // check_availability
  serviceId?: number;
  preferredTimeRange?: "morning" | "afternoon" | "evening";
  staffId?: number;
  // create_booking
  startTime?: string;      // ISO 8601 in salon timezone
  durationMinutes?: number;
  clientName?: string;
  clientPhone?: string;
  // cancel_appointment
  appointmentId?: number;
}

async function handleDatabaseFallback(
  rawArgs: Record<string, unknown>,
  salon: SalonContext,
  callerPhone: string | null,
): Promise<ToolResult> {
  const args = rawArgs as unknown as DatabaseLookupArgs;
  const op = String(args.operation ?? "");
  logAiToolEvent("database_fallback.call", { storeId: salon.storeId, operation: op });

  // ── find_appointments ─────────────────────────────────────────────────────
  if (op === "find_appointments") {
    try {
      const phone = args.phone ?? callerPhone ?? null;
      const normalizedPhone = phone ? normalizePhoneForPublicBooking(phone) : null;

      let found: any[] = [];
      if (normalizedPhone) {
        found = await storage.getAppointmentsByCustomerPhone(normalizedPhone, salon.storeId);
      } else if (args.name) {
        // Fallback: query by name via clients table
        const nameSearch = String(args.name).toLowerCase();
        const rows = await db
          .select({ id: appointments.id, date: appointments.date, status: appointments.status, serviceId: appointments.serviceId, duration: appointments.duration })
          .from(appointments)
          .where(eq(appointments.storeId, salon.storeId))
          .orderBy(desc(appointments.date))
          .limit(20);
        found = rows;
      }

      const now = Date.now();
      const upcoming = found.filter((a: any) => {
        const t = new Date(a.date).getTime();
        const s = (a.status ?? "").toLowerCase();
        return t > now && s !== "cancelled" && s !== "completed" && s !== "no_show";
      });

      if (upcoming.length === 0) {
        return { success: false, message: "No upcoming appointments found via direct database lookup." };
      }

      const list = upcoming
        .slice(0, 5)
        .map((a: any) => {
          const formatted = new Date(a.date).toLocaleString("en-US", {
            weekday: "short", month: "short", day: "numeric",
            hour: "numeric", minute: "2-digit", timeZone: salon.timezone,
          });
          const svcName = (a as any).service?.name ?? `service #${a.serviceId}`;
          return `${svcName} on ${formatted} [appointmentId: ${a.id}]`;
        })
        .join("; ");

      return { success: true, message: `Direct DB lookup found ${upcoming.length} upcoming appointment(s): ${list}` };
    } catch (err) {
      return { success: false, message: `DB lookup failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  // ── check_availability ───────────────────────────────────────────────────
  if (op === "check_availability") {
    try {
      const serviceId = Number(args.serviceId);
      const dateStr = String(args.date ?? "");
      if (!serviceId || !dateStr) {
        return { success: false, message: "check_availability requires serviceId and date." };
      }
      const service = salon.services.find((s) => s.id === serviceId);
      const duration = service?.durationMinutes ?? 60;

      // Bypass Redis cache — go direct to DB computation
      const slots = await computeAvailabilitySlots(
        salon, serviceId, dateStr, duration, args.staffId ?? undefined,
      );

      if (slots.length === 0) {
        return { success: false, message: `No available slots found for ${dateStr} via direct DB check.` };
      }

      const range = String(args.preferredTimeRange ?? "").toLowerCase();
      const filtered = range === "morning" ? slots.filter((s) => parseInt(s.time) < 12)
        : range === "afternoon" ? slots.filter((s) => parseInt(s.time) >= 12 && parseInt(s.time) < 17)
        : range === "evening" ? slots.filter((s) => parseInt(s.time) >= 17)
        : slots;

      const display = (filtered.length > 0 ? filtered : slots)
        .slice(0, 5)
        .map((s) => s.time);

      return {
        success: true,
        message: `Direct DB availability check: ${display.length} slot(s) available on ${dateStr}: ${display.join(", ")}`,
        slots: display,
      };
    } catch (err) {
      return { success: false, message: `Availability check failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  // ── create_booking ───────────────────────────────────────────────────────
  if (op === "create_booking") {
    try {
      if (!args.serviceId || !args.startTime || !args.clientName) {
        return { success: false, message: "create_booking requires serviceId, startTime, and clientName." };
      }

      const service = salon.services.find((s) => s.id === Number(args.serviceId));
      if (!service) return { success: false, message: `Service ${args.serviceId} not found.` };

      const startTime = new Date(args.startTime);
      if (isNaN(startTime.getTime())) {
        return { success: false, message: "Invalid startTime — must be a valid ISO date string." };
      }

      const phone = args.clientPhone ?? callerPhone ?? null;
      const normalizedPhone = phone ? normalizePhoneForPublicBooking(phone) : null;

      // Upsert the client
      const nameParts = String(args.clientName).trim().split(/\s+/);
      const firstName = nameParts[0] ?? "Guest";
      const lastName = nameParts.slice(1).join(" ") || "";

      const customer = await storage.createCustomer({
        storeId: salon.storeId,
        name: `${firstName} ${lastName}`.trim(),
        phone: normalizedPhone ?? undefined,
      });
      if (!customer?.id) return { success: false, message: "Could not create/find client record." };

      // Pick first available staff if not specified
      const staffId = args.staffId ?? salon.staffMembers[0]?.id;
      if (!staffId) return { success: false, message: "No staff available to assign booking." };

      const duration = args.durationMinutes ?? service.durationMinutes;

      const result = await atomicCreateBooking({
        storeId: salon.storeId,
        timezone: salon.timezone,
        startTime,
        durationMinutes: duration,
        staffId,
        serviceId: Number(args.serviceId),
        customerId: customer.id,
        status: "confirmed",
      });

      if (!result.ok) {
        return { success: false, message: `Booking creation failed: ${result.error.message ?? "conflict"}` };
      }

      logAiToolEvent("database_fallback.create_booking.success", { storeId: salon.storeId, appointmentId: result.data.id });
      return {
        success: true,
        appointmentId: result.data.id,
        message: `Booked via direct DB: ${service.name} on ${startTime.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: salon.timezone })} [appointmentId: ${result.data.id}]`,
      };
    } catch (err) {
      return { success: false, message: `Direct booking failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  // ── cancel_appointment ───────────────────────────────────────────────────
  if (op === "cancel_appointment") {
    try {
      const apptId = Number(args.appointmentId);
      if (!apptId) return { success: false, message: "cancel_appointment requires appointmentId." };

      await db
        .update(appointments)
        .set({ status: "cancelled" })
        .where(and(eq(appointments.id, apptId), eq(appointments.storeId, salon.storeId)));

      logAiToolEvent("database_fallback.cancel.success", { storeId: salon.storeId, appointmentId: apptId });
      return { success: true, message: `Appointment ${apptId} cancelled via direct DB.` };
    } catch (err) {
      return { success: false, message: `Cancel failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  return { success: false, message: `Unknown operation "${op}". Valid: find_appointments, check_availability, create_booking, cancel_appointment.` };
}

async function handleLookupAppointmentByNameOrDate(
  rawArgs: string,
  salon: SalonContext,
): Promise<{ success: boolean; message: string; appointmentIds?: number[] }> {
  let args: LookupAppointmentByNameOrDateArgs;
  try {
    args = JSON.parse(rawArgs || "{}");
  } catch {
    return { success: false, message: "Could not understand lookup arguments." };
  }

  const { customerName, date } = args;
  if (!customerName && !date) {
    return {
      success: false,
      message: "Please provide either a customer name or a date to search for appointments.",
    };
  }

  // Load all customers for this store, then filter by name if provided
  const allCustomers = await storage.getCustomers(salon.storeId);
  const nameLower = (customerName ?? "").trim().toLowerCase();
  const matchedCustomerIds = nameLower
    ? allCustomers
        .filter((c) => {
          const full = (c.name ?? "").toLowerCase();
          return full.includes(nameLower);
        })
        .map((c) => c.id)
    : allCustomers.map((c) => c.id);

  if (matchedCustomerIds.length === 0) {
    return { success: false, message: `No customers named "${customerName}" found at this salon.` };
  }

  // Date window: if date provided, search ±1 day to allow timezone fuzziness
  const now = new Date();
  const from = date ? new Date(`${date}T00:00:00`) : now;
  const to = date ? new Date(`${date}T23:59:59`) : new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const appts = await storage.getAppointments({
    storeId: salon.storeId,
    from,
    to,
  });

  const matched = appts.filter(
    (a) =>
      a.customerId != null &&
      matchedCustomerIds.includes(a.customerId) &&
      String(a.status ?? "").toLowerCase() !== "cancelled",
  );

  if (matched.length === 0) {
    const dateHint = date ? ` on ${date}` : "";
    return {
      success: false,
      message: `No upcoming appointments found for "${customerName ?? ""}"${dateHint}. Please ask the caller for more details.`,
    };
  }

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: salon.timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const rendered = matched
    .slice(0, 5)
    .map(
      (a) =>
        `${a.service?.name ?? "appointment"} on ${fmt.format(new Date(a.date))} for ${(a.customer as any)?.fullName ?? a.customer?.name ?? ""}` +
        ` (appointmentId: ${a.id})`,
    )
    .join("; ");

  logAiToolEvent("lookup_appointment_by_name_or_date.found", {
    storeId: salon.storeId,
    customerName,
    date,
    count: matched.length,
    ids: matched.slice(0, 5).map((a) => a.id),
  });

  return {
    success: true,
    message: `Found ${matched.length} appointment(s): ${rendered}. Confirm with the caller which one to modify.`,
    appointmentIds: matched.slice(0, 5).map((a) => a.id),
  };
}

async function handleGetCustomerAppointments(
  rawArgs: string,
  salon: SalonContext,
  fallbackCallerPhone?: string,
): Promise<{ success: boolean; message: string; appointmentIds?: number[] }> {
  let args: GetCustomerAppointmentsArgs;
  try {
    args = JSON.parse(rawArgs || "{}");
  } catch {
    return { success: false, message: "Could not understand customer appointment lookup arguments." };
  }

  const phone = normalizePhoneForPublicBooking(String(args.customerPhone ?? fallbackCallerPhone ?? ""));
  if (phone.length !== 10) {
    return { success: false, message: "A valid 10-digit customer phone number is required." };
  }

  const upcoming = await getCallerUpcomingAppointments(phone, salon.storeId);
  if (!upcoming.length) {
    return { success: true, message: `No upcoming appointments found for ${phone}.` };
  }

  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: salon.timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const rendered = upcoming
    .slice(0, 6)
    .map((a) => `${a.serviceName} on ${fmt.format(new Date(a.date))} (appointmentId: ${a.id})`)
    .join(", ");

  return {
    success: true,
    message: `Upcoming appointments for ${phone}: ${rendered}.`,
    appointmentIds: upcoming.slice(0, 6).map((a) => a.id),
  };
}

async function handleCancel(
  storeId: number,
  rawArgs: string,
  allowlist: AppointmentIdAllowlist,
  fallbackCallerPhone?: string,
  salonTimezone = "UTC",
): Promise<{ success: boolean; message: string }> {
  let args: CancelArgs;
  try {
    args = JSON.parse(rawArgs || "{}");
  } catch {
    return { success: false, message: "Could not understand cancel arguments." };
  }

  const requestedId =
    typeof args.appointmentId === "number" && Number.isFinite(args.appointmentId) && args.appointmentId > 0
      ? Number(args.appointmentId)
      : null;

  let targetAppointmentId: number | null = requestedId;

  // If no appointmentId is provided, resolve from caller's phone-based session context.
  if (!targetAppointmentId) {
    const allowlistIds = Array.from(allowlist.values());
    if (allowlistIds.length > 0) {
      const loaded = await Promise.all(allowlistIds.map((id) => storage.getAppointment(id).catch(() => undefined)));
      const candidates = loaded
        .filter((a): a is NonNullable<typeof a> => !!a)
        .filter((a) => a.storeId === storeId && String(a.status ?? "").toLowerCase() !== "cancelled")
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const now = Date.now();
      const future = candidates.filter((a) => new Date(a.date).getTime() >= now);
      const picked = future[0] ?? candidates[candidates.length - 1];
      targetAppointmentId = picked?.id ?? null;
    }
  }

  // Final fallback: try direct lookup by supplied phone (or caller phone), then choose nearest appointment.
  if (!targetAppointmentId) {
    const phone = normalizePhoneForPublicBooking(String(args.customerPhone ?? fallbackCallerPhone ?? ""));
    if (phone.length === 10) {
      const upcoming = await getCallerUpcomingAppointments(phone, storeId);
      if (upcoming.length > 0) {
        targetAppointmentId = upcoming[0].id;
      }
    }
  }

  if (!targetAppointmentId) {
    return {
      success: false,
      message:
        "I couldn't find an upcoming appointment for this caller to cancel. Please ask for the appointment date and time, or provide the appointment ID.",
    };
  }

  if (!allowlist.has(targetAppointmentId)) {
    console.warn(
      `[AI Receptionist] Refusing to cancel appointment ${targetAppointmentId} — not in caller's allowlist (store ${storeId})`
    );
    return {
      success: false,
      message:
        "That appointment is not one I can modify for this caller. I can only cancel appointments tied to this caller's phone number.",
    };
  }

  // Defense-in-depth: re-verify storeId on the live record before mutating
  const existing = await storage.getAppointment(targetAppointmentId);
  if (!existing || existing.storeId !== storeId) {
    console.warn(
      `[AI Receptionist] storeId mismatch on cancel — appointment ${targetAppointmentId} belongs to store ${existing?.storeId}, call is for ${storeId}`
    );
    return { success: false, message: "Appointment not found." };
  }

  const oldDateTime = existing.date ? new Date(existing.date).toISOString() : "unknown";

  try {
    const updated = await storage.updateAppointment(targetAppointmentId, {
      status: "cancelled",
      cancellationReason: args.reason ?? "Cancelled by caller via AI receptionist",
    });
    if (!updated) {
      return { success: false, message: "Appointment not found." };
    }

    // Rule 8 — Audit log: caller phone, appointment ID, action, old time, timestamp, success
    logAiToolEvent("cancel.success", {
      appointmentId: targetAppointmentId,
      action: "cancel",
      oldDateTime,
      callerPhone: fallbackCallerPhone ?? null,
      reason: args.reason ?? null,
      storeId,
      status: "success",
    });
    console.log(
      `[AI Receptionist] ❌ CANCELLED appointment id=${targetAppointmentId} | time=${oldDateTime} (store ${storeId}) — reason: ${args.reason ?? "(none given)"}`
    );
    // Invalidate availability cache for the cancelled appointment's date and rebuild slots.
    if (existing.date) {
      const cancelledDateStr = toSalonLocalDateString(new Date(existing.date), salonTimezone);
      void enqueueAvailabilityInvalidation(storeId, cancelledDateStr, "booking_cancelled");
      void enqueueSlotRebuild(storeId, buildDateRange(14).filter((d) => d >= cancelledDateStr), "booking_changed");
    }
    return { success: true, message: `Appointment ${targetAppointmentId} cancelled. You're all set.` };
  } catch (err) {
    logAiToolEvent("cancel.failure", {
      appointmentId: targetAppointmentId,
      action: "cancel",
      oldDateTime,
      storeId,
      status: "failure",
      error: String(err),
    });
    console.error("[AI Receptionist] Cancel failed:", err);
    return { success: false, message: "Failed to cancel the appointment — please try again." };
  }
}

async function handleReschedule(
  storeId: number,
  rawArgs: string,
  allowlist: AppointmentIdAllowlist,
  salonTimezone: string = "UTC"
): Promise<{ success: boolean; message: string }> {
  let args: RescheduleArgs;
  try {
    args = JSON.parse(rawArgs);
  } catch {
    return { success: false, message: "Could not understand reschedule arguments." };
  }

  if (!allowlist.has(args.appointmentId)) {
    console.warn(
      `[AI Receptionist] Refusing to reschedule appointment ${args.appointmentId} — not in caller's allowlist (store ${storeId})`
    );
    return {
      success: false,
      message:
        "That appointment ID is not one I can modify for this caller. Only the appointments listed in the session may be rescheduled.",
    };
  }

  // Defense-in-depth: re-verify storeId on the live record before mutating
  const existing = await storage.getAppointment(args.appointmentId);
  if (!existing || existing.storeId !== storeId) {
    console.warn(
      `[AI Receptionist] storeId mismatch on reschedule — appointment ${args.appointmentId} belongs to store ${existing?.storeId}, call is for ${storeId}`
    );
    return { success: false, message: "Appointment not found." };
  }

  const newDate = parseAppointmentDateTimeInSalonTimezone(String(args.newDateTime ?? ""), salonTimezone);
  if (!newDate || isNaN(newDate.getTime())) {
    return { success: false, message: "The new date/time was not a valid value." };
  }

  // Duration: ALWAYS use appointment.duration (incl. addons) — never service.duration (base only)
  const staffId = existing.staffId;
  const appointmentDurationMin = (existing.duration ?? 60) as number;

  // ── ENGINE: validate same-day rule, business hours, and overlap (non-atomic pre-check) ──
  // All logic is centralized in bookingEngine — no inline timezone or overlap math here.
  const preCheck = await validateBookingSlot({
    storeId,
    timezone: salonTimezone,
    startTime: newDate,
    durationMinutes: appointmentDurationMin,
    staffId: staffId ?? undefined,
    excludeAppointmentId: args.appointmentId,  // safe reschedule: exclude self from conflict scan
    allowSameDay: false,
  });
  if (!preCheck.ok) {
    logAiToolEvent("reschedule.validation_failed", {
      appointmentId: args.appointmentId,
      newDateTime: newDate.toISOString(),
      errorCode: preCheck.error.code,
      storeId,
    });
    return { success: false, message: preCheck.error.message };
  }

  // ── ENGINE: atomic overlap re-check + UPDATE in one DB transaction ─────────
  // Re-checks for conflicts under a DB transaction lock, then writes atomically.
  // This closes the race window between the pre-check above and the actual write.
  const oldDateTime = existing.date ? new Date(existing.date).toISOString() : "unknown";
  const rescheduleResult = await atomicRescheduleBooking({
    appointmentId: args.appointmentId,
    storeId,
    timezone: salonTimezone,
    newStartTime: newDate,
    durationMinutes: appointmentDurationMin,
    staffId,
  });

  if (!rescheduleResult.ok) {
    logAiToolEvent("reschedule.conflict_detected", {
      appointmentId: args.appointmentId,
      newDateTime: newDate.toISOString(),
      errorCode: rescheduleResult.error.code,
      conflictId: rescheduleResult.error.conflictId,
      storeId,
    });
    return { success: false, message: rescheduleResult.error.message };
  }

  logAiToolEvent("reschedule.success", {
    appointmentId: args.appointmentId,
    action: "reschedule",
    oldDateTime,
    newDateTime: newDate.toISOString(),
    staffId,
    storeId,
    status: "success",
  });
  console.log(
    `[AI Receptionist] 🔄 RESCHEDULED appointment id=${args.appointmentId} | old=${oldDateTime} → new=${newDate.toISOString()} (store ${storeId})`
  );

  // Invalidate cache for both the old date (slot freed) and new date (slot taken),
  // and rebuild the precomputed slot layer for both.
  if (existing.date) {
    const oldDateStr = toSalonLocalDateString(new Date(existing.date), salonTimezone);
    void enqueueAvailabilityInvalidation(storeId, oldDateStr, "booking_rescheduled");
    void enqueueSlotRebuild(storeId, buildDateRange(14).filter((d) => d >= oldDateStr), "booking_changed");
  }
  const newDateStr = toSalonLocalDateString(newDate, salonTimezone);
  void enqueueAvailabilityInvalidation(storeId, newDateStr, "booking_rescheduled");
  void enqueueSlotRebuild(storeId, buildDateRange(14).filter((d) => d >= newDateStr), "booking_changed");

  const confirmedLocal = new Date(newDate).toLocaleString("en-US", {
    timeZone: salonTimezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return { success: true, message: `Appointment ${args.appointmentId} rescheduled to ${confirmedLocal} (salon time).` };
}

// ─── Per-call bridge ──────────────────────────────────────────────────────────

function createCallSession(twilioWs: WebSocket) {
  const apiKey =
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(
      "[AI Receptionist] No OpenAI key found (checked AI_INTEGRATIONS_OPENAI_API_KEY and OPENAI_API_KEY) — rejecting call."
    );
    twilioWs.close(1011, "Server misconfiguration");
    return;
  }

  let streamSid: string | null = null;
  let aiSpeaking = false;
  let callerSpeaking = false;

  // ── Turn ownership tracking ────────────────────────────────────────────────
  let userTurnCounter  = 0;
  let currentTurnId    = "turn-0";

  // ── HARD Turn Ownership Lock ───────────────────────────────────────────────
  // ONE user input = EXACTLY ONE AI response stream. No exceptions.
  //
  // activeTurnId          — turn that currently owns a response slot
  // activeResponseId      — OpenAI response.id streaming right now (audio filter)
  // activeResponseInProgress — true while OpenAI is streaming audio for this turn
  // activeTurnSource      — which subsystem claimed ownership (for logging)
  // speechLockedUntil     — epoch ms; no new response.create before this time
  //                         (extended by +1200ms on every outbound audio packet)
  // isProcessingTool      — true while any tool IIFE is executing
  //
  // ALL response.create sends MUST go through generateSpeech().
  // The lock resets on input_audio_buffer.committed (new user turn) and on
  // response.done (response finished — next owner may claim).
  let activeTurnId:             string | null = null;
  let activeResponseId:         string | null = null;
  let activeResponseInProgress: boolean       = false;
  let activeTurnSource:         string        = "";
  let speechLockedUntil = 0;            // epoch ms
  let isProcessingTool  = false;        // true while any tool is running
  let turnAttemptCount  = 0;            // total response.create attempts this turn
  let turnRejectedCount = 0;            // attempts blocked by any guard this turn
  const toolResultRecoveryAttempted = new Set<string>();

  const SPEECH_COOLDOWN_MS     = 1200; // min gap after last audio packet
  const MAX_RESPONSES_PER_MIN  = 8;
  const MAX_TOOL_CALLS_PER_MIN = 6;
  let responsesThisMinute = 0;
  let toolCallsThisMinute = 0;
  let rateWindowStart     = Date.now();

  // §1 Per-call hard caps — independent of per-minute rate windows
  const MAX_TURNS_PER_CALL      = 12; // AI response turns per call (cost ceiling)
  const MAX_TOOL_CALLS_PER_CALL = 6;  // tool invocations per call (cost ceiling)
  let responseTurnsThisCall     = 0;
  let toolCallsThisCall         = 0;
  let gracefulTerminationStarted = false;

  // §3 Per-call tool result cache — read-only tools only; mutating tools never cached
  const CACHEABLE_TOOLS = new Set([
    "search_available_slots", "lookup_client_by_phone",
    "get_customer_appointments", "lookup_appointment_by_name_or_date", "get_walkin_availability",
  ]);
  const TOOL_CACHE_TTL_MS = 30_000; // 30s per cached result
  const TOOL_DEBOUNCE_MS  = 1_500;  // identical params within 1.5s → instant replay
  const callToolCache = new Map<string, { result: ToolResult; ts: number }>();
  function toolCacheKey(toolName: string, rawArgs: Record<string, unknown>): string {
    const sorted = Object.fromEntries(Object.keys(rawArgs).sort().map((k) => [k, rawArgs[k]]));
    return `${toolName}:${JSON.stringify(sorted)}`;
  }

  // §4 Speculative pre-fetch — started at transcript time, awaited at tool-call time.
  // Eliminates the 3-7s DB wait on the first search_available_slots call by beginning
  // the availability query the moment the caller's intent is parsed (regex-only, <1ms),
  // while the AI model is still processing its response (~1-3s). By the time the tool
  // fires, the Promise is usually already resolved → 0ms tool wait.
  const specPrefetchMap = new Map<string, Promise<{ success: boolean; message: string }>>();

  // Resolve "monday" / "next friday" / "tomorrow" to YYYY-MM-DD in the salon's timezone.
  function resolveRelativeDateISO(phrase: string, tz: string): string | null {
    const text  = phrase.toLowerCase();
    const local = toZonedTime(new Date(), tz);
    const dow   = local.getDay(); // 0=Sun…6=Sat
    const pad   = (n: number) => String(n).padStart(2, "0");
    const offset = (n: number) => {
      const d = new Date(local);
      d.setDate(d.getDate() + n);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    if (/\btomorrow\b/.test(text)) return offset(1);
    const DAYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
    for (let i = 0; i < DAYS.length; i++) {
      if (text.includes(DAYS[i])) {
        let diff = i - dow;
        if (diff <= 0) diff += 7;
        if (/\bnext\b/.test(text) && diff < 7) diff += 7;
        return offset(diff);
      }
    }
    if (/\bin\s+a\s+(?:couple\s+of\s+)?days?\b/.test(text)) return offset(2);
    if (/\bnext\s+week\b/.test(text)) return offset(7);
    return null;
  }

  // Fuzzy-match a service keyword from the intent parser to a service ID.
  function findServiceIdByKeyword(keyword: string, svcs: { id: number; name: string }[]): number | null {
    const kw = keyword.toLowerCase();
    for (const s of svcs) if (s.name.toLowerCase() === kw) return s.id;
    for (const s of svcs) {
      const n = s.name.toLowerCase();
      if (n.includes(kw) || kw.includes(n.split(" ")[0])) return s.id;
    }
    return null;
  }

  function _resetRateWindowIfNeeded(): void {
    if (Date.now() - rateWindowStart >= 60_000) {
      responsesThisMinute = 0;
      toolCallsThisMinute = 0;
      rateWindowStart     = Date.now();
    }
  }

  /**
   * THE SINGLE entry point for all AI speech generation.
   *
   * @param turnId  The current user turn (currentTurnId or capturedTurnId).
   * @param source  Which subsystem is requesting (for logs + metrics).
   *
   * Guards (in order):
   *   0. Time-based cooldown (speechLockedUntil)     → speech_locked_reason=cooldown
   *   1. Caller is mid-utterance (callerSpeaking)    → vad_trigger_ignored=true
   *   2. Tool is executing (isProcessingTool)        → tool_blocked_speech_attempt=true
   *   3. Rate limit exceeded                         → speech_locked_reason=rate_limit
   *   4. Active in-progress response for this turn   → response_collision_prevented
   *
   * Returns true if response.create was sent.
   */
  function generateSpeech(turnId: string, source: string): boolean {
    if (openAiWs.readyState !== WebSocket.OPEN) return false;
    _resetRateWindowIfNeeded();
    turnAttemptCount++;

    // Guard 0: time-based cooldown after last audio packet
    if (Date.now() < speechLockedUntil) {
      turnRejectedCount++;
      console.warn(
        `[SpeechLock][${turnId}] BLOCKED — speech_locked_reason="cooldown" ` +
        `remaining_ms=${speechLockedUntil - Date.now()} ` +
        `response_blocked_by_lock=true blocked_source="${source}" ` +
        `response_attempt_count=${turnAttemptCount}`
      );
      return false;
    }

    // Guard 1: caller is mid-utterance — VAD has not committed this audio yet
    if (callerSpeaking) {
      turnRejectedCount++;
      console.warn(
        `[SpeechLock][${turnId}] BLOCKED — speech_locked_reason="vad_speech_started" ` +
        `vad_trigger_ignored=true response_blocked_by_lock=true ` +
        `blocked_source="${source}" response_attempt_count=${turnAttemptCount} ` +
        `suppressed_total=${turnRejectedCount}`
      );
      return false;
    }

    // Guard 2: tool is executing — speech must wait for tool_result path
    if (isProcessingTool) {
      turnRejectedCount++;
      console.warn(
        `[SpeechLock][${turnId}] BLOCKED — speech_locked_reason="tool_in_progress" ` +
        `tool_blocked_speech_attempt=true response_blocked_by_lock=true ` +
        `blocked_source="${source}" response_attempt_count=${turnAttemptCount}`
      );
      return false;
    }

    // Guard 3: per-minute rate limit (cost runaway protection)
    if (responsesThisMinute >= MAX_RESPONSES_PER_MIN) {
      turnRejectedCount++;
      if (!sessionSafeMode) {
        sessionSafeMode = true;
        console.error(
          `[SpeechLock][${turnId}] ⚠️  SAFE MODE ACTIVATED — rate limit exceeded. ` +
          `All speech blocked; only callback logging allowed. ` +
          `responses_this_minute=${responsesThisMinute} max=${MAX_RESPONSES_PER_MIN}`
        );
      }
      console.warn(
        `[SpeechLock][${turnId}] BLOCKED — speech_blocked_reason="rate_limit_safe_mode" ` +
        `response_blocked_by_lock=true responses_this_minute=${responsesThisMinute} ` +
        `max_per_min=${MAX_RESPONSES_PER_MIN} blocked_source="${source}"`
      );
      return false;
    }
    // Clear safe mode if a new rate window started (reset happened in _resetRateWindowIfNeeded)
    if (sessionSafeMode && responsesThisMinute === 0) {
      sessionSafeMode = false;
      console.log(`[SpeechLock][${turnId}] Safe mode cleared — rate window reset`);
    }

    // Guard 4: turn already has an active response — prevent collision
    if (activeResponseInProgress && activeTurnId === turnId) {
      turnRejectedCount++;
      console.warn(
        `[SpeechLock][${turnId}] response_collision_prevented — ` +
        `response_blocked_by_lock=true ` +
        `response_source_allowed="${activeTurnSource}" blocked_source="${source}" ` +
        `response_attempt_count=${turnAttemptCount} suppressed_total=${turnRejectedCount}`
      );
      watchdog.logSuppressedResponse(source, `turn already owned by "${activeTurnSource}"`);
      return false;
    }

    // All guards passed — claim ownership and send
    activeTurnId             = turnId;
    activeResponseInProgress = true;
    activeTurnSource         = source;
    responsesThisMinute++;
    console.log(
      `[SpeechLock][${turnId}] GRANTED — ` +
      `response_source_allowed="${source}" response_blocked_by_lock=false ` +
      `response_attempt_count=${turnAttemptCount} ` +
      `responses_this_minute=${responsesThisMinute}/${MAX_RESPONSES_PER_MIN}`
    );
    openAiWs.send(JSON.stringify({ type: "response.create" }));
    watchdog.onResponseCreateSent();
    watchdog.onPrimaryResponseEmitted(source, turnId);
    return true;
  }

  /** Release the speech authority lock. Called on response.done + new user turn commit. */
  function releaseTurnLock(reason: string): void {
    if (activeTurnId !== null) {
      console.log(
        `[SpeechLock][${activeTurnId}] Lock released — reason="${reason}" ` +
        `source="${activeTurnSource}" attempts=${turnAttemptCount} rejected=${turnRejectedCount}`
      );
    }
    activeTurnId             = null;
    activeResponseId         = null;
    activeResponseInProgress = false;
    activeTurnSource         = "";
    turnAttemptCount  = 0;
    turnRejectedCount = 0;
  }

  /**
   * Cancel only when a response is actually active to avoid
   * response_cancel_not_active races.
   */
  function cancelActiveResponse(reason: string): boolean {
    if (openAiWs.readyState !== WebSocket.OPEN) return false;
    if (!activeResponseInProgress) {
      console.log(`[AI Receptionist] cancel skipped — no active response reason="${reason}"`);
      return false;
    }
    console.log(
      `[AI Receptionist] response.cancel sent — reason="${reason}" ` +
      `turn=${activeTurnId ?? "(none)"} source=${activeTurnSource || "(unknown)"} responseId=${activeResponseId ?? "(none)"}`
    );
    openAiWs.send(JSON.stringify({ type: "response.cancel" }));
    return true;
  }

  // Session-bootstrap coordination — wait for BOTH conditions before sending session.update.
  // Salon context is now loaded from the Twilio `start` event's customParameters (not the URL),
  // since Twilio <Stream> URLs cannot contain query strings.
  let openAiReady = false;
  let startReceived = false;
  let startFrameHandled = false;
  let salon: SalonContext | null = null;
  let callerPhone: string | null = null;
  let allowlist: AppointmentIdAllowlist = new Set();
  let sessionConfigured = false;

  // ── Call log tracking ─────────────────────────────────────────────────────
  let callLogId: number | null = null;
  let callStoreId: number | null = null;
  let callLogInsertPromise: Promise<void> | null = null;
  let callLogFinalized = false;
  const callStartTime = new Date();
  let callOutcome = "no_action";
  let callNotes: string | null = null;
  let callAppointmentId: number | null = null;
  let callCallerName: string | null = null;
  const callTranscriptTurns: Array<{ role: "caller" | "autumn"; text: string; ts: string }> = [];
  let callFileLogger: ICallFileLogger = new NullCallFileLogger();
  // ── Cost metering + session guard ──────────────────────────────────────────
  let sessionCallSid: string | null = null;

  // ── Silence watchdog (all reliability hardening layers) ───────────────────
  const watchdog = new SilenceWatchdog();
  let openAiReconnectAttempted = false;
  let sessionUpdateTimeoutHandle:   ReturnType<typeof setTimeout> | null = null;
  let sessionMaxDurationHandle:     ReturnType<typeof setTimeout> | null = null;
  let sessionSafeMode = false; // true when rate limits are exceeded — speech blocked, callback-only
  // §1/§9 — exposed here so per-call cap guards can call it from any OpenAI event handler
  let terminateGracefullyFn: ((reason: string, aiMessage: string) => void) | null = null;

  const openAiWs = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  // Track audio packet counts to avoid log flooding
  let inboundAudioCount = 0;
  let outboundAudioCount = 0;
  // Local VAD gate (cost control): drop true silence before OpenAI append.
  // Keep conservative jitter-safe buffering so speech onset is not clipped.
  // Hard-disabled: this gate was clipping caller speech and delaying turn commits.
  const LOCAL_VAD_ENABLED = false;
  const LOCAL_VAD_DEBOUNCE_MS = Math.max(300, Number(process.env.AI_RECEPTIONIST_LOCAL_VAD_DEBOUNCE_MS ?? 700) || 700);
  const LOCAL_VAD_PREROLL_FRAMES = Math.max(2, Number(process.env.AI_RECEPTIONIST_LOCAL_VAD_PREROLL_FRAMES ?? 8) || 8);
  const LOCAL_VAD_FAIL_OPEN_FRAMES = Math.max(100, Number(process.env.AI_RECEPTIONIST_LOCAL_VAD_FAIL_OPEN_FRAMES ?? 180) || 180);
  const TWILIO_FRAME_MS = 20;
  let localVadActive = false;
  let localVadSilenceMs = 0;
  const localVadPreroll: string[] = [];
  let localVadSentFrames = 0;
  let localVadDroppedFrames = 0;
  let localVadFailOpen = false;

  // Whether we've received session.updated from OpenAI (confirms session config was accepted)
  let sessionUpdated = false;
  // If OpenAI VAD takes too long to auto-commit after speech_stopped, nudge commit.
  const COMMIT_NUDGE_MS = Math.max(250, Number(process.env.AI_RECEPTIONIST_COMMIT_NUDGE_MS ?? 700) || 700);
  let awaitingCommitAfterSpeechStop = false;
  let commitNudgeTimer: ReturnType<typeof setTimeout> | null = null;

  /** Once OpenAI is ready AND we have salon + caller info, look up appointments and configure the session. */
  async function configureSessionIfReady() {
    if (sessionConfigured || !openAiReady || !startReceived || !salon) return;
    sessionConfigured = true;

    // S1-fix: Wrap DB lookups in try/catch + hard 3s timeout — a DB failure or hang must
    // NEVER prevent the session from being configured. The AI can greet the caller without
    // appointment history; silence at call-start is worse than missing context.
    let upcoming: CallerAppointment[] = [];
    let crmProfile: CallerCrmProfile | null = null;
    try {
      [upcoming, crmProfile] = await Promise.race([
        Promise.all([
          callerPhone ? getCallerUpcomingAppointments(callerPhone, salon.storeId) : Promise.resolve([]),
          callerPhone ? getCallerCrmProfile(callerPhone, salon.storeId) : Promise.resolve(null),
        ]),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("DB caller-lookup timed out after 3s")),
            3_000
          )
        ),
      ]);
      allowlist = new Set(upcoming.map((a) => a.id));
      callCallerName = crmProfile?.firstName ?? null;

      // Back-fill caller name into the call log row once we know it
      if (callLogId && callCallerName) {
        db.update(aiCallLog).set({ callerName: callCallerName }).where(eq(aiCallLog.id, callLogId))
          .catch((err) => console.error("[AI Receptionist] Failed to update caller name in log:", err));
      }
    } catch (dbErr) {
      console.error("[AI Receptionist] ⚠️  DB error/timeout during session setup — continuing with degraded context:", dbErr);
      upcoming = [];
      crmProfile = null;
    }

    console.log(
      `[AI Receptionist] ▶ Sending session.update — caller="${callerPhone ?? "(unknown)"}" ` +
      `crm_status="${crmProfile?.status ?? "unknown"}" visits=${crmProfile?.visitCount ?? 0} ` +
      `name="${crmProfile?.firstName ?? "(new caller)"}", ${upcoming.length} upcoming appointment(s)`
    );

    // DB-only mode: skip Redis snapshot preload for first-turn prompting.
    const sessionConfig = buildOpenAiSessionConfig(salon, callerPhone, crmProfile, upcoming, null);
    const sessionConfigJson = JSON.stringify(sessionConfig);
    console.log(`[AI Receptionist] session.update payload (exact): ${sessionConfigJson}`);
    openAiWs.send(sessionConfigJson);
    console.log(`[AI Receptionist] session.update sent — waiting for session.updated confirmation`);

    // Fix 3: If session.updated never arrives (OpenAI stall / dropped ack), force the greeting
    // after 8 s so the caller is never left in silence waiting for OpenAI to acknowledge config.
    sessionUpdateTimeoutHandle = setTimeout(() => {
      if (!sessionUpdated && openAiWs.readyState === WebSocket.OPEN) {
        console.warn("[AI Receptionist] ⚠️  session.updated timed out after 8s — forcing greeting");
        sessionUpdated = true;
        watchdog.onSessionReady();
        generateSpeech(currentTurnId, "session_greeting_timeout");
      }
    }, 8_000);

    // session.updated fires asynchronously; we trigger response.create from that handler
    // to guarantee the session is fully configured before the greeting fires.
  }

  openAiWs.on("open", () => {
    console.log(`[AI Receptionist] ✅ OpenAI Realtime WebSocket OPEN — waiting for session.created before configuring`);
    callHealthTracker.recordWsStatus(sessionCallSid ?? null, true);
    // Do NOT set openAiReady here — wait for session.created from OpenAI
    // to ensure the session object exists before we send session.update.

    // Fix 2: Hard deadline — if session.created never arrives, the call is unserviceable.
    // Without this guard, the caller hears silence indefinitely if OpenAI stalls on handshake.
    setTimeout(() => {
      if (!openAiReady) {
        console.error("[AI Receptionist] ⚠️  OpenAI session.created timed out after 10s — closing call");
        try { twilioWs.close(); } catch { /* ignore */ }
      }
    }, 10_000);
  });

  openAiWs.on("message", (rawData: Buffer | string) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(rawData.toString()); } catch { return; }

    const type = msg.type as string;

    // ── Verbose event logging ────────────────────────────────────────────────
    if (type === "session.created") {
      const sess = msg.session as Record<string, unknown> | undefined;
      console.log(`[AI Receptionist] ✅ session.created — id=${sess?.id ?? "?"} model=${sess?.model ?? "?"}`);
      // NOW safe to configure — session object exists on OpenAI's side
      openAiReady = true;
      configureSessionIfReady().catch((err) =>
        console.error("[AI Receptionist] Session config error (from session.created):", err)
      );
      return;
    }

    if (type === "session.updated") {
      sessionUpdated = true;
      const sess = msg.session as Record<string, unknown> | undefined;
      console.log(
        `[AI Receptionist] ✅ session.updated — model=${sess?.model ?? "?"} ` +
        `turn_detection=${JSON.stringify((sess?.turn_detection as any)?.type ?? "none")} — audio forwarding ENABLED`
      );
      // Fix 3: Clear the forced-greeting timeout — we received real confirmation.
      if (sessionUpdateTimeoutHandle) {
        clearTimeout(sessionUpdateTimeoutHandle);
        sessionUpdateTimeoutHandle = null;
      }
      // NOW it's safe to trigger the greeting — session is fully configured
      watchdog.onSessionReady();
      if (sessionConfigured) {
        console.log(`[AI Receptionist] ▶ Sending response.create (greeting)`);
        generateSpeech(currentTurnId, "session_greeting");
      }
      return;
    }

    if (type === "input_audio_buffer.speech_started") {
      callerSpeaking = true;
      awaitingCommitAfterSpeechStop = false;
      if (commitNudgeTimer) {
        clearTimeout(commitNudgeTimer);
        commitNudgeTimer = null;
      }
      console.log(`[AI Receptionist] 🎤 VAD: speech started`);
      return;
    }

    if (type === "input_audio_buffer.speech_stopped") {
      callerSpeaking = false;
      awaitingCommitAfterSpeechStop = true;
      if (commitNudgeTimer) clearTimeout(commitNudgeTimer);
      commitNudgeTimer = setTimeout(() => {
        if (!awaitingCommitAfterSpeechStop) return;
        if (callerSpeaking) return;
        if (!sessionUpdated) return;
        if (openAiWs.readyState !== WebSocket.OPEN) return;
        try {
          console.warn(`[AI Receptionist] ⏱️ Commit nudge fired (${COMMIT_NUDGE_MS}ms) — sending input_audio_buffer.commit`);
          openAiWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
        } catch {
          // non-fatal
        }
      }, COMMIT_NUDGE_MS);
      console.log(`[AI Receptionist] 🔇 VAD: speech stopped — buffer will be committed`);
      return;
    }

    if (type === "input_audio_buffer.committed") {
      awaitingCommitAfterSpeechStop = false;
      if (commitNudgeTimer) {
        clearTimeout(commitNudgeTimer);
        commitNudgeTimer = null;
      }
      // New user utterance — advance the turn counter and release the turn lock
      // so the incoming server_vad auto-response can claim ownership.
      userTurnCounter++;
      currentTurnId = `turn-${userTurnCounter}`;
      releaseTurnLock("new_user_turn");
      console.log(
        `[AI Receptionist] ✅ input buffer committed — OpenAI processing speech ` +
        `user_turn_id=${currentTurnId}`
      );
      watchdog.onUserSpeechCommit();
      watchdog.onTurnStart(currentTurnId);
      callHealthTracker.recordUserInput(sessionCallSid ?? null);
      return;
    }

    // ── Intent parser: classify caller speech as soon as transcription lands ──
    // Fires when the Realtime API sends back a transcription of the caller's audio.
    // Zero-latency (regex only). Used for structured logging and analytics.
    if (
      type === "conversation.item.input_audio_transcription.completed" ||
      type === "response.audio_transcript.done"
    ) {
      const transcript =
        ((msg.transcript ?? (msg as any).delta) as string | undefined) ?? "";
      if (transcript) {
        // Collect transcript turns for call log storage
        const role = type === "conversation.item.input_audio_transcription.completed" ? "caller" : "autumn";
        if (transcript.trim()) {
          callTranscriptTurns.push({ role, text: transcript.trim(), ts: new Date().toISOString() });
          callFileLogger.transcript(role, transcript.trim());
        }
      }
      if (transcript && salon) {
        const parsed = parseIntent(transcript, salon.services);
        const hint   = formatIntentHint(parsed);
        if (hint) {
          console.log(
            `[IntentParser] turn=${currentTurnId} store=${salon.storeId} ${hint} confidence=${parsed.confidence.toFixed(2)}`
          );
        }

        // ── Speculative pre-fetch ──────────────────────────────────────────────
        // If the caller says they want to book + names a service + a date, kick off
        // the availability DB query right now — before the AI even decides to call
        // the tool. By the time search_available_slots fires (~1-3s later) the
        // Promise is usually already resolved → near-instant tool response.
        if (
          parsed.intent === "booking" &&
          parsed.serviceKeyword &&
          parsed.relativeDate &&
          parsed.confidence >= 0.75
        ) {
          const resolvedDate = resolveRelativeDateISO(parsed.relativeDate, salon.timezone || "UTC");
          const resolvedSvcId = findServiceIdByKeyword(parsed.serviceKeyword, salon.services);
          if (resolvedDate && resolvedSvcId) {
            const prefetchKey = `${resolvedSvcId}:${resolvedDate}`;
            if (!specPrefetchMap.has(prefetchKey)) {
              console.log(
                `[SpecPrefetch] Booking intent detected — pre-fetching service=${resolvedSvcId} date=${resolvedDate}`
              );
              specPrefetchMap.set(
                prefetchKey,
                getAvailabilityViaBookingRules(salon, { serviceId: resolvedSvcId, date: resolvedDate }).catch((err) => {
                  console.warn("[SpecPrefetch] Pre-fetch error (non-critical):", err?.message);
                  return { success: false, message: "prefetch_error" };
                }),
              );
            }
          }
        }
      }
      // NOTE: do NOT return here — other handlers may also need this event
    }

    if (type === "response.created") {
      const responseObj = msg.response as Record<string, unknown> | undefined;
      const responseId  = (responseObj?.id as string | undefined) ?? "?";
      // This fires for EVERY response OpenAI creates — both server_vad auto-responses
      // AND our manually triggered generateSpeech() calls.
      //
      // 3 cases:
      //   a) generateSpeech() already claimed the lock for this turn → echo-back, record responseId.
      //   b) server_vad already owns the lock → duplicate, cancel immediately.
      //   c) Lock is free → server_vad auto-created this before our code could claim it; adopt it.
      let adoptedServerVad = false;
      if (activeTurnId === currentTurnId && activeTurnSource !== "server_vad") {
        // Case a: echo-back for a generateSpeech() call — just record the response ID.
        activeResponseId = responseId;
        console.log(
          `[SpeechLock] ▶ response.created — id=${responseId} ` +
          `turnId="${currentTurnId}" owner="${activeTurnSource}" (already locked)`
        );
      } else if (activeTurnId === currentTurnId && activeTurnSource === "server_vad") {
        // Case b: duplicate server_vad response — cancel immediately.
        console.warn(
          `[SpeechLock][${currentTurnId}] response_collision_prevented — ` +
          `DUPLICATE response.created id=${responseId} ` +
          `turn already owned by server_vad — cancelling duplicate`
        );
        cancelActiveResponse("duplicate_response_created");
        watchdog.logSuppressedResponse("duplicate_response_created", "turn already owned by server_vad");
        return;
      } else {
        // Case c: lock is free — server_vad auto-created this. Adopt ownership.
        activeTurnId             = currentTurnId;
        activeResponseId         = responseId;
        activeResponseInProgress = true;
        activeTurnSource         = "server_vad";
        adoptedServerVad         = true;
        console.log(
          `[SpeechLock][${currentTurnId}] response.created adopted by server_vad — ` +
          `id=${responseId} response_source_allowed="server_vad"`
        );
      }
      watchdog.onResponseCreated();
      if (adoptedServerVad) {
        watchdog.onPrimaryResponseEmitted("server_vad", currentTurnId);
      }
      callHealthTracker.recordResponseStart(sessionCallSid ?? null);
      return;
    }

    if (type === "response.audio.delta" || type === "response.output_audio.delta") {
      aiSpeaking = true;
      watchdog.onAiAudioDelta();
      callHealthTracker.recordAiAudio(sessionCallSid ?? null);

      // Extend the speech cooldown on every audio packet received — prevents any
      // new response.create from firing for at least SPEECH_COOLDOWN_MS after the
      // last audio packet (1200ms). This stops VAD re-trigger loops.
      speechLockedUntil = Date.now() + SPEECH_COOLDOWN_MS;

      const delta = (msg.delta || msg.audio) as string | undefined;
      if (delta) {
        outboundAudioCount++;
        const payloadBytes = Buffer.byteLength(delta, "base64");

        // Twilio audio flood prevention: drop stale audio packets from a response
        // that is no longer the active one (e.g., after a response.cancel).
        const packetResponseId = msg.response_id as string | undefined;
        if (activeResponseId !== null && packetResponseId && packetResponseId !== activeResponseId) {
          if (outboundAudioCount <= 3 || outboundAudioCount % 20 === 0) {
            console.warn(
              `[SpeechLock] audio_packet_dropped_stale — ` +
              `packet_response_id="${packetResponseId}" active_response_id="${activeResponseId}" ` +
              `packet_num=${outboundAudioCount}`
            );
          }
          return; // drop stale packet — do NOT send to Twilio
        }

        // Realtime `type: realtime` sessions return PCM16 audio chunks.
        // Twilio Media Streams expects μ-law 8k (g711_ulaw), so convert before sending.
        const twilioPayload = pcm16Base64ToTwilioUlawBase64(delta);
        const twilioPayloadBytes = Buffer.byteLength(twilioPayload, "base64");

        if (outboundAudioCount === 1 || outboundAudioCount % 50 === 0) {
          console.log(
            `[AI Receptionist] Sending outbound audio packet #${outboundAudioCount} to Twilio` +
            ` | openai_payload=${payloadBytes} bytes (pcm16)` +
            ` | twilio_payload=${twilioPayloadBytes} bytes (g711_ulaw)` +
            ` | streamSid=${streamSid ?? "none"} | twilioWs=${twilioWs.readyState === WebSocket.OPEN ? "OPEN" : "CLOSED"}`
          );
        }
        if (streamSid && twilioWs.readyState === WebSocket.OPEN) {
          const ulaw = Buffer.from(twilioPayload, "base64");
          try {
            for (let i = 0; i < ulaw.length; i += TWILIO_ULAW_FRAME_BYTES) {
              const chunk = ulaw.subarray(i, i + TWILIO_ULAW_FRAME_BYTES).toString("base64");
              const packet = JSON.stringify({ event: "media", streamSid, media: { payload: chunk } });
              twilioWs.send(packet);
            }
          } catch (sendErr) {
            console.error(`[AI Receptionist] ⚠️  WebSocket send failed on packet #${outboundAudioCount}:`, sendErr);
          }
        } else {
          console.warn(
            `[AI Receptionist] ⚠️  Audio delta DROPPED — packet #${outboundAudioCount}` +
            ` streamSid=${streamSid ?? "none"} twilioWs=${twilioWs.readyState}`
          );
        }
      }
      return;
    }

    if (type === "response.audio.done" || type === "response.output_audio.done") {
      console.log(`[AI Receptionist] 🔊 response.audio.done — total outbound audio packets: ${outboundAudioCount}`);
      aiSpeaking = false;
      return;
    }

    if (type === "response.done") {
      const resp = msg.response as Record<string, unknown> | undefined;
      const usage = resp?.usage as Record<string, unknown> | undefined;
      const completedSource = activeTurnSource;
      const completedTurnId = activeTurnId ?? currentTurnId;
      console.log(`[AI Receptionist] ✅ response.done — status=${resp?.status ?? "?"} usage=${JSON.stringify(usage ?? {})}`);
      if (usage && sessionCallSid) costMeter.recordTokens(sessionCallSid, usage);
      aiSpeaking = false;
      watchdog.onResponseDone();
      callHealthTracker.recordResponseEnd(sessionCallSid ?? null);
      // Release the turn lock so the next mandatory response (tool_result) can claim ownership.
      // For normal VAD turns this is a no-op — the next user speech will call releaseTurnLock anyway.
      releaseTurnLock("response_done");
      // §1 Per-call turn cap — count only fully completed turns
      const respStatus = (resp?.status as string | undefined) ?? "";
      const outputTokens = Number((resp?.usage as any)?.output_tokens ?? 0);
      const outputTextTokens = Number((resp?.usage as any)?.output_token_details?.text_tokens ?? 0);
      const outputAudioTokens = Number((resp?.usage as any)?.output_token_details?.audio_tokens ?? 0);
      const zeroOutput = outputTokens === 0 && outputTextTokens === 0 && outputAudioTokens === 0;

      // Tool-result fallback: if the post-tool response hard-fails (or returns zero output),
      // inject a recovery instruction and force one retry so callers never hit dead air.
      if (
        completedSource.startsWith("tool_result") &&
        (respStatus === "failed" || (respStatus === "cancelled" && zeroOutput)) &&
        !toolResultRecoveryAttempted.has(completedTurnId) &&
        openAiWs.readyState === WebSocket.OPEN &&
        !isProcessingTool &&
        currentTurnId === completedTurnId
      ) {
        toolResultRecoveryAttempted.add(completedTurnId);
        console.warn(
          `[AI Receptionist][${completedTurnId}] Tool-result response ${respStatus} (zero_output=${zeroOutput}) — injecting forced recovery`
        );
        openAiWs.send(JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{
              type: "input_text",
              text: "SYSTEM: Your last reply failed to play. Briefly apologize, then continue immediately with the tool result in one short sentence. Do not call any additional tools unless absolutely required.",
            }],
          },
        }));
        speechLockedUntil = 0;
        generateSpeech(completedTurnId, "tool_result_recovery");
      }

      if (respStatus === "completed") {
        responseTurnsThisCall++;
        if (responseTurnsThisCall >= MAX_TURNS_PER_CALL) {
          console.warn(
            `[CostControl] §1 turn cap reached (${responseTurnsThisCall}/${MAX_TURNS_PER_CALL}) — ending call gracefully`
          );
          terminateGracefullyFn?.(
            "cost_limit_exceeded",
            "I'm sorry, I've reached the limit of what I can do in one call. Please try calling back and I'll be happy to help you from the start."
          );
        }
      }
      return;
    }

    if (type === "response.output_item.added") {
      const item = msg.item as Record<string, unknown> | undefined;
      console.log(`[AI Receptionist] response.output_item.added — type=${item?.type} role=${item?.role}`);
      return;
    }

    if (type === "response.content_part.added") {
      const part = msg.part as Record<string, unknown> | undefined;
      console.log(`[AI Receptionist] response.content_part.added — type=${part?.type}`);
      return;
    }

    if (type === "rate_limits.updated") {
      // Noisy — skip
      return;
    }

    if (type === "response.function_call_arguments.delta") {
      // Streaming args — skip verbose logging
      return;
    }

    if (type === "response.function_call_arguments.done") {
      const name = msg.name as string;
      const callId = msg.call_id as string;
      const args = msg.arguments as string;
      const toolStartTime = Date.now();
      const isVerbose = salon ? safetyGate.isFirstCallMode(salon.storeId) : false;

      if (salon) {
        callEventBus.emit({
          type: "tool_start",
          storeId: salon.storeId,
          timestamp: new Date().toISOString(),
          data: { tool: name, args: isVerbose ? args : "(hidden)", callId },
        });
        if (isVerbose) {
          console.log(`[AI Receptionist][FIRST-CALL TRACE] Tool START — ${name} args=${args}`);
        }
      }
      try { callFileLogger.toolStart(name, JSON.parse(args || "{}")); } catch { callFileLogger.toolStart(name, args); }

      // Run the tool with a hard 5-second timeout and feed the result back to OpenAI.
      //
      // L6 TURN OWNERSHIP — filler injection while the tool runs:
      //   The watchdog's L1/L4 layers are suppressed during tool execution (toolInProgress=true),
      //   so ONLY this L6 timer may inject a filler for the current turn.
      //
      //   Correct order (prevents double-response):
      //   1. Cancel the current response.create that is waiting for tool output.
      //   2. Inject the filler conversation item + new response.create (filler speaks).
      //   3. When the tool completes, Fix-7 cancels the filler and delivers the real result.
      //
      //   If we skipped the cancel in step 1 and sent response.create while the original
      //   was still "in flight" (pending function_call_output), OpenAI would have two
      //   concurrent responses speaking simultaneously.
      // Mark tool as in-progress — generateSpeech() blocks all new responses while this is true.
      // This prevents VAD, watchdog, and fallback from generating speech during tool execution.
      // §1 Per-call tool cap — hard ceiling independent of time windows
      toolCallsThisCall++;
      if (toolCallsThisCall > MAX_TOOL_CALLS_PER_CALL) {
        console.warn(
          `[CostControl] §1 tool cap reached (${toolCallsThisCall}/${MAX_TOOL_CALLS_PER_CALL}) — ` +
          `skipping "${name}" and ending call gracefully`
        );
        // Deliver synthetic output so OpenAI doesn't hang waiting for function_call_output
        if (openAiWs.readyState === WebSocket.OPEN) {
          openAiWs.send(JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: callId,
              output: JSON.stringify({ success: false, message: "Service temporarily unavailable — please try again." }),
            },
          }));
        }
        terminateGracefullyFn?.("cost_limit_exceeded", "I'm sorry, I'm having some trouble completing that right now. Please try calling back in a few minutes and I'll be happy to help.");
        return;
      }

      isProcessingTool = true;
      _resetRateWindowIfNeeded();
      toolCallsThisMinute++;
      if (toolCallsThisMinute > MAX_TOOL_CALLS_PER_MIN) {
        console.warn(
          `[SpeechLock] tool_calls_per_min_exceeded — ` +
          `tool_calls_this_minute=${toolCallsThisMinute} max=${MAX_TOOL_CALLS_PER_MIN} ` +
          `tool="${name}"`
        );
      }
      watchdog.onToolStart();
      callHealthTracker.recordToolStart(sessionCallSid ?? null, name);
      let fillerInjected = false;
      const capturedTurnId = currentTurnId; // capture at tool-start time for logging
      const fillerTimer = setTimeout(() => {
        if (openAiWs.readyState !== WebSocket.OPEN) return;

        fillerInjected = true;
        const fillerPhrases = [
          "One moment while I check that for you.",
          "Let me just pull that up.",
          "Checking availability now.",
        ];
        const phrase = fillerPhrases[Math.floor(Math.random() * fillerPhrases.length)];

        console.log(
          `[AI Receptionist][${capturedTurnId}] L6 — Tool "${name}" taking >1.5s — ` +
          `cancelling pending response, injecting filler "${phrase}" ` +
          `response_emitted=true response_source=L6_tool_filler`
        );

        // Step 1: Cancel the response that is waiting for our function_call_output.
        // Release the lock so the filler can claim ownership immediately after.
        cancelActiveResponse("L6_cancel_before_filler");
        releaseTurnLock("L6_cancel_before_filler");

        // Step 2: Brief delay so OpenAI processes the cancel before we create the filler.
        setTimeout(() => {
          if (openAiWs.readyState !== WebSocket.OPEN) return;
          openAiWs.send(JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: `SYSTEM: Say this filler phrase immediately without any pause: "${phrase}"` }],
            },
          }));
          generateSpeech(capturedTurnId, "L6_tool_filler");
          callHealthTracker.recordFillerInjection(sessionCallSid ?? null, "L6_TOOL_WAIT");
          if (salon) {
            callEventBus.emit({
              type: "filler_injected",
              storeId: salon.storeId,
              timestamp: new Date().toISOString(),
              data: { layer: "L6_TOOL_WAIT", tool: name, phrase, turnId: capturedTurnId },
            });
          }
        }, 120);
      }, 600);

      (async () => {
        let result: { success: boolean; message: string };
        let shouldEndCall = false;
        let toolSuccess = false;

        try {
          const toolPromise = async (): Promise<{ success: boolean; message: string }> => {
            if (!salon) return { success: false, message: "Session not initialized." };

            if (name === "create_booking") {
              const r = await handleNewBooking(salon.storeId, args, salon);
              if (r.success) {
                callOutcome = "booked"; callNotes = r.message; shouldEndCall = true;
                // Fix 5: Keep allowlist in sync — without this a same-call cancel fails because
                // the new appointment ID was never in the session-start allowlist.
                const idMatch = r.message.match(/Appointment\s+(\d+)\s+confirmed/i);
                if (idMatch) {
                  const newId = parseInt(idMatch[1], 10);
                  if (!isNaN(newId) && newId > 0) allowlist.add(newId);
                }
              }
              return r;
            } else if (name === "cancel_booking") {
              const r = await handleCancel(salon.storeId, args, allowlist, callerPhone ?? undefined, salon.timezone);
              if (r.success) { callOutcome = "cancelled"; callNotes = r.message; shouldEndCall = true; }
              return r;
            } else if (name === "reschedule_booking") {
              const r = await handleReschedule(salon.storeId, args, allowlist, salon.timezone);
              if (r.success) { callOutcome = "rescheduled"; callNotes = r.message; shouldEndCall = true; }
              return r;
            } else if (name === "search_available_slots") {
              // Check speculative pre-fetch first — may already be resolved (0ms wait)
              let r: { success: boolean; message: string };
              const prefetchArgs = (() => { try { return JSON.parse(args); } catch { return null; } })();
              const prefetchKey  = prefetchArgs?.serviceId && prefetchArgs?.date
                ? `${prefetchArgs.serviceId}:${prefetchArgs.date}` : null;
              const prefetched   = prefetchKey ? specPrefetchMap.get(prefetchKey) : null;
              if (prefetched) {
                console.log(`[SpecPrefetch] HIT service=${prefetchArgs.serviceId} date=${prefetchArgs.date} — skipping DB round-trip`);
                r = await prefetched;
                specPrefetchMap.delete(prefetchKey!);
              } else {
                r = await handleGetAvailableSlots(args, salon);
              }
              if (r.success) { callOutcome = "availability_checked"; callNotes = r.message; }
              return r;
            } else if (name === "get_customer_appointments") {
              const r = await handleGetCustomerAppointments(args, salon, callerPhone ?? undefined);
              if (r.success) {
                callOutcome = "availability_checked"; callNotes = r.message;
                // C1: Sync allowlist — fallback-looked-up appointments must be modifiable this call
                r.appointmentIds?.forEach((id) => allowlist.add(id));
              }
              return r;
            } else if (name === "lookup_client_by_phone") {
              const r = await handleLookupClientByPhone(args, salon);
              if (r.success) { callOutcome = "availability_checked"; callNotes = r.message; }
              return r;
            } else if (name === "lookup_appointment_by_name_or_date") {
              // Rule 2: Fallback identification when caller ID lookup returns nothing
              const r = await handleLookupAppointmentByNameOrDate(args, salon);
              if (r.success) {
                callOutcome = "availability_checked"; callNotes = r.message;
                // C1: Sync allowlist — fallback-looked-up appointments must be modifiable this call
                r.appointmentIds?.forEach((id) => allowlist.add(id));
              }
              return r;
            } else if (name === "get_walkin_availability") {
              // Rule 5: Walk-in optimization — analyze today's schedule for best windows
              const r = await handleGetWalkinAvailability(salon);
              if (r.success) { callOutcome = "walkin_guidance"; callNotes = r.message; }
              return r;
            } else if (name === "request_callback") {
              // Rule 8: Global fallback — save caller phone for manager follow-up
              const r = await handleRequestCallback(args, salon, callerPhone ?? null, callLogId);
              if (r.success) { callOutcome = "callback_required"; callNotes = r.message; }
              return r;
            } else if (name === "database_lookup") {
              // Rule 9: DB fallback — last-resort direct database access
              const r = await handleDatabaseFallback(parsedToolArgs, salon, callerPhone ?? null);
              if (r.success) { callNotes = r.message; }
              return r;
            }
            return { success: false, message: `Unknown tool: ${name}` };
          };

          const timeoutPromise = new Promise<{ success: boolean; message: string }>((_, reject) =>
            setTimeout(() => reject(new Error(`Tool "${name}" timed out after 5s`)), 5_000)
          );

          // §3 Tool result cache — serve identical read-only queries from in-call memory
          let parsedToolArgs: Record<string, unknown> = {};
          try { parsedToolArgs = JSON.parse(args || "{}"); } catch { /* use empty */ }
          const cacheKey    = CACHEABLE_TOOLS.has(name) ? toolCacheKey(name, parsedToolArgs) : null;
          const cachedEntry = cacheKey ? callToolCache.get(cacheKey) : null;
          const cacheAgeMs  = cachedEntry ? Date.now() - cachedEntry.ts : Infinity;
          if (cachedEntry && cacheAgeMs < TOOL_CACHE_TTL_MS) {
            console.log(
              `[ToolCache] ${cacheAgeMs < TOOL_DEBOUNCE_MS ? "debounce" : "cache"} hit — ` +
              `tool="${name}" age=${cacheAgeMs}ms`
            );
            result = cachedEntry.result;
          } else {
            result = await Promise.race([toolPromise(), timeoutPromise]);
            // Warm cache for future identical read-only queries this call
            if (cacheKey && result.success) {
              callToolCache.set(cacheKey, { result, ts: Date.now() });
              console.log(`[ToolCache] stored — tool="${name}"`);
            }
          }
          // CONTRACT ENFORCEMENT — every tool handler must return plain structured data.
          // This throws (caught below) if a handler violates the ToolResult contract,
          // preventing any non-serialisable value from reaching OpenAI's function_call_output.
          assertToolResult(result, name);
          toolSuccess = result.success;
          callFileLogger.toolEnd(name, result, Date.now() - toolStartTime, toolSuccess);
        } catch (err: any) {
          console.error(`[AI Receptionist] ⚠️  Tool "${name}" failed:`, err.message);
          result = {
            success: false,
            message: err.message?.includes("timed out")
              ? "That took a moment — let me try a slightly different approach."
              : "Sorry about that — I ran into a small issue. Let me try a different approach.",
          };
          if (salon) safetyGate.recordToolCall(salon.storeId, Date.now() - toolStartTime, false);
          watchdog.onFailure();
        } finally {
          clearTimeout(fillerTimer);
        }

        const latencyMs = Date.now() - toolStartTime;

        if (salon) {
          safetyGate.recordToolCall(salon.storeId, latencyMs, toolSuccess);

          const eventBase = {
            storeId: salon.storeId,
            timestamp: new Date().toISOString(),
            latencyMs,
            data: { tool: name, success: toolSuccess, latencyMs, message: result.message },
          };
          callEventBus.emit({ type: "tool_end", ...eventBase });

          if (latencyMs > 2500) {
            callEventBus.emit({
              type: "latency_warning",
              storeId: salon.storeId,
              timestamp: new Date().toISOString(),
              latencyMs,
              data: { tool: name, latencyMs, threshold: 2500, message: "Tool latency exceeded 2.5s threshold" },
            });
            console.warn(`[AI Receptionist] ⚠️  Latency warning: tool="${name}" took ${latencyMs}ms (threshold 2500ms) — store ${salon.storeId}`);
          }

          if (isVerbose) {
            console.log(`[AI Receptionist][FIRST-CALL TRACE] Tool END — ${name} latency=${latencyMs}ms success=${toolSuccess}`);
          }
        }

        if (openAiWs.readyState !== WebSocket.OPEN) {
          console.warn(`[AI Receptionist] ⚠️  OpenAI WS closed before tool result could be sent — tool="${name}"`);
          return;
        }

        watchdog.onToolEnd(toolSuccess);
        // §9 Fail-safe mode — when 2+ consecutive failures hit, inject an ultra-short response hint
        if (!toolSuccess && watchdog.isFailSafeMode() && openAiWs.readyState === WebSocket.OPEN) {
          console.warn(`[CostControl] §9 fail-safe mode active (${name} failed) — injecting brevity hint`);
          openAiWs.send(JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: "SYSTEM: Keep your next response to one short sentence only. Apologize briefly for the trouble and ask if there is something else you can help with. Do NOT promise anyone will call them back." }],
            },
          }));
        }
        callHealthTracker.recordToolEnd(sessionCallSid ?? null, name, toolSuccess);

        // Fix 7 (Turn Ownership): If a filler was injected at the 1.5s mark (L6), that
        // filler response is now the active speaking response. Cancel it before delivering
        // the real tool result so only ONE response is speaking at a time.
        //
        // Note: If L6 fired, it already cancelled the *original* pending response before
        // injecting the filler — so this cancel is specifically targeting the filler response.
        if (fillerInjected) {
          console.log(
            `[AI Receptionist][${capturedTurnId}] Fix-7 — cancelling filler response before tool result ` +
            `response_suppressed source=L6_tool_filler`
          );
          cancelActiveResponse("cancel_filler_before_tool_result");
          // 300ms gives OpenAI time to emit response.done(cancelled) which calls
          // releaseTurnLock — ensuring the lock is FREE before tool_result claims it.
          await new Promise<void>((r) => setTimeout(r, 300));
        }

        // Mandatory tool-result handoff:
        // If server_vad still owns this same turn, cancel/release before emitting
        // tool_result so the continuation is not blocked and retried late.
        if (
          activeResponseInProgress &&
          activeTurnId === capturedTurnId &&
          activeTurnSource === "server_vad"
        ) {
          console.log(
            `[AI Receptionist][${capturedTurnId}] Tool handoff — cancelling active server_vad response before tool_result`
          );
          cancelActiveResponse("tool_result_handoff_from_server_vad");
          // Release quickly so tool_result can claim ownership for the same turn.
          releaseTurnLock("tool_result_handoff_from_server_vad");
          await new Promise<void>((r) => setTimeout(r, 120));
        }

        // Tool is done — clear the processing flag so generateSpeech() gates open.
        isProcessingTool = false;

        // Deliver the tool result — the ONE mandatory response continuation after
        // function_call_output. No force flag: the lock must be free at this point
        // because response.done (for the server_vad or filler response) always fires
        // before we reach here and calls releaseTurnLock.
        //
        // A tool failure (401, timeout, error message) is HANDLED INSIDE THIS SINGLE
        // RESPONSE — the error is embedded in `result.message` and the AI incorporates
        // it into its reply. It does NOT spawn an additional response.create.
        console.log(
          `[AI Receptionist][${capturedTurnId}] Tool "${name}" complete — delivering result ` +
          `success=${toolSuccess} response_source=tool_result user_turn_id=${capturedTurnId}`
        );
        openAiWs.send(JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: callId,
            output: JSON.stringify(result),
          },
        }));
        // Tool-result continuation is mandatory. If the previous response just finished,
        // a stale audio cooldown window can still be active and incorrectly block the
        // immediate tool_result response (causing a long silence until watchdog recovery).
        // Safe to clear here because we only do this after tool completion and after
        // function_call_output is created for the same captured turn.
        speechLockedUntil = 0;
        const toolResultSpoken = generateSpeech(capturedTurnId, "tool_result");

        // If speech was blocked for transient gating (for example VAD edge timing),
        // do one short retry on the same turn so tool results don't get stranded.
        if (!toolResultSpoken) {
          setTimeout(() => {
            if (openAiWs.readyState !== WebSocket.OPEN) return;
            if (isProcessingTool) return;
            if (currentTurnId !== capturedTurnId) return;
            speechLockedUntil = 0;
            generateSpeech(capturedTurnId, "tool_result_retry");
          }, 700);
        }

        if (shouldEndCall) {
          // 20s gives the AI time to ask "Was there anything else?" and hear the caller's reply
          setTimeout(() => {
            console.log(`[AI Receptionist] Closing call after tool "${name}" — store ${salon?.storeId ?? "?"}`);
            if (salon) safetyGate.recordCallSuccess(salon.storeId);
            twilioWs.close();
          }, 20_000);
        }
      })().catch((err) => {
        // ── TOOL FATAL ERROR — NO NEW RESPONSE CREATED ──────────────────────
        // A fatal error here means the async delivery IIFE threw (not the tool
        // itself — inner tool errors are caught and flow through tool_result above).
        // Creating a response.create here would produce a SECOND assistant turn
        // on top of any response already in progress.
        //
        // Rule: tool failure NEVER spawns an additional response chain.
        // Clear the tool lock so the watchdog can re-engage if silence results.
        isProcessingTool = false;
        console.error(
          `[AI Receptionist][${capturedTurnId}] Tool delivery fatal error — ` +
          `isProcessingTool cleared, NO response.create emitted to prevent duplicate turn. ` +
          `tool="${name}" error="${err.message}"`
        );
        watchdog.onToolEnd(false);
        callHealthTracker.recordToolEnd(sessionCallSid ?? null, name, false);
      });

      return;
    }

    if (type === "error") {
      const err = msg.error as Record<string, unknown> | undefined;
      console.error(
        `[AI Receptionist] ❌ OpenAI ERROR — code=${err?.code ?? "?"} type=${err?.type ?? "?"} message=${err?.message ?? JSON.stringify(msg)}`
      );
      return;
    }

    // Log any unhandled event types so we know what we're missing
    console.log(`[AI Receptionist] OpenAI event: ${type}`);
  });

  openAiWs.on("error", (err) => {
    console.error(`[AI Receptionist] ❌ OpenAI WebSocket ERROR: ${err.message}`);
    if (salon) safetyGate.recordWsError(salon.storeId, err.message);
  });

  openAiWs.on("close", (code, reason) => {
    const reasonStr = reason.toString() || "(none)";
    console.log(`[AI Receptionist] OpenAI WebSocket CLOSED — code=${code} reason=${reasonStr} sessionUpdated=${sessionUpdated} outboundAudioPackets=${outboundAudioCount}`);
    callHealthTracker.recordWsStatus(sessionCallSid ?? null, false);

    // If shutdown was initiated by our own teardown path, this close is expected.
    if (sessionClosed) {
      return;
    }

    // L7: Session recovery — if the Twilio call is still live and we haven't yet
    // attempted a reconnect, try once to reconnect the OpenAI WS.
    if (
      twilioWs.readyState === WebSocket.OPEN &&
      !openAiReconnectAttempted &&
      code !== 1000 &&   // 1000 = normal closure (call ended intentionally)
      code !== 1001      // 1001 = going away (server shutdown)
    ) {
      openAiReconnectAttempted = true;
      console.warn(`[AI Receptionist] L7 — Unexpected OpenAI WS close (code=${code}) — attempting session recovery`);
      // Inject an in-call filler via Twilio so the caller hears something while we reconnect
      // (We can't use openAiWs here — it's closed. Just log; the watchdog will inject a filler via a new WS.)
      watchdog.onFailure();
      // Reconnect is complex and requires full session re-setup; for now, close the Twilio call gracefully.
      // The watchdog will note this failure and switch to fail-safe mode.
      if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
    } else {
      if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
    }
  });

  twilioWs.on("message", (rawData: Buffer | string) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(rawData.toString()); } catch { return; }

    const event = msg.event as string;

    if (event === "connected") {
      console.log(`[AI Receptionist] Twilio stream connected (awaiting start event)`);
      return;
    }

    if (event === "start") {
      // Idempotency guard: Twilio can occasionally redeliver/duplicate the
      // "start" frame on the same stream. Since the async block below awaits
      // several network calls before setting startReceived, checking that flag
      // alone would race — set a synchronous latch first so at most one
      // call-log row (and one "call_answered" Owner Feed event) is ever created
      // per WebSocket connection.
      if (startFrameHandled) {
        console.warn(`[AI Receptionist] Duplicate "start" frame ignored — streamSid=${msg.streamSid}`);
        return;
      }
      startFrameHandled = true;

      const startData = msg.start as Record<string, unknown> | undefined;
      streamSid = (msg.streamSid as string) ?? null;
      const callSid = (startData?.callSid as string) ?? null;
      const customParams = (startData?.customParameters as Record<string, string> | undefined) ?? {};
      // Normalise to 10-digit so it matches the DB format (strips +1 / country code)
      callerPhone = toTenDigit((customParams.from ?? "").trim()) ?? null;

      // storeId arrives via <Parameter name="storeId"> in the TwiML (Twilio
      // forbids query strings on Stream URLs — error 31920).
      const storeIdRaw = (customParams.storeId ?? "").trim();
      const parsedStoreId = parseInt(storeIdRaw, 10);
      if (isNaN(parsedStoreId) || parsedStoreId <= 0) {
        console.error(
          `[AI Receptionist] start event missing/invalid storeId customParameter (got "${storeIdRaw}") — closing call`
        );
        twilioWs.close(1008, "Missing storeId parameter");
        return;
      }

      // Load salon context now (we couldn't do it at upgrade time — no URL params).
      // S2-fix: Race against a 4s timeout so a stalled DB connection (which never throws)
      // can't leave the call permanently silent — we just close it cleanly instead.
      (async () => {
        const loaded = await Promise.race([
          getSalonContext(parsedStoreId).catch(() => null),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 4_000)),
        ]);
        if (!loaded) {
          console.warn(`[AI Receptionist] Unknown storeId ${parsedStoreId} on start — closing call`);
          twilioWs.close(1008, "Unknown store");
          return;
        }

        // ── Safety Gate check ─────────────────────────────────────────
        // IMPORTANT: Keep live calls flowing by default (matches known-working behavior
        // from the backup). We only enforce hard blocking when explicitly enabled.
        if (safetyGate.isBlocked(parsedStoreId)) {
          const reason = safetyGate.blockReason(parsedStoreId);
          const strictGate = process.env.AI_RECEPTIONIST_STRICT_SAFETY_GATE === "1";
          if (strictGate) {
            console.warn(`[AI Receptionist] 🚫 Call blocked by safety gate for store ${parsedStoreId}: ${reason}`);
            twilioWs.close(1008, "Service temporarily unavailable");
            return;
          }
          console.warn(
            `[AI Receptionist] ⚠️ Safety gate would block store ${parsedStoreId} (${reason}) ` +
            `but strict mode is OFF — allowing call`
          );
        }
        safetyGate.recordCallStart(parsedStoreId);

        // Optional Twilio native call recording. Disabled by default.
        // Enable with: AI_RECEPTIONIST_TWILIO_RECORDING_ENABLED=1
        const recordingEnabled = String(process.env.AI_RECEPTIONIST_TWILIO_RECORDING_ENABLED ?? "1") !== "0";
        if (recordingEnabled && callSid) {
          const accountSid = process.env.TWILIO_ACCOUNT_SID;
          const authToken = process.env.TWILIO_AUTH_TOKEN;
          if (accountSid && authToken) {
            const appUrl = (process.env.APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN}`).replace(/\/$/, "");
            const recordingStatusCallback = `${appUrl}/api/webhook/twilio/recording/${parsedStoreId}`;
            try {
              const twilioClient = twilio(accountSid, authToken);
              await twilioClient.calls(callSid).recordings.create({
                recordingChannels: "dual",
                recordingTrack: "both",
                recordingStatusCallback,
                recordingStatusCallbackMethod: "POST",
              });
              console.log(
                `[AI Receptionist] Twilio recording started — callSid=${callSid} store=${parsedStoreId} callback=${recordingStatusCallback}`,
              );
            } catch (err) {
              console.error(`[AI Receptionist] Failed to start Twilio recording for callSid=${callSid}:`, err);
            }
          } else {
            console.warn(
              `[AI Receptionist] Recording enabled but TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN missing — skipping recording`,
            );
          }
        }

        // ── Session guard + cost metering ──────────────────────────────────
        sessionCallSid = callSid ?? `call-${Date.now()}`;

        // Graceful termination callback — injects AI farewell, then hangs up.
        // This is an end-of-call forced override: we release the lock + clear all
        // guards so generateSpeech() can proceed regardless of call state.
        const terminateGracefully = (reason: string, aiMessage: string): void => {
          if (gracefulTerminationStarted) {
            console.warn(
              `[AI Receptionist] Graceful termination already in progress — ignoring duplicate trigger (reason=${reason})`
            );
            return;
          }
          gracefulTerminationStarted = true;
          console.log(`[AI Receptionist] 🛑 Graceful termination — reason=${reason} store=${parsedStoreId}`);
          callOutcome = reason;
          // Reset all speech guards so the farewell always gets through.
          releaseTurnLock(`terminate_gracefully:${reason}`);
          isProcessingTool = false;
          speechLockedUntil = 0;
          try {
            if (openAiWs.readyState === WebSocket.OPEN) {
              openAiWs.send(JSON.stringify({
                type: "conversation.item.create",
                item: { type: "message", role: "user", content: [{ type: "input_text", text: `SYSTEM: ${aiMessage}` }] },
              }));
              generateSpeech(currentTurnId, `terminate_gracefully:${reason}`);
              // Give AI 10 seconds to respond before closing
              setTimeout(() => { try { twilioWs.close(); } catch { /* ignore */ } }, 10_000);
            } else {
              twilioWs.close();
            }
          } catch (termErr) {
            console.error("[AI Receptionist] terminateGracefully error:", termErr);
            try { twilioWs.close(); } catch { /* ignore */ }
          }
        };

        terminateGracefullyFn = terminateGracefully; // expose to §1/§9 per-call cap guards
        const guardResult = await sessionGuard.onCallStart(sessionCallSid, parsedStoreId, terminateGracefully);
        if (!guardResult.allowed) {
          console.warn(`[AI Receptionist] 🚫 Session guard blocked call: ${guardResult.reason}`);
          twilioWs.close(1008, "Call capacity reached");
          return;
        }
        costMeter.startSession(sessionCallSid, parsedStoreId);

        // ── 12-minute hard session limit ───────────────────────────────────
        // If the call is still active after 12 minutes, force a graceful farewell
        // and hang up. This prevents runaway cost on stuck or looping sessions.
        const MAX_SESSION_MS = 12 * 60 * 1000;
        sessionMaxDurationHandle = setTimeout(() => {
          sessionMaxDurationHandle = null;
          console.warn(
            `[SpeechLock] ⚠️  Session max duration reached (${MAX_SESSION_MS / 60_000}min) — ` +
            `callSid=${sessionCallSid} store=${parsedStoreId} — triggering graceful termination`
          );
          terminateGracefully(
            "max_session_duration",
            "We've reached the maximum call time. I'll need to wrap up now — please call back if you need anything else. Have a great day!"
          );
        }, MAX_SESSION_MS);

        salon = loaded;

        // ── Start silence watchdog ─────────────────────────────────────
        watchdog.start({
          callSid:   callSid ?? null,
          storeId:   parsedStoreId,
          callLogId: null,
          send:      (msg) => {
            if (openAiWs.readyState !== WebSocket.OPEN) return;
            // Intercept response.create from the watchdog and route it through
            // the turn ownership lock. conversation.item.create and other
            // messages pass through directly.
            const m = msg as Record<string, unknown>;
            if (m.type === "response.create") {
              generateSpeech(currentTurnId, "watchdog");
              return;
            }
            openAiWs.send(JSON.stringify(msg));
          },
        });
        callHealthTracker.startCall({ callSid: callSid ?? null, storeId: parsedStoreId, callLogId: null });

        callEventBus.emit({
          type: "call_start",
          storeId: parsedStoreId,
          timestamp: new Date().toISOString(),
          data: {
            callSid: callSid ?? null,
            callerPhone: callerPhone ?? null,
            storeName: loaded.businessName,
            firstCallMode: safetyGate.isFirstCallMode(parsedStoreId),
          },
        });
        broadcastNotification({ type: "ai_call_updated", storeId: parsedStoreId });

        console.log(
          `[AI Receptionist] Stream started — streamSid=${streamSid} callSid=${callSid} ` +
          `from="${callerPhone ?? "(unknown)"}" store=${parsedStoreId} ("${loaded.businessName}") ` +
          `firstCallMode=${safetyGate.isFirstCallMode(parsedStoreId)}`
        );

        // ── Insert call log row ──────────────────────────────────────
        // Keep a promise handle so close/finalize can await insert completion and avoid
        // races where finalization runs before callLogId exists.
        callStoreId = parsedStoreId;
        callFileLogger = new CallFileLogger(callSid ?? `ncsid-${Date.now()}`, parsedStoreId, callerPhone ?? null);
        callFileLogger.event("CALL STARTED", { callerPhone: callerPhone ?? "(unknown)", salon: loaded.businessName });
        callLogInsertPromise = (async () => {
          try {
            const [row] = await db
              .insert(aiCallLog)
              .values({
                storeId: parsedStoreId,
                callSid: callSid ?? undefined,
                callerPhone: callerPhone ?? undefined,
                outcome: "in_progress",
                startedAt: callStartTime,
              })
              .returning({ id: aiCallLog.id });

            if (row?.id) {
              callLogId = row.id;
              watchdog.updateCallLogId(row.id);
              callHealthTracker.updateCallLogId(callSid ?? null, row.id);
            }

            void logActivityEvent({
              storeId: parsedStoreId,
              eventType: "call_answered",
              message: `AI Receptionist answered a call${callerPhone ? ` from ${callerPhone}` : ""}`,
            });
          } catch (err) {
            console.error("[AI Receptionist] Failed to insert call log:", err);
          }
        })();

        await callLogInsertPromise;

        startReceived = true;
        configureSessionIfReady().catch((err) =>
          console.error("[AI Receptionist] Session config error:", err)
        );
      })().catch((err) => console.error("[AI Receptionist] Start handler error:", err));
      return;
    }

    if (event === "media") {
      const media = msg.media as Record<string, unknown>;
      const track = media?.track as string;
      const payload = media?.payload as string | undefined;
      if (track !== "inbound" || !payload) return;

      // Drop early audio that arrives before the session is fully configured.
      // Without this, caller speech could reach OpenAI before our instructions/
      // tools/allowlist are loaded, causing inconsistent first-turn behavior.
      // We wait for session.updated from OpenAI which confirms our session config
      // was accepted — only then is it safe to forward audio.
      if (!sessionUpdated) {
        // Log occasionally so we can see audio is arriving but session isn't ready
        inboundAudioCount++;
        if (inboundAudioCount === 1 || inboundAudioCount % 100 === 0) {
          console.log(`[AI Receptionist] ⏳ Dropping inbound audio #${inboundAudioCount} — waiting for session.updated (sessionConfigured=${sessionConfigured})`);
        }
        return;
      }

      inboundAudioCount++;
      if (inboundAudioCount === 1 || inboundAudioCount % 100 === 0) {
        console.log(`[AI Receptionist] 🎤 Inbound audio packet #${inboundAudioCount} → OpenAI (ws=${openAiWs.readyState === WebSocket.OPEN ? "OPEN" : "CLOSED"})`);
      }
      // Track audio activity for idle detection + cost meter
      if (sessionCallSid) {
        sessionGuard.updateActivity(sessionCallSid);
      }

      // Interruption — only cancel if OpenAI VAD has actually detected caller speech.
      // Twilio sends a continuous inbound stream (including silence/background noise),
      // so cancelling on any inbound media packet causes false interruptions.
      if (aiSpeaking && callerSpeaking) {
        aiSpeaking = false;
        console.log(`[AI Receptionist] 🛑 Interruption detected — cancelling AI response`);
        cancelActiveResponse("caller_barge_in");
        if (streamSid && twilioWs.readyState === WebSocket.OPEN) {
          twilioWs.send(JSON.stringify({ event: "clear", streamSid }));
        }
      }

      if (openAiWs.readyState === WebSocket.OPEN) {
        const forwardFrame = (framePayload: string) => {
          const openAiAudio = twilioUlawBase64ToPcm16_24kBase64(framePayload);
          openAiWs.send(JSON.stringify({ type: "input_audio_buffer.append", audio: openAiAudio }));
          localVadSentFrames++;
        };

        // Conservative local VAD gate: only trims true silence, keeps pre-roll and a
        // short trailing debounce so words are not clipped.
        if (LOCAL_VAD_ENABLED) {
          // Fail-open guard: if local VAD appears too strict for this call,
          // bypass it so inbound caller audio is always delivered to OpenAI.
          if (localVadFailOpen) {
            forwardFrame(payload);
            return;
          }

          const speechDetected = hasVoiceInTwilioUlaw(payload);

          if (!localVadActive) {
            if (speechDetected) {
              localVadActive = true;
              localVadSilenceMs = 0;
              console.log(`[AI Receptionist][VAD] ON — speech detected, flushing ${localVadPreroll.length} preroll frame(s)`);
              for (const buffered of localVadPreroll) forwardFrame(buffered);
              localVadPreroll.length = 0;
              forwardFrame(payload);
            } else {
              localVadPreroll.push(payload);
              while (localVadPreroll.length > LOCAL_VAD_PREROLL_FRAMES) localVadPreroll.shift();
              localVadDroppedFrames++;
            }
          } else {
            if (speechDetected) {
              localVadSilenceMs = 0;
              forwardFrame(payload);
            } else {
              localVadSilenceMs += TWILIO_FRAME_MS;
              // Debounce tail to avoid cutting trailing phonemes.
              if (localVadSilenceMs <= LOCAL_VAD_DEBOUNCE_MS) {
                forwardFrame(payload);
              } else {
                localVadActive = false;
                localVadSilenceMs = 0;
                localVadPreroll.push(payload);
                while (localVadPreroll.length > LOCAL_VAD_PREROLL_FRAMES) localVadPreroll.shift();
                localVadDroppedFrames++;
                console.log(`[AI Receptionist][VAD] OFF — silence debounce exceeded (${LOCAL_VAD_DEBOUNCE_MS}ms)`);
              }
            }
          }

          // Auto fail-open if we keep dropping audio for too long before any
          // speech makes it through (protects low-volume callers/mic paths).
          if (!localVadFailOpen && localVadSentFrames === 0 && localVadDroppedFrames >= LOCAL_VAD_FAIL_OPEN_FRAMES) {
            localVadFailOpen = true;
            console.warn(
              `[AI Receptionist][VAD] FAIL-OPEN — dropped ${localVadDroppedFrames} frame(s) with 0 forwarded; ` +
              `disabling local VAD for this call`
            );
            for (const buffered of localVadPreroll) forwardFrame(buffered);
            localVadPreroll.length = 0;
            forwardFrame(payload);
          }

          const totalVadFrames = localVadSentFrames + localVadDroppedFrames;
          if (totalVadFrames > 0 && (totalVadFrames === 1 || totalVadFrames % 250 === 0)) {
            const droppedPct = Math.round((localVadDroppedFrames / totalVadFrames) * 100);
            console.log(
              `[AI Receptionist][VAD] sent=${localVadSentFrames} dropped=${localVadDroppedFrames} ` +
              `drop_ratio=${droppedPct}% active=${localVadActive}`
            );
          }
        } else {
          // Forward raw audio to OpenAI. server_vad handles commit + response.create automatically —
          // do NOT call input_audio_buffer.commit or response.create here or every turn fires twice.
          forwardFrame(payload);
        }
      } else {
        console.warn(`[AI Receptionist] ⚠️  Cannot forward audio — OpenAI WS not open (state=${openAiWs.readyState})`);
      }
      return;
    }

    if (event === "stop") {
      console.log(`[AI Receptionist] Twilio stream stopped — store ${salon?.storeId ?? "?"}`);
      closeSession();
      return;
    }
  });

  twilioWs.on("close", async () => {
    closeSession();

    // Emit call_end to live viewer and update safety gate
    if (salon) {
      callEventBus.emit({
        type: "call_end",
        storeId: salon.storeId,
        timestamp: new Date().toISOString(),
        data: {
          outcome: callOutcome,
          durationMs: Date.now() - callStartTime.getTime(),
          callerPhone: callerPhone ?? null,
        },
      });
      broadcastNotification({ type: "ai_call_updated", storeId: salon.storeId });
    }

    // End session guard and flush usage + cost record to DB
    if (sessionCallSid) {
      sessionGuard.endGuard(sessionCallSid);
      costMeter.endSession(sessionCallSid, callOutcome).catch((err) =>
        console.error("[AI Receptionist] costMeter flush error:", err)
      );
    }

    // Finalise the call log row.
    // If start-time insert failed or raced, create a fallback terminal row so every call is logged.
    // Guarded to run only once even if multiple close/error paths fire.
    {
      if (callLogFinalized) return;
      callLogFinalized = true;
      const endedAt = new Date();
      const durationSeconds = Math.round((endedAt.getTime() - callStartTime.getTime()) / 1000);
      callFileLogger.close(callOutcome, durationSeconds);

      // Wait briefly for any in-flight insert so we can update the same row instead of creating
      // a second record under race conditions.
      if (callLogInsertPromise) {
        await Promise.race([
          callLogInsertPromise,
          new Promise<void>((resolve) => setTimeout(resolve, 1200)),
        ]);
      }

      const terminalValues = {
        storeId: callStoreId ?? salon?.storeId,
        callSid: sessionCallSid ?? undefined,
        callerPhone: callerPhone ?? undefined,
        callerName: callCallerName ?? undefined,
        outcome: callOutcome,
        startedAt: callStartTime,
        endedAt,
        durationSeconds,
        notes: callNotes,
        appointmentId: callAppointmentId ?? undefined,
        transcript: callTranscriptTurns.length > 0 ? callTranscriptTurns : undefined,
      };

      if (callLogId) {
        db.update(aiCallLog)
          .set({
            outcome: callOutcome,
            endedAt,
            durationSeconds,
            notes: callNotes,
            appointmentId: callAppointmentId ?? undefined,
            callerName: callCallerName ?? undefined,
            transcript: callTranscriptTurns.length > 0 ? callTranscriptTurns : undefined,
          })
          .where(eq(aiCallLog.id, callLogId))
          .catch((err) => console.error("[AI Receptionist] Failed to finalise call log:", err));
      } else if (terminalValues.storeId) {
        db.insert(aiCallLog)
          .values(terminalValues as {
            storeId: number;
            callSid?: string;
            callerPhone?: string;
            callerName?: string;
            outcome: string;
            startedAt: Date;
            endedAt: Date;
            durationSeconds: number;
            notes?: string | null;
            appointmentId?: number;
            transcript?: Array<{ role: "caller" | "autumn"; text: string; ts: string }>;
          })
          .catch((err) =>
            console.error("[AI Receptionist] Failed to write fallback terminal call log:", err),
          );
      }
    }
  });
  twilioWs.on("error", (err) => {
    console.error("[AI Receptionist] Twilio error:", err.message);
    closeSession();
  });

  let sessionClosed = false;
  function closeSession() {
    if (sessionClosed) return;
    sessionClosed = true;

    awaitingCommitAfterSpeechStop = false;
    if (commitNudgeTimer) {
      clearTimeout(commitNudgeTimer);
      commitNudgeTimer = null;
    }

    // ── Reset ALL speech authority state on session close ──────────────────
    // Ensures no stale locks, tool fences, or audio cooldowns linger.
    // (Rule 9: reset activeResponseId, isSpeaking, isProcessingTool on disconnect)
    releaseTurnLock("session_closed");
    isProcessingTool  = false;
    speechLockedUntil = 0;
    // Clear the 12-minute hard-limit timer if it's still pending
    if (sessionMaxDurationHandle) {
      clearTimeout(sessionMaxDurationHandle);
      sessionMaxDurationHandle = null;
    }

    // Clear session-update timeout so it doesn't fire after call teardown
    if (sessionUpdateTimeoutHandle) {
      clearTimeout(sessionUpdateTimeoutHandle);
      sessionUpdateTimeoutHandle = null;
    }

    // Watchdog stop + flush on EVERY exit path (error, stop event, WS close).
    callHealthTracker.endCall(sessionCallSid ?? null, callOutcome);
    watchdog.stop();
    watchdog.flushToDB().catch((err) =>
      console.error("[AI Receptionist] silenceWatchdog flush error:", err)
    );

    if (openAiWs.readyState === WebSocket.OPEN || openAiWs.readyState === WebSocket.CONNECTING) {
      openAiWs.close();
    }
  }
}

// ─── Settings helpers ─────────────────────────────────────────────────────────

async function readPrefs(storeId: number): Promise<Record<string, unknown>> {
  try {
    const [row] = await db
      .select({ preferences: storeSettings.preferences })
      .from(storeSettings)
      .where(eq(storeSettings.storeId, storeId))
      .limit(1);
    if (!row?.preferences) return {};
    return JSON.parse(row.preferences) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function writePrefs(storeId: number, prefs: Record<string, unknown>): Promise<void> {
  const prefsJson = JSON.stringify(prefs);
  const [row] = await db
    .select({ id: storeSettings.id })
    .from(storeSettings)
    .where(eq(storeSettings.storeId, storeId))
    .limit(1);
  if (row) {
    await db.update(storeSettings).set({ preferences: prefsJson }).where(eq(storeSettings.storeId, storeId));
  } else {
    await db.insert(storeSettings).values({ storeId, preferences: prefsJson });
  }
}

export async function getReceptionistEnabled(storeId: number): Promise<boolean> {
  const prefs = await readPrefs(storeId);
  return prefs[PREF_KEY] === true;
}

export async function getReceptionistPhone(storeId: number): Promise<string | null> {
  const prefs = await readPrefs(storeId);
  const v = prefs[PREF_PHONE_KEY];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function setReceptionistEnabled(storeId: number, enabled: boolean): Promise<void> {
  const prefs = await readPrefs(storeId);
  prefs[PREF_KEY] = enabled;
  await writePrefs(storeId, prefs);
}

export async function setReceptionistPhone(storeId: number, phone: string | null): Promise<void> {
  const prefs = await readPrefs(storeId);
  if (phone === null) {
    delete prefs[PREF_PHONE_KEY];
  } else {
    prefs[PREF_PHONE_KEY] = phone;
  }
  await writePrefs(storeId, prefs);
}

// ─── Route registration ───────────────────────────────────────────────────────

export function setupAiReceptionistRoutes(httpServer: HttpServer, app: Express): void {
  const apiKeyPresent =
    !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY || !!process.env.OPENAI_API_KEY;
  const apiKeySource = process.env.AI_INTEGRATIONS_OPENAI_API_KEY
    ? "AI_INTEGRATIONS_OPENAI_API_KEY"
    : process.env.OPENAI_API_KEY
      ? "OPENAI_API_KEY (Replit integration)"
      : null;
  if (!apiKeyPresent) {
    console.warn(
      "[AI Receptionist] ⚠️  No OpenAI key set (checked AI_INTEGRATIONS_OPENAI_API_KEY " +
      "and OPENAI_API_KEY). Routes registered but live calls will fail until the key is available."
    );
  } else {
    console.log(`[AI Receptionist] OpenAI key detected ✓  (source: ${apiKeySource})`);
  }

  // ── Call log: GET /api/ai-receptionist/call-logs ─────────────────────────
  app.get("/api/ai-receptionist/call-logs", isAuthenticated, async (req: Request, res: Response) => {
    const storeId = await resolveTenantIdForRequest(req);
    if (!storeId) return res.status(400).json({ message: "Unable to resolve tenant for this session" });

    const pageSize = 50;
    const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
    const offset = (page - 1) * pageSize;

    // Only count/show calls longer than 30 seconds (short calls are free and hidden)
    const callFilter = and(
      eq(aiCallLog.storeId, storeId),
      or(isNull(aiCallLog.durationSeconds), gt(aiCallLog.durationSeconds, 30))
    );

    // Total count for pagination
    const [countRow] = await db
      .select({ total: count() })
      .from(aiCallLog)
      .where(callFilter);
    const total = Number(countRow?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    // Page of logs, joined to appointments → services to get service name
    const logs = await db
      .select({
        id:              aiCallLog.id,
        callSid:         aiCallLog.callSid,
        callerPhone:     aiCallLog.callerPhone,
        callerName:      aiCallLog.callerName,
        outcome:         aiCallLog.outcome,
        durationSeconds: aiCallLog.durationSeconds,
        startedAt:       aiCallLog.startedAt,
        endedAt:         aiCallLog.endedAt,
        notes:           aiCallLog.notes,
        appointmentId:   aiCallLog.appointmentId,
        serviceName:     services.name,
        transcript:      aiCallLog.transcript,
      })
      .from(aiCallLog)
      .leftJoin(appointments, eq(appointments.id, aiCallLog.appointmentId))
      .leftJoin(services, eq(services.id, appointments.serviceId))
      .where(callFilter)
      .orderBy(desc(aiCallLog.startedAt))
      .limit(pageSize)
      .offset(offset);

    return res.json({ logs, total, page, totalPages, pageSize });
  });

  // ── Session log: GET /api/ai-receptionist/session-log ────────────────────
  // Public (no auth) — returns last N call records with cost, outcome, and
  // termination reason. PII (phone, caller name) is intentionally omitted so
  // this is safe to curl from VPS monitoring scripts without a session cookie.
  // Query params: storeId (required), limit (default 25, max 100), outcome (optional filter)
  app.get("/api/ai-receptionist/session-log", async (req: Request, res: Response) => {
    const storeId = parseInt(req.query.storeId as string, 10);
    if (!storeId || isNaN(storeId)) {
      return res.status(400).json({ message: "storeId query param is required" });
    }
    const limit   = Math.min(parseInt((req.query.limit   as string) ?? "25",  10), 100);
    const outcome = (req.query.outcome as string | undefined)?.trim() || undefined;

    const { and } = await import("drizzle-orm");

    const conditions: ReturnType<typeof eq>[] = [eq(aiCallLog.storeId, storeId)];
    if (outcome) conditions.push(eq(aiCallLog.outcome, outcome));

    const rows = await db
      .select({
        id:                aiCallLog.id,
        outcome:           aiCallLog.outcome,
        durationSeconds:   aiCallLog.durationSeconds,
        startedAt:         aiCallLog.startedAt,
        endedAt:           aiCallLog.endedAt,
        notes:             aiCallLog.notes,
        callSid:           aiCallLog.callSid,
        appointmentId:     aiCallLog.appointmentId,
        // cost / usage joined from call_usage_records
        toolCallCount:     callUsageRecords.toolCallCount,
        aiResponseCount:   callUsageRecords.aiResponseCount,
        audioTokensIn:     callUsageRecords.audioTokensIn,
        audioTokensOut:    callUsageRecords.audioTokensOut,
        openaiEstCost:     callUsageRecords.openaiEstCost,
        twilioEstCost:     callUsageRecords.twilioEstCost,
        totalEstCost:      callUsageRecords.totalEstCost,
        terminationReason: callUsageRecords.terminationReason,
      })
      .from(aiCallLog)
      .leftJoin(callUsageRecords, eq(callUsageRecords.callLogId, aiCallLog.id))
      .where(and(...conditions))
      .orderBy(desc(aiCallLog.startedAt))
      .limit(limit);

    return res.json({
      storeId,
      total: rows.length,
      limit,
      outcomeFilter: outcome ?? null,
      calls: rows.map((r) => ({
        ...r,
        // truncate callSid so it's identifiable but not a full handle
        callSid: r.callSid ? `${r.callSid.slice(0, 10)}…` : null,
      })),
    });
  });

  // ── Silence Incidents Report: GET /api/ai-receptionist/silence-incidents ──
  // Returns paginated silence/stall events recorded during live calls.
  // Supports optional filters: ?layer=L1_AUDIO_SILENCE&limit=50&offset=0&callSid=CA...
  app.get("/api/ai-receptionist/silence-incidents", isAuthenticated, async (req: Request, res: Response) => {
    const storeId = await resolveTenantIdForRequest(req);
    if (!storeId) return res.status(400).json({ message: "Unable to resolve tenant for this session" });

    const limit  = Math.min(parseInt((req.query.limit  as string) ?? "100", 10), 500);
    const offset = Math.max(parseInt((req.query.offset as string) ?? "0",   10), 0);
    const layerFilter   = (req.query.layer   as string | undefined)?.trim()   || undefined;
    const callSidFilter = (req.query.callSid as string | undefined)?.trim()   || undefined;

    const { and } = await import("drizzle-orm");

    const conditions = [eq(aiSilenceIncidents.storeId, storeId)];
    if (layerFilter)   conditions.push(eq(aiSilenceIncidents.layer,   layerFilter));
    if (callSidFilter) conditions.push(eq(aiSilenceIncidents.callSid, callSidFilter));

    const [rows, totals] = await Promise.all([
      db
        .select()
        .from(aiSilenceIncidents)
        .where(and(...conditions))
        .orderBy(desc(aiSilenceIncidents.occurredAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: aiSilenceIncidents.id })
        .from(aiSilenceIncidents)
        .where(and(...conditions)),
    ]);

    // Aggregate by layer for a quick summary
    const summary: Record<string, { count: number; avgDurationMs: number }> = {};
    for (const row of rows) {
      if (!summary[row.layer]) summary[row.layer] = { count: 0, avgDurationMs: 0 };
      summary[row.layer].count++;
      summary[row.layer].avgDurationMs += row.silenceDurationMs;
    }
    for (const layer of Object.keys(summary)) {
      summary[layer].avgDurationMs = Math.round(summary[layer].avgDurationMs / summary[layer].count);
    }

    return res.json({
      incidents: rows,
      summary,
      total: totals.length,
      limit,
      offset,
    });
  });

  // ── Live Call Monitor: GET /api/ai-receptionist/live ─────────────────────
  // Returns a real-time snapshot of all active call sessions for this store,
  // including per-session health scores (0–100), silence event counts, tool
  // failure rates, WebSocket status, and a rolling event log.
  //
  // Also accepts ?storeId=<N> from the frontend (used before the user session
  // is fully hydrated) — falls back to the session storeId.
  app.get("/api/ai-receptionist/live", isAuthenticated, async (req: Request, res: Response) => {
    const storeId = await resolveTenantIdForRequest(req, {
      allowQueryStoreId: true,
    });

    const snapshot = callHealthTracker.getActiveCalls();

    // Filter to only this store's calls (admin sees all if no storeId)
    const filtered = storeId
      ? {
          ...snapshot,
          activeCalls: snapshot.activeCalls.filter((c) => c.storeId === storeId),
          totalActive: snapshot.activeCalls.filter((c) => c.storeId === storeId).length,
          atRisk:      snapshot.activeCalls.filter((c) => c.storeId === storeId && c.healthScore < 50).length,
          critical:    snapshot.activeCalls.filter((c) => c.storeId === storeId && c.healthScore < 30).length,
        }
      : snapshot;

    return res.json(filtered);
  });

  // ── Public health check — used by deploy scripts, VPS monitoring & ops ──────
  // No auth required — reveals only operational status, zero PII.
  // Hit this from your VPS to verify everything is working:
  //   curl https://your-domain.com/api/ai-receptionist/health | jq .
  app.get("/api/ai-receptionist/health", (_req: Request, res: Response) => {
    const callSnapshot  = callHealthTracker.getActiveCalls();
    const gateStatuses  = safetyGate.getAllStatuses();

    // Build per-store summary (safety gate + concurrent calls)
    const stores: Record<string, unknown> = {};
    for (const gate of gateStatuses) {
      const sid = String(gate.storeId);
      stores[sid] = {
        liveCallsEnabled:    gate.liveCallsEnabled,
        blocked:             gate.blocked,
        blockedReason:       gate.blockedReason ?? null,
        firstCallMode:       gate.firstCallMode,
        concurrentCalls:     sessionGuard.getActiveCalls(gate.storeId as number),
        metrics:             (gate as any).metrics,
      };
    }

    // Strip events / full failures from active calls — keep it readable
    const activeCalls = callSnapshot.activeCalls.map((c) => ({
      callSid:         c.callSid ? `${c.callSid.slice(0, 8)}…` : null,
      storeId:         c.storeId,
      durationSeconds: c.durationSeconds,
      healthScore:     c.healthScore,
      riskLevel:       c.riskLevel,
      wsOpen:          c.wsOpen,
      toolSuccesses:   c.toolSuccesses,
      toolFailures:    c.toolFailures,
      silenceEvents:   c.silenceEvents,
      fillerInjections: c.fillerInjections,
      currentTool:     c.currentTool,
      recentFailures:  c.recentFailures.slice(-3).map((f) => ({
        category: f.category,
        detail:   f.detail,
        at:       new Date(f.at).toISOString(),
      })),
    }));

    res.json({
      status:            "ok",
      service:           "AI Receptionist",
      openAiConfigured:  apiKeyPresent,
      uptimeSeconds:     Math.round(process.uptime() * 10) / 10,
      activeCalls: {
        total:    callSnapshot.totalActive,
        atRisk:   callSnapshot.atRisk,
        critical: callSnapshot.critical,
        calls:    activeCalls,
      },
      stores,
      fetchedAt: new Date().toISOString(),
    });
  });

  // ── Internal AI-safe booking API (used by receptionist tools) ─────────────
  app.get("/api/ai-receptionist/store/:storeId/availability", async (req: Request, res: Response) => {
    if (!isAiInternalAuthorized(req)) {
      return res.status(401).json({ success: false, message: "Unauthorized AI receptionist request." });
    }

    const storeId = parseInt(String(req.params.storeId ?? ""), 10);
    if (isNaN(storeId) || storeId <= 0) {
      return res.status(400).json({ success: false, message: "Invalid storeId." });
    }

    const serviceId = parseInt(String(req.query.serviceId ?? ""), 10);
    const date = String(req.query.date ?? "").trim();
    const staffIdRaw = String(req.query.staffId ?? "").trim();
    const staffId = staffIdRaw ? parseInt(staffIdRaw, 10) : undefined;
    const extraDurationRaw = String(req.query.extraDurationMinutes ?? "").trim();
    const extraDurationMinutes = extraDurationRaw ? parseInt(extraDurationRaw, 10) : 0;

    if (isNaN(serviceId) || serviceId <= 0) {
      return res.status(400).json({ success: false, message: "serviceId is required." });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: "date must be YYYY-MM-DD." });
    }
    if (staffIdRaw && (!Number.isFinite(staffId) || (staffId ?? 0) <= 0)) {
      return res.status(400).json({ success: false, message: "staffId must be a positive integer." });
    }
    if (extraDurationRaw && (!Number.isFinite(extraDurationMinutes) || extraDurationMinutes < 0)) {
      return res.status(400).json({ success: false, message: "extraDurationMinutes must be 0 or a positive integer." });
    }

    const salon = await getSalonContext(storeId).catch(() => null);
    if (!salon || !salon.bookingSlug) {
      return res.status(404).json({ success: false, message: "Salon not configured for booking." });
    }

    const result = await getAvailabilityViaBookingRules(salon, {
      serviceId,
      date,
      staffId,
      extraDurationMinutes,
    });
    return res.json(result);
  });

  app.post("/api/ai-receptionist/store/:storeId/book", async (req: Request, res: Response) => {
    if (!isAiInternalAuthorized(req)) {
      return res.status(401).json({ success: false, message: "Unauthorized AI receptionist request." });
    }

    const storeId = parseInt(String(req.params.storeId ?? ""), 10);
    if (isNaN(storeId) || storeId <= 0) {
      return res.status(400).json({ success: false, message: "Invalid storeId." });
    }

    const salon = await getSalonContext(storeId).catch(() => null);
    if (!salon || !salon.bookingSlug) {
      return res.status(404).json({ success: false, message: "Salon not configured for booking." });
    }

    const body = (req.body ?? {}) as Partial<NewBookingArgs>;
    const result = await createBookingViaBookingRules(salon, {
      customerName: String(body.customerName ?? "").trim(),
      customerPhone: String(body.customerPhone ?? "").trim(),
      serviceId: Number(body.serviceId),
      staffId:
        typeof body.staffId === "number" && Number.isFinite(body.staffId) && body.staffId > 0
          ? Number(body.staffId)
          : undefined,
      appointmentDateTime: String(body.appointmentDateTime ?? "").trim(),
      extraDurationMinutes: Math.max(0, Number(body.extraDurationMinutes ?? 0) || 0),
    });

    if (!result.success) {
      const msg = String(result.message || "Booking failed");
      const code = /no longer available|No available time slots/i.test(msg) ? 409 : 400;
      return res.status(code).json(result);
    }
    return res.json(result);
  });

  // ── Salon owner: GET/PATCH /api/ai-receptionist/settings ─────────────────
  // Owner view never exposes the webhook URL or other admin-only details — it
  // only reveals whether a number has been provisioned and whether the platform
  // OpenAI key is present, so the owner knows when they're allowed to flip the
  // switch and who to contact otherwise.
  app.get("/api/ai-receptionist/settings", isAuthenticated, async (req: Request, res: Response) => {
    const storeId = await resolveTenantIdForRequest(req);
    if (!storeId) return res.status(400).json({ message: "Unable to resolve tenant for this session" });
    const [enabled, phoneNumber, locationRow] = await Promise.all([
      getReceptionistEnabled(storeId),
      getReceptionistPhone(storeId),
      db.select({ phone: locations.phone }).from(locations).where(eq(locations.id, storeId)).limit(1).then((rows) => rows[0]),
    ]);
    const businessPhone = locationRow?.phone ?? null;
    const businessAreaCode = businessPhone ? (toTenDigit(businessPhone) ?? "").slice(0, 3) || null : null;
    const _ownerBase = (process.env.APP_URL ?? "").replace(/\/$/, "");
    return res.json({
      enabled,
      apiKeyConfigured: apiKeyPresent,
      phoneProvisioned: !!phoneNumber,
      provisionedPhoneNumber: phoneNumber ?? null,
      businessAreaCode,
      twilioConfigured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
      voiceWebhookUrl: `${_ownerBase}/api/webhook/twilio/${storeId}`,
    });
  });

  app.patch("/api/ai-receptionist/settings", isAuthenticated, async (req: Request, res: Response) => {
    const storeId = await resolveTenantIdForRequest(req);
    if (!storeId) return res.status(400).json({ message: "Unable to resolve tenant for this session" });
    const { enabled } = req.body as { enabled?: boolean };
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "'enabled' must be a boolean" });
    }
    // Owners cannot turn the system ON unless the platform has provisioned
    // a phone number AND the OpenAI key is set. Turning OFF is always allowed.
    if (enabled) {
      const phoneNumber = await getReceptionistPhone(storeId);
      if (!apiKeyPresent || !phoneNumber) {
        return res.status(409).json({
          message: !apiKeyPresent
            ? "The platform OpenAI key is not configured — contact your account manager."
            : "No Twilio number has been assigned to this salon yet — contact your account manager.",
        });
      }
    }
    await setReceptionistEnabled(storeId, enabled);
    const phoneNumber = await getReceptionistPhone(storeId);
    return res.json({
      enabled,
      apiKeyConfigured: apiKeyPresent,
      phoneProvisioned: !!phoneNumber,
    });
  });

  // ── Admin: GET/PATCH /api/admin/stores/:storeId/ai-receptionist ───────────
  // Protected by isAdminAuthenticated → must be a logged-in user with users.isAdmin = true.
  app.get("/api/admin/stores/:storeId/ai-receptionist", isAdminAuthenticated, async (req: Request, res: Response) => {
    const storeId = parseInt(String(req.params.storeId ?? ""), 10);
    if (isNaN(storeId)) return res.status(400).json({ message: "Invalid storeId" });
    const [enabled, phoneNumber] = await Promise.all([
      getReceptionistEnabled(storeId),
      getReceptionistPhone(storeId),
    ]);
    const _base = (process.env.APP_URL ?? "").replace(/\/$/, "");
    return res.json({
      enabled,
      phoneNumber,
      apiKeyConfigured: apiKeyPresent,
      webhookUrl: phoneNumber ? `${_base}/api/webhook/twilio/${storeId}` : null,
      voiceWebhookUrl: phoneNumber ? `${_base}/api/webhook/twilio/voice/${storeId}` : null,
    });
  });

  app.patch("/api/admin/stores/:storeId/ai-receptionist", isAdminAuthenticated, async (req: Request, res: Response) => {
    const storeId = parseInt(String(req.params.storeId ?? ""), 10);
    if (isNaN(storeId)) return res.status(400).json({ message: "Invalid storeId" });

    const body = req.body as { enabled?: boolean; phoneNumber?: string | null };

    // At least one of the two fields must be present.
    if (body.enabled === undefined && body.phoneNumber === undefined) {
      return res.status(400).json({ message: "Provide 'enabled' and/or 'phoneNumber'" });
    }

    if (body.enabled !== undefined) {
      if (typeof body.enabled !== "boolean") {
        return res.status(400).json({ message: "'enabled' must be a boolean" });
      }
      await setReceptionistEnabled(storeId, body.enabled);
    }

    if (body.phoneNumber !== undefined) {
      if (body.phoneNumber === null || body.phoneNumber === "") {
        await setReceptionistPhone(storeId, null);
      } else if (typeof body.phoneNumber === "string") {
        const normalized = normalizePhone(body.phoneNumber);
        if (!normalized) {
          return res.status(400).json({
            message:
              "Invalid phone number — use E.164 format (e.g. +12125551234) or a 10-digit US number.",
          });
        }
        await setReceptionistPhone(storeId, normalized);
      } else {
        return res.status(400).json({ message: "'phoneNumber' must be a string or null" });
      }
    }

    const [enabled, phoneNumber] = await Promise.all([
      getReceptionistEnabled(storeId),
      getReceptionistPhone(storeId),
    ]);
    const _base2 = (process.env.APP_URL ?? "").replace(/\/$/, "");
    return res.json({
      enabled,
      phoneNumber,
      apiKeyConfigured: apiKeyPresent,
      webhookUrl: phoneNumber ? `${_base2}/api/webhook/twilio/${storeId}` : null,
      voiceWebhookUrl: phoneNumber ? `${_base2}/api/webhook/twilio/voice/${storeId}` : null,
    });
  });

  // ── Admin: GET /api/admin/ai-receptionist/cache-stats ─────────────────────
  // Returns Redis hit-rate, key counts per store, memory usage, and BullMQ
  // queue depth — useful for monitoring how much DB load the cache offsets.
  app.get(
    "/api/admin/ai-receptionist/cache-stats",
    isAdminAuthenticated,
    async (_req: Request, res: Response) => {
      try {
        const stats = await getAvailabilityCacheStats();
        return res.json(stats);
      } catch (err) {
        console.error("[cache-stats] Failed to collect stats:", err);
        return res.status(500).json({ message: "Failed to collect cache stats." });
      }
    },
  );

  // ── GET /api/ai-receptionist/account-balance ─────────────────────────────
  // Returns the account's platform credit balance used for phone provisioning.
  app.get("/api/ai-receptionist/account-balance", isAuthenticated, async (req: Request, res: Response) => {
    const storeId = await resolveTenantIdForRequest(req);
    if (!storeId) return res.status(400).json({ message: "Unable to resolve tenant for this session" });

    const [_storeRow] = await db
      .select({ id: locations.id, platformCredits: locations.platformCredits })
      .from(locations)
      .where(eq(locations.id, storeId))
      .limit(1);
    if (!_storeRow) return res.status(404).json({ message: "Store not found" });
    const balance = parseFloat(_storeRow.platformCredits ?? "0");
    return res.json({
      balance: balance.toFixed(2),
      hasSufficientFunds: balance >= 10,
    });
  });

  // ── GET /api/ai-receptionist/available-numbers ───────────────────────────
  // Queries Twilio for available local numbers in the given area code.
  app.get("/api/ai-receptionist/available-numbers", isAuthenticated, async (req: Request, res: Response) => {
    const storeId = await resolveTenantIdForRequest(req);
    if (!storeId) return res.status(400).json({ message: "Unable to resolve tenant for this session" });

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      return res.status(503).json({ message: "Twilio credentials are not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN." });
    }

    const rawAreaCode = String(req.query.areaCode ?? "").trim().replace(/\D/g, "").slice(0, 3);
    if (!rawAreaCode || rawAreaCode.length !== 3) {
      return res.status(400).json({ message: "Provide a valid 3-digit US area code via ?areaCode=NXX" });
    }

    try {
      const client = twilio(accountSid, authToken);
      const available = await client.availablePhoneNumbers("US").local.list({
        areaCode: parseInt(rawAreaCode, 10),
        limit: 12,
        voiceEnabled: true,
      });
      return res.json({
        areaCode: rawAreaCode,
        numbers: available.map((n) => ({
          phoneNumber: n.phoneNumber,
          friendlyName: n.friendlyName,
          locality: n.locality ?? null,
          region: n.region ?? null,
        })),
      });
    } catch (err: any) {
      console.error("[AI Receptionist] Twilio available-numbers error:", err);
      return res.status(502).json({ message: err?.message ?? "Twilio API error fetching available numbers" });
    }
  });

  // ── POST /api/ai-receptionist/provision-number ────────────────────────────
  // Purchases the chosen Twilio number, configures its voice webhook,
  // stores it in storeSettings, and deducts $5 from the account balance.
  // Requires platform_credits >= $10 to proceed.
  app.post("/api/ai-receptionist/provision-number", isAuthenticated, async (req: Request, res: Response) => {
    const storeId = await resolveTenantIdForRequest(req);
    if (!storeId) return res.status(400).json({ message: "Unable to resolve tenant for this session" });

    const [_storeRow] = await db
      .select({ id: locations.id, platformCredits: locations.platformCredits })
      .from(locations)
      .where(eq(locations.id, storeId))
      .limit(1);
    if (!_storeRow) return res.status(404).json({ message: "Store not found" });

    // Balance gate — must have at least $15 to cover the one-time setup fee
    const currentBalance = parseFloat(_storeRow.platformCredits ?? "0");
    if (currentBalance < 15) {
      return res.status(402).json({
        message: "Insufficient balance. You need at least $15.00 in your account to activate a phone number.",
        balance: currentBalance.toFixed(2),
      });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      return res.status(503).json({ message: "Twilio credentials are not configured on this server." });
    }

    const { phoneNumber } = req.body as { phoneNumber?: string };
    if (!phoneNumber) return res.status(400).json({ message: "phoneNumber is required" });

    const normalized = normalizePhone(phoneNumber);
    if (!normalized) return res.status(400).json({ message: "Invalid phone number format — use E.164 (e.g. +12125551234)" });

    const appUrl = (process.env.APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN}`).replace(/\/$/, "");
    const voiceWebhookUrl = `${appUrl}/api/webhook/twilio/${storeId}`;
    const smsWebhookUrl = `${appUrl}/api/webhooks/twilio/incoming`;

    try {
      const client = twilio(accountSid, authToken);

      // Purchase the number and wire up both voice and SMS webhooks
      await client.incomingPhoneNumbers.create({
        phoneNumber: normalized,
        voiceUrl: voiceWebhookUrl,
        voiceMethod: "POST",
        smsUrl: smsWebhookUrl,
        smsMethod: "POST",
      });

      // Deduct $15 setup fee from balance (atomic)
      const [updated] = await db
        .update(locations)
        .set({ platformCredits: sql`COALESCE(platform_credits, 0) - 15.00` })
        .where(eq(locations.id, storeId))
        .returning({ platformCredits: locations.platformCredits });

      // Persist phone to storeSettings
      await setReceptionistPhone(storeId, normalized);

      // Auto-enable if OpenAI key is present
      if (apiKeyPresent) {
        await setReceptionistEnabled(storeId, true);
      }

      const newBalance = parseFloat(updated?.platformCredits ?? "0");
      console.log(`[AI Receptionist] Provisioned Twilio number ${normalized} for storeId=${storeId} → webhook: ${voiceWebhookUrl} | balance after deduction: $${newBalance.toFixed(2)}`);

      const { logCreditTransaction } = await import("../lib/creditLedger");
      await logCreditTransaction({
        storeId:      storeId,
        type:         "ai_provision",
        amount:       -15.00,
        description:  `AI Receptionist — phone number provisioned (${normalized})`,
        balanceAfter: newBalance,
      });

      return res.json({
        success: true,
        phoneNumber: normalized,
        webhookConfigured: true,
        voiceWebhookUrl,
        enabled: apiKeyPresent,
        balanceAfter: newBalance.toFixed(2),
      });
    } catch (err: any) {
      console.error("[AI Receptionist] Twilio provision-number error:", err);
      return res.status(502).json({ message: err?.message ?? "Failed to provision phone number via Twilio" });
    }
  });

  // ── Twilio webhook: POST /api/webhook/twilio/:storeId ────────────────────
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

  app.post("/api/webhook/twilio/:storeId", async (req: Request, res: Response) => {
    // ── DEBUG: log everything about the incoming request ──────────────────
    console.log("═══════════════════════════════════════════════════════════════");
    console.log(`[AI Receptionist] WEBHOOK RECEIVED at ${new Date().toISOString()}`);
    console.log(`[AI Receptionist]   method: ${req.method}`);
    console.log(`[AI Receptionist]   originalUrl: ${req.originalUrl}`);
    console.log(`[AI Receptionist]   path: ${req.path}`);
    console.log(`[AI Receptionist]   params: ${JSON.stringify(req.params)}`);
    console.log(`[AI Receptionist]   query: ${JSON.stringify(req.query)}`);
    console.log(`[AI Receptionist]   hostname: ${req.hostname}`);
    console.log(`[AI Receptionist]   x-forwarded-host: ${req.headers["x-forwarded-host"] ?? "(none)"}`);
    console.log(`[AI Receptionist]   x-forwarded-proto: ${req.headers["x-forwarded-proto"] ?? "(none)"}`);
    console.log(`[AI Receptionist]   content-type: ${req.headers["content-type"] ?? "(none)"}`);
    console.log(`[AI Receptionist]   body (keys): ${Object.keys(req.body ?? {}).join(", ") || "(empty)"}`);
    console.log(`[AI Receptionist]   body.From: ${(req.body as any)?.From ?? "(not set)"}`);
    console.log(`[AI Receptionist]   APP_URL: ${process.env.APP_URL ?? "(not set)"}`);
    console.log(`[AI Receptionist]   REPLIT_DEV_DOMAIN: ${process.env.REPLIT_DEV_DOMAIN ?? "(not set)"}`);
    console.log("═══════════════════════════════════════════════════════════════");

    // ── SKIP signature validation during development ──────────────────────
    // 🔒 Re-enable in production! See line ~1070 for the code.
    /*
    if (twilioAuthToken) {
      // ... signature validation ...
    }
    */

    const storeId = parseInt(String(req.params.storeId ?? ""), 10);

    if (isNaN(storeId) || storeId <= 0) {
      console.warn(`[AI Receptionist] Missing or invalid storeId in webhook URL — got "${req.params.storeId}". Path should be /api/webhook/twilio/<N>.`);
      // Return 200 — a 4xx causes Twilio to play its own "application error" recording.
      return res.status(200).type("text/xml")
        .send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>This phone line is not yet configured. Please contact support.</Say><Hangup/></Response>`);
    }

    console.log(`[AI Receptionist] Parsed storeId = ${storeId}`);

    // Twilio can POST non-call event payloads (e.g. Event Streams/alerts) to this URL.
    // Those payloads do not contain voice-call fields (CallSid/From) and MUST NOT
    // receive TwiML <Connect><Stream>, or call flow can become unstable.
    const callSidRaw = ((req.body?.CallSid as string | undefined) ?? "").trim();
    const payloadType = ((req.body?.PayloadType as string | undefined) ?? "").trim();
    const hasOpaquePayload = !!payloadType || !!req.body?.Payload;
    if (!callSidRaw && hasOpaquePayload) {
      console.log(
        `[AI Receptionist] Ignoring non-voice webhook payload for store ${storeId}` +
        ` (PayloadType=${payloadType || "(none)"})`
      );
      return res.status(200).type("text/plain").send("ok");
    }

    const receptionistEnabled = await getReceptionistEnabled(storeId);
    if (!receptionistEnabled) {
      console.log(`[AI Receptionist] Incoming call rejected — receptionist disabled for store ${storeId}`);
      return res.status(200).type("text/xml").send(twimlDisabledBusy());
    }

    // ── Balance gate ──────────────────────────────────────────────────────────
    // We allow balances to go negative during a call (never cut a live call).
    // But we block NEW calls once the balance hits -$10.00 or below — this is
    // the hard floor.  Accounts with balance > -10 are allowed through.
    try {
      const [_balRow] = await db
        .select({ platformCredits: locations.platformCredits })
        .from(locations)
        .where(eq(locations.id, storeId))
        .limit(1);

      const currentBalance = parseFloat(_balRow?.platformCredits ?? "0");
      const NEGATIVE_BALANCE_LIMIT = -10.00;

      if (currentBalance <= NEGATIVE_BALANCE_LIMIT) {
        console.warn(
          `[AI Receptionist] Incoming call blocked — store ${storeId} balance $${currentBalance.toFixed(2)} ` +
          `is at or below the -$10.00 limit. Add funds to resume service.`
        );
        return res.status(200).type("text/xml").send(
          `<?xml version="1.0" encoding="UTF-8"?>` +
          `<Response>` +
          `<Say voice="Polly.Joanna">Thank you for calling. We are temporarily unable to take calls at this time. Please try again later or contact the business directly.</Say>` +
          `<Hangup/>` +
          `</Response>`
        );
      }
    } catch (balErr: any) {
      // If we cannot read balance, allow the call through — never block on a DB error.
      console.error(`[AI Receptionist] Balance check failed for store ${storeId} — allowing call through:`, balErr.message);
    }

    const salon = await getSalonContext(storeId).catch((err) => {
      console.error(`[AI Receptionist] getSalonContext(${storeId}) threw:`, err);
      return null;
    });
    if (!salon) {
      console.warn(`[AI Receptionist] Unknown storeId ${storeId} — no salon found`);
      // Return 200 — a 4xx causes Twilio to play its own "application error" recording.
      return res.status(200).type("text/xml")
        .send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, we could not find this salon. Please call back later.</Say><Hangup/></Response>`);
    }

    console.log(`[AI Receptionist] Found salon: "${salon.businessName}" (store ${storeId})`);

    // ── Extract caller phone ─────────────────────────────────────────────────
    // Twilio sends From in E.164 (+12125551234). Normalise to bare 10-digit
    // so it matches the format stored in the DB.
    const callerPhoneRaw = (req.body?.From as string | undefined) ?? "";
    const callerPhone = toTenDigit(callerPhoneRaw) ?? callerPhoneRaw.replace(/[<>&"']/g, "");

    const appUrl = process.env.APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN}`;
    const wssDomain = appUrl.replace(/^https?:\/\//, "");
    // IMPORTANT: Twilio <Stream> URLs MUST NOT contain a query string —
    // any `?param=…` causes the WebSocket handshake to fail (Twilio error 31920).
    // The storeId and caller phone are passed below as <Parameter> nouns,
    // which Twilio delivers in the `start` event's customParameters object.
    const streamUrl = `wss://${wssDomain}/media-stream`;

    console.log(
      `[AI Receptionist] Incoming call → "${salon.businessName}" (store ${storeId}) from "${callerPhone || "unknown"}"`
    );
    console.log(`[AI Receptionist] Stream URL: ${streamUrl}`);

    return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="storeId" value="${storeId}" />
      <Parameter name="from" value="${callerPhone}" />
    </Stream>
  </Connect>
</Response>`);
  });

  // ── Twilio recording status webhook ─────────────────────────────────────────
  // Receives recording lifecycle events and appends recording metadata to ai_call_log.notes.
  app.post("/api/webhook/twilio/recording/:storeId", async (req: Request, res: Response) => {
    const storeId = parseInt(String(req.params.storeId ?? ""), 10);
    if (isNaN(storeId) || storeId <= 0) {
      return res.status(200).type("text/plain").send("ok");
    }

    const callSid = String(req.body?.CallSid ?? "").trim();
    if (!callSid) {
      return res.status(200).type("text/plain").send("ok");
    }

    const recordingSid = String(req.body?.RecordingSid ?? "").trim();
    const recordingStatus = String(req.body?.RecordingStatus ?? "").trim() || "unknown";
    const recordingUrl = String(req.body?.RecordingUrl ?? "").trim();
    const recordingDuration = String(req.body?.RecordingDuration ?? "").trim();

    const recordingLine = [
      `[recording] status=${recordingStatus}`,
      recordingSid ? `sid=${recordingSid}` : "",
      recordingDuration ? `duration=${recordingDuration}s` : "",
      recordingUrl ? `url=${recordingUrl}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    try {
      const [row] = await db
        .select({ id: aiCallLog.id, notes: aiCallLog.notes })
        .from(aiCallLog)
        .where(and(eq(aiCallLog.storeId, storeId), eq(aiCallLog.callSid, callSid)))
        .orderBy(desc(aiCallLog.startedAt))
        .limit(1);

      if (row?.id) {
        const nextNotes = [row.notes, recordingLine].filter(Boolean).join("\n");
        await db
          .update(aiCallLog)
          .set({ notes: nextNotes })
          .where(eq(aiCallLog.id, row.id));
      }
    } catch (err) {
      console.error("[AI Receptionist] Failed to persist recording callback:", err);
    }

    return res.status(200).type("text/plain").send("ok");
  });

  // ── WebSocket: WSS /media-stream ─────────────────────────────────────────
  // NOTE: no query string — Twilio forbids them on Stream URLs (error 31920).
  // storeId arrives later via the `start` event's customParameters.
  const mediaWss = new WebSocketServer({ noServer: true });
  registerWss(mediaWss);

  mediaWss.on("connection", (ws: WebSocket, _req: Request) => {
    console.log(`[AI Receptionist] WebSocket accepted (awaiting Twilio start event for storeId)`);
    trackWssConnection();
    createCallSession(ws);
  });

  mediaWss.on("error", (err: Error) => {
    trackWssError(err.message);
  });

  httpServer.on("upgrade", (req, socket, head) => {
    const pathname = req.url?.split("?")[0] ?? "";
    if (pathname === "/media-stream") {
      console.log(`[AI Receptionist] WS upgrade → /media-stream from ${req.headers.host}`);
      mediaWss.handleUpgrade(req as Request, socket as any, head, (ws) => {
        mediaWss.emit("connection", ws, req);
      });
    }
    // Other paths are handled by other upgrade listeners (e.g. http-proxy-middleware
    // for /assets/, /editor/, etc.). Each listener decides on its own whether to
    // claim the socket; unclaimed sockets are eventually closed by Node.
  });

  // ── Simple Voice mode ─────────────────────────────────────────────────────
  // Uses Twilio <Gather input="speech"> + OpenAI Chat Completions instead of
  // the WebSocket / Realtime API path.  No WebSocket required — all HTTP.
  //
  // Webhook URL for Twilio:  POST /api/webhook/twilio/voice/:storeId
  //
  // Conversation state lives in memory keyed by Twilio CallSid (calls are
  // short-lived so we never need persistence). Sessions are pruned after
  // VOICE_SESSION_TTL_MS of inactivity.

  const VOICE_SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes
  const MAX_VOICE_TURNS = 12;
  const AI_SPAM_PROTECTION_ENABLED = String(process.env.AI_SPAM_PROTECTION_ENABLED ?? "true") === "true";

interface VoiceSession {
  storeId: number;
  callerPhone: string;
  callerName: string | null;
  salon: SalonContext;
  allowlist: AppointmentIdAllowlist;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    turnCount: number;
    lastActive: number;
    callLogId: number | null;
    callStartTime: Date;
  firstTurnAtMs: number;
  lastTranscript: string | null;
  repeatedPhraseCount: number;
  suspiciousTurnCount: number;
  usedNameInClosing: boolean;
}

  const voiceSessions = new Map<string, VoiceSession>();

  // Prune stale sessions every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [sid, session] of voiceSessions) {
      if (now - session.lastActive > VOICE_SESSION_TTL_MS) {
        voiceSessions.delete(sid);
      }
    }
  }, 5 * 60 * 1000);

  function buildVoiceSystemPrompt(salon: SalonContext, callerPhone: string, callerName: string | null, upcoming: CallerAppointment[]): string {
    const hasKnownCallerName = Boolean(callerName && callerName.trim());
    const hasKnownCallerPhone = Boolean(callerPhone && callerPhone.trim());
    const serviceList = salon.services.length
      ? salon.services.map((s) => `• ${s.name} — ${s.durationMinutes} min, $${s.price}  [serviceId: ${s.id}]`).join("\n")
      : "• (No services on file — ask the caller to visit the website)";

    let callerBlock: string;
    if (!callerPhone) {
      callerBlock = "The caller's phone number is not available. Ask for their name and phone number.";
    } else if (upcoming.length === 0) {
      const nameNote = callerName ? `Their name on file is ${callerName}. ` : "This is a new caller — ask for their name. ";
      callerBlock = `Caller phone: ${callerPhone}. ${nameNote}They have no upcoming appointments.`;
    } else {
      const list = upcoming.map((a) => {
        const fmt = new Date(a.date).toLocaleString("en-US", {
          weekday: "short", month: "short", day: "numeric",
          hour: "numeric", minute: "2-digit", timeZone: salon.timezone,
        });
        return `• ${a.serviceName} on ${fmt} [appointmentId: ${a.id}]`;
      }).join("\n");
      callerBlock = `Caller phone: ${callerPhone}. Name on file: ${callerName ?? "(unknown)"}.\nUpcoming appointments:\n${list}`;
    }

    return `You are Autumn, a friendly AI phone receptionist for ${salon.businessName}. Keep responses SHORT — this is a phone call. One or two sentences per turn. Today's date/timezone: ${new Date().toLocaleString("en-US", { timeZone: salon.timezone, dateStyle: "full" })} (${salon.timezone}).

Introduce yourself as Autumn near the start of the call.
Your FIRST spoken response in a new call must be exactly: "${buildTimeOfDayGreeting(salon.timezone, salon.businessName, "booking")}"
${hasKnownCallerName
  ? `If they say yes and caller name is known (${callerName}), do NOT ask who is speaking. Do NOT repeatedly use their name in normal turns.`
  : `If they say yes, your next question must be: "Great, may I ask who I am speaking with?" After they give their name, say: "Thank you [caller name], are we looking to book a manicure or pedicure?"`}

${hasKnownCallerPhone
  ? `Caller ID phone is already available (${callerPhone}). Use it as the contact number by default and do NOT ask whether it is a good contact number unless caller asks to use a different number.`
  : `Caller ID phone is unavailable; ask for the best callback/contact number before confirming booking.`}

${callerBlock}

Services available:
${serviceList}

You can: book new appointments, cancel or reschedule existing ones.
To book, collect: FIRST name, contact phone, service choice, and preferred date + time.
Use call memory across turns. If the caller already provided a detail, do NOT ask for it again.
If the caller provides multiple details in one sentence, extract all of them and only ask for missing fields.
Do NOT ask open-ended "what exact time" first. Ask whether they prefer MORNING, AFTERNOON, or EVENING.
Once they choose a day + window, call search_available_slots and offer 2-3 real times in that window.
For these suggested options, require at least 90 minutes of fit by setting minimumTotalDurationMinutes to 90.
All times, prompts, and tool calls must use the salon's timezone: ${salon.timezone}. Do not infer caller-local time; always interpret and present dates/times in the salon timezone.
If caller says "with [staff name]" or asks for a specific technician, treat that as required staff preference.
When a specific technician is requested, include staffId in search_available_slots and create_booking.
If caller ID is available, use it without confirmation and do not read digits back.
Only ask for a contact number if caller ID is unavailable or the caller wants to use a different number.
For service choice, ask naturally and briefly: "Would you like a manicure or pedicure today?"
If they want manicure or pedicure details, ask naturally (not as a list): "Great — would you prefer classic, gel, or deluxe?"
Do not sound scripted or robotic, and do not dump long service menus unless asked.
After service choice, offer one brief relevant add-on suggestion when helpful.
If service is full set acrylic or gel, ask whether current acrylic/gel removal is needed first.
If service is a pedicure, offer a callus treatment add-on.
If they decline the add-on, continue booking normally without repeating the upsell.
If caller asks many price questions or is unsure what to book, offer to text a price sheet.
If caller says "cheapest", "least expensive", "low-cost", or gives a budget (example: "$50"), treat this as price-based intent.
Suggest the lowest-priced matching option first.
If multiple fit, offer up to 2 concise options from lowest to higher.
If they mention a budget, offer options at or under budget first; if none fit, clearly say that and offer the nearest above-budget option.
Always continue with a next step question (never stop after suggesting a service).
If they agree, ask if the current number can receive texts.
If yes, tell them they should receive an SMS shortly from a 1-888 number.
If caller gives a broad time request (for example "anytime tomorrow", "afternoon", or "next week"), gather their target date and use search_available_slots before suggesting times.
Do NOT mention walk-ins unless the caller explicitly asked for today/same-day.
For "anytime tomorrow", prioritize options between 11:00 AM and 5:00 PM.
Prefer around 1:30 PM and 3:30 PM when those are truly available.
Only offer real times returned by tools; never invent a time.
If caller says "it doesn't matter," pick the best available time near 1:30 PM first, otherwise nearest in the 11:00 AM-5:00 PM window.
If add-ons increase total time, include that in extraDurationMinutes when calling tools.
Name on file is only a historical hint. If the caller gives a different name, immediately switch to that new name and use it for the rest of the call and in create_booking.customerName.
If caller ID exists but that number has no CRM name yet, ask for the booking name at the final confirmation step and pass it to create_booking.customerName. Never use "Guest" in this case.
Before booking, confirm with this style: "So we are scheduling a [service name] for [time] on [date], correct?"
If caller confirms, say: "Wonderful, give me one second to get that locked in," then call create_booking.
Confirm everything, then call create_booking.
To cancel, first call get_customer_appointments. If exactly one upcoming appointment exists and caller says "cancel it," call cancel_booking without appointmentId. If multiple exist, ask which date/time to cancel and pass appointmentId.
To reschedule, confirm which appointment and new time, then call reschedule_booking.
Always confirm details back to the caller before calling any tool.
Never end a turn with only a statement when booking is still in progress; always ask the next question.
Use the caller's name at most ONCE per call, and only in the closing check-in question.
After completing ANY booking, cancellation, or reschedule — before saying goodbye — ALWAYS ask this closing question:
• If caller name is known and you have not used their name in closing yet: "Is there anything else I can help you with today, [Name]?"
• Otherwise: "Is there anything else I can help you with today?"
Wait for the caller's response. If they say no or indicate they are done, then say a warm goodbye and end the call naturally.
When done, say a warm goodbye and end the call naturally.`;
  }

  const VOICE_TOOLS = [
    {
      type: "function" as const,
      function: {
        name: "create_booking",
        description: "Create a new appointment after all details are confirmed.",
        parameters: {
          type: "object",
          properties: {
            customerName:        { type: "string", description: "Full name" },
            customerPhone:       { type: "string", description: "Phone number (E.164 or 10-digit US)" },
            serviceId:           { type: "integer", description: "Numeric service ID from the list" },
            staffId:             { type: "integer", description: "Optional specific staff ID when caller requests a technician." },
            staffName:           { type: "string", description: "Optional specific technician name when caller requests by name (e.g. 'Tom')." },
            appointmentDateTime: { type: "string", description: "ISO 8601 datetime (e.g. 2025-06-15T14:00:00)" },
            extraDurationMinutes: { type: "integer", description: "Optional extra minutes for add-ons (0 if none)." },
          },
          required: ["customerName", "customerPhone", "serviceId", "appointmentDateTime"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "cancel_booking",
        description: "Cancel an existing appointment after the caller has confirmed.",
        parameters: {
          type: "object",
          properties: {
            appointmentId: { type: "integer", description: "ID from the appointments list" },
            customerPhone: { type: "string", description: "Optional 10-digit phone if different from caller ID." },
            reason:        { type: "string", description: "Optional reason" },
          },
          required: [],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "reschedule_booking",
        description: "Reschedule an existing appointment after the caller has confirmed.",
        parameters: {
          type: "object",
          properties: {
            appointmentId: { type: "integer", description: "ID from the appointments list" },
            newDateTime:   { type: "string", description: "ISO 8601 new datetime" },
          },
          required: ["appointmentId", "newDateTime"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "search_available_slots",
        description: "Get real available booking times from the existing platform availability API.",
        parameters: {
          type: "object",
          properties: {
            serviceId: { type: "integer", description: "Numeric service ID from the list" },
            date: { type: "string", description: "Date in YYYY-MM-DD" },
            staffId: { type: "integer", description: "Optional specific staff ID" },
            staffName: { type: "string", description: "Optional specific technician name when caller requests by name (e.g. 'Tom')." },
            extraDurationMinutes: { type: "integer", description: "Optional extra minutes for add-ons (0 if none)." },
            minimumTotalDurationMinutes: { type: "integer", description: "Optional minimum total slot fit in minutes (e.g. 90)." },
          },
          required: ["serviceId", "date"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "lookup_client_by_phone",
        description: "Look up an existing client record by 10-digit phone number for this salon.",
        parameters: {
          type: "object",
          properties: {
            customerPhone: { type: "string", description: "Phone number (E.164 or 10-digit US)" },
          },
          required: ["customerPhone"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_customer_appointments",
        description: "Fetch upcoming appointments for a customer by phone number.",
        parameters: {
          type: "object",
          properties: {
            customerPhone: { type: "string", description: "Optional 10-digit phone. If omitted, caller phone is used." },
          },
          required: [],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "lookup_appointment_by_name_or_date",
        description: "Fallback appointment search by customer name and/or date when phone lookup returns no results.",
        parameters: {
          type: "object",
          properties: {
            customerName: { type: "string", description: "Full or partial customer name (case-insensitive)." },
            date: { type: "string", description: "Optional appointment date in YYYY-MM-DD." },
          },
          required: [],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_walkin_availability",
        description: "Get the best walk-in windows for TODAY based on current staff workload and schedule gaps.",
        parameters: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "request_callback",
        description: "SILENT analytics log only — records this call for internal reporting. Do NOT tell the caller anyone will follow up. Do NOT use as an escape hatch. Only call when caller explicitly and repeatedly demands a person after re-engagement attempts fail.",
        parameters: {
          type: "object",
          properties: {
            reason: { type: "string", description: "Brief callback reason." },
          },
          required: [],
        },
      },
    },
  ];

  async function callOpenAiChat(messages: VoiceSession["messages"]): Promise<{
    text: string | null;
    toolName: string | null;
    toolArgs: string | null;
  }> {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("No OpenAI API key configured");

    // S4-fix: Hard 8s abort on the OpenAI fetch — without this a slow OpenAI response holds
    // the Twilio webhook open until Twilio's own 15s request timeout, giving the caller ~10s
    // of silence before Twilio falls through to the <Redirect> fallback.
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8_000),
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        tools: VOICE_TOOLS,
        tool_choice: "auto",
        max_tokens: 200,
        temperature: 0.6,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`OpenAI error ${resp.status}: ${errText}`);
    }

    const data = await resp.json() as any;
    const choice = data.choices?.[0];
    const msg = choice?.message;

    if (msg?.tool_calls?.length) {
      const tc = msg.tool_calls[0];
      return { text: null, toolName: tc.function.name, toolArgs: tc.function.arguments };
    }

    return { text: msg?.content ?? "I'm sorry, I didn't catch that.", toolName: null, toolArgs: null };
  }

  function twimlSay(text: string, actionUrl: string): string {
    const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const safeUrl = actionUrl.replace(/&/g, "&amp;");
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${safeUrl}" method="POST" speechTimeout="3" timeout="8" language="en-US">
    <Say voice="Polly.Joanna">${safe}</Say>
  </Gather>
  <Redirect method="POST">${safeUrl}?_timeout=1</Redirect>
</Response>`;
  }

  function twimlHangup(text: string): string {
    const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${safe}</Say>
  <Hangup/>
</Response>`;
  }

  function twimlDisabledBusy(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="10"/>
  <Hangup/>
</Response>`;
  }

  function getVoiceWebhookBase(req: Request): string {
    const hostname = (req.hostname === "localhost" || req.hostname === "127.0.0.1")
      ? (process.env.REPLIT_DEV_DOMAIN ?? req.hostname)
      : req.hostname;
    return `https://${hostname}/api/webhook/twilio/voice`;
  }

  app.post("/api/webhook/twilio/voice/:storeId", async (req: Request, res: Response) => {
    const storeId = parseInt(String(req.params.storeId ?? ""), 10);
    if (isNaN(storeId) || storeId <= 0) {
      return res.status(400).type("text/xml").send(twimlHangup("Sorry, this number is not configured. Goodbye."));
    }

    const receptionistEnabled = await getReceptionistEnabled(storeId);
    if (!receptionistEnabled) {
      return res.status(200).type("text/xml").send(twimlDisabledBusy());
    }

    const callSid = (req.body?.CallSid as string | undefined) ?? "";
    const callerPhoneRaw = (req.body?.From as string | undefined) ?? "";
    const speechResult = ((req.body?.SpeechResult as string | undefined) ?? "").trim();
    const isTimeout = req.query._timeout === "1";
    const baseUrl = getVoiceWebhookBase(req);
    const actionUrl = `${baseUrl}/${storeId}`;

    console.log(`[Voice] storeId=${storeId} callSid=${callSid || "(none)"} speech="${speechResult || "(none)"}"`);

    // ── Initial call (no CallSid in session yet) → bootstrap ──────────────
    if (!voiceSessions.has(callSid)) {
      // S3-fix: Both getSalonContext and the caller-lookup Promise.all get hard timeouts so a
      // stalled DB connection (which never throws) can't hold the Twilio webhook open forever.
      const salon = await Promise.race([
        getSalonContext(storeId).catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 4_000)),
      ]);
      if (!salon) {
        return res.type("text/xml").send(twimlHangup("Sorry, we couldn't locate this salon. Please call back later."));
      }

      // Normalise to bare 10-digit — DB stores numbers without +1 or formatting
      const callerPhone = toTenDigit(callerPhoneRaw) ?? callerPhoneRaw.replace(/[<>&"']/g, "");
      const [upcoming, callerName] = await Promise.race([
        Promise.all([
          callerPhone ? getCallerUpcomingAppointments(callerPhone, storeId) : Promise.resolve([]),
          callerPhone ? getCallerName(callerPhone, storeId) : Promise.resolve(null),
        ]),
        new Promise<[CallerAppointment[], null]>((resolve) =>
          setTimeout(() => {
            console.warn("[Voice] DB caller-lookup timed out after 3s — proceeding with empty context");
            resolve([[], null]);
          }, 3_000)
        ),
      ]).catch(() => [[], null] as [CallerAppointment[], null]);

      const systemPrompt = buildVoiceSystemPrompt(salon, callerPhone, callerName, upcoming);

      // Insert call log row
      let callLogId: number | null = null;
      try {
        const [row] = await db.insert(aiCallLog).values({
          storeId,
          callSid: callSid || null,
          callerPhone: callerPhone || null,
          callerName: callerName || null,
          outcome: "in_progress",
          startedAt: new Date(),
        }).returning({ id: aiCallLog.id });
        callLogId = row?.id ?? null;
      } catch (err) {
        console.error("[Voice] Failed to insert call log:", err);
      }

      const greeting = buildTimeOfDayGreeting(salon.timezone, salon.businessName, "booking");

      voiceSessions.set(callSid, {
        storeId,
        callerPhone,
        callerName,
        salon,
        allowlist: new Set(upcoming.map((a) => a.id)),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "assistant", content: greeting },
        ],
        turnCount: 0,
        lastActive: Date.now(),
        callLogId,
        callStartTime: new Date(),
        firstTurnAtMs: 0,
        lastTranscript: null,
        repeatedPhraseCount: 0,
        suspiciousTurnCount: 0,
        usedNameInClosing: false,
      });

      return res.type("text/xml").send(twimlSay(greeting, actionUrl));
    }

    // ── Subsequent turn ────────────────────────────────────────────────────
    const session = voiceSessions.get(callSid)!;
    session.lastActive = Date.now();
    session.turnCount++;

    // Caller didn't say anything (timeout or silence)
    // Never call OpenAI when there is no new caller utterance, otherwise the
    // assistant can emit an unsolicited extra turn.
    if (!speechResult) {
      if (session.turnCount > 2) {
        voiceSessions.delete(callSid);
        await finalizeCallLog(session, "no_action");
        return res.type("text/xml").send(twimlHangup("I didn't catch that. Give us a call back anytime. Goodbye!"));
      }
      const reprompt = isTimeout
        ? "Are you still there? I can help with booking, rescheduling, or pricing."
        : "I didn't catch that — could you say that again?";
      return res.type("text/xml").send(twimlSay(reprompt, actionUrl));
    }

    if (session.turnCount > MAX_VOICE_TURNS) {
      voiceSessions.delete(callSid);
      await finalizeCallLog(session, "no_action");
      return res.type("text/xml").send(twimlHangup("I've reached my limit for this call. Please call back or book online. Goodbye!"));
    }

    if (AI_SPAM_PROTECTION_ENABLED) {
      const nowMs = Date.now();
      if (speechResult && session.firstTurnAtMs === 0) {
        session.firstTurnAtMs = nowMs;
      }

      const normalizedTranscript = speechResult
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (normalizedTranscript) {
        if (normalizedTranscript === session.lastTranscript) {
          session.repeatedPhraseCount += 1;
        } else {
          session.repeatedPhraseCount = 0;
        }
        session.lastTranscript = normalizedTranscript;
      }

      const callDurationSec = Math.round((nowMs - session.callStartTime.getTime()) / 1000);
      const responseLatencyMs = session.firstTurnAtMs > 0
        ? Math.max(0, session.firstTurnAtMs - session.callStartTime.getTime())
        : undefined;

      const risk = scoreCallRisk({
        phone: session.callerPhone,
        transcript: speechResult || null,
        silenceDurationMs: !speechResult && isTimeout ? 3000 : 0,
        responseLatencyMs,
        repeatedPhraseCount: session.repeatedPhraseCount,
        callDurationSec,
      });

      if (risk.classification !== "clean") {
        session.suspiciousTurnCount += 1;
      }

      if (risk.action === "terminate_call" || risk.skipOpenAi) {
        const reasons = risk.reasons.join(",") || "spam_filter";
        if (session.callerPhone) {
          await recordBlockedNumber(session.callerPhone, risk.score, risk.reasons);
        }
        voiceSessions.delete(callSid);
        await finalizeCallLog(session, "blocked_spam", `score=${risk.score};reasons=${reasons}`);
        return res.type("text/xml").send(twimlHangup("We're unable to process this call. Please contact the salon directly. Goodbye."));
      }

      if (risk.action === "limited_interaction") {
        voiceSessions.delete(callSid);
        await finalizeCallLog(session, "screened_suspicious", `score=${risk.score};reasons=${risk.reasons.join(",")}`);
        return res
          .type("text/xml")
          .send(twimlHangup("I'm having trouble understanding this call clearly. Please call back and our front desk can help you directly. Goodbye."));
      }
    }

    if (speechResult) {
      session.messages.push({ role: "user", content: speechResult });
    }

    let aiResponse: { text: string | null; toolName: string | null; toolArgs: string | null };
    try {
      aiResponse = await callOpenAiChat(session.messages);
    } catch (err: any) {
      console.error("[Voice] OpenAI error:", err.message);
      return res.type("text/xml").send(twimlHangup("I'm having trouble connecting right now. Please call back in a moment. Goodbye!"));
    }

    // ── Tool call → execute booking action ────────────────────────────────
    if (aiResponse.toolName && aiResponse.toolArgs) {
      const { toolName, toolArgs } = aiResponse;
      console.log(`[Voice] Tool call: ${toolName} args=${toolArgs}`);

      // Architecture Rule 2: Terminal tools (booking mutations) end the call.
      // Non-terminal tools (lookups / availability) MUST continue the conversation —
      // silence after a lookup is a system failure. Feed the result back to OpenAI
      // for a spoken reply, then return to the <Gather> loop.
      const TERMINAL_TOOLS = new Set(["create_booking", "cancel_booking", "reschedule_booking"]);
      const isTerminal = TERMINAL_TOOLS.has(toolName);

      let result: { success: boolean; message: string };
      let outcome = "no_action";

      if (toolName === "create_booking") {
        result = await handleNewBooking(session.storeId, toolArgs, session.salon);
        if (result.success) outcome = "booked";
      } else if (toolName === "cancel_booking") {
        result = await handleCancel(session.storeId, toolArgs, session.allowlist, session.callerPhone, session.salon.timezone);
        if (result.success) outcome = "cancelled";
      } else if (toolName === "reschedule_booking") {
        result = await handleReschedule(session.storeId, toolArgs, session.allowlist, session.salon.timezone);
        if (result.success) outcome = "rescheduled";
      } else if (toolName === "search_available_slots") {
        result = await handleGetAvailableSlots(toolArgs, session.salon);
        if (result.success) outcome = "availability_checked";
      } else if (toolName === "get_customer_appointments") {
        const r = await handleGetCustomerAppointments(toolArgs, session.salon, session.callerPhone);
        // C1: Sync allowlist — fallback-looked-up appointments must be modifiable this call
        if (r.success) { outcome = "availability_checked"; r.appointmentIds?.forEach((id) => session.allowlist.add(id)); }
        result = r;
      } else if (toolName === "lookup_client_by_phone") {
        result = await handleLookupClientByPhone(toolArgs, session.salon);
        if (result.success) outcome = "availability_checked";
      } else if (toolName === "lookup_appointment_by_name_or_date") {
        // Rule 2: Fallback identification by name/date
        const r = await handleLookupAppointmentByNameOrDate(toolArgs, session.salon);
        // C1: Sync allowlist — fallback-looked-up appointments must be modifiable this call
        if (r.success) { outcome = "availability_checked"; r.appointmentIds?.forEach((id) => session.allowlist.add(id)); }
        result = r;
      } else if (toolName === "get_walkin_availability") {
        result = await handleGetWalkinAvailability(session.salon);
        if (result.success) outcome = "walkin_guidance";
      } else if (toolName === "request_callback") {
        result = await handleRequestCallback(
          toolArgs,
          session.salon,
          session.callerPhone ?? null,
          session.callLogId,
        );
        if (result.success) outcome = "callback_required";
      } else {
        result = { success: false, message: "Unknown action." };
      }

      // ── Non-terminal tool: must continue the conversation ─────────────────
      // Inject the tool result as context, call OpenAI for a spoken reply,
      // and stay in the <Gather> loop. Silence here is a critical failure.
      if (!isTerminal) {
        session.messages.push({
          role: "system",
          content: `[Tool result for ${toolName}]: ${result.message}. Summarize this for the caller in one or two clear sentences and ask what they would like to do next.`,
        });
        let continuationText: string;
        try {
          const continuation = await callOpenAiChat(session.messages);
          continuationText = continuation.text ?? result.message;
        } catch {
          // Guarantee a spoken reply even if OpenAI is unavailable
          continuationText = result.success
            ? result.message
            : "I'm sorry, I had trouble retrieving that information. Could you say that again?";
        }
        session.messages.push({ role: "assistant", content: continuationText });
        console.log(`[Voice] ResponseBuilder ✔ tool=${toolName} (non-terminal) outcome=${outcome} response="${continuationText.slice(0, 80)}"`);
        return res.type("text/xml").send(twimlSay(continuationText, actionUrl));
      }

      // ── Terminal tool ─────────────────────────────────────────────────────
      if (!result.success) {
        // Failure: hang up with an error message
        voiceSessions.delete(callSid);
        await finalizeCallLog(session, outcome, result.message);
        const errText = `I'm sorry, I wasn't able to complete that — ${result.message} Please try again or call back. Goodbye!`;
        console.log(`[Voice] ResponseBuilder ✔ tool=${toolName} (terminal-failure) outcome=${outcome} response="${errText.slice(0, 80)}"`);
        return res.type("text/xml").send(twimlHangup(errText));
      }

      // Success: confirm the action, then ask "Was there anything else?" and
      // stay in the Gather loop — let the caller close the call themselves.
      await finalizeCallLog(session, outcome, result.message);
      session.callLogId = null; // prevent double-finalization on session TTL prune

      let confirmLine: string;
      if (toolName === "create_booking") {
        confirmLine = "Perfect, your appointment is confirmed — we'll see you soon!";
      } else if (toolName === "cancel_booking") {
        confirmLine = "Done, your appointment has been successfully cancelled.";
      } else {
        confirmLine = "Your appointment has been rescheduled. We'll see you at the new time!";
      }

      const closingCheckin =
        session.callerName && !session.usedNameInClosing
          ? `Is there anything else I can help you with today, ${session.callerName}?`
          : "Is there anything else I can help you with today?";
      session.usedNameInClosing = true;
      const confirmText = `${confirmLine} ${closingCheckin}`;
      session.messages.push({ role: "assistant", content: confirmText });
      console.log(`[Voice] ResponseBuilder ✔ tool=${toolName} (terminal-success) outcome=${outcome} response="${confirmText.slice(0, 80)}"`);
      return res.type("text/xml").send(twimlSay(confirmText, actionUrl));
    }

    // ── Text response → continue conversation ─────────────────────────────
    const text = aiResponse.text ?? "I didn't catch that — could you repeat that?";
    session.messages.push({ role: "assistant", content: text });
    console.log(`[Voice] ResponseBuilder ✔ direct-text turn response="${text.slice(0, 80)}"`);
    return res.type("text/xml").send(twimlSay(text, actionUrl));
  });

  async function finalizeCallLog(session: VoiceSession, outcome: string, notes?: string) {
    if (!session.callLogId) return;
    const durationSeconds = Math.round((Date.now() - session.callStartTime.getTime()) / 1000);
    try {
      await db.update(aiCallLog)
        .set({ outcome, notes: notes ?? null, endedAt: new Date(), durationSeconds })
        .where(eq(aiCallLog.id, session.callLogId));
    } catch (err) {
      console.error("[Voice] Failed to finalize call log:", err);
    }
  }

  // ── Replay dashboard: GET /api/replay-autumn ─────────────────────────────
  // Public — no auth required. Secret-URL pattern provides basic access control.
  // Returns recent calls with silence incidents and usage data joined and PII masked.
  // Query params: storeId? (number), limit? (default 100, max 200), outcome? (string)
  app.get("/api/replay-autumn", async (req: Request, res: Response) => {
    try {
      const storeIdParam  = req.query.storeId ? parseInt(req.query.storeId as string, 10) : null;
      const limitParam    = Math.min(parseInt((req.query.limit as string) ?? "100", 10), 200);
      const outcomeFilter = (req.query.outcome as string | undefined)?.trim() || undefined;

      const { and: andConds } = await import("drizzle-orm");

      const callConditions: any[] = [];
      if (storeIdParam && !isNaN(storeIdParam)) callConditions.push(eq(aiCallLog.storeId, storeIdParam));
      if (outcomeFilter) callConditions.push(eq(aiCallLog.outcome, outcomeFilter));

      const calls = await db
        .select({
          id:                aiCallLog.id,
          storeId:           aiCallLog.storeId,
          callSid:           aiCallLog.callSid,
          callerPhone:       aiCallLog.callerPhone,
          callerName:        aiCallLog.callerName,
          outcome:           aiCallLog.outcome,
          durationSeconds:   aiCallLog.durationSeconds,
          startedAt:         aiCallLog.startedAt,
          endedAt:           aiCallLog.endedAt,
          notes:             aiCallLog.notes,
          appointmentId:     aiCallLog.appointmentId,
          toolCallCount:     callUsageRecords.toolCallCount,
          aiResponseCount:   callUsageRecords.aiResponseCount,
          audioTokensIn:     callUsageRecords.audioTokensIn,
          audioTokensOut:    callUsageRecords.audioTokensOut,
          openaiEstCost:     callUsageRecords.openaiEstCost,
          twilioEstCost:     callUsageRecords.twilioEstCost,
          totalEstCost:      callUsageRecords.totalEstCost,
          terminationReason: callUsageRecords.terminationReason,
        })
        .from(aiCallLog)
        .leftJoin(callUsageRecords, eq(callUsageRecords.callLogId, aiCallLog.id))
        .where(callConditions.length ? andConds(...callConditions) : undefined)
        .orderBy(desc(aiCallLog.startedAt))
        .limit(limitParam);

      const callIds = calls.map(c => c.id);
      const incidents = callIds.length
        ? await db
            .select()
            .from(aiSilenceIncidents)
            .where(inArray(aiSilenceIncidents.callLogId, callIds))
            .orderBy(aiSilenceIncidents.occurredAt)
        : [];

      const incByCall: Record<number, typeof incidents> = {};
      for (const inc of incidents) {
        if (inc.callLogId == null) continue;
        if (!incByCall[inc.callLogId]) incByCall[inc.callLogId] = [];
        incByCall[inc.callLogId].push(inc);
      }

      function maskPhone(p: string | null): string {
        if (!p) return "(unknown)";
        const d = p.replace(/\D/g, "");
        return d.length >= 4 ? `•••-•••-${d.slice(-4)}` : "(masked)";
      }
      function maskName(n: string | null): string | null {
        if (!n) return null;
        const parts = n.trim().split(/\s+/);
        if (parts.length === 1) return `${parts[0][0]}.`;
        return `${parts[0]} ${parts[parts.length - 1][0]}.`;
      }

      const outcomeCounts: Record<string, number> = {};
      for (const c of calls) outcomeCounts[c.outcome] = (outcomeCounts[c.outcome] ?? 0) + 1;

      return res.json({
        generatedAt:           new Date().toISOString(),
        total:                 calls.length,
        limit:                 limitParam,
        outcomeCounts,
        totalSilenceIncidents: incidents.length,
        calls: calls.map(c => ({
          ...c,
          callerPhone:      maskPhone(c.callerPhone),
          callerName:       maskName(c.callerName),
          callSid:          c.callSid ? `${c.callSid.slice(0, 8)}…` : null,
          silenceIncidents: incByCall[c.id] ?? [],
        })),
      });
    } catch (err) {
      console.error("[Replay] /api/replay-autumn error:", err);
      return res.status(500).json({ message: "Internal error" });
    }
  });

  console.log("[AI Receptionist] Routes registered:");
  console.log("  GET  /api/ai-receptionist/health                   (public health check)");
  console.log("  GET  /api/ai-receptionist/call-logs                (salon owner — call history)");
  console.log("  POST /api/webhook/twilio/:storeId                 (Twilio inbound webhook — Realtime API / WebSocket mode)");
  console.log("  POST /api/webhook/twilio/voice/:storeId           (Twilio inbound webhook — Simple Voice / Gather mode)");
  console.log("  WSS  /media-stream                                (Twilio media stream — storeId via customParameters)");
  console.log("  GET  /api/ai-receptionist/settings                (salon owner read)");
  console.log("  PATCH /api/ai-receptionist/settings               (salon owner write)");
  console.log("  GET  /api/admin/stores/:storeId/ai-receptionist   (admin read)");
  console.log("  PATCH /api/admin/stores/:storeId/ai-receptionist  (admin write)");
  console.log("  GET  /api/admin/ai-receptionist/cache-stats       (admin — Redis hit-rate, keys, memory, queue)");
  console.log("[AI Receptionist] Capabilities: book · cancel · reschedule (with caller recognition)");
}
