/** Typed calls for the nail-salon staff screen. Everything goes through the Certxa API. */
import type { NailConfigView, NailPick } from "./ticketDraft";
import { reportUnauthorized } from "@/lib/resumeSignIn";
import { EMPTY_PICK, normalizeNailConfig, toNailBody } from "./ticketDraft";
import type { Tender } from "@shared/nailCheckout";
import { syncEngine } from "@/lib/sync-engine";
import { nailOffline, nailOfflineStore, isLocalId, isNetworkFailure, newIdempotencyKey, type TicketRecord } from "@/lib/nail-offline";
import { clientPhoneCacheDB } from "@/lib/client-phone-cache-db";
import { overlayBoard } from "./offlineBoard";
import { offlineSaleProblem } from "./offlineSale";
export { offlineSaleProblem };
import { commonOfflineTech, computeOfflineLine, eventsFromDevice, mergeSharedTurns, turnsEarnedOffline, type BaseLine, type LineEvent, type OfflineLine, type OfflineLineTech } from "@/lib/nail-offline/line";
import { foreignTurnEvents } from "@/lib/nail-offline/turnShare";
import { snapshotDB } from "@/lib/snapshot-db";
import type { OfflineBookingData } from "./offlineBooking";
import { estimateWait, type WaitTech } from "@shared/waitEstimate";
import { answerFromMirror, mirrorClient } from "./mirrorAnswers";
import { actionQueueDB } from "@/lib/action-queue-db";

export const boardKey = (storeId: number) => ["/api/nail/board", storeId] as const;

export interface BoardTicket {
  id: number;
  ticketNumber: number | null;
  /** Being rung up on a POS and not saved yet: nobody has it, TURN doesn't see it (2026-10-28). */
  ringingUp?: boolean;
  /** Set on tickets saved together as one visit of several services — the id of the first one. */
  groupId?: number | null;
  /** Waiting for the visit's first ticket (this number) to be done before a technician is given it. */
  waitsForTicket?: number;
  /** The technician pressed DONE: their service is finished and they are free; the ticket waits to be paid. */
  doneAt?: string;
  /** How long the service really took, START to DONE, in minutes. */
  actualMinutes?: number;
  status: "confirmed" | "started";
  date: string;
  checkedInAt: string | null;
  startedAt: string | null;
  duration: number;
  client: { id: number | null; name: string; phone: string | null; loyaltyPoints: number };
  service: { id: number | null; name: string; price: number };
  addons: { id: number; name: string; price: number; duration: number }[];
  nail: {
    sizeId: number | null;
    shapeId: number | null;
    applicationId: number | null;
    effectId: number | null;
    priceAdjustment: number;
    lines: { label: string; price: number }[];
  } | null;
  customLines: { label: string; price: number; isRetail?: boolean; serviceId?: number; duration?: number; packageId?: number }[];
  staff: { id: number; name: string; color: string | null } | null;
  total: number;
  /** Made at the desk (a walk-in), not an advance booking: only walk-ins count in the turn rotation. */
  walkIn?: boolean;
  /** Made on this device while the server was out of reach and not sent yet (see lib/nail-offline). */
  offline?: boolean;
}

export interface BoardMarker {
  id: number;
  ticketNumber: number | null;
  clientId: number | null;
  clientName: string | null;
  phone: string | null;
  createdAt: string;
  /** The technician this client was handed to at the front desk, before any ticket exists (null = still waiting). */
  staffId?: number | null;
  staffName?: string | null;
  /** What the client said they came for at the front desk (a catalog category). */
  requestedCategory?: string | null;
  requestedCategoryId?: number | null;
  /** Checked in on this device while the server was out of reach and not sent yet. */
  offline?: boolean;
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

export interface TechDayStats {
  staffId: number;
  doneToday: number;
  lastFinishedAt: string | null;
  clockedInAt: string | null;
}

export interface SalonGlance {
  appointments: number;
  walkIns: number;
  noShows: number;
  completed: number;
  avgTicket: number | null;
}

export interface NailBoard {
  tickets: BoardTicket[];
  markers: BoardMarker[];
  dayBookings: BoardDayBooking[];
  techStats: TechDayStats[];
  glance?: SalonGlance;
  /** The server's clock when this was built — every station measures elapsed times against it. */
  now?: string;
  /** The next ticket number the salon will give out. */
  nextTicketNumber?: number | null;
  /** Set when this board came from the device because the server could not be reached: when the server last sent it. */
  cachedAt?: string;
}

export interface TurnTech {
  id: number;
  name: string;
  color?: string | null;
  avatarUrl?: string | null;
  eligible: boolean;
  clockedIn?: boolean;
  paused?: boolean;
  /** Turns taken so far today. */
  turnCount?: number;
  /** available | busy | break | off — and when the tech entered it (stored on the server; drives the live timer). */
  availabilityState?: "available" | "busy" | "break" | "off";
  stateSince?: string | null;
  turnPosition?: number;
  exclusionReasons?: string[];
  currentStatus?: "available" | "busy" | "on_break";
  /** True only for an actual started service — distinct from currentStatus "busy", which also
   *  covers a tech merely locked/assigned to a checked-in client who hasn't started yet. */
  inService?: boolean;
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
  waiting: boolean;
  /** Every ticket of the visit when more than one service was saved, the first one included. */
  tickets?: Array<{ appointmentId: number; ticketNumber: number; staffId: number | null; staffName: string | null; serviceId: number; serviceName: string; waiting: boolean }>;
}

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/** Shown when something that needs the server is tried while it cannot be reached. */
export const NEEDS_CONNECTION = "This needs a connection. It will work again once the tablet is back online.";

/**
 * Every read is remembered on the device as it arrives, so the screen still has the last known board,
 * nail options and turn line when the server cannot be reached. A write that gets no answer throws a
 * network failure for its caller to deal with (the callers below save it on the device instead).
 */
/** Reads currently being answered from the device, and when the server last sent each. */
const answeredFromDevice = new Map<string, string>();
/** When the server last sent this read, if what is on screen came from the device; null when it is fresh. */
export const cachedSince = (url: string): string | null => answeredFromDevice.get(url) ?? null;

// ── DONE lock (owner, 2026-10-28): a ticket whose technician pressed DONE can't have its services changed without the
// manager PIN. The server answers 423 DONE_LOCKED; the screen asks for the PIN and repeats the change with it. ──
let overridePin: string | null = null;
export const isDoneLocked = (err: unknown) => err instanceof ApiError && err.data?.code === "DONE_LOCKED";
/** Runs `fn` with the manager PIN sent on its changes (header X-Manager-Pin). */
export async function withManagerPin<T>(pin: string, fn: () => Promise<T>): Promise<T> {
  overridePin = pin;
  try { return await fn(); } finally { overridePin = null; }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const isRead = !init?.method || init.method === "GET";
  const storeId = nailOfflineStore();
  const fromDevice = async (): Promise<{ data: T } | undefined> => {
    const kept = isRead && storeId != null ? await nailOffline.recall<T>(storeId, url).catch(() => undefined) : undefined;
    if (kept) { answeredFromDevice.set(url, kept.at); return kept; }
    // Never read while online: built from the salon's full copy on the tablet, when it has one (mirrorAnswers.ts).
    const built = isRead && storeId != null ? await answerFromMirror(storeId, url) : undefined;
    if (built === undefined) return undefined;
    answeredFromDevice.set(url, new Date().toISOString());
    return { data: built as T };
  };
  // Known to be offline: answer from the device at once instead of waiting for a request to time out.
  if (isRead && syncEngine.isOffline()) {
    const kept = await fromDevice();
    if (kept) return kept.data;
  }
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "include",
      ...init,
      headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(overridePin && !isRead ? { "X-Manager-Pin": overridePin } : {}), ...(init?.headers ?? {}) },
    });
  } catch (err) {
    syncEngine.noteUnreachable();
    const kept = await fromDevice();
    if (kept) return kept.data;
    throw err;
  }
  // Any answer at all, even an error status, means the server was reached.
  syncEngine.noteContact();
  if (res.ok) syncEngine.noteSignedIn();
  if (isRead && res.ok) answeredFromDevice.delete(url);
  if (isRead && res.ok && res.status !== 204 && storeId != null) {
    const copy = await res.clone().json().catch(() => undefined);
    if (copy !== undefined) void nailOffline.remember(storeId, url, copy).catch(() => {});
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (res.status === 401) reportUnauthorized(url);
  if (!res.ok) throw new ApiError(data?.message || data?.error || `Request failed (${res.status})`, res.status, data);
  return data as T;
}

