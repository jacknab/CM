/** Compact, store-scoped Certxa Pro native API. The existing web API remains unchanged. */
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { verifySoloToken } from "../lib/soloAuth";
import { appWebLink } from "../lib/appWebSession";
import { isSoloUser } from "../lib/soloApiAllowList";
import { storage } from "../storage";
import { getBufferMinutes, getHouseCallTravelMinutes, neededWindow } from "../lib/appointmentBuffer";
import { checkHouseCall, saveClientAddress, type ClientAddress } from "../lib/houseCalls";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { deleteClientRecord } from "../lib/deleteClient";

const router = Router();
const id = z.coerce.number().int().positive();
const date = z.string().datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)), "Invalid ISO date");
const status = z.enum(["pending", "confirmed", "started", "paid", "cancelled"]);
// A client can be added from just a name, a phone number or an e-mail (the app's POS, owner 2026-10-30).
// Without a name, the phone or e-mail is shown as the name until the owner adds one.
const customerInput = z.object({
  name: z.string().trim().max(200).optional(),
  phone: z.string().trim().min(1).max(50).optional(),
  email: z.email().max(254).optional(),
  notes: z.string().max(10000).optional(),
}).strict().refine((c) => !!(c.name || c.phone || c.email), { message: "Enter a name, phone number or e-mail" })
  .transform((c) => ({ ...c, name: c.name || c.phone || c.email || "" }));
// A quick sale from the app's POS: an amount for a client, paid by card. It is a ticket of its own, kept off the
// calendar (calendar_hidden), and completed by the card capture like any checkout.
const quickSaleInput = z.object({
  customerId: id,
  amountCents: z.number().int().min(50).max(10_000_000),
  description: z.string().trim().max(60).optional(),
}).strict();
const appointmentInput = z.object({
  customerId: id, serviceId: id, duration: z.number().int().positive().max(1440),
  date, notes: z.string().max(10000).nullish(),
  // The app sends the technician its open time was offered for; the booking is always made for the owner (see ownStaff).
  staffId: id.optional(),
  // Further services on the same visit, as priced lines.
  customLines: z.array(z.object({ label: z.string().trim().min(1).max(60), price: z.number().min(0).max(100000) }).strict()).max(20).optional(),
  // Solo plan: a house call ('client') and the client's address (plans/solo-work-places-and-approval.md).
  visitAt: z.enum(["place", "client"]).optional(),
  clientAddress: z.record(z.string(), z.unknown()).optional(),
}).strict();
const updateInput = z.object({
  date: date.optional(), serviceId: id.optional(),
  duration: z.number().int().positive().max(1440).optional(),
  status: status.optional(), notes: z.string().max(10000).nullable().optional(),
  // Edit: the visit's further services, as priced lines (the first service is serviceId), like a new booking's.
  customLines: z.array(z.object({ label: z.string().trim().min(1).max(60), price: z.number().min(0).max(100000) }).strict()).max(20).optional(),
  // Kept for compatibility with the shipped native appointment screen.
  cancellationReason: z.string().max(10000).optional(),
  // Sent by the app when it moves a booking. A move is always checked here, with or without it.
  checkConflicts: z.boolean().optional(),
  // The "Notify client" switch on a move: text the client the new day and time. It was missing here, so every move
  // with the switch on (its default) was refused as "Invalid input" (found 2026-11-03).
  notifyClient: z.boolean().optional(),
}).strict().refine(value => Object.keys(value).length > 0, "At least one field is required");
const cancelInput = z.object({
  notifyClient: z.boolean().default(false), reason: z.string().max(10000).optional(),
}).strict();

function invalid(res: Response, error: z.ZodError) {
  return res.status(400).json({ error: "Invalid input", details: error.issues.map(i => ({ field: i.path.join("."), message: i.message })) });
}
function unexpected(res: Response, error: unknown) {
  // Do not log request bodies, customer data, SQL parameters, or credentials.
  console.error("[certxa-pro] database operation failed", error instanceof Error ? error.name : "unknown error");
  return res.status(500).json({ error: "Internal server error" });
}
async function store(req: Request, res: Response): Promise<number | null> {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) res.status(403).json({ error: "No store context" });
  return storeId;
}

/**
 * The app is one person's calendar: the account owner's own staff record (users.staff_id). Bookings are listed
 * and made for that person only, never for another technician of the same business. Null when the account has
 * no staff record linked — then the whole business is the calendar.
 */
async function ownStaff(req: Request, storeId: number): Promise<number | null> {
  const bearer = req.headers.authorization;
  const userId = (bearer?.startsWith("Bearer ") ? verifySoloToken(bearer.slice(7))?.userId : undefined)
    ?? (req.session as { userId?: string } | undefined)?.userId;
  if (!userId) return null;
  const result = await pool.query(
    "SELECT s.id FROM users u JOIN staff s ON s.id=u.staff_id AND s.store_id=$2 WHERE u.id=$1", [userId, storeId]);
  return result.rows[0]?.id ?? null;
}

/** Is that time already taken on this calendar? The salon's gap between appointments is held on both sides. */
export async function timeTaken(storeId: number, staffId: number | null, start: string | Date, minutes: number, exceptId: number | null, visitAt?: string | null) {
  const buffer = await getBufferMinutes(storeId);
  // A house call holds its travel time on both sides; a house call being booked needs its own free too.
  const travel = await getHouseCallTravelMinutes(storeId);
  const need = neededWindow(new Date(start), new Date(new Date(start).getTime() + minutes * 60_000), visitAt, travel);
  const result = await pool.query(
    `SELECT 1 FROM appointments o WHERE o.store_id=$1 AND o.staff_id IS NOT DISTINCT FROM $2
      AND o.status NOT IN ('cancelled','no_show') AND ($3::int IS NULL OR o.id<>$3)
      AND o.date - make_interval(mins => CASE WHEN o.visit_at='client' THEN $7 ELSE 0 END) < $5::timestamptz + make_interval(mins => $6)
      AND o.date + make_interval(mins => o.duration + $6 + CASE WHEN o.visit_at='client' THEN $7 ELSE 0 END) > $4::timestamptz LIMIT 1`,
    [storeId, staffId, exceptId, need.start.toISOString(), need.end.toISOString(), buffer, travel]);
  return result.rows.length > 0;
}
const TAKEN = { error: "Another appointment is already booked at that time.", code: "TIME_TAKEN" };

