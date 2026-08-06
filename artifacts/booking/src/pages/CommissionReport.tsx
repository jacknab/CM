import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStaffList } from "@/hooks/use-staff";
import { useAppointments } from "@/hooks/use-appointments";
import { useSelectedStore } from "@/hooks/use-store";
import { formatInTz, toStoreLocal } from "@/lib/timezone";
import { isWithinInterval, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { DollarSign, Users, FileText, ChevronRight, ChevronDown, Download, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Staff, AppointmentWithDetails } from "@shared/schema";

// Processing fee constants (same as industry standard: 3.5% + $0.05 per transaction)
const PROCESSING_FEE_RATE = 0.035;
const PROCESSING_FEE_FLAT = 0.05;

type CalcMode = "total_price" | "net_sales";
type DateRange = "current_pay_period" | "this_week" | "last_week" | "this_month" | "last_month" | "custom";

type PayrollSettingsData = {
  frequency: string;
  weekStartDay: number;
  monthStartDay: number;
  semiMonthlyDay1: number;
  semiMonthlyDay2: number;
};

function getCurrentPayPeriod(s: PayrollSettingsData): { from: Date; to: Date } {
  const now = new Date();
  const today = now.getDate();
  const month = now.getMonth();
  const year = now.getFullYear();

  switch (s.frequency) {
    case "weekly": {
      const diff = (now.getDay() - s.weekStartDay + 7) % 7;
      const start = startOfDay(subDays(now, diff));
      return { from: start, to: endOfDay(addDays(start, 6)) };
    }
    case "biweekly": {
      const diff = (now.getDay() - s.weekStartDay + 7) % 7;
      const thisWeekStart = startOfDay(subDays(now, diff));
      const ANCHOR = new Date(2025, 0, 6 + ((s.weekStartDay - 1 + 7) % 7));
      const msPerDay = 864e5;
      const daysSinceAnchor = Math.floor((thisWeekStart.getTime() - ANCHOR.getTime()) / msPerDay);
      const weeksSinceAnchor = Math.floor(daysSinceAnchor / 7);
      const biweeklyBlock = Math.floor(weeksSinceAnchor / 2);
      const start = startOfDay(addDays(ANCHOR, biweeklyBlock * 14));
      return { from: start, to: endOfDay(addDays(start, 13)) };
    }
    case "semimonthly": {
      const d1 = s.semiMonthlyDay1;
      const d2 = s.semiMonthlyDay2;
      if (today < d1) {
        const prevM = month === 0 ? 11 : month - 1;
        const prevY = month === 0 ? year - 1 : year;
        return {
          from: startOfDay(new Date(prevY, prevM, d2)),
          to: endOfDay(new Date(year, month, d1 - 1)),
        };
      } else if (today < d2) {
        return {
          from: startOfDay(new Date(year, month, d1)),
          to: endOfDay(new Date(year, month, d2 - 1)),
        };
      } else {
        return {
          from: startOfDay(new Date(year, month, d2)),
          to: endOfDay(endOfMonth(now)),
        };
      }
    }
    case "monthly":
    default: {
      const sd = s.monthStartDay;
      if (today >= sd) {
        return {
          from: startOfDay(new Date(year, month, sd)),
          to: endOfDay(new Date(year, month + 1, sd - 1)),
        };
      } else {
        return {
          from: startOfDay(new Date(year, month - 1, sd)),
          to: endOfDay(new Date(year, month, sd - 1)),
        };
      }
    }
  }
}

const PAYROLL_DEFAULTS: PayrollSettingsData = {
  frequency: "monthly", weekStartDay: 1, monthStartDay: 1, semiMonthlyDay1: 1, semiMonthlyDay2: 15,
};

/** Calculate the payment processing fee for a given post-discount amount */
function calcProcessingFee(postDiscountAmount: number): number {
  if (postDiscountAmount <= 0) return 0;
  return postDiscountAmount * PROCESSING_FEE_RATE + PROCESSING_FEE_FLAT;
}

export default function CommissionReport() {
  const { selectedStore } = useSelectedStore();
  const timezone = selectedStore?.timezone || "UTC";
  const payoutFrequency = selectedStore?.commissionPayoutFrequency || "monthly";

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

  const { data: staffList = [] } = useStaffList();
  const { data: appointments = [] } = useAppointments();

  const [calcMode, setCalcMode] = useState<CalcMode>("total_price");
  const [dateRange, setDateRange] = useState<DateRange>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState<string>("all");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const now = new Date();
  const { from, to } = useMemo(() => {
    switch (dateRange) {
      case "current_pay_period":
        return getCurrentPayPeriod(payrollSettings ?? PAYROLL_DEFAULTS);
      case "this_week":
        return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
      case "last_week": {
        const lastWeekStart = startOfWeek(subDays(now, 7), { weekStartsOn: 1 });
        return { from: lastWeekStart, to: endOfWeek(lastWeekStart, { weekStartsOn: 1 }) };
      }
      case "this_month":
        return { from: startOfMonth(now), to: endOfMonth(now) };
      case "last_month": {
        const lastMonthStart = startOfMonth(subDays(startOfMonth(now), 1));
        return { from: lastMonthStart, to: endOfMonth(lastMonthStart) };
      }
      case "custom":
        return {
          from: customFrom ? startOfDay(new Date(customFrom)) : subDays(now, 30),
          to: customTo ? endOfDay(new Date(customTo)) : now,
        };
      default:
        return { from: startOfMonth(now), to: endOfMonth(now) };
    }
  }, [dateRange, customFrom, customTo, payrollSettings]);

  const commissionStaff = staffList.filter((s: Staff) => s.commissionEnabled);

  const staffCommissions = useMemo(() => {
    const targetStaff = selectedStaffId === "all"
      ? commissionStaff
      : commissionStaff.filter((s: Staff) => s.id === Number(selectedStaffId));

    return targetStaff.map((member: Staff) => {
      const staffAppointments = appointments.filter((apt: AppointmentWithDetails) => {
        if (apt.staffId !== member.id) return false;
        if (apt.status !== "completed") return false;
        const aptDate = toStoreLocal(apt.date, timezone);
        return isWithinInterval(aptDate, { start: from, end: to });
      });

      // Per-appointment calculations — keyed by apt.id so sorting never mis-aligns data.
      const commissionRate = Number(member.commissionRate || 0) / 100;
      const aptDataById = new Map<number, {
        serviceRevenue: number; addonRevenue: number; discountAmt: number;
        grossRevenue: number; postDiscount: number; processingFee: number;
        tipAmount: number; totalPriceComm: number; netSalesComm: number;
      }>();

      for (const apt of staffAppointments) {
        const totalPaid    = Number((apt as any).totalPaid    || 0);
        const tipAmount    = Number((apt as any).tipAmount    || 0);
        const discountAmt  = Number((apt as any).discountAmount || 0);
        const addonRevenue = apt.appointmentAddons?.reduce((s: number, aa: { addon?: { price?: unknown } | null }) => s + Number(aa.addon?.price || 0), 0) || 0;

        // Prefer actual collected amount (minus tip and addons) over catalog price
        const serviceRevenue = totalPaid > 0
          ? Math.max(0, totalPaid - tipAmount - addonRevenue)
          : Number(apt.service?.price || 0);

        const grossRevenue  = serviceRevenue + addonRevenue;
        const postDiscount  = Math.max(0, grossRevenue - discountAmt);
        const processingFee = calcProcessingFee(postDiscount);
        const totalPriceComm = postDiscount * commissionRate;
        const netSalesComm   = Math.max(0, totalPriceComm - processingFee);

        aptDataById.set(apt.id, {
          serviceRevenue, addonRevenue, discountAmt,
          grossRevenue, postDiscount, processingFee,
          tipAmount, totalPriceComm, netSalesComm,
        });
      }

      const aptValues = Array.from(aptDataById.values());
      const totalServiceRevenue  = aptValues.reduce((s, d) => s + d.serviceRevenue, 0);
      const totalAddonRevenue    = aptValues.reduce((s, d) => s + d.addonRevenue, 0);
      const totalDiscount        = aptValues.reduce((s, d) => s + d.discountAmt, 0);
      const totalGrossRevenue    = aptValues.reduce((s, d) => s + d.grossRevenue, 0);
      const totalPostDiscount    = aptValues.reduce((s, d) => s + d.postDiscount, 0);
      const totalProcessingFees  = aptValues.reduce((s, d) => s + d.processingFee, 0);
      // Tips are NEVER included in commission base — 100% goes to staff member
      const totalTips            = aptValues.reduce((s, d) => s + d.tipAmount, 0);
      const totalPriceCommission = aptValues.reduce((s, d) => s + d.totalPriceComm, 0);
      const netSalesCommission   = aptValues.reduce((s, d) => s + d.netSalesComm, 0);

      const activeCommission = calcMode === "net_sales" ? netSalesCommission : totalPriceCommission;
      const totalTipsAndCommission = totalTips + activeCommission;

      return {
        staff: member,
        appointments: staffAppointments,
        appointmentCount: staffAppointments.length,
        commissionRate: Number(member.commissionRate || 0),
        totalServiceRevenue,
        totalAddonRevenue,
        totalDiscount,
        totalGrossRevenue,
        totalPostDiscount,
        totalProcessingFees,
        totalTips,
        totalPriceCommission,
        netSalesCommission,
        activeCommission,
        totalTipsAndCommission,
        aptDataById,
      };
    });
  }, [commissionStaff, appointments, selectedStaffId, from, to, timezone, calcMode]);

  const totalCommissions       = staffCommissions.reduce((sum, sc) => sum + sc.activeCommission, 0);
  const totalTips              = staffCommissions.reduce((sum, sc) => sum + sc.totalTips, 0);
  const totalTipsAndCommissions = staffCommissions.reduce((sum, sc) => sum + sc.totalTipsAndCommission, 0);
  const totalGrossRevenue      = staffCommissions.reduce((sum, sc) => sum + sc.totalGrossRevenue, 0);
  const totalDiscounts         = staffCommissions.reduce((sum, sc) => sum + sc.totalDiscount, 0);
  const totalProcessingFees    = staffCommissions.reduce((sum, sc) => sum + sc.totalProcessingFees, 0);

  function toggleExpand(staffId: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      return next;
    });
  }

  function handleExportCSV() {
    // Summary CSV mirrors the document's described columns (O = Total Price, P = Net Sales)
    const summaryHeaders = [
      "Staff Member",
      "Commission Rate (%)",
      "Appointments",
      "Service Revenue ($)",
      "Add-on Revenue ($)",
      "Discounts ($)",
      "Post-Discount Revenue ($)",
      "Processing Fees ($)",
      "Card Tips ($)",
      "Commission – Total Price ($)",   // Column O equivalent
      "Commission – Net Sales ($)",     // Column P equivalent
      "Tips + Commission Total ($)",
    ];
    const summaryRows = staffCommissions.map(sc => [
      sc.staff.name,
      sc.commissionRate,
      sc.appointmentCount,
      sc.totalServiceRevenue.toFixed(2),
      sc.totalAddonRevenue.toFixed(2),
      sc.totalDiscount.toFixed(2),
      sc.totalPostDiscount.toFixed(2),
      sc.totalProcessingFees.toFixed(2),
      sc.totalTips.toFixed(2),
      sc.totalPriceCommission.toFixed(2),
      sc.netSalesCommission.toFixed(2),
      sc.totalTipsAndCommission.toFixed(2),
    ]);

    // Detailed CSV — one row per appointment
    const detailHeaders = [
      "Date",         // Col A equivalent (use for rate-change lookups)
      "Staff Member",
      "Commission Rate (%)",
      "Client",
      "Service",
      "Add-ons",
      "Service Price ($)",   // Col G equivalent
      "Add-on Price ($)",
      "Gross Revenue ($)",
      "Processing Fee ($)",  // Col J equivalent
      "Discount ($)",        // Col K equivalent
      "Post-Discount Revenue ($)",
      "Card Tip ($)",        // Col N equivalent
      "Commission – Total Price ($)",   // Col O equivalent
      "Commission – Net Sales ($)",     // Col P equivalent
      "Tip + Commission Total ($)",
    ];
    const detailRows: (string | number)[][] = [];
    staffCommissions.forEach((sc, si) => {
      sc.appointments
        .slice()
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .forEach((apt: AppointmentWithDetails) => {
          const d = sc.aptDataById.get(apt.id);
          if (!d) return;
          const addonNames = apt.appointmentAddons?.map((aa) => aa.addon?.name).filter(Boolean).join("; ") || "";
          detailRows.push([
            formatInTz(apt.date, timezone, "yyyy-MM-dd"),
            sc.staff.name,
            sc.commissionRate,
            (apt as any).customer?.fullName || (apt as any).customer?.name || (apt as any).customerName || "Walk-in",
            apt.service?.name || "",
            addonNames,
            d.serviceRevenue.toFixed(2),
            d.addonRevenue.toFixed(2),
            d.grossRevenue.toFixed(2),
            d.processingFee.toFixed(2),
            d.discountAmt.toFixed(2),
            d.postDiscount.toFixed(2),
            d.tipAmount.toFixed(2),
            d.totalPriceComm.toFixed(2),
            d.netSalesComm.toFixed(2),
            (d.tipAmount + (calcMode === "net_sales" ? d.netSalesComm : d.totalPriceComm)).toFixed(2),
          ]);
        });
    });

    const toCSV = (headers: (string | number)[], rows: (string | number)[][]) =>
      [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");

    const summaryCSV = toCSV(summaryHeaders, summaryRows);
    const detailCSV  = toCSV(detailHeaders, detailRows);
    const combined   = `SUMMARY REPORT\n${summaryCSV}\n\nDETAILED REPORT\n${detailCSV}`;

    const blob = new Blob([combined], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `commissions-report-${format(from, "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppLayout>
      {/* ── Header ── */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Commission Earnings Report</h1>
          <div className="text-muted-foreground text-sm mt-1">
            Track staff commissions based on completed services.
            Payout frequency: <Badge variant="secondary" className="no-default-active-elevate ml-1 capitalize">{payoutFrequency}</Badge>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={staffCommissions.length === 0 || staffCommissions.every(sc => sc.appointmentCount === 0)}
          onClick={handleExportCSV}
        >
          <Download className="h-4 w-4" />
          Export CSV (Summary + Detailed)
        </Button>
      </div>

      {/* ── Exclusion notice ── */}
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 mb-5 text-sm text-amber-800 flex gap-2">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
        <div>
          <span className="font-semibold">Commission is not calculated on:</span>{" "}
          tips/gratuity (100% goes to the team member), custom checkout items, or initial package sales.
          Commission is earned on service and add-on sales only.
          {calcMode === "net_sales" && (
            <span className="block mt-0.5">
              <span className="font-semibold">Net Sales mode</span> deducts the payment processing fee
              ({(PROCESSING_FEE_RATE * 100).toFixed(1)}% + ${PROCESSING_FEE_FLAT.toFixed(2)} per transaction) from each commission amount.
            </span>
          )}
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-end gap-4 mb-6">
        {/* Calculation Mode */}
        <div className="space-y-1">
          <Label className="text-xs">Commission Basis</Label>
          <div className="flex rounded-md border overflow-hidden text-sm">
            <button
              className={cn(
                "px-3 py-1.5 transition-colors",
                calcMode === "total_price"
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-background text-muted-foreground hover:bg-muted",
              )}
              onClick={() => setCalcMode("total_price")}
              title="Commission on (price − discount) × rate"
            >
              Total Price
            </button>
            <button
              className={cn(
                "px-3 py-1.5 border-l transition-colors",
                calcMode === "net_sales"
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-background text-muted-foreground hover:bg-muted",
              )}
              onClick={() => setCalcMode("net_sales")}
              title="Commission after deducting payment processing fees"
            >
              Net Sales
            </button>
          </div>
        </div>

        {/* Period */}
        <div className="space-y-1">
          <Label className="text-xs">Period</Label>
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="w-[180px]" data-testid="select-commission-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current_pay_period">Current Pay Period</SelectItem>
              <SelectItem value="this_week">This Week</SelectItem>
              <SelectItem value="last_week">Last Week</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {dateRange === "custom" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-[160px]"
                data-testid="input-commission-from"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-[160px]"
                data-testid="input-commission-to"
              />
            </div>
          </>
        )}

        {/* Staff Filter */}
        <div className="space-y-1">
          <Label className="text-xs">Staff</Label>
          <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
            <SelectTrigger className="w-[180px]" data-testid="select-commission-staff">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Commission Staff</SelectItem>
              {commissionStaff.map((s: Staff) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10">
              <DollarSign className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Gross Revenue</p>
              <p className="text-xl font-bold" data-testid="text-total-revenue">${totalGrossRevenue.toFixed(2)}</p>
              {totalDiscounts > 0 && (
                <p className="text-xs text-rose-500">−${totalDiscounts.toFixed(2)} discounts</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-green-500/10">
              <FileText className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Total Commissions
                <span className="ml-1 text-[10px] bg-muted px-1 rounded">
                  {calcMode === "net_sales" ? "Net Sales" : "Total Price"}
                </span>
              </p>
              <p className="text-xl font-bold text-green-600" data-testid="text-total-commissions">${totalCommissions.toFixed(2)}</p>
              {calcMode === "net_sales" && totalProcessingFees > 0 && (
                <p className="text-xs text-muted-foreground">−${totalProcessingFees.toFixed(2)} fees</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-amber-500/10">
              <DollarSign className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Card Tips</p>
              <p className="text-xl font-bold text-amber-600">${totalTips.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-md bg-blue-500/10">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Commission Staff</p>
              <p className="text-xl font-bold" data-testid="text-commission-staff-count">{commissionStaff.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {commissionStaff.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No staff members have commission enabled.</p>
            <p className="text-xs text-muted-foreground mt-1">Enable commissions in each staff member's profile settings.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            {/* ── Summary table ── */}
            <table className="w-full text-sm" data-testid="commission-table">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="w-8 py-3 px-3" />
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Staff Member</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Rate</th>
                  <th className="text-center py-3 px-4 font-medium text-muted-foreground">Appts</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Gross Revenue</th>
                  <th className="text-right py-3 px-4 font-medium text-rose-500">Discounts</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Post-Discount</th>
                  <th className="text-right py-3 px-4 font-medium text-amber-600">Card Tips</th>
                  {/* Column O */}
                  <th className="text-right py-3 px-4 font-medium text-green-700 whitespace-nowrap">
                    Commission
                    <span className="block text-[10px] font-normal text-muted-foreground">Total Price</span>
                  </th>
                  {/* Column P */}
                  <th className="text-right py-3 px-4 font-medium text-green-700 whitespace-nowrap">
                    Commission
                    <span className="block text-[10px] font-normal text-muted-foreground">Net Sales</span>
                  </th>
                  <th className="text-right py-3 px-4 font-medium text-blue-700 whitespace-nowrap">
                    Tips + Comm.
                    <span className="block text-[10px] font-normal text-muted-foreground capitalize">{calcMode === "net_sales" ? "Net Sales" : "Total Price"}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {staffCommissions.map((sc) => {
                  const isExpanded = expandedIds.has(sc.staff.id);
                  return (
                    <>
                      {/* ── Staff summary row ── */}
                      <tr
                        key={`summary-${sc.staff.id}`}
                        className="border-b last:border-b-0 cursor-pointer select-none hover:bg-muted/30 transition-colors"
                        onClick={() => toggleExpand(sc.staff.id)}
                        data-testid={`row-commission-${sc.staff.id}`}
                      >
                        <td className="py-3 px-3 text-muted-foreground">
                          {isExpanded
                            ? <ChevronDown className="w-4 h-4" />
                            : <ChevronRight className="w-4 h-4" />}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold text-white shrink-0"
                              style={{ backgroundColor: sc.staff.color || "#3b82f6" }}
                            >
                              {sc.staff.name.slice(0, 2).toUpperCase()}
                            </div>
                            <span className="font-medium">{sc.staff.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant="secondary" className="no-default-active-elevate">{sc.commissionRate}%</Badge>
                        </td>
                        <td className="py-3 px-4 text-center">{sc.appointmentCount}</td>
                        <td className="py-3 px-4 text-right">${sc.totalGrossRevenue.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-rose-500">
                          {sc.totalDiscount > 0 ? `−$${sc.totalDiscount.toFixed(2)}` : "—"}
                        </td>
                        <td className="py-3 px-4 text-right font-medium">${sc.totalPostDiscount.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-amber-600 font-medium">
                          {sc.totalTips > 0 ? `$${sc.totalTips.toFixed(2)}` : "—"}
                        </td>
                        {/* Col O — Total Price commission */}
                        <td className={cn(
                          "py-3 px-4 text-right font-bold",
                          calcMode === "total_price" ? "text-green-600" : "text-muted-foreground",
                        )} data-testid={`text-commission-total-price-${sc.staff.id}`}>
                          ${sc.totalPriceCommission.toFixed(2)}
                        </td>
                        {/* Col P — Net Sales commission */}
                        <td className={cn(
                          "py-3 px-4 text-right font-bold",
                          calcMode === "net_sales" ? "text-green-600" : "text-muted-foreground",
                        )} data-testid={`text-commission-net-sales-${sc.staff.id}`}>
                          ${sc.netSalesCommission.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-blue-700" data-testid={`text-total-owed-${sc.staff.id}`}>
                          ${sc.totalTipsAndCommission.toFixed(2)}
                        </td>
                      </tr>

                      {/* ── Expanded detail rows ── */}
                      {isExpanded && (
                        <tr key={`tickets-${sc.staff.id}`} className="border-b bg-muted/10">
                          <td colSpan={11} className="p-0">
                            {sc.appointments.length === 0 ? (
                              <div className="px-12 py-4 text-sm text-muted-foreground italic">
                                No completed appointments in this period.
                              </div>
                            ) : (
                              <div className="px-4 py-2">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-muted-foreground border-b border-border/50">
                                      <th className="text-left py-2 px-3 font-medium">Date & Time</th>
                                      <th className="text-left py-2 px-3 font-medium">Client</th>
                                      <th className="text-left py-2 px-3 font-medium">Service</th>
                                      <th className="text-left py-2 px-3 font-medium">Add-ons</th>
                                      <th className="text-right py-2 px-3 font-medium">Gross</th>
                                      <th className="text-right py-2 px-3 font-medium text-rose-500">Discount</th>
                                      <th className="text-right py-2 px-3 font-medium text-slate-500">Proc. Fee</th>
                                      <th className="text-right py-2 px-3 font-medium">Post-Disc.</th>
                                      <th className="text-right py-2 px-3 font-medium text-amber-600">Tip</th>
                                      {/* Col O */}
                                      <th className={cn(
                                        "text-right py-2 px-3 font-medium",
                                        calcMode === "total_price" ? "text-green-700" : "text-muted-foreground",
                                      )}>
                                        Comm. (Total)
                                      </th>
                                      {/* Col P */}
                                      <th className={cn(
                                        "text-right py-2 px-3 font-medium",
                                        calcMode === "net_sales" ? "text-green-700" : "text-muted-foreground",
                                      )}>
                                        Comm. (Net)
                                      </th>
                                      <th className="text-right py-2 px-3 font-medium text-blue-700">Tip + Comm.</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {sc.appointments
                                      .slice()
                                      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                                      .map((apt: AppointmentWithDetails) => {
                                        const d = sc.aptDataById.get(apt.id);
                                        if (!d) return null;
                                        const addonNames = apt.appointmentAddons
                                          ?.map((aa) => aa.addon?.name)
                                          .filter(Boolean)
                                          .join(", ") || "—";
                                        const activeComm = calcMode === "net_sales" ? d.netSalesComm : d.totalPriceComm;
                                        return (
                                          <tr
                                            key={apt.id}
                                            className="border-b border-border/30 last:border-b-0 hover:bg-muted/20 transition-colors"
                                          >
                                            <td className="py-2 px-3 whitespace-nowrap text-muted-foreground">
                                              {formatInTz(apt.date, timezone, "MMM d, h:mm a")}
                                            </td>
                                            <td className="py-2 px-3">
                                              {(apt as any).customer?.fullName || (apt as any).customer?.name || (apt as any).customerName || "Walk-in"}
                                            </td>
                                            <td className="py-2 px-3 font-medium">
                                              {apt.service?.name || "—"}
                                            </td>
                                            <td className="py-2 px-3 text-muted-foreground">
                                              {addonNames}
                                            </td>
                                            <td className="py-2 px-3 text-right">${d.grossRevenue.toFixed(2)}</td>
                                            <td className="py-2 px-3 text-right text-rose-500">
                                              {d.discountAmt > 0 ? `−$${d.discountAmt.toFixed(2)}` : "—"}
                                            </td>
                                            <td className="py-2 px-3 text-right text-slate-500">
                                              {calcMode === "net_sales"
                                                ? `$${d.processingFee.toFixed(2)}`
                                                : <span className="text-muted-foreground">—</span>}
                                            </td>
                                            <td className="py-2 px-3 text-right font-medium">${d.postDiscount.toFixed(2)}</td>
                                            <td className="py-2 px-3 text-right text-amber-600">
                                              {d.tipAmount > 0 ? `$${d.tipAmount.toFixed(2)}` : "—"}
                                            </td>
                                            {/* Col O */}
                                            <td className={cn(
                                              "py-2 px-3 text-right font-semibold",
                                              calcMode === "total_price" ? "text-green-600" : "text-muted-foreground",
                                            )}>
                                              ${d.totalPriceComm.toFixed(2)}
                                            </td>
                                            {/* Col P */}
                                            <td className={cn(
                                              "py-2 px-3 text-right font-semibold",
                                              calcMode === "net_sales" ? "text-green-600" : "text-muted-foreground",
                                            )}>
                                              ${d.netSalesComm.toFixed(2)}
                                            </td>
                                            <td className="py-2 px-3 text-right font-semibold text-blue-700">
                                              ${(d.tipAmount + activeComm).toFixed(2)}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                  </tbody>
                                  <tfoot>
                                    <tr className="border-t border-border/50 bg-muted/20 font-semibold">
                                      <td colSpan={4} className="py-2 px-3 text-muted-foreground">
                                        {sc.appointmentCount} ticket{sc.appointmentCount !== 1 ? "s" : ""}
                                      </td>
                                      <td className="py-2 px-3 text-right">${sc.totalGrossRevenue.toFixed(2)}</td>
                                      <td className="py-2 px-3 text-right text-rose-500">
                                        {sc.totalDiscount > 0 ? `−$${sc.totalDiscount.toFixed(2)}` : "—"}
                                      </td>
                                      <td className="py-2 px-3 text-right text-slate-500">
                                        {calcMode === "net_sales"
                                          ? `$${sc.totalProcessingFees.toFixed(2)}`
                                          : "—"}
                                      </td>
                                      <td className="py-2 px-3 text-right">${sc.totalPostDiscount.toFixed(2)}</td>
                                      <td className="py-2 px-3 text-right text-amber-600">
                                        {sc.totalTips > 0 ? `$${sc.totalTips.toFixed(2)}` : "—"}
                                      </td>
                                      <td className={cn(
                                        "py-2 px-3 text-right",
                                        calcMode === "total_price" ? "text-green-600" : "text-muted-foreground",
                                      )}>
                                        ${sc.totalPriceCommission.toFixed(2)}
                                      </td>
                                      <td className={cn(
                                        "py-2 px-3 text-right",
                                        calcMode === "net_sales" ? "text-green-600" : "text-muted-foreground",
                                      )}>
                                        ${sc.netSalesCommission.toFixed(2)}
                                      </td>
                                      <td className="py-2 px-3 text-right text-blue-700">${sc.totalTipsAndCommission.toFixed(2)}</td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 border-t font-medium">
                  <td colSpan={4} className="py-3 px-4">Totals</td>
                  <td className="py-3 px-4 text-right">${totalGrossRevenue.toFixed(2)}</td>
                  <td className="py-3 px-4 text-right text-rose-500">
                    {totalDiscounts > 0 ? `−$${totalDiscounts.toFixed(2)}` : "—"}
                  </td>
                  <td className="py-3 px-4 text-right">
                    ${(totalGrossRevenue - totalDiscounts).toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right text-amber-600">
                    {totalTips > 0 ? `$${totalTips.toFixed(2)}` : "—"}
                  </td>
                  <td className={cn(
                    "py-3 px-4 text-right font-bold",
                    calcMode === "total_price" ? "text-green-600" : "text-muted-foreground",
                  )}>
                    ${staffCommissions.reduce((s, sc) => s + sc.totalPriceCommission, 0).toFixed(2)}
                  </td>
                  <td className={cn(
                    "py-3 px-4 text-right font-bold",
                    calcMode === "net_sales" ? "text-green-600" : "text-muted-foreground",
                  )}>
                    ${staffCommissions.reduce((s, sc) => s + sc.netSalesCommission, 0).toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-blue-700">${totalTipsAndCommissions.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="bg-muted/30 border-t px-4 py-2 flex flex-wrap gap-x-4 gap-y-1 items-center">
            <span className="text-xs text-muted-foreground">
              Period: {formatInTz(from, timezone, "MMM d, yyyy")} – {formatInTz(to, timezone, "MMM d, yyyy")}
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">Click a row to expand service tickets.</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">
              <strong>Total Price:</strong> (price − discount) × rate
              &nbsp;&nbsp;
              <strong>Net Sales:</strong> Total Price commission − processing fee ({(PROCESSING_FEE_RATE * 100).toFixed(1)}% + ${PROCESSING_FEE_FLAT.toFixed(2)})
            </span>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
