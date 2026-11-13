import { describe, expect, it } from "vitest";
import { businessTypeOf } from "@shared/kiosk/businessTypes";
import { kioskFlow, menuPageCount, nextKioskStep, normalizeKioskLayout, normalizeSteps, previousKioskStep, validateKioskLayout } from "@shared/kiosk/layout";
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

describe("screens", () => {
  const svc = (id: string, serviceId: number) => ({ id, kind: "service", serviceId });
  it("keeps good screens and drops broken buttons and links", () => {
    const l = normalizeKioskLayout({
      menuMode: "screens", startMenuId: "home",
      menus: [
        { id: "home", name: "Home", style: "grid", cols: 2, rows: 2, tiles: [
          { id: "t1", kind: "menu", menuId: "nails", label: "  Nails  " },
          svc("t2", 5),
          { id: "t3", kind: "menu", menuId: "gone" },   // no such screen
          { id: "t4", kind: "menu", menuId: "home" },   // links to itself
          svc("t2", 6),                                 // repeated button id
          null, null,
        ] },
        { id: "nails", name: "Nails", style: "single", cols: 4, rows: 6, tiles: [svc("t5", 7), { id: "bad", kind: "service", serviceId: "x" }] },
        { id: "home", name: "Duplicate" },
      ],
    }, "nail");
    expect(l.menuMode).toBe("screens");
    expect(l.menus.map((m) => m.id)).toEqual(["home", "nails"]);
    expect(l.menus[0].tiles).toEqual([{ id: "t1", kind: "menu", menuId: "nails", label: "Nails" }, { id: "t2", kind: "service", serviceId: 5 }]);
    expect(l.menus[1]).toMatchObject({ style: "single", cols: 1, rows: 1, tiles: [{ id: "t5", kind: "service", serviceId: 7 }] });
  });
  it("clamps the grid and keeps at most 10 pages", () => {
    const tiles = Array.from({ length: 300 }, (_, i) => svc(`t${i}`, i + 1));
    const [m] = normalizeKioskLayout({ menus: [{ id: "a", name: "A", style: "grid", cols: 9, rows: 0, tiles }] }, "nail").menus;
    expect([m.cols, m.rows]).toEqual([4, 1]);
    expect(m.tiles).toHaveLength(40);
    expect(menuPageCount(m)).toBe(10);
  });
  it("falls back to the catalog without a start screen", () => {
    const l = normalizeKioskLayout({ menuMode: "screens", startMenuId: "nope", menus: [{ id: "a", name: "A", tiles: [] }] }, "nail");
    expect(l.menuMode).toBe("catalog");
    expect(l.startMenuId).toBe(null);
  });
  it("says what is wrong with a screen", () => {
    const errors = validateKioskLayout({
      menuMode: "screens", startMenuId: "x",
      menus: [{ id: "a", name: "A", style: "grid", cols: 5, rows: 2, tiles: [{ id: "t", kind: "menu", menuId: "zzz" }] }],
    });
    expect(errors).toEqual(['"A": columns must be 1 to 4.', '"A" has a button to a screen that doesn\'t exist.', "Choose the screen clients start on."]);
  });
});

describe("picture screens", () => {
  const base = { id: "pic", name: "Shapes", kind: "picture", imageUrl: "https://cdn.example.com/kiosk/shapes.webp" };
  it("keeps tap spots inside the picture and drops broken ones", () => {
    const l = normalizeKioskLayout({ builder: "picture", menus: [
      { ...base, tiles: [{ id: "t", kind: "service", serviceId: 1 }], spots: [
        { id: "s1", x: 10, y: 20, w: 30, h: 10, action: { kind: "service", serviceId: 5 } },
        { id: "s2", x: 95, y: -5, w: 1, h: 200, action: { kind: "addon", addonId: 9 } },  // too small, too tall, off the edge
        { id: "s3", x: 0, y: 0, w: 10, h: 10, action: { kind: "function", fn: "continue" } },
        { id: "s4", x: 0, y: 0, w: 10, h: 10, action: { kind: "function", fn: "explode" } }, // unknown function
        { id: "s5", x: 0, y: 0, w: 10, h: 10, action: { kind: "menu", menuId: "pic" } },     // itself
        { id: "s6", x: 0, y: 0, w: 10, h: 10, action: { kind: "menu", menuId: "other" } },
        { id: "s1", x: 0, y: 0, w: 10, h: 10, action: { kind: "service", serviceId: 6 } },   // repeated id
      ] },
      { id: "other", name: "Other", kind: "picture" },
    ] }, "nail");
    const [pic] = l.menus;
    expect(pic.kind).toBe("picture");
    expect(pic.tiles).toEqual([]);
    expect(pic.spots.map((s) => s.id)).toEqual(["s1", "s2", "s3", "s6"]);
    expect(pic.spots[1]).toMatchObject({ x: 95, y: 0, w: 4, h: 100 });
    expect(menuPageCount(pic)).toBe(1);
    expect(l.menus[1]).toMatchObject({ kind: "picture", imageUrl: null, spots: [], tiles: [] });
  });
  it("only keeps an uploaded picture", () => {
    const [pic] = normalizeKioskLayout({ menus: [{ ...base, imageUrl: "data:image/png;base64,xx" }] }, "nail").menus;
    expect(pic.imageUrl).toBe(null);
  });
  it("says when a tap spot opens a screen that doesn't exist", () => {
    expect(validateKioskLayout({ menus: [{ ...base, spots: [{ id: "a", action: { kind: "menu", menuId: "zzz" } }] }] }))
      .toEqual(['"Shapes" has a tap spot to a screen that doesn\'t exist.']);
  });
});

