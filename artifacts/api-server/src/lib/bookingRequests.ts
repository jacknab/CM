/**
 * Booking approval (Solo plan; plans/solo-resume.md step 5, owner 2026-10-23).
 *
 * With "Review each booking first" (locations.booking_approval = 'manual') an online booking becomes a REQUEST in
 * booking_requests, never an appointment: many queries treat every non-cancelled appointment as a real booking,
 * and a request does not hold its time. The professional then, in the Certxa Pro app:
 *   - approves it: the booking is made through the normal booking path (the public /book handler, so every
 *     check, add-on, house call and confirmation text is the same) and the client gets the usual confirmation;
 *   - offers other times: the client is texted a link (<slug>.certxa.com/?offer=<token>) showing only those times
 *     that are still free; picking one books it straight away. The link stays open for
 *     locations.booking_offer_valid_days days;
 *   - declines it: the client is told and given the booking link.
 * A request nobody answers expires after locations.booking_request_expiry_hours; the client is told.
 *
 * Decisions taken without the owner (say so if any is wrong): requests take no deposit or card (the booking page
 * asks for none while approval is on), phone bookings made by Autumn are not affected, and the requests list is
 * in the app only. Texts about requests are platform-funded (only campaign texts are billed).
 */
import crypto from "crypto";
import { formatInTimeZone } from "date-fns-tz";
import { pool } from "../db";
import { sendSms } from "../sms";
import { pushOwnerMessage, whenLabel } from "./ownerPush";
import { timeTaken } from "../routes/certxaPro";

type Handler = (req: any, res: any) => Promise<unknown>;
let publicBookHandler: Handler | null = null;
/** routes.ts hands over its POST /api/public/store/:slug/book handler, so approving books exactly like a client would. */
export function setPublicBookHandler(handler: Handler) { publicBookHandler = handler; }

/** Run the public booking handler for a request: { status, body } as the handler answered. */
async function bookThroughPublicPath(slug: string, body: Record<string, unknown>, requestId: number, quietPush: boolean) {
  if (!publicBookHandler) throw new Error("Booking is not ready yet. Try again in a moment.");
  let status = 200;
  let payload: any = null;
  const res = {
    status(code: number) { status = code; return res; },
    json(value: unknown) { payload = value; return res; },
    send(value: unknown) { payload = value; return res; },
    setHeader() { return res; },
  };
  const req = { params: { slug }, body, query: {}, headers: {}, session: {}, __bookingRequestId: requestId, __quietPush: quietPush };
  await publicBookHandler(req, res);
  return { status, body: payload };
}

export type RequestRow = {
  id: number; store_id: number; client_id: number | null; client_name: string; client_phone: string | null; client_email: string | null;
  staff_id: number | null; service_ids: number[]; details: Record<string, any>; starts_at: Date; duration: number; visit_at: string;
  client_address: any; travel_fee: string | null; notes: string | null; status: string; offer_token: string | null;
  offered_times: string[] | null; appointment_id: number | null; expires_at: Date; decided_at: Date | null; created_at: Date;
};
type StoreInfo = { id: number; name: string; timezone: string; booking_slug: string | null; booking_request_expiry_hours: number; booking_offer_valid_days: number };

async function storeInfo(storeId: number): Promise<StoreInfo | null> {
  const row = await pool.query<StoreInfo>(
    "SELECT id, name, timezone, booking_slug, booking_request_expiry_hours, booking_offer_valid_days FROM locations WHERE id = $1", [storeId]);
  return row.rows[0] ?? null;
}
const siteUrl = (store: StoreInfo) => (store.booking_slug ? `https://${store.booking_slug}.certxa.com` : "https://certxa.com");
const firstName = (name: string) => String(name || "").trim().split(/\s+/)[0] || "there";
const when = (date: Date | string, tz: string) => formatInTimeZone(new Date(date), tz || "UTC", "EEE, MMM d 'at' h:mm a");

async function serviceName(serviceId: unknown): Promise<string> {
  const id = Number(serviceId);
  if (!Number.isInteger(id) || id <= 0) return "appointment";
  const row = await pool.query<{ name: string }>("SELECT name FROM services WHERE id = $1", [id]);
  return row.rows[0]?.name ?? "appointment";
}

async function textClient(request: Pick<RequestRow, "store_id" | "client_phone" | "client_id">, body: string) {
  if (!request.client_phone) return;
  await sendSms(request.store_id, request.client_phone, body, "booking_request", undefined, request.client_id ?? undefined).catch(() => undefined);
}

