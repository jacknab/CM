/**
 * nailTickets.ts — server logic behind the nail-salon staff screen (/nail).
 *
 * A "ticket" is an ordinary appointment created for a client who is standing at
 * the salon: status "confirmed" (checked in, waiting) or "started" (in service),
 * optionally assigned to a technician, with add-ons and the nail selection saved on
 * it. Assigned tickets run through the same booking engine, TURN queue and
 * consideration-lock rules as the calendar and kiosk, so the two never disagree.
 *
 * The TURN helpers live inside routes.ts, so they are injected (`TicketDeps`).
 */

import { pool, db } from "../db";
import { and, desc, eq, sql } from "drizzle-orm";
import { appointmentAddons, appointmentNailSelection, appointments } from "@shared/schema";
import { storage } from "../storage";
import { atomicCreateBooking, occupiedMinutes } from "../bookingEngine";
import { autoAssignResource } from "../services/resource-assignment";
import { getRequiredResourceType } from "@shared/resourceMatching";
import { withTurnLock } from "./turnLock";
import { getLastDayCloseAt } from "./dayCloseBoundary";
import * as nailConfig from "./nailConfig";
import { getBufferMinutes } from "./appointmentBuffer";
import { resolvePackageForBooking } from "./packageResolver";

/**
 * A check-in is a record that STAYS until someone resolves it (ticket made, client removed, checked out) — nothing here
 * ever expires it on a short timer. A "waiting, no ticket yet" kiosk check-in older than this is treated as abandoned
 * (a background job marks it expired; see routes/sync-jobs.ts) and stops showing.
 */
export const CHECKIN_MARKER_HOURS = 18;

/**
 * The salon's BUSINESS day, for the "Salon at a glance" numbers: it starts at 4 AM store time, not at midnight, so a late
 * night doesn't zero the numbers at 12:00. SQL for "the business day this moment / this column belongs to" ($2 = store timezone).
 */
export const BUSINESS_DAY_ROLLOVER_HOURS = 4;
const bizDayOf = (col: string) => `((${col} AT TIME ZONE $2) - INTERVAL '${BUSINESS_DAY_ROLLOVER_HOURS} hours')::date`;
const BIZ_TODAY = `((NOW() AT TIME ZONE $2) - INTERVAL '${BUSINESS_DAY_ROLLOVER_HOURS} hours')::date`;

// An appointment scheduled before Day Close may be checked out afterwards, and a future
// booking may already exist before Day Close. Use the event that belongs to each tile,
// not the scheduled date, to decide whether it belongs to the new shift.
/** SQL for "this appointment row is a walk-in, not an advance booking". Only walk-ins earn turns. */
export const walkInSQL = (alias: string) => `(EXISTS (SELECT 1 FROM appointment_events e WHERE e.appointment_id = ${alias}.id AND e.event_type = 'created' AND e.metadata->>'source' = 'nail_ticket')
               OR ABS(EXTRACT(EPOCH FROM (${alias}.created_at - ${alias}.date))) < 900
               OR (${alias}.checked_in_at IS NOT NULL AND ABS(EXTRACT(EPOCH FROM (${alias}.checked_in_at - ${alias}.created_at))) < 900))`;
/** Which of these tickets are walk-ins (made at the desk / checked in within minutes of being made), not advance bookings. */
export async function walkInTicketIds(storeId: number, ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const { rows } = await pool.query(
    `SELECT a.id FROM appointments a WHERE a.store_id = $1 AND a.id = ANY($2::int[]) AND ${walkInSQL("a")}`,
    [storeId, ids],
  );
  return new Set(rows.map((r: any) => Number(r.id)));
}

export const boardAfterCloseSQL = (alias: string) => `($3::timestamptz IS NULL OR
          CASE WHEN ${alias}.status = 'completed' THEN ${alias}.completed_at > $3::timestamptz
               WHEN ${walkInSQL(alias)} THEN (${alias}.created_at AT TIME ZONE 'UTC') > $3::timestamptz
               ELSE ${alias}.date > $3::timestamptz END)`;

// ── Pure helpers ────────────────────────────────────────────────────────────

export type BusyBlock = { date: Date | string; duration: number | null };

/** True for business types that get the nail-salon staff screen. */
export function isNailSalonCategory(category?: string | null): boolean {
  return /nail/i.test(category ?? "");
}

/**
 * The /nail and /barber staff screens share one ticket engine but not one door:
 * /api/barber/* is for barbershops only, every other path for nail salons only.
 * `originalUrl` is the URL as the client sent it (before the /api/barber → /api/nail rewrite).
 */
export function staffScreenAllowed(originalUrl: string | undefined, category?: string | null): boolean {
  return originalUrl?.startsWith("/api/barber/") ? /barber/i.test(category ?? "") : isNailSalonCategory(category);
}

/**
 * Earliest start >= `from` at which `durationMin` fits between the given
 * blocks. Mirrors the booking engine's overlap rule (start < otherEnd &&
 * end > otherStart), so a start returned here is never rejected as a conflict.
 */
export function nextFreeStart(busy: BusyBlock[], from: Date, durationMin: number): Date {
  const blocks = busy
    .map((b) => {
      const start = new Date(b.date).getTime();
      return { start, end: start + (b.duration ?? 60) * 60_000 };
    })
    .sort((a, b) => a.start - b.start);

  let candidate = from.getTime();
  const len = durationMin * 60_000;
  // Each pass either finishes or jumps past one more block, so blocks.length + 1 passes is the max.
  for (let i = 0; i <= blocks.length; i++) {
    const clash = blocks.find((b) => b.start < candidate + len && b.end > candidate);
    if (!clash) break;
    candidate = clash.end;
  }
  return new Date(candidate);
}

export interface TicketPricing {
  duration: number;
  price: number;
}

/** `isRetail` marks a product sale rung up as a custom line — commissioned at the product rate,
 *  not the service rate, when this ticket is later paid (alone or as a Group Pay member). */
/**
 * A line on the ticket beyond its first service: a keypad "Custom Amount", or — with `serviceId` — another
 * service of the same visit (owner, 2026-10-21: one ticket holds every service, done by one technician).
 * A service line carries the catalog's price and its time; the server sets both, never the tablet.
 */
export interface CustomLine {
  label: string; price: number; isRetail?: boolean; serviceId?: number; duration?: number;
  /** A Catalog package's price line: the package price less its parts at catalog price (owner, 2026-10-21).
   *  Only the server writes one; it may be below zero (the package saving). */
  packageId?: number;
}

/** Keypad lines from the client: trimmed labels, 0 < price <= 9999.99 to the cent, at most 20.
 *  `withPackage` keeps package price lines — only for lines the server itself saved. */
export function sanitizeCustomLines(raw: unknown, withPackage = false): CustomLine[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomLine[] = [];
  for (const r of raw) {
    const price = Math.round(Number((r as any)?.price) * 100) / 100;
    const packageId = Number((r as any)?.packageId);
    if (Number.isSafeInteger(packageId) && packageId > 0) {
      if (withPackage && Number.isFinite(price) && price !== 0 && Math.abs(price) <= 9999.99) {
        out.push({ label: String((r as any)?.label ?? "").trim().slice(0, 60) || "Package", price, packageId });
        if (out.length >= 20) break;
      }
      continue;
    }
    // A service line may be free; a keypad amount must be more than nothing.
    const isService = Number.isSafeInteger(Number((r as any)?.serviceId)) && Number((r as any)?.serviceId) > 0;
    if (!Number.isFinite(price) || price < 0 || (!isService && price === 0) || price > 9999.99) continue;
    const label = String((r as any)?.label ?? "").trim().slice(0, 60) || "Custom Amount";
    const line: CustomLine = { label, price };
    if ((r as any)?.isRetail === true) line.isRetail = true;
    const serviceId = Number((r as any)?.serviceId);
    if (Number.isSafeInteger(serviceId) && serviceId > 0) {
      line.serviceId = serviceId;
      const duration = Math.round(Number((r as any)?.duration));
      if (Number.isFinite(duration) && duration > 0 && duration <= 600) line.duration = duration;
    }
    out.push(line);
    if (out.length >= 20) break;
  }
  return out;
}

const sumCustom = (lines: CustomLine[]) => Math.round(lines.reduce((s, l) => s + l.price, 0) * 100) / 100;
/** The time the visit's further services take. */
const customDuration = (lines: CustomLine[]) => lines.reduce((s, l) => s + (l.serviceId ? Number(l.duration) || 0 : 0), 0);

/** A further service of the visit as a ticket line, priced and timed from the catalog. Null when it can't be added. */
export async function serviceLine(storeId: number, serviceId: number): Promise<CustomLine | null> {
  const svc = await storage.getService(serviceId);
  if (!svc || svc.storeId !== storeId || svc.isActive === false) return null;
  const price = Math.round(Number(svc.price) * 100) / 100;
  if (!Number.isFinite(price) || price < 0) return null;
  return { label: String(svc.name).slice(0, 60), price, serviceId: svc.id, ...(Number(svc.duration) > 0 ? { duration: Number(svc.duration) } : {}) };
}

/** Duration + price of a service with its add-ons and nail adjustments. */
export function priceTicket(args: {
  serviceDuration: number;
  servicePrice: number;
  addons: { duration: number | null; price: number | string }[];
  nailPriceAdj?: number;
  nailDurationAdj?: number;
  /** Keypad "Custom Amount" lines and the visit's further services — their money. */
  customPrice?: number;
  /** The further services' time (keypad lines take none). */
  customDuration?: number;
}): TicketPricing {
  const addonDuration = args.addons.reduce((s, a) => s + (Number(a.duration) || 0), 0);
  const addonPrice = args.addons.reduce((s, a) => s + (Number(a.price) || 0), 0);
  return {
    duration: Math.max(1, Number(args.serviceDuration) + addonDuration + (args.nailDurationAdj ?? 0) + (args.customDuration ?? 0)),
    price: Number(args.servicePrice) + addonPrice + (args.nailPriceAdj ?? 0) + (args.customPrice ?? 0),
  };
}

// ── Injected TURN helpers (implemented in routes.ts) ────────────────────────

export interface TicketDeps {
  getTurnEligibility(storeId: number, serviceId: number | null): Promise<{ technicians: any[]; eligibleTechnicians: any[]; settings?: any }>;
  /** Change turn state against what is saved right now, under the settings row lock. */
  mutateTurnPreferences(storeId: number, change: (turn: any) => Record<string, any> | null): Promise<any>;
  /** Audit row for a front-desk check-in handed to a technician by category. */
  logCategoryAssignment?(entry: { storeId: number; staffId: number; recommendedStaffId: number | null }): Promise<void>;
  assignAppointmentViaTurn(opts: {
    storeId: number;
    serviceId?: number | null;
    appointmentId?: number | null;
    requestedStaffId?: number | null;
    bookedByUserId?: number | null;
    writeStaffId?: boolean;
    /** Consume the technician's TURN position even when this exact technician was selected. */
    consumeTurn?: boolean;
    source?: string;
    /** Why staff gave the client to someone other than the next technician. */
    overrideReason?: string | null;
  }): Promise<{ technician: any } | null>;
  /** History row for a ticket moved from one technician to another by staff. */
  recordTurnMove?(entry: { storeId: number; appointmentId: number; serviceId: number; staffId: number; fromStaffId: number; reason: string | null }): Promise<void>;
  getTurnPreferences(storeId: number): Promise<Record<string, any>>;
  saveTurnPreferences(storeId: number, updates: Record<string, any>): Promise<unknown>;
  /** Fan-out after any ticket change: websocket + dashboard refresh. */
  notify(storeId: number, event: { appointmentId: number; kind: "created" | "updated" | "started" | "assigned" }): void;
}

export type TicketResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; technicians?: any[]; code?: string };

const fail = (status: number, message: string, extra?: { technicians?: any[]; code?: string }): TicketResult<never> =>
  ({ ok: false, status, message, ...extra });

const numArr = (v: unknown): number[] =>
  Array.isArray(v) ? (v as unknown[]).map(Number).filter(Number.isFinite) : [];

export interface WaitingServiceCandidate {
  id: number;
  /** All independently-qualified services required by this client. */
  requiredServiceIds: number[];
  assignedStaffId?: number | null;
}

/**
 * Return the first client, in the queue's existing order, whose complete service set can be
 * performed by the technician. The input array is never sorted or mutated: incompatible clients
 * stay exactly where they were for another technician.
 *
 * `meetsExistingConstraints` lets the caller retain TURN, schedule, and station/chair rules in
 * addition to service compatibility rather than replacing them.
 */
export function findEarliestCompatibleWaitingClient<T extends WaitingServiceCandidate>(
  waitingInQueueOrder: readonly T[],
  technicianServiceIds: ReadonlySet<number>,
  meetsExistingConstraints: (candidate: T) => boolean = () => true,
): T | null {
  for (const candidate of waitingInQueueOrder) {
    if (candidate.assignedStaffId != null || candidate.requiredServiceIds.length === 0) continue;
    if (!candidate.requiredServiceIds.every((serviceId) => technicianServiceIds.has(serviceId))) continue;
    if (meetsExistingConstraints(candidate)) return candidate;
  }
  return null;
}

// ── One service at a time per client (owner, 2026-10-21) ────────────────────

/**
 * The ticket number of another of this client's tickets that is in service right now (started, DONE not yet
 * pressed), or null. While there is one, the client's other tickets are not assigned or started — they are in
 * one chair at a time. A ticket with no client on it is never held back.
 */
export async function clientInServiceTicket(storeId: number, customerId: number | null | undefined, exceptAppointmentId?: number | null): Promise<number | null> {
  if (customerId == null) return null;
  const { rows } = await pool.query(
    `SELECT ticket_number FROM appointments
      WHERE store_id = $1 AND customer_id = $2 AND id <> $3 AND status = 'started' AND service_done_at IS NULL
        AND COALESCE(started_at, date) > NOW() - INTERVAL '48 hours'
      ORDER BY started_at LIMIT 1`,
    [storeId, customerId, exceptAppointmentId ?? 0]);
  return rows[0] ? Number(rows[0].ticket_number ?? 0) || -1 : null;
}
export const inServiceMessage = (ticketNumber: number) =>
  `This client is in service on ${ticketNumber > 0 ? `ticket #${ticketNumber}` : "another ticket"}. Their next service can be assigned and started once that one is done.`;

// ── Turn lock helpers (same primitives the calendar's start/cancel use) ─────

async function lockTech(deps: TicketDeps, storeId: number, staffId: number) {
  await deps.mutateTurnPreferences(storeId, (turn) => ({
    dequeOrder: numArr(turn.dequeOrder).filter((id) => id !== staffId),
    lockedStaffIds: [...new Set([...numArr(turn.lockedStaffIds), staffId])],
  }));
}

/** Release a lock without a paid service: the tech gets their spot back at the front. */
async function unlockTechToFront(deps: TicketDeps, storeId: number, staffId: number) {
  await deps.mutateTurnPreferences(storeId, (turn) => {
    const locked = numArr(turn.lockedStaffIds);
    if (!locked.includes(staffId)) return null;
    return {
      lockedStaffIds: locked.filter((id) => id !== staffId),
      dequeOrder: [staffId, ...numArr(turn.dequeOrder).filter((id) => id !== staffId)],
    };
  });
}

/** The technician's bookings around now; each is held for the store's buffer after it ends.
 *  A client already checked out only holds the tech until checkout; a no-show doesn't hold them at all. */
async function busyBlocksFor(storeId: number, staffId: number, excludeAppointmentId?: number): Promise<BusyBlock[]> {
  const buffer = await getBufferMinutes(storeId);
  const { rows } = await pool.query(
    `SELECT id, date, duration, CASE WHEN service_done_at IS NOT NULL THEN 'completed' ELSE status END AS status,
            COALESCE(completed_at, service_done_at) AS completed_at FROM appointments
      WHERE store_id = $1 AND staff_id = $2 AND status <> 'cancelled'
        AND date >= NOW() - INTERVAL '12 hours' AND date <= NOW() + INTERVAL '24 hours'
        ${excludeAppointmentId ? "AND id <> $3" : ""}`,
    excludeAppointmentId ? [storeId, staffId, excludeAppointmentId] : [storeId, staffId],
  );
  return rows
    .map((r: any) => ({ date: r.date, held: occupiedMinutes({ date: r.date, duration: r.duration, status: r.status, completedAt: r.completed_at }) }))
    .filter((b) => b.held > 0)
    .map((b) => ({ date: b.date, duration: b.held + buffer }));
}

