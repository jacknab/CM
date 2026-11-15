/**
 * Client forms and waivers (owner, 2026-11-15; lib/proForms.ts has the rules).
 *
 *   GET    /api/pro/forms                        the business's forms, with their questions and services
 *   GET    /api/pro/forms/templates              ready-made forms to start from
 *   POST   /api/pro/forms                        { name, description?, kind, frequency, sendAuto, allServices, serviceIds, fields }
 *   PUT    /api/pro/forms/:id                    the same, any of them, or { isActive }
 *   DELETE /api/pro/forms/:id                    deleted; a form clients have filled in is switched off instead (copies kept)
 *   GET    /api/pro/forms/appointment/:id        the forms a booking needs and where each stands
 *   GET    /api/pro/forms/client/:id             a client's filled-in forms and links still open
 *   POST   /api/pro/forms/send                   { formId, customerId, appointmentId?, via: auto|email|sms|in_person } → { link, sentVia }
 *   GET    /api/pro/forms/responses/:id          one filled-in form
 *   GET    /api/public/forms/:token              the form, for the client's private page (certxa.com/f/<code>)
 *   POST   /api/public/forms/:token              { answers, signatureName?, signatureImage? }
 */
import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { cleanFields, formFields, formsForAppointment, FORM_TEMPLATES, saveFields, sendFormRequest, submitForm } from "../lib/proForms";

const router = Router();
const id = z.coerce.number().int().positive();

function unexpected(res: Response, error: unknown) {
  console.error("[pro-forms] failed", error instanceof Error ? error.message : "unknown error");
  return res.status(500).json({ error: "Something went wrong. Please try again." });
}
async function store(req: Request, res: Response): Promise<number | null> {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) res.status(403).json({ error: "No store context" });
  return storeId;
}

const formInput = z.object({
  name: z.string().trim().min(1, "Give the form a name").max(120),
  description: z.string().trim().max(2000).nullish(),
  kind: z.enum(["intake", "waiver"]).default("intake"),
  frequency: z.enum(["once", "every_visit"]).default("once"),
  sendAuto: z.boolean().default(true),
  allServices: z.boolean().default(true),
  serviceIds: z.array(id).max(300).default([]),
  fields: z.array(z.unknown()).max(60),
  isActive: z.boolean().optional(),
}).strict();

async function listForms(storeId: number) {
  const forms = (await pool.query(
    `SELECT f.id, f.name, f.description, f.kind, f.frequency, f.send_auto AS "sendAuto", f.all_services AS "allServices", f.is_active AS "isActive",
       COALESCE((SELECT array_agg(s.service_id) FROM intake_form_services s WHERE s.form_id = f.id), '{}') AS "serviceIds",
       (SELECT COUNT(*)::int FROM intake_form_requests r WHERE r.form_id = f.id AND r.status = 'completed') AS completed,
       (SELECT COUNT(*)::int FROM intake_form_requests r WHERE r.form_id = f.id AND r.status = 'sent' AND r.sent_via <> 'none') AS waiting
     FROM intake_forms f WHERE f.store_id = $1 ORDER BY f.is_active DESC, f.id`, [storeId])).rows;
  for (const f of forms) f.fields = await formFields(f.id);
  return forms;
}

async function saveForm(storeId: number, formId: number | null, body: z.infer<typeof formInput>) {
  const fields = cleanFields(body.fields);
  if (typeof fields === "string") return { error: fields };
  const serviceIds = body.allServices ? [] : [...new Set(body.serviceIds)];
  if (!body.allServices && serviceIds.length === 0) return { error: "Choose the services this form is for, or send it for every service." };
  if (serviceIds.length) {
    const ok = (await pool.query(`SELECT COUNT(*)::int AS n FROM services WHERE store_id = $1 AND id = ANY($2::int[])`, [storeId, serviceIds])).rows[0].n;
    if (ok !== serviceIds.length) return { error: "One of the services isn't in your menu." };
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let fid = formId;
    if (fid) {
      const r = await client.query(
        `UPDATE intake_forms SET name=$3, description=$4, kind=$5, frequency=$6, send_auto=$7, all_services=$8, is_active=COALESCE($9, is_active), updated_at=now()
          WHERE id=$1 AND store_id=$2`, [fid, storeId, body.name, body.description ?? null, body.kind, body.frequency, body.sendAuto, body.allServices, body.isActive ?? null]);
      if (!r.rowCount) { await client.query("ROLLBACK"); return { notFound: true }; }
    } else {
      fid = (await client.query(
        `INSERT INTO intake_forms (store_id, name, description, kind, frequency, send_auto, all_services, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,true) RETURNING id`,
        [storeId, body.name, body.description ?? null, body.kind, body.frequency, body.sendAuto, body.allServices])).rows[0].id;
    }
    await saveFields(client, fid!, fields);
    await client.query(`DELETE FROM intake_form_services WHERE form_id = $1`, [fid]);
    if (serviceIds.length) await client.query(`INSERT INTO intake_form_services (form_id, service_id) SELECT $1, unnest($2::int[])`, [fid, serviceIds]);
    await client.query("COMMIT");
    return { id: fid };
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
  finally { client.release(); }
}

router.get("/api/pro/forms/templates", isAuthenticated, (_req, res) => res.json(FORM_TEMPLATES));

router.get("/api/pro/forms", isAuthenticated, async (req, res) => {
  try {
    const storeId = await store(req, res); if (!storeId) return;
    return res.json(await listForms(storeId));
  } catch (error) { return unexpected(res, error); }
});

router.post("/api/pro/forms", isAuthenticated, async (req, res) => {
  const body = formInput.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0]?.message ?? "Please check the form." });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const r = await saveForm(storeId, null, body.data);
    if ("error" in r) return res.status(400).json({ error: r.error });
    return res.status(201).json({ id: r.id });
  } catch (error) { return unexpected(res, error); }
});

