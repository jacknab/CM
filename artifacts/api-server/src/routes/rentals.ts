// Certxa Rentals — Phase 1 (Today/overview, Professionals) + Phase 2 (Spaces)
// foundation routes, mounted at /api/rentals.
//
// Facility scoping: every route resolves the caller's own facility via
// resolveSessionStoreId() and re-verifies it against the target row before
// reading or writing — a client-supplied storeId/space id is never trusted
// as proof of authorization on its own.

import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { rentalSpaces, rentalProfessionals, rentalAgreements, rentCharges, rentPayments, locations, users } from "@shared/schema";
import { eq, and, or, ilike, ne, lte, gte, isNull, desc, count, inArray } from "drizzle-orm";
import { isAuthenticated } from "../auth";
import { requirePermission } from "../middleware/permissions";
import { PERMISSIONS } from "@shared/permissions";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { resolveTimezoneFromAddress, hasAddressChange } from "../lib/resolveTimezone";
import { getStoreTimezone, salonDayBoundaries, toSalonDateKey, localTimeToUtc } from "../lib/timezone";
import { sendEmail } from "../mail";
import {
  spaceTypeEnum, spaceStatusEnum, canTransitionSpaceStatus, SPACE_STATUSES, SPACE_TYPES,
} from "@shared/rentalSpaces";
import { professionalStatusEnum, PROFESSIONAL_STATUSES } from "@shared/rentalProfessionals";
import {
  agreementStatusEnum, rentFrequencyEnum, deriveAgreementLifecycle, isAgreementCurrentlyEffective,
  dateRangesOverlap, AGREEMENT_LIFECYCLE_STATES, type AgreementLifecycle, type RentFrequency,
} from "@shared/rentalAgreements";
import {
  deriveChargeDisplayState, computeBillingPeriods, toCents, centsToAmount,
  CHARGE_DISPLAY_STATES, type ChargeDisplayState,
} from "@shared/rentCharges";
import { z } from "zod";

const router = Router();

router.use(isAuthenticated);

// Dedicated Rentals signup provisioning. Identity and sessions still come
// from the shared Certxa auth system; the existing location tenant is the
// product/account context. No parallel user or membership model is created.
router.post("/onboarding", async (req: Request, res: Response): Promise<void> => {
  const userId = (req.session as any)?.userId as string | undefined;
  if (!userId) { res.status(401).json({ error: "Authentication required" }); return; }

  const parsed = z.object({
    businessName: z.string().trim().min(1).max(100),
    timezone: z.string().trim().min(1).max(100).default("UTC"),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Business name is required" }); return; }

  try {
    const [existing] = await db.select({ id: locations.id, category: locations.category })
      .from(locations).where(eq(locations.userId, userId)).limit(1);
    if (existing) {
      // Existing Certxa owners keep their current tenant and can use Rentals
      // against it; never create a duplicate location or alter Salon context.
      await db.update(users).set({ onboardingCompleted: true, updatedAt: new Date() }).where(eq(users.id, userId));
      res.json({ storeId: existing.id, existing: true });
      return;
    }

    const [created] = await db.transaction(async (tx) => {
      const rows = await tx.insert(locations).values({
        name: parsed.data.businessName,
        timezone: parsed.data.timezone,
        category: "Certxa Rentals",
        userId,
        accountStatus: "Active",
      }).returning({ id: locations.id });
      await tx.update(users).set({ onboardingCompleted: true, updatedAt: new Date() }).where(eq(users.id, userId));
      return rows;
    });
    res.status(201).json({ storeId: created.id, existing: false });
  } catch (error) {
    console.error("[rentals] onboarding:", error);
    res.status(500).json({ error: "Failed to set up Rentals workspace" });
  }
});

// ─── Facility Settings ──────────────────────────────────────────────────────
// A facility IS a `locations` row (see shared/schema/rentals.ts) — this is a
// thin read/update over its name/timezone/address columns, gated by the
// Rentals permission system rather than the Salon cookie-ownership check
// `/api/stores/:id` uses. The response is always this narrow projection,
// never the full `locations` row, which also carries Salon-only fields
// (bookingSlug, activationCode, Stripe ids, ...) Rentals has no business
// exposing. Timezone is never client-editable — it's derived from the
// address, same as Salon's Business Settings (routes.ts's PATCH
// /api/stores/:id), via the shared resolveTimezoneFromAddress()/
// hasAddressChange() helpers.
const facilitySettingsColumns = {
  name: locations.name,
  timezone: locations.timezone,
  address: locations.address,
  city: locations.city,
  state: locations.state,
  postcode: locations.postcode,
};

const updateFacilitySettingsSchema = z.object({
  name: z.string().trim().min(1).optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  postcode: z.string().nullable().optional(),
});

router.get("/settings", requirePermission(PERMISSIONS.RENTALS_SETTINGS_VIEW), async (req: Request, res: Response): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(400).json({ error: "No facility found for this account" }); return; }

  try {
    const [loc] = await db.select(facilitySettingsColumns).from(locations).where(eq(locations.id, storeId));
    if (!loc) { res.status(404).json({ error: "Facility not found" }); return; }
    res.json(loc);
  } catch (err) {
    console.error("[rentals] get settings:", err);
    res.status(500).json({ error: "Failed to load settings" });
  }
});

