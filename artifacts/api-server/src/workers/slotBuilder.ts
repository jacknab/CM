/**
 * Slot-builder BullMQ worker — precomputes availability slots per store per day
 * and writes them to Redis under `store:{storeId}:slots:{YYYY-MM-DD}`.
 *
 * This is a service-agnostic snapshot: it records which staff members are free
 * to START something at each time-grid point.  Duration / service filtering is
 * applied in-memory at read-time (in the AI receptionist tool handler) so the
 * cache can be shared across all service types without duplication.
 *
 * Start via startSlotBuilderWorker() called from index.ts.
 */

import { Worker, type Job } from "bullmq";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { getRedisClient } from "../lib/redis";
import { setSlotCache, type DaySlotCache, type PrecomputedSlot } from "../lib/slotCache";
import { SLOT_QUEUE_NAME, type SlotJobData } from "../lib/slotQueue";
import { storage } from "../storage";
import { db } from "../db";
import { locations } from "@shared/schema";

let _worker: Worker<SlotJobData> | null = null;

// ── Core slot computation ──────────────────────────────────────────────────────

async function buildSlotsForDate(
  storeId: number,
  date: string,
  timezone: string,
): Promise<DaySlotCache> {
  const tz = timezone || "UTC";

  const [hours, calSettings, allStaff] = await Promise.all([
    storage.getBusinessHours(storeId),
    storage.getCalendarSettings(storeId),
    storage.getAllStaff(storeId),
  ]);

  // Default slot interval is 30 min per the spec (AI receptionist uses 15 for
  // live computation; 30 min precomputed grid is sufficient and keeps the cache
  // payload small).
  const slotInterval: number = calSettings?.timeSlotInterval ?? 30;

  // Day-of-week check
  const [y, m, d] = date.split("-").map(Number);
  const dayOfWeek = new Date(y, m - 1, d).getDay();
  const dayHours = hours.find((h) => h.dayOfWeek === dayOfWeek);

  if (dayHours?.isClosed) {
    return { businessCloseUtc: "", slots: [], builtAt: Date.now() };
  }

  const [openHour, openMin] =
    dayHours && !dayHours.isClosed
      ? dayHours.openTime.split(":").map(Number)
      : [9, 0];
  const [closeHour, closeMin] =
    dayHours && !dayHours.isClosed
      ? dayHours.closeTime.split(":").map(Number)
      : [18, 0];

  const businessCloseLocal = new Date(
    `${date}T${String(closeHour).padStart(2, "0")}:${String(closeMin).padStart(2, "0")}:00`,
  );
  const businessCloseUtc = fromZonedTime(businessCloseLocal, tz);

  // Load day appointments + staff availability concurrently
  const dayStart = fromZonedTime(new Date(`${date}T00:00:00`), tz);
  const dayEnd   = fromZonedTime(new Date(`${date}T23:59:59.999`), tz);

  const activeStaff = allStaff.filter((s) => (s as any).status !== "removed");

  const [dayAppointments, ...availRulesPerStaff] = await Promise.all([
    storage.getAppointments({ from: dayStart, to: dayEnd, storeId }),
    ...activeStaff.map((s) => storage.getStaffAvailability(s.id)),
  ]);

  const availabilityMap = new Map<
    number,
    Awaited<ReturnType<typeof storage.getStaffAvailability>>
  >();
  activeStaff.forEach((s, i) => availabilityMap.set(s.id, availRulesPerStaff[i]));

  const nowUtc = new Date();
  const slots: PrecomputedSlot[] = [];

  for (let hour = openHour; hour <= closeHour; hour++) {
    for (let min = 0; min < 60; min += slotInterval) {
      if (hour === openHour && min < openMin) continue;
      if (hour === closeHour && min >= closeMin) break;
      if (hour > closeHour) break;

      const slotStartLocal = new Date(
        `${date}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`,
      );
      const slotStart = fromZonedTime(slotStartLocal, tz);

      // Never offer past slots
      if (slotStart < nowUtc) continue;

      for (const staffMember of activeStaff) {
        // ── Booking conflict: is this staff already in an appointment at slotStart? ──
        let hasConflict = false;
        for (const apt of dayAppointments) {
          if (apt.staffId !== staffMember.id || apt.status === "cancelled") continue;
          const aptStart = new Date(apt.date);
          const aptEnd   = new Date(aptStart.getTime() + apt.duration * 60_000);
          // Slot start falls inside an existing appointment → blocked
          if (slotStart >= aptStart && slotStart < aptEnd) {
            hasConflict = true;
            break;
          }
        }

        if (!hasConflict) {
          // ── Staff-specific availability rules ──────────────────────────────
          const rules = availabilityMap.get(staffMember.id) ?? [];
          if (rules.length > 0) {
            const slotLocal    = toZonedTime(slotStart, tz);
            const slotDow      = slotLocal.getDay();
            const dayRule      = rules.find((r) => r.dayOfWeek === slotDow);

            if (dayRule) {
              const [rsh, rsm] = dayRule.startTime.split(":").map(Number);
              const [reh, rem] = dayRule.endTime.split(":").map(Number);
              const slotMins   = slotLocal.getHours() * 60 + slotLocal.getMinutes();
              const ruleStart  = rsh * 60 + rsm;
              const ruleEnd    = reh * 60 + rem;
              if (slotMins < ruleStart || slotMins >= ruleEnd) hasConflict = true;
            } else {
              // Rules exist but none cover this weekday → staff not working
              hasConflict = true;
            }
          }
        }

        if (hasConflict) continue;

        // ── Compute next booking for this staff after this slot ────────────
        let nextBookingUtc: string | null = null;
        let earliestNext: Date | null = null;
        for (const apt of dayAppointments) {
          if (apt.staffId !== staffMember.id || apt.status === "cancelled") continue;
          const aptStart = new Date(apt.date);
          if (aptStart > slotStart && (earliestNext === null || aptStart < earliestNext)) {
            earliestNext = aptStart;
          }
        }
        nextBookingUtc = earliestNext?.toISOString() ?? null;

        slots.push({
          time: slotStart.toISOString(),
          staffId: staffMember.id,
          staffName: staffMember.name,
          nextBookingUtc,
        });
      }
    }
  }

  return { businessCloseUtc: businessCloseUtc.toISOString(), slots, builtAt: Date.now() };
}

