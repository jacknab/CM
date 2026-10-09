import { describe, expect, it } from "vitest";
import { payrollPayDate, summarizePayrollYtd, type PayrollYtdRow } from "@shared/payrollYtd";

const row = (runId: number, staffId: number, date: string, overrides: Partial<PayrollYtdRow> = {}): PayrollYtdRow => ({
  runId, staffId, status: "approved", payDate: date, periodEnd: date,
  serviceCommission: "100.10", productCommission: "10.20", commissionAmount: "110.30",
  tips: "5.30", otherEarnings: "2.10", boothRent: "3.10", otherDeductions: "1.10", netPay: "113.50",
  ...overrides,
});

describe("payroll check year-to-date totals", () => {
  it("sums approved snapshots through the selected pay date, including its own run", () => {
    const prior = row(1, 7, "2026-07-24");
    const current = row(7, 7, "2026-09-27");
    const ytd = summarizePayrollYtd([
      prior, current, row(8, 7, "2026-10-03"), row(9, 7, "2026-09-27"),
      row(3, 7, "2025-12-31"), row(4, 7, "2026-08-01", { status: "draft" }),
      row(2, 8, "2026-08-01"),
    ], current);
    expect(ytd.get(7)).toEqual({
      serviceCommission: 200.20, productCommission: 20.40, tips: 10.60, otherEarnings: 4.20,
      grossEarnings: 235.40, boothRent: 6.20, otherDeductions: 2.20,
      totalDeductions: 8.40, netPay: 227,
    });
    expect(ytd.get(8)?.serviceCommission).toBe(100.10);
  });

  it("uses the pay date year instead of the earning period year", () => {
    const current = row(11, 7, "2027-01-05", { periodEnd: "2026-12-31" });
    expect(summarizePayrollYtd([row(10, 7, "2026-12-28"), current], current).get(7)?.serviceCommission).toBe(100.10);
  });

  it("retains commission from older snapshots without a separate service field", () => {
    const legacy = row(1, 7, "2026-02-01", { status: "finalized", serviceCommission: "0", productCommission: "0", commissionAmount: "171.60" });
    expect(summarizePayrollYtd([legacy], legacy).get(7)?.serviceCommission).toBe(171.60);
    expect(payrollPayDate({ periodEnd: "2026-02-01", finalizedAt: new Date("2026-02-08T10:00:00Z") })).toBe("2026-02-08");
  });
});