async function techCanDo(staffId: number, serviceId: number): Promise<boolean> {
  const links = await storage.getStaffServices(staffId);
  return links.some((l) => l.serviceId === serviceId);
}

/**
 * After checkout releases a technician, pair them with the earliest unassigned Nail queue client
 * they can actually serve. Assignment is conditional on staff_id still being NULL, so two nearly
 * simultaneous checkouts cannot claim the same client. Skipped rows are never updated.
 *
 * Nail tickets currently have one qualification-bearing service_id. Add-ons and nail selections
 * affect duration/price but have no staff qualification relation, so they intentionally do not
 * invent additional capability requirements here.
 */
export async function matchWaitingNailTicketForTechnician(
  deps: TicketDeps,
  args: { storeId: number; staffId: number },
): Promise<{ appointmentId: number; serviceId: number } | null> {
  const store = await storage.getStore(args.storeId);
  // The ticket/turn engine is shared by the nail and barber walk-in wrappers.
  if (!store || !(isNailSalonCategory((store as any).category) || /barber/i.test((store as any).category ?? ""))) return null;
  // A nail salon's ticket is only ever started by someone pressing START; a barbershop's starts with the hand-over.
  const startOnAssign = !isNailSalonCategory((store as any).category);

  const prefs = await deps.getTurnPreferences(args.storeId);
  if (prefs.turnEnabled === false || prefs.autoAdvanceOnCheckout === false) return null;

  const capabilityRows = await storage.getStaffServices(args.staffId);
  const capabilityIds = new Set(capabilityRows.map((row) => Number(row.serviceId)).filter(Number.isFinite));
  if (capabilityIds.size === 0) return null;

  const { rows } = await pool.query(
    `SELECT id, service_id, staff_id, custom_lines
       FROM appointments
      WHERE store_id = $1
        AND status = 'confirmed'
        AND checked_in_at IS NOT NULL
        AND staff_id IS NULL
        AND service_id IS NOT NULL
        AND waits_for_appointment_id IS NULL
        AND ringing_up_since IS NULL
        -- One service at a time: not while the same client is in a chair on another ticket.
        AND NOT EXISTS (SELECT 1 FROM appointments b WHERE b.store_id = appointments.store_id AND b.customer_id = appointments.customer_id
          AND b.id <> appointments.id AND b.status = 'started' AND b.service_done_at IS NULL)
      ORDER BY checked_in_at ASC, date ASC, id ASC`,
    [args.storeId],
  );

  const remaining = rows.map((row: any) => ({
    id: Number(row.id),
    // The technician must do every service on the ticket (its further services are service lines).
    requiredServiceIds: [Number(row.service_id), ...sanitizeCustomLines(row.custom_lines, true).filter((l) => l.serviceId).map((l) => l.serviceId!)],
    assignedStaffId: row.staff_id == null ? null : Number(row.staff_id),
  }));

  while (remaining.length > 0) {
    const candidate = findEarliestCompatibleWaitingClient(remaining, capabilityIds);
    if (!candidate) return null;
    const serviceId = candidate.requiredServiceIds[0];

    // Reuse every existing TURN constraint for this exact technician and service immediately
    // before claiming the row. This catches a break, clock-out, appointment window, or another
    // assignment that occurred while checkout was finishing.
    const eligibility = await deps.getTurnEligibility(args.storeId, serviceId);
    const technician = eligibility.eligibleTechnicians.find((tech: any) => Number(tech.id) === args.staffId);
    if (!technician) return null;

    const claimed = await pool.query(
      `UPDATE appointments
          SET staff_id = $1
        WHERE id = $2 AND store_id = $3
          AND status = 'confirmed' AND checked_in_at IS NOT NULL AND staff_id IS NULL AND ringing_up_since IS NULL
        RETURNING id`,
      [args.staffId, candidate.id, args.storeId],
    );
    if (claimed.rowCount === 0) {
      remaining.splice(remaining.indexOf(candidate), 1);
      continue;
    }

    const assigned = await deps.assignAppointmentViaTurn({
      storeId: args.storeId,
      serviceId,
      appointmentId: candidate.id,
      requestedStaffId: args.staffId,
      writeStaffId: true,
      consumeTurn: true,
      source: "nail_queue_compatibility",
    });
    if (!assigned || Number(assigned.technician.id) !== args.staffId) {
      // The technician changed state between revalidation and TURN locking. Return this untouched
      // client to the same queue position; checked_in_at/date were never changed.
      await pool.query(
        `UPDATE appointments SET staff_id = NULL WHERE id = $1 AND store_id = $2 AND staff_id = $3 AND status = 'confirmed'`,
        [candidate.id, args.storeId, args.staffId],
      );
      return null;
    }

    // TURN gave this client to the tech who just freed up. In a nail salon the ticket stays waiting,
    // assigned to them, until START is pressed. In a barbershop the service starts now, the same way
    // a new ticket starts when its barber is free; no free chair (when chairs are set up) → it stays
    // assigned and waiting, and staff can press START once one frees up.
    const started = startOnAssign && await startClaimedTicketNow(args.storeId, candidate.id);
    // "assigned": a client who was waiting now has a technician — every POS station is told, so it can say so.
    deps.notify(args.storeId, { appointmentId: candidate.id, kind: started ? "started" : "assigned" });
    return { appointmentId: candidate.id, serviceId };
  }
  return null;
}

/** Start an assigned, still-waiting ticket right now (claims a station/chair when the service needs one). */
async function startClaimedTicketNow(storeId: number, appointmentId: number): Promise<boolean> {
  const appt = await storage.getAppointment(appointmentId);
  if (!appt || appt.storeId !== storeId || appt.status !== "confirmed" || !appt.staffId || !appt.serviceId) return false;
  const service = await storage.getService(appt.serviceId);
  const now = new Date();
  let resourceId: number | null = (appt as any).resourceId ?? null;
  const requiredResource = service ? getRequiredResourceType(service.category, service.name) : null;
  if (requiredResource && resourceId == null) {
    const r = await autoAssignResource({ storeId, resourceType: requiredResource, date: now, duration: appt.duration ?? 60 });
    if (r.assigned && r.resourceId) resourceId = r.resourceId;
    else if (!r.noResourcesConfigured) return false;
  }
  const { rowCount } = await pool.query(
    `UPDATE appointments SET status = 'started', started_at = $3, date = $3, resource_id = COALESCE($4, resource_id)
      WHERE id = $1 AND store_id = $2 AND status = 'confirmed' AND staff_id IS NOT NULL`,
    [appointmentId, storeId, now, resourceId],
  );
  return (rowCount ?? 0) > 0;
}

// ── Nail selection validation ───────────────────────────────────────────────

export type NailInput = {
  nailSizeId?: number | null;
  nailShapeId?: number | null;
  nailArtApplicationId?: number | null;
  nailArtEffectId?: number | null;
};

const hasNail = (n?: NailInput | null) =>
  !!n && !!(n.nailSizeId || n.nailShapeId || n.nailArtApplicationId || n.nailArtEffectId);

/** Every chosen option must be enabled on this service's own nail config. */
async function validateNail(serviceId: number, nail: NailInput): Promise<string | null> {
  const cfg = await nailConfig.getServiceNailConfig(serviceId);
  if (!cfg || !cfg.config.isEnabled) return "This service has no nail options.";
  const ok = (rows: any[], key: string, id?: number | null) =>
    !id || rows.some((r) => r[key] === id && r.isEnabled);
  if (!ok(cfg.sizes, "nailSizeId", nail.nailSizeId)) return "That nail size isn't offered for this service.";
  if (!ok(cfg.shapes, "nailShapeId", nail.nailShapeId)) return "That nail shape isn't offered for this service.";
  if (!ok(cfg.applications, "nailArtApplicationId", nail.nailArtApplicationId)) return "That nail art isn't offered for this service.";
  if (!ok(cfg.effects, "nailArtEffectId", nail.nailArtEffectId)) return "That nail art effect isn't offered for this service.";
  return null;
}

// ── Create a walk-in ticket ─────────────────────────────────────────────────

export interface CreateTicketInput {
  storeId: number;
  /** 0 / null: a walk-in checked in by name only (Quick Check-in) — no client record; allowed with that check-in
   *  (checkinId) or as another ticket of such a visit (visitTicketNumber). Owner, 2026-10-30. */
  clientId: number | null;
  serviceId: number;
  addonIds?: number[];
  nail?: NailInput | null;
  customLines?: CustomLine[] | null;
  /** A specific technician chosen by staff; omit to take whoever TURN says is next. */
  staffId?: number | null;
  /** With autoAssign: take this technician if TURN lists them as eligible for the service, instead of
   *  the first in line. Used for a ticket of several services, to keep them with one technician. */
  preferStaffId?: number | null;
  /** Put the ticket with this technician without consulting TURN and without treating it as a client
   *  request: a further service of a visit whose first service TURN already gave to them. */
  sameTechStaffId?: number | null;
  /** Save in Checked In without assigning TURN or starting service. */
  leaveUnassigned?: boolean;
  /** Give the ticket to whoever TURN says is next AND can perform the service right now.
   *  When nobody can take it right now, save it waiting and unassigned instead of failing — the
   *  next technician to finish a client picks it up (matchWaitingNailTicketForTechnician). */
  autoAssign?: boolean;
  /** Barbershop screen: start the service as soon as the ticket has a free technician. Without it
   *  (/nail) the ticket is saved waiting with its technician, and starts when START is pressed. */
  startOnAssign?: boolean;
  notes?: string | null;
  /** A kiosk "waiting" marker to close out once the ticket exists. */
  checkinId?: number | null;
  /** The number a tablet gave this ticket while offline. Kept when it is still free; otherwise the
   *  ticket takes the next number as usual. Ignored when the ticket comes from a check-in, which
   *  already has its number. */
  ticketNumber?: number | null;
  /** Another ticket of a visit (a service another technician does): it shares the visit's number instead of taking
   *  a new one (owner, 2026-10-28 — the client pays once, for the whole visit; lookup by the number opens the visit). */
  visitTicketNumber?: number | null;
  /** Being rung up on a POS (2026-10-28): saved now so every station sees it, but given to nobody until SAVE
   *  (saveRingingUpTicket). Implies leaveUnassigned. */
  ringingUp?: boolean;
  /** The request's idempotency key: the ticket's id is noted against it in the same transaction that creates
   *  the ticket, so a retry after a crash finds the ticket instead of making a second one (lib/idempotency.ts). */
  idempotencyKey?: string | null;
  bookedByUserId?: number | null;
  /** A Catalog package rung up as the ticket (createNailTicketGroup resolves it into the lines below). */
  packageId?: number | null;
  /** Lines the server built for the package — its further services and its price line. Never from a tablet. */
  packageLines?: CustomLine[];
}

export interface CreatedTicket {
  appointmentId: number;
  ticketNumber: number;
  staffId: number | null;
  staffName: string | null;
  status: "started" | "confirmed";
  startsAt: string;
  duration: number;
  price: number;
  /** True when the technician is busy and the ticket is queued behind their current client. */
  waiting: boolean;
}

/** Whether a technician is clocked in, from the turn line's own list. Someone not on the list is not in. */
export function isClockedIn(technicians: Array<{ id: number | string; clockedIn?: boolean }>, staffId: number): boolean {
  return technicians.some((t) => Number(t.id) === staffId && t.clockedIn === true);
}

export interface CreatedTicketGroup extends CreatedTicket {
  /** Every ticket of the visit, the first one included, in the order the services were added. */
  tickets: Array<CreatedTicket & { serviceId: number; serviceName: string }>;
}

/**
 * The first technician in TURN order for the first service who is also eligible for every other
 * service — the one person who can take the whole visit. Null when nobody can.
 */
export function commonTechnician(eligibleByService: number[][]): number | null {
  if (eligibleByService.length === 0) return null;
  const [first, ...rest] = eligibleByService;
  const sets = rest.map((ids) => new Set(ids));
  return first.find((id) => sets.every((set) => set.has(id))) ?? null;
}

/** Reasons a technician can't take on another service of the visit. Being busy (with this same client) is fine. */
const CANNOT_ADD = ["service_not_supported", "not_clocked_in", "paused", "appointment_within_exclusion_window"];

/** Can this technician do this service now: clocked in, performs it, not on break, no appointment coming up? */
export async function technicianCanDo(deps: TicketDeps, storeId: number, staffId: number, serviceId: number): Promise<boolean> {
  const e: any = await deps.getTurnEligibility(storeId, serviceId);
  const t = (e.technicians ?? []).find((x: any) => Number(x.id) === staffId);
  if (!t || t.clockedIn !== true) return false;
  const reasons: string[] = Array.isArray(t.exclusionReasons) ? t.exclusionReasons : Array.isArray(t.reasons) ? t.reasons : [];
  return !reasons.some((r) => CANNOT_ADD.includes(r));
}

/** Adds a service line to a saved ticket: its price and time join the ticket's. */
export async function appendServiceLine(storeId: number, appointmentId: number, line: CustomLine): Promise<boolean> {
  return db.transaction(async (tx) => {
    const row = (await tx.execute(sql`SELECT custom_lines, duration, status FROM appointments
      WHERE id = ${appointmentId} AND store_id = ${storeId} FOR UPDATE`)).rows[0] as any;
    if (!row || !["confirmed", "started"].includes(String(row.status))) return false;
    const lines = [...sanitizeCustomLines(row.custom_lines, true), line];
    await tx.update(appointments).set({ customLines: lines, duration: (Number(row.duration) || 0) + (Number(line.duration) || 0) })
      .where(eq(appointments.id, appointmentId));
    return true;
  });
}

/**
 * An add-on key tapped on the POS grid, saved onto an open ticket (2026-10-28): it joins the ticket's add-ons
 * (a real add-on, commissioned and reported as one) and its time joins the ticket's. An add-on is on a ticket
 * at most once.
 */
/** Most add-ons one ticket can carry (the same add-on may be on it more than once). */
export const MAX_TICKET_ADDONS = 30;

/**
 * Adds an add-on to an open ticket, under one of its services (owner, 2026-10-29: staff tap a service in the cart and
 * the add-ons go under it): `lineNo` null = the ticket's own service, n = its service line custom_lines[n].
 */
export async function addAddonToTicket(storeId: number, appointmentId: number, addonId: number, lineNo: number | null = null): Promise<"added" | "already" | "closed" | "missing" | "line"> {
  const addon = await storage.getAddon(addonId);
  if (!addon || addon.storeId !== storeId || (addon as any).isActive === false) return "missing";
  return db.transaction(async (tx) => {
    const row = (await tx.execute(sql`SELECT duration, status, custom_lines FROM appointments
      WHERE id = ${appointmentId} AND store_id = ${storeId} FOR UPDATE`)).rows[0] as any;
    if (!row || !["confirmed", "started"].includes(String(row.status))) return "closed" as const;
    if (lineNo != null && !sanitizeCustomLines(row.custom_lines, true)[lineNo]?.serviceId) return "line" as const;
    // The same add-on may be added again (two Nail Art – Simple); only the ticket's total number is capped.
    const have = await tx.select({ id: appointmentAddons.id }).from(appointmentAddons).where(eq(appointmentAddons.appointmentId, appointmentId));
    if (have.length >= MAX_TICKET_ADDONS) return "already" as const;
    await tx.insert(appointmentAddons).values({ appointmentId, addonId, lineNo });
    const extra = Math.max(0, Number(addon.duration) || 0);
    if (extra) await tx.update(appointments).set({ duration: (Number(row.duration) || 0) + extra }).where(eq(appointments.id, appointmentId));
    return "added" as const;
  });
}

