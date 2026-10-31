/**
 * Tom — Certxa's inbound sales phone agent (owner, 2026-10-31).
 *
 * A copy of the support line's setup, built on Autumn's current voice stack (OpenAI Live, gpt-live-1, with a
 * Responses backend for tools), selling Certxa to salon owners who call (888) 814-7623.
 *
 *   Inbound call → Twilio → POST /api/webhook/twilio/sales (signed)
 *     → TwiML <Connect><Stream url="wss://…/support-agent-stream-sales/<one-time pass>">
 *     → this module bridges Twilio audio ↔ OpenAI Live (audio/pcmu 8 kHz both ways, no conversion)
 *
 * The stream address starts with /support-agent-stream so nginx's existing WebSocket block for the support line
 * carries it (prefix match) — no nginx change. Only Twilio, for a call our signed webhook answered, can open it.
 *
 * What Tom does: answers questions about Certxa from the sales fact sheet (knowledge-base-sales/) and the live
 * plans and prices; saves interested callers as leads (sales_leads, isTeam → Sales Leads); texts the free-trial
 * sign-up link; ends the call. He never transfers calls or promises a call back.
 *
 * Cost limits: 10 minutes per call, hangs up after 60 s of silence, 3 calls at once, 300 minutes a day
 * (SALES_AGENT_MAX_CONCURRENT / SALES_AGENT_DAILY_MINUTES).
 */
import type { Express, Request, Response } from "express";
import type { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import twilio from "twilio";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { formatInTimeZone } from "date-fns-tz";
import { pool } from "../db";
import { sendTwilioSms } from "../sms";
import { issueStreamPass, redeemStreamPass, passFromPath } from "../lib/streamPass";
import { requireSupportAuth } from "../lib/supportAuth";

const LOG = "[Sales Agent]";
const AGENT_NAME = "Tom";
const VOICE = process.env.SALES_AGENT_VOICE || "cedar"; // male
const LIVE_URL = "wss://api.openai.com/v1/live/sessions";
const BACKEND_MODEL = process.env.SALES_AGENT_BACKEND_MODEL || process.env.AI_RECEPTIONIST_BACKEND_MODEL || "gpt-5.6-luna";
const STREAM_BASE = "/support-agent-stream-sales";
const MAX_CALL_MS = 10 * 60_000;
const SILENCE_HANGUP_MS = 60_000;
const MAX_CONCURRENT = Number(process.env.SALES_AGENT_MAX_CONCURRENT || 3);
const DAILY_MINUTES = Number(process.env.SALES_AGENT_DAILY_MINUTES || 300);
const SIGNUP_URL = "https://certxa.com/auth?mode=register&ref=phone";
const FRAME_BYTES = 160; // 20 ms of 8 kHz μ-law
const AI_SPEAKING_IDLE_MS = 700;
const INTERRUPT_FRAMES = 5; // ~100 ms of caller speech while Tom talks → stop Tom

// ─── Helpers ────────────────────────────────────────────────────────────────

function apiRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return here.includes("/src") ? join(here, "..", "..") : join(here, "..");
}

let factSheet = "";
try {
  factSheet = readFileSync(join(apiRoot(), "knowledge-base-sales", "certxa-sales.md"), "utf-8");
} catch (err) {
  console.error(`${LOG} could not load the sales fact sheet:`, (err as Error).message);
}

function publicAppUrl(): string | null {
  const url = process.env.APP_URL || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "");
  return url ? url.replace(/\/$/, "") : null;
}

