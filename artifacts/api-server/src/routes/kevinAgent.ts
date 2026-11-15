/**
 * Kevin — a 24/7 AI receptionist for a made-up property management company (owner, 2026-11-15): Summit Ridge Property
 * Management and its one property, Juniper Flats Apartments (knowledge-base-kevin/juniper-flats.md), on his own number
 * (970) 408-2979 and his own tables (migration 0370). Built from Tom's phone system (routes/salesAgent.ts): the same
 * Twilio media stream ↔ OpenAI Live engine with a Responses backend for tools, the same model, audio and interruption
 * handling, and Tom's way of talking. Tom's files are not changed.
 *
 *   inbound        Anyone calls the line. Tenants' maintenance problems are triaged critical / urgent / routine and
 *                  recorded (kevin_incidents); the tenant directory (kevin_tenants) grows as they call. Owners, vendors
 *                  and prospects leave a message for the office (kevin_messages).
 *   escalation     A critical or urgent incident: Kevin calls the escalation list (kevin_on_call, by priority), each
 *                  person ATTEMPTS_PER_CONTACT times, then the next, round after round, until someone answers, confirms
 *                  who they are, understands the problem and where, accepts it and gives an arrival time. Voicemail, no
 *                  answer or a call that ends without that is never an acknowledgment.
 *   tenant_update  Kevin calls the tenant back with who is coming and when.
 */
import type { Express, Request, Response } from "express";
import type { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import twilio from "twilio";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { pool } from "../db";
import { issueStreamPass, redeemStreamPass, passFromPath } from "../lib/streamPass";
import { toE164US } from "../lib/phoneUtils";
import { callerHelloChunks, isCallerHelloEcho } from "../lib/callerHello";
import { sendEmail } from "../mail";

const LOG = "[Kevin]";
export const KEVIN_COMPANY = "Summit Ridge Property Management";
export const KEVIN_PROPERTY = "Juniper Flats Apartments, 2280 Cedar Hollow Lane, Denver";
export const KEVIN_NUMBER = "+19704082979";
const WEBHOOK_PATH = "/api/webhook/twilio/kevin";
// Under nginx's existing /support-agent-stream prefix, like Tom's, so no nginx change.
const STREAM_BASE = "/support-agent-stream-kevin";
const LIVE_URL = "wss://api.openai.com/v1/live/sessions";
const VOICE = process.env.KEVIN_VOICE || "cedar"; // a male GPT-Live voice; Tom has his own custom one
const BACKEND_MODEL = process.env.KEVIN_BACKEND_MODEL || process.env.SALES_AGENT_BACKEND_MODEL || process.env.AI_RECEPTIONIST_BACKEND_MODEL || "gpt-5.6-luna";
const MAX_CONCURRENT = Number(process.env.KEVIN_MAX_CONCURRENT || 4);
const MAX_CALL_MS = 15 * 60_000;
const SILENCE_HANGUP_MS = 60_000;
/** Calls to one person before Kevin moves to the next on the list. */
export const ATTEMPTS_PER_CONTACT = Number(process.env.KEVIN_ATTEMPTS_PER_CONTACT || 2);
/** Wait between escalation calls. */
export const RETRY_SEC = Number(process.env.KEVIN_RETRY_SEC || 90);
/** Whole passes through the list before Kevin stops and marks the incident escalation_exhausted. */
export const MAX_ROUNDS = Number(process.env.KEVIN_MAX_ROUNDS || 10);
const TENANT_UPDATE_RETRY_SEC = 180;
const MAX_TENANT_UPDATE_ATTEMPTS = 3;
/** A call placed that never reports back counts as failed after this long. */
const WATCHDOG_SEC = 8 * 60;
const FRAME_BYTES = 160; // 20 ms of 8 kHz μ-law
const AI_SPEAKING_IDLE_MS = 700;
const INTERRUPT_FRAMES = 5;

export type Purpose = "inbound" | "escalation" | "tenant_update";

function apiRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return here.includes("/src") ? join(here, "..", "..") : join(here, "..");
}
const knowledge = (() => {
  try { return readFileSync(join(apiRoot(), "knowledge-base-kevin", "juniper-flats.md"), "utf-8"); }
  catch (err) { console.error(`${LOG} could not load juniper-flats.md:`, (err as Error).message); return ""; }
})();

