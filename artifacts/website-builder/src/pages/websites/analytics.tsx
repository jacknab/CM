import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useGetWebsite, getGetWebsiteQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Globe, BarChart2, Eye, Users, TrendingUp,
  ExternalLink, RefreshCw, Loader2, Calendar, Link2,
  MousePointerClick, AlertCircle,
} from "lucide-react";

interface DayBucket {
  date: string;
  views: number;
}

interface Analytics {
  total: number;
  thisWeek: number;
  thisMonth: number;
  today: number;
  byDay: DayBucket[];
  topReferrers: { referrer: string; count: number }[];
  topPaths: { path: string; count: number }[];
}

function BarChartMini({ data, max }: { data: DayBucket[]; max: number }) {
  if (!data.length) return null;
  return (
    <div className="flex items-end gap-0.5 h-16 w-full">
      {data.map((d) => {
        const pct = max > 0 ? (d.views / max) * 100 : 0;
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5 group relative" title={`${d.date}: ${d.views} views`}>
            <div
              className="w-full rounded-t-sm bg-[#3B0764]/20 group-hover:bg-[#3B0764]/60 transition-colors min-h-[2px]"
              style={{ height: `${Math.max(pct, 2)}%` }}
            />
          </div>
        );
      })}
    </div>
  );
}

