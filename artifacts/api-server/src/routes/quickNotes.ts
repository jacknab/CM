/**
 * Quick Notes after checkout (owner, 2026-11-11): the Certxa Pro app, /nail and /barber offer a one-screen note once a
 * client is checked out. The template comes from the business type and the note text is built by
 * shared/quickNotes.ts; each note is kept per visit (migration 0345) and shown in the client's notes.
 *
 *   GET  /api/quick-notes/appointment/:id      — what the Quick Notes screen needs for a checked-out visit
 *   POST /api/quick-notes                      — save { appointmentId, choices, extra } (saving the same visit again updates it)
 *   GET  /api/quick-notes/client/:id/latest    — the client's latest note and what to remember, before their next visit
 *   GET  /api/quick-notes/client/:id           — all of the client's Quick Notes, newest first (Client Lookup › Notes, 2026-11-12)
 */
import { Router } from "express";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { buildQuickNoteText, cleanQuickNoteChoices, quickNoteTemplateFor, rememberChoices } from "@shared/quickNotes";

const router = Router();
const MAX_EXTRA = 1000;

/** The visit, with what Quick Notes shows: client, who did it, and the services already on the ticket. */
async function loadVisit(storeId: number, appointmentId: number) {
  const r = await pool.query(
    `SELECT a.id, a.customer_id, a.staff_id, a.status, l.category,
            COALESCE(NULLIF(TRIM(CONCAT(c.first_name, ' ', c.last_name)), ''), c.full_name, a.customer_name) AS client_name,
            st.name AS staff_name, s.name AS service_name,
            COALESCE((SELECT array_agg(ad.name ORDER BY aa.id) FROM appointment_addons aa JOIN addons ad ON ad.id = aa.addon_id
                       WHERE aa.appointment_id = a.id), '{}') AS addon_names
       FROM appointments a
       JOIN locations l ON l.id = a.store_id
       LEFT JOIN clients c ON c.id = a.customer_id
       LEFT JOIN staff st ON st.id = a.staff_id
       LEFT JOIN services s ON s.id = a.service_id
      WHERE a.id = $1 AND a.store_id = $2`,
    [appointmentId, storeId],
  );
  return r.rows[0] ?? null;
}

router.get("/appointment/:id", isAuthenticated, async (req, res) => {
  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(403).json({ message: "No store context" });
    const visit = await loadVisit(storeId, Number(req.params.id));
    if (!visit) return res.status(404).json({ message: "Visit not found" });
    const template = quickNoteTemplateFor(visit.category);
    const saved = (await pool.query(`SELECT details, note_text FROM client_quick_notes WHERE appointment_id = $1 AND store_id = $2`, [visit.id, storeId])).rows[0];
    return res.json({
      // A note is kept on the client, so a ticket with only a name (no client record) has nowhere to keep it.
      available: visit.customer_id != null && visit.status === "completed",
      template,
      clientName: visit.client_name ?? null,
      staffName: visit.staff_name ?? null,
      services: [visit.service_name, ...(visit.addon_names ?? [])].filter(Boolean),
      saved: saved ? { choices: saved.details?.choices ?? {}, extra: saved.details?.extra ?? "", text: saved.note_text } : null,
    });
  } catch (err) {
    console.error("[quick-notes] GET appointment:", err);
    return res.status(500).json({ message: "Could not load Quick Notes" });
  }
});

