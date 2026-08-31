/**
 * presetSeed.ts
 *
 * Copies service categories, services, addons, service-addon links, and
 * kiosk category-image settings from the preset store (storeId = 2) into
 * a newly-created store.  Every new account gets exactly the same catalogue
 * that was set up in the preset store.
 *
 * Returns the list of new service IDs so the caller can assign them to staff.
 */

import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  serviceCategories,
  services,
  addons,
  serviceAddons,
  storeSettings,
} from "@shared/schema";

const PRESET_STORE_ID = 2;

export async function seedFromPresetStore(newStoreId: number): Promise<number[]> {
  console.log(`[presetSeed] Seeding store ${newStoreId} from preset store ${PRESET_STORE_ID}`);

  // ── 1. Service categories ──────────────────────────────────────────────────
  const srcCategories = await db
    .select()
    .from(serviceCategories)
    .where(eq(serviceCategories.storeId, PRESET_STORE_ID));

  const categoryIdMap: Record<number, number> = {};

  for (const cat of srcCategories) {
    const [newCat] = await db
      .insert(serviceCategories)
      .values({
        name: cat.name,
        imageUrl: cat.imageUrl ?? null,
        storeId: newStoreId,
        sortOrder: cat.sortOrder ?? 0,
      })
      .returning();
    categoryIdMap[cat.id] = newCat.id;
  }

  console.log(`[presetSeed] Copied ${srcCategories.length} categories`);

  // ── 2. Services ────────────────────────────────────────────────────────────
  const srcServices = await db
    .select()
    .from(services)
    .where(eq(services.storeId, PRESET_STORE_ID));

  const serviceIdMap: Record<number, number> = {};
  const newServiceIds: number[] = [];

  for (const svc of srcServices) {
    const [newSvc] = await db
      .insert(services)
      .values({
        name: svc.name,
        description: svc.description ?? null,
        duration: svc.duration,
        price: svc.price,
        category: svc.category,
        categoryId: svc.categoryId != null ? (categoryIdMap[svc.categoryId] ?? null) : null,
        imageUrl: svc.imageUrl ?? null,
        storeId: newStoreId,
        depositRequired: svc.depositRequired ?? false,
        depositAmount: svc.depositAmount ?? null,
        illustrationCategoryId: svc.illustrationCategoryId ?? null,
        customIllustrationUrl: svc.customIllustrationUrl ?? null,
        autoAssigned: svc.autoAssigned ?? false,
        isActive: svc.isActive ?? true,
      })
      .returning();

    serviceIdMap[svc.id] = newSvc.id;
    newServiceIds.push(newSvc.id);
  }

  console.log(`[presetSeed] Copied ${srcServices.length} services`);

  // ── 3. Addons (two-pass to preserve parentAddonId links) ──────────────────
  const srcAddons = await db
    .select()
    .from(addons)
    .where(eq(addons.storeId, PRESET_STORE_ID));

  const addonIdMap: Record<number, number> = {};

  // First pass — insert without parentAddonId
  for (const addon of srcAddons) {
    const [newAddon] = await db
      .insert(addons)
      .values({
        name: addon.name,
        description: addon.description ?? null,
        price: addon.price,
        duration: addon.duration,
        imageUrl: addon.imageUrl ?? null,
        storeId: newStoreId,
        type: addon.type ?? "full",
        parentAddonId: null,
        isStackable: addon.isStackable ?? true,
        isActive: addon.isActive ?? true,
      })
      .returning();

    addonIdMap[addon.id] = newAddon.id;
  }

  // Second pass — wire up variant/parent relationships
  for (const addon of srcAddons) {
    if (addon.parentAddonId != null && addonIdMap[addon.parentAddonId] != null) {
      await db
        .update(addons)
        .set({ parentAddonId: addonIdMap[addon.parentAddonId] })
        .where(eq(addons.id, addonIdMap[addon.id]));
    }
  }

  console.log(`[presetSeed] Copied ${srcAddons.length} addons`);

  // ── 4. Service-addon links ─────────────────────────────────────────────────
  if (srcServices.length > 0) {
    const srcServiceIds = srcServices.map(s => s.id);
    const srcLinks = await db
      .select()
      .from(serviceAddons)
      .where(inArray(serviceAddons.serviceId, srcServiceIds));

    for (const link of srcLinks) {
      const newServiceId = serviceIdMap[link.serviceId];
      const newAddonId   = addonIdMap[link.addonId];
      if (newServiceId != null && newAddonId != null) {
        await db.insert(serviceAddons).values({
          serviceId: newServiceId,
          addonId:   newAddonId,
        });
      }
    }

    console.log(`[presetSeed] Copied ${srcLinks.length} service-addon links`);
  }

  // ── 5. Kiosk category images ───────────────────────────────────────────────
  // categoryImages are R2 URLs — safe to share references across stores.
  const [presetSettings] = await db
    .select()
    .from(storeSettings)
    .where(eq(storeSettings.storeId, PRESET_STORE_ID));

  if (presetSettings?.preferences) {
    try {
      const presetPrefs = JSON.parse(presetSettings.preferences as string);
      const categoryImages = presetPrefs?.kioskSettings?.categoryImages;

      if (categoryImages && Object.keys(categoryImages).length > 0) {
        const [existingRow] = await db
          .select()
          .from(storeSettings)
          .where(eq(storeSettings.storeId, newStoreId));

        const currentPrefs = existingRow?.preferences
          ? JSON.parse(existingRow.preferences as string)
          : {};

        const merged = {
          ...currentPrefs,
          kioskSettings: {
            ...(currentPrefs.kioskSettings ?? {}),
            categoryImages,
          },
          features: {
            ...(currentPrefs.features ?? {}),
            // Explicitly persist the default so auth checks never see undefined
            staffPortalEnabled: (currentPrefs.features?.staffPortalEnabled ?? true),
          },
        };

        if (existingRow) {
          await db
            .update(storeSettings)
            .set({ preferences: JSON.stringify(merged), updatedAt: new Date() })
            .where(eq(storeSettings.storeId, newStoreId));
        } else {
          await db.insert(storeSettings).values({
            storeId: newStoreId,
            preferences: JSON.stringify(merged),
          });
        }

        console.log(`[presetSeed] Copied kiosk category images (${Object.keys(categoryImages).length} keys)`);
      }
    } catch (e) {
      console.warn("[presetSeed] Could not copy kiosk images:", e);
    }
  }

  // ── 6. Auto-assign service images from the platform library ──────────────
  // The preset store may have stale or missing image links; for new stores we
  // run the auto-assigner so the public booking page renders illustrations
  // immediately without the owner having to trigger anything manually.
  try {
    const { autoAssignServiceImages } = await import("../routes/serviceImages");
    const assigned = await autoAssignServiceImages(newStoreId, newServiceIds);
    console.log(`[presetSeed] Auto-assigned ${assigned} service images from library`);
  } catch (e: any) {
    console.warn(`[presetSeed] Service image auto-assign skipped: ${e?.message ?? e}`);
  }

  console.log(`[presetSeed] Done — store ${newStoreId} seeded with ${newServiceIds.length} services`);
  return newServiceIds;
}