export default function WebsiteAnalytics() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const { data: website, isLoading: websiteLoading } = useGetWebsite(id, {
    query: { enabled: !!id, queryKey: getGetWebsiteQueryKey(id) },
  });

  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<30 | 7>(30);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/websites/${id}/analytics?days=${period}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load analytics");
      const data = await res.json() as Analytics;
      setAnalytics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) void fetchAnalytics();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, period]);

  const maxViews = analytics?.byDay.reduce((m, d) => Math.max(m, d.views), 0) ?? 0;

  const customDomain = (website as any)?.customDomain;
  const domainIsActive = (website as any)?.customDomainStatus === "active";
  const liveUrl = domainIsActive && customDomain
    ? `https://${customDomain}`
    : website?.slug ? `https://${website.slug}.certxa.com` : null;

  if (websiteLoading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col gap-6">
        <Skeleton className="h-8 w-48 rounded-full" />
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  if (!website) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="w-10 h-10 text-gray-300" />
        <p className="text-gray-500">Website not found</p>
        <Link href="/websites"><Button variant="outline" className="rounded-full">Back to My Websites</Button></Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 lg:px-10 py-10 flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link href={`/websites/${id}/edit`}>
            <Button variant="ghost" size="icon" className="rounded-full h-9 w-9 text-gray-500 hover:bg-gray-100">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-xl text-gray-900">{website.name}</h1>
              {website.published ? (
                <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] font-bold rounded-full">Live</Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] font-bold rounded-full">Draft</Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-0.5">
              <Globe className="w-3 h-3 text-[#C97B2B]" />
              <span>{website.slug}.certxa.com</span>
              {domainIsActive && customDomain && (
                <><span className="text-gray-300">·</span><Link2 className="w-3 h-3 text-green-500" /><span className="text-green-600 font-medium">{customDomain}</span></>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {liveUrl && (
            <a href={liveUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="rounded-full text-xs gap-1.5 border-gray-200">
                <ExternalLink className="w-3.5 h-3.5" />
                View Site
              </Button>
            </a>
          )}
          <div className="flex items-center rounded-full border border-gray-200 overflow-hidden text-xs font-semibold">
            <button
              onClick={() => setPeriod(7)}
              className={`px-3 py-1.5 transition-colors ${period === 7 ? "bg-[#3B0764] text-white" : "text-gray-500 hover:bg-gray-50"}`}
            >
              7 days
            </button>
            <button
              onClick={() => setPeriod(30)}
              className={`px-3 py-1.5 border-l border-gray-200 transition-colors ${period === 30 ? "bg-[#3B0764] text-white" : "text-gray-500 hover:bg-gray-50"}`}
            >
              30 days
            </button>
          </div>
          <Button
            variant="ghost" size="icon"
            onClick={() => void fetchAnalytics()}
            disabled={loading}
            className="rounded-full h-8 w-8 text-gray-500"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Views", value: analytics?.total, icon: Eye, color: "text-[#3B0764]", bg: "bg-[#3B0764]/5" },
          { label: "This Month", value: analytics?.thisMonth, icon: Calendar, color: "text-[#C97B2B]", bg: "bg-[#C97B2B]/5" },
          { label: "This Week", value: analytics?.thisWeek, icon: TrendingUp, color: "text-green-600", bg: "bg-green-50" },
          { label: "Today", value: analytics?.today, icon: MousePointerClick, color: "text-blue-600", bg: "bg-blue-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="rounded-2xl border-gray-100 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-1">
              <CardTitle className="text-xs font-medium text-gray-500">{label}</CardTitle>
              <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon className={`w-3.5 h-3.5 ${color}`} />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-16 rounded" />
              ) : (
                <div className={`text-3xl font-bold ${color}`}>{(value ?? 0).toLocaleString()}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Views chart */}
      <Card className="rounded-2xl border-gray-100 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-[#3B0764]" />
              <CardTitle className="text-sm font-semibold text-gray-700">Page Views — Last {period} Days</CardTitle>
            </div>
            {analytics && <span className="text-xs text-gray-400">Peak: {maxViews.toLocaleString()} views/day</span>}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-16 flex items-end gap-0.5">
              {Array.from({ length: 30 }).map((_, i) => (
                <div key={i} className="flex-1 bg-gray-100 rounded-t-sm animate-pulse" style={{ height: `${20 + Math.random() * 60}%` }} />
              ))}
            </div>
          ) : analytics?.byDay.length ? (
            <>
              <BarChartMini data={analytics.byDay} max={maxViews} />
              <div className="flex justify-between text-[10px] text-gray-400 mt-1.5">
                <span>{analytics.byDay[0]?.date}</span>
                <span>{analytics.byDay[analytics.byDay.length - 1]?.date}</span>
              </div>
            </>
          ) : (
            <div className="h-16 flex items-center justify-center text-sm text-gray-400">
              No data yet — views will appear here once your site is live.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bottom row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Referrers */}
        <Card className="rounded-2xl border-gray-100 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-[#C97B2B]" />
              <CardTitle className="text-sm font-semibold text-gray-700">Top Traffic Sources</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex flex-col gap-2">
                {[1,2,3].map(i => <Skeleton key={i} className="h-8 rounded-lg" />)}
              </div>
            ) : analytics?.topReferrers.length ? (
              <div className="flex flex-col gap-2">
                {analytics.topReferrers.map(({ referrer, count }) => {
                  const maxRef = analytics.topReferrers[0]?.count ?? 1;
                  const pct = Math.round((count / maxRef) * 100);
                  return (
                    <div key={referrer} className="relative flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 overflow-hidden">
                      <div
                        className="absolute inset-0 bg-[#C97B2B]/8 rounded-lg"
                        style={{ width: `${pct}%` }}
                      />
                      <span className="relative text-xs font-medium text-gray-700 truncate flex-1">
                        {referrer === "direct" ? "Direct / No referrer" : referrer}
                      </span>
                      <span className="relative text-xs font-bold text-[#C97B2B] shrink-0">{count.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-4">No referrer data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Top Pages */}
        <Card className="rounded-2xl border-gray-100 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#3B0764]" />
              <CardTitle className="text-sm font-semibold text-gray-700">Top Pages</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex flex-col gap-2">
                {[1,2,3].map(i => <Skeleton key={i} className="h-8 rounded-lg" />)}
              </div>
            ) : analytics?.topPaths.length ? (
              <div className="flex flex-col gap-2">
                {analytics.topPaths.map(({ path, count }) => {
                  const maxP = analytics.topPaths[0]?.count ?? 1;
                  const pct = Math.round((count / maxP) * 100);
                  return (
                    <div key={path} className="relative flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 overflow-hidden">
                      <div
                        className="absolute inset-0 bg-[#3B0764]/8 rounded-lg"
                        style={{ width: `${pct}%` }}
                      />
                      <span className="relative text-xs font-mono text-gray-600 truncate flex-1">{path || "/"}</span>
                      <span className="relative text-xs font-bold text-[#3B0764] shrink-0">{count.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-4">No page data yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* No data / not published note */}
      {!loading && !error && !website.published && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Your site isn't published yet</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Analytics are tracked on live pages. Publish your site to start collecting visitor data.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
