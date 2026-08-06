import { Wifi, WifiOff, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { AccountOverview } from "@/lib/api";

const serviceLabels: Record<string, string> = {
  booking: "Booking System",
  sms: "SMS Notifications",
  email: "Email Notifications",
  ai: "AI Receptionist",
  google: "Google Business",
  website: "Website",
  domain: "Domain & SSL",
};

const statusConfig: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  online:             { label: "Online",          color: "text-emerald-700", bg: "bg-emerald-50",  dot: "bg-emerald-500" },
  connected:          { label: "Connected",        color: "text-emerald-700", bg: "bg-emerald-50",  dot: "bg-emerald-500" },
  secure:             { label: "Secure",           color: "text-emerald-700", bg: "bg-emerald-50",  dot: "bg-emerald-500" },
  no_recent_activity: { label: "No Recent Use",    color: "text-amber-700",   bg: "bg-amber-50",    dot: "bg-amber-400" },
  not_configured:     { label: "Not Configured",   color: "text-slate-600",   bg: "bg-slate-50",    dot: "bg-slate-300" },
  disconnected:       { label: "Disconnected",     color: "text-red-700",     bg: "bg-red-50",      dot: "bg-red-500" },
  offline:            { label: "Offline",          color: "text-red-700",     bg: "bg-red-50",      dot: "bg-red-500" },
  unknown:            { label: "Unknown",          color: "text-slate-500",   bg: "bg-slate-50",    dot: "bg-slate-300" },
};

export default function HealthStatusCard({ health }: { health: AccountOverview["health"] }) {
  const services = Object.entries(health);
  const onlineCount = services.filter(([, v]) => v === "online" || v === "connected" || v === "secure").length;
  const total = services.length;
  const score = Math.round((onlineCount / total) * 100);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Service Health</h3>
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-amber-400" : "bg-red-500"}`} />
          <span className={`text-xs font-semibold ${score >= 80 ? "text-emerald-600" : score >= 50 ? "text-amber-600" : "text-red-600"}`}>
            {score}%
          </span>
        </div>
      </div>

      <div className="p-4">
        {/* Score bar */}
        <div className="mb-4">
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-amber-400" : "bg-red-500"}`}
              style={{ width: `${score}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-1.5">{onlineCount} of {total} services healthy</p>
        </div>

        {/* Services grid */}
        <div className="space-y-1.5">
          {services.map(([key, status]) => {
            const cfg = statusConfig[status] ?? statusConfig.unknown;
            return (
              <div key={key} className={`flex items-center justify-between px-3 py-2 rounded-lg ${cfg.bg}`}>
                <span className="text-xs text-slate-700 font-medium">{serviceLabels[key] ?? key}</span>
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                  <span className={`text-[11px] font-medium ${cfg.color}`}>{cfg.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
