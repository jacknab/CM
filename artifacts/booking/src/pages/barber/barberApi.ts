/** Typed calls for the barber-salon staff screen. Everything goes through the Certxa API. */
import type { NailConfigView, NailPick } from "./barberTicketDraft";
import { reportUnauthorized } from "@/lib/resumeSignIn";
import { toNailBody } from "./barberTicketDraft";
import type { Tender } from "@shared/nailCheckout";

export const boardKey = (storeId: number) => ["/api/barber/board", storeId] as const;

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
    sizeId: number | null;
    shapeId: number | null;
    applicationId: number | null;
    effectId: number | null;
    priceAdjustment: number;
    lines: { label: string; price: number }[];
  } | null;
  customLines: { label: string; price: number; isRetail?: boolean }[];
  staff: { id: number; name: string; color: string | null } | null;
  total: number;
}

export interface BoardMarker {
  id: number;
  ticketNumber: number | null;
  clientId: number | null;
  clientName: string | null;
  phone: string | null;
  createdAt: string;
  /** The barber who took this client (no ticket yet) — null while still waiting. */
  staffId?: number | null;
  staffName?: string | null;
}

export interface BarberSignIn {
  staff: { id: number; name: string; color: string | null; barberNumber: number };
  activeMarker: { id: number; clientId: number | null; clientName: string | null } | null;
  activeTicketId: number | null;
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

/**
 * The store this screen is open on. Every /api/barber call names it so an owner with several
 * stores reaches the barbershop, not whichever store the server would pick first. The server
 * still checks the store is theirs.
 */
let screenStoreId: number | null = null;
export const setBarberStoreId = (storeId: number) => { screenStoreId = storeId; };
export const barberUrl = (path: string) =>
  screenStoreId == null ? path : `${path}${path.includes("?") ? "&" : "?"}storeId=${screenStoreId}`;

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url.startsWith("/api/barber/") ? barberUrl(url) : url, {
    credentials: "include",
    ...init,
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (res.status === 401) reportUnauthorized(url);
  if (!res.ok) throw new ApiError(data?.message || data?.error || `Request failed (${res.status})`, res.status, data);
  return data as T;
}

export const fetchBoard = () => call<NailBoard>("/api/barber/board");

export const identifyBarber = (barberId: number) =>
  call<BarberSignIn>("/api/barber/identify", { method: "POST", body: JSON.stringify({ barberId }) });

export const assignMarker = (markerId: number, staffId: number) =>
  call<{ staffName: string }>(`/api/barber/markers/${markerId}/assign`, { method: "POST", body: JSON.stringify({ staffId }) });

/** Calendar records are a fallback for board deployments that only return glance totals. */
export const fetchCalendarBoardBookings = () => {
  const now = Date.now();
  const from = new Date(now - 48 * 60 * 60_000).toISOString();
  const to = new Date(now + 48 * 60 * 60_000).toISOString();
  return call<import("./boardView").CalendarBoardBooking[]>(`/api/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
};

export const fetchTurn = (storeId: number, serviceId: number | null) =>
  call<{ technicians: TurnTech[]; eligibleTechnicians: TurnTech[] }>(
    `/api/turn/eligibility?storeId=${storeId}${serviceId ? `&serviceId=${serviceId}` : ""}`,
  );

export const fetchNailConfig = async (serviceId: number): Promise<NailConfigView | null> =>
  // Barbershop services do not use nail-specific size/shape/effect options.
  null;

export interface ClientSummary {
  id: number;
  name: string;
  phone: string | null;
  loyaltyPoints: number;
}

export async function fetchClient(id: number): Promise<ClientSummary> {
  const c = await call<any>(`/api/customers/${id}`);
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
  customLines: { label: string; price: number; isRetail?: boolean }[];
}

/** `autoAssign`: TURN gives it to the next tech in line who can do the service and starts it; nobody free → saved waiting, unassigned. */
export const createTicket = (body: TicketBody & { clientId: number; staffId?: number | null; checkinId?: number | null; leaveUnassigned?: boolean; autoAssign?: boolean }) =>
  call<CreatedTicket>("/api/barber/tickets", {
    method: "POST",
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
    }),
  });

export const updateTicket = (id: number, body: TicketBody, expected?: BoardTicket) =>
  call<{ duration: number; price: number }>(`/api/barber/tickets/${id}`, {
    method: "PUT",
    body: JSON.stringify({ serviceId: body.serviceId, addonIds: body.addonIds, nail: toNailBody(body.pick), customLines: body.customLines,
      expected: expected ? { serviceId: expected.service.id, duration: expected.duration, addonIds: expected.addons.map((a) => a.id), customLines: expected.customLines,
        nail: expected.nail ? { nailSizeId: expected.nail.sizeId, nailShapeId: expected.nail.shapeId,
          nailArtApplicationId: expected.nail.applicationId, nailArtEffectId: expected.nail.effectId } : null } : undefined }),
  });

export const reassignTicket = (id: number, staffId: number) =>
  call<{ staffId: number; staffName: string; status: string; startsAt: string }>(`/api/barber/tickets/${id}/reassign`, {
    method: "POST",
    body: JSON.stringify({ staffId }),
  });

export const startTicket = (id: number) =>
  call(`/api/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status: "started" }) });

