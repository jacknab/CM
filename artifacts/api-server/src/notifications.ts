import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { publishCrossProcess, subscribeCrossProcess, isCrossProcessBusAvailable } from "./lib/wsBroadcastBus";

const CROSS_PROCESS_CHANNEL = "ws:notify";

// The implicit "register" every connection uses until a store explicitly
// configures more than one checkout station (see migrations/0174_registers.sql
// and shared/schema.ts's `registers` table). Keeping this as the default is
// what makes multi-register support a no-op for every store that never sets
// one up — every /calendar and /frontdesk connection lands in this same bucket,
// exactly like the single, unscoped bucket that existed before this concept.
const DEFAULT_REGISTER_ID = 0;

export type NotificationEvent =
  | { type: "new_booking"; storeId: number; customerName: string; serviceName: string; staffName?: string; time: string }
  | { type: "payment_received"; storeId: number; customerName: string; amount: number }
  | { type: "appointment_cancelled"; storeId: number; customerName: string; serviceName: string; staffId?: number; appointmentDate?: string }
  | { type: "appointment_rescheduled"; storeId: number; customerName: string; serviceName: string; staffId?: number; appointmentDate?: string }
  | { type: "account_status_changed"; storeId: number; accountStatus: "active" | "suspended" | "locked" | "canceled" }
  | { type: "turn_eligibility_changed"; storeId: number }
  | { type: "queue_updated"; storeId: number }
  | { type: "job_status_updated"; storeId: number; jobId: number; status: string }
  | { type: "ai_call_updated"; storeId: number }
  // A salon setting (business hours, staff hours, services, …) changed on some device —
  // open /calendar screens refetch instead of showing the old values until a hard refresh.
  | { type: "settings_changed"; storeId: number; scope?: string }
  // The kiosk_checkout_* family below all carry an optional registerId so a
  // checkout at one paired POS/tablet station doesn't broadcast to another
  // station's tablet. Omitted (or 0) = the store's default/only register —
  // i.e. today's behavior for any store with no registers configured.
  | { type: "kiosk_checkout_start"; storeId: number; registerId?: number; total: number }
  // POS → customer display: live cart mirror while the ticket is being built.
  | { type: "kiosk_checkout_cart"; storeId: number; registerId?: number; items: { label: string; price: number }[]; subtotal: number; discount: number; tip: number; tax: number; total: number; isWalkIn: boolean; customerName: string; appointmentId?: number }
  // Server → clients: a walk-in customer joined rewards from the front-desk display.
  | { type: "kiosk_checkout_customer_linked"; storeId: number; registerId?: number; appointmentId: number; clientId: number; name: string; loyaltyPoints: number; isNew: boolean }
  | { type: "kiosk_checkout_tip_request"; storeId: number; registerId?: number; total: number; cardMethod?: "m2" | "tap" }
  | { type: "kiosk_checkout_tip_selected"; storeId: number; registerId?: number; tipAmount: number; tipPercent: number }
  // POS → customer display: show a card-payment instruction screen while a card
  // charge is collected. mode "m2" = tap on the Stripe M2 reader (display only);
  // mode "tap" = Tap to Pay on this (NFC Android) tablet.
  | { type: "kiosk_checkout_await_payment"; storeId: number; registerId?: number; mode: "m2" | "tap"; total: number; appointmentId?: number }
  | { type: "kiosk_checkout_payment_result"; storeId: number; registerId?: number; success: boolean; total?: number; last4?: string; error?: string; via?: "pos" | "client_confirm"; method?: "m2" | "tap" }
  | { type: "kiosk_checkout_complete"; storeId: number; registerId?: number }
  | { type: "kiosk_checkout_cancel"; storeId: number; registerId?: number }
  | { type: "sms_inbound"; storeId: number; clientPhone: string; clientName: string | null; body: string; createdAt: string };

export type SyncEvent =
  | { type: "booking_created"; storeId: number; appointmentId: number; source?: string }
  | { type: "booking_updated"; storeId: number; appointmentId: number; changes?: string[] }
  | { type: "booking_deleted"; storeId: number; appointmentId: number }
  | { type: "staff_assigned"; storeId: number; appointmentId: number; staffId: number };

// storeId → registerId → connected sockets. Store-wide events (new bookings,
// turn queue, account status, etc.) fan out across every registerId bucket
// for a store; kiosk_checkout_* events target only the matching bucket so two
// independent checkout stations at the same salon never cross-talk.
const storeClients = new Map<number, Map<number, Set<WebSocket>>>();

