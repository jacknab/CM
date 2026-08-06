import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  format, startOfDay, endOfDay, subDays, addDays,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear,
  eachDayOfInterval, eachMonthOfInterval, subMonths,
} from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStaffList } from "@/hooks/use-staff";
import { useAppointments } from "@/hooks/use-appointments";
import { useSelectedStore } from "@/hooks/use-store";
import { toStoreLocal } from "@/lib/timezone";
import { isWithinInterval } from "date-fns";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  DollarSign, TrendingUp, Scissors, Download,
  ArrowUpRight, ArrowDownRight, ChevronDown, ChevronRight, Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Staff, AppointmentWithDetails } from "@shared/schema";

type ViewMode = "day" | "week" | "month" | "year" | "pay_period" | "custom";
type PeriodOption = { label: string; from: Date; to: Date };

type PayrollSettingsData = {
  frequency: string;
  weekStartDay: number;
  monthStartDay: number;
  semiMonthlyDay1: number;
  semiMonthlyDay2: number;
};
const PAYROLL_DEFAULTS: PayrollSettingsData = {
  frequency: "monthly", weekStartDay: 1, monthStartDay: 1,
  semiMonthlyDay1: 1, semiMonthlyDay2: 15,
};

function getCurrentPayPeriod(s: PayrollSettingsData): { from: Date; to: Date } {
  const now = new Date();
  const today = now.getDate();
  const month = now.getMonth();
  const year  = now.getFullYear();
  switch (s.frequency) {
    case "weekly": {
      const diff  = (now.getDay() - s.weekStartDay + 7) % 7;
      const start = startOfDay(subDays(now, diff));
      return { from: start, to: endOfDay(addDays(start, 6)) };
    }
    case "biweekly": {
      const diff = (now.getDay() - s.weekStartDay + 7) % 7;
      const thisWeekStart = startOfDay(subDays(now, diff));
      const ANCHOR = new Date(2025, 0, 6 + ((s.weekStartDay - 1 + 7) % 7));
      const daysSince = Math.floor((thisWeekStart.getTime() - ANCHOR.getTime()) / 864e5);
      const blockStart = startOfDay(addDays(ANCHOR, Math.floor(Math.floor(daysSince / 7) / 2) * 14));
      return { from: blockStart, to: endOfDay(addDays(blockStart, 13)) };
    }
    case "semimonthly": {
      const d1 = s.semiMonthlyDay1, d2 = s.semiMonthlyDay2;
      if (today < d1) {
        const pm = month === 0 ? 11 : month - 1;
        const py = month === 0 ? year - 1 : year;
        return { from: startOfDay(new Date(py, pm, d2)), to: endOfDay(new Date(year, month, d1 - 1)) };
      } else if (today < d2) {
        return { from: startOfDay(new Date(year, month, d1)), to: endOfDay(new Date(year, month, d2 - 1)) };
      } else {
        return { from: startOfDay(new Date(year, month, d2)), to: endOfDay(endOfMonth(now)) };
      }
    }
    default: {
      const sd = s.monthStartDay;
      return today >= sd
        ? { from: startOfDay(new Date(year, month, sd)),     to: endOfDay(new Date(year, month + 1, sd - 1)) }
        : { from: startOfDay(new Date(year, month - 1, sd)), to: endOfDay(new Date(year, month,     sd - 1)) };
    }
  }
}

