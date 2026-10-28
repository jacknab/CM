/**
 * One rule for a client's status, used everywhere (owner, 2026-10-29: "at risk" had three meanings):
 * the Clients tabs and badges, the At-Risk page and Reports › Lapsed clients.
 *
 *   VIP       — set by hand on the client; always wins
 *   Inactive  — never visited, or not back for INACTIVE_DAYS or more
 *   At risk   — has visited, not back for AT_RISK_DAYS or more (and less than INACTIVE_DAYS)
 *   New       — visited recently, fewer than REGULAR_VISITS visits
 *   Regular   — visited recently, REGULAR_VISITS or more visits
 *
 * A visit counts once however many services it had; "visited" means a paid (completed) visit.
 */
export const AT_RISK_DAYS = 60;
export const INACTIVE_DAYS = 120;
export const REGULAR_VISITS = 3;

export type ClientStatus = "new" | "regular" | "vip" | "at_risk" | "inactive";

export function clientStatusOf(c: { isVip: boolean; visits: number; daysSinceLastVisit: number | null }): ClientStatus {
  if (c.isVip) return "vip";
  if (c.daysSinceLastVisit == null || c.visits === 0 || c.daysSinceLastVisit >= INACTIVE_DAYS) return "inactive";
  if (c.daysSinceLastVisit >= AT_RISK_DAYS) return "at_risk";
  return c.visits < REGULAR_VISITS ? "new" : "regular";
}
