import { useEffect, useRef, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFeatureFlags } from "@/hooks/use-features";
import { Link } from "react-router-dom";
import {
  DollarSign, Calendar, Users, Users2, Star, Crown, ShieldAlert,
  AlertTriangle, AlertCircle, TrendingUp, TrendingDown,
  CreditCard, Banknote, Gift, ChevronRight, Wifi, WifiOff,
  Clock, BarChart3, Bell, CheckCircle2, UserCheck, Sparkles,
  UserPlus, Radio, PhoneCall, PackageX, Scissors, MessageSquareText,
  CalendarPlus, Package, X, HelpCircle, ArrowRight, Activity,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth";
import { useSelectedStore } from "@/hooks/use-store";
import { NotificationBell } from "@/components/NotificationBell";
import { formatInTz, getHourInTz } from "@/lib/timezone";
import { format, formatDistanceToNowStrict } from "date-fns";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { useDashboardWs } from "@/hooks/use-dashboard-ws";
import type { DashboardData } from "@/lib/dashboardTypes";

// ── Helpers ────────────────────────────────────────────────────────────────────

function greeting(name: string | null, tz: string) {
  const h = getHourInTz(new Date(), tz);
  const time = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  return `Good ${time}${name ? `, ${name}` : ""}! 👋`;
}

function statusLabel(status: string) {
  switch (status) {
    case "completed": return { label: "Completed",  cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" };
    case "started":   return { label: "In Service", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" };
    case "waiting":   return { label: "Waiting",    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" };
    case "no_show":   return { label: "No Show",    cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" };
    default:          return { label: "Upcoming",   cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" };
  }
}

function formatDuration(mins: number) {
  if (!mins || mins <= 0) return "—";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function feedRelativeTime(iso: string, now: Date): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return format(new Date(iso), "MMM d, h:mm a");
}

function elapsedSince(iso: string, now: Date): string {
  const diffSec = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000));
  const m = Math.floor(diffSec / 60);
  const s = diffSec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-muted", className)} />;
}

// ── Section Header ────────────────────────────────────────────────────────────
function SectionHeader({ title, to, toLabel = "View all" }: { title: string; to?: string; toLabel?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-bold text-foreground">{title}</h2>
      {to && (
        <Link to={to} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors">
          {toLabel} <ChevronRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}

// ── Card Wrapper ──────────────────────────────────────────────────────────────
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl bg-card border border-border shadow-sm", className)}>
      {children}
    </div>
  );
}

// ── Live Dot ──────────────────────────────────────────────────────────────────
function LiveBadge({ label = "LIVE" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
      </span>
      {label}
    </span>
  );
}

function ConnectionDot({ connected, lastUpdated }: { connected: boolean; lastUpdated: Date | null }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="relative flex h-2 w-2">
        {connected && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
        <span className={cn("relative inline-flex rounded-full h-2 w-2", connected ? "bg-emerald-500" : "bg-muted-foreground/40")} />
      </span>
      <span className="text-xs text-muted-foreground hidden sm:inline">
        {connected ? lastUpdated ? `Updated ${formatDistanceToNowStrict(lastUpdated, { addSuffix: true })}` : "Live" : "Reconnecting…"}
      </span>
      {connected
        ? <Wifi className="w-3 h-3 text-emerald-500 hidden sm:inline" />
        : <WifiOff className="w-3 h-3 text-muted-foreground/40 hidden sm:inline" />}
    </div>
  );
}

// ── Live Clock ────────────────────────────────────────────────────────────────
function LiveClock({ timezone }: { timezone: string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [timezone]);
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <span>{formatInTz(now, timezone, "MMM d, yyyy")}</span>
      <span className="font-mono font-semibold text-foreground tabular-nums">{formatInTz(now, timezone, "h:mm a")}</span>
    </div>
  );
}

// ── Avatar initials ───────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "bg-violet-100 text-violet-700",
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];
function initials(name: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || "?";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function hashColor(name: string | null) {
  const n = name || "";
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function StaffAvatar({ name, url, size = "sm" }: { name: string | null; url?: string | null; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "w-7 h-7 text-[10px]" : "w-8 h-8 text-xs";
  if (url) return <img src={url} alt={name || ""} className={cn("rounded-full object-cover shrink-0", sz)} />;
  return (
    <div className={cn("rounded-full flex items-center justify-center font-semibold shrink-0", sz, hashColor(name))}>
      {initials(name)}
    </div>
  );
}

// ══ FEED ICON CONFIG ═══════════════════════════════════════════════════════════
const FEED_ICON_CONFIG: Record<string, { icon: React.ElementType; iconColor: string; iconBg: string }> = {
  check_in:          { icon: UserCheck,       iconColor: "text-blue-600",    iconBg: "bg-blue-100" },
  service_completed: { icon: CheckCircle2,    iconColor: "text-emerald-600", iconBg: "bg-emerald-100" },
  payment:           { icon: DollarSign,      iconColor: "text-emerald-600", iconBg: "bg-emerald-100" },
  ai_booking:        { icon: Sparkles,        iconColor: "text-violet-600",  iconBg: "bg-violet-100" },
  walk_in:           { icon: UserPlus,        iconColor: "text-sky-600",     iconBg: "bg-sky-100" },
  vip_arrival:       { icon: Crown,           iconColor: "text-amber-600",   iconBg: "bg-amber-100" },
  review:            { icon: Star,            iconColor: "text-amber-600",   iconBg: "bg-amber-100" },
  new_booking:       { icon: CalendarPlus,    iconColor: "text-indigo-600",  iconBg: "bg-indigo-100" },
  call_answered:     { icon: PhoneCall,       iconColor: "text-cyan-600",    iconBg: "bg-cyan-100" },
  low_stock:         { icon: PackageX,        iconColor: "text-red-600",     iconBg: "bg-red-100" },
};
const FEED_ICON_DEFAULT = { icon: MessageSquareText, iconColor: "text-muted-foreground", iconBg: "bg-muted" };

// ══════════════════════════════════════════════════════════════════════════════
//  SECTION COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

// ── KPI Card (top row) ────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon, iconBg, iconColor, title, primary, sub, badge, to, toLabel,
}: {
  icon: React.ElementType; iconBg: string; iconColor: string;
  title: string; primary: React.ReactNode;
  sub?: React.ReactNode; badge?: React.ReactNode;
  to?: string; toLabel?: string;
}) {
  const inner = (
    <div className="rounded-2xl bg-card border border-border p-5 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 h-full flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", iconBg)}>
          <Icon className={cn("w-5 h-5", iconColor)} />
        </div>
        {badge}
      </div>
      <div className="flex-1">
        <p className="text-xs font-medium text-muted-foreground mb-0.5">{title}</p>
        <div className="text-3xl font-bold text-foreground leading-none">{primary}</div>
      </div>
      {sub && <div className="mt-auto text-xs text-muted-foreground">{sub}</div>}
      {to && (
        <Link to={to} className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 mt-1 w-fit">
          {toLabel ?? "View Details"} <ChevronRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
  return to ? <div className="h-full">{inner}</div> : <div className="h-full">{inner}</div>;
}

// ── What's Happening Right Now ────────────────────────────────────────────────
function WhatsHappeningNow({ data, isLoading }: { data: DashboardData | null; isLoading: boolean }) {
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const inService = data?.schedule.filter((a) => a.status === "started") ?? [];
  const waiting = data?.schedule.filter((a) => a.status === "waiting") ?? [];
  const working = data?.today.team.working ?? 0;
  const lateAppts = data?.schedule.filter((a) => {
    if (a.status !== "started") return false;
    if (!a.startedAt) return false;
    const elapsed = (clock.getTime() - new Date(a.startedAt).getTime()) / 60000;
    return elapsed > (a.duration || 60);
  }) ?? [];

  const rows = [
    {
      icon: Users,
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
      label: `${inService.length} client${inService.length !== 1 ? "s" : ""} in the salon`,
      to: "/calendar",
      toLabel: "View live activity",
      live: true,
    },
    {
      icon: Clock,
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
      label: `${waiting.length} client${waiting.length !== 1 ? "s" : ""} waiting`,
      to: "/calendar",
      toLabel: "View wait list",
    },
    {
      icon: Scissors,
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-600",
      label: `${working} stylist${working !== 1 ? "s" : ""} currently working`,
      to: "/payouts/contractors",
      toLabel: "View team schedule",
    },
    {
      icon: AlertTriangle,
      iconBg: "bg-red-100",
      iconColor: "text-red-600",
      label: `${lateAppts.length} appointment${lateAppts.length !== 1 ? "s" : ""} running late`,
      to: "/calendar",
      toLabel: "View details",
      hidden: lateAppts.length === 0,
    },
  ];

  return (
    <Card className="overflow-hidden h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-bold text-foreground">What's Happening Right Now</h2>
        <LiveBadge />
      </div>
      {isLoading ? (
        <div className="p-4 space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <div className="p-4 space-y-1">
          {rows.filter((r) => !r.hidden).map((row, i) => (
            <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/30 transition-colors group">
              <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0", row.iconBg)}>
                <row.icon className={cn("w-4 h-4", row.iconColor)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{row.label}</p>
                {row.to && (
                  <Link to={row.to} className="text-xs text-primary hover:underline flex items-center gap-0.5 w-fit">
                    {row.toLabel} <ChevronRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
            </div>
          ))}
          {rows.every((r) => r.hidden || (r.label.startsWith("0"))) && (
            <div className="text-center py-6 text-sm text-muted-foreground">All quiet for now</div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Team Member Status ────────────────────────────────────────────────────────

type TurnTechDashboard = {
  id: number;
  name: string;
  avatarUrl?: string | null;
  clockedIn: boolean;
  currentStatus: "available" | "busy" | "on_break";
  turnPosition?: number | null;
  turnCount?: number;
};

type StaffStatusEntry = {
  id: number | null;
  name: string;
  avatarUrl: string | null;
  currentStatus: "available" | "busy" | "on_break";
  turnPosition?: number | null;
  turnCount?: number;
  apptRef: { startedAt: string | null; duration: number } | null;
};

function formatTimerSecs(totalSecs: number): string {
  const abs = Math.abs(totalSecs);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const sign = totalSecs < 0 ? "-" : "";
  if (h > 0) return `${sign}${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${sign}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function TeamMemberTimer({
  apptRef,
  status,
}: {
  apptRef: StaffStatusEntry["apptRef"];
  status: StaffStatusEntry["currentStatus"];
}) {
  const mountRef = useRef(Date.now());
  const [, setTick] = useState(0);

  // Reset count-up baseline whenever status transitions away from busy
  // so the elapsed timer restarts at 0 for the new Available/Break phase.
  useEffect(() => {
    if (status !== "busy") {
      mountRef.current = Date.now();
      setTick(0);
    }
  }, [status]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const now = Date.now();

  if (status === "busy") {
    // Count DOWN from ticket duration. Red when negative.
    const durSecs = (apptRef?.duration ?? 0) * 60;
    const elapsed = apptRef?.startedAt
      ? Math.floor((now - new Date(apptRef.startedAt).getTime()) / 1000)
      : 0;
    const remaining = durSecs - elapsed;
    return (
      <span className={cn(
        "font-mono text-xs font-bold tabular-nums",
        remaining < 0 ? "text-red-500" : "text-foreground",
      )}>
        {formatTimerSecs(remaining)}
      </span>
    );
  }

  // Available / Break: count UP from 1s. Orange when elapsed > ticket duration.
  const elapsed = Math.max(1, Math.floor((now - mountRef.current) / 1000));
  const durSecs = apptRef ? (apptRef.duration ?? 0) * 60 : null;
  const over = durSecs !== null && durSecs > 0 && elapsed > durSecs;
  return (
    <span className={cn(
      "font-mono text-xs font-bold tabular-nums",
      over ? "text-orange-500" : "text-foreground",
    )}>
      {formatTimerSecs(elapsed)}
    </span>
  );
}

function StatusBadge({ status }: { status: StaffStatusEntry["currentStatus"] }) {
  if (status === "busy") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
        Busy
      </span>
    );
  }
  if (status === "on_break") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
        Break
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
      Available
    </span>
  );
}

function TeamMemberStatus({
  schedule,
  isLoading,
}: {
  schedule: DashboardData["schedule"];
  isLoading: boolean;
}) {
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;
  const flags = useFeatureFlags();
  const turnEnabled = flags.turnSystem;

  const { data: turnData, isLoading: turnLoading } = useQuery<{
    eligibleTechnicians: TurnTechDashboard[];
    technicians: TurnTechDashboard[];
  }>({
    queryKey: ["/api/turn/eligibility", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/turn/eligibility?storeId=${storeId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch turn eligibility");
      return res.json();
    },
    enabled: !!storeId && turnEnabled,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  // Map staffId → most relevant appointment (prefer "started" over others)
  const apptByStaffId = useMemo(() => {
    const map = new Map<number, DashboardData["schedule"][0]>();
    for (const a of schedule) {
      if (!a.staffId) continue;
      const cur = map.get(a.staffId);
      if (!cur || a.status === "started") map.set(a.staffId, a);
    }
    return map;
  }, [schedule]);

  // Map staffName → most relevant appointment (fallback for non-turn stores)
  const apptByName = useMemo(() => {
    const map = new Map<string, DashboardData["schedule"][0]>();
    for (const a of schedule) {
      if (!a.staffName) continue;
      const cur = map.get(a.staffName);
      if (!cur || a.status === "started") map.set(a.staffName, a);
    }
    return map;
  }, [schedule]);

  const entries = useMemo((): StaffStatusEntry[] => {
    if (turnEnabled) {
      // When turn system is on, only use turn eligibility data — never fall back
      // to non-turn schedule derivation which would silently misrepresent statuses.
      if (!turnData) return [];
      return (turnData.technicians ?? [])
        .filter((t) => t.clockedIn)
        .map((t) => {
          const a = apptByStaffId.get(t.id) ?? null;
          return {
            id: t.id,
            name: t.name,
            avatarUrl: t.avatarUrl ?? null,
            currentStatus: t.currentStatus,
            turnPosition: t.turnPosition,
            turnCount: t.turnCount,
            apptRef: a ? { startedAt: a.startedAt, duration: a.duration } : null,
          };
        });
    }
    // Non-turn: one entry per unique staff member from today's schedule
    const seen = new Set<string>();
    return schedule
      .filter((a) => {
        if (!a.staffName || seen.has(a.staffName)) return false;
        seen.add(a.staffName);
        return true;
      })
      .map((a) => {
        const latest = apptByName.get(a.staffName!);
        return {
          id: a.staffId,
          name: a.staffName!,
          avatarUrl: a.staffAvatarThumbUrl ?? null,
          currentStatus: latest?.status === "started" ? "busy" : "available",
          apptRef: latest ? { startedAt: latest.startedAt, duration: latest.duration } : null,
        };
      });
  }, [turnEnabled, turnData, schedule, apptByStaffId, apptByName]);

  const cardLoading = isLoading || (turnEnabled && turnLoading && !turnData);

  const busyCount = entries.filter((e) => e.currentStatus === "busy").length;
  const availCount = entries.filter((e) => e.currentStatus === "available").length;
  const breakCount = entries.filter((e) => e.currentStatus === "on_break").length;

  return (
    <Card className="overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-bold text-foreground">Team Member Status</h2>
        <LiveBadge />
      </div>

      {cardLoading ? (
        <div className="p-4 space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center px-4">
          <Users className="w-8 h-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">
            {turnEnabled ? "No team members clocked in" : "No team members on the floor today"}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {entries.map((entry) => (
            <div
              key={entry.id ?? entry.name}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors"
            >
              {/* Avatar */}
              <StaffAvatar name={entry.name} url={entry.avatarUrl} size="md" />

              {/* Name + turn info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{entry.name}</p>
                {turnEnabled && (
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {entry.turnPosition != null && entry.turnPosition < 999 && (
                      <span className="text-[10px] text-muted-foreground leading-none">
                        <span className="font-semibold text-foreground">
                          #{(entry.turnPosition as number) + 1}
                        </span>{" "}
                        turn
                      </span>
                    )}
                    {(entry.turnCount ?? 0) > 0 && (
                      <span className="text-[10px] text-muted-foreground leading-none">
                        {entry.turnCount} completed
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Status badge + timer stacked on the right */}
              <div className="flex flex-col items-end gap-1 shrink-0">
                <StatusBadge status={entry.currentStatus} />
                <TeamMemberTimer apptRef={entry.apptRef} status={entry.currentStatus} />
              </div>
            </div>
          ))}
        </div>
      )}

      {!cardLoading && entries.length > 0 && (
        <div className="px-4 py-2 border-t border-border text-[11px] text-muted-foreground flex items-center justify-between">
          <span>
            {busyCount > 0 && `${busyCount} busy`}
            {busyCount > 0 && availCount > 0 && " · "}
            {availCount > 0 && `${availCount} available`}
            {breakCount > 0 && ` · ${breakCount} on break`}
          </span>
          <Link to="/calendar" className="text-primary hover:underline font-medium">
            View Calendar →
          </Link>
        </div>
      )}
    </Card>
  );
}

// ── Today's Financial Summary ─────────────────────────────────────────────────
function TodayFinancials({ data, isLoading }: { data: DashboardData | null; isLoading: boolean }) {
  const fin = data?.todayFinancials;
  const paymentConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
    card:      { label: "Card",       icon: CreditCard, color: "text-blue-500" },
    cash:      { label: "Cash",       icon: Banknote,   color: "text-emerald-500" },
    gift_card: { label: "Gift Cards", icon: Gift,       color: "text-violet-500" },
  };

  return (
    <Card className="overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-bold text-foreground">Today's Financial Summary</h2>
        <Link to="/salon-earnings" className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-0.5">
          View Report <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {isLoading ? (
        <div className="p-4 space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
      ) : (
        <div className="flex-1 p-4 space-y-0">
          {/* Revenue lines */}
          {[
            { label: "Total Revenue",   value: fin?.totalRevenue ?? 0, bold: false },
            { label: "Service Sales",   value: fin?.serviceSales ?? 0, bold: false },
            { label: "Product Sales",   value: fin?.productSales ?? 0, bold: false },
            { label: "Tips",            value: fin?.tips ?? 0,         bold: false },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-sm text-muted-foreground">{row.label}</span>
              <span className={cn("text-sm font-semibold text-foreground")}>
                <AnimatedNumber value={row.value} format="currency" />
              </span>
            </div>
          ))}

          {/* Total payments */}
          <div className="flex items-center justify-between py-2.5 border-b border-border">
            <span className="text-sm font-semibold text-foreground">Total Payments</span>
            <span className="text-sm font-bold text-foreground">
              <AnimatedNumber value={fin?.totalPayments ?? 0} format="currency" />
            </span>
          </div>

          {/* By method */}
          <div className="pt-1 pb-1 space-y-1">
            {Object.entries(fin?.byMethod ?? {})
              .filter(([k]) => k in paymentConfig)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([key, amount]) => {
                const cfg = paymentConfig[key];
                if (!cfg) return null;
                return (
                  <div key={key} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2">
                      <cfg.icon className={cn("w-3.5 h-3.5", cfg.color)} />
                      <span className="text-xs text-muted-foreground">{cfg.label}</span>
                    </div>
                    <span className="text-xs font-semibold text-foreground">
                      <AnimatedNumber value={amount as number} format="currency" />
                    </span>
                  </div>
                );
              })}
          </div>

          {/* Outstanding */}
          <div className="flex items-center justify-between py-2.5 border-t border-border mt-1">
            <span className="text-sm text-muted-foreground">Outstanding Balance</span>
            <span className={cn(
              "text-sm font-bold",
              (fin?.outstandingBalance ?? 0) > 0 ? "text-red-600" : "text-emerald-600 dark:text-emerald-400",
            )}>
              <AnimatedNumber value={fin?.outstandingBalance ?? 0} format="currency" />
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Top Services Today ────────────────────────────────────────────────────────
function TopServicesToday({ services, isLoading }: { services: DashboardData["topServices"]; isLoading: boolean }) {
  return (
    <Card className="overflow-hidden h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-bold text-foreground">Top Services Today</h2>
        <Link to="/services" className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-0.5">
          View All Services <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {isLoading ? (
        <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : services.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center px-4">
          <BarChart3 className="w-8 h-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">No completed services yet today</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {services.map((svc) => (
            <div key={svc.rank} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
              <span className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                svc.rank === 1 ? "bg-amber-100 text-amber-700" :
                svc.rank === 2 ? "bg-slate-100 text-slate-600" :
                svc.rank === 3 ? "bg-orange-100 text-orange-600" :
                "bg-muted text-muted-foreground",
              )}>{svc.rank}</span>
              <span className="flex-1 text-sm font-medium text-foreground truncate">{svc.name}</span>
              <span className="text-sm font-semibold text-foreground shrink-0">
                <AnimatedNumber value={svc.revenue} format="currency" />
              </span>
              <span className="text-xs text-muted-foreground shrink-0 w-8 text-right">({svc.count})</span>
            </div>
          ))}
        </div>
      )}
      {!isLoading && (
        <div className="px-4 py-2 border-t border-border/50 text-[10px] text-muted-foreground">
          ($) Revenue &nbsp;&nbsp;(#) Number of Services
        </div>
      )}
    </Card>
  );
}

// ── Team Performance Today ────────────────────────────────────────────────────
function TeamPerformanceToday({ team, isLoading }: { team: DashboardData["teamPerformance"]; isLoading: boolean }) {
  return (
    <Card className="overflow-hidden h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-bold text-foreground">Team Performance Today</h2>
        <Link to="/commission-report" className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-0.5">
          View Team Report <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {isLoading ? (
        <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : team.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center px-4">
          <Users2 className="w-8 h-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">No team data yet today</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-2 bg-muted/30 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            <span>Name</span>
            <span className="text-right">Sales</span>
            <span className="text-right">Appts</span>
            <span className="text-right w-16">Avg Ticket</span>
          </div>
          <div className="divide-y divide-border">
            {team.map((member, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center px-4 py-3 hover:bg-muted/20 transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <StaffAvatar name={member.name} size="sm" />
                  <span className="text-sm font-medium text-foreground truncate">{member.name.split(" ")[0]}</span>
                </div>
                <span className="text-sm font-semibold text-foreground text-right">
                  <AnimatedNumber value={member.sales} format="currency" />
                </span>
                <span className="text-sm font-semibold text-foreground text-right">{member.appointments}</span>
                <span className="text-sm font-semibold text-foreground text-right w-16">
                  <AnimatedNumber value={member.avgTicket} format="currency" />
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

// ── Client Loyalty Snapshot ───────────────────────────────────────────────────
function ClientLoyaltySnapshot({ snapshot, isLoading }: { snapshot: DashboardData["clientLoyaltySnapshot"] | undefined; isLoading: boolean }) {
  const rows = [
    { icon: Crown,      iconBg: "bg-amber-100",   iconColor: "text-amber-600",   label: "VIP Clients",           value: snapshot?.vipClients ?? 0 },
    { icon: Users,      iconBg: "bg-emerald-100",  iconColor: "text-emerald-600", label: "Regulars (Returning)",  value: snapshot?.regulars ?? 0 },
    { icon: UserPlus,   iconBg: "bg-blue-100",     iconColor: "text-blue-600",    label: "New Clients This Month",value: snapshot?.newThisMonth ?? 0 },
    { icon: ShieldAlert,iconBg: "bg-red-100",      iconColor: "text-red-600",     label: "Clients At Risk",       value: snapshot?.atRisk ?? 0 },
  ];

  return (
    <Card className="overflow-hidden h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-bold text-foreground">Client Loyalty Snapshot</h2>
        <Link to="/customers" className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-0.5">
          View Loyalty <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {isLoading ? (
        <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", row.iconBg)}>
                <row.icon className={cn("w-4 h-4", row.iconColor)} />
              </div>
              <span className="flex-1 text-sm text-foreground">{row.label}</span>
              <span className="text-lg font-bold text-foreground">
                <AnimatedNumber value={row.value} />
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Recent Activity ───────────────────────────────────────────────────────────
function RecentActivity({ items, isLoading, connected }: { items: DashboardData["recentActivity"]; isLoading: boolean; connected: boolean }) {
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const seenIdsRef = useRef<Set<number>>(new Set());
  const [freshIds, setFreshIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (isLoading) return undefined;
    const incoming = items.map((i) => i.id);
    const newlySeen = incoming.filter((id) => !seenIdsRef.current.has(id));
    incoming.forEach((id) => seenIdsRef.current.add(id));
    if (newlySeen.length > 0 && seenIdsRef.current.size > newlySeen.length) {
      setFreshIds(new Set(newlySeen));
      const t = setTimeout(() => setFreshIds(new Set()), 2500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [items, isLoading]);

  useEffect(() => {
    if (!isLoading && seenIdsRef.current.size === 0) items.forEach((i) => seenIdsRef.current.add(i.id));
  }, [isLoading, items]);

  return (
    <Card className="overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Activity className={cn("w-3.5 h-3.5 text-primary", connected && "animate-pulse")} />
          <h2 className="text-sm font-bold text-foreground">Recent Activity</h2>
        </div>
        <Link to="/activity" className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-0.5">
          View All Activity <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {isLoading ? (
        <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center px-4">
          <Radio className="w-8 h-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">Nothing yet today</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-border max-h-64">
          {items.map((item) => {
            const cfg = FEED_ICON_CONFIG[item.eventType] || FEED_ICON_DEFAULT;
            const Icon = cfg.icon;
            const isFresh = freshIds.has(item.id);
            return (
              <div
                key={item.id}
                className={cn(
                  "flex items-start gap-3 px-4 py-3 transition-colors duration-700",
                  isFresh ? "bg-primary/[0.06] animate-in slide-in-from-top-2 fade-in duration-300" : "bg-transparent",
                )}
              >
                <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5", cfg.iconBg)}>
                  <Icon className={cn("w-3.5 h-3.5", cfg.iconColor)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground leading-snug">{item.message}</p>
                  <span className="text-[10px] text-muted-foreground">{feedRelativeTime(item.createdAt, clock)}</span>
                </div>
                {item.amount != null && (
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                    ${item.amount.toFixed(2)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── Reminders & Alerts ────────────────────────────────────────────────────────
function RemindersAlerts({ items, isLoading }: { items: DashboardData["needsAttention"]; isLoading: boolean }) {
  const alertIcon = (priority: string) => {
    if (priority === "high") return { Icon: AlertCircle, color: "text-red-600", bg: "bg-red-100" };
    if (priority === "medium") return { Icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-100" };
    return { Icon: Bell, color: "text-blue-600", bg: "bg-blue-100" };
  };
  const linkConfig: Record<string, string> = {
    lost_clients: "/customers",
    no_shows: "/calendar",
    waiting: "/calendar",
  };

  return (
    <Card className="overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-bold text-foreground">Reminders & Alerts</h2>
        <Link to="/calendar" className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-0.5">
          View All <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {isLoading ? (
        <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center px-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-500/50 mb-2" />
          <p className="text-sm text-muted-foreground">All clear — nothing needs attention right now</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-border max-h-64">
          {items.map((item, i) => {
            const { Icon, color, bg } = alertIcon(item.priority);
            return (
              <Link
                key={i}
                to={linkConfig[item.type] || "/calendar"}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors group"
              >
                <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0", bg)}>
                  <Icon className={cn("w-3.5 h-3.5", color)} />
                </div>
                <p className="flex-1 text-xs text-foreground leading-snug">{item.label}</p>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── AI Receptionist ───────────────────────────────────────────────────────────
function AiReceptionistCard({ ai, isLoading }: { ai: DashboardData["aiReceptionist"] | undefined; isLoading: boolean }) {
  return (
    <Card className="overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-violet-600" />
          </div>
          <h2 className="text-sm font-bold text-foreground">AI Receptionist</h2>
        </div>
        <LiveBadge />
      </div>
      {isLoading ? (
        <div className="p-4 space-y-3"><Skeleton className="h-8" /><Skeleton className="h-16" /></div>
      ) : (
        <div className="flex-1 p-4 flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">Your AI Receptionist is live and answering calls.</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Today's Calls", value: ai?.todayCalls ?? 0 },
              { label: "Booked",        value: ai?.booked ?? 0 },
              { label: "Missed",        value: ai?.missed ?? 0 },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl bg-muted/40 border border-border/50 p-3 text-center">
                <p className="text-xl font-bold text-foreground"><AnimatedNumber value={stat.value} /></p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{stat.label}</p>
              </div>
            ))}
          </div>
          <Link
            to="/manage/ai-receptionist"
            className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted/40 transition-colors mt-auto"
          >
            <PhoneCall className="w-4 h-4" />
            View Call Logs
          </Link>
        </div>
      )}
    </Card>
  );
}

// ── Upcoming Appointments ─────────────────────────────────────────────────────
function UpcomingAppointments({ schedule, isLoading }: { schedule: DashboardData["schedule"]; isLoading: boolean }) {
  const upcoming = schedule.filter((a) => ["confirmed", "pending", "waiting"].includes(a.status));
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-bold text-foreground">Upcoming Appointments</h2>
        <Link to="/calendar" className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-0.5">
          View Calendar <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {isLoading ? (
        <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : upcoming.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center px-4">
          <Calendar className="w-8 h-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">No upcoming appointments</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[80px_1fr_1fr_1fr_100px] gap-2 px-4 py-2 bg-muted/30 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            <span>TIME</span><span>CLIENT</span><span>SERVICE</span><span>STAFF</span><span className="text-right">STATUS</span>
          </div>
          <div className="divide-y divide-border">
            {upcoming.slice(0, 5).map((apt) => {
              const { label, cls } = statusLabel(apt.status);
              return (
                <div key={apt.id} className="grid grid-cols-[80px_1fr_1fr_1fr_100px] gap-2 items-center px-4 py-2.5 hover:bg-muted/20 transition-colors">
                  <span className="text-xs font-mono text-muted-foreground">{format(new Date(apt.time), "h:mm a")}</span>
                  <span className="text-xs font-medium text-foreground truncate">{apt.customerName}</span>
                  <span className="text-xs text-muted-foreground truncate">{apt.serviceName}</span>
                  <span className="text-xs text-muted-foreground truncate">{apt.staffName || "—"}</span>
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full text-right justify-self-end whitespace-nowrap", cls)}>{label}</span>
                </div>
              );
            })}
          </div>
          <div className="px-4 py-2.5 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
            <span>{upcoming.length} upcoming • {schedule.filter((a) => a.status === "waiting").length} waiting</span>
            <Link to="/calendar" className="text-primary hover:underline font-medium">View All Appointments →</Link>
          </div>
        </>
      )}
    </Card>
  );
}

// ── Inventory Alerts ──────────────────────────────────────────────────────────
function InventoryAlertsCard({ alerts, isLoading }: { alerts: DashboardData["inventoryAlerts"]; isLoading: boolean }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-bold text-foreground">Inventory Alerts</h2>
        <Link to="/products" className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-0.5">
          View Inventory <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {isLoading ? (
        <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center px-4">
          <Package className="w-8 h-8 text-emerald-500/50 mb-2" />
          <p className="text-sm text-muted-foreground">All inventory levels are healthy</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 px-4 py-2 bg-muted/30 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            <span>ITEM</span><span>CATEGORY</span><span className="text-right">STOCK</span><span className="text-right">STATUS</span>
          </div>
          <div className="divide-y divide-border">
            {alerts.map((item, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center px-4 py-2.5 hover:bg-muted/20 transition-colors">
                <span className="text-xs font-medium text-foreground truncate">{item.name}</span>
                <span className="text-xs text-muted-foreground">{item.category || "—"}</span>
                <span className="text-xs font-semibold text-foreground text-right">{item.stock}</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 whitespace-nowrap">Low Stock</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

// ── Salon at a Glance ─────────────────────────────────────────────────────────
function SalonAtAGlance({ glance, isLoading }: { glance: DashboardData["glanceStats"] | undefined; isLoading: boolean }) {
  const stats = [
    { label: "Walk-ins Today",    value: glance?.walkInsToday ?? 0,       format: "number" as const },
    { label: "Average Wait Time", value: glance?.avgWaitMinutes ?? 0,     format: "time" as const },
    { label: "Occupancy Rate",    value: glance?.occupancyPct ?? 0,        format: "pct" as const },
    { label: "Client Retention",  value: glance?.clientRetentionPct ?? 0, format: "pct" as const },
    { label: "Average Ticket",    value: glance?.avgTicket ?? 0,           format: "currency" as const },
    { label: "Tips %",            value: glance?.tipsPct ?? 0,             format: "pct1" as const },
  ];

  function renderValue(v: number, f: string) {
    if (f === "currency") return <AnimatedNumber value={v} format="currency" />;
    if (f === "pct")  return <>{v}%</>;
    if (f === "pct1") return <>{v.toFixed(1)}%</>;
    if (f === "time") return <>{v} min</>;
    return <AnimatedNumber value={v} />;
  }

  return (
    <div className="rounded-2xl bg-primary/5 border border-primary/20 px-6 py-5">
      <h2 className="text-xs font-bold text-primary uppercase tracking-widest mb-4">Salon at a Glance</h2>
      {isLoading ? (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10" />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 text-center">
          {stats.map((s, i) => (
            <div key={i}>
              <p className="text-xl font-bold text-foreground">{renderValue(s.value, s.format)}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function OwnerDashboard() {
  const { user } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;
  const timezone = selectedStore?.timezone || "UTC";
  const storeName = selectedStore?.name || "your salon";

  const { data, connected, lastUpdated, isError } = useDashboardWs(storeId);

  const firstName = user?.firstName || null;
  const isLoading = !data;

  // Derived data with fallbacks
  const today = data?.today;
  const schedule = data?.schedule ?? [];
  const newClients = data?.newClientsThisWeek;
  const topServices = data?.topServices ?? [];
  const teamPerf = data?.teamPerformance ?? [];
  const aiReceptionist = data?.aiReceptionist;
  const inventoryAlerts = data?.inventoryAlerts ?? [];
  const needsAttention = data?.needsAttention ?? [];
  const recentActivity = data?.recentActivity ?? [];
  const glanceStats = data?.glanceStats;
  const loyaltySnapshot = data?.clientLoyaltySnapshot;

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Error banner ─────────────────────────────────────────────── */}
        {isError && !connected && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30 px-5 py-3 flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-400 font-medium">Live connection lost — reconnecting in the background.</p>
          </div>
        )}

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{greeting(firstName, timezone)}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Here's what's happening at <span className="font-medium text-foreground">{storeName}</span> right now.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <LiveClock timezone={timezone} />
            <ConnectionDot connected={connected} lastUpdated={lastUpdated} />
            <NotificationBell />
          </div>
        </div>

        {/* ── ROW 1: 4 KPI cards ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Today's Revenue */}
          <KpiCard
            icon={DollarSign} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600 dark:text-emerald-400"
            title="Today's Revenue"
            primary={isLoading ? <Skeleton className="h-8 w-24 inline-block" /> : <AnimatedNumber value={today?.revenue ?? 0} format="currency" />}
            badge={!isLoading && today?.revenueDiff !== undefined ? (
              <span className={cn("flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full",
                today.revenueDiff >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600")}>
                {today.revenueDiff >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                <AnimatedNumber value={Math.abs(today.revenueDiff)} format="currency" duration={600} />
                {" vs yesterday"}
              </span>
            ) : undefined}
            sub={<span>{today?.appointments?.completed ?? 0} completed • {today?.appointments?.inService ?? 0} in service</span>}
            to="/salon-earnings" toLabel="View Details"
          />

          {/* Today's Appointments */}
          <KpiCard
            icon={Calendar} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600 dark:text-blue-400"
            title="Today's Appointments"
            primary={isLoading ? <Skeleton className="h-8 w-16 inline-block" /> : <AnimatedNumber value={today?.totalAppointments ?? 0} />}
            sub={isLoading ? undefined : (
              <span>
                {today?.appointments?.completed ?? 0} completed • {today?.appointments?.upcoming ?? 0} upcoming
                {(today?.appointments?.waiting ?? 0) > 0 && ` • ${today?.appointments?.waiting} waiting`}
                {(today?.appointments?.noShow ?? 0) > 0 && ` • ${today?.appointments?.noShow} no show`}
              </span>
            )}
            to="/calendar" toLabel="View Calendar"
          />

          {/* New Clients This Week */}
          <KpiCard
            icon={Users} iconBg="bg-violet-100 dark:bg-violet-900/30" iconColor="text-violet-600 dark:text-violet-400"
            title="New Clients This Week"
            primary={isLoading ? <Skeleton className="h-8 w-16 inline-block" /> : <AnimatedNumber value={newClients?.count ?? 0} />}
            badge={!isLoading && newClients !== undefined ? (
              <span className={cn("flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full",
                (newClients.vsLastWeek ?? 0) >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600")}>
                {(newClients.vsLastWeek ?? 0) >= 0 ? "+" : ""}{newClients.vsLastWeek} vs last week
              </span>
            ) : undefined}
            to="/customers" toLabel="View Clients"
          />

          {/* Returning Clients */}
          <KpiCard
            icon={Users2} iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600 dark:text-amber-400"
            title="Returning Clients"
            primary={isLoading ? <Skeleton className="h-8 w-16 inline-block" /> : <AnimatedNumber value={data?.clientLoyalty?.returningClients ?? 0} />}
            sub={!isLoading ? <span>{data?.clientLoyalty?.retentionPct ?? 0}% returning rate</span> : undefined}
            to="/customers" toLabel="View Loyalty"
          />
        </div>

        {/* ── ROW 2: What's Happening | Schedule | Financials ──────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5" style={{ minHeight: 340 }}>
          <WhatsHappeningNow data={data} isLoading={isLoading} />
          <TeamMemberStatus schedule={schedule} isLoading={isLoading} />
          <TodayFinancials data={data} isLoading={isLoading} />
        </div>

        {/* ── ROW 3: Top Services | Team | Client Loyalty ──────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <TopServicesToday services={topServices} isLoading={isLoading} />
          <TeamPerformanceToday team={teamPerf} isLoading={isLoading} />
          <ClientLoyaltySnapshot snapshot={loyaltySnapshot} isLoading={isLoading} />
        </div>

        {/* ── ROW 4: Recent Activity | Alerts | AI Receptionist ────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5" style={{ minHeight: 280 }}>
          <RecentActivity items={recentActivity} isLoading={isLoading} connected={connected} />
          <RemindersAlerts items={needsAttention} isLoading={isLoading} />
          <AiReceptionistCard ai={aiReceptionist} isLoading={isLoading} />
        </div>

        {/* ── ROW 5: Upcoming Appointments | Inventory Alerts ──────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <UpcomingAppointments schedule={schedule} isLoading={isLoading} />
          <InventoryAlertsCard alerts={inventoryAlerts} isLoading={isLoading} />
        </div>

        {/* ── ROW 6: Salon at a Glance (full width) ────────────────────── */}
        <SalonAtAGlance glance={glanceStats} isLoading={isLoading} />

      </div>
    </AppLayout>
  );
}
