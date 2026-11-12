import { afterEach, describe, expect, it, vi } from "vitest";
import { formulaRows } from "./formulaView";
import { checkDraft, compactSpec, draftFrom, sameCut, toggle } from "./formulaDraft";
import { FormulaApiError, formulasEnabled, getClientFormula, onceAtATime, primeFormulasEnabled, saveKey, setFormulaFetch } from "./haircutFormulaApi";
import { makeFormulaSaver } from "./FormulaEditor";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
afterEach(() => { setFormulaFetch((...a) => fetch(...a)); primeFormulasEnabled(null); });

describe("formula rows (what the panel shows)", () => {
  it("shows each section of a full formula, in order, and the notes", () => {
    const rows = formulaRows({
      v: 1, sides: { guard: ["#1"], technique: ["clipper-over-comb"] }, fade: { type: "skin", height: "mid", start: { guard: "#0" }, end: { guard: "#2" } },
      top: { length: { value: 2, unit: "in" }, technique: ["scissor"], leaveLonger: true }, neckline: { shape: ["faded-out"] },
      sideburns: { length: "short", shape: ["tapered"] }, beard: { guard: "#2", lineUp: true, blendIntoFade: true }, instructions: "Keep the crown full",
    }, { hairstyleName: "Mid Skin Fade", notes: "Sensitive neck" });
    expect(rows.map((r) => r.key)).toEqual(["style", "sides", "fade", "top", "neckline", "sideburns", "beard", "notes"]);
    expect(rows.find((r) => r.key === "sides")!.tags).toEqual(["#1", "Clipper over comb"]);
    expect(rows.find((r) => r.key === "fade")!.tags).toEqual(["Skin fade", "Mid height", "#0 → #2"]);
    expect(rows.find((r) => r.key === "top")!.tags).toEqual(["2 in", "Scissor", "Leave longer"]);
    expect(rows.find((r) => r.key === "beard")!.tags).toEqual(["#2", "Line up", "Blend into fade"]);
    expect(rows.find((r) => r.key === "notes")!.text).toBe("Keep the crown full\nSensitive neck");
  });
  it("leaves out what doesn't apply: no beard, no fade for a scissor cut", () => {
    const rows = formulaRows({ v: 1, methods: ["scissor"], top: { length: { value: 3, unit: "in" } } });
    expect(rows.map((r) => r.key)).toEqual(["sides", "top"]);
    expect(formulaRows(null)).toEqual([]);
  });
  it("a mid fade doesn't repeat its height, and No fade has none", () => {
    expect(formulaRows({ v: 1, fade: { type: "mid", height: "mid" } })[0].tags).toEqual(["Mid fade"]);
    expect(formulaRows({ v: 1, fade: { type: "none" } })[0].tags).toEqual(["No fade"]);
  });
});

describe("editor draft rules", () => {
  it("starts from a saved cut without its Quick Note copy", () => {
    const d = draftFrom({ v: 1, sides: { guard: ["#1"] }, legacy: { quickNote: { template: "barber" } } });
    expect(d).toEqual({ v: 1, sides: { guard: ["#1"] } });
  });
  it("drops untouched sections so nothing irrelevant is required or sent", () => {
    const spec = compactSpec({ v: 1, sides: { guard: [], technique: [] }, top: { leaveLonger: undefined, length: { value: 2, unit: "in" } }, beard: {}, instructions: "" } as any);
    expect(spec).toEqual({ v: 1, top: { length: { value: 2, unit: "in" } } });
    expect(compactSpec({ v: 1, fade: { type: "none", height: "mid" } })).toEqual({ v: 1, fade: { type: "none" } });
  });
  it("uses the shared validation: an empty cut can't be saved, a picked one can", () => {
    expect(checkDraft({ v: 1 }).ok).toBe(false);
    expect(checkDraft({ v: 1, neckline: { shape: ["tapered"] } }).ok).toBe(true);
    expect(toggle(["a"], "a")).toEqual([]);
    expect(toggle(["a"], "b")).toEqual(["a", "b"]);
  });
  it("knows an unchanged cut (Saved) from a changed one", () => {
    expect(sameCut({ v: 1, sides: { guard: ["#1"] } }, { v: 1, sides: { guard: ["#1"], technique: [] } } as any)).toBe(true);
    expect(sameCut({ v: 1, sides: { guard: ["#1"] } }, { v: 1, sides: { guard: ["#2"] } })).toBe(false);
  });
});

