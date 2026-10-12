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
import { and, eq, sql } from "drizzle-orm";
import { appointmentAddons, appointmentNailSelection, appointments } from "@shared/schema";
import { storage } from "../storage";
import { atomicCreateBooking, occupiedMinutes } from "../bookingEngine";
import { autoAssignResource } from "../services/resource-assignment";
import { getRequiredResourceType } from "@shared/resourceMatching";
import { withTurnLock } from "./turnLock";
import * as nailConfig from "./nailConfig";
import { getBufferMinutes } from "./appointmentBuffer";

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
export interface CustomLine { label: string; price: number; isRetail?: boolean }

/** Keypad lines from the client: trimmed labels, 0 < price <= 9999.99 to the cent, at most 20. */
export function sanitizeCustomLines(raw: unknown): CustomLine[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomLine[] = [];
  for (const r of raw) {
    const price = Math.round(Number((r as any)?.price) * 100) / 100;
    if (!Number.isFinite(price) || price <= 0 || price > 9999.99) continue;
    const label = String((r as any)?.label ?? "").trim().slice(0, 60) || "Custom Amount";
    const line: CustomLine = { label, price };
    if ((r as any)?.isRetail === true) line.isRetail = true;
    out.push(line);
    if (out.length >= 20) break;
  }
  return out;
}

const sumCustom = (lines: CustomLine[]) => Math.round(lines.reduce((s, l) => s + l.price, 0) * 100) / 100;

/** Duration + price of a service with its add-ons and nail adjustments. */
export function priceTicket(args: {
  serviceDuration: number;
  servicePrice: number;
  addons: { duration: number | null; price: number | string }[];
  nailPriceAdj?: number;
  nailDurationAdj?: number;
  /** Keypad "Custom Amount" lines — money only, no time. */
  customPrice?: number;
}): TicketPricing {
  const addonDuration = args.addons.reduce((s, a) => s + (Number(a.duration) || 0), 0);
  const addonPrice = args.addons.reduce((s, a) => s + (Number(a.price) || 0), 0);
  return {
    duration: Math.max(1, Number(args.serviceDuration) + addonDuration + (args.nailDurationAdj ?? 0)),
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
  }): Promise<{ technician: any } | null>;
  getTurnPreferences(storeId: number): Promise<Record<string, any>>;
  saveTurnPreferences(storeId: number, updates: Record<string, any>): Promise<unknown>;
  /** Fan-out after any ticket change: websocket + dashboard refresh. */
  notify(storeId: number, event: { appointmentId: number; kind: "created" | "updated" | "started" | "assigned" }): void;
}

export type TicketResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; technicians?: any[] };

