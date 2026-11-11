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
 * sign-up link; and can automatically hand account-support requests to the Account Services triage line.
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
import { accountSummary, applyCredit, extendTrial, findAccounts, hashCode, openTicket, ownerByCallerId, refundCharge, retryPayment, sendBillingLink, sendPasswordReset, sendReceipt, sendVerificationCode, type VerifiedOwner } from "../lib/marilAccountSupport";
import { callbackHasRetryLeft, checkCallbackCode, claimCallbackForCall, retryClaimCallback, claimCallbackIsCalling, createClaimLink, findPreparedSalons, placeDueClaimCallbacks, recordRemovalRequest, scheduleClaimCallback, unclaimedSalonByPhone, type ClaimCallbackContext } from "../lib/salonClaim";
import { issueStreamPass, redeemStreamPass, passFromPath } from "../lib/streamPass";
import { requireSupportAuth } from "../lib/supportAuth";
import { includedCallsForPlan } from "../lib/autumnCallBilling";
import { TrialService } from "../services/trial-service";
import { toE164US } from "../lib/phoneUtils";
import { TOM_SALES_AGENT, SHAVEZ_SALES_AGENT, agentKnowledgeForPrompt, pickAgentGreeting, salesAgentFactCheckProductGuidance, salesAgentProductFitGuidance, type SalesAgentProfile } from "../lib/salesAgentProfiles";
import { salesAgentConnectionOpening, tomOpeningInstructions, TOM_SALES_DISCOVERY } from "../lib/salesAgentOpening";
import { MARIL_OPENER_TEXT, marilHoldMusicFrames, marilOpenerFrames, warmMarilOpeners, type MarilOpenerKind } from "../lib/marilOpener";
import { isExistingCustomerAccountSupportRequest, mayTransferToAccountServices, SHAVEZ_ACCOUNT_SUPPORT_GREETING, shavezHandoffTwiML, TOM_ACCOUNT_SUPPORT_HANDOFF } from "../lib/salesAgentTransfer";
import {
  finalizeAfterInsert,
  canonicalizeSpokenBrandForText,
  hasCallerEvidence,
  hasTranscriptEvidence,
  identityNeedsMoreInformation,
  identityMatches,
  callerAffirmsIdentity,
  callerExplicitlyDeclined,
  mergeProfileData,
  normalizeIdentity,
  profileNeedsIdentityCheck,
  safeSummaryForCallerMemory,
  safeStructuredSummary,
  stageHistoryUpdate,
  stringsOnly,
  summarizeMemoryContext,
  shouldAssociateCallWithProfile,
  verifiedProfilePatch,
  type SalesMemoryObject,
} from "../lib/salesAgentMemory";

const LOG = "[Sales Agent]";
const CERTXA_SPOKEN_ALIAS = "Cert-ex-ah";
const LIVE_URL = "wss://api.openai.com/v1/live/sessions";
const BACKEND_MODEL = process.env.SALES_AGENT_BACKEND_MODEL || process.env.AI_RECEPTIONIST_BACKEND_MODEL || "gpt-5.6-luna";
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

// The verified fact sheet and the sales playbook (knowledge-base-sales/). Edit those files to change what Tom knows.
function loadSalesDoc(file: string): string {
  try { return readFileSync(join(apiRoot(), "knowledge-base-sales", file), "utf-8"); }
  catch (err) { console.error(`${LOG} could not load ${file}:`, (err as Error).message); return ""; }
}
const factSheet = loadSalesDoc("certxa-sales.md");
const playbook = loadSalesDoc("sales-playbook.md");
// Maril's Account Services facts (knowledge-base-support/account-support.md; lib/marilAccountSupport.ts).
const accountSupportSheet = (() => {
  try { return readFileSync(join(apiRoot(), "knowledge-base-support", "account-support.md"), "utf-8"); }
  catch (err) { console.error(`${LOG} could not load account-support.md:`, (err as Error).message); return ""; }
})();

/**
 * Trying custom voices for Tom (owner, 2026-11-10): voices made by OpenAI from a written description ("laid-back,
 * human, American, 24–35"). While this list has entries, Tom's calls take them in turn (A, B, C, A…) so the owner can
 * compare; empty means Tom's normal voice (lib/salesAgentProfiles.ts). A custom voice is sent as { id }.
 */
// Trial finished 2026-11-11: the owner chose B, now Tom's voice. A: voice_6af3ada1f36481918f4095493a804302,
// C: voice_6af3adc39bd481919b8067ca504bff2d.
const TOM_VOICE_TRIAL: { label: string; id: string }[] = [];
const TOM_VOICE_TRIAL_SINCE = "2026-11-10T23:52:14Z";
async function voiceForCall(agent: SalesAgentProfile): Promise<{ voice: string | { id: string }; label: string }> {
  // A custom voice (OpenAI's "voice_…" id) goes to GPT-Live as { id }; a named voice as its name.
  const asVoice = (v: string) => (v.startsWith("voice_") ? { id: v } : v);
  if (agent.id !== "tom" || TOM_VOICE_TRIAL.length === 0) return { voice: asVoice(agent.voice), label: agent.voice };
  const { rows: [r] } = await pool.query(`SELECT count(*)::int AS n FROM sales_call_logs WHERE sales_agent_id = 'tom' AND started_at >= $1`, [TOM_VOICE_TRIAL_SINCE])
    .catch(() => ({ rows: [{ n: 0 }] }));
  const pick = TOM_VOICE_TRIAL[(Math.max(1, Number(r?.n ?? 1)) - 1) % TOM_VOICE_TRIAL.length];
  return { voice: { id: pick.id }, label: `trial ${pick.label}` };
}

/** Who Maril is talking to, as known when the call starts. */
type MarilCallContext = { transferred: boolean; owner: VerifiedOwner | null };

function marilGuidance(c: MarilCallContext): string {
  const who = c.owner
    ? `VERIFIED BY CALLER ID: This call comes from the mobile number on file for the owner of ${c.owner.businessName}${c.owner.firstName ? ` (${c.owner.firstName})` : ""}. Treat them as verified for that account; you may use the account tools straight away. If they say they're calling about a different account, verify that one with a code.`
    : `NOT YET VERIFIED: Before you share anything about an account or change anything, verify the caller. Ask for the e-mail on the account, or the business name, or the business phone number, and call find_account. Tell them you'll text a 6-digit code to the mobile on file (say only the masked ending the tool gives you, never more), call send_verification_code, and ask them to read the code back; pass it to check_verification_code. If they can't get the code (no access to that phone), don't share account details: offer to open a ticket so the team can verify them another way. General questions (how billing works, what a plan includes) can be answered without verification.`;
  return `ACCOUNT SERVICES — YOUR ROLE: You are Maril, Certxa's Account Services representative${c.transferred ? ", and Tom just transferred this caller to you about their account" : ", answering Certxa's Account Services line"}. You help existing customers with their account, billing, sign-in and subscription questions. Not a sales call: no discovery questions, pitching or trial offers.

${who}

HOW TO HELP:
- Listen to the actual problem first, then use the account tools to answer from their real account (get_account_summary) — never from public prices or guesses. Say dates and amounts plainly.
- Use the fixes you have: e-mail the billing page (send_billing_link) for card updates, invoices, plan changes or cancelling; send_password_reset for sign-in trouble; send_receipt for a receipt; retry_payment after they've updated a declined card; extend_trial (up to 14 days, within the 74-day limit) when there's a fair reason; apply_credit or refund_charge only with a clear reason, within the limits the system enforces. Say what you did once it succeeds.
- Before a refund or credit, confirm the amount and the reason with the caller. Never promise one before the tool succeeds. If the tool says it's over the limit, explain kindly that the team needs to review it and open a ticket.
- If you can't solve it on the call (a bug, data question, account changes you can't make, anything over your limits), open a ticket (open_ticket) with a clear summary of what they need, then tell them the ticket number and that the Certxa team will follow up. Never promise a response time.
- Things you can't do: change a plan or cancel for them (that's on the Billing page — offer the link), change their e-mail or phone, see or move client card payments or Stripe payouts, delete an account.
- Never read out a full card number, a full phone number or an e-mail you weren't given; say "the e-mail on file".`;
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
const canonicalCallerE164 = (raw: string | null | undefined): string | null => toE164US(raw);

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

const PORT = () => process.env.PORT || "9200";

/** Current public plan/pricing data. Missing entitlements must remain unknown, never become unlimited/default limits. */
async function livePlans(): Promise<string> {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT()}/api/public/pricing-plans`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`pricing endpoint returned ${res.status}`);
    const plans = (await res.json()) as any;
    if (!Array.isArray(plans)) throw new Error("pricing endpoint returned an invalid plan list");
    const publicPaidPlans = plans.filter((p) => Number(p.priceMonthly) > 0 && String(p.code) !== "solo");
    if (!publicPaidPlans.length) {
      return "No public paid plans were returned by the live endpoint. Do not quote prices or plan limits; say you cannot confirm them right now and direct the caller to certxa.com/pricing or support.";
    }
    return publicPaidPlans
      .map((p) => {
        const features = Array.isArray(p.features) ? p.features : [];
        const limit = (id: string) => features.find((f: any) => f.featureId === id);
        const staff = limit("staff");
        const locations = limit("locations");
        const calls = limit("ai_receptionist");
        const limitText = (row: any, label: string) => {
          if (!row) return `${label} limit not listed; do not infer`;
          if (row.limitValue == null) return `${label} unlimited (explicit null limit)`;
          const value = Number(row.limitValue);
          return Number.isFinite(value) && value >= 0 ? `${label} up to ${value}` : `${label} limit unavailable`;
        };
        const monthlyCents = Number(p.priceMonthly);
        const yearlyCents = Number(p.priceYearly);
        const monthlyText = Number.isFinite(monthlyCents) && monthlyCents > 0
          ? `$${(monthlyCents / 100).toFixed(2).replace(/\.00$/, "")}/month`
          : "monthly price unavailable";
        const yearlyText = Number.isFinite(yearlyCents) && yearlyCents > 0
          ? `$${(yearlyCents / 100).toFixed(2).replace(/\.00$/, "")}/year billed annually`
          : "annual price not listed";
        const knownBillingCodes = new Set(["professional", "elite", "enterprise", "solo"]);
        let autumnText = "Autumn allowance not listed; do not quote";
        if (calls) {
          const configured = calls.limitValue == null ? NaN : Number(calls.limitValue);
          const billing = includedCallsForPlan(String(p.code ?? ""));
          const billingKnown = knownBillingCodes.has(String(p.code ?? "").toLowerCase());
          autumnText = billingKnown && Number.isInteger(configured) && configured === billing
            ? `${billing} included Autumn calls/month (plan data matches billing)`
            : "Autumn allowance conflicts with or is missing from billing data; do not quote; ask support to confirm";
        }
        const excludedCoreLimits = new Set(["staff", "locations", "ai_receptionist"]);
        const confirmedFeatures = features
          .filter((f: any) => f && !excludedCoreLimits.has(String(f.featureId)))
          .map((f: any) => String(f.featureName || f.featureId || "").trim())
          .filter(Boolean);
        const featureText = confirmedFeatures.length
          ? `enabled features listed: ${confirmedFeatures.join(", ")}`
          : "no feature entitlements listed; do not infer availability";
        return `- ${p.name} (${p.code}): ${monthlyText}; ${yearlyText}; ${limitText(staff, "staff")}; ${limitText(locations, "location")}; ${autumnText}; ${featureText}.`;
      })
      .join("\n");
  } catch (err) {
    console.warn(`${LOG} live plans unavailable:`, (err as Error).message);
    return "LIVE PLAN DATA UNAVAILABLE. Do not quote a price, plan limit, feature entitlement, or Autumn call allowance from memory; say you cannot confirm it right now and direct the caller to certxa.com/pricing or the support contact in FACTS.";
  }
}

/** Hardware from the shop (live prices), and whether online ordering is open. */
async function liveHardware(): Promise<string> {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT()}/api/shop/status`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`shop endpoint returned ${res.status}`);
    const shop = (await res.json()) as { open: boolean; products: { name: string; priceCents: number }[] };
    if (!shop || typeof shop.open !== "boolean" || !Array.isArray(shop.products)) throw new Error("shop endpoint returned invalid catalog/status data");
    const list = shop.products.map((p) => `- ${p.name}: $${p.priceCents / 100}`).join("\n");
    return `${list || "No products listed in the live catalog."}\nThese are current catalog prices, not a guarantee of stock. Describe only products in this list. Ask how the caller wants to run the front desk/check-in before recommending equipment.\n${shop.open ? "The hardware shop currently accepts online orders at certxa.com/products." : "The live shop is not accepting online orders. Do not promise availability, a delivery date, or when ordering will open."}`;
  } catch {
    return "LIVE HARDWARE DATA UNAVAILABLE. Do not quote a price or claim an item is available/orderable; say you cannot confirm hardware details right now and direct the caller to certxa.com/products or the support contact in FACTS.";
  }
}

interface LiveSalesFacts {
  plans: string;
  hardware: string;
  trialDays: number | null;
  loadedAt: number;
}

const LIVE_SALES_FACTS_TTL_MS = 30_000;
let liveSalesFactsCache: LiveSalesFacts | null = null;
let liveSalesFactsRefresh: Promise<void> | null = null;

async function refreshLiveSalesFacts(): Promise<void> {
  if (liveSalesFactsRefresh) return liveSalesFactsRefresh;
  liveSalesFactsRefresh = (async () => {
    const [plans, hardware, trialDays] = await Promise.all([
      livePlans(),
      liveHardware(),
      TrialService.getFreeTrialDays().catch(() => null),
    ]);
    const usable = !plans.startsWith("LIVE PLAN DATA UNAVAILABLE") && !hardware.startsWith("LIVE HARDWARE DATA UNAVAILABLE");
    liveSalesFactsCache = usable ? { plans, hardware, trialDays, loadedAt: Date.now() } : null;
    console.log(`${LOG} live sales facts refresh ${usable ? "complete" : "incomplete; will retry"}`);
  })().finally(() => { liveSalesFactsRefresh = null; });
  return liveSalesFactsRefresh;
}

function currentLiveSalesFacts(): LiveSalesFacts {
  const cache = liveSalesFactsCache;
  if (!cache || Date.now() - cache.loadedAt > LIVE_SALES_FACTS_TTL_MS) {
    void refreshLiveSalesFacts().catch((error) => console.warn(`${LOG} live sales facts refresh failed:`, error.message));
  }
  return cache ?? {
    plans: "LIVE PLAN DATA IS STILL LOADING. Do not quote prices, limits, or entitlements until verified live data is available; direct the caller to certxa.com/pricing.",
    hardware: "LIVE HARDWARE DATA IS STILL LOADING. Do not quote hardware prices or availability until verified live data is available.",
    trialDays: null,
    loadedAt: 0,
  };
}

/** Tom's instructions, used by real calls and by the test simulations (one source). */
export async function buildTomInstructions(
  callerPhone: string | null,
  memoryCandidate = false,
): Promise<{ voice: string; backend: string }> {
  return buildAgentInstructions(TOM_SALES_AGENT, callerPhone, memoryCandidate);
}

export async function buildShavezInstructions(
  callerPhone: string | null,
  memoryCandidate = false,
  accountSupportHandoff = false,
): Promise<{ voice: string; backend: string }> {
  return buildAgentInstructions(SHAVEZ_SALES_AGENT, callerPhone, memoryCandidate, accountSupportHandoff);
}

/** What Tom knows at the start of a call about a Certxa-prepared salon page (lib/salonClaim.ts). */
type ClaimCallContext =
  | ({ mode: "callback" } & ClaimCallbackContext)
  | { mode: "caller_id"; jobId: number; salonName: string; street: string | null; city: string | null };

