/**
 * The /manage assistant (owner, 2026-11-01): a chat the salon owner can trust with their account.
 *
 * It LOOKS THINGS UP with tools (reports, clients, the schedule, team, account, front desk settings) and it can
 * CHANGE account and front desk settings (sales tax, CARD button, cash price, tips, turn rotation, Tech ID lock,
 * cash drawers, opening hours) — but never bookings, payments or refunds.
 *
 * Trust rules built in:
 *   - Owner's own login only.
 *   - Every number comes from a tool call; the model is told never to guess.
 *   - Tools call the same endpoints the app's own pages use (loopback, as the owner), so the numbers are the
 *     Reports' numbers and every change goes through the same checks as the Settings pages.
 *   - A change is only PROPOSED by the model (assistant_actions, status pending). It runs when the owner taps
 *     Confirm — POST /api/assistant/actions/:id/confirm. Cancel discards it.
 *
 *   POST /api/assistant/chat           { message }  → { reply, actions: [pending changes] }
 *   GET  /api/assistant/history        the kept conversation (last 40 messages)
 *   POST /api/assistant/actions/:id/confirm | /cancel
 */
import { Router, type Request, type Response } from "express";
import { formatInTimeZone } from "date-fns-tz";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { TURN_MODES, TURN_PRESETS, isDollarMode, type TurnMode } from "@shared/turnRules";

const router = Router();
const LOG = "[assistant]";
const MODEL = () => process.env.OWNER_ASSISTANT_MODEL || process.env.MEMBERS_ASSISTANT_MODEL || "gpt-5.6-luna";
const MAX_TOOL_ROUNDS = 8;

const REPORTS: Record<string, string> = {
  sales: "money/sales", payments: "money/payments", "sales-tax": "money/tax", tips: "money/tips", "gift-cards": "money/gift-cards",
  staff: "team/staff", "hours-worked": "team/hours", turns: "team/turns",
  "client-retention": "clients/retention", "clients-not-back": "clients/lapsed", "top-clients": "clients/top", "no-shows": "clients/no-shows", loyalty: "clients/loyalty",
  appointments: "operations/appointments", "wait-times": "operations/wait-times", "service-times": "operations/service-times",
  "busy-times": "operations/busy-times", services: "operations/services", "cancelled-after-service": "operations/cancelled-after-service",
  reviews: "marketing/reviews", texts: "marketing/texts", autumn: "marketing/autumn",
};

// ─── Who may use it ────────────────────────────────────────────────────────────

async function ownerContext(req: Request, res: Response): Promise<{ storeId: number; userId: string } | null> {
  const userId = (req.session as any)?.userId as string | undefined;
  if (!userId || (req.session as any)?.staffId) { res.status(403).json({ message: "The assistant is for the salon owner's login." }); return null; }
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(403).json({ message: "No store context" }); return null; }
  const own = await pool.query(`SELECT 1 FROM locations WHERE id = $1 AND user_id = $2`, [storeId, userId]);
  if (!own.rows[0]) { res.status(403).json({ message: "The assistant is for the salon owner's login." }); return null; }
  return { storeId, userId };
}

// ─── Calling the app's own endpoints as the owner ──────────────────────────────

async function asOwner(req: Request, method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const port = process.env.PORT || "9200";
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      cookie: String(req.headers.cookie ?? ""),
      "Content-Type": "application/json",
      "X-Forwarded-Proto": "https",
      "X-Forwarded-For": String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? ""),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let data: any = text;
  try { data = JSON.parse(text); } catch { /* keep text */ }
  return { ok: res.ok, status: res.status, data };
}

const clip = (v: unknown, max = 9000) => { const s = JSON.stringify(v); return s.length > max ? s.slice(0, max) + "…(cut)" : s; };
const money = (n: unknown) => `$${Number(n ?? 0).toFixed(2)}`;

// ─── Tools the model can use ───────────────────────────────────────────────────

