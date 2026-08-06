import {
  Printer, Download, Eye, CheckCircle2, Clock, FileText,
  ChevronRight, AlertCircle, Settings, RefreshCw
} from "lucide-react";

const teal = "#0d9488";

const checksQueue = [
  { id: "CHK-1042", contractor: "Alex Nguyen", avatar: "AN", role: "Barber", amount: "$4,100.00", period: "May 16–31, 2026", gross: "$4,230.00", deductions: "-$130.00", status: "queued", bank: "Mailed check" },
  { id: "CHK-1043", contractor: "Marcus Webb",  avatar: "MW", role: "Stylist", amount: "$2,860.00", period: "May 16–31, 2026", gross: "$3,010.00", deductions: "-$150.00", status: "queued", bank: "Mailed check" },
  { id: "CHK-1044", contractor: "Priya Osei",  avatar: "PO", role: "Colorist", amount: "$1,920.00", period: "May 16–31, 2026", gross: "$2,020.00", deductions: "-$100.00", status: "queued", bank: "Mailed check" },
];

const printed = [
  { id: "CHK-1039", contractor: "Alex Nguyen", avatar: "AN", amount: "$3,840.00", period: "May 1–15, 2026", printedOn: "May 15", status: "printed" },
  { id: "CHK-1036", contractor: "Marcus Webb",  avatar: "MW", amount: "$2,640.00", period: "Apr 16–30, 2026", printedOn: "Apr 30", status: "printed" },
];

const statusBadge = (s: string) => {
  if (s === "queued")  return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  if (s === "printed") return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  return "bg-gray-50 text-gray-500 ring-1 ring-gray-200";
};

