import { useEffect, useRef, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useSelectedStore } from "@/hooks/use-store";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Mic,
  Phone,
  PhoneCall,
  Radio,
  RefreshCw,
  ShieldAlert,
  Wifi,
  WifiOff,
  Wrench,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HealthEvent {
  at: number;
  type: string;
  detail: string;
  layer?: string;
}

interface FailureRecord {
  at: number;
  category: string;
  detail: string;
  autoHealed: boolean;
}

interface LiveCall {
  callSid: string | null;
  storeId: number;
  callLogId: number | null;
  startedAt: number;
  endedAt: number | null;
  outcome: string | null;
  lastAiAudioAt: number;
  lastUserInputAt: number;
  lastActivityAt: number;
  responseStartedAt: number | null;
  lastResponseLatencyMs: number | null;
  recentResponseLatencies: number[];
  currentTool: string | null;
  toolStartedAt: number | null;
  toolSuccesses: number;
  toolFailures: number;
  recentToolLatencies: number[];
  silenceEvents: number;
  fillerInjections: number;
  autoHealEvents: number;
  lastHealAt: number | null;
  wsOpen: boolean;
  healthScore: number;
  riskLevel: "stable" | "degraded" | "high_risk" | "critical";
  recentEvents: HealthEvent[];
  recentFailures: FailureRecord[];
  durationSeconds: number;
}

interface LiveSnapshot {
  activeCalls: LiveCall[];
  totalActive: number;
  atRisk: number;
  critical: number;
  fetchedAt: string;
}

// ─── Health score UI helpers ──────────────────────────────────────────────────

const RISK_CONFIG = {
  stable:    { color: "bg-emerald-500", ring: "ring-emerald-300", label: "Stable",    icon: CheckCircle2, text: "text-emerald-700", bg: "bg-emerald-50" },
  degraded:  { color: "bg-yellow-400",  ring: "ring-yellow-300",  label: "Degraded",  icon: AlertTriangle, text: "text-yellow-700", bg: "bg-yellow-50" },
  high_risk: { color: "bg-orange-500",  ring: "ring-orange-300",  label: "High Risk", icon: ShieldAlert,  text: "text-orange-700", bg: "bg-orange-50" },
  critical:  { color: "bg-red-500",     ring: "ring-red-300",     label: "Critical",  icon: AlertTriangle, text: "text-red-700",    bg: "bg-red-50" },
} as const;

const EVENT_STYLE: Record<string, string> = {
  audio:          "text-emerald-600",
  user_input:     "text-blue-600",
  response_start: "text-purple-600",
  response_end:   "text-purple-700",
  tool_start:     "text-cyan-600",
  tool_end:       "text-cyan-700",
  tool_fail:      "text-red-600 font-medium",
  silence:        "text-orange-600 font-medium",
  filler:         "text-yellow-600",
  heal:           "text-emerald-600 font-semibold",
  ws_open:        "text-emerald-500",
  ws_close:       "text-red-500 font-medium",
  failure:        "text-red-600",
  call_end:       "text-gray-500",
};