describe("saving from the post-service editor", () => {
  it("a double tap sends one request; the same cut again uses the same key; a changed cut a new key", async () => {
    const sent: any[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    setFormulaFetch(async (url, init) => { sent.push({ url, body: JSON.parse(String(init?.body)) }); await gate; return json(201, { version: { id: 9 } }); });
    const save = makeFormulaSaver({ appointmentId: 6301, clientId: 7301, formulaId: null });
    const draft = { v: 1 as const, sides: { guard: ["#1" as const] } };
    const a = save(draft, null), b = save(draft, null);
    release();
    await Promise.all([a, b]);
    expect(sent.length).toBe(1);
    expect(sent[0].url).toBe("/api/haircut-formula/for-ticket/6301/versions");
    await save(draft, null);
    expect(sent[1].body.idempotencyKey).toBe(sent[0].body.idempotencyKey);
    await save({ v: 1, sides: { guard: ["#2"] } }, null);
    expect(sent[2].body.idempotencyKey).not.toBe(sent[0].body.idempotencyKey);
    expect(sent[0].body.idempotencyKey.length).toBeGreaterThanOrEqual(8);
  });
  it("a named formula saves through the client route with its formulaId", async () => {
    const sent: any[] = [];
    setFormulaFetch(async (url, init) => { sent.push({ url, body: JSON.parse(String(init?.body)) }); return json(201, { version: { id: 10 } }); });
    await makeFormulaSaver({ appointmentId: 6301, clientId: 7301, formulaId: 44 })({ v: 1, instructions: "Summer" }, { id: 5301, name: "Mid Skin Fade" });
    expect(sent[0].url).toBe("/api/clients/7301/haircut-formula/versions");
    expect(sent[0].body).toMatchObject({ formulaId: 44, appointmentId: 6301, source: "manual", templateId: 5301, spec: { style: { templateId: 5301, name: "Mid Skin Fade" } } });
  });
  it("refuses an empty cut without calling the server", async () => {
    const f = vi.fn();
    setFormulaFetch(f as any);
    await expect(makeFormulaSaver({ appointmentId: 1, clientId: 1, formulaId: null })({ v: 1 }, null)).rejects.toThrow(/Describe the cut/);
    expect(f).not.toHaveBeenCalled();
  });
  it("shows the server's message; another store's record is a 404 FormulaApiError", async () => {
    setFormulaFetch(async () => json(404, { message: "Client not found" }));
    await expect(getClientFormula(7301)).rejects.toMatchObject({ status: 404, message: "Client not found" });
    setFormulaFetch(async () => json(500, {}));
    await expect(getClientFormula(7301)).rejects.toBeInstanceOf(FormulaApiError);
  });
  it("onceAtATime lets the next save through after the first finishes", async () => {
    let n = 0;
    const f = onceAtATime(async () => ++n);
    expect(await Promise.all([f(), f()])).toEqual([1, 1]);
    expect(await f()).toBe(2);
    expect(saveKey("x", { a: 1, b: 2 })).toBe(saveKey("x", { b: 2, a: 1 }));
  });
});

describe("the HAIRCUT_FORMULAS switch", () => {
  it("follows the server, and counts as off when the server can't be reached", async () => {
    setFormulaFetch(async () => json(200, { enabled: true }));
    expect(await formulasEnabled()).toBe(true);
    primeFormulasEnabled(null);
    setFormulaFetch(async () => { throw new Error("offline"); });
    expect(await formulasEnabled()).toBe(false);
    primeFormulasEnabled(null);
    setFormulaFetch(async () => json(401, { message: "Not signed in" }));
    expect(await formulasEnabled()).toBe(false);
  });
});
