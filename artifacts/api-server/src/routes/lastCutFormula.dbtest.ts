// Last Cut Formula Engine, Phase 2 — the real routes (Quick Notes, haircut formulas, client merge) on a disposable database
// with the production structure. Run with scripts/lcf-dbtest.sh only (vitest.dbtest.config.ts refuses any other database).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

vi.mock("../auth", () => ({ isAuthenticated: (_q: unknown, _s: unknown, n: () => void) => n() }));
// The store is the signed-in user's own store; here a test header says which (resolveSessionStoreId's job in production).
vi.mock("../lib/sessionStore", () => ({ resolveSessionStoreId: async (req: any) => Number(req.headers["x-store"]) || null }));

import { pool } from "../db";
import quickNotesRouter from "./quickNotes";
import haircutFormulasRouter from "./haircutFormulas";
import clientsRouter from "./clients";

const A = 9301, B = 9302, NAIL = 9303;
let server: Server;
let base = "";
const q = async (text: string, params: unknown[] = []) => (await pool.query(text, params)).rows;
const call = async (method: string, path: string, store: number, body?: unknown) => {
  const r = await fetch(`${base}${path}`, {
    method, headers: { "content-type": "application/json", "x-store": String(store), "x-user": "u-lcf" }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) as any };
};
const versionsOf = (clientId: number) => q(`SELECT * FROM client_haircut_formula_versions WHERE client_id = $1 ORDER BY id`, [clientId]);
const ticketRow = (id: number) => q(`SELECT md5(a::text) h FROM appointments a WHERE id = $1`, [id]).then((r) => r[0].h);

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.session = { userId: req.headers["x-user"] }; next(); });
  app.use("/api/quick-notes", quickNotesRouter);
  app.use("/api", haircutFormulasRouter);
  app.use("/api/clients", clientsRouter);
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", () => ok()); });
  base = `http://127.0.0.1:${(server.address() as any).port}`;

  await q(`INSERT INTO users (id, email, password) VALUES ('u-lcf', 'lcf@example.invalid', 'x')`);
  await q(`INSERT INTO locations (id, name, category) VALUES ($1, 'Barber A', 'Barbershop'), ($2, 'Barber B', 'Barbershop'), ($3, 'Nails', 'Nail Salon')`, [A, B, NAIL]);
  await q(`INSERT INTO hairstyle_categories (id, slug, name, display_order) VALUES (1, 'fades-and-tapers', 'Fades and Tapers', 1) ON CONFLICT DO NOTHING`);
  await q(`INSERT INTO clients (id, store_id, first_name) VALUES
    (7301, $1, 'Ann'), (7302, $1, 'Ben'), (7303, $1, 'Cy'), (7304, $1, 'Dee'), (7305, $2, 'Other'), (7306, $3, 'Nail client'), (7307, $1, 'Walk Later')`, [A, B, NAIL]);
  await q(`INSERT INTO staff (id, store_id, name) VALUES (8301, $1, 'Barber One'), (8302, $2, 'Barber Two'), (8303, $3, 'Nail Tech')`, [A, B, NAIL]);
  await q(`INSERT INTO appointments (id, store_id, date, duration, customer_id, staff_id, status, total_paid) VALUES
    (6301, $1, now() - interval '20 days', 30, 7301, 8301, 'completed', '30'), (6302, $1, now() - interval '10 days', 30, 7301, 8301, 'completed', '30'),
    (6303, $1, now() - interval '5 days', 30, NULL, 8301, 'completed', '25'),   (6304, $1, now(), 30, 7301, 8301, 'pending', '0'),
    (6305, $2, now(), 30, 7305, 8302, 'completed', '20'),                       (6306, $3, now(), 30, 7306, 8303, 'completed', '40'),
    (6307, $1, now() - interval '3 days', 30, 7302, 8301, 'completed', '30'),  (6308, $1, now() - interval '2 days', 30, 7303, 8301, 'completed', '30'),
    (6309, $1, now() - interval '1 day', 30, 7304, 8301, 'completed', '30'),   (6310, $1, now(), 30, 7301, 8301, 'completed', '30')`, [A, B, NAIL]);
  await q(`INSERT INTO hairstyle_templates (id, store_id, category_id, slug, name, status) VALUES (5301, NULL, 1, 'mid-skin-fade', 'Mid Skin Fade', 'published')`);
});

