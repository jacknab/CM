import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportFrame, Kpi, useReportRange, useReport, money, pctChange, downloadCsv } from "./ReportFrame";
import { Table } from "./MoneyReports";

/** Marketing reports (owner, 2026-10-29, plans/reports.md stage 5), from /api/reports/marketing/* (lib/reports/marketing.ts). */
const err = (q: { error: unknown }) => (q.error ? (q.error as Error).message : null);
const words = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function ReviewsReport() {
  const range = useReportRange();
  const q = useReport<any>("marketing", "reviews", range.from, range.to, range.compare);
  const d = q.data; const t = d?.totals; const p = d?.previous;
  return (
    <ReportFrame title="Review requests" description="Review texts sent after visits, how many clients opened the link, and the reviews that came in." range={range}
      loading={q.isLoading} error={err(q)}>
      {t && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Kpi label="Review texts sent" value={String(t.sent)} change={pctChange(t.sent, p?.sent)} sub={t.notSent ? `${t.notSent} not sent (opted out, no number…)` : undefined} />
          <Kpi label="Opened the link" value={String(t.opened)} change={pctChange(t.opened, p?.opened)} sub={t.openRate == null ? undefined : `${t.openRate}% of links`} />
          <Kpi label="Reviews received" value={String(t.reviews)} sub={t.rating == null ? undefined : `Average ${t.rating} stars`} />
          <Kpi label="Private feedback" value={String(t.privateFeedback)} sub="Unhappy clients who told the salon first" />
        </div>
      )}
    </ReportFrame>
  );
}

export function TextsReport() {
  const range = useReportRange();
  const q = useReport<any>("marketing", "texts", range.from, range.to, range.compare);
  const d = q.data; const t = d?.totals;
  return (
    <ReportFrame title="Texts sent" description="Every text the salon sent, by kind, with failures." range={range} loading={q.isLoading} error={err(q)}
      onCsv={d ? () => downloadCsv(`texts-${range.from}-to-${range.to}`, ["Kind", "Sent", "Failed", "Not sent", "Cost"], d.types.map((x: any) => [words(x.type), x.sent, x.failed, x.skipped, x.cost])) : undefined}>
      {t && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Kpi label="Texts sent" value={String(t.sent)} change={pctChange(t.sent, d.previous?.sent)} />
            <Kpi label="Failed" value={String(t.failed)} invert />
            <Kpi label="Estimated cost" value={money(t.cost)} sub="Marketing texts; system texts are free" />
          </div>
          <Card><CardContent className="pt-5">
            {d.types.length ? <Table testId="texts-table" head={["Kind", "Sent", "Failed", "Not sent", "Cost"]} rows={d.types.map((x: any) => [words(x.type), x.sent, x.failed, x.skipped, money(x.cost)])} />
              : <p className="text-sm text-muted-foreground">No texts in this period.</p>}
          </CardContent></Card>
        </>
      )}
    </ReportFrame>
  );
}

export function AutumnReport() {
  const range = useReportRange();
  const q = useReport<any>("marketing", "autumn", range.from, range.to, range.compare);
  const d = q.data; const t = d?.totals; const p = d?.previous;
  return (
    <ReportFrame title="Autumn calls" description="Calls answered by Autumn, the AI receptionist: how many, how long, what came of them, and the visits she booked." range={range}
      loading={q.isLoading} error={err(q)}
      onCsv={d ? () => downloadCsv(`autumn-calls-${range.from}-to-${range.to}`, ["Outcome", "Calls"], d.outcomes.map((o: any) => [words(o.outcome), o.n])) : undefined}>
      {t && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi label="Calls" value={String(t.calls)} change={pctChange(t.calls, p?.calls)} sub={`${t.minutes} min, about ${t.avgMinutes} min each`} />
            <Kpi label="Visits booked" value={String(t.booked)} change={pctChange(t.booked, p?.booked)} sub={t.bookRate == null ? undefined : `${t.bookRate}% of calls`} />
            <Kpi label="Booked visits completed" value={String(t.completedVisits)} />
            <Kpi label="Sales from those visits" value={money(t.sales)} />
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">What the calls were</CardTitle></CardHeader>
            <CardContent>{d.outcomes.length ? <Table testId="autumn-outcomes" head={["Outcome", "Calls"]} rows={d.outcomes.map((o: any) => [words(o.outcome), o.n])} />
              : <p className="text-sm text-muted-foreground">No calls in this period.</p>}</CardContent>
          </Card>
        </>
      )}
    </ReportFrame>
  );
}
