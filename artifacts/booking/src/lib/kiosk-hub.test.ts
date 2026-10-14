import { describe, expect, test, vi } from "vitest";

// The salon hub, in memory: a message sent by one tablet reaches every listener (the other tablets).
vi.mock("./local-hub", () => {
  const listeners = new Set<(m: any) => void>();
  return {
    localHub: {
      send: (m: any) => { queueMicrotask(() => listeners.forEach((fn) => fn(JSON.parse(JSON.stringify(m))))); return true; },
      onMessage: (fn: (m: any) => void) => { listeners.add(fn); return () => listeners.delete(fn); },
    },
  };
});

import { hubKioskCheckin, hubKioskLookup, hubKioskWait, serveKioskOverHub } from "./kiosk-hub";

describe("kiosk ↔ POS over the salon hub", () => {
  test("lookup, check-in and wait are answered by the POS, each to its own request", async () => {
    const seen: any[] = [];
    const stop = serveKioskOverHub({
      lookup: async (phone) => ({ found: phone === "6025550142", client: { id: 7, name: "Ana" } }),
      checkin: async (req) => { seen.push(req); return { success: true, ticketNumber: 41, clientName: "Ana", staffName: "Kim" }; },
      wait: async () => ({ hasAvailableStaff: false, estimatedWaitMinutes: 25 }),
    });
    const [found, missing] = await Promise.all([hubKioskLookup("6025550142"), hubKioskLookup("6025550100")]);
    expect(found).toMatchObject({ found: true, client: { id: 7, name: "Ana" } });
    expect(missing).toMatchObject({ found: false });

    const answer = await hubKioskCheckin({
      clientId: 7, clientName: "Ana", phone: "6025550142", serviceIds: [3, 9], addonIds: [5],
      nail: { sizeId: 2, shapeId: null, effectId: 4 }, staffId: 12,
    });
    expect(answer).toMatchObject({ success: true, ticketNumber: 41, staffName: "Kim" });
    expect(seen[0]).toEqual({
      clientId: 7, clientName: "Ana", phone: "6025550142", serviceIds: [3, 9], addonIds: [5],
      nail: { sizeId: 2, shapeId: null, effectId: 4 }, staffId: 12,
    });

    expect(await hubKioskWait()).toEqual(expect.objectContaining({ hasAvailableStaff: false, estimatedWaitMinutes: 25 }));
    stop();
  });

  test("a check-in the POS cannot make comes back as a failure, not silence", async () => {
    const stop = serveKioskOverHub({
      lookup: async () => ({ found: false }),
      checkin: async () => { throw new Error("No technician does this service"); },
      wait: async () => ({ hasAvailableStaff: true, estimatedWaitMinutes: null }),
    });
    const answer = await hubKioskCheckin({ clientId: null, clientName: "Bo", phone: "", serviceIds: [1], addonIds: [], nail: { sizeId: null, shapeId: null, effectId: null }, staffId: null });
    expect(answer).toMatchObject({ success: false, error: "No technician does this service" });
    stop();
  });
});
