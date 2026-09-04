// Client-side reimplementation of getTurnEligibility() (artifacts/api-server/src/routes.ts)
// for use while offline. Mirrors the server algorithm step-for-step using only
// BusinessSnapshot data (plus same-device pending-action/local-booking overlays,
// and the local Consideration-Lock ledger in turn-claims-db.ts) so a future
// server-side change to the ranking logic is easy to port here.
//
// This is a best-effort offline approximation, not a distributed source of
// truth — see the plan doc / PR description for the accepted split-brain risk
// when two different devices are offline at once.

import type { BusinessSnapshot, SnapshotTurnSettings } from "./snapshot-db";
import { actionQueueDB } from "./action-queue-db";
import { appointmentsCacheDB } from "./appointments-cache-db";
import { turnClaimsDB, type TurnClaim } from "./turn-claims-db";
import { toLocalDateStringInTz } from "./timezone";

// Must be kept in sync with DEFAULT_TURN_SETTINGS in artifacts/api-server/src/routes.ts.
const DEFAULT_TURN_SETTINGS_CLIENT: SnapshotTurnSettings = {
  turnEnabled: true,
  autoAdvanceOnCheckout: true,
  useClockInOrder: true,
  allowManagerOverrides: true,
  turnValueThreshold: 30,
  appointmentExclusionWindowMinutes: 20,
  dequeOrder: [],
  lockedStaffIds: [],
  shortTurnProtectedId: null,
  pausedStaffIds: [],
};

export type OfflineTurnTechnician = {
  id: number;
  name: string;
  color: string | null;
  eligible: boolean;
  exclusionReasons: string[];
  turnPosition: number;
  turnCount: number;
  currentStatus: "available" | "busy" | "on_break";
};

export type OfflineTurnEligibility = {
  technicians: OfflineTurnTechnician[];
  eligibleTechnicians: OfflineTurnTechnician[];
  generatedAt: string;
  source: "offline";
};

const BUSY_STATUSES = new Set(["started", "checked_in"]);
const EXCLUDED_TURN_COUNT_STATUSES = new Set(["cancelled", "no_show", "no-show"]);

async function buildOverlay(storeId: number, today: string) {
  const [pending, localBookingsToday] = await Promise.all([
    actionQueueDB.getPending().catch(() => []),
    appointmentsCacheDB.getLocalBookingsForRange(storeId, today, today).catch(() => []),
  ]);

  // staffId -> clock-in-today, applying any not-yet-synced TIMECLOCK_PUNCH actions
  // on top of the snapshot's last-known state.
  const clockPunches = pending.filter((a) => a.type === "TIMECLOCK_PUNCH");

  // appointmentId (real or local temp) -> latest known status, from same-device
  // pending CHECKIN/CHECKOUT/CANCEL_BOOKING/UPDATE_BOOKING actions not yet synced.
  const statusOverrides = new Map<string, string>();
  for (const a of pending) {
    const payload = a.payload as any;
    const id = payload?.id != null ? String(payload.id) : null;
    if (!id) continue;
    if (a.type === "CHECKIN") statusOverrides.set(id, "checked_in");
    else if (a.type === "CHECKOUT") statusOverrides.set(id, "completed");
    else if (a.type === "CANCEL_BOOKING") statusOverrides.set(id, "cancelled");
    else if (a.type === "UPDATE_BOOKING" && typeof payload.status === "string") statusOverrides.set(id, payload.status);
  }

  return { clockPunches, localBookingsToday, statusOverrides };
}

