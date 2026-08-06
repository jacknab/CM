import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DollarSign, LockOpen } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { CashDrawerSessionWithActions } from "@shared/schema";

interface OpenRegisterModalProps {
  open: boolean;
  onClose: () => void;
  storeId: number;
  userName: string;
}

export function OpenRegisterModal({ open, onClose, storeId, userName }: OpenRegisterModalProps) {
  const { toast } = useToast();
  const [openingAmount, setOpeningAmount] = useState("");

  const { data: openSession, isLoading: sessionLoading } = useQuery<CashDrawerSessionWithActions | null>({
    queryKey: [`/api/cash-drawer/open?storeId=${storeId}`],
    enabled: open && !!storeId,
  });

  // Check if this is the initial setup (no sessions exist yet for this store)
  const { data: allSessions, isLoading: historyLoading } = useQuery<any[]>({
    queryKey: [`/api/cash-drawer/sessions?storeId=${storeId}`],
    enabled: open && !!storeId && !openSession,
  });

  const isInitialSetup = !openSession && Array.isArray(allSessions) && allSessions.length === 0;
  const isLoading = sessionLoading || historyLoading;

  const openDrawerMutation = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(openingAmount || "0").toFixed(2);
      const res = await apiRequest("POST", "/api/cash-drawer/sessions", {
        storeId,
        openingBalance: amount,
        openedBy: userName,
        isInitialSetup,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Could not open register");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cash-drawer/open?storeId=${storeId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/cash-drawer/sessions?storeId=${storeId}`] });
      toast({
        title: "Register opened",
        description: isInitialSetup
          ? "Starting balance saved. Register is ready for the day."
          : "Cash drawer session started for the day.",
      });
      setOpeningAmount("");
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Could not open register", variant: "destructive" });
    },
  });

  const alreadyOpen = !!openSession;

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9.]/g, "");
    setOpeningAmount(val);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    openDrawerMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center">
              <LockOpen className="w-4.5 h-4.5 text-emerald-600" />
            </div>
            <DialogTitle className="text-lg">Open Register</DialogTitle>
          </div>
          <DialogDescription>
            {alreadyOpen
              ? "The register is already open for today."
              : isInitialSetup
              ? "Enter the opening cash amount to start the day."
              : "Enter the opening cash amount to start the day."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Checking register status…</div>
        ) : alreadyOpen ? (
          <div className="pt-2 pb-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              A cash drawer session is already open. No action needed.
            </p>
            <Button className="w-full" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="opening-amount">Opening Amount</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="opening-amount"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={openingAmount}
                  onChange={handleAmountChange}
                  className="pl-8 text-lg font-semibold"
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground">Count the cash in the drawer and enter the total.</p>
              {isInitialSetup && (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                  This amount becomes your starting cash balance. The day close report will show how much to deposit daily.
                </p>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              {isInitialSetup && (
                <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
                  Skip
                </Button>
              )}
              <Button
                type="submit"
                className={isInitialSetup ? "flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" : "w-full bg-emerald-600 hover:bg-emerald-700 text-white"}
                disabled={openDrawerMutation.isPending}
              >
                {openDrawerMutation.isPending ? "Opening…" : "Open Register"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
