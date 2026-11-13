/**
 * Kiosk Builder (plans/kiosk-builder.md) — the owner shapes the self check-in kiosk: starting design, look,
 * welcome screen, steps, rules and words, with a live preview of the kiosk beside it.
 *
 * Every change saves to the draft by itself (PUT /api/kiosk-builder/draft) and the preview reloads it; the
 * kiosk in the salon changes only when the owner publishes. Published versions are kept: History loads any of
 * them back into the draft.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUp, ExternalLink, FolderOpen, History, Loader2, Upload } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { translations } from "@/lib/kioskTranslations";
import {
  KIOSK_LIMITS, normalizeSteps, type KioskLayout, type KioskStepId, type KioskThemeColors,
} from "@shared/kiosk/layout";
import type { BusinessType, BusinessTypeKey } from "@shared/kiosk/businessTypes";
import { KIOSK_LANG_CODES, type KioskLang, type KioskTextKey } from "@shared/kiosk/text";
import type { KioskPreviewTarget } from "@/pages/KioskCheckIn";
import { ScreensEditor, type CatalogAddon, type CatalogCategory, type CatalogService } from "@/pages/kiosk-builder/ScreensEditor";

interface BuilderState {
  businessType: BusinessType;
  draft: KioskLayout;
  draftSavedAt: string | null;
  published: KioskLayout;
  publishedVersion: number | null;
  unpublishedChanges: boolean;
  businessTypes?: BusinessType[];
  presets?: Array<{ key: BusinessTypeKey; name: string; description: string }>;
  textKeys?: KioskTextKey[];
}
interface ConfigRow { id: number; name: string; source: "saved" | "imported"; createdAt: string; updatedAt: string }
interface ImportResult { name: string; unmatched: { services: string[]; addons: string[] } }
interface VersionRow { version: number; status: "published" | "archived"; note: string | null; publishedAt: string }

const LANG_NAMES: Record<KioskLang, string> = { en: "English", es: "Español", vi: "Tiếng Việt", zh: "中文", ko: "한국어" };

const STEP_INFO: Record<KioskStepId, { name: string; about: string }> = {
  category: { name: "Categories", about: "Big cards for each service category. Off: one list of every service." },
  services: { name: "Services", about: "The service list. Always on." },
  questions: { name: "Service questions", about: "Questions a service asks, such as nail length, shape and design." },
  addons: { name: "Add-ons", about: "Extras for the chosen service." },
  provider: { name: "Choose staff", about: "Clients pick who does the service, or the next available." },
};

const COLOR_INFO: Array<{ key: keyof KioskThemeColors; name: string }> = [
  { key: "primary", name: "Buttons and highlights" },
  { key: "background", name: "Background" },
  { key: "surface", name: "Cards and bars" },
  { key: "text", name: "Text" },
];

/** Each look's own colours (KioskCheckIn.tsx palettes), shown until the business picks its own. */
const LOOK_COLORS: Record<"classic" | "boutique", Required<KioskThemeColors>> = {
  classic: { primary: "#e84891", background: "#f5f3ff", surface: "#ffffff", text: "#18111a" },
  boutique: { primary: "#b9785c", background: "#f7ede6", surface: "#fffaf6", text: "#3b2a26" },
};

const PREVIEW_SCREENS: Array<{ target: KioskPreviewTarget; name: string }> = [
  { target: "welcome", name: "Welcome" },
  { target: "phone", name: "Phone" },
  { target: "category", name: "Categories" },
  { target: "services", name: "Services" },
  { target: "addons", name: "Add-ons" },
  { target: "provider", name: "Staff" },
  { target: "review", name: "Review" },
  { target: "ticket", name: "Ticket" },
];

const FRAMES = {
  landscape: { w: 1280, h: 800, name: "Tablet" },
  portrait: { w: 720, h: 1280, name: "15\" kiosk" },
} as const;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: "include", ...init });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || d.message || "Something went wrong");
  return d as T;
}

/** What a sentence says today, in English, when the business hasn't written its own. */
function defaultEnglish(k: KioskTextKey): string {
  const builtIn = (translations.en as any)[k.key];
  if (typeof builtIn === "function") return builtIn("{name}");
  return builtIn ?? k.english ?? "";
}

