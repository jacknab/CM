/**
 * Twilio Outbound Dialer — Appointment Reminder & Confirmation
 *
 * Flow:
 *  1. POST /api/dialer/trigger  → Find upcoming appointments needing confirmation
 *                                 and initiate an outbound call for each one.
 *  2. Twilio calls the customer and requests TwiML from:
 *     POST /api/dialer/voice    → Initial greeting + Gather (DTMF prompt)
 *  3. Customer presses a key; Twilio posts to:
 *     POST /api/dialer/gather   → Handle response:
 *                                   1 = Confirm   → update status, play thanks
 *                                   2 = Cancel    → update status, play thanks
 *                                   3 = Repeat    → loop back to voice
 *  4. POST /api/dialer/status   → Twilio call-status webhook (logging / fallback SMS)
 *
 * Environment variables required:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 *
 * Optional:
 *   DIALER_API_KEY  → If set, POST /api/dialer/trigger requires X-Dialer-Key header
 *   PUBLIC_BASE_URL → Override for the public-facing URL used in TwiML callbacks
 *                     (falls back to REPLIT_DEV_DOMAIN or HOST)
 */

import { Router, type Request, type Response } from "express";
import Twilio from "twilio";
import { z } from "zod";
import { storage } from "./storage";
import { sendSms } from "./sms";
import { format, addHours, isAfter, isBefore } from "date-fns";
import type { AppointmentWithDetails } from "@shared/schema";

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!accountSid || !authToken || !fromNumber) return null;
  return { client: Twilio(accountSid, authToken), fromNumber };
}

function getBaseUrl(req: Request): string {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const replitDomain = process.env.REPLIT_DEV_DOMAIN;
  if (replitDomain) return `https://${replitDomain}`;
  return `${req.protocol}://${req.get("host")}`;
}

function buildGreeting(appt: AppointmentWithDetails): string {
  const customerName = ((appt.customer as any)?.fullName || appt.customer?.name)?.split(" ")[0] ?? "there";
  const svcName = appt.service?.name ?? "your appointment";
  const storeName = appt.store?.name ?? "us";
  const dateStr = format(new Date(appt.date), "EEEE, MMMM do 'at' h:mm a");
  return (
    `Hello ${customerName}, this is a reminder call from ${storeName}. ` +
    `You have ${svcName} scheduled for ${dateStr}. ` +
    `You can say "confirm", "cancel", or "repeat". ` +
    `Or press 1 to confirm, 2 to cancel, or 3 to hear this again.`
  );
}

/**
 * Resolve a spoken phrase or DTMF digit into one of three intents:
 * "confirm" | "cancel" | "repeat" | "unknown"
 */
function resolveIntent(digits: string, speechResult: string): "confirm" | "cancel" | "repeat" | "unknown" {
  // DTMF takes priority if present
  if (digits === "1") return "confirm";
  if (digits === "2") return "cancel";
  if (digits === "3") return "repeat";

  // Speech intent matching
  const speech = speechResult.toLowerCase().trim();
  if (!speech) return "unknown";

  const confirmWords = ["confirm", "yes", "yeah", "yep", "sure", "ok", "okay", "correct",
    "right", "definitely", "absolutely", "sounds good", "i'll be there", "will be there",
    "i will", "i'm coming", "keep it", "keep the", "confirmed", "that's right"];
  const cancelWords = ["cancel", "no", "nope", "nah", "can't", "cannot", "won't", "not going",
    "not coming", "don't", "decline", "remove", "delete", "i can't", "i won't",
    "i'm not", "unable", "cancel it", "please cancel"];
  const repeatWords = ["repeat", "again", "what", "pardon", "sorry", "huh", "didn't hear",
    "say again", "come again", "one more time", "repeat that"];

  if (confirmWords.some((w) => speech.includes(w))) return "confirm";
  if (cancelWords.some((w) => speech.includes(w))) return "cancel";
  if (repeatWords.some((w) => speech.includes(w))) return "repeat";

  return "unknown";
}

function dialerAuth(req: Request, res: Response, next: () => void) {
  const apiKey = process.env.DIALER_API_KEY;
  if (!apiKey) return next();
  const provided = req.headers["x-dialer-key"];
  if (provided !== apiKey) {
    return res.status(401).json({ error: "Unauthorized: invalid or missing X-Dialer-Key header" });
  }
  next();
}

// In-memory call log (keyed by Twilio CallSid → appointmentId)
// In production you'd persist this; for now it's held in memory per process.
const callRegistry = new Map<string, { appointmentId: number; storeId: number; customerId?: number }>();

