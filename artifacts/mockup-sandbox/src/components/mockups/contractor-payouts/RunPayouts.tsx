import {
  ChevronLeft, CheckCircle2, AlertCircle, Building2, Zap,
  CreditCard, FileText, ChevronDown, Info, DollarSign, Users, Clock
} from "lucide-react";

const teal = "#0d9488";

const items = [
  { name: "Jordan Rivera", role: "Senior Stylist", avatar: "JR", services: "$2,800.00", tips: "$380.00", products: "$180.00", boothRent: "$400.00", processing: "$56.00", net: "$2,904.00", method: "ACH", selected: true },
  { name: "Mia Chen", role: "Colorist", avatar: "MC", services: "$2,200.00", tips: "$290.00", products: "$220.00", boothRent: "$350.00", processing: "$44.00", net: "$2,316.00", method: "ACH", selected: true },
  { name: "Taylor Brooks", role: "Nail Tech", avatar: "TB", services: "$1,600.00", tips: "$210.00", products: "$80.00", boothRent: "$300.00", processing: "$32.00", net: "$1,558.00", method: "Instant", selected: true },
  { name: "Alex Nguyen", role: "Barber", avatar: "AN", services: "$3,400.00", tips: "$520.00", products: "$310.00", boothRent: "$500.00", processing: "$0.00", net: "$3,730.00", method: "Check", selected: true },
  { name: "Dana Lee", role: "Massage Therapist", avatar: "DL", services: "$1,900.00", tips: "$240.00", products: "$120.00", boothRent: "$280.00", processing: "$38.00", net: "$1,942.00", method: "ACH", selected: false },
];

const methodPill = (m: string) => {
  if (m === "ACH") return <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 ring-1 ring-blue-200"><Building2 className="w-3 h-3" />ACH</span>;
  if (m === "Instant") return <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 ring-1 ring-amber-200"><Zap className="w-3 h-3" />Instant</span>;
  return <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-700 ring-1 ring-gray-200"><FileText className="w-3 h-3" />Check</span>;
};

const totalNet = items.filter(i => i.selected).reduce((a, i) => a + parseFloat(i.net.replace(/[$,]/g, "")), 0);
const totalContractors = items.filter(i => i.selected).length;