function publicAppUrl(): string | null {
  const url = process.env.APP_URL || "";
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
const spokenPhone = (e164: string | null) => { const d = String(e164 ?? "").replace(/\D/g, "").slice(-10); return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : "unknown"; };
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const unitOf = (s: unknown) => { const m = String(s ?? "").match(/\d{3}/); return m ? m[0] : null; };
const mountain = (d: Date | string) => new Date(d).toLocaleString("en-US", { timeZone: "America/Denver", weekday: "short", hour: "numeric", minute: "2-digit" });

function muLawToLinear(u: number): number {
  u = ~u & 0xff;
  const sign = u & 0x80, exponent = (u >> 4) & 0x07, mantissa = u & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  return sign ? -sample : sample;
}
function callerSpeaking(base64: string): boolean {
  const buf = Buffer.from(base64, "base64");
  let sum = 0, peak = 0, n = 0;
  for (let i = 0; i < buf.length; i += 4) { const a = Math.abs(muLawToLinear(buf[i])); sum += a; if (a > peak) peak = a; n++; }
  return n > 0 && sum / n > 650 && peak > 2200;
}

// ─── Who Kevin is (written after Tom's character in lib/salesAgentProfiles.ts — his brother, not his copy) ───────

const KEVIN_PERSONALITY = `WHO KEVIN IS: Kevin is in his thirties and has answered the phones for property managers for years. He's heard every kind of call at every hour — a ceiling dripping at 2 a.m., a tenant locked out in the snow, a vendor who can't find the gate code — and very little rattles him. He's friendly, calm, confident and quietly capable, especially with someone who's frustrated or scared. He listens more than he talks, asks one question at a time, and never makes anyone feel like a bother.
HOW KEVIN TALKS: like a real person at a front desk, not a machine or a script. Short pieces with natural little pauses, never one long run-on sentence. Contractions and plain words ("okay, tell me what's going on", "got it", "and which apartment are you in?", "okay, let me make sure I get someone on this", "hang on one sec"). Varied acknowledgements, or none at all. A light laugh if the caller makes a joke, never forced. Small fillers now and then ("mm-hm", "okay, so…", "hmm, let's see") — one every few turns at most, never while saying a unit number, phone number or time.
KEVIN NEVER SAYS: "Certainly!", "Absolutely!", "I understand your concern", "Thank you for providing that information", "I'd be happy to help with that", "Is there anything else I can help you with today?", or the caller's name in every sentence. He doesn't introduce himself again once he has.
WITH UPSET CALLERS: he stays calm and kind, never argues, never blames the tenant, never minimizes the problem. He acknowledges it briefly and gets to what he can do.
AI: he doesn't volunteer that he's an AI. If someone asks directly whether they're talking to a person or an AI, he says honestly, in one short line, that he's the property's virtual receptionist, and carries on.`;

const HANDLING = `HANDLING THE CALL LIKE A PERSON:
- One thing at a time. Answer what they asked first, then the next step. Never run through a questionnaire; pick up details from what they've already said and don't ask for anything twice.
- Callers change subjects and talk in half sentences: follow them, and work out what they mean.
- Interruptions: if they start talking while you're speaking, stop, listen, and answer what they just said.
- Holding: when something takes a moment, the system may ask you for a short holding phrase. Say just that, a few natural words, different each time.
- Numbers: read unit numbers, phone numbers and times back in small chunks and check they're right.
- Wrapping up: a short recap of what was actually done (only what the system confirmed), what happens next, then a warm, normal goodbye.`;

const HANDOFF = `YOUR BACKEND does the record keeping and the calls, and you must hand things to it: whenever the conversation needs something recorded, looked up, confirmed or messaged to the office, hand it to the backend with exactly what the person said, and carry on naturally when the result comes back. Don't describe backend work or name tools. Never say something was recorded, that someone was reached or that someone is coming unless the backend confirmed it. After you say goodbye and the person is done, hand off ending the call.`;

const NEVER = `KEVIN NEVER: invents anything (names, apartments, schedules, contacts, policies — if it isn't in the knowledge below or returned by the backend, he doesn't know it); promises maintenance is coming before someone has acknowledged it; says an emergency is handled or a problem is resolved when it has only been reported; treats a voicemail as reaching someone; gives medical, legal or risky repair instructions; shares a tenant's information with someone who hasn't been verified as that tenant; assumes who someone is from their phone number alone.`;

export type KevinCtx = {
  purpose: Purpose;
  callSid: string | null;
  callerE164: string | null;
  incidentId: number | null;
  onCallId: number | null;
  /** Directory entries matching the caller's number: private until identify_caller confirms one. */
  candidates: { id: number; name: string; unit: string | null }[];
  verifiedTenantId: number | null;
  reported: Set<number>;
  messageSaved: boolean;
  achieved: boolean;
  endCall: () => void;
};

export function newCtx(p: Partial<KevinCtx> & { purpose: Purpose }): KevinCtx {
  return { callSid: null, callerE164: null, incidentId: null, onCallId: null, candidates: [], verifiedTenantId: null, reported: new Set(), messageSaved: false, achieved: false, endCall: () => {}, ...p };
}

export async function loadCandidates(callerE164: string | null): Promise<KevinCtx["candidates"]> {
  if (!callerE164) return [];
  const r = await pool.query(`SELECT id, name, unit FROM kevin_tenants WHERE phone_e164 = $1 ORDER BY last_call_at DESC NULLS LAST LIMIT 3`, [callerE164]);
  return r.rows;
}

function inboundSetup(ctx: KevinCtx) {
  const now = mountain(new Date());
  const memory = ctx.candidates.length
    ? `A TENANT DIRECTORY ENTRY MATCHES THIS NUMBER. It is private until verified: don't say or hint at the stored name or apartment. When it's natural, ask who you're speaking with (and their apartment, if it's about their unit), then hand both to the backend to check (identify_caller). Only when the backend says verified can you greet them by name and mention their earlier requests — and even then don't assume they're calling about an old problem: "are you calling about the leak from Tuesday, or something new?"`
    : `This number isn't in the tenant directory yet. If it's a tenant, get their name and apartment naturally while helping; the backend adds them to the directory when the request is recorded.`;
  const voice = `You are Kevin, the receptionist who answers the phone 24/7 for ${KEVIN_COMPANY}, which manages ${KEVIN_PROPERTY}. It's ${now} Mountain time now. The caller's number is ${spokenPhone(ctx.callerE164)}.

${KEVIN_PERSONALITY}

${HANDLING}

WHO'S CALLING: work out from what they say whether it's a tenant, a property owner, a vendor or contractor, or someone looking to rent — don't ask everyone "are you a tenant?". Tenants: maintenance (triage below), questions about a request they made, other concerns. Owners: take a message for management. You can't transfer calls or see anyone's schedule, so never say whether someone is in or available; say you'll get the message to them. Vendors: work orders, access, scheduling — take a message (you can't see work orders or give gate or lock codes). Prospective tenants: you can't see availability or book showings; take their name, number and what they're looking for for the leasing office. Anyone else: a message for the office.

RECORD IT BEFORE YOU SAY IT'S PASSED ALONG: the moment you know the problem and the apartment (or that they won't give it), hand it to the backend to record — before you say anything like "I'll pass that along" or "the office will follow up". Saying it without handing it over loses the request. The same for messages from owners, vendors and prospects. If the caller starts to wrap up before you have everything, record what you have first, then say goodbye.

LIFE SAFETY FIRST (no fillers, no "let me think" — straight to the safety instruction): fire or smoke, a gas smell, a carbon monoxide alarm, someone hurt, trapped or in danger, sparking or exposed live wiring, a ceiling or structure that looks like it could come down — tell them to get to safety and call 911 now (gas: get outside first, don't flip switches, then call 911 and Xcel Energy at 1-800-895-2999). Never hold them on the line with questions before that. Then, right away and before anything else, hand the incident to the backend as critical with whatever you know (apartment and name if they've said them), so the on-call calls start even if they hang up — never ask them to call you back first. If they're safe and want to stay on, take any missing details briefly and update it.
911 is for danger to people (fire, smoke, gas, CO, someone hurt or trapped, sparks or live wires, a ceiling coming down). A leak of hot water, a burst heating pipe or a water heater problem is not a 911 call on its own: tell them to keep away, don't touch anything, and escalate it as critical — 911 only if someone is scalded or hurt or water is reaching something electrical.

TRIAGE — DECIDE FROM WHAT'S HAPPENING, NEVER FROM ONE WORD: "water leak" can be a drip under a sink or a burst pipe. Ask the natural next question ("is it coming through right now?", "is it getting worse?", "is any water near outlets or lights?", "can you get to the shut-off under the sink?", "is it the only toilet?", "how cold is it inside?") until you know which it is. Use the guide in the knowledge below:
- critical (life safety or major damage now) and urgent (needs someone tonight): the backend calls the on-call people right away. Tell the tenant you're getting the on-call person now, that you'll keep calling until someone confirms, and that you'll call them back on this number with who's coming and when. Never say someone is on the way.
- routine: recorded, and the office gets a notice that they called; the office follows up on the next business day. Clogged sinks, a broken garbage disposal, a clogged toilet that isn't overflowing, an air conditioner not blowing cold and no hot water in the shower are routine.
- When you're truly unsure after asking, treat it as urgent: a person can decide.
For a maintenance request you need, without interrogating: their name, the apartment (Juniper Flats has units 101–112, 201–212, 301–312; if they won't give it, still record the problem with what you have), what's happening and where, since when and whether it's worse, the best callback number (the one they're calling from is fine if they say so), and for critical/urgent whether maintenance may go in if they're not home and whether there are pets. ASSESS AND LIMIT DAMAGE (see "Assessing the problem and limiting damage" in the knowledge): work out where it's coming from and whether it's hot or cold water before suggesting anything. Heating pipes, baseboard heaters, the water heater or its pipes, hot water or steam, or water near anything electrical: the tenant does nothing and keeps away — record it as critical straight away (as soon as you know what it is and the apartment), so the on-call calls start, then ask about entry and pets and update it. Only for a cold-water problem they can reach easily and safely, offer the matching safe step, and ask afterwards whether it stopped or slowed. Then hand it to the backend to record, and read back the key details once.

A REQUEST THEY ALREADY MADE: only after the backend has verified them can you tell them its status. Say exactly what the backend returns — acknowledged with an arrival time, still trying to reach someone, or with the office for the next business day. If someone is angry it's not fixed: stay calm, don't argue or make excuses, tell them what you can see, and record a follow-up so the office calls them.

${ctx.candidates.length ? "CALLER MEMORY: " : ""}${memory}

${NEVER}

KNOWLEDGE (the only facts you have about the company and the property):
${knowledge}

${HANDOFF}`;
  const backend = `You handle the actions for Kevin, ${KEVIN_COMPANY}'s receptionist, on a call to the main line (caller number ${ctx.callerE164 ?? "unknown"}).
- identify_caller: when the caller says who they are (and their apartment, if given). Pass only what they said. Its answer says whether they're verified; nothing about a directory entry may be told to them unless verified.
- report_incident: once the problem and the apartment (or as much as they'll give) are known. severity critical / urgent / routine as Kevin judged; critical and urgent start the on-call calls at once. Once per problem; if details change, call it again with the incidentId. Also use it, severity routine with category "follow-up", for a tenant chasing an unresolved repair.
- my_requests: a verified tenant asking about requests they made.
- take_message: owners, vendors, prospective tenants and anything that isn't maintenance.
- end_call only after goodbye.`;
  return { voice, backend, tools: INBOUND_TOOLS, greeting: `Speak first now, warm and relaxed: "Hi, this is Kevin with ${KEVIN_COMPANY}. How can I help you?" Then listen.` };
}

function escalationSetup(i: any, person: { name: string; role: string }, attempt: number) {
  const voice = `You are Kevin, the receptionist for ${KEVIN_COMPANY}, which manages ${KEVIN_PROPERTY}. You're calling ${person.name} (${person.role.replace(/_/g, " ")}) about a maintenance ${i.severity} a tenant just reported. This is call attempt ${attempt} for this incident. Be brief and clear — they may have just woken up.

${KEVIN_PERSONALITY}

INCIDENT SR-${i.id}:
- Apartment: ${i.unit ?? "not given"} at Juniper Flats, 2280 Cedar Hollow Lane
- Tenant: ${i.tenant_name ?? "not given"}, callback ${spokenPhone(i.tenant_phone_e164)}
- Problem: ${i.description}${i.category ? ` (${i.category})` : ""}
- Why it's ${i.severity}: ${i.severity_reason ?? "reported by the tenant"}
- Entry: ${i.permission_to_enter == null ? "not asked" : i.permission_to_enter ? "OK to enter" : "tenant must be home"}; pets: ${i.pets_on_site ?? "not said"}
- Reported ${mountain(i.created_at)} Mountain time

WHAT THIS CALL NEEDS. A call that just connects, or a voicemail, is not enough. Before you're done you need ALL of:
1. It's ${person.name} you're talking to (if someone else answers, ask for ${person.name}; if they can't come to the phone, end politely — you'll call back).
2. They understand what the problem is and where (apartment and building). If they only say "okay", ask them to tell you back where they're headed and what for.
3. They accept it — they're taking responsibility for responding.
4. An arrival time: minutes until they're on site (if they give a clock time, work out the minutes; if they're vague, ask for a number).
Then hand that to the backend as acknowledged. Tell them you'll let the tenant know, give the tenant's number if they want it, thank them and say goodbye.
If they can't take it (away, sick, on another call-out), hand that to the backend as declined with the reason, tell them you'll go to the next person on the list, and say goodbye. Don't argue or plead.

${NEVER}

${HANDOFF}`;
  const backend = `You handle the actions for Kevin on his call to ${person.name}, on ${KEVIN_COMPANY}'s escalation list, about incident SR-${i.id}.
- acknowledge_incident only when they have confirmed who they are, that they understand the problem and the apartment, that they accept responding, and given an arrival time in minutes.
- decline_incident when they say they can't take it, with the reason.
- end_call only after goodbye.`;
  return { voice, backend, tools: ESCALATION_TOOLS, greeting: `Speak first now: "Hi, this is Kevin with ${KEVIN_COMPANY}, calling with an emergency maintenance call. Is this ${person.name}?" Then listen.` };
}

function tenantUpdateSetup(i: any, techName: string) {
  const at = i.acknowledged_at && i.eta_minutes ? new Date(new Date(i.acknowledged_at).getTime() + i.eta_minutes * 60_000) : null;
  const voice = `You are Kevin, the receptionist for ${KEVIN_COMPANY}. You're calling ${i.tenant_name ?? "the tenant"} back about the ${i.severity} maintenance problem they reported: ${i.description} (apartment ${i.unit ?? "?"}).

${KEVIN_PERSONALITY}

WHAT TO TELL THEM: ${techName} has confirmed and is on the way${at ? `, arriving around ${at.toLocaleTimeString("en-US", { timeZone: "America/Denver", hour: "numeric", minute: "2-digit" })} (about ${i.eta_minutes} minutes from when they confirmed)` : ""}. Remind them of any safe step from before, and that if anything gets worse or becomes dangerous they should call 911. Answer short questions; for a new problem, ask them to call the main line back. Once they've heard who's coming and when, hand off that they've been told, then say goodbye.
If someone else answers, give a short message that maintenance is on the way and the arrival time. Don't share other details.

${NEVER}

${HANDOFF}`;
  const backend = `You handle the actions for Kevin on his call-back to the tenant about incident SR-${i.id}.
- tenant_informed once they've heard who is coming and when.
- end_call only after goodbye.`;
  return { voice, backend, tools: TENANT_UPDATE_TOOLS, greeting: `Speak first now: "Hi, this is Kevin with ${KEVIN_COMPANY}, calling back about the maintenance problem you reported. Is this ${i.tenant_name ?? "the tenant"}?" Then listen.` };
}

/** Kevin's instructions and tools for one call (also used by the text simulations). */
export async function kevinSetup(ctx: KevinCtx): Promise<{ voice: string; backend: string; tools: any[]; greeting: string } | null> {
  if (ctx.purpose === "inbound") return inboundSetup(ctx);
  const i = (await pool.query(`SELECT * FROM kevin_incidents WHERE id = $1`, [ctx.incidentId])).rows[0];
  if (!i) return null;
  if (ctx.purpose === "escalation") {
    const p = (await pool.query(`SELECT name, role FROM kevin_on_call WHERE id = $1`, [ctx.onCallId])).rows[0];
    return escalationSetup(i, p ?? { name: "the on-call person", role: "on_call_technician" }, i.total_attempts);
  }
  const p = (await pool.query(`SELECT name FROM kevin_on_call WHERE id = $1`, [i.acknowledged_by_on_call_id])).rows[0];
  return tenantUpdateSetup(i, p?.name ?? "our maintenance technician");
}

const END_CALL = { type: "function", name: "end_call", description: "Hang up, after goodbye, when the person is done.", parameters: { type: "object", properties: {}, required: [] } };
const INBOUND_TOOLS = [
  {
    type: "function", name: "identify_caller",
    description: "Check who the caller says they are against the tenant directory. Only verified callers may hear about their earlier requests.",
    parameters: { type: "object", properties: { name: { type: "string" }, unit: { type: "string" } }, required: ["name"] },
  },
  {
    type: "function", name: "report_incident",
    description: "Record a tenant's maintenance problem. critical and urgent start calling the on-call list at once.",
    parameters: {
      type: "object",
      properties: {
        incidentId: { type: "number", description: "Only to update an incident already recorded on this call." },
        tenantName: { type: "string" }, unit: { type: "string" },
        callbackPhone: { type: "string", description: "Only if different from the number they're calling from." },
        category: { type: "string", description: "e.g. water leak, plumbing, heating, electrical, lock/door, lockout, appliance, pest, follow-up, other." },
        description: { type: "string", description: "What is happening, where, since when, worse or not, steps already taken." },
        severity: { type: "string", enum: ["critical", "urgent", "routine"] },
        severityReason: { type: "string", description: "One line: what about the situation makes it this severity." },
        permissionToEnter: { type: "boolean", description: "Only if they answered; leave out otherwise." }, petsOnSite: { type: "string", description: "Only if they answered; leave out otherwise." },
        summary: { type: "string", description: "Two or three sentences for the office: the call so far." },
      },
      required: ["description", "severity", "severityReason"],
    },
  },
  { type: "function", name: "my_requests", description: "A verified tenant's recent requests, with status and any arrival time.", parameters: { type: "object", properties: {}, required: [] } },
  {
    type: "function", name: "take_message",
    description: "A message for the office from an owner, vendor, prospective tenant or anyone not reporting maintenance.",
    parameters: {
      type: "object",
      properties: {
        callerRole: { type: "string", enum: ["owner", "vendor", "prospect", "tenant", "other"] },
        callerName: { type: "string" }, company: { type: "string" }, callbackPhone: { type: "string" },
        about: { type: "string", description: "Short subject, e.g. work order at 204, wants a showing." },
        message: { type: "string" },
      },
      required: ["callerRole", "message"],
    },
  },
  END_CALL,
];
const ESCALATION_TOOLS = [
  {
    type: "function", name: "acknowledge_incident",
    description: "The person on the list confirmed who they are, understands the problem and apartment, accepts responding, and gave an arrival time.",
    parameters: {
      type: "object",
      properties: {
        confirmedIdentity: { type: "boolean" }, understandsProblemAndLocation: { type: "boolean" }, acceptsResponsibility: { type: "boolean" },
        etaMinutes: { type: "number" }, etaWords: { type: "string", description: "What they said, e.g. \"about 40 minutes\"." }, notes: { type: "string" },
      },
      required: ["confirmedIdentity", "understandsProblemAndLocation", "acceptsResponsibility", "etaMinutes"],
    },
  },
  { type: "function", name: "decline_incident", description: "They can't take it.", parameters: { type: "object", properties: { reason: { type: "string" } }, required: ["reason"] } },
  END_CALL,
];
const TENANT_UPDATE_TOOLS = [
  { type: "function", name: "tenant_informed", description: "The tenant heard who is coming and when.", parameters: { type: "object", properties: {}, required: [] } },
  END_CALL,
];

// ─── Tools ────────────────────────────────────────────────────────────────────

/** A tenant in the directory: the one this caller verified as, else matched by name and apartment or number, else new. */
async function upsertTenant(ctx: KevinCtx, name: string | null, unit: string | null, phone: string | null): Promise<number | null> {
  if (ctx.verifiedTenantId) {
    await pool.query(`UPDATE kevin_tenants SET unit = COALESCE(unit, $2), last_call_at = now(), updated_at = now() WHERE id = $1`, [ctx.verifiedTenantId, unit]);
    return ctx.verifiedTenantId;
  }
  if (!name) return null;
  const rows = (await pool.query(`SELECT id, name, unit, phone_e164 FROM kevin_tenants WHERE ($1::text IS NOT NULL AND unit = $1) OR ($2::text IS NOT NULL AND phone_e164 = $2)`, [unit, phone])).rows;
  // The same person: the same name, or one name the start of the other ("Toby" / "Toby Benjamin") on the same number
  // and apartment.
  const a = norm(name);
  const same = rows.find((r) => (!unit || !r.unit || r.unit === unit)
    && (norm(r.name) === a || (phone && r.phone_e164 === phone && unit && r.unit === unit
      && (norm(r.name).startsWith(norm(name.split(/\s+/)[0])) || a.startsWith(norm(String(r.name).split(/\s+/)[0]))))));
  if (same) {
    // Only fills in what's missing (and a fuller name for an unconfirmed entry): a caller never overwrites what the office confirmed.
    await pool.query(
      `UPDATE kevin_tenants SET unit = COALESCE(unit, $2), phone_e164 = COALESCE(phone_e164, $3),
         name = CASE WHEN NOT confirmed AND length($4) > length(name) THEN $4 ELSE name END, last_call_at = now(), updated_at = now() WHERE id = $1`,
      [same.id, unit, phone, name.slice(0, 120)]);
    return same.id;
  }
  const r = await pool.query(`INSERT INTO kevin_tenants (name, phone_e164, unit, last_call_at) VALUES ($1, $2, $3, now()) RETURNING id`, [name.slice(0, 120), phone, unit]);
  return r.rows[0].id;
}

/** What the backend's tools do. Used by live calls and by the text simulations. */
export async function runKevinTool(ctx: KevinCtx, name: string, args: any): Promise<Record<string, unknown>> {
  if (name === "end_call") { ctx.endCall(); return { success: true, message: "Hanging up." }; }

  if (ctx.purpose === "inbound") {
    if (name === "identify_caller") {
      const said = norm(args.name), unit = unitOf(args.unit);
      // Verified only when the number they're calling from is on file for that same name (and apartment, if given).
      const match = ctx.candidates.find((c) => said && (norm(c.name) === said || norm(c.name).startsWith(said) || said.startsWith(norm(c.name)))
        && (!unit || !c.unit || c.unit === unit));
      if (match) {
        ctx.verifiedTenantId = match.id;
        await pool.query(`UPDATE kevin_tenants SET last_call_at = now() WHERE id = $1`, [match.id]);
        const recent = (await pool.query(`SELECT id, description, severity, status, created_at FROM kevin_incidents WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 3`, [match.id])).rows;
        return { success: true, verified: true, name: match.name, unit: match.unit, recentRequests: recent.map((r) => ({ incident: `SR-${r.id}`, what: r.description, severity: r.severity, status: r.status, when: mountain(r.created_at) })) };
      }
      return { success: true, verified: false, message: "Not verified from this number. Help them normally, but don't share anything from earlier requests or the directory." };
    }
    if (name === "report_incident") {
      const severity = ["critical", "urgent", "routine"].includes(args.severity) ? args.severity : "urgent";
      const escalate = severity !== "routine";
      const phone = toE164US(args.callbackPhone) ?? ctx.callerE164;
      const unit = unitOf(args.unit); // "not given" and the like are not an apartment
      const tenantId = await upsertTenant(ctx, args.tenantName ? String(args.tenantName) : null, unit, phone).catch(() => null);
      const vals = [tenantId, args.tenantName ?? null, phone, unit, args.category ?? null, String(args.description ?? "").slice(0, 4000), severity,
        args.severityReason ?? null, typeof args.permissionToEnter === "boolean" ? args.permissionToEnter : null, args.petsOnSite ?? null, args.summary ?? null];
      const existing = Number(args.incidentId);
      if (existing && ctx.reported.has(existing)) {
        const r = await pool.query(
          `UPDATE kevin_incidents SET tenant_id = COALESCE($2, tenant_id), tenant_name = COALESCE($3, tenant_name), tenant_phone_e164 = COALESCE($4, tenant_phone_e164),
             unit = COALESCE($5, unit), category = COALESCE($6, category), description = $7, severity_reason = COALESCE($9, severity_reason),
             permission_to_enter = COALESCE($10, permission_to_enter), pets_on_site = COALESCE($11, pets_on_site), summary = COALESCE($12, summary),
             severity = CASE WHEN severity = 'routine' THEN $8 ELSE severity END,
             status = CASE WHEN status = 'routine_follow_up' AND $8 <> 'routine' THEN 'awaiting_acknowledgment' ELSE status END,
             next_attempt_at = CASE WHEN status = 'routine_follow_up' AND $8 <> 'routine' THEN now() ELSE next_attempt_at END,
             updated_at = now()
           WHERE id = $1 RETURNING status`, [existing, ...vals]);
        if (r.rows[0]?.status === "awaiting_acknowledgment") void runDue().catch(() => {});
        return { success: true, incident: `SR-${existing}`, incidentId: existing, status: r.rows[0]?.status };
      }
      const r = await pool.query(
        `INSERT INTO kevin_incidents (tenant_id, tenant_name, tenant_phone_e164, unit, category, description, severity, severity_reason,
           permission_to_enter, pets_on_site, summary, status, next_attempt_at, reported_call_sid)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, $12, $13, $14) RETURNING id`,
        [...vals, escalate ? "awaiting_acknowledgment" : "routine_follow_up", escalate ? new Date() : null, ctx.callSid]);
      const id = Number(r.rows[0].id);
      ctx.reported.add(id);
      ctx.incidentId = ctx.incidentId ?? id;
      if (escalate) {
        void runDue().catch((e) => console.error(`${LOG} escalation start failed:`, e?.message ?? e));
        const people = (await pool.query(`SELECT count(*)::int AS n FROM kevin_on_call WHERE active`)).rows[0].n;
        return {
          success: true, incident: `SR-${id}`, incidentId: id,
          message: people
            ? "Recorded. Calling the on-call list now; nobody has acknowledged yet. Kevin will call the tenant back once someone confirms with an arrival time."
            : "Recorded, but there is NO on-call person set up to call. Don't say anyone is being reached; tell the tenant it's recorded as an emergency for the office, and to call 911 if it becomes dangerous.",
        };
      }
      return { success: true, incident: `SR-${id}`, incidentId: id, message: "Recorded for the office's next business day." };
    }
    if (name === "my_requests") {
      if (!ctx.verifiedTenantId) return { success: false, message: "The caller isn't verified. Don't share request details." };
      const r = await pool.query(
        `SELECT i.id, i.description, i.severity, i.status, i.eta_minutes, i.acknowledged_at, i.created_at, o.name AS acknowledged_by
           FROM kevin_incidents i LEFT JOIN kevin_on_call o ON o.id = i.acknowledged_by_on_call_id
          WHERE i.tenant_id = $1 ORDER BY i.created_at DESC LIMIT 5`, [ctx.verifiedTenantId]);
      return {
        success: true,
        requests: r.rows.map((x) => ({
          incident: `SR-${x.id}`, what: x.description, severity: x.severity, when: mountain(x.created_at),
          status: x.status === "acknowledged" ? `acknowledged by ${x.acknowledged_by ?? "maintenance"}${x.eta_minutes ? `, arriving about ${x.eta_minutes} minutes after ${mountain(x.acknowledged_at)}` : ""} (not yet marked resolved)`
            : x.status === "awaiting_acknowledgment" ? "Kevin is still calling the on-call list; nobody has acknowledged yet"
            : x.status === "escalation_exhausted" ? "nobody on the on-call list could be reached; it's flagged for the office"
            : x.status === "routine_follow_up" ? "with the office for the next business day"
            : x.status,
        })),
      };
    }
    if (name === "take_message") {
      ctx.messageSaved = true;
      await pool.query(
        `INSERT INTO kevin_messages (caller_role, caller_name, phone_e164, company, about, message, call_sid) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [String(args.callerRole ?? "other"), args.callerName ?? null, toE164US(args.callbackPhone) ?? ctx.callerE164, args.company ?? null, args.about ?? null, String(args.message ?? "").slice(0, 4000), ctx.callSid]);
      return { success: true, message: "Message saved for the office; they follow up on the next business day." };
    }
  }

  if (ctx.purpose === "escalation" && ctx.incidentId) {
    if (name === "acknowledge_incident") {
      const minutes = Math.round(Number(args.etaMinutes));
      if (!args.confirmedIdentity) return { success: false, message: "First confirm you're speaking with the right person." };
      if (!args.understandsProblemAndLocation) return { success: false, message: "They need to show they understand the problem and the apartment: ask them to say it back." };
      if (!args.acceptsResponsibility) return { success: false, message: "Ask plainly whether they're taking this call-out." };
      if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 24 * 60) return { success: false, message: "Ask for the arrival time in minutes." };
      const r = await pool.query(
        `UPDATE kevin_incidents SET status = 'acknowledged', next_attempt_at = NULL, acknowledged_at = now(), acknowledged_by_on_call_id = $2,
           eta_minutes = $3, eta_words = $4, tech_notes = concat_ws(E'\\n', tech_notes, $5::text), next_tenant_update_at = now() + interval '20 seconds', updated_at = now()
          WHERE id = $1 AND status IN ('awaiting_acknowledgment', 'escalation_exhausted') RETURNING id`,
        [ctx.incidentId, ctx.onCallId, minutes, args.etaWords ?? null, args.notes ?? null]);
      if (!r.rowCount) return { success: false, message: "Someone else already acknowledged this one. Thank them, tell them it's covered, and end the call." };
      ctx.achieved = true;
      await pool.query(`UPDATE kevin_calls SET outcome = 'acknowledged' WHERE call_sid = $1`, [ctx.callSid]).catch(() => {});
      return { success: true, message: `Acknowledged, arriving in about ${minutes} minutes. Kevin calls the tenant next.` };
    }
    if (name === "decline_incident") {
      await pool.query(
        `UPDATE kevin_incidents SET attempts_on_current = $3, tech_notes = concat_ws(E'\\n', tech_notes, $2::text), next_attempt_at = now() + interval '20 seconds', updated_at = now()
          WHERE id = $1 AND status = 'awaiting_acknowledgment'`,
        [ctx.incidentId, `${new Date().toISOString()} declined by on-call #${ctx.onCallId}: ${String(args.reason ?? "").slice(0, 300)}`, ATTEMPTS_PER_CONTACT]);
      ctx.achieved = true; // handled: the next person is called, not this one again in 90 s
      await pool.query(`UPDATE kevin_calls SET outcome = 'declined' WHERE call_sid = $1`, [ctx.callSid]).catch(() => {});
      return { success: true, message: "Noted. The next person on the list is called now." };
    }
  }

  if (ctx.purpose === "tenant_update" && ctx.incidentId && name === "tenant_informed") {
    await pool.query(`UPDATE kevin_incidents SET tenant_notified_at = now(), next_tenant_update_at = NULL, updated_at = now() WHERE id = $1`, [ctx.incidentId]);
    ctx.achieved = true;
    return { success: true };
  }
  return { success: false, message: `${name} isn't available on this call.` };
}

// ─── After a call ─────────────────────────────────────────────────────────────

/**
 * The safety net (owner's test call, 2026-11-15: Kevin said "I'll pass all this along" and recorded nothing): an inbound
 * call that ends with nothing recorded is read once more, and any problem or message the caller gave is recorded now —
 * an emergency starts the on-call calls late rather than never. Also covers callers who hang up mid-way.
 */
export async function recordMissedRequests(ctx: KevinCtx, transcript: { role: string; text: string }[]): Promise<void> {
  if (ctx.purpose !== "inbound" || ctx.reported.size || ctx.messageSaved) return;
  if (!transcript.some((t) => t.role === "caller" && /[a-z]{3}/i.test(t.text))) return;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return;
  const tools = INBOUND_TOOLS.filter((t) => t.name === "report_incident" || t.name === "take_message");
  const input: any[] = [{ role: "user", content: `Transcript of the call that just ended:\n${transcript.map((t) => `${t.role === "kevin" ? "Kevin" : "Caller"}: ${t.text}`).join("\n")}` }];
  const instructions = `${inboundSetup(ctx).backend}

THE CALL HAS ENDED and nothing was recorded during it. If the caller reported a maintenance problem, record it now with report_incident using only what they said (severity as Kevin's rules in the knowledge below would judge it; a summary noting it was recorded after the call). If they left a message (owner, vendor, prospect, office question), use take_message. If nothing needs recording (a wrong number, silence, a question fully answered), call nothing.

KNOWLEDGE:
${knowledge}`;
  for (let round = 0; round < 3; round++) {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: BACKEND_MODEL, instructions, input, tools, tool_choice: "auto" }),
      signal: AbortSignal.timeout(60_000),
    });
    const data: any = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const calls = (data?.output ?? []).filter((x: any) => x.type === "function_call");
    if (!calls.length) return;
    for (const item of data.output) if (item.type !== "message") input.push(item);
    for (const c of calls) {
      let args: any = {};
      try { args = JSON.parse(c.arguments || "{}"); } catch { /* empty */ }
      const result = await runKevinTool(ctx, c.name, args);
      console.log(`${LOG} recorded after the call: ${c.name} call=${ctx.callSid ?? "?"} → ${String(result.incident ?? result.message ?? "")}`);
      input.push({ type: "function_call_output", call_id: c.call_id, output: JSON.stringify(result) });
    }
  }
}