/** The server's board plus whatever was made on this device and has not come back from the server yet. */
/**
 * For data that seldom changes (a service's nail options): answer from this device at once when it has a
 * copy, and ask the server again in the background at most every ten minutes to bring the copy up to date.
 * With no copy yet it is an ordinary request.
 */
const SETTLED_REFRESH_MS = 10 * 60_000;
const settledCheckedAt = new Map<string, number>();
async function callSettled<T>(url: string): Promise<T> {
  const storeId = nailOfflineStore();
  const kept = storeId != null ? await nailOffline.recall<T>(storeId, url).catch(() => undefined) : undefined;
  if (!kept) return call<T>(url);
  const last = settledCheckedAt.get(url) ?? Date.parse(kept.at);
  if (!syncEngine.isOffline() && Date.now() - last > SETTLED_REFRESH_MS) {
    settledCheckedAt.set(url, Date.now());
    void call<T>(url).catch(() => {});
  }
  return kept.data;
}

/** True when this device already holds a copy of a read. */
export const keptOnDevice = async (url: string): Promise<boolean> => {
  const storeId = nailOfflineStore();
  return storeId != null && !!(await nailOffline.recall(storeId, url).catch(() => undefined));
};

/** Fetches one service's nail options so they are on this device before they are needed. */
export const keepNailConfig = (serviceId: number) => call<unknown>(`/api/services/${serviceId}/nail-config`).then(() => undefined);

export const fetchBoard = async (): Promise<NailBoard> => {
  const storeId = nailOfflineStore();
  const local = storeId != null ? await nailOffline.records(storeId).catch(() => []) : [];
  try {
    const board = overlayBoard(await call<NailBoard>("/api/nail/board"), local);
    // Shown from the device, not fresh from the server: say as of when.
    const since = cachedSince("/api/nail/board");
    // Fresh from the server: remember where the salon's ticket numbering has got to, for when the network drops.
    if (!since && storeId != null) {
      const used = [...board.tickets, ...board.markers].map((x) => Number(x.ticketNumber) || 0);
      const highest = Math.max((board.nextTicketNumber ?? 1) - 1, ...used);
      void nailOffline.noteTicketNumbers(storeId, highest).catch(() => {});
    }
    return since ? { ...board, cachedAt: since } : board;
  } catch (err) {
    // Never loaded on this device and no server: the board is whatever was made here.
    if (isNetworkFailure(err) && local.length) return overlayBoard(null, local);
    throw err;
  }
};

export interface TechSignIn {
  /** `frontDesk`: reception / manager / owner — the screen locks on them only after two idle minutes. */
  staff: { id: number; name: string; color: string | null; barberNumber: number; frontDesk?: boolean };
  activeMarker: { id: number; clientId: number | null; clientName: string | null } | null;
  /** A ticket of theirs already in service — the POS goes straight to its checkout. */
  activeTicketId: number | null;
  /** Signing in just gave them this waiting client — the screen announces it and stays locked. */
  justAssigned?: { clientName: string | null; ticketNumber: number | null } | null;
}

const TECH_ROSTER = "device:tech-ids";

/**
 * Tech ID sign-in. Each ID that signs in is remembered on this device, so the same technician can still get
 * past the lock screen while the server cannot be reached. Offline it only says who is at the screen: it does
 * not clock them in or hand them a client — the server does that when the connection is back.
 */
export async function identifyTech(techId: number): Promise<TechSignIn> {
  const storeId = nailOfflineStore();
  const roster = async () => (storeId != null ? (await nailOffline.recall<Record<string, TechSignIn["staff"]>>(storeId, TECH_ROSTER).catch(() => undefined))?.data ?? {} : {});
  const fromDevice = async (): Promise<TechSignIn> => {
    let staff = (await roster())[String(techId)];
    // Never used on this tablet: the salon's staff list kept on the device has every Tech ID.
    if (!staff && storeId != null) {
      const member = (await snapshotDB.load(storeId).catch(() => null))?.staff?.find((m) => Number(m.barberNumber) === techId && (m.status ?? "active") === "active");
      if (member) staff = { id: member.id, name: member.name, color: member.color ?? null, barberNumber: techId, frontDesk: techId >= 90 && techId <= 99 };
    }
    if (!staff) throw new ApiError("No connection, and no one with that ID is on this tablet's staff list. Check the ID, or try again once the tablet is back online.", 0);
    // A technician using the system is clocked in, offline too: on the device now, on the server when it is back.
    if (storeId != null && !staff.frontDesk) {
      const line = await offlineTurnLine(storeId, null).catch(() => null);
      const onLine = line?.technicians.find((t) => t.id === staff!.id);
      if (!onLine || onLine.clockedIn === false) await clockInTech(storeId, staff.id).catch(() => {});
    }
    return { staff, activeMarker: null, activeTicketId: null };
  };
  if (syncEngine.isOffline()) return fromDevice();
  let signedIn: TechSignIn;
  try {
    signedIn = await call<TechSignIn>("/api/nail/identify", { method: "POST", body: JSON.stringify({ barberId: techId }) });
  } catch (err) {
    if (isNetworkFailure(err)) return fromDevice();
    throw err;
  }
  if (storeId != null) void roster().then((known) => nailOffline.remember(storeId, TECH_ROSTER, { ...known, [String(techId)]: signedIn.staff })).catch(() => {});
  return signedIn;
}

