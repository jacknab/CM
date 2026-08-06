import type { Request } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { locations } from "@shared/schema";
import { staff as staffTable } from "@shared/schema";

interface ResolveTenantOptions {
  allowQueryStoreId?: boolean;
  allowBodyStoreId?: boolean;
  allowParamStoreId?: boolean;
  allowHeaderStoreId?: boolean;
  queryKey?: string | string[];
  bodyKey?: string | string[];
  paramKey?: string | string[];
  headerKeys?: string[];
}

function toPositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function firstPositiveIntFromRecord(
  record: Record<string, unknown> | undefined,
  keys: string | string[] | undefined,
): number | null {
  if (!record || !keys) return null;
  const keyList = Array.isArray(keys) ? keys : [keys];
  for (const key of keyList) {
    const value = record[key];
    const normalized = Array.isArray(value) ? value[0] : value;
    const parsed = toPositiveInt(normalized);
    if (parsed) return parsed;
  }
  return null;
}

async function verifyOwnership(userId: string, storeId: number): Promise<number | null> {
  const [ownedStore] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.id, storeId), eq(locations.userId, userId)))
    .limit(1);
  return ownedStore?.id ?? null;
}

/**
 * Resolves a reliable tenant/store id for authenticated owner requests.
 *
 * Resolution order:
 *  1) session.storeId (validated against ownership)
 *  2) optional query/body storeId (validated against ownership)
 *  3) first owned store from locations
 *  4) optional stripe_customers.storeNumber fallback (validated against ownership)
 *
 * On successful resolution, writes the value back to session.storeId when possible.
 */
export async function resolveTenantIdForRequest(
  req: Request,
  options: ResolveTenantOptions = {},
): Promise<number | null> {
  const {
    allowQueryStoreId = true,
    allowBodyStoreId = true,
    allowParamStoreId = true,
    allowHeaderStoreId = true,
    queryKey = ["storeId", "salonId", "tenantId"],
    bodyKey = ["storeId", "salonId", "tenantId"],
    paramKey = ["storeId", "salonId", "tenantId"],
    headerKeys = ["x-store-id", "x-salon-id", "x-tenant-id"],
  } = options;

  const session = (req.session ?? {}) as any;
  const userId = (session.userId as string | undefined) ?? ((req as any).user?.id as string | undefined);

  if (!userId) {
    const staffId = toPositiveInt(session.staffId);
    if (!staffId) return null;

    const [staffRow] = await db
      .select({ storeId: staffTable.storeId })
      .from(staffTable)
      .where(eq(staffTable.id, staffId))
      .limit(1);

    const staffStoreId = toPositiveInt(staffRow?.storeId);
    if (!staffStoreId) return null;

    session.storeId = staffStoreId;
    return staffStoreId;
  }

  const sessionStoreId = toPositiveInt(session.storeId);
  if (sessionStoreId) {
    const owned = await verifyOwnership(userId, sessionStoreId);
    if (owned) return owned;
  }

  if (allowParamStoreId) {
    const paramStoreId = firstPositiveIntFromRecord((req.params as Record<string, unknown>) ?? undefined, paramKey);
    if (paramStoreId) {
      const owned = await verifyOwnership(userId, paramStoreId);
      if (owned) {
        session.storeId = owned;
        return owned;
      }
    }
  }

  if (allowQueryStoreId) {
    const queryStoreId = firstPositiveIntFromRecord((req.query as Record<string, unknown>) ?? undefined, queryKey);
    if (queryStoreId) {
      const owned = await verifyOwnership(userId, queryStoreId);
      if (owned) {
        session.storeId = owned;
        return owned;
      }
    }
  }

  if (allowBodyStoreId) {
    const bodyStoreId = firstPositiveIntFromRecord((req.body as Record<string, unknown> | undefined) ?? undefined, bodyKey);
    if (bodyStoreId) {
      const owned = await verifyOwnership(userId, bodyStoreId);
      if (owned) {
        session.storeId = owned;
        return owned;
      }
    }
  }

  if (allowHeaderStoreId) {
    const headerStoreId = firstPositiveIntFromRecord((req.headers as Record<string, unknown>) ?? undefined, headerKeys);
    if (headerStoreId) {
      const owned = await verifyOwnership(userId, headerStoreId);
      if (owned) {
        session.storeId = owned;
        return owned;
      }
    }
  }

  const [ownedStore] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.userId, userId))
    .limit(1);

  if (ownedStore?.id) {
    session.storeId = ownedStore.id;
    return ownedStore.id;
  }

  return null;
}