router.patch("/settings", requirePermission(PERMISSIONS.RENTALS_SETTINGS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(400).json({ error: "No facility found for this account" }); return; }

  const parsed = updateFacilitySettingsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid settings", details: parsed.error.flatten() }); return; }

  try {
    const update: Record<string, unknown> = { ...parsed.data };

    if (hasAddressChange(parsed.data)) {
      const [current] = await db.select().from(locations).where(eq(locations.id, storeId));
      if (!current) { res.status(404).json({ error: "Facility not found" }); return; }
      const resolved = await resolveTimezoneFromAddress({
        address: (update.address as string | undefined) ?? current.address,
        city: (update.city as string | undefined) ?? current.city,
        state: (update.state as string | undefined) ?? current.state,
        postcode: (update.postcode as string | undefined) ?? current.postcode,
      });
      if (resolved.timezone) update.timezone = resolved.timezone;
    }

    const [updated] = await db
      .update(locations)
      .set(update)
      .where(eq(locations.id, storeId))
      .returning(facilitySettingsColumns);
    if (!updated) { res.status(404).json({ error: "Facility not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error("[rentals] update settings:", err);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// ─── Facility-local date helpers (Phase 4) ─────────────────────────────────
// Agreement start/end are business dates, not server wall-clock — every
// "is this agreement in effect today" decision goes through the facility's
// own timezone (locations.timezone), per lib/timezone.ts, never new Date()
// getters or process.env.TZ.

/** "Today" as facility-local midnight, expressed as a UTC Date — the only valid basis for agreement lifecycle/effectiveness decisions. */
async function getFacilityToday(storeId: number): Promise<Date> {
  const tz = await getStoreTimezone(storeId);
  const todayKey = toSalonDateKey(new Date(), tz);
  return salonDayBoundaries(todayKey, tz).dayStart;
}

/** Converts a plain "YYYY-MM-DD" business date into the UTC timestamp representing local midnight of that date in the facility's timezone. */
async function facilityDateToUtc(storeId: number, dateStr: string): Promise<Date> {
  const tz = await getStoreTimezone(storeId);
  return localTimeToUtc(dateStr, "00:00", tz);
}

/**
 * Drizzle join/where condition for "this agreement is in effect as of `today`"
 * — status != terminated, already started, and not yet past its end date.
 * Used everywhere Phases 2-3 previously (incorrectly, ahead of Phase 4)
 * treated `status = 'active'` alone as "currently occupying" — now that real
 * agreements with future start dates or past end dates can exist, that check
 * has to account for dates too.
 */
function currentlyEffectiveAgreementCondition(today: Date) {
  return and(
    ne(rentalAgreements.status, "terminated"),
    lte(rentalAgreements.startDate, today),
    or(isNull(rentalAgreements.endDate), gte(rentalAgreements.endDate, today)),
  );
}

/**
 * Keeps a Space's manual `status` in sync with whether it currently has an
 * effective agreement — but only across the three occupancy-tracking values
 * (available/reserved/occupied). Maintenance/inactive are intentional owner
 * states and are never touched here (Phase 4 spec Section 15: "define
 * precedence carefully... do not destroy manually meaningful Space states").
 * Runs synchronously after any agreement create/terminate/date-edit; there is
 * no background job for pure date-boundary transitions (e.g. an agreement
 * starting at local midnight with no other write happening) — a known,
 * documented limitation, not silently missing.
 */
async function syncSpaceOccupancyFromAgreements(spaceId: number, storeId: number, today: Date): Promise<void> {
  const [space] = await db
    .select({ status: rentalSpaces.status })
    .from(rentalSpaces)
    .where(and(eq(rentalSpaces.id, spaceId), eq(rentalSpaces.storeId, storeId)));
  if (!space || (space.status !== "available" && space.status !== "reserved" && space.status !== "occupied")) return;

  const [effective] = await db
    .select({ id: rentalAgreements.id })
    .from(rentalAgreements)
    .where(and(
      eq(rentalAgreements.spaceId, spaceId),
      eq(rentalAgreements.storeId, storeId),
      currentlyEffectiveAgreementCondition(today),
    ));

  if (effective && space.status !== "occupied") {
    await db.update(rentalSpaces).set({ status: "occupied", updatedAt: new Date() })
      .where(and(eq(rentalSpaces.id, spaceId), eq(rentalSpaces.storeId, storeId)));
  } else if (!effective && space.status === "occupied") {
    await db.update(rentalSpaces).set({ status: "available", updatedAt: new Date() })
      .where(and(eq(rentalSpaces.id, spaceId), eq(rentalSpaces.storeId, storeId)));
  }
}

/**
 * Finds an existing Agreement on `spaceId` whose occupied period overlaps
 * [newStart, newEnd] — a terminated agreement's occupied period is capped at
 * its terminatedAt, not its original endDate. Shared by Leases create/edit
 * validation (Section 12) and the Space-picker availability hint (Section 11).
 */
async function findOverlappingAgreement(
  storeId: number,
  spaceId: number,
  newStart: Date,
  newEnd: Date | null,
  excludeAgreementId?: number,
): Promise<{ id: number; professionalName: string; startDate: Date | null; endDate: Date | null } | null> {
  const rows = await db
    .select({
      id: rentalAgreements.id,
      startDate: rentalAgreements.startDate,
      endDate: rentalAgreements.endDate,
      status: rentalAgreements.status,
      terminatedAt: rentalAgreements.terminatedAt,
      professionalName: rentalProfessionals.name,
    })
    .from(rentalAgreements)
    .innerJoin(rentalProfessionals, eq(rentalProfessionals.id, rentalAgreements.professionalId))
    .where(and(eq(rentalAgreements.spaceId, spaceId), eq(rentalAgreements.storeId, storeId)));

  for (const row of rows) {
    if (excludeAgreementId && row.id === excludeAgreementId) continue;
    if (!row.startDate) continue;
    const effectiveEnd = row.status === "terminated" ? row.terminatedAt : row.endDate;
    if (dateRangesOverlap(newStart, newEnd, new Date(row.startDate), effectiveEnd ? new Date(effectiveEnd) : null)) {
      return { id: row.id, professionalName: row.professionalName, startDate: row.startDate, endDate: row.endDate };
    }
  }
  return null;
}

// ─── Today / Owner Dashboard (Phase 1 foundation, Phase 6 dashboard) ────────
//
// Deliberately extends the existing /overview endpoint and /rentals/today
// route rather than creating a competing dashboard — this was already the
// Rentals home page, just waiting for Phases 2-5 to exist. Every number here
// is computed by reusing the SAME helpers the Spaces/Leases/Rent pages
// already use (listSpacesWithOccupant, listAgreements, listCharges) — no
// second occupancy/lifecycle/money calculation is introduced. All of it runs
// server-side against one facility's own (small) dataset — a handful of
// queries total, not a fetch-everything-into-the-browser pattern.

router.get("/overview", requirePermission(PERMISSIONS.RENTALS_VIEW), async (req: Request, res: Response): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(400).json({ error: "No facility found for this account" }); return; }

  try {
    await ensureAllChargesGenerated(storeId);
    const today = await getFacilityToday(storeId);

    const [spaceCounts, professionalTotal, agreements, charges, recentPaymentRows] = await Promise.all([
      db
        .select({ status: rentalSpaces.status, count: count() })
        .from(rentalSpaces)
        .where(eq(rentalSpaces.storeId, storeId))
        .groupBy(rentalSpaces.status),
      db
        .select({ count: count() })
        .from(rentalProfessionals)
        .where(eq(rentalProfessionals.storeId, storeId)),
      listAgreements(storeId, today, {}),
      listCharges(storeId, today, {}),
      db
        .select({
          id: rentPayments.id, amount: rentPayments.amount, method: rentPayments.method, paidAt: rentPayments.paidAt,
          proName: rentalProfessionals.name, proBusinessName: rentalProfessionals.businessName,
        })
        .from(rentPayments)
        .innerJoin(rentalProfessionals, eq(rentalProfessionals.id, rentPayments.professionalId))
        .where(eq(rentPayments.storeId, storeId))
        .orderBy(desc(rentPayments.paidAt))
        .limit(5),
    ]);

    const spacesByStatus: Record<string, number> = {};
    let totalSpaces = 0;
    for (const row of spaceCounts) {
      spacesByStatus[row.status] = row.count;
      totalSpaces += row.count;
    }

    // Occupancy is authoritative from the Agreement lifecycle (Phase 4), not
    // a second count — "ending" is still current occupancy, just ending soon.
    const currentOccupancy = agreements.filter((a) => a.lifecycle === "active" || a.lifecycle === "ending");
    const endingSoon = agreements.filter((a) => a.lifecycle === "ending");
    const upcomingMoveIns = agreements.filter((a) => a.lifecycle === "upcoming");
    const availableSpaces = await listSpacesWithOccupant(storeId, today, { status: "available" });

    // Voided charges never count toward due/overdue/upcoming (Phase 5 rule,
    // reused verbatim). "Upcoming" charges are already naturally bounded to
    // at most one billing period ahead by ensureChargesGenerated — no extra
    // 30-day window filter needed on top of that.
    let dueCents = 0, overdueCents = 0, upcomingCents = 0;
    let dueCount = 0, overdueCount = 0;
    const overdueProfessionalIds = new Set<number>();
    for (const c of charges) {
      const cents = toCents(c.remainingAmount);
      if (c.displayState === "due") { dueCents += cents; dueCount++; }
      else if (c.displayState === "overdue") { overdueCents += cents; overdueCount++; overdueProfessionalIds.add(c.professional.id); }
      else if (c.displayState === "upcoming") { upcomingCents += cents; }
    }
    const upcomingRent = charges
      .filter((c) => c.displayState === "due" || c.displayState === "overdue" || c.displayState === "upcoming")
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 8);

    res.json({
      spaces: {
        total: totalSpaces,
        occupied: spacesByStatus["occupied"] ?? 0,
        available: spacesByStatus["available"] ?? 0,
        reserved: spacesByStatus["reserved"] ?? 0,
        maintenance: spacesByStatus["maintenance"] ?? 0,
        inactive: spacesByStatus["inactive"] ?? 0,
      },
      // Totals (not lifecycle-filtered) purely to drive the setup-progress
      // empty state — the real lists below already use the correct
      // lifecycle-aware counts for everything else.
      professionals: { total: professionalTotal[0]?.count ?? 0 },
      agreements: { total: agreements.length },
      rent: {
        dueCents, overdueCents, upcomingCents,
        due: centsToAmount(dueCents), overdue: centsToAmount(overdueCents), upcoming: centsToAmount(upcomingCents),
      },
      attention: {
        overdueChargeCount: overdueCount,
        overdueProfessionalCount: overdueProfessionalIds.size,
        endingSoonCount: endingSoon.length,
        availableSpacesCount: spacesByStatus["available"] ?? 0,
        upcomingMoveInsCount: upcomingMoveIns.length,
      },
      currentOccupancy: currentOccupancy.map((a) => ({
        agreementId: a.id, professionalId: a.professional.id, professionalName: a.professional.name,
        businessName: a.professional.businessName, spaceId: a.space.id, spaceName: a.space.name,
        rentAmount: a.rentAmount, rentFrequency: a.rentFrequency, lifecycle: a.lifecycle,
      })),
      availableSpaces: availableSpaces.map((s) => ({ id: s.id, name: s.name, type: s.type, monthlyRate: s.monthlyRate, baseRatePeriodDays: s.baseRatePeriodDays })),
      upcomingRent: upcomingRent.map((c) => ({
        chargeId: c.id, professionalName: c.professional.name, businessName: c.professional.businessName,
        spaceName: c.space.name, amount: c.amount, remainingAmount: c.remainingAmount,
        dueDate: c.dueDate, displayState: c.displayState,
      })),
      recentPayments: recentPaymentRows.map((p) => ({
        id: p.id, professionalName: p.proName, businessName: p.proBusinessName,
        amount: p.amount, paidAt: p.paidAt, method: p.method,
      })),
      endingSoon: endingSoon.map((a) => ({
        agreementId: a.id, professionalName: a.professional.name, businessName: a.professional.businessName,
        spaceName: a.space.name, endDate: a.endDate,
      })),
    });
  } catch (err) {
    console.error("[rentals] overview:", err);
    res.status(500).json({ error: "Failed to load rentals overview" });
  }
});

// ─── Professionals (Phase 3) ─────────────────────────────────────────────────
//
// A Professional is never linked to `staff`, `clients`, or `appointments` —
// see the comment on rentalProfessionals in shared/schema/rentals.ts. The
// owner/professional privacy boundary (Section 15/25/26 of the Phase 3 spec)
// is enforced structurally by that absence of any such foreign key, not by
// an access-control check on this table that could be forgotten. Current
// space is derived through rentalAgreements, never a direct column — a
// Professional can move spaces or have multiple agreements over time, so
// Professional -> Space is never a permanent link (Section 13).

const professionalWritableFields = {
  name: z.string().trim().min(1, "Name is required").max(120),
  firstName: z.string().trim().max(80).nullable().optional(),
  lastName: z.string().trim().max(80).nullable().optional(),
  businessName: z.string().trim().max(160).nullable().optional(),
  businessType: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  email: z.string().trim().email().nullable().optional().or(z.literal("").transform(() => null)),
  phone: z.string().trim().max(30).nullable().optional(),
  website: z.string().trim().max(300).nullable().optional(),
  socialLinks: z
    .array(z.object({ platform: z.string().trim().min(1).max(30), url: z.string().trim().min(1).max(300) }))
    .max(10)
    .optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
};

const createProfessionalSchema = z.object(professionalWritableFields).extend({
  status: professionalStatusEnum.optional(),
});

const updateProfessionalSchema = z.object(professionalWritableFields).partial();

const professionalStatusChangeSchema = z.object({ status: professionalStatusEnum });

/** Attaches each professional's current space via their currently-effective agreement, if any — never fabricated. */
async function listProfessionalsWithSpace(
  storeId: number,
  today: Date,
  filters: { search?: string; status?: string; hasSpace?: "true" | "false" },
) {
  const conditions = [eq(rentalProfessionals.storeId, storeId)];

  if (filters.status && (PROFESSIONAL_STATUSES as readonly string[]).includes(filters.status)) {
    conditions.push(eq(rentalProfessionals.status, filters.status as (typeof PROFESSIONAL_STATUSES)[number]));
  }
  if (filters.search?.trim()) {
    const pattern = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(rentalProfessionals.name, pattern),
        ilike(rentalProfessionals.businessName, pattern),
        ilike(rentalProfessionals.email, pattern),
        ilike(rentalProfessionals.phone, pattern),
        ilike(rentalSpaces.name, pattern),
      )!,
    );
  }

  const rows = await db
    .select({
      professional: rentalProfessionals,
      spaceId: rentalSpaces.id,
      spaceName: rentalSpaces.name,
      spaceType: rentalSpaces.type,
    })
    .from(rentalProfessionals)
    .leftJoin(
      rentalAgreements,
      and(eq(rentalAgreements.professionalId, rentalProfessionals.id), currentlyEffectiveAgreementCondition(today)),
    )
    .leftJoin(rentalSpaces, eq(rentalSpaces.id, rentalAgreements.spaceId))
    .where(and(...conditions))
    .orderBy(rentalProfessionals.name);

  const shaped = rows.map((r) => ({
    ...r.professional,
    currentSpace: r.spaceId ? { id: r.spaceId, name: r.spaceName, type: r.spaceType } : null,
  }));

  if (filters.hasSpace === "true") return shaped.filter((p) => p.currentSpace !== null);
  if (filters.hasSpace === "false") return shaped.filter((p) => p.currentSpace === null);
  return shaped;
}

