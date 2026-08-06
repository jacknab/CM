import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Globe, Search, Zap, CheckCircle2, AlertCircle, ChevronRight, Loader2, RefreshCw, Lock, ExternalLink, Map } from "lucide-react";

// Static industry SEO pages served at certxa.com/<slug>
const INDUSTRY_PAGES = [
  { slug: "/barbers",          label: "Barbers" },
  { slug: "/hair-salons",      label: "Hair Salons" },
  { slug: "/nails",            label: "Nail Salons" },
  { slug: "/tattoo",           label: "Tattoo Studios" },
  { slug: "/estheticians",     label: "Estheticians" },
  { slug: "/groomers",         label: "Pet Groomers" },
  { slug: "/handyman",         label: "Handyman" },
  { slug: "/hvac",             label: "HVAC" },
  { slug: "/plumbing",         label: "Plumbing" },
  { slug: "/electrical",       label: "Electrical" },
  { slug: "/lawn-care",        label: "Lawn Care" },
  { slug: "/house-cleaning",   label: "House Cleaning" },
  { slug: "/tutoring",         label: "Tutoring" },
  { slug: "/snow-removal",     label: "Snow Removal" },
  { slug: "/dog-walking",      label: "Dog Walking" },
  { slug: "/carpet-cleaning",  label: "Carpet Cleaning" },
  { slug: "/pressure-washing", label: "Pressure Washing" },
  { slug: "/window-cleaning",  label: "Window Cleaning" },
  { slug: "/ride-service",     label: "Ride Service" },
  { slug: "/industries",       label: "All Industries (index)" },
];

const REGION_PAGES = [
  { slug: "/dallas-tx-booking",         label: "Dallas TX — Booking" },
  { slug: "/houston-tx-hair-salons",    label: "Houston TX — Hair Salons" },
  { slug: "/houston-tx-nail-salons",    label: "Houston TX — Nail Salons" },
  { slug: "/phoenix-az-hair-salons",    label: "Phoenix AZ — Hair Salons" },
  { slug: "/phoenix-az-nail-salons",    label: "Phoenix AZ — Nail Salons" },
  { slug: "/tempe-az-nail-salons",      label: "Tempe AZ — Nail Salons" },
];

interface Website {
  id: number;
  name: string;
  slug: string;
  published: boolean;
  storeid: string;
  createdAt: string;
}

interface SeoIssue {
  severity: "high" | "medium" | "low";
  field: string;
  message: string;
}

interface SeoRecommendation {
  field: string;
  action: string;
}

interface SeoScanResult {
  score: number;
  grade: string;
  summary: string;
  issues: SeoIssue[];
  recommendations: SeoRecommendation[];
  suggestedTitle?: string;
  suggestedDescription?: string;
  suggestedKeywords?: string;
}

const AUTO_FIX_ALLOWLIST = ["title", "description", "keywords"];

const SEVERITY_LABEL: Record<string, string> = {
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
};

const SEVERITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-700 border border-red-200",
  medium: "bg-amber-100 text-amber-700 border border-amber-200",
  low: "bg-blue-100 text-blue-700 border border-blue-200",
};

function scoreColor(score: number) {
  if (score >= 80) return "#16a34a";
  if (score >= 60) return "#d97706";
  if (score >= 40) return "#ea580c";
  return "#dc2626";
}

function gradeColor(grade: string) {
  if (grade === "A") return "text-green-600";
  if (grade === "B") return "text-blue-600";
  if (grade === "C") return "text-amber-600";
  if (grade === "D") return "text-orange-600";
  return "text-red-600";
}