/** Calendar records are a fallback for board deployments that only return glance totals. */
export const fetchCalendarBoardBookings = () => {
  const now = Date.now();
  const from = new Date(now - 48 * 60 * 60_000).toISOString();
  const to = new Date(now + 48 * 60 * 60_000).toISOString();
  return call<import("./boardView").CalendarBoardBooking[]>(`/api/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
};

/** Booked visits still to come: today's not arrived yet, then the coming days'. */
export const fetchUpcoming = () => call<BoardDayBooking[]>("/api/nail/upcoming");

const turnUrl = (storeId: number, serviceId: number | null) => `/api/turn/eligibility?storeId=${storeId}${serviceId ? `&serviceId=${serviceId}` : ""}`;

/**
 * The turn line. From the server when it can be reached. Otherwise worked out on this device
 * (lib/nail-offline/line.ts): the server's last line, brought up to date with every clock-in, assignment,
 * payment and cancellation made here since — never the stale copy as it was when the connection dropped.
 */
export const fetchTurn = async (storeId: number, serviceId: number | null): Promise<{ technicians: TurnTech[]; eligibleTechnicians: TurnTech[] }> => {
  const url = turnUrl(storeId, serviceId);
  if (syncEngine.isOffline()) {
    const line = await offlineTurnLine(storeId, serviceId);
    if (line) return line as unknown as { technicians: TurnTech[]; eligibleTechnicians: TurnTech[] };
  }
  const data = await call<{ technicians: TurnTech[]; eligibleTechnicians: TurnTech[] }>(url);
  // The request failed and `call` answered with the device's copy: that copy is the starting point, not the answer.
  if (cachedSince(url)) {
    const line = await offlineTurnLine(storeId, serviceId);
    if (line) return line as unknown as { technicians: TurnTech[]; eligibleTechnicians: TurnTech[] };
  }
  return data;
};

/**
 * The line as this device can work it out with no server. Null when the device has never been sent a line
 * for this salon (it has nothing to start from).
 */
export async function offlineTurnLine(storeId: number, serviceId: number | null): Promise<OfflineLine | null> {
  const recallLine = (sid: number | null) => nailOffline.recall<BaseLine>(storeId, turnUrl(storeId, sid)).catch(() => undefined);
  // The whole salon's line is the starting point (every screen keeps it fresh while online); the line last
  // sent for this one service is the fallback, and says who performs it when the device has no skill list.
  const forService = serviceId ? await recallLine(serviceId) : undefined;
  const kept = (await recallLine(null)) ?? forService;
  if (!kept?.data?.technicians) return null;

  const [records, board, snapshot, pending] = await Promise.all([
    nailOffline.records(storeId).catch(() => [] as Awaited<ReturnType<typeof nailOffline.records>>),
    nailOffline.recall<NailBoard>(storeId, "/api/nail/board").catch(() => undefined),
    snapshotDB.load(storeId).catch(() => null),
    actionQueueDB.getPending().catch(() => [] as Awaited<ReturnType<typeof actionQueueDB.getPending>>),
  ]);

  // Who performs what: the salon's full list when this device holds it, else what the server last said for this service.
  let skills: Map<number, Set<number>> | null = null;
  if (snapshot?.staffServices?.length) {
    skills = new Map();
    for (const row of snapshot.staffServices) {
      if (!skills.has(row.staffId)) skills.set(row.staffId, new Set());
      skills.get(row.staffId)!.add(row.serviceId);
    }
  } else if (serviceId && forService?.data?.technicians) {
    skills = new Map(forService.data.technicians.map((t) => [t.id, new Set(t.supportsService === false ? [] : [serviceId])]));
  }

  // What was done on this device after the server sent that line.
  const since = Date.parse(kept.at);
  const events = eventsFromDevice({
    records, since,
    staffOnBoard: new Map((board?.data?.tickets ?? []).map((t) => [t.id, t.staff?.id ?? null])),
    punches: pending.filter((a) => a.type === "TIMECLOCK_PUNCH" && Number((a.payload as any)?.storeId) === storeId)
      .map((a) => ({ action: String((a.payload as any)?.action), staffId: Number((a.payload as any)?.staffId), at: Number(a.timestamp) || Date.now() })),
    adjustments: pendingTurnAdjustments(pending, storeId),
  });

  const openTickets = overlayBoard(board?.data, records).tickets.map((t) => ({ id: t.id, staffId: t.staff?.id ?? null, status: t.status }));
  // Another POS tablet offline at the same time: what it did counts here too (lib/nail-offline/turnShare.ts).
  const shared = mergeSharedTurns({ events, openTickets, foreign: foreignTurnEvents(storeId), since });
  return computeOfflineLine({ base: kept.data, serviceId, skills, openTickets: shared.openTickets, events: shared.events });
}

/** Turns a manager gave or took on this tablet that are still waiting to be sent. */
const pendingTurnAdjustments = (pending: Awaited<ReturnType<typeof actionQueueDB.getPending>>, storeId: number) =>
  pending.filter((a) => a.type === "TURN_ADJUST" && Number((a.payload as any)?.storeId) === storeId)
    .map((a) => ({ staffId: Number((a.payload as any)?.staffId), units: Number((a.payload as any)?.units), at: Number(a.timestamp) || Date.now() }));

/** This tablet's own turn events since its last server line — what it shares with the other POS tablets. */
export async function ownTurnEvents(storeId: number): Promise<LineEvent[]> {
  const [records, board, pending, kept] = await Promise.all([
    // Only what was done on THIS tablet: a station's work done by the main POS is heard from the main POS.
    nailOffline.localRecords(storeId).catch(() => [] as Awaited<ReturnType<typeof nailOffline.records>>),
    nailOffline.recall<NailBoard>(storeId, "/api/nail/board").catch(() => undefined),
    actionQueueDB.getPending().catch(() => [] as Awaited<ReturnType<typeof actionQueueDB.getPending>>),
    nailOffline.recall<BaseLine>(storeId, turnUrl(storeId, null)).catch(() => undefined),
  ]);
  return eventsFromDevice({
    records, since: kept ? Date.parse(kept.at) : NaN,
    staffOnBoard: new Map((board?.data?.tickets ?? []).map((t) => [t.id, t.staff?.id ?? null])),
    punches: pending.filter((a) => a.type === "TIMECLOCK_PUNCH" && Number((a.payload as any)?.storeId) === storeId)
      .map((a) => ({ action: String((a.payload as any)?.action), staffId: Number((a.payload as any)?.staffId), at: Number(a.timestamp) || Date.now() })),
    adjustments: pendingTurnAdjustments(pending, storeId),
  });
}

export const fetchNailConfig = async (serviceId: number): Promise<NailConfigView | null> =>
  normalizeNailConfig(await callSettled<any>(`/api/services/${serviceId}/nail-config`));

export interface ClientSummary {
  id: number;
  name: string;
  phone: string | null;
  loyaltyPoints: number;
}

/** A client from what this device holds: one made here offline, or one seen before. */
export async function clientOnDevice(id: number): Promise<ClientSummary | null> {
  const storeId = nailOfflineStore();
  if (storeId == null) return null;
  if (isLocalId(id)) {
    const rec = (await nailOffline.records(storeId).catch(() => [])).find((r) => r.kind === "client" && r.id === id);
    return rec && rec.kind === "client" ? { id, name: rec.name, phone: rec.phone, loyaltyPoints: 0 } : null;
  }
  // The salon's full copy (with points) when the tablet has one, else the saved name and number.
  const full = await mirrorClient(storeId, id).catch(() => null);
  if (full) return { id, name: full.name, phone: full.phone, loyaltyPoints: full.loyaltyPoints };
  const kept = await clientPhoneCacheDB.getById(storeId, id).catch(() => null);
  return kept ? { id, name: kept.name, phone: kept.phone10 ?? kept.phone ?? null, loyaltyPoints: 0 } : null;
}

export async function fetchClient(id: number): Promise<ClientSummary> {
  if (isLocalId(id)) {
    const local = await clientOnDevice(id);
    if (local) return local;
    throw new Error("That client is no longer on this device");
  }
  let c: any;
  try {
    c = await call<any>(`/api/customers/${id}`);
  } catch (err) {
    const kept = isNetworkFailure(err) ? await clientOnDevice(id) : null;
    if (kept) return kept;
    throw err;
  }
  return {
    id: c.id,
    name: c.fullName ?? c.name ?? "Client",
    phone: c.phone ?? null,
    loyaltyPoints: Number(c.loyaltyPoints ?? 0),
  };
}

export interface TicketBody {
  serviceId: number;
  addonIds: number[];
  pick: NailPick;
  customLines: { label: string; price: number; isRetail?: boolean; serviceId?: number; duration?: number; packageId?: number }[];
}

/** What a ticket saved on the device needs to be shown and sent later (the server works these out itself when online). */
export interface TicketOfflineContext {
  storeId: number;
  client: { name: string; phone: string | null };
  service: { name: string; price: number; duration: number };
  addons: { id: number; name: string; price: number; duration: number }[];
  nailLines: { label: string; price: number }[];
  nailPriceAdjustment: number;
  staff: TicketRecord["staff"];
  total: number;
  duration: number;
  /** Further services of the same visit; each is saved as its own ticket. */
  extras?: { id: number; name: string; price: number; duration: number }[];
}

type NewTicketBody = TicketBody & {
  clientId: number; staffId?: number | null; checkinId?: number | null; leaveUnassigned?: boolean; autoAssign?: boolean; extraServiceIds?: number[];
  /** A Catalog package as the ticket. Online the server makes its lines from the catalog; `packageLines` are the
   *  same lines made on this tablet (its further services and its price line), used only when the ticket is saved offline. */
  packageId?: number | null;
  packageLines?: TicketBody["customLines"];
};

/**
 * `autoAssign`: TURN gives it to the next tech in line who can do the service (it waits with them until START); nobody free → saved waiting, unassigned.
 *
 * With no server (or for a client or walk-in that itself only exists on this device) the ticket is saved on
 * the device and queued; `offline: true` in the result says so. The request carries one idempotency key
 * whichever way it travels, so a request that reached the server but whose reply was lost is not made twice.
 */
export async function createTicket(
  body: NewTicketBody,
  offline?: TicketOfflineContext,
): Promise<CreatedTicket & { offline?: boolean }> {
  const key = newIdempotencyKey("ticket.create");
  const saveOnDevice = async (): Promise<CreatedTicket & { offline: boolean }> => {
    if (!offline) throw new Error(NEEDS_CONNECTION);
    // Nobody chosen: the turn line as this device last knew it decides, skipping anyone this device has
    // already given a client to while offline. The ticket is marked as assigned offline.
    let staff = offline.staff;
    let assignedOffline = false;
    const asStaff = (t: OfflineLineTech): NonNullable<TicketRecord["staff"]> => ({ id: t.id, name: t.name, color: (t.color as string | null | undefined) ?? null });
    const extras = offline.extras ?? [];
    // A technician chosen by staff must be someone who is clocked in and performs the service, offline as online.
    if (staff) {
      const problem = await offlineAssignProblem(offline.storeId, body.serviceId, staff.id);
      if (problem) throw new ApiError(problem, 400);
    }
    // One technician for the whole visit when one person can take every service of it.
    let visitTech: OfflineLineTech | null = null;
    const packageLines = body.packageLines ?? [];
    const pkgIds = packageLines.filter((l) => l.serviceId).map((l) => l.serviceId!);
    if (!staff && body.autoAssign && !body.leaveUnassigned) {
      if (extras.length > 0 || pkgIds.length > 0) {
        const ids = [body.serviceId, ...pkgIds, ...extras.map((e) => e.id)];
        const lines = (await Promise.all(ids.map((id) => offlineTurnLine(offline.storeId, id)))).filter((l): l is OfflineLine => !!l);
        if (lines.length === ids.length) visitTech = commonOfflineTech(lines);
      }
      const next = visitTech ?? await offlineTurnPick(offline.storeId, body.serviceId);
      if (next) { staff = asStaff(next); assignedOffline = true; }
    }
    // Every further service the visit's technician can do goes on this ticket as a service line (as online,
    // nailTickets.createNailTicketGroup); one they can't do becomes its own ticket for whoever is next for it.
    const onTicket: typeof extras = [];
    const ownTickets: typeof extras = [];
    for (const extra of extras) {
      if (!staff || visitTech || !(await offlineAssignProblem(offline.storeId, extra.id, staff.id))) onTicket.push(extra);
      else ownTickets.push(extra);
    }
    const serviceLines = onTicket.map((e) => ({ label: e.name, price: e.price, serviceId: e.id, duration: e.duration }));
    const rec = await nailOffline.createTicket({
      storeId: offline.storeId, clientId: body.clientId, clientName: offline.client.name, phone: offline.client.phone, walkinId: body.checkinId ?? null,
      service: { id: body.serviceId, ...offline.service }, addons: offline.addons,
      nail: toNailBody(body.pick), nailLines: offline.nailLines, nailPriceAdjustment: offline.nailPriceAdjustment,
      // A package's own lines first: its further services and its price line, all with this ticket's technician.
      customLines: [...packageLines, ...serviceLines, ...body.customLines], staff, assignedOffline,
      total: offline.total + [...packageLines, ...serviceLines].reduce((n, l) => n + l.price, 0),
      duration: offline.duration + [...packageLines, ...serviceLines].reduce((n, l) => n + (l.serviceId ? Number(l.duration) || 0 : 0), 0),
    }, key);
    for (const extra of ownTickets) {
      // Saved with nobody on it, as online: the client is still with the first technician. Staff assign it when
      // the client is ready for it.
      const extraStaff: TicketRecord["staff"] = null;
      await nailOffline.createTicket({
        storeId: offline.storeId, clientId: body.clientId, clientName: offline.client.name, phone: offline.client.phone, walkinId: null,
        service: extra, addons: [], nail: toNailBody(EMPTY_PICK), nailLines: [], nailPriceAdjustment: 0,
        customLines: [], staff: extraStaff, assignedOffline: !!extraStaff, total: extra.price, duration: extra.duration,
      }, newIdempotencyKey("ticket.create"));
    }
    return { appointmentId: rec.id, ticketNumber: rec.ticketNumber ?? 0, staffId: rec.staff?.id ?? null, staffName: rec.staff?.name ?? null, status: "confirmed",
      startsAt: rec.createdAt, duration: rec.duration, price: rec.total, waiting: true, offline: true };
  };
  // Anything it depends on that the server has never heard of means it cannot be sent yet either.
  if (syncEngine.isOffline() || isLocalId(body.clientId) || isLocalId(body.checkinId)) return saveOnDevice();
  try {
    return await createTicketOnServer(body, key);
  } catch (err) {
    if (!isNetworkFailure(err)) throw err;
    return saveOnDevice();
  }
}

/** The next technician in line for this service, as this device can work it out with no server. */
async function offlineTurnPick(storeId: number, serviceId: number): Promise<OfflineLineTech | null> {
  const line = await offlineTurnLine(storeId, serviceId);
  // With the turn system switched off nobody is handed a client automatically, offline as online.
  if (!line || line.settings.turnEnabled === false) return null;
  return line.eligibleTechnicians[0] ?? null;
}

/**
 * Why this technician cannot be given a ticket for this service while offline — the same two rules the
 * server holds: they must be clocked in, and they must perform the service. Null when they can (or when
 * the device has no line to judge by).
 */
async function offlineAssignProblem(storeId: number, serviceId: number, staffId: number): Promise<string | null> {
  const line = await offlineTurnLine(storeId, serviceId);
  const tech = line?.technicians.find((t) => t.id === staffId);
  if (!tech) return null;
  if (!tech.clockedIn) return `${tech.name} isn't clocked in.`;
  if (!tech.supportsService) return `${tech.name} doesn't perform this service.`;
  return null;
}

/** How long services really take against the time planned, per technician and per service, over the last `days`. */
export interface ServiceTimeRow { id: number; name: string; count: number; actual: number; planned: number; total_actual?: number }
export const fetchServiceTimes = (days: number) =>
  call<{ days: number; byTech: ServiceTimeRow[]; byService: ServiceTimeRow[] }>(`/api/nail/service-times?days=${days}`);

/** DONE: the technician has finished their service. They are free again and back in line; the ticket stays
 *  open until it is paid, and a ticket of the same visit waiting for it goes to the next technician. Needs the server. */
export const markTicketDone = (ticketId: number) => {
  if (syncEngine.isOffline() || isLocalId(ticketId)) return Promise.reject(new ApiError("Marking a ticket done needs the connection. Check it out instead.", 503));
  return call<{ ok: boolean }>(`/api/nail/tickets/${ticketId}/done`, { method: "POST", body: "{}" });
};

/** Split Ticket: the service line at `index` (its place among the saved ticket's lines) becomes its own ticket,
 *  waiting with no technician until this one is done. Needs the server. */
/** A ticket's number as shown: every ticket of a visit shows the visit's number (owner, 2026-10-28: no "12-2" —
 *  staff type 12 at lookup and get the whole visit); its id before it has a number. */
export const ticketNo = (t: { id: number; ticketNumber?: number | null }) => (t.ticketNumber != null ? String(t.ticketNumber) : String(t.id));

// ── Ringing up on the server (2026-10-28): the ticket exists from the first key, so every station sees it. ──
/** The first service tapped for a client: the ticket is made now, "being rung up" — TURN gets it on SAVE. */
export const startRingingUp = (body: { clientId: number; serviceId: number; addonIds: number[]; pick: NailPick;
  customLines: TicketBody["customLines"]; checkinId: number | null; packageId?: number | null; extraServiceIds?: number[] }) =>
  call<CreatedTicket>("/api/nail/tickets", {
    method: "POST", headers: { "X-Idempotency-Key": newIdempotencyKey("ticket.ringup") },
    body: JSON.stringify({ clientId: body.clientId, serviceId: body.serviceId, addonIds: body.addonIds, nail: toNailBody(body.pick),
      customLines: body.customLines, checkinId: body.checkinId, ringingUp: true,
      ...(body.packageId ? { packageId: body.packageId } : {}), ...(body.extraServiceIds?.length ? { extraServiceIds: body.extraServiceIds } : {}) }),
  });
/** A retail-only sale with no client: recorded under the staff member selling it, then paid at checkout. */
export const startRetailSale = (staffId: number, lines: { label: string; price: number }[]) =>
  call<{ appointmentId: number; ticketNumber: number | null }>("/api/nail/retail-sale", { method: "POST", body: JSON.stringify({ staffId, lines }) });
/** SAVE on a ticket being rung up: TURN gets it (a named technician, else the next one free). */
export const saveRingingUp = (ticketId: number, staffId: number | null) =>
  call<{ ticketNumber: number | null; staffName: string | null; waiting: boolean; tickets: { appointmentId: number; serviceName: string; staffName: string | null }[] }>(
    `/api/nail/tickets/${ticketId}/save`, { method: "POST", body: JSON.stringify({ staffId }) });
/** CLEAR on a ticket being rung up that was never saved: it goes, and its check-in is waiting again. */
export const discardRingingUp = (ticketId: number) => call<{ ok: true }>(`/api/nail/tickets/${ticketId}/discard`, { method: "POST" });
/** A keypad amount (or Quick Ticket step / retail item) on an open ticket. */
export const addTicketLine = (ticketId: number, line: { label: string; price: number; isRetail?: boolean }) => {
  if (syncEngine.isOffline() || isLocalId(ticketId)) return Promise.reject(new ApiError("Adding to a saved ticket needs the connection.", 503));
  return call<{ ok: true }>(`/api/nail/tickets/${ticketId}/lines`, { method: "POST", body: JSON.stringify(line) });
};
/** Takes the keypad line at `index` (among the ticket's lines) off an open ticket. */
export const removeTicketLine = (ticketId: number, index: number) => {
  if (syncEngine.isOffline() || isLocalId(ticketId)) return Promise.reject(new ApiError("Changing a saved ticket needs the connection.", 503));
  return call<{ ok: true }>(`/api/nail/tickets/${ticketId}/lines/remove`, { method: "POST", body: JSON.stringify({ index }) });
};

/** A service key on an open ticket: its technician does it when they can, otherwise it becomes its own ticket of the
 *  visit for the next technician in turn (server: POST /api/nail/tickets/:id/services). */
export const addTicketService = (ticketId: number, serviceId: number) => {
  if (syncEngine.isOffline() || isLocalId(ticketId)) return Promise.reject(new ApiError("Adding a service to a saved ticket needs the connection.", 503));
  return call<{ added: "ticket" | "own_ticket"; appointmentId: number; ticketNumber?: number; staffName?: string | null }>(
    `/api/nail/tickets/${ticketId}/services`, { method: "POST", body: JSON.stringify({ serviceId }) });
};
/** An add-on key on the POS grid: saved onto the open ticket as a real add-on. `added: false` = it was already on. */
export const addTicketAddon = (ticketId: number, addonId: number) => {
  if (syncEngine.isOffline() || isLocalId(ticketId)) return Promise.reject(new ApiError("Adding an add-on to a saved ticket needs the connection.", 503));
  return call<{ added: boolean }>(`/api/nail/tickets/${ticketId}/addons`, { method: "POST", body: JSON.stringify({ addonId }) });
};
export const removeTicketAddon = (ticketId: number, addonId: number) => {
  if (syncEngine.isOffline() || isLocalId(ticketId)) return Promise.reject(new ApiError("Taking an add-on off a saved ticket needs the connection.", 503));
  return call<{ ok: true }>(`/api/nail/tickets/${ticketId}/addons/remove`, { method: "POST", body: JSON.stringify({ addonId }) });
};
/** A Catalog package key on an open ticket: its services, add-ons and price line join the ticket. */
export const addTicketPackage = (ticketId: number, packageId: number) => {
  if (syncEngine.isOffline() || isLocalId(ticketId)) return Promise.reject(new ApiError("Adding a package to a saved ticket needs the connection.", 503));
  return call<{ ok: true; name: string }>(`/api/nail/tickets/${ticketId}/packages`, { method: "POST", body: JSON.stringify({ packageId }) });
};

/** Takes the service line at `index` (among the ticket's lines) off an open ticket. */
export const removeTicketServiceLine = (ticketId: number, index: number) => {
  if (syncEngine.isOffline() || isLocalId(ticketId)) return Promise.reject(new ApiError("Taking a service off a saved ticket needs the connection.", 503));
  return call<{ ok: true }>(`/api/nail/tickets/${ticketId}/services/remove`, { method: "POST", body: JSON.stringify({ index }) });
};

export const splitTicketService = (ticketId: number, index: number) => {
  if (syncEngine.isOffline() || isLocalId(ticketId)) return Promise.reject(new ApiError("Splitting a ticket needs the connection.", 503));
  return call<{ appointmentId: number; ticketNumber: number; serviceName: string }>(`/api/nail/tickets/${ticketId}/split`, {
    method: "POST", body: JSON.stringify({ index }),
  });
};

const createTicketOnServer = (body: NewTicketBody, key: string) =>
  call<CreatedTicket>("/api/nail/tickets", {
    method: "POST",
    headers: { "X-Idempotency-Key": key },
    body: JSON.stringify({
      clientId: body.clientId,
      serviceId: body.serviceId,
      addonIds: body.addonIds,
      nail: toNailBody(body.pick),
      customLines: body.customLines,
      staffId: body.staffId ?? null,
      leaveUnassigned: body.leaveUnassigned === true,
      autoAssign: body.autoAssign === true,
      checkinId: body.checkinId ?? null,
      // The visit's further services (on this ticket, or their own when its technician can't do them) and a package.
      ...(body.extraServiceIds?.length ? { extraServiceIds: body.extraServiceIds } : {}),
      ...(body.packageId ? { packageId: body.packageId } : {}),
    }),
  });

/**
 * Change what is on a ticket. One that only exists on this device is simply rewritten there. One the server
 * has is changed there — or, with no server, the change is kept on the device and sent later along with what
 * the ticket looked like when it was edited, so the server can refuse it if someone else changed it meanwhile.
 */
export async function updateTicket(id: number, body: TicketBody, expected?: BoardTicket, offline?: Omit<TicketOfflineContext, "client" | "staff">): Promise<{ duration: number; price: number; offline?: boolean }> {
  const view = offline && {
    service: { id: body.serviceId, name: offline.service.name, price: offline.service.price }, addons: offline.addons, customLines: body.customLines,
    total: offline.total, duration: offline.duration,
  };
  if (isLocalId(id)) {
    if (!offline) throw new Error(NEEDS_CONNECTION);
    const t = await nailOffline.editLocal(id, { service: { id: body.serviceId, ...offline.service }, addons: offline.addons, nail: toNailBody(body.pick),
      nailLines: offline.nailLines, nailPriceAdjustment: offline.nailPriceAdjustment, customLines: body.customLines, total: offline.total, duration: offline.duration });
    return { duration: t.duration, price: t.total, offline: true };
  }
  const queue = async () => {
    if (!offline || !view) throw new Error(NEEDS_CONNECTION);
    await nailOffline.changeServerTicket(offline.storeId, { id, clientName: expected?.client.name ?? "Client" }, { type: "update", view, body: updateBody(body, expected) });
    return { duration: offline.duration, price: offline.total, offline: true };
  };
  if (syncEngine.isOffline()) return queue();
  try {
    return await updateTicketOnServer(id, body, expected);
  } catch (err) {
    if (!isNetworkFailure(err)) throw err;
    return queue();
  }
}

const updateBody = (body: TicketBody, expected?: BoardTicket) => ({ serviceId: body.serviceId, addonIds: body.addonIds, nail: toNailBody(body.pick), customLines: body.customLines,
  expected: expected ? { serviceId: expected.service.id, duration: expected.duration, addonIds: expected.addons.map((a) => a.id), customLines: expected.customLines,
    nail: expected.nail ? { nailSizeId: expected.nail.sizeId, nailShapeId: expected.nail.shapeId,
      nailArtApplicationId: expected.nail.applicationId, nailArtEffectId: expected.nail.effectId } : null } : undefined });

const updateTicketOnServer = (id: number, body: TicketBody, expected?: BoardTicket) =>
  call<{ duration: number; price: number }>(`/api/nail/tickets/${id}`, {
    method: "PUT",
    body: JSON.stringify({ serviceId: body.serviceId, addonIds: body.addonIds, nail: toNailBody(body.pick), customLines: body.customLines,
      expected: expected ? { serviceId: expected.service.id, duration: expected.duration, addonIds: expected.addons.map((a) => a.id), customLines: expected.customLines,
        nail: expected.nail ? { nailSizeId: expected.nail.sizeId, nailShapeId: expected.nail.shapeId,
          nailArtApplicationId: expected.nail.applicationId, nailArtEffectId: expected.nail.effectId } : null } : undefined }),
  });

/** A write the server has to answer: with no answer, say plainly that it needs a connection. */
const needsServer = async <T,>(run: () => Promise<T>): Promise<T> => {
  try { return await run(); } catch (err) { throw isNetworkFailure(err) ? new Error(NEEDS_CONNECTION) : err; }
};

/**
 * A change to a ticket the server has: made there, or — with no server — kept on this device and sent in
 * order when the connection is back (lib/nail-offline `changeServerTicket`).
 */
async function onServerOrQueued<T>(run: () => Promise<T>, queue: () => Promise<T>): Promise<T> {
  if (syncEngine.isOffline()) return queue();
  try { return await run(); } catch (err) { if (!isNetworkFailure(err)) throw err; return queue(); }
}
const storeOrThrow = (): number => { const s = nailOfflineStore(); if (s == null) throw new Error(NEEDS_CONNECTION); return s; };
/** The ticket as the server last sent it to this device: what a change made offline is based on. */
async function asLastSeen(id: number, clientName?: string): Promise<{ id: number; clientName: string; status?: string; staffId?: number | null }> {
  const board = (await nailOffline.recall<NailBoard>(storeOrThrow(), "/api/nail/board").catch(() => undefined))?.data;
  const t = board?.tickets.find((x) => x.id === id);
  return t ? { id, clientName: clientName ?? t.client.name, status: t.status, staffId: t.staff?.id ?? null } : { id, clientName: clientName ?? "Client" };
}

/** `staff`: the technician's name and colour; `clientName`: whose ticket — both needed when the change is kept on this device. */
export const reassignTicket = async (id: number, staffId: number, staff?: { name: string; color?: string | null }, clientName?: string, reason?: string | null) => {
  const chosen = { id: staffId, name: staff?.name ?? "Technician", color: staff?.color ?? null };
  // Kept on this device, the hand-over is checked here the way the server would check it.
  const checkOffline = async () => {
    const storeId = storeOrThrow();
    const local = isLocalId(id) ? (await nailOffline.records(storeId).catch(() => [])).find((r) => r.kind === "ticket" && r.id === id) : undefined;
    const board = isLocalId(id) ? undefined : (await nailOffline.recall<NailBoard>(storeId, "/api/nail/board").catch(() => undefined))?.data;
    const serviceId = local && local.kind === "ticket" ? local.service.id : board?.tickets.find((t) => t.id === id)?.service.id;
    const problem = serviceId ? await offlineAssignProblem(storeId, serviceId, staffId) : null;
    if (problem) throw new ApiError(problem, 400);
  };
  if (isLocalId(id)) {
    await checkOffline();
    const t = await nailOffline.assign(id, chosen);
    return { staffId, staffName: t.staff?.name ?? "", status: t.status, startsAt: t.createdAt };
  }
  return onServerOrQueued(
    () => call<{ staffId: number; staffName: string; status: string; startsAt: string }>(`/api/nail/tickets/${id}/reassign`, { method: "POST", body: JSON.stringify({ staffId, ...(reason ? { reason } : {}) }) }),
    async () => {
      await checkOffline();
      await nailOffline.changeServerTicket(storeOrThrow(), await asLastSeen(id, clientName), { type: "reassign", staff: chosen });
      return { staffId, staffName: chosen.name, status: "confirmed", startsAt: new Date().toISOString() };
    },
  );
};

export const startTicket = (id: number, clientName?: string): Promise<unknown> =>
  isLocalId(id) ? nailOffline.start(id)
  : onServerOrQueued<unknown>(
    () => call(`/api/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status: "started" }) }),
    async () => nailOffline.changeServerTicket(storeOrThrow(), await asLastSeen(id, clientName), { type: "start" }),
  );

export const cancelTicket = (id: number, clientName?: string): Promise<unknown> =>
  isLocalId(id) ? nailOffline.cancel(id)
  : onServerOrQueued<unknown>(
    () => call(`/api/appointments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "cancelled", cancellationReason: "Cancelled at check-in", calendarHidden: true }),
    }),
    async () => nailOffline.changeServerTicket(storeOrThrow(), await asLastSeen(id, clientName), { type: "cancel" }),
  );