// GET /api/rentals/professionals?search=&status=&hasSpace=
router.get("/professionals", requirePermission(PERMISSIONS.RENTALS_PROFESSIONALS_VIEW), async (req: Request, res: Response): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(400).json({ error: "No facility found for this account" }); return; }

  try {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const hasSpace = req.query.hasSpace === "true" || req.query.hasSpace === "false" ? req.query.hasSpace : undefined;
    const today = await getFacilityToday(storeId);
    const professionals = await listProfessionalsWithSpace(storeId, today, { search, status, hasSpace });
    res.json(professionals);
  } catch (err) {
    console.error("[rentals] list professionals:", err);
    res.status(500).json({ error: "Failed to load professionals" });
  }
});

// GET /api/rentals/professionals/:id
router.get("/professionals/:id", requirePermission(PERMISSIONS.RENTALS_PROFESSIONALS_VIEW), async (req: Request, res: Response): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(400).json({ error: "No facility found for this account" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid professional id" }); return; }

  try {
    const [professional] = await db
      .select()
      .from(rentalProfessionals)
      .where(and(eq(rentalProfessionals.id, id), eq(rentalProfessionals.storeId, storeId)));
    // Not found and "belongs to another facility" return the same 404 —
    // never confirm another store's professional id exists.
    if (!professional) { res.status(404).json({ error: "Professional not found" }); return; }

    const today = await getFacilityToday(storeId);
    const [agreement] = await db
      .select({
        agreementId: rentalAgreements.id,
        spaceId: rentalSpaces.id,
        spaceName: rentalSpaces.name,
        spaceType: rentalSpaces.type,
        spaceStatus: rentalSpaces.status,
        startDate: rentalAgreements.startDate,
        endDate: rentalAgreements.endDate,
        rentAmount: rentalAgreements.rentAmount,
        rentFrequency: rentalAgreements.rentFrequency,
        status: rentalAgreements.status,
        terminatedAt: rentalAgreements.terminatedAt,
      })
      .from(rentalAgreements)
      .innerJoin(rentalSpaces, eq(rentalSpaces.id, rentalAgreements.spaceId))
      .where(and(eq(rentalAgreements.professionalId, id), currentlyEffectiveAgreementCondition(today)));

    res.json({
      ...professional,
      currentSpace: agreement
        ? { id: agreement.spaceId, name: agreement.spaceName, type: agreement.spaceType, status: agreement.spaceStatus }
        : null,
      // High-level only, per Section 12 — full Agreement management lives under /leases.
      agreement: agreement ? {
        id: agreement.agreementId,
        startDate: agreement.startDate,
        endDate: agreement.endDate,
        rentAmount: agreement.rentAmount,
        rentFrequency: agreement.rentFrequency,
        lifecycle: deriveAgreementLifecycle(agreement, today),
      } : null,
    });
  } catch (err) {
    console.error("[rentals] get professional:", err);
    res.status(500).json({ error: "Failed to load professional" });
  }
});

// POST /api/rentals/professionals
router.post("/professionals", requirePermission(PERMISSIONS.RENTALS_PROFESSIONALS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(400).json({ error: "No facility found for this account" }); return; }

  const parsed = createProfessionalSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid professional", details: parsed.error.flatten() }); return; }

  try {
    const [created] = await db
      .insert(rentalProfessionals)
      .values({ ...parsed.data, storeId })
      .returning();
    res.status(201).json({ ...created, currentSpace: null, agreement: null });
  } catch (err) {
    console.error("[rentals] create professional:", err);
    res.status(500).json({ error: "Failed to create professional" });
  }
});

// PATCH /api/rentals/professionals/:id — everything except status.
router.patch("/professionals/:id", requirePermission(PERMISSIONS.RENTALS_PROFESSIONALS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(400).json({ error: "No facility found for this account" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid professional id" }); return; }

  // Same reasoning as Spaces (Phase 2): status is a lifecycle action with its
  // own endpoint, rejected here rather than silently ignored.
  if ("status" in req.body) {
    res.status(400).json({ error: "Use PATCH /api/rentals/professionals/:id/status to change status" });
    return;
  }

  const parsed = updateProfessionalSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid professional", details: parsed.error.flatten() }); return; }

  try {
    const [existing] = await db
      .select({ id: rentalProfessionals.id })
      .from(rentalProfessionals)
      .where(and(eq(rentalProfessionals.id, id), eq(rentalProfessionals.storeId, storeId)));
    if (!existing) { res.status(404).json({ error: "Professional not found" }); return; }

    const [updated] = await db
      .update(rentalProfessionals)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(rentalProfessionals.id, id), eq(rentalProfessionals.storeId, storeId)))
      .returning();
    res.json(updated);
  } catch (err) {
    console.error("[rentals] update professional:", err);
    res.status(500).json({ error: "Failed to update professional" });
  }
});

