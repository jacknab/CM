import { localHub } from "./local-hub";

/**
 * The kiosk (and the customer screen) asking the main POS tablet over the salon's own Wi-Fi
 * (lib/local-hub.ts) when the internet is down. The POS answers from what it holds, the way it works offline
 * itself: a lookup also says whether the client is already on a ticket or has a booking today (and marks that
 * booking arrived); a check-in makes the same ticket the online kiosk makes — services, add-ons, nail options,
 * the technician asked for or the next in turn — sent to the server when the connection is back.
 *
 * One request, one answer with the same `requestId`; no answer within a few seconds counts as no hub.
 */
export interface KioskLookupAnswer {
  found: boolean;
  client?: { id: number; name: string } | null;
  /** Already on a ticket, or already waiting: nothing more to do here. */
  alreadyOnTicket?: boolean;
  /** A booking today: it has been marked arrived. */
  todayAppointment?: { id: number; serviceName: string; staffName: string | null; staffAvatarThumbUrl: null; appointmentTime: string; ticketNumber: number | null } | null;
}
export interface KioskCheckinRequest {
  clientId: number | null; clientName: string; phone: string;
  /** The services in order (the first is the visit's main one); empty from the customer screen. */
  serviceIds: number[];
  addonIds: number[];
  nail: { sizeId: number | null; shapeId: number | null; effectId: number | null };
  /** The technician the client asked for. */
  staffId: number | null;
}
export interface KioskCheckinAnswer { success: boolean; ticketNumber?: number | null; clientName?: string; staffName?: string | null; error?: string }
export interface KioskWaitAnswer { hasAvailableStaff: boolean; estimatedWaitMinutes: number | null }

const ANSWER_MS = 6_000;

function ask<T>(type: string, body: Record<string, unknown>): Promise<T | null> {
  const requestId = `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: T | null) => { if (done) return; done = true; clearTimeout(timer); off(); resolve(v); };
    const off = localHub.onMessage((m: any) => { if (m?.type === `${type}_result` && m.requestId === requestId) finish(m as T); });
    const timer = setTimeout(() => finish(null), ANSWER_MS);
    if (!localHub.send({ type, requestId, ...body })) finish(null);
  });
}

export const hubKioskLookup = (phone: string) => ask<KioskLookupAnswer>("hub_kiosk_lookup", { phone });
export const hubKioskCheckin = (req: KioskCheckinRequest) => ask<KioskCheckinAnswer>("hub_kiosk_checkin", { ...req });
export const hubKioskWait = () => ask<KioskWaitAnswer>("hub_kiosk_wait", {});
/** Another POS station, offline: the next ticket number, from the main POS (the one tablet that gives them out). */
export const hubTicketNumber = () => ask<{ ticketNumber: number | null }>("hub_ticket_number", {}).then((a) =>
  a && Number.isInteger(a.ticketNumber) && (a.ticketNumber as number) > 0 ? (a.ticketNumber as number) : null);

const ids = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n > 0) : []);
const idOrNull = (v: unknown): number | null => (v != null && Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

/** On the POS: answer the kiosk's requests. Returns the unsubscribe. */
export function serveKioskOverHub(handlers: {
  lookup: (phone: string) => Promise<KioskLookupAnswer>;
  checkin: (req: KioskCheckinRequest) => Promise<KioskCheckinAnswer>;
  wait: () => Promise<KioskWaitAnswer>;
  /** The next offline ticket number, for another POS station (lib/nail-offline issueTicketNumber). */
  ticketNumber?: () => Promise<number | null>;
}): () => void {
  return localHub.onMessage((m: any) => {
    if (typeof m?.requestId !== "string") return;
    const reply = (type: string, answer: object) => localHub.send({ type, requestId: m.requestId, ...answer });
    if (m.type === "hub_kiosk_lookup") {
      void handlers.lookup(String(m.phone ?? "")).catch(() => ({ found: false }))
        .then((answer) => reply("hub_kiosk_lookup_result", answer));
    } else if (m.type === "hub_kiosk_checkin") {
      void handlers.checkin({
        clientId: idOrNull(m.clientId),
        clientName: String(m.clientName ?? "Walk-in Guest"), phone: String(m.phone ?? ""),
        serviceIds: ids(m.serviceIds), addonIds: ids(m.addonIds),
        nail: { sizeId: idOrNull(m.nail?.sizeId), shapeId: idOrNull(m.nail?.shapeId), effectId: idOrNull(m.nail?.effectId) },
        staffId: idOrNull(m.staffId),
      }).catch((err) => ({ success: false, error: (err as Error)?.message ?? "Check-in failed" }))
        .then((answer) => reply("hub_kiosk_checkin_result", answer));
    } else if (m.type === "hub_ticket_number" && handlers.ticketNumber) {
      void handlers.ticketNumber().catch(() => null)
        .then((ticketNumber) => reply("hub_ticket_number_result", { ticketNumber }));
    } else if (m.type === "hub_kiosk_wait") {
      void handlers.wait().catch(() => ({ hasAvailableStaff: true, estimatedWaitMinutes: null }))
        .then((answer) => reply("hub_kiosk_wait_result", answer));
    }
  });
}

/**
 * Tell the customer screen / kiosk to wake up (come back to the welcome screen).
 * Fire-and-forget: no reply needed. Goes through the salon hub when the internet is down.
 */
export function wakeKioskScreen(registerId: number | null | undefined): boolean {
  return localHub.send({ type: "kiosk_wake", registerId: registerId ?? 0 });
}
