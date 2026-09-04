import { db } from "../db";
import { packages, packageItems, services, addons } from "@shared/schema";
import { and, eq, inArray } from "drizzle-orm";

export interface ResolvedPackage {
  packageId: number;
  name: string;
  /** First service in the package (by sort order) — the appointment's serviceId. */
  primaryServiceId: number;
  /** Σ of every component's duration, in minutes — the appointment duration. */
  durationMinutes: number;
  /** Effective price: fixed override when set, otherwise the component sum. */
  price: number;
  /** Sum of component prices, before any fixed-price override. */
  listPrice: number;
  /** All component service ids (includes primary), in order. */
  serviceIds: number[];
  /** All component add-on ids, in order. */
  addonIds: number[];
}

/**
 * Resolve a Catalog package into the concrete values a booking needs. Shared by
 * every create path (public /book, staff POST /api/appointments, POS
 * record-sale) so the "a package is one appointment" rule lives in one place.
 *
 * Throws if the package is missing / inactive / not this store's / has no
 * service component (a package needs at least one service to anchor the
 * appointment's serviceId, staff eligibility and commission).
 */
export async function resolvePackageForBooking(
  packageId: number,
  storeId: number,
): Promise<ResolvedPackage> {
  const [pkg] = await db.select().from(packages)
    .where(and(eq(packages.id, packageId), eq(packages.storeId, storeId), eq(packages.isActive, true)));
  if (!pkg) throw new Error("Package not found");

  const itemRows = await db.select().from(packageItems)
    .where(eq(packageItems.packageId, packageId))
    .orderBy(packageItems.sortOrder, packageItems.id);

  const serviceIds = itemRows.filter(r => r.itemType === "service" && r.serviceId).map(r => r.serviceId as number);
  const addonIds   = itemRows.filter(r => r.itemType === "addon"   && r.addonId).map(r => r.addonId as number);
  if (serviceIds.length === 0) throw new Error("Package has no services");

  const svcRows = await db.select({ id: services.id, price: services.price, duration: services.duration })
    .from(services).where(inArray(services.id, serviceIds));
  const adnRows = addonIds.length
    ? await db.select({ id: addons.id, price: addons.price, duration: addons.duration })
        .from(addons).where(inArray(addons.id, addonIds))
    : [];

  const svcMap = new Map(svcRows.map(s => [s.id, s]));
  const adnMap = new Map(adnRows.map(a => [a.id, a]));

  let durationMinutes = 0;
  let listPrice = 0;
  for (const id of serviceIds) {
    const s = svcMap.get(id);
    if (!s) continue;
    durationMinutes += Number(s.duration) || 0;
    listPrice += Number(s.price) || 0;
  }
  for (const id of addonIds) {
    const a = adnMap.get(id);
    if (!a) continue;
    durationMinutes += Number(a.duration) || 0;
    listPrice += Number(a.price) || 0;
  }

  const price = pkg.pricingMode === "fixed" && pkg.fixedPrice != null
    ? Number(pkg.fixedPrice) || 0
    : listPrice;

  return {
    packageId,
    name: pkg.name,
    primaryServiceId: serviceIds[0],
    durationMinutes: Math.max(durationMinutes, 15),
    price,
    listPrice,
    serviceIds,
    addonIds,
  };
}
