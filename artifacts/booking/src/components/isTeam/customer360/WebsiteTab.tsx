import { useQuery } from "@tanstack/react-query";
import { supportApi, type WebsiteData } from "@/lib/support-api";
import { format, parseISO } from "date-fns";
import { Globe, Eye, FileText, CheckCircle2, XCircle, ExternalLink, Layout } from "lucide-react";

function fmtDate(d: string | null) {
  if (!d) return "—";
  try { return format(parseISO(d), "MMM d, yyyy"); } catch { return d; }
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

  const { website, pageViews } = data;

  if (!website) return (
    <div className="flex flex-col items-center justify-center h-64 gap-2">
      <Globe size={32} className="text-slate-300" />
      <p className="text-slate-500 text-sm font-medium">No website set up</p>
      <p className="text-slate-400 text-xs">This account hasn't created a website yet.</p>
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
    { icon: FileText, label: "Pages",        value: website.page_count,    color: "text-emerald-600", bg: "bg-emerald-50" },
  ];

  return (
    <div className="p-6 space-y-5">

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