router.put("/api/pro/forms/:id", isAuthenticated, async (req, res) => {
  const fid = id.safeParse(req.params.id);
  if (!fid.success) return res.status(400).json({ error: "Invalid form" });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    // Just switching the form on or off.
    if (req.body && Object.keys(req.body).length === 1 && typeof req.body.isActive === "boolean") {
      const r = await pool.query(`UPDATE intake_forms SET is_active = $3, updated_at = now() WHERE id = $1 AND store_id = $2`, [fid.data, storeId, req.body.isActive]);
      return r.rowCount ? res.json({ id: fid.data }) : res.status(404).json({ error: "Form not found" });
    }
    const body = formInput.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: body.error.issues[0]?.message ?? "Please check the form." });
    const r = await saveForm(storeId, fid.data, body.data);
    if ("notFound" in r) return res.status(404).json({ error: "Form not found" });
    if ("error" in r) return res.status(400).json({ error: r.error });
    return res.json({ id: r.id });
  } catch (error) { return unexpected(res, error); }
});

router.delete("/api/pro/forms/:id", isAuthenticated, async (req, res) => {
  const fid = id.safeParse(req.params.id);
  if (!fid.success) return res.status(400).json({ error: "Invalid form" });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const form = (await pool.query(`SELECT id FROM intake_forms WHERE id = $1 AND store_id = $2`, [fid.data, storeId])).rows[0];
    if (!form) return res.status(404).json({ error: "Form not found" });
    const used = (await pool.query(`SELECT 1 FROM intake_form_responses WHERE form_id = $1 LIMIT 1`, [fid.data])).rows[0];
    if (used) {
      // Signed copies are records the business keeps: the form is switched off, never deleted.
      await pool.query(`UPDATE intake_forms SET is_active = false, send_auto = false, updated_at = now() WHERE id = $1`, [fid.data]);
      await pool.query(`DELETE FROM intake_form_requests WHERE form_id = $1 AND status = 'sent'`, [fid.data]);
      return res.json({ archived: true });
    }
    await pool.query(`DELETE FROM intake_form_requests WHERE form_id = $1`, [fid.data]);
    await pool.query(`DELETE FROM intake_form_fields WHERE form_id = $1`, [fid.data]);
    await pool.query(`DELETE FROM intake_forms WHERE id = $1`, [fid.data]);
    return res.json({ deleted: true });
  } catch (error) { return unexpected(res, error); }
});

router.get("/api/pro/forms/appointment/:id", isAuthenticated, async (req, res) => {
  const aid = id.safeParse(req.params.id);
  if (!aid.success) return res.status(400).json({ error: "Invalid booking" });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const r = await formsForAppointment(storeId, aid.data);
    return r ? res.json(r) : res.status(404).json({ error: "Booking not found" });
  } catch (error) { return unexpected(res, error); }
});

router.get("/api/pro/forms/client/:id", isAuthenticated, async (req, res) => {
  const cid = id.safeParse(req.params.id);
  if (!cid.success) return res.status(400).json({ error: "Invalid client" });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const done = (await pool.query(
      `SELECT r.id AS "responseId", r.form_id AS "formId", COALESCE(r.form_snapshot->>'name', f.name) AS name, COALESCE(r.form_snapshot->>'kind', f.kind) AS kind,
              r.submitted_at AS "completedAt", r.appointment_id AS "appointmentId"
         FROM intake_form_responses r JOIN intake_forms f ON f.id = r.form_id
        WHERE r.store_id = $1 AND r.customer_id = $2 ORDER BY r.submitted_at DESC`, [storeId, cid.data])).rows;
    const open = (await pool.query(
      `SELECT q.id AS "requestId", q.form_id AS "formId", f.name, f.kind, q.sent_via AS "sentVia", q.sent_at AS "sentAt", q.appointment_id AS "appointmentId"
         FROM intake_form_requests q JOIN intake_forms f ON f.id = q.form_id
        WHERE q.store_id = $1 AND q.customer_id = $2 AND q.status = 'sent' AND q.sent_via <> 'none' AND f.is_active ORDER BY q.sent_at DESC`, [storeId, cid.data])).rows;
    return res.json({ completed: done, waiting: open });
  } catch (error) { return unexpected(res, error); }
});

