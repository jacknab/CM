/**
 * The one commission rule (used by the accrual ledger, payroll runs, contractor payout runs and the
 * commission / earnings reports):
 *
 *   • Services AND add-ons (and extras such as nail length/shape upcharges) are paid at the staff
 *     member's SERVICE rate.
 *   • Retail products are paid at the PRODUCT rate — and only retail products.
 *   • The basis is BEFORE discount, tax and tip: a discount is a cost the business absorbs and
 *     never reduces what staff earn; tips pass straight through.
 *
 * New tickets carry the split frozen at checkout (`serviceRevenue` / `productRevenue`). Tickets
 * completed before that existed (or by a path that doesn't know the split) fall back to the legacy
 * amount — everything paid before discount minus the tip, all at the service rate.
 */

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export interface CommissionSource {
  totalPaid?: unknown;
  tipAmount?: unknown;
  discountAmount?: unknown;
  servicePrice?: unknown;
  serviceRevenue?: unknown;
  productRevenue?: unknown;
}

export interface CommissionBasis {
  /** Service + add-on money — paid at the service rate. */
  service: number;
  /** Retail product money — paid at the product rate. */
  product: number;
}

export function commissionBasis(
  a: CommissionSource,
  fallback: { catalogPrice?: number; addonTotal?: number } = {},
): CommissionBasis {
  const hasSplit = a.serviceRevenue != null || a.productRevenue != null;
  if (hasSplit) {
    return { service: Math.max(0, num(a.serviceRevenue)), product: Math.max(0, num(a.productRevenue)) };
  }
  const paid = num(a.totalPaid);
  if (paid > 0) {
    return { service: Math.max(0, paid + num(a.discountAmount) - num(a.tipAmount)), product: 0 };
  }
  // Nothing collected (comped / auto-completed): the service's frozen price, else the catalogue price, plus add-ons.
  const price = a.servicePrice != null ? num(a.servicePrice) : num(fallback.catalogPrice);
  return { service: Math.max(0, price + num(fallback.addonTotal)), product: 0 };
}

export interface CommissionAmount {
  service: number;
  product: number;
  total: number;
}

/** Commission earned on a basis, given the staff member's service and product rates (in percent). */
export function commissionAmount(basis: CommissionBasis, serviceRatePct: unknown, productRatePct: unknown): CommissionAmount {
  const service = basis.service * (num(serviceRatePct) / 100);
  const product = basis.product * (num(productRatePct) / 100);
  return { service, product, total: service + product };
}
