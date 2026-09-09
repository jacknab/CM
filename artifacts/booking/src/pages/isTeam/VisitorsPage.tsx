import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users, UserCheck, UserPlus, RefreshCw, Search, Eye, X, Globe,
} from "lucide-react";

/**
 * Real-Time Website Visitors — live view of everyone currently browsing the
 * certxa marketing site (PHP pages). Fed by the visitor-presence beacon in
 * php/assets/js/livechat-widget.js → GET /api/support/live-chat/visitors.
 * Polls every 10 seconds.
 */

const REFRESH_MS = 10_000;

interface Visitor {
  visitorId: string;
  url: string;
  title: string;
  referrer: string;
  ip: string;
  country: string | null;       // ISO alpha-2
  countryName: string | null;
  city: string | null;
  region: string | null;
  pages: number;
  isReturning: boolean;
  name: string | null;
  chatId: string | null;
  firstSeen: number;
  lastSeen: number;
  onSiteSec: number;
}

async function api<T = any>(path: string): Promise<T> {
  const r = await fetch(path, { credentials: "include" });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `${r.status}`); }
  return r.json();
}

function flagEmoji(cc: string | null): string {
  if (!cc || cc.length !== 2 || !/^[A-Za-z]{2}$/.test(cc)) return "🌐";
  const base = 0x1f1e6;
  return String.fromCodePoint(
    ...[...cc.toUpperCase()].map((c) => base + c.charCodeAt(0) - 65),
  );
}

