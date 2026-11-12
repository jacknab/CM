// Last Cut Formula Phase 4 — the global hairstyle library on a disposable database (scripts/lcf-dbtest.sh only):
// the idempotent catalog import, search / categories / details, global vs store-private visibility, and the admin
// reference-image approval workflow (real isAdminAuthenticated against users.is_admin; only the R2 upload is faked).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

vi.mock("../auth", async (orig) => ({ ...(await orig<typeof import("../auth")>()), isAuthenticated: (_q: unknown, _s: unknown, n: () => void) => n() }));
vi.mock("../lib/sessionStore", () => ({ resolveSessionStoreId: async (req: any) => Number(req.headers["x-store"]) || null }));
let uploads = 0;
vi.mock("../lib/r2", async (orig) => {
  const real = await orig<typeof import("../lib/r2")>();
  return { ...real, isR2Configured: () => true, uploadToR2: async (_b: Buffer, folder: string) => `${real.R2_PUBLIC_BASE}/${folder}/test-${++uploads}.webp` };
});

import { pool } from "../db";
import haircutFormulasRouter from "./haircutFormulas";
import hairstyleAdminRouter from "./hairstyleAdmin";
import { importHairstyleCatalog } from "../lib/hairstyleCatalogImport";
import { HAIRSTYLE_CATALOG } from "@shared/hairstyleCatalog";

const A = 9401, B = 9402;
let server: Server;
let base = "";
const q = async (text: string, params: unknown[] = []) => (await pool.query(text, params)).rows;
const call = async (method: string, path: string, o: { store?: number; user?: string; body?: unknown; form?: FormData } = {}) => {
  const headers: Record<string, string> = { "x-store": String(o.store ?? A) };
  if (o.user) headers["x-user"] = o.user;
  if (o.body !== undefined) headers["content-type"] = "application/json";
  const r = await fetch(`${base}${path}`, { method, headers, body: o.form ?? (o.body === undefined ? undefined : JSON.stringify(o.body)) });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
};
const runImport = async (catalog = HAIRSTYLE_CATALOG) => {
  const c = await pool.connect();
  try { await c.query("BEGIN"); const r = await importHairstyleCatalog(c, catalog); await c.query("COMMIT"); return r; }
  catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
};
const png = () => { const f = new FormData(); f.append("image", new Blob([Buffer.from("89504e470d0a1a0a", "hex")], { type: "image/png" }), "ref.png"); return f; };
const idOf = async (slug: string) => (await q(`SELECT id FROM hairstyle_templates WHERE store_id IS NULL AND slug = $1`, [slug]))[0].id as number;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.session = req.headers["x-user"] ? { userId: req.headers["x-user"] } : {}; next(); });
  app.use("/api", haircutFormulasRouter);
  app.use("/api/admin/hairstyles", hairstyleAdminRouter);
  await new Promise<void>((ok) => { server = app.listen(0, "127.0.0.1", () => ok()); });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  // The categories of migration 0356 (data, so not in a structure-only copy).
  await q(`INSERT INTO hairstyle_categories (slug, name, display_order) VALUES
    ('fades-and-tapers','Fades and Tapers',10),('buzz-cuts-and-military','Buzz Cuts and Military',20),('classic-and-professional','Classic and Professional',30),
    ('crops-and-fringe','Crops and Fringe',40),('pompadours-and-undercuts','Pompadours and Undercuts',50),('curly-and-textured','Curly and Textured',60),
    ('afros-waves-twists-and-locs','Afros, Waves, Twists and Locs',70),('mohawks-mullets-and-alternative','Mohawks, Mullets and Alternative Cuts',80),
    ('medium-and-long','Medium and Long Hairstyles',90),('childrens','Children''s Hairstyles',100),('specialty-and-custom','Specialty and Custom Styles',110)
    ON CONFLICT (slug) DO NOTHING`);
  await q(`INSERT INTO users (id, email, password, is_admin) VALUES ('u-admin', 'admin@example.invalid', 'x', true), ('u-owner', 'owner@example.invalid', 'x', false)`);
  await q(`INSERT INTO locations (id, name, category) VALUES ($1, 'Barber A', 'Barbershop'), ($2, 'Barber B', 'Barbershop')`, [A, B]);
  await q(`INSERT INTO clients (id, store_id, first_name) VALUES (7401, $1, 'Ann')`, [A]);
  await q(`INSERT INTO staff (id, store_id, name) VALUES (8401, $1, 'Barber One')`, [A]);
  await q(`INSERT INTO appointments (id, store_id, date, duration, customer_id, staff_id, status, total_paid) VALUES (6401, $1, now() - interval '9 days', 30, 7401, 8401, 'completed', '30'), (6402, $1, now(), 30, 7401, 8401, 'confirmed', '0')`, [A]);
});
afterAll(async () => { await new Promise((ok) => server.close(ok)); await pool.end(); });