afterAll(async () => { await new Promise((ok) => server.close(ok)); await pool.end(); });

describe("Quick Notes double save", () => {
  it("D1 a barbershop Quick Note also saves an unchangeable formula version", async () => {
    const before = await ticketRow(6301);
    const r = await call("POST", "/api/quick-notes", A, { appointmentId: 6301, choices: { guard: ["#1"], fade: ["Mid", "Skin Fade"] }, extra: "Keep the crown full" });
    expect(r.status).toBe(200);
    expect(r.body.text).toBeTruthy();
    const [v] = await versionsOf(7301);
    expect(v).toMatchObject({ source: "checkout", appointment_id: 6301, staff_id: 8301, version_number: 1, idempotency_key: "quick-note:6301", quick_note_id: r.body.id });
    expect(v.spec).toMatchObject({ v: 1, sides: { guard: ["#1"] }, fade: { type: "skin", height: "mid" }, instructions: "Keep the crown full" });
    const [f] = await q(`SELECT * FROM client_haircut_formulas WHERE id = $1`, [v.formula_id]);
    expect(f).toMatchObject({ client_id: 7301, store_id: A, is_default: true });
    expect(await ticketRow(6301)).toBe(before); // the ticket (Queue / Checkout data) is untouched
  });

  it("D2 the same note again adds nothing; a changed note adds a correction and the history shows it", async () => {
    await call("POST", "/api/quick-notes", A, { appointmentId: 6301, choices: { guard: ["#1"], fade: ["Mid", "Skin Fade"] }, extra: "Keep the crown full" });
    expect((await versionsOf(7301)).length).toBe(1);
    const r = await call("POST", "/api/quick-notes", A, { appointmentId: 6301, choices: { guard: ["#2"] }, extra: "" });
    expect(r.status).toBe(200);
    const vs = await versionsOf(7301);
    expect(vs.length).toBe(2);
    expect(vs[1]).toMatchObject({ source: "correction", corrects_version_id: vs[0].id, quick_note_id: null, appointment_id: 6301, version_number: 2 });
    expect(vs[0].spec.sides.guard).toEqual(["#1"]); // the original is never rewritten
    const g = await call("GET", "/api/clients/7301/haircut-formula", A);
    expect(g.status).toBe(200);
    expect(g.body.latest.spec.sides.guard).toEqual(["#2"]);
    expect(g.body.latest.corrected).toBe(true);
    expect(g.body.history.length).toBe(1);
    // The Quick Notes contract is unchanged.
    const qn = await call("GET", "/api/quick-notes/appointment/6301", A);
    expect(qn.body).toMatchObject({ available: true, clientId: 7301, saved: { choices: { guard: ["#2"] } } });
  });

  it("D3 a nail salon's Quick Note saves no haircut version", async () => {
    const r = await call("POST", "/api/quick-notes", NAIL, { appointmentId: 6306, choices: { shape: "Square" }, extra: "" });
    expect(r.status).toBe(200);
    expect((await versionsOf(7306)).length).toBe(0);
  });

  it("D4 if the formula save fails, the Quick Note still saves exactly as before", async () => {
    await q(`CREATE FUNCTION lcf_dbtest_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced formula failure'; END $$`);
    await q(`CREATE TRIGGER lcf_dbtest_fail_trg BEFORE INSERT ON client_haircut_formula_versions FOR EACH ROW EXECUTE FUNCTION lcf_dbtest_fail()`);
    try {
      const r = await call("POST", "/api/quick-notes", A, { appointmentId: 6302, choices: { guard: ["#3"] }, extra: "" });
      expect(r.status).toBe(200);
      expect((await q(`SELECT count(*)::int n FROM client_quick_notes WHERE appointment_id = 6302`))[0].n).toBe(1);
      expect((await q(`SELECT count(*)::int n FROM client_haircut_formula_versions WHERE appointment_id = 6302`))[0].n).toBe(0);
    } finally {
      await q(`DROP TRIGGER lcf_dbtest_fail_trg ON client_haircut_formula_versions`); await q(`DROP FUNCTION lcf_dbtest_fail()`);
    }
  });

  it("D5 switched off: no double save and every formula route is 404, other /api routes unaffected", async () => {
    process.env.HAIRCUT_FORMULAS = "off";
    try {
      const r = await call("POST", "/api/quick-notes", A, { appointmentId: 6307, choices: { guard: ["#4"] }, extra: "" });
      expect(r.status).toBe(200);
      expect((await versionsOf(7302)).length).toBe(0);
      expect((await call("GET", "/api/clients/7301/haircut-formula", A)).status).toBe(404);
      expect((await call("GET", "/api/haircut-formula/for-ticket/6301", A)).status).toBe(404);
      expect((await call("GET", "/api/quick-notes/client/7301/latest", A)).status).toBe(200);
      expect((await call("POST", "/api/clients/merge", A, {})).status).toBe(400);
    } finally { process.env.HAIRCUT_FORMULAS = "on"; }
  });
});

