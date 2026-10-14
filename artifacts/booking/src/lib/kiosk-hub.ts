import { localHub } from "./local-hub";

/**
 * The kiosk asking the main POS tablet over the salon's own Wi-Fi (lib/local-hub.ts) when the internet is down:
 * look up a client by phone, and check a client in. The POS answers from what it holds and puts the client on
 * its waiting list (lib/nail-offline), exactly as a check-in at the front desk does offline.
 *
 * One request, one answer with the same `requestId`; no answer within a few seconds counts as no hub.
 */
export interface KioskLookupAnswer { found: boolean; client?: { id: number; name: string } | null }
export interface KioskCheckinRequest {
  clientId: number | null; clientName: string; phone: string;
  services: { name: string }[]; staffName: string | null;
}
export interface KioskCheckinAnswer { success: boolean; ticketNumber?: number | null; clientName?: string; error?: string }

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

/** On the POS: answer the kiosk's requests. Returns the unsubscribe. */
export function serveKioskOverHub(handlers: {
  lookup: (phone: string) => Promise<KioskLookupAnswer>;
  checkin: (req: KioskCheckinRequest) => Promise<KioskCheckinAnswer>;
}): () => void {
  return localHub.onMessage((m: any) => {
    if (m?.type === "hub_kiosk_lookup" && typeof m.requestId === "string") {
      void handlers.lookup(String(m.phone ?? "")).catch(() => ({ found: false }))
        .then((answer) => localHub.send({ type: "hub_kiosk_lookup_result", requestId: m.requestId, ...answer }));
    } else if (m?.type === "hub_kiosk_checkin" && typeof m.requestId === "string") {
      void handlers.checkin({
        clientId: Number.isFinite(Number(m.clientId)) && m.clientId != null ? Number(m.clientId) : null,
        clientName: String(m.clientName ?? "Walk-in Guest"), phone: String(m.phone ?? ""),
        services: Array.isArray(m.services) ? m.services : [], staffName: typeof m.staffName === "string" ? m.staffName : null,
      }).catch((err) => ({ success: false, error: (err as Error)?.message ?? "Check-in failed" }))
        .then((answer) => localHub.send({ type: "hub_kiosk_checkin_result", requestId: m.requestId, ...answer }));
    }
  });
}
