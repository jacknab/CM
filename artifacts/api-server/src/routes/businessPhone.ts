/**
 * Business Phone for the Certxa Pro app (owner, 2026-11-04).
 *
 * A pro picks one of five local numbers (Twilio's available-numbers API, as for Autumn); Certxa buys it on its own
 * Twilio account and points the number's voice and SMS webhooks here. Calls ring the app through the Twilio Voice SDK
 * (CallKit on iPhone); outgoing calls always show the business number. Texts to the number are kept and shown; sending
 * comes later. A call nobody answers is a missed call the pro can tap to call back. Nothing is ever recorded.
 *
 * Plus calling and texting on the shared Plus number (lib/plusLine.ts): POST /api/webhook/twilio/pro-phone/plus-voice ·
 * /plus-sms; outgoing Plus calls use the same TwiML App, only to the pro's own clients, from the Plus number.
 *   GET  /api/pro/phone/calling              'line' (Business Phone), 'plus' (Plus calling) or null: whether this phone rings,
 *                                            and the calling rule (ring during business hours or any time)
 *   PUT  /api/pro/phone {ring}               the calling rule: on the Business Phone line, else Plus's (store preferences)
 *
 * Billing ($10/month, renewals, failed payments, releasing numbers): lib/businessPhoneBilling.ts.
 *
 * No Twilio credential leaves the server: the app gets a one-hour voice access token signed with an API key.
 *   GET  /api/pro/phone                      the business's number and ring setting (null = not set up)
 *   GET  /api/pro/phone/available            five numbers to choose from (?areaCode, ?exclude= for "show others")
 *   GET  /api/pro/phone/pricing              $10/month and the $5 change fee, and the card on file they are charged to
 *   POST /api/pro/phone/claim                charge the first $10, buy the chosen number and wire its webhooks
 *   POST /api/pro/phone/cancel · /resume     stop (or keep) the $10/month at the end of the paid month
 *   POST /api/pro/phone/pay                  pay $10 now after a failed renewal (unpauses a held number)
 *   GET  /api/pro/phone/change               the fee to change the number, and the card on file it is charged to
 *   POST /api/pro/phone/change               charge the fee, buy the new number, wire it, release the old one
 *   PUT  /api/pro/phone                      ring: 'hours' (business hours only) | 'always'
 *   POST /api/pro/phone/token                voice access token for this phone
 *   GET  /api/pro/phone/calls · /texts       call history and texts received
 *   GET · POST · DELETE /api/pro/phone/blocked   numbers that can't call the business number (busy signal)
 *   POST /api/webhook/twilio/pro-phone/*     Twilio webhooks (X-Twilio-Signature checked)
 */
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import twilio from "twilio";
import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { getStoreTimezone } from "../lib/timezone";
import { pushOwnerMessage } from "../lib/ownerPush";
import { toE164US } from "../lib/phoneUtils";
import { stripe } from "../lib/stripe";
import { savedCard } from "./soloCredits";
import { isPlusStore, isStoreClient, noteContact, plusNumber, routePlusContact } from "../lib/plusLine";
import { broadcastNotification } from "../notifications";
import { mutateStorePreferences } from "../lib/storePreferences";
import { clientStatusOf, type ClientStatus } from "@shared/clientStatus";
import { MONTHLY_CENTS, PERIOD_DAYS, chargePhone, refundPhone } from "../lib/businessPhoneBilling";

const router = Router();
const searchLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });
const WEBHOOK = "/api/webhook/twilio/pro-phone";
/** Changing the business number (owner, 2026-11-04). */
export const NUMBER_CHANGE_FEE_CENTS = 500;
const SORRY = "Sorry, we can't take your call right now. Please try again later.";

const e164 = z.string().regex(/^\+1\d{10}$/);
const identityFor = (storeId: number) => `store-${storeId}`;

function appUrl(): string {
  return (process.env.APP_URL || "https://certxa.com").replace(/\/$/, "");
}
function twilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
  return sid && token ? twilio(sid, token) : null;
}
function validTwilio(req: Request): boolean {
  const token = String(process.env.TWILIO_AUTH_TOKEN ?? "").trim();
  if (!token) return process.env.NODE_ENV !== "production";
  const signature = String(req.headers["x-twilio-signature"] ?? "").trim();
  if (!signature) return false;
  return twilio.validateRequest(token, signature, `${appUrl()}${req.originalUrl}`, req.body ?? {});
}
function failed(res: Response, where: string, error: unknown) {
  // Never log request bodies, phone numbers or credentials.
  console.error(`[business-phone] ${where} failed:`, error instanceof Error ? error.message : "unknown error");
  // Certxa's Twilio account itself is suspended or closed (Twilio 20003 "… is not active"): nothing the pro can retry.
  const e = error as { code?: number; message?: string } | null;
  if (e?.code === 20003 || /is not active/i.test(e?.message ?? "")) {
    return res.status(503).json({ message: "Business Phone isn't available right now. Please try again later." });
  }
  return res.status(500).json({ message: "Something went wrong. Try again." });
}
async function storeOf(req: Request, res: Response): Promise<number | null> {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) res.status(403).json({ message: "No business on this sign-in" });
  return storeId;
}
type LineRow = { phone_number: string; ring: string; billing_status: string; paid_until: Date | null; cancel_at_period_end: boolean;
  next_attempt_at: Date | null; held_until: Date | null };
