import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { loadConnectAndInitialize, type StripeConnectInstance } from "@stripe/connect-js";
import {
  ConnectComponentsProvider,
  ConnectNotificationBanner,
  ConnectBalances,
  ConnectPayouts,
  ConnectPayments,
  ConnectDocuments,
  ConnectAccountManagement,
} from "@stripe/react-connect-js";
import { StaffPortalNav } from "@/components/StaffPortalNav";
import {
  ArrowLeft, Loader2, Bell, Wallet, BarChart3,
  FileText, Settings2, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ─── Types ─────────────────────────────────────────────────────────────────────

type StripeStatus = {
  hasContractorRecord: boolean;
  hasStripeAccount?:   boolean;
  stripeConfigured?:   boolean;
  onboardingStatus?:   string;
  bankVerified?:       boolean;
};

// ─── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview",   label: "Overview",  icon: Bell       },
  { id: "payouts",    label: "Payouts",   icon: Wallet     },
  { id: "earnings",   label: "Earnings",  icon: BarChart3  },
  { id: "documents",  label: "Tax Docs",  icon: FileText   },
  { id: "settings",   label: "Account",   icon: Settings2  },
] as const;

type TabId = typeof TABS[number]["id"];

// ─── Helper: fetch a fresh dashboard session client secret ─────────────────────