describe("footer and required groups", () => {
  it("keeps the footer only on picture screens", () => {
    const pics = normalizeKioskLayout({ builder: "picture", menus: [
      { id: "p", name: "P", kind: "picture", footer: true },
      { id: "q", name: "Q", kind: "picture" },
    ] }, "nail");
    expect(pics.menus.map((m) => m.footer)).toEqual([true, false]);
    const buttons = normalizeKioskLayout({ builder: "easy", menus: [{ id: "b", name: "B", kind: "buttons", footer: true }] }, "nail");
    expect(buttons.menus[0].footer).toBe(false);
  });
  it("cleans the required groups", () => {
    const l = normalizeKioskLayout({ requiredGroups: ["  Nail   shape ", "nail shape", "", 7, "Length"] }, "nail");
    expect(l.requiredGroups).toEqual(["Nail shape", "Length"]);
    expect(normalizeKioskLayout({}, "nail").requiredGroups).toEqual([]);
  });
});

describe("one builder per kiosk", () => {
  const pic = { id: "p", name: "P", kind: "picture", spots: [{ id: "s", x: 0, y: 0, w: 10, h: 10, action: { kind: "menu", menuId: "b" } }] };
  const btn = { id: "b", name: "B", kind: "buttons", tiles: [{ id: "t", kind: "menu", menuId: "p" }] };
  it("keeps only the chosen builder's screens, and links between kinds go with them", () => {
    const l = normalizeKioskLayout({ builder: "picture", menuMode: "screens", startMenuId: "p", menus: [pic, btn] }, "nail");
    expect(l.builder).toBe("picture");
    expect(l.menus.map((m) => m.id)).toEqual(["p"]);
    expect(l.menus[0].spots).toEqual([]);
    const e = normalizeKioskLayout({ builder: "easy", menus: [pic, btn] }, "nail");
    expect(e.menus.map((m) => m.id)).toEqual(["b"]);
    expect(e.menus[0].tiles).toEqual([]);
  });
  it("gives a design from before builders the builder of its start screen", () => {
    expect(normalizeKioskLayout({ startMenuId: "p", menus: [pic] }, "nail").builder).toBe("picture");
    expect(normalizeKioskLayout({ startMenuId: "b", menus: [btn, pic] }, "nail").builder).toBe("easy");
    expect(normalizeKioskLayout({}, "nail").builder).toBe("easy");
  });
  it("refuses to save a mix", () => {
    expect(validateKioskLayout({ builder: "easy", menus: [btn, pic] })).toEqual(["This kiosk uses the Easy builder, so it can't have picture screens."]);
    expect(validateKioskLayout({ builder: "picture", menus: [{ ...pic, spots: [] }] })).toEqual([]);
  });
});

describe("what clients call the staff", () => {
  it("writes the staff sentences in every language and recognises them again", async () => {
    const { staffTextFor, currentStaffTitle } = await import("@shared/kiosk/presets");
    const t = staffTextFor("nailtech");
    expect(t.yourStylist).toEqual({ en: "Your nail technician", es: "Tu técnico de uñas", vi: "Kỹ thuật viên", zh: "您的美甲师", ko: "담당 네일 아티스트" });
    expect(currentStaffTitle(t)).toBe("nailtech");
    expect(currentStaffTitle({})).toBe("stylist");
    expect(currentStaffTitle({ ...t, showQr: { en: "Show this to us" } })).toBe("custom");
    expect(currentStaffTitle(KIOSK_PRESETS.barber.layout.text)).toBe("barber");
  });
});
