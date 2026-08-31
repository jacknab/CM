/**
 * BullMQ queue for precomputed slot rebuild jobs.
 *
 * Enqueuing is fire-and-forget — if Redis is unavailable the function logs
 * a warning and returns without throwing so no booking mutation ever fails
 * because of a queue issue.
 */

import { Queue } from "bullmq";
import { getRedisClient } from "./redis";

export const SLOT_QUEUE_NAME = "slot-builder";

export interface SlotJobData {
  storeId: number;
  /** YYYY-MM-DD dates to rebuild (can be a single date or a range) */
  dates: string[];
  reason: "booking_changed" | "schedule_updated" | "initial_warmup";
}

let _queue: Queue<SlotJobData> | null = null;

function getQueue(): Queue<SlotJobData> | null {
  if (_queue) return _queue;
  const redis = getRedisClient();
  if (!redis) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _queue = new Queue<SlotJobData>(SLOT_QUEUE_NAME, {
    connection: redis as any,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  }) as any;
  (_queue as any).on("error", (err: Error) => console.warn("[SlotQueue] error:", err.message));
  return _queue;
}

/**
 * Enqueue a slot rebuild job for the given store + dates.
 * Job IDs are deduplicated on storeId + first-date + reason so rapid-fire
 * invalidations collapse into a single rebuild.
 */
export async function enqueueSlotRebuild(
  storeId: number,
  dates: string[],
  reason: SlotJobData["reason"] = "booking_changed",
): Promise<void> {
  if (!dates.length) return;
  const queue = getQueue();
  if (!queue) return;
  try {
    // BullMQ rejects custom job IDs containing ":" (it uses colons as the
    // Redis key delimiter internally) — use "-" instead.
    const jobId = `${storeId}-${dates[0]}-${reason}`;
    await queue.add("rebuild", { storeId, dates, reason }, { jobId, delay: 400 });
  } catch (err: any) {
    console.warn("[SlotQueue] Failed to enqueue:", err.message);
  }
}

/**
 * Build the list of YYYY-MM-DD date strings for the next `count` days
 * starting from today (UTC).
 */
export function buildDateRange(count = 14): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getTime() + i * 86_400_000);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export async function closeSlotQueue(): Promise<void> {
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}
