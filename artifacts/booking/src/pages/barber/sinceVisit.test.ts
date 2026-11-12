import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/salonClock", () => ({ salonTimeZone: () => "America/Denver" }));
import { sinceVisit } from "./sinceVisit";

describe("How long since the client's last visit", () => {
  const now = new Date("2026-11-12T18:00:00Z");
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
  it("says it in days, weeks, months or years", () => {
    expect(sinceVisit(ago(0), now, "America/Denver")).toBe("today");
    expect(sinceVisit(ago(1), now, "America/Denver")).toBe("yesterday");
    expect(sinceVisit(ago(5), now, "America/Denver")).toBe("5 days ago");
    expect(sinceVisit(ago(14), now, "America/Denver")).toBe("2 weeks ago");
    expect(sinceVisit(ago(70), now, "America/Denver")).toBe("2 months ago");
    expect(sinceVisit(ago(400), now, "America/Denver")).toBe("1 year ago");
  });
});
