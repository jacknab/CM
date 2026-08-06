import { CreditCard, Calendar, AlertTriangle } from "lucide-react";
import type { AccountOverview } from "@/lib/support-api";
import { StatusBadge } from "../ui/StatusBadge";
import { format } from "date-fns";

type Props = { subscription: AccountOverview["subscription"]; full?: boolean };

export default function SubscriptionCard({ subscription }: Props) {
  if (!subscription) return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <CreditCard size={14} className="text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-700">Subscription & Billing</h3>
      </div>
      <p className="text-sm text-slate-400 text-center py-4">No active subscription</p>
    </div>
  );

  const renewalDate = subscription.renewalDate ? format(new Date(subscription.renewalDate), "MMM d, yyyy") : "—";
  const price = subscription.priceCents ? (subscription.priceCents / 100).toFixed(2) : "0.00";
  const interval = subscription.interval === "month" ? "month" : "year";

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Subscription & Billing</h3>
        <StatusBadge status={subscription.status ?? "active"} size="xs" />
      </div>
      <div className="p-4 space-y-3">
        <div className="bg-indigo-50 rounded-xl p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-bold text-slate-900">${price}<span className="text-xs font-normal text-slate-500">/{interval}</span></div>
              <div className="text-xs text-slate-600 mt-0.5">{subscription.planName ?? subscription.planCode}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Interval</div>
              <div className="text-xs font-semibold text-slate-700 capitalize">{subscription.interval === "month" ? "Monthly" : "Annual"}</div>
            </div>
          </div>
        </div>
        {subscription.paymentLast4 && (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-5 bg-slate-100 rounded flex items-center justify-center">
              <CreditCard size={12} className="text-slate-500" />
            </div>
            <div>
              <span className="text-xs text-slate-700 capitalize">{subscription.paymentBrand}</span>
              <span className="text-xs text-slate-500 ml-1">•••• {subscription.paymentLast4}</span>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 text-xs">
          <Calendar size={13} className="text-slate-400" />
          <span className="text-slate-500">
            {subscription.cancelAtPeriodEnd ? "Cancels" : "Renews"}: <span className="font-medium text-slate-700">{renewalDate}</span>
          </span>
        </div>
        {subscription.cancelAtPeriodEnd && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2">
            <AlertTriangle size={13} className="text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-700">Scheduled to cancel at period end</p>
          </div>
        )}
      </div>
    </div>
  );
}
