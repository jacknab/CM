/**
 * Pure helpers for Terminal (M2 / Tap to Pay) payments. The checkout sheet sends
 * the ticket context when it creates the PaymentIntent; it is stored in the PI's
 * metadata so the server can record the whole ticket at capture time, not just
 * the card portion.
 */

const MAX_CENTS = 100_000_00; // $100,000

export interface TerminalContext {
  tipCents: number;
  discountCents: number;
  priorTenderedCents: number;
}

export type ParseResult =
  | { ok: true; ctx: TerminalContext }
  | { ok: false; error: string };

function cents(v: unknown, name: string): { ok: true; value: number } | { ok: false; error: string } {
  if (v === undefined || v === null || v === "") return { ok: true, value: 0 };
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > MAX_CENTS) {
    return { ok: false, error: `${name} must be a whole number of cents between 0 and ${MAX_CENTS}` };
  }
  return { ok: true, value: n };
}

export function parseTerminalContext(body: Record<string, unknown> | undefined | null): ParseResult {
  const tip = cents(body?.tipCents, "tipCents");
  if (!tip.ok) return tip;
  const discount = cents(body?.discountCents, "discountCents");
  if (!discount.ok) return discount;
  const prior = cents(body?.priorTenderedCents, "priorTenderedCents");
  if (!prior.ok) return prior;
  return { ok: true, ctx: { tipCents: tip.value, discountCents: discount.value, priorTenderedCents: prior.value } };
}

export function terminalContextMetadata(ctx: TerminalContext): Record<string, string> {
  const md: Record<string, string> = {};
  if (ctx.tipCents > 0) md.tip_cents = String(ctx.tipCents);
  if (ctx.discountCents > 0) md.discount_cents = String(ctx.discountCents);
  if (ctx.priorTenderedCents > 0) md.prior_tendered_cents = String(ctx.priorTenderedCents);
  return md;
}

function intMeta(md: Record<string, string> | null | undefined, key: string): number {
  const n = Number.parseInt(md?.[key] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export interface TerminalRecord {
  /** Whole ticket paid: this card charge plus anything tendered before it (cash etc.). Includes tip. */
  totalPaid: string;
  /** Undefined when the sheet sent no tip, so an existing value is never overwritten. */
  tipAmount?: string;
  discountAmount?: string;
}

export function computeTerminalRecord(
  amountCents: number,
  md: Record<string, string> | null | undefined,
): TerminalRecord {
  const prior = intMeta(md, "prior_tendered_cents");
  const tip = intMeta(md, "tip_cents");
  const discount = intMeta(md, "discount_cents");
  const paid = amountCents + prior;
  const fmt = (c: number) => (c / 100).toFixed(2);
  return {
    totalPaid: fmt(paid),
    ...(tip > 0 ? { tipAmount: fmt(Math.min(tip, paid)) } : {}),
    ...(discount > 0 ? { discountAmount: fmt(discount) } : {}),
  };
}
