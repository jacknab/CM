import { Calendar, Users, Clock, TrendingUp, CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function ProductBookingPage() {
  const { data: stats } = useQuery({
    queryKey: ["support-dashboard-stats"],
    queryFn: () => api.dashboard.stats(),
    staleTime: 60_000,
  });

  const kpis = [
    { label: "Appointments This Month", value: stats?.appointmentsThisMonth ?? "—", icon: <Calendar size={16} className="text-indigo-500" />, bg: "bg-indigo-50" },
    { label: "Active Accounts", value: stats?.activeAccounts ?? "—", icon: <CheckCircle2 size={16} className="text-emerald-500" />, bg: "bg-emerald-50" },
    { label: "Avg. Booking Rate", value: "94%", icon: <TrendingUp size={16} className="text-violet-500" />, bg: "bg-violet-50" },
    { label: "Avg. Lead Time", value: "3.2 days", icon: <Clock size={16} className="text-amber-500" />, bg: "bg-amber-50" },
  ];

  const modules = [
    { name: "Calendar & Scheduling", status: "active", desc: "Online calendar, multi-staff booking, and service management", accounts: stats?.activeAccounts ?? 0 },
    { name: "Online Booking Page", status: "active", desc: "Public-facing booking page for walk-in and online bookings", accounts: 0 },
    { name: "Waitlist", status: "active", desc: "Automatic waitlist when slots fill up", accounts: 0 },
    { name: "Digital Check-in Queue", status: "active", desc: "Walk-in queue management and self-check-in kiosk mode", accounts: 0 },
  ];

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-slate-50">
      <div className="p-6 max-w-5xl">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Booking System</h1>
            <p className="text-slate-500 text-sm mt-1">Platform-wide booking activity and module status</p>
          </div>
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-xs font-semibold text-emerald-700">All Systems Online</span>
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

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Booking Modules</h2>
          {modules.map(m => (
            <div key={m.name} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-slate-700">{m.name}</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{m.status}</span>
                </div>
                <p className="text-xs text-slate-400">{m.desc}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-bold text-slate-700">{m.accounts}</div>
                <div className="text-[10px] text-slate-400">accounts</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
