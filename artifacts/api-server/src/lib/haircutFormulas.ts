/**
 * Last Cut Formula Engine — the server side of haircut formulas (Phase 2). Tables: migrations 0352–0356.
 *
 *   A client has formulas in one store (one everyday "default" formula, plus named ones). A formula has versions: one
 *   per cut, never edited (the database refuses). A wrong version is fixed by a `correction` version that points at it;
 *   readers show the newest correction in its place. A name-only walk-in's cut is a `walk_in` version with no formula
 *   and no client, tied to its ticket; it joins a client's formula later with attachWalkIn().
 *
 * Every function takes a pg client that is already inside a transaction (BEGIN … COMMIT is the caller's), and a storeId
 * that came from resolveSessionStoreId(). Every statement filters on store_id as well; the composite foreign keys refuse
 * cross-store writes even if a filter were missing.
 *
 * Switch: HAIRCUT_FORMULAS=on turns the routes and the Quick Notes double save on (off by default). The client-merge
 * move (lib/clientMerge.ts) runs either way.
 */
import type pg from "pg";
import { checkSpecForSave, isHaircutTemplate, quickNoteToSpec, type HaircutSpec } from "@shared/haircutFormula";
import type { QuickNoteChoices } from "@shared/quickNotes";

type Db = pg.PoolClient;

export const haircutFormulasEnabled = (): boolean => process.env.HAIRCUT_FORMULAS === "on";

export type VersionSource = "checkout" | "manual" | "repeat" | "correction" | "walk_in" | "quick_note_backfill";

export class FormulaError extends Error {
  constructor(public status: 400 | 404 | 409 | 422, message: string) { super(message); }
}

const VERSION_COLUMNS = `v.id, v.formula_id, v.version_number, v.client_id, v.appointment_id, v.staff_id, v.visit_at, v.spec, v.spec_version,
  v.template_id, v.hairstyle_name, v.category_name, v.notes, v.source, v.corrects_version_id, v.quick_note_id, v.created_at`;

export function toVersion(r: any) {
  return {
    id: r.id, formulaId: r.formula_id, versionNumber: r.version_number, clientId: r.client_id, appointmentId: r.appointment_id,
    staffId: r.staff_id, staffName: r.staff_name ?? null, visitAt: r.visit_at ?? r.created_at, spec: r.spec, specVersion: r.spec_version,
    templateId: r.template_id, hairstyleName: r.hairstyle_name, categoryName: r.category_name, notes: r.notes, source: r.source,
    correctsVersionId: r.corrects_version_id, quickNoteId: r.quick_note_id, createdAt: r.created_at,
  };
}

/** The client must be a live client of this store; otherwise 404 (never confirm another store's ids). */
export async function requireClient(db: Db, storeId: number, clientId: number): Promise<void> {
  const r = await db.query(`SELECT 1 FROM clients WHERE id = $1 AND store_id = $2 AND archived_at IS NULL`, [clientId, storeId]);
  if (!r.rowCount) throw new FormulaError(404, "Client not found");
}

/** The client's everyday formula, created on first use. Locked FOR UPDATE, so version numbers can be taken safely. */
export async function getOrCreateDefaultFormula(db: Db, storeId: number, clientId: number, userId: string | null): Promise<number> {
  const find = () => db.query(
    `SELECT id FROM client_haircut_formulas WHERE store_id = $1 AND client_id = $2 AND is_default AND NOT is_archived FOR UPDATE`, [storeId, clientId]);
  let row = (await find()).rows[0];
  if (row) return row.id;
  await db.query(
    `INSERT INTO client_haircut_formulas (store_id, client_id, is_default, created_by_user_id) VALUES ($1, $2, true, $3)
     ON CONFLICT (store_id, client_id) WHERE is_default AND NOT is_archived DO NOTHING`, [storeId, clientId, userId]);
  row = (await find()).rows[0];
  return row.id;
}

/** A formula of this client in this store, locked. */
async function lockFormula(db: Db, storeId: number, clientId: number, formulaId: number): Promise<void> {
  const r = await db.query(
    `SELECT 1 FROM client_haircut_formulas WHERE id = $1 AND store_id = $2 AND client_id = $3 AND NOT is_archived FOR UPDATE`, [formulaId, storeId, clientId]);
  if (!r.rowCount) throw new FormulaError(404, "Formula not found");
}

