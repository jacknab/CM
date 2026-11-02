import { eq } from "drizzle-orm";
import { db } from "../db";
import { locations, storeNetworkTrust } from "@shared/schema";
import type { Request } from "express";

/** Real client IP, respecting the app's `trust proxy` config (see auth.ts). */
export function getClientIp(req: Request): string {
  return (req.ip || req.socket.remoteAddress || "").replace(/^::ffff:/, "");
}

/**
 * Called periodically from /calendar while it's open. Establishes or
 * refreshes the trusted network IP for a store — but only the device that
 * FIRST reports for a store ever gets to set/change it. A different device
 * reporting later (e.g. an owner checking the schedule from home) is
 * silently ignored: it can neither steal the anchor nor dilute/overwrite the
 * trusted IP. This is what keeps the feature safe to auto-learn from real
 * traffic instead of requiring a manual "lock to this network" step.
 */
export async function reportCalendarNetwork(storeId: number, deviceId: string, ip: string): Promise<void> {
  if (!deviceId || !ip || deviceId === POS_ANCHOR) return;
  const [existing] = await db.select().from(storeNetworkTrust).where(eq(storeNetworkTrust.storeId, storeId));
  // The salon's POS tablets keep it once they report (reportPosNetwork): /calendar no longer changes it.
  if (existing?.anchorDeviceId === POS_ANCHOR) return;
  if (!existing) {
    await db.insert(storeNetworkTrust)
      .values({ storeId, anchorDeviceId: deviceId, trustedIp: ip })
      .onConflictDoNothing();
    return;
  }
  if (existing.anchorDeviceId === deviceId && existing.trustedIp !== ip) {
    await db.update(storeNetworkTrust)
      .set({ trustedIp: ip, updatedAt: new Date() })
      .where(eq(storeNetworkTrust.id, existing.id));
  }
  // Different device than the anchor: ignored on purpose.
}

/** The anchor once the salon's own POS tablets set the IP (reportPosNetwork). */
const POS_ANCHOR = "pos-stations";

/**
 * The salon's internet IP as its POS tablets see it (owner, 2026-11-02): reported by every POS station in the Certxa
 * app with its hub heartbeat (every minute), so it is the salon's real address and follows it when the ISP changes
 * it. It takes over from the /calendar device that first set it (store 2: the owner's own computer at home, Oct 26,
 * which no tablet could ever correct). Written only when it changes.
 */
export async function reportPosNetwork(storeId: number, ip: string): Promise<void> {
  if (!ip) return;
  const [existing] = await db.select().from(storeNetworkTrust).where(eq(storeNetworkTrust.storeId, storeId));
  if (!existing) {
    await db.insert(storeNetworkTrust).values({ storeId, anchorDeviceId: POS_ANCHOR, trustedIp: ip }).onConflictDoNothing();
    return;
  }
  if (existing.anchorDeviceId === POS_ANCHOR && existing.trustedIp === ip) return;
  await db.update(storeNetworkTrust)
    .set({ anchorDeviceId: POS_ANCHOR, trustedIp: ip, updatedAt: new Date() })
    .where(eq(storeNetworkTrust.id, existing.id));
}

/**
 * True if this request should be allowed through to /kiosk or /frontdesk for
 * the given store. Fails OPEN (allows) whenever the restriction isn't
 * actually enforceable yet — the feature is off for this store, or no
 * anchor has been established (nobody has opened /calendar there since the
 * feature shipped/was turned on) — rather than locking a salon out of its
 * own kiosk before setup has had a chance to happen.
 */
export async function isRequestFromTrustedNetwork(storeId: number, req: Request): Promise<boolean> {
  const [store] = await db.select({ restrict: locations.restrictKioskNetwork })
    .from(locations).where(eq(locations.id, storeId));
  if (!store?.restrict) return true;

  const [trust] = await db.select().from(storeNetworkTrust).where(eq(storeNetworkTrust.storeId, storeId));
  if (!trust) return true;

  return getClientIp(req) === trust.trustedIp;
}

/** Resolves a store id from its booking slug, or null if it doesn't exist. */
export async function resolveStoreIdBySlug(slug: string): Promise<number | null> {
  const [store] = await db.select({ id: locations.id }).from(locations).where(eq(locations.bookingSlug, slug));
  return store?.id ?? null;
}
