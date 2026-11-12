import { describe, expect, it } from "vitest";
import { QUICK_NOTE_TEMPLATES, buildQuickNoteText, cleanQuickNoteChoices, quickNoteLists, quickNoteTemplateFor, toggleQuickNoteOption } from "@shared/quickNotes";

// Barbershop Quick Notes (owner, 2026-11-12): multi-select pills with conflict rules.
const T = QUICK_NOTE_TEMPLATES.barber;
const f = (k: string) => T.fields.find((x) => x.key === k)!;

describe("Barbershop Quick Notes", () => {
  it("barbershops get the barbershop template; hair salons keep theirs", () => {
    expect(quickNoteTemplateFor("Barbershop").id).toBe("barber");
    expect(quickNoteTemplateFor("Hair Salon").id).toBe("hair");
    expect(T.fields.map((x) => x.label)).toEqual(["Back & Sides Guard", "Fade Style", "Neckline", "Sideburns", "Top Length & Texture"]);
  });

  it("combines techniques and applies the conflict rules", () => {
    let fade = toggleQuickNoteOption(f("fade"), [], "Low");
    fade = toggleQuickNoteOption(f("fade"), fade, "Skin Fade");
    expect(fade).toEqual(["Low", "Skin Fade"]);
    expect(toggleQuickNoteOption(f("fade"), fade, "No Fade")).toEqual(["No Fade"]);
    expect(toggleQuickNoteOption(f("fade"), ["No Fade"], "Mid")).toEqual(["Mid"]);
    expect(toggleQuickNoteOption(f("top"), ["Scissor cut", "2 inches", "Texturize/Thin"], "Leave longer")).toEqual(["Scissor cut", "Leave longer", "Texturize/Thin"]);
    expect(toggleQuickNoteOption(f("top"), ["Leave longer", "Scissor cut"], "1 inch")).toEqual(["Scissor cut", "1 inch"]);
    expect(toggleQuickNoteOption(f("neckline"), ["Rounded", "Tapered"], "Faded Out")).toEqual(["Faded Out"]);
    expect(toggleQuickNoteOption(f("neckline"), ["Faded Out"], "Natural")).toEqual(["Natural"]);
    expect(toggleQuickNoteOption(f("guard"), ["#0", "#1"], "#0")).toEqual(["#1"]); // tap again = off
  });

  it("saves arrays and writes a readable note", () => {
    const choices = cleanQuickNoteChoices(T, { guard: ["#0"], fade: ["Low", "Skin Fade", "No Fade"], neckline: ["Faded Out"], sideburns: ["Tapered"], top: ["Scissor cut", "2 inches", "Texturize/Thin"], bogus: ["x"] });
    expect(choices).toEqual({ guard: ["#0"], fade: ["Low", "Skin Fade"], neckline: ["Faded Out"], sideburns: ["Tapered"], top: ["Scissor cut", "2 inches", "Texturize/Thin"] });
    expect(buildQuickNoteText("barber", choices, "keep the part on the left")).toBe(
      "Back and sides: #0 guard, low skin fade. Neckline faded out. Sideburns tapered. Top: scissor cut, 2 inches and texturize/thin. Keep the part on the left.");
  });

  it("reads older single-choice notes", () => {
    expect(quickNoteLists({ guard: "#2", fade: "Mid", neckline: "Blocked", top: "Scissor cut" }))
      .toEqual({ guard: ["#2"], fade: ["Mid"], neckline: ["Squared/Blocked"], sideburns: [], top: ["Scissor cut"] });
  });
});
