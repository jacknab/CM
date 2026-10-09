/** Compact, store-scoped Certxa Pro native API. The existing web API remains unchanged. */
import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { verifySoloToken } from "../lib/soloAuth";
import { storage } from "../storage";

const router = Router();
const id = z.coerce.number().int().positive();
const date = z.string().datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)), "Invalid ISO date");
const status = z.enum(["pending", "confirmed", "started", "paid", "cancelled"]);
const customerInput = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).max(50).optional(),
  email: z.email().max(254).optional(),
  notes: z.string().max(10000).optional(),
}).strict();
const appointmentInput = z.object({
  customerId: id, serviceId: id, duration: z.number().int().positive().max(1440),
  date, notes: z.string().max(10000).nullish(),
}).strict();
const updateInput = z.object({
  date: date.optional(), serviceId: id.optional(),
  duration: z.number().int().positive().max(1440).optional(),
  status: status.optional(), notes: z.string().max(10000).nullable().optional(),
  // Kept for compatibility with the shipped native appointment screen.
  cancellationReason: z.string().max(10000).optional(),
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

// JSON shape shared by list, creation, update, and cancellation. Prices are dollars.
const appointmentSelect = `SELECT a.id, a.date, a.duration, a.status, a.notes,
  a.cancellation_reason AS "cancellationReason", a.cancelled_at AS "cancelledAt",
  json_build_object('id', c.id, 'name', c.full_name,
    'phone', (SELECT COALESCE(p.display_phone, p.phone_number_e164) FROM client_phones p WHERE p.client_id=c.id ORDER BY p.is_primary DESC, p.id LIMIT 1),
    'email', (SELECT e.email_address FROM client_emails e WHERE e.client_id=c.id ORDER BY e.is_primary DESC, e.id LIMIT 1)) AS customer,
  json_build_object('id', s.id, 'name', s.name, 'duration', s.duration, 'price', s.price::float8) AS service
  FROM appointments a JOIN clients c ON c.id=a.customer_id AND c.store_id=a.store_id
  JOIN services s ON s.id=a.service_id AND s.store_id=a.store_id`;

async function appointment(appointmentId: number, storeId: number) {
  const result = await pool.query(`${appointmentSelect} WHERE a.id=$1 AND a.store_id=$2`, [appointmentId, storeId]);
  return result.rows[0] ?? null;
}

// Existing cookie-based web routes retain their full legacy shapes and behavior.
function nativeOnly(req: Request, _res: Response, next: NextFunction) {
  const bearer = req.headers.authorization;
  if (!bearer?.startsWith("Bearer ") || !verifySoloToken(bearer.slice(7))) return next("router");
  // Staff retain the older permission-scoped API. The compact API is for
  // owner sessions and must not bypass staff customer/appointment restrictions.
  if ((req.session as { staffId?: number } | undefined)?.staffId) return next("router");
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
    return res.json({ appointment: record, notification: {
      requested: parsed.data.notifyClient,
      status: parsed.data.notifyClient ? "not_configured" : "not_requested",
    } });
  } catch (error) { return unexpected(res, error); }
});

// Legacy PATCH {status:'cancelled'} is accepted only for the shipped app version;
// new clients use POST /appointments/:id/cancel.
router.use(nativeOnly);
router.use(isAuthenticated);

