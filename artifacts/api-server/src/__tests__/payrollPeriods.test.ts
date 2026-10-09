import { describe, expect, it } from "vitest";
import { autoApprovalDate, payrollPeriodsDue } from "../lib/payrollPeriods";

describe("payroll periods", () => {
  it("creates closed weekly periods even when the configured first pay date is in the future", () => {
    const periods = payrollPeriodsDue("weekly", "2026-11-06", 7, "2026-09-27", 3);
    expect(periods[0]).toEqual({ periodStart: "2026-09-19", periodEnd: "2026-09-25", payDate: "2026-10-02" });
    expect(periods).toHaveLength(3);
  });

  it("does not create a period until its end date is over", () => {
    const periods = payrollPeriodsDue("weekly", "2026-10-02", 7, "2026-09-25", 1);
    expect(periods[0].periodEnd).toBe("2026-09-18");
  });

  it("keeps three business days for review and approves on the fourth", () => {
    expect(autoApprovalDate("2026-09-25")).toBe("2026-10-01"); // Fri close → Thu approval
    expect(autoApprovalDate("2026-09-28")).toBe("2026-10-02"); // Mon close → Fri approval
  });
});