/** Takes an add-on (and its time) off an open ticket. */
export async function removeAddonFromTicket(storeId: number, appointmentId: number, addonId: number, lineNo?: number | null): Promise<boolean> {
  const addon = await storage.getAddon(addonId);
  return db.transaction(async (tx) => {
    const row = (await tx.execute(sql`SELECT duration, status FROM appointments
      WHERE id = ${appointmentId} AND store_id = ${storeId} FOR UPDATE`)).rows[0] as any;
    if (!row || !["confirmed", "started"].includes(String(row.status))) return false;
    // One at a time: a ticket can hold the same add-on more than once, and × takes off one of them — the newest one
    // under the service it was shown under (`lineNo`), else the newest anywhere.
    const rows = await tx.select({ id: appointmentAddons.id, lineNo: appointmentAddons.lineNo }).from(appointmentAddons)
      .where(and(eq(appointmentAddons.appointmentId, appointmentId), eq(appointmentAddons.addonId, addonId)))
      .orderBy(desc(appointmentAddons.id));
    const one = (lineNo !== undefined ? rows.find((r) => (r.lineNo ?? null) === (lineNo ?? null)) : undefined) ?? rows[0];
    if (!one) return false;
    await tx.delete(appointmentAddons).where(eq(appointmentAddons.id, one.id));
    const less = Math.max(0, Number(addon?.duration) || 0);
    if (less) await tx.update(appointments).set({ duration: Math.max(1, (Number(row.duration) || 0) - less) }).where(eq(appointments.id, appointmentId));
    return true;
  });
}

/**
 * A Catalog package key tapped on an open ticket (2026-10-28): every service of the package becomes a service
 * line, its add-ons join the ticket's add-ons, and a price line brings it to the package price. A package is one
 * item done by one technician, so it all stays on this ticket.
 */
export async function addPackageToTicket(storeId: number, appointmentId: number, packageId: number): Promise<TicketResult<{ name: string }>> {
  let pkg: Awaited<ReturnType<typeof resolvePackageForBooking>>;
  try { pkg = await resolvePackageForBooking(packageId, storeId); }
  catch { return fail(400, "That package is no longer in the catalog."); }
  const lines: CustomLine[] = [];
  for (const id of pkg.serviceIds) {
    const line = await serviceLine(storeId, id);
    if (!line) return fail(400, "One of the package's services is no longer in the catalog.");
    lines.push(line);
  }
  const difference = Math.round((pkg.price - pkg.listPrice) * 100) / 100;
  if (difference !== 0) lines.push({ label: `${pkg.name} package`.slice(0, 60), price: difference, packageId: pkg.packageId });
  const addonRows: NonNullable<Awaited<ReturnType<typeof storage.getAddon>>>[] = [];
  for (const id of pkg.addonIds) { const a = await storage.getAddon(id); if (a && a.storeId === storeId) addonRows.push(a); }
  return db.transaction(async (tx) => {
    const row = (await tx.execute(sql`SELECT custom_lines, duration, status FROM appointments
      WHERE id = ${appointmentId} AND store_id = ${storeId} FOR UPDATE`)).rows[0] as any;
    if (!row || !["confirmed", "started"].includes(String(row.status))) return fail(409, "This ticket is no longer open.");
    const all = [...sanitizeCustomLines(row.custom_lines, true), ...lines];
    if (all.length > 20) return fail(409, "This ticket has too many lines for that package.");
    const have = new Set((await tx.select({ id: appointmentAddons.addonId }).from(appointmentAddons)
      .where(eq(appointmentAddons.appointmentId, appointmentId))).map((r) => r.id));
    const newAddons = addonRows.filter((a) => !have.has(a.id));
    if (newAddons.length) await tx.insert(appointmentAddons).values(newAddons.map((a) => ({ appointmentId, addonId: a.id })));
    const extra = customDuration(lines) + newAddons.reduce((n, a) => n + Math.max(0, Number(a.duration) || 0), 0);
    await tx.update(appointments).set({ customLines: all, duration: (Number(row.duration) || 0) + extra }).where(eq(appointments.id, appointmentId));
    return { ok: true as const, data: { name: pkg.name } };
  });
}

/** Takes a keypad line (a checkout extra or retail item — not a service or package line) at `index` off a saved ticket. */
export async function removeCustomLine(storeId: number, appointmentId: number, index: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const row = (await tx.execute(sql`SELECT custom_lines, status FROM appointments
      WHERE id = ${appointmentId} AND store_id = ${storeId} FOR UPDATE`)).rows[0] as any;
    if (!row || !["confirmed", "started"].includes(String(row.status))) return false;
    const lines = sanitizeCustomLines(row.custom_lines, true);
    const line = lines[index];
    if (!line || line.serviceId || line.packageId) return false;
    lines.splice(index, 1);
    await tx.update(appointments).set({ customLines: lines.length ? lines : null }).where(eq(appointments.id, appointmentId));
    await shiftAddonLines(tx, appointmentId, index);
    return true;
  });
}

/**
 * The ticket's custom line at `index` is gone: its add-ons go with it (their ids and time returned) and the add-ons of
 * the lines after it move up one.
 */
async function shiftAddonLines(tx: any, appointmentId: number, index: number): Promise<{ addonIds: number[]; minutes: number }> {
  const gone = (await tx.execute(sql`DELETE FROM appointment_addons aa USING addons d
      WHERE aa.appointment_id = ${appointmentId} AND aa.line_no = ${index} AND d.id = aa.addon_id
      RETURNING aa.addon_id, COALESCE(d.duration, 0) AS duration`)).rows as any[];
  await tx.execute(sql`UPDATE appointment_addons SET line_no = line_no - 1 WHERE appointment_id = ${appointmentId} AND line_no > ${index}`);
  return { addonIds: gone.map((r) => Number(r.addon_id)), minutes: gone.reduce((m, r) => m + (Number(r.duration) || 0), 0) };
}

/** Takes the service line at `index` off a saved ticket (only a service line), with its time and its add-ons. */
export async function removeServiceLine(storeId: number, appointmentId: number, index: number): Promise<false | { addonIds: number[] }> {
  return db.transaction(async (tx) => {
    const row = (await tx.execute(sql`SELECT custom_lines, duration, status FROM appointments
      WHERE id = ${appointmentId} AND store_id = ${storeId} FOR UPDATE`)).rows[0] as any;
    if (!row || !["confirmed", "started"].includes(String(row.status))) return false;
    const lines = sanitizeCustomLines(row.custom_lines, true);
    const line = lines[index];
    if (!line?.serviceId) return false;
    lines.splice(index, 1);
    const addons = await shiftAddonLines(tx, appointmentId, index);
    await tx.update(appointments).set({ customLines: lines.length ? lines : null,
      duration: Math.max(1, (Number(row.duration) || 0) - (Number(line.duration) || 0) - addons.minutes) })
      .where(eq(appointments.id, appointmentId));
    return { addonIds: addons.addonIds };
  });
}

/**
 * A visit with several services (owner, 2026-10-21). Every service the visit's technician can do goes on ONE
 * ticket — the first service is the ticket's own (with its add-ons and nail options), each further one a service
 * line on it. A service that technician can't do (doesn't perform it, isn't available for it) becomes its own
 * ticket, linked to the visit (ticket_group_id), so checkout takes the visit's tickets together (Group Pay) and
 * each technician's commission is on their own ticket.
 *
 * That ticket waits, with nobody on it, until the client is done with the first technician (owner, 2026-10-21:
 * a technician should not be handed a client who is still in another chair): `waits_for_appointment_id` points at
 * the first ticket, and releaseFollowOnTickets gives it to whoever is next in turn once that ticket's service time
 * is up after START, or it is checked out. Staff can still assign it by hand any time before.
 *
 * A Catalog package (`packageId`) is one item done by one technician: all of its services and add-ons go on the
 * one ticket, with a price line making the ticket come to the package's price, and only a technician who does
 * every one of its services is given it. When TURN decides, someone who can do every service is preferred.
 * Nothing is started.
 */
export async function createNailTicketGroup(
  deps: TicketDeps,
  input: CreateTicketInput & { extraServiceIds: number[] },
): Promise<TicketResult<CreatedTicketGroup>> {
  let base: CreateTicketInput = input;
  let packageName: string | null = null;
  if (input.packageId) {
    let pkg: Awaited<ReturnType<typeof resolvePackageForBooking>>;
    try { pkg = await resolvePackageForBooking(Number(input.packageId), input.storeId); }
    catch { return { ok: false as const, status: 400, message: "That package is no longer in the catalog." }; }
    const packageLines: CustomLine[] = [];
    for (const id of pkg.serviceIds.slice(1)) {
      const line = await serviceLine(input.storeId, id);
      if (!line) return { ok: false as const, status: 400, message: "One of the package's services is no longer in the catalog." };
      packageLines.push(line);
    }
    packageName = pkg.name;
    const difference = Math.round((pkg.price - pkg.listPrice) * 100) / 100;
    if (difference !== 0) packageLines.push({ label: `${pkg.name} package`.slice(0, 60), price: difference, packageId: pkg.packageId });
    base = { ...input, serviceId: pkg.primaryServiceId, packageId: pkg.packageId, packageLines,
      addonIds: [...new Set([...(input.addonIds ?? []), ...pkg.addonIds])] };
  }
  const extraIds = input.extraServiceIds;
  const lines = new Map<number, CustomLine>();
  for (const id of extraIds) {
    const line = await serviceLine(input.storeId, id);
    if (!line) return { ok: false as const, status: 400, message: "One of the services is no longer in the catalog." };
    lines.set(id, line);
  }
  return withTurnLock(input.storeId, async () => {
    const first = await storage.getService(base.serviceId);
    if (!first || first.storeId !== input.storeId) return { ok: false as const, status: 400, message: "One of the services is no longer in the catalog." };
    const turnDecides = input.autoAssign === true && !input.staffId && !input.leaveUnassigned;
    let common: number | null = null;
    const allIds = [base.serviceId, ...(base.packageLines ?? []).filter((l) => l.serviceId).map((l) => l.serviceId!), ...extraIds];
    if (turnDecides && allIds.length > 1) {
      const lists: number[][] = [];
      let turnOn = true;
      for (const id of allIds) {
        const e: any = await deps.getTurnEligibility(input.storeId, id);
        if (e.settings?.turnEnabled === false) turnOn = false;
        lists.push(e.eligibleTechnicians.map((t: any) => Number(t.id)));
      }
      common = turnOn ? commonTechnician(lists) : null;
    }
    const made = await createNailTicketLocked(deps, { ...base, preferStaffId: common });
    if (!made.ok) return made;
    const visitTech = made.data.staffId;
    const names = [packageName ?? first.name];
    const others: CreatedTicketGroup["tickets"] = [];
    for (const id of extraIds) {
      const line = lines.get(id)!;
      // The visit's technician does it when they can; a ticket nobody has yet keeps the whole visit together.
      if (visitTech == null || await technicianCanDo(deps, input.storeId, visitTech, id)) {
        if (!(await appendServiceLine(input.storeId, made.data.appointmentId, line))) {
          return { ok: false as const, status: 409, message: `Ticket #${made.data.ticketNumber} was saved, but ${line.label} could not be added to it.` };
        }
        names.push(line.label);
        continue;
      }
      // Someone else does this service: its own ticket, linked to the visit, waiting for the first one to be done.
      const own = await createNailTicketLocked(deps, {
        storeId: input.storeId, clientId: input.clientId, serviceId: id, bookedByUserId: input.bookedByUserId ?? null,
        startOnAssign: false, idempotencyKey: null, leaveUnassigned: true, visitTicketNumber: made.data.ticketNumber,
      });
      if (!own.ok) return { ok: false as const, status: own.status, message: `Ticket #${made.data.ticketNumber} was saved, but ${line.label} could not be given its own ticket: ${own.message}` };
      await pool.query(`UPDATE appointments SET waits_for_appointment_id = $1 WHERE id = $2 AND store_id = $3`,
        [made.data.appointmentId, own.data.appointmentId, input.storeId]);
      others.push({ ...own.data, serviceId: id, serviceName: line.label });
    }
    if (others.length) {
      await pool.query(`UPDATE appointments SET ticket_group_id = $1 WHERE store_id = $2 AND id = ANY($3::int[])`,
        [made.data.appointmentId, input.storeId, [made.data.appointmentId, ...others.map((t) => t.appointmentId)]]);
    }
    const ticket = { ...made.data, serviceId: base.serviceId, serviceName: names.join(" + ") };
    return { ok: true as const, data: { ...made.data, tickets: [ticket, ...others] } };
  });
}

/**
 * Split Ticket (owner, 2026-10-21): one of a ticket's further services (a service line, by its place among the
 * ticket's lines) comes off it onto a ticket of its own for the same client. That ticket is linked to the visit
 * (ticket_group_id, so checkout takes them together) and waits with nobody on it for this ticket to be done
 * (waits_for_appointment_id; releaseFollowOnTickets then gives it to whoever is next in turn).
 */
export async function splitServiceLine(
  deps: TicketDeps,
  args: { storeId: number; appointmentId: number; index: number; bookedByUserId?: number | null },
): Promise<TicketResult<{ appointmentId: number; ticketNumber: number; serviceName: string }>> {
  const { storeId, appointmentId, index } = args;
  return withTurnLock(storeId, async () => {
    const row = (await pool.query(`SELECT customer_id, status, custom_lines, ticket_group_id, ticket_number FROM appointments WHERE id = $1 AND store_id = $2`,
      [appointmentId, storeId])).rows[0];
    if (!row || !["confirmed", "started"].includes(String(row.status))) return fail(409, "This ticket is no longer open.");
    const line = sanitizeCustomLines(row.custom_lines, true)[index];
    if (!line?.serviceId) return fail(400, "Choose one of the other services on the ticket to split off.");
    if (line.packageId != null) return fail(400, "A package's services stay together.");
    const removed = await removeServiceLine(storeId, appointmentId, index);
    if (!removed) return fail(409, "That service is no longer on this ticket.");
    const own = await createNailTicketLocked(deps, {
      storeId, clientId: row.customer_id != null ? Number(row.customer_id) : null, serviceId: line.serviceId, leaveUnassigned: true, startOnAssign: false,
      idempotencyKey: null, bookedByUserId: args.bookedByUserId ?? null, visitTicketNumber: row.ticket_number != null ? Number(row.ticket_number) : null,
    });
    if (!own.ok) {
      // Put the service back where it was, so nothing is lost.
      await appendServiceLine(storeId, appointmentId, line);
      return fail(own.status, own.message);
    }
    const groupId = row.ticket_group_id != null ? Number(row.ticket_group_id) : appointmentId;
    await pool.query(`UPDATE appointments SET ticket_group_id = $1 WHERE store_id = $2 AND id = ANY($3::int[])`,
      [groupId, storeId, [appointmentId, own.data.appointmentId]]);
    await pool.query(`UPDATE appointments SET waits_for_appointment_id = $1 WHERE id = $2 AND store_id = $3`, [appointmentId, own.data.appointmentId, storeId]);
    // The service's add-ons go with it to its own ticket.
    for (const addonId of removed.addonIds) await addAddonToTicket(storeId, own.data.appointmentId, addonId);
    deps.notify(storeId, { appointmentId, kind: "updated" });
    return { ok: true as const, data: { appointmentId: own.data.appointmentId, ticketNumber: own.data.ticketNumber, serviceName: line.label } };
  });
}

/**
 * A ticket waiting for the visit's first ticket (createNailTicketGroup) is ready once that ticket is done: its
 * technician pressed DONE, or it is checked out (or otherwise closed). It then stops waiting and goes
 * to whoever TURN says is next, is free now and does every service on it; nobody free → it waits unassigned like
 * any other ticket, for the next technician to finish a client (matchWaitingNailTicketForTechnician).
 * Runs on a timer (routes.ts); every server process may run it — each ticket is claimed once.
 */