// JSON shape shared by list, creation, update, and cancellation. Prices are dollars.
const appointmentSelect = `SELECT a.id, a.date, a.duration, a.status, a.notes, a.staff_id AS "staffId",
  a.visit_at AS "visitAt", a.client_address AS "clientAddress", a.travel_fee::float8 AS "travelFee",
  a.cancellation_reason AS "cancellationReason", a.cancelled_at AS "cancelledAt",
  -- A booking held until its deposit is paid (lib/bookingPaymentLinks.ts): shown in the app as "deposit due".
  a.payment_status AS "paymentStatus", a.calendar_hidden AS "calendarHidden",
  -- A deposit already paid comes off what checkout charges.
  a.deposit_collected::float8 AS "depositCollected",
  -- Further services on the visit and its add-ons: the app adds them to the price it charges.
  a.custom_lines AS "customLines",
  -- Paid: how, how much, and how much has been refunded since (Refund on a paid booking, 2026-11-03).
  a.payment_method AS "paymentMethod", a.total_paid::float8 AS "totalPaid",
  -- No-show / late-cancel fee: whether the client has a card on file to charge, the fee % and amount agreed at booking
  -- (lib/feeTerms.ts; older bookings: the shop's fee % and no amount), and a fee already charged.
  (COALESCE(a.stripe_payment_method_id, c.stripe_payment_method_id) IS NOT NULL) AS "cardOnFile",
  CASE WHEN a.fee_terms_at IS NOT NULL THEN a.fee_percent_agreed::float8
    ELSE (SELECT l.cancellation_fee_value::float8 FROM locations l WHERE l.id=a.store_id) END AS "feePercent",
  CASE WHEN a.fee_terms_at IS NOT NULL THEN COALESCE(a.fee_cents_agreed, 0) END AS "feeCents",
  a.fee_kind AS "feeKind", a.fee_charged_cents AS "feeChargedCents",
  (SELECT COALESCE(SUM(r.amount_cents), 0) FROM payment_refunds r WHERE r.appointment_id=a.id AND r.status IS DISTINCT FROM 'failed')::int AS "refundedCents",
  (SELECT COALESCE(json_agg(json_build_object('addon', json_build_object('id', ad.id, 'name', ad.name, 'price', ad.price::float8)) ORDER BY aa.id), '[]'::json)
    FROM appointment_addons aa JOIN addons ad ON ad.id=aa.addon_id WHERE aa.appointment_id=a.id) AS "appointmentAddons",
  json_build_object('id', COALESCE(c.id, 0), 'name', COALESCE(c.full_name, a.customer_name), 'avatarUrl', c.avatar_url,
    'phone', (SELECT COALESCE(p.display_phone, p.phone_number_e164) FROM client_phones p WHERE p.client_id=c.id ORDER BY p.is_primary DESC, p.id LIMIT 1),
    'email', (SELECT e.email_address FROM client_emails e WHERE e.client_id=c.id ORDER BY e.is_primary DESC, e.id LIMIT 1)) AS customer,
  json_build_object('id', s.id, 'name', s.name, 'duration', s.duration, 'price', s.price::float8) AS service
  -- A paid deposit when the client cancelled online: within the policy (refunded automatically) or late (kept).
  a.cancelled_in_policy AS "cancelledInPolicy", a.deposit_refunded_cents AS "depositRefundedCents", (a.deposit_refund_error IS NOT NULL) AS "depositRefundFailed",
  FROM appointments a LEFT JOIN clients c ON c.id=a.customer_id AND c.store_id=a.store_id
  -- LEFT: a POS quick sale has no service (service_id NULL); Home's "Taken today" counts it (2026-11-06).
  LEFT JOIN services s ON s.id=a.service_id AND s.store_id=a.store_id`;

async function appointment(appointmentId: number, storeId: number) {
  const result = await pool.query(`${appointmentSelect} WHERE a.id=$1 AND a.store_id=$2`, [appointmentId, storeId]);
  return result.rows[0] ?? null;
}

// Existing cookie-based web routes retain their full legacy shapes and behavior.
// A paid booking is locked to the calendar (owner, 2026-11-03): the app can't move, edit, cancel or delete it, or change
// its add-ons. Notes stay editable; a refund has its own route.
const PAID_STATUSES = new Set(["completed", "paid"]);
const PAID_LOCKED = { error: "This booking is paid, so it is locked: it can't be moved, edited, cancelled or deleted." };
async function isPaid(appointmentId: number, storeId: number): Promise<boolean> {
  const r = await pool.query(`SELECT status FROM appointments WHERE id=$1 AND store_id=$2`, [appointmentId, storeId]);
  return PAID_STATUSES.has(String(r.rows[0]?.status ?? ""));
}
function fromApp(req: Request): boolean {
  const bearer = req.headers.authorization;
  return !!bearer?.startsWith("Bearer ") && !!verifySoloToken(bearer.slice(7));
}

/**
 * The Certxa Pro app (its token), or the Solo dashboard on the website (owner, 2026-11-06; plans/solo-web-dashboard.md):
 * a Solo account signed in on the website whose page marks its requests with X-Certxa-Solo: 1. Both get the same
 * answers and the same rules (owner-only calendar, paid bookings locked). Salon dashboard pages never send the header,
 * so they keep the web API; the app's billing-only website sign-in never gets this.
 */
async function proClient(req: Request): Promise<boolean> {
  if (fromApp(req)) return true;
  if (req.headers["x-certxa-solo"] !== "1" || appWebLink(req)) return false;
  const session = req.session as { userId?: string; staffId?: number } | undefined;
  if (!session?.userId || session.staffId) return false;
  return isSoloUser(session.userId);
}

async function nativeOnly(req: Request, _res: Response, next: NextFunction) {
  // Staff retain the older permission-scoped API. The compact API is for
  // owner sessions and must not bypass staff customer/appointment restrictions.
  if ((req.session as { staffId?: number } | undefined)?.staffId) return next("router");
  try {
    if (!(await proClient(req))) return next("router");
  } catch {
    return next("router");
  }
  next();
}

// Cancellation is available to authenticated web sessions as well as native tokens.
router.post("/appointments/:id/cancel", isAuthenticated, async (req, res) => {
  const parsedId = id.safeParse(req.params.id);
  const parsed = cancelInput.safeParse(req.body ?? {});
  if (!parsedId.success) return invalid(res, parsedId.error);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const storeId = await store(req, res);
    if (!storeId) return;
    if (await proClient(req) && await isPaid(parsedId.data, storeId)) return res.status(409).json(PAID_LOCKED);
    const staffId = (req.session as { staffId?: number } | undefined)?.staffId;
    if (staffId) {
      const assigned = await pool.query(
        "SELECT id FROM appointments WHERE id=$1 AND store_id=$2 AND staff_id=$3",
        [parsedId.data, storeId, staffId],
      );
      if (!assigned.rows[0]) return res.status(404).json({ error: "Appointment not found" });
    }
    await pool.query(
      `UPDATE appointments SET status='cancelled', cancelled_at=COALESCE(cancelled_at, NOW()),
        cancellation_reason=COALESCE($3, cancellation_reason)
       WHERE id=$1 AND store_id=$2 AND status IS DISTINCT FROM 'cancelled' RETURNING id`,
      [parsedId.data, storeId, parsed.data.reason ?? null],
    );
    const record = await appointment(parsedId.data, storeId);
    if (!record) return res.status(404).json({ error: "Appointment not found" });
    // "Notify client": the cancellation text (2026-11-03; it was never sent before).
    let sent: { sent: boolean; reason?: string } = { sent: false, reason: "not requested" };
    if (parsed.data.notifyClient) {
      const full = await storage.getAppointment(parsedId.data);
      const { sendCancellationNotice } = await import("../sms");
      if (full) sent = await sendCancellationNotice(full as any).catch((e) => ({ sent: false, reason: String(e?.message ?? e) }));
    }
    return res.json({ appointment: record, notification: {
      requested: parsed.data.notifyClient,
      status: !parsed.data.notifyClient ? "not_requested" : sent.sent ? "sent" : "not_sent",
      ...(sent.sent || !parsed.data.notifyClient ? {} : { reason: sent.reason }),
    } });
  } catch (error) { return unexpected(res, error); }
});

