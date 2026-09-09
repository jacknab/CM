import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users, UserCheck, UserPlus, RefreshCw, Search, Eye, X, Globe,
  Store as StoreIcon, MonitorSmartphone, Tv, Monitor,
} from "lucide-react";

/**
 * isTeam → Live Visitors. Three tabs over one live feed
 * (GET /api/support/live-chat/visitors, polled every 10s):
 *   • Website Visitors   — anonymous visitors on the certxa marketing site
 *                          (PHP pages); New vs. Returning.
 *   • Booking App Users  — users signed in to the booking app; shows storeId.
 *   • Kiosk & Front Desk — self-check-in kiosk + front-desk display screens,
 *                          identified by store booking slug.
 */

const REFRESH_MS = 10_000;
type Tab = "web" | "booking" | "devices";
type App = "web" | "booking" | "kiosk" | "frontdesk";

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
  app: App;
  storeId: number | null;
  storeName: string | null;
  userId: string | null;
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
function storeLabel(v: Visitor): string {
  if (v.storeId == null) return v.storeName || "—";
  return v.storeName ? `#${v.storeId} · ${v.storeName}` : `#${v.storeId}`;
}
function deviceKindLabel(app: App): string {
  return app === "kiosk" ? "Kiosk" : app === "frontdesk" ? "Front Desk" : "";
}

