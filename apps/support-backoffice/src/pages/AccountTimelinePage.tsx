import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Activity, ChevronRight, AlertTriangle, DollarSign, Clock } from "lucide-react";
import { format } from "date-fns";
import { clsx } from "clsx";

const req = (path: string) => fetch(`/api/support${path}`, { credentials: "include" }).then(r => r.json());

export default function AccountTimelinePage() {
  const navigate = useNavigate();
  const [q, setQ]     = useState("");
  const [dq, setDq]   = useState("");
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (val: string) => {
    setQ(val);
    if (timer) clearTimeout(timer);
    setTimer(setTimeout(() => setDq(val), 300));
  };

  const { data, isLoading } = useQuery({
    queryKey: ["timeline-search", dq],
    queryFn: () => req(`/billing-search?q=${encodeURIComponent(dq)}&limit=40`),
    enabled: dq.length >= 1,
    staleTime: 30_000,
  });
  const accounts: any[] = data?.accounts ?? [];

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5 flex-shrink-0">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
            <Activity size={16} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900">Account Timeline & Event Stream</h1>
            <p className="text-xs text-slate-500">Everything that happened with any account, in order</p>
          </div>
        </div>
        <div className="mt-4 relative max-w-xl">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={q}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search accounts by name, email, ID…"
            autoFocus
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:border-indigo-400 focus:outline-none transition"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">⌘K</kbd>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : accounts.length > 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden max-w-3xl">
            {accounts.map((a, i) => {
              const name = a.name ?? "Unknown";
              const initials = name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
              return (
                <button
                  key={a.id}
                  onClick={() => navigate(`/isTeam/account-timeline/${a.id}`)}
                  className={clsx(
                    "w-full flex items-center gap-4 px-5 py-4 hover:bg-indigo-50 transition text-left group",
                    i > 0 && "border-t border-slate-50"
                  )}
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-black text-sm flex-shrink-0 shadow-sm">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-slate-900 group-hover:text-indigo-700 transition">{name}</p>
                      {a.failed_payments > 0 && (
                        <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5">
                          <AlertTriangle size={8} /> {a.failed_payments} failed
                        </span>
                      )}
                      {a.overdue_cents > 0 && (
                        <span className="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-bold">
                          ${(a.overdue_cents/100).toFixed(2)} overdue
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">
                      {a.account_id ?? `ACC-${String(a.id).padStart(5,"0")}`} · {a.owner_email}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-semibold text-slate-700">{a.plan_name ?? "No plan"}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{a.account_status ?? "Unknown"}</p>
                  </div>
                  <ChevronRight size={14} className="text-slate-300 group-hover:text-indigo-500 transition flex-shrink-0" />
                </button>
              );
            })}
          </div>
        ) : dq.length >= 1 ? (
          <div className="text-center py-16">
            <Search size={32} className="mx-auto mb-3 text-slate-200" />
            <p className="text-slate-500 font-medium">No accounts found</p>
            <p className="text-xs text-slate-400 mt-1">Try a different name, email or account ID</p>
          </div>
        ) : (
          <div className="text-center py-20 max-w-md mx-auto">
            <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Activity size={28} className="text-indigo-500" />
            </div>
            <h2 className="text-base font-bold text-slate-700 mb-2">Account Timeline & Event Stream</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Search for any account to view a complete chronological feed of payments, subscriptions, support tickets, admin actions, and more — all in one place.
            </p>
            <div className="mt-6 grid grid-cols-3 gap-3 text-left">
              {[
                { icon: <DollarSign size={14} className="text-emerald-500" />, label: "Payments", desc: "Stripe charges, refunds, disputes" },
                { icon: <Activity size={14} className="text-indigo-500" />,    label: "Events",   desc: "All account events in order" },
                { icon: <Clock size={14} className="text-amber-500" />,        label: "History",  desc: "Full audit trail & timeline" },
              ].map(item => (
                <div key={item.label} className="bg-white border border-slate-200 rounded-xl p-3">
                  <div className="mb-1">{item.icon}</div>
                  <p className="text-xs font-bold text-slate-700">{item.label}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
