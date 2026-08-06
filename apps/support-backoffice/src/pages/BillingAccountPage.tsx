import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft, ExternalLink, RefreshCw, ChevronDown, CheckCircle,
  XCircle, Clock, AlertCircle, DollarSign, CreditCard, TrendingUp,
  AlertTriangle, RotateCcw, Plus, X, Loader2, FileText, Wallet,
  Receipt, History, Ban, Phone, MapPin, Globe,
  Edit2, Info, Building2, Mail,
} from "lucide-react";
import { format } from "date-fns";
import { clsx } from "clsx";

// ─── API ──────────────────────────────────────────────────────────────────────

const BASE = "/api/support";
const req = <T,>(path: string, opts?: RequestInit): Promise<T> =>
  fetch(`${BASE}${path}`, { credentials: "include", headers: { "Content-Type": "application/json" }, ...opts }).then(r => r.json());

// ─── Types ────────────────────────────────────────────────────────────────────

interface BillingData {
  store: {
    id: number; name: string; phone?: string | null; email?: string | null;
    city?: string | null; state?: string | null; timezone?: string | null;
    accountStatus?: string | null; category?: string | null; account_id?: string | null;
    stripeCustomerId?: string | null;
  };
  owner: {
    id: string; email: string; firstName: string; lastName: string;
    signupDate: string | null; trialEndsAt: string | null; profileImageUrl?: string | null;
  };
  subscription: {
    planCode: string; planName: string; priceCents: number; interval: string; status: string;
    currentPeriodEnd: string | null; paymentBrand?: string | null; paymentLast4?: string | null;
    cancelAtPeriodEnd: boolean; stripeSubscriptionId?: string | null; startDate?: string | null;
  } | null;
  kpi: {
    failedPaymentsCount: number; nextRetryDate: string | null; totalAtRiskCents: number;
    overdueCount: number; overdueCents: number; daysPastDue: number;
    lifetimeValueCents: number; mrrCents: number;
    creditBalanceCents: number; walletBalanceCents: number; unpaidInvoiceCents: number;
  };
  paymentMethod: { brand: string; last4: string; expMonth: number; expYear: number } | null;
  payments: any[]; invoices: any[]; refunds: any[]; wallet: any[];
  credits: any[]; disputes: any[]; notes: any[]; timeline: any[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCents(cents: number): string {
  return `$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}
function fmtDate(d?: string | null): string {
  if (!d) return "—";
  try { return format(new Date(d), "MMM d, yyyy"); } catch { return "—"; }
}

// ─── Status pill ─────────────────────────────────────────────────────────────

function BillingStatus({ status }: { status?: string | null }) {
  const s = (status ?? "").toLowerCase().replace(/[_ ]/g, "_");
  const cfg =
    s === "paid" || s === "succeeded" || s === "active" || s === "completed" || s === "applied"
      ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
    s === "failed" || s === "dispute" || s === "suspended"
      ? "bg-red-100 text-red-700 border-red-200" :
    s === "past_due" || s === "open" || s === "overdue"
      ? "bg-orange-100 text-orange-700 border-orange-200" :
    s === "pending" || s === "refunded" || s === "refund"
      ? "bg-blue-100 text-blue-700 border-blue-200" :
    s === "trialing" || s === "trial"
      ? "bg-sky-100 text-sky-700 border-sky-200" :
    s === "canceled" || s === "cancelled"
      ? "bg-slate-100 text-slate-500 border-slate-200" :
      "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span className={clsx("text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize whitespace-nowrap", cfg)}>
      {status ?? "Unknown"}
    </span>
  );
}

// ─── Modal Shell ──────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"><X size={15} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── KPI Cards ────────────────────────────────────────────────────────────────

function KPIGrid({ kpi, pm, customerSince }: { kpi: BillingData["kpi"]; pm: BillingData["paymentMethod"]; customerSince?: string | null }) {
  return (
    <div className="grid grid-cols-4 gap-4 mb-5">
      {/* Payment Issues */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle size={13} className="text-rose-500" />
          <span className="text-[10px] font-semibold text-rose-600 uppercase tracking-wide">Payment Issues</span>
        </div>
        <div className="text-2xl font-black text-rose-600 leading-none mb-1">{kpi.failedPaymentsCount}</div>
        <div className="text-[10px] text-slate-500">Open issues</div>
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-[10px]">
          <div>
            <div className="text-slate-400">Next retry</div>
            <div className="font-medium text-slate-700">{fmtDate(kpi.nextRetryDate)}</div>
          </div>
          <div>
            <div className="text-slate-400">Total at risk</div>
            <div className="font-semibold text-rose-600">{fmtCents(kpi.totalAtRiskCents)}</div>
          </div>
        </div>
      </div>

      {/* Past Due */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Clock size={13} className="text-orange-500" />
          <span className="text-[10px] font-semibold text-orange-600 uppercase tracking-wide">Past Due</span>
        </div>
        <div className={clsx("text-2xl font-black leading-none mb-1", kpi.overdueCents > 0 ? "text-orange-600" : "text-slate-400")}>
          {fmtCents(kpi.overdueCents)}
        </div>
        <div className="text-[10px] text-slate-500">{kpi.overdueCount} invoice{kpi.overdueCount !== 1 ? "s" : ""}</div>
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-[10px]">
          <div>
            <div className="text-slate-400">Due date</div>
            <div className="font-medium text-slate-700">—</div>
          </div>
          <div>
            <div className="text-slate-400">Days past due</div>
            <div className={clsx("font-semibold", kpi.daysPastDue > 7 ? "text-rose-600" : "text-orange-600")}>
              {kpi.daysPastDue > 0 ? `${kpi.daysPastDue} days` : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Lifetime Value */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp size={13} className="text-emerald-500" />
          <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">Lifetime Value</span>
        </div>
        <div className="text-2xl font-black text-emerald-600 leading-none mb-1">{fmtCents(kpi.lifetimeValueCents)}</div>
        <div className="text-[10px] text-slate-500">Total paid</div>
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-[10px]">
          <div>
            <div className="text-slate-400">MRR</div>
            <div className="font-semibold text-emerald-600">{fmtCents(kpi.mrrCents)}</div>
          </div>
          <div>
            <div className="text-slate-400">Customer since</div>
            <div className="font-medium text-slate-700">{fmtDate(customerSince)}</div>
          </div>
        </div>
      </div>

      {/* Payment Method */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <CreditCard size={13} className="text-indigo-500" />
          <span className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wide">Payment Method</span>
        </div>
        {pm ? (
          <>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-5 bg-slate-100 rounded flex items-center justify-center">
                <CreditCard size={10} className="text-slate-500" />
              </div>
              <div className="text-sm font-bold text-slate-800 capitalize">{pm.brand}</div>
              <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full border border-indigo-200 font-semibold">Default</span>
            </div>
            <div className="text-[11px] text-slate-500">···· {pm.last4}</div>
            <div className="mt-3 pt-3 border-t border-slate-100 text-[10px]">
              <div className="text-slate-400">Expires</div>
              <div className="font-medium text-slate-700">{pm.expMonth?.toString().padStart(2, "0")} / {pm.expYear}</div>
            </div>
            <button className="mt-2 text-[10px] text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-0.5">
              View all payment methods <ChevronDown size={9} className="-rotate-90 ml-0.5" />
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-16 text-center">
            <p className="text-xs text-slate-400">No payment method on file</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Billing Activity Table ───────────────────────────────────────────────────

const TYPE_ICON: Record<string, React.ReactNode> = {
  invoice:    <FileText size={12} className="text-slate-500" />,
  payment:    <CreditCard size={12} className="text-emerald-500" />,
  refund:     <RotateCcw size={12} className="text-blue-500" />,
  wallet:     <Wallet size={12} className="text-violet-500" />,
  credit:     <DollarSign size={12} className="text-amber-500" />,
  chargeback: <AlertTriangle size={12} className="text-rose-500" />,
};

const TYPE_LABEL: Record<string, string> = {
  invoice: "Invoice", payment: "Payment", refund: "Refund",
  wallet: "Wallet", credit: "Credit", chargeback: "Chargeback",
};

function BillingTable({ items, onSelect }: { items: any[]; onSelect?: (item: any) => void }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="grid grid-cols-[120px_140px_1fr_120px_100px] gap-4 px-5 py-3 border-b border-slate-100 bg-slate-50">
        {["Date", "Type", "Description", "Status", "Amount"].map(h => (
          <div key={h} className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide last:text-right">{h}</div>
        ))}
      </div>
      {items.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-slate-400 text-sm">No transactions found</div>
      ) : (
        <div className="divide-y divide-slate-50">
          {items.map((item, i) => {
            const amount = Number(item.amount ?? 0);
            const amountStr = item.type === "payment" ? `-${fmtCents(Math.abs(amount))}` : fmtCents(Math.abs(amount));
            const isNeg = item.type === "payment";
            return (
              <button
                key={item.id ?? i}
                onClick={() => onSelect?.(item)}
                className="w-full grid grid-cols-[120px_140px_1fr_120px_100px] gap-4 px-5 py-3 hover:bg-slate-50 transition text-left items-center"
              >
                <div className="text-xs text-slate-500">{fmtDate(item.date)}</div>
                <div className="flex items-center gap-2">
                  <span>{TYPE_ICON[item.type] ?? <Receipt size={12} />}</span>
                  <span className="text-xs text-slate-700 font-medium">{TYPE_LABEL[item.type] ?? item.type}</span>
                </div>
                <div className="text-xs text-slate-700 truncate">{item.description}</div>
                <div><BillingStatus status={item.status} /></div>
                <div className={clsx("text-xs font-semibold text-right", isNeg ? "text-slate-600" : "text-emerald-600")}>
                  {isNeg ? "-" : "+"}{fmtCents(Math.abs(amount))}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Action Grid ─────────────────────────────────────────────────────────────

const ACTIONS = [
  { key: "retry",   label: "Payment Failed",         sub: "Investigate failed or declined payments", icon: <AlertCircle size={16} className="text-rose-500" /> },
  { key: "method",  label: "Update Payment Method",  sub: "Update or replace card on file",          icon: <CreditCard size={16} className="text-indigo-500" /> },
  { key: "refund",  label: "Refund Payment",          sub: "Issue a full or partial refund",          icon: <RotateCcw size={16} className="text-blue-500" /> },
  { key: "credit",  label: "Apply Credit",            sub: "Apply account credit balance",            icon: <DollarSign size={16} className="text-emerald-500" /> },
  { key: "trial",   label: "Extend Trial / Access",  sub: "Grant trial extension or access",          icon: <Clock size={16} className="text-amber-500" /> },
  { key: "manual",  label: "Record Manual Payment",  sub: "Record offline or custom payment",        icon: <FileText size={16} className="text-slate-500" /> },
];

function ActionGrid({ onAction }: { onAction: (key: string) => void }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <h3 className="text-xs font-bold text-slate-700 mb-3">Issue Shortcuts</h3>
      <div className="grid grid-cols-2 gap-2">
        {ACTIONS.map(a => (
          <button
            key={a.key}
            onClick={() => onAction(a.key)}
            className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/40 transition group text-left"
          >
            <div className="w-8 h-8 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-center flex-shrink-0 group-hover:border-indigo-200">
              {a.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-800 group-hover:text-indigo-700 transition leading-tight">{a.label}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{a.sub}</p>
            </div>
            <ChevronDown size={11} className="text-slate-300 group-hover:text-indigo-400 transition rotate-[-90deg] mt-1 flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Customer Right Sidebar ───────────────────────────────────────────────────

function getLocalTime(timezone: string | null | undefined): string {
  if (!timezone) return "—";
  try {
    const time = new Intl.DateTimeFormat("en-US", {
      hour: "numeric", minute: "2-digit", hour12: true, timeZone: timezone,
    }).format(new Date());
    const abbr = timezone.split("/").pop()?.replace(/_/g, " ") ?? timezone;
    return `${time} (${abbr})`;
  } catch { return "—"; }
}

function CustomerSidebar({ data, accountId }: { data: BillingData; accountId: number }) {
  const { store, owner, subscription, kpi, notes } = data;
  const qc = useQueryClient();
  const [addingNote, setAddingNote] = useState(false);
  const [noteContent, setNoteContent] = useState("");

  const addNote = useMutation({
    mutationFn: (c: string) =>
      req(`/billing/${accountId}/add-note`, { method: "POST", body: JSON.stringify({ content: c }) }),
    onSuccess: () => {
      setNoteContent(""); setAddingNote(false);
      qc.invalidateQueries({ queryKey: ["billing", accountId] });
    },
  });

  const ownerName = [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.email;
  const totalBalance = kpi.creditBalanceCents - kpi.unpaidInvoiceCents;
  const isNegBalance = totalBalance < 0;

  return (
    <div className="w-72 flex-shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-y-auto scrollbar-thin">
      {/* Customer Details */}
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-slate-700">Customer Details</p>
          <button className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
            <Edit2 size={9} /> Edit
          </button>
        </div>
        {/* Avatar */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {ownerName.slice(0,2).toUpperCase() || "?"}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800 leading-tight">{ownerName}</p>
            <p className="text-[10px] text-slate-400">{subscription?.planName ?? "No plan"} · Billing Contact</p>
          </div>
        </div>
        <div className="space-y-2">
          {[
            { icon: <Mail size={11} />, value: owner.email },
            store.phone && { icon: <Phone size={11} />, value: store.phone },
            (store.city || store.state) && { icon: <MapPin size={11} />, value: [store.city, store.state].filter(Boolean).join(", ") },
            { icon: <Globe size={11} />, value: "English (US)" },
            store.timezone && { icon: <Clock size={11} />, value: `Local time ${getLocalTime(store.timezone)}` },
          ].filter(Boolean).map((row: any, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px] text-slate-600">
              <span className="text-slate-400 flex-shrink-0">{row.icon}</span>
              <span className="truncate">{row.value}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-1">
          <span className="text-[10px] text-slate-400">Customer since</span>
          <span className="text-[10px] font-medium text-slate-700">{fmtDate(owner.signupDate)}</span>
        </div>
      </div>

      {/* Account Balance */}
      <div className="p-4 border-b border-slate-100">
        <p className="text-xs font-bold text-slate-700 mb-3">Account Balance</p>
        <div className="space-y-2">
          {[
            { label: "Credit Balance",    value: fmtCents(kpi.creditBalanceCents), cls: "text-emerald-600" },
            { label: "Unapplied Credits", value: "$0.00",                          cls: "text-slate-700" },
            { label: "Unpaid Invoices",   value: kpi.unpaidInvoiceCents > 0 ? `-${fmtCents(kpi.unpaidInvoiceCents)}` : "$0.00", cls: kpi.unpaidInvoiceCents > 0 ? "text-rose-600" : "text-slate-700" },
          ].map(r => (
            <div key={r.label} className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">{r.label}</span>
              <span className={clsx("text-[11px] font-semibold", r.cls)}>{r.value}</span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <span className="text-xs font-bold text-slate-700">Total Balance</span>
            <span className={clsx("text-xs font-black", isNegBalance ? "text-rose-600" : "text-emerald-600")}>
              {isNegBalance ? "-" : ""}{fmtCents(Math.abs(totalBalance))}
            </span>
          </div>
        </div>
      </div>

      {/* Subscription */}
      {subscription && (
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-slate-700">Subscriptions</p>
            <a href="#" className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium">View all</a>
          </div>
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-800">{subscription.planName}</p>
              <BillingStatus status={subscription.status} />
            </div>
            <div className="space-y-1 text-[10px]">
              <div className="flex justify-between">
                <span className="text-slate-400">Amount</span>
                <span className="font-medium text-slate-700">{fmtCents(subscription.priceCents ?? 0)}/{subscription.interval ?? "mo"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Next billing</span>
                <span className="font-medium text-slate-700">{fmtDate(subscription.currentPeriodEnd)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Start date</span>
                <span className="font-medium text-slate-700">{fmtDate(subscription.startDate)}</span>
              </div>
              {subscription.paymentBrand && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Card</span>
                  <span className="font-medium text-slate-700 capitalize">{subscription.paymentBrand} ···{subscription.paymentLast4}</span>
                </div>
              )}
            </div>
            <button className="mt-2.5 w-full flex items-center justify-center gap-1.5 text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold py-1.5 rounded-lg border border-indigo-200 hover:bg-indigo-50 transition">
              Manage Subscription <ExternalLink size={9} />
            </button>
          </div>
        </div>
      )}


      {/* Notes */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-slate-700">Notes</p>
          <button
            onClick={() => setAddingNote(a => !a)}
            className="flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-800 font-medium"
          >
            <Plus size={9} /> Add Note
          </button>
        </div>

        {addingNote && (
          <div className="mb-3 space-y-2">
            <textarea
              value={noteContent}
              onChange={e => setNoteContent(e.target.value)}
              placeholder="Add a billing note…"
              rows={3}
              className="w-full text-xs border border-amber-200 rounded-lg p-2 resize-none bg-amber-50 focus:outline-none focus:border-amber-400"
              autoFocus
            />
            <div className="flex gap-1.5 justify-end">
              <button onClick={() => setAddingNote(false)} className="text-xs text-slate-500 px-2 py-1 rounded hover:bg-slate-50">Cancel</button>
              <button
                onClick={() => noteContent.trim() && addNote.mutate(noteContent)}
                disabled={!noteContent.trim() || addNote.isPending}
                className="text-xs bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-3 py-1 rounded font-medium transition"
              >
                {addNote.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
          {notes.length === 0 && !addingNote && (
            <p className="text-[10px] text-slate-400 italic">No notes yet</p>
          )}
          {notes.map((n: any) => (
            <div key={n.id} className="bg-amber-50 rounded-lg p-2.5 border border-amber-100">
              <p className="text-[11px] text-slate-700 leading-snug">{n.content}</p>
              <p className="text-[9px] text-slate-400 mt-1.5">{n.agent_name} · {fmtDate(n.created_at)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { key: "overview",       label: "Overview" },
  { key: "payments",       label: "Payments" },
  { key: "subscriptions",  label: "Subscriptions" },
  { key: "invoices",       label: "Invoices" },
  { key: "credits",        label: "Credits & Refunds" },
  { key: "transactions",   label: "Transactions" },
  { key: "tax",            label: "Tax" },
  { key: "chargebacks",    label: "Chargebacks" },
  { key: "changes",        label: "Changes" },
  { key: "timeline",       label: "Timeline" },
];

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ data, accountId, onAction }: { data: BillingData; accountId: number; onAction: (k: string) => void }) {
  return (
    <div className="flex-1 min-w-0 overflow-y-auto p-5 space-y-5">
      <KPIGrid kpi={data.kpi} pm={data.paymentMethod} customerSince={data.owner.signupDate} />
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-800">Recent Billing Activity</h3>
          <a href="#" className="text-xs text-indigo-600 hover:underline">View all activity</a>
        </div>
        <BillingTable items={data.timeline.slice(0, 8)} />
      </div>
      <ActionGrid onAction={onAction} />
    </div>
  );
}

function PaymentsTab({ data }: { data: BillingData }) {
  const items = data.payments.map(p => ({
    type: "payment", date: p.created_at, id: `pay-${p.id}`,
    description: `Payment${p.stripe_invoice_id ? ` for ${p.stripe_invoice_id.slice(0, 12)}` : ""}`,
    status: p.status, amount: p.amount_cents ?? 0,
    meta: p,
  }));
  return (
    <div className="flex-1 p-5 overflow-y-auto">
      {data.kpi.failedPaymentsCount > 0 && (
        <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-xl p-4 mb-5">
          <AlertCircle size={16} className="text-rose-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-rose-800">{data.kpi.failedPaymentsCount} failed payment{data.kpi.failedPaymentsCount !== 1 ? "s" : ""}</p>
            <p className="text-xs text-rose-600 mt-0.5">Total at risk: {fmtCents(data.kpi.totalAtRiskCents)}</p>
          </div>
        </div>
      )}
      <BillingTable items={items} />
    </div>
  );
}

function InvoicesTab({ data }: { data: BillingData }) {
  const items = data.invoices.map(i => ({
    type: "invoice", date: i.created_at, id: `inv-${i.id}`,
    description: `INV-${i.invoice_number ?? i.id}`,
    status: i.paid ? "paid" : (i.status ?? "open"),
    amount: i.total_cents ?? 0, meta: i,
  }));
  return <div className="flex-1 p-5 overflow-y-auto"><BillingTable items={items} /></div>;
}

function SubscriptionsTab({ data }: { data: BillingData }) {
  const { subscription } = data;
  return (
    <div className="flex-1 p-5 overflow-y-auto">
      {!subscription ? (
        <div className="flex items-center justify-center h-48">
          <p className="text-slate-400 text-sm">No subscription found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-lg">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">{subscription.planName}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{subscription.planCode}</p>
            </div>
            <BillingStatus status={subscription.status} />
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            {[
              { label: "Amount",       value: `${fmtCents(subscription.priceCents ?? 0)} / ${subscription.interval ?? "month"}` },
              { label: "Next billing", value: fmtDate(subscription.currentPeriodEnd) },
              { label: "Card on file", value: subscription.paymentBrand ? `${subscription.paymentBrand} ···${subscription.paymentLast4}` : "—" },
              { label: "Cancel at period end", value: subscription.cancelAtPeriodEnd ? "Yes" : "No" },
            ].map(r => (
              <div key={r.label}>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">{r.label}</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">{r.value}</p>
              </div>
            ))}
          </div>
          {subscription.stripeSubscriptionId && (
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">Stripe Subscription ID</p>
              <p className="text-xs font-mono text-slate-700 mt-0.5">{subscription.stripeSubscriptionId}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CreditsTab({ data }: { data: BillingData }) {
  const refundItems = data.refunds.map(r => ({
    type: "refund", date: r.created_at, id: `ref-${r.id}`,
    description: `Refund${r.reason ? ` — ${r.reason}` : ""}`,
    status: r.status, amount: r.amount_cents ?? 0,
  }));
  const creditItems = data.credits.map(c => ({
    type: "credit", date: c.created_at, id: `crd-${c.id}`,
    description: c.description ?? `Credit ${c.type}`,
    status: "applied", amount: (c.amount ?? 0) * 100,
  }));
  return (
    <div className="flex-1 p-5 overflow-y-auto">
      <div className="mb-5">
        <h3 className="text-sm font-bold text-slate-800 mb-3">Refunds</h3>
        <BillingTable items={refundItems} />
      </div>
      <div>
        <h3 className="text-sm font-bold text-slate-800 mb-3">Platform Credits</h3>
        <BillingTable items={creditItems} />
      </div>
    </div>
  );
}

function TransactionsTab({ data }: { data: BillingData }) {
  const items = data.wallet.map(w => ({
    type: "wallet", date: w.created_at, id: `wlt-${w.id}`,
    description: w.description ?? `Wallet ${w.transaction_type}`,
    status: w.status, amount: w.amount ?? 0,
  }));
  return (
    <div className="flex-1 p-5 overflow-y-auto">
      <div className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-xl p-4 mb-5">
        <Wallet size={16} className="text-violet-500" />
        <div>
          <p className="text-sm font-semibold text-violet-800">Wallet Balance: {fmtCents(data.kpi.walletBalanceCents)}</p>
          <p className="text-xs text-violet-600 mt-0.5">SMS credits and AI receptionist minutes top-ups</p>
        </div>
      </div>
      <BillingTable items={items} />
    </div>
  );
}

function ChargebacksTab({ data }: { data: BillingData }) {
  const items = data.disputes.map(d => ({
    type: "chargeback", date: d.created_at, id: `cb-${d.id}`,
    description: `Dispute — ${d.dispute_status ?? "unknown"}`,
    status: d.dispute_status, amount: d.amount_cents ?? 0,
  }));
  return (
    <div className="flex-1 p-5 overflow-y-auto">
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-2">
          <CheckCircle size={36} className="text-emerald-300" />
          <p className="text-slate-500 font-medium text-sm">No chargebacks or disputes</p>
          <p className="text-slate-400 text-xs">This account has a clean payment history</p>
        </div>
      ) : (
        <BillingTable items={items} />
      )}
    </div>
  );
}

function TimelineTab({ data }: { data: BillingData }) {
  return (
    <div className="flex-1 p-5 overflow-y-auto">
      <div className="space-y-1">
        {data.timeline.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-slate-400 text-sm">No timeline events</div>
        ) : data.timeline.map((item: any, i: number) => (
          <div key={item.id ?? i} className="flex items-start gap-4 py-3">
            <div className="flex flex-col items-center">
              <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center border border-slate-200 flex-shrink-0">
                {TYPE_ICON[item.type] ?? <History size={12} className="text-slate-400" />}
              </div>
              {i < data.timeline.length - 1 && <div className="w-px h-4 bg-slate-200 mt-1" />}
            </div>
            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-semibold text-slate-800">{item.description}</p>
                <BillingStatus status={item.status} />
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">{fmtDate(item.date)}</p>
            </div>
            <div className="text-xs font-semibold text-slate-700 flex-shrink-0">
              {item.amount !== 0 ? fmtCents(Math.abs(Number(item.amount))) : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TaxTab() {
  return (
    <div className="flex-1 p-5 overflow-y-auto">
      <div className="flex flex-col items-center justify-center h-48 gap-2">
        <FileText size={36} className="text-slate-200" />
        <p className="text-slate-500 font-medium text-sm">Tax documents</p>
        <p className="text-slate-400 text-xs">Tax records and filings will appear here</p>
      </div>
    </div>
  );
}

function ChangesTab() {
  return (
    <div className="flex-1 p-5 overflow-y-auto">
      <div className="flex flex-col items-center justify-center h-48 gap-2">
        <History size={36} className="text-slate-200" />
        <p className="text-slate-500 font-medium text-sm">Subscription changes</p>
        <p className="text-slate-400 text-xs">Plan upgrades, downgrades, and modifications will appear here</p>
      </div>
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function RefundModal({ accountId, onClose, onSuccess }: { accountId: number; onClose: () => void; onSuccess: () => void }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("requested_by_customer");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await req(`/billing/${accountId}/add-note`, {
        method: "POST",
        body: JSON.stringify({ content: `Refund issued: $${amount} — ${reason}${note ? ` — ${note}` : ""}` }),
      });
      onSuccess();
    } finally { setLoading(false); }
  };

  return (
    <Modal title="Refund Payment" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Refund Amount ($)</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Reason</label>
          <select value={reason} onChange={e => setReason(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
            <option value="requested_by_customer">Requested by customer</option>
            <option value="duplicate">Duplicate charge</option>
            <option value="fraudulent">Fraudulent transaction</option>
            <option value="service_not_received">Service not received</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Internal Note (optional)</label>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Any additional context…"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
          <button onClick={handleSubmit} disabled={!amount || loading}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition flex items-center gap-2">
            {loading && <Loader2 size={13} className="animate-spin" />} Issue Refund
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CreditModal({ accountId, onClose, onSuccess }: { accountId: number; onClose: () => void; onSuccess: () => void }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const handleSubmit = async () => {
    setLoading(true);
    try {
      await req(`/billing/${accountId}/apply-credit`, {
        method: "POST",
        body: JSON.stringify({ amount: parseFloat(amount), description: note || undefined }),
      });
      onSuccess();
    } finally { setLoading(false); }
  };
  return (
    <Modal title="Apply Credit" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Credit Amount ($)</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Reason / Description</label>
          <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Goodwill credit, billing error, etc."
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
          <button onClick={handleSubmit} disabled={!amount || loading}
            className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-medium transition flex items-center gap-2">
            {loading && <Loader2 size={13} className="animate-spin" />} Apply Credit
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RetryModal({ accountId, onClose, onSuccess }: { accountId: number; onClose: () => void; onSuccess: () => void }) {
  const [loading, setLoading] = useState(false);
  const handleRetry = async () => {
    setLoading(true);
    try {
      await req(`/billing/${accountId}/retry-payment`, { method: "POST" });
      onSuccess();
    } finally { setLoading(false); }
  };
  return (
    <Modal title="Retry Failed Payment" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">This will attempt to charge the customer's card on file again. Make sure the payment method is valid before retrying.</p>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
          <button onClick={handleRetry} disabled={loading}
            className="px-4 py-2 text-sm bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg font-medium transition flex items-center gap-2">
            {loading && <Loader2 size={13} className="animate-spin" />} Retry Payment
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CancelSubModal({ accountId, onClose, onSuccess }: { accountId: number; onClose: () => void; onSuccess: () => void }) {
  const [immediately, setImmediately] = useState(false);
  const [loading, setLoading] = useState(false);
  const handleCancel = async () => {
    setLoading(true);
    try {
      await req(`/billing/${accountId}/cancel-subscription`, { method: "POST", body: JSON.stringify({ immediately }) });
      onSuccess();
    } finally { setLoading(false); }
  };
  return (
    <Modal title="Cancel Subscription" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-xl p-4">
          <Ban size={16} className="text-rose-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-rose-800">This action cannot be undone. The customer will lose access to the platform.</p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={immediately} onChange={e => setImmediately(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500" />
          <span className="text-sm text-slate-700">Cancel immediately (otherwise at period end)</span>
        </label>
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Keep Subscription</button>
          <button onClick={handleCancel} disabled={loading}
            className="px-4 py-2 text-sm bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg font-medium transition flex items-center gap-2">
            {loading && <Loader2 size={13} className="animate-spin" />} Cancel Subscription
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Trial Extension Modal ────────────────────────────────────────────────────

function TrialExtensionModal({ accountId, currentTrialEnd, onClose, onSuccess }: {
  accountId: number; currentTrialEnd?: string | null; onClose: () => void; onSuccess: () => void;
}) {
  const PRESETS = [{ label: "+7 days", days: 7 }, { label: "+14 days", days: 14 }, { label: "+30 days", days: 30 }, { label: "+60 days", days: 60 }];
  const [days, setDays] = useState<number | null>(null);
  const [customDate, setCustomDate] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const resolvedDate = (() => {
    if (customDate) return new Date(customDate).toISOString();
    if (days !== null) {
      const base = currentTrialEnd ? new Date(currentTrialEnd) : new Date();
      if (base < new Date()) base.setTime(new Date().getTime()); // don't extend from past
      base.setDate(base.getDate() + days);
      return base.toISOString();
    }
    return null;
  })();

  const handleSubmit = async () => {
    if (!resolvedDate) return;
    setLoading(true);
    try {
      await req(`/billing/${accountId}/extend-trial`, {
        method: "POST",
        body: JSON.stringify({ newTrialEnd: resolvedDate, reason: reason || undefined }),
      });
      onSuccess();
    } finally { setLoading(false); }
  };

  return (
    <Modal title="Extend Trial / Access" onClose={onClose}>
      <div className="space-y-4">
        {currentTrialEnd && (
          <div className="flex items-center gap-3 bg-sky-50 border border-sky-200 rounded-xl p-3">
            <Clock size={14} className="text-sky-500 flex-shrink-0" />
            <p className="text-xs text-sky-800">Current trial ends: <span className="font-semibold">{fmtDate(currentTrialEnd)}</span></p>
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-2">Quick extend</label>
          <div className="flex gap-2 flex-wrap">
            {PRESETS.map(p => (
              <button key={p.days} onClick={() => { setDays(p.days); setCustomDate(""); }}
                className={clsx("px-3 py-1.5 text-xs rounded-lg border font-medium transition",
                  days === p.days && !customDate ? "bg-indigo-600 text-white border-indigo-600" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Or set a specific date</label>
          <input type="date" value={customDate} onChange={e => { setCustomDate(e.target.value); setDays(null); }}
            min={new Date().toISOString().slice(0, 10)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
        </div>
        {resolvedDate && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800">
            New trial end: <span className="font-semibold">{fmtDate(resolvedDate)}</span>
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Reason (optional)</label>
          <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. onboarding delay, support goodwill…"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
          <button onClick={handleSubmit} disabled={!resolvedDate || loading}
            className="px-4 py-2 text-sm bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg font-medium transition flex items-center gap-2">
            {loading && <Loader2 size={13} className="animate-spin" />} Extend Access
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Update Payment Method Modal ──────────────────────────────────────────────

function PaymentMethodModal({ accountId, stripeCustomerId, onClose, onSuccess }: {
  accountId: number; stripeCustomerId?: string | null; onClose: () => void; onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    setLoading(true);
    try {
      await req(`/billing/${accountId}/send-portal-link`, { method: "POST" });
      setSent(true);
      setTimeout(onSuccess, 1500);
    } finally { setLoading(false); }
  };

  return (
    <Modal title="Update Payment Method" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <CreditCard size={16} className="text-indigo-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-indigo-900">Stripe Customer Portal</p>
            <p className="text-xs text-indigo-700 mt-1">This sends the customer a secure, time-limited link to update their card directly in Stripe — no card details are handled by Certxa.</p>
          </div>
        </div>
        {stripeCustomerId && (
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Stripe Customer ID</p>
            <p className="text-xs font-mono text-slate-700">{stripeCustomerId}</p>
          </div>
        )}
        {sent && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800">
            <CheckCircle size={14} className="text-emerald-500" /> Portal link action logged. Customer will receive the link via email.
          </div>
        )}
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Close</button>
          <button onClick={handleSend} disabled={loading || sent}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-medium transition flex items-center gap-2">
            {loading && <Loader2 size={13} className="animate-spin" />}
            {sent ? "Sent!" : "Send Portal Link"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Record Manual Payment Modal ──────────────────────────────────────────────

function ManualPaymentModal({ accountId, onClose, onSuccess }: {
  accountId: number; onClose: () => void; onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!amount) return;
    setLoading(true);
    const note = `Manual payment recorded: $${amount} via ${method.toUpperCase()}${reference ? ` (Ref: ${reference})` : ""} on ${paymentDate}${notes ? ` — ${notes}` : ""}`;
    try {
      await req(`/billing/${accountId}/record-manual-payment`, {
        method: "POST",
        body: JSON.stringify({ amountCents: Math.round(parseFloat(amount) * 100), method, reference, paymentDate, notes }),
      });
      onSuccess();
    } catch {
      await req(`/billing/${accountId}/add-note`, { method: "POST", body: JSON.stringify({ content: note }) });
      onSuccess();
    } finally { setLoading(false); }
  };

  return (
    <Modal title="Record Manual Payment" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Amount ($)</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" step="0.01"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Date</label>
            <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} max={new Date().toISOString().slice(0, 10)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Method</label>
          <select value={method} onChange={e => setMethod(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
            <option value="cash">Cash</option>
            <option value="check">Check</option>
            <option value="wire">Wire Transfer</option>
            <option value="ach">ACH / Bank Transfer</option>
            <option value="zelle">Zelle</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Reference / Transaction ID (optional)</label>
          <input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="Check #, wire ref, etc."
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Notes (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Additional context…"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
          <button onClick={handleSubmit} disabled={!amount || loading}
            className="px-4 py-2 text-sm bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded-lg font-medium transition flex items-center gap-2">
            {loading && <Loader2 size={13} className="animate-spin" />} Record Payment
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Actions Dropdown ─────────────────────────────────────────────────────────

function ActionsDropdown({ onAction }: { onAction: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const items = [
    { key: "retry",  label: "Retry Failed Payment",   danger: false },
    { key: "refund", label: "Refund Payment",          danger: false },
    { key: "credit", label: "Apply Credit",            danger: false },
    { key: "method", label: "Update Payment Method",   danger: false },
    { key: "trial",  label: "Extend Trial / Access",   danger: false },
    { key: "manual", label: "Record Manual Payment",   danger: false },
    { key: "cancel", label: "Cancel Subscription",     danger: true  },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition"
      >
        Actions <ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-slate-200 rounded-xl shadow-lg z-30 py-1 overflow-hidden">
          {items.map(item => (
            <button
              key={item.key}
              onClick={() => { setOpen(false); onAction(item.key); }}
              className={clsx(
                "w-full text-left px-4 py-2.5 text-xs font-medium transition hover:bg-slate-50",
                item.danger ? "text-rose-600 hover:bg-rose-50" : "text-slate-700"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BillingAccountPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const storeId = parseInt(accountId ?? "0");

  const [activeTab, setActiveTab] = useState("overview");
  const [modal, setModal] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<BillingData>({
    queryKey: ["billing", storeId],
    queryFn: () => req(`/billing/${storeId}`),
    enabled: !!storeId,
    staleTime: 30_000,
  });

  const handleRefresh = () => qc.invalidateQueries({ queryKey: ["billing", storeId] });
  const handleModalSuccess = () => { setModal(null); handleRefresh(); };

  const handleAction = (key: string) => {
    if (key === "refund") setModal("refund");
    else if (key === "credit") setModal("credit");
    else if (key === "retry") setModal("retry");
    else if (key === "cancel") setModal("cancel");
    else setModal(key);
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-full bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Loading billing data…</p>
      </div>
    </div>
  );

  if (error || !data) return (
    <div className="p-6 text-center">
      <p className="text-slate-500">Account not found or failed to load.</p>
      <button onClick={() => navigate("/billing-investigation")} className="mt-3 text-indigo-600 hover:underline text-sm">
        Back to Billing Investigation
      </button>
    </div>
  );

  const { store, owner, subscription } = data;
  const initials = [owner.firstName?.[0], owner.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";
  const accountId_display = store.account_id ?? `ACC-${String(store.id).padStart(5, "0")}`;
  const ownerName = [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.email;
  const mrr = subscription?.priceCents ? `${fmtCents(subscription.priceCents)} / ${subscription.interval ?? "mo"}` : "No plan";

  const currentTabData = { overview: OverviewTab, payments: PaymentsTab, invoices: InvoicesTab, subscriptions: SubscriptionsTab, credits: CreditsTab, transactions: TransactionsTab, chargebacks: ChargebacksTab, timeline: TimelineTab }[activeTab];

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Account Header */}
      <div className="bg-white border-b border-slate-200 px-6 pt-4 pb-0 flex-shrink-0">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-3">
          <button onClick={() => navigate("/billing-investigation")} className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-xs transition">
            <ArrowLeft size={13} /> Billing Investigation
          </button>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700 text-xs font-medium">{store.name}</span>
        </div>

        {/* Account identity */}
        <div className="flex items-start gap-4 pb-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-black text-xl flex-shrink-0 shadow-lg shadow-indigo-500/20">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-black text-slate-900">{store.name}</h1>
              <CheckCircle size={16} className="text-emerald-500" />
              <BillingStatus status={store.accountStatus} />
            </div>
            <div className="flex items-center gap-5 mt-2 flex-wrap">
              {([
                { label: "Account ID",  value: accountId_display,                       mono: true },
                store.stripeCustomerId ? { label: "Customer ID", value: store.stripeCustomerId, mono: true } : null,
                { label: "Email",       value: owner.email },
                { label: "Plan",        value: subscription?.planName ?? "—",            bold: true },
                { label: "Amount",      value: mrr,                                      color: "text-emerald-700" },
                { label: "Renewal",     value: fmtDate(subscription?.currentPeriodEnd),  bold: true },
              ] as any[]).filter(Boolean).map((f: any) => (
                <div key={f.label}>
                  <p className="text-[9px] text-slate-400 uppercase tracking-wide leading-none mb-0.5">{f.label}</p>
                  <p className={clsx("text-[11px]", f.mono ? "font-mono text-slate-700" : f.color ? f.color : f.bold ? "font-semibold text-slate-800" : "text-slate-700")}>
                    {f.value}
                  </p>
                </div>
              ))}
              <div>
                <p className="text-[9px] text-slate-400 uppercase tracking-wide leading-none mb-0.5">Status</p>
                <BillingStatus status={subscription?.status ?? store.accountStatus} />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Link to={`/accounts/${storeId}`} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium transition">
              <ExternalLink size={11} /> Customer 360
            </Link>
            {store.stripeCustomerId && (
              <a
                href={`https://dashboard.stripe.com/customers/${store.stripeCustomerId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-700 rounded-lg text-xs font-medium transition"
              >
                <ExternalLink size={11} /> Stripe Dashboard
              </a>
            )}
            <ActionsDropdown onAction={handleAction} />
            <button onClick={handleRefresh} className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-lg transition">
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 -mb-px overflow-x-auto scrollbar-thin">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={clsx(
                "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition",
                activeTab === t.key
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main area */}
        {activeTab === "overview" ? (
          <OverviewTab data={data} accountId={storeId} onAction={handleAction} />
        ) : activeTab === "payments" ? (
          <PaymentsTab data={data} />
        ) : activeTab === "invoices" ? (
          <InvoicesTab data={data} />
        ) : activeTab === "subscriptions" ? (
          <SubscriptionsTab data={data} />
        ) : activeTab === "credits" ? (
          <CreditsTab data={data} />
        ) : activeTab === "transactions" ? (
          <TransactionsTab data={data} />
        ) : activeTab === "tax" ? (
          <TaxTab />
        ) : activeTab === "chargebacks" ? (
          <ChargebacksTab data={data} />
        ) : activeTab === "changes" ? (
          <ChangesTab />
        ) : (
          <TimelineTab data={data} />
        )}

        {/* Right Sidebar */}
        <CustomerSidebar data={data} accountId={storeId} />
      </div>

      {/* Modals */}
      {modal === "refund" && <RefundModal accountId={storeId} onClose={() => setModal(null)} onSuccess={handleModalSuccess} />}
      {modal === "credit" && <CreditModal accountId={storeId} onClose={() => setModal(null)} onSuccess={handleModalSuccess} />}
      {modal === "retry"  && <RetryModal  accountId={storeId} onClose={() => setModal(null)} onSuccess={handleModalSuccess} />}
      {modal === "cancel" && <CancelSubModal accountId={storeId} onClose={() => setModal(null)} onSuccess={handleModalSuccess} />}
      {modal === "method" && (
        <PaymentMethodModal
          accountId={storeId}
          stripeCustomerId={store.stripeCustomerId}
          onClose={() => setModal(null)}
          onSuccess={handleModalSuccess}
        />
      )}
      {modal === "trial" && (
        <TrialExtensionModal
          accountId={storeId}
          currentTrialEnd={data.owner.trialEndsAt}
          onClose={() => setModal(null)}
          onSuccess={handleModalSuccess}
        />
      )}
      {modal === "manual" && (
        <ManualPaymentModal
          accountId={storeId}
          onClose={() => setModal(null)}
          onSuccess={handleModalSuccess}
        />
      )}
    </div>
  );
}
