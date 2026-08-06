/**
 * Auto Clock-Out Scheduler
 * ─────────────────────────
 * Runs every 5 minutes. For each store whose business-hours close time has
 * passed (in the store's local timezone), any staff member still clocked in
 * is automatically clocked out at the store's configured close time.
 *
 * This prevents staff from showing as "clocked in" the next business day.
 * The turn-system deque is also fully reset so the next day starts fresh.
 *
 * Registered in index.ts → startAutoClockOutScheduler().
 */

import { db } from "../db";
import { timeclock, businessHours, locations, storeSettings } from "@shared/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";

function safeParsePreferences(raw: string | null | undefined): Record<string, any> {
  if (!raw) return {};
  try { const p = JSON.parse(raw); return p && typeof p === "object" ? p : {}; } catch { return {}; }
}

/** Returns the autoClockOutFloor (HH:MM) for a store from its preferences, defaulting to "01:00". */
async function getAutoClockOutFloor(storeId: number): Promise<string> {
  const [row] = await db.select({ preferences: storeSettings.preferences }).from(storeSettings).where(eq(storeSettings.storeId, storeId));
  const prefs = safeParsePreferences(row?.preferences as string | undefined);
  const features = prefs.features && typeof prefs.features === "object" ? prefs.features : {};
  const floor = features.autoClockOutFloor;
  return typeof floor === "string" && /^\d{2}:\d{2}$/.test(floor) ? floor : "01:00";
}

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

// Guard: storeId → UTC date string of last successful auto clock-out.
// Prevents re-processing the same store within the same UTC day.
const processedOnDate = new Map<number, string>();

// ─── Timezone helpers ─────────────────────────────────────────────────────────

