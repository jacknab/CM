import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ hub: "connected", pending: 2 }));
vi.mock("@/lib/local-hub", () => ({ localHub: { refresh: async () => ({ status: state.hub, ownAddress: "10.0.0.5", hubAddress: "10.0.0.2" }) } }));
vi.mock("@/lib/sync-engine", () => ({ syncEngine: { runSync: async () => { state.pending = 0; } } }));
vi.mock("@/lib/nail-offline", () => ({
  nailOffline: { ops: async () => Array.from({ length: state.pending }, () => ({ state: "pending" })) },
  offlineStorage: () => ({ kind: "app", error: null }),
}));
vi.mock("@/lib/salon-mirror", () => ({ syncSalonMirror: async () => {}, salonMirrorStatus: async () => ({ complete: true, rows: { clients: 5 } }) }));
vi.mock("@/lib/stationDevice", () => ({ getStationDeviceId: () => "dev_testtablet01" }));
vi.mock("@/lib/kioskDevice", () => ({ kioskFetch: async () => new Response("{}") }));

import { onDeviceCommandMessage, runDeviceCommands, setCommandContext } from "./deviceCommands";

let results: any[] = [];
beforeEach(() => {
  results = []; state.hub = "connected"; state.pending = 2;
  (globalThis as any).fetch = async (_u: string, init: any) => { results.push(JSON.parse(init.body)); return new Response("{}"); };
});

describe("fixes the server sends a tablet", () => {
  test("each is carried out and its result reported; one the page can't do says so", async () => {
    await runDeviceCommands([{ id: 1, command: "refresh_hub" }, { id: 2, command: "retry_unsent" }, { id: 3, command: "resync_mirror" }, { id: 4, command: "reopen_database" }], { storeId: 2 });
    expect(results.map((r) => [r.id, r.ok])).toEqual([[1, true], [2, true], [3, true], [4, false]]);
    expect(results[0]).toMatchObject({ deviceId: "dev_testtablet01", detail: expect.stringContaining("10.0.0.2") });
    expect(results[1].detail).toBe("Everything has been sent");
    expect(results[3].detail).toMatch(/newer Certxa app/);
  });

  test("a hub that still won't link is reported as failed", async () => {
    state.hub = "connecting";
    await runDeviceCommands([{ id: 5, command: "refresh_hub" }], { storeId: 2 });
    expect(results).toEqual([expect.objectContaining({ id: 5, ok: false })]);
  });

  test("a command on the live connection for another tablet is ignored", async () => {
    setCommandContext({ storeId: 2 });
    onDeviceCommandMessage({ deviceId: "dev_othertablet9", id: 6, command: "refresh_hub" });
    onDeviceCommandMessage({ deviceId: "dev_testtablet01", id: 7, command: "refresh_hub" });
    await new Promise((r) => setTimeout(r, 0));
    expect(results.map((r) => r.id)).toEqual([7]);
  });

  test("the fixes only the app can do are asked of the app, and its answer is reported", async () => {
    const asked: any[] = [];
    const win: any = Object.assign(new EventTarget(), {
      CERTXA_DEVICE_FIX: 1,
      ReactNativeWebView: { postMessage: (raw: string) => {
        const m = JSON.parse(raw); asked.push(m);
        const reply = m.command === "restart_app" ? { ok: false, detail: "Not restarted: a payment or pop-up is open on this tablet" } : { ok: true, detail: "Offline database reopened, checked and written to" };
        setTimeout(() => win.dispatchEvent(new CustomEvent("certxa_device_reply", { detail: { requestId: m.requestId, ...reply } })), 0);
      } },
    });
    const before = (globalThis as any).window;
    (globalThis as any).window = win;
    try {
      await runDeviceCommands([{ id: 8, command: "reopen_database" }, { id: 9, command: "restart_app" }], { storeId: 2 });
    } finally {
      (globalThis as any).window = before;
    }
    expect(asked.map((m) => [m.type, m.command])).toEqual([["DEVICE_FIX", "reopen_database"], ["DEVICE_FIX", "restart_app"]]);
    expect(results.map((r) => [r.id, r.ok, r.detail])).toEqual([
      [8, true, "Offline database reopened, checked and written to"],
      [9, false, "Not restarted: a payment or pop-up is open on this tablet"],
    ]);
  });
});
