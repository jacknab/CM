/**
 * The Online Check-In Line on the database (plans/online-checkin-line.md, owner 2026-11-03). A phone check-in is a row
 * in kiosk_checkins (source 'online') — the same line the /barber Queue, the kiosk and the lobby screen show. The
 * client's page is reached by the check-in's own secret token, never by its number.
 *
 * Every text is a system text (free to the shop, owner rule) and goes out once: a row is claimed by a conditional
 * UPDATE before the text is sent, so the cluster's processes never send the same text twice.
 */
import crypto from "crypto";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { pool } from "../db";
import { storage } from "../storage";
import { toE164US } from "./phoneUtils";
import { CHECKIN_MARKER_HOURS } from "./nailTickets";
import {
  estimateLine, lineSettings, medianMinutes, offersOnlineLine, publicName, waitText,
  type LineEstimate, type LineSettings,
} from "./onlineLine";

export interface LineDeps {
  /** Barbers in now (clocked in, not on break, in the turn line). */
  workingBarbers(storeId: number): Promise<{ id: number; name: string }[]>;
  /** Every screen of the shop looks at the line again. */
  notify(storeId: number): void;
}

export interface LineStore {
  id: number; name: string; slug: string; phone: string | null; address: string | null; city: string | null; state: string | null;
  timezone: string; category: string | null; accountStatus: string;
}

const storeCols = `id, name, booking_slug AS slug, phone, address, city, state, COALESCE(timezone, 'UTC') AS timezone, category,
  LOWER(COALESCE(account_status, 'active')) AS account_status`;
const toStore = (r: any): LineStore => ({ id: Number(r.id), name: r.name, slug: r.slug, phone: r.phone ?? null, address: r.address ?? null,
  city: r.city ?? null, state: r.state ?? null, timezone: r.timezone, category: r.category ?? null, accountStatus: r.account_status });

export async function lineStoreBySlug(slug: string): Promise<LineStore | null> {
  const r = (await pool.query(`SELECT ${storeCols} FROM locations WHERE booking_slug = $1`, [slug])).rows[0];
  return r ? toStore(r) : null;
}
async function lineStoreById(id: number): Promise<LineStore | null> {
  const r = (await pool.query(`SELECT ${storeCols} FROM locations WHERE id = $1`, [id])).rows[0];
  return r ? toStore(r) : null;
}

export async function loadLineSettings(storeId: number): Promise<LineSettings> {
  const raw = (await pool.query(`SELECT preferences FROM store_settings WHERE store_id = $1`, [storeId])).rows[0]?.preferences;
  let prefs: Record<string, any> = {};
  try { prefs = typeof raw === "string" ? JSON.parse(raw) : (raw ?? {}); } catch { /* defaults */ }
  return lineSettings(prefs);
}

// ── Opening hours ──────────────────────────────────────────────────────────────────────────────────────────────────

export interface LineOpen { open: boolean; reason: string | null; closesAt: string | null; opensAt: string | null }