// PATCH /api/rentals/professionals/:id/status
router.patch("/professionals/:id/status", requirePermission(PERMISSIONS.RENTALS_PROFESSIONALS_MANAGE), async (req: Request, res: Response): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(400).json({ error: "No facility found for this account" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid professional id" }); return; }

  const parsed = professionalStatusChangeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid status", details: parsed.error.flatten() }); return; }

  try {
    const [existing] = await db
      .select({ id: rentalProfessionals.id })
      .from(rentalProfessionals)
      .where(and(eq(rentalProfessionals.id, id), eq(rentalProfessionals.storeId, storeId)));
    if (!existing) { res.status(404).json({ error: "Professional not found" }); return; }

    const [updated] = await db
      .update(rentalProfessionals)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(and(eq(rentalProfessionals.id, id), eq(rentalProfessionals.storeId, storeId)))
      .returning();
    res.json(updated);
  } catch (err) {
    console.error("[rentals] change professional status:", err);
    res.status(500).json({ error: "Failed to change professional status" });
  }
});

// ─── Spaces (Phase 2) ────────────────────────────────────────────────────────

const spaceWritableFields = {
  name: z.string().trim().min(1, "Name is required").max(120),
  type: spaceTypeEnum,
  monthlyRate: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((v) => (v === null || v === undefined || v === "" ? null : String(v))),
  baseRatePeriodDays: z.coerce.number().int().min(1, "Enter a number of days between 1 and 365").max(365, "Enter a number of days between 1 and 365").default(30),
  description: z.string().trim().max(2000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  amenities: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
};

const createSpaceSchema = z.object(spaceWritableFields).extend({
  status: spaceStatusEnum.optional(),
});

const updateSpaceSchema = z.object(spaceWritableFields).partial();

const statusChangeSchema = z.object({ status: spaceStatusEnum });

/** Attaches each space's current professional via its currently-effective agreement, if any — never fabricated. */
async function listSpacesWithOccupant(
  storeId: number,
  today: Date,
  filters: { search?: string; status?: string; type?: string },
) {
  const conditions = [eq(rentalSpaces.storeId, storeId)];

  if (filters.status && (SPACE_STATUSES as readonly string[]).includes(filters.status)) {
    conditions.push(eq(rentalSpaces.status, filters.status as (typeof SPACE_STATUSES)[number]));
  }
  if (filters.type && (SPACE_TYPES as readonly string[]).includes(filters.type)) {
    conditions.push(eq(rentalSpaces.type, filters.type as (typeof SPACE_TYPES)[number]));
  }
  if (filters.search?.trim()) {
    const pattern = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(rentalSpaces.name, pattern),
        ilike(rentalProfessionals.name, pattern),
        ilike(rentalProfessionals.businessName, pattern),
      )!,
    );
  }

  const rows = await db
    .select({
      space: rentalSpaces,
      proId: rentalProfessionals.id,
      proName: rentalProfessionals.name,
      proBusinessName: rentalProfessionals.businessName,
    })
    .from(rentalSpaces)
    .leftJoin(
      rentalAgreements,
      and(eq(rentalAgreements.spaceId, rentalSpaces.id), currentlyEffectiveAgreementCondition(today)),
    )
    .leftJoin(rentalProfessionals, eq(rentalProfessionals.id, rentalAgreements.professionalId))
    .where(and(...conditions))
    .orderBy(rentalSpaces.name);

  return rows.map((r) => ({
    ...r.space,
    currentProfessional: r.proId ? { id: r.proId, name: r.proName, businessName: r.proBusinessName } : null,
  }));
}

// GET /api/rentals/spaces?search=&status=&type=&forStart=&forEnd=
// forStart/forEnd (YYYY-MM-DD, facility-local) are optional — when present,
// each space is annotated with `conflict` for the Agreement-creation Space
// picker (Phase 4 Section 11): which existing Agreement, if any, would
// overlap a new one over those dates, so the picker can explain why a Space
// can't be selected rather than allowing a silent double-booking.
router.get("/spaces", requirePermission(PERMISSIONS.RENTALS_SPACES_VIEW), async (req: Request, res: Response): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(400).json({ error: "No facility found for this account" }); return; }

  try {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    const today = await getFacilityToday(storeId);
    const spaces = await listSpacesWithOccupant(storeId, today, { search, status, type });

    const forStartStr = typeof req.query.forStart === "string" ? req.query.forStart : undefined;
    const forEndStr = typeof req.query.forEnd === "string" ? req.query.forEnd : undefined;
    if (forStartStr && /^\d{4}-\d{2}-\d{2}$/.test(forStartStr)) {
      const forStart = await facilityDateToUtc(storeId, forStartStr);
      const forEnd = forEndStr && /^\d{4}-\d{2}-\d{2}$/.test(forEndStr) ? await facilityDateToUtc(storeId, forEndStr) : null;
      const annotated = await Promise.all(spaces.map(async (space) => ({
        ...space,
        conflict: await findOverlappingAgreement(storeId, space.id, forStart, forEnd),
      })));
      res.json(annotated);
      return;
    }

    res.json(spaces);
  } catch (err) {
    console.error("[rentals] list spaces:", err);
    res.status(500).json({ error: "Failed to load spaces" });
  }
});

// GET /api/rentals/spaces/:id
router.get("/spaces/:id", requirePermission(PERMISSIONS.RENTALS_SPACES_VIEW), async (req: Request, res: Response): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(400).json({ error: "No facility found for this account" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid space id" }); return; }

  try {
    const [space] = await db
      .select()
      .from(rentalSpaces)
      .where(and(eq(rentalSpaces.id, id), eq(rentalSpaces.storeId, storeId)));
    // Not found and "belongs to another facility" return the same 404 —
    // never confirm another store's space id exists.
    if (!space) { res.status(404).json({ error: "Space not found" }); return; }

    const today = await getFacilityToday(storeId);
    const [agreement] = await db
      .select({
        agreementId: rentalAgreements.id,
        proId: rentalProfessionals.id,
        proName: rentalProfessionals.name,
        proBusinessName: rentalProfessionals.businessName,
        startDate: rentalAgreements.startDate,
        endDate: rentalAgreements.endDate,
        rentAmount: rentalAgreements.rentAmount,
        rentFrequency: rentalAgreements.rentFrequency,
      })
      .from(rentalAgreements)
      .innerJoin(rentalProfessionals, eq(rentalProfessionals.id, rentalAgreements.professionalId))
      .where(and(eq(rentalAgreements.spaceId, id), currentlyEffectiveAgreementCondition(today)));

    res.json({
      ...space,
      currentProfessional: agreement ? { id: agreement.proId, name: agreement.proName, businessName: agreement.proBusinessName } : null,
      agreement: agreement ? {
        id: agreement.agreementId, startDate: agreement.startDate, endDate: agreement.endDate,
        rentAmount: agreement.rentAmount, rentFrequency: agreement.rentFrequency,
      } : null,
    });
  } catch (err) {
    console.error("[rentals] get space:", err);
    res.status(500).json({ error: "Failed to load space" });
  }
});

// POST /api/rentals/spaces
router.post("/spaces", requirePermission(PERMISSIONS.RENTALS_SPACES_MANAGE), async (req: Request, res: Response): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(400).json({ error: "No facility found for this account" }); return; }

  const parsed = createSpaceSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid space", details: parsed.error.flatten() }); return; }

  try {
    const [created] = await db
      .insert(rentalSpaces)
      .values({ ...parsed.data, storeId })
      .returning();
    res.status(201).json({ ...created, currentProfessional: null });
  } catch (err) {
    console.error("[rentals] create space:", err);
    res.status(500).json({ error: "Failed to create space" });
  }
});

// PATCH /api/rentals/spaces/:id — everything except status.
router.patch("/spaces/:id", requirePermission(PERMISSIONS.RENTALS_SPACES_MANAGE), async (req: Request, res: Response): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(400).json({ error: "No facility found for this account" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid space id" }); return; }

  // Status changes are lifecycle actions with their own transition rules
  // (see PATCH /spaces/:id/status) — rejected here rather than silently
  // ignored, so a client never assumes an edit changed status too.
  if ("status" in req.body) {
    res.status(400).json({ error: "Use PATCH /api/rentals/spaces/:id/status to change status" });
    return;
  }

  const parsed = updateSpaceSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid space", details: parsed.error.flatten() }); return; }

  try {
    const [existing] = await db
      .select({ id: rentalSpaces.id })
      .from(rentalSpaces)
      .where(and(eq(rentalSpaces.id, id), eq(rentalSpaces.storeId, storeId)));
    if (!existing) { res.status(404).json({ error: "Space not found" }); return; }

    const [updated] = await db
      .update(rentalSpaces)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(rentalSpaces.id, id), eq(rentalSpaces.storeId, storeId)))
      .returning();
    res.json(updated);
  } catch (err) {
    console.error("[rentals] update space:", err);
    res.status(500).json({ error: "Failed to update space" });
  }
});