const fail = (status: number, message: string, extra?: { technicians?: any[] }): TicketResult<never> =>
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
    `SELECT id, date, duration, status, completed_at FROM appointments
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
    `SELECT id, service_id, staff_id
       FROM appointments
      WHERE store_id = $1
        AND status = 'confirmed'
        AND checked_in_at IS NOT NULL
        AND staff_id IS NULL
        AND service_id IS NOT NULL
      ORDER BY checked_in_at ASC, date ASC, id ASC`,
    [args.storeId],
  );

  const remaining = rows.map((row: any) => ({
    id: Number(row.id),
    requiredServiceIds: [Number(row.service_id)],
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
          AND status = 'confirmed' AND checked_in_at IS NOT NULL AND staff_id IS NULL
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
  clientId: number;
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
  /** The request's idempotency key: the ticket's id is noted against it in the same transaction that creates
   *  the ticket, so a retry after a crash finds the ticket instead of making a second one (lib/idempotency.ts). */
  idempotencyKey?: string | null;
  bookedByUserId?: number | null;
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

/**
 * A visit of several services: one ticket per service, saved together.
 *
 * One technician takes all of them when TURN has someone eligible for every service; otherwise each
 * service goes to the next technician in turn who can do it. Nothing is started here.
 * Add-ons, nail options, custom lines and the check-in marker belong to the first service.
 */
export async function createNailTicketGroup(
  deps: TicketDeps,
  input: CreateTicketInput & { extraServiceIds: number[] },
): Promise<TicketResult<CreatedTicketGroup>> {
  const serviceIds = [input.serviceId, ...input.extraServiceIds];
  return withTurnLock(input.storeId, async () => {
    const names = new Map<number, string>();
    for (const id of serviceIds) {
      const svc = await storage.getService(id);
      if (!svc || svc.storeId !== input.storeId) return { ok: false as const, status: 400, message: "One of the services is no longer in the catalog." };
      names.set(id, svc.name);
    }

    // Staff picking a technician, or a check-in already handed to one, decides the first service as before.
    const turnDecides = input.autoAssign === true && !input.staffId && !input.leaveUnassigned;
    let common: number | null = null;
    if (turnDecides && serviceIds.length > 1) {
      const lists: number[][] = [];
      let turnOn = true;
      for (const id of serviceIds) {
        const e: any = await deps.getTurnEligibility(input.storeId, id);
        if (e.settings?.turnEnabled === false) turnOn = false;
        lists.push(e.eligibleTechnicians.map((t: any) => Number(t.id)));
      }
      common = turnOn ? commonTechnician(lists) : null;
    }

    const first = await createNailTicket(deps, { ...input, preferStaffId: common });
    if (!first.ok) return first;
    const tickets: CreatedTicketGroup["tickets"] = [
      { ...first.data, serviceId: input.serviceId, serviceName: names.get(input.serviceId)! },
    ];
    // The whole visit stays with the first service's technician when that was the plan (TURN found one
    // person for everything) or when staff or the check-in chose them and they can do the service.
    const keepWith = common != null && first.data.staffId === common ? common : input.staffId ? first.data.staffId : null;

    for (const serviceId of input.extraServiceIds) {
      const base: CreateTicketInput = {
        storeId: input.storeId, clientId: input.clientId, serviceId, bookedByUserId: input.bookedByUserId ?? null,
        startOnAssign: false, idempotencyKey: null,
      };
      let made = keepWith != null ? await createNailTicket(deps, { ...base, sameTechStaffId: keepWith }) : null;
      if (!made || !made.ok) made = await createNailTicket(deps, { ...base, autoAssign: !input.leaveUnassigned, leaveUnassigned: input.leaveUnassigned });
      if (!made.ok) {
        // The first service is already saved; say what happened instead of leaving a half-made visit unexplained.
        return { ok: false as const, status: made.status, message: `Ticket #${first.data.ticketNumber} was saved, but ${names.get(serviceId)} could not be added: ${made.message}` };
      }
      tickets.push({ ...made.data, serviceId, serviceName: names.get(serviceId)! });
    }

    if (tickets.length > 1) {
      await pool.query(`UPDATE appointments SET ticket_group_id = $1 WHERE store_id = $2 AND id = ANY($3::int[])`,
        [first.data.appointmentId, input.storeId, tickets.map((t) => t.appointmentId)]);
    }
    return { ok: true as const, data: { ...first.data, tickets } };
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

  const client = await storage.getCustomer(input.clientId);
  if (!client || client.storeId !== storeId) return fail(404, "Client not found");

  const service = await storage.getService(input.serviceId);
  if (!service || service.storeId !== storeId || service.isActive === false) return fail(404, "Service not found");

  const addonIds = [...new Set((input.addonIds ?? []).map(Number).filter(Number.isFinite))];
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

  const customLines = sanitizeCustomLines(input.customLines);
  const pricing = priceTicket({
    serviceDuration: service.duration,
    servicePrice: Number(service.price),
    addons: addons as any,
    nailPriceAdj: nailAdj.priceAdjustment,
    nailDurationAdj: nailAdj.durationAdjustment,
    customPrice: sumCustom(customLines),
  });

  // ── Technician ─────────────────────────────────────────────────────────────
  const leaveUnassigned = input.leaveUnassigned === true;
  const eligibility = leaveUnassigned ? { technicians: [], eligibleTechnicians: [] } : await deps.getTurnEligibility(storeId, service.id);
  const eligibleIds = new Set<number>(eligibility.eligibleTechnicians.map((t: any) => Number(t.id)));

  let staffId: number | null = null;
  let staffName: string | null = null;
  const requested = input.staffId ? Number(input.staffId) : null;
  const sameTech = !requested && input.sameTechStaffId ? Number(input.sameTechStaffId) : null;
  const autoAssign = input.autoAssign === true && !leaveUnassigned && !requested && !sameTech;
  if (leaveUnassigned) {
    // Intentionally do not consult or advance TURN. This is only a checked-in ticket.
  } else if (requested) {
    const member = await storage.getStaffMember(requested);
    if (!member || member.storeId !== storeId || ["removed", "deactivated"].includes(String(member.status))) {
      return fail(400, "That technician isn't available.");
    }
    if (!(await techCanDo(requested, service.id))) return fail(400, `${member.name} doesn't perform this service.`);
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
    const next = (eligibility as any).settings?.turnEnabled === false ? undefined : (preferred ?? eligibility.eligibleTechnicians[0]);
    if (next) {
      staffId = Number(next.id);
      staffName = String(next.name);
    } else if (!autoAssign) {
      return fail(409, "Every technician is busy or booked. Choose one to line up behind their current client.", {
        technicians: eligibility.technicians,
      });
    }
  }

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
    let ticketNumberOverride: number | null = offlineNumber;
    if (input.checkinId != null) {
      const marker = (await tx.execute(sql`SELECT ticket_number, client_id, status, appointment_id
        FROM kiosk_checkins WHERE id = ${input.checkinId} AND store_id = ${storeId} FOR UPDATE`)).rows[0] as any;
      if (!marker || Number(marker.client_id) !== client.id || marker.appointment_id != null ||
          !["waiting", "called"].includes(String(marker.status))) {
        return { ok: false as const, message: "This check-in was already used or belongs to another client." };
      }
      ticketNumberOverride = marker.ticket_number ?? null;
    }
    const created = await atomicCreateBooking({
      storeId, timezone: tz, startTime,
      durationMinutes: pricing.duration - nailAdj.durationAdjustment,
      staffId, serviceId: service.id, customerId: client.id, status: "confirmed",
      notes: input.notes ?? null, checkedInAt: now, clientRequestedStaff: false,
      resourceId, ticketNumberOverride,
    }, tx);
    if (!created.ok) return { ok: false as const, message: created.error.message };
    const appointmentId = created.data.id;
    if (input.idempotencyKey) await tx.execute(sql`UPDATE idempotency_keys SET entity_id = ${appointmentId} WHERE store_id = ${storeId} AND key = ${input.idempotencyKey}`);
    if (addonIds.length) await tx.insert(appointmentAddons).values(addonIds.map((addonId) => ({ appointmentId, addonId })));
    if (hasNail(input.nail)) await nailConfig.setAppointmentNailSelection(appointmentId, input.nail!, tx);
    if (customLines.length) await tx.update(appointments).set({ customLines }).where(eq(appointments.id, appointmentId));
    if (input.checkinId != null) {
      await tx.execute(sql`UPDATE kiosk_checkins SET appointment_id = ${appointmentId}, staff_id = ${staffId},
        assigned_staff_name = ${staffName}, status = ${immediate && startOnAssign ? "serving" : "waiting"}
        WHERE id = ${input.checkinId} AND store_id = ${storeId} AND appointment_id IS NULL`);
    } else {
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

  const addonIds = [...new Set(input.addonIds.map(Number).filter(Number.isFinite))];
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

  const customLines = sanitizeCustomLines(input.customLines);
  const pricing = priceTicket({
    serviceDuration: service.duration,
    servicePrice: Number(service.price),
    addons: addons as any,
    nailPriceAdj: nailAdj.priceAdjustment,
    nailDurationAdj: nailAdj.durationAdjustment,
    customPrice: sumCustom(customLines),
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
          JSON.stringify(sanitizeCustomLines(locked.custom_lines)) !== JSON.stringify(sanitizeCustomLines(input.expected.customLines)) ||
          (currentNail?.nailSizeId ?? null) !== (n?.nailSizeId ?? null) ||
          (currentNail?.nailShapeId ?? null) !== (n?.nailShapeId ?? null) ||
          (currentNail?.nailArtApplicationId ?? null) !== (n?.nailArtApplicationId ?? null) ||
          (currentNail?.nailArtEffectId ?? null) !== (n?.nailArtEffectId ?? null)) return fail(409, "This ticket changed on another register. Reload it before editing.");
    }
    await tx.update(appointments).set({
      serviceId: service.id, duration: pricing.duration - nailAdj.durationAdjustment,
      ...(input.customLines !== undefined ? { customLines: customLines.length ? customLines : null } : {}),
    }).where(and(eq(appointments.id, appt.id), eq(appointments.storeId, input.storeId)));
    await tx.delete(appointmentAddons).where(eq(appointmentAddons.appointmentId, appt.id));
    if (addonIds.length) await tx.insert(appointmentAddons).values(addonIds.map((addonId) => ({ appointmentId: appt.id, addonId })));
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
  args: { storeId: number; appointmentId: number; staffId: number; /** Who the ticket was with when this device decided to move it (undefined = not checked). */ expectedStaffId?: number | null },
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

  const member = await storage.getStaffMember(args.staffId);
  if (!member || member.storeId !== args.storeId || ["removed", "deactivated"].includes(String(member.status))) {
    return fail(400, "That technician isn't available.");
  }
  if (!(await techCanDo(member.id, appt.serviceId))) return fail(400, `${member.name} doesn't perform this service.`);

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
        requestedStaffId: member.id, writeStaffId: false, source: "nail_assign",
      });
    } catch (err: any) {
      console.error("[nail-ticket] assign turn bookkeeping failed:", err?.message);
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
  status: "confirmed" | "started";
  date: string;
  checkedInAt: string | null;
  startedAt: string | null;
  duration: number;
  client: { id: number | null; name: string; phone: string | null; loyaltyPoints: number };
  service: { id: number | null; name: string; price: number };
  addons: { id: number; name: string; price: number; duration: number }[];
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
}

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
  /** Pre-booked appointments today (not cancelled). */
  appointments: number;
  /** Clients who walked in today: tickets made at the desk + kiosk check-ins that never got a ticket. */
  walkIns: number;
  noShows: number;
  completed: number;
  /** Average sale before tip, over tickets checked out today. */
  avgTicket: number | null;
}

