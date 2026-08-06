import { useQuery } from "@tanstack/react-query";
import { Calendar, MessageSquare, Phone, CreditCard, Activity, DollarSign } from "lucide-react";
import type { ActivityEvent } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

const icons: Record<string, React.ReactNode> = {
  appointment: <Calendar size={13} className="text-indigo-500" />,
  sms:         <MessageSquare size={13} className="text-violet-500" />,
  ai_receptionist: <Phone size={13} className="text-sky-500" />,
  billing:     <DollarSign size={13} className="text-emerald-500" />,
  support:     <Activity size={13} className="text-amber-500" />,
};

const iconBg: Record<string, string> = {
  appointment:     "bg-indigo-100",
  sms:             "bg-violet-100",
  ai_receptionist: "bg-sky-100",
  billing:         "bg-emerald-100",
  support:         "bg-amber-100",
};

export default function ActivityFeedCard({ accountId, limit = 15 }: { accountId: number; limit?: number; full?: boolean }) {
  const { data, isLoading } = useQuery<{ events: ActivityEvent[] }>({
    queryKey: ["support-activity-v2", accountId, "7d", "all", "", ""],
    queryFn: async () => {
      const res = await fetch(`/api/support/accounts/${accountId}/activity?range=7d&category=all&limit=${limit}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30_000,
  });

  const events = data?.events ?? [];

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Recent Activity</h3>
        <span className="text-[10px] text-slate-400">{events.length} events</span>
      </div>

      <div className="overflow-y-auto scrollbar-thin max-h-[240px]">
        {isLoading ? (
          <div className="p-6 flex justify-center">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : events.length === 0 ? (
          <div className="p-6 text-center">
            <Activity size={24} className="text-slate-200 mx-auto mb-2" />
            <p className="text-xs text-slate-400">No recent activity</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {events.map((e, i) => (
              <div key={e.id ?? i} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition">
                <div className={`w-6 h-6 rounded-full ${iconBg[e.category] ?? "bg-slate-100"} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  {icons[e.category] ?? <Activity size={13} className="text-slate-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-700 leading-snug">{e.title}</p>
                  {e.subtitle && <p className="text-[10px] text-slate-400 mt-0.5">{e.subtitle}</p>}
                </div>
                <span className="text-[10px] text-slate-400 flex-shrink-0 mt-0.5">
                  {formatDistanceToNow(new Date(e.occurred_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