const READ_TOOLS = [
  { name: "get_report", description: "Any of the salon's reports for a date range — the same numbers as the Reports pages. Use for revenue, sales, payments, sales tax collected, tips, gift cards, staff performance, hours worked, turns, client retention, clients who haven't been back, top clients, no-shows, loyalty, appointments, wait times, service times, busy times, services, cancellations after service, reviews, texts and Autumn's calls.",
    parameters: { type: "object", properties: {
      report: { type: "string", enum: Object.keys(REPORTS) },
      from: { type: "string", description: "First day, YYYY-MM-DD (salon's local date)." },
      to: { type: "string", description: "Last day, YYYY-MM-DD." },
    }, required: ["report", "from", "to"] } },
  { name: "find_clients", description: "Find clients by name or phone. Returns each client's id, name, phone, visits, total spent, last visit, next appointment and loyalty points (worked out from their appointments).",
    parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "client_history", description: "One client's appointments (most recent 15), with service, technician, status and amount paid, plus their notes.",
    parameters: { type: "object", properties: { clientId: { type: "number" } }, required: ["clientId"] } },
  { name: "list_appointments", description: "The schedule (read only) for a date range, optionally for one team member: time, client, service, technician, status.",
    parameters: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, staffName: { type: "string" } }, required: ["from", "to"] } },
  { name: "team_overview", description: "The team: names, roles, Tech IDs, who takes walk-in turns, front desk staff.",
    parameters: { type: "object", properties: {}, required: [] } },
  { name: "account_overview", description: "The salon's Certxa account: plan and price, trial or subscription status, account status.",
    parameters: { type: "object", properties: {}, required: [] } },
  { name: "front_desk_settings", description: "Current front desk (POS) and account settings: sales tax rate and what is taxed, what the CARD button does, cash price, tip choices, turn rotation method, Tech ID lock screen, whether the manager PIN is still the default, cash drawers and their starting cash, opening hours.",
    parameters: { type: "object", properties: {}, required: [] } },
];

const CHANGE_TOOLS = [
  { name: "change_sales_tax", description: "Propose changing the sales tax rate and what it applies to.",
    parameters: { type: "object", properties: {
      ratePercent: { type: "number", description: "0 to 25, e.g. 8.7" },
      services: { type: "boolean" }, addons: { type: "boolean" }, products: { type: "boolean" }, giftCards: { type: "boolean" },
    }, required: ["ratePercent", "services", "addons", "products", "giftCards"] } },
  { name: "change_card_button", description: "Propose what the CARD button does: 'stripe' = the Certxa card reader (Stripe), 'own' = the salon's own card machine (CARD only records the payment).",
    parameters: { type: "object", properties: { provider: { type: "string", enum: ["stripe", "own"] } }, required: ["provider"] } },
  { name: "change_cash_price", description: "Propose the percent off for paying cash (0 to 10; 0 turns it off).",
    parameters: { type: "object", properties: { percent: { type: "number" } }, required: ["percent"] } },
  { name: "change_tip_choices", description: "Propose the tip percentages clients can tap at checkout (1 to 6 choices, each 1–100).",
    parameters: { type: "object", properties: { percents: { type: "array", items: { type: "number" } } }, required: ["percents"] } },
  { name: "change_turn_rotation", description: `Propose the walk-in turn method. Modes: ${TURN_MODES.map((m) => `${m} = ${TURN_PRESETS[m].label}`).join("; ")}. dollarsPerTurn is needed for dollar-based modes; smallerTicketEarns (0.25/0.5/0.75) only for 'dollar'.`,
    parameters: { type: "object", properties: {
      mode: { type: "string", enum: [...TURN_MODES] }, dollarsPerTurn: { type: "number" }, smallerTicketEarns: { type: "number" },
    }, required: ["mode"] } },
  { name: "change_tech_id_lock", description: "Propose turning the Tech ID lock screen on or off (on = staff sign in with their Tech ID to use the front desk).",
    parameters: { type: "object", properties: { on: { type: "boolean" } }, required: ["on"] } },
  { name: "add_cash_drawer", description: "Propose adding a cash drawer (or cash box) with its starting cash. mainStation=true puts it on the main front desk.",
    parameters: { type: "object", properties: { name: { type: "string" }, startingCash: { type: "number" }, mainStation: { type: "boolean" } }, required: ["name", "startingCash"] } },
  { name: "edit_cash_drawer", description: "Propose renaming a cash drawer or changing its starting cash. Get the drawer id from front_desk_settings first.",
    parameters: { type: "object", properties: { drawerId: { type: "number" }, name: { type: "string" }, startingCash: { type: "number" } }, required: ["drawerId"] } },
  { name: "change_opening_hours", description: "Propose new opening hours for one or more days. day: 0=Sunday … 6=Saturday. Times HH:MM 24-hour. closed=true for a day off. Days not listed stay the same.",
    parameters: { type: "object", properties: { days: { type: "array", items: { type: "object", properties: {
      day: { type: "number" }, open: { type: "string" }, close: { type: "string" }, closed: { type: "boolean" },
    }, required: ["day"] } } }, required: ["days"] } },
];

// Responses API tool format (the thinking model only takes tools there, not in chat completions).
const ALL_TOOLS = [...READ_TOOLS, ...CHANGE_TOOLS].map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters }));
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

