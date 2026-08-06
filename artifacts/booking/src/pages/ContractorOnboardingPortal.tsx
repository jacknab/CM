import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock, AlertCircle, XCircle, Zap, Shield, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type PortalInfo = {
  contractorId: number;
  firstName: string;
  lastName: string;
  onboardingStatus: string;
  bankVerified: boolean;
  hasStripeAccount: boolean;
  storeName: string;
  expiresAt: string;
};

type PageState = "loading" | "error" | "expired" | "ready" | "complete" | "syncing";

const STATUS_MAP: Record<string, { label: string; icon: typeof CheckCircle2; color: string; bg: string }> = {
  complete:    { label: "Account verified",  icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
  in_progress: { label: "Onboarding started", icon: Clock,        color: "text-amber-600",   bg: "bg-amber-50"   },
  pending:     { label: "Not yet started",    icon: AlertCircle,  color: "text-gray-500",    bg: "bg-gray-50"    },
  restricted:  { label: "Restricted",         icon: XCircle,      color: "text-red-600",     bg: "bg-red-50"     },
};

export default function ContractorOnboardingPortal() {
  const { token } = useParams<{ token: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const [pageState, setPageState] = useState<PageState>("loading");
  const [info, setInfo] = useState<PortalInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [starting, setStarting] = useState(false);

  async function loadInfo() {
    try {
      const res = await fetch(`/api/contractor-payouts/public/onboarding/${token}`);
      if (res.status === 410) { setPageState("expired"); return; }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(body.error ?? "This link is invalid or has already been used.");
        setPageState("error");
        return;
      }
      const data: PortalInfo = await res.json();
      setInfo(data);
      setPageState(data.onboardingStatus === "complete" ? "complete" : "ready");
    } catch {
      setErrorMsg("Could not load your onboarding info. Please try again.");
      setPageState("error");
    }
  }

  async function syncStatus() {
    if (!token) return;
    setPageState("syncing");
    try {
      const res = await fetch(`/api/contractor-payouts/public/onboarding/${token}/sync`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setInfo(prev => prev ? { ...prev, onboardingStatus: data.status, bankVerified: data.bankVerified } : prev);
        setPageState(data.status === "complete" ? "complete" : "ready");
      } else {
        await loadInfo();
      }
    } catch {
      await loadInfo();
    }
  }

  useEffect(() => {
    if (!token) { setPageState("error"); setErrorMsg("No onboarding token found in this URL."); return; }

    const param = searchParams.get("onboarding");
    if (param) {
      const cleaned = new URLSearchParams(searchParams);
      cleaned.delete("onboarding");
      setSearchParams(cleaned, { replace: true });

      if (param === "complete") {
        loadInfo().then(() => syncStatus());
        return;
      }
      if (param === "refresh") {
        loadInfo().then(() => {
          handleStart();
        });
        return;
      }
    }

    loadInfo();
  }, [token]);

  async function handleStart() {
    if (!token) return;
    setStarting(true);
    try {
      const res = await fetch(`/api/contractor-payouts/public/onboarding/${token}/start`, { method: "POST" });
      if (res.status === 410) { setPageState("expired"); return; }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(body.error ?? "Failed to start onboarding. Please try again.");
        setPageState("error");
        return;
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setErrorMsg("Something went wrong. Please try again in a moment.");
      setPageState("error");
    } finally {
      setStarting(false);
    }
  }

  const statusInfo = info ? (STATUS_MAP[info.onboardingStatus] ?? STATUS_MAP.pending) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-teal-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo / brand header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-600 text-white mb-4 shadow-lg">
            <CreditCard className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>
            Certxa Payouts
          </h1>
          {info && (
            <p className="text-sm text-gray-500 mt-1">{info.storeName}</p>
          )}
        </div>

        {/* Loading */}
        {pageState === "loading" && (
          <Card className="rounded-2xl shadow-sm border-gray-100">
            <CardContent className="p-8 flex flex-col items-center gap-4">
              <div className="w-8 h-8 rounded-full border-4 border-teal-200 border-t-teal-600 animate-spin" />
              <p className="text-sm text-gray-500">Loading your onboarding details…</p>
            </CardContent>
          </Card>
        )}

        {/* Expired */}
        {pageState === "expired" && (
          <Card className="rounded-2xl shadow-sm border-amber-100">
            <CardContent className="p-8 text-center space-y-3">
              <Clock className="w-10 h-10 text-amber-500 mx-auto" />
              <h2 className="text-lg font-bold text-gray-900">Link expired</h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                This onboarding link has expired. Please ask your manager to send you a new one.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {pageState === "error" && (
          <Card className="rounded-2xl shadow-sm border-red-100">
            <CardContent className="p-8 text-center space-y-3">
              <XCircle className="w-10 h-10 text-red-400 mx-auto" />
              <h2 className="text-lg font-bold text-gray-900">Something went wrong</h2>
              <p className="text-sm text-gray-500 leading-relaxed">{errorMsg}</p>
            </CardContent>
          </Card>
        )}

        {/* Complete */}
        {pageState === "complete" && info && (
          <Card className="rounded-2xl shadow-sm border-emerald-100">
            <CardContent className="p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>
                  You're all set, {info.firstName}!
                </h2>
                <p className="text-sm text-gray-500 mt-1">Your payout account is verified and ready.</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-4 text-sm text-emerald-700 font-medium">
                Payouts from {info.storeName} will be deposited directly to your bank account.
              </div>
              <p className="text-xs text-gray-400">
                Your account details are securely managed by Stripe. Certxa never stores your banking information.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Syncing */}
        {pageState === "syncing" && (
          <Card className="rounded-2xl shadow-sm border-gray-100">
            <CardContent className="p-8 flex flex-col items-center gap-4">
              <div className="w-8 h-8 rounded-full border-4 border-teal-200 border-t-teal-600 animate-spin" />
              <p className="text-sm text-gray-500">Verifying your account status…</p>
            </CardContent>
          </Card>
        )}

        {/* Ready to onboard */}
        {pageState === "ready" && info && statusInfo && (
          <Card className="rounded-2xl shadow-sm border-gray-100">
            <CardContent className="p-8 space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>
                  Hi, {info.firstName}!
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Set up your direct deposit to receive payouts from {info.storeName}.
                </p>
              </div>

              {info.onboardingStatus !== "pending" && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium ${statusInfo.bg} ${statusInfo.color}`}>
                  <statusInfo.icon className="w-4 h-4 shrink-0" />
                  {statusInfo.label}
                  {info.onboardingStatus === "in_progress" && (
                    <span className="ml-auto text-xs font-normal opacity-70">Continue where you left off →</span>
                  )}
                </div>
              )}

              <div className="space-y-2.5">
                {[
                  { icon: Shield,       text: "Handled securely by Stripe — we never see your banking details" },
                  { icon: Clock,        text: "Takes about 5 minutes to complete" },
                  { icon: CheckCircle2, text: "Once verified, payouts deposit directly to your account" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-start gap-3 text-sm text-gray-600">
                    <Icon className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
                    <span>{text}</span>
                  </div>
                ))}
              </div>

              <Button
                onClick={handleStart}
                disabled={starting}
                className="w-full rounded-xl bg-teal-600 hover:bg-teal-700 text-white h-12 text-base font-semibold gap-2"
              >
                {starting ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Preparing…
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5" />
                    {info.onboardingStatus === "in_progress" ? "Continue Onboarding" : "Connect with Stripe"}
                  </>
                )}
              </Button>

              <p className="text-xs text-center text-gray-400">
                You'll be taken to Stripe's secure platform. Your bank information is protected by bank-level encryption.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-gray-400">
          Powered by <strong className="text-gray-500">Certxa</strong> &middot; Payouts secured by Stripe
        </p>
      </div>
    </div>
  );
}
