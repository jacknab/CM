/**
 * The maths of paying a Nail POS ticket — the same rules the calendar's checkout sheet uses, in one pure place:
 *   subtotal = the ticket (+ anything added at checkout) (+ any tickets paid together)
 *   discount = a % or $ off, plus any redeemed loyalty reward, never more than the subtotal
 *   tax      = the store's sales-tax rate on its taxable lines (POS settings: services and/or products taxable),
 *              after the discount is spread across all lines in proportion — 0 when no rate is set
 *   total    = subtotal − discount + tax + tip
 *   paid     = what was handed over; change is what's given back on cash over-payment
 * Commission basis: retail products vs everything else (services, add-ons, upcharges, custom charges).
 */

export const r2 = (n: number) => Math.round(n * 100) / 100;

export type ExtraKind = "retail" | "custom" | "addon" | "guided";
export interface Extra { id: number; label: string; price: number; kind: ExtraKind }
/**
 * cash · m2 (Stripe M2 reader) · tap (Tap to Pay) — the calendar's own tender names — · gift (a gift card, `code` says which;
 * it is only charged when the sale closes) · card (recorded by hand for a payment taken elsewhere; the Nail POS no longer offers it).
 */
export interface Tender { id: number; method: "cash" | "card" | "m2" | "tap" | "gift"; amount: number; code?: string; paymentIntentId?: string }
export type DiscountInput = { type: "percent" | "dollar"; value: number } | null;

/** The store's POS tax settings (locations.sales_tax_rate / tax_services_taxable / tax_products_taxable). */
export interface SalesTaxSettings { rate: number; services: boolean; products: boolean }
export const NO_SALES_TAX: SalesTaxSettings = { rate: 0, services: false, products: false };

/**
 * Sales tax in cents, worked out in whole cents so the register and the server always agree on
 * the same number. Service revenue covers services, add-ons, nail upcharges and custom charges;
 * product revenue is retail. The discount comes off every line in proportion before tax.
 */
export function salesTaxCents(serviceRevenue: number, productRevenue: number, discount: number, tax: SalesTaxSettings): number {
  const rate = Number(tax.rate);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  const svc = Math.max(0, Math.round(serviceRevenue * 100));
  const prod = Math.max(0, Math.round(productRevenue * 100));
  const subtotal = svc + prod;
  if (subtotal <= 0) return 0;
  const taxable = (tax.services ? svc : 0) + (tax.products ? prod : 0);
  const afterDiscount = taxable * Math.max(0, subtotal - Math.round(discount * 100)) / subtotal;
  return Math.round(afterDiscount * rate);
}

export interface CheckoutInput {
  /** The ticket itself: service + add-ons + nail options + custom-amount lines (already priced). */
  ticketTotal: number;
  /** How much of `ticketTotal` came from a custom-amount line the front desk marked Retail while
   *  building the ticket (commissioned at the product rate) — the rest of `ticketTotal` is service. */
  ticketRetailTotal?: number;
  /** Lines added at checkout (retail, removal, quick ticket, custom charge). */
  extras: Extra[];
  /** Other tickets being paid at the same time (group pay). */
  linkedSubtotal: number;
  /** How much of `linkedSubtotal` is retail (their own Retail-marked custom lines). */
  linkedRetailTotal?: number;
  /** The store's sales-tax settings; omitted = no tax. */
  salesTax?: SalesTaxSettings;
  discount: DiscountInput;
  /** Dollar value of a redeemed loyalty reward. */
  rewardDollar: number;
  tip: number;
  tenders: Tender[];
}

export interface CheckoutTotals {
  subtotal: number;
  discount: number;
  /** Sales tax on the whole sale (this ticket + any paid together). */
  tax: number;
  tip: number;
  total: number;
  tendered: number;
  /** What still has to be paid (0 when settled). */
  balanceDue: number;
  /** Cash to hand back. */
  changeDue: number;
  /** Money that actually settled the sale (tendered, less change). */
  totalPaid: number;
  serviceRevenue: number;
  productRevenue: number;
  /** Ready to close: something was paid (or the total is 0) and nothing is owed. */
  settled: boolean;
}

export function computeCheckout(a: CheckoutInput): CheckoutTotals {
  const extrasTotal = a.extras.reduce((s, e) => s + e.price, 0);
  const ownSubtotal = a.ticketTotal + extrasTotal;
  const subtotal = r2(ownSubtotal + a.linkedSubtotal);
  const manual = !a.discount ? 0
    : a.discount.type === "percent" ? subtotal * (Math.min(100, Math.max(0, a.discount.value)) / 100)
    : Math.max(0, a.discount.value);
  const discount = r2(Math.min(subtotal, manual + Math.max(0, a.rewardDollar)));
  const tip = r2(Math.max(0, a.tip));
  const productRevenue = r2(
    a.extras.filter((e) => e.kind === "retail").reduce((s, e) => s + e.price, 0) + Math.max(0, a.ticketRetailTotal ?? 0),
  );
  // Tax covers the whole sale, so it uses the group-wide split of service vs retail.
  const allProduct = r2(productRevenue + Math.max(0, a.linkedRetailTotal ?? 0));
  const tax = salesTaxCents(r2(subtotal - allProduct), allProduct, discount, a.salesTax ?? NO_SALES_TAX) / 100;
  const total = r2(Math.max(0, subtotal - discount) + tax + tip);
  const tendered = r2(a.tenders.reduce((s, t) => s + t.amount, 0));
  const balance = r2(total - tendered);
  return {
    subtotal, discount, tax, tip, total, tendered,
    balanceDue: Math.max(0, balance),
    changeDue: balance < 0 ? r2(-balance) : 0,
    totalPaid: Math.min(tendered, total),
    serviceRevenue: r2(ownSubtotal - productRevenue),
    productRevenue,
    settled: balance <= 0 && (tendered > 0 || total === 0),
  };
}

