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

describe("payroll periods for every frequency (audit 2026-10-24)", () => {
  it("store 2: weekly, paid on Friday one week after the week closes", () => {
    // First pay date Fri 2026-11-06, period ends 7 days before it.
    const [newest] = payrollPeriodsDue("weekly", "2026-11-06", 7, "2026-10-24", 1);
    expect(newest).toEqual({ periodStart: "2026-10-17", periodEnd: "2026-10-23", payDate: "2026-10-30" });
  });
  it("every two weeks", () => {
    const [newest] = payrollPeriodsDue("biweekly", "2026-11-06", 7, "2026-10-24", 1);
    // Pay dates every 14 days from Fri 11-06: 10-23 pays Oct 3–16.
    expect(newest).toEqual({ periodStart: "2026-10-03", periodEnd: "2026-10-16", payDate: "2026-10-23" });
  });
  it("twice a month: the 1st–15th and the 16th–end, paid a week after each closes, without drifting", () => {
    const periods = payrollPeriodsDue("semimonthly", "2026-11-07", 7, "2027-03-20", 4);
    expect(periods).toEqual([
      { periodStart: "2027-03-01", periodEnd: "2027-03-15", payDate: "2027-03-22" },
      { periodStart: "2027-02-16", periodEnd: "2027-02-28", payDate: "2027-03-07" },
      { periodStart: "2027-02-01", periodEnd: "2027-02-15", payDate: "2027-02-22" },
      { periodStart: "2027-01-16", periodEnd: "2027-01-31", payDate: "2027-02-07" },
    ]);
  });
  it("monthly on the 31st falls back to a short month's last day and comes back to the 31st", () => {
    const periods = payrollPeriodsDue("monthly", "2027-01-31", 0, "2027-04-01", 3);
    expect(periods.map((p) => p.payDate)).toEqual(["2027-03-31", "2027-02-28", "2027-01-31"]);
    expect(periods[0]).toEqual({ periodStart: "2027-03-01", periodEnd: "2027-03-31", payDate: "2027-03-31" });
  });
  it("periods follow on from each other with no gap or overlap", () => {
    for (const f of ["weekly", "biweekly", "semimonthly", "monthly"]) {
      const ps = payrollPeriodsDue(f, "2026-11-06", 7, "2027-06-01", 12);
      for (let i = 0; i < ps.length - 1; i++) {
        const next = new Date(`${ps[i + 1].periodEnd}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
        expect(ps[i].periodStart).toBe(next.toISOString().slice(0, 10));
      }
    }
  });
});
