/**
 * GBP Optimization Engine — Phase 1
 *
 * Background worker that:
 *  1. Audits all connected Google Business Profiles against Certxa data
 *  2. Auto-syncs SAFE fields (hours, description, booking URL, website URL)
 *  3. Syncs services from Certxa into GBP (if owner has sync enabled)
 *  4. Generates category recommendations (logs only — never auto-applies)
 *
 * Safe to auto-apply without owner approval:
 *   hours, description (when Google has none), booking URL (when Google has none),
 *   website URL (when Google has none), services (when syncEnabled=true)
 *
 * Never auto-applied — owner must act:
 *   business name, address, phone, primary category, secondary categories
 */

import { db } from "../db";
import {
  googleBusinessProfiles,
  googleServiceSyncSettings,
  gbpOptimizationLogs,
  locations,
  businessHours,
  services,
  type InsertGbpOptimizationLog,
} from "@shared/schema";
import { eq, and, isNotNull, or } from "drizzle-orm";
import {
  createApiManagerFromProfile,
  updateListingFields,
  syncServicesToGoogle,
  isGBPAuthError,
  markGBPAuthFailed,
  type GBPPatchContext,
} from "../google-business-api";
import { isQuotaCoolingDown, recordQuota429 } from "../google-quota-guard";
import { getStoreOwnerContact, sendGBPReconnectEmail } from "../lib/systemEmails";
import { OAuth2Client } from "google-auth-library";

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY RECOMMENDATION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

interface CategoryMapping {
  gbpName: string;
  gcid: string;
  keywords: RegExp[];
  weight: number;
}

const CATEGORY_MAPPINGS: CategoryMapping[] = [
  {
    gbpName: "Nail Salon",
    gcid: "gcid:nail_salon",
    weight: 10,
    keywords: [
      /\bnail(s)?\b/i,
      /\bacryl/i,
      /\bgel\b/i,
      /\bdip\b.*powder|powder.*\bdip\b/i,
      /\bmanicure\b/i,
      /\bpedicure\b/i,
      /\bnail art\b/i,
      /\bpress[-\s]?on\b/i,
      /\bgel[-\s]?x\b/i,
      /\bfull[-\s]?set\b/i,
      /\bfill[-\s]?in\b/i,
      /\bnail tech\b/i,
      /\bpolish\b/i,
      /\bcuticle\b/i,
      /\bsoak[-\s]?off\b/i,
    ],
  },
  {
    gbpName: "Hair Salon",
    gcid: "gcid:hair_salon",
    weight: 10,
    keywords: [
      /\bhair\b/i,
      /\bcolor(ing)?\b/i,
      /\bhighlight\b/i,
      /\bbalayage\b/i,
      /\bombrE?\b/i,
      /\bblowout\b/i,
      /\bkeratin\b/i,
      /\bcut\b.*hair|hair.*\bcut\b/i,
      /\bextension\b/i,
      /\bperm\b/i,
      /\brelaxer\b/i,
      /\bwash.*style|style.*wash/i,
    ],
  },
  {
    gbpName: "Beauty Salon",
    gcid: "gcid:beauty_salon",
    weight: 5,
    keywords: [
      /\bbeauty\b/i,
      /\bmakeup\b/i,
      /\bmake[-\s]?up\b/i,
      /\beyelash\b/i,
      /\blash\b/i,
      /\bbrow\b/i,
      /\beyebrow\b/i,
      /\btinting\b/i,
      /\bwax(ing)?\b/i,
      /\bthreading\b/i,
      /\bsugaring\b/i,
    ],
  },
  {
    gbpName: "Day Spa",
    gcid: "gcid:day_spa",
    weight: 7,
    keywords: [
      /\bspa\b/i,
      /\bmassage\b/i,
      /\bfacial\b/i,
      /\bhydrafacial\b/i,
      /\bbody wrap\b/i,
      /\bscrub\b/i,
      /\bexfoliat/i,
      /\brelaxation\b/i,
      /\baromatherapy\b/i,
      /\bdeep tissue\b/i,
      /\bswedish\b/i,
      /\bhot stone\b/i,
    ],
  },
  {
    gbpName: "Barber Shop",
    gcid: "gcid:barber_shop",
    weight: 9,
    keywords: [
      /\bbarber\b/i,
      /\bfade\b/i,
      /\bbuzz cut\b/i,
      /\bbeard\b/i,
      /\bshave\b/i,
      /\bstraight razor\b/i,
    ],
  },
  {
    gbpName: "Eyelash Salon",
    gcid: "gcid:eyelash_salon",
    weight: 8,
    keywords: [
      /\blash extension\b/i,
      /\beyelash extension\b/i,
      /\bvolume lash\b/i,
      /\bclassic lash\b/i,
      /\bhybrid lash\b/i,
      /\blash lift\b/i,
      /\blash tint\b/i,
    ],
  },
  {
    gbpName: "Skin Care Clinic",
    gcid: "gcid:skin_care_clinic",
    weight: 7,
    keywords: [
      /\bskin care\b/i,
      /\bskincare\b/i,
      /\bacne\b/i,
      /\banti[-\s]?aging\b/i,
      /\bchemical peel\b/i,
      /\bmicroderm/i,
      /\bmicroneedling\b/i,
      /\bderma\b/i,
    ],
  },
  {
    gbpName: "Tanning Salon",
    gcid: "gcid:tanning_salon",
    weight: 9,
    keywords: [
      /\btanning\b/i,
      /\bspray tan\b/i,
      /\bsunless\b/i,
      /\bairbrush tan\b/i,
      /\bbronzing\b/i,
    ],
  },
  {
    gbpName: "Massage Therapist",
    gcid: "gcid:massage_therapist",
    weight: 9,
    keywords: [
      /\btherapeutic massage\b/i,
      /\bsports massage\b/i,
      /\bcraniosacral\b/i,
      /\breflexology\b/i,
      /\btrigger point\b/i,
    ],
  },
];