async function lineOf(storeId: number): Promise<LineRow | null> {
  const r = await pool.query<LineRow>(
    `SELECT phone_number, ring, billing_status, paid_until, cancel_at_period_end, next_attempt_at, held_until FROM business_phone_lines WHERE store_id = $1`, [storeId]);
  return r.rows[0] ?? null;
}
const lineJson = (l: LineRow) => ({
  phoneNumber: l.phone_number, ring: l.ring,
  billing: { status: l.billing_status, paidUntil: l.paid_until, cancelAtPeriodEnd: l.cancel_at_period_end, retryAt: l.next_attempt_at, heldUntil: l.held_until, monthlyCents: MONTHLY_CENTS },
});
const HELD = "Your Business Phone is paused because its payment didn't go through. Pay $10 in Settings › Business Phone to use it again.";
const lastTen = (n: string) => n.replace(/\D/g, "").slice(-10);
const pretty = (n: string) => { const d = lastTen(n); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : n; };

/** The client the number belongs to, if any: their name for pushes and history. */
async function clientNames(storeId: number, numbers: string[]): Promise<Map<string, { id: number; name: string }>> {
  const tens = [...new Set(numbers.map(lastTen).filter((d) => d.length === 10))];
  const out = new Map<string, { id: number; name: string }>();
  if (!tens.length) return out;
  const r = await pool.query<{ id: number; name: string; ten: string }>(
    `SELECT DISTINCT ON (RIGHT(p.phone_number_e164, 10)) c.id, RIGHT(p.phone_number_e164, 10) AS ten,
            COALESCE(NULLIF(c.full_name, ''), TRIM(CONCAT_WS(' ', c.first_name, c.last_name))) AS name
       FROM client_phones p JOIN clients c ON c.id = p.client_id
      WHERE c.store_id = $1 AND RIGHT(p.phone_number_e164, 10) = ANY($2::text[])
      ORDER BY RIGHT(p.phone_number_e164, 10), p.is_primary DESC, c.id`, [storeId, tens]);
  for (const row of r.rows) out.set(row.ten, { id: row.id, name: row.name });
  return out;
}

const STATUS_LABEL: Record<ClientStatus, string> = { new: "New", regular: "Regular", vip: "VIP", at_risk: "At risk", inactive: "Inactive" };

/**
 * The caller line on the iPhone's incoming-call screen (owner, 2026-11-04): "Client: Jane Smith · Regular" for one of the
 * pro's clients, else the number. Sent with the call as the DisplayName parameter; the app shows it through the Twilio
 * SDK's contact handle template (lib/voice.ts). Visits counted as the app's Clients list counts them.
 */
async function callerLine(storeId: number, from: string): Promise<string> {
  const r = await pool.query<{ name: string; vip: boolean; visits: number; last_visit_at: Date | null }>(
    `SELECT COALESCE(NULLIF(c.full_name, ''), TRIM(CONCAT_WS(' ', c.first_name, c.last_name))) AS name, (c.client_status = 'vip') AS vip,
            v.visits, v.last_visit_at
       FROM client_phones cp JOIN clients c ON c.id = cp.client_id AND c.archived_at IS NULL
       LEFT JOIN LATERAL (
         SELECT COUNT(DISTINCT COALESCE(a.ticket_group_id, a.id))::int AS visits, MAX(COALESCE(a.completed_at, a.date)) AS last_visit_at
           FROM appointments a WHERE a.customer_id = c.id AND a.store_id = c.store_id AND a.status IN ('completed', 'paid')
       ) v ON true
      WHERE cp.store_id = $1 AND cp.phone_number_e164 = $2 ORDER BY cp.is_primary DESC, c.id LIMIT 1`, [storeId, from]);
  const c = r.rows[0];
  if (!c?.name) return pretty(from);
  const days = c.last_visit_at ? Math.max(0, Math.floor((Date.now() - new Date(c.last_visit_at).getTime()) / 86_400_000)) : null;
  return `Client: ${c.name} · ${STATUS_LABEL[clientStatusOf({ isVip: c.vip, visits: c.visits ?? 0, daysSinceLastVisit: days })]}`;
}

/** Same rule as the rest of the platform: the store's business-hours row for today, in the store's time zone. */
async function openNow(storeId: number): Promise<boolean> {
  const tz = await getStoreTimezone(storeId);
  const now = new Date();
  const dow = parseInt(formatInTimeZone(now, tz, "i"), 10) % 7;
  const [hh, mm] = formatInTimeZone(now, tz, "HH:mm").split(":").map(Number);
  const r = await pool.query<{ open_time: string; close_time: string; is_closed: boolean }>(
    `SELECT open_time, close_time, is_closed FROM business_hours WHERE store_id = $1 AND day_of_week = $2 LIMIT 1`, [storeId, dow]);
  const row = r.rows[0];
  if (!row || row.is_closed) return false;
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const minutes = hh * 60 + mm;
  return minutes >= toMin(row.open_time) && minutes < toMin(row.close_time);
}

async function missedCall(storeId: number, callSid: string, from: string, plus = false) {
  await pool.query(`UPDATE business_phone_calls SET status = 'missed' WHERE call_sid = $1`, [callSid]);
  const client = (await clientNames(storeId, [from])).get(lastTen(from));
  const who = client?.name ?? pretty(from);
  // A Plus call (to the shared Plus number) is always from a client: the push opens their profile to call back.
  void pushOwnerMessage(storeId, plus && client
    ? { title: "Missed call", body: `${who} called you.`, data: { type: "plus_call", clientId: client.id } }
    : { title: "Missed call", body: `${who} called your business number.`, data: { type: "business_phone", tab: "calls" } });
}

