import { useListWebsites } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Globe,
  Settings2,
  ExternalLink,
  CheckCircle2,
  Clock,
  Link2,
  LayoutTemplate,
  Copy,
  Check,
} from "lucide-react";
import { Link } from "wouter";
import { useEffect, useState } from "react";

const MAX_WEBSITES = 5;

export default function Settings() {
  const { data: allWebsites, isLoading } = useListWebsites();
  const [copied, setCopied] = useState(false);
  const [storeid, setStoreid] = useState<string | null>(() =>
    typeof window !== "undefined" ? sessionStorage.getItem("storeid") : null
  );

  // Server already scopes websites to the session user's store — no client-side filter needed
  const websites = allWebsites ?? [];

  // Store ID is informational only here; authorization remains server-side.
  // Resolve directly from server context so this page doesn't depend on App.tsx timing.
  useEffect(() => {
    let alive = true;

    const syncFromSession = () => {
      if (!alive || typeof window === "undefined") return;
      setStoreid(sessionStorage.getItem("storeid"));
    };

    syncFromSession();

    fetch("/api/website-builder/context", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { storeId: string | null } | null) => {
        if (!alive || !data) return;
        if (data.storeId) {
          sessionStorage.setItem("storeid", data.storeId);
          setStoreid(data.storeId);
          return;
        }
        sessionStorage.removeItem("storeid");
        setStoreid(null);
      })
      .catch(() => {
        // Keep current session fallback if context fetch fails.
      });

    window.addEventListener("storage", syncFromSession);
    window.addEventListener("certxa:adminChanged", syncFromSession);

    return () => {
      alive = false;
      window.removeEventListener("storage", syncFromSession);
      window.removeEventListener("certxa:adminChanged", syncFromSession);
    };
  }, []);

  const count = websites.length;
  const published = websites.find((w) => w.published);
  const domainsActive = websites.filter((w) => w.customDomainStatus === "active");
  const domainsPending = websites.filter(
    (w) => w.customDomainStatus === "pending_dns" || w.customDomainStatus === "pending_payment"
  );

  const handleCopyStoreId = () => {
    if (!storeid) return;
    navigator.clipboard.writeText(storeid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-3xl mx-auto px-6 lg:px-10 py-12 flex flex-col gap-10">
      {/* Header */}
      <div>
        <h1 className="font-serif text-4xl lg:text-5xl font-bold text-[#3B0764] mb-3">
          Settings
        </h1>
        <p className="text-gray-600 text-lg">
          Manage your store configuration and connected services.
        </p>
      </div>

      {/* Store Info */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-[#3B0764]" />
          Store Info
        </h2>
        <Card className="rounded-2xl border-gray-100 shadow-sm divide-y divide-gray-100 overflow-hidden">
          <div className="px-6 py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-0.5">
                Store ID
              </p>
              <p className="font-mono text-sm text-gray-800 break-all">
                {storeid ?? (
                  <span className="text-gray-400 italic">
                    Loading…
                  </span>
                )}
              </p>
            </div>
            {storeid && (
              <button
                onClick={handleCopyStoreId}
                className="shrink-0 text-gray-400 hover:text-gray-700 transition-colors"
                title="Copy Store ID"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            )}
          </div>

          <div className="px-6 py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-0.5">
                Websites used
              </p>
              <div className="text-sm text-gray-800">
                {isLoading ? (
                  <Skeleton className="h-4 w-16" />
                ) : (
                  <>
                    <span className="font-semibold">{count}</span> of{" "}
                    <span className="font-semibold">{MAX_WEBSITES}</span> sites
                  </>
                )}
              </div>
            </div>
            {!isLoading && (
              <div className="w-32 h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#3B0764] transition-all"
                  style={{ width: `${Math.min((count / MAX_WEBSITES) * 100, 100)}%` }}
                />
              </div>
            )}
          </div>

          <div className="px-6 py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-0.5">
                Live website
              </p>
              {isLoading ? (
                <Skeleton className="h-4 w-40" />
              ) : published ? (
                <div className="flex items-center gap-2">
                  <a
                    href={`https://${published.slug}.certxa.com`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-[#3B0764] hover:underline flex items-center gap-1"
                  >
                    {published.slug}.certxa.com
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">No site published yet</p>
              )}
            </div>
            {published && (
              <Badge className="bg-green-100 text-green-700 border-green-200 shrink-0">
                Live
              </Badge>
            )}
          </div>
        </Card>
      </section>

      {/* Custom Domains */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Link2 className="w-5 h-5 text-[#3B0764]" />
          Custom Domains
        </h2>

        {isLoading ? (
          <Skeleton className="h-24 rounded-2xl" />
        ) : domainsActive.length === 0 && domainsPending.length === 0 ? (
          <Card className="rounded-2xl border-gray-100 shadow-sm px-6 py-8 flex flex-col items-center text-center gap-3">
            <Globe className="w-10 h-10 text-gray-200" />
            <p className="text-gray-500 text-sm">
              No custom domains connected yet.
            </p>
            <p className="text-xs text-gray-400">
              Open any website editor and click{" "}
              <strong className="text-gray-600">Custom Domain</strong> to get started.
            </p>
          </Card>
        ) : (
          <Card className="rounded-2xl border-gray-100 shadow-sm divide-y divide-gray-100 overflow-hidden">
            {domainsActive.map((w) => (
              <div key={w.id} className="px-6 py-4 flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {w.customDomain}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    on{" "}
                    <Link
                      href={`/websites/${w.id}/edit`}
                      className="hover:underline text-[#3B0764]"
                    >
                      {w.name}
                    </Link>
                  </p>
                </div>
                <Badge className="bg-green-100 text-green-700 border-green-200 shrink-0">
                  Active
                </Badge>
              </div>
            ))}
            {domainsPending.map((w) => (
              <div key={w.id} className="px-6 py-4 flex items-center gap-3">
                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {w.customDomain}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    on{" "}
                    <Link
                      href={`/websites/${w.id}/edit`}
                      className="hover:underline text-[#3B0764]"
                    >
                      {w.name}
                    </Link>
                  </p>
                </div>
                <Badge className="bg-amber-50 text-amber-700 border-amber-200 shrink-0">
                  Pending DNS
                </Badge>
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* My Websites quick list */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5 text-[#3B0764]" />
            My Websites
          </h2>
          <Link href="/websites" className="text-sm text-[#3B0764] hover:underline">
            View all
          </Link>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : websites.length === 0 ? (
          <Card className="rounded-2xl border-gray-100 shadow-sm px-6 py-8 flex flex-col items-center text-center gap-3">
            <LayoutTemplate className="w-10 h-10 text-gray-200" />
            <p className="text-gray-500 text-sm">No websites yet.</p>
            <Link href="/templates">
              <span className="text-sm text-[#3B0764] hover:underline font-medium">
                Browse templates →
              </span>
            </Link>
          </Card>
        ) : (
          <Card className="rounded-2xl border-gray-100 shadow-sm divide-y divide-gray-100 overflow-hidden">
            {websites.map((w) => (
              <Link key={w.id} href={`/websites/${w.id}/edit`}>
                <div className="px-6 py-4 flex items-center gap-3 hover:bg-gray-50 transition-colors cursor-pointer">
                  <Globe className="w-4 h-4 text-gray-300 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{w.name}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {w.slug}.certxa.com
                    </p>
                  </div>
                  {w.published ? (
                    <Badge className="bg-green-100 text-green-700 border-green-200 shrink-0">
                      Live
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-gray-100 text-gray-500 border-gray-200 shrink-0">
                      Draft
                    </Badge>
                  )}
                </div>
              </Link>
            ))}
          </Card>
        )}
      </section>

      {/* Support */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-gray-900">Support</h2>
        <Card className="rounded-2xl border-gray-100 shadow-sm divide-y divide-gray-100 overflow-hidden">
          <Link
            href="/support"
            className="px-6 py-4 flex items-center gap-3 hover:bg-gray-50 transition-colors"
          >
            <ExternalLink className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-sm text-gray-700 font-medium">Contact Support</span>
          </Link>
          <Link
            href="/docs"
            className="px-6 py-4 flex items-center gap-3 hover:bg-gray-50 transition-colors"
          >
            <ExternalLink className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-sm text-gray-700 font-medium">Documentation</span>
          </Link>
        </Card>
      </section>
    </div>
  );
}