function generatePeriodOptions(mode: ViewMode, s: PayrollSettingsData): PeriodOption[] {
  const now  = new Date();
  const opts: PeriodOption[] = [];

  if (mode === "day") {
    for (let i = 0; i < 30; i++) {
      const d = subDays(startOfDay(now), i);
      opts.push({
        label: i === 0 ? `Today (${format(d, "MMM d, yyyy")})` : format(d, "EEE, MMM d, yyyy"),
        from: d, to: endOfDay(d),
      });
    }
  } else if (mode === "week") {
    const wsd = ((s.weekStartDay % 7) as 0|1|2|3|4|5|6);
    for (let i = 0; i < 13; i++) {
      const a = subDays(now, i * 7);
      const wf = startOfWeek(a, { weekStartsOn: wsd });
      const wt = endOfWeek(a,   { weekStartsOn: wsd });
      opts.push({
        label: i === 0
          ? `This Week (${format(wf, "MMM d")} – ${format(wt, "MMM d, yyyy")})`
          : `${format(wf, "MMM d")} – ${format(wt, "MMM d, yyyy")}`,
        from: wf, to: wt,
      });
    }
  } else if (mode === "month") {
    for (let i = 0; i < 13; i++) {
      const d = subMonths(now, i);
      opts.push({
        label: i === 0 ? `This Month (${format(d, "MMMM yyyy")})` : format(d, "MMMM yyyy"),
        from: startOfMonth(d), to: endOfMonth(d),
      });
    }
  } else if (mode === "year") {
    const y = now.getFullYear();
    for (let i = 0; i < 3; i++) {
      const yr = new Date(y - i, 0, 1);
      opts.push({
        label: i === 0 ? `This Year (${y - i})` : String(y - i),
        from: startOfYear(yr), to: endOfYear(yr),
      });
    }
  } else if (mode === "pay_period") {
    const count = s.frequency === "weekly" ? 26
      : s.frequency === "biweekly" ? 26
      : s.frequency === "semimonthly" ? 24
      : 13;
    let { from: cf, to: ct } = getCurrentPayPeriod(s);
    for (let i = 0; i < count; i++) {
      opts.push({
        label: i === 0
          ? `Current: ${format(cf, "MMM d")} – ${format(ct, "MMM d, yyyy")}`
          : `${format(cf, "MMM d")} – ${format(ct, "MMM d, yyyy")}`,
        from: cf, to: ct,
      });
      // Walk backward one period
      const newTo = endOfDay(subDays(cf, 1));
      if (s.frequency === "weekly") {
        cf = startOfDay(subDays(cf, 7));
        ct = endOfDay(addDays(cf, 6));
      } else if (s.frequency === "biweekly") {
        cf = startOfDay(subDays(cf, 14));
        ct = endOfDay(addDays(cf, 13));
      } else if (s.frequency === "semimonthly") {
        const d1 = s.semiMonthlyDay1, d2 = s.semiMonthlyDay2;
        const endDay = newTo.getDate();
        if (endDay === d1 - 1) {
          const pm = newTo.getMonth() === 0 ? 11 : newTo.getMonth() - 1;
          const py = newTo.getMonth() === 0 ? newTo.getFullYear() - 1 : newTo.getFullYear();
          cf = startOfDay(new Date(py, pm, d2));
        } else {
          cf = startOfDay(new Date(newTo.getFullYear(), newTo.getMonth(), d1));
        }
        ct = newTo;
      } else {
        const sd = s.monthStartDay;
        cf = startOfDay(new Date(cf.getFullYear(), cf.getMonth() - 1, sd));
        ct = newTo;
      }
    }
  }
  return opts;
}

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(cur: number, prev: number) {
  if (!prev) return cur > 0 ? 100 : 0;
  return ((cur - prev) / prev) * 100;
}

const COLORS = {
  business: "#6366f1",
  staffCost: "#f59e0b",
  gross:     "#e0e7ff",
};