describe("catalog import", () => {
  it("L1 two imports at once (restart / two servers): exactly 200 published global styles, no error", async () => {
    const [r1, r2] = await Promise.all([runImport(), runImport()]);
    expect(r1.inserted.length + r2.inserted.length).toBe(200);
    expect((await q(`SELECT count(*)::int n, count(*) FILTER (WHERE status = 'published')::int p FROM hairstyle_templates WHERE store_id IS NULL`))[0]).toEqual({ n: 200, p: 200 });
    const perCat = await q(`SELECT c.slug, count(*)::int n FROM hairstyle_templates t JOIN hairstyle_categories c ON c.id = t.category_id WHERE t.store_id IS NULL GROUP BY 1`);
    for (const { slug, n } of perCat) expect(n).toBe(HAIRSTYLE_CATALOG.filter((s) => s.category === slug).length);
  });

  it("L2 running it again changes nothing and keeps every id", async () => {
    const before = await q(`SELECT id, slug, updated_at FROM hairstyle_templates WHERE store_id IS NULL ORDER BY slug`);
    const r = await runImport();
    expect(r).toMatchObject({ inserted: [], updated: [], unchanged: 200 });
    expect(await q(`SELECT id, slug, updated_at FROM hairstyle_templates WHERE store_id IS NULL ORDER BY slug`)).toEqual(before);
  });

  it("L3 repairs a changed style, keeps its id, and leaves an archived style archived", async () => {
    const id = await idOf("drop-fade");
    await q(`UPDATE hairstyle_templates SET description = 'edited by hand', status = 'archived' WHERE id = $1`, [id]);
    const r = await runImport();
    expect(r.updated).toEqual(["drop-fade"]);
    expect((await q(`SELECT id, description, status FROM hairstyle_templates WHERE id = $1`, [id]))[0])
      .toEqual({ id, description: HAIRSTYLE_CATALOG.find((s) => s.slug === "drop-fade")!.description, status: "archived" });
    await q(`UPDATE hairstyle_templates SET status = 'published' WHERE id = $1`, [id]);
  });

  it("L4 client haircut history that uses a style is never touched by an import", async () => {
    const tid = await idOf("mid-skin-fade");
    const created = await call("POST", "/api/clients/7401/haircut-formula/versions", { user: "u-owner", body: { spec: { v: 1, sides: { guard: ["#0"] } }, templateId: tid, source: "manual", idempotencyKey: "lib-test-key-01" } });
    expect(created.status).toBe(201);
    const before = await q(`SELECT * FROM client_haircut_formula_versions WHERE client_id = 7401`);
    const changed = HAIRSTYLE_CATALOG.map((s) => (s.slug === "mid-skin-fade" ? { ...s, description: s.description + " Updated." } : s));
    expect((await runImport(changed)).updated).toEqual(["mid-skin-fade"]);
    expect(await q(`SELECT * FROM client_haircut_formula_versions WHERE client_id = 7401`)).toEqual(before);
    expect(before[0]).toMatchObject({ template_id: tid, hairstyle_name: "Mid Skin Fade" });
    await runImport(); // back to the catalog text
  });

  it("L5 a store's own style with the same slug and name stays private and untouched", async () => {
    await q(`INSERT INTO hairstyle_templates (id, store_id, category_id, slug, name, status) SELECT 5491, $1, id, 'mid-skin-fade', 'Mid Skin Fade', 'published' FROM hairstyle_categories WHERE slug = 'fades-and-tapers'`, [A]);
    await q(`INSERT INTO hairstyle_templates (id, store_id, category_id, slug, name, status, aliases) SELECT 5492, $1, id, 'house-special', 'House Special', 'draft', '{"the boss"}' FROM hairstyle_categories WHERE slug = 'specialty-and-custom'`, [A]);
    const r = await runImport();
    expect(r.inserted.length + r.updated.length).toBe(0);
    expect((await q(`SELECT count(*)::int n FROM hairstyle_templates WHERE store_id = $1`, [A]))[0].n).toBe(2);
    const a = await call("GET", "/api/hairstyles?q=house", { store: A, user: "u-owner" });
    expect(a.body.hairstyles.map((h: any) => h.id)).toEqual([5492]);
    expect((await call("GET", "/api/hairstyles?q=house", { store: B, user: "u-owner" })).body.hairstyles).toEqual([]);
    expect((await call("GET", "/api/hairstyles/5492", { store: B, user: "u-owner" })).status).toBe(404);
    const both = await call("GET", "/api/hairstyles?q=mid%20skin%20fade", { store: A, user: "u-owner" });
    expect(both.body.hairstyles.map((h: any) => h.scope).sort()).toEqual(["global", "store"]);
    expect((await call("GET", "/api/hairstyles?q=mid%20skin%20fade", { store: B, user: "u-owner" })).body.hairstyles.map((h: any) => h.scope)).toEqual(["global"]);
  });
});