describe("formula API", () => {
  let manualId = 0;
  it("D6 manual save needs an idempotency key; a retry returns the first version (200)", async () => {
    const body = { spec: { v: 1, sides: { guard: ["#1.5"] } }, source: "manual", idempotencyKey: "manual-key-0001", templateId: 5301 };
    expect((await call("POST", "/api/clients/7301/haircut-formula/versions", A, { ...body, idempotencyKey: undefined })).status).toBe(400);
    const r1 = await call("POST", "/api/clients/7301/haircut-formula/versions", A, body);
    expect(r1.status).toBe(201);
    expect(r1.body.version).toMatchObject({ source: "manual", hairstyleName: "Mid Skin Fade", categoryName: "Fades and Tapers" });
    const r2 = await call("POST", "/api/clients/7301/haircut-formula/versions", A, body);
    expect(r2.status).toBe(200);
    expect(r2.body.version.id).toBe(r1.body.version.id);
    manualId = r1.body.version.id;
  });

  it("D7 an invalid spec is 422; a version can't be edited in the database", async () => {
    const r = await call("POST", "/api/clients/7301/haircut-formula/versions", A, { spec: { v: 1, colour: "red" }, source: "manual", idempotencyKey: "manual-key-0002" });
    expect(r.status).toBe(422);
    await expect(q(`UPDATE client_haircut_formula_versions SET spec = '{"v":1,"instructions":"x"}' WHERE id = $1`, [manualId])).rejects.toMatchObject({ code: "P0001" });
  });

  it("D8 corrections and repeat", async () => {
    const c = await call("POST", `/api/haircut-formula/versions/${manualId}/corrections`, A, { spec: { v: 1, sides: { guard: ["#2"] } }, idempotencyKey: "corr-key-0001" });
    expect(c.status).toBe(201);
    expect(c.body.version).toMatchObject({ source: "correction", correctsVersionId: manualId });
    const latestBefore = (await call("GET", "/api/clients/7301/haircut-formula", A)).body.latest;
    const rep = await call("POST", "/api/clients/7301/haircut-formula/repeat", A, { appointmentId: 6310, idempotencyKey: "repeat-key-001" });
    expect(rep.status).toBe(201);
    expect(rep.body.version).toMatchObject({ source: "repeat", appointmentId: 6310 });
    expect(rep.body.version.spec).toEqual(latestBefore.spec);
    // Another client's ticket can't be used.
    expect((await call("POST", "/api/clients/7301/haircut-formula/repeat", A, { appointmentId: 6307, idempotencyKey: "repeat-key-002" })).status).toBe(409);
  });

  it("D9 history is newest visit first and pages with ?before=", async () => {
    const h = await call("GET", "/api/clients/7301/haircut-formula/history?limit=50", A);
    expect(h.status).toBe(200);
    const times = h.body.versions.map((v: any) => Date.parse(v.visitAt));
    expect([...times].sort((x, y) => y - x)).toEqual(times);
    expect(h.body.versions.every((v: any) => v.source !== "correction" || v.corrected)).toBe(true);
    const older = await call("GET", `/api/clients/7301/haircut-formula/history?before=${encodeURIComponent(h.body.versions[0].visitAt)}`, A);
    expect(older.body.versions.length).toBe(h.body.versions.length - 1);
  });

  it("D10 another store sees nothing and can write nothing (404)", async () => {
    expect((await call("GET", "/api/clients/7301/haircut-formula", B)).status).toBe(404);
    expect((await call("GET", "/api/clients/7301/haircut-formula/history", B)).status).toBe(404);
    expect((await call("POST", "/api/clients/7301/haircut-formula/versions", B, { spec: { v: 1, instructions: "x" }, source: "manual", idempotencyKey: "cross-key-001" })).status).toBe(404);
    expect((await call("GET", "/api/haircut-formula/for-ticket/6301", B)).status).toBe(404);
    expect((await call("POST", `/api/haircut-formula/versions/${manualId}/corrections`, B, { spec: { v: 1, instructions: "x" }, idempotencyKey: "cross-key-002" })).status).toBe(404);
    expect((await call("POST", "/api/haircut-formula/for-ticket/6301/versions", B, { spec: { v: 1, instructions: "x" }, idempotencyKey: "cross-key-003" })).status).toBe(404);
    // A store-B barber on a store-A record: refused by the database's composite key.
    expect((await call("POST", "/api/clients/7301/haircut-formula/versions", A, { spec: { v: 1, instructions: "x" }, source: "manual", staffId: 8302, idempotencyKey: "cross-key-004" })).status).toBe(404);
  });
});