export async function computeOfflineTurnEligibility(
  snapshot: BusinessSnapshot,
  storeId: number,
  serviceId?: number | null
): Promise<OfflineTurnEligibility> {
  const timezone = snapshot.timezone ?? "UTC";
  const today = toLocalDateStringInTz(new Date(), timezone);
  const settings: SnapshotTurnSettings = snapshot.turnSettings ?? DEFAULT_TURN_SETTINGS_CLIENT;

  const [{ clockPunches, localBookingsToday, statusOverrides }, activeClaims] = await Promise.all([
    buildOverlay(storeId, today),
    turnClaimsDB.getActiveForStore(storeId),
  ]);
  const claimedStaffIds = new Set(activeClaims.map((c) => c.staffId));

  // ── Clocked-in-today set + clock-in order (mirrors server's clockInOrder/clockedInToday) ──
  const clockedInToday = new Set<number>();
  const clockInOrder = new Map<number, number>();
  let clockInPos = 0;
  const todayTimeclock = (snapshot.timeclock ?? []).filter((t) => t.workDate === today);
  for (const rec of todayTimeclock) {
    if (!rec.clockOut) {
      if (!clockInOrder.has(rec.staffId)) clockInOrder.set(rec.staffId, clockInPos++);
      clockedInToday.add(rec.staffId);
    }
  }
  // Apply not-yet-synced clock punches on top.
  for (const punch of clockPunches) {
    const p = punch.payload as any;
    const staffId = Number(p?.staffId);
    if (!Number.isFinite(staffId)) continue;
    if (p.action === "clock_in") {
      if (!clockInOrder.has(staffId)) clockInOrder.set(staffId, clockInPos++);
      clockedInToday.add(staffId);
    } else if (p.action === "clock_out") {
      clockedInToday.delete(staffId);
    }
  }

  // ── Appointment view for today: snapshot rows + today's local (offline-created)
  // bookings, both overlaid with any pending status-changing action. ──
  type AptView = { id: string; staffId: number | null; status: string | null; date: string; totalPaid?: string | null; tipAmount?: string | null };
  const aptViews: AptView[] = [];
  for (const a of snapshot.appointments ?? []) {
    if (!a.date || a.date.slice(0, 10) !== today) continue;
    const idKey = String(a.id);
    aptViews.push({
      id: idKey,
      staffId: a.staffId ?? null,
      status: statusOverrides.get(idKey) ?? a.status ?? null,
      date: a.date,
      totalPaid: a.totalPaid,
      tipAmount: a.tipAmount,
    });
  }
  for (const b of localBookingsToday) {
    if (b._syncedRealId) continue; // already represented in snapshot.appointments once synced
    const idKey = b._tempId;
    aptViews.push({
      id: idKey,
      staffId: b.staffId ?? null,
      status: statusOverrides.get(idKey) ?? b.status ?? null,
      date: b.date,
      totalPaid: undefined,
      tipAmount: undefined,
    });
  }

  // ── Turn counts: completed, threshold-qualifying tickets today ──
  const turnValueThreshold = settings.turnValueThreshold ?? DEFAULT_TURN_SETTINGS_CLIENT.turnValueThreshold;
  const turnCountMap = new Map<number, number>();
  for (const apt of aptViews) {
    if (apt.staffId == null || apt.status !== "completed") continue;
    const paid = apt.totalPaid != null ? Number(apt.totalPaid) : NaN;
    const tip = apt.tipAmount != null ? Number(apt.tipAmount) : 0;
    if (!Number.isFinite(paid)) continue;
    if (paid - tip < turnValueThreshold) continue;
    turnCountMap.set(apt.staffId, (turnCountMap.get(apt.staffId) ?? 0) + 1);
  }

  // ── Deque: saved order, filtered to clocked-in-today, new clock-ins appended, sorted by turn count ──
  const savedDeque: number[] = Array.isArray(settings.dequeOrder) ? settings.dequeOrder.map(Number).filter(Number.isFinite) : [];
  const filteredDeque = savedDeque.filter((id) => clockedInToday.has(id));
  const newlyClockedIn = [...clockedInToday]
    .filter((id) => !filteredDeque.includes(id))
    .sort((a, b) => (clockInOrder.get(a) ?? 999) - (clockInOrder.get(b) ?? 999));
  const merged = [...filteredDeque, ...newlyClockedIn];
  const shortTurnPinnedId = typeof settings.shortTurnProtectedId === "number" ? settings.shortTurnProtectedId : null;
  const syncedDeque = [...merged].sort((a, b) => {
    if (shortTurnPinnedId !== null) {
      if (a === shortTurnPinnedId) return -1;
      if (b === shortTurnPinnedId) return 1;
    }
    return (turnCountMap.get(a) ?? 0) - (turnCountMap.get(b) ?? 0);
  });
  const dequePos = new Map<number, number>(syncedDeque.map((id, pos) => [id, pos]));

  // ── Busy right now: appointment status started/checked_in today ──
  const busyStaffIds = new Set<number>();
  for (const apt of aptViews) {
    if (apt.staffId != null && apt.status && BUSY_STATUSES.has(apt.status)) busyStaffIds.add(apt.staffId);
  }

  // ── Upcoming-appointment exclusion window ──
  const windowMinutes = settings.appointmentExclusionWindowMinutes ?? DEFAULT_TURN_SETTINGS_CLIENT.appointmentExclusionWindowMinutes;
  const now = Date.now();
  const windowEndMs = now + windowMinutes * 60_000;
  const upcomingStaffIds = new Set<number>();
  for (const apt of aptViews) {
    if (apt.staffId == null || !apt.status) continue;
    if (EXCLUDED_TURN_COUNT_STATUSES.has(apt.status) || apt.status === "completed") continue;
    const t = new Date(apt.date).getTime();
    if (t >= now && t < windowEndMs) upcomingStaffIds.add(apt.staffId);
  }

  const lockedStaffIdSet = new Set<number>(
    Array.isArray(settings.lockedStaffIds) ? settings.lockedStaffIds.map(Number).filter(Number.isFinite) : []
  );
  const pausedStaffIds = new Set<number>(
    Array.isArray(settings.pausedStaffIds) ? settings.pausedStaffIds.map(Number) : []
  );
  const serviceStaffIds = new Set(
    (snapshot.staffServices ?? []).filter((ss) => !serviceId || ss.serviceId === serviceId).map((ss) => ss.staffId)
  );

  const technicians: OfflineTurnTechnician[] = (snapshot.staff ?? [])
    .filter((m) => m.status !== "removed" && m.status !== "deactivated")
    .map((member) => {
      const isClockedIn = clockedInToday.has(member.id);
      const paused = pausedStaffIds.has(member.id);
      const supportsService = !serviceId || serviceStaffIds.has(member.id);
      const isBusy = busyStaffIds.has(member.id) || lockedStaffIdSet.has(member.id) || claimedStaffIds.has(member.id);
      const hasUpcoming = upcomingStaffIds.has(member.id);
      const exclusionReasons = [
        !isClockedIn ? "not_clocked_in" : null,
        paused ? "paused" : null,
        isBusy ? "currently_busy" : null,
        hasUpcoming ? "appointment_within_exclusion_window" : null,
        !supportsService ? "service_not_supported" : null,
      ].filter((r): r is string => r != null);
      const memberDequePos = dequePos.has(member.id) ? dequePos.get(member.id)! : 999;
      const currentStatus: OfflineTurnTechnician["currentStatus"] = paused ? "on_break" : isBusy ? "busy" : "available";
      return {
        id: member.id,
        name: member.name,
        color: member.color ?? null,
        eligible: exclusionReasons.length === 0,
        exclusionReasons,
        turnPosition: memberDequePos,
        turnCount: turnCountMap.get(member.id) ?? 0,
        currentStatus,
      };
    })
    .sort((a, b) => a.turnPosition - b.turnPosition || a.id - b.id);

  return {
    technicians,
    eligibleTechnicians: technicians.filter((t) => t.eligible),
    generatedAt: new Date().toISOString(),
    source: "offline",
  };
}

