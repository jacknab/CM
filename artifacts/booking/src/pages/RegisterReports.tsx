import { useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSelectedStore } from "@/hooks/use-store";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import {
  DollarSign, CreditCard, Unlock, Lock, Download, ReceiptText,
  TrendingUp, Banknote, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatInTz } from "@/lib/timezone";
import type { CashDrawerSessionWithActions } from "@shared/schema";

function fmt(n: number | string | null | undefined) {
  if (n == null) return "—";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0", color)}>
            <Icon className="w-4.5 h-4.5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className="text-xl font-bold tabular-nums">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function RegisterReports() {
  const { selectedStore } = useSelectedStore();
  const timezone = selectedStore?.timezone || "UTC";
  const [limit, setLimit] = useState(20);

  const { data: sessions = [], isLoading } = useQuery<CashDrawerSessionWithActions[]>({
    queryKey: [`/api/cash-drawer/sessions?storeId=${selectedStore?.id}`],
    enabled: !!selectedStore,
  });

  const closedSessions = useMemo(() => {
    return sessions
      .filter(s => s.status === "closed")
      .sort((a, b) => {
        const at = a.closedAt ? new Date(a.closedAt).getTime() : 0;
        const bt = b.closedAt ? new Date(b.closedAt).getTime() : 0;
        return bt - at;
      });
  }, [sessions]);

  const openSession = sessions.find(s => s.status === "open");

  const totals = useMemo(() => {
    const cash = closedSessions.reduce((sum, s) => sum + Number(s.closingBalance ?? 0), 0);
    const charge = closedSessions.reduce((sum, s) => sum + Number(s.reportedCardSales ?? 0), 0);
    return { cash, charge, total: cash + charge };
  }, [closedSessions]);

  const displayedSessions = closedSessions.slice(0, limit);

  function downloadCsv() {
    const headers = ["Date", "Opened By", "Closed By", "Opening Cash", "Closing Cash", "Charge (Card)", "Total", "Mismatch"];
    const rows = closedSessions.map(s => [
      s.closedAt ? format(new Date(s.closedAt), "yyyy-MM-dd") : "",
      s.openedBy ?? "",
      s.closedBy ?? "",
      s.openingBalance ?? "0.00",
      s.closingBalance ?? "0.00",
      s.reportedCardSales ?? "0.00",
      (Number(s.closingBalance ?? 0) + Number(s.reportedCardSales ?? 0)).toFixed(2),
      s.priorClosingMismatch ? "Yes" : "No",
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `register-reports-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ReceiptText className="w-6 h-6 text-violet-600" />
              Register Reports
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Daily open/close history — cash and card totals per session
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadCsv} disabled={closedSessions.length === 0}>
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Sessions" value={String(closedSessions.length)} icon={Lock} color="bg-slate-100 text-slate-600" />
          <StatCard label="Total Cash" value={fmt(totals.cash)} icon={Banknote} color="bg-emerald-100 text-emerald-600" />
          <StatCard label="Total Charge" value={fmt(totals.charge)} icon={CreditCard} color="bg-blue-100 text-blue-600" />
          <StatCard label="Grand Total" value={fmt(totals.total)} icon={TrendingUp} color="bg-violet-100 text-violet-600" />
        </div>

        {/* Open session banner */}
        {openSession && (
          <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <Unlock className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-emerald-900">Register is currently open</p>
              <p className="text-xs text-emerald-700">
                Opened {openSession.openedAt ? formatInTz(new Date(openSession.openedAt), timezone, "MMM d, h:mm a") : "—"}
                {openSession.openedBy ? ` by ${openSession.openedBy}` : ""}
                {" · "} Opening cash: {fmt(openSession.openingBalance)}
              </p>
            </div>
          </div>
        )}

        {/* Sessions table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Closed Sessions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
            ) : closedSessions.length === 0 ? (
              <div className="py-12 text-center">
                <DollarSign className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No closed sessions yet</p>
                <p className="text-xs text-muted-foreground mt-1">Sessions will appear here after the day is closed</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Date</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Opened By</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">Closed By</th>
                        <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Opening</th>
                        <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Cash</th>
                        <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Charge</th>
                        <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Total</th>
                        <th className="px-4 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedSessions.map((session) => {
                        const closeDate = session.closedAt ? new Date(session.closedAt) : null;
                        const cash = Number(session.closingBalance ?? 0);
                        const charge = Number(session.reportedCardSales ?? 0);
                        const total = cash + charge;
                        return (
                          <tr key={session.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3 font-medium">
                              {closeDate ? formatInTz(closeDate, timezone, "MMM d, yyyy") : "—"}
                              <div className="text-xs text-muted-foreground font-normal">
                                {closeDate ? formatInTz(closeDate, timezone, "h:mm a") : ""}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{session.openedBy || "—"}</td>
                            <td className="px-4 py-3 text-muted-foreground">{session.closedBy || "—"}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{fmt(session.openingBalance)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-emerald-700 font-medium">{fmt(session.closingBalance)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-blue-700 font-medium">{fmt(session.reportedCardSales)}</td>
                            <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmt(total)}</td>
                            <td className="px-4 py-3 text-right">
                              {session.priorClosingMismatch && !session.priorClosingResolvedBy && (
                                <Badge variant="outline" className="text-amber-600 border-amber-300 gap-1 text-[11px]">
                                  <AlertTriangle className="w-3 h-3" />
                                  Variance
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {closedSessions.length > 0 && (
                      <tfoot>
                        <tr className="border-t bg-muted/30">
                          <td colSpan={4} className="px-4 py-3 text-xs font-medium text-muted-foreground">
                            {closedSessions.length} session{closedSessions.length !== 1 ? "s" : ""} total
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-emerald-700 font-semibold">{fmt(totals.cash)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-blue-700 font-semibold">{fmt(totals.charge)}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-bold">{fmt(totals.total)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
                {closedSessions.length > limit && (
                  <div className="px-4 py-3 border-t text-center">
                    <Button variant="ghost" size="sm" onClick={() => setLimit(l => l + 20)}>
                      Load more
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