// ─── App (signed in) ──────────────────────────────────────────────────────────

router.get("/api/pro/phone", isAuthenticated, async (req, res) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const line = await lineOf(storeId);
    res.json(line ? lineJson(line) : null);
  } catch (error) { failed(res, "status", error); }
});

router.get("/api/pro/phone/available", isAuthenticated, searchLimiter, async (req, res) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const client = twilioClient();
    if (!client) return res.status(503).json({ message: "Business Phone isn't available right now." });
    const store = await pool.query<{ phone: string | null; state: string | null }>(`SELECT phone, state FROM locations WHERE id = $1`, [storeId]);
    const asked = String(req.query.areaCode ?? "").replace(/\D/g, "");
    const areaCode = asked.length === 3 ? asked : lastTen(store.rows[0]?.phone ?? "").slice(0, 3);
    const exclude = new Set(String(req.query.exclude ?? "").split(",").filter(Boolean));
    const opts = { voiceEnabled: true, smsEnabled: true, limit: 30 };
    let found = areaCode.length === 3 ? await client.availablePhoneNumbers("US").local.list({ ...opts, areaCode: Number(areaCode) }) : [];
    let fresh = found.filter((n) => !exclude.has(n.phoneNumber));
    const state = (store.rows[0]?.state ?? "").trim().toUpperCase();
    if (fresh.length < 5 && /^[A-Z]{2}$/.test(state)) {
      found = await client.availablePhoneNumbers("US").local.list({ ...opts, inRegion: state });
      fresh = [...fresh, ...found.filter((n) => !exclude.has(n.phoneNumber) && !fresh.some((f) => f.phoneNumber === n.phoneNumber))];
    }
    for (let i = fresh.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [fresh[i], fresh[j]] = [fresh[j], fresh[i]]; }
    res.json({
      areaCode: areaCode.length === 3 ? areaCode : null,
      numbers: fresh.slice(0, 5).map((n) => ({ phoneNumber: n.phoneNumber, display: pretty(n.phoneNumber), place: [n.locality, n.region].filter((v) => v && v !== "US").join(", ") })),
    });
  } catch (error) { failed(res, "search", error); }
});

router.post("/api/pro/phone/claim", isAuthenticated, searchLimiter, async (req, res) => {
  const parsed = z.object({ phoneNumber: e164, idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: req.body?.idempotencyKey ? "Choose a number." : "Update the app to get a business number." });
  const storeId = await storeOf(req, res); if (!storeId) return;
  const client = twilioClient();
  if (!client) return res.status(503).json({ message: "Business Phone isn't available right now." });
  const db = await pool.connect();
  let paid: string | null = null;
  try {
    await db.query("BEGIN");
    // One number per business; two taps at once buy only one.
    await db.query(`SELECT pg_advisory_xact_lock(hashtext('business-phone-claim'), $1)`, [storeId]);
    const has = await db.query(`SELECT phone_number FROM business_phone_lines WHERE store_id = $1`, [storeId]);
    if (has.rows.length) { await db.query("ROLLBACK"); return res.status(409).json({ message: "Your business already has a number." }); }
    // The first month is paid before the number is bought; it is refunded if the number can't be had.
    const charge = await chargePhone(storeId, MONTHLY_CENTS, `bp-start-${storeId}-${parsed.data.idempotencyKey}`, "Business Phone, first month");
    if (!charge.ok) {
      await db.query("ROLLBACK");
      return res.status(402).json({ needsCard: charge.needsCard || charge.declined, message: charge.needsCard ? "Add a card to pay $10/month." : charge.message });
    }
    paid = charge.paymentId;
    let bought;
    try {
      bought = await client.incomingPhoneNumbers.create({
        phoneNumber: parsed.data.phoneNumber,
        friendlyName: `Certxa Pro · store ${storeId}`,
        voiceUrl: `${appUrl()}${WEBHOOK}/incoming`, voiceMethod: "POST",
        smsUrl: `${appUrl()}${WEBHOOK}/sms`, smsMethod: "POST",
      });
    } catch (error) {
      await db.query("ROLLBACK");
      await refundPhone(paid);
      console.warn("[business-phone] purchase refused:", error instanceof Error ? error.message : "unknown error");
      return res.status(409).json({ message: "That number was just taken. Choose another one. Your $10 was refunded." });
    }
    try {
      await db.query(
        `INSERT INTO business_phone_lines (store_id, phone_number, twilio_sid, billing_status, paid_until, last_payment_id)
         VALUES ($1, $2, $3, 'active', now() + ($4 || ' days')::interval, $5)`, [storeId, bought.phoneNumber, bought.sid, String(PERIOD_DAYS), paid]);
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      // Don't keep paying for a number no business has, nor keep the pro's money for it.
      await client.incomingPhoneNumbers(bought.sid).remove().catch(() => undefined);
      await refundPhone(paid);
      throw error;
    }
    console.log(`[business-phone] store=${storeId} number claimed (${paid})`);
    const line = await lineOf(storeId);
    res.json(line ? lineJson(line) : { phoneNumber: bought.phoneNumber, ring: "hours" });
  } catch (error) { failed(res, "claim", error); }
  finally { db.release(); }
});

router.get("/api/pro/phone/pricing", isAuthenticated, async (req, res) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const card = await savedCard(storeId);
    res.json({ monthlyCents: MONTHLY_CENTS, changeFeeCents: NUMBER_CHANGE_FEE_CENTS, card: card ? { brand: card.brand, last4: card.last4 } : null });
  } catch (error) { failed(res, "pricing", error); }
});