describe("search, categories and details", () => {
  it("L6 finds styles by alias", async () => {
    const names = async (term: string) => (await call("GET", `/api/hairstyles?q=${encodeURIComponent(term)}&scope=global`, { store: B, user: "u-owner" })).body.hairstyles.map((h: any) => h.name);
    expect(await names("bald fade")).toEqual(expect.arrayContaining(["Low Skin Fade", "Mid Skin Fade", "High Skin Fade"]));
    expect(await names("temp fade")).toContain("Temple Fade");
    expect(await names("harvard clip")).toEqual(["Ivy League"]);
    expect(await names("twa")).toEqual(["Short Afro"]);
  });
  it("L7 filters by category; every category lists all of its styles", async () => {
    const cats = (await call("GET", "/api/hairstyles/categories", { store: B, user: "u-owner" })).body.categories.map((c: any) => c.slug);
    for (const c of new Set(HAIRSTYLE_CATALOG.map((s) => s.category))) {
      expect(cats).toContain(c);
      const r = await call("GET", `/api/hairstyles?category=${c}&scope=global&limit=100`, { store: B, user: "u-owner" });
      expect(r.body.hairstyles.length).toBe(HAIRSTYLE_CATALOG.filter((s) => s.category === c).length);
    }
  });
  it("L8 details carry the reference default spec and no images until one is approved", async () => {
    const d = await call("GET", `/api/hairstyles/${await idOf("ivy-league")}`, { store: B, user: "u-owner" });
    expect(d.status).toBe(200);
    expect(d.body).toMatchObject({ name: "Ivy League", scope: "global", category: { slug: "buzz-cuts-and-military" }, images: [] });
    expect(d.body.defaultSpec).toEqual(HAIRSTYLE_CATALOG.find((s) => s.slug === "ivy-league")!.spec);
  });
});

