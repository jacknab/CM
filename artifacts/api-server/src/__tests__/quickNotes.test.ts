import { describe, expect, test } from "vitest";
import { buildQuickNoteText, cleanQuickNoteChoices, quickNoteTemplateFor, rememberChoices, QUICK_NOTE_TEMPLATES } from "@shared/quickNotes";

describe("Quick Notes", () => {
  test("the template follows the business type", () => {
    expect(quickNoteTemplateFor("Nail Salon").id).toBe("nail");
    expect(quickNoteTemplateFor("Barbershop").id).toBe("barber");
    expect(quickNoteTemplateFor("Hair Salon").id).toBe("hair");
    expect(quickNoteTemplateFor("Lash and Brows").id).toBe("generic");
    expect(quickNoteTemplateFor(null).id).toBe("generic");
  });
  test("haircut note reads naturally", () => {
    expect(buildQuickNoteText("hair", { guard: "#2", fade: "Low", neckline: "Tapered", sideburns: "Mid", top: "Scissor cut" }))
      .toBe("Back and sides cut with a #2 guard and low fade. Neckline tapered. Sideburns kept at medium length. Top scissor cut.");
    expect(buildQuickNoteText("hair", { fade: "Skin Fade", top: "2 inches" })).toBe("Skin fade. Top cut to 2 inches.");
  });
  test("nail note reads naturally", () => {
    expect(buildQuickNoteText("nail", { shape: "Square", length: "Short", color: "Nude", remember: ["Gentle cuticles", "Thin natural nails"] }))
      .toBe("Prefers square-shaped, short nails with nude colors. Likes gentle cuticle care and has thin natural nails.");
    expect(buildQuickNoteText("nail", { color: "No preference" })).toBe("No color preference.");
    expect(buildQuickNoteText("nail", { color: "Red" })).toBe("Prefers red colors.");
  });
  test("nothing picked: only the professional's own words, or nothing", () => {
    expect(buildQuickNoteText("nail", {}, "  allergic to acetone ")).toBe("Allergic to acetone.");
    expect(buildQuickNoteText("hair", {}, "")).toBe("");
    expect(buildQuickNoteText("generic", { remember: ["Same professional"] }, "Bring water!")).toBe("Prefers the same professional. Bring water!");
  });
  test("only real options are kept, and only remember fields carry forward", () => {
    const t = QUICK_NOTE_TEMPLATES.nail;
    const c = cleanQuickNoteChoices(t, { shape: "Square", length: "Huge", remember: ["Sensitive skin", "Hacked"], guard: "#2" });
    expect(c).toEqual({ shape: "Square", remember: ["Sensitive skin"] });
    expect(rememberChoices(t, c)).toEqual(["Sensitive skin"]);
  });
});