export async function releaseFollowOnTickets(deps: TicketDeps): Promise<number> {
  const { rows } = await pool.query(
    `SELECT f.id, f.store_id, f.service_id, f.staff_id
       FROM appointments f
       LEFT JOIN appointments p ON p.id = f.waits_for_appointment_id
      WHERE f.waits_for_appointment_id IS NOT NULL
        AND (f.status <> 'confirmed' OR f.staff_id IS NOT NULL OR p.id IS NULL
          OR p.status NOT IN ('confirmed','started')
          OR p.service_done_at IS NOT NULL)
      LIMIT 50`,
  );
  let released = 0;
  for (const r of rows as any[]) {
    const claimed = await pool.query(
      `UPDATE appointments SET waits_for_appointment_id = NULL WHERE id = $1 AND waits_for_appointment_id IS NOT NULL RETURNING id`, [r.id]);
    if (claimed.rowCount === 0) continue;
    released++;
    // Assigned by hand meanwhile, or no longer open: it simply stops waiting.
    if (r.staff_id != null || r.service_id == null) continue;
    const storeId = Number(r.store_id);
    try {
      await withTurnLock(storeId, () => assignReleasedTicket(deps, storeId, Number(r.id), Number(r.service_id)));
    } catch (err: any) {
      console.error("[nail-ticket] follow-on assign failed:", err?.message);
    }
    deps.notify(storeId, { appointmentId: Number(r.id), kind: "updated" });
  }
  return released;
}

async function assignReleasedTicket(deps: TicketDeps, storeId: number, appointmentId: number, serviceId: number,
  /** false: the technician need only do the ticket's own service (the rest is split off afterwards). */ requireAll = true): Promise<void> {
  const row = (await pool.query(`SELECT duration, custom_lines, status, staff_id, customer_id FROM appointments WHERE id = $1 AND store_id = $2`, [appointmentId, storeId])).rows[0];
  if (!row || row.status !== "confirmed" || row.staff_id != null) return;
  // The client is in another chair: it waits, and goes out when that service is done (the queue matcher).
  if ((await clientInServiceTicket(storeId, row.customer_id, appointmentId)) != null) return;
  const eligibility: any = await deps.getTurnEligibility(storeId, serviceId);
  if (eligibility.settings?.turnEnabled === false) return;
  const lineIds = requireAll ? sanitizeCustomLines(row.custom_lines, true).filter((l) => l.serviceId).map((l) => l.serviceId!) : [];
  const buffer = await getBufferMinutes(storeId);
  const now = new Date();
  for (const t of eligibility.eligibleTechnicians ?? []) {
    const staffId = Number(t.id);
    let ok = true;
    for (const id of lineIds) if (!(await techCanDo(staffId, id))) { ok = false; break; }
    if (!ok) continue;
    const slot = nextFreeStart(await busyBlocksFor(storeId, staffId, appointmentId), now, (Number(row.duration) || 0) + buffer);
    if (slot.getTime() - now.getTime() >= 60_000) continue;
    const claimed = await pool.query(`UPDATE appointments SET staff_id = $1 WHERE id = $2 AND store_id = $3 AND staff_id IS NULL AND status = 'confirmed' RETURNING id`,
      [staffId, appointmentId, storeId]);
    if (claimed.rowCount === 0) return;
    await deps.assignAppointmentViaTurn({ storeId, serviceId, appointmentId, requestedStaffId: staffId, writeStaffId: true, consumeTurn: true, source: "nail_follow_on" })
      .catch((e: any) => console.error("[nail-ticket] follow-on turn bookkeeping failed:", e?.message));
    await pool.query(`UPDATE kiosk_checkins SET staff_id = $1, assigned_staff_name = $2 WHERE appointment_id = $3 AND store_id = $4`,
      [staffId, String(t.name ?? ""), appointmentId, storeId]).catch(() => {});
    await lockTech(deps, storeId, staffId).catch((e) => console.error("[nail-ticket] lock failed:", e?.message));
    deps.notify(storeId, { appointmentId, kind: "assigned" });
    return;
  }
}

/**
 * SAVE on a ticket that was being rung up (2026-10-28). It now goes to TURN like any saved ticket: the technician
 * the front desk named, else the next one in turn who is free now — preferring one who does every service on it.
 * Services that technician doesn't do come off onto their own ticket of the visit (same number, paid together),
 * which waits for the next technician in turn. Nobody free: it waits, unassigned, as before.
 */
export async function saveRingingUpTicket(deps: TicketDeps, args: { storeId: number; appointmentId: number; staffId?: number | null }):
  Promise<TicketResult<{ ticketNumber: number | null; staffName: string | null; waiting: boolean; tickets: { appointmentId: number; serviceName: string; staffName: string | null }[] }>> {
  const { storeId, appointmentId } = args;
  // A client the front desk check-in already handed to a technician stays with that technician.
  const held = args.staffId ? null : (await pool.query(`SELECT staff_id FROM kiosk_checkins WHERE appointment_id = $1 AND store_id = $2 AND staff_id IS NOT NULL LIMIT 1`,
    [appointmentId, storeId])).rows[0]?.staff_id;
  if (held != null) args = { ...args, staffId: Number(held) };
  const cleared = await pool.query(`UPDATE appointments SET ringing_up_since = NULL
     WHERE id = $1 AND store_id = $2 AND ringing_up_since IS NOT NULL AND status = 'confirmed' RETURNING service_id`, [appointmentId, storeId]);
  if (cleared.rowCount === 0) {
    const still = (await pool.query(`SELECT status FROM appointments WHERE id = $1 AND store_id = $2`, [appointmentId, storeId])).rows[0];
    if (!still || !["confirmed", "started"].includes(String(still.status))) return fail(409, "This ticket is no longer open.");
    // Saved already (another station, or a retry): answer with how it stands.
  } else if (args.staffId) {
    const r = await reassignNailTicket(deps, { storeId, appointmentId, staffId: args.staffId });
    if (!r.ok) console.warn("[nail-ticket] save: named technician not assigned:", r.message);
  } else {
    const serviceId = Number(cleared.rows[0].service_id);
    await withTurnLock(storeId, async () => {
      await assignReleasedTicket(deps, storeId, appointmentId, serviceId, true);
      await assignReleasedTicket(deps, storeId, appointmentId, serviceId, false);
    });
  }
  const row = (await pool.query(`SELECT a.staff_id, a.custom_lines, a.ticket_number, st.name AS staff_name FROM appointments a
     LEFT JOIN staff st ON st.id = a.staff_id WHERE a.id = $1 AND a.store_id = $2`, [appointmentId, storeId])).rows[0];
  const tech = row?.staff_id != null ? Number(row.staff_id) : null;
  const others: { appointmentId: number; serviceName: string; staffName: string | null }[] = [];
  if (cleared.rowCount && tech != null) {
    const lines = sanitizeCustomLines(row.custom_lines, true);
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i];
      if (!l.serviceId || l.packageId != null || await techCanDo(tech, l.serviceId)) continue;
      const split = await splitServiceLine(deps, { storeId, appointmentId, index: i });
      if (split.ok) others.push({ appointmentId: split.data.appointmentId, serviceName: split.data.serviceName, staffName: null });
    }
  }
  const svc = (await pool.query(`SELECT s.name FROM appointments a JOIN services s ON s.id = a.service_id WHERE a.id = $1`, [appointmentId])).rows[0];
  deps.notify(storeId, { appointmentId, kind: tech != null ? "assigned" : "updated" });
  return { ok: true as const, data: {
    ticketNumber: row?.ticket_number ?? null, staffName: row?.staff_name ?? null, waiting: tech == null,
    tickets: [{ appointmentId, serviceName: String(svc?.name ?? "Service"), staffName: row?.staff_name ?? null }, ...others.reverse()],
  } };
}

/**
 * A retail-only sale with no client (owner, 2026-10-28): products rung up at the POS and paid at once. It is a ticket
 * with no client and no service — only retail lines — recorded under the staff member who sold it (their product
 * commission; it earns and moves nothing in the turn line). It counts as being rung up until it is paid, so closing
 * the checkout unpaid discards it (discardRingingUpTicket).
 */
export async function createRetailSale(storeId: number, staffId: number, raw: unknown): Promise<TicketResult<{ appointmentId: number; ticketNumber: number | null }>> {
  const lines = sanitizeCustomLines(raw).map((l) => ({ label: l.label, price: l.price, isRetail: true as const }));
  if (lines.length === 0) return fail(400, "Ring up at least one retail item.");
  const member = await storage.getStaffMember(staffId);
  if (!member || member.storeId !== storeId) return fail(400, "Sign in with your Tech ID to sell retail.");
  const now = new Date();
  const appt = await storage.createAppointment({
    storeId, staffId, customerId: null, serviceId: null, date: now, duration: 1, status: "confirmed", checkedInAt: now,
    customLines: lines, servicePrice: "0", commissionRate: String((member as any).commissionRate ?? 0), ringingUpSince: now,
  } as any);
  return { ok: true as const, data: { appointmentId: appt.id, ticketNumber: (appt as any).ticketNumber ?? null } };
}

/** CLEAR on a ticket that was being rung up and never saved: it goes away, and its check-in is waiting again. */
export async function discardRingingUpTicket(storeId: number, appointmentId: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const row = (await tx.execute(sql`SELECT id FROM appointments WHERE id = ${appointmentId} AND store_id = ${storeId}
      AND ringing_up_since IS NOT NULL AND status = 'confirmed' FOR UPDATE`)).rows[0];
    if (!row) return false;
    await tx.execute(sql`UPDATE appointments SET status = 'cancelled', cancelled_at = now(), ringing_up_since = NULL,
      cancellation_reason = 'Cleared at the POS before it was saved' WHERE id = ${appointmentId}`);
    await tx.execute(sql`UPDATE kiosk_checkins SET appointment_id = NULL, staff_id = NULL, assigned_staff_name = NULL, status = 'waiting'
      WHERE appointment_id = ${appointmentId} AND store_id = ${storeId}`);
    return true;
  });
}

export async function createNailTicket(deps: TicketDeps, input: CreateTicketInput): Promise<TicketResult<CreatedTicket>> {
  // Choosing the technician, making the ticket and holding them is one protected step per salon.
  return withTurnLock(input.storeId, () => createNailTicketLocked(deps, input));
}

