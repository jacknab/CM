import { useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportFrame, Kpi, useReportRange, useReport, money, pctChange, downloadCsv } from "./ReportFrame";
import { Table, DAYS } from "./MoneyReports";

/** Client reports (owner, 2026-10-29, plans/reports.md stage 3), from /api/reports/clients/* (server: lib/reports/clients.ts). */
const err = (q: { error: unknown }) => (q.error ? (q.error as Error).message : null);
const day = (v: string | null) => (v ? format(new Date(v), "MMM d, yyyy") : "—");
const pct = (v: number | null | undefined) => (v == null ? "—" : `${v}%`);

export function RetentionReport() {
  const range = useReportRange();
  const q = useReport<any>("clients", "retention", range.from, range.to, range.compare);
  const d = q.data; const t = d?.totals; const p = d?.previous;
  return (
    <ReportFrame title="Client retention" description="New and returning clients, and how many new clients come back." range={range} loading={q.isLoading} error={err(q)}>
      {t && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi label="Clients served" value={String(t.served)} change={pctChange(t.served, p?.served)} />
            <Kpi label="New clients" value={String(t.newClients)} change={pctChange(t.newClients, p?.newClients)} sub="First visit in this period" />
            <Kpi label="Returning clients" value={String(t.returning)} />
            <Kpi label="Days between visits" value={t.avgDaysBetweenVisits == null ? "—" : String(t.avgDaysBetweenVisits)} sub="Average, all clients" />
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Did new clients come back?</CardTitle></CardHeader>
            <CardContent>
              <Table testId="retention-table" head={["", "Came back"]} rows={[
                ["So far", pct(t.backSoFar)], ["Within 30 days", pct(t.back30)], ["Within 60 days", pct(t.back60)], ["Within 90 days", pct(t.back90)],
              ]} />
              <p className="text-xs text-muted-foreground mt-3">Of this period's new clients. "Within 30 / 60 / 90 days" counts only the clients who have had that long; "—" means it's too soon to tell.</p>
            </CardContent>
          </Card>
        </>
      )}
    </ReportFrame>
  );
}

export function LapsedReport() {
  const range = useReportRange();
  const [days, setDays] = useState("60");
  const q = useReport<any>("clients", "lapsed", range.from, range.to, false, `days=${days}`);
  const d = q.data;
  return (
    <ReportFrame title="Lapsed clients" description="Regulars (2 or more visits) who haven't been back for a while — a list to win them back." range={range}
      loading={q.isLoading} error={err(q)}
      onCsv={d ? () => downloadCsv(`lapsed-clients-${days}-days`, ["Client", "Phone", "Visits", "Last visit", "Spent", "Usual technician"],
        d.clients.map((c: any) => [c.name, c.phone ?? "", c.visits, day(c.lastVisit), c.spend, c.usualTech ?? ""])) : undefined}>
      <div className="flex items-center gap-2 text-sm">
        Not back for more than
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-[110px]" data-testid="lapsed-days"><SelectValue /></SelectTrigger>
          <SelectContent>{["30", "45", "60", "90", "120", "180"].map((n) => <SelectItem key={n} value={n}>{n} days</SelectItem>)}</SelectContent>
        </Select>
        <span className="text-muted-foreground">as of {range.to}</span>
      </div>
      {d && (
        <Card><CardContent className="pt-5">
          {d.clients.length ? <Table testId="lapsed-table" head={["Client", "Phone", "Visits", "Last visit", "Spent", "Usual technician"]}
            rows={d.clients.map((c: any) => [c.name, c.phone ?? "—", c.visits, day(c.lastVisit), money(c.spend), c.usualTech ?? "—"])} />
            : <p className="text-sm text-muted-foreground">No regulars have been away that long.</p>}
        </CardContent></Card>
      )}
    </ReportFrame>
  );
}

