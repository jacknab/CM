import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { staffMenus, type StaffMenuContext } from "./staffMenus";

const noop = () => {};
const ctx = (over: Partial<StaffMenuContext> = {}): StaffMenuContext => ({
  idName: "Tech ID", bookingSystem: true, timeclock: true, pos: true, turnSystem: true, retailPage: "/pos", languageName: "English",
  multiStation: true, stationName: "POS #1", registerId: 7, stationDrawerName: "Drawer 1", offline: false, drawerOpen: true,
  lockScreen: { on: true, saving: false }, printer: { available: true, connected: false, deviceName: null, status: "idle" },
  run: new Proxy({}, { get: () => noop }) as StaffMenuContext["run"],
  ...over,
});
const keys = (c: StaffMenuContext) => { const m = staffMenus(c); return { more: m.more.map((t) => t.key), manager: m.manager.map((t) => t.key) }; };

describe("the More and Manager menus are the same on every wrapper (owner, 2026-11-02)", () => {
  it("lists every tile in one fixed order", () => {
    expect(keys(ctx())).toEqual({
      more: ["book", "clients", "voucher", "timeclock", "retail", "myslip", "language", "manager", "refresh"],
      manager: ["settings", "possetup", "register", "messages", "keygrid", "turnrotation", "servicetimes", "managerpin", "lockscreen",
        "printer", "station", "stationdrawer", "techidprint", "reports"],
    });
  });

  it("only the wording differs between wrappers", () => {
    const nail = staffMenus(ctx({ idName: "Tech ID" }));
    const barber = staffMenus(ctx({ idName: "Barber ID" }));
    expect(barber.more.map((t) => t.key)).toEqual(nail.more.map((t) => t.key));
    // An English-only wrapper (/barber) has no Language tile; nothing else changes.
    expect(staffMenus(ctx({ idName: "Barber ID", languageName: null })).more.map((t) => t.key)).toEqual(nail.more.map((t) => t.key).filter((k) => k !== "language"));
    expect(barber.manager.map((t) => t.key)).toEqual(nail.manager.map((t) => t.key));
    expect(barber.manager.find((t) => t.key === "techidprint")!.label).toBe("Barber ID Print");
    expect(barber.manager.find((t) => t.key === "lockscreen")!.sub).toBe("On · Barber ID to use the front desk");
  });

  it("leaves a tile out by the same rule everywhere", () => {
    const k = keys(ctx({ bookingSystem: false, turnSystem: false, multiStation: false, retailPage: null, offline: true, printer: { available: false, connected: false, deviceName: null, status: "idle" } }));
    expect(k.more).toEqual(["clients", "voucher", "timeclock", "myslip", "language", "manager"]);
    expect(k.manager).toEqual(["settings", "possetup", "register", "messages", "keygrid", "servicetimes", "managerpin", "lockscreen", "techidprint", "reports"]);
  });

  it("Online Check-In is a Manager tile only where the shop has the line (barbershops), after Service Times", () => {
    const run = { ...ctx().run, onlineLine: noop };
    expect(keys(ctx({ onlineLine: null, run })).manager).not.toContain("onlineline");
    const m = staffMenus(ctx({ onlineLine: { enabled: true, paused: true }, run })).manager;
    expect(m.map((t) => t.key).slice(6, 8)).toEqual(["servicetimes", "onlineline"]);
    expect(m.find((t) => t.key === "onlineline")!.sub).toBe("Paused");
  });

  it("every wrapper builds its menus from this list, not its own", () => {
    const pages = join(__dirname, "../../pages");
    const homes = readdirSync(pages).map((d) => join(pages, d)).flatMap((d) => {
      try { return readdirSync(d).filter((f) => /Home\.tsx$/.test(f)).map((f) => join(d, f)); } catch { return []; }
    }).filter((f) => existsSync(f) && /MoreMenu/.test(readFileSync(f, "utf8")));
    expect(homes.length).toBeGreaterThanOrEqual(2);
    for (const f of homes) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toContain("staffMenus(");
      expect(src, f).not.toMatch(/(moreTiles|managerTiles): MoreTile\[\] = \[/);
    }
  });
});
