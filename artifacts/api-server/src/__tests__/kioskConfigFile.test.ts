import { describe, expect, it } from "vitest";
import { normalizeKioskLayout } from "@shared/kiosk/layout";
import { buildKioskConfigFile, missingKioskExtras, parseKioskConfigFile, remapKioskLayout } from "@shared/kiosk/configFile";

const layout = normalizeKioskLayout({
  preset: "nail", builder: "easy", menuMode: "screens", startMenuId: "home",
  menus: [
    { id: "home", name: "Home", style: "grid", cols: 2, rows: 2, tiles: [
      { id: "a", kind: "service", serviceId: 10 }, { id: "b", kind: "service", serviceId: 11 }, { id: "c", kind: "menu", menuId: "more" },
    ] },
    { id: "more", name: "More", style: "grid", cols: 2, rows: 2, tiles: [
      { id: "d", kind: "service", serviceId: 12 }, { id: "e", kind: "addon", addonId: 50 },
    ] },
  ],
}, "nail");
/** The same kind of design made with the Picture builder. */
const picLayout = normalizeKioskLayout({
  preset: "nail", builder: "picture", menuMode: "screens", startMenuId: "pic",
  menus: [{ id: "pic", name: "Picture", kind: "picture", imageUrl: "https://cdn.example.com/kiosk/p.webp", spots: [
    { id: "s1", x: 0, y: 0, w: 10, h: 10, action: { kind: "service", serviceId: 12 } },
    { id: "s2", x: 0, y: 20, w: 10, h: 10, action: { kind: "addon", addonId: 50 } },
    { id: "s3", x: 0, y: 40, w: 10, h: 10, action: { kind: "function", fn: "continue" } },
  ] }],
}, "nail");
const exporter = {
  services: [{ id: 10, name: "Gel Manicure", category: "Manicures" }, { id: 11, name: "Basic Pedicure", category: "Pedicures" },
    { id: 12, name: "French Tips", category: "Nail Art" }, { id: 13, name: "Unused", category: null }],
  addons: [{ id: 50, name: "Paraffin Wax" }, { id: 51, name: "Unused add-on" }],
};

describe("kiosk configuration files", () => {
  const file = buildKioskConfigFile("  Spring   menu ", layout, exporter, new Date("2026-11-13T00:00:00Z"));
  it("writes only what the design uses, and nothing private", () => {
    expect(file.name).toBe("Spring menu");
    expect(file.catalog.services.map((s) => s.id)).toEqual([10, 11, 12]);
    expect(file.catalog.addons).toEqual([{ id: 50, name: "Paraffin Wax" }]);
    expect(JSON.stringify(file)).not.toMatch(/storeId|phone|email/i);
  });
  it("reads back what it wrote (through JSON)", () => {
    const r = parseKioskConfigFile(JSON.parse(JSON.stringify(file)));
    expect(r.ok && r.file.layout).toEqual(layout);
  });
  it("refuses other files", () => {
    expect(parseKioskConfigFile({ hello: 1 })).toEqual({ ok: false, error: "This isn't a Certxa kiosk configuration file." });
    expect(parseKioskConfigFile({ ...file, formatVersion: 99 }).ok).toBe(false);
  });
  it("matches buttons and spots to another business's catalog by name, and lists what is missing", () => {
    const other = {
      services: [{ id: 900, name: "gel  manicure", category: "Manicures" }, { id: 901, name: "French Tips", category: "Other" }, { id: 902, name: "French Tips", category: "Nail Art" }],
      addons: [{ id: 700, name: "PARAFFIN WAX" }],
    };
    const { layout: l, unmatched } = remapKioskLayout(file, other);
    expect(l.menus[0].tiles.map((t) => t && (t.kind === "service" ? t.serviceId : t.menuId))).toEqual([900, null, "more"]);
    expect(l.menus[1].tiles).toEqual([{ id: "d", kind: "service", serviceId: 902 }, { id: "e", kind: "addon", addonId: 700 }]); // same name + category wins
    expect(unmatched).toEqual({ services: ["Basic Pedicure"], addons: [] });
    expect(l.menuMode).toBe("screens");
    // and a Picture-builder design's tap spots the same way
    const pf = buildKioskConfigFile("Pic", picLayout, exporter);
    const pr = remapKioskLayout(JSON.parse(JSON.stringify(pf)), other);
    expect(pr.layout.builder).toBe("picture");
    expect(pr.layout.menus[0].spots.map((sp) => sp.action)).toEqual([
      { kind: "service", serviceId: 902 }, { kind: "addon", addonId: 700 }, { kind: "function", fn: "continue" },
    ]);
  });
  it("keeps everything when imported into the same business", () => {
    const { layout: l, unmatched } = remapKioskLayout(file, exporter);
    expect(l).toEqual(layout);
    expect(unmatched).toEqual({ services: [], addons: [] });
  });
});

describe("kiosk extras in configuration files", () => {
  const withExtras = normalizeKioskLayout({
    menuMode: "screens", startMenuId: "shapes",
    menus: [{ id: "shapes", name: "Shapes", style: "grid", cols: 2, rows: 2, tiles: [
      { id: "t1", kind: "addon", addonId: 60 }, { id: "t2", kind: "addon", addonId: 61 }, { id: "t3", kind: "addon", addonId: "x" },
    ] }],
  }, "nail");
  const exporter = {
    services: [],
    addons: [
      { id: 60, name: "Coffin", kioskExtra: true, price: 5, duration: 10, group: "Nail shape" },
      { id: 61, name: "Square", kioskExtra: true, price: 0, duration: 0, group: "Nail shape" },
    ],
  };
  it("keeps add-on buttons and drops broken ones", () => {
    expect(withExtras.menus[0].tiles).toEqual([{ id: "t1", kind: "addon", addonId: 60 }, { id: "t2", kind: "addon", addonId: 61 }]);
  });
  it("writes what another business needs to make the extras", () => {
    const file = buildKioskConfigFile("Shapes", withExtras, exporter);
    expect(file.catalog.addons).toEqual([
      { id: 60, name: "Coffin", kioskExtra: true, price: 5, duration: 10, group: "Nail shape" },
      { id: 61, name: "Square", kioskExtra: true, price: 0, duration: 0, group: "Nail shape" },
    ]);
  });
  it("lists the extras an importing business is missing, then maps the buttons once they exist", () => {
    const parsed = parseKioskConfigFile(JSON.parse(JSON.stringify(buildKioskConfigFile("Shapes", withExtras, exporter))));
    if (!parsed.ok) throw new Error(parsed.error);
    const own = { services: [], addons: [{ id: 900, name: "square" }] };
    expect(missingKioskExtras(parsed.file, own).map((a) => a.name)).toEqual(["Coffin"]);
    const { layout, unmatched } = remapKioskLayout(parsed.file, { services: [], addons: [...own.addons, { id: 901, name: "Coffin" }] });
    expect(layout.menus[0].tiles).toEqual([{ id: "t1", kind: "addon", addonId: 901 }, { id: "t2", kind: "addon", addonId: 900 }]);
    expect(unmatched.addons).toEqual([]);
  });
  it("keeps prices from a file sensible", () => {
    const parsed = parseKioskConfigFile({ format: "certxa-kiosk-config", formatVersion: 1, name: "x", layout: {}, catalog: { addons: [
      { id: 1, name: "Huge", kioskExtra: true, price: 1e9, duration: -5, group: "  " },
    ] } });
    expect(parsed.ok && parsed.file.catalog.addons[0]).toMatchObject({ price: 100000, duration: 0, group: null });
  });
});