describe("name-only walk-ins", () => {
  let walkInId = 0;
  it("D11 a ticket with only a name keeps its cut as a walk-in record; retry is 200", async () => {
    const body = { spec: { v: 1, fade: { type: "low" } }, idempotencyKey: "walkin-key-001" };
    const r = await call("POST", "/api/haircut-formula/for-ticket/6303/versions", A, body);
    expect(r.status).toBe(201);
    expect(r.body.version).toMatchObject({ source: "walk_in", formulaId: null, clientId: null, appointmentId: 6303, staffId: 8301 });
    walkInId = r.body.version.id;
    expect((await call("POST", "/api/haircut-formula/for-ticket/6303/versions", A, body)).status).toBe(200);
    const t = await call("GET", "/api/haircut-formula/for-ticket/6303", A);
    expect(t.body).toMatchObject({ clientId: null, latest: { id: walkInId } });
    // Quick Notes still refuses a ticket without a client (contract unchanged).
    expect((await call("POST", "/api/quick-notes", A, { appointmentId: 6303, choices: { guard: ["#1"] } })).status).toBe(400);
  });

  it("D12 once the ticket has a client, the walk-in joins that client's formula", async () => {
    expect((await call("POST", `/api/haircut-formula/walk-ins/${walkInId}/attach`, A, { clientId: 7307 })).status).toBe(409); // ticket has no client yet
    await q(`UPDATE appointments SET customer_id = 7307 WHERE id = 6303`);
    const r = await call("POST", `/api/haircut-formula/walk-ins/${walkInId}/attach`, A, { clientId: 7307 });
    expect(r.status).toBe(201);
    expect(r.body.version).toMatchObject({ id: walkInId, clientId: 7307, versionNumber: 1 });
    expect(r.body.version.formulaId).toBeTruthy();
    expect((await call("POST", `/api/haircut-formula/walk-ins/${walkInId}/attach`, A, { clientId: 7307 })).status).toBe(200);
    const audit = await q(`SELECT action FROM client_haircut_formula_audit WHERE version_id = $1`, [walkInId]);
    expect(audit.map((a) => a.action)).toContain("walk_in_linked");
    expect((await call("GET", "/api/clients/7307/haircut-formula", A)).body.latest.id).toBe(walkInId);
  });
});

