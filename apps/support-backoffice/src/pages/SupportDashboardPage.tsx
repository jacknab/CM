import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw, Filter, Download, Plus, AlertTriangle,
  Ticket, TrendingUp, TrendingDown, Clock, Users,
  CheckCircle, Activity, Shield, Globe, CreditCard,
  ChevronRight, Zap, ArrowUpRight, BarChart2, Calendar,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { clsx } from "clsx";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashStats {
  totalTickets:     { value: number; trend: number };
  openTickets:      { value: number };
  unassigned:       { value: number };
  slaBreaches:      { value: number };
  avgFirstResponse: { display: string; seconds: number };
  avgResolution:    { display: string; seconds: number };
}

interface ChartData {
  byStatus:   { label: string; value: number }[];
  byPriority: { label: string; value: number }[];
  byCategory: { label: string; value: number }[];
  overTime:   { day: string; created: number; resolved: number }[];
}

interface TeamAgent {
  id: number;
  name: string;
  ticketsSolved: number;
  ticketsTotal: number;
  avgFirstResponse: string;
  slaPct: number | null;
}

interface Alert {
  id: string;
  type: string;
  detail: string;
  severity: string;
  detectedAt: string;
}

interface SlaData {
  pct: number;
  total: number;
  onTime: number;
  breached: number;
  goal: number;
}

// ─── SVG Micro Charts ─────────────────────────────────────────────────────────

function Sparkline({ values, color = "#6366f1", negative = false }: { values: number[]; color?: string; negative?: boolean }) {
  if (!values || values.length < 2) {
    const pts = "0,20 25,18 50,19 75,17 100,16";
    return (
      <svg viewBox="0 0 100 28" className="w-full h-7" preserveAspectRatio="none">
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
      </svg>
    );
  }
  const w = 100; const h = 28;
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * (h - 4) - 2).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-7" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DonutChart({ segments, total, label }: {
  segments: { label: string; value: number; color: string }[];
  total: number;
  label?: string;
}) {
  const r = 42; const cx = 56; const cy = 56;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <svg viewBox="0 0 112 112" className="w-full h-full">
      {total === 0 ? (
        <circle r={r} cx={cx} cy={cy} fill="none" stroke="#e2e8f0" strokeWidth={13} />
      ) : (
        segments.filter(s => s.value > 0).map((seg, i) => {
          const frac = seg.value / total;
          const dash = frac * circ;
          const gap  = circ - dash;
          const rot  = -90 + (offset / total) * 360;
          offset += seg.value;
          return (
            <circle key={i} r={r} cx={cx} cy={cy} fill="none"
              stroke={seg.color} strokeWidth={13}
              strokeDasharray={`${dash.toFixed(2)} ${gap.toFixed(2)}`}
              transform={`rotate(${rot.toFixed(2)} ${cx} ${cy})`}
              strokeLinecap="butt"
            />
          );
        })
      )}
      <circle r={31} cx={cx} cy={cy} fill="white" />
      <text x={cx} y={cy - 5} textAnchor="middle" className="text-lg" fontSize={16} fontWeight={800} fill="#0f172a">
        {total.toLocaleString()}
      </text>
      {label && (
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize={8} fill="#94a3b8">{label}</text>
      )}
    </svg>
  );
}

function MiniBarChart({ data, maxVal }: { data: { label: string; value: number }[]; maxVal: number }) {
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={d.label} className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 w-32 truncate flex-shrink-0">{d.label}</span>
          <div className="flex-1 bg-slate-100 rounded-full h-2">
            <div
              className="h-2 rounded-full"
              style={{
                width: `${maxVal > 0 ? (d.value / maxVal) * 100 : 0}%`,
                backgroundColor: `hsl(${220 + i * 25}, 70%, 55%)`,
              }}
            />
          </div>
          <span className="text-[10px] font-semibold text-slate-700 w-8 text-right">{d.value}</span>
          <span className="text-[10px] text-slate-400 w-10 text-right">
            {maxVal > 0 ? ((d.value / data.reduce((a,b) => a+b.value, 0)) * 100).toFixed(1) : 0}%
          </span>
        </div>
      ))}
    </div>
  );
}

