/**
 * Turn engine — the database side of the rotation rules in shared/turnRules.ts.
 *
 * The rules decide what a ticket is worth and how the line is ordered; this file supplies what they need
 * from the database (the turn period, each technician's score) and writes the rotation's history
 * (turn_events). It keeps no state of its own: the line itself still lives in the salon's turn settings
 * and is changed only through mutateTurnPreferences / withTurnLock in routes.ts.
 */
import { pool } from "../db";
import { walkInSQL } from "./nailTickets";
import { TURN_UNIT, isDollarMode, turnAmount, turnUnits, type TurnRules } from "@shared/turnRules";

export interface TurnEventInput {
  storeId: number;
  kind: "assigned" | "passed" | "credited" | "adjusted" | "config_changed";
  staffId?: number | null;
  appointmentId?: number | null;
  category?: string | null;
  amountCents?: number | null;
  turnUnits?: number | null;
  method?: string | null;
  configVersion?: number | null;
  automatic?: boolean;
  reason?: string | null;
  actorUserId?: string | number | null;
  actorStaffId?: number | null;
  explanation?: string | null;
  details?: unknown;
}

/** Add one row to the rotation's history. Returns false when the row already exists (a ticket credited twice). Never throws. */
export async function recordTurnEvent(e: TurnEventInput): Promise<boolean> {
  try {
    const result = await pool.query(
      `INSERT INTO turn_events (store_id, kind, staff_id, appointment_id, category, amount_cents, turn_units, method, config_version,
                                automatic, reason, actor_user_id, actor_staff_id, explanation, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb)
       ON CONFLICT DO NOTHING`,
      [e.storeId, e.kind, e.staffId ?? null, e.appointmentId ?? null, e.category ?? null, e.amountCents ?? null, e.turnUnits ?? null,
       e.method ?? null, e.configVersion ?? null, e.automatic !== false, e.reason ?? null,
       e.actorUserId != null ? String(e.actorUserId) : null, e.actorStaffId ?? null, e.explanation ?? null,
       e.details === undefined ? null : JSON.stringify(e.details)],
    );
    return (result.rowCount ?? 0) > 0;
  } catch (err: any) {
    console.error("[turn] history write failed:", err?.message);
    return false;
  }
}

/** The category a service belongs to, as the salon named it (null when it has none). */
export async function serviceCategory(storeId: number, serviceId: number): Promise<string | null> {
  const { rows } = await pool.query(`SELECT category FROM services WHERE id = $1 AND store_id = $2`, [serviceId, storeId]);
  const name = typeof rows[0]?.category === "string" ? rows[0].category.trim() : "";
  return name || null;
}

/**
 * When the current turn period began. Scores count from here.
 *   business_day — the start of the salon's turn day (4 AM local; worked out by the caller in the salon's timezone)
 *   day_close    — the last Day Close (the start of the turn day when the drawer has never been closed)
 *   continuous   — never by the clock: only when the salon changes its method or starts the line again
 * In every case a change of method starts a new period (settings.turnPeriodStartedAt), so tickets earned
 * under the old method are never re-counted under the new one.
 */
export async function turnPeriodStart(storeId: number, rules: TurnRules, settings: Record<string, any>, dayStartUtc: Date): Promise<Date> {
  let start = dayStartUtc;
  if (rules.resetPeriod === "day_close") {
    const { rows } = await pool.query(
      `SELECT MAX(closed_at AT TIME ZONE 'UTC') AS closed FROM cash_drawer_sessions WHERE store_id = $1 AND status = 'closed'`, [storeId]);
    if (rows[0]?.closed) start = new Date(rows[0].closed);
  } else if (rules.resetPeriod === "continuous") {
    // far enough back to be "always", near enough to stay a quick query
    start = new Date(Date.now() - 370 * 24 * 60 * 60_000);
  }
  const restarted = settings?.turnPeriodStartedAt ? new Date(settings.turnPeriodStartedAt) : null;
  if (restarted && Number.isFinite(restarted.getTime()) && restarted.getTime() > start.getTime() && restarted.getTime() <= Date.now() + 60_000) start = restarted;
  return start;
}

