import { describe, expect, it } from "vitest";
import { evaluateOfflineHealth, validRegisterId, type HealthDevice, type HealthInput } from "../lib/offlineHealthRules";

const NOW = Date.parse("2026-11-02T12:00:00Z");
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

const healthyFront = (over: Partial<HealthDevice> = {}, report: any = {}): HealthDevice => ({
  deviceId: "dev_front_000001", role: "pos", registerId: 1256, receivedAt: minsAgo(1),
  report: {
    inApp: true, offline: false,
    db: { storage: "app", test: { ok: true, ms: 4 }, records: 3, unsent: 0, refused: 0, oldestUnsentAt: null },
    mirror: { complete: true, syncedAt: minsAgo(30), rows: 900, tables: 12 },
    hub: { status: "serving", peers: 1, ownAddress: "192.168.0.203", hubAddress: "192.168.0.203" },
    clock: { deviceTz: "America/Phoenix", salonTz: "America/Phoenix" },
    ...report,
  },
  ...over,
});
const healthyScreen = (report: any = {}): HealthDevice => ({
  deviceId: "dev_screen_00001", role: "screen", registerId: null, receivedAt: minsAgo(2),
  report: { inApp: true, db: { storage: "app", test: { ok: true, ms: 3 } }, hub: { status: "connected", ownAddress: "192.168.0.150", hubAddress: "192.168.0.203" }, ...report },
});
const salon = (over: Partial<HealthInput> = {}): HealthInput => ({
  now: NOW,
  devices: [healthyFront(), healthyScreen()],
  stations: [{ id: 1256, name: "POS #3", isDefault: true, isActive: true, drawerId: 8 }, { id: 1258, name: "POS #5", isDefault: false, isActive: true, drawerId: null }],
  claims: [{ registerId: 1256, deviceId: "dev_x", claimedAt: minsAgo(3) }],
  hub: { hostRegisterId: 1256, address: "192.168.0.203" },
  declinedOfflineCards: 0,
  ...over,
});

describe("offline-mode health rules", () => {
  it("keeps register zero as a valid station ID and preserves missing IDs as null", () => {
    expect(validRegisterId(0)).toBe(0);
    expect(validRegisterId(1256)).toBe(1256);
    expect(validRegisterId(null)).toBeNull();
    expect(validRegisterId(-1)).toBeNull();
    expect(validRegisterId("0")).toBeNull();
  });

  it("a healthy salon scores 100 with nothing to fix", () => {
    expect(evaluateOfflineHealth(salon())).toEqual({ score: 100, problems: [], devices: 2 });
  });

  it("recognizes the reported tablet on register zero as the elected hub", () => {
    const v = evaluateOfflineHealth(salon({
      devices: [healthyFront({ registerId: 0 }), healthyScreen()],
      stations: [],
      claims: [],
      hub: { hostRegisterId: 0, address: "192.168.0.203" },
    }));
    expect(v.problems).toEqual([]);
  });

  it("nothing reported this week: unknown, not healthy", () => {
    expect(evaluateOfflineHealth(salon({ devices: [] }))).toEqual({ score: null, problems: [], devices: 0 });
  });

  it("the app's database failing and the browser fallback are critical, with their fix", () => {
    const v = evaluateOfflineHealth(salon({ devices: [healthyFront({}, {
      db: { storage: "browser", storageError: "file is not a database", test: { ok: false, error: "SQLITE_NOTADB" } },
    }), healthyScreen()] }));
    expect(v.problems.map((p) => [p.code, p.severity, p.fix])).toEqual([
      ["db_browser_fallback", "critical", "reopen_database"],
      ["db_write_failed", "critical", "reopen_database"],
    ]);
    expect(v.score).toBe(50);
  });

  it("the hub at an old address, and a customer screen not connected to it", () => {
    const v = evaluateOfflineHealth(salon({
      devices: [healthyFront({}, { hub: { status: "serving", ownAddress: "192.168.0.210" } }), healthyScreen({ hub: { status: "connecting" } })],
    }));
    expect(v.problems.map((p) => p.code)).toEqual(["hub_address_stale", "hub_not_connected"]);
    expect(v.problems[0].text).toContain("192.168.0.203");
    expect(v.problems[0].text).toContain("192.168.0.210");
  });

  it("a hub page that says 'off' while a tablet is connected to it is not restarted (store 38, 2026-11-02)", () => {
    const off = healthyFront({}, { hub: { status: "off", ownAddress: "192.168.0.203", hubAddress: "192.168.0.203" } });
    expect(evaluateOfflineHealth(salon({ devices: [off, healthyScreen()] })).problems).toEqual([]);
    // With nobody connected to it, "off" is still a problem.
    const alone = evaluateOfflineHealth(salon({ devices: [off, healthyScreen({ hub: { status: "connected", ownAddress: "192.168.0.150", hubAddress: "192.168.0.99" } })] }));
    expect(alone.problems.map((p) => p.code)).toContain("hub_not_serving");
  });

  it("the hub set to a station with no tablet on it (store 2 on 2026-11-02: Main was POS #3, the tablet on POS #5)", () => {
    const v = evaluateOfflineHealth(salon({
      devices: [healthyFront({ registerId: 1258 }, { hub: { status: "connected", ownAddress: "192.168.0.203" } }), healthyScreen()],
      claims: [{ registerId: 1258, deviceId: "dev_front_000001", claimedAt: minsAgo(3) }],
    }));
    expect(v.problems.map((p) => p.code)).toEqual(["hub_host_missing", "main_station_empty", "station_no_drawer"]);
  });

  it("an online tablet holding changes for over an hour, an old salon copy, refused changes, declined offline cards", () => {
    const v = evaluateOfflineHealth(salon({
      devices: [healthyFront({}, {
        db: { storage: "app", test: { ok: true }, unsent: 4, refused: 2, oldestUnsentAt: minsAgo(90) },
        mirror: { complete: true, syncedAt: minsAgo(60 * 30) },
      }), healthyScreen()],
      declinedOfflineCards: 1,
    }));
    expect(v.problems.map((p) => [p.code, p.severity])).toEqual([
      ["unsent_stuck", "critical"], ["unsent_refused", "warning"], ["mirror_stale", "warning"], ["offline_card_declined", "warning"],
    ]);
    expect(v.score).toBe(45);
  });

  it("the app's database file failing SQLite's check (phase 4: the app reports it)", () => {
    const v = evaluateOfflineHealth(salon({ devices: [healthyFront({}, { app: { db: { ok: false, result: "database disk image is malformed" } } }), healthyScreen()] }));
    expect(v.problems).toEqual([expect.objectContaining({ code: "db_integrity", severity: "critical", fix: "reopen_database" })]);
    expect(v.problems[0].text).toContain("malformed");
  });

  it("a tablet whose clock is in another zone is only a note", () => {
    const v = evaluateOfflineHealth(salon({ devices: [healthyFront({}, { clock: { deviceTz: "America/Chicago", salonTz: "America/Phoenix" } }), healthyScreen()] }));
    expect(v.problems).toHaveLength(1);
    expect(v.problems[0]).toMatchObject({ code: "clock_zone", severity: "info" });
    expect(v.score).toBe(98);
  });

  it("a front desk that stopped reporting a day ago", () => {
    const v = evaluateOfflineHealth(salon({ devices: [healthyFront({ receivedAt: minsAgo(60 * 30) })] }));
    expect(v.problems.map((p) => p.code)).toEqual(["stopped_reporting"]);
  });
});