function LineChart({ data }: { data: { day: string; created: number; resolved: number }[] }) {
  if (!data.length) return <div className="h-32 flex items-center justify-center text-slate-300 text-sm">No data</div>;
  const w = 300; const h = 100;
  const maxV = Math.max(...data.map(d => Math.max(d.created, d.resolved)), 1);
  const step = data.length > 1 ? w / (data.length - 1) : w;

  const createdPts = data.map((d, i) => `${(i * step).toFixed(1)},${(h - (d.created / maxV) * (h - 8) - 4).toFixed(1)}`).join(" ");
  const resolvedPts = data.map((d, i) => `${(i * step).toFixed(1)},${(h - (d.resolved / maxV) * (h - 8) - 4).toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full" preserveAspectRatio="none">
      <polyline points={createdPts}  fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={resolvedPts} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SlaGauge({ pct, goal }: { pct: number; goal: number }) {
  const r = 60; const cx = 80; const cy = 80;
  const circ = Math.PI * r; // half circle
  const filled = (pct / 100) * circ;
  const onTarget = pct >= goal;

  return (
    <svg viewBox="0 0 160 100" className="w-full">
      {/* Background arc */}
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#e2e8f0" strokeWidth={14} strokeLinecap="round" />
      {/* Filled arc */}
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none"
        stroke={onTarget ? "#10b981" : "#f59e0b"} strokeWidth={14} strokeLinecap="round"
        strokeDasharray={`${filled.toFixed(1)} ${circ.toFixed(1)}`}
      />
      {/* Center text */}
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize={22} fontWeight={800} fill={onTarget ? "#10b981" : "#f59e0b"}>
        {pct.toFixed(1)}%
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize={9} fill="#94a3b8">On Time</text>
      <text x={cx - r + 4} y={cy + 18} fontSize={8} fill="#94a3b8">0%</text>
      <text x={cx + r - 16} y={cy + 18} fontSize={8} fill="#94a3b8">100%</text>
    </svg>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

const SPARK_DATA = [12,19,14,22,18,25,20,28,24,30,22,35];

function KpiCard({ label, value, trend, trendSuffix = "vs last 7 days", color = "#6366f1", icon, isTime = false }: {
  label: string;
  value: string | number;
  trend?: number;
  trendSuffix?: string;
  color?: string;
  icon?: React.ReactNode;
  isTime?: boolean;
}) {
  const isUp   = (trend ?? 0) > 0;
  const isDown = (trend ?? 0) < 0;
  // For breaches / SLA, up = bad
  const trendGood = isTime
    ? isDown
    : (label.toLowerCase().includes("breach") || label.toLowerCase().includes("unassign")) ? isDown : isUp;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-1 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold text-slate-500">{label}</span>
        {icon && <span className="text-slate-300">{icon}</span>}
      </div>
      <div className="text-2xl font-black text-slate-900 leading-none">{typeof value === "number" ? value.toLocaleString() : value}</div>
      {trend !== undefined && (
        <div className={clsx("flex items-center gap-1 text-[10px] font-semibold", trendGood ? "text-emerald-600" : "text-rose-500")}>
          {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {Math.abs(trend)}% {trendSuffix}
        </div>
      )}
      <div className="mt-2 h-7">
        <Sparkline values={SPARK_DATA.map((v, i) => v + i * 2)} color={color} />
      </div>
    </div>
  );
}

// ─── Status color maps ────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  open: "#6366f1", pending: "#f59e0b", waiting: "#8b5cf6",
  escalated: "#ef4444", resolved: "#10b981", closed: "#94a3b8",
};
const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#ef4444", high: "#f97316", normal: "#6366f1",
  medium: "#6366f1", low: "#94a3b8",
};
const ALERT_CFG: Record<string, { bg: string; border: string; icon: string; dot: string }> = {
  critical: { bg: "bg-red-50",    border: "border-red-200",    icon: "text-red-600",    dot: "bg-red-500" },
  high:     { bg: "bg-orange-50", border: "border-orange-200", icon: "text-orange-600", dot: "bg-orange-500" },
  medium:   { bg: "bg-amber-50",  border: "border-amber-200",  icon: "text-amber-600",  dot: "bg-amber-400" },
  low:      { bg: "bg-blue-50",   border: "border-blue-200",   icon: "text-blue-600",   dot: "bg-blue-400" },
};

// ─── Main Component ───────────────────────────────────────────────────────────

const DATE_RANGES = [
  { value: "today",     label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d",        label: "Last 7 Days" },
  { value: "30d",       label: "Last 30 Days" },
  { value: "90d",       label: "Last 90 Days" },
];

const ATTENTION_TABS = [
  { key: "sla",       label: "SLA Breaches" },
  { key: "high",      label: "High Priority" },
  { key: "unassigned",label: "Unassigned" },
  { key: "waiting",   label: "Waiting on Customer" },
  { key: "escalated", label: "Escalated" },
];

const HEALTH_LABELS = ["AI Receptionist","Booking System","Website Builder","SMS & Email","Payment Processing","Global Infrastructure"];
const HEALTH_STATUS = ["operational","operational","operational","operational","operational","operational"];

export default function SupportDashboardPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [range, setRange] = useState("7d");
  const [attnTab, setAttnTab] = useState("sla");
  const [showRange, setShowRange] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery<DashStats>({
    queryKey: ["dash-stats", range],
    queryFn: () => fetch(`/api/support/dashboard/stats?range=${range}`, { credentials: "include" }).then(r => r.json()),
    staleTime: 30_000, refetchInterval: 60_000,
  });
  const { data: charts, isLoading: chartsLoading } = useQuery<ChartData>({
    queryKey: ["dash-charts", range],
    queryFn: () => fetch(`/api/support/dashboard/charts?range=${range}`, { credentials: "include" }).then(r => r.json()),
    staleTime: 30_000,
  });
  const { data: team = [] } = useQuery<TeamAgent[]>({
    queryKey: ["dash-team", range],
    queryFn: () => fetch(`/api/support/dashboard/team?range=${range}`, { credentials: "include" }).then(r => r.json()),
    staleTime: 60_000,
  });
  const { data: attentionData } = useQuery({
    queryKey: ["dash-attention", attnTab],
    queryFn: () => fetch(`/api/support/dashboard/attention?tab=${attnTab}`, { credentials: "include" }).then(r => r.json()),
    staleTime: 30_000,
  });
  const { data: alerts = [] } = useQuery<Alert[]>({
    queryKey: ["dash-alerts"],
    queryFn: () => fetch("/api/support/dashboard/alerts", { credentials: "include" }).then(r => r.json()),
    staleTime: 30_000, refetchInterval: 60_000,
  });
  const { data: slaData } = useQuery<SlaData>({
    queryKey: ["dash-sla"],
    queryFn: () => fetch("/api/support/dashboard/sla", { credentials: "include" }).then(r => r.json()),
    staleTime: 60_000,
  });
  const { data: activity = [] } = useQuery({
    queryKey: ["dash-activity"],
    queryFn: () => fetch("/api/support/dashboard/recent-activity", { credentials: "include" }).then(r => r.json()),
    staleTime: 30_000, refetchInterval: 60_000,
  });

  const attentionTickets = attentionData?.tickets ?? [];
  const attentionTotal   = attentionData?.total ?? 0;

  const statusSegs = useMemo(() => {
    if (!charts?.byStatus?.length) return [];
    return charts.byStatus.map(s => ({ ...s, color: STATUS_COLORS[s.label] ?? "#94a3b8" }));
  }, [charts]);

  const prioritySegs = useMemo(() => {
    if (!charts?.byPriority?.length) return [];
    return charts.byPriority.map(s => ({ ...s, color: PRIORITY_COLORS[s.label] ?? "#94a3b8" }));
  }, [charts]);

  const statusTotal   = statusSegs.reduce((a, s) => a + s.value, 0);
  const priorityTotal = prioritySegs.reduce((a, s) => a + s.value, 0);
  const catMax        = charts?.byCategory?.length ? Math.max(...charts.byCategory.map(d => d.value)) : 1;

  const rangeLabel = DATE_RANGES.find(r => r.value === range)?.label ?? "Last 7 Days";

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden bg-slate-50">
      {/* ── Main Content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-w-0">
        {/* Page Header */}
        <div className="px-6 py-4 bg-white border-b border-slate-200 sticky top-0 z-10 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-black text-slate-900">Support Operations Dashboard</h1>
              <p className="text-xs text-slate-500 mt-0.5">Real-time overview of support performance and system health</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Date range */}
              <div className="relative">
                <button
                  onClick={() => setShowRange(o => !o)}
                  className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  <Calendar size={12} />
                  {rangeLabel}
                </button>
                {showRange && (
                  <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-slate-200 shadow-xl z-30 w-44 py-1">
                    {DATE_RANGES.map(d => (
                      <button key={d.value} onClick={() => { setRange(d.value); setShowRange(false); }}
                        className={clsx("w-full text-left px-3 py-2 text-xs transition", range === d.value ? "text-indigo-600 font-bold bg-indigo-50" : "text-slate-700 hover:bg-slate-50")}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
                <Filter size={12} /> Filters
              </button>
              <button onClick={() => qc.invalidateQueries()} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
                <RefreshCw size={12} /> Refresh
              </button>
              <button className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
                <Download size={12} /> Export
              </button>
              <button
                onClick={() => navigate("/tickets")}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition"
              >
                <Plus size={12} /> Create Ticket
              </button>
              <button
                onClick={() => navigate("/isTeam/incidents")}
                className="flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition"
              >
                <AlertTriangle size={12} /> Create Incident
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* ── Row 1: KPI Cards ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-6 gap-4">
            <KpiCard label="Total Tickets"     value={stats?.totalTickets.value ?? 0}     trend={stats?.totalTickets.trend}     color="#6366f1" icon={<Ticket size={14}/>} />
            <KpiCard label="Open Tickets"      value={stats?.openTickets.value ?? 0}      color="#f59e0b" icon={<Activity size={14}/>} />
            <KpiCard label="Unassigned"        value={stats?.unassigned.value ?? 0}       color="#ef4444" icon={<Users size={14}/>} />
            <KpiCard label="SLA Breaches"      value={stats?.slaBreaches.value ?? 0}      color="#ef4444" icon={<AlertTriangle size={14}/>} />
            <KpiCard label="Avg First Response" value={stats?.avgFirstResponse.display ?? "—"} color="#10b981" icon={<Clock size={14}/>} isTime />
            <KpiCard label="Avg Resolution Time" value={stats?.avgResolution.display ?? "—"} color="#8b5cf6" icon={<CheckCircle size={14}/>} isTime />
          </div>

          {/* ── Row 2: Charts ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-4">
            {/* Tickets by Status */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-700 mb-3">Tickets by Status</h3>
              <div className="flex gap-3">
                <div className="w-28 h-28 flex-shrink-0">
                  <DonutChart segments={statusSegs} total={statusTotal} label="Total" />
                </div>
                <div className="flex-1 space-y-1.5 pt-1">
                  {statusSegs.map(s => (
                    <div key={s.label} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-[10px] text-slate-600 capitalize flex-1">{s.label}</span>
                      <span className="text-[10px] font-bold text-slate-800">{s.value}</span>
                      <span className="text-[9px] text-slate-400 w-10 text-right">
                        {statusTotal > 0 ? ((s.value / statusTotal) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  ))}
                  {!statusSegs.length && <p className="text-[10px] text-slate-400 italic">No data</p>}
                </div>
              </div>
            </div>

            {/* Tickets Over Time */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-slate-700">Tickets Over Time</h3>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-indigo-500 inline-block" />Created</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-500 inline-block" />Resolved</span>
                </div>
              </div>
              <div className="h-28">
                <LineChart data={charts?.overTime ?? []} />
              </div>
            </div>

            {/* Tickets by Priority */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-700 mb-3">Tickets by Priority</h3>
              <div className="flex gap-3">
                <div className="w-28 h-28 flex-shrink-0">
                  <DonutChart segments={prioritySegs} total={priorityTotal} label="Total" />
                </div>
                <div className="flex-1 space-y-1.5 pt-1">
                  {prioritySegs.map(s => (
                    <div key={s.label} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-[10px] text-slate-600 capitalize flex-1">{s.label}</span>
                      <span className="text-[10px] font-bold text-slate-800">{s.value}</span>
                      <span className="text-[9px] text-slate-400 w-10 text-right">
                        {priorityTotal > 0 ? ((s.value / priorityTotal) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  ))}
                  {!prioritySegs.length && <p className="text-[10px] text-slate-400 italic">No data</p>}
                </div>
              </div>
            </div>
          </div>

          {/* ── Row 3: Categories + SLA + Team ────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-4">
            {/* Top Ticket Categories */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <h3 className="text-xs font-bold text-slate-700 mb-3">Top Ticket Categories</h3>
              <MiniBarChart data={charts?.byCategory ?? []} maxVal={catMax} />
              {!charts?.byCategory?.length && <p className="text-[10px] text-slate-400 italic">No data</p>}
            </div>

            {/* SLA Compliance */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col">
              <h3 className="text-xs font-bold text-slate-700 mb-2">SLA Compliance</h3>
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="w-44">
                  <SlaGauge pct={slaData?.pct ?? 0} goal={slaData?.goal ?? 90} />
                </div>
                <div className="flex items-center gap-3 mt-2 text-[10px]">
                  <span className="flex items-center gap-1 text-slate-500"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> On Time <b className="text-slate-800 ml-1">{(slaData?.onTime ?? 0).toLocaleString()}</b></span>
                  <span className="flex items-center gap-1 text-slate-500"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Breached <b className="text-slate-800 ml-1">{(slaData?.breached ?? 0).toLocaleString()}</b></span>
                </div>
                <div className={clsx(
                  "mt-3 flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-bold",
                  (slaData?.pct ?? 0) >= (slaData?.goal ?? 90) ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                )}>
                  <CheckCircle size={10} />
                  SLA Goal: {slaData?.goal ?? 90}% — {(slaData?.pct ?? 0) >= (slaData?.goal ?? 90) ? "Goal Met ✓" : "Below Target"}
                </div>
              </div>
            </div>

            {/* Support Team Performance */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-slate-700">Support Team Performance</h3>
                <button className="text-[10px] text-indigo-600 hover:underline font-semibold">View Full Report</button>
              </div>
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-100">
                    <th className="text-left pb-1.5 font-semibold">Agent</th>
                    <th className="text-right pb-1.5 font-semibold">Solved</th>
                    <th className="text-right pb-1.5 font-semibold">First Resp</th>
                    <th className="text-right pb-1.5 font-semibold">SLA</th>
                  </tr>
                </thead>
                <tbody>
                  {team.map(a => (
                    <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                      <td className="py-1.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0">
                            {a.name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0,2)}
                          </div>
                          <span className="text-slate-700 font-medium truncate max-w-[80px]">{a.name}</span>
                        </div>
                      </td>
                      <td className="py-1.5 text-right font-bold text-slate-800">{a.ticketsSolved}</td>
                      <td className="py-1.5 text-right text-slate-600">{a.avgFirstResponse}</td>
                      <td className="py-1.5 text-right">
                        {a.slaPct !== null ? (
                          <span className={clsx("font-bold", a.slaPct >= 90 ? "text-emerald-600" : a.slaPct >= 75 ? "text-amber-600" : "text-red-600")}>
                            {a.slaPct}%
                          </span>
                        ) : <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  ))}
                  {!team.length && (
                    <tr><td colSpan={4} className="py-4 text-center text-slate-400 italic">No agent data</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Row 4: Attention + Health ──────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-4">
            {/* Tickets Requiring Attention */}
            <div className="col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-slate-700">Tickets Requiring Attention</h3>
                  <span className="text-[10px] text-slate-400">{attentionTotal} tickets</span>
                </div>
                {/* Tab bar */}
                <div className="flex gap-0 -mx-1">
                  {ATTENTION_TABS.map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setAttnTab(tab.key)}
                      className={clsx(
                        "px-3 py-1.5 text-[10px] font-semibold border-b-2 transition whitespace-nowrap",
                        attnTab === tab.key
                          ? "border-indigo-500 text-indigo-600"
                          : "border-transparent text-slate-500 hover:text-slate-700"
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr className="text-slate-500">
                      <th className="text-left px-4 py-2 font-semibold">Ticket #</th>
                      <th className="text-left px-2 py-2 font-semibold">Subject</th>
                      <th className="text-left px-2 py-2 font-semibold">Customer</th>
                      <th className="text-left px-2 py-2 font-semibold">Priority</th>
                      <th className="text-left px-2 py-2 font-semibold">SLA</th>
                      <th className="text-left px-2 py-2 font-semibold">Age</th>
                      <th className="text-left px-2 py-2 font-semibold">Assigned To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attentionTickets.map((t: any) => {
                      const ageHours = Math.floor((Date.now() - new Date(t.created_at).getTime()) / 3600000);
                      const slaBreached = !t.first_response_at && ageHours > 8;
                      return (
                        <tr key={t.id} onClick={() => navigate(`/tickets/${t.id}`)}
                          className="border-b border-slate-50 hover:bg-indigo-50 cursor-pointer transition">
                          <td className="px-4 py-2.5 font-mono text-indigo-600 font-semibold">{t.ticket_number}</td>
                          <td className="px-2 py-2.5 font-medium text-slate-800 max-w-[200px] truncate">{t.subject}</td>
                          <td className="px-2 py-2.5 text-slate-600 truncate max-w-[120px]">{t.account_name ?? "—"}</td>
                          <td className="px-2 py-2.5">
                            <span className={clsx("font-bold capitalize px-1.5 py-0.5 rounded text-[9px]",
                              t.priority === "urgent" ? "bg-red-100 text-red-700" :
                              t.priority === "high"   ? "bg-orange-100 text-orange-700" :
                              "bg-blue-100 text-blue-700")}>
                              {t.priority ?? "normal"}
                            </span>
                          </td>
                          <td className="px-2 py-2.5">
                            <span className={clsx("text-[9px] font-bold px-1.5 py-0.5 rounded", slaBreached ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700")}>
                              {slaBreached ? "Breached" : "At Risk"}
                            </span>
                          </td>
                          <td className="px-2 py-2.5 text-slate-500">{ageHours}h {Math.floor(((Date.now() - new Date(t.created_at).getTime()) % 3600000) / 60000)}m</td>
                          <td className="px-2 py-2.5 text-slate-600">{t.agent_name ?? "Unassigned"}</td>
                        </tr>
                      );
                    })}
                    {!attentionTickets.length && (
                      <tr><td colSpan={7} className="py-8 text-center text-slate-400">No tickets requiring attention</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {attentionTotal > 20 && (
                <div className="px-4 py-2 border-t border-slate-100 text-center">
                  <button className="text-[10px] text-indigo-600 hover:underline font-semibold">View All {attentionTotal} Tickets</button>
                </div>
              )}
            </div>

            {/* System Health Overview */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-700">System Health Overview</h3>
                <button onClick={() => navigate("/isTeam/incidents")} className="text-[10px] text-indigo-600 hover:underline font-semibold">View All Systems</button>
              </div>
              <div className="p-3 space-y-2">
                {HEALTH_LABELS.map((label, i) => {
                  const status = HEALTH_STATUS[i] ?? "operational";
                  const isOp = status === "operational";
                  return (
                    <div key={label} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition">
                      <div className={clsx("w-2 h-2 rounded-full flex-shrink-0", isOp ? "bg-emerald-500" : status === "degraded" ? "bg-amber-500" : "bg-red-500")} />
                      <span className="text-xs text-slate-700 font-medium flex-1">{label}</span>
                      <span className={clsx("text-[10px] font-bold", isOp ? "text-emerald-600" : "text-amber-600")}>
                        {isOp ? "Operational" : "Degraded"}
                      </span>
                      <span className="text-[10px] text-slate-400">{(99.8 + i * 0.02).toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right Sidebar ──────────────────────────────────────────────────────── */}
      <div className="w-72 bg-white border-l border-slate-200 flex flex-col overflow-hidden flex-shrink-0">
        {/* Critical Alerts */}
        <div className="flex-shrink-0 border-b border-slate-100">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-800">Critical Alerts</h3>
              {alerts.length > 0 && (
                <span className="bg-rose-500 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                  {alerts.length}
                </span>
              )}
            </div>
            <button className="text-[10px] text-indigo-600 hover:underline font-semibold">View All</button>
          </div>
          <div className="px-3 pb-3 space-y-2 max-h-52 overflow-y-auto scrollbar-thin">
            {alerts.length === 0 && (
              <div className="text-center py-4 text-[11px] text-slate-400">
                <CheckCircle size={20} className="mx-auto mb-1 text-emerald-400" />
                All systems normal
              </div>
            )}
            {alerts.map(a => {
              const cfg = ALERT_CFG[a.severity] ?? ALERT_CFG.medium;
              return (
                <div key={a.id} className={clsx("rounded-xl border p-2.5", cfg.bg, cfg.border)}>
                  <div className="flex items-start gap-2">
                    <div className={clsx("w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0", cfg.dot)} />
                    <div className="flex-1 min-w-0">
                      <p className={clsx("text-[11px] font-bold leading-snug", cfg.icon)}>{a.type}</p>
                      <p className="text-[10px] text-slate-600 mt-0.5">{a.detail}</p>
                      <p className="text-[9px] text-slate-400 mt-1">{formatDistanceToNow(new Date(a.detectedAt), { addSuffix: true })}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
            <h3 className="text-xs font-bold text-slate-800">Recent Activity</h3>
            <button className="text-[10px] text-indigo-600 hover:underline font-semibold">View All</button>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-2 space-y-0">
            {activity.length === 0 && (
              <div className="text-center py-8 text-[11px] text-slate-400">No recent activity</div>
            )}
            {activity.map((ev: any, i: number) => (
              <div key={i} className="flex items-start gap-2.5 py-2.5 border-b border-slate-50 last:border-0">
                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-[9px] font-bold flex-shrink-0 mt-0.5">
                  {(ev.agent_name ?? "SA").split(" ").map((w: string) => w[0]).join("").slice(0,2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-slate-700 font-medium leading-snug">{ev.type?.replace(/_/g, " ")}</p>
                  {ev.agent_name && <p className="text-[9px] text-slate-400 mt-0.5">{ev.agent_name}</p>}
                </div>
                <span className="text-[9px] text-slate-400 flex-shrink-0">
                  {formatDistanceToNow(new Date(ev.occurred_at), { addSuffix: false })} ago
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
