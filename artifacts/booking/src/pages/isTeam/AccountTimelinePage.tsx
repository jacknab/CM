/**
 * /isTeam/account-timeline/:accountId
 * Screen 7 — Customer 360 Timeline & Event Stream
 */
import { useState, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { supportApi, type AccountOverview } from "@/lib/support-api";
import {
  DollarSign, CreditCard, Ticket, Shield, UserCog, CalendarDays,
  MessageSquare, Bot, Globe, Users, ArrowLeft, Search, X,
  ChevronRight, RotateCcw, Zap, RefreshCw, Filter, Clock,
  AlertTriangle, CheckCircle2, XCircle, Info, ExternalLink,
  Copy, SlidersHorizontal, ChevronDown, Activity,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TimelineEvent {
  id: string;
  category: string;
  title: string;
  subtitle: string | null;
  metadata: Record<string, any>;
  occurred_at: string;
  actor_name: string | null;
  actor_type: string;
  severity: "info" | "warning" | "critical";
}

interface TimelineResponse {
  events: TimelineEvent[];
  hasMore: boolean;
  total: number;
  offset: number;
  limit: number;
}

// ─── Config ───────────────────────────────────────────────────────────────────
const CATEGORY_CONFIG: Record<string, {
  icon: React.ReactNode; color: string; bg: string; ring: string;
  label: string; source: string;
}> = {
  billing:        { icon: <DollarSign size={13} />,    color: "text-emerald-400", bg: "bg-emerald-500/15", ring: "ring-emerald-500/30", label: "Payment",     source: "Stripe"  },
  subscription:   { icon: <CreditCard size={13} />,    color: "text-blue-400",    bg: "bg-blue-500/15",    ring: "ring-blue-500/30",    label: "Subscription",source: "System"  },
  ticket:         { icon: <Ticket size={13} />,        color: "text-amber-400",   bg: "bg-amber-500/15",   ring: "ring-amber-500/30",   label: "Ticket",      source: "iSTeam"  },
  authentication: { icon: <Shield size={13} />,        color: "text-purple-400",  bg: "bg-purple-500/15",  ring: "ring-purple-500/30",  label: "Security",    source: "App"     },
  support:        { icon: <UserCog size={13} />,       color: "text-indigo-400",  bg: "bg-indigo-500/15",  ring: "ring-indigo-500/30",  label: "Admin",       source: "Admin"   },
  appointment:    { icon: <CalendarDays size={13} />,  color: "text-teal-400",    bg: "bg-teal-500/15",    ring: "ring-teal-500/30",    label: "Appointment", source: "App"     },
  sms:            { icon: <MessageSquare size={13} />, color: "text-slate-400",   bg: "bg-slate-500/15",   ring: "ring-slate-500/30",   label: "SMS",         source: "System"  },
  ai_receptionist:{ icon: <Bot size={13} />,           color: "text-violet-400",  bg: "bg-violet-500/15",  ring: "ring-violet-500/30",  label: "AI",          source: "System"  },
  website:        { icon: <Globe size={13} />,         color: "text-cyan-400",    bg: "bg-cyan-500/15",    ring: "ring-cyan-500/30",    label: "Website",     source: "System"  },
  users:          { icon: <Users size={13} />,         color: "text-pink-400",    bg: "bg-pink-500/15",    ring: "ring-pink-500/30",    label: "Staff",       source: "App"     },
};

const SEVERITY_ICON: Record<string, React.ReactNode> = {
  critical: <XCircle size={11} className="text-red-400" />,
  warning:  <AlertTriangle size={11} className="text-amber-400" />,
  info:     <CheckCircle2 size={11} className="text-slate-500" />,
};

const CATEGORIES = [
  { value: "all",            label: "All Events" },
  { value: "billing",        label: "Payments" },
  { value: "subscription",   label: "Subscriptions" },
  { value: "ticket",         label: "Tickets" },
  { value: "support",        label: "Admin Actions" },
  { value: "authentication", label: "Security" },
  { value: "appointment",    label: "Appointments" },
  { value: "sms",            label: "SMS" },
  { value: "ai_receptionist",label: "AI" },
  { value: "website",        label: "Website" },
  { value: "users",          label: "Staff" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(s: string) {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtTime(s: string) {
  if (!s) return "";
  const d = new Date(s);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function fmtDateTime(s: string) {
  if (!s) return "—";
  return `${fmtDate(s)} at ${fmtTime(s)}`;
}
function fmtCents(c: number | null | undefined) {
  if (c == null) return null;
  return `$${(c / 100).toFixed(2)} USD`;
}
function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}
function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

// Groups events within 5-minute windows that share related categories
function groupRelatedEvents(events: TimelineEvent[]): (TimelineEvent | TimelineEvent[])[] {
  const groups: (TimelineEvent | TimelineEvent[])[] = [];
  let i = 0;
  while (i < events.length) {
    const e = events[i];
    const t = new Date(e.occurred_at).getTime();
    const cluster: TimelineEvent[] = [e];
    let j = i + 1;
    while (j < events.length) {
      const next = events[j];
      const diff = Math.abs(t - new Date(next.occurred_at).getTime());
      if (diff < 5 * 60_000) { cluster.push(next); j++; } else break;
    }
    groups.push(cluster.length > 1 ? cluster : e);
    i = j;
  }
  return groups;
}

async function fetchTimeline(accountId: number, category: string, search: string, offset: number): Promise<TimelineResponse> {
  const params = new URLSearchParams({ category, offset: String(offset), limit: "50" });
  if (search) params.set("search", search);
  const res = await fetch(`/api/support/accounts/${accountId}/timeline?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load timeline");
  return res.json();
}

// ─── Left Panel — Account Summary ────────────────────────────────────────────
function AccountSummaryPanel({ accountId, overview }: { accountId: number; overview: AccountOverview | undefined }) {
  const navigate = useNavigate();

  const store        = overview?.store;
  const owner        = overview?.owner;
  const subscription = overview?.subscription;

  const statusColor = (s: string) =>
    s === "active" ? "bg-emerald-500/15 text-emerald-400" :
    s === "trial"  ? "bg-blue-500/15 text-blue-400" :
    s === "suspended" ? "bg-red-500/15 text-red-400" :
    "bg-slate-500/15 text-slate-400";

  const name = store?.name ?? owner?.name ?? "Loading…";

  return (
    <div className="w-60 flex-shrink-0 flex flex-col gap-3 sticky top-0 overflow-y-auto max-h-screen pb-8 pr-1">
      {/* Back */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition mb-1">
        <ArrowLeft size={12} /> Back
      </button>

      {/* Avatar + name */}
      <div className="bg-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {name ? initials(name) : "?"}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white leading-tight truncate">{name}</div>
            <div className="text-[11px] text-slate-400 truncate mt-0.5">{owner?.email ?? "—"}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {store?.accountStatus && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${statusColor(store.accountStatus)}`}>
              {store.accountStatus}
            </span>
          )}
          {subscription?.planName && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 uppercase tracking-wide">
              {subscription.planName}
            </span>
          )}
        </div>

        <div className="text-[10px] text-slate-500 font-mono truncate">
          ID: {accountId}
        </div>
      </div>

      {/* Plan */}
      {subscription && (
        <div className="bg-slate-800 rounded-xl p-4 space-y-2">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Plan</div>
          <div className="text-sm font-semibold text-white">{subscription.planName}</div>
          <div className="text-xs text-slate-400">
            {fmtCents(subscription.priceCents)} / {subscription.interval ?? "mo"}
          </div>
          {subscription.renewalDate && (
            <div className="text-[11px] text-slate-500">
              Renews {fmtDate(subscription.renewalDate)}
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="bg-slate-800 rounded-xl p-4 space-y-3">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Account</div>
        <div className="space-y-2">
          {owner?.signupDate && (
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Member since</span>
              <span className="text-slate-300">{fmtDate(owner.signupDate)}</span>
            </div>
          )}
          <div className="flex justify-between text-xs">
            <span className="text-slate-500">Payment</span>
            <span className="text-emerald-400 font-medium">Good</span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-slate-800 rounded-xl p-4 space-y-2">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Quick Actions</div>
        {[
          { icon: <RotateCcw size={13} />, label: "Issue Refund",       color: "text-amber-400" },
          { icon: <Zap size={13} />,        label: "Apply Credit",       color: "text-emerald-400" },
          { icon: <Activity size={13} />,   label: "Pause Subscription", color: "text-orange-400" },
          { icon: <ExternalLink size={13} />,label: "Open Billing",      color: "text-indigo-400" },
        ].map(a => (
          <Link
            key={a.label}
            to={`/isTeam/accounts/${accountId}`}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-slate-700 transition"
          >
            <span className={a.color}>{a.icon}</span>
            {a.label}
          </Link>
        ))}
      </div>

      {/* View full profile */}
      <Link
        to={`/isTeam/accounts/${accountId}`}
        className="flex items-center justify-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition py-1"
      >
        View full profile <ChevronRight size={12} />
      </Link>
    </div>
  );
}

// ─── Event Card ───────────────────────────────────────────────────────────────
function EventCard({ event, selected, onClick }: { event: TimelineEvent; selected: boolean; onClick: () => void }) {
  const cfg = CATEGORY_CONFIG[event.category] ?? CATEGORY_CONFIG["billing"];
  const severityBorder = event.severity === "critical" ? "border-l-red-500" : event.severity === "warning" ? "border-l-amber-500/60" : "border-l-transparent";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-start gap-3 px-4 py-3.5 border-b border-slate-800 transition group border-l-2 ${severityBorder} ${selected ? "bg-indigo-600/10" : "hover:bg-white/[0.03]"}`}
    >
      {/* Icon */}
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ring-1 mt-0.5 ${cfg.bg} ${cfg.ring}`}>
        <span className={cfg.color}>{cfg.icon}</span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <span className={`text-sm font-medium leading-snug ${selected ? "text-indigo-200" : "text-slate-200"}`}>
            {event.title}
          </span>
          <span className="text-[11px] text-slate-500 whitespace-nowrap flex-shrink-0 mt-0.5">
            {fmtTime(event.occurred_at)}
          </span>
        </div>
        {event.subtitle && (
          <div className="text-[11px] text-slate-500 mt-0.5 truncate">{event.subtitle}</div>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>
            {cfg.label}
          </span>
          <span className="text-[10px] text-slate-600">{cfg.source}</span>
          {event.severity !== "info" && (
            <span className="ml-auto">{SEVERITY_ICON[event.severity]}</span>
          )}
        </div>
      </div>

      <ChevronRight size={13} className="text-slate-700 group-hover:text-slate-500 flex-shrink-0 mt-1 transition" />
    </button>
  );
}

// ─── Group Card (correlated events) ──────────────────────────────────────────
function GroupCard({ events, selectedId, onSelect }: { events: TimelineEvent[]; selectedId: string | null; onSelect: (e: TimelineEvent) => void }) {
  const [expanded, setExpanded] = useState(false);
  const lead = events[0];
  const cfg  = CATEGORY_CONFIG[lead.category] ?? CATEGORY_CONFIG["billing"];

  if (expanded) {
    return (
      <div className="border-b border-slate-800">
        <button onClick={() => setExpanded(false)} className="w-full flex items-center gap-2 px-4 py-2 text-xs text-slate-500 hover:text-slate-400 transition bg-slate-800/40">
          <ChevronDown size={12} /> {events.length} correlated events — collapse
        </button>
        {events.map(e => <EventCard key={e.id} event={e} selected={selectedId === e.id} onClick={() => onSelect(e)} />)}
      </div>
    );
  }

  return (
    <button
      onClick={() => setExpanded(true)}
      className="w-full text-left flex items-start gap-3 px-4 py-3.5 border-b border-slate-800 hover:bg-white/[0.03] transition group border-l-2 border-l-indigo-500/40"
    >
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ring-1 mt-0.5 ${cfg.bg} ${cfg.ring}`}>
        <span className={cfg.color}>{cfg.icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium text-slate-200 leading-snug">{lead.title}</span>
          <span className="text-[11px] text-slate-500 whitespace-nowrap">{fmtTime(lead.occurred_at)}</span>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] font-semibold text-indigo-400 bg-indigo-500/15 px-1.5 py-0.5 rounded">
            {events.length} related events
          </span>
          <span className="text-[10px] text-slate-600">click to expand</span>
        </div>
      </div>
      <ChevronRight size={13} className="text-slate-700 group-hover:text-slate-500 mt-1 transition" />
    </button>
  );
}

// ─── Date Divider ─────────────────────────────────────────────────────────────
function DateDivider({ date }: { date: string }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-2 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800">
      <div className="flex-1 h-px bg-slate-800" />
      <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
        <Clock size={10} /> {date}
      </span>
      <div className="flex-1 h-px bg-slate-800" />
    </div>
  );
}

// ─── Event Inspector ──────────────────────────────────────────────────────────
function EventInspector({ event, onClose }: { event: TimelineEvent; onClose: () => void }) {
  const [tab, setTab] = useState<"details" | "raw">("details");
  const cfg = CATEGORY_CONFIG[event.category] ?? CATEGORY_CONFIG["billing"];

  const meta = event.metadata ?? {};

  return (
    <div className="w-80 flex-shrink-0 flex flex-col border-l border-slate-800 bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <span className="text-sm font-semibold text-white">Event Inspector</span>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition">
          <X size={15} />
        </button>
      </div>

      {/* Event title */}
      <div className="px-4 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5 mb-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ring-1 ${cfg.bg} ${cfg.ring}`}>
            <span className={cfg.color}>{cfg.icon}</span>
          </div>
          <div>
            <div className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</div>
            <div className="text-[10px] text-slate-500">{fmtDateTime(event.occurred_at)}</div>
          </div>
        </div>
        <div className="text-sm font-semibold text-white leading-snug">{event.title}</div>
        {event.subtitle && <div className="text-xs text-slate-400 mt-1">{event.subtitle}</div>}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800">
        {(["details", "raw"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium transition ${tab === t ? "text-indigo-400 border-b-2 border-indigo-400" : "text-slate-500 hover:text-slate-300"}`}>
            {t === "details" ? "Details" : "Raw Payload"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {tab === "details" ? (
          <>
            {/* Description */}
            {meta.amountFormatted && (
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider mb-2">Payment Details</div>
                <div className="space-y-1.5">
                  <KV label="Amount" value={meta.amountFormatted} />
                  {meta.brand && <KV label="Payment Method" value={`${meta.brand} ····${meta.last4}`} />}
                  {meta.status && <KV label="Status" value={meta.status} />}
                </div>
              </div>
            )}

            {meta.ticketNumber && (
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider mb-2">Ticket</div>
                <div className="space-y-1.5">
                  <KV label="Number" value={`#${meta.ticketNumber}`} />
                  <KV label="Status" value={meta.status} />
                  <KV label="Priority" value={meta.priority} />
                  {meta.channel && <KV label="Channel" value={meta.channel} />}
                  {meta.customerEmail && <KV label="Customer" value={meta.customerEmail} />}
                </div>
              </div>
            )}

            {/* Source */}
            <div>
              <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider mb-2">Source</div>
              <div className="space-y-1.5">
                <KV label="Source" value={cfg.source} />
                <KV label="Category" value={cfg.label} />
                <KV label="Severity" value={event.severity} />
                {event.actor_name && <KV label="Actor" value={event.actor_name} />}
              </div>
            </div>

            {/* Event ID */}
            <div>
              <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider mb-2">Event ID</div>
              <div className="flex items-center gap-2">
                <code className="text-[10px] text-slate-400 bg-slate-800 px-2 py-1 rounded font-mono flex-1 truncate">{event.id}</code>
                <button onClick={() => copyToClipboard(event.id)} className="text-slate-500 hover:text-slate-300 transition">
                  <Copy size={12} />
                </button>
              </div>
            </div>

            {/* All metadata keys */}
            {Object.keys(meta).length > 0 && (
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider mb-2">All Fields</div>
                <div className="space-y-1.5">
                  {Object.entries(meta).filter(([,v]) => v != null).map(([k, v]) => (
                    <KV key={k} label={k} value={String(v)} />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">Raw Payload</span>
              <button onClick={() => copyToClipboard(JSON.stringify(event, null, 2))} className="text-slate-500 hover:text-slate-300 transition flex items-center gap-1 text-[10px]">
                <Copy size={10} /> Copy
              </button>
            </div>
            <pre className="text-[10px] text-slate-300 bg-slate-800 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
              {JSON.stringify(event, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string | null | undefined }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-start justify-between gap-2 text-xs">
      <span className="text-slate-500 capitalize flex-shrink-0">{label.replace(/([A-Z])/g, " $1").trim()}</span>
      <span className="text-slate-300 text-right">{value}</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AccountTimelinePage() {
  const { accountId } = useParams<{ accountId?: string }>();
  const navigate = useNavigate();

  const id = parseInt(accountId ?? "0");

  const [search,       setSearch]       = useState("");
  const [debouncedQ,   setDebouncedQ]   = useState("");
  const [category,     setCategory]     = useState("all");
  const [groupRelated, setGroupRelated] = useState(true);
  const [selectedEvt,  setSelectedEvt]  = useState<TimelineEvent | null>(null);
  const [showFilters,  setShowFilters]  = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedQ(v), 350);
  };

  // ── Overview (left panel) ─────────────────────────────────────────────────
  const { data: overview } = useQuery<AccountOverview>({
    queryKey: ["support-account-overview", id],
    queryFn:  () => supportApi.accounts.overview(id),
    enabled:  !!id,
  });

  // ── Timeline (infinite scroll) ─────────────────────────────────────────────
  const {
    data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error,
  } = useInfiniteQuery({
    queryKey: ["account-timeline", id, category, debouncedQ],
    queryFn:  ({ pageParam = 0 }) => fetchTimeline(id, category, debouncedQ, pageParam as number),
    getNextPageParam: (last: TimelineResponse) =>
      last.hasMore ? last.offset + last.limit : undefined,
    initialPageParam: 0,
    enabled: !!id,
  });

  const allEvents: TimelineEvent[] = data?.pages.flatMap(p => p.events) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  // Group by date for dividers
  const renderItems = useCallback(() => {
    const items: React.ReactNode[] = [];
    let lastDate = "";

    const feed = groupRelated ? groupRelatedEvents(allEvents) : allEvents;

    feed.forEach((item, idx) => {
      const e = Array.isArray(item) ? item[0] : item;
      const d = fmtDate(e.occurred_at);
      if (d !== lastDate) { items.push(<DateDivider key={`d-${d}`} date={d} />); lastDate = d; }
      if (Array.isArray(item)) {
        items.push(<GroupCard key={`grp-${idx}`} events={item} selectedId={selectedEvt?.id ?? null} onSelect={setSelectedEvt} />);
      } else {
        items.push(<EventCard key={item.id} event={item} selected={selectedEvt?.id === item.id} onClick={() => setSelectedEvt(item)} />);
      }
    });
    return items;
  }, [allEvents, groupRelated, selectedEvt]);

  if (!id) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500">
        <div className="text-center space-y-2">
          <Activity size={32} className="mx-auto opacity-30" />
          <p className="text-sm">Select an account to view its timeline</p>
          <button onClick={() => navigate("/isTeam/accounts")} className="text-xs text-indigo-400 hover:text-indigo-300 transition">
            Browse accounts →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden bg-slate-900 text-slate-200">

      {/* ── Left: Account Summary ──────────────────────────────────────────── */}
      <div className="p-5 overflow-y-auto border-r border-slate-800">
        <AccountSummaryPanel accountId={id} overview={overview} />
      </div>

      {/* ── Middle: Timeline Feed ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Account Timeline & Event Stream</h2>
              <p className="text-xs text-slate-500 mt-0.5">Everything that happened with this account, in order.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="font-semibold text-slate-200">{total.toLocaleString()}</span> events
            </div>
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 max-w-xs">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Search events…"
                className="w-full pl-8 pr-8 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
              />
              {search && (
                <button onClick={() => { setSearch(""); setDebouncedQ(""); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  <X size={11} />
                </button>
              )}
            </div>

            {/* Filters toggle */}
            <button onClick={() => setShowFilters(s => !s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition border ${showFilters ? "bg-indigo-600/20 text-indigo-400 border-indigo-500/30" : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"}`}>
              <SlidersHorizontal size={12} /> Filters
            </button>

            {/* Group toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <div className="text-xs text-slate-400 whitespace-nowrap">Group related</div>
              <button
                onClick={() => setGroupRelated(g => !g)}
                className={`relative w-8 h-4 rounded-full transition ${groupRelated ? "bg-indigo-600" : "bg-slate-700"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${groupRelated ? "translate-x-4" : "translate-x-0"}`} />
              </button>
            </label>
          </div>

          {/* Category filter */}
          {showFilters && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {CATEGORIES.map(c => (
                <button key={c.value} onClick={() => setCategory(c.value)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition ${category === c.value ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"}`}>
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Timeline list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-slate-500 text-sm gap-2">
              <RefreshCw size={14} className="animate-spin" /> Loading timeline…
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-40 text-red-400 text-sm gap-2">
              <XCircle size={14} /> Failed to load timeline
            </div>
          ) : allEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-500 gap-2">
              <Activity size={24} className="opacity-30" />
              <span className="text-sm">No events found</span>
            </div>
          ) : (
            <>
              {renderItems()}
              {hasNextPage && (
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="w-full flex items-center justify-center gap-2 py-4 text-xs text-slate-400 hover:text-slate-200 transition disabled:opacity-50"
                >
                  {isFetchingNextPage ? <><RefreshCw size={12} className="animate-spin" /> Loading…</> : <>Load more events ↓</>}
                </button>
              )}
              {!hasNextPage && allEvents.length > 0 && (
                <div className="text-center py-6 text-xs text-slate-600">All events loaded · {total.toLocaleString()} total</div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Right: Event Inspector ─────────────────────────────────────────── */}
      {selectedEvt && (
        <EventInspector event={selectedEvt} onClose={() => setSelectedEvt(null)} />
      )}
    </div>
  );
}
