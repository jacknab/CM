import { useState, useMemo, Fragment } from "react";
import { format, startOfDay, endOfDay, startOfMonth, isWithinInterval } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStaffList } from "@/hooks/use-staff";
import { useAppointments } from "@/hooks/use-appointments";
import { useSelectedStore } from "@/hooks/use-store";
import { toStoreLocal } from "@/lib/timezone";
import { DollarSign, Percent, Scissors, Download, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Staff, AppointmentWithDetails } from "@shared/schema";

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcCommission(apt: AppointmentWithDetails, member: Staff | undefined) {
  const totalPaid = Number((apt as any).totalPaid || 0);
  const tipAmount = Number((apt as any).tipAmount || 0);
  const discountAmount = Number((apt as any).discountAmount || 0);
  // Commissionable revenue excludes tips (tips pass straight through to staff)
  // but adds back any discount — a discount (manual, loyalty, or a deal
  // voucher's platform-fee net) must not reduce staff commission.
  const commissionableRev = Math.max(0, totalPaid + discountAmount - tipAmount);
  const rate = member?.commissionEnabled ? Number(member.commissionRate || 0) : 0;
  const commissionEarned = commissionableRev * (rate / 100);
  return { totalPaid, tipAmount, commissionableRev, rate, commissionEarned };
}