export async function getNailBoard(storeId: number): Promise<{ tickets: BoardTicket[]; markers: BoardWaitingMarker[]; dayBookings: BoardDayBooking[]; techStats: TechDayStats[]; glance: SalonGlance; now: string; nextTicketNumber: number | null }> {
  const store = await storage.getStore(storeId);
  const tz = (store as any)?.timezone || "UTC";
  // Closing a shift starts a new operational day even when the local calendar date (or 4 AM
  // business-day boundary) has not changed. Keep old appointments in the database for reports.
  const { rows: closeRows } = await pool.query<{ closed_at: Date }>(
    "SELECT closed_at AT TIME ZONE 'UTC' AS closed_at FROM cash_drawer_sessions WHERE store_id = $1 AND status = 'closed' AND closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 1",
    [storeId],
  );
  const shiftStart = closeRows[0]?.closed_at ?? null;

  const { rows } = await pool.query(
    `SELECT a.id, a.ticket_number, a.ticket_group_id, a.status, a.date, a.duration, a.checked_in_at, a.started_at, a.staff_id,
            a.customer_id, a.custom_lines, c.full_name AS client_name, COALESCE(c.loyalty_points, 0) AS loyalty_points,
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
            ns.id AS nail_id
       FROM appointments a
       LEFT JOIN clients  c  ON c.id  = a.customer_id
       LEFT JOIN services s  ON s.id  = a.service_id
       LEFT JOIN staff    st ON st.id = a.staff_id
       LEFT JOIN appointment_nail_selection ns ON ns.appointment_id = a.id
       LEFT JOIN LATERAL (
         SELECT kc.client_name, kc.phone FROM kiosk_checkins kc
          WHERE kc.appointment_id = a.id AND kc.store_id = a.store_id ORDER BY kc.id DESC LIMIT 1
       ) k ON a.customer_id IS NULL
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object('id', d.id, 'name', d.name, 'price', d.price, 'duration', d.duration) ORDER BY aa.id) AS items
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
    const addons = (r.addons ?? []).map((x: any) => ({ id: x.id, name: x.name, price: Number(x.price) || 0, duration: Number(x.duration) || 0 }));
    const nailLines: { label: string; price: number }[] = [];
    if (r.nail_id) {
      if (r.length_name_snapshot) nailLines.push({ label: `Length: ${r.length_name_snapshot}`, price: Number(r.length_adj) || 0 });
      if (r.shape_name_snapshot) nailLines.push({ label: `Shape: ${r.shape_name_snapshot}`, price: Number(r.shape_adj) || 0 });
      const art = [r.art_application_name_snapshot, r.art_effect_name_snapshot].filter(Boolean).join(" · ");
      if (art) nailLines.push({ label: `Art: ${art}`, price: Number(r.art_adj) || 0 });
    }
    const nailAdj = nailLines.reduce((sum, l) => sum + l.price, 0);
    const customLines = sanitizeCustomLines(r.custom_lines);
    return {
      id: r.id,
      ticketNumber: r.ticket_number ?? null,
      groupId: r.ticket_group_id ?? null,
      status: r.status,
      date: new Date(r.date).toISOString(),
      checkedInAt: r.checked_in_at ? new Date(r.checked_in_at).toISOString() : null,
      startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
      duration: r.duration ?? 0,
      client: { id: r.customer_id ?? null, name: r.client_name ?? r.checkin_name ?? "Walk-in", phone: r.client_phone ?? r.checkin_phone ?? null, loyaltyPoints: Number(r.loyalty_points) || 0 },
      service: { id: r.service_id ?? null, name: r.service_name ?? "Service", price: Number(r.service_price) || 0 },
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
    };
  });

  // Kiosk check-ins that don't have a ticket yet (phone not recognised, etc.).
  const markerRows = await pool.query(
    `SELECT id, ticket_number, client_id, client_name, phone, created_at, status, staff_id, assigned_staff_name, requested_category FROM kiosk_checkins
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
              ${walkInSQL("a")} AS is_walk_in
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
              TRUE AS is_walk_in
         FROM kiosk_checkins k
        WHERE k.store_id = $1
          AND k.appointment_id IS NULL
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
      SELECT COUNT(*) FILTER (WHERE status <> 'cancelled' AND NOT walkin)::int AS appointments,
             COUNT(*) FILTER (WHERE status <> 'cancelled' AND walkin)::int AS walkins,
             COUNT(*) FILTER (WHERE status IN ('no_show', 'no-show'))::int AS no_shows,
             COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
             AVG(total_paid - COALESCE(tip_amount, 0)) FILTER (WHERE status = 'completed' AND total_paid IS NOT NULL) AS avg_ticket
       FROM t`,
    [storeId, tz, shiftStart],
  );
  const kioskOnly = await pool.query(
    `SELECT COUNT(*)::int AS n FROM kiosk_checkins
      WHERE store_id = $1 AND appointment_id IS NULL AND ${bizDayOf("created_at")} = ${BIZ_TODAY}
        AND ($3::timestamptz IS NULL OR created_at > $3::timestamptz)`,
    [storeId, tz, shiftStart],
  );
  const gr = g.rows[0] ?? {};
  const glance: SalonGlance = {
    appointments: Number(gr.appointments) || 0,
    walkIns: (Number(gr.walkins) || 0) + (Number(kioskOnly.rows[0]?.n) || 0),
    noShows: Number(gr.no_shows) || 0,
    completed: Number(gr.completed) || 0,
    avgTicket: gr.avg_ticket != null ? Math.round(Number(gr.avg_ticket) * 100) / 100 : null,
  };

  // `now` lets every POS station measure "waiting 12 min" against the SERVER clock, so two tablets with different clocks agree.
  // The next ticket number the store will give out, so a tablet can keep numbering if it goes offline.
  const counter = await pool.query(`SELECT next_ticket_number FROM locations WHERE id = $1`, [storeId]);
  const nextTicketNumber = counter.rows[0]?.next_ticket_number != null ? Number(counter.rows[0].next_ticket_number) : null;
  return { tickets, markers, dayBookings, techStats: [...stats.values()], glance, now: new Date().toISOString(), nextTicketNumber };
}

// ── Barbershop (/barber): Barber ID sign-in and taking a waiting client before any ticket exists ──

/** Receptionists sign in with 90–99; technicians and barbers with 1–89. The same rule for every salon. */
export const FRONT_DESK_ID_MIN = 90;
export function isFrontDeskId(barberNumber: number): boolean {
  return barberNumber >= FRONT_DESK_ID_MIN && barberNumber <= 99;
}

/**
 * Give every active staff member of the store an ID: the lowest free number in their range — 90–99 for
 * receptionists (staff.front_desk), 1–89 for everyone else. Someone whose number is in the wrong range
 * (they were just made, or unmade, a receptionist) is renumbered. Idempotent.
 */
export async function ensureBarberNumbers(storeId: number): Promise<void> {
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