// ---------------------------------------------------------------------------
// POST /api/dialer/trigger
// Body (all optional):
//   storeId?       – limit to a single store
//   hoursAhead?    – how many hours ahead to look (default 24)
//   dryRun?        – if true, return what would be called but don't dial
//
// Finds pending/unconfirmed appointments within the window and dials the
// customer for each one.  Protected by X-Dialer-Key if DIALER_API_KEY is set.
// ---------------------------------------------------------------------------
router.post("/trigger", dialerAuth, async (req: Request, res: Response) => {
  const schema = z.object({
    storeId: z.number().int().positive().optional(),
    hoursAhead: z.number().int().min(1).max(168).default(24),
    dryRun: z.boolean().default(false),
  });

  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten().fieldErrors });

  const { storeId, hoursAhead, dryRun } = parse.data;

  const twilio = getTwilioClient();
  if (!twilio && !dryRun) {
    return res.status(503).json({ error: "Twilio is not configured (check TWILIO_* environment variables)" });
  }

  try {
    const now = new Date();
    const windowEnd = addHours(now, hoursAhead);

    const allAppts = await storage.getAppointments({
      from: now,
      to: windowEnd,
      ...(storeId ? { storeId } : {}),
    });

    const eligible = allAppts.filter(
      (a) =>
        a.status !== "cancelled" &&
        a.status !== "completed" &&
        a.status !== "confirmed" &&
        a.customer?.phone &&
        isAfter(new Date(a.date), now) &&
        isBefore(new Date(a.date), windowEnd)
    );

    if (eligible.length === 0) {
      return res.json({ message: "No eligible appointments found in window", called: [] });
    }

    const results: { appointmentId: number; customer: string; phone: string; callSid?: string; status: string }[] = [];
    const baseUrl = getBaseUrl(req);

    for (const appt of eligible) {
      const phone = appt.customer!.phone!;
      const customerName = (appt.customer as any)?.fullName ?? appt.customer?.name ?? "Customer";

      if (dryRun) {
        results.push({ appointmentId: appt.id, customer: customerName, phone, status: "dry_run" });
        continue;
      }

      try {
        const call = await twilio!.client.calls.create({
          to: phone,
          from: twilio!.fromNumber,
          url: `${baseUrl}/api/dialer/voice?appointmentId=${appt.id}`,
          statusCallback: `${baseUrl}/api/dialer/status`,
          statusCallbackMethod: "POST",
          statusCallbackEvent: ["completed", "no-answer", "busy", "failed"],
          timeout: 30,
          machineDetection: "Enable",
          machineDetectionTimeout: 5,
        });

        callRegistry.set(call.sid, {
          appointmentId: appt.id,
          storeId: appt.storeId!,
          customerId: appt.customerId ?? undefined,
        });

        results.push({ appointmentId: appt.id, customer: customerName, phone, callSid: call.sid, status: "dialing" });
      } catch (callErr: any) {
        results.push({ appointmentId: appt.id, customer: customerName, phone, status: `error: ${callErr?.message}` });
      }
    }

    return res.json({ message: `Dialer triggered for ${results.length} appointment(s)`, called: results });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Dialer trigger failed" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/dialer/voice
// Query: appointmentId
//
// TwiML: greet the customer and gather a DTMF response.
// Called by Twilio when the customer picks up.
// ---------------------------------------------------------------------------
router.post("/voice", async (req: Request, res: Response) => {
  const appointmentId = parseInt((req.query.appointmentId as string) ?? "0");
  const baseUrl = getBaseUrl(req);

  res.setHeader("Content-Type", "text/xml");

  const twiml = new Twilio.twiml.VoiceResponse();

  // Answering machine / voicemail detection
  const answeredBy: string = (req.body?.AnsweredBy ?? "").toLowerCase();
  if (answeredBy.includes("machine") || answeredBy.includes("fax")) {
    twiml.say(
      { voice: "Polly.Joanna", language: "en-US" },
      "Hello, this is an automated reminder about your upcoming appointment. Please call us back or visit our website to confirm or reschedule. Thank you."
    );
    twiml.hangup();
    return res.send(twiml.toString());
  }

  if (!appointmentId) {
    twiml.say({ voice: "Polly.Joanna", language: "en-US" }, "Sorry, we could not find your appointment. Please contact us directly. Goodbye.");
    twiml.hangup();
    return res.send(twiml.toString());
  }

  try {
    const appt = await storage.getAppointment(appointmentId);
    if (!appt) {
      twiml.say({ voice: "Polly.Joanna", language: "en-US" }, "Sorry, we could not locate your appointment. Please contact us directly. Goodbye.");
      twiml.hangup();
      return res.send(twiml.toString());
    }

    const greeting = buildGreeting(appt);
    const gather = twiml.gather({
      input: ["speech", "dtmf"] as any,
      numDigits: 1 as any,
      action: `${baseUrl}/api/dialer/gather?appointmentId=${appointmentId}`,
      method: "POST",
      timeout: 5,
      speechTimeout: "auto",
      speechModel: "phone_call",
      hints: "confirm, yes, cancel, no, repeat, again",
      language: "en-US",
    });
    gather.say({ voice: "Polly.Joanna", language: "en-US" }, greeting);

    twiml.say({ voice: "Polly.Joanna", language: "en-US" }, "We did not receive your response. Please call us back to confirm or cancel your appointment. Goodbye.");
    twiml.hangup();
  } catch {
    twiml.say({ voice: "Polly.Joanna", language: "en-US" }, "An error occurred. Please contact us directly. Goodbye.");
    twiml.hangup();
  }

  return res.send(twiml.toString());
});

// ---------------------------------------------------------------------------
// POST /api/dialer/gather
// Query: appointmentId
// Body: Digits (DTMF) and/or SpeechResult (spoken words) from Twilio Gather
//
// Handles the customer's spoken response or key press.
//   "confirm" / "yes" / 1 → confirm appointment
//   "cancel"  / "no"  / 2 → cancel appointment
//   "repeat"  / "again"/ 3 → repeat message
// ---------------------------------------------------------------------------
router.post("/gather", async (req: Request, res: Response) => {
  const appointmentId = parseInt((req.query.appointmentId as string) ?? "0");
  const digits: string = req.body?.Digits ?? "";
  const speechResult: string = req.body?.SpeechResult ?? "";
  const baseUrl = getBaseUrl(req);

  res.setHeader("Content-Type", "text/xml");
  const twiml = new Twilio.twiml.VoiceResponse();

  if (!appointmentId) {
    twiml.say({ voice: "Polly.Joanna", language: "en-US" }, "Sorry, we could not find your appointment. Goodbye.");
    twiml.hangup();
    return res.send(twiml.toString());
  }

  const intent = resolveIntent(digits, speechResult);

  // Helper: build a repeat Gather with speech + DTMF
  function buildRepeatGather(prompt: string) {
    const g = twiml.gather({
      input: ["speech", "dtmf"] as any,
      numDigits: 1 as any,
      action: `${baseUrl}/api/dialer/gather?appointmentId=${appointmentId}`,
      method: "POST",
      timeout: 5,
      speechTimeout: "auto",
      speechModel: "phone_call",
      hints: "confirm, yes, cancel, no, repeat, again",
      language: "en-US",
    });
    g.say({ voice: "Polly.Joanna", language: "en-US" }, prompt);
  }

  try {
    const appt = await storage.getAppointment(appointmentId);
    if (!appt) {
      twiml.say({ voice: "Polly.Joanna", language: "en-US" }, "We could not find your appointment. Please contact us directly. Goodbye.");
      twiml.hangup();
      return res.send(twiml.toString());
    }

    const storeName = appt.store?.name ?? "us";
    const svcName = appt.service?.name ?? "your appointment";
    const dateStr = format(new Date(appt.date), "EEEE, MMMM do 'at' h:mm a");

    if (intent === "confirm") {
      await storage.updateAppointment(appointmentId, { status: "confirmed" });

      if (appt.customer?.phone && appt.storeId) {
        const smsBody = `✅ Your ${svcName} on ${dateStr} is confirmed. See you soon! Reply STOP to opt out.`;
        await sendSms(appt.storeId, appt.customer.phone, smsBody, "dialer_confirm", appointmentId, appt.customerId ?? undefined).catch(() => null);
      }

      twiml.say(
        { voice: "Polly.Joanna", language: "en-US" },
        `Perfect! Your ${svcName} on ${dateStr} is confirmed. We look forward to seeing you. You will also receive a text message confirmation. Goodbye.`
      );
      twiml.hangup();

    } else if (intent === "cancel") {
      await storage.updateAppointment(appointmentId, {
        status: "cancelled",
        cancellationReason: "Cancelled by customer via automated reminder call",
      });

      if (appt.customer?.phone && appt.storeId) {
        const storePhone = appt.store?.phone ? ` Call us at ${appt.store.phone} to rebook.` : "";
        const smsBody = `❌ Your ${svcName} on ${dateStr} has been cancelled.${storePhone} Reply STOP to opt out.`;
        await sendSms(appt.storeId, appt.customer.phone, smsBody, "dialer_cancel", appointmentId, appt.customerId ?? undefined).catch(() => null);
      }

      twiml.say(
        { voice: "Polly.Joanna", language: "en-US" },
        `Your appointment has been cancelled. If you would like to rebook, please contact ${storeName} directly. Thank you. Goodbye.`
      );
      twiml.hangup();

    } else if (intent === "repeat") {
      buildRepeatGather(buildGreeting(appt));
      twiml.say({ voice: "Polly.Joanna", language: "en-US" }, "We did not receive your response. Please call us back. Goodbye.");
      twiml.hangup();

    } else {
      // Unknown — re-prompt once with a simpler ask
      buildRepeatGather(
        `Sorry, I didn't catch that. Please say "confirm" to keep your ${svcName}, ` +
        `or say "cancel" to cancel it. You can also press 1 to confirm or 2 to cancel.`
      );
      twiml.say({ voice: "Polly.Joanna", language: "en-US" }, "We did not receive your response. Please call us back. Goodbye.");
      twiml.hangup();
    }
  } catch (err: any) {
    twiml.say({ voice: "Polly.Joanna", language: "en-US" }, "An error occurred. Please contact us directly. Goodbye.");
    twiml.hangup();
  }

  return res.send(twiml.toString());
});

// ---------------------------------------------------------------------------
// POST /api/dialer/status
// Twilio call-status webhook (completed, no-answer, busy, failed).
// Sends a fallback SMS when the call was not answered.
// ---------------------------------------------------------------------------
router.post("/status", async (req: Request, res: Response) => {
  const callSid: string = req.body?.CallSid ?? "";
  const callStatus: string = (req.body?.CallStatus ?? "").toLowerCase();

  const entry = callRegistry.get(callSid);

  if (entry && (callStatus === "no-answer" || callStatus === "busy" || callStatus === "failed")) {
    try {
      const appt = await storage.getAppointment(entry.appointmentId);
      if (appt?.customer?.phone && entry.storeId) {
        const dateStr = format(new Date(appt.date), "EEEE, MMMM do 'at' h:mm a");
        const svcName = appt.service?.name ?? "your appointment";
        const storePhone = appt.store?.phone ? ` Call us at ${appt.store.phone} to confirm or cancel.` : "";
        const body = `📞 We tried to reach you about your ${svcName} on ${dateStr}.${storePhone} Reply STOP to opt out.`;
        await sendSms(entry.storeId, appt.customer.phone, body, "dialer_missed_call", entry.appointmentId, entry.customerId).catch(() => null);
      }
    } catch {
      // non-fatal
    }
  }

  if (callSid) callRegistry.delete(callSid);

  return res.status(204).send();
});

// ---------------------------------------------------------------------------
// GET /api/dialer/pending
// Query: storeId?, hoursAhead? (default 24)
//
// Preview which appointments the dialer would call — no calls are made.
// ---------------------------------------------------------------------------
router.get("/pending", dialerAuth, async (req: Request, res: Response) => {
  const schema = z.object({
    storeId: z.coerce.number().int().positive().optional(),
    hoursAhead: z.coerce.number().int().min(1).max(168).default(24),
  });

  const parse = schema.safeParse(req.query);
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten().fieldErrors });

  const { storeId, hoursAhead } = parse.data;

  const now = new Date();
  const windowEnd = addHours(now, hoursAhead);

  try {
    const allAppts = await storage.getAppointments({
      from: now,
      to: windowEnd,
      ...(storeId ? { storeId } : {}),
    });

    const eligible = allAppts.filter(
      (a) =>
        a.status !== "cancelled" &&
        a.status !== "completed" &&
        a.status !== "confirmed" &&
        a.customer?.phone &&
        isAfter(new Date(a.date), now)
    );

    return res.json({
      windowHours: hoursAhead,
      count: eligible.length,
      appointments: eligible.map((a) => ({
        id: a.id,
        date: a.date,
        dateFormatted: format(new Date(a.date), "EEEE, MMMM d 'at' h:mm a"),
        status: a.status,
        customer: { name: (a.customer as any)?.fullName || a.customer?.name, phone: a.customer?.phone },
        service: a.service?.name,
        store: a.store?.name,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message ?? "Failed to fetch pending appointments" });
  }
});

export default router;
