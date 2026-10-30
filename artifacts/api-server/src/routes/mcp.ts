/**
 * Certxa for AI assistants — a public MCP server at https://certxa.com/mcp (owner, 2026-10-30).
 *
 * MCP (Model Context Protocol) is how ChatGPT apps, Claude connectors and other AI assistants call outside
 * services. This lets an assistant find a Certxa salon, read its services, check open times and book, for the
 * person it is chatting with. Plan: plans/ai-booking.md.
 *
 * Every tool goes through the salon's own public booking endpoints (/api/public/store/:slug/…) over loopback,
 * so an AI booking follows exactly the rules of the booking page: online booking on/off, notice and advance
 * limits, ban list, existing-clients-only, manual approval (Solo), deposits (held + payment link by text),
 * confirmations by text and e-mail. Nothing here writes to the database directly.
 *
 * Transport: Streamable HTTP, stateless — each POST carries one JSON-RPC message (or a batch) and gets a JSON
 * reply. No sessions, no server-sent events. Public: no sign-in, like the booking page.
 *
 * Safeguards for AI clients:
 *   • A time taken while the person was deciding → "slot_taken" with the nearest open times that day.
 *   • A repeated book call (retry, double tap) for the same salon, phone and time within 30 minutes returns
 *     the booking already made instead of a second one.
 *   • At most 5 bookings per phone number per hour, and 60 requests a minute per address.
 *   • A salon that needs a card on file gets its booking page link instead (an assistant can't take a card).
 */
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { pool } from "../db";
import { storage } from "../storage";
import { getOrCreateManageToken, buildManageUrl } from "../lib/bookingManageLinks";

const router = Router();
const SITE = () => (process.env.APP_URL || "https://certxa.com").replace(/\/+$/, "");
const LOCAL = () => `http://127.0.0.1:${process.env.PORT || "5000"}`;
const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ── Helpers ──────────────────────────────────────────────────────────────────

class ToolError extends Error {
  constructor(message: string, public code = "error", public extra: Record<string, unknown> = {}) { super(message); }
}

