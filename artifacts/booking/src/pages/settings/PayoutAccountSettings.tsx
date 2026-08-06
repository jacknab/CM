/**
 * PayoutAccountSettings — Salon owner payout account & verification page.
 *
 * Fully embedded Stripe Connect experience — no redirects to stripe.com.
 * Uses @stripe/react-connect-js embedded components for onboarding,
 * account management, payments, payouts, and the notification banner.
 *
 * Flow:
 *   1. Not connected  → "Connect Stripe Account" button (OAuth → comes back here)
 *   2. Connected, incomplete onboarding → embedded ConnectAccountOnboarding
 *   3. Fully set up  → ConnectAccountManagement + Payments / Payouts tabs
 *
 * The ConnectNotificationBanner is always shown when connected so Stripe can
 * surface important alerts (e.g. verification deadlines) without leaving the app.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  RefreshCw,
  Zap,
  ChevronRight,
  Building2,
  ShieldCheck,
  Banknote,
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
} from "lucide-react";
import { StripeConnectProvider } from "@/components/stripe/StripeConnectProvider";
import {
  ConnectAccountOnboarding,
  ConnectAccountManagement,
  ConnectNotificationBanner,
  ConnectPayments,
  ConnectPayouts,
} from "@stripe/react-connect-js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StripeStatus {
  connected: boolean;
  status?: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  displayName?: string | null;
  email?: string | null;
  country?: string | null;
  currency?: string | null;
  providerAccountId?: string;
  publishableKey?: string | null;
}

type ManagementTab = "account" | "payments" | "payouts";

// ─── Small helpers ────────────────────────────────────────────────────────────

function StatusBadge({ ok, okLabel = "Active", badLabel = "Action required" }: {
  ok: boolean; okLabel?: string; badLabel?: string;
}) {
  return ok ? (
    <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-50 font-medium rounded-full px-3 py-0.5 text-xs">
      {okLabel}
    </Badge>
  ) : (
    <Badge className="bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-50 font-medium rounded-full px-3 py-0.5 text-xs">
      {badLabel}
    </Badge>
  );
}

function StatusRow({ icon: Icon, label, ok, okLabel, badLabel }: {
  icon: React.ElementType; label: string; ok: boolean; okLabel?: string; badLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between py-4 gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${ok ? "bg-emerald-50" : "bg-amber-50"}`}>
          <Icon className={`w-4.5 h-4.5 ${ok ? "text-emerald-600" : "text-amber-600"}`} style={{ width: 18, height: 18 }} />
        </div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
      </div>
      <StatusBadge ok={ok} okLabel={okLabel} badLabel={badLabel} />
    </div>
  );
}

// ─── Embedded tab button ──────────────────────────────────────────────────────

function TabBtn({
  active, onClick, icon: Icon, label,
}: { active: boolean; onClick: () => void; icon: React.ElementType; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
        fontSize: ".82rem", fontWeight: 600,
        background: active ? "#7c3aed" : "transparent",
        color: active ? "#fff" : "#6b7280",
        transition: "background .15s, color .15s",
      }}
    >
      <Icon style={{ width: 14, height: 14 }} />
      {label}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PayoutAccountSettings() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<ManagementTab>("account");

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: status, isLoading } = useQuery<StripeStatus>({
    queryKey: ["/api/payments/stripe/status"],
    queryFn: async () => {
      const res = await fetch("/api/payments/stripe/status", { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) return { connected: false } as StripeStatus;
        throw new Error("Failed to load payment status");
      }
      return res.json();
    },
    retry: false,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  /** Start the Stripe OAuth Connect flow (initial account connection) */
  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/payments/stripe/connect", { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Failed to start Stripe connect");
      }
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: (data) => { window.location.href = data.url; },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  /** Re-sync account status from Stripe */
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/payments/stripe/sync", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Sync failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/payments/stripe/status"] });
      toast({ title: "Status refreshed" });
    },
    onError: (e: Error) => {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    },
  });

  // ── Derived state ─────────────────────────────────────────────────────────
  const isConnected   = !!(status?.connected && status?.status !== "disconnected");
  const charges       = !!status?.chargesEnabled;
  const identity      = !!status?.detailsSubmitted;
  const payouts       = !!status?.payoutsEnabled;
  const allGood       = isConnected && charges && identity && payouts;
  const actionNeeded  = isConnected && (!charges || !identity || !payouts);
  const publishableKey = status?.publishableKey ?? null;

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-6 max-w-2xl mx-auto space-y-4">
          <div className="h-7 w-56 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-48 bg-gray-100 rounded-2xl animate-pulse" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-2xl mx-auto space-y-5">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>
              Payout Account &amp; Verification
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Accept payments and receive payouts — all managed within Certxa.
            </p>
          </div>
          {isConnected && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className="gap-1.5 text-gray-500 hover:text-gray-800 rounded-xl"
            >
              <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          )}
        </div>

        {/* ── Embedded notification banner (always shown when connected) ─ */}
        {isConnected && publishableKey && (
          <StripeConnectProvider publishableKey={publishableKey}>
            <ConnectNotificationBanner />
          </StripeConnectProvider>
        )}

        {/* ── Not connected ─────────────────────────────────────────────── */}
        {!isConnected && (
          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardContent className="p-8 flex flex-col items-center text-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center">
                <CreditCard className="w-7 h-7 text-violet-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-800 text-lg" style={{ fontFamily: "Outfit, sans-serif" }}>
                  Connect your Stripe account
                </p>
                <p className="text-sm text-gray-500 mt-1 max-w-sm">
                  Link your Stripe account to start accepting payments and receiving automatic
                  payouts to your bank account — everything stays inside Certxa.
                </p>
              </div>
              <Button
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
                className="gap-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl px-6"
              >
                <Zap className="w-4 h-4" />
                {connectMutation.isPending ? "Redirecting…" : "Connect Stripe Account"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Action required banner ────────────────────────────────────── */}
        {actionNeeded && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800 text-sm">Action required</p>
              <p className="text-amber-700 text-sm mt-0.5">
                Complete the setup below to start processing payments.
              </p>
            </div>
          </div>
        )}

        {/* ── All good banner ───────────────────────────────────────────── */}
        {allGood && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="font-semibold text-emerald-800 text-sm">You're all set!</p>
              <p className="text-emerald-700 text-sm mt-0.5">
                Payment processing and payouts are fully enabled.
              </p>
            </div>
          </div>
        )}

        {/* ── Status rows (connected) ───────────────────────────────────── */}
        {isConnected && (
          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardHeader className="px-6 pt-5 pb-0">
              <CardTitle className="text-base" style={{ fontFamily: "Outfit, sans-serif" }}>
                Account Status
              </CardTitle>
              {status?.displayName && (
                <p className="text-sm text-gray-500">{status.displayName}{status.email ? ` · ${status.email}` : ""}</p>
              )}
            </CardHeader>
            <CardContent className="px-6 pb-5">
              <div className="divide-y divide-gray-50">
                <StatusRow icon={Building2}  label="Payment processing"   ok={charges}  okLabel="Active"     badLabel="Inactive" />
                <StatusRow icon={ShieldCheck} label="Identity verification" ok={identity} okLabel="Verified"   badLabel="Info required" />
                <StatusRow icon={Banknote}    label="Payout account"       ok={payouts}  okLabel="Connected"  badLabel="Not set up" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Embedded onboarding (connected but not fully set up) ───────── */}
        {isConnected && !allGood && publishableKey && (
          <StripeConnectProvider publishableKey={publishableKey}>
            <Card className="rounded-2xl border-violet-100 shadow-sm overflow-hidden">
              <CardHeader className="px-6 pt-5 pb-3 bg-violet-50/60 border-b border-violet-100">
                <CardTitle className="text-base text-violet-900" style={{ fontFamily: "Outfit, sans-serif" }}>
                  Complete your payment setup
                </CardTitle>
                <p className="text-sm text-violet-700 mt-0.5">
                  Finish the steps below to activate payments and payouts.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <ConnectAccountOnboarding
                  onExit={() => {
                    // Refresh status when the user exits onboarding (completed or abandoned)
                    syncMutation.mutate();
                  }}
                  onLoadError={(err) => {
                    console.error("[StripeConnect] Onboarding load error:", err);
                    toast({
                      title: "Unable to load onboarding",
                      description: "Please try refreshing. If the issue persists, contact support.",
                      variant: "destructive",
                    });
                  }}
                />
              </CardContent>
            </Card>
          </StripeConnectProvider>
        )}

        {/* ── Embedded account management (fully set up) ────────────────── */}
        {isConnected && allGood && publishableKey && (
          <StripeConnectProvider publishableKey={publishableKey}>
            <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden">
              <CardHeader className="px-6 pt-5 pb-0 border-b border-gray-100">
                <div className="flex items-center justify-between pb-4">
                  <CardTitle className="text-base" style={{ fontFamily: "Outfit, sans-serif" }}>
                    Payment Dashboard
                  </CardTitle>
                  <div style={{ display: "flex", gap: 4, background: "#f9fafb", padding: 4, borderRadius: 10 }}>
                    <TabBtn active={activeTab === "account"}  onClick={() => setActiveTab("account")}  icon={LayoutDashboard} label="Account"  />
                    <TabBtn active={activeTab === "payments"} onClick={() => setActiveTab("payments")} icon={ArrowLeftRight}  label="Payments" />
                    <TabBtn active={activeTab === "payouts"}  onClick={() => setActiveTab("payouts")}  icon={Wallet}          label="Payouts"  />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {activeTab === "account"  && <ConnectAccountManagement />}
                {activeTab === "payments" && <ConnectPayments />}
                {activeTab === "payouts"  && <ConnectPayouts />}
              </CardContent>
            </Card>
          </StripeConnectProvider>
        )}

        {/* ── Connected account details ─────────────────────────────────── */}
        {isConnected && status?.providerAccountId && (
          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardContent className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                    Connected Stripe Account
                  </p>
                  <p className="text-sm font-medium text-gray-700">
                    ···{status.providerAccountId.slice(-8)}
                  </p>
                  {status.currency && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {status.currency.toUpperCase()} · {status.country?.toUpperCase()}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── POS / Terminal link ───────────────────────────────────────── */}
        <div
          className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
          onClick={() => navigate("/manage/payment-settings")}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">Point of Sale &amp; Card Reader</p>
              <p className="text-xs text-gray-500">Manage Terminal hardware and in-person payments</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </div>

      </div>
    </AppLayout>
  );
}