export function RunPayouts() {
  return (
    <div className="min-h-screen bg-[#f7f8fa] font-sans">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button className="w-8 h-8 rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-gray-50">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
              Run Payouts
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">May 16 – May 31, 2026 · Review & approve</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200">
            <Clock className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-medium text-amber-700">Draft</span>
          </div>
        </div>
      </div>

      <div className="px-8 py-6 max-w-[1400px] mx-auto">
        <div className="grid grid-cols-3 gap-5">

          {/* Main table */}
          <div className="col-span-2 space-y-4">
            {/* Period selector */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
              <div className="flex-1">
                <div className="text-xs text-gray-400 mb-1">Pay Period</div>
                <button className="flex items-center gap-2 text-sm font-medium text-gray-800 border border-gray-200 rounded-xl px-3 py-2 bg-white hover:bg-gray-50">
                  May 16 – May 31, 2026 <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              <div className="flex-1">
                <div className="text-xs text-gray-400 mb-1">Payout Method</div>
                <button className="flex items-center gap-2 text-sm font-medium text-gray-800 border border-gray-200 rounded-xl px-3 py-2 bg-white hover:bg-gray-50">
                  Per contractor settings <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              <div className="flex-1">
                <div className="text-xs text-gray-400 mb-1">Send Date</div>
                <button className="flex items-center gap-2 text-sm font-medium text-gray-800 border border-gray-200 rounded-xl px-3 py-2 bg-white hover:bg-gray-50">
                  May 31, 2026 <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>
                  Contractor Earnings
                </h2>
                <div className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked className="rounded" style={{ accentColor: teal }} />
                  <span className="text-xs text-gray-500">Select all</span>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-medium text-gray-400 uppercase tracking-wide bg-gray-50/50">
                    <th className="text-left px-6 py-3 w-8"></th>
                    <th className="text-left px-4 py-3">Contractor</th>
                    <th className="text-right px-4 py-3">Services</th>
                    <th className="text-right px-4 py-3">Tips</th>
                    <th className="text-right px-4 py-3">Deductions</th>
                    <th className="text-right px-4 py-3 font-bold text-gray-600">Net Payout</th>
                    <th className="text-center px-4 py-3">Method</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.name} className={`border-t border-gray-50 hover:bg-gray-50/40 transition-colors ${!item.selected ? "opacity-50" : ""}`}>
                      <td className="px-6 py-4">
                        <input type="checkbox" defaultChecked={item.selected} className="rounded" style={{ accentColor: teal }} />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: teal }}>
                            {item.avatar}
                          </div>
                          <div>
                            <div className="font-medium text-gray-800">{item.name}</div>
                            <div className="text-xs text-gray-400">{item.role}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right text-gray-600">{item.services}</td>
                      <td className="px-4 py-4 text-right text-gray-600">{item.tips}</td>
                      <td className="px-4 py-4 text-right text-red-500">
                        -${(parseFloat(item.boothRent.replace(/[$,]/g, "")) + parseFloat(item.processing.replace(/[$,]/g, ""))).toFixed(2)}
                      </td>
                      <td className="px-4 py-4 text-right font-bold text-gray-900">{item.net}</td>
                      <td className="px-4 py-4">
                        <div className="flex justify-center">{methodPill(item.method)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Info banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
              <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700">ACH transfers take 1–2 business days. Instant payouts are available within 30 minutes. Checks will be queued for printing.</p>
            </div>
          </div>

          {/* Summary sidebar */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-base font-semibold text-gray-900 mb-4" style={{ fontFamily: "Outfit, sans-serif" }}>Payout Summary</h2>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Contractors selected</span>
                  <span className="font-medium text-gray-800">{totalContractors}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Gross earnings</span>
                  <span className="font-medium text-gray-800">$14,490.00</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total deductions</span>
                  <span className="font-medium text-red-500">-$1,996.00</span>
                </div>
                <div className="border-t border-gray-100 pt-3 flex justify-between">
                  <span className="font-semibold text-gray-900">Net total</span>
                  <span className="font-bold text-gray-900 text-lg" style={{ fontFamily: "Outfit, sans-serif" }}>
                    ${totalNet.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="mt-4 space-y-2 text-xs text-gray-500">
                <div className="flex justify-between"><span>ACH transfers (3)</span><span className="font-medium">$7,162.00</span></div>
                <div className="flex justify-between"><span>Instant payouts (1)</span><span className="font-medium">$1,558.00</span></div>
                <div className="flex justify-between"><span>Checks (1)</span><span className="font-medium">$3,730.00</span></div>
              </div>

              <button className="w-full mt-5 py-3 rounded-xl text-sm font-semibold text-white shadow-md transition-all hover:brightness-105" style={{ background: teal }}>
                Approve & Send Payouts
              </button>
              <button className="w-full mt-2 py-2.5 rounded-xl text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
                Save as Draft
              </button>
            </div>

            {/* Deductions breakdown */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Deduction Breakdown</h3>
              <div className="space-y-2.5 text-sm">
                {[
                  { label: "Booth rent", amount: "$1,830.00" },
                  { label: "Processing fees", amount: "$170.00" },
                  { label: "Supplies (none)", amount: "$0.00" },
                ].map((d) => (
                  <div key={d.label} className="flex justify-between">
                    <span className="text-gray-500">{d.label}</span>
                    <span className="font-medium text-gray-700">{d.amount}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Audit notice */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-medium text-gray-800">Audit Log</span>
              </div>
              <p className="text-xs text-gray-400">All payout actions are logged with user, timestamp, and amounts for compliance.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
