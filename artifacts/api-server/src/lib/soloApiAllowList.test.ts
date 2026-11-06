import { describe, expect, it } from "vitest";
import { soloApiAllowed, pathShape } from "./soloApiAllowList";

describe("soloApiAllowed", () => {
  it("allows what the Certxa Pro app uses", () => {
    for (const p of [
      "/api/appointments", "/api/appointments/123/refund", "/api/customers/9", "/api/solo/billing/history",
      "/api/staff/12/services", "/api/payments/terminal/connection-token", "/api/pos/sms-receipt",
      "/api/manage/overview", "/api/stores/4", "/api/auth/user", "/api/pro/phone/numbers",
    ]) expect(soloApiAllowed(p), p).toBe(true);
  });
  it("refuses salon features", () => {
    for (const p of [
      "/api/nail/pos-grid", "/api/cash-drawer/open", "/api/payroll/runs", "/api/registers", "/api/staff",
      "/api/staff/12", "/api/staff/12/commission", "/api/ai-receptionist/settings", "/api/manage/staff",
      "/api/pos/stations", "/api/loyalty/config", "/api/billing/change-plan/4", "/api/turn/eligibility",
    ]) expect(soloApiAllowed(p), p).toBe(false);
  });
  it("matches whole segments only", () => {
    expect(soloApiAllowed("/api/appointmentsX")).toBe(false);
    expect(soloApiAllowed("/api/pos-settings")).toBe(true);
    expect(soloApiAllowed("/api/pos")).toBe(false);
  });
});

describe("pathShape", () => {
  it("replaces ids and codes", () => {
    expect(pathShape("/api/nail/tickets/123/close")).toBe("/api/nail/tickets/:id/close");
    expect(pathShape("/api/x/0fa14acc-3d8d-4ff6-9122-9ad4617a0603")).toBe("/api/x/:id");
    expect(pathShape("/api/x/abcdefghijklmnopqrstuvwxyz")).toBe("/api/x/:token");
    expect(pathShape("/api/x/a@b.com/")).toBe("/api/x/:token");
  });
});