/**
 * With no server, a clock-in or clock-out is kept on this device with the time it was really made and sent
 * when the connection is back (the app's action queue, TIMECLOCK_PUNCH). The turn line on this device
 * counts it at once. Returns false when the server can be reached — the caller then asks it directly.
 */
async function punchOffline(storeId: number, staffId: number, action: "clock_in" | "clock_out", failed = false): Promise<boolean> {
  if (!failed && !syncEngine.isOffline()) return false;
  if (failed) syncEngine.noteUnreachable();
  const now = Date.now();
  await actionQueueDB.add({
    type: "TIMECLOCK_PUNCH", entity_temp_id: `punch_${staffId}_${now}`, timestamp: now,
    idempotency_key: newIdempotencyKey("timeclock.punch"),
    payload: { action, staffId, storeId, at: new Date(now).toISOString() },
  });
  return true;
}

/**
 * Turns a manager gave or took with no connection (the PIN was checked against the one this tablet last saw
 * accepted): counted in this tablet's line at once, and sent (POST /api/nail/turn-adjust, under its own key)
 * when the connection is back. The server checks the PIN again then.
 */
export async function queueTurnAdjust(storeId: number, body: { staffId: number; units: number; reason: string; managerPin: string }): Promise<void> {
  const now = Date.now();
  await actionQueueDB.add({
    type: "TURN_ADJUST", entity_temp_id: `turn_adjust_${body.staffId}_${now}`, timestamp: now,
    idempotency_key: newIdempotencyKey("nail.turn-adjust"),
    payload: { storeId, ...body },
  });
}

