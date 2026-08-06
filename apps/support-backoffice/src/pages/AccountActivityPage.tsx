import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft, Download, RefreshCw, Clock, ChevronDown, Calendar,
  MessageSquare, Phone, DollarSign, Shield, Activity, Globe,
  Users, CreditCard, LogIn, Zap, ExternalLink, Tag, Plus, X,
  AlertCircle, AlertTriangle, Info, Wifi, WifiOff, Loader2, FileJson,
} from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { clsx } from "clsx";
import { api, type AccountOverview, type ActivityEvent } from "@/lib/api";
import { StatusBadge } from "@/components/ui/StatusBadge";
import ActivityFilterPanelFull, {
  type FullActivityFilters,
  DEFAULT_FILTERS,
} from "@/components/activity/ActivityFilterPanelFull";
import EventDetailDrawer from "@/components/activity/EventDetailDrawer";

// ─── Category Config ──────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, {
  icon: React.ReactNode;
  iconBg: string;
  badgeBg: string;
  badgeText: string;
  label: string;
}> = {
  appointment:    { icon: <Calendar size={12} />,      iconBg: "bg-indigo-100 text-indigo-600",  badgeBg: "bg-indigo-100",  badgeText: "text-indigo-700",  label: "Appointment" },
  sms:            { icon: <MessageSquare size={12} />, iconBg: "bg-violet-100 text-violet-600",  badgeBg: "bg-violet-100",  badgeText: "text-violet-700",  label: "SMS" },
  ai_receptionist:{ icon: <Phone size={12} />,         iconBg: "bg-sky-100 text-sky-600",        badgeBg: "bg-sky-100",     badgeText: "text-sky-700",     label: "AI" },
  billing:        { icon: <DollarSign size={12} />,    iconBg: "bg-emerald-100 text-emerald-600",badgeBg: "bg-emerald-100", badgeText: "text-emerald-700", label: "Billing" },
  support:        { icon: <Shield size={12} />,        iconBg: "bg-amber-100 text-amber-600",    badgeBg: "bg-amber-100",   badgeText: "text-amber-700",   label: "Support" },
  authentication: { icon: <Shield size={12} />,        iconBg: "bg-orange-100 text-orange-600",  badgeBg: "bg-orange-100",  badgeText: "text-orange-700",  label: "Auth" },
  website:        { icon: <Globe size={12} />,         iconBg: "bg-teal-100 text-teal-600",      badgeBg: "bg-teal-100",    badgeText: "text-teal-700",    label: "Website" },
  users:          { icon: <Users size={12} />,         iconBg: "bg-rose-100 text-rose-600",      badgeBg: "bg-rose-100",    badgeText: "text-rose-700",    label: "Users" },
  subscription:   { icon: <CreditCard size={12} />,   iconBg: "bg-purple-100 text-purple-600",  badgeBg: "bg-purple-100",  badgeText: "text-purple-700",  label: "Sub" },
  email:          { icon: <MessageSquare size={12} />, iconBg: "bg-blue-100 text-blue-600",      badgeBg: "bg-blue-100",    badgeText: "text-blue-700",    label: "Email" },
};

function getCategoryConfig(category: string) {
  return CATEGORY_CONFIG[category] ?? {
    icon: <Activity size={12} />,
    iconBg: "bg-slate-100 text-slate-500",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-600",
    label: category.replace(/_/g, " "),
  };
}

function SeverityDot({ severity }: { severity?: string }) {
  if (!severity || severity === "info") return null;
  return (
    <span className={clsx(
      "w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5",
      severity === "critical" ? "bg-rose-500" : "bg-amber-500"
    )} />
  );
}

// ─── Date grouping ────────────────────────────────────────────────────────────

function groupLabel(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d))     return `Today — ${format(d, "MMMM d, yyyy")}`;
  if (isYesterday(d)) return `Yesterday — ${format(d, "MMMM d, yyyy")}`;
  return format(d, "EEEE, MMMM d, yyyy");
}

function eventDateKey(occurredAt: string): string {
  return format(new Date(occurredAt), "yyyy-MM-dd");
}

function groupEvents(events: ActivityEvent[]): Array<{ key: string; label: string; events: ActivityEvent[] }> {
  const map = new Map<string, ActivityEvent[]>();
  for (const ev of events) {
    const key = eventDateKey(ev.occurred_at);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ev);
  }
  return Array.from(map.entries()).map(([key, evs]) => ({
    key,
    label: groupLabel(`${key}T12:00:00`),
    events: evs,
  }));
}

// ─── Event Row ────────────────────────────────────────────────────────────────

