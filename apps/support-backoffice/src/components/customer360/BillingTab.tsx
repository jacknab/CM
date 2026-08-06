import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard, Calendar, DollarSign, Zap, AlertTriangle,
  Clock, TrendingUp, ExternalLink, CheckCircle2,
  ArrowUpRight, RefreshCw,
} from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { api, type AccountOverview } from "@/lib/api";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useNavigate } from "react-router-dom";

type Props = {
  accountId: number;
  subscription: AccountOverview["subscription"];
  owner: AccountOverview["owner"];
  store: AccountOverview["store"];
};

export default function BillingTab({ accountId, subscription, owner, store }: Props) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showCreditForm, setShowCreditForm] = useState(false);
  const [creditAmount, setCreditAmount] = useState(29);
  const [creditReason, setCreditReason] = useState("");
  const [showTrialForm, setShowTrialForm] = useState(false);
  const [trialDays, setTrialDays] = useState(14);
  const [success, setSuccess] = useState<string | null>(null);

  const done = (msg: string) => {
    setSuccess(msg);
    setShowCreditForm(false);
    setShowTrialForm(false);
    setCreditReason("");
    qc.invalidateQueries({ queryKey: ["support-account-overview", accountId] });
    setTimeout(() => setSuccess(null), 4000);
  };

  const issueCreditM = useMutation({
    mutationFn: () => api.accounts.issueCredit(accountId, creditAmount * 100, creditReason),
    onSuccess: () => done(`$${creditAmount} credit issued`),
  });

  const extendTrialM = useMutation({
    mutationFn: () => api.accounts.extendTrial(accountId, trialDays),
    onSuccess: () => done(`Trial extended by ${trialDays} days`),
  });

  const price = subscription?.priceCents ? (subscription.priceCents / 100) : 0;
  const renewalDate = subscription?.renewalDate ? parseISO(subscription.renewalDate) : null;
  const daysUntilRenewal = renewalDate ? differenceInDays(renewalDate, new Date()) : null;
  const trialEndsAt = owner.trialEndsAt ? parseISO(owner.trialEndsAt) : null;
  const trialDaysLeft = trialEndsAt ? differenceInDays(trialEndsAt, new Date()) : null;
  const platformCredits = store.platformCredits ? parseFloat(store.platformCredits) : 0;
  const isTrialing = owner.subscriptionStatus === "trialing" || owner.subscriptionStatus === "trial";

  return (
    <div className="p-6 max-w-5xl space-y-5">

      {success && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
          <p className="text-sm text-emerald-700">{success}</p>
        </div>
      )}

      {/* ── KPI Strip ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={14} className="text-violet-500" />
            <span className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">MRR</span>
          </div>
          <div className="text-2xl font-bold text-slate-800">${price.toFixed(2)}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">{subscription?.interval === "year" ? "Annual" : "Monthly"}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard size={14} className="text-indigo-500" />
            <span className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">Plan</span>
          </div>
          <div className="text-base font-bold text-slate-800 truncate">{subscription?.planName ?? "No Plan"}</div>
          <div className="mt-0.5">
            <StatusBadge status={subscription?.status ?? owner.subscriptionStatus ?? "unknown"} size="xs" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={14} className="text-teal-500" />
            <span className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">Renewal</span>
          </div>
          <div className="text-base font-bold text-slate-800">
            {renewalDate ? format(renewalDate, "MMM d, yyyy") : "—"}
          </div>
          {daysUntilRenewal != null && (
            <div className={`text-[11px] mt-0.5 ${daysUntilRenewal <= 7 ? "text-amber-600 font-semibold" : "text-slate-400"}`}>
              {daysUntilRenewal >= 0 ? `in ${daysUntilRenewal} days` : `${Math.abs(daysUntilRenewal)} days ago`}
            </div>
          )}
        </div>
        <div className={`rounded-xl border p-4 ${platformCredits > 0 ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200"}`}>
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={14} className={platformCredits > 0 ? "text-emerald-500" : "text-slate-400"} />
            <span className="text-[11px] text-slate-400 uppercase tracking-wide font-semibold">Credits</span>
          </div>
          <div className={`text-2xl font-bold ${platformCredits > 0 ? "text-emerald-700" : "text-slate-800"}`}>
            ${platformCredits.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Platform wallet</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Subscription Detail ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard size={14} className="text-indigo-500" />
              <h3 className="text-sm font-semibold text-slate-700">Subscription Details</h3>
            </div>
            <StatusBadge status={subscription?.status ?? owner.subscriptionStatus ?? "unknown"} size="xs" />
          </div>

          {!subscription ? (
            <div className="p-6 text-center">
              <CreditCard size={28} className="text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-500 font-medium">No active subscription</p>
              {isTrialing && trialEndsAt && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                  <p className="font-semibold">Trial period active</p>
                  <p className="mt-0.5">Ends {format(trialEndsAt, "MMM d, yyyy")}{trialDaysLeft != null ? ` (${trialDaysLeft > 0 ? `${trialDaysLeft} days left` : "expired"})` : ""}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {/* Plan highlight */}
              <div className="bg-indigo-50 rounded-xl p-3.5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-bold text-slate-900">${price.toFixed(2)}<span className="text-xs font-normal text-slate-500">/{subscription.interval === "month" ? "mo" : "yr"}</span></div>
                    <div className="text-xs text-slate-600 mt-0.5">{subscription.planName}</div>
                  </div>
                  <div className="text-right">
                    {subscription.cancelAtPeriodEnd && (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 font-semibold">
                        <AlertTriangle size={9} />
                        Cancelling
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {[
                { label: "Plan Code",    value: subscription.planCode },
                { label: "Billing Cycle",value: subscription.interval === "month" ? "Monthly" : "Annual" },
                { label: "Current Period End", value: subscription.currentPeriodEnd ? format(parseISO(subscription.currentPeriodEnd), "MMM d, yyyy") : "—" },
                { label: "Renewal Date", value: renewalDate ? format(renewalDate, "MMM d, yyyy") : "—" },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                  <span className="text-xs text-slate-500">{r.label}</span>
                  <span className="text-xs font-medium text-slate-700">{r.value}</span>
                </div>
              ))}

              {/* Payment method */}
              {subscription.paymentLast4 && (
                <div className="flex items-center gap-2.5 pt-1">
                  <div className="w-8 h-5 bg-slate-100 rounded flex items-center justify-center flex-shrink-0">
                    <CreditCard size={12} className="text-slate-500" />
                  </div>
                  <span className="text-xs text-slate-600 capitalize">{subscription.paymentBrand}</span>
                  <span className="text-xs text-slate-400">•••• {subscription.paymentLast4}</span>
                </div>
              )}

              {subscription.cancelAtPeriodEnd && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
                  <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">Subscription set to cancel at period end ({renewalDate ? format(renewalDate, "MMM d, yyyy") : "unknown date"}). Customer will lose access after this date.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Trial & Account ──────────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Trial status */}
          {(isTrialing || trialEndsAt) && (
            <div className={`rounded-xl border overflow-hidden ${trialDaysLeft != null && trialDaysLeft <= 3 ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
              <div className="px-4 py-3 border-b border-inherit flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap size={14} className="text-amber-500" />
                  <h3 className="text-sm font-semibold text-slate-700">Trial Period</h3>
                </div>
                {trialDaysLeft != null && (
                  <span className={`text-xs font-bold ${trialDaysLeft <= 0 ? "text-red-600" : trialDaysLeft <= 7 ? "text-amber-600" : "text-emerald-600"}`}>
                    {trialDaysLeft <= 0 ? "Expired" : `${trialDaysLeft} days left`}
                  </span>
                )}
              </div>
              <div className="p-4">
                {trialEndsAt && (
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                      <span>Started {owner.trialStartedAt ? format(parseISO(owner.trialStartedAt), "MMM d") : "—"}</span>
                      <span>Ends {format(trialEndsAt, "MMM d, yyyy")}</span>
                    </div>
                    {owner.trialStartedAt && (
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        {(() => {
                          const start = parseISO(owner.trialStartedAt);
                          const totalDays = differenceInDays(trialEndsAt, start);
                          const elapsed = totalDays - (trialDaysLeft ?? 0);
                          const pct = totalDays > 0 ? Math.min(100, Math.round((elapsed / totalDays) * 100)) : 0;
                          return (
                            <div
                              className={`h-full rounded-full ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-400" : "bg-emerald-500"}`}
                              style={{ width: `${pct}%` }}
                            />
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
                {!showTrialForm ? (
                  <button
                    onClick={() => setShowTrialForm(true)}
                    className="w-full flex items-center justify-center gap-2 py-2 border border-amber-300 hover:bg-amber-50 text-amber-700 rounded-lg text-xs font-medium transition"
                  >
                    <Zap size={12} />
                    Extend Trial Period
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-600">Add days:</label>
                      <input
                        type="number" value={trialDays} min={1} max={90}
                        onChange={e => setTrialDays(parseInt(e.target.value) || 7)}
                        className="w-16 text-xs border border-amber-300 rounded px-2 py-1 focus:outline-none bg-white"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setShowTrialForm(false)} className="text-xs text-slate-500 px-2 py-1 rounded hover:bg-white transition">Cancel</button>
                      <button onClick={() => extendTrialM.mutate()} disabled={extendTrialM.isPending}
                        className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded transition font-medium disabled:opacity-50">
                        {extendTrialM.isPending ? "Extending…" : `Add ${trialDays} Days`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Credit wallet */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign size={14} className="text-emerald-500" />
                <h3 className="text-sm font-semibold text-slate-700">Credit Wallet</h3>
              </div>
              <span className={`text-sm font-bold ${platformCredits > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                ${platformCredits.toFixed(2)}
              </span>
            </div>
            <div className="p-4">
              <p className="text-xs text-slate-500 mb-3">
                Credits are automatically consumed for platform usage (SMS, AI calls). A balance of $0.00 means the account will be blocked from sending messages.
              </p>
              {!showCreditForm ? (
                <button
                  onClick={() => setShowCreditForm(true)}
                  className="w-full flex items-center justify-center gap-2 py-2 border border-emerald-300 hover:bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium transition"
                >
                  <DollarSign size={12} />
                  Issue Credit
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-emerald-700 font-semibold">$</span>
                    <input
                      type="number" value={creditAmount} min={1} max={9999}
                      onChange={e => setCreditAmount(parseFloat(e.target.value) || 0)}
                      className="w-20 text-xs border border-emerald-300 rounded px-2 py-1 focus:outline-none bg-white"
                    />
                  </div>
                  <input
                    type="text" value={creditReason} placeholder="Reason (required)…"
                    onChange={e => setCreditReason(e.target.value)}
                    className="w-full text-xs border border-emerald-300 rounded px-2 py-1 focus:outline-none bg-white"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setShowCreditForm(false)} className="text-xs text-slate-500 px-2 py-1 rounded hover:bg-white transition">Cancel</button>
                    <button onClick={() => issueCreditM.mutate()} disabled={issueCreditM.isPending || !creditReason.trim()}
                      className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded transition font-medium disabled:opacity-50">
                      {issueCreditM.isPending ? "Issuing…" : `Issue $${creditAmount}`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Deep link */}
          <button
            onClick={() => navigate(`/billing-investigation/${accountId}`)}
            className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-indigo-50 group-hover:bg-white rounded-lg flex items-center justify-center transition">
                <TrendingUp size={14} className="text-indigo-500" />
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-slate-700 group-hover:text-indigo-700">Full Billing Investigation</p>
                <p className="text-[10px] text-slate-400">Detailed charges, invoices & history</p>
              </div>
            </div>
            <ArrowUpRight size={14} className="text-slate-300 group-hover:text-indigo-400 transition" />
          </button>
        </div>
      </div>
    </div>
  );
}
