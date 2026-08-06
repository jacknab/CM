import { EventEmitter } from "events";
import type { Response } from "express";

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
