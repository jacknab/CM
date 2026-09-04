/**
 * nailConfig.ts
 *
 * Read/write helpers for the store-owned nail configuration system (migration
 * 0154) and the booking-time selection snapshot (migration 0155).
 *
 * Standalone functions over `db` (same style as presetSeed / nailSalonSeed) so
 * the change stays out of the large IStorage interface.
 */

import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { matchLibraryImages } from "./serviceImageMatch";
import {
  services,
  nailSizes,
  nailShapes,
  nailArtApplications,
  nailArtEffects,
  nailServiceConfigs,
  serviceNailSizes,
  serviceNailShapes,
  serviceNailArtApplications,
  serviceNailArtEffects,
  appointments,
  appointmentNailSelection,
} from "@shared/schema";

// ── Vocabulary ─────────────────────────────────────────────────────────────

export type NailVocabKind = "size" | "shape" | "application" | "effect";

const VOCAB_TABLE = {
  size: nailSizes,
  shape: nailShapes,
  application: nailArtApplications,
  effect: nailArtEffects,
} as const;

/** All active vocabulary rows for a store, ordered for display. */
export async function getNailVocab(storeId: number) {
  const [sizes, shapes, applications, effects] = await Promise.all([
    db.select().from(nailSizes).where(eq(nailSizes.storeId, storeId)).orderBy(asc(nailSizes.sortOrder), asc(nailSizes.id)),
    db.select().from(nailShapes).where(eq(nailShapes.storeId, storeId)).orderBy(asc(nailShapes.sortOrder), asc(nailShapes.id)),
    db.select().from(nailArtApplications).where(eq(nailArtApplications.storeId, storeId)).orderBy(asc(nailArtApplications.sortOrder), asc(nailArtApplications.id)),
    db.select().from(nailArtEffects).where(eq(nailArtEffects.storeId, storeId)).orderBy(asc(nailArtEffects.sortOrder), asc(nailArtEffects.id)),
  ]);
  return { sizes, shapes, applications, effects };
}

export async function createNailVocabRow(kind: NailVocabKind, storeId: number, data: Record<string, unknown>) {
  const table: any = VOCAB_TABLE[kind];
  const rows = (await db.insert(table).values({ ...data, storeId }).returning()) as any[];
  return rows[0];
}

export async function updateNailVocabRow(kind: NailVocabKind, id: number, storeId: number, data: Record<string, unknown>) {
  const table: any = VOCAB_TABLE[kind];
  const rows = (await db
    .update(table)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(table.id, id), eq(table.storeId, storeId)))
    .returning()) as any[];
  return rows[0] ?? null;
}

/** Soft-delete: vocab rows wired into a service config can't be hard-deleted (FK RESTRICT). */
export async function deleteNailVocabRow(kind: NailVocabKind, id: number, storeId: number) {
  const table: any = VOCAB_TABLE[kind];
  const rows = (await db
    .update(table)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(table.id, id), eq(table.storeId, storeId)))
    .returning()) as any[];
  return rows[0] ?? null;
}

// ── Per-service configuration ──────────────────────────────────────────────

/** Services that have a nail configuration, with a short summary for the list page. */
export async function listNailServices(storeId: number) {
  const rows = await db
    .select({
      serviceId: services.id,
      name: services.name,
      price: services.price,
      duration: services.duration,
      category: services.category,
      isEnabled: nailServiceConfigs.isEnabled,
      lengthRequired: nailServiceConfigs.lengthRequired,
      shapeRequired: nailServiceConfigs.shapeRequired,
      artRequired: nailServiceConfigs.artRequired,
    })
    .from(nailServiceConfigs)
    .innerJoin(services, eq(services.id, nailServiceConfigs.serviceId))
    .where(eq(nailServiceConfigs.storeId, storeId))
    .orderBy(asc(services.name));

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.serviceId);
  const [sz, sh, ap, ef] = await Promise.all([
    db.select().from(serviceNailSizes).where(inArray(serviceNailSizes.serviceId, ids)),
    db.select().from(serviceNailShapes).where(inArray(serviceNailShapes.serviceId, ids)),
    db.select().from(serviceNailArtApplications).where(inArray(serviceNailArtApplications.serviceId, ids)),
    db.select().from(serviceNailArtEffects).where(inArray(serviceNailArtEffects.serviceId, ids)),
  ]);
  const count = (list: any[], sid: number, on = true) =>
    list.filter((x) => x.serviceId === sid && (!on || x.isEnabled)).length;

  return rows.map((r) => ({
    ...r,
    enabledSizes: count(sz, r.serviceId),
    enabledShapes: count(sh, r.serviceId),
    enabledApplications: count(ap, r.serviceId),
    enabledEffects: count(ef, r.serviceId),
  }));
}