function EventRow({ event, onSelect }: { event: ActivityEvent; onSelect: (e: ActivityEvent) => void }) {
  const cfg     = getCategoryConfig(event.category);
  const time    = format(new Date(event.occurred_at), "h:mm aa");
  const severity = (event as any).severity;
  const actorType = (event as any).actor_type;

  return (
    <button
      onClick={() => onSelect(event)}
      className="w-full flex items-start gap-3 px-4 py-3 hover:bg-indigo-50/50 transition border-b border-slate-50 last:border-0 group text-left"
    >
      {/* Time */}
      <div className="w-14 flex-shrink-0 text-right pt-0.5">
        <span className="text-[11px] text-slate-400 font-medium leading-none">{time}</span>
      </div>

      {/* Icon */}
      <div className={clsx("w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5", cfg.iconBg)}>
        {cfg.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-800 leading-tight group-hover:text-indigo-700 transition">{event.title}</p>
        {event.subtitle && (
          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug truncate">{event.subtitle}</p>
        )}
        {(event as any).actor_name && (
          <p className="text-[10px] text-slate-400 mt-0.5">
            <span className="capitalize">{actorType?.replace(/_/g, " ")}</span>: {(event as any).actor_name}
          </p>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-start gap-1.5 flex-shrink-0 mt-0.5">
        <SeverityDot severity={severity} />
        <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", cfg.badgeBg, cfg.badgeText)}>
          {cfg.label}
        </span>
      </div>
    </button>
  );
}

// ─── Date Group ───────────────────────────────────────────────────────────────

function DateGroup({ label, events, onSelectEvent }: { label: string; events: ActivityEvent[]; onSelectEvent: (e: ActivityEvent) => void }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-3 px-4 py-1.5">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest whitespace-nowrap">{label}</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>
      <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden mx-3 shadow-sm">
        {events.map(ev => (
          <EventRow key={ev.id ?? `${ev.occurred_at}-${ev.title}`} event={ev} onSelect={onSelectEvent} />
        ))}
      </div>
    </div>
  );
}

// ─── Activity Response type ────────────────────────────────────────────────────

interface ActivityResponse {
  events: ActivityEvent[];
  hasMore: boolean;
  total: number;
  offset: number;
  limit: number;
}

// ─── Build API params from FullActivityFilters ────────────────────────────────

function filtersToParams(filters: FullActivityFilters, extra: Record<string, string> = {}): URLSearchParams {
  const cat = filters.categories.length === 1 ? filters.categories[0] : "all";
  const p = new URLSearchParams({
    category: cat,
    range: filters.range,
    actor: filters.actor,
    severity: filters.severity,
    ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
    ...(filters.range === "custom" && filters.customFrom ? { from: filters.customFrom } : {}),
    ...(filters.range === "custom" && filters.customTo   ? { to: filters.customTo }     : {}),
    ...extra,
  });
  return p;
}

// ─── Live Update Banner ────────────────────────────────────────────────────────

function LiveBanner({ count, onView }: { count: number; onView: () => void }) {
  if (count === 0) return null;
  return (
    <div className="mx-3 mb-2">
      <button
        onClick={onView}
        className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium transition animate-pulse"
      >
        <Wifi size={12} />
        {count} new event{count > 1 ? "s" : ""} — click to load
      </button>
    </div>
  );
}

// ─── Main Activity Feed ───────────────────────────────────────────────────────

const PAGE_LIMIT = 50;

function ActivityFeed({
  accountId,
  filters,
  onSelectEvent,
}: {
  accountId: number;
  filters: FullActivityFilters;
  onSelectEvent: (e: ActivityEvent) => void;
}) {
  const qc = useQueryClient();
  const [allEvents, setAllEvents] = useState<ActivityEvent[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [liveCount, setLiveCount] = useState(0);
  const [liveEvents, setLiveEvents] = useState<ActivityEvent[]>([]);
  const [sseConnected, setSseConnected] = useState(false);

  const queryKey = ["activity-page", accountId, JSON.stringify(filters)];

  const { data, isLoading, isError } = useQuery<ActivityResponse>({
    queryKey,
    queryFn: async () => {
      const params = filtersToParams(filters, { limit: String(PAGE_LIMIT), offset: "0" });
      const res = await fetch(`/api/support/accounts/${accountId}/activity?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch activity");
      return res.json();
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (data?.events) setAllEvents(data.events);
  }, [data]);

  useEffect(() => {
    setAllEvents([]);
    setLiveCount(0);
    setLiveEvents([]);
  }, [JSON.stringify(filters)]);

  // SSE live updates
  useEffect(() => {
    const es = new EventSource(`/api/support/accounts/${accountId}/activity/stream`, { withCredentials: true });
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "new_event" && msg.event) {
          setLiveEvents(prev => [msg.event, ...prev]);
          setLiveCount(c => c + 1);
        }
      } catch {}
    };
    return () => es.close();
  }, [accountId]);

  const applyLiveEvents = () => {
    setAllEvents(prev => [...liveEvents, ...prev]);
    setLiveCount(0);
    setLiveEvents([]);
  };

  const loadMore = async () => {
    const nextOffset = allEvents.length;
    setIsLoadingMore(true);
    try {
      const params = filtersToParams(filters, { limit: String(PAGE_LIMIT), offset: String(nextOffset) });
      const res = await fetch(`/api/support/accounts/${accountId}/activity?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error();
      const more: ActivityResponse = await res.json();
      setAllEvents(prev => [...prev, ...more.events]);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleRefresh = () => {
    setAllEvents([]);
    setLiveCount(0);
    setLiveEvents([]);
    qc.invalidateQueries({ queryKey });
  };

  const handleExport = async (fmt: "csv" | "json") => {
    const params = filtersToParams(filters, { format: fmt, range: filters.range || "30d" });
    const url = `/api/support/accounts/${accountId}/activity/export?${params}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-${accountId}-${Date.now()}.${fmt}`;
    a.click();
  };

  const displayedEvents = allEvents.length > 0 ? allEvents : (data?.events ?? []);
  const hasMore = (data?.total ?? 0) > displayedEvents.length;
  const total = data?.total ?? 0;

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Loading activity…</p>
      </div>
    </div>
  );

  if (isError) return (
    <div className="flex-1 flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <p className="text-slate-500 text-sm">Failed to load activity</p>
        <button onClick={handleRefresh} className="mt-2 text-indigo-600 hover:underline text-sm">Retry</button>
      </div>
    </div>
  );

  const groups = groupEvents(displayedEvents);

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-50">
      {/* Feed Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-800">Activity Timeline</h2>
          {total > 0 && (
            <span className="text-[10px] bg-slate-100 text-slate-600 rounded-full px-2 py-0.5 font-medium">
              {total.toLocaleString()} events
            </span>
          )}
          <div className={clsx("flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full", sseConnected ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400")}>
            {sseConnected ? <Wifi size={9} /> : <WifiOff size={9} />}
            {sseConnected ? "Live" : "Offline"}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={handleRefresh} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition" title="Refresh">
            <RefreshCw size={12} />
          </button>
          <div className="relative group">
            <button className="flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-[11px] text-slate-600 hover:bg-slate-50 transition font-medium">
              <Download size={11} /> Export
              <ChevronDown size={10} />
            </button>
            <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-slate-200 rounded-xl shadow-lg z-10 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition overflow-hidden">
              <button onClick={() => handleExport("csv")} className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                <Download size={11} /> CSV
              </button>
              <button onClick={() => handleExport("json")} className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                <FileJson size={11} /> JSON
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Live banner */}
      {liveCount > 0 && (
        <div className="px-3 pt-2">
          <LiveBanner count={liveCount} onView={applyLiveEvents} />
        </div>
      )}

      {/* Events */}
      <div className="flex-1 overflow-y-auto py-2">
        {displayedEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-20">
            <Clock size={36} className="text-slate-200 mb-3" />
            <p className="text-slate-500 font-medium text-sm">No activity found</p>
            <p className="text-slate-400 text-xs mt-1">Try adjusting your filters or date range</p>
          </div>
        ) : (
          <>
            {groups.map(g => (
              <DateGroup key={g.key} label={g.label} events={g.events} onSelectEvent={onSelectEvent} />
            ))}
            {hasMore && (
              <div className="flex justify-center py-4">
                <button
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-sm text-slate-600 hover:text-indigo-700 rounded-xl transition disabled:opacity-60 shadow-sm"
                >
                  {isLoadingMore ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />}
                  {isLoadingMore ? "Loading…" : `Load More (${total - displayedEvents.length} remaining)`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Right Panel: Customer Snapshot ──────────────────────────────────────────

function HealthDot({ status }: { status?: string }) {
  const s = status?.toLowerCase() ?? "";
  const color = s === "online" || s === "connected" || s === "secure" || s === "issued"
    ? "bg-emerald-500"
    : s === "offline" || s === "disconnected" || s === "error"
    ? "bg-rose-500"
    : s === "no_recent_activity" || s === "not_configured"
    ? "bg-slate-300"
    : "bg-amber-400";
  return <span className={clsx("w-2 h-2 rounded-full flex-shrink-0", color)} />;
}

function RightPanel({ accountId, overview }: { accountId: number; overview: AccountOverview }) {
  const { store, owner, subscription, health, stats } = overview;
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [noteContent, setNoteContent] = useState("");

  const { data: tags = [] } = useQuery({
    queryKey: ["support-tags", accountId],
    queryFn: () => api.accounts.tags(accountId),
    staleTime: 30_000,
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["support-notes", accountId],
    queryFn: () => api.accounts.notes(accountId),
    staleTime: 30_000,
  });

  const addNote = useMutation({
    mutationFn: (c: string) => api.accounts.addNote(accountId, c),
    onSuccess: () => { setNoteContent(""); setAdding(false); qc.invalidateQueries({ queryKey: ["support-notes", accountId] }); },
  });

  const healthItems = [
    { label: "Booking System",  key: "booking" },
    { label: "AI Receptionist", key: "ai" },
    { label: "SMS",             key: "sms" },
    { label: "Email",           key: "email" },
    { label: "Website",         key: "website" },
    { label: "Google Cal",      key: "google" },
    { label: "Domain",          key: "domain" },
  ] as const;

  return (
    <div className="w-64 flex-shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-y-auto scrollbar-thin">
      {/* Account Info */}
      <div className="p-4 border-b border-slate-100">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Account Info</p>
        <div className="space-y-1.5">
          {[
            { label: "Business",  value: store.name },
            { label: "Owner",     value: [owner.firstName, owner.lastName].filter(Boolean).join(" ") || "—" },
            { label: "Email",     value: owner.email ?? "—" },
            { label: "Phone",     value: store.phone ?? "—" },
            { label: "Industry",  value: store.category ?? "—" },
            { label: "Timezone",  value: store.timezone ?? "—" },
          ].map(r => (
            <div key={r.label} className="flex items-start gap-2">
              <span className="text-[10px] text-slate-400 w-16 flex-shrink-0 pt-0.5">{r.label}</span>
              <span className="text-[11px] text-slate-700 font-medium flex-1 truncate">{r.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Health Status */}
      <div className="p-4 border-b border-slate-100">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Health Status</p>
        <div className="space-y-1.5">
          {healthItems.map(item => (
            <div key={item.key} className="flex items-center justify-between">
              <span className="text-[11px] text-slate-600">{item.label}</span>
              <div className="flex items-center gap-1.5">
                <HealthDot status={(health as any)?.[item.key]} />
                <span className="text-[10px] text-slate-500 capitalize">{((health as any)?.[item.key] ?? "unknown").replace(/_/g, " ")}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Internal Notes */}
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Internal Notes</p>
          <button onClick={() => setAdding(a => !a)} className="flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-800 font-medium">
            <Plus size={9} /> Add
          </button>
        </div>
        {adding && (
          <div className="mb-2 space-y-1.5">
            <textarea
              value={noteContent}
              onChange={e => setNoteContent(e.target.value)}
              placeholder="Add a note…"
              rows={3}
              className="w-full text-xs border border-amber-200 rounded-lg p-2 resize-none bg-amber-50 focus:outline-none focus:border-amber-400"
              autoFocus
            />
            <div className="flex gap-1.5 justify-end">
              <button onClick={() => setAdding(false)} className="text-xs text-slate-500 px-2 py-1 rounded hover:bg-slate-50 transition">Cancel</button>
              <button
                onClick={() => noteContent.trim() && addNote.mutate(noteContent)}
                disabled={!noteContent.trim() || addNote.isPending}
                className="text-xs bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-3 py-1 rounded font-medium transition"
              >
                Save
              </button>
            </div>
          </div>
        )}
        <div className="space-y-2 max-h-36 overflow-y-auto scrollbar-thin">
          {(notes as any[]).length === 0 && !adding && <p className="text-[10px] text-slate-400 italic">No notes</p>}
          {(notes as any[]).map((n: any) => (
            <div key={n.id} className="bg-amber-50 rounded-lg p-2">
              <p className="text-[11px] text-slate-700 leading-snug">{n.content}</p>
              <p className="text-[9px] text-slate-400 mt-1">{n.agent_name} · {new Date(n.created_at).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tags */}
      <div className="p-4 border-b border-slate-100">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Tags</p>
        <div className="flex flex-wrap gap-1">
          {(tags as any[]).length === 0 && <p className="text-[10px] text-slate-400 italic">No tags</p>}
          {(tags as any[]).map((t: any) => (
            <span key={t.id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-medium border border-indigo-200">
              {t.tag}
            </span>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="p-4">
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Quick Actions</p>
        <div className="space-y-1">
          {[
            { label: "Login as Customer", icon: <LogIn size={11} />, color: "bg-indigo-600 hover:bg-indigo-700 text-white" },
            { label: "Send Magic Link",   icon: <Zap size={11} />,   color: "border border-slate-200 hover:bg-slate-50 text-slate-700" },
          ].map(a => (
            <button key={a.label} className={clsx("w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition", a.color)}>
              {a.icon} {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Account Summary Bar ──────────────────────────────────────────────────────

function AccountSummaryBar({ overview }: { overview: AccountOverview }) {
  const { store, owner, subscription } = overview;
  const mrr = subscription?.priceCents ? `$${(subscription.priceCents / 100).toFixed(0)}/mo` : "$0/mo";
  const signupDate = owner.signupDate ? format(new Date(owner.signupDate), "MMM d, yyyy") : "—";
  const lastLogin = "—";
  const accountId = store.account_id ?? `ACC-${String(store.id).padStart(5, "0")}`;

  const pills = [
    { label: "Plan",       value: subscription?.planName ?? "Free" },
    { label: "MRR",        value: mrr },
    { label: "Status",     value: store.accountStatus ?? "Active", highlight: true },
    { label: "Signed Up",  value: signupDate },
    { label: "Last Login", value: lastLogin },
    { label: "Risk",       value: "Low",       cls: "text-emerald-600 font-semibold" },
    { label: "Tier",       value: "Standard" },
  ];

  return (
    <div className="bg-slate-50 border-b border-slate-200 px-6 py-2 flex items-center gap-6 overflow-x-auto scrollbar-thin">
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-[10px] font-mono bg-slate-200 text-slate-600 px-2 py-0.5 rounded">{accountId}</span>
      </div>
      <div className="h-4 w-px bg-slate-300 flex-shrink-0" />
      {pills.map(p => (
        <div key={p.label} className="flex flex-col flex-shrink-0">
          <span className={clsx("text-xs font-semibold leading-none", p.cls ?? "text-slate-800")}>{p.value}</span>
          <span className="text-[9px] text-slate-400 uppercase tracking-wide mt-0.5">{p.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccountActivityPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const accountId = parseInt(id ?? "0");

  const [filters, setFilters] = useState<FullActivityFilters>(DEFAULT_FILTERS);
  const [selectedEvent, setSelectedEvent] = useState<ActivityEvent | null>(null);

  const { data: overview, isLoading, error } = useQuery<AccountOverview>({
    queryKey: ["support-account-overview", accountId],
    queryFn: () => api.accounts.overview(accountId),
    enabled: !!accountId,
    staleTime: 60_000,
  });

  const handleFiltersChange = useCallback((f: FullActivityFilters) => setFilters(f), []);

  if (isLoading) return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-3">
        <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Loading account…</p>
      </div>
    </div>
  );

  if (error || !overview) return (
    <div className="p-6 text-center">
      <p className="text-slate-500">Account not found.</p>
      <button onClick={() => navigate("/accounts")} className="mt-3 text-indigo-600 hover:underline text-sm">
        Back to Search
      </button>
    </div>
  );

  const { store, owner } = overview;
  const initials = [owner.firstName?.[0], owner.lastName?.[0]].filter(Boolean).join("").toUpperCase() || store.name[0].toUpperCase();
  const accountId_display = (store as any).account_id ?? `ACC-${String(store.id).padStart(5, "0")}`;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Page Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/accounts/${accountId}`)}
              className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-xs transition"
            >
              <ArrowLeft size={13} />
              <span>Back to Account</span>
            </button>
            <span className="text-slate-300">/</span>

            {/* Avatar */}
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
              {initials}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">{store.name}</span>
                <StatusBadge status={store.accountStatus ?? "Unknown"} size="sm" />
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Account ID: {accountId_display} · Activity Timeline</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to={`/accounts/${accountId}`}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-medium transition"
            >
              <ExternalLink size={11} /> Customer 360
            </Link>
          </div>
        </div>
      </div>

      {/* Summary Bar */}
      <AccountSummaryBar overview={overview} />

      {/* 3-Column Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Filters */}
        <ActivityFilterPanelFull filters={filters} onChange={handleFiltersChange} />

        {/* Center: Timeline */}
        <ActivityFeed
          accountId={accountId}
          filters={filters}
          onSelectEvent={setSelectedEvent}
        />

        {/* Right: Snapshot */}
        <RightPanel accountId={accountId} overview={overview} />
      </div>

      {/* Event Detail Drawer */}
      {selectedEvent && (
        <EventDetailDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  );
}
