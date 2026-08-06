import { useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, ArrowLeft, ExternalLink, RefreshCw, MoreHorizontal,
  CreditCard, AlertTriangle, Clock, TrendingUp, DollarSign,
  ChevronRight, Plus, X, Check, AlertCircle, RotateCcw,
  FileText, Receipt, Zap, Gift, Calendar, User, Phone,
  Globe, Building, Copy, Activity, Download
} from "lucide-react";

const API = "/api/support";

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...opts?.headers },
    ...opts,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function fmt(cents: number) {
  return `$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateShort(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_BADGE: Record<string, string> = {
  succeeded: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  paid:       "bg-emerald-50 text-emerald-700 border border-emerald-200",
  completed:  "bg-emerald-50 text-emerald-700 border border-emerald-200",
  active:     "bg-emerald-50 text-emerald-700 border border-emerald-200",
  failed:     "bg-red-50 text-red-700 border border-red-200",
  past_due:   "bg-orange-50 text-orange-700 border border-orange-200",
  overdue:    "bg-orange-50 text-orange-700 border border-orange-200",
  open:       "bg-orange-50 text-orange-700 border border-orange-200",
  pending:    "bg-amber-50 text-amber-700 border border-amber-200",
  refunded:   "bg-blue-50 text-blue-700 border border-blue-200",
  applied:    "bg-blue-50 text-blue-700 border border-blue-200",
  voided:     "bg-slate-100 text-slate-500 border border-slate-200",
  canceled:   "bg-slate-100 text-slate-500 border border-slate-200",
  cancelled:  "bg-slate-100 text-slate-500 border border-slate-200",
  trialing:   "bg-purple-50 text-purple-700 border border-purple-200",
  suspended:  "bg-red-50 text-red-700 border border-red-200",
};
function StatusBadge({ status }: { status: string }) {
  const label = status?.replace(/_/g, " ") ?? "unknown";
  const cls = STATUS_BADGE[status?.toLowerCase()] ?? "bg-slate-100 text-slate-500 border border-slate-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${cls}`}>
      {label}
    </span>
  );
}

const TYPE_ICON: Record<string, { icon: typeof FileText; color: string }> = {
  invoice:    { icon: FileText,  color: "text-slate-500" },
  payment:    { icon: CreditCard, color: "text-emerald-500" },
  refund:     { icon: RotateCcw, color: "text-blue-500" },
  credit:     { icon: Gift,      color: "text-purple-500" },
  wallet:     { icon: DollarSign, color: "text-amber-500" },
  chargeback: { icon: AlertCircle, color: "text-red-500" },
  subscription: { icon: Zap,    color: "text-indigo-500" },
};

function TypeIcon({ type }: { type: string }) {
  const t = TYPE_ICON[type?.toLowerCase()] ?? TYPE_ICON.invoice;
  const Icon = t.icon;
  return <Icon size={14} className={t.color} />;
}