// ── Worker job processor ───────────────────────────────────────────────────────

async function processJob(job: Job<SlotJobData>): Promise<void> {
  const { storeId, dates, reason } = job.data;

  // Fetch timezone once for the store
  const [storeRow] = await db
    .select({ timezone: locations.timezone })
    .from(locations)
    .where(
      (await import("drizzle-orm")).eq(locations.id, storeId),
    )
    .limit(1);

  if (!storeRow) {
    console.warn(`[SlotBuilder] Store ${storeId} not found — skipping`);
    return;
  }

  const tz = storeRow.timezone || "UTC";
  let built = 0;

  for (const date of dates) {
    try {
      const dayCache = await buildSlotsForDate(storeId, date, tz);
      await setSlotCache(storeId, date, dayCache);
      built++;
    } catch (err: any) {
      console.warn(`[SlotBuilder] Error building store=${storeId} date=${date}:`, err.message);
    }
  }

  console.log(
    `[SlotBuilder] Built ${built}/${dates.length} date(s) for store=${storeId} reason=${reason}`,
  );
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function startSlotBuilderWorker(): void {
  const redis = getRedisClient();
  if (!redis) {
    console.log("[SlotBuilder] Redis not configured — worker not started");
    return;
  }

  if (_worker) return;

  const w = new Worker<SlotJobData>(SLOT_QUEUE_NAME, processJob, {
    connection: redis as any,
    concurrency: 3,
    limiter: { max: 10, duration: 1000 },
  });
  _worker = w as any;

  w.on("completed", (job) => {
    const { storeId, dates } = job.data;
    console.log(`[SlotBuilder] Job ${job.id} done — store=${storeId} dates=${dates.length}`);
  });

  w.on("failed", (job, err) => {
    console.warn(`[SlotBuilder] Job ${job?.id} failed:`, err.message);
  });

  w.on("error", (err) => {
    console.warn("[SlotBuilder] Worker error:", err.message);
  });

  console.log("[SlotBuilder] Worker started");
}

export async function stopSlotBuilderWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
}

/** Exposed for one-off CLI warmup calls */
export { buildSlotsForDate };