/** Template snapshot (name + category) for a style this store may use: a global one, or its own. */
async function templateSnapshot(db: Db, storeId: number, templateId: number | null | undefined) {
  if (!templateId) return { templateId: null, templateScope: null, hairstyleName: null, categoryName: null };
  const r = (await db.query(
    `SELECT t.id, t.scope_key, t.name, c.name AS category FROM hairstyle_templates t LEFT JOIN hairstyle_categories c ON c.id = t.category_id
      WHERE t.id = $1 AND (t.store_id IS NULL OR t.store_id = $2)`, [templateId, storeId])).rows[0];
  if (!r) throw new FormulaError(404, "Hairstyle not found");
  return { templateId: r.id, templateScope: r.scope_key, hairstyleName: r.name, categoryName: r.category ?? null };
}

export interface NewVersion {
  storeId: number;
  formulaId: number | null;          // null only for a walk-in
  clientId: number | null;
  source: VersionSource;
  spec: unknown;
  appointmentId?: number | null;
  staffId?: number | null;
  visitAt?: Date | string | null;
  notes?: string | null;
  templateId?: number | null;
  correctsVersionId?: number | null;
  quickNoteId?: number | null;
  idempotencyKey?: string | null;
  createdByUserId?: string | null;
  createdByStaffId?: number | null;
}

/**
 * Adds one version. The formula row is locked first, so two saves at once get numbers N and N+1 (concurrency test C1).
 * With an idempotency key, a retry returns the version saved the first time (`replayed: true`) instead of a second row.
 */
export async function insertVersion(db: Db, n: NewVersion): Promise<{ version: ReturnType<typeof toVersion>; replayed: boolean }> {
  const checked = checkSpecForSave(n.spec);
  if (!checked.ok) throw new FormulaError(422, checked.message);
  const key = n.idempotencyKey?.trim() || null;
  if (key !== null && (key.length < 8 || key.length > 120)) throw new FormulaError(400, "idempotencyKey must be 8–120 characters");

  const replay = async () => {
    if (key === null) return null;
    const r = (await db.query(`SELECT ${VERSION_COLUMNS} FROM client_haircut_formula_versions v WHERE v.store_id = $1 AND v.idempotency_key = $2`, [n.storeId, key])).rows[0];
    return r ? { version: toVersion(r), replayed: true } : null;
  };
  const earlier = await replay();
  if (earlier) return earlier;

  if (n.formulaId != null) await lockFormula(db, n.storeId, n.clientId as number, n.formulaId);
  const number = n.formulaId == null ? null : (await db.query(
    `SELECT coalesce(max(version_number), 0) + 1 AS next FROM client_haircut_formula_versions WHERE formula_id = $1 AND store_id = $2`,
    [n.formulaId, n.storeId])).rows[0].next;
  const t = await templateSnapshot(db, n.storeId, n.templateId ?? checked.spec.style?.templateId);
  const notes = typeof n.notes === "string" ? n.notes.trim().slice(0, 1000) || null : null;

  await db.query("SAVEPOINT chfv_insert");
  try {
    const r = (await db.query(
      `INSERT INTO client_haircut_formula_versions AS v
         (store_id, formula_id, version_number, client_id, appointment_id, staff_id, visit_at, spec, spec_version, template_id, template_scope,
          hairstyle_name, category_name, notes, source, corrects_version_id, quick_note_id, idempotency_key, created_by_user_id, created_by_staff_id)
       VALUES ($1, $2, $3, $4, $5, $6, coalesce($7::timestamptz, now()), $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       RETURNING ${VERSION_COLUMNS}`,
      [n.storeId, n.formulaId, number, n.clientId, n.appointmentId ?? null, n.staffId ?? null, n.visitAt ?? null, JSON.stringify(checked.spec),
       checked.spec.v, t.templateId, t.templateScope, t.hairstyleName, t.categoryName, notes, n.source, n.correctsVersionId ?? null,
       n.quickNoteId ?? null, key, n.createdByUserId ?? null, n.createdByStaffId ?? null])).rows[0];
    await db.query("RELEASE SAVEPOINT chfv_insert");
    return { version: toVersion(r), replayed: false };
  } catch (err: any) {
    await db.query("ROLLBACK TO SAVEPOINT chfv_insert");
    if (err?.code === "23505" && err?.constraint === "chfv_idempotency_uidx") {
      const again = await replay();
      if (again) return again;
    }
    if (err?.code === "23505" && err?.constraint === "chfv_one_visit_record_uidx") throw new FormulaError(409, "This visit already has a haircut record. Save a correction instead.");
    if (err?.code === "23503") throw new FormulaError(404, "Ticket, barber or client not found in this store");
    if (err?.code === "P0001") throw new FormulaError(409, err.message);
    throw err;
  }
}

