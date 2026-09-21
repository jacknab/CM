import { EventEmitter } from "events";
import type { Response } from "express";
import { broadcastSyncEvent } from "../notifications";

export type AppointmentStatusEvent = {
  appointmentId: number;
  storeId: number;
  status: string;
  source: "manual" | "auto";
};

const emitter = new EventEmitter();
emitter.setMaxListeners(500);

const storeClients = new Map<number, Set<Response>>();

export function registerSseClient(storeId: number, res: Response): () => void {
  if (!storeClients.has(storeId)) {
    storeClients.set(storeId, new Set());
  }
  storeClients.get(storeId)!.add(res);

  return () => {
    storeClients.get(storeId)?.delete(res);
    if (storeClients.get(storeId)?.size === 0) {
      storeClients.delete(storeId);
    }
  };
}

export function broadcastAppointmentStatus(event: AppointmentStatusEvent): void {
  // The SSE list below only reaches clients on THIS worker. Also send the status change over the WebSocket bus (Redis relay
  // across PM2 workers) so every POS station in the salon — the nail POS board included — hears about a kiosk check-in,
  // an auto-start or an auto no-show no matter which worker took the request.
  try {
    broadcastSyncEvent({ type: "booking_updated", storeId: event.storeId, appointmentId: event.appointmentId, changes: ["status"] });
  } catch { /* the SSE push below still goes out */ }
  const clients = storeClients.get(event.storeId);
  if (!clients || clients.size === 0) return;

  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    try {
      res.write(data);
    } catch {
      clients.delete(res);
    }
  }
}
