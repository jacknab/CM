import type { Pool } from "pg";
import type { SegmentResult } from "../types";
import { pass, warn, rollup } from "../types";

export async function commissionPayroll(accountId: number, pool: Pool): Promise<SegmentResult> {
  const checks = [];
  const tables: Record<string, unknown[]> = {};

  // 5a. Commission structures
  const structRes = await pool.query(
    `SELECT id, name, employee_percent, house_percent, applies_to, is_default, is_active
     FROM commission_structures WHERE store_id = $1 ORDER BY is_default DESC, name`,
    [accountId],
  );

  tables.commission_structures = structRes.rows.map((r: any) => ({
    name: r.name,
    employeePercent: r.employee_percent,
    housePercent: r.house_percent,
    appliesTo: r.applies_to,
    isDefault: r.is_default,
    isActive: r.is_active,
  }));

  if (structRes.rows.length === 0) {
    checks.push(warn("commission_structures", "Commission structures defined", "No commission structures found — payroll calculations may fall back to flat rates only.", "Payroll → Commission Structures → Add"));
  } else {
    checks.push(pass("commission_structures", "Commission structures defined", `${structRes.rows.length} structure${structRes.rows.length !== 1 ? "s" : ""} (${structRes.rows.filter((r: any) => r.is_active).length} active)`));
  }

  // 5b. Staff commission assignment
  const staffRes = await pool.query(
    `SELECT id, name, employment_type, commission_enabled, commission_rate, commission_structure_id
     FROM staff WHERE store_id = $1 AND status != 'removed' ORDER BY name`,
    [accountId],
  );

  tables.staff_commission = staffRes.rows.map((s: any) => ({
    name: s.name,
    employmentType: s.employment_type,
    commissionEnabled: s.commission_enabled,
    commissionRate: s.commission_rate,
    structureId: s.commission_structure_id,
    issue: !s.commission_enabled && s.employment_type === "contractor"
      ? "contractor with commission off"
      : s.commission_enabled && !s.commission_structure_id && !s.commission_rate
      ? "commission on but no rate/structure"
      : null,
  }));

  const missingRate = staffRes.rows.filter((s: any) =>
    s.commission_enabled && !s.commission_structure_id && (!s.commission_rate || Number(s.commission_rate) === 0)
  );
  const contractorNoCommission = staffRes.rows.filter((s: any) =>
    !s.commission_enabled && s.employment_type === "contractor"
  );

  if (missingRate.length > 0) {
    checks.push(warn("commission_rate", "All commission-enabled staff have a rate or structure", `${missingRate.map((s: any) => s.name).join(", ")} ${missingRate.length === 1 ? "has" : "have"} commission enabled but no rate or structure assigned.`, "Staff → [Member] → Commission"));
  } else {
    checks.push(pass("commission_rate", "All commission-enabled staff have a rate or structure", "All commission-enabled staff have a rate or structure configured."));
  }

  if (contractorNoCommission.length > 0) {
    checks.push(warn("contractor_commission", "Contractors have commission enabled", `${contractorNoCommission.map((s: any) => s.name).join(", ")} ${contractorNoCommission.length === 1 ? "is" : "are"} classified as contractor but commission is disabled — verify this is intentional.`, "Staff → [Member] → Employment"));
  } else {
    checks.push(pass("contractor_commission", "Contractors have commission enabled", "All contractors have commission enabled."));
  }

  // 5c. Deduction rules
  const deductRes = await pool.query(
    `SELECT dr.id, dr.name, dr.type, dr.amount, dr.applies_to, dr.contractor_id, dr.is_active,
            c.name AS contractor_name
     FROM payout_deduction_rules dr
     LEFT JOIN contractors c ON c.id = dr.contractor_id
     WHERE dr.store_id = $1`,
    [accountId],
  );

  tables.deduction_rules = deductRes.rows.map((r: any) => ({
    name: r.name,
    type: r.type,
    amount: r.amount,
    appliesTo: r.applies_to,
    contractorName: r.contractor_name ?? "All",
    isActive: r.is_active,
    orphaned: r.contractor_id !== null && r.contractor_name === null,
  }));

  const orphaned = deductRes.rows.filter((r: any) => r.contractor_id !== null && r.contractor_name === null);
  if (orphaned.length > 0) {
    checks.push(warn("deduction_orphans", "No orphaned deduction rules", `${orphaned.length} deduction rule${orphaned.length !== 1 ? "s" : ""} reference a contractor that no longer exists.`, "Payroll → Deduction Rules → Review"));
  } else {
    const count = deductRes.rows.filter((r: any) => r.is_active).length;
    checks.push(pass("deduction_orphans", "No orphaned deduction rules", count > 0 ? `${count} active deduction rule${count !== 1 ? "s" : ""}` : "No deduction rules configured."));
  }

  return {
    segmentId: "commission_payroll",
    label: "Commission & Payroll",
    status: rollup(checks),
    runAt: new Date().toISOString(),
    checks,
    tables,
  };
}