// ─── Office notices ───────────────────────────────────────────────────────────

/** Where the office notices go (the property is made up, so it's set in /etc/certxa.env). */
const OFFICE_EMAIL = () => process.env.KEVIN_OFFICE_EMAIL?.trim() || "";

/**
 * Every routine request reported on a call is e-mailed to the office once the call ends, with its final details: the
 * tenant called to report it, what it is, and how to reach them (owner, 2026-11-15).
 */
export async function sendOfficeNotices(incidentIds: number[]): Promise<void> {
  for (const id of incidentIds) {
    const claimed = await pool.query(
      `UPDATE kevin_incidents SET office_notice_sent_at = now() WHERE id = $1 AND severity = 'routine' AND office_notice_sent_at IS NULL RETURNING *`, [id],
    );
    const i = claimed.rows[0];
    if (!i) continue;
    const to = OFFICE_EMAIL();
    if (!to) {
      await pool.query(`UPDATE kevin_incidents SET office_notice_sent_at = NULL, office_notice_error = 'KEVIN_OFFICE_EMAIL is not set' WHERE id = $1`, [id]);
      console.warn(`${LOG} SR-${id}: no office e-mail address set; notice not sent`);
      continue;
    }
    const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rows: [string, string][] = [
      ["Tenant", i.tenant_name ?? "Not given"], ["Apartment", i.unit ?? "Not given"], ["Callback number", spokenPhone(i.tenant_phone_e164)],
      ["Called", `${mountain(i.created_at)} Mountain time`], ["Problem", i.description], ["Kevin's assessment", `Routine — ${i.severity_reason ?? ""}`],
      ["OK to enter", i.permission_to_enter == null ? "Not asked" : i.permission_to_enter ? "Yes" : "No"], ["Pets", i.pets_on_site || "Not asked"],
    ];
    const subject = `Maintenance request SR-${i.id}: ${i.unit ? `apartment ${i.unit}` : "Juniper Flats"} — ${String(i.category || i.description).slice(0, 60)}`;
    const html = `<p>${esc(i.tenant_name ?? "A tenant")} called the main line to report a non-emergency maintenance problem at Juniper Flats.</p>
<table cellpadding="6" style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="color:#6b7280;vertical-align:top">${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>
${i.summary ? `<p><b>Call summary:</b> ${esc(i.summary)}</p>` : ""}<p>The tenant was told the office will follow up on the next business day.</p>`;
    const text = `${i.tenant_name ?? "A tenant"} called to report a non-emergency maintenance problem.\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}${i.summary ? `\nSummary: ${i.summary}` : ""}`;
    const r = await sendEmail(0, to, subject, html, text, undefined, { business: KEVIN_COMPANY }).catch((e) => ({ success: false, error: String(e?.message ?? e) }));
    if (!r.success) {
      await pool.query(`UPDATE kevin_incidents SET office_notice_sent_at = NULL, office_notice_error = $2 WHERE id = $1`, [id, String((r as any).error ?? "send failed").slice(0, 300)]);
      console.error(`${LOG} SR-${id}: office notice failed:`, (r as any).error);
    } else console.log(`${LOG} SR-${id}: office notice e-mailed`);
  }
}

