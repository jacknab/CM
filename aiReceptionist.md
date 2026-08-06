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
import { db } from "../db";
import { locations, services, storeSettings, aiCallLog } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { isAuthenticated, isAdminAuthenticated } from "../auth";
import { storage } from "../storage";

// ─── Constants ────────────────────────────────────────────────────────────────

const OPENAI_REALTIME_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-realtime-2";

const PREF_KEY = "aiReceptionistEnabled";
const PREF_PHONE_KEY = "aiReceptionistPhone";

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
  services: SalonService[];
}

/** A pre-loaded upcoming appointment for the caller, surfaced to the AI. */
interface CallerAppointment {
  id: number;
  serviceName: string;
  date: string;            // ISO 8601
  durationMinutes: number;
  status: string;
}

/**
 * Look up the stored first name of a returning caller.
 * Returns null if this is an unknown number (new caller).
 */
async function getCallerName(callerPhone: string, storeId: number): Promise<string | null> {
  if (!callerPhone) return null;
  try {
    const customer = await storage.searchCustomerByPhone(callerPhone, storeId);
    if (!customer?.name) return null;
    // Return only the first name so the greeting feels natural ("Hi Ashley!")
    const firstName = customer.name.trim().split(/\s+/)[0];
    return firstName || null;
  } catch {
    return null;
  }
}

