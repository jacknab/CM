/**
 * Call Event Bus — Server-Sent Events broadcaster for the Live Call Viewer.
 *
 * Any number of dashboard subscribers can connect to:
 *   GET /api/onboarding/:storeId/call-stream
 *
 * Events emitted throughout the call lifecycle are fanned out to all
 * active subscribers for that storeId in real time.
 */

import type { Response } from "express";

export type CallEventType =
  | "call_start"
  | "call_connected"
  | "tool_start"
  | "tool_end"
  | "tool_error"
  | "ai_response"
  | "state_change"
  | "latency_warning"
  | "call_end"
  | "system_error"
  | "filler_injected";

export interface CallEvent {
  type: CallEventType;
  storeId: number;
  callSid?: string;
  timestamp: string;
  latencyMs?: number;
  data: Record<string, unknown>;
}

class CallEventBus {
  /** storeId → set of active SSE Response objects */
  private readonly subs = new Map<number, Set<Response>>();

  subscribe(storeId: number, res: Response): () => void {
    if (!this.subs.has(storeId)) this.subs.set(storeId, new Set());
    this.subs.get(storeId)!.add(res);

    const unsub = () => {
      this.subs.get(storeId)?.delete(res);
    };
    res.on("close", unsub);
    return unsub;
  }

  emit(event: CallEvent): void {
    const subscribers = this.subs.get(event.storeId);
    if (!subscribers?.size) return;

    const payload = `data: ${JSON.stringify(event)}\n\n`;
    const dead: Response[] = [];

    for (const res of subscribers) {
      try {
        res.write(payload);
      } catch {
        dead.push(res);
      }
    }

    for (const res of dead) subscribers.delete(res);
  }

  /** Number of active subscribers for a store (useful for /status). */
  subscriberCount(storeId: number): number {
    return this.subs.get(storeId)?.size ?? 0;
  }
}

export const callEventBus = new CallEventBus();
