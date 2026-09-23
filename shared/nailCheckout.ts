/**
 * The maths of paying a Nail POS ticket — the same rules the calendar's checkout sheet uses, in one pure place:
 *   subtotal = the ticket (+ anything added at checkout) (+ any tickets paid together)
 *   discount = a % or $ off, plus any redeemed loyalty reward, never more than the subtotal
 *   total    = subtotal − discount + tip            (nail salons charge no sales tax)
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
export interface Tender { id: number; method: "cash" | "card" | "m2" | "tap" | "gift"; amount: number; code?: string }
export type DiscountInput = { type: "percent" | "dollar"; value: number } | null;

export interface CheckoutInput {
  /** The ticket itself: service + add-ons + nail options + custom-amount lines (already priced). */
  ticketTotal: number;
  /** Lines added at checkout (retail, removal, quick ticket, custom charge). */
  extras: Extra[];
  /** Other tickets being paid at the same time (group pay). */
  linkedSubtotal: number;
  discount: DiscountInput;
  /** Dollar value of a redeemed loyalty reward. */
  rewardDollar: number;
  tip: number;
  tenders: Tender[];
}

export interface CheckoutTotals {
  subtotal: number;
  discount: number;
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
  const total = r2(Math.max(0, subtotal - discount) + tip);
  const tendered = r2(a.tenders.reduce((s, t) => s + t.amount, 0));
  const balance = r2(total - tendered);
  const productRevenue = r2(a.extras.filter((e) => e.kind === "retail").reduce((s, e) => s + e.price, 0));
  return {
    subtotal, discount, tip, total, tendered,
    balanceDue: Math.max(0, balance),
    changeDue: balance < 0 ? r2(-balance) : 0,
    totalPaid: Math.min(tendered, total),
    serviceRevenue: r2(ownSubtotal - productRevenue),
    productRevenue,
    settled: balance <= 0 && (tendered > 0 || total === 0),
  };
}

export interface GroupMember { appointmentId: number; base: number; serviceRevenue: number; productRevenue: number }
export interface GroupShare { appointmentId: number; tip: number; discount: number; totalPaid: number; paymentMethod: string; serviceRevenue: number; productRevenue: number }

/** Split tip, discount and payment across every ticket paid together, in proportion to each ticket's value (last one takes the rounding). */
export function splitGroup(members: GroupMember[], totals: { tip: number; discount: number; totalPaid: number }, paymentMethod: string): GroupShare[] {
  const totalBase = members.reduce((s, m) => s + m.base, 0) || 1;
  let tipLeft = r2(totals.tip), discLeft = r2(totals.discount), paidLeft = r2(totals.totalPaid);
  return members.map((m, i) => {
    const last = i === members.length - 1;
    const share = m.base / totalBase;
    const tip = last ? tipLeft : r2(totals.tip * share);
    const discount = last ? discLeft : r2(totals.discount * share);
    const totalPaid = last ? paidLeft : r2(totals.totalPaid * share);
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
  return next.length > 8 ? cents : next;
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
