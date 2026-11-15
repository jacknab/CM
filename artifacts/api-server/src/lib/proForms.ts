/**
 * Client forms and waivers for Certxa Pro (owner, 2026-11-15: "match GlossGenius"; migration 0364).
 *
 * A form is a list of questions (and, for a waiver, a signature) the pro makes in the app. A client fills it in on a
 * private page (certxa.com/f/<code>) before the visit:
 *   • by itself — when a client books a service the form is for, the link is e-mailed (texted when the client has no
 *     e-mail) by the sweep below, a few minutes after the booking;
 *   • by the pro — Send from the booking or the client's profile, or Fill in here (opens the page on the pro's phone).
 * "once" forms are asked once per client (a signed copy is kept for good); "every_visit" forms, for each booking.
 * A signed copy keeps the questions as they were, so a later edit of the form never changes what a client signed.
 */
import crypto from "crypto";
import { pool } from "../db";
import { sendSms } from "../sms";
import { sendEmail } from "../mail";
import { emailButton, emailText, escapeEmailHtml } from "./emailLayout";
import { pushOwnerMessage } from "./ownerPush";

export const FIELD_TYPES = ["text", "long_text", "yes_no", "choice", "multi", "date", "agree", "info", "signature"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export type FormField = { label: string; fieldType: FieldType; options: string[]; required: boolean };

const APP_URL = () => (process.env.APP_URL || "https://certxa.com").replace(/\/$/, "");
export const formLink = (token: string) => `${APP_URL()}/f/${token}`;
const newToken = () => crypto.randomBytes(18).toString("base64url");

/** Ready-made forms the pro can start from (GlossGenius has a template library). */
export const FORM_TEMPLATES: Array<{ id: string; name: string; kind: "intake" | "waiver"; frequency: "once" | "every_visit"; description: string; fields: FormField[] }> = [
  {
    id: "new-client", name: "New client form", kind: "intake", frequency: "once",
    description: "A few questions before your first visit, so we can take good care of you.",
    fields: [
      { label: "Date of birth", fieldType: "date", options: [], required: false },
      { label: "How did you hear about us?", fieldType: "choice", options: ["Instagram", "Google", "A friend", "Walked by", "Other"], required: false },
      { label: "Do you have any allergies or sensitivities?", fieldType: "yes_no", options: [], required: true },
      { label: "If yes, please tell us about them", fieldType: "long_text", options: [], required: false },
      { label: "Any health conditions or medications we should know about?", fieldType: "long_text", options: [], required: false },
      { label: "Anything else you'd like us to know?", fieldType: "long_text", options: [], required: false },
    ],
  },
  {
    id: "service-waiver", name: "Service waiver and consent", kind: "waiver", frequency: "once",
    description: "Please read and sign before your service.",
    fields: [
      { label: "I have told my service provider about any allergies, skin conditions, infections or medical conditions that could affect my service.", fieldType: "agree", options: [], required: true },
      { label: "I understand that results can vary and that reactions, though rare, can happen. I will follow the aftercare I am given.", fieldType: "agree", options: [], required: true },
      { label: "I agree to the business's cancellation and no-show policy.", fieldType: "agree", options: [], required: true },
      { label: "Signature", fieldType: "signature", options: [], required: true },
    ],
  },
  {
    id: "photo-release", name: "Photo release", kind: "waiver", frequency: "once",
    description: "May we share photos of your results?",
    fields: [
      { label: "May we take before and after photos of your service?", fieldType: "yes_no", options: [], required: true },
      { label: "May we share them on our website and social media? Your face is never shown without asking.", fieldType: "yes_no", options: [], required: true },
      { label: "Signature", fieldType: "signature", options: [], required: true },
    ],
  },
  {
    id: "before-visit", name: "Before each visit", kind: "intake", frequency: "every_visit",
    description: "A quick check before today's appointment.",
    fields: [
      { label: "Has anything changed with your health, medications or allergies since your last visit?", fieldType: "yes_no", options: [], required: true },
      { label: "If yes, what has changed?", fieldType: "long_text", options: [], required: false },
      { label: "What would you like done today?", fieldType: "long_text", options: [], required: false },
    ],
  },
];

/** Cleans what the app sends: known types only, options only where they mean something, sensible limits. */
export function cleanFields(input: unknown): FormField[] | string {
  if (!Array.isArray(input)) return "Add at least one question.";
  if (input.length === 0) return "Add at least one question.";
  if (input.length > 60) return "A form can have up to 60 questions.";
  const out: FormField[] = [];
  for (const raw of input as any[]) {
    const label = String(raw?.label ?? "").trim().slice(0, 1000);
    const fieldType = String(raw?.fieldType ?? "") as FieldType;
    if (!label) return "Every question needs some words.";
    if (!FIELD_TYPES.includes(fieldType)) return "One of the questions has an unknown type.";
    const options = fieldType === "choice" || fieldType === "multi"
      ? [...new Set((Array.isArray(raw?.options) ? raw.options : String(raw?.options ?? "").split("\n")).map((o: unknown) => String(o).trim().slice(0, 200)).filter(Boolean))].slice(0, 30) as string[]
      : [];
    if ((fieldType === "choice" || fieldType === "multi") && options.length < 2) return `"${label.slice(0, 40)}" needs at least two answers to choose from.`;
    out.push({ label, fieldType, options, required: fieldType === "info" ? false : !!raw?.required });
  }
  return out;
}

export async function formFields(formId: number): Promise<FormField[]> {
  const r = await pool.query(`SELECT label, field_type, options, required FROM intake_form_fields WHERE form_id = $1 ORDER BY sort_order, id`, [formId]);
  return r.rows.map((f) => ({ label: f.label, fieldType: f.field_type, options: parseOptions(f.options), required: !!f.required }));
}
function parseOptions(raw: string | null): string[] {
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v.map(String) : []; } catch { return raw.split("\n").map((s) => s.trim()).filter(Boolean); }
}
export async function saveFields(client: { query: typeof pool.query }, formId: number, fields: FormField[]) {
  await client.query(`DELETE FROM intake_form_fields WHERE form_id = $1`, [formId]);
  for (const [i, f] of fields.entries()) {
    await client.query(`INSERT INTO intake_form_fields (form_id, label, field_type, options, required, sort_order) VALUES ($1,$2,$3,$4,$5,$6)`,
      [formId, f.label, f.fieldType, f.options.length ? JSON.stringify(f.options) : null, f.required, i]);
  }
}