// Module-level chained-promise mutex — same pattern as useCreateAppointment's
// _offlineSaveLock (use-appointments.ts) — serialises concurrent claims in the
// same tab so two rapid taps can't both read pre-claim eligibility before
// either writes their claim.
let _turnClaimLock: Promise<void> = Promise.resolve();

/**
 * Picks the next-eligible tech (excluding anyone already locally claimed this
 * offline session) and records the claim. Returns null if no one is eligible.
 * Call turnClaimsDB.tagClaim(claim.id, tempApptId) once the walk-in's temp
 * appointment id is known, so the claim can be released early on cancel.
 */
export async function claimNextOfflineTurnTech(
  snapshot: BusinessSnapshot,
  storeId: number,
  serviceId: number | null | undefined
): Promise<{ technician: OfflineTurnTechnician; claim: TurnClaim } | null> {
  let unlock!: () => void;
  const prev = _turnClaimLock;
  _turnClaimLock = new Promise((res) => { unlock = res; });
  await prev;
  try {
    const eligibility = await computeOfflineTurnEligibility(snapshot, storeId, serviceId);
    const pick = eligibility.eligibleTechnicians[0];
    if (!pick) return null;
    const claim = await turnClaimsDB.add({
      storeId,
      staffId: pick.id,
      tempApptId: "",
      claimedAt: Date.now(),
    });
    return { technician: pick, claim };
  } finally {
    unlock();
  }
}
