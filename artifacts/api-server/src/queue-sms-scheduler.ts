import { db } from "./db";
import { waitlist, locations, storeSettings } from "@shared/schema";
import { eq, and, gte, isNull, isNotNull, ne, desc, asc } from "drizzle-orm";
import { sendSms } from "./sms";

// ─── Haversine distance (miles) ─────────────────────────────────────────────
function haversineDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Drive time estimate ─────────────────────────────────────────────────────
// Returns estimated drive time in minutes given distance in miles.
// Uses conservative urban speed estimates to avoid under-estimating.
export function estimateDriveMinutes(distanceMiles: number): number {
  if (distanceMiles < 0.25) return 3;    // walkable
  if (distanceMiles < 1.0)  return Math.round(distanceMiles * 6);  // ~10 mph (heavy urban)
  if (distanceMiles < 3.0)  return Math.round(distanceMiles * 4);  // ~15 mph (city)
  if (distanceMiles < 8.0)  return Math.round(distanceMiles * 2.5); // ~24 mph (mixed)
  return Math.round(distanceMiles * 1.8);                            // ~33 mph (suburban/highway)
}

// ─── Actual queue speed from real completion data today ──────────────────────
// Looks at recent completed entries and measures time between consecutive
// completions. Falls back to the configured average if insufficient data.
async function getRealAvgServiceTime(storeId: number, configuredDefault: number): Promise<number> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const recent = await db
    .select({ completedAt: waitlist.completedAt })
    .from(waitlist)
    .where(
      and(
        eq(waitlist.storeId, storeId),
        gte(waitlist.createdAt, todayStart),
        eq(waitlist.status, "completed"),
        isNotNull(waitlist.completedAt)
      )
    )
    .orderBy(desc(waitlist.completedAt))
    .limit(12);

  if (recent.length < 2) return configuredDefault;

  const gaps: number[] = [];
  for (let i = 0; i < recent.length - 1; i++) {
    const a = new Date(recent[i].completedAt!).getTime();
    const b = new Date(recent[i + 1].completedAt!).getTime();
    const gapMin = (a - b) / 60_000;
    if (gapMin > 1 && gapMin < 90) gaps.push(gapMin); // filter outliers
  }

  if (gaps.length === 0) return configuredDefault;
  const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  // Blend 60% real data, 40% configured default for stability
  return Math.round(avg * 0.6 + configuredDefault * 0.4);
}

// ─── Format first name ───────────────────────────────────────────────────────
function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