export default function SeoAgentAdmin() {
  const navigate = useNavigate();
  const [websites, setWebsites] = useState<Website[]>([]);
  const [loadingWebsites, setLoadingWebsites] = useState(false);
  const [websitesLoaded, setWebsitesLoaded] = useState(false);
  const [selectedWebsite, setSelectedWebsite] = useState<Website | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<SeoScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [applyingFix, setApplyingFix] = useState<string | null>(null);
  const [fixResults, setFixResults] = useState<Record<string, "ok" | "not_supported" | "error">>({});
  const [storeidFilter, setStoreidFilter] = useState("");

  const loadWebsites = async () => {
    setLoadingWebsites(true);
    try {
      const url = storeidFilter.trim()
        ? `/api/websites?storeid=${encodeURIComponent(storeidFilter.trim())}`
        : "/api/websites";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load websites");
      const data: Website[] = await res.json();
      setWebsites(data);
      setWebsitesLoaded(true);
    } catch {
      setWebsites([]);
      setWebsitesLoaded(true);
    } finally {
      setLoadingWebsites(false);
    }
  };

  const runScan = async (website: Website) => {
    setSelectedWebsite(website);
    setScanResult(null);
    setScanError(null);
    setFixResults({});
    setScanning(true);
    try {
      const res = await fetch(`/api/websites/${website.id}/seo-scan`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Scan failed");
      }
      const result: SeoScanResult = await res.json();
      setScanResult(result);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Scan failed — please try again");
    } finally {
      setScanning(false);
    }
  };

  const applyFix = async (field: string) => {
    if (!selectedWebsite || !scanResult) return;

    const fieldKey = field.toLowerCase();
    if (!AUTO_FIX_ALLOWLIST.includes(fieldKey)) {
      setFixResults((prev) => ({ ...prev, [field]: "not_supported" }));
      return;
    }

    setApplyingFix(field);
    try {
      const seoUpdate: Record<string, string> = {};
      if (fieldKey === "title" && scanResult.suggestedTitle) seoUpdate.title = scanResult.suggestedTitle;
      if (fieldKey === "description" && scanResult.suggestedDescription) seoUpdate.description = scanResult.suggestedDescription;
      if (fieldKey === "keywords" && scanResult.suggestedKeywords) seoUpdate.keywords = scanResult.suggestedKeywords;

      if (Object.keys(seoUpdate).length === 0) {
        setFixResults((prev) => ({ ...prev, [field]: "not_supported" }));
        return;
      }

      const getRes = await fetch(`/api/websites/${selectedWebsite.id}`, { credentials: "include" });
      if (!getRes.ok) throw new Error("Could not load website");
      const siteData = await getRes.json();
      const existing = (siteData as any)?.content ?? {};
      const updatedContent = { ...existing, seo: { ...(existing.seo ?? {}), ...seoUpdate } };

      const putRes = await fetch(`/api/websites/${selectedWebsite.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: updatedContent }),
      });
      if (!putRes.ok) throw new Error("Failed to apply fix");

      setFixResults((prev) => ({ ...prev, [field]: "ok" }));
    } catch {
      setFixResults((prev) => ({ ...prev, [field]: "error" }));
    } finally {
      setApplyingFix(null);
    }
  };

  const getSuggestedValueForField = (field: string): string | undefined => {
    const f = field.toLowerCase();
    if (f === "title") return scanResult?.suggestedTitle;
    if (f === "description") return scanResult?.suggestedDescription;
    if (f === "keywords") return scanResult?.suggestedKeywords;
    return undefined;
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Zap size={24} className="text-indigo-600" />
          SEO Agent
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          AI-powered SEO analysis and auto-fix for user websites. Platform SEO pages are managed below.
        </p>
      </div>

      {/* ── Platform SEO Pages ─────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Map size={18} className="text-emerald-600" />
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Platform SEO Pages</h2>
          </div>
          <button
            onClick={() => navigate("/admin/seo-regions")}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <ExternalLink size={13} />
            Open SEO Regions Manager
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-5">
          The SEO Regions Manager lets you create, edit, and generate city/industry landing pages for certxa.com
          (e.g. <span className="font-mono">/dallas-tx-booking</span>). The static industry pages below are served
          directly as PHP/HTML files from the server.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Industry pages */}
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Static Industry Pages ({INDUSTRY_PAGES.length})
            </p>
            <div className="space-y-1">
              {INDUSTRY_PAGES.map((p) => (
                <a
                  key={p.slug}
                  href={`https://certxa.com${p.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-gray-50 group"
                >
                  <span className="text-xs text-gray-700 group-hover:text-indigo-700">{p.label}</span>
                  <span className="flex items-center gap-1 text-[10px] font-mono text-gray-400 group-hover:text-indigo-400">
                    {p.slug}
                    <ExternalLink size={9} />
                  </span>
                </a>
              ))}
            </div>
          </div>

          {/* Region pages */}
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Static Region Pages ({REGION_PAGES.length})
            </p>
            <div className="space-y-1">
              {REGION_PAGES.map((p) => (
                <a
                  key={p.slug}
                  href={`https://certxa.com${p.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-gray-50 group"
                >
                  <span className="text-xs text-gray-700 group-hover:text-indigo-700">{p.label}</span>
                  <span className="flex items-center gap-1 text-[10px] font-mono text-gray-400 group-hover:text-indigo-400">
                    {p.slug}
                    <ExternalLink size={9} />
                  </span>
                </a>
              ))}
            </div>
            <div className="mt-4 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-100">
              <p className="text-[11px] text-blue-700 font-medium">
                Need more region pages?
              </p>
              <p className="text-[11px] text-blue-600 mt-0.5">
                Use the SEO Regions Manager to generate new city-specific landing pages with AI-written content.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Website Selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Select Website</h2>
        <div className="flex gap-3 mb-4">
          <input
            type="text"
            placeholder="Filter by Store ID (optional)"
            value={storeidFilter}
            onChange={(e) => setStoreidFilter(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            onClick={loadWebsites}
            disabled={loadingWebsites}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loadingWebsites ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {loadingWebsites ? "Loading…" : "Load Websites"}
          </button>
        </div>

        {websitesLoaded && websites.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">No websites found.</p>
        )}

        {websites.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {websites.map((site) => (
              <div
                key={site.id}
                onClick={() => runScan(site)}
                className={`cursor-pointer rounded-lg border p-3 transition-all hover:border-indigo-400 hover:shadow-sm ${
                  selectedWebsite?.id === site.id
                    ? "border-indigo-500 bg-indigo-50"
                    : "border-gray-200 bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Globe size={14} className="text-gray-400 shrink-0" />
                  <span className="text-sm font-medium text-gray-800 truncate">{site.name}</span>
                  {site.published && (
                    <span className="ml-auto text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold shrink-0">
                      Live
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-400 font-mono truncate">{site.slug}.certxa.com</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Store: {site.storeid}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scan Status */}
      {scanning && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 flex flex-col items-center gap-3 mb-6">
          <Loader2 size={28} className="animate-spin text-indigo-500" />
          <p className="text-sm font-medium text-gray-600">
            Running AI SEO scan on <span className="font-semibold text-gray-800">{selectedWebsite?.name}</span>…
          </p>
          <p className="text-xs text-gray-400">Analyzing meta tags, content, and local SEO signals</p>
        </div>
      )}

      {scanError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 mb-6">
          <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700">Scan failed</p>
            <p className="text-xs text-red-600 mt-0.5">{scanError}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {scanResult && selectedWebsite && !scanning && (
        <div className="space-y-5">
          {/* Score Header */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{selectedWebsite.name}</h2>
                <a
                  href={`/api/websites/${selectedWebsite.id}/preview`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 mt-0.5"
                >
                  <ExternalLink size={10} />
                  {selectedWebsite.slug}.certxa.com
                </a>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-3xl font-black" style={{ color: scoreColor(scanResult.score) }}>
                    {scanResult.score}
                  </p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Score</p>
                </div>
                <div className="text-center">
                  <p className={`text-3xl font-black ${gradeColor(scanResult.grade)}`}>{scanResult.grade}</p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Grade</p>
                </div>
                <button
                  onClick={() => runScan(selectedWebsite)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <RefreshCw size={12} />
                  Re-scan
                </button>
              </div>
            </div>
            <p className="text-sm text-gray-600 mt-3 leading-relaxed border-t border-gray-100 pt-3">
              {scanResult.summary}
            </p>
          </div>

          {/* Issues */}
          {scanResult.issues.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Issues Found</h3>
              <div className="space-y-2">
                {scanResult.issues.map((issue, i) => (
                  <div key={i} className={`flex items-start gap-3 rounded-lg px-3 py-2.5 ${SEVERITY_COLORS[issue.severity]}`}>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/60 shrink-0 mt-0.5">
                      {SEVERITY_LABEL[issue.severity]}
                    </span>
                    <div>
                      <p className="text-xs font-semibold capitalize">{issue.field}</p>
                      <p className="text-xs mt-0.5 opacity-90">{issue.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {scanResult.recommendations.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Recommendations</h3>
              <div className="space-y-2">
                {scanResult.recommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg px-3 py-2.5 bg-purple-50 border border-purple-100">
                    <ChevronRight size={12} className="text-purple-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[10px] font-bold text-purple-500 uppercase tracking-wider">{rec.field}</p>
                      <p className="text-xs text-purple-700 mt-0.5">{rec.action}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Recommended Auto-Fixes */}
          {(scanResult.suggestedTitle || scanResult.suggestedDescription || scanResult.suggestedKeywords || scanResult.issues.length > 0) && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Zap size={16} className="text-indigo-500" />
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">AI Recommended Auto-Fixes</h3>
              </div>

              <div className="space-y-3">
                {/* Title fix */}
                {scanResult.suggestedTitle && (
                  <FixRow
                    field="title"
                    label="meta_title"
                    suggested={scanResult.suggestedTitle}
                    status={fixResults["title"]}
                    applying={applyingFix === "title"}
                    onApply={() => applyFix("title")}
                  />
                )}

                {/* Description fix */}
                {scanResult.suggestedDescription && (
                  <FixRow
                    field="description"
                    label="meta_description"
                    suggested={scanResult.suggestedDescription}
                    status={fixResults["description"]}
                    applying={applyingFix === "description"}
                    onApply={() => applyFix("description")}
                  />
                )}

                {/* Keywords fix */}
                {scanResult.suggestedKeywords && (
                  <FixRow
                    field="keywords"
                    label="meta_keywords"
                    suggested={scanResult.suggestedKeywords}
                    status={fixResults["keywords"]}
                    applying={applyingFix === "keywords"}
                    onApply={() => applyFix("keywords")}
                  />
                )}

                {/* Schema — not in allowlist */}
                {scanResult.issues.some((i) => i.field === "schema" || i.field === "content") && (
                  <FixRow
                    field="schema"
                    label="schema"
                    suggested="JSON-LD structured data markup"
                    status={fixResults["schema"]}
                    applying={false}
                    onApply={() => applyFix("schema")}
                    notAutoFixable
                    notAutoFixableReason="Schema markup requires manually adding JSON-LD to the website template — it cannot be applied automatically."
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface FixRowProps {
  field: string;
  label: string;
  suggested: string;
  status: "ok" | "not_supported" | "error" | undefined;
  applying: boolean;
  onApply: () => void;
  notAutoFixable?: boolean;
  notAutoFixableReason?: string;
}

function FixRow({ field, label, suggested, status, applying, onApply, notAutoFixable, notAutoFixableReason }: FixRowProps) {
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-50">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-mono font-semibold text-gray-700">{label}</p>
          <p className="text-[11px] text-gray-500 mt-0.5 truncate">{suggested}</p>
        </div>
        <div className="shrink-0">
          {status === "ok" ? (
            <span className="flex items-center gap-1 text-xs font-medium text-green-600">
              <CheckCircle2 size={14} />
              Applied
            </span>
          ) : status === "not_supported" || notAutoFixable ? (
            <span className="flex items-center gap-1 text-xs font-medium text-gray-400">
              <Lock size={12} />
              Manual only
            </span>
          ) : status === "error" ? (
            <span className="flex items-center gap-1 text-xs font-medium text-red-500">
              <AlertCircle size={14} />
              Failed
            </span>
          ) : (
            <button
              onClick={notAutoFixable ? undefined : onApply}
              disabled={applying || notAutoFixable}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                notAutoFixable
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white"
              }`}
            >
              {applying ? (
                <><Loader2 size={10} className="animate-spin" /> Applying…</>
              ) : (
                <>
                  <Zap size={10} />
                  Apply This Fix
                </>
              )}
            </button>
          )}
        </div>
      </div>
      {(status === "not_supported" || notAutoFixable) && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-100">
          <p className="text-[11px] text-amber-700">
            {notAutoFixableReason ?? `"${field}" is not in the auto-fix list — edit this field manually in the website builder.`}
          </p>
        </div>
      )}
    </div>
  );
}