/** Nobody on the list acknowledged an emergency: the office is told plainly, by e-mail. */
async function sendUnresolvedNotice(id: number, attempts: number): Promise<void> {
  const i = (await pool.query(`SELECT * FROM kevin_incidents WHERE id = $1`, [id])).rows[0];
  const to = OFFICE_EMAIL();
  if (!i || !to) return;
  const esc = (v: unknown) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const subject = `UNRESOLVED EMERGENCY SR-${i.id}: nobody on the on-call list acknowledged (${i.unit ? `apartment ${i.unit}` : "Juniper Flats"})`;
  const text = `Kevin called the on-call list ${attempts} times (${MAX_ROUNDS} full rounds) and nobody acknowledged this ${i.severity} incident. It still needs someone.\nTenant: ${i.tenant_name ?? "not given"}, apartment ${i.unit ?? "not given"}, ${spokenPhone(i.tenant_phone_e164)}\nReported: ${mountain(i.created_at)} Mountain time\nProblem: ${i.description}`;
  await sendEmail(0, to, subject, `<p><b>${esc(subject)}</b></p><p>${esc(text).replace(/\n/g, "<br>")}</p>`, text, undefined, { business: KEVIN_COMPANY });
}

// ─── Escalation and call-backs ────────────────────────────────────────────────

function twilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio is not configured");
  return twilio(sid, token);
}

/** Places one of Kevin's calls. Twilio's answering-machine detection runs before he speaks. Replaceable in tests. */
export let placeCall = async (purpose: Exclude<Purpose, "inbound">, to: string, incidentId: number, onCallId: number | null): Promise<string> => {
  const appUrl = publicAppUrl();
  if (!appUrl) throw new Error("APP_URL is not set");
  const q = `purpose=${purpose}&incident=${incidentId}${onCallId ? `&onCall=${onCallId}` : ""}`;
  const call = await twilioClient().calls.create({
    to, from: KEVIN_NUMBER,
    url: `${appUrl}${WEBHOOK_PATH}/outbound?${q}`, method: "POST",
    statusCallback: `${appUrl}${WEBHOOK_PATH}/status?${q}`, statusCallbackMethod: "POST",
    machineDetection: "DetectMessageEnd", timeout: 30,
  });
  await pool.query(
    `INSERT INTO kevin_calls (call_sid, purpose, incident_id, on_call_id, phone_e164) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (call_sid) DO NOTHING`,
    [call.sid, purpose, incidentId, onCallId, to],
  );
  return call.sid;
};
export function setPlaceCallForTests(fn: typeof placeCall): void { placeCall = fn; }

