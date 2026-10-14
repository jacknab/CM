/**
 * Recurring payroll deductions — the rules a salon sets once (a supply fee, a card processing fee…)
 * that come off every pay period.
 *
 *   • "percentage" — a percentage of the person's COMMISSION for the period.
 *   • "fixed" — a flat dollar amount per pay period.
 *     Neither of these charges anyone for a period they earned no commission in, and neither touches tips.
 *   • "card_tips" — the card processing cost of paying out tips: for each of the person's tickets that
 *     was paid by card and carried a tip, a percentage of that tip plus a flat fee per transaction.
 *     Cash tips cost nothing. The fee on a ticket is never more than its tip.
 *   • "per_ticket" — a flat amount for each ticket the person closed in the period (a supply fee per service).
 *   • A rule is for everyone, or for one staff member.
 */

export interface DeductionRule {
  id: number;
  name: string;
  /** "fixed" | "percentage" | "card_tips" | "per_ticket" */
  type: string | null;
  amount: string | number | null;
  /** card_tips only: flat fee per tipped card transaction. */
  perTransaction?: string | number | null;
  /** "all" | "specific" */
  appliesTo: string | null;
  staffId: number | null;
}

export interface AppliedDeduction { ruleId: number; name: string; amount: number }

const cents = (n: number) => Math.round(n * 100) / 100;
/** `percent` of `dollars`, worked in whole cents so 1.45% of $270.00 is $3.92 on every machine. */
const percentOf = (dollars: number, percent: number) => Math.round(Math.round(dollars * 100) * percent / 100 + 1e-7) / 100;

/**
 * Was any part of this ticket paid by card? `paymentMethod` is what checkout recorded: one word
 * ("card", "tap_to_pay") or tenders such as "m2:45.00,cash:10.00". A ticket paid partly by card
 * counts — which tender carried the tip is not recorded.
 */
export function paidByCard(paymentMethod: string | null | undefined): boolean {
  return String(paymentMethod ?? "").toLowerCase().split(",")
    .some((tender) => /^(card|m2|tap|tap_to_pay|stripe|terminal|credit|debit|credit_card|debit_card)$/.test(tender.split(":")[0].trim()));
}

export function ruleDeductionsFor(
  rules: readonly DeductionRule[],
  line: { staffId: number; commission: number; /** The tip on each of their card-paid tickets. */ cardTips?: readonly number[]; /** Tickets they closed in the period. */ tickets?: number },
): { total: number; detail: AppliedDeduction[] } {
  const detail: AppliedDeduction[] = [];
  for (const rule of rules) {
    if (rule.appliesTo === "specific" && rule.staffId !== line.staffId) continue;
    const value = Number(rule.amount);
    let amount = 0;
    if (rule.type === "card_tips") {
      const percent = Number.isFinite(value) && value > 0 ? value : 0;
      const flat = Math.max(0, Number(rule.perTransaction) || 0);
      for (const tip of line.cardTips ?? []) {
        if (tip > 0) amount += Math.min(tip, percentOf(tip, percent) + flat);
      }
      amount = cents(amount);
    } else if (rule.type === "per_ticket") {
      // Never more than they earned in commission: a slow period does not leave them owing.
      if (Number.isFinite(value) && value > 0 && (line.tickets ?? 0) > 0) amount = Math.min(cents(value * (line.tickets ?? 0)), Math.max(0, cents(line.commission)));
    } else if (line.commission > 0 && Number.isFinite(value) && value > 0) {
      amount = rule.type === "percentage" ? percentOf(line.commission, value) : cents(value);
    }
    if (amount > 0) detail.push({ ruleId: rule.id, name: rule.name, amount });
  }
  return { total: cents(detail.reduce((sum, d) => sum + d.amount, 0)), detail };
}

/**
 * The part of a paycheck paid in cash: what is not paid by check, in whole dollars so the cash part needs
 * no coins (the cents stay on the check). All of it when nothing is paid by check.
 */
export function cashPortionOf(netPay: number, checkPercent: number): number {
  const net = Math.max(0, Math.round(netPay * 100) / 100);
  if (checkPercent >= 100) return 0;
  if (checkPercent <= 0) return net;
  return Math.min(net, Math.floor(net * (100 - checkPercent) / 100));
}