async function runReadTool(req: Request, storeId: number, name: string, a: any): Promise<unknown> {
  const tz = (await pool.query(`SELECT timezone FROM locations WHERE id = $1`, [storeId])).rows[0]?.timezone || "UTC";
  if (name === "get_report") {
    const path = REPORTS[String(a.report)];
    if (!path) return { error: "Unknown report" };
    const r = await asOwner(req, "GET", `/api/reports/${path}?from=${encodeURIComponent(a.from)}&to=${encodeURIComponent(a.to)}`);
    return r.ok ? { report: a.report, from: a.from, to: a.to, data: r.data, page: "/reports" } : { error: r.data?.message ?? "Could not load the report" };
  }
  if (name === "find_clients") {
    const q = String(a.query ?? "").trim();
    if (!q) return { error: "Say a name or phone number." };
    const digits = q.replace(/\D/g, "");
    const { rows } = await pool.query(
      `SELECT c.id, COALESCE(NULLIF(c.full_name, ''), TRIM(CONCAT_WS(' ', c.first_name, c.last_name))) AS name, c.loyalty_points,
              (SELECT p.display_phone FROM client_phones p WHERE p.client_id = c.id ORDER BY p.is_primary DESC NULLS LAST LIMIT 1) AS phone,
              (SELECT COUNT(*) FROM appointments a WHERE a.customer_id = c.id AND a.status = 'completed')::int AS visits,
              (SELECT COALESCE(SUM(a.total_paid), 0) FROM appointments a WHERE a.customer_id = c.id AND a.status = 'completed')::float AS spent,
              (SELECT MAX(a.date) FROM appointments a WHERE a.customer_id = c.id AND a.status = 'completed') AS last_visit,
              (SELECT MIN(a.date) FROM appointments a WHERE a.customer_id = c.id AND a.date > now() AND COALESCE(a.status, '') NOT IN ('cancelled', 'canceled', 'no_show', 'no-show', 'completed')) AS next_appointment
         FROM clients c
        WHERE c.store_id = $1 AND c.archived_at IS NULL
          AND (COALESCE(c.full_name, '') ILIKE $2 OR TRIM(CONCAT_WS(' ', c.first_name, c.last_name)) ILIKE $2
               OR ($3 <> '' AND EXISTS (SELECT 1 FROM client_phones p WHERE p.client_id = c.id AND p.phone_number_e164 LIKE '%' || $3 || '%')))
        ORDER BY visits DESC LIMIT 8`,
      [storeId, `%${q}%`, digits.length >= 4 ? digits : ""],
    );
    return rows.map((c) => ({
      id: c.id, name: c.name, phone: c.phone, visits: c.visits, totalSpent: money(c.spent), loyaltyPoints: c.loyalty_points ?? 0,
      lastVisit: c.last_visit ? formatInTimeZone(c.last_visit, tz, "MMM d, yyyy") : null,
      nextAppointment: c.next_appointment ? formatInTimeZone(c.next_appointment, tz, "EEE MMM d, h:mm a") : null,
    }));
  }
  if (name === "client_history") {
    const id = Number(a.clientId);
    const c = await pool.query(`SELECT id, COALESCE(NULLIF(full_name, ''), TRIM(CONCAT_WS(' ', first_name, last_name))) AS name, notes FROM clients WHERE id = $1 AND store_id = $2`, [id, storeId]);
    if (!c.rows[0]) return { error: "No such client in this salon." };
    const { rows } = await pool.query(
      `SELECT a.date, a.status, a.total_paid, sv.name AS service, st.name AS staff
         FROM appointments a LEFT JOIN services sv ON sv.id = a.service_id LEFT JOIN staff st ON st.id = a.staff_id
        WHERE a.customer_id = $1 AND a.store_id = $2 ORDER BY a.date DESC LIMIT 15`, [id, storeId]);
    return { client: c.rows[0].name, notes: c.rows[0].notes, appointments: rows.map((x) => ({
      when: formatInTimeZone(x.date, tz, "EEE MMM d, yyyy h:mm a"), service: x.service, technician: x.staff, status: x.status, paid: x.total_paid != null ? money(x.total_paid) : null,
    })) };
  }
  if (name === "list_appointments") {
    const params: unknown[] = [storeId, a.from, a.to, tz];
    let staffClause = "";
    if (a.staffName) { params.push(`%${String(a.staffName).trim()}%`); staffClause = `AND st.name ILIKE $5`; }
    const { rows } = await pool.query(
      `SELECT a.date, a.status, sv.name AS service, st.name AS staff,
              COALESCE(NULLIF(c.full_name, ''), TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), a.customer_name) AS client
         FROM appointments a LEFT JOIN services sv ON sv.id = a.service_id LEFT JOIN staff st ON st.id = a.staff_id
         LEFT JOIN clients c ON c.id = a.customer_id
        WHERE a.store_id = $1 AND (a.date AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date ${staffClause}
        ORDER BY a.date LIMIT 80`, params).catch(async () =>
          pool.query(`SELECT a.date, a.status, sv.name AS service, st.name AS staff, NULL AS client
             FROM appointments a LEFT JOIN services sv ON sv.id = a.service_id LEFT JOIN staff st ON st.id = a.staff_id
            WHERE a.store_id = $1 AND (a.date AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date ${staffClause} ORDER BY a.date LIMIT 80`, params));
    return { from: a.from, to: a.to, count: rows.length, appointments: rows.map((x) => ({
      when: formatInTimeZone(x.date, tz, "EEE MMM d h:mm a"), client: x.client, service: x.service, technician: x.staff, status: x.status,
    })), page: "/calendar" };
  }
  if (name === "team_overview") {
    const { rows } = await pool.query(
      `SELECT name, role, barber_number AS tech_id, takes_turns, front_desk, employment_type, COALESCE(status, 'active') AS status
         FROM staff WHERE store_id = $1 AND COALESCE(status, 'active') NOT IN ('removed', 'deactivated') ORDER BY barber_number NULLS LAST, name`, [storeId]);
    return rows.map((s) => ({ name: s.name, role: s.employment_type === "owner" ? "Owner" : s.role, techId: s.tech_id, takesWalkInTurns: s.takes_turns !== false, frontDesk: !!s.front_desk }));
  }
  if (name === "account_overview") {
    const [profile, status] = await Promise.all([asOwner(req, "GET", `/api/billing/profile/${storeId}`), asOwner(req, "GET", "/api/billing/account-status")]);
    return { profile: profile.ok ? profile.data : null, status: status.ok ? status.data : null, page: "/billing" };
  }
  if (name === "front_desk_settings") {
    const [pos, card, tips, turns, screen, setup, drawers, hours, cash] = await Promise.all([
      asOwner(req, "GET", `/api/pos-settings/${storeId}`), asOwner(req, "GET", "/api/card-provider"), asOwner(req, "GET", "/api/tip-presets"),
      asOwner(req, "GET", `/api/turn/settings?storeId=${storeId}`), asOwner(req, "GET", "/api/nail/screen-settings"), asOwner(req, "GET", "/api/nail/pos-setup"),
      asOwner(req, "GET", "/api/cash-drawers"), asOwner(req, "GET", "/api/business-hours"),
      pool.query(`SELECT cash_discount_percent FROM locations WHERE id = $1`, [storeId]),
    ]);
    const t = turns.data ?? {};
    return {
      salesTax: pos.ok ? { ratePercent: Number(pos.data.salesTaxRate ?? 0) * 100, services: pos.data.taxServicesTaxable, addons: pos.data.taxAddonsTaxable, products: pos.data.taxProductsTaxable, giftCards: pos.data.taxGiftCardsTaxable } : null,
      cardButton: card.ok ? (card.data?.provider === "own" ? "the salon's own card machine" : "the Certxa card reader (Stripe)") : null,
      cashPricePercentOff: Number(cash.rows[0]?.cash_discount_percent ?? 0),
      tipChoices: tips.ok ? (tips.data?.presets ?? tips.data) : null,
      turnRotation: turns.ok ? { mode: t.turnMode, label: TURN_PRESETS[t.turnMode as TurnMode]?.label, dollarsPerTurn: t.turnValueThreshold, smallerTicketEarns: t.partialTurnValue } : null,
      techIdLockScreen: screen.ok ? !!screen.data?.lockScreen : null,
      managerPinIsStillTheDefault: setup.ok ? !!setup.data?.managerPinIsDefault : null,
      cashDrawers: drawers.ok && Array.isArray(drawers.data) ? drawers.data.map((d: any) => ({ id: d.id, name: d.name, startingCash: money(d.targetFloat ?? d.target_float), mainFrontDesk: !!(d.mainStation ?? d.main_station), active: d.isActive ?? d.is_active ?? true })) : null,
      openingHours: hours.ok && Array.isArray(hours.data) ? hours.data.sort((x: any, y: any) => x.dayOfWeek - y.dayOfWeek).map((h: any) => ({ day: h.dayOfWeek, dayName: DAY_NAMES[h.dayOfWeek], open: h.openTime, close: h.closeTime, closed: h.isClosed })) : null,
      settingsPages: { tax: "/pos-settings", cashDrawers: "/settings", hours: "/settings" },
    };
  }
  return { error: `Unknown tool ${name}` };
}