/** Full nail configuration for one service — its config row plus the four
 *  junction sets, each joined to the vocabulary for names. */
export async function getServiceNailConfig(serviceId: number) {
  const [config] = await db
    .select()
    .from(nailServiceConfigs)
    .where(eq(nailServiceConfigs.serviceId, serviceId));
  if (!config) return null;

  const [sizes, shapes, applications, effects] = await Promise.all([
    db
      .select({
        id: serviceNailSizes.id,
        nailSizeId: serviceNailSizes.nailSizeId,
        name: nailSizes.name,
        description: nailSizes.description,
        imageUrl: nailSizes.imageUrl,
        priceAdjustment: serviceNailSizes.priceAdjustment,
        durationAdjustment: serviceNailSizes.durationAdjustment,
        isDefault: serviceNailSizes.isDefault,
        isEnabled: serviceNailSizes.isEnabled,
        sortOrder: serviceNailSizes.sortOrder,
      })
      .from(serviceNailSizes)
      .innerJoin(nailSizes, eq(nailSizes.id, serviceNailSizes.nailSizeId))
      .where(eq(serviceNailSizes.serviceId, serviceId))
      .orderBy(asc(serviceNailSizes.sortOrder), asc(serviceNailSizes.id)),
    db
      .select({
        id: serviceNailShapes.id,
        nailShapeId: serviceNailShapes.nailShapeId,
        name: nailShapes.name,
        description: nailShapes.description,
        imageUrl: nailShapes.imageUrl,
        priceAdjustment: serviceNailShapes.priceAdjustment,
        durationAdjustment: serviceNailShapes.durationAdjustment,
        isDefault: serviceNailShapes.isDefault,
        isEnabled: serviceNailShapes.isEnabled,
        sortOrder: serviceNailShapes.sortOrder,
      })
      .from(serviceNailShapes)
      .innerJoin(nailShapes, eq(nailShapes.id, serviceNailShapes.nailShapeId))
      .where(eq(serviceNailShapes.serviceId, serviceId))
      .orderBy(asc(serviceNailShapes.sortOrder), asc(serviceNailShapes.id)),
    db
      .select({
        id: serviceNailArtApplications.id,
        nailArtApplicationId: serviceNailArtApplications.nailArtApplicationId,
        name: nailArtApplications.name,
        isQuote: nailArtApplications.isQuote,
        priceAdjustment: serviceNailArtApplications.priceAdjustment,
        durationAdjustment: serviceNailArtApplications.durationAdjustment,
        isEnabled: serviceNailArtApplications.isEnabled,
        sortOrder: serviceNailArtApplications.sortOrder,
      })
      .from(serviceNailArtApplications)
      .innerJoin(nailArtApplications, eq(nailArtApplications.id, serviceNailArtApplications.nailArtApplicationId))
      .where(eq(serviceNailArtApplications.serviceId, serviceId))
      .orderBy(asc(serviceNailArtApplications.sortOrder), asc(serviceNailArtApplications.id)),
    db
      .select({
        id: serviceNailArtEffects.id,
        nailArtEffectId: serviceNailArtEffects.nailArtEffectId,
        name: nailArtEffects.name,
        description: nailArtEffects.description,
        imageUrl: nailArtEffects.imageUrl,
        swatchHex: nailArtEffects.swatchHex,
        priceAdjustment: serviceNailArtEffects.priceAdjustment,
        durationAdjustment: serviceNailArtEffects.durationAdjustment,
        isEnabled: serviceNailArtEffects.isEnabled,
        sortOrder: serviceNailArtEffects.sortOrder,
      })
      .from(serviceNailArtEffects)
      .innerJoin(nailArtEffects, eq(nailArtEffects.id, serviceNailArtEffects.nailArtEffectId))
      .where(eq(serviceNailArtEffects.serviceId, serviceId))
      .orderBy(asc(serviceNailArtEffects.sortOrder), asc(serviceNailArtEffects.id)),
  ]);

  return { config, sizes, shapes, applications, effects };
}

