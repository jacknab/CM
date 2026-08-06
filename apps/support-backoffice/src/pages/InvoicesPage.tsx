import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Search, Download } from "lucide-react";

const MOCK_INVOICES = [
  { id: "INV-2024-0012", account: "Luxe Hair Studio", amount: 59, status: "paid", date: "2024-12-01", due: "2024-12-01" },
  { id: "INV-2024-0011", account: "Golden Scissors", amount: 29, status: "paid", date: "2024-11-01", due: "2024-11-01" },
  { id: "INV-2024-0010", account: "Urban Glow Spa", amount: 99, status: "past_due", date: "2024-10-01", due: "2024-10-15" },
  { id: "INV-2024-0009", account: "Bliss Beauty Bar", amount: 59, status: "paid", date: "2024-10-01", due: "2024-10-01" },
  { id: "INV-2024-0008", account: "The Cut Room", amount: 29, status: "void", date: "2024-09-01", due: "2024-09-01" },
];

const STATUS_STYLE: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  past_due: "bg-red-100 text-red-700",
  open: "bg-blue-100 text-blue-700",
  void: "bg-slate-100 text-slate-500",
  draft: "bg-amber-100 text-amber-700",
};

export default function InvoicesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const filtered = MOCK_INVOICES.filter(
    i => i.account.toLowerCase().includes(search.toLowerCase()) || i.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin bg-slate-50">
      <div className="p-6 max-w-6xl">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Invoices</h1>
            <p className="text-slate-500 text-sm mt-1">View and manage all platform invoices and billing records</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-white transition">
            <Download size={14} />
            Export CSV
          </button>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-5 text-xs text-blue-700">
          <strong>Note:</strong> This view shows a sample of invoice records. Full Stripe invoice sync requires connecting your Stripe account in Settings.
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="relative max-w-sm">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search invoices…"
                className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <FileText size={28} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500 text-sm">No invoices found</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Invoice #</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Account</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Amount</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Due</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(inv => (
                  <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition">
                    <td className="px-4 py-3 font-mono text-xs text-indigo-600 font-medium">{inv.id}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{inv.account}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">${inv.amount}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_STYLE[inv.status] ?? "bg-slate-100 text-slate-500"}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{inv.date}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{inv.due}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