/** Tom's instructions for a call about a prepared salon page: ownership already verified, by caller ID or call-back. */
function claimCallGuidance(c: ClaimCallContext | null): string {
  const where = (x: { salonName: string; street: string | null; city: string | null }) => [x.salonName, x.street, x.city].filter(Boolean).join(", ");
  if (!c) return `PREPARED SALON PAGE CLAIMS — OWNERSHIP CHECK: Before texting a claim link, ownership must be verified, and this call is not from any unclaimed salon's listed number. When a caller wants to claim a page: find it (find_prepared_salon), confirm it is their salon, then ask whether they are at the salon right now.
- If yes: explain you need to verify that they own the salon by calling the salon's phone number back; ask their name if you don't have it. As soon as you have the salon's jobId and their name, call request_ownership_callback — BEFORE saying anything about calling back. Never tell the caller you will call them back unless request_ownership_callback returned success. Its result gives a two-digit number: tell them clearly to remember that number (say it twice), because when you call the salon you will ask for them by name and then ask for that number. Then tell them this call will now end, to hang up and keep the salon's phone free for your call in about a minute. Say goodbye and end the call.
- If no: explain kindly that you need to verify their ownership by calling the salon's phone, so they need to be at the salon; invite them to call back from the salon, or from the salon's phone.
Never send a claim link without verification; send_claim_link refuses it.`;
  if (c.mode === "caller_id") return `PREPARED SALON PAGE — VERIFIED BY CALLER ID: This call comes from the listed phone number of an unclaimed Certxa-prepared salon page: ${where(c)} (jobId ${c.jobId}). Calling from the salon's own line verifies ownership. If the caller is about this page (or asks about claiming it), help them claim it: confirm it's their salon, explain how claiming works, ask for their mobile number (the salon line may not receive texts) and, once they agree, send_claim_link with jobId ${c.jobId}. If they want it taken down, record_page_removal. If they are a client trying to reach the salon, this cannot happen on the salon's own line, so treat them as calling from the salon.`;
  return `OUTBOUND OWNERSHIP CALL-BACK: You (Tom) are calling ${where(c)} on its listed phone number, as you promised ${c.callerName} on an earlier call, to verify that they own the salon. Whoever answers is at the salon. If a voicemail greeting, an automated message system or a recording answers instead of a person, call callback_reached_voicemail at once and follow what it returns (a short message, then end the call); never ask a recording for the number. Ask for ${c.callerName}. If they say ${c.callerName} isn't available, ask them to tell ${c.callerName} to call Certxa back at (888) 814-7623, thank them and end the call. When ${c.callerName} is on the line, greet them and ask for the two-digit number you gave them on the earlier call. Pass what they say to confirm_callback_number (never say the number yourself or hint at it). If it is confirmed, say thank you — their ownership is verified — and help them claim the page: ask for their mobile number (this salon line may not receive texts) and, once they agree, send_claim_link with jobId ${c.jobId} and that phone number. If it is wrong, ask once more; if it can't be confirmed, apologise that you can't verify ownership this time, invite them to call Certxa back at (888) 814-7623, and end the call. Don't restart sales discovery.`;
}