/** Checks a proposed change and writes it down as pending, with a plain summary. Nothing is changed here. */
async function proposeChange(req: Request, ctx: { storeId: number; userId: string }, name: string, a: any): Promise<{ actionId?: number; summary?: string; error?: string }> {
  let summary = "";
  let payload: Record<string, unknown> = {};
  const pct = (n: number) => `${Number(n.toFixed(3))}%`;
  switch (name) {
    case "change_sales_tax": {
      const rate = Number(a.ratePercent);
      if (!Number.isFinite(rate) || rate < 0 || rate > 25) return { error: "The sales tax rate must be from 0% to 25%." };
      const on = (["services", "addons", "products", "giftCards"] as const).filter((k) => a[k] === true);
      const label: Record<string, string> = { services: "services", addons: "add-ons", products: "retail products", giftCards: "gift cards" };
      payload = { rate, services: !!a.services, addons: !!a.addons, products: !!a.products, giftCards: !!a.giftCards };
      summary = `Set sales tax to ${pct(rate)}, charged on ${on.length ? on.map((k) => label[k]).join(", ") : "nothing"}.`;
      break;
    }
    case "change_card_button":
      if (!["stripe", "own"].includes(a.provider)) return { error: "Choose 'stripe' or 'own'." };
      payload = { provider: a.provider };
      summary = a.provider === "own" ? "Make the CARD button record payments taken on your own card machine (Certxa charges nothing on them)." : "Make the CARD button charge cards on the Certxa card reader (Stripe).";
      break;
    case "change_cash_price": {
      const p = Number(a.percent);
      if (!Number.isFinite(p) || p < 0 || p > 10) return { error: "The cash price must be from 0% to 10% off." };
      payload = { percent: p };
      summary = p === 0 ? "Turn off the cash price." : `Give clients who pay cash ${pct(p)} off.`;
      break;
    }
    case "change_tip_choices": {
      const list = Array.isArray(a.percents) ? a.percents.map(Number) : [];
      if (!list.length || list.length > 6 || list.some((n: number) => !Number.isInteger(n) || n < 1 || n > 100)) return { error: "Give 1 to 6 whole tip percentages from 1 to 100." };
      payload = { presets: list };
      summary = `Set the tip choices at checkout to ${list.map((n: number) => `${n}%`).join(", ")}.`;
      break;
    }
    case "change_turn_rotation": {
      const mode = String(a.mode) as TurnMode;
      if (!TURN_MODES.includes(mode)) return { error: "Unknown turn method." };
      const dollars = Number(a.dollarsPerTurn);
      if (isDollarMode(mode) && !(dollars >= 1 && dollars <= 1000)) return { error: `${TURN_PRESETS[mode].label} needs the dollars for one turn (1 to 1000). Ask the owner.` };
      const partial = a.smallerTicketEarns == null ? undefined : Number(a.smallerTicketEarns);
      if (partial !== undefined && ![0.25, 0.5, 0.75].includes(partial)) return { error: "A smaller ticket earns 1/4, 1/2 or 3/4 of a turn." };
      payload = { turnMode: mode, ...(isDollarMode(mode) ? { turnValueThreshold: dollars } : {}), ...(mode === "dollar" && partial !== undefined ? { partialTurnValue: partial } : {}) };
      summary = `Switch walk-in turns to ${TURN_PRESETS[mode].label}${isDollarMode(mode) ? `, $${dollars} for one turn` : ""}${mode === "dollar" && partial !== undefined ? `, a smaller ticket earning ${partial} of a turn` : ""}.`;
      break;
    }
    case "change_tech_id_lock":
      payload = { lockScreen: !!a.on };
      summary = a.on ? "Turn on the Tech ID lock screen: staff sign in with their Tech ID to use the front desk." : "Turn off the Tech ID lock screen: anyone can use the front desk without signing in.";
      break;
    case "add_cash_drawer": {
      const nm = String(a.name ?? "").trim().slice(0, 40);
      const cash = Number(a.startingCash);
      if (!nm) return { error: "The drawer needs a name." };
      if (!Number.isFinite(cash) || cash < 0 || cash > 10000) return { error: "Starting cash must be from $0 to $10,000." };
      payload = { name: nm, targetFloat: cash.toFixed(2), mainStation: !!a.mainStation, registerIds: [] };
      summary = `Add a cash drawer "${nm}" that starts each day with ${money(cash)}${a.mainStation ? ", used by the main front desk" : ""}.`;
      break;
    }
    case "edit_cash_drawer": {
      const id = Number(a.drawerId);
      const d = await pool.query(`SELECT name, target_float FROM cash_drawers WHERE id = $1 AND store_id = $2`, [id, ctx.storeId]);
      if (!d.rows[0]) return { error: "No such cash drawer in this salon — look it up with front_desk_settings." };
      const patch: Record<string, unknown> = {};
      const parts: string[] = [];
      if (a.name != null) { const nm = String(a.name).trim().slice(0, 40); if (!nm) return { error: "The name can't be empty." }; patch.name = nm; parts.push(`rename it "${nm}"`); }
      if (a.startingCash != null) { const cash = Number(a.startingCash); if (!Number.isFinite(cash) || cash < 0 || cash > 10000) return { error: "Starting cash must be from $0 to $10,000." }; patch.targetFloat = cash.toFixed(2); parts.push(`start each day with ${money(cash)}`); }
      if (!parts.length) return { error: "Nothing to change." };
      payload = { drawerId: id, patch };
      summary = `Cash drawer "${d.rows[0].name}": ${parts.join(" and ")}.`;
      break;
    }
    case "change_opening_hours": {
      const days = Array.isArray(a.days) ? a.days : [];
      if (!days.length) return { error: "Which days?" };
      const cur = await asOwner(req, "GET", "/api/business-hours");
      const existing: any[] = cur.ok && Array.isArray(cur.data) ? cur.data : [];
      const byDay = new Map<number, { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }>();
      for (let d = 0; d < 7; d++) {
        const e = existing.find((x) => x.dayOfWeek === d);
        byDay.set(d, { dayOfWeek: d, openTime: e?.openTime ?? "09:00", closeTime: e?.closeTime ?? "17:00", isClosed: e ? !!e.isClosed : true });
      }
      const lines: string[] = [];
      for (const d of days) {
        const day = Number(d.day);
        if (!Number.isInteger(day) || day < 0 || day > 6) return { error: "day must be 0 (Sunday) to 6 (Saturday)." };
        const row = byDay.get(day)!;
        if (d.closed === true) { row.isClosed = true; lines.push(`${DAY_NAMES[day]}: closed`); continue; }
        const open = String(d.open ?? row.openTime), close = String(d.close ?? row.closeTime);
        if (!/^\d{2}:\d{2}$/.test(open) || !/^\d{2}:\d{2}$/.test(close)) return { error: "Times must be HH:MM (24-hour)." };
        if (close <= open) return { error: `${DAY_NAMES[day]}: closing time must be after opening time.` };
        Object.assign(row, { openTime: open, closeTime: close, isClosed: false });
        const fmt = (t: string) => { const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
        lines.push(`${DAY_NAMES[day]}: ${fmt(open)} to ${fmt(close)}`);
      }
      payload = { hours: [...byDay.values()] };
      summary = `Change opening hours — ${lines.join("; ")}.`;
      break;
    }
    default:
      return { error: `Unknown change ${name}` };
  }
  const r = await pool.query(
    `INSERT INTO assistant_actions (store_id, user_id, kind, payload, summary) VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING id`,
    [ctx.storeId, ctx.userId, name, JSON.stringify(payload), summary],
  );
  return { actionId: r.rows[0].id, summary };
}

/** Carries out a confirmed change through the same endpoint the Settings page uses. */
async function executeChange(req: Request, storeId: number, kind: string, p: any): Promise<{ ok: boolean; message: string }> {
  const call = async (method: string, path: string, body?: unknown) => {
    const r = await asOwner(req, method, path, body);
    if (!r.ok) throw new Error(r.data?.message || r.data?.error || `The change was refused (${r.status}).`);
    return r.data;
  };
  try {
    switch (kind) {
      case "change_sales_tax":
        await call("PATCH", `/api/pos-settings/${storeId}`, { salesTaxRate: (Number(p.rate) / 100).toFixed(4), taxServicesTaxable: p.services, taxAddonsTaxable: p.addons, taxProductsTaxable: p.products, taxGiftCardsTaxable: p.giftCards });
        break;
      case "change_card_button": await call("PUT", "/api/card-provider", { provider: p.provider }); break;
      case "change_cash_price": await call("PUT", `/api/pos-settings/${storeId}/cash-discount`, { percent: p.percent }); break;
      case "change_tip_choices": await call("PUT", "/api/tip-presets", { presets: p.presets }); break;
      case "change_turn_rotation": await call("PUT", `/api/turn/settings?storeId=${storeId}`, p); break;
      case "change_tech_id_lock": await call("PUT", "/api/nail/screen-settings", { lockScreen: p.lockScreen }); break;
      case "add_cash_drawer": await call("POST", "/api/cash-drawers", p); break;
      case "edit_cash_drawer": await call("PUT", `/api/cash-drawers/${p.drawerId}`, p.patch); break;
      case "change_opening_hours": await call("PUT", "/api/business-hours", { storeId, hours: p.hours }); break;
      default: return { ok: false, message: "Unknown change." };
    }
    return { ok: true, message: "Done." };
  } catch (err: any) {
    return { ok: false, message: err?.message ?? "The change could not be made." };
  }
}

// ─── The conversation ──────────────────────────────────────────────────────────

function systemPrompt(o: { salon: string; ownerName: string | null; firstName: string | null; today: string; weekday: string; partOfDay: string }): string {
  return `You are the Certxa assistant for ${o.salon}, talking with the owner${o.ownerName ? `, ${o.ownerName}` : ""}. Today is ${o.weekday}, ${o.today} (${o.partOfDay}) at the salon.

WHO YOU ARE: a warm, polite, genuinely helpful business partner who knows this salon's numbers and Certxa's settings. Plain words, short answers, no jargon, no emojis. Use ${o.firstName ?? "the owner"}'s first name now and then, not every message.

TRUST — THE MOST IMPORTANT RULES:
- Every number, name, date or setting you state must come from a tool result in this conversation. Never guess, estimate or invent. If you didn't look it up, look it up; if no tool has it, say plainly that you can't see that.
- Say where a number came from in a few words ("from your Sales report for October").
- Don't use words like utilization, churn, at-risk, leakage. Dates in words ("October 31"), money like $1,234.
- Team members are other people, even one who shares the owner's first name${o.ownerName ? ` (you are talking to ${o.ownerName})` : ""}.

WHAT YOU CAN DO:
- Look things up: any report for any dates (get_report), clients (find_clients, client_history), the schedule (list_appointments, read only), the team, the account and plan, and all front desk settings.
- Change account and front desk settings: sales tax, the CARD button, cash price, tip choices, turn rotation, the Tech ID lock screen, cash drawers and their starting cash, opening hours. You only PROPOSE a change with a change_ tool; it shows the owner a Confirm button and happens only when they tap it. Before proposing, check the current setting with front_desk_settings, and ask for anything you need instead of guessing (for example the exact tax rate). After proposing, tell them in one sentence what will change and to tap Confirm.
- Guide setup: walk the owner through setting up the front desk one step at a time (sales tax, card payments, cash price, cash drawer, tips, turns, Tech IDs).

WHAT YOU NEVER DO: create, move, cancel or change client bookings or appointments; take payments, refunds, or change prices of services; change the manager PIN, staff, or anything not listed above. If asked, say kindly that you can't do that here and where in Certxa they can do it (the calendar for bookings, Settings for the rest).

Certxa runs client outreach automatically (rebooking reminders, win-back texts, follow-ups after cancellations and no-shows, Autumn answering the phone); never tell the owner to do that work themselves.`;
}

router.post("/api/assistant/chat", isAuthenticated, async (req: Request, res: Response) => {
  const ctx = await ownerContext(req, res); if (!ctx) return;
  const message = String(req.body?.message ?? "").trim().slice(0, 2000);
  if (!message) return res.status(400).json({ message: "Type a question." });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(503).json({ message: "The assistant is unavailable right now." });
  try {
    const info = (await pool.query(
      `SELECT l.name, l.timezone, u.first_name, u.last_name FROM locations l JOIN users u ON u.id = $2 WHERE l.id = $1`, [ctx.storeId, ctx.userId])).rows[0] ?? {};
    const tz = info.timezone || "UTC";
    const hour = Number(formatInTimeZone(new Date(), tz, "H"));
    const firstName = String(info.first_name ?? "").trim().split(/\s+/)[0] || null;
    const system = systemPrompt({
      salon: info.name ?? "the salon", firstName,
      ownerName: [info.first_name, info.last_name].map((x: unknown) => String(x ?? "").trim()).filter(Boolean).join(" ") || null,
      today: formatInTimeZone(new Date(), tz, "MMMM d, yyyy (yyyy-MM-dd)"), weekday: formatInTimeZone(new Date(), tz, "EEEE"),
      partOfDay: hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening",
    });
    const past = (await pool.query(
      `SELECT role, content FROM assistant_messages WHERE user_id = $1 AND store_id = $2 ORDER BY id DESC LIMIT 12`, [ctx.userId, ctx.storeId])).rows.reverse();
    await pool.query(`INSERT INTO assistant_messages (store_id, user_id, role, content) VALUES ($1, $2, 'user', $3)`, [ctx.storeId, ctx.userId, message]);

    const input: any[] = [...past.map((m) => ({ role: m.role, content: m.content })), { role: "user", content: message }];
    const proposed: { id: number; summary: string }[] = [];
    let reply = "";
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const model = MODEL();
      const thinking = /^(gpt-5|o\d)/.test(model);
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, instructions: system, input, tools: ALL_TOOLS, tool_choice: "auto",
          ...(thinking ? { reasoning: { effort: "low" } } : { temperature: 0.3 }), max_output_tokens: 6000 }),
        signal: AbortSignal.timeout(90_000),
      });
      const data: any = await r.json();
      if (data.error) throw new Error(data.error.message);
      const output: any[] = Array.isArray(data.output) ? data.output : [];
      input.push(...output);
      const calls = output.filter((o) => o.type === "function_call");
      if (!calls.length) {
        reply = output.filter((o) => o.type === "message").flatMap((o) => (o.content ?? []).filter((c: any) => c.type === "output_text").map((c: any) => c.text)).join("\n").trim();
        break;
      }
      for (const call of calls) {
        let args: any = {};
        try { args = JSON.parse(call.arguments || "{}"); } catch { /* empty */ }
        let out: unknown;
        try {
          if (CHANGE_TOOLS.some((t) => t.name === call.name)) {
            const p = await proposeChange(req, ctx, call.name, args);
            if (p.actionId) { proposed.push({ id: p.actionId, summary: p.summary! }); out = { proposed: true, waitingForOwnerToConfirm: true, summary: p.summary }; }
            else out = { error: p.error };
          } else {
            out = await runReadTool(req, ctx.storeId, call.name, args);
          }
        } catch (e: any) {
          out = { error: e?.message ?? "That lookup failed." };
        }
        console.log(`${LOG} store ${ctx.storeId} tool ${call.name}`);
        input.push({ type: "function_call_output", call_id: call.call_id, output: clip(out) });
      }
    }
    if (!reply) reply = proposed.length ? "Here's the change — tap Confirm to make it." : "Sorry, I couldn't finish that. Could you ask it another way?";
    await pool.query(`INSERT INTO assistant_messages (store_id, user_id, role, content, action_ids) VALUES ($1, $2, 'assistant', $3, $4::jsonb)`,
      [ctx.storeId, ctx.userId, reply, JSON.stringify(proposed.map((p) => p.id))]);
    return res.json({ reply, actions: proposed.map((p) => ({ id: p.id, summary: p.summary, status: "pending" })) });
  } catch (err: any) {
    console.error(`${LOG} chat failed:`, err?.message);
    return res.status(500).json({ message: "The assistant is unavailable right now. Please try again shortly." });
  }
});

