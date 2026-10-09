/** Runs the rebuilt payroll system independently of page visits. */
export function startPayrollScheduler(): void {
  const tick = async () => {
    try {
      const { runPayrollAutomationTick } = await import("../routes/payrollRuns.js");
      await runPayrollAutomationTick();
    } catch (error) {
      console.error("[PayrollScheduler] Tick error:", error);
    }
  };
  void tick();
  setInterval(() => void tick(), 60 * 60 * 1000);
  console.log("[PayrollScheduler] Started — closed periods and fourth-business-day approvals checked hourly");
}
