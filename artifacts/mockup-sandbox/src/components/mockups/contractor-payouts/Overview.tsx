import {
  DollarSign, Users, Clock, CheckCircle2, TrendingUp, AlertCircle,
  ArrowUpRight, ArrowDownRight, MoreHorizontal, Download, Plus,
  Zap, Building2, CreditCard, FileText
} from "lucide-react";

const teal = "#0d9488";

const stats = [
  { label: "Total Paid This Period", value: "$48,320.00", change: "+12.4%", up: true, icon: DollarSign, color: "text-teal-600", bg: "bg-teal-50" },
  { label: "Active Contractors", value: "24", change: "+3 this month", up: true, icon: Users, color: "text-violet-600", bg: "bg-violet-50" },
  { label: "Pending Payouts", value: "$6,140.00", change: "8 contractors", up: null, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
  { label: "Completed Payouts", value: "186", change: "This quarter", up: null, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
];

const recentPayouts = [
  { name: "Jordan Rivera", method: "ACH Direct", amount: "$3,240.00", status: "paid", date: "May 27", avatar: "JR" },
  { name: "Mia Chen", method: "ACH Direct", amount: "$2,875.50", status: "paid", date: "May 27", avatar: "MC" },
  { name: "Taylor Brooks", method: "Instant", amount: "$1,920.00", status: "processing", date: "May 28", avatar: "TB" },
  { name: "Alex Nguyen", method: "Check #1042", amount: "$4,100.00", status: "pending", date: "May 28", avatar: "AN" },
  { name: "Sam Patel", method: "ACH Direct", amount: "$2,240.00", status: "failed", date: "May 28", avatar: "SP" },
];

const statusBadge = (s: string) => {
  if (s === "paid") return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  if (s === "processing") return "bg-blue-50 text-blue-700 ring-1 ring-blue-200";
  if (s === "pending") return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  if (s === "failed") return "bg-red-50 text-red-700 ring-1 ring-red-200";
  return "";
};

const bars = [62, 78, 55, 90, 72, 85, 48, 93, 67, 80, 74, 88];
const months = ["Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May"];

export function Overview() {
  return (
    <div className="min-h-screen bg-[#f7f8fa] font-sans">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
            Contractor Payouts
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">May 1 – May 31, 2026 · Luxury Hair Co.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 shadow-sm">
            <Download className="w-4 h-4" /> Export
          </button>
          <button className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-xl shadow-sm font-medium" style={{ background: teal }}>
            <Plus className="w-4 h-4" /> Run Payouts
          </button>
        </div>
      </div>

      <div className="px-8 py-6 max-w-[1400px] mx-auto space-y-6">

        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start justify-between">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.bg}`}>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
                {s.up !== null && (
                  <span className={`flex items-center gap-1 text-xs font-medium ${s.up ? "text-emerald-600" : "text-red-500"}`}>
                    {s.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {s.change}
                  </span>
                )}
              </div>
              <div className="mt-4">
                <div className="text-2xl font-bold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>{s.value}</div>
                <div className="text-sm text-gray-500 mt-0.5">{s.label}</div>
                {s.up === null && <div className="text-xs text-gray-400 mt-1">{s.change}</div>}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-5">
          {/* Chart */}
          <div className="col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-base font-semibold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>Payout Trends</h2>
                <p className="text-sm text-gray-400 mt-0.5">Monthly contractor earnings disbursed</p>
              </div>
              <select className="text-sm text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 bg-white">
                <option>Last 12 months</option>
              </select>
            </div>
            <div className="flex items-end gap-2 h-40">
              {bars.map((h, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-md transition-all"
                    style={{ height: `${h}%`, background: i === 11 ? teal : "#e2f5f3" }}
                  />
                  <span className="text-[10px] text-gray-400">{months[i]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4" style={{ fontFamily: "Outfit, sans-serif" }}>Quick Actions</h2>
            <div className="space-y-2.5">
              {[
                { icon: Zap, label: "Run Instant Payouts", sub: "2 contractors eligible", color: "text-amber-500", bg: "bg-amber-50" },
                { icon: Building2, label: "ACH Batch Transfer", sub: "8 pending · $6,140", color: "text-teal-600", bg: "bg-teal-50" },
                { icon: FileText, label: "Print Checks", sub: "3 checks queued", color: "text-violet-600", bg: "bg-violet-50" },
                { icon: CreditCard, label: "Add Contractor", sub: "Onboard & connect bank", color: "text-blue-600", bg: "bg-blue-50" },
              ].map((a) => (
                <button key={a.label} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 text-left border border-gray-100 transition-colors">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${a.bg} shrink-0`}>
                    <a.icon className={`w-4 h-4 ${a.color}`} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-800">{a.label}</div>
                    <div className="text-xs text-gray-400">{a.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Recent payouts table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>Recent Payouts</h2>
            <button className="text-sm font-medium" style={{ color: teal }}>View all →</button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-xs font-medium text-gray-400 uppercase tracking-wide border-b border-gray-50">
                <th className="text-left px-6 py-3">Contractor</th>
                <th className="text-left px-6 py-3">Method</th>
                <th className="text-left px-6 py-3">Amount</th>
                <th className="text-left px-6 py-3">Date</th>
                <th className="text-left px-6 py-3">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody>
              {recentPayouts.map((p) => (
                <tr key={p.name} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white" style={{ background: teal }}>
                        {p.avatar}
                      </div>
                      <span className="text-sm font-medium text-gray-800">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{p.method}</td>
                  <td className="px-6 py-4 text-sm font-semibold text-gray-800">{p.amount}</td>
                  <td className="px-6 py-4 text-sm text-gray-400">{p.date}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusBadge(p.status)}`}>
                      {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button className="text-gray-300 hover:text-gray-500">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Alert */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">1 contractor has an incomplete Stripe onboarding</p>
            <p className="text-sm text-amber-600 mt-0.5">Sam Patel needs to complete bank verification before payouts can be sent. <span className="underline cursor-pointer">Send reminder →</span></p>
          </div>
        </div>

      </div>
    </div>
  );
}