/**
 * Kiosk-facing view of a service's nail config: only enabled options, and only
 * the fields a picker card needs. Returns `{ enabled: false }` when the service
 * has no config or it is switched off.
 */
export async function getPublicServiceNailConfig(serviceId: number) {
  const full = await getServiceNailConfig(serviceId);
  if (!full || !full.config?.isEnabled) return { enabled: false as const };

  const trim = (r: any) => ({
    nailVocabId: r.nailSizeId ?? r.nailShapeId ?? r.nailArtEffectId,
    name: r.name as string,
    description: (r.description ?? null) as string | null,
    imageUrl: (r.imageUrl ?? null) as string | null,
    swatchHex: (r.swatchHex ?? null) as string | null,
    priceAdjustment: Number(r.priceAdjustment ?? 0),
    durationAdjustment: Number(r.durationAdjustment ?? 0),
    isDefault: !!r.isDefault,
  });
  const onlyEnabled = (rows: any[]) => rows.filter((r) => r.isEnabled !== false).map(trim);

  const sizes = onlyEnabled(full.sizes);
  const shapes = onlyEnabled(full.shapes);
  const effects = onlyEnabled(full.effects);

  // Any card without its own image falls back to the best match from the
  // Service Images Library so the kiosk pickers show a real photo, not a tile.
  await Promise.all([
    fillImagesFromLibrary(sizes,  ["nail", "length", "size"]),
    fillImagesFromLibrary(shapes, ["nail", "shape"]),
    fillImagesFromLibrary(effects, ["nail", "art", "design", "polish"]),
  ]);

  return {
    enabled: true as const,
    lengthRequired: !!full.config.lengthRequired,
    shapeRequired: !!full.config.shapeRequired,
    artRequired: !!full.config.artRequired,
    sizes,
    shapes,
    effects,
  };
}

async function fillImagesFromLibrary(
  rows: { name: string; imageUrl: string | null }[],
  context: string[],
): Promise<void> {
  const need = rows.filter((r) => !r.imageUrl).map((r) => r.name);
  if (!need.length) return;
  const matched = await matchLibraryImages(need, context);
  for (const r of rows) {
    if (!r.imageUrl) {
      const hit = matched.get(r.name);
      if (hit) r.imageUrl = hit;
    }
  }
}

type JunctionEntry = {
  vocabId: number;
  priceAdjustment?: string | number;
  durationAdjustment?: number;
  isDefault?: boolean;
  isEnabled?: boolean;
};

export type SaveNailConfigPayload = {
  isEnabled?: boolean;
  lengthRequired?: boolean;
  shapeRequired?: boolean;
  artRequired?: boolean;
  sizes?: JunctionEntry[];
  shapes?: JunctionEntry[];
  applications?: JunctionEntry[];
  effects?: JunctionEntry[];
};

/** Upsert a service's nail configuration. Each supplied junction array fully
 *  replaces that dimension; omit an array to leave it untouched. */
export async function saveServiceNailConfig(storeId: number, serviceId: number, payload: SaveNailConfigPayload) {
  const [svc] = await db.select({ id: services.id }).from(services).where(and(eq(services.id, serviceId), eq(services.storeId, storeId)));
  if (!svc) return null;

  const [existing] = await db.select().from(nailServiceConfigs).where(eq(nailServiceConfigs.serviceId, serviceId));
  if (existing) {
    await db
      .update(nailServiceConfigs)
      .set({
        isEnabled: payload.isEnabled ?? existing.isEnabled,
        lengthRequired: payload.lengthRequired ?? existing.lengthRequired,
        shapeRequired: payload.shapeRequired ?? existing.shapeRequired,
        artRequired: payload.artRequired ?? existing.artRequired,
        updatedAt: new Date(),
      })
      .where(eq(nailServiceConfigs.id, existing.id));
  } else {
    await db.insert(nailServiceConfigs).values({
      storeId,
      serviceId,
      isEnabled: payload.isEnabled ?? true,
      lengthRequired: payload.lengthRequired ?? true,
      shapeRequired: payload.shapeRequired ?? true,
      artRequired: payload.artRequired ?? false,
    });
  }

  await replaceJunction(serviceNailSizes, "nailSizeId", storeId, serviceId, payload.sizes, true);
  await replaceJunction(serviceNailShapes, "nailShapeId", storeId, serviceId, payload.shapes, true);
  await replaceJunction(serviceNailArtApplications, "nailArtApplicationId", storeId, serviceId, payload.applications, false);
  await replaceJunction(serviceNailArtEffects, "nailArtEffectId", storeId, serviceId, payload.effects, false);

  return getServiceNailConfig(serviceId);
}