// Legacy PATCH {status:'cancelled'} is accepted only for the shipped app version;
// new clients use POST /appointments/:id/cancel.
router.use(nativeOnly);
router.use(isAuthenticated);

// Deleting a booking and changing its add-ons are answered by the main routes; the app's paid lock comes first.
async function refuseWhenPaid(req: Request, res: Response, next: NextFunction) {
  const parsedId = id.safeParse(req.params.id);
  if (!parsedId.success) return next("router");
  try {
    const storeId = await store(req, res); if (!storeId) return;
    if (await isPaid(parsedId.data, storeId)) return res.status(409).json(PAID_LOCKED);
    return next("router");
  } catch (error) { return unexpected(res, error); }
}
router.delete("/appointments/:id", refuseWhenPaid);
router.post("/appointments/:id/addons", refuseWhenPaid);

router.get("/customers", async (req, res) => {
  try {
    const storeId = await store(req, res); if (!storeId) return;
    // The CRM list (plans/certxa-pro-crm.md): live visit numbers per client, counted like GET /api/clients/:id
    // (paid visits, a visit once however many tickets, spend without tips) — the clients table's own counters are stale.
    const rows = await pool.query(`SELECT c.id, c.full_name AS "fullName", c.full_name AS name,
      c.first_name AS "firstName", c.last_name AS "lastName", c.allergies, (c.client_status = 'vip') AS "isVip", c.avatar_url AS "avatarUrl",
      (SELECT COALESCE(p.display_phone,p.phone_number_e164) FROM client_phones p WHERE p.client_id=c.id ORDER BY p.is_primary DESC,p.id LIMIT 1) AS phone,
      (SELECT e.email_address FROM client_emails e WHERE e.client_id=c.id ORDER BY e.is_primary DESC,e.id LIMIT 1) AS email,
      (SELECT n.note_content FROM client_notes n WHERE n.client_id=c.id AND n.note_type='general' ORDER BY n.created_at DESC,n.id DESC LIMIT 1) AS notes,
      v.visits, v.spent_cents AS "spentCents", v.last_visit_at AS "lastVisitAt",
      (SELECT s.name FROM appointments a JOIN services s ON s.id=a.service_id
        WHERE a.customer_id=c.id AND a.store_id=c.store_id AND a.status IN ('completed','paid')
        ORDER BY COALESCE(a.completed_at,a.date) DESC LIMIT 1) AS "lastService",
      (SELECT a.date FROM appointments a WHERE a.customer_id=c.id AND a.store_id=c.store_id AND a.date >= now()
        AND a.status NOT IN ('cancelled','completed','paid','no_show') ORDER BY a.date LIMIT 1) AS "nextAppointmentAt",
      COALESCE((SELECT array_agg(t.tag_name ORDER BY t.tag_name) FROM client_tag_relationships r JOIN client_tags t ON t.id=r.tag_id
        WHERE r.client_id=c.id), '{}') AS tags
      FROM clients c
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT COALESCE(a.ticket_group_id,a.id))::int AS visits,
               -- Refunds come off what the client spent (owner, 2026-11-07).
               COALESCE(ROUND(SUM(CAST(a.total_paid AS DECIMAL(10,2)) - COALESCE(CAST(a.tip_amount AS DECIMAL(10,2)),0)
                 - (SELECT COALESCE(SUM(r.amount_cents),0)/100.0 FROM payment_refunds r WHERE r.appointment_id=a.id AND r.status IS DISTINCT FROM 'failed'))*100),0)::int AS spent_cents,
               MAX(COALESCE(a.completed_at,a.date)) AS last_visit_at
          -- A visit paid in the app is saved as 'paid' (it wasn't counted, so active clients looked inactive, 2026-11-04).
          FROM appointments a WHERE a.customer_id=c.id AND a.store_id=c.store_id AND a.status IN ('completed','paid')
      ) v ON true
      WHERE c.store_id=$1 AND c.archived_at IS NULL ORDER BY c.full_name,c.id`, [storeId]);
    return res.json(rows.rows);
  } catch (error) { return unexpected(res, error); }
});

router.post("/customers", async (req, res) => {
  const parsed = customerInput.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const created = await storage.createCustomer({ ...parsed.data, storeId });
    const rows = await pool.query(`SELECT c.id,c.full_name AS name,c.full_name AS "fullName",c.first_name AS "firstName",c.last_name AS "lastName",
      (SELECT COALESCE(p.display_phone,p.phone_number_e164) FROM client_phones p WHERE p.client_id=c.id ORDER BY p.is_primary DESC,p.id LIMIT 1) AS phone,
      (SELECT e.email_address FROM client_emails e WHERE e.client_id=c.id ORDER BY e.is_primary DESC,e.id LIMIT 1) AS email,
      (SELECT n.note_content FROM client_notes n WHERE n.client_id=c.id AND n.note_type='general' ORDER BY n.created_at DESC,n.id DESC LIMIT 1) AS notes
      FROM clients c WHERE c.id=$1 AND c.store_id=$2`, [created.id, storeId]);
    return res.status(201).json(rows.rows[0]);
  } catch (error) {
    if ((error as { code?: string }).code === "PHONE_DUPLICATE") return res.status(409).json({ error: "A customer with this phone already exists" });
    return unexpected(res, error);
  }
});

router.post("/quick-sales", async (req, res) => {
  const parsed = quickSaleInput.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const staffId = await ownStaff(req, storeId);
    const { customerId, amountCents, description } = parsed.data;
    const lines = [{ label: description || "Quick sale", price: amountCents / 100 }];
    const result = await pool.query(`INSERT INTO appointments (customer_id,store_id,duration,date,notes,status,staff_id,custom_lines,calendar_hidden,service_price)
      SELECT c.id,$2,1,now(),$3,'pending',$4,$5::jsonb,true,$6 FROM clients c
      WHERE c.id=$1 AND c.store_id=$2 AND c.archived_at IS NULL RETURNING id`,
      [customerId, storeId, "Quick sale (Certxa Pro POS)", staffId, JSON.stringify(lines), (amountCents / 100).toFixed(2)]);
    if (!result.rows[0]) return res.status(400).json({ error: "Client not found in this business" });
    return res.status(201).json({ id: result.rows[0].id });
  } catch (error) { return unexpected(res, error); }
});

