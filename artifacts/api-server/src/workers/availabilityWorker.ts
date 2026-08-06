/**
 * Availability cache worker — BullMQ Worker that processes invalidation jobs.
 *
 * On each job: removes stale Redis cache entries for the given storeId + date
 * so the next AI tool call recomputes fresh slots and repopulates the cache.
 *
 * Start via startAvailabilityWorker() in index.ts server startup.
 */

import { Worker, type Job } from "bullmq";
import { getBullMqConnectionOptions, getRedisClient } from "../lib/redis";
import { invalidateAvailabilityForDate } from "../lib/availabilityCache";
import { AVAILABILITY_QUEUE_NAME, type AvailabilityJobData } from "../lib/availabilityQueue";
import { enqueueSlotRebuild, buildDateRange } from "../lib/slotQueue";

let _worker: Worker<AvailabilityJobData> | null = null;

async function processJob(job: Job<AvailabilityJobData>): Promise<void> {
  const { storeId, date, reason } = job.data;

  const deleted = await invalidateAvailabilityForDate(storeId, date);

  console.log(
    `[AvailabilityWorker] Invalidated ${deleted} cache key(s) for store=${storeId} date=${date} reason=${reason}`,
  );

  // After clearing the old availability cache, also trigger a precomputed
  // slot rebuild for this date + the next 13 days so Autumn's next call
  // is served from the warm precomputed layer.
  const dates = buildDateRange(14).filter((d) => d >= date);
  void enqueueSlotRebuild(storeId, dates.length > 0 ? dates : [date], reason as any);
}

export function startAvailabilityWorker(): void {
  const redis = getRedisClient();
  if (!redis) {
    console.log("[AvailabilityWorker] Redis not configured — worker not started");
    return;
  }
  const connection = getBullMqConnectionOptions();
  if (!connection) {
    console.log("[AvailabilityWorker] Redis connection options unavailable — worker not started");
    return;
  }

  if (_worker) return;

  _worker = new Worker<AvailabilityJobData>(AVAILABILITY_QUEUE_NAME, processJob, {
    connection,
    concurrency: 5,
    limiter: { max: 20, duration: 1000 },
  });

  _worker.on("completed", (job) => {
    console.log(`[AvailabilityWorker] Job ${job.id} completed`);
  });

  _worker.on("failed", (job, err) => {
    console.warn(`[AvailabilityWorker] Job ${job?.id} failed:`, err.message);
  });

  _worker.on("error", (err) => {
    console.warn("[AvailabilityWorker] Worker error:", err.message);
  });

  console.log("[AvailabilityWorker] Worker started");
}

export async function stopAvailabilityWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
}