/**
 * A receipt to text, kept on this device when the server cannot be reached; it is sent when the connection
 * is back (after the ticket and its sale, if they were made offline too). The snapshot is what was on screen.
 */
export async function queueReceiptText(storeId: number, appointmentId: number, phone: string, snapshot: unknown): Promise<void> {
  const now = Date.now();
  await actionQueueDB.add({
    type: "RECEIPT_TEXT", entity_temp_id: `receipt_${appointmentId}_${now}`, timestamp: now,
    idempotency_key: newIdempotencyKey("receipt.text"),
    payload: { storeId, appointmentId, phone, snapshot },
  });
}

/**
 * What this tablet knows for booking a future visit with no connection (see offlineBooking.ts): the salon data
 * it holds, plus today's board, the last Upcoming list and the bookings already queued here, all of which take
 * time. Null when the tablet has never been sent the salon data.
 */
export async function loadOfflineBookingData(storeId: number, timezone: string, extraServiceId: number | null): Promise<{ data: OfflineBookingData; extraDuration: number } | null> {
  const [snapshot, board, upcoming, records, pending] = await Promise.all([
    snapshotDB.load(storeId).catch(() => null),
    nailOffline.recall<NailBoard>(storeId, "/api/nail/board").catch(() => undefined),
    nailOffline.recall<BoardDayBooking[]>(storeId, "/api/nail/upcoming").catch(() => undefined),
    nailOffline.records(storeId).catch(() => [] as Awaited<ReturnType<typeof nailOffline.records>>),
    actionQueueDB.getPending().catch(() => [] as Awaited<ReturnType<typeof actionQueueDB.getPending>>),
  ]);
  if (!snapshot?.storeHours?.length) return null;
  const staff = (snapshot.staff ?? []).filter((m) => (m.status ?? "active") === "active").map((m) => ({ id: m.id, name: m.name }));
  const byName = new Map(staff.map((m) => [m.name, m.id]));
  const skills = new Map<number, Set<number>>();
  for (const row of snapshot.staffServices ?? []) {
    if (!skills.has(row.staffId)) skills.set(row.staffId, new Set());
    skills.get(row.staffId)!.add(row.serviceId);
  }
  const span = (staffId: number | null | undefined, date: string, minutes: number) =>
    staffId ? [{ staffId: Number(staffId), start: Date.parse(date), end: Date.parse(date) + (Number(minutes) || 0) * 60_000 }] : [];
  const busy = [
    ...(snapshot.appointments ?? []).filter((a) => !["cancelled", "no_show", "no-show"].includes(String(a.status)))
      .flatMap((a) => span(a.staffId, a.date, a.duration)),
    ...overlayBoard(board?.data, records).tickets.flatMap((t) => span(t.staff?.id, t.startedAt ?? t.date, t.duration)),
    ...(upcoming?.data ?? []).flatMap((b) => span(b.staffName ? byName.get(b.staffName) : null, b.date, b.duration)),
    ...pending.filter((a) => a.type === "NAIL_BOOKING" && Number((a.payload as any)?.storeId) === storeId).flatMap((a) => {
      const p = a.payload as any;
      // A package booked offline: each technician's part of the visit, in order.
      if (Array.isArray(p.legs)) {
        let t = Date.parse(p.date);
        return (p.legs as { staffId: number; minutes: number }[]).flatMap((l) => { const at = t; t += (Number(l.minutes) || 0) * 60_000; return span(l.staffId, new Date(at).toISOString(), l.minutes); });
      }
      const firstMinutes = p.extraStaffId ? Number(p.duration) - Number(p.extraDuration) : Number(p.duration);
      return [...span(p.staffId, p.date, firstMinutes),
        ...(p.extraStaffId ? span(p.extraStaffId, new Date(Date.parse(p.date) + firstMinutes * 60_000).toISOString(), Number(p.extraDuration)) : [])];
    }),
  ];
  const extraDuration = extraServiceId ? Number((snapshot.services ?? []).find((x) => x.id === extraServiceId)?.duration ?? 0) || 0 : 0;
  return {
    data: { timezone: snapshot.timezone || timezone, hours: snapshot.storeHours, rules: snapshot.staffAvailability ?? [], staff, skills, busy,
      serviceMinutes: new Map((snapshot.services ?? []).map((x) => [x.id, Number(x.duration) || 0])) },
    extraDuration,
  };
}