// A quick sale whose card payment did not go through: removed, so no unpaid ticket is left behind.
// Only an unpaid quick sale can be removed this way.
router.delete("/quick-sales/:id", async (req, res) => {
  const parsed = id.safeParse(req.params.id);
  if (!parsed.success) return res.status(400).json({ error: "Invalid sale" });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const removed = await pool.query(`DELETE FROM appointments WHERE id=$1 AND store_id=$2 AND service_id IS NULL AND calendar_hidden=true
      AND status='pending' AND notes='Quick sale (Certxa Pro POS)' AND total_paid IS NULL AND stripe_payment_intent_id IS NULL RETURNING id`,
      [parsed.data, storeId]);
    return removed.rows[0] ? res.json({ removed: true }) : res.status(409).json({ error: "This sale can't be removed" });
  } catch (error) { return unexpected(res, error); }
});

router.get("/services", async (req, res) => {
  try {
    const storeId = await store(req, res); if (!storeId) return;
    // allowQuantity: the Services edit screen shows and saves it (it was missing, so saving a service turned it off, 2026-11-07).
    const rows = await pool.query(`SELECT id,name,duration,price::float8 AS price,offered_at AS "offeredAt",category_id AS "categoryId",category,allow_quantity AS "allowQuantity" FROM services WHERE store_id=$1 AND is_active=true ORDER BY name,id`, [storeId]);
    return res.json(rows.rows);
  } catch (error) { return unexpected(res, error); }
});

router.get("/appointments", async (req, res) => {
  const dates = z.object({ from: date.optional(), to: date.optional() }).safeParse(req.query);
  if (!dates.success) return invalid(res, dates.error);
  if (dates.data.from && dates.data.to && Date.parse(dates.data.from) > Date.parse(dates.data.to))
    return res.status(400).json({ error: "from must not be after to" });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const staffId = await ownStaff(req, storeId);
    const rows = await pool.query(`${appointmentSelect} WHERE a.store_id=$1
      AND ($2::timestamptz IS NULL OR a.date >= $2::timestamptz)
      AND ($3::timestamptz IS NULL OR a.date <= $3::timestamptz)
      AND ($4::int IS NULL OR a.staff_id=$4) ORDER BY a.date,a.id`,
      [storeId, dates.data.from ?? null, dates.data.to ?? null, staffId]);
    return res.json(rows.rows);
  } catch (error) { return unexpected(res, error); }
});

router.post("/appointments", async (req, res) => {
  const parsed = appointmentInput.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const { customerId, serviceId, duration, date: when, notes, customLines, visitAt } = parsed.data;
    const staffId = await ownStaff(req, storeId);
    // A house call the professional books themselves: the address must be real and they must do house calls,
    // but they may travel further than the radius their clients can book online.
    let houseCall: { address: ClientAddress; travelFee: number } | null = null;
    if (visitAt === "client") {
      const check = await checkHouseCall(storeId, parsed.data.clientAddress, { enforceRadius: false });
      if (!check.ok) return res.status(400).json({ error: check.message, code: "HOUSE_CALL" });
      houseCall = { address: check.address, travelFee: check.travelFee };
    }
    if (await timeTaken(storeId, staffId, when, duration, null, visitAt)) return res.status(409).json(TAKEN);
    const result = await pool.query(`INSERT INTO appointments (customer_id,service_id,store_id,duration,date,notes,status,staff_id,custom_lines,visit_at,client_address,travel_fee)
      SELECT c.id,s.id,$3,$4,$5::timestamptz,$6,'pending',$7,$8::jsonb,$9,$10::jsonb,$11 FROM clients c CROSS JOIN services s
      WHERE c.id=$1 AND c.store_id=$3 AND c.archived_at IS NULL AND s.id=$2 AND s.store_id=$3 AND s.is_active=true RETURNING id`,
      [customerId, serviceId, storeId, duration, when, notes ?? null, staffId, customLines?.length ? JSON.stringify(customLines) : null,
       houseCall ? "client" : "place", houseCall ? JSON.stringify(houseCall.address) : null, houseCall ? houseCall.travelFee.toFixed(2) : null]);
    if (!result.rows[0]) return res.status(400).json({ error: "Customer or service not found in this store" });
    if (houseCall) await saveClientAddress(customerId, houseCall.address);
    return res.status(201).json(await appointment(result.rows[0].id, storeId));
  } catch (error) { return unexpected(res, error); }
});

router.patch("/appointments/:id", async (req, res, next) => {
  // Mark as paid (status 'completed' with the payment) is the full checkout: the main appointment route records the
  // sale, commission and loyalty and sends the review text (2026-11-03: this route refused it, so nothing was paid).
  if (req.body?.status === "completed") return next("router");
  const parsedId = id.safeParse(req.params.id);
  const parsed = updateInput.safeParse(req.body);
  if (!parsedId.success) return invalid(res, parsedId.error);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const current = await appointment(parsedId.data, storeId);
    if (!current) return res.status(404).json({ error: "Appointment not found" });
    if (current.status === "cancelled")
      return res.status(409).json({ error: "Cancelled appointments cannot be restored or checked out" });
    if (PAID_STATUSES.has(String(current.status)) && Object.keys(parsed.data).some((key) => key !== "notes"))
      return res.status(409).json(PAID_LOCKED);
    if (parsed.data.status === "cancelled" &&
        Object.keys(parsed.data).some(key => key !== "status" && key !== "cancellationReason"))
      return res.status(400).json({ error: "Use the cancellation endpoint separately from appointment edits" });
    if (parsed.data.serviceId !== undefined) {
      const service = await pool.query("SELECT id FROM services WHERE id=$1 AND store_id=$2 AND is_active=true", [parsed.data.serviceId, storeId]);
      if (!service.rows[0]) return res.status(400).json({ error: "Service not found in this store" });
    }
    // A new time or a longer visit must not land on another booking of the same calendar. (An edit that leaves
    // both alone is never refused, even when the booking already overlaps one made elsewhere.)
    const moved = parsed.data.date !== undefined && new Date(parsed.data.date).getTime() !== new Date(current.date).getTime();
    const longer = parsed.data.duration !== undefined && parsed.data.duration > Number(current.duration);
    if (parsed.data.status !== "cancelled" && (moved || longer) &&
        await timeTaken(storeId, current.staffId ?? null, parsed.data.date ?? current.date, parsed.data.duration ?? Number(current.duration), parsedId.data, current.visitAt))
      return res.status(409).json(TAKEN);
    if (parsed.data.status === "cancelled") {
      await pool.query(`UPDATE appointments SET status='cancelled',
        cancelled_at=COALESCE(cancelled_at,NOW()), cancellation_reason=COALESCE($3,cancellation_reason)
        WHERE id=$1 AND store_id=$2 AND status IS DISTINCT FROM 'cancelled' RETURNING id`,
        [parsedId.data, storeId, parsed.data.cancellationReason ?? null]);
      return res.json(await appointment(parsedId.data, storeId));
    }
    const fields: Record<string, string> = { date: "date", serviceId: "service_id", duration: "duration", status: "status", notes: "notes" };
    if (parsed.data.customLines !== undefined) {
      await pool.query(`UPDATE appointments SET custom_lines=$3::jsonb WHERE id=$1 AND store_id=$2 AND status IS DISTINCT FROM 'cancelled'`,
        [parsedId.data, storeId, JSON.stringify(parsed.data.customLines)]);
    }
    const entries = Object.entries(parsed.data).filter(([key]) => key in fields);
    if (entries.length) {
      const values = entries.map(([, value]) => value);
      const result = await pool.query(`UPDATE appointments SET ${entries.map(([key], index) => `${fields[key]}=$${index + 3}`).join(",")}
        WHERE id=$1 AND store_id=$2 AND status IS DISTINCT FROM 'cancelled'`, [parsedId.data, storeId, ...values]);
      if (result.rowCount === 0) return res.status(409).json({ error: "Appointment was cancelled during update" });
    }
    // A real move: kept in the booking's history, and the client texted when the pro asked to (as the website's route).
    if (moved) {
      void pool.query(
        `INSERT INTO appointment_events (store_id, appointment_id, event_type, actor_user_id, metadata) VALUES ($1,$2,'rescheduled',$3,$4)`,
        [storeId, parsedId.data, (req.session as { userId?: string } | undefined)?.userId ?? null,
          JSON.stringify({ previousDate: current.date, newDate: parsed.data.date })],
      ).catch((e: any) => console.error("[aptEvents] reschedule:", e?.message));
      if (parsed.data.notifyClient === true) {
        void storage.getAppointment(parsedId.data)
          .then(async (full) => (full ? (await import("../sms")).sendRescheduleNotice(full as any) : { sent: false, reason: "not found" }))
          .then((r) => { if (!r.sent) console.log(`[SMS] reschedule notice for appointment ${parsedId.data} not sent: ${r.reason}`); })
          .catch((e: any) => console.error("[SMS] reschedule notice:", e?.message));
      }
    }
    return res.json(await appointment(parsedId.data, storeId));
  } catch (error) { return unexpected(res, error); }
});