async function createNailTicketLocked(deps: TicketDeps, input: CreateTicketInput): Promise<TicketResult<CreatedTicket>> {
  const { storeId } = input;
  const store = await storage.getStore(storeId);
  if (!store) return fail(404, "Store not found");
  const tz = (store as any).timezone || "UTC";

  // A name-only walk-in has no client record: the name stays on its check-in (kiosk_checkins.client_name).
  let client: Awaited<ReturnType<typeof storage.getCustomer>> | null = null;
  if (input.clientId) {
    client = (await storage.getCustomer(input.clientId)) ?? null;
    if (!client || client.storeId !== storeId) return fail(404, "Client not found");
  } else if (input.checkinId == null && input.visitTicketNumber == null) {
    return fail(400, "Choose a client");
  }

  const service = await storage.getService(input.serviceId);
  if (!service || service.storeId !== storeId || service.isActive === false) return fail(404, "Service not found");

  // The same add-on can be on a ticket more than once (owner, 2026-10-29: two Nail Art – Simple), up to 30 add-ons.
  const addonIds = (input.addonIds ?? []).map(Number).filter(Number.isFinite).slice(0, MAX_TICKET_ADDONS);
  const addons = [];
  for (const id of addonIds) {
    const a = await storage.getAddon(id);
    if (!a || a.storeId !== storeId) return fail(404, "Add-on not found");
    addons.push(a);
  }

  let nailAdj = { priceAdjustment: 0, durationAdjustment: 0 };
  if (hasNail(input.nail)) {
    const problem = await validateNail(service.id, input.nail!);
    if (problem) return fail(400, problem);
    nailAdj = await nailConfig.resolveNailSelection(service.id, input.nail!);
  }

  // A package price line from a tablet (a ticket it saved offline) stays only when it is exactly what the
  // catalog says that package comes to; otherwise the services are charged at catalog price.
  const tabletLines: CustomLine[] = [];
  for (const line of sanitizeCustomLines(input.customLines, true)) {
    if (!line.packageId) { tabletLines.push(line); continue; }
    const pkg = await resolvePackageForBooking(line.packageId, storeId).catch(() => null);
    if (pkg && pkg.primaryServiceId === service.id && Math.round((pkg.price - pkg.listPrice) * 100) / 100 === line.price) tabletLines.push(line);
  }
  const customLines = [...(input.packageLines ?? []), ...tabletLines];
  const pricing = priceTicket({
    serviceDuration: service.duration,
    servicePrice: Number(service.price),
    addons: addons as any,
    nailPriceAdj: nailAdj.priceAdjustment,
    nailDurationAdj: nailAdj.durationAdjustment,
    customPrice: sumCustom(customLines),
    customDuration: customDuration(customLines),
  });
  // Every service on the ticket, so its technician is someone who does all of them.
  const ticketServiceIds = [service.id, ...customLines.filter((l) => l.serviceId).map((l) => l.serviceId!)];
  const canDoAll = async (staffId: number) => {
    for (const id of ticketServiceIds) if (!(await techCanDo(staffId, id))) return false;
    return true;
  };

  // ── Technician ─────────────────────────────────────────────────────────────
  const leaveUnassigned = input.leaveUnassigned === true || input.ringingUp === true;
  const eligibility = leaveUnassigned ? { technicians: [], eligibleTechnicians: [] } : await deps.getTurnEligibility(storeId, service.id);
  const eligibleIds = new Set<number>(eligibility.eligibleTechnicians.map((t: any) => Number(t.id)));

  let staffId: number | null = null;
  let staffName: string | null = null;
  // A technician named on the request is usually the one a check-in was handed to earlier. If they have
  // since clocked out, the client must not be left with someone who is not in the salon: the request is
  // dropped and the ticket goes to whoever TURN says is next, exactly as if nobody had been named.
  const named = input.staffId ? Number(input.staffId) : null;
  const namedIsOut = named != null && !leaveUnassigned && !isClockedIn(eligibility.technicians, named);
  const requested = namedIsOut ? null : named;
  const sameTech = !requested && input.sameTechStaffId ? Number(input.sameTechStaffId) : null;
  const autoAssign = (input.autoAssign === true || namedIsOut) && !leaveUnassigned && !requested && !sameTech;
  if (leaveUnassigned) {
    // Intentionally do not consult or advance TURN. This is only a checked-in ticket.
  } else if (requested) {
    const member = await storage.getStaffMember(requested);
    if (!member || member.storeId !== storeId || ["removed", "deactivated"].includes(String(member.status))) {
      return fail(400, "That technician isn't available.");
    }
    if (!(await canDoAll(requested))) return fail(400, `${member.name} doesn't perform ${ticketServiceIds.length > 1 ? "every service on this ticket" : "this service"}.`);
    staffId = member.id;
    staffName = member.name;
  } else if (sameTech) {
    const member = await storage.getStaffMember(sameTech);
    if (!member || member.storeId !== storeId || !(await techCanDo(sameTech, service.id))) {
      return fail(400, "That technician can't take this service.");
    }
    staffId = member.id;
    staffName = member.name;
  } else {
    // eligibleTechnicians is already TURN order filtered to techs who are in, free and able to do
    // this service — the first one is the next in line who can take it.
    // With the turn system switched off nobody is picked automatically: the ticket waits for staff.
    const preferred = input.preferStaffId != null
      ? eligibility.eligibleTechnicians.find((t: any) => Number(t.id) === Number(input.preferStaffId))
      : undefined;
    // A ticket holding several services (a package's) goes only to someone who does them all.
    let first = eligibility.eligibleTechnicians[0];
    if (!preferred && ticketServiceIds.length > 1) {
      first = undefined;
      for (const t of eligibility.eligibleTechnicians) if (await canDoAll(Number(t.id))) { first = t; break; }
    }
    const next = (eligibility as any).settings?.turnEnabled === false ? undefined : (preferred ?? first);
    if (next) {
      staffId = Number(next.id);
      staffName = String(next.name);
    } else if (!autoAssign) {
      return fail(409, "Every technician is busy or booked. Choose one to line up behind their current client.", {
        technicians: eligibility.technicians,
      });
    }
  }

  // The client is in service on another ticket: TURN doesn't hand this one out yet (it waits unassigned).
  if (autoAssign && staffId != null && client && (await clientInServiceTicket(storeId, client.id)) != null) { staffId = null; staffName = null; }

  // ── When: right now if the tech is free, otherwise right after their current client ──
  const now = new Date();
  let startTime = now;
  let immediate = false;
  let resourceId: number | null = null;
  const startOnAssign = input.startOnAssign === true;
  // Auto-assign only hands a ticket to a tech who can start it right now; anything that stops
  // that (a later booking, no free chair, outside hours) leaves it waiting and unassigned.
  const dropAutoTech = () => { staffId = null; staffName = null; startTime = now; immediate = false; resourceId = null; };
  if (staffId != null) {
    const buffer = await getBufferMinutes(storeId);
    const busy = await busyBlocksFor(storeId, staffId);
    const slot = nextFreeStart(busy, now, pricing.duration + buffer);
    immediate = slot.getTime() - now.getTime() < 60_000;
    startTime = immediate ? now : slot;
    if (autoAssign && !immediate) dropAutoTech();
  }

  // ── Station / chair ────────────────────────────────────────────────────────
  // A ticket is a client standing in the salon, not an appointment: it is never refused or left
  // without its technician because of booking rules (business hours, a closed day, a full chair
  // plan). A free station is noted on it when there is one; otherwise it simply has none.
  const requiredResource = staffId == null ? null : getRequiredResourceType(service.category, service.name);
  if (requiredResource) {
    const r = await autoAssignResource({ storeId, resourceType: requiredResource, date: startTime, duration: pricing.duration });
    if (r.assigned && r.resourceId) resourceId = r.resourceId;
  }

  // A ticket created from a walk-in's check-in marker reuses that marker's already-assigned
  // ticket number (given out at check-in time so the printed slip has one to show — see
  // recordWalkInCheckinMarker in routes.ts) rather than minting a second, different number here.
  // Claim the waiting marker and create its appointment on one DB connection. A stale marker
  // or a different client's marker cannot be reused to mint duplicate printed ticket numbers.
  const offlineNumber = input.checkinId == null && input.ticketNumber && (await storage.claimTicketNumber(storeId, Number(input.ticketNumber)))
    ? Number(input.ticketNumber) : null;
  const creation = await db.transaction(async (tx) => {
    let ticketNumberOverride: number | null = input.visitTicketNumber ?? offlineNumber;
    if (input.checkinId != null) {
      const marker = (await tx.execute(sql`SELECT ticket_number, client_id, status, appointment_id
        FROM kiosk_checkins WHERE id = ${input.checkinId} AND store_id = ${storeId} FOR UPDATE`)).rows[0] as any;
      if (!marker || (marker.client_id == null ? null : Number(marker.client_id)) !== (client?.id ?? null) || marker.appointment_id != null ||
          !["waiting", "called"].includes(String(marker.status))) {
        return { ok: false as const, message: "This check-in was already used or belongs to another client." };
      }
      ticketNumberOverride = marker.ticket_number ?? null;
    }
    const created = await atomicCreateBooking({
      storeId, timezone: tz, startTime,
      durationMinutes: pricing.duration - nailAdj.durationAdjustment,
      staffId, serviceId: service.id, customerId: client?.id ?? null, status: "confirmed",
      notes: input.notes ?? null, checkedInAt: now, clientRequestedStaff: false,
      resourceId, ticketNumberOverride, packageId: input.packageId ?? null,
    }, tx);
    if (!created.ok) return { ok: false as const, message: created.error.message };
    const appointmentId = created.data.id;
    if (input.idempotencyKey) await tx.execute(sql`UPDATE idempotency_keys SET entity_id = ${appointmentId} WHERE store_id = ${storeId} AND key = ${input.idempotencyKey}`);
    if (input.ringingUp) await tx.update(appointments).set({ ringingUpSince: new Date() }).where(eq(appointments.id, appointmentId));
    if (addonIds.length) await tx.insert(appointmentAddons).values(addonIds.map((addonId) => ({ appointmentId, addonId })));
    if (hasNail(input.nail)) await nailConfig.setAppointmentNailSelection(appointmentId, input.nail!, tx);
    if (customLines.length) await tx.update(appointments).set({ customLines }).where(eq(appointments.id, appointmentId));
    // A number given while offline that another ticket already has: the ticket gets a new one, and the one
    // printed on the client's slip is kept so a lookup by it still finds this ticket.
    if (input.checkinId == null && input.ticketNumber && offlineNumber == null) {
      await tx.update(appointments).set({ printedTicketNumber: Number(input.ticketNumber) }).where(eq(appointments.id, appointmentId));
    }
    if (input.checkinId != null && input.ringingUp) {
      // Being rung up: the technician the check-in was handed to (if any) is kept for SAVE.
      await tx.execute(sql`UPDATE kiosk_checkins SET appointment_id = ${appointmentId}, status = 'waiting'
        WHERE id = ${input.checkinId} AND store_id = ${storeId} AND appointment_id IS NULL`);
    } else if (input.checkinId != null) {
      await tx.execute(sql`UPDATE kiosk_checkins SET appointment_id = ${appointmentId}, staff_id = ${staffId},
        assigned_staff_name = ${staffName}, status = ${immediate && startOnAssign ? "serving" : "waiting"}
        WHERE id = ${input.checkinId} AND store_id = ${storeId} AND appointment_id IS NULL`);
    } else if (client) {
      await tx.execute(sql`UPDATE kiosk_checkins SET appointment_id = ${appointmentId}, staff_id = ${staffId},
        assigned_staff_name = ${staffName}, status = ${immediate && startOnAssign ? "serving" : "waiting"}
        WHERE store_id = ${storeId} AND client_id = ${client.id} AND appointment_id IS NULL
          AND status IN ('waiting','called') AND created_at > NOW() - INTERVAL '6 hours'`);
    }
    await tx.execute(sql`UPDATE appointments a SET checked_in_at = k.created_at FROM kiosk_checkins k
      WHERE a.id = ${appointmentId} AND k.appointment_id = a.id AND k.created_at < a.checked_in_at`);
    return { ok: true as const, data: created.data };
  });
  if (!creation.ok) return fail(409, creation.message);
  const { id: appointmentId } = creation.data;

  // TURN bookkeeping — audit row, and the consideration lock when they were eligible.
  if (staffId != null && eligibleIds.has(staffId)) {
    try {
      await deps.assignAppointmentViaTurn({
        storeId,
        serviceId: service.id,
        appointmentId,
        requestedStaffId: requested,
        bookedByUserId: input.bookedByUserId ?? null,
        writeStaffId: true,
        source: "nail_ticket",
      });
    } catch (err: any) {
      console.error("[nail-ticket] turn bookkeeping failed:", err?.message);
    }
  }

  let status: "started" | "confirmed" = "confirmed";
  if (immediate && staffId != null) {
    if (startOnAssign) {
      await storage.updateAppointment(appointmentId, { status: "started", startedAt: now } as any);
      status = "started";
    }
    // Started or not, the technician is held for this client and is not handed another one.
    await lockTech(deps, storeId, staffId).catch((e) => console.error("[nail-ticket] lock failed:", e?.message));
  }

  void pool.query(
    `INSERT INTO appointment_events (store_id, appointment_id, event_type, actor_user_id, metadata)
     VALUES ($1,$2,'created',$3,$4)`,
    [storeId, appointmentId, input.bookedByUserId ?? null, JSON.stringify({ source: "nail_ticket", serviceId: service.id, staffId })],
  ).catch(() => {});

  deps.notify(storeId, { appointmentId, kind: status === "started" ? "started" : "created" });

  return {
    ok: true,
    data: {
      appointmentId,
      ticketNumber: creation.data.ticketNumber,
      staffId,
      staffName,
      status,
      startsAt: startTime.toISOString(),
      duration: pricing.duration,
      price: pricing.price,
      waiting: !immediate,
    },
  };
}

// ── Edit the items on an open ticket ────────────────────────────────────────

export interface UpdateItemsInput {
  storeId: number;
  appointmentId: number;
  serviceId?: number;
  addonIds: number[];
  nail?: NailInput | null;
  customLines?: CustomLine[] | null;
  /** Snapshot from the board; refuse to overwrite a ticket another register has edited. */
  expected: { serviceId: number | null; duration: number; addonIds: number[]; customLines: CustomLine[]; nail: NailInput | null };
}

export async function updateNailTicketItems(deps: TicketDeps, input: UpdateItemsInput): Promise<TicketResult<{ duration: number; price: number }>> {
  const appt = await storage.getAppointment(input.appointmentId);
  if (!appt || appt.storeId !== input.storeId) return fail(404, "Ticket not found");
  if (!["confirmed", "started"].includes(String(appt.status))) return fail(409, "This ticket is already closed.");

  const serviceId = input.serviceId ?? appt.serviceId;
  const service = serviceId ? await storage.getService(serviceId) : undefined;
  if (!service || service.storeId !== input.storeId) return fail(404, "Service not found");

  const addonIds = input.addonIds.map(Number).filter(Number.isFinite).slice(0, MAX_TICKET_ADDONS);
  const addons = [];
  for (const id of addonIds) {
    const a = await storage.getAddon(id);
    if (!a || a.storeId !== input.storeId) return fail(404, "Add-on not found");
    addons.push(a);
  }

  let nailAdj = { priceAdjustment: 0, durationAdjustment: 0 };
  if (hasNail(input.nail)) {
    const problem = await validateNail(service.id, input.nail!);
    if (problem) return fail(400, problem);
    nailAdj = await nailConfig.resolveNailSelection(service.id, input.nail!);
  }

  // A package price line stays only as the server saved it; the tablet can keep it or drop it, never make one.
  const savedPackageLines = sanitizeCustomLines((appt as any).customLines, true).filter((l) => l.packageId);
  const customLines = sanitizeCustomLines(input.customLines, true)
    .filter((l) => !l.packageId || savedPackageLines.some((s) => s.packageId === l.packageId && s.price === l.price));
  const pricing = priceTicket({
    serviceDuration: service.duration,
    servicePrice: Number(service.price),
    addons: addons as any,
    nailPriceAdj: nailAdj.priceAdjustment,
    nailDurationAdj: nailAdj.durationAdjustment,
    customPrice: sumCustom(customLines),
    customDuration: customDuration(customLines),
  });

  // Every write (including the snapshot helper) must use the same connection. A failed
  // snapshot or add-on insert rolls back the whole edit instead of losing the old selection.
  const result = await db.transaction(async (tx) => {
    if (appt.staffId) await tx.execute(sql`SELECT pg_advisory_xact_lock(${input.storeId}::int, ${appt.staffId}::int)`);
    const locked = (await tx.execute(sql`SELECT id, status, service_id, staff_id, date, duration, custom_lines
      FROM appointments WHERE id = ${appt.id} AND store_id = ${input.storeId} FOR UPDATE`)).rows[0] as any;
    if (!locked || !["confirmed", "started"].includes(String(locked.status))) return fail(409, "This ticket is already closed.");
    if (locked.staff_id != null && Number(locked.staff_id) !== appt.staffId) return fail(409, "Technician changed. Reload the ticket.");
    // Adding to a ticket is never refused because it would run into the technician's next booking:
    // the client is already here and the work is being done.
    {
      const currentAddons = await tx.select({ id: appointmentAddons.addonId }).from(appointmentAddons)
        .where(eq(appointmentAddons.appointmentId, appt.id));
      const [currentNail] = await tx.select().from(appointmentNailSelection).where(eq(appointmentNailSelection.appointmentId, appt.id));
      const sameIds = (a: number[], b: number[]) => JSON.stringify([...a].sort((x,y) => x-y)) === JSON.stringify([...b].sort((x,y) => x-y));
      const n = input.expected.nail;
      if (locked.service_id !== input.expected.serviceId || locked.duration !== input.expected.duration ||
          !sameIds(currentAddons.map((a) => a.id), input.expected.addonIds) ||
          JSON.stringify(sanitizeCustomLines(locked.custom_lines, true)) !== JSON.stringify(sanitizeCustomLines(input.expected.customLines, true)) ||
          (currentNail?.nailSizeId ?? null) !== (n?.nailSizeId ?? null) ||
          (currentNail?.nailShapeId ?? null) !== (n?.nailShapeId ?? null) ||
          (currentNail?.nailArtApplicationId ?? null) !== (n?.nailArtApplicationId ?? null) ||
          (currentNail?.nailArtEffectId ?? null) !== (n?.nailArtEffectId ?? null)) return fail(409, "This ticket changed on another register. Reload it before editing.");
    }
    await tx.update(appointments).set({
      serviceId: service.id, duration: pricing.duration - nailAdj.durationAdjustment,
      ...(input.customLines !== undefined ? { customLines: customLines.length ? customLines : null } : {}),
    }).where(and(eq(appointments.id, appt.id), eq(appointments.storeId, input.storeId)));
    // Each add-on keeps the service it was under when that service line is still on the ticket.
    const before = await tx.select({ addonId: appointmentAddons.addonId, lineNo: appointmentAddons.lineNo }).from(appointmentAddons)
      .where(eq(appointmentAddons.appointmentId, appt.id)).orderBy(appointmentAddons.id);
    const finalLines = input.customLines !== undefined ? customLines : sanitizeCustomLines((appt as any).customLines, true);
    const keepLine = (addonId: number): number | null => {
      const i = before.findIndex((b) => b.addonId === addonId);
      if (i < 0) return null;
      const [b] = before.splice(i, 1);
      return b.lineNo != null && finalLines[b.lineNo]?.serviceId ? b.lineNo : null;
    };
    await tx.delete(appointmentAddons).where(eq(appointmentAddons.appointmentId, appt.id));
    if (addonIds.length) await tx.insert(appointmentAddons).values(addonIds.map((addonId) => ({ appointmentId: appt.id, addonId, lineNo: keepLine(addonId) })));
    await tx.delete(appointmentNailSelection).where(eq(appointmentNailSelection.appointmentId, appt.id));
    if (hasNail(input.nail)) await nailConfig.setAppointmentNailSelection(appt.id, input.nail!, tx);
    return { ok: true as const, data: { duration: pricing.duration, price: pricing.price } };
  });

  if (result.ok) deps.notify(input.storeId, { appointmentId: appt.id, kind: "updated" });
  return result;
}

// ── Reassign the technician on an open ticket ───────────────────────────────