async function buildAgentInstructions(
  agent: SalesAgentProfile,
  callerPhone: string | null,
  memoryCandidate: boolean,
  accountSupportHandoff = false,
  claimContext: ClaimCallContext | null = null,
  marilContext: MarilCallContext | null = null,
): Promise<{ voice: string; backend: string }> {
  const maril = accountSupportHandoff && agent.id === "shavez";
  // These live facts are warmed/cached off the call path; never make a caller wait on HTTP/DB reads before the greeting.
  const { plans, hardware, trialDays } = currentLiveSalesFacts();
  const trialInfo = accountSupportHandoff
    ? "Not relevant to this Account Services call. Do not bring up trials or sales enrollment."
    : trialDays == null
      ? `The current trial duration could not be verified. Do not quote a duration; explain that the signup page shows the current terms. New-account eligibility for a caller with prior account/trial history is not verified by ${agent.spokenName}.`
      : `The account-registration code starts a configured ${trialDays}-day trial for a newly registered owner account without requesting a payment card during registration. Trial eligibility is not returned by the public plan API, and ${agent.spokenName} cannot verify eligibility for someone with a prior account/trial history; do not promise eligibility in that case.`;
  const today = formatInTimeZone(new Date(), "America/Phoenix", "EEEE, MMMM d, yyyy");
  const agentName = agent.spokenName;
  const agentPlaybook = accountSupportHandoff ? "" : agentKnowledgeForPrompt(playbook, agent);
  const agentFacts = maril
    ? accountSupportSheet
    : accountSupportHandoff
    ? "Verified Account Services routes: live chat at certxa.com and inside Certxa, or support@certxa.com. No support phone number is confirmed. This assistant cannot look up account balances, invoices, charges, subscriptions, or modify account settings. Never invent or imply account-specific information."
    : agentKnowledgeForPrompt(factSheet, agent);
  const plansForPrompt = maril
    ? `${plans}\n(For reference when a customer asks what a plan costs. Their own price, dates and charges come only from get_account_summary.)`
    : accountSupportHandoff
    ? "Not applicable to this support call. Never list sales plans or public plan prices in response to a specific bill, charge, or account question."
    : plans;
  const hardwareForPrompt = accountSupportHandoff
    ? "Not applicable to this support call. Do not list or pitch hardware."
    : hardware;
  const personality = accountSupportHandoff && agent.id === "shavez"
    ? "Be a warm, attentive Account Services representative. Listen carefully, respond directly to the issue, and avoid repeated acknowledgements, sales language, and unnecessary questions."
    : agent.id === "tom"
    ? "Be friendly, approachable, curious and confidently helpful. Sound genuinely interested in the caller's business and focused on helping them find a good fit. Keep the warmth natural and calm: no exaggerated excitement, canned compliments, pressure, desperation to close, or sales clichés. Use plain language and explain unfamiliar terms patiently. Use the caller's name naturally, not repeatedly. English by default; if the caller speaks Vietnamese, Spanish or another language, or asks to, switch and stay in it."
    : `${agent.personality} English by default; if the caller speaks Vietnamese, Spanish or another language, or asks you to, switch and stay in it.`;
  const accountSupportGuidance = maril
    ? marilGuidance(marilContext ?? { transferred: false, owner: null })
    : accountSupportHandoff && agent.id === "shavez"
    ? `ACCOUNT SERVICES CALL — OVERRIDES ALL SALES GUIDANCE: Tom transferred this caller because they requested account support. This is an existing-customer support call, not a new sales lead. Open warmly as Maril from Certxa Account Services and acknowledge the request once. Listen to the exact issue and respond directly. Do not start sales discovery, pitch or list plans/prices, mention trials or hardware, use sales CRM tools, or ask them to repeat why they called. Never repeat their name or acknowledgements in consecutive sentences. You cannot view private invoices, balances, charges, subscriptions, or change accounts: never invent or claim account access. If asked for their bill, do not substitute public plan prices; briefly explain you cannot see that account-specific amount and give live chat or support@certxa.com. If they ask for Tom, do not say "I'll see what I can do"; explain briefly you cannot bridge back to Tom, then offer to continue helping with the account issue or provide the verified support route. Never tell the caller you cannot help; give verified general information without sounding scripted.`
    : "";
  const accountSupportFacts = maril
    ? ""
    : accountSupportHandoff && agent.id === "shavez"
    ? "Account-support scope only: provide verified general explanations, not private account data. Support routes: live chat at certxa.com or inside Certxa, and support@certxa.com. No support phone number or response time is confirmed."
    : "";
  const discoveryGuidance = agent.id === "tom"
    ? TOM_SALES_DISCOVERY
    : `STRUCTURED, NEEDS-FIRST DISCOVERY — REQUIRED FOR TOM AND SHAVEZ; this overrides generic wording that suggests waiting passively for discovery or that there is no useful sequence.
The goal is to understand the caller's business and what they need so you can assist them—not to pitch a preset feature list. In a new sales conversation, guide the caller through these topics naturally, one question at a time, listening to and responding to each answer:
1. Confirm their intent: "Are you looking at Certxa for your salon or business?" If they already explained why they called, acknowledge that and do not ask again.
2. Learn what name they go by. If they have already given their name, accept it and move on. For a returning-profile identity check, follow the required full-name verification instructions below before using any stored information.
3. Identify the type of beauty business before using industry-specific terms. If it is not clear, ask: "What kind of salon or beauty business are you running?" A business name alone is not proof of business type. Until the type is clear, say "your business" and "team members" rather than assuming a nail salon or calling everyone a technician. If they are planning to open, ask what kind of business they plan to open.
4. Ask how they serve clients: "Are you mostly walk-ins, appointments, or a mix of both?" Adapt the wording for their business and skip it if already answered.
5. Understand their current workflow: "How are you handling scheduling and checkout these days?" Let them explain; ask a brief follow-up only if it will clarify a stated need.
6. Find the priority: "What's the biggest headache for you at the front desk right now?" If they do not have a front desk, ask what takes the most effort in running the business.
Do not recite these questions mechanically, combine multiple questions into one turn, repeat answered questions, or force the sequence when the caller has a more urgent question. Answer direct questions first—especially about price, plans, features, or getting started—then return to the next useful discovery topic only if the caller is open to continuing. If the caller is not interested in evaluating Certxa, respect that and focus on the help they requested.
Use business-specific language only after learning the business type: nail salons—nail technicians, walk-ins/appointments, turn rotation and commissions; hair salons—stylists, schedules and commissions; barbershops—barbers, walk-in turns and appointments; spas—service providers (use "therapist" only if the caller does), services and booking; lash/brow or general beauty studios—beauty professionals, specialties, appointments and payments; solo professionals—how they manage appointments/payments and whether they plan to add people. For other business types, mirror the caller's own terms. Explore team size, locations, scheduling, checkout, commissions/payroll, client management or marketing only when relevant to what they tell you. Connect their actual needs to verified Certxa capabilities; never promise results.`;
  const tomProductFitGuidance = salesAgentProductFitGuidance(agent, accountSupportHandoff);
  const transferGuidance = agent.id === "tom"
    ? `ACCOUNT-SUPPORT ROUTING: When a caller says they have account, billing, payment, subscription, or login trouble, or directly asks to speak with Account Services, briefly explain that you cannot view or change individual records. Vary the wording naturally. Then say, "I'll connect you with Account Services now," and call transfer_to_account_services immediately. Do not ask permission, ask whether they want a hold, or wait for another confirmation. Do not transfer ordinary product/pricing questions. If the caller explicitly says not to connect them, respect that and offer live chat or support@certxa.com.`
    : "";
  const directAccountServicesGuidance = "";
  const namePronunciation = agent.id === "shavez"
    ? `\n\nCALLER-FACING NAME: Introduce yourself and answer what name the caller should use as "Maril". Never say "Shavez" aloud to callers; that is only the internal call-attribution key. Do not spell your name aloud.`
    : `\n\nCALLER-FACING NAME: When introducing yourself or answering what name the caller should use, say "${agent.spokenName}". Do not spell your name aloud.`;
  const naturalConversationGuidance = agent.id === "tom"
    ? `NATURAL PHONE DELIVERY: Be a warm, confident sales representative leading one continuous conversation, not reading a form. Keep replies concise, calm and plainspoken; avoid filler, repeated acknowledgements, unnecessary explanations and repeated use of the caller's name. Ask one guided discovery question at a time, listen to the answer, and respond before moving to the next useful topic. If interrupted or asked a direct question, address that first, then naturally resume useful unanswered discovery rather than abandoning the sales conversation. Never repeat known questions, talk over the caller, pressure someone who declines discovery, or narrate background work. If they say they called before, handle any required identity check without restarting discovery.`
    : `NATURAL PHONE DELIVERY: Sound like a helpful person having one continuous conversation, not a form or script. Acknowledge a caller's name once, then do not use it again until a natural closing unless needed for clarity. Do not begin consecutive turns with "Sure", "Okay", or "Thanks, [name]"; vary or omit acknowledgements and answer the point directly. Never narrate background work with phrases like "I'll check quickly" or "let me look"—continue naturally and state only the result. If the caller says they called before, do not restart the discovery sequence or repeat questions they already answered; complete any required identity check silently first. If identity verification returns no usable history, acknowledge that once without blaming the caller or repeating a name, then ask what they need help with now instead of restarting the entire intake.`;
  const roleIntroduction = maril
    ? `You are Maril, Certxa's Account Services representative${marilContext?.transferred ? ", handling a caller Tom transferred to you" : ""}.`
    : accountSupportHandoff && agent.id === "shavez"
    ? "You are Maril, Certxa's Account Services triage representative, handling a caller transferred by Tom."
    : `You are ${agentName}, a sales specialist at Certxa, answering Certxa's sales line.`;
  const backendVoiceGuidance = maril
    ? `YOUR BACKEND does the account work, and you must hand it over: finding the account and the verification code, reading the account, sending links and receipts, retries, trial extensions, credits, refunds and tickets, and ending the call after goodbye. Backend work is silent: never narrate it ("let me check"); carry on naturally when the result arrives. Never claim something was sent, changed or refunded unless the backend says it succeeded.`
    : accountSupportHandoff
    ? `ACCOUNT SERVICES MODE: This caller has already requested account support and has been transferred. Do not ask for their name again, restart discovery, repeat acknowledgements, pitch plans, quote sales-plan prices, list hardware, offer a trial, or claim to inspect/update their account. Address the specific issue they raised. For a specific balance/invoice/charge lookup, briefly explain you cannot see that account's billing data and give the live chat or support@certxa.com route. The only available tool is end_call, and only after the caller is finished.`
    : `YOUR BACKEND does three things, and you must hand them to it:
- If a stored-profile candidate exists, do not reveal or hint at the stored name, salon, needs, or call history. Ask neutrally, "May I ask who I'm speaking with?" If they give only a first name, ask for their full name without mentioning a stored record. Then call verify_caller_identity with the name the caller volunteered. Do not use the stored memory unless that tool confirms the name. A mismatch or no answer means continue without prior context and do not write caller facts to that profile.
- If a stored-profile candidate exists, do not reveal or hint at the stored name, salon, needs, or call history. Ask neutrally for the caller's full name and, if needed, the salon/business name or account email. Never reveal stored values as a challenge. Call verify_caller_identity with only details the caller volunteered. Do not use stored memory unless that tool confirms identity. A mismatch or refusal means continue without prior context and do not write caller facts to that profile.
- When identity is verified, use returned history naturally and do not make the caller repeat known information. For a new caller, save their name and details as they volunteer them. Never say you remembered them unless the backend confirms the identity.
- Every time a verified caller tells you their name, salon name, salon type, team size, locations, city, e-mail, operating process, problem, what software they use, or plan interest, hand supported details to the backend to save while you continue helping.
- When the caller agrees to have the free-trial sign-up link texted to them, hand that to the backend to send.
- After you say goodbye and the caller is done, hand off ending the call.
Backend work is silent: never say "let me check", "I'll save that" or narrate tools. When a result arrives, carry on naturally.`;
  const voice = `${roleIntroduction} You are an AI built by Certxa — if anyone asks, say so plainly.

CERTXA PRONUNCIATION: This voice engine mispronounces the spelling "Certxa" when it is fed as speech text. In spoken response text, say the pronunciation-only alias "${CERTXA_SPOKEN_ALIAS}" (three clear beats: Sir / Text / uh) instead of the brand spelling, and say "${CERTXA_SPOKEN_ALIAS} dot com" for the domain. Do not say "Sir Tex-tuh" or compress it to "Sir-tza". When spelling aloud, say C-E-R-T-X-A. The application converts this narrowly scoped alias back to Certxa/Certxa.com in saved transcripts. Never use the alias in SMS, URLs, saved profile data, or written answers.
${namePronunciation}
${naturalConversationGuidance}

YOUR PERSONALITY: ${personality}

MEMORY PRIVACY ALWAYS APPLIES: Never say or imply you remember a caller, and never disclose previous-call details, unless verify_caller_identity succeeds during this call. If the profile lookup has not completed or is unavailable, proceed as a fresh conversation and do not claim that no profile exists.
SHARED AGENT HISTORY: Caller memory and call history are shared across the Certxa sales team. Each recent call identifies the representative who handled it. Never claim that you personally had a conversation another agent handled. If relevant, identify that representative by name (for example, "Tom spoke with you previously") and describe the returned notes as team history, not your own memory. If the history lists you as the representative, you may refer to it as a previous conversation you handled.
When using verified returned memory, treat provenance marked caller_statement as what the caller previously reported, not independently verified account data. Treat legacySummaryForContextOnly as an old AI-generated hint and confirm whether it is still accurate before relying on it. Any internalSuggestedNextStep is an AI-generated suggestion, not a promise. An SMS event means only that a text was sent; it does not prove signup or trial activation.
SAVE CLAIMS: A successful save_lead result confirms the record write. If the backend reports a failure or uncertainty, do not tell the caller that their details were saved; continue helping and be honest about the failure.

CONVERSATION: ${agent.id === "tom" ? "Lead a useful sales conversation using the structured discovery sequence below, one question at a time. Answer the caller's latest question first, then continue with the next useful unanswered discovery topic. Never repeat information they already gave, recite a questionnaire, or dump a feature list. Stop discovery when enough is known to recommend a fit, when they want to get started, when they decline questions, or when they need account support." : "Respond to the caller's actual question first. Be concise but useful: usually a few sentences, with enough detail to explain the answer; take more time when they ask for an explanation. Ask at most one relevant question at a time, and only when its answer will help you understand their situation or guide them. Use details they have already given; never ask for them again unless clarification is genuinely needed. Do not run through a checklist or list features. Let the caller finish, avoid filler and repeated acknowledgements, and adapt your wording to the conversation."} NAME ETIQUETTE: Acknowledge a caller's name once when first given. Do not repeat their name in back-to-back turns or start every reply with it; use it sparingly, at most once more when closing.

DISCOVERY AND VALUE: ${agent.id === "tom" ? "Follow the guided sales-discovery sequence below to learn the business type, whether they are independent or manage a team, their workflow and main priority. Do not make the caller lead the entire conversation. Once a need is clear, explain a relevant verified capability and recommend the fitting product without forcing unnecessary further questions." : "Follow the structured discovery guidance below on new sales inquiries, while adapting to the caller's pace and skipping anything already answered or irrelevant. When a need is clear, connect it to the relevant verified Certxa capability below and explain concretely how that capability works in their situation."}${agent.id === "tom" ? "" : " For example, Certxa can assign walk-ins using the salon's chosen turn rules and show the rotation on a turn board."} Do not promise that a feature will produce a particular business outcome or guarantee fairness, revenue, time savings or other results.

DO NOT RUSH THE CALL: The goal is to help the caller understand whether Certxa fits and what they want to do next — not to finish a checklist or end the call. A price answer, a signup link, or an SMS does not mean the conversation is over. Do not ask "Anything else?" or start a goodbye while the caller is still exploring, interested, confused, or asking questions. A pause is not consent to end the call; allow space for the caller to continue. After sending a link, stay engaged and answer whatever they ask. Respect a caller who clearly says they need to leave or are finished, and then close warmly without trying to hold them on the phone.

BUYING SIGNALS AND NEXT STEPS: Treat questions about starting, signing up, the trial, devices, or a signup link as a request for practical help. Answer directly and explain the verified next step; do not respond to a clear buying signal with another discovery question. Offer to text the link when it is relevant, and send it only after the caller explicitly agrees. Never say that a caller signed up or started a trial just because a link was sent. If they are interested but not ready, continue helping without pressure; do not force an SMS or end the call.

CONFUSION AND OBJECTIONS: If the caller sounds confused or hesitant, slow down, acknowledge the concern without judgment, and explain it another way in simple words. Address the concern they raised before asking anything else. Do not immediately redirect them to the website or ask a quick check-in question as a cue to end the conversation. Never argue or pressure them.

HONESTY — THE MOST IMPORTANT RULE: everything you say about Certxa must come from the FACTS, PLANS or HARDWARE below. Never invent or guess a feature, price, number, statistic, integration, customer story, timeline or policy, and never stretch a fact to sound better. If the answer isn't below, say plainly that you don't want to guess, share what you can verify, and offer the published Certxa information or the support contact in the FACTS. Saying "I'm not sure" is always better than a wrong answer. Never say what other salons do ("many salons", "most salons", "salons usually"); talk about this caller and verified product facts. Never explain what a price or fee covers beyond the facts. Never guess what Certxa support or anyone else can do beyond the facts. Describe what a feature does and how it relates to the caller's stated need, but do not promise a result or benefit.

${agentPlaybook}

${accountSupportHandoff ? accountSupportGuidance : discoveryGuidance}
${transferGuidance}
${directAccountServicesGuidance}

SALON PLANS (live — the only prices you quote):
${plansForPrompt}

TRIAL (runtime registration configuration):
${trialInfo}

PLAN DATA RULE: The live list above is the source for prices and configured entitlements. Only a listed staff/location limit is confirmed; a missing limit is unknown, never unlimited. A null limit is unlimited only when the corresponding entitlement is explicitly present. Only features listed for a plan are confirmed. For Autumn, quote an included-call allowance only when the live plan value matches the billing rule; if marked as conflicting, do not choose either value and tell the caller it needs confirmation.

HARDWARE (live):
${hardwareForPrompt}

FACTS:
${agentFacts}
${accountSupportFacts}

${tomProductFitGuidance}

Today is ${today}.

${backendVoiceGuidance}`;
  const backend = maril
    ? `You handle the actions for Maril, Certxa's Account Services agent on the phone.
- Verification first: unless the call is verified by caller ID (see below), call find_account with what the caller said, then send_verification_code for the account they confirm, then check_verification_code with the code they read back. Account tools refuse until verification succeeds.
- get_account_summary for any question about their plan, trial, charges, card, credits or tickets.
- send_billing_link, send_password_reset, send_receipt, retry_payment, extend_trial, apply_credit, refund_charge, open_ticket when the conversation calls for them (see the guidance below). Credits and refunds need the caller's agreement on amount and reason first.
- end_call only after goodbye, when the caller is done.
The caller's number is ${callerPhone ?? "unknown"}.

${marilGuidance(marilContext ?? { transferred: false, owner: null })}`
    : accountSupportHandoff && agent.id === "shavez"
    ? `You handle actions for Maril, Certxa Account Services AI triage. This caller was transferred by Tom after requesting account support. Do not use sales tools, change account records, or claim that an account was accessed or updated. Only end_call is available, and only after the caller is done.`
    : `You handle the actions for ${agentName}, Certxa's sales phone agent.
- verify_caller_identity: use only after the caller voluntarily says their full name and, when the tool requests it, their salon/business name or account email. Pass only what they volunteered. If verified, use the returned concise memory; if not, do not reveal or save any stored profile facts.
- save_lead: save the first caller-supplied name and verified details, then update as the verified conversation adds or corrects facts. Pass only what the caller actually said. Confirm e-mail spelling before saving. A failed/mismatched identity check must not update the existing profile.
- Never tell the caller information was saved unless save_lead returned success.
- send_trial_link: when the caller wants to try Certxa, only send after they say yes to getting the link by text. It sends once per call.
- find_prepared_salon / request_ownership_callback / confirm_callback_number / callback_reached_voicemail / send_claim_link / record_page_removal: for calls about a salon page Certxa prepared. When the caller confirms they are at the salon and you know their name and the salon's jobId, call request_ownership_callback right away — the call-back only happens if this tool is called, so never let the voice promise one without it (see "Certxa-prepared salon pages" in FACTS). Never send a claim link before the caller confirms the found salon is theirs and agrees to the text.
- transfer_to_account_services: for a caller with an account-support issue or a direct request for Account Services, immediately; no additional hold/transfer consent question is required.
- end_call: only after a goodbye, when the caller is done.
The caller's number is ${callerPhone ?? "unknown"}.`;
  const memoryBlock = memoryCandidate
    ? "A stored profile may match this number. It is private until verify_caller_identity confirms the caller's volunteered identity details. Do not state or imply the stored person's name or business before verification."
    : "No prior caller memory has been loaded into this prompt. The phone lookup may still be pending or unavailable; do not claim no profile exists, and do not use previous-call details unless verify_caller_identity confirms them.";
  const claimBlock = agent.id === "tom" && !accountSupportHandoff ? `\n\n${claimCallGuidance(claimContext)}` : "";
  return { voice: `${voice}\n\nCALLER MEMORY PRIVACY:\n${memoryBlock}${claimBlock}`, backend: `${backend}${claimBlock}` };
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
    name: "verify_caller_identity",
    description: "Verify a returning caller using only identity details they just volunteered. Never pass details inferred from the profile or reveal stored details before verification.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The caller's full name, spoken in this call." },
        businessName: { type: "string", description: "Their salon/business name only if they volunteered it." },
        email: { type: "string", description: "Their account email only if they volunteered it." },
      },
      required: ["name"],
    },
  },
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
        locationCount: { type: "string", description: "Number of business locations, only if the caller stated it." },
        serviceModel: { type: "string", description: "Appointments, walk-ins, or both, only as described by the caller." },
        bookingProcess: { type: "string", description: "How they currently manage bookings, if stated." },
        clientManagementProcess: { type: "string", description: "How they currently manage client records, if stated." },
        checkoutProcess: { type: "string", description: "How they currently handle checkout/payments, if stated." },
        turnRotationProcess: { type: "string", description: "How they currently assign technician turns, if stated." },
        commissionProcess: { type: "string", description: "How they currently manage commissions, if stated." },
        featuresOfInterest: { type: "array", items: { type: "string" }, description: "Features the caller explicitly asked about or expressed interest in." },
        questions: { type: "array", items: { type: "string" }, description: "Questions explicitly asked by the caller." },
        objections: { type: "array", items: { type: "string" }, description: "Concerns or objections explicitly expressed by the caller." },
        notInterested: { type: "boolean", description: "True only if the caller explicitly says they are not interested." },
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
    name: "transfer_to_account_services",
    description: "When a caller asks for Account Services or describes an account-support issue, immediately transfer the call to the Account Services AI triage webhook. Do not ask an additional permission or hold question.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    type: "function",
    name: "find_prepared_salon",
    description: "Find a salon page Certxa prepared (the page that says 'Is this your salon? Call Certxa'). Use when a caller mentions a page or website Certxa made for their salon, wants to claim or remove it, or is trying to reach a salon. Search by the salon's phone number if they say it, else its name and/or city.",
    parameters: {
      type: "object",
      properties: {
        phone: { type: "string", description: "The salon's phone number, as the caller said it." },
        name: { type: "string", description: "The salon's name, as the caller said it." },
        city: { type: "string", description: "The salon's city, as the caller said it." },
      },
      required: [],
    },
  },
  {
    type: "function",
    name: "send_claim_link",
    description: "Text the salon owner a one-time link to claim their prepared salon page and move it into their own Certxa Salon account. Only after find_prepared_salon found it, the caller confirmed it is their salon, and they agreed to get the text.",
    parameters: {
      type: "object",
      properties: {
        jobId: { type: "number", description: "The jobId find_prepared_salon returned for their salon." },
        phone: { type: "string", description: "The owner's mobile to text, only if different from the number they are calling from." },
      },
      required: ["jobId"],
    },
  },
  {
    type: "function",
    name: "request_ownership_callback",
    description: "When the caller wants to claim a prepared salon page, the call is NOT from the salon's listed number, and they are at the salon now: schedule your call-back to the salon's listed number in about a minute, where you will ask for them by name. Then tell them this call is ending, to hang up so the salon line is free, say goodbye and end the call.",
    parameters: {
      type: "object",
      properties: {
        jobId: { type: "number", description: "The jobId find_prepared_salon returned for their salon." },
        callerName: { type: "string", description: "The caller's name, to ask for when you call the salon." },
      },
      required: ["jobId", "callerName"],
    },
  },
  {
    type: "function",
    name: "confirm_callback_number",
    description: "On your ownership call-back to a salon: check the two-digit number the person says against the one you gave them on the earlier call. Only a confirmed number verifies ownership.",
    parameters: {
      type: "object",
      properties: { number: { type: "string", description: "The number exactly as they said it, in digits." } },
      required: ["number"],
    },
  },
  {
    type: "function",
    name: "callback_reached_voicemail",
    description: "On your ownership call-back to a salon: a voicemail greeting, automated message system or recording answered instead of a person. Call it straight away; it says whether you'll try again in two minutes and what short message to leave.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    type: "function",
    name: "record_page_removal",
    description: "Record that the salon owner wants Certxa to take their prepared salon page down. Use as soon as they ask; the Certxa team removes it.",
    parameters: {
      type: "object",
      properties: {
        jobId: { type: "number", description: "The jobId from find_prepared_salon, if found." },
        callerName: { type: "string", description: "The caller's name, if they said it." },
        notes: { type: "string", description: "The salon name/city and anything the caller said about the request." },
      },
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

// Maril's Account Services tools (lib/marilAccountSupport.ts). Every account tool refuses until the caller is verified.
const MARIL_TOOLS = [
  { type: "function", name: "find_account", description: "Find the caller's Certxa account from what they said: the account e-mail, the business name, or the business/owner phone number. Returns matches with a masked mobile ending for the code.", parameters: { type: "object", properties: { email: { type: "string" }, businessName: { type: "string" }, phone: { type: "string" } }, required: [] } },
  { type: "function", name: "send_verification_code", description: "Text a 6-digit code to the mobile on file for the account the caller confirmed (accountRef from find_account).", parameters: { type: "object", properties: { accountRef: { type: "string" } }, required: ["accountRef"] } },
  { type: "function", name: "check_verification_code", description: "Check the 6-digit code the caller read back.", parameters: { type: "object", properties: { code: { type: "string", description: "Digits only." } }, required: ["code"] } },
  { type: "function", name: "get_account_summary", description: "The verified caller's plan, trial, next charge, card on file, recent charges (with chargeRef), credit balance and open tickets.", parameters: { type: "object", properties: {}, required: [] } },
  { type: "function", name: "send_billing_link", description: "E-mail the owner their billing page link (update card, invoices, change or cancel plan).", parameters: { type: "object", properties: {}, required: [] } },
  { type: "function", name: "send_password_reset", description: "E-mail the owner a password reset link (works one hour).", parameters: { type: "object", properties: {}, required: [] } },
  { type: "function", name: "send_receipt", description: "E-mail a receipt for a paid charge (the latest, or chargeRef from get_account_summary).", parameters: { type: "object", properties: { chargeRef: { type: "number" } }, required: [] } },
  { type: "function", name: "retry_payment", description: "Charge the declined subscription payment again (after they updated their card).", parameters: { type: "object", properties: {}, required: [] } },
  { type: "function", name: "extend_trial", description: "Extend the trial by up to 14 days (never past 74 days from its start).", parameters: { type: "object", properties: { days: { type: "number" }, reason: { type: "string" } }, required: ["days", "reason"] } },
  { type: "function", name: "apply_credit", description: "Add account credit in dollars, within Certxa's limits. Only after the caller agreed to the amount and reason.", parameters: { type: "object", properties: { amount: { type: "number" }, reason: { type: "string" } }, required: ["amount", "reason"] } },
  { type: "function", name: "refund_charge", description: "Refund a paid charge (chargeRef from get_account_summary) in full or part (amount in dollars), within Certxa's limits. Only after the caller agreed.", parameters: { type: "object", properties: { chargeRef: { type: "number" }, amount: { type: "number", description: "Dollars; leave out for the full remaining amount." }, reason: { type: "string" } }, required: ["chargeRef", "reason"] } },
  { type: "function", name: "open_ticket", description: "Open a support ticket for the Certxa team with a clear summary, when you can't resolve it on the call.", parameters: { type: "object", properties: { subject: { type: "string" }, description: { type: "string", description: "What they need, what you checked or tried, and how to reach them." }, priority: { type: "string", enum: ["low", "normal", "high", "urgent"] }, callerName: { type: "string" } }, required: ["subject", "description"] } },
  { type: "function", name: "end_call", description: "Hang up, after you have said goodbye and the caller has nothing else.", parameters: { type: "object", properties: {}, required: [] } },
];

// ─── One call ─────────────────────────────────────────────────────────────────

async function applySalesStageGlobally(leadIdValue: number, stage: string, source: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(`SELECT profile_data FROM sales_leads WHERE id = $1 FOR UPDATE`, [leadIdValue]);
    if (!r.rows[0]) throw new Error("Sales profile no longer exists");
    const oldData = (r.rows[0].profile_data && typeof r.rows[0].profile_data === "object" ? r.rows[0].profile_data : {}) as SalesMemoryObject;
    const oldSales = (oldData.sales && typeof oldData.sales === "object" ? oldData.sales : {}) as SalesMemoryObject;
    const nextSales = stageHistoryUpdate(oldSales, stage, source);
    const provenance = (oldData.provenance && typeof oldData.provenance === "object" ? oldData.provenance : {}) as SalesMemoryObject;
    if (nextSales.currentStage !== oldSales.currentStage) provenance["sales.currentStage"] = { source, checkedAt: new Date().toISOString() };
    await client.query(
      `UPDATE sales_leads SET status = $3, profile_data = $2::jsonb, updated_at = now() WHERE id = $1`,
      [leadIdValue, JSON.stringify({ ...oldData, sales: nextSales, provenance }), nextSales.currentStage],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}

function runSalesCall(twilioWs: WebSocket, agentProfile: SalesAgentProfile = TOM_SALES_AGENT): void {
  let streamSid: string | null = null;
  let callSid: string | null = null;
  let callerPhone: string | null = null;
  let callerPhoneE164: string | null = null;
  let callLogId: number | null = null;
  let callLogPromise: Promise<number | null> = Promise.resolve(null);
  let callPreparationPromise: Promise<void> = Promise.resolve();
  let leadId: number | null = null;
  let profile: SalesMemoryObject | null = null;
  let profileCandidate = false;
  let profileLookupCompleted = false;
  let profileLookupFailed = false;
  let identityVerified = false;
  let identityConfirmedAgainstExistingProfile = false;
  let profileNameEstablishedThisCall = false;
  let identityBlocked = false;
  let trialSent = false;
  let claimLinkSent = false;
  let toolsRunning = 0;
  // Maril (Account Services): who the caller is verified as, and a code texted to an account's owner mobile.
  let marilContext: MarilCallContext | null = null;
  let verifiedOwner: VerifiedOwner | null = null;
  let pendingCode: { hash: string; owner: VerifiedOwner; tries: number } | null = null;
  let codesSent = 0;
  let marilContextPromise: Promise<void> = Promise.resolve();
  // A prepared salon page this call is about, and the salons whose ownership this call has verified (lib/salonClaim.ts).
  let claimContext: ClaimCallContext | null = null;
  const verifiedClaimJobs = new Map<number, "caller_id" | "callback">();
  let claimContextPromise: Promise<void> = Promise.resolve();
  let callbackScheduled = false;
  let accountSupportHandoff = false;
  /** Maril's ready-made opener, already playing when GPT-Live starts (lib/marilOpener.ts). */
  let marilOpener: MarilOpenerKind | null = null;
  /** Hold music before Maril (her own number): until then the AI neither hears the caller nor speaks. */
  let holdUntil = 0;
  let accountSupportTransferScheduled = false;
  let accountSupportTransferTimer: ReturnType<typeof setTimeout> | null = null;
  let openAi: WebSocket | null = null;
  let started = false;
  let closed = false;
  const startedAt = Date.now();
  let twilioStartAt = 0;
  let firstAssistantAudioAt = 0;
  let firstAssistantAudioSentAt = 0;
  let firstAudioPlaybackMarkPending = false;
  let lastCallerVoice = Date.now();
  let aiSpeaking = false;
  let aiIdleTimer: ReturnType<typeof setTimeout> | null = null;
  let interruptStreak = 0;
  const outQueue: string[] = [];
  let pacer: ReturnType<typeof setInterval> | null = null;
  const transcript: { role: "caller" | "tom"; text: string; at: string }[] = [];
  const smsEvents: { at: string; to: string; body: string; sid: string | null; status: string }[] = [];
  const pendingActions = new Set<Promise<unknown>>();
  let callerText = "";
  let tomText = "";

  const flush = (who: "caller" | "tom") => {
    const rawText = (who === "caller" ? callerText : tomText).trim();
    const text = who === "tom" ? canonicalizeSpokenBrandForText(rawText) : rawText;
    if (text) transcript.push({ role: who, text, at: new Date().toISOString() });
    if (who === "caller") callerText = ""; else tomText = "";
  };

  async function persistSmsEvents(): Promise<void> {
    const id = await callLogPromise;
    if (id) await pool.query(`UPDATE sales_call_logs SET sms_events = $2::jsonb WHERE id = $1`, [id, JSON.stringify(smsEvents)]);
  }

  const sendNextAudioFrame = () => {
    const frame = outQueue.shift();
    if (!frame) {
      if (pacer) clearInterval(pacer);
      pacer = null;
      return;
    }
    if (streamSid && twilioWs.readyState === WebSocket.OPEN) {
      twilioWs.send(JSON.stringify({ event: "media", streamSid, media: { payload: frame } }));
      if (agentProfile.id === "tom" && !firstAssistantAudioSentAt) {
        firstAssistantAudioSentAt = Date.now();
        console.log(`${LOG} first assistant audio frame sent call=${callSid ?? "unknown"} first_audio_sent_ms=${firstAssistantAudioSentAt - twilioStartAt} generated_to_sent_ms=${firstAssistantAudioSentAt - firstAssistantAudioAt}`);
        // Twilio echoes this after the first queued frame finishes playback (or after a clear).
        firstAudioPlaybackMarkPending = true;
        twilioWs.send(JSON.stringify({ event: "mark", streamSid, mark: { name: "tom-first-audio" } }));
      }
    }
  };
  const startPacer = () => {
    if (pacer) return;
    // Keep 20 ms pacing after the first frame, but do not make TOM's first frame wait for the first interval tick.
    if (agentProfile.id === "tom" && !firstAssistantAudioSentAt) {
      sendNextAudioFrame();
      if (!outQueue.length) return;
    }
    pacer = setInterval(sendNextAudioFrame, 20);
  };

  const maxTimer = setTimeout(() => finish("max_duration"), MAX_CALL_MS);
  const silenceTimer = setInterval(() => {
    if (Date.now() - lastCallerVoice > SILENCE_HANGUP_MS) finish("silence");
  }, 5_000);

  function scheduleAccountSupportTransfer(): void {
    if (accountSupportTransferScheduled || closed) return;
    accountSupportTransferScheduled = true;
    console.log(`${LOG} account-support request confirmed; scheduling direct Shavez webhook handoff for call=${callSid ?? "unknown"}`);
    // The route is authorized by the caller's explicit Account Services/account-support request.
    accountSupportTransferTimer = setTimeout(() => finish("transferred_to_shavez"), 3_500);
  }

  function finish(outcome: string): void {
    if (closed) return;
    closed = true;
    clearTimeout(maxTimer);
    clearInterval(silenceTimer);
    if (accountSupportTransferTimer) clearTimeout(accountSupportTransferTimer);
    if (pacer) clearInterval(pacer);
    flush("caller"); flush("tom");
    try { openAi?.close(); } catch { /* ignore */ }
      if (agentProfile.id !== "tom") {
      try { twilioWs.close(); } catch { /* preserve Shavez's existing stream-close behavior */ }
    }
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    console.log(`${LOG} agent=${agentProfile.id} call ended (${outcome}) after ${seconds}s, lead=${leadId ?? "none"}, trial link ${trialSent ? "sent" : "not sent"}`);
    void (async () => {
      const insertedId = await callLogPromise;
      if (agentProfile.id === "tom" && insertedId) {
        await pool.query(`UPDATE sales_call_logs SET outcome = $2 WHERE id = $1 AND ended_at IS NULL`, [insertedId, outcome])
          .catch((e) => console.warn(`${LOG} could not persist ending outcome before stream close:`, e.message));
      }
      // Twilio sends a stop event when the caller has already ended their side; let it close that stream itself.
      if (agentProfile.id === "tom" && outcome !== "caller_hung_up" && twilioWs.readyState === WebSocket.OPEN) {
        try { twilioWs.close(1000, outcome.slice(0, 120)); } catch { /* ignore */ }
      }
      const id = await finalizeAfterInsert(Promise.resolve(insertedId), [...pendingActions, callPreparationPromise], async (persistedId) => {
        const associatedLeadId = shouldAssociateCallWithProfile({ identityVerified, profileLookupCompleted, profileCandidate, identityBlocked })
          ? leadId
          : null;
        await pool.query(
          `UPDATE sales_call_logs SET ended_at = now(),
             duration_seconds = CASE WHEN $8 THEN COALESCE(duration_seconds, 0) + $2 ELSE $2 END,
             outcome = $3,
             transcript = CASE WHEN $8 THEN COALESCE(transcript, '[]'::jsonb) || $4::jsonb ELSE $4::jsonb END,
             lead_id = CASE WHEN $8 THEN COALESCE(lead_id, $5) ELSE $5 END,
             sms_events = CASE WHEN $8 THEN COALESCE(sms_events, '[]'::jsonb) || $6::jsonb ELSE $6::jsonb END,
             identity_verified = CASE WHEN $8 THEN (identity_verified OR $7) ELSE $7 END
           WHERE id = $1`,
          [persistedId, seconds, accountSupportHandoff ? `account_services_${outcome}` : outcome, JSON.stringify(transcript), associatedLeadId,
           JSON.stringify(smsEvents), identityVerified, accountSupportHandoff],
        );
        leadId = associatedLeadId;
      });
      if (!id) {
        console.error(`${LOG} cannot finalize call: call log insert did not succeed`);
        return;
      }
      if (outcome === "transferred_to_shavez") return;
      await Promise.allSettled([
        summarize(id, transcript, smsEvents, identityVerified ? leadId : null, outcome, agentProfile),
        factCheckCall(id, transcript, agentProfile),
      ]);
    })().catch((e) => console.error(`${LOG} call finalization failed:`, e.message));
  }

  async function prepareCall(): Promise<void> {
    if (accountSupportHandoff) {
      await callLogPromise;
      return;
    }
    if (callerPhoneE164) {
      try {
      const result = await pool.query(
          `INSERT INTO sales_leads (phone, phone_e164, status, source)
           VALUES ($1, $2, 'new', 'phone')
           ON CONFLICT (phone_e164) WHERE phone_e164 IS NOT NULL
           DO UPDATE SET phone_e164 = EXCLUDED.phone_e164 RETURNING *`,
          [callerPhoneE164.slice(2), callerPhoneE164],
          );
          profile = result.rows[0] ?? null;
          leadId = profile ? Number(profile.id) : null;
          const previous = await pool.query(
            `SELECT EXISTS (SELECT 1 FROM sales_call_logs WHERE lead_id = $1 AND identity_verified = true) AS returning`,
            [leadId],
          );
          profileCandidate = profileNeedsIdentityCheck(profile ?? {}, previous.rows[0]?.returning === true);
          profileLookupCompleted = true;
      } catch (error) {
        console.error(`${LOG} profile lookup failed; continuing call without memory:`, (error as Error).message);
        profile = null;
        leadId = null;
        profileCandidate = false;
        profileLookupCompleted = false;
        profileLookupFailed = true;
      }
    }
    await callLogPromise;
  }

  async function applySalesStage(leadIdValue: number, stage: string, source: string, facts: SalesMemoryObject = {}): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const r = await client.query(`SELECT profile_data FROM sales_leads WHERE id = $1 FOR UPDATE`, [leadIdValue]);
      if (!r.rows[0]) throw new Error("Sales profile no longer exists");
      const oldData = (r.rows[0].profile_data && typeof r.rows[0].profile_data === "object" ? r.rows[0].profile_data : {}) as SalesMemoryObject;
      const oldSales = (oldData.sales && typeof oldData.sales === "object" ? oldData.sales : {}) as SalesMemoryObject;
      const nextSales = stageHistoryUpdate({ ...oldSales, ...facts }, stage, source);
      const provenance = (oldData.provenance && typeof oldData.provenance === "object" ? oldData.provenance : {}) as SalesMemoryObject;
      if (nextSales.currentStage !== oldSales.currentStage) {
        provenance["sales.currentStage"] = { source, checkedAt: new Date().toISOString() };
      }
      await client.query(
        `UPDATE sales_leads SET status = $3, profile_data = $2::jsonb, updated_at = now() WHERE id = $1`,
        [leadIdValue, JSON.stringify({ ...oldData, sales: nextSales, provenance }), nextSales.currentStage],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  /** Check account/trial only after identity is confirmed; ambiguous user matches remain unverified. */
  async function refreshVerifiedAccountStage(leadIdValue: number): Promise<void> {
    try {
      const profileResult = await pool.query(`SELECT email, phone_e164 FROM sales_leads WHERE id = $1`, [leadIdValue]);
      const customer = profileResult.rows[0];
      if (!customer) return;
      const matches = await pool.query(
        `SELECT u.id, u.subscription_status, u.trial_ends_at,
                bool_or(ss.status = 'trialing' AND (ss.current_period_end IS NULL OR ss.current_period_end > now())) AS store_trial_active,
                bool_or(ss.status = 'active' AND COALESCE(sp.price_monthly_cents, 0) > 0) AS paid_subscription,
                max(sp.code) FILTER (WHERE ss.status IN ('active','trialing')) AS plan_code,
                max(sp.name) FILTER (WHERE ss.status IN ('active','trialing')) AS plan_name
           FROM users u
           LEFT JOIN locations l ON l.user_id = u.id
           LEFT JOIN store_subscriptions ss ON ss.store_id = l.id
           LEFT JOIN subscription_plans sp ON sp.id = ss.plan_id
          WHERE u.role IN ('owner','admin')
            AND (($1::text IS NOT NULL AND lower(u.email) = lower($1))
              OR ($2::text IS NOT NULL AND u.phone IS NOT NULL AND
                  (CASE WHEN length(regexp_replace(u.phone,'[^0-9]','','g'))=10 THEN '+1'||regexp_replace(u.phone,'[^0-9]','','g')
                        WHEN length(regexp_replace(u.phone,'[^0-9]','','g'))=11 AND left(regexp_replace(u.phone,'[^0-9]','','g'),1)='1' THEN '+'||regexp_replace(u.phone,'[^0-9]','','g')
                        ELSE NULL END) = $2))
          GROUP BY u.id, u.subscription_status, u.trial_ends_at`,
        [customer.email ?? null, customer.phone_e164 ?? null],
      );
      if (matches.rows.length !== 1) return;
      const account = matches.rows[0];
      const activeUserTrial = account.subscription_status === "trial" && account.trial_ends_at && new Date(account.trial_ends_at) > new Date();
      const stage = account.paid_subscription ? "paying_customer" : (account.store_trial_active || activeUserTrial) ? "trial_active" : null;
      if (!stage) return;
      await applySalesStage(leadIdValue, stage, "verified_application", {
        verifiedAccount: {
          status: stage,
          planCode: account.plan_code ?? null,
          planName: account.plan_name ?? null,
          checkedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.warn(`${LOG} account-stage verification failed:`, (error as Error).message);
    }
  }

  // ── Tools ──
  async function runTool(name: string, args: any): Promise<Record<string, unknown>> {
    if (!accountSupportHandoff) await callPreparationPromise;
    if (name === "verify_caller_identity") {
      if (!leadId || !profile || !callerPhoneE164 || identityBlocked) {
        return { success: false, verified: false, message: "No returning profile can be verified on this call." };
      }
      const statedName = typeof args.name === "string" ? args.name.trim() : "";
      if (!statedName || !hasCallerEvidence([...transcript, { role: "caller", text: callerText }], statedName)) {
        return { success: false, verified: false, message: "Ask the caller to say their name before using past-call information." };
      }
      const callerWords = [...transcript, { role: "caller", text: callerText }];
      const suppliedBusiness = typeof args.businessName === "string" && hasCallerEvidence(callerWords, args.businessName)
        ? args.businessName.trim()
        : "";
      const suppliedEmail = typeof args.email === "string" && hasCallerEvidence(callerWords, args.email)
        ? args.email.trim()
        : "";
      if (!profileCandidate) {
        identityVerified = true;
        if (callLogId) await pool.query(`UPDATE sales_call_logs SET identity_verified = true, lead_id = $2 WHERE id = $1`, [callLogId, leadId]);
        return { success: true, verified: true, memory: null, message: "New caller identified; no previous call history is available." };
      }
      const latest = await pool.query(`SELECT * FROM sales_leads WHERE id = $1`, [leadId]);
      profile = latest.rows[0] ?? null;
      const identityCandidate = {
        name: String(profile?.name ?? ""),
        businessName: String(profile?.business_name ?? ""),
        email: String(profile?.email ?? ""),
      };
      const suppliedIdentity = { name: statedName, businessName: suppliedBusiness, email: suppliedEmail };
      if (!profile || !normalizeIdentity(identityCandidate.name) || normalizeIdentity(identityCandidate.name) !== normalizeIdentity(statedName)) {
        identityBlocked = true;
        leadId = null;
        profile = null;
        return { success: false, verified: false, message: "Identity not confirmed. Continue without sharing or updating the previous caller's information." };
      }
      if (identityNeedsMoreInformation(identityCandidate, suppliedIdentity)) {
        return { success: false, verified: false, needsMoreInformation: true, message: "Ask for the caller's salon/business name or account email without revealing the value stored in the profile." };
      }
      if (!identityMatches(identityCandidate, suppliedIdentity)) {
        identityBlocked = true;
        leadId = null;
        profile = null;
        return { success: false, verified: false, message: "Identity not confirmed. Continue without sharing or updating the previous caller's information." };
      }
      if (callLogId) {
        await pool.query(`UPDATE sales_call_logs SET identity_verified = true, lead_id = $2 WHERE id = $1`, [callLogId, leadId]);
      }
      identityVerified = true;
      identityConfirmedAgainstExistingProfile = true;
      await refreshVerifiedAccountStage(leadId);
      const refreshed = await pool.query(`SELECT * FROM sales_leads WHERE id = $1`, [leadId]);
      profile = refreshed.rows[0] ?? profile;
      const history = await pool.query(
          `SELECT id, started_at, summary, structured_summary, sms_events, outcome, identity_verified, transcript, sales_agent_id
         FROM sales_call_logs WHERE lead_id = $1 AND ended_at IS NOT NULL AND id <> $2
         ORDER BY started_at DESC LIMIT 20`,
        [leadId, callLogId ?? -1],
      );
      const legacyIdentityMatched = (call: any) => {
        if (call.identity_verified === true) return true;
        const turns = Array.isArray(call.transcript) ? call.transcript : [];
        if (!callerAffirmsIdentity(turns, profile!.name)) return false;
        const requiresBusinessOrEmail = Boolean(profile!.business_name || profile!.email);
        if (!requiresBusinessOrEmail) return true;
        return callerAffirmsIdentity(turns, profile!.business_name) || callerAffirmsIdentity(turns, profile!.email);
      };
      return {
        success: true,
        verified: true,
        memory: summarizeMemoryContext(profile ?? {}, history.rows.filter(legacyIdentityMatched)),
      };
    }
    if (name === "save_lead") {
      if (identityBlocked) {
        return { success: false, message: "The caller did not match the existing profile. Do not create or update a profile for this call." };
      }
      if (profileLookupFailed && callerPhoneE164) {
        return { success: false, message: "The caller profile could not be checked safely. Continue helping; call history will still be retained if logging is available." };
      }
      if (profileCandidate && !identityVerified) {
        return { success: false, message: "Verify the caller's volunteered name with verify_caller_identity before saving or discussing past-call details." };
      }
      if (!identityBlocked && callerPhoneE164 && !profile) {
        const existing = await pool.query(
          `INSERT INTO sales_leads (phone, phone_e164, status, source)
           VALUES ($1, $2, 'new', 'phone')
           ON CONFLICT (phone_e164) WHERE phone_e164 IS NOT NULL
           DO UPDATE SET phone_e164 = EXCLUDED.phone_e164 RETURNING *`,
          [callerPhoneE164.slice(2), callerPhoneE164],
        );
        profile = existing.rows[0] ?? null;
        leadId = profile ? Number(profile.id) : null;
      }
      const callerWords = [...transcript, { role: "caller", text: callerText }];
      const suppliedName = typeof args.name === "string" ? args.name.trim() : "";
      if (profile && !identityVerified && (!suppliedName || !hasCallerEvidence(callerWords, suppliedName))) {
        return { success: false, message: "Ask the caller for their name before saving details to a phone-number profile." };
      }
      if (profile && !identityVerified && profile.name) {
        if (!identityMatches({ name: String(profile.name) }, { name: suppliedName })) {
          identityBlocked = true;
          profile = null;
          leadId = null;
          return { success: false, message: "Different caller. Do not save these details to the previous caller's profile." };
        }
        identityVerified = true;
      }
      if (identityBlocked) {
        return { success: false, message: "The phone is shared or the caller's identity could not be verified. Do not update the prior profile." };
      }
      if (suppliedName && hasCallerEvidence(callerWords, suppliedName)) identityVerified = true;
      const verifiedText = (value: unknown): string | null =>
        typeof value === "string" && value.trim() && hasCallerEvidence(callerWords, value)
          ? value.trim().slice(0, 500)
          : null;
      const email = verifiedText(args.email);
      const fields: Record<string, string | null> = {
        name: verifiedText(args.name), business_name: verifiedText(args.businessName), business_type: verifiedText(args.businessType),
        team_size: verifiedText(args.teamSize), city: verifiedText(args.city),
        email: email && hasTranscriptEvidence([...transcript, { role: "tom", text: tomText }], "tom", email) ? email : null,
        phone: callerPhoneE164 ? null : (args.phone ? canonicalCallerE164(args.phone) : null),
        current_software: verifiedText(args.currentSoftware), interested_plan: verifiedText(args.interestedPlan), notes: verifiedText(args.notes),
      };
      const clean = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : null]));
      const business: SalesMemoryObject = {};
      for (const [key, value] of Object.entries({
        locationCount: args.locationCount, serviceModel: args.serviceModel, bookingProcess: args.bookingProcess,
        clientManagementProcess: args.clientManagementProcess, checkoutProcess: args.checkoutProcess,
        turnRotationProcess: args.turnRotationProcess, commissionProcess: args.commissionProcess,
      })) {
        const supported = verifiedText(value);
        if (supported) business[key] = supported;
      }
      const sales: SalesMemoryObject = {};
      const features = stringsOnly(args.featuresOfInterest, 20, 200).filter((value) => hasCallerEvidence(callerWords, value));
      const questions = stringsOnly(args.questions, 20, 300).filter((value) => hasCallerEvidence(callerWords, value));
      const objections = stringsOnly(args.objections, 20, 300).filter((value) => hasCallerEvidence(callerWords, value));
      if (features.length) sales.featuresOfInterest = features;
      if (features.length) sales.currentStage = "interested";
      if (questions.length) sales.questionsAsked = questions;
      if (objections.length) sales.objections = objections;
      const newData: SalesMemoryObject = {};
      const suppliedPhoneE164 = typeof args.phone === "string" ? canonicalCallerE164(args.phone) : null;
      const alternatePhone = callerPhoneE164 && suppliedPhoneE164 && suppliedPhoneE164 !== callerPhoneE164 ? suppliedPhoneE164 : null;
      if (alternatePhone && hasCallerEvidence(callerWords, args.phone)) newData.contact = { alternatePhone };
      const profilePhoneE164 = callerPhoneE164;
      if (Object.keys(business).length) newData.business = business;
      if (Object.keys(sales).length) newData.sales = sales;
      const provenance: SalesMemoryObject = {};
      for (const [field, value] of Object.entries(clean)) {
        if (typeof value === "string" && value.trim()) provenance[field] = { source: "caller_statement", callLogId: callLogId ?? null };
      }
      for (const field of Object.keys(business)) provenance[`business.${field}`] = { source: "caller_statement", callLogId: callLogId ?? null };
      for (const field of [...features.map(() => "featuresOfInterest"), ...questions.map(() => "questionsAsked"), ...objections.map(() => "objections")]) {
        provenance[`sales.${field}`] = { source: "caller_statement", callLogId: callLogId ?? null };
      }
      if (alternatePhone) provenance["contact.alternatePhone"] = { source: "caller_statement", callLogId: callLogId ?? null };
      if (Object.keys(provenance).length) newData.provenance = provenance;
      const id = callLogId;
      if (!leadId) {
        const leadValues = [clean.name, clean.business_name, clean.phone ?? (callerPhoneE164 ? callerPhone : null), clean.email,
          clean.business_type, clean.team_size, clean.city, clean.current_software, clean.interested_plan,
          clean.notes, id, JSON.stringify(newData), profilePhoneE164];
        const r = profilePhoneE164
          ? await pool.query(
              `INSERT INTO sales_leads (name, business_name, phone, email, business_type, team_size, city, current_software,
                 interested_plan, notes, call_log_id, profile_data, phone_e164)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
               ON CONFLICT (phone_e164) WHERE phone_e164 IS NOT NULL DO UPDATE SET
                 name=COALESCE(sales_leads.name,EXCLUDED.name), business_name=COALESCE(sales_leads.business_name,EXCLUDED.business_name),
                 email=COALESCE(sales_leads.email,EXCLUDED.email), business_type=COALESCE(sales_leads.business_type,EXCLUDED.business_type),
                 team_size=COALESCE(sales_leads.team_size,EXCLUDED.team_size), city=COALESCE(sales_leads.city,EXCLUDED.city),
                 updated_at=now() RETURNING id`, leadValues)
          : await pool.query(
              `INSERT INTO sales_leads (name, business_name, phone, email, business_type, team_size, city, current_software,
                 interested_plan, notes, call_log_id, profile_data)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb) RETURNING id`, leadValues.slice(0, 12));
        leadId = Number(r.rows[0].id);
        if (clean.name) profileNameEstablishedThisCall = true;
      } else {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const existing = await client.query(`SELECT name, profile_data FROM sales_leads WHERE id = $1 FOR UPDATE`, [leadId]);
          if (!existing.rows[0]) throw new Error("Sales profile no longer exists");
          const storedName = typeof existing.rows[0].name === "string" ? existing.rows[0].name : "";
          const incomingName = typeof clean.name === "string" ? clean.name : "";
          if (storedName && incomingName && normalizeIdentity(storedName) !== normalizeIdentity(incomingName) &&
              !identityConfirmedAgainstExistingProfile && !profileNameEstablishedThisCall) {
            await client.query("ROLLBACK");
            identityBlocked = true;
            leadId = null;
            profile = null;
            return { success: false, message: "This number already has a different profile name. Do not merge or replace that profile." };
          }
          const merged = mergeProfileData(existing.rows[0].profile_data, newData);
          await client.query(
            `UPDATE sales_leads SET name = COALESCE($2, name), business_name = COALESCE($3, business_name),
               phone = COALESCE($4, phone), email = COALESCE($5, email), business_type = COALESCE($6, business_type),
               team_size = COALESCE($7, team_size), city = COALESCE($8, city),
               current_software = COALESCE($9, current_software), interested_plan = COALESCE($10, interested_plan),
               notes = CASE WHEN $11::text IS NULL THEN notes WHEN notes IS NULL THEN $11 ELSE notes || ' | ' || $11 END,
               profile_data = $12::jsonb, updated_at = now() WHERE id = $1`,
            [leadId, clean.name, clean.business_name, clean.phone, clean.email, clean.business_type, clean.team_size,
             clean.city, clean.current_software, clean.interested_plan, clean.notes, JSON.stringify(merged)],
          );
          await client.query("COMMIT");
          if (!storedName && incomingName) profileNameEstablishedThisCall = true;
        } catch (error) {
          await client.query("ROLLBACK").catch(() => {});
          throw error;
        } finally { client.release(); }
      }
      if (id && leadId) await pool.query(`UPDATE sales_call_logs SET lead_id = $2, identity_verified = $3 WHERE id = $1`, [id, leadId, identityVerified]);
      if (leadId && profile) profile = { ...profile, ...Object.fromEntries(Object.entries(clean).filter(([, value]) => value != null)) };
      if (leadId && identityVerified) await refreshVerifiedAccountStage(leadId);
      return { success: true, message: "Saved." };
    }
    if (name === "send_trial_link") {
      if (trialSent) return { success: true, message: "Already texted on this call." };
      const to = args.phone ? (tenDigit(args.phone) ?? args.phone) : callerPhone;
      if (!to) return { success: false, message: "No phone number to text. Ask for one." };
      if (leadId && (identityVerified || (!profileCandidate && !identityBlocked))) {
        await applySalesStage(leadId, "signup_link_requested", "caller_request", { signupLinkRequested: true })
          .catch((error) => console.error(`${LOG} could not record signup-link request:`, error.message));
      }
      const body = `Thanks for calling Certxa! Start your free trial here (no credit card needed): ${SIGNUP_URL}`;
      const event = { at: new Date().toISOString(), to: toE164US(to) ?? to, body, sid: null as string | null, status: "sending" };
      smsEvents.push(event);
      void persistSmsEvents().catch((error) => console.error(`${LOG} could not save SMS event before send:`, error.message));
      const sms = await sendTwilioSms(to, body);
      if (!sms.success) {
        event.status = "failed";
        void persistSmsEvents().catch((error) => console.error(`${LOG} could not save failed SMS event:`, error.message));
        return { success: false, message: "The text could not be sent. Tell them they can sign up at certxa.com." };
      }
      trialSent = true;
      event.sid = sms.sid ?? null;
      event.status = "sent";
      try {
        void persistSmsEvents().catch((error) => console.error(`${LOG} could not persist sent SMS event:`, error.message));
        if (leadId && (identityVerified || (!profileCandidate && !identityBlocked))) {
          await applySalesStage(leadId, "signup_link_sent", "sms_sent", {
            signupLinkSent: true,
            lastSmsAt: event.at,
            lastSmsSid: sms.sid ?? null,
          });
          await pool.query(`UPDATE sales_leads SET trial_link_sent_at = now(), updated_at = now() WHERE id = $1`, [leadId]);
          await pool.query(
            `UPDATE sales_leads SET profile_data = COALESCE(profile_data, '{}'::jsonb) || jsonb_build_object(
               'provenance', COALESCE(profile_data->'provenance', '{}'::jsonb) || jsonb_build_object(
                 'sales.signupLinkSent', jsonb_build_object('source', 'system_event', 'callLogId', $2, 'smsSid', $3)))
             WHERE id = $1`,
            [leadId, callLogId, sms.sid ?? null],
          );
        }
      } catch (error) {
        console.error(`${LOG} SMS was sent but history update failed:`, (error as Error).message);
        return { success: true, message: "Text sent; the sales record could not be updated." };
      }
      return { success: true, message: "Text sent." };
    }
    // Maril's Account Services tools (lib/marilAccountSupport.ts).
    if (agentProfile.id === "shavez") {
      const marilResult = await runMarilTool(name, args);
      if (marilResult) return marilResult;
    }
    // Certxa-prepared salon pages (lib/salonClaim.ts): find, claim link, take-down request.
    if (name === "find_prepared_salon") {
      const matches = await findPreparedSalons({ phone: args.phone, name: args.name, city: args.city }).catch(() => []);
      if (!matches.length) return { success: true, matches: [], message: "No prepared salon page matches. Ask for the salon's phone number, or the exact name and city." };
      return { success: true, matches: matches.map((m) => ({ jobId: m.jobId, name: m.name, street: m.street, city: m.city, state: m.state, salonPhone: m.phone, page: m.pageUrl, alreadyClaimed: m.claimed })) };
    }
    if (name === "send_claim_link") {
      if (claimLinkSent) return { success: true, message: "Already texted on this call." };
      const verifiedBy = verifiedClaimJobs.get(Number(args.jobId));
      if (!verifiedBy) {
        return { success: false, message: "Ownership isn't verified on this call. Ask whether they are at the salon right now: if yes, use request_ownership_callback; if not, explain they need to be at the salon so you can verify by calling its phone." };
      }
      const to = args.phone ? (tenDigit(args.phone) ?? args.phone) : verifiedBy === "callback" ? null : callerPhone;
      if (!to) return { success: false, message: "Ask for their mobile number to text the link to." };
      const result = await createClaimLink(Number(args.jobId), to, verifiedBy).catch(() => ({ ok: false as const, message: "The link could not be made." }));
      if (!result.ok) return { success: false, message: result.message };
      claimLinkSent = true;
      smsEvents.push({ at: new Date().toISOString(), to: toE164US(to) ?? to, body: "Salon page claim link", sid: null, status: "sent" });
      void persistSmsEvents().catch(() => {});
      if (leadId) await pool.query(`UPDATE sales_leads SET notes = trim(coalesce(notes, '') || ' Claim link sent for prepared salon page (job ' || $2 || ').'), updated_at = now() WHERE id = $1`, [leadId, String(args.jobId)]).catch(() => {});
      return { success: true, message: "Texted. The link works for 7 days. On it they create their Certxa Salon login, and the salon's page and account move into it." };
    }
    if (name === "request_ownership_callback") {
      if (callbackScheduled) return { success: true, message: "Already scheduled on this call." };
      const result = await scheduleClaimCallback(Number(args.jobId), String(args.callerName ?? ""), callerPhone).catch(() => ({ ok: false as const, message: "The call-back could not be scheduled." }));
      if (!result.ok) return { success: false, message: result.message };
      callbackScheduled = true;
      if (leadId) await pool.query(`UPDATE sales_leads SET notes = trim(coalesce(notes, '') || ' Ownership call-back scheduled to the salon (job ' || $2 || ').'), updated_at = now() WHERE id = $1`, [leadId, String(args.jobId)]).catch(() => {});
      return { success: true, number: result.code, message: `Scheduled: in about a minute you will call ${result.salonName} at ${result.salonPhone} and ask for ${String(args.callerName).trim()}. Tell them to remember the number ${result.code} (say it twice: "${result.code.split("").join(" ")}") because you'll ask for it when you call the salon. Then tell them this call will end now, to hang up and keep the salon's line free (if nobody answers, you'll try once more two minutes later), say goodbye, then end_call.` };
    }
    if (name === "callback_reached_voicemail") {
      if (claimContext?.mode !== "callback") return { success: false, message: "This isn't a call-back call." };
      const willRetry = await callbackHasRetryLeft(claimContext.callbackId).catch(() => false);
      await retryClaimCallback({ id: claimContext.callbackId }, "reached voicemail").catch(() => false);
      return willRetry
        ? { success: true, retry: true, message: `Leave one short message: "Hi, this is Tom from Certxa calling back for ${claimContext.callerName}. I'll try again in two minutes." Say nothing about the number. Then end_call.` }
        : { success: true, retry: false, message: `Leave one short message: "Hi, this is Tom from Certxa calling back for ${claimContext.callerName} about verifying the salon's page. Please call us back at (888) 814-7623. Thank you." Say nothing about the number. Then end_call.` };
    }
    if (name === "confirm_callback_number") {
      if (claimContext?.mode !== "callback") return { success: false, message: "There is no call-back on this call to confirm." };
      const outcome = await checkCallbackCode(claimContext.callbackId, String(args.number ?? "")).catch(() => "wrong" as const);
      if (outcome === "ok") {
        verifiedClaimJobs.set(claimContext.jobId, "callback");
        return { success: true, verified: true, message: "Confirmed: ownership is verified. Thank them, then help them claim (ask for their mobile, send_claim_link)." };
      }
      return outcome === "locked"
        ? { success: false, verified: false, message: "Not confirmed, and no tries are left. Apologise that you can't verify ownership this time and invite them to call Certxa back at (888) 814-7623." }
        : { success: false, verified: false, message: "That number doesn't match. Ask them once more for the number you gave them." };
    }
    if (name === "record_page_removal") {
      await recordRemovalRequest({ jobId: Number(args.jobId) || null, callerPhone: callerPhoneE164 ?? callerPhone, callerName: args.callerName ?? null, notes: args.notes ?? null });
      if (leadId) await pool.query(`UPDATE sales_leads SET notes = trim(coalesce(notes, '') || ' Asked for their prepared salon page to be taken down.'), updated_at = now() WHERE id = $1`, [leadId]).catch(() => {});
      return { success: true, message: "Recorded. The Certxa team will take the page down." };
    }
    if (name === "transfer_to_account_services") {
      const transferTurns = callerText.trim()
        ? [...transcript, { role: "caller", text: callerText }]
        : transcript;
      if (agentProfile.id !== "tom" || !mayTransferToAccountServices(transferTurns)) {
        return { success: false, message: "Transfer not authorized. Continue helping unless the caller has asked for account support or Account Services." };
      }
      scheduleAccountSupportTransfer();
      return { success: true, message: "Transfer accepted. Tell the caller you are connecting them to Account Services now; do not ask for another confirmation." };
    }
    if (name === "end_call") {
      setTimeout(() => finish(`ended_by_${agentProfile.id}`), 3_500); // let the goodbye finish playing
      return { success: true, message: "Hanging up." };
    }
    return { success: false, message: `Unknown tool ${name}` };
  }

  async function runMarilTool(name: string, args: any): Promise<Record<string, unknown> | null> {
    const needOwner = { success: false, message: "The caller isn't verified yet. Verify them first (find_account, send_verification_code, check_verification_code)." };
    switch (name) {
      case "find_account": {
        const matches = await findAccounts({ email: args.email, businessName: args.businessName, phone: args.phone });
        return matches.length ? { success: true, matches } : { success: true, matches: [], message: "No account matches. Ask for the account e-mail or the business phone number." };
      }
      case "send_verification_code": {
        if (codesSent >= 3) return { success: false, message: "Three codes were already sent on this call. Offer a ticket instead." };
        const r = await sendVerificationCode(String(args.accountRef ?? ""));
        if (!r.ok) return { success: false, message: r.message };
        codesSent += 1;
        pendingCode = { hash: r.codeHash, owner: r.owner, tries: 0 };
        return { success: true, message: `Code texted to the mobile ${r.sentTo}. Ask them to read it back.` };
      }
      case "check_verification_code": {
        if (!pendingCode) return { success: false, message: "No code has been sent yet." };
        if (pendingCode.tries >= 3) return { success: false, message: "No tries left for this code. Send a new one, or offer a ticket." };
        pendingCode.tries += 1;
        if (hashCode(String(args.code ?? "")) !== pendingCode.hash) return { success: false, verified: false, message: "That code doesn't match. Ask them to read it again." };
        verifiedOwner = pendingCode.owner;
        pendingCode = null;
        return { success: true, verified: true, message: `Verified: the owner of ${verifiedOwner.businessName}. You can use the account tools now.` };
      }
      case "get_account_summary": return verifiedOwner ? { success: true, account: await accountSummary(verifiedOwner) } : needOwner;
      case "send_billing_link": return verifiedOwner ? { success: true, message: await sendBillingLink(verifiedOwner) } : needOwner;
      case "send_password_reset": return verifiedOwner ? { success: true, message: await sendPasswordReset(verifiedOwner) } : needOwner;
      case "send_receipt": return verifiedOwner ? { success: true, message: await sendReceipt(verifiedOwner, Number(args.chargeRef) || undefined) } : needOwner;
      case "retry_payment": return verifiedOwner ? { success: true, message: await retryPayment(verifiedOwner) } : needOwner;
      case "extend_trial": return verifiedOwner ? { success: true, message: await extendTrial(verifiedOwner, Number(args.days), String(args.reason ?? "")) } : needOwner;
      case "apply_credit": return verifiedOwner ? { success: true, message: await applyCredit(verifiedOwner, Number(args.amount), String(args.reason ?? "")) } : needOwner;
      case "refund_charge": return verifiedOwner
        ? { success: true, message: await refundCharge(verifiedOwner, Number(args.chargeRef), args.amount == null ? null : Number(args.amount), String(args.reason ?? "")) }
        : needOwner;
      case "open_ticket": {
        const number = await openTicket(verifiedOwner, { subject: String(args.subject ?? "Phone support request"), description: String(args.description ?? ""), priority: args.priority, callerName: args.callerName, callerPhone });
        return { success: true, ticket: number, message: `Ticket ${number} opened for the Certxa team.` };
      }
      default: return null;
    }
  }

  // ── OpenAI Live ──
  async function openLive(connectionAcknowledged = false): Promise<void> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) { console.error(`${LOG} OPENAI_API_KEY is missing`); finish("no_ai_key"); return; }
    if (closed) return;
    openAi = new WebSocket(LIVE_URL, { headers: { Authorization: `Bearer ${key}` } });
    const instructionsPromise = Promise.all([claimContextPromise, marilContextPromise]).then(() => buildAgentInstructions(agentProfile, callerPhone, false, accountSupportHandoff, claimContext, marilContext));
    const voicePromise = callLogPromise.then(() => voiceForCall(agentProfile)).catch(() => ({ voice: agentProfile.voice as string | { id: string }, label: agentProfile.voice }));
    openAi.on("open", () => {
      const socketOpenedAt = Date.now();
      void Promise.all([instructionsPromise, voicePromise]).then(([{ voice: voiceInstructions, backend: backendInstructions }, callVoice]) => {
        if (agentProfile.id === "tom") console.log(`${LOG} call=${callSid ?? "unknown"} tom voice=${callVoice.label}`);
        if (closed || !openAi || openAi.readyState !== WebSocket.OPEN) return;
        console.log(`${LOG} startup call=${callSid ?? "unknown"} ws_open_ms=${socketOpenedAt - twilioStartAt} prompt_ready_ms=${Date.now() - twilioStartAt}`);
        openAi.send(JSON.stringify({
        type: "session.start",
        session: {
          model: "gpt-live-1",
          instructions: voiceInstructions,
          audio: { format: { type: "audio/pcmu", rate: 8000 }, output: { voice: callVoice.voice } },
          delegation: {
            type: "responses",
            responses: {
              model: BACKEND_MODEL,
              instructions: backendInstructions,
              tools: accountSupportHandoff
                ? MARIL_TOOLS
                : agentProfile.id === "tom"
                  ? TOOLS
                  : TOOLS.filter((tool) => tool.name !== "transfer_to_account_services"),
              tool_choice: "auto",
            },
          },
        },
        }));
        setTimeout(() => { if (!started) { console.error(`${LOG} session.started timed out`); finish("ai_timeout"); } }, 8_000);
      }).catch((error) => {
        console.error(`${LOG} could not prepare AI instructions:`, error.message);
        finish("ai_error");
      });
    });

    openAi.on("message", (raw: Buffer | string) => {
      let msg: any;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      const type = msg.type as string;

      if (type === "session.started") {
        started = true;
        console.log(`${LOG} realtime session ready agent=${agentProfile.id} voice=${agentProfile.voice} accountSupportHandoff=${accountSupportHandoff} ready_ms=${Date.now() - twilioStartAt}`);
        // After hold music, Maril is told to speak only as it ends, so her reply follows her opener.
        const speakFirst = () => {
          if (closed || !openAi || openAi.readyState !== WebSocket.OPEN) return;
          openAi.send(JSON.stringify({
            type: "session.instructions.append",
            delegation_id: null,
            content: accountSupportHandoff && marilOpener === "transferred"
              ? `You have already said, and the caller has heard: "${SHAVEZ_ACCOUNT_SUPPORT_GREETING}" Do not greet them again or repeat it. Listen to the caller and help. Do not pitch sales or ask why they called again if they already said.`
              : accountSupportHandoff && marilOpener === "direct"
              ? `You have already said, and the caller is hearing: "Thanks for calling ${CERTXA_SPOKEN_ALIAS} Account Services, this is Maril." Do not say it again or greet again. Speak now and say only: "${verifiedOwner ? `Am I speaking with ${verifiedOwner.firstName ?? "the owner"} from ${verifiedOwner.businessName}?` : "How can I help you today?"}" Then listen carefully and help.`
              : accountSupportHandoff
              ? marilContext?.transferred
                ? `Speak first now: "${SHAVEZ_ACCOUNT_SUPPORT_GREETING}" Then listen carefully and help. Do not pitch sales or ask why they called again if they already said.`
                : `Speak first now: "Thanks for calling ${CERTXA_SPOKEN_ALIAS} Account Services, this is Maril.${verifiedOwner ? ` Am I speaking with ${verifiedOwner.firstName ?? "the owner"} from ${verifiedOwner.businessName}?` : " How can I help you today?"}" Then listen carefully and help.`
              : agentProfile.id === "tom" && claimContext?.mode === "callback"
              ? `Speak first now. Say: "Hi, this is Tom from Certxa calling back for ${claimContext.callerName}. May I speak with ${claimContext.callerName}, please?" Then wait for them to come to the phone, and follow OUTBOUND OWNERSHIP CALL-BACK.`
              : agentProfile.id === "tom"
              ? tomOpeningInstructions(CERTXA_SPOKEN_ALIAS, connectionAcknowledged)
          : `Speak first now. Say exactly: "${pickAgentGreeting(agentProfile)}" Use the pronunciation guidance in your instructions. The caller has already selected sales in the phone menu; don't ask what they are calling about again. If they immediately ask a question, answer it naturally instead of insisting on a name. Then listen.`,
          }));
        };
        const holdLeft = holdUntil - Date.now();
        if (holdLeft > 0) setTimeout(speakFirst, holdLeft); else speakFirst();
        return;
      }
      if (type === "session.input_transcript.delta") {
        if (tomText) flush("tom");
        callerText += msg.delta ?? "";
        return;
      }
      if (type === "session.output_transcript.delta") {
        if (callerText) {
          flush("caller");
          if (agentProfile.id === "tom") {
            const accountRequest = isExistingCustomerAccountSupportRequest(transcript);
            if (accountRequest) {
              console.log(`${LOG} account-support request detected call=${callSid ?? "unknown"}; direct transfer will proceed`);
              scheduleAccountSupportTransfer();
            }
          }
        }
        tomText += msg.delta ?? "";
        return;
      }
      if (type === "session.output_audio.delta") {
        if (!firstAssistantAudioAt) {
          firstAssistantAudioAt = Date.now();
          if (agentProfile.id === "tom") {
            console.log(`${LOG} first assistant audio generated call=${callSid ?? "unknown"} first_audio_generated_ms=${firstAssistantAudioAt - twilioStartAt}`);
          } else {
            console.log(`${LOG} first assistant audio call=${callSid ?? "unknown"} first_audio_ms=${firstAssistantAudioAt - twilioStartAt}`);
          }
        }
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
        // Several tools can run at once (save_lead with find_prepared_salon): the next response is asked for only once
        // every one of them has returned, or the AI refuses it ("Missing tool results").
        toolsRunning += 1;
        const action = runTool(name, args)
          .catch((e) => { console.error(`${LOG} tool ${name} failed:`, e.message); return { success: false, message: "Something went wrong." }; })
          .then((result) => {
            toolsRunning -= 1;
            if (!openAi || openAi.readyState !== WebSocket.OPEN) return;
            openAi.send(JSON.stringify({ type: "response.item.create", item: { type: "function_call_output", call_id: callId, output: JSON.stringify(result) } }));
            if (toolsRunning === 0) openAi.send(JSON.stringify({ type: "response.create" }));
          });
        pendingActions.add(action);
        void action.then(() => pendingActions.delete(action), () => pendingActions.delete(action));
        return;
      }
      if (type === "error") console.error(`${LOG} OpenAI error:`, msg.error?.message ?? JSON.stringify(msg));
    });
    openAi.on("close", (code, reason) => {
      if (agentProfile.id === "tom") console.warn(`${LOG} agent=tom OpenAI Live socket closed code=${code} reason=${reason.toString().slice(0, 160)}`);
      finish("ai_closed");
    });
    openAi.on("error", (e) => console.error(`${LOG} OpenAI socket error:`, e.message));
  }

  // ── Twilio media stream ──
  twilioWs.on("message", (raw: Buffer | string) => {
    let msg: any;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.event === "mark" && agentProfile.id === "tom" && msg.mark?.name === "tom-first-audio") {
      if (firstAudioPlaybackMarkPending) {
        firstAudioPlaybackMarkPending = false;
        console.log(`${LOG} first audio playback mark acknowledged call=${callSid ?? "unknown"} stream_to_playback_ack_ms=${Date.now() - twilioStartAt} sent_to_playback_ack_ms=${Date.now() - firstAssistantAudioSentAt}`);
      }
      return;
    }
    if (msg.event === "start") {
      twilioStartAt = Date.now();
      streamSid = msg.start?.streamSid ?? null;
      callSid = msg.start?.callSid ?? null;
      const webhookReceivedAt = Number(msg.start?.customParameters?.webhookReceivedAt);
      if (agentProfile.id === "tom") {
        const webhookToStreamReadyMs = Number.isSafeInteger(webhookReceivedAt) && webhookReceivedAt > 0
          ? twilioStartAt - webhookReceivedAt
          : "unknown";
        console.log(`${LOG} stream ready call=${callSid ?? "unknown"} webhook_to_stream_ready_ms=${webhookToStreamReadyMs} ws_to_stream_ready_ms=${twilioStartAt - startedAt}`);
      }
      const from = String(msg.start?.customParameters?.from ?? "");
      // Maril is Account Services on every call (owner, 2026-11-10): transferred by Tom, or on her own line.
      const transferredByTom = agentProfile.id === "shavez" && String(msg.start?.customParameters?.handoff ?? "") === TOM_ACCOUNT_SUPPORT_HANDOFF;
      accountSupportHandoff = agentProfile.id === "shavez";
      callerPhone = tenDigit(from) ?? (from || null);
      callerPhoneE164 = canonicalCallerE164(from);
      // Maril: a call from an account owner's mobile on file is that owner (lib/marilAccountSupport.ts).
      if (agentProfile.id === "shavez") {
        // Her opening line plays at once; GPT-Live picks up after it (about two seconds to connect).
        const kind: MarilOpenerKind = transferredByTom ? "transferred" : "direct";
        const opener = marilOpenerFrames(kind);
        if (opener && streamSid) {
          marilOpener = kind;
          // A call to her own number hears 8 seconds of hold music first; GPT-Live gets ready while it plays.
          const music = kind === "direct" ? marilHoldMusicFrames() : null;
          if (music) { outQueue.push(...music); holdUntil = Date.now() + music.length * 20; }
          outQueue.push(...opener);
          startPacer();
          transcript.push({ role: "tom", text: canonicalizeSpokenBrandForText(MARIL_OPENER_TEXT[kind]), at: new Date().toISOString() });
          console.log(`${LOG} Maril ${kind} opener playing call=${callSid ?? "unknown"} ms=${Date.now() - twilioStartAt}`);
        }
        marilContextPromise = ownerByCallerId(callerPhone)
          .then((owner) => { verifiedOwner = owner; marilContext = { transferred: transferredByTom, owner }; })
          .catch((e) => { marilContext = { transferred: transferredByTom, owner: null }; console.warn(`${LOG} Maril caller lookup failed:`, e?.message ?? e); });
      }
      // A prepared salon page: Tom's call-back to the salon (its token came with the call), or a call from a salon's own line.
      const claimToken = String(msg.start?.customParameters?.claimCallback ?? "");
      claimContextPromise = agentProfile.id !== "tom" || accountSupportHandoff ? Promise.resolve() : (async () => {
        if (claimToken) {
          const cb = await claimCallbackForCall(claimToken);
          // Verified only once the person gives the two-digit number (confirm_callback_number).
          if (cb) claimContext = { mode: "callback", ...cb };
          return;
        }
        const own = await unclaimedSalonByPhone(callerPhone);
        if (own) { claimContext = { mode: "caller_id", jobId: own.jobId, salonName: own.name, street: own.street, city: own.city }; verifiedClaimJobs.set(own.jobId, "caller_id"); }
      })().catch((e) => { console.warn(`${LOG} claim context lookup failed:`, e?.message ?? e); });
      const callLogQuery = accountSupportHandoff
        ? pool.query(
          `INSERT INTO sales_call_logs (call_sid, caller_phone, caller_phone_e164, sales_agent_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (call_sid) WHERE call_sid IS NOT NULL DO UPDATE
             SET ended_at = NULL, outcome = 'in_progress'
           RETURNING id`,
          [callSid, callerPhone, callerPhoneE164, agentProfile.id],
        )
        : pool.query(
        `INSERT INTO sales_call_logs (call_sid, caller_phone, caller_phone_e164, sales_agent_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (call_sid) WHERE call_sid IS NOT NULL DO UPDATE
           SET caller_phone = COALESCE(sales_call_logs.caller_phone, EXCLUDED.caller_phone),
               caller_phone_e164 = COALESCE(sales_call_logs.caller_phone_e164, EXCLUDED.caller_phone_e164)
         RETURNING id`,
        [callSid, callerPhone, callerPhoneE164, agentProfile.id],
      );
      callLogPromise = callLogQuery.then((r) => { callLogId = Number(r.rows[0].id); return callLogId; })
        .catch((e) => { console.error(`${LOG} call log insert failed:`, e.message); return null; });
      console.log(`${LOG} agent=${agentProfile.id} call started from ${callerPhone ?? "unknown"}`);
      const preparation = prepareCall().catch((e) => {
        console.error(`${LOG} could not prepare caller memory:`, e.message);
        profile = null;
        leadId = null;
        profileCandidate = false;
        profileLookupCompleted = false;
        profileLookupFailed = true;
        identityBlocked = true;
      });
      callPreparationPromise = preparation;
      const connectionAcknowledged = agentProfile.id === "tom" && msg.start?.customParameters?.connectionAcknowledged === "true";
      if (!closed) openLive(connectionAcknowledged).catch((e) => { console.error(`${LOG} could not start the AI:`, e.message); finish("ai_error"); });
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
          // A mark echoed because of clear is not proof that the frame played.
          firstAudioPlaybackMarkPending = false;
          if (streamSid) twilioWs.send(JSON.stringify({ event: "clear", streamSid }));
        }
      } else interruptStreak = 0;
      if (started && openAi?.readyState === WebSocket.OPEN && Date.now() >= holdUntil) {
        openAi.send(JSON.stringify({ type: "session.input_audio.append", audio: payload }));
      }
      return;
    }
    if (msg.event === "stop") finish("caller_hung_up");
  });
  twilioWs.on("close", (code, reason) => {
    if (agentProfile.id === "tom") console.log(`${LOG} agent=tom Twilio media socket closed code=${code} reason=${reason.toString().slice(0, 160)}`);
    finish("caller_hung_up");
  });
  twilioWs.on("error", (e) => console.error(`${LOG} Twilio socket error:`, e.message));
}