function validTwilio(req: Request, appUrl: string): boolean {
  const token = String(process.env.TWILIO_AUTH_TOKEN ?? "").trim();
  if (!token) return process.env.NODE_ENV !== "production";
  const signature = String(req.headers["x-twilio-signature"] ?? "").trim();
  if (!signature) return false;
  return twilio.validateRequest(token, signature, `${appUrl}${req.originalUrl}`, req.body ?? {});
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tenDigit = (raw: string) => { const d = raw.replace(/\D/g, ""); return d.length === 11 && d.startsWith("1") ? d.slice(1) : d.length === 10 ? d : null; };

function muLawToLinear(u: number): number {
  u = ~u & 0xff;
  const sign = u & 0x80, exponent = (u >> 4) & 0x07, mantissa = u & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  return sign ? -sample : sample;
}
/** The same test Autumn uses: sustained speech energy plus a real peak (ignores clicks and line noise). */
function callerSpeaking(base64: string): boolean {
  const buf = Buffer.from(base64, "base64");
  let sum = 0, peak = 0, n = 0;
  for (let i = 0; i < buf.length; i += 4) { const a = Math.abs(muLawToLinear(buf[i])); sum += a; if (a > peak) peak = a; n++; }
  return n > 0 && sum / n > 650 && peak > 2200;
}

/** Current plans and prices, the same list the pricing page shows (loopback to our own public endpoint). */
async function livePlans(): Promise<string> {
  try {
    const port = process.env.PORT || "9200";
    const res = await fetch(`http://127.0.0.1:${port}/api/public/pricing-plans`, { signal: AbortSignal.timeout(3000) });
    const plans = (await res.json()) as any[];
    return plans.map((p) => {
      const monthly = Number(p.priceMonthly) / 100;
      const yearly = Number(p.priceYearly) / 100;
      const price = monthly > 0 ? `$${monthly} a month (or $${yearly} a year)` : "free";
      const feats = (p.features ?? []).map((f: any) => `${f.featureName}${f.limitValue != null ? `: ${f.limitValue}` : ""}`).join(", ");
      return `- ${p.name}: ${price}. ${p.description ?? ""} Includes: ${feats}.`;
    }).join("\n");
  } catch (err) {
    console.warn(`${LOG} live plans unavailable:`, (err as Error).message);
    return "- Solo: free. - Starter: $29 a month. - Professional: $99 a month. - Enterprise: $179 a month.";
  }
}

// ─── Limits (shared across pm2 workers through the call log) ──────────────────

async function overLimits(): Promise<string | null> {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE ended_at IS NULL AND started_at > now() - interval '15 minutes')::int AS live,
              COALESCE(SUM(duration_seconds) FILTER (WHERE started_at::date = now()::date), 0)::int AS seconds_today
         FROM sales_call_logs WHERE started_at > now() - interval '2 days'`,
    );
    if ((rows[0]?.live ?? 0) >= MAX_CONCURRENT) return "busy";
    if ((rows[0]?.seconds_today ?? 0) >= DAILY_MINUTES * 60) return "daily";
  } catch { /* a failed check never blocks a sales call */ }
  return null;
}

// ─── Tools (the Responses backend calls these; results go back as function_call_output) ──

const TOOLS = [
  {
    type: "function",
    name: "save_lead",
    description: "Save or update this caller as a sales lead. Call it as soon as you know the caller's name or business, and again whenever you learn more. Only pass what the caller actually said.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Caller's name." },
        businessName: { type: "string", description: "Salon or business name." },
        businessType: { type: "string", description: "Nail salon, hair salon, barbershop, spa, massage, other." },
        teamSize: { type: "string", description: "How many staff or chairs, as the caller said it." },
        city: { type: "string", description: "City and state." },
        email: { type: "string", description: "E-mail address, spelled back and confirmed." },
        phone: { type: "string", description: "Best phone number if different from the number they are calling from." },
        currentSoftware: { type: "string", description: "What they use today, if anything." },
        interestedPlan: { type: "string", description: "Plan they are interested in, if any." },
        notes: { type: "string", description: "Short notes: what they care about, questions, objections, timing." },
      },
      required: [],
    },
  },
  {
    type: "function",
    name: "send_trial_link",
    description: "Text the free-trial sign-up link to the caller. Only after the caller says yes to receiving it. Sends once per call.",
    parameters: {
      type: "object",
      properties: { phone: { type: "string", description: "Number to text, only if the caller gives a different one from the number they are calling from." } },
      required: [],
    },
  },
  {
    type: "function",
    name: "end_call",
    description: "Hang up, after you have said goodbye and the caller has nothing else.",
    parameters: { type: "object", properties: {}, required: [] },
  },
];

// ─── One call ─────────────────────────────────────────────────────────────────

function runSalesCall(twilioWs: WebSocket): void {
  let streamSid: string | null = null;
  let callSid: string | null = null;
  let callerPhone: string | null = null;
  let callLogId: number | null = null;
  let leadId: number | null = null;
  let trialSent = false;
  let openAi: WebSocket | null = null;
  let started = false;
  let closed = false;
  const startedAt = Date.now();
  let lastCallerVoice = Date.now();
  let aiSpeaking = false;
  let aiIdleTimer: ReturnType<typeof setTimeout> | null = null;
  let interruptStreak = 0;
  const outQueue: string[] = [];
  let pacer: ReturnType<typeof setInterval> | null = null;
  const transcript: { role: "caller" | "tom"; text: string; at: string }[] = [];
  let callerText = "";
  let tomText = "";

  const flush = (who: "caller" | "tom") => {
    const text = (who === "caller" ? callerText : tomText).trim();
    if (text) transcript.push({ role: who, text, at: new Date().toISOString() });
    if (who === "caller") callerText = ""; else tomText = "";
  };

  const startPacer = () => {
    if (pacer) return;
    pacer = setInterval(() => {
      const frame = outQueue.shift();
      if (!frame) { clearInterval(pacer!); pacer = null; return; }
      if (streamSid && twilioWs.readyState === WebSocket.OPEN) {
        twilioWs.send(JSON.stringify({ event: "media", streamSid, media: { payload: frame } }));
      }
    }, 20);
  };

  const maxTimer = setTimeout(() => finish("max_duration"), MAX_CALL_MS);
  const silenceTimer = setInterval(() => {
    if (Date.now() - lastCallerVoice > SILENCE_HANGUP_MS) finish("silence");
  }, 5_000);

  function finish(outcome: string): void {
    if (closed) return;
    closed = true;
    clearTimeout(maxTimer);
    clearInterval(silenceTimer);
    if (pacer) clearInterval(pacer);
    flush("caller"); flush("tom");
    try { openAi?.close(); } catch { /* ignore */ }
    try { twilioWs.close(); } catch { /* ignore */ }
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    const finalOutcome = leadId ? (trialSent ? "trial_link_sent" : "lead_saved") : outcome;
    console.log(`${LOG} call ended (${outcome}) after ${seconds}s, lead=${leadId ?? "none"}, trial link ${trialSent ? "sent" : "not sent"}`);
    if (callLogId) {
      pool.query(
        `UPDATE sales_call_logs SET ended_at = now(), duration_seconds = $2, outcome = $3, transcript = $4::jsonb, lead_id = $5 WHERE id = $1`,
        [callLogId, seconds, finalOutcome, JSON.stringify(transcript), leadId],
      ).then(() => summarize(callLogId!, transcript)).catch((e) => console.error(`${LOG} call log update failed:`, e.message));
    }
  }

  // ── Tools ──
  async function runTool(name: string, args: any): Promise<Record<string, unknown>> {
    if (name === "save_lead") {
      const fields: Record<string, string | null> = {
        name: args.name, business_name: args.businessName, business_type: args.businessType, team_size: args.teamSize,
        city: args.city, email: args.email, phone: args.phone ? (tenDigit(args.phone) ?? args.phone) : null,
        current_software: args.currentSoftware, interested_plan: args.interestedPlan, notes: args.notes,
      };
      const clean = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : null]));
      if (!leadId) {
        const r = await pool.query(
          `INSERT INTO sales_leads (name, business_name, phone, email, business_type, team_size, city, current_software, interested_plan, notes, call_log_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
          [clean.name, clean.business_name, clean.phone ?? callerPhone, clean.email, clean.business_type, clean.team_size, clean.city,
           clean.current_software, clean.interested_plan, clean.notes, callLogId],
        );
        leadId = r.rows[0].id;
      } else {
        await pool.query(
          `UPDATE sales_leads SET name = COALESCE($2, name), business_name = COALESCE($3, business_name), phone = COALESCE($4, phone),
              email = COALESCE($5, email), business_type = COALESCE($6, business_type), team_size = COALESCE($7, team_size),
              city = COALESCE($8, city), current_software = COALESCE($9, current_software), interested_plan = COALESCE($10, interested_plan),
              notes = CASE WHEN $11::text IS NULL THEN notes WHEN notes IS NULL THEN $11 ELSE notes || ' | ' || $11 END, updated_at = now()
            WHERE id = $1`,
          [leadId, clean.name, clean.business_name, clean.phone, clean.email, clean.business_type, clean.team_size, clean.city,
           clean.current_software, clean.interested_plan, clean.notes],
        );
      }
      return { success: true, message: "Saved." };
    }
    if (name === "send_trial_link") {
      if (trialSent) return { success: true, message: "Already texted on this call." };
      const to = args.phone ? (tenDigit(args.phone) ?? args.phone) : callerPhone;
      if (!to) return { success: false, message: "No phone number to text. Ask for one." };
      const sms = await sendTwilioSms(to, `Thanks for calling Certxa! Start your free trial here (no credit card needed): ${SIGNUP_URL}`);
      if (!sms.success) return { success: false, message: "The text could not be sent. Tell them they can sign up at certxa.com." };
      trialSent = true;
      if (!leadId) {
        const r = await pool.query(`INSERT INTO sales_leads (phone, trial_link_sent_at, call_log_id) VALUES ($1, now(), $2) RETURNING id`, [to, callLogId]);
        leadId = r.rows[0].id;
      } else {
        await pool.query(`UPDATE sales_leads SET trial_link_sent_at = now(), updated_at = now() WHERE id = $1`, [leadId]);
      }
      return { success: true, message: "Texted." };
    }
    if (name === "end_call") {
      setTimeout(() => finish("ended_by_tom"), 3_500); // let the goodbye finish playing
      return { success: true, message: "Hanging up." };
    }
    return { success: false, message: `Unknown tool ${name}` };
  }

  // ── OpenAI Live ──
  async function openLive(): Promise<void> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) { console.error(`${LOG} OPENAI_API_KEY is missing`); finish("no_ai_key"); return; }
    const plans = await livePlans();
    const now = formatInTimeZone(new Date(), "America/Phoenix", "EEEE, MMMM d");

    const voiceInstructions = `You are ${AGENT_NAME}, a friendly, knowledgeable sales specialist at Certxa, answering the phone for people interested in Certxa salon software. You are an AI — if someone asks, say so plainly.
Speak naturally, one or two short sentences at a time, warm and confident, never pushy. Use plain words. English by default — only switch if the caller asks or speaks another language.
Your goals, in order: understand their salon (type, team size, what they use today and what bothers them about it), answer their questions honestly from the facts below, and get them started on the free trial.
Ask one question at a time. Listen more than you talk. Relate features to what they told you.
Facts — your ONLY source for prices, plans, features and policies. Never state a price, feature, number or promise that is not written here. If you don't know, say you're not sure and that it's on certxa.com, or that the team can follow up by e-mail.
CURRENT PLANS AND PRICES:
${plans}
${factSheet}
Today is ${now}.
Never offer discounts, custom prices, contracts or deals. Never promise a feature that is not listed. Never say you will transfer the call or that someone will call them back. Don't talk about competitors by name; focus on Certxa.
Your backend does three things, and you must hand them to it:
- Every time the caller tells you their name, salon name, salon type, team size, city, e-mail, what software they use, or which plan interests them, hand those details to the backend to save as a lead — right away, in the same turn, while you keep talking.
- When the caller agrees to have the free-trial sign-up link texted to them, hand that to the backend to send.
- After you say goodbye and the caller is done, hand off ending the call.
Backend work is silent: never say "let me check", "I'll save that" or narrate tools. When a result arrives, carry on naturally.`;

    const backendInstructions = `You handle the actions for ${AGENT_NAME}, Certxa's sales phone agent.
- save_lead: as soon as the caller gives a name or business name, save the lead, and save again when you learn more (business type, team size, city, e-mail, current software, plan interest, short notes about needs and objections). Pass only what the caller said. Confirm e-mail spelling before saving it.
- send_trial_link: when the caller wants to try Certxa, ask if they'd like the sign-up link texted to this number, and only send after they say yes. It sends once per call.
- end_call: only after a goodbye, when the caller is done.
The caller's number is ${callerPhone ?? "unknown"}.`;

    openAi = new WebSocket(LIVE_URL, { headers: { Authorization: `Bearer ${key}` } });
    openAi.on("open", () => {
      openAi!.send(JSON.stringify({
        type: "session.start",
        session: {
          model: "gpt-live-1",
          instructions: voiceInstructions,
          audio: { format: { type: "audio/pcmu", rate: 8000 }, output: { voice: VOICE } },
          delegation: { type: "responses", responses: { model: BACKEND_MODEL, instructions: backendInstructions, tools: TOOLS, tool_choice: "auto" } },
        },
      }));
      setTimeout(() => { if (!started) { console.error(`${LOG} session.started timed out`); finish("ai_timeout"); } }, 8_000);
    });

    openAi.on("message", (raw: Buffer | string) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      const type = msg.type as string;

      if (type === "session.started") {
        started = true;
        openAi!.send(JSON.stringify({
          type: "session.instructions.append",
          delegation_id: null,
          content: `Speak first, right now. Say exactly: "Thanks for calling Certxa, this is ${AGENT_NAME}. Are you looking at Certxa for your salon?" Then stop and listen.`,
        }));
        return;
      }
      if (type === "session.input_transcript.delta") {
        if (tomText) flush("tom");
        callerText += msg.delta ?? "";
        return;
      }
      if (type === "session.output_transcript.delta") {
        if (callerText) flush("caller");
        tomText += msg.delta ?? "";
        return;
      }
      if (type === "session.output_audio.delta") {
        aiSpeaking = true;
        if (aiIdleTimer) clearTimeout(aiIdleTimer);
        aiIdleTimer = setTimeout(() => { aiSpeaking = false; }, AI_SPEAKING_IDLE_MS);
        if (msg.delta && streamSid) {
          const ulaw = Buffer.from(msg.delta, "base64");
          for (let i = 0; i < ulaw.length; i += FRAME_BYTES) outQueue.push(ulaw.subarray(i, i + FRAME_BYTES).toString("base64"));
          startPacer();
        }
        return;
      }
      if (type === "response.event") {
        const nested = msg.event;
        if (nested?.type !== "response.output_item.done" || nested?.item?.type !== "function_call") return;
        const { name, call_id: callId, arguments: argText } = nested.item;
        let args: any = {};
        try { args = JSON.parse(argText || "{}"); } catch { /* empty */ }
        console.log(`${LOG} tool ${name}`);
        runTool(name, args)
          .catch((e) => { console.error(`${LOG} tool ${name} failed:`, e.message); return { success: false, message: "Something went wrong." }; })
          .then((result) => {
            if (!openAi || openAi.readyState !== WebSocket.OPEN) return;
            openAi.send(JSON.stringify({ type: "response.item.create", item: { type: "function_call_output", call_id: callId, output: JSON.stringify(result) } }));
            openAi.send(JSON.stringify({ type: "response.create" }));
          });
        return;
      }
      if (type === "error") console.error(`${LOG} OpenAI error:`, msg.error?.message ?? JSON.stringify(msg));
    });
    openAi.on("close", () => finish("ai_closed"));
    openAi.on("error", (e) => console.error(`${LOG} OpenAI socket error:`, e.message));
  }

  // ── Twilio media stream ──
  twilioWs.on("message", (raw: Buffer | string) => {
    let msg: any;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.event === "start") {
      streamSid = msg.start?.streamSid ?? null;
      callSid = msg.start?.callSid ?? null;
      const from = String(msg.start?.customParameters?.from ?? "");
      callerPhone = tenDigit(from) ?? (from || null);
      pool.query(`INSERT INTO sales_call_logs (call_sid, caller_phone) VALUES ($1, $2) RETURNING id`, [callSid, callerPhone])
        .then((r) => { callLogId = r.rows[0].id; })
        .catch((e) => console.error(`${LOG} call log insert failed:`, e.message));
      console.log(`${LOG} call started from ${callerPhone ?? "unknown"}`);
      openLive().catch((e) => { console.error(`${LOG} could not start the AI:`, e.message); finish("ai_error"); });
      return;
    }
    if (msg.event === "media") {
      const payload = msg.media?.payload as string | undefined;
      if (!payload) return;
      const voiced = callerSpeaking(payload);
      if (voiced) lastCallerVoice = Date.now();
      if (aiSpeaking && voiced) {
        if (++interruptStreak >= INTERRUPT_FRAMES) {
          interruptStreak = 0;
          aiSpeaking = false;
          outQueue.length = 0;
          if (streamSid) twilioWs.send(JSON.stringify({ event: "clear", streamSid }));
        }
      } else interruptStreak = 0;
      if (started && openAi?.readyState === WebSocket.OPEN) {
        openAi.send(JSON.stringify({ type: "session.input_audio.append", audio: payload }));
      }
      return;
    }
    if (msg.event === "stop") finish("caller_hung_up");
  });
  twilioWs.on("close", () => finish("caller_hung_up"));
  twilioWs.on("error", (e) => console.error(`${LOG} Twilio socket error:`, e.message));
}