export function TopClientsReport() {
  const range = useReportRange();
  const q = useReport<any>("clients", "top", range.from, range.to, false);
  const d = q.data;
  return (
    <ReportFrame title="Most valuable clients" description="The clients who spent the most in this period, and over all time." range={range} loading={q.isLoading} error={err(q)}
      onCsv={d ? () => downloadCsv(`top-clients-${range.from}-to-${range.to}`, ["Client", "Visits", "Spent", "Average ticket", "Last visit", "Lifetime spend", "Points"],
        d.clients.map((c: any) => [c.name, c.visits, c.spend, c.avgTicket, day(c.lastVisit), c.lifetime, c.points])) : undefined}>
      {d && (
        <Card><CardContent className="pt-5">
          {d.clients.length ? <Table testId="top-clients-table" head={["Client", "Visits", "Spent", "Avg ticket", "Last visit", "Lifetime", "Points"]}
            rows={d.clients.map((c: any) => [c.name, c.visits, money(c.spend), money(c.avgTicket), day(c.lastVisit), money(c.lifetime), c.points])} />
            : <p className="text-sm text-muted-foreground">No client visits in this period.</p>}
          <p className="text-xs text-muted-foreground mt-3">Spent is what they paid, less tips.</p>
        </CardContent></Card>
      )}
    </ReportFrame>
  );
}

export function NoShowsReport() {
  const range = useReportRange();
  const q = useReport<any>("clients", "no-shows", range.from, range.to, range.compare);
  const d = q.data; const t = d?.totals;
  return (
    <ReportFrame title="No-shows & cancellations" description="How often booked visits don't happen, on which days, and which clients do it again and again." range={range}
      loading={q.isLoading} error={err(q)}
      onCsv={d ? () => downloadCsv(`no-shows-${range.from}-to-${range.to}`, ["Client", "No-shows", "Cancelled", "Booked"], d.clients.map((c: any) => [c.name, c.no_shows, c.cancelled, c.booked])) : undefined}>
      {t && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi label="Booked" value={String(t.booked)} />
            <Kpi label="No-show rate" value={`${t.noShowRate}%`} sub={`${t.no_shows} no-shows`} invert change={d.previous ? Math.round((t.noShowRate - d.previous.noShowRate) * 10) / 10 : null} />
            <Kpi label="Cancellation rate" value={`${t.cancelRate}%`} sub={`${t.cancelled} cancelled`} invert change={d.previous ? Math.round((t.cancelRate - d.previous.cancelRate) * 10) / 10 : null} />
            <Kpi label="Completed" value={String(t.completed)} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">By day of the week</CardTitle></CardHeader>
              <CardContent><Table testId="no-shows-days" head={["Day", "Booked", "Missed", "Missed %"]} rows={d.byDay.map((x: any) => [DAYS[x.dow], x.booked, x.missed, `${x.rate}%`])} /></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Clients who missed 2 or more</CardTitle></CardHeader>
              <CardContent>
                {d.clients.length ? <Table testId="no-shows-clients" head={["Client", "No-shows", "Cancelled", "Booked"]} rows={d.clients.map((c: any) => [c.name, c.no_shows, c.cancelled, c.booked])} />
                  : <p className="text-sm text-muted-foreground">Nobody missed more than once.</p>}
              </CardContent>
            </Card>
          </div>
          {d.previous && <p className="text-xs text-muted-foreground">Rate changes are in percentage points against the previous period.</p>}
        </>
      )}
    </ReportFrame>
  );
}

export function LoyaltyReport() {
  const range = useReportRange();
  const q = useReport<any>("clients", "loyalty", range.from, range.to, false);
  const d = q.data; const t = d?.totals;
  return (
    <ReportFrame title="Loyalty" description="Points clients earned and used, and who holds the most." range={range} loading={q.isLoading} error={err(q)}
      onCsv={d ? () => downloadCsv("loyalty-points", ["Client", "Points"], d.holders.map((c: any) => [c.name, c.points])) : undefined}>
      {t && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Kpi label="Points earned" value={t.earned.toLocaleString()} sub={`By ${t.earners} client${t.earners === 1 ? "" : "s"}`} />
            <Kpi label="Points used" value={t.redeemed.toLocaleString()} sub={`${t.redemptions} reward${t.redemptions === 1 ? "" : "s"}`} />
            <Kpi label="Points held" value={t.outstanding.toLocaleString()} sub="By all clients, today" />
            <Kpi label="Clients with points" value={String(t.members)} />
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Most points held</CardTitle></CardHeader>
            <CardContent>{d.holders.length ? <Table testId="loyalty-holders" head={["Client", "Points"]} rows={d.holders.map((c: any) => [c.name, c.points.toLocaleString()])} />
              : <p className="text-sm text-muted-foreground">No client holds points.</p>}</CardContent>
          </Card>
        </>
      )}
    </ReportFrame>
  );
}