/** The public /book handler calls this instead of booking when the business reviews bookings first. */
export async function createBookingRequest(input: {
  storeId: number; customerId: number; customerName: string; phoneE164: string; email: string | null;
  body: Record<string, unknown>; startsAt: Date; duration: number; staffId: number | null; serviceIds: number[];
  visitAt: "place" | "client"; clientAddress: unknown; travelFee: number | null; notes: string | null;
}): Promise<{ id: number }> {
  const store = await storeInfo(input.storeId);
  if (!store) throw new Error("Store not found");
  // Everything the booking will be made with later, minus anything about payment (requests take none).
  const { paymentPolicy, paymentStatus, stripePaymentIntentId, stripeSetupIntentId, stripeCustomerId, stripePaymentMethodId,
    depositCollected, remainingBalance, voucherCode, date, ...details } = input.body as Record<string, unknown>;
  void paymentPolicy; void paymentStatus; void stripePaymentIntentId; void stripeSetupIntentId; void stripeCustomerId;
  void stripePaymentMethodId; void depositCollected; void remainingBalance; void voucherCode; void date;
  const hours = Math.max(1, Number(store.booking_request_expiry_hours) || 48);
  const row = await pool.query<{ id: number }>(
    `INSERT INTO booking_requests (store_id, client_id, client_name, client_phone, client_email, staff_id, service_ids, details,
       starts_at, duration, visit_at, client_address, travel_fee, notes, status, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12::jsonb,$13,$14,'requested', now() + make_interval(hours => $15))
     RETURNING id`,
    [input.storeId, input.customerId, input.customerName, input.phoneE164, input.email, input.staffId, JSON.stringify(input.serviceIds),
     JSON.stringify(details), input.startsAt.toISOString(), input.duration, input.visitAt,
     input.clientAddress ? JSON.stringify(input.clientAddress) : null, input.travelFee, input.notes, hours]);
  const id = row.rows[0].id;
  const service = await serviceName(input.serviceIds[0]);
  void textClient({ store_id: input.storeId, client_phone: input.phoneE164, client_id: input.customerId },
    `Hi ${firstName(input.customerName)}, ${store.name} got your request for ${service} on ${when(input.startsAt, store.timezone)}. You'll get a text when they reply.`);
  void pushOwnerMessage(input.storeId, {
    title: "New booking request",
    body: `${input.customerName} · ${service}\n${whenLabel(input.startsAt, store.timezone)}`,
    data: { type: "booking_request", requestId: id },
  });
  return { id };
}

// With the deposit the approved booking is held for, when the business asks for one (lib/bookingPaymentLinks.ts).
const LIST_SELECT = `SELECT r.*, s.name AS service_name, l.timezone, a.payment_status,
    t.deposit_amount_cents, t.expires_at AS deposit_due_at, t.used_at AS deposit_paid_at
  FROM booking_requests r JOIN locations l ON l.id = r.store_id
  LEFT JOIN services s ON s.id = (r.service_ids->>0)::int
  LEFT JOIN appointments a ON a.id = r.appointment_id
  LEFT JOIN LATERAL (SELECT deposit_amount_cents, expires_at, used_at FROM booking_payment_tokens bt
                      WHERE bt.appointment_id = r.appointment_id ORDER BY bt.id DESC LIMIT 1) t ON true`;

/** Open requests (waiting, or times offered), newest first; or one request. */
export async function listRequests(storeId: number, which: "open" | "all" = "open") {
  const rows = await pool.query(`${LIST_SELECT} WHERE r.store_id = $1 ${which === "open" ? "AND r.status IN ('requested','offered')" : ""}
    ORDER BY r.created_at DESC LIMIT 100`, [storeId]);
  return rows.rows.map(shape);
}
export async function getRequest(storeId: number, id: number) {
  const row = await pool.query(`${LIST_SELECT} WHERE r.store_id = $1 AND r.id = $2`, [storeId, id]);
  return row.rows[0] ? shape(row.rows[0]) : null;
}
function shape(r: any) {
  return {
    id: r.id, status: r.status, clientName: r.client_name, clientPhone: r.client_phone, clientEmail: r.client_email, clientId: r.client_id,
    serviceId: Number(r.service_ids?.[0]) || null, serviceName: r.service_name ?? "Service", addonIds: Array.isArray(r.details?.addonIds) ? r.details.addonIds : [],
    startsAt: new Date(r.starts_at).toISOString(), duration: r.duration, visitAt: r.visit_at, clientAddress: r.client_address,
    travelFee: r.travel_fee == null ? 0 : Number(r.travel_fee), notes: r.notes, offeredTimes: r.offered_times ?? [],
    appointmentId: r.appointment_id, expiresAt: new Date(r.expires_at).toISOString(), createdAt: new Date(r.created_at).toISOString(),
    staffId: r.staff_id,
    // The deposit the booking waits for: due by when, and whether it's been paid.
    deposit: r.deposit_amount_cents ? {
      amountCents: Number(r.deposit_amount_cents), dueBy: r.deposit_due_at ? new Date(r.deposit_due_at).toISOString() : null,
      paid: !!r.deposit_paid_at || (r.payment_status && r.payment_status !== "awaiting_payment"),
    } : null,
  };
}