export async function reassignNailTicket(
  deps: TicketDeps,
  args: { storeId: number; appointmentId: number; staffId: number; /** Who the ticket was with when this device decided to move it (undefined = not checked). */ expectedStaffId?: number | null; /** Why this technician rather than the next one in line. */ reason?: string | null },
): Promise<TicketResult<{ staffId: number; staffName: string; status: string; startsAt: string }>> {
  const appt = await storage.getAppointment(args.appointmentId);
  if (!appt || appt.storeId !== args.storeId) return fail(404, "Ticket not found");
  if (!["confirmed", "started"].includes(String(appt.status))) return fail(409, "This ticket is already closed.");
  // Decided on a device that had not seen a newer assignment: someone else has given this ticket to a
  // different technician since. Neither choice is overwritten silently — the device is told, and staff decide.
  if (args.expectedStaffId !== undefined && (appt.staffId ?? null) !== (args.expectedStaffId ?? null) && (appt.staffId ?? null) !== args.staffId) {
    const current = appt.staffId ? await storage.getStaffMember(appt.staffId) : null;
    return fail(409, current ? `This ticket was given to ${current.name} on another device.` : "This ticket's technician was changed on another device.");
  }
  if (!appt.serviceId) return fail(400, "This ticket has no service.");
  if (appt.status === "confirmed") {
    const busy = await clientInServiceTicket(args.storeId, appt.customerId, appt.id);
    if (busy != null) return fail(409, inServiceMessage(busy), { code: "CLIENT_IN_SERVICE" });
  }

  const member = await storage.getStaffMember(args.staffId);
  if (!member || member.storeId !== args.storeId || ["removed", "deactivated"].includes(String(member.status))) {
    return fail(400, "That technician isn't available.");
  }
  if (!(await techCanDo(member.id, appt.serviceId))) return fail(400, `${member.name} doesn't perform this service.`);
  // A ticket can only be handed to someone who is in the salon. (Leaving it with the technician it already
  // has is not a hand-over, so that is not refused here.)
  if (member.id !== appt.staffId) {
    const line: any = await deps.getTurnEligibility(args.storeId, appt.serviceId);
    if (!isClockedIn(line.technicians, member.id)) return fail(400, `${member.name} isn't clocked in.`);
    // Where the salon asks for it: giving the client to someone other than the next technician needs a reason.
    const next = line.eligibleTechnicians?.[0];
    if (line.settings?.turnEnabled !== false && line.settings?.turnOverrideReasonRequired === true && next && next.id !== member.id && !String(args.reason ?? "").trim()) {
      return fail(400, `${next.name} is next in line. Say why this client is going to ${member.name}.`, { code: "OVERRIDE_REASON_REQUIRED" });
    }
  }
  const overrideReason = String(args.reason ?? "").trim().slice(0, 200) || null;

  const oldStaffId = appt.staffId ?? null;
  if (oldStaffId === member.id) {
    return { ok: true, data: { staffId: member.id, staffName: member.name, status: String(appt.status), startsAt: new Date(appt.date as any).toISOString() } };
  }

  const duration = appt.duration ?? 60;
  const buffer = await getBufferMinutes(args.storeId);
  const others = await busyBlocksFor(args.storeId, member.id, appt.id);
  let startsAt = new Date(appt.date as any);

  if (appt.status === "started") {
    // Already in the chair — the new technician has to be free for the rest of it.
    const end = startsAt.getTime() + (duration + buffer) * 60_000;
    const clash = others.find((b) => {
      const s = new Date(b.date).getTime();
      return s < end && s + (b.duration ?? 60) * 60_000 > startsAt.getTime();
    });
    if (clash) return fail(409, `${member.name} is busy right now.`);
  } else {
    // Still waiting — line up behind the new technician's current client.
    startsAt = nextFreeStart(others, new Date(), duration + buffer);
    if (startsAt.getTime() - Date.now() < 60_000) startsAt = new Date();
  }

  // First technician on a ticket that was saved unassigned: note a free station/chair on it when there
  // is one. Like creating a ticket, this is never refused by booking rules (hours, closed day, chairs).
  let resourceId: number | null = (appt as any).resourceId ?? null;
  if (oldStaffId == null) {
    const service = await storage.getService(appt.serviceId);
    const requiredResource = service ? getRequiredResourceType(service.category, service.name) : null;
    if (requiredResource && resourceId == null) {
      const r = await autoAssignResource({ storeId: args.storeId, resourceType: requiredResource, date: startsAt, duration });
      if (r.assigned && r.resourceId) resourceId = r.resourceId;
    }
  }

  await storage.updateAppointment(appt.id, { staffId: member.id, date: startsAt, ...(resourceId != null ? { resourceId } : {}) } as any);

  // TURN audit row (and override flag when staff skipped whoever was next up) — the same record a
  // ticket created with a technician writes. Only possible while the tech is eligible (free).
  if (oldStaffId == null) {
    try {
      await deps.assignAppointmentViaTurn({
        storeId: args.storeId, serviceId: appt.serviceId, appointmentId: appt.id,
        requestedStaffId: member.id, writeStaffId: false, source: "nail_assign", overrideReason,
      });
    } catch (err: any) {
      console.error("[nail-ticket] assign turn bookkeeping failed:", err?.message);
    }
  }

  // Moved from one technician to another: the history says who moved it where, and why.
  if (oldStaffId != null) {
    try {
      await deps.recordTurnMove?.({ storeId: args.storeId, appointmentId: appt.id, serviceId: appt.serviceId, staffId: member.id, fromStaffId: oldStaffId, reason: overrideReason });
    } catch (err: any) {
      console.error("[nail-ticket] move history failed:", err?.message);
    }
  }

  // Locks: the old tech gets their turn back (no paid service); the new one is now serving.
  try {
    if (oldStaffId) {
      const stillBusy = await pool.query(
        `SELECT 1 FROM appointments WHERE store_id = $1 AND staff_id = $2 AND id <> $3 AND status = 'started' LIMIT 1`,
        [args.storeId, oldStaffId, appt.id],
      );
      if (stillBusy.rowCount === 0) await unlockTechToFront(deps, args.storeId, oldStaffId);
    }
    if (appt.status === "started" || startsAt.getTime() - Date.now() < 60_000) await lockTech(deps, args.storeId, member.id);
  } catch (err: any) {
    console.error("[nail-ticket] reassign lock update failed:", err?.message);
  }

  void pool.query(
    `INSERT INTO appointment_events (store_id, appointment_id, event_type, metadata) VALUES ($1,$2,'updated',$3)`,
    [args.storeId, appt.id, JSON.stringify({ reassignedFrom: oldStaffId, reassignedTo: member.id })],
  ).catch(() => {});

  deps.notify(args.storeId, { appointmentId: appt.id, kind: "updated" });
  return { ok: true, data: { staffId: member.id, staffName: member.name, status: String(appt.status), startsAt: startsAt.toISOString() } };
}

// ── Board: everyone who is here right now ───────────────────────────────────

export interface BoardTicket {
  id: number;
  ticketNumber: number | null;
  /** Being rung up on a POS and not saved yet (2026-10-28): nobody has it, TURN doesn't see it. */
  ringingUp?: boolean;
  /** A ticket waiting for the visit's first ticket to be done (createNailTicketGroup): that ticket's number. */
  waitsForTicket?: number;
  /** The technician pressed DONE: the service is finished and they are free; the ticket waits to be paid. */
  doneAt?: string;
  /** When the ticket was given to its technician (migration 0265). */
  staffAssignedAt?: string;
  /** When ringing up began (not saved yet). */
  ringingUpSince?: string;
  /** Why this waiting ticket hasn't started, when that needs watching (boardWaitReasons). */
  wait?: BoardWait;
  /** How long the service really took, START to DONE (migration 0253). */
  actualMinutes?: number;
  status: "confirmed" | "started";
  date: string;
  checkedInAt: string | null;
  startedAt: string | null;
  duration: number;
  client: { id: number | null; name: string; phone: string | null; loyaltyPoints: number };
  service: { id: number | null; name: string; price: number };
  /** lineNo: the service line it goes under (custom_lines index); absent = the ticket's own service. */
  addons: { id: number; name: string; price: number; duration: number; lineNo?: number }[];
  nail: {
    sizeId: number | null; shapeId: number | null; applicationId: number | null; effectId: number | null;
    priceAdjustment: number;
    /** What the nail choices add to the bill, one line each — becomes checkout lines. */
    lines: { label: string; price: number }[];
  } | null;
  /** Keypad "Custom Amount" lines, become extra lines at checkout. */
  customLines: CustomLine[];
  staff: { id: number; name: string; color: string | null } | null;
  total: number;
  /** Made at the desk (a walk-in), not an advance booking: only walk-ins count in the turn rotation. */
  walkIn: boolean;
}

/**
 * Why a waiting ticket hasn't started (owner, 2026-10-29: catch tickets that sit, and say why). `since` is when the
 * clock for this reason began; the card turns orange `orangeMin` after it and red `redMin` after it.
 *   tech_free       its technician is free but hasn't started it
 *   clocked_out     its technician isn't clocked in
 *   running_over    its technician is still on another client, past that service's time (ticket = that number)
 *   not_saved       being rung up and never saved
 *   unassigned_free nobody has it although a technician is free
 *   long_wait       nobody has it and every technician is busy (a normal wait, flagged only when long)
 * In the chair (so a client doesn't leave without paying):
 *   service_over    started, DONE not pressed, past the service's scheduled time (since = start + its minutes)
 *   done_unpaid     DONE pressed but not paid (since = DONE)
 */
export interface BoardWait {
  code: "tech_free" | "clocked_out" | "running_over" | "not_saved" | "unassigned_free" | "long_wait" | "service_over" | "done_unpaid";
  since: string;
  orangeMin: number;
  redMin: number;
  ticket?: number;
}
/** The minutes for each reason. One place, so the salon's thresholds are easy to change. */
export const WAIT_LIMITS: Record<BoardWait["code"], [number, number]> = {
  tech_free: [5, 10], clocked_out: [0, 0], running_over: [10, 20], not_saved: [5, 10], unassigned_free: [5, 10], long_wait: [30, 45],
  service_over: [15, 30], done_unpaid: [10, 20],
};
/** Same padding the queue's chair countdown uses: a service is "over" this long after its booked time. */
const SERVICE_PADDING_MIN = 15;

export interface BoardWaitingMarker {
  id: number;
  /** Number printed beside the marker's QR code and accepted by manual ticket lookup. */
  ticketNumber: number | null;
  clientId: number | null;
  clientName: string | null;
  phone: string | null;
  createdAt: string;
  /** The technician / barber this client has been given before any ticket exists (null = still waiting). */
  staffId: number | null;
  staffName: string | null;
  /** What the client said they came for at the front desk (a catalog category), when they said. */
  requestedCategory: string | null;
  /** The catalog category id behind requestedCategory, so the POS can open its grid there. */
  requestedCategoryId: number | null;
  /** Why this client is still waiting, when that needs watching (see BoardWait). */
  wait?: BoardWait;
}

export interface BoardDayBooking {
  id: number;
  ticketNumber: number | null;
  date: string;
  duration: number;
  status: string;
  clientName: string;
  serviceName: string;
  staffName: string | null;
  /** True for desk-created tickets and kiosk-only check-ins; false for advance bookings. */
  isWalkIn: boolean;
  /** When a walk-in arrived (kiosk check-in, or the ticket being made at the desk). `date` moves to the start
   *  time once the service starts, so it can't say when they came in. */
  arrivedAt?: string;
  /** When a completed visit finished (checked out). Absent for a visit that isn't completed, or one completed
   *  before every checkout path recorded the time. */
  completedAt?: string;
}

/** Per-technician numbers for the Techs tab. */
export interface TechDayStats {
  staffId: number;
  /** Clients checked out today. */
  doneToday: number;
  /** When their last client today was finished (null = none yet). */
  lastFinishedAt: string | null;
  /** When they clocked in today (null = not clocked in). */
  clockedInAt: string | null;
}

/** Today's numbers for the Techs page header ("Salon at a glance"). */
export interface SalonGlance {
  /** Pre-booked appointments today that are still to come: pending or confirmed, not checked in (the same rule as
   *  getNailUpcoming, limited to today). Arrived, finished and no-show visits are counted by their own tiles. */
  appointments: number;
  /** Clients who walked in today: tickets made at the desk + kiosk check-ins that never got a ticket. */
  walkIns: number;
  noShows: number;
  completed: number;
  /** Average sale before tip, over tickets checked out today. */
  avgTicket: number | null;
}

/**
 * The booked visits still to come — today's that have not arrived yet, then the coming days' — for the
 * Queue tab's Appointments list. Walk-ins are never on it (they are here already), nor is anyone who has
 * checked in (their ticket is on the client cards).
 */
export async function getNailUpcoming(storeId: number): Promise<BoardDayBooking[]> {
  const store = await storage.getStore(storeId);
  const tz = (store as any)?.timezone || "UTC";
  const { rows } = await pool.query(
    `SELECT a.id, a.ticket_number, a.date, COALESCE(a.duration, 0) AS duration, a.status::text AS status,
            COALESCE(c.full_name, 'Guest') AS client_name,
            COALESCE(s.name, 'Service') AS service_name,
            st.name AS staff_name
       FROM appointments a
       LEFT JOIN clients c ON c.id = a.customer_id
       LEFT JOIN services s ON s.id = a.service_id
       LEFT JOIN staff st ON st.id = a.staff_id
      WHERE a.store_id = $1
        AND a.status::text IN ('pending', 'confirmed')
        AND a.checked_in_at IS NULL
        AND ${bizDayOf("a.date")} >= ${BIZ_TODAY}
        AND a.date < NOW() + INTERVAL '90 days'
        AND NOT ${walkInSQL("a")}
      ORDER BY a.date ASC, a.id ASC
      LIMIT 300`,
    [storeId, tz],
  );
  return rows.map((r: any) => ({
    id: r.id,
    ticketNumber: r.ticket_number ?? null,
    date: new Date(r.date).toISOString(),
    duration: Number(r.duration) || 0,
    status: r.status,
    clientName: r.client_name,
    serviceName: r.service_name,
    staffName: r.staff_name ?? null,
    isWalkIn: false,
  }));
}

/**
 * Fills in `wait` on every waiting ticket and check-in that needs watching (see BoardWait): why it hasn't started,
 * and since when. A normal wait — the client is in a chair on another ticket, or the visit's first service isn't
 * done — gets nothing.
 */
export function boardWaitReasons(tickets: BoardTicket[], markers: BoardWaitingMarker[], stats: Map<number, TechDayStats>, turnTakers: Set<number>): void {
  const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);
  const latest = (...xs: number[]) => Math.max(...xs.filter((x) => Number.isFinite(x)));
  const wait = (code: BoardWait["code"], sinceMs: number, ticket?: number): BoardWait | undefined =>
    Number.isFinite(sinceMs) ? { code, since: new Date(sinceMs).toISOString(), orangeMin: WAIT_LIMITS[code][0], redMin: WAIT_LIMITS[code][1], ...(ticket != null ? { ticket } : {}) } : undefined;
  const inChair = (staffId: number) => tickets.find((t) => t.status === "started" && !t.doneAt && t.staff?.id === staffId);
  const clockedIn = (staffId: number) => !!stats.get(staffId)?.clockedInAt;
  const freeSince = (staffId: number) => latest(ms(stats.get(staffId)?.clockedInAt), ms(stats.get(staffId)?.lastFinishedAt),
    ...tickets.filter((t) => t.staff?.id === staffId && t.doneAt).map((t) => ms(t.doneAt)));
  // Technicians who take turns, are clocked in and not with a client.
  const free = [...stats.values()].filter((e) => e.clockedInAt && turnTakers.has(e.staffId) && !inChair(e.staffId)).map((e) => e.staffId);
  const clientInChair = new Set(tickets.filter((t) => t.status === "started" && !t.doneAt && t.client.id != null).map((t) => t.client.id));

  const forStaff = (staffId: number, givenAt: number): BoardWait | undefined => {
    if (!clockedIn(staffId)) return wait("clocked_out", givenAt);
    const busy = inChair(staffId);
    if (busy) {
      const end = ms(busy.startedAt) + ((Number(busy.duration) || 0) + SERVICE_PADDING_MIN) * 60_000;
      return wait("running_over", end, busy.ticketNumber ?? undefined);
    }
    return wait("tech_free", latest(givenAt, freeSince(staffId)));
  };
  const forNobody = (arrived: number): BoardWait | undefined => free.length
    ? wait("unassigned_free", latest(arrived, Math.min(...free.map(freeSince).filter((x) => Number.isFinite(x)))))
    : wait("long_wait", arrived);

  // A visit split between technicians is paid once, when every part is done (owner, 2026-10-29: the first tech's DONE
  // part went red while the second was still working). So "DONE, not paid" starts when the visit's LAST part is done;
  // until then a DONE part is simply waiting for the rest of its visit.
  const groupOf = (t: BoardTicket) => ((t as any).groupId as number | null | undefined) ?? null;
  const visitDoneAt = (t: BoardTicket): number => {
    const g = groupOf(t);
    if (g == null) return ms(t.doneAt);
    const parts = tickets.filter((x) => groupOf(x) === g);
    if (parts.some((x) => !x.doneAt)) return NaN; // another part still waiting or in the chair
    return latest(...parts.map((x) => ms(x.doneAt)));
  };
  for (const t of tickets) {
    if (t.status === "started") {
      t.wait = t.doneAt ? wait("done_unpaid", visitDoneAt(t))
        : wait("service_over", ms(t.startedAt) + (Number(t.duration) || 0) * 60_000);
      continue;
    }
    if (t.status !== "confirmed" || t.waitsForTicket != null) continue;
    if (t.client.id != null && clientInChair.has(t.client.id)) continue;
    const arrived = ms(t.checkedInAt ?? t.date);
    t.wait = t.ringingUp ? wait("not_saved", ms(t.ringingUpSince ?? t.checkedInAt ?? t.date))
      : t.staff ? forStaff(t.staff.id, latest(arrived, ms(t.staffAssignedAt)))
      : forNobody(arrived);
  }
  for (const m of markers) {
    const arrived = ms(m.createdAt);
    m.wait = m.staffId != null ? forStaff(m.staffId, arrived) : forNobody(arrived);
  }
}

