/** The amount the customer's Android NFC reader collects, using the POS snapshot
 * of the unpaid balance before tip. Do not recompute this from later cart events:
 * they can arrive while the customer is confirming and already include the new tip. */
export function tipInclusiveChargeCents(baseCents: number, tipCents: number): number | null {
  if (!Number.isSafeInteger(baseCents) || !Number.isSafeInteger(tipCents) || baseCents < 0 || tipCents < 0) return null;
  const charge = baseCents + tipCents;
  return Number.isSafeInteger(charge) && charge >= 50 ? charge : null;
}
