/** Typed calls for the nail-salon staff screen. Everything goes through the Certxa API. */
import type { NailConfigView, NailPick } from "./ticketDraft";
import { normalizeNailConfig, toNailBody } from "./ticketDraft";

export const BOARD_KEY = ["/api/nail/board"] as const;

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
  customLines: { label: string; price: number }[];
  staff: { id: number; name: string; color: string | null } | null;
  total: number;
}

export interface BoardMarker {
  id: number;
  clientId: number | null;
  clientName: string | null;
  phone: string | null;
  createdAt: string;
}

export interface TechDayStats {
  staffId: number;
  doneToday: number;
  lastFinishedAt: string | null;
  clockedInAt: string | null;
}

export interface NailBoard {
  tickets: BoardTicket[];
  markers: BoardMarker[];
  techStats: TechDayStats[];
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
  turnPosition?: number;
  exclusionReasons?: string[];
  currentStatus?: "available" | "busy" | "on_break";
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

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.message || data?.error || `Request failed (${res.status})`, res.status, data);
  return data as T;
}

export const fetchBoard = () => call<NailBoard>("/api/nail/board");

export const fetchTurn = (storeId: number, serviceId: number | null) =>
  call<{ technicians: TurnTech[]; eligibleTechnicians: TurnTech[] }>(
    `/api/turn/eligibility?storeId=${storeId}${serviceId ? `&serviceId=${serviceId}` : ""}`,
  );

export const fetchNailConfig = async (serviceId: number): Promise<NailConfigView | null> =>
  normalizeNailConfig(await call<any>(`/api/services/${serviceId}/nail-config`));

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
  customLines: { label: string; price: number }[];
}

export const createTicket = (body: TicketBody & { clientId: number; staffId?: number | null; checkinId?: number | null }) =>
  call<CreatedTicket>("/api/nail/tickets", {
    method: "POST",
    body: JSON.stringify({
      clientId: body.clientId,
      serviceId: body.serviceId,
      addonIds: body.addonIds,
      nail: toNailBody(body.pick),
      customLines: body.customLines,
      staffId: body.staffId ?? null,
      checkinId: body.checkinId ?? null,
    }),
  });

export const updateTicket = (id: number, body: TicketBody) =>
  call<{ duration: number; price: number }>(`/api/nail/tickets/${id}`, {
    method: "PUT",
    body: JSON.stringify({ serviceId: body.serviceId, addonIds: body.addonIds, nail: toNailBody(body.pick), customLines: body.customLines }),
  });

export const reassignTicket = (id: number, staffId: number) =>
  call<{ staffId: number; staffName: string; status: string; startsAt: string }>(`/api/nail/tickets/${id}/reassign`, {
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

export const removeMarker = (id: number) => call(`/api/kiosk/board/${id}`, { method: "DELETE" });

export const fetchAppointment = (id: number) => call<any>(`/api/appointments/${id}`);

export interface FinalizeData {
  paymentMethod: string;
  tip: number;
  discount: number;
  totalPaid: number;
  serviceRevenue: number;
  productRevenue: number;
  groupTickets?: { appointmentId: number; tip: number; discount: number; totalPaid: number; paymentMethod: string; serviceRevenue: number; productRevenue: number }[];
  redemption?: { rewardId: number; customerId: number };
}

/** Same completion the calendar's checkout does: loyalty redemption, group pay shares, then "completed". */
export async function completeTicket(id: number, data: FinalizeData): Promise<void> {
  if (data.redemption?.rewardId && data.redemption.customerId) {
    // Best effort — a points shortfall shouldn't stop the sale closing.
    await call("/api/loyalty/redeem", {
      method: "POST",
      body: JSON.stringify({ rewardId: data.redemption.rewardId, customerId: data.redemption.customerId, appointmentId: id }),
    }).catch(() => {});
  }
  const patch = (apptId: number, d: { paymentMethod: string; tip: number; discount: number; totalPaid: number; serviceRevenue: number; productRevenue: number }) =>
    call(`/api/appointments/${apptId}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "completed",
        paymentMethod: d.paymentMethod,
        tipAmount: String(d.tip),
        discountAmount: String(d.discount),
        totalPaid: String(d.totalPaid),
        serviceRevenue: String(d.serviceRevenue),
        productRevenue: String(d.productRevenue),
      }),
    });
  if (data.groupTickets && data.groupTickets.length > 0) {
    await Promise.all(data.groupTickets.map((g) => patch(g.appointmentId, g)));
    return;
  }
  await patch(id, data);
}
