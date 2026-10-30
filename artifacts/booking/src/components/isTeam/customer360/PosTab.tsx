import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatInTimeZone } from "date-fns-tz";
import { formatDistanceToNowStrict } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { supportApi, type PosOverview } from "@/lib/support-api";

/**
 * Back office POS tab (owner, 2026-10-30): everything support needs when a salon calls about its POS — the stations
 * and the tablet on each, cash drawers and their shifts, customer screens, kiosks, receipt printers, the owner app,
 * the salon's network, and the settings behind most calls. Every time is the SALON's local time, so the agent
 * talks in the client's time. A device is "Online" when it pinged in the last 3 minutes (tablets ping every minute).
 */
const ONLINE_MS = 3 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

type Status = "online" | "recent" | "offline" | "never";
function statusOf(iso: string | null | undefined): Status {
  if (!iso) return "never";
  const age = Date.now() - new Date(iso).getTime();
  return age < ONLINE_MS ? "online" : age < DAY_MS ? "recent" : "offline";
}
const STATUS: Record<Status, { label: string; dot: string; text: string }> = {
  online: { label: "Online", dot: "bg-emerald-500", text: "text-emerald-700" },
  recent: { label: "Seen today", dot: "bg-amber-400", text: "text-amber-700" },
  offline: { label: "Offline", dot: "bg-red-500", text: "text-red-700" },
  never: { label: "Never seen", dot: "bg-slate-300", text: "text-slate-500" },
};

/** "Android 13 · Samsung SM-X200 · Certxa app" from a user agent — enough to tell support what the device is. */
function describeDevice(ua: string | null | undefined): string {
  if (!ua) return "—";
  const parts: string[] = [];
  const android = /Android ([\d.]+)(?:;[^;)]*)*?;\s*([^;)]+?)(?: Build|\))/.exec(ua);
  if (/Android/.test(ua)) {
    parts.push(`Android ${/Android ([\d.]+)/.exec(ua)?.[1] ?? ""}`.trim());
    const model = android?.[2]?.trim();
    if (model && !/^(wv|K|Linux|U)$/.test(model)) parts.push(model);
  } else if (/iPad/.test(ua)) parts.push("iPad");
  else if (/iPhone/.test(ua)) parts.push("iPhone");
  else if (/Windows/.test(ua)) parts.push("Windows");
  else if (/Mac OS X/.test(ua)) parts.push("Mac");
  else if (/Linux/.test(ua)) parts.push("Linux");
  if (/; wv\)|CertxaApp|Certxa/i.test(ua)) parts.push("Certxa app");
  else {
    const chrome = /Chrome\/(\d+)/.exec(ua)?.[1];
    const safari = !chrome && /Version\/(\d+).*Safari/.exec(ua)?.[1];
    if (chrome) parts.push(`Chrome ${chrome}`);
    else if (safari) parts.push(`Safari ${safari}`);
  }
  return parts.join(" · ") || ua.slice(0, 60);
}