// ─── Main scheduler tick ─────────────────────────────────────────────────────
async function runQueueSmsCheck(): Promise<void> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Get all waiting entries today that have a phone + customer location + no SMS sent yet
  const candidates = await db
    .select()
    .from(waitlist)
    .where(
      and(
        eq(waitlist.status, "waiting"),
        gte(waitlist.createdAt, todayStart),
        isNotNull(waitlist.customerPhone),
        ne(waitlist.customerPhone, ""),
        isNotNull(waitlist.customerLatitude),
        isNotNull(waitlist.customerLongitude),
        isNull(waitlist.smsSentAt)
      )
    )
    .orderBy(asc(waitlist.createdAt));

  if (candidates.length === 0) return;

  // Group by store so we only fetch each store's data once
  const storeIds = Array.from(new Set(candidates.map(e => e.storeId)));

  for (const storeId of storeIds) {
    // Fetch store data
    const [store] = await db
      .select()
      .from(locations)
      .where(eq(locations.id, storeId));
    if (!store) continue;

    // Skip stores without a pinned location (can't compute distance)
    const storeLat = store.storeLatitude ? parseFloat(store.storeLatitude) : null;
    const storeLon = store.storeLongitude ? parseFloat(store.storeLongitude) : null;

    // Get queue settings for avg service time
    const [settingsRow] = await db
      .select()
      .from(storeSettings)
      .where(eq(storeSettings.storeId, storeId));
    const prefs = settingsRow?.preferences ? JSON.parse(settingsRow.preferences as string) : {};
    const configuredAvg: number = prefs.queueAvgServiceTime || 20;
    const bufferMinutes: number = prefs.smsTravelBuffer ?? 5;

    // Get the real avg service time from today's data
    const realAvg = await getRealAvgServiceTime(storeId, configuredAvg);

    // Get the full active queue for this store to determine positions
    const activeQueue = await db
      .select({ id: waitlist.id, status: waitlist.status })
      .from(waitlist)
      .where(
        and(
          eq(waitlist.storeId, storeId),
          gte(waitlist.createdAt, todayStart),
          // people in active states count toward queue position
        )
      )
      .orderBy(asc(waitlist.createdAt));

    // Only count waiting + called + serving entries for position calculation
    const queuedIds = activeQueue
      .filter(e => e.status !== null && ["waiting", "called", "serving"].includes(e.status))
      .map(e => e.id);

    // Process each candidate for this store
    const storeCandidates = candidates.filter(e => e.storeId === storeId);

    for (const entry of storeCandidates) {
      const customerLat = parseFloat(entry.customerLatitude!);
      const customerLon = parseFloat(entry.customerLongitude!);

      // Position in queue (1-indexed, 1 = next up)
      const position = queuedIds.indexOf(entry.id) + 1;
      if (position <= 0) continue; // entry not in active queue (shouldn't happen)

      // People ahead (position 1 = nobody ahead)
      const peopleAhead = Math.max(0, position - 1);

      // Time until their turn (minutes)
      const timeUntilTurn = peopleAhead * realAvg;

      // Drive time calculation (only if store has coordinates)
      let driveMinutes = 0;
      if (storeLat !== null && storeLon !== null) {
        const distanceMiles = haversineDistanceMiles(customerLat, customerLon, storeLat, storeLon);
        driveMinutes = estimateDriveMinutes(distanceMiles);
      } else {
        // No store location — use a fallback of position 1 trigger only
        driveMinutes = 0;
      }

      // Trigger condition: if time until turn is less than or equal to
      // the drive time + buffer, it's time to send the SMS
      const shouldSend = timeUntilTurn <= driveMinutes + bufferMinutes;

      if (shouldSend) {
        const name = firstName(entry.customerName);
        const mapsLink = storeLat && storeLon
          ? ` https://maps.google.com/?q=${storeLat},${storeLon}`
          : "";

        let message: string;
        if (position === 1) {
          message = `Hey ${name}! You're NEXT at ${store.name} — head over now, we'll be ready for you! 🚗${mapsLink}`;
        } else {
          message = `Hey ${name}! You're #${position} in line at ${store.name} — time to start heading over now so you're here on time! 🚗${mapsLink}`;
        }

        const result = await sendSms(
          storeId,
          entry.customerPhone!,
          message,
          "queue_travel_alert"
        );

        if (result.success) {
          // Mark SMS as sent
          await db
            .update(waitlist)
            .set({ smsSentAt: new Date() })
            .where(eq(waitlist.id, entry.id));

          console.log(`[Queue SMS] Sent travel alert to ${name} (entry #${entry.id}) — position ${position}, drive ~${driveMinutes} min, wait ~${timeUntilTurn} min`);
        }
      }
    }
  }
}

// ─── Start the scheduler ─────────────────────────────────────────────────────
export function startQueueSmsScheduler(): void {
  const INTERVAL_MS = 2 * 60 * 1000; // every 2 minutes

  console.log("[Queue SMS] Smart travel-alert scheduler started (checks every 2 minutes)");

  // Run immediately on start, then every 2 minutes
  runQueueSmsCheck().catch(err => console.error("[Queue SMS] Error:", err));
  setInterval(() => {
    runQueueSmsCheck().catch(err => console.error("[Queue SMS] Error:", err));
  }, INTERVAL_MS);
}
