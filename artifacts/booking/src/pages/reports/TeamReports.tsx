import { Card, CardContent } from "@/components/ui/card";
import { ReportFrame, Kpi, useReportRange, useReport, money, pctChange, downloadCsv } from "./ReportFrame";
import { Table } from "./MoneyReports";

/** Team reports (owner, 2026-10-29, plans/reports.md stage 2), from /api/reports/team/* (server: lib/reports/team.ts). */
const err = (q: { error: unknown }) => (q.error ? (q.error as Error).message : null);

export function StaffReport() {
  const range = useReportRange();
  const q = useReport<any>("team", "staff", range.from, range.to, range.compare);
  const d = q.data;
  const prevOf = (id: number) => d?.previous?.byStaff?.[id];
  return (
    <ReportFrame title="Staff performance" description="Each technician's sales, tickets, average ticket, tips, add-ons, clients who came back, and sales per hour worked." range={range}
      loading={q.isLoading} error={err(q)}
      onCsv={d ? () => downloadCsv(`staff-${range.from}-to-${range.to}`, ["Technician", "Net sales", "Tickets", "Clients", "Average ticket", "Tips", "Add-on %", "Came back %", "Avg service min", "Hours", "Sales per hour"],
        d.staff.map((s: any) => [s.name, s.netSales, s.tickets, s.clients, s.avgTicket, s.tips, s.addonRate, s.cameBackRate, s.avgMinutes ?? "", s.hours, s.salesPerHour ?? ""])) : undefined}>
      {d && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi label="Net sales" value={money(d.totals.netSales)} />
            <Kpi label="Tickets" value={String(d.totals.tickets)} />
            <Kpi label="Tips" value={money(d.totals.tips)} />
            <Kpi label="Hours on the clock" value={String(d.totals.hours)} />
          </div>
          <Card><CardContent className="pt-5">
            <Table testId="staff-table" head={["Technician", "Net sales", "Change", "Tickets", "Avg ticket", "Tips", "Add-ons", "Came back", "Avg service", "Sales / hour"]}
              rows={d.staff.map((s: any) => {
                const ch = pctChange(s.netSales, prevOf(s.staffId));
                return [s.name, money(s.netSales), ch == null ? "—" : `${ch >= 0 ? "+" : ""}${ch}%`, s.tickets, money(s.avgTicket), money(s.tips), `${s.addonRate}%`, `${s.cameBackRate}%`,
                  s.avgMinutes == null ? "—" : `${s.avgMinutes} min`, s.salesPerHour == null ? "—" : money(s.salesPerHour)];
              })} />
            <p className="text-xs text-muted-foreground mt-3">Add-ons: share of tickets with an add-on. Came back: share of tickets whose client had another visit within 60 days. Average service: START to DONE.</p>
          </CardContent></Card>
        </>
      )}
    </ReportFrame>
  );
}

export function HoursReport() {
  const range = useReportRange();
  const q = useReport<any>("team", "hours", range.from, range.to, false);
  const d = q.data;
  return (
    <ReportFrame title="Hours & chair use" description="Hours on the clock against the time spent with clients (START to DONE)." range={range}
      loading={q.isLoading} error={err(q)}
      onCsv={d ? () => downloadCsv(`hours-${range.from}-to-${range.to}`, ["Technician", "Days", "Hours on the clock", "Hours with clients", "Chair use %"],
        d.staff.map((s: any) => [s.name, s.days, s.hours, s.serviceHours, s.chairUse ?? ""])) : undefined}>
      {d && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Kpi label="Hours on the clock" value={String(d.totals.hours)} />
            <Kpi label="Hours with clients" value={String(d.totals.serviceHours)} />
            <Kpi label="Chair use" value={d.totals.chairUse == null ? "—" : `${d.totals.chairUse}%`} sub="Time with clients ÷ time on the clock" />
          </div>
          <Card><CardContent className="pt-5">
            <Table testId="hours-table" head={["Technician", "Days", "On the clock", "With clients", "Chair use"]}
              rows={d.staff.map((s: any) => [s.name, s.days, `${s.hours} h`, `${s.serviceHours} h`, s.chairUse == null ? "—" : `${s.chairUse}%`])} />
            <p className="text-xs text-muted-foreground mt-3">A clock-in never clocked out counts up to 14 hours. Time with clients counts services where START and DONE were both pressed.</p>
          </CardContent></Card>
        </>
      )}
    </ReportFrame>
  );
}

export function TurnsReport() {
  const range = useReportRange();
  const q = useReport<any>("team", "turns", range.from, range.to, false);
  const d = q.data;
  return (
    <ReportFrame title="Turns" description="Turns each technician earned, tickets the turn system gave them, and manager adjustments." range={range}
      loading={q.isLoading} error={err(q)}
      onCsv={d ? () => downloadCsv(`turns-${range.from}-to-${range.to}`, ["Technician", "Turns earned", "Turn tickets", "Given by turn", "Adjustments", "Turns adjusted", "Turn sales"],
        d.staff.map((s: any) => [s.name, s.turns, s.credited, s.assigned, s.adjustments, s.adjustedTurns, s.turnSales])) : undefined}>
      {d && (
        <Card><CardContent className="pt-5">
          {d.staff.length ? <Table testId="turns-table" head={["Technician", "Turns earned", "Turn tickets", "Given by turn", "Adjustments", "Turns adjusted", "Turn sales"]}
            rows={d.staff.map((s: any) => [s.name, s.turns, s.credited, s.assigned, s.adjustments, s.adjustedTurns, money(s.turnSales)])} />
            : <p className="text-sm text-muted-foreground">No turns in this period.</p>}
        </CardContent></Card>
      )}
    </ReportFrame>
  );
}