type Contact = { name: string; firstName: string; phone: string | null; email: string | null };
async function clientContact(storeId: number, customerId: number): Promise<Contact | null> {
  const r = (await pool.query(
    `SELECT c.full_name, c.first_name,
       (SELECT COALESCE(p.phone_number_e164, p.display_phone) FROM client_phones p WHERE p.client_id = c.id ORDER BY p.is_primary DESC, p.id LIMIT 1) AS phone,
       (SELECT e.email_address FROM client_emails e WHERE e.client_id = c.id ORDER BY e.is_primary DESC, e.id LIMIT 1) AS email
     FROM clients c WHERE c.id = $1 AND c.store_id = $2`, [customerId, storeId])).rows[0];
  if (!r) return null;
  const name = String(r.full_name || "").trim();
  return { name, firstName: String(r.first_name || name.split(" ")[0] || "").trim(), phone: r.phone || null, email: r.email || null };
}

/**
 * Makes (or reuses) the link for one client and form — for a visit, one per visit — and sends it.
 * `via`: "auto" picks e-mail when the client has one (free), else a text; "in_person" sends nothing (the pro opens
 * the page on their own phone). Returns the link and how it went out.
 */
export async function sendFormRequest(opts: { storeId: number; formId: number; customerId: number; appointmentId?: number | null; via: "auto" | "email" | "sms" | "in_person"; auto?: boolean }):
  Promise<{ ok: true; requestId: number; link: string; sentVia: string } | { ok: false; status: number; error: string }> {
  const { storeId, formId, customerId } = opts;
  const appointmentId = opts.appointmentId ?? null;
  const form = (await pool.query(`SELECT id, name, kind, frequency FROM intake_forms WHERE id = $1 AND store_id = $2`, [formId, storeId])).rows[0];
  if (!form) return { ok: false, status: 404, error: "Form not found" };
  const contact = await clientContact(storeId, customerId);
  if (!contact) return { ok: false, status: 404, error: "Client not found" };
  const business = (await pool.query(`SELECT name FROM locations WHERE id = $1`, [storeId])).rows[0]?.name || "Your appointment";

  // An open link already sent for the same visit (or, without a visit, the client's last open one) is sent again.
  const open = (await pool.query(
    `SELECT id, token FROM intake_form_requests WHERE store_id = $1 AND form_id = $2 AND customer_id = $3 AND status = 'sent'
       AND (appointment_id IS NOT DISTINCT FROM $4 OR $4 IS NULL) ORDER BY id DESC LIMIT 1`, [storeId, formId, customerId, appointmentId])).rows[0];
  let request = open;
  if (!request) {
    request = (await pool.query(
      `INSERT INTO intake_form_requests (store_id, form_id, customer_id, appointment_id, token, auto) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (form_id, appointment_id) WHERE appointment_id IS NOT NULL DO NOTHING RETURNING id, token`,
      [storeId, formId, customerId, appointmentId, newToken(), !!opts.auto])).rows[0];
    if (!request) {
      const done = (await pool.query(`SELECT id, token, status FROM intake_form_requests WHERE form_id = $1 AND appointment_id = $2`, [formId, appointmentId])).rows[0];
      if (done?.status === "completed") return { ok: false, status: 409, error: "This form is already filled in for this booking." };
      request = done;
    }
  }
  const link = formLink(request.token);
  const what = form.kind === "waiver" ? "sign" : "fill in";

  let sentVia = "in_person";
  if (opts.via !== "in_person") {
    const useEmail = opts.via === "email" || (opts.via === "auto" && !!contact.email);
    if (useEmail) {
      if (!contact.email) return { ok: false, status: 400, error: "This client has no e-mail address." };
      const html = [
        emailText(`Hi ${escapeEmailHtml(contact.firstName || "there")},`),
        emailText(`${escapeEmailHtml(business)} asks you to ${what} <strong>${escapeEmailHtml(form.name)}</strong> before your visit. It only takes a minute.`),
        emailButton(form.kind === "waiver" ? "Read and sign" : "Fill in the form", link),
        emailText("This link is just for you. Please don't share it.", { muted: true, size: 13 }),
      ].join("");
      const r = await sendEmail(storeId, contact.email, `${business}: please ${what} ${form.name}`, html, undefined, undefined, { business, preheader: `Please ${what} ${form.name} before your visit.` });
      if (!r.success) return { ok: false, status: 502, error: "The e-mail could not be sent. Try again, or send it by text." };
      sentVia = "email";
    } else {
      if (!contact.phone) return { ok: false, status: 400, error: contact.email ? "This client has no mobile number." : "This client has no e-mail address or mobile number. Add one, or use Fill in here." };
      const r = await sendSms(storeId, contact.phone, `${business}: please ${what} "${form.name}" before your visit: ${link}`, "intake_form", appointmentId ?? undefined, customerId);
      if (!r.success) return { ok: false, status: 502, error: r.error === "No text message credits left" ? "You have no text credits left. Send it by e-mail, or use Fill in here." : "The text could not be sent." };
      sentVia = "sms";
    }
  }
  await pool.query(`UPDATE intake_form_requests SET sent_via = $2, sent_at = now() WHERE id = $1`, [request.id, sentVia]);
  return { ok: true, requestId: request.id, link, sentVia };
}