/** A one-line summary of the call for the back office (cheap model, after the call). */
async function summarize(callLogId: number, transcript: { role: string; text: string }[]): Promise<void> {
  if (transcript.length < 2 || !process.env.OPENAI_API_KEY) return;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 120,
        messages: [
          { role: "system", content: "Summarize this sales call to Certxa (salon software) in one or two plain sentences: who called, their salon, what they wanted, and how it ended." },
          { role: "user", content: transcript.map((t) => `${t.role === "tom" ? "Tom" : "Caller"}: ${t.text}`).join("\n").slice(0, 12_000) },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const data: any = await res.json();
    const summary = data?.choices?.[0]?.message?.content?.trim();
    if (summary) await pool.query(`UPDATE sales_call_logs SET summary = $2 WHERE id = $1`, [callLogId, summary.slice(0, 1000)]);
  } catch (e) {
    console.warn(`${LOG} summary failed:`, (e as Error).message);
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export function setupSalesAgentRoutes(httpServer: HttpServer, app: Express): void {
  app.post("/api/webhook/twilio/sales", async (req: Request, res: Response) => {
    const appUrl = publicAppUrl();
    const sayAndHangUp = (text: string) =>
      res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Matthew">${xml(text)}</Say><Hangup/></Response>`);
    if (!appUrl) return sayAndHangUp("Thanks for calling Certxa. Please visit certxa dot com to start your free trial.");
    if (!validTwilio(req, appUrl)) {
      console.warn(`${LOG} rejected a webhook with an invalid Twilio signature`);
      return res.status(403).type("text/plain").send("Forbidden");
    }
    const limit = await overLimits();
    if (limit) {
      console.warn(`${LOG} call turned away: ${limit}`);
      return sayAndHangUp("Thanks for calling Certxa. All of our lines are busy right now. You can start your free trial any time at certxa dot com. Goodbye.");
    }
    const from = tenDigit(String(req.body?.From ?? "")) ?? String(req.body?.From ?? "");
    const streamUrl = `${appUrl.replace(/^http/i, "ws")}${STREAM_BASE}/${issueStreamPass("sales", 0)}`;
    console.log(`${LOG} incoming call from ${from || "unknown"}`);
    return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="from" value="${xml(from)}" />
    </Stream>
  </Connect>
</Response>`);
  });

  const wss = new WebSocketServer({ noServer: true });
  wss.on("connection", (ws: WebSocket) => runSalesCall(ws));
  httpServer.on("upgrade", (req, socket, head) => {
    const pathname = req.url?.split("?")[0] ?? "";
    if (pathname !== STREAM_BASE && !pathname.startsWith(STREAM_BASE + "/")) return;
    if (redeemStreamPass("sales", passFromPath(pathname, STREAM_BASE)) == null) {
      console.warn(`${LOG} stream refused — no valid one-time pass (${req.socket.remoteAddress ?? "?"})`);
      try { socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n"); } catch { /* ignore */ }
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req as any, socket as any, head, (ws) => wss.emit("connection", ws, req));
  });

  // ── Back office (isTeam → Sales Leads) ──
  app.get("/api/support/sales-leads", requireSupportAuth, async (_req: Request, res: Response) => {
    try {
      const leads = await pool.query(
        `SELECT l.*, c.summary, c.duration_seconds, c.started_at AS call_started_at
           FROM sales_leads l LEFT JOIN sales_call_logs c ON c.id = l.call_log_id
          ORDER BY l.created_at DESC LIMIT 300`,
      );
      const calls = await pool.query(
        `SELECT id, caller_phone, outcome, duration_seconds, summary, lead_id, started_at, ended_at
           FROM sales_call_logs ORDER BY started_at DESC LIMIT 100`,
      );
      res.json({ leads: leads.rows, calls: calls.rows, phoneNumber: "(888) 814-7623" });
    } catch (err: any) {
      console.error(`${LOG} leads list failed:`, err.message);
      res.status(500).json({ message: "Could not load sales leads" });
    }
  });
  app.get("/api/support/sales-calls/:id", requireSupportAuth, async (req: Request, res: Response) => {
    const r = await pool.query(`SELECT * FROM sales_call_logs WHERE id = $1`, [Number(req.params.id)]).catch(() => ({ rows: [] as any[] }));
    if (!r.rows[0]) return res.status(404).json({ message: "Not found" });
    res.json(r.rows[0]);
  });
  app.patch("/api/support/sales-leads/:id", requireSupportAuth, async (req: Request, res: Response) => {
    const status = String(req.body?.status ?? "");
    if (!["new", "contacted", "signed_up", "not_interested"].includes(status)) return res.status(400).json({ message: "Unknown status" });
    await pool.query(`UPDATE sales_leads SET status = $2, updated_at = now() WHERE id = $1`, [Number(req.params.id), status]);
    res.json({ ok: true });
  });

  console.log(`${LOG} ready — POST /api/webhook/twilio/sales, WSS ${STREAM_BASE}`);
}