async function fetchDashboardClientSecret(): Promise<string> {
  const res = await fetch("/api/staff/me/stripe-dashboard-session", {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to start financial hub");
  }
  const data = await res.json();
  return data.clientSecret;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function StaffFinancialHub() {
  const navigate                              = useNavigate();
  const { toast }                             = useToast();
  const [activeTab, setActiveTab]             = useState<TabId>("overview");
  const [connectInstance, setConnectInstance] = useState<StripeConnectInstance | null>(null);
  const [sessionError, setSessionError]       = useState<string | null>(null);
  const [initializing, setInitializing]       = useState(false);

  // ── 1. Stripe status check ──────────────────────────────────────────────────
  const { data: status, isLoading: statusLoading } = useQuery<StripeStatus>({
    queryKey: ["/api/staff/me/stripe-status"],
    queryFn: async () => {
      const res = await fetch("/api/staff/me/stripe-status", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load Stripe status");
      return res.json();
    },
  });

  // ── 2. Redirect to setup if not ready; otherwise init session ──────────────
  useEffect(() => {
    if (statusLoading || !status) return;

    // Redirect contractors who haven't completed onboarding
    if (!status.hasContractorRecord || !status.stripeConfigured || !status.hasStripeAccount) {
      navigate("/staff-payouts", { replace: true });
      return;
    }

    if (connectInstance || initializing) return; // already done

    setInitializing(true);

    // Fetch the publishable key + first client secret together, then init once.
    fetch("/api/staff/me/stripe-dashboard-session", { method: "POST", credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Failed to start financial hub");
        }
        return res.json() as Promise<{ clientSecret: string; publishableKey: string }>;
      })
      .then((data) => {
        // fetchClientSecret is called by Stripe automatically when the session expires,
        // so the hub stays alive without kicking the user out.
        const instance = loadConnectAndInitialize({
          publishableKey: data.publishableKey,
          fetchClientSecret: fetchDashboardClientSecret,
          appearance: {
            overlays: "dialog",
            variables: {
              colorPrimary: "#0d9488",
              fontFamily:   "Inter, system-ui, sans-serif",
              borderRadius: "12px",
              spacingUnit:  "10px",
              colorText:    "#1e293b",
            },
          },
        });
        setConnectInstance(instance);
      })
      .catch((err: Error) => {
        setSessionError(err.message);
        toast({ title: "Could not load financial hub", description: err.message, variant: "destructive" });
      })
      .finally(() => setInitializing(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusLoading, status]);

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (statusLoading || initializing || (!connectInstance && !sessionError)) {
    return (
      <div className="flex flex-col h-screen bg-slate-50 items-center justify-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-teal-500" />
        </div>
        <p className="text-[13px] text-slate-400">Loading your financial hub…</p>
      </div>
    );
  }

  // ── Session error ───────────────────────────────────────────────────────────
  if (sessionError) {
    return (
      <div className="flex flex-col bg-slate-50 overflow-hidden" style={{ height: "100dvh" }}>
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-100 shadow-sm">
          <button
            className="w-9 h-9 flex items-center justify-center rounded-full active:bg-slate-100"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="font-bold text-[17px] text-slate-800">Financial Hub</h1>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-400" />
          </div>
          <p className="font-bold text-[18px] text-slate-800">Couldn't load your hub</p>
          <p className="text-[13px] text-slate-500 leading-relaxed max-w-xs">{sessionError}</p>
          <button
            className="mt-2 px-6 py-3 rounded-2xl bg-teal-500 text-white font-bold text-[15px]"
            onClick={() => {
              setSessionError(null);
              setConnectInstance(null);
              setInitializing(false);
            }}
          >
            Try again
          </button>
        </div>
        <StaffPortalNav />
      </div>
    );
  }

  // ── Main hub ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col bg-slate-50 overflow-hidden" style={{ height: "100dvh" }}>

      {/* ── Header ── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-100 shadow-sm">
        <button
          className="w-9 h-9 flex items-center justify-center rounded-full active:bg-slate-100"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-[17px] text-slate-800 leading-tight">Financial Hub</h1>
          <p className="text-[11px] text-slate-400 leading-none mt-0.5">Secured by Stripe</p>
        </div>
        <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-[10px] font-semibold text-slate-500">Live</span>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex-shrink-0 flex bg-white border-b border-slate-100 overflow-x-auto scrollbar-none">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex flex-col items-center gap-0.5 px-5 py-2.5 min-w-fit transition-all relative",
              activeTab === id ? "text-teal-600" : "text-slate-400 active:text-slate-600",
            )}
          >
            <Icon className="w-[17px] h-[17px]" />
            <span className="text-[10px] font-semibold whitespace-nowrap">{label}</span>
            {activeTab === id && (
              <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-teal-500" />
            )}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto pb-24">
        <ConnectComponentsProvider connectInstance={connectInstance!}>

          {/* Overview: notification banner + balances */}
          {activeTab === "overview" && (
            <div className="space-y-0">
              <div className="bg-white">
                <ConnectNotificationBanner />
              </div>
              <div className="p-4">
                <div className="rounded-2xl overflow-hidden shadow-sm">
                  <ConnectBalances />
                </div>
              </div>
              <div className="px-4 pb-4 space-y-3">
                <InfoCard
                  title="When do I get paid?"
                  body="Payouts follow the schedule set by your location. Standard payouts typically arrive within 2 business days after they're triggered."
                />
                <InfoCard
                  title="What is my available balance?"
                  body="Your available balance is money that has cleared and is ready to be paid out. Pending funds are still processing."
                />
                <InfoCard
                  title="Instant payouts"
                  body="If your bank supports it, you can request an instant payout at any time from the Payouts tab — funds arrive within 30 minutes."
                />
              </div>
            </div>
          )}

          {/* Payouts: history, schedule, instant payouts */}
          {activeTab === "payouts" && (
            <div className="p-4">
              <div className="rounded-2xl overflow-hidden shadow-sm">
                <ConnectPayouts />
              </div>
            </div>
          )}

          {/* Earnings: individual payment records */}
          {activeTab === "earnings" && (
            <div className="space-y-0">
              <div className="px-4 pt-4 pb-2">
                <p className="text-[13px] text-slate-500 leading-relaxed">
                  Every client payment attributed to you, processed through Stripe.
                </p>
              </div>
              <div className="px-4 pb-4">
                <div className="rounded-2xl overflow-hidden shadow-sm">
                  <ConnectPayments />
                </div>
              </div>
            </div>
          )}

          {/* Documents: 1099s and tax forms */}
          {activeTab === "documents" && (
            <div className="space-y-0">
              <div className="px-4 pt-4 pb-2">
                <div className="rounded-2xl bg-amber-50 border border-amber-100 px-4 py-3.5 space-y-1">
                  <p className="text-[13px] font-semibold text-amber-800">Tax documents</p>
                  <p className="text-[12px] text-amber-700 leading-relaxed">
                    Your 1099 forms and other tax documents will appear here once they're generated by Stripe, typically in January for the prior tax year.
                  </p>
                </div>
              </div>
              <div className="px-4 pb-4">
                <div className="rounded-2xl overflow-hidden shadow-sm">
                  <ConnectDocuments />
                </div>
              </div>
            </div>
          )}

          {/* Account settings: bank, payout schedule, identity */}
          {activeTab === "settings" && (
            <div className="space-y-0">
              <div className="px-4 pt-4 pb-2">
                <p className="text-[13px] text-slate-500 leading-relaxed">
                  Update your bank account, payout schedule, and personal details.
                </p>
              </div>
              <div className="px-4 pb-4">
                <div className="rounded-2xl overflow-hidden shadow-sm">
                  <ConnectAccountManagement />
                </div>
              </div>
            </div>
          )}

        </ConnectComponentsProvider>
      </div>

      <StaffPortalNav />
    </div>
  );
}

// ─── Helper: info card ─────────────────────────────────────────────────────────

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-white rounded-2xl px-4 py-4 shadow-sm space-y-1">
      <p className="text-[13px] font-semibold text-slate-700">{title}</p>
      <p className="text-[12px] text-slate-500 leading-relaxed">{body}</p>
    </div>
  );
}