describe("client merge", () => {
  it("D13 Quick Notes and formulas move; both had formulas → the duplicate's is kept as 'From merged client #N'", async () => {
    await call("POST", "/api/quick-notes", A, { appointmentId: 6308, choices: { guard: ["#0"] }, extra: "" }); // Cy
    await call("POST", "/api/quick-notes", A, { appointmentId: 6309, choices: { guard: ["#5"] }, extra: "" }); // Dee
    const deeVersions = await versionsOf(7304);
    const r = await call("POST", "/api/clients/merge", A, { winnerId: 7303, loserIds: [7304] });
    expect(r.status).toBe(200);
    expect((await q(`SELECT client_id FROM client_quick_notes WHERE appointment_id = 6309`))[0].client_id).toBe(7303);
    const fs = await q(`SELECT client_id, is_default, label FROM client_haircut_formulas WHERE client_id = 7303 ORDER BY id`);
    expect(fs).toEqual([{ client_id: 7303, is_default: true, label: null }, { client_id: 7303, is_default: false, label: "From merged client #7304" }]);
    const moved = await q(`SELECT id, client_id, md5(spec::text) s FROM client_haircut_formula_versions WHERE id = ANY($1) ORDER BY id`, [deeVersions.map((v) => v.id)]);
    expect(moved.every((m) => m.client_id === 7303)).toBe(true);
    // Their history reads as one client's.
    const h = await call("GET", "/api/clients/7303/haircut-formula/history", A);
    expect(h.body.versions.map((v: any) => v.appointmentId).sort()).toEqual([6308, 6309]);
    expect((await q(`SELECT archived_at IS NOT NULL a FROM clients WHERE id = 7304`))[0].a).toBe(true);
  });

  it("D14 merge refuses another store's client and an already-merged client", async () => {
    expect((await call("POST", "/api/clients/merge", A, { winnerId: 7303, loserIds: [7305] })).status).toBe(403);
    expect((await call("POST", "/api/clients/merge", A, { winnerId: 7303, loserIds: [7304] })).status).toBe(409);
    expect((await call("POST", "/api/clients/merge", A, { winnerId: 7303, loserIds: [7303] })).status).toBe(400);
  });
});

describe("Quick Notes backfill (not run automatically)", () => {
  it("D15 copies haircut notes that have no version yet, once", async () => {
    const { backfillQuickNoteVersions } = await import("../lib/haircutFormulas");
    const run = async () => {
      const c = await pool.connect();
      try { await c.query("BEGIN"); const n = await backfillQuickNoteVersions(c, A); await c.query("COMMIT"); return n; }
      catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
    };
    // D4 (formula save forced to fail) and D5 (switch off) left two notes without a version.
    expect(await run()).toBe(2);
    const copied = await q(`SELECT appointment_id, source, quick_note_id IS NOT NULL linked FROM client_haircut_formula_versions WHERE source = 'quick_note_backfill' ORDER BY appointment_id`);
    expect(copied).toEqual([{ appointment_id: 6302, source: "quick_note_backfill", linked: true }, { appointment_id: 6307, source: "quick_note_backfill", linked: true }]);
    expect(await run()).toBe(0);
    expect((await call("GET", "/api/quick-notes/appointment/6302", A)).body.saved.choices).toEqual({ guard: ["#3"] }); // the note itself unchanged
  });
});
