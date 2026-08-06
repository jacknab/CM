import { useQuery } from "@tanstack/react-query";
import { BarChart2, Users, Ticket, TrendingUp, DollarSign, Clock, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { useNavigate } from "react-router-dom";

export default function ReportsPage() {
  const navigate = useNavigate();

  const { data: stats } = useQuery({
    queryKey: ["support-dashboard-stats"],
    queryFn: () => api.dashboard.stats(),
    staleTime: 60_000,
  });

  const summaryMetrics = [
    { label: "Total Accounts", value: (stats?.totalAccounts ?? 0).toLocaleString(), icon: <Users size={16} className="text-indigo-500" />, bg: "bg-indigo-50" },
    { label: "Open Tickets", value: (stats?.openTickets ?? 0).toLocaleString(), icon: <Ticket size={16} className="text-rose-500" />, bg: "bg-rose-50" },
    { label: "MRR", value: `$${((stats?.mrr ?? 0) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`, icon: <DollarSign size={16} className="text-emerald-500" />, bg: "bg-emerald-50" },
    { label: "Active Trials", value: (stats?.trialAccounts ?? 0).toLocaleString(), icon: <Clock size={16} className="text-amber-500" />, bg: "bg-amber-50" },
  ];

  const reportLinks = [
    {
      title: "Subscription Report",
      desc: "MRR breakdown, plan distribution, churn, and trial conversion rates",
      icon: <DollarSign size={18} className="text-emerald-500" />,
      href: "/billing/subscriptions",
    },
    {
      title: "Support Performance",
      desc: "Ticket volume, first response time, resolution rate, and agent SLAs",
      icon: <Ticket size={18} className="text-indigo-500" />,
      href: "/tickets",
    },
    {
      title: "AI Receptionist Usage",
      desc: "Call volumes, booking creation rate, minutes used, and cost per account",
      icon: <TrendingUp size={18} className="text-violet-500" />,
      href: "/products/ai",
    },
    {
      title: "Account Health",
      desc: "Service health scores, at-risk accounts, and recent activity trends",
      icon: <BarChart2 size={18} className="text-sky-500" />,
      href: "/accounts",
    },
    {
      title: "SMS & Messaging",
      desc: "Messages sent, delivery rates, opt-outs, and quota utilisation",
      icon: <Users size={18} className="text-rose-500" />,
      href: "/products/sms",
    },
    {
      title: "Service Uptime",
      desc: "Uptime percentages, incident history, and SLA compliance",
      icon: <Clock size={18} className="text-amber-500" />,
      href: "/monitoring/website",
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-slate-50">
      <div className="p-6 max-w-5xl">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-800">Reports</h1>
          <p className="text-slate-500 text-sm mt-1">Platform-wide analytics and performance summaries</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {summaryMetrics.map(m => (
            <div key={m.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className={`w-9 h-9 ${m.bg} rounded-lg flex items-center justify-center mb-3`}>{m.icon}</div>
              <div className="text-2xl font-bold text-slate-800">{m.value}</div>
              <div className="text-xs text-slate-400 mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>

        <h2 className="text-sm font-semibold text-slate-700 mb-4">Report Sections</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reportLinks.map(r => (
            <button
              key={r.title}
              onClick={() => navigate(r.href)}
              className="bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md p-4 flex items-start gap-3 text-left transition group"
            >
              <div className="w-10 h-10 bg-slate-50 group-hover:bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0 transition">
                {r.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-700 mb-0.5">{r.title}</div>
                <p className="text-xs text-slate-400 leading-relaxed">{r.desc}</p>
              </div>
              <ArrowRight size={14} className="text-slate-300 group-hover:text-indigo-500 transition mt-1 flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