/** Lock an open request for a decision (the same request can't be decided twice). */
async function claim(storeId: number, id: number, statuses: string[]) {
  const row = await pool.query<RequestRow>(
    `SELECT * FROM booking_requests WHERE id = $1 AND store_id = $2 AND status = ANY($3::text[]) AND expires_at > now()`, [id, storeId, statuses]);
  return row.rows[0] ?? null;
}

export class RequestError extends Error { constructor(message: string, public status = 400) { super(message); } }

/** Approve: book the time the client asked for. A clash (taken meanwhile) comes back as 409 so the app offers other times. */
export async function approveRequest(storeId: number, id: number) {
  const request = await claim(storeId, id, ["requested"]);
  if (!request) throw new RequestError("This request was already answered or has expired.", 409);
  const store = await storeInfo(storeId);
  if (!store?.booking_slug) throw new RequestError("Your booking link isn't set up.", 409);
  const result = await bookThroughPublicPath(store.booking_slug, { ...request.details, date: new Date(request.starts_at).toISOString() }, id, true);
  if (result.status >= 300) throw new RequestError(result.body?.message ?? "That time can't be booked any more.", result.status === 409 ? 409 : 400);
  const appointmentId = Number(result.body?.id) || null;
  await pool.query(`UPDATE booking_requests SET status = 'approved', appointment_id = $2, decided_at = now() WHERE id = $1`, [id, appointmentId]);
  return getRequest(storeId, id);
}

/** Decline: tell the client and give them the booking link. */
export async function declineRequest(storeId: number, id: number) {
  const request = await claim(storeId, id, ["requested", "offered"]);
  if (!request) throw new RequestError("This request was already answered or has expired.", 409);
  const store = await storeInfo(storeId);
  await pool.query(`UPDATE booking_requests SET status = 'declined', decided_at = now(), offer_token = NULL WHERE id = $1`, [id]);
  if (store) {
    const service = await serviceName(request.service_ids?.[0]);
    void textClient(request, `Hi ${firstName(request.client_name)}, sorry: ${store.name} can't take your ${service} request for ${when(request.starts_at, store.timezone)}. You can book another time at ${siteUrl(store)}`);
  }
  return getRequest(storeId, id);
}

/** Offer other times: save them, make the client's link and text it. Valid for the business's offer days. */
export async function offerTimes(storeId: number, id: number, times: string[]) {
  const request = await claim(storeId, id, ["requested", "offered"]);
  if (!request) throw new RequestError("This request was already answered or has expired.", 409);
  const store = await storeInfo(storeId);
  if (!store?.booking_slug) throw new RequestError("Your booking link isn't set up.", 409);
  const clean = [...new Set(times.map((t) => new Date(t)).filter((d) => Number.isFinite(d.getTime()) && d.getTime() > Date.now() + 15 * 60_000).map((d) => d.toISOString()))].sort();
  if (clean.length === 0) throw new RequestError("Choose at least one time that hasn't passed.");
  if (clean.length > 8) throw new RequestError("Offer up to 8 times.");
  const days = Math.max(1, Number(store.booking_offer_valid_days) || 3);
  const token = request.offer_token ?? crypto.randomBytes(18).toString("base64url");
  await pool.query(
    `UPDATE booking_requests SET status = 'offered', offered_times = $2::jsonb, offer_token = $3, decided_at = now(),
       expires_at = now() + make_interval(days => $4) WHERE id = $1`,
    [id, JSON.stringify(clean), token, days]);
  // The business's own link opens the offer page (PublicBooking reads ?offer=).
  const link = `${siteUrl(store)}/?offer=${token}`;
  const until = formatInTimeZone(new Date(Date.now() + days * 86_400_000), store.timezone || "UTC", "EEE, MMM d");
  void textClient(request, `Hi ${firstName(request.client_name)}, ${store.name} can't do ${when(request.starts_at, store.timezone)}, but has other times for you. Pick one here: ${link} (open until ${until})`);
  return getRequest(storeId, id);
}

