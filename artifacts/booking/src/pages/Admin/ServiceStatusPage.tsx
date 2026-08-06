import { useState, useEffect, useRef, useCallback } from "react";
import {
  CheckCircle2, AlertTriangle, XCircle, HelpCircle,
  Wifi, WifiOff, Database, MessageSquare, CreditCard,
  Server, Globe, Bot, Activity, Clock,
} from "lucide-react";

type ServiceStatus = "ok" | "warning" | "error" | "unconfigured";

interface HistoryEntry {
  status: ServiceStatus;
  latency?: number;
  checkedAt: string;
}

interface ServiceCheckResult {
  service: string;
  category: string;
  status: ServiceStatus;
  latency?: number;
  detail: string;
  history: HistoryEntry[];
  uptimePct: number;
}

interface StatusPayload {
  type: "status_update";
  checkedAt: string;
  serverUptime: number;
  summary: { ok: number; warning: number; error: number; unconfigured: number; total: number };
  services: ServiceCheckResult[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES_ORDER = ["Infrastructure", "Platform", "Payments", "Messaging", "AI", "Network"];

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Infrastructure: <Server size={15} />,
  Platform:       <Globe size={15} />,
  Payments:       <CreditCard size={15} />,
  Messaging:      <MessageSquare size={15} />,
  AI:             <Bot size={15} />,
  Network:        <Wifi size={15} />,
};

const STATUS_DOT: Record<ServiceStatus, string> = {
  ok:           "bg-green-500",
  warning:      "bg-amber-400",
  error:        "bg-red-500",
  unconfigured: "bg-gray-300",
};

const STATUS_BAR: Record<ServiceStatus, string> = {
  ok:           "bg-green-400",
  warning:      "bg-amber-400",
  error:        "bg-red-400",
  unconfigured: "bg-gray-200",
};

const STATUS_LABEL: Record<ServiceStatus, string> = {
  ok:           "Operational",
  warning:      "Degraded",
  error:        "Outage",
  unconfigured: "Not configured",
};

const STATUS_TEXT: Record<ServiceStatus, string> = {
  ok:           "text-green-700",
  warning:      "text-amber-700",
  error:        "text-red-700",
  unconfigured: "text-gray-500",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function overallHealth(summary: StatusPayload["summary"]) {
  if (summary.error > 0)   return { label: "Partial Outage",        color: "text-red-700",   bg: "bg-red-50",   border: "border-red-200",   dot: "bg-red-500 animate-pulse" };
  if (summary.warning > 0) return { label: "Performance Degraded",  color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-400 animate-pulse" };
  return                          { label: "All Systems Operational",color: "text-green-700", bg: "bg-green-50", border: "border-green-200", dot: "bg-green-500" };
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function latencyColor(ms?: number): string {
  if (ms === undefined) return "text-gray-300";
  if (ms < 100)  return "text-green-600";
  if (ms < 500)  return "text-amber-600";
  return "text-orange-500";
}

function ago(iso: string): string {
  const sec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 5)  return "just now";
  if (sec < 60) return `${sec}s ago`;
  return `${Math.floor(sec / 60)}m ago`;
}

// ─── History bar component ────────────────────────────────────────────────────

function HistoryBar({ history }: { history: HistoryEntry[] }) {
  const SLOTS = 60;
  const padded: (HistoryEntry | null)[] = Array(Math.max(0, SLOTS - history.length))
    .fill(null)
    .concat(history.slice(-SLOTS));

  return (
    <div className="flex items-end gap-px" title={`${history.length} checks recorded`}>
      {padded.map((entry, i) => (
        <div
          key={i}
          className={`w-1.5 h-8 rounded-sm transition-colors ${entry ? STATUS_BAR[entry.status] : "bg-gray-100"}`}
          title={entry ? `${entry.checkedAt ? new Date(entry.checkedAt).toLocaleTimeString() : ""} — ${STATUS_LABEL[entry.status]}${entry.latency !== undefined ? ` (${entry.latency}ms)` : ""}` : "No data"}
        />
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ServiceStatusPage() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [serverUptime, setServerUptime] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/admin-status`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      const ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
      }, 20_000);
      ws.addEventListener("close", () => clearInterval(ping));
    };

    ws.onmessage = (evt) => {
      try {
        const msg: StatusPayload = JSON.parse(evt.data);
        if (msg.type === "status_update") {
          setData(msg);
          setLastUpdated(msg.checkedAt);
          setServerUptime(msg.serverUptime);
        }
      } catch {}
    };

    ws.onclose = () => {
      setConnected(false);
      reconnectRef.current = setTimeout(connect, 5_000);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [connect]);

  // Tick server uptime every second when connected
  useEffect(() => {
    timerRef.current = setInterval(() => {
      if (connected) setServerUptime((u) => u + 1);
    }, 1_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [connected]);

  const grouped = data
    ? CATEGORIES_ORDER.reduce<Record<string, ServiceCheckResult[]>>((acc, cat) => {
        const svcs = data.services.filter((s) => s.category === cat);
        if (svcs.length) acc[cat] = svcs;
        return acc;
      }, {})
    : {};

  const health = data ? overallHealth(data.summary) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-10">

        {/* ── Page header ───────────────────────────────────────────────────── */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Certxa Platform Status</h1>
            <div className="flex items-center gap-2 text-xs font-medium">
              {connected ? (
                <span className="flex items-center gap-1.5 text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  Live
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-gray-500 bg-gray-100 border border-gray-200 rounded-full px-3 py-1">
                  <WifiOff size={11} />
                  Connecting…
                </span>
              )}
            </div>
          </div>
          <p className="text-sm text-gray-500">
            Real-time health monitoring for all Certxa platform services and third-party integrations.
          </p>
        </div>

        {/* ── Hero status banner ────────────────────────────────────────────── */}
        {health && data ? (
          <div className={`rounded-2xl border ${health.bg} ${health.border} px-6 py-5 mb-8`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className={`w-3.5 h-3.5 rounded-full shrink-0 mt-0.5 ${health.dot}`} />
                <div>
                  <p className={`text-xl font-bold ${health.color}`}>{health.label}</p>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {lastUpdated ? `Updated ${ago(lastUpdated)}` : "Checking…"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6 text-sm text-right">
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Services</span>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-green-700 font-semibold">
                      <CheckCircle2 size={13} />
                      {data.summary.ok} up
                    </span>
                    {data.summary.warning > 0 && (
                      <span className="flex items-center gap-1 text-amber-700 font-semibold">
                        <AlertTriangle size={13} />
                        {data.summary.warning} degraded
                      </span>
                    )}
                    {data.summary.error > 0 && (
                      <span className="flex items-center gap-1 text-red-700 font-semibold">
                        <XCircle size={13} />
                        {data.summary.error} down
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5 border-l border-current/20 pl-6">
                  <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Server Uptime</span>
                  <span className="font-semibold text-gray-700 font-mono text-sm">{formatUptime(serverUptime)}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white px-6 py-5 mb-8 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-3.5 h-3.5 rounded-full bg-gray-200" />
              <div>
                <div className="h-5 w-48 bg-gray-200 rounded mb-2" />
                <div className="h-3 w-24 bg-gray-100 rounded" />
              </div>
            </div>
          </div>
        )}

        {/* ── Service groups ────────────────────────────────────────────────── */}
        {data ? (
          <div className="space-y-3">
            {Object.entries(grouped).map(([category, services]) => (
              <div key={category} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                {/* Category header */}
                <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
                  <span className="text-gray-400">{CATEGORY_ICONS[category] ?? <Server size={15} />}</span>
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{category}</h2>
                </div>

                {/* Service rows */}
                <div className="divide-y divide-gray-50">
                  {services.map((svc) => (
                    <div key={svc.service} className="px-5 py-4">
                      {/* Top row: name | status */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[svc.status]}`} />
                          <span className="text-sm font-semibold text-gray-800">{svc.service}</span>
                          <span className={`text-xs font-medium ${STATUS_TEXT[svc.status]}`}>
                            {STATUS_LABEL[svc.status]}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          {svc.latency !== undefined && (
                            <span className={`font-mono font-medium ${latencyColor(svc.latency)}`}>
                              {svc.latency}ms
                            </span>
                          )}
                          <span className={`font-semibold tabular-nums ${svc.uptimePct >= 99 ? "text-green-700" : svc.uptimePct >= 95 ? "text-amber-700" : "text-red-700"}`}>
                            {svc.uptimePct.toFixed(1)}% uptime
                          </span>
                        </div>
                      </div>

                      {/* History bar */}
                      <HistoryBar history={svc.history} />

                      {/* Detail */}
                      <p className="text-xs text-gray-400 mt-2 truncate" title={svc.detail}>{svc.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {[4, 2, 1, 2, 1, 1].map((count, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-200 overflow-hidden animate-pulse">
                <div className="px-5 py-3 border-b border-gray-100">
                  <div className="h-3 w-24 bg-gray-200 rounded" />
                </div>
                {Array.from({ length: count }).map((_, j) => (
                  <div key={j} className="px-5 py-4 border-t border-gray-50 first:border-0">
                    <div className="flex items-center justify-between mb-3">
                      <div className="h-4 w-32 bg-gray-100 rounded" />
                      <div className="h-3 w-16 bg-gray-100 rounded" />
                    </div>
                    <div className="flex gap-px">
                      {Array.from({ length: 60 }).map((_, k) => (
                        <div key={k} className="w-1.5 h-8 bg-gray-100 rounded-sm" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <div className="mt-8 flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-4">
            {(["ok", "warning", "error", "unconfigured"] as ServiceStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${STATUS_DOT[s]}`} />
                {STATUS_LABEL[s]}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Activity size={11} />
            <span>Checks run every 30 seconds · History shows last 60 checks</span>
          </div>
        </div>
      </div>
    </div>
  );
}