router.get("/api/assistant/history", isAuthenticated, async (req: Request, res: Response) => {
  const ctx = await ownerContext(req, res); if (!ctx) return;
  const msgs = (await pool.query(
    `SELECT id, role, content, action_ids, created_at FROM assistant_messages WHERE user_id = $1 AND store_id = $2 ORDER BY id DESC LIMIT 40`,
    [ctx.userId, ctx.storeId])).rows.reverse();
  const ids = msgs.flatMap((m) => (Array.isArray(m.action_ids) ? m.action_ids : []));
  const acts = ids.length ? (await pool.query(`SELECT id, summary, status, result FROM assistant_actions WHERE id = ANY($1::int[]) AND user_id = $2`, [ids, ctx.userId])).rows : [];
  const byId = new Map(acts.map((a) => [a.id, a]));
  res.json(msgs.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.created_at,
    actions: (Array.isArray(m.action_ids) ? m.action_ids : []).map((id: number) => byId.get(id)).filter(Boolean) })));
});

router.post("/api/assistant/actions/:id/:decision", isAuthenticated, async (req: Request, res: Response) => {
  const ctx = await ownerContext(req, res); if (!ctx) return;
  const decision = String(req.params.decision);
  if (!["confirm", "cancel"].includes(decision)) return res.status(404).json({ message: "Not found" });
  // Claim it, so a double tap can't run it twice.
  const claimed = await pool.query(
    `UPDATE assistant_actions SET status = $3, decided_at = now()
      WHERE id = $1 AND user_id = $2 AND store_id = $4 AND status = 'pending' AND created_at > now() - interval '1 day'
      RETURNING kind, payload, summary`,
    [Number(req.params.id), ctx.userId, decision === "confirm" ? "running" : "cancelled", ctx.storeId]);
  const a = claimed.rows[0];
  if (!a) return res.status(409).json({ message: "This change was already handled or has expired." });
  if (decision === "cancel") return res.json({ status: "cancelled", message: "Cancelled — nothing was changed." });
  const result = await executeChange(req, ctx.storeId, a.kind, a.payload);
  await pool.query(`UPDATE assistant_actions SET status = $2, result = $3 WHERE id = $1`, [Number(req.params.id), result.ok ? "done" : "failed", result.message]);
  console.log(`${LOG} store ${ctx.storeId} ${a.kind} ${result.ok ? "done" : "failed: " + result.message}`);
  return res.json({ status: result.ok ? "done" : "failed", message: result.ok ? `Done — ${a.summary}` : result.message });
});

export default router;
