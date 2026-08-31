import { useState, useEffect } from "react";
import { PaymentsDashboard } from "@/pages/manage/PaymentsDashboard";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useSelectedStore } from "@/hooks/use-store";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  CreditCard, CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  ExternalLink, Loader2, Wifi, Building2, Globe,
  TrendingUp, Clock, Users, Zap, Calendar
} from "lucide-react";

interface ExpressSettings {
  contractorExpressEnabled: boolean;
  contractorPayoutMode: "manual" | "instant";
  stripeConnected: boolean;
}

interface PaymentStatus {
  connected: boolean;
  providerAccountId?: string;
  status?: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  displayName?: string;
  email?: string;
  country?: string;
  currency?: string;
  lastSyncAt?: string;
}

interface BalanceEntry {
  amount: number;
  currency: string;
}

interface AccountBalance {
  available: BalanceEntry[];
  pending:   BalanceEntry[];
  fetchedAt: string;
}

function formatCents(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount / 100);
}

export default function PaymentSettings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedStore } = useSelectedStore();
  const [searchParams] = useSearchParams();
  const [isConnecting, setIsConnecting] = useState(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [expressSaving, setExpressSaving] = useState(false);

  const redirectToAuth = () => {
    navigate("/auth?redirect=/manage/payment-settings", { replace: true });
  };

  const fetchWithAuth = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await fetch(input, { credentials: "include", ...(init ?? {}) });
    if (res.status === 401) {
      redirectToAuth();
      throw new Error("Your session expired. Please sign in again.");
    }
    return res;
  };

  // Show toast on return from Stripe OAuth
  useEffect(() => {
    if (searchParams.get("connect_success") === "1") {
      toast({ title: "Stripe connected!", description: "Your Stripe account is now linked. Payments will flow directly to your account." });
      queryClient.invalidateQueries({ queryKey: ["/api/payments/stripe/status"] });
    } else if (searchParams.get("connect_error")) {
      const err = searchParams.get("connect_error");
      toast({
        title: "Stripe connection failed",
        description: err === "access_denied" ? "You declined the Stripe connection." : `Error: ${err}`,
        variant: "destructive",
      });
    }
  }, [searchParams]);

  const { data: status, isLoading } = useQuery<PaymentStatus>({
    queryKey: ["/api/payments/stripe/status"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/payments/stripe/status");
      if (!res.ok) throw new Error("Failed to fetch payment status");
      return res.json();
    },
    refetchInterval: (query) => {
      const d = query.state.data as PaymentStatus | undefined;
      return d?.connected && (!d?.chargesEnabled || !d?.payoutsEnabled) ? 30000 : false;
    },
  });

  const { data: balance, isLoading: balanceLoading, refetch: refetchBalance, dataUpdatedAt: balanceUpdatedAt } = useQuery<AccountBalance>({
    queryKey: ["/api/payments/stripe/balance"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/payments/stripe/balance");
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to fetch balance");
      }
      return res.json();
    },
    enabled: !!(status?.connected && status?.chargesEnabled),
    staleTime: 60_000,
    retry: false,
  });

  const { data: expressSettings, isLoading: expressLoading } = useQuery<ExpressSettings>({
    queryKey: ["/api/payments/stripe/express-settings"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/payments/stripe/express-settings");
      if (!res.ok) throw new Error("Failed to fetch express settings");
      return res.json();
    },
  });

  const saveExpressSettings = async (patch: Partial<ExpressSettings>) => {
    setExpressSaving(true);
    try {
      const res = await fetchWithAuth("/api/payments/stripe/express-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to save");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/payments/stripe/express-settings"] });
      toast({ title: "Settings saved" });
    } catch (err: Error | unknown) {
      toast({
        title: "Failed to save settings",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setExpressSaving(false);
    }
  };

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth("/api/payments/stripe/connect");
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Failed to start Stripe connection");
      }
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err: Error) => {
      toast({ title: "Connection failed", description: err.message, variant: "destructive" });
      setIsConnecting(false);
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth("/api/payments/stripe/sync", { method: "POST" });
      if (!res.ok) throw new Error("Sync failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments/stripe/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments/stripe/balance"] });
      toast({ title: "Account synced", description: "Latest account status pulled from Stripe." });
    },
    onError: () => toast({ title: "Sync failed", variant: "destructive" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetchWithAuth("/api/payments/stripe/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Disconnect failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments/stripe/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments/stripe/balance"] });
      toast({ title: "Stripe disconnected", description: "Your Stripe account has been unlinked. Historical transactions are preserved." });
    },
    onError: () => toast({ title: "Disconnect failed", variant: "destructive" }),
  });

  const handleConnect = () => {
    setIsConnecting(true);
    connectMutation.mutate();
  };

  const needsVerification = status?.connected && (!status.chargesEnabled || !status.payoutsEnabled);
  const fullyEnabled = status?.connected && status.chargesEnabled && status.payoutsEnabled;

  // Sum all currencies, fallback to primary currency
  const totalAvailable = balance?.available?.[0];
  const totalPending   = balance?.pending?.[0];
  const lastFetched    = balanceUpdatedAt ? new Date(balanceUpdatedAt) : null;

  return (
    <AppLayout>
      <div className={`${status?.connected ? "max-w-4xl" : "max-w-2xl"} mx-auto px-4 py-6 space-y-4`}>
        {/* Page title */}
        <div className="mb-2">
          <h1 className="text-2xl font-bold text-slate-800">Payments &amp; Payouts</h1>
          <p className="text-slate-500 mt-1 text-sm">
            {status?.connected
              ? "Your salon's payments, transactions, refunds and payouts — without leaving Certxa."
              : "Connect Stripe to accept card payments and manage payouts from here."}
          </p>
        </div>

        {/* ── Financial dashboard (shown once Stripe is connected) ── */}
        {status?.connected && !isLoading && (
          <div className="mb-2">
            <PaymentsDashboard />
          </div>
        )}

        {/* Onboarding blurb — only before connecting */}
        {!status?.connected && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                  <CreditCard className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <CardTitle className="text-base">Stripe Connect</CardTitle>
                  <CardDescription className="text-sm mt-0.5">
                    Connect your own Stripe account to accept card payments — Visa, Mastercard, Apple Pay,
                    and Google Pay. Money flows directly into your bank account. Certxa never touches your client payments.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        )}

        {status?.connected && (
          <h2 className="pt-4 text-sm font-bold uppercase tracking-wider text-slate-500">Stripe account &amp; card reader</h2>
        )}

        {/* Status card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Connection Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading…</span>
              </div>
            ) : status?.connected ? (
              <>
                {/* Connected state */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {fullyEnabled ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                    )}
                    <span className="font-semibold">
                      {fullyEnabled ? "Connected & Ready" : "Connected — Verification Required"}
                    </span>
                  </div>
                  <Badge variant={fullyEnabled ? "default" : "secondary"}>
                    {fullyEnabled ? "Active" : "Pending"}
                  </Badge>
                </div>

                {needsVerification && (
                  <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-sm">
                    <p className="font-medium text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" /> Additional verification required
                    </p>
                    <p className="text-amber-700 dark:text-amber-400 mt-1">
                      Your Stripe account needs more information before it can accept charges or send payouts.
                      Log in to your Stripe dashboard to complete setup.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {status.chargesEnabled
                        ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                        : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                      <span className="text-muted-foreground">Charges enabled</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {status.payoutsEnabled
                        ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                        : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                      <span className="text-muted-foreground">Payouts enabled</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {status.detailsSubmitted
                        ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                        : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                      <span className="text-muted-foreground">Details submitted</span>
                    </div>
                  </div>
                  <div className="space-y-2 text-right">
                    {status.displayName && (
                      <div className="flex items-center justify-end gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-foreground font-medium truncate">{status.displayName}</span>
                      </div>
                    )}
                    {status.country && (
                      <div className="flex items-center justify-end gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">{status.country.toUpperCase()} · {status.currency?.toUpperCase()}</span>
                      </div>
                    )}
                    {status.providerAccountId && (
                      <div className="flex items-center justify-end gap-1.5">
                        <Wifi className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground font-mono text-xs">{status.providerAccountId}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => syncMutation.mutate()}
                    disabled={syncMutation.isPending}
                  >
                    {syncMutation.isPending
                      ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                    Sync Status
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open("https://dashboard.stripe.com", "_blank")}
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                    Stripe Dashboard
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleConnect}
                    disabled={isConnecting || connectMutation.isPending}
                  >
                    {isConnecting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                    Reconnect
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setShowDisconnectDialog(true)}
                    disabled={disconnectMutation.isPending}
                  >
                    {disconnectMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                    Disconnect
                  </Button>
                </div>
              </>
            ) : (
              /* Not connected state */
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <XCircle className="w-5 h-5" />
                  <span className="font-medium">Not connected</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Connect your Stripe account to start accepting card payments from clients at checkout.
                  If you don't have a Stripe account, you'll be able to create one during the setup.
                </p>
                <Button
                  onClick={handleConnect}
                  disabled={isConnecting || connectMutation.isPending}
                  className="w-full"
                >
                  {isConnecting || connectMutation.isPending
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Connecting…</>
                    : <><CreditCard className="w-4 h-4 mr-2" /> Connect Stripe Account</>}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Live Balance panel — only shown when connected & charges enabled */}
        {status?.connected && status?.chargesEnabled && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Live Balance
                </CardTitle>
                <div className="flex items-center gap-2">
                  {lastFetched && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {lastFetched.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => refetchBalance()}
                    disabled={balanceLoading}
                    title="Refresh balance"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${balanceLoading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {balanceLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Fetching balance from Stripe…</span>
                </div>
              ) : balance ? (
                <div className="grid grid-cols-2 gap-3">
                  {/* Available */}
                  <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <TrendingUp className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                      <span className="text-xs font-medium text-green-700 dark:text-green-400 uppercase tracking-wide">Available</span>
                    </div>
                    {totalAvailable ? (
                      <p className="text-xl font-bold text-green-800 dark:text-green-300 tabular-nums">
                        {formatCents(totalAvailable.amount, totalAvailable.currency)}
                      </p>
                    ) : (
                      <p className="text-xl font-bold text-green-800 dark:text-green-300">$0.00</p>
                    )}
                    <p className="text-xs text-green-600 dark:text-green-500 mt-0.5">Ready to pay out</p>
                  </div>

                  {/* Pending */}
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wide">Pending</span>
                    </div>
                    {totalPending ? (
                      <p className="text-xl font-bold text-amber-800 dark:text-amber-300 tabular-nums">
                        {formatCents(totalPending.amount, totalPending.currency)}
                      </p>
                    ) : (
                      <p className="text-xl font-bold text-amber-800 dark:text-amber-300">$0.00</p>
                    )}
                    <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">In transit to bank</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  Could not load balance. Make sure your Stripe keys are configured and try refreshing.
                </div>
              )}

              {balance && (
                <p className="text-xs text-muted-foreground mt-3">
                  Balance reflects your Stripe account in real time. Available funds are paid out to your bank on
                  Stripe's standard schedule (typically 2 business days).
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* M2 Card Reader card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Card Reader — Stripe M2</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                <CreditCard className="w-4 h-4 text-slate-600 dark:text-slate-300" />
              </div>
              <div className="text-sm space-y-1">
                <p className="font-medium">Physical card reader support</p>
                <p className="text-muted-foreground">
                  The Stripe M2 reader connects via Bluetooth to your device and is available in the
                  POS checkout. It accepts chip, tap (NFC), and swipe — including Apple Pay and Google Pay.
                </p>
              </div>
            </div>
            {status?.connected ? (
              <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-2.5 text-sm text-green-800 dark:text-green-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                Stripe is connected — the M2 reader option will appear in your POS checkout.
              </div>
            ) : (
              <div className="rounded-md bg-muted p-2.5 text-sm text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                Connect your Stripe account above to enable M2 reader support in the POS.
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Stripe Express for Contractors ─────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-base">Stripe Express — Contractor Payouts</CardTitle>
                <CardDescription className="text-sm mt-0.5">
                  Pay your independent contractors directly through Stripe Express. Each contractor
                  onboards their own Stripe account for identity verification and bank connection —
                  Certxa handles the transfers automatically.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {expressLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading…</span>
              </div>
            ) : !status?.connected ? (
              <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                Connect your Stripe account above before enabling Express contractor payouts.
              </div>
            ) : (
              <>
                {/* Enable toggle */}
                <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="express-toggle" className="text-sm font-medium cursor-pointer">
                      Enable Stripe Express payouts
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Allow contractors to receive earnings via their own Stripe Express accounts.
                    </p>
                  </div>
                  <Switch
                    id="express-toggle"
                    checked={expressSettings?.contractorExpressEnabled ?? false}
                    disabled={expressSaving}
                    onCheckedChange={(checked) =>
                      saveExpressSettings({ contractorExpressEnabled: checked })
                    }
                  />
                </div>

                {/* Payout method — only shown when enabled */}
                {expressSettings?.contractorExpressEnabled && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium mb-0.5">Payout method</p>
                      <p className="text-xs text-muted-foreground">
                        Choose when contractor earnings are transferred after a service is paid.
                      </p>
                    </div>
                    <RadioGroup
                      value={expressSettings?.contractorPayoutMode ?? "manual"}
                      onValueChange={(val) =>
                        saveExpressSettings({ contractorPayoutMode: val as "manual" | "instant" })
                      }
                      className="space-y-2"
                      disabled={expressSaving}
                    >
                      {/* Manual */}
                      <label
                        htmlFor="mode-manual"
                        className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                          (expressSettings?.contractorPayoutMode ?? "manual") === "manual"
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <RadioGroupItem value="manual" id="mode-manual" className="mt-0.5" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-medium">Manual</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Earnings accumulate and are transferred in your regular payout run.
                            You stay in full control of when contractors are paid.
                          </p>
                        </div>
                      </label>

                      {/* Instant */}
                      <label
                        htmlFor="mode-instant"
                        className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                          expressSettings?.contractorPayoutMode === "instant"
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <RadioGroupItem value="instant" id="mode-instant" className="mt-0.5" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <Zap className="w-4 h-4 text-amber-500" />
                            <span className="text-sm font-medium">Instant after each payment</span>
                            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
                              Auto
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Each time a client pays, the contractor's commission is transferred
                            immediately to their Stripe Express account. Requires the contractor to
                            have completed Stripe onboarding with a verified bank account.
                          </p>
                        </div>
                      </label>
                    </RadioGroup>

                    {expressSettings?.contractorPayoutMode === "instant" && (
                      <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                        <Zap className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span>
                          Instant payouts only fire for contractors who have completed Stripe onboarding
                          and have a connected bank account. Contractors still on manual payout method
                          in their individual settings will continue using batch payout runs.
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* How it works summary */}
                {expressSettings?.contractorExpressEnabled && (
                  <div className="rounded-md bg-violet-50 dark:bg-violet-900/10 border border-violet-100 dark:border-violet-800 p-3 text-xs text-violet-800 dark:text-violet-300">
                    <p className="font-medium mb-1 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Stripe Express is enabled
                    </p>
                    <p>
                      Contractors will receive a secure Stripe onboarding link from their profile page
                      (Payouts → Contractors → Bank Accounts tab). Once they verify their identity and
                      connect a bank, they'll be ready to receive Express payouts.
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* What flows where */}
        <Card className="border-dashed">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">How payments flow</p>
            <div className="flex items-center gap-2 text-sm">
              <div className="rounded px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 text-xs font-medium">Client</div>
              <span className="text-muted-foreground">→</span>
              <div className="rounded px-2 py-1 bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-300 text-xs font-medium">Stripe</div>
              <span className="text-muted-foreground">→</span>
              <div className="rounded px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 text-xs font-medium">Your Bank</div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Certxa is never in the money path. Client payments go directly to your connected Stripe account
              and deposit to your bank on Stripe's standard payout schedule.
            </p>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Stripe account?</AlertDialogTitle>
            <AlertDialogDescription>
              Historical transactions will be preserved, but new payments will stop working until you reconnect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { setShowDisconnectDialog(false); disconnectMutation.mutate(); }}
            >
              Yes, disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
