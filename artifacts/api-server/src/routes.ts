import express, { type Express, type Request, type Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { triggerDashboardBroadcast } from "./routes/dashboardWS";
import { logActivityEvent } from "./lib/activityFeed";
import { triggerTranslation } from "./lib/translationService";
import supportRouter from "./routes/support";
import { resolveSessionStoreId } from "./lib/sessionStore";
import { resolveTimezoneFromAddress, hasAddressChange } from "./lib/resolveTimezone";
import { getOrCreateTodayBusinessDay, getPendingReconciliation, getLocalDateString, computeBusinessDayTotals } from "./lib/businessDay";
import { api } from "@shared/routes";
import { isAuthenticated } from "./auth";
import { attachAuthContext, requirePermission, ownStaffScope, can } from "./middleware/permissions";
import { requireNotSuspended } from "./middleware/suspension-middleware";
import { PERMISSIONS } from "@shared/permissions";
import { z } from "zod";
import { db, pool, waitForDb } from "./db";
import { users } from "@shared/models/auth";
import { eq, and, or, ne, desc, sql, count, gte, lte, asc, isNull, isNotNull, inArray, notInArray, like } from "drizzle-orm";
import { sendEmail, sendBookingConfirmationEmail, sendReminderEmail, sendReviewRequestEmail, startEmailReminderScheduler } from "./mail";
import { businessTemplates } from "./onboarding-data";
import { fromZonedTime, toZonedTime, formatInTimeZone } from "date-fns-tz";
import { atomicCreateBooking, validateBookingSlot } from "./bookingEngine";
import { sendBookingConfirmation, startReminderScheduler } from "./sms";
import { startQueueSmsScheduler } from "./queue-sms-scheduler";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import multer from "multer";
import { uploadToR2, uploadAvatarToR2, memoryUpload, extractR2KeyFromUrl, getObjectFromR2 } from "./lib/r2";
import { encryptToken, decryptToken } from "./lib/googleTokenCrypto";
import { 
  insertLocationSchema,
  insertServiceCategorySchema,
  insertServiceSchema, 
  insertAddonSchema,
  insertServiceAddonSchema,
  insertStaffSchema,
  insertCustomerSchema, 
  insertAppointmentSchema, 
  type Staff,
  insertProductSchema,
  locations,
  insertCashDrawerSessionSchema,
  insertCalendarSettingsSchema,
  googleBusinessProfiles,
  googleBusinessAccounts,
  googleBusinessLocations,
  googleBusinessSyncLogs,
  googleReviews,
  googleReviewResponses,
  googleReviewResponseQueue,
  googleReviewEngineSettings,
  insertGoogleReviewResponseSchema,
  appointments,
  staff,
  services,
  serviceOptions,
  serviceCategories,
  calendarSettings,
  smsSettings,
  mailSettings,
  waitlist,
  giftCards,
  giftCardTransactions,
  intakeForms,
  intakeFormFields,
  intakeFormResponses,
  loyaltyTransactions,
  reviews,
  staffPins,
  timeclock,
  storeSettings,
  seoRegions,
  insertSeoRegionSchema,
  smsLog,
  businessHours,
  payrollRuns,
  payrollRunItems,
  addons,
  appointmentAddons,
  turnAssignmentLog,
  staffAvailability,
  platformCreditTransactions,
  storeSubscriptions,
  subscriptionPlans,
  clients,
  clientPhones,
  type PayrollRun,
  type PayrollRunItem,
  commissionStructures,
  contractors,
  payoutDeductionRules,
  payoutRunItems,
  payoutRuns,
  serviceIllustrationCategories,
  billingPlans,
  googleServiceSyncSettings,
  gbpOptimizationLogs,
  salonResources,
  posGrids,
  posGridSlots,
} from "@shared/schema";
import { buildRegionSlug, ALL_CITIES, BOOKING_BUSINESS_TYPES } from "./seo-cities";
import { notifyKioskNoShowWaitlist } from "./lib/kioskNoShowWaitlist";
import { seedFromPresetStore } from "./lib/presetSeed";
import {
  GoogleBusinessAPIManager,
  createApiManagerFromProfile,
  publishReviewResponse,
  getGoogleBusinessCallbackUrl,
  syncListingToGoogle,
  updateListingFields,
  syncServicesToGoogle,
  fetchAndStoreReviewLink,
  clearGBPAuthFailure,
} from "./google-business-api";
import { syncReviewsForStore, startGoogleReviewSyncScheduler } from "./google-review-sync";
import { TrialService } from "./services/trial-service";
import { requireActiveTrial } from "./middleware/trial-middleware";
import { isStripeConfigured, getStripe } from "./lib/stripe";
import { setupNotificationServer, broadcastNotification, broadcastSyncEvent } from "./notifications";
import { broadcastAppointmentStatus, registerSseClient } from "./lib/appointmentEvents";
import { setupAiReceptionistRoutes } from "./routes/aiReceptionist";
import { setupSupportAgentRoutes } from "./routes/supportAgent";
import validateRouter from "./routes/validate";
import onboardingRouter from "./routes/onboarding";
import usageRouter from "./routes/usage";
import { autoAssignTechnician } from "./services/appointment-assignment";
import { toE164US } from "./lib/phoneUtils";
import { checkOAuthRateLimit, syncCooldowns, SYNC_COOLDOWN_MS, getRateLimitSnapshot, clearRateLimitEntry, clearAllRateLimits, type RateLimitCategory } from "./rate-limits";
import { db as websiteDb, websitesTable, templatesTable } from "@workspace/db";

const BLOOM_TEMPLATE_NAME = "Nail Salon — Bloom";
const ONBOARDING_RESERVED_SLUGS = new Set([
  "www", "api", "admin", "app", "mail", "smtp", "ftp", "ns1", "ns2",
  "dev", "staging", "production", "support", "help", "blog", "status",
  "static", "assets", "cdn", "media", "img", "images",
]);

async function isOnboardingSlugAvailable(slug: string, storeId?: number): Promise<boolean> {
  if (
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$|^[a-z0-9]{2,63}$/.test(slug)
    || ONBOARDING_RESERVED_SLUGS.has(slug)
  ) {
    return false;
  }

  const [storeConflict, websiteConflict] = await Promise.all([
    db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.bookingSlug, slug))
      .limit(1),
    websiteDb
      .select({ id: websitesTable.id })
      .from(websitesTable)
      .where(eq(websitesTable.slug, slug))
      .limit(1),
  ]);

  const storeTaken = Boolean(storeConflict[0] && storeConflict[0].id !== storeId);
  return !storeTaken && websiteConflict.length === 0;
}

async function chooseOnboardingSlug(baseValue: string, storeId?: number): Promise<string> {
  const baseSlug = baseValue
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50) || "salon";
  const normalizedBase = baseSlug.length >= 3 ? baseSlug : `salon-${baseSlug}`;

  let slug = normalizedBase;
  let attempt = 1;
  while (!(await isOnboardingSlugAvailable(slug, storeId))) {
    attempt += 1;
    const suffix = `-${attempt}`;
    slug = `${normalizedBase.slice(0, 50 - suffix.length)}${suffix}`;
  }
  return slug;
}

async function ensureBloomWebsite(storeId: number, salonName: string, slug: string) {
  const [template] = await websiteDb
    .select({ id: templatesTable.id })
    .from(templatesTable)
    .where(and(
      eq(templatesTable.name, BLOOM_TEMPLATE_NAME),
      eq(templatesTable.category, "nail_salon"),
    ))
    .limit(1);

  if (!template) {
    throw new Error(`${BLOOM_TEMPLATE_NAME} template is not available yet`);
  }

  const [existingWebsite] = await websiteDb
    .select()
    .from(websitesTable)
    .where(and(
      eq(websitesTable.storeid, String(storeId)),
      eq(websitesTable.templateId, template.id),
    ))
    .limit(1);

  if (existingWebsite) {
    if (existingWebsite.slug === slug && existingWebsite.published) return existingWebsite;

    if (existingWebsite.slug !== slug && !(await isOnboardingSlugAvailable(slug, storeId))) {
      throw new Error("The requested subdomain is already taken");
    }

    const [updatedWebsite] = await websiteDb
      .update(websitesTable)
      .set({
        name: salonName.trim(),
        slug,
        templateId: template.id,
        published: true,
        publishedAt: existingWebsite.publishedAt ?? new Date(),
      })
      .where(eq(websitesTable.id, existingWebsite.id))
      .returning();
    return updatedWebsite;
  }

  const slugAvailable = await isOnboardingSlugAvailable(slug, storeId);
  if (!slugAvailable) {
    throw new Error("The requested subdomain is already taken");
  }

  const [website] = await websiteDb
    .insert(websitesTable)
    .values({
      name: salonName.trim(),
      slug,
      storeid: String(storeId),
      templateId: template.id,
      content: {},
      published: true,
      publishedAt: new Date(),
      publisherType: "template",
      autoSettings: {},
    })
    .returning();
  return website;
}

function resolveUploadsRoot(): string {
  const explicit = String(process.env.UPLOADS_DIR ?? "").trim();
  if (explicit) return path.resolve(explicit);

  // Anchor to __dirname so the path is immune to PM2 cwd differences.
  // Dev:  __dirname = artifacts/api-server/src/  → ../uploads = artifacts/api-server/uploads/
  // Prod: __dirname = artifacts/api-server/dist/ → ../uploads = artifacts/api-server/uploads/
  try {
    return path.resolve(__dirname, "../uploads");
  } catch {
    // __dirname unavailable in ESM contexts — fall back to cwd heuristic
  }

  const cwd = process.cwd();
  if (fs.existsSync(path.resolve(cwd, "artifacts/api-server"))) {
    return path.resolve(cwd, "artifacts/api-server/uploads");
  }
  return path.resolve(cwd, "uploads");
}

const UPLOADS_ROOT = resolveUploadsRoot();

/**
 * Return a publicly reachable URL for an uploaded file.
 *
 * When APP_URL is set (VPS / production) the path is made absolute so the
 * browser fetches the file directly from the API server regardless of how
 * nginx routes the frontend domain.  In dev (no APP_URL) it stays relative
 * so Vite's /uploads proxy handles it transparently.
 */
function buildUploadUrl(relativePath: string): string {
  const base = (process.env.APP_URL || "").replace(/\/+$/, "");
  if (!base) return relativePath;
  return `${base}${relativePath.startsWith("/") ? "" : "/"}${relativePath}`;
}

function ensureUploadsSubdir(subdir: string): string {
  const dir = path.resolve(UPLOADS_ROOT, subdir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const processedIdempotencyKeys = new Map<string, { ts: number; body: unknown }>();
setInterval(() => {
  const cutoff = Date.now() - IDEMPOTENCY_TTL_MS;
  for (const [key, val] of processedIdempotencyKeys) {
    if (val.ts < cutoff) processedIdempotencyKeys.delete(key);
  }
}, 60 * 60 * 1000);

const DEFAULT_TURN_SETTINGS = {
  turnEnabled: true,
  autoAdvanceOnCheckout: true,
  useClockInOrder: true,
  allowManagerOverrides: true,
  turnValueThreshold: 30,
  appointmentExclusionWindowMinutes: 20,
  dequeOrder: [] as number[],
  lockedStaffIds: [] as number[],
  shortTurnProtectedId: null as number | null,
};

function safeParsePreferences(raw: string | null | undefined): Record<string, any> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Convert "HH:MM" (24-hour) or a local Date to a 12-hour string like "9:00 AM". */
function fmt12(input: string | Date): string {
  let h: number, m: number;
  if (typeof input === "string") {
    [h, m] = input.split(":").map(Number);
  } else {
    h = input.getHours();
    m = input.getMinutes();
  }
  const period = h < 12 ? "AM" : "PM";
  const hour   = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${period}`;
}

function normalizeNumber(value: unknown, fallback: number, min = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

async function getTurnPreferences(storeId: number) {
  const [row] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, storeId));
  const prefs = safeParsePreferences(row?.preferences as string | undefined);
  return {
    ...DEFAULT_TURN_SETTINGS,
    ...(prefs.turnSystem && typeof prefs.turnSystem === "object" ? prefs.turnSystem : {}),
    appointmentExclusionWindowMinutes: normalizeNumber(
      prefs.turnSystem?.appointmentExclusionWindowMinutes,
      DEFAULT_TURN_SETTINGS.appointmentExclusionWindowMinutes,
      1
    ),
    turnValueThreshold: normalizeNumber(
      prefs.turnSystem?.turnValueThreshold,
      DEFAULT_TURN_SETTINGS.turnValueThreshold
    ),
  };
}

async function saveTurnPreferences(storeId: number, updates: Record<string, any>) {
  const [existing] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, storeId));
  const currentPrefs = safeParsePreferences(existing?.preferences as string | undefined);
  const currentTurn = currentPrefs.turnSystem && typeof currentPrefs.turnSystem === "object"
    ? currentPrefs.turnSystem
    : {};
  const nextTurn = {
    ...DEFAULT_TURN_SETTINGS,
    ...currentTurn,
    ...updates,
    appointmentExclusionWindowMinutes: normalizeNumber(
      updates.appointmentExclusionWindowMinutes ?? currentTurn.appointmentExclusionWindowMinutes,
      DEFAULT_TURN_SETTINGS.appointmentExclusionWindowMinutes,
      1
    ),
    turnValueThreshold: normalizeNumber(
      updates.turnValueThreshold ?? currentTurn.turnValueThreshold,
      DEFAULT_TURN_SETTINGS.turnValueThreshold
    ),
  };
  const preferences = JSON.stringify({ ...currentPrefs, turnSystem: nextTurn });
  if (existing) {
    await db.update(storeSettings).set({ preferences, updatedAt: new Date() }).where(eq(storeSettings.storeId, storeId));
  } else {
    await db.insert(storeSettings).values({ storeId, preferences });
  }
  return nextTurn;
}

async function assertOwnStore(userId: string | undefined, storeId: number) {
  if (!userId || !storeId) return null;
  const [store] = await db.select().from(locations).where(and(eq(locations.id, storeId), eq(locations.userId, userId))).limit(1);
  return store || null;
}

// Looser store-access check used by Turn System endpoints:
// Accepts either an owner session (userId owns the store) or a staff session
// (staffId belongs to the store). Front-desk staff need to call these routes.
async function assertStoreAccess(
  userId: string | undefined,
  staffId: number | undefined,
  storeId: number
): Promise<{ id: number } | null> {
  if (!storeId) return null;
  if (userId) {
    const store = await assertOwnStore(userId, storeId);
    if (store) return store;
  }
  if (staffId) {
    const [member] = await db
      .select({ id: staff.id })
      .from(staff)
      .where(and(eq(staff.id, staffId), eq(staff.storeId, storeId)))
      .limit(1);
    if (member) return { id: storeId };
  }
  return null;
}

async function getTurnEligibility(storeId: number, serviceId?: number | null) {
  const settings = await getTurnPreferences(storeId);
  const windowMinutes = settings.appointmentExclusionWindowMinutes;
  const now = new Date();
  const windowEnd = new Date(now.getTime() + windowMinutes * 60000);

  // Resolve store timezone so all "today" comparisons use the salon's local date
  const [storeRow] = await db.select({ timezone: locations.timezone }).from(locations).where(eq(locations.id, storeId)).limit(1);
  const storeTz = (storeRow as any)?.timezone ?? "UTC";
  const localNow  = toZonedTime(now, storeTz);
  const today = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, "0")}-${String(localNow.getDate()).padStart(2, "0")}`;
  const todayStartUtc = fromZonedTime(new Date(`${today}T00:00:00`), storeTz);
  const todayEndUtc   = fromZonedTime(new Date(`${today}T23:59:59.999`), storeTz);

  const storeStaff = await db.select().from(staff).where(eq(staff.storeId, storeId)).orderBy(asc(staff.id));
  const serviceRows = serviceId
    ? await storage.getStaffServices(undefined, serviceId)
    : [];
  const serviceStaffIds = new Set(serviceRows.map((row) => row.staffId));

  const upcomingAppointments = await db.select({
    id: appointments.id,
    staffId: appointments.staffId,
    date: appointments.date,
    status: appointments.status,
  }).from(appointments).where(and(
    eq(appointments.storeId, storeId),
    gte(appointments.date, now),
    sql`${appointments.date} < ${windowEnd}`,
    sql`${appointments.status} NOT IN ('cancelled', 'completed', 'no-show', 'no_show')`,
    isNotNull(appointments.staffId)
  ));

  const upcomingByStaff = new Map<number, { id: number; date: Date; status: string | null }>();
  for (const apt of upcomingAppointments) {
    if (apt.staffId && !upcomingByStaff.has(apt.staffId)) {
      upcomingByStaff.set(apt.staffId, { id: apt.id, date: apt.date, status: apt.status });
    }
  }

  // Get today's clock-in records — used for initial deque seeding
  const todayClockIns = await db
    .select()
    .from(timeclock)
    .where(and(
      eq(timeclock.storeId, storeId),
      eq(timeclock.workDate, today)
    ))
    .orderBy(asc(timeclock.clockIn));

  // Build clockInOrder map: staffId → position (0 = earliest clock-in)
  const clockInOrder = new Map<number, number>();
  let clockInPos = 0;
  const clockedInToday = new Set<number>();
  for (const rec of todayClockIns) {
    if (!rec.clockOut) {
      if (!clockInOrder.has(rec.staffId)) {
        clockInOrder.set(rec.staffId, clockInPos++);
      }
      clockedInToday.add(rec.staffId);
    }
  }

  // === TURN COUNTS (computed first — needed for fairness sort below) ===
  // Only threshold-qualifying completed turns count.
  // In-progress appointments never count until checkout is finalised.
  const turnCountRows = await db
    .select({
      staffId: appointments.staffId,
      cnt: sql<number>`cast(count(*) as int)`,
    })
    .from(appointments)
    .where(and(
      eq(appointments.storeId, storeId),
      gte(appointments.date, todayStartUtc),
      sql`${appointments.date} <= ${todayEndUtc}`,
      sql`(
        ${appointments.status} = 'completed'
        AND ${appointments.totalPaid} IS NOT NULL
        AND (CAST(${appointments.totalPaid} AS numeric) - COALESCE(CAST(${appointments.tipAmount} AS numeric), 0)) >= ${settings.turnValueThreshold}
      )`
    ))
    .groupBy(appointments.staffId);

  const turnCountMap = new Map<number, number>(
    turnCountRows
      .filter((r) => r.staffId !== null)
      .map((r) => [r.staffId!, r.cnt])
  );

  // === DEQUE ORDER MANAGEMENT ===
  // The deque is the canonical queue order, persisted in store settings.
  // On each call we:
  //   1. Remove clocked-out staff
  //   2. Append newly-clocked-in staff at the back (by clock-in time)
  //   3. Sort by turn count (fewest completed turns = closest to #1 Next)
  //      so the tech who has done less work today is always first in line.
  //      Ties are broken by the existing deque position (FIFO — whoever
  //      has been waiting longest among equally-loaded techs goes first).
  //      Exception: a short-turn-protected tech is pinned to position 0
  //      regardless of turn count (they didn't earn a full turn).
  const savedDeque: number[] = Array.isArray(settings.dequeOrder)
    ? (settings.dequeOrder as any[]).map(Number).filter(Number.isFinite)
    : [];

  const filteredDeque = savedDeque.filter((id) => clockedInToday.has(id));

  // New clock-ins get appended to the back, sorted by clock-in time
  const newlyClockedIn = [...clockedInToday]
    .filter((id) => !filteredDeque.includes(id))
    .sort((a, b) => (clockInOrder.get(a) ?? 999) - (clockInOrder.get(b) ?? 999));

  const merged = [...filteredDeque, ...newlyClockedIn];

  // Short-turn-protected tech (if any) is always pinned to position 0.
  // Everyone else is sorted by turn count ascending; ties preserve FIFO order.
  const shortTurnPinnedId: number | null =
    typeof settings.shortTurnProtectedId === "number" ? settings.shortTurnProtectedId : null;

  const syncedDeque = [...merged].sort((a, b) => {
    if (shortTurnPinnedId !== null) {
      if (a === shortTurnPinnedId) return -1;
      if (b === shortTurnPinnedId) return 1;
    }
    return (turnCountMap.get(a) ?? 0) - (turnCountMap.get(b) ?? 0);
  });

  // Persist the cleaned+sorted deque if anything changed (fire-and-forget)
  if (JSON.stringify(syncedDeque) !== JSON.stringify(savedDeque)) {
    saveTurnPreferences(storeId, { dequeOrder: syncedDeque }).catch(() => {});
  }

  // Position map: staffId → 0-based index in deque (0 = "next up")
  const dequePos = new Map<number, number>(syncedDeque.map((id, pos) => [id, pos]));

  // === ACTIVE APPOINTMENTS RIGHT NOW (used to derive "busy" status) ===
  // Scoped to today only so stale open-status appointments from previous days
  // don't permanently mark a tech as Busy.
  const activeNowRows = await db
    .select({ staffId: appointments.staffId })
    .from(appointments)
    .where(and(
      eq(appointments.storeId, storeId),
      sql`${appointments.status} IN ('started', 'checked_in')`,
      gte(appointments.date, todayStartUtc),
      sql`${appointments.date} <= ${todayEndUtc}`,
      isNotNull(appointments.staffId)
    ));
  const busyStaffIds = new Set(activeNowRows.map((r) => r.staffId as number));

  // === SELF-HEALING: Release stale consideration locks ===
  // A tech is stale-locked when they are in lockedStaffIds but have NO appointment
  // that is actively in-progress RIGHT NOW (started / checked_in today).
  // Future pending/confirmed appointments must NOT keep the lock alive — the tech
  // is free until they actually start serving that client.
  const rawLockedIds: number[] = Array.isArray(settings.lockedStaffIds)
    ? (settings.lockedStaffIds as any[]).map(Number).filter(Number.isFinite)
    : [];
  if (rawLockedIds.length > 0) {
    const inProgressRows = await db
      .select({ staffId: appointments.staffId })
      .from(appointments)
      .where(and(
        eq(appointments.storeId, storeId),
        sql`${appointments.status} IN ('started', 'checked_in')`,
        gte(appointments.date, todayStartUtc),
        sql`${appointments.date} <= ${todayEndUtc}`,
        isNotNull(appointments.staffId)
      ));
    const hasInProgress = new Set(inProgressRows.map((r) => r.staffId as number));
    const staleIds = rawLockedIds.filter((id) => !hasInProgress.has(id));
    if (staleIds.length > 0) {
      // Fire-and-forget: clear the stale lock flag in the DB.
      // Deque ordering is already correct in this response via the turn-count sort.
      (async () => {
        try {
          const freshPrefs = await getTurnPreferences(storeId);
          const currentLocked: number[] = Array.isArray(freshPrefs.lockedStaffIds)
            ? (freshPrefs.lockedStaffIds as any[]).map(Number).filter(Number.isFinite)
            : [];
          const newLocked = currentLocked.filter((id) => !staleIds.includes(id));
          if (newLocked.length < currentLocked.length) {
            await saveTurnPreferences(storeId, { lockedStaffIds: newLocked });
            console.log(`[turn] Self-heal: Released stale consideration lock(s) for staff [${staleIds.join(", ")}]`);
            broadcastTurnEligibilityChanged(storeId);
          }
        } catch (healErr) {
          console.error("[turn] Self-heal lock cleanup error:", healErr);
        }
      })();
      // Apply optimistically so this response already reflects the freed status
      settings.lockedStaffIds = rawLockedIds.filter((id) => !staleIds.includes(id));
    }
  }

  const pausedStaffIds = new Set(Array.isArray(settings.pausedStaffIds) ? settings.pausedStaffIds.map(Number) : []);

  // Consideration Lock: techs removed from the active queue while serving a client
  const lockedStaffIdSet = new Set<number>(
    Array.isArray(settings.lockedStaffIds)
      ? (settings.lockedStaffIds as any[]).map(Number).filter(Number.isFinite)
      : []
  );
  const shortTurnProtectedId: number | null =
    typeof settings.shortTurnProtectedId === "number" ? settings.shortTurnProtectedId : null;

  const technicians = storeStaff
    .filter((member) => member.status !== "removed" && member.status !== "deactivated")
    .map((member) => {
      const upcoming = upcomingByStaff.get(member.id) || null;
      const isClockedIn = clockedInToday.has(member.id);
      const paused = pausedStaffIds.has(member.id);
      const supportsService = !serviceId || serviceStaffIds.has(member.id);
      const isBusy = busyStaffIds.has(member.id) || lockedStaffIdSet.has(member.id);
      const exclusionReasons = [
        !isClockedIn ? "not_clocked_in" : null,
        paused ? "paused" : null,
        isBusy ? "currently_busy" : null,
        upcoming ? "appointment_within_exclusion_window" : null,
        !supportsService ? "service_not_supported" : null,
      ].filter(Boolean);
      const currentStatus: "available" | "busy" | "on_break" = paused
        ? "on_break"
        : (busyStaffIds.has(member.id) || lockedStaffIdSet.has(member.id))
        ? "busy"
        : "available";
      const memberDequePos = dequePos.has(member.id) ? dequePos.get(member.id)! : 999;
      return {
        id: member.id,
        name: member.name,
        color: member.color,
        avatarUrl: member.avatarUrl,
        clockedIn: isClockedIn,
        clockedOut: !isClockedIn,
        paused,
        supportsService,
        upcomingAppointment: upcoming,
        eligible: exclusionReasons.length === 0,
        exclusionReasons,
        turnPosition: memberDequePos,
        turnCount: turnCountMap.get(member.id) ?? 0,
        currentStatus,
        shortTurnProtected:
          shortTurnProtectedId !== null &&
          member.id === shortTurnProtectedId &&
          memberDequePos === 0,
      };
    })
    .sort((a, b) => Number(a.turnPosition) - Number(b.turnPosition) || Number(a.id) - Number(b.id));

  const clockedInTechs = technicians.filter((t) => t.clockedIn);
  const currentCycle =
    clockedInTechs.length > 0
      ? Math.min(...clockedInTechs.map((t) => t.turnCount)) + 1
      : 1;

  return {
    settings,
    generatedAt: now.toISOString(),
    serviceId: serviceId || null,
    technicians,
    eligibleTechnicians: technicians.filter((tech) => tech.eligible),
    currentCycle,
  };
}

async function assertTurnEligibleForWalkIn(storeId: number, staffId?: number | null, serviceId?: number | null) {
  if (!staffId) return;
  const eligibility = await getTurnEligibility(storeId, serviceId);
  const tech = eligibility.technicians.find((item) => item.id === staffId);
  if (!tech || !tech.eligible) {
    const err = new Error("This technician is not eligible for walk-in assignment because they have an upcoming appointment or fail turn eligibility rules.");
    (err as any).status = 409;
    throw err;
  }
}

// === TURN ROTATION: CHECKOUT EVALUATION GATE ===
// Called when any appointment is marked completed with a payment amount.
// Rotates ALL techs (not just walk-in-locked ones) so regular calendar
// appointments also contribute to fair turn distribution.
// Scenario A (< threshold): unshift tech to Index 0 — they keep their turn ("Short Turn Protection").
// Scenario B (>= threshold): push tech to the back — standard rotation, turn counts.
async function handleTurnCheckout(storeId: number, staffId: number, totalPaid: number, tipAmount: number = 0) {
  try {
    const settings = await getTurnPreferences(storeId);

    const lockedIds: number[] = Array.isArray(settings.lockedStaffIds)
      ? (settings.lockedStaffIds as any[]).map(Number).filter(Number.isFinite)
      : [];

    const threshold = settings.turnValueThreshold ?? 30;
    const deque: number[] = Array.isArray(settings.dequeOrder)
      ? (settings.dequeOrder as any[]).map(Number).filter(Number.isFinite)
      : [];

    // Service amount excludes tip — tips don't count toward the turn threshold.
    // A $5 tip on a $20 service should not push the ticket above the $30 minimum.
    const serviceAmount = Math.max(0, totalPaid - tipAmount);

    // Always release from consideration lock on any completed checkout.
    // Also always rotate the deque so that regular (non-walk-in) appointments
    // are counted toward fair turn distribution — prevents a tech from staying
    // at position 0 indefinitely just because their appointments weren't
    // booked through the Walk-In button.
    const newLockedIds = lockedIds.filter((id) => id !== staffId);
    // Remove tech from deque defensively before re-inserting at correct position
    const baseDeque = deque.filter((id) => id !== staffId);

    if (serviceAmount < threshold) {
      // Short turn: inject at front (Index 0) — tech keeps their place
      baseDeque.unshift(staffId);
      await saveTurnPreferences(storeId, {
        dequeOrder: baseDeque,
        lockedStaffIds: newLockedIds,
        shortTurnProtectedId: staffId,
      });
      console.log(`[turn] Short turn for staff ${staffId} (service $${serviceAmount} < $${threshold}, tip $${tipAmount}) — restored to Index 0`);
    } else {
      // Standard turn: send to back of queue
      baseDeque.push(staffId);
      const saveData: Record<string, any> = {
        dequeOrder: baseDeque,
        lockedStaffIds: newLockedIds,
      };
      if ((settings.shortTurnProtectedId as any) === staffId) {
        saveData.shortTurnProtectedId = null;
      }
      await saveTurnPreferences(storeId, saveData);
      console.log(`[turn] Standard turn for staff ${staffId} (service $${serviceAmount} >= $${threshold}, tip $${tipAmount}) — sent to back`);
    }

    broadcastTurnEligibilityChanged(storeId);
  } catch (err) {
    console.error("[turn] handleTurnCheckout error:", err);
  }
}

function broadcastTurnEligibilityChanged(storeId: number | null | undefined) {
  if (!storeId) return;
  broadcastNotification({ type: "turn_eligibility_changed", storeId });
}

/**
 * Fire-and-forget: syncs Certxa services to GBP only when auto-mode is enabled.
 * Never throws — failures are persisted to google_service_sync_settings so the
 * UI can surface them, and also logged to console.
 */
/**
 * Fire-and-forget: push updated business hours + booking URL to Google.
 * Silently no-ops when GBP is not connected or lacks a booking slug.
 * Failures are written to google_business_sync_logs so the UI can surface them.
 */
async function triggerGBPHoursSync(storeId: number): Promise<void> {
  try {
    // Pre-check: GBP must be connected with a location resource name
    const gbpRows = await db
      .select({ locationResourceName: googleBusinessProfiles.locationResourceName })
      .from(googleBusinessProfiles)
      .where(eq(googleBusinessProfiles.storeId, storeId))
      .limit(1);
    if (!gbpRows.length || !gbpRows[0].locationResourceName) return;

    // Run async — persist failures to the sync log so the UI can surface them
    syncListingToGoogle(storeId).catch(async (e: any) => {
      const errMsg: string = (e?.message ?? String(e)).slice(0, 500);
      console.warn(`[GBP Hours Sync] auto-sync error for storeId=${storeId}:`, errMsg);
      await db.insert(googleBusinessSyncLogs).values({
        storeId,
        syncType:     "listing",
        status:       "failed",
        errorMessage: errMsg,
      }).catch((dbErr) =>
        console.warn(`[GBP Hours Sync] could not write sync log for storeId=${storeId}:`, dbErr),
      );
    });
  } catch (e) {
    console.warn(`[GBP Hours Sync] triggerGBPHoursSync pre-check failed for storeId=${storeId}:`, e);
  }
}

async function triggerGBPServiceSync(storeId: number): Promise<void> {
  try {
    const rows = await db
      .select({ syncEnabled: googleServiceSyncSettings.syncEnabled, syncMode: googleServiceSyncSettings.syncMode })
      .from(googleServiceSyncSettings)
      .where(eq(googleServiceSyncSettings.storeId, storeId))
      .limit(1);
    if (!rows.length) return;
    const { syncEnabled, syncMode } = rows[0];
    if (!syncEnabled || syncMode !== "auto") return;
    // Check GBP is connected
    const gbpRows = await db
      .select({ locationResourceName: googleBusinessProfiles.locationResourceName })
      .from(googleBusinessProfiles)
      .where(eq(googleBusinessProfiles.storeId, storeId))
      .limit(1);
    if (!gbpRows.length || !gbpRows[0].locationResourceName) return;

    // Run async — persist failure so the UI can surface it
    syncServicesToGoogle(storeId).catch(async (e: any) => {
      const errMsg: string = (e?.message ?? String(e)).slice(0, 500);
      console.warn(`[GBP Service Sync] auto-sync error for storeId=${storeId}:`, errMsg);
      const now = new Date();
      await db
        .insert(googleServiceSyncSettings)
        .values({
          storeId,
          syncEnabled: true,
          syncMode:    "auto",
          lastSyncedAt:   now,
          lastSyncStatus: "failed",
          lastSyncError:  errMsg,
          updatedAt:      now,
        })
        .onConflictDoUpdate({
          target: googleServiceSyncSettings.storeId,
          set: {
            lastSyncedAt:   now,
            lastSyncStatus: "failed",
            lastSyncError:  errMsg,
            updatedAt:      now,
          },
        })
        .catch((dbErr) =>
          console.warn(`[GBP Service Sync] could not persist failure for storeId=${storeId}:`, dbErr),
        );
    });
  } catch (e) {
    console.warn(`[GBP Service Sync] triggerGBPServiceSync pre-check failed for storeId=${storeId}:`, e);
  }
}

/**
 * Fire-and-forget: enqueues a GBP post candidate for the given event.
 * Silently no-ops when GBP is not connected, auto-posting is disabled, or a
 * duplicate post for the same entity is already in the queue.
 * Imported lazily to avoid circular-module issues.
 */
// ─── GBP Photo Engine hook helper (Phase 3.2) ─────────────────────────────────
function triggerGBPPhotoEvent(
  storeId: number,
  eventType: "service_image" | "staff_avatar",
  data: { imageUrl: string; r2Key?: string; serviceId?: number; staffId?: number; entityName?: string },
): void {
  import("./services/gbpPhotoEngine")
    .then(({ detectAndEnqueuePhoto }) =>
      detectAndEnqueuePhoto(storeId, eventType, data),
    )
    .catch((e) =>
      console.warn(`[GBP Photos] triggerGBPPhotoEvent error storeId=${storeId} event=${eventType}:`, e),
    );
}

function triggerGBPPostEvent(
  storeId: number,
  eventType: "service_created" | "service_updated" | "staff_added" | "gift_cards_enabled" | "announcement",
  data: {
    entityId: number | string;
    entityName?: string;
    entityPrice?: string;
    entityDuration?: number;
    entityRole?: string;
  },
): void {
  import("./services/gbpPostEngine")
    .then(({ detectAndEnqueuePost }) =>
      detectAndEnqueuePost(storeId, eventType, data),
    )
    .catch((e) =>
      console.warn(`[GBP Posts] triggerGBPPostEvent error storeId=${storeId} event=${eventType}:`, e),
    );
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ─── Support Back Office Routes ─────────────────────────────────────────────
  app.use(supportRouter);

  setupNotificationServer(httpServer);
  setupSupportAgentRoutes(httpServer, app);
  setupAiReceptionistRoutes(httpServer, app);
  app.use(validateRouter);
  app.use(onboardingRouter);
  app.use(usageRouter);
  // Note: setupAuth(app) is called in server/index.ts before registerRoutes.
  // Auth routes (register, login, logout, user) are registered there via auth.ts.

  // Build/version info — lets you verify which build is actually deployed.
  // Hit GET /api/version on the live site to see commit SHA + build/start time.
  const SERVER_START_TIME = new Date().toISOString();
  let detectedCommit = "unknown";
  try {
    const { execSync } = await import("child_process");
    detectedCommit = execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    // not a git checkout — fall back to env vars
  }
  const BUILD_COMMIT =
    process.env.GIT_COMMIT ||
    process.env.SOURCE_COMMIT ||
    process.env.COMMIT_SHA ||
    detectedCommit;
  const BUILD_TIME = process.env.BUILD_TIME || "unknown";
  app.get("/api/version", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      commit: BUILD_COMMIT,
      buildTime: BUILD_TIME,
      serverStartTime: SERVER_START_TIME,
      nodeEnv: process.env.NODE_ENV ?? "development",
    });
  });

  // Append client-side errors to a log file for easy access. Frontend
  // ErrorBoundary POSTs here when it catches a render error.
  app.post("/api/client-errors", express.json({ limit: "256kb" }), async (req, res) => {
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const logsDir = path.resolve(process.cwd(), "logs");
      await fs.mkdir(logsDir, { recursive: true });
      const file = path.join(logsDir, "client-errors.log");

      const body = req.body || {};
      const entry = {
        timestamp: new Date().toISOString(),
        url: String(body.url ?? ""),
        userAgent: req.headers["user-agent"] ?? "",
        ip: req.ip,
        message: String(body.message ?? ""),
        stack: String(body.stack ?? ""),
        componentStack: String(body.componentStack ?? ""),
      };

      const line =
        `\n=== ${entry.timestamp} ===\n` +
        `URL: ${entry.url}\n` +
        `UA:  ${entry.userAgent}\n` +
        `IP:  ${entry.ip}\n` +
        `Message: ${entry.message}\n` +
        `Stack:\n${entry.stack}\n` +
        `Component stack:${entry.componentStack}\n`;

      await fs.appendFile(file, line, "utf8");
      console.error("[client-error]", entry.message, "@", entry.url);
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[client-error] failed to log:", err?.message || err);
      return res.status(500).json({ ok: false });
    }
  });

  // R2 media proxy (used when R2_PUBLIC_URL is not configured / bucket endpoint is private)
  // Streams objects by key while preserving content type and range requests.
  app.get(/^\/api\/r2\/(.+)$/, async (req, res) => {
    let key = "";
    try {
      const rawKey = (req.params as any)[0] ?? "";
      key = String(rawKey).replace(/^\/+/, "");
      res.setHeader("X-R2-Key", key || "");
      if (!key) return res.status(400).json({ message: "Missing object key" });

      const rangeHeader = typeof req.headers.range === "string" ? req.headers.range : undefined;
      const obj = await getObjectFromR2(key, rangeHeader);

      if (obj.ContentType) res.setHeader("Content-Type", obj.ContentType);
      if (obj.ContentLength != null) res.setHeader("Content-Length", String(obj.ContentLength));
      if (obj.ETag) res.setHeader("ETag", obj.ETag);
      if (obj.LastModified) res.setHeader("Last-Modified", obj.LastModified.toUTCString());
      if (obj.AcceptRanges) res.setHeader("Accept-Ranges", obj.AcceptRanges);
      if (obj.ContentRange) res.setHeader("Content-Range", obj.ContentRange);
      res.setHeader("Cache-Control", "public, max-age=31536000");

      // CORS for image/video embedding from same or other origins.
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

      if (rangeHeader && obj.ContentRange) {
        res.status(206);
      }

      const body: any = obj.Body as any;
      if (body && typeof body.pipe === "function") {
        return body.pipe(res);
      }
      if (body && typeof body.transformToByteArray === "function") {
        const bytes = await body.transformToByteArray();
        return res.end(Buffer.from(bytes));
      }

      return res.status(404).json({ message: "Object body not available" });
    } catch (err: any) {
      const status = err?.$metadata?.httpStatusCode;
      console.error("[r2/proxy] lookup failed", {
        key,
        status,
        name: err?.name,
        message: err?.message,
      });
      if (status === 404 || err?.name === "NoSuchKey") {
        return res.status(404).json({ message: "R2 proxy not found" });
      }
      console.error("[r2/proxy] GET error:", err);
      return res.status(502).json({ message: "Failed to fetch media" });
    }
  });

  // One-time admin repair: convert non-public cloudflarestorage avatar URLs
  // into local proxy URLs so frontend can load them without exposing R2 endpoint.
  app.post("/api/admin/fix-r2-avatar-urls", isAuthenticated, async (req, res) => {
    try {
      const appUrl = String(process.env.APP_URL || "").replace(/\/+$/, "");
      if (!appUrl) {
        return res.status(400).json({ message: "APP_URL not configured" });
      }

      const rows = await db
        .select({ id: staff.id, avatarUrl: staff.avatarUrl, avatarThumbUrl: (staff as any).avatarThumbUrl })
        .from(staff)
        .where(
          or(
            like(staff.avatarUrl, "https://%.r2.cloudflarestorage.com/%"),
            like((staff as any).avatarThumbUrl, "https://%.r2.cloudflarestorage.com/%")
          )
        );

      let updated = 0;
      for (const row of rows) {
        const next: Record<string, string> = {};

        const avatarKey = row.avatarUrl ? extractR2KeyFromUrl(row.avatarUrl) : null;
        if (avatarKey) next.avatarUrl = `${appUrl}/api/r2/${avatarKey}`;

        const thumbKey = row.avatarThumbUrl ? extractR2KeyFromUrl(String(row.avatarThumbUrl)) : null;
        if (thumbKey) next.avatarThumbUrl = `${appUrl}/api/r2/${thumbKey}`;

        if (Object.keys(next).length > 0) {
          await db.update(staff).set(next as any).where(eq(staff.id, row.id));
          updated++;
        }
      }

      return res.json({ updated, examined: rows.length });
    } catch (err) {
      console.error("fix-r2-avatar-urls error:", err);
      return res.status(500).json({ message: "Failed to fix R2 avatar URLs" });
    }
  });

  // Public config — exposes safe frontend settings from env vars
  app.get("/api/config", (_req, res) => {
    const raw = parseInt(process.env.ACTIVE_GROUPS ?? "3", 10);
    const activeGroups = isNaN(raw) || raw < 1 ? 3 : Math.min(raw, 3);
    return res.json({ activeGroups });
  });

  // Diagnostic — reports the resolved session/auth context. Requires a valid session.
  app.get("/api/debug/whoami", isAuthenticated, async (req, res) => {
    const session: any = req.session || {};
    const sessionUserId = session.userId ?? null;
    const sessionStaffId = session.staffId ?? null;

    let user: any = null;
    let staffRow: any = null;
    let dbError: string | null = null;

    try {
      if (sessionUserId) {
        const [u] = await db.select().from(users).where(eq(users.id, sessionUserId));
        if (u) {
          user = {
            id: u.id,
            email: (u as any).email ?? null,
            role: (u as any).role ?? null,
            staffId: (u as any).staffId ?? null,
          };
        }
      }
      if (sessionStaffId) {
        const [s] = await db.select().from(staff).where(eq(staff.id, sessionStaffId));
        if (s) {
          staffRow = {
            id: s.id,
            name: (s as any).name ?? null,
            email: (s as any).email ?? null,
            role: (s as any).role ?? null,
            storeId: (s as any).storeId ?? null,
          };
        }
      }
    } catch (err: any) {
      dbError = err?.message || String(err);
    }

    res.setHeader("Cache-Control", "no-store");
    return res.json({
      now: new Date().toISOString(),
      hostHeader: req.headers.host ?? null,
      forwardedHost: req.headers["x-forwarded-host"] ?? null,
      forwardedProto: req.headers["x-forwarded-proto"] ?? null,
      cookieHeaderPresent: !!req.headers.cookie,
      sessionId: (req as any).sessionID ?? null,
      session: {
        userId: sessionUserId,
        staffId: sessionStaffId,
        keys: Object.keys(session).filter((k) => k !== "cookie"),
      },
      reqAuth: req.auth
        ? {
            userId: req.auth.userId ?? null,
            staffId: req.auth.staffId ?? null,
            role: req.auth.role,
            permissionsCount: req.auth.permissions?.size ?? 0,
          }
        : null,
      user,
      staff: staffRow,
      subdomainStore: req.store
        ? { id: (req.store as any).id, slug: (req.store as any).bookingSlug }
        : null,
      dbError,
    });
  });

  // ── Timezone debug endpoint ───────────────────────────────────────────────
  // GET /api/debug/timezone  — diagnose timezone issues for the current session.
  // Returns server UTC, the session salon's configured timezone, and the
  // converted local time so you can verify the full stack in one call.
  app.get("/api/debug/timezone", isAuthenticated, async (req, res) => {
    const serverTimeUTC = new Date().toISOString();
    const serverTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Resolve the salon for this session
    let salonTimezone: string | null = null;
    let salonName: string | null = null;
    let convertedLocalTime: string | null = null;
    let timestampSource = "none";
    let warning: string | null = null;

    try {
      const storeId = await resolveSessionStoreId(req);
      if (storeId) {
        const [loc] = await db
          .select({ timezone: locations.timezone, name: locations.name })
          .from(locations)
          .where(eq(locations.id, storeId))
          .limit(1);

        if (loc) {
          salonTimezone = loc.timezone ?? null;
          salonName = (loc as any).name ?? null;
          timestampSource = `locations.id=${storeId}`;

          if (!salonTimezone) {
            warning = `Store ${storeId} has no timezone configured — falling back to UTC.`;
            console.warn(`[timezone-debug] ${warning}`);
            salonTimezone = "UTC";
          }

          convertedLocalTime = formatInTimeZone(new Date(), salonTimezone, "yyyy-MM-dd HH:mm:ss zzz");
        }
      }
    } catch (err: any) {
      warning = `Could not resolve salon timezone: ${err?.message ?? err}`;
      console.warn("[timezone-debug]", warning);
    }

    res.setHeader("Cache-Control", "no-store");
    return res.json({
      serverTimeUTC,
      serverTimezone,
      salonName,
      salonTimezone,
      convertedLocalTime,
      timestampSource,
      warning,
      // Sanity check: Denver midnight test
      denverExample: {
        utcInput: "2026-07-27T06:17:00Z",
        expected_denver: "2026-07-27 00:17:00 MDT",
        actual_denver: formatInTimeZone(new Date("2026-07-27T06:17:00Z"), "America/Denver", "yyyy-MM-dd HH:mm:ss zzz"),
      },
    });
  });

  app.get("/api/trial/status", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    
    try {
      const trialStatus = await TrialService.getTrialStatus(userId);
      return res.json(trialStatus);
    } catch (error) {
      console.error("Error fetching trial status:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── DB Schema Health Check ───────────────────────────────────────────────────
  // GET /api/admin/db-health
  // Auth: Bearer <ADMIN_DB_HEALTH_KEY> env var  OR  authenticated platform admin session.
  // Returns 200 when schema matches; 409 when drift is detected; 503 when DB is unreachable.
  app.get("/api/admin/db-health", async (req, res) => {
    // Auth: bearer token takes precedence so CI/monitoring tools can call without a session.
    const adminKey = process.env.ADMIN_DB_HEALTH_KEY;
    let authorised = false;
    if (adminKey) {
      const bearer = (req.headers.authorization ?? "").trim();
      if (bearer === `Bearer ${adminKey}`) authorised = true;
    }
    if (!authorised) {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Admin access required" });
      try {
        const [u] = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId)).limit(1);
        if (!u?.isAdmin) return res.status(403).json({ message: "Forbidden — platform admin access required" });
        authorised = true;
      } catch {
        return res.status(500).json({ message: "Auth check failed" });
      }
    }
    if (!authorised) return res.status(401).json({ message: "Admin access required" });

    const started = Date.now();

    // 1. Ping DB
    try {
      await pool.query("SELECT 1");
    } catch (err: any) {
      return res.status(503).json({ status: "error", db: { ok: false, error: err?.message } });
    }

    // 2. Fetch live schema from information_schema
    const liveResult = await pool.query<{ tableName: string; columnName: string }>(`
      SELECT table_name AS "tableName", column_name AS "columnName"
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);

    const liveMap = new Map<string, Set<string>>();
    for (const row of liveResult.rows) {
      if (!liveMap.has(row.tableName)) liveMap.set(row.tableName, new Set());
      liveMap.get(row.tableName)!.add(row.columnName);
    }
    const liveTables = new Set(liveMap.keys());

    // 3. Build expected schema by introspecting every Drizzle table object exported from @shared/schema.
    //    Drizzle stores metadata on runtime Symbols — NOT on `._ `.
    const NAME_SYM    = Symbol.for("drizzle:Name");
    const COLS_SYM    = Symbol.for("drizzle:Columns");
    const IS_TBL_SYM  = Symbol.for("drizzle:IsDrizzleTable");
    const schemaModule = await import("@shared/schema");
    const expected: Array<{ tableName: string; columns: string[] }> = [];
    for (const value of Object.values(schemaModule)) {
      const tbl = value as any;
      if (!tbl || typeof tbl !== "object") continue;
      if (!tbl[IS_TBL_SYM]) continue;
      const tableName: string = tbl[NAME_SYM];
      const rawCols: Record<string, any> = tbl[COLS_SYM] ?? {};
      const columns: string[] = Object.values(rawCols).map((c: any) => c.name as string);
      if (tableName && columns.length > 0) expected.push({ tableName, columns });
    }
    const expectedNames = new Set(expected.map((t) => t.tableName));

    // 4. Diff
    const missingTables: string[] = [];
    const extraTables: string[] = [...liveTables].filter((t) => !expectedNames.has(t));
    const tableDrifts: Array<{ table: string; missingColumns: string[]; extraColumns: string[] }> = [];

    for (const spec of expected) {
      if (!liveTables.has(spec.tableName)) { missingTables.push(spec.tableName); continue; }
      const live = liveMap.get(spec.tableName)!;
      const missing = spec.columns.filter((c) => !live.has(c));
      const extra = [...live].filter((c) => !spec.columns.includes(c));
      if (missing.length > 0 || extra.length > 0) tableDrifts.push({ table: spec.tableName, missingColumns: missing, extraColumns: extra });
    }

    const healthy = missingTables.length === 0 && tableDrifts.filter((d) => d.missingColumns.length > 0).length === 0;
    return res.status(healthy ? 200 : 409).json({
      status: healthy ? "ok" : "drift_detected",
      timestamp: new Date().toISOString(),
      elapsed_ms: Date.now() - started,
      summary: {
        expected_tables: expected.length,
        live_tables: liveTables.size,
        missing_tables: missingTables.length,
        tables_with_drift: tableDrifts.length,
        extra_tables_in_db: extraTables.length,
      },
      missing_tables: missingTables,
      table_drifts: tableDrifts,
      extra_tables_in_db: extraTables,
    });
  });

  app.use("/api", async (req, res, next) => {
    // Allow public routes
    if (req.path.startsWith("/auth/")) return next();
    if (req.path.startsWith("/store/by-subdomain")) return next(); // Allow public access to subdomain store
    if (req.path.startsWith("/public/")) return next(); // Allow public routes
    if (req.path.startsWith("/contractor-payouts/public/")) return next(); // Contractor onboarding — public token-gated routes

    // Admin routes — require a valid user session AND platform-admin role,
    // OR a valid ADMIN_DB_HEALTH_KEY bearer token (for monitoring / CI).
    if (req.path.startsWith("/admin/")) {
      const adminKey = process.env.ADMIN_DB_HEALTH_KEY;
      if (adminKey) {
        const bearer = req.headers.authorization ?? "";
        if (bearer === `Bearer ${adminKey}`) return next();
      }
      const adminUserId = (req.session as any)?.userId;
      if (!adminUserId) return res.status(401).json({ message: "Admin access required" });
      try {
        const [u] = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, adminUserId)).limit(1);
        if (!u?.isAdmin) return res.status(403).json({ message: "Forbidden — platform admin access required" });
        return next();
      } catch {
        return res.status(500).json({ message: "Auth check failed" });
      }
    }
    if (req.path.startsWith("/seo-regions")) return next(); // SEO regions admin — public
    if (req.path.startsWith("/appointments/confirmation/")) return next(); // Public booking confirmation lookup & cancel
    if (req.path.endsWith("/respond")) return next(); // Public intake form submission
    if (req.path.startsWith("/reviews/form/")) return next(); // Public review form lookup
    if (req.path === "/reviews/submit") return next(); // Public review submission
    if (req.path === "/reviews/upload-photo") return next(); // Public review photo upload
    if (req.path.startsWith("/chatbot/")) return next(); // Chatbot API — uses own X-Chatbot-Key auth
    if (req.path.startsWith("/dialer/")) return next();  // Twilio dialer — uses own X-Dialer-Key auth + Twilio webhooks
    if (req.path.startsWith("/webhook/twilio")) return next(); // Twilio AI Receptionist — X-Twilio-Signature auth

    if (req.path === "/sync/heartbeat") return next(); // Public connectivity probe
    if (req.path.startsWith("/autumn/")) return next(); // Autumn demo — public endpoints
    if (req.path === "/unsubscribe") return next(); // One-click email unsubscribe — signed token, no session

    // ── Live chat — visitor routes are fully public; support routes use requireSupportAuth internally ──
    if (req.path.startsWith("/live-chat/") || req.path === "/live-chat") return next();
    if (req.path.startsWith("/support/live-chat/") || req.path === "/support/live-chat") return next();
    // Staff OTP auth — unauthenticated staff need to call these
    if (req.path === "/auth/staff-otp-login") return next();
    if (req.path === "/auth/staff-request-otp") return next();
    if (req.path.startsWith("/webhooks/twilio/")) return next(); // Twilio SMS webhook — uses own Twilio auth
    if (req.path.startsWith("/webhooks/textbelt/")) return next(); // Textbelt SMS webhook — signature-verified
    if (req.path === "/contact") return next(); // Public contact form — no session required

    // ── Platform lifecycle email — public endpoints (signed tokens, no session) ─
    if (req.path.startsWith("/platform-emails/unsubscribe")) return next();
    if (req.path.startsWith("/platform-emails/track/")) return next();
    if (req.path === "/webhooks/mailgun/platform-email") return next();

    // ── Blog — public read endpoints (no session required) ───────────────────
    if (req.path === "/blog/posts" || req.path.startsWith("/blog/posts/")) return next();

    // ── Website Builder — no session required (uses its own storeid scope) ────
    if (req.path.startsWith("/websites")) return next();
    if (req.path.startsWith("/subdomains")) return next();
    if (req.path.startsWith("/templates")) return next();
    if (req.path.startsWith("/tenant")) return next();
    if (req.path.startsWith("/domain-site")) return next();

    // Require authentication for other endpoints
    const userId = (req.session as any)?.userId;
    const staffId = (req.session as any)?.staffId;
    if (!userId && !staffId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  });

  // Resolve role + permissions for every authenticated /api request.
  // Skips silently for public routes (no session → req.auth left undefined).
  app.use("/api", attachAuthContext);

  // ── Server-side account suspension enforcement ────────────────────────────
  // Blocks API calls from suspended or locked accounts at the server layer.
  // The frontend AccountStatusGate catches normal UI flows, but this ensures
  // a suspended salon cannot reach data endpoints by bypassing the UI.
  //
  // Exempted path prefixes (always allowed through):
  //   /api/auth          — login, logout, session, register
  //   /api/billing       — needed to pay/reactivate
  //   /api/admin         — platform admin
  //   /api/public        — public booking/widget
  //   /api/book          — public booking flows
  //   /api/stores/by-slug — store lookup for public booking
  //   /api/kiosk         — public kiosk check-in
  //   /api/webhooks      — incoming Stripe/Twilio webhooks
  //   /api/health        — healthcheck
  //   /api/google-auth   — OAuth callbacks
  //   /api/chatbot       — AI receptionist (public)
  //   /api/support       — back-office support team
  //   /api/live-chat     — live chat (public widget)
  app.use("/api", async (req, res, next) => {
    // Only owner sessions are store-scoped; staff sessions handled below.
    const userId: string | undefined = (req.session as any)?.userId;
    const staffId: number | undefined = (req.session as any)?.staffId;
    if (!userId && !staffId) return next(); // unauthenticated / public

    const EXEMPT_PREFIXES = [
      "/api/auth",
      "/api/billing",
      "/api/admin",
      "/api/public",
      "/api/book",
      "/api/stores/by-slug",
      "/api/kiosk",
      "/api/webhooks",
      "/api/health",
      "/api/google-auth",
      "/api/chatbot",
      "/api/support",
      "/api/live-chat",
    ];
    // req.path inside app.use("/api", ...) has the "/api" prefix stripped, so
    // we must use req.originalUrl (which preserves the full path) to correctly
    // match the EXEMPT_PREFIXES that include the "/api/" segment.
    if (EXEMPT_PREFIXES.some((prefix) => req.originalUrl.startsWith(prefix))) return next();

    try {
      let storeId: number | null = null;

      // Endpoints that are blocked for suspended accounts.
      // Covers the full calendar section (appointments, availability, staff schedules,
      // business hours, walk-in queue) so no calendar data is reachable via direct
      // API calls even if the frontend gate is bypassed.
      // Everything else passes through so users can still log in, access settings,
      // clients, and export their records while suspended.
      const SUSPENDED_BLOCKED_PREFIXES = [
        // Calendar & appointments
        "/api/calendar",
        "/api/appointments",
        // Availability / slot queries
        "/api/availability",
        // Staff availability management
        "/api/store-staff-availability",
        "/api/staff-availability",
        // Business hours
        "/api/business-hours",
        // Walk-in queue & turn management
        "/api/turn",
      ];
      const isSuspendedBlocked = SUSPENDED_BLOCKED_PREFIXES.some((p) => req.originalUrl.startsWith(p));

      if (userId) {
        // Resolve the store for this owner session (cheapest: grab first store).
        const r = await pool.query<{ id: number; account_status: string | null }>(
          `SELECT id, account_status FROM locations WHERE user_id = $1 ORDER BY id LIMIT 1`,
          [userId]
        );
        if (r.rows.length > 0) {
          const status = (r.rows[0].account_status ?? "Active").toLowerCase();
          if (status === "locked") {
            // Full lockout — only auth and billing endpoints pass through.
            res.status(402).json({
              message: "Your account is locked. Please contact support.",
              accountStatus: "locked",
            });
            return;
          }
          if (status === "suspended" && isSuspendedBlocked) {
            // Light suspension — only calendar and appointment endpoints are blocked.
            // Users can still access the rest of the app (settings, exports, billing).
            res.status(402).json({
              message: "Calendar access is suspended. Please visit the Billing page to reactivate your account.",
              accountStatus: "suspended",
            });
            return;
          }
        }
      } else if (staffId) {
        // Staff session: check their store's status.
        const r = await pool.query<{ account_status: string | null }>(
          `SELECT l.account_status FROM staff s JOIN locations l ON l.id = s.store_id WHERE s.id = $1 LIMIT 1`,
          [staffId]
        );
        if (r.rows.length > 0) {
          const status = (r.rows[0].account_status ?? "Active").toLowerCase();
          if (status === "locked") {
            res.status(402).json({
              message: "This salon's account is currently inactive.",
              accountStatus: "locked",
            });
            return;
          }
          if (status === "suspended" && isSuspendedBlocked) {
            res.status(402).json({
              message: "Calendar access is suspended. Please contact the account owner.",
              accountStatus: "suspended",
            });
            return;
          }
        }
      }
    } catch {
      // On unexpected DB error, allow through — never block on a check failure.
    }

    next();
  });

  // === STORES ===
  app.get(api.stores.list.path, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const staffId = (req.session as any)?.staffId;

      if (userId) {
        const stores = await storage.getStores(userId);
        // If the userId session belongs to a staff member (who owns no stores),
        // fall through to the staffId branch so the calendar resolves correctly.
        if (stores.length > 0) return res.json(stores);
      }

      if (staffId) {
        // Staff session: return only the store they belong to
        const result = await pool.query<{ store_id: number }>(
          `SELECT store_id FROM staff WHERE id = $1 LIMIT 1`,
          [staffId]
        );
        const storeId = result.rows[0]?.store_id;
        if (!storeId) return res.json([]);
        const store = await storage.getStore(storeId);
        return res.json(store ? [store] : []);
      }

      return res.json([]);
    } catch (err: any) {
      console.error("[stores] list failed:", err.message, err.stack);
      return res.status(500).json({ message: "Failed to load stores", detail: err.message });
    }
  });

  app.get(api.stores.get.path, async (req, res) => {
    const store = await storage.getStore(Number(req.params.id));
    if (!store) return res.status(404).json({ message: "Store not found" });
    return res.json(store);
  });

  // === ADMIN STORES ===
  app.get("/api/admin/stores", async (req, res) => {
    try {
      const _adminId = (req.session as any)?.userId;
      if (!_adminId) return res.status(401).json({ error: "Unauthorized" });
      const [_adminCheck] = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, _adminId)).limit(1);
      if (!_adminCheck?.isAdmin) return res.status(403).json({ error: "Admin access required" });

      // Get all stores with account status
      const allStores = await db.select({
        id: locations.id,
        name: locations.name,
        userId: locations.userId,
        bookingSlug: locations.bookingSlug,
        category: locations.category,
        email: locations.email,
        timezone: locations.timezone,
        address: locations.address,
        phone: locations.phone,
        city: locations.city,
        state: locations.state,
        postcode: locations.postcode,
        commissionPayoutFrequency: locations.commissionPayoutFrequency,
        accountStatus: locations.accountStatus,
      }).from(locations).orderBy(locations.name);
      
      // Transform the data to match the expected interface
      const transformedStores = allStores.map(store => ({
        id: store.id,
        name: store.name,
        user_id: store.userId,
        booking_slug: store.bookingSlug,
        category: store.category,
        email: store.email,
        timezone: store.timezone,
        address: store.address,
        phone: store.phone,
        city: store.city,
        state: store.state,
        postcode: store.postcode,
        commission_payout_frequency: store.commissionPayoutFrequency,
        // Use account status from locations table
        subscription: 'Basic', // Default subscription for now
        accountStatus: store.accountStatus || 'Active',
      }));
      
      return res.json(transformedStores);
    } catch (error) {
      console.error("Error fetching admin stores:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET store analytics for admin
  app.get("/api/admin/stores/:storeNumber/analytics", async (req, res) => {
    try {
      const { storeNumber } = req.params;
      
      // GET appointments for this store
      const appointmentsData = await db.select({
        id: appointments.id,
        date: appointments.date,
        totalPaid: appointments.totalPaid,
        status: appointments.status,
      }).from(appointments)
        .where(eq(appointments.storeId, parseInt(storeNumber)));

      // Get staff for this store
      const staffData = await db.select({
        id: staff.id,
      }).from(staff)
        .where(eq(staff.storeId, parseInt(storeNumber)));

      // Get clients for this store
      const customersData = await db.select({
        id: clients.id,
      }).from(clients)
        .where(and(eq(clients.storeId, parseInt(storeNumber)), isNull(clients.archivedAt)));

      // Calculate metrics
      const totalAppointments = appointmentsData.length;
      const activeStaffCount = staffData.length;
      const totalCustomers = customersData.length;
      
      // Calculate monthly revenue from completed appointments
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      const monthlyAppointments = appointmentsData.filter(apt => {
        const aptDate = new Date(apt.date);
        return aptDate.getMonth() === currentMonth && aptDate.getFullYear() === currentYear && apt.status === 'completed';
      });
      
      const monthlyRevenue = monthlyAppointments.reduce((sum, apt) => {
        return sum + Number(apt.totalPaid || 0);
      }, 0);

      // Get last activity
      const lastActivity = appointmentsData.length > 0
        ? appointmentsData.reduce((latest, apt) =>
            new Date(apt.date) > new Date(latest.date) ? apt : latest
          ).date
        : new Date();

      return res.json({
        totalAppointments,
        activeStaffCount,
        totalCustomers,
        monthlyRevenue,
        averageRating: 0, // Would need reviews table
        lastActivity
      });
    } catch (error) {
      console.error("Error fetching store analytics:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET staff for admin store
  app.get("/api/admin/stores/:storeNumber/staff", async (req, res) => {
    try {
      const { storeNumber } = req.params;
      
      const staffData = await db.select({
        id: staff.id,
        name: staff.name,
        email: staff.email,
        phone: staff.phone,
        role: staff.role,
        commissionEnabled: staff.commissionEnabled,
        storeId: staff.storeId,
      }).from(staff)
        .where(eq(staff.storeId, parseInt(storeNumber)));

      return res.json(staffData);
    } catch (error) {
      console.error("Error fetching staff:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET calendar settings for admin store
  app.get("/api/admin/stores/:storeNumber/calendar-settings", async (req, res) => {
    try {
      const { storeNumber } = req.params;
      
      const calendarSettingsData = await db.select({
        id: calendarSettings.id,
        startOfWeek: calendarSettings.startOfWeek,
        timeSlotInterval: calendarSettings.timeSlotInterval,
        nonWorkingHoursDisplay: calendarSettings.nonWorkingHoursDisplay,
        allowBookingOutsideHours: calendarSettings.allowBookingOutsideHours,
        autoCompleteAppointments: calendarSettings.autoCompleteAppointments,
        autoMarkNoShows: calendarSettings.autoMarkNoShows,
        showPrices: calendarSettings.showPrices,
        language: calendarSettings.language,
      }).from(calendarSettings)
        .where(eq(calendarSettings.storeId, parseInt(storeNumber)))
        .limit(1);

      return res.json(calendarSettingsData[0] || null);
    } catch (error) {
      console.error("Error fetching calendar settings:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET SMS settings for admin store
  app.get("/api/admin/stores/:storeNumber/sms-settings", async (req, res) => {
    try {
      const { storeNumber } = req.params;
      
      const smsSettingsData = await db.select({
        id: smsSettings.id,
        bookingConfirmationEnabled: smsSettings.bookingConfirmationEnabled,
        reminderEnabled: smsSettings.reminderEnabled,
        reminderHoursBefore: smsSettings.reminderHoursBefore,
        reviewRequestEnabled: smsSettings.reviewRequestEnabled,
        twilioPhoneNumber: smsSettings.twilioPhoneNumber,
      }).from(smsSettings)
        .where(eq(smsSettings.storeId, parseInt(storeNumber)))
        .limit(1);

      return res.json(smsSettingsData[0] || null);
    } catch (error) {
      console.error("Error fetching SMS settings:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET email settings for admin store
  app.get("/api/admin/stores/:storeNumber/email-settings", async (req, res) => {
    try {
      const { storeNumber } = req.params;
      
      const emailSettingsData = await db.select({
        id: mailSettings.id,
        bookingConfirmationEnabled: mailSettings.bookingConfirmationEnabled,
        reminderEnabled: mailSettings.reminderEnabled,
        reviewRequestEnabled: mailSettings.reviewRequestEnabled,
        mailgunApiKey: mailSettings.mailgunApiKey,
        mailgunDomain: mailSettings.mailgunDomain,
      }).from(mailSettings)
        .where(eq(mailSettings.storeId, parseInt(storeNumber)))
        .limit(1);

      return res.json(emailSettingsData[0] || null);
    } catch (error) {
      console.error("Error fetching email settings:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET services for admin store
  app.get("/api/admin/stores/:storeNumber/services", async (req, res) => {
    try {
      const { storeNumber } = req.params;
      
      const servicesData = await db.select({
        id: services.id,
        name: services.name,
        description: services.description,
        price: services.price,
        duration: services.duration,
        categoryId: services.categoryId,
      }).from(services)
        .where(eq(services.storeId, parseInt(storeNumber)));

      return res.json(servicesData);
    } catch (error) {
      console.error("Error fetching services:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET service categories for admin store
  app.get("/api/admin/stores/:storeNumber/service-categories", async (req, res) => {
    try {
      const { storeNumber } = req.params;
      
      const categoriesData = await db.select({
        id: serviceCategories.id,
        name: serviceCategories.name,
        imageUrl: serviceCategories.imageUrl,
        sortOrder: serviceCategories.sortOrder,
      }).from(serviceCategories)
        .where(eq(serviceCategories.storeId, parseInt(storeNumber)));

      return res.json(categoriesData);
    } catch (error) {
      console.error("Error fetching service categories:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // PATCH single store by ID for admin (update core fields)
  app.patch("/api/admin/stores/:storeNumber", async (req, res) => {
    try {
      const id = parseInt(req.params.storeNumber);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid store ID" });

      const allowedFields = ["name", "email", "phone", "address", "city", "state", "postcode", "category"] as const;
      const updates: Record<string, any> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      // Auto-resolve timezone whenever address fields change
      if (hasAddressChange(updates)) {
        // Fetch existing values to fill in any gaps
        const [existing] = await db.select({
          address: locations.address, city: locations.city,
          state: locations.state, postcode: locations.postcode,
        }).from(locations).where(eq(locations.id, id)).limit(1);
        const resolvedTz = await resolveTimezoneFromAddress({
          address:  updates.address  ?? existing?.address,
          city:     updates.city     ?? existing?.city,
          state:    updates.state    ?? existing?.state,
          postcode: updates.postcode ?? existing?.postcode,
        });
        if (resolvedTz) {
          updates.timezone = resolvedTz;
          console.log(`[admin-store-update] Auto-set timezone for store ${id} → ${resolvedTz}`);
        }
      }

      const [updated] = await db.update(locations).set(updates).where(eq(locations.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "Store not found" });
      return res.json(updated);
    } catch (error) {
      console.error("Admin store update error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET single store by ID for admin
  app.get("/api/admin/stores/:storeNumber", async (req, res) => {
    try {
      const { storeNumber } = req.params;
      
      // Get store by ID
      const store = await db.select({
        id: locations.id,
        name: locations.name,
        email: locations.email,
        phone: locations.phone,
        address: locations.address,
        city: locations.city,
        state: locations.state,
        postcode: locations.postcode,
        category: locations.category,
        timezone: locations.timezone,
        bookingSlug: locations.bookingSlug,
        bookingTheme: locations.bookingTheme,
        commissionPayoutFrequency: locations.commissionPayoutFrequency,
        userId: locations.userId,
      }).from(locations)
        .where(eq(locations.id, parseInt(storeNumber)))
        .limit(1);

      if (store.length === 0) {
        return res.status(404).json({ message: "Store not found" });
      }

      // Get user information (userId may be null for stores without an owner)
      const user = store[0].userId
        ? await db.select({
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
            createdAt: users.createdAt,
          }).from(users)
            .where(eq(users.id, store[0].userId))
            .limit(1)
        : [];

      const storeData = {
        ...store[0],
        userEmail: user[0]?.email || '',
        userFirstName: user[0]?.firstName || '',
        userLastName: user[0]?.lastName || '',
        createdAt: user[0]?.createdAt?.toISOString() || null,
        lastLogin: null,
      };

      return res.json(storeData);
    } catch (error) {
      console.error("Error fetching store:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(api.stores.create.path, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      // ── Location limit enforcement ─────────────────────────────────────────
      const { checkLocationLimit } = await import("./middleware/plan-middleware");
      const { locations: locsTable } = await import("@shared/schema");
      const [primaryStoreRow] = await db
        .select({ id: locsTable.id })
        .from(locsTable)
        .where(eq(locsTable.userId, userId))
        .limit(1);
      const limitCheck = await checkLocationLimit(userId, primaryStoreRow?.id ?? null);
      if (!limitCheck.allowed) {
        return res.status(403).json({
          message: limitCheck.limit === 0
            ? "Your plan does not include multiple locations. Upgrade to add more."
            : `Your plan allows up to ${limitCheck.limit} location${limitCheck.limit === 1 ? "" : "s"}. You currently have ${limitCheck.current}. Upgrade to add more.`,
          code: "LOCATION_LIMIT_REACHED",
          upgradeRequired: true,
          limit: limitCheck.limit,
          used: limitCheck.current,
        });
      }
      // ── End limit check ────────────────────────────────────────────────────

      const input = insertLocationSchema.parse(req.body);
      const store = await storage.createStore({ ...input, userId });

      // Seed default business hours (Mon–Sat 9am-7pm, Sun 10am-5pm) so the
      // calendar has real data immediately — users can edit in Settings.
      try {
        const defaultHours = [
          { dayOfWeek: 0, openTime: "10:00", closeTime: "17:00", isClosed: false },
          { dayOfWeek: 1, openTime: "09:00", closeTime: "19:00", isClosed: false },
          { dayOfWeek: 2, openTime: "09:00", closeTime: "19:00", isClosed: false },
          { dayOfWeek: 3, openTime: "09:00", closeTime: "19:00", isClosed: false },
          { dayOfWeek: 4, openTime: "09:00", closeTime: "19:00", isClosed: false },
          { dayOfWeek: 5, openTime: "09:00", closeTime: "19:00", isClosed: false },
          { dayOfWeek: 6, openTime: "10:00", closeTime: "18:00", isClosed: false },
        ];
        await storage.setBusinessHours(store.id, defaultHours.map(h => ({ ...h, storeId: store.id })));
        await storage.upsertCalendarSettings(store.id, {
          timeSlotInterval: 15,
          nonWorkingHoursDisplay: 1,
          allowBookingOutsideHours: true,
          autoCompleteAppointments: true,
          autoMarkNoShows: false,
          showPrices: true,
          startOfWeek: "monday",
          walkInsEnabled: true,
        });
      } catch (seedErr) {
        console.error("[store/create] Failed to seed defaults:", seedErr);
      }

      return res.status(201).json(store);
    } catch (error) {
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  app.patch("/api/stores/:id", async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      
      const id = Number(req.params.id);
      const store = await storage.getStore(id);
      if (!store || store.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const input = insertLocationSchema.partial().parse(req.body);

      // Auto-resolve timezone whenever address fields change
      if (hasAddressChange(input as Record<string, unknown>)) {
        const resolvedTz = await resolveTimezoneFromAddress({
          address: (input as any).address ?? store.address,
          city:    (input as any).city    ?? store.city,
          state:   (input as any).state   ?? store.state,
          postcode:(input as any).postcode?? store.postcode,
        });
        if (resolvedTz) {
          (input as any).timezone = resolvedTz;
          console.log(`[store-update] Auto-set timezone for store ${id} → ${resolvedTz}`);
        }
      }

      const updatedStore = await storage.updateStore(id, input);
      if (!updatedStore) return res.status(404).json({ message: "Store not found" });
      return res.json(updatedStore);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", details: error.issues[0].message });
      } else {
        console.error("Store update error:", error);
        return res.status(400).json({ message: "Failed to update store" });
      }
    }
  });

  // === ADMIN: Platform Credits ===

  app.patch("/api/admin/stores/:storeId/platform-credits", async (req, res) => {
    try {
      const adminUserId = (req.session as any)?.userId;
      if (!adminUserId) return res.status(401).json({ error: "Unauthorized" });
      const adminUser = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, adminUserId));
      if (!adminUser[0]?.isAdmin) return res.status(403).json({ error: "Admin access required" });

      const storeId = parseInt(req.params.storeId);
      const { amount, reason } = req.body;
      const amt = parseFloat(amount);
      if (isNaN(amt)) return res.status(400).json({ error: "Invalid amount" });

      const [updated] = await db
        .update(locations)
        .set({ platformCredits: sql`COALESCE(platform_credits, 0) + ${amt.toFixed(2)}` })
        .where(eq(locations.id, storeId))
        .returning({ platformCredits: locations.platformCredits });

      if (!updated) return res.status(404).json({ error: "Store not found" });
      console.log(`[admin-credits] Store ${storeId}: ${amt >= 0 ? "+" : ""}${amt} by admin ${adminUserId}. Reason: ${reason}`);

      // Real-time low-balance alert if a deduction crosses a threshold (non-blocking)
      if (amt < 0) {
        const newBal = parseFloat(updated.platformCredits ?? "0");
        import("./services/low-balance-scheduler").then(({ maybeSendLowBalanceAlert }) => {
          maybeSendLowBalanceAlert(storeId, newBal).catch(() => {});
        }).catch(() => {});
      }

      const { logCreditTransaction } = await import("./lib/creditLedger");
      await logCreditTransaction({
        storeId:      storeId,
        type:         "adjustment",
        amount:       amt,
        description:  reason ? `Admin adjustment — ${reason}` : `Admin adjustment (${amt >= 0 ? "+" : ""}$${Math.abs(amt).toFixed(2)})`,
        balanceAfter: parseFloat(updated.platformCredits ?? "0"),
      });

      return res.json({ platformCredits: updated.platformCredits });
    } catch (err) {
      console.error("[admin-credits] PATCH:", err);
      return res.status(500).json({ error: "Failed to update platform credits" });
    }
  });

  app.get("/api/admin/stores/:storeId/platform-credits", async (req, res) => {
    try {
      const adminUserId = (req.session as any)?.userId;
      if (!adminUserId) return res.status(401).json({ error: "Unauthorized" });
      const adminUser = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, adminUserId));
      if (!adminUser[0]?.isAdmin) return res.status(403).json({ error: "Admin access required" });

      const storeId = parseInt(req.params.storeId);
      const [row] = await db.select({ platformCredits: locations.platformCredits }).from(locations).where(eq(locations.id, storeId));
      if (!row) return res.status(404).json({ error: "Store not found" });
      return res.json({ platformCredits: row.platformCredits });
    } catch (err) {
      return res.status(500).json({ error: "Failed to fetch credits" });
    }
  });

  // === ADMIN: Manual low-balance alert ===
  app.post("/api/admin/stores/:storeId/platform-credits/send-alert", async (req, res) => {
    try {
      const adminUserId = (req.session as any)?.userId;
      if (!adminUserId) return res.status(401).json({ error: "Unauthorized" });
      const adminUser = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, adminUserId));
      if (!adminUser[0]?.isAdmin) return res.status(403).json({ error: "Admin access required" });

      const storeId = parseInt(req.params.storeId);
      if (isNaN(storeId)) return res.status(400).json({ error: "Invalid storeId" });

      const [row] = await db
        .select({ platformCredits: locations.platformCredits })
        .from(locations)
        .where(eq(locations.id, storeId));
      if (!row) return res.status(404).json({ error: "Store not found" });

      const balance = parseFloat(row.platformCredits ?? "0");
      const { sendLowBalanceAlertEmail } = await import("./lib/systemEmails");
      // Admin-triggered: bypass dedup, force-send the appropriate level
      await sendLowBalanceAlertEmail(storeId, "platform_credits", balance, balance < 0);

      console.log(`[admin-wallet] Manual alert sent — store=${storeId} balance=$${balance.toFixed(2)}`);
      return res.json({ ok: true, balance });
    } catch (err: any) {
      console.error("[admin-wallet] send-alert error:", err.message);
      return res.status(500).json({ error: "Failed to send alert" });
    }
  });

  // === ADMIN: Wallet ledger — transaction history for a store ===
  app.get("/api/admin/stores/:storeId/platform-credits/transactions", async (req, res) => {
    try {
      const adminUserId = (req.session as any)?.userId;
      if (!adminUserId) return res.status(401).json({ error: "Unauthorized" });
      const adminUser = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, adminUserId));
      if (!adminUser[0]?.isAdmin) return res.status(403).json({ error: "Admin access required" });

      const storeId = parseInt(req.params.storeId);
      if (isNaN(storeId)) return res.status(400).json({ error: "Invalid storeId" });

      const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit  as string) || 20));
      const offset = Math.max(0,              parseInt(req.query.offset as string) || 0);

      const rows = await db
        .select()
        .from(platformCreditTransactions)
        .where(eq(platformCreditTransactions.storeId, storeId))
        .orderBy(desc(platformCreditTransactions.createdAt))
        .limit(limit)
        .offset(offset);

      return res.json({ transactions: rows, limit, offset });
    } catch (err) {
      console.error("[admin-credits/transactions]", err);
      return res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  // === ADMIN: Wallet overview — all stores with their balances ===
  app.get("/api/admin/wallet-overview", async (req, res) => {
    try {
      const adminUserId = (req.session as any)?.userId;
      if (!adminUserId) return res.status(401).json({ error: "Unauthorized" });
      const adminUser = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, adminUserId));
      if (!adminUser[0]?.isAdmin) return res.status(403).json({ error: "Admin access required" });

      const rows = await db
        .select({
          id:              locations.id,
          name:            locations.name,
          city:            locations.city,
          state:           locations.state,
          platformCredits: locations.platformCredits,
        })
        .from(locations)
        .orderBy(locations.name);

      return res.json({ stores: rows });
    } catch (err) {
      console.error("[admin/wallet-overview]", err);
      return res.status(500).json({ error: "Failed to fetch wallet overview" });
    }
  });

  // === ADMIN: One-time upload URL fixer ===
  /**
   * POST /api/admin/fix-upload-urls
   * Re-writes all relative /uploads/... URLs in the DB to absolute URLs using
   * the APP_URL env var (or the base URL passed in the request body).
   * Safe to run multiple times — only rows with relative paths are touched.
   */
  app.post("/api/admin/fix-upload-urls", async (req, res) => {
    try {
      const adminUserId = (req.session as any)?.userId;
      if (!adminUserId) return res.status(401).json({ message: "Unauthorized" });
      const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, adminUserId));
      if (user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });

      const appUrl = (req.body?.appUrl as string | undefined)?.replace(/\/$/, "")
        || process.env.APP_URL?.replace(/\/$/, "");

      if (!appUrl) {
        return res.status(400).json({
          message: "No base URL available. Set APP_URL env var or pass { appUrl } in the request body.",
        });
      }

      const results: Record<string, number> = {};

      // staff.avatar_url
      const staffRows = await db
        .select({ id: staff.id, avatarUrl: staff.avatarUrl })
        .from(staff)
        .where(like(staff.avatarUrl, "/uploads/%"));

      if (staffRows.length > 0) {
        for (const row of staffRows) {
          await db
            .update(staff)
            .set({ avatarUrl: `${appUrl}${row.avatarUrl}` })
            .where(eq(staff.id, row.id));
        }
        results["staff.avatar_url"] = staffRows.length;
      }

      // services.image_url
      const serviceRows = await db
        .select({ id: services.id, imageUrl: services.imageUrl })
        .from(services)
        .where(like(services.imageUrl, "/uploads/%"));

      if (serviceRows.length > 0) {
        for (const row of serviceRows) {
          await db
            .update(services)
            .set({ imageUrl: `${appUrl}${row.imageUrl}` })
            .where(eq(services.id, row.id));
        }
        results["services.image_url"] = serviceRows.length;
      }

      // service_categories.image_url
      const categoryRows = await db
        .select({ id: serviceCategories.id, imageUrl: serviceCategories.imageUrl })
        .from(serviceCategories)
        .where(like(serviceCategories.imageUrl, "/uploads/%"));

      if (categoryRows.length > 0) {
        for (const row of categoryRows) {
          await db
            .update(serviceCategories)
            .set({ imageUrl: `${appUrl}${row.imageUrl}` })
            .where(eq(serviceCategories.id, row.id));
        }
        results["service_categories.image_url"] = categoryRows.length;
      }

      // addons.image_url
      const addonRows = await db
        .select({ id: addons.id, imageUrl: addons.imageUrl })
        .from(addons)
        .where(like(addons.imageUrl, "/uploads/%"));

      if (addonRows.length > 0) {
        for (const row of addonRows) {
          await db
            .update(addons)
            .set({ imageUrl: `${appUrl}${row.imageUrl}` })
            .where(eq(addons.id, row.id));
        }
        results["addons.image_url"] = addonRows.length;
      }

      const totalUpdated = Object.values(results).reduce((a, b) => a + b, 0);

      return res.json({
        ok: true,
        appUrl,
        totalUpdated,
        breakdown: results,
        message: totalUpdated === 0
          ? "No relative upload URLs found — nothing to update."
          : `Updated ${totalUpdated} row(s) across ${Object.keys(results).length} column(s).`,
      });
    } catch (err) {
      console.error("fix-upload-urls error:", err);
      return res.status(500).json({ message: "Failed to fix upload URLs" });
    }
  });

  // === BILLING: Credits (store-owner self-serve) ===

  app.get("/api/billing/credits/balance", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });
      const [row] = await db
        .select({ platformCredits: locations.platformCredits })
        .from(locations)
        .where(eq(locations.id, storeId));
      if (!row) return res.status(404).json({ message: "Store not found" });
      const balance = row.platformCredits ?? "0.00";
      return res.json({ balance, formatted: `$${parseFloat(balance).toFixed(2)}` });
    } catch (err) {
      console.error("[credits/balance]", err);
      return res.status(500).json({ message: "Failed to fetch balance" });
    }
  });

  app.get("/api/billing/credits/transactions", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });
      const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit  as string) || 20));
      const offset = Math.max(0,              parseInt(req.query.offset as string) || 0);
      const rows = await db
        .select()
        .from(platformCreditTransactions)
        .where(eq(platformCreditTransactions.storeId, storeId))
        .orderBy(desc(platformCreditTransactions.createdAt))
        .limit(limit)
        .offset(offset);
      return res.json({ transactions: rows, limit, offset });
    } catch (err) {
      console.error("[credits/transactions]", err);
      return res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // === POS SETTINGS ===

  app.get("/api/pos-settings/:storeId", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ error: "No store context" });
      const [row] = await db.select({
        salesTaxRate: locations.salesTaxRate,
        taxServicesTaxable: locations.taxServicesTaxable,
        taxAddonsTaxable: locations.taxAddonsTaxable,
        taxProductsTaxable: locations.taxProductsTaxable,
        taxGiftCardsTaxable: locations.taxGiftCardsTaxable,
      }).from(locations).where(eq(locations.id, storeId));
      return res.json({
        salesTaxRate: row?.salesTaxRate ?? "0.0000",
        taxServicesTaxable: row?.taxServicesTaxable ?? false,
        taxAddonsTaxable: row?.taxAddonsTaxable ?? false,
        taxProductsTaxable: row?.taxProductsTaxable ?? true,
        taxGiftCardsTaxable: row?.taxGiftCardsTaxable ?? false,
      });
    } catch (err) {
      console.error("[pos-settings] GET:", err);
      return res.status(500).json({ error: "Failed to load POS settings" });
    }
  });

  app.patch("/api/pos-settings/:storeId", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ error: "No store context" });
      const { salesTaxRate, taxServicesTaxable, taxAddonsTaxable, taxProductsTaxable, taxGiftCardsTaxable } = req.body;
      const rate = parseFloat(salesTaxRate ?? "0");
      if (isNaN(rate) || rate < 0 || rate > 1) return res.status(400).json({ error: "salesTaxRate must be between 0 and 1" });
      const updates: Record<string, any> = { salesTaxRate: rate.toFixed(4) };
      if (typeof taxServicesTaxable === "boolean") updates.taxServicesTaxable = taxServicesTaxable;
      if (typeof taxAddonsTaxable === "boolean") updates.taxAddonsTaxable = taxAddonsTaxable;
      if (typeof taxProductsTaxable === "boolean") updates.taxProductsTaxable = taxProductsTaxable;
      if (typeof taxGiftCardsTaxable === "boolean") updates.taxGiftCardsTaxable = taxGiftCardsTaxable;
      await db.update(locations).set(updates).where(eq(locations.id, storeId));
      return res.json({ salesTaxRate: rate.toFixed(4), ...updates });
    } catch (err) {
      console.error("[pos-settings] PATCH:", err);
      return res.status(500).json({ error: "Failed to save POS settings" });
    }
  });

  // ── POS Grid Management ─────────────────────────────────────────────────────

  // List all grids for the session store
  app.get("/api/pos/grids", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ error: "No store context" });
      const rows = await db.select().from(posGrids)
        .where(eq(posGrids.storeId, storeId))
        .orderBy(posGrids.createdAt);
      return res.json(rows);
    } catch (err) {
      console.error("[pos-grids] GET list:", err);
      return res.status(500).json({ error: "Failed to load grids" });
    }
  });

  // Create a new grid
  app.post("/api/pos/grids", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ error: "No store context" });
      const name = (String(req.body.name || "NEW GRID")).toUpperCase().trim();
      const [grid] = await db.insert(posGrids)
        .values({ storeId, name })
        .returning();
      return res.json(grid);
    } catch (err) {
      console.error("[pos-grids] POST:", err);
      return res.status(500).json({ error: "Failed to create grid" });
    }
  });

  // Update grid name
  app.put("/api/pos/grids/:id", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ error: "No store context" });
      const name = (String(req.body.name || "")).toUpperCase().trim();
      const [grid] = await db.update(posGrids)
        .set({ name, updatedAt: new Date() })
        .where(and(eq(posGrids.id, Number(req.params.id)), eq(posGrids.storeId, storeId)))
        .returning();
      if (!grid) return res.status(404).json({ error: "Not found" });
      return res.json(grid);
    } catch (err) {
      console.error("[pos-grids] PUT:", err);
      return res.status(500).json({ error: "Failed to update grid" });
    }
  });

  // Delete a grid (locked grids are protected)
  app.delete("/api/pos/grids/:id", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ error: "No store context" });
      const [existing] = await db.select().from(posGrids)
        .where(and(eq(posGrids.id, Number(req.params.id)), eq(posGrids.storeId, storeId)));
      if (!existing) return res.status(404).json({ error: "Not found" });
      if (existing.isLocked) return res.status(403).json({ error: "This grid is locked and cannot be deleted." });
      await db.delete(posGrids).where(eq(posGrids.id, existing.id));
      return res.json({ ok: true });
    } catch (err) {
      console.error("[pos-grids] DELETE:", err);
      return res.status(500).json({ error: "Failed to delete grid" });
    }
  });

  // Update grid properties (name, internalCode, layoutType, dynamicPopulation, navBehavior, targetGridId)
  app.patch("/api/pos/grids/:id/properties", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ error: "No store context" });
      const gridId = Number(req.params.id);
      const [existing] = await db.select().from(posGrids)
        .where(and(eq(posGrids.id, gridId), eq(posGrids.storeId, storeId)));
      if (!existing) return res.status(404).json({ error: "Not found" });
      const {
        name, internalCode, layoutType, dynamicPopulation, navBehavior, targetGridId,
        rows, cols, dept, posStatus, isActive,
      } = req.body as {
        name?: string; internalCode?: string; layoutType?: string;
        dynamicPopulation?: boolean; navBehavior?: string; targetGridId?: number | null;
        rows?: number; cols?: number; dept?: number; posStatus?: number; isActive?: boolean;
      };
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (name !== undefined)              set.name              = String(name).toUpperCase().trim() || existing.name;
      if (internalCode !== undefined)      set.internalCode      = internalCode ? String(internalCode).toUpperCase().trim() : null;
      if (layoutType !== undefined)        set.layoutType        = String(layoutType);
      if (dynamicPopulation !== undefined) set.dynamicPopulation = Boolean(dynamicPopulation);
      if (navBehavior !== undefined)       set.navBehavior       = String(navBehavior);
      if ("targetGridId" in req.body)      set.targetGridId      = targetGridId ?? null;
      if (rows !== undefined)              set.rows              = Number(rows);
      if (cols !== undefined)              set.cols              = Number(cols);
      if (dept !== undefined)              set.dept              = Number(dept);
      if (posStatus !== undefined)         set.posStatus         = Number(posStatus);
      if (isActive !== undefined)          set.isActive          = Boolean(isActive);
      const [updated] = await db.update(posGrids).set(set as any)
        .where(eq(posGrids.id, gridId)).returning();
      return res.json(updated);
    } catch (err) {
      console.error("[pos-grids] PATCH properties:", err);
      return res.status(500).json({ error: "Failed to save grid properties" });
    }
  });

  // Publish a grid as live (unsets all others for the store first)
  app.post("/api/pos/grids/:id/publish", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ error: "No store context" });
      // Ensure grid belongs to store
      const [target] = await db.select().from(posGrids)
        .where(and(eq(posGrids.id, Number(req.params.id)), eq(posGrids.storeId, storeId)));
      if (!target) return res.status(403).json({ error: "Forbidden" });
      // Unset all, then set this one
      await db.update(posGrids).set({ isLive: false, updatedAt: new Date() })
        .where(eq(posGrids.storeId, storeId));
      const [updated] = await db.update(posGrids).set({ isLive: true, updatedAt: new Date() })
        .where(eq(posGrids.id, Number(req.params.id)))
        .returning();
      return res.json(updated);
    } catch (err) {
      console.error("[pos-grids] publish:", err);
      return res.status(500).json({ error: "Failed to publish grid" });
    }
  });

  // Get all slots for a grid (with service details joined)
  app.get("/api/pos/grids/:id/slots", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ error: "No store context" });
      const [grid] = await db.select().from(posGrids)
        .where(and(eq(posGrids.id, Number(req.params.id)), eq(posGrids.storeId, storeId)));
      if (!grid) return res.status(403).json({ error: "Forbidden" });
      const rows = await db.select({
        slotIndex:    posGridSlots.slotIndex,
        label:        posGridSlots.label,
        serviceId:    posGridSlots.serviceId,
        opensGridId:  posGridSlots.opensGridId,
        bandColor:    posGridSlots.bandColor,
        serviceName:  services.name,
        servicePrice: services.price,
      })
        .from(posGridSlots)
        .leftJoin(services, eq(posGridSlots.serviceId, services.id))
        .where(eq(posGridSlots.gridId, grid.id));
      return res.json(rows);
    } catch (err) {
      console.error("[pos-grids] GET slots:", err);
      return res.status(500).json({ error: "Failed to load slots" });
    }
  });

  // Upsert a single slot for a grid
  app.put("/api/pos/grids/:id/slots", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ error: "No store context" });
      const [grid] = await db.select().from(posGrids)
        .where(and(eq(posGrids.id, Number(req.params.id)), eq(posGrids.storeId, storeId)));
      if (!grid) return res.status(403).json({ error: "Forbidden" });
      const slot = req.body.slot as {
        slotIndex: number; serviceId: number | null;
        opensGridId: number | null; bandColor: string | null; label: string | null;
      };
      if (!slot || typeof slot.slotIndex !== "number") {
        return res.status(400).json({ error: "Invalid slot payload" });
      }
      const isEmpty = !slot.serviceId && !slot.opensGridId && !slot.bandColor && !slot.label;
      if (isEmpty) {
        await db.delete(posGridSlots)
          .where(and(eq(posGridSlots.gridId, grid.id), eq(posGridSlots.slotIndex, slot.slotIndex)));
      } else {
        await db.insert(posGridSlots)
          .values({
            gridId:     grid.id,
            slotIndex:  slot.slotIndex,
            serviceId:  slot.serviceId ?? null,
            opensGridId: slot.opensGridId ?? null,
            bandColor:  slot.bandColor ?? null,
            label:      slot.label ?? null,
            updatedAt:  new Date(),
          })
          .onConflictDoUpdate({
            target: [posGridSlots.gridId, posGridSlots.slotIndex],
            set: {
              serviceId:  sql`excluded.service_id`,
              opensGridId: sql`excluded.opens_grid_id`,
              bandColor:  sql`excluded.band_color`,
              label:      sql`excluded.label`,
              updatedAt:  new Date(),
            },
          });
      }
      // Return all slots for the grid
      const rows = await db.select({
        slotIndex:    posGridSlots.slotIndex,
        label:        posGridSlots.label,
        serviceId:    posGridSlots.serviceId,
        opensGridId:  posGridSlots.opensGridId,
        bandColor:    posGridSlots.bandColor,
        serviceName:  services.name,
        servicePrice: services.price,
      })
        .from(posGridSlots)
        .leftJoin(services, eq(posGridSlots.serviceId, services.id))
        .where(eq(posGridSlots.gridId, grid.id));
      return res.json(rows);
    } catch (err) {
      console.error("[pos-grids] PUT slot:", err);
      return res.status(500).json({ error: "Failed to save slot" });
    }
  });

  // Get the currently-live grid's slots (used by native POS app)
  app.get("/api/pos/grid/live", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ error: "No store context" });
      const [liveGrid] = await db.select().from(posGrids)
        .where(and(eq(posGrids.storeId, storeId), eq(posGrids.isLive, true)));
      if (!liveGrid) return res.json({ grid: null, slots: [] });
      const slots = await db.select({
        slotIndex:    posGridSlots.slotIndex,
        label:        posGridSlots.label,
        serviceId:    posGridSlots.serviceId,
        opensGridId:  posGridSlots.opensGridId,
        bandColor:    posGridSlots.bandColor,
        serviceName:  services.name,
        servicePrice: services.price,
      })
        .from(posGridSlots)
        .leftJoin(services, eq(posGridSlots.serviceId, services.id))
        .where(eq(posGridSlots.gridId, liveGrid.id));
      return res.json({ grid: liveGrid, slots });
    } catch (err) {
      console.error("[pos-grids] GET live:", err);
      return res.status(500).json({ error: "Failed to load live grid" });
    }
  });

  // === PAYROLL SETTINGS ===
  // Suspended accounts cannot access payroll data.
  app.use("/api/payroll-settings", requireNotSuspended);

  app.get("/api/payroll-settings/:storeId", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ error: "No store context" });
      const [row] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, storeId));
      const prefs = safeParsePreferences(row?.preferences as string | undefined);
      const payroll = prefs.payroll && typeof prefs.payroll === "object" ? prefs.payroll : {};
      return res.json({
        frequency: payroll.frequency ?? "monthly",
        weekStartDay: payroll.weekStartDay ?? 1,
        monthStartDay: payroll.monthStartDay ?? 1,
        semiMonthlyDay1: payroll.semiMonthlyDay1 ?? 1,
        semiMonthlyDay2: payroll.semiMonthlyDay2 ?? 15,
        enableSalaryHourly: payroll.enableSalaryHourly === true,
        enableCommissions: payroll.enableCommissions === true,
        isConfigured: payroll.isConfigured === true,
      });
    } catch (err) {
      console.error("[payroll] Failed to get settings:", err);
      return res.status(500).json({ error: "Failed to get payroll settings" });
    }
  });

  app.put("/api/payroll-settings/:storeId", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ error: "No store context" });
      const { frequency, weekStartDay, monthStartDay, semiMonthlyDay1, semiMonthlyDay2, enableSalaryHourly, enableCommissions } = req.body;
      const validFrequencies = ["weekly", "biweekly", "semimonthly", "monthly"];
      if (!validFrequencies.includes(frequency)) {
        return res.status(400).json({ error: "Invalid frequency" });
      }
      const [existingRow] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, storeId));
      const existingPrefsForPayroll = safeParsePreferences(existingRow?.preferences as string | undefined);
      const existingPayroll = existingPrefsForPayroll.payroll && typeof existingPrefsForPayroll.payroll === "object"
        ? existingPrefsForPayroll.payroll as Record<string, unknown>
        : {};
      const payroll = {
        frequency,
        weekStartDay: Number(weekStartDay ?? 1),
        monthStartDay: Number(monthStartDay ?? 1),
        semiMonthlyDay1: Number(semiMonthlyDay1 ?? 1),
        semiMonthlyDay2: Number(semiMonthlyDay2 ?? 15),
        enableSalaryHourly: enableSalaryHourly === true,
        enableCommissions: enableCommissions === true,
        isConfigured: true,
        configuredAt: existingPayroll.configuredAt ?? new Date().toISOString(),
      };
      const [existing] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, storeId));
      const currentPrefs = safeParsePreferences(existing?.preferences as string | undefined);
      const newPrefs = JSON.stringify({ ...currentPrefs, payroll });
      if (existing) {
        await db.update(storeSettings).set({ preferences: newPrefs, updatedAt: new Date() }).where(eq(storeSettings.storeId, storeId));
      } else {
        await db.insert(storeSettings).values({ storeId, preferences: newPrefs });
      }
      // Sync commissionPayoutFrequency on locations
      const freqMap: Record<string, string> = { weekly: "weekly", biweekly: "biweekly", semimonthly: "semimonthly", monthly: "monthly" };
      await db.update(locations).set({ commissionPayoutFrequency: freqMap[frequency] ?? "monthly" }).where(eq(locations.id, storeId));
      return res.json({ success: true, payroll });
    } catch (err) {
      console.error("[payroll] Failed to save settings:", err);
      return res.status(500).json({ error: "Failed to save payroll settings" });
    }
  });

  // DELETE /api/payroll-settings/:storeId/reset — wipe all earnings data and unlock settings
  app.delete("/api/payroll-settings/:storeId/reset", isAuthenticated, async (req, res) => {
    try {
      const storeId = parseInt(req.params.storeId as string);
      if (!storeId) return res.status(400).json({ error: "storeId required" });

      // Verify ownership
      const userId = (req.session as any)?.userId;
      const [store] = await db.select().from(locations).where(and(eq(locations.id, storeId), eq(locations.userId, userId))).limit(1);
      if (!store) return res.status(403).json({ error: "Unauthorized" });

      // Delete all payroll run items first (foreign key)
      const runs = await db.select({ id: payrollRuns.id }).from(payrollRuns).where(eq(payrollRuns.storeId, storeId));
      if (runs.length > 0) {
        const runIds = runs.map(r => r.id);
        await db.delete(payrollRunItems).where(inArray(payrollRunItems.payrollRunId, runIds));
        await db.delete(payrollRuns).where(eq(payrollRuns.storeId, storeId));
      }

      // Reset isConfigured in settings
      const [existingRow] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, storeId));
      const currentPrefs = safeParsePreferences(existingRow?.preferences as string | undefined);
      const existingPayroll = currentPrefs.payroll && typeof currentPrefs.payroll === "object"
        ? currentPrefs.payroll as Record<string, unknown>
        : {};
      const resetPayroll = { ...existingPayroll, isConfigured: false, configuredAt: null };
      const newPrefs = JSON.stringify({ ...currentPrefs, payroll: resetPayroll });
      if (existingRow) {
        await db.update(storeSettings).set({ preferences: newPrefs }).where(eq(storeSettings.storeId, storeId));
      }

      return res.json({ success: true, deleted: runs.length });
    } catch (err) {
      console.error("[payroll] Failed to reset earnings:", err);
      return res.status(500).json({ error: "Failed to reset earnings data" });
    }
  });

  // === CONTRACTOR PAYROLL RUNS ===
  // Suspended accounts cannot access payroll data.
  app.use("/api/payroll-runs", requireNotSuspended);

  // GET /api/payroll-runs — list all runs for the session store
  app.get("/api/payroll-runs", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ error: "No store context" });
      const runs = await db
        .select()
        .from(payrollRuns)
        .where(eq(payrollRuns.storeId, storeId))
        .orderBy(desc(payrollRuns.createdAt));
      return res.json(runs);
    } catch (err) {
      console.error("[payroll-runs] list error:", err);
      return res.status(500).json({ error: "Failed to fetch payroll runs" });
    }
  });

  // GET /api/payroll-runs/:runId — single run with items
  app.get("/api/payroll-runs/:runId", isAuthenticated, async (req, res) => {
    try {
      const runId = parseInt(req.params.runId as string);
      if (!runId) return res.status(400).json({ error: "runId required" });
      const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
      if (!run) return res.status(404).json({ error: "Payroll run not found" });
      const items = await db.select().from(payrollRunItems).where(eq(payrollRunItems.payrollRunId, runId));
      return res.json({ ...run, items });
    } catch (err) {
      console.error("[payroll-runs] get error:", err);
      return res.status(500).json({ error: "Failed to fetch payroll run" });
    }
  });

  // POST /api/payroll-runs — create a new payroll run (calculates commissions server-side)
  app.post("/api/payroll-runs", isAuthenticated, async (req, res) => {
    try {
      const { storeId, periodStart, periodEnd, notes } = req.body;
      if (!storeId || !periodStart || !periodEnd) {
        return res.status(400).json({ error: "storeId, periodStart, periodEnd required" });
      }

      // Get commission-enabled staff for this store
      const commissionStaff = await db
        .select()
        .from(staff)
        .where(and(eq(staff.storeId, storeId), eq(staff.commissionEnabled, true)));

      if (commissionStaff.length === 0) {
        return res.status(400).json({ error: "No commission-enabled contractors found for this store" });
      }

      // Fetch completed appointments in the period
      const periodStartDate = new Date(periodStart + "T00:00:00Z");
      const periodEndDate   = new Date(periodEnd   + "T23:59:59Z");

      const periodAppointments = await db
        .select({
          id:        appointments.id,
          staffId:   appointments.staffId,
          serviceId: appointments.serviceId,
          status:    appointments.status,
          date:      appointments.date,
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.storeId, storeId),
            eq(appointments.status, "completed"),
            gte(appointments.date, periodStartDate),
            sql`${appointments.date} <= ${periodEndDate}`
          )
        );

      // Fetch service prices for the appointments
      const serviceIds = [...new Set(periodAppointments.map(a => a.serviceId).filter(Boolean))];
      const servicePriceMap = new Map<number, number>();
      if (serviceIds.length > 0) {
        const svcRows = await db
          .select({ id: services.id, price: services.price })
          .from(services)
          .where(inArray(services.id, serviceIds as number[]));
        for (const s of svcRows) servicePriceMap.set(s.id, Number(s.price || 0));
      }

      // Fetch addon prices for the appointments
      const apptIds = periodAppointments.map(a => a.id);
      const addonRevenueMap = new Map<number, number>(); // apptId → addon total
      if (apptIds.length > 0) {
        const addonRows = await db
          .select({
            appointmentId: appointmentAddons.appointmentId,
            price:         addons.price,
          })
          .from(appointmentAddons)
          .leftJoin(addons, eq(appointmentAddons.addonId, addons.id))
          .where(inArray(appointmentAddons.appointmentId, apptIds));
        for (const row of addonRows) {
          const existing = addonRevenueMap.get(row.appointmentId) || 0;
          addonRevenueMap.set(row.appointmentId, existing + Number(row.price || 0));
        }
      }

      // Calculate per-contractor commission
      const runItems: {
        staffId: number; staffName: string; commissionRate: number;
        appointmentCount: number; serviceRevenue: number; addonRevenue: number;
        totalRevenue: number; commissionAmount: number;
      }[] = [];

      let totalCommission = 0;

      for (const member of commissionStaff) {
        const memberAppts = periodAppointments.filter(a => a.staffId === member.id);
        let serviceRevenue = 0;
        let addonRevenue   = 0;

        for (const appt of memberAppts) {
          serviceRevenue += servicePriceMap.get(appt.serviceId!) || 0;
          addonRevenue   += addonRevenueMap.get(appt.id) || 0;
        }

        const totalRevenue    = serviceRevenue + addonRevenue;
        const commissionRate  = Number(member.commissionRate || 0);
        const commissionAmount = totalRevenue * (commissionRate / 100);
        totalCommission += commissionAmount;

        runItems.push({
          staffId:          member.id,
          staffName:        member.name,
          commissionRate,
          appointmentCount: memberAppts.length,
          serviceRevenue,
          addonRevenue,
          totalRevenue,
          commissionAmount,
        });
      }

      // Get creator name
      const reqUser = (req as any).user;
      const createdBy = reqUser?.firstName
        ? `${reqUser.firstName} ${reqUser.lastName || ""}`.trim()
        : reqUser?.email || "Unknown";

      // Insert payroll run
      const [run] = await db.insert(payrollRuns).values({
        storeId,
        periodStart,
        periodEnd,
        status:           "draft",
        totalCommission:  totalCommission.toFixed(2),
        contractorCount:  runItems.length,
        notes:            notes || null,
        createdBy,
      }).returning();

      // Insert items
      if (runItems.length > 0) {
        await db.insert(payrollRunItems).values(
          runItems.map(item => ({
            payrollRunId:     run.id,
            staffId:          item.staffId,
            staffName:        item.staffName,
            commissionRate:   item.commissionRate.toFixed(2),
            appointmentCount: item.appointmentCount,
            serviceRevenue:   item.serviceRevenue.toFixed(2),
            addonRevenue:     item.addonRevenue.toFixed(2),
            totalRevenue:     item.totalRevenue.toFixed(2),
            commissionAmount: item.commissionAmount.toFixed(2),
            status:           "pending",
          }))
        );
      }

      const items = await db.select().from(payrollRunItems).where(eq(payrollRunItems.payrollRunId, run.id));
      return res.status(201).json({ ...run, items });
    } catch (err) {
      console.error("[payroll-runs] create error:", err);
      return res.status(500).json({ error: "Failed to create payroll run" });
    }
  });

  // PUT /api/payroll-runs/:runId/finalize — mark as finalized/paid
  app.put("/api/payroll-runs/:runId/finalize", isAuthenticated, async (req, res) => {
    try {
      const runId = parseInt(req.params.runId as string);
      if (!runId) return res.status(400).json({ error: "runId required" });
      const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
      if (!run) return res.status(404).json({ error: "Payroll run not found" });
      if (run.status === "finalized") return res.status(400).json({ error: "Already finalized" });

      await db.update(payrollRuns)
        .set({ status: "finalized", finalizedAt: new Date() })
        .where(eq(payrollRuns.id, runId));

      await db.update(payrollRunItems)
        .set({ status: "paid" })
        .where(eq(payrollRunItems.payrollRunId, runId));

      const [updated] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
      const items = await db.select().from(payrollRunItems).where(eq(payrollRunItems.payrollRunId, runId));
      return res.json({ ...updated, items });
    } catch (err) {
      console.error("[payroll-runs] finalize error:", err);
      return res.status(500).json({ error: "Failed to finalize payroll run" });
    }
  });

  // GET /api/payroll-runs/:runId/checks — enriched check data (tips + hours per staff)
  app.get("/api/payroll-runs/:runId/checks", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const runId = parseInt(req.params.runId as string);
      if (!runId) return res.status(400).json({ error: "runId required" });

      const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
      if (!run) return res.status(404).json({ error: "Payroll run not found" });

      // Verify ownership
      const [store] = await db.select().from(locations).where(and(eq(locations.id, run.storeId), eq(locations.userId, userId))).limit(1);
      if (!store) return res.status(403).json({ error: "Unauthorized" });

      const items = await db.select().from(payrollRunItems).where(eq(payrollRunItems.payrollRunId, runId));

      // Aggregate tips per staff for this pay period
      const periodStart = new Date(run.periodStart + "T00:00:00Z");
      const periodEnd   = new Date(run.periodEnd   + "T23:59:59Z");

      const staffIds = items.map(i => i.staffId);
      const tipsMap = new Map<number, number>();
      const hoursMap = new Map<number, number>();

      // dailyRawMap: staffId → dateKey → { svcRevenue, tips, count }
      const dailyRawMap = new Map<number, Map<string, { svcRevenue: number; tips: number; count: number }>>();

      if (staffIds.length > 0) {
        // Single query for tips + daily service revenue breakdown
        const apptRows = await db
          .select({
            staffId: appointments.staffId,
            date: appointments.date,
            totalPaid: appointments.totalPaid,
            tipAmount: appointments.tipAmount,
          })
          .from(appointments)
          .where(and(
            eq(appointments.storeId, run.storeId),
            eq(appointments.status, "completed"),
            gte(appointments.date, periodStart),
            sql`${appointments.date} <= ${periodEnd}`,
            inArray(appointments.staffId, staffIds)
          ));
        for (const row of apptRows) {
          if (!row.staffId) continue;
          const tip = Number(row.tipAmount ?? 0);
          const svc = Number(row.totalPaid ?? 0) - tip;
          const dateKey = new Date(row.date).toISOString().slice(0, 10);
          tipsMap.set(row.staffId, (tipsMap.get(row.staffId) ?? 0) + tip);
          if (!dailyRawMap.has(row.staffId)) dailyRawMap.set(row.staffId, new Map());
          const staffDaily = dailyRawMap.get(row.staffId)!;
          const prev = staffDaily.get(dateKey) ?? { svcRevenue: 0, tips: 0, count: 0 };
          staffDaily.set(dateKey, { svcRevenue: prev.svcRevenue + svc, tips: prev.tips + tip, count: prev.count + 1 });
        }

        // Hours from timeclock
        const clockRows = await db
          .select({ staffId: timeclock.staffId, clockIn: timeclock.clockIn, clockOut: timeclock.clockOut })
          .from(timeclock)
          .where(and(
            eq(timeclock.storeId, run.storeId),
            gte(timeclock.workDate, run.periodStart),
            sql`${timeclock.workDate} <= ${run.periodEnd}`,
            inArray(timeclock.staffId, staffIds)
          ));
        for (const row of clockRows) {
          if (row.clockOut) {
            const mins = Math.max(0, (new Date(row.clockOut).getTime() - new Date(row.clockIn).getTime()) / 60000);
            hoursMap.set(row.staffId, (hoursMap.get(row.staffId) || 0) + mins / 60);
          }
        }
      }

      const enrichedItems = items.map(item => {
        const rate = Number(item.commissionRate) / 100;
        const staffDailyRaw = dailyRawMap.get(item.staffId) ?? new Map<string, { svcRevenue: number; tips: number; count: number }>();

        // Build full date-range array with a row for every calendar day in the period
        const dailyBreakdown: Array<{ date: string; commission: number; tips: number; count: number }> = [];
        const cursor = new Date(run.periodStart + "T00:00:00Z");
        const endDate = new Date(run.periodEnd + "T23:59:59Z");
        while (cursor <= endDate) {
          const key = cursor.toISOString().slice(0, 10);
          const d = staffDailyRaw.get(key) ?? { svcRevenue: 0, tips: 0, count: 0 };
          dailyBreakdown.push({
            date: key,
            commission: parseFloat((d.svcRevenue * rate).toFixed(2)),
            tips: parseFloat(d.tips.toFixed(2)),
            count: d.count,
          });
          cursor.setDate(cursor.getDate() + 1);
        }

        return {
          ...item,
          tipsAmount:   parseFloat((tipsMap.get(item.staffId) || 0).toFixed(2)),
          hoursWorked:  parseFloat((hoursMap.get(item.staffId) || 0).toFixed(2)),
          totalPay:     parseFloat((Number(item.commissionAmount) + (tipsMap.get(item.staffId) || 0)).toFixed(2)),
          dailyBreakdown,
        };
      });

      return res.json({
        run,
        store: {
          name:     store.name,
          address:  store.address,
          city:     store.city,
          state:    store.state,
          postcode: store.postcode,
          phone:    store.phone,
          email:    store.email,
        },
        items: enrichedItems,
      });
    } catch (err) {
      console.error("[payroll-runs] checks error:", err);
      return res.status(500).json({ error: "Failed to fetch check data" });
    }
  });

  // DELETE /api/payroll-runs/:runId — delete a draft run
  app.delete("/api/payroll-runs/:runId", isAuthenticated, async (req, res) => {
    try {
      const runId = parseInt(req.params.runId as string);
      if (!runId) return res.status(400).json({ error: "runId required" });
      const [run] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId));
      if (!run) return res.status(404).json({ error: "Payroll run not found" });
      if (run.status === "finalized") return res.status(400).json({ error: "Cannot delete a finalized run" });
      await db.delete(payrollRuns).where(eq(payrollRuns.id, runId));
      return res.json({ success: true });
    } catch (err) {
      console.error("[payroll-runs] delete error:", err);
      return res.status(500).json({ error: "Failed to delete payroll run" });
    }
  });

  // === BUSINESS HOURS ===
  app.get(api.businessHours.get.path, isAuthenticated, async (req, res) => {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(403).json({ message: "No store context" });
    const hours = await storage.getBusinessHours(storeId);
    return res.json(hours);
  });

  app.put(api.businessHours.set.path, isAuthenticated, async (req, res) => {
    try {
      const sessionStoreId = await resolveSessionStoreId(req);
      if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
      const input = z.object({
        storeId: z.number(),
        hours: z.array(z.object({
          dayOfWeek: z.number().min(0).max(6),
          openTime: z.string().regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format"),
          closeTime: z.string().regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format"),
          isClosed: z.boolean(),
        })),
      }).parse(req.body);
      for (const h of input.hours) {
        if (h.isClosed) continue;
        const [oh, om] = h.openTime.split(":").map(Number);
        const [ch, cm] = h.closeTime.split(":").map(Number);
        if ((ch * 60 + cm) <= (oh * 60 + om)) {
          return res.status(400).json({ message: `Day ${h.dayOfWeek}: close time must be after open time` });
        }
      }
      const hoursData = input.hours.map(h => ({
        ...h,
        storeId: input.storeId,
      }));
      if (input.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });
      const result = await storage.setBusinessHours(input.storeId, hoursData);
      // Invalidate Redis availability cache immediately — stale slots won't clear otherwise.
      try {
        const { invalidateAvailabilityForStore } = await import("./lib/availabilityCache");
        await invalidateAvailabilityForStore(input.storeId);
      } catch {}
      // Rebuild precomputed slot cache — business hours affect all future dates.
      try {
        const { enqueueSlotRebuild, buildDateRange } = await import("./lib/slotQueue");
        void enqueueSlotRebuild(input.storeId, buildDateRange(14), "schedule_updated");
      } catch {}
      // Auto-sync updated hours to Google Business Profile if connected (fire-and-forget)
      triggerGBPHoursSync(input.storeId);
      return res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.issues[0].message });
      } else {
        return res.status(400).json({ message: "Invalid input" });
      }
    }
  });

  // === SERVICE CATEGORIES ===
  app.post("/api/service-categories/reorder", isAuthenticated, async (req, res) => {
    const sessionStoreId = await resolveSessionStoreId(req);
    if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) return res.status(400).json({ error: "Invalid input" });
    for (let i = 0; i < orderedIds.length; i++) {
      await storage.updateServiceCategory(orderedIds[i], { sortOrder: i });
    }
    return res.json({ success: true });
  });

  app.get(api.serviceCategories.list.path, isAuthenticated, async (req, res) => {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(403).json({ message: "No store context" });
    const cats = await storage.getServiceCategories(storeId);
    return res.json(cats);
  });

  app.post(api.serviceCategories.create.path, isAuthenticated, async (req, res) => {
    try {
      const sessionStoreId = await resolveSessionStoreId(req);
      if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
      const input = insertServiceCategorySchema.parse({ ...req.body, storeId: sessionStoreId });
      const cat = await storage.createServiceCategory(input);
      triggerTranslation({ entityType: "category", entityId: cat.id, name: cat.name });
      return res.status(201).json(cat);
    } catch (error) {
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  app.patch(api.serviceCategories.update.path, isAuthenticated, async (req, res) => {
    try {
      const sessionStoreId = await resolveSessionStoreId(req);
      if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
      const existing = await storage.getServiceCategory(Number(req.params.id));
      if (!existing) return res.status(404).json({ message: "Category not found" });
      if (existing.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });
      const input = insertServiceCategorySchema.partial().parse(req.body);
      const cat = await storage.updateServiceCategory(Number(req.params.id), input);
      if (!cat) return res.status(404).json({ message: "Category not found" });
      if (input.name) triggerTranslation({ entityType: "category", entityId: cat.id, name: cat.name });
      return res.json(cat);
    } catch (error) {
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  app.delete(api.serviceCategories.delete.path, isAuthenticated, async (req, res) => {
    const sessionStoreId = await resolveSessionStoreId(req);
    if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
    const existing = await storage.getServiceCategory(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "Category not found" });
    if (existing.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });
    await storage.deleteServiceCategory(Number(req.params.id));
    return res.status(204).end();
  });

  // === SERVICES ===
  app.get(api.services.list.path, isAuthenticated, async (req, res) => {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(403).json({ message: "No store context" });
    const services = await storage.getServices(storeId);
    return res.json(services);
  });

  app.get(api.services.get.path, isAuthenticated, async (req, res) => {
    const sessionStoreId = await resolveSessionStoreId(req);
    if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
    const service = await storage.getService(Number(req.params.id));
    if (!service) return res.status(404).json({ message: "Service not found" });
    if (service.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });
    return res.json(service);
  });

  app.post(api.services.create.path, requireActiveTrial, async (req, res) => {
    try {
      const sessionStoreId = await resolveSessionStoreId(req);
      if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
      const { options: rawOptions, ...serviceBody } = req.body;
      const input = insertServiceSchema.parse({ ...serviceBody, storeId: sessionStoreId });
      const service = await storage.createService(input);
      // Log service creation to activity feed (fire-and-forget)
      void pool.query(
        `INSERT INTO service_events (store_id, service_id, service_name, event_type, actor_user_id) VALUES ($1,$2,$3,$4,$5)`,
        [sessionStoreId, service.id, service.name, "created", (req.session as any)?.userId ?? null]
      ).catch((e: any) => console.error("[serviceEvents] create:", e?.message));
      triggerTranslation({ entityType: "service", entityId: service.id, name: service.name, description: service.description });
      // Create options if provided
      if (Array.isArray(rawOptions) && rawOptions.length > 0) {
        const optSchema = z.object({
          name: z.string().min(1),
          description: z.string().optional().nullable(),
          durationMinutes: z.coerce.number().int().min(1),
          price: z.coerce.number().min(0),
          isDefault: z.boolean().optional().default(false),
          displayOrder: z.coerce.number().int().optional().default(0),
        });
        for (let i = 0; i < rawOptions.length; i++) {
          const opt = optSchema.parse({ ...rawOptions[i], displayOrder: rawOptions[i].displayOrder ?? i });
          await storage.createServiceOption({ ...opt, price: String(opt.price), serviceId: service.id, isActive: true });
        }
        const updated = await storage.getService(service.id);
        // Trigger GBP auto-sync if enabled (fire-and-forget)
        triggerGBPServiceSync(sessionStoreId);
        // GBP Post Engine: enqueue a "new service" post candidate (fire-and-forget)
        triggerGBPPostEvent(sessionStoreId, "service_created", {
          entityId:       service.id,
          entityName:     service.name,
          entityPrice:    service.price,
          entityDuration: service.duration,
        });
        // GBP Photo Engine: enqueue service image if present (fire-and-forget)
        if (updated?.imageUrl) {
          triggerGBPPhotoEvent(sessionStoreId, "service_image", {
            imageUrl:   updated.imageUrl,
            serviceId:  service.id,
            entityName: service.name,
          });
        }
        return res.status(201).json(updated);
      }
      // Trigger GBP auto-sync if enabled (fire-and-forget)
      triggerGBPServiceSync(sessionStoreId);
      // GBP Post Engine: enqueue a "new service" post candidate (fire-and-forget)
      triggerGBPPostEvent(sessionStoreId, "service_created", {
        entityId:       service.id,
        entityName:     service.name,
        entityPrice:    service.price,
        entityDuration: service.duration,
      });
      // GBP Photo Engine: enqueue service image if present (fire-and-forget)
      if (service.imageUrl) {
        triggerGBPPhotoEvent(sessionStoreId, "service_image", {
          imageUrl:   service.imageUrl,
          serviceId:  service.id,
          entityName: service.name,
        });
      }
      return res.status(201).json(service);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.issues[0].message });
      } else {
        return res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.patch(api.services.update.path, isAuthenticated, async (req, res) => {
    try {
      const sessionStoreId = await resolveSessionStoreId(req);
      if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
      const existing = await storage.getService(Number(req.params.id));
      if (!existing) return res.status(404).json({ message: "Service not found" });
      if (existing.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });
      const input = insertServiceSchema.partial().parse(req.body);
      const service = await storage.updateService(Number(req.params.id), input);
      if (!service) return res.status(404).json({ message: "Service not found" });
      // Log service update to activity feed (fire-and-forget)
      void pool.query(
        `INSERT INTO service_events (store_id, service_id, service_name, event_type, actor_user_id, metadata) VALUES ($1,$2,$3,$4,$5,$6)`,
        [sessionStoreId, service.id, service.name, "updated", (req.session as any)?.userId ?? null,
         JSON.stringify({ changedFields: Object.keys(input).filter(k => k !== "storeId") })]
      ).catch((e: any) => console.error("[serviceEvents] update:", e?.message));
      if (input.name || input.description !== undefined) {
        triggerTranslation({ entityType: "service", entityId: service.id, name: service.name, description: service.description });
      }
      // Trigger GBP auto-sync if enabled (fire-and-forget)
      triggerGBPServiceSync(sessionStoreId);
      // GBP Post Engine: enqueue a "service updated" post candidate when meaningful fields changed (fire-and-forget)
      if (input.name || input.price !== undefined || input.description !== undefined) {
        triggerGBPPostEvent(sessionStoreId, "service_updated", {
          entityId:       service.id,
          entityName:     service.name,
          entityPrice:    service.price,
          entityDuration: service.duration,
        });
      }
      // GBP Photo Engine: enqueue updated service image (fire-and-forget)
      if (input.imageUrl && service.imageUrl) {
        triggerGBPPhotoEvent(sessionStoreId, "service_image", {
          imageUrl:   service.imageUrl,
          serviceId:  service.id,
          entityName: service.name,
        });
      }
      return res.json(service);
    } catch (error) {
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  app.delete(api.services.delete.path, isAuthenticated, async (req, res) => {
    const sessionStoreId = await resolveSessionStoreId(req);
    if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
    const existing = await storage.getService(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "Service not found" });
    if (existing.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });
    await storage.deactivateService(Number(req.params.id));
    // Log service deletion to activity feed (fire-and-forget)
    void pool.query(
      `INSERT INTO service_events (store_id, service_id, service_name, event_type, actor_user_id) VALUES ($1,$2,$3,$4,$5)`,
      [sessionStoreId, existing.id, existing.name, "deleted", (req.session as any)?.userId ?? null]
    ).catch((e: any) => console.error("[serviceEvents] delete:", e?.message));
    // Auto-sync service removal to Google Business Profile if connected (fire-and-forget)
    triggerGBPServiceSync(sessionStoreId);
    return res.status(204).end();
  });

  app.patch(`${api.services.update.path.replace("/:id", "")}/:id/activate`, isAuthenticated, async (req, res) => {
    const sessionStoreId = await resolveSessionStoreId(req);
    if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
    const existing = await storage.getService(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "Service not found" });
    if (existing.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });
    const service = await storage.updateService(Number(req.params.id), { isActive: true });
    // Log service activation to activity feed (fire-and-forget)
    void pool.query(
      `INSERT INTO service_events (store_id, service_id, service_name, event_type, actor_user_id) VALUES ($1,$2,$3,$4,$5)`,
      [sessionStoreId, existing.id, existing.name, "activated", (req.session as any)?.userId ?? null]
    ).catch((e: any) => console.error("[serviceEvents] activate:", e?.message));
    // Auto-sync re-activated service to Google Business Profile if connected (fire-and-forget)
    triggerGBPServiceSync(sessionStoreId);
    return res.json(service);
  });

  // === SERVICE OPTIONS ===
  const optionBodySchema = z.object({
    name: z.string().min(1),
    description: z.string().optional().nullable(),
    durationMinutes: z.coerce.number().int().min(1),
    price: z.coerce.number().min(0),
    isDefault: z.boolean().optional().default(false),
    displayOrder: z.coerce.number().int().optional().default(0),
  });

  app.get("/api/services/:id/options", isAuthenticated, async (req, res) => {
    const sessionStoreId = await resolveSessionStoreId(req);
    if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
    const service = await storage.getService(Number(req.params.id));
    if (!service) return res.status(404).json({ message: "Service not found" });
    if (service.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });
    const options = await storage.getServiceOptions(service.id);
    return res.json(options);
  });

  app.post("/api/services/:id/options", isAuthenticated, async (req, res) => {
    try {
      const sessionStoreId = await resolveSessionStoreId(req);
      if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
      const service = await storage.getService(Number(req.params.id));
      if (!service) return res.status(404).json({ message: "Service not found" });
      if (service.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });
      const body = optionBodySchema.parse(req.body);
      const option = await storage.createServiceOption({ ...body, price: String(body.price), serviceId: service.id, isActive: true });
      // Auto-sync new option to Google Business Profile if connected (fire-and-forget)
      triggerGBPServiceSync(sessionStoreId);
      return res.status(201).json(option);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.issues[0].message });
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/service-options/:id", isAuthenticated, async (req, res) => {
    try {
      const sessionStoreId = await resolveSessionStoreId(req);
      if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
      const optId = Number(req.params.id);
      const [existingOpt] = await db.select().from(serviceOptions).where(eq(serviceOptions.id, optId));
      if (!existingOpt) return res.status(404).json({ message: "Option not found" });
      const parentService = await storage.getService(existingOpt.serviceId);
      if (!parentService || parentService.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });
      const body = optionBodySchema.partial().parse(req.body);
      const updated = await storage.updateServiceOption(optId, { ...body, price: body.price !== undefined ? String(body.price) : undefined });
      // Auto-sync updated option to Google Business Profile if connected (fire-and-forget)
      triggerGBPServiceSync(sessionStoreId);
      return res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.issues[0].message });
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/service-options/:id", isAuthenticated, async (req, res) => {
    try {
      const sessionStoreId = await resolveSessionStoreId(req);
      if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
      const optId = Number(req.params.id);
      const [existingOpt] = await db.select().from(serviceOptions).where(eq(serviceOptions.id, optId));
      if (!existingOpt) return res.status(404).json({ message: "Option not found" });
      const parentService = await storage.getService(existingOpt.serviceId);
      if (!parentService || parentService.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });
      await storage.deactivateServiceOption(optId);
      // Auto-sync option removal to Google Business Profile if connected (fire-and-forget)
      triggerGBPServiceSync(sessionStoreId);
      return res.status(204).end();
    } catch (error) {
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // === ADDONS ===
  app.get(api.addons.list.path, isAuthenticated, async (req, res) => {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(403).json({ message: "No store context" });
    const result = await storage.getAddons(storeId);
    return res.json(result);
  });

  app.post(api.addons.create.path, isAuthenticated, async (req, res) => {
    try {
      const sessionStoreId = await resolveSessionStoreId(req);
      if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
      const input = insertAddonSchema.parse({ ...req.body, storeId: sessionStoreId });
      const addon = await storage.createAddon(input);
      triggerTranslation({ entityType: "addon", entityId: addon.id, name: addon.name, description: addon.description });
      return res.status(201).json(addon);
    } catch (error) {
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  app.patch(api.addons.update.path, isAuthenticated, async (req, res) => {
    try {
      const sessionStoreId = await resolveSessionStoreId(req);
      if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
      const existing = await storage.getAddon(Number(req.params.id));
      if (!existing) return res.status(404).json({ message: "Addon not found" });
      if (existing.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });
      const input = insertAddonSchema.partial().parse(req.body);
      const addon = await storage.updateAddon(Number(req.params.id), input);
      if (!addon) return res.status(404).json({ message: "Addon not found" });
      if (input.name || input.description !== undefined) {
        triggerTranslation({ entityType: "addon", entityId: addon.id, name: addon.name, description: addon.description });
      }
      return res.json(addon);
    } catch (error) {
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  app.delete(api.addons.delete.path, isAuthenticated, async (req, res) => {
    const sessionStoreId = await resolveSessionStoreId(req);
    if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
    const existing = await storage.getAddon(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "Addon not found" });
    if (existing.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });
    await storage.deactivateAddon(Number(req.params.id));
    return res.status(204).end();
  });

  app.patch(`${api.addons.update.path.replace("/:id", "")}/:id/activate`, isAuthenticated, async (req, res) => {
    const sessionStoreId = await resolveSessionStoreId(req);
    if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
    const existing = await storage.getAddon(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "Addon not found" });
    if (existing.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });
    const addon = await storage.updateAddon(Number(req.params.id), { isActive: true });
    return res.json(addon);
  });

  // === SERVICE ADDONS (linking) ===
  app.get(api.serviceAddons.list.path, isAuthenticated, async (req, res) => {
    const serviceId = req.query.serviceId ? Number(req.query.serviceId) : undefined;
    const result = await storage.getServiceAddons(serviceId);
    return res.json(result);
  });

  app.get(api.serviceAddons.forService.path, isAuthenticated, async (req, res) => {
    const serviceId = Number(req.params.id);
    const result = await storage.getAddonsForService(serviceId);
    return res.json(result);
  });

  app.post(api.serviceAddons.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = insertServiceAddonSchema.parse(req.body);
      const sa = await storage.createServiceAddon(input);
      return res.status(201).json(sa);
    } catch (error) {
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  app.delete(api.serviceAddons.delete.path, isAuthenticated, async (req, res) => {
    await storage.deleteServiceAddon(Number(req.params.id));
    return res.status(204).end();
  });

  app.get("/api/service-addon-mappings", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const userStores = await storage.getStores(userId);
      const storeIds = userStores.map(s => s.id);
      const allMappings = await storage.getAllServiceAddonMappings();
      const userAddons = await Promise.all(storeIds.map(sid => storage.getAddons(sid)));
      const userAddonIds = new Set(userAddons.flat().map(a => a.id));
      const filtered = allMappings.filter(m => userAddonIds.has(m.addonId));
      return res.json(filtered);
    } catch (error) {
      return res.status(500).json({ message: "Failed to fetch mappings" });
    }
  });

  app.post("/api/addons/:id/services", isAuthenticated, async (req, res) => {
    try {
      const addonId = Number(req.params.id);
      const bodySchema = z.object({
        serviceIds: z.array(z.number()),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
      }
      const addon = await storage.getAddon(addonId);
      if (!addon) return res.status(404).json({ message: "Addon not found" });
      const userId = (req.session as any)?.userId;
      if (addon.storeId) {
        const store = await storage.getStore(addon.storeId);
        if (store?.userId !== userId) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }
      await storage.setAddonServices(addonId, parsed.data.serviceIds);
      return res.json({ success: true });
    } catch (error) {
      return res.status(500).json({ message: "Failed to update addon services" });
    }
  });

  // === APPOINTMENT AVAILABLE TIME ===
  // POST /api/appointments/:id/send-review-request
  // Manually triggers a review request SMS for a completed appointment
  app.post("/api/appointments/:id/send-review-request", isAuthenticated, async (req, res) => {
    const appointmentId = Number(req.params.id);
    const appointment = await storage.getAppointment(appointmentId);
    if (!appointment) return res.status(404).json({ error: "Appointment not found" });
    const sessionStoreId = await resolveSessionStoreId(req);
    if (sessionStoreId && appointment.storeId !== sessionStoreId) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (appointment.status !== "completed") {
      return res.status(400).json({ error: "Review requests can only be sent for completed appointments" });
    }
    try {
      const { sendReviewRequest } = await import("./sms");
      await sendReviewRequest(appointment as any);
      return res.json({ success: true });
    } catch (err: any) {
      console.error("[review-request] error:", err);
      return res.status(500).json({ error: err.message || "Failed to send review request" });
    }
  });

  app.get("/api/appointments/:id/available-time", isAuthenticated, async (req, res) => {
    const appointmentId = Number(req.params.id);
    if (!Number.isFinite(appointmentId)) {
      return res.status(400).json({ message: "Invalid appointment id" });
    }
    const appointment = await storage.getAppointment(appointmentId);
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });
    const sessionStoreId = await resolveSessionStoreId(req);
    if (sessionStoreId && appointment.storeId !== sessionStoreId) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!appointment.staffId) return res.json({ availableMinutes: 0 });

    const appointmentEndMs = new Date(appointment.date).getTime() + appointment.duration * 60000;

    // Get store timezone for local-time calculations
    const store = appointment.storeId ? await storage.getStore(appointment.storeId) : null;
    const timezone = (store as any)?.timezone || "UTC";

    // Determine day boundaries in local store time
    const localApptDate = toZonedTime(new Date(appointment.date), timezone);
    const dayOfWeek = localApptDate.getDay();

    // Start = midnight local, End = 23:59:59 local (UTC equivalents)
    const localMidnight = new Date(localApptDate);
    localMidnight.setHours(0, 0, 0, 0);
    const localEndOfDay = new Date(localApptDate);
    localEndOfDay.setHours(23, 59, 59, 999);
    const dayStart = fromZonedTime(localMidnight, timezone);
    const dayEnd = fromZonedTime(localEndOfDay, timezone);

    const dayAppointments = await storage.getAppointments({
      from: dayStart,
      to: dayEnd,
      staffId: appointment.staffId,
      storeId: appointment.storeId || undefined,
    });

    // Find the next appointment starting at or after this one ends
    let nextStartMs: number | null = null;
    for (const other of dayAppointments) {
      if (other.id === appointmentId || other.status === "cancelled") continue;
      const otherStartMs = new Date(other.date).getTime();
      if (otherStartMs >= appointmentEndMs) {
        if (nextStartMs === null || otherStartMs < nextStartMs) {
          nextStartMs = otherStartMs;
        }
      }
    }

    let availableMinutes: number;
    if (nextStartMs !== null) {
      // Gap to next appointment minus 5-minute buffer
      availableMinutes = Math.max(0, Math.floor((nextStartMs - appointmentEndMs) / 60000) - 5);
    } else {
      // Use store's business close time for this day of week
      const storeHours = appointment.storeId ? await storage.getBusinessHours(appointment.storeId) : [];
      const dayHours = storeHours.find((h: any) => h.dayOfWeek === dayOfWeek);
      const closeTimeStr = dayHours?.closeTime || "22:00";
      const [closeH, closeM] = closeTimeStr.split(":").map(Number);
      const localClose = new Date(localApptDate);
      localClose.setHours(closeH, closeM, 0, 0);
      const eodMs = fromZonedTime(localClose, timezone).getTime();
      availableMinutes = Math.max(0, Math.floor((eodMs - appointmentEndMs) / 60000) - 5);
    }

    return res.json({ availableMinutes });
  });

  // === APPOINTMENT ADDONS ===
  app.get(api.appointmentAddons.forAppointment.path, isAuthenticated, async (req, res) => {
    const appointmentId = Number(req.params.id);
    const result = await storage.getAppointmentAddons(appointmentId);
    return res.json(result.map(aa => aa.addon));
  });

  app.post(api.appointmentAddons.set.path, isAuthenticated, async (req, res) => {
    try {
      const appointmentId = Number(req.params.id);
      const { addonIds, force } = z.object({
        addonIds: z.array(z.number()),
        force: z.boolean().optional().default(false),
      }).parse(req.body);

      const appointment = await storage.getAppointment(appointmentId);
      if (!appointment) return res.status(404).json({ message: "Appointment not found" });

      const activeStatuses = ["pending", "confirmed", "checked_in", "in_progress"];
      const isActive = activeStatuses.includes(appointment.status ?? "");

      if (appointment.staffId && isActive && !force) {
        // Collect requested addon records
        const requestedAddons: Array<typeof addons.$inferSelect> = [];
        let addonDuration = 0;
        for (const addonId of addonIds) {
          const addon = await storage.getAddon(addonId);
          if (addon) {
            requestedAddons.push(addon as typeof addons.$inferSelect);
            addonDuration += addon.duration;
          }
        }

        const baseDuration = appointment.service?.duration ?? appointment.duration;
        const totalDuration = baseDuration + addonDuration;

        const appointmentStart = new Date(appointment.date);
        const appointmentEnd = new Date(appointmentStart.getTime() + totalDuration * 60000);

        const dayStart = new Date(appointmentStart);
        dayStart.setUTCHours(0, 0, 0, 0);
        const dayEnd = new Date(appointmentStart);
        dayEnd.setUTCHours(23, 59, 59, 999);

        const dayAppointments = await storage.getAppointments({
          from: dayStart,
          to: dayEnd,
          staffId: appointment.staffId,
          storeId: appointment.storeId || undefined,
        });

        // Find the earliest next appointment that would be overlapped
        let conflictingAppt: any = null;
        for (const other of dayAppointments) {
          if (other.id === appointmentId || other.status === "cancelled") continue;
          const otherStart = new Date(other.date);
          const otherEnd   = new Date(otherStart.getTime() + other.duration * 60000);
          const overlaps   = appointmentStart < otherEnd && appointmentEnd > otherStart;
          if (overlaps && otherStart >= appointmentStart) {
            if (!conflictingAppt || otherStart < new Date(conflictingAppt.date)) {
              conflictingAppt = other;
            }
          }
        }

        if (conflictingAppt) {
          const nextApptStart   = new Date(conflictingAppt.date);
          const availableMinutes = Math.max(
            0,
            Math.floor((nextApptStart.getTime() - appointmentStart.getTime()) / 60000) - baseDuration,
          );

          // ── OPTION A: shorten via mini/express variants ──────────────────────
          const shortenAlts: any[] = [];
          let shortenTotalDuration = 0;
          for (const addon of requestedAddons) {
            const variants = await db
              .select()
              .from(addons)
              .where(and(
                eq(addons.parentAddonId, addon.id),
                eq(addons.storeId, appointment.storeId!),
              ));
            const mini    = variants.find((v: any) => v.type === "mini");
            const express = variants.find((v: any) => v.type === "express");
            shortenAlts.push({
              originalId:      addon.id,
              originalName:    addon.name,
              originalDuration: addon.duration,
              miniId:           mini?.id    ?? null,
              miniName:         mini?.name  ?? null,
              miniDuration:     mini?.duration ?? null,
              expressId:        express?.id    ?? null,
              expressName:      express?.name  ?? null,
              expressDuration:  express?.duration ?? null,
            });
            // For duration estimate use best available shorter version
            if (mini) {
              shortenTotalDuration += mini.duration;
            } else if (express) {
              shortenTotalDuration += express.duration;
            } else {
              shortenTotalDuration += addon.duration;
            }
          }

          const options: any[] = [];

          if (shortenTotalDuration <= availableMinutes && shortenAlts.some(a => a.miniId || a.expressId)) {
            options.push({
              type:        "shorten",
              label:       "Fit add-ons into available time",
              totalDuration: shortenTotalDuration,
              alternatives: shortenAlts,
            });
          }

          // ── OPTION B: reassign to another tech ───────────────────────────────
          if (appointment.storeId) {
            const allStaff = await storage.getAllStaff(appointment.storeId);
            const availableTechs: Array<{ id: number; name: string }> = [];

            for (const member of allStaff) {
              if (member.id === appointment.staffId) continue;
              if ((member as any).status && (member as any).status !== "active") continue;

              const memberAppts = await storage.getAppointments({
                from: dayStart,
                to: dayEnd,
                staffId: member.id,
                storeId: appointment.storeId,
              });

              const busy = memberAppts.some((a: any) => {
                if (a.status === "cancelled") return false;
                const aStart = new Date(a.date);
                const aEnd   = new Date(aStart.getTime() + a.duration * 60000);
                return appointmentStart < aEnd && appointmentEnd > aStart;
              });

              if (!busy) availableTechs.push({ id: member.id, name: member.name });
            }

            if (availableTechs.length > 0) {
              options.push({
                type:           "reassign",
                label:          "Reassign to another technician",
                availableTechs,
              });
            }
          }

          // ── OPTION C: partial — only the addons that fit ─────────────────────
          const fittingAddons: Array<{ id: number; name: string; duration: number }> = [];
          let cumulative = 0;
          for (const addon of requestedAddons) {
            if (cumulative + addon.duration <= availableMinutes) {
              fittingAddons.push({ id: addon.id, name: addon.name, duration: addon.duration });
              cumulative += addon.duration;
            } else break;
          }
          if (fittingAddons.length > 0 && fittingAddons.length < requestedAddons.length) {
            options.push({
              type:        "partial",
              label:       "Apply only add-ons that fit",
              description: `Apply ${fittingAddons.length} of ${requestedAddons.length} add-on(s) to stay on schedule`,
              fittingAddons,
            });
          }

          // ── OPTION D: manager override ────────────────────────────────────────
          const nextTime = nextApptStart.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
          options.push({
            type:    "override",
            label:   "Override (manager only)",
            warning: `This will delay the next appointment (${(conflictingAppt as any).customer?.fullName ?? (conflictingAppt as any).customer?.name ?? "next client"} at ${nextTime}).`,
          });

          return res.status(409).json({
            status:                "conflict",
            message:               `This extension will overlap the next appointment at ${nextTime}.`,
            severity:              "high",
            availableMinutes,
            requestedAddonDuration: addonDuration,
            nextAppointment: {
              id:           conflictingAppt.id,
              date:         conflictingAppt.date,
              customerName: (conflictingAppt as any).customer?.fullName ?? (conflictingAppt as any).customer?.name ?? "next client",
              startTime:    nextApptStart.toISOString(),
            },
            options,
          });
        }

        await storage.updateAppointment(appointmentId, { duration: totalDuration });
      }

      await storage.setAppointmentAddons(appointmentId, addonIds);
      return res.json({ success: true });
    } catch (error) {
      console.error(error);
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  // === STAFF ===
  app.get(api.staff.list.path, isAuthenticated, async (req, res) => {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(403).json({ message: "No store context" });
    const staffList = await storage.getAllStaff(storeId);
    return res.json(staffList);
  });

  app.get(api.staff.get.path, isAuthenticated, async (req, res) => {
    const sessionStoreId = await resolveSessionStoreId(req);
    if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
    const member = await storage.getStaffMember(Number(req.params.id));
    if (!member) return res.status(404).json({ message: "Staff not found" });
    if (member.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });
    return res.json(member);
  });

  app.post(api.staff.create.path, requireActiveTrial, async (req, res) => {
    try {
      const sessionStoreId = await resolveSessionStoreId(req);
      if (!sessionStoreId) return res.status(403).json({ message: "No store context" });

      const { checkStaffLimit } = await import("./middleware/plan-middleware");
      const limitCheck = await checkStaffLimit(sessionStoreId);
      if (!limitCheck.allowed) {
        const cap = limitCheck.limit === 1 ? "1 staff member" : `${limitCheck.limit} staff members`;
        return res.status(403).json({
          message: `Your plan allows ${cap}. You currently have ${limitCheck.current}. Upgrade to add more.`,
          upgradeRequired: true,
          limit: limitCheck.limit,
          current: limitCheck.current,
        });
      }

      const input = insertStaffSchema.parse({ ...req.body, storeId: sessionStoreId });
      const member = await storage.createStaff(input);

      // Log staff creation to activity feed (fire-and-forget)
      void logActivityEvent({
        storeId: sessionStoreId,
        eventType: "staff_added",
        message: `${member.name ?? "New staff member"} added to team`,
        metadata: { staffId: member.id, name: member.name, role: member.role, employmentType: (member as any).employmentType },
      });

      // Keep payouts model in sync: every staff member should have a contractor profile.
      const [existingContractor] = await db
        .select({ id: contractors.id })
        .from(contractors)
        .where(and(eq(contractors.storeId, sessionStoreId), eq(contractors.staffId, member.id)))
        .limit(1);

      if (!existingContractor) {
        const fullName = (member.name ?? "").trim();
        const nameParts = fullName.split(/\s+/).filter(Boolean);
        const firstName = nameParts[0] ?? "Staff";
        const lastName = nameParts.slice(1).join(" ") || "Member";

        await db.insert(contractors).values({
          name: member.name ?? "Staff Member",
          storeId: sessionStoreId,
          staffId: member.id,
          firstName,
          lastName,
          email: member.email ?? null,
          phone: member.phone ?? null,
          role: member.employmentType ?? member.role ?? "stylist",
          commissionRate: member.commissionRate ?? "0",
          productCommissionRate: "0",
          payoutMethod: "ach",
          taxClassification: "individual",
          isActive: true,
        });
      }

      // GBP Post Engine: enqueue a "new team member" post candidate (fire-and-forget)
      triggerGBPPostEvent(sessionStoreId, "staff_added", {
        entityId:   member.id,
        entityName: member.name ?? undefined,
        entityRole: member.employmentType ?? member.role ?? undefined,
      });

      return res.status(201).json(member);
    } catch (error) {
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  app.patch(api.staff.update.path, isAuthenticated, async (req, res) => {
    try {
      const sessionStoreId = await resolveSessionStoreId(req);
      if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
      const existing = await storage.getStaffMember(Number(req.params.id));
      if (!existing) return res.status(404).json({ message: "Staff not found" });
      if (existing.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });
      const input = insertStaffSchema.partial().parse(req.body);
      // claimStaffColor is called inside storage.updateStaff — no inline logic needed here.
      const member = await storage.updateStaff(Number(req.params.id), input);
      if (!member) return res.status(404).json({ message: "Staff not found" });
      return res.json(member);
    } catch (error) {
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  app.delete(api.staff.delete.path, isAuthenticated, async (req, res) => {
    const sessionStoreId = await resolveSessionStoreId(req);
    if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
    const existing = await storage.getStaffMember(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "Staff not found" });
    if (existing.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });
    await storage.deleteStaff(Number(req.params.id));
    return res.status(204).end();
  });

  // ── Staff avatar upload ───────────────────────────────────────────────────
  const avatarUpload = memoryUpload({ maxSizeMb: 20 });

  app.post("/api/staff/:id/avatar", isAuthenticated, (req, res, next) => {
    avatarUpload.single("avatar")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE")
          return res.status(413).json({ message: "File too large. Maximum size is 20 MB." });
        return res.status(400).json({ message: err.message });
      }
      if (err) return res.status(400).json({ message: (err as Error).message || "Upload error" });
      next();
    });
  }, async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      // "me" is a self-upload alias — resolve to the session staff ID.
      let staffId: number;
      if (req.params.id === "me") {
        const sid = (req.session as any)?.staffId;
        if (!sid) return res.status(401).json({ message: "Unauthorized" });
        staffId = Number(sid);
      } else {
        staffId = Number(req.params.id);
      }
      if (isNaN(staffId)) return res.status(400).json({ message: "Invalid staff id" });
      const { avatarUrl, thumbUrl } = await uploadAvatarToR2(req.file.buffer, req.file.originalname, req.file.mimetype);
      const member = await storage.updateStaff(staffId, { avatarUrl, avatarThumbUrl: thumbUrl } as any);
      if (!member) return res.status(404).json({ message: "Staff not found" });
      // GBP Photo Engine: enqueue staff avatar (fire-and-forget)
      if (member.storeId && avatarUrl) {
        triggerGBPPhotoEvent(member.storeId, "staff_avatar", {
          imageUrl:   avatarUrl,
          staffId:    member.id,
          entityName: member.name ?? undefined,
        });
      }
      return res.json({ avatarUrl, thumbUrl });
    } catch (err) {
      console.error("[staff/avatar] upload error:", err);
      return res.status(500).json({ message: "Upload failed" });
    }
  });

  // ── Generic image upload (services, addons, new-staff photo) ─────────────
  const genericImageUpload = memoryUpload({ maxSizeMb: 20 });

  app.post("/api/uploads/image", isAuthenticated, (req, res, next) => {
    genericImageUpload.single("image")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE")
          return res.status(413).json({ message: "File too large. Maximum size is 20 MB." });
        return res.status(400).json({ message: err.message });
      }
      if (err) return res.status(400).json({ message: (err as Error).message || "Upload error" });
      next();
    });
  }, async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const url = await uploadToR2(req.file.buffer, "images", req.file.originalname, req.file.mimetype);
      return res.json({ url });
    } catch (err) {
      console.error("[uploads/image] upload error:", err);
      return res.status(500).json({ message: "Upload failed" });
    }
  });

  app.post("/api/staff/:id/enable-calendar-access", isAuthenticated, async (req, res) => {
    try {
      const staffId = Number(req.params.id);
      const staff = await storage.getStaffMember(staffId);

      if (!staff || !staff.email) {
        return res.status(400).json({ message: "Staff member not found or has no email address." });
      }

      const tempPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(tempPassword, 10);

      let user = await storage.findUserByEmail(staff.email);

      if (user) {
        // Link the user to this staff record, but DO NOT downgrade an existing
        // owner/admin/manager to "staff" — that locks them out of their own store.
        const keepRole =
          user.role === "owner" || user.role === "admin" || user.role === "manager";
        await storage.updateUser(user.id, {
          password: hashedPassword,
          ...(keepRole ? {} : { role: "staff" }),
          staffId: staff.id,
          passwordChanged: false,
        });
      } else {
        user = await storage.createUser({
          email: staff.email,
          password: hashedPassword,
          role: "staff",
          staffId: staff.id,
          passwordChanged: false,
        });
      }

      // Send email with temporary password
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #007bff; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">Staff Calendar Access</h1>
          </div>
          <div style="background-color: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #333; margin-top: 0;">Welcome to Your Staff Portal!</h2>
            <p style="color: #666; line-height: 1.6;">
              Your calendar access has been enabled for <strong>${staff.name}</strong>.
            </p>
            <div style="background-color: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #007bff;">
              <h3 style="color: #333; margin-top: 0; margin-bottom: 15px;">Your Login Details:</h3>
              <p style="margin: 5px 0;"><strong>Email:</strong> ${staff.email}</p>
              <p style="margin: 5px 0;"><strong>Temporary Password:</strong> <span style="background-color: #e9ecef; padding: 5px 10px; border-radius: 3px; font-family: monospace; font-size: 16px;">${tempPassword}</span></p>
            </div>
            <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107;">
              <p style="margin: 0; color: #856404;">
                <strong>Important:</strong> Please log in and change your password as soon as possible.
              </p>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || process.env.APP_URL || ''}/staff-auth" 
                 style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Log In to Staff Portal
              </a>
            </div>
            <p style="color: #6c757d; font-size: 14px; text-align: center; margin-top: 30px;">
              If you have any questions, please contact your administrator.
            </p>
          </div>
        </div>
      `;

      const emailText = `
Staff Calendar Access Enabled

Welcome ${staff.name}!

Your calendar access has been enabled. Here are your login details:

Email: ${staff.email}
Temporary Password: ${tempPassword}

Important: Please log in and change your password as soon as possible.

Log in at: ${process.env.FRONTEND_URL || process.env.APP_URL || ''}/staff-auth

If you have any questions, please contact your administrator.
      `;

      const emailResult = await sendEmail(
        staff.storeId || 1, // Use storeId from staff record or default to 1
        staff.email,
        "Staff Calendar Access Enabled - Your Login Details",
        emailHtml,
        emailText
      );

      if (!emailResult.success) {
        console.error("Failed to send calendar access email:", emailResult.error);
        // Don't fail the whole operation, but log the error
        console.log(`Calendar access enabled for ${staff.email} but email failed to send. Temporary password: ${tempPassword}`);
      } else {
        console.log(`Calendar access email sent successfully to ${staff.email} with message ID: ${emailResult.id}`);
      }

      return res.json({ success: true, message: "Calendar access enabled and email sent." });
    } catch (error) {
      console.error("Failed to enable calendar access:", error);
      return res.status(500).json({ message: "Failed to enable calendar access" });
    }
  });

  // === STAFF SERVICES ===
  app.get(api.staffServices.list.path, isAuthenticated, async (req, res) => {
    const staffId = req.query.staffId ? Number(req.query.staffId) : undefined;
    const serviceId = req.query.serviceId ? Number(req.query.serviceId) : undefined;
    const result = await storage.getStaffServices(staffId, serviceId);
    return res.json(result);
  });

  app.get(api.staffServices.forService.path, isAuthenticated, async (req, res) => {
    const serviceId = Number(req.params.id);
    const capableStaff = await storage.getStaffForService(serviceId);
    return res.json(capableStaff);
  });

  app.post(api.staffServices.set.path, isAuthenticated, async (req, res) => {
    try {
      const staffId = Number(req.params.id);
      const { serviceIds } = z.object({ serviceIds: z.array(z.number()) }).parse(req.body);
      await storage.setStaffServices(staffId, serviceIds);
      return res.json({ success: true });
    } catch (error) {
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  // === STAFF AVAILABILITY ===
  app.get(api.staffAvailability.get.path, isAuthenticated, async (req, res) => {
    const staffId = Number(req.params.id);
    const rules = await storage.getStaffAvailability(staffId);
    return res.json(rules);
  });

  app.post(api.staffAvailability.set.path, isAuthenticated, async (req, res) => {
    try {
      const staffId = Number(req.params.id);
      const { rules } = z.object({
        rules: z.array(z.object({
          dayOfWeek: z.number(),
          startTime: z.string(),
          endTime: z.string(),
        }))
      }).parse(req.body);

      // Validate that each rule falls within business hours for that day
      const staffRow = await storage.getStaffMember(staffId);
      if (staffRow?.storeId) {
        const bizHours = await storage.getBusinessHours(staffRow.storeId);
        for (const rule of rules) {
          const dayBiz = bizHours.find((h: any) => h.dayOfWeek === rule.dayOfWeek);
          if (!dayBiz) continue; // no business hours defined for this day — allow
          if (dayBiz.isClosed) {
            return res.status(400).json({
              message: `The business is closed on ${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][rule.dayOfWeek]}. Staff availability cannot be set for closed days.`,
            });
          }
          const toMins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
          const bizOpenMins  = toMins(dayBiz.openTime);
          const bizCloseMins = toMins(dayBiz.closeTime);
          const startMins    = toMins(rule.startTime);
          const endMins      = toMins(rule.endTime);
          if (startMins < bizOpenMins || endMins > bizCloseMins) {
            return res.status(400).json({
              message: `Staff availability on ${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][rule.dayOfWeek]} must be within business hours (${dayBiz.openTime}–${dayBiz.closeTime}).`,
            });
          }
        }
      }

      const result = await storage.setStaffAvailability(staffId, rules.map(r => ({ ...r, staffId })));
      // Rebuild precomputed slot cache and invalidate Redis availability cache.
      try {
        const staffRow = await storage.getStaffMember(staffId);
        if (staffRow?.storeId) {
          const { enqueueSlotRebuild, buildDateRange } = await import("./lib/slotQueue");
          void enqueueSlotRebuild(staffRow.storeId, buildDateRange(14), "schedule_updated");
          const { invalidateAvailabilityForStore } = await import("./lib/availabilityCache");
          void invalidateAvailabilityForStore(staffRow.storeId);
        }
      } catch {}
      return res.json(result);
    } catch (error) {
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  // GET /api/store-staff-availability?storeId=X  — all availability rules for every staff in a store (one round trip)
  app.get("/api/store-staff-availability", isAuthenticated, async (req, res) => {
    const storeId = Number(req.query.storeId);
    if (!storeId) return res.status(400).json({ message: "storeId required" });
    const storeStaff = await db.select({ id: staff.id }).from(staff).where(eq(staff.storeId, storeId));
    if (!storeStaff.length) return res.json([]);
    const staffIds = storeStaff.map((s) => s.id);
    const rules = await db.select().from(staffAvailability).where(inArray(staffAvailability.staffId, staffIds));
    return res.json(rules);
  });

  app.delete(api.staffAvailability.deleteRule.path, isAuthenticated, async (req, res) => {
    await storage.deleteStaffAvailabilityRule(Number(req.params.id));
    // Rebuild slot cache — removing a staff availability rule changes their working days.
    try {
      const { enqueueSlotRebuild, buildDateRange } = await import("./lib/slotQueue");
      // We don't have storeId directly here; use a best-effort rebuild via the queue
      // by fetching all locations and triggering for all (low-frequency operation).
      const { db: _db } = await import("./db");
      const { locations: _locs } = await import("@shared/schema");
      const stores = await _db.select({ id: _locs.id }).from(_locs);
      const dates = buildDateRange(14);
      for (const s of stores) void enqueueSlotRebuild(s.id, dates, "schedule_updated");
    } catch {}
    return res.status(204).end();
  });

  // === AVAILABILITY SLOTS ===
  app.get(api.availability.slots.path, async (req, res) => {
    try {
      const serviceId = Number(req.query.serviceId);
      const storeId = Number(req.query.storeId);
      const date = String(req.query.date);
      const duration = Number(req.query.duration);
      const specificStaffId = req.query.staffId ? Number(req.query.staffId) : undefined;

      if (!serviceId || !storeId || !date || !duration) {
        return res.status(400).json({ message: "serviceId, storeId, date, and duration are required" });
      }

      const store = await storage.getStore(storeId);
      if (!store) return res.status(404).json({ message: "Store not found" });

      let candidateStaff: Staff[];
      if (specificStaffId) {
        const member = await storage.getStaffMember(specificStaffId);
        // Verify that the specific staff member can perform this service and is active
        if (member && (member as any).status !== "removed" && (member as any).status !== "deactivated") {
          const staffServices = await storage.getStaffServices(specificStaffId);
          const canPerformService = staffServices.some(ss => ss.serviceId === serviceId);
          candidateStaff = canPerformService ? [member] : [];
        } else {
          candidateStaff = [];
        }
      } else {
        candidateStaff = await storage.getStaffForService(serviceId);
      }

      if (candidateStaff.length === 0) {
        return res.json([]);
      }

      const tz = store.timezone || "UTC";

      const calSettings = await storage.getCalendarSettings(storeId);
      const slotInterval = calSettings?.timeSlotInterval || 15;

      // Get actual business hours for the specific date
      const businessHours = await storage.getBusinessHours(storeId);
      const dateObj = new Date(`${date}T00:00:00`);
      const dayOfWeek = dateObj.getUTCDay();
      const todayBusinessHours = businessHours.find(h => h.dayOfWeek === dayOfWeek);
      
      if (!todayBusinessHours || todayBusinessHours.isClosed) {
        return res.json([]);
      }

      // Parse business hours
      const [openHour, openMin] = todayBusinessHours.openTime.split(":").map(Number);
      const [closeHour, closeMin] = todayBusinessHours.closeTime.split(":").map(Number);

      const dayStartLocal = fromZonedTime(new Date(`${date}T00:00:00`), tz);
      const dayEndLocal = fromZonedTime(new Date(`${date}T23:59:59.999`), tz);

      const dayAppointments = await storage.getAppointments({
        from: dayStartLocal,
        to: dayEndLocal,
        storeId,
      });

      type SlotResult = { time: string; staffId: number; staffName: string };
      const slots: SlotResult[] = [];

      const staffLastAppointment: Map<number, Date> = new Map();
      const allAppointments = await storage.getAppointments({ storeId });
      for (const apt of allAppointments) {
        if (apt.status === "cancelled") continue;
        const staffId = apt.staffId;
        if (!staffId) continue;
        const aptDate = new Date(apt.date);
        const current = staffLastAppointment.get(staffId);
        if (!current || aptDate > current) {
          staffLastAppointment.set(staffId, aptDate);
        }
      }

      const businessEndUtc = fromZonedTime(new Date(`${date}T${String(closeHour).padStart(2, "0")}:${String(closeMin).padStart(2, "0")}:00`), tz);
      const nowUtc = new Date();

      for (let hour = openHour; hour <= closeHour; hour++) {
        for (let min = 0; min < 60; min += slotInterval) {
          // Skip slots before opening time on the first hour
          if (hour === openHour && min < openMin) {
            continue;
          }
          // Stop once we've passed the closing hour
          if (hour === closeHour && min >= closeMin) {
            break;
          }
          if (hour > closeHour) {
            break;
          }

          const slotStart = fromZonedTime(new Date(`${date}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`), tz);
          const slotEnd = new Date(slotStart.getTime() + duration * 60000);

          if (slotStart < nowUtc) {
            continue;
          }

          // Slot must finish by closing time
          if (slotEnd > businessEndUtc) {
            continue;
          }

          const availableForSlot: { staffMember: Staff; lastApt: Date | null }[] = [];

          for (const staffMember of candidateStaff) {
            let hasConflict = false;
            for (const apt of dayAppointments) {
              if (apt.staffId !== staffMember.id) continue;
              if (apt.status === "cancelled") continue;
              // Treat no-show slots as free — they can be re-filled.
              if (apt.status === "no_show") continue;
              const aptStart = new Date(apt.date);
              const aptEnd = new Date(aptStart.getTime() + apt.duration * 60000);
              if (slotStart < aptEnd && slotEnd > aptStart) {
                hasConflict = true;
                break;
              }
            }
            
            // Check staff availability rules if they exist
            if (!hasConflict) {
              const staffAvailRules = await storage.getStaffAvailability(staffMember.id);
              if (staffAvailRules && staffAvailRules.length > 0) {
                // Get day of week in store's local timezone, not UTC
                const slotDate = new Date(`${date}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`);
                const slotLocalDate = toZonedTime(slotDate, tz);
                const slotDayOfWeek = slotLocalDate.getDay(); // 0=Sunday, 1=Monday, etc.
                const dayAvailability = staffAvailRules.find(r => r.dayOfWeek === slotDayOfWeek);
                
                if (dayAvailability) {
                  const [availStartHour, availStartMin] = dayAvailability.startTime.split(":").map(Number);
                  const [availEndHour, availEndMin] = dayAvailability.endTime.split(":").map(Number);

                  const slotTimeInMin = hour * 60 + min;
                  // Convert slotEnd (UTC) to store-local time before extracting hours/minutes
                  const slotEndLocal = toZonedTime(slotEnd, tz);
                  const slotEndTimeInMin = slotEndLocal.getHours() * 60 + slotEndLocal.getMinutes();
                  const availStartInMin = availStartHour * 60 + availStartMin;
                  const availEndInMin = availEndHour * 60 + availEndMin;

                  // Check if slot falls outside staff availability
                  if (slotTimeInMin < availStartInMin || slotEndTimeInMin > availEndInMin) {
                    hasConflict = true;
                  }
                } else {
                  // No availability rules for this day, staff is not available
                  hasConflict = true;
                }
              }
            }
            
            if (!hasConflict) {
              availableForSlot.push({
                staffMember,
                lastApt: staffLastAppointment.get(staffMember.id) || null,
              });
            }
          }

          if (availableForSlot.length > 0) {
            availableForSlot.sort((a, b) => {
              if (a.lastApt === null && b.lastApt === null) return 0;
              if (a.lastApt === null) return -1;
              if (b.lastApt === null) return 1;
              return a.lastApt.getTime() - b.lastApt.getTime();
            });

            const chosen = availableForSlot[0];
            slots.push({
              time: slotStart.toISOString(),
              staffId: chosen.staffMember.id,
              staffName: chosen.staffMember.name,
            });
          }
        }
      }

      return res.json(slots);
    } catch (error) {
      console.error("Availability error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // === CUSTOMERS ===
  app.get(api.customers.searchByPhone.path, isAuthenticated, async (req, res) => {
    const phone = req.query.phone as string;
    const storeId = await resolveSessionStoreId(req);
    if (!phone || !storeId) return res.status(400).json({ message: "phone and storeId required" });
    const match = await storage.searchCustomerByPhone(phone, storeId);
    return res.json(match || null);
  });

  app.get(api.customers.list.path, isAuthenticated, async (req, res) => {
    // Staff can search/lookup individual clients for booking but cannot browse the full list
    if ((req.session as any)?.staffId) {
      return res.status(403).json({ message: "Staff members cannot access the full client list" });
    }
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(403).json({ message: "No store context" });
    const customers = await storage.getCustomers(storeId);
    return res.json(customers);
  });

  app.post(api.customers.create.path, requireActiveTrial, async (req, res) => {
    try {
      const sessionStoreId = await resolveSessionStoreId(req);
      if (!sessionStoreId) {
        return res.status(403).json({ message: "No store context" });
      }

      const requestedStoreId = req.body.storeId ? Number(req.body.storeId) : null;
      if (requestedStoreId && requestedStoreId !== sessionStoreId) {
        return res.status(403).json({ message: "Cannot create clients for a different store" });
      }

      const input = insertCustomerSchema.parse({ ...req.body, storeId: sessionStoreId });
      const customer = await storage.createCustomer(input);
      return res.status(201).json(customer);
    } catch (error: any) {
      if (error?.code === "PHONE_DUPLICATE") {
        return res.status(409).json({ message: error.message, code: "PHONE_DUPLICATE" });
      }
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  app.get("/api/customers/:id", isAuthenticated, async (req, res) => {
    const sessionStoreId = await resolveSessionStoreId(req);
    if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
    const customer = await storage.getCustomer(Number(req.params.id));
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    if (customer.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });
    return res.json(customer);
  });

  app.patch(api.customers.update.path, isAuthenticated, async (req, res) => {
    if ((req.session as any)?.staffId) {
      return res.status(403).json({ message: "Staff members cannot edit client records" });
    }
    try {
      const sessionStoreId = await resolveSessionStoreId(req);
      if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
      const existing = await storage.getCustomer(Number(req.params.id));
      if (!existing) return res.status(404).json({ message: "Customer not found" });
      if (existing.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });

      // Check phone uniqueness if the phone is being changed
      const newPhone = req.body.phone;
      if (newPhone && newPhone !== existing.phone) {
        const conflict = await storage.searchCustomerByPhone(newPhone, sessionStoreId);
        if (conflict && conflict.id !== existing.id) {
          return res.status(409).json({ message: "A customer with this phone number already exists.", code: "PHONE_DUPLICATE" });
        }
      }

      const input = insertCustomerSchema.partial().parse(req.body);
      const customer = await storage.updateCustomer(Number(req.params.id), input);
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      return res.json(customer);
    } catch (error) {
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  // === APPOINTMENTS SSE — real-time status push (no-show, auto-no-show, etc.) ===
  // Clients connect once per session; the server pushes status-change events as
  // they happen (both from manual PATCH and from the auto-no-show scheduler).
  // ── Salon Resources (stations, chairs, treatment rooms) ─────────────────

  app.get("/api/resources", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(404).json({ message: "Store not found" });
      const rows = await db
        .select()
        .from(salonResources)
        .where(eq(salonResources.storeId, storeId))
        .orderBy(salonResources.type, salonResources.sortOrder);
      return res.json(rows);
    } catch (err) {
      console.error("[GET /api/resources]", err);
      return res.status(500).json({ message: "Failed to fetch resources" });
    }
  });

  app.post("/api/resources", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(404).json({ message: "Store not found" });
      const { type, name, sortOrder, isActive } = req.body;
      if (!type || !String(name ?? "").trim()) return res.status(400).json({ message: "type and name are required" });
      const [created] = await db
        .insert(salonResources)
        .values({ storeId, type, name: String(name).trim(), sortOrder: sortOrder ?? 0, isActive: isActive ?? true })
        .returning();
      return res.status(201).json(created);
    } catch (err) {
      console.error("[POST /api/resources]", err);
      return res.status(500).json({ message: "Failed to create resource" });
    }
  });

  app.patch("/api/resources/:id", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(404).json({ message: "Store not found" });
      const id = parseInt(String(req.params.id), 10);
      const { name, type, sortOrder, isActive } = req.body;
      const patch: Record<string, any> = {};
      if (name != null)       patch.name      = String(name).trim();
      if (type != null)       patch.type      = type;
      if (sortOrder != null)  patch.sortOrder = Number(sortOrder);
      if (isActive != null)   patch.isActive  = Boolean(isActive);
      if (!Object.keys(patch).length) return res.status(400).json({ message: "Nothing to update" });
      const [updated] = await db
        .update(salonResources)
        .set(patch)
        .where(and(eq(salonResources.id, id), eq(salonResources.storeId, storeId)))
        .returning();
      if (!updated) return res.status(404).json({ message: "Resource not found" });
      return res.json(updated);
    } catch (err) {
      console.error("[PATCH /api/resources/:id]", err);
      return res.status(500).json({ message: "Failed to update resource" });
    }
  });

  app.delete("/api/resources/:id", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(404).json({ message: "Store not found" });
      const id = parseInt(String(req.params.id), 10);
      await db.delete(salonResources).where(and(eq(salonResources.id, id), eq(salonResources.storeId, storeId)));
      return res.status(204).end();
    } catch (err) {
      console.error("[DELETE /api/resources/:id]", err);
      return res.status(500).json({ message: "Failed to delete resource" });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────

  app.get("/api/appointments/sse", isAuthenticated, async (req, res) => {
    const storeId = Number(req.query.storeId);
    if (!storeId || isNaN(storeId)) {
      return res.status(400).json({ message: "storeId required" });
    }

    // Connection: keep-alive is a hop-by-hop header — HTTP/2 proxies reject it
    // and it causes ERR_HTTP2_PROTOCOL_ERROR. Drop it; persistence is implicit
    // in HTTP/2 and controlled by keep-alive on HTTP/1.1 upstream connections.
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    res.write(`: connected storeId=${storeId}\n\n`);

    const heartbeat = setInterval(() => {
      try { res.write(": ping\n\n"); } catch { cleanup(); }
    }, 25000);

    const cleanup = registerSseClient(storeId, res);

    req.on("close", () => {
      clearInterval(heartbeat);
      cleanup();
    });
  });

  // === APPOINTMENTS ===
  app.get(api.appointments.list.path, isAuthenticated, async (req, res) => {
    try {
      // Scope to own staff if the user lacks appointments.viewAll
      const scopedStaffId = ownStaffScope(req);
      const sessionStoreId = await resolveSessionStoreId(req);

      const filters = {
        from: req.query.from ? new Date(req.query.from as string) : undefined,
        to: req.query.to ? new Date(req.query.to as string) : undefined,
        staffId: scopedStaffId !== undefined ? scopedStaffId : (req.query.staffId ? Number(req.query.staffId) : undefined),
        storeId: sessionStoreId ?? undefined,
        customerId: req.query.customerId ? Number(req.query.customerId) : undefined,
      };
      const appointments = await storage.getAppointments(filters);

      if (filters.storeId) {
        const calSettings = await storage.getCalendarSettings(filters.storeId);
        const store = await storage.getStore(filters.storeId);
        const graceMinutes = Math.max(0, store?.lateGracePeriodMinutes ?? 10);
        const graceMs = graceMinutes * 60000;
        const now = new Date();

        // Only auto-process appointments within the last 24 h.
        // Without this boundary the loop retroactively marks every old pending
        // appointment in the store's entire history as a no-show the first time
        // the feature is enabled.
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        if (calSettings?.autoMarkNoShows) {
          for (const apt of appointments) {
            const aptDate = new Date(apt.date);
            if (aptDate < twentyFourHoursAgo) continue;
            if (
              apt.status !== "cancelled" &&
              apt.status !== "completed" &&
              apt.status !== "no_show" &&
              apt.status !== "no-show" &&
              apt.status !== "started" &&
              apt.status !== "checked_in"
            ) {
              const noShowAt = new Date(aptDate.getTime() + graceMs);
              if (noShowAt < now) {
                await storage.updateAppointment(apt.id, { status: "no_show" });
                apt.status = "no_show";

                // Push SSE event so connected calendars update instantly.
                broadcastAppointmentStatus({
                  appointmentId: apt.id,
                  storeId: filters.storeId!,
                  status: "no_show",
                  source: "auto",
                });

                // Release consideration lock — same side-effect as manual PATCH → no-show.
                // Without this the tech stays stuck in "Busy" forever since the direct
                // storage.updateAppointment call bypasses the PATCH route handler.
                if (apt.staffId) {
                  try {
                    const prefs = await getTurnPreferences(filters.storeId!);
                    const lockedIds: number[] = Array.isArray(prefs.lockedStaffIds)
                      ? (prefs.lockedStaffIds as any[]).map(Number).filter(Number.isFinite)
                      : [];
                    if (lockedIds.includes(apt.staffId)) {
                      const deque: number[] = Array.isArray(prefs.dequeOrder)
                        ? (prefs.dequeOrder as any[]).map(Number).filter(Number.isFinite)
                        : [];
                      await saveTurnPreferences(filters.storeId!, {
                        lockedStaffIds: lockedIds.filter((id) => id !== apt.staffId),
                        dequeOrder: [apt.staffId!, ...deque.filter((id) => id !== apt.staffId!)],
                      });
                      console.log(`[turn] Auto no-show: Lock released for staff ${apt.staffId} (apt ${apt.id})`);
                    }
                  } catch (lockErr) {
                    console.error("[turn] Auto no-show: Failed to release lock:", lockErr);
                  }
                }

                // Trigger no-show win-back SMS — same as manual PATCH → no-show.
                setImmediate(async () => {
                  try {
                    const { sendNoShowWinback } = await import("./intelligence/no-show-winback");
                    if (apt.customerId) {
                      await sendNoShowWinback(filters.storeId!, apt.customerId, apt.id);
                      console.log(`[intelligence] Auto no-show win-back triggered for customer ${apt.customerId}`);
                    }
                  } catch (err: any) {
                    console.error("[intelligence] Auto no-show win-back error:", err.message);
                  }
                  // Notify any kiosk walk-in waitlist customer of the freed slot
                  try {
                    await notifyKioskNoShowWaitlist(filters.storeId!, apt);
                  } catch (err: any) {
                    console.error("[kiosk/noshow-waitlist] auto-mark notify error:", err.message);
                  }
                });

                broadcastTurnEligibilityChanged(filters.storeId!);
              }
            }
          }
        }

        if (calSettings?.autoCompleteAppointments) {
          for (const apt of appointments) {
            const aptDate2 = new Date(apt.date);
            if (aptDate2 < twentyFourHoursAgo) continue;
            if (apt.status === "confirmed" || apt.status === "started" || apt.status === "pending") {
              const aptEnd = new Date(aptDate2.getTime() + apt.duration * 60000);
              if (aptEnd < now) {
                await storage.updateAppointment(apt.id, { status: "completed" });
                apt.status = "completed";

                // Run turn checkout rotation — same side-effect as manual PATCH → completed.
                // Without this the tech's deque position never updates and the lock is
                // never released, leaving them stuck as "Busy" indefinitely.
                if (apt.staffId) {
                  const paid = typeof apt.totalPaid === "string"
                    ? parseFloat(apt.totalPaid || "0")
                    : (apt.totalPaid ?? 0);
                  const tip = typeof apt.tipAmount === "string"
                    ? parseFloat(apt.tipAmount || "0")
                    : (apt.tipAmount ?? 0);
                  handleTurnCheckout(filters.storeId!, apt.staffId, paid, tip).catch((err) => {
                    console.error("[turn] Auto-complete checkout error:", err);
                  });
                  broadcastTurnEligibilityChanged(filters.storeId!);
                }
              }
            }
          }
        }
      }

      return res.json(appointments);
    } catch (err) {
      console.error("[appointments] Failed to fetch appointments:", err);
      return res.status(500).json({ message: "Failed to fetch appointments" });
    }
  });

  // === AUTO-ASSIGN SUGGESTION ENDPOINT ===
  // Returns the technician the engine would assign for a given slot WITHOUT
  // creating an appointment. Use this to pre-populate the staff picker in the UI.
  // Query params: storeId, serviceId, date (ISO string), duration (minutes)
  app.get("/api/appointments/suggest-assignment", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      const serviceId = Number(req.query.serviceId);
      const date = req.query.date ? new Date(req.query.date as string) : null;
      const duration = Number(req.query.duration) || 30;

      if (!storeId || !serviceId || !date || isNaN(date.getTime())) {
        return res.status(400).json({ message: "serviceId and date are required" });
      }

      const result = await autoAssignTechnician({ storeId, serviceId, date, duration });
      return res.json(result);
    } catch (err) {
      console.error("[suggest-assignment] Error:", err);
      return res.status(500).json({ message: "Failed to compute assignment suggestion" });
    }
  });

  app.post(api.appointments.create.path, isAuthenticated, async (req, res) => {
    try {
      const sessionStoreId = await resolveSessionStoreId(req);
      if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
      const input = insertAppointmentSchema.parse({
        ...req.body,
        storeId: sessionStoreId,
        date: new Date(req.body.date),
      });

      // noShowFill: front-desk is filling a past no-show slot — skip the guard.
      const isNoShowFill = req.body.noShowFill === true;
      if (!isNoShowFill && input.date.getTime() <= Date.now()) {
        return res.status(400).json({ message: "Cannot create an appointment in the past" });
      }

      // === AUTO-ASSIGNMENT HOOK ===
      // When no staffId is provided but serviceId and storeId are present,
      // run the fairness engine to assign the best available technician.
      // If a staffId WAS explicitly provided, this block is skipped entirely —
      // manual selections always bypass auto-assignment.
      if (!input.staffId && input.serviceId && input.storeId) {
        console.log(
          `[appointments:create] No staffId provided — running auto-assignment ` +
          `(store=${input.storeId} service=${input.serviceId})`
        );
        const assignment = await autoAssignTechnician({
          storeId: input.storeId,
          serviceId: input.serviceId,
          date: input.date,
          duration: input.duration || 30,
        });

        if (!assignment.assigned || !assignment.staffId) {
          console.log(
            `[appointments:create] Auto-assignment failed: ${assignment.reason} ` +
            `rejections=${assignment.rejections.map((r) => `${r.staffName}:${r.reason}`).join(", ")}`
          );
          return res.status(409).json({
            message: "No available technician could be assigned for this time slot",
            reason: assignment.reason,
            rejections: assignment.rejections,
          });
        }

        input.staffId = assignment.staffId;
        console.log(
          `[appointments:create] Auto-assigned staffId=${assignment.staffId} ` +
          `(${assignment.staffName}) score=${assignment.score}`
        );
      }

      // Validate staff is assigned to the requested service
      if (input.staffId && input.serviceId) {
        const staffServices = await storage.getStaffServices(input.staffId);
        const canPerformService = staffServices.some(ss => ss.serviceId === input.serviceId);
        if (!canPerformService) {
          return res.status(400).json({ message: "This staff member is not assigned to the selected service" });
        }
      }

      // Check for scheduling conflicts (overlapping appointments for the same staff)
      if (input.staffId && input.storeId) {
        const appointmentEnd = new Date(input.date.getTime() + (input.duration || 30) * 60000);
        const existingApts = await storage.getAppointments({ storeId: input.storeId });
        const hasConflict = existingApts.some(apt => {
          if (apt.staffId !== input.staffId) return false;
          if (apt.status === "cancelled") return false;
          // Allow filling a no-show slot — the no-show appointment itself would
          // otherwise conflict with the replacement booking at the same time.
          if (isNoShowFill && apt.status === "no_show") return false;
          const aptStart = new Date(apt.date);
          const aptEnd = new Date(aptStart.getTime() + apt.duration * 60000);
          return input.date < aptEnd && appointmentEnd > aptStart;
        });
        if (hasConflict) {
          return res.status(409).json({ message: "This staff member already has an appointment at that time" });
        }
      }

      if (input.storeId) {
        // Always enforce business hours — the allowBookingOutsideHours flag previously
        // gated this entire block, but since it defaults to true every new salon was
        // silently bypassing the check. Staff bookings must NEVER extend past closing.
        const store = await storage.getStore(input.storeId);
        const tz = store?.timezone || "UTC";
        const hours = await storage.getBusinessHours(input.storeId);
        const localStart = toZonedTime(input.date, tz);
        const dayOfWeek = localStart.getDay();
        const dayHours = hours.find((h) => h.dayOfWeek === dayOfWeek);
        if (dayHours?.isClosed) {
          return res.status(400).json({ message: "The salon is closed on that day" });
        }
        if (dayHours?.openTime && dayHours?.closeTime) {
          const [openH, openM]   = dayHours.openTime.split(":").map(Number);
          const [closeH, closeM] = dayHours.closeTime.split(":").map(Number);
          const openMin   = openH  * 60 + openM;
          const closeMin  = closeH * 60 + closeM;
          const startMin  = localStart.getHours() * 60 + localStart.getMinutes();
          const localEnd  = toZonedTime(new Date(input.date.getTime() + (input.duration || 30) * 60_000), tz);
          const endMin    = localEnd.getHours() * 60 + localEnd.getMinutes();
          if (startMin < openMin || endMin > closeMin) {
            return res.status(400).json({
              message: `Booking outside business hours is not allowed. This salon operates ${fmt12(dayHours.openTime)}–${fmt12(dayHours.closeTime)}. The selected service would end at ${fmt12(localEnd)}.`,
            });
          }
        }
      }

      // clientId: appointments.customer_id now references clients.id directly
      const clientId = req.body.clientId ? Number(req.body.clientId) : null;
      if (clientId && Number.isFinite(clientId)) {
        input.customerId = clientId;
      }

      const appointment = await storage.createAppointment(input);

      // Log appointment creation event (fire-and-forget)
      void pool.query(
        `INSERT INTO appointment_events (store_id, appointment_id, event_type, actor_user_id, metadata)
         VALUES ($1,$2,$3,$4,$5)`,
        [sessionStoreId, appointment.id, "created",
         (req.session as any)?.userId ?? null,
         JSON.stringify({ source: req.body.source ?? "staff", serviceId: input.serviceId, staffId: input.staffId })]
      ).catch((e: any) => console.error("[aptEvents] create:", e?.message));

      const fullAppointment = await storage.getAppointment(appointment.id);
      if (fullAppointment) {
        sendBookingConfirmation(fullAppointment).catch(console.error);
        sendBookingConfirmationEmail(fullAppointment).catch(console.error);

        if (appointment.storeId) {
          broadcastTurnEligibilityChanged(appointment.storeId);
          broadcastSyncEvent({ type: "booking_created", storeId: appointment.storeId, appointmentId: appointment.id, source: req.body.source ?? "staff" });
          triggerDashboardBroadcast(appointment.storeId);
        }
      }

      return res.status(201).json(appointment);
    } catch (error) {
       console.error(error);
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  // ── Single appointment fetch (used by StaffPOS) ─────────────────────────────
  app.get("/api/appointments/:id", isAuthenticated, async (req, res) => {
    try {
      const appointmentId = Number(req.params.id);
      if (!Number.isFinite(appointmentId)) {
        return res.status(400).json({ message: "Invalid appointment id" });
      }
      const sessionStoreId = await resolveSessionStoreId(req);
      const appointment = await storage.getAppointment(appointmentId);
      if (!appointment) return res.status(404).json({ message: "Appointment not found" });
      if (sessionStoreId && appointment.storeId !== sessionStoreId) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      return res.json(appointment);
    } catch (err) {
      console.error("[appointments] single fetch error:", err);
      return res.status(500).json({ message: "Failed to fetch appointment" });
    }
  });

  app.patch(api.appointments.update.path, isAuthenticated, async (req, res) => {
    try {
      const appointmentId = Number(req.params.id);
      if (!Number.isFinite(appointmentId)) {
        return res.status(400).json({ message: "Invalid appointment id" });
      }

      const input = insertAppointmentSchema.partial().parse({
        ...req.body,
        date: req.body.date ? new Date(req.body.date) : undefined,
      });
      if (input.status === "started" && !input.startedAt) {
        input.startedAt = new Date();
      }
      if (input.status === "completed" && !input.completedAt) {
        input.completedAt = new Date();
      }
      const existingAppointment = await storage.getAppointment(appointmentId);
      if (!existingAppointment) return res.status(404).json({ message: "Appointment not found" });
      // Remember pre-update status so we can guard against double side-effects
      // when the capture endpoint already marked the appointment completed and
      // the web client sends a follow-up PATCH (e.g. certxa_native_payment_complete).
      const wasAlreadyCompleted = existingAppointment.status === "completed";

      // Verify the appointment belongs to the requesting user's store
      const sessionStoreId = await resolveSessionStoreId(req);
      if (sessionStoreId && existingAppointment.storeId !== sessionStoreId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Preserve client-requested technician lock: if appointment was explicitly
      // requested with a specific staff member, front-desk edits must not
      // reassign it to a different technician.
      if (
        existingAppointment.clientRequestedStaff &&
        input.staffId !== undefined &&
        input.staffId !== existingAppointment.staffId
      ) {
        return res.status(409).json({
          message: "This appointment is locked to the client-requested technician and cannot be reassigned.",
        });
      }

      // Business hours check for reschedule: whenever date is being changed,
      // ensure the new time + duration don't fall outside operating hours.
      if (input.date && sessionStoreId) {
        const reschedStore = await storage.getStore(sessionStoreId);
        const tz = reschedStore?.timezone || "UTC";
        const reschedHours = await storage.getBusinessHours(sessionStoreId);
        const localStart = toZonedTime(input.date, tz);
        const dayOfWeek = localStart.getDay();
        const dayHours = reschedHours.find((h) => h.dayOfWeek === dayOfWeek);
        if (dayHours?.isClosed) {
          return res.status(400).json({ message: "The salon is closed on that day" });
        }
        if (dayHours?.openTime && dayHours?.closeTime) {
          const [openH, openM]   = dayHours.openTime.split(":").map(Number);
          const [closeH, closeM] = dayHours.closeTime.split(":").map(Number);
          const openMin   = openH  * 60 + openM;
          const closeMin  = closeH * 60 + closeM;
          const startMin  = localStart.getHours() * 60 + localStart.getMinutes();
          const apptDuration = input.duration ?? existingAppointment.duration ?? 30;
          const localEnd  = toZonedTime(new Date(input.date.getTime() + apptDuration * 60_000), tz);
          const endMin    = localEnd.getHours() * 60 + localEnd.getMinutes();
          if (startMin < openMin || endMin > closeMin) {
            return res.status(400).json({
              message: `Rescheduling outside business hours is not allowed. This salon operates ${fmt12(dayHours.openTime)}–${fmt12(dayHours.closeTime)}. The appointment would end at ${fmt12(localEnd)}.`,
            });
          }
        }
      }

      const appointment = await storage.updateAppointment(appointmentId, input);
      if (!appointment) return res.status(404).json({ message: "Appointment not found" });

      // Log appointment lifecycle events (fire-and-forget)
      if (appointment.storeId) {
        const prevStatus = existingAppointment.status;
        const newStatus  = input.status;
        // Status transition event
        if (newStatus && newStatus !== prevStatus) {
          const aptEvtType = newStatus === "cancelled"  ? "cancelled"
                           : newStatus === "no_show"    ? "no_show"
                           : newStatus === "started"    ? "started"
                           : newStatus === "completed"  ? "completed"
                           : "updated";
          void pool.query(
            `INSERT INTO appointment_events (store_id, appointment_id, event_type, actor_user_id, metadata)
             VALUES ($1,$2,$3,$4,$5)`,
            [appointment.storeId, appointment.id, aptEvtType,
             (req.session as any)?.userId ?? null,
             JSON.stringify({ previousStatus: prevStatus, newStatus })]
          ).catch((e: any) => console.error("[aptEvents] status:", e?.message));
        }
        // Reschedule event: date changed
        if (input.date && existingAppointment.date &&
            new Date(input.date).getTime() !== new Date(existingAppointment.date as any).getTime()) {
          void pool.query(
            `INSERT INTO appointment_events (store_id, appointment_id, event_type, actor_user_id, metadata)
             VALUES ($1,$2,$3,$4,$5)`,
            [appointment.storeId, appointment.id, "rescheduled",
             (req.session as any)?.userId ?? null,
             JSON.stringify({ previousDate: existingAppointment.date, newDate: input.date })]
          ).catch((e: any) => console.error("[aptEvents] reschedule:", e?.message));
        }
      }

      if (appointment.storeId) {
        const full = await storage.getAppointment(appointment.id);
        const customerName = (full as any)?.customer?.fullName || (full as any)?.customer?.name || "A client";
        const serviceName = (full as any)?.service?.name || "service";

        if (input.status === "completed") {
          // Guard: when the Stripe Terminal capture endpoint already marked this
          // appointment completed (server-side, immediately on M2/tap capture),
          // skip activity events, loyalty points, and queue rotation — the capture
          // endpoint's fire-and-forget async block handles those. Running them a
          // second time would double-award loyalty points and create duplicate feed
          // entries.  For all other completion paths (web POS, manual "Done" button)
          // wasAlreadyCompleted is false, so side-effects run normally.
          if (!wasAlreadyCompleted) {
            // Owner Feed: log the completed service
            void logActivityEvent({
              storeId: appointment.storeId,
              eventType: "service_completed",
              message: `${customerName} completed ${serviceName}`,
              amount: input.totalPaid ? parseFloat(String(input.totalPaid)) : null,
            });

            // Payment-specific side-effects only when a payment amount was collected
            if (input.totalPaid) {
              broadcastNotification({
                type: "payment_received",
                storeId: appointment.storeId,
                customerName,
                amount: parseFloat(String(input.totalPaid)),
              });

              void logActivityEvent({
                storeId: appointment.storeId,
                eventType: "payment",
                message: `${parseFloat(String(input.totalPaid)).toFixed(2)} payment processed`,
                amount: parseFloat(String(input.totalPaid)),
              });

              // Auto-award loyalty points (1 pt per $1 spent, rounded)
              try {
                const totalPaidNum = parseFloat(String(input.totalPaid));
                if (totalPaidNum > 0) {
                  const full = await storage.getAppointment(appointment.id);
                  const customerId = full?.customerId ?? (full as any)?.customer?.id;
                  if (customerId) {
                    const pointsEarned = Math.round(totalPaidNum);
                    await db.insert(loyaltyTransactions).values({
                      storeId: appointment.storeId,
                      customerId,
                      appointmentId: appointment.id,
                      type: "earn",
                      points: pointsEarned,
                      description: `Earned for appointment #${appointment.id} (${totalPaidNum.toFixed(2)})`,
                    });
                    const [cust] = await db.select({ loyaltyPoints: clients.loyaltyPoints })
                      .from(clients).where(eq(clients.id, customerId)).limit(1);
                    const newTotal = (cust?.loyaltyPoints ?? 0) + pointsEarned;
                    await db.update(clients).set({ loyaltyPoints: newTotal }).where(eq(clients.id, customerId));
                    console.log(`[Loyalty] Awarded ${pointsEarned} pts to customer ${customerId}`);
                  }
                }
              } catch (loyaltyErr) {
                console.error("[Loyalty] Auto-earn error:", loyaltyErr);
              }
            }

            // Always rotate the turn queue on any completion — paid or not.
            if (appointment.staffId && appointment.storeId) {
              const paidAmount = input.totalPaid ? parseFloat(String(input.totalPaid)) : 0;
              const tipAmt = input.tipAmount
                ? parseFloat(String(input.tipAmount))
                : (appointment.tipAmount ? parseFloat(String(appointment.tipAmount)) : 0);
              await handleTurnCheckout(appointment.storeId, appointment.staffId, paidAmount, tipAmt);
            }
          } else {
            // Appointment was already completed by the Terminal capture endpoint.
            // Only run queue rotation if a staff member is assigned — it is
            // idempotent and needed to keep the turn queue accurate.
            if (appointment.staffId && appointment.storeId) {
              const paidAmount = input.totalPaid ? parseFloat(String(input.totalPaid)) : 0;
              const tipAmt = input.tipAmount
                ? parseFloat(String(input.tipAmount))
                : (appointment.tipAmount ? parseFloat(String(appointment.tipAmount)) : 0);
              await handleTurnCheckout(appointment.storeId, appointment.staffId, paidAmount, tipAmt);
            }
          }
        } else if (input.status === "cancelled") {
          broadcastNotification({
            type: "appointment_cancelled",
            storeId: appointment.storeId,
            customerName,
            serviceName,
            staffId: appointment.staffId ?? undefined,
            appointmentDate: appointment.date ? new Date(appointment.date).toISOString() : undefined,
          });

          // Auto-trigger cancellation recovery: find fill candidates and SMS top match
          setImmediate(async () => {
            try {
              const { getCancellationRecoveryCandidates, sendCancellationRecoverySms } = await import("./intelligence/cancellation-recovery");
              const candidates = await getCancellationRecoveryCandidates(appointment.storeId!, appointment.id);
              const topCandidate = candidates.find((c) => c.customerPhone && c.priority === "high") || candidates[0];
              if (topCandidate?.customerPhone) {
                await sendCancellationRecoverySms(appointment.storeId!, topCandidate.customerId, topCandidate.suggestedMessage, appointment.id);
                console.log(`[intelligence] Auto-fill SMS sent to customer ${topCandidate.customerId} for cancelled appt ${appointment.id}`);
              }
            } catch (err: any) {
              console.error("[intelligence] Auto-fill trigger error:", err.message);
            }
          });
        } else if (input.status === "no-show" || input.status === "no_show") {
          // Auto-trigger no-show win-back
          setImmediate(async () => {
            try {
              const { sendNoShowWinback } = await import("./intelligence/no-show-winback");
              const customerId = full?.customerId ?? (full as any)?.customer?.id;
              if (customerId) {
                await sendNoShowWinback(appointment.storeId!, customerId, appointment.id);
                console.log(`[intelligence] No-show win-back triggered for customer ${customerId}`);
              }
            } catch (err: any) {
              console.error("[intelligence] No-show win-back error:", err.message);
            }
            // Notify any kiosk walk-in waitlist customer of the freed slot
            try {
              await notifyKioskNoShowWaitlist(appointment.storeId!, appointment);
            } catch (err: any) {
              console.error("[kiosk/noshow-waitlist] manual notify error:", err.message);
            }
          });
        }

        // === FIX: Consideration Lock on calendar appointment start ===
        // When a calendar appointment changes to 'started', remove the tech from the
        // active deque and add to lockedStaffIds — exactly what walk-in assignment does.
        // This ensures the Turn popup grid shows the correct queue order (a tech who is
        // currently serving a client should NOT appear as "#1 Next").
        // The lock is released automatically by handleTurnCheckout when completed,
        // or by the block below when cancelled/no-showed.
        if (input.status === "started" && appointment.staffId) {
          try {
            const freshPrefs = await getTurnPreferences(appointment.storeId);
            const deque: number[] = Array.isArray(freshPrefs.dequeOrder)
              ? (freshPrefs.dequeOrder as any[]).map(Number).filter(Number.isFinite)
              : [];
            const lockedIds: number[] = Array.isArray(freshPrefs.lockedStaffIds)
              ? (freshPrefs.lockedStaffIds as any[]).map(Number).filter(Number.isFinite)
              : [];
            await saveTurnPreferences(appointment.storeId, {
              dequeOrder: deque.filter((id) => id !== appointment.staffId),
              lockedStaffIds: [...new Set([...lockedIds, appointment.staffId!])],
            });
            console.log(`[turn] Calendar start: Consideration Lock applied for staff ${appointment.staffId} (apt ${appointment.id})`);
          } catch (lockErr) {
            console.error("[turn] Failed to apply consideration lock on calendar start:", lockErr);
          }
        }

        // === FIX: Release Consideration Lock on cancellation or no-show ===
        // If an appointment was marked 'started' (tech got locked) and is then cancelled
        // or no-showed, the tech would remain trapped in lockedStaffIds indefinitely.
        // Release them and re-insert at the front of the deque (no revenue = short-turn
        // style — they didn't complete a full service, so they get their spot back).
        if (
          (input.status === "cancelled" || input.status === "no-show" || input.status === "no_show") &&
          appointment.staffId
        ) {
          try {
            const freshPrefs = await getTurnPreferences(appointment.storeId);
            const lockedIds: number[] = Array.isArray(freshPrefs.lockedStaffIds)
              ? (freshPrefs.lockedStaffIds as any[]).map(Number).filter(Number.isFinite)
              : [];
            if (lockedIds.includes(appointment.staffId)) {
              const deque: number[] = Array.isArray(freshPrefs.dequeOrder)
                ? (freshPrefs.dequeOrder as any[]).map(Number).filter(Number.isFinite)
                : [];
              await saveTurnPreferences(appointment.storeId, {
                lockedStaffIds: lockedIds.filter((id) => id !== appointment.staffId),
                // Re-insert at front: no pay was collected, treat as short turn
                dequeOrder: [appointment.staffId!, ...deque.filter((id) => id !== appointment.staffId!)],
              });
              console.log(`[turn] Calendar cancel/no-show: Lock released for staff ${appointment.staffId}, restored to front of deque`);
            }
          } catch (lockErr) {
            console.error("[turn] Failed to release consideration lock on cancel/no-show:", lockErr);
          }
        }

        // Detect reschedule: date or startTime changed, and the appointment belongs to a staff member
        const isReschedule =
          (input.date !== undefined || (req.body as any)?.startTime !== undefined) &&
          input.status !== "cancelled" &&
          appointment.staffId;
        if (isReschedule) {
          const apptDate = input.date
            ? new Date(input.date as any).toISOString()
            : (appointment.date ? new Date(appointment.date).toISOString() : undefined);
          broadcastNotification({
            type: "appointment_rescheduled",
            storeId: appointment.storeId,
            customerName,
            serviceName,
            staffId: appointment.staffId ?? undefined,
            appointmentDate: apptDate,
          });
        }

        broadcastTurnEligibilityChanged(appointment.storeId);
        broadcastSyncEvent({ type: "booking_updated", storeId: appointment.storeId, appointmentId: appointment.id, changes: Object.keys(input) });
        triggerDashboardBroadcast(appointment.storeId);

        // SSE push for status changes (complements the WS broadcast above).
        if (input.status) {
          broadcastAppointmentStatus({
            appointmentId: appointment.id,
            storeId: appointment.storeId,
            status: input.status as string,
            source: "manual",
          });
        }
      }

      return res.json(appointment);
    } catch (error) {
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  app.delete(api.appointments.delete.path, isAuthenticated, async (req, res) => {
    const appointmentId = Number(req.params.id);
    if (!Number.isFinite(appointmentId)) {
      return res.status(400).json({ message: "Invalid appointment id" });
    }

    const appointment = await storage.getAppointment(appointmentId);
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });

    // Verify the appointment belongs to the requesting user's store
    const sessionStoreId = await resolveSessionStoreId(req);
    if (sessionStoreId && appointment.storeId !== sessionStoreId) {
      return res.status(403).json({ message: "Access denied" });
    }

    await storage.deleteAppointment(appointmentId);

    // Release consideration lock if the deleted appointment belonged to a locked tech.
    // Without this, deleting a walk-in appointment left the tech stuck in "Busy" forever
    // because handleTurnCheckout is only triggered by the PATCH status→completed path.
    if (appointment?.staffId && appointment?.storeId) {
      try {
        const prefs = await getTurnPreferences(appointment.storeId);
        const lockedIds: number[] = Array.isArray(prefs.lockedStaffIds)
          ? (prefs.lockedStaffIds as any[]).map(Number).filter(Number.isFinite)
          : [];
        if (lockedIds.includes(appointment.staffId)) {
          const deque: number[] = Array.isArray(prefs.dequeOrder)
            ? (prefs.dequeOrder as any[]).map(Number).filter(Number.isFinite)
            : [];
          await saveTurnPreferences(appointment.storeId, {
            lockedStaffIds: lockedIds.filter((id) => id !== appointment.staffId),
            // Re-insert at front: appointment was never completed, treat as short turn
            dequeOrder: [appointment.staffId!, ...deque.filter((id) => id !== appointment.staffId!)],
          });
          console.log(`[turn] Appointment deleted: lock released for staff ${appointment.staffId}, restored to front of deque`);
        }
      } catch (lockErr) {
        console.error("[turn] Failed to release lock on appointment delete:", lockErr);
      }
    }

    broadcastTurnEligibilityChanged(appointment?.storeId);
    if (appointment?.storeId) {
      broadcastSyncEvent({ type: "booking_deleted", storeId: appointment.storeId, appointmentId });
      triggerDashboardBroadcast(appointment.storeId);
    }
    return res.status(204).end();
  });

  // === PRODUCTS ===
  app.get(api.products.list.path, isAuthenticated, async (req, res) => {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(403).json({ message: "No store context" });
    const products = await storage.getProducts(storeId);
    return res.json(products);
  });

  app.post(api.products.create.path, isAuthenticated, async (req, res) => {
    try {
      const sessionStoreId = await resolveSessionStoreId(req);
      if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
      const input = insertProductSchema.parse({ ...req.body, storeId: sessionStoreId });
      const product = await storage.createProduct(input);
      triggerTranslation({ entityType: "product", entityId: product.id, name: product.name });
      return res.status(201).json(product);
    } catch (error) {
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  app.patch(api.products.update.path, isAuthenticated, async (req, res) => {
    try {
      const sessionStoreId = await resolveSessionStoreId(req);
      if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
      const existing = await storage.getProduct(Number(req.params.id));
      if (!existing) return res.status(404).json({ message: "Product not found" });
      if (existing.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });
      const input = insertProductSchema.partial().parse(req.body);
      const product = await storage.updateProduct(Number(req.params.id), input);
      if (!product) return res.status(404).json({ message: "Product not found" });
      if (input.name) triggerTranslation({ entityType: "product", entityId: product.id, name: product.name });
      // Owner Feed: fire once when stock crosses from above-threshold to
      // at-or-below-threshold (not on every save while already low), so a
      // low-stock event appears the moment it actually becomes a problem.
      // Threshold defaults to 0 when unset on either row so a null threshold
      // never gets coerced into a false "crossing" via JS numeric comparison.
      if (typeof input.stock === "number" && product.stock != null) {
        const newThreshold = product.lowStockThreshold ?? 0;
        const oldThreshold = existing.lowStockThreshold ?? 0;
        const wasAboveThreshold = existing.stock == null || existing.stock > oldThreshold;
        const isNowAtOrBelowThreshold = product.stock <= newThreshold;
        if (wasAboveThreshold && isNowAtOrBelowThreshold) {
          void logActivityEvent({
            storeId: sessionStoreId,
            eventType: "low_stock",
            message: `${product.name} is low on stock (${product.stock} left)`,
          });
        }
      }
      return res.json(product);
    } catch (error) {
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  app.delete(api.products.delete.path, isAuthenticated, async (req, res) => {
    const sessionStoreId = await resolveSessionStoreId(req);
    if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
    const existing = await storage.getProduct(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "Product not found" });
    if (existing.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });
    await storage.deleteProduct(Number(req.params.id));
    return res.status(204).end();
  });

  // === CALENDAR SETTINGS ===
  app.get(api.calendarSettings.get.path, isAuthenticated, async (req, res) => {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(403).json({ message: "No store context" });
    const settings = await storage.getCalendarSettings(storeId);
    return res.json(settings || null);
  });

  app.put(api.calendarSettings.upsert.path, isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });
       // The Zod schema extensions below previously triggered TypeScript errors about a missing
       // `_zod` property on the generated schema types. Those errors arise from the way the
       // project's custom Zod‑to‑TS typings expect a `_zod` field on schema objects. To satisfy the
       // compiler without altering runtime behaviour, we cast the extended schema to `any` before
       // parsing. This retains the validation logic while silencing the type‑checking issue.
       const validatedInput = (insertCalendarSettingsSchema
         .omit({ storeId: true })
         .partial()
         .extend({
           startOfWeek: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]).optional() as any,
            timeSlotInterval: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20), z.literal(30), z.literal(60)]).optional() as any,
            nonWorkingHoursDisplay: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional() as any,
         }) as any)
         .parse(req.body);
      const settings = await storage.upsertCalendarSettings(storeId, validatedInput);
      return res.json(settings);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.issues[0].message });
      } else {
        return res.status(400).json({ message: "Invalid input" });
      }
    }
  });

  // === FEATURE FLAGS ===

  app.get("/api/settings/features", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });
      const [row] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, storeId));
      const prefs = safeParsePreferences(row?.preferences as string | undefined);
      const f = prefs.features && typeof prefs.features === "object" ? prefs.features : {};
      // Also mirror posEnabled from the locations table as the source of truth
      const [loc] = await db.select({ posEnabled: locations.posEnabled }).from(locations).where(eq(locations.id, storeId));
      const ks2 = prefs.kioskSettings && typeof prefs.kioskSettings === "object" ? prefs.kioskSettings : {};
      return res.json({
        turnSystem:          f.turnSystem          !== undefined ? !!f.turnSystem          : true,
        timeclock:           f.timeclock           !== undefined ? !!f.timeclock           : true,
        waitlist:            f.waitlist            !== undefined ? !!f.waitlist            : true,
        pos:                 loc?.posEnabled       !== undefined ? !!loc.posEnabled        : true,
        rewardPoints:        f.rewardPoints        !== undefined ? !!f.rewardPoints        : true,
        autoClockOutFloor:   f.autoClockOutFloor   !== undefined ? String(f.autoClockOutFloor) : "01:00",
        kioskEnabled:        (ks2 as any).kioskEnabled !== false,
        staffPortalEnabled:  f.staffPortalEnabled  !== undefined ? !!f.staffPortalEnabled  : true,
      });
    } catch (error) {
      console.error("Error fetching feature flags:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/settings/features", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });

      const { turnSystem, timeclock, waitlist, pos, rewardPoints, autoClockOutFloor, kioskEnabled, staffPortalEnabled } = req.body as Record<string, unknown>;

      // POS flag lives in the locations table (existing column)
      if (pos !== undefined) {
        await db.update(locations).set({ posEnabled: !!pos }).where(eq(locations.id, storeId));
      }

      // All other flags live in store_settings.preferences.features
      const [existing] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, storeId));
      const currentPrefs = safeParsePreferences(existing?.preferences as string | undefined);
      const currentFeatures = currentPrefs.features && typeof currentPrefs.features === "object" ? currentPrefs.features : {};
      const nextFeatures: Record<string, unknown> = { ...currentFeatures };
      if (turnSystem          !== undefined) nextFeatures.turnSystem         = !!turnSystem;
      if (timeclock           !== undefined) nextFeatures.timeclock          = !!timeclock;
      if (waitlist            !== undefined) nextFeatures.waitlist           = !!waitlist;
      if (rewardPoints        !== undefined) nextFeatures.rewardPoints       = !!rewardPoints;
      if (autoClockOutFloor   !== undefined) nextFeatures.autoClockOutFloor  = String(autoClockOutFloor);
      if (staffPortalEnabled  !== undefined) nextFeatures.staffPortalEnabled = !!staffPortalEnabled;

      // kioskEnabled lives in kioskSettings (not features), update it there
      const existingKs2 = currentPrefs.kioskSettings && typeof currentPrefs.kioskSettings === "object" ? currentPrefs.kioskSettings : {};
      const nextKs = kioskEnabled !== undefined ? { ...(existingKs2 as object), kioskEnabled: !!kioskEnabled } : existingKs2;

      const preferences = JSON.stringify({ ...currentPrefs, features: nextFeatures, kioskSettings: nextKs });
      if (existing) {
        await db.update(storeSettings).set({ preferences, updatedAt: new Date() }).where(eq(storeSettings.storeId, storeId));
      } else {
        await db.insert(storeSettings).values({ storeId, preferences });
      }

      // Read back the final state (including pos from locations) and return it so the
      // frontend can update its cache directly without relying on a secondary GET fetch.
      const [loc] = await db.select({ posEnabled: locations.posEnabled }).from(locations).where(eq(locations.id, storeId));
      return res.json({
        turnSystem:          nextFeatures.turnSystem         !== undefined ? !!nextFeatures.turnSystem         : true,
        timeclock:           nextFeatures.timeclock          !== undefined ? !!nextFeatures.timeclock          : true,
        waitlist:            nextFeatures.waitlist           !== undefined ? !!nextFeatures.waitlist           : true,
        pos:                 loc?.posEnabled                !== undefined ? !!loc.posEnabled                 : (pos !== undefined ? !!pos : true),
        rewardPoints:        nextFeatures.rewardPoints      !== undefined ? !!nextFeatures.rewardPoints      : true,
        autoClockOutFloor:   nextFeatures.autoClockOutFloor  !== undefined ? String(nextFeatures.autoClockOutFloor) : "01:00",
        kioskEnabled:        (nextKs as any).kioskEnabled !== false,
        staffPortalEnabled:  nextFeatures.staffPortalEnabled !== undefined ? !!nextFeatures.staffPortalEnabled : true,
      });
    } catch (error) {
      console.error("Error saving feature flags:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // === PERMISSION LEVELS ===
  const DEFAULT_LEVEL1 = [
    "appointments.viewOwn","appointments.edit","appointments.cancel",
    "customers.view","customers.viewContact","pricing.view",
    "pos.use","checkout.clients","discounts.apply","commissions.viewOwn","waitlist.access",
  ];
  const DEFAULT_LEVEL2 = [
    ...DEFAULT_LEVEL1,
    "appointments.viewAll","appointments.delete","customers.edit","payments.view",
    "reports.view","services.manage","marketing.reviewRequests","commissions.viewAll","cashDrawer.view",
  ];
  const DEFAULT_LEVEL3 = [
    ...DEFAULT_LEVEL2,
    "appointments.overrideRules","customers.delete","customers.export","customers.import",
    "products.manage","pricing.edit","inventory.manage","refunds.issue","cashDrawer.close",
    "reports.financial","reports.export","marketing.sms","marketing.email",
    "giftCards.manage","loyalty.manage","intakeForms.manage",
    "staff.manage","staff.invite","store.settings",
  ];

  app.get("/api/settings/permission-levels", isAuthenticated, async (req, res) => {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(403).json({ message: "No store context" });
    const [row] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, storeId));
    const prefs = safeParsePreferences(row?.preferences as string | undefined);
    const pl = prefs.permissionLevels && typeof prefs.permissionLevels === "object"
      ? prefs.permissionLevels as Record<string, string[]>
      : {};
    return res.json({
      level1: Array.isArray(pl.level1) ? pl.level1 : DEFAULT_LEVEL1,
      level2: Array.isArray(pl.level2) ? pl.level2 : DEFAULT_LEVEL2,
      level3: Array.isArray(pl.level3) ? pl.level3 : DEFAULT_LEVEL3,
    });
  });

  app.patch("/api/settings/permission-levels", isAuthenticated, async (req, res) => {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(403).json({ message: "No store context" });
    const { level1, level2, level3 } = req.body as { level1?: string[]; level2?: string[]; level3?: string[] };
    const [existing] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, storeId));
    const currentPrefs = safeParsePreferences(existing?.preferences as string | undefined);
    const currentLevels = currentPrefs.permissionLevels && typeof currentPrefs.permissionLevels === "object"
      ? currentPrefs.permissionLevels as Record<string, string[]>
      : {};
    const nextLevels = { ...currentLevels };
    if (Array.isArray(level1)) nextLevels.level1 = level1;
    if (Array.isArray(level2)) nextLevels.level2 = level2;
    if (Array.isArray(level3)) nextLevels.level3 = level3;
    const preferences = JSON.stringify({ ...currentPrefs, permissionLevels: nextLevels });
    if (existing) {
      await db.update(storeSettings).set({ preferences, updatedAt: new Date() }).where(eq(storeSettings.storeId, storeId));
    } else {
      await db.insert(storeSettings).values({ storeId, preferences });
    }
    return res.json({ ok: true });
  });

  app.patch("/api/staff/:id/permission-level", isAuthenticated, async (req, res) => {
    const sessionStoreId = await resolveSessionStoreId(req);
    if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
    const staffId = Number(req.params.id);
    if (!staffId) return res.status(400).json({ message: "invalid staffId" });
    const existing = await storage.getStaffMember(staffId);
    if (!existing) return res.status(404).json({ message: "Staff not found" });
    if (existing.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });
    const { level } = req.body as { level: string };
    if (!["level1", "level2", "level3", "owner"].includes(level)) {
      return res.status(400).json({ message: "invalid level" });
    }
    const [row] = await db.select({ permissions: staff.permissions }).from(staff).where(eq(staff.id, staffId));
    const current: Record<string, unknown> = (row?.permissions as Record<string, unknown>) ?? {};
    const updated = { ...current, _permissionLevel: level } as unknown as Record<string, boolean>;
    await db.update(staff).set({ permissions: updated }).where(eq(staff.id, staffId));
    return res.json({ ok: true });
  });

  // === Staff Portal: Get Current Active Access Code ===
  app.get("/api/staff/:id/access-code", isAuthenticated, async (req, res) => {
    try {
      const sessionStoreId = await resolveSessionStoreId(req);
      if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
      const staffId = Number(req.params.id);
      if (!staffId) return res.status(400).json({ message: "Invalid staff ID" });
      const existing = await storage.getStaffMember(staffId);
      if (!existing) return res.status(404).json({ message: "Staff member not found" });
      if (existing.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });

      const { rows } = await pool.query(
        `SELECT code, expires_at FROM staff_sms_otps
         WHERE staff_id = $1 AND used_at IS NULL AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [staffId]
      );
      if (rows.length === 0) return res.json({ code: null, expiresAt: null });
      return res.json({ code: rows[0].code, expiresAt: rows[0].expires_at });
    } catch (err: any) {
      console.error("[access-code] Error:", err);
      return res.status(500).json({ message: "Failed to fetch access code" });
    }
  });

  // === Staff Portal: Generate Access Code (manager-facing, no SMS) ===
  app.post("/api/staff/:id/generate-access-code", isAuthenticated, async (req, res) => {
    try {
      const sessionStoreId = await resolveSessionStoreId(req);
      if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
      const staffId = Number(req.params.id);
      if (!staffId) return res.status(400).json({ message: "Invalid staff ID" });
      const existing = await storage.getStaffMember(staffId);
      if (!existing) return res.status(404).json({ message: "Staff member not found" });
      if (existing.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });

      // Invalidate any unused codes for this staff member so the new one is the only valid one
      await pool.query(
        `UPDATE staff_sms_otps SET used_at = NOW() WHERE staff_id = $1 AND used_at IS NULL`,
        [staffId]
      );

      // Generate 8-digit code, valid 24 hours (long enough to hand to staff member)
      const code = Math.floor(10000000 + Math.random() * 90000000).toString();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const phone = existing.phone ?? "manager-generated";
      await pool.query(
        `INSERT INTO staff_sms_otps (staff_id, phone, code, expires_at) VALUES ($1, $2, $3, $4)`,
        [staffId, phone, code, expiresAt]
      );

      console.log(`[generate-access-code] Generated code for staffId=${staffId} by manager (store=${sessionStoreId})`);
      return res.json({ code, expiresAt: expiresAt.toISOString() });
    } catch (err: any) {
      console.error("[generate-access-code] Error:", err);
      return res.status(500).json({ message: "Failed to generate access code" });
    }
  });

  // === CASH DRAWER ===
  app.get(api.cashDrawer.sessions.path, isAuthenticated, async (req, res) => {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(403).json({ message: "No store context" });
    const sessions = await storage.getCashDrawerSessions(storeId);
    return res.json(sessions);
  });

  app.get(api.cashDrawer.open.path, isAuthenticated, async (req, res) => {
    const storeId = await resolveSessionStoreId(req);
    if (!storeId) return res.status(403).json({ message: "No store context" });
    const session = await storage.getOpenCashDrawerSession(storeId);
    return res.json(session || null);
  });

  app.get(api.cashDrawer.get.path, isAuthenticated, async (req, res) => {
    const sessionStoreId = await resolveSessionStoreId(req);
    if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
    const session = await storage.getCashDrawerSession(Number(req.params.id));
    if (!session) return res.status(404).json({ message: "Session not found" });
    if (session.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });
    return res.json(session);
  });

  app.post(api.cashDrawer.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.cashDrawer.create.input.parse(req.body);

      const existing = await storage.getOpenCashDrawerSession(input.storeId);
      if (existing) {
        return res.status(409).json({ message: "A drawer session is already open for this store" });
      }

      // If a denomination breakdown was provided, compute the opening balance from it
      // server-side so the staff cannot fudge the numeric total.
      const denomValues: Record<string, number> = {
        "100": 100, "50": 50, "20": 20, "10": 10, "5": 5, "2": 2, "1": 1,
        "0.25": 0.25, "0.10": 0.10, "0.05": 0.05, "0.01": 0.01,
      };
      let computedOpening: string | null = null;
      if (input.openingDenominationBreakdown) {
        try {
          const counts = JSON.parse(input.openingDenominationBreakdown) as Record<string, number>;
          let total = 0;
          for (const [k, c] of Object.entries(counts)) {
            const v = denomValues[k];
            if (v != null && typeof c === "number" && c > 0) {
              total += Math.round(v * c * 100);
            }
          }
          computedOpening = (total / 100).toFixed(2);
        } catch {
          computedOpening = null;
        }
      }
      const openingBalance = computedOpening ?? input.openingBalance ?? "0.00";

      // Compare against the most recent closed session for the store. If the prior
      // closing balance differs from this opening count, flag for manager review.
      const allSessions = await storage.getCashDrawerSessions(input.storeId);
      const lastClosed = allSessions
        .filter(s => s.status === "closed")
        .sort((a, b) => {
          const at = a.closedAt ? new Date(a.closedAt).getTime() : 0;
          const bt = b.closedAt ? new Date(b.closedAt).getTime() : 0;
          return bt - at;
        })[0];

      let priorClosingMismatch = false;
      let priorClosingVariance: string | null = null;
      if (lastClosed && lastClosed.closingBalance != null) {
        const priorClose = Number(lastClosed.closingBalance);
        const opening = Number(openingBalance);
        const diff = Math.round((opening - priorClose) * 100) / 100;
        if (Math.abs(diff) >= 0.01) {
          priorClosingMismatch = true;
          priorClosingVariance = diff.toFixed(2);
        }
      }

      const session = await storage.createCashDrawerSession({
        storeId: input.storeId,
        openedAt: new Date(),
        openingBalance,
        openingDenominationBreakdown: input.openingDenominationBreakdown || null,
        priorClosingMismatch,
        priorClosingVariance,
        openedBy: input.openedBy || null,
        status: "open",
      });

      await storage.createDrawerAction({
        sessionId: session.id,
        type: "open_drawer",
        reason: "Shift started",
        performedBy: input.openedBy || null,
        performedAt: new Date(),
      });

      // On initial setup, save the opening balance as the store's target float
      if (input.isInitialSetup) {
        await storage.updateStore(input.storeId, { registerTargetFloat: openingBalance } as any);
      }

      return res.status(201).json(session);
    } catch (error) {
      console.error(error);
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  app.post(api.cashDrawer.close.path, isAuthenticated, async (req, res) => {
    try {
      const sessionStoreId = await resolveSessionStoreId(req);
      if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
      const id = Number(req.params.id);
      const session = await storage.getCashDrawerSession(id);
      if (!session) return res.status(404).json({ message: "Session not found" });
      if (session.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });
      if (session.status === "closed") return res.status(400).json({ message: "Session already closed" });

      const storeAppointments = session.storeId
        ? await storage.getAppointments({ storeId: session.storeId })
        : [];
      const unpaidTickets = storeAppointments.filter((apt) => apt.status === "started");
      if (unpaidTickets.length > 0) {
        return res.status(409).json({
          code: "UNPAID_TICKETS",
          message: `Cannot close the day — ${unpaidTickets.length} booking ticket${unpaidTickets.length === 1 ? "" : "s"} still need${unpaidTickets.length === 1 ? "s" : ""} to be checked out.`,
          unpaidCount: unpaidTickets.length,
          unpaidTickets: unpaidTickets.map((apt) => ({
            id: apt.id,
            customerName: apt.customer ? ((apt.customer as any).name ?? null) : null,
            staffName: apt.staff?.name ?? null,
            serviceName: apt.service?.name ?? null,
            startedAt: apt.startedAt ?? apt.date,
          })),
        });
      }

      const input = api.cashDrawer.close.input.parse(req.body);

      // Compute closing balance server-side from denomination breakdown if provided
      const denomValues: Record<string, number> = {
        "100": 100, "50": 50, "20": 20, "10": 10, "5": 5, "1": 1,
        "0.25": 0.25, "0.10": 0.10, "0.05": 0.05, "0.01": 0.01,
      };
      let computedClosing: string | null = null;
      if (input.denominationBreakdown) {
        try {
          const counts = JSON.parse(input.denominationBreakdown) as Record<string, number>;
          let total = 0;
          for (const [k, c] of Object.entries(counts)) {
            const v = denomValues[k];
            if (v != null && typeof c === "number" && c > 0) {
              total += Math.round(v * c * 100);
            }
          }
          computedClosing = (total / 100).toFixed(2);
        } catch {
          computedClosing = null;
        }
      }
      const finalClosingBalance = computedClosing ?? input.closingBalance ?? "0.00";

      const updated = await storage.updateCashDrawerSession(id, {
        closedAt: new Date(),
        closingBalance: finalClosingBalance,
        denominationBreakdown: input.denominationBreakdown || null,
        reportedCardSales: input.reportedCardSales || null,
        closedBy: input.closedBy || null,
        status: "closed",
        notes: input.notes || null,
      });

      await storage.createDrawerAction({
        sessionId: id,
        type: "close_drawer",
        reason: input.notes || "Day Close",
        performedBy: input.closedBy || null,
        performedAt: new Date(),
      });

      // Auto-open next session when requested (Day Close flow)
      let newSession = null;
      let bankDepositAmount = "0.00";
      if (input.autoOpenNext) {
        const store = await storage.getStore(session.storeId);
        const targetFloat = store && (store as any).registerTargetFloat
          ? Number((store as any).registerTargetFloat)
          : 0;
        const closingBal = Number(finalClosingBalance);
        const bankDeposit = targetFloat > 0
          ? Math.max(0, Math.round((closingBal - targetFloat) * 100) / 100)
          : 0;
        bankDepositAmount = bankDeposit.toFixed(2);
        const nextOpening = Math.max(0, Math.round((closingBal - bankDeposit) * 100) / 100);

        newSession = await storage.createCashDrawerSession({
          storeId: session.storeId,
          openedAt: new Date(),
          openingBalance: nextOpening.toFixed(2),
          openedBy: input.closedBy || null,
          status: "open",
        } as any);

        await storage.createDrawerAction({
          sessionId: newSession.id,
          type: "open_drawer",
          reason: "Auto-opened by Day Close",
          performedBy: input.closedBy || null,
          performedAt: new Date(),
        });
      }

      return res.json({ ...updated, newSession, bankDepositAmount });
    } catch (error) {
      console.error(error);
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  app.post(api.cashDrawer.action.path, isAuthenticated, async (req, res) => {
    try {
      const sessionStoreId = await resolveSessionStoreId(req);
      if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
      const sessionId = Number(req.params.id);
      const session = await storage.getCashDrawerSession(sessionId);
      if (!session) return res.status(404).json({ message: "Session not found" });
      if (session.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });

      const input = api.cashDrawer.action.input.parse(req.body);

      const action = await storage.createDrawerAction({
        sessionId,
        type: input.type,
        amount: input.amount || null,
        reason: input.reason || null,
        performedBy: input.performedBy || null,
        performedAt: new Date(),
      });

      return res.status(201).json(action);
    } catch (error) {
      console.error(error);
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  app.get(api.cashDrawer.discrepancies.path, isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });
      const all = await storage.getCashDrawerSessions(storeId);
      const unresolved = all
        .filter(s => s.priorClosingMismatch && !s.priorClosingResolvedAt)
        .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());
      return res.json(unresolved);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Failed to load discrepancies" });
    }
  });

  app.post(api.cashDrawer.acknowledgeMismatch.path, isAuthenticated, async (req, res) => {
    try {
      const sessionStoreId = await resolveSessionStoreId(req);
      if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
      const id = Number(req.params.id);
      const session = await storage.getCashDrawerSession(id);
      if (!session) return res.status(404).json({ message: "Session not found" });
      if (session.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });
      const input = api.cashDrawer.acknowledgeMismatch.input.parse(req.body);

      const updated = await storage.updateCashDrawerSession(id, {
        priorClosingResolvedBy: input.resolvedBy,
        priorClosingResolvedAt: new Date(),
        priorClosingResolutionNotes: input.resolutionNotes || null,
      });
      return res.json(updated);
    } catch (error) {
      console.error(error);
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  app.get(api.cashDrawer.zReport.path, isAuthenticated, async (req, res) => {
    try {
      const sessionStoreId = await resolveSessionStoreId(req);
      if (!sessionStoreId) return res.status(403).json({ message: "No store context" });
      const id = Number(req.params.id);
      const session = await storage.getCashDrawerSession(id);
      if (!session) return res.status(404).json({ message: "Session not found" });
      if (session.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });

      const from = new Date(session.openedAt);
      const to = session.closedAt ? new Date(session.closedAt) : new Date();

      const allAppointments = await storage.getAppointments({
        from,
        to,
        storeId: session.storeId,
      });

      const completedAppointments = allAppointments.filter(a => a.status === "completed" && a.totalPaid);

      let totalSales = 0;
      let totalTips = 0;
      let totalDiscounts = 0;
      const paymentBreakdown: Record<string, number> = {};

      for (const apt of completedAppointments) {
        const paid = Number(apt.totalPaid) || 0;
        const tip = Number(apt.tipAmount) || 0;
        const disc = Number(apt.discountAmount) || 0;
        totalSales += paid;
        totalTips += tip;
        totalDiscounts += disc;

        if (apt.paymentMethod) {
          const parts = apt.paymentMethod.split(",");
          for (const part of parts) {
            const [method, amtStr] = part.split(":");
            const amt = Number(amtStr) || paid;
            const key = method.trim().toLowerCase();
            paymentBreakdown[key] = (paymentBreakdown[key] || 0) + amt;
          }
        }
      }

      let cashIn = 0;
      let cashOut = 0;
      for (const action of session.actions || []) {
        if (action.type === "cash_in" || action.type === "paid_in") {
          cashIn += Number(action.amount) || 0;
        } else if (action.type === "cash_out" || action.type === "paid_out") {
          cashOut += Number(action.amount) || 0;
        }
      }

      const openingBal = Number(session.openingBalance) || 0;
      const cashFromSales = paymentBreakdown["cash"] || 0;
      const expectedCash = openingBal + cashFromSales + cashIn - cashOut;

      return res.json({
        session,
        totalSales: Math.round(totalSales * 100) / 100,
        totalTips: Math.round(totalTips * 100) / 100,
        totalDiscounts: Math.round(totalDiscounts * 100) / 100,
        transactionCount: completedAppointments.length,
        paymentBreakdown,
        cashIn: Math.round(cashIn * 100) / 100,
        cashOut: Math.round(cashOut * 100) / 100,
        expectedCash: Math.round(expectedCash * 100) / 100,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // === BUSINESS DAY (timezone-aware cash reconciliation state machine) ===
  app.get(api.businessDay.today.path, isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });
      const store = await storage.getStore(storeId);
      const timezone = store?.timezone || "UTC";

      const today = await getOrCreateTodayBusinessDay(storeId, timezone);
      const previousUnreconciled = await getPendingReconciliation(storeId, today.date);

      return res.json({
        today,
        previousUnreconciled: previousUnreconciled || null,
        timezone,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Failed to load Business Day" });
    }
  });

  app.get(api.businessDay.get.path, isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });
      const day = await storage.getBusinessDay(Number(req.params.id));
      if (!day) return res.status(404).json({ message: "Business Day not found" });
      if (day.storeId !== storeId) return res.status(403).json({ message: "Forbidden" });
      return res.json(day);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Failed to load Business Day" });
    }
  });

  // "Open Business Day Cash Drawer" — pure UI + state transition. Does not
  // compute or assume any financial values beyond the opening float, which
  // is either the store's configured default or a manager-confirmed override.
  app.post(api.businessDay.open.path, isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });
      const id = Number(req.params.id);
      const day = await storage.getBusinessDay(id);
      if (!day) return res.status(404).json({ message: "Business Day not found" });
      if (day.storeId !== storeId) return res.status(403).json({ message: "Forbidden" });
      if (day.status === "open") return res.status(409).json({ message: "Business Day is already open" });
      if (day.status === "reconciled") return res.status(409).json({ message: "Business Day already reconciled" });

      // Non-negotiable: cannot open today's drawer while a prior day is unreconciled.
      const pending = await getPendingReconciliation(storeId, day.date);
      if (pending) {
        return res.status(409).json({ message: `Business Day ${pending.date} must be reconciled first` });
      }

      const input = api.businessDay.open.input.parse(req.body);
      const store = await storage.getStore(storeId);
      const defaultFloat = store && (store as any).registerTargetFloat ? String((store as any).registerTargetFloat) : "0.00";
      const openingFloat = input.openingFloat ?? defaultFloat;

      const updated = await storage.updateBusinessDay(id, {
        status: "open",
        openingFloat,
        openedAt: new Date(),
        openedBy: input.openedBy || null,
      });

      await storage.createBusinessDayAction({
        businessDayId: id,
        type: "BUSINESS_DAY_OPENED",
        amount: openingFloat,
        reason: "Business Day opened",
        performedBy: input.openedBy || null,
        performedAt: new Date(),
      });

      return res.json(updated);
    } catch (error) {
      console.error(error);
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  app.post(api.businessDay.reconcile.path, isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });
      const id = Number(req.params.id);
      const day = await storage.getBusinessDay(id);
      if (!day) return res.status(404).json({ message: "Business Day not found" });
      if (day.storeId !== storeId) return res.status(403).json({ message: "Forbidden" });
      if (day.status === "reconciled") return res.status(400).json({ message: "Business Day already reconciled" });
      if (day.status === "not_started") return res.status(400).json({ message: "Business Day was never opened" });

      const input = api.businessDay.reconcile.input.parse(req.body);
      const store = await storage.getStore(storeId);
      const timezone = store?.timezone || "UTC";

      const totals = await computeBusinessDayTotals(day, timezone);
      const countedCash = Number(input.countedCash) || 0;
      const overShortAmount = Math.round((countedCash - totals.expectedCash) * 100) / 100;

      const updated = await storage.updateBusinessDay(id, {
        status: "reconciled",
        expectedCash: totals.expectedCash.toFixed(2),
        countedCash: countedCash.toFixed(2),
        cashSales: totals.cashSales.toFixed(2),
        cardSales: totals.cardSales.toFixed(2),
        tips: totals.tips.toFixed(2),
        overShortAmount: overShortAmount.toFixed(2),
        denominationBreakdown: input.denominationBreakdown || null,
        reconciledAt: new Date(),
        reconciledBy: input.reconciledBy || null,
        notes: input.notes || null,
      });

      await storage.createBusinessDayAction({
        businessDayId: id,
        type: "CASH_COUNT_SUBMITTED",
        amount: countedCash.toFixed(2),
        reason: `Over/short: ${overShortAmount >= 0 ? "+" : ""}${overShortAmount.toFixed(2)}`,
        performedBy: input.reconciledBy || null,
        performedAt: new Date(),
      });
      await storage.createBusinessDayAction({
        businessDayId: id,
        type: "BUSINESS_DAY_RECONCILED",
        reason: input.notes || null,
        performedBy: input.reconciledBy || null,
        performedAt: new Date(),
      });

      return res.json(updated);
    } catch (error) {
      console.error(error);
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  app.post(api.businessDay.cashAction.path, isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });
      const id = Number(req.params.id);
      const day = await storage.getBusinessDay(id);
      if (!day) return res.status(404).json({ message: "Business Day not found" });
      if (day.storeId !== storeId) return res.status(403).json({ message: "Forbidden" });
      if (day.status !== "open") return res.status(400).json({ message: "Business Day must be open to record cash movements" });

      const input = api.businessDay.cashAction.input.parse(req.body);
      const action = await storage.createBusinessDayAction({
        businessDayId: id,
        type: input.type,
        amount: input.amount,
        reason: input.reason || null,
        performedBy: input.performedBy || null,
        performedAt: new Date(),
      });

      return res.status(201).json(action);
    } catch (error) {
      console.error(error);
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  app.post("/api/onboarding", isAuthenticated, async (req, res) => {
    try {
      console.log("Onboarding: Starting process for user:", (req.session as any).userId);
      const userId = (req.session as any).userId;

      const normalizeOptionalString = (value: unknown) => {
        if (typeof value !== "string") return value;
        const trimmed = value.trim();
        return trimmed.length === 0 ? undefined : trimmed;
      };

      const [currentUser] = await db.select().from(users).where(eq(users.id, userId));
      if (currentUser?.onboardingCompleted) {
        console.log("Onboarding: User already completed onboarding");
        const { password: _, ...safeUser } = currentUser;
        // Return their existing store so the client can proceed
        const existingStores = await db.select().from(locations).where(eq(locations.userId, userId));
        const existingStore = existingStores[0] ?? null;
        const website = existingStore?.bookingSlug
          ? await ensureBloomWebsite(existingStore.id, existingStore.name, existingStore.bookingSlug)
          : null;
        return res.json({ store: existingStore, user: safeUser, website });
      }

      // Guard: user has a store but onboardingCompleted was never set (partial prior onboarding).
      // We must NOT silently drop businessHours/staff in this case — process them against the
      // existing store, otherwise hours submitted on a retry/double-submit are lost.
      const priorStores = await db.select().from(locations).where(eq(locations.userId, userId));
      if (priorStores.length > 0) {
        console.log(
          "Onboarding: User already has a store, recovering partial onboarding for store:",
          priorStores[0].id,
          "- hours present:", Array.isArray(req.body?.businessHours) ? req.body.businessHours.length : 0,
          "- staff present:", Array.isArray(req.body?.staff) ? req.body.staff.length : 0,
        );
        const existingStore = priorStores[0];
        const recoverySlug = existingStore.bookingSlug
          ?? await chooseOnboardingSlug(
            typeof req.body?.bookingSlug === "string" ? req.body.bookingSlug : existingStore.name,
            existingStore.id,
          );
        if (existingStore.bookingSlug !== recoverySlug) {
          const updatedRecoveryStore = await storage.updateStore(existingStore.id, { bookingSlug: recoverySlug });
          if (updatedRecoveryStore) Object.assign(existingStore, updatedRecoveryStore);
        }
        const recoveryWebsite = await ensureBloomWebsite(existingStore.id, existingStore.name, recoverySlug);

        // Best-effort validation of just the hours/staff payload so a retry can still save them.
        const recoverySchema = z.object({
          businessHours: z.array(z.object({
            dayOfWeek: z.number().min(0).max(6),
            openTime: z.string(),
            closeTime: z.string(),
            isClosed: z.boolean(),
          })).optional(),
          staff: z.array(z.object({
            name: z.string().min(1),
            color: z.string().optional(),
          })).optional(),
        });
        const recovery = recoverySchema.safeParse(req.body ?? {});
        const hoursData = recovery.success ? recovery.data.businessHours : undefined;
        const staffData = recovery.success ? recovery.data.staff : undefined;

        // Save hours only if none exist yet for this store (don't clobber later edits).
        if (hoursData && hoursData.length > 0) {
          const existingHours = await db
            .select()
            .from(businessHours)
            .where(eq(businessHours.storeId, existingStore.id));
          if (existingHours.length === 0) {
            console.log("Onboarding recovery: saving", hoursData.length, "business hours");
            await storage.setBusinessHours(existingStore.id, hoursData.map(h => ({
              storeId: existingStore.id,
              dayOfWeek: h.dayOfWeek,
              openTime: h.openTime,
              closeTime: h.closeTime,
              isClosed: h.isClosed,
            })));
          } else {
            console.log("Onboarding recovery: store already has business hours, skipping");
          }
        }

        // Create staff only if the store has none yet (avoid duplicates on retry).
        if (staffData && staffData.length > 0) {
          const existingStaff = await db.select().from(staff).where(eq(staff.storeId, existingStore.id));
          if (existingStaff.length === 0) {
            console.log("Onboarding recovery: creating", staffData.length, "staff members");
            for (const s of staffData) {
              const newStaff = await storage.createStaff({
                name: s.name,
                color: s.color || "#3b82f6",
                storeId: existingStore.id,
              });
              if (hoursData && hoursData.length > 0) {
                const availabilityRules = hoursData
                  .filter(h => !h.isClosed)
                  .map(h => ({
                    staffId: newStaff.id,
                    dayOfWeek: h.dayOfWeek,
                    startTime: h.openTime,
                    endTime: h.closeTime,
                  }));
                if (availabilityRules.length > 0) {
                  await storage.setStaffAvailability(newStaff.id, availabilityRules);
                }
              }
              // Auto-create linked contractor record for payouts.
              const nameParts = (newStaff.name ?? "").trim().split(/\s+/).filter(Boolean);
              await db.insert(contractors).values({
                name: newStaff.name ?? "Staff Member",
                storeId: existingStore.id,
                staffId: newStaff.id,
                firstName: nameParts[0] ?? "Staff",
                lastName: nameParts.slice(1).join(" ") || "Member",
                email: newStaff.email ?? null,
                role: (newStaff as any).employmentType ?? "stylist",
                commissionRate: newStaff.commissionRate ?? "0",
                productCommissionRate: "0",
                payoutMethod: "ach",
                taxClassification: "individual",
                isActive: true,
              });
            }
          } else {
            console.log("Onboarding recovery: store already has staff, skipping");
          }
        }

        await db.update(users).set({ onboardingCompleted: true }).where(eq(users.id, userId));
        const [updatedUser] = await db.select().from(users).where(eq(users.id, userId));
        const { password: _, ...safeUser } = updatedUser;
        return res.json({ store: existingStore, user: safeUser, website: recoveryWebsite });
      }

      console.log("Onboarding: Validating request body:", req.body);
      const onboardingSchema = z.object({
        businessType: z.enum([
          "Hair Salon", "Nail Salon", "Spa", "Barbershop",
          "Esthetician", "Pet Groomer", "Tattoo Studio", "Other",
        ]),
        businessName: z.string().min(1).max(100),
        email: z.string().email().optional().or(z.literal('')),
        timezone: z.string().min(1).default("America/New_York"),
        address: z.preprocess(
          normalizeOptionalString,
          z
            .string()
            .max(200)
            .refine((value) => !/[;'"`]/.test(value), "Address contains invalid characters")
            .refine((value) => !/--|\/\*/.test(value), "Address contains invalid characters")
            .refine((value) => /^[a-zA-Z0-9\s.,#\-\/]*$/.test(value), "Address contains invalid characters")
        ).optional(),
        city: z.preprocess(
          normalizeOptionalString,
          z.string().max(100).regex(/^[a-zA-Z\s]+$/, "City can only contain letters and spaces")
        ).optional(),
        state: z.preprocess(
          normalizeOptionalString,
          z.enum([
            "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
            "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
            "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
            "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
            "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
          ])
        ).optional(),
        postcode: z.preprocess(
          normalizeOptionalString,
          z.string().regex(/^\d{5}$/, "Zip code must be 5 digits")
        ).optional(),
        phone: z.preprocess(
          normalizeOptionalString,
          z.string().regex(/^\d{10}$/, "Phone number must be 10 digits")
        ).optional(),
        businessHours: z.array(z.object({
          dayOfWeek: z.number().min(0).max(6),
          openTime: z.string(),
          closeTime: z.string(),
          isClosed: z.boolean(),
        })).optional(),
        staff: z.array(z.object({
          name: z.string().min(1),
          color: z.string().optional(),
        })).min(1).optional(),
        teamSize: z.enum(["myself", "team"]).optional(),
        selectedPlan: z.enum(["basic", "professional", "enterprise"]).optional(),
        parkingOptions: z.array(z.string()).optional(),
        accessibilityFeatures: z.array(z.string()).optional(),
        beverageOptions: z.object({
          complimentary: z.array(z.string()),
          paid: z.array(z.string()),
        }).optional(),
        // New onboarding fields
        bookingSlug: z.string()
          .min(3).max(50)
          .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]{1,2}$/, "Only lowercase letters, numbers, and hyphens")
          .optional(),
        manicureStations: z.number().int().min(0).max(50).optional(),
        pedicureChairs:   z.number().int().min(0).max(50).optional(),
        serviceCategories: z.array(z.string().max(100)).optional(),
        // From Google Places auto-capture
        website:   z.string().url().optional().or(z.literal("")),
        latitude:  z.string().optional(),
        longitude: z.string().optional(),
      });

      const parsed = onboardingSchema.safeParse(req.body);
      if (!parsed.success) {
        console.log("Onboarding: Validation failed:", parsed.error.flatten());
        return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
      }

      const {
        businessType,
        businessName,
        email,
        timezone,
        address,
        city,
        state,
        postcode,
        phone,
        businessHours: hoursData,
        staff: staffData,
        teamSize: teamSizeValue,
        selectedPlan: selectedPlanCode,
        parkingOptions,
        accessibilityFeatures,
        beverageOptions,
        bookingSlug: chosenSlug,
        manicureStations,
        pedicureChairs,
        serviceCategories,
        website,
        latitude,
        longitude,
      } = parsed.data;

      console.log("Onboarding: Looking up template for business type:", businessType);
      // Fall back to empty template for types without predefined services.
      // Staff and availability are still created correctly from businessHours.
      const template = businessTemplates[businessType] ?? { categories: [] };

      console.log("Onboarding: Creating store...");
      const store = await storage.createStore({
        name: businessName,
        email: email || null,
        timezone: timezone,
        address: address || null,
        city: city || null,
        state: state || null,
        postcode: postcode || null,
        phone: phone || null,
        category: businessType,
        userId: userId,
        parkingOptions: parkingOptions ?? [],
        accessibilityFeatures: accessibilityFeatures ?? [],
        beverageOptions: beverageOptions ?? null,
        website:        website  || null,
        storeLatitude:  latitude  || null,
        storeLongitude: longitude || null,
      });

      console.log("Onboarding: Store created successfully:", store.id);

      // Use the requested slug when it is free across both booking stores and
      // website-builder sites. The same value powers both public surfaces.
      const slug = await chooseOnboardingSlug(chosenSlug?.trim() || businessName);
      const updatedStore = await storage.updateStore(store.id, { bookingSlug: slug });
      if (updatedStore) Object.assign(store, updatedStore);
      const bloomWebsite = await ensureBloomWebsite(store.id, businessName, slug);

      if (hoursData && hoursData.length > 0) {
        await storage.setBusinessHours(store.id, hoursData.map(h => ({
          storeId: store.id,
          dayOfWeek: h.dayOfWeek,
          openTime: h.openTime,
          closeTime: h.closeTime,
          isClosed: h.isClosed,
        })));
      }

      // Create salon resources (manicure stations, pedicure chairs) from onboarding
      if (manicureStations && manicureStations > 0) {
        await db.insert(salonResources).values(
          Array.from({ length: manicureStations }, (_, i) => ({
            storeId: store.id,
            type: "station" as const,
            name: `Station ${i + 1}`,
            sortOrder: i,
            isActive: true,
          }))
        );
        console.log(`Onboarding: Created ${manicureStations} station resource(s)`);
      }
      if (pedicureChairs && pedicureChairs > 0) {
        await db.insert(salonResources).values(
          Array.from({ length: pedicureChairs }, (_, i) => ({
            storeId: store.id,
            type: "chair" as const,
            name: `Chair ${i + 1}`,
            sortOrder: i,
            isActive: true,
          }))
        );
        console.log(`Onboarding: Created ${pedicureChairs} chair resource(s)`);
      }

      // Seed the new store's service catalogue by copying categories, services,
      // addons, and links directly from the preset template store (storeId=2).
      // That store is maintained as the source of truth for what a fully
      // ready-to-use account looks like — every new account gets an exact
      // copy of it, regardless of business type or categories picked in
      // onboarding.
      const allServiceIds: number[] = await seedFromPresetStore(store.id);

      const staffMembers = staffData || [{ name: "Owner", color: "#f472b6" }];
      for (const s of staffMembers) {
        const newStaff = await storage.createStaff({
          name: s.name,
          color: s.color || "#3b82f6",
          storeId: store.id,
        });

        if (allServiceIds.length > 0) {
          await storage.setStaffServices(newStaff.id, allServiceIds);
        }

        if (hoursData && hoursData.length > 0) {
          const availabilityRules = hoursData
            .filter(h => !h.isClosed)
            .map(h => ({
              staffId: newStaff.id,
              dayOfWeek: h.dayOfWeek,
              startTime: h.openTime,
              endTime: h.closeTime,
            }));
          if (availabilityRules.length > 0) {
            await storage.setStaffAvailability(newStaff.id, availabilityRules);
          }
        }

        // Auto-create linked contractor record for payouts.
        const nameParts = (newStaff.name ?? "").trim().split(/\s+/).filter(Boolean);
        await db.insert(contractors).values({
          name: newStaff.name ?? "Staff Member",
          storeId: store.id,
          staffId: newStaff.id,
          firstName: nameParts[0] ?? "Staff",
          lastName: nameParts.slice(1).join(" ") || "Member",
          email: newStaff.email ?? null,
          role: (newStaff as any).employmentType ?? "stylist",
          commissionRate: newStaff.commissionRate ?? "0",
          productCommissionRate: "0",
          payoutMethod: "ach",
          taxClassification: "individual",
          isActive: true,
        });
      }

      await db.update(users).set({ onboardingCompleted: true }).where(eq(users.id, userId));

      // Ensure trial is active — belt-and-suspenders in case register didn't fire it
      const [freshUser] = await db.select().from(users).where(eq(users.id, userId));
      if (!freshUser.trialStartedAt) {
        await TrialService.setupTrialForUser(userId);
      }

      const [updatedUser] = await db.select().from(users).where(eq(users.id, userId));
      const { password: _, ...safeUser } = updatedUser;

      // ── Stripe: wire up the trial subscription for the chosen plan ────────────
      if (selectedPlanCode) {
        try {
          const [planRow] = await db
            .select({ id: subscriptionPlans.id, stripePriceIdMonthly: subscriptionPlans.stripePriceIdMonthly })
            .from(subscriptionPlans)
            .where(eq(subscriptionPlans.code, selectedPlanCode))
            .limit(1);

          if (planRow) {
            const trialEnd = (updatedUser as any).trialEndsAt
              ? new Date((updatedUser as any).trialEndsAt)
              : new Date(Date.now() + 30 * 24 * 3600 * 1000);

            let stripeSubId: string | null = null;
            let stripeCustomerId: string | null = null;

            if (isStripeConfigured() && (planRow as any).stripePriceIdMonthly) {
              try {
                const stripeClient = getStripe();
                const [freshStore] = await db.select().from(locations).where(eq(locations.id, store.id)).limit(1);
                let custId = (freshStore as any)?.stripeCustomerId ?? null;
                if (!custId) {
                  const customer = await stripeClient.customers.create({
                    name: businessName,
                    email: email || (updatedUser as any)?.email || undefined,
                    metadata: { storeId: String(store.id), userId },
                  });
                  custId = customer.id;
                  await db.update(locations).set({ stripeCustomerId: custId } as any).where(eq(locations.id, store.id));
                }
                stripeCustomerId = custId;

                const trialEndTs = Math.floor(trialEnd.getTime() / 1000);
                const stripeSub = await stripeClient.subscriptions.create({
                  customer: custId,
                  items: [{ price: (planRow as any).stripePriceIdMonthly }],
                  trial_end: trialEndTs,
                  payment_behavior: "default_incomplete",
                  payment_settings: { save_default_payment_method: "on_subscription" },
                });
                stripeSubId = stripeSub.id;
                console.log(`[onboarding] Stripe subscription created: ${stripeSub.id} (plan: ${selectedPlanCode}, trial_end: ${trialEnd.toISOString()})`);
              } catch (stripeErr: any) {
                console.warn("[onboarding] Stripe subscription creation failed (non-fatal):", stripeErr?.message);
              }
            }

            // Always create the store_subscriptions row to record the chosen plan —
            // even when Stripe isn't configured so the plan is tracked from day one.
            await db.insert(storeSubscriptions).values({
              storeId: store.id,
              planId: planRow.id,
              status: "trialing",
              currentPeriodStart: new Date(),
              currentPeriodEnd: trialEnd,
              stripeSubscriptionId: stripeSubId,
              stripeCustomerId: stripeCustomerId,
              createdAt: new Date(),
              updatedAt: new Date(),
            } as any);

            console.log(`[onboarding] store_subscriptions created → storeId=${store.id} plan=${selectedPlanCode} status=trialing`);
          }
        } catch (planErr: any) {
          // Non-fatal — plan tracking failure must never block onboarding completion.
          console.warn("[onboarding] Plan subscription setup failed (non-fatal):", planErr?.message);
        }
      }
      // ─────────────────────────────────────────────────────────────────────────

      return res.json({ store, user: safeUser, website: bloomWebsite });
    } catch (error: any) {
      console.error("Onboarding error:", error);
      // PostgreSQL unique constraint violation
      if (error?.code === "23505") {
        const detail: string = error?.detail ?? "";
        if (detail.includes("phone")) {
          return res.status(409).json({
            message: "A store with this phone number already exists. Please use a different phone number.",
          });
        }
        if (detail.includes("subdomain")) {
          return res.status(409).json({
            message: "That business name/subdomain is already taken. Please choose a different name.",
          });
        }
        return res.status(409).json({
          message: "A store with those details already exists.",
        });
      }
      return res.status(500).json({ message: "Failed to complete onboarding" });
    }
  });

  // === DNS VERIFICATION API (for custom domains) ===

  app.post("/api/verify-domain", express.json(), async (req, res) => {
    try {
      const { submission_id, domain, email } = req.body;

      if (!submission_id || !domain) {
        return res.status(400).json({ 
          verified: false,
          message: "Missing submission_id or domain" 
        });
      }

      // Verify submission exists and email matches (if provided)
      const result = await db.execute(sql`
        SELECT id, custom_domain, domain_type, status, domain_payment_status,
               COALESCE(contact_email, email) AS email
        FROM onboarding_submissions
        WHERE id = ${submission_id}
        AND domain_type = 'custom'
        AND custom_domain = ${domain}
        LIMIT 1
      `) as any;

      const submission = result?.rows?.[0];
      if (!submission) {
        return res.status(404).json({ 
          verified: false,
          message: "Submission not found or domain mismatch" 
        });
      }

      // Optional email verification for extra security
      if (email && submission.email !== email) {
        return res.status(403).json({ 
          verified: false,
          message: "Email does not match submission" 
        });
      }

      // DNS verification using Node's dns module
      const dns = await import("dns");
      const { promises: dnsPromises } = dns;
      const TARGET_IP = "216.128.140.207";

      let verified = false;
      let dnsError: string | null = null;

      try {
        const addresses = await dnsPromises.resolve4(domain);
        if (addresses.includes(TARGET_IP)) {
          verified = true;
        } else {
          dnsError = `A record found but pointing to wrong IP. Expected ${TARGET_IP}, found ${addresses.join(", ")}`;
        }
      } catch (err: any) {
        if (err.code === "ENOTFOUND" || err.code === "ENODATA") {
          dnsError = "DNS record not detected yet. Please wait 24-48 hours and try again.";
        } else {
          dnsError = `DNS lookup error: ${err.message}`;
        }
      }

      if (verified) {
        // Update submission status to verified/active
        await db.execute(sql`
          UPDATE onboarding_submissions
          SET domain_payment_status = 'verified', status = 'active', updated_at = NOW()
          WHERE id = ${submission_id}
        `);

        return res.json({ 
          verified: true,
          message: "Domain verified! Your site is now live."
        });
      } else {
        return res.json({ 
          verified: false,
          message: dnsError || "DNS verification failed"
        });
      }
    } catch (error) {
      console.error("[DNS Verify] Error:", error);
      return res.status(500).json({ 
        verified: false,
        message: "An error occurred during DNS verification"
      });
    }
  });

  // === SUBDOMAIN BOOKING ROUTES (accessed via subdomain) ===

  app.get("/api/store/by-subdomain", async (req, res) => {
    if ((req as any).store) {
      const store = (req as any).store;
      const { userId, ...publicStore } = store;
      const hours = await storage.getBusinessHours(store.id);
      return res.json({ ...publicStore, businessHours: hours });
    } else {
      return res.status(404).json({ message: "Store not found for this subdomain" });
    }
  });

  // === PUBLIC BOOKING ROUTES (no auth required) ===

  const resolvePublicStore = async (req: any) => {
    if (req.store) return req.store;
    const slug = typeof req.query.slug === "string" ? req.query.slug : undefined;
    if (!slug) return undefined;
    return storage.getStoreBySlug(slug);
  };

  app.get("/api/public/store/:slug", async (req, res) => {
    try {
      const store = await storage.getStoreBySlug(req.params.slug);
      if (!store) return res.status(404).json({ message: "Store not found" });
      const storeStatus0 = ((store as any).accountStatus ?? "active").toLowerCase();
      if (storeStatus0 === "suspended" || storeStatus0 === "canceled") {
        return res.status(403).json({ message: "This business is not currently accepting bookings." });
      }
      const { userId, ...publicStore } = store;
      const hours = await storage.getBusinessHours(store.id);
      const calSettings = await storage.getCalendarSettings(store.id);
      const showPrices = calSettings?.showPrices ?? true;
      const ratingRows = await db
        .select({ avg: sql<number>`AVG(${googleReviews.rating})`, cnt: sql<number>`COUNT(*)` })
        .from(googleReviews)
        .where(eq(googleReviews.storeId, store.id));
      const googleReviewCount = Number(ratingRows[0]?.cnt ?? 0);
      const googleRating = googleReviewCount >= 3
        ? Math.round(Number(ratingRows[0]?.avg ?? 0) * 10) / 10
        : null;
      return res.json({ ...publicStore, businessHours: hours, showPrices, googleRating, googleReviewCount });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/public/store/:slug/services", async (req, res) => {
    try {
      const store = await storage.getStoreBySlug(req.params.slug);
      if (!store) return res.status(404).json({ message: "Store not found" });
      const storeStatusSvc = ((store as any).accountStatus ?? "active").toLowerCase();
      if (storeStatusSvc === "suspended" || storeStatusSvc === "canceled") {
        return res.status(403).json({ message: "This business is not currently accepting bookings." });
      }
      const allServices = await storage.getServices(store.id);
      const allCategories = await storage.getServiceCategories(store.id);
      // SAFEGUARD: ensure categories belong to this store (defensive — storage should already filter)
      const allCategoriesFiltered = (allCategories || []).filter((c: any) => Number(c.storeId) === Number(store.id));
      const hiddenCategories = allCategoriesFiltered.filter((c: any) => Boolean(c.hiddenFromPublic));
      const hiddenCategoryIds = new Set(hiddenCategories.map((c: any) => Number(c.id)));
      const hiddenCategoryNames = new Set(
        hiddenCategories.map((c: any) => String(c.name).trim().toLowerCase()),
      );
      const storeServices = allServices.filter((s: any) => {
        if (s.isActive === false || s.hiddenFromPublic) return false;
        if (s.categoryId != null && hiddenCategoryIds.has(Number(s.categoryId))) return false;
        const categoryName = String(s.category ?? "").trim().toLowerCase();
        return !categoryName || !hiddenCategoryNames.has(categoryName);
      });
      const visibleCategories = allCategoriesFiltered.filter((c: any) => !c.hiddenFromPublic);
      const visibleCategoryIds = new Set(visibleCategories.map((c: any) => Number(c.id)));
      const visibleCategoryNames = new Set(
        visibleCategories.map((c: any) => String(c.name).trim().toLowerCase()),
      );
      const usedCategoryIds = new Set<number>();
      const usedCategoryNames = new Set<string>();

      for (const service of storeServices as any[]) {
        if (service.categoryId != null && visibleCategoryIds.has(Number(service.categoryId))) {
          usedCategoryIds.add(Number(service.categoryId));
        }
        const categoryName = String(service.category ?? "").trim().toLowerCase();
        if (categoryName && visibleCategoryNames.has(categoryName)) {
          usedCategoryNames.add(categoryName);
        }
      }

      const categories = visibleCategories.filter((category: any) =>
        usedCategoryIds.has(Number(category.id)) ||
        usedCategoryNames.has(String(category.name).trim().toLowerCase()),
      );
      return res.json({ services: storeServices, categories });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/public/store/:slug/staff", async (req, res) => {
    try {
      const store = await storage.getStoreBySlug(req.params.slug);
      if (!store) return res.status(404).json({ message: "Store not found" });
      const storeStatusStaff = ((store as any).accountStatus ?? "active").toLowerCase();
      if (storeStatusStaff === "suspended" || storeStatusStaff === "canceled") {
        return res.status(403).json({ message: "This business is not currently accepting bookings." });
      }
      const storeStaff = await storage.getAllStaff(store.id);
      // Public booking must only show active staff that are visible on the calendar
      const safeStaff = storeStaff
        .filter((s) => s.status !== "removed" && s.status !== "deactivated" && (s as any).showOnCalendar !== false)
        .map(({ email, phone, ...rest }) => rest);
      return res.json(safeStaff);
    } catch (error) {
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/public/store/:slug/reviews", async (req, res) => {
    try {
      const store = await storage.getStoreBySlug(req.params.slug);
      if (!store) return res.status(404).json({ message: "Store not found" });

      const reviewRows = await db
        .select({
          id: googleReviews.id,
          customerName: googleReviews.customerName,
          rating: googleReviews.rating,
          reviewText: googleReviews.reviewText,
          reviewImageUrls: googleReviews.reviewImageUrls,
          reviewerPhotoUrl: googleReviews.reviewerPhotoUrl,
          reviewMediaItems: googleReviews.reviewMediaItems,
          reviewCreateTime: googleReviews.reviewCreateTime,
        })
        .from(googleReviews)
        .where(
          and(
            eq(googleReviews.storeId, store.id),
            isNotNull(googleReviews.reviewText),
          )
        )
        .orderBy(desc(googleReviews.reviewCreateTime))
        .limit(40);

      return res.json(
        reviewRows.map((r) => ({
          id: r.id,
          customerName: r.customerName,
          rating: r.rating,
          reviewText: r.reviewText,
          reviewImageUrls: r.reviewImageUrls,
          reviewerPhotoUrl: r.reviewerPhotoUrl,
          reviewMediaItems: r.reviewMediaItems,
          reviewCreateTime: r.reviewCreateTime,
        }))
      );
    } catch (error) {
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Service-matched reviews (AI-matched per service, by booking slug) ────────
  app.get("/api/public/store/:slug/service-reviews", async (req, res) => {
    try {
      const store = await storage.getStoreBySlug(req.params.slug);
      if (!store) return res.status(404).json({ message: "Store not found" });
      const { getServiceReviewsForStore } = await import("./lib/serviceReviewMatcher");
      const serviceReviews = await getServiceReviewsForStore(store.id);
      return res.json(serviceReviews);
    } catch (error) {
      return res.status(500).json({});
    }
  });

  app.get("/api/public/store/:slug/availability", async (req, res) => {
    try {
      const store = await storage.getStoreBySlug(req.params.slug);
      if (!store) return res.status(404).json({ message: "Store not found" });
      const storeStatusAvail = ((store as any).accountStatus ?? "active").toLowerCase();
      if (storeStatusAvail === "suspended" || storeStatusAvail === "canceled") {
        return res.status(403).json({ message: "This business is not currently accepting bookings." });
      }

      const serviceId = Number(req.query.serviceId);
      const date = String(req.query.date);
      const duration = Number(req.query.duration);
      const specificStaffId = req.query.staffId ? Number(req.query.staffId) : undefined;

      if (!serviceId || !date || !duration) {
        return res.status(400).json({ message: "serviceId, date, and duration are required" });
      }

      const tz = store.timezone || "UTC";
      const calSettings = await storage.getCalendarSettings(store.id);
      const businessStartHour = 9;
      const businessEndHour = 18;
      const slotInterval = calSettings?.timeSlotInterval || 15;

      const hours = await storage.getBusinessHours(store.id);
      const dayStartLocal = fromZonedTime(new Date(`${date}T00:00:00`), tz);
      const dayEndLocal = fromZonedTime(new Date(`${date}T23:59:59.999`), tz);

      const dayAppointments = await storage.getAppointments({
        from: dayStartLocal,
        to: dayEndLocal,
        storeId: store.id,
      });

      let candidateStaff: typeof import("@shared/schema").staff.$inferSelect[];
      if (specificStaffId) {
        const member = await storage.getStaffMember(specificStaffId);
        // Verify this staff member is assigned to the requested service and is active
        if (member && (member as any).status !== "removed" && (member as any).status !== "deactivated") {
          const staffServices = await storage.getStaffServices(specificStaffId);
          const canPerformService = staffServices.some(ss => ss.serviceId === serviceId);
          candidateStaff = canPerformService ? [member] : [];
        } else {
          candidateStaff = [];
        }
      } else {
        candidateStaff = await storage.getStaffForService(serviceId);
        // Do NOT fall back to all staff — only show staff assigned to this service
      }

      if (candidateStaff.length === 0) return res.json([]);

      const dateParts = date.split("-").map(Number);
      const dayOfWeek = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]).getDay();
      const dayHours = hours.find(h => h.dayOfWeek === dayOfWeek);
      const startHour = dayHours && !dayHours.isClosed ? parseInt(dayHours.openTime.split(":")[0]) : businessStartHour;
      const endHour = dayHours && !dayHours.isClosed ? parseInt(dayHours.closeTime.split(":")[0]) : businessEndHour;

      if (dayHours?.isClosed) return res.json([]);

      const businessEndUtc = fromZonedTime(new Date(`${date}T${String(endHour).padStart(2, "0")}:00:00`), tz);
      const nowUtc = new Date();

      type SlotResult = { time: string; staffId: number; staffName: string };
      const slots: SlotResult[] = [];

      const staffLastAppointment: Map<number, Date> = new Map();
      const allAppointments = await storage.getAppointments({ storeId: store.id });
      for (const apt of allAppointments) {
        if (apt.status === "cancelled") continue;
        if (!apt.staffId) continue;
        const aptDate = new Date(apt.date);
        const current = staffLastAppointment.get(apt.staffId);
        if (!current || aptDate > current) {
          staffLastAppointment.set(apt.staffId, aptDate);
        }
      }

      for (let hour = startHour; hour < endHour; hour++) {
        for (let min = 0; min < 60; min += slotInterval) {
          const slotStart = fromZonedTime(new Date(`${date}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`), tz);
          const slotEnd = new Date(slotStart.getTime() + duration * 60000);

          if (slotStart < nowUtc) continue;
          if (slotEnd > businessEndUtc) continue;

          const availableForSlot: { staffMember: any; lastApt: Date | null }[] = [];

          for (const staffMember of candidateStaff) {
            let hasConflict = false;
            for (const apt of dayAppointments) {
              if (apt.staffId !== staffMember.id) continue;
              if (apt.status === "cancelled") continue;
              const aptStart = new Date(apt.date);
              const aptEnd = new Date(aptStart.getTime() + apt.duration * 60000);
              if (slotStart < aptEnd && slotEnd > aptStart) {
                hasConflict = true;
                break;
              }
            }

            // Check staff availability rules (days off and custom hours)
            // Use formatInTimeZone throughout — toZonedTime+.getHours()/.getDay() is
            // broken in date-fns-tz v3 on non-UTC servers (returns server-local values).
            if (!hasConflict) {
              const staffAvailRules = await storage.getStaffAvailability(staffMember.id);
              if (staffAvailRules && staffAvailRules.length > 0) {
                // iso day token: 1=Mon … 7=Sun → map to 0=Sun … 6=Sat
                const slotDayOfWeek = parseInt(formatInTimeZone(slotStart, tz, "i"), 10) % 7;
                const dayAvailability = staffAvailRules.find(r => r.dayOfWeek === slotDayOfWeek);

                if (dayAvailability) {
                  const [availStartHour, availStartMin] = dayAvailability.startTime.split(":").map(Number);
                  const [availEndHour, availEndMin] = dayAvailability.endTime.split(":").map(Number);
                  const slotTimeInMin =
                    parseInt(formatInTimeZone(slotStart, tz, "H"), 10) * 60 +
                    parseInt(formatInTimeZone(slotStart, tz, "m"), 10);
                  const slotEndTimeInMin =
                    parseInt(formatInTimeZone(slotEnd, tz, "H"), 10) * 60 +
                    parseInt(formatInTimeZone(slotEnd,  tz, "m"), 10);
                  const availStartInMin = availStartHour * 60 + availStartMin;
                  const availEndInMin   = availEndHour   * 60 + availEndMin;

                  if (slotTimeInMin < availStartInMin || slotEndTimeInMin > availEndInMin) {
                    hasConflict = true;
                  }
                } else {
                  // Staff has availability rules but none for this day — they are off
                  hasConflict = true;
                }
              }
            }

            if (!hasConflict) {
              availableForSlot.push({
                staffMember,
                lastApt: staffLastAppointment.get(staffMember.id) || null,
              });
            }
          }

          if (availableForSlot.length > 0) {
            availableForSlot.sort((a, b) => {
              if (a.lastApt === null && b.lastApt === null) return 0;
              if (a.lastApt === null) return -1;
              if (b.lastApt === null) return 1;
              return a.lastApt.getTime() - b.lastApt.getTime();
            });

            const chosen = availableForSlot[0];
            slots.push({
              time: slotStart.toISOString(),
              staffId: chosen.staffMember.id,
              staffName: chosen.staffMember.name,
            });
          }
        }
      }

      return res.json(slots);
    } catch (error) {
      console.error("Public availability error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // GET /api/public/store/:slug/available-days
  // Returns which dates in a given month have NO available slots (unavailableDates array).
  // Used by the template booking calendar to grey out closed / fully-booked days.
  app.get("/api/public/store/:slug/available-days", async (req, res) => {
    try {
      const store = await storage.getStoreBySlug(req.params.slug);
      if (!store) return res.status(404).json({ message: "Store not found" });
      const storeStatusDays = ((store as any).accountStatus ?? "active").toLowerCase();
      if (storeStatusDays === "suspended" || storeStatusDays === "canceled") {
        return res.status(403).json({ message: "This business is not currently accepting bookings." });
      }

      const serviceId = Number(req.query.serviceId);
      const year = Number(req.query.year);
      const month = Number(req.query.month); // 1-12
      const duration = Number(req.query.duration);

      if (!serviceId || !year || !month || !duration) {
        return res.status(400).json({ message: "serviceId, year, month, and duration are required" });
      }

      const tz = store.timezone || "UTC";
      const calSettings = await storage.getCalendarSettings(store.id);
      const slotInterval = calSettings?.timeSlotInterval || 15;
      const businessHours = await storage.getBusinessHours(store.id);
      const daysInMonth = new Date(year, month, 0).getDate();

      const candidateStaff = await storage.getStaffForService(serviceId);

      // No staff assigned → every day unavailable
      if (candidateStaff.length === 0) {
        const unavailableDates: string[] = [];
        for (let d = 1; d <= daysInMonth; d++) {
          unavailableDates.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
        }
        return res.json({ unavailableDates });
      }

      // Fetch staff availability rules in parallel (one DB call per staff member)
      const staffAvailRulesMap = new Map<number, any[]>();
      await Promise.all(
        candidateStaff.map(async (sm) => {
          const rules = await storage.getStaffAvailability(sm.id);
          staffAvailRulesMap.set(sm.id, rules || []);
        })
      );

      // Fetch ALL appointments for the whole month in a single query
      const monthStartUtc = fromZonedTime(
        new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00`), tz
      );
      const monthEndUtc = fromZonedTime(
        new Date(`${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}T23:59:59.999`), tz
      );
      const monthAppointments = await storage.getAppointments({
        from: monthStartUtc,
        to: monthEndUtc,
        storeId: store.id,
      });

      const nowUtc = new Date();
      const unavailableDates: string[] = [];

      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

        // Past days — always unavailable
        const dayEndUtc = fromZonedTime(new Date(`${dateStr}T23:59:59`), tz);
        if (dayEndUtc < nowUtc) {
          unavailableDates.push(dateStr);
          continue;
        }

        // Closed by store business hours
        const dayOfWeek = new Date(year, month - 1, d).getDay();
        const dayHours = businessHours.find((h) => h.dayOfWeek === dayOfWeek);
        if (!dayHours || dayHours.isClosed) {
          unavailableDates.push(dateStr);
          continue;
        }

        const startHour = parseInt(dayHours.openTime.split(":")[0]);
        const endHour = parseInt(dayHours.closeTime.split(":")[0]);
        const businessEndUtc = fromZonedTime(
          new Date(`${dateStr}T${String(endHour).padStart(2, "0")}:00:00`), tz
        );

        // Narrow appointments to just this day
        const dayStartUtc = fromZonedTime(new Date(`${dateStr}T00:00:00`), tz);
        const dayApts = monthAppointments.filter((apt) => {
          const aptDate = new Date(apt.date);
          return aptDate >= dayStartUtc && aptDate <= dayEndUtc;
        });

        // Try to find at least one available slot — break as soon as we find one
        let dayHasSlot = false;

        outer:
        for (let hour = startHour; hour < endHour; hour++) {
          for (let min = 0; min < 60; min += slotInterval) {
            const slotStart = fromZonedTime(
              new Date(`${dateStr}T${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`), tz
            );
            const slotEnd = new Date(slotStart.getTime() + duration * 60000);

            if (slotStart < nowUtc) continue;
            if (slotEnd > businessEndUtc) continue;

            for (const staffMember of candidateStaff) {
              let hasConflict = false;

              for (const apt of dayApts) {
                if (apt.staffId !== staffMember.id) continue;
                if (apt.status === "cancelled") continue;
                const aptStart = new Date(apt.date);
                const aptEnd = new Date(aptStart.getTime() + apt.duration * 60000);
                if (slotStart < aptEnd && slotEnd > aptStart) {
                  hasConflict = true;
                  break;
                }
              }

              if (!hasConflict) {
                const staffRules = staffAvailRulesMap.get(staffMember.id) || [];
                if (staffRules.length > 0) {
                  const slotDayOfWeek = parseInt(formatInTimeZone(slotStart, tz, "i"), 10) % 7;
                  const dayAvail = staffRules.find((r: any) => r.dayOfWeek === slotDayOfWeek);
                  if (!dayAvail) {
                    hasConflict = true;
                  } else {
                    const [aStartH, aStartM] = dayAvail.startTime.split(":").map(Number);
                    const [aEndH, aEndM] = dayAvail.endTime.split(":").map(Number);
                    const slotMin =
                      parseInt(formatInTimeZone(slotStart, tz, "H"), 10) * 60 +
                      parseInt(formatInTimeZone(slotStart, tz, "m"), 10);
                    const slotEndMin =
                      parseInt(formatInTimeZone(slotEnd, tz, "H"), 10) * 60 +
                      parseInt(formatInTimeZone(slotEnd, tz, "m"), 10);
                    if (slotMin < aStartH * 60 + aStartM || slotEndMin > aEndH * 60 + aEndM) {
                      hasConflict = true;
                    }
                  }
                }
              }

              if (!hasConflict) {
                dayHasSlot = true;
                break outer;
              }
            }
          }
        }

        if (!dayHasSlot) {
          unavailableDates.push(dateStr);
        }
      }

      return res.json({ unavailableDates });
    } catch (error) {
      console.error("Public available-days error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/public/store/:slug/book", async (req, res) => {
    try {
      const store = await storage.getStoreBySlug(req.params.slug);
      if (!store) return res.status(404).json({ message: "Store not found" });
      const storeStatus1 = ((store as any).accountStatus ?? "active").toLowerCase();
      if (storeStatus1 === "suspended" || storeStatus1 === "canceled") {
        return res.status(403).json({ message: "This business is not currently accepting bookings." });
      }

      const bookingSchema = z.object({
        serviceId: z.number(),
        staffId: z.number(),
        date: z.string(),
        duration: z.number(),
        customerName: z.string().min(1),
        customerEmail: z.string().email().optional(),
        customerPhone: z.string().min(1),
        notes: z.string().optional(),
        addonIds: z.array(z.number()).optional().default([]),
        // Payment policy fields (set when store requires card/deposit)
        paymentPolicy: z.enum(["none", "card_on_file", "deposit"]).optional().default("none"),
        paymentStatus: z.string().optional(),
        stripePaymentIntentId: z.string().optional(),
        stripeSetupIntentId: z.string().optional(),
        stripeCustomerId: z.string().optional(),
        stripePaymentMethodId: z.string().optional(),
        depositCollected: z.number().optional(),
        remainingBalance: z.number().optional(),
      });

      const input = bookingSchema.parse(req.body);

      const e164CustomerPhone = toE164US(input.customerPhone);
      if (!e164CustomerPhone) {
        return res.status(400).json({ message: "Phone number must be a valid 10-digit US number" });
      }

      // Validate staff is assigned to the requested service
      const staffServices = await storage.getStaffServices(input.staffId);
      const canPerformService = staffServices.some(ss => ss.serviceId === input.serviceId);
      if (!canPerformService) {
        return res.status(400).json({ message: "The selected staff member cannot perform this service" });
      }

      // ── Server-side payment policy enforcement ──────────────────────────────
      // Fetch the store's authoritative policy — never trust client-declared paymentPolicy.
      const [storePolicy] = await db
        .select({
          bookingPaymentPolicy: locations.bookingPaymentPolicy,
          depositType:          locations.depositType,
          depositValue:         locations.depositValue,
        })
        .from(locations)
        .where(eq(locations.id, store.id))
        .limit(1);

      // Determine effective policy (downgrade to 'none' if Stripe not connected)
      const { verifyStripeIntentForBooking: _verifyIntent } = await import("./routes/bookingPayments.js");
      const stripeConnected = !!(
        process.env.STRIPE_SECRET_KEY &&
        (await pool.query(
          `SELECT 1 FROM store_payment_accounts WHERE store_id = $1 AND provider = 'stripe' AND status = 'connected' LIMIT 1`,
          [store.id]
        ).then((r: any) => r.rows.length > 0).catch(() => false))
      );
      const effectivePolicy = stripeConnected ? (storePolicy?.bookingPaymentPolicy ?? "none") : "none";

      // Compute authoritative service total from DB prices (never from client)
      const serviceRecord = await storage.getService(input.serviceId);
      const servicePrice = Number(serviceRecord?.price ?? 0);
      let addonTotal = 0;
      for (const addonId of input.addonIds) {
        const addon = await storage.getAddon(addonId);
        if (addon) addonTotal += Number(addon.price ?? 0);
      }
      const serviceTotalCents = Math.round((servicePrice + addonTotal) * 100);

      // Compute expected deposit if policy requires it
      let expectedDepositCents: number | undefined;
      if (effectivePolicy === "deposit" && storePolicy?.depositValue) {
        if (storePolicy.depositType === "percentage") {
          expectedDepositCents = Math.round(serviceTotalCents * (Number(storePolicy.depositValue) / 100));
        } else {
          expectedDepositCents = Math.round(Number(storePolicy.depositValue) * 100);
        }
      }

      // Enforce: reject bookings that lack required payment evidence
      if (effectivePolicy === "card_on_file" && !input.stripeSetupIntentId) {
        return res.status(402).json({
          message: "This salon requires a payment method on file to confirm your booking.",
        });
      }
      if (effectivePolicy === "deposit" && !input.stripePaymentIntentId) {
        return res.status(402).json({
          message: "This salon requires a deposit to confirm your booking.",
        });
      }

      // Override client-declared policy with server's authoritative value
      input.paymentPolicy = effectivePolicy as "none" | "card_on_file" | "deposit";

      // Customer upsert — must happen before atomicCreateBooking (engine needs customerId)
      let customer = await storage.searchCustomerByPhone(e164CustomerPhone, store.id);
      if (!customer) {
        customer = await storage.createCustomer({
          name: input.customerName,
          email: input.customerEmail || null,
          phone: e164CustomerPhone,
          storeId: store.id,
          notes: null,
        });
      }

      // Business hours guard — enforce that the booking start + duration
      // don't extend past the salon's closing time. atomicCreateBooking only
      // handles conflict detection; it does NOT validate business hours.
      // Use formatInTimeZone throughout — toZonedTime+.getHours()/.getDay() is
      // broken in date-fns-tz v3 on non-UTC servers (returns server-local values).
      {
        const tz = store.timezone ?? "UTC";
        const publicHours = await storage.getBusinessHours(store.id);
        const startUtc = new Date(input.date);
        // iso day token: 1=Mon … 7=Sun → map to 0=Sun … 6=Sat
        const dayOfWeek = parseInt(formatInTimeZone(startUtc, tz, "i"), 10) % 7;
        const dayHours = publicHours.find((h) => h.dayOfWeek === dayOfWeek);
        if (dayHours?.isClosed) {
          return res.status(400).json({ message: "This salon is closed on that day." });
        }
        if (dayHours?.openTime && dayHours?.closeTime) {
          const [openH, openM]   = dayHours.openTime.split(":").map(Number);
          const [closeH, closeM] = dayHours.closeTime.split(":").map(Number);
          const openMin  = openH  * 60 + openM;
          const closeMin = closeH * 60 + closeM;
          const startMin =
            parseInt(formatInTimeZone(startUtc, tz, "H"), 10) * 60 +
            parseInt(formatInTimeZone(startUtc, tz, "m"), 10);
          const endUtc = new Date(startUtc.getTime() + input.duration * 60_000);
          const endMin =
            parseInt(formatInTimeZone(endUtc, tz, "H"), 10) * 60 +
            parseInt(formatInTimeZone(endUtc,  tz, "m"), 10);
          if (startMin < openMin || endMin > closeMin) {
            return res.status(400).json({
              message: `The selected time is outside this salon's business hours (${fmt12(dayHours.openTime)}–${fmt12(dayHours.closeTime)}).`,
            });
          }
        }
      }

      // Atomic create: overlap check + INSERT in one DB transaction (eliminates TOCTOU race).
      // Duration rule: input.duration is the final value (including addons) passed by the client.
      // RULE: appointment.duration (incl. addons) is ALWAYS used for conflict detection — never service.duration.
      const createResult = await atomicCreateBooking({
        storeId: store.id,
        timezone: store.timezone ?? "UTC",
        startTime: new Date(input.date),
        durationMinutes: input.duration,
        staffId: input.staffId,
        serviceId: input.serviceId,
        customerId: customer.id,
        notes: input.notes || null,
        status: "pending",
      });
      if (!createResult.ok) {
        return res.status(409).json({ message: createResult.error.message });
      }
      const appointmentId = createResult.data.id;

      void (async () => {
        const svc = await storage.getService(input.serviceId);
        void logActivityEvent({
          storeId: store.id,
          eventType: "new_booking",
          message: `${customer.name || "New client"} booked${svc ? ` ${svc.name}` : ""} online`,
        });
      })();

      // Save add-ons and extend appointment duration if any were selected
      if (input.addonIds && input.addonIds.length > 0) {
        let addonDuration = 0;
        for (const addonId of input.addonIds) {
          const addon = await storage.getAddon(addonId);
          if (addon) addonDuration += addon.duration;
        }
        if (addonDuration > 0) {
          // Re-validate conflicts for the extended end time before persisting the duration change.
          // The original atomicCreateBooking only checked the base service duration; addons
          // extend the appointment end time and could now overlap a subsequent booking.
          if (input.staffId) {
            const newEnd = new Date(new Date(input.date).getTime() + (input.duration + addonDuration) * 60_000);
            const conflicts = await db
              .select({ id: appointments.id })
              .from(appointments)
              .where(
                and(
                  eq(appointments.storeId, store.id),
                  eq(appointments.staffId, input.staffId),
                  ne(appointments.id, appointmentId),
                  sql`status NOT IN ('cancelled', 'no_show', 'no-show')`,
                  sql`date < ${newEnd.toISOString()}`,
                  sql`(date + duration * interval '1 minute') > ${new Date(input.date).toISOString()}`
                )
              )
              .limit(1);
            if (conflicts.length > 0) {
              // Roll back the created appointment since we can't safely extend it
              await storage.deleteAppointment(appointmentId);
              return res.status(409).json({
                message: "Add-on services extend this appointment into an existing booking. Please choose a different time.",
              });
            }
          }
          await storage.updateAppointment(appointmentId, { duration: input.duration + addonDuration });
        }
        await storage.setAppointmentAddons(appointmentId, input.addonIds);
      }

      // ── Save payment tracking fields ────────────────────────────────────────
      if (input.paymentPolicy !== "none") {
        // Server-side verification: retrieve the Stripe intent and confirm it
        // completed successfully before writing any payment state. This prevents
        // clients from spoofing paymentStatus or using intents from other stores.
        // If verification fails, roll back the appointment so the slot is freed.
        try {
          // _verifyIntent was already imported during policy enforcement above
          const verified = await _verifyIntent({
            storeId: store.id,
            paymentPolicy: input.paymentPolicy as "card_on_file" | "deposit",
            stripeSetupIntentId: input.stripeSetupIntentId,
            stripePaymentIntentId: input.stripePaymentIntentId,
            stripeCustomerId: input.stripeCustomerId,
            stripePaymentMethodId: input.stripePaymentMethodId,
            expectedDepositCents,          // authoritative server-computed deposit
            authorizedServiceTotalCents: serviceTotalCents, // for remainingBalance — never from client
          });

          await pool.query(
            `UPDATE appointments SET
              payment_policy             = $1,
              payment_status             = $2,
              stripe_payment_intent_id   = $3,
              stripe_setup_intent_id     = $4,
              stripe_customer_id         = $5,
              stripe_payment_method_id   = $6,
              deposit_collected          = $7,
              remaining_balance          = $8
             WHERE id = $9`,
            [
              input.paymentPolicy,
              verified.paymentStatus,
              verified.stripePaymentIntentId,
              verified.stripeSetupIntentId,
              verified.stripeCustomerId,
              verified.stripePaymentMethodId,
              verified.depositCollected,
              verified.remainingBalance,
              appointmentId,
            ]
          );
          // Persist stripe customer on the client record for future bookings
          if (verified.stripeCustomerId) {
            await pool.query(
              `UPDATE clients SET stripe_customer_id = $1 WHERE id = $2`,
              [verified.stripeCustomerId, customer.id]
            );
          }
        } catch (paymentErr: any) {
          // Roll back the created appointment so the slot is freed
          await storage.deleteAppointment(appointmentId).catch(() => {});
          // Compensate: if a deposit PaymentIntent was captured, refund it so the
          // customer is never charged without a confirmed booking.
          if (input.stripePaymentIntentId) {
            const { compensateStripePayment } = await import("./routes/bookingPayments.js");
            await compensateStripePayment(store.id, input.stripePaymentIntentId);
          }
          console.error("[booking/payment-verify]", paymentErr?.message);
          return res.status(402).json({
            message: paymentErr?.message ?? "Payment verification failed. Your booking was not confirmed. Any payment will be refunded.",
          });
        }
      }

      const fullAppointment = await storage.getAppointment(appointmentId);
      if (fullAppointment) {
        sendBookingConfirmation(fullAppointment).catch(console.error);
        sendBookingConfirmationEmail(fullAppointment).catch(console.error);
      }

      return res.status(201).json(fullAppointment ?? { id: appointmentId });
    } catch (error) {
      console.error("Public booking error:", error);
      return res.status(400).json({ message: "Failed to create booking" });
    }
  });

  app.get("/api/appointments/confirmation/:confirmationNumber", async (req, res) => {
    try {
      const confirmationNumber = req.params.confirmationNumber || "";
      const phoneDigits = confirmationNumber.replace(/\D/g, "");
      if (!phoneDigits) return res.status(400).json({ message: "Confirmation number required" });

      const store = await resolvePublicStore(req);
      if (!store) return res.status(400).json({ message: "Store not found" });

      const appointments = await storage.getAppointmentsByCustomerPhone(phoneDigits, store.id);
      if (!appointments || appointments.length === 0) {
        return res.status(404).json({ message: "Booking not found" });
      }

      const safeAppointments = appointments.map((apt: any) => {
        if (apt.staff) {
          const staffSafe = apt.staff;
          return { ...apt, staff: staffSafe };
        }
        return apt;
      });
      return res.json(safeAppointments);
    } catch (error) {
      console.error("Confirmation lookup error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/appointments/confirmation/:confirmationNumber/cancel", async (req, res) => {
    try {
      const confirmationNumber = req.params.confirmationNumber || "";
      const phoneDigits = confirmationNumber.replace(/\D/g, "");
      if (!phoneDigits) return res.status(400).json({ message: "Confirmation number required" });

      const payload = z.object({ appointmentId: z.number() }).parse(req.body);

      const store = await resolvePublicStore(req);
      if (!store) return res.status(400).json({ message: "Store not found" });

      const appointment = await storage.getAppointment(payload.appointmentId);
      if (!appointment || appointment.storeId !== store.id) {
        return res.status(404).json({ message: "Booking not found" });
      }

      const appointmentPhone = (appointment.customer?.phone || "").replace(/\D/g, "");
      if (appointmentPhone !== phoneDigits) {
        return res.status(404).json({ message: "Booking not found" });
      }

      // Enforce cancellation window cutoff
      const cutoffHours = (store as any).cancellationHoursCutoff ?? 24;
      if (cutoffHours > 0) {
        const hoursUntilAppointment = (new Date(appointment.date).getTime() - Date.now()) / 3600_000;
        if (hoursUntilAppointment < cutoffHours) {
          return res.status(409).json({
            message: `Cancellations must be made at least ${cutoffHours} hour${cutoffHours === 1 ? "" : "s"} in advance.`,
            cutoffHours,
          });
        }
      }

      if (appointment.status !== "cancelled") {
        await storage.updateAppointment(appointment.id, {
          status: "cancelled",
          cancellationReason: "Cancelled by customer",
        });
      }

      const refreshed = await storage.getAppointment(appointment.id);
      const result = refreshed || appointment;
      if (result?.staff) {
        (result as any).staff = result.staff;
      }
      return res.json(result);
    } catch (error) {
      console.error("Confirmation cancel error:", error);
      return res.status(400).json({ message: "Failed to cancel booking" });
    }
  });

  const verifyTextbeltWebhook = (req: Request): boolean => {
    const apiKey = process.env.TEXTBELT_API_KEY;
    const requestSignature = req.get("X-textbelt-signature") ?? "";
    const timestamp = req.get("X-textbelt-timestamp") ?? "";
    if (!apiKey || !requestSignature || !timestamp) return false;

    const tsNum = Number(timestamp);
    if (!Number.isFinite(tsNum)) return false;
    // 15-minute replay protection window (per Textbelt docs)
    if (Math.abs(Math.floor(Date.now() / 1000) - tsNum) > 15 * 60) return false;

    const rawPayload = Buffer.isBuffer((req as any).rawBody)
      ? ((req as any).rawBody as Buffer).toString("utf8")
      : JSON.stringify(req.body ?? {});

    const expected = crypto
      .createHmac("sha256", apiKey)
      .update(`${timestamp}${rawPayload}`)
      .digest("hex");

    if (expected.length !== requestSignature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(requestSignature));
  };

  const processInboundSms = async (
    fromRawInput: string,
    bodyRawInput: string,
    inboundMessageId: string | null,
    provider: "Twilio" | "Textbelt",
  ) => {
    const fromRaw = fromRawInput ?? "";
    const bodyRaw = bodyRawInput ?? "";

    // phone is E.164 ("+17202436886") — canonical format for all storage
    // rawDigits used only for opt-out table (backward compat with existing records)
    const rawDigits = String(fromRaw).replace(/\D/g, "");
    const phone = toE164US(String(fromRaw)) ?? rawDigits;
    const bodyText = String(bodyRaw).trim();
    const keyword = bodyText.toUpperCase().split(/\s+/)[0];

    if (!rawDigits) return;

    const { smsOptOuts, smsConversations } = await import("@shared/schema");

    if (["STOP", "STOPALL", "UNSUBSCRIBE", "END", "QUIT"].includes(keyword)) {
      await db.insert(smsOptOuts)
        .values({ phone: rawDigits, isOptedOut: true })
        .onConflictDoUpdate({
          target: smsOptOuts.phone,
          set: { isOptedOut: true, optedOutAt: new Date(), optedBackInAt: null },
        });
      console.log(`[${provider}Webhook] SMS opt-out recorded for ${phone}`);
    } else if (["START", "UNSTOP", "YES"].includes(keyword)) {
      await db.insert(smsOptOuts)
        .values({ phone: rawDigits, isOptedOut: false, optedBackInAt: new Date() })
        .onConflictDoUpdate({
          target: smsOptOuts.phone,
          set: { isOptedOut: false, optedBackInAt: new Date() },
        });
      console.log(`[${provider}Webhook] SMS opt-in recorded for ${phone}`);
    }

    if (!bodyText) return;

    try {
      const { smsContactRouting, clientPhones, clients: clientsTable } = await import("@shared/schema");
      const now = new Date();

      const routingRows = await db
        .select()
        .from(smsContactRouting)
        .where(eq(smsContactRouting.clientPhone, phone))
        .orderBy(desc(smsContactRouting.lastInteractionAt));

      let resolvedStoreId: number | null = null;
      let clientName: string | null = null;

      if (routingRows.length >= 1) {
        resolvedStoreId = routingRows[0].storeId;
      }

      if (!resolvedStoreId) {
        const phoneVariants = [phone, rawDigits, `+${rawDigits}`];
        for (const pv of phoneVariants) {
          const [row] = await db
            .select({ storeId: smsLog.storeId })
            .from(smsLog)
            .where(eq(smsLog.phone, pv))
            .orderBy(desc(smsLog.sentAt))
            .limit(1);
          if (row) {
            resolvedStoreId = row.storeId;
            break;
          }
        }
      }

      if (!resolvedStoreId) {
        const [cpRow] = await db
          .select({ storeId: clientPhones.storeId, clientId: clientPhones.clientId })
          .from(clientPhones)
          .where(eq(clientPhones.phoneNumberE164, phone))
          .limit(1);

        if (cpRow?.storeId) {
          resolvedStoreId = cpRow.storeId;
        } else {
          const [apptRow] = await db
            .select({ storeId: appointments.storeId })
            .from(appointments)
            .where(sql`customer_id IN (
              SELECT client_id FROM client_phones WHERE REGEXP_REPLACE(phone_number_e164, '[^0-9]', '', 'g') = ${rawDigits}
            )`)
            .orderBy(desc(appointments.date))
            .limit(1);
          if (apptRow) resolvedStoreId = apptRow.storeId;
        }
      }

      if (resolvedStoreId) {
        const [cpRow] = await db
          .select({ clientId: clientPhones.clientId })
          .from(clientPhones)
          .where(and(eq(clientPhones.phoneNumberE164, phone), eq(clientPhones.storeId, resolvedStoreId)))
          .limit(1);
        if (cpRow) {
          const [cl] = await db
            .select({ fullName: clientsTable.fullName })
            .from(clientsTable)
            .where(eq(clientsTable.id, cpRow.clientId))
            .limit(1);
          if (cl?.fullName) clientName = cl.fullName;
        }
      }

      if (resolvedStoreId) {
        const [routingCheck] = await db
          .select({ blockedAt: smsContactRouting.blockedAt })
          .from(smsContactRouting)
          .where(and(eq(smsContactRouting.storeId, resolvedStoreId), eq(smsContactRouting.clientPhone, phone)))
          .limit(1);
        if (routingCheck?.blockedAt) {
          console.log(`[${provider}Webhook] Inbound SMS from blocked number ${phone} — discarded`);
          return;
        }

        await db.insert(smsConversations).values({
          storeId: resolvedStoreId,
          clientPhone: phone,
          clientName,
          direction: "inbound",
          body: bodyText,
          twilioSid: inboundMessageId,
        });

        await db.insert(smsContactRouting).values({
          storeId: resolvedStoreId,
          clientPhone: phone,
          lastInboundAt: now,
          lastInteractionAt: now,
        }).onConflictDoUpdate({
          target: [smsContactRouting.storeId, smsContactRouting.clientPhone],
          set: {
            lastInboundAt: now,
            lastInteractionAt: now,
            archivedAt: null,
            updatedAt: now,
          },
        });

        console.log(`[${provider}Webhook] Inbound SMS from ${phone} → store ${resolvedStoreId}${clientName ? ` (${clientName})` : ""}`);

        broadcastNotification({
          type: "sms_inbound",
          storeId: resolvedStoreId,
          clientPhone: phone,
          clientName,
          body: bodyText,
          createdAt: now.toISOString(),
        });

        if (keyword === "CANCEL") {
          try {
            const smsSettingsRow = await storage.getSmsSettings(resolvedStoreId);
            const cancellationEnabled = smsSettingsRow?.smsCancellationEnabled ?? true;

            if (!cancellationEnabled) {
              console.log(`[${provider}Webhook] SMS cancellation disabled for store ${resolvedStoreId}`);
            } else {
              const { sendSms } = await import("./sms");
              const { formatInTimeZone } = await import("date-fns-tz");
              const [storeRow] = await db.select({ name: locations.name, timezone: locations.timezone })
                .from(locations).where(eq(locations.id, resolvedStoreId)).limit(1);
              const timezone = storeRow?.timezone || "UTC";
              const salonName = storeRow?.name || "the salon";

              const [cpRow] = await db
                .select({ clientId: clientPhones.clientId })
                .from(clientPhones)
                .where(and(eq(clientPhones.phoneNumberE164, phone), eq(clientPhones.storeId, resolvedStoreId)))
                .limit(1);

              let resolvedClientId: number | null = cpRow?.clientId ?? null;

              if (!resolvedClientId) {
                const noApptMsg = "We couldn't find an upcoming appointment associated with this phone number. Please contact the salon for assistance.";
                await sendSms(resolvedStoreId, `+${phone}`, noApptMsg, "sms_cancel_noop", undefined, undefined, { skipCreditDeduction: true, smsSource: "platform" });
                await db.insert(smsConversations).values({
                  storeId: resolvedStoreId,
                  clientPhone: phone,
                  clientName,
                  direction: "outbound",
                  body: noApptMsg,
                  twilioSid: null,
                });
              } else {
                const nowTs = new Date();
                const [upcomingAppt] = await db
                  .select({
                    id: appointments.id,
                    date: appointments.date,
                    status: appointments.status,
                    storeId: appointments.storeId,
                  })
                  .from(appointments)
                  .where(and(
                    eq(appointments.storeId, resolvedStoreId),
                    eq(appointments.customerId, resolvedClientId),
                    sql`${appointments.date} > ${nowTs.toISOString()}`,
                    sql`${appointments.status} NOT IN ('cancelled', 'completed', 'no-show', 'no_show')`
                  ))
                  .orderBy(asc(appointments.date))
                  .limit(1);

                if (!upcomingAppt) {
                  const noApptMsg = "We couldn't find an upcoming appointment associated with this phone number. Please contact the salon for assistance.";
                  await sendSms(resolvedStoreId, `+${phone}`, noApptMsg, "sms_cancel_noop", undefined, undefined, { skipCreditDeduction: true, smsSource: "platform" });
                  await db.insert(smsConversations).values({
                    storeId: resolvedStoreId,
                    clientPhone: phone,
                    clientName,
                    direction: "outbound",
                    body: noApptMsg,
                    twilioSid: null,
                  });
                } else {
                  await storage.updateAppointment(upcomingAppt.id, {
                    status: "cancelled",
                    cancellationReason: "Cancelled by client via SMS",
                  });

                  broadcastNotification({
                    type: "appointment_cancelled",
                    storeId: resolvedStoreId,
                    customerName: clientName || "A client",
                    serviceName: "service",
                    appointmentDate: new Date(upcomingAppt.date).toISOString(),
                  });

                  setImmediate(async () => {
                    try {
                      const { getCancellationRecoveryCandidates, sendCancellationRecoverySms } = await import("./intelligence/cancellation-recovery");
                      const candidates = await getCancellationRecoveryCandidates(resolvedStoreId!, upcomingAppt.id);
                      const topCandidate = candidates.find((c) => c.customerPhone && c.priority === "high") || candidates[0];
                      if (topCandidate?.customerPhone) {
                        await sendCancellationRecoverySms(resolvedStoreId!, topCandidate.customerId, topCandidate.suggestedMessage, upcomingAppt.id);
                      }
                    } catch (fillErr: any) {
                      console.error(`[${provider}Webhook] CANCEL auto-fill error:`, fillErr.message);
                    }
                  });

                  const apptDate = formatInTimeZone(new Date(upcomingAppt.date), timezone, "EEEE, MMMM d");
                  const apptTime = formatInTimeZone(new Date(upcomingAppt.date), timezone, "h:mm a");
                  const confirmMsg = `Your appointment at ${salonName} on ${apptDate} at ${apptTime} has been canceled. If this was a mistake, please contact the salon.`;

                  await sendSms(resolvedStoreId, `+${phone}`, confirmMsg, "sms_cancel_confirm", upcomingAppt.id, resolvedClientId, { skipCreditDeduction: true, smsSource: "platform" });
                  await db.insert(smsConversations).values({
                    storeId: resolvedStoreId,
                    clientPhone: phone,
                    clientName,
                    direction: "outbound",
                    body: confirmMsg,
                    twilioSid: null,
                  });

                  console.log(`[${provider}Webhook] CANCEL: appointment ${upcomingAppt.id} cancelled for client ${resolvedClientId} at store ${resolvedStoreId}`);
                }
              }
            }
          } catch (cancelErr: any) {
            console.error(`[${provider}Webhook] CANCEL handler error:`, cancelErr.message);
          }
        }
      } else {
        console.warn(`[${provider}Webhook] Could not route inbound SMS from ${phone} — no store association found`);
      }
    } catch (saveErr) {
      console.warn(`[${provider}Webhook] Could not save to inbox:`, saveErr);
    }
  };

  // === TWILIO INBOUND SMS WEBHOOK (legacy/backward compatible) ===
  app.post("/api/webhooks/twilio/incoming", async (req, res) => {
    try {
      const { From: fromRaw = "", Body: bodyRaw = "", MessageSid: messageSid = null } = req.body ?? {};
      await processInboundSms(String(fromRaw), String(bodyRaw), messageSid ? String(messageSid) : null, "Twilio");
      res.set("Content-Type", "text/xml");
      return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
    } catch (err) {
      console.error("[TwilioWebhook] Error:", err);
      res.set("Content-Type", "text/xml");
      return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
    }
  });

  // === TEXTBELT INBOUND SMS WEBHOOK ===
  app.post("/api/webhooks/textbelt/incoming", async (req, res) => {
    try {
      if (!process.env.TEXTBELT_API_KEY) {
        return res.status(503).json({ error: "TEXTBELT_API_KEY is not configured" });
      }
      if (!verifyTextbeltWebhook(req)) {
        return res.status(401).json({ error: "Invalid Textbelt webhook signature" });
      }

      const { fromNumber = "", text = "", textId = null } = req.body ?? {};
      await processInboundSms(String(fromNumber), String(text), textId ? String(textId) : null, "Textbelt");
      return res.json({ ok: true });
    } catch (err) {
      console.error("[TextbeltWebhook] Error:", err);
      return res.status(500).json({ error: "failed" });
    }
  });

  // === TWO-WAY SMS INBOX ===

  // GET /api/sms-inbox/webhook-status — Twilio two-way inbox readiness.
  // Cached 5 min server-side.
  const webhookStatusCache: { current: { ts: number; body: object } | null } = { current: null };
  const WEBHOOK_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  app.get("/api/sms-inbox/webhook-status", isAuthenticated, async (req, res) => {
    // Serve from cache if fresh
    if (webhookStatusCache.current && Date.now() - webhookStatusCache.current.ts < WEBHOOK_CACHE_TTL) {
      return res.json(webhookStatusCache.current.body);
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    const appUrl      = (process.env.APP_URL ?? "").replace(/\/$/, "");
    const expectedUrl = appUrl ? `${appUrl}/api/webhooks/twilio/incoming` : null;

    if (!accountSid || !fromNumber) {
      const body = { status: "no_twilio", phoneNumber: null, smsUrl: null, expectedUrl };
      webhookStatusCache.current = { ts: Date.now(), body };
      return res.json(body);
    }

    if (!appUrl) {
      const body = { status: "misconfigured", phoneNumber: fromNumber, smsUrl: null, expectedUrl };
      webhookStatusCache.current = { ts: Date.now(), body };
      return res.json(body);
    }

    const body = {
      status: "ok",
      phoneNumber: fromNumber,
      smsUrl: expectedUrl,
      expectedUrl,
    };
    webhookStatusCache.current = { ts: Date.now(), body };
    return res.json(body);
  });

  app.get("/api/sms-inbox/conversations", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });

      // view: "inbox" (default) | "archived" | "blocked"
      const view = String(req.query.view || "inbox");

      const { smsConversations, smsContactRouting } = await import("@shared/schema");

      // Build routing status map for this store (archive/block state per phone)
      const routingRows = await db
        .select({
          clientPhone: smsContactRouting.clientPhone,
          archivedAt: smsContactRouting.archivedAt,
          blockedAt: smsContactRouting.blockedAt,
        })
        .from(smsContactRouting)
        .where(eq(smsContactRouting.storeId, storeId));

      const routingMap = new Map<string, { archivedAt: Date | null; blockedAt: Date | null }>();
      for (const r of routingRows) routingMap.set(r.clientPhone, { archivedAt: r.archivedAt, blockedAt: r.blockedAt });

      // Get all messages for this store, newest first
      const allMessages = await db
        .select()
        .from(smsConversations)
        .where(eq(smsConversations.storeId, storeId))
        .orderBy(desc(smsConversations.createdAt));

      // Group by clientPhone, keep latest per phone
      const phoneMap = new Map<string, typeof allMessages[0] & { unreadCount: number }>();
      for (const msg of allMessages) {
        if (!phoneMap.has(msg.clientPhone)) {
          phoneMap.set(msg.clientPhone, { ...msg, unreadCount: 0 });
        }
        if (msg.direction === "inbound" && !msg.readAt) {
          phoneMap.get(msg.clientPhone)!.unreadCount++;
        }
      }

      const conversations = Array.from(phoneMap.values())
        .filter((m) => {
          const r = routingMap.get(m.clientPhone);
          const isBlocked = !!r?.blockedAt;
          const isArchived = !!r?.archivedAt && !isBlocked;
          if (view === "blocked")  return isBlocked;
          if (view === "archived") return isArchived;
          // inbox: neither blocked nor archived
          return !isBlocked && !isArchived;
        })
        .map((m) => {
          const r = routingMap.get(m.clientPhone);
          return {
            clientPhone: m.clientPhone,
            clientName: m.clientName,
            lastMessage: m.body,
            lastMessageAt: m.createdAt,
            unreadCount: m.unreadCount,
            direction: m.direction,
            isArchived: !!r?.archivedAt,
            isBlocked: !!r?.blockedAt,
          };
        });

      return res.json(conversations);
    } catch (err) {
      console.error("[SmsInbox] conversations error:", err);
      return res.status(500).json({ message: "Failed to load conversations" });
    }
  });

  // POST /api/sms-inbox/archive — toggle archive on a conversation
  app.post("/api/sms-inbox/archive", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });
      const { phone, archive } = req.body as { phone: string; archive: boolean };
      if (!phone) return res.status(400).json({ message: "phone required" });

      const e164 = toE164US(phone) ?? phone;
      const { smsContactRouting } = await import("@shared/schema");
      const now = new Date();

      await db.insert(smsContactRouting).values({
        storeId,
        clientPhone: e164,
        archivedAt: archive ? now : null,
        lastInteractionAt: now,
      }).onConflictDoUpdate({
        target: [smsContactRouting.storeId, smsContactRouting.clientPhone],
        set: { archivedAt: archive ? now : null, updatedAt: now },
      });

      return res.json({ success: true, archived: archive });
    } catch (err) {
      console.error("[SmsInbox] archive error:", err);
      return res.status(500).json({ message: "Failed to update archive status" });
    }
  });

  // POST /api/sms-inbox/block — toggle block on a phone number
  app.post("/api/sms-inbox/block", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });
      const { phone, block } = req.body as { phone: string; block: boolean };
      if (!phone) return res.status(400).json({ message: "phone required" });

      const e164 = toE164US(phone) ?? phone;
      const { smsContactRouting } = await import("@shared/schema");
      const now = new Date();

      await db.insert(smsContactRouting).values({
        storeId,
        clientPhone: e164,
        blockedAt: block ? now : null,
        archivedAt: null, // unarchive when blocking (block takes precedence)
        lastInteractionAt: now,
      }).onConflictDoUpdate({
        target: [smsContactRouting.storeId, smsContactRouting.clientPhone],
        set: { blockedAt: block ? now : null, archivedAt: null, updatedAt: now },
      });

      return res.json({ success: true, blocked: block });
    } catch (err) {
      console.error("[SmsInbox] block error:", err);
      return res.status(500).json({ message: "Failed to update block status" });
    }
  });

  app.get("/api/sms-inbox/messages", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      const rawPhone = String(req.query.phone || "");
      // Accept E.164 or bare digits; normalize to E.164 so it matches what's stored
      const phone = toE164US(rawPhone) ?? rawPhone.replace(/\D/g, "");
      if (!storeId || !phone) return res.status(400).json({ message: "phone required" });

      const { smsConversations } = await import("@shared/schema");

      const messages = await db
        .select()
        .from(smsConversations)
        .where(
          and(
            eq(smsConversations.storeId, storeId),
            eq(smsConversations.clientPhone, phone)
          )
        )
        .orderBy(asc(smsConversations.createdAt));

      // Mark inbound messages as read
      await db
        .update(smsConversations)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(smsConversations.storeId, storeId),
            eq(smsConversations.clientPhone, phone),
            eq(smsConversations.direction, "inbound"),
            isNull(smsConversations.readAt)
          )
        );

      return res.json(messages);
    } catch (err) {
      console.error("[SmsInbox] messages error:", err);
      return res.status(500).json({ message: "Failed to load messages" });
    }
  });

  app.post("/api/sms-inbox/reply", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });
      const { phone, body } = req.body;
      if (!phone || !body) {
        return res.status(400).json({ message: "phone and body required" });
      }

      // ── SMS gate: early check for clean error message before attempting send ─
      const { resolveSmsAccess } = await import("./lib/featureAccess");
      const smsGate = await resolveSmsAccess(storeId);
      if (!smsGate.allowed) {
        return res.status(403).json({
          message: smsGate.blockReason === "insufficient_wallet"
            ? `Insufficient wallet balance. SMS costs $0.02/message. Current balance: $${smsGate.walletBalance.toFixed(2)}.`
            : "No SMS allowance remaining and no wallet balance. Add wallet funds or wait for your plan to renew.",
          code: "SMS_NOT_AVAILABLE",
          upgradeRequired: true,
          walletBalance: smsGate.walletBalance,
        });
      }

      const { sendSms } = await import("./sms");
      const { smsConversations } = await import("@shared/schema");

      // sendSms handles all deduction internally (allowance → wallet → fail)
      const e164Phone = phone.startsWith("+") ? phone : `+${phone}`;
      const result = await sendSms(storeId, e164Phone, body, "two_way_reply");

      if (!result.success && !result.skipped) {
        return res.status(500).json({ message: result.error || "Failed to send SMS" });
      }

      // Save outbound message to conversation — always store E.164 as clientPhone
      const e164ReplyPhone = toE164US(phone) ?? phone;
      const [saved] = await db.insert(smsConversations).values({
        storeId,
        clientPhone: e164ReplyPhone,
        direction: "outbound",
        body,
        twilioSid: result.sid || null,
        readAt: new Date(),
      }).returning();

      // Update routing record so future inbound from this number routes here
      {
        const { smsContactRouting } = await import("@shared/schema");
        const now = new Date();
        await db.insert(smsContactRouting).values({
          storeId,
          clientPhone: e164ReplyPhone,
          lastOutboundAt: now,
          lastInteractionAt: now,
        }).onConflictDoUpdate({
          target: [smsContactRouting.storeId, smsContactRouting.clientPhone],
          set: { lastOutboundAt: now, lastInteractionAt: now, updatedAt: now },
        }).catch(() => {});
      }

      return res.json(saved);
    } catch (err) {
      console.error("[SmsInbox] reply error:", err);
      return res.status(500).json({ message: "Failed to send reply" });
    }
  });

  // Search clients for new SMS conversation
  app.get("/api/sms-inbox/clients/search", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });
      const q = String(req.query.q || "").trim();
      if (!q) return res.json([]);

      const { clients: clientsTable, clientPhones } = await import("@shared/schema");

      const rows = await db
        .select({
          id: clientsTable.id,
          fullName: clientsTable.fullName,
          phone: clientPhones.phoneNumberE164,
          displayPhone: clientPhones.displayPhone,
        })
        .from(clientsTable)
        .leftJoin(clientPhones, and(eq(clientPhones.clientId, clientsTable.id), eq(clientPhones.isPrimary, true)))
        .where(and(
          eq(clientsTable.storeId, storeId),
          or(
            like(clientsTable.fullName, `%${q}%`),
            like(clientPhones.phoneNumberE164, `%${q.replace(/\D/g, "")}%`),
            like(clientPhones.displayPhone, `%${q}%`),
          )
        ))
        .limit(10);

      return res.json(rows);
    } catch (err) {
      console.error("[SmsInbox] client search error:", err);
      return res.status(500).json({ message: "Failed to search clients" });
    }
  });

  // Start a new conversation (or open existing) with a client
  app.post("/api/sms-inbox/start", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });
      const { phone, body, clientName } = req.body;
      if (!phone || !body) return res.status(400).json({ message: "phone and body required" });

      const { resolveSmsAccess } = await import("./lib/featureAccess");
      const smsGate = await resolveSmsAccess(storeId);
      if (!smsGate.allowed) {
        return res.status(403).json({
          message: smsGate.blockReason === "insufficient_wallet"
            ? `Insufficient wallet balance. SMS costs $0.02/message. Current balance: $${smsGate.walletBalance.toFixed(2)}.`
            : "No SMS allowance remaining and no wallet balance. Add wallet funds or wait for your plan to renew.",
          code: "SMS_NOT_AVAILABLE",
          upgradeRequired: true,
          walletBalance: smsGate.walletBalance,
        });
      }

      const { sendSms } = await import("./sms");
      const { smsConversations, smsContactRouting } = await import("@shared/schema");

      // sendSms handles all deduction internally (allowance → wallet → fail)
      const e164Phone = toE164US(phone) ?? (phone.startsWith("+") ? phone : `+${phone}`);
      const result = await sendSms(storeId, e164Phone, body, "two_way_reply");
      if (!result.success && !result.skipped) {
        return res.status(500).json({ message: result.error || "Failed to send SMS" });
      }

      const [saved] = await db.insert(smsConversations).values({
        storeId,
        clientPhone: e164Phone,
        clientName: clientName || null,
        direction: "outbound",
        body,
        twilioSid: result.sid || null,
        readAt: new Date(),
      }).returning();

      const now = new Date();
      await db.insert(smsContactRouting).values({
        storeId,
        clientPhone: e164Phone,
        lastOutboundAt: now,
        lastInteractionAt: now,
      }).onConflictDoUpdate({
        target: [smsContactRouting.storeId, smsContactRouting.clientPhone],
        set: { lastOutboundAt: now, lastInteractionAt: now, updatedAt: now },
      }).catch(() => {});

      return res.json({ ...saved, phone: e164Phone });
    } catch (err) {
      console.error("[SmsInbox] start conversation error:", err);
      return res.status(500).json({ message: "Failed to start conversation" });
    }
  });

  // POST /api/sms-inbox/test-inbound — simulate an inbound SMS reply without a real Twilio webhook.
  // Inserts an inbound message, updates routing, and fires the real-time WS broadcast.
  // Useful for verifying end-to-end inbound routing after configuring a new phone number.
  app.post("/api/sms-inbox/test-inbound", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });

      const { phone, body = "Test reply from client" } = req.body ?? {};
      if (!phone) return res.status(400).json({ message: "phone is required" });

      const { smsConversations, smsContactRouting, clientPhones, clients: clientsTable } = await import("@shared/schema");
      const e164Phone = toE164US(phone) ?? (phone.startsWith("+") ? phone : `+${phone}`);
      const now = new Date();

      // Resolve client name from clientPhones table (best effort)
      let clientName: string | null = null;
      try {
        const [cpRow] = await db
          .select({ clientId: clientPhones.clientId })
          .from(clientPhones)
          .where(and(eq(clientPhones.phoneNumberE164, e164Phone), eq(clientPhones.storeId, storeId)))
          .limit(1);
        if (cpRow) {
          const [cl] = await db
            .select({ fullName: clientsTable.fullName })
            .from(clientsTable)
            .where(eq(clientsTable.id, cpRow.clientId))
            .limit(1);
          if (cl?.fullName) clientName = cl.fullName;
        }
      } catch { /* ignore — name is cosmetic */ }

      const messageBody = `[TEST] ${body}`;

      const [saved] = await db.insert(smsConversations).values({
        storeId,
        clientPhone: e164Phone,
        clientName,
        direction: "inbound",
        body: messageBody,
        twilioSid: null,
      }).returning();

      await db.insert(smsContactRouting).values({
        storeId,
        clientPhone: e164Phone,
        lastInboundAt: now,
        lastInteractionAt: now,
      }).onConflictDoUpdate({
        target: [smsContactRouting.storeId, smsContactRouting.clientPhone],
        set: { lastInboundAt: now, lastInteractionAt: now, archivedAt: null, updatedAt: now },
      });

      broadcastNotification({
        type: "sms_inbound",
        storeId,
        clientPhone: e164Phone,
        clientName,
        body: messageBody,
        createdAt: now.toISOString(),
      });

      console.log(`[SmsInbox] Test inbound simulated from ${e164Phone} → store ${storeId}`);
      return res.json({ success: true, message: saved });
    } catch (err) {
      console.error("[SmsInbox] test-inbound error:", err);
      return res.status(500).json({ message: "Failed to simulate inbound" });
    }
  });

  app.get("/api/public/check-slug/:slug", async (req, res) => {
    const slug = String(req.params.slug ?? "").trim().toLowerCase();
    const available = await isOnboardingSlugAvailable(slug);
    return res.json({ available });
  });

  // Public trial period length — used by marketing pages (no auth required)
  app.get("/api/public/trial-days", async (_req, res) => {
    const days = await TrialService.getFreeTrialDays();
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.json({ days });
  });

  // Public plan prices — used by marketing pages (no auth required)
  app.get("/api/public/plan-prices", async (req, res) => {
    try {
      const plans = await db
        .select({ code: billingPlans.code, name: billingPlans.name, priceCents: billingPlans.priceCents })
        .from(billingPlans)
        .where(eq(billingPlans.active, true));
      const DEFAULTS: Record<string, number> = { solo: 900, professional: 2200 };
      const result: Record<string, { name: string; priceMonthly: number }> = {};
      for (const p of plans) {
        result[p.code] = { name: p.name, priceMonthly: Math.round(Number(p.priceCents)) };
      }
      // Fill any missing plans with defaults
      for (const [code, cents] of Object.entries(DEFAULTS)) {
        if (!result[code]) {
          result[code] = { name: code.charAt(0).toUpperCase() + code.slice(1), priceMonthly: cents };
        }
      }
      res.setHeader("Cache-Control", "public, max-age=300");
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to load plan prices" });
    }
  });

  // === PUBLIC QUEUE ===

  app.get("/api/public/queue/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      const [store] = await db.select().from(locations).where(eq(locations.bookingSlug, slug));
      if (!store) return res.status(404).json({ error: "Store not found" });
      const storeStatus4 = ((store as any).accountStatus ?? "active").toLowerCase();
      if (storeStatus4 === "suspended" || storeStatus4 === "canceled") {
        return res.status(403).json({ error: "This business is not currently accepting bookings." });
      }

      const [settings] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, store.id));
      const prefs = settings?.preferences ? JSON.parse(settings.preferences as string) : {};
      const avgServiceTime: number = prefs.queueAvgServiceTime || 20;
      const queueEnabled: boolean = prefs.queueEnabled !== false;

      if (!queueEnabled) {
        return res.json({
          store: { id: store.id, name: store.name, phone: store.phone, address: store.address },
          queueEnabled: false, waitingCount: 0, calledCount: 0, servedToday: 0,
          estimatedWaitMinutes: 0, avgServiceTime, queue: [],
        });
      }

      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

      const activeEntries = await db.select().from(waitlist)
        .where(and(
          eq(waitlist.storeId, store.id),
          gte(waitlist.createdAt, todayStart),
          sql`${waitlist.status} IN ('waiting', 'called', 'serving')`
        ))
        .orderBy(asc(waitlist.createdAt));

      const [{ total: servedToday }] = await db.select({ total: count() }).from(waitlist)
        .where(and(
          eq(waitlist.storeId, store.id),
          gte(waitlist.createdAt, todayStart),
          eq(waitlist.status, "completed")
        ));

      const waitingEntries = activeEntries.filter(e => e.status === "waiting");

      const safeQueue = activeEntries.map((e, idx) => {
        const nameParts = e.customerName.trim().split(" ");
        const displayName = nameParts.length > 1
          ? `${nameParts[0]} ${nameParts[nameParts.length - 1][0]}.`
          : nameParts[0];
        return {
          id: e.id,
          displayName,
          status: e.status,
          partySize: (e as any).partySize || 1,
          estimatedWaitMinutes: idx * avgServiceTime,
          isNext: idx === 0 && e.status === "waiting",
        };
      });

      return res.json({
        store: { id: store.id, name: store.name, phone: store.phone, address: store.address },
        queueEnabled: true,
        waitingCount: waitingEntries.length,
        calledCount: activeEntries.filter(e => e.status !== null && ["called", "serving"].includes(e.status)).length,
        servedToday: Number(servedToday),
        estimatedWaitMinutes: waitingEntries.length * avgServiceTime,
        avgServiceTime,
        queue: safeQueue,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to fetch queue" });
    }
  });

  app.post("/api/public/queue/:slug/checkin", async (req, res) => {
    try {
      const { slug } = req.params;
      const [store] = await db.select().from(locations).where(eq(locations.bookingSlug, slug));
      if (!store) return res.status(404).json({ error: "Store not found" });

      const [settings] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, store.id));
      const prefs = settings?.preferences ? JSON.parse(settings.preferences as string) : {};
      const queueEnabled: boolean = prefs.queueEnabled !== false;
      const maxQueueSize: number = prefs.queueMaxSize || 30;
      const avgServiceTime: number = prefs.queueAvgServiceTime || 20;

      if (!queueEnabled) return res.status(400).json({ error: "Queue is not accepting check-ins right now." });

      const { customerName, customerPhone, partySize = 1, latitude, longitude } = req.body;
      if (!customerName?.trim()) return res.status(400).json({ error: "Name is required" });

      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const [{ total: currentWaiting }] = await db.select({ total: count() }).from(waitlist)
        .where(and(
          eq(waitlist.storeId, store.id),
          gte(waitlist.createdAt, todayStart),
          eq(waitlist.status, "waiting")
        ));

      if (Number(currentWaiting) >= maxQueueSize) {
        return res.status(400).json({ error: "The queue is currently full. Please visit us directly." });
      }

      const e164WaitlistPhone = customerPhone ? (toE164US(customerPhone) ?? customerPhone.trim()) : null;
      const [entry] = await db.insert(waitlist).values({
        storeId: store.id,
        customerName: customerName.trim(),
        customerPhone: e164WaitlistPhone,
        partySize: Math.max(1, Math.min(10, Number(partySize) || 1)),
        customerLatitude: latitude != null ? String(latitude) : null,
        customerLongitude: longitude != null ? String(longitude) : null,
        status: "waiting",
      } as any).returning();

      const before = await db.select({ id: waitlist.id }).from(waitlist)
        .where(and(
          eq(waitlist.storeId, store.id),
          gte(waitlist.createdAt, todayStart),
          sql`${waitlist.status} IN ('waiting', 'called', 'serving')`,
          sql`${waitlist.id} <= ${entry.id}`
        ));

      const position = before.length;
      const estimatedWaitMinutes = Math.max(0, (position - 1) * avgServiceTime);

      broadcastNotification({ type: "queue_updated", storeId: store.id });
      return res.json({ id: entry.id, position, estimatedWaitMinutes, storeName: store.name });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to check in" });
    }
  });

  app.get("/api/public/queue/:slug/position/:id", async (req, res) => {
    try {
      const { slug, id } = req.params;
      const [store] = await db.select().from(locations).where(eq(locations.bookingSlug, slug));
      if (!store) return res.status(404).json({ error: "Store not found" });

      const [entry] = await db.select().from(waitlist).where(eq(waitlist.id, parseInt(id)));
      if (!entry || entry.storeId !== store.id) return res.status(404).json({ error: "Entry not found" });

      const [settings] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, store.id));
      const prefs = settings?.preferences ? JSON.parse(settings.preferences as string) : {};
      const avgServiceTime: number = prefs.queueAvgServiceTime || 20;

      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const before = await db.select({ id: waitlist.id }).from(waitlist)
        .where(and(
          eq(waitlist.storeId, store.id),
          gte(waitlist.createdAt, todayStart),
          sql`${waitlist.status} IN ('waiting', 'called', 'serving')`,
          sql`${waitlist.id} <= ${entry.id}`
        ));

      const position = before.length;
      return res.json({ id: entry.id, status: entry.status, position, estimatedWaitMinutes: Math.max(0, (position - 1) * avgServiceTime) });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to get position" });
    }
  });

  // Allow unauthenticated status update for self-cancel
  app.put("/api/public/queue/cancel/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const [existing] = await db.select({ storeId: waitlist.storeId }).from(waitlist).where(eq(waitlist.id, id)).limit(1);
      await db.update(waitlist).set({ status: "cancelled" }).where(eq(waitlist.id, id));
      if (existing?.storeId) broadcastNotification({ type: "queue_updated", storeId: existing.storeId });
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: "Failed to cancel" });
    }
  });

  // === SMS SETTINGS ===
  const validateStoreOwnership = async (req: any, res: any): Promise<boolean> => {
    const userId = (req.session as any)?.userId;
    if (!userId) { res.status(401).json({ message: "Unauthorized" }); return false; }
    const storeId = Number(req.params.storeId);
    const store = await storage.getStore(storeId);
    if (!store || store.userId !== userId) {
      res.status(403).json({ message: "Forbidden" });
      return false;
    }
    return true;
  };

  app.get("/api/sms-settings/:storeId", async (req, res) => {
    if (!(await validateStoreOwnership(req, res))) return;
    const settings = await storage.getSmsSettings(Number(req.params.storeId));
    if (settings) {
      const { twilioAuthToken, ...safe } = settings;
      return res.json({ ...safe, twilioAuthToken: twilioAuthToken ? "••••••••" : null });
    } else {
      return res.json(null);
    }
  });

  app.put("/api/sms-settings/:storeId", async (req, res) => {
    if (!(await validateStoreOwnership(req, res))) return;
    try {
      const storeId = Number(req.params.storeId);
      const smsSettingsInput = z.object({
        twilioAccountSid: z.string().optional().nullable(),
        twilioAuthToken: z.string().optional().nullable(),
        twilioPhoneNumber: z.string().optional().nullable(),
        bookingConfirmationEnabled: z.boolean().optional(),
        reminderEnabled: z.boolean().optional(),
        reminderHoursBefore: z.number().min(1).max(72).optional(),
        reviewRequestEnabled: z.boolean().optional(),
        googleReviewUrl: z.string().optional().nullable(),
        confirmationTemplate: z.string().optional().nullable(),
        reminderTemplate: z.string().optional().nullable(),
        reviewTemplate: z.string().optional().nullable(),
        smsCancellationEnabled: z.boolean().optional(),
      }).parse(req.body);

      if (smsSettingsInput.twilioAuthToken === "••••••••") {
        delete smsSettingsInput.twilioAuthToken;
      }
      const settings = await storage.upsertSmsSettings(storeId, { ...smsSettingsInput, storeId });
      const { twilioAuthToken, ...safe } = settings;
      return res.json({ ...safe, twilioAuthToken: twilioAuthToken ? "••••••••" : null });
    } catch (error) {
      console.error("SMS settings update error:", error);
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  app.post("/api/sms-settings/:storeId/test", async (req, res) => {
    if (!(await validateStoreOwnership(req, res))) return;
    try {
      const storeId = Number(req.params.storeId);
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ message: "Phone number required" });

      const { sendSms } = await import("./sms");
      const result = await sendSms(
        storeId,
        phone,
        "This is a test message from your salon booking system. SMS is working!",
        "test"
      );

      if (result.success) {
        return res.json({ success: true, sid: result.sid });
      } else {
        return res.status(400).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/sms-log/:storeId", async (req, res) => {
    if (!(await validateStoreOwnership(req, res))) return;
    const logs = await storage.getSmsLogs(Number(req.params.storeId), 100);
    return res.json(logs);
  });

  // === CAMPAIGNS ===

  app.get("/api/campaigns", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });
      const { campaigns } = await import("@shared/schema/campaigns");
      const results = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.storeId, storeId))
        .orderBy(desc(campaigns.createdAt));
      return res.json(results);
    } catch (err) {
      console.error("[Campaigns] GET error:", err);
      return res.status(500).json({ message: "Failed to load campaigns" });
    }
  });

  app.post("/api/campaigns", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });
      const { name, channel, audience, audienceValue, messageTemplate, scheduledAt } = req.body;
      if (!name || !messageTemplate) {
        return res.status(400).json({ message: "name and messageTemplate required" });
      }
      const { campaigns } = await import("@shared/schema/campaigns");
      const status = scheduledAt ? "scheduled" : "draft";
      const [created] = await db.insert(campaigns).values({
        storeId,
        name,
        channel: channel || "sms",
        audience: audience || "all",
        audienceValue: audienceValue || null,
        messageTemplate,
        status,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      }).returning();
      return res.json(created);
    } catch (err) {
      console.error("[Campaigns] POST error:", err);
      return res.status(500).json({ message: "Failed to create campaign" });
    }
  });

  app.post("/api/campaigns/:id/send", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });
      const campaignId = Number(req.params.id);
      const { campaigns } = await import("@shared/schema/campaigns");

      const [campaign] = await db.select().from(campaigns).where(
        and(eq(campaigns.id, campaignId), eq(campaigns.storeId, storeId))
      );
      if (!campaign) return res.status(404).json({ message: "Campaign not found" });

      // Only draft, rejected, or scheduled campaigns can be submitted for review
      if (!["draft", "rejected", "scheduled"].includes(campaign.status)) {
        return res.status(400).json({ message: `Campaign cannot be submitted from status "${campaign.status}"` });
      }

      // Mark as under review immediately so the UI reflects it
      await db.update(campaigns).set({
        status: "pending_review",
        rejectionReason: null,
        reviewedAt: null,
      }).where(eq(campaigns.id, campaignId));

      // ── Helper: persist rejection and respond ──────────────────────────────
      const rejectCampaign = async (reason: string): Promise<void> => {
        await db.update(campaigns).set({
          status: "rejected",
          rejectionReason: reason,
          reviewedAt: new Date(),
        }).where(eq(campaigns.id, campaignId));
        res.status(422).json({ rejected: true, reason });
      };

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 1: PRE-FLIGHT CHECKS
      // Fast, synchronous rule checks — no AI cost.
      // ═══════════════════════════════════════════════════════════════════════

      // 1a — Account must be active
      const [storeRow] = await db
        .select({ accountStatus: locations.accountStatus })
        .from(locations)
        .where(eq(locations.id, storeId))
        .limit(1);
      const acctStatus = (storeRow?.accountStatus ?? "Active").toLowerCase();
      if (acctStatus === "suspended" || acctStatus === "canceled" || acctStatus === "cancelled") {
        await rejectCampaign(
          `Your account is currently ${acctStatus}. Campaign sending is disabled for inactive accounts. Please contact support to reactivate your account.`
        );
        return;
      }

      // 1b — SMS credits must be available
      if (campaign.channel === "sms" || campaign.channel === "both") {
        const { resolveSmsAccess } = await import("./lib/featureAccess");
        const smsGate = await resolveSmsAccess(storeId);
        if (!smsGate.allowed) {
          await rejectCampaign(
            smsGate.blockReason === "insufficient_wallet"
              ? `Insufficient wallet balance. Your current balance is ${smsGate.walletBalance.toFixed(2)}. Add funds to your wallet ($0.02 per SMS) before sending this campaign.`
              : "Your monthly SMS allowance is exhausted and your wallet balance is $0.00. Add wallet funds or wait for your plan to renew."
          );
          return;
        }
      }

      // 1c — Message must not be empty
      const msg = (campaign.messageTemplate || "").trim();
      if (!msg) {
        await rejectCampaign("Campaign message is empty. Please add content before submitting.");
        return;
      }

      // 1d — SMS message length (max 4 segments = 640 characters)
      if ((campaign.channel === "sms" || campaign.channel === "both") && msg.length > 640) {
        await rejectCampaign(
          `SMS message is ${msg.length} characters, which exceeds the 640-character maximum (4 message segments). Please shorten your message.`
        );
        return;
      }

      // 1e — Static prohibited-content pattern checks
      const PROHIBITED_PATTERNS: Array<{ re: RegExp; reason: string }> = [
        {
          re: /\b(cannabis|marijuana|marihuana|\bweed\b|thc\b|hemp\s+oil|delta-?8|delta-?9|cbd\s+oil|edibles?|hash\b)\b/i,
          reason: "Message references cannabis or controlled substances, which SMS carriers prohibit in commercial messages.",
        },
        {
          re: /\b(xxx|pornograph|adult\s+content|escort\s+service|hookup\s+site|only\s*fans|sex\s+chat|webcam\s+girls?)\b/i,
          reason: "Message contains adult content references, which are prohibited in commercial SMS and email marketing.",
        },
        {
          re: /\b(firearm|handgun|\brifle\b|shotgun|\bpistol\b|\bammo\b|ammunition|buy\s+(a\s+)?guns?|suppressor|silencer)\b/i,
          reason: "Message promotes firearms or weapons, which is prohibited by SMS carrier policies.",
        },
        {
          re: /\b(online\s+casino|gambl(e|ing)|jackpot|bet\s+now|online\s+betting|sports\s+bet(ting)?|lottery\s+winner|poker\s+bonus)\b/i,
          reason: "Message contains gambling or betting content, which violates carrier SMS guidelines.",
        },
        {
          re: /\b(click\s+here\s+to\s+claim|you('ve|\s+have)\s+(won|been\s+selected)|(congratulations|congrats),?\s+you('re|\s+are)?\s+a?\s+winner)\b/i,
          reason: "Message uses deceptive prize or sweepstakes language that violates FTC regulations.",
        },
        {
          re: /\b(make\s+\$[\d,]+\s+(a\s+)?(day|week|month)|earn\s+\$[\d,]+\s+(daily|weekly|per\s+day)|get\s+rich\s+quick|unlimited\s+income)\b/i,
          reason: "Message contains misleading income or financial opportunity claims that violate consumer protection laws.",
        },
        {
          re: /\b(verify\s+your\s+(account|identity|password|ssn|social\s+security)|enter\s+your\s+(credit\s+card|account)\s+number|bank\s+login)\b/i,
          reason: "Message contains language associated with phishing or credential theft, which is prohibited.",
        },
        {
          re: /\b(buy\s+(viagra|cialis|oxycontin|xanax|adderall)|no\s+prescription\s+(needed|required)|cheap\s+meds?)\b/i,
          reason: "Message promotes prescription medications without a licensed pharmacy context, which is prohibited.",
        },
        {
          re: /\b(n[i1]gg[e3]r|f[a@]gg[o0]t|ch[i1]nk|sp[i1]c|k[i1]ke|cr[a@]cker|wh[o0]re|c[u\*]nt)\b/i,
          reason: "Message contains hate speech or slurs, which are strictly prohibited.",
        },
        {
          re: /\b(b[i1]tch(es|ing)?|f+u+c+k+(ing|er|s)?|sh[i1]t(ty|ter|s)?|a[s$]{2}h[o0]le|d[i1]ck(head|s)?|c[o0]ck(s|sucker)?|p[u\*][s$]{2}y|p[e3]n[i1]s|b[o0]{2}b(s|job)?|j[i1]zz|c[u\*]mshot|motherf[u\*]ck)\b/i,
          reason: "Message contains profanity or vulgar language, which is prohibited in commercial marketing messages by carrier policies.",
        },
        {
          re: /\b(sexy\s+(girl|ladies|woman|babe|hot|body|thing)|hot\s+(girl|babe|body|chick|ladies)|sugar\s+babe?|get\s+laid|booty\s+call|dirty\s+girl|naughty\s+girl|come\s+get\s+some|come\s+satisfy)\b/i,
          reason: "Message contains sexually suggestive language, which is inappropriate for commercial SMS/email marketing.",
        },
      ];

      for (const { re, reason } of PROHIBITED_PATTERNS) {
        if (re.test(msg)) {
          await rejectCampaign(`Pre-flight check failed: ${reason}`);
          return;
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 2: AI COMPLIANCE REVIEW
      // GPT-4o-mini evaluates the message against TCPA, CTIA, and FCC rules.
      //
      // If OpenAI is unavailable for ANY reason (no key, API error, bad JSON)
      // the campaign STAYS in pending_review and the background scheduler retries
      // it every 5 minutes until the AI is reachable. The campaign is never
      // auto-approved — it only proceeds once the AI explicitly approves it.
      // ═══════════════════════════════════════════════════════════════════════

      const openaiKey = process.env.OPENAI_API_KEY;

      // No key configured — queue for later, do not send.
      if (!openaiKey) {
        console.log(`[Campaign Review] Campaign ${campaignId}: OPENAI_API_KEY not set — queued for AI review`);
        return res.status(202).json({
          pending: true,
          message: "Your campaign passed pre-flight checks and is queued for AI compliance review. It will be sent automatically once approved.",
        });
      }

      try {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey: openaiKey });

        const systemPrompt = `You are a compliance officer for a salon appointment booking platform. Your sole job is to review marketing messages BEFORE they are sent to consumers via SMS or email, and determine whether they comply with applicable regulations and carrier policies.

Regulations you enforce:
- TCPA (Telephone Consumer Protection Act)
- CTIA Messaging Principles and Best Practices
- FCC commercial messaging regulations
- CAN-SPAM Act
- FTC truth-in-advertising standards

REJECT the message (approved: false) if it:
• References cannabis, marijuana, THC, CBD products, or controlled substances
• Contains adult content, sexual services, or escort/hookup references
• Promotes firearms, weapons, or ammunition
• Contains gambling, betting, lottery, or casino content
• Uses deceptive prize language ("you've won", "claim your free gift" with false urgency)
• Makes misleading income/financial opportunity claims
• Contains phishing language or requests for sensitive personal data
• Promotes prescription drugs outside a licensed pharmacy context
• Contains hate speech, slurs, or discriminatory language
• Impersonates government agencies, law enforcement, or major brands
• Contains threats, intimidation, or coercive language
• Appears designed to deceive, defraud, or harm consumers

APPROVE the message (approved: true) if it is:
• A legitimate re-engagement message for a salon, spa, or beauty business
• An appointment reminder or booking invitation
• A loyalty, thank-you, or seasonal promotion for beauty/wellness services
• Honest business marketing with clear, accurate claims
• A win-back or special offer from a real local business

Important: Merge tags like {{firstName}}, {{businessName}}, {{bookingLink}} are legitimate personalization placeholders — ignore them when assessing compliance.

Respond ONLY with a JSON object — no markdown, no extra text:
{"approved": true, "reason": "One sentence explaining why it's compliant"}
or
{"approved": false, "reason": "Clear, professional explanation of the specific violation. This will be shown directly to the salon owner so it must be understandable to a non-legal audience."}`;

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `Campaign: "${campaign.name}"\nChannel: ${campaign.channel}\nAudience: ${campaign.audience}\n\nMessage:\n---\n${msg}\n---`,
            },
          ],
          temperature: 0,
          max_tokens: 300,
          response_format: { type: "json_object" },
        });

        const raw = completion.choices[0]?.message?.content ?? "";
        let aiResult: { approved: boolean; reason: string } | null = null;
        try {
          aiResult = JSON.parse(raw);
        } catch {
          // Malformed JSON — AI is misbehaving; leave pending and let scheduler retry.
          console.warn("[Campaign Review] AI returned non-JSON, campaign stays pending:", raw);
          return res.status(202).json({
            pending: true,
            message: "AI review returned an unexpected response. Your campaign will be retried automatically.",
          });
        }

        if (!aiResult || aiResult.approved === false) {
          await rejectCampaign(`Compliance review failed: ${aiResult?.reason ?? "The message did not pass AI compliance review."}`);
          return;
        }

        console.log(`[Campaign Review] Campaign ${campaignId} approved by AI — ${aiResult.reason}`);

      } catch (aiErr: any) {
        // Network error, rate limit, timeout, etc. — leave pending, scheduler retries.
        console.warn(`[Campaign Review] Campaign ${campaignId}: AI unavailable, stays pending —`, aiErr?.message ?? aiErr);
        return res.status(202).json({
          pending: true,
          message: "AI compliance review is temporarily unavailable. Your campaign will be reviewed and sent automatically when the service is restored.",
        });
      }

      // ═══════════════════════════════════════════════════════════════════════
      // STEP 3: AI APPROVED — SEND THE CAMPAIGN
      // ═══════════════════════════════════════════════════════════════════════

      const now = new Date();

      await db.update(campaigns).set({
        status: "sending",
        reviewedAt: new Date(),
        rejectionReason: null,
      }).where(eq(campaigns.id, campaignId));

      // Build target audience
      let targetCustomers: { name: string; phone: string | null; email: string | null }[] = [];

      const baseQuery = db.select({
        name: clients.fullName,
        phone: sql<string>`(SELECT display_phone FROM client_phones WHERE client_id = clients.id AND is_primary = true LIMIT 1)`,
        email: sql<string>`(SELECT email_address FROM client_emails WHERE client_id = clients.id AND is_primary = true LIMIT 1)`,
      }).from(clients).where(and(eq(clients.storeId, storeId), isNull(clients.archivedAt)));

      if (campaign.audience === "all") {
        targetCustomers = await baseQuery;
      } else if (campaign.audience.startsWith("lapsed_")) {
        const days = parseInt(campaign.audience.split("_")[1]) || 90;
        const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        targetCustomers = await db.select({
          name: clients.fullName,
          phone: sql<string>`(SELECT display_phone FROM client_phones WHERE client_id = clients.id AND is_primary = true LIMIT 1)`,
          email: sql<string>`(SELECT email_address FROM client_emails WHERE client_id = clients.id AND is_primary = true LIMIT 1)`,
        }).from(clients)
          .where(
            and(
              eq(clients.storeId, storeId),
              isNull(clients.archivedAt),
              sql`(
                SELECT MAX(date) FROM appointments
                WHERE customer_id = clients.id
                  AND store_id = ${storeId}
                  AND status IN ('completed', 'started')
              ) < ${cutoff.toISOString()}
              OR NOT EXISTS (
                SELECT 1 FROM appointments
                WHERE customer_id = clients.id
                  AND store_id = ${storeId}
                  AND status IN ('completed', 'started')
              )`
            )
          );
      } else {
        targetCustomers = await baseQuery;
      }

      // Recheck SMS credits for campaign loop (cap to allowance if plan-funded)
      let smsCreditsRemaining = Infinity;
      if (campaign.channel === "sms" || campaign.channel === "both") {
        const { resolveSmsAccess } = await import("./lib/featureAccess");
        const smsGate = await resolveSmsAccess(storeId);
        if (smsGate.source === "plan") {
          smsCreditsRemaining = smsGate.allowanceRemaining;
        }
      }

      const { sendSms } = await import("./sms");
      const { sendEmail } = await import("./mail");
      const store = await storage.getStore(storeId);
      const bookingLink = store?.bookingSlug
        ? `${process.env.REPLIT_DEV_DOMAIN || ""}/book/${store.bookingSlug}`
        : "";

      let sentCount = 0;
      let failedCount = 0;
      let smsSentThisRequest = 0;

      for (const customer of targetCustomers) {
        const firstName = (customer.name || "").split(" ")[0];
        const message = campaign.messageTemplate
          .replace(/\{\{firstName\}\}/g, firstName)
          .replace(/\{\{businessName\}\}/g, store?.name || "")
          .replace(/\{\{bookingLink\}\}/g, bookingLink);

        if (campaign.channel === "sms" || campaign.channel === "both") {
          if (customer.phone) {
            if (smsSentThisRequest >= smsCreditsRemaining) {
              failedCount++;
            } else {
              const phone = customer.phone.replace(/\D/g, "");
              const e164 = phone.startsWith("1") ? `+${phone}` : `+1${phone}`;
              const result = await sendSms(storeId, e164, message, "campaign");
              if (result.success || result.skipped) {
                sentCount++;
                if (result.success) smsSentThisRequest++;
              } else {
                failedCount++;
              }
            }
          }
        }
        if (campaign.channel === "email" || campaign.channel === "both") {
          if (customer.email) {
            try {
              await sendEmail(storeId, customer.email, `Message from ${store?.name || "your salon"}`, `<p>${message.replace(/\n/g, "<br>")}</p>`);
              sentCount++;
            } catch {
              failedCount++;
            }
          }
        }
      }

      await db.update(campaigns).set({
        status: "sent",
        sentAt: now,
        sentCount,
        failedCount,
      }).where(eq(campaigns.id, campaignId));

      return res.json({ success: true, sentCount, failedCount });
    } catch (err) {
      console.error("[Campaigns] send error:", err);
      return res.status(500).json({ message: "Failed to send campaign" });
    }
  });

  // PATCH /api/campaigns/:id — edit a draft, rejected, or pending_review campaign.
  // Editing a pending_review campaign resets it to draft so it goes through the
  // full compliance pipeline again on the next send.
  app.patch("/api/campaigns/:id", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });
      const campaignId = Number(req.params.id);
      const { campaigns } = await import("@shared/schema/campaigns");

      const [existing] = await db.select().from(campaigns).where(
        and(eq(campaigns.id, campaignId), eq(campaigns.storeId, storeId))
      );
      if (!existing) return res.status(404).json({ message: "Campaign not found" });

      // Only allow editing if not already sent or sending
      const lockedStatuses = ["sent", "sending", "scheduled"];
      if (lockedStatuses.includes(existing.status)) {
        return res.status(409).json({ message: "Cannot edit a campaign that has already been sent or is currently sending." });
      }

      const { name, channel, audience, audienceValue, messageTemplate, scheduledAt } = req.body;

      // If it was pending_review or rejected, reset to draft so the owner must
      // explicitly resubmit and the compliance check runs fresh.
      const newStatus = ["pending_review", "rejected"].includes(existing.status) ? "draft" : existing.status;

      const [updated] = await db.update(campaigns).set({
        name: name ?? existing.name,
        channel: channel ?? existing.channel,
        audience: audience ?? existing.audience,
        audienceValue: audienceValue !== undefined ? audienceValue : existing.audienceValue,
        messageTemplate: messageTemplate ?? existing.messageTemplate,
        scheduledAt: scheduledAt !== undefined ? (scheduledAt ? new Date(scheduledAt) : null) : existing.scheduledAt,
        status: newStatus,
        // Clear previous rejection details so the card doesn't show stale info
        rejectionReason: null,
        reviewedAt: null,
      }).where(eq(campaigns.id, campaignId)).returning();

      return res.json(updated);
    } catch (err) {
      console.error("[Campaigns] PATCH error:", err);
      return res.status(500).json({ message: "Failed to update campaign" });
    }
  });

  app.delete("/api/campaigns/:id", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });
      const campaignId = Number(req.params.id);
      const { campaigns } = await import("@shared/schema/campaigns");
      await db.delete(campaigns).where(
        and(eq(campaigns.id, campaignId), eq(campaigns.storeId, storeId))
      );
      return res.json({ success: true });
    } catch (err) {
      console.error("[Campaigns] DELETE error:", err);
      return res.status(500).json({ message: "Failed to delete campaign" });
    }
  });

  // === API KEYS ===

  app.get("/api/api-keys", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });
      const { apiKeys } = await import("@shared/schema/api-keys");
      const keys = await db
        .select({
          id: apiKeys.id,
          name: apiKeys.name,
          keyPrefix: apiKeys.keyPrefix,
          scopes: apiKeys.scopes,
          isActive: apiKeys.isActive,
          lastUsedAt: apiKeys.lastUsedAt,
          expiresAt: apiKeys.expiresAt,
          createdAt: apiKeys.createdAt,
        })
        .from(apiKeys)
        .where(eq(apiKeys.storeId, storeId))
        .orderBy(desc(apiKeys.createdAt));
      return res.json(keys);
    } catch (err) {
      console.error("[ApiKeys] GET error:", err);
      return res.status(500).json({ message: "Failed to load API keys" });
    }
  });

  app.post("/api/api-keys", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });
      const { name } = req.body;
      if (!name) return res.status(400).json({ message: "name required" });

      const { apiKeys } = await import("@shared/schema/api-keys");
      const cryptoMod = await import("crypto");

      const rawKey = `sk_${cryptoMod.randomBytes(24).toString("hex")}`;
      const keyHash = cryptoMod.createHash("sha256").update(rawKey).digest("hex");
      const keyPrefix = rawKey.slice(0, 10);

      await db.insert(apiKeys).values({
        storeId,
        name,
        keyHash,
        keyPrefix,
        scopes: "read",
        isActive: true,
      });

      return res.json({ key: rawKey });
    } catch (err) {
      console.error("[ApiKeys] POST error:", err);
      return res.status(500).json({ message: "Failed to create API key" });
    }
  });

  app.delete("/api/api-keys/:id", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });
      const keyId = Number(req.params.id);
      const { apiKeys } = await import("@shared/schema/api-keys");
      await db.update(apiKeys).set({ isActive: false }).where(
        and(eq(apiKeys.id, keyId), eq(apiKeys.storeId, storeId))
      );
      return res.json({ success: true });
    } catch (err) {
      console.error("[ApiKeys] DELETE error:", err);
      return res.status(500).json({ message: "Failed to revoke API key" });
    }
  });

  // === SMS USAGE ===

  app.get("/api/sms-usage/:storeId", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [{ value: monthCount }] = await db
        .select({ value: count() })
        .from(smsLog)
        .where(
          and(
            eq(smsLog.storeId, storeId),
            gte(smsLog.sentAt, monthStart)
          )
        );

      const store = await storage.getStore(storeId);
      return res.json({
        currentMonth: Number(monthCount),
        tokensRemaining: store?.smsTokens ?? 0,
        month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
      });
    } catch (err) {
      console.error("[SmsUsage] GET error:", err);
      return res.status(500).json({ message: "Failed to load SMS usage" });
    }
  });

  // === SMS ACTIVITY LEDGER ===

  // GET /api/sms-activity/summary
  app.get("/api/sms-activity/summary", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });

      const days = Number(req.query.days ?? 30);
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const rows = await db
        .select({
          smsSource: smsLog.smsSource,
          messageType: smsLog.messageType,
          costEstimate: smsLog.costEstimate,
          status: smsLog.status,
        })
        .from(smsLog)
        .where(
          and(
            eq(smsLog.storeId, storeId),
            gte(smsLog.sentAt, since),
            eq(smsLog.status, "sent")
          )
        );

      const totalSent = rows.length;
      const fromAllowance = rows.filter(r => r.smsSource === "allowance").length;
      const fromCredits = rows.filter(r => r.smsSource === "credits").length;
      const estimatedCost = rows.reduce((sum, r) => sum + Number(r.costEstimate ?? 0), 0);
      const estimatedRevenue = totalSent * 0.03;

      const byType: Record<string, number> = {};
      for (const r of rows) {
        const t = r.messageType ?? "system";
        byType[t] = (byType[t] ?? 0) + 1;
      }

      return res.json({
        totalSent,
        fromAllowance,
        fromCredits,
        estimatedCost: Number(estimatedCost.toFixed(4)),
        estimatedRevenue: Number(estimatedRevenue.toFixed(2)),
        byType,
        days,
      });
    } catch (err) {
      console.error("[SmsActivity] summary error:", err);
      return res.status(500).json({ message: "Failed to load SMS summary" });
    }
  });

  // GET /api/sms-activity/log
  app.get("/api/sms-activity/log", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });

      const days = Number(req.query.days ?? 30);
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const page = Math.max(1, Number(req.query.page ?? 1));
      const pageSize = Math.min(100, Number(req.query.pageSize ?? 25));
      const typeFilter = req.query.type as string | undefined;
      const sourceFilter = req.query.source as string | undefined;

      const conditions = [
        eq(smsLog.storeId, storeId),
        gte(smsLog.sentAt, since),
      ];
      if (typeFilter) conditions.push(eq(smsLog.messageType, typeFilter));
      if (sourceFilter) conditions.push(eq(smsLog.smsSource, sourceFilter));

      const rows = await db
        .select()
        .from(smsLog)
        .where(and(...conditions))
        .orderBy(desc(smsLog.sentAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const [{ total }] = await db
        .select({ total: count() })
        .from(smsLog)
        .where(and(...conditions));

      return res.json({
        rows,
        total: Number(total),
        page,
        pageSize,
        totalPages: Math.ceil(Number(total) / pageSize),
      });
    } catch (err) {
      console.error("[SmsActivity] log error:", err);
      return res.status(500).json({ message: "Failed to load SMS log" });
    }
  });

  // GET /api/sms-activity/by-location (multi-location grouping)
  app.get("/api/sms-activity/by-location", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const days = Number(req.query.days ?? 30);
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const userStores = await storage.getStores(userId);
      if (!userStores.length) return res.json([]);

      const storeIds = userStores.map(s => s.id);

      const rows = await db
        .select({
          storeId: smsLog.storeId,
          smsSource: smsLog.smsSource,
          status: smsLog.status,
          costEstimate: smsLog.costEstimate,
        })
        .from(smsLog)
        .where(
          and(
            inArray(smsLog.storeId, storeIds),
            gte(smsLog.sentAt, since),
          )
        );

      const grouped = userStores.map(store => {
        const storeRows = rows.filter(r => r.storeId === store.id && r.status === "sent");
        return {
          storeId: store.id,
          storeName: store.name,
          totalSent: storeRows.length,
          fromAllowance: storeRows.filter(r => r.smsSource === "allowance").length,
          fromCredits: storeRows.filter(r => r.smsSource === "credits").length,
          estimatedCost: Number(storeRows.reduce((s, r) => s + Number(r.costEstimate ?? 0), 0).toFixed(4)),
        };
      });

      return res.json(grouped);
    } catch (err) {
      console.error("[SmsActivity] by-location error:", err);
      return res.status(500).json({ message: "Failed to load location data" });
    }
  });

  // GET /api/sms-activity/daily — per-day sent/failed counts
  app.get("/api/sms-activity/daily", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });

      const days = Math.min(90, Math.max(7, Number(req.query.days ?? 30)));
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const rows = await db
        .select({
          day: sql<string>`DATE(${smsLog.sentAt})`,
          sent: sql<number>`COUNT(*) FILTER (WHERE ${smsLog.status} = 'sent')`,
          failed: sql<number>`COUNT(*) FILTER (WHERE ${smsLog.status} = 'failed')`,
        })
        .from(smsLog)
        .where(and(eq(smsLog.storeId, storeId), gte(smsLog.sentAt, since)))
        .groupBy(sql`DATE(${smsLog.sentAt})`)
        .orderBy(sql`DATE(${smsLog.sentAt}) ASC`);

      return res.json(rows.map(r => ({
        date: r.day,
        sent: Number(r.sent),
        failed: Number(r.failed),
      })));
    } catch (err) {
      console.error("[SmsActivity] daily error:", err);
      return res.status(500).json({ message: "Failed to load daily data" });
    }
  });

  // === MULTI-LOCATION SUMMARY ===

  app.get("/api/multi-location/summary", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const stores = await storage.getStores(userId);
      if (stores.length === 0) return res.json([]);

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const summaries = await Promise.all(stores.map(async (store) => {
        const [apptResult] = await db
          .select({ value: count() })
          .from(appointments)
          .where(
            and(
              eq(appointments.storeId, store.id),
              gte(appointments.date, monthStart),
            )
          );

        const [clientResult] = await db
          .select({ value: count() })
          .from(clients)
          .where(and(eq(clients.storeId, store.id), isNull(clients.archivedAt)));

        const revenueRows = await db
          .select({ total: sql<string>`COALESCE(SUM(${appointments.totalPaid}), 0)` })
          .from(appointments)
          .where(
            and(
              eq(appointments.storeId, store.id),
              gte(appointments.date, monthStart),
              eq(appointments.status, "completed"),
            )
          );

        const revenue = Number(revenueRows[0]?.total || 0);
        const bookings = Number(apptResult.value || 0);
        const clientCount = Number(clientResult.value || 0);
        const fillRate = bookings > 0 ? Math.min(Math.round((bookings / Math.max(bookings * 1.3, 1)) * 100), 100) : 0;

        return {
          id: store.id,
          name: store.name,
          city: store.city,
          state: store.state,
          revenue,
          bookings,
          clients: clientCount,
          fillRate,
        };
      }));

      return res.json(summaries);
    } catch (err) {
      console.error("[MultiLocation] summary error:", err);
      return res.status(500).json({ message: "Failed to load summary" });
    }
  });

  // === PUBLIC API v1 (API key auth) ===

  app.get("/api/v1/appointments", async (req, res) => {
    const { apiKeyAuth } = await import("./middleware/api-auth");
    apiKeyAuth(req, res, async () => {
      try {
        const storeId = (req as any).apiKeyStoreId;
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const list = await db
          .select()
          .from(appointments)
          .where(eq(appointments.storeId, storeId))
          .orderBy(desc(appointments.date))
          .limit(limit);
        return res.json({ data: list, count: list.length });
      } catch (err) {
        return res.status(500).json({ message: "Internal error" });
      }
    });
  });

  app.get("/api/v1/clients", async (req, res) => {
    const { apiKeyAuth } = await import("./middleware/api-auth");
    apiKeyAuth(req, res, async () => {
      try {
        const storeId = (req as any).apiKeyStoreId;
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const list = await db
          .select()
          .from(clients)
          .where(and(eq(clients.storeId, storeId), isNull(clients.archivedAt)))
          .orderBy(desc(clients.id))
          .limit(limit);
        return res.json({ data: list, count: list.length });
      } catch (err) {
        return res.status(500).json({ message: "Internal error" });
      }
    });
  });

  app.get("/api/v1/services", async (req, res) => {
    const { apiKeyAuth } = await import("./middleware/api-auth");
    apiKeyAuth(req, res, async () => {
      try {
        const storeId = (req as any).apiKeyStoreId;
        const list = await db
          .select()
          .from(services)
          .where(eq(services.storeId, storeId))
          .orderBy(services.name);
        return res.json({ data: list, count: list.length });
      } catch (err) {
        return res.status(500).json({ message: "Internal error" });
      }
    });
  });

  // === MAIL SETTINGS ===
  app.get("/api/mail-settings/:storeId", async (req, res) => {
    if (!(await validateStoreOwnership(req, res))) return;
    const settings = await storage.getMailSettings(Number(req.params.storeId));
    if (settings) {
      const { mailgunApiKey, ...safe } = settings;
      return res.json({ ...safe, mailgunApiKey: mailgunApiKey ? "••••••••" : null });
    } else {
      return res.json(null);
    }
  });

  app.put("/api/mail-settings/:storeId", async (req, res) => {
    if (!(await validateStoreOwnership(req, res))) return;
    try {
      const storeId = Number(req.params.storeId);
      const mailSettingsInput = z.object({
        mailgunApiKey: z.string().optional().nullable(),
        mailgunDomain: z.string().optional().nullable(),
        senderEmail: z.string().optional().nullable(),
        bookingConfirmationEnabled: z.boolean().optional(),
        reminderEnabled: z.boolean().optional(),
        reminderHoursBefore: z.number().min(1).max(72).optional(),
        reviewRequestEnabled: z.boolean().optional(),
        googleReviewUrl: z.string().optional().nullable(),
        confirmationTemplate: z.string().optional().nullable(),
        reminderTemplate: z.string().optional().nullable(),
        reviewTemplate: z.string().optional().nullable(),
      }).parse(req.body);

      if (mailSettingsInput.mailgunApiKey === "••••••••") {
        delete mailSettingsInput.mailgunApiKey;
      }
      const settings = await storage.upsertMailSettings(storeId, { ...mailSettingsInput, storeId });
      const { mailgunApiKey, ...safe } = settings;
      return res.json({ ...safe, mailgunApiKey: mailgunApiKey ? "••••••••" : null });
    } catch (error) {
      console.error("Mail settings update error:", error);
      return res.status(400).json({ message: "Invalid input" });
    }
  });

  // === ADMIN ENDPOINTS ===
  app.get("/api/admin/accounts", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const [_accountsAdminCheck] = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId)).limit(1);
    if (!_accountsAdminCheck?.isAdmin) return res.status(403).json({ message: "Admin access required" });

    try {
      const allUsers = await db.select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        isAdmin: users.isAdmin,
        subscriptionStatus: users.subscriptionStatus,
        trialEndsAt: users.trialEndsAt,
        createdAt: users.createdAt,
      }).from(users);
      const allLocations = await db.select().from(locations);

      const locationsByUser = new Map<string, typeof allLocations[0]>();
      for (const loc of allLocations) {
        if (loc.userId && !locationsByUser.has(loc.userId)) {
          locationsByUser.set(loc.userId, loc);
        }
      }

      const now = new Date();
      const accounts = allUsers.map((user: any) => {
        const store = locationsByUser.get(user.id);

        // Compute a unified status
        let computedStatus: string;
        const subStatus = user.subscriptionStatus ?? "active";
        const locStatus = (store?.accountStatus ?? "Active").toLowerCase();
        const trialEnds = user.trialEndsAt ? new Date(user.trialEndsAt) : null;

        if (locStatus === "inactive") {
          computedStatus = "Inactive";
        } else if (subStatus === "trialing") {
          computedStatus = trialEnds && trialEnds < now ? "Expired" : "Free Trial";
        } else if (subStatus === "active") {
          computedStatus = "Subscriber";
        } else if (subStatus === "past_due") {
          computedStatus = "Expired";
        } else if (subStatus === "canceled") {
          computedStatus = "Inactive";
        } else {
          computedStatus = store?.accountStatus ?? "Active";
        }

        return {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          createdAt: user.createdAt,
          subscriptionStatus: subStatus,
          trialStartedAt: user.trialStartedAt,
          trialEndsAt: user.trialEndsAt,
          computedStatus,
          storeId: store?.id ?? null,
          storeName: store?.name ?? null,
          storeCity: store?.city ?? null,
          storeState: store?.state ?? null,
          storePhone: store?.phone ?? null,
          storeCategory: store?.category ?? null,
          accountStatus: store?.accountStatus ?? null,
        };
      });

      return res.json(accounts);
    } catch (error) {
      console.error("Error fetching accounts:", error);
      return res.status(500).json({ message: "Failed to fetch accounts" });
    }
  });

  // ─── Shared cascade-delete helper ───────────────────────────────────────────
  // Deletes every row associated with a store (location) in the correct order
  // to satisfy FK constraints, then removes the location row and the owner user.
  // Pass locationId = null to skip store-data deletion (user-only delete).
  async function deleteStoreAndOwner(locationId: number | null, ownerId: string | null): Promise<{ tablesCleared: string[]; error?: string }> {
    const client = await pool.connect();
    const tablesCleared: string[] = [];
    try {
      await client.query("BEGIN");

      if (locationId !== null) {
        const sid = locationId;

        // 1. Children of appointments
        await client.query(`DELETE FROM appointment_addons WHERE appointment_id IN (SELECT id FROM appointments WHERE store_id = $1)`, [sid]);
        tablesCleared.push("appointment_addons");

        // 2. Children of intake_forms
        await client.query(`DELETE FROM intake_form_fields WHERE form_id IN (SELECT id FROM intake_forms WHERE store_id = $1)`, [sid]);
        tablesCleared.push("intake_form_fields");
        await client.query(`DELETE FROM intake_form_responses WHERE store_id = $1`, [sid]);
        tablesCleared.push("intake_form_responses");

        // 3. Children of payroll_runs / payout_runs
        await client.query(`DELETE FROM payroll_run_items WHERE run_id IN (SELECT id FROM payroll_runs WHERE store_id = $1)`, [sid]);
        tablesCleared.push("payroll_run_items");
        await client.query(`DELETE FROM payout_run_items WHERE payout_run_id IN (SELECT id FROM payout_runs WHERE store_id = $1)`, [sid]);
        tablesCleared.push("payout_run_items");

        // 4. Children of pos_grids
        await client.query(`DELETE FROM pos_grid_slots WHERE grid_id IN (SELECT id FROM pos_grids WHERE store_id = $1)`, [sid]);
        tablesCleared.push("pos_grid_slots");

        // 5. Children of gift_cards
        await client.query(`DELETE FROM gift_card_transactions WHERE gift_card_id IN (SELECT id FROM gift_cards WHERE store_id = $1)`, [sid]);
        tablesCleared.push("gift_card_transactions");

        // 6. Children of service_options (linked to services)
        await client.query(`DELETE FROM service_options WHERE service_id IN (SELECT id FROM services WHERE store_id = $1)`, [sid]);
        tablesCleared.push("service_options");

        // 7. Client child tables
        for (const t of ["client_notes", "client_tags", "client_audit_logs", "client_custom_fields", "client_export_jobs", "client_import_jobs"]) {
          await client.query(`DELETE FROM ${t} WHERE store_id = $1`, [sid]);
          tablesCleared.push(t);
        }

        // 8. Direct store-scoped tables (children before parents)
        const storeScoped = [
          "appointment_addons",      // already done but idempotent
          "appointments",
          "client_phones",
          "clients",
          "customers",
          "staff_pins",
          "staff_intelligence",
          "staff_availability",
          "staff_settings",
          "timeclock",
          "staff",
          "services",
          "service_categories",
          "addons",
          "intake_forms",
          "gift_cards",
          "loyalty_transactions",
          "reviews",
          "google_review_responses",
          "google_reviews",
          "google_business_sync_logs",
          "google_business_locations",
          "google_business_profiles",
          "google_business_accounts",
          "google_service_sync_settings",
          "gbp_optimization_logs",
          "waitlist",
          "sms_log",
          "sms_conversations",
          "sms_settings",
          "mail_settings",
          "business_hours",
          "calendar_settings",
          "store_settings",
          "campaigns",
          "permissions",
          "roles",
          "products",
          "cash_drawer_sessions",
          "kiosk_checkins",
          "kiosk_turn",
          "turn_assignment_log",
          "payroll_runs",
          "payout_runs",
          "contractors",
          "commission_structures",
          "store_subscriptions",
          "store_payment_accounts",
          "stripe_settings",
          "api_keys",
          "pos_grids",
          "salon_resources",
          "pro_crews",
          "pro_customers",
          "pro_estimates",
          "pro_invoices",
          "pro_order_notes",
          "pro_service_orders",
          "intelligence_interventions",
          "client_intelligence",
          "dead_seat_patterns",
          "growth_score_snapshots",
          "staff_intelligence",
          "app",
        ];
        for (const t of storeScoped) {
          try {
            await client.query(`DELETE FROM ${t} WHERE store_id = $1`, [sid]);
            tablesCleared.push(t);
          } catch (_e) { /* table may not exist yet or column name differs — skip */ }
        }

        // salon_id variant tables
        for (const t of ["billing_activity_logs", "customer_billing_profiles", "invoice_records", "payment_transactions", "refunds", "subscription_plan_changes"]) {
          try {
            await client.query(`DELETE FROM ${t} WHERE salon_id = $1`, [sid]);
            tablesCleared.push(t);
          } catch (_e) {}
        }

        // store_number variant tables — get the store_number from locations first
        const locRow = await client.query(`SELECT store_number FROM locations WHERE id = $1`, [sid]);
        if (locRow.rows.length > 0 && locRow.rows[0].store_number !== null) {
          const snum = locRow.rows[0].store_number;
          for (const t of ["stripe_customers", "subscriptions"]) {
            try {
              await client.query(`DELETE FROM ${t} WHERE store_number = $1`, [snum]);
              tablesCleared.push(t);
            } catch (_e) {}
          }
        }

        // Finally delete the location row
        await client.query(`DELETE FROM locations WHERE id = $1`, [sid]);
        tablesCleared.push("locations");
      }

      // Delete the user account
      if (ownerId) {
        await client.query(`DELETE FROM users WHERE id = $1`, [ownerId]);
        tablesCleared.push("users");
      }

      await client.query("COMMIT");
      return { tablesCleared };
    } catch (err: any) {
      await client.query("ROLLBACK");
      console.error("[deleteStoreAndOwner] error:", err);
      return { tablesCleared, error: err?.message ?? String(err) };
    } finally {
      client.release();
    }
  }

  // DELETE /api/admin/stores/:locationId  — full cascade delete by location (store) id
  app.delete("/api/admin/stores/:locationId", async (req, res) => {
    const adminId = (req.session as any)?.userId;
    if (!adminId) return res.status(401).json({ message: "Unauthorized" });
    const [_chk] = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, adminId)).limit(1);
    if (!_chk?.isAdmin) return res.status(403).json({ message: "Admin access required" });

    const locationId = parseInt(req.params.locationId, 10);
    if (isNaN(locationId)) return res.status(400).json({ message: "Invalid location ID" });

    try {
      // Find the owner so we can delete their user row too
      const [loc] = await db.select({ userId: locations.userId }).from(locations).where(eq(locations.id, locationId)).limit(1);
      const ownerId = loc?.userId ?? null;

      const result = await deleteStoreAndOwner(locationId, ownerId);
      if (result.error) return res.status(500).json({ message: "Deletion failed", detail: result.error });

      return res.json({ message: "Store and all associated data deleted successfully", tablesCleared: result.tablesCleared });
    } catch (error: any) {
      console.error("Error deleting store:", error);
      return res.status(500).json({ message: "Failed to delete store" });
    }
  });

  app.delete("/api/admin/accounts/:userId", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const [_deleteAdminCheck] = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId)).limit(1);
    if (!_deleteAdminCheck?.isAdmin) return res.status(403).json({ message: "Admin access required" });

    const userToDelete = req.params.userId;

    try {
      if (userId === userToDelete) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }

      // Find the store owned by this user (if any) and cascade-delete everything
      const [loc] = await db.select({ id: locations.id }).from(locations).where(eq(locations.userId, userToDelete)).limit(1);
      const locationId = loc?.id ?? null;

      const result = await deleteStoreAndOwner(locationId, userToDelete);
      if (result.error) return res.status(500).json({ message: "Deletion failed", detail: result.error });

      return res.json({ message: "Account and all associated data deleted successfully", tablesCleared: result.tablesCleared });
    } catch (error) {
      console.error("Error deleting account:", error);
      return res.status(500).json({ message: "Failed to delete account" });
    }
  });

  // DELETE /api/user/delete-account  — account owner self-deletes everything
  app.delete("/api/user/delete-account", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { confirmPhrase } = req.body as { confirmPhrase?: string };
    if (confirmPhrase !== "DELETE MY ACCOUNT") {
      return res.status(400).json({ message: "Confirmation phrase incorrect. Type DELETE MY ACCOUNT to confirm." });
    }

    try {
      const [loc] = await db.select({ id: locations.id }).from(locations).where(eq(locations.userId, userId)).limit(1);
      const locationId = loc?.id ?? null;

      const result = await deleteStoreAndOwner(locationId, userId);
      if (result.error) return res.status(500).json({ message: "Deletion failed", detail: result.error });

      // Destroy session
      req.session.destroy(() => {});
      return res.json({ message: "Your account and all associated data have been permanently deleted." });
    } catch (error) {
      console.error("Error in self-delete:", error);
      return res.status(500).json({ message: "Failed to delete account" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GOOGLE BUSINESS PROFILE INTEGRATION
  // ─────────────────────────────────────────────────────────────────────────
  // SEPARATION RULES (enforced by design):
  //   • All routes here use GOOGLE_BUSINESS_* credentials ONLY.
  //   • NEVER use business tokens to authenticate a user session.
  //   • All routes below require an active user session (login first).
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/google-business/connect
   *
   * Browser-redirect entry point for the Business Profile OAuth flow.
   * Requires: active user session + storeId query param.
   * Generates a CSRF-protected state, then redirects the browser directly
   * to Google's consent page (business.manage scope only — no login scopes).
   */

  app.get("/api/google-business/connect", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) {
      console.warn("[Google Business OAuth] /connect — unauthenticated request rejected");
      return res.redirect("/auth?reason=login_required");
    }

    const { allowed, retryAfterSecs } = checkOAuthRateLimit(userId);
    if (!allowed) {
      const mins = Math.ceil(retryAfterSecs / 60);
      console.warn(`[Google Business OAuth] /connect — rate limit hit for userId=${userId}`);
      return res.status(429).send(`Too many connection attempts. Please wait ${mins} minute${mins !== 1 ? "s" : ""} and try again.`);
    }

    const storeId = req.query.storeId ? Number(req.query.storeId) : null;
    if (!storeId) {
      return res.status(400).json({ message: "storeId query param is required" });
    }

    try {
      const csrf         = crypto.randomBytes(16).toString("hex");
      const statePayload = Buffer.from(JSON.stringify({ csrf, storeId })).toString("base64url");
      (req.session as any).googleOAuthState   = csrf;
      (req.session as any).googleOAuthStoreId = storeId;

      const redirectUri  = getGoogleBusinessCallbackUrl();
      const clientId     = process.env.GOOGLE_BUSINESS_CLIENT_ID     ?? process.env.GOOGLE_CLIENT_ID     ?? "";
      const clientSecret = process.env.GOOGLE_BUSINESS_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "";

      console.log("[Google Business OAuth] /connect — generating redirect URL");
      console.log("[Google Business OAuth]   client_id   :", clientId ? `${clientId.slice(0, 12)}…` : "(NOT SET)");
      console.log("[Google Business OAuth]   redirect_uri:", redirectUri || "(NOT SET)");
      console.log("[Google Business OAuth]   storeId     :", storeId);
      console.log("[Google Business OAuth]   scopes      : business.manage");

      if (!clientId || !clientSecret || !redirectUri) {
        console.error("[Google Business OAuth] Missing GOOGLE_BUSINESS_CLIENT_ID, GOOGLE_BUSINESS_CLIENT_SECRET, or GOOGLE_BUSINESS_CALLBACK_URL");
        return res.status(500).json({
          message: "Google Business OAuth is not configured. Set GOOGLE_BUSINESS_CLIENT_ID, GOOGLE_BUSINESS_CLIENT_SECRET, and GOOGLE_BUSINESS_CALLBACK_URL.",
        });
      }

      const apiManager = new GoogleBusinessAPIManager({ clientId, clientSecret, redirectUri });
      // Only business.manage scope — never openid/profile/email (those belong to login)
      const authUrl = apiManager.getAuthUrl(
        ["https://www.googleapis.com/auth/business.manage"],
        statePayload
      );

      console.log("[Google Business OAuth] /connect — redirecting browser to Google consent page");
      req.session.save(() => res.redirect(authUrl));
    } catch (error) {
      console.error("[Google Business OAuth] /connect — error generating auth URL:", error);
      return res.status(500).json({ message: "Failed to initiate Google Business connection" });
    }
  });

  /**
   * Get Google OAuth authorization URL (JSON response variant for frontend-mediated flow).
   * Embeds storeId + a CSRF token inside the OAuth state parameter (base64url-encoded JSON)
   * so the server-side callback can restore context without relying on post-redirect data.
   */
  app.get("/api/google-business/auth-url", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { allowed, retryAfterSecs } = checkOAuthRateLimit(userId);
    if (!allowed) {
      const mins = Math.ceil(retryAfterSecs / 60);
      console.warn(`[Google Business OAuth] /auth-url — rate limit hit for userId=${userId}`);
      return res.status(429).json({ message: `Too many connection attempts. Please wait ${mins} minute${mins !== 1 ? "s" : ""} and try again.` });
    }

    const storeId = req.query.storeId ? Number(req.query.storeId) : null;
    if (!storeId) {
      return res.status(400).json({ message: "storeId query param is required" });
    }

    try {
      // Build state: a CSRF token + storeId packed into a single base64url blob
      const csrf = crypto.randomBytes(16).toString("hex");
      const statePayload = Buffer.from(JSON.stringify({ csrf, storeId })).toString("base64url");
      // Store only the csrf half in the session for later verification
      (req.session as any).googleOAuthState = csrf;
      (req.session as any).googleOAuthStoreId = storeId; // belt-and-suspenders fallback
      const requestedReturnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : "";
      (req.session as any).googleOAuthReturnTo =
        requestedReturnTo.startsWith("/") && !requestedReturnTo.startsWith("//")
          ? requestedReturnTo
          : "/google-business";

      // BUSINESS integration credentials — NEVER shared with the login system
      const redirectUri  = getGoogleBusinessCallbackUrl();
      const clientId     = process.env.GOOGLE_BUSINESS_CLIENT_ID     ?? process.env.GOOGLE_CLIENT_ID     ?? "";
      const clientSecret = process.env.GOOGLE_BUSINESS_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "";

      console.log("[Google Business OAuth] Generating auth URL");
      console.log("[Google Business OAuth]   client_id    :", clientId ? `${clientId.slice(0, 12)}…` : "(NOT SET)");
      console.log("[Google Business OAuth]   client_secret:", clientSecret ? "(set)" : "(NOT SET — will fail)");
      console.log("[Google Business OAuth]   redirect_uri :", redirectUri || "(NOT SET)");
      console.log("[Google Business OAuth]   storeId      :", storeId);
      console.log("[Google Business OAuth]   csrf         :", csrf);

      if (!clientId || !clientSecret || !redirectUri) {
        console.error("[Google Business OAuth] Missing required env vars: GOOGLE_BUSINESS_CLIENT_ID, GOOGLE_BUSINESS_CLIENT_SECRET, or GOOGLE_BUSINESS_CALLBACK_URL");
        return res.status(500).json({
          message: "Google Business OAuth is not fully configured. Set GOOGLE_BUSINESS_CLIENT_ID, GOOGLE_BUSINESS_CLIENT_SECRET, and GOOGLE_BUSINESS_CALLBACK_URL in environment variables.",
        });
      }

      const apiManager = new GoogleBusinessAPIManager({ clientId, clientSecret, redirectUri });
      const authUrl = apiManager.getAuthUrl(undefined, statePayload);

      console.log("[Google Business OAuth] Auth URL generated successfully — scope: business.manage only");

      // Save the session before responding so the CSRF state is persisted
      req.session.save(() => res.json({ authUrl }));
    } catch (error) {
      console.error("[Google Business OAuth] Error generating auth URL:", error);
      return res.status(500).json({ message: "Failed to generate auth URL" });
    }
  });

  /**
   * Server-side OAuth redirect callback — GET /api/google-business/callback
   *
   * Google redirects here after the business.manage consent screen.
   * Steps:
   *   1. Decode + verify CSRF state
   *   2. Exchange code for tokens using GOOGLE_BUSINESS_* credentials only
   *   3. Attempt to fetch connected Google account email (graceful skip if scope unavailable)
   *   4. Fetch all Business Profile accounts
   *   5. Fetch locations for each account
   *   6. Upsert profile row in DB (tokens + account info; location is selected separately)
   *   7. Stash result in session for frontend pickup
   *   8. Redirect to /reviews
   *
   * redirect_uri must match exactly: https://certxa.com/api/google-business/callback
   */
  app.get("/api/google-business/callback", async (req, res) => {
    const { code, state, error: oauthError } = req.query as Record<string, string>;
    const returnTo = (req.session as any)?.googleOAuthReturnTo || "/google-business";
    const oauthRedirect = (params: string) => `${returnTo}${returnTo.includes("?") ? "&" : "?"}${params}`;

    console.log("[Google Business OAuth] ── Callback received ──────────────────────────────");
    console.log("[Google Business OAuth]   code  :", code ? `${String(code).slice(0, 20)}… (${String(code).length} chars)` : "(none)");
    console.log("[Google Business OAuth]   state :", state ? `${String(state).slice(0, 30)}…` : "(none)");
    console.log("[Google Business OAuth]   error :", oauthError ?? "(none)");

    if (oauthError) {
      console.warn("[Google Business OAuth] User denied access or Google returned an error:", oauthError);
      return res.redirect(oauthRedirect(`google_error=${encodeURIComponent(oauthError)}`));
    }

    if (!code || !state) {
      console.error("[Google Business OAuth] Missing code or state in callback");
      return res.redirect(oauthRedirect("google_error=missing_params"));
    }

    // ── Decode & verify CSRF state ───────────────────────────────────────────
    let storeId: number;
    let csrf: string;
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
      storeId = Number(decoded.storeId);
      csrf    = decoded.csrf;
      console.log("[Google Business OAuth]   decoded storeId:", storeId, "  csrf:", csrf);
    } catch {
      console.error("[Google Business OAuth] Failed to decode state payload");
      return res.redirect(oauthRedirect("google_error=invalid_state"));
    }

    const expectedCsrf    = (req.session as any).googleOAuthState;
    const fallbackStoreId = (req.session as any).googleOAuthStoreId;
    console.log("[Google Business OAuth]   session csrf    :", expectedCsrf    ?? "(not in session — may have expired)");
    console.log("[Google Business OAuth]   session storeId :", fallbackStoreId ?? "(not in session)");

    if (expectedCsrf && expectedCsrf !== csrf) {
      console.error("[Google Business OAuth] CSRF mismatch — possible replay or CSRF attack");
      return res.redirect(oauthRedirect("google_error=csrf_mismatch"));
    }
    if (!storeId && fallbackStoreId) storeId = Number(fallbackStoreId);
    if (!storeId) {
      console.error("[Google Business OAuth] Could not determine storeId from state or session");
      return res.redirect(oauthRedirect("google_error=missing_store"));
    }

    delete (req.session as any).googleOAuthState;
    delete (req.session as any).googleOAuthStoreId;

    // ── Exchange code for tokens ─────────────────────────────────────────────
    try {
      // BUSINESS credentials only — never shared with the login system
      const redirectUri  = getGoogleBusinessCallbackUrl();
      const clientId     = process.env.GOOGLE_BUSINESS_CLIENT_ID     ?? process.env.GOOGLE_CLIENT_ID     ?? "";
      const clientSecret = process.env.GOOGLE_BUSINESS_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "";

      console.log("[Google Business OAuth] Token exchange — redirect_uri:", redirectUri);
      const apiManager = new GoogleBusinessAPIManager({ clientId, clientSecret, redirectUri });
      const tokens = await apiManager.getTokensFromCode(code);

      if (!tokens.access_token) {
        console.error("[Google Business OAuth] No access_token returned — aborting");
        return res.redirect(oauthRedirect("google_error=no_access_token"));
      }

      // ── Attempt to fetch account email (expected to fail with business.manage only) ──
      // getGoogleUserInfo() requires openid/email scope. With business.manage-only tokens
      // it returns null gracefully — that is expected behaviour.
      console.log("[Google Business OAuth] Attempting to fetch Google account email (may be skipped with business.manage-only scope)…");
      const userInfo = await apiManager.getGoogleUserInfo();
      console.log("[Google Business OAuth]   email:", userInfo?.email ?? "(not available — expected with business.manage-only scope)");

      // ── Fetch Business Profile accounts ─────────────────────────────────────
      console.log("[Google Business OAuth] Fetching Business Profile accounts…");
      let accounts: any[] = [];
      let accountsFetchQuotaError = false;
      let accountsFetchErrorStatus: number | null = null;
      let accountsFetchErrorMessage: string | null = null;
      try {
        const accountsData = await apiManager.getBusinessAccounts();
        accounts = (accountsData.accounts ?? []) as any[];
        console.log("[Google Business OAuth]   accounts found:", accounts.length);
        accounts.forEach((a: any, i: number) => {
          console.log(`[Google Business OAuth]   [${i}] name=${a.name}  accountName=${a.accountName ?? a.displayName ?? "(none)"}`);
        });
      } catch (acctErr: any) {
        const status = acctErr?.code ?? acctErr?.response?.status ?? acctErr?.status;
        const errMsg = acctErr?.response?.data?.error?.message ?? acctErr?.message ?? "unknown error";
        accountsFetchErrorStatus  = status ?? null;
        accountsFetchErrorMessage = errMsg;
        console.error("[Google Business OAuth] Failed to fetch accounts — status:", status);
        console.error("[Google Business OAuth] Error detail:", errMsg);
        if (status === 429) {
          accountsFetchQuotaError = true;
          console.warn("[Google Business OAuth] 429: Quota exceeded fetching accounts — tokens saved, user can retry without re-auth");
        }
        if (status === 403) {
          console.error("[Google Business OAuth] 403: Ensure 'My Business Account Management API' is enabled in Google Cloud Console and business.manage scope is approved on the consent screen.");
        }
        // Don't abort — save tokens so user can retry from the UI
      }

      // ── Fetch locations for each account ─────────────────────────────────────
      const allLocations: any[] = [];
      for (const account of accounts) {
        console.log(`[Google Business OAuth] Fetching locations for account: ${account.name}`);
        try {
          const locData = await apiManager.getLocations(account.name);
          const locs    = locData.locations ?? [];
          console.log(`[Google Business OAuth]   locations found: ${locs.length}`);
          locs.forEach((l: any, i: number) => {
            console.log(`[Google Business OAuth]   [${i}] name=${l.name}  title=${l.title ?? l.displayName ?? "(none)"}`);
          });
          allLocations.push(...locs.map((l: any) => ({ ...l, _accountName: account.name })));
        } catch (locErr: any) {
          console.error(`[Google Business OAuth] Failed to fetch locations for ${account.name}:`, locErr?.message ?? locErr);
        }
      }

      // ── Upsert profile in DB ─────────────────────────────────────────────────
      console.log("[Google Business OAuth] Upserting profile in DB for storeId:", storeId);
      const existingProfile = await db
        .select()
        .from(googleBusinessProfiles)
        .where(eq(googleBusinessProfiles.storeId, storeId))
        .limit(1);

      let profileRow: typeof googleBusinessProfiles.$inferSelect;
      const firstAccount = accounts[0];

      if (existingProfile.length) {
        const updated = await db
          .update(googleBusinessProfiles)
          .set({
            accessToken:                 encryptToken(tokens.access_token),
            refreshToken:                tokens.refresh_token ? encryptToken(tokens.refresh_token) : existingProfile[0].refreshToken,
            tokenExpiresAt:              tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            googleAccountEmail:          userInfo?.email ?? existingProfile[0].googleAccountEmail,
            businessAccountId:           firstAccount?.name ?? existingProfile[0].businessAccountId,
            businessAccountResourceName: firstAccount?.name ?? existingProfile[0].businessAccountResourceName,
            isConnected:                 false, // reset — user must re-select location
            updatedAt:                   new Date(),
          })
          .where(eq(googleBusinessProfiles.storeId, storeId))
          .returning();
        profileRow = updated[0];
        console.log("[Google Business OAuth] Profile updated — id:", profileRow.id);
      } else {
        const inserted = await db
          .insert(googleBusinessProfiles)
          .values({
            storeId,
            accessToken:                 encryptToken(tokens.access_token),
            refreshToken:                encryptToken(tokens.refresh_token) ?? null,
            tokenExpiresAt:              tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            googleAccountEmail:          userInfo?.email ?? null,
            businessAccountId:           firstAccount?.name ?? null,
            businessAccountResourceName: firstAccount?.name ?? null,
            isConnected:                 false,
          })
          .returning();
        profileRow = inserted[0];
        console.log("[Google Business OAuth] Profile inserted — id:", profileRow.id);
      }

      // ── Upsert googleBusinessAccounts rows (one per account returned) ────────
      // Each account gets its own row with the OAuth tokens so tokens are stored
      // at account level (per the schema design), not just on the legacy profile row.
      const sessionUserId: string | null = (req.session as any)?.userId ?? null;
      if (sessionUserId && accounts.length) {
        console.log(`[Google Business OAuth] Upserting ${accounts.length} account(s) into googleBusinessAccounts…`);
        for (const acct of accounts) {
          try {
            const existingAcct = await db
              .select({ id: googleBusinessAccounts.id })
              .from(googleBusinessAccounts)
              .where(and(
                eq(googleBusinessAccounts.storeId, storeId),
                eq(googleBusinessAccounts.googleAccountId, acct.name),
              ))
              .limit(1);

            if (existingAcct.length) {
              await db
                .update(googleBusinessAccounts)
                .set({
                  accountName:  acct.accountName ?? acct.displayName ?? null,
                  accessToken:  encryptToken(tokens.access_token),
                  refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : undefined,
                  tokenExpiry:  tokens.expiry_date ? new Date(tokens.expiry_date) : null,
                  scopes:       tokens.scope ?? null,
                  updatedAt:    new Date(),
                })
                .where(eq(googleBusinessAccounts.id, existingAcct[0].id));
              console.log(`[Google Business OAuth]   account updated — id=${existingAcct[0].id}  googleAccountId="${acct.name}"`);
            } else {
              const inserted = await db
                .insert(googleBusinessAccounts)
                .values({
                  storeId,
                  userId:          sessionUserId,
                  googleAccountId: acct.name,
                  accountName:     acct.accountName ?? acct.displayName ?? null,
                  accessToken:     encryptToken(tokens.access_token),
                  refreshToken:    encryptToken(tokens.refresh_token) ?? null,
                  tokenExpiry:     tokens.expiry_date ? new Date(tokens.expiry_date) : null,
                  scopes:          tokens.scope ?? null,
                })
                .returning({ id: googleBusinessAccounts.id });
              console.log(`[Google Business OAuth]   account inserted — id=${inserted[0].id}  googleAccountId="${acct.name}"`);
            }
          } catch (acctWriteErr: any) {
            console.warn(`[Google Business OAuth]   could not upsert account "${acct.name}":`, acctWriteErr?.message ?? acctWriteErr);
          }
        }
      } else {
        if (!sessionUserId) console.warn("[Google Business OAuth] No userId in session — skipping googleBusinessAccounts upsert");
        if (!accounts.length)  console.warn("[Google Business OAuth] No accounts returned — skipping googleBusinessAccounts upsert");
      }

      // ── Store result in session for frontend pickup ──────────────────────────
      (req.session as any).googleConnectionResult = {
        success:              true,
        email:                userInfo?.email ?? null,
        accounts,
        businesses:           allLocations,
        profileId:            profileRow.id,
        storeId,
        quotaError:           accountsFetchQuotaError || undefined,
        accountsFetchStatus:  accountsFetchErrorStatus  ?? undefined,
        accountsFetchMessage: accountsFetchErrorMessage ?? undefined,
      };

      console.log("[Google Business OAuth] ── Callback complete ──────────────────────────────");
      console.log("[Google Business OAuth]   email     :", userInfo?.email ?? "(not available)");
      console.log("[Google Business OAuth]   accounts  :", accounts.length);
      console.log("[Google Business OAuth]   locations :", allLocations.length);
      console.log("[Google Business OAuth]   profileId :", profileRow.id);
      console.log("[Google Business OAuth]   → redirecting to /google-business?google_connected=1");

      req.session.save(() => {
        return res.redirect(oauthRedirect(`google_connected=1&storeId=${storeId}`));
      });
    } catch (error: any) {
      console.error("[Google Business OAuth] ── Callback FAILED ──────────────────────────────");
      console.error("[Google Business OAuth] Error:", error?.message ?? error);
      console.error("[Google Business OAuth] Stack:", error?.stack ?? "(no stack)");

      const status = error?.code ?? error?.response?.status ?? error?.status;
      console.error("[Google Business OAuth] HTTP status:", status ?? "(none)");

      if (status === 429) {
        console.error("[Google Business OAuth] 429: API quota exceeded — request increase at https://support.google.com/business/contact/api_default_quota_increase");
        return res.redirect(oauthRedirect("google_error=quota_exceeded"));
      }
      if (status === 403) {
        console.error("[Google Business OAuth] 403: API access denied. Check:");
        console.error("[Google Business OAuth]   - 'My Business Account Management API' enabled in Google Cloud Console");
        console.error("[Google Business OAuth]   - business.manage scope approved on OAuth consent screen");
        console.error("[Google Business OAuth]   - redirect_uri matches exactly:", getGoogleBusinessCallbackUrl());
        return res.redirect(oauthRedirect("google_error=access_denied"));
      }
      return res.redirect(oauthRedirect("google_error=server_error"));
    }
  });

  /**
   * GET /google-business
   *
   * Always passes through to the SPA. The frontend detects ?code=...&state=... or
   * ?google_error=... and drives the OAuth completion itself via
   * POST /api/google-business/exchange-code.
   *
   * Historical note: this route previously ran a server-side code exchange and
   * stashed the result in req.session. That broke when the Google cross-site redirect
   * arrived with a new/different session cookie, so the frontend could never pick up
   * the connection result. The exchange is now done client-side via exchange-code.
   */
  app.get("/google-business", (_req, _res, next) => next());

  app.get("/api/google-business/quota-status", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { getQuotaGuardStatus } = await import("./google-quota-guard");
    return res.json(getQuotaGuardStatus());
  });

  /**
   * Manually clear the in-memory + on-disk quota cooldown.
   * Useful when a transient error (e.g. a short-term 429) triggered an overly-long lockout.
   * POST /api/google-business/clear-quota-cooldown
   */
  app.post("/api/google-business/clear-quota-cooldown", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const { clearQuotaCooldown, getQuotaGuardStatus } = await import("./google-quota-guard");
    clearQuotaCooldown();
    return res.json({ message: "Quota cooldown cleared.", status: getQuotaGuardStatus() });
  });

  /**
   * Retries fetching Google Business accounts + locations using already-stored
   * OAuth tokens. Called when the initial callback succeeded (tokens saved) but
   * getBusinessAccounts() hit a 429 quota limit, leaving accounts: [] in the session.
   * No re-auth required — uses the refresh_token from google_business_profiles.
   *
   * Body: { storeId: number }
   * Returns: { accounts, businesses, profileId }
   */
  app.post("/api/google-business/retry-fetch-accounts", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { storeId } = req.body;
    if (!storeId) return res.status(400).json({ message: "storeId is required" });

    console.log(`[GBP] retry-fetch-accounts — storeId=${storeId}`);

    // Check quota cooldown BEFORE hitting the API
    const { isQuotaCoolingDown } = await import("./google-quota-guard");
    const cooldown = isQuotaCoolingDown();
    if (cooldown.coolingDown) {
      const secs = Math.ceil(cooldown.retryAfterMs / 1000);
      console.warn(`[GBP] retry-fetch-accounts — blocked by quota cooldown, ${secs}s remaining`);
      return res.status(429).json({
        message: `Google API quota cooldown active. Please wait ${secs} seconds before retrying.`,
        retryAfterMs: cooldown.retryAfterMs,
        retryAfterSecs: secs,
      });
    }

    try {
      const profiles = await db
        .select()
        .from(googleBusinessProfiles)
        .where(eq(googleBusinessProfiles.storeId, Number(storeId)))
        .limit(1);

      if (!profiles.length) {
        return res.status(404).json({ message: "No Google profile found for this store. Please reconnect." });
      }

      const profileRow = profiles[0];
      if (!profileRow.accessToken && !profileRow.refreshToken) {
        return res.status(400).json({ message: "No stored tokens found. Please reconnect your Google account." });
      }

      const apiManager = createApiManagerFromProfile(profileRow);

      let accounts: any[] = [];
      try {
        const accountsData = await apiManager.getBusinessAccounts();
        accounts = (accountsData.accounts ?? []) as any[];
        console.log(`[GBP] retry-fetch-accounts — accounts found: ${accounts.length}`);
      } catch (err: any) {
        const status = err?.code ?? err?.response?.status ?? err?.status;
        console.error(`[GBP] retry-fetch-accounts — getBusinessAccounts failed — status: ${status}  message: ${err?.message}`);
        if (status === 429) {
          const retryAfterMs = err?.retryAfterMs ?? 2 * 60 * 1000;
          const retryAfterSecs = Math.ceil(retryAfterMs / 1000);
          return res.status(429).json({
            message: `Google API quota exceeded. Please wait ${retryAfterSecs} seconds before retrying.`,
            retryAfterMs,
            retryAfterSecs,
          });
        }
        if (status === 403) {
          return res.status(403).json({ message: "Google denied access. Ensure the Business Profile API is enabled in Google Cloud Console." });
        }
        throw err;
      }

      if (!accounts.length) {
        return res.status(404).json({
          message: "No Google Business accounts found on this Google account. Make sure you have a Business Profile at business.google.com.",
        });
      }

      // Fetch locations for each account
      const allLocations: any[] = [];
      for (const account of accounts) {
        try {
          const locData = await apiManager.getLocations(account.name);
          const locs = locData.locations ?? [];
          allLocations.push(...locs.map((l: any) => ({ ...l, _accountName: account.name })));
          console.log(`[GBP] retry-fetch-accounts — fetched ${locs.length} location(s) for ${account.name}`);
        } catch (locErr: any) {
          console.error(`[GBP] retry-fetch-accounts — failed to fetch locations for ${account.name}:`, locErr?.message ?? locErr);
        }
      }

      // Upsert accounts into googleBusinessAccounts so future stored-accounts lookups work
      for (const acct of accounts) {
        try {
          const existing = await db
            .select({ id: googleBusinessAccounts.id })
            .from(googleBusinessAccounts)
            .where(and(
              eq(googleBusinessAccounts.storeId, Number(storeId)),
              eq(googleBusinessAccounts.googleAccountId, acct.name),
            ))
            .limit(1);

          if (existing.length) {
            await db
              .update(googleBusinessAccounts)
              .set({ accountName: acct.accountName ?? acct.displayName ?? null, updatedAt: new Date() })
              .where(eq(googleBusinessAccounts.id, existing[0].id));
            console.log(`[GBP] retry-fetch-accounts — updated account id=${existing[0].id}  googleAccountId="${acct.name}"`);
          } else {
            // Decrypt-then-re-encrypt so that legacy plaintext values from profileRow
            // are always stored encrypted, regardless of their original form in the DB.
            await db.insert(googleBusinessAccounts).values({
              storeId:         Number(storeId),
              userId,
              googleAccountId: acct.name,
              accountName:     acct.accountName ?? acct.displayName ?? null,
              accessToken:     encryptToken(decryptToken(profileRow.accessToken)),
              refreshToken:    encryptToken(decryptToken(profileRow.refreshToken)) ?? null,
              tokenExpiry:     profileRow.tokenExpiresAt,
              scopes:          null,
            });
            console.log(`[GBP] retry-fetch-accounts — inserted account googleAccountId="${acct.name}"`);
          }
        } catch (acctErr: any) {
          console.warn(`[GBP] retry-fetch-accounts — could not upsert account "${acct.name}":`, acctErr?.message ?? acctErr);
        }
      }

      console.log(`[GBP] retry-fetch-accounts — done: ${accounts.length} account(s), ${allLocations.length} location(s)`);
      return res.json({ accounts, businesses: allLocations, profileId: profileRow.id });
    } catch (err: any) {
      console.error("[GBP] retry-fetch-accounts FAILED:", err?.message ?? err);
      return res.status(500).json({ message: "Failed to fetch accounts: " + (err?.message ?? "unknown error") });
    }
  });

  /**
   * POST /api/google-business/exchange-code
   *
   * Frontend-driven OAuth completion. The browser receives ?code=...&state=... from
   * Google, then posts them here to exchange for tokens, fetch accounts+locations,
   * and save everything to the DB in one authenticated call.
   *
   * This avoids the session-identity mismatch bug of the old server-side interceptor:
   * because the browser is already logged in when it makes this POST, we can use
   * the authenticated session reliably.
   *
   * Body: { code: string, state?: string, storeId: number }
   * Returns: { success, accounts, businesses, profileId }
   */
  app.post("/api/google-business/exchange-code", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { code, state, storeId: rawStoreId } = req.body as {
      code?: string;
      state?: string;
      storeId?: number | string;
    };

    if (!code) {
      return res.status(400).json({ message: "code is required" });
    }

    // Prefer storeId from body; fall back to value encoded in base64url state blob
    let storeId = rawStoreId ? Number(rawStoreId) : 0;
    if (!storeId && state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
        if (decoded.storeId) storeId = Number(decoded.storeId);
      } catch {
        console.warn("[exchange-code] Could not decode state payload to extract storeId");
      }
    }
    if (!storeId) {
      return res.status(400).json({ message: "storeId is required (pass in body or encoded in state)" });
    }

    // Enforce tenancy: user can only connect GBP for stores they own.
    const ownedStore = await storage.getStore(storeId);
    if (!ownedStore || ownedStore.userId !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const clientId     = process.env.GOOGLE_BUSINESS_CLIENT_ID     ?? process.env.GOOGLE_CLIENT_ID     ?? "";
    const clientSecret = process.env.GOOGLE_BUSINESS_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "";
    const redirectUri  = getGoogleBusinessCallbackUrl();

    if (!clientId || !clientSecret) {
      return res.status(500).json({ message: "Google Business OAuth credentials are not configured on the server." });
    }

    console.log(`[exchange-code] storeId=${storeId}  redirectUri=${redirectUri}`);

    try {
      const apiManager = new GoogleBusinessAPIManager({ clientId, clientSecret, redirectUri });

      // 1. Exchange code → tokens
      const tokens = await apiManager.getTokensFromCode(code);
      if (!tokens.access_token) {
        console.error("[exchange-code] No access_token returned from Google");
        return res.status(400).json({ message: "Google did not return an access token. Please try connecting again." });
      }
      console.log(`[exchange-code] access_token: (obtained)  refresh_token: ${tokens.refresh_token ? "(obtained)" : "(none)"}`);

      // business.manage-only flows may not include openid/email. This call is
      // intentionally best-effort and can return null.
      const userInfo = await apiManager.getGoogleUserInfo();

      // 2. Fetch Google Business accounts
      let accounts: any[] = [];
      try {
        const accountsData = await apiManager.getBusinessAccounts();
        accounts = accountsData.accounts ?? [];
        console.log(`[exchange-code] accounts found: ${accounts.length}`);
      } catch (err: any) {
        console.error("[exchange-code] Failed to fetch accounts:", err?.message ?? err);
        // Return 400 with a helpful message instead of 500 — the user can fix this
        const status = err?.code ?? err?.response?.status;
        if (status === 403) {
          return res.status(403).json({
            message:
              "Google denied access to Business Profile accounts. Ensure the 'My Business Account Management API' " +
              "and 'Business Profile API' are enabled in your Google Cloud project.",
          });
        }
        if (status === 429) {
          return res.status(429).json({ message: "Google API quota exceeded. Please wait and try again." });
        }
        return res.status(400).json({ message: "Failed to fetch Google Business accounts: " + (err?.message ?? "unknown error") });
      }

      if (!accounts.length) {
        console.warn("[exchange-code] No Business Profile accounts found for this Google account");
        return res.status(400).json({
          message:
            "No Google Business Profile was found on this Google account. " +
            "Please make sure you have a Business Profile at business.google.com.",
        });
      }

      // 3. Fetch locations for every account
      const allLocations: any[] = [];
      for (const account of accounts) {
        try {
          const locData = await apiManager.getLocations(account.name);
          const locs = locData.locations ?? [];
          allLocations.push(...locs.map((l: any) => ({ ...l, _accountName: account.name })));
          console.log(`[exchange-code] ${locs.length} location(s) for account ${account.name}`);
        } catch (locErr: any) {
          console.error(`[exchange-code] Failed to fetch locations for ${account.name}:`, locErr?.message ?? locErr);
        }
      }

      // 4. Upsert the google_business_profiles row (tokens + account info)
      const existingProfile = await db
        .select()
        .from(googleBusinessProfiles)
        .where(eq(googleBusinessProfiles.storeId, storeId))
        .limit(1);

      let profileRow: typeof googleBusinessProfiles.$inferSelect;
      if (existingProfile.length) {
        const updated = await db
          .update(googleBusinessProfiles)
          .set({
            accessToken:                 encryptToken(tokens.access_token),
            refreshToken:                tokens.refresh_token ? encryptToken(tokens.refresh_token) : existingProfile[0].refreshToken,
            tokenExpiresAt:              tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            googleAccountEmail:          userInfo?.email ?? existingProfile[0].googleAccountEmail,
            businessAccountId:           accounts[0]?.name ?? existingProfile[0].businessAccountId,
            businessAccountResourceName: accounts[0]?.name ?? existingProfile[0].businessAccountResourceName,
            isConnected:                 false,
            updatedAt:                   new Date(),
          })
          .where(eq(googleBusinessProfiles.storeId, storeId))
          .returning();
        profileRow = updated[0];
        console.log(`[exchange-code] updated existing profile id=${profileRow.id}`);
      } else {
        const inserted = await db
          .insert(googleBusinessProfiles)
          .values({
            storeId,
            accessToken:                 encryptToken(tokens.access_token),
            refreshToken:                encryptToken(tokens.refresh_token) ?? null,
            tokenExpiresAt:              tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            googleAccountEmail:          userInfo?.email ?? null,
            businessAccountId:           accounts[0]?.name ?? null,
            businessAccountResourceName: accounts[0]?.name ?? null,
            isConnected:                 false,
          })
          .returning();
        profileRow = inserted[0];
        console.log(`[exchange-code] inserted new profile id=${profileRow.id}`);
      }

      // 5. Upsert google_business_accounts rows so connect-location can find them
      for (const acct of accounts) {
        try {
          const existingAcct = await db
            .select({ id: googleBusinessAccounts.id })
            .from(googleBusinessAccounts)
            .where(and(
              eq(googleBusinessAccounts.storeId, storeId),
              eq(googleBusinessAccounts.googleAccountId, acct.name),
            ))
            .limit(1);

          if (existingAcct.length) {
            await db
              .update(googleBusinessAccounts)
              .set({
                accountName:  acct.accountName ?? acct.displayName ?? null,
                accessToken:  encryptToken(tokens.access_token),
                refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : undefined,
                tokenExpiry:  tokens.expiry_date ? new Date(tokens.expiry_date) : null,
                scopes:       tokens.scope ?? null,
                updatedAt:    new Date(),
              })
              .where(eq(googleBusinessAccounts.id, existingAcct[0].id));
          } else {
            await db.insert(googleBusinessAccounts).values({
              storeId,
              userId:          userId as string,
              googleAccountId: acct.name,
              accountName:     acct.accountName ?? acct.displayName ?? null,
              accessToken:     encryptToken(tokens.access_token),
              refreshToken:    encryptToken(tokens.refresh_token) ?? null,
              tokenExpiry:     tokens.expiry_date ? new Date(tokens.expiry_date) : null,
              scopes:          tokens.scope ?? null,
            });
          }
        } catch (acctErr: any) {
          console.warn(`[exchange-code] Could not upsert account "${acct.name}":`, acctErr?.message ?? acctErr);
        }
      }

      console.log(`[exchange-code] complete — returning ${accounts.length} account(s) and ${allLocations.length} location(s) to frontend`);
      return res.json({
        success:    true,
        accounts,
        businesses: allLocations,
        profileId:  profileRow.id,
      });
    } catch (error: any) {
      const status = error?.code ?? error?.response?.status ?? error?.status;
      const msg    = error?.message ?? String(error);
      console.error(`[exchange-code] ERROR — status=${status ?? "(none)"}  message=${msg}`);
      if (error?.response?.data) {
        console.error("[exchange-code] Google error body:", JSON.stringify(error.response.data).slice(0, 400));
      }
      if (status === 429) return res.status(429).json({ message: "Google API quota exceeded. Please wait and try again." });
      if (status === 403) return res.status(403).json({ message: "Google denied access. Check your Google Cloud API settings." });
      return res.status(500).json({ message: "Failed to complete Google Business connection: " + msg });
    }
  });

  /**
   * Return the Google OAuth connection result stored in the session by the GET callback.
   * The frontend calls this immediately after being redirected back with ?google_connected=1.
   * The result is cleared from the session after the first read (one-time pickup).
   *
   * Returns: { success, email, accounts, businesses, profileId, storeId }
   */
  app.get("/api/google-business/connection-result", (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const result = (req.session as any).googleConnectionResult ?? null;
    // Clear after pickup so it can't be replayed
    delete (req.session as any).googleConnectionResult;

    if (!result) {
      return res.status(404).json({ message: "No pending connection result found in session" });
    }

    console.log("[Google Business OAuth] connection-result picked up by frontend for storeId:", result.storeId);
    req.session.save(() => res.json(result));
  });

  /**
   * Handle Google OAuth callback via POST (legacy frontend-mediated flow).
   * Kept for backward compatibility. The canonical flow now uses GET /api/google-business/callback.
   * - Verifies CSRF state
   * - Exchanges code for tokens
   * - Fetches the authed user's Google account email
   * - Upserts the profile row (so reconnect works without error)
   */
  app.post("/api/google-business/callback", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { code, storeId, state } = req.body;
    if (!code || !storeId) {
      return res.status(400).json({ message: "Code and storeId are required" });
    }

    // CSRF state verification (legacy: state was the raw csrf hex string)
    const expectedState = (req.session as any).googleOAuthState;
    if (expectedState && state && expectedState !== state) {
      return res.status(400).json({ message: "Invalid OAuth state – possible CSRF attack" });
    }
    delete (req.session as any).googleOAuthState;

    try {
      console.log("[Google Business OAuth] POST callback — exchanging code for tokens (storeId:", storeId, ")");

      // BUSINESS integration credentials — NEVER shared with the login system
      const apiManager = new GoogleBusinessAPIManager({
        clientId:     process.env.GOOGLE_BUSINESS_CLIENT_ID     ?? process.env.GOOGLE_CLIENT_ID     ?? "",
        clientSecret: process.env.GOOGLE_BUSINESS_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirectUri:  getGoogleBusinessCallbackUrl(),
      });

      const tokens = await apiManager.getTokensFromCode(code);
      console.log("[Google Business OAuth] POST callback — access_token obtained:", !!tokens.access_token);
      console.log("[Google Business OAuth] POST callback — refresh_token obtained:", !!tokens.refresh_token);
      console.log("[Google Business OAuth] POST callback — scope:", tokens.scope ?? "(none)");

      const userInfo = await apiManager.getGoogleUserInfo();
      console.log("[Google Business OAuth] POST callback — user email:", userInfo?.email ?? "(none — expected with business.manage-only scope)");

      const accountsData = await apiManager.getBusinessAccounts();
      const accounts = (accountsData.accounts ?? []) as any[];
      console.log("[Google Business OAuth] POST callback — business accounts found:", accounts.length);

      if (!accounts.length) {
        return res.status(400).json({ message: "No Google Business accounts found for this Google account" });
      }

      // Fetch all locations for every account so the frontend can show them without a second API call
      const allLocations: any[] = [];
      for (const account of accounts) {
        try {
          const locData = await apiManager.getLocations(account.name);
          const locs = locData.locations ?? [];
          allLocations.push(...locs.map((l: any) => ({ ...l, _accountName: account.name })));
          console.log(`[Google Business OAuth] POST callback — fetched ${locs.length} location(s) for ${account.name}`);
        } catch (locErr: any) {
          console.error(`[Google Business OAuth] POST callback — failed to fetch locations for ${account.name}:`, locErr?.message ?? locErr);
        }
      }

      const existingProfile = await db
        .select()
        .from(googleBusinessProfiles)
        .where(eq(googleBusinessProfiles.storeId, Number(storeId)))
        .limit(1);

      let profileRow: typeof googleBusinessProfiles.$inferSelect;
      if (existingProfile.length) {
        const updated = await db
          .update(googleBusinessProfiles)
          .set({
            accessToken:                encryptToken(tokens.access_token),
            refreshToken:               tokens.refresh_token ? encryptToken(tokens.refresh_token) : existingProfile[0].refreshToken,
            tokenExpiresAt:             tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            googleAccountEmail:         userInfo?.email ?? existingProfile[0].googleAccountEmail,
            businessAccountId:          accounts[0].name,
            businessAccountResourceName: accounts[0].name,
            isConnected:                false,
            updatedAt:                  new Date(),
          })
          .where(eq(googleBusinessProfiles.storeId, Number(storeId)))
          .returning();
        profileRow = updated[0];
      } else {
        const inserted = await db
          .insert(googleBusinessProfiles)
          .values({
            storeId:                    Number(storeId),
            accessToken:                encryptToken(tokens.access_token),
            refreshToken:               encryptToken(tokens.refresh_token) ?? null,
            tokenExpiresAt:             tokens.expiry_date ? new Date(tokens.expiry_date) : null,
            googleAccountEmail:         userInfo?.email ?? null,
            businessAccountId:          accounts[0].name,
            businessAccountResourceName: accounts[0].name,
            isConnected:                false,
          })
          .returning();
        profileRow = inserted[0];
      }

      return res.json({
        message:     "Google account authenticated",
        accounts,
        businesses:  allLocations,
        profileId:   profileRow.id,
        googleEmail: userInfo?.email ?? null,
        success:     true,
        email:       userInfo?.email ?? null,
      });
    } catch (error: any) {
      console.error("[Google Business OAuth] POST callback error:", error);
      const status = error?.code ?? error?.response?.status ?? error?.status;
      if (status === 429) {
        return res.status(429).json({
          message:
            "Google API quota exceeded. The Google Business Profile API has a default quota of 0 — you must request a quota increase from Google at https://support.google.com/business/contact/api_default_quota_increase before this connect flow will work.",
        });
      }
      if (status === 403) {
        return res.status(403).json({
          message:
            "Google denied access. Make sure the Google Business Profile API is enabled in your Google Cloud project and that your OAuth consent screen lists the business.manage scope.",
        });
      }
      return res.status(500).json({ message: "Failed to authenticate with Google" });
    }
  });

  /**
   * Get locations for a business account.
   */
  app.post("/api/google-business/locations", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { profileId, accountName } = req.body;
    if (!profileId || !accountName) {
      return res.status(400).json({ message: "profileId and accountName are required" });
    }

    console.log(`[GBP] /locations — profileId=${profileId}  accountName="${accountName}"`);

    try {
      const profiles = await db
        .select()
        .from(googleBusinessProfiles)
        .where(eq(googleBusinessProfiles.id, profileId))
        .limit(1);

      if (!profiles.length) {
        return res.status(404).json({ message: "Profile not found" });
      }

      console.log(`[GBP] /locations — profile storeId=${profiles[0].storeId}  accessToken present: ${!!profiles[0].accessToken}  refreshToken present: ${!!profiles[0].refreshToken}`);

      const apiManager = createApiManagerFromProfile(profiles[0]);
      const locationsData = await apiManager.getLocations(accountName);
      const locs: any[] = locationsData.locations ?? [];

      console.log(`[GBP] /locations — returning ${locs.length} location(s) to frontend`);
      locs.forEach((l: any, i: number) => {
        console.log(`[GBP]   [${i}] name="${l.name}"  title="${l.title ?? "(none)"}"  storefrontAddress=${l.storefrontAddress ? JSON.stringify(l.storefrontAddress) : "(none)"}`);
      });

      if (locs.length === 0) {
        console.warn(`[GBP] /locations — ZERO locations returned for account "${accountName}". The user will see a "No Locations Found" dialog.`);
      }

      return res.json({ locations: locs });
    } catch (error: any) {
      const status = error?.code ?? error?.response?.status ?? error?.status;
      const errMsg = error?.message ?? String(error);
      console.error(`[GBP] /locations FAILED — status=${status ?? "(none)"}  message=${errMsg}`);
      if (error?.response?.data) {
        console.error(`[GBP] /locations Google error body: ${JSON.stringify(error.response.data).slice(0, 400)}`);
      }
      if (status === 429) {
        return res.status(429).json({
          message: "Google API quota exceeded. Request a quota increase at https://support.google.com/business/contact/api_default_quota_increase before fetching locations.",
        });
      }
      if (status === 403) {
        return res.status(403).json({
          message: `Google denied access to locations: ${errMsg}. Ensure the Business Profile API is enabled in your Google Cloud project.`,
        });
      }
      return res.status(500).json({ message: `Failed to fetch locations: ${errMsg}` });
    }
  });

  /**
   * Connect a specific location to the store.
   */
  app.post("/api/google-business/connect-location", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { profileId, locationName, locationId, businessName, locationAddress, accountName } = req.body;
    if (!profileId || !locationName) {
      return res.status(400).json({ message: "profileId and locationName are required" });
    }

    console.log(
      `[GBP] connect-location — profileId=${profileId}` +
      `  locationName="${locationName}"` +
      `  locationId="${locationId ?? "(none)"}"` +
      `  accountName="${accountName ?? "(none)"}"` +
      `  businessName="${businessName ?? "(none)"}"` +
      `  address="${locationAddress ?? "(none)"}"`,
    );

    try {
      // Resolve profile and enforce tenant ownership.
      // Wrapped in the main try-catch so DB/lookup errors return JSON, not HTML.
      const existingProfiles = await db
        .select()
        .from(googleBusinessProfiles)
        .where(eq(googleBusinessProfiles.id, Number(profileId)))
        .limit(1);
      if (!existingProfiles.length) {
        console.error(`[GBP] connect-location — profile id=${profileId} not found in DB`);
        return res.status(404).json({ message: "Profile not found" });
      }
      const profileStore = await storage.getStore(existingProfiles[0].storeId);
      if (!profileStore || profileStore.userId !== userId) {
        console.error(`[GBP] connect-location — ownership check failed: storeId=${existingProfiles[0].storeId} profileStore.userId=${profileStore?.userId} sessionUserId=${userId}`);
        return res.status(403).json({ message: "Access denied — this profile does not belong to your account." });
      }

      // Normalize location resource into canonical form:
      //   accounts/{accountId}/locations/{locationId}
      // Accepts legacy short forms from frontend too:
      //   locations/{locationId}
      //   {locationId}
      const profileRow = existingProfiles[0];
      const fallbackAccountResource =
        accountName ??
        profileRow.businessAccountId ??
        profileRow.businessAccountResourceName ??
        null;

      let normalizedLocationResourceName = String(locationName);
      let selectedAccountResource: string | null = null;

      if (normalizedLocationResourceName.includes("/locations/") && normalizedLocationResourceName.startsWith("accounts/")) {
        selectedAccountResource = normalizedLocationResourceName.split("/locations/")[0] ?? null;
      } else {
        const leafId =
          String(locationId ?? "").trim() ||
          normalizedLocationResourceName.replace(/^locations\//, "").split("/").pop() ||
          "";

        if (!leafId) {
          return res.status(400).json({
            message: "Invalid location selection: could not determine location id.",
          });
        }

        if (!fallbackAccountResource || !String(fallbackAccountResource).startsWith("accounts/")) {
          console.error(
            `[GBP] connect-location — cannot normalize short location name "${locationName}" because account resource is missing.` +
            ` fallbackAccountResource="${fallbackAccountResource ?? "(none)"}"`,
          );
          return res.status(400).json({
            message: "Invalid location resource format. Please reconnect Google Business Profile and reselect your location.",
          });
        }

        selectedAccountResource = String(fallbackAccountResource);
        normalizedLocationResourceName = `${selectedAccountResource}/locations/${leafId}`;
      }

      if (!normalizedLocationResourceName.includes("/locations/")) {
        console.error(
          `[GBP] connect-location — normalized location resource invalid: "${normalizedLocationResourceName}"`,
        );
        return res.status(400).json({
          message: "Invalid location resource name format. Expected accounts/{id}/locations/{id}.",
        });
      }

      const normalizedLocationId =
        locationId ??
        normalizedLocationResourceName.split("/locations/")[1] ??
        null;

      const updated = await db
        .update(googleBusinessProfiles)
        .set({
          businessAccountId: selectedAccountResource,
          businessAccountResourceName: selectedAccountResource,
          locationResourceName: normalizedLocationResourceName,
          locationId: normalizedLocationId,
          businessName: businessName ?? null,
          locationAddress: locationAddress ?? null,
          isConnected: true,
          onboardingStatus: "connected",
          connectedAt: new Date(),
          onboardingAbandonedAt: null,
          onboardingError: null,
          updatedAt: new Date(),
        })
        .where(eq(googleBusinessProfiles.id, Number(profileId)))
        .returning();

      if (!updated.length) {
        console.error(`[GBP] connect-location — profile id=${profileId} not found`);
        return res.status(404).json({ message: "Profile not found" });
      }

      const connectedProfile = updated[0];
      console.log(`[GBP] connect-location — DB updated. storeId=${connectedProfile.storeId}  locationResourceName="${connectedProfile.locationResourceName}"`);

      // ── Clear any pending auth failure flag ───────────────────────────────────
      // If reconnect_required was set by the GBP worker after a token revocation,
      // a successful connect-location means the owner has re-authorised.
      await clearGBPAuthFailure(connectedProfile.storeId).catch((e) =>
        console.warn("[GBP] connect-location — clearGBPAuthFailure failed (non-fatal):", e?.message),
      );

      // ── Write to googleBusinessLocations (proper location table) ──────────────
      // 1. Find the googleBusinessAccounts row for this store
      // 2. Unset isSelected on ALL existing locations for this storeId
      // 3. Upsert the newly-selected location with isSelected=true
      try {
        const acctRows = await db
          .select({ id: googleBusinessAccounts.id })
          .from(googleBusinessAccounts)
          .where(and(
            eq(googleBusinessAccounts.storeId, connectedProfile.storeId),
            eq(googleBusinessAccounts.googleAccountId, selectedAccountResource as string),
          ))
          .limit(1);

        const acctId = acctRows[0]?.id ?? null;

        if (acctId) {
          // Unselect all existing locations for this store (enforce single selection)
          await db
            .update(googleBusinessLocations)
            .set({ isSelected: false, updatedAt: new Date() })
            .where(eq(googleBusinessLocations.storeId, connectedProfile.storeId));

          // Upsert the selected location
          const leafId =
            normalizedLocationId ??
            normalizedLocationResourceName.split("/locations/")[1] ??
            normalizedLocationResourceName;
          const existingLoc = await db
            .select({ id: googleBusinessLocations.id })
            .from(googleBusinessLocations)
            .where(eq(googleBusinessLocations.locationResourceName, normalizedLocationResourceName))
            .limit(1);

          if (existingLoc.length) {
            await db
              .update(googleBusinessLocations)
              .set({
                locationName: businessName ?? null,
                address:      locationAddress ?? null,
                isSelected:   true,
                updatedAt:    new Date(),
              })
              .where(eq(googleBusinessLocations.id, existingLoc[0].id));
            console.log(`[GBP] connect-location — googleBusinessLocations updated id=${existingLoc[0].id}`);
          } else {
            const inserted = await db
              .insert(googleBusinessLocations)
              .values({
                storeId:             connectedProfile.storeId,
                userId:              userId as string,
                businessAccountId:   acctId,
                locationResourceName: normalizedLocationResourceName,
                locationId:          leafId,
                locationName:        businessName ?? null,
                address:             locationAddress ?? null,
                isSelected:          true,
              })
              .returning({ id: googleBusinessLocations.id });
            console.log(`[GBP] connect-location — googleBusinessLocations inserted id=${inserted[0].id}`);
          }
        } else {
          console.warn(`[GBP] connect-location — no googleBusinessAccounts row found for storeId=${connectedProfile.storeId}. Location not written to new table (legacy flow — will be populated on next OAuth reconnect).`);
        }
      } catch (locWriteErr: any) {
        // Non-fatal — the legacy google_business_profiles row is already updated.
        console.warn("[GBP] connect-location — could not write to googleBusinessLocations:", locWriteErr?.message ?? locWriteErr);
      }

      // ── Auto-trigger review sync + review link fetch immediately after location connect ──
      // Fire-and-forget: don't let a sync failure block the connect response.
      setImmediate(async () => {
        try {
          console.log(`[GBP] connect-location — auto-syncing reviews for storeId=${connectedProfile.storeId}…`);
          const result = await syncReviewsForStore(connectedProfile.storeId);
          console.log(`[GBP] connect-location — auto-sync complete: ${result.synced} review(s) synced (source=${result.source} ${result.durationMs}ms)`);
        } catch (syncErr: any) {
          console.error(`[GBP] connect-location — auto-sync FAILED for storeId=${connectedProfile.storeId}: ${syncErr?.message ?? syncErr}`);
        }
        // Fetch and persist the Google Review link (metadata.newReviewUri) while we have valid tokens
        fetchAndStoreReviewLink(connectedProfile.storeId).catch((e: any) =>
          console.warn(`[GBP] connect-location — review link fetch failed (non-fatal): ${e?.message ?? e}`),
        );
      });

      // Strip tokens before sending — never expose access/refresh tokens to the frontend
      const { accessToken: _at, refreshToken: _rt, ...safeProfile } = connectedProfile;
      return res.json({ message: "Location connected successfully", profile: safeProfile, syncTriggered: true });
    } catch (error: any) {
      console.error("[GBP] connect-location ERROR:", error?.message ?? error);
      return res.status(500).json({ message: "Failed to connect location" });
    }
  });

  /** Persist the owner-facing Google onboarding lifecycle without exposing OAuth details. */
  app.patch("/api/google-business/onboarding-state/:storeId", isAuthenticated, async (req, res) => {
    const userId = (req.session as any)?.userId as string | undefined;
    const storeId = Number(req.params.storeId);
    if (!userId || !Number.isInteger(storeId)) return res.status(400).json({ message: "Invalid store" });

    const store = await storage.getStore(storeId);
    if (!store || store.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    const schema = z.object({
      status: z.enum([
        "not_started", "searching", "profile_found", "awaiting_owner_verification",
        "postcard_sent", "verification_pending", "connected", "failed",
      ]),
      placeId: z.string().max(255).optional(),
      businessName: z.string().max(255).optional(),
      locationAddress: z.string().max(500).optional(),
      postcardAddress: z.string().max(500).optional(),
      error: z.string().max(1000).optional(),
      abandoned: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid Google setup state" });

    const input = parsed.data;
    const now = new Date();
    const values = {
      storeId,
      onboardingStatus: input.status,
      discoveredPlaceId: input.placeId,
      businessName: input.businessName,
      locationAddress: input.locationAddress,
      postcardAddress: input.postcardAddress,
      postcardSentAt: input.status === "postcard_sent" ? now : undefined,
      connectedAt: input.status === "connected" ? now : undefined,
      isConnected: input.status === "connected" ? true : undefined,
      onboardingAbandonedAt: input.abandoned ? now : null,
      onboardingError: input.error ?? null,
      updatedAt: now,
    };

    const existing = await db.select({ id: googleBusinessProfiles.id })
      .from(googleBusinessProfiles)
      .where(eq(googleBusinessProfiles.storeId, storeId))
      .limit(1);
    const [profile] = existing.length
      ? await db.update(googleBusinessProfiles).set(values).where(eq(googleBusinessProfiles.storeId, storeId)).returning()
      : await db.insert(googleBusinessProfiles).values(values).returning();

    return res.json({
      status: profile.onboardingStatus,
      postcardSentAt: profile.postcardSentAt,
      connectedAt: profile.connectedAt,
    });
  });

  /**
   * Get Google Business Profile for a store (tokens are stripped before returning).
   */
  app.get("/api/google-business/profile/:storeId", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const storeId = Number(req.params.storeId);
    const store = await storage.getStore(storeId);
    if (!store || store.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    try {
      const profiles = await db
        .select()
        .from(googleBusinessProfiles)
        .where(eq(googleBusinessProfiles.storeId, storeId))
        .limit(1);

      if (!profiles.length) {
        return res.json({ profile: null });
      }

      // Compute an effective token expiry from the new-schema account row when possible.
      // The reviews UI uses tokenExpiresAt to show a reconnect banner; relying only on
      // legacy google_business_profiles.tokenExpiresAt can produce false "expired"
      // states when account-level tokens have already auto-refreshed.
      const profileRow = profiles[0];
      let effectiveTokenExpiresAt = profileRow.tokenExpiresAt ?? null;
      let canAutoRefresh = !!profileRow.refreshToken;
      try {
        const acctRows = await db
          .select({
            tokenExpiry: googleBusinessAccounts.tokenExpiry,
            refreshToken: googleBusinessAccounts.refreshToken,
          })
          .from(googleBusinessAccounts)
          .where(
            and(
              eq(googleBusinessAccounts.storeId, storeId),
              eq(googleBusinessAccounts.googleAccountId, profileRow.businessAccountId as string),
            ),
          )
          .limit(1);

        if (acctRows.length && acctRows[0].tokenExpiry) {
          effectiveTokenExpiresAt = acctRows[0].tokenExpiry;
        }
        if (acctRows.length) {
          canAutoRefresh = !!acctRows[0].refreshToken;
        }
      } catch (e: any) {
        console.warn("[GBP] profile/:storeId — could not compute effective token expiry from accounts:", e?.message ?? e);
      }

      // Never return sensitive tokens to the client
      const { accessToken, refreshToken, ...safeProfile } = profileRow;
      return res.json({
        profile: {
          ...safeProfile,
          tokenExpiresAt: effectiveTokenExpiresAt,
          canAutoRefresh,
        },
      });
    } catch (error) {
      console.error("Error fetching profile:", error);
      return res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  /**
   * GET /api/google-business/stored-accounts/:storeId
   *
   * Returns the Google Business accounts already stored in the DB for this store
   * (populated during the OAuth flow via exchange-code or the legacy callback).
   * Used by the "Select Location" flow so users can pick a location without
   * re-doing OAuth when accounts were already authorized.
   */
  app.get("/api/google-business/stored-accounts/:storeId", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const storeId = Number(req.params.storeId);
    if (!storeId) return res.status(400).json({ message: "Invalid storeId" });
    const storeCheck = await storage.getStore(storeId);
    if (!storeCheck || storeCheck.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    try {
      const rows = await db
        .select()
        .from(googleBusinessAccounts)
        .where(eq(googleBusinessAccounts.storeId, storeId))
        .orderBy(googleBusinessAccounts.createdAt);

      // Strip tokens — only send safe fields
      const safeAccounts = rows.map(({ accessToken, refreshToken, ...safe }) => safe);
      console.log(`[GBP] stored-accounts — storeId=${storeId}  found=${rows.length}`);
      return res.json({ accounts: safeAccounts });
    } catch (error: any) {
      console.error("[GBP] stored-accounts ERROR:", error?.message ?? error);
      return res.status(500).json({ message: "Failed to fetch stored accounts" });
    }
  });

  /**
   * Disconnect Google Business Profile.
   * Revokes the OAuth token at Google, then removes all local review data.
   * Required by Google API policies: users must be able to revoke access at any time,
   * and disconnecting must remove all associated data.
   */
  app.delete("/api/google-business/profile/:storeId", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const storeId = Number(req.params.storeId);

    try {
      // Verify the store belongs to this user
      const store = await storage.getStore(storeId);
      if (!store || store.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const profiles = await db
        .select()
        .from(googleBusinessProfiles)
        .where(eq(googleBusinessProfiles.storeId, storeId))
        .limit(1);

      if (!profiles.length) {
        return res.status(404).json({ message: "No Google Business Profile found for this store" });
      }

      const profile = profiles[0];

      // Revoke the OAuth token at Google so the app loses API access
      if (profile.accessToken || profile.refreshToken) {
        const apiManager = createApiManagerFromProfile(profile);
        await apiManager.revokeTokens();
      }

      // Delete all draft/published responses for this store's reviews
      await db
        .delete(googleReviewResponses)
        .where(eq(googleReviewResponses.storeId, storeId));

      // Delete all synced reviews for this store
      await db
        .delete(googleReviews)
        .where(eq(googleReviews.storeId, storeId));

      // Delete the profile itself
      await db
        .delete(googleBusinessProfiles)
        .where(eq(googleBusinessProfiles.storeId, storeId));

      // Clear OAuth tokens from googleBusinessAccounts (data-retention compliance:
      // tokens must not persist after the user has revoked access)
      await db
        .update(googleBusinessAccounts)
        .set({
          accessToken:  null,
          refreshToken: null,
          tokenExpiry:  null,
          scopes:       null,
          updatedAt:    new Date(),
        })
        .where(eq(googleBusinessAccounts.storeId, storeId));

      console.log(`Google Business Profile disconnected for store ${storeId}`);
      return res.json({ message: "Google Business Profile disconnected and all data removed" });
    } catch (error) {
      console.error("Error disconnecting Google Business Profile:", error);
      return res.status(500).json({ message: "Failed to disconnect Google Business Profile" });
    }
  });

  /**
   * Sync reviews from Google.
   */
  app.post("/api/google-business/sync-reviews/:storeId", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const storeId = Number(req.params.storeId);
    const ownedStore = await storage.getStore(storeId);
    if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    // Server-side rate limit — prevents bypass of the frontend cooldown timer (state in server/rate-limits.ts)
    const lastSync = syncCooldowns.get(storeId);
    if (lastSync && Date.now() - lastSync < SYNC_COOLDOWN_MS) {
      const secsLeft = Math.ceil((SYNC_COOLDOWN_MS - (Date.now() - lastSync)) / 1000);
      const mins = Math.floor(secsLeft / 60);
      const secs = secsLeft % 60;
      const label = mins > 0 ? `${mins}m ${secs.toString().padStart(2, "0")}s` : `${secsLeft}s`;
      return res.status(429).json({ message: `Sync rate limit — please wait ${label} before syncing again.` });
    }
    syncCooldowns.set(storeId, Date.now());

    console.log(`[GBP] Manual sync-reviews triggered for storeId=${storeId}`);

    try {
      const result = await syncReviewsForStore(storeId);
      console.log(
        `[GBP] sync-reviews complete — synced=${result.synced}` +
        `  inserted=${result.inserted}  updated=${result.updated}` +
        `  location="${result.locationResourceName}"  business="${result.businessName ?? "(none)"}"` +
        `  source=${result.source}  ${result.durationMs}ms`,
      );

      // Immediately queue any unresponded reviews for auto-reply (same as the 6-hour scheduler).
      // Without this, manual syncs only fetch reviews — auto-reply only kicked in on the next
      // scheduled sweep hours later.
      try {
        const { processNewReviewsForStore } = await import("./services/google-review-engine");
        await processNewReviewsForStore(storeId);
        console.log(`[GBP] sync-reviews — processNewReviews complete for storeId=${storeId}`);
      } catch (engErr: any) {
        // Non-fatal — sync result is still returned even if engine queuing fails
        console.warn(`[GBP] sync-reviews — processNewReviews failed for storeId=${storeId}:`, engErr?.message ?? engErr);
      }

      return res.json({
        message: "Reviews synced successfully",
        synced:               result.synced,
        inserted:             result.inserted,
        updated:              result.updated,
        locationResourceName: result.locationResourceName,
        businessName:         result.businessName,
        durationMs:           result.durationMs,
        source:               result.source,
        syncLogId:            result.syncLogId,
      });
    } catch (error: any) {
      const errMsg = error?.message ?? String(error);
      const status = error?.code ?? error?.response?.status ?? error?.status;
      const rawGoogleBody = error?.response?.data ?? error?.responseBody ?? error?.body ?? null;
      const googleBodyText =
        typeof rawGoogleBody === "string"
          ? rawGoogleBody
          : rawGoogleBody
            ? JSON.stringify(rawGoogleBody)
            : null;
      const googleApiMessage =
        (typeof rawGoogleBody === "object" && rawGoogleBody?.error?.message) ||
        (typeof rawGoogleBody === "object" && rawGoogleBody?.message) ||
        null;

      console.error(`[GBP] sync-reviews FAILED for storeId=${storeId} — status=${status ?? "(none)"}  message=${errMsg}`);
      if (googleBodyText) {
        console.error(`[GBP] sync-reviews Google API error body: ${googleBodyText.slice(0, 400)}`);
      }

      // Surface permission/quota errors explicitly to the client
      if (status === 403) {
        const detail = googleApiMessage ?? errMsg;
        return res.status(403).json({
          message: `Google denied access (403): ${detail}`,
        });
      }
      if (status === 429) {
        return res.status(429).json({
          message: "Google Business Profile API quota exceeded. Request a quota increase at https://support.google.com/business/contact/api_default_quota_increase",
        });
      }
      if (status === 404) {
        return res.status(404).json({
          message: `Google location not found: ${errMsg}. The location resource name may be incorrect — please reconnect your Google Business Profile.`,
        });
      }
      return res.status(500).json({ message: `Failed to sync reviews: ${errMsg}` });
    }
  });

  /**
   * GET /api/google-business/sync-logs/:storeId
   * Returns the last N sync attempts for a store (default 10, max 50).
   * Used by the frontend Sync History panel.
   */
  app.get("/api/google-business/sync-logs/:storeId", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const storeId = Number(req.params.storeId);
    const ownedStore = await storage.getStore(storeId);
    if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });
    const limit = Math.min(Number(req.query.limit ?? 10), 50);

    try {
      const logs = await db
        .select({
          id:            googleBusinessSyncLogs.id,
          syncType:      googleBusinessSyncLogs.syncType,
          status:        googleBusinessSyncLogs.status,
          errorMessage:  googleBusinessSyncLogs.errorMessage,
          reviewsSynced: googleBusinessSyncLogs.reviewsSynced,
          syncedAt:      googleBusinessSyncLogs.syncedAt,
          locationId:    googleBusinessSyncLogs.locationId,
        })
        .from(googleBusinessSyncLogs)
        .where(eq(googleBusinessSyncLogs.storeId, storeId))
        .orderBy(desc(googleBusinessSyncLogs.syncedAt))
        .limit(limit);

      return res.json({ logs });
    } catch (err: any) {
      console.error(`[GBP] sync-logs FAILED for storeId=${storeId}:`, err?.message ?? err);
      return res.status(500).json({ message: "Failed to fetch sync logs" });
    }
  });

  /**
   * AI-powered reply suggestions for a Google review
   */
  app.post("/api/google-business/suggest-reply/:storeId", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const storeId = Number(req.params.storeId);
    const ownedStore = await storage.getStore(storeId);
    if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });
    const { reviewText, rating, customerName } = req.body;

    try {
      // Fetch the store name so replies feel personalised
      const [store] = await db
        .select({ name: locations.name })
        .from(locations)
        .where(eq(locations.id, storeId))
        .limit(1);

      const businessName = store?.name ?? "our business";

      const fallbackSuggestions = (() => {
        const name = (customerName || "there").toString().split(" ")[0];
        if (rating >= 4) {
          return [
            `Thank you so much, ${name}! We really appreciate your kind words and support. It means a lot to our team at ${businessName}, and we’re glad you had a great experience. We look forward to seeing you again soon.`,
            `Thanks, ${name}! We’re so happy to hear you enjoyed your visit. Your feedback motivates our team to keep delivering top-quality service at ${businessName}. We can’t wait to welcome you back.`,
            `We truly appreciate your review, ${name}. Thank you for choosing ${businessName} and sharing your experience. It was our pleasure to serve you, and we hope to see you again very soon.`,
          ];
        }
        if (rating === 3) {
          return [
            `Thank you for your feedback, ${name}. We appreciate you taking the time to share your experience. At ${businessName}, we’re always working to improve, and your comments help us do better for every visit.`,
            `Thanks for your honest review, ${name}. We’re glad you shared this with us. We value your input and will use it to keep improving the experience at ${businessName}.`,
            `We appreciate your feedback, ${name}. Your experience matters to us, and we’re committed to making each visit better. Thank you for helping ${businessName} improve.`,
          ];
        }
        return [
          `Hi ${name}, we’re sorry your experience didn’t meet expectations. We take this seriously at ${businessName} and would like the chance to make it right. Please contact us directly so we can follow up and resolve this properly.`,
          `Thank you for sharing this, ${name}. We sincerely apologise for your experience. This is not the standard we aim for at ${businessName}, and we’d appreciate the opportunity to speak with you and make things right.`,
          `We’re truly sorry to hear this, ${name}. Your feedback is important, and we’re reviewing this with our team at ${businessName}. Please reach out directly so we can address your concerns and improve your next experience.`,
        ];
      })();

      const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.json({ suggestions: fallbackSuggestions, source: "fallback" });
      }

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const ratingLabel =
        rating >= 5 ? "5-star (excellent)" :
        rating === 4 ? "4-star (positive)" :
        rating === 3 ? "3-star (neutral / mixed)" :
        rating === 2 ? "2-star (disappointed)" :
        "1-star (very unhappy)";

      const prompt = [
        `You are a professional customer service manager for "${businessName}", a service business.`,
        `Write 3 distinct reply options to the following Google review.`,
        ``,
        `Customer name: ${customerName || "a customer"}`,
        `Star rating: ${ratingLabel}`,
        `Review text: ${reviewText ? `"${reviewText}"` : "(no written text — rating only)"}`,
        ``,
        `Requirements for each reply:`,
        `- Address the customer by first name if available`,
        `- Be warm, professional, and authentic — no corporate stiffness`,
        `- Keep each reply between 40-120 words`,
        `- For 4-5 star reviews: thank them genuinely and invite them back`,
        `- For 3-star reviews: acknowledge their feedback and show commitment to improvement`,
        `- For 1-2 star reviews: apologise sincerely, take ownership, and offer to resolve it`,
        `- Never be defensive or dismissive`,
        `- Sign off naturally without "Sincerely" or generic closings`,
        `- Do NOT include a subject line or label like "Option 1:"`,
        ``,
        `Return a JSON object with this exact shape:`,
        `{ "suggestions": ["reply one text", "reply two text", "reply three text"] }`,
      ].join("\n");

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_completion_tokens: 1024,
      });

      const raw = completion.choices[0]?.message?.content ?? "{}";
      let parsed: { suggestions?: string[] } = {};
      try { parsed = JSON.parse(raw); } catch { /* fall through */ }

      const suggestions: string[] = Array.isArray(parsed.suggestions)
        ? parsed.suggestions.slice(0, 3)
        : [];

      return res.json({ suggestions });
    } catch (error: any) {
      const errMsg = error?.message ?? String(error);
      const status = error?.status ?? error?.code ?? error?.response?.status;
      console.error("Error generating reply suggestions:", error);

      // Graceful fallback when AI provider is rate-limited / billing-disabled.
      if (
        status === 429 ||
        /billing|not active|quota|rate limit|insufficient_quota/i.test(errMsg)
      ) {
        const [store] = await db
          .select({ name: locations.name })
          .from(locations)
          .where(eq(locations.id, storeId))
          .limit(1);
        const businessName = store?.name ?? "our business";
        const name = (customerName || "there").toString().split(" ")[0];
        const suggestions = rating >= 4
          ? [
              `Thank you so much, ${name}! We really appreciate your support and kind feedback. It means a lot to everyone at ${businessName}, and we look forward to welcoming you back soon.`,
              `Thanks, ${name}! We’re grateful you took the time to share your experience. We’re glad we could serve you at ${businessName} and hope to see you again soon.`,
              `We appreciate your review, ${name}. Thank you for trusting ${businessName}. Your feedback encourages our team, and we can’t wait to have you back.`,
            ]
          : rating === 3
            ? [
                `Thank you for your feedback, ${name}. We appreciate your honesty and are always looking for ways to improve at ${businessName}.`,
                `Thanks for sharing your experience, ${name}. Your input helps us improve, and we’re committed to making your next visit even better at ${businessName}.`,
                `We value your feedback, ${name}. At ${businessName}, we take comments like this seriously and use them to keep improving.`,
              ]
            : [
                `Hi ${name}, we’re truly sorry your experience fell short. We care deeply about this at ${businessName} and would like to make things right — please reach out to us directly.`,
                `Thank you for your feedback, ${name}. We sincerely apologise for your experience and want to resolve this properly. Please contact ${businessName} so we can help.`,
                `We’re sorry to hear this, ${name}. This is not the standard we aim for at ${businessName}, and we’d appreciate the chance to address your concerns directly.`,
              ];

        return res.json({ suggestions, source: "fallback" });
      }

      return res.status(500).json({ message: `Failed to generate suggestions: ${errMsg}` });
    }
  });

  /**
   * Bulk AI draft replies — streams SSE progress, saves pending drafts for every
   * unresponded review that doesn't already have a pending/approved response.
   */
  app.post("/api/google-business/bulk-draft-replies/:storeId", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const storeId = Number(req.params.storeId);
    const ownedStore = await storage.getStore(storeId);
    if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
      // Fetch store name for personalised replies
      const [store] = await db
        .select({ name: locations.name })
        .from(locations)
        .where(eq(locations.id, storeId))
        .limit(1);
      const businessName = store?.name ?? "our business";

      // maxDays: only draft replies for reviews within this window (default 30)
      const maxDays = typeof req.body?.maxDays === "number" ? req.body.maxDays : 30;
      const cutoffDate = new Date(Date.now() - maxDays * 24 * 60 * 60 * 1000);

      // Fetch all unresponded reviews for this store within the date window
      const unresponded = await db
        .select()
        .from(googleReviews)
        .where(
          and(
            eq(googleReviews.storeId, storeId),
            eq(googleReviews.responseStatus, "not_responded"),
            sql`${googleReviews.reviewCreateTime} >= ${cutoffDate.toISOString()}`
          )
        );

      // Filter out any that already have a pending or approved draft
      const existingResponses = await db
        .select({ googleReviewId: googleReviewResponses.googleReviewId })
        .from(googleReviewResponses)
        .where(
          and(
            eq(googleReviewResponses.storeId, storeId),
            inArray(
              googleReviewResponses.responseStatus,
              ["pending", "approved"]
            )
          )
        );

      const alreadyDraftedIds = new Set(existingResponses.map((r) => r.googleReviewId));
      const toProcess = unresponded.filter((r) => !alreadyDraftedIds.has(r.id));

      send({ type: "start", total: toProcess.length });

      if (toProcess.length === 0) {
        send({ type: "done", saved: 0 });
        return res.end();
        return;
      }

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      let saved = 0;

      for (let i = 0; i < toProcess.length; i++) {
        const review = toProcess[i];

        const ratingLabel =
          review.rating >= 5 ? "5-star (excellent)" :
          review.rating === 4 ? "4-star (positive)" :
          review.rating === 3 ? "3-star (neutral / mixed)" :
          review.rating === 2 ? "2-star (disappointed)" :
          "1-star (very unhappy)";

        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{
              role: "user",
              content: [
                `You are a professional customer service manager for "${businessName}", a service business.`,
                `Write ONE reply to the following Google review.`,
                ``,
                `Customer name: ${review.customerName || "a customer"}`,
                `Star rating: ${ratingLabel}`,
                `Review text: ${review.reviewText ? `"${review.reviewText}"` : "(no written text — rating only)"}`,
                ``,
                `Requirements:`,
                `- Address the customer by first name if available`,
                `- Be warm, professional, and authentic — no corporate stiffness`,
                `- Keep it between 40-120 words`,
                `- For 4-5 star: thank them genuinely and invite them back`,
                `- For 3-star: acknowledge feedback and show commitment to improvement`,
                `- For 1-2 star: apologise sincerely, take ownership, offer to resolve offline`,
                `- Never be defensive or dismissive`,
                `- Do NOT include a subject line or label`,
                ``,
                `Return JSON: { "reply": "your reply text here" }`,
              ].join("\n"),
            }],
            response_format: { type: "json_object" },
            max_completion_tokens: 512,
          });

          const raw = completion.choices[0]?.message?.content ?? "{}";
          let replyText = "";
          try {
            const parsed = JSON.parse(raw);
            replyText = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
          } catch { /* fall through */ }

          if (replyText) {
            const [savedResponse] = await db
              .insert(googleReviewResponses)
              .values({
                googleReviewId: review.id,
                storeId,
                responseText: replyText,
                responseStatus: "pending",
                createdBy: userId,
              })
              .returning();

            saved++;
            send({
              type: "progress",
              index: i,
              total: toProcess.length,
              reviewId: review.id,
              responseId: savedResponse.id,
              customerName: review.customerName,
              rating: review.rating,
              reviewText: review.reviewText,
              draftText: replyText,
            });
          } else {
            send({
              type: "progress",
              index: i,
              total: toProcess.length,
              reviewId: review.id,
              responseId: null,
              customerName: review.customerName,
              rating: review.rating,
              reviewText: review.reviewText,
              draftText: null,
              skipped: true,
            });
          }
        } catch (reviewErr) {
          console.error(`[BulkDraft] Error on review ${review.id}:`, reviewErr);
          send({
            type: "progress",
            index: i,
            total: toProcess.length,
            reviewId: review.id,
            responseId: null,
            customerName: review.customerName,
            rating: review.rating,
            reviewText: review.reviewText,
            draftText: null,
            skipped: true,
          });
        }
      }

      send({ type: "done", saved });
      return res.end();
    } catch (error) {
      console.error("Bulk draft error:", error);
      send({ type: "error", message: "Failed to generate bulk drafts" });
      return res.end();
    }
  });

  /**
   * Get reviews for a store
   */
  app.get("/api/google-business/reviews/:storeId", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const storeId = Number(req.params.storeId);
    const ownedStore = await storage.getStore(storeId);
    if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });
    const ratingFilter = req.query.rating ? Number(req.query.rating) : null;
    const statusFilter = req.query.status as string | null;
    const limit = req.query.limit ? Number(req.query.limit) : 50;

    try {
      const conditions = [eq(googleReviews.storeId, storeId)];
      
      if (ratingFilter) {
        conditions.push(eq(googleReviews.rating, ratingFilter));
      }

      if (statusFilter) {
        conditions.push(eq(googleReviews.responseStatus, statusFilter));
      }

      const reviews = await db
        .select()
        .from(googleReviews)
        .where(and(...conditions))
        .orderBy(desc(googleReviews.reviewCreateTime))
        .limit(limit);

      return res.json({ reviews });
    } catch (error) {
      console.error("Error fetching reviews:", error);
      return res.status(500).json({ message: "Failed to fetch reviews" });
    }
  });

  /**
   * Get a single review with responses
   */
  app.get("/api/google-business/reviews/:storeId/:reviewId", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { storeId, reviewId } = req.params;
    const ownedStore = await storage.getStore(Number(storeId));
    if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    try {
      const review = await db
        .select()
        .from(googleReviews)
        .where(
          and(
            eq(googleReviews.storeId, Number(storeId)),
            eq(googleReviews.id, Number(reviewId))
          )
        )
        .limit(1);

      if (!review.length) {
        return res.status(404).json({ message: "Review not found" });
      }

      const responses = await db
        .select()
        .from(googleReviewResponses)
        .where(eq(googleReviewResponses.googleReviewId, Number(reviewId)));

      return res.json({
        review: review[0],
        responses,
      });
    } catch (error) {
      console.error("Error fetching review:", error);
      return res.status(500).json({ message: "Failed to fetch review" });
    }
  });

  /**
   * Create a draft response to a review
   */
  app.post("/api/google-business/review-response", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    try {
      const input = z
        .object({
          googleReviewId: z.number(),
          storeId: z.number(),
          responseText: z.string().min(1).max(5000),
          staffId: z.number().optional(),
        })
        .parse(req.body);

      // Verify the store belongs to the current user
      const ownedStore = await storage.getStore(input.storeId);
      if (!ownedStore || ownedStore.userId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const response = await db
        .insert(googleReviewResponses)
        .values({
          ...input,
          responseStatus: "pending",
          createdBy: userId,
        })
        .returning();

      return res.status(201).json(response[0]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.issues[0].message });
      } else {
        console.error("Error creating response:", error);
        return res.status(500).json({ message: "Failed to create response" });
      }
    }
  });

  /**
   * Update a review response
   */
  app.patch("/api/google-business/review-response/:responseId", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const responseId = Number(req.params.responseId);

    try {
      // Verify ownership via the response's storeId
      const [existingResp] = await db.select().from(googleReviewResponses).where(eq(googleReviewResponses.id, responseId)).limit(1);
      if (!existingResp) return res.status(404).json({ message: "Response not found" });
      const ownedStore = await storage.getStore(existingResp.storeId);
      if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });

      const input = z
        .object({
          responseText: z.string().min(1).max(5000).optional(),
          staffId: z.number().optional(),
        })
        .parse(req.body);

      const updated = await db
        .update(googleReviewResponses)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(googleReviewResponses.id, responseId))
        .returning();

      if (!updated.length) {
        return res.status(404).json({ message: "Response not found" });
      }

      return res.json(updated[0]);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.issues[0].message });
      } else {
        console.error("Error updating response:", error);
        return res.status(500).json({ message: "Failed to update response" });
      }
    }
  });

  /**
   * Publish a review response to Google.
   */
  app.post("/api/google-business/review-response/:responseId/publish", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const responseId = Number(req.params.responseId);

    try {
      const [existingResp] = await db.select().from(googleReviewResponses).where(eq(googleReviewResponses.id, responseId)).limit(1);
      if (!existingResp) return res.status(404).json({ message: "Response not found" });
      const ownedStore = await storage.getStore(existingResp.storeId);
      if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });

      await publishReviewResponse(responseId);
      return res.json({ message: "Response published successfully" });
    } catch (error) {
      console.error("Error publishing response:", error);
      return res.status(500).json({ message: "Failed to publish response" });
    }
  });

  /**
   * Delete a review response.
   * If the response was already published to Google (status = "approved"),
   * the reply is also removed from Google so the review stays in sync.
   */
  app.delete("/api/google-business/review-response/:responseId", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const responseId = Number(req.params.responseId);

    try {
      // Load the response first so we know if it was published
      const existing = await db
        .select()
        .from(googleReviewResponses)
        .where(eq(googleReviewResponses.id, responseId))
        .limit(1);

      if (!existing.length) return res.status(404).json({ message: "Response not found" });
      const ownedStore = await storage.getStore(existing[0].storeId);
      if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });

      if (existing.length && existing[0].responseStatus === "approved") {
        // Also delete the reply from Google so it doesn't stay visible
        try {
          const review = await db
            .select()
            .from(googleReviews)
            .where(eq(googleReviews.id, existing[0].googleReviewId))
            .limit(1);

          if (review.length) {
            const profile = await db
              .select()
              .from(googleBusinessProfiles)
              .where(eq(googleBusinessProfiles.storeId, review[0].storeId))
              .limit(1);

            if (profile.length) {
              const apiManager = createApiManagerFromProfile(profile[0]);
              const reviewResourceName = `${profile[0].locationResourceName}/reviews/${review[0].googleReviewId}`;
              await apiManager.deleteReviewReply(reviewResourceName);

              // Mark the review as not responded since reply was removed
              await db
                .update(googleReviews)
                .set({ responseStatus: "not_responded" })
                .where(eq(googleReviews.id, review[0].id));
            }
          }
        } catch (googleError) {
          // Non-fatal: log but still delete locally
          console.warn("Could not delete reply from Google:", googleError);
        }
      }

      await db
        .delete(googleReviewResponses)
        .where(eq(googleReviewResponses.id, responseId));

      return res.json({ message: "Response deleted successfully" });
    } catch (error) {
      console.error("Error deleting response:", error);
      return res.status(500).json({ message: "Failed to delete response" });
    }
  });

  /**
   * Retry failed auto-reply queue items for a store.
   * Resets status=failed rows back to "scheduled" (due immediately) so the
   * 5-minute dispatcher picks them up on its next tick.
   */
  app.post("/api/google-business/retry-failed-replies/:storeId", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const storeId = Number(req.params.storeId);
    try {
      const ownedStore = await storage.getStore(storeId);
      if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });

      // Fetch all failed items for this store.
      const failedItems = await db
        .select({
          id:            googleReviewResponseQueue.id,
          googleReviewId: googleReviewResponseQueue.googleReviewId,
        })
        .from(googleReviewResponseQueue)
        .where(
          and(
            eq(googleReviewResponseQueue.storeId, storeId),
            eq(googleReviewResponseQueue.status, "failed"),
          ),
        )
        .orderBy(desc(googleReviewResponseQueue.id));

      if (failedItems.length === 0) {
        return res.json({ retried: 0 });
      }

      // Deduplicate: for each unique googleReviewId keep only the most-recent
      // (highest id) failed entry — cancel the rest so the dispatcher never
      // attempts the same reply multiple times.
      const winnerById = new Map<number | null, number>(); // reviewId → queue row id
      for (const item of failedItems) {
        const key = item.googleReviewId;
        if (!winnerById.has(key)) {
          winnerById.set(key, item.id); // already ordered desc — first seen is latest
        }
      }

      const winnerIds  = Array.from(winnerById.values());
      const cancelIds  = failedItems.map((r) => r.id).filter((id) => !winnerIds.includes(id));
      const now = new Date();

      // Cancel duplicates.
      if (cancelIds.length > 0) {
        await db
          .update(googleReviewResponseQueue)
          .set({ status: "cancelled", failureReason: "Duplicate — superseded by a later retry", updatedAt: now })
          .where(inArray(googleReviewResponseQueue.id, cancelIds));
      }

      // Reset winners to scheduled.
      await db
        .update(googleReviewResponseQueue)
        .set({ status: "scheduled", scheduledFor: now, failureReason: null, attempts: 0, updatedAt: now })
        .where(inArray(googleReviewResponseQueue.id, winnerIds));

      console.log(`[ReviewEngine] retry-failed-replies — storeId=${storeId} retried=${winnerIds.length} cancelled_dupes=${cancelIds.length}`);
      return res.json({ retried: winnerIds.length, cancelledDuplicates: cancelIds.length });
    } catch (err: any) {
      console.error("[ReviewEngine] retry-failed-replies error:", err?.message ?? err);
      return res.status(500).json({ message: "Failed to retry queue items" });
    }
  });

  /**
   * POST /api/google-business/cancel-overdue-queue/:storeId
   * One-shot cleanup: cancel every scheduled or failed queue item whose
   * linked review is older than the store's maxReviewAgeDays threshold.
   * Returns { cancelled: number }.
   */
  app.post("/api/google-business/cancel-overdue-queue/:storeId", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const storeId = Number(req.params.storeId);
    try {
      const ownedStore = await storage.getStore(storeId);
      if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });

      // Read the store's configured age limit (default 21 days).
      const [settings] = await db
        .select({ maxReviewAgeDays: googleReviewEngineSettings.maxReviewAgeDays })
        .from(googleReviewEngineSettings)
        .where(eq(googleReviewEngineSettings.storeId, storeId));

      const maxAgeDays = settings?.maxReviewAgeDays ?? 21;
      const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);

      // Find active queue items whose linked review pre-dates the cutoff.
      const overdue = await db
        .select({ id: googleReviewResponseQueue.id, ageDays: sql<number>`EXTRACT(EPOCH FROM (NOW() - ${googleReviews.reviewDate})) / 86400` })
        .from(googleReviewResponseQueue)
        .innerJoin(googleReviews, eq(googleReviewResponseQueue.googleReviewId, googleReviews.id))
        .where(
          and(
            eq(googleReviewResponseQueue.storeId, storeId),
            inArray(googleReviewResponseQueue.status, ["scheduled", "failed"]),
            sql`${googleReviews.reviewDate} < ${cutoff.toISOString()}`,
          ),
        );

      if (overdue.length === 0) {
        return res.json({ cancelled: 0 });
      }

      const overdueIds = overdue.map((r) => r.id);
      const now = new Date();
      await db
        .update(googleReviewResponseQueue)
        .set({
          status:        "cancelled",
          failureReason: `Review older than the ${maxAgeDays}-day auto-reply window — cancelled by bulk cleanup`,
          updatedAt:     now,
        })
        .where(inArray(googleReviewResponseQueue.id, overdueIds));

      console.log(`[ReviewEngine] cancel-overdue-queue — storeId=${storeId} cancelled=${overdueIds.length} (limit=${maxAgeDays}d)`);
      return res.json({ cancelled: overdueIds.length });
    } catch (err: any) {
      console.error("[ReviewEngine] cancel-overdue-queue error:", err?.message ?? err);
      return res.status(500).json({ message: "Failed to cancel overdue queue items" });
    }
  });

  /**
   * Get review statistics
   */
  app.get("/api/google-business/reviews-stats/:storeId", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const storeId = Number(req.params.storeId);
    const ownedStore = await storage.getStore(storeId);
    if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    try {
      const [allReviews, profileRows] = await Promise.all([
        db
          .select()
          .from(googleReviews)
          .where(eq(googleReviews.storeId, storeId)),
        db
          .select({ lastSyncedAt: googleBusinessProfiles.lastSyncedAt })
          .from(googleBusinessProfiles)
          .where(eq(googleBusinessProfiles.storeId, storeId))
          .limit(1),
      ]);

      const lastSyncedAt = profileRows[0]?.lastSyncedAt ?? null;

      const stats = {
        totalReviews: allReviews.length,
        averageRating: 
          allReviews.length > 0
            ? (allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length).toFixed(1)
            : 0,
        respondedReviews: allReviews.filter((r) => r.responseStatus === "responded").length,
        notRespondedReviews: allReviews.filter((r) => r.responseStatus === "not_responded").length,
        ratingDistribution: {
          5: allReviews.filter((r) => r.rating === 5).length,
          4: allReviews.filter((r) => r.rating === 4).length,
          3: allReviews.filter((r) => r.rating === 3).length,
          2: allReviews.filter((r) => r.rating === 2).length,
          1: allReviews.filter((r) => r.rating === 1).length,
        },
        lastSyncedAt,
        nextSyncAt: lastSyncedAt
          ? new Date(new Date(lastSyncedAt).getTime() + 6 * 60 * 60 * 1000)
          : null,
      };

      return res.json(stats);
    } catch (error) {
      console.error("Error getting review stats:", error);
      return res.status(500).json({ message: "Failed to get review stats" });
    }
  });

  /**
   * Get the single most-recent unanswered review for a store.
   * Used by the dashboard quick-reply widget.
   */
  app.get("/api/google-business/unanswered-review/:storeId", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const storeId = Number(req.params.storeId);
    const ownedStore = await storage.getStore(storeId);
    if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    try {
      const [review] = await db
        .select()
        .from(googleReviews)
        .where(
          and(
            eq(googleReviews.storeId, storeId),
            eq(googleReviews.responseStatus, "not_responded")
          )
        )
        .orderBy(desc(googleReviews.reviewCreateTime))
        .limit(1);

      return res.json({ review: review ?? null });
    } catch (error) {
      console.error("Error fetching unanswered review:", error);
      return res.status(500).json({ message: "Failed to fetch review" });
    }
  });

  /**
   * GET /api/google-business/reviews-sentiment/:storeId
   * Returns the cached sentiment analysis for a store (if one exists).
   * Returns 404 with { cached: false } when no analysis has been run yet.
   */
  app.get("/api/google-business/reviews-sentiment/:storeId", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const storeId = Number(req.params.storeId);
    const ownedStore = await storage.getStore(storeId);
    if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    try {
      const { reviewSentimentCache } = await import("@shared/schema");
      const rows = await db
        .select()
        .from(reviewSentimentCache)
        .where(eq(reviewSentimentCache.storeId, storeId))
        .limit(1);

      if (!rows.length) {
        return res.status(404).json({ cached: false });
      }

      const row = rows[0];
      return res.json({
        themes:       row.themes,
        reviewCount:  row.reviewCount,
        generatedAt:  row.generatedAt,
        cached:       true,
      });
    } catch (error: any) {
      console.error("Sentiment cache fetch error:", error);
      return res.status(500).json({ message: "Failed to load cached analysis" });
    }
  });

  /**
   * POST /api/google-business/reviews-sentiment/:storeId
   * Runs a fresh AI-powered review sentiment/theme analysis and caches the result.
   */
  app.post("/api/google-business/reviews-sentiment/:storeId", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const storeId = Number(req.params.storeId);
    const ownedStore = await storage.getStore(storeId);
    if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    try {
      const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(503).json({
          message: "Review sentiment analysis is unavailable: OpenAI API key is not configured.",
        });
      }

      const allReviews = await db
        .select({ reviewText: googleReviews.reviewText, rating: googleReviews.rating })
        .from(googleReviews)
        .where(
          and(
            eq(googleReviews.storeId, storeId),
            isNotNull(googleReviews.reviewText)
          )
        );

      if (allReviews.length === 0) {
        return res.json({ themes: [], reviewCount: 0, generatedAt: new Date(), cached: false });
      }

      // Build a compact representation for the AI prompt
      const reviewLines = allReviews
        .slice(0, 120) // cap at 120 to keep prompt size manageable
        .map((r, i) => `[${i + 1}] (${r.rating}★) ${r.reviewText}`)
        .join("\n");

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        apiKey,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
          role: "user",
          content: [
            "Analyse the following customer reviews for a service business.",
            "Identify the most frequently mentioned themes (e.g. Staff friendliness, Wait time, Service quality, Cleanliness, Pricing & value, Booking experience, Results, Atmosphere).",
            "For each theme, determine the overall sentiment based on how customers discuss it.",
            "",
            "Rules:",
            "- Return 4–8 themes that have the most mentions.",
            "- Each theme must have at least 2 mentions to be included.",
            "- For each theme include 1–2 short verbatim quote snippets (under 80 chars each) from the reviews as examples.",
            "- Sentiment must be exactly one of: 'positive', 'neutral', 'negative'.",
            "- Count = number of reviews that mention this theme.",
            "",
            `Reviews (${allReviews.length} total, showing up to 120):`,
            reviewLines,
            "",
            `Return JSON only:
{
  "themes": [
    {
      "name": "Theme name",
      "sentiment": "positive" | "neutral" | "negative",
      "count": <number>,
      "examples": ["short quote 1", "short quote 2"]
    }
  ]
}`,
          ].join("\n"),
        }],
        response_format: { type: "json_object" },
        max_completion_tokens: 1024,
      });

      const raw = completion.choices[0]?.message?.content ?? "{}";
      let parsed: { themes?: any[] } = {};
      try { parsed = JSON.parse(raw); } catch { /* fall through */ }

      const themes      = Array.isArray(parsed.themes) ? parsed.themes : [];
      const reviewCount = allReviews.length;
      const generatedAt = new Date();

      // Upsert: one row per store, always reflects the most recent analysis
      const { reviewSentimentCache } = await import("@shared/schema");
      await db
        .insert(reviewSentimentCache)
        .values({ storeId, themes, reviewCount, generatedAt, updatedAt: generatedAt })
        .onConflictDoUpdate({
          target: reviewSentimentCache.storeId,
          set:    { themes, reviewCount, generatedAt, updatedAt: generatedAt },
        });

      return res.json({ themes, reviewCount, generatedAt, cached: false });
    } catch (error: any) {
      const errMsg = error?.message ?? String(error);
      console.error("Sentiment analysis error:", error);
      return res.status(500).json({ message: `Failed to analyse sentiment: ${errMsg}` });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GBP LISTING SYNC — push booking URL + hours to Google Business Profile
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET /api/google-business/listing-preview?storeId=X
   * Returns what would be pushed to Google (booking URL, hours, service count).
   * Does NOT call any Google API — reads only from Certxa DB.
   */
  app.get("/api/google-business/listing-preview", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const storeId = Number(req.query.storeId);
    if (!storeId) return res.status(400).json({ message: "storeId required" });

    const ownedStore = await storage.getStore(storeId);
    if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    try {
      // Load store slug
      const storeRows = await db
        .select({
          bookingSlug: locations.bookingSlug,
          name: locations.name,
        })
        .from(locations)
        .where(eq(locations.id, storeId))
        .limit(1);

      const store = storeRows[0];
      const hasSlug = !!store?.bookingSlug;
      const bookingUrl = hasSlug ? `https://certxa.com/book/${store.bookingSlug}` : "";

      // Load business hours
      const hoursRows = await db
        .select()
        .from(businessHours)
        .where(eq(businessHours.storeId, storeId));

      // DB stores dayOfWeek using JS convention: Sun=0, Mon=1 … Sat=6
      const DOW_NAMES: Record<number, string> = { 0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday" };
      // Display in Mon-first order: sort by (dow + 6) % 7 so Mon(1)→0 … Sun(0)→6
      const hours = hoursRows.map(h => ({
        dayOfWeek: h.dayOfWeek,
        dayName:   DOW_NAMES[h.dayOfWeek] ?? `Day ${h.dayOfWeek}`,
        openTime:  h.openTime,
        closeTime: h.closeTime,
        isClosed:  h.isClosed,
      })).sort((a, b) => ((a.dayOfWeek + 6) % 7) - ((b.dayOfWeek + 6) % 7));

      // Load service count
      const serviceRows = await db
        .select({ id: services.id })
        .from(services)
        .where(eq(services.storeId, storeId));

      // Load last listing sync metadata from GBP profile
      const profileRows = await db
        .select({
          listingSyncedAt:   googleBusinessProfiles.listingSyncedAt,
          listingBookingUrl: googleBusinessProfiles.listingBookingUrl,
        })
        .from(googleBusinessProfiles)
        .where(eq(googleBusinessProfiles.storeId, storeId))
        .limit(1);

      const profile = profileRows[0];

      return res.json({
        bookingUrl,
        hasSlug,
        hours,
        serviceCount:        serviceRows.length,
        lastListingSyncedAt: profile?.listingSyncedAt ?? null,
        lastListingBookingUrl: profile?.listingBookingUrl ?? null,
      });
    } catch (error) {
      console.error("[GBP Listing Preview] error:", error);
      return res.status(500).json({ message: "Failed to build listing preview" });
    }
  });

  /**
   * GET /api/google-business/hours-diff?storeId=X
   *
   * Returns a day-by-day comparison between Certxa's stored business hours and
   * the regularHours currently on the Google Business Profile.
   *
   * status per day:
   *   "match"          – both sides agree (or both closed)
   *   "different"      – open/close times or closed-state differ
   *   "google_missing" – Certxa has hours but Google has no period for this day
   *   "certxa_missing" – Google has a period but Certxa has no row for this day
   *
   * hasDiff: true when ANY day has status !== "match"
   */
  app.get("/api/google-business/hours-diff", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const storeId = Number(req.query.storeId);
    if (!storeId) return res.status(400).json({ message: "storeId required" });

    const ownedStore = await storage.getStore(storeId);
    if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    try {
      // ── Load Certxa hours ─────────────────────────────────────────────────
      const hoursRows = await db
        .select()
        .from(businessHours)
        .where(eq(businessHours.storeId, storeId));

      // Map dayOfWeek → Certxa row
      const certxaByDay = new Map<number, { isClosed: boolean; openTime: string; closeTime: string }>();
      for (const h of hoursRows) {
        certxaByDay.set(h.dayOfWeek, { isClosed: h.isClosed, openTime: h.openTime, closeTime: h.closeTime });
      }

      // ── Load GBP profile & fetch live Google hours ─────────────────────────
      const profileRows = await db
        .select()
        .from(googleBusinessProfiles)
        .where(eq(googleBusinessProfiles.storeId, storeId))
        .limit(1);

      const profile = profileRows[0];
      if (!profile?.locationResourceName) {
        return res.status(404).json({ message: "No connected Google Business Profile found." });
      }

      const apiManager = createApiManagerFromProfile(profile);
      const googleData = await apiManager.getLocationDetails(profile.locationResourceName);

      // ── Parse Google regularHours ─────────────────────────────────────────
      // Build dayIndex → { openTime, closeTime } from Google's periods array.
      // Days not present are treated as closed by Google.
      // DB stores dayOfWeek using JS getDay() convention: 0=Sunday, 1=Monday … 6=Saturday
      const GBP_DAY_INDEX: Record<string, number> = {
        SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3,
        THURSDAY: 4, FRIDAY: 5, SATURDAY: 6,
      };

      function padTime(h: number, m: number) {
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      }

      const googleByDay = new Map<number, { openTime: string; closeTime: string }>();
      for (const period of googleData?.regularHours?.periods ?? []) {
        const idx = GBP_DAY_INDEX[period.openDay];
        if (idx === undefined) continue;
        googleByDay.set(idx, {
          openTime:  padTime(period.openTime?.hours ?? 0, period.openTime?.minutes ?? 0),
          closeTime: padTime(period.closeTime?.hours ?? 0, period.closeTime?.minutes ?? 0),
        });
      }

      // ── Build diff ────────────────────────────────────────────────────────
      // DB stores dayOfWeek using JS getDay() convention: 0=Sunday, 1=Monday … 6=Saturday
      const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const ORDER    = [1, 2, 3, 4, 5, 6, 0]; // Mon–Sat, then Sun

      type DiffStatus = "match" | "different" | "google_missing" | "certxa_missing";

      const days = ORDER.map((dow) => {
        const certxa = certxaByDay.get(dow);
        const google = googleByDay.get(dow);

        const certxaOpen   = certxa ? !certxa.isClosed : false;
        const googleOpen   = !!google;

        let status: DiffStatus;

        if (!certxa && !google) {
          // Neither side has data — treat as both closed/match
          status = "match";
        } else if (certxaOpen && !googleOpen) {
          status = "google_missing";
        } else if (!certxaOpen && googleOpen) {
          status = "certxa_missing";
        } else if (!certxaOpen && !googleOpen) {
          // Both closed
          status = "match";
        } else {
          // Both open — compare times
          status =
            certxa!.openTime === google!.openTime && certxa!.closeTime === google!.closeTime
              ? "match"
              : "different";
        }

        return {
          dayOfWeek: dow,
          dayName:   DAY_NAMES[dow],
          certxa: certxa
            ? { isClosed: certxa.isClosed, openTime: certxa.openTime, closeTime: certxa.closeTime }
            : null,
          google: google ? { isClosed: false, openTime: google.openTime, closeTime: google.closeTime }
            : googleByDay.size === 0 && (googleData?.regularHours?.periods ?? []).length === 0
              ? null        // Google has no hours at all — not the same as "this day closed"
              : { isClosed: true, openTime: null, closeTime: null },
          status,
        };
      });

      const hasDiff       = days.some(d => d.status !== "match");
      const googleHasAny  = googleByDay.size > 0;
      const certxaHasAny  = certxaByDay.size > 0;

      return res.json({ connected: true, days, hasDiff, googleHasAny, certxaHasAny });
    } catch (error: any) {
      const msg = error?.message ?? String(error);
      console.error("[GBP Hours Diff]", error);
      // Surface a friendlier message for auth errors
      if (error?.status === 401 || error?.status === 403 || msg.includes("access token")) {
        return res.status(502).json({ message: "Google token expired — reconnect your Google Business Profile." });
      }
      return res.status(500).json({ message: `Failed to fetch hours diff: ${msg}` });
    }
  });

  /**
   * POST /api/google-business/sync-listing
   * Body: { storeId: number }
   * Pushes the Certxa booking URL and business hours to Google Business Profile.
   * Does NOT implement Reserve with Google or any booking-partner feature.
   */
  app.post("/api/google-business/sync-listing", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const storeId = Number(req.body.storeId);
    if (!storeId) return res.status(400).json({ message: "storeId required" });

    const ownedStore = await storage.getStore(storeId);
    if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    try {
      const result = await syncListingToGoogle(storeId);
      return res.json({
        success: true,
        message: `Booking URL and ${result.hoursSynced} hours period(s) pushed to Google successfully.`,
        bookingUrl:           result.bookingUrl,
        hoursSynced:          result.hoursSynced,
        locationResourceName: result.locationResourceName,
      });
    } catch (error: any) {
      const msg = error?.message ?? String(error);
      console.error("[GBP Listing Sync] route error:", error);

      // Log failure to audit log
      await db.insert(googleBusinessSyncLogs).values({
        storeId,
        syncType:     "listing",
        status:       "failed",
        errorMessage: msg.slice(0, 500),
      }).catch(() => {});

      return res.status(500).json({ message: msg });
    }
  });

  /**
   * GET /api/google-business/review-link?storeId=X
   * Returns the stored Google "Write a review" link for this store.
   * Also triggers a fresh fetch from GBP if the stored value is null.
   */
  app.get("/api/google-business/review-link", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const storeId = Number(req.query.storeId);
    if (!storeId) return res.status(400).json({ message: "storeId required" });

    const ownedStore = await storage.getStore(storeId);
    if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    try {
      // Return the stored link first
      const profiles = await db
        .select({ googleReviewLink: googleBusinessProfiles.googleReviewLink })
        .from(googleBusinessProfiles)
        .where(eq(googleBusinessProfiles.storeId, storeId))
        .limit(1);

      const stored = profiles[0]?.googleReviewLink ?? null;

      // If no stored link, try to fetch it now (synchronously so the response has it)
      if (!stored) {
        const fresh = await fetchAndStoreReviewLink(storeId);
        return res.json({ reviewLink: fresh });
      }

      return res.json({ reviewLink: stored });
    } catch (e: any) {
      console.error("[GBP review-link] error:", e?.message ?? e);
      return res.status(500).json({ message: "Failed to retrieve review link" });
    }
  });

  // ─── GBP SERVICE SYNC ────────────────────────────────────────────────────────

  /**
   * GET /api/google-business/services/sync-settings?storeId=X
   * Returns per-store service sync policy and last-sync metadata.
   */
  app.get("/api/google-business/services/sync-settings", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const storeId = Number(req.query.storeId);
    if (!storeId) return res.status(400).json({ message: "storeId required" });

    const ownedStore = await storage.getStore(storeId);
    if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    const rows = await db
      .select()
      .from(googleServiceSyncSettings)
      .where(eq(googleServiceSyncSettings.storeId, storeId))
      .limit(1);

    if (!rows.length) {
      // Return sensible defaults when no row exists yet
      return res.json({
        syncEnabled: false,
        syncName: true,
        syncDescription: true,
        syncPrice: true,
        syncAddNew: true,
        syncRemoveDeleted: false,
        syncMode: "auto",
        lastSyncedAt: null,
        lastSyncStatus: null,
        lastSyncError: null,
        lastSyncCount: null,
      });
    }

    const row = rows[0];
    return res.json({
      syncEnabled: row.syncEnabled,
      syncName: row.syncName,
      syncDescription: row.syncDescription,
      syncPrice: row.syncPrice,
      syncAddNew: row.syncAddNew,
      syncRemoveDeleted: row.syncRemoveDeleted,
      syncMode: row.syncMode,
      lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
      lastSyncStatus: row.lastSyncStatus,
      lastSyncError: row.lastSyncError,
      lastSyncCount: row.lastSyncCount,
    });
  });

  /**
   * PUT /api/google-business/services/sync-settings
   * Body: { storeId, syncEnabled?, syncName?, syncDescription?, syncPrice?,
   *         syncAddNew?, syncRemoveDeleted?, syncMode? }
   * Upserts the service sync policy for the store.
   */
  app.put("/api/google-business/services/sync-settings", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const storeId = Number(req.body.storeId);
    if (!storeId) return res.status(400).json({ message: "storeId required" });

    const ownedStore = await storage.getStore(storeId);
    if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    const allowed = [
      "syncEnabled", "syncName", "syncDescription", "syncPrice",
      "syncAddNew", "syncRemoveDeleted", "syncMode",
    ] as const;

    const patch: Record<string, any> = { updatedAt: new Date() };
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }

    await db
      .insert(googleServiceSyncSettings)
      .values({
        storeId,
        syncEnabled:       patch.syncEnabled       ?? false,
        syncName:          patch.syncName          ?? true,
        syncDescription:   patch.syncDescription   ?? true,
        syncPrice:         patch.syncPrice         ?? true,
        syncAddNew:        patch.syncAddNew        ?? true,
        syncRemoveDeleted: patch.syncRemoveDeleted ?? false,
        syncMode:          patch.syncMode          ?? "auto",
        updatedAt:         new Date(),
      })
      .onConflictDoUpdate({
        target: googleServiceSyncSettings.storeId,
        set: patch,
      });

    return res.json({ success: true });
  });

  /**
   * POST /api/google-business/services/sync
   * Body: { storeId }
   * Manually trigger a full services push to Google Business Profile.
   */
  app.post("/api/google-business/services/sync", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const storeId = Number(req.body.storeId);
    if (!storeId) return res.status(400).json({ message: "storeId required" });

    const ownedStore = await storage.getStore(storeId);
    if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    try {
      const result = await syncServicesToGoogle(storeId);
      return res.json({
        success: true,
        message: `${result.syncedCount} service(s) pushed to Google Business Profile.`,
        syncedCount: result.syncedCount,
        locationResourceName: result.locationResourceName,
      });
    } catch (error: any) {
      const msg = error?.message ?? String(error);
      console.error("[GBP Service Sync] route error:", error);

      // Persist failure
      await db
        .insert(googleServiceSyncSettings)
        .values({
          storeId,
          syncEnabled: false,
          lastSyncedAt: new Date(),
          lastSyncStatus: "failed",
          lastSyncError: msg.slice(0, 500),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: googleServiceSyncSettings.storeId,
          set: {
            lastSyncedAt:   new Date(),
            lastSyncStatus: "failed",
            lastSyncError:  msg.slice(0, 500),
            updatedAt:      new Date(),
          },
        });

      return res.status(500).json({ message: msg });
    }
  });

  /**
   * POST /api/services/bulk-generate-descriptions
   * Generates and SAVES descriptions for every service that currently has none.
   * Abuse prevention: only processes services with a null/empty description.
   * Uses gpt-4o-mini (cheapest model) — concurrency capped at 3 to avoid rate limits.
   */
  app.post("/api/services/bulk-generate-descriptions", isAuthenticated, async (req, res) => {
    const sessionStoreId = await resolveSessionStoreId(req);
    if (!sessionStoreId) return res.status(403).json({ message: "No store context" });

    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(503).json({ message: "AI features not configured on this server." });

    // Fetch all services for this store
    const allServices = await storage.getServices(sessionStoreId);

    // Only process services missing a description (abuse prevention)
    const targets = allServices.filter(
      (s) => !s.description || s.description.trim() === ""
    );

    if (targets.length === 0) {
      return res.json({ updated: 0, message: "All services already have descriptions." });
    }

    try {
      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({
        apiKey,
        ...(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
          ? { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL } : {}),
      });

      const buildPrompt = (name: string, price: string | number | null, duration: number | null) =>
        [
          `Write a professional, concise service description for a beauty salon service.`,
          ``,
          `Service name: ${name}`,
          price    ? `Price: ${Number(price).toFixed(2)}`    : "",
          duration ? `Duration: ${duration} minutes`         : "",
          ``,
          `Requirements:`,
          `- 1–2 sentences, approximately 20–40 words`,
          `- Professional and welcoming tone`,
          `- Describe what's included in the service and the result/benefit`,
          `- No prices or durations in the description`,
          `- No hashtags, bullet points, or markdown`,
          ``,
          `Return only the description text. No quotes, no labels.`,
        ].filter(Boolean).join("\n");

      // Process in batches of 3 to respect rate limits
      const CONCURRENCY = 3;
      let updated = 0;
      let failed  = 0;

      for (let i = 0; i < targets.length; i += CONCURRENCY) {
        const batch = targets.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async (svc) => {
          try {
            const completion = await openai.chat.completions.create({
              model:       "gpt-4o-mini",
              messages:    [{ role: "user", content: buildPrompt(svc.name, svc.price, svc.duration) }],
              max_tokens:  120,
              temperature: 0.65,
            });
            const description = completion.choices[0]?.message?.content?.trim() ?? "";
            if (description) {
              await storage.updateService(svc.id, { description });
              updated++;
            }
          } catch (err) {
            console.error(`[BulkDescriptions] Failed for service ${svc.id}:`, err);
            failed++;
          }
        }));
      }

      return res.json({ updated, failed, total: targets.length });
    } catch (error: any) {
      console.error("[BulkDescriptions] error:", error);
      return res.status(500).json({ message: error?.message ?? "AI generation failed" });
    }
  });

  /**
   * POST /api/services/:id/generate-description
   * Uses AI to suggest a short professional service description.
   * The owner can edit/accept before saving — never auto-saves.
   */
  app.post("/api/services/:id/generate-description", isAuthenticated, async (req, res) => {
    const serviceId = Number(req.params.id);
    const sessionStoreId = await resolveSessionStoreId(req);
    if (!sessionStoreId) return res.status(403).json({ message: "No store context" });

    const existing = await storage.getService(serviceId);
    if (!existing) return res.status(404).json({ message: "Service not found" });
    if (existing.storeId !== sessionStoreId) return res.status(403).json({ message: "Forbidden" });

    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(503).json({ message: "AI features not configured on this server." });

    try {
      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({
        apiKey,
        ...(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
          ? { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL } : {}),
      });

      const prompt = [
        `Write a professional, concise service description for a beauty salon service.`,
        ``,
        `Service name: ${existing.name}`,
        existing.price ? `Price: ${Number(existing.price).toFixed(2)}` : "",
        existing.duration ? `Duration: ${existing.duration} minutes` : "",
        ``,
        `Requirements:`,
        `- 1–2 sentences, approximately 20–40 words`,
        `- Professional and welcoming tone`,
        `- Describe what's included in the service and the result/benefit`,
        `- No prices or durations in the description`,
        `- No hashtags, bullet points, or markdown`,
        ``,
        `Return only the description text. No quotes, no labels.`,
      ].filter(Boolean).join("\n");

      const completion = await openai.chat.completions.create({
        model:       "gpt-4o-mini",
        messages:    [{ role: "user", content: prompt }],
        max_tokens:  120,
        temperature: 0.65,
      });

      const description = completion.choices[0]?.message?.content?.trim() ?? "";
      return res.json({ description });
    } catch (error: any) {
      console.error("[Service AI Description] error:", error);
      return res.status(500).json({ message: error?.message ?? "AI generation failed" });
    }
  });

  // ─── GOOGLE BUSINESS PROFILE COMPLETION ASSISTANT ───────────────────────────

  /**
   * GET /api/google-business/profile-audit?storeId=X
   *
   * Reads the live Google listing via the API and compares with Certxa's data
   * to find gaps (missing hours, no description, no booking URL, etc.).
   * Returns a completion percentage and per-field gap analysis.
   *
   * Fill policy (per product spec):
   *  - Fill if empty:       hours, services, bookingUrl, description
   *  - Conflict warning:    bookingUrl when Google already has a different URL
   *  - Never auto-push:     businessName, address, phone, categories, photos
   *  - Suggestion only:     categories (user must act on Google themselves)
   */
  app.get("/api/google-business/profile-audit", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const storeId = Number(req.query.storeId);
    if (!storeId) return res.status(400).json({ message: "storeId required" });

    const ownedStore = await storage.getStore(storeId);
    if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    try {
      // Load connected GBP profile
      const profileRows = await db.select().from(googleBusinessProfiles)
        .where(eq(googleBusinessProfiles.storeId, storeId)).limit(1);
      const profile = profileRows[0];
      if (!profile?.locationResourceName) {
        return res.status(404).json({ message: "No connected Google Business Profile found." });
      }

      // Read live data from Google
      const apiManager = createApiManagerFromProfile(profile);
      const googleData = await apiManager.getLocationDetails(profile.locationResourceName);

      // Load Certxa data in parallel
      const [storeRows, hoursRows, serviceRows] = await Promise.all([
        db.select({ bookingSlug: locations.bookingSlug, name: locations.name })
          .from(locations).where(eq(locations.id, storeId)).limit(1),
        db.select().from(businessHours).where(eq(businessHours.storeId, storeId)),
        db.select({ id: services.id, name: services.name })
          .from(services).where(eq(services.storeId, storeId)),
      ]);

      const store = storeRows[0];
      const certxaBookingUrl = store?.bookingSlug
        ? `https://certxa.com/book/${store.bookingSlug}` : "";
      const openDays = hoursRows.filter(h => !h.isClosed);

      // Interpret Google data
      const googleHasHours      = (googleData.regularHours?.periods?.length ?? 0) > 0;
      const googleWebsiteUri    = googleData.websiteUri ?? null;
      const googleHasServices   = (googleData.serviceItems?.length ?? 0) > 0;
      const googleHasDescription= !!(googleData.profile?.description);
      const googleHasCategories = !!(googleData.categories?.primaryCategory);

      // Booking URL status
      let bookingUrlStatus: "ok" | "missing" | "conflict" = "missing";
      if (googleWebsiteUri) {
        bookingUrlStatus = googleWebsiteUri.includes("certxa.com") ? "ok" : "conflict";
      }

      const gaps = [
        {
          field: "hours",
          label: "Business Hours",
          status: googleHasHours ? "ok" : "missing",
          description: googleHasHours
            ? "Google already has your business hours."
            : openDays.length > 0
              ? `${openDays.length} open day(s) on Certxa are ready to sync.`
              : "Set your hours in Certxa Settings → Hours first.",
          certxaValue: openDays.length > 0 ? `${openDays.length} open day(s) on Certxa` : undefined,
          canAutoFill: !googleHasHours && openDays.length > 0,
        },
        {
          field: "bookingUrl",
          label: "Booking Link",
          status: bookingUrlStatus,
          description:
            bookingUrlStatus === "ok"      ? "Google already shows your Certxa booking link." :
            bookingUrlStatus === "conflict" ? "Google has a booking link from another provider." :
            certxaBookingUrl               ? "Add your Certxa booking page to Google."
                                           : "Set up a booking-page slug first.",
          certxaValue: certxaBookingUrl || undefined,
          googleValue: googleWebsiteUri ?? undefined,
          canAutoFill: bookingUrlStatus === "missing" && !!certxaBookingUrl,
        },
        {
          field: "services",
          label: "Services List",
          status: googleHasServices ? "ok" : "missing",
          description: googleHasServices
            ? "Google already lists your services."
            : serviceRows.length > 0
              ? `${serviceRows.length} Certxa service(s) can be added to Google.`
              : "Add services in Certxa first.",
          certxaValue: serviceRows.length > 0 ? `${serviceRows.length} service(s) on Certxa` : undefined,
          canAutoFill: !googleHasServices && serviceRows.length > 0,
        },
        {
          field: "description",
          label: "Business Description",
          status: googleHasDescription ? "ok" : "missing",
          description: googleHasDescription
            ? "Google already has a business description."
            : "Add a description — Certxa can generate a draft with AI.",
          canAutoFill: !googleHasDescription,
        },
        {
          field: "categories",
          label: "Business Category",
          status: googleHasCategories ? "ok" : "suggest",
          description: googleHasCategories
            ? "Google has a category set for your business."
            : "Adding a category helps customers find you. You'll set this on Google directly.",
          canAutoFill: false,
        },
      ];

      const completedCount  = gaps.filter(g => g.status === "ok").length;
      const completionPct   = Math.round((completedCount / gaps.length) * 100);

      return res.json({
        completionPct,
        completedCount,
        totalFields: gaps.length,
        gaps,
        googleData: {
          title:          googleData.title ?? null,
          hasHours:       googleHasHours,
          websiteUri:     googleWebsiteUri,
          hasServices:    googleHasServices,
          hasDescription: googleHasDescription,
          hasCategories:  googleHasCategories,
        },
        certxaData: {
          bookingUrl:   certxaBookingUrl,
          hasHours:     openDays.length > 0,
          openDaysCount: openDays.length,
          serviceCount: serviceRows.length,
          storeName:    store?.name ?? "",
        },
      });
    } catch (error: any) {
      const msg = error?.message ?? String(error);
      console.error("[GBP Profile Audit] error:", error);
      const status = (error?.status && typeof error.status === "number") ? error.status : 500;
      return res.status(status).json({ message: msg });
    }
  });

  /**
   * POST /api/google-business/fill-gap
   * Body: { storeId, field, description?, replaceExisting? }
   *
   * Fills a single gap on the live Google listing. Never overwrites data that
   * is already present unless replaceExisting=true (used only for bookingUrl conflict).
   */
  app.post("/api/google-business/fill-gap", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { storeId: rawId, field, description: descText, replaceExisting } = req.body;
    const storeId = Number(rawId);
    if (!storeId || !field) return res.status(400).json({ message: "storeId and field are required" });

    const ownedStore = await storage.getStore(storeId);
    if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    try {
      const profileRows = await db.select().from(googleBusinessProfiles)
        .where(eq(googleBusinessProfiles.storeId, storeId)).limit(1);
      const profile = profileRows[0];
      if (!profile?.locationResourceName) {
        return res.status(404).json({ message: "No connected Google Business Profile found." });
      }

      const apiManager     = createApiManagerFromProfile(profile);
      const locationName   = profile.locationResourceName;
      // DB stores dayOfWeek as 0=Monday … 6=Sunday
      const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

      // ── hours ─────────────────────────────────────────────────────────────
      if (field === "hours") {
        const hoursRows = await db.select().from(businessHours)
          .where(eq(businessHours.storeId, storeId));
        const periods = hoursRows
          .filter(h => !h.isClosed && h.openTime && h.closeTime)
          .map(h => {
            const [oh, om = 0] = (h.openTime  as string).split(":").map(Number);
            const [ch, cm = 0] = (h.closeTime as string).split(":").map(Number);
            return {
              openDay:   DAYS[h.dayOfWeek],
              openTime:  { hours: oh, minutes: om },
              closeDay:  DAYS[h.dayOfWeek],
              closeTime: { hours: ch, minutes: cm },
            };
          });
        if (periods.length === 0) return res.status(400).json({ message: "No open hours to sync." });
        await updateListingFields(locationName, { regularHours: { periods } }, (apiManager as any).oauth2Client);
        return res.json({ success: true, message: `${periods.length} hours period(s) pushed to Google.` });
      }

      // ── bookingUrl ────────────────────────────────────────────────────────
      if (field === "bookingUrl") {
        const [storeRow] = await db.select({ bookingSlug: locations.bookingSlug })
          .from(locations).where(eq(locations.id, storeId)).limit(1);
        if (!storeRow?.bookingSlug) {
          return res.status(400).json({ message: "No booking slug configured yet." });
        }
        const certxaUrl = `https://certxa.com/book/${storeRow.bookingSlug}`;

        // Conflict check — re-read live Google data unless caller confirmed replace
        if (!replaceExisting) {
          const liveData  = await apiManager.getLocationDetails(locationName);
          const existing  = liveData.websiteUri ?? null;
          if (existing && !existing.includes("certxa.com")) {
            return res.status(409).json({ message: "conflict", existingUrl: existing, certxaUrl });
          }
        }

        await updateListingFields(locationName, { websiteUri: certxaUrl }, (apiManager as any).oauth2Client);
        return res.json({ success: true, message: "Certxa booking URL pushed to Google." });
      }

      // ── services ──────────────────────────────────────────────────────────
      if (field === "services") {
        const serviceRows = await db.select({ name: services.name, description: services.description })
          .from(services).where(eq(services.storeId, storeId)).limit(50);
        if (serviceRows.length === 0) return res.status(400).json({ message: "No services to sync." });

        const serviceItems = serviceRows.map(s => ({
          freeFormServiceItem: {
            label: {
              displayName: s.name,
              ...(s.description ? { description: (s.description as string).slice(0, 300) } : {}),
              languageCode: "en",
            },
          },
        }));
        await updateListingFields(locationName, { serviceItems }, (apiManager as any).oauth2Client);
        return res.json({ success: true, message: `${serviceItems.length} service(s) pushed to Google.` });
      }

      // ── description ───────────────────────────────────────────────────────
      if (field === "description") {
        const text = (descText ?? "").toString().trim();
        if (!text) return res.status(400).json({ message: "description text is required." });
        await updateListingFields(locationName, { profile: { description: text } }, (apiManager as any).oauth2Client);
        return res.json({ success: true, message: "Business description pushed to Google." });
      }

      return res.status(400).json({ message: `Unknown field: ${field}` });
    } catch (error: any) {
      const msg    = error?.message ?? String(error);
      const status = (error?.status && typeof error.status === "number") ? error.status : 500;
      console.error(`[GBP Fill Gap field=${field}] error:`, error);
      return res.status(status).json({ message: msg });
    }
  });

  /**
   * POST /api/google-business/generate-description
   * Body: { storeId: number }
   *
   * Uses AI (gpt-4o-mini) to draft a ~150-word Google Business Profile description.
   * The owner reviews and edits before pushing — this endpoint never writes to Google.
   */
  app.post("/api/google-business/generate-description", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const storeId = Number(req.body.storeId);
    if (!storeId) return res.status(400).json({ message: "storeId required" });

    const ownedStore = await storage.getStore(storeId);
    if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    try {
      const [storeRows, serviceRows] = await Promise.all([
        db.select({ name: locations.name })
          .from(locations).where(eq(locations.id, storeId)).limit(1),
        db.select({ name: services.name })
          .from(services).where(eq(services.storeId, storeId)).limit(12),
      ]);

      const storeName   = storeRows[0]?.name ?? "our salon";
      const serviceList = serviceRows.map(s => s.name).join(", ");

      const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      if (!apiKey) return res.status(503).json({ message: "AI features not configured on this server." });

      const { default: OpenAI } = await import("openai");
      const openai = new OpenAI({
        apiKey,
        ...(process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
          ? { baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL } : {}),
      });

      const prompt = [
        `Write a professional, warm Google Business Profile description for a beauty salon called "${storeName}".`,
        serviceList ? `They offer: ${serviceList}.` : "",
        ``,
        `Requirements:`,
        `- Approximately 150 words`,
        `- Friendly and inviting tone; speaks to potential customers`,
        `- Mentions the salon name at least once`,
        `- Highlights quality of service and the customer experience`,
        `- Does NOT include hours, address, phone, or contact info`,
        `- No hashtags, bullet points, or markdown`,
        `- No clichés like "Look no further" or "We've got you covered"`,
        ``,
        `Return only the description text. No quotes, no labels, no extra commentary.`,
      ].filter(Boolean).join("\n");

      const completion = await openai.chat.completions.create({
        model:       "gpt-4o-mini",
        messages:    [{ role: "user", content: prompt }],
        max_tokens:  320,
        temperature: 0.7,
      });

      const description = completion.choices[0]?.message?.content?.trim() ?? "";
      return res.json({ description });
    } catch (error: any) {
      const msg = error?.message ?? String(error);
      console.error("[GBP Generate Description] error:", error);
      return res.status(500).json({ message: msg });
    }
  });

  /**
   * GET /api/google-business/search
   * Query: { name, address?, phone? }
   *
   * Searches Google Places for a business matching the given name/address.
   * Used in the pre-OAuth "Find your salon on Google" onboarding flow.
   * Returns empty results gracefully when GOOGLE_MAPS_API_KEY is not set.
   */
  app.get("/api/google-business/search", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { name, address } = req.query as Record<string, string>;
    if (!name?.trim()) return res.status(400).json({ message: "name is required" });

    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      // No Places API key configured — return empty results so the UI falls through gracefully
      console.warn("[GBP Search] GOOGLE_PLACES_API_KEY not set — returning empty results");
      return res.json({ results: [] });
    }

    try {
      const query  = [name.trim(), address?.trim()].filter(Boolean).join(" ");
      const url    = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&type=beauty_salon|hair_care|spa|nail_salon&key=${apiKey}`;
      const resp   = await fetch(url);
      const data   = await resp.json() as any;

      const results = (data.results ?? []).slice(0, 5).map((r: any) => ({
        placeId:     r.place_id,
        name:        r.name,
        address:     r.formatted_address,
        rating:      r.rating,
        reviewCount: r.user_ratings_total,
        photoUrl: r.photos?.[0]?.photo_reference
          ? `/api/google-business/place-photo?reference=${encodeURIComponent(r.photos[0].photo_reference)}`
          : undefined,
      }));

      return res.json({ results });
    } catch (error: any) {
      console.error("[GBP Search] Places API error:", error.message);
      return res.json({ results: [] }); // graceful fallback
    }
  });

  app.get("/api/google-business/place-photo", async (req, res) => {
    const reference = typeof req.query.reference === "string" ? req.query.reference : "";
    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
    if (!reference || !apiKey) return res.status(404).end();
    const photo = await fetch(`https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${encodeURIComponent(reference)}&key=${apiKey}`, { redirect: "manual" });
    const location = photo.headers.get("location");
    if (!location) return res.status(404).end();
    return res.redirect(location);
  });

  /**
   * GET /api/google-business/address-lookup
   * Query: { address }
   *
   * Searches Google Places for any business at the given address (no type filter).
   * Used in conversational onboarding to auto-detect the business name from address.
   * Returns empty results gracefully when GOOGLE_MAPS_API_KEY is not set.
   */
  app.get("/api/google-business/address-lookup", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { address, businessType, businessName } = req.query as Record<string, string>;
    if (!address?.trim()) return res.status(400).json({ message: "address is required" });

    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.warn("[Address Lookup] GOOGLE_PLACES_API_KEY not set — returning empty results");
      return res.json({ results: [] });
    }

    try {
      // When a business name is provided (from the new salon-name-first flow), use it as the
      // primary search term for the most targeted match: "Bella Nails 123 Main St, City, ST 12345"
      // Fall back to business type prefix if no name is available.
      let query: string;
      if (businessName?.trim()) {
        query = `${businessName.trim()} ${address.trim()}`;
      } else if (businessType?.trim()) {
        query = `${businessType.trim()} ${address.trim()}`;
      } else {
        query = address.trim();
      }
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;
      const resp = await fetch(url);
      const data = await resp.json() as any;

      const results = (data.results ?? []).slice(0, 5).map((r: any) => ({
        placeId:  r.place_id,
        name:     r.name,
        address:  r.formatted_address,
        rating:   r.rating,
      }));

      return res.json({ results });
    } catch (error: any) {
      console.error("[Address Lookup] Places API error:", error.message);
      return res.json({ results: [] });
    }
  });

  /**
   * GET /api/google-business/place-details
   * Query: { placeId }
   *
   * Fetches full Place Details (phone, website, opening hours) for a place
   * the user selected in the "Find your salon on Google" onboarding step.
   * The Places Text Search call used to populate the search list only returns
   * name/address/rating — phone, website, and hours require a separate
   * Place Details call with an explicit `fields` mask.
   * Returns nulls gracefully when GOOGLE_MAPS_API_KEY is not set.
   */
  app.get("/api/google-business/place-details", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { placeId } = req.query as Record<string, string>;
    if (!placeId?.trim()) return res.status(400).json({ message: "placeId is required" });

    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.warn("[GBP Place Details] GOOGLE_PLACES_API_KEY not set — returning empty details");
      return res.json({ phone: null, website: null, openingHours: null });
    }

    try {
      const fields = [
        "formatted_phone_number",
        "international_phone_number",
        "website",
        "opening_hours",
        "formatted_address",
        "geometry",
        "utc_offset",
        "photos",
      ].join(",");
      const url  = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${apiKey}`;
      const resp = await fetch(url);
      const data = await resp.json() as any;

      if (data.status && data.status !== "OK") {
        console.warn("[GBP Place Details] Places API status:", data.status, data.error_message ?? "");
        return res.json({ phone: null, website: null, openingHours: null });
      }

      const result = data.result ?? {};

      // Build cover photo URL if a photo reference is available
      const photoRef = result.photos?.[0]?.photo_reference;
      const coverPhotoUrl = photoRef
        ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${encodeURIComponent(photoRef)}&key=${apiKey}`
        : null;

      return res.json({
        phone:         result.formatted_phone_number ?? result.international_phone_number ?? null,
        website:       result.website ?? null,
        address:       result.formatted_address ?? null,
        openingHours:  result.opening_hours?.periods ?? null,
        latitude:      result.geometry?.location?.lat?.toString() ?? null,
        longitude:     result.geometry?.location?.lng?.toString() ?? null,
        utcOffset:     result.utc_offset ?? null,   // minutes from UTC (e.g. -420 for MST)
        coverPhotoUrl,
      });
    } catch (error: any) {
      console.error("[GBP Place Details] Places API error:", error.message);
      return res.json({ phone: null, website: null, openingHours: null }); // graceful fallback
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GBP OPTIMIZATION ENGINE — Phase 1
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET /api/google-business/optimization-logs?storeId=X&limit=50&offset=0
   *
   * Returns the optimization log history for a connected store.
   * Useful for owners and admins to review what the engine has done automatically.
   */
  app.get("/api/google-business/optimization-logs", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const storeId = Number(req.query.storeId);
    if (!storeId) return res.status(400).json({ message: "storeId required" });

    const ownedStore = await storage.getStore(storeId);
    if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    const limit  = Math.min(Number(req.query.limit  ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);
    const action = req.query.action as string | undefined;
    const status = req.query.status as string | undefined;

    try {
      const conditions = [eq(gbpOptimizationLogs.storeId, storeId)];
      if (action) conditions.push(eq(gbpOptimizationLogs.action, action));
      if (status) conditions.push(eq(gbpOptimizationLogs.status, status));

      const rows = await db
        .select()
        .from(gbpOptimizationLogs)
        .where(and(...conditions))
        .orderBy(desc(gbpOptimizationLogs.createdAt))
        .limit(limit)
        .offset(offset);

      const [{ total }] = await db
        .select({ total: count() })
        .from(gbpOptimizationLogs)
        .where(and(...conditions));

      return res.json({ logs: rows, total, limit, offset });
    } catch (error: any) {
      console.error("[GBP Optimization Logs] error:", error);
      return res.status(500).json({ message: error?.message ?? String(error) });
    }
  });

  /**
   * POST /api/google-business/run-optimization
   * Body: { storeId: number }
   *
   * Manually triggers the GBP optimization worker for a single store.
   * Runs synchronously and returns the result (actions performed, errors).
   * The same logic used by the daily scheduler — owner can trigger on demand.
   */
  app.post("/api/google-business/run-optimization", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const storeId = Number(req.body.storeId);
    if (!storeId) return res.status(400).json({ message: "storeId required" });

    const ownedStore = await storage.getStore(storeId);
    if (!ownedStore || ownedStore.userId !== userId) return res.status(403).json({ message: "Forbidden" });

    try {
      const { runGBPOptimizationForStore } = await import("./services/gbpOptimizationWorker");
      const result = await runGBPOptimizationForStore(storeId, "manual");
      return res.json({
        success: true,
        storeId,
        actionsPerformed: result.actionsPerformed,
        errors:           result.errors,
        message: result.actionsPerformed.length > 0
          ? `Optimization complete: ${result.actionsPerformed.join(", ")}.`
          : "No changes needed — Google profile already up to date.",
      });
    } catch (error: any) {
      const msg = error?.message ?? String(error);
      console.error("[GBP Run Optimization] error:", error);
      return res.status(500).json({ message: msg });
    }
  });

  // === YELP ALIAS ===

  app.put("/api/stores/:storeId/facebook-page", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const storeId = Number(req.params.storeId);
    const { facebookPageId } = req.body;
    if (typeof facebookPageId !== "string") return res.status(400).json({ message: "facebookPageId required" });
    const [updated] = await db
      .update(locations)
      .set({ facebookPageId: facebookPageId.trim() || null })
      .where(and(eq(locations.id, storeId), eq(locations.userId, userId)))
      .returning();
    if (!updated) return res.status(404).json({ message: "Store not found" });
    return res.json({ success: true, facebookPageId: updated.facebookPageId });
  });

  app.put("/api/stores/:storeId/yelp-alias", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const storeId = Number(req.params.storeId);
    const { yelpAlias } = req.body;
    if (typeof yelpAlias !== "string") return res.status(400).json({ message: "yelpAlias required" });
    const [updated] = await db
      .update(locations)
      .set({ yelpAlias: yelpAlias.trim() || null })
      .where(and(eq(locations.id, storeId), eq(locations.userId, userId)))
      .returning();
    if (!updated) return res.status(404).json({ message: "Store not found" });
    return res.json({ success: true, yelpAlias: updated.yelpAlias });
  });

  // === ADMIN TRIAL MANAGEMENT ===
  
  /**
   * Admin: Get user trial status
   */
  const requireAdmin = async (req: any, res: any): Promise<boolean> => {
    const adminUserId = (req.session as any)?.userId;
    if (!adminUserId) { res.status(401).json({ message: "Unauthorized" }); return false; }
    const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, adminUserId));
    if (user?.role !== "admin") { res.status(403).json({ message: "Admin access required" }); return false; }
    return true;
  };

  app.get("/api/admin/users/:userId/trial-status", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const userId = req.params.userId;
    
    try {
      const trialStatus = await TrialService.getTrialStatus(userId);
      return res.json(trialStatus);
    } catch (error) {
      console.error("Error fetching user trial status:", error);
      return res.status(500).json({ message: "Failed to fetch trial status" });
    }
  });

  /**
   * Admin: Extend user trial
   */
  app.post("/api/admin/users/:userId/extend-trial", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const userId = req.params.userId;
    const { additionalDays } = req.body;
    
    if (!additionalDays || additionalDays <= 0) {
      return res.status(400).json({ message: "Additional days must be greater than 0" });
    }
    
    try {
      await TrialService.extendTrial(userId, additionalDays);
      const trialStatus = await TrialService.getTrialStatus(userId);
      return res.json({ message: "Trial extended successfully", trialStatus });
    } catch (error) {
      console.error("Error extending trial:", error);
      return res.status(500).json({ message: "Failed to extend trial" });
    }
  });

  /**
   * Admin: Bulk extend trials for multiple users
   */
  app.post("/api/admin/extend-trials-bulk", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const { userIds, additionalDays } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: "userIds must be a non-empty array" });
    }
    if (!additionalDays || additionalDays <= 0) {
      return res.status(400).json({ message: "additionalDays must be > 0" });
    }

    const results: { userId: string; success: boolean; error?: string }[] = [];
    for (const userId of userIds) {
      try {
        await TrialService.extendTrial(String(userId), Number(additionalDays));
        results.push({ userId, success: true });
      } catch (err: any) {
        results.push({ userId, success: false, error: err?.message ?? "Unknown error" });
      }
    }

    const failed = results.filter(r => !r.success);
    return res.json({
      message: `Extended trial for ${results.length - failed.length} of ${results.length} account(s).`,
      results,
    });
  });

  /**
   * Admin: Reset user trial
   */
  app.post("/api/admin/users/:userId/reset-trial", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const userId = req.params.userId;
    
    try {
      await TrialService.resetTrial(userId);
      const trialStatus = await TrialService.getTrialStatus(userId);
      return res.json({ message: "Trial reset successfully", trialStatus });
    } catch (error) {
      console.error("Error resetting trial:", error);
      return res.status(500).json({ message: "Failed to reset trial" });
    }
  });

  /**
   * Admin: Activate user subscription
   */
  app.post("/api/admin/users/:userId/activate-subscription", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const userId = req.params.userId;
    
    try {
      await TrialService.activateSubscription(userId);
      const trialStatus = await TrialService.getTrialStatus(userId);
      return res.json({ message: "Subscription activated successfully", trialStatus });
    } catch (error) {
      console.error("Error activating subscription:", error);
      return res.status(500).json({ message: "Failed to activate subscription" });
    }
  });

  /**
   * Admin: Cancel user subscription
   */
  app.post("/api/admin/users/:userId/cancel-subscription", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const userId = req.params.userId;
    
    try {
      await TrialService.cancelSubscription(userId);
      const trialStatus = await TrialService.getTrialStatus(userId);
      return res.json({ message: "Subscription cancelled successfully", trialStatus });
    } catch (error) {
      console.error("Error cancelling subscription:", error);
      return res.status(500).json({ message: "Failed to cancel subscription" });
    }
  });

  // POST set password for a store's owner user (admin action)
  app.post("/api/admin/stores/:storeNumber/set-password", async (req, res) => {
    try {
      const id = parseInt(req.params.storeNumber);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid store ID" });
      const { password } = req.body;
      if (!password || typeof password !== "string" || password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      const [store] = await db.select({ userId: locations.userId }).from(locations).where(eq(locations.id, id)).limit(1);
      if (!store?.userId) return res.status(404).json({ message: "Store or owner not found" });
      const hashed = await bcrypt.hash(password, 10);
      await db.update(users).set({ password: hashed }).where(eq(users.id, store.userId));
      return res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Admin set-password error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  /**
   * Admin Dashboard Stats API
   */

  // GET dashboard statistics
  // ── DB Health check endpoint ─────────────────────────────────────────────
  app.get("/api/admin/db-health", async (req, res) => {
    const userId = (req.session as any)?.userId;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // Tables and the columns we care about verifying
    const CHECKS: { table: string; columns: string[] }[] = [
      { table: "locations",           columns: ["sms_allowance", "sms_credits", "weekly_digest_opt_out", "pos_enabled"] },
      { table: "users",               columns: ["role", "staff_id", "trial_started_at", "trial_ends_at", "subscription_status", "permissions", "password_changed"] },
      { table: "staff",               columns: ["permissions", "status", "employment_type", "invite_token", "password_changed"] },
      { table: "services",            columns: ["deposit_required", "deposit_amount", "category_id"] },
      { table: "appointments",        columns: ["deposit_required", "deposit_amount", "deposit_paid", "gift_card_id", "loyalty_points_earned", "loyalty_points_redeemed", "recurrence_rule", "started_at", "completed_at", "tip_amount", "cancellation_reason"] },
      { table: "mail_settings",       columns: ["store_id", "mailgun_api_key", "booking_confirmation_enabled"] },
      { table: "sms_settings",        columns: ["store_id", "booking_confirmation_enabled", "reminder_enabled"] },
      { table: "sms_log",             columns: ["store_id", "phone", "status", "sms_source"] },
      { table: "google_business_profiles", columns: ["store_id", "is_connected", "location_address"] },
      { table: "google_business_accounts", columns: ["store_id", "user_id", "google_account_id"] },
      { table: "google_business_locations", columns: ["store_id", "user_id", "location_resource_name", "is_selected"] },
      { table: "google_business_sync_logs", columns: ["store_id", "sync_type", "status"] },
      { table: "google_reviews",      columns: ["store_id", "google_review_id", "rating", "gb_location_id"] },
      { table: "schema_migrations",   columns: ["filename", "applied_at"] },
      { table: "sessions",            columns: ["sid", "sess", "expire"] },
      { table: "calendar_settings",   columns: ["store_id", "auto_mark_no_shows"] },
      { table: "cash_drawer_sessions",columns: ["store_id", "status", "opening_balance"] },
        { table: "gift_cards",          columns: ["store_id", "code", "is_active"] },
        { table: "client_intelligence", columns: ["store_id", "customer_id", "churn_risk_score", "is_drifting", "is_at_risk"] },
      { table: "staff_intelligence",  columns: ["store_id", "staff_id", "rebooking_rate_pct", "trend"] },
      { table: "intelligence_interventions", columns: ["store_id", "customer_id", "intervention_type", "sent_at"] },
      { table: "growth_score_snapshots",  columns: ["store_id", "overall_score", "snapshot_date"] },
      { table: "dead_seat_patterns",      columns: ["store_id", "day_of_week", "hour_start"] },
      { table: "campaigns",           columns: ["store_id", "name", "status", "channel"] },
      { table: "api_keys",            columns: ["store_id", "key_hash", "is_active"] },
      { table: "sms_conversations",   columns: ["store_id", "client_phone", "direction"] },
      { table: "google_review_responses", columns: ["google_review_id", "store_id", "response_text"] },
      { table: "pro_crews",           columns: ["store_id", "name", "active"] },
      { table: "pro_service_orders",  columns: ["store_id", "order_number", "status"] },
      { table: "clients",             columns: ["store_id", "full_name", "client_status"] },
      { table: "client_tags",         columns: ["store_id", "tag_name"] },
      { table: "waitlist",            columns: ["store_id", "status"] },
      { table: "reviews",             columns: ["store_id", "rating"] },
    ];

    try {
      const client = await pool.connect();
      try {
        const results = await Promise.all(CHECKS.map(async ({ table, columns }) => {
          // Check table existence
          const tableRes = await client.query<{ exists: boolean }>(
            `SELECT EXISTS (
              SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = $1
            ) AS exists`,
            [table]
          );
          const tableExists = tableRes.rows[0].exists;

          // Check each column
          const colChecks = await Promise.all(columns.map(async (col) => {
            if (!tableExists) return { column: col, exists: false };
            const colRes = await client.query<{ exists: boolean }>(
              `SELECT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
              ) AS exists`,
              [table, col]
            );
            return { column: col, exists: colRes.rows[0].exists };
          }));

          // Row count (only for existing tables)
          let rowCount: number | null = null;
          if (tableExists) {
            try {
              const countRes = await client.query<{ count: string }>(`SELECT COUNT(*)::int AS count FROM "${table}"`);
              rowCount = Number(countRes.rows[0].count);
            } catch { /* ignore */ }
          }

          return { table, exists: tableExists, columns: colChecks, rowCount };
        }));

        const missing      = results.filter(t => !t.exists).length;
        const missingCols  = results.reduce((n, t) => n + t.columns.filter(c => !c.exists).length, 0);

        return res.json({
          checkedAt: new Date().toISOString(),
          tables: results,
          summary: { total: results.length, ok: results.filter(t => t.exists).length, missing, missingColumns: missingCols },
        });
      } finally {
        client.release();
      }
    } catch (err: any) {
      return res.status(500).json({ message: err.message });
    }
  });

  // ── Rate-limit admin endpoints ───────────────────────────────────────────
  app.get("/api/admin/rate-limits", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    return res.json(getRateLimitSnapshot());
  });

  app.delete("/api/admin/rate-limits/clear-all", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    clearAllRateLimits();
    console.log(`[Admin] All rate-limit counters cleared by userId=${(req.session as any)?.userId}`);
    return res.json({ ok: true });
  });

  app.delete("/api/admin/rate-limits/clear-all/:category", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const category = req.params.category as RateLimitCategory;
    clearAllRateLimits(category);
    console.log(`[Admin] Rate-limit counters cleared for category=${category} by userId=${(req.session as any)?.userId}`);
    return res.json({ ok: true });
  });

  app.delete("/api/admin/rate-limits/:category/:key", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const { category, key } = req.params;
    const removed = clearRateLimitEntry(category as RateLimitCategory, key);
    console.log(`[Admin] Rate-limit entry ${category}/${key} ${removed ? "cleared" : "not found"} by userId=${(req.session as any)?.userId}`);
    return res.json({ ok: true, removed });
  });

  app.get("/api/admin/dashboard/stats", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      // Get total stores count using raw SQL via pool
      const totalStoresResult = await pool.query(`SELECT COUNT(*)::int as count FROM locations`);
      const totalStoresCount = Number(totalStoresResult.rows[0]?.count || 0);
      
      // Get total users count using raw SQL via pool
      const totalUsersResult = await pool.query(`SELECT COUNT(*)::int as count FROM users`);
      const totalUsersCount = Number(totalUsersResult.rows[0]?.count || 0);
      
      // Get total appointments using raw SQL via pool
      const totalAppointmentsResult = await pool.query(`SELECT COUNT(*)::int as count FROM appointments`);
      const totalAppointmentsCount = Number(totalAppointmentsResult.rows[0]?.count || 0);

      // Get trial user count using raw SQL via pool
      const trialUsersResult = await pool.query(`SELECT COUNT(*)::int as count FROM users WHERE subscription_status = 'trial'`);
      const trialUsersCount = Number(trialUsersResult.rows[0]?.count || 0);

      // Stripe is not yet implemented — subscriptions and MRR are always 0
      const stats = {
        totalAccounts: totalStoresCount,
        newAccountsThisMonth: 0,
        newAccountsLastMonth: 0,
        totalSubscriptions: 0,   // No Stripe subscriptions yet
        activeSubscriptions: 0,  // No Stripe subscriptions yet
        mrr: 0,                  // No Stripe subscriptions yet
        mrrGrowth: 0,
        newSubsThisMonth: 0,
        newSubsLastMonth: 0,
        totalUsers: totalUsersCount,
        newUsersThisMonth: 0,
        newUsersLastMonth: 0,
        totalAppointments: totalAppointmentsCount,
        appointmentsThisMonth: 0,
        trialUsers: trialUsersCount
      };

      return res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      return res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  /**
   * Platform Settings API
   */

  // GET platform settings
  app.get("/api/admin/platform-settings", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      // Use TrialService as the single source of truth for the trial-days value
      // so the admin UI, signup flow (setupTrialForUser), and the "53 days left"
      // banner on the owner side all agree on the same number.
      const trialPeriodDays = await TrialService.getFreeTrialDays();

      // Get settings from environment variables
      const settings = {
        trialPeriodDays,
        mailgun: {
          apiKey: process.env.MAILGUN_API_KEY || '',
          domain: process.env.MAILGUN_DOMAIN || '',
          fromEmail: process.env.MAILGUN_FROM_EMAIL || 'noreply@yourdomain.com',
          fromName: process.env.MAILGUN_FROM_NAME || 'Booking Platform',
          enabled: !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN)
        },
        twilio: {
          accountSid: process.env.TWILIO_ACCOUNT_SID || '',
          authToken: process.env.TWILIO_AUTH_TOKEN || '',
          phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
          enabled: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER)
        }
      };
      
      return res.json(settings);
    } catch (error) {
      console.error("Error fetching platform settings:", error);
      return res.status(500).json({ message: "Failed to fetch platform settings" });
    }
  });

  // PUT platform settings
  app.put("/api/admin/platform-settings", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const { trialPeriodDays, mailgun, twilio } = req.body;
      
      // Validate input
      const platformSettingsSchema = z.object({
        trialPeriodDays: z.number().min(1).max(365),
        mailgun: z.object({
          apiKey: z.string().optional(),
          domain: z.string().optional(),
          fromEmail: z.string().email().optional(),
          fromName: z.string().optional(),
          enabled: z.boolean()
        }),
        twilio: z.object({
          accountSid: z.string().optional(),
          authToken: z.string().optional(),
          phoneNumber: z.string().optional(),
          enabled: z.boolean()
        })
      });

      const validatedData = platformSettingsSchema.parse({ trialPeriodDays, mailgun, twilio });
      
      // Update environment variables in memory
      process.env.TRIAL_PERIOD_DAYS = validatedData.trialPeriodDays.toString();
      process.env.MAILGUN_API_KEY = validatedData.mailgun.apiKey || '';
      process.env.MAILGUN_DOMAIN = validatedData.mailgun.domain || '';
      process.env.MAILGUN_FROM_EMAIL = validatedData.mailgun.fromEmail || 'noreply@yourdomain.com';
      process.env.MAILGUN_FROM_NAME = validatedData.mailgun.fromName || 'Booking Platform';
      process.env.TWILIO_ACCOUNT_SID = validatedData.twilio.accountSid || '';
      process.env.TWILIO_AUTH_TOKEN = validatedData.twilio.authToken || '';
      process.env.TWILIO_PHONE_NUMBER = validatedData.twilio.phoneNumber || '';
      
      // Update .env file
      const fs = require('fs');
      const path = require('path');
      const envPath = path.join(process.cwd(), '.env');
      
      let envContent = '';
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
      }
      
      // Update or add each setting
      const updates = [
        `TRIAL_PERIOD_DAYS=${validatedData.trialPeriodDays}`,
        `MAILGUN_API_KEY=${validatedData.mailgun.apiKey || ''}`,
        `MAILGUN_DOMAIN=${validatedData.mailgun.domain || ''}`,
        `MAILGUN_FROM_EMAIL=${validatedData.mailgun.fromEmail || 'noreply@yourdomain.com'}`,
        `MAILGUN_FROM_NAME=${validatedData.mailgun.fromName || 'Booking Platform'}`,
        `TWILIO_ACCOUNT_SID=${validatedData.twilio.accountSid || ''}`,
        `TWILIO_AUTH_TOKEN=${validatedData.twilio.authToken || ''}`,
        `TWILIO_PHONE_NUMBER=${validatedData.twilio.phoneNumber || ''}`
      ];
      
      updates.forEach(update => {
        const [key] = update.split('=');
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (envContent.match(regex)) {
          envContent = envContent.replace(regex, update);
        } else {
          envContent += `\n${update}`;
        }
      });
      
      fs.writeFileSync(envPath, envContent);
      
      console.log("Platform settings saved to .env file");
      
      return res.json({ message: "Platform settings updated successfully", settings: validatedData });
    } catch (error) {
      console.error("Error updating platform settings:", error);
      return res.status(500).json({ message: "Failed to update platform settings" });
    }
  });

  // ── Staff self-service profile endpoints (staff session required) ────────────
  // Helper: resolve staffId from session
  function resolveSessionStaff(req: Request, res: Response): number | null {
    const sid = (req.session as any)?.staffId;
    if (!sid) { res.status(401).json({ message: "Unauthorized" }); return null; }
    return Number(sid);
  }

  function parseRouteId(value: string | string[] | undefined): number {
    const raw = Array.isArray(value) ? value[0] : value;
    return Number(raw);
  }

  // GET /api/staff/me/profile
  app.get("/api/staff/me/profile", isAuthenticated, async (req, res) => {
    try {
      const staffId = resolveSessionStaff(req, res);
      if (!staffId) return;
      const member = await storage.getStaffMember(staffId);
      if (!member) return res.status(404).json({ message: "Staff not found" });
      return res.json(member);
    } catch (err) {
      console.error("[staff/me] GET profile error:", err);
      return res.status(500).json({ message: "Failed to load profile" });
    }
  });

  // PUT /api/staff/me/profile — update name / email / phone
  app.put("/api/staff/me/profile", isAuthenticated, async (req, res) => {
    try {
      const staffId = resolveSessionStaff(req, res);
      if (!staffId) return;
      const { name, email, phone } = req.body;
      const updates: Partial<any> = {};
      if (name  !== undefined) updates.name  = String(name).trim();
      if (email !== undefined) updates.email = email ? String(email).trim().toLowerCase() : null;
      if (phone !== undefined) {
        if (phone) {
          const e164 = toE164US(String(phone));
          if (!e164) return res.status(400).json({ message: "Invalid phone number. Please enter a valid 10-digit US number." });
          updates.phone = e164;
        } else {
          updates.phone = null;
        }
      }
      const updated = await storage.updateStaff(staffId, updates);
      if (!updated) return res.status(404).json({ message: "Staff not found" });
      return res.json(updated);
    } catch (err) {
      console.error("[staff/me] PUT profile error:", err);
      return res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // GET /api/staff/me/pin — check if a timeclock PIN is set
  app.get("/api/staff/me/pin", isAuthenticated, async (req, res) => {
    try {
      const staffId = resolveSessionStaff(req, res);
      if (!staffId) return;
      const member = await storage.getStaffMember(staffId);
      if (!member?.storeId) return res.status(404).json({ message: "Staff not found" });
      const [record] = await db
        .select({ hasPin: staffPins.pin })
        .from(staffPins)
        .where(and(eq(staffPins.staffId, staffId), eq(staffPins.storeId, member.storeId as number)))
        .limit(1);
      return res.json({ hasPin: !!record });
    } catch (err) {
      console.error("[staff/me] GET pin error:", err);
      return res.status(500).json({ message: "Failed to check PIN" });
    }
  });

  // PUT /api/staff/me/pin — set or update timeclock PIN
  app.put("/api/staff/me/pin", isAuthenticated, async (req, res) => {
    try {
      const staffId = resolveSessionStaff(req, res);
      if (!staffId) return;
      const { pin } = req.body;
      if (!pin || !/^\d{4}$/.test(String(pin)))
        return res.status(400).json({ message: "PIN must be exactly 4 numeric digits" });
      const member = await storage.getStaffMember(staffId);
      if (!member?.storeId) return res.status(404).json({ message: "Staff not found" });
      const storeId = member.storeId as number;
      // Conflict check — PIN already used by another staff member
      const [conflict] = await db
        .select({ staffId: staffPins.staffId })
        .from(staffPins)
        .where(and(eq(staffPins.storeId, storeId), eq(staffPins.pin, String(pin))))
        .limit(1);
      if (conflict && conflict.staffId !== staffId)
        return res.status(409).json({ message: "This PIN is already used by another staff member" });
      await db
        .insert(staffPins)
        .values({ staffId, storeId, pin: String(pin), updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [staffPins.staffId, staffPins.storeId],
          set: { pin: String(pin), updatedAt: new Date() },
        });
      return res.json({ success: true });
    } catch (err) {
      console.error("[staff/me] PUT pin error:", err);
      return res.status(500).json({ message: "Failed to update PIN" });
    }
  });

  // GET /api/staff/me/commission-structure — staff's own commission rates
  app.get("/api/staff/me/commission-structure", isAuthenticated, async (req, res) => {
    try {
      const staffId = resolveSessionStaff(req, res);
      if (!staffId) return;
      const member = await storage.getStaffMember(staffId);
      if (!member) return res.status(404).json({ message: "Staff not found" });
      const rate = Number((member as any).commissionRate ?? 0);
      return res.json({
        name:            member.name,
        commissionRate:  rate,
        serviceStaff:    rate,
        serviceSalon:    100 - rate,
        productStaff:    0,
        productSalon:    100,
        giftCardStaff:   0,
        giftCardSalon:   100,
        cashCheckStaff:  rate,
        cashCheckSalon:  100 - rate,
        cardTipChargePercent: 0,
      });
    } catch (err) {
      console.error("[staff/me] GET commission-structure error:", err);
      return res.status(500).json({ message: "Failed to load commission structure" });
    }
  });

  // GET /api/staff/me/pay-summary — commission structure + deductions + payout history
  app.get("/api/staff/me/pay-summary", isAuthenticated, async (req, res) => {
    try {
      const staffId = resolveSessionStaff(req, res);
      if (!staffId) return;
      const member = await storage.getStaffMember(staffId);
      if (!member) return res.status(404).json({ message: "Staff not found" });

      const storeId = (member as any).storeId as number | undefined;

      // ── Commission structure ──────────────────────────────────────────────
      let commissionStructure = null;
      const csId = (member as any).commissionStructureId as number | null | undefined;
      if (csId) {
        const [cs] = await db.select().from(commissionStructures).where(eq(commissionStructures.id, csId));
        if (cs) {
          commissionStructure = {
            type: "named" as const,
            name: cs.name,
            description: cs.description,
            employeePercent: Number(cs.employeePercent),
            housePercent: Number(cs.housePercent),
            appliesTo: cs.appliesTo,
          };
        }
      }
      // Fallback to flat commission rate
      if (!commissionStructure) {
        const rate = Number((member as any).commissionRate ?? 0);
        if (rate > 0) {
          commissionStructure = {
            type: "flat" as const,
            employeePercent: rate,
            housePercent: 100 - rate,
          };
        }
      }

      // ── Find linked contractor record ────────────────────────────────────
      let contractorId: number | null = null;
      if (storeId) {
        const [c] = await db
          .select({ id: contractors.id })
          .from(contractors)
          .where(and(eq(contractors.staffId, staffId), eq(contractors.storeId, storeId)))
          .limit(1);
        if (c) contractorId = c.id;
      }

      // ── Deduction rules ──────────────────────────────────────────────────
      let deductions: any[] = [];
      if (storeId) {
        const allRules = await db
          .select()
          .from(payoutDeductionRules)
          .where(and(eq(payoutDeductionRules.storeId, storeId), eq(payoutDeductionRules.isActive, true)));
        deductions = allRules.filter(
          r => r.appliesTo === "all" || (r.contractorId !== null && r.contractorId === contractorId)
        );
      }

      // ── Payout run items ─────────────────────────────────────────────────
      let pendingPaycheck = null;
      let payHistory: any[] = [];

      if (contractorId) {
        const items = await db
          .select({
            id: payoutRunItems.id,
            runId: payoutRunItems.payoutRunId,
            periodStart: payoutRuns.periodStart,
            periodEnd: payoutRuns.periodEnd,
            runStatus: payoutRuns.status,
            serviceRevenue: payoutRunItems.serviceRevenue,
            tips: payoutRunItems.tips,
            grossAmount: payoutRunItems.grossAmount,
            totalDeductions: payoutRunItems.totalDeductions,
            netAmount: payoutRunItems.netAmount,
            status: payoutRunItems.status,
            paidAt: payoutRunItems.paidAt,
            deductions: payoutRunItems.deductions,
          })
          .from(payoutRunItems)
          .leftJoin(payoutRuns, eq(payoutRunItems.payoutRunId, payoutRuns.id))
          .where(eq(payoutRunItems.contractorId, contractorId))
          .orderBy(desc(payoutRuns.createdAt))
          .limit(20);

        const pending = items.find(
          i => ["pending", "processing", "draft"].includes(i.runStatus ?? "")
        );
        if (pending) pendingPaycheck = pending;

        payHistory = items
          .filter(i => ["completed", "paid"].includes(i.status))
          .slice(0, 10);
      }

      return res.json({
        staffName: (member as any).name ?? "",
        commissionStructure,
        deductions: deductions.map(d => ({
          id: d.id,
          name: d.name,
          type: d.type,
          amount: d.amount,
          appliesTo: d.appliesTo,
        })),
        pendingPaycheck,
        payHistory,
      });
    } catch (err) {
      console.error("[staff/me] GET pay-summary error:", err);
      return res.status(500).json({ message: "Failed to load pay summary" });
    }
  });

  // ── Pay-period helper ─────────────────────────────────────────────────────
  function computeCurrentPayPeriod(
    today: Date,
    settings: { frequency: string; weekStartDay: number; monthStartDay: number; semiMonthlyDay1: number; semiMonthlyDay2: number },
  ): { periodStart: string; periodEnd: string; label: string } {
    const y = today.getFullYear();
    const m = today.getMonth();      // 0-indexed
    const d = today.getDate();
    const dow = today.getDay();      // 0=Sun

    const iso = (dt: Date) => {
      const yy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const dd = String(dt.getDate()).padStart(2, "0");
      return `${yy}-${mm}-${dd}`;
    };

    let periodStart: Date;
    let periodEnd: Date;
    let label: string;

    switch (settings.frequency) {
      case "weekly": {
        const diff = (dow - settings.weekStartDay + 7) % 7;
        periodStart = new Date(y, m, d - diff);
        periodEnd   = new Date(y, m, d - diff + 6);
        label = "Weekly Pay Period";
        break;
      }
      case "biweekly": {
        // Anchor: Jan 5 2020 (Sun). Shift by weekStartDay so period starts on the right DOW.
        const anchor = new Date(2020, 0, 5 + settings.weekStartDay);
        const MS_DAY = 86_400_000;
        const daysSince = Math.floor((today.getTime() - anchor.getTime()) / MS_DAY);
        const periodIdx  = Math.floor(daysSince / 14);
        periodStart = new Date(anchor.getTime() + periodIdx * 14 * MS_DAY);
        periodEnd   = new Date(periodStart.getTime() + 13 * MS_DAY);
        label = "Biweekly Pay Period";
        break;
      }
      case "semimonthly": {
        const d1 = settings.semiMonthlyDay1;
        const d2 = settings.semiMonthlyDay2;
        if (d >= d2) {
          periodStart = new Date(y, m, d2);
          periodEnd   = new Date(y, m + 1, 0); // last day of month
        } else {
          periodStart = new Date(y, m, d1);
          periodEnd   = new Date(y, m, d2 - 1);
        }
        label = "Semi-Monthly Pay Period";
        break;
      }
      case "monthly":
      default: {
        const sd = settings.monthStartDay;
        if (d >= sd) {
          periodStart = new Date(y, m, sd);
          periodEnd   = new Date(y, m + 1, sd - 1);
        } else {
          periodStart = new Date(y, m - 1, sd);
          periodEnd   = new Date(y, m, sd - 1);
        }
        label = "Monthly Pay Period";
        break;
      }
    }

    return { periodStart: iso(periodStart), periodEnd: iso(periodEnd), label };
  }

  // GET /api/staff/me/pay-period — current pay period dates + totals + daily breakdown
  app.get("/api/staff/me/pay-period", isAuthenticated, async (req, res) => {
    try {
      const staffId = resolveSessionStaff(req, res);
      if (!staffId) return;
      const member = await storage.getStaffMember(staffId);
      if (!member) return res.status(404).json({ message: "Staff not found" });

      const storeId = (member as any).storeId as number | undefined;

      // Load payroll settings for this store
      let payrollCfg = { frequency: "monthly", weekStartDay: 1, monthStartDay: 1, semiMonthlyDay1: 1, semiMonthlyDay2: 15 };
      if (storeId) {
        const [row] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, storeId));
        const prefs  = safeParsePreferences(row?.preferences as string | undefined);
        const p      = prefs.payroll && typeof prefs.payroll === "object" ? (prefs.payroll as Record<string, unknown>) : {};
        payrollCfg = {
          frequency:        String(p.frequency        ?? "monthly"),
          weekStartDay:     Number(p.weekStartDay     ?? 1),
          monthStartDay:    Number(p.monthStartDay    ?? 1),
          semiMonthlyDay1:  Number(p.semiMonthlyDay1  ?? 1),
          semiMonthlyDay2:  Number(p.semiMonthlyDay2  ?? 15),
        };
      }

      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const { periodStart, periodEnd, label } = computeCurrentPayPeriod(today, payrollCfg);

      const fromDate = new Date(`${periodStart}T00:00:00`);
      const toDate   = new Date(`${periodEnd}T23:59:59`);

      // Fetch all completed appointments for the period
      const rows = await db
        .select({
          date:          appointments.date,
          totalPaid:     appointments.totalPaid,
          tipAmount:     appointments.tipAmount,
          paymentMethod: appointments.paymentMethod,
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.staffId,  staffId),
            eq(appointments.status,   "completed"),
            gte(appointments.date,    fromDate),
            sql`${appointments.date} <= ${toDate}`,
          ),
        );

      const commissionRate  = Number((member as any).commissionRate ?? 0);
      const cardMethods     = new Set(["card", "credit", "credit_card", "stripe", "debit"]);

      // Pre-populate daily map with zeros for every day in the period
      const dailyMap = new Map<string, { total: number; tips: number; count: number }>();
      const cursor   = new Date(fromDate);
      while (cursor <= toDate) {
        const key = cursor.toISOString().slice(0, 10);
        dailyMap.set(key, { total: 0, tips: 0, count: 0 });
        cursor.setDate(cursor.getDate() + 1);
      }

      let periodSvcIncome   = 0;
      let periodTips        = 0;
      let periodAppointments = 0;

      for (const row of rows) {
        const dateStr  = new Date(row.date).toISOString().slice(0, 10);
        const paid     = Number(row.totalPaid  ?? 0);
        const tip      = Number(row.tipAmount  ?? 0);
        const method   = (row.paymentMethod ?? "").toLowerCase();
        const cardTip  = cardMethods.has(method) ? tip : 0;
        const svc      = paid - tip;
        const comm     = svc * (commissionRate / 100);
        const dayTotal = comm + cardTip;

        const day = dailyMap.get(dateStr) ?? { total: 0, tips: 0, count: 0 };
        day.total += dayTotal;
        day.tips  += cardTip;
        day.count += 1;
        dailyMap.set(dateStr, day);

        periodSvcIncome   += svc;
        periodTips        += cardTip;
        periodAppointments += 1;
      }

      const periodCommission = periodSvcIncome * (commissionRate / 100);
      const periodTotal      = periodCommission + periodTips;

      // Derive today's stats from the map
      const todayDay = dailyMap.get(todayStr) ?? { total: 0, tips: 0, count: 0 };

      const dailyBreakdown = Array.from(dailyMap.entries()).map(([date, data]) => ({
        date,
        total: parseFloat(data.total.toFixed(2)),
        tips:  parseFloat(data.tips.toFixed(2)),
        count: data.count,
      }));

      return res.json({
        periodStart,
        periodEnd,
        frequency: payrollCfg.frequency,
        label,
        todayStr,
        periodTotals: {
          total:        periodTotal.toFixed(2),
          tips:         periodTips.toFixed(2),
          commission:   periodCommission.toFixed(2),
          serviceIncome: periodSvcIncome.toFixed(2),
          appointments: periodAppointments,
        },
        todayTotals: {
          total:      todayDay.total.toFixed(2),
          tips:       todayDay.tips.toFixed(2),
          count:      todayDay.count,
        },
        dailyBreakdown,
      });
    } catch (err) {
      console.error("[staff/me] GET pay-period error:", err);
      return res.status(500).json({ message: "Failed to load pay period" });
    }
  });

  // GET /api/staff/me/income?from=YYYY-MM-DD&to=YYYY-MM-DD — own income report
  app.get("/api/staff/me/income", isAuthenticated, async (req, res) => {
    try {
      const staffId = resolveSessionStaff(req, res);
      if (!staffId) return;
      const member = await storage.getStaffMember(staffId);
      if (!member) return res.status(404).json({ message: "Staff not found" });

      const fromStr = req.query.from as string;
      const toStr   = req.query.to   as string;
      const fromDate = fromStr ? new Date(`${fromStr}T00:00:00`) : new Date(new Date().setHours(0,0,0,0));
      const toDate   = toStr   ? new Date(`${toStr}T23:59:59`)   : new Date(new Date().setHours(23,59,59,999));

      const rows = await db
        .select({
          totalPaid:     appointments.totalPaid,
          tipAmount:     appointments.tipAmount,
          discountAmount: appointments.discountAmount,
          paymentMethod: appointments.paymentMethod,
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.staffId, staffId),
            eq(appointments.status, "completed"),
            gte(appointments.date, fromDate),
            sql`${appointments.date} <= ${toDate}`
          )
        );

      const cardPaymentMethods = new Set(["card", "credit", "credit_card", "stripe", "debit"]);
      const cashPaymentMethods = new Set(["cash"]);
      const checkPaymentMethods = new Set(["check"]);

      let serviceIncome = 0;
      let cardTips = 0;
      let cashIncome = 0;
      let checkIncome = 0;
      let totalDiscount = 0;

      for (const row of rows) {
        const paid    = Number(row.totalPaid    ?? 0);
        const tip     = Number(row.tipAmount    ?? 0);
        const disc    = Number(row.discountAmount ?? 0);
        const method  = (row.paymentMethod ?? "").toLowerCase();
        const svcAmt  = paid - tip; // service amount only, tip excluded from income/commission basis

        serviceIncome += svcAmt;
        totalDiscount += disc;

        if (cardPaymentMethods.has(method)) {
          // Card tips pass through the store and are tracked; cash tips go directly to staff
          cardTips += tip;
          // Card service income is already in serviceIncome; not added to cashIncome
        } else if (cashPaymentMethods.has(method)) {
          // Only the service portion of cash payments is counted as income
          // The tip portion is the staff's directly and is not tracked here
          cashIncome += svcAmt;
        } else if (checkPaymentMethods.has(method)) {
          checkIncome += svcAmt;
        } else {
          cashIncome += svcAmt;
        }
      }

      const commissionRate = Number((member as any).commissionRate ?? 0);
      const commission = serviceIncome * (commissionRate / 100);
      const total      = commission + cardTips + cashIncome + checkIncome;

      return res.json({
        name:          member.name,
        from:          fromStr ?? fromDate.toISOString().slice(0, 10),
        to:            toStr   ?? toDate.toISOString().slice(0,   10),
        serviceIncome: serviceIncome.toFixed(2),
        commission:    commission.toFixed(2),
        cardCharge:    "0.00",
        cashDiscount:  "0.00",
        discountCharge: totalDiscount.toFixed(2),
        cardTips:      cardTips.toFixed(2),
        cardTipCharge: "0.00",
        totalTip:      cardTips.toFixed(2),
        cashIncome:    cashIncome.toFixed(2),
        checkIncome:   checkIncome.toFixed(2),
        total:         total.toFixed(2),
      });
    } catch (err) {
      console.error("[staff/me] GET income error:", err);
      return res.status(500).json({ message: "Failed to load income report" });
    }
  });

  // GET /api/staff/:id/services — returns service IDs assigned to this staff member
  // Empty array means no restrictions (staff can perform all services).
  app.get("/api/staff/:id/services", isAuthenticated, async (req, res) => {
    try {
      const staffId = parseRouteId(req.params.id);
      if (!staffId || isNaN(staffId)) return res.status(400).json({ message: "Invalid staff id" });
      const rows = await storage.getStaffServices(staffId);
      return res.json({ serviceIds: rows.map((r) => r.serviceId) });
    } catch (err) {
      console.error("[staff] GET :id/services error:", err);
      return res.status(500).json({ message: "Failed to load staff services" });
    }
  });

  // GET /api/staff/me/tax-info — read own 1099 mailing address (MUST be before /:id route)
  app.get("/api/staff/me/tax-info", isAuthenticated, async (req, res) => {
    try {
      const staffId = resolveSessionStaff(req, res);
      if (!staffId) return;
      const member = await storage.getStaffMember(staffId);
      if (!member) return res.status(404).json({ message: "Staff not found" });
      return res.json({
        mailingAddress1: (member as any).mailingAddress1 ?? "",
        mailingAddress2: (member as any).mailingAddress2 ?? "",
        mailingCity:     (member as any).mailingCity     ?? "",
        mailingState:    (member as any).mailingState    ?? "",
        mailingZip:      (member as any).mailingZip      ?? "",
        mailingCountry:  (member as any).mailingCountry  ?? "US",
      });
    } catch (err) {
      console.error("[staff/me] GET tax-info error:", err);
      return res.status(500).json({ message: "Failed to load tax info" });
    }
  });

  // GET /api/staff/:id/tax-info — owner reads a staff member's 1099 mailing address
  app.get("/api/staff/:id/tax-info", isAuthenticated, async (req, res) => {
    try {
      const staffId = parseRouteId(req.params.id);
      if (!staffId || isNaN(staffId)) return res.status(400).json({ message: "Invalid staff id" });
      const member = await storage.getStaffMember(staffId);
      if (!member) return res.status(404).json({ message: "Staff not found" });
      return res.json({
        mailingAddress1: (member as any).mailingAddress1 ?? "",
        mailingAddress2: (member as any).mailingAddress2 ?? "",
        mailingCity:     (member as any).mailingCity     ?? "",
        mailingState:    (member as any).mailingState    ?? "",
        mailingZip:      (member as any).mailingZip      ?? "",
        mailingCountry:  (member as any).mailingCountry  ?? "US",
      });
    } catch (err) {
      console.error("[staff] GET :id/tax-info error:", err);
      return res.status(500).json({ message: "Failed to load tax info" });
    }
  });

  // PUT /api/staff/me/tax-info — update own 1099 mailing address
  app.put("/api/staff/me/tax-info", isAuthenticated, async (req, res) => {
    try {
      const staffId = resolveSessionStaff(req, res);
      if (!staffId) return;
      const { mailingAddress1, mailingAddress2, mailingCity, mailingState, mailingZip, mailingCountry } = req.body;
      const updates: Record<string, string | null> = {};
      if (mailingAddress1 !== undefined) updates.mailingAddress1 = mailingAddress1 ? String(mailingAddress1).trim() : null;
      if (mailingAddress2 !== undefined) updates.mailingAddress2 = mailingAddress2 ? String(mailingAddress2).trim() : null;
      if (mailingCity     !== undefined) updates.mailingCity     = mailingCity     ? String(mailingCity).trim()     : null;
      if (mailingState    !== undefined) updates.mailingState    = mailingState    ? String(mailingState).trim()    : null;
      if (mailingZip      !== undefined) updates.mailingZip      = mailingZip      ? String(mailingZip).trim()      : null;
      if (mailingCountry  !== undefined) updates.mailingCountry  = mailingCountry  ? String(mailingCountry).trim()  : "US";
      const updated = await storage.updateStaff(staffId, updates as any);
      if (!updated) return res.status(404).json({ message: "Staff not found" });
      return res.json({
        mailingAddress1: (updated as any).mailingAddress1 ?? "",
        mailingAddress2: (updated as any).mailingAddress2 ?? "",
        mailingCity:     (updated as any).mailingCity     ?? "",
        mailingState:    (updated as any).mailingState    ?? "",
        mailingZip:      (updated as any).mailingZip      ?? "",
        mailingCountry:  (updated as any).mailingCountry  ?? "US",
      });
    } catch (err) {
      console.error("[staff/me] PUT tax-info error:", err);
      return res.status(500).json({ message: "Failed to update tax info" });
    }
  });

  // ── Stripe Connect embedded onboarding (staff/contractor self-service) ───────

  // GET /api/staff/me/stripe-status — returns the contractor's current Stripe Express status
  app.get("/api/staff/me/stripe-status", isAuthenticated, async (req, res) => {
    try {
      const staffId = resolveSessionStaff(req, res);
      if (!staffId) return;

      const [contractor] = await db
        .select({
          id:              contractors.id,
          stripeAccountId: contractors.stripeAccountId,
          onboardingStatus: contractors.onboardingStatus,
          bankVerified:    contractors.bankVerified,
          email:           contractors.email,
          firstName:       contractors.firstName,
          lastName:        contractors.lastName,
          storeId:         contractors.storeId,
        })
        .from(contractors)
        .where(eq(contractors.staffId, staffId))
        .limit(1);

      if (!contractor) {
        return res.json({ hasContractorRecord: false });
      }

      return res.json({
        hasContractorRecord: true,
        contractorId:    contractor.id,
        onboardingStatus: contractor.onboardingStatus ?? "pending",
        bankVerified:    contractor.bankVerified ?? false,
        hasStripeAccount: !!contractor.stripeAccountId,
        stripeConfigured: isStripeConfigured(),
      });
    } catch (err) {
      console.error("[staff/me] GET stripe-status error:", err);
      return res.status(500).json({ message: "Failed to load Stripe status" });
    }
  });

  // POST /api/staff/me/stripe-connect-session
  // Creates (or reuses) a Stripe Express account for the contractor, then mints a
  // short-lived AccountSession client_secret for Stripe's embedded onboarding component.
  app.post("/api/staff/me/stripe-connect-session", isAuthenticated, async (req, res) => {
    try {
      const staffId = resolveSessionStaff(req, res);
      if (!staffId) return;

      if (!isStripeConfigured()) {
        return res.status(400).json({ error: "Stripe is not configured on this platform" });
      }

      const [contractor] = await db
        .select()
        .from(contractors)
        .where(eq(contractors.staffId, staffId))
        .limit(1);

      if (!contractor) {
        return res.status(404).json({ error: "No contractor record found for your staff account. Ask your manager to set you up as a contractor first." });
      }

      const stripeClient = getStripe();

      // Create Stripe Express account if none exists; reuse if accessible.
      let accountId = contractor.stripeAccountId;
      if (accountId) {
        try {
          await stripeClient.accounts.retrieve(accountId);
        } catch (err: any) {
          // Account lost (deauthorised, deleted) — recreate it
          if (err?.code === "account_invalid" || err?.type === "StripeInvalidRequestError") {
            accountId = null;
          } else {
            throw err;
          }
        }
      }

      if (!accountId) {
        const account = await stripeClient.accounts.create({
          type: "express",
          email: contractor.email ?? undefined,
          business_type: "individual",
          metadata: {
            contractorId: String(contractor.id),
            storeId:      String(contractor.storeId),
            source:       "certxa_staff_portal",
          },
        });
        accountId = account.id;
        await db.update(contractors)
          .set({ stripeAccountId: accountId, onboardingStatus: "in_progress", bankVerified: false, updatedAt: new Date() })
          .where(eq(contractors.id, contractor.id));
      }

      // Mint an AccountSession for the embedded onboarding component
      const accountSession = await stripeClient.accountSessions.create({
        account: accountId,
        components: {
          account_onboarding: {
            enabled: true,
            features: { external_account_collection: true },
          },
        },
      });

      return res.json({
        clientSecret:    accountSession.client_secret,
        publishableKey:  process.env.STRIPE_PUBLISHABLE_KEY!,
        contractorId:    contractor.id,
        onboardingStatus: contractor.onboardingStatus ?? "in_progress",
        bankVerified:    contractor.bankVerified ?? false,
      });
    } catch (err: any) {
      console.error("[staff/me] POST stripe-connect-session error:", err);
      return res.status(500).json({ error: err?.message ?? "Failed to create Stripe session" });
    }
  });

  // POST /api/staff/me/stripe-dashboard-session
  // Mints an AccountSession with ALL embedded dashboard components enabled:
  //   notification_banner, balances, payouts, payments, documents, account_management.
  // The frontend calls this once on mount and again whenever the session expires
  // (Stripe calls fetchClientSecret automatically on expiry).
  app.post("/api/staff/me/stripe-dashboard-session", isAuthenticated, async (req, res) => {
    try {
      const staffId = resolveSessionStaff(req, res);
      if (!staffId) return;

      if (!isStripeConfigured()) {
        return res.status(400).json({ error: "Stripe is not configured on this platform" });
      }

      const [contractor] = await db
        .select({ id: contractors.id, stripeAccountId: contractors.stripeAccountId })
        .from(contractors)
        .where(eq(contractors.staffId, staffId))
        .limit(1);

      if (!contractor) {
        return res.status(404).json({ error: "No contractor record found for your staff account." });
      }
      if (!contractor.stripeAccountId) {
        return res.status(400).json({ error: "Stripe account not yet created. Complete onboarding first." });
      }

      const stripeClient = getStripe();

      const accountSession = await stripeClient.accountSessions.create({
        account: contractor.stripeAccountId,
        components: {
          // Action items (e.g. complete verification) shown at the top of Overview
          notification_banner: {
            enabled: true,
            features: { external_account_collection: true },
          },
          // Live balance + instant payout request button
          balances: {
            enabled: true,
            features: { instant_payouts: true },
          },
          // Full payout history, schedule editor, bank account management
          payouts: {
            enabled: true,
            features: {
              instant_payouts:           true,
              standard_payouts:          true,
              edit_payout_schedule:      true,
              external_account_collection: true,
            },
          },
          // Individual payment records attributed to this contractor
          payments: {
            enabled: true,
            features: {
              refund_management:    false, // contractors cannot issue refunds
              dispute_management:   false, // disputes handled by platform
              // capture_before_expiry not in current Stripe SDK types
            },
          },
          // 1099 and other tax documents, available for download
          documents: {
            enabled: true,
          },
          // Update bank account, payout schedule, identity details
          account_management: {
            enabled: true,
            features: { external_account_collection: true },
          },
        },
      });

      return res.json({
        clientSecret:   accountSession.client_secret,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY!,
      });
    } catch (err: any) {
      console.error("[staff/me] POST stripe-dashboard-session error:", err);
      return res.status(500).json({ error: err?.message ?? "Failed to create dashboard session" });
    }
  });

  // GET /api/staff/me/history — paginated appointment history for the logged-in staff member
  app.get("/api/staff/me/history", isAuthenticated, async (req, res) => {
    try {
      const staffId = resolveSessionStaff(req, res);
      if (!staffId) return;

      const page  = Math.max(1, Number(req.query.page)  || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const offset = (page - 1) * limit;

      const fromDate = req.query.from ? new Date(String(req.query.from)) : null;
      const toDate   = req.query.to   ? new Date(String(req.query.to))   : null;

      // Default: completed + no-show; caller may override with comma-separated statuses
      const statusList: string[] = req.query.status
        ? String(req.query.status).split(",").map(s => s.trim()).filter(Boolean)
        : ["completed", "no-show", "no_show", "cancelled"];

      const conditions: ReturnType<typeof eq>[] = [
        eq(appointments.staffId, staffId),
        inArray(appointments.status as any, statusList),
      ];
      if (fromDate && !isNaN(fromDate.getTime())) {
        conditions.push(gte(appointments.date, fromDate) as any);
      }
      if (toDate && !isNaN(toDate.getTime())) {
        const endOfDay = new Date(toDate);
        endOfDay.setHours(23, 59, 59, 999);
        conditions.push(lte(appointments.date, endOfDay) as any);
      }

      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            id:            appointments.id,
            date:          appointments.date,
            duration:      appointments.duration,
            status:        appointments.status,
            totalPaid:     appointments.totalPaid,
            tipAmount:     appointments.tipAmount,
            paymentMethod: appointments.paymentMethod,
            notes:         appointments.notes,
            clientName:    clients.fullName,
            serviceName:   services.name,
            servicePrice:  services.price,
          })
          .from(appointments)
          .leftJoin(clients, eq(appointments.customerId, clients.id))
          .leftJoin(services,  eq(appointments.serviceId,  services.id))
          .where(and(...conditions))
          .orderBy(desc(appointments.date))
          .limit(limit)
          .offset(offset),

        db
          .select({ total: count() })
          .from(appointments)
          .where(and(...conditions)),
      ]);

      return res.json({
        appointments: rows,
        pagination: {
          page,
          limit,
          total:      Number(total),
          totalPages: Math.ceil(Number(total) / limit),
        },
      });
    } catch (err) {
      console.error("[staff/me] GET history error:", err);
      return res.status(500).json({ message: "Failed to load history" });
    }
  });

  // GET /api/staff/me/stats — today's appointments, service breakdown, personal records, lifetime, comparison
  app.get("/api/staff/me/stats", isAuthenticated, async (req, res) => {
    try {
      const staffId = resolveSessionStaff(req, res);
      if (!staffId) return;
      const member = await storage.getStaffMember(staffId);
      if (!member) return res.status(404).json({ message: "Staff not found" });

      const commissionRate = Number((member as any).commissionRate ?? 0);
      const cardMethods    = new Set(["card", "credit", "credit_card", "stripe", "debit"]);

      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);

      // ── Today's appointments (all statuses, for the schedule list) ──────────
      const todayRows = await db
        .select({
          id:            appointments.id,
          date:          appointments.date,
          status:        appointments.status,
          totalPaid:     appointments.totalPaid,
          tipAmount:     appointments.tipAmount,
          paymentMethod: appointments.paymentMethod,
          clientName:    clients.fullName,
          serviceName:   services.name,
        })
        .from(appointments)
        .leftJoin(clients,  eq(appointments.customerId, clients.id))
        .leftJoin(services, eq(appointments.serviceId,  services.id))
        .where(and(
          eq(appointments.staffId, staffId),
          gte(appointments.date, todayStart),
          lte(appointments.date, todayEnd),
        ))
        .orderBy(asc(appointments.date));

      // ── All-time completed: personal records, lifetime, service breakdown ──
      const allRows = await db
        .select({
          date:          appointments.date,
          totalPaid:     appointments.totalPaid,
          tipAmount:     appointments.tipAmount,
          paymentMethod: appointments.paymentMethod,
          serviceName:   services.name,
        })
        .from(appointments)
        .leftJoin(services, eq(appointments.serviceId, services.id))
        .where(and(
          eq(appointments.staffId, staffId),
          eq(appointments.status, "completed"),
        ));

      const dayMap  = new Map<string, { earnings: number; count: number; date: Date }>();
      const weekMap = new Map<string, { earnings: number }>();
      const serviceMap = new Map<string, { revenue: number; count: number }>();
      const thirtyDaysAgo = new Date(todayStart);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sevenDaysAgo  = new Date(todayStart);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const fourteenDaysAgo = new Date(todayStart);
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      let lifetimeEarnings = 0;
      let lifetimeServices = 0;
      let lifetimeCardTips = 0;
      let firstApptDate: Date | null = null;
      let lastWeekTotal = 0;
      let prevWeekTotal = 0;

      for (const row of allRows) {
        const d       = new Date(row.date);
        const paid    = Number(row.totalPaid  ?? 0);
        const tip     = Number(row.tipAmount  ?? 0);
        const method  = (row.paymentMethod ?? "").toLowerCase();
        const cardTip = cardMethods.has(method) ? tip : 0;
        const svc     = paid - tip;
        const comm    = svc * (commissionRate / 100);
        const earn    = comm + cardTip;

        // Day map
        const dayKey  = d.toISOString().slice(0, 10);
        const dayEntry = dayMap.get(dayKey) ?? { earnings: 0, count: 0, date: d };
        dayEntry.earnings += earn;
        dayEntry.count    += 1;
        dayMap.set(dayKey, dayEntry);

        // Week map (key = Sunday of that week)
        const ws = new Date(d);
        ws.setDate(d.getDate() - d.getDay());
        const weekKey = ws.toISOString().slice(0, 10);
        const wEntry  = weekMap.get(weekKey) ?? { earnings: 0 };
        wEntry.earnings += earn;
        weekMap.set(weekKey, wEntry);

        // Service breakdown (last 30 days)
        if (d >= thirtyDaysAgo) {
          const svcName  = row.serviceName ?? "Other";
          const svcEntry = serviceMap.get(svcName) ?? { revenue: 0, count: 0 };
          svcEntry.revenue += earn;
          svcEntry.count   += 1;
          serviceMap.set(svcName, svcEntry);
        }

        // Lifetime
        lifetimeEarnings += earn;
        lifetimeServices += 1;
        lifetimeCardTips += cardTip;
        if (!firstApptDate || d < firstApptDate) firstApptDate = d;

        // Week-over-week comparison
        if (d >= sevenDaysAgo)    lastWeekTotal += earn;
        if (d >= fourteenDaysAgo && d < sevenDaysAgo) prevWeekTotal += earn;
      }

      // Personal records
      let bestDayEarnings = 0, bestDayDate = "", mostServicesCount = 0, mostServicesDate = "";
      let bestWeekEarnings = 0;
      for (const [key, v] of dayMap.entries()) {
        if (v.earnings > bestDayEarnings) { bestDayEarnings = v.earnings; bestDayDate = key; }
        if (v.count    > mostServicesCount) { mostServicesCount = v.count; mostServicesDate = key; }
      }
      for (const v of weekMap.values()) {
        if (v.earnings > bestWeekEarnings) bestWeekEarnings = v.earnings;
      }

      const serviceBreakdown = Array.from(serviceMap.entries())
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .slice(0, 5)
        .map(([name, v]) => ({ name, revenue: parseFloat(v.revenue.toFixed(2)), count: v.count }));

      return res.json({
        todayAppointments: todayRows.map(r => ({
          id: r.id, date: r.date, status: r.status,
          totalPaid: r.totalPaid, tipAmount: r.tipAmount,
          paymentMethod: r.paymentMethod,
          clientName:  r.clientName  ?? "Client",
          serviceName: r.serviceName ?? "Service",
        })),
        serviceBreakdown,
        hourlyEarnings: (() => {
          const cardM = new Set(["card", "credit", "credit_card", "stripe", "debit"]);
          // Bucket completed today-appointments by hour
          const buckets = new Map<number, number>();
          for (const row of todayRows) {
            if (row.status !== "completed") continue;
            const h    = new Date(row.date).getHours();
            const paid = Number(row.totalPaid  ?? 0);
            const tip  = Number(row.tipAmount  ?? 0);
            const ct   = cardM.has((row.paymentMethod ?? "").toLowerCase()) ? tip : 0;
            const earn = (paid - tip) * (commissionRate / 100) + ct;
            buckets.set(h, (buckets.get(h) ?? 0) + earn);
          }
          // Build 8 am → 9 pm slots with cumulative totals
          const startH = 8, endH = 21;
          const slots: { hour: number; label: string; amount: number; cumulative: number }[] = [];
          let running = 0;
          for (let h = startH; h <= endH; h++) {
            const amount = parseFloat((buckets.get(h) ?? 0).toFixed(2));
            running += amount;
            const ampm = h < 12 ? "AM" : "PM";
            const disp = h === 12 ? 12 : h % 12;
            slots.push({ hour: h, label: `${disp}${ampm}`, amount, cumulative: parseFloat(running.toFixed(2)) });
          }
          return slots;
        })(),
        personalRecords: {
          bestDayEarnings:    parseFloat(bestDayEarnings.toFixed(2)),
          bestDayDate,
          bestWeekEarnings:   parseFloat(bestWeekEarnings.toFixed(2)),
          mostServicesInDay:  mostServicesCount,
          mostServicesDate,
        },
        lifetimeSummary: {
          totalEarnings:  parseFloat(lifetimeEarnings.toFixed(2)),
          totalServices:  lifetimeServices,
          totalCardTips:  parseFloat(lifetimeCardTips.toFixed(2)),
          memberSince:    firstApptDate ? firstApptDate.toISOString().slice(0, 10) : null,
        },
        comparison: {
          lastWeekTotal:  parseFloat(lastWeekTotal.toFixed(2)),
          prevWeekTotal:  parseFloat(prevWeekTotal.toFixed(2)),
          changePercent:  prevWeekTotal > 0
            ? parseFloat(((lastWeekTotal - prevWeekTotal) / prevWeekTotal * 100).toFixed(1))
            : null,
        },
      });
    } catch (err) {
      console.error("[staff/me] GET stats error:", err);
      return res.status(500).json({ message: "Failed to load stats" });
    }
  });

  // POST /api/staff/me/avatar — upload own avatar photo
  app.post("/api/staff/me/avatar", isAuthenticated, (req, res, next) => {
    avatarUpload.single("avatar")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE")
          return res.status(413).json({ message: "File too large. Maximum size is 20 MB." });
        return res.status(400).json({ message: err.message });
      }
      if (err) return res.status(400).json({ message: (err as Error).message || "Upload error" });
      next();
    });
  }, async (req, res) => {
    try {
      const staffId = resolveSessionStaff(req, res);
      if (!staffId) return;
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const { avatarUrl, thumbUrl } = await uploadAvatarToR2(req.file.buffer, req.file.originalname, req.file.mimetype);
      const member = await storage.updateStaff(staffId, { avatarUrl, avatarThumbUrl: thumbUrl } as any);
      if (!member) return res.status(404).json({ message: "Staff not found" });
      // GBP Photo Engine: enqueue staff avatar (fire-and-forget)
      if (member.storeId && avatarUrl) {
        triggerGBPPhotoEvent(member.storeId, "staff_avatar", {
          imageUrl:   avatarUrl,
          staffId:    member.id,
          entityName: member.name ?? undefined,
        });
      }
      return res.json({ avatarUrl, thumbUrl });
    } catch (err) {
      console.error("[staff/me] avatar upload error:", err);
      return res.status(500).json({ message: "Upload failed" });
    }
  });

  // GET staff calendar access status
  app.get("/api/staff/:id/calendar-access-status", isAuthenticated, async (req, res) => {
    try {
      const staffId = Number(req.params.id);
      const staff = await storage.getStaffMember(staffId);

      if (!staff) {
        return res.status(404).json({ message: "Staff member not found" });
      }

      // Staff without an email cannot have calendar access
      if (!staff.email) {
        return res.json({ hasCalendarAccess: false, email: null, enabled: false });
      }

      // Check if user exists with staff role and this staffId
      const user = await storage.findUserByEmail(staff.email);
      // Calendar access = a linked user account exists in any non-owner role with this staffId
      const hasCalendarAccess = !!(user && user.role !== "owner" && user.role !== "admin" && user.staffId === staffId);

      return res.json({ 
        hasCalendarAccess,
        email: staff.email,
        enabled: !!hasCalendarAccess
      });
    } catch (error) {
      console.error("Error checking calendar access status:", error);
      return res.status(500).json({ message: "Failed to check calendar access status" });
    }
  });

  // POST disable staff calendar access — unlinks the user account from the
  // staff record so they can no longer log in to the staff calendar. Does
  // NOT delete the user account, and does NOT downgrade an owner/admin/manager.
  app.post("/api/staff/:id/disable-calendar-access", isAuthenticated, async (req, res) => {
    try {
      const staffId = Number(req.params.id);
      const staff = await storage.getStaffMember(staffId);
      if (!staff || !staff.email) {
        return res.status(400).json({ message: "Staff member not found or has no email address." });
      }
      const user = await storage.findUserByEmail(staff.email);
      if (!user || user.staffId !== staffId) {
        return res.json({ message: "Calendar access already disabled." });
      }
      // Only clear the staffId link. If their role was "staff" (set by the
      // legacy enable flow) and they don't own a store, leave it; otherwise
      // preserve owner/admin/manager.
      await storage.updateUser(user.id, { staffId: null });
      return res.json({ message: "Calendar access disabled." });
    } catch (error) {
      console.error("Error disabling calendar access:", error);
      return res.status(500).json({ message: "Failed to disable calendar access" });
    }
  });

  // POST test mailgun connection
  app.post("/api/admin/platform-settings/test-mailgun", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const { to } = req.body;
      
      if (!to) {
        return res.status(400).json({ message: "Recipient email is required" });
      }

      // Use Mailgun settings from .env
      const apiKey = process.env.MAILGUN_API_KEY;
      const domain = process.env.MAILGUN_DOMAIN;
      const fromEmail = process.env.MAILGUN_FROM_EMAIL || `noreply@${domain}`;
      const fromName = process.env.MAILGUN_FROM_NAME || 'Test Platform';

      if (!apiKey || !domain) {
        return res.status(500).json({ message: "Mailgun not configured in server environment" });
      }

      console.log("Testing mailgun connection to:", to);
      
      // Send actual test email via Mailgun API
      const formData = new FormData();
      formData.append('from', `${fromName} <${fromEmail}>`);
      formData.append('to', to);
      formData.append('subject', 'Mailgun Test Email');
      formData.append('text', `This is a test email sent at ${new Date().toISOString()}. If you received this, your Mailgun configuration is working correctly.`);
      formData.append('html', `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px;">
            Mailgun Test Email
          </h2>
          <p style="color: #666; line-height: 1.6;">
            This is a test email sent from your booking platform at <strong>${new Date().toLocaleString()}</strong>.
          </p>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #495057; margin: 0 0 10px 0;">Test Details:</h3>
            <ul style="color: #6c757d; margin: 0; padding-left: 20px;">
              <li>Sent to: ${to}</li>
              <li>Sent from: ${fromEmail}</li>
              <li>Domain: ${domain}</li>
              <li>Time: ${new Date().toISOString()}</li>
            </ul>
          </div>
          <p style="color: #28a745; font-weight: bold;">
            ✅ If you received this email, your Mailgun configuration is working correctly!
          </p>
        </div>
      `);

      const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Mailgun API error:', errorData);
        throw new Error(`Mailgun API error: ${response.status} ${errorData}`);
      }

      const result = await response.json() as { id?: string };
      console.log('Mailgun test successful:', result);
      
      return res.json({ 
        message: "Mailgun test successful", 
        timestamp: new Date().toISOString(),
        recipient: to,
        messageId: result.id
      });
    } catch (error) {
      console.error("Error testing mailgun:", error);
      return res.status(500).json({ message: "Mailgun test failed", error: error instanceof Error ? error.message : String(error) });
    }
  });

  // POST test twilio connection
  app.post("/api/admin/platform-settings/test-twilio", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const { to } = req.body;
      
      if (!to) {
        return res.status(400).json({ message: "Recipient phone number is required" });
      }

      // TODO: Implement actual twilio test
      console.log("Testing twilio connection to:", to);
      
      // Simulate test
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return res.json({ message: "Twilio test successful", timestamp: new Date().toISOString() });
    } catch (error) {
      console.error("Error testing twilio:", error);
      return res.status(500).json({ message: "Twilio test failed" });
    }
  });

  // GET service status
  app.get("/api/admin/platform-settings/status", async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    try {
      const status = {
        mailgun: {
          connected: !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN),
          lastCheck: new Date().toISOString(),
          error: null
        },
        twilio: {
          connected: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER),
          lastCheck: new Date().toISOString(),
          error: null
        },
        system: {
          healthy: true,
          lastCheck: new Date().toISOString()
        }
      };
      
      return res.json(status);
    } catch (error) {
      console.error("Error fetching service status:", error);
      return res.status(500).json({ message: "Failed to fetch service status" });
    }
  });

  /**
   * Billing Invoice Endpoints (Mock for now)
   */

  // GET all invoices
  app.get("/api/billing/invoices/all", async (req, res) => {
    try {
      // Mock data - replace with actual database query
      const invoices: any[] = []; // Mock empty invoices array
      return res.json({ data: invoices });
    } catch (error) {
      console.error("Error fetching all invoices:", error);
      return res.status(500).json({ message: "Failed to fetch all invoices" });
    }
  });

  // GET unpaid invoices count
  app.get("/api/billing/invoices/unpaid/count", async (req, res) => {
    try {
      // Mock data - replace with actual database query
      const count = 0; // Mock unpaid count
      return res.json({ count });
    } catch (error) {
      console.error("Error fetching unpaid invoices count:", error);
      return res.status(500).json({ message: "Failed to fetch unpaid invoices count" });
    }
  });

  // GET past due invoices count
  app.get("/api/billing/invoices/past-due/count", async (req, res) => {
    try {
      // Mock data - replace with actual database query
      const count = 0; // Mock past due count
      return res.json({ count });
    } catch (error) {
      console.error("Error fetching past due invoices count:", error);
      return res.status(500).json({ message: "Failed to fetch past due invoices count" });
    }
  });

  // ============================================================
  // OFFLINE SNAPSHOT ROUTE
  // ============================================================

  app.get("/api/offline/snapshot", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const storeIdParam = req.query.storeId ? parseInt(req.query.storeId as string) : null;

      // Fetch ALL stores owned by this authenticated user so we can verify ownership.
      const userStores = await db.select().from(locations).where(eq(locations.userId, userId));
      if (!userStores.length) return res.status(404).json({ message: "Store not found" });

      // If a storeId was requested, it MUST belong to the authenticated user.
      // Never trust a client-supplied storeId without an ownership check — doing so
      // would allow any logged-in user to read another salon's data (tenant leakage).
      let storeId: number;
      if (storeIdParam !== null) {
        const owned = userStores.find((s) => s.id === storeIdParam);
        if (!owned) {
          console.warn(
            `[snapshot] TENANT ISOLATION BLOCK — userId=${userId} requested storeId=${storeIdParam} which they do not own. Owned stores: [${userStores.map((s) => s.id).join(", ")}]`
          );
          return res.status(403).json({ message: "Forbidden: store does not belong to your account" });
        }
        storeId = owned.id;
      } else {
        storeId = userStores[0].id;
      }

      const windowStart = new Date();
      windowStart.setHours(0, 0, 0, 0);
      const windowEnd = new Date(windowStart);
      windowEnd.setDate(windowEnd.getDate() + 30);
      windowEnd.setHours(23, 59, 59, 999);

      const [categoriesData, servicesData, addonsData, staffData, customersData, hoursData, appointmentsData] = await Promise.all([
        db.select({
          id: serviceCategories.id,
          name: serviceCategories.name,
          storeId: serviceCategories.storeId,
          sortOrder: serviceCategories.sortOrder,
        }).from(serviceCategories).where(eq(serviceCategories.storeId, storeId)).orderBy(asc(serviceCategories.sortOrder)),

        db.select({
          id: services.id,
          name: services.name,
          description: services.description,
          duration: services.duration,
          price: services.price,
          category: services.category,
          categoryId: services.categoryId,
          storeId: services.storeId,
          depositRequired: services.depositRequired,
        }).from(services).where(eq(services.storeId, storeId)).orderBy(asc(services.name)),

        db.select({
          id: addons.id,
          name: addons.name,
          description: addons.description,
          price: addons.price,
          duration: addons.duration,
          storeId: addons.storeId,
        }).from(addons).where(eq(addons.storeId, storeId)).orderBy(asc(addons.name)),

        db.select({
          id: staff.id,
          name: staff.name,
          email: staff.email,
          phone: staff.phone,
          role: staff.role,
          color: staff.color,
          status: staff.status,
          employmentType: staff.employmentType,
          storeId: staff.storeId,
        }).from(staff).where(and(eq(staff.storeId, storeId), eq(staff.status, "active"))).orderBy(asc(staff.name)),

        db.select({
          id: clients.id,
          name: clients.fullName,
          phone: sql<string>`(SELECT display_phone FROM client_phones WHERE client_id = clients.id AND is_primary = true LIMIT 1)`,
          email: sql<string>`(SELECT email_address FROM client_emails WHERE client_id = clients.id AND is_primary = true LIMIT 1)`,
          loyaltyPoints: clients.loyaltyPoints,
          storeId: clients.storeId,
        }).from(clients).where(and(eq(clients.storeId, storeId), isNull(clients.archivedAt))).orderBy(asc(clients.fullName)),

        storage.getBusinessHours(storeId),

        db.select({
          id: appointments.id,
          date: appointments.date,
          duration: appointments.duration,
          status: appointments.status,
          notes: appointments.notes,
          serviceId: appointments.serviceId,
          staffId: appointments.staffId,
          customerId: appointments.customerId,
          storeId: appointments.storeId,
          totalPaid: appointments.totalPaid,
          tipAmount: appointments.tipAmount,
        }).from(appointments).where(
          and(
            eq(appointments.storeId, storeId),
            gte(appointments.date, windowStart),
            sql`${appointments.date} <= ${windowEnd.toISOString()}`
          )
        ).orderBy(asc(appointments.date)),
      ]);

      // Fetch staff availability for all active staff members
      const staffAvailabilityData = staffData.length > 0
        ? await Promise.all(staffData.map(s => storage.getStaffAvailability(s.id))).then(r => r.flat())
        : [];

      console.log(
        `[snapshot] Generated for userId=${userId} storeId=${storeId} — ` +
        `categories=${categoriesData.length} services=${servicesData.length} ` +
        `addons=${addonsData.length} staff=${staffData.length} clients=${customersData.length} ` +
        `hours=${hoursData.length} availability=${staffAvailabilityData.length} ` +
        `appointments=${appointmentsData.length} (today+30d)`
      );

      const raw = JSON.stringify({ categoriesData, servicesData, addonsData, staffData, customersData, hoursData, appointmentsData });
      const version = crypto.createHash("sha1").update(raw).digest("hex").slice(0, 12);

      const snapshot = {
        version,
        generatedAt: new Date().toISOString(),
        storeId,
        categories: categoriesData,
        services: servicesData,
        addons: addonsData,
        staff: staffData,
        customers: customersData,
        appointments: appointmentsData.map(a => ({
          id: a.id,
          date: (a.date instanceof Date ? a.date : new Date(a.date)).toISOString(),
          duration: a.duration,
          status: a.status,
          notes: a.notes,
          serviceId: a.serviceId,
          staffId: a.staffId,
          customerId: a.customerId,
          storeId: a.storeId,
          totalPaid: a.totalPaid,
          tipAmount: a.tipAmount,
        })),
        storeHours: hoursData.map(h => ({
          dayOfWeek: h.dayOfWeek,
          openTime: h.openTime,
          closeTime: h.closeTime,
          isClosed: h.isClosed,
        })),
        staffAvailability: staffAvailabilityData.map(a => ({
          staffId: a.staffId,
          dayOfWeek: a.dayOfWeek,
          startTime: a.startTime,
          endTime: a.endTime,
        })),
      };

      res.setHeader("Cache-Control", "no-store");
      return res.json(snapshot);
    } catch (err) {
      console.error("[snapshot] Failed to generate snapshot:", err);
      return res.status(500).json({ message: "Failed to generate offline snapshot" });
    }
  });

  // ============================================================
  // WAITLIST ROUTES
  // ============================================================

  app.get("/api/waitlist", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const userStore = await db.select().from(locations).where(eq(locations.userId, userId)).limit(1);
      if (!userStore.length) return res.status(404).json({ message: "Store not found" });
      const storeId = userStore[0].id;

      const scope = (req.query.scope as string) || "all";
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const whereClause = scope === "today"
        ? and(
          eq(waitlist.storeId, storeId),
          gte(waitlist.createdAt, todayStart),
          sql`${waitlist.status} IN ('waiting', 'called', 'serving', 'completed')`
        )
        : eq(waitlist.storeId, storeId);

      const entries = await db
        .select({
          id: waitlist.id,
          storeId: waitlist.storeId,
          customerName: waitlist.customerName,
          customerPhone: waitlist.customerPhone,
          customerEmail: waitlist.customerEmail,
          preferredDate: waitlist.preferredDate,
          preferredTimeStart: waitlist.preferredTimeStart,
          preferredTimeEnd: waitlist.preferredTimeEnd,
          notes: waitlist.notes,
          status: waitlist.status,
          notifiedAt: waitlist.notifiedAt,
          createdAt: waitlist.createdAt,
          serviceId: waitlist.serviceId,
          staffId: waitlist.staffId,
          customerId: waitlist.customerId,
        })
        .from(waitlist)
        .where(whereClause)
        .orderBy(desc(waitlist.createdAt));

      return res.json(entries);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to fetch waitlist" });
    }
  });

  app.post("/api/waitlist", isAuthenticated, async (req, res) => {
    try {
      const idempotencyKey = req.headers["x-idempotency-key"] as string | undefined;
      if (idempotencyKey) {
        const cached = processedIdempotencyKeys.get(idempotencyKey);
        if (cached) {
          if (Date.now() - cached.ts < IDEMPOTENCY_TTL_MS) {
            const cachedBody: Record<string, unknown> =
              cached.body && typeof cached.body === "object" && !Array.isArray(cached.body)
                ? (cached.body as Record<string, unknown>)
                : {};
            return res.json(Object.assign({}, cachedBody, { alreadyProcessed: true }));
          }
          processedIdempotencyKeys.delete(idempotencyKey);
        }
      }

      const userId = (req.session as any)?.userId;
      const userStore = await db.select().from(locations).where(eq(locations.userId, userId)).limit(1);
      if (!userStore.length) return res.status(404).json({ message: "Store not found" });
      const storeId = userStore[0].id;

      const { customerName, customerPhone, customerEmail, preferredDate, preferredTimeStart, preferredTimeEnd, notes, serviceId, staffId, customerId } = req.body;
      await assertTurnEligibleForWalkIn(
        storeId,
        staffId ? parseInt(staffId) : null,
        serviceId ? parseInt(serviceId) : null
      );
      const [entry] = await db.insert(waitlist).values({
        storeId,
        customerName,
        customerPhone,
        customerEmail,
        preferredDate: preferredDate ? new Date(preferredDate) : null,
        preferredTimeStart,
        preferredTimeEnd,
        notes,
        serviceId: serviceId ? parseInt(serviceId) : null,
        staffId: staffId ? parseInt(staffId) : null,
        customerId: customerId ? parseInt(customerId) : null,
        status: "waiting",
      }).returning();

      if (idempotencyKey) {
        processedIdempotencyKeys.set(idempotencyKey, { ts: Date.now(), body: entry });
      }
      return res.json(entry);
    } catch (err) {
      console.error(err);
      return res.status((err as any).status || 500).json({ message: (err as any).message || "Failed to add to waitlist" });
    }
  });

  // Atomic "Next Customer" — completes whoever is serving, promotes next waiting
  app.post("/api/queue/next", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });
      const now = new Date();

      // Complete whoever is currently serving/called
      let completed = null;
      const [currentlyServing] = await db
        .select()
        .from(waitlist)
        .where(
          and(
            sql`${waitlist.status} IN ('serving', 'called')`,
            eq(waitlist.storeId, storeId)
          )
        )
        .orderBy(waitlist.createdAt)
        .limit(1);

      if (currentlyServing) {
        [completed] = await db
          .update(waitlist)
          .set({ status: "completed", completedAt: now })
          .where(eq(waitlist.id, currentlyServing.id))
          .returning();
      }

      // Promote next waiting person to serving
      let serving = null;
      const [nextWaiting] = await db
        .select()
        .from(waitlist)
        .where(
          and(eq(waitlist.status, "waiting"), eq(waitlist.storeId, storeId))
        )
        .orderBy(waitlist.createdAt)
        .limit(1);

      if (nextWaiting) {
        [serving] = await db
          .update(waitlist)
          .set({ status: "serving", calledAt: now })
          .where(eq(waitlist.id, nextWaiting.id))
          .returning();
      }

      broadcastNotification({ type: "queue_updated", storeId });
      return res.json({ completed, serving });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to advance queue" });
    }
  });

  app.put("/api/waitlist/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const updates: any = {};
      if (req.body.status !== undefined) {
        updates.status = req.body.status;
        // Auto-stamp timestamps when status changes
        if (req.body.status === "called" || req.body.status === "serving") {
          updates.calledAt = new Date();
        } else if (req.body.status === "completed") {
          updates.completedAt = new Date();
        }
      }
      if (req.body.notifiedAt !== undefined) updates.notifiedAt = new Date(req.body.notifiedAt);
      if (req.body.staffId !== undefined) {
        const [existing] = await db.select().from(waitlist).where(eq(waitlist.id, id)).limit(1);
        if (!existing) return res.status(404).json({ message: "Waitlist entry not found" });
        const nextStaffId = req.body.staffId ? Number(req.body.staffId) : null;
        const nextServiceId = req.body.serviceId !== undefined ? Number(req.body.serviceId) : existing.serviceId;
        await assertTurnEligibleForWalkIn(existing.storeId, nextStaffId, nextServiceId);
        updates.staffId = nextStaffId;
      }
      if (req.body.serviceId !== undefined) updates.serviceId = req.body.serviceId ? Number(req.body.serviceId) : null;
      const [entry] = await db.update(waitlist).set(updates).where(eq(waitlist.id, id)).returning();
      if (entry?.storeId) broadcastNotification({ type: "queue_updated", storeId: entry.storeId });
      return res.json(entry);
    } catch (err) {
      console.error(err);
      return res.status((err as any).status || 500).json({ message: (err as any).message || "Failed to update waitlist entry" });
    }
  });

  app.delete("/api/waitlist/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const [existing] = await db.select({ storeId: waitlist.storeId }).from(waitlist).where(eq(waitlist.id, id)).limit(1);
      await db.delete(waitlist).where(eq(waitlist.id, id));
      if (existing?.storeId) broadcastNotification({ type: "queue_updated", storeId: existing.storeId });
      return res.json({ success: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to delete waitlist entry" });
    }
  });

  // === QUEUE SETTINGS ===

  app.get("/api/turn/settings", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const storeId = req.query.storeId ? Number(req.query.storeId) : null;
      if (!storeId) return res.status(400).json({ error: "storeId required" });
      const store = await assertOwnStore(userId, storeId);
      if (!store) return res.status(403).json({ error: "Unauthorized" });
      return res.json(await getTurnPreferences(storeId));
    } catch (err) {
      console.error("[turn] Failed to get settings:", err);
      return res.status(500).json({ error: "Failed to get turn settings" });
    }
  });

  app.put("/api/turn/settings", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const storeId = req.query.storeId ? Number(req.query.storeId) : null;
      if (!storeId) return res.status(400).json({ error: "storeId required" });
      const store = await assertOwnStore(userId, storeId);
      if (!store) return res.status(403).json({ error: "Unauthorized" });
      const settings = await saveTurnPreferences(storeId, {
        turnEnabled: req.body.turnEnabled !== false,
        autoAdvanceOnCheckout: req.body.autoAdvanceOnCheckout !== false,
        useClockInOrder: req.body.useClockInOrder !== false,
        allowManagerOverrides: req.body.allowManagerOverrides !== false,
        turnValueThreshold: req.body.turnValueThreshold,
        appointmentExclusionWindowMinutes: req.body.appointmentExclusionWindowMinutes,
      });
      broadcastTurnEligibilityChanged(storeId);
      return res.json(settings);
    } catch (err) {
      console.error("[turn] Failed to save settings:", err);
      return res.status(500).json({ error: "Failed to save turn settings" });
    }
  });

  app.get("/api/turn/eligibility", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const staffId = (req.session as any)?.staffId ? Number((req.session as any).staffId) : undefined;
      const storeId = req.query.storeId ? Number(req.query.storeId) : null;
      const serviceId = req.query.serviceId ? Number(req.query.serviceId) : null;
      if (!storeId) return res.status(400).json({ error: "storeId required" });
      const access = await assertStoreAccess(userId, staffId, storeId);
      if (!access) return res.status(403).json({ error: "Unauthorized" });
      return res.json(await getTurnEligibility(storeId, serviceId));
    } catch (err) {
      console.error("[turn] Failed to get eligibility:", err);
      return res.status(500).json({ error: "Failed to get turn eligibility" });
    }
  });

  // GET /api/turn/staff-history?storeId=X&staffId=Y
  // Returns today's completed appointments for a tech, ordered by time.
  // Used by the Turn popup drill-down when tapping a tech card.
  app.get("/api/turn/staff-history", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const sessionStaffId = (req.session as any)?.staffId ? Number((req.session as any).staffId) : undefined;
      const storeId = req.query.storeId ? Number(req.query.storeId) : null;
      const staffId = req.query.staffId ? Number(req.query.staffId) : null;
      if (!storeId || !staffId) return res.status(400).json({ error: "storeId and staffId required" });
      const access = await assertStoreAccess(userId, sessionStaffId, storeId);
      if (!access) return res.status(403).json({ error: "Unauthorized" });

      const rows = await db
        .select({
          id: appointments.id,
          date: appointments.date,
          status: appointments.status,
          totalPaid: appointments.totalPaid,
          serviceName: services.name,
        })
        .from(appointments)
        .leftJoin(services, eq(appointments.serviceId, services.id))
        .where(and(
          eq(appointments.storeId, storeId),
          eq(appointments.staffId, staffId),
          sql`${appointments.status} = 'completed'`,
          sql`date_trunc('day', ${appointments.date}) = current_date`
        ))
        .orderBy(asc(appointments.date));

      return res.json(rows.map((row, index) => ({
        turnNumber: index + 1,
        serviceName: row.serviceName ?? "Service",
        amount: parseFloat(row.totalPaid ?? "0"),
        timestamp: row.date,
      })));
    } catch (err) {
      console.error("[turn] Failed to get staff history:", err);
      return res.status(500).json({ error: "Failed to get staff history" });
    }
  });

  app.post("/api/turn/assign-walkin", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const staffId = (req.session as any)?.staffId ? Number((req.session as any).staffId) : undefined;
      const storeId = req.body.storeId ? Number(req.body.storeId) : null;
      const serviceId = req.body.serviceId ? Number(req.body.serviceId) : null;
      const requestedStaffId = req.body.staffId ? Number(req.body.staffId) : null;
      if (!storeId) return res.status(400).json({ error: "storeId required" });
      const access = await assertStoreAccess(userId, staffId, storeId);
      if (!access) return res.status(403).json({ error: "Unauthorized" });

      const eligibility = await getTurnEligibility(storeId, serviceId);
      const selected = requestedStaffId
        ? eligibility.eligibleTechnicians.find((tech) => tech.id === requestedStaffId)
        : eligibility.eligibleTechnicians[0];
      if (!selected) {
        return res.status(409).json({ error: "No technician is eligible for this walk-in right now." });
      }
      // Standard turn (no specific tech requested): Consideration Lock.
      // Remove tech from the active queue entirely while they serve — Index 1 slides up to Index 0.
      // Tech re-enters the queue at checkout (unshift for short turn, push for standard turn).
      // Request bypass: the tech keeps their existing position (no lock).
      const isRequestBypass = !!requestedStaffId;
      if (!isRequestBypass) {
        const freshPrefs = await getTurnPreferences(storeId);
        const deque: number[] = Array.isArray(freshPrefs.dequeOrder)
          ? (freshPrefs.dequeOrder as any[]).map(Number)
          : [];
        const lockedIds: number[] = Array.isArray(freshPrefs.lockedStaffIds)
          ? (freshPrefs.lockedStaffIds as any[]).map(Number).filter(Number.isFinite)
          : [];
        const updates: Record<string, any> = {
          dequeOrder: deque.filter((id) => id !== selected.id),
          lockedStaffIds: [...new Set([...lockedIds, selected.id])],
        };
        // Clear short-turn protection when the protected tech accepts their next client
        if ((freshPrefs.shortTurnProtectedId as any) === selected.id) {
          updates.shortTurnProtectedId = null;
        }
        await saveTurnPreferences(storeId, updates);
        broadcastTurnEligibilityChanged(storeId);
        console.log(`[turn] Consideration Lock: staff ${selected.id} removed from active queue (serving)`);
      }

      // Log the assignment for favoritism monitoring
      const appointmentId = req.body.appointmentId ? Number(req.body.appointmentId) : null;
      const recommendedTech = eligibility.eligibleTechnicians[0];
      try {
        await db.insert(turnAssignmentLog).values({
          storeId,
          appointmentId: appointmentId || null,
          assignedStaffId: selected.id,
          turnRecommendedStaffId: recommendedTech?.id ?? null,
          isOverride: isRequestBypass && selected.id !== recommendedTech?.id,
          bookedByUserId: userId ? Number(userId) : null,
          source: isRequestBypass ? "walkin_fallback" : "turn_system",
        });
      } catch (logErr) {
        console.error("[turn] Failed to write assignment log:", logErr);
      }

      // Fire-and-forget: give the Smart Booking Engine a chance to immediately
      // detect and resolve any conflict the new walk-in creates for this technician's
      // upcoming scheduled appointments — without waiting for the 5-minute cycle.
      import("./services/smart-booking-reassignment").then(({ runEngineForStaff }) => {
        runEngineForStaff(storeId, selected.id).catch(() => {});
      }).catch(() => {});

      return res.json({ technician: selected, eligibility, dequeAdvanced: !isRequestBypass });
    } catch (err: any) {
      console.error("[turn] Failed to assign walk-in:", err);
      return res.status(err.status || 500).json({ error: err.message || "Failed to assign walk-in" });
    }
  });

  // POST /api/turn/log-override — called when front desk clicks a specific tech's calendar slot
  // instead of using the Walk-In button (i.e. bypassing the Turn queue deliberately).
  app.post("/api/turn/log-override", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const storeId = req.body.storeId ? Number(req.body.storeId) : null;
      if (!storeId) return res.status(400).json({ error: "storeId required" });
      const store = await assertOwnStore(userId, storeId);
      if (!store) return res.status(403).json({ error: "Unauthorized" });

      const assignedStaffId = req.body.assignedStaffId ? Number(req.body.assignedStaffId) : null;
      if (!assignedStaffId) return res.status(400).json({ error: "assignedStaffId required" });

      const appointmentId = req.body.appointmentId ? Number(req.body.appointmentId) : null;
      const turnRecommendedStaffId = req.body.turnRecommendedStaffId
        ? Number(req.body.turnRecommendedStaffId)
        : null;
      const isOverride = turnRecommendedStaffId !== null && assignedStaffId !== turnRecommendedStaffId;

      await db.insert(turnAssignmentLog).values({
        storeId,
        appointmentId: appointmentId || null,
        assignedStaffId,
        turnRecommendedStaffId: turnRecommendedStaffId || null,
        isOverride,
        source: "calendar_override",
      });

      console.log(`[turn] Override logged: user ${userId} booked staff ${assignedStaffId} (Turn recommended: ${turnRecommendedStaffId}, override=${isOverride})`);
      return res.json({ logged: true, isOverride });
    } catch (err: any) {
      console.error("[turn] Failed to log override:", err);
      return res.status(500).json({ error: "Failed to log override" });
    }
  });

  // GET /api/turn/favoritism-report?storeId=X — aggregated favoritism analysis for management.
  // Returns per-user patterns showing which front-desk staff repeatedly book the same tech
  // instead of following the Turn queue.
  app.get("/api/turn/favoritism-report", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const storeId = req.query.storeId ? Number(req.query.storeId) : null;
      if (!storeId) return res.status(400).json({ error: "storeId required" });
      const store = await assertOwnStore(userId, storeId);
      if (!store) return res.status(403).json({ error: "Unauthorized" });

      const days = req.query.days ? Number(req.query.days) : 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // All assignments for the window
      const allLogs = await db
        .select()
        .from(turnAssignmentLog)
        .where(
          and(
            eq(turnAssignmentLog.storeId, storeId),
            gte(turnAssignmentLog.createdAt, since)
          )
        )
        .orderBy(desc(turnAssignmentLog.createdAt));

      // Per (bookedByUserId, assignedStaffId) override count
      const overrideMap: Record<string, { bookedByUserId: number | null; assignedStaffId: number; overrideCount: number; totalBookings: number; lastSeen: Date }> = {};
      for (const row of allLogs) {
        const key = `${row.bookedByUserId}::${row.assignedStaffId}`;
        if (!overrideMap[key]) {
          overrideMap[key] = { bookedByUserId: row.bookedByUserId, assignedStaffId: row.assignedStaffId, overrideCount: 0, totalBookings: 0, lastSeen: row.createdAt };
        }
        overrideMap[key].totalBookings++;
        if (row.isOverride) overrideMap[key].overrideCount++;
        if (row.createdAt > overrideMap[key].lastSeen) overrideMap[key].lastSeen = row.createdAt;
      }

      // Enrich with staff/user names
      const staffIds = [...new Set(allLogs.map((r) => r.assignedStaffId))];
      const userIds = [...new Set(allLogs.map((r) => r.bookedByUserId).filter(Boolean).map(String))];

      const [staffRows, userRows] = await Promise.all([
        staffIds.length ? db.select({ id: staff.id, name: staff.name }).from(staff).where(inArray(staff.id, staffIds)) : [],
        userIds.length
          ? db
              .select({ id: users.id, name: users.firstName, email: users.email })
              .from(users)
              .where(inArray(users.id, userIds))
          : [],
      ]);

      const staffMap = Object.fromEntries(staffRows.map((s) => [s.id, s.name]));
      const userMap = Object.fromEntries(userRows.map((u) => [u.id, { name: u.name, email: u.email }]));

      const FAVORITISM_THRESHOLD = 3; // flag if same user booked same tech 3+ override times
      const patterns = Object.values(overrideMap)
        .filter((p) => p.overrideCount > 0)
        .map((p) => ({
          ...p,
          assignedStaffName: staffMap[p.assignedStaffId] ?? `Staff #${p.assignedStaffId}`,
          bookedByUserName: p.bookedByUserId ? (userMap[p.bookedByUserId]?.name ?? `User #${p.bookedByUserId}`) : "Unknown",
          bookedByUserEmail: p.bookedByUserId ? (userMap[p.bookedByUserId]?.email ?? null) : null,
          flagged: p.overrideCount >= FAVORITISM_THRESHOLD,
        }))
        .sort((a, b) => b.overrideCount - a.overrideCount);

      return res.json({
        windowDays: days,
        since: since.toISOString(),
        totalAssignments: allLogs.length,
        totalOverrides: allLogs.filter((r) => r.isOverride).length,
        patterns,
        flaggedCount: patterns.filter((p) => p.flagged).length,
      });
    } catch (err: any) {
      console.error("[turn] Failed to generate favoritism report:", err);
      return res.status(500).json({ error: "Failed to generate favoritism report" });
    }
  });

  // === TIME CLOCK (Staff Clock In / Out) ===

  // GET /api/timeclock/pins?storeId=X — list PIN status for all staff in a store
  app.get("/api/timeclock/pins", isAuthenticated, async (req, res) => {
    try {
      const storeId = req.query.storeId ? Number(req.query.storeId) : null;
      if (!storeId) return res.status(400).json({ error: "storeId required" });
      const rows = await db
        .select({ staffId: staffPins.staffId })
        .from(staffPins)
        .where(eq(staffPins.storeId, storeId));
      return res.json({ pins: rows.map(r => r.staffId) });
    } catch (err) {
      console.error("[timeclock] Failed to list PINs:", err);
      return res.status(500).json({ error: "Failed to list PINs" });
    }
  });

  // GET /api/timeclock/pin/:staffId?storeId=X — get PIN for one staff member
  app.get("/api/timeclock/pin/:staffId", isAuthenticated, async (req, res) => {
    try {
      const staffId = parseInt(req.params.staffId as string);
      const storeId = req.query.storeId ? Number(req.query.storeId) : null;
      if (!storeId) return res.status(400).json({ error: "storeId required" });
      const [record] = await db
        .select({ pin: staffPins.pin })
        .from(staffPins)
        .where(and(eq(staffPins.staffId, staffId), eq(staffPins.storeId, storeId)))
        .limit(1);
      return res.json({ pin: record?.pin ?? null, hasPin: !!record });
    } catch (err) {
      console.error("[timeclock] Failed to get PIN:", err);
      return res.status(500).json({ error: "Failed to get PIN" });
    }
  });

  // POST /api/timeclock/pin — set or update PIN for a staff member
  app.post("/api/timeclock/pin", isAuthenticated, async (req, res) => {
    try {
      const { staffId, storeId, pin } = req.body;
      if (!staffId || !storeId) return res.status(400).json({ error: "staffId and storeId required" });
      if (!pin || !/^\d{4}$/.test(String(pin))) {
        return res.status(400).json({ error: "PIN must be exactly 4 numeric digits" });
      }
      // Check if PIN is already used by another staff member in this store
      const [conflict] = await db
        .select({ staffId: staffPins.staffId })
        .from(staffPins)
        .where(and(eq(staffPins.storeId, Number(storeId)), eq(staffPins.pin, String(pin))))
        .limit(1);
      if (conflict && conflict.staffId !== Number(staffId)) {
        return res.status(409).json({ error: "This PIN is already in use by another staff member" });
      }
      await db
        .insert(staffPins)
        .values({ staffId: Number(staffId), storeId: Number(storeId), pin: String(pin), updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [staffPins.staffId, staffPins.storeId],
          set: { pin: String(pin), updatedAt: new Date() },
        });
      return res.json({ success: true });
    } catch (err) {
      console.error("[timeclock] Failed to set PIN:", err);
      return res.status(500).json({ error: "Failed to set PIN" });
    }
  });

  // DELETE /api/timeclock/pin/:staffId — remove PIN for a staff member
  app.delete("/api/timeclock/pin/:staffId", isAuthenticated, async (req, res) => {
    try {
      const staffId = parseInt(req.params.staffId as string);
      const storeId = req.query.storeId ? Number(req.query.storeId) : (req.body?.storeId ? Number(req.body.storeId) : null);
      if (!storeId) return res.status(400).json({ error: "storeId required" });
      await db
        .delete(staffPins)
        .where(and(eq(staffPins.staffId, staffId), eq(staffPins.storeId, storeId)));
      return res.json({ success: true });
    } catch (err) {
      console.error("[timeclock] Failed to remove PIN:", err);
      return res.status(500).json({ error: "Failed to remove PIN" });
    }
  });

  app.post("/api/timeclock/verify-pin", isAuthenticated, async (req, res) => {
    try {
      const storeId = req.body.storeId ? Number(req.body.storeId) : null;
      const pin = req.body.pin ? String(req.body.pin).trim() : null;
      if (!storeId) return res.status(400).json({ error: "storeId required" });
      if (!pin || !/^\d{3,4}$/.test(pin)) {
        return res.status(400).json({ error: "PIN must be 3 or 4 numeric digits" });
      }

      const [match] = await db
        .select({
          id: staff.id,
          name: staff.name,
          color: staff.color,
          avatarUrl: staff.avatarUrl,
        })
        .from(staffPins)
        .innerJoin(staff, eq(staffPins.staffId, staff.id))
        .where(and(eq(staffPins.storeId, storeId), eq(staffPins.pin, pin)))
        .limit(1);

      if (!match) {
        return res.status(404).json({ error: "Invalid PIN" });
      }
      return res.json({ staff: match });
    } catch (err) {
      console.error("[timeclock] Failed to verify PIN:", err);
      return res.status(500).json({ error: "Failed to verify PIN" });
    }
  });

  app.get("/api/timeclock/status/:staffId", isAuthenticated, async (req, res) => {
    try {
      const staffId = parseInt(req.params.staffId as string);
      const storeId = req.query.storeId ? Number(req.query.storeId) : null;
      if (!storeId) return res.status(400).json({ error: "storeId required" });

      const [tzRow] = await db.select({ timezone: locations.timezone }).from(locations).where(eq(locations.id, storeId)).limit(1);
      const storeTz = (tzRow as any)?.timezone ?? "UTC";
      const localNow = toZonedTime(new Date(), storeTz);
      const today = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, "0")}-${String(localNow.getDate()).padStart(2, "0")}`;

      const [record] = await db
        .select()
        .from(timeclock)
        .where(and(
          eq(timeclock.staffId, staffId),
          eq(timeclock.storeId, storeId),
          eq(timeclock.workDate, today)
        ))
        .orderBy(desc(timeclock.clockIn))
        .limit(1);

      if (!record) {
        return res.json({ clockedIn: false, record: null });
      }

      return res.json({
        clockedIn: !record.clockOut,
        record: {
          id: record.id,
          staffId: record.staffId,
          clockIn: record.clockIn,
          clockOut: record.clockOut,
        },
      });
    } catch (err) {
      console.error("[timeclock] Failed to get status:", err);
      return res.status(500).json({ error: "Failed to get clock status" });
    }
  });

  app.post("/api/timeclock/clock-in", isAuthenticated, async (req, res) => {
    try {
      const storeId = req.body.storeId ? Number(req.body.storeId) : null;
      const staffId = req.body.staffId ? Number(req.body.staffId) : null;
      if (!storeId || !staffId) return res.status(400).json({ error: "storeId and staffId required" });

      const [tzRowIn] = await db.select({ timezone: locations.timezone }).from(locations).where(eq(locations.id, storeId)).limit(1);
      const storeTzIn = (tzRowIn as any)?.timezone ?? "UTC";
      const localNowIn = toZonedTime(new Date(), storeTzIn);
      const today = (req.body.workDate as string) || `${localNowIn.getFullYear()}-${String(localNowIn.getMonth() + 1).padStart(2, "0")}-${String(localNowIn.getDate()).padStart(2, "0")}`;

      // Check if already clocked in today
      const [existing] = await db
        .select()
        .from(timeclock)
        .where(and(
          eq(timeclock.staffId, staffId),
          eq(timeclock.storeId, storeId),
          eq(timeclock.workDate, today),
          isNull(timeclock.clockOut)
        ))
        .limit(1);

      if (existing) {
        return res.status(409).json({ error: "Already clocked in", record: existing });
      }

      const [record] = await db
        .insert(timeclock)
        .values({
          staffId,
          storeId,
          workDate: today,
          clockIn: new Date(),
        })
        .returning();

      // Update turn system settings — add to clocked-in list
      const turnPrefs = await getTurnPreferences(storeId);
      const clockedIn = Array.isArray(turnPrefs.clockedInStaffIds) ? [...turnPrefs.clockedInStaffIds] : [];
      if (!clockedIn.includes(staffId)) clockedIn.push(staffId);
      const clockedOut = Array.isArray(turnPrefs.clockedOutStaffIds)
        ? turnPrefs.clockedOutStaffIds.filter((id: number) => Number(id) !== staffId)
        : [];
      await saveTurnPreferences(storeId, { clockedInStaffIds: clockedIn, clockedOutStaffIds: clockedOut });
      broadcastTurnEligibilityChanged(storeId);

      // Log clock-in to activity feed (fire-and-forget)
      void db.select({ name: staff.name }).from(staff).where(eq(staff.id, staffId)).limit(1)
        .then(([s]) => logActivityEvent({
          storeId,
          eventType: "staff_clocked_in",
          message: s?.name ? `${s.name} clocked in` : "Staff member clocked in",
          metadata: { staffId, staffName: s?.name ?? null, workDate: today },
        }))
        .catch(() => {});

      triggerDashboardBroadcast(storeId);
      return res.json({ record });
    } catch (err) {
      console.error("[timeclock] Failed to clock in:", err);
      return res.status(500).json({ error: "Failed to clock in" });
    }
  });

  app.post("/api/timeclock/clock-out", isAuthenticated, async (req, res) => {
    try {
      const storeId = req.body.storeId ? Number(req.body.storeId) : null;
      const staffId = req.body.staffId ? Number(req.body.staffId) : null;
      if (!storeId || !staffId) return res.status(400).json({ error: "storeId and staffId required" });

      const [tzRowOut] = await db.select({ timezone: locations.timezone }).from(locations).where(eq(locations.id, storeId)).limit(1);
      const storeTzOut = (tzRowOut as any)?.timezone ?? "UTC";
      const localNowOut = toZonedTime(new Date(), storeTzOut);
      const today = (req.body.workDate as string) || `${localNowOut.getFullYear()}-${String(localNowOut.getMonth() + 1).padStart(2, "0")}-${String(localNowOut.getDate()).padStart(2, "0")}`;

      // Find open clock-in record for today
      const [existing] = await db
        .select()
        .from(timeclock)
        .where(and(
          eq(timeclock.staffId, staffId),
          eq(timeclock.storeId, storeId),
          eq(timeclock.workDate, today),
          isNull(timeclock.clockOut)
        ))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: "No active clock-in found" });
      }

      const [record] = await db
        .update(timeclock)
        .set({ clockOut: new Date() })
        .where(eq(timeclock.id, existing.id))
        .returning();

      // Update turn system settings — remove from clocked-in, add to clocked-out
      const turnPrefs = await getTurnPreferences(storeId);
      const clockedIn = Array.isArray(turnPrefs.clockedInStaffIds)
        ? turnPrefs.clockedInStaffIds.filter((id: number) => Number(id) !== staffId)
        : [];
      const clockedOut = Array.isArray(turnPrefs.clockedOutStaffIds)
        ? [...turnPrefs.clockedOutStaffIds]
        : [];
      if (!clockedOut.includes(staffId)) clockedOut.push(staffId);
      await saveTurnPreferences(storeId, { clockedInStaffIds: clockedIn, clockedOutStaffIds: clockedOut });
      broadcastTurnEligibilityChanged(storeId);

      // Log clock-out to activity feed (fire-and-forget)
      void db.select({ name: staff.name }).from(staff).where(eq(staff.id, staffId)).limit(1)
        .then(([s]) => logActivityEvent({
          storeId,
          eventType: "staff_clocked_out",
          message: s?.name ? `${s.name} clocked out` : "Staff member clocked out",
          metadata: { staffId, staffName: s?.name ?? null, workDate: today },
        }))
        .catch(() => {});

      triggerDashboardBroadcast(storeId);
      return res.json({ record });
    } catch (err) {
      console.error("[timeclock] Failed to clock out:", err);
      return res.status(500).json({ error: "Failed to clock out" });
    }
  });

  // GET /api/timeclock/records?storeId=X&startDate=Y&endDate=Z
  app.get("/api/timeclock/records", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const storeId = req.query.storeId ? Number(req.query.storeId) : null;
      if (!storeId) return res.status(400).json({ error: "storeId required" });
      const [store] = await db.select().from(locations).where(and(eq(locations.id, storeId), eq(locations.userId, userId))).limit(1);
      if (!store) return res.status(403).json({ error: "Unauthorized" });
      const startDate = (req.query.startDate as string) || new Date().toISOString().split("T")[0];
      const endDate = (req.query.endDate as string) || startDate;
      const records = await db
        .select({
          id: timeclock.id,
          staffId: timeclock.staffId,
          staffName: staff.name,
          staffAvatarUrl: staff.avatarUrl,
          clockIn: timeclock.clockIn,
          clockOut: timeclock.clockOut,
          workDate: timeclock.workDate,
          createdAt: timeclock.createdAt,
        })
        .from(timeclock)
        .innerJoin(staff, eq(timeclock.staffId, staff.id))
        .where(and(
          eq(timeclock.storeId, storeId),
          gte(timeclock.workDate, startDate),
          sql`${timeclock.workDate} <= ${endDate}`,
        ))
        .orderBy(asc(timeclock.workDate), asc(timeclock.clockIn));
      return res.json(records);
    } catch (err) {
      console.error("[timeclock] Failed to get records:", err);
      return res.status(500).json({ error: "Failed to get records" });
    }
  });

  // POST /api/timeclock/records — manual entry
  app.post("/api/timeclock/records", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const { storeId, staffId, workDate, clockIn, clockOut } = req.body;
      if (!storeId || !staffId || !workDate || !clockIn) return res.status(400).json({ error: "storeId, staffId, workDate, clockIn required" });
      const [store] = await db.select().from(locations).where(and(eq(locations.id, Number(storeId)), eq(locations.userId, userId))).limit(1);
      if (!store) return res.status(403).json({ error: "Unauthorized" });
      const [record] = await db.insert(timeclock).values({
        staffId: Number(staffId),
        storeId: Number(storeId),
        workDate,
        clockIn: new Date(clockIn),
        clockOut: clockOut ? new Date(clockOut) : null,
      }).returning();
      return res.json({ record });
    } catch (err) {
      console.error("[timeclock] Failed to create record:", err);
      return res.status(500).json({ error: "Failed to create record" });
    }
  });

  // PATCH /api/timeclock/records/:id — edit entry
  app.patch("/api/timeclock/records/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const recordId = Number(req.params.id);
      const { clockIn, clockOut } = req.body;
      const [existing] = await db.select().from(timeclock).where(eq(timeclock.id, recordId)).limit(1);
      if (!existing) return res.status(404).json({ error: "Record not found" });
      const [store] = await db.select().from(locations).where(and(eq(locations.id, existing.storeId), eq(locations.userId, userId))).limit(1);
      if (!store) return res.status(403).json({ error: "Unauthorized" });
      const updates: Record<string, Date | null> = {};
      if (clockIn !== undefined) updates.clockIn = new Date(clockIn);
      if (clockOut !== undefined) updates.clockOut = clockOut ? new Date(clockOut) : null;
      const [record] = await db.update(timeclock).set(updates).where(eq(timeclock.id, recordId)).returning();
      return res.json({ record });
    } catch (err) {
      console.error("[timeclock] Failed to update record:", err);
      return res.status(500).json({ error: "Failed to update record" });
    }
  });

  // DELETE /api/timeclock/records/:id
  app.delete("/api/timeclock/records/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const recordId = Number(req.params.id);
      const [existing] = await db.select().from(timeclock).where(eq(timeclock.id, recordId)).limit(1);
      if (!existing) return res.status(404).json({ error: "Record not found" });
      const [store] = await db.select().from(locations).where(and(eq(locations.id, existing.storeId), eq(locations.userId, userId))).limit(1);
      if (!store) return res.status(403).json({ error: "Unauthorized" });
      await db.delete(timeclock).where(eq(timeclock.id, recordId));
      return res.json({ success: true });
    } catch (err) {
      console.error("[timeclock] Failed to delete record:", err);
      return res.status(500).json({ error: "Failed to delete record" });
    }
  });

  app.get("/api/queue/settings", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const storeId = req.query.storeId ? Number(req.query.storeId) : null;
      if (!storeId) return res.status(400).json({ error: "storeId required" });
      const storeRows = await db.select().from(locations).where(and(eq(locations.id, storeId), eq(locations.userId, userId)));
      if (!storeRows.length) return res.status(403).json({ error: "Unauthorized" });
      const store = storeRows[0];
      const [row] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, storeId));
      const prefs = row?.preferences ? JSON.parse(row.preferences as string) : {};
      return res.json({
        queueEnabled: prefs.queueEnabled !== false,
        queueAvgServiceTime: prefs.queueAvgServiceTime || 20,
        queueMaxSize: prefs.queueMaxSize || 30,
        smsTravelBuffer: prefs.smsTravelBuffer ?? 5,
        storeLatitude: store.storeLatitude || null,
        storeLongitude: store.storeLongitude || null,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to get queue settings" });
    }
  });

  app.put("/api/queue/settings", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const storeId = req.query.storeId ? Number(req.query.storeId) : null;
      if (!storeId) return res.status(400).json({ error: "storeId required" });
      const storeRows = await db.select().from(locations).where(and(eq(locations.id, storeId), eq(locations.userId, userId)));
      if (!storeRows.length) return res.status(403).json({ error: "Unauthorized" });
      const [existing] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, storeId));
      const currentPrefs = existing?.preferences ? JSON.parse(existing.preferences as string) : {};
      const { queueEnabled, queueAvgServiceTime, queueMaxSize, smsTravelBuffer, storeLatitude, storeLongitude } = req.body;
      const newPrefs = {
        ...currentPrefs,
        ...(queueEnabled !== undefined ? { queueEnabled } : {}),
        ...(queueAvgServiceTime !== undefined ? { queueAvgServiceTime } : {}),
        ...(queueMaxSize !== undefined ? { queueMaxSize } : {}),
        ...(smsTravelBuffer !== undefined ? { smsTravelBuffer } : {}),
      };
      if (existing) {
        await db.update(storeSettings).set({ preferences: JSON.stringify(newPrefs) }).where(eq(storeSettings.storeId, storeId));
      } else {
        await db.insert(storeSettings).values({ storeId, preferences: JSON.stringify(newPrefs) });
      }
      // Save store lat/lng directly on the locations table
      if (storeLatitude !== undefined || storeLongitude !== undefined) {
        const locationUpdates: any = {};
        if (storeLatitude !== undefined) locationUpdates.storeLatitude = storeLatitude ? String(storeLatitude) : null;
        if (storeLongitude !== undefined) locationUpdates.storeLongitude = storeLongitude ? String(storeLongitude) : null;
        await db.update(locations).set(locationUpdates).where(eq(locations.id, storeId));
      }
      return res.json({ success: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to save queue settings" });
    }
  });

  // ============================================================
  // GIFT CARD ROUTES
  // ============================================================

  const generateGiftCardCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "GC-";
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  };

  app.get("/api/gift-cards", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const userStore = await db.select().from(locations).where(eq(locations.userId, userId)).limit(1);
      if (!userStore.length) return res.status(404).json({ message: "Store not found" });
      const cards = await db.select().from(giftCards).where(eq(giftCards.storeId, userStore[0].id)).orderBy(desc(giftCards.createdAt));
      return res.json(cards);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to fetch gift cards" });
    }
  });

  app.post("/api/gift-cards", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const userStore = await db.select().from(locations).where(eq(locations.userId, userId)).limit(1);
      if (!userStore.length) return res.status(404).json({ message: "Store not found" });
      const storeId = userStore[0].id;

      const { amount, issuedToName, issuedToEmail, expiresAt, notes } = req.body;
      const code = generateGiftCardCode();

      const [card] = await db.insert(giftCards).values({
        storeId,
        code,
        originalAmount: amount.toString(),
        remainingBalance: amount.toString(),
        issuedToName,
        issuedToEmail,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        notes,
        isActive: true,
      }).returning();

      // GBP Post Engine: enqueue a "gift cards available" post candidate (fire-and-forget)
      // The topic hash uses a stable key so only one post is generated even if multiple cards are created
      triggerGBPPostEvent(storeId, "gift_cards_enabled", { entityId: `store:${storeId}` });

      return res.json(card);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to create gift card" });
    }
  });

  app.get("/api/gift-cards/check/:code", async (req, res) => {
    try {
      const [card] = await db.select().from(giftCards).where(eq(giftCards.code, req.params.code));
      if (!card) return res.status(404).json({ message: "Gift card not found" });
      return res.json(card);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to check gift card" });
    }
  });

  app.post("/api/gift-cards/redeem", isAuthenticated, async (req, res) => {
    try {
      const { code, amount } = req.body;
      const [card] = await db.select().from(giftCards).where(eq(giftCards.code, code));
      if (!card) return res.status(404).json({ message: "Gift card not found" });
      if (!card.isActive) return res.status(400).json({ message: "Gift card is not active" });

      const remaining = parseFloat(card.remainingBalance);
      const redeem = parseFloat(amount);
      if (redeem > remaining) return res.status(400).json({ message: "Insufficient balance" });

      const newBalance = (remaining - redeem).toFixed(2);
      const [updated] = await db.update(giftCards)
        .set({ remainingBalance: newBalance, isActive: parseFloat(newBalance) > 0 })
        .where(eq(giftCards.id, card.id))
        .returning();

      await db.insert(giftCardTransactions).values({
        giftCardId: card.id,
        storeId: card.storeId,
        amount: redeem.toString(),
        type: "redemption",
        balanceAfter: newBalance,
      });

      return res.json(updated);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to redeem gift card" });
    }
  });

  app.put("/api/gift-cards/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const [updated] = await db.update(giftCards).set(req.body).where(eq(giftCards.id, id)).returning();
      return res.json(updated);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to update gift card" });
    }
  });

  // ============================================================
  // GIFT CARD ANALYTICS
  // ============================================================

  app.get("/api/gift-cards/analytics", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const userStore = await db.select({ id: locations.id }).from(locations).where(eq(locations.userId, userId)).limit(1);
      if (!userStore.length) return res.status(404).json({ message: "Store not found" });
      const storeId = userStore[0].id;

      const allCards = await db.select().from(giftCards).where(eq(giftCards.storeId, storeId));
      const activeCards = allCards.filter(c => c.isActive);

      const totalIssued = allCards.reduce((sum, c) => sum + parseFloat(c.originalAmount || "0"), 0);
      const totalOutstanding = activeCards.reduce((sum, c) => sum + parseFloat(c.remainingBalance || "0"), 0);
      const totalAllRemaining = allCards.reduce((sum, c) => sum + parseFloat(c.remainingBalance || "0"), 0);
      const totalRedeemed = Math.max(0, totalIssued - totalAllRemaining);

      // Monthly trend — last 6 months
      const now = new Date();
      const monthlyTrend = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth();
        const monthCards = allCards.filter(c => {
          const created = new Date(c.createdAt || "");
          return created.getFullYear() === y && created.getMonth() === m;
        });
        monthlyTrend.push({
          month: d.toLocaleString("en-US", { month: "short" }),
          issued: monthCards.length,
          value: monthCards.reduce((s, c) => s + parseFloat(c.originalAmount || "0"), 0),
        });
      }

      // Expiring within 60 days
      const sixtyDaysOut = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      const expiringSoon = activeCards.filter(c => c.expiresAt && new Date(c.expiresAt) <= sixtyDaysOut).length;

      return res.json({
        totalCards: allCards.length,
        activeCards: activeCards.length,
        expiredOrDeactivated: allCards.length - activeCards.length,
        expiringSoon,
        totalIssued: totalIssued.toFixed(2),
        totalOutstanding: totalOutstanding.toFixed(2),
        totalRedeemed: totalRedeemed.toFixed(2),
        redemptionRate: totalIssued > 0 ? ((totalRedeemed / totalIssued) * 100).toFixed(1) : "0.0",
        avgCardValue: allCards.length > 0 ? (totalIssued / allCards.length).toFixed(2) : "0.00",
        monthlyTrend,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to fetch gift card analytics" });
    }
  });

  // ============================================================
  // BOOKING POLICIES
  // ============================================================

  app.get("/api/booking-policies", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const userStore = await db.select().from(locations).where(eq(locations.userId, userId)).limit(1);
      if (!userStore.length) return res.status(404).json({ message: "Store not found" });
      const store = userStore[0];

      const calSettings = await db.select({ autoMarkNoShows: calendarSettings.autoMarkNoShows })
        .from(calendarSettings).where(eq(calendarSettings.storeId, store.id)).limit(1);

      return res.json({
        cancellationHoursCutoff: store.cancellationHoursCutoff ?? 24,
        lateGracePeriodMinutes: store.lateGracePeriodMinutes ?? 10,
        autoMarkNoShows: calSettings[0]?.autoMarkNoShows ?? false,
        bookingPaymentPolicy: (store as any).bookingPaymentPolicy ?? "none",
        depositType: (store as any).depositType ?? null,
        depositValue: (store as any).depositValue ? Number((store as any).depositValue) : null,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to fetch booking policies" });
    }
  });

  app.put("/api/booking-policies", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const userStore = await db.select({ id: locations.id }).from(locations).where(eq(locations.userId, userId)).limit(1);
      if (!userStore.length) return res.status(404).json({ message: "Store not found" });
      const storeId = userStore[0].id;

      const {
        cancellationHoursCutoff, lateGracePeriodMinutes, autoMarkNoShows,
        bookingPaymentPolicy, depositType, depositValue,
      } = req.body;

      // ── Server-side validation ────────────────────────────────────────────────
      const VALID_POLICIES = ["none", "card_on_file", "deposit"];
      const VALID_DEPOSIT_TYPES = ["percentage", "fixed"];

      if (bookingPaymentPolicy !== undefined && !VALID_POLICIES.includes(bookingPaymentPolicy)) {
        return res.status(400).json({ message: "Invalid bookingPaymentPolicy value" });
      }
      if (depositType !== undefined && depositType !== null && !VALID_DEPOSIT_TYPES.includes(depositType)) {
        return res.status(400).json({ message: "Invalid depositType value" });
      }
      if (depositValue !== undefined && depositValue !== null) {
        const dv = Number(depositValue);
        if (!isFinite(dv) || dv <= 0) {
          return res.status(400).json({ message: "depositValue must be a positive number" });
        }
        if (depositType === "percentage" && (dv < 1 || dv > 100)) {
          return res.status(400).json({ message: "Percentage deposit must be between 1 and 100" });
        }
        if (depositType === "fixed" && dv > 999) {
          return res.status(400).json({ message: "Fixed deposit must be 999 or less" });
        }
      }
      // ─────────────────────────────────────────────────────────────────────────

      const locationUpdates: Record<string, any> = {};
      if (cancellationHoursCutoff !== undefined) locationUpdates.cancellationHoursCutoff = parseInt(cancellationHoursCutoff);
      if (lateGracePeriodMinutes !== undefined) locationUpdates.lateGracePeriodMinutes = parseInt(lateGracePeriodMinutes);
      if (bookingPaymentPolicy !== undefined) locationUpdates.bookingPaymentPolicy = bookingPaymentPolicy;
      if (depositType !== undefined) locationUpdates.depositType = depositType ?? null;
      if (depositValue !== undefined) locationUpdates.depositValue = depositValue != null ? String(Number(depositValue)) : null;
      if (Object.keys(locationUpdates).length) {
        await db.update(locations).set(locationUpdates).where(eq(locations.id, storeId));
      }

      if (autoMarkNoShows !== undefined) {
        const existing = await db.select({ id: calendarSettings.id }).from(calendarSettings)
          .where(eq(calendarSettings.storeId, storeId)).limit(1);
        if (existing.length) {
          await db.update(calendarSettings).set({ autoMarkNoShows: Boolean(autoMarkNoShows) })
            .where(eq(calendarSettings.storeId, storeId));
        } else {
          await db.insert(calendarSettings).values({ storeId, autoMarkNoShows: Boolean(autoMarkNoShows) } as any);
        }
      }

      return res.json({ success: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to update booking policies" });
    }
  });

  // ============================================================
  // AT-RISK CLIENTS
  // ============================================================

  app.get("/api/clients/at-risk", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const userStore = await db.select({ id: locations.id }).from(locations).where(eq(locations.userId, userId)).limit(1);
      if (!userStore.length) return res.status(404).json({ message: "Store not found" });
      const storeId = userStore[0].id;

      const daysSince = parseInt(req.query.daysSince as string || "60");
      const cutoff = new Date(Date.now() - daysSince * 24 * 60 * 60 * 1000);

      const storeClients = await db.select({
        id: clients.id,
        fullName: clients.fullName,
        totalSpentCents: clients.totalSpentCents,
        totalVisits: clients.totalVisits,
        lastVisitAt: clients.lastVisitAt,
        createdAt: clients.createdAt,
      }).from(clients)
        .where(and(eq(clients.storeId, storeId), isNull(clients.archivedAt)));

      const atRisk = storeClients
        .filter(c => {
          const lastVisit = c.lastVisitAt ? new Date(c.lastVisitAt) : null;
          if (!lastVisit) {
            // Never visited — only flag if added before cutoff
            return new Date(c.createdAt || "") < cutoff;
          }
          return lastVisit < cutoff;
        })
        .map(c => {
          const lastVisit = c.lastVisitAt ? new Date(c.lastVisitAt) : null;
          const daysSinceLast = lastVisit
            ? Math.floor((Date.now() - lastVisit.getTime()) / (1000 * 60 * 60 * 24))
            : null;
          return { ...c, daysSinceLast, totalSpent: (c.totalSpentCents / 100).toFixed(2) };
        })
        .sort((a, b) => (b.daysSinceLast ?? 9999) - (a.daysSinceLast ?? 9999));

      return res.json(atRisk);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to fetch at-risk clients" });
    }
  });

  // ============================================================
  // STAFF PAY RATES
  // ============================================================

  app.get("/api/staff/pay-rates", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const userStore = await db.select({ id: locations.id }).from(locations).where(eq(locations.userId, userId)).limit(1);
      if (!userStore.length) return res.status(404).json({ message: "Store not found" });
      const storeId = userStore[0].id;

      const staffList = await db.select({
        id: staff.id,
        name: staff.name,
        role: staff.role,
        employmentType: staff.employmentType,
        commissionEnabled: staff.commissionEnabled,
        commissionRate: staff.commissionRate,
        commissionStructureId: staff.commissionStructureId,
        status: staff.status,
      }).from(staff)
        .where(and(eq(staff.storeId, storeId), ne(staff.status, "removed")));

      return res.json(staffList);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to fetch staff pay rates" });
    }
  });

  app.put("/api/staff/:id/pay-rate", isAuthenticated, async (req, res) => {
    try {
      const staffId = parseInt(req.params.id as string);
      const { commissionEnabled, commissionRate, commissionStructureId } = req.body;
      const updates: Record<string, any> = {};
      if (commissionEnabled !== undefined) updates.commissionEnabled = Boolean(commissionEnabled);
      if (commissionRate !== undefined) updates.commissionRate = String(parseFloat(commissionRate) || 0);
      if (commissionStructureId !== undefined) {
        updates.commissionStructureId = commissionStructureId === null ? null : Number(commissionStructureId) || null;
      }
      if (!Object.keys(updates).length) return res.status(400).json({ message: "No updates provided" });
      const [updated] = await db.update(staff).set(updates).where(eq(staff.id, staffId)).returning();
      return res.json(updated);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to update pay rate" });
    }
  });

  // ============================================================
  // INTAKE FORMS ROUTES
  // ============================================================

  app.get("/api/intake-forms", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const userStore = await db.select().from(locations).where(eq(locations.userId, userId)).limit(1);
      if (!userStore.length) return res.status(404).json({ message: "Store not found" });
      const storeId = userStore[0].id;

      const forms = await db.select().from(intakeForms).where(eq(intakeForms.storeId, storeId)).orderBy(desc(intakeForms.createdAt));
      
      const formsWithFields = await Promise.all(forms.map(async (form) => {
        const fields = await db.select().from(intakeFormFields).where(eq(intakeFormFields.formId, form.id)).orderBy(intakeFormFields.sortOrder);
        return { ...form, fields };
      }));

      return res.json(formsWithFields);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to fetch intake forms" });
    }
  });

  app.post("/api/intake-forms", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const userStore = await db.select().from(locations).where(eq(locations.userId, userId)).limit(1);
      if (!userStore.length) return res.status(404).json({ message: "Store not found" });
      const storeId = userStore[0].id;

      const { name, description, requireBeforeBooking, serviceId, fields } = req.body;
      const [form] = await db.insert(intakeForms).values({
        storeId, name, description, requireBeforeBooking: !!requireBeforeBooking,
        serviceId: serviceId ? parseInt(serviceId) : null,
      }).returning();

      if (fields && fields.length > 0) {
        await db.insert(intakeFormFields).values(
          fields.map((f: any, i: number) => ({
            formId: form.id, label: f.label, fieldType: f.fieldType,
            options: f.options || null, required: !!f.required, sortOrder: i,
          }))
        );
      }

      return res.json(form);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to create intake form" });
    }
  });

  app.put("/api/intake-forms/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const { name, description, requireBeforeBooking, isActive, fields } = req.body;
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (requireBeforeBooking !== undefined) updates.requireBeforeBooking = requireBeforeBooking;
      if (isActive !== undefined) updates.isActive = isActive;

      const [form] = await db.update(intakeForms).set(updates).where(eq(intakeForms.id, id)).returning();

      if (fields !== undefined) {
        await db.delete(intakeFormFields).where(eq(intakeFormFields.formId, id));
        if (fields.length > 0) {
          await db.insert(intakeFormFields).values(
            fields.map((f: any, i: number) => ({
              formId: id, label: f.label, fieldType: f.fieldType,
              options: f.options || null, required: !!f.required, sortOrder: i,
            }))
          );
        }
      }

      return res.json(form);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to update intake form" });
    }
  });

  app.delete("/api/intake-forms/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      await db.delete(intakeFormFields).where(eq(intakeFormFields.formId, id));
      await db.delete(intakeForms).where(eq(intakeForms.id, id));
      return res.json({ success: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to delete intake form" });
    }
  });

  app.get("/api/intake-forms/responses", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const userStore = await db.select().from(locations).where(eq(locations.userId, userId)).limit(1);
      if (!userStore.length) return res.status(404).json({ message: "Store not found" });
      const responses = await db.select().from(intakeFormResponses).where(eq(intakeFormResponses.storeId, userStore[0].id)).orderBy(desc(intakeFormResponses.submittedAt));
      return res.json(responses);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to fetch responses" });
    }
  });

  app.post("/api/intake-forms/:id/respond", async (req, res) => {
    try {
      const formId = parseRouteId(req.params.id);
      const { customerId, appointmentId, customerName, responses } = req.body;
      const [form] = await db.select().from(intakeForms).where(eq(intakeForms.id, formId));
      if (!form) return res.status(404).json({ message: "Form not found" });

      const [response] = await db.insert(intakeFormResponses).values({
        formId, storeId: form.storeId,
        customerId: customerId ? parseInt(customerId) : null,
        appointmentId: appointmentId ? parseInt(appointmentId) : null,
        customerName, responses: JSON.stringify(responses),
      }).returning();

      return res.json(response);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to submit response" });
    }
  });

  // ============================================================
  // LOYALTY ROUTES
  // ============================================================

  app.get("/api/loyalty/transactions", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId;
      const userStore = await db.select().from(locations).where(eq(locations.userId, userId)).limit(1);
      if (!userStore.length) return res.status(404).json({ message: "Store not found" });
      const storeId = userStore[0].id;

      const txns = await db
        .select({
          id: loyaltyTransactions.id,
          customerId: loyaltyTransactions.customerId,
          type: loyaltyTransactions.type,
          points: loyaltyTransactions.points,
          description: loyaltyTransactions.description,
          createdAt: loyaltyTransactions.createdAt,
          appointmentId: loyaltyTransactions.appointmentId,
          customerName: clients.fullName,
        })
        .from(loyaltyTransactions)
        .leftJoin(clients, eq(loyaltyTransactions.customerId, clients.id))
        .where(eq(loyaltyTransactions.storeId, storeId))
        .orderBy(desc(loyaltyTransactions.createdAt))
        .limit(200);

      return res.json(txns.map(t => ({ ...t, customer: t.customerName ? { name: t.customerName } : null })));
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to fetch loyalty transactions" });
    }
  });

  app.post("/api/loyalty/adjust", isAuthenticated, async (req, res) => {
    try {
      const { customerId, storeId, type, points, description } = req.body;

      const [txn] = await db.insert(loyaltyTransactions).values({
        storeId: parseInt(storeId), customerId: parseInt(customerId),
        type, points: parseInt(points), description,
      }).returning();

      const [clientRow] = await db.select({ loyaltyPoints: clients.loyaltyPoints }).from(clients).where(eq(clients.id, parseInt(customerId)));
      const newPoints = Math.max(0, (clientRow?.loyaltyPoints || 0) + parseInt(points));
      await db.update(clients).set({ loyaltyPoints: newPoints }).where(eq(clients.id, parseInt(customerId)));

      return res.json(txn);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to adjust loyalty points" });
    }
  });

  // ============================================================
  // POS — Record Walk-in Sale (revenue + commission tracking)
  // ============================================================

  app.post("/api/pos/record-sale", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return;

      const { items, clientId, paymentMethod, totalPaid, tipAmount } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "items array required" });
      }

      const now = new Date();
      const ticketSubtotal: number = items.reduce(
        (sum: number, item: any) => sum + Number(item.serviceAmount || 0),
        0
      );

      const createdIds: number[] = [];

      for (const item of items) {
        const itemSubtotal = Number(item.serviceAmount || 0);
        // Prorate each item's share of the after-discount total and tip
        const proportion = ticketSubtotal > 0 ? itemSubtotal / ticketSubtotal : 1 / items.length;
        const itemTip    = Math.round(Number(tipAmount || 0) * proportion * 100) / 100;
        const itemPaid   = Math.round(Number(totalPaid || 0) * proportion * 100) / 100;

        const [apt] = await db.insert(appointments).values({
          storeId,
          staffId:       item.staffId   ? Number(item.staffId)   : null,
          customerId:    clientId        ? Number(clientId)        : null,
          serviceId:     item.serviceId  ? Number(item.serviceId)  : null,
          status:        "completed",
          date:          now,
          duration:      Number(item.duration || 30),
          totalPaid:     itemPaid.toFixed(2),
          tipAmount:     itemTip.toFixed(2),
          paymentMethod: paymentMethod || "Card",
          notes:         "Walk-in POS sale",
        }).returning({ id: appointments.id });

        if (apt?.id) createdIds.push(apt.id);
      }

      return res.json({ success: true, appointmentIds: createdIds });
    } catch (err: any) {
      console.error("[POS record-sale]", err);
      return res.status(500).json({ message: err.message || "Failed to record sale" });
    }
  });

  // ============================================================
  // POS — Email Receipt
  // ============================================================

  app.post("/api/pos/email-receipt", isAuthenticated, async (req, res) => {
    try {
      const { storeId, email, storeName, clientName, items, subtotal, tipAmount, grandTotal, paymentMethod, transactionId, dateStr, timeStr } = req.body;
      if (!email || !storeId) return res.status(400).json({ message: "email and storeId required" });
      const { sendPOSReceiptEmail } = await import("./mail");
      const result = await sendPOSReceiptEmail(Number(storeId), email, {
        storeName: storeName || "Your Salon",
        clientName: clientName || "there",
        items: items || [],
        subtotal: Number(subtotal) || 0,
        tipAmount: Number(tipAmount) || 0,
        grandTotal: Number(grandTotal) || 0,
        paymentMethod: paymentMethod || "Card",
        transactionId: transactionId || "",
        dateStr: dateStr || new Date().toLocaleDateString(),
        timeStr: timeStr || new Date().toLocaleTimeString(),
      });
      if (result.success) {
        return res.json({ success: true });
      } else {
        return res.status(500).json({ message: result.error || "Failed to send receipt" });
      }
    } catch (err: any) {
      console.error("[POS email-receipt]", err);
      return res.status(500).json({ message: err.message || "Failed to send receipt" });
    }
  });

  // ============================================================
  // REVIEWS
  // ============================================================

  // Public: get appointment info for the review form
  app.get("/api/reviews/form/:appointmentId", async (req, res) => {
    try {
      const appointmentId = parseInt(req.params.appointmentId);
      const [apt] = await db
        .select({
          id: appointments.id,
          date: appointments.date,
          status: appointments.status,
          storeId: appointments.storeId,
          storeName: locations.name,
          customerName: clients.fullName,
          serviceName: services.name,
          staffName: staff.name,
        })
        .from(appointments)
        .leftJoin(locations, eq(appointments.storeId, locations.id))
        .leftJoin(clients, eq(appointments.customerId, clients.id))
        .leftJoin(services, eq(appointments.serviceId, services.id))
        .leftJoin(staff, eq(appointments.staffId, staff.id))
        .where(eq(appointments.id, appointmentId));

      if (!apt) return res.status(404).json({ message: "Appointment not found" });

      // Check if review already submitted
      const [existing] = await db.select().from(reviews).where(eq(reviews.appointmentId, appointmentId));

      return res.json({ ...apt, alreadyReviewed: !!existing });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to load review form" });
    }
  });

  // Public: submit a review
  // Public: upload a photo before submitting a review
  const reviewPhotoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
  app.post("/api/reviews/upload-photo", reviewPhotoUpload.single("photo"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file provided" });
      const { uploadToR2 } = await import("./lib/r2.js");
      const url = await uploadToR2(req.file.buffer, "review-photos", req.file.originalname, req.file.mimetype);
      return res.json({ url });
    } catch (err) {
      console.error("[review-photo-upload]", err);
      return res.status(500).json({ message: "Failed to upload photo" });
    }
  });

  app.post("/api/reviews/submit", async (req, res) => {
    try {
      const { appointmentId, rating, comment, photoUrl } = req.body;
      if (!appointmentId || !rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Invalid review data" });
      }

      const [apt] = await db
        .select({
          id: appointments.id,
          storeId: appointments.storeId,
          customerId: appointments.customerId,
          staffId: appointments.staffId,
          customerName: clients.fullName,
          serviceName: services.name,
          staffName: staff.name,
        })
        .from(appointments)
        .leftJoin(clients, eq(appointments.customerId, clients.id))
        .leftJoin(services, eq(appointments.serviceId, services.id))
        .leftJoin(staff, eq(appointments.staffId, staff.id))
        .where(eq(appointments.id, parseInt(appointmentId)));

      if (!apt) return res.status(404).json({ message: "Appointment not found" });

      // Prevent duplicate reviews
      const [existing] = await db.select().from(reviews).where(eq(reviews.appointmentId, parseInt(appointmentId)));
      if (existing) return res.status(409).json({ message: "Review already submitted" });

      const [review] = await db.insert(reviews).values({
        storeId: apt.storeId!,
        customerId: apt.customerId,
        appointmentId: parseInt(appointmentId),
        staffId: apt.staffId,
        rating: parseInt(rating),
        comment: comment || null,
        customerName: apt.customerName,
        serviceName: apt.serviceName,
        staffName: apt.staffName,
        photoUrl: photoUrl || null,
        isPublic: true,
        isFeatured: false,
      }).returning();

      return res.json(review);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to submit review" });
    }
  });

  // Authenticated: list all reviews for a store
  app.get("/api/reviews", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });

      const rows = await db
        .select()
        .from(reviews)
        .where(eq(reviews.storeId, storeId))
        .orderBy(desc(reviews.createdAt));

      return res.json(rows);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to fetch reviews" });
    }
  });

  // Authenticated: aggregate stats
  app.get("/api/reviews/stats", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ message: "No store context" });

      const rows = await db.select().from(reviews).where(eq(reviews.storeId, storeId));
      const total = rows.length;
      const avg = total > 0 ? rows.reduce((s, r) => s + r.rating, 0) / total : 0;
      const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      rows.forEach(r => { distribution[r.rating] = (distribution[r.rating] || 0) + 1; });

      return res.json({ total, avg: Math.round(avg * 10) / 10, distribution });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to fetch review stats" });
    }
  });

  // Authenticated: update review (toggle public/featured)
  app.put("/api/reviews/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const { isPublic, isFeatured } = req.body;
      const update: Partial<typeof reviews.$inferInsert> = {};
      if (isPublic !== undefined) update.isPublic = isPublic;
      if (isFeatured !== undefined) update.isFeatured = isFeatured;
      const [row] = await db.update(reviews).set(update).where(eq(reviews.id, id)).returning();
      return res.json(row);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to update review" });
    }
  });

  // Authenticated: delete review
  app.delete("/api/reviews/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      await db.delete(reviews).where(eq(reviews.id, id));
      return res.json({ success: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: "Failed to delete review" });
    }
  });

  // ── Pro Hub Lead Capture ────────────────────────────────────────────────────
  app.post("/api/pro/leads", async (req, res) => {
    try {
      const { name, email, phone, businessName, industry, teamSize, message } = req.body;
      if (!name || !email) {
        return res.status(400).json({ error: "Name and email are required" });
      }
      const { proLeads } = await import("@shared/schema");
      const [lead] = await db.insert(proLeads).values({
        name: String(name),
        email: String(email),
        phone: phone ? String(phone) : null,
        businessName: businessName ? String(businessName) : null,
        industry: industry ? String(industry) : null,
        teamSize: teamSize ? String(teamSize) : null,
        message: message ? String(message) : null,
        source: "pro-hub",
      }).returning();
      return res.json({ success: true, id: lead.id });
    } catch (err) {
      console.error("Pro lead error:", err);
      return res.status(500).json({ error: "Failed to save lead" });
    }
  });

  // ── SEO Regional Pages API ────────────────────────────────────────────────────

    // Get city and business type reference data (MUST be before /:id)
    app.get("/api/seo-regions/reference-data", async (_req, res) => {
      return res.json({
        cities: ALL_CITIES,
        bookingBusinessTypes: BOOKING_BUSINESS_TYPES,
      });
    });

    // List all regions
    app.get("/api/seo-regions", async (req, res) => {
      try {
        const rows = await db.select().from(seoRegions).orderBy(asc(seoRegions.city));
        return res.json(rows);
      } catch (err) {
        console.error("SEO regions list error:", err);
        return res.status(500).json({ error: "Failed to list regions" });
      }
    });

    // Get single region
    app.get("/api/seo-regions/:id", async (req, res) => {
      try {
        const id = parseInt(req.params.id as string);
        const [row] = await db.select().from(seoRegions).where(eq(seoRegions.id, id));
        if (!row) return res.status(404).json({ error: "Not found" });
        return res.json(row);
      } catch (err) {
        return res.status(500).json({ error: "Failed to get region" });
      }
    });

    // Create region and auto-generate HTML page
    app.post("/api/seo-regions", async (req, res) => {
      try {
        const data = insertSeoRegionSchema.parse(req.body);
        const [row] = await db.insert(seoRegions).values(data).returning();
        return res.json(row);
      } catch (err: any) {
        if (err?.code === "23505") return res.status(409).json({ error: "A region with that slug already exists" });
        return res.status(400).json({ error: err?.message ?? "Failed to create region" });
      }
    });

    // Update region and regenerate page
    app.put("/api/seo-regions/:id", async (req, res) => {
      try {
        const id = parseInt(req.params.id as string);
        const data = insertSeoRegionSchema.partial().parse(req.body);
        const [row] = await db.update(seoRegions).set({ ...data, updatedAt: new Date() }).where(eq(seoRegions.id, id)).returning();
        if (!row) return res.status(404).json({ error: "Not found" });
        return res.json(row);
      } catch (err: any) {
        return res.status(400).json({ error: err?.message ?? "Failed to update region" });
      }
    });

    // Regenerate a single page manually
    app.post("/api/seo-regions/:id/generate", async (req, res) => {
      try {
        const id = parseInt(req.params.id as string);
        const [row] = await db.select().from(seoRegions).where(eq(seoRegions.id, id));
        if (!row) return res.status(404).json({ error: "Not found" });
        return res.json({ success: true, slug: row.slug });
      } catch (err: any) {
        return res.status(500).json({ error: err?.message ?? "Failed to generate page" });
      }
    });

    // Regenerate ALL pages (bulk)
    app.post("/api/seo-regions/generate-all", async (req, res) => {
      try {
        const rows = await db.select().from(seoRegions);
        let count = 0;
        return res.json({ success: true, generated: count, total: rows.length });
      } catch (err: any) {
        return res.status(500).json({ error: err?.message ?? "Bulk generation failed" });
      }
    });

    // Bulk seed — create records for all selected city × business type combinations
    app.post("/api/seo-regions/bulk-seed", async (req, res) => {
      try {
        const { cities, businessTypes, phone } = req.body as {
          cities: Array<{ city: string; state: string; stateCode: string; country?: string; nearbyCities?: string }>;
          businessTypes: string[];
          phone?: string;
        };
        if (!Array.isArray(cities) || cities.length === 0) return res.status(400).json({ error: "No cities provided" });
        if (!Array.isArray(businessTypes) || businessTypes.length === 0) return res.status(400).json({ error: "No business types provided" });

        let created = 0;
        let skipped = 0;
        const newRows: typeof seoRegions.$inferSelect[] = [];

        for (const city of cities) {
          for (const bt of businessTypes) {
            const slug = buildRegionSlug(city.city, city.stateCode, bt);
            try {
              const [row] = await db.insert(seoRegions).values({
                city: city.city,
                state: city.state,
                stateCode: city.stateCode,
                slug,
                product: "booking",
                businessType: bt,
                nearbyCities: city.nearbyCities ?? null,
                phone: phone ?? null,
                pageGenerated: false,
              }).onConflictDoNothing().returning();
              if (row) { newRows.push(row); created++; }
              else skipped++;
            } catch { skipped++; }
          }
        }

        return res.json({ success: true, created, skipped, total: cities.length * businessTypes.length });
      } catch (err: any) {
        return res.status(500).json({ error: err?.message ?? "Bulk seed failed" });
      }
    });

    // Delete region and its HTML file
    app.delete("/api/seo-regions/:id", async (req, res) => {
      try {
        const id = parseInt(req.params.id as string);
        const [row] = await db.select().from(seoRegions).where(eq(seoRegions.id, id));
        if (!row) return res.status(404).json({ error: "Not found" });
        await db.delete(seoRegions).where(eq(seoRegions.id, id));
        return res.json({ success: true });
      } catch (err: any) {
        return res.status(500).json({ error: err?.message ?? "Failed to delete region" });
      }
    });

  // ── Team / Permissions ────────────────────────────────────────────────────────
  // List all user accounts owned by the current owner (anyone whose email
  // matches a staff record under one of the owner's stores, plus the owner).
  app.get("/api/team", requirePermission(PERMISSIONS.STAFF_MANAGE), async (req, res) => {
    try {
      const ownerId = req.auth?.userId;
      if (!ownerId) return res.status(401).json({ message: "Unauthorized" });

      // Find all stores belonging to this owner, then all staff in those stores,
      // then all user accounts with matching emails (or staffId).
      const ownerStores = await db
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.userId, ownerId));
      const storeIds = ownerStores.map((s) => s.id);

      const teamStaff = storeIds.length
        ? await db.select().from(staff).where(sql`${staff.storeId} IN (${sql.join(storeIds, sql`, `)})`)
        : [];

      const staffEmails = teamStaff.map((s) => s.email).filter((e): e is string => !!e);
      const staffIds = teamStaff.map((s) => s.id);

      const teamUsers = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
          staffId: users.staffId,
          permissions: users.permissions,
        })
        .from(users)
        .where(
          staffEmails.length || staffIds.length
            ? sql`${users.id} = ${ownerId}
                  OR ${users.email} IN (${staffEmails.length ? sql.join(staffEmails, sql`, `) : sql`NULL`})
                  OR ${users.staffId} IN (${staffIds.length ? sql.join(staffIds, sql`, `) : sql`NULL`})`
            : eq(users.id, ownerId),
        );

      // Staff that have a linked user account (by email or staffId) — exclude
      // them from the "staff-only" pseudo-member list so we don't show duplicates.
      const linkedStaffIds = new Set<number>();
      const linkedEmails = new Set<string>();
      for (const u of teamUsers) {
        if (u.staffId) linkedStaffIds.add(u.staffId);
        if (u.email) linkedEmails.add(u.email);
      }
      const staffOnly = teamStaff.filter(
        (s) => !linkedStaffIds.has(s.id) && !(s.email && linkedEmails.has(s.email)),
      );

      const userMembers = teamUsers.map((u) => ({
        ...u,
        isOwner: u.id === ownerId,
        kind: "user" as const,
      }));
      const staffMembers = staffOnly.map((s) => {
        const [first, ...rest] = (s.name ?? "").split(" ");
        return {
          id: `staff:${s.id}`,
          email: s.email ?? "",
          firstName: first ?? null,
          lastName: rest.join(" ") || null,
          role: "staff",
          staffId: s.id,
          permissions: s.permissions ?? null,
          isOwner: false,
          kind: "staff" as const,
        };
      });

      return res.json({
        members: [...userMembers, ...staffMembers],
        staff: teamStaff.map((s) => ({ id: s.id, name: s.name, email: s.email, storeId: s.storeId })),
      });
    } catch (err) {
      console.error("[team] list failed:", err);
      return res.status(500).json({ message: "Failed to load team" });
    }
  });

  app.patch("/api/team/:userId/role", requirePermission(PERMISSIONS.STAFF_MANAGE), async (req, res) => {
    try {
      let targetId = req.params.userId;
      const { role } = req.body as { role?: string };
      if (!["manager", "staff"].includes(role || "")) {
        return res.status(400).json({ message: "Role must be 'manager' or 'staff'" });
      }

      // Pseudo-IDs (staff:N) point to staff records without a login yet.
      // Auto-create a user account so the owner can assign a role directly.
      if ((targetId as string).startsWith("staff:")) {
        const staffId = Number((targetId as string).slice("staff:".length));
        if (!Number.isInteger(staffId)) {
          return res.status(400).json({ message: "Invalid staff id" });
        }
        const [staffRow] = await db.select().from(staff).where(eq(staff.id, staffId));
        if (!staffRow) return res.status(404).json({ message: "Staff member not found" });
        if (!staffRow.email) {
          return res.status(400).json({
            message: "This staff member needs an email on their profile before a role can be assigned.",
          });
        }
        // If a user already exists with that email, just link & reuse it.
        const [existingByEmail] = await db
          .select()
          .from(users)
          .where(eq(users.email, staffRow.email));
        if (existingByEmail) {
          if (!existingByEmail.staffId) {
            await db.update(users).set({ staffId }).where(eq(users.id, existingByEmail.id));
          }
          targetId = existingByEmail.id;
        } else {
          // Create a placeholder login. A random password is set; the staff
          // member will use the standard "forgot password" flow on first login.
          const tempPassword = await bcrypt.hash(
            `${Math.random().toString(36).slice(2)}${Date.now()}`,
            10,
          );
          const [first, ...rest] = (staffRow.name ?? "").split(" ");
          const [created] = await db
            .insert(users)
            .values({
              email: staffRow.email,
              password: tempPassword,
              firstName: first || null,
              lastName: rest.join(" ") || null,
              role: role!, // will be overwritten below, but seed correctly
              staffId,
              passwordChanged: false,
            })
            .returning();
          targetId = created.id;
        }
      }

      // Owners can never be demoted via this endpoint.
      const resolvedId = Array.isArray(targetId) ? targetId[0] : targetId;
      const [target] = await db.select().from(users).where(eq(users.id, resolvedId));
      if (!target) return res.status(404).json({ message: "User not found" });
      if (target.id === req.auth?.userId) {
        return res.status(400).json({ message: "You cannot change your own role" });
      }
      if (target.role === "owner" || target.role === "admin") {
        return res.status(403).json({ message: "Cannot change an owner's role" });
      }
      const [updated] = await db.update(users).set({ role }).where(eq(users.id, resolvedId)).returning();
      return res.json(updated);
    } catch (err) {
      console.error("[team] update role failed:", err);
      return res.status(500).json({ message: "Failed to update role" });
    }
  });

  // POST /api/team/invite — invite a staff member by email
  app.post("/api/team/invite", requirePermission(PERMISSIONS.STAFF_MANAGE), async (req, res) => {
    try {
      const ownerId = req.auth?.userId;
      if (!ownerId) return res.status(401).json({ message: "Unauthorized" });

      const { email, name, role, employmentType, storeId } = req.body as {
        email: string;
        name: string;
        role?: string;
        employmentType?: string;
        storeId: number;
      };

      if (!email || !name || !storeId) {
        return res.status(400).json({ message: "email, name, and storeId are required" });
      }

      // Verify the owner owns this store
      const [store] = await db.select().from(locations).where(
        and(eq(locations.id, storeId), eq(locations.userId, ownerId))
      );
      if (!store) return res.status(403).json({ message: "Store not found or not owned by you" });

      const { checkStaffLimit } = await import("./middleware/plan-middleware");
      const staffCheck = await checkStaffLimit(storeId);
      if (!staffCheck.allowed) {
        const limitMsg = staffCheck.limit !== null
          ? `Your current plan allows up to ${staffCheck.limit} staff member${staffCheck.limit === 1 ? "" : "s"}. Upgrade to add more team members.`
          : "Your current plan does not include staff management. Please upgrade to add team members.";
        return res.status(403).json({
          message: limitMsg,
          code: "STAFF_LIMIT_REACHED",
          upgradeRequired: true,
          limit: staffCheck.limit,
          current: staffCheck.current,
        });
      }

      // Generate invite token
      const inviteToken = crypto.randomBytes(32).toString("hex");
      const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      // Check if staff with this email already exists in this store
      const existing = await db.select().from(staff)
        .where(and(eq(staff.storeId, storeId), eq(staff.email, email)));

      let staffRecord: any;
      if (existing.length > 0) {
        // Update existing staff with invite token
        const [updated] = await db.update(staff)
          .set({
            status: "invited",
            inviteToken,
            inviteExpiresAt,
            invitedAt: new Date(),
            invitedByUserId: ownerId,
            role: role || existing[0].role,
            employmentType: employmentType || existing[0].employmentType,
          })
          .where(eq(staff.id, existing[0].id))
          .returning();
        staffRecord = updated;
      } else {
        // Create new staff record with invite pending
        const [created] = await db.insert(staff).values({
          name,
          email,
          storeId,
          role: role || "staff",
          employmentType: employmentType || "stylist",
          status: "invited",
          inviteToken,
          inviteExpiresAt,
          invitedAt: new Date(),
          invitedByUserId: ownerId,
        }).returning();
        staffRecord = created;
      }

      // Keep payouts model in sync with team model (idempotent).
      const [existingContractor] = await db
        .select({ id: contractors.id })
        .from(contractors)
        .where(and(eq(contractors.storeId, storeId), eq(contractors.staffId, staffRecord.id)))
        .limit(1);

      if (!existingContractor) {
        const fullName = (staffRecord.name ?? "").trim();
        const nameParts = fullName.split(/\s+/).filter(Boolean);
        const firstName = nameParts[0] ?? "Staff";
        const lastName = nameParts.slice(1).join(" ") || "Member";

        await db.insert(contractors).values({
          name: staffRecord.name ?? "Staff Member",
          storeId,
          staffId: staffRecord.id,
          firstName,
          lastName,
          email: staffRecord.email ?? email,
          role: staffRecord.employmentType ?? role ?? "stylist",
          commissionRate: staffRecord.commissionRate ?? "0",
          productCommissionRate: "0",
          payoutMethod: "ach",
          taxClassification: "individual",
          isActive: true,
        });
      }

      // Build invite URL
      const baseUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : (process.env.APP_URL || "");
      const inviteUrl = `${baseUrl}/accept-invite?token=${inviteToken}`;

      // Send invite email (gracefully falls back if Mailgun not configured)
      const emailResult = await sendEmail(
        storeId,
        email,
        `You've been invited to join ${store.name} on Certxa`,
        `
          <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
            <h1 style="font-family:'Cormorant Garamond',serif;font-size:2rem;font-weight:700;color:#3B0764;margin:0 0 8px">
              You're invited to ${store.name}
            </h1>
            <p style="color:#4b5563;font-size:.95rem;line-height:1.6;margin:0 0 24px">
              Hi ${name}, you've been invited to join <strong>${store.name}</strong> as a team member on Certxa. 
              Click the button below to create your account and get started.
            </p>
            <a href="${inviteUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#3B0764,#5B21B6);color:#fff;text-decoration:none;border-radius:50px;font-weight:700;font-size:.9rem;margin-bottom:24px">
              Accept Invitation →
            </a>
            <p style="color:#9ca3af;font-size:.78rem">This invitation expires in 7 days. If you didn't expect this email, you can safely ignore it.</p>
          </div>
        `,
        `You've been invited to join ${store.name} on Certxa. Accept your invitation: ${inviteUrl}`
      );

      console.log(`[team/invite] Invited ${email} to store ${storeId}. Invite URL: ${inviteUrl}. Email result:`, emailResult);

      return res.json({
        success: true,
        staffId: staffRecord.id,
        email,
        inviteUrl,
        emailSent: emailResult.success,
        emailSkipped: emailResult.skipped,
      });
    } catch (err: any) {
      console.error("[team] invite failed:", err);
      return res.status(500).json({ message: "Failed to send invitation" });
    }
  });

  // POST /api/team/invite-sms — invite a staff member by SMS (no email required)
  app.post("/api/team/invite-sms", requirePermission(PERMISSIONS.STAFF_MANAGE), async (req, res) => {
    try {
      const ownerId = req.auth?.userId;
      if (!ownerId) return res.status(401).json({ message: "Unauthorized" });

      const { name, phone, role, employmentType, storeId } = req.body as {
        name: string; phone: string; role?: string; employmentType?: string; storeId: number;
      };

      if (!name || !phone || !storeId) {
        return res.status(400).json({ message: "name, phone, and storeId are required" });
      }

      // Verify the owner owns this store
      const [store] = await db.select().from(locations).where(
        and(eq(locations.id, storeId), eq(locations.userId, ownerId))
      );
      if (!store) return res.status(403).json({ message: "Store not found or not owned by you" });

      const { checkStaffLimit } = await import("./middleware/plan-middleware");
      const staffCheck = await checkStaffLimit(storeId);
      if (!staffCheck.allowed) {
        return res.status(403).json({
          message: staffCheck.limit !== null
            ? `Your current plan allows up to ${staffCheck.limit} staff member${staffCheck.limit === 1 ? "" : "s"}. Upgrade to add more.`
            : "Your current plan does not include staff management.",
          code: "STAFF_LIMIT_REACHED",
          upgradeRequired: true,
        });
      }

      // Normalize phone to E.164
      const normalizedPhone = toE164US(phone);
      if (!normalizedPhone) {
        return res.status(400).json({ message: "Invalid phone number. Please enter a valid 10-digit US number." });
      }

      // Find existing staff by phone in this store, or create new
      const existing = await db.select().from(staff)
        .where(and(eq(staff.storeId, storeId), eq(staff.phone, normalizedPhone)));

      let staffRecord: any;
      if (existing.length > 0) {
        const [updated] = await db.update(staff)
          .set({
            name,
            status: "invited",
            invitedAt: new Date(),
            invitedByUserId: ownerId,
            role: role || existing[0].role,
            employmentType: employmentType || existing[0].employmentType,
          })
          .where(eq(staff.id, existing[0].id))
          .returning();
        staffRecord = updated;
      } else {
        const [created] = await db.insert(staff).values({
          name,
          phone: normalizedPhone,
          storeId,
          role: role || "staff",
          employmentType: employmentType || "stylist",
          status: "invited",
          invitedAt: new Date(),
          invitedByUserId: ownerId,
        }).returning();
        staffRecord = created;
      }

      // Keep payouts model in sync (idempotent)
      const [existingContractor] = await db
        .select({ id: contractors.id })
        .from(contractors)
        .where(and(eq(contractors.storeId, storeId), eq(contractors.staffId, staffRecord.id)))
        .limit(1);

      if (!existingContractor) {
        const nameParts = (staffRecord.name ?? "").trim().split(/\s+/).filter(Boolean);
        await db.insert(contractors).values({
          name: staffRecord.name ?? "Staff Member",
          storeId,
          staffId: staffRecord.id,
          firstName: nameParts[0] ?? "Staff",
          lastName: nameParts.slice(1).join(" ") || "Member",
          email: staffRecord.email ?? "",
          role: staffRecord.employmentType ?? role ?? "stylist",
          commissionRate: "0",
          productCommissionRate: "0",
          payoutMethod: "ach",
          taxClassification: "individual",
          isActive: true,
        });
      }

      // Generate 8-digit OTP (valid 24 hours on invite — long enough for them to install the app)
      const code = Math.floor(10000000 + Math.random() * 90000000).toString();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await pool.query(
        `INSERT INTO staff_sms_otps (staff_id, phone, code, expires_at) VALUES ($1, $2, $3, $4)`,
        [staffRecord.id, normalizedPhone, code, expiresAt]
      );

      const { sendSms } = await import("./sms");
      const appUrl = process.env.CERTXA_STAFF_APP_URL || "https://certxa.com/app";

      // SMS 1 — app download link (sent immediately)
      await sendSms(
        storeId,
        normalizedPhone,
        `Hi ${name}! ${store.name} has invited you to join their team on Certxa. Download the staff app here: ${appUrl}`,
        "staff_invite_app_link",
        undefined, undefined, { skipCreditDeduction: true }
      );

      // SMS 2 — access code (sent 5 seconds later so it arrives as a separate message)
      setTimeout(async () => {
        try {
          await sendSms(
            storeId,
            normalizedPhone,
            `Your Certxa access code: ${code}\n\nOpen the app and enter this code to sign in. Valid for 24 hours.`,
            "staff_invite_otp",
            undefined, undefined, { skipCreditDeduction: true }
          );
        } catch (e) {
          console.error("[invite-sms] OTP SMS failed:", e);
        }
      }, 5000);

      console.log(`[team/invite-sms] Invited ${normalizedPhone} (${name}) to store ${storeId}`);
      return res.json({ success: true, staffId: staffRecord.id, smsSent: true });
    } catch (err: any) {
      console.error("[team] invite-sms failed:", err);
      return res.status(500).json({ message: "Failed to send SMS invitation" });
    }
  });

  // GET /api/team/invite/:token — validate invite token (public, no auth required)
  app.get("/api/team/invite/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const [staffMember] = await db.select({
        id: staff.id,
        name: staff.name,
        email: staff.email,
        employmentType: staff.employmentType,
        role: staff.role,
        status: staff.status,
        inviteExpiresAt: staff.inviteExpiresAt,
        storeId: staff.storeId,
      }).from(staff).where(eq(staff.inviteToken, token));

      if (!staffMember) {
        return res.status(404).json({ message: "Invite not found or already used" });
      }
      if (staffMember.status !== "invited") {
        return res.status(400).json({ message: "This invitation has already been used" });
      }
      if (staffMember.inviteExpiresAt && new Date() > staffMember.inviteExpiresAt) {
        return res.status(400).json({ message: "This invitation has expired" });
      }

      // Fetch store name
      const [store] = await db.select({ name: locations.name }).from(locations)
        .where(eq(locations.id, staffMember.storeId!));

      return res.json({
        ...staffMember,
        storeName: store?.name ?? "the salon",
      });
    } catch (err) {
      console.error("[team] validate invite failed:", err);
      return res.status(500).json({ message: "Failed to validate invite" });
    }
  });

  // POST /api/team/invite/:token/accept — accept invite, set password, create/link user account
  app.post("/api/team/invite/:token/accept", async (req, res) => {
    try {
      const { token } = req.params;
      const { firstName, lastName, password } = req.body as {
        firstName: string;
        lastName: string;
        password: string;
      };

      if (!firstName || !password || password.length < 6) {
        return res.status(400).json({ message: "First name and password (min 6 chars) required" });
      }

      const [staffMember] = await db.select().from(staff).where(eq(staff.inviteToken, token));
      if (!staffMember) return res.status(404).json({ message: "Invite not found" });
      if (staffMember.status !== "invited") return res.status(400).json({ message: "Invite already used" });
      if (staffMember.inviteExpiresAt && new Date() > staffMember.inviteExpiresAt) {
        return res.status(400).json({ message: "Invite expired" });
      }

      const hashedPw = await bcrypt.hash(password, 10);

      // Create or update user account
      let userId: string;
      const [existingUser] = staffMember.email
        ? await db.select().from(users).where(eq(users.email, staffMember.email))
        : [undefined];

      if (existingUser) {
        await db.update(users).set({
          firstName,
          lastName: lastName || null,
          password: hashedPw,
          staffId: staffMember.id,
          role: "staff",
          passwordChanged: true,
          onboardingCompleted: true,
        }).where(eq(users.id, existingUser.id));
        userId = existingUser.id;
      } else {
        const [created] = await db.insert(users).values({
          email: staffMember.email!,
          password: hashedPw,
          firstName,
          lastName: lastName || null,
          role: "staff",
          staffId: staffMember.id,
          passwordChanged: true,
          onboardingCompleted: true,
        }).returning();
        userId = created.id;
      }

      // Mark staff as active, clear invite token
      await db.update(staff).set({
        status: "active",
        name: `${firstName}${lastName ? " " + lastName : ""}`,
        inviteToken: null,
        inviteExpiresAt: null,
        joinedAt: new Date(),
      }).where(eq(staff.id, staffMember.id));

      // Log them in
      (req.session as any).userId = userId;
      return res.json({ success: true, userId });
    } catch (err: any) {
      console.error("[team] accept invite failed:", err);
      return res.status(500).json({ message: "Failed to accept invitation" });
    }
  });

  // PATCH /api/team/staff/:id/status — deactivate / reactivate / remove a staff member
  app.patch("/api/team/staff/:id/status", requirePermission(PERMISSIONS.STAFF_MANAGE), async (req, res) => {
    try {
      const staffId = Number(req.params.id);
      const { status } = req.body as { status: "active" | "deactivated" | "removed" };
      if (!["active", "deactivated", "removed"].includes(status)) {
        return res.status(400).json({ message: "status must be active, deactivated, or removed" });
      }

      const updates: Record<string, any> = { status };
      if (status === "removed") {
        updates.removedAt = new Date();
        updates.showOnCalendar = false; // Removed staff must never appear on calendar or public booking
      }

      const [updated] = await db.update(staff).set(updates).where(eq(staff.id, staffId)).returning();
      if (!updated) return res.status(404).json({ message: "Staff member not found" });

      // If deactivated/removed, invalidate any linked user session by revoking the staffId link
      if (status === "removed" || status === "deactivated") {
        await db.update(users).set({ role: "staff" }).where(eq(users.staffId, staffId));
      }

      return res.json(updated);
    } catch (err) {
      console.error("[team] update staff status failed:", err);
      return res.status(500).json({ message: "Failed to update status" });
    }
  });

  // GET /api/team/stats — seat usage counts for the current owner's stores
  app.get("/api/team/stats", requirePermission(PERMISSIONS.STAFF_MANAGE), async (req, res) => {
    try {
      const ownerId = req.auth?.userId;
      if (!ownerId) return res.status(401).json({ message: "Unauthorized" });

      const ownerStores = await db.select({ id: locations.id }).from(locations)
        .where(eq(locations.userId, ownerId));
      const storeIds = ownerStores.map((s) => s.id);

      if (!storeIds.length) return res.json({ active: 0, invited: 0, deactivated: 0, total: 0 });

      const allStaff = await db.select({ status: staff.status }).from(staff)
        .where(sql`${staff.storeId} IN (${sql.join(storeIds, sql`, `)})`);

      const active = allStaff.filter(s => !s.status || s.status === "active").length;
      const invited = allStaff.filter(s => s.status === "invited").length;
      const deactivated = allStaff.filter(s => s.status === "deactivated").length;

      return res.json({ active, invited, deactivated, total: allStaff.length });
    } catch (err) {
      console.error("[team] stats failed:", err);
      return res.status(500).json({ message: "Failed to load stats" });
    }
  });

  app.patch("/api/team/:userId/permissions", requirePermission(PERMISSIONS.STAFF_PERMISSIONS_MANAGE), async (req, res) => {
    try {
      const targetId = req.params.userId;
      const { permissions } = req.body as { permissions?: Record<string, boolean> };
      if (!permissions || typeof permissions !== "object") {
        return res.status(400).json({ message: "permissions object required" });
      }
      const cleaned: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(permissions)) {
        if (typeof v === "boolean") cleaned[k] = v;
      }

      // Staff-only pseudo-member targeted as "staff:<id>"
      if ((targetId as string).startsWith("staff:")) {
        const staffIdNum = Number((targetId as string).slice("staff:".length));
        if (!Number.isFinite(staffIdNum)) {
          return res.status(400).json({ message: "Invalid staff id" });
        }
        const [updated] = await db
          .update(staff)
          .set({ permissions: cleaned })
          .where(eq(staff.id, staffIdNum))
          .returning();
        if (!updated) return res.status(404).json({ message: "Staff not found" });
        return res.json({ id: targetId, permissions: updated.permissions });
      }

      const [target] = await db.select().from(users).where(eq(users.id, targetId as string));
      if (!target) return res.status(404).json({ message: "User not found" });
      if (target.role === "owner" || target.role === "admin") {
        return res.status(403).json({ message: "Cannot edit an owner's permissions" });
      }
      const [updated] = await db
        .update(users)
        .set({ permissions: cleaned })
        .where(eq(users.id, targetId as string))
        .returning();
      return res.json(updated);
    } catch (err) {
      console.error("[team] update permissions failed:", err);
      return res.status(500).json({ message: "Failed to update permissions" });
    }
  });

  // ── Certxa Pro Dashboard API ─────────────────────────────────────────────────
  const { default: proDashboardRouter } = await import("./routes/pro-dashboard.js");
  app.use("/api/pro-dashboard", requireNotSuspended, proDashboardRouter);

  // ── Certxa Crew Mobile API ────────────────────────────────────────────────────
  const { default: crewMobileRouter, startOvertimeDetector } = await import("./routes/crew-mobile.js");
  app.use("/api/crew", crewMobileRouter);
  startOvertimeDetector();

  // ── AI Chatbot API ───────────────────────────────────────────────────────────
  const { default: chatbotRouter } = await import("./chatbot.js");
  app.use("/api/chatbot", chatbotRouter);

  // ── Twilio Outbound Dialer ───────────────────────────────────────────────────
  const { default: dialerRouter } = await import("./dialer.js");
  app.use("/api/dialer", dialerRouter);

  // ── Client Data Architecture (normalized CRM + export/import) ───────────────
  const { default: clientsRouter } = await import("./routes/clients.js");
  app.use("/api/clients", clientsRouter);

  // ── Online Booking Payment Policy ─────────────────────────────────────────
  const { publicBookingPaymentRouter, clientPaymentMethodsRouter } =
    await import("./routes/bookingPayments.js");
  // Public (no auth): payment policy + intent creation for booking widget
  app.use("/api/public", publicBookingPaymentRouter);
  // Authenticated: list / remove client saved cards
  app.use("/api/payments", clientPaymentMethodsRouter);

  // ── Data Transfer (self-service + concierge import wizard) ───────────────────
  const { default: dataTransferRouter } = await import("./routes/dataTransfer.js");
  app.use("/api/data-transfer", dataTransferRouter);

  // ── Manage Hub (unified subscriber dashboard) ────────────────────────────────
  const { default: manageRouter } = await import("./routes/manage.js");
  app.use("/api/manage", manageRouter);

  // ── CRM Search (trigram-powered global search) ───────────────────────────────
  const { default: crmSearchRouter } = await import("./routes/crm-search.js");
  app.use("/api/manage/crm-search", crmSearchRouter);

  // Start the reminder schedulers (SMS + Email)
  startReminderScheduler();
  startEmailReminderScheduler();

  // Start the queue smart SMS scheduler
  startQueueSmsScheduler();

  // Start trial reminder emails (30 / 7 / 1 day before expiry)
  const { startTrialReminderScheduler } = await import("./services/trial-reminders.js");
  startTrialReminderScheduler();

  // Start daily low-balance alerts (platform credits < $5, SMS credits < 50)
  const { startLowBalanceScheduler } = await import("./services/low-balance-scheduler.js");
  startLowBalanceScheduler();

  // Start Google Reviews auto-sync (every 6 hours — new engine, new schema + legacy fallback)
  startGoogleReviewSyncScheduler();

  // Seed default illustration categories (no-op if already present)
  const { seedIllustrationCategories } = await import("./lib/seedIllustrationCategories.js");
  seedIllustrationCategories().catch(e => console.warn("[IllustrationSeed] non-fatal:", e?.message));

  // ── Revenue Intelligence Engine ──────────────────────────────────────────────
  const { default: intelligenceRouter } = await import("./routes/intelligence.js");
  app.use("/api/intelligence", requireNotSuspended, intelligenceRouter);

  const { default: intelligenceDemoRouter } = await import("./routes/intelligence-demo.js");
  app.use("/api/intelligence/demo", requireNotSuspended, intelligenceDemoRouter);

  const { startIntelligenceScheduler } = await import("./intelligence/orchestrator.js");
  startIntelligenceScheduler();

  // ── Enterprise Sync Engine ───────────────────────────────────────────────────
  const { default: syncRouter } = await import("./routes/sync.js");
  app.use("/api/sync", syncRouter);

  const { startReconciliationScheduler } = await import("./routes/sync-jobs.js");
  startReconciliationScheduler();

  // ── Contractor Payouts & Direct Deposit ─────────────────────────────────────
  const { default: contractorPayoutsRouter } = await import("./routes/contractorPayouts.js");
  app.use("/api/contractor-payouts", requireNotSuspended, contractorPayoutsRouter);

  // ── Commission Reserves & Salon Balance Management ───────────────────────────
  // Prevents salon owners from withdrawing funds reserved for contractor payouts.
  // IMPORTANT: do NOT mount a blanket auth gate on all /api/* here.
  // If we call `app.use("/api", isAuthenticated, ...)`, public website-builder
  // tenant routes like /api/tenant/:slug/site/* get blocked with 401.
  // Scope auth only to the commission-reserve endpoints themselves.
  const { default: commissionReservesRouter } = await import("./routes/commissionReserves.js");
  app.use(
    "/api",
    (req, res, next) => {
      const p = req.path;
      const needsAuth =
        p.startsWith("/salon/") ||
        p === "/commissions/record" ||
        p.startsWith("/admin/commission-reserves/");
      if (!needsAuth) return next();
      return isAuthenticated(req, res, next);
    },
    commissionReservesRouter,
  );

  // ── Subscription Plans & Feature Registry ───────────────────────────────────
  const { default: platformEmailCampaignsRouter } = await import("./routes/platformEmailCampaigns.js");
  app.use(platformEmailCampaignsRouter);

  // ── Subscription Plans & Feature Registry ───────────────────────────────────
  const { default: plansRouter } = await import("./routes/plans.js");
  app.use("/api/plans", isAuthenticated, plansRouter);

  // ── Owner Subscription (usage + subscribe) ───────────────────────────────────
  const { default: subscriptionRouter } = await import("./routes/subscription.js");
  app.use("/api/subscription", isAuthenticated, subscriptionRouter);

  // ── Stripe Billing & Wallet Funding ─────────────────────────────────────────
  const { default: billingRouter } = await import("./routes/billing.js");
  app.use("/api/billing", isAuthenticated, billingRouter);

  // ── Stripe Connect & Terminal (salon customer payments) ───────────────────────
  // ISOLATED from the SaaS billing system above. Funds flow salon→customer,
  // never touching Certxa. Requires STRIPE_CONNECT_CLIENT_ID env var.
  try {
    const { default: stripeConnectRouter } = await import("./routes/stripeConnect.js");

    // The OAuth callback (/api/payments/stripe/callback) MUST be public.
    // Stripe redirects the browser back to it from stripe.com — a cross-origin
    // redirect that can't carry the user's session cookie (SameSite policy).
    // Security for the callback is provided by validating the `state` parameter
    // and exchanging the one-time `code` with Stripe's servers, not by session auth.
    // Every other payments route remains behind isAuthenticated.
    // req.originalUrl is always the full URL regardless of mount stripping,
    // so this reliably bypasses auth for the OAuth redirect target.
    // Note: /stripe/callback is registered as a standalone public route in index.ts
    // before registerRoutes(), so it always wins over this authenticated router.
    // All other /api/payments/* routes correctly require authentication.
    const paymentsAuth = (req: any, res: any, next: any) =>
      isAuthenticated(req, res, next);

    app.use("/api/payments", paymentsAuth, stripeConnectRouter);
    console.log("[stripeConnect] Payment routes mounted at /api/payments");
  } catch (err: any) {
    console.warn("[stripeConnect] Failed to load connect router:", err?.message);
  }

  // ── Email Preference Centre ──────────────────────────────────────────────────
  const { default: emailPrefsRouter } = await import("./routes/emailPreferences.js");
  app.use("/api/settings/email-preferences", isAuthenticated, emailPrefsRouter);

  // ── One-click email unsubscribe (public — signed token, no session required) ─
  const { default: unsubscribeRouter } = await import("./routes/unsubscribe.js");
  app.use("/api/unsubscribe", unsubscribeRouter);

  // ── Illustration Category Library ────────────────────────────────────────────
  try {
    const { default: illustrationCategoriesRouter } = await import("./routes/illustrationCategories.js");
    app.use("/api/illustration-categories", isAuthenticated, illustrationCategoriesRouter);
  } catch (err: any) {
    console.error("[illustration-categories] Failed to load router (table may be missing — run migration 0041):", err?.message);
    app.use("/api/illustration-categories", (_req, res) => res.status(503).json({ error: "Illustration library unavailable — pending DB migration" }));
  }

  // ── Service Images Library ────────────────────────────────────────────────────
  try {
    const { default: serviceImagesRouter } = await import("./routes/serviceImages.js");
    app.use("/api/service-images", isAuthenticated, serviceImagesRouter);
  } catch (err: any) {
    console.error("[service-images] Failed to load router (table may be missing — run migration 0134):", err?.message);
    app.use("/api/service-images", (_req, res) => res.status(503).json({ error: "Service images unavailable — pending DB migration" }));
  }

  // ── GBP Post Automation Engine (Phase 3.1) ───────────────────────────────────
  try {
    const { default: gbpPostEngineRouter } = await import("./routes/gbpPostEngine.js");
    app.use("/api/google-business/post-engine", gbpPostEngineRouter);
  } catch (err: any) {
    console.error("[GBP Posts] Failed to load post-engine router:", err?.message);
  }

  // ── Website Gallery Photos ────────────────────────────────────────────────────
  try {
    const { default: galleryPhotosRouter } = await import("./routes/galleryPhotos.js");
    app.use("/api/google-business/gallery-photos", galleryPhotosRouter);
  } catch (err: any) {
    console.error("[Gallery Photos] Failed to load gallery-photos router:", err?.message);
  }

  // ── GBP Photo Automation Engine (Phase 3.2) ──────────────────────────────────
  try {
    const { default: gbpPhotoEngineRouter } = await import("./routes/gbpPhotoEngine.js");
    app.use("/api/google-business/photo-engine", gbpPhotoEngineRouter);
  } catch (err: any) {
    console.error("[GBP Photos] Failed to load photo-engine router:", err?.message);
  }

  // ── Blog ─────────────────────────────────────────────────────────────────────
  try {
    const { blogRouter } = await import("./routes/blog.js");
    app.use("/", blogRouter);
  } catch (err: any) {
    console.error("[blog] Failed to load blog router:", err?.message);
  }

  // ── Website Builder ──────────────────────────────────────────────────────────
  const { default: websiteBuilderRouter } = await import("./routes/index.js");
  app.use("/api", websiteBuilderRouter);

  // ── Autumn Demo — public endpoints, no auth required ────────────────────────

  // GET appointments for the demo calendar (public, read-only, scoped to one store)
  app.get("/api/autumn/demo-store-info", async (req, res) => {
    try {
      const storeId = parseInt((req.query.storeId as string) ?? "2");
      if (isNaN(storeId)) return res.status(400).json({ error: "Invalid storeId" });
      const { locations, staff } = await import("@shared/schema");
      const { eq, and, ne, isNull, or } = await import("drizzle-orm");
      const storeRows = await db.select({ id: locations.id, name: locations.name, phone: locations.phone })
        .from(locations).where(eq(locations.id, storeId)).limit(1);
      const staffRows = await db.select({ id: staff.id, name: staff.name, color: staff.color })
        .from(staff)
        .where(and(eq(staff.storeId, storeId), or(eq(staff.status, "active"), isNull(staff.status))))
        .orderBy(staff.id);
      const store = storeRows[0] ?? null;
      res.json({ store, staff: staffRows });
    } catch (err) {
      console.error("[autumn-demo-store-info] Error:", err);
      res.status(500).json({ error: "Failed to load store info" });
    }
  });

  app.get("/api/autumn/demo-calendar/appointments", async (req, res) => {
    try {
      const storeId = parseInt((req.query.storeId as string) ?? "2");
      if (isNaN(storeId)) return res.status(400).json({ error: "Invalid storeId" });
      const rawStaffId = req.query.staffId as string | undefined;
      const staffIdFilter = rawStaffId ? parseInt(rawStaffId) : null;

      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const { appointments, services, staff } = await import("@shared/schema");
      const { eq, and, gte, lt, not, inArray } = await import("drizzle-orm");

      const conditions: any[] = [
        eq(appointments.storeId, storeId),
        gte(appointments.date, weekStart),
        lt(appointments.date, weekEnd),
        not(inArray(appointments.status as any, ["cancelled", "no-show", "no_show"])),
      ];
      if (staffIdFilter !== null && !isNaN(staffIdFilter)) {
        conditions.push(eq(appointments.staffId, staffIdFilter));
      }

      const rows = await db
        .select({
          id: appointments.id,
          date: appointments.date,
          duration: appointments.duration,
          status: appointments.status,
          serviceName: services.name,
          staffName: staff.name,
        })
        .from(appointments)
        .leftJoin(services, eq(appointments.serviceId, services.id))
        .leftJoin(staff, eq(appointments.staffId, staff.id))
        .where(and(...conditions))
        .orderBy(appointments.date);

      res.json({ appointments: rows, weekStart, weekEnd });
    } catch (err) {
      console.error("[autumn-demo-calendar] Error:", err);
      res.status(500).json({ error: "Failed to load calendar" });
    }
  });

  app.post("/api/autumn/demo-request", express.json(), async (req, res) => {
    try {
      const { autumnDemoCallers } = await import("@shared/schema");
      const rawPhone: string = (req.body?.phone ?? "").toString().trim();
      if (!rawPhone) {
        return res.status(400).json({ error: "Phone number is required." });
      }
      // Normalise: strip everything except digits and leading +
      const normalised = rawPhone.replace(/[^\d+]/g, "");
      if (normalised.replace(/\D/g, "").length < 7) {
        return res.status(400).json({ error: "Please enter a valid phone number." });
      }

      // ── Duplicate guard: one demo per number per 24 hours ──────────────────
      // Prevents repeat demos and keeps call costs reasonable.
      const existing = await pool.query(
        `SELECT id FROM autumn_demo_callers
         WHERE phone = $1
           AND created_at > now() - interval '24 hours'
         LIMIT 1`,
        [normalised]
      );
      if (existing.rows.length > 0) {
        return res.status(429).json({
          error: "This number has already been used for a demo today. Each number is limited to one demo per day to keep costs fair — try again tomorrow!",
        });
      }

      const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
        ?? req.socket.remoteAddress
        ?? null;
      await db.insert(autumnDemoCallers).values({ phone: normalised, ip });
      return res.json({ ok: true });
    } catch (err) {
      console.error("[autumn-demo] Error saving demo caller:", err);
      return res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  });

  // ─── Ensure turn_assignment_log + support_tickets tables exist ──────────────
  (async () => {
    await waitForDb("routes-bootstrap");
    pool.query(`
    CREATE TABLE IF NOT EXISTS turn_assignment_log (
      id SERIAL PRIMARY KEY,
      store_id INTEGER NOT NULL,
      appointment_id INTEGER,
      assigned_staff_id INTEGER NOT NULL,
      turn_recommended_staff_id INTEGER,
      is_override BOOLEAN NOT NULL DEFAULT false,
      source TEXT NOT NULL DEFAULT 'turn_system',
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `).catch((e: any) => console.warn("[TurnLog] Table init warning:", e.message));
  })();

  // ─── Ensure support ticket tables exist ─────────────────────────────────────
  // Staff SMS OTP table — used for passwordless mobile app login
  pool.query(`
    CREATE TABLE IF NOT EXISTS staff_sms_otps (
      id SERIAL PRIMARY KEY,
      staff_id INTEGER NOT NULL,
      phone TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch((e: any) => console.warn("[StaffOTP] Table init warning:", e.message));

  pool.query(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL,
      ticket_number VARCHAR(32) NOT NULL UNIQUE,
      subject TEXT NOT NULL,
      description TEXT,
      priority VARCHAR(16) NOT NULL DEFAULT 'normal',
      status VARCHAR(16) NOT NULL DEFAULT 'open',
      assigned_agent_id INTEGER,
      assigned_agent_name VARCHAR(128),
      created_by_agent_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS support_ticket_messages (
      id SERIAL PRIMARY KEY,
      ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      author_type VARCHAR(16) NOT NULL DEFAULT 'user',
      author_name VARCHAR(128),
      agent_id INTEGER,
      content TEXT NOT NULL,
      is_internal BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `).catch((e: any) => console.warn("[SupportTickets] Table init warning:", e.message));

  // ─── Account-facing Support Ticket Routes ────────────────────────────────────

  // List my tickets
  app.get("/api/my/tickets", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ error: "No store" });
      const result = await pool.query(
        `SELECT t.*, 
          (SELECT COUNT(*)::int FROM support_ticket_messages WHERE ticket_id = t.id AND author_type = 'agent') AS agent_replies,
          (SELECT created_at FROM support_ticket_messages WHERE ticket_id = t.id ORDER BY created_at DESC LIMIT 1) AS last_message_at
         FROM support_tickets t
         WHERE t.account_id = $1
         ORDER BY t.updated_at DESC
         LIMIT 50`,
        [storeId]
      );
      return res.json(result.rows);
    } catch (e) {
      console.error("[my/tickets] list error:", e);
      return res.status(500).json({ error: "Failed to load tickets" });
    }
  });

  // Create a ticket
  app.post("/api/my/tickets", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ error: "No store" });
      const { subject, description, priority = "normal" } = req.body;
      if (!subject?.trim()) return res.status(400).json({ error: "Subject is required" });
      const ticketNum = `TK-${Date.now().toString(36).toUpperCase()}`;
      const result = await pool.query(
        `INSERT INTO support_tickets (account_id, ticket_number, subject, description, priority)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [storeId, ticketNum, subject.trim(), description?.trim() ?? null, priority]
      );
      const ticket = result.rows[0];
      // Insert the opening message
      if (description?.trim()) {
        await pool.query(
          `INSERT INTO support_ticket_messages (ticket_id, author_type, author_name, content) VALUES ($1, 'user', $2, $3)`,
          [ticket.id, (req.session as any).userName || "Account Owner", description.trim()]
        );
      }
      return res.status(201).json(ticket);
    } catch (e) {
      console.error("[my/tickets] create error:", e);
      return res.status(500).json({ error: "Failed to create ticket" });
    }
  });

  // Get a single ticket + messages
  app.get("/api/my/tickets/:id", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ error: "No store" });
      const ticketId = parseRouteId(req.params.id);
      if (!Number.isFinite(ticketId)) return res.status(400).json({ error: "Invalid ticket id" });
      const [ticketResult, messagesResult] = await Promise.all([
        pool.query(`SELECT * FROM support_tickets WHERE id = $1 AND account_id = $2`, [ticketId, storeId]),
        pool.query(
          `SELECT * FROM support_ticket_messages WHERE ticket_id = $1 AND is_internal = false ORDER BY created_at ASC`,
          [ticketId]
        ),
      ]);
      if (!ticketResult.rows[0]) return res.status(404).json({ error: "Ticket not found" });
      return res.json({ ticket: ticketResult.rows[0], messages: messagesResult.rows });
    } catch (e) {
      console.error("[my/tickets] get error:", e);
      return res.status(500).json({ error: "Failed to load ticket" });
    }
  });

  // Post a reply on a ticket
  app.post("/api/my/tickets/:id/messages", isAuthenticated, async (req, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(403).json({ error: "No store" });
      const ticketId = parseRouteId(req.params.id);
      if (!Number.isFinite(ticketId)) return res.status(400).json({ error: "Invalid ticket id" });
      const { content } = req.body;
      if (!content?.trim()) return res.status(400).json({ error: "Message content required" });
      // Verify ownership
      const check = await pool.query(`SELECT id FROM support_tickets WHERE id = $1 AND account_id = $2`, [ticketId, storeId]);
      if (!check.rows[0]) return res.status(404).json({ error: "Ticket not found" });
      const msgResult = await pool.query(
        `INSERT INTO support_ticket_messages (ticket_id, author_type, author_name, content) VALUES ($1, 'user', $2, $3) RETURNING *`,
        [ticketId, (req.session as any).userName || "Account Owner", content.trim()]
      );
      await pool.query(
        `UPDATE support_tickets SET status = 'open', updated_at = now() WHERE id = $1`,
        [ticketId]
      );
      return res.status(201).json(msgResult.rows[0]);
    } catch (e) {
      console.error("[my/tickets] reply error:", e);
      return res.status(500).json({ error: "Failed to send reply" });
    }
  });

  // POST /api/qr/checkin — staff portal: mark appointment as checked_in
  app.post("/api/qr/checkin", isAuthenticated, async (req: any, res: any) => {
    try {
      const { appointmentId } = req.body ?? {};
      const id = Number(appointmentId);
      if (!id || isNaN(id)) return res.status(400).json({ error: "appointmentId is required" });

      const existing = await storage.getAppointment(id);
      if (!existing) return res.status(404).json({ error: "Appointment not found" });

      const sessionStoreId = await resolveSessionStoreId(req);
      if (sessionStoreId && existing.storeId !== sessionStoreId) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (existing.status === "cancelled" || existing.status === "completed") {
        return res.status(409).json({ error: `Cannot check in a ${existing.status} appointment` });
      }

      await storage.updateAppointment(id, {
        status: "checked_in",
        checkedInAt: new Date(),
      } as any);

      return res.json({ ok: true, checkedInAt: new Date().toISOString() });
    } catch (err: any) {
      console.error("[qr/checkin] error:", err?.message);
      return res.status(500).json({ error: "Check-in failed" });
    }
  });

  // POST /api/qr/lookup — staff portal QR scan: look up an appointment by token
  // Supports: plain numeric ID, "BK:123", kiosk ticket URLs (/kiosk/:slug/ticket/:token)
  app.post("/api/qr/lookup", isAuthenticated, async (req: any, res: any) => {
    try {
      const { qrToken } = req.body ?? {};
      if (!qrToken || typeof qrToken !== "string") {
        return res.status(400).json({ error: "qrToken is required" });
      }

      const raw = qrToken.trim();

      let appointmentId: number | null = null;

      // ── 1. Kiosk ticket URL: https://*/kiosk/*/ticket/{token} ───────────────
      const kioskMatch = raw.match(/\/kiosk\/[^/]+\/ticket\/([^/?#]+)/i);
      if (kioskMatch) {
        const kioskToken = kioskMatch[1];
        const row = await pool.query(
          `SELECT appointment_id FROM kiosk_checkins WHERE token = $1 LIMIT 1`,
          [kioskToken]
        ).catch(() => null);
        const aptId = row?.rows?.[0]?.appointment_id;
        if (aptId) {
          appointmentId = Number(aptId);
        } else {
          return res.status(404).json({ error: "Booking not found" });
        }
      } else {
        // ── 2. Plain numeric ID or prefixed formats like "BK:123" / "APPT-123" ─
        const numericStr = raw.replace(/^(BK|APPT|APT)[:\-]?/i, "");
        const parsed = parseInt(numericStr, 10);
        if (!isNaN(parsed) && parsed > 0) appointmentId = parsed;
      }

      if (!appointmentId) {
        return res.status(404).json({ error: "Booking not found" });
      }

      const appointment = await storage.getAppointment(appointmentId);
      if (!appointment) {
        return res.status(404).json({ error: "Booking not found" });
      }

      // Build a friendly client name from related data
      const customer = (appointment as any).customer;
      const clientName = customer
        ? [customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
          customer.fullName ||
          "Guest"
        : "Guest";

      const service = (appointment as any).service;
      const serviceName = service?.name ?? "Appointment";

      const apptDate = appointment.date
        ? new Date(appointment.date).toLocaleString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        : "Unknown date";

      return res.json({
        found: true,
        appointmentId: appointment.id,
        bookingCode: String(appointment.id),
        clientName,
        service: serviceName,
        date: apptDate,
        status: appointment.status ?? "pending",
      });
    } catch (err: any) {
      console.error("[qr/lookup] error:", err?.message);
      return res.status(500).json({ error: "Lookup failed" });
    }
  });

  // ================================================================
  // PUBLIC KIOSK CHECK-IN SYSTEM (GoCheckin-style)
  // ================================================================

  await waitForDb("kiosk-bootstrap");
  pool.query(`
    CREATE TABLE IF NOT EXISTS kiosk_checkins (
      id SERIAL PRIMARY KEY,
      store_id INTEGER NOT NULL,
      client_id INTEGER,
      phone TEXT,
      client_name TEXT,
      services JSONB DEFAULT '[]',
      token TEXT UNIQUE NOT NULL,
      appointment_id INTEGER,
      status TEXT DEFAULT 'waiting',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '4 hours')
    )
  `).catch((err: any) => console.error("[kiosk] table init:", err?.message));

  // Extend kiosk_checkins with staff assignment columns + add-ons column
  await pool.query(`
    ALTER TABLE kiosk_checkins
      ADD COLUMN IF NOT EXISTS staff_id INTEGER,
      ADD COLUMN IF NOT EXISTS assigned_staff_name TEXT
  `).catch(() => {});
  await pool.query(`
    ALTER TABLE kiosk_checkins
      ADD COLUMN IF NOT EXISTS add_ons JSONB DEFAULT '[]'::jsonb
  `).catch(() => {});


  // GET /api/public/kiosk/:slug/config — store info + all services
  app.get("/api/public/kiosk/:slug/config", async (req, res) => {
    try {
      const { slug } = req.params;
      const [store] = await db.select().from(locations).where(eq(locations.bookingSlug, slug));
      if (!store) return res.status(404).json({ error: "Store not found" });
      const storeStatus3 = ((store as any).accountStatus ?? "active").toLowerCase();
      if (storeStatus3 === "suspended" || storeStatus3 === "canceled") {
        return res.json({
          accountSuspended: true,
          storeId: store.id,
          store: { id: store.id, name: store.name, phone: store.phone, address: store.address },
        });
      }

      const [settingsRow] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, store.id));
      const prefs = settingsRow?.preferences ? JSON.parse(settingsRow.preferences as string) : {};
      const ks = prefs.kioskSettings ?? {};

      if (ks.kioskEnabled === false) {
        return res.json({
          store: { id: store.id, name: store.name, phone: store.phone, address: store.address },
          services: [],
          kioskEnabled: false,
          welcomeHeadline: ks.welcomeHeadline ?? null,
          loyaltyPromoText: ks.loyaltyPromoText ?? null,
          categoryImages: ks.categoryImages ?? {},
          timezone: store.timezone ?? "UTC",
        });
      }

      const storeServices = await db.select({
        id: services.id,
        name: services.name,
        description: services.description,
        duration: services.duration,
        price: services.price,
        category: services.category,
        imageUrl: services.imageUrl,
        customIllustrationUrl: services.customIllustrationUrl,
        illustrationCategoryId: services.illustrationCategoryId,
        illustrationImageUrl: serviceIllustrationCategories.imageUrl,
      }).from(services)
        .leftJoin(serviceIllustrationCategories, eq(services.illustrationCategoryId, serviceIllustrationCategories.id))
        .where(and(eq(services.storeId, store.id), eq(services.isActive, true), eq(services.hiddenFromPublic, false)))
        .orderBy(asc(services.name));

      // Auto-resolve illustration images on-the-fly for any service that
      // hasn't been manually assigned a category yet.
      const needsAutoResolve = storeServices.some(s => !s.illustrationImageUrl && !s.customIllustrationUrl);
      let resolvedServices = storeServices;
      if (needsAutoResolve) {
        const { findIllustrationSlug, industryDefaultSlug } = await import("./lib/illustrationMatcher.js");
        // Fetch all active categories (slug → imageUrl map) once
        const allCats = await db.select({
          slug: serviceIllustrationCategories.slug,
          imageUrl: serviceIllustrationCategories.imageUrl,
        }).from(serviceIllustrationCategories)
          .where(eq(serviceIllustrationCategories.isActive, true));
        const catMap: Record<string, string | null> = {};
        for (const c of allCats) catMap[c.slug] = c.imageUrl;
        // Determine industry from store settings (fallback to NAIL_SALON)
        const industry = (ks.industry || prefs.industry || "NAIL_SALON") as any;
        const fallbackSlug = industryDefaultSlug(industry);
        resolvedServices = storeServices.map(s => {
          if (s.illustrationImageUrl || s.customIllustrationUrl) return s;
          const slug = findIllustrationSlug(s.name, industry) ?? fallbackSlug;
          const illustrationImageUrl = (slug && catMap[slug]) ? catMap[slug] : null;
          return { ...s, illustrationImageUrl };
        });
      }

      // Only show staff who are currently clocked in and eligible.
      // Mirrors autoAssignTechnician hard filters: excludes removed/deactivated,
      // and requires an open timeclock record (clock_out IS NULL) for today.
      // Use salon's local timezone so "today" is correct regardless of server TZ.
      const storeTz = store.timezone ?? "UTC";
      const todayDate = toZonedTime(new Date(), storeTz).toISOString().split("T")[0];
      const { rows: clockedInRows } = await pool.query(`
        SELECT DISTINCT s.id, s.name, s.role, s.color, s.avatar_thumb_url AS "avatarThumbUrl"
        FROM staff s
        INNER JOIN timeclock tc ON tc.staff_id = s.id
          AND tc.store_id = $1
          AND tc.work_date = $2
          AND tc.clock_out IS NULL
        WHERE s.store_id = $1
          AND s.status NOT IN ('removed', 'deactivated')
          AND s.show_on_calendar = true
        ORDER BY s.name
      `, [store.id, todayDate]);
      const storeStaff = clockedInRows;

      // Which services each clocked-in staff member is qualified to perform.
      // Empty array = no restriction set → treat as "can do all services".
      const clockedInIds: number[] = storeStaff.map((s: any) => s.id);
      const staffServiceIds: Record<number, number[]> = {};
      if (clockedInIds.length > 0) {
        const { rows: ssRows } = await pool.query(
          `SELECT staff_id, service_id FROM staff_services WHERE staff_id = ANY($1)`,
          [clockedInIds]
        );
        for (const row of ssRows) {
          if (!staffServiceIds[row.staff_id]) staffServiceIds[row.staff_id] = [];
          staffServiceIds[row.staff_id].push(row.service_id);
        }
      }

      // Staff who are currently busy (actively checked-in or serving a client right now).
      const { rows: busyNowRows } = await pool.query(`
        SELECT DISTINCT staff_id
        FROM appointments
        WHERE store_id = $1
          AND status IN ('checked_in', 'serving')
          AND date >= NOW() - INTERVAL '4 hours'
          AND staff_id IS NOT NULL
      `, [store.id]);
      const busyStaffIds: number[] = busyNowRows.map((r: any) => r.staff_id);

      // Active addons for this store, with the list of service IDs they're linked to.
      const { rows: addonRows } = await pool.query(`
        SELECT a.id, a.name, a.description, a.price::float AS price, a.duration,
               a.image_url AS "imageUrl",
               COALESCE(json_agg(sa.service_id) FILTER (WHERE sa.service_id IS NOT NULL), '[]') AS "serviceIds"
        FROM addons a
        LEFT JOIN service_addons sa ON sa.addon_id = a.id
        WHERE a.store_id = $1
          AND a.is_active = true
          AND a.hidden_from_public = false
        GROUP BY a.id, a.name, a.description, a.price, a.duration, a.image_url
        ORDER BY a.name
      `, [store.id]);

      // Fetch all active service options for this store's services
      const serviceIds = resolvedServices.map(s => s.id);
      const serviceOptionsMap: Record<number, Array<{ id: number; name: string; description: string | null; durationMinutes: number; price: number; isDefault: boolean; displayOrder: number }>> = {};
      if (serviceIds.length > 0) {
        const { rows: optionRows } = await pool.query(`
          SELECT id, service_id AS "serviceId", name, description,
                 duration_minutes AS "durationMinutes", price::float AS price,
                 is_default AS "isDefault", display_order AS "displayOrder"
          FROM service_options
          WHERE service_id = ANY($1) AND is_active = true
          ORDER BY display_order, name
        `, [serviceIds]);
        for (const opt of optionRows) {
          if (!serviceOptionsMap[opt.serviceId]) serviceOptionsMap[opt.serviceId] = [];
          serviceOptionsMap[opt.serviceId].push(opt);
        }
      }

      return res.json({
        store: {
          id: store.id,
          name: store.name,
          phone: store.phone,
          address: store.address,
        },
        services: resolvedServices.map(s => ({
          ...s,
          price: Number(s.price),
          optionCount: (serviceOptionsMap[s.id] ?? []).length,
        })),
        serviceOptionsMap,
        staff: storeStaff,
        staffServiceIds,
        busyStaffIds,
        addons: addonRows,
        kioskEnabled: true,
        welcomeHeadline: ks.welcomeHeadline ?? null,
        welcomeSubText: ks.welcomeSubText ?? null,
        loyaltyPromoText: ks.loyaltyPromoText ?? null,
        categoryImages: ks.categoryImages ?? {},
        timezone: store.timezone ?? "UTC",
        showServicePrice: ks.showServicePrice !== false,
        showServiceDuration: ks.showServiceDuration !== false,
        dualScreenMode: ks.dualScreenMode === true,
      });
    } catch (err) {
      console.error("[kiosk/config]", err);
      return res.status(500).json({ error: "Failed to load kiosk config" });
    }
  });

  // POST /api/public/kiosk/:slug/lookup — find client by 10-digit phone
  app.post("/api/public/kiosk/:slug/lookup", async (req, res) => {
    try {
      const { slug } = req.params;
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ error: "Phone required" });

      const [store] = await db.select().from(locations).where(eq(locations.bookingSlug, slug));
      if (!store) return res.status(404).json({ error: "Store not found" });

      // Normalise to last 10 digits — matches both 10-digit input and E.164 stored values.
      const digits = String(phone).replace(/\D/g, "").slice(-10);
      if (digits.length < 7) return res.status(400).json({ error: "Phone too short" });

      // Phones live exclusively in client_phones.phone_number_e164 (E.164 format).
      // Compare the last 10 stripped digits for reliable US number matching regardless
      // of how the number was stored (+1XXXXXXXXXX, 1XXXXXXXXXX, or XXXXXXXXXX).
      const { rows: clientRows } = await pool.query(
        `SELECT DISTINCT cl.id
         FROM clients cl
         JOIN client_phones cp ON cp.client_id = cl.id
         WHERE cl.store_id = $1
           AND RIGHT(REGEXP_REPLACE(cp.phone_number_e164, '[^0-9]', '', 'g'), 10) = $2
         LIMIT 1`,
        [store.id, digits]
      );

      if (!clientRows.length) return res.json({ found: false });

      const [client] = await db.select().from(clients)
        .where(and(eq(clients.storeId, store.id), eq(clients.id, Number(clientRows[0].id))))
        .limit(1);

      if (!client) return res.json({ found: false });

      // ── Check for today's appointment for this client ────────────────────────
      // Lower bound: scheduled time must be within the last 30 minutes or still
      // upcoming — prevents latching onto stale appointments from earlier in the day.
      // Upper bound: end of today in the salon's local timezone.
      const storeTzLookup = (store as any).timezone ?? "UTC";
      const localNow      = toZonedTime(new Date(), storeTzLookup);
      const localEnd      = new Date(localNow);
      localEnd.setHours(23, 59, 59, 999);
      const todayEnd      = fromZonedTime(localEnd, storeTzLookup);

      // Search appointments by phone — matches via client_phones E.164 last-10-digit comparison.
      const { rows: apptRows } = await pool.query(`
        SELECT a.id, a.date, a.status,
               s.name  AS service_name,
               st.name AS staff_name,
               st.avatar_thumb_url AS staff_avatar_thumb
        FROM appointments a
        LEFT JOIN services  s  ON s.id  = a.service_id
        LEFT JOIN staff     st ON st.id = a.staff_id
        WHERE a.store_id = $1
          AND a.date >= NOW() - INTERVAL '30 minutes'
          AND a.date <= $2
          AND a.status NOT IN ('cancelled', 'no_show', 'completed', 'checked_in')
          AND a.customer_id IN (
            SELECT cl.id FROM clients cl
            JOIN client_phones cp ON cp.client_id = cl.id
            WHERE RIGHT(REGEXP_REPLACE(cp.phone_number_e164, '[^0-9]', '', 'g'), 10) = $3
              AND cl.store_id = $1
          )
        ORDER BY a.date ASC
        LIMIT 1
      `, [store.id, todayEnd.toISOString(), digits]);

      let todayAppointment = null;
      if (apptRows.length > 0) {
        const appt = apptRows[0];
        // Mark the appointment as checked in immediately
        await pool.query(
          `UPDATE appointments SET status = 'checked_in', checked_in_at = NOW() WHERE id = $1`,
          [appt.id]
        );
        void logActivityEvent({
          storeId: store.id,
          eventType: "check_in",
          message: `${client.fullName || "A client"} checked in`,
        });
        todayAppointment = {
          id:                  appt.id,
          serviceName:         appt.service_name       ?? "Appointment",
          staffName:           appt.staff_name         ?? null,
          staffAvatarThumbUrl: appt.staff_avatar_thumb ?? null,
          appointmentTime:     appt.date,
        };
      }

      return res.json({
        found: true,
        client: {
          id:            client.id,
          name:          client.fullName,
          loyaltyPoints: (client as any).loyaltyPoints ?? 0,
          totalVisits:   (client as any).totalVisits   ?? 0,
        },
        todayAppointment,
      });
    } catch (err) {
      console.error("[kiosk/lookup]", err);
      return res.status(500).json({ error: "Lookup failed" });
    }
  });

  // POST /api/public/kiosk/:slug/checkin — create check-in session + walk-in appointment
  app.post("/api/public/kiosk/:slug/checkin", async (req, res) => {
    try {
      const { slug } = req.params;
      const { clientId, clientName, phone, services: selectedServices, addons: rawAddons, staffId: requestedStaffId } = req.body;
      // Normalise add-ons: coerce null / non-array payloads to an empty array
      const selectedAddons: any[] = Array.isArray(rawAddons) ? rawAddons : [];

      const [store] = await db.select().from(locations).where(eq(locations.bookingSlug, slug));
      if (!store) return res.status(404).json({ error: "Store not found" });

      if (!selectedServices?.length) return res.status(400).json({ error: "Select at least one service" });

      const primaryServiceId = Number(selectedServices[0]?.id);
      if (!Number.isFinite(primaryServiceId)) {
        return res.status(400).json({ error: "Invalid service selection" });
      }

      const nameToUse: string = clientName?.trim() || "Walk-in Guest";
      const token = crypto.randomBytes(24).toString("hex");
      // `now` is a real UTC instant (correct regardless of the salon's local
      // timezone — Date objects are always timezone-agnostic internally).
      // The salon's stored timezone only matters for *display* and for
      // "what day/hour is it locally" boundary math (e.g. autoAssignTechnician),
      // never for constructing this timestamp itself.
      const now = new Date();
      const addonDuration = selectedAddons.reduce((sum: number, a: any) => sum + (Number(a.duration) || 0), 0);
      const totalDuration = selectedServices.reduce((sum: number, s: any) => sum + (Number(s.duration) || 30), 0) + addonDuration;

      // ── 0. Idempotency guard ─────────────────────────────────────────────────
      // Prevent duplicate walk-in appointments from a double-tapped submit button
      // or a client re-checking in while already active. Without this, the
      // 5-minute background reconciliation job (sync-jobs.ts) may later find two
      // overlapping rows for the same client and silently cancel one of them —
      // surprising staff with a booking that "cancels itself" for no visible reason.
      //
      // A read-then-write check alone is racy if two check-in requests for the
      // same client land at nearly the same instant (e.g. a double-tapped
      // button firing two overlapping HTTP requests), so this is serialized
      // with a Postgres transaction-scoped advisory lock keyed on
      // (storeId, clientId) — the lock is released automatically at commit.
      // A numeric, safely-castable clientId — never pass an unvalidated value
      // into the advisory lock key or a customerId equality filter.
      const safeClientId: number | null =
        clientId != null && Number.isFinite(Number(clientId)) ? Number(clientId) : null;
      if (clientId != null && safeClientId === null) {
        return res.status(400).json({ error: "Invalid clientId" });
      }

      const checkDuplicateCheckin = async (
        tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
      ): Promise<number | null> => {
        if (safeClientId === null) return null;
        await tx.execute(
          sql`select pg_advisory_xact_lock(${store.id}::bigint, ${safeClientId}::bigint)`
        );
        // Lower bound only — deliberately no upper bound here. `now` is captured
        // once at request-entry time, but the duplicate row we're racing against
        // may have been inserted by a concurrent request that captured its own
        // slightly-later `now` (e.g. request B starts a beat after request A but
        // wins the advisory lock first). An `lte(appointments.date, now)` upper
        // bound would then exclude B's row from A's dedupe check purely because
        // B's timestamp is a few milliseconds later than A's — reopening the
        // exact race this lock exists to close. A recent-window lower bound is
        // sufficient: any non-terminal appointment for this client created in
        // the last 15 minutes is a duplicate check-in, regardless of whether its
        // timestamp lands a moment before or after this request's own `now`.
        const recentCutoff = new Date(now.getTime() - 15 * 60_000);
        const [existingActive] = await tx
          .select({ id: appointments.id })
          .from(appointments)
          .where(
            and(
              eq(appointments.storeId, store.id),
              eq(appointments.customerId, safeClientId),
              gte(appointments.date, recentCutoff),
              notInArray(appointments.status, ["cancelled", "completed", "no_show", "no-show"])
            )
          )
          .limit(1);
        return existingActive?.id ?? null;
      };

      if (safeClientId !== null) {
        const duplicateCheckinAppointmentId = await db.transaction((tx) => checkDuplicateCheckin(tx));
        if (duplicateCheckinAppointmentId) {
          console.warn(`[kiosk/checkin] duplicate check-in suppressed for client ${safeClientId} at store ${store.id} — appointment ${duplicateCheckinAppointmentId} already active`);
          return res.status(409).json({ error: "You're already checked in", appointmentId: duplicateCheckinAppointmentId });
        }
      }

      // ── 1. Resolve assigned staff ────────────────────────────────────────────
      // clientRequestedStaff is only true when a specific staff pick passes validation
      let clientRequestedStaffBool = false;
      let assignedStaffId: number | null = requestedStaffId ? Number(requestedStaffId) : null;
      let assignedStaffName: string | null = null;

      if (assignedStaffId) {
        // Client picked a specific stylist — validate store ownership and eligibility
        const [sf] = await db.select({ name: staff.name }).from(staff).where(
          and(
            eq(staff.id, assignedStaffId),
            eq(staff.storeId, store.id),
            notInArray(staff.status, ["removed", "deactivated"])
          )
        );
        if (sf) {
          assignedStaffName = sf.name;
          clientRequestedStaffBool = true;
        } else {
          // Cross-store or ineligible staff ID — treat as no-preference
          console.warn(`[kiosk/checkin] staffId ${assignedStaffId} failed store/eligibility validation for store ${store.id} — falling through to auto-assign`);
          assignedStaffId = null;
        }
      }

      if (!assignedStaffId) {
        // No preference — use autoAssignTechnician (same engine as manual bookings)
        try {
          const result = await autoAssignTechnician({
            storeId: store.id,
            serviceId: primaryServiceId,
            date: now,
            duration: totalDuration,
          });
          if (result.assigned && result.staffId) {
            assignedStaffId = result.staffId;
            assignedStaffName = result.staffName;
          }
        } catch (assignErr) {
          console.warn("[kiosk/checkin] autoAssign error:", assignErr);
        }
        // If autoAssignTechnician finds no eligible staff, assignedStaffId stays null.
        // Unlike a manual booking, a kiosk walk-in with no assigned staff has no
        // calendar to validate against — the booking engine cannot confirm
        // availability for "nobody", and creating the appointment anyway would
        // reintroduce the exact double-booking risk this route is being fixed
        // to prevent. So this is now a hard rejection rather than a silent
        // unassigned appointment.
      }

      if (!assignedStaffId) {
        console.warn(`[kiosk/checkin] no technician available for store ${store.id} — rejecting check-in`);
        return res.status(409).json({
          error: "No technician is available to check you in right now — please see the front desk.",
        });
      }

      // ── 2. Create walk-in appointment through the booking engine ─────────────
      // Every appointment-creation path in this codebase (public online booking,
      // AI receptionist, admin) routes through bookingEngine.ts so business
      // hours, same-day rules, and staff-conflict detection are enforced
      // consistently. The kiosk route previously bypassed this entirely with a
      // raw INSERT — no availability check, no conflict detection — which is
      // how a walk-in could end up double-booked against an existing
      // appointment for the same technician.
      const storeTz = (store as any).timezone || "UTC";

      const slotCheck = await validateBookingSlot({
        storeId: store.id,
        timezone: storeTz,
        startTime: now,
        durationMinutes: totalDuration,
        staffId: assignedStaffId,
        // Kiosk check-ins are inherently same-day/right-now walk-ins — the
        // same-day and past-date guards exist for advance online booking, not
        // for someone standing at the salon.
        allowSameDay: true,
      });
      if (!slotCheck.ok) {
        console.warn(`[kiosk/checkin] slot validation failed for store ${store.id} staff ${assignedStaffId}: ${slotCheck.error.code} — ${slotCheck.error.message}`);
        return res.status(409).json({ error: slotCheck.error.message });
      }

      // Re-verify no client-side duplicate slipped in while staff assignment /
      // slot validation were running (those steps make their own DB
      // round-trips, so time has passed since the first check above), then
      // hand off to atomicCreateBooking for the authoritative staff-conflict
      // check + INSERT — all inside ONE transaction, so the client-dedupe
      // advisory lock stays held through the actual write instead of being
      // released beforehand. atomicCreateBooking itself takes a second
      // advisory lock scoped to (storeId, staffId) before its conflict check,
      // which serializes concurrent writers for that technician and closes
      // the write-skew race a plain SELECT-then-INSERT would leave open.
      let appointmentId: number | null = null;
      let rejection: { status: number; body: Record<string, unknown> } | null = null;
      try {
        appointmentId = await db.transaction(async (tx) => {
          const dupeId = await checkDuplicateCheckin(tx);
          if (dupeId) {
            console.warn(`[kiosk/checkin] duplicate check-in caught at insert time for client ${safeClientId} at store ${store.id} — appointment ${dupeId} already active`);
            rejection = { status: 409, body: { error: "You're already checked in", appointmentId: dupeId } };
            return null;
          }

          const createResult = await atomicCreateBooking({
            storeId: store.id,
            timezone: storeTz,
            startTime: now,
            durationMinutes: totalDuration,
            staffId: assignedStaffId!,
            serviceId: primaryServiceId,
            customerId: safeClientId,
            status: "checked_in",
            checkedInAt: now,
            clientRequestedStaff: clientRequestedStaffBool,
          }, tx);

          if (!createResult.ok) {
            console.warn(`[kiosk/checkin] atomicCreateBooking rejected for store ${store.id} staff ${assignedStaffId}: ${createResult.error.code} — ${createResult.error.message}`);
            rejection = { status: 409, body: { error: createResult.error.message } };
            return null;
          }
          return createResult.data.id;
        });
      } catch (apptErr: any) {
        console.warn("[kiosk/checkin] appt creation failed:", apptErr?.message);
        return res.status(500).json({ error: "Could not create check-in appointment" });
      }
      if (rejection) {
        const r = rejection as { status: number; body: Record<string, unknown> };
        return res.status(r.status).json(r.body);
      }

      // ── 3. Create kiosk check-in record ─────────────────────────────────────
      const e164KioskPhone = phone ? (toE164US(phone) ?? phone) : null;
      await pool.query(
        `INSERT INTO kiosk_checkins
           (store_id, client_id, phone, client_name, services, add_ons, token, appointment_id, status, staff_id, assigned_staff_name)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, 'waiting', $9, $10)`,
        [store.id, clientId ?? null, e164KioskPhone, nameToUse,
          JSON.stringify(selectedServices), JSON.stringify(selectedAddons),
          token, appointmentId, assignedStaffId, assignedStaffName]
      );

      void logActivityEvent({
        storeId: store.id,
        eventType: "walk_in",
        message: assignedStaffName
          ? `Walk-in assigned to ${assignedStaffName}`
          : `${nameToUse || "A walk-in"} checked in`,
      });

      return res.json({
        success: true,
        token,
        appointmentId,
        clientName: nameToUse,
        services: selectedServices,
        addons: selectedAddons,
        staffId: assignedStaffId,
        staffName: assignedStaffName,
      });
    } catch (err) {
      console.error("[kiosk/checkin]", err);
      return res.status(500).json({ error: "Check-in failed" });
    }
  });

  // POST /api/public/kiosk/:slug/missed-you-sms — send booking link SMS after walk-in declines wait
  app.post("/api/public/kiosk/:slug/missed-you-sms", async (req, res) => {
    try {
      const { slug } = req.params;
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ error: "Phone required" });

      const e164MissedPhone = toE164US(phone);
      if (!e164MissedPhone) return res.status(400).json({ error: "Invalid phone number" });

      const [store] = await db.select().from(locations).where(eq(locations.bookingSlug, slug));
      if (!store) return res.status(404).json({ error: "Store not found" });

      const bookingLink = `https://certxa.com/book/${slug}`;
      const message = `We're sorry we missed you today! Here is our online booking link to schedule an appointment: ${bookingLink}`;

      const { sendSms } = await import("./sms");
      const result = await sendSms(store.id, e164MissedPhone, message, "missed_walkin");

      return res.json({ success: true, skipped: result.skipped ?? false });
    } catch (err) {
      console.error("[kiosk/missed-you-sms]", err);
      return res.status(500).json({ error: "Failed to send SMS" });
    }
  });

  // POST /api/public/kiosk/:slug/noshow-waitlist — join no-show waitlist when fully booked (>1hr wait)
  app.post("/api/public/kiosk/:slug/noshow-waitlist", async (req, res) => {
    try {
      const { slug } = req.params;
      const { phone, name, clientId } = req.body as { phone?: string; name?: string; clientId?: number | null };
      if (!phone) return res.status(400).json({ error: "Phone number required" });

      const e164NoShowPhone = toE164US(phone);
      if (!e164NoShowPhone) return res.status(400).json({ error: "Invalid phone number" });

      const [store] = await db.select().from(locations).where(eq(locations.bookingSlug, slug));
      if (!store) return res.status(404).json({ error: "Store not found" });

      const todayStr = new Date().toISOString().split("T")[0];

      // Prevent duplicates — one entry per phone per store per day (match on E.164)
      const { rows: existing } = await pool.query(
        `SELECT id FROM waitlist
         WHERE store_id = $1
           AND customer_phone = $2
           AND notes = 'kiosk_noshow_waitlist'
           AND status IN ('waiting', 'notified')
           AND DATE(created_at) = $3
         LIMIT 1`,
        [store.id, e164NoShowPhone, todayStr]
      );
      if (existing.length > 0) {
        return res.json({ success: true, alreadyQueued: true });
      }

      // Resolve clientId from E.164 phone via client_phones table (canonical lookup)
      // client_phones has no store_id column — must join through clients table
      let resolvedClientId: number | null = clientId ?? null;
      if (!resolvedClientId) {
        const { rows: cRows } = await pool.query(
          `SELECT cp.client_id AS id
           FROM client_phones cp
           JOIN clients cl ON cl.id = cp.client_id
           WHERE cp.phone_number_e164 = $1
             AND cl.store_id = $2
           LIMIT 1`,
          [e164NoShowPhone, store.id]
        );
        resolvedClientId = cRows[0]?.id ?? null;
      }

      await db.insert(waitlist).values({
        storeId: store.id,
        customerId: resolvedClientId,
        customerName: name ?? "Walk-in Guest",
        customerPhone: e164NoShowPhone,
        status: "waiting",
        notes: "kiosk_noshow_waitlist",
        preferredDate: new Date(),
      });

      return res.json({ success: true, alreadyQueued: false });
    } catch (err) {
      console.error("[kiosk/noshow-waitlist]", err);
      return res.status(500).json({ error: "Failed to join waitlist" });
    }
  });

  // GET /api/public/kiosk/:slug/availability — real-time staff availability + wait estimate
  app.get("/api/public/kiosk/:slug/availability", async (req, res) => {
    try {
      const { slug } = req.params;
      const [store] = await db.select().from(locations).where(eq(locations.bookingSlug, slug));
      if (!store) return res.status(404).json({ error: "Store not found" });
      const storeStatusKiosk = ((store as any).accountStatus ?? "active").toLowerCase();
      if (storeStatusKiosk === "suspended" || storeStatusKiosk === "canceled") {
        return res.status(403).json({ error: "This business is not currently accepting bookings." });
      }

      const storeTz    = (store as any).timezone ?? "UTC";
      const todayDateStr = toZonedTime(new Date(), storeTz).toISOString().split("T")[0];

      // 1. Clocked-in staff count — mirrors the config endpoint filter exactly
      //    (show_on_calendar = true ensures the stylist picker and availability agree)
      const { rows: clockedRows } = await pool.query(`
        SELECT COUNT(DISTINCT s.id)::int AS count
        FROM staff s
        INNER JOIN timeclock tc ON tc.staff_id = s.id
          AND tc.store_id = $1
          AND tc.work_date = $2
          AND tc.clock_out IS NULL
        WHERE s.store_id = $1
          AND s.status NOT IN ('removed', 'deactivated')
          AND s.show_on_calendar = true
      `, [store.id, todayDateStr]);
      const clockedInCount: number = Number(clockedRows[0]?.count ?? 0);

      // 2. Currently busy staff (actively serving someone right now)
      const { rows: busyRows } = await pool.query(`
        SELECT COUNT(DISTINCT staff_id)::int AS count
        FROM appointments
        WHERE store_id = $1
          AND status IN ('checked_in', 'serving')
          AND date >= NOW() - INTERVAL '4 hours'
          AND staff_id IS NOT NULL
      `, [store.id]);
      const busyCount: number = Number(busyRows[0]?.count ?? 0);

      // 2b. Staff who are busy RIGHT NOW but finish within the next 10 minutes
      //     — treat these as "soon available" so walk-ins aren't turned away unnecessarily
      const { rows: soonRows } = await pool.query(`
        SELECT COUNT(DISTINCT staff_id)::int AS count
        FROM appointments
        WHERE store_id = $1
          AND status IN ('checked_in', 'serving')
          AND staff_id IS NOT NULL
          AND (date + (duration * INTERVAL '1 minute')) BETWEEN NOW() AND NOW() + INTERVAL '10 minutes'
      `, [store.id]);
      const soonAvailableCount: number = Number(soonRows[0]?.count ?? 0);

      // 3. Walk-in queue depth (kiosk checkins still waiting)
      const { rows: queueRows } = await pool.query(`
        SELECT COUNT(*)::int AS count
        FROM kiosk_checkins
        WHERE store_id = $1
          AND status IN ('waiting', 'called')
          AND expires_at > NOW()
      `, [store.id]);
      const waitingCount: number = Number(queueRows[0]?.count ?? 0);

      // 4. Average service duration from recent appointments (fallback 45 min)
      const { rows: durRows } = await pool.query(`
        SELECT COALESCE(AVG(a.duration)::int, 45) AS avg_dur
        FROM appointments a
        WHERE a.store_id = $1
          AND a.date >= NOW() - INTERVAL '8 hours'
          AND a.duration IS NOT NULL AND a.duration > 0
      `, [store.id]);
      const avgDuration: number = Number(durRows[0]?.avg_dur ?? 45);

      const availableStaff = Math.max(0, clockedInCount - busyCount);
      // "Available" means free right now OR finishing within 10 minutes
      const hasAvailableStaff = availableStaff > 0 || soonAvailableCount > 0;

      let estimatedWaitMinutes = 0;
      if (!hasAvailableStaff) {
        if (clockedInCount === 0) {
          estimatedWaitMinutes = 60; // no staff at all
        } else {
          // (people being served + queued ahead) distributed across staff
          const totalBusy = busyCount + waitingCount;
          estimatedWaitMinutes = Math.max(15, Math.round((totalBusy / clockedInCount) * avgDuration));
        }
      }

      return res.json({
        hasAvailableStaff,
        estimatedWaitMinutes,
        clockedInCount,
        availableStaff,
        soonAvailableCount,
        waitingCount,
      });
    } catch (err) {
      console.error("[kiosk/availability]", err);
      return res.status(500).json({ error: "Failed to check availability" });
    }
  });

  // GET /api/public/kiosk/ticket/:token — fetch check-in by token (for QR scan)
  app.get("/api/public/kiosk/ticket/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const { rows } = await pool.query(
        `SELECT kc.*, loc.name AS store_name, loc.address AS store_address,
                loc.timezone AS store_timezone
         FROM kiosk_checkins kc
         JOIN locations loc ON loc.id = kc.store_id
         WHERE kc.token = $1 AND kc.expires_at > NOW()
         LIMIT 1`,
        [token]
      );
      if (!rows.length) return res.status(404).json({ error: "Ticket not found or expired" });
      const row = rows[0];
      return res.json({
        token: row.token,
        clientName: row.client_name,
        phone: row.phone,
        services: row.services ?? [],
        status: row.status,
        appointmentId: row.appointment_id,
        staffName: row.assigned_staff_name ?? null,
        createdAt: row.created_at,
        storeName: row.store_name,
        storeAddress: row.store_address,
        storeTimezone: row.store_timezone ?? null,
      });
    } catch (err) {
      console.error("[kiosk/ticket]", err);
      return res.status(500).json({ error: "Failed to fetch ticket" });
    }
  });

  // PUT /api/public/kiosk/ticket/:token/status — update ticket status
  app.put("/api/public/kiosk/ticket/:token/status", async (req, res) => {
    try {
      const { token } = req.params;
      const { status } = req.body;
      if (!["waiting", "called", "serving", "completed"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      // Fetch checkin before update to get phone + store context for SMS
      const { rows: checkinRows } = await pool.query(
        `SELECT kc.phone, kc.client_name, kc.store_id, loc.name AS store_name
         FROM kiosk_checkins kc
         JOIN locations loc ON loc.id = kc.store_id
         WHERE kc.token = $1 LIMIT 1`,
        [token]
      );
      await pool.query(`UPDATE kiosk_checkins SET status = $1 WHERE token = $2`, [status, token]);
      // SMS fire-and-forget when client is called to chair and has a phone number
      if (status === "called" && checkinRows.length > 0 && checkinRows[0].phone) {
        const { phone, client_name, store_id, store_name } = checkinRows[0];
        const firstName = (client_name || "").split(" ")[0] || "there";
        const body = `Hi ${firstName}! You've been called to your chair at ${store_name}. Head on over now! ✂️`;
        const { sendSms } = await import("./sms");
        sendSms(Number(store_id), phone, body, "kiosk_called").catch(() => null);
      }
      return res.json({ success: true });
    } catch (err) {
      console.error("[kiosk/status]", err);
      return res.status(500).json({ error: "Failed to update status" });
    }
  });

  // ── Walk-In Board + Turn System (authenticated) ─────────────────────────────

  // GET /api/kiosk/walkins/today — all of today's check-ins across all statuses
  app.get("/api/kiosk/walkins/today", isAuthenticated, async (req: any, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(400).json({ error: "No store context" });

      // Look up the salon's configured timezone so "today" is evaluated in local time,
      // not UTC. Without this a US-Eastern salon at 11pm (= 4am UTC next day) would see
      // its check-ins disappear from the board at midnight UTC.
      const [storeRow] = await db.select({ timezone: locations.timezone }).from(locations).where(eq(locations.id, storeId));
      const storeTz = storeRow?.timezone ?? "UTC";

      // Auto-expire "waiting" check-ins that are more than 1 hour old
      await pool.query(
        `UPDATE kiosk_checkins SET status = 'expired'
         WHERE store_id = $1 AND status = 'waiting' AND created_at < NOW() - INTERVAL '1 hour'`,
        [storeId]
      );

      const { rows } = await pool.query(`
        SELECT kc.id, kc.token, kc.client_name, kc.phone, kc.services,
               kc.status, kc.appointment_id, kc.created_at,
               kc.staff_id, kc.assigned_staff_name,
               s.name AS staff_name, s.color AS staff_color, s.avatar_thumb_url AS staff_avatar
        FROM kiosk_checkins kc
        LEFT JOIN staff s ON s.id = kc.staff_id
        WHERE kc.store_id = $1
          AND (kc.created_at AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date
          AND kc.status NOT IN ('completed', 'expired')
        ORDER BY
          CASE kc.status
            WHEN 'serving'   THEN 1
            WHEN 'called'    THEN 2
            WHEN 'waiting'   THEN 3
            ELSE 4
          END, kc.created_at ASC
      `, [storeId, storeTz]);
      return res.json(rows.map((r: any) => ({
        id:            r.id,
        token:         r.token,
        clientName:    r.client_name,
        phone:         r.phone,
        services:      r.services ?? [],
        status:        r.status,
        appointmentId: r.appointment_id,
        staffId:       r.staff_id,
        staffName:     r.staff_name ?? r.assigned_staff_name ?? null,
        staffColor:    r.staff_color ?? null,
        staffAvatar:   r.staff_avatar ?? null,
        createdAt:     r.created_at,
      })));
    } catch (err) {
      console.error("[kiosk/walkins/today]", err);
      return res.status(500).json({ error: "Failed to load walk-ins" });
    }
  });

  // GET /api/kiosk/board — live queue for staff
  app.get("/api/kiosk/board", isAuthenticated, async (req: any, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(400).json({ error: "No store context" });
      const { rows } = await pool.query(`
        SELECT kc.id, kc.token, kc.client_name, kc.phone, kc.services,
               kc.status, kc.appointment_id, kc.created_at,
               kc.staff_id, kc.assigned_staff_name,
               s.name AS staff_name, s.color AS staff_color, s.avatar_thumb_url AS staff_avatar
        FROM kiosk_checkins kc
        LEFT JOIN staff s ON s.id = kc.staff_id
        WHERE kc.store_id = $1
          AND kc.expires_at > NOW()
          AND (kc.status != 'completed' OR kc.created_at > NOW() - INTERVAL '30 minutes')
        ORDER BY
          CASE kc.status
            WHEN 'serving'   THEN 1
            WHEN 'called'    THEN 2
            WHEN 'waiting'   THEN 3
            WHEN 'completed' THEN 4
            ELSE 5
          END, kc.created_at ASC
      `, [storeId]);
      return res.json(rows.map((r: any) => ({
        id:            r.id,
        token:         r.token,
        clientName:    r.client_name,
        phone:         r.phone,
        services:      r.services ?? [],
        status:        r.status,
        appointmentId: r.appointment_id,
        staffId:       r.staff_id,
        staffName:     r.staff_name ?? r.assigned_staff_name ?? null,
        staffColor:    r.staff_color ?? null,
        staffAvatar:   r.staff_avatar ?? null,
        createdAt:     r.created_at,
      })));
    } catch (err) {
      console.error("[kiosk/board]", err);
      return res.status(500).json({ error: "Failed to load board" });
    }
  });

  // PATCH /api/kiosk/board/:id/status — update check-in status
  app.patch("/api/kiosk/board/:id/status", isAuthenticated, async (req: any, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(400).json({ error: "No store context" });
      const { status } = req.body;
      if (!["waiting","called","serving","completed"].includes(status))
        return res.status(400).json({ error: "Invalid status" });
      await pool.query(
        `UPDATE kiosk_checkins SET status = $1 WHERE id = $2 AND store_id = $3`,
        [status, req.params.id, storeId]
      );
      return res.json({ success: true });
    } catch (err) {
      console.error("[kiosk/board/status]", err);
      return res.status(500).json({ error: "Failed to update status" });
    }
  });

  // PATCH /api/kiosk/board/:id/assign — assign a staff member to a check-in
  app.patch("/api/kiosk/board/:id/assign", isAuthenticated, async (req: any, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(400).json({ error: "No store context" });
      const { staffId } = req.body;
      const [sf] = staffId
        ? await db.select({ name: staff.name }).from(staff).where(eq(staff.id, staffId))
        : [{ name: null }];
      await pool.query(
        `UPDATE kiosk_checkins SET staff_id = $1, assigned_staff_name = $2 WHERE id = $3 AND store_id = $4`,
        [staffId ?? null, sf?.name ?? null, req.params.id, storeId]
      );
      return res.json({ success: true });
    } catch (err) {
      console.error("[kiosk/board/assign]", err);
      return res.status(500).json({ error: "Failed to assign" });
    }
  });

  // DELETE /api/kiosk/board/:id — permanently remove a check-in
  app.delete("/api/kiosk/board/:id", isAuthenticated, async (req: any, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(400).json({ error: "No store context" });
      await pool.query(
        `DELETE FROM kiosk_checkins WHERE id = $1 AND store_id = $2`,
        [req.params.id, storeId]
      );
      return res.json({ success: true });
    } catch (err) {
      console.error("[kiosk/board/delete]", err);
      return res.status(500).json({ error: "Failed to delete check-in" });
    }
  });

  // POST /api/kiosk/board/:id/sms-opening — send "spot opened up" SMS to waiting client
  app.post("/api/kiosk/board/:id/sms-opening", isAuthenticated, async (req: any, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(400).json({ error: "No store context" });
      const { rows } = await pool.query(
        `SELECT kc.client_name, kc.phone FROM kiosk_checkins kc
         WHERE kc.id = $1 AND kc.store_id = $2`,
        [req.params.id, storeId]
      );
      const checkin = rows[0];
      if (!checkin) return res.status(404).json({ error: "Check-in not found" });
      if (!checkin.phone) return res.status(400).json({ error: "No phone number on file" });

      const [storeRow] = await db.select({ name: locations.name }).from(locations).where(eq(locations.id, storeId));
      const storeName = storeRow?.name ?? "the salon";
      const firstName = (checkin.client_name || "there").split(" ")[0];
      const body = `Hi ${firstName}! A spot just opened up at ${storeName}. Head back now if you're still interested! Reply STOP to opt out.`;

      const { sendSms } = await import("./sms");
      await sendSms(storeId, checkin.phone, body, "kiosk_opening");
      return res.json({ success: true });
    } catch (err) {
      console.error("[kiosk/board/sms-opening]", err);
      return res.status(500).json({ error: "Failed to send SMS" });
    }
  });

  // GET /api/kiosk/turn — unified turn queue (delegates to the booking app's Turn System)
  // Returns staff ordered by the same dynamic algorithm used in the calendar.
  // isActive = clocked in AND not paused; toggling calls /api/kiosk/turn/toggle which
  // sets pausedStaffIds in Turn System preferences (same flag the calendar reads).
  app.get("/api/kiosk/turn", isAuthenticated, async (req: any, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(400).json({ error: "No store context" });

      const eligibility = await getTurnEligibility(storeId);

      // Active kiosk check-in counts per staff (kiosk-specific: how many clients are
      // currently waiting/being-served for each technician).
      const { rows: countRows } = await pool.query(`
        SELECT staff_id, COUNT(*) AS cnt
        FROM kiosk_checkins
        WHERE store_id = $1
          AND status NOT IN ('completed')
          AND (expires_at IS NULL OR expires_at > NOW())
        GROUP BY staff_id
      `, [storeId]);
      const activeCountMap = new Map<number, number>(
        countRows.map((r: any) => [Number(r.staff_id), Number(r.cnt)])
      );

      const turns = eligibility.technicians
        .filter((t) => t.clockedIn)
        .map((t) => ({
          staffId:      t.id,
          name:         t.name,
          color:        t.color,
          avatarThumb:  t.avatarUrl,
          isActive:     !t.paused,
          turnPosition: t.turnPosition,
          activeCount:  activeCountMap.get(t.id) ?? 0,
        }));

      return res.json(turns);
    } catch (err) {
      console.error("[kiosk/turn]", err);
      return res.status(500).json({ error: "Failed to load turn queue" });
    }
  });

  // POST /api/kiosk/turn/toggle/:staffId — pause/unpause a staff member in the unified Turn System.
  // Writes to pausedStaffIds in Turn System preferences — the same flag the booking calendar reads.
  app.post("/api/kiosk/turn/toggle/:staffId", isAuthenticated, async (req: any, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(400).json({ error: "No store context" });
      const staffId = parseInt(req.params.staffId, 10);
      if (!staffId || isNaN(staffId)) return res.status(400).json({ error: "Invalid staffId" });

      const prefs = await getTurnPreferences(storeId);
      const paused: number[] = Array.isArray((prefs as any).pausedStaffIds)
        ? (prefs as any).pausedStaffIds.map(Number)
        : [];
      const isPaused = paused.includes(staffId);
      const newPaused = isPaused ? paused.filter((id) => id !== staffId) : [...paused, staffId];
      await saveTurnPreferences(storeId, { pausedStaffIds: newPaused });
      broadcastTurnEligibilityChanged(storeId);
      return res.json({ success: true, paused: !isPaused });
    } catch (err) {
      console.error("[kiosk/turn/toggle]", err);
      return res.status(500).json({ error: "Failed to toggle" });
    }
  });

  // GET /api/kiosk-settings — read kiosk customisation for current store (auth required)
  app.get("/api/kiosk-settings", isAuthenticated, async (req: any, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(400).json({ error: "No store selected" });

      const [store] = await db
        .select({ bookingSlug: locations.bookingSlug, name: locations.name })
        .from(locations)
        .where(eq(locations.id, storeId));

      const [row] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, storeId));
      const prefs = row?.preferences ? JSON.parse(row.preferences as string) : {};
      const ks = prefs.kioskSettings ?? {};

      return res.json({
        bookingSlug: store?.bookingSlug ?? null,
        storeName: store?.name ?? null,
        kioskEnabled: ks.kioskEnabled !== false,
        welcomeHeadline: ks.welcomeHeadline ?? "",
        welcomeSubText: ks.welcomeSubText ?? "",
        loyaltyPromoText: ks.loyaltyPromoText ?? "",
        categoryImages: ks.categoryImages ?? {},
        showServicePrice: ks.showServicePrice !== false,
        showServiceDuration: ks.showServiceDuration !== false,
        dualScreenMode: ks.dualScreenMode === true,
      });
    } catch (err) {
      console.error("[kiosk-settings] GET error:", err);
      return res.status(500).json({ error: "Failed to load kiosk settings" });
    }
  });

  // PUT /api/kiosk-settings — save kiosk customisation (auth required)
  app.put("/api/kiosk-settings", isAuthenticated, async (req: any, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(400).json({ error: "No store selected" });

      const { kioskEnabled, welcomeHeadline, welcomeSubText, loyaltyPromoText, showServicePrice, showServiceDuration, dualScreenMode } = req.body;

      const [existing] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, storeId));
      const currentPrefs = existing?.preferences ? JSON.parse(existing.preferences as string) : {};
      const existingKs = currentPrefs.kioskSettings ?? {};
      const nextPrefs = {
        ...currentPrefs,
        kioskSettings: {
          ...existingKs,
          kioskEnabled: kioskEnabled !== false,
          welcomeHeadline: (welcomeHeadline ?? "").trim(),
          welcomeSubText: (welcomeSubText ?? "").trim(),
          loyaltyPromoText: (loyaltyPromoText ?? "").trim(),
          showServicePrice: showServicePrice !== false,
          showServiceDuration: showServiceDuration !== false,
          dualScreenMode: dualScreenMode === true,
        },
      };
      const newPrefs = JSON.stringify(nextPrefs);
      if (existing) {
        await db.update(storeSettings).set({ preferences: newPrefs, updatedAt: new Date() }).where(eq(storeSettings.storeId, storeId));
      } else {
        await db.insert(storeSettings).values({ storeId, preferences: newPrefs });
      }

      return res.json({ success: true });
    } catch (err) {
      console.error("[kiosk-settings] PUT error:", err);
      return res.status(500).json({ error: "Failed to save kiosk settings" });
    }
  });

  // POST /api/kiosk/checkout-event — broadcast a dual-screen POS checkout event to all kiosk clients
  app.post("/api/kiosk/checkout-event", isAuthenticated, async (req: any, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(400).json({ error: "No store selected" });
      const { type, ...payload } = req.body;
      if (!type) return res.status(400).json({ error: "type is required" });
      broadcastNotification({ type, storeId, ...payload } as any);
      return res.json({ ok: true });
    } catch (err) {
      console.error("[kiosk/checkout-event]", err);
      return res.status(500).json({ error: "Failed to broadcast" });
    }
  });

  // POST /api/kiosk-settings/category-image — upload an image for a kiosk category card (R2)
  app.post("/api/kiosk-settings/category-image", isAuthenticated, memoryUpload({ maxSizeMb: 8 }).single("image"), async (req: any, res) => {
    try {
      const storeId = await resolveSessionStoreId(req);
      if (!storeId) return res.status(400).json({ error: "No store selected" });

      const categoryKey = (req.body?.categoryKey ?? "").trim();
      if (!categoryKey) return res.status(400).json({ error: "categoryKey is required" });
      if (!req.file) return res.status(400).json({ error: "No image file provided" });

      const imageUrl = await uploadToR2(
        req.file.buffer,
        "kiosk",
        req.file.originalname,
        req.file.mimetype
      );

      const [existing] = await db.select().from(storeSettings).where(eq(storeSettings.storeId, storeId));
      const currentPrefs = existing?.preferences ? JSON.parse(existing.preferences as string) : {};
      const existingKs2 = currentPrefs.kioskSettings ?? {};
      const nextPrefs2 = {
        ...currentPrefs,
        kioskSettings: {
          ...existingKs2,
          categoryImages: {
            ...(existingKs2.categoryImages ?? {}),
            [categoryKey]: imageUrl,
          },
        },
      };
      const newPrefs2 = JSON.stringify(nextPrefs2);
      if (existing) {
        await db.update(storeSettings).set({ preferences: newPrefs2, updatedAt: new Date() }).where(eq(storeSettings.storeId, storeId));
      } else {
        await db.insert(storeSettings).values({ storeId, preferences: newPrefs2 });
      }

      return res.json({ success: true, url: imageUrl, categoryKey });
    } catch (err) {
      console.error("[kiosk-settings/category-image] error:", err);
      return res.status(500).json({ error: "Failed to upload category image" });
    }
  });

  return httpServer;
}