export default function PosTab({ accountId }: { accountId: number }) {
  const [showOlder, setShowOlder] = useState(false);
  const { data, isLoading, error } = useQuery<PosOverview>({
    queryKey: ["support-pos", accountId],
    queryFn: () => supportApi.accounts.pos(accountId),
    refetchInterval: 30_000,
  });

  if (isLoading) return <div className="flex items-center justify-center h-64 text-sm text-slate-400">Loading POS details…</div>;
  if (error || !data) return <div className="flex items-center justify-center h-64 text-sm text-red-500">Could not load POS details.</div>;

  const tz = data.timezone || "UTC";
  const at = (iso: string | null | undefined, withDate = true) =>
    iso ? formatInTimeZone(new Date(iso), tz, withDate ? "MMM d, h:mm a zzz" : "h:mm a zzz") : "—";
  const ago = (iso: string | null | undefined) => (iso ? `${formatDistanceToNowStrict(new Date(iso))} ago` : "");
  const s = data.settings;
  const drawerName = new Map(data.drawers.map((d) => [d.id, d.name]));
  const onlineTablets = data.tablets.filter((t) => statusOf(t.lastSeenAt) === "online").length;
  // Every browser that ever opened /nail is a "tablet"; the list shows the ones seen in the last 2 days, older on request.
  const recentTablets = data.tablets.filter((t) => Date.now() - new Date(t.lastSeenAt).getTime() < 2 * DAY_MS);
  const olderCount = data.tablets.length - recentTablets.length;
  const shownTablets = showOlder ? data.tablets : recentTablets;
  const warnings = [
    s.managerPinIsDefault && "Manager PIN is still the default (2026) — anyone who knows it can approve manager actions.",
    !s.posEnabled && "POS is turned off for this salon.",
    data.stations.some((r) => r.active && r.drawerId == null) && "A station has no cash drawer, so it can't take cash.",
    data.tablets.some((t) => t.unsentCashCount > 0) && "A tablet holds cash payments the server hasn't received yet.",
    data.tablets.some((t) => t.attention > 0) && "A tablet has saved changes that need attention.",
    data.drawers.some((d) => d.openShift && Date.now() - new Date(d.openShift.openedAt).getTime() > 2 * DAY_MS) && "A cash drawer shift has been open for more than 2 days (Day Close not run).",
  ].filter(Boolean) as string[];

  return (
    <div className="p-6 space-y-5" data-testid="support-pos-tab">
      <p className="text-xs text-slate-500">
        Times are the salon's local time ({tz}). Devices ping every minute: <b>Online</b> = in the last 3 minutes.
        {" "}{onlineTablets} of {recentTablets.length} POS tablet{recentTablets.length === 1 ? "" : "s"} seen in the last 2 days online now.
      </p>

      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-1.5" data-testid="support-pos-warnings">
          {warnings.map((w) => (
            <p key={w} className="flex items-start gap-2 text-sm text-amber-900"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{w}</p>
          ))}
        </div>
      )}

      <Section title="POS settings">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 p-4">
          <Setting label="POS" value={s.posEnabled ? "On" : "Off"} />
          <Setting label="Card payments" value={s.cardProvider === "own" ? "Own terminal (records only)" : s.cardProvider === "stripe" ? "Certxa / Stripe (M2)" : s.cardProvider ?? "Default"} />
          <Setting label="Sales tax" value={s.salesTaxRate ? `${s.salesTaxRate}%` : "None"}
            sub={s.salesTaxRate ? ["services", "addons", "products", "giftCards"].filter((k) => (s.taxable as any)[k]).map((k) => ({ services: "services", addons: "add-ons", products: "products", giftCards: "gift cards" } as any)[k]).join(", ") || "nothing taxed" : undefined} />
          <Setting label="Cash discount" value={s.cashDiscountPercent ? `${s.cashDiscountPercent}%` : "None"} />
          <Setting label="Lock screen" value={s.lockScreen ? "On (Tech ID to use the POS)" : "Off"} sub={s.lockScreen ? (s.keypadVisible ? "Keypad shown" : "Scanner only") : undefined} />
          <Setting label="Manager PIN" value={s.managerPinIsDefault ? "Default (2026)" : "Changed"} warn={s.managerPinIsDefault} />
          <Setting label="Turn system" value={s.turnSystem === "off" ? "Off" : s.turnSystem === "dollar" ? "Dollar-based" : s.turnSystem === "count" ? "Counted turns" : s.turnSystem === "classic" ? "Classic rotation" : "On"} />
          <Setting label="Time clock" value={s.timeclock ? "On" : "Off"} />
          <Setting label="Key grid" value={s.customKeyGrid ? "Custom" : "Automatic"} />
          <Setting label="Kiosk" value={!s.kioskPermitted ? "Not permitted" : s.kioskEnabled ? "On" : "Off"} sub={s.dualScreenMode ? "Dual-screen mode" : undefined} />
          <Setting label="Kiosk network lock" value={s.restrictKioskNetwork ? "Salon network only" : "Any network"} />
        </div>
      </Section>

      <Section title="Network">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 p-4">
          <Setting label="Salon's internet IP" value={s.trustedNetworkIp ?? "Not set"} sub={s.trustedNetworkAt ? `Set ${at(s.trustedNetworkAt)}` : undefined} />
          <Setting label="Local hub (in-salon)" value={s.localHub?.address ?? "Not running"} sub={s.localHub?.at ? `Reported ${at(s.localHub.at)}` : "POS tablet that links the salon's devices offline"} />
        </div>
      </Section>

      <Section title={`Stations (${data.stations.length})`}>
        <Table head={["Station", "Tablet", "Customer screen", "Cash drawer", "Pairing code"]}
          empty="No stations set up."
          rows={data.stations.map((r) => [
            <span key="n" className="font-medium text-slate-800">{r.name}{r.isDefault && <span className="ml-1.5 text-[10px] text-slate-400">MAIN</span>}{!r.active && <span className="ml-1.5 text-[10px] text-red-500">INACTIVE</span>}</span>,
            r.tablet ? <Dot key="t" status={statusOf(r.tablet.lastSeenAt)} sub={`${at(r.tablet.lastSeenAt)} · ${ago(r.tablet.lastSeenAt)}`} />
              : r.claimedAt ? <span key="t" className="text-xs text-slate-500">Claimed {at(r.claimedAt)}</span> : <span key="t" className="text-xs text-slate-400">No tablet</span>,
            r.screens.length ? <span key="c" className="text-xs text-slate-700">{r.screens.length} paired</span> : <span key="c" className="text-xs text-slate-400">None</span>,
            r.drawerId != null ? <span key="d" className="text-xs text-slate-700">{drawerName.get(r.drawerId) ?? `#${r.drawerId}`}</span> : <span key="d" className="text-xs text-red-600">None — no cash</span>,
            <span key="a" className="font-mono text-xs text-slate-600">{r.activationCode ?? "—"}</span>,
          ])} />
      </Section>

      <Section title={`POS tablets (${recentTablets.length} seen in the last 2 days)`}>
        <Table head={["Status / last ping", "Screen", "Station", "IP address", "Device", "App build", "Unsent"]}
          empty="No POS tablet has reported in the last 2 days."
          rows={shownTablets.map((t) => [
            <Dot key="s" status={statusOf(t.lastSeenAt)} sub={`${at(t.lastSeenAt)} · ${ago(t.lastSeenAt)}`} />,
            <span key="p" className="text-xs text-slate-700">{t.page ?? "—"}</span>,
            <span key="r" className="text-xs text-slate-700">{t.station ?? "—"}</span>,
            <span key="i" className="font-mono text-xs text-slate-700">{t.ip ?? "—"}</span>,
            <span key="u" className="text-xs text-slate-700" title={t.userAgent ?? ""}>{describeDevice(t.userAgent)}</span>,
            <span key="b" className="text-xs text-slate-700">{t.appBuild ?? (t.userAgent ? "Browser" : "—")}</span>,
            <span key="x" className="text-xs">{t.pending || t.attention || t.unsentCashCount
              ? <span className={t.attention || t.unsentCashCount ? "text-red-600 font-medium" : "text-amber-700"}>
                  {[t.pending && `${t.pending} waiting`, t.attention && `${t.attention} need attention`, t.unsentCashCount && `${t.unsentCashCount} cash ($${t.unsentCashAmount.toFixed(2)})`].filter(Boolean).join(" · ")}
                </span>
              : <span className="text-slate-400">Nothing</span>}</span>,
          ])} />
        {olderCount > 0 && (
          <button type="button" onClick={() => setShowOlder((v) => !v)} className="mx-4 mb-2 text-xs font-medium text-indigo-600 hover:underline" data-testid="support-pos-older">
            {showOlder ? "Hide older devices" : `Show ${olderCount} older device${olderCount === 1 ? "" : "s"} (last 30 days)`}
          </button>
        )}
        <p className="px-4 pb-3 text-[11px] text-slate-400">Hover over a device to see its full details. IP address, screen and app build are recorded from Oct 30, 2026 on.</p>
      </Section>

      <Section title={`Cash drawers (${data.drawers.length})`}>
        <Table head={["Drawer", "Stations", "Starting cash", "Current shift", "Last Day Close"]}
          empty="No cash drawers — no station can take cash."
          rows={data.drawers.map((d) => [
            <span key="n" className="font-medium text-slate-800">{d.name}{!d.active && <span className="ml-1.5 text-[10px] text-red-500">INACTIVE</span>}</span>,
            <span key="s" className="text-xs text-slate-700">{d.stations.join(", ") || "None"}</span>,
            <span key="f" className="text-xs text-slate-700">{d.startingCash != null ? `$${d.startingCash.toFixed(2)}` : "—"}</span>,
            d.openShift ? <span key="o" className="text-xs text-slate-700">Open since {at(d.openShift.openedAt)}<span className="block text-slate-400">{ago(d.openShift.openedAt)}</span></span>
              : <span key="o" className="text-xs text-slate-400">No open shift</span>,
            d.lastClose ? <span key="c" className="text-xs text-slate-700">{at(d.lastClose.closedAt)}{d.lastClose.closingBalance != null && <span className="block text-slate-400">Counted ${d.lastClose.closingBalance.toFixed(2)}</span>}</span>
              : <span key="c" className="text-xs text-slate-400">Never</span>,
          ])} />
      </Section>

      <Section title={`Customer screens (${data.customerScreens.length})`}>
        <Table head={["Status / last seen", "Station", "Paired", "IP address", "Device"]}
          empty="No customer-facing screen paired."
          rows={data.customerScreens.map((c) => [
            <Dot key="s" status={statusOf(c.lastSeenAt)} sub={c.lastSeenAt ? `${at(c.lastSeenAt)} · ${ago(c.lastSeenAt)}` : undefined} />,
            <span key="r" className="text-xs text-slate-700">{c.station ?? "Not linked"}</span>,
            <span key="p" className="text-xs text-slate-700">{at(c.pairedAt)}</span>,
            <span key="i" className="font-mono text-xs text-slate-700">{c.ip ?? "—"}</span>,
            <span key="u" className="text-xs text-slate-700" title={c.userAgent ?? ""}>{describeDevice(c.userAgent)}</span>,
          ])} />
      </Section>

      <Section title={`Kiosks (${data.kiosks.length})`}>
        <Table head={["Status / last used", "Paired", "IP address", "Device"]}
          empty="No kiosk paired to this salon."
          rows={data.kiosks.map((k) => [
            k.revokedAt ? <span key="s" className="text-xs text-slate-500">Removed {at(k.revokedAt)}</span> : <Dot key="s" status={statusOf(k.lastSeenAt)} sub={k.lastSeenAt ? `${at(k.lastSeenAt)} · ${ago(k.lastSeenAt)}` : undefined} />,
            <span key="p" className="text-xs text-slate-700">{at(k.pairedAt)}</span>,
            <span key="i" className="font-mono text-xs text-slate-700">{k.ip ?? "—"}</span>,
            <span key="u" className="text-xs text-slate-700" title={k.userAgent ?? ""}>{describeDevice(k.userAgent)}</span>,
          ])} />
      </Section>

      <Section title={`Receipt printers (${data.printers.length})`}>
        <Table head={["Status / last seen", "Computer", "Printer", "Agent version", "IP address"]}
          empty="No receipt print agent installed."
          rows={data.printers.map((p) => [
            p.revokedAt ? <span key="s" className="text-xs text-slate-500">Removed {at(p.revokedAt)}</span> : <Dot key="s" status={statusOf(p.lastSeenAt)} sub={p.lastSeenAt ? `${at(p.lastSeenAt)} · ${ago(p.lastSeenAt)}` : undefined} />,
            <span key="m" className="text-xs text-slate-700">{p.machine ?? "—"}{p.isDefault && <span className="ml-1.5 text-[10px] text-slate-400">DEFAULT</span>}</span>,
            <span key="r" className="text-xs text-slate-700">{p.printer ?? "—"}{p.status && <span className="block text-slate-400">{p.status}</span>}</span>,
            <span key="v" className="text-xs text-slate-700">{p.version ?? "—"}</span>,
            <span key="i" className="font-mono text-xs text-slate-700">{p.ip ?? "—"}</span>,
          ])} />
      </Section>

      <Section title={`Owner app (${data.ownerApp.length})`}>
        <Table head={["Status / last seen", "Platform", "First seen"]}
          empty="The owner hasn't installed the Certxa app."
          rows={data.ownerApp.map((d, i) => [
            <Dot key={`s${i}`} status={statusOf(d.lastSeenAt)} sub={d.lastSeenAt ? `${at(d.lastSeenAt)} · ${ago(d.lastSeenAt)}` : undefined} />,
            <span key="p" className="text-xs text-slate-700 capitalize">{d.platform}</span>,
            <span key="f" className="text-xs text-slate-700">{at(d.firstSeenAt)}</span>,
          ])} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-700">{title}</h3></div>
      {children}
    </div>
  );
}

function Setting({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`text-sm ${warn ? "text-red-600 font-semibold" : "text-slate-800"}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

function Dot({ status, sub }: { status: Status; sub?: string }) {
  const s = STATUS[status];
  return (
    <span className="text-xs">
      <span className={`inline-flex items-center gap-1.5 font-medium ${s.text}`}><span className={`w-2 h-2 rounded-full ${s.dot}`} />{s.label}</span>
      {sub && <span className="block text-slate-400">{sub}</span>}
    </span>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: ReactNode[][]; empty: string }) {
  if (!rows.length) return <p className="px-4 py-4 text-sm text-slate-400">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">{head.map((h) => <th key={h} className="px-4 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => <tr key={i} className="align-top">{r.map((c, j) => <td key={j} className="px-4 py-2.5">{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}
