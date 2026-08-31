import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { publishCrossProcess, subscribeCrossProcess, isCrossProcessBusAvailable } from "./lib/wsBroadcastBus";

const CROSS_PROCESS_CHANNEL = "ws:notify";

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
  | { type: "kiosk_checkout_start"; storeId: number; total: number }
  // POS → customer display: live cart mirror while the ticket is being built.
  | { type: "kiosk_checkout_cart"; storeId: number; items: { label: string; price: number }[]; subtotal: number; discount: number; tip: number; tax: number; total: number; isWalkIn: boolean; customerName: string; appointmentId?: number }
  // Server → clients: a walk-in customer joined rewards from the front-desk display.
  | { type: "kiosk_checkout_customer_linked"; storeId: number; appointmentId: number; clientId: number; name: string; loyaltyPoints: number; isNew: boolean }
  | { type: "kiosk_checkout_tip_request"; storeId: number; total: number; cardMethod?: "m2" | "tap" }
  | { type: "kiosk_checkout_tip_selected"; storeId: number; tipAmount: number; tipPercent: number }
  // POS → customer display: show a card-payment instruction screen while a card
  // charge is collected. mode "m2" = tap on the Stripe M2 reader (display only);
  // mode "tap" = Tap to Pay on this (NFC Android) tablet.
  | { type: "kiosk_checkout_await_payment"; storeId: number; mode: "m2" | "tap"; total: number; appointmentId?: number }
  | { type: "kiosk_checkout_payment_result"; storeId: number; success: boolean; total?: number; last4?: string; error?: string; via?: "pos" | "client_confirm"; method?: "m2" | "tap" }
  | { type: "kiosk_checkout_complete"; storeId: number }
  | { type: "kiosk_checkout_cancel"; storeId: number }
  | { type: "sms_inbound"; storeId: number; clientPhone: string; clientName: string | null; body: string; createdAt: string };

export type SyncEvent =
  | { type: "booking_created"; storeId: number; appointmentId: number; source?: string }
  | { type: "booking_updated"; storeId: number; appointmentId: number; changes?: string[] }
  | { type: "booking_deleted"; storeId: number; appointmentId: number }
  | { type: "staff_assigned"; storeId: number; appointmentId: number; staffId: number };

const storeClients = new Map<number, Set<WebSocket>>();

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

    if (!storeClients.has(storeId)) {
      storeClients.set(storeId, new Set());
    }
    storeClients.get(storeId)!.add(ws);

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", ts: Date.now(), echo: msg.ts }));
        }
        // Relay kiosk messages: checkout flow + print jobs from kiosk → all store clients
        if (typeof msg.type === "string" &&
            (msg.type.startsWith("kiosk_checkout_") || msg.type === "kiosk_print_job")) {
          broadcastToStore(storeId, data.toString());
        }
      } catch {}
    });

    ws.on("close", () => {
      storeClients.get(storeId)?.delete(ws);
      if (storeClients.get(storeId)?.size === 0) {
        storeClients.delete(storeId);
      }
    });

    ws.on("error", () => {
      storeClients.get(storeId)?.delete(ws);
    });
  });
}

// In PM2 cluster mode, a client connected to a different worker than the one
// handling the triggering request would never receive this without relaying
// through Redis (see lib/wsBroadcastBus.ts) — each worker only knows about
// its own locally-connected sockets.
function deliverToLocalClients(storeId: number, payload: string) {
  const clients = storeClients.get(storeId);
  if (!clients || clients.size === 0) return;
  for (const ws of Array.from(clients)) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

subscribeCrossProcess(CROSS_PROCESS_CHANNEL, (msg: { storeId: number; payload: string }) => {
  deliverToLocalClients(msg.storeId, msg.payload);
});

function broadcastToStore(storeId: number, payload: string) {
  if (isCrossProcessBusAvailable()) {
    publishCrossProcess(CROSS_PROCESS_CHANNEL, { storeId, payload });
  } else {
    deliverToLocalClients(storeId, payload);
  }
}

export function broadcastNotification(event: NotificationEvent) {
  const payload = JSON.stringify({ ...event, id: `${Date.now()}-${Math.random()}`, ts: Date.now() });
  broadcastToStore(event.storeId, payload);
}

export function broadcastSyncEvent(event: SyncEvent) {
  const payload = JSON.stringify({ ...event, id: `${Date.now()}-${Math.random()}`, ts: Date.now() });
  broadcastToStore(event.storeId, payload);
}