/** The forms a booking needs, with where each one stands. */
export async function formsForAppointment(storeId: number, appointmentId: number) {
  const appt = (await pool.query(`SELECT id, customer_id, service_id, custom_lines FROM appointments WHERE id = $1 AND store_id = $2`, [appointmentId, storeId])).rows[0];
  if (!appt) return null;
  const serviceIds = await visitServiceIds(storeId, appt);
  const forms = (await pool.query(
    `SELECT f.id, f.name, f.kind, f.frequency, f.all_services,
       COALESCE((SELECT array_agg(s.service_id) FROM intake_form_services s WHERE s.form_id = f.id), '{}') AS service_ids
     FROM intake_forms f WHERE f.store_id = $1 AND f.is_active = true ORDER BY f.id`, [storeId])).rows;
  const out = [];
  for (const f of forms) {
    const applies = f.all_services || (f.service_ids as number[]).some((s) => serviceIds.includes(Number(s)));
    const req = (await pool.query(
      `SELECT id, status, sent_via, sent_at, completed_at, response_id FROM intake_form_requests
        WHERE store_id = $1 AND form_id = $2 AND customer_id = $3 AND (appointment_id = $4 OR ($5 = 'once' AND status = 'completed'))
        ORDER BY (status = 'completed') DESC, id DESC LIMIT 1`, [storeId, f.id, appt.customer_id, appointmentId, f.frequency])).rows[0];
    if (!applies && !req) continue;
    out.push({
      formId: f.id, name: f.name, kind: f.kind, frequency: f.frequency,
      status: req?.status === "completed" ? "completed" : req ? "sent" : "not_sent",
      sentVia: req?.sent_via ?? null, sentAt: req?.sent_at ?? null, completedAt: req?.completed_at ?? null, responseId: req?.response_id ?? null,
    });
  }
  return { customerId: Number(appt.customer_id), forms: out };
}