/** The client's offer page: the business, the service and the offered times that are still free. */
export async function readOffer(token: string) {
  const row = await pool.query<RequestRow & { name: string; timezone: string; booking_slug: string | null; booking_site: any }>(
    `SELECT r.*, l.name, l.timezone, l.booking_slug, l.booking_site FROM booking_requests r JOIN locations l ON l.id = r.store_id WHERE r.offer_token = $1`, [token]);
  const r = row.rows[0];
  if (!r) return null;
  const base = { businessName: r.name, timezone: r.timezone, bookingUrl: r.booking_slug ? `https://${r.booking_slug}.certxa.com` : null,
    look: r.booking_site ?? {}, serviceName: await serviceName(r.service_ids?.[0]), duration: r.duration, clientFirstName: firstName(r.client_name) };
  if (r.status === "booked") return { ...base, status: "booked" as const, times: [], bookedAt: r.appointment_id ? (await pool.query("SELECT date FROM appointments WHERE id = $1", [r.appointment_id])).rows[0]?.date ?? null : null };
  if (r.status !== "offered" || new Date(r.expires_at).getTime() <= Date.now()) return { ...base, status: "closed" as const, times: [] };
  const free: string[] = [];
  for (const time of r.offered_times ?? []) {
    if (new Date(time).getTime() <= Date.now()) continue;
    if (!(await timeTaken(r.store_id, r.staff_id, time, r.duration, null, r.visit_at))) free.push(time);
  }
  return { ...base, status: "open" as const, times: free, expiresAt: new Date(r.expires_at).toISOString() };
}

/** The client picks an offered time: it is booked straight away (the professional offered it). */
export async function pickOffer(token: string, time: string) {
  const row = await pool.query<RequestRow & { booking_slug: string | null }>(
    `SELECT r.*, l.booking_slug FROM booking_requests r JOIN locations l ON l.id = r.store_id
      WHERE r.offer_token = $1 AND r.status = 'offered' AND r.expires_at > now()`, [token]);
  const r = row.rows[0];
  if (!r || !r.booking_slug) throw new RequestError("These times are no longer available.", 410);
  const picked = (r.offered_times ?? []).find((t) => new Date(t).getTime() === new Date(time).getTime());
  if (!picked) throw new RequestError("Choose one of the offered times.");
  // Only one pick can win.
  const locked = await pool.query(`UPDATE booking_requests SET status = 'booking' WHERE id = $1 AND status = 'offered' RETURNING id`, [r.id]);
  if (!locked.rowCount) throw new RequestError("These times are no longer available.", 410);
  try {
    const result = await bookThroughPublicPath(r.booking_slug, { ...r.details, date: picked }, r.id, false);
    if (result.status >= 300) throw new RequestError(result.body?.message ?? "That time was just taken. Please pick another.", 409);
    await pool.query(`UPDATE booking_requests SET status = 'booked', appointment_id = $2, decided_at = now() WHERE id = $1`, [r.id, Number(result.body?.id) || null]);
    // A deposit is due: the offer page sends the client straight to paying it (they're texted the link too).
    return { booked: true, time: picked, paymentUrl: result.body?.depositHold?.paymentUrl ?? null, depositCents: result.body?.depositHold?.amountCents ?? null };
  } catch (error) {
    await pool.query(`UPDATE booking_requests SET status = 'offered' WHERE id = $1 AND status = 'booking'`, [r.id]);
    throw error;
  }
}

/** Requests nobody answered, and offers nobody picked, expire; the client is told. Runs on the scheduler instance. */
export async function expireRequests(): Promise<number> {
  const due = await pool.query<RequestRow>(
    `UPDATE booking_requests SET status = 'expired', decided_at = COALESCE(decided_at, now())
      WHERE status IN ('requested', 'offered') AND expires_at <= now()
      RETURNING *`);
  for (const request of due.rows) {
    const store = await storeInfo(request.store_id);
    if (!store) continue;
    const offered = Array.isArray(request.offered_times) && request.offered_times.length > 0;
    void textClient(request, offered
      ? `Hi ${firstName(request.client_name)}, the times ${store.name} offered you have expired. You can book another time at ${siteUrl(store)}`
      : `Hi ${firstName(request.client_name)}, ${store.name} wasn't able to answer your request for ${when(request.starts_at, store.timezone)} in time. You can book another time at ${siteUrl(store)}`);
  }
  return due.rowCount ?? 0;
}

let sweeper: ReturnType<typeof setInterval> | null = null;
export function startBookingRequestSweeper() {
  if (sweeper) return;
  sweeper = setInterval(() => { void expireRequests().then((n) => { if (n) console.log(`[booking-requests] expired ${n}`); }).catch((e) => console.warn("[booking-requests] sweep failed:", e?.message ?? e)); }, 5 * 60_000);
}
