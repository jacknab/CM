/**
 * Shows an AI-designed website (owner, 2026-11-09; plans/ai-website-builder.md): loads the design and the facts it
 * shows — a private preview with ?aiPreview=<token>, else the version that is online — and draws it on the AI
 * Foundation (AiFoundationTheme.tsx, a copy of the Solo template wired to Certxa's services, booking and shop).
 */
import { useEffect, useState } from "react";
import type { StoreData } from "./types";
import AiFoundationTheme from "./AiFoundationTheme";
import type { AiFacts, AiSpec } from "./AiSiteTheme";

export default function AiSite({ store, slug, token, preselectedStaffId, preselectedServiceId }: {
  store: StoreData; slug: string; token?: string | null; preselectedStaffId?: number; preselectedServiceId?: number;
}) {
  const [data, setData] = useState<{ spec: AiSpec; facts: AiFacts } | null>(null);
  const [failed, setFailed] = useState("");
  useEffect(() => {
    fetch(`/api/public/store/${encodeURIComponent(slug)}/ai-site${token ? `?preview=${encodeURIComponent(token)}` : ""}`)
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.error ?? "This site could not be opened."); setData(j); })
      .catch((e) => setFailed(e?.message ?? "This site could not be opened."));
  }, [slug, token]);
  if (failed) return <div className="flex min-h-screen items-center justify-center p-6 text-center text-gray-700">{failed}</div>;
  if (!data) return <div className="flex min-h-screen items-center justify-center text-gray-500">{token ? "Loading your preview…" : "Loading…"}</div>;
  // The design's accent also drives Solo's own accent (SiteLook --site-accent) inside the foundation.
  const themed = { ...store, bookingSite: { ...(store as any).bookingSite, accent: data.spec.theme.palette.accent } } as StoreData;
  return <AiFoundationTheme store={themed} slug={slug} preselectedStaffId={preselectedStaffId} preselectedServiceId={preselectedServiceId}
    ai={{ spec: data.spec, facts: data.facts, preview: !!token }} />;
}
