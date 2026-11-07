import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supportApi, type WebsiteData } from "@/lib/support-api";
import { format, parseISO } from "date-fns";
import { Globe, Eye, CheckCircle2, XCircle, ExternalLink, Layout, Palette } from "lucide-react";

function fmtDate(d: string | null) {
  if (!d) return "—";
  try { return format(parseISO(d), "MMM d, yyyy"); } catch { return d; }
}

const DESIGN_NAMES: Record<string, string> = {
  bloom: "Bloom", solo: "Solo", aspen: "Aspen (choose a professional first)", simple: "Simple", classic: "Classic", mobile: "Mobile",
};

/**
 * What the account's website shows (owner, 2026-11-07): a Website Builder template, or the booking site in one of its
 * designs. A published builder site wins on the subdomain, so picking a booking design unpublishes it (it's kept).
 */
function SiteDesignCard({ accountId, design }: { accountId: number; design: NonNullable<WebsiteData["siteDesign"]> }) {
  const qc = useQueryClient();
  const [choice, setChoice] = useState(design.current);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setChoice(design.current); }, [design.current]);
  const label = (c: string) => {
    const [kind, value] = c.split(":");
    return kind === "template" ? (design.templates.find((t) => String(t.id) === value)?.name ?? `Template ${value}`) : `Booking site: ${DESIGN_NAMES[value] ?? value}`;
  };
  const toBooking = choice.startsWith("booking:");
  const previewUrl = design.url && toBooking ? `${design.url}/?previewTheme=${choice.slice(8)}` : null;
  const save = async () => {
    const warn = toBooking && design.current.startsWith("template:")
      ? `\n\nThe Website Builder site is unpublished (kept), so the booking site shows instead.${design.customDomain ? ` ${design.customDomain} will stop showing it too.` : ""}`
      : "";
    if (!window.confirm(`Change this account's website to "${label(choice)}"? Clients see it at once.${warn}`)) return;
    setBusy(true); setMessage(null);
    try {
      await supportApi.accounts.setSiteDesign(accountId, choice);
      setMessage({ ok: true, text: "Saved. The website uses it now." });
      await qc.invalidateQueries({ queryKey: ["support-website", accountId] });
    } catch (e: any) { setMessage({ ok: false, text: e?.message || "Could not change the website." }); }
    finally { setBusy(false); }
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 max-w-lg space-y-3" data-testid="support-site-design">
      <div className="flex items-center gap-2">
        <Palette size={14} className="text-slate-400" />
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Website design</h3>
      </div>
      <p className="text-xs text-slate-500">Now showing: <span className="font-medium text-slate-700">{label(design.current)}</span></p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={choice} onChange={(e) => { setChoice(e.target.value); setMessage(null); }} disabled={busy}
          className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-800" data-testid="support-site-design-select">
          {design.hasBuilderSite && (
            <optgroup label="Website Builder template">
              {design.templates.map((t) => <option key={t.id} value={`template:${t.id}`}>{t.name}</option>)}
            </optgroup>
          )}
          {design.hasBookingSite && (
            <optgroup label="Booking site design">
              {design.bookingThemes.map((t) => <option key={t} value={`booking:${t}`}>Booking site: {DESIGN_NAMES[t] ?? t}</option>)}
            </optgroup>
          )}
        </select>
        {previewUrl && (
          <a href={previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline">
            Preview<ExternalLink size={11} />
          </a>
        )}
        <button type="button" onClick={save} disabled={busy || choice === design.current}
          className="h-9 rounded-lg bg-indigo-600 px-3.5 text-sm font-medium text-white disabled:opacity-40" data-testid="support-site-design-save">
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {message && <p className={`text-xs ${message.ok ? "text-emerald-700" : "text-red-600"}`} role="status">{message.text}</p>}
    </div>
  );
}