router.get("/customers", async (req, res) => {
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const rows = await pool.query(`SELECT c.id, c.full_name AS "fullName", c.full_name AS name,
      c.first_name AS "firstName", c.last_name AS "lastName",
      (SELECT COALESCE(p.display_phone,p.phone_number_e164) FROM client_phones p WHERE p.client_id=c.id ORDER BY p.is_primary DESC,p.id LIMIT 1) AS phone,
      (SELECT e.email_address FROM client_emails e WHERE e.client_id=c.id ORDER BY e.is_primary DESC,e.id LIMIT 1) AS email,
      (SELECT n.note_content FROM client_notes n WHERE n.client_id=c.id AND n.note_type='general' ORDER BY n.created_at DESC,n.id DESC LIMIT 1) AS notes
      FROM clients c WHERE c.store_id=$1 AND c.archived_at IS NULL ORDER BY c.full_name,c.id`, [storeId]);
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

router.get("/services", async (req, res) => {
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const rows = await pool.query(`SELECT id,name,duration,price::float8 AS price FROM services WHERE store_id=$1 AND is_active=true ORDER BY name,id`, [storeId]);
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
    const rows = await pool.query(`${appointmentSelect} WHERE a.store_id=$1
      AND ($2::timestamptz IS NULL OR a.date >= $2::timestamptz)
      AND ($3::timestamptz IS NULL OR a.date <= $3::timestamptz) ORDER BY a.date,a.id`,
      [storeId, dates.data.from ?? null, dates.data.to ?? null]);
    return res.json(rows.rows);
  } catch (error) { return unexpected(res, error); }
});

router.post("/appointments", async (req, res) => {
  const parsed = appointmentInput.safeParse(req.body);
  if (!parsed.success) return invalid(res, parsed.error);
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const { customerId, serviceId, duration, date: when, notes } = parsed.data;
    const result = await pool.query(`INSERT INTO appointments (customer_id,service_id,store_id,duration,date,notes,status)
      SELECT c.id,s.id,$3,$4,$5::timestamptz,$6,'pending' FROM clients c CROSS JOIN services s
      WHERE c.id=$1 AND c.store_id=$3 AND c.archived_at IS NULL AND s.id=$2 AND s.store_id=$3 AND s.is_active=true RETURNING id`,
      [customerId, serviceId, storeId, duration, when, notes ?? null]);
    if (!result.rows[0]) return res.status(400).json({ error: "Customer or service not found in this store" });
    return res.status(201).json(await appointment(result.rows[0].id, storeId));
  } catch (error) { return unexpected(res, error); }
});

router.patch("/appointments/:id", async (req, res) => {
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
    if (parsed.data.status === "cancelled" &&
        Object.keys(parsed.data).some(key => key !== "status" && key !== "cancellationReason"))
      return res.status(400).json({ error: "Use the cancellation endpoint separately from appointment edits" });
    if (parsed.data.serviceId !== undefined) {
      const service = await pool.query("SELECT id FROM services WHERE id=$1 AND store_id=$2 AND is_active=true", [parsed.data.serviceId, storeId]);
      if (!service.rows[0]) return res.status(400).json({ error: "Service not found in this store" });
    }
    if (parsed.data.status === "cancelled") {
      await pool.query(`UPDATE appointments SET status='cancelled',
        cancelled_at=COALESCE(cancelled_at,NOW()), cancellation_reason=COALESCE($3,cancellation_reason)
        WHERE id=$1 AND store_id=$2 AND status IS DISTINCT FROM 'cancelled' RETURNING id`,
        [parsedId.data, storeId, parsed.data.cancellationReason ?? null]);
      return res.json(await appointment(parsedId.data, storeId));
    }
    const fields: Record<string, string> = { date: "date", serviceId: "service_id", duration: "duration", status: "status", notes: "notes" };
    const entries = Object.entries(parsed.data).filter(([key]) => key in fields);
    if (entries.length) {
      const values = entries.map(([, value]) => value);
      const result = await pool.query(`UPDATE appointments SET ${entries.map(([key], index) => `${fields[key]}=$${index + 3}`).join(",")}
        WHERE id=$1 AND store_id=$2 AND status IS DISTINCT FROM 'cancelled'`, [parsedId.data, storeId, ...values]);
      if (result.rowCount === 0) return res.status(409).json({ error: "Appointment was cancelled during update" });
    }
    return res.json(await appointment(parsedId.data, storeId));
  } catch (error) { return unexpected(res, error); }
});

export default router;