export function CheckGeneration() {
  return (
    <div className="min-h-screen bg-[#f7f8fa] font-sans">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
            Check Generation
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">3 checks queued for printing · May 16–31, 2026</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 bg-white shadow-sm">
            <Settings className="w-4 h-4" /> Print Settings
          </button>
          <button className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-xl shadow-sm font-medium" style={{ background: teal }}>
            <Printer className="w-4 h-4" /> Print All (3)
          </button>
        </div>
      </div>

      <div className="px-8 py-6 max-w-[1400px] mx-auto space-y-6">

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Queued",     value: "3",         icon: Clock,        color: "text-amber-600",   bg: "bg-amber-50" },
            { label: "Total Value","value": "$8,880",   icon: FileText,     color: "text-teal-600",    bg: "bg-teal-50" },
            { label: "Printed",    value: "47",         icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "YTD Mailed", value: "$142,300",   icon: RefreshCw,    color: "text-violet-600",  bg: "bg-violet-50" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.bg} mb-3`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div className="text-xl font-bold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>{s.value}</div>
              <div className="text-sm text-gray-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-5">

          {/* Queued checks */}
          <div className="col-span-2 space-y-4">
            <h2 className="text-base font-semibold text-gray-800" style={{ fontFamily: "Outfit, sans-serif" }}>Queued for Printing</h2>

            {checksQueue.map((chk) => (
              <div key={chk.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Check header */}
                <div className="px-6 py-4 flex items-center justify-between border-b border-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ background: teal }}>
                      {chk.avatar}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900 text-sm">{chk.contractor}</div>
                      <div className="text-xs text-gray-400">{chk.role} · {chk.period}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusBadge(chk.status)}`}>
                      Queued
                    </span>
                    <span className="font-mono text-xs text-gray-400">{chk.id}</span>
                  </div>
                </div>

                {/* Check preview — styled like a real check */}
                <div className="mx-6 my-4 rounded-xl border-2 border-gray-200 bg-gradient-to-br from-gray-50 to-white p-5 relative overflow-hidden">
                  {/* Watermark lines */}
                  <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "repeating-linear-gradient(45deg, #000 0, #000 1px, transparent 0, transparent 50%)", backgroundSize: "8px 8px" }} />

                  <div className="relative">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-0.5">Luxury Hair Co.</div>
                        <div className="text-[10px] text-gray-400">123 Salon Blvd, Suite 200 · Chicago, IL 60601</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-400">Check No.</div>
                        <div className="font-mono font-bold text-gray-700">{chk.id}</div>
                        <div className="text-xs text-gray-400 mt-1">Date: May 31, 2026</div>
                      </div>
                    </div>

                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-[10px] text-gray-400 mb-0.5">Pay to the order of</div>
                        <div className="text-base font-bold text-gray-900 border-b-2 border-gray-300 pb-0.5 pr-12">{chk.contractor}</div>
                        <div className="text-[10px] text-gray-400 mt-2">For: Services {chk.period}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-gray-400 mb-0.5">Amount</div>
                        <div className="text-2xl font-black" style={{ color: teal, fontFamily: "Outfit, sans-serif" }}>{chk.amount}</div>
                      </div>
                    </div>

                    {/* MICR line simulation */}
                    <div className="mt-4 pt-3 border-t border-dashed border-gray-200">
                      <div className="font-mono text-[10px] text-gray-300 tracking-widest">⑆ 071000013 ⑆  •••• 4821 ⑇  {chk.id.replace("CHK-", "").padStart(10, "0")}</div>
                    </div>
                  </div>
                </div>

                {/* Stub / voucher */}
                <div className="mx-6 mb-4 rounded-xl bg-gray-50 border border-gray-100 px-5 py-3">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pay Stub</div>
                  <div className="grid grid-cols-3 gap-x-4 text-xs">
                    <div className="flex justify-between"><span className="text-gray-400">Gross</span><span className="font-medium text-gray-700">{chk.gross}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Deductions</span><span className="font-medium text-red-500">{chk.deductions}</span></div>
                    <div className="flex justify-between"><span className="text-gray-600 font-semibold">Net</span><span className="font-bold text-gray-900">{chk.amount}</span></div>
                  </div>
                </div>

                {/* Actions */}
                <div className="px-6 pb-4 flex items-center gap-2">
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-lg shadow-sm" style={{ background: teal }}>
                    <Printer className="w-3.5 h-3.5" /> Print Check
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white">
                    <Eye className="w-3.5 h-3.5" /> Preview PDF
                  </button>
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 bg-white">
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Print settings */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Print Settings</h3>
              <div className="space-y-3 text-sm">
                {[
                  { label: "Check format",   value: "MICR-compatible" },
                  { label: "Paper size",     value: "8.5\" × 11\" (3-part)" },
                  { label: "Alignment",      value: "Top-stub layout" },
                  { label: "Logo position",  value: "Top-left" },
                  { label: "MICR encoding",  value: "E-13B standard" },
                ].map((s) => (
                  <div key={s.label} className="flex justify-between">
                    <span className="text-gray-400">{s.label}</span>
                    <span className="font-medium text-gray-700">{s.value}</span>
                  </div>
                ))}
              </div>
              <button className="w-full mt-4 py-2 rounded-xl text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors">
                Edit Print Settings
              </button>
            </div>

            {/* Recently printed */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Recently Printed</h3>
              <div className="space-y-3">
                {printed.map((p) => (
                  <div key={p.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: teal }}>
                        {p.avatar}
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-800">{p.contractor}</div>
                        <div className="text-[10px] text-gray-400">{p.id} · {p.printedOn}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold text-gray-700">{p.amount}</div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusBadge(p.status)}`}>Printed</span>
                    </div>
                  </div>
                ))}
              </div>
              <button className="mt-3 text-xs font-medium flex items-center gap-1" style={{ color: teal }}>
                View all printed checks <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            {/* Compliance note */}
            <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: teal }} />
              <div>
                <p className="text-sm font-medium" style={{ color: teal }}>Ledger-backed</p>
                <p className="text-xs text-teal-600 mt-0.5">All check amounts are computed directly from the payout ledger — never from Stripe.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