async function replaceJunction(
  table: any,
  fkColumn: string,
  storeId: number,
  serviceId: number,
  entries: JunctionEntry[] | undefined,
  supportsIsDefault: boolean,
) {
  if (!entries) return;
  await db.delete(table).where(eq(table.serviceId, serviceId));
  if (entries.length === 0) return;
  const values = entries.map((e, i) => ({
    storeId,
    serviceId,
    [fkColumn]: e.vocabId,
    priceAdjustment: String(e.priceAdjustment ?? "0"),
    durationAdjustment: e.durationAdjustment ?? 0,
    isEnabled: e.isEnabled ?? true,
    sortOrder: i,
    ...(supportsIsDefault ? { isDefault: e.isDefault ?? false } : {}),
  }));
  await db.insert(table).values(values as any);
}

// ── Booking-time selection ─────────────────────────────────────────────────

export async function getAppointmentNailSelection(appointmentId: number) {
  const [row] = await db.select().from(appointmentNailSelection).where(eq(appointmentNailSelection.appointmentId, appointmentId));
  return row ?? null;
}

export type SetNailSelectionInput = {
  nailSizeId?: number | null;
  nailShapeId?: number | null;
  nailArtApplicationId?: number | null;
  nailArtEffectId?: number | null;
};

/**
 * Snapshot the client's nail selection onto an appointment. Adjustments are
 * read from the service's own junction rows (not the vocab), so the price is
 * whatever the salon configured for THIS service. Recomputes the appointment
 * duration by the delta between the old and new selection.
 */