export async function getNailBoard(storeId: number): Promise<{ tickets: BoardTicket[]; markers: BoardWaitingMarker[]; dayBookings: BoardDayBooking[]; techStats: TechDayStats[]; glance: SalonGlance; now: string; nextTicketNumber: number | null }> {
  const store = await storage.getStore(storeId);
  const tz = (store as any)?.timezone || "UTC";
  // Day Close starts a new operational shift for the board's shift-level counts and bookings.
  const shiftStart = await getLastDayCloseAt(storeId);

  const { rows } = await pool.query(
    `SELECT a.id, a.ticket_number, a.ticket_group_id, a.status, a.ringing_up_since,
            (SELECT w.ticket_number FROM appointments w WHERE w.id = a.waits_for_appointment_id) AS waits_for_number, a.service_done_at, a.actual_minutes, a.date, a.duration, a.checked_in_at, a.started_at, a.staff_id,
            ${walkInSQL("a")} AS walk_in, a.customer_id, a.custom_lines, c.full_name AS client_name, COALESCE(c.loyalty_points, 0) AS loyalty_points,
            (SELECT COALESCE(p.display_phone, p.phone_number_e164) FROM client_phones p
               WHERE p.client_id = c.id ORDER BY p.is_primary DESC, p.id LIMIT 1) AS client_phone,
            -- A ticket made at the kiosk with no client record linked still has the name/number
            -- the client typed on their check-in — show that rather than "Walk-in".
            k.client_name AS checkin_name, k.phone AS checkin_phone,
            a.service_id, s.name AS service_name, COALESCE(s.price, 0) AS service_price,
            st.name AS staff_name, st.color AS staff_color,
            COALESCE(ad.items, '[]'::json) AS addons,
            ns.length_name_snapshot, ns.shape_name_snapshot, ns.art_application_name_snapshot, ns.art_effect_name_snapshot,
            COALESCE(ns.length_price_adj_snapshot, 0) AS length_adj, COALESCE(ns.shape_price_adj_snapshot, 0) AS shape_adj,
            COALESCE(ns.art_price_adj_snapshot, 0) AS art_adj,
            ns.nail_size_id, ns.nail_shape_id, ns.nail_art_application_id, ns.nail_art_effect_id,
            ns.id AS nail_id, a.staff_assigned_at
       FROM appointments a
       LEFT JOIN clients  c  ON c.id  = a.customer_id
       LEFT JOIN services s  ON s.id  = a.service_id
       LEFT JOIN staff    st ON st.id = a.staff_id
       LEFT JOIN appointment_nail_selection ns ON ns.appointment_id = a.id
       LEFT JOIN LATERAL (
         -- A ticket with no client (a walk-in by name only) takes its name from its check-in, or from the check-in of
         -- another ticket of the same visit (a service another technician does).
         SELECT kc.client_name, kc.phone FROM kiosk_checkins kc
          WHERE kc.store_id = a.store_id AND (kc.appointment_id = a.id OR (a.ticket_group_id IS NOT NULL AND kc.appointment_id IN
                (SELECT g.id FROM appointments g WHERE g.store_id = a.store_id AND g.ticket_group_id = a.ticket_group_id)))
          ORDER BY (kc.appointment_id = a.id) DESC, kc.id DESC LIMIT 1
       ) k ON a.customer_id IS NULL
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object('id', d.id, 'name', d.name, 'price', d.price, 'duration', d.duration, 'lineNo', aa.line_no) ORDER BY aa.id) AS items
           FROM appointment_addons aa JOIN addons d ON d.id = aa.addon_id
          WHERE aa.appointment_id = a.id
       ) ad ON true
      WHERE a.store_id = $1
        AND (a.status = 'started' OR (a.status = 'confirmed' AND a.checked_in_at IS NOT NULL))
        AND (a.status = 'started' OR ${bizDayOf("a.date")} >= (${BIZ_TODAY} - 1))
      ORDER BY COALESCE(a.checked_in_at, a.date) ASC`,
    [storeId, tz],
  );

  const tickets: BoardTicket[] = rows.map((r: any) => {
    const addons = (r.addons ?? []).map((x: any) => ({ id: x.id, name: x.name, price: Number(x.price) || 0, duration: Number(x.duration) || 0,
      ...(x.lineNo != null ? { lineNo: Number(x.lineNo) } : {}) }));
    const nailLines: { label: string; price: number }[] = [];
    if (r.nail_id) {
      if (r.length_name_snapshot) nailLines.push({ label: `Length: ${r.length_name_snapshot}`, price: Number(r.length_adj) || 0 });
      if (r.shape_name_snapshot) nailLines.push({ label: `Shape: ${r.shape_name_snapshot}`, price: Number(r.shape_adj) || 0 });
      const art = [r.art_application_name_snapshot, r.art_effect_name_snapshot].filter(Boolean).join(" · ");
      if (art) nailLines.push({ label: `Art: ${art}`, price: Number(r.art_adj) || 0 });
    }
    const nailAdj = nailLines.reduce((sum, l) => sum + l.price, 0);
    const customLines = sanitizeCustomLines(r.custom_lines, true);
    return {
      id: r.id,
      ticketNumber: r.ticket_number ?? null,
      groupId: r.ticket_group_id ?? null,
      ...(r.ringing_up_since ? { ringingUp: true } : {}),
      ...(r.waits_for_number != null ? { waitsForTicket: Number(r.waits_for_number) } : {}),
      ...(r.service_done_at ? { doneAt: new Date(r.service_done_at).toISOString() } : {}),
      ...(r.staff_assigned_at ? { staffAssignedAt: new Date(r.staff_assigned_at).toISOString() } : {}),
      ...(r.ringing_up_since ? { ringingUpSince: new Date(r.ringing_up_since).toISOString() } : {}),
      ...(r.actual_minutes != null ? { actualMinutes: Number(r.actual_minutes) } : {}),
      status: r.status,
      date: new Date(r.date).toISOString(),
      checkedInAt: r.checked_in_at ? new Date(r.checked_in_at).toISOString() : null,
      startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
      duration: r.duration ?? 0,
      client: { id: r.customer_id ?? null, name: r.client_name ?? r.checkin_name ?? "Walk-in", phone: r.client_phone ?? r.checkin_phone ?? null, loyaltyPoints: Number(r.loyalty_points) || 0 },
      service: { id: r.service_id ?? null, name: r.service_name ?? (r.service_id == null ? "Retail sale" : "Service"), price: Number(r.service_price) || 0 },
      addons,
      nail: r.nail_id
        ? {
            sizeId: r.nail_size_id ?? null, shapeId: r.nail_shape_id ?? null,
            applicationId: r.nail_art_application_id ?? null, effectId: r.nail_art_effect_id ?? null,
            priceAdjustment: nailAdj, lines: nailLines,
          }
        : null,
      customLines,
      staff: r.staff_id ? { id: r.staff_id, name: r.staff_name, color: r.staff_color ?? null } : null,
      total: (Number(r.service_price) || 0) + addons.reduce((s: number, a: any) => s + a.price, 0) + nailAdj + sumCustom(customLines),
      walkIn: r.walk_in === true,
    };
  });

  // Kiosk check-ins that don't have a ticket yet (phone not recognised, etc.).
  const markerRows = await pool.query(
    `SELECT id, ticket_number, client_id, client_name, phone, created_at, status, staff_id, assigned_staff_name, requested_category, requested_category_id FROM kiosk_checkins
      WHERE store_id = $1 AND appointment_id IS NULL AND status IN ('waiting','called')
        AND created_at > NOW() - INTERVAL '${CHECKIN_MARKER_HOURS} hours'
      ORDER BY created_at ASC`,
    [storeId],
  );
  const markers: BoardWaitingMarker[] = markerRows.rows.map((m: any) => ({
    id: m.id, ticketNumber: m.ticket_number ?? null, clientId: m.client_id ?? null, clientName: m.client_name ?? null, phone: m.phone ?? null, createdAt: new Date(m.created_at).toISOString(),
    // Only a marker a barber has taken ('called'); a kiosk's requested-stylist hint on a waiting marker is not an assignment.
    staffId: m.status === "called" && m.staff_id != null ? Number(m.staff_id) : null,
    staffName: m.status === "called" ? m.assigned_staff_name ?? null : null,
    requestedCategory: m.requested_category ?? null,
    requestedCategoryId: m.requested_category_id != null ? Number(m.requested_category_id) : null,
  }));

  // Every customer record represented by the four detail tiles. Keep the walk-in classification on
  // each row so Appointments, Walk-ins, No-shows and Completed can all render real cards from this
  // one payload. Kiosk-only check-ins are included as synthetic negative ids until they get tickets.
  const dayBookingRows = await pool.query(
    `SELECT * FROM (
       SELECT a.id, a.ticket_number, a.date, COALESCE(a.duration, 0) AS duration, a.status::text AS status,
              COALESCE(c.full_name, 'Guest') AS client_name,
              COALESCE(s.name, 'Service') AS service_name,
              st.name AS staff_name,
              ${walkInSQL("a")} AS is_walk_in,
              COALESCE(a.checked_in_at, a.created_at AT TIME ZONE 'UTC') AS arrived_at,
              a.completed_at
         FROM appointments a
         LEFT JOIN clients c ON c.id = a.customer_id
         LEFT JOIN services s ON s.id = a.service_id
         LEFT JOIN staff st ON st.id = a.staff_id
        WHERE a.store_id = $1
          AND ${bizDayOf("a.date")} = ${BIZ_TODAY}
          AND ${boardAfterCloseSQL("a")}
          AND a.status <> 'cancelled'
       UNION ALL
       SELECT -k.id AS id, k.ticket_number, k.created_at AS date, 0 AS duration, k.status::text AS status,
              COALESCE(k.client_name, 'Walk-in') AS client_name,
              'Service not selected' AS service_name,
              NULL::text AS staff_name,
              TRUE AS is_walk_in,
              k.created_at AS arrived_at,
              NULL::timestamptz AS completed_at
         FROM kiosk_checkins k
        WHERE k.store_id = $1
          AND k.appointment_id IS NULL
          AND k.status <> 'removed'
          AND ${bizDayOf("k.created_at")} = ${BIZ_TODAY}
          AND ($3::timestamptz IS NULL OR k.created_at > $3::timestamptz)
     ) detail_rows
     ORDER BY date ASC`,
    [storeId, tz, shiftStart],
  );
  const dayBookings: BoardDayBooking[] = dayBookingRows.rows.map((r: any) => ({
    id: r.id,
    ticketNumber: r.ticket_number ?? null,
    date: new Date(r.date).toISOString(),
    duration: Number(r.duration) || 0,
    status: r.status,
    clientName: r.client_name,
    serviceName: r.service_name,
    staffName: r.staff_name ?? null,
    isWalkIn: r.is_walk_in === true,
    ...(r.is_walk_in === true && r.arrived_at ? { arrivedAt: new Date(r.arrived_at).toISOString() } : {}),
    ...(r.status === "completed" && r.completed_at ? { completedAt: new Date(r.completed_at).toISOString() } : {}),
  }));

  // Who did how much today, and since when each technician has been free.
  const doneRows = await pool.query(
    `SELECT a.staff_id, COUNT(*)::int AS done,
            MAX(COALESCE(a.completed_at, a.date + make_interval(mins => COALESCE(a.duration, 0)))) AS last_finished
       FROM appointments a
      WHERE a.store_id = $1 AND a.status = 'completed' AND a.staff_id IS NOT NULL
        AND ${bizDayOf("a.date")} = ${BIZ_TODAY}
        AND ($3::timestamptz IS NULL OR a.completed_at > $3::timestamptz)
      GROUP BY a.staff_id`,
    [storeId, tz, shiftStart],
  );
  const clockRows = await pool.query(
    `SELECT staff_id, MAX(clock_in) AS clock_in FROM timeclock
      WHERE store_id = $1 AND clock_out IS NULL AND work_date = to_char(NOW() AT TIME ZONE $2, 'YYYY-MM-DD')
      GROUP BY staff_id`,
    [storeId, tz],
  );
  const stats = new Map<number, TechDayStats>();
  const entry = (id: number) => {
    let e = stats.get(id);
    if (!e) { e = { staffId: id, doneToday: 0, lastFinishedAt: null, clockedInAt: null }; stats.set(id, e); }
    return e;
  };
  for (const r of doneRows.rows) {
    const e = entry(r.staff_id);
    e.doneToday = Number(r.done) || 0;
    e.lastFinishedAt = r.last_finished ? new Date(r.last_finished).toISOString() : null;
  }
  for (const r of clockRows.rows) entry(r.staff_id).clockedInAt = r.clock_in ? new Date(r.clock_in).toISOString() : null;

  // Salon at a glance. "Walk-in" = a ticket made at the desk (nail ticket, or created within 15 min of its time /
  // of the client checking in); everything booked earlier is an appointment.
  const g = await pool.query(
    `WITH t AS (
       SELECT a.*,
              ${walkInSQL("a")} AS walkin
         FROM appointments a
        WHERE a.store_id = $1 AND ${bizDayOf("a.date")} = ${BIZ_TODAY}
          AND ${boardAfterCloseSQL("a")}
     )
      SELECT COUNT(*) FILTER (WHERE status::text IN ('pending', 'confirmed') AND checked_in_at IS NULL AND NOT walkin)::int AS appointments,
             COUNT(*) FILTER (WHERE status <> 'cancelled' AND walkin)::int AS walkins,
             COUNT(*) FILTER (WHERE status IN ('no_show', 'no-show'))::int AS no_shows,
             COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
       FROM t`,
    [storeId, tz, shiftStart],
  );
  // Average Ticket starts at Day Close; ordinary drawer closes do not end the operating day.
  const avgTicketRow = await pool.query(
    `SELECT AVG(a.total_paid - COALESCE(a.tip_amount, 0)) AS avg_ticket
       FROM appointments a
      WHERE a.store_id = $1
        AND ($3::timestamptz IS NOT NULL OR ${bizDayOf("a.date")} = ${BIZ_TODAY})
        AND ${boardAfterCloseSQL("a")}
        AND a.status = 'completed' AND a.total_paid IS NOT NULL`,
    [storeId, tz, shiftStart],
  );
  const kioskOnly = await pool.query(
    `SELECT COUNT(*)::int AS n FROM kiosk_checkins
      WHERE store_id = $1 AND appointment_id IS NULL AND status <> 'removed' AND ${bizDayOf("created_at")} = ${BIZ_TODAY}
        AND ($3::timestamptz IS NULL OR created_at > $3::timestamptz)`,
    [storeId, tz, shiftStart],
  );
  const gr = g.rows[0] ?? {};
  const glance: SalonGlance = {
    appointments: Number(gr.appointments) || 0,
    walkIns: (Number(gr.walkins) || 0) + (Number(kioskOnly.rows[0]?.n) || 0),
    noShows: Number(gr.no_shows) || 0,
    completed: Number(gr.completed) || 0,
    avgTicket: avgTicketRow.rows[0]?.avg_ticket != null ? Math.round(Number(avgTicketRow.rows[0].avg_ticket) * 100) / 100 : null,
  };

  // `now` lets every POS station measure "waiting 12 min" against the SERVER clock, so two tablets with different clocks agree.
  // The next ticket number the store will give out, so a tablet can keep numbering if it goes offline.
  const counter = await pool.query(`SELECT next_ticket_number FROM locations WHERE id = $1`, [storeId]);
  const nextTicketNumber = counter.rows[0]?.next_ticket_number != null ? Number(counter.rows[0].next_ticket_number) : null;
  const turnTakers = await pool.query(`SELECT id FROM staff WHERE store_id = $1 AND takes_turns`, [storeId]).catch(() => ({ rows: [] as any[] }));
  boardWaitReasons(tickets, markers, stats, new Set(turnTakers.rows.map((r: any) => Number(r.id))));
  return { tickets, markers, dayBookings, techStats: [...stats.values()], glance, now: new Date().toISOString(), nextTicketNumber };
}

// ── Barbershop (/barber): Barber ID sign-in and taking a waiting client before any ticket exists ──

