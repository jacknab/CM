import { useState, useMemo } from "react";
import { getDeviceId } from "@/lib/device-id";
import { nailOffline } from "@/lib/nail-offline";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Clock, CreditCard, Banknote, ChevronRight, X, Delete } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { CashDrawerSessionWithActions } from "@shared/schema";
import { canNativePrint, nativePrintZReport } from "@/components/reports/ZReportPrint";

interface DayCloseModalProps {
  open: boolean;
  onClose: () => void;
  storeId: number;
  userName: string;
  /** Which cash drawer to close — 0/undefined = the store's default/shared drawer. */
  drawerId?: number;
  /** Opened by itself because the salon has closed for the day: it can't be dismissed until the day is closed. */
  required?: boolean;
}

/** A client still waiting on a ticket nobody started (doesn't stop the close; can be cleared as a no-show). */
interface WaitingTicket { id: number; ticketNumber: number | null; customerName: string | null; staffName: string | null; serviceName: string | null; checkedInAt: string }

interface OpenTicket {
  id: number;
  ticketNumber?: number | null;
  /** The technician pressed DONE: the service is finished and only the payment is missing. */
  done?: boolean;
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
    gift: "Gift Card",
    m2: "Card · M2 reader",
    tap: "Card · Tap to Pay",
    tap_to_pay: "Card · Tap to Pay",
    loyalty: "Loyalty Points",
  };
  return map[key.toLowerCase()] ?? (key.charAt(0).toUpperCase() + key.slice(1));
}

// Dollar-amount keypad — same on-screen keypad pattern as Calendar.tsx's Choose A Client sheet
// (3-wide digit grid, backspace in the corner), plus a decimal point key and an OK button, since
// this one's typing a dollar-and-cents amount rather than a phone number.
const CASH_KEYS: (string | "backspace")[][] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [".", "0", "backspace"],
];

