import { Calendar, MessageSquare, Phone, Users } from "lucide-react";
import type { AccountOverview } from "@/lib/api";

export default function QuickStatsCard({ stats }: { stats: AccountOverview["stats"] }) {
  const cards = [
    {
      label: "Appointments",
      sublabel: "This Month",
      value: stats.appointmentsThisMonth,
      icon: <Calendar size={16} className="text-indigo-500" />,
      bg: "bg-indigo-50",
    },
    {
      label: "SMS Sent",
      sublabel: "This Month",
      value: stats.smsSentThisMonth,
      icon: <MessageSquare size={16} className="text-violet-500" />,
      bg: "bg-violet-50",
    },
    {
      label: "AI Calls",
      sublabel: "This Month",
      value: stats.aiCallsThisMonth,
      icon: <Phone size={16} className="text-sky-500" />,
      bg: "bg-sky-50",
    },
    {
      label: "Active Staff",
      sublabel: "Total",
      value: stats.staffCount,
      icon: <Users size={16} className="text-teal-500" />,
      bg: "bg-teal-50",
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-700">Quick Stats</h3>
      </div>
      <div className="p-4 grid grid-cols-2 gap-3">
        {cards.map(c => (
          <div key={c.label} className={`${c.bg} rounded-xl p-3`}>
            <div className="flex items-center justify-between mb-1.5">
              {c.icon}
              <span className="text-[10px] text-slate-500">{c.sublabel}</span>
            </div>
            <div className="text-2xl font-bold text-slate-800">{c.value.toLocaleString()}</div>
            <div className="text-xs text-slate-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