router.post("/api/pro/phone/cancel", isAuthenticated, async (req, res) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    await pool.query(`UPDATE business_phone_lines SET cancel_at_period_end = true WHERE store_id = $1 AND billing_status IN ('active', 'past_due')`, [storeId]);
    const line = await lineOf(storeId);
    res.json(line ? lineJson(line) : null);
  } catch (error) { failed(res, "cancel", error); }
});

router.post("/api/pro/phone/resume", isAuthenticated, async (req, res) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    await pool.query(`UPDATE business_phone_lines SET cancel_at_period_end = false WHERE store_id = $1`, [storeId]);
    const line = await lineOf(storeId);
    res.json(line ? lineJson(line) : null);
  } catch (error) { failed(res, "resume", error); }
});

/** Pay now after a failed renewal: a new paid month from today, and a held number works again. */
router.post("/api/pro/phone/pay", isAuthenticated, searchLimiter, async (req, res) => {
  const key = String(req.body?.idempotencyKey ?? "");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) return res.status(400).json({ message: "Invalid input" });
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const line = await lineOf(storeId);
    if (!line) return res.status(404).json({ message: "No business number yet." });
    if (line.billing_status !== "past_due" && line.billing_status !== "held") return res.json(lineJson(line));
    const charge = await chargePhone(storeId, MONTHLY_CENTS, `bp-pay-${storeId}-${key}`, "Business Phone, 1 month");
    if (!charge.ok) return res.status(402).json({ needsCard: charge.needsCard || charge.declined, message: charge.needsCard ? "Add a card to pay." : charge.message });
    await pool.query(
      `UPDATE business_phone_lines SET billing_status = 'active', paid_until = now() + ($2 || ' days')::interval, failed_attempts = 0,
              next_attempt_at = NULL, held_until = NULL, last_payment_id = $3 WHERE store_id = $1`, [storeId, String(PERIOD_DAYS), charge.paymentId]);
    console.log(`[business-phone] store=${storeId} paid after a failed renewal (${charge.paymentId})`);
    res.json(lineJson((await lineOf(storeId))!));
  } catch (error) { failed(res, "pay", error); }
});

router.get("/api/pro/phone/change", isAuthenticated, async (req, res) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const card = await savedCard(storeId);
    res.json({ feeCents: NUMBER_CHANGE_FEE_CENTS, card: card ? { brand: card.brand, last4: card.last4 } : null });
  } catch (error) { failed(res, "change fee", error); }
});

/**
 * Change the business number: the fee is charged to the card on file, the new number is bought and wired, the line
 * moves to it, then the old number is released back to Twilio (it can't be had back). If anything fails after the
 * charge, the charge is refunded and whatever was bought is released. Call history, texts and blocked numbers stay.
 */
