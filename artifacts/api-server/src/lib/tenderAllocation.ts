/**
 * How much of each completed ticket's `totalPaid` was taken by each tender method — the numbers
 * the Z Report's payment breakdown and the Day Close's expected cash are built from.
 *
 * A ticket's `paymentMethod` records what was TENDERED ("cash:50.00,card:20.00"), which is not
 * what the ticket kept:
 *   - Change: tendered can exceed the sale; the difference was handed back, and change only ever
 *     comes out of cash (nailCheckoutSettlement enforces tendered − paid ≤ cash).
 *   - Group pay: every ticket paid together stores the WHOLE group's tender string, while its
 *     `totalPaid` is only its own share.
 * Reading the string at face value counted change and other tickets' money as drawer cash.
 *
 * Tickets sharing one tender string that were completed within a few minutes of each other and
 * together don't exceed it are treated as one payment. Their combined paid amount is split into
 * card-style tenders at face value plus cash net of change, then shared out by each ticket's
 * `totalPaid`. A lone ticket is just a group of one.
 */

export interface TenderRow {
  id: number;
  totalPaid: string | number | null;
  paymentMethod: string | null;
  /** When the ticket was checked out (completedAt, else its scheduled date). */
  date: Date;
}

const GROUP_WINDOW_MS = 5 * 60 * 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

interface Tender { method: string; amount: number | null }

function parseTenders(paymentMethod: string): Tender[] {
  return paymentMethod.split(",")
    .map((part) => {
      const [method, amt] = part.split(":");
      return { method: method.trim().toLowerCase(), amount: amt === undefined ? null : num(amt) };
    })
    .filter((t) => t.method !== "");
}

/** Split a payment's combined paid amount across its tenders: non-cash at face value, cash net of change. */
function netTenders(tenders: Tender[], paid: number): Map<string, number> {
  const out = new Map<string, number>();
  const tendered = tenders.reduce((s, t) => s + (t.amount ?? 0), 0);
  const cashTendered = tenders.filter((t) => t.method === "cash").reduce((s, t) => s + (t.amount ?? 0), 0);
  const change = Math.max(0, tendered - paid);
  // Change larger than the cash handed over can't happen through the POS — fall back to scaling
  // every tender down proportionally rather than inventing a negative cash amount.
  const scale = change > cashTendered + 0.005 && tendered > 0 ? paid / tendered : 1;
  for (const t of tenders) {
    const face = (t.amount ?? 0) * scale;
    out.set(t.method, (out.get(t.method) ?? 0) + face);
  }
  if (scale === 1 && change > 0) out.set("cash", Math.max(0, (out.get("cash") ?? 0) - change));
  return out;
}

/** Per-ticket amount taken by each tender method (keys are lower-cased methods, e.g. "cash", "card", "gift"). */
export function allocateTenders(rows: TenderRow[]): Map<number, Record<string, number>> {
  const result = new Map<number, Record<string, number>>();
  const itemized: { row: TenderRow; paid: number; tenders: Tender[]; tendered: number }[] = [];

  for (const row of rows) {
    const paid = num(row.totalPaid);
    if (!row.paymentMethod) { result.set(row.id, { card: paid }); continue; }
    const tenders = parseTenders(row.paymentMethod);
    if (tenders.length === 0) { result.set(row.id, { card: paid }); continue; }
    // Legacy strings with no amounts ("cash", "card"): a single method takes the whole ticket.
    if (tenders.some((t) => t.amount === null)) {
      if (tenders.length === 1) result.set(row.id, { [tenders[0].method]: paid });
      else {
        const share: Record<string, number> = {};
        for (const t of tenders) share[t.method] = (share[t.method] ?? 0) + paid / tenders.length;
        result.set(row.id, share);
      }
      continue;
    }
    itemized.push({ row, paid, tenders, tendered: tenders.reduce((s, t) => s + (t.amount ?? 0), 0) });
  }

  // Cluster tickets that are one payment (same tender string, checked out together).
  // `date` is typed as a Date, but a caller reading it from a computed SQL column gets text: accept both.
  const at = (row: TenderRow) => new Date(row.date).getTime();
  itemized.sort((a, b) => at(a.row) - at(b.row) || a.row.id - b.row.id);
  const open = new Map<string, { start: number; paid: number; tendered: number; members: typeof itemized }>();
  const clusters: { paid: number; tenders: Tender[]; members: typeof itemized }[] = [];
  const flush = (key: string) => {
    const c = open.get(key);
    if (c) { clusters.push({ paid: c.paid, tenders: c.members[0].tenders, members: c.members }); open.delete(key); }
  };
  for (const item of itemized) {
    const key = item.row.paymentMethod!;
    const cur = open.get(key);
    const t = at(item.row);
    if (cur && t - cur.start <= GROUP_WINDOW_MS && cur.paid + item.paid <= cur.tendered + 0.005) {
      cur.paid += item.paid;
      cur.members.push(item);
      continue;
    }
    flush(key);
    open.set(key, { start: t, paid: item.paid, tendered: item.tendered, members: [item] });
  }
  for (const key of [...open.keys()]) flush(key);

  for (const c of clusters) {
    const net = netTenders(c.tenders, c.paid);
    for (const m of c.members) {
      const share: Record<string, number> = {};
      const f = c.paid > 0 ? m.paid / c.paid : 1 / c.members.length;
      for (const [method, amt] of net) share[method] = r2(amt * f);
      result.set(m.row.id, share);
    }
  }
  return result;
}
