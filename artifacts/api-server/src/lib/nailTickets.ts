/**
 * nailTickets.ts — server logic behind the nail-salon staff screen (/nail).
 *
 * A "ticket" is an ordinary appointment created for a client who is standing at
 * the salon: status "confirmed" (checked in, waiting) or "started" (in service),
 * always assigned to a technician, with add-ons and the nail selection saved on
 * it. Everything runs through the same booking engine, TURN queue and
 * consideration-lock rules as the calendar and kiosk, so the two never disagree.
 *
 * The TURN helpers live inside routes.ts, so they are injected (`TicketDeps`).
 */

import { pool, db } from "../db";
import { and, eq } from "drizzle-orm";
import { appointmentNailSelection } from "@shared/schema";
import { storage } from "../storage";
import { atomicCreateBooking, validateBookingSlot } from "../bookingEngine";
import { autoAssignResource } from "../services/resource-assignment";
import { getRequiredResourceType } from "@shared/resourceMatching";
import * as nailConfig from "./nailConfig";
import { getBufferMinutes } from "./appointmentBuffer";

// ── Pure helpers ────────────────────────────────────────────────────────────

export type BusyBlock = { date: Date | string; duration: number | null };

/** True for business types that get the nail-salon staff screen. */
export function isNailSalonCategory(category?: string | null): boolean {
  return /nail/i.test(category ?? "");
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

export interface CustomLine { label: string; price: number }

/** Keypad lines from the client: trimmed labels, 0 < price <= 9999.99 to the cent, at most 20. */
export function sanitizeCustomLines(raw: unknown): CustomLine[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomLine[] = [];
  for (const r of raw) {
    const price = Math.round(Number((r as any)?.price) * 100) / 100;
    if (!Number.isFinite(price) || price <= 0 || price > 9999.99) continue;
    const label = String((r as any)?.label ?? "").trim().slice(0, 60) || "Custom Amount";
    out.push({ label, price });
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
  getTurnEligibility(storeId: number, serviceId: number | null): Promise<{ technicians: any[]; eligibleTechnicians: any[] }>;
  assignAppointmentViaTurn(opts: {
    storeId: number;
    serviceId?: number | null;
    appointmentId?: number | null;
    requestedStaffId?: number | null;
    bookedByUserId?: number | null;
    writeStaffId?: boolean;
    source?: string;
  }): Promise<{ technician: any } | null>;
  getTurnPreferences(storeId: number): Promise<Record<string, any>>;
  saveTurnPreferences(storeId: number, updates: Record<string, any>): Promise<unknown>;
  /** Fan-out after any ticket change: websocket + dashboard refresh. */
  notify(storeId: number, event: { appointmentId: number; kind: "created" | "updated" | "started" }): void;
}

export type TicketResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; technicians?: any[] };

const fail = (status: number, message: string, extra?: { technicians?: any[] }): TicketResult<never> =>
  ({ ok: false, status, message, ...extra });

const numArr = (v: unknown): number[] =>
  Array.isArray(v) ? (v as unknown[]).map(Number).filter(Number.isFinite) : [];

// ── Turn lock helpers (same primitives the calendar's start/cancel use) ─────

async function lockTech(deps: TicketDeps, storeId: number, staffId: number) {
  const prefs = await deps.getTurnPreferences(storeId);
  await deps.saveTurnPreferences(storeId, {
    dequeOrder: numArr(prefs.dequeOrder).filter((id) => id !== staffId),
    lockedStaffIds: [...new Set([...numArr(prefs.lockedStaffIds), staffId])],
  });
}

/** Release a lock without a paid service: the tech gets their spot back at the front. */
async function unlockTechToFront(deps: TicketDeps, storeId: number, staffId: number) {
  const prefs = await deps.getTurnPreferences(storeId);
  const locked = numArr(prefs.lockedStaffIds);
  if (!locked.includes(staffId)) return;
  await deps.saveTurnPreferences(storeId, {
    lockedStaffIds: locked.filter((id) => id !== staffId),
    dequeOrder: [staffId, ...numArr(prefs.dequeOrder).filter((id) => id !== staffId)],
  });
}

/** The technician's bookings around now; each is held for the store's buffer after it ends. */
async function busyBlocksFor(storeId: number, staffId: number, excludeAppointmentId?: number): Promise<BusyBlock[]> {
  const buffer = await getBufferMinutes(storeId);
  const { rows } = await pool.query(
    `SELECT id, date, duration FROM appointments
      WHERE store_id = $1 AND staff_id = $2 AND status <> 'cancelled'
        AND date >= NOW() - INTERVAL '12 hours' AND date <= NOW() + INTERVAL '24 hours'
        ${excludeAppointmentId ? "AND id <> $3" : ""}`,
    excludeAppointmentId ? [storeId, staffId, excludeAppointmentId] : [storeId, staffId],
  );
  return rows.map((r: any) => ({ date: r.date, duration: (r.duration ?? 60) + buffer }));
}

async function techCanDo(staffId: number, serviceId: number): Promise<boolean> {
  const links = await storage.getStaffServices(staffId);
  return links.some((l) => l.serviceId === serviceId);
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
  notes?: string | null;
  /** A kiosk "waiting" marker to close out once the ticket exists. */
  checkinId?: number | null;
  bookedByUserId?: number | null;
}

export interface CreatedTicket {
  appointmentId: number;
  ticketNumber: number;
  staffId: number;
  staffName: string;
  status: "started" | "confirmed";
  startsAt: string;
  duration: number;
  price: number;
  /** True when the technician is busy and the ticket is queued behind their current client. */
  waiting: boolean;
}

export async function createNailTicket(deps: TicketDeps, input: CreateTicketInput): Promise<TicketResult<CreatedTicket>> {
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
  const eligibility = await deps.getTurnEligibility(storeId, service.id);
  const eligibleIds = new Set<number>(eligibility.eligibleTechnicians.map((t: any) => Number(t.id)));

  let staffId: number;
  let staffName: string;
  const requested = input.staffId ? Number(input.staffId) : null;
  if (requested) {
    const member = await storage.getStaffMember(requested);
    if (!member || member.storeId !== storeId || ["removed", "deactivated"].includes(String(member.status))) {
      return fail(400, "That technician isn't available.");
    }
    if (!(await techCanDo(requested, service.id))) return fail(400, `${member.name} doesn't perform this service.`);
    staffId = member.id;
    staffName = member.name;
  } else {
    const next = eligibility.eligibleTechnicians[0];
    if (!next) {
      return fail(409, "Every technician is busy or booked. Choose one to line up behind their current client.", {
        technicians: eligibility.technicians,
      });
    }
    staffId = Number(next.id);
    staffName = String(next.name);
  }

  // ── When: right now if the tech is free, otherwise right after their current client ──
  const now = new Date();
  const buffer = await getBufferMinutes(storeId);
  const busy = await busyBlocksFor(storeId, staffId);
  const slot = nextFreeStart(busy, now, pricing.duration + buffer);
  const immediate = slot.getTime() - now.getTime() < 60_000;
  const startTime = immediate ? now : slot;

  // ── Station / chair ────────────────────────────────────────────────────────
  let resourceId: number | null = null;
  const requiredResource = getRequiredResourceType(service.category, service.name);
  if (requiredResource) {
    const r = await autoAssignResource({ storeId, resourceType: requiredResource, date: startTime, duration: pricing.duration });
    if (r.assigned && r.resourceId) resourceId = r.resourceId;
    else if (!r.noResourcesConfigured) return fail(409, r.reason);
  }

  const slotCheck = await validateBookingSlot({
    storeId, timezone: tz, startTime, durationMinutes: pricing.duration, staffId, resourceId, allowSameDay: true,
  });
  if (!slotCheck.ok) return fail(409, slotCheck.error.message);

  // The engine gets the pre-nail duration; setAppointmentNailSelection adds the nail delta itself.
  const created = await atomicCreateBooking({
    storeId,
    timezone: tz,
    startTime,
    durationMinutes: pricing.duration - nailAdj.durationAdjustment,
    staffId,
    serviceId: service.id,
    customerId: client.id,
    status: "confirmed",
    notes: input.notes ?? null,
    checkedInAt: now,
    clientRequestedStaff: false,
    resourceId,
  });
  if (!created.ok) return fail(409, created.error.message);
  const appointmentId = created.data.id;

  if (addonIds.length > 0) await storage.setAppointmentAddons(appointmentId, addonIds);
  if (hasNail(input.nail)) await nailConfig.setAppointmentNailSelection(appointmentId, input.nail!);
  if (customLines.length > 0) {
    await pool.query(`UPDATE appointments SET custom_lines = $1::jsonb WHERE id = $2`, [JSON.stringify(customLines), appointmentId]);
  }

  // TURN bookkeeping — audit row, and the consideration lock when they were eligible.
  if (eligibleIds.has(staffId)) {
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
  if (immediate) {
    await storage.updateAppointment(appointmentId, { status: "started", startedAt: now } as any);
    await lockTech(deps, storeId, staffId).catch((e) => console.error("[nail-ticket] lock failed:", e?.message));
    status = "started";
  }

  // Close out the kiosk "waiting" marker for this client, if they used the kiosk.
  try {
    if (input.checkinId) {
      await pool.query(
        `UPDATE kiosk_checkins SET appointment_id = $1, staff_id = $2, assigned_staff_name = $3, status = $4
          WHERE id = $5 AND store_id = $6`,
        [appointmentId, staffId, staffName, immediate ? "serving" : "waiting", input.checkinId, storeId],
      );
    } else {
      await pool.query(
        `UPDATE kiosk_checkins SET appointment_id = $1, staff_id = $2, assigned_staff_name = $3, status = $4
          WHERE store_id = $5 AND client_id = $6 AND appointment_id IS NULL AND status IN ('waiting','called')
            AND created_at > NOW() - INTERVAL '6 hours'`,
        [appointmentId, staffId, staffName, immediate ? "serving" : "waiting", storeId, client.id],
      );
    }
    // A client who checked in at the kiosk has been waiting since THEN, not since the ticket was made.
    await pool.query(
      `UPDATE appointments a SET checked_in_at = k.created_at
         FROM kiosk_checkins k
        WHERE a.id = $1 AND k.appointment_id = $1 AND k.created_at < a.checked_in_at`,
      [appointmentId],
    );
  } catch (err: any) {
    console.error("[nail-ticket] kiosk marker link failed:", err?.message);
  }

  void pool.query(
    `INSERT INTO appointment_events (store_id, appointment_id, event_type, actor_user_id, metadata)
     VALUES ($1,$2,'created',$3,$4)`,
    [storeId, appointmentId, input.bookedByUserId ?? null, JSON.stringify({ source: "nail_ticket", serviceId: service.id, staffId })],
  ).catch(() => {});

  deps.notify(storeId, { appointmentId, kind: immediate ? "started" : "created" });

  return {
    ok: true,
    data: {
      appointmentId,
      ticketNumber: created.data.ticketNumber,
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

  // A longer ticket must still fit before the technician's next appointment.
  if (appt.staffId) {
    const start = new Date(appt.date as any);
    const end = start.getTime() + (pricing.duration + (await getBufferMinutes(input.storeId))) * 60_000;
    const others = await busyBlocksFor(input.storeId, appt.staffId, appt.id);
    const clash = others.find((b) => {
      const s = new Date(b.date).getTime();
      return s < end && s + (b.duration ?? 60) * 60_000 > start.getTime();
    });
    if (clash) return fail(409, "That would run into this technician's next appointment.");
  }

  // Rebuild from scratch so the nail snapshot's duration delta can't drift.
  await db.delete(appointmentNailSelection).where(and(eq(appointmentNailSelection.appointmentId, appt.id)));
  await storage.updateAppointment(appt.id, {
    serviceId: service.id,
    duration: pricing.duration - nailAdj.durationAdjustment,
  } as any);
  await storage.setAppointmentAddons(appt.id, addonIds);
  if (hasNail(input.nail)) await nailConfig.setAppointmentNailSelection(appt.id, input.nail!);
  if (input.customLines !== undefined) {
    await pool.query(`UPDATE appointments SET custom_lines = $1::jsonb WHERE id = $2`, [customLines.length > 0 ? JSON.stringify(customLines) : null, appt.id]);
  }

  deps.notify(input.storeId, { appointmentId: appt.id, kind: "updated" });
  return { ok: true, data: { duration: pricing.duration, price: pricing.price } };
}

// ── Reassign the technician on an open ticket ───────────────────────────────

export async function reassignNailTicket(
  deps: TicketDeps,
  args: { storeId: number; appointmentId: number; staffId: number },
): Promise<TicketResult<{ staffId: number; staffName: string; status: string; startsAt: string }>> {
  const appt = await storage.getAppointment(args.appointmentId);
  if (!appt || appt.storeId !== args.storeId) return fail(404, "Ticket not found");
  if (!["confirmed", "started"].includes(String(appt.status))) return fail(409, "This ticket is already closed.");
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

  await storage.updateAppointment(appt.id, { staffId: member.id, date: startsAt } as any);

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
  clientId: number | null;
  clientName: string | null;
  phone: string | null;
  createdAt: string;
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
  /**
   * Average minutes clients waited today: for everyone already started, check-in → chair (or, when no check-in was
   * stamped, how late they started); for everyone still waiting, the wait so far. 0 when nobody has waited.
   */
  avgWaitMin: number | null;
  /** Average sale before tip, over tickets checked out today. */
  avgTicket: number | null;
}

export async function getNailBoard(storeId: number): Promise<{ tickets: BoardTicket[]; markers: BoardWaitingMarker[]; techStats: TechDayStats[]; glance: SalonGlance; now: string }> {
  const store = await storage.getStore(storeId);
  const tz = (store as any)?.timezone || "UTC";

  const { rows } = await pool.query(
    `SELECT a.id, a.ticket_number, a.status, a.date, a.duration, a.checked_in_at, a.started_at, a.staff_id,
            a.customer_id, a.custom_lines, c.full_name AS client_name, COALESCE(c.loyalty_points, 0) AS loyalty_points,
            (SELECT COALESCE(p.display_phone, p.phone_number_e164) FROM client_phones p
               WHERE p.client_id = c.id ORDER BY p.is_primary DESC, p.id LIMIT 1) AS client_phone,
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
         SELECT json_agg(json_build_object('id', d.id, 'name', d.name, 'price', d.price, 'duration', d.duration) ORDER BY aa.id) AS items
           FROM appointment_addons aa JOIN addons d ON d.id = aa.addon_id
          WHERE aa.appointment_id = a.id
       ) ad ON true
      WHERE a.store_id = $1
        AND (a.status = 'started' OR (a.status = 'confirmed' AND a.checked_in_at IS NOT NULL))
        AND (a.date AT TIME ZONE $2)::date >= ((NOW() AT TIME ZONE $2)::date - 1)
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
      status: r.status,
      date: new Date(r.date).toISOString(),
      checkedInAt: r.checked_in_at ? new Date(r.checked_in_at).toISOString() : null,
      startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
      duration: r.duration ?? 0,
      client: { id: r.customer_id ?? null, name: r.client_name ?? "Walk-in", phone: r.client_phone ?? null, loyaltyPoints: Number(r.loyalty_points) || 0 },
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
    `SELECT id, client_id, client_name, phone, created_at FROM kiosk_checkins
      WHERE store_id = $1 AND appointment_id IS NULL AND status IN ('waiting','called')
        AND (created_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date
        AND created_at > NOW() - INTERVAL '1 hour'
      ORDER BY created_at ASC`,
    [storeId, tz],
  );
  const markers: BoardWaitingMarker[] = markerRows.rows.map((m: any) => ({
    id: m.id, clientId: m.client_id ?? null, clientName: m.client_name ?? null, phone: m.phone ?? null, createdAt: new Date(m.created_at).toISOString(),
  }));

  // Who did how much today, and since when each technician has been free.
  const doneRows = await pool.query(
    `SELECT a.staff_id, COUNT(*)::int AS done,
            MAX(COALESCE(a.completed_at, a.date + make_interval(mins => COALESCE(a.duration, 0)))) AS last_finished
       FROM appointments a
      WHERE a.store_id = $1 AND a.status = 'completed' AND a.staff_id IS NOT NULL
        AND (a.date AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date
      GROUP BY a.staff_id`,
    [storeId, tz],
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
              (EXISTS (SELECT 1 FROM appointment_events e WHERE e.appointment_id = a.id AND e.event_type = 'created' AND e.metadata->>'source' = 'nail_ticket')
               OR ABS(EXTRACT(EPOCH FROM (a.created_at - a.date))) < 900
               OR (a.checked_in_at IS NOT NULL AND ABS(EXTRACT(EPOCH FROM (a.checked_in_at - a.created_at))) < 900)) AS walkin
         FROM appointments a
        WHERE a.store_id = $1 AND (a.date AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date
     )
     SELECT COUNT(*) FILTER (WHERE status <> 'cancelled' AND NOT walkin)::int AS appointments,
            COUNT(*) FILTER (WHERE status <> 'cancelled' AND walkin)::int AS walkins,
            COUNT(*) FILTER (WHERE status IN ('no_show', 'no-show'))::int AS no_shows,
            COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (started_at - COALESCE(checked_in_at, date))) / 60))
              FILTER (WHERE started_at IS NOT NULL AND started_at - COALESCE(checked_in_at, date) < interval '6 hours'), 0) AS wait_sum,
            COUNT(*) FILTER (WHERE started_at IS NOT NULL AND started_at - COALESCE(checked_in_at, date) < interval '6 hours')::int AS wait_n,
            AVG(total_paid - COALESCE(tip_amount, 0)) FILTER (WHERE status = 'completed' AND total_paid IS NOT NULL) AS avg_ticket
       FROM t`,
    [storeId, tz],
  );
  const kioskOnly = await pool.query(
    `SELECT COUNT(*)::int AS n FROM kiosk_checkins
      WHERE store_id = $1 AND appointment_id IS NULL AND (created_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date`,
    [storeId, tz],
  );
  const gr = g.rows[0] ?? {};
  // Everyone still waiting counts with the wait they've had so far.
  const nowMs = Date.now();
  const waitingSinceMs = [
    ...tickets.filter((t) => t.status === "confirmed").map((t) => +new Date(t.checkedInAt ?? t.date)),
    ...markers.map((m) => +new Date(m.createdAt)),
  ].map((since) => Math.max(0, (nowMs - since) / 60_000)).filter((m) => m < 360);
  const waitN = (Number(gr.wait_n) || 0) + waitingSinceMs.length;
  const waitSum = (Number(gr.wait_sum) || 0) + waitingSinceMs.reduce((a, b) => a + b, 0);
  const glance: SalonGlance = {
    appointments: Number(gr.appointments) || 0,
    walkIns: (Number(gr.walkins) || 0) + (Number(kioskOnly.rows[0]?.n) || 0),
    noShows: Number(gr.no_shows) || 0,
    avgWaitMin: waitN > 0 ? Math.round(waitSum / waitN) : 0,
    avgTicket: gr.avg_ticket != null ? Math.round(Number(gr.avg_ticket) * 100) / 100 : null,
  };

  // `now` lets every POS station measure "waiting 12 min" against the SERVER clock, so two tablets with different clocks agree.
  return { tickets, markers, techStats: [...stats.values()], glance, now: new Date(nowMs).toISOString() };
}
