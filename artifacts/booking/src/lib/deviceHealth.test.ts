import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const net = vi.hoisted(() => ({ offline: true }));
vi.mock("@/lib/sync-engine", () => ({ syncEngine: { isOffline: () => net.offline } }));
vi.mock("@/lib/local-hub", () => ({ localHub: { snapshot: () => ({ status: "connected", peers: 0, ownAddress: "10.0.0.5", hubAddress: "10.0.0.2" }) } }));
vi.mock("@/lib/salon-mirror", () => ({ salonMirrorStatus: async () => ({ rows: { clients: 10, staff: 3 }, syncedAt: "2026-11-02T09:00:00Z", complete: true }) }));
vi.mock("@/lib/stationDevice", () => ({ getStationDeviceId: () => "dev_testtablet01" }));
vi.mock("@/lib/salonClock", () => ({ salonTimeZone: () => "America/Phoenix" }));
vi.mock("@/lib/nail-offline", () => ({
  offlineStorage: () => ({ kind: "app", error: null }),
  nailOffline: {
    selfTest: async () => ({ ok: true, ms: 3 }),
    localRecords: async () => [{ id: -1 }, { id: -2 }],
    ops: async () => [{ state: "pending", createdAt: "2026-11-02T09:30:00Z" }, { state: "done", createdAt: "2026-11-02T09:00:00Z" }],
    lastSyncAt: async () => null,
  },
}));

import { startDeviceHealth } from "./deviceHealth";

const store = new Map<string, string>();
let sent: any[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  store.clear(); sent = []; net.offline = true;
  (globalThis as any).window = { location: { pathname: "/nail" } };
  (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  (globalThis as any).fetch = async (_url: string, init: any) => { sent.push(JSON.parse(init.body)); return new Response("{}", { status: 200 }); };
});
afterEach(() => { vi.useRealTimers(); });

describe("the tablet's offline health report", () => {
  test("kept on the tablet while offline, then all sent with the next one once online", async () => {
    const stop = startDeviceHealth({ role: "pos", storeId: 2, registerId: 1256, usesOfflineQueue: true });
    await vi.advanceTimersByTimeAsync(15_000);           // first report: offline, kept
    await vi.advanceTimersByTimeAsync(2 * 60_000);       // second: offline, kept
    expect(sent).toEqual([]);
    net.offline = false;
    await vi.advanceTimersByTimeAsync(2 * 60_000);       // back online: three reports in one send
    stop();
    expect(sent).toHaveLength(1);
    expect(sent[0].deviceId).toBe("dev_testtablet01");
    expect(sent[0].reports).toHaveLength(3);
    expect(sent[0].reports[0]).toMatchObject({ offline: true, role: "pos", registerId: 1256 });
    expect(sent[0].reports[2]).toMatchObject({
      offline: false,
      db: { storage: "app", test: { ok: true }, records: 2, unsent: 1, refused: 0, oldestUnsentAt: "2026-11-02T09:30:00Z" },
      mirror: { complete: true, rows: 13, tables: 2 },
      hub: { status: "connected", hubAddress: "10.0.0.2" },
      clock: { salonTz: "America/Phoenix" },
    });
    expect(store.get("certxa.health.kept")).toBe("[]");
  });
});
