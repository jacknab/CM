import { describe, expect, it, vi, beforeEach } from "vitest";

const broadcastSyncEvent = vi.fn();
vi.mock("../notifications", () => ({ broadcastSyncEvent: (e: unknown) => broadcastSyncEvent(e) }));

import { broadcastAppointmentStatus, registerSseClient } from "../lib/appointmentEvents";

describe("broadcastAppointmentStatus", () => {
  beforeEach(() => broadcastSyncEvent.mockClear());

  it("also goes out over the WebSocket bus, so every POS station (and every PM2 worker) hears about it", () => {
    broadcastAppointmentStatus({ appointmentId: 7, storeId: 2, status: "confirmed", source: "manual" });
    expect(broadcastSyncEvent).toHaveBeenCalledWith({ type: "booking_updated", storeId: 2, appointmentId: 7, changes: ["status"] });
  });

  it("still writes to the SSE clients on this worker", () => {
    const writes: string[] = [];
    const res: any = { write: (s: string) => writes.push(s) };
    const off = registerSseClient(2, res);
    broadcastAppointmentStatus({ appointmentId: 8, storeId: 2, status: "started", source: "auto" });
    off();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('"appointmentId":8');
  });

  it("a failing WebSocket broadcast never blocks the SSE push", () => {
    broadcastSyncEvent.mockImplementationOnce(() => { throw new Error("bus down"); });
    const writes: string[] = [];
    const off = registerSseClient(3, { write: (s: string) => writes.push(s) } as any);
    expect(() => broadcastAppointmentStatus({ appointmentId: 9, storeId: 3, status: "completed", source: "manual" })).not.toThrow();
    off();
    expect(writes).toHaveLength(1);
  });
});