router.post("/api/pro/phone/change", isAuthenticated, searchLimiter, async (req, res) => {
  const parsed = z.object({ phoneNumber: e164, idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Choose a number." });
  const storeId = await storeOf(req, res); if (!storeId) return;
  const client = twilioClient();
  if (!client) return res.status(503).json({ message: "Business Phone isn't available right now." });
  const db = await pool.connect();
  let paid: string | null = null;
  let bought: { sid: string; phoneNumber: string } | null = null;
  const undo = async () => {
    if (bought) await client.incomingPhoneNumbers(bought.sid).remove().catch(() => undefined);
    if (paid) await stripe.refunds.create({ payment_intent: paid }, { idempotencyKey: `refund_${paid}` }).catch((e) => console.error("[business-phone] refund failed:", e?.message));
  };
  try {
    await db.query("BEGIN");
    await db.query(`SELECT pg_advisory_xact_lock(hashtext('business-phone-claim'), $1)`, [storeId]);
    const line = (await db.query<{ phone_number: string; twilio_sid: string; billing_status: string }>(
      `SELECT phone_number, twilio_sid, billing_status FROM business_phone_lines WHERE store_id = $1`, [storeId])).rows[0];
    if (!line) { await db.query("ROLLBACK"); return res.status(404).json({ message: "No business number yet." }); }
    if (line.billing_status === "held") { await db.query("ROLLBACK"); return res.status(402).json({ message: HELD }); }
    // The same request again after it went through: already done.
    if (line.phone_number === parsed.data.phoneNumber) { await db.query("ROLLBACK"); return res.json({ phoneNumber: line.phone_number }); }
    const card = await savedCard(storeId);
    if (!card) { await db.query("ROLLBACK"); return res.status(409).json({ needsCard: true, message: "Add a card to pay the $5 fee." }); }
    try {
      const pi = await stripe.paymentIntents.create({
        amount: NUMBER_CHANGE_FEE_CENTS, currency: "usd", customer: card.customerId, payment_method: card.paymentMethodId,
        off_session: true, confirm: true, description: `Business phone number change (store #${storeId})`,
        metadata: { type: "business_phone_change", storeId: String(storeId) },
      }, { idempotencyKey: `phone_change_${storeId}_${parsed.data.idempotencyKey}` });
      if (pi.status !== "succeeded") throw new Error(`payment ${pi.status}`);
      // A resent request returns the first payment again; if that one was refunded (its number change failed), it
      // doesn't pay for this one.
      const fresh = await stripe.paymentIntents.retrieve(pi.id, { expand: ["latest_charge"] });
      const charge = fresh.latest_charge as { refunded?: boolean; amount_refunded?: number } | null;
      if (charge && (charge.refunded || (charge.amount_refunded ?? 0) > 0)) throw new Error("payment already refunded");
      paid = pi.id;
    } catch (error) {
      await db.query("ROLLBACK");
      console.warn(`[business-phone] store=${storeId} change fee not charged:`, error instanceof Error ? error.message : "unknown error");
      return res.status(402).json({ needsCard: true, message: "Your card couldn't be charged. Add another card and try again." });
    }
    try {
      bought = await client.incomingPhoneNumbers.create({
        phoneNumber: parsed.data.phoneNumber,
        friendlyName: `Certxa Pro · store ${storeId}`,
        voiceUrl: `${appUrl()}${WEBHOOK}/incoming`, voiceMethod: "POST",
        smsUrl: `${appUrl()}${WEBHOOK}/sms`, smsMethod: "POST",
      });
    } catch (error) {
      await db.query("ROLLBACK");
      await undo();
      console.warn("[business-phone] change purchase refused:", error instanceof Error ? error.message : "unknown error");
      return res.status(409).json({ message: "That number was just taken. Choose another one. Your $5 was refunded." });
    }
    try {
      await db.query(`UPDATE business_phone_lines SET phone_number = $2, twilio_sid = $3 WHERE store_id = $1`, [storeId, bought.phoneNumber, bought.sid]);
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      await undo();
      throw error;
    }
    // The old number goes back to Twilio's pool.
    await client.incomingPhoneNumbers(line.twilio_sid).remove().catch((error) =>
      console.error(`[business-phone] store=${storeId} old number NOT released (${line.twilio_sid}):`, error instanceof Error ? error.message : "unknown error"));
    console.log(`[business-phone] store=${storeId} number changed (${paid})`);
    res.json({ phoneNumber: bought.phoneNumber });
  } catch (error) { failed(res, "change", error); }
  finally { db.release(); }
});

router.put("/api/pro/phone", isAuthenticated, async (req, res) => {
  const parsed = z.object({ ring: z.enum(["hours", "always"]) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid input" });
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const r = await pool.query(`UPDATE business_phone_lines SET ring = $2 WHERE store_id = $1 RETURNING phone_number, ring`, [storeId, parsed.data.ring]);
    if (!r.rows.length) {
      // No line: Plus calling's own rule.
      if (!(await isPlusStore(storeId))) return res.status(404).json({ message: "No business number yet." });
      await mutateStorePreferences(storeId, (current) => ({ ...current, plusRing: parsed.data.ring }));
      return res.json({ mode: "plus", ring: parsed.data.ring });
    }
    res.json(lineJson((await lineOf(storeId))!));
  } catch (error) { failed(res, "settings", error); }
});

/** Plus calling's rule when there's no Business Phone line (owner, 2026-11-04): store_settings preferences.plusRing. */
async function plusRing(storeId: number): Promise<"hours" | "always"> {
  const r = await pool.query<{ preferences: string | null }>(`SELECT preferences FROM store_settings WHERE store_id = $1`, [storeId]);
  try { return JSON.parse(r.rows[0]?.preferences ?? "{}")?.plusRing === "always" ? "always" : "hours"; } catch { return "hours"; }
}
async function ringFor(storeId: number): Promise<"hours" | "always"> {
  const line = await lineOf(storeId);
  return line ? (line.ring === "always" ? "always" : "hours") : plusRing(storeId);
}

/** Whether this business's phone takes calls: its own Business Phone number, or Plus calling on the shared number. */
async function callingMode(storeId: number): Promise<"line" | "plus" | null> {
  const line = await lineOf(storeId);
  if (line && line.billing_status !== "held") return "line";
  return (await isPlusStore(storeId)) ? "plus" : null;
}

router.get("/api/pro/phone/calling", isAuthenticated, async (req, res) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const mode = await callingMode(storeId);
    res.json({ mode, ring: mode ? await ringFor(storeId) : null, plusNumber: mode === "plus" ? plusNumber() : null });
  } catch (error) { failed(res, "calling", error); }
});

router.post("/api/pro/phone/token", isAuthenticated, async (req, res) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    if (!(await callingMode(storeId))) {
      const line = await lineOf(storeId);
      return line ? res.status(402).json({ message: HELD }) : res.status(404).json({ message: "No business number yet." });
    }
    const { TWILIO_ACCOUNT_SID: account, TWILIO_API_KEY_SID: keySid, TWILIO_API_KEY_SECRET: keySecret, TWILIO_PRO_TWIML_APP_SID: appSid } = process.env;
    if (!account || !keySid || !keySecret || !appSid) return res.status(503).json({ message: "Business Phone isn't available right now." });
    const identity = identityFor(storeId);
    // Incoming calls wake the phone through Apple's push service, and Apple keeps a development and a production one: a
    // build signed with a development profile (preview-dev) gets a development push token, an App Store / TestFlight
    // build a production one, and a token sent to the other is refused, so the phone never rings (found 2026-11-04).
    // The app says which (EXPO_PUBLIC_APNS_ENV); builds from before it was added are development builds.
    const apns = req.body?.apns === "production" ? "production" : "development";
    const pushCredential = apns === "production" ? process.env.TWILIO_PRO_PUSH_CREDENTIAL_SID : process.env.TWILIO_PRO_PUSH_CREDENTIAL_SID_SANDBOX ?? process.env.TWILIO_PRO_PUSH_CREDENTIAL_SID;
    const token = new twilio.jwt.AccessToken(account, keySid, keySecret, { identity, ttl: 3600 });
    token.addGrant(new twilio.jwt.AccessToken.VoiceGrant({
      outgoingApplicationSid: appSid,
      incomingAllow: true,
      ...(pushCredential ? { pushCredentialSid: pushCredential } : {}),
    }));
    res.json({ token: token.toJwt(), identity });
  } catch (error) { failed(res, "token", error); }
});

