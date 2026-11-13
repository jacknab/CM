import { describe, expect, it } from "vitest";
import { IVR_HOURS, ivrDestination, ivrOpen } from "./ivr";

describe("Certxa phone menu", () => {
  it("is open 24 hours for now (owner, 2026-11-13)", () => {
    expect(IVR_HOURS.allDay).toBe(true);
    for (const t of ["2026-11-12T14:59:00Z", "2026-11-15T02:00:00Z", "2026-11-13T08:00:00Z", "2026-11-13T04:30:00Z"]) expect(ivrOpen(new Date(t))).toBe(true);
  });
  it("with allDay off, is open 10 a.m.–9 p.m. Eastern, every day", () => {
    const usual = { ...IVR_HOURS, allDay: false };
    expect(ivrOpen(new Date("2026-11-12T14:59:00Z"), usual)).toBe(false); // 9:59 a.m. EST
    expect(ivrOpen(new Date("2026-11-12T15:00:00Z"), usual)).toBe(true);  // 10:00 a.m.
    expect(ivrOpen(new Date("2026-11-15T01:59:00Z"), usual)).toBe(true);  // Sat 8:59 p.m.
    expect(ivrOpen(new Date("2026-11-15T02:00:00Z"), usual)).toBe(false); // 9:00 p.m.
    expect(ivrOpen(new Date("2026-07-12T14:00:00Z"), usual)).toBe(true);  // summer: 10:00 a.m. EDT
  });
  it("sends each key to its own webhook", () => {
    expect(ivrDestination("1")).toMatch(/\/api\/webhook\/twilio\/sales\?via=ivr$/);
    expect(ivrDestination("2")).toMatch(/\/api\/webhook\/twilio\/sales\/shavez\?via=ivr$/);
    expect(ivrDestination("3")).toMatch(/\/api\/webhook\/twilio\/tech-support$/);
    expect(ivrDestination("9")).toBeNull();
    expect(ivrDestination("")).toBeNull();
  });
});
