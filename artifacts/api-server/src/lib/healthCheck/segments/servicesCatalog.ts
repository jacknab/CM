import type { Pool } from "pg";
import type { SegmentResult } from "../types";
import { pass, warn, fail, rollup } from "../types";

export async function servicesCatalog(accountId: number, pool: Pool): Promise<SegmentResult> {
  const checks = [];
  const tables: Record<string, unknown[]> = {};

  const servicesRes = await pool.query(
    `SELECT s.id, s.name, s.price, s.duration, s.is_active, s.hidden_from_public,
            c.name AS category_name,
            (SELECT COUNT(*) FROM staff_services ss WHERE ss.service_id = s.id) AS staff_count
     FROM services s
     LEFT JOIN service_categories c ON c.id = s.category_id
     WHERE s.store_id = $1
     ORDER BY s.is_active DESC, s.name`,
    [accountId],
  );

  const all = servicesRes.rows;
  const active   = all.filter((s: any) => s.is_active);
  const visible  = active.filter((s: any) => !s.hidden_from_public);
  const hidden   = active.filter((s: any) => s.hidden_from_public);
  const inactive = all.filter((s: any) => !s.is_active);

  tables.services = all.map((s: any) => ({
    name: s.name,
    category: s.category_name ?? "Uncategorized",
    price: s.price ?? 0,
    duration: s.duration ?? null,
    active: s.is_active,
    hiddenFromPublic: s.hidden_from_public,
    staffCount: Number(s.staff_count),
  }));

  // 3a. Visibility
  if (visible.length === 0) {
    checks.push(fail("visible_services", "Active, visible services exist", "No active, publicly visible services — customers cannot book anything online.", "Services → Add/Activate Service"));
  } else {
    checks.push(pass("visible_services", "Active, visible services exist", `${visible.length} public service${visible.length !== 1 ? "s" : ""} (${hidden.length} hidden, ${inactive.length} inactive)`));
  }

  if (hidden.length > 0) {
    checks.push(warn("hidden_services", "No active services hidden from public", `${hidden.map((s: any) => s.name).join(", ")} ${hidden.length === 1 ? "is" : "are"} active but hidden from public booking.`, "Services → [Service] → Visibility"));
  } else {
    checks.push(pass("hidden_services", "No active services hidden from public", "All active services are publicly visible."));
  }

  // 3b. Pricing & duration
  const zeroPriceNoDeposit = active.filter((s: any) => !s.hidden_from_public && (Number(s.price) === 0 || s.price === null));
  if (zeroPriceNoDeposit.length > 0) {
    checks.push(warn("service_pricing", "Services have pricing set", `${zeroPriceNoDeposit.map((s: any) => s.name).join(", ")} ${zeroPriceNoDeposit.length === 1 ? "has" : "have"} a $0 price — verify this is intentional.`, "Services → [Service] → Edit"));
  } else {
    checks.push(pass("service_pricing", "Services have pricing set", "All active services have a non-zero price."));
  }

  const noDuration = active.filter((s: any) => !s.duration || Number(s.duration) <= 0);
  if (noDuration.length > 0) {
    checks.push(warn("service_duration", "Services have duration set", `${noDuration.map((s: any) => s.name).join(", ")} ${noDuration.length === 1 ? "has" : "have"} no duration — slot length will default to 0 minutes.`, "Services → [Service] → Edit"));
  } else {
    checks.push(pass("service_duration", "Services have duration set", "All active services have a duration configured."));
  }

  // 3c. Staff coverage gap
  const orphaned = visible.filter((s: any) => Number(s.staff_count) === 0);
  if (orphaned.length > 0) {
    checks.push(fail("service_staff_coverage", "All visible services have staff", `${orphaned.map((s: any) => s.name).join(", ")} ${orphaned.length === 1 ? "has" : "have"} no staff assigned — ${orphaned.length === 1 ? "it is" : "they are"} unbookable.`, "Services → [Service] → Staff"));
  } else {
    checks.push(pass("service_staff_coverage", "All visible services have staff", "All public services have at least one staff member assigned."));
  }

  return {
    segmentId: "services_catalog",
    label: "Services & Catalog",
    status: rollup(checks),
    runAt: new Date().toISOString(),
    checks,
    tables,
  };
}