/** The visit's services: the main one and any further services (saved as priced lines by name). */
async function visitServiceIds(storeId: number, appt: { service_id: number | null; custom_lines: unknown }): Promise<number[]> {
  const ids = appt.service_id ? [Number(appt.service_id)] : [];
  const lines = Array.isArray(appt.custom_lines) ? appt.custom_lines : (() => { try { return JSON.parse(String(appt.custom_lines ?? "[]")); } catch { return []; } })();
  ids.push(...(lines as any[]).map((l) => Number(l?.serviceId)).filter((n) => Number.isInteger(n) && n > 0));
  const names = (lines as any[]).map((l) => String(l?.label ?? "").trim()).filter(Boolean);
  if (names.length) {
    const r = await pool.query(`SELECT id FROM services WHERE store_id = $1 AND name = ANY($2::text[])`, [storeId, names]);
    ids.push(...r.rows.map((x) => Number(x.id)));
  }
  return ids;
}

/** Saves a client's answers from the private page. Returns the store and client to tell the pro. */
export async function submitForm(token: string, body: { answers: Record<string, unknown>; signatureName?: string; signatureImage?: string }, meta: { ipHash: string; userAgent: string }):
  Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const req = (await client.query(
      `SELECT r.*, f.name AS form_name, f.kind FROM intake_form_requests r JOIN intake_forms f ON f.id = r.form_id WHERE r.token = $1 FOR UPDATE OF r`, [token])).rows[0];
    if (!req) { await client.query("ROLLBACK"); return { ok: false, status: 404, error: "This link isn't valid." }; }
    if (req.status === "completed") { await client.query("ROLLBACK"); return { ok: false, status: 409, error: "This form has already been filled in. Thank you!" }; }
    const fields = await formFields(req.form_id);
    const answers: Array<{ label: string; fieldType: string; answer: unknown }> = [];
    let signatureNeeded = false;
    for (const [i, f] of fields.entries()) {
      if (f.fieldType === "info") { answers.push({ label: f.label, fieldType: f.fieldType, answer: null }); continue; }
      if (f.fieldType === "signature") { signatureNeeded = true; answers.push({ label: f.label, fieldType: f.fieldType, answer: null }); continue; }
      const raw = body.answers?.[String(i)];
      let answer: unknown = null;
      if (f.fieldType === "agree") answer = raw === true;
      else if (f.fieldType === "yes_no") answer = raw === "yes" || raw === "no" ? raw : null;
      else if (f.fieldType === "choice") answer = typeof raw === "string" && f.options.includes(raw) ? raw : null;
      else if (f.fieldType === "multi") answer = Array.isArray(raw) ? raw.map(String).filter((o) => f.options.includes(o)) : [];
      else if (f.fieldType === "date") answer = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
      else answer = typeof raw === "string" ? raw.trim().slice(0, f.fieldType === "text" ? 500 : 5000) : null;
      const empty = answer === null || answer === "" || answer === false || (Array.isArray(answer) && answer.length === 0);
      if (f.required && empty) { await client.query("ROLLBACK"); return { ok: false, status: 400, error: `Please answer: ${f.label.slice(0, 80)}` }; }
      answers.push({ label: f.label, fieldType: f.fieldType, answer });
    }
    const signatureName = String(body.signatureName ?? "").trim().slice(0, 120);
    const signatureImage = typeof body.signatureImage === "string" && body.signatureImage.startsWith("data:image/png;base64,") && body.signatureImage.length < 300_000 ? body.signatureImage : null;
    if (signatureNeeded && (!signatureName || !signatureImage)) { await client.query("ROLLBACK"); return { ok: false, status: 400, error: "Please type your full name and sign." }; }
    const contact = await clientContact(req.store_id, req.customer_id);
    const resp = (await client.query(
      `INSERT INTO intake_form_responses (form_id, store_id, customer_id, appointment_id, customer_name, responses, request_id, form_snapshot, signature_name, signature_image, ip_hash, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [req.form_id, req.store_id, req.customer_id, req.appointment_id, contact?.name ?? null, JSON.stringify(answers), req.id,
        JSON.stringify({ name: req.form_name, kind: req.kind, fields }), signatureNeeded ? signatureName : null, signatureNeeded ? signatureImage : null, meta.ipHash, meta.userAgent.slice(0, 300)])).rows[0];
    await client.query(`UPDATE intake_form_requests SET status = 'completed', completed_at = now(), response_id = $2 WHERE id = $1`, [req.id, resp.id]);
    await client.query("COMMIT");
    void pushOwnerMessage(req.store_id, {
      title: req.kind === "waiver" ? "Form signed" : "Form filled in",
      body: `${contact?.name || "A client"}: ${req.form_name}`,
      data: { type: "form_completed", customerId: req.customer_id, appointmentId: req.appointment_id, responseId: resp.id },
    }).catch(() => {});
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}

// ── Sending forms by themselves when a client books ──
const SWEEP_MS = 5 * 60_000;
let sweepTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Upcoming bookings (the next 14 days) of businesses with forms set to go out on booking, whose client hasn't been
 * sent the form for that visit yet (or, for a once-only form, has never signed it). Only bookings made after the form
 * was, so making a form doesn't mail every client already booked; the pro sends those from the booking if wanted.
 */
export async function sweepFormsOnce(): Promise<number> {
  const lock = await pool.connect();
  let sent = 0;
  try {
    const got = (await lock.query(`SELECT pg_try_advisory_lock(hashtext('pro_forms_sweep')) AS got`)).rows[0]?.got;
    if (!got) return 0;
    try {
      const due = (await pool.query(
        `SELECT a.id AS appointment_id, a.store_id, a.customer_id, f.id AS form_id
           FROM intake_forms f
           JOIN appointments a ON a.store_id = f.store_id AND a.created_at >= f.created_at
          WHERE f.is_active = true AND f.send_auto = true
            AND a.customer_id IS NOT NULL AND a.date > now() AND a.date < now() + interval '14 days'
            AND a.created_at > now() - interval '3 days'
            AND a.status NOT IN ('cancelled', 'completed', 'paid', 'no_show') AND COALESCE(a.calendar_hidden, false) = false
            AND (f.all_services OR EXISTS (
                  SELECT 1 FROM intake_form_services s JOIN services sv ON sv.id = s.service_id
                   WHERE s.form_id = f.id AND (s.service_id = a.service_id OR EXISTS (
                     SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a.custom_lines) = 'array' THEN a.custom_lines ELSE '[]'::jsonb END) l
                      WHERE l->>'serviceId' = s.service_id::text OR l->>'label' = sv.name))))
            AND NOT EXISTS (SELECT 1 FROM intake_form_requests r WHERE r.form_id = f.id AND r.appointment_id = a.id)
            AND NOT (f.frequency = 'once' AND EXISTS (SELECT 1 FROM intake_form_requests r WHERE r.form_id = f.id AND r.customer_id = a.customer_id
                  AND (r.status = 'completed' OR r.sent_at > now() - interval '7 days')))
          ORDER BY a.id LIMIT 200`)).rows;
      for (const d of due) {
        const r = await sendFormRequest({ storeId: d.store_id, formId: d.form_id, customerId: d.customer_id, appointmentId: d.appointment_id, via: "auto", auto: true })
          .catch((e) => ({ ok: false as const, status: 500, error: e instanceof Error ? e.message : "error" }));
        if (r.ok) sent++;
        else {
          // Not sendable (no e-mail or phone, no credits): remember it so the sweep doesn't try every 5 minutes.
          await pool.query(
            `INSERT INTO intake_form_requests (store_id, form_id, customer_id, appointment_id, token, auto, sent_via) VALUES ($1,$2,$3,$4,$5,true,'none')
             ON CONFLICT (form_id, appointment_id) WHERE appointment_id IS NOT NULL DO NOTHING`,
            [d.store_id, d.form_id, d.customer_id, d.appointment_id, newToken()]).catch(() => {});
        }
      }
    } finally { await lock.query(`SELECT pg_advisory_unlock(hashtext('pro_forms_sweep'))`).catch(() => {}); }
  } finally { lock.release(); }
  if (sent) console.log(`[pro-forms] sent ${sent} form link(s)`);
  return sent;
}

export function startProFormsSweep() {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => { void sweepFormsOnce().catch((e) => console.error("[pro-forms] sweep failed", e instanceof Error ? e.message : e)); }, SWEEP_MS);
}