/** Returns the current local date "YYYY-MM-DD" for the given IANA timezone. */
function localDate(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

/** Returns minutes since midnight (0–1439) in the store's local timezone. */
function localMinutesSinceMidnight(tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const h = parseInt(p.hour === "24" ? "0" : p.hour, 10);
  const m = parseInt(p.minute, 10);
  return h * 60 + m;
}

/** Returns the 0-indexed day of week (0=Sun…6=Sat) in the store's local timezone. */
function localDayOfWeek(tz: string): number {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(new Date());
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[label] ?? 0;
}

/**
 * Builds a UTC Date for "HH:MM on dateStr" in the given timezone.
 * e.g. ("2026-05-21", "19:00", "America/New_York") → UTC Date for 23:00 UTC.
 */
function buildCloseTimestamp(dateStr: string, closeTime: string, tz: string): Date {
  const [ch, cm] = closeTime.split(":").map(Number);

  // Treat the target time as if it were UTC, then measure how far off it is
  // from what the timezone actually shows, and correct.
  const approx = new Date(`${dateStr}T${String(ch).padStart(2, "0")}:${String(cm).padStart(2, "0")}:00.000Z`);

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(approx);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const localH = parseInt(p.hour === "24" ? "0" : p.hour, 10);
  const localM = parseInt(p.minute, 10);

  const diffMs = ((ch * 60 + cm) - (localH * 60 + localM)) * 60 * 1000;
  return new Date(approx.getTime() + diffMs);
}

// ─── Turn system reset ────────────────────────────────────────────────────────

/**
 * Clears all end-of-day turn state so the next business day starts fresh:
 * - clockedInStaffIds reset to []
 * - clockedOutStaffIds reset to []
 * - dequeOrder reset to [] (rebuilt from clock-in order next morning)
 * - lockedStaffIds reset to []
 * - shortTurnProtectedId cleared
 */
async function resetTurnSystemForStore(storeId: number): Promise<void> {
  const [existing] = await db
    .select()
    .from(storeSettings)
    .where(eq(storeSettings.storeId, storeId));

  if (!existing) return;

  let prefs: Record<string, any> = {};
  try {
    prefs = JSON.parse(existing.preferences as string);
  } catch {
    prefs = {};
  }

  const currentTurn =
    prefs.turnSystem && typeof prefs.turnSystem === "object"
      ? prefs.turnSystem
      : {};

  const nextTurn = {
    ...currentTurn,
    clockedInStaffIds: [],
    clockedOutStaffIds: [],
    dequeOrder: [],
    lockedStaffIds: [],
    shortTurnProtectedId: null,
  };

  const preferences = JSON.stringify({ ...prefs, turnSystem: nextTurn });
  await db
    .update(storeSettings)
    .set({ preferences, updatedAt: new Date() })
    .where(eq(storeSettings.storeId, storeId));
}

// ─── Main check ───────────────────────────────────────────────────────────────

async function runAutoClockOut(): Promise<void> {
  const nowUtc = new Date();
  const todayUtc = nowUtc.toISOString().split("T")[0];
  const yesterdayUtc = new Date(nowUtc.getTime() - 86_400_000)
    .toISOString()
    .split("T")[0];

  // 1. Find all stores that have at least one open clock-in record
  //    (from today or yesterday UTC — covers stores west of UTC near midnight).
  const openRecords = await db
    .select({
      id: timeclock.id,
      staffId: timeclock.staffId,
      storeId: timeclock.storeId,
      workDate: timeclock.workDate,
      clockIn: timeclock.clockIn,
    })
    .from(timeclock)
    .where(
      and(
        isNull(timeclock.clockOut),
        inArray(timeclock.workDate, [todayUtc, yesterdayUtc])
      )
    );

  if (openRecords.length === 0) return;

  // 2. Gather unique store IDs that need attention.
  const storeIds = [...new Set(openRecords.map((r) => r.storeId))];

  // 3. Load store timezone for each.
  const storeRows = await db
    .select({ id: locations.id, timezone: locations.timezone })
    .from(locations)
    .where(inArray(locations.id, storeIds));

  const timezoneByStore = new Map(storeRows.map((s) => [s.id, s.timezone || "UTC"]));

  // 4. Process each store.
  for (const storeId of storeIds) {
    try {
      const tz = timezoneByStore.get(storeId) ?? "UTC";

      // Skip if already processed during this UTC day.
      if (processedOnDate.get(storeId) === todayUtc) continue;

      const dayOfWeek = localDayOfWeek(tz);
      const currentLocalMinutes = localMinutesSinceMidnight(tz);
      const storeDateStr = localDate(tz);

      // 5. Look up today's business hours for this store.
      const [hours] = await db
        .select()
        .from(businessHours)
        .where(
          and(
            eq(businessHours.storeId, storeId),
            eq(businessHours.dayOfWeek, dayOfWeek)
          )
        )
        .limit(1);

      // Determine the close minute threshold:
      //   • No hours record → skip (we don't know the schedule).
      //   • isClosed = true → use end of day (23:59) so closed-day staff
      //     are clocked out by midnight.
      //   • Normal day → use the configured closeTime.
      if (!hours) continue;

      const closeMinutes = hours.isClosed
        ? 23 * 60 + 59
        : (() => {
            const [h, m] = (hours.closeTime ?? "23:59").split(":").map(Number);
            return h * 60 + m;
          })();

      // Only act once the close time has passed locally.
      if (currentLocalMinutes < closeMinutes) continue;

      // Per-store floor: never clock out before the configurable earliest time (default 01:00 local).
      const floorStr = await getAutoClockOutFloor(storeId);
      const [fh, fm] = floorStr.split(":").map(Number);
      const floorMinutes = fh * 60 + fm;
      if (currentLocalMinutes < floorMinutes) {
        console.log(`[AutoClockOut] Store ${storeId} (${tz}): skipping — before floor ${floorStr} (now=${currentLocalMinutes}min)`);
        continue;
      }

      // 6. Collect the open records belonging to this store.
      const storeOpenRecords = openRecords.filter((r) => r.storeId === storeId);
      if (storeOpenRecords.length === 0) {
        processedOnDate.set(storeId, todayUtc);
        continue;
      }

      // 7. Build the clock-out timestamp (the store's close time, not "now").
      const clockOutTime = hours.isClosed
        ? nowUtc
        : buildCloseTimestamp(storeDateStr, hours.closeTime, tz);

      // 8. Only clock out records where the staff clocked IN before the store's
      //    close time. If someone re-clocked in after close (e.g. for a late
      //    appointment), their new record is excluded — they won't be auto-clocked
      //    out again even after a server restart.
      const recordsToClose = storeOpenRecords.filter(
        (r) => r.clockIn < clockOutTime
      );

      if (recordsToClose.length === 0) {
        // Everyone still here clocked in after close — leave them alone.
        processedOnDate.set(storeId, todayUtc);
        continue;
      }

      for (const record of recordsToClose) {
        await db
          .update(timeclock)
          .set({ clockOut: clockOutTime })
          .where(eq(timeclock.id, record.id));
      }

      // 9. Reset the turn system so tomorrow starts clean.
      await resetTurnSystemForStore(storeId);

      processedOnDate.set(storeId, todayUtc);

      const skipped = storeOpenRecords.length - recordsToClose.length;
      console.log(
        `[AutoClockOut] Store ${storeId} (${tz}): auto clocked out ` +
          `${recordsToClose.length} staff at ${clockOutTime.toISOString()} ` +
          `(close time: ${hours.isClosed ? "closed day" : hours.closeTime}, local time: ${currentLocalMinutes}min past midnight)` +
          (skipped > 0 ? ` — skipped ${skipped} who re-clocked in after close` : "")
      );
    } catch (err: any) {
      console.error(
        `[AutoClockOut] Error processing store ${storeId}:`,
        err.message
      );
    }
  }
}

// ─── Startup ──────────────────────────────────────────────────────────────────

export function startAutoClockOutScheduler(): void {
  const run = (): void => {
    runAutoClockOut().catch((err) =>
      console.error("[AutoClockOut] Scheduler run failed:", err)
    );
  };

  // Run immediately in case the server was restarted after a store's close time.
  run();
  setInterval(run, CHECK_INTERVAL_MS);

  console.log(
    "[AutoClockOut] Scheduler started — checks every 5 minutes, " +
      "clocks out staff at each store's configured close time"
  );
}
