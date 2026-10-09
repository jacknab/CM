/**
 * templateSeed.ts
 *
 * Builds a new store's starting catalogue from its own business-type template
 * (onboarding-data.ts): categories, services, add-ons and the service → add-on
 * links. Add-ons that repeat across services (same name) are created once.
 *
 * Returns the list of new service IDs so the caller can assign them to staff.
 */

import { db } from "../db";
import { serviceCategories, services, addons, serviceAddons } from "@shared/schema";
import type { BusinessTemplate } from "../onboarding-data";

export async function seedFromBusinessTemplate(storeId: number, template: BusinessTemplate): Promise<number[]> {
  const newServiceIds: number[] = [];
  const addonIdByName = new Map<string, number>();

  for (const [sortOrder, cat] of template.categories.entries()) {
    const [newCat] = await db
      .insert(serviceCategories)
      .values({ name: cat.name, storeId, sortOrder, imageUrl: null })
      .returning();

    for (const svc of cat.services) {
      const [newSvc] = await db
        .insert(services)
        .values({
          name: svc.name,
          description: svc.description,
          duration: svc.duration,
          price: svc.price,
          category: cat.name,
          categoryId: newCat.id,
          storeId,
        })
        .returning();
      newServiceIds.push(newSvc.id);

      for (const addon of svc.addons ?? []) {
        let addonId = addonIdByName.get(addon.name);
        if (addonId == null) {
          const [newAddon] = await db
            .insert(addons)
            .values({ name: addon.name, description: addon.description, price: addon.price, duration: addon.duration, storeId })
            .returning();
          addonId = newAddon.id;
          addonIdByName.set(addon.name, addonId);
        }
        await db.insert(serviceAddons).values({ serviceId: newSvc.id, addonId });
      }
    }
  }

  console.log(`[templateSeed] Store ${storeId}: ${template.categories.length} categories, ${newServiceIds.length} services, ${addonIdByName.size} add-ons`);
  return newServiceIds;
}
