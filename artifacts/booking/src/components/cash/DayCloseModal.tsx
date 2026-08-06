import { useState, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, CheckCircle2, Clock, CreditCard, Banknote, TrendingUp, ChevronRight } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { CashDrawerSessionWithActions } from "@shared/schema";

interface DayCloseModalProps {
  open: boolean;
  onClose: () => void;
  storeId: number;
  userName: string;
}

interface OpenTicket {
  id: number;
  customerName?: string | null;
  staffName?: string | null;
  serviceName?: string | null;
  startedAt?: string | null;
}

function fmt(n: number) {
  return `$${n.toFixed(2)}`;
}

// Friendly label for payment method keys coming from the Z-report
function paymentLabel(key: string): string {
  const map: Record<string, string> = {
    card: "Card",
    stripe: "Card (Stripe)",
    credit: "Credit Card",
    debit: "Debit Card",
    check: "Check",
    venmo: "Venmo",
    zelle: "Zelle",
    cashapp: "Cash App",
    giftcard: "Gift Card",
    gift_card: "Gift Card",
    loyalty: "Loyalty Points",
  };
  return map[key.toLowerCase()] ?? (key.charAt(0).toUpperCase() + key.slice(1));
}

export function DayCloseModal({ open, onClose, storeId, userName }: DayCloseModalProps) {
  const { toast } = useToast();
  const [cashInput, setCashInput] = useState("");
  const [note, setNote] = useState("");
  const [serverBlockedTickets, setServerBlockedTickets] = useState<OpenTicket[]>([]);
  const [successData, setSuccessData] = useState<{
    bankDeposit: string;
    nextOpening: string;
    cashCounted: string;
    cardTotal: number;
    totalSales: number;
  } | null>(null);

  // ── Data queries ────────────────────────────────────────────────────────────
  const { data: openSession, isLoading: sessionLoading } = useQuery<CashDrawerSessionWithActions | null>({
    queryKey: [`/api/cash-drawer/open?storeId=${storeId}`],
    enabled: open && !!storeId,
  });

  const { data: liveZReport, isLoading: zLoading } = useQuery<any>({
    queryKey: [`/api/cash-drawer/sessions/${openSession?.id}/z-report`],
    enabled: open && !!openSession?.id,
  });

  // Open tickets (blocks close)
  const today = new Date();
  const fromParam = new Date(today);
  fromParam.setHours(0, 0, 0, 0);
  const toParam = new Date(today);
  toParam.setHours(23, 59, 59, 999);

  const { data: todayAppointments, isLoading: aptsLoading } = useQuery<any[]>({
    queryKey: [`/api/appointments?storeId=${storeId}&from=${fromParam.toISOString()}&to=${toParam.toISOString()}`],
    queryFn: () =>
      fetch(
        `/api/appointments?storeId=${storeId}&from=${fromParam.toISOString()}&to=${toParam.toISOString()}`,
        { credentials: "include" },
      ).then((r) => r.json()),
    enabled: open && !!storeId,
    staleTime: 30_000,
  });

  // ── Derived values ──────────────────────────────────────────────────────────
  const openTickets: OpenTicket[] = (todayAppointments ?? [])
    .filter((apt: any) => apt.status === "started")
    .map((apt: any) => ({
      id: apt.id,
      customerName: apt.customer?.fullName ?? apt.customer?.name ?? apt.customerName ?? null,
      staffName: apt.staff?.name ?? apt.staffName ?? null,
      serviceName: apt.service?.name ?? apt.serviceName ?? null,
      startedAt: apt.startedAt ?? apt.date ?? null,
    }));

  const blockedTickets = serverBlockedTickets.length > 0 ? serverBlockedTickets : openTickets;
  const isBlocked = blockedTickets.length > 0;

  // Card / non-cash rows from the Z-report (auto-populated)
  const cardRows = useMemo(() => {
    return Object.entries(liveZReport?.paymentBreakdown ?? {})
      .filter(([method]) => method !== "cash")
      .map(([method, amount]) => ({
        label: paymentLabel(method),
        amount: amount as number,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [liveZReport]);

  const cardTotal = useMemo(
    () => cardRows.reduce((sum, r) => sum + r.amount, 0),
    [cardRows],
  );

  const cashFromSales = liveZReport?.paymentBreakdown?.cash ?? 0;
  const totalSales = liveZReport?.totalSales ?? 0;
  const totalTips = liveZReport?.totalTips ?? 0;
  const transactionCount = liveZReport?.transactionCount ?? 0;
  const expectedCash = liveZReport?.expectedCash ?? 0;

  const cashCounted = parseFloat(cashInput) || 0;
  const cashVariance = cashCounted - expectedCash;
  const hasCashInput = cashInput.trim() !== "";

  // ── Mutation ────────────────────────────────────────────────────────────────
  const closeDrawerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/cash-drawer/sessions/${openSession!.id}/close`, {
        closingBalance: cashCounted.toFixed(2),
        closedBy: userName,
        notes: note.trim() || null,
        autoOpenNext: true,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.code === "UNPAID_TICKETS" && Array.isArray(body.unpaidTickets)) {
          setServerBlockedTickets(body.unpaidTickets);
        }
        throw new Error(body.message || "Could not close the day");
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/cash-drawer/open?storeId=${storeId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cash-drawer/sessions?storeId=${storeId}`] });
      setSuccessData({
        bankDeposit: data.bankDepositAmount ?? "0.00",
        nextOpening: data.newSession?.openingBalance ?? "0.00",
        cashCounted: cashCounted.toFixed(2),
        cardTotal,
        totalSales,
      });
    },
    onError: (err: any) => {
      if (!serverBlockedTickets.length) {
        toast({ title: "Error", description: err.message || "Could not close the day", variant: "destructive" });
      }
    },
  });

  const handleClose = () => {
    setCashInput("");
    setNote("");
    setServerBlockedTickets([]);
    setSuccessData(null);
    onClose();
  };

  const isLoading = sessionLoading || aptsLoading || zLoading;

  // ── Success screen ──────────────────────────────────────────────────────────
  if (successData) {
    const bankAmt = Number(successData.bankDeposit);
    const nextAmt = Number(successData.nextOpening);
    return (
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden">
          <DialogTitle className="sr-only">Day Closed Successfully</DialogTitle>
          <div className="p-6 text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Day Closed</h2>
              <p className="text-sm text-gray-500 mt-1">New shift opened for tomorrow.</p>
            </div>

            <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 text-left">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-600">Total Sales</span>
                <span className="text-sm font-semibold text-gray-900 tabular-nums">{fmt(successData.totalSales)}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-600">Card</span>
                <span className="text-sm font-semibold text-gray-900 tabular-nums">{fmt(successData.cardTotal)}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-600">Cash Counted</span>
                <span className="text-sm font-semibold text-gray-900 tabular-nums">{fmt(Number(successData.cashCounted))}</span>
              </div>
              {bankAmt > 0 && (
                <div className="flex items-center justify-between px-4 py-3 bg-amber-50">
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Bank Deposit</p>
                    <p className="text-xs text-amber-600">Place in deposit envelope</p>
                  </div>
                  <span className="text-base font-bold text-amber-700 tabular-nums">{fmt(bankAmt)}</span>
                </div>
              )}
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-600">Tomorrow's Float</span>
                <span className="text-sm font-semibold text-gray-900 tabular-nums">{fmt(nextAmt)}</span>
              </div>
            </div>

            <Button className="w-full bg-[#1A0333] hover:bg-[#2b0554] text-white h-10" onClick={handleClose}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Main modal ──────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b bg-white sticky top-0 z-10">
          <DialogTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            Close Today's Shift
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
        ) : !openSession ? (
          <div className="p-5 space-y-4">
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-800">
                No open register session found. Open the register first before closing the day.
              </p>
            </div>
            <Button className="w-full" variant="outline" onClick={handleClose}>Close</Button>
          </div>
        ) : isBlocked ? (
          /* ── Blocked by open tickets ──────────────────────────────────── */
          <div className="p-5 space-y-4">
            <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3">
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-red-800">
                <p className="font-semibold mb-1">
                  {blockedTickets.length} open ticket{blockedTickets.length === 1 ? "" : "s"} must be checked out first
                </p>
                <p className="text-red-700 text-xs">
                  Check out all in-progress bookings before closing the day.
                </p>
              </div>
            </div>
            <ul className="space-y-2">
              {blockedTickets.map((ticket) => (
                <li key={ticket.id} className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <Clock className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs leading-snug">
                    <p className="font-medium text-gray-900">
                      {ticket.customerName ?? "Walk-in"}
                      {ticket.serviceName ? ` — ${ticket.serviceName}` : ""}
                    </p>
                    {ticket.staffName && (
                      <p className="text-gray-500">with {ticket.staffName}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <Button className="w-full" variant="outline" onClick={handleClose}>
              Go back and check out
            </Button>
          </div>
        ) : (
          /* ── Main close form ──────────────────────────────────────────── */
          <div className="overflow-y-auto max-h-[80vh]">

            {/* Today's summary banner */}
            {totalSales > 0 && (
              <div className="mx-5 mt-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 p-4 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-white/70 uppercase tracking-wide">Today's Revenue</p>
                    <p className="text-2xl font-bold tabular-nums mt-0.5">{fmt(totalSales)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-white/70">{transactionCount} service{transactionCount !== 1 ? "s" : ""}</p>
                    {totalTips > 0 && (
                      <p className="text-xs text-white/80 mt-0.5">incl. {fmt(totalTips)} tips</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Card transactions — auto-populated */}
            <div className="px-5 pt-4 pb-3">
              <div className="flex items-center gap-1.5 mb-2.5">
                <CreditCard className="w-4 h-4 text-gray-400" />
                <p className="text-sm font-semibold text-gray-800">Card Transactions</p>
                <span className="ml-auto text-xs bg-emerald-100 text-emerald-700 font-medium px-2 py-0.5 rounded-full">Auto</span>
              </div>

              {cardRows.length === 0 ? (
                <p className="text-sm text-gray-400 py-1">No card transactions today.</p>
              ) : (
                <div className="rounded-xl border border-gray-100 divide-y divide-gray-100 overflow-hidden">
                  {cardRows.map((row) => (
                    <div key={row.label} className="flex items-center justify-between px-3.5 py-2.5">
                      <span className="text-sm text-gray-700">{row.label}</span>
                      <span className="text-sm font-semibold text-gray-900 tabular-nums">{fmt(row.amount)}</span>
                    </div>
                  ))}
                  {cardRows.length > 1 && (
                    <div className="flex items-center justify-between px-3.5 py-2.5 bg-gray-50">
                      <span className="text-sm font-semibold text-gray-700">Card Total</span>
                      <span className="text-sm font-bold text-gray-900 tabular-nums">{fmt(cardTotal)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mx-5 border-t border-gray-100" />

            {/* Cash count — single input */}
            <div className="px-5 py-4">
              <div className="flex items-center gap-1.5 mb-2.5">
                <Banknote className="w-4 h-4 text-gray-400" />
                <p className="text-sm font-semibold text-gray-800">Cash in Drawer</p>
              </div>

              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-semibold text-gray-400 pointer-events-none">$</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={cashInput}
                  onChange={(e) => setCashInput(e.target.value)}
                  className="pl-7 h-12 text-lg font-semibold text-right pr-4 rounded-xl"
                />
              </div>

              {/* Variance hint */}
              {hasCashInput && expectedCash > 0 && (
                <div className={cn(
                  "mt-2 flex items-center justify-between text-xs px-3 py-2 rounded-lg",
                  Math.abs(cashVariance) < 0.01
                    ? "bg-emerald-50 text-emerald-700"
                    : cashVariance > 0
                    ? "bg-blue-50 text-blue-700"
                    : "bg-amber-50 text-amber-700"
                )}>
                  <span>Expected cash</span>
                  <span className="font-semibold tabular-nums">
                    {fmt(expectedCash)}
                    {Math.abs(cashVariance) >= 0.01 && (
                      <span className="ml-1.5 font-normal opacity-80">
                        ({cashVariance > 0 ? "+" : ""}{fmt(cashVariance)} variance)
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>

            <div className="mx-5 border-t border-gray-100" />

            {/* Notes */}
            <div className="px-5 py-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Notes <span className="font-normal normal-case text-gray-400">(optional)</span></p>
              <Textarea
                placeholder="Anything to note about today…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-16 text-sm resize-none rounded-xl"
              />
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 px-5 py-3 flex gap-3 bg-white sticky bottom-0">
              <Button
                variant="outline"
                className="flex-1 h-11 rounded-xl"
                onClick={handleClose}
                disabled={closeDrawerMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 h-11 rounded-xl bg-[#1A0333] hover:bg-[#2b0554] text-white flex items-center justify-center gap-1.5"
                onClick={() => closeDrawerMutation.mutate()}
                disabled={closeDrawerMutation.isPending || isBlocked || !hasCashInput}
              >
                {closeDrawerMutation.isPending ? (
                  "Processing…"
                ) : (
                  <>Close Day <ChevronRight className="w-4 h-4" /></>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
