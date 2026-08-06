import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { StaffPortalNav } from "@/components/StaffPortalNav";
import {
  ArrowLeft, Percent, MinusCircle, Clock, CheckCircle2,
  ChevronRight, DollarSign, AlertCircle, Info,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type CommStructure = {
  type: "named" | "flat";
  name?: string;
  description?: string | null;
  employeePercent: number;
  housePercent: number;
  appliesTo?: string;
} | null;

type Deduction = {
  id: number;
  name: string;
  type: string;
  amount: string;
  appliesTo: string;
};

type PayoutItem = {
  id: number;
  runId: number;
  periodStart: string;
  periodEnd: string;
  runStatus: string;
  serviceRevenue: string;
  tips: string;
  grossAmount: string;
  totalDeductions: string;
  netAmount: string;
  status: string;
  paidAt: string | null;
  deductions: Array<{ name: string; amount: string; type: string }> | null;
};

type PaySummary = {
  staffName: string;
  commissionStructure: CommStructure;
  deductions: Deduction[];
  pendingPaycheck: PayoutItem | null;
  payHistory: PayoutItem[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt$ = (n: string | number) =>
  `$${parseFloat(String(n ?? "0")).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function SplitBar({ emp, house }: { emp: number; house: number }) {
  return (
    <div className="w-full h-2.5 rounded-full overflow-hidden flex">
      <div className="h-full bg-teal-500 transition-all" style={{ width: `${emp}%` }} />
      <div className="h-full bg-slate-200 transition-all" style={{ width: `${house}%` }} />
    </div>
  );
}

function StatusPip({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-700",
    completed: "bg-emerald-100 text-emerald-700",
    pending: "bg-amber-100 text-amber-700",
    processing: "bg-blue-100 text-blue-700",
    draft: "bg-gray-100 text-gray-500",
    failed: "bg-red-100 text-red-600",
  };
  return (
    <span className={cn("text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full", map[status] ?? "bg-gray-100 text-gray-500")}>
      {status}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StaffPaySummary() {
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery<PaySummary>({
    queryKey: ["/api/staff/me/pay-summary"],
    queryFn: async () => {
      const res = await fetch("/api/staff/me/pay-summary", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load pay summary");
      return res.json();
    },
  });

  return (
    <div className="flex flex-col bg-[#f7f8fa]" style={{ height: "100dvh" }}>

      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-100 shadow-sm">
        <button
          className="w-9 h-9 flex items-center justify-center rounded-full active:bg-slate-100 transition-colors"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="w-5 h-5 text-slate-700" />
        </button>
        <h1 className="flex-1 font-bold text-[17px] text-slate-900 text-center">My Pay</h1>
        <div className="w-9" />
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-5 space-y-4 pb-24">

          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-28 rounded-2xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-2xl p-4">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <p className="text-sm text-red-700">Could not load pay data. Please try again.</p>
            </div>
          )}

          {data && (
            <>
              {/* ── Commission Structure ─────────────────────────────── */}
              <section>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">
                  Commission Structure
                </p>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                  {data.commissionStructure ? (
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-bold text-[16px] text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>
                            {data.commissionStructure.type === "named"
                              ? data.commissionStructure.name
                              : "Flat Rate Commission"}
                          </p>
                          {data.commissionStructure.description && (
                            <p className="text-xs text-slate-400 mt-0.5">{data.commissionStructure.description}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="text-2xl font-black text-slate-900" style={{ fontFamily: "Outfit, sans-serif" }}>
                            {data.commissionStructure.employeePercent}/{data.commissionStructure.housePercent}
                          </p>
                          <p className="text-[10px] text-slate-400 -mt-0.5">split</p>
                        </div>
                      </div>

                      <SplitBar
                        emp={data.commissionStructure.employeePercent}
                        house={data.commissionStructure.housePercent}
                      />
                      <div className="flex justify-between text-[12px] mt-1.5 font-semibold">
                        <span className="text-teal-600">You keep {data.commissionStructure.employeePercent}%</span>
                        <span className="text-slate-400">House {data.commissionStructure.housePercent}%</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-5 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                        <Percent className="w-5 h-5 text-slate-300" />
                      </div>
                      <div>
                        <p className="text-[15px] font-semibold text-slate-700">No structure assigned</p>
                        <p className="text-xs text-slate-400">Contact your manager to set up your commission rate.</p>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* ── Deductions ──────────────────────────────────────── */}
              <section>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">
                  Deductions
                </p>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden divide-y divide-slate-50">
                  {data.deductions.length === 0 ? (
                    <div className="p-5 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                        <MinusCircle className="w-5 h-5 text-slate-300" />
                      </div>
                      <div>
                        <p className="text-[15px] font-semibold text-slate-700">No active deductions</p>
                        <p className="text-xs text-slate-400">No salon deductions are applied to your pay.</p>
                      </div>
                    </div>
                  ) : (
                    data.deductions.map((d) => (
                      <div key={d.id} className="flex items-center justify-between px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                            d.type === "percentage" ? "bg-violet-50" : "bg-red-50"
                          )}>
                            {d.type === "percentage"
                              ? <Percent className="w-4 h-4 text-violet-500" />
                              : <DollarSign className="w-4 h-4 text-red-400" />
                            }
                          </div>
                          <div>
                            <p className="text-[14px] font-semibold text-slate-800">{d.name}</p>
                            <p className="text-[11px] text-slate-400">
                              {d.appliesTo === "all" ? "All staff" : "You specifically"}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[14px] font-bold text-red-500">
                            −{d.type === "percentage"
                              ? `${Number(d.amount).toFixed(1)}% of gross`
                              : fmt$(d.amount)}
                          </p>
                          <p className="text-[10px] text-slate-400 capitalize">{d.type}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {/* ── Pending Paycheck ─────────────────────────────────── */}
              <section>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">
                  Pending Paycheck
                </p>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                  {data.pendingPaycheck ? (
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className="text-[13px] text-slate-500 font-medium">
                            Pay Period
                          </p>
                          <p className="text-[14px] font-bold text-slate-800 mt-0.5">
                            {data.pendingPaycheck.periodStart} – {data.pendingPaycheck.periodEnd}
                          </p>
                        </div>
                        <StatusPip status={data.pendingPaycheck.status} />
                      </div>

                      <div className="space-y-2.5">
                        <div className="flex justify-between text-[13px]">
                          <span className="text-slate-500">Service Revenue</span>
                          <span className="font-semibold text-slate-800">{fmt$(data.pendingPaycheck.serviceRevenue)}</span>
                        </div>
                        <div className="flex justify-between text-[13px]">
                          <span className="text-slate-500">Tips</span>
                          <span className="font-semibold text-slate-800">{fmt$(data.pendingPaycheck.tips)}</span>
                        </div>
                        <div className="flex justify-between text-[13px]">
                          <span className="text-slate-500">Commission Gross</span>
                          <span className="font-semibold text-slate-800">{fmt$(data.pendingPaycheck.grossAmount)}</span>
                        </div>
                        {Number(data.pendingPaycheck.totalDeductions) > 0 && (
                          <div className="flex justify-between text-[13px]">
                            <span className="text-red-400">Deductions</span>
                            <span className="font-semibold text-red-500">−{fmt$(data.pendingPaycheck.totalDeductions)}</span>
                          </div>
                        )}
                        <div className="pt-2 border-t border-dashed border-slate-200 flex justify-between">
                          <span className="text-[15px] font-bold text-slate-900">Net Pay</span>
                          <span className="text-[15px] font-black text-teal-600">{fmt$(data.pendingPaycheck.netAmount)}</span>
                        </div>
                      </div>

                      {/* Deduction breakdown */}
                      {data.pendingPaycheck.deductions && data.pendingPaycheck.deductions.length > 0 && (
                        <div className="mt-4 bg-slate-50 rounded-xl p-3 space-y-1.5">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Deduction Detail</p>
                          {data.pendingPaycheck.deductions.map((d, i) => (
                            <div key={i} className="flex justify-between text-[12px]">
                              <span className="text-slate-600">{d.name}</span>
                              <span className="font-semibold text-red-400">−{fmt$(d.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-5 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                        <Clock className="w-5 h-5 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-[15px] font-semibold text-slate-700">No pending paycheck</p>
                        <p className="text-xs text-slate-400">You have no outstanding payout items at this time.</p>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* ── Pay History ──────────────────────────────────────── */}
              <section>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">
                  Pay History
                </p>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden divide-y divide-slate-50">
                  {data.payHistory.length === 0 ? (
                    <div className="p-5 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-5 h-5 text-slate-300" />
                      </div>
                      <div>
                        <p className="text-[15px] font-semibold text-slate-700">No pay history yet</p>
                        <p className="text-xs text-slate-400">Completed payouts will appear here.</p>
                      </div>
                    </div>
                  ) : (
                    data.payHistory.map((item) => {
                      const expanded = expandedId === item.id;
                      return (
                        <div key={item.id}>
                          <button
                            className="w-full flex items-center justify-between px-5 py-4 active:bg-slate-50 transition-colors text-left"
                            onClick={() => setExpandedId(expanded ? null : item.id)}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                                <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500" />
                              </div>
                              <div>
                                <p className="text-[13px] font-bold text-slate-800">
                                  {item.periodStart} – {item.periodEnd}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <StatusPip status={item.status} />
                                  {item.paidAt && (
                                    <span className="text-[10px] text-slate-400">
                                      Paid {format(parseISO(item.paidAt), "MMM d, yyyy")}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="text-right">
                                <p className="text-[15px] font-black text-slate-900">{fmt$(item.netAmount)}</p>
                                <p className="text-[10px] text-slate-400">net</p>
                              </div>
                              <ChevronRight className={cn("w-4 h-4 text-slate-300 transition-transform", expanded && "rotate-90")} />
                            </div>
                          </button>

                          {expanded && (
                            <div className="px-5 pb-4 bg-slate-50/60">
                              <div className="space-y-2 pt-2">
                                <div className="flex justify-between text-[12px]">
                                  <span className="text-slate-500">Service Revenue</span>
                                  <span className="font-semibold text-slate-700">{fmt$(item.serviceRevenue)}</span>
                                </div>
                                <div className="flex justify-between text-[12px]">
                                  <span className="text-slate-500">Tips</span>
                                  <span className="font-semibold text-slate-700">{fmt$(item.tips)}</span>
                                </div>
                                <div className="flex justify-between text-[12px]">
                                  <span className="text-slate-500">Commission Gross</span>
                                  <span className="font-semibold text-slate-700">{fmt$(item.grossAmount)}</span>
                                </div>
                                {Number(item.totalDeductions) > 0 && (
                                  <div className="flex justify-between text-[12px]">
                                    <span className="text-red-400">Deductions</span>
                                    <span className="font-semibold text-red-400">−{fmt$(item.totalDeductions)}</span>
                                  </div>
                                )}
                                <div className="pt-2 border-t border-dashed border-slate-200 flex justify-between">
                                  <span className="text-[13px] font-bold text-slate-800">Net Pay</span>
                                  <span className="text-[13px] font-black text-teal-600">{fmt$(item.netAmount)}</span>
                                </div>
                                {item.deductions && item.deductions.length > 0 && (
                                  <div className="mt-2 bg-white rounded-xl p-3 space-y-1">
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Deduction Detail</p>
                                    {item.deductions.map((d, i) => (
                                      <div key={i} className="flex justify-between text-[11px]">
                                        <span className="text-slate-600">{d.name}</span>
                                        <span className="font-semibold text-red-400">−{fmt$(d.amount)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              {/* Info note */}
              <div className="flex items-start gap-2.5 px-1 py-2">
                <Info className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Pay history shows completed contractor payouts. Income from appointments
                  is tracked separately in the <button className="underline text-slate-500" onClick={() => navigate("/staff-income")}>Income</button> tab.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <StaffPortalNav />
    </div>
  );
}