export function DayCloseModal({ open, onClose, storeId, userName, drawerId = 0, required = false }: DayCloseModalProps) {
  const { toast } = useToast();
  const [cashInput, setCashInput] = useState("");
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const [serverBlockedTickets, setServerBlockedTickets] = useState<OpenTicket[]>([]);
  const [successData, setSuccessData] = useState(false);
  // A close that failed stays on screen until the next try: a passing toast made a failed Day Close look done.
  const [closeError, setCloseError] = useState<string | null>(null);
  // The server asked whether a quiet tablet has been checked; true once the person closing confirms it.
  // The Z Report printed on the Certxa Android app's own (IP/USB) receipt printer right after the close.
  const [zPrint, setZPrint] = useState<{ state: "idle" | "printing" | "printed" | "failed"; error?: string; sessionId?: number }>({ state: "idle" });

  /**
   * Print the closed shift's Z Report through the owner app — the same full report and the same
   * PRINT_ZREPORT message the Cash Drawer page's Z Report dialog uses. Only inside the Android app
   * (a plain browser has no receipt printer to send it to).
   */
  const printDayCloseReport = async (sessionId: number) => {
    if (!canNativePrint()) return;
    setZPrint({ state: "printing", sessionId });
    try {
      const res = await fetch(`/api/cash-drawer/sessions/${sessionId}/z-report-full`, { credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setZPrint({ state: "failed", sessionId, error: res.status === 403
          ? "Only an owner or manager can print the Z Report — print it from Cash Drawer."
          : body.message || "Couldn't load the Z Report." });
        return;
      }
      const result = await nativePrintZReport(body);
      setZPrint(result.ok ? { state: "printed", sessionId } : { state: "failed", sessionId, error: result.error || "The printer did not respond." });
    } catch {
      setZPrint({ state: "failed", sessionId, error: "Couldn't reach the server to load the Z Report." });
    }
  };

  // ── Data queries ────────────────────────────────────────────────────────────
  const { data: openSession, isLoading: sessionLoading } = useQuery<CashDrawerSessionWithActions | null>({
    queryKey: [`/api/cash-drawer/open?storeId=${storeId}&drawerId=${drawerId}`],
    enabled: open && !!storeId,
  });

  const { data: liveZReport, isLoading: zLoading } = useQuery<any>({
    queryKey: [`/api/cash-drawer/sessions/${openSession?.id}/z-report`],
    enabled: open && !!openSession?.id,
  });

  const closeStatusKey = `/api/cash-drawer/day-close-status?drawerId=${drawerId}&deviceId=${encodeURIComponent(getDeviceId())}`;
  const { data: closeStatus, isLoading: lockLoading } = useQuery<{ lockedUntil: string | null; unpaidTickets?: OpenTicket[] | null; waitingTickets?: WaitingTicket[]; devices?: { holdingCash: { device: string; count: number; amount: number }[]; quiet: { device: string; lastSeenAt: string }[] } }>({
    queryKey: [closeStatusKey],
    enabled: open && !!storeId,
    refetchOnMount: "always",
    refetchInterval: 60_000,
  });
  const lockedUntil = closeStatus?.lockedUntil && Date.parse(closeStatus.lockedUntil) > Date.now()
    ? closeStatus.lockedUntil : null;

  // The server blocks any started ticket, even an older walk-in from before midnight.
  // Mirror that rule here so the operator can find it before attempting to close.
  const { data: todayAppointments, isLoading: aptsLoading } = useQuery<any[]>({
    queryKey: [`/api/appointments?storeId=${storeId}`],
    queryFn: () =>
      fetch(
        `/api/appointments?storeId=${storeId}`,
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

  // The server's list (with ticket numbers and which are DONE) when it has one; otherwise the same rule worked out here.
  const blockedTickets = serverBlockedTickets.length > 0 ? serverBlockedTickets
    : closeStatus?.unpaidTickets ? closeStatus.unpaidTickets : openTickets;
  const doneUnpaid = blockedTickets.filter((t) => t.done).length;
  // Waiting tickets nobody started: listed before counting, with one tap to clear them as no-shows (owner, 2026-10-28)
  // — otherwise they carry over onto tomorrow's board.
  const waitingTickets = closeStatus?.waitingTickets ?? [];
  const [clearingWaiting, setClearingWaiting] = useState(false);
  const clearWaiting = async () => {
    setClearingWaiting(true);
    try {
      const r = await fetch("/api/cash-drawer/day-close/clear-waiting", { method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: waitingTickets.map((t) => t.id) }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.message || "Could not clear them");
      toast({ title: `${body.cleared ?? 0} waiting ticket${body.cleared === 1 ? "" : "s"} cleared as no-shows` });
      await queryClient.invalidateQueries({ queryKey: [closeStatusKey] });
    } catch (err: any) {
      toast({ title: "Couldn't clear the waiting tickets", description: err?.message, variant: "destructive" });
    } finally {
      setClearingWaiting(false);
    }
  };
  const isBlocked = blockedTickets.length > 0;

  // Card / non-cash rows from the Z-report (auto-populated)
  const cardRows = useMemo(() => {
    return Object.entries(liveZReport?.paymentBreakdown ?? {})
      // Cash is counted by hand below; a method nothing was taken on is not a row.
      .filter(([method, amount]) => method !== "cash" && Math.abs(Number(amount) || 0) >= 0.005)
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

  const cashCounted = parseFloat(cashInput) || 0;
  const hasCashInput = cashInput.trim() !== "";

  // ── Cash keypad ─────────────────────────────────────────────────────────────
  const pressCashKey = (key: string) => {
    setCashConfirmed(false);
    if (key === "backspace") { setCashInput((cur) => cur.slice(0, -1)); return; }
    if (key === ".") {
      if (cashInput.includes(".")) return; // only one decimal point
      setCashInput((cur) => (cur === "" ? "0." : cur + "."));
      return;
    }
    // Cap at 2 digits past the decimal point — cents, not fractions of a cent.
    const decimals = cashInput.includes(".") ? cashInput.split(".")[1] ?? "" : null;
    if (decimals != null && decimals.length >= 2) return;
    setCashInput((cur) => cur + key);
  };
  const confirmCash = () => {
    if (!hasCashInput) return;
    setCashInput(cashCounted.toFixed(2));
    setCashConfirmed(true);
  };

  // ── Mutation ────────────────────────────────────────────────────────────────
  const closeDrawerMutation = useMutation({
    mutationFn: async () => {
      setCloseError(null);
      // Cash taken on this tablet while it was offline and not yet confirmed by the server is not in the
      // server's totals. Closing now would report a reconciled figure that is short by that amount.
      const unsent = await nailOffline.counts(storeId).catch(() => null);
      if (unsent && unsent.cash.count > 0) {
        throw new Error(`This tablet holds ${unsent.cash.count} cash payment${unsent.cash.count === 1 ? "" : "s"} totalling $${unsent.cash.amount.toFixed(2)} that the server has not received yet. Reconnect and let them send (or resolve the ones needing attention) before closing the day.`);
      }
      // Use fetch here rather than apiRequest: its non-2xx throw discards the JSON body
      // containing the blocked ticket list or the server's lock expiration time.
      const res = await fetch(`/api/cash-drawer/sessions/${openSession!.id}/close`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          closingBalance: cashCounted.toFixed(2),
          closedBy: userName,
          autoOpenNext: true,
          // So the server can tell this tablet from the others when it checks for unsent offline cash.
          deviceId: getDeviceId(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.code === "UNPAID_TICKETS" && Array.isArray(body.unpaidTickets)) {
          setServerBlockedTickets(body.unpaidTickets);
        }
        if (body.code === "DAY_CLOSE_LOCKED" && body.lockedUntil) {
          queryClient.setQueryData([closeStatusKey], { lockedUntil: body.lockedUntil });
        }
        throw Object.assign(new Error(body.message || "Could not close the day"), { code: body.code });
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      const closedSessionId = openSession!.id;
      queryClient.invalidateQueries({ queryKey: [`/api/cash-drawer/open?storeId=${storeId}&drawerId=${drawerId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cash-drawer/sessions?storeId=${storeId}`] });
      queryClient.setQueryData([closeStatusKey], { lockedUntil: new Date(Date.parse(data.closedAt) + 12 * 60 * 60 * 1000).toISOString() });
      // Clear the old shift immediately on this station. The server uses the persisted
      // close timestamp on subsequent reads (including other stations and reloads).
      for (const boardPath of ["/api/nail/board", "/api/barber/board"]) {
        queryClient.setQueryData([boardPath, storeId], (board: any) => board ? {
          ...board,
          dayBookings: [],
          techStats: board.techStats?.map((tech: any) => ({ ...tech, doneToday: 0, lastFinishedAt: null })),
          glance: { appointments: 0, walkIns: 0, noShows: 0, completed: 0, avgTicket: null },
        } : board);
        queryClient.invalidateQueries({ queryKey: [boardPath, storeId] });
      }
      setSuccessData(true);
      void printDayCloseReport(closedSessionId);
    },
    onError: (err: any) => {
      // The open-ticket and lock responses already replace the sheet with their own explanation.
      if (err?.code !== "UNPAID_TICKETS" && err?.code !== "DAY_CLOSE_LOCKED") {
        setCloseError(err.message || "Could not close the day");
        toast({ title: "The day was NOT closed", description: err.message || "Could not close the day", variant: "destructive" });
      }
    },
  });

  const handleClose = () => {
    setCashInput("");
    setCashConfirmed(false);
    setServerBlockedTickets([]);
    setSuccessData(false);
    setCloseError(null);
    setZPrint({ state: "idle" });
    onClose();
  };

  const isLoading = sessionLoading || aptsLoading || zLoading || lockLoading;

  if (!open) return null;

  // ── Success screen ──────────────────────────────────────────────────────────
  if (successData) {
    return (
      <div className={`fixed inset-0 ${required ? "z-[400]" : "z-50"} text-foreground`} data-testid="day-close-panel">
        <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]" onClick={handleClose} />
        <div className="absolute right-0 top-0 h-full w-full sm:w-[420px] bg-white flex flex-col shadow-[-8px_0_24px_rgba(0,0,0,0.12)] border-l">
          <div className="px-4 py-4 flex items-center justify-between gap-2 bg-white border-b border-gray-200">
            <span className="font-semibold text-base text-gray-900">Day Closed</span>
            <Button variant="ghost" size="icon" onClick={handleClose} className="text-gray-500 hover:text-gray-900 hover:bg-gray-100" data-testid="button-close-day-close-success">
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 text-center space-y-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>
            <div className="flex justify-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
              </div>
            </div>
            <p className="text-sm text-gray-500">Cash count submitted. A new shift is open.</p>
            {zPrint.state === "printing" && <p className="text-sm text-gray-500" data-testid="day-close-zprint">Printing the Z Report…</p>}
            {zPrint.state === "printed" && <p className="text-sm text-emerald-700" data-testid="day-close-zprint">Z Report printed.</p>}
            {zPrint.state === "failed" && (
              <div className="space-y-2" data-testid="day-close-zprint">
                <p className="text-sm text-red-600">The Z Report didn't print: {zPrint.error}</p>
                {zPrint.sessionId != null && (
                  <Button variant="outline" className="w-full h-10" onClick={() => void printDayCloseReport(zPrint.sessionId!)}>Print again</Button>
                )}
              </div>
            )}

            <Button className="w-full bg-[#1A0333] hover:bg-[#2b0554] text-white h-10" onClick={handleClose}>
              Done
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main sheet ───────────────────────────────────────────────────────────────
  return (
    <div className={`fixed inset-0 ${required ? "z-[400]" : "z-50"} text-foreground`} data-testid="day-close-panel">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]" onClick={required ? undefined : handleClose} />
      <div className="absolute right-0 top-0 h-full w-full sm:w-[420px] bg-white flex flex-col shadow-[-8px_0_24px_rgba(0,0,0,0.12)] border-l">
        <div className="px-4 py-4 flex items-center justify-between gap-2 bg-white border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="font-semibold text-base text-gray-900">Close Today's Shift</span>
          </div>
          <Button variant="ghost" size="icon" onClick={handleClose} className={`text-gray-500 hover:text-gray-900 hover:bg-gray-100 ${required ? "invisible" : ""}`} disabled={required} data-testid="button-close-day-close">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading…</div>
        ) : lockedUntil ? (
          <div className="p-5 space-y-4" data-testid="day-close-locked">
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
              <Clock className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-800">Day Close was already run. It can be run again after {new Date(lockedUntil).toLocaleString()} (12 hours after the last close).</p>
            </div>
            <Button className="w-full" variant="outline" onClick={handleClose}>Close</Button>
          </div>
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
          <div className="p-5 space-y-4 overflow-y-auto">
            <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3">
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-red-800">
                <p className="font-semibold mb-1">
                  {blockedTickets.length} open ticket{blockedTickets.length === 1 ? "" : "s"} must be checked out first
                </p>
                <p className="text-red-700 text-xs">
                  {doneUnpaid > 0
                    ? `${doneUnpaid === blockedTickets.length ? "" : `${doneUnpaid} of them `}${doneUnpaid === 1 ? "is" : "are"} done and waiting for payment. Check out every ticket before closing the day.`
                    : "Check out all in-progress bookings before closing the day."}
                </p>
              </div>
            </div>
            <ul className="space-y-2">
              {blockedTickets.map((ticket) => (
                <li key={ticket.id} className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <Clock className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs leading-snug">
                    <p className="font-medium text-gray-900">
                      {ticket.ticketNumber != null ? `#${ticket.ticketNumber} · ` : ""}
                      {ticket.customerName ?? "Walk-in"}
                      {ticket.serviceName ? ` — ${ticket.serviceName}` : ""}
                    </p>
                    <p className="text-gray-500">
                      {ticket.staffName ? `with ${ticket.staffName} · ` : ""}{ticket.done ? "Done, waiting for payment" : "In service"}
                    </p>
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
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto">
              {waitingTickets.length > 0 && (
                <div className="mx-5 mt-5 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-3 space-y-2" data-testid="day-close-waiting">
                  <p className="text-sm font-semibold text-gray-900">
                    {waitingTickets.length} client{waitingTickets.length === 1 ? " is" : "s are"} still waiting on a ticket nobody started
                  </p>
                  <ul className="space-y-1">
                    {waitingTickets.map((t) => (
                      <li key={t.id} className="text-xs text-gray-700">
                        {t.ticketNumber != null ? `#${t.ticketNumber} · ` : ""}{t.customerName ?? "Walk-in"}
                        {t.serviceName ? ` — ${t.serviceName}` : ""}{t.staffName ? ` · with ${t.staffName}` : ""}
                      </li>
                    ))}
                  </ul>
                  <Button size="sm" variant="outline" className="w-full" disabled={clearingWaiting} onClick={() => void clearWaiting()} data-testid="day-close-clear-waiting">
                    {clearingWaiting ? "Clearing…" : "Clear as no-shows"}
                  </Button>
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

              {/* Cash count — on-screen decimal keypad */}
              <div className="px-5 py-4">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Banknote className="w-4 h-4 text-gray-400" />
                  <p className="text-sm font-semibold text-gray-800">Cash in Drawer</p>
                  {cashConfirmed && (
                    <span className="ml-auto text-xs bg-gray-100 text-gray-600 font-medium px-2 py-0.5 rounded-full">Entered</span>
                  )}
                </div>

                <div className="rounded-2xl bg-gray-50 border border-gray-200 py-4 px-4 text-center mb-3">
                  <p className="text-3xl font-bold tabular-nums text-gray-900" data-testid="text-cash-display">
                    {hasCashInput ? fmt(cashCounted) : <span className="text-gray-300">$0.00</span>}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  {CASH_KEYS.map((row, ri) => (
                    <div key={ri} className="flex gap-2">
                      {row.map((key) => (
                        <button
                          key={key}
                          type="button"
                          onPointerDown={(e) => e.preventDefault()}
                          onClick={() => pressCashKey(key)}
                          data-testid={`cash-key-${key === "backspace" ? "backspace" : key}`}
                          className="flex-1 h-12 rounded-xl bg-white text-xl font-bold text-gray-900 shadow-sm border border-gray-100 hover:bg-gray-50 active:scale-95 transition-all flex items-center justify-center"
                        >
                          {key === "backspace" ? <Delete className="w-5 h-5" /> : key}
                        </button>
                      ))}
                    </div>
                  ))}
                  <Button
                    type="button"
                    className="h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold mt-1"
                    onClick={confirmCash}
                    disabled={!hasCashInput}
                    data-testid="button-cash-ok"
                  >
                    OK
                  </Button>
                </div>

              </div>
            </div>

            {closeError && (
              <div role="alert" className="mx-5 mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" data-testid="day-close-error">
                <p className="font-semibold">The day was not closed.</p>
                <p className="mt-0.5">{closeError}</p>
              </div>
            )}

            {/* Footer */}
            <div className="border-t border-gray-200 px-5 py-3 flex gap-3 bg-white flex-shrink-0" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}>
              {/* Opened by itself after closing time: the day has to be closed, so there is no Cancel. */}
              {!required && <Button
                variant="outline"
                className="flex-1 h-11 rounded-xl"
                onClick={handleClose}
                disabled={closeDrawerMutation.isPending}
              >
                Cancel
              </Button>}
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
      </div>
    </div>
  );
}
