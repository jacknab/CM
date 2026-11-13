import { describe, expect, it } from "vitest";
import { businessTypeOf } from "@shared/kiosk/businessTypes";
import { kioskFlow, nextKioskStep, normalizeKioskLayout, normalizeSteps, previousKioskStep, validateKioskLayout } from "@shared/kiosk/layout";
import { defaultKioskLayout, KIOSK_PRESETS } from "@shared/kiosk/presets";
import { fillKioskText, resolveKioskText } from "@shared/kiosk/text";

describe("businessTypeOf", () => {
  it("reads the sign-up categories", () => {
    expect(businessTypeOf("Nail Salon").key).toBe("nail");
    expect(businessTypeOf("Hair Salon").key).toBe("hair");
    expect(businessTypeOf("Barbershop").key).toBe("barber");
    expect(businessTypeOf("Spa").key).toBe("spa");
    expect(businessTypeOf("Esthetician").key).toBe("esthetics");
    expect(businessTypeOf("Pet Groomer").key).toBe("pet");
    expect(businessTypeOf("Tattoo Studio").key).toBe("tattoo");
    expect(businessTypeOf("Other").key).toBe("other");
    expect(businessTypeOf(null).key).toBe("other");
  });
  it("counts a mixed hair and nail salon as a nail salon, like the staff screens do", () => {
    expect(businessTypeOf("Hair & Nail Salon").key).toBe("nail");
  });
});

describe("presets", () => {
  it("keeps today's kiosk for nail and hair salons", () => {
    const nail = KIOSK_PRESETS.nail.layout;
    expect(nail.theme.look).toBe("boutique");
    expect(kioskFlow(nail)).toEqual(["category", "services", "questions", "addons", "provider"]);
    expect(nail.text).toEqual({});
    expect(nail.services).toMatchObject({ maxServices: 2, maxVisitMinutes: 150 });
    expect(KIOSK_PRESETS.hair.layout.theme.look).toBe("classic");
    expect(KIOSK_PRESETS.hair.layout.text).toEqual({});
  });
  it("names the staff for the business type in every language", () => {
    const t = KIOSK_PRESETS.barber.layout.text;
    expect(t.yourStylist).toEqual({ en: "Your barber", es: "Tu barbero", vi: "Thợ cắt tóc", zh: "您的理发师", ko: "담당 이발사" });
    expect(t.pickStylist.ko).toBe("선호하는 이발사를 선택하거나 다음 가용 이발사를 선택하세요");
    // final consonant → 을
    expect(KIOSK_PRESETS.esthetics.layout.text.whoWouldYouLike.ko).toBe("어떤 에스테티션을 원하시나요?");
  });
  it("every preset is already normal", () => {
    for (const p of Object.values(KIOSK_PRESETS)) expect(normalizeKioskLayout(p.layout, "other")).toEqual(p.layout);
  });
  it("carries the kiosk settings a store already had", () => {
    const l = defaultKioskLayout("Nail Salon", { showServicePrice: false, smartCheckin: false });
    expect(l.services.showPrice).toBe(false);
    expect(l.services.showDuration).toBe(true);
    expect(l.smartCheckin).toBe(false);
    expect(KIOSK_PRESETS.nail.layout.services.showPrice).toBe(true); // the preset itself is untouched
  });
});

describe("normalizeKioskLayout", () => {
  it("fills in a missing or broken layout", () => {
    const l = normalizeKioskLayout("nonsense", "hair");
    expect(l.preset).toBe("hair");
    expect(l.steps.every((s) => s.enabled)).toBe(true);
    expect(l.welcome.languages[0]).toBe("en");
  });
  it("clamps limits and drops bad colours, pictures, languages and text", () => {
    const l = normalizeKioskLayout({
      services: { maxServices: 9, maxVisitMinutes: 5 },
      theme: { look: "neon", colors: { primary: "#ABCDEF", text: "red" } },
      welcome: { imageUrl: "javascript:alert(1)", languages: ["fr", "vi"] },
      text: { pickStylist: { en: "  Pick   someone ", fr: "x" }, madeUp: { en: "x" } },
    }, "nail");
    expect(l.services.maxServices).toBe(3);
    expect(l.services.maxVisitMinutes).toBe(30);
    expect(l.theme).toEqual({ look: "classic", colors: { primary: "#abcdef" } });
    expect(l.welcome).toEqual({ imageUrl: null, languages: ["en", "vi"] });
    expect(l.text).toEqual({ pickStylist: { en: "Pick someone" } });
  });
  it("repairs the step order and never loses the services step", () => {
    const steps = normalizeSteps([{ id: "provider", enabled: true }, { id: "services", enabled: false }, { id: "category", enabled: false }, { id: "provider" }]);
    expect(steps.map((s) => s.id)).toEqual(["category", "services", "provider", "questions", "addons"]);
    expect(steps.find((s) => s.id === "services")!.enabled).toBe(true);
    expect(steps.find((s) => s.id === "questions")!.enabled).toBe(false);
  });
});

describe("validateKioskLayout", () => {
  it("accepts a preset", () => {
    expect(validateKioskLayout(KIOSK_PRESETS.spa.layout)).toEqual([]);
  });
  it("says what is wrong", () => {
    const errors = validateKioskLayout({
      theme: { colors: { primary: "pink" } },
      services: { maxServices: 0 },
      steps: [{ id: "services", enabled: false }],
      text: { pickStylist: { en: "x".repeat(200) }, nope: { en: "x" } },
    });
    expect(errors).toHaveLength(5);
  });
});

describe("flow", () => {
  const flow = kioskFlow({ steps: normalizeSteps([{ id: "category", enabled: false }, { id: "services", enabled: true }, { id: "provider", enabled: true }, { id: "addons", enabled: true }]) });
  it("walks the switched-on steps in the owner's order, skipping ones with nothing to show", () => {
    expect(flow).toEqual(["services", "provider", "addons"]);
    expect(nextKioskStep(flow, null, () => true)).toBe("services");
    expect(nextKioskStep(flow, "services", () => true)).toBe("provider");
    expect(nextKioskStep(flow, "services", (id) => id !== "provider")).toBe("addons");
    expect(nextKioskStep(flow, "addons", () => true)).toBe("review");
  });
  it("goes back the same way", () => {
    expect(previousKioskStep(flow, "review", () => true)).toBe("addons");
    expect(previousKioskStep(flow, "review", (id) => id === "services")).toBe("services");
    expect(previousKioskStep(flow, "services", () => true)).toBe(null);
  });
});

describe("kiosk text", () => {
  const owner = { pickStylist: { en: "Choose your pro" } };
  const presetText = KIOSK_PRESETS.barber.layout.text;
  it("uses the business's words, falling back to their English", () => {
    expect(resolveKioskText("pickStylist", "vi", [owner, presetText], "built-in")).toBe("Choose your pro");
  });
  it("then the preset's words for that language, then the built-in text", () => {
    expect(resolveKioskText("yourStylist", "es", [owner, presetText], "Tu estilista")).toBe("Tu barbero");
    expect(resolveKioskText("nextAvailable", "es", [owner, presetText], "Próximo Disponible")).toBe("Próximo Disponible");
    expect(resolveKioskText("frontDeskTitle", "ko", [owner, presetText])).toBe("Please check in at the front desk");
  });
  it("fills the name", () => {
    expect(fillKioskText("Hi {name}!", { name: "Ann" })).toBe("Hi Ann!");
  });
});