describe("reference image approval (admins only)", () => {
  let styleId = 0, firstId = 0;
  beforeAll(async () => { styleId = await idOf("mid-skin-fade"); });

  it("L9 refuses anyone who isn't a platform admin", async () => {
    expect((await call("GET", "/api/admin/hairstyles", {})).status).toBe(401);
    expect((await call("GET", "/api/admin/hairstyles", { user: "u-owner" })).status).toBe(403);
    expect((await call("POST", `/api/admin/hairstyles/${styleId}/images`, { user: "u-owner", form: png() })).status).toBe(403);
  });

  it("L10 an upload is pending and invisible to barbers until approved", async () => {
    const f = png(); f.append("view", "front");
    const up = await call("POST", `/api/admin/hairstyles/${styleId}/images`, { user: "u-admin", form: f });
    expect(up.status).toBe(201);
    expect(up.body.image).toMatchObject({ view: "front", status: "pending", source: "certxa_artwork" });
    expect(up.body.image.r2Key).toMatch(/^hairstyles\/global\/mid-skin-fade\/test-\d+\.webp$/);
    firstId = up.body.image.id;
    expect((await call("GET", `/api/hairstyles/${styleId}`, { store: B, user: "u-owner" })).body.images).toEqual([]);
    const ok = await call("POST", `/api/admin/hairstyles/images/${firstId}/approve`, { user: "u-admin" });
    expect(ok.body.image).toMatchObject({ status: "approved", approvedBy: "u-admin" });
    const seen = (await call("GET", `/api/hairstyles/${styleId}`, { store: B, user: "u-owner" })).body.images;
    expect(seen).toEqual([{ view: "front", url: expect.stringContaining(up.body.image.r2Key), altText: null }]);
  });

  it("L11 replace: the old image stays until the new one is approved, then only the new one shows", async () => {
    const rep = await call("POST", `/api/admin/hairstyles/images/${firstId}/replace`, { user: "u-admin", form: png() });
    expect(rep.body.image).toMatchObject({ view: "front", status: "pending", metadata: { replaces: firstId } });
    expect((await call("GET", `/api/hairstyles/${styleId}`, { store: A, user: "u-owner" })).body.images.length).toBe(1);
    const ok = await call("POST", `/api/admin/hairstyles/images/${rep.body.image.id}/approve`, { user: "u-admin" });
    expect(ok.body.retired).toBe(firstId);
    const imgs = (await call("GET", `/api/hairstyles/${styleId}`, { store: A, user: "u-owner" })).body.images;
    expect(imgs.map((i: any) => i.url)).toEqual([expect.stringContaining(rep.body.image.r2Key)]);
    expect((await q(`SELECT approval_status FROM hairstyle_template_images WHERE id = $1`, [firstId]))[0].approval_status).toBe("rejected");
  });

  it("L12 reject hides an image; moving an approved image to another view sends it back to pending", async () => {
    const f = png(); f.append("view", "left");
    const left = (await call("POST", `/api/admin/hairstyles/${styleId}/images`, { user: "u-admin", form: f })).body.image;
    await call("POST", `/api/admin/hairstyles/images/${left.id}/approve`, { user: "u-admin" });
    const moved = await call("PATCH", `/api/admin/hairstyles/images/${left.id}`, { user: "u-admin", body: { view: "right" } });
    expect(moved.body.image).toMatchObject({ view: "right", status: "pending" });
    const rej = await call("POST", `/api/admin/hairstyles/images/${left.id}/reject`, { user: "u-admin", body: { reason: "wrong angle" } });
    expect(rej.body.image).toMatchObject({ status: "rejected", metadata: { rejectReason: "wrong angle" } });
    expect((await call("GET", `/api/hairstyles/${styleId}`, { store: A, user: "u-owner" })).body.images.map((i: any) => i.view)).toEqual(["front"]);
  });

  it("L13 checks the file, the view, and never touches a store's private style", async () => {
    const noView = await call("POST", `/api/admin/hairstyles/${styleId}/images`, { user: "u-admin", form: png() });
    expect(noView.status).toBe(400);
    const txt = new FormData(); txt.append("image", new Blob(["hello"], { type: "text/plain" }), "x.txt"); txt.append("view", "front");
    expect((await call("POST", `/api/admin/hairstyles/${styleId}/images`, { user: "u-admin", form: txt })).status).toBe(400);
    const f = png(); f.append("view", "front");
    expect((await call("POST", `/api/admin/hairstyles/5492/images`, { user: "u-admin", form: f })).status).toBe(404);
    expect((await call("GET", `/api/admin/hairstyles/5492`, { user: "u-admin" })).status).toBe(404);
    const list = await call("GET", "/api/admin/hairstyles?images=pending", { user: "u-admin" });
    expect(list.body.hairstyles.every((h: any) => h.pending > 0)).toBe(true);
    const missing = await call("GET", "/api/admin/hairstyles?images=missing", { user: "u-admin" });
    expect(missing.body.hairstyles.length).toBe(200);
    expect(missing.body.hairstyles.find((h: any) => h.slug === "mid-skin-fade").missingViews).toEqual(["left", "right", "back"]);
  });

  it("L14 the barber's read-only Last Cut panel source gets the approved images of the client's style", async () => {
    const t = await call("GET", "/api/haircut-formula/for-ticket/6402", { store: A, user: "u-owner" });
    expect(t.status).toBe(200);
    expect(t.body.hairstyle).toMatchObject({ name: "Mid Skin Fade" });
    expect(t.body.images.map((i: any) => i.view)).toEqual(["front"]);
  });
});
