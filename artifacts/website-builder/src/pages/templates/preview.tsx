import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetTemplate, useListWebsites, getGetTemplateQueryKey, getListWebsitesQueryKey } from "@workspace/api-client-react";
import { Monitor, Smartphone, ArrowLeft, Database, Store } from "lucide-react";

interface WebsiteBuilderContext {
  storeId: string | null;
  isAdmin?: boolean;
}

export default function TemplatePreview() {
  const [, params] = useRoute("/templates/:id/preview");
  const [, navigate] = useLocation();
  const id = Number(params?.id);

  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [builderContext, setBuilderContext] = useState<WebsiteBuilderContext | null>(null);
  const [contextLoading, setContextLoading] = useState(true);

  const { data: template } = useGetTemplate(id, {
    query: { queryKey: getGetTemplateQueryKey(id), enabled: !!id },
  });

  // Resolve the salon from the server before creating the iframe URL. Reading
  // sessionStorage here races App.tsx's context request and used to produce a
  // raw template URL, which renders the template's hardcoded demo data.
  useEffect(() => {
    let active = true;
    fetch("/api/website-builder/context", { credentials: "include" })
      .then((response) => (response.ok ? response.json() as Promise<WebsiteBuilderContext> : null))
      .then((context) => {
        if (active) setBuilderContext(context);
      })
      .catch(() => {
        if (active) setBuilderContext(null);
      })
      .finally(() => {
        if (active) setContextLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Fetch websites scoped by the API to the authenticated salon. Admin
  // sessions may receive multiple websites, so prefer the current salon when
  // the context endpoint provides one.
  const { data: websites, isLoading: websitesLoading } = useListWebsites();
  const storeid = builderContext?.storeId ?? null;
  const selectedWebsite = websites?.find(
    (website) => storeid && String(website.storeid ?? "") === storeid
  ) ?? (builderContext ? websites?.[0] : undefined);
  const userWebsiteId = selectedWebsite?.id;
  const previewReady = !contextLoading && !websitesLoading && !!builderContext;

  // Build the preview URL:
  //   1. If user has a website → ?websiteId=X (uses saved content + injected live data)
  //   2. If no website but storeid exists → ?storeId=X (intercepts template's data fetch)
  //   3. If neither exists, keep the iframe out of the raw template so demo
  //      data can never be mistaken for the salon's live preview.
  const previewUrl = previewReady
    ? userWebsiteId
      ? `/api/templates/${id}/preview?websiteId=${userWebsiteId}`
      : storeid
        ? `/api/templates/${id}/preview?storeId=${storeid}`
        : null
    : null;

  const hasLiveData = !!userWebsiteId || !!storeid;

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-100 z-50">
      {/* ── Top bar ── */}
      <div className="h-12 shrink-0 bg-white border-b border-gray-200 flex items-center px-4 gap-3 shadow-sm">
        {/* Back */}
        <button
          onClick={() => navigate("/templates")}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors pr-3 border-r border-gray-200"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        {/* Template name */}
        <span className="flex-1 text-sm font-semibold text-gray-800 truncate">
          {template?.name ?? "Template Preview"}
        </span>

        {/* Data source badge */}
        {hasLiveData && (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#3B0764] bg-[#3B0764]/5 border border-[#3B0764]/10 px-2.5 py-1 rounded-full">
            <Store className="w-3 h-3" />
            Using your live data
          </span>
        )}

        {/* Device toggle */}
        <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
          <button
            onClick={() => setDevice("desktop")}
            title="Desktop view"
            className={`flex items-center justify-center w-9 h-8 transition-colors ${
              device === "desktop"
                ? "bg-[#1B6EF0] text-white"
                : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            <Monitor className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDevice("mobile")}
            title="Mobile view"
            className={`flex items-center justify-center w-9 h-8 border-l border-gray-200 transition-colors ${
              device === "mobile"
                ? "bg-[#1B6EF0] text-white"
                : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            <Smartphone className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Preview area ── */}
      <div
        className={`flex-1 overflow-auto ${device === "mobile" ? "bg-gray-200" : "bg-white"}`}
      >
        {!previewUrl && (
          <div className="h-full flex items-center justify-center p-8 text-center text-gray-500">
            {contextLoading || websitesLoading
              ? "Loading your salon data…"
              : "No salon is connected to this website builder session."}
          </div>
        )}
        {device === "desktop" ? (
          previewUrl ? (
            <iframe
              key={previewUrl}
              src={previewUrl}
              className="w-full h-full border-none"
              title="Template preview"
            />
          ) : null
        ) : (
          <div className="flex items-start justify-center py-6 min-h-full">
            {previewUrl ? (
              <div
                className="rounded-[2.5rem] border-4 border-gray-800 shadow-2xl overflow-hidden bg-white shrink-0"
                style={{ width: 390 }}
              >
                {/* Phone notch bar */}
                <div className="h-6 bg-gray-800 flex items-center justify-center">
                  <div className="w-20 h-3 bg-gray-700 rounded-full" />
                </div>
                <iframe
                  key={previewUrl}
                  src={previewUrl}
                  className="w-full border-none block"
                  style={{ height: "80vh" }}
                  title="Template preview (mobile)"
                />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
