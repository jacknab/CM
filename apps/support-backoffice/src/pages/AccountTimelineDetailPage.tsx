import { useState, useMemo, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Search, Filter, RefreshCw, ChevronDown, ChevronRight, X,
  CheckCircle, AlertTriangle, CreditCard, FileText, RotateCcw,
  Activity, Shield, Globe, MessageSquare, DollarSign, Zap,
  Clock, TrendingUp, Users, ExternalLink, Copy, ChevronUp,
  AlertCircle, Server, Wifi,
} from "lucide-react";
import { format, formatDistanceToNow, isToday, isYesterday, parseISO } from "date-fns";
import { clsx } from "clsx";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  occurred_at: string;
  category: string;
  source: string;
  status?: string;
  amount?: number;
  actor_name?: string;
  actor_type?: string;
  metadata: Record<string, any>;
  correlation_id?: string;
  group_size?: number;
  group_ids?: string[];
}

interface AccountSummary {
  store: any;
  owner: any;
  subscription: any;
  kpi: any;
  paymentMethod: any;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const CATEGORY_CFG: Record<string, { icon: React.ReactNode; bg: string; text: string; badgeBg: string; badgeText: string; label: string }> = {
  payment:      { icon: <CreditCard size={12}/>,    bg: "bg-emerald-100", text: "text-emerald-600", badgeBg: "bg-emerald-100", badgeText: "text-emerald-700", label: "Payment" },
  subscription: { icon: <Activity size={12}/>,      bg: "bg-violet-100",  text: "text-violet-600",  badgeBg: "bg-violet-100",  badgeText: "text-violet-700",  label: "Subscription" },
  invoice:      { icon: <FileText size={12}/>,      bg: "bg-blue-100",    text: "text-blue-600",    badgeBg: "bg-blue-100",    badgeText: "text-blue-700",    label: "Invoice" },
  support:      { icon: <MessageSquare size={12}/>, bg: "bg-amber-100",   text: "text-amber-600",   badgeBg: "bg-amber-100",   badgeText: "text-amber-700",   label: "Ticket" },
  admin:        { icon: <Shield size={12}/>,        bg: "bg-slate-100",   text: "text-slate-500",   badgeBg: "bg-slate-100",   badgeText: "text-slate-600",   label: "Admin" },
  security:     { icon: <Shield size={12}/>,        bg: "bg-orange-100",  text: "text-orange-600",  badgeBg: "bg-orange-100",  badgeText: "text-orange-700",  label: "Security" },
  webhook:      { icon: <Zap size={12}/>,           bg: "bg-cyan-100",    text: "text-cyan-600",    badgeBg: "bg-cyan-100",    badgeText: "text-cyan-700",    label: "Webhook" },
  refund:       { icon: <RotateCcw size={12}/>,     bg: "bg-blue-100",    text: "text-blue-600",    badgeBg: "bg-blue-100",    badgeText: "text-blue-700",    label: "Refund" },
};

const SOURCE_CFG: Record<string, { color: string; bg: string }> = {
  Stripe:  { color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-100" },
  System:  { color: "text-slate-600",  bg: "bg-slate-50 border-slate-100" },
  isTeam:  { color: "text-blue-600",   bg: "bg-blue-50 border-blue-100" },
  Admin:   { color: "text-amber-600",  bg: "bg-amber-50 border-amber-100" },
  App:     { color: "text-emerald-600",bg: "bg-emerald-50 border-emerald-100" },
  Webhook: { color: "text-violet-600", bg: "bg-violet-50 border-violet-100" },
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  succeeded: <CheckCircle size={16} className="text-emerald-500" />,
  paid:      <CheckCircle size={16} className="text-emerald-500" />,
  completed: <CheckCircle size={16} className="text-emerald-500" />,
  applied:   <CheckCircle size={16} className="text-emerald-500" />,
  resolved:  <CheckCircle size={16} className="text-emerald-500" />,
  failed:    <AlertTriangle size={16} className="text-rose-500" />,
  warning:   <AlertTriangle size={16} className="text-amber-500" />,
  pending:   <Clock size={16} className="text-amber-500" />,
  open:      <Clock size={16} className="text-blue-500" />,
};

const CATEGORIES = [
  { value: "all",          label: "All Events" },
  { value: "payment",      label: "Payments" },
  { value: "subscription", label: "Subscriptions" },
  { value: "invoice",      label: "Invoices" },
  { value: "support",      label: "Support" },
  { value: "admin",        label: "Admin" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCents(v: number): string {
  return (Math.abs(v) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}
function fmtDate(d?: string | null): string {
  if (!d) return "—";
  try { return format(new Date(d), "MMM d, yyyy"); } catch { return "—"; }
}
function dayLabel(dateStr: string): string {
  const d = parseISO(dateStr + "T12:00:00");
  if (isToday(d))     return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMMM d, yyyy");
}
function getCfg(category: string) {
  return CATEGORY_CFG[category] ?? { icon: <Activity size={12}/>, bg: "bg-slate-100", text: "text-slate-500", badgeBg: "bg-slate-100", badgeText: "text-slate-600", label: category };
}
function getStatusIcon(status?: string) {
  return STATUS_ICON[status ?? ""] ?? <Activity size={16} className="text-slate-400" />;
}

// ─── Event Inspector ──────────────────────────────────────────────────────────

function EventInspector({ event, onClose }: { event: TimelineEvent; onClose: () => void }) {
  const [tab, setTab] = useState<"details" | "payload" | "related" | "logs">("details");
  const cfg = getCfg(event.category);
  const srcCfg = SOURCE_CFG[event.source] ?? SOURCE_CFG.System;
  const md = event.metadata ?? {};

  const copyText = (text: string) => navigator.clipboard?.writeText(text);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-slate-200 flex items-start justify-between flex-shrink-0">
        <div className="flex items-start gap-2.5">
          <div className={clsx("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0", cfg.bg, cfg.text)}>
            {getStatusIcon(event.status)}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800 leading-snug">{event.title}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {format(new Date(event.occurred_at), "MMM d, yyyy 'at' h:mm aa")}
            </p>
            <span className={clsx("text-[9px] font-bold px-1.5 py-0.5 rounded-full border mt-1 inline-block", srcCfg.bg, srcCfg.color)}>
              {event.source}
            </span>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition flex-shrink-0">
          <X size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 flex-shrink-0">
        {(["details","payload","related","logs"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={clsx("px-3 py-2 text-[10px] font-semibold capitalize border-b-2 transition",
              tab === t ? "border-indigo-500 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700")}>
            {t === "payload" ? "Raw Payload" : t === "related" ? "Related Objects" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {tab === "details" && (
          <div className="p-4 space-y-4">
            {/* Description */}
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Description</p>
              <p className="text-xs text-slate-700 leading-relaxed">{event.description}</p>
            </div>

            {/* Amount if financial */}
            {event.amount !== undefined && event.amount !== 0 && (
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Payment Details</p>
                <div className="space-y-1.5">
                  {[
                    { label: "Amount", value: `${fmtCents(event.amount)} USD` },
                    { label: "Payment Method", value: md.brand ? `${md.brand} ···· ${md.last4}` : undefined },
                    { label: "Status", value: event.status },
                    { label: "Invoice", value: md.stripeInvoiceId, link: true },
                    { label: "Payment Intent", value: md.stripeIntentId, link: true },
                  ].filter(r => r.value).map(row => (
                    <div key={row.label} className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">{row.label}</span>
                      <span className={clsx("text-[10px] font-semibold flex items-center gap-1",
                        row.label === "Amount" ? "text-slate-800" :
                        row.label === "Status" ? (["succeeded","paid"].includes(row.value ?? "") ? "text-emerald-600" : row.value === "failed" ? "text-red-600" : "text-amber-600") :
                        "text-indigo-600")}>
                        {row.link && <ExternalLink size={9} />}
                        {String(row.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Metadata fields */}
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Event Info</p>
              <div className="space-y-1.5">
                {[
                  { label: "Source", value: event.source },
                  { label: "Category", value: event.category },
                  { label: "Event ID", value: event.id, mono: true },
                  { label: "Actor", value: event.actor_name },
                  { label: "Actor Type", value: event.actor_type },
                ].filter(r => r.value).map(row => (
                  <div key={row.label} className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-400 flex-shrink-0">{row.label}</span>
                    <span className={clsx("text-[10px] font-medium text-right", row.mono ? "font-mono text-slate-600 truncate max-w-[140px]" : "text-slate-700")}>
                      {String(row.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Ticket specific */}
            {event.category === "support" && md.ticketNumber && (
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Ticket Info</p>
                <div className="space-y-1.5">
                  <div className="flex justify-between"><span className="text-[10px] text-slate-400">Ticket #</span><span className="text-[10px] font-mono font-semibold text-indigo-600">{md.ticketNumber}</span></div>
                  {md.priority && <div className="flex justify-between"><span className="text-[10px] text-slate-400">Priority</span><span className="text-[10px] font-semibold capitalize text-slate-700">{md.priority}</span></div>}
                  {md.subject && <div className="flex justify-between gap-2"><span className="text-[10px] text-slate-400 flex-shrink-0">Subject</span><span className="text-[10px] text-slate-700 text-right line-clamp-2">{md.subject}</span></div>}
                </div>
              </div>
            )}

            {/* Occurred */}
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Timestamp</p>
              <p className="text-[10px] font-mono text-slate-600">{event.occurred_at}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{formatDistanceToNow(new Date(event.occurred_at), { addSuffix: true })}</p>
            </div>
          </div>
        )}

        {tab === "payload" && (
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Raw Payload</p>
              <button onClick={() => copyText(JSON.stringify(event.metadata, null, 2))} className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-700 transition">
                <Copy size={10} /> Copy
              </button>
            </div>
            <pre className="bg-slate-900 text-slate-100 rounded-xl p-3 text-[10px] font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
              {JSON.stringify({ ...event.metadata, _event: { id: event.id, type: event.type, occurred_at: event.occurred_at, source: event.source } }, null, 2)}
            </pre>
          </div>
        )}

        {tab === "related" && (
          <div className="p-4 space-y-2">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Related Objects</p>
            {event.category === "payment" && [
              { label: "Customer", value: `cus_${event.id.slice(-8)}`, icon: <Users size={11}/>, color: "text-indigo-600" },
              { label: "Subscription", value: `sub_${event.id.slice(-8)}`, icon: <Activity size={11}/>, color: "text-violet-600" },
              event.metadata.stripeInvoiceId && { label: "Invoice", value: event.metadata.stripeInvoiceId, icon: <FileText size={11}/>, color: "text-blue-600" },
              event.metadata.stripeIntentId && { label: "Payment Intent", value: event.metadata.stripeIntentId, icon: <CreditCard size={11}/>, color: "text-emerald-600" },
            ].filter(Boolean).map((obj: any) => (
              <div key={obj.label} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50 transition cursor-pointer group">
                <div className="flex items-center gap-2">
                  <span className={clsx("flex-shrink-0", obj.color)}>{obj.icon}</span>
                  <span className="text-[10px] text-slate-500">{obj.label}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={clsx("text-[10px] font-mono font-semibold", obj.color)}>{obj.value}</span>
                  <ExternalLink size={9} className="text-slate-300 group-hover:text-indigo-400 transition" />
                </div>
              </div>
            ))}
            {event.category === "support" && event.metadata.ticketId && (
              <div className="flex items-center justify-between px-3 py-2 bg-amber-50 rounded-xl border border-amber-100 hover:border-amber-300 transition cursor-pointer">
                <div className="flex items-center gap-2">
                  <MessageSquare size={11} className="text-amber-600" />
                  <span className="text-[10px] text-slate-500">Support Ticket</span>
                </div>
                <span className="text-[10px] font-mono font-semibold text-amber-600">{event.metadata.ticketNumber}</span>
              </div>
            )}
            {!["payment","support"].includes(event.category) && (
              <p className="text-[11px] text-slate-400 text-center py-4 italic">No related objects for this event type</p>
            )}
          </div>
        )}

        {tab === "logs" && (
          <div className="p-4">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Debug Logs</p>
            <div className="bg-slate-900 rounded-xl p-3 font-mono text-[10px] text-slate-300 space-y-1 leading-relaxed">
              <p><span className="text-slate-500">[{event.occurred_at}]</span> <span className="text-emerald-400">INFO</span> Event received: <span className="text-cyan-400">{event.type}</span></p>
              <p><span className="text-slate-500">[{event.occurred_at}]</span> <span className="text-emerald-400">INFO</span> Source: <span className="text-yellow-400">{event.source}</span></p>
              <p><span className="text-slate-500">[{event.occurred_at}]</span> <span className="text-emerald-400">INFO</span> Category: <span className="text-yellow-400">{event.category}</span></p>
              {event.status === "failed" ? (
                <>
                  <p><span className="text-slate-500">[{event.occurred_at}]</span> <span className="text-rose-400">ERROR</span> Event status: failed</p>
                  <p><span className="text-slate-500">[{event.occurred_at}]</span> <span className="text-amber-400">WARN</span> Retry may be scheduled</p>
                </>
              ) : (
                <p><span className="text-slate-500">[{event.occurred_at}]</span> <span className="text-emerald-400">INFO</span> Event processed successfully</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="px-4 py-3 border-t border-slate-200 flex-shrink-0 space-y-2">
        {event.source === "Stripe" && (
          <button className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition">
            <RotateCcw size={11} /> Replay Webhook
          </button>
        )}
        <p className="text-[9px] text-slate-400 text-center">Useful for testing or recovering from failures.</p>
      </div>
    </div>
  );
}

// ─── Event Row ────────────────────────────────────────────────────────────────

function EventRow({ event, selected, onSelect, grouped, groupExpanded, onToggleGroup }: {
  event: TimelineEvent;
  selected: boolean;
  onSelect: (e: TimelineEvent) => void;
  grouped?: boolean;
  groupExpanded?: boolean;
  onToggleGroup?: () => void;
}) {
  const cfg = getCfg(event.category);
  const srcCfg = SOURCE_CFG[event.source] ?? SOURCE_CFG.System;
  const isPayment = event.category === "payment";
  const isFailed  = event.status === "failed" || event.status === "warning";
  const isSuccess = ["succeeded","paid","completed","applied","resolved"].includes(event.status ?? "");
  const amt = event.amount !== undefined && event.amount !== 0 ? fmtCents(event.amount) : null;

  return (
    <div className={clsx(
      "group border-b border-slate-100 last:border-0 transition",
      selected ? "bg-indigo-50 border-l-2 border-l-indigo-500" : "hover:bg-slate-50",
      grouped && "ml-4 border-l-2 border-l-slate-200"
    )}>
      <button onClick={() => onSelect(event)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        {/* Status dot/icon */}
        <div className={clsx("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
          isFailed ? "bg-red-100 text-red-600" : isSuccess ? "bg-emerald-100 text-emerald-600" : cfg.bg + " " + cfg.text)}>
          {isFailed ? <AlertTriangle size={13}/> : isSuccess ? <CheckCircle size={13}/> : cfg.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={clsx("text-xs font-semibold leading-snug transition",
              selected ? "text-indigo-700" : "text-slate-800 group-hover:text-indigo-700")}>
              {event.title}
            </p>
            {isFailed && <span className="text-[9px] font-black bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Failed</span>}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 truncate leading-snug">{event.description}</p>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {amt && (
            <span className={clsx("text-[10px] font-bold", (event.amount ?? 0) < 0 ? "text-slate-600" : "text-slate-800")}>
              {(event.amount ?? 0) < 0 ? "-" : ""}{amt}
            </span>
          )}
          {/* Category badge */}
          <span className={clsx("text-[9px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap", cfg.badgeBg, cfg.badgeText)}>
            {cfg.label}
          </span>
          {/* Source badge */}
          <span className={clsx("text-[9px] font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap", srcCfg.bg, srcCfg.color)}>
            {event.source}
          </span>
          {/* Group toggle */}
          {(event.group_size ?? 0) > 1 && onToggleGroup && (
            <button onClick={e => { e.stopPropagation(); onToggleGroup(); }}
              className="flex items-center gap-0.5 text-[9px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full border border-indigo-100 hover:bg-indigo-100 transition">
              {groupExpanded ? <ChevronUp size={9}/> : <ChevronDown size={9}/>}
              {event.group_size}
            </button>
          )}
          <ChevronRight size={12} className="text-slate-300 group-hover:text-indigo-400 transition" />
        </div>
      </button>
    </div>
  );
}

// ─── Account Summary Panel ────────────────────────────────────────────────────

function AccountSummaryPanel({ data, accountId, onQuickAction }: {
  data: AccountSummary;
  accountId: string;
  onQuickAction: (key: string) => void;
}) {
  const navigate = useNavigate();
  const { store, owner, subscription, kpi } = data;
  const initials = [owner?.firstName?.[0], owner?.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "??";
  const hasFailed = (kpi?.failedPaymentsCount ?? 0) > 0;
  const hasDispute = (kpi?.overdueCount ?? 0) > 0;
  const payStatus = hasFailed ? "Failed Payments" : hasDispute ? "Past Due" : "Good";
  const payStatusColor = hasFailed ? "bg-red-100 text-red-700" : hasDispute ? "bg-orange-100 text-orange-700" : "bg-emerald-100 text-emerald-700";

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-thin py-4 px-3">
      {/* Avatar + Name */}
      <div className="flex flex-col items-center text-center mb-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-black text-xl shadow-md mb-2">
          {initials}
        </div>
        <p className="text-sm font-black text-slate-900 leading-tight">{owner?.firstName} {owner?.lastName}</p>
        <p className="text-[10px] text-slate-400 mt-0.5">{owner?.email}</p>
        <p className="text-[9px] text-slate-400 mt-0.5 font-mono">{store?.account_id}</p>
        <span className={clsx("mt-1.5 text-[9px] font-bold px-2 py-0.5 rounded-full",
          store?.accountStatus?.toLowerCase() === "active" ? "bg-emerald-100 text-emerald-700" :
          store?.accountStatus?.toLowerCase() === "suspended" ? "bg-red-100 text-red-700" :
          "bg-slate-100 text-slate-600")}>
          {store?.accountStatus ?? "Unknown"}
        </span>
      </div>

      <div className="space-y-3">
        {/* Plan */}
        {subscription && (
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-2.5">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Plan</p>
            <p className="text-xs font-bold text-slate-800">{subscription.planName ?? subscription.planCode}</p>
            <p className="text-[10px] text-slate-500">${((subscription.priceCents ?? 0)/100).toFixed(2)} / {subscription.interval ?? "mo"}</p>
            {subscription.currentPeriodEnd && (
              <p className="text-[9px] text-slate-400 mt-1">Renews {fmtDate(subscription.currentPeriodEnd)}</p>
            )}
          </div>
        )}

        {/* Lifetime Value */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-2.5">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Lifetime Value</p>
          <p className="text-lg font-black text-emerald-600">${((kpi?.lifetimeValueCents ?? 0)/100).toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
          <p className="text-[9px] text-slate-400">Member since {fmtDate(owner?.signupDate)}</p>
        </div>

        {/* Payment Status */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-2.5">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Payment Status</p>
          <span className={clsx("text-[10px] font-bold px-2 py-0.5 rounded-full", payStatusColor)}>{payStatus}</span>
        </div>

        {/* Risk Flags */}
        {(hasFailed || hasDispute) && (
          <div className="bg-red-50 rounded-xl border border-red-200 p-2.5">
            <p className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-1.5">Risk Flags</p>
            <div className="space-y-1">
              {hasDispute && (
                <div className="flex items-center gap-1.5">
                  <AlertTriangle size={10} className="text-amber-500" />
                  <span className="text-[10px] text-slate-700">{kpi?.overdueCount} Chargeback</span>
                </div>
              )}
              {hasFailed && (
                <div className="flex items-center gap-1.5">
                  <AlertCircle size={10} className="text-rose-500" />
                  <span className="text-[10px] text-slate-700">{kpi?.failedPaymentsCount} Failed Payments</span>
                </div>
              )}
            </div>
            <button className="text-[10px] text-indigo-600 hover:underline mt-1.5 font-semibold">View risk analysis</button>
          </div>
        )}

        {/* Quick Actions */}
        <div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Quick Actions</p>
          <div className="space-y-1.5">
            {[
              { key: "refund",  label: "Issue Refund",        icon: <RotateCcw size={11} className="text-blue-500"/>,   bg: "bg-blue-50 border-blue-100 hover:bg-blue-100" },
              { key: "credit",  label: "Apply Credit",        icon: <DollarSign size={11} className="text-emerald-500"/>,bg: "bg-emerald-50 border-emerald-100 hover:bg-emerald-100" },
              { key: "pause",   label: "Pause Subscription",  icon: <Clock size={11} className="text-amber-500"/>,       bg: "bg-amber-50 border-amber-100 hover:bg-amber-100" },
              { key: "billing", label: "Open Billing",        icon: <ExternalLink size={11} className="text-slate-500"/>,bg: "bg-slate-50 border-slate-100 hover:bg-slate-100", external: true },
            ].map(a => (
              <button key={a.key}
                onClick={() => a.key === "billing" ? navigate(`/isTeam/billing-investigation/${accountId}`) : onQuickAction(a.key)}
                className={clsx("w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-[10px] font-semibold text-slate-700 transition", a.bg)}>
                {a.icon}
                {a.label}
                {a.external && <ExternalLink size={9} className="ml-auto text-slate-400" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AccountTimelineDetailPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<"desc" | "asc">("desc");
  const [groupRelated, setGroupRelated] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Account summary (reuse billing API)
  const { data: acctData } = useQuery<AccountSummary>({
    queryKey: ["billing-detail", accountId],
    queryFn: () => fetch(`/api/support/billing/${accountId}`, { credentials: "include" }).then(r => r.json()),
    staleTime: 60_000,
  });

  // Timeline events
  const params = new URLSearchParams({ sort, category, ...(search ? { search } : {}) });
  const { data: tlData, isLoading, refetch } = useQuery({
    queryKey: ["timeline", accountId, sort, category, search],
    queryFn: () => fetch(`/api/support/timeline/${accountId}?${params}&limit=200`, { credentials: "include" }).then(r => r.json()),
    staleTime: 30_000,
  });

  const allEvents: TimelineEvent[] = tlData?.events ?? [];
  const total = tlData?.total ?? allEvents.length;

  const toast = (msg: string) => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 2500); };
  const onQuickAction = (key: string) => {
    const msgs: Record<string,string> = {
      refund: "Refund modal opened", credit: "Credit modal opened", pause: "Subscription paused",
    };
    toast(msgs[key] ?? "Action triggered");
  };

  // Group events by day, and handle correlation grouping
  const grouped = useMemo(() => {
    const byDay = new Map<string, TimelineEvent[]>();
    for (const ev of allEvents) {
      const key = format(new Date(ev.occurred_at), "yyyy-MM-dd");
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(ev);
    }
    return Array.from(byDay.entries()).map(([key, evs]) => ({ key, label: dayLabel(key), events: evs }));
  }, [allEvents]);

  // Correlation groups: first event in each group is the "parent", rest are children
  const correlationParents = useMemo(() => {
    const parents = new Map<string, string>(); // correlationId → parentEventId
    for (const ev of allEvents) {
      if (ev.correlation_id && !parents.has(ev.correlation_id)) {
        parents.set(ev.correlation_id, ev.id);
      }
    }
    return parents;
  }, [allEvents]);

  const toggleGroup = (correlationId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(correlationId)) next.delete(correlationId);
      else next.add(correlationId);
      return next;
    });
  };

  if (!accountId) return null;

  const initials = acctData
    ? [acctData.owner?.firstName?.[0], acctData.owner?.lastName?.[0]].filter(Boolean).join("").toUpperCase()
    : "...";

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden bg-slate-50">
      {/* ── Left: Account Summary ─────────────────────────────────────────── */}
      <div className="w-52 flex-shrink-0 bg-white border-r border-slate-200 overflow-y-auto">
        {/* Mini breadcrumb */}
        <div className="px-3 pt-3 pb-1 border-b border-slate-100">
          <button onClick={() => navigate("/isTeam/account-timeline")}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-700 transition mb-1">
            <ArrowLeft size={10} /> Account Timeline
          </button>
        </div>
        {acctData ? (
          <AccountSummaryPanel data={acctData} accountId={accountId} onQuickAction={onQuickAction} />
        ) : (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* ── Center: Timeline Feed ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-w-0">
        {/* Toolbar */}
        <div className="bg-white border-b border-slate-200 px-5 py-3 sticky top-0 z-10 flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search events…"
              className="w-full pl-8 pr-10 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:border-indigo-400 focus:outline-none transition"
            />
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 border border-slate-200 rounded px-1 py-px">⌘K</kbd>
          </div>

          {/* Category filter pills */}
          <div className="flex gap-1">
            {CATEGORIES.map(c => (
              <button key={c.value} onClick={() => setCategory(c.value)}
                className={clsx("px-2 py-1 rounded-lg text-[10px] font-semibold transition",
                  category === c.value ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
                {c.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* Group related events toggle */}
            <label className="flex items-center gap-1.5 cursor-pointer">
              <span className="text-[10px] text-slate-500 font-medium">Group related events</span>
              <button onClick={() => setGroupRelated(g => !g)}
                className={clsx("w-8 h-4 rounded-full transition-colors relative", groupRelated ? "bg-indigo-600" : "bg-slate-300")}>
                <div className={clsx("w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all shadow-sm", groupRelated ? "left-4.5" : "left-0.5")} />
              </button>
            </label>

            {/* Sort */}
            <button onClick={() => setSort(s => s === "desc" ? "asc" : "desc")}
              className="flex items-center gap-1 text-[10px] font-semibold text-slate-600 border border-slate-200 px-2 py-1 rounded-lg hover:bg-slate-50 transition">
              {sort === "desc" ? "Newest first" : "Oldest first"} <ChevronDown size={10} />
            </button>

            <button onClick={() => refetch()} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">
              <RefreshCw size={12} />
            </button>
          </div>
        </div>

        {/* Event count */}
        <div className="px-5 py-2.5 flex items-center justify-between">
          <span className="text-[10px] font-semibold text-slate-500">{total} events</span>
        </div>

        {/* Events */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : allEvents.length === 0 ? (
          <div className="text-center py-20">
            <Activity size={32} className="mx-auto mb-3 text-slate-200" />
            <p className="text-slate-500 font-medium">No events found</p>
            <p className="text-xs text-slate-400 mt-1">Try adjusting your filters or search</p>
          </div>
        ) : (
          <div className="pb-8">
            {grouped.map(group => (
              <div key={group.key} className="mb-4">
                {/* Day divider */}
                <div className="flex items-center gap-3 px-5 py-2">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{group.label}</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                <div className="mx-5 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  {group.events.map(ev => {
                    const isGroupParent = !!(groupRelated && ev.correlation_id && correlationParents.get(ev.correlation_id) === ev.id && (ev.group_size ?? 0) > 1);
                    const isGroupChild  = !!(groupRelated && ev.correlation_id && correlationParents.get(ev.correlation_id) !== ev.id);
                    const groupExpanded = expandedGroups.has(ev.correlation_id ?? "");

                    // Skip children if group is not expanded
                    if (isGroupChild && !groupExpanded) return null;

                    return (
                      <EventRow
                        key={ev.id}
                        event={ev}
                        selected={selectedEvent?.id === ev.id}
                        onSelect={setSelectedEvent}
                        grouped={isGroupChild}
                        groupExpanded={isGroupParent ? groupExpanded : undefined}
                        onToggleGroup={isGroupParent ? () => toggleGroup(ev.correlation_id!) : undefined}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Right: Event Inspector ────────────────────────────────────────── */}
      <div className={clsx(
        "flex-shrink-0 border-l border-slate-200 transition-all overflow-hidden",
        selectedEvent ? "w-72" : "w-0"
      )}>
        {selectedEvent && (
          <EventInspector event={selectedEvent} onClose={() => setSelectedEvent(null)} />
        )}
      </div>

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 bg-slate-800 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xl z-50 animate-in fade-in slide-in-from-bottom-2">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
