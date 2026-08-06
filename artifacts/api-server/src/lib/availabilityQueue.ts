/**
 * BullMQ queue for availability cache invalidation/rebuild jobs.
 *
 * Enqueuing is a fire-and-forget operation. If Redis is unavailable the
 * function logs a warning and returns without throwing, so booking mutations
 * never fail because of a queue issue.
 */

import { Queue } from "bullmq";
import { getBullMqConnectionOptions, getRedisClient } from "./redis";

export const AVAILABILITY_QUEUE_NAME = "availability-invalidation";

export interface AvailabilityJobData {
  storeId: number;
  date: string;
  reason: "booking_created" | "booking_cancelled" | "booking_rescheduled" | "schedule_updated";
}

let _queue: Queue<AvailabilityJobData, unknown, string> | null = null;

function getQueue(): Queue<AvailabilityJobData, unknown, string> | null {
  if (_queue) return _queue;

  const redis = getRedisClient();
  if (!redis) return null;
  const connection = getBullMqConnectionOptions();
  if (!connection) return null;

  const queue = new Queue<AvailabilityJobData, unknown, string>(AVAILABILITY_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  });

  queue.on("error", (err) => {
    console.warn("[AvailabilityQueue] Queue error:", err.message);
  });

  _queue = queue;
  return queue;
}

/**
 * Enqueue a cache invalidation job for a specific store + date.
 * Deduplicated by jobId — a second enqueue for the same store+date within
 * the TTL window is silently dropped.
 */
export async function enqueueAvailabilityInvalidation(
  storeId: number,
  date: string,
  reason: AvailabilityJobData["reason"] = "booking_created",
): Promise<void> {
  const queue = getQueue();
  if (!queue) return;

  try {
    const jobId = `${storeId}:${date}`;
    await queue.add(
      "invalidate",
      { storeId, date, reason },
      {
        jobId,
        delay: 500,
      },
    );
  } catch (err: any) {
    console.warn("[AvailabilityQueue] Failed to enqueue job:", err.message);
  }
}

export async function closeQueue(): Promise<void> {
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}