// ─── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  title, value, sub, icon: Icon, trend, trendLabel, accentBg, accentText,
}: {
  title: string; value: string; sub?: string;
  icon: React.ElementType; trend?: number; trendLabel?: string;
  accentBg?: string; accentText?: string;
}) {
  const up = trend !== undefined && trend >= 0;
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={cn("rounded-full p-2", accentBg ?? "bg-primary/10")}>
            <Icon className={cn("h-5 w-5", accentText ?? "text-primary")} />
          </div>
        </div>
        {trend !== undefined && (
          <div className={cn("flex items-center gap-1 mt-3 text-xs font-medium", up ? "text-green-600" : "text-red-500")}>
            {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(trend).toFixed(1)}% {trendLabel ?? "vs prior period"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function SalonEarningsReport() {
  const { selectedStore } = useSelectedStore();
  const timezone = selectedStore?.timezone || "UTC";

  const { data: staffList = [] } = useStaffList();
  const { data: appointments = [] } = useAppointments();

  const [viewMode, setViewMode]   = useState<ViewMode>("month");
  const [periodIdx, setPeriodIdx] = useState(0);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo]     = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const now = new Date();

  const { data: payrollSettings } = useQuery<PayrollSettingsData>({
    queryKey: ["/api/payroll-settings", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return PAYROLL_DEFAULTS;
      const res = await fetch(`/api/payroll-settings/${selectedStore.id}`, { credentials: "include" });
      if (!res.ok) return PAYROLL_DEFAULTS;
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const settings = payrollSettings ?? PAYROLL_DEFAULTS;

  const periodOptions = useMemo<PeriodOption[]>(
    () => viewMode === "custom" ? [] : generatePeriodOptions(viewMode, settings),
    [viewMode, settings],
  );

  function handleViewModeChange(mode: ViewMode) {
    setViewMode(mode);
    setPeriodIdx(0);
  }

  const { from, to } = useMemo(() => {
    if (viewMode === "custom") {
      return {
        from: customFrom ? startOfDay(new Date(customFrom)) : subDays(now, 30),
        to:   customTo   ? endOfDay(new Date(customTo))     : endOfDay(now),
      };
    }
    const sel = periodOptions[periodIdx] ?? periodOptions[0];
    return sel
      ? { from: sel.from, to: sel.to }
      : { from: startOfMonth(now), to: endOfMonth(now) };
  }, [viewMode, periodIdx, periodOptions, customFrom, customTo]);

  const isLong = useMemo(
    () => (to.getTime() - from.getTime()) > 60 * 86_400_000,
    [from, to],
  );

  const prevFrom = useMemo(() => {
    const ms = to.getTime() - from.getTime();
    return new Date(from.getTime() - ms);
  }, [from, to]);
  const prevTo = useMemo(() => new Date(from.getTime() - 1), [from]);

  const completedAppts = useMemo(() =>
    (appointments as AppointmentWithDetails[]).filter(a => {
      if (a.status !== "completed") return false;
      const d = toStoreLocal(a.date, timezone);
      return isWithinInterval(d, { start: from, end: to });
    }),
  [appointments, from, to, timezone]);

  const prevAppts = useMemo(() =>
    (appointments as AppointmentWithDetails[]).filter(a => {
      if (a.status !== "completed") return false;
      const d = toStoreLocal(a.date, timezone);
      return isWithinInterval(d, { start: prevFrom, end: prevTo });
    }),
  [appointments, prevFrom, prevTo, timezone]);

  // ── Per-appointment financial breakdown ─────────────────────────────────────
  // "Revenue Brought In" = totalPaid (everything the client paid, including tips)
  // "Business Cut" = gross minus staff commission (tips pass through directly to staff,
  //                  commission is deducted from service+addon revenue)
  function calcApptFinancials(apt: AppointmentWithDetails, member: Staff | undefined) {
    const totalPaid   = Number((apt as any).totalPaid  || 0);
    const tipAmount   = Number((apt as any).tipAmount  || 0);
    const addonRev    = (apt.appointmentAddons || []).reduce((s, aa) => s + Number(aa.addon?.price || 0), 0);
    // Commissionable revenue = everything except tips; floored at 0.
    // addonRev is already embedded in totalPaid — do NOT fall back to it when
    // totalPaid is 0, or appointments with unpaid add-ons would show a business
    // cut while revenue shows "—" (the bug visible in the per-staff table).
    const commissionableRev = Math.max(0, totalPaid - tipAmount);
    const rate              = member?.commissionEnabled ? Number(member.commissionRate || 0) : 0;
    const commissionPaid    = commissionableRev * (rate / 100);
    // Business cut = commissionable revenue minus what staff earns on it
    // Tips pass through to staff and are NOT included in business cut
    const businessCut       = commissionableRev - commissionPaid;
    return { totalPaid, tipAmount, addonRev, commissionableRev, commissionPaid, businessCut, rate };
  }

  // ── Staff-by-staff breakdown ─────────────────────────────────────────────────
  const staffBreakdown = useMemo(() => {
    const map = new Map<number, {
      staff: Staff;
      appointments: AppointmentWithDetails[];
      grossRevenue: number;     // sum of totalPaid
      businessCut: number;      // what the salon keeps
    }>();

    (staffList as Staff[]).forEach(s => {
      map.set(s.id, { staff: s, appointments: [], grossRevenue: 0, businessCut: 0 });
    });

    completedAppts.forEach(apt => {
      const member = (staffList as Staff[]).find(s => s.id === (apt as any).staffId);
      const row    = member ? map.get(member.id) : undefined;
      if (!row) return;
      const f = calcApptFinancials(apt, member);
      row.appointments.push(apt);
      row.grossRevenue += f.totalPaid;
      row.businessCut  += f.businessCut;
    });

    return Array.from(map.values())
      .filter(r => r.appointments.length > 0)
      .sort((a, b) => b.businessCut - a.businessCut);
  }, [completedAppts, staffList]);

  // ── Totals ───────────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    let grossRevenue = 0;
    let businessCut  = 0;
    completedAppts.forEach(apt => {
      const member = (staffList as Staff[]).find(s => s.id === (apt as any).staffId);
      const f = calcApptFinancials(apt, member);
      grossRevenue += f.totalPaid;
      businessCut  += f.businessCut;
    });
    const staffCost = grossRevenue - businessCut;  // commissions + tips combined
    const margin    = grossRevenue > 0 ? (businessCut / grossRevenue) * 100 : 0;
    return { grossRevenue, businessCut, staffCost, margin };
  }, [completedAppts, staffList]);

  const prevTotals = useMemo(() => {
    let grossRevenue = 0;
    let businessCut  = 0;
    prevAppts.forEach(apt => {
      const member = (staffList as Staff[]).find(s => s.id === (apt as any).staffId);
      const f = calcApptFinancials(apt, member);
      grossRevenue += f.totalPaid;
      businessCut  += f.businessCut;
    });
    return { grossRevenue, businessCut };
  }, [prevAppts, staffList]);

  // ── Chart: earnings over time ────────────────────────────────────────────────
  const earningsOverTime = useMemo(() => {
    if (isLong) {
      const months = eachMonthOfInterval({ start: subMonths(now, 11), end: now });
      return months.map(m => {
        const label = format(m, "MMM yy");
        let gross = 0; let business = 0;
        completedAppts
          .filter(a => format(toStoreLocal(a.date, timezone), "MMM yy") === label)
          .forEach(apt => {
            const member = (staffList as Staff[]).find(s => s.id === (apt as any).staffId);
            const f = calcApptFinancials(apt, member);
            gross    += f.totalPaid;
            business += f.businessCut;
          });
        return { date: label, gross: +gross.toFixed(2), business: +business.toFixed(2) };
      });
    }
    return eachDayOfInterval({ start: from, end: to }).map(day => {
      const key   = format(day, "yyyy-MM-dd");
      const label = format(day, "MMM d");
      let gross = 0; let business = 0;
      completedAppts
        .filter(a => format(toStoreLocal(a.date, timezone), "yyyy-MM-dd") === key)
        .forEach(apt => {
          const member = (staffList as Staff[]).find(s => s.id === (apt as any).staffId);
          const f = calcApptFinancials(apt, member);
          gross    += f.totalPaid;
          business += f.businessCut;
        });
      return { date: label, gross: +gross.toFixed(2), business: +business.toFixed(2) };
    });
  }, [completedAppts, staffList, from, to, timezone, isLong]);

  // ── Pie: business earnings vs staff costs ────────────────────────────────────
  const splitData = useMemo(() => [
    { name: "Business Earnings", value: +Math.max(0, totals.businessCut).toFixed(2), color: COLORS.business },
    { name: "Staff Costs",       value: +Math.max(0, totals.staffCost).toFixed(2),   color: COLORS.staffCost },
  ].filter(d => d.value > 0), [totals]);

  // ── CSV Export ───────────────────────────────────────────────────────────────
  function handleExport() {
    const headers = ["Staff", "Appointments", "Revenue Brought In", "Business Cut", "Business Cut %"];
    const rows = staffBreakdown.map(r => {
      const cutPct = r.grossRevenue > 0 ? ((r.businessCut / r.grossRevenue) * 100).toFixed(1) : "0.0";
      return [r.staff.name, r.appointments.length, r.grossRevenue.toFixed(2), r.businessCut.toFixed(2), cutPct + "%"];
    });
    const totalCutPct = totals.grossRevenue > 0 ? ((totals.businessCut / totals.grossRevenue) * 100).toFixed(1) : "0.0";
    const totRow = [
      "TOTAL",
      staffBreakdown.reduce((s, r) => s + r.appointments.length, 0),
      totals.grossRevenue.toFixed(2),
      totals.businessCut.toFixed(2),
      totalCutPct + "%",
    ];
    const csv = [headers, ...rows, totRow]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `salon-earnings-${format(from, "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toggleExpand(id: number) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const grossTrend    = pct(totals.grossRevenue, prevTotals.grossRevenue);
  const businessTrend = pct(totals.businessCut,  prevTotals.businessCut);

  const periodLabel = viewMode === "custom"
    ? `${format(from, "MMM d")} – ${format(to, "MMM d, yyyy")}`
    : (periodOptions[periodIdx]?.label ?? `${format(from, "MMM d")} – ${format(to, "MMM d, yyyy")}`);

  const VIEW_MODE_LABELS: Record<ViewMode, string> = {
    day: "Day", week: "Week", month: "Month", year: "Year",
    pay_period: "Pay Period", custom: "Custom Range",
  };

  return (
    <AppLayout>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Salon Earnings Report</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Revenue your business keeps from completed appointments.
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

      {/* ── Period filter ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        {/* View By */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">View By</Label>
          <Select value={viewMode} onValueChange={v => handleViewModeChange(v as ViewMode)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue>{VIEW_MODE_LABELS[viewMode]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
              <SelectItem value="year">Year</SelectItem>
              <SelectItem value="pay_period">Pay Period</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Period selector — hidden for custom */}
        {viewMode !== "custom" && periodOptions.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              {viewMode === "pay_period" ? `Period (${settings.frequency})` : "Select Period"}
            </Label>
            <Select
              value={String(periodIdx)}
              onValueChange={v => setPeriodIdx(Number(v))}
            >
              <SelectTrigger className="w-[260px]">
                <SelectValue>{periodOptions[periodIdx]?.label}</SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {periodOptions.map((opt, i) => (
                  <SelectItem key={i} value={String(i)}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Custom date pickers */}
        {viewMode === "custom" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="w-[155px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="w-[155px]" />
            </div>
          </>
        )}

        <Badge variant="secondary" className="no-default-active-elevate mb-0.5">{periodLabel}</Badge>
      </div>

      {/* ── KPI Cards (3 cards: Gross, Appointments, Business Earnings) ─────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          title="Gross Revenue"
          value={fmt(totals.grossRevenue)}
          sub={`${completedAppts.length} completed appointment${completedAppts.length !== 1 ? "s" : ""}`}
          icon={DollarSign}
          trend={grossTrend}
        />
        <StatCard
          title="Active Staff This Period"
          value={String(staffBreakdown.length)}
          sub={staffBreakdown.length > 0
            ? `${fmt(totals.grossRevenue / Math.max(1, staffBreakdown.length))} avg per staff`
            : undefined}
          icon={Scissors}
          accentBg="bg-sky-100"
          accentText="text-sky-600"
        />
        <StatCard
          title="Business Earnings"
          value={fmt(totals.businessCut)}
          sub={totals.grossRevenue > 0 ? `${totals.margin.toFixed(1)}% of gross revenue` : undefined}
          icon={Building2}
          accentBg="bg-indigo-500"
          accentText="text-white"
          trend={businessTrend}
        />
      </div>

      {/* ── Charts ──────────────────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-6 mb-8">

        {/* Earnings over time */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Business Earnings Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            {earningsOverTime.every(d => d.gross === 0) ? (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                No completed appointments in this period.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={earningsOverTime} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="grossGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#c7d2fe" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#c7d2fe" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="bizGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={COLORS.business} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={COLORS.business} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                  <Tooltip
                    formatter={(val: number, name: string) => [
                      fmt(val),
                      name === "gross" ? "Total Revenue" : "Business Earnings",
                    ]}
                    labelClassName="font-medium"
                  />
                  <Legend
                    formatter={v => v === "gross" ? "Total Revenue" : "Business Earnings"}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="gross"    stroke="#a5b4fc" fill="url(#grossGrad)" strokeWidth={1.5} strokeDasharray="4 3" />
                  <Area type="monotone" dataKey="business" stroke={COLORS.business} fill="url(#bizGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Earnings split donut */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Earnings Split</CardTitle>
          </CardHeader>
          <CardContent>
            {splitData.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                No data yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={splitData}
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={82}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {splitData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
            {totals.grossRevenue > 0 && (
              <div className="text-center -mt-2">
                <p className="text-xs text-muted-foreground">Business margin</p>
                <p className="text-lg font-bold text-indigo-600">{totals.margin.toFixed(1)}%</p>
              </div>
            )}
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
              No completed appointments found for this period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left font-medium px-4 py-3 w-8"></th>
                    <th className="text-left font-medium px-4 py-3">Staff Member</th>
                    <th className="text-right font-medium px-4 py-3">Appts</th>
                    <th className="text-right font-medium px-4 py-3">Revenue Brought In</th>
                    <th className="text-right font-medium px-4 py-3 text-indigo-600">Business Cut</th>
                  </tr>
                </thead>
                <tbody>
                  {staffBreakdown.map(row => {
                    const expanded = expandedIds.has(row.staff.id);
                    const cutPct   = row.grossRevenue > 0
                      ? ((row.businessCut / row.grossRevenue) * 100).toFixed(1)
                      : "0.0";

                    return (
                      <>
                        <tr
                          key={row.staff.id}
                          className={cn(
                            "border-b cursor-pointer hover:bg-muted/40 transition-colors",
                            expanded && "bg-muted/30",
                          )}
                          onClick={() => toggleExpand(row.staff.id)}
                        >
                          <td className="px-4 py-3 text-muted-foreground">
                            {expanded
                              ? <ChevronDown className="h-4 w-4" />
                              : <ChevronRight className="h-4 w-4" />}
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
                          <td className="px-4 py-3 text-right tabular-nums">{fmt(row.grossRevenue)}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-indigo-600">
                            {fmt(row.businessCut)}
                            <span className="ml-1 text-xs font-normal text-muted-foreground">({cutPct}%)</span>
                          </td>
                        </tr>

                        {/* Expanded: individual appointment rows */}
                        {expanded && row.appointments.map(apt => {
                          const f = calcApptFinancials(apt, row.staff);
                          // Only show appointments that have some payment recorded
                          const hasRevenue = f.totalPaid > 0 || f.addonRev > 0;
                          return (
                            <tr
                              key={apt.id}
                              className={cn(
                                "bg-muted/20 border-b text-xs text-muted-foreground",
                                !hasRevenue && "opacity-50",
                              )}
                            >
                              <td className="px-4 py-2"></td>
                              <td className="px-4 py-2 pl-12 italic">
                                {format(toStoreLocal(apt.date, timezone), "MMM d, h:mm a")} — {apt.service?.name || "Service"}
                                {!hasRevenue && (
                                  <span className="ml-2 text-amber-500 not-italic">(no payment recorded)</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right"></td>
                              <td className="px-4 py-2 text-right tabular-nums">
                                {f.totalPaid > 0 ? fmt(f.totalPaid) : "—"}
                              </td>
                              <td className="px-4 py-2 text-right tabular-nums font-medium text-indigo-500">
                                {f.businessCut > 0 ? fmt(f.businessCut) : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </>
                    );
                  })}
                </tbody>

                {/* Totals row */}
                <tfoot>
                  <tr className="border-t-2 bg-muted/30 font-semibold">
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-right tabular-nums">{completedAppts.length}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.grossRevenue)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-indigo-600">
                      {fmt(totals.businessCut)}
                      {totals.grossRevenue > 0 && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          ({totals.margin.toFixed(1)}%)
                        </span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── How this is calculated ───────────────────────────────────────────── */}
      <div className="mt-4 rounded-md border border-dashed px-4 py-3 text-xs text-muted-foreground space-y-0.5">
        <p className="font-medium text-foreground/70">How business earnings are calculated</p>
        <p><strong>Revenue Brought In</strong> = total collected from clients on completed appointments (including tips).</p>
        <p><strong>Business Cut</strong> = revenue minus the staff member&apos;s commission on service + add-on revenue. Tips pass through directly to staff and are not included in the business cut.</p>
        <p>Staff on salary/hourly have no commission deduction — their fixed pay cost is tracked separately in Payroll.</p>
      </div>
    </AppLayout>
  );
}
