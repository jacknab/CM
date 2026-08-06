/**
 * AutoRefillCard — self-contained UI for the platform credits auto-refill feature.
 * Dropped into BillingPage. Handles its own fetch / mutations.
 */

import { useState, useEffect } from "react";
import { Zap, CreditCard, CheckCircle, AlertTriangle, Loader2, RefreshCw, History, ArrowUpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AutoRefillSettings {
  enabled:         boolean;
  threshold:       number;
  amount:          number;
  hasPaymentMethod: boolean;
  paymentMethod:   { brand: string; last4: string } | null;
  currentBalance:  number;
}

interface HistoryEntry {
  id:           number;
  type:         string;
  amount:       string;
  description:  string;
  balance_after: string;
  reference_id: string | null;
  created_at:   string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const THRESHOLDS = [
  { label: "$3",  value: 3  },
  { label: "$5",  value: 5  },
  { label: "$10", value: 10 },
  { label: "$15", value: 15 },
  { label: "$20", value: 20 },
];

const AMOUNTS = [
  { label: "$10",  value: 10  },
  { label: "$25",  value: 25  },
  { label: "$50",  value: 50  },
  { label: "$100", value: 100 },
  { label: "$250", value: 250 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, { credentials: "include", ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || (err as any).message || `Request failed: ${res.status}`);
  }
  return res.json();
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AutoRefillCard({
  salonId,
  stripeConfigured,
}: {
  salonId: number;
  stripeConfigured: boolean;
}) {
  const { toast } = useToast();

  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [settingUpPm, setSettingUpPm] = useState(false);
  const [data, setData]               = useState<AutoRefillSettings | null>(null);
  const [history, setHistory]         = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Local form state
  const [enabled,   setEnabled]   = useState(false);
  const [threshold, setThreshold] = useState(5);
  const [amount,    setAmount]    = useState(25);

  async function load() {
    setLoading(true);
    try {
      const [settings, hist] = await Promise.all([
        apiFetch(`/api/billing/auto-refill/${salonId}`),
        apiFetch(`/api/billing/auto-refill/${salonId}/history`).catch(() => ({ history: [] })),
      ]);
      const d: AutoRefillSettings = settings;
      setData(d);
      setEnabled(d.enabled);
      setThreshold(d.threshold);
      setAmount(d.amount);
      setHistory(hist.history ?? []);
    } catch (e: any) {
      console.warn("[AutoRefillCard] load error:", e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [salonId]);

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch(`/api/billing/auto-refill/${salonId}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ enabled, threshold, amount }),
      });
      await load();
      toast({ title: "Auto-refill saved", description: enabled ? "Your account will top up automatically." : "Auto-refill is now off." });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleSetupPm() {
    setSettingUpPm(true);
    try {
      const { url } = await apiFetch(`/api/billing/auto-refill/setup-pm/${salonId}`, { method: "POST" });
      window.location.href = url;
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setSettingUpPm(false);
    }
  }

  const isDirty =
    enabled   !== (data?.enabled   ?? false) ||
    threshold !== (data?.threshold ?? 5)      ||
    amount    !== (data?.amount    ?? 25);

  const bal = data?.currentBalance ?? 0;
  const balColor =
    bal <= -10 ? "text-red-400"    :
    bal < 0    ? "text-orange-400" :
    bal < 5    ? "text-amber-400"  :
                 "text-emerald-400";

  if (!stripeConfigured) return null;

  return (
    <Card className="bg-zinc-900/70 border-zinc-700/50 overflow-hidden">
      <CardHeader className="pb-0 pt-5 px-6">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          AI Credits Auto-Refill
        </CardTitle>
        <p className="text-zinc-500 text-xs mt-1">
          Automatically top up your AI Receptionist balance using a saved card when it drops below a threshold.
        </p>
      </CardHeader>

      <CardContent className="p-6 space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 text-zinc-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {/* Current balance */}
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/50 border border-zinc-700/40">
              <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Current AI Credits</span>
              <span className={`text-lg font-black ${balColor}`}>
                {bal < 0 ? `-$${Math.abs(bal).toFixed(2)}` : `$${bal.toFixed(2)}`}
              </span>
            </div>

            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-200 text-sm font-semibold">Enable Auto-Refill</p>
                <p className="text-zinc-500 text-xs mt-0.5">Automatically charge your saved card when balance is low</p>
              </div>
              <button
                onClick={() => setEnabled(e => !e)}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${enabled ? "bg-amber-500" : "bg-zinc-700"}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`}
                />
              </button>
            </div>

            {enabled && (
              <div className="space-y-4 pt-1">
                {/* Threshold */}
                <div>
                  <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-2">
                    Trigger when balance drops below
                  </p>
                  <div className="grid grid-cols-5 gap-2">
                    {THRESHOLDS.map(t => (
                      <button
                        key={t.value}
                        onClick={() => setThreshold(t.value)}
                        className={`py-2 rounded-xl border text-sm font-bold transition-colors ${
                          threshold === t.value
                            ? "border-amber-500/60 bg-amber-500/10 text-amber-300"
                            : "border-zinc-700/40 bg-zinc-800/30 text-zinc-400 hover:border-zinc-600"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Refill amount */}
                <div>
                  <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-2">
                    Refill amount
                  </p>
                  <div className="grid grid-cols-5 gap-2">
                    {AMOUNTS.map(a => (
                      <button
                        key={a.value}
                        onClick={() => setAmount(a.value)}
                        className={`py-2 rounded-xl border text-sm font-bold transition-colors ${
                          amount === a.value
                            ? "border-amber-500/60 bg-amber-500/10 text-amber-300"
                            : "border-zinc-700/40 bg-zinc-800/30 text-zinc-400 hover:border-zinc-600"
                        }`}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview */}
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-500/6 border border-amber-500/20 text-xs text-amber-300/80">
                  <Zap className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                  When your balance drops below <strong className="mx-0.5">${threshold}</strong>, we'll automatically charge your card <strong className="mx-0.5">${amount}</strong>.
                </div>

                {/* Payment method status */}
                <div className="space-y-2">
                  <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Payment Method</p>
                  {data?.hasPaymentMethod && data.paymentMethod ? (
                    <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-800/40 border border-emerald-500/20">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div>
                          <p className="text-zinc-200 text-sm font-semibold capitalize">
                            {data.paymentMethod.brand} •••• {data.paymentMethod.last4}
                          </p>
                          <p className="text-zinc-500 text-xs">Used for auto-refills</p>
                        </div>
                      </div>
                      <button
                        onClick={handleSetupPm}
                        disabled={settingUpPm}
                        className="text-zinc-500 hover:text-zinc-300 text-xs font-medium flex items-center gap-1 transition-colors"
                      >
                        {settingUpPm ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Change
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-800/40 border border-amber-500/20">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <div className="flex-1">
                        <p className="text-zinc-300 text-sm font-semibold">No payment method saved</p>
                        <p className="text-zinc-500 text-xs">Add a card to enable automatic top-ups</p>
                      </div>
                      <button
                        onClick={handleSetupPm}
                        disabled={settingUpPm}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition-colors disabled:opacity-60"
                      >
                        {settingUpPm ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <><CreditCard className="w-3 h-3" /> Add Card</>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Save button */}
            {isDirty && (
              <button
                onClick={handleSave}
                disabled={saving || (enabled && !data?.hasPaymentMethod)}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                  : enabled && !data?.hasPaymentMethod
                    ? "Add a payment method first"
                    : "Save Auto-Refill Settings"
                }
              </button>
            )}

            {!isDirty && data?.enabled && (
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                <CheckCircle className="w-3.5 h-3.5" />
                Auto-refill active · charges ${data.amount} when balance falls below ${data.threshold}
              </div>
            )}

            {/* Refill history */}
            {history.length > 0 && (
              <div className="pt-1 border-t border-zinc-800">
                <button
                  onClick={() => setShowHistory(h => !h)}
                  className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 text-xs font-semibold transition-colors w-full py-1"
                >
                  <History className="w-3.5 h-3.5" />
                  {showHistory ? "Hide" : "Show"} refill history ({history.length})
                </button>

                {showHistory && (
                  <div className="mt-3 space-y-1.5">
                    {history.map(entry => {
                      const amt = parseFloat(entry.amount);
                      const bal = parseFloat(entry.balance_after);
                      const isAutoRefill = entry.description?.toLowerCase().includes("auto-refill");
                      return (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-zinc-800/40 border border-zinc-700/30"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <ArrowUpCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-zinc-300 text-xs font-semibold truncate">
                                {isAutoRefill ? "Auto-refill" : "Manual top-up"}
                              </p>
                              <p className="text-zinc-600 text-xs">{fmtDate(entry.created_at)}</p>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 pl-3">
                            <p className="text-emerald-400 text-xs font-bold">+${amt.toFixed(2)}</p>
                            <p className="text-zinc-600 text-xs">bal ${bal.toFixed(2)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
