import { describe, expect, it } from "vitest";
import { normalizeKioskLayout } from "@shared/kiosk/layout";
import { buildKioskConfigFile, parseKioskConfigFile, remapKioskLayout } from "@shared/kiosk/configFile";

const layout = normalizeKioskLayout({
  preset: "nail", menuMode: "screens", startMenuId: "home",
  menus: [
    { id: "home", name: "Home", style: "grid", cols: 2, rows: 2, tiles: [
      { id: "a", kind: "service", serviceId: 10 }, { id: "b", kind: "service", serviceId: 11 }, { id: "c", kind: "menu", menuId: "pic" },
    ] },
    { id: "pic", name: "Picture", kind: "picture", imageUrl: "https://cdn.example.com/kiosk/p.webp", spots: [
      { id: "s1", x: 0, y: 0, w: 10, h: 10, action: { kind: "service", serviceId: 12 } },
      { id: "s2", x: 0, y: 20, w: 10, h: 10, action: { kind: "addon", addonId: 50 } },
      { id: "s3", x: 0, y: 40, w: 10, h: 10, action: { kind: "function", fn: "continue" } },
    ] },
  ],
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
    expect(l.menus[0].tiles.map((t) => t && (t.kind === "service" ? t.serviceId : t.menuId))).toEqual([900, null, "pic"]);
    expect(l.menus[1].spots.map((s) => s.action)).toEqual([
      { kind: "service", serviceId: 902 },   // the same name in the same category wins
      { kind: "addon", addonId: 700 },
      { kind: "function", fn: "continue" },
    ]);
    expect(unmatched).toEqual({ services: ["Basic Pedicure"], addons: [] });
    expect(l.menuMode).toBe("screens");
  });
  it("keeps everything when imported into the same business", () => {
    const { layout: l, unmatched } = remapKioskLayout(file, exporter);
    expect(l).toEqual(layout);
    expect(unmatched).toEqual({ services: [], addons: [] });
  });
});
