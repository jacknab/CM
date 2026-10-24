/**
 * A technician's pay slip, laid out for the 58 mm receipt printer (32 characters a line) the way salons
 * already print them: the salon, the pay dates, Employee Pay (total sale, commission, non-cash tips,
 * total pay), then Daily Details — one line per day with its total, commission and non-cash tips, and
 * the column totals. A one-day slip lists that day's tickets instead of days.
 *
 * Built here, in the web app, so the layout can change without an update to the tablet app; the app
 * only prints the text (bridge message PRINT_TEXT). Tags: [C] centre, [L] left, <b> bold.
 */
export interface TechSlip {
  storeName: string;
  staffName: string;
  period: "today" | "week" | "pay";
  firstDay: string; // YYYY-MM-DD
  lastDay: string;
  payrollType: string;
  commissionOn: boolean;
  totals: { sale: number; commission: number; ncTips: number; cashTips: number; pay: number; tickets: number };
  days: { date: string; sale: number; commission: number; ncTips: number }[];
  tickets: { ticketNumber: number | null; closedAt: string; service: string; sale: number; commission: number; tip: number; nonCashTip: number }[];
}

export const SLIP_WIDTH = 32;
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const money = (n: number) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;
const two = (left: string, right: string, width = SLIP_WIDTH) => {
  const room = Math.max(1, width - right.length);
  return `${left.length > room - 1 ? left.slice(0, room - 1) : left}`.padEnd(room) + right;
};
const titled = (title: string, width = SLIP_WIDTH) => {
  const t = ` ${title} `;
  const left = Math.floor((width - t.length) / 2);
  return "-".repeat(Math.max(0, left)) + t + "-".repeat(Math.max(0, width - left - t.length));
};
/** "10/01/2026" from "2026-10-01". */
const usDate = (day: string) => `${day.slice(5, 7)}/${day.slice(8, 10)}/${day.slice(0, 4)}`;
/** "01-FRI" from "2026-10-01". */
const dayLabel = (day: string) => `${day.slice(8, 10)}-${DAYS[new Date(`${day}T12:00:00Z`).getUTCDay()]}`;
/** One row of the details table: a label and three amounts, right-aligned in fixed columns. */
const row = (label: string, a: string, b: string, c: string) => label.padEnd(7).slice(0, 7) + a.padStart(8) + b.padStart(9) + c.padStart(8);

/** "[L]text" → "[L]<b>text</b>"; a line already bold, or empty, is left as it is. */
const boldLine = (line: string) => {
  const m = /^(\[[LCR]\])(.*)$/.exec(line);
  if (!m || !m[2].trim() || m[2].includes("<b>")) return line;
  return `${m[1]}<b>${m[2]}</b>`;
};

export function buildTechSlipText(s: TechSlip, timeZone?: string): string {
  const lines: string[] = [];
  lines.push(`[C]<b>${s.storeName.toUpperCase()}</b>`);
  lines.push(`[L]${"-".repeat(SLIP_WIDTH)}`);
  const dates = s.firstDay === s.lastDay ? usDate(s.firstDay) : `${usDate(s.firstDay).slice(0, 6)}${s.firstDay.slice(2, 4)} - ${usDate(s.lastDay).slice(0, 6)}${s.lastDay.slice(2, 4)}`;
  lines.push(`[L]${two("Payroll Date", dates)}`);
  lines.push(`[L]${two("Employee Name", s.staffName)}`);
  lines.push(`[L]${two("Payroll Type", s.payrollType)}`);
  lines.push(`[L]${titled("Employee Pay")}`);
  lines.push(`[L]${two("Total Sale", money(s.totals.sale))}`);
  lines.push(`[L]${two("Total Commission", money(s.totals.commission))}`);
  lines.push(`[L]${two("+Non-Cash Tips", money(s.totals.ncTips))}`);
  lines.push(`[L]${" ".repeat(SLIP_WIDTH - 12)}${"-".repeat(12)}`);
  lines.push(`[L]<b>${two("Total Pay", money(s.totals.pay))}</b>`);
  if (s.totals.cashTips > 0) lines.push(`[L]${two("Cash tips (kept)", money(s.totals.cashTips))}`);
  if (!s.commissionOn) lines.push(`[L]No commission rate is set.`);

  if (s.period === "today") {
    lines.push(`[L]${titled("Tickets")}`);
    lines.push(`[L]${row("Ticket", "Total", "Comm", "Tip")}`);
    for (const t of s.tickets) {
      const time = new Date(t.closedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) }).replace(" ", "").toLowerCase();
      lines.push(`[L]${t.ticketNumber != null ? `#${t.ticketNumber}` : "-"} ${time} ${t.service}`.slice(0, SLIP_WIDTH + 3));
      lines.push(`[L]${row("", money(t.sale), money(t.commission), money(t.tip))}`);
    }
    if (s.tickets.length === 0) lines.push(`[L]No tickets.`);
  } else {
    lines.push(`[L]${titled("Daily Details")}`);
    lines.push(`[L]${row("Day", "Total", "Comm", "NC Tips")}`);
    for (const d of s.days) lines.push(`[L]${row(dayLabel(d.date), money(d.sale), money(d.commission), money(d.ncTips))}`);
  }
  lines.push(`[L]${" ".repeat(7)}${"-".repeat(SLIP_WIDTH - 7)}`);
  lines.push(`[L]${row("", money(s.totals.sale), money(s.totals.commission), money(s.totals.ncTips))}`);
  lines.push(`[L]${s.totals.tickets} ${s.totals.tickets === 1 ? "ticket" : "tickets"}`);
  lines.push("[L]");
  // Every line in bold (owner, 2026-10-24): a darker print on thermal printers that print thin.
  return lines.map(boldLine).join("\n");
}