export async function setAppointmentNailSelection(appointmentId: number, input: SetNailSelectionInput) {
  const [appt] = await db
    .select({ id: appointments.id, storeId: appointments.storeId, serviceId: appointments.serviceId, duration: appointments.duration })
    .from(appointments)
    .where(eq(appointments.id, appointmentId));
  if (!appt || !appt.serviceId || !appt.storeId) return null;

  const [svc] = await db.select({ price: services.price, duration: services.duration }).from(services).where(eq(services.id, appt.serviceId));
  if (!svc) return null;

  const sizeRow = input.nailSizeId
    ? (await db.select().from(serviceNailSizes).where(and(eq(serviceNailSizes.serviceId, appt.serviceId), eq(serviceNailSizes.nailSizeId, input.nailSizeId))))[0]
    : undefined;
  const shapeRow = input.nailShapeId
    ? (await db.select().from(serviceNailShapes).where(and(eq(serviceNailShapes.serviceId, appt.serviceId), eq(serviceNailShapes.nailShapeId, input.nailShapeId))))[0]
    : undefined;
  const appRow = input.nailArtApplicationId
    ? (await db.select().from(serviceNailArtApplications).where(and(eq(serviceNailArtApplications.serviceId, appt.serviceId), eq(serviceNailArtApplications.nailArtApplicationId, input.nailArtApplicationId))))[0]
    : undefined;
  const effectRow = input.nailArtEffectId
    ? (await db.select().from(serviceNailArtEffects).where(and(eq(serviceNailArtEffects.serviceId, appt.serviceId), eq(serviceNailArtEffects.nailArtEffectId, input.nailArtEffectId))))[0]
    : undefined;

  const sizeName = input.nailSizeId ? (await db.select({ n: nailSizes.name }).from(nailSizes).where(eq(nailSizes.id, input.nailSizeId)))[0]?.n : null;
  const shapeName = input.nailShapeId ? (await db.select({ n: nailShapes.name }).from(nailShapes).where(eq(nailShapes.id, input.nailShapeId)))[0]?.n : null;
  const appMeta = input.nailArtApplicationId ? (await db.select({ n: nailArtApplications.name, q: nailArtApplications.isQuote }).from(nailArtApplications).where(eq(nailArtApplications.id, input.nailArtApplicationId)))[0] : undefined;
  const effectName = input.nailArtEffectId ? (await db.select({ n: nailArtEffects.name }).from(nailArtEffects).where(eq(nailArtEffects.id, input.nailArtEffectId)))[0]?.n : null;

  const num = (v: unknown) => (v == null ? 0 : Number(v));
  const isQuote = appMeta?.q ?? false;

  const lengthPrice = num(sizeRow?.priceAdjustment);
  const shapePrice = num(shapeRow?.priceAdjustment);
  const artPrice = isQuote ? 0 : num(appRow?.priceAdjustment) + num(effectRow?.priceAdjustment);
  const lengthDur = num(sizeRow?.durationAdjustment);
  const shapeDur = num(shapeRow?.durationAdjustment);
  const artDur = num(appRow?.durationAdjustment) + num(effectRow?.durationAdjustment);

  const base = num(svc.price);
  const total = base + lengthPrice + shapePrice + artPrice;
  const newNailDuration = lengthDur + shapeDur + artDur;

  const prev = await getAppointmentNailSelection(appointmentId);
  const prevNailDuration = prev ? num(prev.lengthDurationAdjSnapshot) + num(prev.shapeDurationAdjSnapshot) + num(prev.artDurationAdjSnapshot) : 0;

  const values = {
    appointmentId,
    storeId: appt.storeId,
    basePriceSnapshot: base.toFixed(2),
    nailSizeId: input.nailSizeId ?? null,
    lengthNameSnapshot: sizeName ?? null,
    lengthPriceAdjSnapshot: lengthPrice.toFixed(2),
    lengthDurationAdjSnapshot: lengthDur,
    nailShapeId: input.nailShapeId ?? null,
    shapeNameSnapshot: shapeName ?? null,
    shapePriceAdjSnapshot: shapePrice.toFixed(2),
    shapeDurationAdjSnapshot: shapeDur,
    nailArtApplicationId: input.nailArtApplicationId ?? null,
    nailArtEffectId: input.nailArtEffectId ?? null,
    artApplicationNameSnapshot: appMeta?.n ?? null,
    artEffectNameSnapshot: effectName ?? null,
    artPriceAdjSnapshot: artPrice.toFixed(2),
    artDurationAdjSnapshot: artDur,
    artIsCustomQuote: isQuote,
    totalPriceSnapshot: total.toFixed(2),
    updatedAt: new Date(),
  };

  await db.delete(appointmentNailSelection).where(eq(appointmentNailSelection.appointmentId, appointmentId));
  const [row] = await db.insert(appointmentNailSelection).values(values).returning();

  // Adjust appointment length by the change in nail-config duration.
  const durationDelta = newNailDuration - prevNailDuration;
  if (durationDelta !== 0) {
    await db
      .update(appointments)
      .set({ duration: Math.max(1, num(appt.duration) + durationDelta) })
      .where(eq(appointments.id, appointmentId));
  }

  return row;
}

export async function clearAppointmentNailSelection(appointmentId: number) {
  const prev = await getAppointmentNailSelection(appointmentId);
  await db.delete(appointmentNailSelection).where(eq(appointmentNailSelection.appointmentId, appointmentId));
  if (prev) {
    const num = (v: unknown) => (v == null ? 0 : Number(v));
    const prevDur = num(prev.lengthDurationAdjSnapshot) + num(prev.shapeDurationAdjSnapshot) + num(prev.artDurationAdjSnapshot);
    if (prevDur !== 0) {
      const [appt] = await db.select({ duration: appointments.duration }).from(appointments).where(eq(appointments.id, appointmentId));
      if (appt) {
        await db.update(appointments).set({ duration: Math.max(1, Number(appt.duration) - prevDur) }).where(eq(appointments.id, appointmentId));
      }
    }
  }
}