// PATCH /api/rentals/spaces/:id/status — the only path allowed to change status, with transition rules enforced server-side.
router.patch("/spaces/:id/status", requirePermission(PERMISSIONS.RENTALS_SPACES_MANAGE), async (req: Request, res: Response): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(400).json({ error: "No facility found for this account" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid space id" }); return; }

  const parsed = statusChangeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid status", details: parsed.error.flatten() }); return; }
  const nextStatus = parsed.data.status;

  try {
    const [space] = await db
      .select({ id: rentalSpaces.id, status: rentalSpaces.status })
      .from(rentalSpaces)
      .where(and(eq(rentalSpaces.id, id), eq(rentalSpaces.storeId, storeId)));
    if (!space) { res.status(404).json({ error: "Space not found" }); return; }

    const currentStatus = space.status as (typeof SPACE_STATUSES)[number];
    if (!canTransitionSpaceStatus(currentStatus, nextStatus)) {
      res.status(409).json({ error: `Cannot change status from "${currentStatus}" to "${nextStatus}"` });
      return;
    }

    // Domain guard: never let a status change silently drop an in-effect
    // rental agreement's occupancy. Phase 4 makes this reachable — a facility
    // owner terminates the Agreement itself (or lets it run out its dates) to
    // free the Space, not this endpoint.
    if (currentStatus === "occupied" && nextStatus === "available") {
      const today = await getFacilityToday(storeId);
      const [activeAgreement] = await db
        .select({ id: rentalAgreements.id })
        .from(rentalAgreements)
        .where(and(
          eq(rentalAgreements.spaceId, id),
          eq(rentalAgreements.storeId, storeId),
          currentlyEffectiveAgreementCondition(today),
        ));
      if (activeAgreement) {
        res.status(409).json({ error: "This space has an active rental agreement — end or terminate the agreement to free it up." });
        return;
      }
    }

    const [updated] = await db
      .update(rentalSpaces)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(and(eq(rentalSpaces.id, id), eq(rentalSpaces.storeId, storeId)))
      .returning();
    res.json(updated);
  } catch (err) {
    console.error("[rentals] change space status:", err);
    res.status(500).json({ error: "Failed to change space status" });
  }
});

// ─── Leases / Rental Agreements (Phase 4) ───────────────────────────────────
//
// The authoritative Professional <-> Space relationship. Identity fields
// (professionalId, spaceId) are set only at creation — editing an existing
// Agreement to point at a different Professional or Space is rejected by
// design (Section 19/20): that's a new Agreement (optionally via /renew),
// never a silent rewrite of who an existing historical record was about.

const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date");

const agreementTermsFields = {
  endDate: dateStringSchema.nullable().optional(),
  rentAmount: z.union([z.string(), z.number()]).transform((v) => String(v)),
  rentFrequency: rentFrequencyEnum,
  depositAmount: z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((v) => (v === null || v === undefined || v === "" ? null : String(v))),
  noticePeriodDays: z.coerce.number().int().min(0).max(365).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
};

const createAgreementSchema = z.object({
  professionalId: z.coerce.number().int().positive(),
  spaceId: z.coerce.number().int().positive(),
  startDate: dateStringSchema,
  ...agreementTermsFields,
});

// Edits never touch professionalId/spaceId/status — see comment above.
const updateAgreementSchema = z.object(agreementTermsFields).partial();

const terminateAgreementSchema = z.object({
  effectiveDate: dateStringSchema.optional(),
  reason: z.string().trim().max(500).nullable().optional(),
});

const renewAgreementSchema = z.object(agreementTermsFields).partial().extend({
  startDate: dateStringSchema,
  endPreviousAgreement: z.boolean().optional().default(true),
});

/** Shapes a raw agreement row (+ joined space/professional summaries) into the API response, attaching the derived lifecycle. */
function shapeAgreement(
  row: typeof rentalAgreements.$inferSelect,
  today: Date,
  space: { id: number; name: string; type: string },
  professional: { id: number; name: string; businessName: string | null },
) {
  return { ...row, lifecycle: deriveAgreementLifecycle(row, today), space, professional };
}

async function listAgreements(
  storeId: number,
  today: Date,
  filters: { search?: string; lifecycle?: string; spaceId?: number; professionalId?: number; frequency?: string },
) {
  const conditions = [eq(rentalAgreements.storeId, storeId)];
  if (filters.spaceId) conditions.push(eq(rentalAgreements.spaceId, filters.spaceId));
  if (filters.professionalId) conditions.push(eq(rentalAgreements.professionalId, filters.professionalId));
  if (filters.frequency) conditions.push(eq(rentalAgreements.rentFrequency, filters.frequency));
  if (filters.search?.trim()) {
    const pattern = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(rentalProfessionals.name, pattern),
        ilike(rentalProfessionals.businessName, pattern),
        ilike(rentalSpaces.name, pattern),
      )!,
    );
  }

  const rows = await db
    .select({
      agreement: rentalAgreements,
      spaceId: rentalSpaces.id, spaceName: rentalSpaces.name, spaceType: rentalSpaces.type,
      proId: rentalProfessionals.id, proName: rentalProfessionals.name, proBusinessName: rentalProfessionals.businessName,
    })
    .from(rentalAgreements)
    .innerJoin(rentalSpaces, eq(rentalSpaces.id, rentalAgreements.spaceId))
    .innerJoin(rentalProfessionals, eq(rentalProfessionals.id, rentalAgreements.professionalId))
    .where(and(...conditions))
    .orderBy(rentalAgreements.startDate);

  const shaped = rows.map((r) =>
    shapeAgreement(
      r.agreement, today,
      { id: r.spaceId, name: r.spaceName, type: r.spaceType },
      { id: r.proId, name: r.proName, businessName: r.proBusinessName },
    ));

  if (filters.lifecycle && (AGREEMENT_LIFECYCLE_STATES as readonly string[]).includes(filters.lifecycle)) {
    return shaped.filter((a) => a.lifecycle === filters.lifecycle);
  }
  return shaped;
}

// GET /api/rentals/leases?search=&status=&spaceId=&professionalId=&frequency=
router.get("/leases", requirePermission(PERMISSIONS.RENTALS_LEASES_VIEW), async (req: Request, res: Response): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(400).json({ error: "No facility found for this account" }); return; }

  try {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const lifecycle = typeof req.query.status === "string" ? req.query.status : undefined;
    const spaceId = req.query.spaceId ? Number(req.query.spaceId) : undefined;
    const professionalId = req.query.professionalId ? Number(req.query.professionalId) : undefined;
    const frequency = typeof req.query.frequency === "string" ? req.query.frequency : undefined;
    const today = await getFacilityToday(storeId);
    const leases = await listAgreements(storeId, today, { search, lifecycle, spaceId, professionalId, frequency });
    res.json(leases);
  } catch (err) {
    console.error("[rentals] list leases:", err);
    res.status(500).json({ error: "Failed to load rental agreements" });
  }
});

// GET /api/rentals/leases/:id
router.get("/leases/:id", requirePermission(PERMISSIONS.RENTALS_LEASES_VIEW), async (req: Request, res: Response): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(400).json({ error: "No facility found for this account" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid agreement id" }); return; }

  try {
    const [row] = await db
      .select({
        agreement: rentalAgreements,
        spaceId: rentalSpaces.id, spaceName: rentalSpaces.name, spaceType: rentalSpaces.type,
        proId: rentalProfessionals.id, proName: rentalProfessionals.name, proBusinessName: rentalProfessionals.businessName,
      })
      .from(rentalAgreements)
      .innerJoin(rentalSpaces, eq(rentalSpaces.id, rentalAgreements.spaceId))
      .innerJoin(rentalProfessionals, eq(rentalProfessionals.id, rentalAgreements.professionalId))
      .where(and(eq(rentalAgreements.id, id), eq(rentalAgreements.storeId, storeId)));
    // Not found and "belongs to another facility" return the same 404 —
    // never confirm another store's agreement id exists.
    if (!row) { res.status(404).json({ error: "Rental agreement not found" }); return; }

    const tz = await getStoreTimezone(storeId);
    await ensureChargesGenerated(storeId, row.agreement, tz);
    const today = await getFacilityToday(storeId);
    const rentSummary = await computeRentSummary(storeId, id, today);

    res.json({
      ...shapeAgreement(
        row.agreement, today,
        { id: row.spaceId, name: row.spaceName, type: row.spaceType },
        { id: row.proId, name: row.proName, businessName: row.proBusinessName },
      ),
      rentSummary,
    });
  } catch (err) {
    console.error("[rentals] get lease:", err);
    res.status(500).json({ error: "Failed to load rental agreement" });
  }
});

// POST /api/rentals/leases
router.post("/leases", requirePermission(PERMISSIONS.RENTALS_LEASES_MANAGE), async (req: Request, res: Response): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(400).json({ error: "No facility found for this account" }); return; }

  const parsed = createAgreementSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid rental agreement", details: parsed.error.flatten() }); return; }
  const data = parsed.data;

  try {
    // Never trust client-supplied professionalId/spaceId as belonging to this
    // facility — verify both against the resolved storeId before anything else.
    const [professional] = await db.select({ id: rentalProfessionals.id })
      .from(rentalProfessionals)
      .where(and(eq(rentalProfessionals.id, data.professionalId), eq(rentalProfessionals.storeId, storeId)));
    if (!professional) { res.status(400).json({ error: "Professional not found for this facility" }); return; }

    const [space] = await db.select({ id: rentalSpaces.id })
      .from(rentalSpaces)
      .where(and(eq(rentalSpaces.id, data.spaceId), eq(rentalSpaces.storeId, storeId)));
    if (!space) { res.status(400).json({ error: "Space not found for this facility" }); return; }

    const startDate = await facilityDateToUtc(storeId, data.startDate);
    const endDate = data.endDate ? await facilityDateToUtc(storeId, data.endDate) : null;
    if (endDate && endDate.getTime() < startDate.getTime()) {
      res.status(400).json({ error: "End date must be on or after the start date" }); return;
    }

    const conflict = await findOverlappingAgreement(storeId, data.spaceId, startDate, endDate);
    if (conflict) {
      res.status(409).json({
        error: `This space is already rented by ${conflict.professionalName} during part of these dates. Choose another space or adjust the dates.`,
      });
      return;
    }

    const [created] = await db.insert(rentalAgreements).values({
      storeId,
      professionalId: data.professionalId,
      spaceId: data.spaceId,
      startDate,
      endDate,
      rentAmount: data.rentAmount,
      rentFrequency: data.rentFrequency,
      depositAmount: data.depositAmount ?? null,
      noticePeriodDays: data.noticePeriodDays ?? null,
      notes: data.notes ?? null,
    }).returning();

    const today = await getFacilityToday(storeId);
    await syncSpaceOccupancyFromAgreements(data.spaceId, storeId, today);

    const [pro] = await db.select({ id: rentalProfessionals.id, name: rentalProfessionals.name, businessName: rentalProfessionals.businessName })
      .from(rentalProfessionals).where(eq(rentalProfessionals.id, data.professionalId));
    const [sp] = await db.select({ id: rentalSpaces.id, name: rentalSpaces.name, type: rentalSpaces.type })
      .from(rentalSpaces).where(eq(rentalSpaces.id, data.spaceId));

    res.status(201).json(shapeAgreement(created, today, sp, pro));
  } catch (err) {
    console.error("[rentals] create lease:", err);
    res.status(500).json({ error: "Failed to create rental agreement" });
  }
});