/** Ticket facts the formula needs: its client, barber and when it was done. 404 for another store's ticket. */
export async function loadTicket(db: Db, storeId: number, appointmentId: number) {
  const r = (await db.query(
    `SELECT id, customer_id, staff_id, status, COALESCE(completed_at, date) AS visit_at FROM appointments WHERE id = $1 AND store_id = $2`,
    [appointmentId, storeId])).rows[0];
  if (!r) throw new FormulaError(404, "Ticket not found");
  return { id: r.id as number, clientId: (r.customer_id ?? null) as number | null, staffId: (r.staff_id ?? null) as number | null, status: r.status as string, visitAt: r.visit_at };
}

/** The visit's original record (checkout / walk-in / backfill), if any. */
async function originalForTicket(db: Db, storeId: number, appointmentId: number) {
  return (await db.query(
    `SELECT ${VERSION_COLUMNS} FROM client_haircut_formula_versions v
      WHERE v.store_id = $1 AND v.appointment_id = $2 AND v.source IN ('checkout', 'walk_in', 'quick_note_backfill')`, [storeId, appointmentId])).rows[0] ?? null;
}

/** What a record currently says: its newest correction, or itself. */
async function effective(db: Db, storeId: number, versionId: number) {
  return (await db.query(
    `SELECT ${VERSION_COLUMNS} FROM client_haircut_formula_versions v
      WHERE v.store_id = $1 AND (v.id = $2 OR v.corrects_version_id = $2) ORDER BY (v.id = $2), v.id DESC LIMIT 1`, [storeId, versionId])).rows[0];
}

// jsonb stores keys in its own order, so compare with sorted keys.
const canonical = (x: unknown): unknown =>
  Array.isArray(x) ? x.map(canonical) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, canonical((x as any)[k])])) : x;
export const sameSpec = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/**
 * Saves a haircut for a ticket: the client's formula when the ticket has a client, a walk-in record when it has only a
 * name. Saving the same ticket again adds a correction (history keeps both); saving the same thing again adds nothing.
 */
export async function saveForTicket(db: Db, a: {
  storeId: number; appointmentId: number; spec: unknown; notes?: string | null; templateId?: number | null; quickNoteId?: number | null;
  source?: "checkout" | "repeat"; idempotencyKey?: string | null; userId: string | null; staffId?: number | null;
}) {
  const ticket = await loadTicket(db, a.storeId, a.appointmentId);
  const original = await originalForTicket(db, a.storeId, a.appointmentId);
  if (original) {
    const current = await effective(db, a.storeId, original.id);
    const checked = checkSpecForSave(a.spec);
    if (checked.ok && sameSpec(current.spec, checked.spec) && (a.notes ?? null) === (current.notes ?? null)) return { version: toVersion(current), replayed: true };
    return insertVersion(db, {
      storeId: a.storeId, formulaId: original.formula_id, clientId: original.client_id, source: "correction", spec: a.spec, notes: a.notes,
      appointmentId: a.appointmentId, staffId: original.staff_id, visitAt: original.visit_at, templateId: a.templateId, correctsVersionId: original.id,
      idempotencyKey: a.idempotencyKey ?? null, createdByUserId: a.userId, createdByStaffId: a.staffId ?? null,
    });
  }
  if (ticket.clientId == null) {
    return insertVersion(db, {
      storeId: a.storeId, formulaId: null, clientId: null, source: "walk_in", spec: a.spec, notes: a.notes, appointmentId: ticket.id,
      staffId: ticket.staffId, visitAt: ticket.visitAt, templateId: a.templateId, idempotencyKey: a.idempotencyKey ?? null,
      createdByUserId: a.userId, createdByStaffId: a.staffId ?? null,
    });
  }
  const formulaId = await getOrCreateDefaultFormula(db, a.storeId, ticket.clientId, a.userId);
  return insertVersion(db, {
    storeId: a.storeId, formulaId, clientId: ticket.clientId, source: a.source ?? "checkout", spec: a.spec, notes: a.notes,
    appointmentId: ticket.id, staffId: ticket.staffId, visitAt: ticket.visitAt, templateId: a.templateId, quickNoteId: a.quickNoteId ?? null,
    idempotencyKey: a.idempotencyKey ?? null, createdByUserId: a.userId, createdByStaffId: a.staffId ?? null,
  });
}

/**
 * Quick Notes double save (called inside POST /api/quick-notes' transaction, after the note row is written). Only haircut
 * templates. Runs under a savepoint: if anything here fails, the Quick Note is still saved exactly as before and the
 * failure is logged; the backfill can copy that note later.
 */