/** Due escalation calls and tenant call-backs, claimed so each incident is handled by one pm2 worker. */
export async function runDue(): Promise<void> {
  const due = await pool.query(
    `UPDATE kevin_incidents SET next_attempt_at = now() + ($1 || ' seconds')::interval, updated_at = now()
      WHERE id IN (SELECT id FROM kevin_incidents WHERE status = 'awaiting_acknowledgment' AND next_attempt_at <= now() ORDER BY next_attempt_at LIMIT 5 FOR UPDATE SKIP LOCKED)
      RETURNING *`,
    [String(WATCHDOG_SEC)],
  );
  for (const i of due.rows) {
    const list = (await pool.query(`SELECT id, name, phone_e164 FROM kevin_on_call WHERE active ORDER BY priority, id`)).rows;
    if (!list.length) {
      console.error(`${LOG} SR-${i.id}: nobody active in kevin_on_call; trying again in ${RETRY_SEC}s`);
      await pool.query(`UPDATE kevin_incidents SET next_attempt_at = now() + ($2 || ' seconds')::interval WHERE id = $1`, [i.id, String(RETRY_SEC)]);
      continue;
    }
    // The configured order: each person ATTEMPTS_PER_CONTACT times, then the next; after the last, a new round.
    let idx = list.findIndex((p) => p.id === i.current_on_call_id);
    let attempts = i.attempts_on_current;
    let rounds = i.rounds;
    if (idx < 0) { idx = 0; attempts = 0; rounds = Math.max(1, rounds); }
    else if (attempts >= ATTEMPTS_PER_CONTACT) {
      idx += 1; attempts = 0;
      if (idx >= list.length) { idx = 0; rounds += 1; }
    }
    if (rounds > MAX_ROUNDS) {
      await pool.query(`UPDATE kevin_incidents SET status = 'escalation_exhausted', next_attempt_at = NULL, updated_at = now() WHERE id = $1`, [i.id]);
      console.error(`${LOG} SR-${i.id}: UNRESOLVED EMERGENCY — nobody acknowledged after ${MAX_ROUNDS} rounds of the on-call list`);
      await sendUnresolvedNotice(i.id, i.total_attempts).catch((e) => console.error(`${LOG} SR-${i.id}: unresolved notice failed:`, e?.message ?? e));
      continue;
    }
    const person = list[idx];
    await pool.query(
      `UPDATE kevin_incidents SET current_on_call_id = $2, attempts_on_current = $3, rounds = $4, total_attempts = total_attempts + 1 WHERE id = $1`,
      [i.id, person.id, attempts + 1, rounds],
    );
    try {
      const sid = await placeCall("escalation", person.phone_e164, i.id, person.id);
      console.log(`${LOG} SR-${i.id}: calling ${person.name} (try ${attempts + 1} of ${ATTEMPTS_PER_CONTACT}, round ${rounds}) call=${sid}`);
    } catch (e: any) {
      console.error(`${LOG} SR-${i.id}: call to ${person.name} failed:`, e?.message ?? e);
      await pool.query(`UPDATE kevin_incidents SET next_attempt_at = now() + ($2 || ' seconds')::interval WHERE id = $1`, [i.id, String(RETRY_SEC)]);
    }
  }

  const updates = await pool.query(
    `UPDATE kevin_incidents SET next_tenant_update_at = now() + ($1 || ' seconds')::interval, tenant_update_attempts = tenant_update_attempts + 1, updated_at = now()
      WHERE id IN (SELECT id FROM kevin_incidents WHERE status = 'acknowledged' AND tenant_notified_at IS NULL AND next_tenant_update_at <= now() ORDER BY next_tenant_update_at LIMIT 5 FOR UPDATE SKIP LOCKED)
      RETURNING *`,
    [String(WATCHDOG_SEC)],
  );
  for (const i of updates.rows) {
    if (!i.tenant_phone_e164 || i.tenant_update_attempts > MAX_TENANT_UPDATE_ATTEMPTS) {
      await pool.query(`UPDATE kevin_incidents SET next_tenant_update_at = NULL WHERE id = $1`, [i.id]);
      continue;
    }
    try {
      const sid = await placeCall("tenant_update", i.tenant_phone_e164, i.id, null);
      console.log(`${LOG} SR-${i.id}: calling the tenant back with the arrival time (try ${i.tenant_update_attempts}) call=${sid}`);
    } catch (e: any) {
      console.error(`${LOG} SR-${i.id}: tenant call-back failed:`, e?.message ?? e);
      await pool.query(`UPDATE kevin_incidents SET next_tenant_update_at = now() + ($2 || ' seconds')::interval WHERE id = $1`, [i.id, String(TENANT_UPDATE_RETRY_SEC)]);
    }
  }
}

