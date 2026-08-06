/**
 * nailSalonSeed.ts
 *
 * Seeds a new nail-salon store with categories, services, and add-ons
 * based on the categories the owner selected during onboarding.
 *
 * Returns the list of created service IDs so staff can be linked to them.
 */

import { db } from "../db";
import { serviceCategories, services, addons, serviceAddons } from "@shared/schema";
import { filterCatalog, NAIL_ADDONS } from "./nailSalonCatalog";

export async function seedFromNailCatalog(
  storeId: number,
  selectedCategories: string[]
): Promise<number[]> {
  console.log(`[nailSeed] Seeding store ${storeId} for categories: ${selectedCategories.join(", ")}`);

  const catalog = filterCatalog(selectedCategories);
  if (catalog.length === 0) {
    console.warn("[nailSeed] No matching categories found — nothing seeded.");
    return [];
  }

  // ── 1. Collect all addon keys needed across the selected catalog ───────────
  const neededAddonKeys = new Set<string>();
  for (const cat of catalog) {
    for (const svc of cat.services) {
      for (const key of svc.addonKeys) {
        neededAddonKeys.add(key);
      }
    }
  }

  // ── 2. Insert addons and build key → DB id map ────────────────────────────
  const addonIdMap: Record<string, number> = {};

  for (const key of neededAddonKeys) {
    const def = NAIL_ADDONS[key];
    if (!def) continue;

    const [row] = await db
      .insert(addons)
      .values({
        name: def.name,
        description: def.description,
        price: def.price,
        duration: def.duration,
        storeId,
        type: "full",
        parentAddonId: null,
        isStackable: def.isStackable,
        isActive: true,
      })
      .returning();

    addonIdMap[key] = row.id;
  }

  console.log(`[nailSeed] Created ${Object.keys(addonIdMap).length} add-ons`);

  // ── 3. Insert categories → services → service_addon links ─────────────────
  const allServiceIds: number[] = [];

  for (const cat of catalog) {
    // Create category
    const [newCat] = await db
      .insert(serviceCategories)
      .values({
        name: cat.name,
        color: cat.color,
        storeId,
        sortOrder: cat.sortOrder,
        imageUrl: null,
      })
      .returning();

    console.log(`[nailSeed] Created category: ${cat.name} (id=${newCat.id})`);

    // Create each service in this category
    for (const svc of cat.services) {
      const [newSvc] = await db
        .insert(services)
        .values({
          name: svc.name,
          description: svc.description,
          price: svc.price,
          duration: svc.duration,
          category: cat.name,
          categoryId: newCat.id,
          storeId,
          isActive: true,
          depositRequired: false,
          depositAmount: null,
          imageUrl: null,
          illustrationCategoryId: null,
          customIllustrationUrl: null,
          autoAssigned: false,
        })
        .returning();

      allServiceIds.push(newSvc.id);

      // Link applicable add-ons
      const addonLinks = svc.addonKeys
        .filter(key => addonIdMap[key] != null)
        .map(key => ({ serviceId: newSvc.id, addonId: addonIdMap[key] }));

      if (addonLinks.length > 0) {
        await db.insert(serviceAddons).values(addonLinks);
      }
    }
  }

  console.log(`[nailSeed] Done — store ${storeId} seeded with ${allServiceIds.length} services across ${catalog.length} categories`);
  return allServiceIds;
}