// ── Before/after photos on a client (owner, 2026-11-03): private to the business. Sent as base64 (a file upload from
// the phone never reached the server), stored in R2 under an unguessable name. ──
const photoInput = z.object({
  clientId: id, data: z.string().min(100).max(9_000_000), mimeType: z.enum(["image/jpeg", "image/png"]),
  kind: z.enum(["before", "after"]).nullable().optional(), appointmentId: id.nullable().optional(), note: z.string().trim().max(200).optional(),
}).strict();
const photoJson = (r: any) => ({ id: r.id, url: r.url, kind: r.kind ?? null, appointmentId: r.appointment_id ?? null, note: r.note ?? null,
  onWebsite: r.gallery_photo_id != null, createdAt: new Date(r.created_at).toISOString() });
router.get("/client-photos", async (req, res) => {
  const clientId = id.safeParse(req.query.clientId);
  if (!clientId.success) return invalid(res, clientId.error);
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const r = await pool.query(`SELECT * FROM client_photos WHERE store_id=$1 AND client_id=$2 ORDER BY created_at DESC LIMIT 200`, [storeId, clientId.data]);
    return res.json(r.rows.map(photoJson));
  } catch (error) { return unexpected(res, error); }
});
router.post("/client-photos", async (req, res) => {
  const parsed = photoInput.safeParse(req.body ?? {});
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const owned = await pool.query(`SELECT 1 FROM clients WHERE id=$1 AND store_id=$2`, [parsed.data.clientId, storeId]);
    if (!owned.rows[0]) return res.status(404).json({ error: "Client not found" });
    const buffer = Buffer.from(parsed.data.data.replace(/^data:[^,]+,/, ""), "base64");
    if (buffer.length < 100) return res.status(400).json({ error: "That photo could not be read." });
    const { uploadToR2 } = await import("../lib/r2.js");
    const url = await uploadToR2(buffer, "client-photos", parsed.data.mimeType === "image/png" ? "photo.png" : "photo.jpg", parsed.data.mimeType);
    const r = await pool.query(`INSERT INTO client_photos (store_id, client_id, appointment_id, kind, url, note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [storeId, parsed.data.clientId, parsed.data.appointmentId ?? null, parsed.data.kind ?? null, url, parsed.data.note || null]);
    return res.status(201).json(photoJson(r.rows[0]));
  } catch (error) { return unexpected(res, error); }
});
// A client photo on the pro's own website gallery (owner, 2026-11-03: their Certxa website, never Google), or off it.
router.post("/client-photos/:id/website", async (req, res) => {
  const parsedId = id.safeParse(req.params.id);
  if (!parsedId.success) return invalid(res, parsedId.error);
  const show = req.body?.show !== false;
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const p = (await pool.query(`SELECT * FROM client_photos WHERE id=$1 AND store_id=$2`, [parsedId.data, storeId])).rows[0];
    if (!p) return res.status(404).json({ error: "Not found" });
    if (show && p.gallery_photo_id == null) {
      const g = await pool.query(`INSERT INTO wb_gallery_photos (store_id, image_url, caption, show_on_website, sort_order)
        VALUES ($1,$2,$3,true,(SELECT COALESCE(MIN(sort_order),0)-1 FROM wb_gallery_photos WHERE store_id=$1)) RETURNING id`,
        [storeId, p.url, p.kind === "after" ? "After" : p.kind === "before" ? "Before" : null]);
      await pool.query(`UPDATE client_photos SET gallery_photo_id=$2 WHERE id=$1`, [p.id, g.rows[0].id]);
    } else if (!show && p.gallery_photo_id != null) {
      await pool.query(`DELETE FROM wb_gallery_photos WHERE id=$1 AND store_id=$2`, [p.gallery_photo_id, storeId]);
      await pool.query(`UPDATE client_photos SET gallery_photo_id=NULL WHERE id=$1`, [p.id]);
    }
    return res.json(photoJson((await pool.query(`SELECT * FROM client_photos WHERE id=$1`, [p.id])).rows[0]));
  } catch (error) { return unexpected(res, error); }
});

// ── Portfolio: the photos on the pro's website gallery (wb_gallery_photos; shown by the Bloom design). ──
const portfolioJson = (r: any) => ({ id: r.id, url: r.image_url, caption: r.caption ?? null, serviceId: r.service_id ?? null, createdAt: new Date(r.created_at).toISOString() });
router.get("/portfolio", async (req, res) => {
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const r = await pool.query(`SELECT * FROM wb_gallery_photos WHERE store_id=$1 AND show_on_website ORDER BY sort_order, created_at DESC LIMIT 200`, [storeId]);
    return res.json(r.rows.map(portfolioJson));
  } catch (error) { return unexpected(res, error); }
});
const portfolioInput = z.object({ data: z.string().min(100).max(9_000_000), mimeType: z.enum(["image/jpeg", "image/png"]), caption: z.string().trim().max(120).optional() }).strict();
router.post("/portfolio", async (req, res) => {
  const parsed = portfolioInput.safeParse(req.body ?? {});
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const buffer = Buffer.from(parsed.data.data.replace(/^data:[^,]+,/, ""), "base64");
    if (buffer.length < 100) return res.status(400).json({ error: "That photo could not be read." });
    const { uploadToR2 } = await import("../lib/r2.js");
    const url = await uploadToR2(buffer, "gallery", parsed.data.mimeType === "image/png" ? "photo.png" : "photo.jpg", parsed.data.mimeType);
    const r = await pool.query(`INSERT INTO wb_gallery_photos (store_id, image_url, caption, show_on_website, sort_order)
      VALUES ($1,$2,$3,true,(SELECT COALESCE(MIN(sort_order),0)-1 FROM wb_gallery_photos WHERE store_id=$1)) RETURNING *`, [storeId, url, parsed.data.caption || null]);
    return res.status(201).json(portfolioJson(r.rows[0]));
  } catch (error) { return unexpected(res, error); }
});
// "Book this look": the service a photo shows, offered on the website's Portfolio (owner, 2026-11-04). null clears it.
router.patch("/portfolio/:id", async (req, res) => {
  const parsedId = id.safeParse(req.params.id);
  const body = z.object({ serviceId: id.nullable() }).strict().safeParse(req.body ?? {});
  if (!parsedId.success) return invalid(res, parsedId.error);
  if (!body.success) return invalid(res, body.error);
  try {
    const storeId = await store(req, res); if (!storeId) return;
    if (body.data.serviceId != null) {
      const ok = await pool.query(`SELECT 1 FROM services WHERE id=$1 AND store_id=$2`, [body.data.serviceId, storeId]);
      if (!ok.rows.length) return res.status(400).json({ error: "Choose one of your services." });
    }
    const r = await pool.query(`UPDATE wb_gallery_photos SET service_id=$3 WHERE id=$1 AND store_id=$2 RETURNING *`, [parsedId.data, storeId, body.data.serviceId]);
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    return res.json(portfolioJson(r.rows[0]));
  } catch (error) { return unexpected(res, error); }
});
router.delete("/portfolio/:id", async (req, res) => {
  const parsedId = id.safeParse(req.params.id);
  if (!parsedId.success) return invalid(res, parsedId.error);
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const r = await pool.query(`DELETE FROM wb_gallery_photos WHERE id=$1 AND store_id=$2`, [parsedId.data, storeId]);
    if (!r.rowCount) return res.status(404).json({ error: "Not found" });
    await pool.query(`UPDATE client_photos SET gallery_photo_id=NULL WHERE gallery_photo_id=$1`, [parsedId.data]);
    return res.status(204).end();
  } catch (error) { return unexpected(res, error); }
});

// Delete a client for good: the app's press-and-hold button is the confirmation (lib/deleteClient.ts).
router.delete("/pro/clients/:id", async (req, res) => {
  const parsedId = id.safeParse(req.params.id);
  if (!parsedId.success) return invalid(res, parsedId.error);
  const storeId = await store(req, res); if (!storeId) return;
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await deleteClientRecord(db, storeId, parsedId.data);
    await db.query(result.ok ? "COMMIT" : "ROLLBACK");
    return result.ok ? res.status(204).end() : res.status(result.status).json({ message: result.message });
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    console.error("[certxa-pro] client delete failed:", (error as Error)?.message);
    return res.status(500).json({ message: "The client could not be deleted." });
  } finally {
    db.release();
  }
});

router.delete("/client-photos/:id", async (req, res) => {
  const parsedId = id.safeParse(req.params.id);
  if (!parsedId.success) return invalid(res, parsedId.error);
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const r = await pool.query(`DELETE FROM client_photos WHERE id=$1 AND store_id=$2 RETURNING gallery_photo_id, client_id, url`, [parsedId.data, storeId]);
    if (!r.rowCount) return res.status(404).json({ error: "Not found" });
    // It was the client's profile photo: back to their initials.
    await pool.query(`UPDATE clients SET avatar_url=NULL WHERE id=$1 AND store_id=$2 AND avatar_url=$3`, [r.rows[0].client_id, storeId, r.rows[0].url]);
    // Removed from the client's profile: off the website too.
    if (r.rows[0].gallery_photo_id) await pool.query(`DELETE FROM wb_gallery_photos WHERE id=$1 AND store_id=$2`, [r.rows[0].gallery_photo_id, storeId]);
    return res.status(204).end();
  } catch (error) { return unexpected(res, error); }
});

// ── Repeat a booking (owner, 2026-11-03): the same visit every 1–4 weeks, the same time of day (in the business's own
// time zone, so a daylight-saving change doesn't move it), up to 12 times in all. A date that clashes with another
// booking or blocked time is skipped and listed. ──
const repeatInput = z.object({ everyWeeks: z.number().int().min(1).max(4), times: z.number().int().min(2).max(12) }).strict();
router.post("/appointments/:id/repeat", async (req, res) => {
  const parsedId = id.safeParse(req.params.id);
  const parsed = repeatInput.safeParse(req.body ?? {});
  if (!parsedId.success) return invalid(res, parsedId.error);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const src = (await pool.query(`SELECT a.*, COALESCE(l.timezone, 'UTC') AS tz FROM appointments a JOIN locations l ON l.id=a.store_id
        WHERE a.id=$1 AND a.store_id=$2`, [parsedId.data, storeId])).rows[0];
    if (!src) return res.status(404).json({ error: "Appointment not found" });
    if (src.status === "cancelled" || src.status === "no_show") return res.status(409).json({ error: "This booking is closed." });
    const addons = (await pool.query(`SELECT addon_id FROM appointment_addons WHERE appointment_id=$1`, [src.id])).rows.map((r: any) => Number(r.addon_id));
    const wall = formatInTimeZone(new Date(src.date), src.tz, "yyyy-MM-dd'T'HH:mm:ss");
    const created: string[] = [], skipped: string[] = [];
    for (let k = 1; k < parsed.data.times; k++) {
      const day = new Date(`${wall.slice(0, 10)}T12:00:00Z`);
      day.setUTCDate(day.getUTCDate() + k * parsed.data.everyWeeks * 7);
      const when = fromZonedTime(`${day.toISOString().slice(0, 10)}${wall.slice(10)}`, src.tz);
      const end = new Date(when.getTime() + Number(src.duration) * 60_000);
      const blocked = (await pool.query(`SELECT 1 FROM time_blocks WHERE store_id=$1 AND (staff_id IS NULL OR staff_id=$2) AND starts_at < $4 AND ends_at > $3 LIMIT 1`,
        [storeId, src.staff_id, when, end])).rows.length > 0;
      if (blocked || await timeTaken(storeId, src.staff_id ?? null, when, Number(src.duration), null, src.visit_at)) { skipped.push(when.toISOString()); continue; }
      const r = await pool.query(`INSERT INTO appointments (customer_id,service_id,store_id,duration,date,notes,status,staff_id,custom_lines,visit_at,client_address,travel_fee)
        VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8::jsonb,$9,$10::jsonb,$11) RETURNING id`,
        [src.customer_id, src.service_id, storeId, src.duration, when, src.notes ?? null, src.staff_id, src.custom_lines ? JSON.stringify(src.custom_lines) : null,
         src.visit_at ?? "place", src.client_address ? JSON.stringify(src.client_address) : null, src.travel_fee]);
      if (addons.length) await pool.query(`INSERT INTO appointment_addons (appointment_id, addon_id) SELECT $1, unnest($2::int[])`, [r.rows[0].id, addons]);
      created.push(when.toISOString());
    }
    return res.status(201).json({ created, skipped });
  } catch (error) { return unexpected(res, error); }
});

// ── Blocked time: personal time and days off (owner, 2026-11-03). On the owner's own calendar; online booking offers no
// time inside a block (routes.ts openTimesForDay). ──
const blockInput = z.object({
  startsAt: date, endsAt: date, allDay: z.boolean().default(false), note: z.string().trim().max(120).optional(),
}).strict().refine((b) => Date.parse(b.endsAt) > Date.parse(b.startsAt), "The end has to be after the start")
  .refine((b) => Date.parse(b.endsAt) - Date.parse(b.startsAt) <= 31 * 86_400_000, "Block at most 31 days at a time");
const blockJson = (r: any) => ({ id: r.id, startsAt: new Date(r.starts_at).toISOString(), endsAt: new Date(r.ends_at).toISOString(), allDay: r.all_day, note: r.note ?? null });
router.get("/time-blocks", async (req, res) => {
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const from = Date.parse(String(req.query.from ?? "")), to = Date.parse(String(req.query.to ?? ""));
    if (!Number.isFinite(from) || !Number.isFinite(to)) return res.status(400).json({ error: "from and to are required" });
    const staffId = await ownStaff(req, storeId);
    const r = await pool.query(`SELECT * FROM time_blocks WHERE store_id=$1 AND ($2::int IS NULL OR staff_id IS NULL OR staff_id=$2)
        AND starts_at < $4 AND ends_at > $3 ORDER BY starts_at`, [storeId, staffId, new Date(from), new Date(to)]);
    return res.json(r.rows.map(blockJson));
  } catch (error) { return unexpected(res, error); }
});
router.post("/time-blocks", async (req, res) => {
  const parsed = blockInput.safeParse(req.body ?? {});
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const staffId = await ownStaff(req, storeId);
    const r = await pool.query(`INSERT INTO time_blocks (store_id, staff_id, starts_at, ends_at, all_day, note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [storeId, staffId, parsed.data.startsAt, parsed.data.endsAt, parsed.data.allDay, parsed.data.note || null]);
    return res.status(201).json(blockJson(r.rows[0]));
  } catch (error) { return unexpected(res, error); }
});
router.delete("/time-blocks/:id", async (req, res) => {
  const parsedId = id.safeParse(req.params.id);
  if (!parsedId.success) return invalid(res, parsedId.error);
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const r = await pool.query(`DELETE FROM time_blocks WHERE id=$1 AND store_id=$2`, [parsedId.data, storeId]);
    if (!r.rowCount) return res.status(404).json({ error: "Not found" });
    return res.status(204).end();
  } catch (error) { return unexpected(res, error); }
});