/** Structured memory is produced after the raw transcript is safely stored. */
async function summarize(
  callLogId: number,
  transcript: { role: string; text: string }[],
  smsEvents: { at: string; to: string; body: string; sid: string | null; status: string }[],
  verifiedProfileId: number | null,
  outcome: string,
  agentProfile: SalesAgentProfile = TOM_SALES_AGENT,
): Promise<void> {
  const fallback = {
    summary: transcript.length ? "Call completed; structured AI summary unavailable." : "Call completed without a transcript.",
    callerIntent: null, businessDetails: {}, problems: [], featuresDiscussed: [], plansAndPricing: [],
    questions: [], objections: [], outstandingQuestions: [], commitments: [], expressedInterest: null,
    outcome, nextAction: null, profileFacts: [], smsEvents,
  };
  const writeFallback = async () => {
    await pool.query(`UPDATE sales_call_logs SET summary = COALESCE(summary, $2), structured_summary = COALESCE(structured_summary, $3::jsonb) WHERE id = $1`,
      [callLogId, fallback.summary, JSON.stringify(fallback)]);
  };
  if (!transcript.length || !process.env.OPENAI_API_KEY) {
    await writeFallback().catch((error) => console.error(`${LOG} fallback call summary failed:`, error.message));
    return;
  }
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        max_tokens: 1800,
        messages: [
          { role: "system", content: `Summarize a Certxa sales call handled by ${agentProfile.name} as JSON. Only record what is supported by the provided transcript and system-recorded SMS events. Do not assume a signup or trial is active after a link is sent. Separate caller statements from ${agentProfile.name}'s statements and from system SMS events. In the internal evidenceRole field, use "tom" for the sales-agent speaker regardless of the agent's name. Reply with:
{"summary": "one or two plain sentences", "callerIntent": string|null, "businessDetails": {}, "problems": string[], "featuresDiscussed": string[], "plansAndPricing": string[], "questions": string[], "objections": string[], "outstandingQuestions": string[], "commitments": string[], "expressedInterest": string|null, "outcome": string|null, "nextAction": string|null, "profileFacts": [{"field": string, "value": string, "evidenceRole": "caller"|"tom", "evidence": string}]}.
Only put explicit new or corrected business/contact/sales facts in profileFacts. Evidence must be an exact short quote copied from the stated role's transcript; no paraphrased evidence. Permitted fields: name, businessName, businessType, teamSize, city, email, currentSoftware, interestedPlan, locationCount, serviceModel, bookingProcess, clientManagementProcess, checkoutProcess, turnRotationProcess, commissionProcess, problem, featureOfInterest, planDiscussed, pricingDiscussed, question, objection, trialRequested, notInterested, outstandingQuestion, commitment. Use trialRequested="yes" only when the caller explicitly requests a trial/signup link, and notInterested="yes" only when the caller explicitly declines; otherwise omit them. For contact/business facts, evidenceRole must be caller. A plan/price discussed by Tom may use evidenceRole tom. If not supported, omit the fact. Keep any unmentioned value unknown. If transcript has no clear caller details, return empty arrays/objects instead of guessing.` },
          { role: "user", content: JSON.stringify({
            transcript: transcript.map((t) => ({ role: t.role === "caller" ? "caller" : agentProfile.name, text: t.text })).slice(0, 200),
            smsEvents,
          }).slice(0, 24_000) },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`OpenAI summary request returned ${res.status}`);
    const data: any = await res.json();
    const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "null");
    const structured = safeStructuredSummary(parsed);
    if (!structured) throw new Error("OpenAI summary was not a valid JSON object");
    structured.smsEvents = smsEvents; // only actual provider-successful sends, never model inference
    structured.memoryNotes = safeSummaryForCallerMemory(structured, transcript);
      await pool.query(`UPDATE sales_call_logs SET summary = COALESCE($2, summary), structured_summary = $3::jsonb WHERE id = $1`,
      [callLogId, structured.summary, JSON.stringify(structured)]);
    if (verifiedProfileId) {
      try {
        await updateProfileFromCall(verifiedProfileId, structured, transcript, smsEvents, callLogId, outcome);
      } catch (error) {
        console.error(`${LOG} post-call profile update failed (call ${callLogId}):`, (error as Error).message);
      }
    }
  } catch (e) {
    console.warn(`${LOG} summary failed:`, (e as Error).message);
    await writeFallback().catch((error) => console.error(`${LOG} fallback call summary failed:`, error.message));
  }
}