/** Receptionists sign in with 90–99; technicians and barbers with 1–89. The same rule for every salon. */
export const FRONT_DESK_ID_MIN = 90;
export function isFrontDeskId(barberNumber: number): boolean {
  return barberNumber >= FRONT_DESK_ID_MIN && barberNumber <= 99;
}

/**
 * The salon owner's own staff record (employment_type "owner"), so the owner has a Tech ID too (owner,
 * 2026-10-31; migration 0275 did the same for existing salons). In this order:
 *   1. the staff record the owner's login is linked to (users.staff_id) is already theirs,
 *   2. else the record sign-up made for them (named "Owner") or one with the owner's own name is marked owner
 *      and keeps working as before,
 *   3. else a new one: role "Owner", hidden from the calendar and the booking page, not in the turn line,
 *      no commission.
 * At most one per salon (unique index staff_one_owner_per_store). Idempotent and cheap once done.
 */
export async function ensureOwnerStaff(storeId: number): Promise<void> {
  const hasOwner = `EXISTS (SELECT 1 FROM staff x WHERE x.store_id = l.id AND COALESCE(x.status, 'active') NOT IN ('removed', 'deactivated')
                      AND (x.employment_type = 'owner' OR x.id = u.staff_id))`;
  const marked = await pool.query(
    `UPDATE staff s SET employment_type = 'owner'
       FROM (SELECT st.id FROM locations l JOIN users u ON u.id = l.user_id
               JOIN staff st ON st.store_id = l.id AND COALESCE(st.status, 'active') NOT IN ('removed', 'deactivated')
              WHERE l.id = $1 AND NOT ${hasOwner}
                AND (lower(trim(st.name)) = 'owner' OR lower(trim(st.name)) = lower(trim(CONCAT_WS(' ', u.first_name, u.last_name))))
              ORDER BY st.id LIMIT 1) pick
      WHERE s.id = pick.id`,
    [storeId],
  ).catch(() => ({ rowCount: 0 }));
  if (marked.rowCount) return;
  await pool.query(
    `INSERT INTO staff (name, role, store_id, status, employment_type, show_on_calendar, takes_turns, front_desk, commission_enabled)
     SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), 'Owner'), 'Owner', l.id, 'active', 'owner', false, false, false, false
       FROM locations l JOIN users u ON u.id = l.user_id
      WHERE l.id = $1 AND NOT ${hasOwner}
     ON CONFLICT DO NOTHING`,
    [storeId],
  );
}

/**
 * Give every active staff member of the store an ID: the lowest free number in their range — 90–99 for
 * receptionists (staff.front_desk), 1–89 for everyone else. Someone whose number is in the wrong range
 * (they were just made, or unmade, a receptionist) is renumbered. Idempotent.
 */
export async function ensureBarberNumbers(storeId: number): Promise<void> {
  await ensureOwnerStaff(storeId);
  await pool.query(
    `UPDATE staff SET barber_number = NULL
      WHERE store_id = $1 AND barber_number IS NOT NULL AND front_desk <> (barber_number >= ${FRONT_DESK_ID_MIN})`,
    [storeId],
  );
  for (const [frontDesk, lo, hi] of [[false, 1, FRONT_DESK_ID_MIN - 1], [true, FRONT_DESK_ID_MIN, 99]] as const) {
    await pool.query(
      `WITH free AS (
         SELECT n, ROW_NUMBER() OVER (ORDER BY n) AS rn FROM generate_series($2::int, $3::int) AS n
          WHERE n NOT IN (SELECT barber_number FROM staff WHERE store_id = $1 AND barber_number IS NOT NULL)
       ), need AS (
         SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM staff
          WHERE store_id = $1 AND barber_number IS NULL AND front_desk = $4
            AND COALESCE(status, 'active') NOT IN ('removed', 'deactivated')
       )
       UPDATE staff s SET barber_number = free.n FROM need JOIN free USING (rn) WHERE s.id = need.id`,
      [storeId, lo, hi, frontDesk],
    );
  }
}

export interface BarberSignIn {
  staff: { id: number; name: string; color: string | null; barberNumber: number; frontDesk: boolean };
  /** The client this barber took and has not rung up yet — the POS goes straight to them. */
  activeMarker: { id: number; clientId: number | null; clientName: string | null } | null;
  /** A ticket of theirs already in service (made another way) — the POS goes straight to its checkout.
   *  With `includeWaiting` (/nail), also a waiting ticket assigned to them that has not been started. */
  activeTicketId: number | null;
}

export async function identifyBarber(storeId: number, barberNumber: number, opts: { includeWaiting?: boolean } = {}): Promise<TicketResult<BarberSignIn>> {
  if (!Number.isInteger(barberNumber) || barberNumber < 1 || barberNumber > 99) return fail(400, "Enter your ID");
  await ensureBarberNumbers(storeId);
  const member = (await pool.query(
    `SELECT id, name, color FROM staff
      WHERE store_id = $1 AND barber_number = $2 AND COALESCE(status, 'active') NOT IN ('removed', 'deactivated') LIMIT 1`,
    [storeId, barberNumber],
  )).rows[0];
  if (!member) return fail(404, "No one with that ID");
  const marker = (await pool.query(
    `SELECT id, client_id, client_name FROM kiosk_checkins
      WHERE store_id = $1 AND staff_id = $2 AND appointment_id IS NULL AND status = 'called'
        AND created_at > NOW() - INTERVAL '${CHECKIN_MARKER_HOURS} hours'
      ORDER BY created_at ASC LIMIT 1`,
    [storeId, member.id],
  )).rows[0];
  const ticket = marker ? null : (await pool.query(
    `SELECT id FROM appointments WHERE store_id = $1 AND staff_id = $2
        AND (status = 'started' OR ($3::boolean AND status = 'confirmed' AND checked_in_at IS NOT NULL
                                    AND date > NOW() - INTERVAL '${CHECKIN_MARKER_HOURS} hours'))
      ORDER BY (status = 'started') DESC, started_at ASC NULLS LAST, checked_in_at ASC NULLS LAST LIMIT 1`,
    [storeId, member.id, opts.includeWaiting === true],
  )).rows[0];
  return {
    ok: true,
    data: {
      staff: { id: Number(member.id), name: member.name, color: member.color ?? null, barberNumber, frontDesk: isFrontDeskId(barberNumber) },
      activeMarker: marker ? { id: Number(marker.id), clientId: marker.client_id ?? null, clientName: marker.client_name ?? null } : null,
      activeTicketId: ticket ? Number(ticket.id) : null,
    },
  };
}

/** A barber takes a waiting client. No ticket is made — that happens when the barber rings them up. */
export async function assignMarkerToBarber(args: { storeId: number; markerId: number; staffId: number }): Promise<TicketResult<{ staffName: string }>> {
  const member = await storage.getStaffMember(args.staffId);
  if (!member || member.storeId !== args.storeId || ["removed", "deactivated"].includes(String(member.status))) {
    return fail(404, "Barber not found");
  }
  const taken = await pool.query(
    `UPDATE kiosk_checkins SET staff_id = $3, assigned_staff_name = $4, status = 'called'
      WHERE id = $1 AND store_id = $2 AND appointment_id IS NULL AND status = 'waiting'`,
    [args.markerId, args.storeId, member.id, member.name],
  );
  if (taken.rowCount === 0) return fail(409, "This client was already taken or is no longer waiting.");
  return { ok: true, data: { staffName: member.name } };
}

// ── Front desk check-in by category (/frontdesk): a waiting client with no ticket yet ──────────────
// The client says only what kind of service they came for. Their waiting entry (kiosk_checkins) keeps
// that category and is handed to the next technician in TURN order who performs it and is in and free.
// No ticket and no service exist yet: the technician (or the front desk) adds the real service on the
// ticket screen. The technician is held with the same consideration lock a started ticket uses, so the
// next client is not given to them too.

/** Staff who perform at least one active service filed under this category of this salon. */
export async function staffForCategory(storeId: number, category: { id: number | null; name: string }): Promise<Set<number>> {
  const { rows } = await pool.query(
    `SELECT DISTINCT ss.staff_id
       FROM staff_services ss
       JOIN services s ON s.id = ss.service_id
       JOIN staff st ON st.id = ss.staff_id AND st.store_id = $1
      WHERE s.store_id = $1 AND s.is_active = true
        AND (($2::int IS NOT NULL AND s.category_id = $2::int)
          OR ($2::int IS NULL AND s.category_id IS NULL AND LOWER(TRIM(s.category)) = LOWER(TRIM($3))))`,
    [storeId, category.id, category.name],
  );
  return new Set(rows.map((r: any) => Number(r.staff_id)));
}

/**
 * The first technician in TURN order who may take a client asking for this category.
 * `turnOrder` is the turn system's own eligible list (in, free, not on break — already in line order);
 * nothing is re-sorted here, technicians who don't perform the category are simply passed over.
 */
export function nextTechnicianForCategory<T extends { id: number }>(turnOrder: readonly T[], performsCategory: ReadonlySet<number>): T | null {
  return turnOrder.find((tech) => performsCategory.has(Number(tech.id))) ?? null;
}

/** Hand one waiting, unassigned check-in to the next qualified technician, if there is one right now. */
export async function assignCheckinByCategory(
  deps: TicketDeps,
  args: { storeId: number; markerId: number; onlyStaffId?: number },
): Promise<{ staffId: number; staffName: string } | null> {
  return withTurnLock(args.storeId, async () => {
    const marker = (await pool.query(
      `SELECT id, requested_category_id, requested_category FROM kiosk_checkins
        WHERE id = $1 AND store_id = $2 AND appointment_id IS NULL AND status = 'waiting' AND requested_category IS NOT NULL`,
      [args.markerId, args.storeId],
    )).rows[0];
    if (!marker) return null;
    const performs = await staffForCategory(args.storeId, {
      id: marker.requested_category_id == null ? null : Number(marker.requested_category_id), name: String(marker.requested_category),
    });
    const eligibility = await deps.getTurnEligibility(args.storeId, null);
    // Turn system switched off: nobody is handed a client automatically; staff assign by hand.
    if (eligibility.settings?.turnEnabled === false) return null;
    const inLine = (eligibility.eligibleTechnicians as any[]).filter((t) => args.onlyStaffId == null || Number(t.id) === args.onlyStaffId);
    const next = nextTechnicianForCategory(inLine, performs);
    if (!next) return null;
    const claimed = await pool.query(
      `UPDATE kiosk_checkins SET staff_id = $3, assigned_staff_name = $4, status = 'called'
        WHERE id = $1 AND store_id = $2 AND appointment_id IS NULL AND status = 'waiting'`,
      [args.markerId, args.storeId, Number(next.id), String((next as any).name)],
    );
    if (claimed.rowCount === 0) return null;
    await lockTech(deps, args.storeId, Number(next.id));
    await deps.logCategoryAssignment?.({
      storeId: args.storeId, staffId: Number(next.id),
      recommendedStaffId: eligibility.eligibleTechnicians[0] ? Number(eligibility.eligibleTechnicians[0].id) : null,
    });
    return { staffId: Number(next.id), staffName: String((next as any).name) };
  });
}

/** A technician has just become free: give them the longest-waiting check-in whose category they perform. */
export async function matchWaitingCheckinForTechnician(
  deps: TicketDeps,
  args: { storeId: number; staffId: number },
): Promise<{ markerId: number } | null> {
  const prefs = await deps.getTurnPreferences(args.storeId);
  if (prefs.turnEnabled === false || prefs.autoAdvanceOnCheckout === false) return null;
  const { rows } = await pool.query(
    `SELECT id FROM kiosk_checkins
      WHERE store_id = $1 AND appointment_id IS NULL AND status = 'waiting' AND requested_category IS NOT NULL
        AND created_at > NOW() - INTERVAL '${CHECKIN_MARKER_HOURS} hours'
      ORDER BY created_at ASC`,
    [args.storeId],
  );
  for (const row of rows) {
    const assigned = await assignCheckinByCategory(deps, { storeId: args.storeId, markerId: Number(row.id), onlyStaffId: args.staffId });
    if (assigned) return { markerId: Number(row.id) };
  }
  return null;
}

/** Staff who are holding a checked-in client that has no ticket yet — they count as occupied for TURN. */
export async function staffHoldingCheckins(storeId: number): Promise<number[]> {
  const { rows } = await pool.query(
    `SELECT DISTINCT staff_id FROM kiosk_checkins
      WHERE store_id = $1 AND appointment_id IS NULL AND status = 'called' AND staff_id IS NOT NULL
        AND created_at > NOW() - INTERVAL '${CHECKIN_MARKER_HOURS} hours'`,
    [storeId],
  );
  return rows.map((r: any) => Number(r.staff_id));
}

// ── Ticket archive: every past ticket of a salon, kept on its tablets so a ticket # can be looked up offline ──

export interface ArchivedTicket {
  id: number;
  ticketNumber: number;
  status: string;
  date: string;
  clientName: string;
  service: string;
  staffName: string | null;
  isPaid: boolean;
  /** The receipt as it was printed (appointments.receipt_snapshot), for a paid ticket that has one. */
  receipt: unknown | null;
  /** Whose visit it was, and the service's price: the client lookup lists a client's visits offline from these. */
  clientId: number | null;
  price: number | null;
}

/**
 * One page of the salon's numbered tickets, oldest first. `afterId`: the tablet's first copy, page by page.
 * `changedSince`: tickets made or closed since then, for a tablet that already has the rest (a ticket can be
 * paid, cancelled or refunded after it was made, so the tablet asks again for its last days).
 */
export async function ticketArchivePage(storeId: number, opts: { afterId: number; changedSince: Date | null; limit: number }): Promise<{ tickets: ArchivedTicket[]; lastId: number | null; more: boolean }> {
  const { rows } = await pool.query(
    // A ticket paid with others (Group Pay) shows the sale's receipt, kept on the ticket the checkout was opened from.
    `SELECT a.id, a.ticket_number, a.status, a.date, a.total_paid, a.customer_id, s.price AS service_price,
            COALESCE(a.receipt_snapshot, (SELECT m.receipt_snapshot FROM nail_checkout_operations o
               JOIN appointments m ON m.id = (o.result->'appointmentIds'->>0)::int AND m.store_id = o.store_id
              WHERE o.store_id = a.store_id AND o.result->'appointmentIds' @> jsonb_build_array(a.id)
              ORDER BY o.created_at DESC LIMIT 1)) AS receipt_snapshot,
            COALESCE(c.full_name, (SELECT kc.client_name FROM kiosk_checkins kc WHERE kc.appointment_id = a.id ORDER BY kc.id DESC LIMIT 1)) AS client_name,
            s.name AS service_name, st.name AS staff_name
       FROM appointments a
       LEFT JOIN clients  c  ON c.id  = a.customer_id
       LEFT JOIN services s  ON s.id  = a.service_id
       LEFT JOIN staff    st ON st.id = a.staff_id
      WHERE a.store_id = $1 AND a.ticket_number IS NOT NULL AND a.id > $2
        AND ($3::timestamptz IS NULL OR a.created_at >= $3::timestamptz OR a.completed_at >= $3::timestamptz OR a.date >= $3::timestamptz)
      ORDER BY a.id ASC
      LIMIT $4`,
    [storeId, opts.afterId, opts.changedSince ? opts.changedSince.toISOString() : null, opts.limit + 1],
  );
  const more = rows.length > opts.limit;
  const page = rows.slice(0, opts.limit);
  const tickets: ArchivedTicket[] = page.map((r: any) => {
    const isPaid = r.status === "completed" && r.total_paid != null;
    return {
      id: Number(r.id),
      ticketNumber: Number(r.ticket_number),
      status: r.status ?? "pending",
      date: new Date(r.date).toISOString(),
      clientName: r.client_name || "Guest",
      service: r.service_name ?? "Appointment",
      staffName: r.staff_name ?? null,
      isPaid,
      receipt: isPaid ? r.receipt_snapshot ?? null : null,
      clientId: r.customer_id != null ? Number(r.customer_id) : null,
      price: r.service_price != null ? Number(r.service_price) : null,
    };
  });
  return { tickets, lastId: page.length ? Number(page[page.length - 1].id) : null, more };
}
