import { useState, useMemo, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useSelectedStore } from "@/hooks/use-store";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatInTz } from "@/lib/timezone";
import { BusinessDayGate } from "@/components/cash/BusinessDayOverlay";
import type { CashDrawerSessionWithActions } from "@shared/schema";
import {
  DollarSign, Lock, Unlock, FileText, Clock, ArrowDownCircle,
  ArrowUpCircle, Banknote, CreditCard, Smartphone, Printer,
  AlertTriangle, ChevronDown, ChevronRight, X, Building2
} from "lucide-react";
import { cn } from "@/lib/utils";

const DENOMINATIONS = [
  { label: "$100 Bills", value: 100, key: "100" },
  { label: "$50 Bills", value: 50, key: "50" },
  { label: "$20 Bills", value: 20, key: "20" },
  { label: "$10 Bills", value: 10, key: "10" },
  { label: "$5 Bills", value: 5, key: "5" },
  { label: "$2 Bills", value: 2, key: "2" },
  { label: "$1 Bills", value: 1, key: "1" },
  { label: "Quarters ($0.25)", value: 0.25, key: "0.25" },
  { label: "Dimes ($0.10)", value: 0.10, key: "0.10" },
  { label: "Nickels ($0.05)", value: 0.05, key: "0.05" },
  { label: "Pennies ($0.01)", value: 0.01, key: "0.01" },
];

type DenominationCounts = Record<string, number>;

function useDenominationCounter() {
  const [counts, setCounts] = useState<DenominationCounts>({});

  const setCount = (key: string, count: number) => {
    setCounts(prev => ({ ...prev, [key]: count }));
  };

  const total = useMemo(() => {
    return DENOMINATIONS.reduce((sum, d) => {
      const count = counts[d.key] || 0;
      return sum + Math.round(count * d.value * 100) / 100;
    }, 0);
  }, [counts]);

  const reset = () => setCounts({});

  return { counts, setCount, total, reset };
}

export default function CashDrawer() {
  return (
    <AppLayout>
      <CashDrawerPanel />
    </AppLayout>
  );
}

interface CashDrawerPanelProps {
  embedded?: boolean;
  onClose?: () => void;
}