async function localApi(path: string, init?: { method?: string; body?: unknown }): Promise<{ status: number; data: any }> {
  const res = await fetch(`${LOCAL()}${path}`, {
    method: init?.method ?? "GET",
    headers: { "Content-Type": "application/json", "X-Certxa-Source": "mcp" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

/** A salon open to AI booking: active account, online booking not switched off, a booking address. */
async function bookableStore(salonId: unknown) {
  const slug = String(salonId ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(slug)) throw new ToolError("Unknown salon_id. Use search_salons to find it.", "not_found");
  const store: any = await storage.getStoreBySlug(slug);
  if (!store) throw new ToolError("Unknown salon_id. Use search_salons to find it.", "not_found");
  const status = String(store.accountStatus ?? "active").toLowerCase();
  if (status === "suspended" || status === "canceled") throw new ToolError("This salon is not taking bookings right now.", "not_bookable");
  if ((store.onlineBookingMode ?? "all") === "off") {
    throw new ToolError(`This salon isn't taking online bookings right now.${store.phone ? ` Phone: ${formatPhone(store.phone)}.` : ""}`, "not_bookable");
  }
  return { ...store, bookingSlug: store.bookingSlug ?? slug };
}

const bookingPageUrl = (slug: string) => `${SITE()}/book/${slug}`;

function formatPhone(p: string | null | undefined): string | null {
  const d = String(p ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : (p || null);
}

function toE164(p: string): string | null {
  const d = String(p ?? "").replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

async function publicServices(slug: string): Promise<any[]> {
  const r = await localApi(`/api/public/store/${encodeURIComponent(slug)}/services`);
  if (r.status !== 200) throw new ToolError(r.data?.message || "Could not load this salon's services.");
  return (r.data?.services ?? []).filter((s: any) => s.isActive !== false && !s.hiddenFromPublic);
}

async function openTimes(store: any, service: any, date: string, staffId?: number) {
  const qs = new URLSearchParams({ serviceId: String(service.id), date, duration: String(service.duration) });
  if (staffId) qs.set("staffId", String(staffId));
  const r = await localApi(`/api/public/store/${encodeURIComponent(store.bookingSlug)}/availability?${qs}`);
  if (r.status !== 200) throw new ToolError(r.data?.message || "Could not load open times.");
  const tz = store.timezone || "UTC";
  return (Array.isArray(r.data) ? r.data : []).map((s: any) => ({
    start_time: s.time as string,
    local_time: formatInTimeZone(new Date(s.time), tz, "yyyy-MM-dd'T'HH:mm"),
    label: formatInTimeZone(new Date(s.time), tz, "EEE MMM d, h:mm a"),
    staff_id: s.staffId as number,
    staff_name: s.staffName as string,
  }));
}

function localDate(tz: string, offsetDays = 0): string {
  return formatInTimeZone(new Date(Date.now() + offsetDays * 86_400_000), tz, "yyyy-MM-dd");
}

// ── Tools ────────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "search_salons",
    title: "Find a salon on Certxa",
    description:
      "Find nail salons, hair salons, barbershops and spas that take online bookings through Certxa. Search by business name, city, state, ZIP code and/or a service (e.g. 'gel manicure'). Returns each salon's salon_id, which the other tools need.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Business name or words in it, e.g. 'Luxury Nails'." },
        city: { type: "string", description: "City, e.g. 'Tucson'." },
        state: { type: "string", description: "US state, two letters (e.g. 'AZ') or full name." },
        zip: { type: "string", description: "5-digit ZIP code." },
        service: { type: "string", description: "A service the salon must offer, e.g. 'pedicure'." },
      },
      additionalProperties: false,
    },
    annotations: { title: "Find a salon", readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "get_salon",
    title: "Salon details and services",
    description:
      "Get a Certxa salon's address, phone, opening hours, staff and bookable services (service_id, name, duration in minutes, price). Call this before check_availability to pick the service_id.",
    inputSchema: {
      type: "object",
      properties: { salon_id: { type: "string", description: "salon_id from search_salons." } },
      required: ["salon_id"],
      additionalProperties: false,
    },
    annotations: { title: "Salon details", readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "check_availability",
    title: "Check open times",
    description:
      "List the open appointment times at a Certxa salon for one service on one date, in real time. Each time comes with the staff member who has it. If the date is full, the next days with open times are suggested. Times are in the salon's local time zone.",
    inputSchema: {
      type: "object",
      properties: {
        salon_id: { type: "string", description: "salon_id from search_salons." },
        service_id: { type: "integer", description: "service_id from get_salon." },
        date: { type: "string", description: "Date in YYYY-MM-DD (the salon's local date)." },
        staff_id: { type: "integer", description: "Optional: only this staff member (staff_id from get_salon)." },
      },
      required: ["salon_id", "service_id", "date"],
      additionalProperties: false,
    },
    annotations: { title: "Check open times", readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "book_appointment",
    title: "Book an appointment",
    description:
      "Book an appointment at a Certxa salon for the user. Use a start_time and staff_id exactly as returned by check_availability. Only call this after the user has confirmed the salon, service, staff member, time, and their name and mobile phone number. The salon texts the confirmation to that number. If the time was just taken, nearby open times are returned instead.",
    inputSchema: {
      type: "object",
      properties: {
        salon_id: { type: "string" },
        service_id: { type: "integer" },
        staff_id: { type: "integer", description: "staff_id from the chosen open time." },
        start_time: { type: "string", description: "start_time from check_availability (ISO 8601, UTC)." },
        customer_name: { type: "string", description: "The client's first and last name." },
        customer_phone: { type: "string", description: "The client's US mobile number, 10 digits." },
        customer_email: { type: "string", description: "Optional e-mail for the confirmation." },
        notes: { type: "string", description: "Optional note for the salon (max 500 characters)." },
      },
      required: ["salon_id", "service_id", "staff_id", "start_time", "customer_name", "customer_phone"],
      additionalProperties: false,
    },
    annotations: { title: "Book an appointment", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
] as const;

async function searchSalons(args: any) {
  const where: string[] = [
    `l.booking_slug IS NOT NULL`,
    `lower(coalesce(l.account_status, 'active')) NOT IN ('suspended', 'canceled')`,
    `coalesce(l.online_booking_mode, 'all') <> 'off'`,
    `EXISTS (SELECT 1 FROM services s WHERE s.store_id = l.id AND coalesce(s.is_active, true) AND NOT coalesce(s.hidden_from_public, false))`,
  ];
  const params: unknown[] = [];
  /** Adds a condition; every $v in it is this value's placeholder. */
  const add = (clause: string, v: unknown) => { params.push(v); where.push(clause.replace(/\$v/g, `$${params.length}`)); };
  const text = (v: unknown) => String(v ?? "").trim().slice(0, 80);
  if (text(args.query)) add(`(l.name ILIKE $v OR l.category ILIKE $v)`, `%${text(args.query)}%`);
  if (text(args.city)) add(`l.city ILIKE $v`, text(args.city));
  if (text(args.state)) add(`(upper(l.state) = upper($v) OR l.state ILIKE $v)`, text(args.state));
  if (text(args.zip)) add(`l.postcode LIKE $v`, `${text(args.zip).slice(0, 5)}%`);
  if (text(args.service)) add(`EXISTS (SELECT 1 FROM services s2 WHERE s2.store_id = l.id AND coalesce(s2.is_active, true) AND NOT coalesce(s2.hidden_from_public, false) AND s2.name ILIKE $v)`, `%${text(args.service)}%`);
  const sql = `SELECT l.booking_slug, l.name, l.category, l.address, l.city, l.state, l.postcode, l.phone, l.address_private
                 FROM locations l WHERE ${where.join(" AND ")}
                ORDER BY l.name LIMIT 20`;
  const r = await pool.query(sql, params);
  const salons = r.rows.map((s: any) => ({
    salon_id: s.booking_slug,
    name: s.name,
    type: s.category,
    address: s.address_private ? null : s.address,
    city: s.city,
    state: s.state,
    zip: s.address_private ? null : s.postcode,
    phone: formatPhone(s.phone),
    booking_page: bookingPageUrl(s.booking_slug),
  }));
  return {
    salons,
    note: salons.length ? undefined : "No Certxa salon matched. Try fewer words, only the city, or only the service.",
  };
}

async function getSalon(args: any) {
  const store = await bookableStore(args.salon_id);
  const [services, staffRes, hours] = await Promise.all([
    publicServices(store.bookingSlug),
    localApi(`/api/public/store/${encodeURIComponent(store.bookingSlug)}/staff`),
    storage.getBusinessHours(store.id),
  ]);
  const staff = (Array.isArray(staffRes.data) ? staffRes.data : []).map((s: any) => ({ staff_id: s.id, name: s.name, role: s.role || null }));
  const policy = String(store.bookingPaymentPolicy ?? "none");
  return {
    salon_id: store.bookingSlug,
    name: store.name,
    type: store.category,
    address: store.addressPrivate ? null : [store.address, store.city, store.state, store.postcode].filter(Boolean).join(", "),
    city: store.city,
    phone: formatPhone(store.phone),
    time_zone: store.timezone,
    booking_page: bookingPageUrl(store.bookingSlug),
    opening_hours: (hours ?? [])
      .slice()
      .sort((a: any, b: any) => a.dayOfWeek - b.dayOfWeek)
      .map((h: any) => ({ day: DAY_NAMES[h.dayOfWeek], open: h.isClosed ? null : h.openTime, close: h.isClosed ? null : h.closeTime, closed: !!h.isClosed })),
    booking_rules: {
      approval: store.bookingApproval === "manual" ? "The salon reviews each booking request before confirming it." : "Bookings are confirmed straight away.",
      payment:
        policy === "deposit" ? "A deposit is required: the booking is held and a payment link is texted to the client."
        : policy === "card_on_file" ? "A card on file is required: the client must finish the booking on the salon's booking page."
        : "No payment is needed to book.",
      cancellation_notice_hours: store.cancellationHoursCutoff ?? null,
    },
    staff,
    services: services.map((s: any) => ({
      service_id: s.id,
      name: s.name,
      category: s.category || null,
      duration_minutes: s.duration,
      price: s.price != null ? `$${Number(s.price).toFixed(2)}` : null,
      description: s.description || null,
    })),
  };
}

async function checkAvailability(args: any) {
  const store = await bookableStore(args.salon_id);
  const tz = store.timezone || "UTC";
  const date = String(args.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ToolError("date must be YYYY-MM-DD.", "invalid_input");
  if (date < localDate(tz)) throw new ToolError(`That date has passed. Today at the salon is ${localDate(tz)}.`, "invalid_input");
  const services = await publicServices(store.bookingSlug);
  const service = services.find((s: any) => s.id === Number(args.service_id));
  if (!service) throw new ToolError("Unknown service_id for this salon. Use get_salon to list services.", "invalid_input");
  const staffId = args.staff_id ? Number(args.staff_id) : undefined;

  const times = await openTimes(store, service, date, staffId);
  let next_open_days: { date: string; first_time: string }[] | undefined;
  if (!times.length) {
    next_open_days = [];
    const start = fromZonedTime(`${date}T12:00:00`, tz).getTime();
    for (let i = 1; i <= 14 && next_open_days.length < 3; i++) {
      const d = formatInTimeZone(new Date(start + i * 86_400_000), tz, "yyyy-MM-dd");
      const t = await openTimes(store, service, d, staffId);
      if (t.length) next_open_days.push({ date: d, first_time: t[0].label });
    }
  }
  return {
    salon_id: store.bookingSlug,
    salon_name: store.name,
    time_zone: tz,
    service: { service_id: service.id, name: service.name, duration_minutes: service.duration, price: service.price != null ? `$${Number(service.price).toFixed(2)}` : null },
    date,
    open_times: times.slice(0, 60),
    more_times: times.length > 60 ? times.length - 60 : 0,
    next_open_days,
  };
}

// Bookings per phone number, last hour (one server process; the limit is a brake, not a ledger).
const recentByPhone = new Map<string, number[]>();
function phoneAllowed(e164: string): boolean {
  const now = Date.now();
  const list = (recentByPhone.get(e164) ?? []).filter((t) => now - t < 3_600_000);
  recentByPhone.set(e164, list);
  return list.length < 5;
}

async function bookAppointment(args: any) {
  const store = await bookableStore(args.salon_id);
  const tz = store.timezone || "UTC";
  const name = String(args.customer_name ?? "").trim().slice(0, 120);
  if (name.length < 2) throw new ToolError("customer_name is required.", "invalid_input");
  const e164 = toE164(String(args.customer_phone ?? ""));
  if (!e164) throw new ToolError("customer_phone must be a 10-digit US mobile number.", "invalid_input");
  const email = String(args.customer_email ?? "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ToolError("customer_email is not a valid e-mail address.", "invalid_input");
  const start = new Date(String(args.start_time ?? ""));
  if (Number.isNaN(start.getTime())) throw new ToolError("start_time must be an ISO 8601 time from check_availability.", "invalid_input");
  if (start.getTime() < Date.now()) throw new ToolError("That time has passed.", "invalid_input");
  const services = await publicServices(store.bookingSlug);
  const service = services.find((s: any) => s.id === Number(args.service_id));
  if (!service) throw new ToolError("Unknown service_id for this salon. Use get_salon to list services.", "invalid_input");
  const staffId = Number(args.staff_id);
  if (!Number.isInteger(staffId) || staffId <= 0) throw new ToolError("staff_id is required (from check_availability).", "invalid_input");

  const confirmation = async (appointmentId: number, extra: Record<string, unknown> = {}) => {
    const token = await getOrCreateManageToken(appointmentId);
    const staffRow = (await pool.query(`SELECT name FROM staff WHERE id = $1`, [staffId])).rows[0];
    return {
      status: "booked",
      confirmation_id: String(appointmentId),
      salon_name: store.name,
      service: service.name,
      staff_name: staffRow?.name ?? null,
      when: formatInTimeZone(start, tz, "EEEE, MMMM d, yyyy 'at' h:mm a"),
      time_zone: tz,
      address: store.addressPrivate ? null : [store.address, store.city, store.state].filter(Boolean).join(", "),
      manage_url: buildManageUrl(token),
      message: `Booked. ${store.name} will text a confirmation to the client's phone. They can view or cancel the booking at the manage link.`,
      ...extra,
    };
  };

  // The same booking asked for again (a retry or a double tap): return it instead of booking twice.
  const dup = await pool.query(
    `SELECT a.id FROM appointments a JOIN client_phones cp ON cp.client_id = a.customer_id
      WHERE a.store_id = $1 AND a.date = $2 AND cp.phone_number_e164 = $3
        AND a.created_at > now() - interval '30 minutes' AND coalesce(a.status, '') NOT IN ('cancelled', 'canceled')
      ORDER BY a.id DESC LIMIT 1`,
    [store.id, start, e164],
  );
  if (dup.rows[0]) return confirmation(Number(dup.rows[0].id), { note: "This booking had already been made; nothing new was booked." });

  if (!phoneAllowed(e164)) throw new ToolError("Too many bookings for this phone number in the last hour. Please try again later or call the salon.", "rate_limited");

  const r = await localApi(`/api/public/store/${encodeURIComponent(store.bookingSlug)}/book`, {
    method: "POST",
    body: {
      serviceId: service.id,
      staffId,
      date: start.toISOString(),
      duration: service.duration,
      customerName: name,
      customerPhone: e164.slice(2),
      ...(email ? { customerEmail: email } : {}),
      ...(args.notes ? { notes: String(args.notes).slice(0, 500) } : {}),
      cancellationPolicyAccepted: true,
    },
  });

  if (r.status === 201) {
    recentByPhone.get(e164)?.push(Date.now());
    const id = Number(r.data?.id);
    if (r.data?.depositHold) {
      const hold = r.data.depositHold;
      return confirmation(id, {
        status: "held_pending_deposit",
        deposit: `$${(Number(hold.amountCents) / 100).toFixed(2)}`,
        payment_url: hold.paymentUrl,
        hold_expires_at: hold.expiresAt,
        message: `The time is held. ${store.name} needs a deposit to confirm it: a payment link has been texted to the client (also here as payment_url). If it isn't paid in time, the time is released.`,
      });
    }
    return confirmation(id);
  }
  if (r.status === 202 && r.data?.requested) {
    recentByPhone.get(e164)?.push(Date.now());
    return {
      status: "requested",
      salon_name: store.name,
      service: service.name,
      when: formatInTimeZone(start, tz, "EEEE, MMMM d, yyyy 'at' h:mm a"),
      message: `${store.name} reviews each booking first. The request has been sent; the client will get a text when it is confirmed or when other times are offered.`,
    };
  }
  if (r.status === 402) {
    throw new ToolError(`${store.name} needs a card on file to confirm a booking, which has to be added on its booking page: ${bookingPageUrl(store.bookingSlug)}`, "payment_required", { booking_page: bookingPageUrl(store.bookingSlug) });
  }
  if (r.status === 409) {
    const date = formatInTimeZone(start, tz, "yyyy-MM-dd");
    const near = (await openTimes(store, service, date).catch(() => []))
      .sort((a: any, b: any) => Math.abs(new Date(a.start_time).getTime() - start.getTime()) - Math.abs(new Date(b.start_time).getTime() - start.getTime()))
      .slice(0, 5);
    throw new ToolError("That time was just taken. Offer the user one of the suggested times.", "slot_taken", { suggested_alternatives: near });
  }
  throw new ToolError(r.data?.message || "The booking could not be made. The client can book on the salon's booking page.", "booking_failed", { booking_page: bookingPageUrl(store.bookingSlug) });
}

const HANDLERS: Record<string, (args: any) => Promise<unknown>> = {
  search_salons: searchSalons,
  get_salon: getSalon,
  check_availability: checkAvailability,
  book_appointment: bookAppointment,
};

// ── JSON-RPC / MCP ───────────────────────────────────────────────────────────

const INSTRUCTIONS =
  "Certxa is booking software used by nail salons, hair salons, barbershops and spas in the United States. " +
  "To book: search_salons → get_salon (pick a service) → check_availability → confirm the details with the user → book_appointment. " +
  "Always confirm the salon, service, staff member, date, time, the client's name and mobile number before booking. " +
  "Times are in the salon's local time zone.";

async function handleMessage(msg: any): Promise<any | null> {
  const isRequest = msg && typeof msg === "object" && msg.jsonrpc === "2.0" && typeof msg.method === "string";
  if (!isRequest) return { jsonrpc: "2.0", id: msg?.id ?? null, error: { code: -32600, message: "Invalid Request" } };
  const { id, method, params } = msg;
  if (id === undefined || id === null) return null; // a notification: nothing to answer
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

  switch (method) {
    case "initialize": {
      const asked = String(params?.protocolVersion ?? "");
      return reply({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "certxa", title: "Certxa salon booking", version: "1.0.0", websiteUrl: SITE() },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call": {
      const name = String(params?.name ?? "");
      const handler = HANDLERS[name];
      if (!handler) return fail(-32602, `Unknown tool: ${name}`);
      try {
        const result = await handler(params?.arguments ?? {});
        return reply({ content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: false });
      } catch (err: any) {
        if (!(err instanceof ToolError)) console.error(`[mcp] ${name} failed:`, err?.message ?? err);
        const body = err instanceof ToolError
          ? { error: err.code, message: err.message, ...err.extra }
          : { error: "server_error", message: "Something went wrong. Please try again." };
        return reply({ content: [{ type: "text", text: JSON.stringify(body) }], structuredContent: body, isError: true });
      }
    }
    case "resources/list":
      return reply({ resources: [] });
    case "prompts/list":
      return reply({ prompts: [] });
    default:
      return fail(-32601, `Method not found: ${method}`);
  }
}

const mcpLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false,
  message: { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Too many requests. Please slow down." } } });

router.post("/mcp", mcpLimiter, async (req: Request, res: Response) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const body = req.body;
  if (body === undefined || body === null || (typeof body !== "object")) {
    return res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }
  try {
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map(handleMessage))).filter(Boolean);
      return out.length ? res.json(out) : res.status(202).end();
    }
    const out = await handleMessage(body);
    return out ? res.json(out) : res.status(202).end();
  } catch (err: any) {
    console.error("[mcp]", err?.message ?? err);
    return res.status(500).json({ jsonrpc: "2.0", id: body?.id ?? null, error: { code: -32603, message: "Internal error" } });
  }
});

router.options("/mcp", (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id");
  res.status(204).end();
});

// No server-to-client stream and no sessions: GET and DELETE are not offered.
router.get("/mcp", (_req, res) => { res.setHeader("Allow", "POST"); res.status(405).json({ message: "Use POST. Certxa's MCP server is stateless (Streamable HTTP, JSON replies)." }); });
router.delete("/mcp", (_req, res) => { res.setHeader("Allow", "POST"); res.status(405).end(); });

export default router;