export default function CommissionReport() {
  const { selectedStore } = useSelectedStore();
  const timezone = selectedStore?.timezone || "UTC";

  const { data: staffList = [] } = useStaffList();
  const { data: appointments = [] } = useAppointments();

  const today = new Date();
  const [startDate, setStartDate] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(today, "yyyy-MM-dd"));
  const [selectedStaffId, setSelectedStaffId] = useState<string>("all");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const commissionStaff = useMemo(
    () => (staffList as Staff[]).filter(s => s.commissionEnabled),
    [staffList],
  );

  const from = useMemo(() => startOfDay(new Date(startDate)), [startDate]);
  const to = useMemo(() => endOfDay(new Date(endDate)), [endDate]);

  const filteredAppts = useMemo(() => {
    return (appointments as AppointmentWithDetails[]).filter(a => {
      if (a.status !== "completed") return false;
      const staffId = (a as any).staffId as number | undefined;
      if (!staffId) return false;
      const member = commissionStaff.find(s => s.id === staffId);
      if (!member) return false;
      if (selectedStaffId !== "all" && String(staffId) !== selectedStaffId) return false;
      const d = toStoreLocal(a.date, timezone);
      return isWithinInterval(d, { start: from, end: to });
    });
  }, [appointments, commissionStaff, selectedStaffId, from, to, timezone]);

  const staffBreakdown = useMemo(() => {
    const map = new Map<number, {
      staff: Staff;
      appointments: AppointmentWithDetails[];
      commissionableRev: number;
      commissionEarned: number;
    }>();

    filteredAppts.forEach(apt => {
      const staffId = (apt as any).staffId as number;
      const member = commissionStaff.find(s => s.id === staffId)!;
      if (!map.has(staffId)) {
        map.set(staffId, { staff: member, appointments: [], commissionableRev: 0, commissionEarned: 0 });
      }
      const row = map.get(staffId)!;
      const f = calcCommission(apt, member);
      row.appointments.push(apt);
      row.commissionableRev += f.commissionableRev;
      row.commissionEarned += f.commissionEarned;
    });

    return Array.from(map.values()).sort((a, b) => b.commissionEarned - a.commissionEarned);
  }, [filteredAppts, commissionStaff]);

  const totals = useMemo(() => {
    let commissionableRev = 0;
    let commissionEarned = 0;
    staffBreakdown.forEach(r => {
      commissionableRev += r.commissionableRev;
      commissionEarned += r.commissionEarned;
    });
    const avgRate = commissionableRev > 0 ? (commissionEarned / commissionableRev) * 100 : 0;
    return { commissionableRev, commissionEarned, avgRate };
  }, [staffBreakdown]);

  function toggleExpand(id: number) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleExport() {
    const headers = ["Staff", "Appointments", "Commissionable Revenue", "Commission Rate", "Commission Earned"];
    const rows = staffBreakdown.map(r => [
      r.staff.name,
      r.appointments.length,
      r.commissionableRev.toFixed(2),
      Number(r.staff.commissionRate || 0).toFixed(2) + "%",
      r.commissionEarned.toFixed(2),
    ]);
    const totRow = [
      "TOTAL",
      staffBreakdown.reduce((s, r) => s + r.appointments.length, 0),
      totals.commissionableRev.toFixed(2),
      totals.avgRate.toFixed(2) + "%",
      totals.commissionEarned.toFixed(2),
    ];
    const csv = [headers, ...rows, totRow]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `commission-report-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppLayout>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Commission Report</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Commission earned by staff on completed appointments.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={staffBreakdown.length === 0}
          onClick={handleExport}
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* ── Filters ── sized for touchscreens: tall fields, big tap targets ──── */}
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div className="space-y-1.5">
          <Label className="text-sm text-muted-foreground">Start Date</Label>
          <Input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="h-14 w-[210px] text-lg [&::-webkit-calendar-picker-indicator]:scale-150 [&::-webkit-calendar-picker-indicator]:mr-1"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm text-muted-foreground">End Date</Label>
          <Input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="h-14 w-[210px] text-lg [&::-webkit-calendar-picker-indicator]:scale-150 [&::-webkit-calendar-picker-indicator]:mr-1"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm text-muted-foreground">Staff</Label>
          <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
            <SelectTrigger className="h-14 w-[240px] text-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-base py-2.5">All Staff</SelectItem>
              {commissionStaff.map(s => (
                <SelectItem key={s.id} value={String(s.id)} className="text-base py-2.5">{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {commissionStaff.length === 0 && (
        <div className="mb-6 rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
          No staff members have commission enabled yet. Turn on commission for a staff member in Team &gt; Commissions to see them here.
        </div>
      )}

      {/* ── KPI Cards ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Commission Earned</p>
                <p className="text-2xl font-bold mt-1">{fmt(totals.commissionEarned)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {totals.commissionableRev > 0 ? `${totals.avgRate.toFixed(1)}% avg. rate` : undefined}
                </p>
              </div>
              <div className="rounded-full p-2 bg-indigo-500">
                <DollarSign className="h-5 w-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Commissionable Revenue</p>
                <p className="text-2xl font-bold mt-1">{fmt(totals.commissionableRev)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Excludes tips</p>
              </div>
              <div className="rounded-full p-2 bg-primary/10">
                <Percent className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed Appointments</p>
                <p className="text-2xl font-bold mt-1">{filteredAppts.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {staffBreakdown.length} staff member{staffBreakdown.length !== 1 ? "s" : ""} earned commission
                </p>
              </div>
              <div className="rounded-full p-2 bg-sky-100">
                <Scissors className="h-5 w-5 text-sky-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Per-Staff Breakdown ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Per-Staff Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {staffBreakdown.length === 0 ? (
            <div className="px-6 py-10 text-center text-muted-foreground text-sm">
              No commission-earning appointments found for this period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left font-medium px-4 py-3 w-8"></th>
                    <th className="text-left font-medium px-4 py-3">Staff Member</th>
                    <th className="text-right font-medium px-4 py-3">Appts</th>
                    <th className="text-right font-medium px-4 py-3">Commissionable Rev.</th>
                    <th className="text-right font-medium px-4 py-3">Rate</th>
                    <th className="text-right font-medium px-4 py-3 text-indigo-600">Commission Earned</th>
                  </tr>
                </thead>
                <tbody>
                  {staffBreakdown.map(row => {
                    const expanded = expandedIds.has(row.staff.id);
                    return (
                      <Fragment key={row.staff.id}>
                        <tr
                          className={cn(
                            "border-b cursor-pointer hover:bg-muted/40 transition-colors",
                            expanded && "bg-muted/30",
                          )}
                          onClick={() => toggleExpand(row.staff.id)}
                        >
                          <td className="px-4 py-3 text-muted-foreground">
                            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </td>
                          <td className="px-4 py-3 font-medium">
                            <div className="flex items-center gap-2">
                              {row.staff.avatarUrl ? (
                                <img src={row.staff.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                              ) : (
                                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                                  {row.staff.name.charAt(0)}
                                </div>
                              )}
                              <span>{row.staff.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">{row.appointments.length}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{fmt(row.commissionableRev)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{Number(row.staff.commissionRate || 0).toFixed(1)}%</td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-indigo-600">
                            {fmt(row.commissionEarned)}
                          </td>
                        </tr>

                        {expanded && row.appointments.map(apt => {
                          const f = calcCommission(apt, row.staff);
                          return (
                            <tr key={apt.id} className="bg-muted/20 border-b text-xs text-muted-foreground">
                              <td className="px-4 py-2"></td>
                              <td className="px-4 py-2 pl-12 italic">
                                {format(toStoreLocal(apt.date, timezone), "MMM d, h:mm a")} — {apt.service?.name || "Service"}
                              </td>
                              <td className="px-4 py-2 text-right"></td>
                              <td className="px-4 py-2 text-right tabular-nums">{fmt(f.commissionableRev)}</td>
                              <td className="px-4 py-2 text-right tabular-nums">{f.rate.toFixed(1)}%</td>
                              <td className="px-4 py-2 text-right tabular-nums font-medium text-indigo-500">
                                {fmt(f.commissionEarned)}
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-muted/30 font-semibold">
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {staffBreakdown.reduce((s, r) => s + r.appointments.length, 0)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.commissionableRev)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {totals.commissionableRev > 0 ? `${totals.avgRate.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-indigo-600">{fmt(totals.commissionEarned)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 rounded-md border border-dashed px-4 py-3 text-xs text-muted-foreground space-y-0.5">
        <p className="font-medium text-foreground/70">How commission is calculated</p>
        <p><strong>Commissionable Revenue</strong> = total collected on completed appointments, excluding tips.</p>
        <p><strong>Commission Earned</strong> = commissionable revenue × the staff member&apos;s commission rate.</p>
        <p>Only staff with commission enabled (Team &gt; Commissions) are included in this report.</p>
      </div>
    </AppLayout>
  );
}
