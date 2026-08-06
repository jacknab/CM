import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useLanguage } from "@/hooks/use-language";
import { useAppointments } from "@/hooks/use-appointments";
import { useAuth } from "@/hooks/use-auth";
import { useSelectedStore } from "@/hooks/use-store";
import { useStaffList } from "@/hooks/use-staff";
import { formatInTz, toStoreLocal, getNowInTimezone } from "@/lib/timezone";
import {
  isSameDay, subDays, startOfMonth, endOfMonth, isWithinInterval,
  format, addMinutes, startOfDay, endOfDay, eachDayOfInterval, getDay, getHours,
} from "date-fns";
import { NotificationBell } from "@/components/NotificationBell";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, LabelList,
  AreaChart, Area, CartesianGrid, Tooltip, PieChart, Pie, Legend,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, Brain, TrendingUp, TrendingDown, Users, Zap,
  AlertCircle, Clock, UserX, CalendarX, Target, Edit2, CheckCircle2,
  ChevronRight, ChevronDown, DollarSign, BellOff, X, Calendar, Scissors,
  User, CreditCard, FileText, Receipt, Phone, PhoneCall, CheckCircle,
  XCircle, PhoneIncoming, Star, ArrowUpRight, ArrowDownRight, Award,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AppointmentWithDetails } from "@shared/schema";

// ── Chart colours ──────────────────────────────────────────────────────────────
const CHART_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316"];

// ── Dashboard cache helpers ────────────────────────────────────────────────────
function dashCacheKey(type: string, storeId: number) {
  return `certxa_dash_${type}_${storeId}`;
}
function readDashCache<T>(type: string, storeId: number): T | undefined {
  try {
    const raw = localStorage.getItem(dashCacheKey(type, storeId));
    if (!raw) return undefined;
    const { data, cachedAt } = JSON.parse(raw);
    if (Date.now() - cachedAt > 24 * 60 * 60 * 1000) return undefined;
    return data as T;
  } catch { return undefined; }
}
function writeDashCache(type: string, storeId: number, data: unknown) {
  try {
    localStorage.setItem(dashCacheKey(type, storeId), JSON.stringify({ data, cachedAt: Date.now() }));
  } catch {}
}

// ── Grade colour ───────────────────────────────────────────────────────────────
function GradeColorClass(grade: string) {
  if (grade === "A") return "text-emerald-600";
  if (grade === "B") return "text-blue-600";
  if (grade === "C") return "text-amber-600";
  if (grade === "D") return "text-orange-600";
  return "text-red-600";
}

