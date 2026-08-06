import type { Pool } from "pg";
import type { SegmentResult } from "../types";
import { pass, warn, fail, rollup } from "../types";
import { STATE_TZ_MAP } from "../stateTzMap";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function bookingReadiness(accountId: number, pool: Pool): Promise<SegmentResult> {
  const checks = [];
  const tables: Record<string, unknown[]> = {};

  // ── 1a. Timezone ─────────────────────────────────────────────────────────────
  const storeRes = await pool.query(
    `SELECT timezone, state FROM locations WHERE id = $1`,
    [accountId],
  );
  const store = storeRes.rows[0];
  const tz = store?.timezone ?? null;
  const state = (store?.state ?? "").toUpperCase();

  if (!tz || tz === "" || tz === "UTC") {
    checks.push(fail("timezone_set", "Timezone is configured", "Timezone is not set or is set to UTC — bookings will use the wrong local time.", "Settings → General → Timezone"));
  } else {
    const expected = STATE_TZ_MAP[state];
    if (!expected) {
      checks.push(pass("timezone_set", "Timezone is configured", `Timezone: ${tz}`));
    } else if (expected.iana !== tz) {
      const severity = expected.multiZone ? "warn" : "warn";
      checks.push(warn(
        "timezone_set",
        "Timezone is configured",
        `Store is in ${state} but timezone is set to "${tz}" (expected ${expected.iana})${expected.multiZone ? " — this state spans multiple zones, verify with owner" : ""}`,
        "Settings → General → Timezone",
      ));
    } else {
      checks.push(pass("timezone_set", "Timezone is configured", `${tz} matches state ${state}`));
    }
  }

  // ── 1b. Business Hours ────────────────────────────────────────────────────────
  const hoursRes = await pool.query(
    `SELECT day_of_week, open_time, close_time, is_closed FROM business_hours WHERE store_id = $1 ORDER BY day_of_week`,
    [accountId],
  );
  if (hoursRes.rows.length === 0) {
    checks.push(fail("business_hours", "Business hours configured", "No business hours rows exist — the booking engine cannot determine when the business is open.", "Settings → Business Hours"));
  } else {
    const allClosed = hoursRes.rows.every(r => r.is_closed);
    const badDays = hoursRes.rows.filter(r => !r.is_closed && (!r.open_time || !r.close_time)).map(r => DAY_NAMES[r.day_of_week]);
    if (allClosed) {
      checks.push(warn("business_hours", "Business hours configured", "All 7 days are marked as closed — the business appears to have no open hours.", "Settings → Business Hours"));
    } else if (badDays.length > 0) {
      checks.push(warn("business_hours", "Business hours configured", `Missing open/close times for: ${badDays.join(", ")}`, "Settings → Business Hours"));
    } else {
      const openDays = hoursRes.rows.filter(r => !r.is_closed).map(r => DAY_NAMES[r.day_of_week]);
      checks.push(pass("business_hours", "Business hours configured", `Open: ${openDays.join(", ")}`));
    }
  }

  // ── 1c. Staff Availability ────────────────────────────────────────────────────
  const staffRes = await pool.query(
    `SELECT s.id, s.name FROM staff s
     WHERE s.store_id = $1 AND s.status != 'removed' AND s.show_on_calendar = true`,
    [accountId],
  );

  if (staffRes.rows.length === 0) {
    checks.push(warn("staff_availability", "Staff availability configured", "No active calendar-visible staff members found."));
  } else {
    const availRes = await pool.query(
      `SELECT staff_id, day_of_week FROM staff_availability
       WHERE staff_id = ANY($1)`,
      [staffRes.rows.map((r: any) => r.id)],
    );
    const availByStaff: Record<number, Set<number>> = {};
    for (const row of availRes.rows) {
      if (!availByStaff[row.staff_id]) availByStaff[row.staff_id] = new Set();
      availByStaff[row.staff_id].add(row.day_of_week);
    }

    const staffAvailTable: unknown[] = [];
    let anyFail = false;
    let anyWarn = false;

    for (const s of staffRes.rows) {
      const days = availByStaff[s.id] ?? new Set();
      const row: Record<string, unknown> = { staffName: s.name };
      for (let d = 0; d < 7; d++) row[DAY_NAMES[d].toLowerCase().slice(0, 3)] = days.has(d);
      if (days.size === 0) anyFail = true;
      else if (days.size < 5) anyWarn = true;
      staffAvailTable.push(row);
    }

    tables.staff_availability = staffAvailTable;

    if (anyFail) {
      const noAvail = staffRes.rows.filter((s: any) => !(availByStaff[s.id]?.size));
      checks.push(fail("staff_availability", "Staff availability configured", `${noAvail.map((s: any) => s.name).join(", ")} ${noAvail.length === 1 ? "has" : "have"} zero availability rows — they will never appear in the booking flow.`, "Staff → [Member] → Schedule"));
    } else if (anyWarn) {
      checks.push(warn("staff_availability", "Staff availability configured", "Some staff have partial week availability — see table below.", "Staff → [Member] → Schedule"));
    } else {
      checks.push(pass("staff_availability", "Staff availability configured", "All calendar-visible staff have availability set."));
    }
  }

  // ── 1d. Staff → Service Assignments ──────────────────────────────────────────
  const servicesRes = await pool.query(
    `SELECT id, name FROM services WHERE store_id = $1 AND is_active = true AND hidden_from_public = false`,
    [accountId],
  );

  if (staffRes.rows.length > 0 && servicesRes.rows.length > 0) {
    const ssRes = await pool.query(
      `SELECT staff_id, service_id FROM staff_services
       WHERE staff_id = ANY($1) AND service_id = ANY($2)`,
      [staffRes.rows.map((r: any) => r.id), servicesRes.rows.map((r: any) => r.id)],
    );
    const assignedMap: Record<number, Set<number>> = {};
    for (const row of ssRes.rows) {
      if (!assignedMap[row.staff_id]) assignedMap[row.staff_id] = new Set();
      assignedMap[row.staff_id].add(row.service_id);
    }

    const serviceNames: Record<number, string> = {};
    for (const s of servicesRes.rows) serviceNames[s.id] = s.name;

    const staffServicesTable: unknown[] = [];
    let anyUnassigned = false;

    for (const s of staffRes.rows) {
      const assigned = assignedMap[s.id] ?? new Set();
      const assignedNames = servicesRes.rows.filter((sv: any) => assigned.has(sv.id)).map((sv: any) => sv.name);
      const missingNames  = servicesRes.rows.filter((sv: any) => !assigned.has(sv.id)).map((sv: any) => sv.name);
      if (assigned.size === 0) anyUnassigned = true;
      staffServicesTable.push({ staffName: s.name, assigned: assignedNames, missing: missingNames });
    }

    tables.staff_services = staffServicesTable;

    if (anyUnassigned) {
      const names = staffRes.rows.filter((s: any) => !(assignedMap[s.id]?.size)).map((s: any) => s.name).join(", ");
      checks.push(warn("staff_service_assignments", "Staff-service assignments", `${names} ${names.includes(",") ? "have" : "has"} zero service assignments — they will never appear in booking flow.`, "Staff → [Member] → Services"));
    } else {
      const gapsExist = staffRes.rows.some((s: any) => {
        const a = assignedMap[s.id] ?? new Set();
        return a.size < servicesRes.rows.length;
      });
      if (gapsExist) {
        checks.push(warn("staff_service_assignments", "Staff-service assignments", "Some staff are missing assignments for certain services — see table below.", "Staff → [Member] → Services"));
      } else {
        checks.push(pass("staff_service_assignments", "Staff-service assignments", "All calendar-visible staff are assigned to all active services."));
      }
    }
  } else if (staffRes.rows.length === 0) {
    checks.push(warn("staff_service_assignments", "Staff-service assignments", "No active staff to check."));
  } else {
    checks.push(warn("staff_service_assignments", "Staff-service assignments", "No active visible services to check against."));
  }

  return {
    segmentId: "booking_readiness",
    label: "Booking Readiness",
    status: rollup(checks),
    runAt: new Date().toISOString(),
    checks,
    tables,
  };
}
