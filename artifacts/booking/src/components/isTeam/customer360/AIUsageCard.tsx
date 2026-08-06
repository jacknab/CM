import { Bot, Clock, DollarSign, CheckCircle2 } from "lucide-react";
import type { AccountOverview } from "@/lib/support-api";

export default function AIUsageCard({ stats, full }: { stats: AccountOverview["stats"]; full?: boolean }) {
  const bookingRate = stats.aiCallsThisMonth > 0 ? Math.round((stats.aiBookingsThisMonth / stats.aiCallsThisMonth) * 100) : 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2"><Bot size={14} className="text-indigo-500" /><h3 className="text-sm font-semibold text-slate-700">AI Receptionist</h3></div>
        <span className="text-[10px] text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">This Month</span>
      </div>
      <div className="p-4 space-y-3">
        {stats.aiCallsThisMonth === 0 ? (
          <div className="text-center py-4"><Bot size={28} className="text-slate-200 mx-auto mb-2" /><p className="text-xs text-slate-400">No AI calls this month</p></div>
        ) : (
          <>
            <div className="flex items-end gap-2 bg-gradient-to-r from-indigo-50 to-violet-50 rounded-xl p-3">
              <div className="text-3xl font-bold text-slate-800">{stats.aiCallsThisMonth}</div>
              <div className="pb-1 text-xs text-slate-500 font-medium">total calls</div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat icon={<CheckCircle2 size={13} className="text-emerald-500" />} value={stats.aiBookingsThisMonth} label="Booked" />
              <Stat icon={<Clock size={13} className="text-slate-400" />} value={`${stats.aiMinutesThisMonth}m`} label="Minutes" />
              <Stat icon={<DollarSign size={13} className="text-amber-500" />} value={`$${stats.aiCostThisMonth.toFixed(2)}`} label="Cost" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-500">Booking Rate</span>
                <span className="text-xs font-semibold text-slate-700">{bookingRate}%</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full" style={{ width: `${bookingRate}%` }} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-2.5 text-center">
      <div className="flex justify-center mb-1">{icon}</div>
      <div className="text-sm font-bold text-slate-800">{value}</div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  );
}