// ── No-show, and the no-show / late-cancel fee (owner, 2026-10-22 and 11-03) ──
// A client who didn't come: the booking stays, marked no_show (the client's profile counts it). Nothing is texted.
router.post("/appointments/:id/no-show", async (req, res) => {
  const parsedId = id.safeParse(req.params.id);
  if (!parsedId.success) return invalid(res, parsedId.error);
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const r = await pool.query(`UPDATE appointments SET status='no_show' WHERE id=$1 AND store_id=$2
        AND status NOT IN ('completed','cancelled','no_show') RETURNING id`, [parsedId.data, storeId]);
    if (!r.rowCount) {
      const current = await appointment(parsedId.data, storeId);
      if (!current) return res.status(404).json({ error: "Appointment not found" });
      return res.status(409).json({ error: current.status === "completed" ? "This booking is paid." : "This booking is already closed." });
    }
    // The no-show fee is charged right away when the client has a card on file and agreed to a fee (owner, 2026-11-07).
    // A declined card leaves the booking a no-show; feeError says why, and Charge fee tries again.
    const fee = await chargeBookingFee(storeId, parsedId.data);
    const feeError = !fee.ok && fee.status === 402 ? fee.error : null;
    return res.json({ ...(await appointment(parsedId.data, storeId)), feeError });
  } catch (error) { return unexpected(res, error); }
});