/**
 * A future visit booked with no connection: kept on this tablet and sent (POST /api/nail/bookings, under its own
 * key) when the connection is back. The server checks the time again then; if it was taken meanwhile the front
 * desk is told. `duration` is the whole visit, `extraDuration` the second service's part.
 */
export async function queueBooking(storeId: number, body: { clientId: number; serviceId: number; extraServiceId?: number | null; addonIds: number[]; staffId: number; extraStaffId?: number | null; date: string;
  packageId?: number; serviceIds?: number[]; staffIds?: number[] },
  times: { duration: number; extraDuration: number; legs?: { staffId: number; minutes: number }[] }, label: string, key: string = newIdempotencyKey("nail.booking")): Promise<void> {
  const now = Date.now();
  await actionQueueDB.add({
    type: "NAIL_BOOKING", entity_temp_id: `booking_${now}`, timestamp: now,
    idempotency_key: key,
    payload: { storeId, ...body, ...times, info: { label } },
  });
}

/**
 * A booking this client has today that has not been checked in, from the salon data this tablet holds (for a
 * kiosk check-in with no internet). Null when there is none, or the tablet has no salon data.
 */
export async function todaysBookingOnDevice(storeId: number, timezone: string, clientId: number): Promise<{ id: number; serviceName: string; staffName: string | null; appointmentTime: string } | null> {
  const snapshot = await snapshotDB.load(storeId).catch(() => null);
  if (!snapshot) return null;
  const tz = snapshot.timezone || timezone;
  const dayOf = (d: Date | string | number) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(d));
  const today = dayOf(Date.now());
  const appt = (snapshot.appointments ?? [])
    .filter((a) => Number(a.customerId) === clientId && dayOf(a.date) === today && ["pending", "confirmed"].includes(String(a.status)))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))[0];
  if (!appt) return null;
  return {
    id: appt.id,
    serviceName: (snapshot.services ?? []).find((sv) => sv.id === appt.serviceId)?.name ?? "Appointment",
    staffName: (snapshot.staff ?? []).find((m) => m.id === appt.staffId)?.name ?? null,
    appointmentTime: new Date(appt.date).toISOString(),
  };
}

