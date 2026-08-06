import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CreditCard, ChevronRight, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";

const STATUS_STYLE: Record<string, string> = {
  active:   "bg-emerald-100 text-emerald-700",
  trialing: "bg-blue-100 text-blue-700",
  past_due: "bg-red-100 text-red-700",
  canceled: "bg-slate-100 text-slate-500",
  paused:   "bg-amber-100 text-amber-700",
};

export default function SubscriptionsPage() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["support-subscriptions"],
    queryFn: () => api.subscriptions.list(),
    staleTime: 60_000,
  });

  const subs = data ?? [];
  const totalMrr = subs.reduce((s: number, r: any) => s + (r.priceMonthlyCents ?? 0), 0);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-slate-50">
      <div className="p-6 max-w-6xl">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Subscriptions</h1>
            <p className="text-slate-500 text-sm mt-1">All active and trial subscriptions across the platform</p>
          </div>
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-4 py-2.5">
            <TrendingUp size={14} className="text-emerald-500" />
            <span className="text-sm font-semibold text-slate-700">
              ${(totalMrr / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })} MRR
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-3 text-slate-500 text-sm py-10">
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            Loading subscriptions…
          </div>
        ) : subs.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
            <CreditCard size={32} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">No subscriptions found</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Account</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Plan</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">MRR</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Renewal</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {subs.map((s: any) => (
                  <tr
                    key={s.id}
                    onClick={() => navigate(`/accounts/${s.storeId}`)}
                    className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition group"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">{s.storeName}</td>
                    <td className="px-4 py-3 text-slate-600">{s.planName}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      ${((s.priceMonthlyCents ?? 0) / 100).toFixed(0)}/mo
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_STYLE[s.status] ?? "bg-slate-100 text-slate-500"}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ChevronRight size={14} className="text-slate-300 group-hover:text-indigo-500 transition" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
