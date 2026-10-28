import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportFrame, Kpi, useReportRange, useMoneyReport, money, pctChange, downloadCsv } from "./ReportFrame";

/**
 * The Money reports (owner, 2026-10-29), each its own page, from /api/reports/money/* (server: lib/reports/money.ts).
 */
const BAR = "#1f6fe0";
const METHOD_COLORS: Record<string, string> = { cash: "#16a34a", card: "#1f6fe0", m2: "#7c3aed", tap: "#0891b2", gift: "#ea580c" };
const methodName = (m: string) => ({ cash: "Cash", card: "Card", m2: "Card reader (M2)", tap: "Tap to Pay", gift: "Gift card" } as Record<string, string>)[m] ?? m.charAt(0).toUpperCase() + m.slice(1);
const bucketLabel = (label: string, by: "day" | "month") => (by === "month" ? format(parseISO(`${label}-01`), "MMM yyyy") : format(parseISO(label), "MMM d"));

function Chart({ title, data, keys, by }: { title: string; data: any[]; keys: { key: string; name: string; color: string }[]; by: "day" | "month" }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.map((d) => ({ ...d, name: bucketLabel(d.label, by) }))}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} width={60} />
              <Tooltip formatter={(v: number) => money(v)} />
              {keys.length > 1 && <Legend />}
              {keys.map((k) => <Bar key={k.key} dataKey={k.key} name={k.name} fill={k.color} stackId={keys.length > 1 ? "a" : undefined} radius={keys.length > 1 ? 0 : [3, 3, 0, 0]} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function Table({ head, rows, testId }: { head: string[]; rows: (string | number)[][]; testId?: string }) {
  return (
    <div className="overflow-x-auto" data-testid={testId}>
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-muted-foreground">{head.map((h, i) => <th key={h} className={`py-2 pr-4 font-medium ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b last:border-0">{r.map((c, j) => <td key={j} className={`py-2 pr-4 ${j ? "text-right tabular-nums" : ""}`}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

// ── Sales ─────────────────────────────────────────────────────────────────────
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function Heatmap({ heat }: { heat: number[][] }) {
  const hours = Array.from({ length: 24 }, (_, h) => h).filter((h) => heat.some((row) => row[h] > 0));
  const max = Math.max(1, ...heat.flat());
  if (!hours.length) return <p className="text-sm text-muted-foreground">No sales in this period.</p>;
  const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? "a" : "p"}`;
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-separate" style={{ borderSpacing: 3 }}>
        <thead><tr><th />{hours.map((h) => <th key={h} className="font-medium text-muted-foreground px-1">{hourLabel(h)}</th>)}</tr></thead>
        <tbody>
          {heat.map((row, d) => (
            <tr key={d}>
              <td className="pr-2 font-medium text-muted-foreground">{DAYS[d]}</td>
              {hours.map((h) => (
                <td key={h} title={`${DAYS[d]} ${hourLabel(h)}: ${money(row[h])}`} className="h-7 min-w-[34px] rounded text-center tabular-nums"
                  style={{ background: row[h] ? `rgba(31,111,224,${0.12 + 0.78 * (row[h] / max)})` : "rgba(127,127,127,0.08)", color: row[h] / max > 0.55 ? "#fff" : undefined }}>
                  {row[h] ? Math.round(row[h]) : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SalesReport() {
  const range = useReportRange();
  const q = useMoneyReport<any>("sales", range.from, range.to, range.compare);
  const d = q.data;
  const t = d?.totals; const p = d?.previous?.totals;
  return (
    <ReportFrame title="Sales" description="What the salon sold, after discounts, with tax, tips and refunds." range={range}
      loading={q.isLoading} error={q.error ? (q.error as Error).message : null}
      onCsv={d ? () => downloadCsv(`sales-${range.from}-to-${range.to}`, ["Period", "Net sales", "Visits"], d.series.map((s: any) => [s.label, s.netSales, s.visits])) : undefined}>
      {t && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi label="Net sales" value={money(t.netSales)} change={pctChange(t.netSales, p?.netSales)} sub="Services + products, after discounts" />
            <Kpi label="Visits" value={String(t.visits)} change={pctChange(t.visits, p?.visits)} />
            <Kpi label="Average ticket" value={money(t.avgTicket)} change={pctChange(t.avgTicket, p?.avgTicket)} sub="Net sales per visit" />
            <Kpi label="Collected" value={money(t.collected)} change={pctChange(t.collected, p?.collected)} sub="Everything taken, with tax and tips" />
          </div>
          <Chart title="Net sales" data={d.series} keys={[{ key: "netSales", name: "Net sales", color: BAR }]} by={d.by} />
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Breakdown</CardTitle></CardHeader>
              <CardContent>
                <Table testId="sales-breakdown" head={["", "This period", ...(p ? ["Previous"] : [])]} rows={[
                  ["Services", money(t.services), ...(p ? [money(p.services)] : [])],
                  ["Products", money(t.products), ...(p ? [money(p.products)] : [])],
                  ["Gross sales", money(t.gross), ...(p ? [money(p.gross)] : [])],
                  ["Discounts", `−${money(t.discounts)}`, ...(p ? [`−${money(p.discounts)}`] : [])],
                  ["Net sales", money(t.netSales), ...(p ? [money(p.netSales)] : [])],
                  ["Sales tax", money(t.tax), ...(p ? [money(p.tax)] : [])],
                  ["Tips", money(t.tips), ...(p ? [money(p.tips)] : [])],
                  ["Collected", money(t.collected), ...(p ? [money(p.collected)] : [])],
                  ["Refunds", `−${money(t.refunds)}`, ...(p ? [`−${money(p.refunds)}`] : [])],
                ]} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">When the money comes in</CardTitle></CardHeader>
              <CardContent><Heatmap heat={d.heat} /><p className="text-xs text-muted-foreground mt-2">Net sales by day of the week and hour.</p></CardContent>
            </Card>
          </div>
        </>
      )}
    </ReportFrame>
  );
}

// ── Payments ──────────────────────────────────────────────────────────────────
export function PaymentsReport() {
  const range = useReportRange();
  const q = useMoneyReport<any>("payments", range.from, range.to, range.compare);
  const d = q.data;
  const methods: { method: string; amount: number; count: number; share: number }[] = d?.methods ?? [];
  return (
    <ReportFrame title="Payments" description="How clients paid: cash, card, card reader, gift card. A split payment counts in each method." range={range}
      loading={q.isLoading} error={q.error ? (q.error as Error).message : null}
      onCsv={d ? () => downloadCsv(`payments-${range.from}-to-${range.to}`, ["Method", "Amount", "Payments", "Share %"], methods.map((m) => [methodName(m.method), m.amount, m.count, m.share])) : undefined}>
      {d && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi label="Total taken" value={money(d.total)} change={pctChange(d.total, d.previous?.total)} />
            {methods.slice(0, 3).map((m) => <Kpi key={m.method} label={methodName(m.method)} value={money(m.amount)} sub={`${m.share}% of payments`} change={pctChange(m.amount, d.previous?.methods?.[m.method])} />)}
          </div>
          <Chart title="Payments by method" data={d.series} by={d.by} keys={methods.map((m) => ({ key: m.method, name: methodName(m.method), color: METHOD_COLORS[m.method] ?? "#64748b" }))} />
          <Card><CardContent className="pt-5">
            <Table testId="payments-table" head={["Method", "Amount", "Payments", "Share"]} rows={methods.map((m) => [methodName(m.method), money(m.amount), m.count, `${m.share}%`])} />
          </CardContent></Card>
        </>
      )}
    </ReportFrame>
  );
}

// ── Sales tax ─────────────────────────────────────────────────────────────────
export function TaxReport() {
  const range = useReportRange();
  const q = useMoneyReport<any>("tax", range.from, range.to, range.compare);
  const d = q.data; const t = d?.totals;
  return (
    <ReportFrame title="Sales tax" description="The sales tax actually charged at checkout, for filing." range={range}
      loading={q.isLoading} error={q.error ? (q.error as Error).message : null}
      onCsv={d ? () => downloadCsv(`sales-tax-${range.from}-to-${range.to}`, ["Period", "Net sales", "Taxed sales", "Tax collected"], d.series.map((s: any) => [s.label, s.netSales, s.taxedSales, s.tax])) : undefined}>
      {t && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi label="Tax collected" value={money(t.tax)} change={pctChange(t.tax, d.previous?.tax)} />
            <Kpi label="Taxed sales" value={money(t.taxedSales)} sub={`${t.taxedTickets} of ${t.tickets} tickets`} />
            <Kpi label="Net sales" value={money(t.netSales)} />
            <Kpi label="Effective rate" value={t.taxedSales ? `${Math.round((t.tax / t.taxedSales) * 10000) / 100}%` : "—"} sub="Tax ÷ taxed sales" />
          </div>
          <Chart title="Tax collected" data={d.series} keys={[{ key: "tax", name: "Tax", color: BAR }]} by={d.by} />
          <Card><CardContent className="pt-5">
            <Table testId="tax-table" head={[d.by === "month" ? "Month" : "Day", "Net sales", "Taxed sales", "Tax collected"]}
              rows={d.series.filter((s: any) => s.netSales || s.tax).map((s: any) => [bucketLabel(s.label, d.by), money(s.netSales), money(s.taxedSales), money(s.tax)])} />
          </CardContent></Card>
        </>
      )}
    </ReportFrame>
  );
}

// ── Tips ──────────────────────────────────────────────────────────────────────
export function TipsReport() {
  const range = useReportRange();
  const q = useMoneyReport<any>("tips", range.from, range.to, range.compare);
  const d = q.data; const t = d?.totals;
  return (
    <ReportFrame title="Tips" description="Tips by technician: how much, how often, and as a share of their sales." range={range}
      loading={q.isLoading} error={q.error ? (q.error as Error).message : null}
      onCsv={d ? () => downloadCsv(`tips-${range.from}-to-${range.to}`, ["Technician", "Tips", "Tickets", "Tipped tickets", "Average tip", "Tip % of sales"], d.staff.map((s: any) => [s.name, s.tips, s.tickets, s.tipped, s.avgTip, s.tipRate])) : undefined}>
      {t && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi label="Tips" value={money(t.tips)} change={pctChange(t.tips, d.previous?.tips)} />
            <Kpi label="Tipped tickets" value={`${t.tipped} of ${t.tickets}`} />
            <Kpi label="Average tip" value={money(t.tipped ? t.tips / t.tipped : 0)} sub="On tickets that were tipped" />
            <Kpi label="Tips as % of sales" value={`${t.tipRate}%`} />
          </div>
          <Chart title="Tips" data={d.series} keys={[{ key: "tips", name: "Tips", color: BAR }]} by={d.by} />
          <Card><CardContent className="pt-5">
            <Table testId="tips-table" head={["Technician", "Tips", "Tickets", "Tipped", "Average tip", "% of sales"]}
              rows={d.staff.map((s: any) => [s.name, money(s.tips), s.tickets, s.tipped, money(s.avgTip), `${s.tipRate}%`])} />
          </CardContent></Card>
        </>
      )}
    </ReportFrame>
  );
}

// ── Gift cards ────────────────────────────────────────────────────────────────
export function GiftCardsReport() {
  const range = useReportRange();
  const q = useMoneyReport<any>("gift-cards", range.from, range.to, range.compare);
  const d = q.data; const t = d?.totals;
  return (
    <ReportFrame title="Gift cards" description="Gift cards sold and used, and what is still owed on cards clients hold." range={range}
      loading={q.isLoading} error={q.error ? (q.error as Error).message : null}
      onCsv={d ? () => downloadCsv(`gift-cards-${range.to}`, ["Card", "Issued to", "Original", "Balance"], d.cards.map((c: any) => [c.code, c.name ?? "", c.original, c.balance])) : undefined}>
      {t && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi label="Sold" value={money(t.soldAmount)} sub={`${t.soldCount} card${t.soldCount === 1 ? "" : "s"}`} change={pctChange(t.soldAmount, d.previous?.soldAmount)} />
            <Kpi label="Used to pay" value={money(t.redeemed)} sub="Gift card payments in this period" />
            <Kpi label="Still owed" value={money(t.outstanding)} sub={`On ${t.outstandingCount} card${t.outstandingCount === 1 ? "" : "s"}, today`} />
            <Kpi label="Sold − used" value={money(t.soldAmount - t.redeemed)} sub="In this period" />
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Cards with a balance</CardTitle></CardHeader>
            <CardContent>
              {d.cards.length ? <Table testId="gift-cards-table" head={["Card", "Issued to", "Original", "Balance"]} rows={d.cards.map((c: any) => [c.code, c.name ?? "—", money(c.original), money(c.balance)])} />
                : <p className="text-sm text-muted-foreground">No gift card has a balance.</p>}
            </CardContent>
          </Card>
        </>
      )}
    </ReportFrame>
  );
}

