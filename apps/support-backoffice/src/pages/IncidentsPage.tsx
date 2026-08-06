import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, RefreshCw, AlertTriangle, Activity, Server,
  Shield, Globe, MessageSquare, CreditCard, Lock,
  CheckCircle, Clock, TrendingUp, TrendingDown, Zap, X, ChevronRight,
  Users, BarChart2,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { clsx } from "clsx";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Incident {
  id: number;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  affected_accounts: number;
  owner_name: string | null;
  services: string[];
  created_at: string;
  resolved_at: string | null;
  duration_sec: number;
}

interface ServiceHealth {
  key: string;
  label: string;
  status: string;
  uptime: string;
  latency: number;
  errorRate: number;
  sparkline: number[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDuration(sec: number): string {
  if (!sec || sec < 0) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const SEV_CFG: Record<string, { bg: string; text: string; border: string }> = {
  "SEV-1": { bg: "bg-red-100",    text: "text-red-700",    border: "border-red-300" },
  "SEV-2": { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300" },
  "SEV-3": { bg: "bg-amber-100",  text: "text-amber-700",  border: "border-amber-300" },
  "SEV-4": { bg: "bg-blue-100",   text: "text-blue-700",   border: "border-blue-300" },
};

const STATUS_CFG: Record<string, string> = {
  investigating:       "bg-red-100 text-red-700",
  identified:          "bg-orange-100 text-orange-700",
  monitoring:          "bg-amber-100 text-amber-700",
  resolved:            "bg-emerald-100 text-emerald-700",
  postmortem_pending:  "bg-violet-100 text-violet-700",
  closed:              "bg-slate-100 text-slate-600",
};

const HEALTH_STATUS_CFG: Record<string, { dot: string; badge: string; label: string }> = {
  operational: { dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700", label: "Operational" },
  degraded:    { dot: "bg-amber-500",   badge: "bg-amber-100 text-amber-700",     label: "Degraded" },
  outage:      { dot: "bg-red-500",     badge: "bg-red-100 text-red-700",          label: "Outage" },
  maintenance: { dot: "bg-blue-500",    badge: "bg-blue-100 text-blue-700",        label: "Maintenance" },
};

interface IncidentTrends {
  dailyCounts: { day: string; opened: number; resolved: number }[];
  mttrByDay:   { day: string; avgMinutes: number | null }[];
  bySeverity:  Record<string, number>;
  topServices: { service: string; count: number }[];
}

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  ai_receptionist: <MessageSquare size={14} />,
  booking_system:  <Activity size={14} />,
  website_builder: <Globe size={14} />,
  sms_platform:    <Zap size={14} />,
  email_platform:  <MessageSquare size={14} />,
  stripe_billing:  <CreditCard size={14} />,
  domain_prov:     <Globe size={14} />,
  ssl_prov:        <Lock size={14} />,
  authentication:  <Shield size={14} />,
  api_infra:       <Server size={14} />,
};

// ─── Sparkline ────────────────────────────────────────────────────────────────

function MiniSparkline({ values, color = "#6366f1" }: { values: number[]; color?: string }) {
  if (!values || values.length < 2) return <div className="h-6 bg-slate-50 rounded" />;
  const w = 80; const h = 24;
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step  = w / (values.length - 1);
  const pts   = values.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * (h - 2) - 1).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-6" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Bar Chart (Incidents Over Time) ─────────────────────────────────────────

function IncidentBarChart({ data }: { data: IncidentTrends["dailyCounts"] }) {
  const W = 400, H = 110;
  const PAD = { top: 8, right: 4, bottom: 20, left: 24 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  const show = data.slice(-14);
  if (!show.length) return <div className="h-[110px] bg-slate-50 rounded-lg" />;
  const maxV = Math.max(...show.flatMap(d => [d.opened, d.resolved]), 1);
  const grpW = cW / show.length;
  const bW   = Math.max(3, Math.floor(grpW * 0.32));
  const yTick = (v: number) => PAD.top + cH - (v / maxV) * cH;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 110 }} preserveAspectRatio="xMidYMid meet">
      {[0, 0.25, 0.5, 0.75, 1].map(p => {
        const y = PAD.top + cH * (1 - p);
        const lbl = Math.round(maxV * p);
        return (
          <g key={p}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#f1f5f9" strokeWidth="1" />
            {p > 0 && <text x={PAD.left - 3} y={y + 3} textAnchor="end" fontSize="7" fill="#94a3b8">{lbl}</text>}
          </g>
        );
      })}
      {show.map((d, i) => {
        const cx = PAD.left + i * grpW + grpW / 2;
        const oH  = (d.opened   / maxV) * cH;
        const rH  = (d.resolved / maxV) * cH;
        return (
          <g key={i}>
            <rect x={cx - bW - 1} y={yTick(d.opened)}   width={bW} height={oH}  rx="2" fill="#6366f1" opacity="0.85" />
            <rect x={cx + 1}      y={yTick(d.resolved)}  width={bW} height={rH}  rx="2" fill="#10b981" opacity="0.85" />
            {i % 2 === 0 && (
              <text x={cx} y={H - 4} textAnchor="middle" fontSize="7" fill="#94a3b8">
                {format(new Date(d.day), "M/d")}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Line Chart (MTTR Over Time) ─────────────────────────────────────────────

function MTTRLineChart({ data }: { data: IncidentTrends["mttrByDay"] }) {
  const W = 400, H = 110;
  const PAD = { top: 8, right: 4, bottom: 20, left: 30 };
  const cW  = W - PAD.left - PAD.right;
  const cH  = H - PAD.top - PAD.bottom;
  const show = data.slice(-14);
  if (!show.length) return <div className="h-[110px] bg-slate-50 rounded-lg" />;
  const valid = show.filter(d => d.avgMinutes !== null);
  const maxV  = valid.length ? Math.max(...valid.map(d => d.avgMinutes!), 1) : 60;
  const xPos  = (i: number) => PAD.left + (i / (show.length - 1 || 1)) * cW;
  const yPos  = (v: number) => PAD.top + cH - (v / maxV) * cH;
  const pathPts: string[] = [];
  show.forEach((d, i) => {
    if (d.avgMinutes !== null) {
      pathPts.push(`${i === 0 || pathPts.length === 0 ? "M" : "L"} ${xPos(i).toFixed(1)} ${yPos(d.avgMinutes).toFixed(1)}`);
    }
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 110 }} preserveAspectRatio="xMidYMid meet">
      {[0, 0.5, 1].map(p => {
        const y   = PAD.top + cH * (1 - p);
        const lbl = Math.round(maxV * p);
        return (
          <g key={p}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#f1f5f9" strokeWidth="1" />
            <text x={PAD.left - 3} y={y + 3} textAnchor="end" fontSize="7" fill="#94a3b8">{lbl}m</text>
          </g>
        );
      })}
      {pathPts.length > 1 && (
        <path d={pathPts.join(" ")} fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {show.map((d, i) => {
        if (d.avgMinutes === null) return null;
        return <circle key={i} cx={xPos(i)} cy={yPos(d.avgMinutes)} r="3" fill="#8b5cf6" stroke="white" strokeWidth="1.5" />;
      })}
      {show.map((d, i) => i % 2 === 0 ? (
        <text key={i} x={xPos(i)} y={H - 4} textAnchor="middle" fontSize="7" fill="#94a3b8">
          {format(new Date(d.day), "M/d")}
        </text>
      ) : null)}
    </svg>
  );
}

// ─── Donut Chart (By Severity) ───────────────────────────────────────────────

const SEV_COLORS: Record<string, string> = {
  "SEV-1": "#ef4444",
  "SEV-2": "#f97316",
  "SEV-3": "#f59e0b",
  "SEV-4": "#6366f1",
};

function SeverityDonut({ data }: { data: Record<string, number> }) {
  const total = Object.values(data).reduce((a, v) => a + v, 0);
  const R = 42, r = 26, cx = 55, cy = 55;
  let angle = -Math.PI / 2;
  const slices = Object.entries(data).map(([key, value]) => {
    const pct = total > 0 ? value / total : 0;
    const sa  = angle;
    angle    += pct * 2 * Math.PI;
    return { key, value, sa, ea: angle, color: SEV_COLORS[key] ?? "#94a3b8" };
  });
  const arc = (sa: number, ea: number, outerR: number, innerR: number) => {
    const gap   = 0.02;
    const saG   = sa + gap;
    const eaG   = ea - gap;
    if (eaG - saG < 0.001) return "";
    const large = (eaG - saG) > Math.PI ? 1 : 0;
    const x1 = cx + outerR * Math.cos(saG), y1 = cy + outerR * Math.sin(saG);
    const x2 = cx + outerR * Math.cos(eaG), y2 = cy + outerR * Math.sin(eaG);
    const x3 = cx + innerR * Math.cos(eaG), y3 = cy + innerR * Math.sin(eaG);
    const x4 = cx + innerR * Math.cos(saG), y4 = cy + innerR * Math.sin(saG);
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${outerR} ${outerR} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${innerR} ${innerR} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`;
  };
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 110 110" className="w-[88px] h-[88px] flex-shrink-0">
        {total === 0 ? (
          <>
            <circle cx={cx} cy={cy} r={R} fill="none" stroke="#f1f5f9" strokeWidth={R - r} />
            <text x={cx} y={cy + 3} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#94a3b8">—</text>
          </>
        ) : slices.map(s => <path key={s.key} d={arc(s.sa, s.ea, R, r)} fill={s.color} />)}
        {total > 0 && (
          <>
            <text x={cx} y={cy + 4} textAnchor="middle" fontSize="13" fontWeight="bold" fill="#1e293b">{total}</text>
            <text x={cx} y={cy + 14} textAnchor="middle" fontSize="7" fill="#94a3b8">total</text>
          </>
        )}
      </svg>
      <div className="space-y-2 flex-1">
        {Object.entries(data).map(([key, value]) => {
          const pct = total > 0 ? Math.round((value / total) * 100) : 0;
          return (
            <div key={key} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: SEV_COLORS[key] ?? "#94a3b8" }} />
              <span className="text-[11px] text-slate-600 font-semibold w-12">{key}</span>
              <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: SEV_COLORS[key] ?? "#94a3b8" }} />
              </div>
              <span className="text-[11px] font-black text-slate-700 w-4 text-right">{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Create Incident Modal ────────────────────────────────────────────────────

const SEVERITY_OPTIONS = ["SEV-1", "SEV-2", "SEV-3", "SEV-4"];
const SERVICE_OPTIONS = [
  "AI Receptionist","Booking System","Website Builder","SMS Platform",
  "Email Platform","Stripe Billing","Domain Provisioning","SSL Provisioning",
  "Authentication","API Infrastructure",
];

function CreateIncidentModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: "", description: "", severity: "SEV-3", services: [] as string[], rootCause: "" });

  const create = useMutation({
    mutationFn: () =>
      fetch("/api/support/incidents", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, affectedAccounts: 0 }),
      }).then(r => { if (!r.ok) throw new Error("Failed"); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incidents"] });
      onClose();
    },
  });

  const toggleService = (s: string) =>
    setForm(f => ({ ...f, services: f.services.includes(s) ? f.services.filter(x => x !== s) : [...f.services, s] }));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-rose-100 rounded-lg flex items-center justify-center">
              <AlertTriangle size={14} className="text-rose-600" />
            </div>
            <h2 className="text-sm font-black text-slate-900">Create Incident</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Incident Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Brief description of the incident..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:bg-white bg-slate-50"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Detailed description of what's happening..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400 resize-none bg-slate-50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Severity</label>
              <div className="flex gap-1.5 flex-wrap">
                {SEVERITY_OPTIONS.map(s => {
                  const cfg = SEV_CFG[s];
                  return (
                    <button key={s} onClick={() => setForm(f => ({ ...f, severity: s }))}
                      className={clsx("px-2.5 py-1 rounded-lg text-[10px] font-black border transition", cfg.bg, cfg.text, cfg.border,
                        form.severity === s ? "ring-2 ring-offset-1 ring-indigo-500 scale-105" : "opacity-70 hover:opacity-100")}>
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Root Cause (optional)</label>
              <input
                type="text"
                value={form.rootCause}
                onChange={e => setForm(f => ({ ...f, rootCause: e.target.value }))}
                placeholder="Known root cause..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-slate-50"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Affected Services</label>
            <div className="flex flex-wrap gap-1.5">
              {SERVICE_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => toggleService(s)}
                  className={clsx("px-2.5 py-1 rounded-full text-[10px] font-semibold border transition",
                    form.services.includes(s)
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300")}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <p className="text-[10px] text-slate-400">Incident will be assigned to you and set to Investigating</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-white transition">
              Cancel
            </button>
            <button
              onClick={() => form.title.trim() && create.mutate()}
              disabled={!form.title.trim() || create.isPending}
              className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition"
            >
              {create.isPending ? <RefreshCw size={11} className="animate-spin" /> : <AlertTriangle size={11} />}
              Create Incident
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function IncidentsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const { data: incData, isLoading: incLoading } = useQuery({
    queryKey: ["incidents", statusFilter],
    queryFn: () => {
      const qs = statusFilter ? `?status=${statusFilter}` : "";
      return fetch(`/api/support/incidents${qs}`, { credentials: "include" }).then(r => r.json());
    },
    staleTime: 30_000, refetchInterval: 60_000,
  });

  const { data: health = [] } = useQuery<ServiceHealth[]>({
    queryKey: ["service-health"],
    queryFn: () => fetch("/api/support/service-health", { credentials: "include" }).then(r => r.json()),
    staleTime: 60_000, refetchInterval: 120_000,
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ["dash-alerts"],
    queryFn: () => fetch("/api/support/dashboard/alerts", { credentials: "include" }).then(r => r.json()),
    staleTime: 30_000,
  });

  const { data: activity = [] } = useQuery({
    queryKey: ["dash-activity"],
    queryFn: () => fetch("/api/support/dashboard/recent-activity", { credentials: "include" }).then(r => r.json()),
    staleTime: 30_000,
  });

  const { data: trends } = useQuery<IncidentTrends>({
    queryKey: ["incident-trends"],
    queryFn: () => fetch("/api/support/incidents/trends", { credentials: "include" }).then(r => r.json()),
    staleTime: 120_000, refetchInterval: 300_000,
  });

  const incidents: Incident[] = incData?.incidents ?? [];
  const activeInc  = incidents.filter(i => !["resolved","closed"].includes(i.status));
  const criticalInc = incidents.filter(i => i.severity === "SEV-1" && !["resolved","closed"].includes(i.status));
  const affectedAcc = activeInc.reduce((a, i) => a + (i.affected_accounts ?? 0), 0);
  const degradedSvc = health.filter(h => h.status !== "operational").length;

  // MTTR: avg duration for resolved incidents (last 30 days)
  const resolvedInc = incidents.filter(i => i.status === "resolved" && i.duration_sec);
  const mttr = resolvedInc.length > 0
    ? resolvedInc.reduce((a, i) => a + parseFloat(String(i.duration_sec)), 0) / resolvedInc.length
    : 0;

  const kpis = [
    { label: "Active Incidents",     value: activeInc.length,  color: activeInc.length > 0 ? "#ef4444" : "#10b981", icon: <AlertTriangle size={14} /> },
    { label: "Critical Incidents",   value: criticalInc.length, color: "#ef4444", icon: <AlertTriangle size={14} /> },
    { label: "Affected Accounts",    value: affectedAcc.toLocaleString(), color: "#f97316", icon: <Users size={14} /> },
    { label: "Services Degraded",    value: degradedSvc,        color: "#f59e0b", icon: <Server size={14} /> },
    { label: "Mean Time to Resolve", value: fmtDuration(mttr),  color: "#8b5cf6", icon: <Clock size={14} /> },
    { label: "Incidents This Month", value: incidents.length,   color: "#6366f1", icon: <Activity size={14} /> },
  ];

  const STATUS_FILTERS = [
    { value: undefined,      label: "All" },
    { value: "investigating",label: "Investigating" },
    { value: "identified",   label: "Identified" },
    { value: "monitoring",   label: "Monitoring" },
    { value: "resolved",     label: "Resolved" },
  ];

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden bg-slate-50">
      {/* ── Main Content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-w-0">
        {/* Header */}
        <div className="px-6 py-4 bg-white border-b border-slate-200 sticky top-0 z-10 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-black text-slate-900">Incident & Service Health Management</h1>
              <p className="text-xs text-slate-500 mt-0.5">Monitor system health, manage incidents, and communicate with customers</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => qc.invalidateQueries()} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
                <RefreshCw size={12} /> Refresh
              </button>
              <button className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
                Status Page
              </button>
              <button className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
                Reports
              </button>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition"
              >
                <Plus size={12} /> Create Incident
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* ── KPI Row ──────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-6 gap-4">
            {kpis.map(kpi => (
              <div key={kpi.label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold text-slate-500 leading-snug">{kpi.label}</span>
                  <span className="text-slate-300">{kpi.icon}</span>
                </div>
                <div className="text-2xl font-black mt-1" style={{ color: kpi.color }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* ── Service Health Grid ───────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black text-slate-800">Service Health Overview</h2>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {health.map(svc => {
                const cfg = HEALTH_STATUS_CFG[svc.status] ?? HEALTH_STATUS_CFG.operational;
                const sparkColor = svc.status === "operational" ? "#10b981" : svc.status === "degraded" ? "#f59e0b" : "#ef4444";
                return (
                  <div key={svc.key} className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm hover:shadow-md transition">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">{SERVICE_ICONS[svc.key] ?? <Server size={14} />}</span>
                        <span className="text-[11px] font-bold text-slate-700 leading-tight">{svc.label}</span>
                      </div>
                      <span className={clsx("text-[9px] font-black px-1.5 py-0.5 rounded-full", cfg.badge)}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 mb-2">
                      <div>
                        <p className="text-[9px] text-slate-400">Uptime</p>
                        <p className="text-[11px] font-black text-slate-800">{svc.uptime}%</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-400">Latency</p>
                        <p className="text-[11px] font-black text-slate-800">{svc.latency}ms</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-400">Errors</p>
                        <p className="text-[11px] font-black text-slate-800">{svc.errorRate}%</p>
                      </div>
                    </div>
                    <MiniSparkline values={svc.sparkline ?? []} color={sparkColor} />
                  </div>
                );
              })}
              {health.length === 0 && Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-xl p-3.5 animate-pulse">
                  <div className="h-4 bg-slate-100 rounded w-24 mb-2" />
                  <div className="h-3 bg-slate-50 rounded w-full" />
                </div>
              ))}
            </div>
          </div>

          {/* ── Active Incidents Table ────────────────────────────────────────── */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-black text-slate-800">Active Incidents</h2>
                <div className="flex gap-1">
                  {STATUS_FILTERS.map(f => (
                    <button key={String(f.value)} onClick={() => setStatusFilter(f.value)}
                      className={clsx("px-2.5 py-1 rounded-full text-[10px] font-semibold transition",
                        statusFilter === f.value ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr className="text-slate-500">
                    <th className="text-left px-4 py-2.5 font-semibold">Incident ID</th>
                    <th className="text-left px-2 py-2.5 font-semibold">Title</th>
                    <th className="text-left px-2 py-2.5 font-semibold">Severity</th>
                    <th className="text-left px-2 py-2.5 font-semibold">Status</th>
                    <th className="text-right px-2 py-2.5 font-semibold">Affected</th>
                    <th className="text-left px-2 py-2.5 font-semibold">Created</th>
                    <th className="text-left px-2 py-2.5 font-semibold">Owner</th>
                    <th className="text-right px-2 py-2.5 font-semibold">Duration</th>
                    <th className="px-2 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {incLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="border-b border-slate-50">
                        {Array.from({ length: 8 }).map((__, j) => (
                          <td key={j} className="px-2 py-3"><div className="h-3 bg-slate-100 rounded animate-pulse" /></td>
                        ))}
                      </tr>
                    ))
                  ) : incidents.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center">
                        <CheckCircle size={28} className="mx-auto mb-2 text-emerald-300" />
                        <p className="text-sm font-semibold text-slate-500">No active incidents</p>
                        <p className="text-xs text-slate-400 mt-1">All systems are operating normally</p>
                      </td>
                    </tr>
                  ) : (
                    incidents.map(inc => {
                      const sevCfg = SEV_CFG[inc.severity] ?? SEV_CFG["SEV-3"];
                      const stsCfg = STATUS_CFG[inc.status] ?? "bg-slate-100 text-slate-600";
                      return (
                        <tr key={inc.id} onClick={() => navigate(`/isTeam/incidents/${inc.id}`)}
                          className="border-b border-slate-50 hover:bg-indigo-50 cursor-pointer transition group">
                          <td className="px-4 py-3">
                            <span className="font-mono text-indigo-600 font-bold">INC-{String(inc.id).padStart(4,"0")}</span>
                          </td>
                          <td className="px-2 py-3 font-semibold text-slate-800 max-w-[240px]">
                            <p className="truncate">{inc.title}</p>
                            {inc.services?.length > 0 && (
                              <p className="text-[9px] text-slate-400 mt-0.5 truncate">{inc.services.join(", ")}</p>
                            )}
                          </td>
                          <td className="px-2 py-3">
                            <span className={clsx("text-[9px] font-black px-1.5 py-0.5 rounded border", sevCfg.bg, sevCfg.text, sevCfg.border)}>
                              {inc.severity}
                            </span>
                          </td>
                          <td className="px-2 py-3">
                            <span className={clsx("text-[9px] font-semibold px-2 py-0.5 rounded-full capitalize", stsCfg)}>
                              {inc.status.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="px-2 py-3 text-right font-semibold text-slate-700">{(inc.affected_accounts ?? 0).toLocaleString()}</td>
                          <td className="px-2 py-3 text-slate-500">{format(new Date(inc.created_at), "MMM d, h:mm aa")}</td>
                          <td className="px-2 py-3 text-slate-600">{inc.owner_name ?? "—"}</td>
                          <td className="px-2 py-3 text-right font-mono text-slate-600">{fmtDuration(parseFloat(String(inc.duration_sec)))}</td>
                          <td className="px-2 py-3">
                            <ChevronRight size={12} className="text-slate-300 group-hover:text-indigo-500 transition" />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Incident Trends & Metrics ─────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 size={14} className="text-slate-400" />
              <h2 className="text-sm font-black text-slate-800">Incident Trends & Metrics</h2>
              <span className="text-[10px] text-slate-400 font-medium ml-1">Last 14 days</span>
            </div>

            {/* Row 1: Bar chart + Donut */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              {/* Incidents Over Time */}
              <div className="col-span-2 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-[11px] font-black text-slate-800">Incidents Over Time</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">Daily opened vs. resolved</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-[9px] text-slate-500 font-semibold">
                      <span className="inline-block w-2 h-2 rounded-sm bg-indigo-500" /> Opened
                    </span>
                    <span className="flex items-center gap-1 text-[9px] text-slate-500 font-semibold">
                      <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" /> Resolved
                    </span>
                  </div>
                </div>
                {trends ? (
                  <IncidentBarChart data={trends.dailyCounts} />
                ) : (
                  <div className="h-[110px] bg-slate-50 rounded-lg animate-pulse" />
                )}
              </div>

              {/* Incidents by Severity */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-black text-slate-800 mb-1">By Severity</p>
                <p className="text-[9px] text-slate-400 mb-3">Last 30 days</p>
                {trends ? (
                  <SeverityDonut data={trends.bySeverity} />
                ) : (
                  <div className="flex items-center justify-center h-[88px]">
                    <div className="w-16 h-16 rounded-full border-8 border-slate-100 animate-pulse" />
                  </div>
                )}
              </div>
            </div>

            {/* Row 2: MTTR line chart + Top Services */}
            <div className="grid grid-cols-3 gap-4">
              {/* MTTR Over Time */}
              <div className="col-span-2 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-[11px] font-black text-slate-800">MTTR Over Time</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">Mean time to resolve (minutes)</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-semibold">
                    <span className="inline-block w-5 h-0.5 bg-violet-500" />
                    Avg. resolution
                  </div>
                </div>
                {trends ? (
                  <MTTRLineChart data={trends.mttrByDay} />
                ) : (
                  <div className="h-[110px] bg-slate-50 rounded-lg animate-pulse" />
                )}
              </div>

              {/* Top Impacted Services */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <p className="text-[11px] font-black text-slate-800 mb-1">Top Impacted Services</p>
                <p className="text-[9px] text-slate-400 mb-3">By incident count · 30 days</p>
                {!trends ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-5 bg-slate-100 rounded animate-pulse" />
                    ))}
                  </div>
                ) : trends.topServices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-20 text-center">
                    <CheckCircle size={18} className="text-emerald-300 mb-1" />
                    <p className="text-[10px] text-slate-400">No incidents this period</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(() => {
                      const maxC = Math.max(...trends.topServices.map(s => s.count), 1);
                      return trends.topServices.map((svc, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[9px] font-bold text-slate-400 w-3">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-0.5">
                              <p className="text-[10px] font-semibold text-slate-700 truncate pr-1">{svc.service}</p>
                              <span className="text-[10px] font-black text-slate-800 flex-shrink-0">{svc.count}</span>
                            </div>
                            <div className="h-1 bg-slate-100 rounded-full">
                              <div
                                className="h-1 bg-indigo-400 rounded-full transition-all"
                                style={{ width: `${(svc.count / maxC) * 100}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Right Sidebar ──────────────────────────────────────────────────────── */}
      <div className="w-72 bg-white border-l border-slate-200 flex flex-col overflow-hidden flex-shrink-0">
        {/* Critical Alerts */}
        <div className="border-b border-slate-100 flex-shrink-0">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-800">Critical Alerts</h3>
              {alerts.length > 0 && (
                <span className="bg-rose-500 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                  {alerts.length}
                </span>
              )}
            </div>
            <button className="text-[10px] text-indigo-600 font-semibold hover:underline">View All</button>
          </div>
          <div className="px-3 pb-3 space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
            {alerts.length === 0 ? (
              <div className="text-center py-4">
                <CheckCircle size={18} className="mx-auto mb-1 text-emerald-400" />
                <p className="text-[11px] text-slate-400">No active alerts</p>
              </div>
            ) : alerts.map((a: any) => (
              <div key={a.id} className="bg-red-50 border border-red-200 rounded-xl p-2.5">
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-red-700 leading-snug">{a.type}</p>
                    <p className="text-[10px] text-slate-600 mt-0.5">{a.detail}</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">{formatDistanceToNow(new Date(a.detectedAt), { addSuffix: true })}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="border-b border-slate-100 flex-shrink-0">
          <div className="px-4 py-3 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800">Recent Activity</h3>
            <button className="text-[10px] text-indigo-600 font-semibold hover:underline">View All</button>
          </div>
          <div className="px-3 pb-3 space-y-0 max-h-44 overflow-y-auto scrollbar-thin">
            {activity.length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center py-3">No recent activity</p>
            ) : activity.slice(0, 8).map((ev: any, i: number) => (
              <div key={i} className="flex items-start gap-2 py-2 border-b border-slate-50 last:border-0">
                <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-[8px] font-bold flex-shrink-0 mt-0.5">
                  {(ev.agent_name ?? "SA").split(" ").map((w: string) => w[0]).join("").slice(0,2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-slate-700 font-medium">{ev.type?.replace(/_/g," ")}</p>
                  {ev.agent_name && <p className="text-[9px] text-slate-400">{ev.agent_name}</p>}
                </div>
                <span className="text-[9px] text-slate-400 flex-shrink-0">{formatDistanceToNow(new Date(ev.occurred_at), { addSuffix: false })} ago</span>
              </div>
            ))}
          </div>
        </div>

        {/* Open Incident Tasks */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
            <h3 className="text-xs font-bold text-slate-800">Open Incident Tasks</h3>
            <button className="text-[10px] text-indigo-600 font-semibold hover:underline">View All</button>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-2 space-y-1.5">
            {activeInc.slice(0, 3).map(inc => (
              <div key={inc.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-[9px] text-slate-500">INC-{String(inc.id).padStart(4,"0")}</span>
                  <span className={clsx("text-[8px] font-black px-1 py-0.5 rounded", SEV_CFG[inc.severity]?.bg, SEV_CFG[inc.severity]?.text)}>
                    {inc.severity}
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-slate-800 leading-snug line-clamp-2">{inc.title}</p>
                <p className="text-[9px] text-slate-400 mt-1">{inc.owner_name ?? "Unassigned"} · {formatDistanceToNow(new Date(inc.created_at), { addSuffix: true })}</p>
                <button onClick={() => navigate(`/isTeam/incidents/${inc.id}`)}
                  className="mt-1.5 w-full text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold text-left flex items-center gap-0.5">
                  View Incident <ChevronRight size={9} />
                </button>
              </div>
            ))}
            {activeInc.length === 0 && (
              <div className="text-center py-6">
                <CheckCircle size={22} className="mx-auto mb-1.5 text-emerald-300" />
                <p className="text-[11px] text-slate-400">No open incidents</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Incident Modal */}
      {showCreate && <CreateIncidentModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
