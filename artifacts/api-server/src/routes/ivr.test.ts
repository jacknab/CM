import { describe, expect, it } from "vitest";
import { ivrDestination, ivrOpen } from "./ivr";

describe("Certxa phone menu", () => {
  it("is open 10 a.m.–11 p.m. Eastern, every day", () => {
    expect(ivrOpen(new Date("2026-11-12T14:59:00Z"))).toBe(false); // 9:59 a.m. EST
    expect(ivrOpen(new Date("2026-11-12T15:00:00Z"))).toBe(true);  // 10:00 a.m.
    expect(ivrOpen(new Date("2026-11-15T03:59:00Z"))).toBe(true);  // Sat 10:59 p.m.
    expect(ivrOpen(new Date("2026-11-15T04:00:00Z"))).toBe(false); // 11:00 p.m.
    expect(ivrOpen(new Date("2026-07-12T14:00:00Z"))).toBe(true);  // summer: 10:00 a.m. EDT
  });
  it("sends each key to its own webhook", () => {
    expect(ivrDestination("1")).toMatch(/\/api\/webhook\/twilio\/sales\?via=ivr$/);
    expect(ivrDestination("2")).toMatch(/\/api\/webhook\/twilio\/sales\/shavez\?via=ivr$/);
    expect(ivrDestination("3")).toMatch(/\/api\/webhook\/twilio\/tech-support$/);
    expect(ivrDestination("9")).toBeNull();
    expect(ivrDestination("")).toBeNull();
  });
});