export async function saveQuickNoteVersion(db: Db, a: {
  storeId: number; appointmentId: number; quickNoteId: number; templateId: string; choices: QuickNoteChoices; extra: string; userId: string | null;
}): Promise<void> {
  if (!haircutFormulasEnabled() || !isHaircutTemplate(a.templateId)) return;
  await db.query("SAVEPOINT lcf_quick_note");
  try {
    const spec: HaircutSpec = quickNoteToSpec(a.templateId, a.choices, a.extra);
    const linked = (await db.query(`SELECT 1 FROM client_haircut_formula_versions WHERE store_id = $1 AND quick_note_id = $2`, [a.storeId, a.quickNoteId])).rowCount;
    await saveForTicket(db, {
      storeId: a.storeId, appointmentId: a.appointmentId, spec, userId: a.userId,
      // The first record of the visit carries the Quick Note link; later saves are corrections without it (one version per note).
      quickNoteId: linked ? null : a.quickNoteId,
      idempotencyKey: linked ? null : `quick-note:${a.appointmentId}`,
    });
    await db.query("RELEASE SAVEPOINT lcf_quick_note");
  } catch (err) {
    await db.query("ROLLBACK TO SAVEPOINT lcf_quick_note");
    console.error("[haircut-formula] Quick Note double save skipped:", err instanceof Error ? err.message : err);
  }
}

/** Ties a walk-in's cut to the client its ticket now belongs to (their everyday formula, next number, visit time kept). */
export async function attachWalkIn(db: Db, storeId: number, versionId: number, clientId: number, userId: string | null) {
  const v = (await db.query(`SELECT ${VERSION_COLUMNS} FROM client_haircut_formula_versions v WHERE v.id = $1 AND v.store_id = $2 FOR UPDATE`, [versionId, storeId])).rows[0];
  if (!v) throw new FormulaError(404, "Haircut record not found");
  if (v.formula_id != null) {
    if (v.client_id === clientId) return { version: toVersion(v), replayed: true };
    throw new FormulaError(409, "This haircut record already belongs to a client");
  }
  if (v.source !== "walk_in") throw new FormulaError(409, "Link the original walk-in visit first");
  await requireClient(db, storeId, clientId);
  const ticket = await loadTicket(db, storeId, v.appointment_id);
  if (ticket.clientId !== clientId) throw new FormulaError(409, "Put the client on the ticket first");
  const formulaId = await getOrCreateDefaultFormula(db, storeId, clientId, userId);
  const next = (await db.query(`SELECT coalesce(max(version_number), 0) + 1 AS next FROM client_haircut_formula_versions WHERE formula_id = $1 AND store_id = $2`, [formulaId, storeId])).rows[0].next;
  const corrections = (await db.query(`SELECT id FROM client_haircut_formula_versions WHERE corrects_version_id = $1 AND store_id = $2 ORDER BY id FOR UPDATE`, [versionId, storeId])).rows;
  try {
    await db.query(`UPDATE client_haircut_formula_versions SET formula_id = $1, version_number = $2, client_id = $3 WHERE id = $4 AND store_id = $5`, [formulaId, next, clientId, versionId, storeId]);
    let n = next;
    for (const c of corrections) await db.query(`UPDATE client_haircut_formula_versions SET formula_id = $1, version_number = $2, client_id = $3 WHERE id = $4 AND store_id = $5`, [formulaId, ++n, clientId, c.id, storeId]);
  } catch (err: any) {
    if (err?.code === "P0001") throw new FormulaError(409, err.message);
    throw err;
  }
  return { version: toVersion((await db.query(`SELECT ${VERSION_COLUMNS} FROM client_haircut_formula_versions v WHERE v.id = $1`, [versionId])).rows[0]), replayed: false };
}

// ── Reading ───────────────────────────────────────────────────────────────────────
// A record's corrections replace it on screen; history order is by visit time.

const EFFECTIVE_SQL = `
  WITH roots AS (
    SELECT v.* FROM client_haircut_formula_versions v
     WHERE v.store_id = $1 AND v.client_id = $2 AND v.source <> 'correction' AND ($3::int IS NULL OR v.formula_id = $3)
  ), eff AS (
    SELECT r.id AS root_id, coalesce(r.visit_at, r.created_at) AS sort_at,
           (SELECT c.id FROM client_haircut_formula_versions c WHERE c.corrects_version_id = r.id AND c.store_id = r.store_id ORDER BY c.id DESC LIMIT 1) AS corr_id
      FROM roots r
  )
  SELECT ${VERSION_COLUMNS}, st.name AS staff_name, e.root_id, e.sort_at
    FROM eff e JOIN client_haircut_formula_versions v ON v.id = coalesce(e.corr_id, e.root_id)
    LEFT JOIN staff st ON st.id = v.staff_id AND st.store_id = v.store_id
   WHERE ($4::timestamptz IS NULL OR e.sort_at < $4)
   ORDER BY e.sort_at DESC, e.root_id DESC
   LIMIT $5`;

