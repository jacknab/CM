/**
 * Cross-process WebSocket broadcast bus.
 *
 * Every "broadcast to connected clients" feature in this app (calendar/kiosk
 * sync, owner dashboard live updates, support ticket alerts, admin system
 * status, live chat) keeps its connected-client list in a plain in-process
 * Map/Set. That's correct for a single process, but breaks silently in PM2
 * cluster mode: a client connected to worker B never finds out about an event
 * that happened on worker A, because worker A only knows about its own
 * clients. There's no error — the feature just stops delivering to roughly
 * half of everyone, depending on which worker their socket landed on.
 *
 * This reuses the same Redis instance already required for BullMQ (see
 * lib/redis.ts) as a pub/sub relay: publishing a message here delivers it to
 * every worker's subscriber, including the one that published it, so each
 * worker can push it out to its own locally-connected clients. If Redis isn't
 * configured, publish/subscribe are no-ops — callers are expected to also
 * deliver directly to local clients in that case, which reproduces the
 * original single-instance behavior exactly.
 */
import Redis from "ioredis";
import { getBullMqConnectionOptions } from "./redis";

type Handler = (message: any) => void;

let publisher: Redis | null = null;
let subscriber: Redis | null = null;
let connectAttempted = false;
const handlers = new Map<string, Set<Handler>>();

function ensureConnections(): void {
  if (connectAttempted) return;
  connectAttempted = true;

  const opts = getBullMqConnectionOptions();
  if (!opts) return; // Redis not configured — bus stays disabled, callers fall back to local-only delivery

  publisher = new Redis(opts as any);
  subscriber = new Redis(opts as any);

  publisher.on("error", (err) => console.warn("[wsBus] publisher error:", err.message));
  subscriber.on("error", (err) => console.warn("[wsBus] subscriber error:", err.message));

  subscriber.on("message", (channel: string, raw: string) => {
    const set = handlers.get(channel);
    if (!set || set.size === 0) return;
    let message: any;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    for (const handler of set) {
      try {
        handler(message);
      } catch (err) {
        console.error(`[wsBus] handler threw on channel "${channel}":`, err);
      }
    }
  });
}

/** True when cross-process delivery is actually active (Redis configured). */
export function isCrossProcessBusAvailable(): boolean {
  ensureConnections();
  return !!publisher;
}

/** Publish a message to every process (including this one) subscribed to `channel`. */
export function publishCrossProcess(channel: string, message: unknown): void {
  ensureConnections();
  if (!publisher) return;
  publisher.publish(channel, JSON.stringify(message)).catch((err) => {
    console.warn(`[wsBus] publish failed on "${channel}":`, err.message);
  });
}

/** Register a handler that fires whenever any process (including this one) publishes on `channel`. */
export function subscribeCrossProcess(channel: string, handler: Handler): void {
  ensureConnections();
  const isFirstHandlerForChannel = !handlers.has(channel);
  if (isFirstHandlerForChannel) handlers.set(channel, new Set());
  handlers.get(channel)!.add(handler);

  if (isFirstHandlerForChannel && subscriber) {
    subscriber.subscribe(channel).catch((err) =>
      console.warn(`[wsBus] subscribe failed on "${channel}":`, err.message)
    );
  }
}
