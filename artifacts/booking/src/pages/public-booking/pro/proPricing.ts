/** The price maths of the barbershop / hair salon booking page (ProBooking.tsx), kept apart so it can be tested. */
export interface StaffPrice { staffId: number; serviceId: number; price: number }

export const money = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, "")}`;
/** One price when everyone charges the same, else lowest–highest. */
export const priceRange = (min: number, max: number) => (Math.abs(max - min) < 0.005 ? money(min) : `${money(min)}–${money(max)}`);
export const priceOf = (prices: StaffPrice[], staffId: number, serviceId: number) =>
  prices.find((p) => p.staffId === staffId && p.serviceId === serviceId)?.price;
/** The professionals who do every chosen service (only they can be picked by name). */
export const prosForAll = <T extends { id: number }>(staff: T[], prices: StaffPrice[], serviceIds: number[]) =>
  staff.filter((p) => serviceIds.every((sid) => priceOf(prices, p.id, sid) != null));
/** A professional's price for the chosen services together. */
export const proTotal = (prices: StaffPrice[], staffId: number, serviceIds: number[]) =>
  Math.round(serviceIds.reduce((n, sid) => n + (priceOf(prices, staffId, sid) ?? 0), 0) * 100) / 100;
/** "Any available": the lowest-to-highest total over those who can do it all. */
export function anyRange(staffIds: number[], prices: StaffPrice[], serviceIds: number[]): { min: number; max: number } | null {
  const totals = staffIds.map((id) => proTotal(prices, id, serviceIds));
  return totals.length ? { min: Math.min(...totals), max: Math.max(...totals) } : null;
}