// The no-show / late-cancel fee, to the card the client saved when booking online. Once per booking. Charged when
// the pro marks a no-show (owner, 2026-11-07), or when the pro taps Charge fee (a cancelled booking, or a retry after
// a declined card). The amount is the one saved with the booking when the client booked (lib/feeTerms.ts): a policy
// changed since never changes it. Older bookings without saved terms use the shop's fee % of the booking's price.
type FeeOutcome = { ok: true } | { ok: false; status: 402 | 404 | 409; error: string };
async function chargeBookingFee(storeId: number, appointmentId: number): Promise<FeeOutcome> {
  const a = (await pool.query(
    `SELECT a.id, a.status, a.fee_charged_cents, a.service_id, a.custom_lines, a.travel_fee, a.deposit_collected, a.payment_status,
            COALESCE(a.stripe_customer_id, c.stripe_customer_id) AS customer, COALESCE(a.stripe_payment_method_id, c.stripe_payment_method_id) AS pm,
            (SELECT s.price FROM services s WHERE s.id=a.service_id) AS service_price,
            (SELECT COALESCE(SUM(ad.price),0) FROM appointment_addons aa JOIN addons ad ON ad.id=aa.addon_id WHERE aa.appointment_id=a.id) AS addons
       FROM appointments a LEFT JOIN clients c ON c.id=a.customer_id WHERE a.id=$1 AND a.store_id=$2`, [appointmentId, storeId])).rows[0];
  if (!a) return { ok: false, status: 404, error: "Appointment not found" };
  if (a.status !== "no_show" && a.status !== "cancelled") return { ok: false, status: 409, error: "Mark the booking as a no-show or cancel it first." };
  if (a.fee_charged_cents != null) return { ok: false, status: 409, error: "A fee was already charged for this booking." };
  const { agreedFee } = await import("../lib/feeTerms");
  const terms = await agreedFee(a.id);
  const pct = terms?.percent ?? 0;
  if (pct <= 0) return { ok: false, status: 409, error: terms?.saved ? "No cancellation or no-show fee was agreed when this booking was made." : "Set a fee in Settings › Cancellation policy first." };
  if (!a.customer || !a.pm) return { ok: false, status: 409, error: "This client has no card on file." };
  const lines = Array.isArray(a.custom_lines) ? a.custom_lines : [];
  const total = (Number(a.service_price) || 0) + (Number(a.addons) || 0) + lines.reduce((n: number, l: any) => n + (Number(l?.price) || 0), 0);
  // A paid deposit is the penalty: it is kept, and no fee is charged on top (owner, 2026-11-07).
  if (Number(a.deposit_collected) > 0 && a.payment_status !== "awaiting_payment") return { ok: false, status: 409, error: "The client's deposit is kept for this booking, so no fee is charged." };
  const feeCents = terms?.cents ?? Math.round(total * pct);
  if (feeCents < 50) return { ok: false, status: 409, error: "The fee would be under $0.50, which can't be charged." };
  const kind = a.status === "no_show" ? "no_show" : "late_cancel";
  const { chargeCancellationFee } = await import("../lib/cancellationFee");
  let piId: string;
  try {
    piId = await chargeCancellationFee({ storeId, appointmentId: a.id, stripeCustomerId: a.customer, stripePaymentMethodId: a.pm, feeCents, kind });
  } catch (err: any) {
    return { ok: false, status: 402, error: err?.raw?.message || err?.message || "The client's card was declined." };
  }
  await pool.query(`UPDATE appointments SET fee_kind=$3, fee_charged_cents=$4, fee_payment_intent=$5, fee_charged_at=now()
    WHERE id=$1 AND store_id=$2 AND fee_charged_cents IS NULL`, [a.id, storeId, kind, feeCents, piId]);
  return { ok: true };
}

