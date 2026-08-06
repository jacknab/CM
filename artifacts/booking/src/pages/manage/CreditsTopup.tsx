import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { useSelectedStore, useStores } from "@/hooks/use-store";
import {
  Wallet,
  Zap,
  Phone,
  MessageSquare,
  CheckCircle,
  Loader2,
  ArrowLeft,
  RefreshCw,
  ArrowDownLeft,
  Settings2,
  Receipt,
  AlertTriangle,
  Info,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BalanceData {
  balance: string;
  formatted: string;
}

interface CreditTransaction {
  id: number;
  storeId: number;
  type: "topup" | "ai_provision" | "ai_call" | "sms" | "adjustment";
  amount: string;
  description: string;
  balanceAfter: string;
  referenceId: string | null;
  createdAt: string;
}

interface TransactionsResponse {
  transactions: CreditTransaction[];
  limit: number;
  offset: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PRESET_AMOUNTS = [
  { amount: 10,  label: "$10",  tag: null },
  { amount: 25,  label: "$25",  tag: "Popular" },
  { amount: 50,  label: "$50",  tag: null },
  { amount: 100, label: "$100", tag: "Best value" },
];

const USE_CASES = [
  {
    icon: Phone,
    color: "bg-violet-100 text-violet-600",
    title: "AI Receptionist calls",
    desc: "Autumn answers every call and books appointments automatically",
  },
  {
    icon: MessageSquare,
    color: "bg-sky-100 text-sky-600",
    title: "SMS reminders",
    desc: "Automated appointment reminders and confirmations to clients",
  },
];

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchBalance(): Promise<BalanceData> {
  const res = await fetch("/api/billing/credits/balance", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load balance");
  return res.json();
}

async function fetchTransactions(offset = 0): Promise<TransactionsResponse> {
  const res = await fetch(`/api/billing/credits/transactions?limit=20&offset=${offset}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load transactions");
  return res.json();
}

async function fetchStripeStatus(): Promise<{ configured: boolean }> {
  const res = await fetch("/api/billing/status", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to check billing status");
  return res.json();
}

async function createTopupCheckout(payload: {
  salonId: number;
  amountCents: number;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> {
  const res = await fetch("/api/billing/wallet/fund", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || "Failed to start checkout");
  }
  return res.json();
}

// ── Transaction helpers ───────────────────────────────────────────────────────

function txIcon(type: CreditTransaction["type"]) {
  switch (type) {
    case "topup":       return <ArrowDownLeft className="w-4 h-4 text-emerald-500" />;
    case "ai_provision":
    case "ai_call":     return <Phone         className="w-4 h-4 text-violet-500" />;
    case "sms":         return <MessageSquare className="w-4 h-4 text-sky-500" />;
    case "adjustment":  return <Settings2     className="w-4 h-4 text-slate-400" />;
    default:            return <Receipt       className="w-4 h-4 text-slate-400" />;
  }
}

function txIconBg(type: CreditTransaction["type"]) {
  switch (type) {
    case "topup":       return "bg-emerald-50 border border-emerald-100";
    case "ai_provision":
    case "ai_call":     return "bg-violet-50 border border-violet-100";
    case "sms":         return "bg-sky-50 border border-sky-100";
    default:            return "bg-slate-50 border border-slate-100";
  }
}

function txAmountClass(amount: string) {
  return parseFloat(amount) >= 0 ? "text-emerald-600 font-semibold" : "text-rose-500 font-semibold";
}

function txAmountLabel(amount: string) {
  const n = parseFloat(amount);
  return (n >= 0 ? "+" : "") + `$${Math.abs(n).toFixed(2)}`;
}

// ── Success Banner ─────────────────────────────────────────────────────────────

function SuccessBanner({ amount }: { amount: string }) {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-2xl bg-emerald-50 border border-emerald-200 px-5 py-4">
      <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-emerald-800">
          ${parseFloat(amount).toFixed(2)} added to your account
        </p>
        <p className="text-xs text-emerald-600 mt-0.5">
          Your balance is ready to use for AI calls and SMS messages.
        </p>
      </div>
    </div>
  );
}


// ── Transaction History ───────────────────────────────────────────────────────

function TransactionHistory() {
  const [offset, setOffset] = useState(0);
  const PAGE = 20;

  const { data, isLoading, isFetching } = useQuery<TransactionsResponse>({
    queryKey: ["/api/billing/credits/transactions", offset],
    queryFn: () => fetchTransactions(offset),
    staleTime: 30_000,
  });

  const transactions = data?.transactions ?? [];
  const hasMore = transactions.length === PAGE;

  return (
    <div className="mt-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          Transaction History
        </p>
        {isFetching && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center">
          <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No transactions yet</p>
          <p className="text-xs text-slate-300 mt-1">Your account activity will appear here</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {transactions.map((tx, i) => {
            const date = new Date(tx.createdAt);
            return (
              <div
                key={tx.id}
                className={`flex items-center gap-3 px-4 py-3.5 ${
                  i < transactions.length - 1 ? "border-b border-slate-100" : ""
                }`}
              >
                {/* Icon */}
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${txIconBg(tx.type)}`}>
                  {txIcon(tx.type)}
                </div>

                {/* Description + timestamp */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{tx.description}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {format(date, "d MMM yyyy, h:mm a")}
                    <span className="mx-1.5 text-slate-200">·</span>
                    <span className="text-slate-300">{formatDistanceToNow(date, { addSuffix: true })}</span>
                  </p>
                </div>

                {/* Amount + balance after */}
                <div className="text-right shrink-0">
                  <p className={`text-sm ${txAmountClass(tx.amount)}`}>
                    {txAmountLabel(tx.amount)}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Balance: ${parseFloat(tx.balanceAfter).toFixed(2)}
                  </p>
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          {(offset > 0 || hasMore) && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
              <button
                onClick={() => setOffset(Math.max(0, offset - PAGE))}
                disabled={offset === 0 || isFetching}
                className="text-xs text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ← Newer
              </button>
              <span className="text-xs text-slate-300">
                Showing {offset + 1}–{offset + transactions.length}
              </span>
              <button
                onClick={() => setOffset(offset + PAGE)}
                disabled={!hasMore || isFetching}
                className="text-xs text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Older →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Add Funds Panel ───────────────────────────────────────────────────────────

function AddFundsPanel({ salonId }: { salonId: number }) {
  const { toast } = useToast();
  const [selectedAmount, setSelectedAmount] = useState(25);
  const [customAmount, setCustomAmount] = useState("");
  const [useCustom, setUseCustom] = useState(false);

  const finalDollars = useCustom ? parseFloat(customAmount || "0") : selectedAmount;
  const finalCents = Math.round(finalDollars * 100);
  const isValid = finalCents >= 100;

  const topupMutation = useMutation({
    mutationFn: () => {
      const base = window.location.origin;
      return createTopupCheckout({
        salonId,
        amountCents: finalCents,
        successUrl: `${base}/manage/billing/credits-topup?status=success&amount=${finalDollars.toFixed(2)}`,
        cancelUrl:  `${base}/manage/billing/credits-topup`,
      });
    },
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (err: any) => {
      toast({ title: "Payment error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 mb-6">
      <div className="flex items-center gap-2 mb-5">
        <Wallet className="w-4 h-4 text-violet-500" />
        <p className="text-sm font-semibold text-slate-800">Add Funds</p>
      </div>

      {/* Preset amounts */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {PRESET_AMOUNTS.map(({ amount, label, tag }) => (
          <button
            key={amount}
            onClick={() => { setSelectedAmount(amount); setUseCustom(false); }}
            className={`relative flex flex-col items-center py-3 px-2 rounded-xl border text-sm font-semibold transition-all ${
              !useCustom && selectedAmount === amount
                ? "border-violet-500 bg-violet-50 text-violet-700 shadow-sm"
                : "border-slate-200 text-slate-700 hover:border-violet-300 hover:bg-violet-50/50"
            }`}
          >
            {tag && (
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold bg-violet-500 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap">
                {tag}
              </span>
            )}
            {label}
          </button>
        ))}
      </div>

      {/* Custom amount toggle */}
      <div className="mb-5">
        <button
          onClick={() => setUseCustom(!useCustom)}
          className="text-xs text-violet-600 hover:text-violet-800 font-medium transition-colors"
        >
          {useCustom ? "← Choose a preset" : "Enter a custom amount"}
        </button>
        {useCustom && (
          <div className="mt-3 flex items-center border border-slate-300 rounded-xl overflow-hidden focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100 transition-all">
            <span className="px-3 text-slate-500 font-semibold text-sm bg-slate-50 border-r border-slate-200 py-2.5">$</span>
            <input
              type="number"
              min="1"
              step="1"
              placeholder="0.00"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              className="flex-1 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 bg-white outline-none"
            />
          </div>
        )}
      </div>

      {/* Summary + checkout button */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p className="text-xs text-slate-400">You'll add</p>
          <p className="text-lg font-bold text-slate-900">
            {isValid ? `$${finalDollars.toFixed(2)}` : "—"}
          </p>
        </div>
        <button
          onClick={() => topupMutation.mutate()}
          disabled={!isValid || topupMutation.isPending}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors shadow-sm shadow-violet-200"
        >
          {topupMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Zap className="w-4 h-4" />
          )}
          Add Funds
        </button>
      </div>

      {/* Security note */}
      <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
        <Info className="w-3 h-3 shrink-0" />
        Secured by Stripe. Funds are available immediately after payment.
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CreditsTopup() {
  const [searchParams] = useSearchParams();
  const status = searchParams.get("status");
  const successAmount = searchParams.get("amount");

  const { selectedStore } = useSelectedStore();
  const { data: stores = [] } = useStores();
  const salonId = selectedStore?.id ?? stores?.[0]?.id ?? null;

  const { data: balance, isLoading: balanceLoading, refetch, isFetching } = useQuery<BalanceData>({
    queryKey: ["/api/billing/credits/balance"],
    queryFn: fetchBalance,
    staleTime: 15_000,
  });

  const { data: stripeStatus } = useQuery<{ configured: boolean }>({
    queryKey: ["stripe-status"],
    queryFn: fetchStripeStatus,
    staleTime: 60_000,
  });

  const stripeConfigured = stripeStatus?.configured ?? false;
  const currentBalance = parseFloat(balance?.balance ?? "0");

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto px-4 py-8">
        {/* Back */}
        <Link
          to="/manage"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Manage
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shadow-md shadow-violet-200">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Account Balance</h1>
          </div>
          <p className="text-slate-500 text-sm">
            Add funds to power AI Receptionist calls and SMS messages.
          </p>
        </div>

        {/* Success banner */}
        {status === "success" && successAmount && (
          <SuccessBanner amount={successAmount} />
        )}

        {/* Current balance card */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Current Balance
            </p>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="text-slate-400 hover:text-slate-600 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
          {balanceLoading ? (
            <div className="h-10 w-24 rounded-lg bg-slate-100 animate-pulse" />
          ) : (
            <p className="text-4xl font-bold text-slate-900 tracking-tight">
              ${currentBalance.toFixed(2)}
            </p>
          )}

          {/* Use-case pills */}
          <div className="flex gap-2 mt-4 flex-wrap">
            {USE_CASES.map(({ icon: Icon, color, title }) => (
              <span
                key={title}
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${color} bg-opacity-60`}
              >
                <Icon className="w-3 h-3" />
                {title}
              </span>
            ))}
          </div>
        </div>

        {/* Add funds */}
        {stripeConfigured && salonId ? (
          <AddFundsPanel salonId={salonId} />
        ) : !stripeConfigured ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 mb-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Online payments not yet enabled</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Stripe payment keys need to be configured. Contact <a href="mailto:support@certxa.com" className="underline">support@certxa.com</a> to enable top-ups, or add your Stripe keys in the platform settings.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 mb-6 flex items-start gap-3">
            <Info className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-slate-800">Choose a business location to add funds</p>
              <p className="text-xs text-slate-600 mt-0.5">
                We couldn't detect an active store selection for your account yet. Select a location, then return to this page.
              </p>
            </div>
          </div>
        )}

        {/* What your balance is used for */}
        <div className="mt-8 rounded-2xl border border-slate-100 bg-slate-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">
            What your balance is used for
          </p>
          <div className="space-y-4">
            {USE_CASES.map(({ icon: Icon, color, title, desc }) => (
              <div key={title} className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${color} bg-opacity-70`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">{title}</p>
                  <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Transaction History */}
        <TransactionHistory />

        {/* Link back to AI setup */}
        <div className="mt-6 text-center">
          <Link
            to="/manage/ai-receptionist/setup"
            className="text-xs text-slate-400 hover:text-violet-600 transition-colors"
          >
            Back to AI Receptionist setup →
          </Link>
        </div>
      </div>
    </AppLayout>
  );
}
