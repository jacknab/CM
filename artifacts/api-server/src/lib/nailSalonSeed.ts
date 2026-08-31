/**
 * nailSalonSeed.ts
 *
 * Builds a Nail Salon store's entire service catalog from the static template
 * in nailSalonCatalog.ts:
 *
 *   • nail vocabularies      → nail_sizes / nail_shapes / nail_art_applications / nail_art_effects
 *   • add-ons                → addons
 *   • categories + services  → service_categories / services
 *   • service→add-on links   → service_addons
 *   • nail configuration     → nail_service_configs + the four service_nail_* junctions
 *                              (only for fake-nail services)
 *
 * Called once at onboarding for businessType === "Nail Salon", and by
 * scripts/rebuild-store2-nail-catalog.sh. Returns the created service IDs so
 * staff can be linked to them.
 */

import { db } from "../db";
import {
  serviceCategories,
  services,
  addons,
  serviceAddons,
  nailSizes,
  nailShapes,
  nailArtApplications,
  nailArtEffects,
  nailServiceConfigs,
  serviceNailSizes,
  serviceNailShapes,
  serviceNailArtApplications,
  serviceNailArtEffects,
} from "@shared/schema";
import {
  NAIL_CATALOG,
  NAIL_ADDONS,
  NAIL_SIZES,
  NAIL_SHAPES,
  NAIL_ART_APPLICATIONS,
  NAIL_ART_EFFECTS,
  NAIL_SERVICE_CONFIG_DEFAULTS,
  type NailVocabTemplate,
  type NailConfigEntry,
} from "./nailSalonCatalog";

export async function seedNailSalonCatalog(storeId: number): Promise<number[]> {
  console.log(`[nailSeed] Building nail-salon catalog for store ${storeId}`);

  // ── 1. Vocabularies ────────────────────────────────────────────────────────
  const sizeIdByCode   = await seedVocab(nailSizes, storeId, NAIL_SIZES);
  const shapeIdByCode  = await seedVocab(nailShapes, storeId, NAIL_SHAPES);
  const appIdByCode    = await seedVocab(nailArtApplications, storeId, NAIL_ART_APPLICATIONS,
    (row) => ({ isQuote: (row as { isQuote?: boolean }).isQuote ?? false }));
  const effectIdByCode = await seedVocab(nailArtEffects, storeId, NAIL_ART_EFFECTS);
  console.log(
    `[nailSeed] Vocab: ${Object.keys(sizeIdByCode).length} sizes, ` +
    `${Object.keys(shapeIdByCode).length} shapes, ` +
    `${Object.keys(appIdByCode).length} art applications, ` +
    `${Object.keys(effectIdByCode).length} art effects`,
  );

  // ── 2. Add-ons ────────────────────────────────────────────────────────────
  const addonIdByKey: Record<string, number> = {};
  for (const [key, def] of Object.entries(NAIL_ADDONS)) {
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
    addonIdByKey[key] = row.id;
  }
  console.log(`[nailSeed] Created ${Object.keys(addonIdByKey).length} add-ons`);

  // ── 3. Categories → services → add-on links → nail configuration ──────────
  const allServiceIds: number[] = [];

  for (const cat of NAIL_CATALOG) {
    const [newCat] = await db
      .insert(serviceCategories)
      .values({ name: cat.name, color: cat.color, storeId, sortOrder: cat.sortOrder, imageUrl: null })
      .returning();

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

      // service → add-on links
      const addonLinks = svc.addonKeys
        .filter((k) => addonIdByKey[k] != null)
        .map((k) => ({ serviceId: newSvc.id, addonId: addonIdByKey[k] }));
      if (addonLinks.length > 0) {
        await db.insert(serviceAddons).values(addonLinks);
      }

      // nail configuration — fake-nail services only
      const cfg = NAIL_SERVICE_CONFIG_DEFAULTS[svc.name];
      if (cfg) {
        await db.insert(nailServiceConfigs).values({
          storeId,
          serviceId: newSvc.id,
          isEnabled: true,
          lengthRequired: cfg.lengthRequired ?? true,
          shapeRequired: cfg.shapeRequired ?? true,
          artRequired: cfg.artRequired ?? false,
        });
        await insertJunction(serviceNailSizes, storeId, newSvc.id, cfg.sizes, sizeIdByCode, "nailSizeId", true);
        await insertJunction(serviceNailShapes, storeId, newSvc.id, cfg.shapes, shapeIdByCode, "nailShapeId", true);
        await insertJunction(serviceNailArtApplications, storeId, newSvc.id, cfg.artApplications, appIdByCode, "nailArtApplicationId", false);
        await insertJunction(serviceNailArtEffects, storeId, newSvc.id, cfg.artEffects, effectIdByCode, "nailArtEffectId", false);
      }
    }
  }
  console.log(`[nailSeed] Created ${allServiceIds.length} services across ${NAIL_CATALOG.length} categories`);

  // ── 4. Auto-assign service images from the platform library ──────────────
  try {
    const { autoAssignServiceImages } = await import("../routes/serviceImages");
    const assigned = await autoAssignServiceImages(storeId, allServiceIds);
    console.log(`[nailSeed] Auto-assigned ${assigned} service images from library`);
  } catch (e: any) {
    console.warn(`[nailSeed] Service image auto-assign skipped: ${e?.message ?? e}`);
  }

  console.log(`[nailSeed] Done — store ${storeId} seeded with ${allServiceIds.length} services`);
  return allServiceIds;
}

// ── helpers ────────────────────────────────────────────────────────────────

async function seedVocab(
  table: any,
  storeId: number,
  rows: NailVocabTemplate[],
  extra?: (row: NailVocabTemplate) => Record<string, unknown>,
): Promise<Record<string, number>> {
  const idByCode: Record<string, number> = {};
  for (const row of rows) {
    const inserted = (await db
      .insert(table)
      .values({
        storeId,
        code: row.code,
        name: row.name,
        description: row.description ?? null,
        sortOrder: row.sortOrder,
        isActive: true,
        ...(extra ? extra(row) : {}),
      })
      .returning()) as Array<{ id: number }>;
    idByCode[row.code] = inserted[0].id;
  }
  return idByCode;
}

async function insertJunction(
  table: any,
  storeId: number,
  serviceId: number,
  entries: NailConfigEntry[],
  idByCode: Record<string, number>,
  fkColumn: "nailSizeId" | "nailShapeId" | "nailArtApplicationId" | "nailArtEffectId",
  supportsIsDefault: boolean,
): Promise<void> {
  const values = entries
    .filter((e) => idByCode[e.code] != null)
    .map((e, i) => ({
      storeId,
      serviceId,
      [fkColumn]: idByCode[e.code],
      priceAdjustment: e.priceAdjustment,
      durationAdjustment: e.durationAdjustment ?? 0,
      isEnabled: e.enabled ?? true,
      sortOrder: i,
      ...(supportsIsDefault ? { isDefault: e.isDefault ?? false } : {}),
    }));
  if (values.length > 0) {
    await db.insert(table).values(values as any);
  }
}