export interface GroupMember { appointmentId: number; base: number; duration: number; serviceRevenue: number; productRevenue: number }
export interface GroupShare { appointmentId: number; tip: number; discount: number; totalPaid: number; paymentMethod: string; serviceRevenue: number; productRevenue: number }

/**
 * Split discount and payment across every ticket paid together in proportion to each ticket's
 * dollar value (last one takes the rounding) — the tech stays assigned to their own ticket and
 * gets their own commission either way; Group Pay only merges the PAYMENT into one transaction.
 *
 * The tip splits differently: by each ticket's SERVICE DURATION, not its price. A client paying
 * for the whole group's tip isn't necessarily tipping in proportion to what each ticket cost —
 * splitting by price would hand a bigger tip share to whichever tech's ticket happened to include
 * a big-ticket retail item or a pricier service, even if another tech's longer, more involved
 * service is what actually did more of the work.
 */
export function splitGroup(
  members: GroupMember[], totals: { tip: number; discount: number; totalPaid: number }, paymentMethod: string,
  /** The tip of each ticket as staff entered it (the client said who gets what). Used when it adds up to the whole tip. */
  tipByTicket?: Readonly<Record<number, number>>,
): GroupShare[] {
  const explicit = tipByTicket && members.every((m) => Number.isFinite(tipByTicket[m.appointmentId]) && tipByTicket[m.appointmentId] >= 0)
    && Math.round(members.reduce((s, m) => s + tipByTicket[m.appointmentId], 0) * 100) === Math.round(totals.tip * 100)
    ? tipByTicket : null;
  const totalBase = members.reduce((s, m) => s + m.base, 0);
  const totalDuration = members.reduce((s, m) => s + Math.max(0, m.duration), 0);
  // Every member is $0 (e.g. an all-comped group), or nobody has a known duration (e.g. all
  // custom-priced tickets with no timed service) — split evenly rather than divide by zero or
  // dump everything on whichever ticket happens to be last in the array.
  const evenShare = 1 / members.length;
  let tipLeft = r2(totals.tip), discLeft = r2(totals.discount), paidLeft = r2(totals.totalPaid);
  return members.map((m, i) => {
    const last = i === members.length - 1;
    const share = totalBase === 0 ? evenShare : m.base / totalBase;
    const tipShare = totalDuration === 0 ? evenShare : Math.max(0, m.duration) / totalDuration;
    // Never take more than what's actually left in the pool. Several non-last members' rounded
    // (half-up) proportional shares can otherwise sum to more than the pool itself, forcing the
    // last member — who simply gets whatever remains — into a negative tip/discount/totalPaid.
    const tip = explicit ? r2(explicit[m.appointmentId]) : last ? tipLeft : Math.max(0, Math.min(tipLeft, r2(totals.tip * tipShare)));
    const discount = last ? discLeft : Math.max(0, Math.min(discLeft, r2(totals.discount * share)));
    const totalPaid = last ? paidLeft : Math.max(0, Math.min(paidLeft, r2(totals.totalPaid * share)));
    tipLeft = r2(tipLeft - tip); discLeft = r2(discLeft - discount); paidLeft = r2(paidLeft - totalPaid);
    return { appointmentId: m.appointmentId, tip, discount, totalPaid, paymentMethod, serviceRevenue: m.serviceRevenue, productRevenue: m.productRevenue };
  });
}

/** "cash:20.00,card:15.50" — how the calendar's checkout records a split payment. */
export const paymentMethodSummary = (tenders: Tender[]) => tenders.map((t) => `${t.method}:${t.amount.toFixed(2)}`).join(",");

/** The keypad works in cents: typing 1 2 5 0 shows $12.50. */
export const centsToDollars = (cents: string): number => (Number(cents) || 0) / 100;
export function pushKeypadDigits(cents: string, digits: string): string {
  const next = (cents + digits).replace(/^0+/, "");
  // $9999.99 ceiling, matching the cap CatalogPanel's own Keypad enforces (parseKeypadAmount) —
  // this checkout keypad previously only capped at 8 digits (~$999,999.99), letting a mistaken tap
  // add a custom "Extra" line for up to six figures with no confirmation.
  if (next.length > 8 || Number(next) > 999999) return cents;
  return next;
}

export const REMOVAL_TYPES = [
  "Polish Removal", "Gel Polish Removal", "Acrylic Removal", "Dip Powder Removal", "Gel-X Removal", "Builder Gel Removal",
  "Hard Gel Removal", "Soft Gel Removal", "Polygel Removal", "Other Gel Enhancement Removal", "Nail Extension Removal", "Artificial Nail Removal",
] as const;

export const QUICK_TICKET_STEPS = [
  { prompt: "Removal Amount", label: "Removal" }, { prompt: "Nail Length Amount", label: "Nail Length" },
  { prompt: "Nail Shape Amount", label: "Nail Shape" }, { prompt: "Nail Art Amount", label: "Nail Art" },
  { prompt: "Design Amount", label: "Design" }, { prompt: "Extra Amount", label: "Extra" },
] as const;
