import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSelectedStore } from "@/hooks/use-store";
import { format } from "date-fns";
import {
  BarChart3, Download, TrendingUp, Users, DollarSign,
  FileSpreadsheet, Calendar, ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type ReportData = {
  year: number;
  totals: {
    totalGross: string | number;
    totalDeductions: string | number;
    totalNet: string | number;
    runCount: number;
  };
  byContractor: Array<{
    contractorId: number;
    contractorName: string;
    totalNet: string | number;
    totalGross: string | number;
    totalDeductions: string | number;
    totalTips: string | number;
    runCount: number;
  }>;
  runs: Array<{
    id: number;
    periodStart: string;
    periodEnd: string;
    totalNet: string;
    totalGross: string;
    contractorCount: number;
    completedAt: string | null;
  }>;
};

function fmt$(n: string | number) {
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  try { return format(new Date(d), "MMM d, yyyy"); } catch { return d; }
}

function downloadCSV(data: ReportData, year: number) {
  const rows = [
    ["Contractor", "Gross Earnings", "Deductions", "Net Pay", "Tips", "Runs"],
    ...data.byContractor.map(c => [
      c.contractorName,
      Number(c.totalGross).toFixed(2),
      Number(c.totalDeductions).toFixed(2),
      Number(c.totalNet).toFixed(2),
      Number(c.totalTips).toFixed(2),
      String(c.runCount),
    ]),
    [],
    ["TOTALS", Number(data.totals.totalGross).toFixed(2), Number(data.totals.totalDeductions).toFixed(2), Number(data.totals.totalNet).toFixed(2), data.byContractor.reduce((s, c) => s + Number(c.totalTips), 0).toFixed(2), String(data.totals.runCount)],
  ];
  const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contractor-payouts-${year}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PayoutsReports() {
  const { selectedStore } = useSelectedStore();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));

  const { data, isLoading } = useQuery<ReportData>({
    queryKey: ["/api/contractor-payouts/reports", selectedStore?.id, year],
    queryFn: async () => {
      const res = await fetch(
        `/api/contractor-payouts/reports?storeId=${selectedStore!.id}&year=${year}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch report");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const grossMax = Math.max(...(data?.byContractor ?? []).map(c => Number(c.totalGross)), 1);

  return (
    <div className="p-6 max-w-[1100px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>Reports</h2>
          <p className="text-sm text-gray-500 mt-0.5">Earnings, deductions, and settlement summaries</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-28 rounded-xl border-gray-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {[currentYear, currentYear-1, currentYear-2].map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {data && (
            <Button variant="outline" size="sm" onClick={() => downloadCSV(data, parseInt(year))}
              className="rounded-xl gap-2">
              <Download className="w-4 h-4" /> Export CSV
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : !data ? (
        <div className="text-center py-16 text-gray-400 text-sm">No data available.</div>
      ) : (
        <>
          {/* Annual totals */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: "Gross Earnings", value: fmt$(data.totals.totalGross), icon: TrendingUp, color: "text-gray-600", bg: "bg-gray-50" },
              { label: "Total Deductions", value: fmt$(data.totals.totalDeductions), icon: DollarSign, color: "text-red-500", bg: "bg-red-50" },
              { label: "Net Paid", value: fmt$(data.totals.totalNet), icon: DollarSign, color: "text-teal-600", bg: "bg-teal-50" },
              { label: "Payout Runs", value: String(data.totals.runCount), icon: BarChart3, color: "text-violet-600", bg: "bg-violet-50" },
            ].map(s => (
              <Card key={s.label} className="rounded-2xl border-gray-100 shadow-sm">
                <CardContent className="p-5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${s.bg}`}>
                    <s.icon className={`w-4 h-4 ${s.color}`} />
                  </div>
                  <div className="text-xl font-bold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>
                    {s.value}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{s.label} · {year}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Earnings by contractor chart */}
          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardHeader className="border-b border-gray-50 pb-4">
              <CardTitle className="text-base" style={{ fontFamily: "Outfit, sans-serif" }}>
                Earnings by Contractor — {year}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {data.byContractor.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">No completed payouts in {year}.</div>
              ) : (
                <div className="space-y-3">
                  {data.byContractor.sort((a, b) => Number(b.totalNet) - Number(a.totalNet)).map(c => (
                    <div key={c.contractorId}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-teal-100 flex items-center justify-center text-teal-700 text-xs font-semibold">
                            {c.contractorName.split(" ").map(s => s[0]).join("").slice(0,2)}
                          </div>
                          <span className="text-sm font-medium text-gray-800">{c.contractorName}</span>
                          <span className="text-xs text-gray-400">{c.runCount} run{c.runCount !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="text-sm font-semibold text-gray-900">{fmt$(c.totalNet)}</div>
                      </div>
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-teal-500 transition-all"
                          style={{ width: `${(Number(c.totalGross) / grossMax) * 100}%` }} />
                      </div>
                      <div className="flex items-center gap-4 mt-1">
                        <span className="text-xs text-gray-400">Gross {fmt$(c.totalGross)}</span>
                        {Number(c.totalDeductions) > 0 && (
                          <span className="text-xs text-red-400">Deductions -{fmt$(c.totalDeductions)}</span>
                        )}
                        {Number(c.totalTips) > 0 && (
                          <span className="text-xs text-emerald-500">Tips {fmt$(c.totalTips)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payout run history */}
          <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden">
            <CardHeader className="border-b border-gray-50 py-4 px-6">
              <CardTitle className="text-base" style={{ fontFamily: "Outfit, sans-serif" }}>
                Completed Runs — {year}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.runs.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">No completed payout runs in {year}.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50/50 text-xs font-medium text-gray-400 uppercase tracking-wide">
                      <th className="text-left px-6 py-3">Period</th>
                      <th className="text-right px-6 py-3">Gross</th>
                      <th className="text-right px-6 py-3">Net Paid</th>
                      <th className="text-left px-6 py-3">Contractors</th>
                      <th className="text-left px-6 py-3">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.runs.map(r => (
                      <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50/30">
                        <td className="px-6 py-4 font-medium text-gray-800">{r.periodStart} – {r.periodEnd}</td>
                        <td className="px-6 py-4 text-right text-gray-500">{fmt$(r.totalGross)}</td>
                        <td className="px-6 py-4 text-right font-semibold text-gray-900">{fmt$(r.totalNet)}</td>
                        <td className="px-6 py-4 text-gray-500">{r.contractorCount}</td>
                        <td className="px-6 py-4 text-gray-400 text-xs">{fmtDate(r.completedAt)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-gray-200 bg-gray-50/50 font-semibold">
                      <td className="px-6 py-3 text-gray-700">Totals</td>
                      <td className="px-6 py-3 text-right text-gray-600">{fmt$(data.totals.totalGross)}</td>
                      <td className="px-6 py-3 text-right text-teal-700">{fmt$(data.totals.totalNet)}</td>
                      <td colSpan={2} className="px-6 py-3 text-gray-400 text-xs">{data.totals.runCount} runs</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* Deductions summary */}
          {Number(data.totals.totalDeductions) > 0 && (
            <Card className="rounded-2xl border-gray-100 shadow-sm">
              <CardHeader className="border-b border-gray-50 py-4 px-6">
                <CardTitle className="text-base" style={{ fontFamily: "Outfit, sans-serif" }}>Deductions Summary — {year}</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-red-50">
                    <div className="text-xs text-red-400 mb-1">Total Deductions</div>
                    <div className="text-xl font-bold text-red-700" style={{ fontFamily: "Outfit, sans-serif" }}>
                      {fmt$(data.totals.totalDeductions)}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-gray-50">
                    <div className="text-xs text-gray-400 mb-1">Gross → Net Ratio</div>
                    <div className="text-xl font-bold text-gray-700" style={{ fontFamily: "Outfit, sans-serif" }}>
                      {data.totals.totalGross && Number(data.totals.totalGross) > 0
                        ? `${((Number(data.totals.totalNet) / Number(data.totals.totalGross)) * 100).toFixed(1)}%`
                        : "—"}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-teal-50">
                    <div className="text-xs text-teal-500 mb-1">Net of Gross</div>
                    <div className="text-xl font-bold text-teal-700" style={{ fontFamily: "Outfit, sans-serif" }}>
                      {fmt$(data.totals.totalNet)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