// ── Growth Score widget ────────────────────────────────────────────────────────
function GrowthScoreWidget({ storeId }: { storeId: number }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/intelligence/growth-score", storeId],
    placeholderData: () => readDashCache("growth_score", storeId),
    networkMode: "always",
    queryFn: async () => {
      if (!navigator.onLine) return readDashCache("growth_score", storeId) ?? null;
      const res = await fetch(`/api/intelligence/growth-score?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) return readDashCache("growth_score", storeId) ?? null;
      const d = await res.json();
      writeDashCache("growth_score", storeId, d);
      return d;
    },
    enabled: !!storeId,
    staleTime: 10 * 60 * 1000,
  });

  const { data: dashData } = useQuery<any>({
    queryKey: ["/api/intelligence/dashboard", storeId],
    placeholderData: () => readDashCache("dashboard", storeId),
    networkMode: "always",
    queryFn: async () => {
      if (!navigator.onLine) return readDashCache("dashboard", storeId) ?? null;
      const res = await fetch(`/api/intelligence/dashboard?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) return readDashCache("dashboard", storeId) ?? null;
      const d = await res.json();
      writeDashCache("dashboard", storeId, d);
      return d;
    },
    enabled: !!storeId,
    staleTime: 10 * 60 * 1000,
  });

  const score = data?.live;
  const summary = dashData?.summary;

  const size = 88;
  const r = 34;
  const circ = 2 * Math.PI * r;
  const dash = score ? (score.overallScore / 100) * circ : 0;

  const strokeColor =
    !score ? "#6366f1" :
    score.overallScore >= 85 ? "#10b981" :
    score.overallScore >= 70 ? "#3b82f6" :
    score.overallScore >= 55 ? "#f59e0b" :
    score.overallScore >= 40 ? "#f97316" :
    "#ef4444";

  if (isLoading) {
    return (
      <div className="rounded-2xl p-6 bg-card border border-border shadow-sm flex items-center justify-center h-36">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const hasData = score?.hasData !== false;

  return (
    <Link to="/intelligence" className="block group">
      <div className="rounded-2xl p-5 bg-card border border-border/60 shadow-sm hover:shadow-md hover:border-primary/25 transition-all duration-200 group-hover:scale-[1.01]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-violet-500" />
            <p className="text-sm text-muted-foreground font-medium">Business Health</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
        </div>

        {(!score || !hasData) && !isLoading && (
          <div className="flex flex-col items-center justify-center py-3 gap-1.5 text-center">
            <span className="text-2xl">📊</span>
            <p className="text-xs font-medium text-foreground">No data yet</p>
            <p className="text-[11px] text-muted-foreground">Start booking clients to see your health score</p>
          </div>
        )}

        {score && hasData && (
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
              <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={7} />
                <circle
                  cx={size / 2} cy={size / 2} r={r}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={7}
                  strokeDasharray={`${dash} ${circ - dash}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-2xl font-bold leading-none ${GradeColorClass(score.grade)}`}>{score.grade}</span>
                <span className="text-[10px] text-muted-foreground mt-0.5">{score.overallScore}/100</span>
              </div>
            </div>

            <div className="flex-1 min-w-0 space-y-1.5">
              {Object.entries(score.components).map(([key, comp]: [string, any]) => {
                const labelMap: Record<string, string> = {
                  retention: "Retention", rebooking: "Rebooking",
                  utilization: "Utilization", revenue: "Revenue", newClients: "New clients",
                };
                return (
                  <div key={key} className="flex items-center gap-2.5">
                    <div className="w-14 flex-shrink-0">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${comp.score}%`,
                            backgroundColor: comp.score >= 75 ? "#10b981" : comp.score >= 50 ? "#f59e0b" : "#ef4444"
                          }}
                        />
                      </div>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{labelMap[key] ?? key}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {score && hasData && summary && (summary.driftingClients > 0 || summary.atRiskClients > 0) && (
          <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">
              {summary.driftingClients > 0 && (
                <span className="text-amber-600 font-medium">{summary.driftingClients} drifting</span>
              )}
              {summary.driftingClients > 0 && summary.atRiskClients > 0 && " · "}
              {summary.atRiskClients > 0 && (
                <span className="text-orange-600 font-medium">{summary.atRiskClients} at risk</span>
              )}
              <span> — tap to act</span>
            </p>
          </div>
        )}

        {score && hasData && (!summary || (summary.driftingClients === 0 && summary.atRiskClients === 0)) && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              {score.insights?.[0] || "All client metrics look healthy"}
            </p>
          </div>
        )}
      </div>
    </Link>
  );
}

// ── Revenue Co-pilot ───────────────────────────────────────────────────────────
const digestIcons: Record<string, React.ReactNode> = {
  no_show_risk: <UserX className="h-4 w-4 text-red-500" />,
  critical_churn: <AlertCircle className="h-4 w-4 text-orange-500" />,
  cancellation_recovery: <CalendarX className="h-4 w-4 text-amber-500" />,
  high_ltv_drifting: <Users className="h-4 w-4 text-violet-500" />,
  rebooking_nudge: <Clock className="h-4 w-4 text-blue-500" />,
};

const copilotGradient: Record<string, { bg: string; accent: string; icon: React.ReactNode }> = {
  no_show_risk:          { bg: "from-red-950 to-red-900",     accent: "text-red-300",    icon: <UserX className="h-5 w-5 text-red-300" /> },
  critical_churn:        { bg: "from-orange-950 to-orange-900", accent: "text-orange-300", icon: <AlertCircle className="h-5 w-5 text-orange-300" /> },
  cancellation_recovery: { bg: "from-amber-950 to-amber-900",  accent: "text-amber-300",  icon: <CalendarX className="h-5 w-5 text-amber-300" /> },
  high_ltv_drifting:     { bg: "from-violet-950 to-violet-900", accent: "text-violet-300", icon: <Users className="h-5 w-5 text-violet-300" /> },
  rebooking_nudge:       { bg: "from-blue-950 to-blue-900",    accent: "text-blue-300",   icon: <Clock className="h-5 w-5 text-blue-300" /> },
};

const SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000;
function snoozeKey(storeId: number, type: string) { return `copilot_snooze_${storeId}_${type}`; }
function getSnoozedTypes(storeId: number): Set<string> {
  const now = Date.now();
  const snoozed = new Set<string>();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(`copilot_snooze_${storeId}_`)) continue;
    const expiry = parseInt(localStorage.getItem(key) || "0");
    if (now < expiry) {
      snoozed.add(key.replace(`copilot_snooze_${storeId}_`, ""));
    } else {
      localStorage.removeItem(key);
    }
  }
  return snoozed;
}

function RevenueCopilotWidget({ storeId, hasAnyData }: { storeId: number; hasAnyData: boolean }) {
  const [snoozed, setSnoozed] = useState<Set<string>>(() => getSnoozedTypes(storeId));
  const [snoozeAnim, setSnoozeAnim] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/intelligence/daily-digest", storeId],
    placeholderData: () => readDashCache("daily_digest", storeId),
    networkMode: "always",
    queryFn: async () => {
      if (!navigator.onLine) return readDashCache("daily_digest", storeId) ?? null;
      const res = await fetch(`/api/intelligence/daily-digest?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) return readDashCache("daily_digest", storeId) ?? null;
      const d = await res.json();
      writeDashCache("daily_digest", storeId, d);
      return d;
    },
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return null;

  const allActions: any[] = data?.actions || [];
  const visibleActions = allActions.filter((a) => !snoozed.has(a.type));
  const topAction = visibleActions[0] ?? null;
  const snoozedCount = allActions.length - visibleActions.length;
  const remainingCount = visibleActions.length - 1;

  const handleSnooze = (type: string) => {
    const expiry = Date.now() + SNOOZE_DURATION_MS;
    localStorage.setItem(snoozeKey(storeId, type), String(expiry));
    setSnoozeAnim(true);
    setTimeout(() => {
      setSnoozed(getSnoozedTypes(storeId));
      setSnoozeAnim(false);
    }, 350);
  };

  if (!topAction) {
    if (!hasAnyData) {
      return (
        <div className="rounded-2xl bg-gradient-to-br from-violet-950 to-indigo-950 border border-violet-700/40 p-5 mb-6 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-violet-800/50 flex items-center justify-center flex-shrink-0">
            <Zap className="h-5 w-5 text-violet-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-violet-200">Ready to grow your business?</p>
            <p className="text-xs text-violet-400 mt-0.5">
              Add your first client and booking — your Revenue Co-pilot will start surfacing insights as your data builds up.
            </p>
          </div>
          <Link
            to="/customers"
            className="flex items-center gap-1.5 bg-violet-700/60 hover:bg-violet-600/70 transition-colors text-violet-100 text-xs font-semibold px-3 py-2 rounded-xl flex-shrink-0"
          >
            Add client
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      );
    }
    return (
      <div className="rounded-2xl bg-emerald-950 border border-emerald-800/40 p-5 mb-6 flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-emerald-800/50 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="h-5 w-5 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-emerald-300">You're ahead of it</p>
          <p className="text-xs text-emerald-500 mt-0.5">
            No urgent actions right now — all revenue signals look healthy.
            {snoozedCount > 0 && (
              <button
                onClick={() => {
                  allActions.forEach((a) => localStorage.removeItem(snoozeKey(storeId, a.type)));
                  setSnoozed(new Set());
                }}
                className="ml-2 underline hover:text-emerald-400 transition-colors"
              >
                ({snoozedCount} snoozed — tap to restore)
              </button>
            )}
          </p>
        </div>
      </div>
    );
  }

  const style = copilotGradient[topAction.type] || copilotGradient.critical_churn;
  const hasRevenue = (topAction.revenueAtStake || 0) > 0;

  return (
    <div
      className={`rounded-2xl bg-gradient-to-br ${style.bg} border border-white/10 p-5 mb-6 transition-opacity duration-300 ${snoozeAnim ? "opacity-0" : "opacity-100"}`}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          {style.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-bold tracking-widest uppercase text-white/40">Revenue Co-pilot</p>
              {remainingCount > 0 && (
                <span className="text-[10px] bg-white/10 text-white/50 px-1.5 py-0.5 rounded-full font-medium">
                  +{remainingCount} more
                </span>
              )}
            </div>
            <button
              onClick={() => handleSnooze(topAction.type)}
              title="Snooze for 24 hours"
              className="flex items-center gap-1 text-white/30 hover:text-white/60 transition-colors text-[11px] ml-2 flex-shrink-0"
            >
              <BellOff className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Snooze 24h</span>
            </button>
          </div>
          <p className="text-base font-bold text-white leading-snug">{topAction.label}</p>
          <p className="text-sm text-white/50 mt-1 leading-snug">{topAction.detail}</p>

          <div className="flex items-center justify-between mt-4 gap-3">
            {hasRevenue ? (
              <div className="flex items-center gap-1.5">
                <DollarSign className={`h-3.5 w-3.5 ${style.accent}`} />
                <span className={`text-sm font-bold ${style.accent}`}>
                  ${Math.round(topAction.revenueAtStake).toLocaleString()}
                </span>
                <span className="text-xs text-white/40">at stake</span>
              </div>
            ) : (
              <div />
            )}
            <Link
              to={`/intelligence?tab=${topAction.tab}`}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 transition-colors text-white text-sm font-semibold px-4 py-2 rounded-xl"
            >
              {topAction.ctaLabel}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Revenue Goal Tracker ───────────────────────────────────────────────────────
function RevenueGoalTracker({ currentRevenue, storageKey }: { currentRevenue: number; storageKey: string }) {
  const [goal, setGoal] = useState<number>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? parseInt(saved) : 0;
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const progress = goal > 0 ? Math.min(100, Math.round((currentRevenue / goal) * 100)) : 0;
  const remaining = goal > 0 ? Math.max(0, goal - currentRevenue) : 0;
  const isHit = goal > 0 && currentRevenue >= goal;

  const handleSave = () => {
    const val = parseInt(draft.replace(/[^0-9]/g, ""));
    if (!isNaN(val) && val > 0) {
      setGoal(val);
      localStorage.setItem(storageKey, String(val));
    }
    setEditing(false);
  };

  if (goal === 0 && !editing) {
    return (
      <button
        onClick={() => { setDraft(""); setEditing(true); }}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Target className="h-3.5 w-3.5" />
        Set a monthly goal
      </button>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Target className={`h-3.5 w-3.5 flex-shrink-0 ${isHit ? "text-emerald-600" : "text-amber-500"}`} />
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="number"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
                placeholder="e.g. 5000"
                className="w-24 text-xs border border-border rounded px-2 py-0.5 bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
              <button onClick={handleSave} className="text-emerald-600 hover:text-emerald-700 text-xs font-medium">Save</button>
              <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground text-xs">×</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-muted-foreground truncate">
                Goal: <span className="text-foreground font-semibold">${goal.toLocaleString()}</span>
              </span>
              <button onClick={() => { setDraft(String(goal)); setEditing(true); }} className="text-muted-foreground/50 hover:text-muted-foreground flex-shrink-0">
                <Edit2 className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
        {!editing && (
          <span className={`text-xs font-bold flex-shrink-0 ${isHit ? "text-emerald-600" : "text-amber-500"}`}>
            {isHit ? "🎯" : `${progress}%`}
          </span>
        )}
      </div>
      {!editing && goal > 0 && (
        <>
          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 rounded-full transition-all duration-700 ${isHit ? "bg-emerald-500" : "bg-amber-500"}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          {!isHit && remaining > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1">
              ${remaining.toLocaleString()} to go
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── Smart Digest Widget ────────────────────────────────────────────────────────
const digestColors: Record<string, string> = {
  no_show_risk: "border-l-red-400",
  critical_churn: "border-l-orange-400",
  cancellation_recovery: "border-l-amber-400",
  high_ltv_drifting: "border-l-violet-400",
  rebooking_nudge: "border-l-blue-400",
};

function SmartDigestWidget({ storeId }: { storeId: number }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/intelligence/daily-digest", storeId],
    placeholderData: () => readDashCache("daily_digest", storeId),
    networkMode: "always",
    queryFn: async () => {
      if (!navigator.onLine) return readDashCache("daily_digest", storeId) ?? null;
      const res = await fetch(`/api/intelligence/daily-digest?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) return readDashCache("daily_digest", storeId) ?? null;
      const d = await res.json();
      writeDashCache("daily_digest", storeId, d);
      return d;
    },
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return null;
  if (!data || data.actions?.length === 0) return null;

  return (
    <Link to="/intelligence" className="block group">
      <div className="rounded-2xl border border-border bg-card shadow-sm p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-bold text-foreground">Today's Smart Actions</span>
            <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
              {data.actions.length}
            </span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all" />
        </div>
        <div className="space-y-2">
          {data.actions.map((action: any, i: number) => (
            <div
              key={i}
              className={`flex items-start gap-3 pl-3 border-l-2 ${digestColors[action.type] || "border-l-muted"}`}
            >
              <div className="flex-shrink-0 mt-0.5">{digestIcons[action.type]}</div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight">{action.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{action.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Link>
  );
}

// ── Autumn AI Receptionist widget ──────────────────────────────────────────────
interface DashCallLog {
  id: number;
  callerName: string | null;
  callerPhone: string | null;
  outcome: string;
  durationSeconds: number | null;
  startedAt: string;
  appointmentId: number | null;
  serviceName: string | null;
  notes: string | null;
}
interface DashCallLogsResponse {
  logs: DashCallLog[];
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
}
const AUTUMN_OUTCOME: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  booked:            { label: "Booked",      color: "text-emerald-600", Icon: CheckCircle },
  rescheduled:       { label: "Rescheduled", color: "text-blue-600",    Icon: PhoneCall   },
  cancelled:         { label: "Cancelled",   color: "text-amber-600",   Icon: XCircle     },
  callback_required: { label: "Callback",    color: "text-orange-500",  Icon: Phone       },
  in_progress:       { label: "Live",        color: "text-violet-500",  Icon: PhoneIncoming },
  no_action:         { label: "No action",   color: "text-slate-400",   Icon: Phone       },
  error:             { label: "Error",       color: "text-red-500",     Icon: XCircle     },
};
function formatAutumnDuration(s: number | null): string {
  if (!s || s < 0) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}
function formatAutumnRelative(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function AutumnWidget({ storeId }: { storeId: number }) {
  const { data, isLoading } = useQuery<DashCallLogsResponse>({
    queryKey: ["/api/ai-receptionist/call-logs-widget", storeId],
    queryFn: async () => {
      const res = await fetch("/api/ai-receptionist/call-logs?page=1", { credentials: "include" });
      if (!res.ok) return { logs: [], total: 0, page: 1, totalPages: 1, pageSize: 50 };
      return res.json();
    },
    enabled: !!storeId,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const logs   = data?.logs ?? [];
  const total  = data?.total ?? 0;
  const booked    = logs.filter((l) => l.outcome === "booked").length;
  const callbacks = logs.filter((l) => l.outcome === "callback_required").length;
  const durations = logs.map((l) => l.durationSeconds).filter((d): d is number => d != null && d > 0);
  const avgDur    = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
  const liveCall  = logs.find((l) => l.outcome === "in_progress");
  const recent    = logs.slice(0, 5);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card shadow-sm p-6 mb-6 flex items-center gap-3">
        <Phone className="h-4 w-4 text-violet-400 animate-pulse" />
        <p className="text-sm text-muted-foreground">Loading Autumn…</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
            <Phone className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
          </div>
          <p className="text-sm font-bold text-foreground">Autumn AI Receptionist</p>
          {liveCall && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              LIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Link to="/manage/ai-receptionist/call-logs" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            Call history <ChevronRight className="h-3.5 w-3.5" />
          </Link>
          <Link to="/manage/ai-receptionist" className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 font-semibold transition-colors">
            Manage <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: "Total calls",  value: total,                                       color: "text-foreground"  },
          { label: "Booked",       value: booked,                                      color: "text-emerald-600" },
          { label: "Callbacks",    value: callbacks,                                   color: "text-orange-500"  },
          { label: "Avg duration", value: avgDur ? formatAutumnDuration(avgDur) : "—", color: "text-foreground"  },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl bg-muted/40 border border-border/50 px-3 py-2.5 text-center">
            <p className={`text-lg font-bold font-display leading-none ${color}`}>{value}</p>
            <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {recent.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-6 flex flex-col items-center gap-2 text-center">
          <PhoneIncoming className="h-6 w-6 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">No calls yet</p>
          <p className="text-xs text-muted-foreground/70">Autumn will log every inbound call here once live</p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {recent.map((log) => {
            const cfg = AUTUMN_OUTCOME[log.outcome] ?? AUTUMN_OUTCOME.no_action;
            const { label, color, Icon } = cfg;
            const callerLabel = log.callerName && log.callerName !== "Guest"
              ? log.callerName
              : log.callerPhone
              ? log.callerPhone.replace(/(\+?1?)(\d{3})(\d{3})(\d{4})$/, "($2) $3-$4")
              : "Unknown caller";
            return (
              <div key={log.id} className="flex items-center gap-3 py-2 px-2 rounded-xl hover:bg-muted/40 transition-colors">
                <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} />
                <p className="flex-1 min-w-0 text-sm text-foreground truncate">{callerLabel}</p>
                {log.serviceName && (
                  <span className="text-[10px] font-medium text-violet-600 bg-violet-50 dark:bg-violet-900/20 px-1.5 py-0.5 rounded-md shrink-0 max-w-[100px] truncate">
                    {log.serviceName}
                  </span>
                )}
                {log.appointmentId && !log.serviceName && (
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-md shrink-0">
                    #{log.appointmentId}
                  </span>
                )}
                <span className={`text-xs font-semibold shrink-0 ${color}`}>{label}</span>
                <span className="text-xs text-muted-foreground shrink-0 w-14 text-right">{formatAutumnDuration(log.durationSeconds)}</span>
                <span className="text-[11px] text-muted-foreground shrink-0 w-14 text-right">{formatAutumnRelative(log.startedAt)}</span>
              </div>
            );
          })}
          {total > 5 && (
            <Link to="/manage/ai-receptionist/call-logs" className="flex items-center justify-center gap-1 pt-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
              View all {total.toLocaleString()} calls <ChevronRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
type AnalyticsRange = "7d" | "30d" | "90d";

export default function Analytics() {
  const { user } = useAuth();
  const { selectedStore } = useSelectedStore();
  const { isVi, pick } = useLanguage();
  const timezone = selectedStore?.timezone || "UTC";
  const storeNow = getNowInTimezone(timezone);
  const nowUtc = new Date();
  const navigate = useNavigate();

  // ── Appointment data ──────────────────────────────────────────────────────
  const { data: appointments } = useAppointments();
  const { data: staffList = [] } = useStaffList();
  const [selectedApt, setSelectedApt] = useState<any | null>(null);

  // ── Greeting ──────────────────────────────────────────────────────────────
  const greeting = (() => {
    // storeNow is a "fake-UTC" Date from getNowInTimezone(): its UTC fields hold
    // the salon's wall-clock values, so getUTCHours() is correct here.
    // Never use .getHours() — that applies the *browser* timezone on top.
    const h = storeNow.getUTCHours();
    if (h < 12) return isVi ? "Chào buổi sáng" : "Good morning";
    if (h < 17) return isVi ? "Chào buổi chiều" : "Good afternoon";
    return isVi ? "Chào buổi tối" : "Good evening";
  })();

  // ── Today stats ───────────────────────────────────────────────────────────
  const todayAppointments = useMemo(() =>
    (appointments || []).filter((apt: any) => isSameDay(toStoreLocal(apt.date, timezone), storeNow)),
    [appointments, timezone, storeNow]);

  const yesterdayAppointments = useMemo(() =>
    (appointments || []).filter((apt: any) => isSameDay(toStoreLocal(apt.date, timezone), subDays(storeNow, 1))),
    [appointments, timezone, storeNow]);

  const monthStart = startOfMonth(storeNow);
  const monthEnd = endOfMonth(storeNow);
  const lastMonthStart = startOfMonth(subDays(monthStart, 1));
  const lastMonthEnd = endOfMonth(subDays(monthStart, 1));

  const getRevenue = (appts: any[]) =>
    appts.reduce((sum: number, apt: any) => { const p = parseFloat(apt.totalPaid || "0"); return sum + (isNaN(p) ? 0 : p); }, 0);

  const thisMonthRevenue = useMemo(() =>
    getRevenue((appointments || []).filter((apt: any) => isWithinInterval(toStoreLocal(apt.date, timezone), { start: monthStart, end: monthEnd }))),
    [appointments, monthStart, monthEnd, timezone]);

  const lastMonthRevenue = useMemo(() =>
    getRevenue((appointments || []).filter((apt: any) => isWithinInterval(toStoreLocal(apt.date, timezone), { start: lastMonthStart, end: lastMonthEnd }))),
    [appointments, lastMonthStart, lastMonthEnd, timezone]);

  const monthRevenueChange = lastMonthRevenue > 0
    ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
    : 0;

  const todayCount = todayAppointments.filter((a: any) => a.status !== "cancelled").length;
  const yesterdayCount = yesterdayAppointments.filter((a: any) => a.status !== "cancelled").length;
  const bookingDiff = todayCount - yesterdayCount;

  const staffCount = (staffList as any[]).length || 1;
  const fillRate = Math.min(100, Math.round((todayCount / (staffCount * 8)) * 100));

  const last7Days = Array.from({ length: 7 }, (_, i) => subDays(storeNow, 6 - i));
  const chartData7 = last7Days.map((day) => {
    const dayAppts = (appointments || []).filter((apt: any) => isSameDay(toStoreLocal(apt.date, timezone), day));
    return { day: format(day, "EEE"), revenue: getRevenue(dayAppts), isToday: isSameDay(day, storeNow) };
  });

  const sortedToday = useMemo(() =>
    [...todayAppointments]
      .filter((a: any) => a.status !== "cancelled")
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [todayAppointments]);

  // ── Analytics range ───────────────────────────────────────────────────────
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const rangeStart = startOfDay(subDays(storeNow, days - 1));

  const rangeAppointments = useMemo(() =>
    (appointments as AppointmentWithDetails[] || []).filter(a => new Date(a.date) >= rangeStart && a.status === "completed"),
    [appointments, rangeStart]);

  const allCompleted = useMemo(() =>
    (appointments as AppointmentWithDetails[] || []).filter(a => a.status === "completed"),
    [appointments]);

  const totalRevenue = useMemo(() =>
    rangeAppointments.reduce((sum, a) => sum + parseFloat(a.totalPaid || "0"), 0), [rangeAppointments]);

  const avgTicket = rangeAppointments.length > 0 ? totalRevenue / rangeAppointments.length : 0;

  const uniqueClients = useMemo(() => {
    const ids = new Set(rangeAppointments.map(a => a.customerId).filter(Boolean));
    return ids.size;
  }, [rangeAppointments]);

  const prevRangeStart = subDays(rangeStart, days);
  const prevAppointments = useMemo(() =>
    (appointments as AppointmentWithDetails[] || []).filter(a => {
      const d = new Date(a.date);
      return d >= prevRangeStart && d < rangeStart && a.status === "completed";
    }), [appointments, prevRangeStart, rangeStart]);

  const prevRevenue = prevAppointments.reduce((sum, a) => sum + parseFloat(a.totalPaid || "0"), 0);
  const revenueChange = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;
  const appointmentsChange = prevAppointments.length > 0
    ? ((rangeAppointments.length - prevAppointments.length) / prevAppointments.length) * 100 : 0;

  const revenueByDay = useMemo(() => {
    const interval = eachDayOfInterval({ start: rangeStart, end: storeNow });
    return interval.map(day => {
      const dayAppts = rangeAppointments.filter(a => {
        const d = new Date(a.date);
        return d >= startOfDay(day) && d <= endOfDay(day);
      });
      return {
        date: format(day, days <= 7 ? "EEE" : "MMM d"),
        revenue: dayAppts.reduce((s, a) => s + parseFloat(a.totalPaid || "0"), 0),
        bookings: dayAppts.length,
      };
    });
  }, [rangeAppointments, rangeStart, storeNow, days]);

  const topServices = useMemo(() => {
    const map: Record<string, { name: string; count: number; revenue: number }> = {};
    rangeAppointments.forEach(a => {
      const name = a.service?.name || "Unknown";
      if (!map[name]) map[name] = { name, count: 0, revenue: 0 };
      map[name].count++;
      map[name].revenue += parseFloat(a.totalPaid || "0");
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  }, [rangeAppointments]);

  const staffPerformance = useMemo(() => {
    const map: Record<number, { name: string; count: number; revenue: number }> = {};
    rangeAppointments.forEach(a => {
      if (!a.staffId) return;
      if (!map[a.staffId]) map[a.staffId] = { name: a.staff?.name || "Unknown", count: 0, revenue: 0 };
      map[a.staffId].count++;
      map[a.staffId].revenue += parseFloat(a.totalPaid || "0");
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [rangeAppointments]);

  const bookingsByDow = useMemo(() => {
    const dowNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const counts = Array(7).fill(0);
    rangeAppointments.forEach(a => { counts[getDay(new Date(a.date))]++; });
    return dowNames.map((name, i) => ({ name, bookings: counts[i] }));
  }, [rangeAppointments]);

  const bookingsByHour = useMemo(() => {
    const counts: Record<number, number> = {};
    for (let h = 6; h <= 20; h++) counts[h] = 0;
    rangeAppointments.forEach(a => {
      const h = getHours(new Date(a.date));
      if (h >= 6 && h <= 20) counts[h]++;
    });
    return Object.entries(counts).map(([h, count]) => ({
      hour: `${parseInt(h) % 12 || 12}${parseInt(h) < 12 ? "am" : "pm"}`,
      bookings: count,
    }));
  }, [rangeAppointments]);

  const returningVsNew = useMemo(() => {
    const visitCount: Record<number, number> = {};
    allCompleted.forEach(a => {
      if (a.customerId) visitCount[a.customerId] = (visitCount[a.customerId] || 0) + 1;
    });
    let returning = 0, newC = 0;
    rangeAppointments.forEach(a => {
      if (!a.customerId) { newC++; return; }
      (visitCount[a.customerId] || 0) > 1 ? returning++ : newC++;
    });
    return [{ name: "Returning", value: returning }, { name: "New", value: newC }];
  }, [rangeAppointments, allCompleted]);

  // ── Avatar helpers ────────────────────────────────────────────────────────
  const avatarColors = [
    "from-violet-500 to-purple-600", "from-pink-500 to-rose-500",
    "from-teal-400 to-emerald-500", "from-amber-400 to-orange-500",
    "from-sky-400 to-blue-500", "from-fuchsia-500 to-pink-500",
  ];
  const getAvatarColor = (name: string) => avatarColors[(name?.charCodeAt(0) || 0) % avatarColors.length];
  const getInitials = (name: string) => {
    if (!name) return "?";
    const parts = name.trim().split(" ");
    return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
  };

  const statusStyle: Record<string, string> = {
    confirmed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
    completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
    "no-show": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
    cancelled: "bg-gray-100 text-gray-500",
  };

  const kpiCards = [
    { label: pick({ en: "Total Revenue", vi: "Tổng doanh thu", es: "Ingresos totales", fr: "Revenus totaux" }),
      value: `$${totalRevenue.toFixed(2)}`, change: revenueChange, icon: DollarSign,
      color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950" },
    { label: pick({ en: "Appointments", vi: "Lượt đặt lịch", es: "Citas", fr: "Rendez-vous" }),
      value: rangeAppointments.length, change: appointmentsChange, icon: Calendar,
      color: "text-indigo-500", bg: "bg-indigo-50 dark:bg-indigo-950" },
    { label: pick({ en: "Unique Clients", vi: "Khách hàng mới", es: "Clientes únicos", fr: "Clients uniques" }),
      value: uniqueClients, change: 0, icon: Users,
      color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950" },
    { label: pick({ en: "Avg Ticket", vi: "Hóa đơn trung bình", es: "Ticket promedio", fr: "Ticket moyen" }),
      value: `$${avgTicket.toFixed(2)}`, change: 0, icon: TrendingUp,
      color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-950" },
  ];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-muted-foreground text-sm mb-0.5">
              {formatInTz(nowUtc, timezone, "EEEE, d MMMM")}
            </p>
            <h1 className="text-2xl font-display font-bold text-foreground">
              {greeting}, {user?.firstName || "there"} 👋
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <button
              className="flex items-center gap-2 bg-white border border-slate-200 rounded-full pl-1 pr-3 py-1 shadow-sm hover:bg-slate-50 transition-colors"
              onClick={() => navigate("/account")}
            >
              <div className="w-7 h-7 rounded-full bg-teal-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {([user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("").toUpperCase() || (user?.firstName?.[0] ?? user?.email?.[0] ?? "U").toUpperCase())}
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            </button>
          </div>
        </div>

        {/* ── Revenue Co-pilot ─────────────────────────────────────────────── */}
        {selectedStore?.id && (
          <RevenueCopilotWidget
            storeId={selectedStore.id}
            hasAnyData={!!(appointments && appointments.length > 0)}
          />
        )}

        {/* ── Today's stat cards ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {/* Revenue this month */}
          <div className="rounded-2xl p-5 bg-card border border-border/60 shadow-sm col-span-2 md:col-span-1">
            <p className="text-xs text-muted-foreground mb-3 font-medium">
              {pick({ en: "Revenue this month", vi: "Doanh thu tháng này", es: "Ingresos del mes", fr: "Revenus du mois" })}
            </p>
            <p className="text-2xl font-bold font-display mb-1.5 text-foreground">
              ${thisMonthRevenue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
            {lastMonthRevenue > 0 ? (
              <p className={`text-xs font-medium flex items-center gap-1 ${monthRevenueChange >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {monthRevenueChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {Math.abs(monthRevenueChange)}% {pick({ en: "vs last month", vi: "so với tháng trước", es: "vs mes anterior", fr: "vs mois préc." })}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{pick({ en: "First month", vi: "Tháng đầu tiên", es: "Primer mes", fr: "Premier mois" })}</p>
            )}
            <div className="mt-3 pt-3 border-t border-border/50">
              <RevenueGoalTracker
                currentRevenue={thisMonthRevenue}
                storageKey={`revenue-goal-${selectedStore?.id || "default"}`}
              />
            </div>
          </div>

          {/* Bookings today */}
          <div className="rounded-2xl p-5 bg-card border border-border shadow-sm">
            <p className="text-xs text-muted-foreground mb-3 font-medium">
              {pick({ en: "Bookings today", vi: "Đặt lịch hôm nay", es: "Reservas hoy", fr: "Réservations aujourd'hui" })}
            </p>
            <p className="text-2xl font-bold font-display mb-1.5 text-foreground">{todayCount}</p>
            {yesterdayCount > 0 ? (
              <p className={`text-xs font-medium ${bookingDiff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                {bookingDiff >= 0 ? "↑" : "↓"} {Math.abs(bookingDiff)} {pick({ en: "vs yesterday", vi: "so với hôm qua", es: "vs ayer", fr: "vs hier" })}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{pick({ en: "No data yesterday", vi: "Không có dữ liệu hôm qua", es: "Sin datos ayer", fr: "Pas de données hier" })}</p>
            )}
          </div>

          {/* Fill rate */}
          <div className="rounded-2xl p-5 bg-card border border-border shadow-sm flex flex-col">
            <p className="text-xs text-muted-foreground mb-3 font-medium">
              {pick({ en: "Fill rate", vi: "Tỉ lệ lấp đầy", es: "Tasa de ocupación", fr: "Taux de remplissage" })}
            </p>
            <p className="text-2xl font-bold font-display mb-2 text-foreground">{fillRate}%</p>
            <div className="w-full bg-muted rounded-full h-1.5">
              <div className="h-1.5 rounded-full bg-amber-500 transition-all duration-500" style={{ width: `${fillRate}%` }} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
              {pick({ en: "% of today's available staff slots that are booked. Aim for 70%+.", vi: "% số chỗ nhân viên có sẵn hôm nay đã được đặt. Mục tiêu 70%+.", es: "% de espacios disponibles reservados hoy. Meta 70%+.", fr: "% des créneaux disponibles réservés aujourd'hui. Objectif 70%+." })}
            </p>
          </div>

          {/* Growth Score */}
          {selectedStore?.id ? (
            <div className="col-span-2 md:col-span-2">
              <GrowthScoreWidget storeId={selectedStore.id} />
            </div>
          ) : (
            <div className="rounded-2xl p-5 bg-card border border-border shadow-sm col-span-2 md:col-span-2">
              <p className="text-xs text-muted-foreground mb-3 font-medium">Business Health</p>
              <p className="text-2xl font-bold font-display text-muted-foreground/40">—</p>
            </div>
          )}
        </div>

        {/* ── Smart Daily Digest ────────────────────────────────────────────── */}
        {selectedStore?.id && <SmartDigestWidget storeId={selectedStore.id} />}

        {/* ── Revenue — last 7 days ─────────────────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-6">
          <p className="text-sm font-semibold text-foreground mb-5">
            {pick({ en: "Revenue — last 7 days", vi: "Doanh thu — 7 ngày qua", es: "Ingresos — últimos 7 días", fr: "Revenus — 7 derniers jours" })}
          </p>
          <ResponsiveContainer width="100%" height={185}>
            <BarChart data={chartData7} barSize={28} margin={{ top: 24, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis hide />
              <Bar dataKey="revenue" radius={[6, 6, 6, 6]}>
                {chartData7.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.isToday ? "#f59e0b" : "#7c3aed"} />
                ))}
                <LabelList
                  dataKey="revenue"
                  position="top"
                  formatter={(v: number) => v > 0 ? `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}` : ""}
                  style={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ── Autumn AI Receptionist ────────────────────────────────────────── */}
        {selectedStore?.id && <AutumnWidget storeId={selectedStore.id} />}

        {/* ── Today's Appointments ──────────────────────────────────────────── */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-6">
          <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase mb-4">
            {pick({ en: "Today's Appointments", vi: "Lịch hẹn hôm nay", es: "Citas de hoy", fr: "Rendez-vous d'aujourd'hui" })}
          </p>
          {sortedToday.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {pick({ en: "No appointments scheduled for today.", vi: "Không có lịch hẹn hôm nay.", es: "No hay citas programadas para hoy.", fr: "Aucun rendez-vous prévu aujourd'hui." })}
            </p>
          ) : (
            <div className="space-y-1">
              {sortedToday.map((apt: any) => {
                const customerName = apt.customer?.fullName || apt.customer?.name || apt.customerName || "Walk-in";
                const serviceName = apt.service?.name || "Service";
                const status = (apt.status || "pending").toLowerCase();
                const initials = getInitials(customerName);
                const avatarGrad = getAvatarColor(customerName);
                const price = parseFloat(apt.totalPaid || apt.price || "0");
                return (
                  <div
                    key={apt.id}
                    onClick={() => setSelectedApt(apt)}
                    className="flex items-center gap-4 py-3 px-2 rounded-xl hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <span className="text-sm text-muted-foreground w-12 shrink-0 font-medium">
                      {formatInTz(apt.date, timezone, "HH:mm")}
                    </span>
                    <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGrad} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground leading-tight truncate">{customerName}</p>
                      <p className="text-xs text-muted-foreground truncate">{serviceName}</p>
                    </div>
                    <span className="text-sm font-bold text-foreground shrink-0">
                      {price > 0 ? `$${price.toFixed(0)}` : "—"}
                    </span>
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full shrink-0 capitalize ${statusStyle[status] || statusStyle["pending"]}`}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Section divider: Analytics ────────────────────────────────────── */}
        <div className="flex items-center gap-4 pt-2">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs font-bold tracking-widest text-muted-foreground uppercase px-2">Analytics</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* ── Range picker + KPI cards ──────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {pick({ en: "Business performance insights", vi: "Thống kê hiệu suất kinh doanh", es: "Estadísticas de rendimiento", fr: "Indicateurs de performance" })}
          </p>
          <Select value={range} onValueChange={(v: AnalyticsRange) => setRange(v)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">{pick({ en: "Last 7 days", vi: "7 ngày qua", es: "Últimos 7 días", fr: "7 derniers jours" })}</SelectItem>
              <SelectItem value="30d">{pick({ en: "Last 30 days", vi: "30 ngày qua", es: "Últimos 30 días", fr: "30 derniers jours" })}</SelectItem>
              <SelectItem value="90d">{pick({ en: "Last 90 days", vi: "90 ngày qua", es: "Últimos 90 días", fr: "90 derniers jours" })}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map((card) => (
            <Card key={card.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">{card.label}</span>
                  <div className={`p-2 rounded-lg ${card.bg}`}>
                    <card.icon className={`h-4 w-4 ${card.color}`} />
                  </div>
                </div>
                <div className="text-2xl font-bold">{card.value}</div>
                {card.change !== 0 && (
                  <div className={`flex items-center gap-1 text-xs mt-1 ${card.change >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {card.change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {Math.abs(card.change).toFixed(1)}% {pick({ en: "vs prev period", vi: "so với kỳ trước", es: "vs período anterior", fr: "vs période préc." })}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Revenue Trend + Daily Bookings ────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{pick({ en: "Revenue Trend", vi: "Xu hướng doanh thu", es: "Tendencia de ingresos", fr: "Tendance des revenus" })}</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={revenueByDay}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, "Revenue"]} />
                  <Area type="monotone" dataKey="revenue" stroke="#6366f1" fill="url(#revGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">{pick({ en: "Daily Bookings", vi: "Đặt lịch hàng ngày", es: "Reservas diarias", fr: "Réservations journalières" })}</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revenueByDay}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="bookings" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* ── Top Services + Client Mix ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">{pick({ en: "Top Services by Revenue", vi: "Dịch vụ hàng đầu theo doanh thu", es: "Servicios más populares por ingresos", fr: "Meilleurs services par revenus" })}</CardTitle></CardHeader>
            <CardContent>
              {topServices.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">{pick({ en: "No data yet", vi: "Chưa có dữ liệu", es: "Sin datos aún", fr: "Aucune donnée" })}</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={topServices} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
                    <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, "Revenue"]} />
                    <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                      {topServices.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">{pick({ en: "Client Mix", vi: "Tỉ lệ khách", es: "Distribución de clientes", fr: "Répartition clients" })}</CardTitle></CardHeader>
            <CardContent>
              {returningVsNew[0].value + returningVsNew[1].value === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">{pick({ en: "No data yet", vi: "Chưa có dữ liệu", es: "Sin datos aún", fr: "Aucune donnée" })}</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={returningVsNew} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={4}>
                      {returningVsNew.map((_, i) => <Cell key={i} fill={CHART_COLORS[i]} />)}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Bookings by Day of Week + Peak Hours ─────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{pick({ en: "Bookings by Day of Week", vi: "Đặt lịch theo ngày trong tuần", es: "Reservas por día de la semana", fr: "Réservations par jour" })}</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={bookingsByDow}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="bookings" radius={[4, 4, 0, 0]}>
                    {bookingsByDow.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">{pick({ en: "Peak Hours", vi: "Giờ cao điểm", es: "Horas pico", fr: "Heures de pointe" })}</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={bookingsByHour}>
                  <defs>
                    <linearGradient id="hourGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="bookings" stroke="#f59e0b" fill="url(#hourGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* ── Staff Performance ─────────────────────────────────────────────── */}
        {staffPerformance.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Award className="h-4 w-4 text-amber-500" />
                {pick({ en: "Staff Performance", vi: "Hiệu suất nhân viên", es: "Rendimiento del personal", fr: "Performance du personnel" })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {staffPerformance.map((s, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold"
                      style={{ background: CHART_COLORS[i % CHART_COLORS.length] + "22", color: CHART_COLORS[i % CHART_COLORS.length] }}>
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{s.name}</span>
                        <span className="text-muted-foreground">{s.count} appts · <span className="font-semibold text-foreground">${s.revenue.toFixed(2)}</span></span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${(s.revenue / (staffPerformance[0].revenue || 1)) * 100}%`, background: CHART_COLORS[i % CHART_COLORS.length] }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Appointment Detail Drawer ──────────────────────────────────────── */}
      <Sheet open={!!selectedApt} onOpenChange={(open) => { if (!open) setSelectedApt(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetTitle className="sr-only">Appointment Details</SheetTitle>
          {selectedApt && (() => {
            const apt = selectedApt;
            const customerName = (apt.customer as any)?.fullName || apt.customer?.name || apt.customerName || "Walk-in";
            const serviceName = apt.service?.name || "Service";
            const staffName = apt.staff?.name || "—";
            const status = (apt.status || "pending").toLowerCase();
            const isCompleted = status === "completed";
            const price = parseFloat(apt.totalPaid || apt.price || "0");
            const initials = getInitials(customerName);
            const avatarGrad = getAvatarColor(customerName);
            const aptDate = new Date(apt.date);
            const endDate = addMinutes(aptDate, apt.duration || 30);
            const dateStr = formatInTz(apt.date, timezone, "EEEE, d MMM yyyy");
            const timeStr = `${formatInTz(apt.date, timezone, "h:mm a")} – ${formatInTz(endDate.toISOString(), timezone, "h:mm a")}`;
            const paymentMethod = apt.paymentMethod
              ? apt.paymentMethod.charAt(0).toUpperCase() + apt.paymentMethod.slice(1)
              : null;
            const statusColors: Record<string, string> = {
              completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
              confirmed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
              pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
              "no-show": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
              cancelled: "bg-gray-100 text-gray-500",
            };
            return (
              <>
                <div className="flex items-center justify-between px-6 py-5 border-b border-border">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarGrad} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                      {initials}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground leading-tight">{customerName}</p>
                      <p className="text-xs text-muted-foreground">{serviceName}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${statusColors[status] || statusColors["pending"]}`}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                  <div className="rounded-xl border border-border bg-muted/30 divide-y divide-border">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Date</p>
                        <p className="text-sm font-medium text-foreground">{dateStr}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Time</p>
                        <p className="text-sm font-medium text-foreground">{timeStr}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Scissors className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Service</p>
                        <p className="text-sm font-medium text-foreground">{serviceName}{apt.duration ? ` · ${apt.duration} min` : ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Staff</p>
                        <p className="text-sm font-medium text-foreground">{staffName}</p>
                      </div>
                    </div>
                  </div>

                  {apt.notes && (
                    <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 flex items-start gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Notes</p>
                        <p className="text-sm text-foreground">{apt.notes}</p>
                      </div>
                    </div>
                  )}

                  {isCompleted && (
                    <div className="rounded-xl border border-border overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 bg-muted/40 border-b border-border">
                        <Receipt className="h-4 w-4 text-muted-foreground" />
                        <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Receipt</p>
                      </div>
                      <div className="px-4 py-4 space-y-1 font-mono text-sm bg-card">
                        {(() => {
                          const servicePrice = parseFloat(apt.service?.price || apt.price || "0");
                          const aptAddons = (apt.appointmentAddons || []) as any[];
                          const addonTotal = aptAddons.reduce((s: number, aa: any) => s + parseFloat(aa.addon?.price || "0"), 0);
                          const subtotal = servicePrice + addonTotal;
                          const discountAmount = parseFloat((apt as any).discountAmount || "0");
                          const tipAmount = parseFloat((apt as any).tipAmount || "0");
                          const giftCardAmount = parseFloat((apt as any).giftCardAmount || "0");
                          const discountedSubtotal = Math.max(0, subtotal - discountAmount);
                          const tax = Math.max(0, price - discountedSubtotal - tipAmount - giftCardAmount);
                          return (
                            <>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground truncate mr-4">{serviceName}</span>
                                <span className="text-foreground font-semibold shrink-0">${servicePrice.toFixed(2)}</span>
                              </div>
                              {aptAddons.map((aa: any) => aa.addon && (
                                <div key={aa.addonId ?? aa.addon.id} className="flex justify-between text-xs">
                                  <span className="text-muted-foreground truncate mr-4">+ {aa.addon.name}</span>
                                  <span className="text-foreground">${parseFloat(aa.addon.price || "0").toFixed(2)}</span>
                                </div>
                              ))}
                              <div className="border-t border-dashed border-border my-2" />
                              {addonTotal > 0 && (
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>Subtotal</span>
                                  <span>${subtotal.toFixed(2)}</span>
                                </div>
                              )}
                              {discountAmount > 0.001 && (
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>Discount</span>
                                  <span>-${discountAmount.toFixed(2)}</span>
                                </div>
                              )}
                              {tax > 0.001 && (
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>Tax</span>
                                  <span>${tax.toFixed(2)}</span>
                                </div>
                              )}
                              {tipAmount > 0.001 && (
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>Tip</span>
                                  <span>${tipAmount.toFixed(2)}</span>
                                </div>
                              )}
                              {giftCardAmount > 0.001 && (
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>Gift card</span>
                                  <span>-${giftCardAmount.toFixed(2)}</span>
                                </div>
                              )}
                              <div className="border-t border-dashed border-border my-2" />
                              <div className="flex justify-between font-semibold">
                                <span className="text-foreground">Total</span>
                                <span className="text-foreground">${price.toFixed(2)}</span>
                              </div>
                              {paymentMethod && (
                                <div className="flex justify-between text-xs text-muted-foreground pt-1">
                                  <span>Paid via</span>
                                  <span>{paymentMethod}</span>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>

                <div className="px-6 py-4 border-t border-border flex gap-3">
                  <Link
                    to={`/calendar?apt=${apt.id}`}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-border hover:bg-muted/50 transition-colors py-2.5 text-sm font-medium text-foreground"
                  >
                    <Calendar className="h-4 w-4" />
                    View on calendar
                  </Link>
                  <button
                    onClick={() => setSelectedApt(null)}
                    className="px-4 py-2.5 rounded-xl bg-muted hover:bg-muted/80 transition-colors text-sm font-medium text-muted-foreground"
                  >
                    Close
                  </button>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