export default function WebsiteTab({ accountId }: { accountId: number }) {
  const { data, isLoading, error } = useQuery<WebsiteData>({
    queryKey: ["support-website", accountId],
    queryFn: () => supportApi.accounts.website(accountId),
    staleTime: 60_000,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error || !data) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-slate-400 text-sm">Failed to load website data.</p>
    </div>
  );

  const { website, pageViews, bookingSite, siteDesign } = data;
  const designCard = siteDesign ? <SiteDesignCard accountId={accountId} design={siteDesign} /> : null;

  // A Certxa Pro app account has no Website Builder site: its website is the booking site.
  if (!website && bookingSite) return (
    <div className="p-6 space-y-5">
      {designCard}
      <div className="bg-white rounded-xl border border-slate-200 p-4 max-w-lg space-y-2">
        <div className="flex items-center gap-2">
          <Globe size={14} className="text-slate-400" />
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Booking website</h3>
        </div>
        <p className="text-xs text-slate-500">This Certxa Pro app account's website is its booking site, set up in the app's Website screen.</p>
        <a href={bookingSite.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline text-sm font-medium">
          {bookingSite.url.replace("https://", "")}<ExternalLink size={11} />
        </a>
      </div>
    </div>
  );

  if (!website) return (
    <div className="p-6 space-y-5">
      {designCard}
      <div className="flex flex-col items-center justify-center h-48 gap-2">
        <Globe size={32} className="text-slate-300" />
        <p className="text-slate-500 text-sm font-medium">No website set up</p>
        <p className="text-slate-400 text-xs">This account hasn't created a website yet.</p>
      </div>
    </div>
  );

  const liveUrl = website.custom_domain
    ? `https://${website.custom_domain}`
    : website.assigned_subdomain
      ? `https://${website.assigned_subdomain}`
      : null;

  const kpis = [
    { icon: Eye,      label: "Views (7d)",   value: pageViews.views_7d,    color: "text-indigo-600",  bg: "bg-indigo-50"  },
    { icon: Eye,      label: "Views (30d)",  value: pageViews.views_30d,   color: "text-violet-600",  bg: "bg-violet-50"  },
    { icon: Eye,      label: "Views (All)",  value: pageViews.total_views, color: "text-blue-600",    bg: "bg-blue-50"    },
  ];

  return (
    <div className="p-6 space-y-5">

      {designCard}

      {/* Live URL */}
      {liveUrl && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="font-medium text-slate-700">Live URL:</span>
          <a
            href={liveUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-indigo-600 hover:underline font-medium"
          >
            {liveUrl.replace("https://", "")}
            <ExternalLink size={11} />
          </a>
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        {kpis.map(k => (
          <div key={k.label} className={`rounded-xl ${k.bg} p-3 flex flex-col gap-1`}>
            <k.icon size={14} className={k.color} />
            <div className={`text-lg font-bold ${k.color}`}>{k.value.toLocaleString()}</div>
            <div className="text-[10px] text-slate-500 leading-tight">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Website details card */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden max-w-lg">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <Layout size={13} className="text-slate-400" />
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Website Details</h3>
        </div>
        <div className="divide-y divide-slate-50">
          {[
            {
              label: "Status",
              value: website.published ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                  <CheckCircle2 size={11} /> Published
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <XCircle size={11} /> Unpublished
                </span>
              ),
            },
            { label: "Name",            value: website.name },
            { label: "Publisher Type",  value: website.publisher_type ?? "Standard" },
            { label: "Custom Domain",   value: website.custom_domain ?? <span className="text-slate-400">None</span> },
            { label: "Subdomain",       value: website.assigned_subdomain ?? <span className="text-slate-400">None</span> },
            { label: "Published",       value: fmtDate(website.published_at) },
            { label: "Created",         value: fmtDate(website.created_at) },
            { label: "Last Updated",    value: fmtDate(website.updated_at) },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs text-slate-500">{row.label}</span>
              <span className="text-xs text-slate-800 font-medium text-right">{row.value}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