function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", second: "2-digit",
  });
}
function fmtHeaderStamp(ts: number): string {
  return (
    new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " " + fmtClock(ts)
  );
}
function fmtOnSite(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
function locationLabel(v: Visitor): string {
  const parts = [v.city, v.region].filter(Boolean);
  if (parts.length) return parts.join(", ");
  return v.countryName || "—";
}
function pagePath(url: string): string {
  if (!url) return "—";
  try {
    return new URL(url, "https://certxa.com").pathname || "/";
  } catch {
    return url.startsWith("/") ? url : `/${url}`;
  }
}

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({
  icon, tint, value, label, sub,
}: {
  icon: React.ReactNode; tint: string; value: React.ReactNode; label: string; sub?: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 flex items-center gap-3.5">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${tint}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-semibold text-slate-900 leading-tight">{value}</div>
        <div className="text-xs text-slate-500 truncate">{label}</div>
        {sub && <div className="text-[11px] text-slate-400 truncate">{sub}</div>}
      </div>
    </div>
  );
}

// ── Detail drawer ────────────────────────────────────────────────────────────
function VisitorDrawer({ visitor, now, onClose }: { visitor: Visitor; now: number; onClose: () => void }) {
  const onSite = Math.max(visitor.onSiteSec, Math.round((now - visitor.firstSeen) / 1000));
  const rows: [string, React.ReactNode][] = [
    ["IP address", <span className="font-mono text-slate-800">{visitor.ip || "—"}</span>],
    ["Location", locationLabel(visitor)],
    ["Country", <span>{flagEmoji(visitor.country)} {visitor.country || "—"}{visitor.countryName ? ` · ${visitor.countryName}` : ""}</span>],
    ["Visitor type", visitor.isReturning
      ? <span className="inline-flex px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">Returning</span>
      : <span className="inline-flex px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">New</span>],
    ["Current page", <span className="font-mono text-slate-800">{pagePath(visitor.url)}</span>],
    ["Page title", visitor.title || "—"],
    ["Pages viewed", String(visitor.pages)],
    ["Time on site", fmtOnSite(onSite)],
    ["First seen", fmtClock(visitor.firstSeen)],
    ["Last seen", fmtClock(visitor.lastSeen)],
    ["Referrer", visitor.referrer
      ? <span className="break-all text-slate-700">{visitor.referrer}</span>
      : <span className="text-slate-400">Direct / none</span>],
    ["In live chat", visitor.chatId
      ? <span className="text-emerald-600">Yes{visitor.name ? ` — ${visitor.name}` : ""}</span>
      : "No"],
    ["Visitor ID", <span className="font-mono text-[11px] text-slate-400 break-all">{visitor.visitorId}</span>],
  ];
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-xl border-l border-slate-200 overflow-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-sm font-semibold text-slate-900">Visitor detail</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition">
            <X size={16} />
          </button>
        </div>
        <dl className="px-5 py-4 space-y-3">
          {rows.map(([k, val]) => (
            <div key={k} className="grid grid-cols-[120px_1fr] gap-3 text-sm">
              <dt className="text-slate-500">{k}</dt>
              <dd className="text-slate-700 min-w-0">{val}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function VisitorsPage() {
  const [now, setNow] = useState(() => Date.now());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "new" | "returning">("all");
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading, isFetching, dataUpdatedAt, refetch } = useQuery<{ visitors: Visitor[] }>({
    queryKey: ["rt-visitors"],
    queryFn: () => api("/api/support/live-chat/visitors"),
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
  });

  // Local 1s tick so "time on site" / header clock stay live between fetches.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const all = useMemo(() => {
    const list = data?.visitors ?? [];
    // Marketing-site (PHP) visitors only — never surface back-office sessions.
    return list.filter((v) => {
      const p = pagePath(v.url).toLowerCase();
      return !p.startsWith("/isteam") && !p.startsWith("/api");
    });
  }, [data]);

  const visitors = useMemo(() => {
    let list = all;
    if (filter === "new") list = list.filter((v) => !v.isReturning);
    if (filter === "returning") list = list.filter((v) => v.isReturning);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((v) =>
        v.ip.toLowerCase().includes(q) ||
        (v.city || "").toLowerCase().includes(q) ||
        (v.region || "").toLowerCase().includes(q) ||
        (v.countryName || "").toLowerCase().includes(q) ||
        (v.country || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [all, filter, search]);

  const online = all.length;
  const returning = all.filter((v) => v.isReturning).length;
  const fresh = online - returning;
  const selectedVisitor = selected ? all.find((v) => v.visitorId === selected) ?? null : null;

  return (
    <div className="flex-1 overflow-auto bg-slate-50">
      {/* Dark header bar */}
      <div className="bg-[#0f1729] text-white">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">Real-Time Website Visitors</h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-300">
            <span className="tabular-nums">{fmtHeaderStamp(now)}</span>
            <button
              onClick={() => refetch()}
              className="p-1.5 rounded-lg hover:bg-white/10 transition text-slate-300 hover:text-white"
              title="Refresh now"
            >
              <RefreshCw size={15} className={isFetching ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto p-6 space-y-5">
        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<Users size={20} />} tint="bg-indigo-50 text-indigo-600"
            value={online} label="Currently Online"
          />
          <StatCard
            icon={<UserCheck size={20} />} tint="bg-blue-50 text-blue-600"
            value={returning} label="Returning Visitors"
          />
          <StatCard
            icon={<UserPlus size={20} />} tint="bg-emerald-50 text-emerald-600"
            value={fresh} label="New Visitors"
          />
          <StatCard
            icon={<RefreshCw size={20} className="animate-spin [animation-duration:3s]" />}
            tint="bg-slate-100 text-slate-500"
            value={<span className="text-base font-medium text-slate-700">Live Updates</span>}
            label="Refreshing every 10 seconds"
            sub={`Updated ${dataUpdatedAt ? fmtClock(dataUpdatedAt) : "—"}`}
          />
        </div>

        {/* Live visitors table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-700">Live Website Visitors</h2>
            <div className="flex items-center gap-2">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
                className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                <option value="all">All Visitors</option>
                <option value="new">New</option>
                <option value="returning">Returning</option>
              </select>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search IP, city, or country..."
                  className="text-sm border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 w-60 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-[44px_140px_1fr_92px_1fr_104px_104px_1fr_72px] px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 uppercase tracking-wide">
                <div>#</div>
                <div>IP Address</div>
                <div>Location</div>
                <div>Country</div>
                <div>Returning Visitor</div>
                <div>Last Seen</div>
                <div>Time on Site</div>
                <div>Current Page</div>
                <div className="text-right">View</div>
              </div>

              {isLoading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-11 bg-slate-100 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : visitors.length === 0 ? (
                <div className="px-4 py-16 text-center text-sm text-slate-400">
                  {all.length === 0
                    ? "No visitors on the site right now."
                    : "No visitors match this filter."}
                </div>
              ) : (
                visitors.map((v, i) => {
                  const onSite = Math.max(v.onSiteSec, Math.round((now - v.firstSeen) / 1000));
                  return (
                    <div
                      key={v.visitorId}
                      className="grid grid-cols-[44px_140px_1fr_92px_1fr_104px_104px_1fr_72px] px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition text-sm items-center"
                    >
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {i + 1}
                      </div>
                      <div className="font-mono text-slate-700">{v.ip || "—"}</div>
                      <div className="text-slate-600 truncate pr-2">{locationLabel(v)}</div>
                      <div className="text-slate-600">
                        <span className="mr-1">{flagEmoji(v.country)}</span>
                        {v.country || "—"}
                      </div>
                      <div>
                        {v.isReturning ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">Returning</span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">New</span>
                        )}
                      </div>
                      <div className="text-slate-500 tabular-nums">{fmtClock(v.lastSeen)}</div>
                      <div className="text-slate-500 tabular-nums">{fmtOnSite(onSite)}</div>
                      <div className="font-mono text-slate-700 truncate pr-2">{pagePath(v.url)}</div>
                      <div className="text-right">
                        <button
                          onClick={() => setSelected(v.visitorId)}
                          className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 text-xs font-medium"
                        >
                          <Eye size={13} /> View
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {visitors.length > 0 && (
            <div className="px-4 py-2.5 text-xs text-slate-400 border-t border-slate-200">
              Showing {visitors.length} of {all.length} live visitor{all.length === 1 ? "" : "s"}
            </div>
          )}
        </div>

        <p className="text-xs text-slate-400 flex items-center gap-1.5">
          <Globe size={12} />
          Only shows anonymous visitors currently browsing the certxa marketing site. A visitor drops off the list ~60&nbsp;seconds after their last page view.
        </p>
      </div>

      {selectedVisitor && (
        <VisitorDrawer visitor={selectedVisitor} now={now} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