router.post("/", isAuthenticated, async (req, res) => {
  const storeId = await resolveSessionStoreId(req).catch(() => null);
  if (!storeId) return res.status(403).json({ message: "No store context" });
  const appointmentId = Number(req.body?.appointmentId);
  if (!Number.isInteger(appointmentId) || appointmentId <= 0) return res.status(400).json({ message: "Which visit is this note for?" });
  const extra = typeof req.body?.extra === "string" ? req.body.extra.trim().slice(0, MAX_EXTRA) : "";
  const client = await pool.connect();
  try {
    const visit = await loadVisit(storeId, appointmentId);
    if (!visit) return res.status(404).json({ message: "Visit not found" });
    if (visit.customer_id == null) return res.status(400).json({ message: "This ticket has no client, so there is nowhere to keep the note." });
    if (visit.status !== "completed") return res.status(400).json({ message: "Quick Notes are for a visit that has been checked out." });
    const template = quickNoteTemplateFor(visit.category);
    const choices = cleanQuickNoteChoices(template, req.body?.choices);
    const text = buildQuickNoteText(template.id, choices, extra);
    if (!text) return res.status(400).json({ message: "Pick something or write a note first." });
    const details = { template: template.id, choices, extra, services: [visit.service_name, ...(visit.addon_names ?? [])].filter(Boolean), remember: rememberChoices(template, choices) };
    const userId = (req.session as any)?.userId ?? null;

    await client.query("BEGIN");
    const existing = (await client.query(`SELECT id, client_note_id FROM client_quick_notes WHERE appointment_id = $1 AND store_id = $2 FOR UPDATE`, [appointmentId, storeId])).rows[0];
    let noteId: number;
    if (existing) {
      // The same visit saved again (a correction or a second tap): this visit's note changes, no other note does.
      await client.query(`UPDATE client_quick_notes SET details = $1, note_text = $2, template = $3, updated_at = now() WHERE id = $4`,
        [JSON.stringify(details), text, template.id, existing.id]);
      if (existing.client_note_id) await client.query(`UPDATE client_notes SET note_content = $1, updated_at = now() WHERE id = $2`, [text, existing.client_note_id]);
      noteId = existing.id;
    } else {
      const note = (await client.query(
        `INSERT INTO client_notes (client_id, store_id, created_by_user_id, note_type, visibility, note_content)
         VALUES ($1, $2, $3, 'quick_note', 'internal', $4) RETURNING id`, [visit.customer_id, storeId, userId, text])).rows[0];
      noteId = (await client.query(
        `INSERT INTO client_quick_notes (store_id, client_id, appointment_id, staff_id, created_by_user_id, template, details, note_text, client_note_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [storeId, visit.customer_id, appointmentId, visit.staff_id ?? null, userId, template.id, JSON.stringify(details), text, note.id])).rows[0].id;
    }
    await client.query("COMMIT");
    return res.json({ id: noteId, text });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[quick-notes] POST:", err);
    return res.status(500).json({ message: "Could not save the note" });
  } finally {
    client.release();
  }
});

router.get("/client/:id", isAuthenticated, async (req, res) => {
  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(403).json({ message: "No store context" });
    const clientId = Number(req.params.id);
    if (!Number.isInteger(clientId) || clientId <= 0) return res.json({ notes: [] });
    const rows = (await pool.query(
      `SELECT q.id, q.appointment_id, q.note_text, q.created_at, st.name AS staff_name, s.name AS service_name
         FROM client_quick_notes q LEFT JOIN staff st ON st.id = q.staff_id
         LEFT JOIN appointments a ON a.id = q.appointment_id LEFT JOIN services s ON s.id = a.service_id
        WHERE q.client_id = $1 AND q.store_id = $2 ORDER BY q.created_at DESC LIMIT 50`, [clientId, storeId])).rows;
    return res.json({ notes: rows.map((r) => ({ id: r.id, appointmentId: r.appointment_id, text: r.note_text, createdAt: r.created_at, staffName: r.staff_name ?? null, serviceName: r.service_name ?? null })) });
  } catch (err) {
    console.error("[quick-notes] GET client:", err);
    return res.status(500).json({ message: "Could not load the client's notes" });
  }
});

router.get("/client/:id/latest", isAuthenticated, async (req, res) => {
  try {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(403).json({ message: "No store context" });
    const clientId = Number(req.params.id);
    if (!Number.isInteger(clientId) || clientId <= 0) return res.json({ latest: null, remember: [] });
    const rows = (await pool.query(
      `SELECT q.note_text, q.details, q.created_at, st.name AS staff_name
         FROM client_quick_notes q LEFT JOIN staff st ON st.id = q.staff_id
        WHERE q.client_id = $1 AND q.store_id = $2 ORDER BY q.created_at DESC LIMIT 20`, [clientId, storeId])).rows;
    const latest = rows[0] ? { text: rows[0].note_text, createdAt: rows[0].created_at, staffName: rows[0].staff_name ?? null } : null;
    // What to remember: from the latest note that set any (a later visit without them doesn't erase them).
    const remember: string[] = rows.find((r) => Array.isArray(r.details?.remember) && r.details.remember.length)?.details.remember ?? [];
    return res.json({ latest, remember });
  } catch (err) {
    console.error("[quick-notes] GET latest:", err);
    return res.status(500).json({ message: "Could not load the client's notes" });
  }
});

export default router;
