/**
 * Last Cut Formula Engine — REST API (Phase 2). Contracts: Phase 1 review, section 8. Mounted at /api.
 * Off unless HAIRCUT_FORMULAS=on (every route answers 404 while off). /api/quick-notes/* is unchanged.
 *
 *   GET  /api/haircut-formula/status                           { enabled } — always answers, so screens can follow the switch
 *   GET  /api/clients/:id/haircut-formula                       the client's formula (default, or ?formulaId=): latest + last 5
 *   GET  /api/clients/:id/haircut-formula/history               full history, paged (?formulaId=&before=&limit=)
 *   POST /api/clients/:id/haircut-formula/versions              save a version { formulaId?, appointmentId?, spec, notes?, templateId?, source, idempotencyKey }
 *   POST /api/clients/:id/haircut-formula/repeat                the latest cut again, on a ticket { appointmentId, idempotencyKey }
 *   POST /api/haircut-formula/versions/:id/corrections          correct a past visit { spec, notes?, idempotencyKey }
 *   POST /api/haircut-formula/walk-ins/:versionId/attach        a walk-in's cut joins its client { clientId }
 *   GET  /api/haircut-formula/for-ticket/:appointmentId         what the Queue / Ticket popups show
 *   POST /api/haircut-formula/for-ticket/:appointmentId/versions save for a ticket: the client's formula, or a name-only walk-in record
 *   GET  /api/haircut-formula/for-checkin/:checkinId            same as for-ticket, for a waiting check-in card
 *   GET  /api/haircut-formula/versions/:id                       one record in full: what it says now and its corrections
 *   GET  /api/clients/:id/haircut-formulas                      the client's formulas (everyday + named; ?archived=1 includes archived)
 *   POST /api/clients/:id/haircut-formulas                      a named formula { label, templateId? }
 *   PATCH /api/haircut-formulas/:formulaId                      { label?, isDefault: true?, archived?: true|false } (never deleted)
 *   GET  /api/hairstyles/categories                             hairstyle categories
 *   GET  /api/hairstyles?q=&category=&scope=all|global|store&limit=   Certxa's published styles + this store's own
 *   GET  /api/hairstyles/:id                                     one style with its approved reference images
 *
 * Store only from resolveSessionStoreId(); another store's client, ticket or version answers 404. 201 for a new version,
 * 200 with the original on an idempotent retry. 400 bad input, 409 conflict, 422 spec failed validation.
 */
import { Router, type Request, type Response } from "express";
import type pg from "pg";
import { pool } from "../db";
import { isAuthenticated } from "../auth";
import { resolveSessionStoreId } from "../lib/sessionStore";
import {
  FormulaError, attachWalkIn, correctVersion, createNamedFormula, formulaForClient, getOrCreateDefaultFormula, haircutFormulasEnabled,
  hairstyleCategories, hairstyleDetails, historyForClient, insertVersion, listFormulas, loadTicket, r2Url, requireClient, saveForTicket, VISIBLE_IMAGE,
  searchHairstyles, toVersion, updateFormula, versionDetails,
} from "../lib/haircutFormulas";

const router = Router();

// Per route, never router.use(): this router is mounted at /api, so a router-wide check would answer every /api request.
const enabled = (_req: Request, res: Response, next: () => void) => (haircutFormulasEnabled() ? next() : res.status(404).json({ message: "Not found" }));

// Whether the tablet shows the Last Cut Formula screens (not gated itself: it is how screens learn the switch).
router.get("/haircut-formula/status", isAuthenticated, (_req, res) => res.json({ enabled: haircutFormulasEnabled() }));

const posInt = (v: unknown): number | null => {
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0 ? n : null;
};
const userIdOf = (req: Request): string | null => (req.session as any)?.userId ?? null;

