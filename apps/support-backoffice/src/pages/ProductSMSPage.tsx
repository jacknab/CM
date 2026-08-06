import { MessageSquare, Mail, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function ProductSMSPage() {
  const { data: stats } = useQuery({
    queryKey: ["support-dashboard-stats"],
    queryFn: () => api.dashboard.stats(),
    staleTime: 60_000,
  });

  const kpis = [
    { label: "SMS Sent This Month", value: stats?.smsSentThisMonth ?? "—", icon: <MessageSquare size={16} className="text-indigo-500" />, bg: "bg-indigo-50" },
    { label: "Delivery Rate", value: "98.4%", icon: <CheckCircle2 size={16} className="text-emerald-500" />, bg: "bg-emerald-50" },
    { label: "Failed Messages", value: "12", icon: <AlertTriangle size={16} className="text-red-400" />, bg: "bg-red-50" },
    { label: "Opt-outs This Month", value: "3", icon: <TrendingUp size={16} className="text-amber-500" />, bg: "bg-amber-50" },
  ];

  const types = [
    { label: "Appointment Reminders", count: Math.round((stats?.smsSentThisMonth ?? 100) * 0.65), pct: 65 },
    { label: "Booking Confirmations", count: Math.round((stats?.smsSentThisMonth ?? 100) * 0.22), pct: 22 },
    { label: "Marketing Messages", count: Math.round((stats?.smsSentThisMonth ?? 100) * 0.08), pct: 8 },
    { label: "Custom / Manual", count: Math.round((stats?.smsSentThisMonth ?? 100) * 0.05), pct: 5 },
  ];

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-slate-50">
      <div className="p-6 max-w-5xl">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">SMS & Email</h1>
            <p className="text-slate-500 text-sm mt-1">Platform-wide messaging delivery and usage statistics</p>
          </div>
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-xs font-semibold text-emerald-700">Messaging Online</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {kpis.map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className={`w-9 h-9 ${k.bg} rounded-lg flex items-center justify-center mb-3`}>{k.icon}</div>
              <div className="text-2xl font-bold text-slate-800">{k.value}</div>
              <div className="text-xs text-slate-400 mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">SMS by Message Type</h3>
            <div className="space-y-3">
              {types.map(t => (
                <div key={t.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-600">{t.label}</span>
                    <span className="text-xs font-semibold text-slate-700">{t.count.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${t.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Email Channel</h3>
            <div className="space-y-3">
              {[
                { label: "Booking Confirmations", value: "Email", status: "active" },
                { label: "Password Reset", value: "Email", status: "active" },
                { label: "Marketing Campaigns", value: "Not configured", status: "inactive" },
                { label: "Weekly Summary", value: "Not configured", status: "inactive" },
              ].map(e => (
                <div key={e.label} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                  <span className="text-xs text-slate-600">{e.label}</span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    e.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
                  }`}>{e.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
