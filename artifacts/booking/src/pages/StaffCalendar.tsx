import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { StaffPortalNav } from "@/components/StaffPortalNav";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { useSelectedStore } from "@/hooks/use-store";
import { useAppointments, useUpdateAppointment } from "@/hooks/use-appointments";
import { useStaffList, useAllStaffAvailability } from "@/hooks/use-staff";
import { useCalendarSettings, DEFAULT_CALENDAR_SETTINGS } from "@/hooks/use-calendar-settings";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MobileCalendarView } from "@/components/MobileCalendarView";
import { useFeatureFlags } from "@/hooks/use-features";
import { assignStaffColors } from "@/lib/staffColors";
import { PERMISSIONS } from "@shared/permissions";
import { getNowInTimezone, formatInTz, formatStoreDate, isSameDayTz, isSameLocalDay, storeLocalToUtc } from "@/lib/timezone";
import {
  addDays, subDays, addMinutes,
  isWithinInterval, startOfDay, endOfDay, endOfMonth,
} from "date-fns";
import {
  CalendarDays,
  DollarSign,
  TrendingUp,
  Users,
  Menu as MenuIcon,
  LogOut,
  Phone,
  Mail,
  Clock,
  X,
  Loader2,
  CheckCircle2,
  XCircle,
  Play,
  ChevronDown,
  UserCircle,
  RotateCcw,
  AlertCircle,
  Star,
  CalendarPlus,
  Pencil,
  UserX,
  ChevronLeft,
  ScanLine,
  Bookmark,
  ArrowRight,
  Package,
  PlusCircle,
  ShoppingBag,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { AppointmentWithDetails } from "@shared/schema";
import { isStaffDateSelectable, isStaffSlotBookable } from "@/lib/staffCalendarDatePolicy";

// ─── Payroll helpers (mirrored from CommissionReport) ────────────────────────

type PayrollSettingsData = {
  frequency: string; weekStartDay: number; monthStartDay: number;
  semiMonthlyDay1: number; semiMonthlyDay2: number;
};
const PAYROLL_DEFAULTS: PayrollSettingsData = {
  frequency: "monthly", weekStartDay: 1, monthStartDay: 1, semiMonthlyDay1: 1, semiMonthlyDay2: 15,
};

function getPayPeriod(s: PayrollSettingsData, utcNow: Date, timezone: string): { from: Date; to: Date } {
  // Extract salon-local date components — avoids browser-timezone dependency
  const todayStr = formatInTz(utcNow, timezone, "yyyy-MM-dd"); // "2026-07-11"
  const [yearN, monthN1, todayN] = todayStr.split("-").map(Number);
  const month = monthN1 - 1; // 0-indexed
  const year  = yearN;
  const today = todayN;
  const dow   = parseInt(formatInTz(utcNow, timezone, "i"), 10) % 7; // 0=Sun,1=Mon,6=Sat (JS convention)

  // Shift a YYYY-MM-DD string by N days (using UTC noon to avoid DST issues)
  const shiftIso = (iso: string, days: number): string => {
    const d = new Date(iso + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  // Build UTC boundaries from a salon-local date ISO string
  const tzStart = (iso: string) => storeLocalToUtc(iso + "T00:00:00", timezone);
  const tzEnd   = (iso: string) => storeLocalToUtc(iso + "T23:59:59", timezone);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const iso = (y: number, m0: number, d: number) => {
    // Use Date to handle month/day overflow (e.g. month 13 or day -1)
    const jd = new Date(y, m0, d);
    return `${jd.getFullYear()}-${pad2(jd.getMonth() + 1)}-${pad2(jd.getDate())}`;
  };

  switch (s.frequency) {
    case "weekly": {
      const diff = (dow - s.weekStartDay + 7) % 7;
      const startIso = shiftIso(todayStr, -diff);
      return { from: tzStart(startIso), to: tzEnd(shiftIso(startIso, 6)) };
    }
    case "biweekly": {
      const diff = (dow - s.weekStartDay + 7) % 7;
      const thisWeekStartIso = shiftIso(todayStr, -diff);
      const anchorIso = iso(2025, 0, 6 + ((s.weekStartDay - 1 + 7) % 7));
      const startW = tzStart(thisWeekStartIso);
      const startA = tzStart(anchorIso);
      const daysSince = Math.floor((startW.getTime() - startA.getTime()) / 864e5);
      const block = Math.floor(Math.floor(daysSince / 7) / 2);
      const periodStartIso = shiftIso(anchorIso, block * 14);
      return { from: tzStart(periodStartIso), to: tzEnd(shiftIso(periodStartIso, 13)) };
    }
    case "semimonthly": {
      const d1 = s.semiMonthlyDay1, d2 = s.semiMonthlyDay2;
      if (today < d1) {
        const [pm, py] = month === 0 ? [11, year - 1] : [month - 1, year];
        return { from: tzStart(iso(py, pm, d2)), to: tzEnd(iso(year, month, d1 - 1)) };
      } else if (today < d2) {
        return { from: tzStart(iso(year, month, d1)), to: tzEnd(iso(year, month, d2 - 1)) };
      } else {
        const lastDay = new Date(year, month + 1, 0).getDate();
        return { from: tzStart(iso(year, month, d2)), to: tzEnd(iso(year, month, lastDay)) };
      }
    }
    default: {
      const sd = s.monthStartDay;
      return today >= sd
        ? { from: tzStart(iso(year, month, sd)),     to: tzEnd(iso(year, month + 1, sd - 1)) }
        : { from: tzStart(iso(year, month - 1, sd)), to: tzEnd(iso(year, month,     sd - 1)) };
    }
  }
}

function getPastPayPeriods(s: PayrollSettingsData, count: number, now: Date = new Date(), timezone = "UTC"): { from: Date; to: Date; label: string }[] {
  const periods: { from: Date; to: Date; label: string }[] = [];
  let probe = now;
  for (let i = 0; i < count; i++) {
    const cur = getPayPeriod(s, probe, timezone);
    const label = formatPeriodLabel(cur.from, cur.to, s.frequency);
    periods.push({ ...cur, label });
    // Step back one UTC day from the period start to land in the previous period
    probe = new Date(cur.from.getTime() - 12 * 3600_000);
  }
  return periods;
}

function formatPeriodLabel(from: Date, to: Date, freq: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const f = from.toLocaleDateString("en-US", opts);
  const t = to.toLocaleDateString("en-US", opts);
  if (freq === "monthly") return from.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return `${f} – ${t}`;
}

function calcCommission(
  appointments: AppointmentWithDetails[],
  staffId: number,
  from: Date,
  to: Date,
  timezone: string,
  rate: number,
) {
  const apts = appointments.filter((apt) => {
    if (apt.staffId !== staffId || apt.status !== "completed") return false;
    // Compare raw UTC timestamps — toStoreLocal (toZonedTime) is unreliable in date-fns-tz v3
    return isWithinInterval(new Date(apt.date), { start: from, end: to });
  });
  const serviceRev = apts.reduce((s, a) => s + Number(a.service?.price || 0), 0);
  const addonRev = apts.reduce((s, a) =>
    s + (a.appointmentAddons?.reduce((x, aa) => x + Number(aa.addon?.price || 0), 0) ?? 0), 0);
  const total = serviceRev + addonRev;
  return { apts, serviceRev, addonRev, total, commission: total * (rate / 100) };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const HOUR_HEIGHT = 180; // must match Calendar.tsx / MobileCalendarView expectations

// ─── useCurrentTimeLine ───────────────────────────────────────────────────────

function useCurrentTimeLine(timezone: string, startHour: number, endHour: number) {
  const [position, setPosition] = useState<number | null>(null);
  const [timeLabel, setTimeLabel] = useState("");

  const update = useCallback(() => {
    // Use Intl-based timezone formatting for wall-clock parts so the line always
    // follows the selected salon timezone, independent of browser timezone.
    const now = new Date();
    const hours = parseInt(formatInTz(now, timezone, "H"), 10);
    const minutes = parseInt(formatInTz(now, timezone, "m"), 10);
    const totalMins = hours * 60 + minutes;
    const startMins = startHour * 60;
    const endMins = endHour * 60;
    if (totalMins < startMins || totalMins > endMins) {
      setPosition(null);
      setTimeLabel("");
      return;
    }
    setPosition((totalMins - startMins) * (HOUR_HEIGHT / 60));
    const h = hours;
    const dh = h > 12 ? h - 12 : h === 0 ? 12 : h;
    setTimeLabel(`${dh}:${String(minutes).padStart(2, "0")}`);
  }, [timezone, startHour, endHour]);

  useEffect(() => {
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [update]);

  return { position, timeLabel };
}

// ─── Status badge config ──────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: "Pending",          color: "text-yellow-700", bg: "bg-yellow-50"  },
  confirmed: { label: "Confirmed",        color: "text-blue-700",   bg: "bg-blue-50"    },
  started:   { label: "In Progress",      color: "text-amber-700",  bg: "bg-amber-50"   },
  finished:  { label: "Awaiting Checkout",color: "text-orange-700", bg: "bg-orange-50"  },
  completed: { label: "Completed",        color: "text-green-700",  bg: "bg-green-50"   },
  cancelled: { label: "Cancelled",        color: "text-red-700",    bg: "bg-red-50"     },
  no_show:   { label: "No Show",          color: "text-gray-600",   bg: "bg-gray-100"   },
};

// ─── TurnTechnician type ──────────────────────────────────────────────────────

type TurnTechnician = {
  id: number;
  name: string;
  color?: string | null;
  avatarUrl?: string | null;
  eligible: boolean;
  clockedIn?: boolean;
  turnCount?: number;
  currentStatus?: "available" | "busy" | "on_break";
  shortTurnProtected?: boolean;
  turnPosition?: number | null;
};

// ─── StaffTurnPanel ───────────────────────────────────────────────────────────
// Compact TURN queue panel shown to the right of the staff calendar column when
// the salon has the Turn System enabled (nail salons only).

function StaffTurnPanel({
  turnEligibility,
}: {
  turnEligibility?: { eligibleTechnicians: TurnTechnician[]; technicians: TurnTechnician[] };
}) {
  const clockedIn = (turnEligibility?.technicians ?? []).filter((t) => t.clockedIn);
  const available = clockedIn.filter((t) => t.currentStatus === "available");
  const serving   = clockedIn.filter((t) => t.currentStatus !== "available");

  const statusLine = (tech: TurnTechnician) => {
    if (tech.currentStatus === "busy")     return "Serving";
    if (tech.currentStatus === "on_break") return "On Break";
    const tc = tech.turnCount ?? 0;
    return tc > 0 ? `${tc} turn${tc !== 1 ? "s" : ""}` : "Ready";
  };

  return (
    <div className="flex-none flex flex-col border-l border-slate-200 bg-slate-900 overflow-hidden"
         style={{ width: 110 }}>
      {/* Header */}
      <div className="flex-shrink-0 flex flex-col items-center justify-center py-3 px-2 border-b border-slate-700">
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-white leading-tight text-center">
          Turn<br/>Queue
        </span>
      </div>

      {/* Queue rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800">
        {clockedIn.length === 0 ? (
          <p className="py-8 text-center text-[10px] text-slate-500">No staff<br/>clocked in</p>
        ) : (
          <>
            {available.map((tech, i) => (
              <div
                key={tech.id}
                className={cn(
                  "flex flex-col items-center gap-1 px-2 py-2.5",
                  i === 0 ? "bg-green-900/40" : "bg-slate-900"
                )}
              >
                <div className={cn(
                  "w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-extrabold shrink-0",
                  i === 0 ? "bg-green-500 text-white" : "bg-slate-700 text-slate-300"
                )}>
                  {i + 1}
                </div>
                <p className="text-[10px] font-bold text-white truncate w-full text-center leading-tight">
                  {tech.name}
                </p>
                <p className="text-[9px] text-slate-400 leading-tight text-center">{statusLine(tech)}</p>
              </div>
            ))}

            {serving.length > 0 && (
              <>
                <div className="flex items-center gap-1 px-2 py-1 bg-slate-800">
                  <div className="h-px flex-1 bg-rose-700/60" />
                  <span className="shrink-0 text-[8px] font-bold uppercase tracking-wider text-rose-400">Busy</span>
                  <div className="h-px flex-1 bg-rose-700/60" />
                </div>
                {serving.map((tech) => (
                  <div key={tech.id} className="flex flex-col items-center gap-1 px-2 py-2.5 bg-rose-900/20">
                    <div className="w-6 h-6 flex items-center justify-center rounded-full bg-rose-800/60 text-rose-300 text-[11px] font-bold">
                      ·
                    </div>
                    <p className="text-[10px] font-bold text-white truncate w-full text-center leading-tight">
                      {tech.name}
                    </p>
                    <p className="text-[9px] text-rose-400 leading-tight text-center">{statusLine(tech)}</p>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>

      {/* Footer fill */}
      <div className="flex-shrink-0 h-1 bg-slate-800" />
    </div>
  );
}

// ─── AppointmentTicketSheet ───────────────────────────────────────────────────

type TicketTab = "services" | "addons" | "products";

function AppointmentTicketSheet({
  apt,
  open,
  onClose,
  onStart,
  onCheckout,
  onComplete,
  onEdit,
  onCancel,
  onReschedule,
  onMarkNoShow,
  onSendReview,
  onRebook,
  isUpdating,
  canEdit,
  canCancel,
  canReschedule,
  canViewClients,
  canViewContact,
  showPrices,
  posEnabled,
  staffList,
  getStaffColor,
  timezone,
  storeNow,
  lateGracePeriodMinutes,
  reviewSent,
  reviewSending,
}: {
  apt: any;
  open: boolean;
  onClose: () => void;
  onStart: (apt: any) => void;
  onCheckout: (apt: any) => void;
  onComplete: (apt: any) => void;
  onEdit: (apt: any) => void;
  onCancel: (apt: any) => void;
  onReschedule: (apt: any) => void;
  onMarkNoShow: (apt: any) => void;
  onSendReview: (apt: any) => void;
  onRebook: (apt: any) => void;
  isUpdating: boolean;
  canEdit: boolean;
  canCancel: boolean;
  canReschedule: boolean;
  canViewClients: boolean;
  canViewContact: boolean;
  showPrices: boolean;
  posEnabled: boolean;
  staffList: any[];
  getStaffColor: (member: any) => string;
  timezone: string;
  storeNow: Date;
  lateGracePeriodMinutes: number;
  reviewSent: boolean;
  reviewSending: boolean;
}) {
  const [activeTab, setActiveTab] = useState<TicketTab>("services");
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);

  // Fetch extended client detail for loyalty/VIP/visits
  const { data: clientDetail } = useQuery<any>({
    queryKey: ["/api/clients", apt?.customerId],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${apt.customerId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: open && !!apt?.customerId,
    staleTime: 60_000,
  });

  if (!apt) return null;

  const cfg           = STATUS_CFG[apt.status] ?? STATUS_CFG.confirmed;
  const isActive      = !["completed", "cancelled", "no_show"].includes(apt.status);
  const isDone        = apt.status === "completed";
  const isNoShow      = apt.status === "no_show";
  const isCancelled   = apt.status === "cancelled";

  const aptDate             = new Date(apt.date);
  const aptEnd              = addMinutes(aptDate, apt.duration ?? 0);
  const dateStr             = formatInTz(apt.date, timezone, "EEE, d MMM yyyy");
  const timeStr             = `${formatInTz(apt.date, timezone, "h:mm a")} – ${formatInTz(aptEnd, timezone, "h:mm a")}`;
  const minutesPastStart    = Math.floor((Date.now() - aptDate.getTime()) / 60_000);
  const canStartNow         = minutesPastStart >= -30;
  const isToday             = isSameLocalDay(apt.date, storeNow, timezone);
  const isOverdue           = isToday && minutesPastStart >= lateGracePeriodMinutes &&
                              (apt.status === "pending" || apt.status === "confirmed");

  const addonTotal    = (apt.appointmentAddons ?? []).reduce(
    (s: number, aa: any) => s + Number(aa.addon?.price ?? 0), 0);
  const grandTotal    = isDone && Number(apt.totalPaid) > 0
    ? Number(apt.totalPaid)
    : Number(apt.service?.price ?? 0) + addonTotal;

  const aptStaff      = staffList.find((s) => s.id === apt.staffId);
  const staffColor    = getStaffColor(aptStaff);

  const isVip         = clientDetail?.clientStatus === "vip";
  const loyaltyPoints = clientDetail?.loyaltyPoints ?? 0;
  const totalVisits   = clientDetail?.totalVisits ?? 0;
  const lastVisitAt   = clientDetail?.lastVisitAt;
  const lastVisitStr  = lastVisitAt
    ? new Date(lastVisitAt).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" })
    : "—";

  const customerName  = canViewClients
    ? ((apt.customer as any)?.fullName ?? apt.customer?.name ?? apt.customerName ?? "Walk-In")
    : "Appointment";

  const addons        = (apt.appointmentAddons ?? []) as any[];

  // Primary CTA label + action  (3-state)
  // State 1 — pending/confirmed + today: "Start Service"
  // State 2 — started:                   "Mark Completed"  (guarded by confirm sheet)
  // State 3 — finished:                  "Checkout"
  const proceedLabel = apt.status === "started"
    ? "Mark Completed"
    : apt.status === "finished"
    ? "Checkout"
    : isToday && canStartNow
    ? "Start Service"
    : null;

  const handleProceed = () => {
    if (apt.status === "started") {
      setShowCompleteConfirm(true);          // show confirm before marking complete
    } else if (apt.status === "finished") {
      onCheckout(apt);
    } else if (canStartNow) {
      onStart(apt);
    }
  };

  const tabs: { key: TicketTab; label: string; count?: number }[] = [
    { key: "services", label: "SERVICES" },
    { key: "addons",   label: "ADD-ONS",  count: addons.length },
    { key: "products", label: "PRODUCTS" },
  ];

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="bottom"
        hideCloseButton
        className="h-[100dvh] max-h-[100dvh] rounded-none flex flex-col overflow-hidden p-0 bg-white"
      >
        <SheetTitle className="sr-only">Booking #{apt.id}</SheetTitle>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <button
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-600 active:bg-gray-100 transition-colors"
            onClick={onClose}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold text-gray-900">#{apt.id}</h2>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
            {cfg.label}
          </span>
        </div>

        {/* ── Overdue banner ──────────────────────────────────────────────── */}
        {isOverdue && (
          <div className="flex-shrink-0 bg-red-50 border-b border-red-100 px-4 py-2 flex items-center gap-2 text-red-700 text-sm font-semibold">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            Client is {minutesPastStart} min late · start or mark no-show
          </div>
        )}

        {/* ── Client info ─────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 flex items-start justify-between px-5 py-4 border-b border-gray-100">
          {/* Left: name + VIP + last visit */}
          <div className="flex-1 min-w-0 mr-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg font-bold text-gray-900 leading-tight">
                {customerName}
              </span>
              {isVip && (
                <span className="inline-flex items-center gap-1 bg-violet-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                  <Star className="w-2.5 h-2.5 fill-white" />
                  VIP
                </span>
              )}
            </div>
            {canViewContact && canViewClients && apt.customer?.phone && (
              <a href={`tel:${apt.customer.phone}`}
                 className="inline-flex items-center gap-1 text-xs text-violet-600 mt-0.5">
                <Phone className="w-3 h-3" />{apt.customer.phone}
              </a>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Last visit: {lastVisitStr}
            </p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <Clock className="w-3 h-3 text-gray-400 shrink-0" />
              <span className="text-xs text-gray-600 font-medium">{dateStr}</span>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-gray-600 font-semibold">{timeStr}</span>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-gray-500">{apt.duration}m</span>
            </div>
          </div>
          {/* Right: loyalty + visits */}
          <div className="flex flex-col items-end gap-1 shrink-0 text-right">
            <span className="text-xs text-gray-600">Loyalty Points: <span className="font-semibold text-gray-900">{loyaltyPoints}</span></span>
            <span className="text-xs text-gray-600">Total visits: <span className="font-semibold text-gray-900">{totalVisits}</span></span>
          </div>
        </div>

        {/* ── Tab bar ─────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 flex border-b border-gray-100">
          {tabs.map((t) => (
            <button
              key={t.key}
              className="flex-1 py-3 relative flex items-center justify-center gap-1.5"
              onClick={() => setActiveTab(t.key)}
            >
              <span className={cn(
                "text-[11px] font-bold tracking-wider",
                activeTab === t.key ? "text-violet-600" : "text-gray-400"
              )}>
                {t.label}
              </span>
              {t.count != null && t.count > 0 && (
                <span className={cn(
                  "text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center",
                  activeTab === t.key ? "bg-violet-100 text-violet-600" : "bg-gray-100 text-gray-400"
                )}>
                  {t.count}
                </span>
              )}
              {activeTab === t.key && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-violet-600 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* ── Scrollable content ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {/* SERVICES tab */}
          {activeTab === "services" && (
            <div className="px-4 py-4 space-y-3">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                Current Ticket ({1 + addons.length})
              </p>

              {/* Main service card */}
              <div className="border border-gray-200 rounded-2xl overflow-hidden">
                {/* Service row */}
                <div className="flex items-start justify-between px-4 py-4">
                  <div>
                    <p className="font-semibold text-gray-900">{apt.service?.name ?? "Service"}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{apt.service?.duration ?? apt.duration} min</p>
                  </div>
                  {showPrices && (
                    <span className="text-sm font-semibold text-gray-800 shrink-0">
                      ${Number(apt.service?.price ?? 0).toFixed(2)}
                    </span>
                  )}
                </div>

                {/* Add-ons subsection */}
                {addons.length > 0 && (
                  <div className="border-t border-gray-200">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-violet-100">
                      <span className="text-xs font-bold text-violet-600">Add-ons</span>
                      <span className="text-xs font-bold text-violet-500">({addons.length})</span>
                    </div>
                    {addons.map((aa: any) => aa.addon && (
                      <div key={aa.id} className="flex items-center justify-between px-4 py-2.5 bg-white border-t border-gray-200 first:border-t-0 w-full">
                        <span className="text-sm text-gray-700">{aa.addon.name}</span>
                        {showPrices && (
                          <span className="text-sm font-medium text-gray-700 shrink-0">
                            ${Number(aa.addon.price).toFixed(2)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              {apt.notes && (
                <div className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-3">
                  <p className="text-xs font-semibold text-gray-500 mb-1">Notes</p>
                  <p className="text-xs text-gray-600 leading-relaxed">{apt.notes}</p>
                </div>
              )}

              {/* Secondary actions */}
              {canEdit && isActive && (
                <div className="pt-1 space-y-2">
                  {canReschedule && (
                    <button
                      className="w-full py-2.5 rounded-xl border border-amber-200 text-amber-700 text-sm font-semibold flex items-center justify-center gap-2 active:opacity-70 transition-opacity"
                      onClick={() => onReschedule(apt)}
                      disabled={isUpdating}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reschedule
                    </button>
                  )}
                  {isToday && !isOverdue && canCancel && (
                    <button
                      className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm font-medium flex items-center justify-center gap-2 active:opacity-70 transition-opacity"
                      onClick={() => onMarkNoShow(apt)}
                      disabled={isUpdating}
                    >
                      <UserX className="w-3.5 h-3.5" />
                      Mark as No-Show
                    </button>
                  )}
                  {canCancel && (
                    <button
                      className="w-full py-2.5 rounded-xl border border-red-100 text-red-500 text-sm font-medium flex items-center justify-center gap-2 active:opacity-70 transition-opacity"
                      onClick={() => onCancel(apt)}
                      disabled={isUpdating}
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Cancel Appointment
                    </button>
                  )}
                </div>
              )}

              {/* Completed actions */}
              {isDone && (
                <div className="pt-1 space-y-2">
                  {apt.customer?.phone && (
                    <button
                      className={cn(
                        "w-full py-2.5 rounded-xl border-2 text-sm font-semibold flex items-center justify-center gap-2 active:opacity-70 transition-all",
                        reviewSent ? "border-emerald-300 text-emerald-700" : "border-violet-200 text-violet-700"
                      )}
                      onClick={() => onSendReview(apt)}
                      disabled={reviewSending || reviewSent}
                    >
                      <Star className="w-3.5 h-3.5" />
                      {reviewSent ? "Review Request Sent ✓" : reviewSending ? "Sending…" : "Request Google Review"}
                    </button>
                  )}
                  {apt.customerId && (
                    <button
                      className="w-full py-2.5 rounded-xl border-2 border-emerald-200 text-emerald-700 text-sm font-semibold flex items-center justify-center gap-2 active:opacity-70 transition-opacity"
                      onClick={() => onRebook(apt)}
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
                      Rebook
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ADD-ONS tab */}
          {activeTab === "addons" && (
            <div className="px-4 py-4">
              {addons.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                  <div className="w-12 h-12 rounded-full bg-violet-50 flex items-center justify-center">
                    <PlusCircle className="w-6 h-6 text-violet-300" />
                  </div>
                  <p className="text-sm font-semibold text-gray-600">No add-ons</p>
                  <p className="text-xs text-gray-400 max-w-[200px] leading-relaxed">
                    Add-ons can be added when processing checkout.
                  </p>
                </div>
              ) : (
                <div className="border border-gray-100 rounded-2xl overflow-hidden divide-y divide-gray-100">
                  {addons.map((aa: any) => aa.addon && (
                    <div key={aa.id} className="flex items-center justify-between px-4 py-3.5">
                      <span className="text-sm text-gray-800 font-medium">{aa.addon.name}</span>
                      {showPrices && (
                        <span className="text-sm font-semibold text-gray-700">
                          ${Number(aa.addon.price).toFixed(2)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* PRODUCTS tab */}
          {activeTab === "products" && (
            <div className="flex flex-col items-center justify-center py-16 px-4 gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center">
                <ShoppingBag className="w-6 h-6 text-gray-300" />
              </div>
              <p className="text-sm font-semibold text-gray-600">No products</p>
              <p className="text-xs text-gray-400 max-w-[200px] leading-relaxed">
                Retail products sold during this visit will appear here.
              </p>
            </div>
          )}
        </div>

        {/* ── Bottom bar ──────────────────────────────────────────────────── */}
        <div
          className="flex-shrink-0 border-t border-gray-100 bg-white px-4 pt-3 flex items-center gap-2"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}
        >
          {/* Total */}
          {showPrices && (
            <div className="mr-2 shrink-0">
              <p className="text-[10px] text-gray-400 font-medium leading-none mb-0.5">Total</p>
              <p className="text-xl font-bold text-gray-900 leading-none">${grandTotal.toFixed(2)}</p>
            </div>
          )}

          {/* Save Ticket */}
          <button
            className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-600 font-semibold text-sm flex items-center justify-center gap-1.5 active:bg-gray-50 transition-colors"
            onClick={onClose}
          >
            <Bookmark className="w-3.5 h-3.5" />
            Add to Ticket
          </button>

          {/* Proceed / primary action — 3-state */}
          {proceedLabel && canEdit ? (
            <button
              className={cn(
                "flex-[1.4] py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-1.5 transition-colors shadow-sm",
                apt.status === "started"
                  ? "bg-green-600 text-white active:bg-green-700"
                  : "bg-violet-600 text-white active:bg-violet-700",
                (isUpdating || (!canStartNow && apt.status !== "started" && apt.status !== "finished")) && "opacity-50 pointer-events-none"
              )}
              onClick={handleProceed}
              disabled={isUpdating}
            >
              {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <>
                  {apt.status === "started" && <CheckCircle2 className="w-4 h-4" />}
                  {proceedLabel}
                  {apt.status !== "started" && <ArrowRight className="w-3.5 h-3.5" />}
                </>
              )}
            </button>
          ) : !isActive ? (
            <button
              className="flex-[1.4] py-3 rounded-2xl bg-gray-100 text-gray-400 font-semibold text-sm flex items-center justify-center active:opacity-70"
              onClick={onClose}
            >
              Done
            </button>
          ) : null}
        </div>

        {/* ── Mark Completed confirmation overlay ─────────────────────────── */}
        {showCompleteConfirm && (
          <div className="absolute inset-0 z-10 bg-black/40 flex items-end rounded-none">
            <div className="w-full bg-white rounded-t-3xl px-5 pt-5 pb-8 shadow-2xl">
              <div className="flex justify-center mb-4">
                <div className="w-9 h-1 rounded-full bg-gray-200" />
              </div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Mark service as completed?</h3>
              </div>
              <p className="text-sm text-gray-500 mb-6 pl-[52px]">
                This will mark the service as done and move the appointment to checkout.
              </p>
              <div className="flex flex-col gap-2.5">
                <button
                  className="w-full py-3.5 rounded-2xl bg-green-600 text-white font-semibold text-[15px] active:bg-green-700 transition-colors"
                  onClick={() => { setShowCompleteConfirm(false); onComplete(apt); }}
                  disabled={isUpdating}
                >
                  {isUpdating ? "Saving…" : "Yes, mark completed"}
                </button>
                <button
                  className="w-full py-3.5 rounded-2xl border-2 border-gray-200 text-gray-700 font-semibold text-[15px] active:scale-[0.98] transition-transform"
                  onClick={() => setShowCompleteConfirm(false)}
                >
                  Keep in progress
                </button>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── StaffCalendar ────────────────────────────────────────────────────────────

export default function StaffCalendar() {
  const { user, isLoading: authLoading, logout } = useAuth();
  const { can } = usePermissions();
  const { selectedStore } = useSelectedStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const staffId = user?.staffId as number | undefined;
  const timezone = selectedStore?.timezone ?? "UTC";
  const lateGracePeriodMinutes = (selectedStore as any)?.lateGracePeriodMinutes ?? 10;
  const storeNow = getNowInTimezone(timezone);
  const todayStoreDate = useMemo(
    () => new Date(Date.UTC(
      storeNow.getUTCFullYear(),
      storeNow.getUTCMonth(),
      storeNow.getUTCDate(),
    )),
    [storeNow],
  );

  // ── Feature flags ──────────────────────────────────────────────────────────
  const { turnSystem, pos: posEnabled } = useFeatureFlags();

  // ── Permissions ────────────────────────────────────────────────────────────
  const canViewAll       = can(PERMISSIONS.APPOINTMENTS_VIEW_ALL);
  const canEdit          = can(PERMISSIONS.APPOINTMENTS_EDIT);
  const canCancel        = can(PERMISSIONS.APPOINTMENTS_CANCEL);
  const canReschedule    = can(PERMISSIONS.APPOINTMENTS_RESCHEDULE);
  const canMarkComplete  = can(PERMISSIONS.APPOINTMENTS_MARK_COMPLETE);
  const canViewClients   = can(PERMISSIONS.CUSTOMERS_VIEW);
  const canViewContact   = can(PERMISSIONS.CUSTOMERS_VIEW_CONTACT);

  // ── State ──────────────────────────────────────────────────────────────────
  const [calView, setCalView]                   = useState<"grid" | "agenda">("grid");
  const [currentDate, setCurrentDate]           = useState(storeNow);
  const [selectedAppointment, setSelectedAppointment] = useState<any | null>(null);
  const [qrFetchingId, setQrFetchingId]         = useState<number | null>(null);
  const [reviewSent, setReviewSent]             = useState(false);
  const [reviewSending, setReviewSending]       = useState(false);
  const [selectedSlot, setSelectedSlot]         = useState<{ staffId: number; hour: number; minute: number } | null>(null);
  const [showDatePicker, setShowDatePicker]      = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showTurnPanel, setShowTurnPanel]         = useState(false);
  // Always default to the logged-in staff member's own column.
  // The guard useEffect below keeps this locked after mount too.
  const [selectedStaffId, setSelectedStaffId]   = useState<number | "all">(
    staffId ?? "all",
  );

  // ── Guards ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      // Not authenticated at all → staff login
      navigate("/staff-auth", { replace: true });
      return;
    }
    if (user.role !== "staff") {
      // A salon owner somehow landed here → send them to their own calendar
      navigate("/calendar", { replace: true });
    }
  }, [authLoading, user, navigate]);

  // Always lock to the logged-in staff member's own column.
  // canViewAll is false for regular staff; even if it were true we still
  // default to showing only the staff member's own view here.
  useEffect(() => {
    if (staffId) setSelectedStaffId(staffId);
  }, [staffId]);

  // Reset date when store changes
  useEffect(() => {
    setCurrentDate(getNowInTimezone(timezone));
    setSelectedAppointment(null);
    setSelectedSlot(null);
  }, [selectedStore?.id, timezone]);

  // ── QR scan: open booking details sheet when ?qrApt=ID is in URL ───────────
  useEffect(() => {
    const qrAptParam = searchParams.get("qrApt");
    if (!qrAptParam) return;
    const appointmentId = Number(qrAptParam);
    if (!appointmentId) return;
    // Clear the param immediately so back-nav doesn't re-open
    setSearchParams((prev) => { prev.delete("qrApt"); return prev; }, { replace: true });
    setQrFetchingId(appointmentId);
    (async () => {
      try {
        const res = await fetch(`/api/appointments/${appointmentId}`, { credentials: "include" });
        if (!res.ok) throw new Error("Not found");
        const apt = await res.json();
        setSelectedAppointment(apt);
        setShowCancelConfirm(false);
      } catch {
        // silently ignore — the appointment might not be visible to this staff
      } finally {
        setQrFetchingId(null);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ── Data ───────────────────────────────────────────────────────────────────
  const { data: appointments = [] }  = useAppointments();
  const { data: staffList = [] }     = useStaffList();
  // calSettings fetched early so weekFrom/weekTo can respect startOfWeek
  const { data: calSettings }        = useCalendarSettings();
  const { data: allStaffAvailability } = useAllStaffAvailability(selectedStore?.id);
  const updateAppointment            = useUpdateAppointment();

  // Week-range appointments for agenda view ──────────────────────────────────
  // Mirrors the same week-start logic used by weekDayLabels below so the
  // fetched range exactly matches the days displayed in WeeklyAgendaView.
  const weekFrom = useMemo(() => {
    const dow  = parseInt(formatInTz(currentDate, timezone, "i"), 10) % 7;
    const sow  = (calSettings as any)?.startOfWeek;
    const wsd  = sow === "sunday" ? 0 : sow === "saturday" ? 6 : 1;
    const diff = (dow - wsd + 7) % 7;
    return formatInTz(subDays(currentDate, diff), timezone, "yyyy-MM-dd");
  }, [currentDate, timezone, calSettings]);
  const weekTo = useMemo(() => {
    const dow  = parseInt(formatInTz(currentDate, timezone, "i"), 10) % 7;
    const sow  = (calSettings as any)?.startOfWeek;
    const wsd  = sow === "sunday" ? 0 : sow === "saturday" ? 6 : 1;
    const diff = (dow - wsd + 7) % 7;
    return formatInTz(addDays(subDays(currentDate, diff), 6), timezone, "yyyy-MM-dd");
  }, [currentDate, timezone, calSettings]);

  const { data: weekAppointments = [] } = useQuery<any[]>({
    queryKey: ["/api/appointments", "week-agenda", weekFrom, weekTo, staffId, selectedStore?.id],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedStore?.id) params.append("storeId", String(selectedStore.id));
      params.append("from", weekFrom);
      params.append("to", weekTo);
      if (staffId) params.append("staffId", String(staffId));
      const res = await fetch(`/api/appointments?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: calView === "agenda" && !!selectedStore?.id,
    staleTime: 30_000,
  });

  const { data: businessHoursData = [] } = useQuery<any[]>({
    queryKey: ["/api/business-hours", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return [];
      const res = await fetch(`/api/business-hours?storeId=${selectedStore?.id}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const { data: payrollSettings } = useQuery<PayrollSettingsData>({
    queryKey: ["/api/payroll-settings", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return PAYROLL_DEFAULTS;
      const res = await fetch(`/api/payroll-settings/${selectedStore?.id}`, { credentials: "include" });
      if (!res.ok) return PAYROLL_DEFAULTS;
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  // ── Turn eligibility (nail salons with Turn System only) ──────────────────
  const { data: turnEligibility } = useQuery<{
    eligibleTechnicians: TurnTechnician[];
    technicians: TurnTechnician[];
  }>({
    queryKey: ["/api/turn/eligibility", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch(`/api/turn/eligibility?storeId=${selectedStore?.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch turn eligibility");
      return res.json();
    },
    enabled: !!selectedStore?.id && turnSystem,
    refetchInterval: 60_000,
    staleTime: 0,
  });

  const ownStaff = useMemo(
    () => (staffList as any[]).find((s) => s.id === staffId),
    [staffList, staffId],
  );

  const myTurnPos = useMemo(() => {
    if (!turnSystem || !staffId) return null;
    const techs = (turnEligibility?.technicians ?? []) as TurnTechnician[];
    const entry = techs.find((t) => t.id === staffId);
    if (!entry?.clockedIn) return null;
    return Number(entry.turnPosition) + 1;
  }, [turnEligibility, staffId, turnSystem]);

  // ── Calendar settings ──────────────────────────────────────────────────────
  const timeSlotInterval       = calSettings?.timeSlotInterval       ?? DEFAULT_CALENDAR_SETTINGS.timeSlotInterval;
  const showPrices             = calSettings?.showPrices             ?? DEFAULT_CALENDAR_SETTINGS.showPrices;
  const nonWorkingHoursDisplay = (calSettings as any)?.nonWorkingHoursDisplay ?? DEFAULT_CALENDAR_SETTINGS.nonWorkingHoursDisplay;
  const startOfWeek            = (calSettings as any)?.startOfWeek   ?? DEFAULT_CALENDAR_SETTINGS.startOfWeek;
  const settings               = { timeSlotInterval };

  // ── Business hours for today (mirrors desktop Calendar logic) ────────────────
  const { BUSINESS_START_HOUR, BUSINESS_END_HOUR, BUSINESS_OPEN_MINUTE, businessIsClosed } = useMemo(() => {
    // formatInTz → formatInTimeZone always uses the correct timezone offset
    const dayOfWeek = parseInt(formatInTz(currentDate, timezone, "i"), 10) % 7; // 0=Sun…6=Sat
    const todayHours = (businessHoursData as any[]).find(
      (b: any) => b.dayOfWeek === dayOfWeek || b.day_of_week === dayOfWeek
    );
    if (!todayHours || todayHours.isClosed || todayHours.is_closed) {
      return { BUSINESS_START_HOUR: 9, BUSINESS_END_HOUR: 17, BUSINESS_OPEN_MINUTE: 0, businessIsClosed: true };
    }
    const [openHourRaw, openMinRaw = "0"] = String(todayHours.openTime  ?? todayHours.open_time  ?? "09:00").split(":");
    const [closeHourRaw] = String(todayHours.closeTime ?? todayHours.close_time ?? "17:00").split(":");
    return {
      BUSINESS_START_HOUR: Math.max(0, Math.min(24, Number(openHourRaw))),
      BUSINESS_END_HOUR:   Math.max(0, Math.min(24, Number(closeHourRaw))),
      BUSINESS_OPEN_MINUTE: Math.max(0, Math.min(59, Number(openMinRaw))),
      businessIsClosed: false,
    };
  }, [businessHoursData, currentDate]);

  // ── Hour range (expands to fit appointments) ───────────────────────────────
  const { START_HOUR, END_HOUR } = useMemo(() => {
    let s = Math.max(0, BUSINESS_START_HOUR - nonWorkingHoursDisplay);
    let e = Math.min(24, BUSINESS_END_HOUR   + nonWorkingHoursDisplay);
    for (const apt of appointments as any[]) {
      if (!isSameLocalDay(apt.date, currentDate, timezone)) continue;
      if (staffId && apt.staffId !== staffId) continue;
      const startMin = parseInt(formatInTz(new Date(apt.date), timezone, "H"), 10) * 60
                     + parseInt(formatInTz(new Date(apt.date), timezone, "m"), 10);
      const endMin   = Math.min(24 * 60, startMin + Math.max(Number(apt.duration ?? 0), 15));
      s = Math.min(s, Math.floor(startMin / 60));
      e = Math.max(e, Math.ceil(endMin / 60));
    }
    return { START_HOUR: Math.max(0, s), END_HOUR: Math.min(24, Math.max(e, s + 1)) };
  }, [appointments, currentDate, timezone, staffId, nonWorkingHoursDisplay, BUSINESS_START_HOUR, BUSINESS_END_HOUR]);

  const TOTAL_HOURS = END_HOUR - START_HOUR;
  const isToday     = isSameDayTz(currentDate, storeNow);
  const isPastDate  = !isStaffDateSelectable(currentDate, storeNow);

  const { position: timeLinePosition, timeLabel: timeLineLabel } =
    useCurrentTimeLine(timezone, START_HOUR, END_HOUR);

  // ── Filtered staff ─────────────────────────────────────────────────────────
  const filteredStaff = useMemo(() => {
    const list = staffList as any[];
    if (!list.length) return [];

    // Staff portal must always be single-staff scoped.
    if (staffId) return list.filter((s) => s.id === staffId);

    // Fallback for brief auth/store hydration windows.
    if (selectedStaffId !== "all") return list.filter((s) => s.id === selectedStaffId);
    return [];
  }, [staffList, selectedStaffId, staffId]);

  // ── Time slots ─────────────────────────────────────────────────────────────
  const timeSlots = useMemo(() => {
    const slots: { hour: number; minute: number; label: string; isHour: boolean }[] = [];
    for (let h = START_HOUR; h <= END_HOUR; h++) {
      for (let m = 0; m < 60; m += timeSlotInterval) {
        if (h === END_HOUR && m > 0) break;
        const isHour = m === 0;
        const label = isHour
          ? h === 0 ? "12 AM" : h === 12 ? "12 PM" : h > 12 ? `${h - 12}:00 PM` : `${h}:00 AM`
          : `${h > 12 ? h - 12 : h === 0 ? 12 : h}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
        slots.push({ hour: h, minute: m, label, isHour });
      }
    }
    return slots;
  }, [START_HOUR, END_HOUR, timeSlotInterval]);

  // ── Week day labels ────────────────────────────────────────────────────────
  const weekDayLabels = useMemo(() => {
    const dow  = parseInt(formatInTz(currentDate, timezone, "i"), 10) % 7; // 0=Sun…6=Sat
    const wsd  = startOfWeek === "sunday" ? 0 : startOfWeek === "saturday" ? 6 : 1;
    const diff = (dow - wsd + 7) % 7;
    const start = subDays(currentDate, diff);
    return Array.from({ length: 7 }).map((_, i) => {
      const d = addDays(start, i);
      return { date: d, label: formatInTz(d, timezone, "EEE"), isToday: isSameDayTz(d, storeNow) };
    });
  }, [currentDate, timezone, storeNow, startOfWeek]);

  // ── Data helpers ───────────────────────────────────────────────────────────
  const getAppointmentsForStaff = useCallback(
    (sid: number) =>
      (appointments as any[]).filter((apt) => {
        if (apt.status === "cancelled") return false;
        return apt.staffId === sid && isSameLocalDay(apt.date, currentDate, timezone);
      }),
    [appointments, timezone, currentDate],
  );

  const getAppointmentStyle = useCallback(
    (apt: any) => {
      // formatInTz → formatInTimeZone: always correct; toZonedTime+getUTCHours breaks in date-fns-tz v3
      const startMin = parseInt(formatInTz(new Date(apt.date), timezone, "H"), 10) * 60
                     + parseInt(formatInTz(new Date(apt.date), timezone, "m"), 10);
      const endMin   = startMin + Math.max(Number(apt.duration ?? 0), 15);
      const visStart = START_HOUR * 60;
      const visEnd   = END_HOUR * 60;
      const cStart   = Math.max(startMin, visStart);
      const cEnd     = Math.min(endMin, visEnd);
      return {
        top:    `${((cStart - visStart) / 60) * HOUR_HEIGHT}px`,
        height: `${Math.max(((cEnd - cStart) / 60) * HOUR_HEIGHT, 30)}px`,
      };
    },
    [timezone, START_HOUR, END_HOUR],
  );

  // Auto-assigned palette colours — consistent across filters, keyed by staff id
  const staffColorMap = useMemo(
    () => assignStaffColors(staffList as any[]),
    [staffList]
  );
  const getStaffColor = useCallback(
    (member: any): string => {
      if (!member?.id) return "#94a3b8";
      return staffColorMap.get(member.id) ?? "#94a3b8";
    },
    [staffColorMap]
  );

  // ── Slot interaction ───────────────────────────────────────────────────────
  const handleSlotClick = useCallback(
    (sid: number, hour: number, minute: number) => {
      if (!canEdit) return;
      if (!isStaffSlotBookable(currentDate, hour, minute, storeNow)) return;
      setSelectedSlot((prev) =>
        prev?.staffId === sid && prev.hour === hour && prev.minute === minute
          ? null
          : { staffId: sid, hour, minute },
      );
    },
    [canEdit, currentDate, storeNow],
  );

  const handleBookSlot = useCallback(
    (sid: number, hour: number, minute: number) => {
      if (!isStaffSlotBookable(currentDate, hour, minute, storeNow)) return;
      // Use formatInTz so dateStr is the salon-local date, not the UTC date
      const dateStr = formatInTz(currentDate, timezone, "yyyy-MM-dd");
      const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      navigate(`/client-lookup?staffId=${sid}&date=${dateStr}&time=${timeStr}`);
    },
    [currentDate, navigate, storeNow, timezone],
  );

  // ── Appointment quick actions ──────────────────────────────────────────────
  const handleQuickStart = useCallback(
    (apt: any) => {
      updateAppointment.mutate({ id: apt.id, status: "started" } as any, {
        onSuccess: () => {
          setSelectedAppointment((prev: any) => prev?.id === apt.id ? { ...prev, status: "started" } : prev);
          toast({ title: "Service started" });
        },
      });
    },
    [updateAppointment, toast],
  );

  const handleQuickComplete = useCallback(
    (apt: any) => {
      updateAppointment.mutate({ id: apt.id, status: "completed" } as any, {
        onSuccess: () => {
          setSelectedAppointment(null);
          toast({ title: "Appointment completed" });
        },
      });
    },
    [updateAppointment, toast],
  );

  const handleQuickCancel = useCallback(
    (apt: any) => {
      setSelectedAppointment(apt);
      setShowCancelConfirm(true);
    },
    [],
  );

  const confirmCancel = useCallback(() => {
    if (!selectedAppointment) return;
    updateAppointment.mutate(
      { id: selectedAppointment.id, status: "cancelled", cancellationReason: "Cancelled by staff" } as any,
      {
        onSuccess: () => {
          setSelectedAppointment(null);
          setShowCancelConfirm(false);
          toast({ title: "Appointment cancelled" });
        },
      },
    );
  }, [selectedAppointment, updateAppointment, toast]);

  const handleMarkNoShow = useCallback(
    (apt: any) => {
      updateAppointment.mutate({ id: apt.id, status: "no_show", cancellationReason: "No Show" } as any, {
        onSuccess: () => {
          setSelectedAppointment(null);
          toast({ title: "Marked as no-show" });
        },
      });
    },
    [updateAppointment, toast],
  );

  const handleEdit = useCallback(
    (apt: any) => {
      setSelectedAppointment(null);
      navigate(`/staff-pos?appointmentId=${apt.id}`);
    },
    [navigate],
  );

  const handleReschedule = useCallback(
    (apt: any) => {
      setSelectedAppointment(null);
      navigate(`/booking/new?editId=${apt.id}&reschedule=1`);
    },
    [navigate],
  );

  const handleRebook = useCallback(
    (apt: any) => {
      const params = new URLSearchParams();
      if (apt.customerId) params.set("customerId", String(apt.customerId));
      if (apt.staffId)    params.set("staffId",    String(apt.staffId));
      if (apt.serviceId)  params.set("serviceId",  String(apt.serviceId));
      setSelectedAppointment(null);
      navigate(`/booking/new?${params.toString()}`);
    },
    [navigate],
  );

  const handleCheckout = useCallback(
    (apt: any) => {
      setSelectedAppointment(null);
      navigate(`/staff-pos?appointmentId=${apt.id}`);
    },
    [navigate],
  );

  const handleSendReview = useCallback(
    async (apt: any) => {
      setReviewSending(true);
      try {
        const res = await fetch(`/api/appointments/${apt.id}/send-review-request`, {
          method: "POST",
          credentials: "include",
        });
        const data = await res.json();
        if (res.ok) {
          setReviewSent(true);
          toast({ title: "Review request sent!", description: "Your client will receive a text shortly." });
        } else {
          toast({ title: "Could not send", description: data.error || "Review requests require SMS + a Google review URL.", variant: "destructive" });
        }
      } catch {
        toast({ title: "Failed to send", variant: "destructive" });
      } finally {
        setReviewSending(false);
      }
    },
    [toast],
  );

  // ── Realtime: invalidate appointments + turn queue on WebSocket notification ─
  useEffect(() => {
    if (!selectedStore?.id) return;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/notifications?storeId=${selectedStore?.id}`);
    ws.onmessage = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      if (turnSystem) {
        queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility", selectedStore?.id] });
      }
    };
    ws.onerror = () => ws.close();
    return () => { try { ws.close(); } catch { /* ignore */ } };
  }, [selectedStore?.id, queryClient, turnSystem]);

  // ── Realtime: turn eligibility changed via window event ────────────────────
  useEffect(() => {
    if (!turnSystem || !selectedStore?.id) return;
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility", selectedStore?.id] });
    };
    window.addEventListener("turn-eligibility-changed", invalidate);
    return () => window.removeEventListener("turn-eligibility-changed", invalidate);
  }, [turnSystem, selectedStore?.id, queryClient]);

  // ── Loading guard ──────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Derived display values ─────────────────────────────────────────────────
  const staffName  = ownStaff?.name ?? user?.firstName ?? "Staff";
  const staffColor = ownStaff ? (staffColorMap.get(ownStaff.id) ?? "#3b82f6") : "#3b82f6";
  const initials   = (staffName[0] ?? "S").toUpperCase();
  const aptStatus  = selectedAppointment
    ? (STATUS_CFG[selectedAppointment.status] ?? STATUS_CFG.confirmed)
    : null;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col bg-background overflow-hidden" style={{ height: "100dvh" }}>

      {/* ── Main content area (fills between header and bottom nav) ── */}
      <div className="flex-1 relative overflow-hidden">

        {/* Calendar */}
        <div className="absolute inset-0 flex overflow-hidden">
          {/* Staff calendar — full width normally; shrinks when TURN panel is visible */}
          <div className="flex-1 min-w-0 overflow-hidden">
            <MobileCalendarView
              filteredStaff={filteredStaff}
              timeSlots={timeSlots}
              START_HOUR={START_HOUR}
              END_HOUR={END_HOUR}
              TOTAL_HOURS={TOTAL_HOURS}
              HOUR_HEIGHT={HOUR_HEIGHT}
              getAppointmentsForStaff={getAppointmentsForStaff}
              getAppointmentStyle={getAppointmentStyle}
              getStaffColor={getStaffColor}
              timezone={timezone}
              selectedAppointment={selectedAppointment}
              onSelectAppointment={(apt) => {
                setSelectedAppointment(apt);
                setShowCancelConfirm(false);
              }}
              handleSlotClick={handleSlotClick}
              selectedSlot={selectedSlot}
              setSelectedSlot={(s) => setSelectedSlot(s)}
              handleBookSlot={handleBookSlot}
              isToday={isToday}
              timeLinePosition={timeLinePosition}
              timeLineLabel={timeLineLabel}
              showPrices={showPrices}
              lateGracePeriodMinutes={lateGracePeriodMinutes}
              storeNow={storeNow}
              isPastDate={isPastDate}
              settings={settings}
              weekDayLabels={weekDayLabels}
              currentDate={currentDate}
              onSelectDate={(date) => {
                if (isStaffDateSelectable(date, storeNow)) {
                  setCurrentDate(date);
                }
              }}
              onNewBooking={() => {}}
              onLookup={() => {}}
              selectedStaffId={staffId ?? "all"}
              onFilterStaff={() => {}}
              onQuickStart={handleQuickStart}
              onQuickComplete={handleQuickComplete}
              onQuickCancel={handleQuickCancel}
              goToday={() => setCurrentDate(storeNow)}
              onOpenDatePicker={() => setShowDatePicker(true)}
              calView={calView}
              onToggleCalView={() => setCalView(v => v === "grid" ? "agenda" : "grid")}
              staffList={staffList as any[]}
              isStaffUser={true}
              tToday="Today"
              tAllStaff="All Staff"
              allStaffAvailability={allStaffAvailability ?? []}
              businessStartMin={BUSINESS_START_HOUR * 60 + (BUSINESS_OPEN_MINUTE ?? 0)}
              businessEndMin={BUSINESS_END_HOUR * 60}
              businessIsClosed={businessIsClosed ?? false}
              turnSystem={turnSystem}
              showTurnPanel={showTurnPanel}
              onToggleTurnPanel={() => setShowTurnPanel((v) => !v)}
              myTurnPos={myTurnPos}
              turnEligibility={turnEligibility}
              currentStaffId={staffId}
              weekAppointments={weekAppointments}
            />
          </div>

          {/* TURN queue panel — shown only when toggled via header button */}
          {turnSystem && showTurnPanel && (
            <StaffTurnPanel turnEligibility={turnEligibility} />
          )}
        </div>
      </div>

      {/* ── Bottom nav ── */}
      <StaffPortalNav />

      {/* ─── QR fetch loading overlay ─────────────────────────────────────────── */}
      {qrFetchingId && (
        <div className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-11 h-11 border-4 border-teal-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-white text-sm font-medium">Opening booking…</p>
          </div>
        </div>
      )}

      {/* ─── Appointment detail sheet — full screen ──────────────────────────── */}
      <AppointmentTicketSheet
        apt={selectedAppointment}
        open={!!selectedAppointment && !showCancelConfirm}
        onClose={() => { setSelectedAppointment(null); setReviewSent(false); }}
        onStart={handleQuickStart}
        onCheckout={handleCheckout}
        onComplete={handleQuickComplete}
        onEdit={handleEdit}
        onCancel={handleQuickCancel}
        onReschedule={handleReschedule}
        onMarkNoShow={handleMarkNoShow}
        onSendReview={handleSendReview}
        onRebook={handleRebook}
        isUpdating={updateAppointment.isPending}
        canEdit={canEdit}
        canCancel={canCancel}
        canReschedule={canReschedule}
        canViewClients={canViewClients}
        canViewContact={canViewContact}
        showPrices={showPrices}
        posEnabled={posEnabled}
        staffList={staffList as any[]}
        getStaffColor={getStaffColor}
        timezone={timezone}
        storeNow={storeNow}
        lateGracePeriodMinutes={lateGracePeriodMinutes}
        reviewSent={reviewSent}
        reviewSending={reviewSending}
      />

      {/* ─── Cancel confirmation ─────────────────────────────────────────────── */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end">
          <div className="w-full bg-white dark:bg-[#0f172a] rounded-t-3xl px-5 pt-5 pb-8 shadow-2xl">
            <div className="flex justify-center mb-4">
              <div className="w-9 h-1 rounded-full bg-gray-200 dark:bg-gray-700" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
              Cancel appointment?
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              Cancel{" "}
              <span className="font-medium text-gray-700 dark:text-gray-300">
{(selectedAppointment?.customer as any)?.fullName ?? selectedAppointment?.customer?.name ?? "this client"}
              </span>
              's appointment. This cannot be undone.
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                className="w-full py-3.5 rounded-2xl bg-red-600 text-white font-semibold text-[15px] active:scale-[0.98] transition-transform"
                onClick={confirmCancel}
                disabled={updateAppointment.isPending}
              >
                {updateAppointment.isPending ? "Cancelling…" : "Yes, cancel"}
              </button>
              <button
                className="w-full py-3.5 rounded-2xl border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-semibold text-[15px] active:scale-[0.98] transition-transform"
                onClick={() => setShowCancelConfirm(false)}
              >
                Keep appointment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Date picker overlay ─────────────────────────────────────────────── */}
      {showDatePicker && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-[#0a0f1e] flex flex-col">
          <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100 dark:border-gray-800">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white">Select Date</h2>
            <button
              className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500"
              onClick={() => setShowDatePicker(false)}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 flex items-start justify-center pt-4 overflow-auto">
            <Calendar
              mode="single"
              selected={currentDate}
              disabled={{ before: todayStoreDate }}
              onSelect={(date) => {
                if (
                  date &&
                  isStaffDateSelectable(date, storeNow)
                ) {
                  setCurrentDate(date);
                  setShowDatePicker(false);
                }
              }}
              className="rounded-md"
              initialFocus
            />
          </div>
        </div>
      )}
    </div>
  );
}


// ─── StaffCommissionsTab ──────────────────────────────────────────────────────

function StaffCommissionsTab({
  staffId,
  ownStaff,
  appointments,
  payrollSettings,
  timezone,
}: {
  staffId: number | undefined;
  ownStaff: any;
  appointments: AppointmentWithDetails[];
  payrollSettings: PayrollSettingsData;
  timezone: string;
}) {
  const [expandedPeriod, setExpandedPeriod] = useState<number | null>(null);

  if (!staffId || !ownStaff?.commissionEnabled) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center">
        <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          <DollarSign className="w-7 h-7 text-slate-400" />
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Commission tracking is not enabled for your account.
        </p>
      </div>
    );
  }

  const rate = Number(ownStaff.commissionRate || 0);
  const storeNowForPay = getNowInTimezone(timezone);
  const currentPeriod = getPayPeriod(payrollSettings, storeNowForPay, timezone);
  const current = calcCommission(appointments, staffId, currentPeriod.from, currentPeriod.to, timezone, rate);

  const pastPeriods = getPastPayPeriods(payrollSettings, 13, storeNowForPay, timezone).slice(1);

  const freqLabel: Record<string, string> = {
    weekly: "Weekly", biweekly: "Bi-Weekly", semimonthly: "Semi-Monthly", monthly: "Monthly",
  };

  return (
    <div className="px-4 pt-5 pb-8 space-y-4">

      {/* ── Current period hero card ── */}
      <div className="rounded-2xl overflow-hidden shadow-sm"
           style={{ background: `linear-gradient(135deg, ${ownStaff.color ?? "#3b82f6"}dd, ${ownStaff.color ?? "#3b82f6"}88)` }}>
        <div className="px-5 pt-5 pb-6 text-white">
          <div className="flex items-center gap-2 mb-1 opacity-80">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Current Period</span>
          </div>
          <p className="text-xs opacity-70 mb-4">
            {currentPeriod.from.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            {" – "}
            {currentPeriod.to.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>

          <p className="text-4xl font-bold tracking-tight mb-1">
            ${current.commission.toFixed(2)}
          </p>
          <p className="text-sm opacity-75">at {rate}% commission</p>

          <div className="mt-5 grid grid-cols-3 gap-3">
            {[
              { label: "Services", value: current.apts.length },
              { label: "Revenue", value: `$${current.total.toFixed(0)}` },
              { label: "Frequency", value: freqLabel[payrollSettings.frequency] ?? payrollSettings.frequency },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/15 rounded-xl px-3 py-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wide opacity-75 mb-0.5">{label}</p>
                <p className="font-bold text-sm">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Upcoming services (today's completed) ── */}
      {current.apts.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1 mb-2">
            Services This Period
          </p>
          <div className="bg-white dark:bg-[#0f172a] rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-100 dark:divide-slate-800">
            {current.apts.map((apt) => {
              const svcPrice = Number(apt.service?.price || 0);
              const addonPrice = apt.appointmentAddons?.reduce((s, aa) => s + Number(aa.addon?.price || 0), 0) ?? 0;
              const aptTotal = svcPrice + addonPrice;
              return (
                <div key={apt.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-slate-100 dark:bg-slate-800">
                    <Clock className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                      {apt.service?.name ?? "Service"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatInTz(apt.date, timezone, "MMM d, h:mm a")}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      ${(aptTotal * rate / 100).toFixed(2)}
                    </p>
                    <p className="text-[10px] text-slate-400">${aptTotal.toFixed(2)} rev</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Past payout history ── */}
      <div>
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1 mb-2">
          Payout History
        </p>
        <div className="bg-white dark:bg-[#0f172a] rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-100 dark:divide-slate-800">
          {pastPeriods.map((period, idx) => {
            const result = calcCommission(appointments, staffId, period.from, period.to, timezone, rate);
            const isExpanded = expandedPeriod === idx;
            return (
              <div key={idx}>
                <button
                  className="w-full px-4 py-3.5 flex items-center gap-3 active:bg-slate-50 dark:active:bg-slate-800/50 transition-colors text-left"
                  onClick={() => setExpandedPeriod(isExpanded ? null : idx)}
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-green-50 dark:bg-green-950/40">
                    <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{period.label}</p>
                    <p className="text-xs text-slate-500">{result.apts.length} service{result.apts.length !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn(
                      "text-sm font-bold",
                      result.commission > 0 ? "text-green-600 dark:text-green-400" : "text-slate-400",
                    )}>
                      ${result.commission.toFixed(2)}
                    </span>
                    <ChevronDown className={cn(
                      "w-4 h-4 text-slate-400 transition-transform",
                      isExpanded && "rotate-180",
                    )} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
                    {result.apts.length === 0 ? (
                      <p className="px-5 py-3 text-sm text-slate-400 text-center">No completed services this period</p>
                    ) : (
                      <>
                        {result.apts.map((apt) => {
                          const svcPrice = Number(apt.service?.price || 0);
                          const addonPrice = apt.appointmentAddons?.reduce((s, aa) => s + Number(aa.addon?.price || 0), 0) ?? 0;
                          const aptTotal = svcPrice + addonPrice;
                          return (
                            <div key={apt.id} className="px-5 py-2.5 flex items-center gap-2 text-sm">
                              <span className="flex-1 text-slate-700 dark:text-slate-300 truncate">
                                {apt.service?.name ?? "Service"} · {formatInTz(apt.date, timezone, "MMM d")}
                              </span>
                              <span className="text-slate-500 shrink-0">${aptTotal.toFixed(2)}</span>
                              <span className="text-green-600 dark:text-green-400 font-medium shrink-0 w-16 text-right">
                                +${(aptTotal * rate / 100).toFixed(2)}
                              </span>
                            </div>
                          );
                        })}
                        <div className="px-5 py-2.5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 text-sm font-semibold">
                          <span className="text-slate-700 dark:text-slate-300">Period total</span>
                          <span className="text-green-600 dark:text-green-400">${result.commission.toFixed(2)}</span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