export const cancelTicket = (id: number) =>
  call(`/api/appointments/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "cancelled", cancellationReason: "Cancelled at check-in", calendarHidden: true }),
  });

/** Front-desk override: put a technician on the clock and into the turn order (the server tells every station). */
export async function clockInTech(storeId: number, staffId: number): Promise<void> {
  const res = await fetch("/api/timeclock/clock-in", {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storeId, staffId }),
  });
  // 409 = already clocked in (someone got there first) — that is the state we wanted.
  if (!res.ok && res.status !== 409) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.error || data?.message || "Couldn't clock them in", res.status, data);
  }
}

/** Front-desk override: take a technician off the clock and out of the turn order (the server tells every station). */
export async function clockOutTech(storeId: number, staffId: number): Promise<void> {
  const res = await fetch("/api/timeclock/clock-out", {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storeId, staffId }),
  });
  // 404 = no open clock-in (someone already clocked them out) — that is the state we wanted.
  if (!res.ok && res.status !== 404) {
    const data = await res.json().catch(() => null);
    throw new ApiError(data?.error || data?.message || "Couldn't clock them out", res.status, data);
  }
}

export const removeMarker = (id: number) => call(`/api/kiosk/board/${id}`, { method: "DELETE" });

export const fetchAppointment = (id: number) => call<any>(`/api/appointments/${id}`);

export interface FinalizeData {
  idempotencyKey: string;
  /** The POS station taking the sale: one with no cash drawer can't take cash (server checks, 2026-10-29). */
  registerId?: number;
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
export const lookupGiftCard = (code: string) =>
  call<GiftCardInfo>("/api/barber/gift-cards/lookup", { method: "POST", body: JSON.stringify({ code }) });
/** Settle all shares, gifts and rewards on the server in one transaction. */
export async function completeTicket(id: number, data: FinalizeData): Promise<void> {
  await call("/api/barber/checkout", { method: "POST", body: JSON.stringify({
    ...data, appointmentId: id,
    tenders: data.tenders.map((t) => ({ method: t.method, amount: t.amount,
      ...(t.code ? { code: t.code } : {}), ...(t.paymentIntentId ? { paymentIntentId: t.paymentIntentId } : {}) })),
  }) });
}

/** Where CheckoutMode keeps a sent-but-unanswered checkout request, so a lost response is retried unchanged. */
export const checkoutRequestKey = (storeId: number, ticketId: number) => `certxa.barber.checkout.${storeId}.${ticketId}.request`;

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