export function setupNotificationServer(httpServer: Server) {
  // IMPORTANT: use noServer + a path-scoped upgrade listener instead of
  // `{ server, path }`. When `ws` is bound with `{ server, path }`, its
  // internal upgrade handler rejects EVERY upgrade whose path doesn't match
  // with HTTP 400 "Bad Request" — which prevents other WS endpoints on the
  // same http server (e.g. /media-stream for Twilio) from ever handshaking.
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const pathname = req.url?.split("?")[0] ?? "";
    if (pathname === "/ws/notifications") {
      wss.handleUpgrade(req, socket as any, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    }
    // Non-matching paths: do nothing. Other upgrade listeners (e.g.
    // aiReceptionist's /media-stream handler) get their own chance.
  });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", `http://localhost`);
    const storeId = Number(url.searchParams.get("storeId"));
    if (!storeId || isNaN(storeId)) {
      ws.close(1008, "storeId required");
      return;
    }
    // Absent/invalid/unconfigured → DEFAULT_REGISTER_ID, so a store with no
    // registers set up behaves exactly as before this concept existed.
    const registerId = Number(url.searchParams.get("registerId")) || DEFAULT_REGISTER_ID;

    if (!storeClients.has(storeId)) {
      storeClients.set(storeId, new Map());
    }
    const registerMap = storeClients.get(storeId)!;
    if (!registerMap.has(registerId)) {
      registerMap.set(registerId, new Set());
    }
    registerMap.get(registerId)!.add(ws);

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", ts: Date.now(), echo: msg.ts }));
        }
        if (typeof msg.type === "string" && (msg.type.startsWith("kiosk_checkout_") || msg.type.startsWith("kiosk_checkin_"))) {
          // Checkout flow (cart, tip, payment, loyalty redemption) → only this
          // register's paired clients. Trust the CONNECTION's own registerId
          // (established at handshake) rather than anything in the message
          // body — several kiosk_checkout_* message types (tip selection,
          // payment result, cancel) carry no identifying field of their own,
          // so the transport is the only reliable source of truth.
          // kiosk_checkin_* (unknown_phone / client_named / cancelled) mirrors
          // the kiosk's "ask for a name" moment to the paired /calendar screen
          // so staff can type it in themselves for a client who needs help.
          broadcastToRegister(storeId, registerId, data.toString());
        } else if (msg.type === "kiosk_print_job") {
          // Self-service check-in print jobs are store-wide, not tied to any
          // particular checkout register — any staff terminal with a printer
          // connected should receive them, regardless of which register (if
          // any) it's paired to.
          broadcastToStore(storeId, data.toString());
        }
      } catch {}
    });

    const detach = () => {
      const regMap = storeClients.get(storeId);
      const set = regMap?.get(registerId);
      set?.delete(ws);
      if (set && set.size === 0) regMap!.delete(registerId);
      if (regMap && regMap.size === 0) storeClients.delete(storeId);
    };
    ws.on("close", detach);
    ws.on("error", detach);
  });
}

// In PM2 cluster mode, a client connected to a different worker than the one
// handling the triggering request would never receive this without relaying
// through Redis (see lib/wsBroadcastBus.ts) — each worker only knows about
// its own locally-connected sockets.
//
// registerId omitted = store-wide (every register bucket for this store);
// a number = scoped to just that register's paired clients.
function deliverToLocalClients(storeId: number, payload: string, registerId?: number) {
  const registerMap = storeClients.get(storeId);
  if (!registerMap || registerMap.size === 0) return;
  const targets = registerId === undefined
    ? Array.from(registerMap.values()).flatMap((set) => Array.from(set))
    : Array.from(registerMap.get(registerId) ?? []);
  for (const ws of targets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

subscribeCrossProcess(CROSS_PROCESS_CHANNEL, (msg: { storeId: number; payload: string; registerId?: number }) => {
  deliverToLocalClients(msg.storeId, msg.payload, msg.registerId);
});

function broadcastToStore(storeId: number, payload: string) {
  if (isCrossProcessBusAvailable()) {
    publishCrossProcess(CROSS_PROCESS_CHANNEL, { storeId, payload });
  } else {
    deliverToLocalClients(storeId, payload);
  }
}

// Scoped fan-out for kiosk_checkout_* traffic — only the sockets paired to
// this specific register (a /calendar terminal + its /frontdesk tablet)
// receive the message. DEFAULT_REGISTER_ID is where every connection lands
// until a store configures multiple registers, so this is a no-op behavior
// change for any store that hasn't done so.
function broadcastToRegister(storeId: number, registerId: number, payload: string) {
  if (isCrossProcessBusAvailable()) {
    publishCrossProcess(CROSS_PROCESS_CHANNEL, { storeId, registerId, payload });
  } else {
    deliverToLocalClients(storeId, payload, registerId);
  }
}

export function broadcastNotification(event: NotificationEvent) {
  const payload = JSON.stringify({ ...event, id: `${Date.now()}-${Math.random()}`, ts: Date.now() });
  if (event.type.startsWith("kiosk_checkout_")) {
    broadcastToRegister(event.storeId, (event as any).registerId || DEFAULT_REGISTER_ID, payload);
  } else {
    broadcastToStore(event.storeId, payload);
  }
}

export function broadcastSyncEvent(event: SyncEvent) {
  const payload = JSON.stringify({ ...event, id: `${Date.now()}-${Math.random()}`, ts: Date.now() });
  broadcastToStore(event.storeId, payload);
}