export interface TurnScores {
  /** staff id → score. Lowest is next. Turn units for the dollar and client methods; for fixed order, when they last took a turn. */
  scores: Map<number, number>;
  /** staff id → what to show as "turns" / "clients" this period, in turn units. */
  shown: Map<number, number>;
}

/**
 * Every technician's score for the period, under the salon's method — for the whole salon, or for one
 * service category when the salon keeps a rotation per category.
 */
export async function loadTurnScores(opts: { storeId: number; rules: TurnRules; periodStart: Date; until: Date; category?: string | null }): Promise<TurnScores> {
  const { storeId, rules, periodStart, until, category = null } = opts;
  const scores = new Map<number, number>();
  const shown = new Map<number, number>();

  if (rules.mode === "round_robin") {
    // A turn is taken when the client is assigned (or the technician is passed over, where the salon says
    // that uses the turn). A ticket cancelled afterwards gives the turn back.
    const { rows } = await pool.query(
      `SELECT e.staff_id, MAX(e.at) AS last_at, COUNT(*) FILTER (WHERE e.kind = 'assigned')::int AS taken
         FROM turn_events e LEFT JOIN appointments a ON a.id = e.appointment_id
        WHERE e.store_id = $1 AND e.at >= $2 AND e.kind IN ('assigned','passed') AND COALESCE(e.turn_units, 0) > 0
          AND e.staff_id IS NOT NULL AND (a.id IS NULL OR a.status <> 'cancelled')
          AND ($3::text IS NULL OR lower(e.category) = lower($3))
        GROUP BY e.staff_id`,
      [storeId, periodStart, category],
    );
    for (const row of rows) {
      scores.set(Number(row.staff_id), Math.max(1, new Date(row.last_at).getTime() - periodStart.getTime() + 1));
      shown.set(Number(row.staff_id), Number(row.taken) * TURN_UNIT);
    }
    return { scores, shown };
  }

  // Dollar and client methods: every finished, paid WALK-IN ticket of the period. What a ticket earned is
  // what was recorded when it was checked out (turn_events 'credited'); a ticket from before that record
  // existed is worked out from today's rules. Advance bookings earn nothing.
  const { rows } = await pool.query(
    `SELECT a.id, a.staff_id, a.service_revenue, a.product_revenue, a.total_paid, a.tip_amount, a.discount_amount, a.ticket_group_id,
            e.turn_units AS credited_units, e.method AS credited_method,
            (SELECT COALESCE(SUM(r.amount_cents), 0) FROM payment_refunds r WHERE r.appointment_id = a.id AND r.status IS DISTINCT FROM 'failed')::int AS refunded_cents
       FROM appointments a
       LEFT JOIN services s ON s.id = a.service_id
       LEFT JOIN turn_events e ON e.appointment_id = a.id AND e.kind = 'credited'
      WHERE a.store_id = $1 AND a.date >= $2 AND a.date <= $3 AND a.status = 'completed' AND a.staff_id IS NOT NULL
        AND ($4::text IS NULL OR lower(s.category) = lower($4))
        AND ${walkInSQL("a")}
      ORDER BY a.id`,
    [storeId, periodStart, until, category],
  );
  const countedClients = new Set<string>();
  for (const row of rows) {
    const staffId = Number(row.staff_id);
    const amount = turnAmount({ serviceRevenue: row.service_revenue, productRevenue: row.product_revenue, totalPaid: row.total_paid, tipAmount: row.tip_amount, discountAmount: row.discount_amount }, rules.amountBasis);
    let units: number;
    if (row.credited_units != null && row.credited_method === rules.mode) {
      units = Number(row.credited_units);
    } else if (rules.mode === "client_count") {
      // one client per visit: a visit saved as several tickets for the same technician counts once
      const visit = `${staffId}:${row.ticket_group_id ?? row.id}`;
      units = amount > 0 && !countedClients.has(visit) ? TURN_UNIT : 0;
      if (amount > 0) countedClients.add(visit);
    } else {
      units = turnUnits(rules, amount);
    }
    // A ticket refunded in full gives its turns back, where the salon has chosen that.
    if (rules.refundPolicy === "remove" && units > 0) {
      const paidCents = Math.round((Number(row.total_paid) || 0) * 100);
      if (paidCents > 0 && Number(row.refunded_cents) >= paidCents) units = 0;
    }
    if (units > 0) {
      scores.set(staffId, (scores.get(staffId) ?? 0) + units);
      shown.set(staffId, (shown.get(staffId) ?? 0) + units);
    }
  }
  return { scores, shown };
}

