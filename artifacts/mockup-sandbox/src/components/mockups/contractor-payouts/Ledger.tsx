import {
  ArrowDownLeft, ArrowUpRight, Filter, Download, Search,
  ChevronDown, BookOpen, DollarSign, MinusCircle, RefreshCw, TrendingUp
} from "lucide-react";

const teal = "#0d9488";

type Entry = {
  id: string;
  date: string;
  type: "earning" | "deduction" | "adjustment" | "payout";
  category: string;
  contractor: string;
  avatar: string;
  description: string;
  amount: number;
  running: number;
};

const entries: Entry[] = [
  { id: "L-1094", date: "May 28", type: "earning",   category: "Service Commission", contractor: "Jordan Rivera", avatar: "JR", description: "Color + cut service #4821", amount: 280.00, running: 9840.00 },
  { id: "L-1093", date: "May 28", type: "earning",   category: "Tip",                contractor: "Jordan Rivera", avatar: "JR", description: "Client tip — service #4821", amount: 40.00,  running: 9560.00 },
  { id: "L-1092", date: "May 28", type: "earning",   category: "Service Commission", contractor: "Mia Chen",     avatar: "MC", description: "Balayage service #4820",    amount: 320.00, running: 7430.00 },
  { id: "L-1091", date: "May 27", type: "deduction", category: "Booth Rent",         contractor: "Jordan Rivera", avatar: "JR", description: "Weekly booth rent",         amount: -100.00, running: 9240.00 },
  { id: "L-1090", date: "May 27", type: "deduction", category: "Booth Rent",         contractor: "Mia Chen",     avatar: "MC", description: "Weekly booth rent",         amount: -87.50,  running: 7110.00 },
  { id: "L-1089", date: "May 27", type: "earning",   category: "Product Commission", contractor: "Taylor Brooks", avatar: "TB", description: "OPI gel polish retail sale", amount: 18.00,  running: 4830.00 },
  { id: "L-1088", date: "May 27", type: "adjustment",category: "Correction",         contractor: "Alex Nguyen",  avatar: "AN", description: "Reversal: duplicate booth rent entry L-1061", amount: 125.00, running: 6220.00 },
  { id: "L-1087", date: "May 26", type: "earning",   category: "Service Commission", contractor: "Dana Lee",     avatar: "DL", description: "Deep tissue massage #4810",  amount: 240.00, running: 5140.00 },
  { id: "L-1086", date: "May 26", type: "deduction", category: "Processing Fee",     contractor: "Taylor Brooks", avatar: "TB", description: "Stripe processing 2.9% + $0.30", amount: -12.60, running: 4812.00 },
  { id: "L-1085", date: "May 25", type: "payout",    category: "Payout",             contractor: "Jordan Rivera", avatar: "JR", description: "ACH payout batch #PB-088",  amount: -3240.00, running: 6095.00 },
  { id: "L-1084", date: "May 25", type: "payout",    category: "Payout",             contractor: "Mia Chen",     avatar: "MC", description: "ACH payout batch #PB-088",  amount: -2875.50, running: 6870.00 },
  { id: "L-1083", date: "May 24", type: "earning",   category: "Bonus",              contractor: "Alex Nguyen",  avatar: "AN", description: "Monthly performance bonus", amount: 200.00,  running: 6095.00 },
];

const typeConfig = {
  earning:    { icon: ArrowUpRight,  color: "text-emerald-600", bg: "bg-emerald-50",  label: "Earning",    badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  deduction:  { icon: ArrowDownLeft, color: "text-red-500",     bg: "bg-red-50",      label: "Deduction",  badge: "bg-red-50 text-red-600 ring-1 ring-red-200" },
  adjustment: { icon: RefreshCw,     color: "text-violet-600",  bg: "bg-violet-50",   label: "Adjustment", badge: "bg-violet-50 text-violet-700 ring-1 ring-violet-200" },
  payout:     { icon: TrendingUp,    color: "text-blue-600",    bg: "bg-blue-50",     label: "Payout",     badge: "bg-blue-50 text-blue-700 ring-1 ring-blue-200" },
};

const summaryCards = [
  { label: "Total Earnings",    value: "$14,890.00", icon: DollarSign,   color: "text-emerald-600", bg: "bg-emerald-50" },
  { label: "Total Deductions",  value: "-$1,996.00", icon: MinusCircle,  color: "text-red-500",     bg: "bg-red-50" },
  { label: "Adjustments",       value: "$325.00",    icon: RefreshCw,    color: "text-violet-600",  bg: "bg-violet-50" },
  { label: "Net Balance",       value: "$13,219.00", icon: BookOpen,     color: "text-teal-600",    bg: "bg-teal-50" },
];

export function Ledger() {
  return (
    <div className="min-h-screen bg-[#f7f8fa] font-sans">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
            Earnings Ledger
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Append-only source of truth · May 2026 · Luxury Hair Co.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none w-52" placeholder="Search entries…" />
          </div>
          <button className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 bg-white shadow-sm">
            <Filter className="w-4 h-4" /> Filter
          </button>
          <button className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 shadow-sm">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      <div className="px-8 py-6 max-w-[1400px] mx-auto space-y-5">

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-4">
          {summaryCards.map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.bg} mb-3`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div className="text-xl font-bold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>{s.value}</div>
              <div className="text-sm text-gray-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-3">
          {["All Types", "Earnings", "Deductions", "Adjustments", "Payouts"].map((f, i) => (
            <button
              key={f}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${i === 0 ? "text-white shadow-sm" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
              style={i === 0 ? { background: teal } : {}}
            >
              {f}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-400">Contractor:</span>
            <button className="flex items-center gap-2 text-sm border border-gray-200 rounded-xl px-3 py-1.5 bg-white text-gray-700 hover:bg-gray-50">
              All contractors <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Immutability notice */}
        <div className="bg-teal-50 border border-teal-200 rounded-2xl px-5 py-3 flex items-center gap-3">
          <BookOpen className="w-4 h-4 shrink-0" style={{ color: teal }} />
          <p className="text-sm font-medium" style={{ color: teal }}>
            This ledger is append-only. Records are never deleted or modified — corrections are made via new Adjustment entries.
          </p>
        </div>

        {/* Ledger table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-medium text-gray-400 uppercase tracking-wide bg-gray-50/60 border-b border-gray-100">
                <th className="text-left px-6 py-3">Entry ID</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Contractor</th>
                <th className="text-left px-4 py-3">Description</th>
                <th className="text-right px-4 py-3">Amount</th>
                <th className="text-right px-6 py-3">Running Balance</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const cfg = typeConfig[e.type];
                const Icon = cfg.icon;
                return (
                  <tr key={e.id} className="border-t border-gray-50 hover:bg-gray-50/40 transition-colors">
                    <td className="px-6 py-3.5">
                      <span className="font-mono text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded">{e.id}</span>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-500 whitespace-nowrap">{e.date}</td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.badge}`}>
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: teal }}>
                          {e.avatar}
                        </div>
                        <span className="text-sm text-gray-700 whitespace-nowrap">{e.contractor}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-500 max-w-[260px] truncate">{e.description}</td>
                    <td className={`px-4 py-3.5 text-right font-semibold tabular-nums ${e.amount >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {e.amount >= 0 ? "+" : ""}${Math.abs(e.amount).toFixed(2)}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-sm text-gray-700">
                      ${e.running.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">Showing 12 of 1,094 entries</span>
            <button className="text-sm font-medium" style={{ color: teal }}>Load more →</button>
          </div>
        </div>

      </div>
    </div>
  );
}
