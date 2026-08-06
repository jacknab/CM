/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Store Context Engine
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Provides two public functions used by the AI receptionist at call start:
 *
 *   getStoreProfile(storeId)
 *     Loads the full static store profile (name, services, staff, amenities,
 *     policies) from the database. Cached per process — cheap to call.
 *
 *   getCallAvailabilitySnapshot(storeId, services, timezone)
 *     Reads the Redis availability cache for the next 7 days across all
 *     services. Returns a compact, pre-formatted text block that is injected
 *     directly into the AI system prompt, eliminating the need for the AI to
 *     make search_available_slots tool calls for near-term dates.
 *
 * Both functions degrade gracefully: if Redis is not configured or the DB is
 * slow, they return null / empty data so the call still proceeds normally.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db } from "../db";
import { locations, services, staff as staffTable } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { toZonedTime, formatInTimeZone } from "date-fns-tz";
import { getAvailabilityCache } from "./availabilityCache";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StoreService {
  id: number;
  name: string;
  durationMinutes: number;
  price: string;
}

export interface StoreStaffMember {
  id: number;
  name: string;
}

export interface StoreProfile {
  storeId: number;
  businessName: string;
  timezone: string;
  bookingSlug: string | null;
  businessPhone: string | null;
  services: StoreService[];
  staffMembers: StoreStaffMember[];
  parkingOptions: string[];
  accessibilityFeatures: string[];
  beverageOptions: { complimentary?: string[]; paid?: string[] } | null;
  policies: {
    sameDayBookings: false;
    cancellationNote: string | null;
  };
}

// ── Store profile loader ───────────────────────────────────────────────────────

export async function getStoreProfile(storeId: number): Promise<StoreProfile | null> {
  try {
    const [store] = await db
      .select({
        id: locations.id,
        name: locations.name,
        timezone: locations.timezone,
        bookingSlug: locations.bookingSlug,
        phone: locations.phone,
        parkingOptions: locations.parkingOptions,
        accessibilityFeatures: locations.accessibilityFeatures,
        beverageOptions: locations.beverageOptions,
      })
      .from(locations)
      .where(eq(locations.id, storeId))
      .limit(1);

    if (!store) return null;

    const [storeServices, storeStaff] = await Promise.all([
      db
        .select({ id: services.id, name: services.name, duration: services.duration, price: services.price })
        .from(services)
        .where(eq(services.storeId, storeId)),
      db
        .select({ id: staffTable.id, name: staffTable.name, status: staffTable.status })
        .from(staffTable)
        .where(
          and(
            eq(staffTable.storeId, storeId),
            inArray(staffTable.status, ["active", "stylist"]),
          ),
        ),
    ]);

    return {
      storeId,
      businessName: store.name,
      timezone: store.timezone ?? "UTC",
      bookingSlug: store.bookingSlug ?? null,
      businessPhone: store.phone ?? null,
      services: storeServices.map((s) => ({
        id: s.id,
        name: s.name,
        durationMinutes: s.duration,
        price: String(s.price ?? "0.00"),
      })),
      staffMembers: storeStaff.map((s) => ({ id: s.id, name: s.name })),
      parkingOptions: (store.parkingOptions as string[] | null) ?? [],
      accessibilityFeatures: (store.accessibilityFeatures as string[] | null) ?? [],
      beverageOptions: store.beverageOptions as { complimentary?: string[]; paid?: string[] } | null,
      policies: {
        sameDayBookings: false,
        cancellationNote: null,
      },
    };
  } catch (err) {
    console.error("[StoreContext] getStoreProfile failed:", err);
    return null;
  }
}

// ── Availability snapshot ─────────────────────────────────────────────────────

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MAX_SLOTS_PER_SERVICE = 6;
const DAYS_AHEAD = 7;

function formatLocalDate(date: Date, timezone: string): string {
  // Use formatInTimeZone directly — never .getDay()/.getMonth()/.getDate() on a
  // zoned Date object because those getters use the server's process TZ, not the
  // salon's timezone.  On a non-UTC server they would return wrong values.
  const dayName   = formatInTimeZone(date, timezone, "EEE"); // "Mon", "Tue", …
  const monthName = formatInTimeZone(date, timezone, "MMM"); // "Jan", "Feb", …
  const dayNum    = formatInTimeZone(date, timezone, "d");   // "1", "15", …
  return `${dayName} ${monthName} ${dayNum}`;
}

