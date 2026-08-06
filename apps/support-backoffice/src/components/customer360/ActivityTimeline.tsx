import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar, MessageSquare, Phone, DollarSign, Shield,
  Activity, Download, ChevronDown, RefreshCw, Clock, AlertTriangle,
} from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { clsx } from "clsx";
import type { AccountOverview, ActivityEvent, ErrorCodeEntry } from "@/lib/api";
import { api } from "@/lib/api";
import ActivityFilterPanel, { type ActivityFilters } from "./ActivityFilterPanel";
import ActivitySnapshotPanel from "./ActivitySnapshotPanel";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ActivityResponse {
  events: ActivityEvent[];
  hasMore: boolean;
  total: number;
  offset: number;
  limit: number;
}

interface Props {
  accountId: number;
  overview: AccountOverview;
}

// ─── Event Category Config ─────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, {
  icon: React.ReactNode;
  iconBg: string;
  badgeBg: string;
  badgeText: string;
  label: string;
}> = {
  appointment: {
    icon: <Calendar size={13} />,
    iconBg: "bg-indigo-100 text-indigo-600",
    badgeBg: "bg-indigo-100",
    badgeText: "text-indigo-700",
    label: "Appointment",
  },
  sms: {
    icon: <MessageSquare size={13} />,
    iconBg: "bg-violet-100 text-violet-600",
    badgeBg: "bg-violet-100",
    badgeText: "text-violet-700",
    label: "SMS",
  },
  ai_receptionist: {
    icon: <Phone size={13} />,
    iconBg: "bg-sky-100 text-sky-600",
    badgeBg: "bg-sky-100",
    badgeText: "text-sky-700",
    label: "AI Receptionist",
  },
  billing: {
    icon: <DollarSign size={13} />,
    iconBg: "bg-emerald-100 text-emerald-600",
    badgeBg: "bg-emerald-100",
    badgeText: "text-emerald-700",
    label: "Billing",
  },
  support: {
    icon: <Shield size={13} />,
    iconBg: "bg-amber-100 text-amber-600",
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-700",
    label: "Support",
  },
  authentication: {
    icon: <Shield size={13} />,
    iconBg: "bg-orange-100 text-orange-600",
    badgeBg: "bg-orange-100",
    badgeText: "text-orange-700",
    label: "Authentication",
  },
  website: {
    icon: <Activity size={13} />,
    iconBg: "bg-teal-100 text-teal-600",
    badgeBg: "bg-teal-100",
    badgeText: "text-teal-700",
    label: "Website",
  },
  api_error: {
    icon: <AlertTriangle size={13} />,
    iconBg: "bg-red-100 text-red-600",
    badgeBg: "bg-red-100",
    badgeText: "text-red-700",
    label: "API Error",
  },
};

function getCategoryConfig(category: string) {
  return CATEGORY_CONFIG[category] ?? {
    icon: <Activity size={13} />,
    iconBg: "bg-slate-100 text-slate-500",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-600",
    label: category.replace(/_/g, " "),
  };
}

// ─── Error Code Hook ──────────────────────────────────────────────────────────
// staleTime: Infinity — the lookup is static; TanStack Query deduplicates the
// request across all EventRow instances so only one network call is made.

function useErrorCodes() {
  return useQuery<Record<string, ErrorCodeEntry>>({
    queryKey: ["support-error-codes"],
    queryFn: () => api.errorCodes.list(),
    staleTime: Infinity,
  });
}

// ─── Date Group Label ─────────────────────────────────────────────────────────

function groupLabel(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d))     return `Today – ${format(d, "MMM d, yyyy")}`;
  if (isYesterday(d)) return `Yesterday – ${format(d, "MMM d, yyyy")}`;
  return format(d, "MMM d, yyyy");
}

