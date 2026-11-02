import { describe, expect, it } from "vitest";
import { salonNowForPrint } from "./salonClock";

describe("the time printed on a slip", () => {
  it("is the salon's clock time, with no zone for the tablet to convert", () => {
    // 10:44:05 UTC = 2:44:05 AM in Los Angeles (PST, after the clocks went back on Nov 1).
    expect(salonNowForPrint(new Date("2026-11-02T10:44:05Z"), "America/Los_Angeles")).toBe("2026-11-02T02:44:05");
    expect(salonNowForPrint(new Date("2026-07-01T16:00:00Z"), "America/New_York")).toBe("2026-07-01T12:00:00");
  });
  it("read back by the tablet, it is the same clock time whatever the tablet's own zone", () => {
    const d = new Date(salonNowForPrint(new Date("2026-11-02T10:44:05Z"), "America/Los_Angeles"));
    expect(d.getHours()).toBe(2);
    expect(d.getMinutes()).toBe(44);
  });
});