router.get("/api/pro/phone/calls", isAuthenticated, async (req, res) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const r = await pool.query<{ id: number; direction: string; other_number: string; status: string; duration_seconds: number | null; started_at: Date }>(
      `SELECT id, direction, other_number, status, duration_seconds, started_at FROM business_phone_calls
        WHERE store_id = $1 ORDER BY started_at DESC LIMIT 200`, [storeId]);
    const names = await clientNames(storeId, r.rows.map((c) => c.other_number));
    res.json(r.rows.map((c) => {
      const client = names.get(lastTen(c.other_number));
      return { id: c.id, direction: c.direction, number: c.other_number, display: pretty(c.other_number), clientId: client?.id ?? null, clientName: client?.name ?? null,
        status: c.status, durationSeconds: c.duration_seconds, at: c.started_at };
    }));
  } catch (error) { failed(res, "calls", error); }
});

router.get("/api/pro/phone/texts", isAuthenticated, async (req, res) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const r = await pool.query<{ id: number; from_number: string; body: string; media_count: number; received_at: Date }>(
      `SELECT id, from_number, body, media_count, received_at FROM business_phone_texts WHERE store_id = $1 ORDER BY received_at DESC LIMIT 200`, [storeId]);
    const names = await clientNames(storeId, r.rows.map((t) => t.from_number));
    res.json(r.rows.map((t) => {
      const client = names.get(lastTen(t.from_number));
      return { id: t.id, number: t.from_number, display: pretty(t.from_number), clientId: client?.id ?? null, clientName: client?.name ?? null,
        body: t.body, mediaCount: t.media_count, at: t.received_at };
    }));
  } catch (error) { failed(res, "texts", error); }
});

router.get("/api/pro/phone/blocked", isAuthenticated, async (req, res) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const r = await pool.query<{ id: number; phone_e164: string; reason: string | null }>(
      `SELECT id, phone_e164, reason FROM business_phone_blocked WHERE store_id = $1 ORDER BY created_at DESC`, [storeId]);
    const names = await clientNames(storeId, r.rows.map((b) => b.phone_e164));
    res.json(r.rows.map((b) => ({ id: b.id, phoneE164: b.phone_e164, reason: b.reason, clientName: names.get(lastTen(b.phone_e164))?.name ?? null })));
  } catch (error) { failed(res, "blocked list", error); }
});

router.post("/api/pro/phone/blocked", isAuthenticated, async (req, res) => {
  const phoneE164 = toE164US(String(req.body?.phone ?? ""));
  if (!phoneE164) return res.status(400).json({ message: "Enter a valid 10-digit US phone number" });
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    const reason = String(req.body?.reason ?? "").trim().slice(0, 200) || null;
    const r = await pool.query(
      `INSERT INTO business_phone_blocked (store_id, phone_e164, reason) VALUES ($1, $2, $3)
       ON CONFLICT (store_id, phone_e164) DO UPDATE SET reason = EXCLUDED.reason RETURNING id`, [storeId, phoneE164, reason]);
    res.status(201).json({ id: r.rows[0].id, phoneE164, reason });
  } catch (error) { failed(res, "block", error); }
});

router.delete("/api/pro/phone/blocked/:id", isAuthenticated, async (req, res) => {
  try {
    const storeId = await storeOf(req, res); if (!storeId) return;
    await pool.query(`DELETE FROM business_phone_blocked WHERE id = $1 AND store_id = $2`, [Number(req.params.id) || 0, storeId]);
    res.status(204).end();
  } catch (error) { failed(res, "unblock", error); }
});

// ─── Twilio webhooks ──────────────────────────────────────────────────────────

function twiml(res: Response, response: twilio.twiml.VoiceResponse | twilio.twiml.MessagingResponse) {
  res.type("text/xml").send(response.toString());
}

/** A call to a business number: ring the pro's phone (business hours only, unless set to always), else a missed call. */
router.post(`${WEBHOOK}/incoming`, async (req, res) => {
  if (!validTwilio(req)) return res.status(403).send("Forbidden");
  const response = new twilio.twiml.VoiceResponse();
  try {
    const to = String(req.body?.To ?? ""), from = String(req.body?.From ?? ""), callSid = String(req.body?.CallSid ?? "");
    const line = await pool.query<{ store_id: number; ring: string; billing_status: string }>(`SELECT store_id, ring, billing_status FROM business_phone_lines WHERE phone_number = $1`, [to]);
    const storeId = line.rows[0]?.store_id;
    if (!storeId || !callSid) { response.say(SORRY); response.hangup(); return twiml(res, response); }
    // Paused for an unpaid Business Phone: the call doesn't ring and isn't kept.
    if (line.rows[0].billing_status === "held") { response.say("This number is not available right now."); response.hangup(); return twiml(res, response); }
    // A blocked number hears a busy signal; the call isn't kept and the pro isn't told.
    const blocked = await pool.query(`SELECT 1 FROM business_phone_blocked WHERE store_id = $1 AND phone_e164 = $2`, [storeId, from]);
    if (blocked.rows.length) { response.reject({ reason: "busy" }); return twiml(res, response); }
    await pool.query(
      `INSERT INTO business_phone_calls (store_id, call_sid, direction, other_number, status) VALUES ($1, $2, 'incoming', $3, 'ringing')
       ON CONFLICT (call_sid) DO NOTHING`, [storeId, callSid, from || "unknown"]);
    if (line.rows[0].ring !== "always" && !(await openNow(storeId))) {
      await missedCall(storeId, callSid, from);
      response.say(SORRY); response.hangup();
      return twiml(res, response);
    }
    const dial = response.dial({ timeout: 25, answerOnBridge: true, action: `${appUrl()}${WEBHOOK}/dial-done`, method: "POST" });
    const ring = dial.client();
    ring.identity(identityFor(storeId));
    ring.parameter({ name: "DisplayName", value: await callerLine(storeId, from) });
    twiml(res, response);
  } catch (error) {
    console.error("[business-phone] incoming failed:", error instanceof Error ? error.message : "unknown error");
    response.say(SORRY); response.hangup();
    twiml(res, response);
  }
});