async function updateProfileFromCall(
  leadId: number,
  structured: SalesMemoryObject,
  transcript: { role: string; text: string }[],
  smsEvents: { at: string; to: string; body: string; sid: string | null; status: string }[],
  callLogId: number,
  outcome: string,
): Promise<void> {
  const { columns, profileData } = verifiedProfilePatch(structured, transcript);
  const salesPatch = (profileData.sales as SalesMemoryObject | undefined) ?? {};
  const memoryNotes = (structured.memoryNotes && typeof structured.memoryNotes === "object" ? structured.memoryNotes : {}) as SalesMemoryObject;
  if (typeof memoryNotes.nextAction === "string" && memoryNotes.nextAction.trim()) {
    salesPatch.nextAction = memoryNotes.nextAction.trim();
  }
  const notInterested = (Array.isArray(salesPatch.notInterested) && salesPatch.notInterested.includes("yes")) ||
    callerExplicitlyDeclined(transcript);
  const trialRequested = Array.isArray(salesPatch.trialRequested) && salesPatch.trialRequested.includes("yes");
  const signupLinkRequested = Array.isArray(salesPatch.signupLinkRequested) && salesPatch.signupLinkRequested.includes("yes");
  const hasInterests = Array.isArray(salesPatch.featuresOfInterest) && salesPatch.featuresOfInterest.length > 0;
  const hasFollowup = (Array.isArray(salesPatch.outstandingQuestions) && salesPatch.outstandingQuestions.length > 0) ||
    (Array.isArray(salesPatch.commitments) && salesPatch.commitments.length > 0);
  const requestedStage = notInterested ? "not_interested"
    : signupLinkRequested || trialRequested ? "signup_link_requested"
      : hasInterests ? "interested"
        : hasFollowup ? "follow_up_required"
          : null;
  const callStarted = await pool.query(`SELECT started_at FROM sales_call_logs WHERE id = $1`, [callLogId]);
  salesPatch.lastContactAt = callStarted.rows[0]?.started_at ?? new Date().toISOString();
  salesPatch.lastContactOutcome = outcome;
  salesPatch.lastCallLogId = callLogId;
  profileData.provenance = {
    ...((profileData.provenance as SalesMemoryObject | undefined) ?? {}),
    "sales.lastContactAt": { source: "system_event", callLogId },
    "sales.lastContactOutcome": { source: "system_event", callLogId },
  };
  if (smsEvents.length) {
    const lastSms = smsEvents[smsEvents.length - 1];
    salesPatch.signupLinkSent = true;
    salesPatch.lastSmsAt = lastSms.at;
    salesPatch.lastSmsSid = lastSms.sid;
  }
  if (Object.keys(salesPatch).length) profileData.sales = salesPatch;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(`SELECT profile_data FROM sales_leads WHERE id = $1 FOR UPDATE`, [leadId]);
    if (!r.rows[0]) throw new Error("Sales profile no longer exists");
    const oldProfile = (r.rows[0].profile_data && typeof r.rows[0].profile_data === "object" ? r.rows[0].profile_data : {}) as SalesMemoryObject;
    const oldSales = (oldProfile.sales && typeof oldProfile.sales === "object" ? oldProfile.sales : {}) as SalesMemoryObject;
    const mergedSales = mergeProfileData(oldSales, salesPatch);
    const eventStage = smsEvents.length ? "signup_link_sent" : requestedStage;
    const stageAwareSales = eventStage
      ? stageHistoryUpdate(mergedSales, eventStage, smsEvents.length ? "sms_sent" : "call_evidence", new Date().toISOString())
      : mergedSales;
    profileData.sales = stageAwareSales;
    const merged = mergeProfileData(oldProfile, profileData);
    const profileSales = (merged.sales && typeof merged.sales === "object" ? merged.sales : {}) as SalesMemoryObject;
    await client.query(
      `UPDATE sales_leads SET name = COALESCE($2, name), business_name = COALESCE($3, business_name),
         business_type = COALESCE($4, business_type), team_size = COALESCE($5, team_size),
         city = COALESCE($6, city), email = COALESCE($7, email),
         current_software = COALESCE($8, current_software), interested_plan = COALESCE($9, interested_plan),
         status = COALESCE($11, status), profile_data = $10::jsonb, updated_at = now() WHERE id = $1`,
      [leadId, columns.name ?? null, columns.business_name ?? null, columns.business_type ?? null,
       columns.team_size ?? null, columns.city ?? null, columns.email ?? null,
       columns.current_software ?? null, columns.interested_plan ?? null, JSON.stringify(merged),
       typeof profileSales.currentStage === "string" ? profileSales.currentStage : null],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}

/**
 * Fact check (owner, 2026-10-31: "make sure the agent never makes up anything"). After each call a separate model
 * compares everything Tom said with the fact sheet and live lists, and flags any claim that isn't supported.
 * Shown in isTeam → Sales Leads, so a wrong answer is caught and the fact sheet or playbook fixed.
 */
export async function factCheckTranscript(
  transcript: { role: string; text: string }[],
  agentProfile: SalesAgentProfile = TOM_SALES_AGENT,
): Promise<{ ok: boolean; issues: string[] } | null> {
  const tomLines = transcript.filter((t) => t.role === "tom").map((t) => t.text).join("\n");
  if (!tomLines.trim() || !process.env.OPENAI_API_KEY) return null;
  // Maril's calls are Account Services calls: checked against her account-support facts (owner, 2026-11-10).
  const marilCall = agentProfile.id === "shavez";
  const { voice } = await buildAgentInstructions(agentProfile, null, false, marilCall);
  const reference = voice.slice(voice.indexOf("SALON PLANS"), voice.indexOf("YOUR BACKEND"))
    + (marilCall ? "\n\nThe caller's own account details Maril states (their plan, dates, amounts, card ending, charges, credits, ticket numbers, what was sent, refunded or extended) come from Certxa's account tools during the call and are approved." : "");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.SALES_FACT_CHECK_MODEL || "gpt-4.1",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `You audit ${agentProfile.name}, a Certxa sales agent, for honesty. Below is the ONLY approved information about Certxa. Be strict. List every statement the agent made about Certxa that is NOT directly supported by the approved information, or that contradicts it: features, prices, totals, plans, limits, policies, numbers, where or how to get an app or a product, timelines ("soon", "coming"), promises (callbacks, demos, e-mails, discounts), and generalizations presented as fact ("most salons…", "I hear that a lot", "salons love…"). Simple arithmetic on approved prices is fine. Greetings, empathy ("I hear you", "I understand"), questions to the caller, pointing to certxa.com for sign-up, and repeating what the caller said about their own business are fine. A caller asking for "something free" counts as asking about free options; do not turn that into permission to call Certxa Pro simply free. Recommending the plan whose staff limit fits the caller's team is approved, and "yearly is like two months free" is approved (ten months for twelve). This transcript may come from a text simulation where actions run silently, so "I've sent the link" is fine. ${salesAgentFactCheckProductGuidance(agentProfile)} Reply as JSON {"issues": [string]} — an empty list when everything is supported.\n\nAPPROVED INFORMATION:\n${reference}` },
        { role: "user", content: transcript.map((t) => `${t.role === "tom" ? agentProfile.name.toUpperCase() : "CALLER"}: ${t.text}`).join("\n").slice(0, 20_000) },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const data: any = await res.json();
  const parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
  const issues = (Array.isArray(parsed.issues) ? parsed.issues : []).map((i: unknown) => String(i)).slice(0, 20);
  return { ok: issues.length === 0, issues };
}

