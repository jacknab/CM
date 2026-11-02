import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Offline unless a test says otherwise: nothing is asked of the server, so only what the tablet saved decides.
const net = vi.hoisted(() => ({ offline: true, checks: [] as number[], statusFns: [] as (() => void)[] }));
vi.mock("./sync-engine", () => ({
  syncEngine: {
    isOffline: () => net.offline,
    noteUnreachable: () => {},
    checkNow: async (ms: number) => { net.checks.push(ms); return false; },
    onStatusChange: (fn: () => void) => { net.statusFns.push(fn); return () => {}; },
  },
}));

// The tablet's offline database, in memory.
const db = vi.hoisted(() => new Map<string, unknown>());
vi.mock("./nail-offline", () => ({
  nailOffline: {
    remember: async (storeId: number, url: string, data: unknown) => { db.set(`${storeId}:${url}`, data); },
    recall: async (storeId: number, url: string) => (db.has(`${storeId}:${url}`) ? { data: db.get(`${storeId}:${url}`), at: "" } : undefined),
  },
}))

// The Android app's side of the bridge: what the page asks of it, and the events it sends back.
type Posted = { type: string; [k: string]: unknown };
let posted: Posted[] = [];
const store = new Map<string, string>();
const win: any = {
  CERTXA_NATIVE_HUB: 1,
  ReactNativeWebView: { postMessage: (s: string) => posted.push(JSON.parse(s)) },
};
const appSays = (event: object) => win.__certxaHubEvent(JSON.stringify(event));

beforeEach(() => {
  net.offline = true; net.checks = []; net.statusFns = [];
  vi.useFakeTimers();
  vi.resetModules();
  posted = [];
  store.clear();
  db.clear();
  (globalThis as any).window = win;
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  };
});
afterEach(() => { vi.useRealTimers(); });

const saved = (hostRegisterId: number | null) =>
  store.set("certxa.hub.2", JSON.stringify({ token: "t", address: "10.0.0.240", hostRegisterId }));