/** The TwiML App's voice URL: a call placed from the app. The caller ID is always the business's own number. */
router.post(`${WEBHOOK}/outgoing`, async (req, res) => {
  if (!validTwilio(req)) return res.status(403).send("Forbidden");
  const response = new twilio.twiml.VoiceResponse();
  try {
    const storeId = Number(/^client:store-(\d+)$/.exec(String(req.body?.From ?? req.body?.Caller ?? ""))?.[1]);
    const digits = String(req.body?.To ?? "").replace(/\D/g, "");
    const to = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : null;
    const line = storeId ? await lineOf(storeId) : null;
    let callerId = line && line.billing_status !== "held" ? line.phone_number : null;
    // Plus calling: no dialer, only the pro's own clients, from the shared Plus number.
    if (!callerId && storeId && to && await isPlusStore(storeId)) {
      if (!(await isStoreClient(storeId, to))) { response.say("You can call your clients only."); response.hangup(); return twiml(res, response); }
      callerId = plusNumber();
      await noteContact(storeId, to, false);
    }
    if (!callerId || !to) { response.say(callerId ? "That number can't be called." : SORRY); response.hangup(); return twiml(res, response); }
    await pool.query(
      `INSERT INTO business_phone_calls (store_id, call_sid, direction, other_number, status) VALUES ($1, $2, 'outgoing', $3, 'ringing')
       ON CONFLICT (call_sid) DO NOTHING`, [storeId, String(req.body?.CallSid ?? ""), to]);
    const dial = response.dial({ callerId, answerOnBridge: true, timeout: 40, action: `${appUrl()}${WEBHOOK}/dial-done`, method: "POST" });
    dial.number(to);
    twiml(res, response);
  } catch (error) {
    console.error("[business-phone] outgoing failed:", error instanceof Error ? error.message : "unknown error");
    response.say(SORRY); response.hangup();
    twiml(res, response);
  }
});

/** Twilio reports how the <Dial> ended: answered (with its length) or not. An unanswered incoming call is a missed call. */
router.post(`${WEBHOOK}/dial-done`, async (req, res) => {
  if (!validTwilio(req)) return res.status(403).send("Forbidden");
  const response = new twilio.twiml.VoiceResponse();
  try {
    const callSid = String(req.body?.CallSid ?? "");
    const status = String(req.body?.DialCallStatus ?? "");
    const seconds = Number(req.body?.DialCallDuration ?? 0) || 0;
    const r = await pool.query<{ store_id: number; direction: string; other_number: string }>(
      `SELECT store_id, direction, other_number FROM business_phone_calls WHERE call_sid = $1`, [callSid]);
    const call = r.rows[0];
    if (call) {
      if (status === "completed" || status === "answered") {
        await pool.query(`UPDATE business_phone_calls SET status = 'answered', duration_seconds = $2 WHERE call_sid = $1`, [callSid, seconds]);
      } else if (call.direction === "incoming") {
        await missedCall(call.store_id, callSid, call.other_number, String(req.body?.To ?? "") === plusNumber());
        if (req.body?.CallStatus !== "completed") response.say(SORRY);
      } else {
        await pool.query(`UPDATE business_phone_calls SET status = $2 WHERE call_sid = $1`, [callSid, status === "busy" || status === "no-answer" || status === "canceled" ? "no-answer" : "failed"]);
      }
    }
  } catch (error) {
    console.error("[business-phone] dial-done failed:", error instanceof Error ? error.message : "unknown error");
  }
  response.hangup();
  twiml(res, response);
});

/** A text to a business number: kept and shown in the app, with a push. No reply is sent. */
router.post(`${WEBHOOK}/sms`, async (req, res) => {
  if (!validTwilio(req)) return res.status(403).send("Forbidden");
  try {
    const to = String(req.body?.To ?? ""), from = String(req.body?.From ?? ""), sid = String(req.body?.MessageSid ?? "");
    const line = await pool.query<{ store_id: number }>(`SELECT store_id FROM business_phone_lines WHERE phone_number = $1 AND billing_status <> 'held'`, [to]);
    const storeId = line.rows[0]?.store_id;
    if (storeId && sid && from) {
      const body = String(req.body?.Body ?? "").slice(0, 2000);
      const media = Number(req.body?.NumMedia ?? 0) || 0;
      const saved = await pool.query(
        `INSERT INTO business_phone_texts (store_id, message_sid, from_number, body, media_count) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (message_sid) DO NOTHING RETURNING id`, [storeId, sid, from, body, media]);
      if (saved.rows.length) {
        const who = (await clientNames(storeId, [from])).get(lastTen(from))?.name ?? pretty(from);
        void pushOwnerMessage(storeId, { title: `Text from ${who}`, body: body.slice(0, 160) || "Sent a photo.", data: { type: "business_phone", tab: "texts" } });
      }
    }
  } catch (error) {
    console.error("[business-phone] sms failed:", error instanceof Error ? error.message : "unknown error");
  }
  twiml(res, new twilio.twiml.MessagingResponse());
});

