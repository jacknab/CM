import { describe, expect, it } from "vitest";
import { summarizeSalonOperations, type SalonOperationsOverview } from "../lib/salonOperationsOverview";

const overview: SalonOperationsOverview = {
  generatedAt: "2026-09-27T18:00:00.000Z",
  salonLocalTime: "Sunday, September 27, 2026 at 11:00 AM PDT",
  address: "123 Main Street",
  closesToday: "18:00",
  walkInsAccepted: true,
  appointmentsAccepted: true,
  walkInCutoff: null,
  staffWorking: [
    { id: 1, name: "Mia", status: "available", availableAt: null },
    { id: 2, name: "Kim", status: "busy", availableAt: "2026-09-27T18:30:00.000Z" },
  ],
  workingStaffCount: 2,
  availableStaffCount: 1,
  waitingCount: 2,
  inServiceCount: 1,
  estimatedWaitMinutes: 15,
  waitReason: null,
};

describe("salon operations overview", () => {
  it("summarizes live operational values without exposing implementation details", () => {
    const result = summarizeSalonOperations(overview);
    expect(result).toContain("2 staff clocked in");
    expect(result).toContain("2 waiting");
    expect(result).toContain("about 15 minutes");
    expect(result).toContain("Mia: available");
    expect(result).not.toMatch(/database|query|table/i);
  });

  it("does not manufacture a wait when the shared estimator has none", () => {
    const result = summarizeSalonOperations({ ...overview, estimatedWaitMinutes: null, waitReason: "no_staff" });
    expect(result).toContain("No reliable wait estimate is available");
    expect(result).not.toContain("about 15 minutes");
  });

  it("reports configured policy rather than blindly inviting a walk-in", () => {
    const result = summarizeSalonOperations({ ...overview, walkInsAccepted: false });
    expect(result).toContain("Walk-ins are not accepted");
  });
});