function Section({ title, about, children }: { title: string; about?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
      <div>
        <h2 className="font-semibold text-slate-800">{title}</h2>
        {about && <p className="text-sm text-slate-500 mt-0.5">{about}</p>}
      </div>
      {children}
    </section>
  );
}

function Row({ label, about, children }: { label: string; about?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {about && <p className="text-xs text-slate-500">{about}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const selectClass = "h-9 rounded-md border border-slate-200 bg-white px-2 text-sm";

export default function KioskBuilder() {
  const { toast } = useToast();
  const [state, setState] = useState<BuilderState | null>(null);
  const [draft, setDraft] = useState<KioskLayout | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [frame, setFrame] = useState<keyof typeof FRAMES>("landscape");
  const [openLang, setOpenLang] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishNote, setPublishNote] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [confirm, setConfirm] = useState<null | { title: string; body: string; run: () => Promise<void> }>(null);
  const [presetPick, setPresetPick] = useState<BusinessTypeKey | "">("");
  const [tab, setTab] = useState<"settings" | "screens">("settings");
  // Saved configurations (named designs to load, export, import).
  const [configsOpen, setConfigsOpen] = useState(false);
  const [configs, setConfigs] = useState<ConfigRow[] | null>(null);
  const [configName, setConfigName] = useState("");
  const [configBusy, setConfigBusy] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  // The salon's catalog as its kiosk sees it, for the screen editor.
  const [catalog, setCatalog] = useState<{ services: CatalogService[]; categories: CatalogCategory[]; addons: CatalogAddon[]; storeName: string } | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSeq = useRef(0);

  // ── Load ──
  useEffect(() => {
    Promise.all([
      api<BuilderState>("/api/kiosk-builder"),
      api<{ bookingSlug: string | null }>("/api/kiosk-settings"),
    ]).then(([b, k]) => {
      setState(b); setDraft(b.draft); setSlug(k.bookingSlug);
    }).catch((e) => setLoadError(e.message));
  }, []);
  useEffect(() => {
    if (!slug || tab !== "screens" || catalog) return;
    api<any>(`/api/public/kiosk/${slug}/config?preview=draft`)
      .then((d) => setCatalog({ services: d.services ?? [], categories: d.categories ?? [], addons: d.addons ?? [], storeName: d.store?.name ?? "" }))
      .catch((e) => toast({ title: "Couldn't load your services", description: e.message, variant: "destructive" }));
  }, [slug, tab, catalog, toast]);
  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const fd = new FormData();
      fd.append("image", file);
      return (await api<{ url: string }>("/api/kiosk-builder/image", { method: "POST", body: fd })).url;
    } catch (e: any) {
      toast({ title: "Couldn't upload the picture", description: e.message, variant: "destructive" });
      return null;
    }
  };

  // ── Preview ──
  const postToPreview = useCallback((msg: object) => {
    iframeRef.current?.contentWindow?.postMessage(msg, window.location.origin);
  }, []);

  useEffect(() => {
    const box = previewBoxRef.current;
    if (!box) return;
    const fit = () => {
      const f = FRAMES[frame];
      setScale(Math.min(box.clientWidth / f.w, box.clientHeight / f.h, 1));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [frame, state, tab]);

  // ── Save (every change, after a short pause) ──
  const applyState = (b: BuilderState) => setState((s) => ({ ...s, ...b }));
  const draftRef = useRef<KioskLayout | null>(null);
  draftRef.current = draft;
  const update = (change: (d: KioskLayout) => KioskLayout) => {
    const d = draftRef.current;
    if (!d) return;
    const next = change(structuredClone(d));
    draftRef.current = next;
    setDraft(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving("saving");
    saveTimer.current = setTimeout(async () => {
      saveTimer.current = null;
      const seq = ++saveSeq.current;
      try {
        const b = await api<BuilderState>("/api/kiosk-builder/draft", {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ layout: next }),
        });
        if (seq !== saveSeq.current) return;
        applyState(b); setSaving("saved"); setSaveError("");
        postToPreview({ type: "kiosk-preview-refresh" });
      } catch (e: any) {
        if (seq !== saveSeq.current) return;
        setSaving("error"); setSaveError(e.message);
      }
    }, 600);
  };

  // Replaces the whole draft from the server's answer (reset, restore).
  const takeServerDraft = (b: BuilderState) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveSeq.current++;
    applyState(b); setDraft(b.draft); setSaving("saved"); setSaveError("");
    postToPreview({ type: "kiosk-preview-refresh" });
  };

  const publish = async () => {
    setPublishing(true);
    try {
      // Make sure the last change is saved first.
      if (saveTimer.current && draftRef.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        saveSeq.current++;
        applyState(await api<BuilderState>("/api/kiosk-builder/draft", {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ layout: draftRef.current }),
        }));
      }
      const b = await api<BuilderState & { version: number }>("/api/kiosk-builder/publish", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: publishNote }),
      });
      applyState(b); setSaving("saved");
      setPublishOpen(false); setPublishNote(""); setVersions(null);
      toast({ title: `Version ${b.version} is live`, description: "Your kiosk shows it the next time it's idle." });
    } catch (e: any) {
      toast({ title: "Couldn't publish", description: e.message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  const loadConfigs = async () => {
    try { setConfigs((await api<{ configs: ConfigRow[] }>("/api/kiosk-builder/configs")).configs); }
    catch (e: any) { toast({ title: "Couldn't load your configurations", description: e.message, variant: "destructive" }); }
  };
  const openConfigs = () => { setConfigsOpen(true); setImportResult(null); void loadConfigs(); };
  const saveConfig = async () => {
    if (!configName.trim()) return;
    setConfigBusy(true);
    try {
      // The design as it is on screen right now.
      if (saveTimer.current && draftRef.current) {
        clearTimeout(saveTimer.current); saveTimer.current = null; saveSeq.current++;
        applyState(await api<BuilderState>("/api/kiosk-builder/draft", {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ layout: draftRef.current }),
        }));
        setSaving("saved");
      }
      const { config } = await api<{ config: ConfigRow }>("/api/kiosk-builder/configs", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: configName }),
      });
      setConfigName("");
      toast({ title: `Saved as "${config.name}"` });
      await loadConfigs();
    } catch (e: any) {
      toast({ title: "Couldn't save the configuration", description: e.message, variant: "destructive" });
    } finally { setConfigBusy(false); }
  };
  const importConfig = async (fileObj: File) => {
    setConfigBusy(true); setImportResult(null);
    try {
      if (fileObj.size > 2 * 1024 * 1024) throw new Error("That file is too big for a kiosk configuration (2 MB at most).");
      let file: unknown;
      try { file = JSON.parse(await fileObj.text()); } catch { throw new Error("This isn't a Certxa kiosk configuration file."); }
      const r = await api<{ config: ConfigRow; unmatched: ImportResult["unmatched"] }>("/api/kiosk-builder/configs/import", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file }),
      });
      setImportResult({ name: r.config.name, unmatched: r.unmatched });
      await loadConfigs();
    } catch (e: any) {
      toast({ title: "Couldn't import the file", description: e.message, variant: "destructive" });
    } finally { setConfigBusy(false); }
  };
  const renameConfig = async () => {
    if (!renaming?.name.trim()) return;
    try {
      await api(`/api/kiosk-builder/configs/${renaming.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: renaming.name }) });
      setRenaming(null); await loadConfigs();
    } catch (e: any) { toast({ title: "Couldn't rename it", description: e.message, variant: "destructive" }); }
  };

  const openHistory = async () => {
    setHistoryOpen(true);
    try { setVersions((await api<{ versions: VersionRow[] }>("/api/kiosk-builder/versions")).versions); }
    catch (e: any) { toast({ title: "Couldn't load the history", description: e.message, variant: "destructive" }); }
  };

  const uploadWelcome = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const { url } = await api<{ url: string }>("/api/kiosk-builder/image", { method: "POST", body: fd });
      update((d) => ({ ...d, welcome: { ...d.welcome, imageUrl: url } }));
      postToPreview({ type: "kiosk-preview-goto", target: "welcome" });
    } catch (e: any) {
      toast({ title: "Couldn't upload the picture", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const textKeys = state?.textKeys ?? [];
  const presetName = useMemo(
    () => (k: BusinessTypeKey) => state?.presets?.find((p) => p.key === k)?.name ?? k,
    [state?.presets],
  );

  if (loadError) {
    return (
      <AppLayout>
        <div className="max-w-xl mx-auto p-8 text-center space-y-3">
          <p className="text-slate-700">{loadError}</p>
          <Link to="/settings/kiosk" className="text-sm underline text-slate-600">Back to Check-in & Kiosk</Link>
        </div>
      </AppLayout>
    );
  }
  if (!state || !draft) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center gap-2 text-slate-500 py-24"><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>
      </AppLayout>
    );
  }

  const middle = draft.steps.filter((s) => s.id !== "category" && s.id !== "services");
  const moveStep = (id: KioskStepId, dir: -1 | 1) => update((d) => {
    const rest = d.steps.filter((s) => s.id !== "category" && s.id !== "services");
    const i = rest.findIndex((s) => s.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= rest.length) return d;
    [rest[i], rest[j]] = [rest[j], rest[i]];
    return { ...d, steps: normalizeSteps([d.steps[0], d.steps[1], ...rest]) };
  });
  const setStep = (id: KioskStepId, enabled: boolean) =>
    update((d) => ({ ...d, steps: d.steps.map((s) => (s.id === id ? { ...s, enabled } : s)) }));
  const setText = (key: string, lang: KioskLang, value: string) => update((d) => {
    const t = { ...(d.text[key] ?? {}) };
    if (value.trim()) t[lang] = value; else delete t[lang];
    const text = { ...d.text };
    if (Object.keys(t).length) text[key] = t; else delete text[key];
    return { ...d, text };
  });
  const minuteChoices: number[] = [];
  for (let m = KIOSK_LIMITS.maxVisitMinutes.min; m <= KIOSK_LIMITS.maxVisitMinutes.max; m += 30) minuteChoices.push(m);
  const fmtMinutes = (m: number) => (m < 60 ? `${m} min` : `${m / 60} ${m === 60 ? "hour" : "hours"}`);
  const previewUrl = slug ? `/kiosk/${slug}?preview=draft` : null;
  const f = FRAMES[frame];

  return (
    <AppLayout fullHeight>
      <div className="h-full flex flex-col bg-slate-50">
        {/* ── Top bar ── */}
        <div className="shrink-0 flex flex-wrap items-center gap-3 px-5 py-3 border-b border-slate-200 bg-white">
          <Link to="/settings/kiosk" className="text-slate-500 hover:text-slate-800" aria-label="Back"><ArrowLeft className="w-5 h-5" /></Link>
          <div className="min-w-0">
            <h1 className="font-semibold text-slate-900 leading-tight">Kiosk Builder</h1>
            <p className="text-xs text-slate-500">
              {state.publishedVersion
                ? `Live: version ${state.publishedVersion}`
                : `Live: the ${presetName(state.published.preset)} design (not changed yet)`}
              {state.unpublishedChanges ? " · You have changes that aren't live yet" : ""}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-slate-500" data-testid="kiosk-builder-save-status">
              {saving === "saving" ? "Saving…" : saving === "saved" ? "Draft saved" : saving === "error" ? "Not saved" : ""}
            </span>
            <Button variant="outline" size="sm" onClick={openConfigs} className="gap-1.5" data-testid="kiosk-builder-configs"><FolderOpen className="w-4 h-4" /> Configurations</Button>
            <Button variant="outline" size="sm" onClick={openHistory} className="gap-1.5"><History className="w-4 h-4" /> History</Button>
            <Button size="sm" disabled={!state.unpublishedChanges || saving === "saving" || saving === "error"} onClick={() => setPublishOpen(true)}
              data-testid="kiosk-builder-publish">
              Publish
            </Button>
          </div>
        </div>
        {saveError && (
          <div className="shrink-0 px-5 py-2 text-sm text-red-700 bg-red-50 border-b border-red-200">{saveError}</div>
        )}
        <div className="shrink-0 flex gap-1 px-5 pt-2 border-b border-slate-200 bg-white">
          {([["settings", "Settings"], ["screens", "Screens"]] as const).map(([k, name]) => (
            <button key={k} type="button" onClick={() => setTab(k)} data-testid={`kiosk-builder-tab-${k}`}
              className={`px-3 pb-2 text-sm border-b-2 -mb-px ${tab === k ? "border-slate-900 text-slate-900 font-medium" : "border-transparent text-slate-500"}`}>
              {name}
            </button>
          ))}
        </div>

        {tab === "screens" ? (
          <div className="flex-1 min-h-0">
            {catalog
              ? <ScreensEditor draft={draft} update={update} services={catalog.services} categories={catalog.categories} addons={catalog.addons} storeName={catalog.storeName} uploadImage={uploadImage} />
              : <div className="flex items-center justify-center gap-2 text-slate-500 py-24"><Loader2 className="w-5 h-5 animate-spin" /> Loading your services…</div>}
          </div>
        ) : (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* ── Settings ── */}
          <div className="lg:w-[440px] shrink-0 overflow-y-auto p-4 space-y-4 border-r border-slate-200">
            <Section title="Starting design" about={`Your kiosk is based on the ${presetName(draft.preset)} design. Starting over replaces your draft.`}>
              <div className="flex gap-2">
                <select className={`${selectClass} flex-1 min-w-0 w-0`} value={presetPick} onChange={(e) => setPresetPick(e.target.value as BusinessTypeKey)}
                  data-testid="kiosk-builder-preset">
                  <option value="">Choose a design…</option>
                  {state.presets?.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
                </select>
                <Button variant="outline" size="sm" className="h-9" disabled={!presetPick} onClick={() => presetPick && setConfirm({
                  title: `Start over from ${presetName(presetPick)}?`,
                  body: "Your draft is replaced by this design. The kiosk in your salon doesn't change until you publish.",
                  run: async () => {
                    takeServerDraft(await api<BuilderState>("/api/kiosk-builder/reset", {
                      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preset: presetPick }),
                    }));
                    setPresetPick("");
                  },
                })}>Use</Button>
              </div>
              {presetPick && <p className="text-xs text-slate-500">{state.presets?.find((p) => p.key === presetPick)?.description}</p>}
            </Section>

            <Section title="Look">
              <div className="grid grid-cols-2 gap-2">
                {([["classic", "Classic", "Lavender and rose"], ["boutique", "Boutique", "Cream and copper, serif headings"]] as const).map(([key, name, about]) => (
                  <button key={key} type="button" onClick={() => update((d) => ({ ...d, theme: { ...d.theme, look: key } }))}
                    className={`text-left rounded-xl border p-3 ${draft.theme.look === key ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200"}`}>
                    <p className="text-sm font-medium text-slate-800">{name}</p>
                    <p className="text-xs text-slate-500">{about}</p>
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                {COLOR_INFO.map(({ key, name }) => {
                  const v = draft.theme.colors[key];
                  return (
                    <Row key={key} label={name} about={v ? undefined : "The look's own colour"}>
                      <div className="flex items-center gap-2">
                        <input type="color" aria-label={name} value={v ?? LOOK_COLORS[draft.theme.look][key]} className="w-9 h-9 rounded border border-slate-200 bg-white p-0.5"
                          onChange={(e) => update((d) => ({ ...d, theme: { ...d.theme, colors: { ...d.theme.colors, [key]: e.target.value } } }))} />
                        {v && (
                          <button type="button" className="text-xs text-slate-500 underline"
                            onClick={() => update((d) => { const colors = { ...d.theme.colors }; delete colors[key]; return { ...d, theme: { ...d.theme, colors } }; })}>
                            Reset
                          </button>
                        )}
                      </div>
                    </Row>
                  );
                })}
              </div>
            </Section>

            <Section title="Welcome screen" about="The picture fills the whole screen. A tall picture (9:16) suits a standing kiosk.">
              <div className="flex items-center gap-3">
                <div className="w-16 h-24 rounded-lg border border-slate-200 bg-slate-100 overflow-hidden shrink-0">
                  {draft.welcome.imageUrl
                    ? <img src={draft.welcome.imageUrl} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400 text-center px-1">Certxa's picture</div>}
                </div>
                <div className="flex flex-col gap-2 items-start">
                  <label className="inline-flex items-center gap-1.5 text-sm border border-slate-200 rounded-md px-3 h-9 cursor-pointer bg-white hover:bg-slate-50">
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {draft.welcome.imageUrl ? "Replace picture" : "Upload picture"}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploading}
                      onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadWelcome(file); e.target.value = ""; }} />
                  </label>
                  {draft.welcome.imageUrl && (
                    <button type="button" className="text-xs text-slate-500 underline"
                      onClick={() => update((d) => ({ ...d, welcome: { ...d.welcome, imageUrl: null } }))}>Use Certxa's picture</button>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700 mb-2">Language buttons</p>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {KIOSK_LANG_CODES.map((code) => (
                    <label key={code} className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                      <input type="checkbox" disabled={code === "en"} checked={draft.welcome.languages.includes(code)}
                        onChange={(e) => update((d) => ({ ...d, welcome: { ...d.welcome,
                          languages: KIOSK_LANG_CODES.filter((c) => (c === code ? e.target.checked : d.welcome.languages.includes(c))) } }))} />
                      {LANG_NAMES[code]}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-1.5">English is always there. With only English, no buttons show.</p>
              </div>
            </Section>

            <Section title="Steps" about="What clients go through after typing their phone number, before the review.">
              <div className="space-y-3">
                {(["category", "services"] as KioskStepId[]).map((id) => {
                  const s = draft.steps.find((x) => x.id === id)!;
                  return (
                    <Row key={id} label={STEP_INFO[id].name} about={STEP_INFO[id].about}>
                      {id === "services" ? <span className="text-xs text-slate-500">Always on</span>
                        : <Switch checked={s.enabled} onCheckedChange={(v) => setStep(id, v)} aria-label={STEP_INFO[id].name} />}
                    </Row>
                  );
                })}
                <p className="text-xs text-slate-500 pt-1">Then, in this order:</p>
                {middle.map((s, i) => (
                  <Row key={s.id} label={STEP_INFO[s.id].name} about={STEP_INFO[s.id].about}>
                    <div className="flex items-center gap-1">
                      <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => moveStep(s.id, -1)}
                        className="p-1 text-slate-500 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                      <button type="button" aria-label="Move down" disabled={i === middle.length - 1} onClick={() => moveStep(s.id, 1)}
                        className="p-1 text-slate-500 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                      <Switch checked={s.enabled} onCheckedChange={(v) => setStep(s.id, v)} aria-label={STEP_INFO[s.id].name} />
                    </div>
                  </Row>
                ))}
                <p className="text-xs text-slate-500">A step with nothing to show for a client (no add-ons for that service, no staff in) is skipped.</p>
              </div>
            </Section>

            <Section title="Rules">
              <div className="space-y-3">
                <Row label="Services per check-in">
                  <select className={selectClass} value={draft.services.maxServices}
                    onChange={(e) => update((d) => ({ ...d, services: { ...d.services, maxServices: Number(e.target.value) } }))}>
                    {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Row>
                <Row label="Longest visit" about="With more than one service">
                  <select className={selectClass} value={draft.services.maxVisitMinutes}
                    onChange={(e) => update((d) => ({ ...d, services: { ...d.services, maxVisitMinutes: Number(e.target.value) } }))}>
                    {minuteChoices.map((m) => <option key={m} value={m}>{fmtMinutes(m)}</option>)}
                  </select>
                </Row>
                <Row label="Show prices">
                  <Switch checked={draft.services.showPrice} onCheckedChange={(v) => update((d) => ({ ...d, services: { ...d.services, showPrice: v } }))} />
                </Row>
                <Row label="Show how long services take">
                  <Switch checked={draft.services.showDuration} onCheckedChange={(v) => update((d) => ({ ...d, services: { ...d.services, showDuration: v } }))} />
                </Row>
                <Row label="Smart Check-In" about="Suggests a returning client's usual or due service">
                  <Switch checked={draft.smartCheckin} onCheckedChange={(v) => update((d) => ({ ...d, smartCheckin: v }))} />
                </Row>
                <Row label="Ticket screen stays for">
                  <select className={selectClass} value={draft.timing.ticketResetSeconds}
                    onChange={(e) => update((d) => ({ ...d, timing: { ticketResetSeconds: Number(e.target.value) } }))}>
                    {[10, 15, 20, 30, 45, 60, 90, 120].map((n) => <option key={n} value={n}>{n} seconds</option>)}
                  </select>
                </Row>
              </div>
            </Section>

            <Section title="Words" about="Leave a box empty to keep the kiosk's own words. A language you don't fill in shows your English.">
              <div className="space-y-4">
                {textKeys.map((k) => {
                  const own = draft.text[k.key] ?? {};
                  const open = openLang === k.key;
                  const translated = KIOSK_LANG_CODES.filter((l) => l !== "en" && own[l]).length;
                  return (
                    <div key={k.key} className="space-y-1.5">
                      <p className="text-sm font-medium text-slate-700">{k.label}</p>
                      <Input value={own.en ?? ""} maxLength={k.max} placeholder={defaultEnglish(k)}
                        onChange={(e) => setText(k.key, "en", e.target.value)} data-testid={`kiosk-text-${k.key}`} />
                      {k.placeholders?.length ? <p className="text-xs text-slate-500">{"{name}"} becomes the client's first name.</p> : null}
                      <button type="button" className="text-xs text-slate-500 underline" onClick={() => setOpenLang(open ? null : k.key)}>
                        {open ? "Hide other languages" : `Other languages${translated ? ` (${translated} written)` : ""}`}
                      </button>
                      {open && (
                        <div className="space-y-1.5 pl-3 border-l border-slate-200">
                          {KIOSK_LANG_CODES.filter((l) => l !== "en").map((l) => (
                            <div key={l} className="flex items-center gap-2">
                              <span className="w-20 shrink-0 text-xs text-slate-500">{LANG_NAMES[l]}</span>
                              <Input value={own[l] ?? ""} maxLength={k.max} className="h-8 text-sm"
                                placeholder={own.en ? "Shows your English" : "The kiosk's own words"}
                                onChange={(e) => setText(k.key, l, e.target.value)} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          </div>

          {/* ── Preview ── */}
          <div className="flex-1 min-w-0 min-h-[480px] flex flex-col p-4 gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
                {(Object.keys(FRAMES) as Array<keyof typeof FRAMES>).map((k) => (
                  <button key={k} type="button" onClick={() => setFrame(k)}
                    className={`px-3 h-8 text-sm rounded ${frame === k ? "bg-slate-900 text-white" : "text-slate-600"}`}>{FRAMES[k].name}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {PREVIEW_SCREENS.map((p) => (
                  <button key={p.target} type="button" onClick={() => postToPreview({ type: "kiosk-preview-goto", target: p.target })}
                    className="px-2.5 h-8 text-xs rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50">{p.name}</button>
                ))}
              </div>
              {previewUrl && (
                <a href={previewUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-sm text-slate-600 underline">
                  Open full screen <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
            <p className="text-xs text-slate-500">Preview of your draft. Tap through it like a client; nothing here checks anyone in.</p>
            <div ref={previewBoxRef} className="flex-1 min-h-0 flex items-start justify-center overflow-hidden">
              {previewUrl ? (
                <div style={{ width: f.w * scale, height: f.h * scale }} className="relative rounded-xl overflow-hidden border border-slate-300 bg-white shadow-sm">
                  <iframe ref={iframeRef} key={frame} src={previewUrl} title="Kiosk preview" data-testid="kiosk-builder-preview"
                    style={{ width: f.w, height: f.h, transform: `scale(${scale})`, transformOrigin: "0 0", border: 0, position: "absolute", top: 0, left: 0 }} />
                </div>
              ) : (
                <p className="text-sm text-slate-500 pt-10">Set your booking link in Business Settings to preview the kiosk.</p>
              )}
            </div>
          </div>
        </div>
        )}
      </div>

      {/* ── Publish ── */}
      <AlertDialog open={publishOpen} onOpenChange={setPublishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish to your kiosk?</AlertDialogTitle>
            <AlertDialogDescription>
              Your kiosk switches to this design the next time no one is using it. You can go back to any earlier version from History.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input placeholder="Note for History (optional)" maxLength={200} value={publishNote} onChange={(e) => setPublishNote(e.target.value)} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishing}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={publishing} onClick={(e) => { e.preventDefault(); void publish(); }}>
              {publishing ? "Publishing…" : "Publish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Confirm (start over, restore) ── */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              const c = confirm; setConfirm(null);
              try { await c?.run(); } catch (e: any) { toast({ title: "Something went wrong", description: e.message, variant: "destructive" }); }
            }}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Configurations ── */}
      <Sheet open={configsOpen} onOpenChange={setConfigsOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader><SheetTitle>Kiosk configurations</SheetTitle></SheetHeader>
          <p className="text-sm text-slate-500 mt-1">
            Save designs under a name, load one back into your draft, or export one to a file to keep or use at another location.
            Nothing here changes your kiosk until you publish.
          </p>

          <div className="mt-5 space-y-2">
            <p className="text-sm font-medium text-slate-800">Save this design</p>
            <div className="flex gap-2">
              <Input placeholder="Name, e.g. Spring menu" maxLength={60} value={configName} onChange={(e) => setConfigName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void saveConfig(); }} data-testid="config-name" />
              <Button disabled={!configName.trim() || configBusy} onClick={() => void saveConfig()} data-testid="config-save">Save</Button>
            </div>
          </div>

          <div className="mt-5 space-y-2">
            <p className="text-sm font-medium text-slate-800">Import a file</p>
            <label className="inline-flex items-center gap-1.5 text-sm border border-slate-200 rounded-md px-3 h-9 cursor-pointer bg-white hover:bg-slate-50">
              {configBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Choose a .certxa-kiosk.json file
              <input type="file" accept=".json,application/json" className="hidden" disabled={configBusy} data-testid="config-import"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void importConfig(f); e.target.value = ""; }} />
            </label>
            <p className="text-xs text-slate-500">Buttons and tap spots are matched to your own services and add-ons by name.</p>
            {importResult && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 space-y-1" data-testid="config-import-result">
                <p>Imported as "{importResult.name}".</p>
                {importResult.unmatched.services.length + importResult.unmatched.addons.length === 0
                  ? <p className="text-xs text-slate-500">Every button and tap spot found its service.</p>
                  : <>
                      <p className="text-xs text-amber-700">Not on your menu, so those buttons and tap spots were left off:</p>
                      <ul className="text-xs text-slate-600 list-disc pl-4">
                        {[...importResult.unmatched.services, ...importResult.unmatched.addons.map((a) => `${a} (add-on)`)].map((n) => <li key={n}>{n}</li>)}
                      </ul>
                    </>}
              </div>
            )}
          </div>

          <div className="mt-6 space-y-2">
            <p className="text-sm font-medium text-slate-800">Saved</p>
            {configs == null ? <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
              : configs.length === 0 ? <p className="text-sm text-slate-500">No saved configurations yet.</p>
              : configs.map((c) => (
                <div key={c.id} className="border border-slate-200 rounded-xl p-3 space-y-2" data-testid="config-row">
                  {renaming?.id === c.id ? (
                    <div className="flex gap-2">
                      <Input value={renaming.name} maxLength={60} autoFocus onChange={(e) => setRenaming({ id: c.id, name: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") void renameConfig(); if (e.key === "Escape") setRenaming(null); }} />
                      <Button size="sm" onClick={() => void renameConfig()}>Save</Button>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium text-slate-800">{c.name}</p>
                      <p className="text-xs text-slate-500">{c.source === "imported" ? "Imported" : "Saved"} {new Date(c.updatedAt).toLocaleString()}</p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    <Button variant="outline" size="sm" data-testid="config-load" onClick={() => setConfirm({
                      title: `Load "${c.name}" into your draft?`,
                      body: "Your draft is replaced by this configuration. Your kiosk doesn't change until you publish. Save your draft as a configuration first if you want to keep it.",
                      run: async () => { takeServerDraft(await api<BuilderState>(`/api/kiosk-builder/configs/${c.id}/load`, { method: "POST" })); setConfigsOpen(false); },
                    })}>Load</Button>
                    <Button variant="outline" size="sm" asChild data-testid="config-export">
                      <a href={`/api/kiosk-builder/configs/${c.id}/export`} download>Export</a>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setRenaming({ id: c.id, name: c.name })}>Rename</Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirm({
                      title: `Delete "${c.name}"?`,
                      body: "The saved configuration is deleted. Your draft and your kiosk don't change.",
                      run: async () => { await api(`/api/kiosk-builder/configs/${c.id}`, { method: "DELETE" }); await loadConfigs(); },
                    })}>Delete</Button>
                  </div>
                </div>
              ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── History ── */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent>
          <SheetHeader><SheetTitle>History</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-2">
            {versions == null ? <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
              : versions.length === 0 ? <p className="text-sm text-slate-500">Nothing published yet.</p>
              : versions.map((v) => (
                <div key={v.version} className="border border-slate-200 rounded-xl p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">Version {v.version}{v.status === "published" ? " · Live" : ""}</p>
                    <p className="text-xs text-slate-500">{new Date(v.publishedAt).toLocaleString()}</p>
                    {v.note && <p className="text-xs text-slate-600 mt-1">{v.note}</p>}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setConfirm({
                    title: `Load version ${v.version} into your draft?`,
                    body: "Your draft is replaced by this version. Publish it to put it back on your kiosk.",
                    run: async () => { takeServerDraft(await api<BuilderState>(`/api/kiosk-builder/versions/${v.version}/restore`, { method: "POST" })); setHistoryOpen(false); },
                  })}>Load</Button>
                </div>
              ))}
          </div>
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