/** Runs fn in one transaction with the audit actor set; maps FormulaError to its status. */
async function run(req: Request, res: Response, fn: (db: pg.PoolClient, storeId: number) => Promise<unknown>, label: string, okStatus = 200) {
  const storeId = await resolveSessionStoreId(req).catch(() => null);
  if (!storeId) return res.status(403).json({ message: "No store context" });
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query(`SELECT set_config('certxa.actor', $1, true)`, [`user:${userIdOf(req) ?? "unknown"} haircut-formula`]);
    const out: any = await fn(db, storeId);
    await db.query("COMMIT");
    if (out && typeof out === "object" && "replayed" in out) return res.status(out.replayed ? 200 : 201).json({ version: out.version });
    return res.status(okStatus).json(out);
  } catch (err) {
    await db.query("ROLLBACK").catch(() => {});
    if (err instanceof FormulaError) return res.status(err.status).json({ message: err.message });
    console.error(`[haircut-formula] ${label}:`, err);
    return res.status(500).json({ message: "Could not complete the haircut formula request" });
  } finally {
    db.release();
  }
}

const requireKey = (body: any): string => {
  const k = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  if (k.length < 8 || k.length > 120) throw new FormulaError(400, "idempotencyKey (8–120 characters) is required");
  return k;
};

router.get("/clients/:id/haircut-formula", enabled, isAuthenticated, (req, res) => run(req, res, async (db, storeId) => {
  const clientId = posInt(req.params.id);
  if (!clientId) throw new FormulaError(404, "Client not found");
  await requireClient(db, storeId, clientId);
  return formulaForClient(db, storeId, clientId, posInt(req.query.formulaId));
}, "GET formula"));

router.get("/clients/:id/haircut-formula/history", enabled, isAuthenticated, (req, res) => run(req, res, async (db, storeId) => {
  const clientId = posInt(req.params.id);
  if (!clientId) throw new FormulaError(404, "Client not found");
  await requireClient(db, storeId, clientId);
  const before = typeof req.query.before === "string" && !Number.isNaN(Date.parse(req.query.before)) ? req.query.before : null;
  return { versions: await historyForClient(db, storeId, clientId, { formulaId: posInt(req.query.formulaId), before, limit: posInt(req.query.limit) ?? 20 }) };
}, "GET history"));

router.post("/clients/:id/haircut-formula/versions", enabled, isAuthenticated, (req, res) => run(req, res, async (db, storeId) => {
  const clientId = posInt(req.params.id);
  if (!clientId) throw new FormulaError(404, "Client not found");
  const key = requireKey(req.body);
  const source = req.body?.source ?? "manual";
  if (!["checkout", "manual", "repeat"].includes(source)) throw new FormulaError(400, "source must be checkout, manual or repeat");
  await requireClient(db, storeId, clientId);
  const appointmentId = req.body?.appointmentId == null ? null : posInt(req.body.appointmentId);
  if (req.body?.appointmentId != null && !appointmentId) throw new FormulaError(400, "appointmentId must be a ticket id");
  if (appointmentId) {
    const ticket = await loadTicket(db, storeId, appointmentId);
    if (ticket.clientId !== clientId) throw new FormulaError(409, "That ticket belongs to another client");
    if (source === "checkout" || source === "repeat") {
      return saveForTicket(db, { storeId, appointmentId, spec: req.body?.spec, notes: req.body?.notes, templateId: posInt(req.body?.templateId),
        source, idempotencyKey: key, userId: userIdOf(req), staffId: posInt(req.body?.staffId) });
    }
  }
  const formulaId = posInt(req.body?.formulaId) ?? await getOrCreateDefaultFormula(db, storeId, clientId, userIdOf(req));
  return insertVersion(db, {
    storeId, formulaId, clientId, source, spec: req.body?.spec, notes: req.body?.notes, appointmentId, templateId: posInt(req.body?.templateId),
    staffId: posInt(req.body?.staffId), idempotencyKey: key, createdByUserId: userIdOf(req),
  });
}, "POST version"));

