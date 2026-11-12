import { describe, expect, it } from "vitest";
import { CATALOG_CATEGORIES, HAIRSTYLE_CATALOG, catalogSpec } from "@shared/hairstyleCatalog";
import { IMAGE_VIEWS, REQUIRED_VIEWS, imageManifest } from "@shared/hairstyleImageManifest";
import { checkSpecForSave } from "@shared/haircutFormula";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const canonical = (x: unknown): unknown =>
  Array.isArray(x) ? x.map(canonical) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, canonical((x as any)[k])])) : x;

describe("global hairstyle catalog", () => {
  it("has exactly 200 styles with unique slugs and names", () => {
    expect(HAIRSTYLE_CATALOG.length).toBe(200);
    expect(new Set(HAIRSTYLE_CATALOG.map((s) => s.slug)).size).toBe(200);
    expect(new Set(HAIRSTYLE_CATALOG.map((s) => norm(s.name))).size).toBe(200);
    for (const s of HAIRSTYLE_CATALOG) expect(s.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("uses only the seeded categories, and every category has styles", () => {
    for (const s of HAIRSTYLE_CATALOG) expect(CATALOG_CATEGORIES).toContain(s.category);
    for (const c of CATALOG_CATEGORIES) expect(HAIRSTYLE_CATALOG.some((s) => s.category === c)).toBe(true);
  });

  it("aliases are searchable and never another style's name or alias (no marketing duplicates)", () => {
    const owner = new Map<string, string>();
    for (const s of HAIRSTYLE_CATALOG) owner.set(norm(s.name), s.slug);
    for (const s of HAIRSTYLE_CATALOG) {
      expect(s.aliases.length).toBeGreaterThan(0);
      expect(s.aliases.length).toBeLessThanOrEqual(30);
      for (const a of s.aliases) {
        expect(a.length).toBeLessThanOrEqual(60);
        const k = norm(a);
        expect(k.length).toBeGreaterThan(1);
        const taken = owner.get(k);
        expect(taken === undefined || taken === s.slug, `alias "${a}" of ${s.slug} is already ${taken}`).toBe(true);
        owner.set(k, s.slug);
      }
    }
  });

  it("every style has a description, suitability and a spec the shared validation accepts", () => {
    for (const s of HAIRSTYLE_CATALOG) {
      expect(s.description.length).toBeGreaterThan(20);
      expect(s.description.length).toBeLessThanOrEqual(300);
      expect(s.suits.length).toBeGreaterThan(0);
      const c = checkSpecForSave(s.spec);
      expect(c.ok, `${s.slug}: ${(c as any).message}`).toBe(true);
      expect(s.spec.instructions, `${s.slug} styling notes`).toBeTruthy();
      expect(s.spec.custom?.suits).toBeTruthy();
    }
  });

  it("no two styles have the same cut (spec without notes)", () => {
    const seen = new Map<string, string>();
    for (const s of HAIRSTYLE_CATALOG) {
      const { instructions: _i, custom: _c, ...cut } = s.spec;
      const k = JSON.stringify(canonical(cut));
      expect(seen.get(k), `${s.slug} has the same cut as ${seen.get(k)}`).toBeUndefined();
      seen.set(k, s.slug);
    }
  });

  it("haircut styles say what to do with sides, fade and top; grooming-only styles say what they shape", () => {
    for (const s of HAIRSTYLE_CATALOG.filter((x) => x.category !== "specialty-and-custom")) {
      expect(!!(s.spec.top || s.spec.sides || s.spec.textured || s.spec.methods), s.slug).toBe(true);
    }
    expect(HAIRSTYLE_CATALOG.find((s) => s.slug === "mid-skin-fade")!.spec).toMatchObject({ fade: { type: "skin", height: "mid" }, sides: { guard: ["#0"] } });
  });

  it("the shorthand refuses anything it doesn't know", () => {
    expect(() => catalogSpec("fade extreme", "")).toThrow(/extreme/);
    expect(() => catalogSpec("sides #9", "")).toThrow(/#9/);
    expect(() => catalogSpec("colour red", "")).toThrow(/colour/);
  });
});

describe("reference image manifest", () => {
  const m = imageManifest();
  it("plans front, left, right and back (required) and detail (optional) for every style", () => {
    expect(m.length).toBe(200 * IMAGE_VIEWS.length);
    for (const s of HAIRSTYLE_CATALOG) {
      const views = m.filter((e) => e.slug === s.slug);
      expect(views.map((e) => e.view).sort()).toEqual([...IMAGE_VIEWS].sort());
      expect(views.filter((e) => e.required).map((e) => e.view).sort()).toEqual([...REQUIRED_VIEWS].sort());
    }
  });
  it("uses storage keys the database accepts, one per slot, and consistent prompts", () => {
    expect(new Set(m.map((e) => e.r2Key)).size).toBe(m.length);
    for (const e of m) {
      expect(e.r2Key).toMatch(/^[A-Za-z0-9/_.-]+$/);
      expect(e.r2Key).not.toContain("..");
      expect(e.r2Key).toBe(`hairstyles/global/${e.slug}/${e.view}-1.webp`);
      expect(e.prompt).toContain(e.name);
      expect(e.prompt).toContain("Same illustrated adult male model");
      expect(e.prompt).toMatch(/not a real or recognisable person/);
    }
  });
});