async function factCheckCall(
  callLogId: number,
  transcript: { role: string; text: string }[],
  agentProfile: SalesAgentProfile = TOM_SALES_AGENT,
): Promise<void> {
  try {
    const result = await factCheckTranscript(transcript, agentProfile);
    if (!result) return;
    await pool.query(`UPDATE sales_call_logs SET fact_check_ok = $2, fact_check_issues = $3::jsonb WHERE id = $1`,
      [callLogId, result.ok, JSON.stringify(result.issues)]);
    if (!result.ok) console.warn(`${LOG} fact check flagged call ${callLogId}: ${result.issues.join(" | ")}`);
  } catch (e) {
    console.warn(`${LOG} fact check failed:`, (e as Error).message);
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export function setupSalesAgentRoutes(httpServer: HttpServer, app: Express): void {
  const warmFacts = () => { void refreshLiveSalesFacts(); };
  if (httpServer.listening) warmFacts(); else httpServer.once("listening", warmFacts);
  const factsRefreshTimer = setInterval(() => { void refreshLiveSalesFacts(); }, LIVE_SALES_FACTS_TTL_MS);
  factsRefreshTimer.unref();
  // Tom's ownership call-backs to salons (lib/salonClaim.ts): placed once due, about a minute after he promised them.
  const callbackTimer = setInterval(() => {
    const appUrl = publicAppUrl();
    if (appUrl && TOM_SALES_AGENT.phoneNumber) void placeDueClaimCallbacks(`${appUrl}${TOM_SALES_AGENT.webhookPath}`, TOM_SALES_AGENT.phoneNumber, `${appUrl}/api/webhook/twilio/sales/claim-callback-status`)
      .catch((e) => console.warn(`${LOG} claim call-backs:`, e?.message ?? e));
  }, 15_000);
  callbackTimer.unref();

  // Tom's call-back to a salon wasn't answered, was busy or failed (Twilio's status callback): try once more.
  app.post("/api/webhook/twilio/sales/claim-callback-status", async (req: Request, res: Response) => {
    const appUrl = publicAppUrl();
    if (!appUrl || !validTwilio(req, appUrl)) return res.status(403).type("text/plain").send("Forbidden");
    const status = String(req.body?.CallStatus ?? "");
    const token = String(req.query?.claimCallback ?? "");
    if (token && ["no-answer", "busy", "failed", "canceled"].includes(status)) {
      await retryClaimCallback({ token }, status).catch((e) => console.warn(`${LOG} call-back retry failed:`, e?.message ?? e));
    }
    return res.status(204).end();
  });

  const registerAgent = (agent: SalesAgentProfile): void => {
    app.post(agent.webhookPath, async (req: Request, res: Response) => {
      const webhookReceivedAt = Date.now();
      const appUrl = publicAppUrl();
      const sayAndHangUp = (text: string) =>
        res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Matthew">${xml(text)}</Say><Hangup/></Response>`);
      if (!appUrl) return sayAndHangUp("Thanks for calling Certxa. Please visit certxa dot com to start your free trial.");
      if (!validTwilio(req, appUrl)) {
        console.warn(`${LOG} agent=${agent.id} rejected a webhook with an invalid Twilio signature`);
        return res.status(403).type("text/plain").send("Forbidden");
      }
      const limit = await overLimits();
      if (limit) {
        console.warn(`${LOG} agent=${agent.id} call turned away: ${limit}`);
        return sayAndHangUp("Thanks for calling Certxa. All of our lines are busy right now. You can start your free trial any time at certxa dot com. Goodbye.");
      }
      // Tom's own call-back to a salon to verify its owner (lib/salonClaim.ts): the "caller" is the salon he dialled.
      const claimCallback = agent.id === "tom" ? String(req.query?.claimCallback ?? "") : "";
      const isClaimCallback = claimCallback !== "" && await claimCallbackIsCalling(claimCallback);
      const party = isClaimCallback ? String(req.body?.To ?? "") : String(req.body?.From ?? "");
      const from = tenDigit(party) ?? party;
      const streamUrl = `${appUrl.replace(/^http/i, "ws")}${agent.streamBase}/${issueStreamPass(agent.streamKind, agent.streamPassStoreId)}`;
      const isTom = agent.id === "tom";
      const accountSupportHandoff = agent.id === "shavez" && String(req.query?.handoff ?? "") === TOM_ACCOUNT_SUPPORT_HANDOFF;
      const handoffParameter = accountSupportHandoff
        ? `<Parameter name="handoff" value="${TOM_ACCOUNT_SUPPORT_HANDOFF}" />`
        : "";
      const connectAttributes = isTom
        ? ` action="${xml(`${appUrl}/api/webhook/twilio/sales/after-stream`)}" method="POST"`
        : "";
      const streamStatusAttributes = isTom
        ? ` statusCallback="${xml(`${appUrl}/api/webhook/twilio/sales/stream-status`)}" statusCallbackMethod="POST"`
        : "";
      const timingParameter = isTom
        ? `<Parameter name="webhookReceivedAt" value="${webhookReceivedAt}" />`
        : "";
      const connectionOpening = isClaimCallback ? "" : salesAgentConnectionOpening(agent);
      const acknowledgementParameter = isTom && !isClaimCallback ? '<Parameter name="connectionAcknowledged" value="true" />' : "";
      const claimParameter = isClaimCallback ? `<Parameter name="claimCallback" value="${xml(claimCallback)}" />` : "";
      console.log(`${LOG} agent=${agent.id} incoming call from ${from || "unknown"}`);
      if (isTom) console.log(`${LOG} webhook accepted call=${String(req.body?.CallSid ?? "unknown")} webhook_to_connect_twiml_ms=${Date.now() - webhookReceivedAt}`);
      return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${connectionOpening}
  <Connect${connectAttributes}>
    <Stream url="${streamUrl}"${streamStatusAttributes}>
      <Parameter name="from" value="${xml(from)}" />
      ${acknowledgementParameter}
      ${timingParameter}
      ${handoffParameter}
      ${claimParameter}
    </Stream>
  </Connect>
</Response>`);
    });

    const wss = new WebSocketServer({ noServer: true });
    wss.on("connection", (ws: WebSocket) => runSalesCall(ws, agent));
    httpServer.on("upgrade", (req, socket, head) => {
      const pathname = req.url?.split("?")[0] ?? "";
      if (pathname !== agent.streamBase && !pathname.startsWith(agent.streamBase + "/")) return;
      if (redeemStreamPass(agent.streamKind, passFromPath(pathname, agent.streamBase)) !== agent.streamPassStoreId) {
        console.warn(`${LOG} agent=${agent.id} stream refused — no valid one-time pass (${req.socket.remoteAddress ?? "?"})`);
        try { socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n"); } catch { /* ignore */ }
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req as any, socket as any, head, (ws) => wss.emit("connection", ws, req));
    });
  };

  registerAgent(TOM_SALES_AGENT);
  registerAgent(SHAVEZ_SALES_AGENT);

  app.get("/api/webhook/twilio/sales/hold-music.wav", (_req: Request, res: Response) => {
    try {
      const audio = readFileSync(join(apiRoot(), "public", "account-services-hold.wav"));
      return res.type("audio/wav").set("Cache-Control", "public, max-age=3600").send(audio);
    } catch (error) {
      console.error(`${LOG} hold-music asset unavailable:`, (error as Error).message);
      return res.sendStatus(404);
    }
  });

  // If Tom's media WebSocket drops unexpectedly, Twilio continues this Connect action rather than silently ending
  // the call when the stream closes. Known intentional endings remain clean hangups; failures get a short fallback.
  app.post("/api/webhook/twilio/sales/after-stream", async (req: Request, res: Response) => {
    const appUrl = publicAppUrl();
    const sayAndHangUp = (text: string) =>
      res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Matthew">${xml(text)}</Say><Hangup/></Response>`);
    if (!appUrl) return sayAndHangUp("I'm sorry, we lost the connection. Please call back or visit Certxa dot com. Goodbye.");
    if (!validTwilio(req, appUrl)) {
      console.warn(`${LOG} rejected an invalid Twilio Connect action signature`);
      return res.status(403).type("text/plain").send("Forbidden");
    }
    const callSid = String(req.body?.CallSid ?? "").trim();
    const result = callSid
      ? await pool.query(`SELECT outcome FROM sales_call_logs WHERE call_sid = $1 ORDER BY started_at DESC LIMIT 1`, [callSid]).catch(() => ({ rows: [] as any[] }))
      : { rows: [] as any[] };
    const outcome = String(result.rows[0]?.outcome ?? "");
    console.log(`${LOG} Tom Connect action call=${callSid || "unknown"} outcome=${outcome || "unknown"}`);
    if (outcome === "transferred_to_shavez") {
      return res.type("text/xml").send(shavezHandoffTwiML(
        `${appUrl}${SHAVEZ_SALES_AGENT.webhookPath}`,
        `${appUrl}/api/webhook/twilio/sales/hold-music.wav`,
      ));
    }
    if (["ended_by_tom", "caller_hung_up"].includes(outcome)) {
      return res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
    }
    return sayAndHangUp("I'm sorry, we lost the connection before I could finish helping. Please call back or visit Certxa dot com. Goodbye.");
  });

  app.post("/api/webhook/twilio/sales/stream-status", async (req: Request, res: Response) => {
    const appUrl = publicAppUrl();
    if (!appUrl || !validTwilio(req, appUrl)) {
      console.warn(`${LOG} rejected an invalid Tom stream-status signature`);
      return res.status(403).type("text/plain").send("Forbidden");
    }
    const event = String(req.body?.StreamEvent ?? "unknown").slice(0, 80);
    const error = String(req.body?.StreamError ?? "").slice(0, 500);
    const callSid = String(req.body?.CallSid ?? "unknown").slice(0, 40);
    if (event === "stream-error" || error) console.error(`${LOG} Twilio stream status call=${callSid} event=${event} error=${error || "unspecified"}`);
    else console.log(`${LOG} Twilio stream status call=${callSid} event=${event}`);
    if (callSid !== "unknown" && (event === "stream-stopped" || event === "stream-error")) {
      await pool.query(
        `UPDATE sales_call_logs
            SET ended_at = COALESCE(ended_at, now()),
                duration_seconds = COALESCE(duration_seconds, GREATEST(0, floor(extract(epoch FROM (now() - started_at)))::int)),
                outcome = CASE WHEN outcome = 'in_progress' AND $2 = 'stream-error' THEN 'twilio_stream_error'
                               WHEN outcome = 'in_progress' THEN 'stream_stopped'
                               ELSE outcome END
          WHERE call_sid = $1`,
        [callSid, event],
      ).catch((e) => console.warn(`${LOG} could not persist Twilio stream status:`, e.message));
    }
    return res.sendStatus(204);
  });

  // ── Back office (isTeam → Sales Leads) ──
  app.get("/api/support/sales-leads", requireSupportAuth, async (_req: Request, res: Response) => {
    try {
      const leads = await pool.query(
        `SELECT l.*, c.summary, c.duration_seconds, c.started_at AS last_call_at,
                c.outcome AS last_call_outcome, c.sales_agent_id AS last_call_agent_id
           FROM sales_leads l LEFT JOIN LATERAL (
             SELECT summary, duration_seconds, started_at, outcome, sales_agent_id FROM sales_call_logs
             WHERE lead_id = l.id AND identity_verified = true AND ended_at IS NOT NULL
             ORDER BY started_at DESC LIMIT 1
           ) c ON true
          ORDER BY l.created_at DESC LIMIT 300`,
      );
      const calls = await pool.query(
        `SELECT id, caller_phone, sales_agent_id, outcome, duration_seconds, summary, lead_id, started_at, ended_at,
                fact_check_ok, fact_check_issues, identity_verified
           FROM sales_call_logs ORDER BY started_at DESC LIMIT 100`,
      );
      res.json({
        leads: leads.rows,
        calls: calls.rows,
        phoneNumber: "(888) 814-7623",
        agentPhoneNumbers: { tom: TOM_SALES_AGENT.phoneNumber, shavez: SHAVEZ_SALES_AGENT.phoneNumber },
      });
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
    const allowed = ["new_prospect", "interested", "signup_link_requested", "not_interested", "follow_up_required"];
    if (!allowed.includes(status)) return res.status(400).json({ message: "Unknown or unverified sales stage" });
    await applySalesStageGlobally(Number(req.params.id), status, "admin_stage_update");
    res.json({ ok: true });
  });

  void warmMarilOpeners();
  console.log(`${LOG} ready — Tom POST ${TOM_SALES_AGENT.webhookPath} WSS ${TOM_SALES_AGENT.streamBase}; Shavez POST ${SHAVEZ_SALES_AGENT.webhookPath} WSS ${SHAVEZ_SALES_AGENT.streamBase}`);
}