router.post("/clients/:id/haircut-formula/repeat", enabled, isAuthenticated, (req, res) => run(req, res, async (db, storeId) => {
  const clientId = posInt(req.params.id);
  const appointmentId = posInt(req.body?.appointmentId);
  if (!clientId) throw new FormulaError(404, "Client not found");
  if (!appointmentId) throw new FormulaError(400, "Which ticket is this cut for?");
  const key = requireKey(req.body);
  await requireClient(db, storeId, clientId);
  const ticket = await loadTicket(db, storeId, appointmentId);
  if (ticket.clientId !== clientId) throw new FormulaError(409, "That ticket belongs to another client");
  const [latest] = await historyForClient(db, storeId, clientId, { limit: 1 });
  if (!latest) throw new FormulaError(404, "This client has no saved cut to repeat yet");
  return saveForTicket(db, { storeId, appointmentId, spec: latest.spec, notes: latest.notes, templateId: latest.templateId, source: "repeat",
    idempotencyKey: key, userId: userIdOf(req) });
}, "POST repeat"));

router.post("/haircut-formula/versions/:id/corrections", enabled, isAuthenticated, (req, res) => run(req, res, async (db, storeId) => {
  const versionId = posInt(req.params.id);
  if (!versionId) throw new FormulaError(404, "Haircut record not found");
  return correctVersion(db, storeId, versionId, { spec: req.body?.spec, notes: req.body?.notes, idempotencyKey: requireKey(req.body), userId: userIdOf(req) });
}, "POST correction"));

router.post("/haircut-formula/walk-ins/:versionId/attach", enabled, isAuthenticated, (req, res) => run(req, res, async (db, storeId) => {
  const versionId = posInt(req.params.versionId);
  const clientId = posInt(req.body?.clientId);
  if (!versionId) throw new FormulaError(404, "Haircut record not found");
  if (!clientId) throw new FormulaError(400, "Which client?");
  return attachWalkIn(db, storeId, versionId, clientId, userIdOf(req));
}, "POST attach"));

/** What the popups show for a ticket: its client's latest cut, or this ticket's own walk-in record. */
async function forTicket(db: pg.PoolClient, storeId: number, appointmentId: number, ticketClientId: number | null) {
  let latest: any = null;
  if (ticketClientId != null) {
    [latest] = await historyForClient(db, storeId, ticketClientId, { limit: 1 });
  } else {
    const r = (await db.query(
      `SELECT v.*, st.name AS staff_name FROM client_haircut_formula_versions v LEFT JOIN staff st ON st.id = v.staff_id AND st.store_id = v.store_id
        WHERE v.store_id = $1 AND v.appointment_id = $2 AND v.formula_id IS NULL ORDER BY (v.source = 'correction') DESC, v.id DESC LIMIT 1`,
      [storeId, appointmentId])).rows[0];
    latest = r ? toVersion(r) : null;
  }
  if (!latest) return { clientId: ticketClientId, latest: null, hairstyle: null, images: [] };
  const style = latest.templateId ? (await db.query(
    `SELECT id, name, slug FROM hairstyle_templates WHERE id = $1 AND (store_id IS NULL OR store_id = $2)`, [latest.templateId, storeId])).rows[0] : null;
  const images = style ? (await db.query(
    `SELECT view, r2_key, alt_text FROM hairstyle_template_images WHERE template_id = $1 AND ${VISIBLE_IMAGE} ORDER BY display_order, id`,
    [style.id])).rows.map((i) => ({ view: i.view, url: r2Url(i.r2_key), altText: i.alt_text })) : [];
  return { clientId: ticketClientId, latest, hairstyle: style ? { id: style.id, name: style.name, slug: style.slug } : null, images };
}

router.get("/haircut-formula/for-ticket/:appointmentId", enabled, isAuthenticated, (req, res) => run(req, res, async (db, storeId) => {
  const appointmentId = posInt(req.params.appointmentId);
  if (!appointmentId) throw new FormulaError(404, "Ticket not found");
  const ticket = await loadTicket(db, storeId, appointmentId);
  return forTicket(db, storeId, appointmentId, ticket.clientId);
}, "GET for-ticket"));