router.post("/appointments/:id/fee", async (req, res) => {
  const parsedId = id.safeParse(req.params.id);
  if (!parsedId.success) return invalid(res, parsedId.error);
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const outcome = await chargeBookingFee(storeId, parsedId.data);
    if (!outcome.ok) return res.status(outcome.status).json({ error: outcome.error });
    return res.json(await appointment(parsedId.data, storeId));
  } catch (error) { return unexpected(res, error); }
});

// One booking, in the same shape as the list: a review opens the booking it was left for (owner, 2026-11-03), which
// may be outside the month the app has loaded.
router.get("/appointments/:id", async (req, res, next) => {
  const parsedId = id.safeParse(req.params.id);
  if (!parsedId.success) return next("router");
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const row = await appointment(parsedId.data, storeId);
    // Not a booking with a service (a POS quick sale), or not found: the main route answers, as before.
// The "Available for services" hours grid was removed (owner, 2026-11-07): business hours decide. App builds before
// "Build Nov 7 · F" still load and save their Hours screen through these two; they say business hours and accept a
// business-hours save, and refuse the grid. Delete both once every phone has that app update.
router.get("/pro/service-hours", (_req, res) => res.json({ mode: "business", hours: [[], [], [], [], [], [], []] }));
router.put("/pro/service-hours", (req, res) => {
  if (req.body?.mode === "business") return res.status(204).end();
  return res.status(410).json({ error: "Available for services was removed. Set your business hours instead." });
});

// A house call's plan: when to leave and from where, setup, and when they're done (lib/routePlanner.ts).
router.get("/pro/appointments/:id/route", async (req, res) => {
  const parsedId = id.safeParse(req.params.id);
  if (!parsedId.success) return invalid(res, parsedId.error);
  try {
    const storeId = await store(req, res); if (!storeId) return;
    return res.json(await routeForAppointment(storeId, parsedId.data));
  } catch (error) { return unexpected(res, error); }
});

    if (!row) return next("router");
    return res.json(row);
  } catch (error) { return unexpected(res, error); }
});

// ── Refund a paid booking (owner, 2026-11-03): full or partial. A card payment goes back to the card through Stripe; a
// booking marked as paid (cash) is recorded as cash handed back. The booking stays paid and shows what was refunded;
// reports take refunds off (payment_refunds). One refund at a time per booking (advisory lock), never more than paid.
const refundInput = z.object({
  amountCents: z.number().int().positive().max(10_000_000).nullable().optional(),
  reason: z.string().trim().max(200).optional(),
  idempotencyKey: z.string().trim().min(8).max(80),
}).strict();
const CARD_METHODS = new Set(["card", "tap_to_pay", "card_present", "m2", "terminal"]);
router.post("/appointments/:id/refund", async (req, res) => {
  const parsedId = id.safeParse(req.params.id);
  const parsed = refundInput.safeParse(req.body ?? {});
  if (!parsedId.success) return invalid(res, parsedId.error);
  if (!parsed.success) return invalid(res, parsed.error);
  const client = await pool.connect();
  try {
    const storeId = await store(req, res); if (!storeId) return;
    await client.query("SELECT pg_advisory_lock(hashtext('pro_refund'), $1)", [parsedId.data]);
    try {
      const a = (await client.query(`SELECT id, status, payment_method, total_paid, stripe_payment_intent_id FROM appointments WHERE id=$1 AND store_id=$2`,
        [parsedId.data, storeId])).rows[0];
      if (!a) return res.status(404).json({ error: "Appointment not found" });
      // A booking an older app build marked "paid" recorded no payment (no amount, no method): there is nothing to refund.
      if (a.status === "paid" && a.total_paid == null) return res.status(409).json({ error: "No payment was recorded for this booking, so there's nothing to refund.", code: "NO_PAYMENT_RECORDED" });
      if (a.status !== "completed" || a.total_paid == null) return res.status(409).json({ error: "Only a paid booking can be refunded." });
      const refunded = Number((await client.query(`SELECT COALESCE(SUM(amount_cents), 0) AS c FROM payment_refunds WHERE appointment_id=$1 AND status IS DISTINCT FROM 'failed'`,
        [a.id])).rows[0].c) || 0;
      const remaining = Math.round(Number(a.total_paid) * 100) - refunded;
      if (remaining <= 0) return res.status(409).json({ error: "This booking has already been refunded in full." });
      const amount = parsed.data.amountCents ?? remaining;
      if (amount > remaining) return res.status(400).json({ error: `At most $${(remaining / 100).toFixed(2)} can be refunded.` });
      const userId = (req.session as { userId?: string } | undefined)?.userId ?? null;
      const card = CARD_METHODS.has(String(a.payment_method ?? "").toLowerCase());
      let refundId: string, piId: string | null = a.stripe_payment_intent_id ?? null, status = "succeeded";
      if (card) {
        const { getPaymentAccount, refundCardPayment } = await import("../lib/stripeConnect");
        const account = await getPaymentAccount(storeId);
        if (!account?.providerAccountId) return res.status(409).json({ error: "Your Stripe account isn't connected, so a card refund can't be made." });
        const r = await refundCardPayment(account.providerAccountId, {
          paymentIntentId: piId, appointmentId: a.id, amountCents: amount, reason: parsed.data.reason ?? null,
          idempotencyKey: `pro_refund_${a.id}_${parsed.data.idempotencyKey}`,
        });
        refundId = r.refundId; piId = r.paymentIntentId; status = r.status;
      } else {
        refundId = `cash_${a.id}_${parsed.data.idempotencyKey}`;
      }
      await client.query(`INSERT INTO payment_refunds (store_id, appointment_id, stripe_refund_id, stripe_payment_intent, amount_cents, status, reason, created_by_user_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (stripe_refund_id) DO NOTHING`,
        [storeId, a.id, refundId, piId, amount, status, parsed.data.reason ?? null, userId]);
      return res.json({ ...(await appointment(a.id, storeId)), refund: { amountCents: amount, method: card ? "card" : "cash", status } });
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext('pro_refund'), $1)", [parsedId.data]).catch(() => {});
    }
  } catch (error: any) {
    if (error?.type?.startsWith?.("Stripe") || error?.status === 404) return res.status(error?.status === 404 ? 404 : 502).json({ error: error?.message || "Stripe couldn't make the refund." });
    return unexpected(res, error);
  } finally {
    client.release();
  }
});

export default router;