describe("the salon hub on a tablet", () => {
  test("the host never stops its own hub, page load or the 20-second check (store 2, 2026-11-01)", async () => {
    saved(null); // the server had not elected anyone: the main POS hosts
    const { localHub } = await import("./local-hub");
    await localHub.start(2, "pos", 1256);
    appSays({ kind: "status", status: "serving", peers: 1, address: "10.0.0.240" });
    vi.advanceTimersByTime(5 * 60_000);
    expect(posted.filter((m) => m.type === "HUB_STOP")).toEqual([]);
    expect(localHub.isSelectedHost()).toBe(true);
  });

  test("a POS station elected while the main POS was away keeps hosting across a reload", async () => {
    saved(1259);
    const { localHub } = await import("./local-hub");
    await localHub.start(2, "station", 1259);
    expect(localHub.isSelectedHost()).toBe(true);
    expect(posted.map((m) => m.type)).not.toContain("HUB_STOP");
    expect(posted).toContainEqual({ type: "HUB_SERVE", token: "t" });
  });

  test("a host whose hub is not running starts it again — without stopping anything", async () => {
    saved(null);
    const { localHub } = await import("./local-hub");
    await localHub.start(2, "pos", 1256);
    appSays({ kind: "status", status: "off", peers: 0, address: null });
    posted = [];
    vi.advanceTimersByTime(20_000);
    expect(posted).toEqual([{ type: "HUB_SERVE", token: "t" }]);
  });

  test("a customer screen that is not connected starts a fresh connection", async () => {
    saved(1256);
    const { localHub } = await import("./local-hub");
    await localHub.start(2, "screen");
    expect(localHub.isSelectedHost()).toBe(false);
    expect(posted).toContainEqual({ type: "HUB_ADDRESS" });
    appSays({ kind: "status", status: "connecting", peers: 0, address: null });
    posted = [];
    vi.advanceTimersByTime(20_000);
    expect(posted).toEqual([{ type: "HUB_STOP" }, { type: "HUB_JOIN", host: "10.0.0.240", token: "t" }]);
  });

  test("a customer screen reports its internal IP in the hub snapshot", async () => {
    saved(1256);
    const { localHub } = await import("./local-hub");
    await localHub.start(2, "screen");
    appSays({ kind: "address", address: "10.0.0.241" });
    expect(localHub.snapshot()).toMatchObject({
      ownAddress: "10.0.0.241",
      hubAddress: "10.0.0.240",
      isHost: false,
    });
  });

  test("a checkout message sent while reconnecting is delivered once the link is back", async () => {
    saved(1256);
    const { localHub } = await import("./local-hub");
    await localHub.start(2, "screen");
    const statuses: string[] = [];
    localHub.onStatusChange((s) => statuses.push(s));
    appSays({ kind: "status", status: "connecting", peers: 0, address: null });
    posted = [];
    localHub.send({ type: "kiosk_checkout_receipt_choice", choice: "print", registerId: 1256 });
    expect(posted).toEqual([]);
    appSays({ kind: "status", status: "connected", peers: 0, address: null });
    expect(posted).toEqual([{ type: "HUB_SEND", message: { type: "kiosk_checkout_receipt_choice", choice: "print", registerId: 1256 } }]);
    expect(statuses).toEqual(["connecting", "connected"]);
  });

  test("a held message too old to matter, or one that is not a checkout message, is not held", async () => {
    saved(1256);
    const { localHub } = await import("./local-hub");
    await localHub.start(2, "screen");
    appSays({ kind: "status", status: "connecting", peers: 0, address: null });
    posted = [];
    localHub.send({ type: "kiosk_checkout_tip_selected", tipAmount: 5 });
    // A kiosk check-in waits for its own answer and gives up after 6 s: sending it late could make a second ticket.
    localHub.send({ type: "hub_kiosk_checkin", requestId: "r1" });
    expect(posted).toEqual([{ type: "HUB_SEND", message: { type: "hub_kiosk_checkin", requestId: "r1" } }]);
    posted = [];
    vi.advanceTimersByTime(25_000);
    posted = [];
    appSays({ kind: "status", status: "connected", peers: 0, address: null });
    expect(posted.filter((m) => m.type === "HUB_SEND")).toEqual([]);
  });

  test("the first tablet to find the internet gone tells the others, and they check at once", async () => {
    net.offline = false;
    saved(1256);
    const { localHub } = await import("./local-hub");
    await localHub.start(2, "screen");
    appSays({ kind: "status", status: "connected", peers: 0, address: null });
    posted = [];
    // This tablet notices.
    net.offline = true;
    net.statusFns.forEach((fn) => fn());
    expect(posted).toContainEqual({ type: "HUB_SEND", message: { type: "hub_net_down" } });
    // Said only once per outage.
    posted = [];
    net.statusFns.forEach((fn) => fn());
    expect(posted).toEqual([]);
  });

  test("a tablet told by another that the internet is gone checks the server straight away", async () => {
    net.offline = false;
    saved(1256);
    const { localHub } = await import("./local-hub");
    await localHub.start(2, "screen");
    const heard: unknown[] = [];
    localHub.onMessage((m) => heard.push(m));
    appSays({ kind: "message", message: { type: "hub_net_down" } });
    expect(net.checks).toEqual([3_000]);
    expect(heard).toEqual([]);
  });

  test("Update: a POS station's address goes to the server, the answer is kept on the tablet twice, and it reconnects", async () => {
    net.offline = false;
    saved(1259);
    const sent: any[] = [];
    (globalThis as any).fetch = async (url: string, init?: any) => {
      if (url === "/api/nail/hub/heartbeat") {
        sent.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ token: "t", address: "192.168.0.203", hostRegisterId: 1260 }), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    };
    const { localHub } = await import("./local-hub");
    await localHub.start(2, "station", 1256);
    posted = [];
    const pending = localHub.refresh();
    await vi.advanceTimersByTimeAsync(0);
    appSays({ kind: "address", address: "192.168.0.198" });
    await vi.advanceTimersByTimeAsync(0);
    appSays({ kind: "status", status: "connected", peers: 0, address: null });
    const r = await pending;
    expect(sent).toEqual([{ registerId: 1256, address: "192.168.0.198", force: true }]);
    expect(r).toMatchObject({ ownAddress: "192.168.0.198", hubAddress: "192.168.0.203", isHost: false, savedOnServer: true });
    expect(JSON.parse(store.get("certxa.hub.2")!)).toEqual({ token: "t", address: "192.168.0.203", hostRegisterId: 1260 });
    expect(db.get("2:/api/nail/hub")).toEqual({ token: "t", address: "192.168.0.203", hostRegisterId: 1260 });
    expect(posted).toContainEqual({ type: "HUB_JOIN", host: "192.168.0.203", token: "t" });
  });

  test("Update with no internet keeps the saved hub and says it was not saved on the server", async () => {
    saved(1260);
    const { localHub } = await import("./local-hub");
    await localHub.start(2, "screen");
    const pending = localHub.refresh();
    await vi.advanceTimersByTimeAsync(0);
    appSays({ kind: "address", address: "192.168.0.150" });
    await vi.advanceTimersByTimeAsync(0);
    appSays({ kind: "status", status: "connected", peers: 0, address: null });
    const r = await pending;
    expect(r).toMatchObject({ ownAddress: "192.168.0.150", hubAddress: "10.0.0.240", savedOnServer: false });
  });

  test("a tablet whose own storage was cleared gets the hub from its offline database", async () => {
    db.set("2:/api/nail/hub", { token: "t", address: "10.0.0.9", hostRegisterId: 1260 });
    const { localHub } = await import("./local-hub");
    await localHub.start(2, "screen");
    expect(posted).toContainEqual({ type: "HUB_JOIN", host: "10.0.0.9", token: "t" });
  });

  test("the hub found at a new address by the app's search is saved and used", async () => {
    saved(1260);
    const { localHub } = await import("./local-hub");
    await localHub.start(2, "screen");
    posted = [];
    appSays({ kind: "found", address: "10.0.0.77" });
    await vi.advanceTimersByTimeAsync(0);
    expect(JSON.parse(store.get("certxa.hub.2")!).address).toBe("10.0.0.77");
    expect(db.get("2:/api/nail/hub")).toMatchObject({ address: "10.0.0.77" });
    expect(posted).toContainEqual({ type: "HUB_JOIN", host: "10.0.0.77", token: "t" });
  });
});