function formatSlotTime(isoTime: string, timezone: string): string {
  const d = new Date(isoTime);
  // Use formatInTimeZone directly instead of toZonedTime + .getHours()/.getMinutes(),
  // which are server-TZ-dependent and would break on non-UTC servers.
  const h = parseInt(formatInTimeZone(d, timezone, "H"), 10);
  const m = parseInt(formatInTimeZone(d, timezone, "m"), 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  const minStr = m === 0 ? "" : `:${String(m).padStart(2, "0")}`;
  return `${hour12}${minStr} ${ampm}`;
}

function nextNDates(timezone: string, n: number): string[] {
  const dates: string[] = [];
  const nowLocal = toZonedTime(new Date(), timezone);
  // Start from tomorrow (same-day bookings are never accepted)
  for (let i = 1; i <= n; i++) {
    const d = new Date(nowLocal);
    d.setDate(d.getDate() + i);
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, "0");
    const dd   = String(d.getDate()).padStart(2, "0");
    dates.push(`${yyyy}-${mm}-${dd}`);
  }
  return dates;
}

/**
 * Builds a compact availability snapshot string by reading the Redis cache for
 * all services × next N days. Fast — only Redis reads, no DB queries.
 *
 * Returns null if Redis is not configured or every cache read missed.
 */
export async function getCallAvailabilitySnapshot(
  storeId: number,
  services: { id: number; name: string; durationMinutes: number }[],
  timezone: string,
): Promise<string | null> {
  if (!services.length) return null;

  const dates = nextNDates(timezone, DAYS_AHEAD);

  // Fetch all service × date combos from Redis in parallel (all-any cache reads)
  const entries: Array<{
    date: string;
    serviceId: number;
    serviceName: string;
    durationMinutes: number;
    slots: { time: string; staffId: number; staffName: string }[] | null;
  }> = await Promise.all(
    dates.flatMap((date) =>
      services.map(async (svc) => ({
        date,
        serviceId: svc.id,
        serviceName: svc.name,
        durationMinutes: svc.durationMinutes,
        slots: await getAvailabilityCache(storeId, date, svc.id).catch(() => null),
      })),
    ),
  );

  // Group by date — only include dates where at least one service had a cache hit
  const byDate = new Map<string, typeof entries>();
  for (const entry of entries) {
    if (entry.slots === null) continue; // Cache miss — skip
    if (!byDate.has(entry.date)) byDate.set(entry.date, []);
    byDate.get(entry.date)!.push(entry);
  }

  if (byDate.size === 0) return null; // All cache misses — AI uses tools as normal

  const lines: string[] = [
    "══ PRE-LOADED AVAILABILITY ══",
    `Loaded at call start from cache. Use these slots directly — no tool call needed for these dates.`,
    `For any date NOT listed below, call search_available_slots as usual.`,
    "",
  ];

  for (const date of dates) {
    if (!byDate.has(date)) continue; // Cache miss — omit this date entirely

    const localLabel = formatLocalDate(
      new Date(`${date}T12:00:00`), // noon to avoid DST boundary issues
      timezone,
    );
    lines.push(`${localLabel}:`);

    const dayEntries = byDate.get(date)!;
    for (const entry of dayEntries) {
      if (entry.slots!.length === 0) {
        lines.push(`  • ${entry.serviceName} — fully booked`);
        continue;
      }
      const top = entry.slots!.slice(0, MAX_SLOTS_PER_SERVICE);
      const extra = entry.slots!.length - top.length;
      // Staff names are intentionally omitted from the display — Autumn must
      // offer times only and not mention staff unless caller asked for one.
      // staffId is still retained internally so create_booking can use it.
      const slotStr = top
        .map((s) => formatSlotTime(s.time, timezone))
        .join(" · ");
      const moreStr = extra > 0 ? ` +${extra} more` : "";
      lines.push(`  • ${entry.serviceName} (${entry.durationMinutes}min) — ${slotStr}${moreStr}`);
    }
    lines.push("");
  }

  lines.push("══ END AVAILABILITY ══");
  return lines.join("\n");
}