/** A call ended without what it was for (no answer, voicemail, unconfirmed): the next try in RETRY_SEC. */
export async function retryAfter(purpose: Purpose, incidentId: number): Promise<void> {
  if (purpose === "escalation") {
    await pool.query(
      `UPDATE kevin_incidents SET next_attempt_at = now() + ($2 || ' seconds')::interval, updated_at = now() WHERE id = $1 AND status = 'awaiting_acknowledgment'`,
      [incidentId, String(RETRY_SEC)],
    );
  } else if (purpose === "tenant_update") {
    await pool.query(
      `UPDATE kevin_incidents SET next_tenant_update_at = now() + ($2 || ' seconds')::interval, updated_at = now() WHERE id = $1 AND tenant_notified_at IS NULL`,
      [incidentId, String(TENANT_UPDATE_RETRY_SEC)],
    );
  }
}

// ─── One call (Tom's engine, trimmed to what Kevin needs) ─────────────────────

function runKevinCall(twilioWs: WebSocket): void {
  let openAi: WebSocket | null = null;
  let streamSid: string | null = null;
  let started = false, closed = false, aiSpeaking = false, helloEchoPending = false;
  let aiIdleTimer: NodeJS.Timeout | null = null;
  let pacer: NodeJS.Timeout | null = null;
  let interruptStreak = 0;
  let lastCallerVoice = Date.now();
  let toolsRunning = 0;
  const ctx = newCtx({ purpose: "inbound" });
  ctx.endCall = () => { setTimeout(() => finish("ended_by_kevin"), 3_500); }; // let the goodbye play
  const outQueue: string[] = [];
  const transcript: { role: string; text: string; at: string }[] = [];
  let callerText = "", kevinText = "";
  const startedAt = Date.now();

  const flush = (who: "caller" | "kevin") => {
    let text = (who === "caller" ? callerText : kevinText).trim();
    if (who === "caller" && helloEchoPending && text) { helloEchoPending = false; if (isCallerHelloEcho(text)) text = ""; }
    if (text) transcript.push({ role: who, text, at: new Date().toISOString() });
    if (who === "caller") callerText = ""; else kevinText = "";
  };
  const startPacer = () => {
    if (pacer) return;
    pacer = setInterval(() => {
      const frame = outQueue.shift();
      if (frame && streamSid && twilioWs.readyState === WebSocket.OPEN) twilioWs.send(JSON.stringify({ event: "media", streamSid, media: { payload: frame } }));
      if (!outQueue.length && pacer) { clearInterval(pacer); pacer = null; }
    }, 20);
  };
  const maxTimer = setTimeout(() => finish("max_duration"), MAX_CALL_MS);
  const silenceTimer = setInterval(() => { if (Date.now() - lastCallerVoice > SILENCE_HANGUP_MS) finish("silence"); }, 5_000);

  function finish(outcome: string): void {
    if (closed) return;
    closed = true;
    clearTimeout(maxTimer); clearInterval(silenceTimer);
    if (pacer) clearInterval(pacer);
    flush("caller"); flush("kevin");
    try { openAi?.close(); } catch { /* ignore */ }
    try { if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close(1000, outcome.slice(0, 100)); } catch { /* ignore */ }
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    console.log(`${LOG} ${ctx.purpose} call ended (${outcome}) after ${seconds}s call=${ctx.callSid ?? "?"} incident=${ctx.incidentId ?? "-"}`);
    void (async () => {
      const waitTools = Date.now();
      while (toolsRunning > 0 && Date.now() - waitTools < 15_000) await new Promise((r) => setTimeout(r, 250));
      if (ctx.callSid) {
        const result = ctx.purpose === "escalation" && !ctx.achieved ? "ended_unconfirmed" : outcome;
        await pool.query(
          `INSERT INTO kevin_calls (call_sid, purpose, incident_id, on_call_id, tenant_id, phone_e164, ended_at, duration_seconds, outcome, transcript)
           VALUES ($1, $2, $3, $4, $5, $6, now(), $7, $8, $9::jsonb)
           ON CONFLICT (call_sid) DO UPDATE SET ended_at = now(), duration_seconds = EXCLUDED.duration_seconds,
             outcome = CASE WHEN kevin_calls.outcome IN ('acknowledged', 'declined') THEN kevin_calls.outcome ELSE EXCLUDED.outcome END,
             transcript = EXCLUDED.transcript, incident_id = COALESCE(kevin_calls.incident_id, EXCLUDED.incident_id),
             tenant_id = COALESCE(kevin_calls.tenant_id, EXCLUDED.tenant_id)`,
          [ctx.callSid, ctx.purpose, ctx.incidentId, ctx.onCallId, ctx.verifiedTenantId, ctx.callerE164, seconds, result, JSON.stringify(transcript)],
        ).catch((e) => console.error(`${LOG} call log failed:`, e.message));
      }
      if (!ctx.achieved && ctx.incidentId && ctx.purpose !== "inbound") await retryAfter(ctx.purpose, ctx.incidentId).catch(() => {});
      if (ctx.purpose === "inbound") {
        await recordMissedRequests(ctx, transcript).catch((e) => console.error(`${LOG} missed-request check:`, e?.message ?? e));
        if (ctx.reported.size) await sendOfficeNotices([...ctx.reported]).catch((e) => console.error(`${LOG} office notices:`, e?.message ?? e));
      }
    })();
  }

  async function openLive(): Promise<void> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) { console.error(`${LOG} OPENAI_API_KEY is missing`); finish("no_ai_key"); return; }
    const setup = await kevinSetup(ctx);
    if (!setup) { finish("no_incident"); return; }
    openAi = new WebSocket(LIVE_URL, { headers: { Authorization: `Bearer ${key}` } });
    openAi.on("open", () => {
      openAi!.send(JSON.stringify({
        type: "session.start",
        session: {
          model: "gpt-live-1",
          instructions: setup.voice,
          audio: { format: { type: "audio/pcmu", rate: 8000 }, output: { voice: VOICE } },
          delegation: { type: "responses", responses: { model: BACKEND_MODEL, instructions: setup.backend, tools: setup.tools, tool_choice: "auto" } },
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
        openAi!.send(JSON.stringify({ type: "session.instructions.append", delegation_id: null, content: setup.greeting }));
        // GPT-Live starts talking once it hears something: a "Hello?" only it hears, as on Tom's line.
        const hello = callerHelloChunks();
        if (hello) { helloEchoPending = true; for (const audio of hello) openAi!.send(JSON.stringify({ type: "session.input_audio.append", audio })); }
        return;
      }
      if (type === "session.input_transcript.delta") { if (kevinText) flush("kevin"); callerText += msg.delta ?? ""; return; }
      if (type === "session.output_transcript.delta") { if (callerText) flush("caller"); kevinText += msg.delta ?? ""; return; }
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
        console.log(`${LOG} tool ${name} call=${ctx.callSid ?? "?"}`);
        toolsRunning += 1;
        void runKevinTool(ctx, name, args)
          .catch((e) => { console.error(`${LOG} tool ${name} failed:`, e?.message ?? e); return { success: false, message: "Something went wrong; don't say it was done." }; })
          .then((result) => {
            toolsRunning -= 1;
            if (!openAi || openAi.readyState !== WebSocket.OPEN) return;
            openAi.send(JSON.stringify({ type: "response.item.create", item: { type: "function_call_output", call_id: callId, output: JSON.stringify(result) } }));
            if (toolsRunning === 0) openAi.send(JSON.stringify({ type: "response.create" }));
          });
        return;
      }
      if (type === "error") console.error(`${LOG} OpenAI error:`, msg.error?.message ?? JSON.stringify(msg));
    });
    openAi.on("close", () => finish("ai_closed"));
    openAi.on("error", (e) => console.error(`${LOG} OpenAI socket error:`, e.message));
  }

  twilioWs.on("message", (raw: Buffer | string) => {
    let msg: any;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.event === "start") {
      streamSid = msg.start?.streamSid ?? null;
      ctx.callSid = msg.start?.callSid ?? null;
      const p = msg.start?.customParameters ?? {};
      ctx.purpose = (["escalation", "tenant_update"].includes(p.purpose) ? p.purpose : "inbound") as Purpose;
      ctx.incidentId = Number(p.incident) || null;
      ctx.onCallId = Number(p.onCall) || null;
      ctx.callerE164 = toE164US(String(p.party ?? "")) ?? null;
      console.log(`${LOG} ${ctx.purpose} call started call=${ctx.callSid ?? "?"} incident=${ctx.incidentId ?? "-"}`);
      void (async () => {
        if (ctx.purpose === "inbound") {
          ctx.candidates = await loadCandidates(ctx.callerE164).catch(() => []);
          if (ctx.callSid) await pool.query(`INSERT INTO kevin_calls (call_sid, purpose, phone_e164) VALUES ($1, 'inbound', $2) ON CONFLICT (call_sid) DO NOTHING`, [ctx.callSid, ctx.callerE164]).catch(() => {});
        }
        await openLive();
      })().catch((e) => { console.error(`${LOG} could not start the AI:`, e?.message ?? e); finish("ai_error"); });
      return;
    }
    if (msg.event === "media") {
      const payload = msg.media?.payload as string | undefined;
      if (!payload) return;
      const voiced = callerSpeaking(payload);
      if (voiced) lastCallerVoice = Date.now();
      if (aiSpeaking && voiced) {
        if (++interruptStreak >= INTERRUPT_FRAMES) {
          interruptStreak = 0; aiSpeaking = false; outQueue.length = 0;
          if (streamSid) twilioWs.send(JSON.stringify({ event: "clear", streamSid }));
        }
      } else interruptStreak = 0;
      if (started && openAi?.readyState === WebSocket.OPEN) openAi.send(JSON.stringify({ type: "session.input_audio.append", audio: payload }));
      return;
    }
    if (msg.event === "stop") finish("hung_up");
  });
  twilioWs.on("close", () => finish("hung_up"));
  twilioWs.on("error", (e) => console.error(`${LOG} Twilio socket error:`, e.message));
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export function setupKevinRoutes(httpServer: HttpServer, app: Express): void {
  const streamTwiml = (appUrl: string, params: Record<string, string>) => {
    const url = `${appUrl.replace(/^http/i, "ws")}${STREAM_BASE}/${issueStreamPass("kevin", 0)}`;
    const ps = Object.entries(params).map(([k, v]) => `<Parameter name="${k}" value="${xml(v)}" />`).join("");
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${url}">${ps}</Stream></Connect></Response>`;
  };
  const sayAndHangUp = (res: Response, text: string) =>
    res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Matthew">${xml(text)}</Say><Hangup/></Response>`);

  // Someone calls the line.
  app.post(WEBHOOK_PATH, async (req: Request, res: Response) => {
    const appUrl = publicAppUrl();
    if (!appUrl || !validTwilio(req, appUrl)) return res.status(403).type("text/plain").send("Forbidden");
    const busy = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM kevin_calls WHERE ended_at IS NULL AND started_at > now() - interval '16 minutes'`,
    ).catch(() => ({ rows: [{ n: 0 }] }));
    if (busy.rows[0].n >= MAX_CONCURRENT) {
      return sayAndHangUp(res, `Thanks for calling ${KEVIN_COMPANY}. All of our lines are busy. If anyone is in danger, hang up and call 911. Otherwise please call back in a few minutes.`);
    }
    console.log(`${LOG} incoming call from ${String(req.body?.From ?? "unknown")}`);
    return res.type("text/xml").send(streamTwiml(appUrl, { purpose: "inbound", party: String(req.body?.From ?? "") }));
  });

  // Kevin's own call was answered. A machine gets a short message and never counts as reaching anyone.
  app.post(`${WEBHOOK_PATH}/outbound`, async (req: Request, res: Response) => {
    const appUrl = publicAppUrl();
    if (!appUrl || !validTwilio(req, appUrl)) return res.status(403).type("text/plain").send("Forbidden");
    const purpose = String(req.query.purpose ?? "");
    const incident = Number(req.query.incident);
    const answeredBy = String(req.body?.AnsweredBy ?? "");
    const callSid = String(req.body?.CallSid ?? "");
    await pool.query(`UPDATE kevin_calls SET answered_by = $2 WHERE call_sid = $1`, [callSid, answeredBy || null]).catch(() => {});
    if (/^machine|^fax/.test(answeredBy)) {
      await pool.query(`UPDATE kevin_calls SET outcome = 'voicemail' WHERE call_sid = $1`, [callSid]).catch(() => {});
      if (purpose === "tenant_update") {
        return sayAndHangUp(res, `Hi, this is Kevin with ${KEVIN_COMPANY}, about the maintenance problem you reported. Please call us back at 970-408-2979 for an update. If anything becomes dangerous, call 911.`);
      }
      return sayAndHangUp(res, `This is Kevin with ${KEVIN_COMPANY} with an emergency maintenance call. I'll call back shortly. Please pick up.`);
    }
    return res.type("text/xml").send(streamTwiml(appUrl, {
      purpose, incident: String(incident), onCall: String(req.query.onCall ?? ""), party: String(req.body?.To ?? ""),
    }));
  });

  // Kevin's call ended. Not answered, busy, failed or voicemail: the next try (the conversation's own end does the rest).
  app.post(`${WEBHOOK_PATH}/status`, async (req: Request, res: Response) => {
    const appUrl = publicAppUrl();
    if (!appUrl || !validTwilio(req, appUrl)) return res.status(403).type("text/plain").send("Forbidden");
    const purpose = String(req.query.purpose ?? "") as Purpose;
    const incident = Number(req.query.incident);
    const status = String(req.body?.CallStatus ?? "");
    const callSid = String(req.body?.CallSid ?? "");
    const answeredBy = String(req.body?.AnsweredBy ?? "");
    const machine = /^machine|^fax/.test(answeredBy);
    await pool.query(
      `UPDATE kevin_calls SET ended_at = COALESCE(ended_at, now()), outcome = COALESCE(outcome, $2), answered_by = COALESCE(answered_by, NULLIF($3, '')) WHERE call_sid = $1`,
      [callSid, status === "no-answer" ? "no_answer" : machine ? "voicemail" : status, answeredBy],
    ).catch(() => {});
    if (incident && (status !== "completed" || machine)) await retryAfter(purpose, incident).catch(() => {});
    return res.status(204).end();
  });

  const wss = new WebSocketServer({ noServer: true });
  wss.on("connection", (ws: WebSocket) => runKevinCall(ws));
  httpServer.on("upgrade", (req, socket, head) => {
    const pathname = req.url?.split("?")[0] ?? "";
    if (pathname !== STREAM_BASE && !pathname.startsWith(STREAM_BASE + "/")) return;
    if (redeemStreamPass("kevin", passFromPath(pathname, STREAM_BASE)) !== 0) {
      console.warn(`${LOG} stream refused — no valid one-time pass`);
      try { socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n"); } catch { /* ignore */ }
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req as any, socket as any, head, (ws) => wss.emit("connection", ws, req));
  });

  const timer = setInterval(() => { void runDue().catch((e) => console.error(`${LOG} scheduler:`, e?.message ?? e)); }, 15_000);
  timer.unref();
}
