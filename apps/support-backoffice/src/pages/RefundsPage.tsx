import { useState } from "react";
import { RefreshCw, Search, DollarSign, CheckCircle2, XCircle } from "lucide-react";

const MOCK_CREDITS = [
  { id: 1, account: "Urban Glow Spa", amount: 29, type: "credit", reason: "Service disruption — SMS outage", agent: "Alex M.", date: "2024-12-08", status: "applied" },
  { id: 2, account: "Luxe Hair Studio", amount: 59, type: "refund", reason: "Duplicate charge", agent: "Sam T.", date: "2024-12-05", status: "processed" },
  { id: 3, account: "The Cut Room", amount: 15, type: "credit", reason: "Goodwill — onboarding delay", agent: "Jordan P.", date: "2024-11-30", status: "applied" },
  { id: 4, account: "Bliss Beauty Bar", amount: 99, type: "refund", reason: "Customer cancelled within 3 days", agent: "Alex M.", date: "2024-11-28", status: "pending" },
];

const TYPE_STYLE: Record<string, string> = {
  credit: "bg-blue-100 text-blue-700",
  refund: "bg-violet-100 text-violet-700",
};
const STATUS_STYLE: Record<string, string> = {
  applied: "bg-emerald-100 text-emerald-700",
  processed: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
};

export default function RefundsPage() {
  const [search, setSearch] = useState("");

  const filtered = MOCK_CREDITS.filter(
    c => c.account.toLowerCase().includes(search.toLowerCase()) || c.reason.toLowerCase().includes(search.toLowerCase())
  );

  const totalRefunded = MOCK_CREDITS.filter(c => c.status !== "pending" && c.type === "refund").reduce((s, c) => s + c.amount, 0);
  const totalCredits = MOCK_CREDITS.filter(c => c.type === "credit").reduce((s, c) => s + c.amount, 0);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-slate-50">
      <div className="p-6 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-800">Refunds & Credits</h1>
          <p className="text-slate-500 text-sm mt-1">Track all issued refunds, account credits, and goodwill adjustments</p>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Refunded This Month", value: `$${totalRefunded}`, icon: <RefreshCw size={16} className="text-violet-500" />, bg: "bg-violet-50" },
            { label: "Credits Issued", value: `$${totalCredits}`, icon: <DollarSign size={16} className="text-blue-500" />, bg: "bg-blue-50" },
            { label: "Pending Refunds", value: MOCK_CREDITS.filter(c => c.status === "pending").length.toString(), icon: <CheckCircle2 size={16} className="text-amber-500" />, bg: "bg-amber-50" },
          ].map(m => (
            <div key={m.label} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
              <div className={`w-9 h-9 ${m.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>{m.icon}</div>
              <div>
                <div className="text-lg font-bold text-slate-800">{m.value}</div>
                <div className="text-xs text-slate-400">{m.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search refunds & credits…"
                className="pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg w-64 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
              />
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Account</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Reason</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Agent</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                  <td className="px-4 py-3 font-medium text-slate-800">{c.account}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${TYPE_STYLE[c.type]}`}>{c.type}</span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-800">${c.amount}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs max-w-xs truncate">{c.reason}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{c.agent}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${STATUS_STYLE[c.status]}`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{c.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