/**
 * Whether someone can take a walk-in now, and roughly how long the wait is, from this tablet's board and
 * turn line — the same estimate the Queue tab shows (shared/waitEstimate.ts). For the kiosk with no internet.
 */
export async function waitOnDevice(storeId: number): Promise<{ hasAvailableStaff: boolean; estimatedWaitMinutes: number | null }> {
  const [line, board] = await Promise.all([offlineTurnLine(storeId, null).catch(() => null), fetchBoard().catch(() => null)]);
  const now = Date.now();
  const tickets = board?.tickets ?? [];
  const started = tickets.filter((t) => t.status === "started");
  const waitingTickets = tickets.filter((t) => t.status === "confirmed");
  const techs: WaitTech[] = (line?.technicians ?? []).map((t) => {
    const current = started.find((x) => x.staff?.id === t.id);
    return {
      id: t.id, clockedIn: !!t.clockedIn, paused: !!t.paused, busy: !!current,
      remainingMin: current ? (Date.parse(current.startedAt ?? current.date) + current.duration * 60_000 - now) / 60_000
        : waitingTickets.some((x) => x.staff?.id === t.id) ? 0 : null,
    };
  });
  const waiting = [
    ...waitingTickets.map((t) => ({ durationMin: t.duration, staffId: t.staff?.id ?? null })),
    ...(board?.markers ?? []).map(() => ({ durationMin: null, staffId: null })),
  ];
  const e = estimateWait({ techs, waiting });
  return { hasAvailableStaff: e.staffIn > 0 && (e.minutes ?? 0) <= 0, estimatedWaitMinutes: e.minutes };
}

/** Text the client that their technician is ready. Needs the server. */
export const textClientReady = (id: number) =>
  needsServer(() => call<{ sent: boolean; alreadySent?: boolean }>(`/api/nail/tickets/${id}/text-ready`, { method: "POST" }));

/** Front-desk override: put a technician on the clock and into the turn order (the server tells every station). */
export async function clockInTech(storeId: number, staffId: number): Promise<void> {
  if (await punchOffline(storeId, staffId, "clock_in")) return;
  const res = await fetch("/api/timeclock/clock-in", {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storeId, staffId }),
  }).catch(async (err) => { if (await punchOffline(storeId, staffId, "clock_in", true)) return null; throw err; });
  if (!res) return;
  // 409 = already clocked in (someone got there first) — that is the state we wanted.
  if (!res.ok && res.status !== 409) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.error || data?.message || "Couldn't clock them in", res.status, data);
  }
}

/** Front-desk override: take a technician off the clock and out of the turn order (the server tells every station). */
export async function clockOutTech(storeId: number, staffId: number): Promise<void> {
  if (await punchOffline(storeId, staffId, "clock_out")) return;
  const res = await fetch("/api/timeclock/clock-out", {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storeId, staffId }),
  }).catch(async (err) => { if (await punchOffline(storeId, staffId, "clock_out", true)) return null; throw err; });
  if (!res) return;
  // 404 = no open clock-in (someone already clocked them out) — that is the state we wanted.
  if (!res.ok && res.status !== 404) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.error || data?.message || "Couldn't clock them out", res.status, data);
  }
}