// ─── MODALS ──────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg transition"><X size={16} className="text-slate-500" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ApplyCreditModal({ accountId, onClose, onSuccess }: { accountId: string; onClose: () => void; onSuccess: () => void }) {
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const mut = useMutation({
    mutationFn: () => apiFetch(`/billing/${accountId}/apply-credit`, {
      method: "POST",
      body: JSON.stringify({ amount: parseFloat(amount), description: desc }),
    }),
    onSuccess: () => { onSuccess(); onClose(); },
  });
  return (
    <Modal title="Apply Credit" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-slate-700 block mb-1">Amount ($)</label>
          <input value={amount} onChange={e => setAmount(e.target.value)} type="number" min="0.01" step="0.01"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="e.g. 25.00" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700 block mb-1">Reason</label>
          <input value={desc} onChange={e => setDesc(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="e.g. Courtesy credit for service disruption" />
        </div>
        {mut.isError && <p className="text-xs text-red-600">{String(mut.error)}</p>}
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={!amount || mut.isPending}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
            {mut.isPending ? "Applying…" : "Apply Credit"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AddNoteModal({ accountId, onClose, onSuccess }: { accountId: string; onClose: () => void; onSuccess: () => void }) {
  const [content, setContent] = useState("");
  const mut = useMutation({
    mutationFn: () => apiFetch(`/billing/${accountId}/add-note`, { method: "POST", body: JSON.stringify({ content }) }),
    onSuccess: () => { onSuccess(); onClose(); },
  });
  return (
    <Modal title="Add Support Note" onClose={onClose}>
      <div className="space-y-4">
        <textarea value={content} onChange={e => setContent(e.target.value)} rows={4}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          placeholder="Add an internal note visible only to the support team…" />
        {mut.isError && <p className="text-xs text-red-600">{String(mut.error)}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={!content.trim() || mut.isPending}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
            {mut.isPending ? "Saving…" : "Add Note"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ExtendTrialModal({ accountId, onClose, onSuccess }: { accountId: string; onClose: () => void; onSuccess: () => void }) {
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const mut = useMutation({
    mutationFn: () => apiFetch(`/billing/${accountId}/extend-trial`, { method: "POST", body: JSON.stringify({ newTrialEnd: date, reason }) }),
    onSuccess: () => { onSuccess(); onClose(); },
  });
  return (
    <Modal title="Extend Trial / Access" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-slate-700 block mb-1">New Trial End Date</label>
          <input value={date} onChange={e => setDate(e.target.value)} type="date"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700 block mb-1">Reason</label>
          <input value={reason} onChange={e => setReason(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="e.g. Requested extra demo time" />
        </div>
        {mut.isError && <p className="text-xs text-red-600">{String(mut.error)}</p>}
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={!date || mut.isPending}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
            {mut.isPending ? "Extending…" : "Extend Trial"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RecordPaymentModal({ accountId, onClose, onSuccess }: { accountId: string; onClose: () => void; onSuccess: () => void }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("check");
  const [reference, setReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const mut = useMutation({
    mutationFn: () => apiFetch(`/billing/${accountId}/record-manual-payment`, {
      method: "POST",
      body: JSON.stringify({ amountCents: Math.round(parseFloat(amount) * 100), method, reference, paymentDate, notes }),
    }),
    onSuccess: () => { onSuccess(); onClose(); },
  });
  return (
    <Modal title="Record Manual Payment" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-700 block mb-1">Amount ($)</label>
            <input value={amount} onChange={e => setAmount(e.target.value)} type="number" step="0.01"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-700 block mb-1">Method</label>
            <select value={method} onChange={e => setMethod(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="check">Check</option>
              <option value="wire">Wire Transfer</option>
              <option value="ach">ACH</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700 block mb-1">Reference #</label>
          <input value={reference} onChange={e => setReference(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Check # / Wire ref" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700 block mb-1">Payment Date</label>
          <input value={paymentDate} onChange={e => setPaymentDate(e.target.value)} type="date"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700 block mb-1">Notes</label>
          <input value={notes} onChange={e => setNotes(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Optional notes" />
        </div>
        {mut.isError && <p className="text-xs text-red-600">{String(mut.error)}</p>}
        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition">Cancel</button>
          <button onClick={() => mut.mutate()} disabled={!amount || mut.isPending}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition">
            {mut.isPending ? "Saving…" : "Record Payment"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmModal({ title, body, confirmLabel = "Confirm", danger = false, onClose, onConfirm, loading }: {
  title: string; body: string; confirmLabel?: string; danger?: boolean;
  onClose: () => void; onConfirm: () => void; loading: boolean;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm text-slate-600 mb-5">{body}</p>
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition">Cancel</button>
        <button onClick={onConfirm} disabled={loading}
          className={`px-4 py-2 text-sm rounded-lg text-white disabled:opacity-50 transition ${danger ? "bg-red-600 hover:bg-red-700" : "bg-indigo-600 hover:bg-indigo-700"}`}>
          {loading ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

// ─── TABS ─────────────────────────────────────────────────────────────────────

const TABS = ["Overview", "Payments", "Subscriptions", "Invoices", "Credits & Refunds", "Transactions", "Tax", "Chargebacks", "Timeline"] as const;
type Tab = typeof TABS[number];

// ─── LIST VIEW (no accountId) ─────────────────────────────────────────────────

function BillingListView() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "past_due" | "failed" | "suspended">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["billing-search", search, filter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filter === "past_due") params.set("status", "past_due");
      if (filter === "failed") params.set("failedOnly", "true");
      if (filter === "suspended") params.set("status", "suspended");
      return apiFetch(`/billing?${params}`);
    },
    staleTime: 30_000,
  });

  const accounts: any[] = data?.accounts ?? [];

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-900">Billing & Revenue Investigation</h1>
          <p className="text-sm text-slate-500 mt-1">Investigate payment failures, subscription issues, and billing disputes</p>
        </div>

        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search accounts, emails, company name…"
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg bg-white p-1">
            {(["all", "past_due", "failed", "suspended"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded text-xs font-medium transition capitalize ${filter === f ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                {f.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_auto] gap-4 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 uppercase tracking-wide">
            <span>Account</span><span>Plan</span><span>Status</span><span>Failed Pmts</span><span>Overdue</span><span></span>
          </div>
          {isLoading && (
            <div className="divide-y divide-slate-100">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 animate-pulse">
                  <div className="h-4 bg-slate-100 rounded w-3/4" /><div className="h-4 bg-slate-100 rounded w-1/2" />
                  <div className="h-4 bg-slate-100 rounded w-16" /><div className="h-4 bg-slate-100 rounded w-8" />
                  <div className="h-4 bg-slate-100 rounded w-16" /><div className="h-4 bg-slate-100 rounded w-16" />
                </div>
              ))}
            </div>
          )}
          {!isLoading && accounts.length === 0 && (
            <div className="py-16 text-center text-slate-400">
              <CreditCard size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">No accounts found</p>
              <p className="text-xs mt-1">Try a different search or filter</p>
            </div>
          )}
          {!isLoading && accounts.map((acc: any) => (
            <div key={acc.id}
              className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition cursor-pointer items-center"
              onClick={() => navigate(`/isTeam/billing-investigation/${acc.id}`)}>
              <div>
                <p className="text-sm font-medium text-slate-900">{acc.name}</p>
                <p className="text-xs text-slate-500">{acc.owner_email}</p>
              </div>
              <div>
                <p className="text-sm text-slate-700">{acc.plan_name ?? acc.plan_code ?? "—"}</p>
                <p className="text-xs text-slate-400">{acc.price_cents ? fmt(acc.price_cents) + "/" + (acc.interval ?? "mo") : "—"}</p>
              </div>
              <StatusBadge status={acc.account_status ?? "active"} />
              <span className={`text-sm font-medium ${acc.failed_payments > 0 ? "text-red-600" : "text-slate-400"}`}>
                {acc.failed_payments > 0 ? acc.failed_payments : "—"}
              </span>
              <span className={`text-sm font-medium ${Number(acc.overdue_cents) > 0 ? "text-orange-600" : "text-slate-400"}`}>
                {Number(acc.overdue_cents) > 0 ? fmt(Number(acc.overdue_cents)) : "—"}
              </span>
              <ChevronRight size={14} className="text-slate-400" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── DETAIL VIEW ──────────────────────────────────────────────────────────────

type BillingData = {
  store: any; owner: any; subscription: any;
  kpi: any; paymentMethod: any;
  payments: any[]; invoices: any[]; refunds: any[];
  wallet: any[]; credits: any[]; disputes: any[]; notes: any[];
  timeline: any[];
};

function KPICard({ label, main, sub1, sub2, icon: Icon, iconColor, alert }: {
  label: string; main: React.ReactNode; sub1?: React.ReactNode; sub2?: React.ReactNode;
  icon: typeof AlertTriangle; iconColor: string; alert?: boolean;
}) {
  return (
    <div className={`bg-white border rounded-xl p-4 shadow-sm ${alert ? "border-red-200" : "border-slate-200"}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon size={13} className={iconColor} />
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-2xl font-bold mb-2 ${alert ? "text-red-600" : "text-slate-900"}`}>{main}</div>
      {sub1 && <p className="text-xs text-slate-500">{sub1}</p>}
      {sub2 && <p className="text-xs text-slate-400 mt-0.5">{sub2}</p>}
    </div>
  );
}

function BillingTable({ rows, emptyMsg = "No records found" }: { rows: any[]; emptyMsg?: string }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const filtered = rows.filter(r => {
    if (statusFilter !== "all" && r.status?.toLowerCase() !== statusFilter) return false;
    if (typeFilter !== "all" && r.type?.toLowerCase() !== typeFilter) return false;
    return true;
  });

  const statuses = ["all", ...Array.from(new Set(rows.map(r => r.status?.toLowerCase()).filter(Boolean)))];
  const types = ["all", ...Array.from(new Set(rows.map(r => r.type?.toLowerCase()).filter(Boolean)))];

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500">
          {types.map(t => <option key={t} value={t}>{t === "all" ? "All Types" : t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500">
          {statuses.map(s => <option key={s} value={s}>{s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <span className="ml-auto text-xs text-slate-400">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="grid grid-cols-[130px_100px_1fr_120px_110px] gap-4 px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 uppercase tracking-wide">
          <span>Date</span><span>Type</span><span>Description</span><span>Status</span><span className="text-right">Amount</span>
        </div>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-slate-400 text-sm">{emptyMsg}</div>
        )}
        {filtered.map((row, i) => {
          const isNeg = Number(row.amount) < 0;
          return (
            <div key={row.id ?? i} className="grid grid-cols-[130px_100px_1fr_120px_110px] gap-4 px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition items-center">
              <span className="text-xs text-slate-500">{fmtDateShort(row.date)}</span>
              <span className="flex items-center gap-1.5 text-xs text-slate-600 capitalize">
                <TypeIcon type={row.type} />{row.type}
              </span>
              <span className="text-sm text-slate-800 truncate">{row.description}</span>
              <StatusBadge status={row.status ?? "unknown"} />
              <span className={`text-sm font-medium text-right ${isNeg ? "text-emerald-600" : row.status === "failed" ? "text-red-600" : "text-slate-900"}`}>
                {row.amount != null ? (isNeg ? `-${fmt(Math.abs(Number(row.amount)))}` : fmt(Number(row.amount))) : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CustomerSidebar({ data, accountId, onAddNote, onRefresh }: {
  data: BillingData; accountId: string;
  onAddNote: () => void; onRefresh: () => void;
}) {
  const { store, owner, subscription, kpi, notes } = data;
  const totalBalance = -(kpi.unpaidInvoiceCents) + kpi.creditBalanceCents;
  const negative = totalBalance < 0;

  return (
    <div className="w-72 flex-shrink-0 space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Client Details</span>
          <button className="text-xs text-indigo-600 hover:underline">Edit</button>
        </div>
        <div className="space-y-2.5">
          <div className="flex items-start gap-2">
            <User size={12} className="text-slate-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-900">{owner.firstName} {owner.lastName}</p>
              <p className="text-xs text-slate-500">Billing Contact</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Globe size={12} className="text-slate-400 flex-shrink-0" />
            <a href={`mailto:${owner.email}`} className="text-sm text-indigo-600 hover:underline truncate">{owner.email}</a>
          </div>
          {store.phone && (
            <div className="flex items-center gap-2">
              <Phone size={12} className="text-slate-400 flex-shrink-0" />
              <span className="text-sm text-slate-700">{store.phone}</span>
            </div>
          )}
          {(store.city || store.state) && (
            <div className="flex items-center gap-2">
              <Building size={12} className="text-slate-400 flex-shrink-0" />
              <span className="text-sm text-slate-700">{[store.city, store.state].filter(Boolean).join(", ")}</span>
            </div>
          )}
          {store.timezone && (
            <div className="flex items-center gap-2">
              <Clock size={12} className="text-slate-400 flex-shrink-0" />
              <span className="text-sm text-slate-700">{store.timezone}</span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3">Account Balance</p>
        <div className="space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">Credit Balance</span>
            <span className="text-emerald-600 font-medium">{fmt(kpi.creditBalanceCents)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">Unpaid Invoices</span>
            <span className={kpi.unpaidInvoiceCents > 0 ? "text-red-600 font-medium" : "text-slate-600"}>{fmt(kpi.unpaidInvoiceCents)}</span>
          </div>
          <div className="h-px bg-slate-100 my-1" />
          <div className="flex justify-between text-sm font-semibold">
            <span className="text-slate-700">Total Balance</span>
            <span className={negative ? "text-red-600" : "text-emerald-600"}>{negative ? `-${fmt(Math.abs(totalBalance))}` : fmt(totalBalance)}</span>
          </div>
        </div>
      </div>

      {subscription && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Subscription</p>
            <Link to={`/isTeam/billing/subscriptions`} className="text-xs text-indigo-600 hover:underline">View all</Link>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-900">{subscription.planName ?? subscription.planCode}</span>
              <StatusBadge status={subscription.status} />
            </div>
            <p className="text-xs text-slate-500">{subscription.priceCents ? fmt(subscription.priceCents) + "/" + (subscription.interval ?? "mo") : "—"}</p>
            <div className="text-xs text-slate-500 space-y-0.5">
              <p>Next billing: <span className="text-slate-700">{fmtDate(subscription.currentPeriodEnd)}</span></p>
              {subscription.startDate && <p>Start date: <span className="text-slate-700">{fmtDate(subscription.startDate)}</span></p>}
            </div>
            {subscription.cancelAtPeriodEnd && (
              <div className="text-xs text-orange-600 bg-orange-50 rounded px-2 py-1">Cancels at period end</div>
            )}
            <button className="text-xs text-indigo-600 hover:underline flex items-center gap-1 mt-1">
              Manage Subscription <ExternalLink size={10} />
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Notes</p>
          <button onClick={onAddNote} className="flex items-center gap-1 text-xs text-indigo-600 hover:underline">
            <Plus size={10} />Add Note
          </button>
        </div>
        <div className="space-y-3">
          {notes.length === 0 && <p className="text-xs text-slate-400">No notes yet.</p>}
          {notes.slice(0, 4).map((n: any, i: number) => (
            <div key={i} className="text-xs">
              <div className="flex items-center gap-1.5 mb-0.5">
                <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-[10px] flex-shrink-0">
                  {n.agent_name?.[0] ?? "S"}
                </div>
                <span className="text-slate-500">{n.agent_name ?? "Support"} · {fmtDate(n.created_at)}</span>
              </div>
              <p className="text-slate-700 leading-snug pl-6">{n.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function IssueShortcuts({ accountId, onModal }: { accountId: string; onModal: (m: string) => void }) {
  const shortcuts = [
    { icon: AlertTriangle, label: "Payment Failed", desc: "Investigate failed or declined payments", color: "text-red-500", bg: "bg-red-50", modal: "retry" },
    { icon: CreditCard, label: "Update Payment Method", desc: "Update or replace card on file", color: "text-blue-500", bg: "bg-blue-50", modal: "portal" },
    { icon: RotateCcw, label: "Refund Payment", desc: "Issue a full or partial refund", color: "text-purple-500", bg: "bg-purple-50", modal: "refund" },
    { icon: Gift, label: "Apply Credit", desc: "Apply account credit balance", color: "text-emerald-500", bg: "bg-emerald-50", modal: "credit" },
    { icon: Calendar, label: "Extend Trial / Access", desc: "Grant trial extension or access", color: "text-indigo-500", bg: "bg-indigo-50", modal: "trial" },
    { icon: Receipt, label: "Record Manual Payment", desc: "Record offline or custom payment", color: "text-amber-500", bg: "bg-amber-50", modal: "manual" },
  ];

  const retryMut = useMutation({ mutationFn: () => apiFetch(`/billing/${accountId}/retry-payment`, { method: "POST" }) });
  const portalMut = useMutation({ mutationFn: () => apiFetch(`/billing/${accountId}/send-portal-link`, { method: "POST" }) });

  const handleShortcut = (modal: string) => {
    if (modal === "retry") { retryMut.mutate(); return; }
    if (modal === "portal") { portalMut.mutate(); return; }
    if (modal === "refund") { onModal("refund"); return; }
    onModal(modal);
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Issue Shortcuts</h3>
      <div className="grid grid-cols-2 gap-2">
        {shortcuts.map(s => {
          const Icon = s.icon;
          return (
            <button key={s.label} onClick={() => handleShortcut(s.modal)}
              className="flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/30 text-left transition group shadow-sm">
              <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                <Icon size={14} className={s.color} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 group-hover:text-indigo-700 leading-snug">{s.label}</p>
                <p className="text-xs text-slate-500 leading-snug mt-0.5">{s.desc}</p>
              </div>
              <ChevronRight size={14} className="text-slate-300 group-hover:text-indigo-400 flex-shrink-0 mt-1 ml-auto" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OverviewTab({ data, accountId, onAddNote, onModal, onRefresh }: {
  data: BillingData; accountId: string; onAddNote: () => void; onModal: (m: string) => void; onRefresh: () => void;
}) {
  const { kpi, paymentMethod, timeline } = data;
  const recent = timeline.slice(0, 10);

  return (
    <div className="flex gap-5">
      <div className="flex-1 min-w-0 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard
            label="Payment Issues" icon={AlertTriangle} iconColor="text-red-500"
            alert={kpi.failedPaymentsCount > 0}
            main={kpi.failedPaymentsCount}
            sub1={kpi.failedPaymentsCount > 0 ? `Next retry: ${fmtDate(kpi.nextRetryDate)}` : "No open issues"}
            sub2={kpi.totalAtRiskCents > 0 ? `${fmt(kpi.totalAtRiskCents)} at risk` : undefined}
          />
          <KPICard
            label="Past Due" icon={Clock} iconColor="text-orange-500"
            alert={kpi.overdueCents > 0}
            main={kpi.overdueCents > 0 ? fmt(kpi.overdueCents) : "$0.00"}
            sub1={kpi.overdueCount > 0 ? `${kpi.overdueCount} invoice${kpi.overdueCount > 1 ? "s" : ""}` : "No overdue invoices"}
            sub2={kpi.daysPastDue > 0 ? `${kpi.daysPastDue} days past due` : undefined}
          />
          <KPICard
            label="Lifetime Value" icon={TrendingUp} iconColor="text-emerald-500"
            main={fmt(kpi.lifetimeValueCents)}
            sub1={`MRR: ${fmt(kpi.mrrCents)}`}
            sub2={data.owner.signupDate ? `Client since ${fmtDate(data.owner.signupDate)}` : undefined}
          />
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-1.5 mb-2">
              <CreditCard size={13} className="text-slate-500" />
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Payment Method</span>
            </div>
            {paymentMethod ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1 text-sm font-bold text-slate-800">
                    <span className="capitalize">{paymentMethod.brand}</span> ****{paymentMethod.last4}
                  </span>
                  <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-1.5 py-0.5 font-medium">Default</span>
                </div>
                <p className="text-xs text-slate-500">Expires {paymentMethod.expMonth ?? "—"}/{paymentMethod.expYear ?? "—"}</p>
                <button className="text-xs text-indigo-600 hover:underline mt-2">View all payment methods</button>
              </>
            ) : (
              <p className="text-sm text-slate-400">No payment method on file</p>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">Recent Billing Activity</h3>
            <button className="text-xs text-indigo-600 hover:underline">View all activity</button>
          </div>
          <BillingTable rows={recent} emptyMsg="No billing activity yet" />
        </div>

        <IssueShortcuts accountId={accountId} onModal={onModal} />
      </div>

      <CustomerSidebar data={data} accountId={accountId} onAddNote={onAddNote} onRefresh={onRefresh} />
    </div>
  );
}

function PaymentsTab({ data }: { data: BillingData }) {
  const rows = data.payments.map((p: any) => ({
    id: `pay-${p.id}`, date: p.created_at, type: "payment",
    description: `Payment for ${p.stripe_invoice_id ?? p.stripe_payment_intent_id ?? `PMT-${p.id}`}`,
    status: p.status, amount: -(p.amount_cents || 0),
  }));
  return <BillingTable rows={rows} emptyMsg="No payments found" />;
}

function InvoicesTab({ data }: { data: BillingData }) {
  const rows = data.invoices.map((i: any) => ({
    id: `inv-${i.id}`, date: i.created_at, type: "invoice",
    description: `INV-${i.invoice_number ?? i.stripe_invoice_id ?? i.id}`,
    status: i.paid ? "paid" : (i.status ?? "open"), amount: i.total_cents,
  }));
  return <BillingTable rows={rows} emptyMsg="No invoices found" />;
}

function CreditsRefundsTab({ data }: { data: BillingData }) {
  const rows = [
    ...data.refunds.map((r: any) => ({ id: `ref-${r.id}`, date: r.created_at, type: "refund", description: `Refund${r.reason ? ` — ${r.reason}` : ""}`, status: r.status ?? "refunded", amount: r.amount_cents })),
    ...data.credits.map((c: any) => ({ id: `crd-${c.id}`, date: c.created_at, type: "credit", description: c.description ?? `Credit — ${c.type}`, status: "applied", amount: c.amount * 100 })),
    ...data.wallet.map((w: any) => ({ id: `wlt-${w.id}`, date: w.created_at, type: "wallet", description: w.description ?? `Wallet ${w.transaction_type}`, status: w.status ?? "completed", amount: w.amount })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return <BillingTable rows={rows} emptyMsg="No credits or refunds found" />;
}

function ChargebacksTab({ data }: { data: BillingData }) {
  const rows = data.disputes.map((d: any) => ({
    id: `dis-${d.id}`, date: d.created_at, type: "chargeback",
    description: `Dispute — ${d.stripe_payment_intent_id ?? d.id}`,
    status: d.dispute_status ?? "open", amount: d.amount_cents,
  }));
  return <BillingTable rows={rows} emptyMsg="No chargebacks or disputes found" />;
}

function SubscriptionsTab({ data }: { data: BillingData }) {
  const { subscription, owner } = data;
  if (!subscription) return <div className="py-12 text-center text-slate-400 text-sm">No subscription found</div>;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{subscription.planName ?? subscription.planCode}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{subscription.stripeSubscriptionId ?? "No Stripe ID"}</p>
          </div>
          <StatusBadge status={subscription.status} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6 p-5">
        {[
          ["Plan", subscription.planName ?? subscription.planCode],
          ["Price", subscription.priceCents ? `${fmt(subscription.priceCents)}/${subscription.interval ?? "mo"}` : "—"],
          ["Status", subscription.status],
          ["Current Period End", fmtDate(subscription.currentPeriodEnd)],
          ["Start Date", fmtDate(subscription.startDate)],
          ["Client Since", fmtDate(owner.signupDate)],
          ["Cancel at Period End", subscription.cancelAtPeriodEnd ? "Yes" : "No"],
          ["Payment Brand", subscription.paymentBrand ?? "—"],
          ["Payment Last4", subscription.paymentLast4 ? `****${subscription.paymentLast4}` : "—"],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-xs text-slate-500 mb-0.5">{label}</p>
            <p className="text-sm font-medium text-slate-800">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TransactionsTab({ data }: { data: BillingData }) {
  return <BillingTable rows={data.timeline.slice(0, 50)} emptyMsg="No transactions found" />;
}

function TaxTab() {
  return (
    <div className="py-16 text-center text-slate-400">
      <Receipt size={32} className="mx-auto mb-3 opacity-40" />
      <p className="text-sm">Tax records</p>
      <p className="text-xs mt-1">Tax details and filings will appear here when available</p>
    </div>
  );
}

function TimelineTab({ data }: { data: BillingData }) {
  return <BillingTable rows={data.timeline} emptyMsg="No timeline events" />;
}

function DetailView({ accountId }: { accountId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [modal, setModal] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<BillingData>({
    queryKey: ["billing-detail", accountId],
    queryFn: () => apiFetch(`/billing/${accountId}`),
    staleTime: 30_000,
    retry: 1,
  });

  const refetch = useCallback(() => qc.invalidateQueries({ queryKey: ["billing-detail", accountId] }), [qc, accountId]);

  const cancelMut = useMutation({
    mutationFn: () => apiFetch(`/billing/${accountId}/cancel-subscription`, { method: "POST", body: JSON.stringify({ immediately: false }) }),
    onSuccess: () => { refetch(); setModal(null); },
  });
  const retryMut = useMutation({
    mutationFn: () => apiFetch(`/billing/${accountId}/retry-payment`, { method: "POST" }),
    onSuccess: () => { refetch(); setModal(null); },
  });

  if (isLoading) return (
    <div className="flex-1 overflow-auto p-6 animate-pulse">
      <div className="h-32 bg-slate-100 rounded-xl mb-4" />
      <div className="grid grid-cols-4 gap-3 mb-4">{[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-slate-100 rounded-xl" />)}</div>
      <div className="h-64 bg-slate-100 rounded-xl" />
    </div>
  );

  if (isError || !data) return (
    <div className="flex-1 flex items-center justify-center flex-col gap-3 text-slate-400">
      <AlertCircle size={32} className="opacity-40" />
      <p className="text-sm">Account not found or failed to load.</p>
      <button onClick={() => navigate("/isTeam/billing-investigation")} className="text-sm text-indigo-600 hover:underline">Back to Billing Investigation</button>
    </div>
  );

  const { store, owner, subscription, kpi } = data;
  const rawInitials = ((owner.firstName?.[0] ?? "") + (owner.lastName?.[0] ?? "")).toUpperCase();
  const initials = rawInitials || (store.name?.[0] ?? "?");

  return (
    <div className="flex-1 overflow-auto flex flex-col">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-start gap-4">
          <button onClick={() => navigate("/isTeam/billing-investigation")} className="mt-1 p-1.5 hover:bg-slate-100 rounded-lg transition flex-shrink-0">
            <ArrowLeft size={14} className="text-slate-500" />
          </button>

          <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-lg flex-shrink-0">
            {initials}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-lg font-semibold text-slate-900">{store.name}</h1>
              <StatusBadge status={store.accountStatus ?? "active"} />
            </div>
            <div className="flex items-center gap-5 text-xs text-slate-500">
              <span>Account ID: <span className="font-medium text-slate-700">{store.id}</span></span>
              <span>Email: <a href={`mailto:${owner.email}`} className="text-indigo-600 hover:underline">{owner.email}</a></span>
              <span>Plan: <span className="font-medium text-slate-700">{subscription?.planName ?? subscription?.planCode ?? "—"}</span></span>
              <span>MRR: <span className="font-medium text-slate-700">{fmt(kpi.mrrCents)}</span></span>
              {subscription?.currentPeriodEnd && (
                <span>Renewal: <span className="font-medium text-slate-700">{fmtDate(subscription.currentPeriodEnd)}</span></span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Link to={`/isTeam/accounts/${accountId}`}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition">
              <ExternalLink size={11} />Client360
            </Link>
            <button onClick={() => setModal("credit")}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition">
              <Gift size={11} />Apply Credit
            </button>
            <button onClick={() => setModal("cancel")}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition">
              Cancel Sub
            </button>
            <button onClick={() => retryMut.mutate()}
              disabled={retryMut.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition">
              <RotateCcw size={11} />{retryMut.isPending ? "Retrying…" : "Retry Payment"}
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition">
              <ExternalLink size={11} />Stripe
            </button>
            <button onClick={refetch} className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition">
              <RefreshCw size={12} className="text-slate-500" />
            </button>
          </div>
        </div>

        <div className="flex gap-0 mt-4 -mb-4 overflow-x-auto">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                activeTab === tab
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {activeTab === "Overview" && <OverviewTab data={data} accountId={accountId} onAddNote={() => setModal("note")} onModal={setModal} onRefresh={refetch} />}
        {activeTab === "Payments" && <PaymentsTab data={data} />}
        {activeTab === "Subscriptions" && <SubscriptionsTab data={data} />}
        {activeTab === "Invoices" && <InvoicesTab data={data} />}
        {activeTab === "Credits & Refunds" && <CreditsRefundsTab data={data} />}
        {activeTab === "Transactions" && <TransactionsTab data={data} />}
        {activeTab === "Tax" && <TaxTab />}
        {activeTab === "Chargebacks" && <ChargebacksTab data={data} />}
        {activeTab === "Timeline" && <TimelineTab data={data} />}
      </div>

      {modal === "credit" && <ApplyCreditModal accountId={accountId} onClose={() => setModal(null)} onSuccess={refetch} />}
      {modal === "note" && <AddNoteModal accountId={accountId} onClose={() => setModal(null)} onSuccess={refetch} />}
      {modal === "trial" && <ExtendTrialModal accountId={accountId} onClose={() => setModal(null)} onSuccess={refetch} />}
      {modal === "manual" && <RecordPaymentModal accountId={accountId} onClose={() => setModal(null)} onSuccess={refetch} />}
      {modal === "cancel" && (
        <ConfirmModal
          title="Cancel Subscription" danger
          body="This will mark the subscription to cancel at the end of the current billing period. The account will retain access until the period ends."
          confirmLabel="Cancel Subscription"
          onClose={() => setModal(null)}
          onConfirm={() => cancelMut.mutate()}
          loading={cancelMut.isPending}
        />
      )}
      {modal === "refund" && (
        <Modal title="Issue Refund" onClose={() => setModal(null)}>
          <p className="text-sm text-slate-600 mb-4">To process a refund, open the client's Stripe dashboard and initiate the refund directly from there to ensure it's properly recorded.</p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setModal(null)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition">Close</button>
            <button className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">
              <ExternalLink size={12} />Open Stripe
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function BillingInvestigationPage() {
  const { accountId } = useParams<{ accountId?: string }>();
  if (accountId) return <DetailView accountId={accountId} />;
  return <BillingListView />;
}
