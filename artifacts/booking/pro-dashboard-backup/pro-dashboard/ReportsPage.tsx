import { useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { StoreContext } from "@/hooks/use-store";
import { BarChart3, TrendingUp, DollarSign, CheckCircle2, Clock, Users } from "lucide-react";

const STATUS_COLOR: Record<string, string> = {
  new: "#64748b", assigned: "#3b82f6", en_route: "#f59e0b",
  in_progress: "#00D4AA", completed: "#22c55e", cancelled: "#ef4444",
};
const STATUS_LABEL: Record<string, string> = {
  new: "New", assigned: "Assigned", en_route: "En Route",
  in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled",
};

export default function ReportsPage() {
  const ctx = useContext(StoreContext);
  const storeId = ctx?.selectedStore?.id;

  const { data: orders = [] } = useQuery({
    queryKey: ["/api/pro-dashboard/orders", storeId],
    queryFn: async () => {
      const r = await fetch(`/api/pro-dashboard/orders?storeId=${storeId}`);
      return r.json();
    },
    enabled: !!storeId,
  });

  const { data: invoices = [] } = useQuery({
    queryKey: ["/api/pro-dashboard/invoices", storeId],
    queryFn: async () => {
      const r = await fetch(`/api/pro-dashboard/invoices?storeId=${storeId}`);
      return r.json();
    },
    enabled: !!storeId,
  });

  const { data: estimates = [] } = useQuery({
    queryKey: ["/api/pro-dashboard/estimates", storeId],
    queryFn: async () => {
      const r = await fetch(`/api/pro-dashboard/estimates?storeId=${storeId}`);
      return r.json();
    },
    enabled: !!storeId,
  });

  const { data: crews = [] } = useQuery({
    queryKey: ["/api/pro-dashboard/crews", storeId],
    queryFn: async () => {
      const r = await fetch(`/api/pro-dashboard/crews?storeId=${storeId}`);
      return r.json();
    },
    enabled: !!storeId,
  });

  const totalRevenue = invoices.filter((i: any) => i.status === "paid").reduce((s: number, i: any) => s + Number(i.total || 0), 0);
  const outstanding = invoices.filter((i: any) => ["sent","overdue"].includes(i.status)).reduce((s: number, i: any) => s + Number(i.total || 0), 0);
  const completedJobs = orders.filter((o: any) => o.status === "completed").length;
  const conversionRate = orders.length > 0 ? Math.round((completedJobs / orders.length) * 100) : 0;
  const estimateConversionRate = estimates.length > 0 ? Math.round((estimates.filter((e: any) => ["approved","converted"].includes(e.status)).length / estimates.length) * 100) : 0;

  const jobsByStatus = Object.entries(STATUS_LABEL).map(([k, v]) => ({
    status: k, label: v, count: orders.filter((o: any) => o.status === k).length,
    color: STATUS_COLOR[k],
  })).filter(s => s.count > 0);

  const serviceTypes = orders.reduce((acc: Record<string, number>, o: any) => {
    if (o.serviceType) acc[o.serviceType] = (acc[o.serviceType] || 0) + 1;
    return acc;
  }, {});
  const topServices = (Object.entries(serviceTypes) as [string, number][]).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxServiceCount = topServices[0]?.[1] ?? 1;

  const SUMMARY = [
    { label: "Total Revenue", value: `$${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, sub: "from paid invoices", icon: DollarSign, color: "text-green-400" },
    { label: "Outstanding", value: `$${outstanding.toLocaleString("en-US", { minimumFractionDigits: 2 })}`, sub: "awaiting payment", icon: TrendingUp, color: "text-yellow-400" },
    { label: "Jobs Completed", value: completedJobs, sub: `${conversionRate}% completion rate`, icon: CheckCircle2, color: "text-[#00D4AA]" },
    { label: "Active Crews", value: crews.filter((c: any) => c.active).length, sub: "field teams", icon: Users, color: "text-blue-400" },
    { label: "Estimate Win Rate", value: `${estimateConversionRate}%`, sub: "approved / sent", icon: Clock, color: "text-purple-400" },
    { label: "Total Invoices", value: invoices.length, sub: `${invoices.filter((i: any) => i.status === "paid").length} paid`, icon: BarChart3, color: "text-white/60" },
  ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-extrabold text-white">Reports</h1>
        <p className="text-white/40 text-xs mt-0.5">Business performance overview</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {SUMMARY.map(({ label, value, sub, icon: Icon, color }) => (
          <div key={label} className="bg-[#0D1F35] border border-white/10 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">{label}</p>
              <Icon className={`w-4.5 h-4.5 ${color}`} />
            </div>
            <p className="text-white text-2xl font-black">{value}</p>
            <p className="text-white/30 text-xs mt-1">{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Jobs by status */}
        <div className="bg-[#0D1F35] border border-white/10 rounded-2xl p-5">
          <h3 className="text-white font-bold mb-4">Jobs by Status</h3>
          {jobsByStatus.length === 0 ? (
            <p className="text-white/30 text-sm">No jobs yet</p>
          ) : (
            <div className="space-y-3">
              {jobsByStatus.map(({ status, label, count, color }) => (
                <div key={status}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white/60 text-sm">{label}</span>
                    <span className="text-white font-bold text-sm">{count}</span>
                  </div>
                  <div className="h-2 bg-white/8 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${(count / orders.length) * 100}%`, background: color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top service types */}
        <div className="bg-[#0D1F35] border border-white/10 rounded-2xl p-5">
          <h3 className="text-white font-bold mb-4">Top Service Types</h3>
          {topServices.length === 0 ? (
            <p className="text-white/30 text-sm">No jobs yet</p>
          ) : (
            <div className="space-y-3">
              {topServices.map(([service, count]) => (
                <div key={service}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white/60 text-sm truncate pr-2">{service}</span>
                    <span className="text-white font-bold text-sm">{count}</span>
                  </div>
                  <div className="h-2 bg-white/8 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-[#00D4AA] transition-all" style={{ width: `${(count / maxServiceCount) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Revenue timeline */}
        <div className="bg-[#0D1F35] border border-white/10 rounded-2xl p-5">
          <h3 className="text-white font-bold mb-1">Invoice Status Breakdown</h3>
          <p className="text-white/30 text-xs mb-4">By count and value</p>
          {[["draft","Draft"],["sent","Sent"],["paid","Paid"],["overdue","Overdue"]].map(([s,l]) => {
            const count = invoices.filter((i: any) => i.status === s).length;
            const value = invoices.filter((i: any) => i.status === s).reduce((sum: number, i: any) => sum + Number(i.total||0), 0);
            return count > 0 ? (
              <div key={s} className="flex items-center justify-between py-2 border-b border-white/6 last:border-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[s] }} />
                  <span className="text-white/60 text-sm">{l}</span>
                  <span className="text-white/30 text-xs">{count} invoice{count!==1?"s":""}</span>
                </div>
                <span className="text-white font-semibold text-sm">${value.toFixed(2)}</span>
              </div>
            ) : null;
          })}
          {invoices.length === 0 && <p className="text-white/30 text-sm">No invoices yet</p>}
        </div>

        {/* Estimate pipeline */}
        <div className="bg-[#0D1F35] border border-white/10 rounded-2xl p-5">
          <h3 className="text-white font-bold mb-1">Estimate Pipeline</h3>
          <p className="text-white/30 text-xs mb-4">Conversion funnel</p>
          {[["draft","Draft","#64748b"],["sent","Sent","#3b82f6"],["approved","Approved","#00D4AA"],["declined","Declined","#ef4444"],["converted","Converted","#22c55e"]].map(([s,l,c]) => {
            const count = estimates.filter((e: any) => e.status === s).length;
            const value = estimates.filter((e: any) => e.status === s).reduce((sum: number, e: any) => sum + Number(e.total||0), 0);
            return count > 0 ? (
              <div key={s} className="flex items-center justify-between py-2 border-b border-white/6 last:border-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: c }} />
                  <span className="text-white/60 text-sm">{l}</span>
                  <span className="text-white/30 text-xs">{count}</span>
                </div>
                <span className="text-white font-semibold text-sm">${value.toFixed(2)}</span>
              </div>
            ) : null;
          })}
          {estimates.length === 0 && <p className="text-white/30 text-sm">No estimates yet</p>}
        </div>
      </div>
    </div>
  );
}
