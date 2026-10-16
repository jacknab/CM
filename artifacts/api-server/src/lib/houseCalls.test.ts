import { describe, expect, it } from "vitest";
import { heldWindow, neededWindow } from "./appointmentBuffer";
import { normalizeClientAddress } from "./houseCalls";

const at = (iso: string) => new Date(iso);

describe("house-call travel time (plans/solo-work-places-and-approval.md)", () => {
  it("an existing house call holds its travel time before and after", () => {
    const w = heldWindow({ date: "2026-10-20T15:00:00Z", visitAt: "client" }, 60, 15);
    expect(w.start.toISOString()).toBe("2026-10-20T14:45:00.000Z");
    expect(w.minutes).toBe(90);
  });

  it("a visit at the professional's place holds only its own time", () => {
    const w = heldWindow({ date: "2026-10-20T15:00:00Z", visitAt: "place" }, 60, 15);
    expect(w.start.toISOString()).toBe("2026-10-20T15:00:00.000Z");
    expect(w.minutes).toBe(60);
  });

  it("a cancelled house call (held 0) holds nothing", () => {
    expect(heldWindow({ date: "2026-10-20T15:00:00Z", visitAt: "client" }, 0, 15).minutes).toBe(0);
  });

  it("a house call being booked needs its travel time free too", () => {
    const n = neededWindow(at("2026-10-20T15:00:00Z"), at("2026-10-20T16:00:00Z"), "client", 20);
    expect(n.start.toISOString()).toBe("2026-10-20T14:40:00.000Z");
    expect(n.end.toISOString()).toBe("2026-10-20T16:20:00.000Z");
    expect(neededWindow(at("2026-10-20T15:00:00Z"), at("2026-10-20T16:00:00Z"), "place", 20).start.toISOString()).toBe("2026-10-20T15:00:00.000Z");
  });
});

describe("a client's house-call address", () => {
  it("needs a street, city, 2-letter state and ZIP", () => {
    expect(normalizeClientAddress({ line1: " 12 Elm St ", city: "Dixon", state: "ca", postcode: "95620" }))
      .toEqual({ line1: "12 Elm St", line2: undefined, city: "Dixon", state: "CA", postcode: "95620" });
    expect(normalizeClientAddress({ line1: "12 Elm St", city: "Dixon", state: "California", postcode: "95620" })).toBeNull();
    expect(normalizeClientAddress({ line1: "", city: "Dixon", state: "CA", postcode: "95620" })).toBeNull();
    expect(normalizeClientAddress(null)).toBeNull();
  });
});
