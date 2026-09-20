import type { Deal } from "@shared/schema";

/**
 * "Sold out" / "expired" / "scheduled" are computed from capacity/dates at
 * read time rather than stored, so a purchase or the clock ticking forward
 * is reflected immediately without a background job keeping a status column
 * in sync. `status` on the row itself only ever holds the owner's own intent
 * (active/paused/archived).
 */
export type DealAvailability = "scheduled" | "active" | "sold-out" | "expired" | "paused" | "archived";

export function getDealAvailability(deal: Pick<Deal, "status" | "startsAt" | "endsAt" | "purchasedCount" | "capacity">, now = new Date()): DealAvailability {
  if (deal.status === "archived") return "archived";
  if (deal.status === "paused") return "paused";
  if (now < new Date(deal.startsAt)) return "scheduled";
  if (now > new Date(deal.endsAt)) return "expired";
  if (deal.purchasedCount >= deal.capacity) return "sold-out";
  return "active";
}

export function dealDiscountPercent(dealPrice: string | number, listPrice: string | number): number {
  const deal = Number(dealPrice) || 0;
  const list = Number(listPrice) || 0;
  if (list <= 0 || deal >= list) return 0;
  return Math.round((1 - deal / list) * 100);
}
