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
  customLines: { label: string; price: number; isRetail?: boolean }[];
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

export interface SalonGlance {
  appointments: number;
  walkIns: number;
  noShows: number;
  avgTicket: number | null;
}

export interface NailBoard {
  tickets: BoardTicket[];
  markers: BoardMarker[];
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
  customLines: { label: string; price: number; isRetail?: boolean }[];
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
  paymentMethod: string;
  tip: number;
  discount: number;
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
  call<GiftCardInfo>("/api/nail/gift-cards/lookup", { method: "POST", body: JSON.stringify({ code }) });
const redeemGiftCard = (code: string, amount: number, appointmentId: number) =>
  call<{ redeemed: number; balance: number; alreadyRedeemed: boolean }>("/api/nail/gift-cards/redeem", {
    method: "POST", body: JSON.stringify({ code, amount, appointmentId }),
  });

/** Same completion the calendar's checkout does: loyalty redemption, group pay shares, then "completed". */
export async function completeTicket(id: number, data: FinalizeData): Promise<void> {
  // Gift cards first, and unlike loyalty this must succeed: if a card can't cover its share the sale stays open. Re-running
  // after a failure is safe — the server ignores a card it already redeemed for this ticket.
  for (const g of data.giftCards ?? []) {
    try { await redeemGiftCard(g.code, g.amount, id); }
    catch (err: any) { throw new ApiError(`Gift card ${g.code}: ${err?.message ?? "could not be redeemed"}`, err?.status ?? 400, err?.data); }
  }
  if (data.redemption?.rewardId && data.redemption.customerId) {
    // The reward's points must actually be taken before the sale closes — otherwise the discount would be given for free.
    // The server redeems once per ticket, so re-running after a failure never charges the points twice.
    try {
      await call("/api/loyalty/redeem", {
        method: "POST",
        body: JSON.stringify({ rewardId: data.redemption.rewardId, customerId: data.redemption.customerId, appointmentId: id }),
      });
    } catch (err: any) {
      throw new ApiError(`Loyalty reward: ${err?.message ?? "could not be redeemed"}`, err?.status ?? 400, err?.data);
    }
  }
  // Past this point, any gift card money or loyalty points above have ALREADY been taken from the
  // customer — there is no reversal path anywhere in this app if the sale doesn't end up closing.
  // Retrying completeTicket is safe (every step above is idempotent), but if the cashier doesn't
  // retry — cancels the ticket, walks away — that money/points are simply gone with no completed
  // sale. Say so explicitly on a PATCH failure instead of surfacing whatever generic error the
  // PATCH itself produced, so staff know not to re-redeem and to retry THIS SAME ticket instead.
  const tookMoney = (data.giftCards?.length ?? 0) > 0 || !!data.redemption?.rewardId;
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
    // Promise.all would let some tickets in the group commit as "completed" while others reject —
    // the full group payment was already taken, but only the succeeded ones get marked paid, with
    // no way to tell which from the caller's perspective. Report exactly which ids failed instead.
    const results = await Promise.allSettled(data.groupTickets.map((g) => patch(g.appointmentId, g)));
    const failed = results
      .map((r, i) => ({ r, apptId: data.groupTickets![i].appointmentId }))
      .filter((x): x is { r: PromiseRejectedResult; apptId: number } => x.r.status === "rejected");
    if (failed.length > 0) {
      const succeededIds = data.groupTickets.filter((g) => !failed.some((f) => f.apptId === g.appointmentId)).map((g) => g.appointmentId);
      const firstErr: any = failed[0].r.reason;
      const moneyNote = tookMoney ? " Gift card/loyalty redemption for the group already went through — do not redeem again." : "";
      throw new ApiError(
        `${succeededIds.length > 0 ? `Ticket #${succeededIds.join(", #")} saved, but ` : ""}ticket #${failed.map((f) => f.apptId).join(", #")} did NOT save (${firstErr?.message ?? "unknown error"}) even though the group payment was taken.${moneyNote} Retry this same group, or complete the failed ticket(s) manually.`,
        firstErr?.status ?? 400, firstErr?.data,
      );
    }
    return;
  }
  try {
    await patch(id, data);
  } catch (err: any) {
    if (tookMoney) {
      throw new ApiError(
        `The gift card/loyalty redemption above already went through, but saving the sale failed (${err?.message ?? "unknown error"}). Do NOT redeem again — retry this same ticket, or complete it manually.`,
        err?.status ?? 400, err?.data,
      );
    }
    throw err;
  }
}