router.post("/haircut-formula/for-ticket/:appointmentId/versions", enabled, isAuthenticated, (req, res) => run(req, res, async (db, storeId) => {
  const appointmentId = posInt(req.params.appointmentId);
  if (!appointmentId) throw new FormulaError(404, "Ticket not found");
  return saveForTicket(db, { storeId, appointmentId, spec: req.body?.spec, notes: req.body?.notes, templateId: posInt(req.body?.templateId),
    idempotencyKey: requireKey(req.body), userId: userIdOf(req), staffId: posInt(req.body?.staffId) });
}, "POST for-ticket"));

router.get("/haircut-formula/for-checkin/:checkinId", enabled, isAuthenticated, (req, res) => run(req, res, async (db, storeId) => {
  const checkinId = posInt(req.params.checkinId);
  if (!checkinId) throw new FormulaError(404, "Check-in not found");
  const c = (await db.query(`SELECT client_id FROM kiosk_checkins WHERE id = $1 AND store_id = $2`, [checkinId, storeId])).rows[0];
  if (!c) throw new FormulaError(404, "Check-in not found");
  if (c.client_id == null) return { clientId: null, latest: null, hairstyle: null, images: [] };
  return forTicket(db, storeId, 0, c.client_id);
}, "GET for-checkin"));

router.get("/haircut-formula/versions/:id", enabled, isAuthenticated, (req, res) => run(req, res, async (db, storeId) => {
  const versionId = posInt(req.params.id);
  if (!versionId) throw new FormulaError(404, "Haircut record not found");
  return versionDetails(db, storeId, versionId);
}, "GET version"));

router.get("/clients/:id/haircut-formulas", enabled, isAuthenticated, (req, res) => run(req, res, async (db, storeId) => {
  const clientId = posInt(req.params.id);
  if (!clientId) throw new FormulaError(404, "Client not found");
  await requireClient(db, storeId, clientId);
  return { formulas: await listFormulas(db, storeId, clientId, req.query.archived === "1") };
}, "GET formulas"));

router.post("/clients/:id/haircut-formulas", enabled, isAuthenticated, (req, res) => run(req, res, async (db, storeId) => {
  const clientId = posInt(req.params.id);
  if (!clientId) throw new FormulaError(404, "Client not found");
  return { formula: await createNamedFormula(db, storeId, clientId, { label: req.body?.label, templateId: posInt(req.body?.templateId), userId: userIdOf(req) }) };
}, "POST formula", 201));

router.patch("/haircut-formulas/:formulaId", enabled, isAuthenticated, (req, res) => run(req, res, async (db, storeId) => {
  const formulaId = posInt(req.params.formulaId);
  if (!formulaId) throw new FormulaError(404, "Formula not found");
  const { label, isDefault, archived } = req.body ?? {};
  if (label === undefined && isDefault !== true && typeof archived !== "boolean") throw new FormulaError(400, "Nothing to change");
  return { formula: await updateFormula(db, storeId, formulaId, { label, isDefault, archived }) };
}, "PATCH formula"));

router.get("/hairstyles/categories", enabled, isAuthenticated, (req, res) => run(req, res, async (db) => ({ categories: await hairstyleCategories(db) }), "GET categories"));

router.get("/hairstyles", enabled, isAuthenticated, (req, res) => run(req, res, async (db, storeId) => ({
  hairstyles: await searchHairstyles(db, storeId, {
    q: typeof req.query.q === "string" ? req.query.q : null, category: typeof req.query.category === "string" ? req.query.category : null,
    scope: typeof req.query.scope === "string" ? req.query.scope : null, limit: posInt(req.query.limit) ?? 30,
  }),
}), "GET hairstyles"));

router.get("/hairstyles/:id", enabled, isAuthenticated, (req, res) => run(req, res, async (db, storeId) => {
  const id = posInt(req.params.id);
  if (!id) throw new FormulaError(404, "Hairstyle not found");
  return hairstyleDetails(db, storeId, id);
}, "GET hairstyle"));

export default router;