function ts(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function elapsed(epochMs: number): string {
  const s = Math.floor((Date.now() - epochMs) / 1000);
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ${s % 60}s ago`;
}

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function avgLatency(arr: number[]): string {
  if (!arr.length) return "—";
  return `${Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)}ms`;
}

// ─── Score gauge ──────────────────────────────────────────────────────────────

function ScoreGauge({ score, riskLevel }: { score: number; riskLevel: keyof typeof RISK_CONFIG }) {
  const cfg = RISK_CONFIG[riskLevel];
  const pct = score;
  const circumference = 2 * Math.PI * 28;
  const dash = (pct / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center w-20 h-20">
      <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
        <circle cx="40" cy="40" r="28" fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle
          cx="40" cy="40" r="28" fill="none"
          stroke={riskLevel === "stable" ? "#10b981" : riskLevel === "degraded" ? "#facc15" : riskLevel === "high_risk" ? "#f97316" : "#ef4444"}
          strokeWidth="8"
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.5s ease" }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-xl font-bold leading-none">{score}</div>
        <div className="text-[10px] text-muted-foreground">/100</div>
      </div>
    </div>
  );
}

// ─── Single call card ─────────────────────────────────────────────────────────

function CallCard({ call }: { call: LiveCall }) {
  const cfg = RISK_CONFIG[call.riskLevel];
  const RiskIcon = cfg.icon;

  return (
    <Card className={cn("border-2 transition-colors", {
      "border-emerald-200": call.riskLevel === "stable",
      "border-yellow-300":  call.riskLevel === "degraded",
      "border-orange-400":  call.riskLevel === "high_risk",
      "border-red-500 shadow-red-100 shadow-md": call.riskLevel === "critical",
    })}>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-3">
          {/* Left: call identity */}
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0 animate-pulse", cfg.color)} />
            <div className="min-w-0">
              <div className="font-mono text-sm font-semibold truncate">
                {call.callSid ? call.callSid.slice(0, 18) + "…" : "Connecting…"}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                <Clock className="w-3 h-3" />
                {fmtDuration(call.durationSeconds)}
                {call.wsOpen
                  ? <span className="flex items-center gap-1 text-emerald-600"><Wifi className="w-3 h-3" />WS open</span>
                  : <span className="flex items-center gap-1 text-red-500"><WifiOff className="w-3 h-3" />WS closed</span>
                }
              </div>
            </div>
          </div>

          {/* Right: score gauge */}
          <div className="flex-shrink-0">
            <ScoreGauge score={call.healthScore} riskLevel={call.riskLevel} />
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-3">
        {/* Risk badge row */}
        <div className="flex flex-wrap gap-2">
          <Badge className={cn("text-xs gap-1", cfg.bg, cfg.text, "border-0")}>
            <RiskIcon className="w-3 h-3" />
            {cfg.label}
          </Badge>
          {call.silenceEvents > 0 && (
            <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
              {call.silenceEvents} silence event{call.silenceEvents !== 1 ? "s" : ""}
            </Badge>
          )}
          {call.fillerInjections > 0 && (
            <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-300">
              {call.fillerInjections} filler{call.fillerInjections !== 1 ? "s" : ""}
            </Badge>
          )}
          {call.autoHealEvents > 0 && (
            <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300">
              {call.autoHealEvents} auto-heal{call.autoHealEvents !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <Metric
            icon={<Zap className="w-3.5 h-3.5 text-purple-500" />}
            label="Avg response"
            value={avgLatency(call.recentResponseLatencies)}
            warn={call.lastResponseLatencyMs != null && call.lastResponseLatencyMs > 2500}
          />
          <Metric
            icon={<Wrench className="w-3.5 h-3.5 text-cyan-500" />}
            label="Tools"
            value={`${call.toolSuccesses}✓ ${call.toolFailures}✗`}
            warn={call.toolFailures > 0}
          />
          <Metric
            icon={<Mic className="w-3.5 h-3.5 text-blue-500" />}
            label="AI audio"
            value={elapsed(call.lastAiAudioAt)}
            warn={Date.now() - call.lastAiAudioAt > 3000}
          />
        </div>

        {/* Tool in progress */}
        {call.currentTool && (
          <div className="flex items-center gap-2 text-xs rounded-md bg-cyan-50 text-cyan-700 px-3 py-1.5 border border-cyan-200">
            <Wrench className="w-3.5 h-3.5 animate-spin" />
            Running: <span className="font-mono font-semibold">{call.currentTool}</span>
            {call.toolStartedAt && (
              <span className="ml-auto text-cyan-500">
                {Math.round((Date.now() - call.toolStartedAt) / 100) / 10}s
              </span>
            )}
          </div>
        )}

        {/* Event log */}
        {call.recentEvents.length > 0 && (
          <div className="rounded-md border border-gray-100 bg-gray-50 p-2 max-h-36 overflow-y-auto space-y-0.5">
            {[...call.recentEvents].reverse().map((e, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs leading-tight">
                <span className="text-gray-400 font-mono flex-shrink-0">{ts(e.at)}</span>
                <span className={cn("flex-1", EVENT_STYLE[e.type] ?? "text-gray-600")}>
                  {e.detail}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Recent failures */}
        {call.recentFailures.length > 0 && (
          <div className="space-y-1">
            {call.recentFailures.slice(-3).map((f, i) => (
              <div key={i} className={cn(
                "flex items-center gap-2 text-xs rounded px-2 py-1",
                f.autoHealed ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
              )}>
                {f.autoHealed
                  ? <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                  : <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                }
                <span className="flex-1 truncate">{f.detail}</span>
                <span className="flex-shrink-0 font-mono text-gray-400">{ts(f.at)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ icon, label, value, warn }: { icon: React.ReactNode; label: string; value: string; warn?: boolean }) {
  return (
    <div className={cn("rounded-md border p-1.5", warn ? "border-red-200 bg-red-50" : "border-gray-100 bg-white")}>
      <div className="flex items-center justify-center gap-1 mb-0.5">{icon}</div>
      <div className={cn("text-xs font-semibold", warn ? "text-red-700" : "text-gray-800")}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <PhoneCall className="w-7 h-7 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-800 mb-1">No active calls</h3>
      <p className="text-sm text-muted-foreground max-w-xs">
        The live dashboard will populate automatically when a call comes in. This page updates in real time.
      </p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AiReceptionistLive() {
  const { selectedStore } = useSelectedStore();
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [loading, setLoading]   = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSnapshot = async () => {
    if (!selectedStore?.id) return;
    try {
      const res = await fetch(`/api/ai-receptionist/live?storeId=${selectedStore.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: LiveSnapshot = await res.json();
      setSnapshot(data);
      setLastRefresh(new Date());
      setError(null);
    } catch (err: any) {
      setError(err.message ?? "Failed to fetch live data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSnapshot();
    // WS push: refetch immediately when a call ends; 5s fallback for live duration ticking
    const onCallUpdated = () => { void fetchSnapshot(); };
    window.addEventListener("ai-call-updated", onCallUpdated);
    intervalRef.current = setInterval(fetchSnapshot, 5_000);
    return () => {
      window.removeEventListener("ai-call-updated", onCallUpdated);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStore?.id]);

  const calls = snapshot?.activeCalls ?? [];

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Radio className="w-6 h-6 text-red-500 animate-pulse" />
              Live Call Monitor
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Real-time health scores, silence detection, and auto-heal events
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {lastRefresh && (
              <span className="flex items-center gap-1">
                <RefreshCw className="w-3.5 h-3.5" />
                {lastRefresh.toLocaleTimeString()}
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Auto-refresh on
            </div>
          </div>
        </div>

        {/* Stats bar */}
        {snapshot && (
          <div className="grid grid-cols-4 gap-3">
            <StatCard
              label="Active calls"
              value={snapshot.totalActive}
              icon={<Phone className="w-4 h-4 text-blue-500" />}
              color="blue"
            />
            <StatCard
              label="At risk"
              value={snapshot.atRisk}
              icon={<AlertTriangle className="w-4 h-4 text-yellow-500" />}
              color="yellow"
            />
            <StatCard
              label="Critical"
              value={snapshot.critical}
              icon={<ShieldAlert className="w-4 h-4 text-red-500" />}
              color="red"
            />
            <StatCard
              label="Stable"
              value={Math.max(0, snapshot.totalActive - snapshot.atRisk)}
              icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              color="green"
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Call cards */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Activity className="w-5 h-5 animate-pulse" />
            Loading live data…
          </div>
        ) : calls.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {calls.map((call) => (
              <CallCard key={call.callSid ?? call.startedAt} call={call} />
            ))}
          </div>
        )}

        {/* Legend */}
        <div className="border-t pt-4">
          <div className="text-xs text-muted-foreground mb-2 font-medium">Health Score Legend</div>
          <div className="flex flex-wrap gap-4 text-xs">
            {(["stable", "degraded", "high_risk", "critical"] as const).map((r) => {
              const cfg = RISK_CONFIG[r];
              return (
                <div key={r} className="flex items-center gap-1.5">
                  <div className={cn("w-2.5 h-2.5 rounded-full", cfg.color)} />
                  <span className="font-medium">{cfg.label}</span>
                  <span className="text-muted-foreground">
                    {r === "stable" ? "≥70" : r === "degraded" ? "50–69" : r === "high_risk" ? "30–49" : "<30"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function StatCard({ label, value, icon, color }: {
  label: string; value: number; icon: React.ReactNode;
  color: "blue" | "yellow" | "red" | "green";
}) {
  const colors = {
    blue:   "border-blue-100 bg-blue-50",
    yellow: "border-yellow-100 bg-yellow-50",
    red:    "border-red-100 bg-red-50",
    green:  "border-emerald-100 bg-emerald-50",
  };
  return (
    <div className={cn("rounded-xl border p-4 flex items-center gap-3", colors[color])}>
      <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm">
        {icon}
      </div>
      <div>
        <div className="text-2xl font-bold leading-none">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      </div>
    </div>
  );
}