const minutesOf = (hhmm: string) => { const [h, m] = String(hhmm).split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const clock = (min: number) => { const h = Math.floor(min / 60) % 24, m = min % 60; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };

/** Phone check-in is open from opening time until closesBeforeMin before closing, on a day the shop is open. */
export async function lineOpen(store: LineStore, settings: LineSettings, now = new Date()): Promise<LineOpen> {
  if (["suspended", "canceled", "cancelled", "locked"].includes(store.accountStatus)) return { open: false, reason: "Online check-in isn't available right now.", closesAt: null, opensAt: null };
  if (!settings.enabled) return { open: false, reason: "This shop isn't taking online check-ins.", closesAt: null, opensAt: null };
  if (settings.paused) return { open: false, reason: settings.paused.reason || "Online check-in is paused for now.", closesAt: null, opensAt: null };
  const local = toZonedTime(now, store.timezone);
  const day = local.getDay();
  const nowMin = local.getHours() * 60 + local.getMinutes();
  const rows = (await pool.query(`SELECT day_of_week, open_time, close_time, is_closed FROM business_hours WHERE store_id = $1`, [store.id])).rows;
  if (rows.length === 0) return { open: true, reason: null, closesAt: null, opensAt: null }; // no hours set: always open
  const today = rows.find((r: any) => Number(r.day_of_week) === day);
  if (!today || today.is_closed) return { open: false, reason: "Closed today.", closesAt: null, opensAt: null };
  const openMin = minutesOf(today.open_time);
  let closeMin = minutesOf(today.close_time);
  if (closeMin <= openMin) closeMin += 24 * 60; // open past midnight
  const lastIn = closeMin - settings.closesBeforeMin;
  if (nowMin < openMin) return { open: false, reason: `Online check-in opens at ${clock(openMin)}.`, closesAt: null, opensAt: clock(openMin) };
  if (nowMin >= lastIn) return { open: false, reason: "Online check-in is closed for today.", closesAt: null, opensAt: null };
  return { open: true, reason: null, closesAt: clock(lastIn), opensAt: null };
}

// ── The line as it is now ──────────────────────────────────────────────────────────────────────────────────────────

export interface LineRow {
  id: number; token: string; name: string; phone: string | null; online: boolean; arrivedAt: string | null;
  preferredStaffId: number | null; partyToken: string | null; ticketNumber: number | null; createdAt: string;
  status: string; staffId: number | null; staffName: string | null; assignedAt: string | null; lateStage: number; heldUntil: string | null;
  leaveTextAt: string | null; upTextAt: string | null; waitPromisedMin: number | null;
}
const toRow = (r: any): LineRow => ({
  id: Number(r.id), token: r.token, name: r.client_name ?? "Guest", phone: r.phone ?? null, online: r.source === "online",
  arrivedAt: r.arrived_at ? new Date(r.arrived_at).toISOString() : null,
  preferredStaffId: r.preferred_staff_id != null ? Number(r.preferred_staff_id) : null, partyToken: r.party_token ?? null,
  ticketNumber: r.ticket_number != null ? Number(r.ticket_number) : null, createdAt: new Date(r.created_at).toISOString(),
  status: r.status, staffId: r.staff_id != null ? Number(r.staff_id) : null, staffName: r.assigned_staff_name ?? null,
  assignedAt: r.assigned_at ? new Date(r.assigned_at).toISOString() : null, lateStage: Number(r.late_stage) || 0,
  heldUntil: r.held_until ? new Date(r.held_until).toISOString() : null, leaveTextAt: r.leave_text_at ? new Date(r.leave_text_at).toISOString() : null,
  upTextAt: r.up_text_at ? new Date(r.up_text_at).toISOString() : null, waitPromisedMin: r.wait_promised_min != null ? Number(r.wait_promised_min) : null,
});
const ROW_COLS = `id, token, client_name, phone, source, arrived_at, preferred_staff_id, party_token, ticket_number, created_at, status, staff_id,
  assigned_staff_name, assigned_at, late_stage, held_until, leave_text_at, up_text_at, wait_promised_min`;

/** An online client who isn't here yet and has been skipped (held, or held again after moving back): not served now. */
export const skippedForNow = (r: Pick<LineRow, "online" | "arrivedAt" | "lateStage">) => r.online && !r.arrivedAt && (r.lateStage === 1 || r.lateStage === 3);

const avgCache = new Map<number, { at: number; min: number | null }>();
/** The shop's real cut length: the median take-to-checkout time over 30 days (null until there are enough). */
async function shopCutMinutes(storeId: number): Promise<number | null> {
  const hit = avgCache.get(storeId);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.min;
  const rows = (await pool.query(
    `SELECT actual_minutes FROM appointments WHERE store_id = $1 AND status = 'completed' AND actual_minutes > 0
        AND completed_at > now() - interval '30 days' ORDER BY completed_at DESC LIMIT 500`, [storeId])).rows;
  const min = medianMinutes(rows.map((r: any) => Number(r.actual_minutes)));
  avgCache.set(storeId, { at: Date.now(), min });
  return min;
}

export interface LineState {
  store: LineStore; settings: LineSettings; open: LineOpen; avgMin: number;
  barbers: { id: number; name: string; busySince: number | null }[];
  /** Waiting (no barber yet), in line order. */
  waiting: LineRow[];
  /** Taken by a barber, ticket not made yet. */
  taken: LineRow[];
  estimate: LineEstimate | null;
}

export async function lineState(store: LineStore, deps: LineDeps, now = Date.now()): Promise<LineState> {
  const settings = await loadLineSettings(store.id);
  const [open, cut, working, rows, chairs] = await Promise.all([
    lineOpen(store, settings, new Date(now)),
    shopCutMinutes(store.id),
    deps.workingBarbers(store.id),
    pool.query(`SELECT ${ROW_COLS} FROM kiosk_checkins WHERE store_id = $1 AND appointment_id IS NULL AND status IN ('waiting', 'called')
                  AND created_at > now() - interval '${CHECKIN_MARKER_HOURS} hours' ORDER BY ticket_number NULLS LAST, created_at`, [store.id]),
    // Who is in a chair, and since when: a started ticket (DONE not pressed), or a client taken with no ticket yet.
    pool.query(`SELECT staff_id, MIN(since) AS since FROM (
                  SELECT staff_id, started_at AS since FROM appointments WHERE store_id = $1 AND status = 'started' AND service_done_at IS NULL
                     AND staff_id IS NOT NULL AND started_at > now() - interval '12 hours'
                  UNION ALL
                  SELECT staff_id, COALESCE(assigned_at, created_at) FROM kiosk_checkins WHERE store_id = $1 AND appointment_id IS NULL
                     AND status = 'called' AND staff_id IS NOT NULL AND created_at > now() - interval '${CHECKIN_MARKER_HOURS} hours'
                ) x GROUP BY staff_id`, [store.id]),
  ]);
  const busy = new Map(chairs.rows.map((r: any) => [Number(r.staff_id), new Date(r.since).getTime()]));
  const barbers = working.map((b) => ({ id: b.id, name: b.name, busySince: busy.get(b.id) ?? null }));
  const all = rows.rows.map(toRow);
  const waiting = all.filter((r) => r.status === "waiting");
  const taken = all.filter((r) => r.status === "called");
  const avgMin = cut ?? settings.avgMinutes;
  const ids = new Set(barbers.map((b) => b.id));
  const estimate = estimateLine({
    now, avgMin, barbers,
    line: waiting.filter((r) => !skippedForNow(r)).map((r) => ({
      key: String(r.id), preferredStaffId: settings.barberChoice && r.preferredStaffId != null && ids.has(r.preferredStaffId) ? r.preferredStaffId : null,
    })),
  });
  return { store, settings, open, avgMin, barbers, waiting, taken, estimate };
}

const first = (name: string | null | undefined) => String(name ?? "").trim().split(/\s+/)[0] || "";

/** The shop's line as anyone may see it (the client's phone before joining, the lobby screen). */
export function publicLine(s: LineState) {
  const wait = s.estimate ? s.estimate.next.any : null;
  return {
    store: { name: s.store.name, slug: s.store.slug, phone: s.store.phone, address: [s.store.address, s.store.city, s.store.state].filter(Boolean).join(", ") || null },
    open: s.open.open, closedReason: s.open.reason, acceptingUntil: s.open.closesAt,
    paused: s.settings.paused ? { reason: s.settings.paused.reason || null, until: s.settings.paused.until } : null,
    waitMin: wait, waitText: waitText(wait),
    ahead: s.waiting.length,
    barbersWorking: s.barbers.length,
    barberChoice: s.settings.barberChoice,
    barbers: s.settings.barberChoice ? s.barbers.map((b) => {
      const m = s.estimate?.next.byBarber.get(b.id) ?? null;
      return { id: b.id, name: first(b.name), waitMin: m, waitText: waitText(m) };
    }) : [],
    // The lobby screen: who is next (first name, last initial), and who is on the way.
    line: s.waiting.slice(0, 12).map((r) => ({
      name: publicName(r.name), ticketNumber: r.ticketNumber, here: !r.online || !!r.arrivedAt,
      waitMin: s.estimate?.perClient.get(String(r.id)) ?? null,
    })),
    inChair: s.taken.map((r) => ({ name: publicName(r.name), barber: first(r.staffName) })),
  };
}

// ── Joining ────────────────────────────────────────────────────────────────────────────────────────────────────────

export class LineError extends Error { constructor(message: string, public status = 400) { super(message); } }

export async function joinLine(store: LineStore, deps: LineDeps, input: { names: string[]; phone: string; preferredStaffId?: number | null }): Promise<{ token: string; tokens: string[] }> {
  if (!offersOnlineLine(store.category)) throw new LineError("Online check-in isn't available here.", 404);
  const names = input.names.map((n) => String(n ?? "").replace(/\s+/g, " ").trim().slice(0, 60)).filter(Boolean).slice(0, 4);
  if (names.length === 0) throw new LineError("Please enter your name.");
  const e164 = toE164US(input.phone);
  if (!e164) throw new LineError("Please enter a 10-digit mobile number so we can text you.");
  const state = await lineState(store, deps);
  if (!state.open.open) throw new LineError(state.open.reason ?? "Online check-in is closed.");
  if (!state.estimate) throw new LineError("No barbers are in yet. Please try again shortly.");

  // Already in today's line from this phone: the same spot, not a second one.
  const mine = (await pool.query(`SELECT token FROM kiosk_checkins WHERE store_id = $1 AND source = 'online' AND phone = $2 AND appointment_id IS NULL
      AND status IN ('waiting', 'called') AND created_at > now() - interval '${CHECKIN_MARKER_HOURS} hours' ORDER BY id LIMIT 1`, [store.id, e164])).rows[0];
  if (mine) return { token: mine.token, tokens: [mine.token] };
  if (state.waiting.length + names.length > state.settings.maxLine) throw new LineError("The line is full right now. Please stop by the shop.");

  const preferred = state.settings.barberChoice && input.preferredStaffId != null && state.barbers.some((b) => b.id === input.preferredStaffId)
    ? Number(input.preferredStaffId) : null;
  const promised = preferred != null ? state.estimate.next.byBarber.get(preferred) ?? state.estimate.next.any : state.estimate.next.any;
  // The client already known by this number (their history and points follow the first person in the party).
  const client = (await pool.query(`SELECT c.id FROM client_phones p JOIN clients c ON c.id = p.client_id AND c.archived_at IS NULL
      WHERE p.store_id = $1 AND p.phone_number_e164 = $2 ORDER BY p.is_primary DESC, c.id LIMIT 1`, [store.id, e164])).rows[0];
  const party = names.length > 1 ? crypto.randomBytes(12).toString("hex") : null;
  const tokens: string[] = [];
  for (let i = 0; i < names.length; i++) {
    const token = crypto.randomBytes(24).toString("hex");
    const ticketNumber = await storage.getNextTicketNumber(store.id);
    await pool.query(
      `INSERT INTO kiosk_checkins (store_id, client_id, phone, client_name, token, status, ticket_number, source, preferred_staff_id, party_token, wait_promised_min)
       VALUES ($1, $2, $3, $4, $5, 'waiting', $6, 'online', $7, $8, $9)`,
      [store.id, i === 0 ? client?.id ?? null : null, e164, names[i], token, ticketNumber, preferred, party, promised],
    );
    tokens.push(token);
  }
  deps.notify(store.id);
  const link = spotLink(store, tokens[0]!);
  const who = names.length > 1 ? `${names.length} people are` : "You're";
  void sendLineText(store.id, e164, `${who} on the list at ${store.name}. Wait: ${waitText(promised)}. We'll text you when it's time to head over. Your spot: ${link}`, "line_joined");
  return { token: tokens[0]!, tokens };
}

export const spotLink = (store: Pick<LineStore, "slug">, token: string) =>
  `${(process.env.APP_URL ?? "https://certxa.com").replace(/\/$/, "")}/q/${encodeURIComponent(store.slug)}/s/${token}`;

async function sendLineText(storeId: number, phone: string | null, body: string, kind: string): Promise<boolean> {
  if (!phone) return false;
  try {
    const { sendSms } = await import("../sms");
    // A system text: free to the shop (owner rule — only marketing texts use credits).
    const r = await sendSms(storeId, phone, body, kind, undefined, undefined, { skipCreditDeduction: true, smsSource: "platform" });
    return r.success && !r.skipped;
  } catch (e: any) {
    console.warn("[online-line] text failed:", e?.message);
    return false;
  }
}

// ── The client's own spot ──────────────────────────────────────────────────────────────────────────────────────────

export async function spotByToken(token: string, deps: LineDeps) {
  if (!/^[0-9a-f]{32,64}$/.test(token)) return null;
  const r = (await pool.query(`SELECT ${ROW_COLS}, store_id, appointment_id, removed_reason FROM kiosk_checkins WHERE token = $1`, [token])).rows[0];
  if (!r) return null;
  const store = await lineStoreById(Number(r.store_id));
  if (!store) return null;
  const row = toRow(r);
  const fresh = Date.now() - Date.parse(row.createdAt) < CHECKIN_MARKER_HOURS * 3_600_000;
  let status: "waiting" | "held" | "up" | "served" | "removed" | "expired";
  if (r.appointment_id != null || row.status === "serving" || row.status === "completed") status = "served";
  else if (row.status === "called") status = "up";
  else if (row.status === "removed" || row.status === "cancelled") status = "removed";
  else if (!fresh || row.status !== "waiting") status = "expired";
  else status = skippedForNow(row) ? "held" : "waiting";
  const state = status === "waiting" || status === "held" || status === "up" ? await lineState(store, deps) : null;
  const ahead = state ? state.waiting.findIndex((w) => w.id === row.id) : -1;
  const waitMin = state?.estimate?.perClient.get(String(row.id)) ?? null;
  const party = row.partyToken ? (await pool.query(`SELECT client_name, ticket_number, status, appointment_id FROM kiosk_checkins
      WHERE party_token = $1 AND id <> $2 ORDER BY id`, [row.partyToken, row.id])).rows.map((p: any) => ({ name: first(p.client_name), ticketNumber: p.ticket_number })) : [];
  return {
    store: { name: store.name, slug: store.slug, phone: store.phone, address: [store.address, store.city, store.state].filter(Boolean).join(", ") || null },
    name: first(row.name), ticketNumber: row.ticketNumber, status, removedReason: r.removed_reason ?? null,
    here: !!row.arrivedAt, online: row.online,
    position: ahead >= 0 ? ahead + 1 : null, ahead: ahead >= 0 ? ahead : null,
    waitMin, waitText: status === "waiting" ? waitText(waitMin) : null,
    heldUntil: status === "held" ? row.heldUntil : null,
    barber: status === "up" ? first(row.staffName) : null,
    party,
  };
}

/** "I'm here" from the client's phone, or a check-in at the shop by the same number. */
export async function markHere(token: string, deps: LineDeps): Promise<boolean> {
  const r = (await pool.query(`UPDATE kiosk_checkins SET arrived_at = COALESCE(arrived_at, now())
      WHERE token = $1 AND appointment_id IS NULL AND status IN ('waiting', 'called') RETURNING store_id`, [token])).rows[0];
  if (r) deps.notify(Number(r.store_id));
  return !!r;
}

/** The client leaves the line (their whole party when they joined together). */
export async function leaveLine(token: string, deps: LineDeps): Promise<boolean> {
  const r = (await pool.query(`SELECT store_id, party_token FROM kiosk_checkins WHERE token = $1`, [token])).rows[0];
  if (!r) return false;
  const done = await pool.query(`UPDATE kiosk_checkins SET status = 'removed', removed_reason = 'left', removed_at = now()
      WHERE (token = $1 OR ($2::text IS NOT NULL AND party_token = $2)) AND appointment_id IS NULL AND status IN ('waiting', 'called')`, [token, r.party_token ?? null]);
  if (done.rowCount) deps.notify(Number(r.store_id));
  return !!done.rowCount;
}

/** An in-shop check-in by the phone number an online spot was made with: that client is here. */
export async function arrivedByPhone(storeId: number, phone: string | null | undefined, deps: LineDeps): Promise<{ token: string; ticketNumber: number | null } | null> {
  const e164 = toE164US(phone ?? "");
  if (!e164) return null;
  const rows = (await pool.query(`UPDATE kiosk_checkins SET arrived_at = COALESCE(arrived_at, now())
      WHERE store_id = $1 AND source = 'online' AND phone = $2 AND appointment_id IS NULL AND status IN ('waiting', 'called')
        AND created_at > now() - interval '${CHECKIN_MARKER_HOURS} hours'
      RETURNING token, ticket_number, id`, [storeId, e164])).rows;
  if (!rows.length) return null;
  deps.notify(storeId);
  const firstRow = rows.sort((a: any, b: any) => Number(a.id) - Number(b.id))[0];
  return { token: firstRow.token, ticketNumber: firstRow.ticket_number != null ? Number(firstRow.ticket_number) : null };
}

// ── Every 30 seconds: the texts, and the late rule ─────────────────────────────────────────────────────────────────

const clockIn = (iso: string, tz: string) => formatInTimeZone(new Date(iso), tz, "h:mm a");

/** One shop's online clients: "head over now", "you're up", and a late client held, moved back, or taken off. */
export async function tickLine(store: LineStore, deps: LineDeps): Promise<void> {
  const s = await lineState(store, deps);
  const freeNow = s.barbers.some((b) => b.busySince == null);
  let changed = false;
  for (const r of s.waiting) {
    if (!r.online || r.arrivedAt) continue;
    const wait = s.estimate?.perClient.get(String(r.id));
    // Head over now: once, when the wait is down to the shop's lead time.
    if (wait != null && wait <= s.settings.leadMin && !r.leaveTextAt && r.lateStage % 2 === 0) {
      const claimed = await pool.query(`UPDATE kiosk_checkins SET leave_text_at = now() WHERE id = $1 AND leave_text_at IS NULL AND arrived_at IS NULL`, [r.id]);
      if (claimed.rowCount) void sendLineText(store.id, r.phone, `${first(r.name) || "Hi"}, it's almost your turn at ${store.name} (about ${waitText(wait)}). Please head over now. ${spotLink(store, r.token)}`, "line_leave_now");
    }
    // Their turn, and not here: keep their place for the hold time.
    if ((r.lateStage === 0 || r.lateStage === 2) && wait != null && wait <= 0 && freeNow) {
      const holdMin = s.settings.lateHoldMin;
      const held = (await pool.query(`UPDATE kiosk_checkins SET late_stage = late_stage + 1, held_until = now() + make_interval(mins => $2)
          WHERE id = $1 AND late_stage = $3 AND arrived_at IS NULL AND status = 'waiting' RETURNING held_until`, [r.id, holdMin, r.lateStage])).rows[0];
      if (held) {
        changed = true;
        void sendLineText(store.id, r.phone, `${first(r.name) || "Hi"}, it's your turn at ${store.name}. We'll keep your spot until ${clockIn(held.held_until, store.timezone)}. Tap "I'm here" when you arrive: ${spotLink(store, r.token)}`, "line_your_turn");
      }
    }
    // The hold ran out: back of the line once (a new number, the old one still finds them), then off the line.
    if ((r.lateStage === 1 || r.lateStage === 3) && r.heldUntil && Date.parse(r.heldUntil) <= Date.now()) {
      if (r.lateStage === 1 && s.settings.lateMoveBack) {
        const number = await storage.getNextTicketNumber(store.id);
        const moved = await pool.query(`UPDATE kiosk_checkins SET late_stage = 2, held_until = NULL, leave_text_at = NULL, ticket_number = $2,
            printed_ticket_number = COALESCE(printed_ticket_number, ticket_number)
            WHERE id = $1 AND late_stage = 1 AND arrived_at IS NULL AND status = 'waiting'`, [r.id, number]);
        if (moved.rowCount) {
          changed = true;
          void sendLineText(store.id, r.phone, `We missed you at ${store.name}, so we moved you to the back of the line. Your spot: ${spotLink(store, r.token)}`, "line_moved_back");
        }
      } else {
        const removed = await pool.query(`UPDATE kiosk_checkins SET status = 'removed', removed_reason = 'late', removed_at = now(), held_until = NULL
            WHERE id = $1 AND late_stage = $2 AND arrived_at IS NULL AND status = 'waiting'`, [r.id, r.lateStage]);
        if (removed.rowCount) {
          changed = true;
          void sendLineText(store.id, r.phone, `We missed you at ${store.name}, so you've been taken off today's line. You're welcome to check in again: ${spotLink(store, r.token).replace(/\/s\/[0-9a-f]+$/, "")}`, "line_removed");
        }
      }
    }
  }
  // You're up: a barber took them.
  for (const r of s.taken) {
    if (!r.online || r.upTextAt) continue;
    const claimed = await pool.query(`UPDATE kiosk_checkins SET up_text_at = now() WHERE id = $1 AND up_text_at IS NULL`, [r.id]);
    if (claimed.rowCount && !r.arrivedAt) void sendLineText(store.id, r.phone, `${first(r.name) || "Hi"}, you're up at ${store.name}${r.staffName ? ` with ${first(r.staffName)}` : ""}. Please come in now.`, "line_up");
  }
  if (changed) deps.notify(store.id);
}

let lineJobStarted = false;
export function startOnlineLineJob(deps: LineDeps): void {
  if (lineJobStarted) return;
  lineJobStarted = true;
  const run = async () => {
    const client = await pool.connect().catch(() => null);
    if (!client) return;
    try {
      const lock = await client.query(`SELECT pg_try_advisory_lock(hashtext('online_line_job')) AS ok`);
      if (!lock.rows[0]?.ok) return;
      try {
        const stores = await client.query(`SELECT DISTINCT store_id FROM kiosk_checkins WHERE source = 'online' AND appointment_id IS NULL
            AND status IN ('waiting', 'called') AND created_at > now() - interval '${CHECKIN_MARKER_HOURS} hours'`);
        for (const row of stores.rows) {
          const store = await lineStoreById(Number(row.store_id));
          if (store) await tickLine(store, deps).catch((e) => console.warn("[online-line] store", row.store_id, e?.message));
        }
      } finally {
        await client.query(`SELECT pg_advisory_unlock(hashtext('online_line_job'))`).catch(() => {});
      }
    } catch (e: any) {
      console.warn("[online-line] job:", e?.message);
    } finally {
      client.release();
    }
  };
  setInterval(() => void run(), 30_000);
}
