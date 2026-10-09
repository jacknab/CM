import { describe, it, expect } from "vitest";
import { pickOfflineTech, type TurnLineTech } from "./turn";

const line: TurnLineTech[] = [
  { id: 1, name: "Lan", turnPosition: 1, clockedIn: true, eligible: true },
  { id: 2, name: "Kim", turnPosition: 2, clockedIn: true, eligible: true },
  { id: 3, name: "Vy", turnPosition: 3, clockedIn: true, eligible: false },
  { id: 4, name: "Mai", turnPosition: 4, clockedIn: false, eligible: true },
  { id: 5, name: "Hoa", turnPosition: 5, clockedIn: true, eligible: true, availabilityState: "break" },
  { id: 6, name: "Thu", turnPosition: 6, clockedIn: true, eligible: true, currentStatus: "busy" },
];

describe("pickOfflineTech", () => {
  it("takes the first technician in turn order who is in and free", () => {
    expect(pickOfflineTech(line, new Set())?.name).toBe("Lan");
    expect(pickOfflineTech([...line].reverse(), new Set())?.name).toBe("Lan");
  });
  it("does not give the same turn twice from one device: someone already holding a client is skipped", () => {
    expect(pickOfflineTech(line, new Set([1]))?.name).toBe("Kim");
  });
  it("respects qualifications, the clock, breaks and technicians who are busy", () => {
    // Lan and Kim held: Vy can't do the service, Mai is out, Hoa is on a break, Thu is busy → nobody.
    expect(pickOfflineTech(line, new Set([1, 2]))).toBeNull();
  });
  it("returns nobody when there is no turn line on the device", () => {
    expect(pickOfflineTech([], new Set())).toBeNull();
  });
});
