/** Snapshot totals from approved payroll runs; never recompute historical pay from appointments. */
export type PayrollYtd = {
  serviceCommission: number;
  productCommission: number;
  tips: number;
  otherEarnings: number;
  grossEarnings: number;
  boothRent: number;
  otherDeductions: number;
  totalDeductions: number;
  netPay: number;
};

export type PayrollYtdRow = {
  runId: number;
  staffId: number;
  status: string;
  payDate?: string | null;
  approvedAt?: Date | string | null;
  finalizedAt?: Date | string | null;
  periodEnd: string;
  serviceCommission: string | number | null;
  productCommission: string | number | null;
  commissionAmount: string | number | null;
  tips: string | number | null;
  otherEarnings: string | number | null;
  boothRent: string | number | null;
  otherDeductions: string | number | null;
  netPay: string | number | null;
  /** The recurring deductions inside otherDeductions, by name: [{ name, amount }]. */
  ruleDeductionsDetail?: unknown;
};

const cents = (v: string | number | null) => Math.round(Number(v ?? 0) * 100) || 0;

/** Calendar year of the actual pay date, with a fallback for older payroll runs. */
export function payrollPayDate(row: Pick<PayrollYtdRow, "payDate" | "approvedAt" | "finalizedAt" | "periodEnd">): string {
  const day = row.payDate || row.approvedAt || row.finalizedAt || row.periodEnd;
  return typeof day === "string" ? day.slice(0, 10) : day.toISOString().slice(0, 10);
}

type YtdSelection = Pick<PayrollYtdRow, "runId" | "payDate" | "approvedAt" | "finalizedAt" | "periodEnd">;

/** Does this run's line count toward year-to-date as of the selected run? */
function countsTowardYtd(row: PayrollYtdRow, selected: YtdSelection): boolean {
  if (row.status !== "approved" && row.status !== "finalized") return false;
  const cutoff = payrollPayDate(selected);
  const date = payrollPayDate(row);
  return !(date.slice(0, 4) !== cutoff.slice(0, 4) || date > cutoff || (date === cutoff && row.runId > selected.runId));
}

/** Year-to-date of each named recurring deduction, per staff member — the same runs summarizePayrollYtd counts. */
export function summarizeDeductionYtd(rows: PayrollYtdRow[], selected: YtdSelection): Map<number, Record<string, number>> {
  const sums = new Map<number, Record<string, number>>();
  for (const row of rows) {
    if (!countsTowardYtd(row, selected) || !Array.isArray(row.ruleDeductionsDetail)) continue;
    const mine = sums.get(row.staffId) ?? {};
    for (const d of row.ruleDeductionsDetail as { name?: unknown; amount?: unknown }[]) {
      const name = String(d?.name ?? "").trim();
      if (name) mine[name] = (mine[name] ?? 0) + cents(Number(d?.amount) || 0);
    }
    sums.set(row.staffId, mine);
  }
  return new Map([...sums].map(([staffId, byName]) => [staffId, Object.fromEntries(Object.entries(byName).map(([name, value]) => [name, value / 100]))]));
}

export function summarizePayrollYtd(rows: PayrollYtdRow[], selected: YtdSelection): Map<number, PayrollYtd> {
  const sums = new Map<number, Record<keyof PayrollYtd, number>>();
  for (const row of rows) {
    if (!countsTowardYtd(row, selected)) continue;
    const result = sums.get(row.staffId) ?? {
      serviceCommission: 0, productCommission: 0, tips: 0, otherEarnings: 0,
      grossEarnings: 0, boothRent: 0, otherDeductions: 0, totalDeductions: 0, netPay: 0,
    };
    const product = cents(row.productCommission);
    // Older runs saved only the combined commission amount; retain those earnings in YTD.
    const service = cents(row.serviceCommission) || (product === 0 ? cents(row.commissionAmount) : 0);
    const tips = cents(row.tips), other = cents(row.otherEarnings);
    const rent = cents(row.boothRent), deductions = cents(row.otherDeductions);
    result.serviceCommission += service;
    result.productCommission += product;
    result.tips += tips;
    result.otherEarnings += other;
    result.grossEarnings += service + product + tips + other;
    result.boothRent += rent;
    result.otherDeductions += deductions;
    result.totalDeductions += rent + deductions;
    result.netPay += cents(row.netPay);
    sums.set(row.staffId, result);
  }
  return new Map([...sums].map(([staffId, sum]) => [staffId, Object.fromEntries(
    Object.entries(sum).map(([key, value]) => [key, value / 100]),
  ) as PayrollYtd]));
}