router.post("/api/pro/forms/send", isAuthenticated, async (req, res) => {
  const body = z.object({ formId: id, customerId: id, appointmentId: id.nullish(), via: z.enum(["auto", "email", "sms", "in_person"]).default("auto") }).strict().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Please check the form." });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    if (body.data.appointmentId) {
      const a = (await pool.query(`SELECT customer_id FROM appointments WHERE id = $1 AND store_id = $2`, [body.data.appointmentId, storeId])).rows[0];
      if (!a || Number(a.customer_id) !== body.data.customerId) return res.status(404).json({ error: "Booking not found" });
    }
    const active = (await pool.query(`SELECT is_active FROM intake_forms WHERE id = $1 AND store_id = $2`, [body.data.formId, storeId])).rows[0];
    if (!active) return res.status(404).json({ error: "Form not found" });
    if (!active.is_active) return res.status(409).json({ error: "This form is switched off. Switch it on in Forms first." });
    const r = await sendFormRequest({ storeId, ...body.data });
    if (!r.ok) return res.status(r.status).json({ error: r.error });
    return res.json({ link: r.link, sentVia: r.sentVia });
  } catch (error) { return unexpected(res, error); }
});

router.get("/api/pro/forms/responses/:id", isAuthenticated, async (req, res) => {
  const rid = id.safeParse(req.params.id);
  if (!rid.success) return res.status(400).json({ error: "Invalid form" });
  try {
    const storeId = await store(req, res); if (!storeId) return;
    const r = (await pool.query(
      `SELECT r.id, r.customer_id AS "customerId", r.customer_name AS "clientName", r.appointment_id AS "appointmentId", r.submitted_at AS "completedAt",
              r.responses, r.form_snapshot AS snapshot, r.signature_name AS "signatureName", r.signature_image AS "signatureImage", f.name, f.kind
         FROM intake_form_responses r JOIN intake_forms f ON f.id = r.form_id WHERE r.id = $1 AND r.store_id = $2`, [rid.data, storeId])).rows[0];
    if (!r) return res.status(404).json({ error: "Form not found" });
    let answers: unknown = [];
    try { answers = JSON.parse(r.responses); } catch { answers = []; }
    return res.json({
      id: r.id, customerId: r.customerId, clientName: r.clientName, appointmentId: r.appointmentId, completedAt: r.completedAt,
      name: r.snapshot?.name ?? r.name, kind: r.snapshot?.kind ?? r.kind, answers, signatureName: r.signatureName, signatureImage: r.signatureImage,
    });
  } catch (error) { return unexpected(res, error); }
});

// ── The client's private page ──
const publicLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: "Too many tries. Please wait a few minutes." } });
const token = z.string().regex(/^[A-Za-z0-9_-]{20,40}$/);

router.get("/api/public/forms/:token", publicLimiter, async (req, res) => {
  const t = token.safeParse(req.params.token);
  if (!t.success) return res.status(404).json({ error: "This link isn't valid." });
  try {
    const r = (await pool.query(
      `SELECT q.id, q.status, q.form_id, q.store_id, q.appointment_id, f.name, f.description, f.kind, f.is_active, l.name AS business, l.timezone,
              c.first_name, c.full_name, a.date AS visit_at
         FROM intake_form_requests q JOIN intake_forms f ON f.id = q.form_id JOIN locations l ON l.id = q.store_id
         LEFT JOIN clients c ON c.id = q.customer_id LEFT JOIN appointments a ON a.id = q.appointment_id
        WHERE q.token = $1`, [t.data])).rows[0];
    if (!r || (!r.is_active && r.status !== "completed")) return res.status(404).json({ error: "This link isn't valid." });
    if (r.status !== "completed") await pool.query(`UPDATE intake_form_requests SET opened_at = COALESCE(opened_at, now()) WHERE id = $1`, [r.id]);
    return res.json({
      business: r.business, name: r.name, description: r.description, kind: r.kind, completed: r.status === "completed",
      clientName: r.full_name || null, firstName: r.first_name || null, visitAt: r.visit_at, timezone: r.timezone || "America/New_York",
      fields: r.status === "completed" ? [] : await formFields(r.form_id),
    });
  } catch (error) { return unexpected(res, error); }
});

router.post("/api/public/forms/:token", publicLimiter, async (req, res) => {
  const t = token.safeParse(req.params.token);
  if (!t.success) return res.status(404).json({ error: "This link isn't valid." });
  const body = z.object({
    answers: z.record(z.string(), z.unknown()).default({}),
    signatureName: z.string().max(200).optional(),
    signatureImage: z.string().max(300_000).optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Please check the form." });
  try {
    const ipHash = crypto.createHash("sha256").update(`${process.env.SESSION_SECRET ?? "certxa"}|form|${req.ip ?? ""}`).digest("hex");
    const r = await submitForm(t.data, body.data, { ipHash, userAgent: String(req.headers["user-agent"] ?? "") });
    if (!r.ok) return res.status(r.status).json({ error: r.error });
    return res.json({ ok: true });
  } catch (error) { return unexpected(res, error); }
});

export default router;