function eventDateKey(occurredAt: string): string {
  const d = new Date(occurredAt);
  return format(d, "yyyy-MM-dd");
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

// ─── Single Event Row ─────────────────────────────────────────────────────────

function EventRow({ event }: { event: ActivityEvent }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = getCategoryConfig(event.category);
  const time = format(new Date(event.occurred_at), "h:mm aa");

  // Error code — only present on api_error events that were classified
  const errorNumeric = event.metadata?.errorNumeric as string | undefined;
  const hasErrorCode = event.category === "api_error" && !!errorNumeric;

  // Deduplicated by TanStack Query — single network call even with many rows
  const { data: errorCodes } = useErrorCodes();
  const errorEntry = hasErrorCode && errorCodes ? errorCodes[errorNumeric!] : null;

  return (
    <div className="border-b border-slate-50 last:border-0">
      {/* Main row */}
      <div className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 transition group">
        {/* Time */}
        <div className="w-16 flex-shrink-0 text-right pt-0.5">
          <span className="text-[11px] text-slate-400 font-medium">{time}</span>
        </div>

        {/* Icon */}
        <div className={clsx("w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0", cfg.iconBg)}>
          {cfg.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 leading-tight">{event.title}</p>
          {event.subtitle && (
            <p className="text-xs text-slate-500 mt-0.5 leading-snug">{event.subtitle}</p>
          )}
        </div>

        {/* Error Code Badge — only on classified api_error events */}
        {hasErrorCode && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex-shrink-0 flex items-center gap-1 font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-red-600 text-white hover:bg-red-700 transition mt-0.5"
            title="Click to view error details and resolution steps"
          >
            ERRORCODE={errorNumeric}
            <ChevronDown size={10} className={clsx("transition-transform duration-150", expanded && "rotate-180")} />
          </button>
        )}

        {/* Category Badge */}
        <span className={clsx("flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full mt-0.5", cfg.badgeBg, cfg.badgeText)}>
          {cfg.label}
        </span>
      </div>

      {/* Error Code Expansion Panel */}
      {expanded && hasErrorCode && (
        <div className="ml-[88px] mr-4 mb-3 rounded-lg border border-red-200 bg-red-50 overflow-hidden">
          {errorEntry ? (
            <div className="p-3 space-y-2.5">
              {/* Header */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[11px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded">
                  ERRORCODE={errorEntry.numeric}
                </span>
                <span className="text-sm font-semibold text-slate-800">{errorEntry.title}</span>
              </div>

              {/* Description */}
              <p className="text-xs text-slate-600 leading-relaxed">{errorEntry.description}</p>

              {/* Common Causes */}
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Common Causes</p>
                <ul className="space-y-0.5">
                  {errorEntry.causes.map((cause, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                      <span className="text-red-400 mt-px flex-shrink-0">•</span>
                      {cause}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Resolution Steps */}
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Resolution Steps</p>
                <ul className="space-y-0.5">
                  {errorEntry.resolution.map((step, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                      <span className="text-emerald-500 mt-px flex-shrink-0">→</span>
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="p-3 text-xs text-slate-400">Loading error details…</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Date Group ───────────────────────────────────────────────────────────────

function DateGroup({ label, events }: { label: string; events: ActivityEvent[] }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-3 px-5 py-2">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{label}</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mx-2">
        {events.map(ev => <EventRow key={ev.id ?? `${ev.occurred_at}-${ev.title}`} event={ev} />)}
      </div>
    </div>
  );
}

// ─── Activity Feed ─────────────────────────────────────────────────────────────

const LIMIT = 50;

function ActivityFeed({ accountId, filters }: { accountId: number; filters: ActivityFilters }) {
  const qc = useQueryClient();
  const [allEvents, setAllEvents] = useState<ActivityEvent[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const queryKey = ["support-activity-v2", accountId, filters.range, filters.category, filters.customFrom, filters.customTo];

  const { data, isLoading, isError } = useQuery<ActivityResponse>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({
        range: filters.range,
        category: filters.category,
        limit: String(LIMIT),
        offset: "0",
        ...(filters.customFrom ? { from: filters.customFrom } : {}),
        ...(filters.customTo   ? { to:   filters.customTo   } : {}),
      });
      const res = await fetch(`/api/support/accounts/${accountId}/activity?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch activity");
      return res.json();
    },
    staleTime: 30_000,
  });

  // Sync base page into allEvents when query key changes (filter/range changed)
  useEffect(() => {
    if (data?.events) setAllEvents(data.events);
  }, [data]);

  // Reset accumulated events immediately when filters change
  useEffect(() => {
    setAllEvents([]);
  }, [filters.range, filters.category, filters.customFrom, filters.customTo]);

  const displayedEvents = allEvents.length > 0 ? allEvents : (data?.events ?? []);
  const hasMore = data?.hasMore && displayedEvents.length < (data?.total ?? 0);

  const loadMore = async () => {
    const nextOffset = displayedEvents.length;
    setIsLoadingMore(true);
    try {
      const params = new URLSearchParams({
        range: filters.range,
        category: filters.category,
        limit: String(LIMIT),
        offset: String(nextOffset),
        ...(filters.customFrom ? { from: filters.customFrom } : {}),
        ...(filters.customTo   ? { to:   filters.customTo   } : {}),
      });
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
    qc.invalidateQueries({ queryKey });
  };

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Loading activity…</p>
      </div>
    </div>
  );

  if (isError) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <p className="text-slate-500 text-sm">Failed to load activity</p>
        <button onClick={handleRefresh} className="mt-2 text-indigo-600 hover:underline text-sm">Retry</button>
      </div>
    </div>
  );

  const groups = groupEvents(displayedEvents);
  const total = data?.total ?? 0;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Feed Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-800">Activity Feed</h2>
          {total > 0 && (
            <span className="text-[10px] bg-slate-100 text-slate-600 rounded-full px-2 py-0.5 font-medium">
              {total.toLocaleString()} events
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition" title="Refresh">
            <RefreshCw size={13} />
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50 transition">
            <Download size={12} />
            Export
          </button>
        </div>
      </div>

      {/* Events */}
      <div className="flex-1 overflow-y-auto scrollbar-thin bg-slate-50 py-2">
        {displayedEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-20">
            <Clock size={36} className="text-slate-200 mb-3" />
            <p className="text-slate-500 font-medium text-sm">No activity found</p>
            <p className="text-slate-400 text-xs mt-1">Try adjusting the date range or filters</p>
          </div>
        ) : (
          <>
            {groups.map(g => <DateGroup key={g.key} label={g.label} events={g.events} />)}
            {hasMore && (
              <div className="flex justify-center py-4">
                <button
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-sm text-slate-600 hover:text-indigo-700 rounded-xl transition disabled:opacity-60"
                >
                  {isLoadingMore ? (
                    <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                  {isLoadingMore ? "Loading…" : "Load More Activities"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ActivityTimeline({ accountId, overview }: Props) {
  const [filters, setFilters] = useState<ActivityFilters>({
    range: "7d",
    category: "all",
    customFrom: "",
    customTo: "",
  });

  const handleFiltersChange = useCallback((f: ActivityFilters) => {
    setFilters(f);
  }, []);

  const handleQuickAction = (action: string) => {
    if (action === "ai_calls")     setFilters(f => ({ ...f, category: "ai_receptionist" }));
    if (action === "appointments") setFilters(f => ({ ...f, category: "appointment" }));
    if (action === "invoices")     setFilters(f => ({ ...f, category: "billing" }));
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Filters */}
      <ActivityFilterPanel
        filters={filters}
        onChange={handleFiltersChange}
        accountId={accountId}
        onQuickAction={handleQuickAction}
      />

      {/* Center: Feed */}
      <ActivityFeed accountId={accountId} filters={filters} />

      {/* Right: Snapshot */}
      <ActivitySnapshotPanel
        accountId={accountId}
        store={overview.store}
        owner={overview.owner}
        subscription={overview.subscription}
        staffCount={overview.stats.staffCount}
      />
    </div>
  );
}
