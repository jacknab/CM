import {
  Search, Filter, Plus, CheckCircle2, Clock, AlertCircle,
  MoreHorizontal, ChevronRight, Building2, Zap, CreditCard,
  User, Mail, Phone, Star
} from "lucide-react";

const teal = "#0d9488";

const contractors = [
  { name: "Jordan Rivera", role: "Senior Stylist", email: "jordan@example.com", phone: "(555) 201-4832", method: "ACH Direct Deposit", bank: "Chase ••4821", status: "active", stripe: "verified", earnings: "$12,430", ytd: "$48,200", avatar: "JR", rating: 4.9 },
  { name: "Mia Chen", role: "Colorist", email: "mia@example.com", phone: "(555) 339-7741", method: "ACH Direct Deposit", bank: "Wells Fargo ••3302", status: "active", stripe: "verified", earnings: "$9,875", ytd: "$36,100", avatar: "MC", rating: 4.8 },
  { name: "Taylor Brooks", role: "Nail Tech", email: "taylor@example.com", phone: "(555) 874-5520", method: "Instant Payout", bank: "Debit ••7791", status: "active", stripe: "verified", earnings: "$6,240", ytd: "$22,400", avatar: "TB", rating: 4.7 },
  { name: "Alex Nguyen", role: "Barber", email: "alex@example.com", phone: "(555) 452-1193", method: "Check", bank: "Mailed check", status: "active", stripe: "not_required", earnings: "$8,100", ytd: "$31,600", avatar: "AN", rating: 4.9 },
  { name: "Sam Patel", role: "Esthetician", email: "sam@example.com", phone: "(555) 663-0027", method: "ACH Direct Deposit", bank: "Not connected", status: "inactive", stripe: "pending", earnings: "$0", ytd: "$14,200", avatar: "SP", rating: 4.6 },
  { name: "Dana Lee", role: "Massage Therapist", email: "dana@example.com", phone: "(555) 112-9934", method: "ACH Direct Deposit", bank: "Bank of America ••6612", status: "active", stripe: "verified", earnings: "$5,920", ytd: "$19,800", avatar: "DL", rating: 4.8 },
];

const stripeBadge = (s: string) => {
  if (s === "verified") return { label: "Verified", cls: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" };
  if (s === "pending") return { label: "Onboarding", cls: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" };
  return { label: "N/A", cls: "bg-gray-50 text-gray-500 ring-1 ring-gray-200" };
};

const methodIcon = (m: string) => {
  if (m === "ACH Direct Deposit") return <Building2 className="w-3.5 h-3.5" />;
  if (m === "Instant Payout") return <Zap className="w-3.5 h-3.5" />;
  return <CreditCard className="w-3.5 h-3.5" />;
};

export function Contractors() {
  return (
    <div className="min-h-screen bg-[#f7f8fa] font-sans">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
            Contractors
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">24 active contractors · Luxury Hair Co.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 w-56" placeholder="Search contractors…" />
          </div>
          <button className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 bg-white shadow-sm">
            <Filter className="w-4 h-4" /> Filter
          </button>
          <button className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-xl shadow-sm font-medium" style={{ background: teal }}>
            <Plus className="w-4 h-4" /> Add Contractor
          </button>
        </div>
      </div>

      <div className="px-8 py-6 max-w-[1400px] mx-auto space-y-4">

        {/* Summary pills */}
        <div className="flex gap-3">
          {[
            { label: "All", count: 24, active: true },
            { label: "Verified", count: 21, active: false },
            { label: "Onboarding", count: 2, active: false },
            { label: "Inactive", count: 1, active: false },
          ].map((f) => (
            <button
              key={f.label}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${f.active ? "text-white shadow-sm" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
              style={f.active ? { background: teal } : {}}
            >
              {f.label} <span className={`ml-1 text-xs ${f.active ? "text-white/80" : "text-gray-400"}`}>{f.count}</span>
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-3 gap-4">
          {contractors.map((c) => {
            const badge = stripeBadge(c.stripe);
            return (
              <div key={c.name} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-sm" style={{ background: teal }}>
                      {c.avatar}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{c.name}</div>
                      <div className="text-xs text-gray-400">{c.role}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                    <button className="text-gray-300 hover:text-gray-500 p-0.5">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 text-sm mb-4">
                  <div className="flex items-center gap-2 text-gray-500">
                    <Mail className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                    <span className="truncate">{c.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-500">
                    <Phone className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                    {c.phone}
                  </div>
                  <div className="flex items-center gap-2 text-gray-500">
                    {methodIcon(c.method)}
                    <span>{c.method}</span>
                  </div>
                  {c.bank !== "Not connected" && (
                    <div className="flex items-center gap-2 text-gray-400">
                      <Building2 className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                      <span className="text-xs">{c.bank}</span>
                    </div>
                  )}
                  {c.bank === "Not connected" && (
                    <div className="flex items-center gap-2 text-amber-500 text-xs">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      Bank account not connected
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-50 pt-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-400">This period</div>
                    <div className="text-base font-bold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>{c.earnings}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-400">YTD</div>
                    <div className="text-sm font-semibold text-gray-600">{c.ytd}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span className="text-sm font-medium text-gray-700">{c.rating}</span>
                  </div>
                </div>

                {c.stripe === "pending" && (
                  <button className="mt-3 w-full py-2 rounded-xl text-xs font-semibold border-2 border-dashed border-amber-300 text-amber-600 hover:bg-amber-50 transition-colors">
                    Send onboarding link →
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