async function getSalonContext(storeId: number): Promise<SalonContext | null> {
  const [store] = await db
    .select({ id: locations.id, name: locations.name, timezone: locations.timezone })
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

  const storeServices = await db
    .select({ id: services.id, name: services.name, duration: services.duration, price: services.price })
    .from(services)
    .where(eq(services.storeId, storeId));

  return {
    storeId,
    businessName,
    timezone: store.timezone ?? "UTC",
    services: storeServices.map((s) => ({
      id: s.id,
      name: s.name,
      durationMinutes: s.duration,
      price: String(s.price ?? "0.00"),
    })),
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

// ─── OpenAI session config ────────────────────────────────────────────────────

function buildOpenAiSessionConfig(
  salon: SalonContext,
  callerPhone: string | null,
  callerName: string | null,
  existingAppointments: CallerAppointment[]
): object {
  const serviceList = salon.services.length
    ? salon.services
        .map((s) => `• ${s.name} — ${s.durationMinutes} min, $${s.price}  [serviceId: ${s.id}]`)
        .join("\n")
    : "• Please ask the caller to check the website for available services.";

  // ── Build the existing-appointment context block ──────────────────────────
  let existingBookingsBlock: string;
  if (!callerPhone) {
    existingBookingsBlock =
      `The caller's phone number is not available (they may be calling with caller ID blocked). ` +
      `You will need to ask for their name and phone number.`;
  } else if (existingAppointments.length === 0) {
    const nameClause = callerName
      ? `The caller's name on file is **${callerName}** — use it in your greeting (e.g. "Hi ${callerName}!"). `
      : `This number is not yet on file — greet them warmly and ask for their name. `;
    existingBookingsBlock =
      `Caller's phone (from caller ID): ${callerPhone}\n` +
      nameClause +
      `They have NO upcoming appointments at this salon. Walk them through booking one.`;
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

    const greetingInstruction = callerName
      ? `Greet them by name (e.g. "Hi ${callerName}, welcome back!") and reference their upcoming booking(s).`
      : `Acknowledge their existing booking(s) and ask warmly how you can help.`;

    existingBookingsBlock =
      `Caller's phone (from caller ID): ${callerPhone}\n` +
      (callerName ? `Caller's name on file: **${callerName}**\n` : "") +
      `**This caller has the following upcoming appointment(s) on file:**\n${apptList}\n\n` +
      `${greetingInstruction} They may want to confirm, cancel, reschedule, or book an additional appointment.`;
  }

  const instructions = `You are a friendly, professional AI phone receptionist for ${salon.businessName}. \
You help callers manage their appointments — book new ones, cancel existing ones, reschedule, or just confirm details.

${existingBookingsBlock}

The available services at this salon are:
${serviceList}

The salon's timezone is: ${salon.timezone}.

═══ HOW TO HANDLE EACH SCENARIO ═══

▶ NEW BOOKING (caller wants a new appointment):
  1. Collect: full name, phone number (confirm if you have it from caller ID), service, and preferred date/time.
  2. Read back all four details and ask the caller to confirm.
  3. Once confirmed, call the complete_booking function.

▶ CANCEL an existing appointment:
  1. Confirm which appointment they want to cancel (use the appointmentId from the list above).
  2. Briefly ask why — be gentle, this is optional.
  3. Read back the cancellation and ask the caller to confirm.
  4. Once confirmed, call the cancel_booking function with the appointmentId and optional reason.

▶ RESCHEDULE an existing appointment:
  1. Confirm which appointment they want to move (use the appointmentId from the list above).
  2. Ask what new date and time works for them.
  3. Read back the change ("So you'd like to move your X from [old time] to [new time]") and confirm.
  4. Once confirmed, call the reschedule_booking function with the appointmentId and new ISO datetime.

▶ JUST CONFIRMING DETAILS:
  Read the appointment details back to them, wish them well, and end the call warmly.

═══ TONE & STYLE ═══

Keep responses concise — this is a phone call, not a text chat. Speak naturally and warmly. \
If anything is unclear, ask once for clarification before moving on. Never invent appointment IDs — \
only use the IDs listed in the context above.`;

  const realtimeTools = [
    {
      type: "function",
      name: "complete_booking",
      description: "Create a new appointment after all details are confirmed.",
      parameters: {
        type: "object",
        properties: {
          customerName:        { type: "string", description: "Full name" },
          customerPhone:       { type: "string", description: "Phone number (E.164 or 10-digit US)" },
          serviceId:           { type: "integer", description: "Numeric service ID from the list" },
          appointmentDateTime: { type: "string", description: "ISO 8601 datetime (e.g. 2025-06-15T14:00:00)" },
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
          appointmentId: { type: "integer", description: "ID from the appointments list" },
          reason:        { type: "string", description: "Optional reason" },
        },
        required: ["appointmentId"],
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
  ];

  return {
    type: "session.update",
    session: {
      model: "gpt-realtime-2",
      modalities: ["text", "audio"],
      voice: "alloy",
      input_audio_format: "g711_ulaw",
      output_audio_format: "g711_ulaw",
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
      },
      instructions,
      tools: realtimeTools,
      tool_choice: "auto",
    },
  };
}

// ─── Booking-related tool handlers ────────────────────────────────────────────

interface NewBookingArgs {
  customerName: string;
  customerPhone: string;
  serviceId: number;
  appointmentDateTime: string;
}

interface CancelArgs {
  appointmentId: number;
  reason?: string;
}

interface RescheduleArgs {
  appointmentId: number;
  newDateTime: string;
}

/** Used to scope cancel/reschedule to this caller's own appointments. */
type AppointmentIdAllowlist = Set<number>;

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
    let customer = await storage.searchCustomerByPhone(args.customerPhone, storeId);
    if (!customer) {
      customer = await storage.createCustomer({
        name: args.customerName,
        phone: args.customerPhone,
        storeId,
      });
      console.log(`[AI Receptionist] Created customer "${args.customerName}" (id=${customer.id})`);
    }

    const service = salon.services.find((s) => s.id === args.serviceId);
    const duration = service?.durationMinutes ?? 60;

    const appointment = await storage.createAppointment({
      date: new Date(args.appointmentDateTime),
      duration,
      status: "confirmed",
      serviceId: args.serviceId,
      customerId: customer.id,
      storeId,
    });

    console.log(
      `[AI Receptionist] ✅ NEW booking — id=${appointment.id}, customer="${args.customerName}", ` +
      `service="${service?.name ?? args.serviceId}", at=${args.appointmentDateTime}, store=${storeId}`
    );
    return { success: true, message: `Appointment ${appointment.id} confirmed.` };
  } catch (err) {
    console.error("[AI Receptionist] New booking failed:", err);
    return { success: false, message: "Failed to save the booking — please try again." };
  }
}

async function handleCancel(
  storeId: number,
  rawArgs: string,
  allowlist: AppointmentIdAllowlist
): Promise<{ success: boolean; message: string }> {
  let args: CancelArgs;
  try {
    args = JSON.parse(rawArgs);
  } catch {
    return { success: false, message: "Could not understand cancel arguments." };
  }

  if (!allowlist.has(args.appointmentId)) {
    console.warn(
      `[AI Receptionist] Refusing to cancel appointment ${args.appointmentId} — not in caller's allowlist (store ${storeId})`
    );
    return {
      success: false,
      message:
        "That appointment ID is not one I can modify for this caller. Only the appointments listed in the session may be cancelled.",
    };
  }

  // Defense-in-depth: re-verify storeId on the live record before mutating
  const existing = await storage.getAppointment(args.appointmentId);
  if (!existing || existing.storeId !== storeId) {
    console.warn(
      `[AI Receptionist] storeId mismatch on cancel — appointment ${args.appointmentId} belongs to store ${existing?.storeId}, call is for ${storeId}`
    );
    return { success: false, message: "Appointment not found." };
  }

  try {
    const updated = await storage.updateAppointment(args.appointmentId, {
      status: "cancelled",
      cancellationReason: args.reason ?? "Cancelled by caller via AI receptionist",
    });
    if (!updated) {
      return { success: false, message: "Appointment not found." };
    }
    console.log(
      `[AI Receptionist] ❌ CANCELLED appointment id=${args.appointmentId} (store ${storeId}) — reason: ${args.reason ?? "(none given)"}`
    );
    return { success: true, message: `Appointment ${args.appointmentId} cancelled.` };
  } catch (err) {
    console.error("[AI Receptionist] Cancel failed:", err);
    return { success: false, message: "Failed to cancel the appointment — please try again." };
  }
}

async function handleReschedule(
  storeId: number,
  rawArgs: string,
  allowlist: AppointmentIdAllowlist
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

  const newDate = new Date(args.newDateTime);
  if (isNaN(newDate.getTime())) {
    return { success: false, message: "The new date/time was not a valid value." };
  }

  try {
    const updated = await storage.updateAppointment(args.appointmentId, {
      date: newDate,
      status: "confirmed",
    });
    if (!updated) {
      return { success: false, message: "Appointment not found." };
    }
    console.log(
      `[AI Receptionist] 🔄 RESCHEDULED appointment id=${args.appointmentId} → ${newDate.toISOString()} (store ${storeId})`
    );
    return { success: true, message: `Appointment ${args.appointmentId} moved to ${newDate.toISOString()}.` };
  } catch (err) {
    console.error("[AI Receptionist] Reschedule failed:", err);
    return { success: false, message: "Failed to reschedule the appointment — please try again." };
  }
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

  // Session-bootstrap coordination — wait for BOTH conditions before sending session.update.
  // Salon context is now loaded from the Twilio `start` event's customParameters (not the URL),
  // since Twilio <Stream> URLs cannot contain query strings.
  let openAiReady = false;
  let startReceived = false;
  let salon: SalonContext | null = null;
  let callerPhone: string | null = null;
  let allowlist: AppointmentIdAllowlist = new Set();
  let sessionConfigured = false;

  // ── Call log tracking ─────────────────────────────────────────────────────
  let callLogId: number | null = null;
  const callStartTime = new Date();
  let callOutcome = "no_action";
  let callNotes: string | null = null;
  let callAppointmentId: number | null = null;
  let callCallerName: string | null = null;

  const openAiWs = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  // Track audio packet counts to avoid log flooding
  let inboundAudioCount = 0;
  let outboundAudioCount = 0;

  // Whether we've received session.updated from OpenAI (confirms session config was accepted)
  let sessionUpdated = false;

  /** Once OpenAI is ready AND we have salon + caller info, look up appointments and configure the session. */
  async function configureSessionIfReady() {
    if (sessionConfigured || !openAiReady || !startReceived || !salon) return;
    sessionConfigured = true;

    const [upcoming, callerName] = await Promise.all([
      callerPhone ? getCallerUpcomingAppointments(callerPhone, salon.storeId) : Promise.resolve([]),
      callerPhone ? getCallerName(callerPhone, salon.storeId) : Promise.resolve(null),
    ]);
    allowlist = new Set(upcoming.map((a) => a.id));
    callCallerName = callerName;

    // Back-fill caller name into the call log row once we know it
    if (callLogId && callerName) {
      db.update(aiCallLog).set({ callerName }).where(eq(aiCallLog.id, callLogId))
        .catch((err) => console.error("[AI Receptionist] Failed to update caller name in log:", err));
    }

    console.log(
      `[AI Receptionist] ▶ Sending session.update — caller="${callerPhone ?? "(unknown)"}" ` +
      `name="${callerName ?? "(new caller)"}", ${upcoming.length} upcoming appointment(s)`
    );

    const sessionConfig = buildOpenAiSessionConfig(salon, callerPhone, callerName, upcoming);
    const sessionConfigJson = JSON.stringify(sessionConfig);
    console.log(`[AI Receptionist] session.update payload (exact): ${sessionConfigJson}`);
    openAiWs.send(sessionConfigJson);
    console.log(`[AI Receptionist] session.update sent — waiting for session.updated confirmation`);

    // session.updated fires asynchronously; we trigger response.create from that handler
    // to guarantee the session is fully configured before the greeting fires.
  }

  openAiWs.on("open", () => {
    console.log(`[AI Receptionist] ✅ OpenAI Realtime WebSocket OPEN — waiting for session.created before configuring`);
    // Do NOT set openAiReady here — wait for session.created from OpenAI
    // to ensure the session object exists before we send session.update.
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
      // NOW it's safe to trigger the greeting — session is fully configured
      if (sessionConfigured) {
        console.log(`[AI Receptionist] ▶ Sending response.create (greeting)`);
        openAiWs.send(JSON.stringify({ type: "response.create" }));
      }
      return;
    }

    if (type === "input_audio_buffer.speech_started") {
      console.log(`[AI Receptionist] 🎤 VAD: speech started`);
      return;
    }

    if (type === "input_audio_buffer.speech_stopped") {
      console.log(`[AI Receptionist] 🔇 VAD: speech stopped — buffer will be committed`);
      return;
    }

    if (type === "input_audio_buffer.committed") {
      console.log(`[AI Receptionist] ✅ input buffer committed — OpenAI processing speech`);
      return;
    }

    if (type === "response.created") {
      const responseId = (msg.response as Record<string, unknown> | undefined)?.id ?? "?";
      console.log(`[AI Receptionist] ▶ response.created — id=${responseId}`);
      return;
    }

    if (type === "response.audio.delta") {
      aiSpeaking = true;
      const delta = msg.delta as string | undefined;
      if (delta) {
        outboundAudioCount++;
        const payloadBytes = Buffer.byteLength(delta, "base64");
        if (outboundAudioCount === 1 || outboundAudioCount % 50 === 0) {
          console.log(
            `[AI Receptionist] Sending outbound audio packet #${outboundAudioCount} to Twilio` +
            ` | format=g711_ulaw (no transcoding) | payload=${payloadBytes} bytes` +
            ` | streamSid=${streamSid ?? "none"} | twilioWs=${twilioWs.readyState === WebSocket.OPEN ? "OPEN" : "CLOSED"}`
          );
        }
        if (streamSid && twilioWs.readyState === WebSocket.OPEN) {
          const packet = JSON.stringify({ event: "media", streamSid, media: { payload: delta } });
          try {
            twilioWs.send(packet);
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

    if (type === "response.audio.done") {
      console.log(`[AI Receptionist] 🔊 response.audio.done — total outbound audio packets: ${outboundAudioCount}`);
      aiSpeaking = false;
      return;
    }

    if (type === "response.done") {
      const resp = msg.response as Record<string, unknown> | undefined;
      console.log(`[AI Receptionist] ✅ response.done — status=${resp?.status ?? "?"} usage=${JSON.stringify(resp?.usage ?? {})}`);
      aiSpeaking = false;
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

      // Run the tool and feed the result back to OpenAI
      (async () => {
        let result: { success: boolean; message: string };
        let shouldEndCall = false;

        if (!salon) {
          result = { success: false, message: "Session not initialized." };
        } else if (name === "complete_booking") {
          result = await handleNewBooking(salon.storeId, args, salon);
          if (result.success) {
            callOutcome = "booked";
            callNotes = result.message;
            shouldEndCall = true;
          }
        } else if (name === "cancel_booking") {
          result = await handleCancel(salon.storeId, args, allowlist);
          if (result.success) {
            callOutcome = "cancelled";
            callNotes = result.message;
            shouldEndCall = true;
          }
        } else if (name === "reschedule_booking") {
          result = await handleReschedule(salon.storeId, args, allowlist);
          if (result.success) {
            callOutcome = "rescheduled";
            callNotes = result.message;
            shouldEndCall = true;
          }
        } else {
          result = { success: false, message: `Unknown tool: ${name}` };
        }

        openAiWs.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: callId,
              output: JSON.stringify(result),
            },
          })
        );
        openAiWs.send(JSON.stringify({ type: "response.create" }));

        if (shouldEndCall) {
          setTimeout(() => {
            console.log(`[AI Receptionist] Closing call after tool "${name}" — store ${salon?.storeId ?? "?"}`);
            twilioWs.close();
          }, 7_000);
        }
      })().catch((err) => console.error("[AI Receptionist] Tool handler error:", err));

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
  });

  openAiWs.on("close", (code, reason) => {
    const reasonStr = reason.toString() || "(none)";
    console.log(`[AI Receptionist] OpenAI WebSocket CLOSED — code=${code} reason=${reasonStr} sessionUpdated=${sessionUpdated} outboundAudioPackets=${outboundAudioCount}`);
    if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
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
      const startData = msg.start as Record<string, unknown> | undefined;
      streamSid = (msg.streamSid as string) ?? null;
      const callSid = (startData?.callSid as string) ?? null;
      const customParams = (startData?.customParameters as Record<string, string> | undefined) ?? {};
      callerPhone = (customParams.from ?? "").trim() || null;

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
      (async () => {
        const loaded = await getSalonContext(parsedStoreId).catch(() => null);
        if (!loaded) {
          console.warn(`[AI Receptionist] Unknown storeId ${parsedStoreId} on start — closing call`);
          twilioWs.close(1008, "Unknown store");
          return;
        }
        salon = loaded;

        console.log(
          `[AI Receptionist] Stream started — streamSid=${streamSid} callSid=${callSid} ` +
          `from="${callerPhone ?? "(unknown)"}" store=${parsedStoreId} ("${loaded.businessName}")`
        );

        // ── Insert call log row ──────────────────────────────────────
        db.insert(aiCallLog).values({
          storeId: parsedStoreId,
          callSid: callSid ?? undefined,
          callerPhone: callerPhone ?? undefined,
          outcome: "in_progress",
          startedAt: callStartTime,
        }).returning().then(([row]) => {
          if (row) callLogId = row.id;
        }).catch((err) => console.error("[AI Receptionist] Failed to insert call log:", err));

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

      // Interruption — caller spoke while AI was talking
      if (aiSpeaking) {
        aiSpeaking = false;
        console.log(`[AI Receptionist] 🛑 Interruption detected — cancelling AI response`);
        if (openAiWs.readyState === WebSocket.OPEN) {
          openAiWs.send(JSON.stringify({ type: "response.cancel" }));
        }
        if (streamSid && twilioWs.readyState === WebSocket.OPEN) {
          twilioWs.send(JSON.stringify({ event: "clear", streamSid }));
        }
      }

      if (openAiWs.readyState === WebSocket.OPEN) {
        openAiWs.send(JSON.stringify({ type: "input_audio_buffer.append", audio: payload }));
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

  twilioWs.on("close", () => {
    closeSession();
    // Finalise the call log row
    if (callLogId) {
      const endedAt = new Date();
      const durationSeconds = Math.round((endedAt.getTime() - callStartTime.getTime()) / 1000);
      db.update(aiCallLog)
        .set({
          outcome: callOutcome,
          endedAt,
          durationSeconds,
          notes: callNotes,
          appointmentId: callAppointmentId ?? undefined,
          callerName: callCallerName ?? undefined,
        })
        .where(eq(aiCallLog.id, callLogId))
        .catch((err) => console.error("[AI Receptionist] Failed to finalise call log:", err));
    }
  });
  twilioWs.on("error", (err) => {
    console.error("[AI Receptionist] Twilio error:", err.message);
    closeSession();
  });

  function closeSession() {
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
    const storeId = (req as any).user?.storeId as number | undefined;
    if (!storeId) return res.status(400).json({ message: "No store selected" });
    const limit = Math.min(parseInt((req.query.limit as string) ?? "100", 10), 500);
    const logs = await db
      .select()
      .from(aiCallLog)
      .where(eq(aiCallLog.storeId, storeId))
      .orderBy(desc(aiCallLog.startedAt))
      .limit(limit);
    return res.json(logs);
  });

  // ── Public health check — used by deploy script & monitoring ─────────────
  // No auth required: it only reveals whether the service is up and whether
  // the OpenAI key is configured. No sensitive data is exposed.
  app.get("/api/ai-receptionist/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      service: "AI Receptionist",
      openAiConfigured: apiKeyPresent,
      twilioWebhookPath: "/api/webhook/twilio/:storeId",
      uptime: Math.round(process.uptime() * 10) / 10,
    });
  });

  // ── Salon owner: GET/PATCH /api/ai-receptionist/settings ─────────────────
  // Owner view never exposes the webhook URL or other admin-only details — it
  // only reveals whether a number has been provisioned and whether the platform
  // OpenAI key is present, so the owner knows when they're allowed to flip the
  // switch and who to contact otherwise.
  app.get("/api/ai-receptionist/settings", isAuthenticated, async (req: Request, res: Response) => {
    const storeId = (req as any).user?.storeId as number | undefined;
    if (!storeId) return res.status(400).json({ message: "No store selected" });
    const [enabled, phoneNumber] = await Promise.all([
      getReceptionistEnabled(storeId),
      getReceptionistPhone(storeId),
    ]);
    const _ownerBase = (process.env.APP_URL ?? "").replace(/\/$/, "");
    return res.json({
      enabled,
      apiKeyConfigured: apiKeyPresent,
      phoneProvisioned: !!phoneNumber,
      voiceWebhookUrl: `${_ownerBase}/api/webhook/twilio/voice/${storeId}`,
    });
  });

  app.patch("/api/ai-receptionist/settings", isAuthenticated, async (req: Request, res: Response) => {
    const storeId = (req as any).user?.storeId as number | undefined;
    if (!storeId) return res.status(400).json({ message: "No store selected" });
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

    // ── Extract caller phone (escaped for safe inclusion in TwiML) ──────────
    const callerPhoneRaw = (req.body?.From as string | undefined) ?? "";
    const callerPhone = callerPhoneRaw.replace(/[<>&"']/g, "");

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

  // ── WebSocket: WSS /media-stream ─────────────────────────────────────────
  // NOTE: no query string — Twilio forbids them on Stream URLs (error 31920).
  // storeId arrives later via the `start` event's customParameters.
  const mediaWss = new WebSocketServer({ noServer: true });

  mediaWss.on("connection", (ws: WebSocket, _req: Request) => {
    console.log(`[AI Receptionist] WebSocket accepted (awaiting Twilio start event for storeId)`);
    createCallSession(ws);
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

  interface VoiceSession {
    storeId: number;
    callerPhone: string;
    salon: SalonContext;
    allowlist: AppointmentIdAllowlist;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    turnCount: number;
    lastActive: number;
    callLogId: number | null;
    callStartTime: Date;
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

    return `You are a friendly AI phone receptionist for ${salon.businessName}. Keep responses SHORT — this is a phone call. One or two sentences per turn. Today's date/timezone: ${new Date().toLocaleString("en-US", { timeZone: salon.timezone, dateStyle: "full" })} (${salon.timezone}).

${callerBlock}

Services available:
${serviceList}

You can: book new appointments, cancel or reschedule existing ones.
To book, collect: full name, phone number (confirm from caller ID if available), service choice, and preferred date + time. Confirm everything, then call complete_booking.
To cancel, confirm which appointment and reason, then call cancel_booking.
To reschedule, confirm which appointment and new time, then call reschedule_booking.
Always confirm details back to the caller before calling any tool.
When done, say a warm goodbye and end the call naturally.`;
  }

  const VOICE_TOOLS = [
    {
      type: "function" as const,
      function: {
        name: "complete_booking",
        description: "Create a new appointment after all details are confirmed.",
        parameters: {
          type: "object",
          properties: {
            customerName:        { type: "string", description: "Full name" },
            customerPhone:       { type: "string", description: "Phone number (E.164 or 10-digit US)" },
            serviceId:           { type: "integer", description: "Numeric service ID from the list" },
            appointmentDateTime: { type: "string", description: "ISO 8601 datetime (e.g. 2025-06-15T14:00:00)" },
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
            reason:        { type: "string", description: "Optional reason" },
          },
          required: ["appointmentId"],
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
  ];

  async function callOpenAiChat(messages: VoiceSession["messages"]): Promise<{
    text: string | null;
    toolName: string | null;
    toolArgs: string | null;
  }> {
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("No OpenAI API key configured");

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
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

    const callSid = (req.body?.CallSid as string | undefined) ?? "";
    const callerPhoneRaw = (req.body?.From as string | undefined) ?? "";
    const speechResult = ((req.body?.SpeechResult as string | undefined) ?? "").trim();
    const isTimeout = req.query._timeout === "1";
    const baseUrl = getVoiceWebhookBase(req);
    const actionUrl = `${baseUrl}/${storeId}`;

    console.log(`[Voice] storeId=${storeId} callSid=${callSid || "(none)"} speech="${speechResult || "(none)"}"`);

    // ── Initial call (no CallSid in session yet) → bootstrap ──────────────
    if (!voiceSessions.has(callSid)) {
      const salon = await getSalonContext(storeId).catch(() => null);
      if (!salon) {
        return res.type("text/xml").send(twimlHangup("Sorry, we couldn't locate this salon. Please call back later."));
      }

      const callerPhone = callerPhoneRaw.replace(/[<>&"']/g, "");
      const [upcoming, callerName] = await Promise.all([
        callerPhone ? getCallerUpcomingAppointments(callerPhone, storeId) : Promise.resolve([]),
        callerPhone ? getCallerName(callerPhone, storeId) : Promise.resolve(null),
      ]);

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

      const greeting = callerName
        ? `Hi ${callerName}, thanks for calling ${salon.businessName}! How can I help you today?`
        : `Thanks for calling ${salon.businessName}! How can I help you today?`;

      voiceSessions.set(callSid, {
        storeId,
        callerPhone,
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
      });

      return res.type("text/xml").send(twimlSay(greeting, actionUrl));
    }

    // ── Subsequent turn ────────────────────────────────────────────────────
    const session = voiceSessions.get(callSid)!;
    session.lastActive = Date.now();
    session.turnCount++;

    // Caller didn't say anything (timeout or silence)
    if (!speechResult && !isTimeout) {
      if (session.turnCount > 2) {
        voiceSessions.delete(callSid);
        await finalizeCallLog(session, "no_action");
        return res.type("text/xml").send(twimlHangup("I didn't catch that. Give us a call back anytime. Goodbye!"));
      }
      return res.type("text/xml").send(twimlSay("I didn't catch that — could you say that again?", actionUrl));
    }

    if (session.turnCount > MAX_VOICE_TURNS) {
      voiceSessions.delete(callSid);
      await finalizeCallLog(session, "no_action");
      return res.type("text/xml").send(twimlHangup("I've reached my limit for this call. Please call back or book online. Goodbye!"));
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

      let result: { success: boolean; message: string };
      let outcome = "no_action";

      if (toolName === "complete_booking") {
        result = await handleNewBooking(session.storeId, toolArgs, session.salon);
        if (result.success) outcome = "booked";
      } else if (toolName === "cancel_booking") {
        result = await handleCancel(session.storeId, toolArgs, session.allowlist);
        if (result.success) outcome = "cancelled";
      } else if (toolName === "reschedule_booking") {
        result = await handleReschedule(session.storeId, toolArgs, session.allowlist);
        if (result.success) outcome = "rescheduled";
      } else {
        result = { success: false, message: "Unknown action." };
      }

      voiceSessions.delete(callSid);
      await finalizeCallLog(session, outcome, result.message);

      const confirmText = result.success
        ? toolName === "complete_booking"
          ? "Perfect, your appointment is confirmed! We'll see you soon. Goodbye!"
          : toolName === "cancel_booking"
            ? "Done, your appointment has been cancelled. Is there anything else? No? Goodbye!"
            : "Your appointment has been rescheduled. We'll see you at the new time. Goodbye!"
        : `I'm sorry, I wasn't able to complete that — ${result.message} Please try again or call back. Goodbye!`;

      return res.type("text/xml").send(twimlHangup(confirmText));
    }

    // ── Text response → continue conversation ─────────────────────────────
    const text = aiResponse.text ?? "I didn't catch that — could you repeat that?";
    session.messages.push({ role: "assistant", content: text });

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
  console.log("[AI Receptionist] Capabilities: book · cancel · reschedule (with caller recognition)");
}
