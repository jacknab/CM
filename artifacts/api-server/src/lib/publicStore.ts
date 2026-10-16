/**
 * What anyone on the internet may see of a business (booking pages, the business's website, deals, Autumn,
 * the directory). Two rules, kept here so every public endpoint applies the same ones:
 *
 *  1. Internal fields never leave the server: tax ID, legal entity, Stripe customer, activation code,
 *     credit balances and counters, suspension details, kiosk and register internals.
 *  2. A business that keeps its address private (Solo plan, plans/solo-work-places-and-approval.md) shows
 *     its city and state only. Its street address, ZIP code and map position are left out. A client who
 *     has booked gets the full address from their booking's confirmation and reminders, not from here.
 */

/** Never public, whatever the business's settings. */
const INTERNAL_FIELDS = [
  "userId", "ein", "legalEntityType", "activationCode", "stripeCustomerId",
  "platformCredits", "smsAllowance", "smsCredits", "smsCreditsTotalPurchased", "smsTokens",
  "autoRefillAmount", "autoRefillEnabled", "autoRefillThreshold",
  "registerTargetFloat", "nextTicketNumber", "quickAreaCodes", "restrictKioskNetwork", "kioskPermitted",
  "suspendedAt", "suspendedReason", "lockedAt", "commissionPayoutFrequency", "weeklyDigestOptOut",
  "facebookPageId", "setupComplete", "giftCardStoreCode",
] as const;

/** Shown only when the address is public. */
const ADDRESS_DETAIL_FIELDS = ["address", "postcode", "storeLatitude", "storeLongitude"] as const;

type StoreLike = { ownPlace?: string | null; addressPrivate?: boolean | null };

/** True when clients may not see the street address: the owner chose private, or there's no place to visit. */
export function addressIsPrivate(store: StoreLike | null | undefined): boolean {
  return !!store && (store.ownPlace === "none" || store.addressPrivate === true);
}

/** The business as the public may see it. `addressHidden` tells the page to say "address given after booking". */
export function publicStoreView<T extends Record<string, any>>(store: T): Omit<T, (typeof INTERNAL_FIELDS)[number]> & { addressHidden: boolean } {
  const out: Record<string, any> = { ...store };
  for (const key of INTERNAL_FIELDS) delete out[key];
  const hidden = addressIsPrivate(store);
  if (hidden) for (const key of ADDRESS_DETAIL_FIELDS) out[key] = null;
  out.addressHidden = hidden;
  return out as any;
}

/** One line for a person to read: the full address, or the city and state when it's private. */
export function publicAddressLine(store: StoreLike & { address?: string | null; city?: string | null; state?: string | null; postcode?: string | null }): string {
  const cityState = [store.city, store.state].filter(Boolean).join(", ");
  if (addressIsPrivate(store)) return cityState;
  return [store.address, cityState, store.postcode].filter(Boolean).join(", ").replace(/, (\d{5})$/, " $1");
}

/** The business as a client with a booking sees it: no internal fields, but the full address, even a private one. */
export function bookedClientStoreView<T extends Record<string, any>>(store: T): Omit<T, (typeof INTERNAL_FIELDS)[number]> {
  const out: Record<string, any> = { ...store };
  for (const key of INTERNAL_FIELDS) delete out[key];
  return out as any;
}
