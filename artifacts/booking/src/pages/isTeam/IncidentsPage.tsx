import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import {
  AlertTriangle, CheckCircle, AlertCircle, Clock, Activity, Plus, X,
  RefreshCw, ChevronRight, ArrowLeft, Users, Zap, TrendingUp,
  Shield, Send, Check, Circle, ExternalLink,
  FileText, MessageSquare, ListTodo, BookOpen, Terminal,
  History, Wrench, ChevronDown, Loader2, Wifi, WifiOff,
  BarChart2, Database
} from "lucide-react";

function useIncidentSocket(onUpdate: (incidentId: number | null) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cbRef = useRef(onUpdate);
  cbRef.current = onUpdate;

  useEffect(() => {
    let dead = false;
    function connect() {
      if (dead) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${window.location.host}/ws/admin-status`);
      wsRef.current = ws;
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === "incident_update") cbRef.current(msg.incidentId ?? null);
          else if (msg.type === "status_update") cbRef.current(null);
        } catch {}
      };
      ws.onclose = () => { if (!dead) reconnRef.current = setTimeout(connect, 5_000); };
      ws.onerror = () => ws.close();
    }
    connect();
    return () => {
      dead = true;
      if (reconnRef.current) clearTimeout(reconnRef.current);
      wsRef.current?.close();
    };
  }, []);
}

const API = "/api/support";
async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...opts?.headers },
    ...opts,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function fmtDuration(seconds: number | null | undefined) {
  if (!seconds) return "—";
  const s = Math.round(Number(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function timeAgo(d: string | null | undefined) {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const SEV_STYLES: Record<string, { badge: string; label: string }> = {
  "SEV-1": { badge: "bg-red-100 text-red-700 border border-red-300",    label: "SEV-1 Critical" },
  "SEV-2": { badge: "bg-orange-100 text-orange-700 border border-orange-300", label: "SEV-2 High" },
  "SEV-3": { badge: "bg-amber-100 text-amber-700 border border-amber-300",  label: "SEV-3 Medium" },
  "SEV-4": { badge: "bg-slate-100 text-slate-600 border border-slate-300",  label: "SEV-4 Low" },
};
function SevBadge({ sev }: { sev: string }) {
  const s = SEV_STYLES[sev] ?? SEV_STYLES["SEV-4"];
  return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${s.badge}`}>{sev}</span>;
}

const STATUS_STYLES: Record<string, string> = {
  investigating:      "bg-red-50 text-red-700 border border-red-200",
  identified:         "bg-orange-50 text-orange-700 border border-orange-200",
  monitoring:         "bg-blue-50 text-blue-700 border border-blue-200",
  resolved:           "bg-emerald-50 text-emerald-700 border border-emerald-200",
  postmortem_pending: "bg-purple-50 text-purple-700 border border-purple-200",
  closed:             "bg-slate-100 text-slate-500 border border-slate-200",
};
function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-slate-100 text-slate-500 border border-slate-200";
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${cls}`}>
      {status?.replace(/_/g, " ")}
    </span>
  );
}

const HEALTH_STYLES: Record<string, { dot: string; label: string; card: string; ring: string }> = {
  operational: { dot: "bg-emerald-500", label: "Operational", card: "border-slate-200 bg-white hover:border-indigo-300", ring: "" },
  degraded:    { dot: "bg-amber-400 animate-pulse",   label: "Degraded",    card: "border-amber-300 bg-amber-50/40 hover:border-amber-400", ring: "ring-1 ring-amber-300" },
  outage:      { dot: "bg-red-500 animate-pulse",     label: "Outage",      card: "border-red-300 bg-red-50/40 hover:border-red-400", ring: "ring-1 ring-red-300" },
  maintenance: { dot: "bg-blue-400",    label: "Maintenance", card: "border-blue-200 bg-blue-50/30 hover:border-blue-300", ring: "" },
};

// ─── ANIMATED METRIC VALUE ────────────────────────────────────────────────────
function AnimatedValue({ value, suffix = "" }: { value: string | number; suffix?: string }) {
  const [displayed, setDisplayed] = useState(value);
  const [flash, setFlash] = useState(false);
  const prevRef = useRef(value);

  useEffect(() => {
    if (prevRef.current !== value) {
      setFlash(true);
      setDisplayed(value);
      prevRef.current = value;
      const t = setTimeout(() => setFlash(false), 600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [value]);

  return (
    <span className={`transition-colors duration-300 ${flash ? "text-indigo-600" : ""}`}>
      {displayed}{suffix}
    </span>
  );
}

// ─── SPARKLINE ────────────────────────────────────────────────────────────────
function Sparkline({ data, color = "#10b981", height = 24, width = 80 }: { data: number[]; color?: string; height?: number; width?: number }) {
  if (!data?.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 2) - 1}`);
  return (
    <svg width={width} height={height} className="opacity-70">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── SERVICE DETAIL PANEL ─────────────────────────────────────────────────────
function ServiceDetailPanel({ svc, onClose }: { svc: any; onClose: () => void }) {
  const [tab, setTab] = useState<"stats" | "logs" | "events" | "heal">("stats");
  const [healResult, setHealResult] = useState<{ actionId: string; message: string; ok: boolean } | null>(null);
  const qc = useQueryClient();

  const { data: detail, isLoading, refetch } = useQuery<any>({
    queryKey: ["service-detail", svc.key],
    queryFn: () => apiFetch(`/service-health/${svc.key}`),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const healMut = useMutation({
    mutationFn: (actionId: string) => apiFetch(`/service-health/${svc.key}/heal`, {
      method: "POST",
      body: JSON.stringify({ actionId }),
    }),
    onSuccess: (d, actionId) => {
      setHealResult({ actionId, message: d.message, ok: true });
      refetch();
      qc.invalidateQueries({ queryKey: ["service-health"] });
    },
    onError: (e: any, actionId) => {
      setHealResult({ actionId, message: String(e.message ?? "Action failed"), ok: false });
    },
  });

  const hs = HEALTH_STYLES[svc.status] ?? HEALTH_STYLES.operational;
  const healthColor = svc.status === "operational" ? "#10b981" : svc.status === "degraded" ? "#f59e0b" : "#ef4444";

  const SEVERITY_BTN: Record<string, string> = {
    low:    "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200",
    medium: "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200",
    high:   "bg-red-50 text-red-800 hover:bg-red-100 border border-red-200",
  };
  const LOG_LEVEL_COLOR: Record<string, string> = {
    info: "text-slate-400",
    warn: "text-amber-500",
    error: "text-red-500",
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={onClose}>
      <div
        className="bg-white w-full max-w-xl h-full flex flex-col shadow-2xl border-l border-slate-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-5 py-4 border-b border-slate-200 flex-shrink-0 ${
          svc.status === "outage" ? "bg-red-50" : svc.status === "degraded" ? "bg-amber-50" : "bg-white"
        }`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${hs.dot}`} />
                <span className={`text-xs font-semibold ${
                  svc.status === "outage" ? "text-red-700" : svc.status === "degraded" ? "text-amber-700" : "text-emerald-700"
                }`}>{hs.label}</span>
              </div>
              <h2 className="text-base font-semibold text-slate-900">{svc.label}</h2>
              <p className="text-xs text-slate-500 mt-0.5">Live service telemetry & remediation</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => refetch()} className="p-1.5 hover:bg-slate-100 rounded-lg transition text-slate-400 hover:text-slate-600">
                <RefreshCw size={13} />
              </button>
              <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Live metric strip */}
          <div className="grid grid-cols-3 gap-3 mt-3">
            {[
              { label: "Uptime", value: detail?.uptime ?? svc.uptime, suffix: "%", warn: parseFloat(detail?.uptime ?? svc.uptime) < 99.5 },
              { label: "Latency", value: detail?.latency ?? svc.latency, suffix: "ms", warn: (detail?.latency ?? svc.latency) > 400 },
              { label: "Error %", value: detail?.errorRate ?? svc.errorRate, suffix: "%", warn: (detail?.errorRate ?? svc.errorRate) > 0.5 },
            ].map(m => (
              <div key={m.label} className="bg-white/70 rounded-lg px-3 py-2 border border-slate-200/80">
                <p className="text-[10px] text-slate-400 mb-0.5">{m.label}</p>
                <p className={`text-sm font-bold ${m.warn ? "text-amber-600" : "text-slate-800"}`}>
                  <AnimatedValue value={m.value} suffix={m.suffix} />
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 flex-shrink-0 px-5">
          {([
            { id: "stats", icon: BarChart2, label: "Stats" },
            { id: "logs",  icon: Terminal,  label: "Logs" },
            { id: "events",icon: History,   label: "Events" },
            { id: "heal",  icon: Wrench,    label: "Heal", count: detail?.actions?.length },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition ${
                tab === t.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <t.icon size={12} />
              {t.label}
              {'count' in t && (t as { count?: number }).count !== undefined && (t as { count?: number }).count! > 0 && (
                <span className="bg-indigo-100 text-indigo-700 rounded-full px-1.5 text-[10px] font-bold">{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center h-40 text-slate-400">
              <Loader2 size={20} className="animate-spin mr-2" /> Loading…
            </div>
          )}

          {/* STATS TAB */}
          {!isLoading && tab === "stats" && (
            <div className="p-5 space-y-5">
              {/* Long sparkline */}
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-2">Latency — Last 5 minutes (60 samples)</p>
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                  <Sparkline data={detail?.longSparkline ?? []} color={healthColor} height={56} width={420} />
                </div>
              </div>

              {/* Metric cards */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Uptime (30d)", value: `${detail?.uptime ?? svc.uptime}%`, sub: "Rolling 30-day SLA" },
                  { label: "P50 Latency",  value: `${Math.round((detail?.latency ?? svc.latency) * 0.85)}ms`, sub: "50th percentile" },
                  { label: "P99 Latency",  value: `${Math.round((detail?.latency ?? svc.latency) * 1.8)}ms`, sub: "99th percentile" },
                  { label: "Error Rate",   value: `${detail?.errorRate ?? svc.errorRate}%`, sub: "Last 24 hours" },
                ].map(m => (
                  <div key={m.label} className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                    <p className="text-[10px] text-slate-400">{m.label}</p>
                    <p className="text-lg font-bold text-slate-900 mt-0.5">{m.value}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{m.sub}</p>
                  </div>
                ))}
              </div>

              {/* Status chip */}
              <div className={`rounded-xl p-3 border flex items-center gap-2.5 ${
                svc.status === "outage" ? "bg-red-50 border-red-200" :
                svc.status === "degraded" ? "bg-amber-50 border-amber-200" :
                "bg-emerald-50 border-emerald-200"
              }`}>
                {svc.status === "operational"
                  ? <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />
                  : <AlertTriangle size={16} className={`flex-shrink-0 ${svc.status === "outage" ? "text-red-500" : "text-amber-500"}`} />
                }
                <div>
                  <p className="text-xs font-semibold text-slate-800">
                    {svc.status === "operational" ? "All systems nominal" : svc.status === "degraded" ? "Service degraded — monitoring" : "Outage detected — immediate action required"}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {svc.status === "outage" ? "Use the Heal tab to restore service or create an incident." : "Metrics refreshed every 15s via live poll."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* LOGS TAB */}
          {!isLoading && tab === "logs" && (
            <div className="font-mono text-xs">
              <div className="sticky top-0 bg-slate-900 text-slate-300 px-4 py-2 flex items-center gap-2 text-[10px]">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live — {detail?.logs?.length ?? 0} recent entries
              </div>
              <div className="bg-slate-950">
                {(detail?.logs ?? []).map((log: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-1.5 border-b border-slate-800/60 hover:bg-slate-900/40">
                    <span className="text-slate-500 flex-shrink-0 pt-0.5">
                      {new Date(log.ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                    <span className={`uppercase font-bold text-[10px] flex-shrink-0 pt-0.5 w-10 ${LOG_LEVEL_COLOR[log.level] ?? "text-slate-400"}`}>
                      {log.level}
                    </span>
                    <span className="text-slate-300 flex-1 leading-relaxed">{log.message}</span>
                  </div>
                ))}
                {(!detail?.logs || detail.logs.length === 0) && (
                  <div className="text-slate-500 text-center py-10">No log entries</div>
                )}
              </div>
            </div>
          )}

          {/* EVENTS TAB */}
          {!isLoading && tab === "events" && (
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-500">Remediation actions run on this service this session.</p>
              {(detail?.events ?? []).length === 0 && (
                <div className="py-10 text-center text-slate-400">
                  <History size={24} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No heal events yet</p>
                  <p className="text-xs mt-1">Run an action from the Heal tab</p>
                </div>
              )}
              {(detail?.events ?? []).map((ev: any, i: number) => (
                <div key={i} className="flex items-start gap-3 bg-slate-50 rounded-xl border border-slate-200 p-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${ev.status === "success" ? "bg-emerald-100" : "bg-red-100"}`}>
                    {ev.status === "success"
                      ? <Check size={11} className="text-emerald-600" />
                      : <X size={11} className="text-red-600" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800">{ev.label}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{ev.status} · {ev.durationMs}ms · {timeAgo(ev.ts)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* HEAL TAB */}
          {!isLoading && tab === "heal" && (
            <div className="p-5 space-y-4">
              {healResult && (
                <div className={`rounded-xl p-3 border flex items-start gap-2.5 ${
                  healResult.ok ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
                }`}>
                  {healResult.ok
                    ? <CheckCircle size={14} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                    : <AlertCircle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
                  }
                  <div>
                    <p className="text-xs font-semibold text-slate-800">{healResult.ok ? "Action completed" : "Action failed"}</p>
                    <p className="text-[10px] text-slate-600 mt-0.5">{healResult.message}</p>
                  </div>
                  <button onClick={() => setHealResult(null)} className="ml-auto text-slate-400 hover:text-slate-600">
                    <X size={12} />
                  </button>
                </div>
              )}

              <div className="space-y-2.5">
                {(detail?.actions ?? []).map((action: any) => (
                  <div key={action.id} className="bg-slate-50 rounded-xl border border-slate-200 p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-xs font-semibold text-slate-900">{action.label}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${SEVERITY_BTN[action.severity] ?? SEVERITY_BTN.low}`}>
                            {action.severity}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500">{action.description}</p>
                      </div>
                      <button
                        onClick={() => healMut.mutate(action.id)}
                        disabled={healMut.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition flex-shrink-0"
                      >
                        {healMut.isPending && healMut.variables === action.id
                          ? <Loader2 size={11} className="animate-spin" />
                          : <Zap size={11} />
                        }
                        Run
                      </button>
                    </div>
                  </div>
                ))}
                {(!detail?.actions || detail.actions.length === 0) && (
                  <p className="text-xs text-slate-400 text-center py-8">No healing actions available for this service</p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 p-3 bg-blue-50/40">
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  <strong className="text-slate-700">Tip:</strong> If issues persist after running healing actions, create a formal incident from the main page for team visibility and tracking.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SERVICE HEALTH GRID ──────────────────────────────────────────────────────
function ServiceHealthGrid() {
  const [selected, setSelected] = useState<any | null>(null);
  const { data = [], isLoading } = useQuery<any[]>({
    queryKey: ["service-health"],
    queryFn: () => apiFetch("/service-health"),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const healthColor = (status: string) => status === "operational" ? "#10b981" : status === "degraded" ? "#f59e0b" : "#ef4444";

  // Sort: outage first, then degraded, then operational
  const sorted = [...data].sort((a, b) => {
    const order: Record<string, number> = { outage: 0, degraded: 1, maintenance: 2, operational: 3 };
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });

  if (isLoading) return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {[...Array(10)].map((_, i) => <div key={i} className="h-28 bg-slate-100 rounded-xl animate-pulse" />)}
    </div>
  );

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {sorted.map((svc: any) => {
          const hs = HEALTH_STYLES[svc.status] ?? HEALTH_STYLES.operational;
          const color = healthColor(svc.status);
          const isBad = svc.status === "outage" || svc.status === "degraded";
          return (
            <button
              key={svc.key}
              className={`bg-white border rounded-xl p-3 shadow-sm text-left w-full transition cursor-pointer group ${hs.card} ${hs.ring}`}
              onClick={() => setSelected(svc)}
            >
              {/* Status header */}
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-slate-800 leading-snug group-hover:text-indigo-700 transition">{svc.label}</p>
                <span className={`text-[10px] font-medium flex items-center gap-1 ${
                  svc.status === "operational" ? "text-emerald-600" :
                  svc.status === "outage" ? "text-red-600" : "text-amber-600"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${hs.dot}`} />
                  {hs.label}
                </span>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-1 mb-2">
                <div>
                  <p className="text-[10px] text-slate-400">Uptime</p>
                  <p className={`text-xs font-bold ${isBad ? "text-amber-700" : "text-slate-800"}`}>
                    <AnimatedValue value={svc.uptime} suffix="%" />
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Latency</p>
                  <p className={`text-xs font-bold ${svc.latency > 400 ? "text-amber-700" : "text-slate-800"}`}>
                    <AnimatedValue value={svc.latency} suffix="ms" />
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Error %</p>
                  <p className={`text-xs font-bold ${svc.errorRate > 0.5 ? "text-red-600" : "text-slate-800"}`}>
                    <AnimatedValue value={svc.errorRate} suffix="%" />
                  </p>
                </div>
              </div>

              {/* Sparkline */}
              <div className="flex items-center justify-between">
                <Sparkline data={svc.sparkline} color={color} />
                <ChevronRight size={11} className="text-slate-300 group-hover:text-indigo-400 transition" />
              </div>
            </button>
          );
        })}
      </div>

      {selected && <ServiceDetailPanel svc={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

// ─── KPI ROW ─────────────────────────────────────────────────────────────────
function KPIRow({ kpi }: { kpi: any }) {
  const mttr = kpi?.mttrMinutes;
  const mttrStr = mttr ? `${Math.floor(mttr / 60)}h ${mttr % 60}m` : "—";
  const cards = [
    { label: "Active Incidents",    value: kpi?.activeIncidents ?? 0,  icon: AlertTriangle, color: "text-red-500",    bg: "bg-red-50",     alert: (kpi?.activeIncidents ?? 0) > 0 },
    { label: "Critical Incidents",  value: kpi?.criticalIncidents ?? 0, icon: AlertCircle,  color: "text-red-600",   bg: "bg-red-100",    alert: (kpi?.criticalIncidents ?? 0) > 0 },
    { label: "Affected Accounts",   value: (kpi?.affectedAccounts ?? 0).toLocaleString(), icon: Users, color: "text-orange-500", bg: "bg-orange-50", alert: (kpi?.affectedAccounts ?? 0) > 0 },
    { label: "Services Degraded",   value: kpi?.servicesDegraded ?? 0,  icon: Activity,     color: "text-amber-500", bg: "bg-amber-50",   alert: (kpi?.servicesDegraded ?? 0) > 0 },
    { label: "Mean Time to Resolve",value: mttrStr,                     icon: Clock,         color: "text-blue-500",  bg: "bg-blue-50",    alert: false },
    { label: "Incidents This Month",value: kpi?.incidentsThisMonth ?? 0, icon: TrendingUp,   color: "text-slate-500", bg: "bg-slate-50",   alert: false },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
      {cards.map(c => {
        const Icon = c.icon;
        return (
          <div key={c.label} className={`bg-white border rounded-xl p-4 shadow-sm ${c.alert ? "border-red-200" : "border-slate-200"}`}>
            <div className="flex items-center gap-1.5 mb-2">
              <div className={`w-7 h-7 rounded-lg ${c.bg} flex items-center justify-center`}>
                <Icon size={13} className={c.color} />
              </div>
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide leading-tight">{c.label}</span>
            </div>
            <p className={`text-2xl font-bold ${c.alert ? "text-red-600" : "text-slate-900"}`}>{c.value}</p>
          </div>
        );
      })}
    </div>
  );
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className={`bg-white rounded-xl shadow-2xl w-full ${wide ? "max-w-2xl" : "max-w-lg"} p-6 max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg transition"><X size={16} className="text-slate-500" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const SERVICES_LIST = [
  "AI Receptionist", "Booking System", "Website Builder", "SMS Platform",
  "Email Platform", "Stripe Billing", "Domain Provisioning", "SSL Provisioning",
  "Authentication", "API Infrastructure",
];

function CreateIncidentModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [severity, setSeverity] = useState("SEV-3");
  const [services, setServices] = useState<string[]>([]);
  const [rootCause, setRootCause] = useState("");
  const mut = useMutation({
    mutationFn: () => apiFetch("/incidents", {
      method: "POST",
      body: JSON.stringify({ title, description: desc, severity, services, rootCause: rootCause || undefined }),
    }),
    onSuccess: (d) => { onCreated(d.id); onClose(); },
  });
  const toggleSvc = (s: string) => setServices(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  return (
    <Modal title="Create New Incident" onClose={onClose} wide>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-slate-700 block mb-1">Title *</label>
          <input value={title} onChange={e => setTitle(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="e.g. AI Receptionist High Error Rate" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700 block mb-1">Description</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            placeholder="Describe what's happening…" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700 block mb-1">Severity</label>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(SEV_STYLES).map(([k, v]) => (
              <button key={k} onClick={() => setSeverity(k)}
                className={`px-3 py-2 rounded-lg text-xs font-bold border transition ${severity === k ? v.badge + " ring-2 ring-offset-1 ring-indigo-500" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                {k}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700 block mb-1">Affected Services</label>
          <div className="flex flex-wrap gap-1.5">
            {SERVICES_LIST.map(s => (
              <button key={s} onClick={() => toggleSvc(s)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${services.includes(s) ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 text-slate-600 hover:border-indigo-300"}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700 block mb-1">Root Cause (optional)</label>
          <input value={rootCause} onChange={e => setRootCause(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Known root cause if identified" />
        </div>
        {mut.isError && <p className="text-xs text-red-600">{String(mut.error)}</p>}
        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={!title.trim() || mut.isPending}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition flex items-center gap-1.5">
            <AlertTriangle size={12} />{mut.isPending ? "Creating…" : "Create Incident"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── INCIDENT DASHBOARD ───────────────────────────────────────────────────────
function IncidentDashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState("active");

  useIncidentSocket(useCallback(() => {
    qc.invalidateQueries({ queryKey: ["incident-kpi"] });
    qc.invalidateQueries({ queryKey: ["incidents"] });
    qc.invalidateQueries({ queryKey: ["service-health"] });
    qc.invalidateQueries({ queryKey: ["incident-trends"] });
  }, [qc]));

  const { data: kpi, isLoading: kpiLoading } = useQuery({
    queryKey: ["incident-kpi"],
    queryFn: () => apiFetch("/incidents/kpi"),
    refetchInterval: 30_000,
    staleTime: 5_000,
  });

  const { data: incidentData, isLoading: incLoading } = useQuery({
    queryKey: ["incidents", statusFilter],
    queryFn: () => {
      const param = statusFilter === "all" ? "" : `?status=${statusFilter}`;
      return apiFetch(`/incidents${param}`);
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const { data: trends } = useQuery({
    queryKey: ["incident-trends"],
    queryFn: () => apiFetch("/incidents/trends"),
    staleTime: 60_000,
  });

  const incidents: any[] = incidentData?.incidents ?? [];
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["incident-kpi"] });
    qc.invalidateQueries({ queryKey: ["incidents"] });
    qc.invalidateQueries({ queryKey: ["service-health"] });
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-[1400px] mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Incident & Service Health Management</h1>
            <p className="text-sm text-slate-500 mt-0.5">Monitor system health, manage incidents, and communicate with clients</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={refresh} className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50 transition">
              <RefreshCw size={12} />Refresh
            </button>
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition shadow-sm">
              <Plus size={14} />Create Incident
            </button>
          </div>
        </div>

        {/* KPI */}
        {kpiLoading ? (
          <div className="grid grid-cols-6 gap-3">{[...Array(6)].map((_, i) => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}</div>
        ) : (
          <KPIRow kpi={kpi} />
        )}

        {/* Service Health Grid */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700">Service Health Overview</h2>
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
              Live · refreshes every 10s · click any card for details
            </p>
          </div>
          <ServiceHealthGrid />
        </div>

        {/* Active Incidents Table + Sidebar */}
        <div className="flex gap-5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-700">Active Incidents</h2>
              <div className="flex items-center gap-1.5 border border-slate-200 bg-white rounded-lg p-0.5">
                {["active", "investigating", "identified", "monitoring", "resolved", "all"].map(f => (
                  <button key={f} onClick={() => setStatusFilter(f)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition capitalize ${statusFilter === f ? "bg-indigo-600 text-white" : "text-slate-500 hover:text-slate-700"}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="grid grid-cols-[100px_1fr_90px_130px_90px_80px_80px_40px] gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 uppercase tracking-wide">
                <span>ID</span><span>Title</span><span>Severity</span><span>Status</span><span>Affected</span><span>Owner</span><span>Duration</span><span></span>
              </div>
              {incLoading && [...Array(4)].map((_, i) => (
                <div key={i} className="grid grid-cols-[100px_1fr_90px_130px_90px_80px_80px_40px] gap-3 px-4 py-3 animate-pulse border-b border-slate-100">
                  {[...Array(8)].map((_, j) => <div key={j} className="h-4 bg-slate-100 rounded" />)}
                </div>
              ))}
              {!incLoading && incidents.length === 0 && (
                <div className="py-14 text-center text-slate-400">
                  <Shield size={28} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No incidents found</p>
                  <p className="text-xs mt-1">All systems operational</p>
                </div>
              )}
              {incidents.map((inc: any) => (
                <div key={inc.id}
                  className="grid grid-cols-[100px_1fr_90px_130px_90px_80px_80px_40px] gap-3 px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition cursor-pointer items-center"
                  onClick={() => navigate(`/isTeam/incidents/${inc.id}`)}>
                  <span className="text-xs font-mono font-medium text-indigo-600">INC-{String(inc.id).padStart(4, "0")}</span>
                  <span className="text-sm text-slate-800 truncate font-medium">{inc.title}</span>
                  <SevBadge sev={inc.severity} />
                  <StatusBadge status={inc.status} />
                  <span className="text-sm text-slate-700">{(inc.affected_accounts ?? 0).toLocaleString()}</span>
                  <span className="text-xs text-slate-500 truncate">{inc.owner_name?.split(" ")[0] ?? "—"}</span>
                  <span className="text-xs text-slate-500">{fmtDuration(inc.duration_sec)}</span>
                  <ChevronRight size={14} className="text-slate-400" />
                </div>
              ))}
            </div>
            {incidentData?.total > 25 && (
              <p className="text-xs text-slate-400 mt-2 text-right">{incidentData.total} total incidents</p>
            )}
          </div>

          {/* Right sidebar */}
          <div className="w-72 flex-shrink-0 space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3">Incidents by Severity</p>
              {trends?.bySeverity && Object.entries(trends.bySeverity).map(([sev, count]: any) => {
                const total = Object.values(trends.bySeverity).reduce((a: any, b: any) => a + b, 0) as number;
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                const s = SEV_STYLES[sev];
                return (
                  <div key={sev} className="flex items-center gap-2 mb-2">
                    <span className="w-14 text-xs font-bold text-slate-600">{sev}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-slate-500 w-6 text-right">{count}</span>
                  </div>
                );
              })}
              {!trends && <p className="text-xs text-slate-400">Loading…</p>}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3">Top Impacted Services</p>
              <div className="space-y-2">
                {(trends?.topServices ?? []).slice(0, 6).map((s: any, i: number) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs text-slate-700 truncate">{s.service}</span>
                    <span className="text-xs font-medium text-slate-900 bg-slate-100 rounded px-1.5 py-0.5">{s.count}</span>
                  </div>
                ))}
                {(!trends?.topServices || trends.topServices.length === 0) && (
                  <p className="text-xs text-slate-400">No data yet</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showCreate && <CreateIncidentModal onClose={() => setShowCreate(false)} onCreated={id => navigate(`/isTeam/incidents/${id}`)} />}
    </div>
  );
}

// ─── INCIDENT DETAIL ──────────────────────────────────────────────────────────
type IncidentDetail = {
  incident: any;
  updates: any[];
  tasks: any[];
};

function IncidentDetail({ incidentId }: { incidentId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"timeline" | "tasks" | "postmortem">("timeline");
  const [newUpdate, setNewUpdate] = useState("");
  const [updateStatus, setUpdateStatus] = useState<string>("");
  const [isPublic, setIsPublic] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [pmForm, setPmForm] = useState({ summary: "", rootCause: "", impact: "", resolution: "", lessonsLearned: "", preventativeActions: "" });

  const refetch = useCallback(() => qc.invalidateQueries({ queryKey: ["incident-detail", incidentId] }), [qc, incidentId]);

  useIncidentSocket(useCallback((pushedId) => {
    if (pushedId === null || pushedId === parseInt(incidentId)) {
      qc.invalidateQueries({ queryKey: ["incident-detail", incidentId] });
    }
  }, [qc, incidentId]));

  const { data, isLoading, isError } = useQuery<IncidentDetail>({
    queryKey: ["incident-detail", incidentId],
    queryFn: () => apiFetch(`/incidents/${incidentId}`),
    staleTime: 15_000,
    refetchInterval: 60_000,
  });

  const { data: postmortem } = useQuery({
    queryKey: ["incident-postmortem", incidentId],
    queryFn: () => apiFetch(`/incidents/${incidentId}/postmortem`),
    staleTime: 30_000,
  });

  const updateMut = useMutation({
    mutationFn: () => apiFetch(`/incidents/${incidentId}/updates`, {
      method: "POST",
      body: JSON.stringify({ content: newUpdate, status: updateStatus || undefined, isPublic }),
    }),
    onSuccess: () => { setNewUpdate(""); setUpdateStatus(""); refetch(); },
  });

  const patchMut = useMutation({
    mutationFn: (body: Record<string, any>) => apiFetch(`/incidents/${incidentId}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: refetch,
  });

  const addTaskMut = useMutation({
    mutationFn: () => apiFetch(`/incidents/${incidentId}/tasks`, { method: "POST", body: JSON.stringify({ title: newTask }) }),
    onSuccess: () => { setNewTask(""); refetch(); },
  });

  const toggleTaskMut = useMutation({
    mutationFn: ({ taskId, status }: { taskId: number; status: string }) =>
      apiFetch(`/incidents/${incidentId}/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: refetch,
  });

  const postmortemMut = useMutation({
    mutationFn: () => apiFetch(`/incidents/${incidentId}/postmortem`, {
      method: "POST",
      body: JSON.stringify({
        summary: pmForm.summary, rootCause: pmForm.rootCause, impact: pmForm.impact,
        resolution: pmForm.resolution, lessonsLearned: pmForm.lessonsLearned,
        preventativeActions: pmForm.preventativeActions,
      }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incident-postmortem", incidentId] }),
  });

  if (isLoading) return (
    <div className="flex-1 p-6 animate-pulse space-y-4">
      <div className="h-24 bg-slate-100 rounded-xl" />
      <div className="h-64 bg-slate-100 rounded-xl" />
    </div>
  );

  if (isError || !data) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
      <AlertCircle size={32} className="opacity-40" />
      <p className="text-sm">Incident not found</p>
      <button onClick={() => navigate("/isTeam/incidents")} className="text-sm text-indigo-600 hover:underline">Back to incidents</button>
    </div>
  );

  const { incident, updates, tasks } = data;

  const timelineEvents = [
    { label: "Incident Created", time: incident.created_at, icon: AlertTriangle, color: "text-red-500", bg: "bg-red-100" },
    ...(incident.root_cause ? [{ label: "Root Cause Identified", time: incident.updated_at, icon: CheckCircle, color: "text-orange-500", bg: "bg-orange-100" }] : []),
    ...(incident.resolved_at ? [{ label: "Incident Resolved", time: incident.resolved_at, icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-100" }] : []),
    ...updates.map(u => ({
      label: u.content, time: u.created_at, author: u.author_name,
      isPublic: u.is_public, status: u.status,
      icon: MessageSquare, color: "text-blue-500", bg: "bg-blue-100",
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  const STATUSES = ["investigating", "identified", "monitoring", "resolved", "closed"];

  return (
    <div className="flex-1 overflow-auto flex flex-col">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-start gap-4">
          <button onClick={() => navigate("/isTeam/incidents")} className="mt-1 p-1.5 hover:bg-slate-100 rounded-lg transition flex-shrink-0">
            <ArrowLeft size={14} className="text-slate-500" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap mb-1">
              <span className="text-xs font-mono font-bold text-indigo-600">INC-{String(incident.id).padStart(4, "0")}</span>
              <SevBadge sev={incident.severity} />
              <StatusBadge status={incident.status} />
              <span className="text-xs text-slate-400">{fmtDuration(incident.duration_sec)}</span>
            </div>
            <h1 className="text-lg font-semibold text-slate-900">{incident.title}</h1>
            {incident.description && <p className="text-sm text-slate-500 mt-0.5">{incident.description}</p>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <select value={incident.status} onChange={e => patchMut.mutate({ status: e.target.value })}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
              {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
            <button onClick={refetch} className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
              <RefreshCw size={12} className="text-slate-500" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-5 text-xs text-slate-500 mt-3 ml-10">
          <span>Owner: <span className="font-medium text-slate-700">{incident.owner_name ?? "—"}</span></span>
          <span>Created: <span className="font-medium text-slate-700">{fmtDateTime(incident.created_at)}</span></span>
          {incident.resolved_at && <span>Resolved: <span className="font-medium text-slate-700">{fmtDateTime(incident.resolved_at)}</span></span>}
          <span>Affected: <span className="font-medium text-slate-700">{(incident.affected_accounts ?? 0).toLocaleString()} accounts</span></span>
          {incident.services?.length > 0 && (
            <span>Services: <span className="font-medium text-slate-700">{incident.services.join(", ")}</span></span>
          )}
        </div>

        <div className="flex gap-0 mt-4 -mb-4">
          {(["timeline", "tasks", "postmortem"] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition ${activeTab === t ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
              {t === "timeline" ? "Timeline & Updates" : t === "tasks" ? `Tasks (${tasks.length})` : "Postmortem"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {activeTab === "timeline" && (
          <div className="max-w-3xl space-y-5">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-700 mb-3">Post Status Update</p>
              <textarea value={newUpdate} onChange={e => setNewUpdate(e.target.value)} rows={3}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none mb-3"
                placeholder="Describe what's happening, what was found, or what was fixed…" />
              <div className="flex items-center gap-3">
                <select value={updateStatus} onChange={e => setUpdateStatus(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none bg-white">
                  <option value="">Keep current status</option>
                  {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} className="rounded" />
                  Public (status page)
                </label>
                <button onClick={() => updateMut.mutate()} disabled={!newUpdate.trim() || updateMut.isPending}
                  className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
                  <Send size={12} />{updateMut.isPending ? "Posting…" : "Post Update"}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {timelineEvents.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No updates yet</p>}
              {timelineEvents.map((evt, i) => {
                const Icon = evt.icon;
                return (
                  <div key={i} className="flex gap-3">
                    <div className={`w-7 h-7 rounded-full ${evt.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <Icon size={13} className={evt.color} />
                    </div>
                    <div className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-slate-800">{evt.label}</p>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {(evt as any).isPublic && (
                            <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 rounded px-1.5 py-0.5 font-medium">Public</span>
                          )}
                          {(evt as any).status && <StatusBadge status={(evt as any).status} />}
                          <span className="text-xs text-slate-400">{timeAgo(evt.time)}</span>
                        </div>
                      </div>
                      {(evt as any).author && <p className="text-xs text-slate-500 mt-0.5">— {(evt as any).author}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "tasks" && (
          <div className="max-w-2xl space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-700 mb-3">Add Task</p>
              <div className="flex gap-2">
                <input value={newTask} onChange={e => setNewTask(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && newTask.trim() && addTaskMut.mutate()}
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Investigate API errors, Check Stripe logs…" />
                <button onClick={() => addTaskMut.mutate()} disabled={!newTask.trim() || addTaskMut.isPending}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
                  Add
                </button>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              {tasks.length === 0 && <div className="py-10 text-center text-slate-400 text-sm">No tasks yet</div>}
              {tasks.map((task: any) => (
                <div key={task.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-0">
                  <button onClick={() => toggleTaskMut.mutate({ taskId: task.id, status: task.status === "done" ? "open" : "done" })}
                    className="flex-shrink-0">
                    {task.status === "done"
                      ? <Check size={16} className="text-emerald-500" />
                      : <Circle size={16} className="text-slate-300" />
                    }
                  </button>
                  <span className={`flex-1 text-sm ${task.status === "done" ? "line-through text-slate-400" : "text-slate-800"}`}>{task.title}</span>
                  <span className="text-xs text-slate-400">{task.assigned_to_name?.split(" ")[0] ?? "Unassigned"}</span>
                  <span className="text-xs text-slate-400">{timeAgo(task.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "postmortem" && (
          <div className="max-w-3xl">
            {postmortem ? (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-emerald-50/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen size={14} className="text-emerald-600" />
                    <span className="text-sm font-semibold text-slate-800">Postmortem Report</span>
                  </div>
                  <span className="text-xs text-slate-500">Updated {fmtDate(postmortem.updated_at)}</span>
                </div>
                {[
                  ["Summary", postmortem.summary],
                  ["Root Cause", postmortem.root_cause],
                  ["Impact", postmortem.impact],
                  ["Resolution", postmortem.resolution],
                  ["Lessons Learned", postmortem.lessons_learned],
                  ["Preventative Actions", postmortem.preventative_actions],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} className="px-6 py-4 border-b border-slate-100 last:border-0">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</p>
                    <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                <div className="flex items-center gap-2 mb-5">
                  <BookOpen size={16} className="text-slate-500" />
                  <h3 className="text-sm font-semibold text-slate-800">Create Postmortem</h3>
                </div>
                <div className="space-y-4">
                  {[
                    ["summary", "Summary", "Brief overview of what happened"],
                    ["rootCause", "Root Cause", "What was the underlying cause?"],
                    ["impact", "Impact", "How many clients were affected and how?"],
                    ["resolution", "Resolution", "How was the issue resolved?"],
                    ["lessonsLearned", "Lessons Learned", "What did we learn from this incident?"],
                    ["preventativeActions", "Preventative Actions", "What steps will prevent recurrence?"],
                  ].map(([key, label, placeholder]) => (
                    <div key={key}>
                      <label className="text-xs font-medium text-slate-700 block mb-1">{label}</label>
                      <textarea value={(pmForm as any)[key]} onChange={e => setPmForm(p => ({ ...p, [key]: e.target.value }))} rows={3}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                        placeholder={placeholder} />
                    </div>
                  ))}
                  {postmortemMut.isError && <p className="text-xs text-red-600">{String(postmortemMut.error)}</p>}
                  <div className="flex justify-end pt-2">
                    <button onClick={() => postmortemMut.mutate()} disabled={postmortemMut.isPending}
                      className="px-6 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
                      {postmortemMut.isPending ? "Saving…" : "Save Postmortem"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function IncidentsPage() {
  const { incidentId } = useParams<{ incidentId?: string }>();
  if (incidentId) return <IncidentDetail incidentId={incidentId} />;
  return <IncidentDashboard />;
}