export async function historyForClient(db: Db | pg.Pool, storeId: number, clientId: number, opts: { formulaId?: number | null; before?: string | null; limit?: number } = {}) {
  const rows = (await db.query(EFFECTIVE_SQL, [storeId, clientId, opts.formulaId ?? null, opts.before ?? null, Math.min(Math.max(opts.limit ?? 20, 1), 100)])).rows;
  return rows.map((r) => ({ ...toVersion(r), recordId: r.root_id, corrected: r.id !== r.root_id }));
}

export async function formulaForClient(db: Db | pg.Pool, storeId: number, clientId: number, formulaId?: number | null) {
  const f = (await db.query(
    `SELECT id, label, is_default, template_id, created_at, updated_at FROM client_haircut_formulas
      WHERE store_id = $1 AND client_id = $2 AND NOT is_archived AND (($3::int IS NULL AND is_default) OR id = $3)`, [storeId, clientId, formulaId ?? null])).rows[0];
  if (!f) return { formula: null, latest: null, history: [] };
  const history = await historyForClient(db, storeId, clientId, { formulaId: f.id, limit: 5 });
  return {
    formula: { id: f.id, label: f.label, isDefault: f.is_default, templateId: f.template_id, createdAt: f.created_at, updatedAt: f.updated_at },
    latest: history[0] ?? null,
    history: history.map((h) => ({ id: h.id, visitAt: h.visitAt, staffName: h.staffName, hairstyleName: h.hairstyleName })),
  };
}

/** Copies a version as a correction of a past visit. */
export async function correctVersion(db: Db, storeId: number, versionId: number, a: { spec: unknown; notes?: string | null; idempotencyKey: string; userId: string | null }) {
  const v = (await db.query(`SELECT ${VERSION_COLUMNS} FROM client_haircut_formula_versions v WHERE v.id = $1 AND v.store_id = $2`, [versionId, storeId])).rows[0];
  if (!v) throw new FormulaError(404, "Haircut record not found");
  const root = v.source === "correction" ? v.corrects_version_id : v.id;
  const r = (await db.query(`SELECT ${VERSION_COLUMNS} FROM client_haircut_formula_versions v WHERE v.id = $1 AND v.store_id = $2`, [root, storeId])).rows[0];
  return insertVersion(db, {
    storeId, formulaId: r.formula_id, clientId: r.client_id, source: "correction", spec: a.spec, notes: a.notes, appointmentId: r.appointment_id,
    staffId: r.staff_id, visitAt: r.visit_at, correctsVersionId: r.id, idempotencyKey: a.idempotencyKey, createdByUserId: a.userId,
  });
}

/**
 * One-time copy of existing haircut Quick Notes into formula history (`quick_note_backfill`), oldest first, idempotent
 * through the one-version-per-Quick-Note index. Not run automatically: owner decision (Phase 1 decision 9).
 */
export async function backfillQuickNoteVersions(db: Db, storeId: number): Promise<number> {
  const notes = (await db.query(
    `SELECT q.id, q.client_id, q.appointment_id, q.staff_id, q.template, q.details, q.created_at, COALESCE(a.completed_at, a.date) AS visit_at, a.customer_id
       FROM client_quick_notes q LEFT JOIN appointments a ON a.id = q.appointment_id AND a.store_id = q.store_id
      WHERE q.store_id = $1 AND q.template IN ('barber', 'hair')
        AND NOT EXISTS (SELECT 1 FROM client_haircut_formula_versions v WHERE v.quick_note_id = q.id)
      ORDER BY q.created_at, q.id`, [storeId])).rows;
  let copied = 0;
  for (const q of notes) {
    // A ticket already moved to someone else, or with its own record, can't carry this note's link: skip it.
    if (q.appointment_id != null && q.customer_id !== q.client_id) continue;
    if (q.appointment_id != null && await originalForTicket(db, storeId, q.appointment_id)) continue;
    const formulaId = await getOrCreateDefaultFormula(db, storeId, q.client_id, null);
    await insertVersion(db, {
      storeId, formulaId, clientId: q.client_id, source: "quick_note_backfill",
      spec: quickNoteToSpec(q.template, q.details?.choices ?? {}, q.details?.extra ?? ""), appointmentId: q.appointment_id, staffId: q.staff_id,
      visitAt: q.visit_at ?? q.created_at, quickNoteId: q.id, idempotencyKey: `quick-note-backfill:${q.id}`,
    });
    copied++;
  }
  return copied;
}
