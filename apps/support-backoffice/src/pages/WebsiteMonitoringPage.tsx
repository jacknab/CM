import { useQuery } from "@tanstack/react-query";
import { Monitor, CheckCircle2, AlertCircle, XCircle, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

type ServiceHealth = { name: string; status: string; latencyMs?: number; message?: string };

const STATUS_META: Record<string, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
  healthy:       { icon: <CheckCircle2 size={15} />, label: "Online",       color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100" },
  operational:   { icon: <CheckCircle2 size={15} />, label: "Operational",  color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100" },
  degraded:      { icon: <AlertCircle size={15} />,  label: "Degraded",     color: "text-amber-600",   bg: "bg-amber-50 border-amber-100" },
  unavailable:   { icon: <XCircle size={15} />,      label: "Unavailable",  color: "text-red-600",     bg: "bg-red-50 border-red-100" },
  not_configured:{ icon: <AlertCircle size={15} />,  label: "Not Configured",color:"text-slate-400",   bg: "bg-slate-50 border-slate-200" },
};

export default function WebsiteMonitoringPage() {
  const qc = useQueryClient();

  const { data: health = [], isLoading } = useQuery<ServiceHealth[]>({
    queryKey: ["support-service-health"],
    queryFn: () => api.dashboard.serviceHealth(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const allHealthy = health.every(h => h.status === "healthy" || h.status === "operational");
  const issueCount = health.filter(h => h.status !== "healthy" && h.status !== "operational" && h.status !== "not_configured").length;

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-slate-50">
      <div className="p-6 max-w-4xl">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Website Status</h1>
            <p className="text-slate-500 text-sm mt-1">Real-time status of all platform services and integrations</p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-2 border rounded-lg px-3 py-2 ${allHealthy ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
              <div className={`w-2 h-2 rounded-full animate-pulse ${allHealthy ? "bg-emerald-500" : "bg-amber-500"}`} />
              <span className={`text-xs font-semibold ${allHealthy ? "text-emerald-700" : "text-amber-700"}`}>
                {allHealthy ? "All Systems Operational" : `${issueCount} Issue${issueCount !== 1 ? "s" : ""} Detected`}
              </span>
            </div>
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ["support-service-health"] })}
              className="p-2 border border-slate-200 hover:bg-white rounded-lg text-slate-500 hover:text-slate-700 transition"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-3 text-slate-500 text-sm py-10">
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            Checking service status…
          </div>
        ) : health.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <Monitor size={28} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500 text-sm">No health data available</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {health.map((s: ServiceHealth) => {
              const meta = STATUS_META[s.status] ?? STATUS_META["not_configured"];
              return (
                <div key={s.name} className={`bg-white rounded-xl border p-4 flex items-center gap-4 ${meta.bg}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${meta.color} bg-white/80`}>
                    {meta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-700">{s.name}</span>
                      <span className={`text-[10px] font-semibold ${meta.color}`}>{meta.label}</span>
                    </div>
                    {s.latencyMs !== undefined && (
                      <div className="text-xs text-slate-400 mt-0.5">{s.latencyMs}ms response time</div>
                    )}
                    {s.message && (
                      <div className="text-xs text-slate-500 mt-0.5">{s.message}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