// PATCH /api/rentals/leases/:id — terms/dates only, never professionalId/spaceId/status.
router.patch("/leases/:id", requirePermission(PERMISSIONS.RENTALS_LEASES_MANAGE), async (req: Request, res: Response): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(400).json({ error: "No facility found for this account" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid agreement id" }); return; }

  if ("professionalId" in req.body || "spaceId" in req.body) {
    res.status(400).json({ error: "Changing the professional or space on an existing agreement isn't supported — create a new agreement (or use /renew) instead." });
    return;
  }
  if ("status" in req.body) {
    res.status(400).json({ error: "Use POST /api/rentals/leases/:id/terminate to end an agreement" });
    return;
  }

  const parsed = updateAgreementSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid rental agreement", details: parsed.error.flatten() }); return; }
  const data = parsed.data;

  try {
    const [existing] = await db.select().from(rentalAgreements)
      .where(and(eq(rentalAgreements.id, id), eq(rentalAgreements.storeId, storeId)));
    if (!existing) { res.status(404).json({ error: "Rental agreement not found" }); return; }
    if (existing.status === "terminated") {
      res.status(409).json({ error: "This agreement was terminated and its terms can no longer be edited." });
      return;
    }

    const newEndDate = data.endDate !== undefined
      ? (data.endDate ? await facilityDateToUtc(storeId, data.endDate) : null)
      : existing.endDate;
    const effectiveStart = existing.startDate as Date;
    if (newEndDate && newEndDate.getTime() < effectiveStart.getTime()) {
      res.status(400).json({ error: "End date must be on or after the start date" }); return;
    }

    // Only re-check overlap if the end date actually changed — start/identity
    // never change here, so a shrinking/unchanged end date can't newly overlap.
    if (data.endDate !== undefined) {
      const conflict = await findOverlappingAgreement(storeId, existing.spaceId, effectiveStart, newEndDate, id);
      if (conflict) {
        res.status(409).json({
          error: `This space is already rented by ${conflict.professionalName} during part of these dates. Choose different dates.`,
        });
        return;
      }
    }

    const { endDate: _endDateStr, ...rest } = data;
    const [updated] = await db.update(rentalAgreements)
      .set({ ...rest, ...(data.endDate !== undefined ? { endDate: newEndDate } : {}), updatedAt: new Date() })
      .where(and(eq(rentalAgreements.id, id), eq(rentalAgreements.storeId, storeId)))
      .returning();

    const today = await getFacilityToday(storeId);
    await syncSpaceOccupancyFromAgreements(existing.spaceId, storeId, today);

    const [pro] = await db.select({ id: rentalProfessionals.id, name: rentalProfessionals.name, businessName: rentalProfessionals.businessName })
      .from(rentalProfessionals).where(eq(rentalProfessionals.id, existing.professionalId));
    const [sp] = await db.select({ id: rentalSpaces.id, name: rentalSpaces.name, type: rentalSpaces.type })
      .from(rentalSpaces).where(eq(rentalSpaces.id, existing.spaceId));

    res.json(shapeAgreement(updated, today, sp, pro));
  } catch (err) {
    console.error("[rentals] update lease:", err);
    res.status(500).json({ error: "Failed to update rental agreement" });
  }
});

// POST /api/rentals/leases/:id/terminate — the only path that ends an agreement early. Preserves the full historical record; never deletes.
router.post("/leases/:id/terminate", requirePermission(PERMISSIONS.RENTALS_LEASES_MANAGE), async (req: Request, res: Response): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(400).json({ error: "No facility found for this account" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid agreement id" }); return; }

  const parsed = terminateAgreementSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() }); return; }

  try {
    const [existing] = await db.select().from(rentalAgreements)
      .where(and(eq(rentalAgreements.id, id), eq(rentalAgreements.storeId, storeId)));
    if (!existing) { res.status(404).json({ error: "Rental agreement not found" }); return; }
    if (existing.status === "terminated") {
      res.status(409).json({ error: "This agreement has already been terminated." });
      return;
    }

    const today = await getFacilityToday(storeId);
    const terminatedAt = parsed.data.effectiveDate ? await facilityDateToUtc(storeId, parsed.data.effectiveDate) : today;
    if (existing.startDate && terminatedAt.getTime() < new Date(existing.startDate).getTime()) {
      res.status(400).json({ error: "Termination date can't be before the agreement's start date" });
      return;
    }

    const notes = parsed.data.reason
      ? [existing.notes, `Terminated: ${parsed.data.reason}`].filter(Boolean).join("\n")
      : existing.notes;

    const [updated] = await db.update(rentalAgreements)
      .set({ status: "terminated", terminatedAt, notes, updatedAt: new Date() })
      .where(and(eq(rentalAgreements.id, id), eq(rentalAgreements.storeId, storeId)))
      .returning();

    await syncSpaceOccupancyFromAgreements(existing.spaceId, storeId, today);

    const [pro] = await db.select({ id: rentalProfessionals.id, name: rentalProfessionals.name, businessName: rentalProfessionals.businessName })
      .from(rentalProfessionals).where(eq(rentalProfessionals.id, existing.professionalId));
    const [sp] = await db.select({ id: rentalSpaces.id, name: rentalSpaces.name, type: rentalSpaces.type })
      .from(rentalSpaces).where(eq(rentalSpaces.id, existing.spaceId));

    res.json(shapeAgreement(updated, today, sp, pro));
  } catch (err) {
    console.error("[rentals] terminate lease:", err);
    res.status(500).json({ error: "Failed to terminate rental agreement" });
  }
});

