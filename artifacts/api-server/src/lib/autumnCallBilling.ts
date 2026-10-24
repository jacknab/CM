/**
 * Autumn (AI receptionist) call pricing.
 *
 * Each plan includes a number of handled calls per calendar month. Every
 * handled call beyond that costs a flat fee, taken from the salon's platform
 * balance. A call of 30 seconds or less is not a handled call: it is free and
 * does not use up an included call.
 */

/** Flat fee, in dollars, for each handled call beyond the plan's allowance. */
export const AUTUMN_CALL_FEE_USD = 0.5;

/** A call must last longer than this to count as handled. */
export const AUTUMN_FREE_CALL_SECONDS = 30;

// Owner, 2026-10-24: Starter (code "professional") 20, Professional (code "elite") 50, Enterprise 100; Solo none.
// The admin Plans page shows the same numbers (plan_features.ai_receptionist limit_value).
const INCLUDED_CALLS_BY_PLAN: Record<string, number> = {
  professional: 20,
  elite: 50,
  enterprise: 100,
};

/** Handled calls included per calendar month for a plan code. */
export function includedCallsForPlan(planCode: string | null | undefined): number {
  return INCLUDED_CALLS_BY_PLAN[String(planCode ?? "").toLowerCase()] ?? 0;
}

export function isHandledCall(durationSeconds: number): boolean {
  return durationSeconds > AUTUMN_FREE_CALL_SECONDS;
}

/**
 * What a call costs.
 *
 * @param durationSeconds   length of this call
 * @param handledThisMonth  handled calls this calendar month, counting this one
 * @param included          handled calls the salon's plan includes per month
 */
export function autumnCallCharge(
  durationSeconds: number,
  handledThisMonth: number,
  included: number,
): { charge: number; reason: "short_call" | "included" | "per_call" } {
  if (!isHandledCall(durationSeconds)) return { charge: 0, reason: "short_call" };
  if (handledThisMonth <= included) return { charge: 0, reason: "included" };
  return { charge: AUTUMN_CALL_FEE_USD, reason: "per_call" };
}