/** A check-in with no client record: match it to a client by its phone, or save it as a new client. */
export const resolveMarkerClient = (id: number) =>
  call<{ clientId: number }>(`/api/nail/markers/${id}/client`, { method: "POST" });

export interface NailScreenSettings {
  /** Off = no technician sign-in or idle lock. */
  lockScreen: boolean;
  /** Off = scanner-only lock screen with no visible numeric keypad. */
  keypadVisible: boolean;
}

/** Salon-wide /nail lock-screen settings. */
export const fetchScreenSettings = () => call<NailScreenSettings>("/api/nail/screen-settings");
export const saveScreenSettings = (settings: Partial<NailScreenSettings>) =>
  call<NailScreenSettings>("/api/nail/screen-settings", { method: "PUT", body: JSON.stringify(settings) });

/** The key grid a manager arranged (null = automatic, from the catalog). */
export const fetchPosGrid = () => call<{ config: import("@shared/posGrid").PosGridConfig | null }>("/api/nail/pos-grid");
export const savePosGrid = (config: import("@shared/posGrid").PosGridConfig | null) =>
  call<{ config: import("@shared/posGrid").PosGridConfig | null }>("/api/nail/pos-grid", { method: "PUT", body: JSON.stringify({ config }) });

export const removeMarker = (id: number) =>
  isLocalId(id) ? nailOffline.cancel(id) : needsServer(() => call(`/api/kiosk/board/${id}`, { method: "DELETE" }));

export const fetchAppointment = (id: number) => call<any>(`/api/appointments/${id}`);

export interface FinalizeData {
  idempotencyKey: string;
  tenders: Tender[];
  extras?: { label: string; price: number }[];
  paymentMethod: string;
  tip: number;
  discount: number;
  /** Sales tax on the whole sale, already included in totalPaid. */
  tax: number;
  totalPaid: number;
  serviceRevenue: number;
  productRevenue: number;
  groupTickets?: { appointmentId: number; tip: number; discount: number; totalPaid: number; paymentMethod: string; serviceRevenue: number; productRevenue: number }[];
  redemption?: { rewardId: number; customerId: number };
  /** Gift cards used as payment: each is charged (atomically, on the server) BEFORE the sale closes. */
  giftCards?: { code: string; amount: number }[];
}

export interface GiftCardInfo { code: string; balance: number; issuedTo: string | null }
/** Store-scoped check: the card must be this salon's, active, unexpired and have a balance. */
/** Sell a gift card at the desk (cash, or a card on the salon's own terminal). Needs the server. */
export const sellGiftCard = (sale: { amount: number; method: "cash" | "card"; code?: string | null; recipientName?: string | null; soldBy?: string | null }, key: string) =>
  needsServer(() => call<{ code: string; amount: number; method: "cash" | "card"; drawer: boolean }>("/api/nail/gift-cards/sell", {
    method: "POST", headers: { "X-Idempotency-Key": key }, body: JSON.stringify(sale),
  }));

export const lookupGiftCard = (code: string) =>
  call<GiftCardInfo>("/api/nail/gift-cards/lookup", { method: "POST", body: JSON.stringify({ code }) });
/** What a walk-in ticket that was just closed earned its technician in the turn rotation. */
export interface TurnEarned {
  appointmentId: number;
  ticketNumber: number | null;
  staffName: string | null;
  /** "dollar" = Dollar-Based Turns, "classic" = Counted Turns (a paid service under the threshold earns 1/2). */
  mode: "dollar" | "classic";
  earned: number;
  serviceAmount: number;
}

/**
 * Settle all shares, gifts and rewards on the server in one transaction.
 *
 * With no server, a CASH sale is recorded on this device instead (`offline: true` in the result): the same
 * request, under the same idempotency key, is sent unchanged when the connection is back, so the sale closes
 * on the server exactly once. Until then it shows as cash awaiting reconciliation. Nothing else is settled
 * offline — a card is never reported as paid without the reader's and the server's confirmation.
 */
export async function completeTicket(id: number, data: FinalizeData, who?: { storeId: number; clientName: string }): Promise<{ turns?: TurnEarned[]; offline?: boolean }> {
  const request = {
    ...data,
    tenders: data.tenders.map((t) => ({ method: t.method, amount: t.amount,
      ...(t.code ? { code: t.code } : {}), ...(t.paymentIntentId ? { paymentIntentId: t.paymentIntentId } : {}) })),
  };
  const onDevice = async () => {
    const problem = offlineSaleProblem(data);
    if (problem) throw new ApiError(problem, 0);
    if (!who) throw new Error(NEEDS_CONNECTION);
    const cash = data.tenders.reduce((sum, t) => sum + t.amount, 0);
    // Worked out before the sale is saved: once paid, the ticket leaves this tablet's board.
    const turns = await turnsEarnedOnDevice(who.storeId, id, data);
    await nailOffline.recordCash(who.storeId, { id, clientName: who.clientName }, { totalPaid: data.totalPaid, cash: Math.round(cash * 100) / 100, tip: data.tip, request, idempotencyKey: data.idempotencyKey });
    return { turns, offline: true };
  };
  if (isLocalId(id) || syncEngine.isOffline()) return onDevice();
  try {
    return await call<{ turns?: TurnEarned[] }>("/api/nail/checkout", { method: "POST", body: JSON.stringify({ ...request, appointmentId: id }) });
  } catch (err) {
    // No answer: the request may or may not have arrived. Kept on the device under the same key, it is
    // sent again later and the server answers it once either way.
    if (!isNetworkFailure(err) || offlineSaleProblem(data)) throw err;
    return onDevice();
  }
}

/** What a sale paid on this tablet offline earned in the turn rotation (line.ts, turnsEarnedOffline). Never fails the sale. */
async function turnsEarnedOnDevice(storeId: number, id: number, data: FinalizeData): Promise<TurnEarned[]> {
  try {
    const [kept, board, records] = await Promise.all([
      nailOffline.recall<BaseLine>(storeId, turnUrl(storeId, null)).catch(() => undefined),
      nailOffline.recall<NailBoard>(storeId, "/api/nail/board").catch(() => undefined),
      nailOffline.records(storeId).catch(() => [] as Awaited<ReturnType<typeof nailOffline.records>>),
    ]);
    if (!kept?.data) return [];
    const onBoard = overlayBoard(board?.data, records).tickets;
    const sales = data.groupTickets?.length ? data.groupTickets
      : [{ appointmentId: id, serviceRevenue: data.serviceRevenue, productRevenue: data.productRevenue, totalPaid: data.totalPaid, tip: data.tip }];
    return turnsEarnedOffline({
      base: kept.data,
      tickets: sales.map((sale) => {
        const t = onBoard.find((x) => x.id === sale.appointmentId);
        return { ...sale, ticketNumber: t?.ticketNumber ?? null, staffName: t?.staff?.name ?? null, walkIn: t?.walkIn === true };
      }),
    }) as TurnEarned[];
  } catch {
    return [];
  }
}

/** Where CheckoutMode keeps a sent-but-unanswered checkout request, so a lost response is retried unchanged. */
export const checkoutRequestKey = (storeId: number, ticketId: number) => `certxa.nail.checkout.${storeId}.${ticketId}.request`;

/**
 * A relayed kiosk check-in slip reaches every station; only the one that wins this claim prints it.
 * If the claim itself can't be made (offline, server error) print anyway — a duplicate slip beats none.
 */
export async function claimKioskPrintJob(jobId: string): Promise<boolean> {
  try {
    const res = await fetch("/api/kiosk/print-claim", {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }),
    });
    if (!res.ok) return true;
    const data = await res.json().catch(() => null);
    return data?.claimed !== false;
  } catch {
    return true;
  }
}
