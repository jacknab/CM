import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportFrame, Kpi, useReportRange, useReport, money, pctChange, downloadCsv } from "./ReportFrame";
import { Chart, Table, Heatmap, DAYS } from "./MoneyReports";
import { format } from "date-fns";

/** Operations reports (owner, 2026-10-29, plans/reports.md stage 4), from /api/reports/operations/* (lib/reports/operations.ts). */
const err = (q: { error: unknown }) => (q.error ? (q.error as Error).message : null);
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? " am" : " pm"}`;

export function AppointmentsReport() {
  const range = useReportRange();
  const q = useReport<any>("operations", "appointments", range.from, range.to, range.compare);
  const d = q.data; const t = d?.totals; const p = d?.previous;
  return (
    <ReportFrame title="Appointments & walk-ins" description="Booked visits and walk-ins: how many came, were cancelled or didn't show, and how far ahead people book." range={range}
      loading={q.isLoading} error={err(q)}
      onCsv={d ? () => downloadCsv(`appointments-${range.from}-to-${range.to}`, ["Period", "Completed", "Cancelled", "No-shows", "Walk-ins"], d.series.map((s: any) => [s.label, s.completed, s.cancelled, s.no_shows, s.walk_ins])) : undefined}>
      {t && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi label="Visits on the books" value={String(t.total)} change={pctChange(t.total, p?.total)} />
            <Kpi label="Completed" value={String(t.completed)} change={pctChange(t.completed, p?.completed)} />
            <Kpi label="Walk-ins" value={String(t.walkIns)} change={pctChange(t.walkIns, p?.walkIns)} sub={`${t.booked} booked ahead`} />
            <Kpi label="Booked ahead by" value={t.leadDays == null ? "—" : `${t.leadDays} days`} sub="Average, booked visits" />
          </div>
          <Chart title="Visits" by={d.by} unit="count" data={d.series} keys={[
            { key: "completed", name: "Completed", color: "#16a34a" }, { key: "cancelled", name: "Cancelled", color: "#f59e0b" }, { key: "no_shows", name: "No-show", color: "#dc2626" },
          ]} />
        </>
      )}
    </ReportFrame>
  );
}

export function WaitTimesReport() {
  const range = useReportRange();
  const q = useReport<any>("operations", "wait-times", range.from, range.to, range.compare);
  const d = q.data; const t = d?.totals;
  const mins = (v: number | null) => (v == null ? "—" : `${v} min`);
  return (
    <ReportFrame title="Wait times" description="How long clients wait from checking in to their service starting." range={range} loading={q.isLoading} error={err(q)}
      onCsv={d ? () => downloadCsv(`wait-times-${range.from}-to-${range.to}`, ["Hour", "Clients", "Average wait (min)"], d.byHour.map((h: any) => [hourLabel(h.hour), h.clients, h.avg])) : undefined}>
      {t && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi label="Average wait" value={mins(t.avg)} invert change={pctChange(t.avg ?? 0, d.previous?.avg)} sub={`${t.clients} clients`} />
            <Kpi label="Typical wait" value={mins(t.median)} sub="Half wait less than this" />
            <Kpi label="Longest waits" value={mins(t.p90)} sub="1 in 10 wait this long or more" />
            <Kpi label="Started within 15 min" value={t.within15 == null ? "—" : `${t.within15}%`} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Average wait by check-in hour</CardTitle></CardHeader>
              <CardContent>
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.byHour.map((h: any) => ({ ...h, name: hourLabel(h.hour) }))}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={40} />
                      <Tooltip formatter={(v: number) => `${v} min`} /><Bar dataKey="avg" name="Average wait" fill="#1f6fe0" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">By day of the week</CardTitle></CardHeader>
              <CardContent><Table testId="wait-days" head={["Day", "Clients", "Average wait"]} rows={d.byDay.map((x: any) => [DAYS[x.dow], x.clients, `${x.avg} min`])} /></CardContent>
            </Card>
          </div>
        </>
      )}
    </ReportFrame>
  );
}

export function ServiceTimesReport() {
  const range = useReportRange();
  const q = useReport<any>("operations", "service-times", range.from, range.to, false);
  const d = q.data;
  return (
    <ReportFrame title="Service times" description="How long each service really takes (START to DONE) against the time it is booked for." range={range}
      loading={q.isLoading} error={err(q)}
      onCsv={d ? () => downloadCsv(`service-times-${range.from}-to-${range.to}`, ["Service", "Timed", "Booked (min)", "Average (min)", "Typical (min)", "Difference (min)"],
        d.services.map((s: any) => [s.name, s.timed, s.booked, s.avg, s.median, s.over])) : undefined}>
      {d && (
        <Card><CardContent className="pt-5">
          {d.services.length ? <Table testId="service-times-table" head={["Service", "Timed", "Booked for", "Average", "Typical", "Difference"]}
            rows={d.services.map((s: any) => [s.name, s.timed, `${s.booked} min`, `${s.avg} min`, `${s.median} min`, `${s.over > 0 ? "+" : ""}${s.over} min`])} />
            : <p className="text-sm text-muted-foreground">No services were timed in this period (START and DONE both pressed).</p>}
          <p className="text-xs text-muted-foreground mt-3">A service that runs longer than booked makes the next client wait; one that runs shorter leaves the chair empty.</p>
        </CardContent></Card>
      )}
    </ReportFrame>
  );
}

export function BusyTimesReport() {
  const range = useReportRange();
  const q = useReport<any>("operations", "busy-times", range.from, range.to, false);
  const d = q.data;
  return (
    <ReportFrame title="Busiest times" description="When clients come in, by day of the week and hour — for staffing." range={range} loading={q.isLoading} error={err(q)}
      onCsv={d ? () => downloadCsv(`busy-times-${range.from}-to-${range.to}`, ["Day", "Clients", "Average per day"], d.perDay.map((x: any) => [DAYS[x.dow], x.clients, x.avgPerDay])) : undefined}>
      {d && (
        <>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Clients by day and hour</CardTitle></CardHeader>
            <CardContent><Heatmap heat={d.heat} unit="count" /></CardContent>
          </Card>
          <Card><CardContent className="pt-5">
            <Table testId="busy-days" head={["Day", "Clients", "Average per day"]} rows={d.perDay.map((x: any) => [DAYS[x.dow], x.clients, x.avgPerDay])} />
          </CardContent></Card>
        </>
      )}
    </ReportFrame>
  );
}

export function ServicesReport() {
  const range = useReportRange();
  const q = useReport<any>("operations", "services", range.from, range.to, range.compare);
  const d = q.data;
  return (
    <ReportFrame title="Services & add-ons" description="What sells: how often, for how much, and how often each add-on goes with a service." range={range}
      loading={q.isLoading} error={err(q)}
      onCsv={d ? () => downloadCsv(`services-${range.from}-to-${range.to}`, ["Service", "Count", "Revenue", "Average price"], d.services.map((s: any) => [s.name, s.count, s.revenue, s.avgPrice])) : undefined}>
      {d && (
        <>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Services</CardTitle></CardHeader>
            <CardContent>
              {d.services.length ? <Table testId="services-table" head={["Service", "Count", "Change", "Revenue", "Average price"]}
                rows={d.services.map((s: any) => { const ch = pctChange(s.count, d.previous?.byService?.[s.id]); return [s.name, s.count, ch == null ? "—" : `${ch >= 0 ? "+" : ""}${ch}%`, money(s.revenue), money(s.avgPrice)]; })} />
                : <p className="text-sm text-muted-foreground">No services sold in this period.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Add-ons</CardTitle></CardHeader>
            <CardContent>
              {d.addons.length ? <Table testId="addons-table" head={["Add-on", "Count", "Revenue", "On % of tickets"]} rows={d.addons.map((a: any) => [a.name, a.count, money(a.revenue), `${a.attachRate}%`])} />
                : <p className="text-sm text-muted-foreground">No add-ons sold in this period.</p>}
            </CardContent>
          </Card>
        </>
      )}
    </ReportFrame>
  );
}

export function CancelledAfterServiceReport() {
  const range = useReportRange();
  const q = useReport<any>("operations", "cancelled-after-service", range.from, range.to, range.compare);
  const d = q.data; const t = d?.totals;
  const when = (v: string) => format(new Date(v), "MMM d, h:mm a");
  const stage = (x: any) => (x.wasPaid ? "Paid" : x.wasDone ? "DONE" : "Started");
  return (
    <ReportFrame title="Cancelled after service" description="Tickets a technician had already worked on that were cancelled with the manager PIN, and the reason given." range={range}
      loading={q.isLoading} error={err(q)}
      onCsv={d ? () => downloadCsv(`cancelled-after-service-${range.from}-to-${range.to}`, ["Cancelled", "Ticket", "Client", "Technician", "Service", "Amount", "Stage", "Reason", "Signed in"],
        d.rows.map((x: any) => [when(x.cancelledAt), x.ticketNumber ?? "", x.clientName ?? "", x.staffName ?? "", x.serviceName ?? "", x.totalPaid ?? x.price ?? "", stage(x), x.reason, x.signedInStaffName ?? ""])) : undefined}>
      {t && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Kpi label="Cancelled after service" value={String(t.count)} invert change={d.previous ? pctChange(t.count, d.previous.count) : null} />
            <Kpi label="Value of those tickets" value={money(t.value)} sub="Paid amount, or the service price" />
            <Kpi label="Technicians involved" value={String(d.byTech.length)} sub={d.byTech.slice(0, 3).map((b: any) => `${b.name} ${b.n}`).join(" · ") || undefined} />
          </div>
          <Card><CardContent className="pt-5">
            {d.rows.length ? <Table testId="cancelled-after-service-table" head={["Cancelled", "Ticket", "Client", "Technician", "Service", "Amount", "Stage", "Reason"]}
              rows={d.rows.map((x: any) => [when(x.cancelledAt), x.ticketNumber ?? "—", x.clientName ?? "—", x.staffName ?? "—", x.serviceName ?? "—",
                x.totalPaid != null || x.price != null ? money(x.totalPaid ?? x.price) : "—", stage(x), x.reason])} />
              : <p className="text-sm text-muted-foreground">No serviced tickets were cancelled in this period.</p>}
            <p className="text-xs text-muted-foreground mt-3">Stage: how far the ticket had got — Started (START pressed), DONE, or Paid.</p>
          </CardContent></Card>
        </>
      )}
    </ReportFrame>
  );
}
