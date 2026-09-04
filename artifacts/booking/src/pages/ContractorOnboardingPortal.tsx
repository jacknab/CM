import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock, AlertCircle, XCircle, Shield, CreditCard, Banknote, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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
  complete:    { label: "Account verified",   icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
  in_progress: { label: "Details received",   icon: Clock,        color: "text-amber-600",   bg: "bg-amber-50"   },
  pending:     { label: "Not yet started",    icon: AlertCircle,  color: "text-gray-500",    bg: "bg-gray-50"    },
  restricted:  { label: "Needs attention",    icon: XCircle,      color: "text-red-600",     bg: "bg-red-50"     },
};

// ── Bank-details form (client-side Stripe tokenization) ───────────────────────
function PortalBankForm({ token, onSaved }: { token: string; onSaved: () => void }) {
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [keyError, setKeyError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    legalName: "", routingNumber: "", accountNumber: "",
    accountType: "checking", accountHolderType: "individual",
  });
  const [fieldErr, setFieldErr] = useState<Partial<typeof form>>({});

  useEffect(() => {
    fetch("/api/contractor-payouts/bank-token-config")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setPublishableKey(d.publishableKey))
      .catch(() => setKeyError(true));
  }, []);

  const set = (k: keyof typeof form) => (v: string) => {
    setForm((p) => ({ ...p, [k]: v }));
    setFieldErr((p) => ({ ...p, [k]: undefined }));
  };

  function validate() {
    const e: Partial<typeof form> = {};
    if (!form.legalName.trim()) e.legalName = "Required";
    if (!/^\d{9}$/.test(form.routingNumber)) e.routingNumber = "Must be exactly 9 digits";
    if (!form.accountNumber.trim()) e.accountNumber = "Required";
    setFieldErr(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    if (!validate() || !publishableKey) return;
    setBusy(true);
    setErr(null);
    try {
      const { loadStripe } = await import("@stripe/stripe-js");
      const stripe = await loadStripe(publishableKey);
      if (!stripe) throw new Error("Could not load Stripe. Check your connection and try again.");

      const { token: btok, error } = await stripe.createToken("bank_account", {
        country: "US",
        currency: "usd",
        routing_number: form.routingNumber,
        account_number: form.accountNumber,
        account_holder_name: form.legalName,
        account_holder_type: form.accountHolderType as "individual" | "company",
      });
      if (error || !btok) {
        throw new Error(error?.message ?? "Please double-check your routing and account numbers.");
      }

      const res = await fetch(`/api/contractor-payouts/public/onboarding/${token}/bank`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stripeToken: btok.id,
          accountType: form.accountType,
          accountHolderType: form.accountHolderType,
          accountHolderName: form.legalName,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as any).error ?? "Failed to save your bank account.");
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (keyError) {
    return <p className="text-sm text-red-500 text-center">Payouts aren't set up for this salon yet. Please contact your manager.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-blue-50 border border-blue-100">
        <Shield className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">Your bank details are encrypted by Stripe before they leave this page. Certxa never stores your routing or account numbers.</p>
      </div>

      <div>
        <Label className="text-xs text-gray-500 mb-1.5 block">Full legal name <span className="text-red-500">*</span></Label>
        <Input value={form.legalName} onChange={(e) => set("legalName")(e.target.value)}
          className={`rounded-xl ${fieldErr.legalName ? "border-red-400" : ""}`}
          placeholder="As it appears on your bank account" />
        {fieldErr.legalName && <p className="text-xs text-red-500 mt-1">{fieldErr.legalName}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-500 mb-1.5 block">Account holder</Label>
          <Select value={form.accountHolderType} onValueChange={set("accountHolderType")}>
            <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="individual">Individual</SelectItem>
              <SelectItem value="company">Company</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-gray-500 mb-1.5 block">Account type</Label>
          <Select value={form.accountType} onValueChange={set("accountType")}>
            <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="checking">Checking</SelectItem>
              <SelectItem value="savings">Savings</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-xs text-gray-500 mb-1.5 block">Routing number <span className="text-red-500">*</span></Label>
        <Input value={form.routingNumber}
          onChange={(e) => set("routingNumber")(e.target.value.replace(/\D/g, "").slice(0, 9))}
          className={`rounded-xl font-mono ${fieldErr.routingNumber ? "border-red-400" : ""}`}
          placeholder="9-digit routing number" maxLength={9} inputMode="numeric" />
        {fieldErr.routingNumber
          ? <p className="text-xs text-red-500 mt-1">{fieldErr.routingNumber}</p>
          : <p className="text-xs text-gray-400 mt-1">Bottom-left of a check</p>}
      </div>

      <div>
        <Label className="text-xs text-gray-500 mb-1.5 block">Account number <span className="text-red-500">*</span></Label>
        <Input value={form.accountNumber}
          onChange={(e) => set("accountNumber")(e.target.value.replace(/\D/g, ""))}
          className={`rounded-xl font-mono ${fieldErr.accountNumber ? "border-red-400" : ""}`}
          placeholder="Bank account number" inputMode="numeric" />
        {fieldErr.accountNumber && <p className="text-xs text-red-500 mt-1">{fieldErr.accountNumber}</p>}
      </div>

      {err && <p className="text-sm text-red-500">{err}</p>}

      <Button onClick={submit} disabled={busy || !publishableKey}
        className="w-full rounded-xl bg-teal-600 hover:bg-teal-700 text-white h-12 text-base font-semibold gap-2">
        {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Banknote className="w-5 h-5" /> Save direct deposit</>}
      </Button>
    </div>
  );
}

export default function ContractorOnboardingPortal() {
  const { token } = useParams<{ token: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const [pageState, setPageState] = useState<PageState>("loading");
  const [info, setInfo] = useState<PortalInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

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
        setInfo((prev) => (prev ? { ...prev, onboardingStatus: data.status, bankVerified: data.bankVerified } : prev));
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
    }
    loadInfo();
  }, [token]);

  const statusInfo = info ? (STATUS_MAP[info.onboardingStatus] ?? STATUS_MAP.pending) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-teal-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-600 text-white mb-4 shadow-lg">
            <CreditCard className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>Certxa Payouts</h1>
          {info && <p className="text-sm text-gray-500 mt-1">{info.storeName}</p>}
        </div>

        {pageState === "loading" && (
          <Card className="rounded-2xl shadow-sm border-gray-100">
            <CardContent className="p-8 flex flex-col items-center gap-4">
              <div className="w-8 h-8 rounded-full border-4 border-teal-200 border-t-teal-600 animate-spin" />
              <p className="text-sm text-gray-500">Loading your details…</p>
            </CardContent>
          </Card>
        )}

        {pageState === "expired" && (
          <Card className="rounded-2xl shadow-sm border-amber-100">
            <CardContent className="p-8 text-center space-y-3">
              <Clock className="w-10 h-10 text-amber-500 mx-auto" />
              <h2 className="text-lg font-bold text-gray-900">Link expired</h2>
              <p className="text-sm text-gray-500 leading-relaxed">This link has expired. Please ask your manager to send you a new one.</p>
            </CardContent>
          </Card>
        )}

        {pageState === "error" && (
          <Card className="rounded-2xl shadow-sm border-red-100">
            <CardContent className="p-8 text-center space-y-3">
              <XCircle className="w-10 h-10 text-red-400 mx-auto" />
              <h2 className="text-lg font-bold text-gray-900">Something went wrong</h2>
              <p className="text-sm text-gray-500 leading-relaxed">{errorMsg}</p>
            </CardContent>
          </Card>
        )}

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
              <p className="text-xs text-gray-400">Your bank account is securely held by Stripe. Certxa never stores your banking numbers.</p>
            </CardContent>
          </Card>
        )}

        {pageState === "syncing" && (
          <Card className="rounded-2xl shadow-sm border-gray-100">
            <CardContent className="p-8 flex flex-col items-center gap-4">
              <div className="w-8 h-8 rounded-full border-4 border-teal-200 border-t-teal-600 animate-spin" />
              <p className="text-sm text-gray-500">Verifying your account…</p>
            </CardContent>
          </Card>
        )}

        {pageState === "ready" && info && statusInfo && (
          <Card className="rounded-2xl shadow-sm border-gray-100">
            <CardContent className="p-8 space-y-5">
              <div className="text-center">
                <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>Hi, {info.firstName}!</h2>
                <p className="text-sm text-gray-500 mt-1">Enter your direct-deposit details to receive payouts from {info.storeName}.</p>
              </div>

              {info.onboardingStatus !== "pending" && (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium ${statusInfo.bg} ${statusInfo.color}`}>
                  <statusInfo.icon className="w-4 h-4 shrink-0" />
                  {statusInfo.label}
                </div>
              )}

              <PortalBankForm token={token!} onSaved={syncStatus} />

              <p className="text-xs text-center text-gray-400">
                Takes about a minute. Once verified, payouts deposit directly to your account.
              </p>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-gray-400">
          Powered by <strong className="text-gray-500">Certxa</strong> &middot; Payouts secured by Stripe
        </p>
      </div>
    </div>
  );
}