// POST /api/rentals/leases/:id/renew — creates a NEW agreement for the same
// Professional/Space, prefilled from (and optionally overriding) the source
// agreement's terms. Never mutates the source agreement's own terms/dates —
// it only optionally shortens its endDate to close the gap before the new
// agreement begins (Section 20: the old agreement stays historical).
router.post("/leases/:id/renew", requirePermission(PERMISSIONS.RENTALS_LEASES_MANAGE), async (req: Request, res: Response): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(400).json({ error: "No facility found for this account" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid agreement id" }); return; }

  const parsed = renewAgreementSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() }); return; }
  const data = parsed.data;

  try {
    const [source] = await db.select().from(rentalAgreements)
      .where(and(eq(rentalAgreements.id, id), eq(rentalAgreements.storeId, storeId)));
    if (!source) { res.status(404).json({ error: "Rental agreement not found" }); return; }
    if (source.status === "terminated") {
      res.status(409).json({ error: "This agreement was terminated — create a new agreement instead of renewing it." });
      return;
    }

    const newStart = await facilityDateToUtc(storeId, data.startDate);
    const newEnd = data.endDate !== undefined
      ? (data.endDate ? await facilityDateToUtc(storeId, data.endDate) : null)
      : null;
    if (newEnd && newEnd.getTime() < newStart.getTime()) {
      res.status(400).json({ error: "End date must be on or after the start date" }); return;
    }

    // Overlap check runs BEFORE any write — findOverlappingAgreement already
    // excludes the source agreement (excludeAgreementId), so it's safe to
    // check first and only touch the source afterward, once we know the new
    // agreement can actually be created. (Checking after shortening the
    // source would leave it incorrectly shortened with no replacement if
    // this check then failed.)
    const conflict = await findOverlappingAgreement(storeId, source.spaceId, newStart, newEnd, source.id);
    if (conflict) {
      res.status(409).json({
        error: `This space is already rented by ${conflict.professionalName} during part of these dates. Choose different dates.`,
      });
      return;
    }

    // Both writes happen in one transaction — shortening the source
    // agreement's end date and creating the new one must succeed or fail
    // together, or a failed insert could leave the source incorrectly
    // shortened with no replacement.
    const created = await db.transaction(async (tx) => {
      if (data.endPreviousAgreement && (!source.endDate || new Date(source.endDate).getTime() >= newStart.getTime())) {
        const dayBefore = new Date(newStart.getTime() - 86_400_000);
        if (!source.startDate || dayBefore.getTime() >= new Date(source.startDate).getTime()) {
          await tx.update(rentalAgreements).set({ endDate: dayBefore, updatedAt: new Date() })
            .where(and(eq(rentalAgreements.id, id), eq(rentalAgreements.storeId, storeId)));
        }
      }

      const [row] = await tx.insert(rentalAgreements).values({
        storeId,
        professionalId: source.professionalId,
        spaceId: source.spaceId,
        startDate: newStart,
        endDate: newEnd,
        rentAmount: data.rentAmount ?? source.rentAmount,
        rentFrequency: data.rentFrequency ?? source.rentFrequency,
        depositAmount: data.depositAmount !== undefined ? data.depositAmount : source.depositAmount,
        noticePeriodDays: data.noticePeriodDays !== undefined ? data.noticePeriodDays : source.noticePeriodDays,
        notes: data.notes !== undefined ? data.notes : null,
      }).returning();
      return row;
    });

    const today = await getFacilityToday(storeId);
    await syncSpaceOccupancyFromAgreements(source.spaceId, storeId, today);

    const [pro] = await db.select({ id: rentalProfessionals.id, name: rentalProfessionals.name, businessName: rentalProfessionals.businessName })
      .from(rentalProfessionals).where(eq(rentalProfessionals.id, source.professionalId));
    const [sp] = await db.select({ id: rentalSpaces.id, name: rentalSpaces.name, type: rentalSpaces.type })
      .from(rentalSpaces).where(eq(rentalSpaces.id, source.spaceId));

    res.status(201).json(shapeAgreement(created, today, sp, pro));
  } catch (err) {
    console.error("[rentals] renew lease:", err);
    res.status(500).json({ error: "Failed to renew rental agreement" });
  }
});

// ─── Rent Charges & Payments (Phase 5) ──────────────────────────────────────
//
// Manual payments only this phase — no Stripe integration. Which Stripe
// account would receive rent (reuse Salon's per-store Connect account, or a
// dedicated new Rentals Connect flow) was an open architectural question the
// Phase 5 brief explicitly said to stop and ask about rather than guess; the
// user chose to ship the ledger + manual payment recording now and defer
// online collection to a focused follow-up once that's decided.

/** Generates any missing rent charges for one agreement, from its start date through one period past today. Idempotent via the DB unique constraint. */
async function ensureChargesGenerated(storeId: number, agreement: typeof rentalAgreements.$inferSelect, tz: string): Promise<void> {
  if (!agreement.rentAmount || !agreement.startDate) return;

  const todayKey = toSalonDateKey(new Date(), tz);
  const startDateKey = toSalonDateKey(new Date(agreement.startDate), tz);
  const effectiveEndDate = agreement.status === "terminated" ? agreement.terminatedAt : agreement.endDate;
  const effectiveEndDateKey = effectiveEndDate ? toSalonDateKey(new Date(effectiveEndDate), tz) : null;

  const periods = computeBillingPeriods({
    startDateKey,
    effectiveEndDateKey,
    frequency: agreement.rentFrequency as RentFrequency,
    todayKey,
  });
  if (periods.length === 0) return;

  const values = periods.map((p) => ({
    storeId,
    agreementId: agreement.id,
    professionalId: agreement.professionalId,
    spaceId: agreement.spaceId,
    periodStart: localTimeToUtc(p.periodStart, "00:00", tz),
    periodEnd: localTimeToUtc(p.periodEnd, "00:00", tz),
    dueDate: localTimeToUtc(p.dueDate, "00:00", tz),
    amount: agreement.rentAmount as string,
  }));

  // The actual duplicate-prevention mechanism — safe to call this on every
  // request, safe under concurrent requests, safe to retry.
  await db.insert(rentCharges).values(values).onConflictDoNothing({
    target: [rentCharges.agreementId, rentCharges.periodStart],
  });
}

async function ensureAllChargesGenerated(storeId: number): Promise<string> {
  const tz = await getStoreTimezone(storeId);
  const agreements = await db.select().from(rentalAgreements).where(eq(rentalAgreements.storeId, storeId));
  for (const agreement of agreements) {
    await ensureChargesGenerated(storeId, agreement, tz);
  }
  return tz;
}

/** Outstanding balance + next due charge for one agreement — used by the Lease detail view (Section 27). Voided charges never count toward the balance. */
async function computeRentSummary(
  storeId: number,
  agreementId: number,
  today: Date,
): Promise<{ currentBalance: string; nextDue: { dueDate: Date; amount: string } | null }> {
  const charges = await db.select().from(rentCharges)
    .where(and(eq(rentCharges.agreementId, agreementId), eq(rentCharges.storeId, storeId)))
    .orderBy(rentCharges.dueDate);
  if (charges.length === 0) return { currentBalance: "0.00", nextDue: null };

  const chargeIds = charges.map((c) => c.id);
  const payments = await db.select().from(rentPayments).where(inArray(rentPayments.chargeId, chargeIds));
  const paidByCharge = new Map<number, number>();
  for (const p of payments) paidByCharge.set(p.chargeId, (paidByCharge.get(p.chargeId) ?? 0) + toCents(p.amount));

  let balanceCents = 0;
  let nextDue: { dueDate: Date; amount: string } | null = null;
  for (const c of charges) {
    if (c.status === "voided") continue;
    const paidCents = paidByCharge.get(c.id) ?? 0;
    const remainingCents = Math.max(0, toCents(c.amount) - paidCents);
    if (c.status !== "paid") balanceCents += remainingCents;
    if (c.status !== "paid" && !nextDue) {
      nextDue = { dueDate: c.dueDate, amount: centsToAmount(remainingCents) };
    }
  }
  return { currentBalance: centsToAmount(balanceCents), nextDue };
}

function shapeCharge(
  charge: typeof rentCharges.$inferSelect,
  today: Date,
  payments: (typeof rentPayments.$inferSelect)[],
  space: { id: number; name: string },
  professional: { id: number; name: string; businessName: string | null },
) {
  const paidCents = payments.reduce((sum, p) => sum + toCents(p.amount), 0);
  const amountCents = toCents(charge.amount);
  return {
    ...charge,
    displayState: deriveChargeDisplayState(charge, today),
    paidAmount: centsToAmount(paidCents),
    remainingAmount: centsToAmount(Math.max(0, amountCents - paidCents)),
    space,
    professional,
  };
}

async function listCharges(
  storeId: number,
  today: Date,
  filters: { search?: string; status?: string; professionalId?: number; spaceId?: number },
) {
  const conditions = [eq(rentCharges.storeId, storeId)];
  if (filters.professionalId) conditions.push(eq(rentCharges.professionalId, filters.professionalId));
  if (filters.spaceId) conditions.push(eq(rentCharges.spaceId, filters.spaceId));
  if (filters.search?.trim()) {
    const pattern = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(rentalProfessionals.name, pattern),
        ilike(rentalProfessionals.businessName, pattern),
        ilike(rentalSpaces.name, pattern),
      )!,
    );
  }

  const rows = await db
    .select({
      charge: rentCharges,
      proId: rentalProfessionals.id, proName: rentalProfessionals.name, proBusinessName: rentalProfessionals.businessName,
      spaceId: rentalSpaces.id, spaceName: rentalSpaces.name,
    })
    .from(rentCharges)
    .innerJoin(rentalProfessionals, eq(rentalProfessionals.id, rentCharges.professionalId))
    .innerJoin(rentalSpaces, eq(rentalSpaces.id, rentCharges.spaceId))
    .where(and(...conditions))
    .orderBy(desc(rentCharges.dueDate));

  const chargeIds = rows.map((r) => r.charge.id);
  const payments = chargeIds.length > 0
    ? await db.select().from(rentPayments).where(inArray(rentPayments.chargeId, chargeIds))
    : [];
  const paymentsByCharge = new Map<number, (typeof rentPayments.$inferSelect)[]>();
  for (const p of payments) {
    if (!paymentsByCharge.has(p.chargeId)) paymentsByCharge.set(p.chargeId, []);
    paymentsByCharge.get(p.chargeId)!.push(p);
  }

  const shaped = rows.map((r) =>
    shapeCharge(
      r.charge, today, paymentsByCharge.get(r.charge.id) ?? [],
      { id: r.spaceId, name: r.spaceName },
      { id: r.proId, name: r.proName, businessName: r.proBusinessName },
    ));

  if (filters.status && (CHARGE_DISPLAY_STATES as readonly string[]).includes(filters.status)) {
    return shaped.filter((c) => c.displayState === filters.status);
  }
  return shaped;
}