interface CategoryScore {
  gbpName: string;
  gcid: string;
  score: number;
}

export function recommendCategories(serviceNames: string[]): {
  primary: CategoryScore | null;
  secondaries: CategoryScore[];
} {
  const scores = new Map<string, CategoryScore>();

  for (const svcName of serviceNames) {
    for (const mapping of CATEGORY_MAPPINGS) {
      const matchCount = mapping.keywords.filter((kw) => kw.test(svcName)).length;
      if (matchCount === 0) continue;
      const existing = scores.get(mapping.gcid);
      const addedScore = matchCount * mapping.weight;
      if (existing) {
        existing.score += addedScore;
      } else {
        scores.set(mapping.gcid, { gbpName: mapping.gbpName, gcid: mapping.gcid, score: addedScore });
      }
    }
  }

  const ranked = [...scores.values()].sort((a, b) => b.score - a.score);
  return { primary: ranked[0] ?? null, secondaries: ranked.slice(1).filter((c) => c.score > 0) };
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH FAILURE HANDLER
// Called whenever any step in a store run detects an OAuth disconnection.
// ─────────────────────────────────────────────────────────────────────────────

async function handleAuthFailure(storeId: number, reason: string): Promise<void> {
  // 1. Mark the DB row as requiring reconnect (idempotent)
  await markGBPAuthFailed(storeId, reason);

  // 2. Send a reconnect notification to the salon owner (fire-and-forget)
  try {
    const owner = await getStoreOwnerContact(storeId);
    if (owner) {
      await sendGBPReconnectEmail(storeId, owner.email, owner.storeName);
      console.log(`[GBP Worker] Reconnect email sent to ${owner.email} for storeId=${storeId}`);
    } else {
      console.warn(`[GBP Worker] Could not find owner contact for storeId=${storeId} — no reconnect email sent`);
    }
  } catch (emailErr: any) {
    // Never let email failures block the rest of the sweep
    console.error(`[GBP Worker] Reconnect email failed for storeId=${storeId}:`, emailErr?.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGGING HELPER
// ─────────────────────────────────────────────────────────────────────────────

async function logOptimization(entry: Omit<InsertGbpOptimizationLog, "createdAt">): Promise<void> {
  try {
    await db.insert(gbpOptimizationLogs).values(entry);
  } catch (err: any) {
    console.error("[GBP Worker] log write failed:", err?.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PER-STORE RUNNER
// ─────────────────────────────────────────────────────────────────────────────

export async function runGBPOptimizationForStore(
  storeId: number,
  triggeredBy: "scheduler" | "manual" = "scheduler",
): Promise<{
  storeId: number;
  actionsPerformed: string[];
  errors: string[];
}> {
  const actionsPerformed: string[] = [];
  const errors: string[] = [];

  console.log(`[GBP Worker] ── Starting optimization for storeId=${storeId} (${triggeredBy}) ──`);

  // ── 0. Quota guard — skip if Google API is in a cooldown window ──────────
  const cooldown = isQuotaCoolingDown();
  if (cooldown.coolingDown) {
    const secs = Math.ceil(cooldown.retryAfterMs / 1000);
    const msg = `Google API quota cooldown active — ${secs}s remaining. Skipping storeId=${storeId}.`;
    console.warn(`[GBP Worker] ${msg}`);
    await logOptimization({
      storeId,
      action: "audit_run",
      status: "skipped",
      errorMessage: msg.slice(0, 500),
      triggeredBy,
    });
    return { storeId, actionsPerformed, errors };
  }

  // ── 1. Load GBP profile ──────────────────────────────────────────────────
  const profileRows = await db
    .select()
    .from(googleBusinessProfiles)
    .where(
      and(
        eq(googleBusinessProfiles.storeId, storeId),
        eq(googleBusinessProfiles.isConnected, true),
        isNotNull(googleBusinessProfiles.locationResourceName),
      ),
    )
    .limit(1);

  const profile = profileRows[0];
  if (!profile?.locationResourceName) {
    console.log(`[GBP Worker] storeId=${storeId}: no connected profile — skipping`);
    return { storeId, actionsPerformed, errors };
  }

  // ── 1a. Skip if a prior run already detected an auth failure ────────────
  // The owner must complete a new OAuth flow to clear reconnect_required.
  if (profile.reconnectRequired) {
    const msg = `GBP connection requires reconnect (token revoked/expired) — skipping until owner reconnects`;
    console.warn(`[GBP Worker] storeId=${storeId}: ${msg}`);
    await logOptimization({
      storeId,
      locationResourceName: profile.locationResourceName,
      action: "audit_run",
      status: "skipped",
      errorMessage: msg,
      triggeredBy,
    });
    return { storeId, actionsPerformed, errors };
  }

  const locationResourceName = profile.locationResourceName;

  // ── 2. Build a SINGLE apiManager/oauth2Client for this entire store run ──
  const apiManager  = createApiManagerFromProfile(profile);
  const oauth2Client = (apiManager as any).oauth2Client as OAuth2Client;

  // Shared patch context for retry logging
  const patchCtx = (operation: string): GBPPatchContext => ({
    storeId,
    locationId: locationResourceName,
    operation,
  });

  // ── 3. Fetch live Google data ─────────────────────────────────────────────
  let googleData: any;
  try {
    googleData = await apiManager.getLocationDetails(locationResourceName);
  } catch (err: any) {
    // Auth failure — token revoked/expired
    if (isGBPAuthError(err) || err?.isAuthError) {
      const reason = "Google OAuth token revoked or expired";
      console.error(`[GBP Worker] storeId=${storeId}: auth failure — ${reason}`);
      errors.push(reason);
      await logOptimization({
        storeId,
        locationResourceName,
        action: "audit_run",
        status: "failed",
        errorMessage: reason,
        triggeredBy,
      });
      await handleAuthFailure(storeId, reason);
      return { storeId, actionsPerformed, errors };
    }

    // Record 429 in quota guard
    if (err?.status === 429 || String(err?.message).includes("429")) {
      recordQuota429(err);
    }
    const msg = `Failed to fetch GBP data: ${err?.message ?? String(err)}`;
    console.error(`[GBP Worker] storeId=${storeId}: ${msg}`);
    errors.push(msg);
    await logOptimization({
      storeId,
      locationResourceName,
      action: "audit_run",
      status: "failed",
      errorMessage: msg.slice(0, 500),
      triggeredBy,
    });
    return { storeId, actionsPerformed, errors };
  }

  // Successful fetch — log the audit run
  await logOptimization({
    storeId,
    locationResourceName,
    action: "audit_run",
    status: "success",
    triggeredBy,
  });
  actionsPerformed.push("audit_run");

  // ── 4. Load Certxa data ───────────────────────────────────────────────────
  const [storeRows, hoursRows, serviceRows, syncSettingsRows] = await Promise.all([
    db
      .select({ name: locations.name, bookingSlug: locations.bookingSlug })
      .from(locations)
      .where(eq(locations.id, storeId))
      .limit(1),
    db.select().from(businessHours).where(eq(businessHours.storeId, storeId)),
    db
      .select({ id: services.id, name: services.name, description: services.description, category: services.category })
      .from(services)
      .where(and(eq(services.storeId, storeId), eq(services.isActive, true))),
    db
      .select({ syncEnabled: googleServiceSyncSettings.syncEnabled })
      .from(googleServiceSyncSettings)
      .where(eq(googleServiceSyncSettings.storeId, storeId))
      .limit(1),
  ]);

  const store = storeRows[0];
  if (!store) {
    errors.push("Store not found in DB");
    return { storeId, actionsPerformed, errors };
  }

  const openHoursRows    = hoursRows.filter((h) => !h.isClosed);
  const certxaBookingUrl = store.bookingSlug
    ? `https://certxa.com/book/${store.bookingSlug}`
    : null;
  // Respect owner's service sync preference; default true when no settings row exists yet
  const serviceSyncEnabled = syncSettingsRows[0]?.syncEnabled ?? true;

  // ── 5. Determine what Google already has ─────────────────────────────────
  const googleHasHours       = (googleData?.regularHours?.periods?.length ?? 0) > 0;
  const googleHasDescription = !!(googleData?.profile?.description);
  const googleHasWebsite     = !!(googleData?.websiteUri);
  const googleCurrentWebsite = (googleData?.websiteUri as string | null) ?? null;

  // ── Helper: handle errors from PATCH steps uniformly ─────────────────────
  async function handlePatchError(
    err: any,
    action: string,
    field: string,
    msg: string,
  ): Promise<"auth" | "error"> {
    if (isGBPAuthError(err) || err?.isAuthError) {
      const reason = "Google OAuth token revoked or expired";
      errors.push(reason);
      await logOptimization({ storeId, locationResourceName, action, field, status: "failed", errorMessage: reason, triggeredBy });
      await handleAuthFailure(storeId, reason);
      return "auth";
    }
    if (err?.status === 429 || String(err?.message).includes("429")) recordQuota429(err);
    errors.push(msg);
    await logOptimization({ storeId, locationResourceName, action, field, status: "failed", errorMessage: msg.slice(0, 500), triggeredBy });
    console.error(`[GBP Worker] storeId=${storeId}: ${msg}`);
    return "error";
  }

  // ── 6. Sync hours ─────────────────────────────────────────────────────────
  if (!googleHasHours && openHoursRows.length > 0) {
    try {
      const DAY_NAMES: Record<number, string> = {
        0: "MONDAY", 1: "TUESDAY", 2: "WEDNESDAY",
        3: "THURSDAY", 4: "FRIDAY", 5: "SATURDAY", 6: "SUNDAY",
      };
      const periods = openHoursRows.map((h) => {
        const [openH, openM]   = h.openTime.split(":").map(Number);
        const [closeH, closeM] = h.closeTime.split(":").map(Number);
        return {
          openDay:   DAY_NAMES[h.dayOfWeek] ?? "MONDAY",
          closeDay:  DAY_NAMES[h.dayOfWeek] ?? "MONDAY",
          openTime:  { hours: openH, minutes: openM },
          closeTime: { hours: closeH, minutes: closeM },
        };
      });

      await updateListingFields(
        locationResourceName,
        { regularHours: { periods } },
        oauth2Client,
        patchCtx("sync_hours"),
      );

      await logOptimization({
        storeId, locationResourceName, action: "sync_hours", field: "regularHours",
        previousValue: "none", newValue: JSON.stringify({ periodsCount: periods.length }),
        status: "success", triggeredBy,
      });
      actionsPerformed.push(`sync_hours (${periods.length} day(s))`);
      console.log(`[GBP Worker] storeId=${storeId}: synced ${periods.length} hours period(s)`);
    } catch (err: any) {
      const result = await handlePatchError(err, "sync_hours", "regularHours", `sync_hours failed: ${err?.message ?? String(err)}`);
      if (result === "auth") return { storeId, actionsPerformed, errors };
    }
  } else if (googleHasHours) {
    await logOptimization({
      storeId, locationResourceName, action: "sync_hours", field: "regularHours",
      status: "skipped", newValue: "Google already has hours", triggeredBy,
    });
  }

  // ── 7. Sync booking URL ───────────────────────────────────────────────────
  if (!googleHasWebsite && certxaBookingUrl) {
    try {
      await updateListingFields(
        locationResourceName,
        { websiteUri: certxaBookingUrl },
        oauth2Client,
        patchCtx("sync_booking_url"),
      );
      await logOptimization({
        storeId, locationResourceName, action: "sync_booking_url", field: "websiteUri",
        previousValue: null, newValue: certxaBookingUrl, status: "success", triggeredBy,
      });
      actionsPerformed.push("sync_booking_url");
      console.log(`[GBP Worker] storeId=${storeId}: set booking URL → ${certxaBookingUrl}`);
    } catch (err: any) {
      const result = await handlePatchError(err, "sync_booking_url", "websiteUri", `sync_booking_url failed: ${err?.message ?? String(err)}`);
      if (result === "auth") return { storeId, actionsPerformed, errors };
    }
  } else if (googleHasWebsite && certxaBookingUrl) {
    const isCertxaUrl = googleCurrentWebsite?.includes("certxa.com");
    await logOptimization({
      storeId, locationResourceName, action: "sync_booking_url", field: "websiteUri",
      previousValue: googleCurrentWebsite ?? undefined,
      status: "skipped",
      newValue: isCertxaUrl ? "already_set" : "conflict_not_overwritten",
      triggeredBy,
    });
  }

  // ── 8. Sync description ───────────────────────────────────────────────────
  if (!googleHasDescription && serviceRows.length > 0) {
    try {
      const topServices = serviceRows.slice(0, 8).map((s) => s.name).join(", ");
      const description =
        `${store.name} offers professional beauty services including ${topServices}. ` +
        `Book your appointment online at certxa.com.`;

      await updateListingFields(
        locationResourceName,
        { profile: { description } },
        oauth2Client,
        patchCtx("sync_description"),
      );
      await logOptimization({
        storeId, locationResourceName, action: "sync_description", field: "profile.description",
        previousValue: null, newValue: description, status: "success", triggeredBy,
      });
      actionsPerformed.push("sync_description");
      console.log(`[GBP Worker] storeId=${storeId}: set description (${description.length} chars)`);
    } catch (err: any) {
      const result = await handlePatchError(err, "sync_description", "profile.description", `sync_description failed: ${err?.message ?? String(err)}`);
      if (result === "auth") return { storeId, actionsPerformed, errors };
    }
  } else if (googleHasDescription) {
    await logOptimization({
      storeId, locationResourceName, action: "sync_description", field: "profile.description",
      status: "skipped", newValue: "Google already has a description", triggeredBy,
    });
  }

  // ── 9. Sync services (only if owner has service sync enabled) ─────────────
  if (serviceRows.length > 0 && serviceSyncEnabled) {
    try {
      const result = await syncServicesToGoogle(storeId);
      await logOptimization({
        storeId, locationResourceName, action: "sync_services", field: "serviceItems",
        previousValue: null, newValue: JSON.stringify({ syncedCount: result.syncedCount }),
        status: "success", triggeredBy,
      });
      actionsPerformed.push(`sync_services (${result.syncedCount} service(s))`);
      console.log(`[GBP Worker] storeId=${storeId}: synced ${result.syncedCount} service(s)`);
    } catch (err: any) {
      if (isGBPAuthError(err) || err?.isAuthError) {
        const reason = "Google OAuth token revoked or expired";
        errors.push(reason);
        await logOptimization({ storeId, locationResourceName, action: "sync_services", field: "serviceItems", status: "failed", errorMessage: reason, triggeredBy });
        await handleAuthFailure(storeId, reason);
        return { storeId, actionsPerformed, errors };
      }
      if (err?.status === 429 || String(err?.message).includes("429")) recordQuota429(err);
      const msg = `sync_services failed: ${err?.message ?? String(err)}`;
      errors.push(msg);
      await logOptimization({ storeId, locationResourceName, action: "sync_services", field: "serviceItems", status: "failed", errorMessage: msg.slice(0, 500), triggeredBy });
      console.error(`[GBP Worker] storeId=${storeId}: ${msg}`);
    }
  } else if (serviceRows.length > 0 && !serviceSyncEnabled) {
    await logOptimization({
      storeId, locationResourceName, action: "sync_services", field: "serviceItems",
      status: "skipped", newValue: "service sync disabled by owner", triggeredBy,
    });
    console.log(`[GBP Worker] storeId=${storeId}: service sync skipped (disabled by owner)`);
  }

  // ── 10. Category recommendations (log only — never auto-apply) ────────────
  if (serviceRows.length > 0) {
    try {
      const serviceNames = serviceRows.map((s) => s.name);
      const { primary, secondaries } = recommendCategories(serviceNames);

      const googlePrimaryCategory: string =
        googleData?.categories?.primaryCategory?.displayName ?? "";
      const googleSecondaryCategories: string[] = (
        googleData?.categories?.additionalCategories ?? []
      ).map((c: any) => c.displayName ?? "");

      if (primary) {
        const alreadyMatches =
          googlePrimaryCategory.toLowerCase() === primary.gbpName.toLowerCase();
        await logOptimization({
          storeId, locationResourceName, action: "category_recommendation",
          field: "categories.primaryCategory",
          previousValue: googlePrimaryCategory || "not_set",
          newValue: JSON.stringify({ recommended: primary.gbpName, gcid: primary.gcid, score: primary.score, alreadyMatches }),
          status: "recommended", triggeredBy,
        });
        if (!alreadyMatches) {
          console.log(
            `[GBP Worker] storeId=${storeId}: category recommendation — ` +
            `primary "${primary.gbpName}" (currently: "${googlePrimaryCategory || "none"}")`,
          );
        }
      }

      if (secondaries.length > 0) {
        await logOptimization({
          storeId, locationResourceName, action: "category_recommendation",
          field: "categories.additionalCategories",
          previousValue: JSON.stringify(googleSecondaryCategories),
          newValue: JSON.stringify({
            recommended: secondaries.map((s) => s.gbpName),
            note: "owner must apply manually via Google Business Profile",
          }),
          status: "recommended", triggeredBy,
        });
      }

      actionsPerformed.push(
        `category_recommendation (primary: ${primary?.gbpName ?? "none"}, ${secondaries.length} secondary)`,
      );
    } catch (err: any) {
      const msg = `category_recommendation failed: ${err?.message ?? String(err)}`;
      errors.push(msg);
      console.error(`[GBP Worker] storeId=${storeId}: ${msg}`);
    }
  }

  console.log(
    `[GBP Worker] ── Done storeId=${storeId}: ${actionsPerformed.length} action(s), ` +
    `${errors.length} error(s) ──`,
  );
  return { storeId, actionsPerformed, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// ALL-STORES SWEEP
// ─────────────────────────────────────────────────────────────────────────────

export async function runGBPOptimizationForAllStores(): Promise<void> {
  console.log("[GBP Worker] ── Starting full sweep of all connected stores ──");

  const connectedProfiles = await db
    .select({ storeId: googleBusinessProfiles.storeId })
    .from(googleBusinessProfiles)
    .where(
      and(
        eq(googleBusinessProfiles.isConnected, true),
        isNotNull(googleBusinessProfiles.locationResourceName),
        or(
          isNotNull(googleBusinessProfiles.accessToken),
          isNotNull(googleBusinessProfiles.refreshToken),
        ),
      ),
    );

  console.log(`[GBP Worker] Found ${connectedProfiles.length} connected store(s)`);

  let succeeded = 0;
  let failed    = 0;
  let skipped   = 0;

  for (const { storeId } of connectedProfiles) {
    // Re-check quota guard before each store in case a previous PATCH triggered a 429
    const cooldown = isQuotaCoolingDown();
    if (cooldown.coolingDown) {
      const secs = Math.ceil(cooldown.retryAfterMs / 1000);
      const remaining = connectedProfiles.length - succeeded - failed - skipped;
      console.warn(
        `[GBP Worker] Quota cooldown active (${secs}s) — skipping ${remaining} remaining store(s) for this sweep.`,
      );
      skipped += remaining;
      break;
    }

    try {
      await runGBPOptimizationForStore(storeId, "scheduler");
      succeeded++;
    } catch (err: any) {
      failed++;
      console.error(
        `[GBP Worker] Unhandled error for storeId=${storeId}: ${err?.message ?? String(err)}`,
      );
    }

    // Polite inter-store delay
    await new Promise<void>((r) => setTimeout(r, 2_000));
  }

  console.log(
    `[GBP Worker] ── Full sweep complete: ${succeeded} succeeded, ${failed} failed, ${skipped} skipped ──`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULER
// ─────────────────────────────────────────────────────────────────────────────

export function startGBPOptimizationScheduler(): void {
  const INTERVAL_MS      = 24 * 60 * 60 * 1_000;
  const STARTUP_DELAY_MS = 60_000;

  setTimeout(() => {
    runGBPOptimizationForAllStores().catch((err) =>
      console.error("[GBP Worker] Startup run failed:", err),
    );
  }, STARTUP_DELAY_MS);

  setInterval(() => {
    runGBPOptimizationForAllStores().catch((err) =>
      console.error("[GBP Worker] Scheduled run failed:", err),
    );
  }, INTERVAL_MS);

  console.log(
    `[GBP Worker] Scheduler started — daily sweep every 24h ` +
    `(first run in ${STARTUP_DELAY_MS / 1000}s)`,
  );
}
