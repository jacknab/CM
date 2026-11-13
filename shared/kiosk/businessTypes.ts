/**
 * Business types, for the check-in kiosk (plans/kiosk-builder.md).
 *
 * A business's type is the free text in locations.category ("Nail Salon", "Barbershop", …, the sign-up list
 * in onboarding-script.ts). This turns it into one key the kiosk can rely on. Anything unknown is "other",
 * which gets the plain, neutral kiosk.
 */

export type BusinessTypeKey = "nail" | "hair" | "barber" | "spa" | "esthetics" | "pet" | "tattoo" | "other";

export interface BusinessType {
  key: BusinessTypeKey;
  /** As the sign-up list writes it. */
  label: string;
}

/** Most specific first: "Hair & Nail Salon" counts as a nail salon, like isNailSalonCategory() does. */
const MATCHERS: Array<{ match: RegExp; type: BusinessType }> = [
  { match: /nail/i, type: { key: "nail", label: "Nail Salon" } },
  { match: /barber/i, type: { key: "barber", label: "Barbershop" } },
  { match: /pet|groom|dog|cat\b/i, type: { key: "pet", label: "Pet Groomer" } },
  { match: /tattoo|pierc/i, type: { key: "tattoo", label: "Tattoo Studio" } },
  { match: /esthetic|aesthetic|skin|facial|lash|brow|wax/i, type: { key: "esthetics", label: "Esthetician" } },
  { match: /spa|massage/i, type: { key: "spa", label: "Spa" } },
  { match: /hair|salon|stylist/i, type: { key: "hair", label: "Hair Salon" } },
];

const OTHER: BusinessType = { key: "other", label: "Other" };

export const BUSINESS_TYPES: BusinessType[] = [...MATCHERS.map((m) => m.type), OTHER];

/** locations.category → business type. */
export function businessTypeOf(category: string | null | undefined): BusinessType {
  const c = (category ?? "").trim();
  if (!c) return OTHER;
  return MATCHERS.find((m) => m.match.test(c))?.type ?? OTHER;
}

export function isBusinessTypeKey(v: unknown): v is BusinessTypeKey {
  return typeof v === "string" && BUSINESS_TYPES.some((t) => t.key === v);
}