// GET /api/rentals/rent/charges?search=&status=&professionalId=&spaceId=
router.get("/rent/charges", requirePermission(PERMISSIONS.RENTALS_RENT_VIEW), async (req: Request, res: Response): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(400).json({ error: "No facility found for this account" }); return; }

  try {
    await ensureAllChargesGenerated(storeId);
    const today = await getFacilityToday(storeId);
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const professionalId = req.query.professionalId ? Number(req.query.professionalId) : undefined;
    const spaceId = req.query.spaceId ? Number(req.query.spaceId) : undefined;
    const charges = await listCharges(storeId, today, { search, status, professionalId, spaceId });
    res.json(charges);
  } catch (err) {
    console.error("[rentals] list rent charges:", err);
    res.status(500).json({ error: "Failed to load rent charges" });
  }
});

// GET /api/rentals/rent/charges/:id
router.get("/rent/charges/:id", requirePermission(PERMISSIONS.RENTALS_RENT_VIEW), async (req: Request, res: Response): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(400).json({ error: "No facility found for this account" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid charge id" }); return; }

  try {
    const [row] = await db
      .select({
        charge: rentCharges,
        proId: rentalProfessionals.id, proName: rentalProfessionals.name, proBusinessName: rentalProfessionals.businessName,
        spaceId: rentalSpaces.id, spaceName: rentalSpaces.name,
      })
      .from(rentCharges)
      .innerJoin(rentalProfessionals, eq(rentalProfessionals.id, rentCharges.professionalId))
      .innerJoin(rentalSpaces, eq(rentalSpaces.id, rentCharges.spaceId))
      .where(and(eq(rentCharges.id, id), eq(rentCharges.storeId, storeId)));
    // Not found and "belongs to another facility" return the same 404 —
    // never confirm another store's charge id exists.
    if (!row) { res.status(404).json({ error: "Rent charge not found" }); return; }

    const payments = await db.select().from(rentPayments)
      .where(eq(rentPayments.chargeId, id))
      .orderBy(desc(rentPayments.paidAt));
    const today = await getFacilityToday(storeId);

    res.json(shapeCharge(
      row.charge, today, payments,
      { id: row.spaceId, name: row.spaceName },
      { id: row.proId, name: row.proName, businessName: row.proBusinessName },
    ));
  } catch (err) {
    console.error("[rentals] get rent charge:", err);
    res.status(500).json({ error: "Failed to load rent charge" });
  }
});

const manualPaymentSchema = z.object({
  amount: z.union([z.string(), z.number()]).transform((v) => String(v)),
  method: z.enum(["cash", "check", "other"]),
  reference: z.string().trim().max(120).nullable().optional(),
  paidAt: dateStringSchema.optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

// POST /api/rentals/rent/charges/:id/manual-payment
router.post("/rent/charges/:id/manual-payment", requirePermission(PERMISSIONS.RENTALS_RENT_MANAGE), async (req: Request, res: Response): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(400).json({ error: "No facility found for this account" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid charge id" }); return; }

  const parsed = manualPaymentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid payment", details: parsed.error.flatten() }); return; }

  try {
    const [charge] = await db.select().from(rentCharges)
      .where(and(eq(rentCharges.id, id), eq(rentCharges.storeId, storeId)));
    if (!charge) { res.status(404).json({ error: "Rent charge not found" }); return; }
    if (charge.status === "voided") { res.status(409).json({ error: "This charge has been voided." }); return; }
    if (charge.status === "paid") { res.status(409).json({ error: "This charge is already fully paid." }); return; }

    const existingPayments = await db.select().from(rentPayments).where(eq(rentPayments.chargeId, id));
    const alreadyPaidCents = existingPayments.reduce((sum, p) => sum + toCents(p.amount), 0);
    const amountCents = toCents(charge.amount);
    const remainingCents = amountCents - alreadyPaidCents;
    const newAmountCents = toCents(parsed.data.amount);

    if (newAmountCents <= 0) { res.status(400).json({ error: "Enter an amount greater than $0.00" }); return; }
    if (newAmountCents > remainingCents) {
      res.status(400).json({ error: `Amount exceeds the remaining balance of $${centsToAmount(remainingCents)}.` });
      return;
    }

    const paidAt = parsed.data.paidAt ? await facilityDateToUtc(storeId, parsed.data.paidAt) : await getFacilityToday(storeId);
    const recordedByUserId = (req.session as any)?.userId ?? null;

    const [payment] = await db.insert(rentPayments).values({
      storeId,
      chargeId: id,
      agreementId: charge.agreementId,
      professionalId: charge.professionalId,
      amount: parsed.data.amount,
      method: parsed.data.method,
      reference: parsed.data.reference ?? null,
      paidAt,
      recordedByUserId,
      notes: parsed.data.notes ?? null,
    }).returning();

    const newTotalPaidCents = alreadyPaidCents + newAmountCents;
    const fullyPaid = newTotalPaidCents >= amountCents;
    if (fullyPaid) {
      await db.update(rentCharges).set({ status: "paid", updatedAt: new Date() })
        .where(and(eq(rentCharges.id, id), eq(rentCharges.storeId, storeId)));
    }

    // Best-effort receipt — never blocks recording the payment on failure.
    try {
      const [professional] = await db.select({ email: rentalProfessionals.email, name: rentalProfessionals.name })
        .from(rentalProfessionals).where(eq(rentalProfessionals.id, charge.professionalId));
      if (professional?.email) {
        const amountStr = `$${parsed.data.amount}`;
        await sendEmail(
          storeId,
          professional.email,
          "Rent payment received",
          `<p>Hi ${professional.name},</p><p>We've recorded your rent payment of <strong>${amountStr}</strong>.</p>${!fullyPaid ? `<p>Remaining balance on this charge: $${centsToAmount(amountCents - newTotalPaidCents)}.</p>` : ""}`,
          `We've recorded your rent payment of ${amountStr}.${!fullyPaid ? ` Remaining balance: $${centsToAmount(amountCents - newTotalPaidCents)}.` : ""}`,
        );
      }
    } catch (emailErr) {
      console.error("[rentals] payment receipt email failed (non-blocking):", emailErr);
    }

    res.status(201).json({
      payment,
      chargeStatus: fullyPaid ? "paid" : "unpaid",
      remainingAmount: centsToAmount(Math.max(0, amountCents - newTotalPaidCents)),
    });
  } catch (err) {
    console.error("[rentals] record manual payment:", err);
    res.status(500).json({ error: "Failed to record payment" });
  }
});

const voidChargeSchema = z.object({ reason: z.string().trim().max(500).nullable().optional() });

// POST /api/rentals/rent/charges/:id/void — only for unpaid charges; a paid charge needs a real refund/correction, out of scope this phase.
router.post("/rent/charges/:id/void", requirePermission(PERMISSIONS.RENTALS_RENT_MANAGE), async (req: Request, res: Response): Promise<void> => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) { res.status(400).json({ error: "No facility found for this account" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid charge id" }); return; }

  const parsed = voidChargeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() }); return; }

  try {
    const [charge] = await db.select().from(rentCharges)
      .where(and(eq(rentCharges.id, id), eq(rentCharges.storeId, storeId)));
    if (!charge) { res.status(404).json({ error: "Rent charge not found" }); return; }
    if (charge.status === "paid") { res.status(409).json({ error: "Paid charges can't be voided." }); return; }
    if (charge.status === "voided") { res.status(409).json({ error: "This charge has already been voided." }); return; }

    const [updated] = await db.update(rentCharges)
      .set({ status: "voided", voidedAt: new Date(), voidedReason: parsed.data.reason ?? null, updatedAt: new Date() })
      .where(and(eq(rentCharges.id, id), eq(rentCharges.storeId, storeId)))
      .returning();
    res.json(updated);
  } catch (err) {
    console.error("[rentals] void rent charge:", err);
    res.status(500).json({ error: "Failed to void rent charge" });
  }
});

export default router;
