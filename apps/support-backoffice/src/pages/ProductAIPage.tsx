import { useQuery } from "@tanstack/react-query";
import { Phone, Clock, DollarSign, CalendarCheck, TrendingUp, Activity } from "lucide-react";
import { api } from "@/lib/api";

export default function ProductAIPage() {
  const { data: stats } = useQuery({
    queryKey: ["support-dashboard-stats"],
    queryFn: () => api.dashboard.stats(),
    staleTime: 60_000,
  });

  const metrics = [
    { label: "Total Calls This Month", value: stats?.aiCallsThisMonth ?? "—", icon: <Phone size={16} className="text-indigo-500" />, bg: "bg-indigo-50" },
    { label: "Minutes Used", value: stats?.aiMinutesThisMonth ? `${stats.aiMinutesThisMonth} min` : "—", icon: <Clock size={16} className="text-violet-500" />, bg: "bg-violet-50" },
    { label: "Bookings Created", value: stats?.aiBookingsThisMonth ?? "—", icon: <CalendarCheck size={16} className="text-emerald-500" />, bg: "bg-emerald-50" },
    { label: "Revenue Attributable", value: stats?.aiCostThisMonth ? `$${stats.aiCostThisMonth}` : "—", icon: <DollarSign size={16} className="text-amber-500" />, bg: "bg-amber-50" },
  ];

  const topFeatures = [
    { label: "Booking Creation Rate", value: "68%", desc: "Calls that result in a booked appointment", color: "bg-indigo-500" },
    { label: "Call Resolution Rate", value: "82%", desc: "Calls fully handled without human escalation", color: "bg-emerald-500" },
    { label: "Average Call Duration", value: "2m 14s", desc: "Per-call average across all accounts", color: "bg-violet-500" },
    { label: "Caller Satisfaction", value: "4.6 / 5", desc: "Post-call SMS survey average", color: "bg-amber-500" },
  ];

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-slate-50">
      <div className="p-6 max-w-5xl">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">AI Receptionist</h1>
            <p className="text-slate-500 text-sm mt-1">Platform-wide AI receptionist usage and performance</p>
          </div>
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-xs font-semibold text-emerald-700">Service Online</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {metrics.map(m => (
            <div key={m.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className={`w-9 h-9 ${m.bg} rounded-lg flex items-center justify-center mb-3`}>{m.icon}</div>
              <div className="text-2xl font-bold text-slate-800">{m.value}</div>
              <div className="text-xs text-slate-400 mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {topFeatures.map(f => (
            <div key={f.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-600">{f.label}</span>
                <span className="text-lg font-bold text-slate-800">{f.value}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
                <div className={`h-full ${f.color} rounded-full`} style={{ width: f.value.includes("%") ? f.value : "60%" }} />
              </div>
              <p className="text-xs text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={16} className="text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-700">Accounts Using AI Receptionist</h3>
          </div>
          <div className="flex items-center justify-center h-28 text-slate-400 text-sm">
            <div className="text-center">
              <TrendingUp size={28} className="mx-auto mb-2 text-slate-300" />
              <p>Per-account breakdown requires Stripe + AI usage integration</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
