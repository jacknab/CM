import { useQuery } from "@tanstack/react-query";
import {
  Globe, CheckCircle2, XCircle, ExternalLink,
  FileText, Eye, Calendar, Link2, Copy, Layers,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { api } from "@/lib/api";

interface WebsiteData {
  website: {
    id: number;
    name: string;
    published: boolean;
    published_at: string | null;
    custom_domain: string | null;
    assigned_subdomain: string | null;
    created_at: string;
    updated_at: string;
    publisher_type: string | null;
    page_count: number;
  } | null;
  pageViews: {
    total_views: number;
    views_30d: number;
    views_7d: number;
  };
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="text-xs font-medium text-slate-700">{value}</div>
    </div>
  );
}

export default function WebsiteTab({ accountId }: { accountId: number }) {
  const { data, isLoading, error } = useQuery<WebsiteData>({
    queryKey: ["website-tab", accountId],
    queryFn: () => api.accounts.website(accountId),
    staleTime: 60_000,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-48">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-48 text-sm text-slate-400">
      Failed to load website data
    </div>
  );

  const { website, pageViews } = data!;

  const liveUrl = website?.custom_domain
    ? `https://${website.custom_domain}`
    : website?.assigned_subdomain
    ? `https://${website.assigned_subdomain}.certxa.site`
    : null;

  return (
    <div className="p-6 max-w-5xl space-y-5">

      {/* ── Status Banner ──────────────────────────────────────────────────────── */}
      {!website ? (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center">
          <Globe size={36} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-600">No website created</p>
          <p className="text-xs text-slate-400 mt-1">This account hasn't set up a website through Certxa's website builder yet.</p>
        </div>
      ) : (
        <>
          {/* ── KPI Strip ─────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Status",      value: website.published ? "Published" : "Draft",
                cls: website.published ? "text-emerald-700" : "text-amber-700",
                bg: website.published ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200",
                icon: website.published ? <CheckCircle2 size={15} className="text-emerald-500" /> : <XCircle size={15} className="text-amber-500" /> },
              { label: "Page Views (30d)", value: pageViews.views_30d.toLocaleString(),
                cls: "text-slate-800", bg: "bg-white border-slate-200",
                icon: <Eye size={15} className="text-indigo-500" /> },
              { label: "Page Views (7d)", value: pageViews.views_7d.toLocaleString(),
                cls: "text-slate-800", bg: "bg-white border-slate-200",
                icon: <Eye size={15} className="text-violet-500" /> },
              { label: "Total Pages",  value: String(website.page_count),
                cls: "text-slate-800", bg: "bg-white border-slate-200",
                icon: <FileText size={15} className="text-sky-500" /> },
            ].map(m => (
              <div key={m.label} className={`rounded-xl border p-4 flex gap-3 items-start ${m.bg}`}>
                <div className="mt-0.5">{m.icon}</div>
                <div>
                  <div className={`text-lg font-bold ${m.cls}`}>{m.value}</div>
                  <div className="text-[11px] text-slate-400">{m.label}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* ── Website Details ─────────────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe size={14} className="text-indigo-500" />
                  <h3 className="text-sm font-semibold text-slate-700">Website Details</h3>
                </div>
                {liveUrl && (
                  <a href={liveUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 text-[11px] text-indigo-600 hover:text-indigo-800 font-medium">
                    <ExternalLink size={11} />
                    View Live
                  </a>
                )}
              </div>
              <div className="p-4">
                <InfoRow label="Website Name" value={website.name} />
                <InfoRow label="Publisher Type" value={
                  <span className="capitalize">{website.publisher_type ?? "Manual"}</span>
                } />
                <InfoRow label="Created" value={format(parseISO(website.created_at), "MMM d, yyyy")} />
                {website.published_at && (
                  <InfoRow label="Last Published" value={format(parseISO(website.published_at), "MMM d, yyyy h:mm a")} />
                )}
                <InfoRow label="Last Updated" value={format(parseISO(website.updated_at), "MMM d, yyyy h:mm a")} />
                <InfoRow label="Total Pages" value={website.page_count} />
                <InfoRow label="Total Views" value={pageViews.total_views.toLocaleString()} />
              </div>
            </div>

            {/* ── Domain & URLs ────────────────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Link2 size={14} className="text-teal-500" />
                  <h3 className="text-sm font-semibold text-slate-700">Domain & URLs</h3>
                </div>
              </div>
              <div className="p-4 space-y-3">
                {/* Live URL */}
                {liveUrl && (
                  <div className="bg-indigo-50 rounded-xl p-3">
                    <div className="text-[10px] text-indigo-600 font-semibold mb-1.5 uppercase tracking-wide">Live URL</div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-slate-700 flex-1 truncate">{liveUrl}</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(liveUrl)}
                        className="p-1.5 text-indigo-500 hover:bg-indigo-100 rounded transition flex-shrink-0"
                        title="Copy URL"
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Custom Domain */}
                {website.custom_domain ? (
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 size={13} className="text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-700">Custom Domain</p>
                      <p className="text-[11px] text-slate-500 font-mono">{website.custom_domain}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0">
                      <XCircle size={13} className="text-slate-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-600">No Custom Domain</p>
                      <p className="text-[11px] text-slate-400">Using default Certxa subdomain</p>
                    </div>
                  </div>
                )}

                {/* Subdomain */}
                {website.assigned_subdomain && (
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                      <Layers size={13} className="text-indigo-500" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-700">Assigned Subdomain</p>
                      <p className="text-[11px] text-slate-500 font-mono">{website.assigned_subdomain}.certxa.site</p>
                    </div>
                  </div>
                )}

                {/* Page Views Trend */}
                <div className="pt-2">
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-2">Traffic Trend</p>
                  <div className="space-y-1.5">
                    {[
                      { label: "Last 7 days",  value: pageViews.views_7d,    max: pageViews.total_views || 1, color: "bg-indigo-500" },
                      { label: "Last 30 days", value: pageViews.views_30d,   max: pageViews.total_views || 1, color: "bg-violet-500" },
                      { label: "All time",     value: pageViews.total_views, max: pageViews.total_views || 1, color: "bg-slate-400" },
                    ].map(t => (
                      <div key={t.label} className="flex items-center gap-3">
                        <span className="text-[10px] text-slate-500 w-20 flex-shrink-0">{t.label}</span>
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${t.color}`}
                            style={{ width: `${Math.min(100, (t.value / t.max) * 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-medium text-slate-600 w-8 text-right tabular-nums">{t.value.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