/**
 * What a finished ticket earns, recorded once. `claimed` is false when the ticket had already been
 * credited (a checkout reported twice) — the caller must then leave the line alone.
 */
export async function creditTicket(opts: {
  storeId: number; staffId: number; appointmentId: number; rules: TurnRules; configVersion?: number | null;
  amount: number; isBooking: boolean;
}): Promise<{ units: number; recorded: boolean }> {
  const { storeId, staffId, appointmentId, rules, amount, isBooking } = opts;
  let units = isBooking ? 0 : turnUnits(rules, amount);
  let category: string | null = null;
  let note: string | null = isBooking ? "Advance booking: outside the rotation." : null;
  try {
    const { rows } = await pool.query(
      `SELECT a.ticket_group_id, s.category FROM appointments a LEFT JOIN services s ON s.id = a.service_id WHERE a.id = $1 AND a.store_id = $2`,
      [appointmentId, storeId]);
    category = typeof rows[0]?.category === "string" && rows[0].category.trim() ? rows[0].category.trim() : null;
    // Equal clients: one client per visit. A second ticket of the same visit for the same technician adds nothing.
    if (rules.mode === "client_count" && units > 0 && rows[0]?.ticket_group_id != null) {
      const dup = await pool.query(
        `SELECT 1 FROM turn_events e JOIN appointments a ON a.id = e.appointment_id
          WHERE e.store_id = $1 AND e.kind = 'credited' AND e.staff_id = $2 AND e.turn_units > 0 AND a.ticket_group_id = $3 AND a.id <> $4 LIMIT 1`,
        [storeId, staffId, rows[0].ticket_group_id, appointmentId]);
      if ((dup.rowCount ?? 0) > 0) { units = 0; note = "Same visit as a ticket already counted for this technician."; }
    }
  } catch (err: any) {
    console.error("[turn] credit lookup failed:", err?.message);
  }
  // Fixed order takes the turn at assignment; the checkout is recorded for the history only.
  const recorded = await recordTurnEvent({
    storeId, kind: "credited", staffId, appointmentId, category,
    amountCents: Math.round(Math.max(0, amount) * 100),
    turnUnits: rules.mode === "round_robin" ? 0 : units,
    method: rules.mode, configVersion: opts.configVersion ?? null, reason: note,
    details: { rules: isDollarMode(rules.mode) ? { dollarsPerTurn: rules.dollarsPerTurn, partialTurnValue: rules.partialTurnValue, brackets: rules.mode === "brackets" ? rules.brackets : undefined, boundary: rules.mode === "brackets" ? rules.boundary : undefined, amountBasis: rules.amountBasis } : undefined },
  });
  return { units, recorded };
}

/** The rotation's history for a stretch of time, newest first, with technician names. */
export async function listTurnEvents(storeId: number, from: Date, to: Date, limit = 300) {
  const { rows } = await pool.query(
    `SELECT e.id, e.at, e.kind, e.staff_id AS "staffId", s.name AS "staffName", e.appointment_id AS "appointmentId",
            a.ticket_number AS "ticketNumber", e.category, e.amount_cents AS "amountCents", e.turn_units AS "turnUnits",
            e.method, e.config_version AS "configVersion", e.automatic, e.reason, e.actor_staff_id AS "actorStaffId",
            actor.name AS "actorName", e.explanation, e.details
       FROM turn_events e
       LEFT JOIN staff s ON s.id = e.staff_id
       LEFT JOIN staff actor ON actor.id = e.actor_staff_id
       LEFT JOIN appointments a ON a.id = e.appointment_id
      WHERE e.store_id = $1 AND e.at >= $2 AND e.at < $3
      ORDER BY e.at DESC, e.id DESC LIMIT $4`,
    [storeId, from, to, Math.min(Math.max(limit, 1), 1000)],
  );
  return rows;
}
