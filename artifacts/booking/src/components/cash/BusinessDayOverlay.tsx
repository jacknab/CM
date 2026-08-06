import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSelectedStore } from "@/hooks/use-store";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatInTz } from "@/lib/timezone";
import { AlertTriangle, Sun, Unlock, DollarSign, Lock } from "lucide-react";
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

function useDenominationCounter() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const setCount = (key: string, count: number) => setCounts(prev => ({ ...prev, [key]: count }));
  const total = useMemo(() => {
    return DENOMINATIONS.reduce((sum, d) => sum + Math.round((counts[d.key] || 0) * d.value * 100) / 100, 0);
  }, [counts]);
  const reset = () => setCounts({});
  return { counts, setCount, total, reset };
}

function DenominationRow({ label, count, onChange }: { label: string; count: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Input
        type="number"
        min="0"
        value={count || ""}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-20 h-8 text-right"
        placeholder="0"
      />
    </div>
  );
}

interface BusinessDayToday {
  today: {
    id: number;
    storeId: number;
    date: string;
    status: "not_started" | "open" | "pending_reconciliation" | "reconciled";
    openingFloat: string | null;
  };
  previousUnreconciled: {
    id: number;
    date: string;
    status: string;
    openingFloat: string | null;
  } | null;
  timezone: string;
}

export function useBusinessDayToday(enabled: boolean) {
  const { selectedStore } = useSelectedStore();
  return useQuery<BusinessDayToday>({
    queryKey: [`/api/cash-drawer/today?storeId=${selectedStore?.id}`],
    enabled: enabled && !!selectedStore,
  });
}

/**
 * Business Day gate for /cash-drawer. Runs the spec's morning/login decision
 * tree: reconcile-blocking overlay for a stale unreconciled day, or a
 * dismissible "Good Morning" + explicit "Open Business Day Cash Drawer"
 * button when yesterday is already clean. Renders `children` only once the
 * Business Day is OPEN (or already reconciled/open — anything past the
 * gating decision), so the rest of the page (session UI, POS, etc.) never
 * shows while a prior day's cash is unaccounted for.
 */
export function BusinessDayGate({ children }: { children: React.ReactNode }) {
  const { selectedStore } = useSelectedStore();
  const { user } = useAuth();
  const { toast } = useToast();
  const userName = user?.firstName || user?.email || "Staff";
  const timezone = selectedStore?.timezone || "UTC";

  const { data, isLoading } = useBusinessDayToday(true);
  const [dismissedGoodMorning, setDismissedGoodMorning] = useState(false);

  const reconcileDenoms = useDenominationCounter();

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/cash-drawer/business-day/${data!.previousUnreconciled!.id}/reconcile`, {
        countedCash: reconcileDenoms.total.toFixed(2),
        denominationBreakdown: JSON.stringify(reconcileDenoms.counts),
        reconciledBy: userName,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cash-drawer/today?storeId=${selectedStore?.id}`] });
      toast({ title: "Business Day reconciled", description: "Yesterday's cash count has been recorded." });
      reconcileDenoms.reset();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Could not reconcile Business Day", variant: "destructive" });
    },
  });

  const openMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/cash-drawer/business-day/${data!.today.id}/open`, {
        openedBy: userName,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cash-drawer/today?storeId=${selectedStore?.id}`] });
      toast({ title: "Business Day opened", description: "Cash drawer transactions are now unlocked." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Could not open Business Day", variant: "destructive" });
    },
  });

  if (isLoading || !data) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  }

  // OVERLAY TYPE A — full-screen blocking reconciliation for an unreconciled prior day.
  if (data.previousUnreconciled) {
    const prev = data.previousUnreconciled;
    const expectedNote = "The system will calculate expected cash and any over/short once you submit your count.";
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="overlay-reconcile-blocking">
        <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto border-destructive/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Yesterday needs to be reconciled
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Business Day: {formatInTz(new Date(`${prev.date}T12:00:00`), timezone, "MMMM d, yyyy")}
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm text-muted-foreground">
              You must complete reconciliation before starting today. Count the cash currently in the drawer.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0">
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Bills</div>
                {DENOMINATIONS.filter(d => d.value >= 1).map(d => (
                  <DenominationRow
                    key={d.key}
                    label={d.label}
                    count={reconcileDenoms.counts[d.key] || 0}
                    onChange={(count) => reconcileDenoms.setCount(d.key, count)}
                  />
                ))}
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Coins</div>
                {DENOMINATIONS.filter(d => d.value < 1).map(d => (
                  <DenominationRow
                    key={d.key}
                    label={d.label}
                    count={reconcileDenoms.counts[d.key] || 0}
                    onChange={(count) => reconcileDenoms.setCount(d.key, count)}
                  />
                ))}
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="bg-muted/50 rounded-md p-3 space-y-1 inline-block">
                <p className="text-xs text-muted-foreground">Counted Total</p>
                <p className="text-xl font-bold" data-testid="text-reconcile-counted-total">
                  ${reconcileDenoms.total.toFixed(2)}
                </p>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">{expectedNote}</p>
            </div>

            <Button
              className="gap-2 bg-destructive text-destructive-foreground"
              onClick={() => reconcileMutation.mutate()}
              disabled={reconcileMutation.isPending}
              data-testid="button-confirm-reconcile"
            >
              <Lock className="w-4 h-4" />
              {reconcileMutation.isPending ? "Reconciling..." : "Confirm & Mark Day as Reconciled"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // OVERLAY TYPE B — dismissible "Good Morning" + explicit Open button.
  if (data.today.status === "not_started" && !dismissedGoodMorning) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-testid="overlay-good-morning">
        <Card className="w-full max-w-md border-green-500/30">
          <CardHeader className="pb-2 text-center">
            <CardTitle className="text-xl flex items-center justify-center gap-2">
              <Sun className="w-6 h-6 text-amber-500" />
              Good Morning
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Business Day: {formatInTz(new Date(`${data.today.date}T12:00:00`), timezone, "MMMM d, yyyy")}
            </p>
          </CardHeader>
          <CardContent className="space-y-5 text-center">
            <p className="text-sm text-muted-foreground">
              Yesterday's books are clean. Click below when you're ready to start accepting payments today.
            </p>
            <Button
              onClick={() => openMutation.mutate()}
              disabled={openMutation.isPending}
              className="gap-2 bg-green-600 text-white w-full"
              data-testid="button-open-business-day"
            >
              <Unlock className="w-4 h-4" />
              {openMutation.isPending ? "Opening..." : "Open Business Day Cash Drawer"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
