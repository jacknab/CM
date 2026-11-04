import { describe, it, expect } from "vitest";
import { estimateLine, lineSettings, medianMinutes, publicName, waitText, LAST_MINUTES } from "./onlineLine";

const now = Date.parse("2026-11-03T18:00:00Z");
const ago = (min: number) => now - min * 60_000;

describe("the wait estimate", () => {
  it("is nothing to tell when no barber is working", () => {
    expect(estimateLine({ now, avgMin: 20, barbers: [], line: [{ key: "a", preferredStaffId: null }] })).toBeNull();
  });

  it("counts the time already in the chair, and never says a long cut is over", () => {
    const e = estimateLine({ now, avgMin: 20, barbers: [{ id: 1, name: "A", busySince: ago(15) }, { id: 2, name: "B", busySince: ago(40) }], line: [] })!;
    expect(e.next.byBarber.get(1)).toBe(5);
    expect(e.next.byBarber.get(2)).toBe(LAST_MINUTES);
    expect(e.next.any).toBe(LAST_MINUTES);
  });

  it("plays the line forward over every barber, and a joiner waits behind everyone", () => {
    const e = estimateLine({ now, avgMin: 20, barbers: [{ id: 1, name: "A", busySince: null }, { id: 2, name: "B", busySince: ago(10) }],
      line: [{ key: "x", preferredStaffId: null }, { key: "y", preferredStaffId: null }, { key: "z", preferredStaffId: null }] })!;
    expect([e.perClient.get("x"), e.perClient.get("y"), e.perClient.get("z")]).toEqual([0, 10, 20]);
    expect(e.next.any).toBe(30);
  });

  it("a client who asked for a barber waits for that barber only", () => {
    const e = estimateLine({ now, avgMin: 20, barbers: [{ id: 1, name: "A", busySince: null }, { id: 2, name: "B", busySince: ago(5) }],
      line: [{ key: "x", preferredStaffId: 2 }, { key: "y", preferredStaffId: null }] })!;
    expect(e.perClient.get("x")).toBe(15);
    expect(e.perClient.get("y")).toBe(0);
    expect(e.next.byBarber.get(2)).toBe(35);
  });
});

describe("what the client reads", () => {
  it("shows a range, never a false zero", () => {
    expect(waitText(0)).toBe("No wait");
    expect(waitText(3)).toBe("Under 5 min");
    expect(waitText(17)).toBe("15–20 min");
    expect(waitText(70)).toBe("About 1 hr 10 min");
    expect(waitText(null)).toBe("Not taking walk-ins right now");
  });
  it("shows other people as first name and last initial", () => {
    expect(publicName("ana maria rivera")).toBe("ana R.");
    expect(publicName("  ")).toBe("Guest");
  });
});

describe("the shop's cut length", () => {
  it("is the median of real cuts once there are enough, leaving out mistakes", () => {
    expect(medianMinutes([20, 25, 30])).toBeNull();
    expect(medianMinutes([1, 20, 22, 24, 26, 28, 500])).toBe(24);
  });
});

describe("settings", () => {
  it("defaults, the older queue settings, and a pause that has run out", () => {
    expect(lineSettings({})).toMatchObject({ enabled: true, maxLine: 30, leadMin: 15, lateHoldMin: 10, lateMoveBack: true, barberChoice: false, avgMinutes: 20 });
    expect(lineSettings({ queueEnabled: false, queueMaxSize: 12, queueAvgServiceTime: 25 })).toMatchObject({ enabled: false, maxLine: 12, avgMinutes: 25 });
    expect(lineSettings({ onlineLine: { paused: { reason: "Lunch", until: "2020-01-01T00:00:00Z" } } }).paused).toBeNull();
    expect(lineSettings({ onlineLine: { paused: { reason: "Lunch", until: null } } }).paused).toEqual({ reason: "Lunch", until: null });
  });
});
