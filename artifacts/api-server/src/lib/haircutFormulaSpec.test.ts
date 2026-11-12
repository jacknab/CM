import { describe, expect, it } from "vitest";
import { checkSpecForSave, isHaircutTemplate, quickNoteToSpec } from "@shared/haircutFormula";

describe("haircut formula spec v1", () => {
  it("accepts the documented examples", () => {
    const fade = { v: 1, sides: { guard: ["#1"] }, fade: { type: "skin", height: "mid", start: { guard: "#0" }, end: { guard: "#2" } }, neckline: { shape: ["faded-out"] }, top: { length: { value: 2, unit: "in" }, technique: ["scissor"] } };
    const scissor = { v: 1, methods: ["scissor"], top: { length: { value: 3, unit: "in" } }, sides: { length: { value: 1, unit: "in" }, technique: ["scissor-over-comb"] }, neckline: { shape: ["tapered"] } };
    const locs = { v: 1, textured: { style: "locs", maintenance: "retwist" }, hair: { texture: "coily", density: "thick" }, instructions: "Retwist only, no trim." };
    for (const s of [fade, scissor, locs]) expect(checkSpecForSave(s)).toMatchObject({ ok: true });
  });
  it("refuses unknown keys, wrong versions, bad enums and empty cuts", () => {
    expect(checkSpecForSave({ v: 1, sides: { guard: ["#1"] }, colour: "red" }).ok).toBe(false);
    expect(checkSpecForSave({ v: 2, sides: { guard: ["#1"] } }).ok).toBe(false);
    expect(checkSpecForSave({ v: 1, fade: { type: "extreme" } }).ok).toBe(false);
    expect(checkSpecForSave({ v: 1, sides: { guard: ["#9"] } }).ok).toBe(false);
    expect(checkSpecForSave({ v: 1 }).ok).toBe(false);
    expect(checkSpecForSave({ v: 1, style: { name: "Mid Skin Fade" } }).ok).toBe(false); // a name alone says nothing about the cut
    expect(checkSpecForSave({ v: 1, instructions: "x".repeat(1001) }).ok).toBe(false);
    expect(checkSpecForSave("not an object").ok).toBe(false);
  });
  it("limits custom fields", () => {
    const custom = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, "v"]));
    expect(checkSpecForSave({ v: 1, custom, instructions: "x" }).ok).toBe(false);
    expect(checkSpecForSave({ v: 1, custom: { partLine: "hard part left" } }).ok).toBe(true);
  });
});

describe("Quick Notes → spec", () => {
  it("only the haircut templates describe a cut", () => {
    expect(isHaircutTemplate("barber")).toBe(true);
    expect(isHaircutTemplate("hair")).toBe(true);
    expect(isHaircutTemplate("nail")).toBe(false);
    expect(isHaircutTemplate("generic")).toBe(false);
  });
  it("maps a barbershop note as documented and stays valid", () => {
    const spec = quickNoteToSpec("barber", {
      guard: ["Foil/Razor", "#1"], fade: ["Low", "Skin Fade"], neckline: ["Squared/Blocked", "Faded Out"],
      sideburns: ["Short", "Tapered"], top: ["Scissor cut", "2 inches", "Leave longer", "Texturize/Thin"],
    }, "  Leave the crown fuller  ");
    expect(spec.sides).toEqual({ technique: ["foil"], guard: ["#1"] });
    expect(spec.fade).toEqual({ foil: true, type: "skin", height: "low" });
    expect(spec.neckline).toEqual({ shape: ["squared", "faded-out"] });
    expect(spec.sideburns).toEqual({ length: "short", shape: ["tapered"] });
    expect(spec.top).toEqual({ technique: ["scissor"], length: { value: 2, unit: "in" }, leaveLonger: true, texture: ["texturize", "thin"] });
    expect(spec.instructions).toBe("Leave the crown fuller");
    expect(checkSpecForSave(spec).ok).toBe(true);
  });
  it("height alone becomes the fade type; No Fade has no height", () => {
    expect(quickNoteToSpec("barber", { fade: ["Mid"] }).fade).toEqual({ type: "mid", height: "mid" });
    expect(quickNoteToSpec("barber", { fade: ["No Fade"] }).fade).toEqual({ type: "none" });
  });
  it("maps the older single-select haircut template (Squared, Blocked)", () => {
    expect(quickNoteToSpec("hair", { neckline: "Blocked", guard: "#2" })).toMatchObject({ neckline: { shape: ["squared"] }, sides: { guard: ["#2"] } });
  });
  it("is lossless: the original is kept and anything unknown goes to legacy.unmapped", () => {
    const choices = { guard: ["#1", "#9 Special"], mood: "chatty" } as any;
    const spec = quickNoteToSpec("barber", choices, "x");
    expect(spec.legacy?.quickNote).toEqual({ template: "barber", choices, extra: "x" });
    expect(spec.legacy?.unmapped).toEqual({ guard: ["#9 Special"], mood: "chatty" });
    expect(checkSpecForSave(spec).ok).toBe(true);
  });
  it("a note with only text is still a valid cut (instructions)", () => {
    expect(checkSpecForSave(quickNoteToSpec("barber", {}, "Same as last time")).ok).toBe(true);
  });
});