export function CashDrawerPanel({ embedded = false, onClose }: CashDrawerPanelProps = {}) {
  const { selectedStore } = useSelectedStore();
  const { user } = useAuth();
  const { toast } = useToast();
  const timezone = selectedStore?.timezone || "UTC";
  const userName = user?.firstName || user?.email || "Staff";

  const [openingAmount, setOpeningAmount] = useState("0.00");
  const [closeNotes, setCloseNotes] = useState("");
  const [reportedCardSales, setReportedCardSales] = useState("");
  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);

  // "Blind count" — staff users count without seeing the running total or expected
  // amount; only managers/owners get to see those figures and any variance.
  const role = user?.role ?? "owner";
  const isBlindCount = role === "staff";
  const isManager = role === "owner" || role === "manager";
  const location = useLocation();
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [actionType, setActionType] = useState<"cash_in" | "cash_out" | null>(null);
  const [actionAmount, setActionAmount] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [viewingReportId, setViewingReportId] = useState<number | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<number | null>(null);
  const [showDepositSlip, setShowDepositSlip] = useState(false);

  const denomCounter = useDenominationCounter();

  const { data: openSession, isLoading: loadingOpen } = useQuery<CashDrawerSessionWithActions | null>({
    queryKey: [`/api/cash-drawer/open?storeId=${selectedStore?.id}`],
    enabled: !!selectedStore,
  });

  const { data: discrepancies = [] } = useQuery<any[]>({
    queryKey: [`/api/cash-drawer/discrepancies?storeId=${selectedStore?.id}`],
    enabled: !!selectedStore && isManager,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: number; notes: string }) => {
      return apiRequest("POST", `/api/cash-drawer/sessions/${id}/acknowledge-mismatch`, {
        resolvedBy: userName,
        resolutionNotes: notes || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cash-drawer/discrepancies?storeId=${selectedStore?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cash-drawer/sessions?storeId=${selectedStore?.id}`] });
      toast({ title: "Discrepancy acknowledged", description: "The cash variance has been marked as resolved." });
      setResolvingId(null);
      setResolutionNotes("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Could not resolve discrepancy", variant: "destructive" });
    },
  });

  // If we navigated here with ?action=close (e.g. from the Calendar drawer's
  // "Day Close" icon), automatically pop open the close-shift dialog.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("action") === "close" && openSession) {
      setShowCloseDialog(true);
    }
  }, [location.search, openSession]);

  const { data: sessions = [] } = useQuery<CashDrawerSessionWithActions[]>({
    queryKey: [`/api/cash-drawer/sessions?storeId=${selectedStore?.id}`],
    enabled: !!selectedStore,
  });

  const { data: zReport } = useQuery<any>({
    queryKey: [`/api/cash-drawer/sessions/${viewingReportId}/z-report`],
    enabled: !!viewingReportId,
  });

  const { data: liveZReport } = useQuery<any>({
    queryKey: [`/api/cash-drawer/sessions/${openSession?.id}/z-report`],
    enabled: !!openSession && showCloseDialog,
    refetchInterval: false,
  });

  const invalidateDrawerQueries = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/cash-drawer/open?storeId=${selectedStore?.id}`] });
    queryClient.invalidateQueries({ queryKey: [`/api/cash-drawer/sessions?storeId=${selectedStore?.id}`] });
  };

  const openDenomCounter = useDenominationCounter();

  const openDrawerMutation = useMutation({
    mutationFn: async () => {
      const denomData = JSON.stringify(openDenomCounter.counts);
      return apiRequest("POST", "/api/cash-drawer/sessions", {
        storeId: selectedStore!.id,
        openingBalance: openDenomCounter.total.toFixed(2),
        openingDenominationBreakdown: denomData,
        openedBy: userName,
      });
    },
    onSuccess: (res: any) => {
      invalidateDrawerQueries();
      const session = res?.data ?? res;
      const mismatch = session?.priorClosingMismatch;
      toast({
        title: "Drawer opened",
        description: mismatch
          ? "Day open recorded. A discrepancy with the previous day's close was flagged for manager review."
          : "Cash drawer session started.",
      });
      setOpeningAmount("0.00");
      openDenomCounter.reset();
      setShowOpenDialog(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Could not open drawer", variant: "destructive" });
    },
  });

  const closeDrawerMutation = useMutation({
    mutationFn: async () => {
      const denomData = JSON.stringify(denomCounter.counts);
      return apiRequest("POST", `/api/cash-drawer/sessions/${openSession!.id}/close`, {
        closingBalance: denomCounter.total.toFixed(2),
        denominationBreakdown: denomData,
        reportedCardSales: reportedCardSales.trim() ? Number(reportedCardSales).toFixed(2) : null,
        closedBy: userName,
        notes: closeNotes,
      });
    },
    onSuccess: () => {
      const sessionId = openSession!.id;
      invalidateDrawerQueries();
      toast({ title: "Shift closed", description: "Day close completed. Z Report generated." });
      setShowCloseDialog(false);
      setCloseNotes("");
      setReportedCardSales("");
      denomCounter.reset();
      setViewingReportId(sessionId);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Could not close drawer", variant: "destructive" });
    },
  });

  const drawerActionMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/cash-drawer/sessions/${openSession!.id}/action`, {
        type: actionType,
        amount: actionAmount,
        reason: actionReason,
        performedBy: userName,
      });
    },
    onSuccess: () => {
      invalidateDrawerQueries();
      toast({ title: actionType === "cash_in" ? "Cash In recorded" : "Cash Out recorded" });
      setActionType(null);
      setActionAmount("");
      setActionReason("");
    },
  });

  const openDrawerKickMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/cash-drawer/sessions/${openSession!.id}/action`, {
        type: "open_drawer",
        reason: "Manual drawer open",
        performedBy: userName,
      });
    },
    onSuccess: () => {
      invalidateDrawerQueries();
      toast({ title: "Drawer opened", description: "Cash drawer kick signal sent." });
    },
  });

  const closedSessions = useMemo(() => {
    return sessions
      .filter(s => s.status === "closed")
      .sort((a, b) => {
        const aTime = a.closedAt ? new Date(a.closedAt).getTime() : 0;
        const bTime = b.closedAt ? new Date(b.closedAt).getTime() : 0;
        return bTime - aTime;
      });
  }, [sessions]);

  const priorDaySession = closedSessions.length > 0 ? closedSessions[0] : null;

  if (loadingOpen) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>
    );
  }

  return (
    <BusinessDayGate>
    <div className={cn(embedded ? "h-full overflow-auto" : "")}>
      <div className={cn(embedded ? "max-w-5xl mx-auto p-4 sm:p-6 space-y-6" : "max-w-5xl mx-auto p-6 space-y-6")}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold" data-testid="page-title">Cash Drawer</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your cash drawer, record cash movements, and generate Z reports
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {priorDaySession && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setShowDepositSlip(!showDepositSlip)}
                data-testid="button-deposit-slip"
              >
                <Building2 className="w-4 h-4" />
                Deposit Slip
              </Button>
            )}
            {openSession && (
              <Badge variant="outline" className="no-default-active-elevate text-green-600 border-green-300 gap-1.5">
                <Unlock className="w-3.5 h-3.5" />
                Drawer Open
              </Badge>
            )}
            {embedded && onClose && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close cash drawer"
                data-testid="button-close-cash-drawer"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {showDepositSlip && priorDaySession && (
          <DepositSlipView
            session={priorDaySession}
            sessions={closedSessions}
            timezone={timezone}
            onClose={() => setShowDepositSlip(false)}
          />
        )}

        {!openSession ? (
          <Card data-testid="open-drawer-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Lock className="w-5 h-5 text-muted-foreground" />
                Start a New Shift
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Open the cash drawer to begin accepting payments. You'll count each
                denomination in the drawer; the total is recorded for the manager to verify.
              </p>
              <Button
                onClick={() => {
                  openDenomCounter.reset();
                  setShowOpenDialog(true);
                }}
                className="bg-green-600 text-white gap-2"
                data-testid="button-open-drawer"
              >
                <Unlock className="w-4 h-4" />
                Day Open — Count Drawer
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card data-testid="active-session-card">
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Active Session</p>
                    <p className="text-xs text-muted-foreground">
                      Opened {formatInTz(openSession.openedAt, timezone, "MMM d, yyyy 'at' h:mm a")}
                      {openSession.openedBy && ` by ${openSession.openedBy}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Opening balance: ${Number(openSession.openingBalance).toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => openDrawerKickMutation.mutate()}
                      disabled={openDrawerKickMutation.isPending}
                      data-testid="button-kick-drawer"
                    >
                      <Banknote className="w-4 h-4" />
                      Open Drawer
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => setActionType("cash_in")}
                      data-testid="button-cash-in"
                    >
                      <ArrowDownCircle className="w-4 h-4 text-green-600" />
                      Cash In
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => setActionType("cash_out")}
                      data-testid="button-cash-out"
                    >
                      <ArrowUpCircle className="w-4 h-4 text-destructive" />
                      Cash Out
                    </Button>
                    <Button
                      className="gap-2 bg-destructive text-destructive-foreground"
                      onClick={() => {
                        denomCounter.reset();
                        setShowCloseDialog(true);
                      }}
                      data-testid="button-end-shift"
                    >
                      <Lock className="w-4 h-4" />
                      End Shift
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {actionType && (
              <Card data-testid="cash-action-card">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-medium flex items-center gap-2">
                      {actionType === "cash_in" ? (
                        <><ArrowDownCircle className="w-4 h-4 text-green-600" /> Cash In (Paid In)</>
                      ) : (
                        <><ArrowUpCircle className="w-4 h-4 text-destructive" /> Cash Out (Paid Out)</>
                      )}
                    </h3>
                    <Button size="icon" variant="ghost" onClick={() => setActionType(null)} data-testid="button-cancel-action">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex items-end gap-3 flex-wrap">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Amount</label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={actionAmount}
                          onChange={(e) => setActionAmount(e.target.value)}
                          className="pl-9 w-40"
                          data-testid="input-action-amount"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5 flex-1 min-w-[200px]">
                      <label className="text-xs font-medium text-muted-foreground">Reason</label>
                      <Input
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                        placeholder="e.g. Change for register, tip payout..."
                        data-testid="input-action-reason"
                      />
                    </div>
                    <Button
                      onClick={() => drawerActionMutation.mutate()}
                      disabled={!actionAmount || Number(actionAmount) <= 0 || drawerActionMutation.isPending}
                      data-testid="button-submit-action"
                    >
                      {drawerActionMutation.isPending ? "Saving..." : "Record"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {openSession.actions && openSession.actions.length > 0 && (
              <Card data-testid="session-actions-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    Session Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {openSession.actions.map((action) => (
                      <div key={action.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0" data-testid={`action-${action.id}`}>
                        <div className="flex items-center gap-2">
                          {action.type === "open_drawer" && <Unlock className="w-3.5 h-3.5 text-muted-foreground" />}
                          {action.type === "cash_in" && <ArrowDownCircle className="w-3.5 h-3.5 text-green-600" />}
                          {action.type === "cash_out" && <ArrowUpCircle className="w-3.5 h-3.5 text-destructive" />}
                          {action.type === "close_drawer" && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                          <span className="capitalize">{action.type.replace(/_/g, " ")}</span>
                          {action.reason && <span className="text-muted-foreground">- {action.reason}</span>}
                        </div>
                        <div className="flex items-center gap-3">
                          {action.amount && <span className={cn("font-medium", action.type === "cash_in" ? "text-green-600" : action.type === "cash_out" ? "text-destructive" : "")}>
                            {action.type === "cash_out" ? "-" : ""}${Number(action.amount).toFixed(2)}
                          </span>}
                          <span className="text-xs text-muted-foreground">
                            {formatInTz(action.performedAt, timezone, "h:mm a")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {showCloseDialog && (
              <EndShiftDialog
                openSession={openSession}
                denomCounter={denomCounter}
                closeNotes={closeNotes}
                setCloseNotes={setCloseNotes}
                reportedCardSales={reportedCardSales}
                setReportedCardSales={setReportedCardSales}
                onClose={() => setShowCloseDialog(false)}
                onConfirm={() => closeDrawerMutation.mutate()}
                isPending={closeDrawerMutation.isPending}
                timezone={timezone}
                liveZReport={liveZReport}
                blind={isBlindCount}
              />
            )}
          </div>
        )}

        {showOpenDialog && (
          <OpenShiftDialog
            denomCounter={openDenomCounter}
            onClose={() => setShowOpenDialog(false)}
            onConfirm={() => openDrawerMutation.mutate()}
            isPending={openDrawerMutation.isPending}
            blind={isBlindCount}
          />
        )}

        {viewingReportId && zReport && (
          <ZReportView report={zReport} timezone={timezone} onClose={() => setViewingReportId(null)} />
        )}

        {isManager && discrepancies.length > 0 && (
          <Card className="border-destructive/40 bg-destructive/5" data-testid="discrepancies-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5" />
                Cash Discrepancies — {discrepancies.length} unresolved
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                The opening drawer count for these shifts didn't match the prior day's closing balance. Review and acknowledge each one to clear the alert.
              </p>
              {discrepancies.map((s) => {
                const variance = s.priorClosingVariance ? Number(s.priorClosingVariance) : 0;
                const isResolving = resolvingId === s.id;
                return (
                  <div
                    key={s.id}
                    className="border rounded-md p-3 bg-background space-y-2"
                    data-testid={`discrepancy-${s.id}`}
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="text-sm">
                        <div className="font-medium">
                          {formatInTz(s.openedAt, timezone, "MMM d, yyyy 'at' h:mm a")}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Opened by {s.openedBy || "—"} · Counted ${Number(s.openingBalance).toFixed(2)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-mono",
                            variance > 0 ? "text-blue-600 border-blue-300" : "text-destructive border-destructive/40"
                          )}
                        >
                          {variance > 0 ? "+" : ""}${variance.toFixed(2)} {variance > 0 ? "over" : "short"}
                        </Badge>
                        {!isResolving && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setResolvingId(s.id);
                              setResolutionNotes("");
                            }}
                            data-testid={`button-resolve-${s.id}`}
                          >
                            Acknowledge
                          </Button>
                        )}
                      </div>
                    </div>
                    {isResolving && (
                      <div className="space-y-2 pt-1">
                        <Input
                          placeholder="Resolution notes (optional) — e.g. 'Manager added $20 from float'"
                          value={resolutionNotes}
                          onChange={(e) => setResolutionNotes(e.target.value)}
                          data-testid={`input-resolution-notes-${s.id}`}
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => acknowledgeMutation.mutate({ id: s.id, notes: resolutionNotes })}
                            disabled={acknowledgeMutation.isPending}
                            data-testid={`button-confirm-resolve-${s.id}`}
                          >
                            {acknowledgeMutation.isPending ? "Saving..." : "Confirm Acknowledgement"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setResolvingId(null);
                              setResolutionNotes("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {closedSessions.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="w-5 h-5 text-muted-foreground" />
              Shift History
            </h2>
            {closedSessions.map((session) => (
              <Card key={session.id} data-testid={`session-history-${session.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setExpandedHistory(expandedHistory === session.id ? null : session.id)}
                        className="text-muted-foreground"
                        data-testid={`button-expand-session-${session.id}`}
                      >
                        {expandedHistory === session.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <div>
                        <p className="text-sm font-medium">
                          {formatInTz(session.openedAt, timezone, "MMM d, yyyy")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatInTz(session.openedAt, timezone, "h:mm a")} - {session.closedAt ? formatInTz(session.closedAt, timezone, "h:mm a") : "N/A"}
                          {session.openedBy && ` | ${session.openedBy}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right text-xs text-muted-foreground mr-2">
                        <div>Open: ${Number(session.openingBalance).toFixed(2)}</div>
                        {session.closingBalance && <div>Close: ${Number(session.closingBalance).toFixed(2)}</div>}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setViewingReportId(viewingReportId === session.id ? null : session.id)}
                        data-testid={`button-view-report-${session.id}`}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Z Report
                      </Button>
                    </div>
                  </div>
                  {expandedHistory === session.id && session.actions && (
                    <div className="mt-3 pt-3 border-t space-y-1.5">
                      {session.actions.map((action) => (
                        <div key={action.id} className="flex items-center justify-between text-xs py-1">
                          <div className="flex items-center gap-2">
                            {action.type === "open_drawer" && <Unlock className="w-3 h-3 text-muted-foreground" />}
                            {action.type === "cash_in" && <ArrowDownCircle className="w-3 h-3 text-green-600" />}
                            {action.type === "cash_out" && <ArrowUpCircle className="w-3 h-3 text-destructive" />}
                            {action.type === "close_drawer" && <Lock className="w-3 h-3 text-muted-foreground" />}
                            <span className="capitalize">{action.type.replace(/_/g, " ")}</span>
                            {action.reason && <span className="text-muted-foreground">- {action.reason}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            {action.amount && <span className={cn("font-medium", action.type === "cash_in" ? "text-green-600" : action.type === "cash_out" ? "text-destructive" : "")}>
                              ${Number(action.amount).toFixed(2)}
                            </span>}
                            <span className="text-muted-foreground">
                              {formatInTz(action.performedAt, timezone, "h:mm a")}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
    </BusinessDayGate>
  );
}

function EndShiftDialog({
  openSession,
  denomCounter,
  closeNotes,
  setCloseNotes,
  reportedCardSales,
  setReportedCardSales,
  onClose,
  onConfirm,
  isPending,
  timezone,
  liveZReport,
  blind = false,
}: {
  openSession: CashDrawerSessionWithActions;
  denomCounter: ReturnType<typeof useDenominationCounter>;
  closeNotes: string;
  setCloseNotes: (v: string) => void;
  reportedCardSales: string;
  setReportedCardSales: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
  timezone: string;
  liveZReport?: any;
  blind?: boolean;
}) {
  const cardSales = liveZReport?.paymentBreakdown?.card ?? 0;
  const reportedNum = reportedCardSales.trim() ? Number(reportedCardSales) : null;
  const cardVariance = reportedNum !== null && Number.isFinite(reportedNum)
    ? Math.round((reportedNum - cardSales) * 100) / 100
    : null;
  const expectedCash = liveZReport?.expectedCash ?? null;
  const cashSales = liveZReport?.paymentBreakdown?.cash ?? 0;
  const countedTotal = denomCounter.total;
  const variance = expectedCash !== null ? countedTotal - expectedCash : null;
  const enteredCount = Object.values(denomCounter.counts).reduce(
    (acc, c) => acc + (Number(c) > 0 ? 1 : 0),
    0,
  );
  const canSubmit = blind ? enteredCount > 0 : countedTotal > 0;

  return (
    <Card className="border-destructive/30" data-testid="close-dialog-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            End Shift / Day Close
          </CardTitle>
          <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-cancel-close">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          {blind
            ? "Count each denomination in the cash drawer and enter how many you have. Don't worry about the total — your manager will reconcile it."
            : "Count each denomination in the cash drawer. The total will be calculated automatically."}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Bills</div>
            {DENOMINATIONS.filter(d => d.value >= 1).map(d => (
              <DenominationRow
                key={d.key}
                label={d.label}
                denomValue={d.value}
                count={denomCounter.counts[d.key] || 0}
                onChange={(count) => denomCounter.setCount(d.key, count)}
                denomKey={d.key}
                hideSubtotal={blind}
              />
            ))}
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Coins</div>
            {DENOMINATIONS.filter(d => d.value < 1).map(d => (
              <DenominationRow
                key={d.key}
                label={d.label}
                denomValue={d.value}
                count={denomCounter.counts[d.key] || 0}
                onChange={(count) => denomCounter.setCount(d.key, count)}
                denomKey={d.key}
                hideSubtotal={blind}
              />
            ))}
          </div>
        </div>

        {!blind && (
          <div className="border-t pt-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-muted/50 rounded-md p-3 space-y-1">
                <p className="text-xs text-muted-foreground">Counted Total</p>
                <p className="text-xl font-bold" data-testid="text-counted-total">
                  ${countedTotal.toFixed(2)}
                </p>
              </div>
              <div className="bg-muted/50 rounded-md p-3 space-y-1">
                <p className="text-xs text-muted-foreground">Expected in Drawer</p>
                <p className="text-xl font-bold text-muted-foreground" data-testid="text-expected-cash">
                  {expectedCash !== null ? `$${expectedCash.toFixed(2)}` : "Loading..."}
                </p>
                <p className="text-[10px] text-muted-foreground">Open + Cash Sales + In - Out</p>
              </div>
              <div className="bg-muted/50 rounded-md p-3 space-y-1">
                <p className="text-xs text-muted-foreground">Variance</p>
                <p className={cn("text-xl font-bold", variance === null ? "text-muted-foreground" : variance === 0 ? "text-green-600" : variance > 0 ? "text-blue-600" : "text-destructive")} data-testid="text-variance">
                  {countedTotal === 0 || variance === null ? "---" : variance === 0 ? "Even" : variance > 0 ? `+$${variance.toFixed(2)}` : `-$${Math.abs(variance).toFixed(2)}`}
                </p>
                {countedTotal > 0 && variance !== null && variance !== 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    {variance > 0 ? "Over" : "Short"}
                  </p>
                )}
              </div>
            </div>
            {liveZReport && cashSales > 0 && (
              <p className="text-xs text-muted-foreground">
                Includes ${cashSales.toFixed(2)} in cash sales from {liveZReport.transactionCount} transaction(s)
              </p>
            )}
          </div>
        )}

        <div className="border-t pt-4 space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Credit Card Sales (from terminal report)
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={reportedCardSales}
                onChange={(e) => setReportedCardSales(e.target.value)}
                className="pl-9 w-40"
                data-testid="input-reported-card-sales"
              />
            </div>
            {!blind && reportedNum !== null && (
              <span className="text-xs text-muted-foreground">
                System recorded: <span className="font-medium text-foreground">${cardSales.toFixed(2)}</span>
                {cardVariance !== null && cardVariance !== 0 && (
                  <span className={cn("ml-2 font-medium", cardVariance > 0 ? "text-blue-600" : "text-destructive")}>
                    ({cardVariance > 0 ? "+" : ""}${cardVariance.toFixed(2)} {cardVariance > 0 ? "over" : "short"})
                  </span>
                )}
                {cardVariance === 0 && (
                  <span className="ml-2 font-medium text-green-600">(matches)</span>
                )}
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Enter the total credit/debit card sales from your terminal's end-of-day batch report.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
          <Input
            value={closeNotes}
            onChange={(e) => setCloseNotes(e.target.value)}
            placeholder="Any notes about this shift..."
            data-testid="input-close-notes"
          />
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button
            className="gap-2 bg-destructive text-destructive-foreground"
            onClick={onConfirm}
            disabled={isPending || !canSubmit}
            data-testid="button-confirm-close"
          >
            <Lock className="w-4 h-4" />
            {isPending ? "Closing..." : blind ? "Submit Day Close Count" : "Close Drawer & Generate Z Report"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OpenShiftDialog({
  denomCounter,
  onClose,
  onConfirm,
  isPending,
  blind = false,
}: {
  denomCounter: ReturnType<typeof useDenominationCounter>;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
  blind?: boolean;
}) {
  const countedTotal = denomCounter.total;
  const enteredCount = Object.values(denomCounter.counts).reduce(
    (acc, c) => acc + (Number(c) > 0 ? 1 : 0),
    0,
  );
  const canSubmit = blind ? enteredCount > 0 : countedTotal >= 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      data-testid="open-shift-dialog-overlay"
    >
      <Card
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto border-green-500/30"
        onClick={(e) => e.stopPropagation()}
        data-testid="open-shift-dialog"
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Unlock className="w-5 h-5 text-green-600" />
              Day Open — Count Drawer
            </CardTitle>
            <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-cancel-open">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            {blind
              ? "Count each denomination in the cash drawer and enter how many you have. Don't worry about the total — your manager will reconcile any discrepancy with yesterday's close."
              : "Count each denomination in the cash drawer. The opening total is recorded for the shift."}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0">
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Bills</div>
              {DENOMINATIONS.filter(d => d.value >= 1).map(d => (
                <DenominationRow
                  key={d.key}
                  label={d.label}
                  denomValue={d.value}
                  count={denomCounter.counts[d.key] || 0}
                  onChange={(count) => denomCounter.setCount(d.key, count)}
                  denomKey={d.key}
                  hideSubtotal={blind}
                />
              ))}
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Coins</div>
              {DENOMINATIONS.filter(d => d.value < 1).map(d => (
                <DenominationRow
                  key={d.key}
                  label={d.label}
                  denomValue={d.value}
                  count={denomCounter.counts[d.key] || 0}
                  onChange={(count) => denomCounter.setCount(d.key, count)}
                  denomKey={d.key}
                  hideSubtotal={blind}
                />
              ))}
            </div>
          </div>

          {!blind && (
            <div className="border-t pt-4">
              <div className="bg-muted/50 rounded-md p-3 space-y-1 inline-block">
                <p className="text-xs text-muted-foreground">Opening Total</p>
                <p className="text-xl font-bold" data-testid="text-open-counted-total">
                  ${countedTotal.toFixed(2)}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <Button
              className="gap-2 bg-green-600 text-white"
              onClick={onConfirm}
              disabled={isPending || !canSubmit}
              data-testid="button-confirm-open"
            >
              <Unlock className="w-4 h-4" />
              {isPending ? "Opening..." : blind ? "Submit Day Open Count" : "Open Drawer"}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DenominationRow({
  label,
  denomValue,
  count,
  onChange,
  denomKey,
  hideSubtotal = false,
}: {
  label: string;
  denomValue: number;
  count: number;
  onChange: (count: number) => void;
  denomKey: string;
  hideSubtotal?: boolean;
}) {
  const subtotal = Math.round(count * denomValue * 100) / 100;

  return (
    <div className="flex items-center gap-2 py-1.5 border-b last:border-0">
      <span className="text-sm flex-1 min-w-[120px]">{label}</span>
      <Input
        type="number"
        min="0"
        value={count || ""}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-20 text-center"
        placeholder="0"
        data-testid={`input-denom-${denomKey}`}
      />
      {!hideSubtotal && (
        <span className="text-sm font-medium w-20 text-right tabular-nums" data-testid={`text-denom-subtotal-${denomKey}`}>
          ${subtotal.toFixed(2)}
        </span>
      )}
    </div>
  );
}

function DepositSlipView({
  session,
  sessions,
  timezone,
  onClose,
}: {
  session: CashDrawerSessionWithActions;
  sessions: CashDrawerSessionWithActions[];
  timezone: string;
  onClose: () => void;
}) {
  const { data: depositZReport } = useQuery<any>({
    queryKey: [`/api/cash-drawer/sessions/${session.id}/z-report`],
    enabled: !!session.id,
  });

  const closingBal = Number(session.closingBalance) || 0;
  const openingBal = Number(session.openingBalance) || 0;

  const cashSales = depositZReport?.paymentBreakdown?.cash ?? 0;
  const cashIn = depositZReport?.cashIn ?? 0;
  const cashOut = depositZReport?.cashOut ?? 0;

  const depositAmount = Math.max(0, cashSales + cashIn - cashOut);

  let denomData: Record<string, number> | null = null;
  if (session.denominationBreakdown) {
    try {
      denomData = JSON.parse(session.denominationBreakdown);
    } catch {
      denomData = null;
    }
  }

  return (
    <Card className="border-2" data-testid="deposit-slip-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Cash Deposit Slip
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()} data-testid="button-print-deposit">
              <Printer className="w-3.5 h-3.5" />
              Print
            </Button>
            <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-deposit">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Prior shift: {formatInTz(session.openedAt, timezone, "EEEE, MMMM d, yyyy")}
          {" | "}
          {formatInTz(session.openedAt, timezone, "h:mm a")} - {session.closedAt ? formatInTz(session.closedAt, timezone, "h:mm a") : "N/A"}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-muted/50 rounded-md p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Deposit Amount</p>
          <p className="text-3xl font-bold" data-testid="text-deposit-amount">${depositAmount.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground mt-1">Cash revenue to be deposited at bank</p>
        </div>

        <div className="space-y-2 text-sm">
          <h4 className="font-medium">Deposit Calculation</h4>
          <div className="flex justify-between py-1 border-b">
            <span className="text-muted-foreground">Cash Sales</span>
            <span>${cashSales.toFixed(2)}</span>
          </div>
          {cashIn > 0 && (
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Plus: Cash In (Paid In)</span>
              <span>+${cashIn.toFixed(2)}</span>
            </div>
          )}
          {cashOut > 0 && (
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Less: Cash Out (Paid Out)</span>
              <span>-${cashOut.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between py-1 font-semibold">
            <span>Net Cash Revenue (Deposit)</span>
            <span data-testid="text-deposit-net">${depositAmount.toFixed(2)}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Opening float of ${openingBal.toFixed(2)} stays in drawer for next shift
          </p>
        </div>

        {denomData && Object.keys(denomData).length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Denomination Breakdown (from close count)</h4>
            <div className="text-sm space-y-1">
              {DENOMINATIONS.filter(d => (denomData![d.key] || 0) > 0).map(d => {
                const cnt = denomData![d.key] || 0;
                const sub = Math.round(cnt * d.value * 100) / 100;
                return (
                  <div key={d.key} className="flex justify-between py-0.5 text-xs" data-testid={`deposit-denom-${d.key}`}>
                    <span className="text-muted-foreground">{d.label} x {cnt}</span>
                    <span>${sub.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="border-t pt-3 space-y-1.5 text-xs text-muted-foreground">
          <p>Shift opened by: {session.openedBy || "Unknown"}</p>
          <p>Shift closed by: {session.closedBy || "Unknown"}</p>
          {session.notes && <p>Notes: {session.notes}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function ZReportView({
  report,
  timezone,
  onClose,
}: {
  report: any;
  timezone: string;
  onClose: () => void;
}) {
  const session = report.session;
  const closingBal = Number(session.closingBalance) || 0;
  const variance = closingBal - report.expectedCash;

  let denomData: Record<string, number> | null = null;
  if (session.denominationBreakdown) {
    try {
      denomData = JSON.parse(session.denominationBreakdown);
    } catch {
      denomData = null;
    }
  }

  return (
    <Card className="border-2" data-testid="z-report-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Z Report
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()} data-testid="button-print-zreport">
              <Printer className="w-3.5 h-3.5" />
              Print
            </Button>
            <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-zreport">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {formatInTz(session.openedAt, timezone, "EEEE, MMMM d, yyyy")}
          {" | "}
          {formatInTz(session.openedAt, timezone, "h:mm a")} - {session.closedAt ? formatInTz(session.closedAt, timezone, "h:mm a") : "Current"}
        </p>
        {session.openedBy && (
          <p className="text-xs text-muted-foreground">
            Opened by {session.openedBy}{session.closedBy ? ` | Closed by ${session.closedBy}` : ""}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-muted/50 rounded-md p-3 space-y-1">
            <p className="text-xs text-muted-foreground">Transactions</p>
            <p className="text-xl font-bold" data-testid="zr-transaction-count">{report.transactionCount}</p>
          </div>
          <div className="bg-muted/50 rounded-md p-3 space-y-1">
            <p className="text-xs text-muted-foreground">Total Sales</p>
            <p className="text-xl font-bold" data-testid="zr-total-sales">${report.totalSales.toFixed(2)}</p>
          </div>
          <div className="bg-muted/50 rounded-md p-3 space-y-1">
            <p className="text-xs text-muted-foreground">Total Tips</p>
            <p className="text-xl font-bold" data-testid="zr-total-tips">${report.totalTips.toFixed(2)}</p>
          </div>
        </div>

        {report.totalDiscounts > 0 && (
          <div className="flex items-center justify-between text-sm bg-muted/30 rounded-md p-3">
            <span className="text-muted-foreground">Total Discounts</span>
            <span className="font-medium text-green-600" data-testid="zr-total-discounts">-${report.totalDiscounts.toFixed(2)}</span>
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-sm font-medium">Payment Method Breakdown</h4>
          {Object.keys(report.paymentBreakdown).length > 0 ? (
            <div className="space-y-1.5">
              {Object.entries(report.paymentBreakdown).map(([method, amount]) => (
                <div key={method} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0" data-testid={`zr-payment-${method}`}>
                  <div className="flex items-center gap-2">
                    {method === "cash" && <Banknote className="w-4 h-4 text-green-600" />}
                    {method === "card" && <CreditCard className="w-4 h-4 text-blue-600" />}
                    {method === "mobile" && <Smartphone className="w-4 h-4 text-purple-600" />}
                    {!["cash", "card", "mobile"].includes(method) && <DollarSign className="w-4 h-4 text-muted-foreground" />}
                    <span className="capitalize">{method}</span>
                  </div>
                  <span className="font-medium">${(amount as number).toFixed(2)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No transactions recorded</p>
          )}
        </div>

        <div className="border-t pt-3 space-y-2">
          <h4 className="text-sm font-medium">Cash Reconciliation</h4>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Opening Balance</span>
              <span>${Number(session.openingBalance).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cash Sales</span>
              <span>${(report.paymentBreakdown["cash"] || 0).toFixed(2)}</span>
            </div>
            {report.cashIn > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Cash In (Paid In)</span>
                <span>+${report.cashIn.toFixed(2)}</span>
              </div>
            )}
            {report.cashOut > 0 && (
              <div className="flex justify-between text-destructive">
                <span>Cash Out (Paid Out)</span>
                <span>-${report.cashOut.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold pt-1 border-t">
              <span>Expected Cash in Drawer</span>
              <span data-testid="zr-expected-cash">${report.expectedCash.toFixed(2)}</span>
            </div>
            {session.closingBalance && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Actual Cash Count</span>
                  <span data-testid="zr-actual-cash">${closingBal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Variance (Over/Short)</span>
                  <span className={cn(
                    variance === 0 ? "text-green-600" : variance > 0 ? "text-blue-600" : "text-destructive"
                  )} data-testid="zr-variance">
                    {variance === 0 ? "Even" : variance > 0 ? `+$${variance.toFixed(2)} Over` : `-$${Math.abs(variance).toFixed(2)} Short`}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {denomData && Object.keys(denomData).length > 0 && (
          <div className="border-t pt-3 space-y-2">
            <h4 className="text-sm font-medium">Denomination Count</h4>
            <div className="grid grid-cols-2 gap-x-4 text-xs">
              {DENOMINATIONS.filter(d => (denomData![d.key] || 0) > 0).map(d => {
                const cnt = denomData![d.key] || 0;
                const sub = Math.round(cnt * d.value * 100) / 100;
                return (
                  <div key={d.key} className="flex justify-between py-0.5 border-b" data-testid={`zr-denom-${d.key}`}>
                    <span className="text-muted-foreground">{d.label} x {cnt}</span>
                    <span className="font-medium">${sub.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {session.notes && (
          <div className="bg-muted/30 rounded-md p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
            <p className="text-sm">{session.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