/** A call to the shared Plus number: rings the active Plus pro the caller is a client of (business hours, as Business Phone). */
router.post(`${WEBHOOK}/plus-voice`, async (req, res) => {
  if (!validTwilio(req)) return res.status(403).send("Forbidden");
  const response = new twilio.twiml.VoiceResponse();
  try {
    const from = toE164US(String(req.body?.From ?? "")) ?? "";
    const callSid = String(req.body?.CallSid ?? "");
    const contact = from ? await routePlusContact(from) : null;
    // Not a client of an active Plus pro (unknown caller, or their pro deactivated, left Plus or hasn't used the app in
    // 30 days): a busy signal.
    if (!contact || !callSid) { response.reject({ reason: "busy" }); return twiml(res, response); }
    const { storeId } = contact;
    const blocked = await pool.query(`SELECT 1 FROM business_phone_blocked WHERE store_id = $1 AND phone_e164 = $2`, [storeId, from]);
    if (blocked.rows.length) { response.reject({ reason: "busy" }); return twiml(res, response); }
    await pool.query(
      `INSERT INTO business_phone_calls (store_id, call_sid, direction, other_number, status) VALUES ($1, $2, 'incoming', $3, 'ringing')
       ON CONFLICT (call_sid) DO NOTHING`, [storeId, callSid, from]);
    await noteContact(storeId, from, true);
    if ((await ringFor(storeId)) !== "always" && !(await openNow(storeId))) {
      await missedCall(storeId, callSid, from, true);
      response.say(SORRY); response.hangup();
      return twiml(res, response);
    }
    const dial = response.dial({ timeout: 25, answerOnBridge: true, action: `${appUrl()}${WEBHOOK}/dial-done`, method: "POST" });
    const ring = dial.client();
    ring.identity(identityFor(storeId));
    ring.parameter({ name: "DisplayName", value: await callerLine(storeId, from) });
    twiml(res, response);
  } catch (error) {
    console.error("[plus-line] voice failed:", error instanceof Error ? error.message : "unknown error");
    response.say(SORRY); response.hangup();
    twiml(res, response);
  }
});

/**
 * A text to the shared Plus number: into the Plus pro's Messages (the two-way SMS inbox), with a push. Only from a
 * client of a Plus pro; STOP and START are recorded like on the two-way SMS number.
 */
router.post(`${WEBHOOK}/plus-sms`, async (req, res) => {
  if (!validTwilio(req)) return res.status(403).send("Forbidden");
  try {
    const raw = String(req.body?.From ?? "");
    const from = toE164US(raw);
    const body = String(req.body?.Body ?? "").trim().slice(0, 2000);
    const keyword = body.toUpperCase().split(/\s+/)[0];
    const digits = raw.replace(/\D/g, "");
    if (from && ["STOP", "STOPALL", "UNSUBSCRIBE", "END", "QUIT"].includes(keyword)) {
      await pool.query(`INSERT INTO sms_opt_outs (phone, is_opted_out) VALUES ($1, true)
        ON CONFLICT (phone) DO UPDATE SET is_opted_out = true, opted_out_at = now(), opted_back_in_at = NULL`, [digits]);
    } else if (from && ["START", "UNSTOP", "YES"].includes(keyword)) {
      await pool.query(`INSERT INTO sms_opt_outs (phone, is_opted_out, opted_back_in_at) VALUES ($1, false, now())
        ON CONFLICT (phone) DO UPDATE SET is_opted_out = false, opted_back_in_at = now()`, [digits]);
    }
    const contact = from && body ? await routePlusContact(from) : null;
    if (contact) {
      const blocked = await pool.query(`SELECT 1 FROM sms_contact_routing WHERE store_id = $1 AND client_phone = $2 AND blocked_at IS NOT NULL`, [contact.storeId, from]);
      if (!blocked.rows.length) {
        const sid = String(req.body?.MessageSid ?? "") || null;
        const dup = sid ? await pool.query(`SELECT 1 FROM sms_conversations WHERE twilio_sid = $1 LIMIT 1`, [sid]) : { rows: [] };
        if (!dup.rows.length) {
          await pool.query(`INSERT INTO sms_conversations (store_id, client_phone, client_name, direction, body, twilio_sid) VALUES ($1, $2, $3, 'inbound', $4, $5)`,
            [contact.storeId, from, contact.name || null, body, sid]);
          await noteContact(contact.storeId, from!, true);
          broadcastNotification({ type: "sms_inbound", storeId: contact.storeId, clientPhone: from!, clientName: contact.name || null, body, createdAt: new Date().toISOString() } as any);
          void pushOwnerMessage(contact.storeId, { title: `Text from ${contact.name || pretty(from!)}`, body: body.slice(0, 160), data: { type: "plus_text", phone: from, name: contact.name } });
        }
      }
    }
  } catch (error) {
    console.error("[plus-line] sms failed:", error instanceof Error ? error.message : "unknown error");
  }
  twiml(res, new twilio.twiml.MessagingResponse());
});

export default router;