function DeviceBadge({ app }: { app: App }) {
  const isKiosk = app === "kiosk";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${
      isKiosk ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"
    }`}>
      {isKiosk ? <Tv size={11} /> : <Monitor size={11} />}
      {deviceKindLabel(app)}
    </span>
  );
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
  const isBooking = visitor.app === "booking";
  const isDevice = visitor.app === "kiosk" || visitor.app === "frontdesk";

  const rows: [string, React.ReactNode][] = [
    ["IP address", <span className="font-mono text-slate-800">{visitor.ip || "—"}</span>],
    ["Location", locationLabel(visitor)],
    ["Country", <span>{flagEmoji(visitor.country)} {visitor.country || "—"}{visitor.countryName ? ` · ${visitor.countryName}` : ""}</span>],
    ...(isDevice
      ? ([
          ["Device", <DeviceBadge app={visitor.app} />],
          ["Store", <span className="font-mono text-slate-800">{storeLabel(visitor)}</span>],
        ] as [string, React.ReactNode][])
      : isBooking
        ? ([
            ["Store", <span className="font-mono text-slate-800">{storeLabel(visitor)}</span>],
            ["User ID", <span className="font-mono text-[11px] text-slate-400 break-all">{visitor.userId || "—"}</span>],
          ] as [string, React.ReactNode][])
        : ([
            ["Visitor type", visitor.isReturning
              ? <span className="inline-flex px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">Returning</span>
              : <span className="inline-flex px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">New</span>],
          ] as [string, React.ReactNode][])),
    ["Current page", <span className="font-mono text-slate-800">{pagePath(visitor.url)}</span>],
    ["Page title", visitor.title || "—"],
    [isDevice ? "Screens seen" : "Pages viewed", String(visitor.pages)],
    [isDevice ? "Uptime" : "Time on site", fmtOnSite(onSite)],
    ["First seen", fmtClock(visitor.firstSeen)],
    ["Last seen", fmtClock(visitor.lastSeen)],
    ...(isDevice ? [] : ([
      ["Referrer", visitor.referrer
        ? <span className="break-all text-slate-700">{visitor.referrer}</span>
        : <span className="text-slate-400">Direct / none</span>],
      ["In live chat", visitor.chatId
        ? <span className="text-emerald-600">Yes{visitor.name ? ` — ${visitor.name}` : ""}</span>
        : "No"],
    ] as [string, React.ReactNode][])),
    ["Presence ID", <span className="font-mono text-[11px] text-slate-400 break-all">{visitor.visitorId}</span>],
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full shadow-xl border-l border-slate-200 overflow-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-sm font-semibold text-slate-900">
              {isDevice ? "Device detail" : isBooking ? "Signed-in user detail" : "Visitor detail"}
            </h2>
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
  const [tab, setTab] = useState<Tab>("web");
  const [now, setNow] = useState(() => Date.now());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
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

  // Reset filter/search/selection when switching tabs.
  useEffect(() => { setFilter("all"); setSearch(""); setSelected(null); }, [tab]);

  const { webAll, bookingAll, deviceAll } = useMemo(() => {
    const list = data?.visitors ?? [];
    const web: Visitor[] = [];
    const booking: Visitor[] = [];
    const device: Visitor[] = [];
    for (const v of list) {
      if (v.app === "kiosk" || v.app === "frontdesk") { device.push(v); continue; }
      const p = pagePath(v.url).toLowerCase();
      if (p.startsWith("/isteam") || p.startsWith("/api")) continue; // never surface back-office
      (v.app === "booking" ? booking : web).push(v);
    }
    return { webAll: web, bookingAll: booking, deviceAll: device };
  }, [data]);

  const isBooking = tab === "booking";
  const isDevices = tab === "devices";
  const all = isDevices ? deviceAll : isBooking ? bookingAll : webAll;

  const stores = useMemo(() => {
    const m = new Map<number, string>();
    for (const v of bookingAll) if (v.storeId != null) m.set(v.storeId, v.storeName || `Store #${v.storeId}`);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [bookingAll]);

  const visitors = useMemo(() => {
    let list = all;
    if (tab === "web") {
      if (filter === "new") list = list.filter((v) => !v.isReturning);
      if (filter === "returning") list = list.filter((v) => v.isReturning);
    } else if (tab === "booking") {
      if (filter !== "all") list = list.filter((v) => String(v.storeId) === filter);
    } else {
      if (filter === "kiosk") list = list.filter((v) => v.app === "kiosk");
      if (filter === "frontdesk") list = list.filter((v) => v.app === "frontdesk");
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((v) =>
        v.ip.toLowerCase().includes(q) ||
        (v.city || "").toLowerCase().includes(q) ||
        (v.region || "").toLowerCase().includes(q) ||
        (v.countryName || "").toLowerCase().includes(q) ||
        (v.country || "").toLowerCase().includes(q) ||
        (v.storeName || "").toLowerCase().includes(q) ||
        (v.storeId != null && String(v.storeId).includes(q)) ||
        (v.userId || "").toLowerCase().includes(q) ||
        pagePath(v.url).toLowerCase().includes(q),
      );
    }
    return list;
  }, [all, tab, filter, search]);

  const online = all.length;
  const returning = webAll.filter((v) => v.isReturning).length;
  const fresh = webAll.length - returning;
  const activeStores = new Set(bookingAll.map((v) => v.storeId).filter((x) => x != null)).size;
  const kiosks = deviceAll.filter((v) => v.app === "kiosk").length;
  const frontdesks = deviceAll.filter((v) => v.app === "frontdesk").length;
  const selectedVisitor = selected ? all.find((v) => v.visitorId === selected) ?? null : null;

  const col5Header = isDevices ? "Device / Store" : isBooking ? "Store" : "Returning Visitor";
  const col7Header = isDevices ? "Uptime" : "Time on Site";
  const title = isDevices
    ? "Kiosk & Front Desk — Live Devices"
    : isBooking
      ? "Booking App — Signed-In Users"
      : "Real-Time Website Visitors";

  return (
    <div className="flex-1 overflow-auto bg-slate-50">
      {/* Dark header bar */}
      <div className="bg-[#0f1729] text-white">
        <div className="max-w-[1400px] mx-auto px-6 pt-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">{title}</h1>
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
        {/* Tabs */}
        <div className="max-w-[1400px] mx-auto px-6 flex gap-1">
          {([
            ["web", "Website Visitors", <Globe size={14} key="g" />, webAll.length],
            ["booking", "Booking App Users", <MonitorSmartphone size={14} key="m" />, bookingAll.length],
            ["devices", "Kiosk & Front Desk", <Tv size={14} key="t" />, deviceAll.length],
          ] as [Tab, string, React.ReactNode, number][]).map(([id, label, icon, count]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium border-b-2 transition ${
                tab === id
                  ? "border-emerald-400 text-white"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              {icon}
              {label}
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                tab === id ? "bg-white/15 text-white" : "bg-white/5 text-slate-400"
              }`}>{count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto p-6 space-y-5">
        {/* Stat cards */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${isBooking ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
          {isDevices ? (
            <>
              <StatCard icon={<Tv size={20} />} tint="bg-indigo-50 text-indigo-600" value={online} label="Devices Online" />
              <StatCard icon={<Tv size={20} />} tint="bg-amber-50 text-amber-600" value={kiosks} label="Kiosks" />
              <StatCard icon={<Monitor size={20} />} tint="bg-sky-50 text-sky-600" value={frontdesks} label="Front Desks" />
              <StatCard
                icon={<RefreshCw size={20} className="animate-spin [animation-duration:3s]" />}
                tint="bg-slate-100 text-slate-500"
                value={<span className="text-base font-medium text-slate-700">Live Updates</span>}
                label="Refreshing every 10 seconds"
                sub={`Updated ${dataUpdatedAt ? fmtClock(dataUpdatedAt) : "—"}`}
              />
            </>
          ) : isBooking ? (
            <>
              <StatCard icon={<Users size={20} />} tint="bg-indigo-50 text-indigo-600" value={online} label="Users Online" />
              <StatCard icon={<StoreIcon size={20} />} tint="bg-violet-50 text-violet-600" value={activeStores} label="Active Stores" />
              <StatCard
                icon={<RefreshCw size={20} className="animate-spin [animation-duration:3s]" />}
                tint="bg-slate-100 text-slate-500"
                value={<span className="text-base font-medium text-slate-700">Live Updates</span>}
                label="Refreshing every 10 seconds"
                sub={`Updated ${dataUpdatedAt ? fmtClock(dataUpdatedAt) : "—"}`}
              />
            </>
          ) : (
            <>
              <StatCard icon={<Users size={20} />} tint="bg-indigo-50 text-indigo-600" value={online} label="Currently Online" />
              <StatCard icon={<UserCheck size={20} />} tint="bg-blue-50 text-blue-600" value={returning} label="Returning Visitors" />
              <StatCard icon={<UserPlus size={20} />} tint="bg-emerald-50 text-emerald-600" value={fresh} label="New Visitors" />
              <StatCard
                icon={<RefreshCw size={20} className="animate-spin [animation-duration:3s]" />}
                tint="bg-slate-100 text-slate-500"
                value={<span className="text-base font-medium text-slate-700">Live Updates</span>}
                label="Refreshing every 10 seconds"
                sub={`Updated ${dataUpdatedAt ? fmtClock(dataUpdatedAt) : "—"}`}
              />
            </>
          )}
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-700">
              {isDevices ? "Live Kiosk & Front-Desk Screens" : isBooking ? "Signed-In Booking App Users" : "Live Website Visitors"}
            </h2>
            <div className="flex items-center gap-2">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              >
                {isDevices ? (
                  <>
                    <option value="all">All Devices</option>
                    <option value="kiosk">Kiosk</option>
                    <option value="frontdesk">Front Desk</option>
                  </>
                ) : isBooking ? (
                  <>
                    <option value="all">All Stores</option>
                    {stores.map(([id, name]) => (
                      <option key={id} value={String(id)}>#{id} · {name}</option>
                    ))}
                  </>
                ) : (
                  <>
                    <option value="all">All Visitors</option>
                    <option value="new">New</option>
                    <option value="returning">Returning</option>
                  </>
                )}
              </select>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    isDevices ? "Search IP, city, store, or slug..."
                    : isBooking ? "Search IP, city, store, or user..."
                    : "Search IP, city, or country..."
                  }
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
                <div>{col5Header}</div>
                <div>Last Seen</div>
                <div>{col7Header}</div>
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
                    ? isDevices
                      ? "No kiosk or front-desk screens are online right now."
                      : isBooking
                        ? "No users signed into the booking app right now."
                        : "No visitors on the site right now."
                    : "No rows match this filter."}
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
                      <div className="truncate pr-2">
                        {isDevices ? (
                          <span className="inline-flex items-center gap-1.5 min-w-0">
                            <DeviceBadge app={v.app} />
                            <span className="text-slate-600 truncate">{storeLabel(v)}</span>
                          </span>
                        ) : isBooking ? (
                          v.storeId != null ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">#{v.storeId}</span>
                              <span className="text-slate-600 truncate">{v.storeName || ""}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )
                        ) : v.isReturning ? (
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
              Showing {visitors.length} of {all.length}
              {isDevices ? " device" : isBooking ? " signed-in user" : " live visitor"}{all.length === 1 ? "" : "s"}
            </div>
          )}
        </div>

        <p className="text-xs text-slate-400 flex items-center gap-1.5">
          <Globe size={12} />
          {isDevices
            ? "Kiosk and front-desk screens currently loaded, matched to a store by its booking slug. A screen drops off ~60 seconds after its last heartbeat."
            : isBooking
              ? "Users currently signed in to the booking app. A user drops off the list ~60 seconds after their last activity."
              : "Only shows anonymous visitors currently browsing the certxa marketing site. A visitor drops off the list ~60 seconds after their last page view."}
        </p>
      </div>

      {selectedVisitor && (
        <VisitorDrawer visitor={selectedVisitor} now={now} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
