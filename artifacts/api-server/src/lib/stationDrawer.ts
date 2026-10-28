import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { cashDrawers, registers, type CashDrawer } from "@shared/schema";

/**
 * The cash drawer of a POS station (owner, 2026-10-29): each drawer is assigned to one station, and a station without
 * a drawer can't take cash.
 *
 * `registerId` is the station the POS runs as. A salon with no station rows runs its one POS as station 0, and its
 * drawer is the `mainStation` one. A salon that has station rows: station 0 means the tablet hasn't got a station yet
 * — no drawer. The salon's default station also uses a `mainStation` drawer (set up before stations were added).
 */
export async function stationDrawer(storeId: number, registerId: number | null | undefined): Promise<CashDrawer | null> {
  const drawers = await db.select().from(cashDrawers).where(and(eq(cashDrawers.storeId, storeId), eq(cashDrawers.isActive, true)));
  const id = Number(registerId) || 0;
  if (id > 0) {
    const own = drawers.find((d) => d.registerId === id);
    if (own) return own;
    const [reg] = await db.select({ isDefault: registers.isDefault }).from(registers)
      .where(and(eq(registers.id, id), eq(registers.storeId, storeId))).limit(1);
    return reg?.isDefault ? drawers.find((d) => d.mainStation) ?? null : null;
  }
  const stationRows = await db.select({ id: registers.id }).from(registers)
    .where(and(eq(registers.storeId, storeId), eq(registers.isActive, true))).limit(1);
  return stationRows.length ? null : drawers.find((d) => d.mainStation) ?? null;
}

export const NO_CASH_DRAWER_MESSAGE = "This POS station has no cash drawer, so it can't take cash. Set one up in Settings › Cash Drawers.";
