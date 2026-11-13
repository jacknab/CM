/**
 * Kiosk Builder › one kiosk configuration (plans/kiosk-builder.md), opened from the start page (KioskConfigsHome).
 * A configuration is made with one builder and keeps it (owner, 2026-11-13): the Easy builder (category cards or
 * button grids made from the catalog) or the Picture builder (the owner's own pictures with tap spots). The tabs
 * are the kiosk's screens; a click on a part of the screen opens its setting.
 *
 * Every change saves to the configuration by itself (PUT /api/kiosk-builder/configs/:id/layout) and the preview
 * (?preview=config-<id>) reloads it; the kiosk changes only when the owner presses "Put on my kiosk".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUp, CircleHelp, ExternalLink, Loader2, Upload } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { translations } from "@/lib/kioskTranslations";
import {
  KIOSK_LIMITS, normalizeSteps, type KioskLayout, type KioskStepId, type KioskThemeColors,
} from "@shared/kiosk/layout";
import type { BusinessType } from "@shared/kiosk/businessTypes";
import { KIOSK_LANG_CODES, type KioskLang, type KioskTextKey } from "@shared/kiosk/text";
import type { KioskPreviewTarget } from "@/pages/KioskCheckIn";
import { ScreensPanel } from "@/pages/kiosk-builder/ScreensPanel";
import { ScreensEditor, withNewScreen, withoutScreen, type CatalogAddon, type CatalogCategory, type CatalogService } from "@/pages/kiosk-builder/ScreensEditor";
import { ExtrasPanel, useKioskExtras } from "@/pages/kiosk-builder/extras";
import { HelpGuide } from "@/pages/kiosk-builder/HelpGuide";
import type { HelpTopicId } from "@/pages/kiosk-builder/help";
import { BUILDERS } from "@/pages/KioskConfigsHome";
import { currentStaffTitle, STAFF_TEXT_KEYS, STAFF_TITLES, staffTextFor } from "@shared/kiosk/presets";

interface ConfigRow { id: number; name: string; builder: "easy" | "picture"; live: boolean; updatedAt: string }
interface ConfigState { config: ConfigRow; layout: KioskLayout; businessType: BusinessType; textKeys: KioskTextKey[] }

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

/** The kiosk Certxa sells: a 15" screen, standing (9:16). The only shape the kiosk is designed and previewed for. */
const FRAMES = {
  portrait: { w: 720, h: 1280, name: "15\" kiosk" },
} as const;

/** The kiosk's screens, in the order clients see them: the editor's tabs. "screens" is the Picture builder's own screens. */
type ScreenKey = "welcome" | "phone" | "categories" | "services" | "screens" | "addons" | "staff" | "review" | "ticket";
const ALL_SCREENS: Array<{ key: ScreenKey; name: string; preview: KioskPreviewTarget; about: string }> = [
  { key: "welcome", name: "Welcome", preview: "welcome", about: "The first thing clients see. A tap anywhere starts the check-in." },
  { key: "phone", name: "Phone number", preview: "phone", about: "Clients type their mobile number." },
  { key: "categories", name: "Categories", preview: "category", about: "Clients choose what kind of service they want." },
  { key: "services", name: "Services", preview: "services", about: "Clients choose their service." },
  { key: "screens", name: "Your screens", preview: "category", about: "Your pictures. Clients tap the spots on them to choose." },
  { key: "addons", name: "Add-ons", preview: "addons", about: "Clients can add extras to their service." },
  { key: "staff", name: "Staff", preview: "provider", about: "Clients choose who does their service." },
  { key: "review", name: "Review", preview: "review", about: "Clients check their visit, then press Check In." },
  { key: "ticket", name: "Ticket", preview: "ticket", about: "Clients see they're checked in." },
];

/** Each builder's tabs: the Picture builder's own screens take the place of Categories and Services. */
const screensFor = (builder: "easy" | "picture") =>
  ALL_SCREENS.filter((x) => (builder === "picture" ? x.key !== "categories" && x.key !== "services" : x.key !== "screens"));

/** One setting on the right. Lights up when the owner clicks its part of the screen. */
function Field({ id, focus, title, about, children }: { id: string; focus: string | null; title: string; about?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const on = focus === id;
  useEffect(() => { if (on) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [on]);
  return (
    <section ref={ref} data-testid={`field-${id}`}
      className={`bg-white rounded-2xl p-4 space-y-3 border transition-shadow ${on ? "border-blue-600 ring-2 ring-blue-600/30" : "border-slate-200"}`}>
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {about && <p className="text-xs text-slate-500 mt-0.5">{about}</p>}
      </div>
      {children}
    </section>
  );
}

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
  const id = Number(useParams().id);
  const [state, setState] = useState<ConfigState | null>(null);
  const [draft, setDraft] = useState<KioskLayout | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const frame: keyof typeof FRAMES = "portrait";
  const [openLang, setOpenLang] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  // The screen being edited (the tabs), the part of it clicked on (data-kx-edit), and the Style panel.
  const [scr, setScr] = useState<ScreenKey>("welcome");
  const [focus, setFocus] = useState<string | null>(null);
  const [styleOpen, setStyleOpen] = useState(false);
  // Easy builder › Categories: the owner chose to make their own button screens instead of the category cards.
  const [ownScreens, setOwnScreens] = useState(false);
  const extrasStore = useKioskExtras();
  // The guide, behind Help (it doesn't open by itself: the one-line hint under the tabs is the start).
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpTopic, setHelpTopic] = useState<HelpTopicId>("start");
  const openHelp = (t: HelpTopicId) => { setHelpTopic(t); setHelpOpen(true); };
  // The own screen open in the editor (the left Screens panel and the screen editor share it), and a nudge that
  // puts the cursor in the panel's name box after "New screen".
  const [screenId, setScreenId] = useState<string | null>(null);
  const [focusName, setFocusName] = useState(0);
  // Own screens: editing the screen, or the live kiosk preview.
  const [screensView, setScreensView] = useState<"edit" | "preview">("edit");
  // The salon's catalog as its kiosk sees it, for the screen editor.
  const [catalog, setCatalog] = useState<{ services: CatalogService[]; categories: CatalogCategory[]; addons: CatalogAddon[]; storeName: string } | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  // A callback ref: the preview box is drawn again when the screen changes, and the fit must follow it.
  const [previewBox, setPreviewBox] = useState<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.5);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSeq = useRef(0);

  const builder = draft?.builder ?? "easy";
  const SCREENS = screensFor(builder);
  const editingOwn = (scr === "categories" && (ownScreens || draft?.menuMode === "screens")) || scr === "screens";

  // ── Load ──
  useEffect(() => {
    if (!id) { setLoadError("That configuration doesn't exist."); return; }
    Promise.all([
      api<ConfigState>(`/api/kiosk-builder/configs/${id}`),
      api<{ bookingSlug: string | null }>("/api/kiosk-settings"),
    ]).then(([c, k]) => {
      setState(c); setDraft(c.layout); setSlug(k.bookingSlug);
      setScreenId(c.layout.startMenuId ?? c.layout.menus[0]?.id ?? null);
    }).catch((e) => setLoadError(e.message));
  }, [id]);
  useEffect(() => {
    if (!slug || !editingOwn || catalog) return;
    api<any>(`/api/public/kiosk/${slug}/config?preview=config-${id}`)
      .then((d) => setCatalog({ services: d.services ?? [], categories: d.categories ?? [], addons: d.addons ?? [], storeName: d.store?.name ?? "" }))
      .catch((e) => toast({ title: "Couldn't load your services", description: e.message, variant: "destructive" }));
  }, [slug, editingOwn, catalog, toast, id]);
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
  // The own-screens live preview: the screen it should open on; sent again when the preview (re)loads.
  const pendingScreenRef = useRef<string | null>(null);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      // The preview has loaded the design: show the screen being edited.
      if (e.data?.type === "kiosk-preview-ready") {
        if (editingOwn && screensView === "preview" && pendingScreenRef.current) {
          postToPreview({ type: "kiosk-preview-goto", target: "screen", menuId: pendingScreenRef.current });
        } else {
          postToPreview({ type: "kiosk-preview-goto", target: (ALL_SCREENS.find((x) => x.key === scr) ?? ALL_SCREENS[0]).preview });
        }
      }
      // A part of the screen was clicked: open its setting.
      if (e.data?.type === "kiosk-preview-edit") { setFocus(typeof e.data.target === "string" ? e.data.target : null); setStyleOpen(false); }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [scr, editingOwn, screensView, postToPreview]);

  useEffect(() => {
    const box = previewBox;
    if (!box) return;
    const fit = () => {
      const f = FRAMES[frame];
      setScale(Math.min(box.clientWidth / f.w, box.clientHeight / f.h, 1));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [frame, previewBox]);

  // ── Save (every change, after a short pause) ──
  const draftRef = useRef<KioskLayout | null>(null);
  draftRef.current = draft;
  const saveNow = async (layout: KioskLayout) => {
    const r = await api<{ config: ConfigRow; layout: KioskLayout }>(`/api/kiosk-builder/configs/${id}/layout`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ layout }),
    });
    setState((s) => (s ? { ...s, config: r.config } : s));
  };
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
        await saveNow(next);
        if (seq !== saveSeq.current) return;
        setSaving("saved"); setSaveError("");
        postToPreview({ type: "kiosk-preview-refresh" });
      } catch (e: any) {
        if (seq !== saveSeq.current) return;
        setSaving("error"); setSaveError(e.message);
      }
    }, 600);
  };

  const publish = async () => {
    setPublishing(true);
    try {
      // Make sure the last change is saved first.
      if (saveTimer.current && draftRef.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        saveSeq.current++;
        await saveNow(draftRef.current);
        setSaving("saved");
      }
      await api(`/api/kiosk-builder/configs/${id}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      setState((s) => (s ? { ...s, config: { ...s.config, live: true } } : s));
      setPublishOpen(false);
      toast({ title: "It's on your kiosk", description: "Your kiosk shows it the next time no one is using it." });
    } catch (e: any) {
      toast({ title: "Couldn't put it on your kiosk", description: e.message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
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

  if (loadError) {
    return (
      <AppLayout>
        <div className="max-w-xl mx-auto p-8 text-center space-y-3">
          <p className="text-slate-700">{loadError}</p>
          <Link to="/kiosk-builder" className="text-sm underline text-slate-600">Back to your kiosk configurations</Link>
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
  const previewUrl = slug ? `/kiosk/${slug}?preview=config-${id}` : null;
  const staffTitle = currentStaffTitle(draft.text);
  const f = FRAMES[frame];
  /**
   * The 15" kiosk. edit: the screen editor (a click picks what to change). Otherwise the live kiosk, to tap through.
   */
  const renderPreview = (extraButtons?: React.ReactNode, edit = true) => (
    <div className="flex-1 min-w-0 min-h-[480px] flex flex-col p-4 gap-2">
      <div className="flex flex-wrap items-center gap-2 justify-center">
        {extraButtons}
        {previewUrl && (
          <a href={previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-slate-600 underline">
            Try it full screen <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
      <div ref={setPreviewBox} className="flex-1 min-h-0 flex items-start justify-center overflow-hidden">
        {previewUrl ? (
          <div style={{ width: f.w * scale, height: f.h * scale }} className="relative rounded-[22px] overflow-hidden border-[8px] border-slate-800 bg-white shadow-md">
            <iframe ref={iframeRef} key={`${frame}-${edit ? "edit" : "live"}`} src={edit ? `${previewUrl}&edit=1` : previewUrl} title="Kiosk preview" data-testid="kiosk-builder-preview"
              style={{ width: f.w, height: f.h, transform: `scale(${scale})`, transformOrigin: "0 0", border: 0, position: "absolute", top: 0, left: 0 }} />
          </div>
        ) : (
          <p className="text-sm text-slate-500 pt-10">Set your booking link in Business Settings to preview the kiosk.</p>
        )}
      </div>
    </div>
  );
  /** A sentence on the kiosk the business can rewrite, with its other languages. */
  const textField = (key: string, title: string) => {
    const k = textKeys.find((x) => x.key === key);
    if (!k) return null;
    const own = draft.text[key] ?? {};
    const open = openLang === key;
    const translated = KIOSK_LANG_CODES.filter((l) => l !== "en" && own[l]).length;
    return (
      <Field key={key} id={`text:${key}`} focus={focus} title={title} about="Leave it empty to keep the kiosk's own words.">
        <Input value={own.en ?? ""} maxLength={k.max} placeholder={defaultEnglish(k)}
          onChange={(e) => setText(key, "en", e.target.value)} data-testid={`kiosk-text-${key}`} />
        {k.placeholders?.length ? <p className="text-xs text-slate-500">{"{name}"} becomes the client's first name.</p> : null}
        <button type="button" className="text-xs text-slate-500 underline" onClick={() => setOpenLang(open ? null : key)}>
          {open ? "Hide other languages" : `Other languages${translated ? ` (${translated} written)` : " (they show your English if left empty)"}`}
        </button>
        {open && (
          <div className="space-y-1.5 pl-3 border-l border-slate-200">
            {KIOSK_LANG_CODES.filter((l) => l !== "en").map((l) => (
              <div key={l} className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-xs text-slate-500">{LANG_NAMES[l]}</span>
                <Input value={own[l] ?? ""} maxLength={k.max} className="h-8 text-sm"
                  placeholder={own.en ? "Shows your English" : "The kiosk's own words"}
                  onChange={(e) => setText(key, l, e.target.value)} />
              </div>
            ))}
          </div>
        )}
      </Field>
    );
  };
  const showSwitch = (id: KioskStepId, label: string) => {
    const st = draft.steps.find((x) => x.id === id)!;
    return (
      <Row label={label}>
        <Switch checked={st.enabled} onCheckedChange={(v) => setStep(id, v)} aria-label={label} data-testid={`step-${id}`} />
      </Row>
    );
  };
  // The order of the screens after Services (questions, add-ons, staff), for the Add-ons and Staff tabs.
  const orderField = (
    <Field id="order" focus={focus} title="Order after Services" about="Which of these screens comes first. A screen that's off is skipped.">
      {middle.map((st, i) => (
        <div key={st.id} className="flex items-center justify-between text-sm">
          <span className={st.enabled ? "text-slate-800" : "text-slate-400"}>{i + 1}. {STEP_INFO[st.id].name}{st.enabled ? "" : " (off)"}</span>
          <span className="flex items-center gap-1">
            <button type="button" aria-label="Earlier" disabled={i === 0} onClick={() => moveStep(st.id, -1)} className="p-1 text-slate-500 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
            <button type="button" aria-label="Later" disabled={i === middle.length - 1} onClick={() => moveStep(st.id, 1)} className="p-1 text-slate-500 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
          </span>
        </div>
      ))}
    </Field>
  );
  const goScreen = (k: ScreenKey) => {
    setScr(k); setFocus(null); setStyleOpen(false); setScreensView("edit");
    postToPreview({ type: "kiosk-preview-goto", target: SCREENS.find((x) => x.key === k)!.preview });
  };
  const screen = SCREENS.find((x) => x.key === scr) ?? SCREENS[0];
  // The left Screens panel: opening or making a screen goes to the builder's own-screens editor.
  const openOwnScreens = () => {
    setStyleOpen(false); setFocus(null); setScreensView("edit");
    if (builder === "picture") setScr("screens"); else { setScr("categories"); setOwnScreens(true); }
  };
  const openScreen = (sid: string) => {
    setScreenId(sid);
    if (builder === "easy" && draft.menuMode !== "screens") update((d) => ({ ...d, menuMode: "screens" }));
    openOwnScreens();
  };
  const newScreen = () => {
    let sid = "";
    // A temporary name ("Screen 3"), the next one not in use; the owner renames it any time.
    update((d) => {
      const taken = new Set(d.menus.map((m) => m.name.trim().toLowerCase()));
      let n = d.menus.length + 1;
      while (taken.has(`screen ${n}`)) n++;
      const r = withNewScreen(d, `Screen ${n}`); sid = r.id; return r.layout;
    });
    setScreenId(sid); openOwnScreens(); setFocusName((n) => n + 1);
  };
  const screensPanel = (
    <ScreensPanel draft={draft} activeId={editingOwn ? screenId : null} focusName={focusName}
      onOpen={openScreen} onNew={newScreen}
      onRename={(sid, name) => update((d) => ({ ...d, menus: d.menus.map((m) => (m.id === sid ? { ...m, name } : m)) }))}
      onDelete={(sid) => { update((d) => withoutScreen(d, sid)); setScreenId(null); }} />
  );
  const usingOwn = scr === "categories" && (ownScreens || draft.menuMode === "screens");
  // Easy builder › Categories: the category cards, or the owner's own button screens (the kiosk uses what's chosen).
  const howField = (
    <Field id="how" focus={focus} title="How clients pick a service">
      <div className="grid grid-cols-2 gap-2">
        {([[false, "Category cards", "Made from your catalog by itself. Nothing to design."], [true, "My own screens", "Design the screens yourself, like a POS grid."]] as const).map(([own, name, about]) => (
          <button key={name} type="button" data-testid={`pick-${own ? "own" : "cards"}`}
            onClick={() => { setOwnScreens(own); update((d) => ({ ...d, menuMode: own && d.startMenuId ? "screens" : "catalog" })); }}
            className={`text-left rounded-xl border p-3 ${usingOwn === own ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200 hover:bg-slate-50"}`}>
            <p className="text-sm font-medium text-slate-800">{name}</p>
            <p className="text-xs text-slate-500">{about}</p>
          </button>
        ))}
      </div>
    </Field>
  );
  // How many services one client can pick, for both builders.
  const limitsField = (
    <Field id="limits" focus={focus} title="How many services">
      <Row label="Services one client can pick">
        <select className={selectClass} value={draft.services.maxServices}
          onChange={(e) => update((d) => ({ ...d, services: { ...d.services, maxServices: Number(e.target.value) } }))}>
          {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </Row>
      <Row label="Longest visit" about="Only with more than one service">
        <select className={selectClass} value={draft.services.maxVisitMinutes}
          onChange={(e) => update((d) => ({ ...d, services: { ...d.services, maxVisitMinutes: Number(e.target.value) } }))}>
          {minuteChoices.map((m) => <option key={m} value={m}>{fmtMinutes(m)}</option>)}
        </select>
      </Row>
    </Field>
  );

  return (
    <AppLayout fullHeight>
      <div className="h-full flex flex-col bg-slate-50">
        {/* ── Top bar ── */}
        <div className="shrink-0 flex flex-wrap items-center gap-3 px-5 py-3 border-b border-slate-200 bg-white">
          <Link to="/kiosk-builder" className="text-slate-500 hover:text-slate-800" aria-label="Back to your kiosk configurations"><ArrowLeft className="w-5 h-5" /></Link>
          <div className="min-w-0">
            <h1 className="font-semibold text-slate-900 leading-tight" data-testid="config-title">{state.config.name}</h1>
            <p className="text-xs text-slate-500">
              {BUILDERS[builder].name} · {state.config.live ? "On your kiosk now" : "Not on your kiosk"}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-slate-500" data-testid="kiosk-builder-save-status">
              {saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : saving === "error" ? "Not saved" : ""}
            </span>
            <Button variant="outline" size="sm" onClick={() => openHelp(helpTopic)} className="gap-1.5" data-testid="kiosk-builder-help"><CircleHelp className="w-4 h-4" /> Help</Button>
            <Button size="sm" disabled={saving === "saving" || saving === "error"} onClick={() => setPublishOpen(true)} data-testid="kiosk-builder-publish">
              {state.config.live ? "Update my kiosk" : "Put on my kiosk"}
            </Button>
          </div>
        </div>
        {saveError && (
          <div className="shrink-0 px-5 py-2 text-sm text-red-700 bg-red-50 border-b border-red-200">{saveError}</div>
        )}
        {/* ── The screens (tabs) ── */}
        <div className="shrink-0 border-b border-slate-200 bg-white px-5 pt-2">
          <div className="flex items-end gap-1 overflow-x-auto" data-testid="screen-tabs">
            {SCREENS.map((x, i) => (
              <button key={x.key} type="button" onClick={() => goScreen(x.key)} data-testid={`screen-tab-${x.key}`}
                className={`shrink-0 px-3.5 py-2 text-sm rounded-t-lg border-b-2 ${scr === x.key && !styleOpen ? "border-slate-900 text-slate-900 font-semibold bg-slate-50" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                <span className="text-slate-400 mr-1">{i + 1}</span>{x.name}
              </button>
            ))}
            <button type="button" onClick={() => { setStyleOpen(true); setFocus(null); }} data-testid="screen-tab-style"
              className={`shrink-0 ml-auto px-3.5 py-2 text-sm rounded-t-lg border-b-2 ${styleOpen ? "border-slate-900 text-slate-900 font-semibold bg-slate-50" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
              Colours &amp; style
            </button>
          </div>
        </div>
        <div className="shrink-0 px-5 py-2 text-sm text-slate-600 bg-slate-50 border-b border-slate-200" data-testid="builder-hint">
          <span className="font-medium text-slate-800">How it works:</span> pick a screen above, click what you want to change on it. Changes save by themselves; your kiosk changes when you press {state.config.live ? "Update my kiosk" : "Put on my kiosk"}.{" "}
          <button type="button" className="underline" onClick={() => openHelp("start")}>More help</button>
        </div>

        {(() => {
          const layout = (center: React.ReactNode, panel: React.ReactNode) => (
            <div className="flex-1 min-h-0 flex">
              {screensPanel}
              <div className="flex-1 min-w-0 flex">{center}</div>
              <div className="w-[420px] shrink-0 overflow-y-auto border-l border-slate-200 bg-slate-50" data-testid="screen-panel">
                <div className="px-5 pt-4 pb-2">
                  <h2 className="text-lg font-semibold text-slate-900">{styleOpen ? "Colours & style" : `${screen.name} screen`}</h2>
                  <p className="text-sm text-slate-500">{styleOpen ? "The look of every screen." : screen.about}</p>
                </div>
                <div className="px-4 pb-6 space-y-3">{panel}</div>
              </div>
            </div>
          );

          if (styleOpen) return layout(renderPreview(), (
            <Field id="style" focus={focus} title="Style">
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
            </Field>
          ));

          // Own screens: the Easy builder's button grids (Categories › My own screens) or the Picture builder's pictures.
          if (usingOwn || scr === "screens") {
            const top = builder === "easy" ? howField : limitsField;
            if (!catalog) return layout(renderPreview(), <>{top}<div className="flex items-center gap-2 text-slate-500 py-6"><Loader2 className="w-5 h-5 animate-spin" /> Loading your services…</div></>);
            return (
              <ScreensEditor draft={draft} update={update} services={catalog.services} categories={catalog.categories} addons={catalog.addons} storeName={catalog.storeName} uploadImage={uploadImage}
                renderPreview={(extra) => renderPreview(extra, false)} view={screensView} onView={setScreensView} extras={extrasStore} onHelp={openHelp}
                menuId={screenId} onMenuId={setScreenId}
                previewScreen={(menuId: string) => { pendingScreenRef.current = menuId; postToPreview({ type: "kiosk-preview-goto", target: "screen", menuId }); }}>
                {({ panel, canvas }) => layout(canvas ?? renderPreview(undefined, false), <>{top}{panel}</>)}
              </ScreensEditor>
            );
          }

          const panels: Record<ScreenKey, React.ReactNode> = {
            welcome: (<>
              <Field id="welcome-picture" focus={focus} title="Picture" about="Fills the whole screen. Make it 1080 × 1920 pixels (tall).">
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
              </Field>
              <Field id="languages" focus={focus} title="Language buttons" about="The buttons at the bottom. With only English, none show.">
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
              </Field>
            </>),
            phone: (
              <Field id="phone" focus={focus} title="Nothing to change here">
                <p className="text-sm text-slate-600">Clients type their mobile number on this screen. New clients then type their first name. It looks the same for every salon.</p>
              </Field>
            ),
            categories: (<>
              {howField}
              <Field id="category-cards" focus={focus} title="Category cards" about="One card for each category in your catalog. Card pictures come from Catalog › Categories.">
                {showSwitch("category", "Show this screen")}
                <p className="text-xs text-slate-500">Off: clients go straight to one list of all your services.</p>
              </Field>
              {textField("whatBringsYouIn", "Heading")}
            </>),
            services: (<>
              <Field id="service-cards" focus={focus} title="Service cards">
                <Row label="Show prices"><Switch checked={draft.services.showPrice} onCheckedChange={(v) => update((d) => ({ ...d, services: { ...d.services, showPrice: v } }))} /></Row>
                <Row label="Show how long they take"><Switch checked={draft.services.showDuration} onCheckedChange={(v) => update((d) => ({ ...d, services: { ...d.services, showDuration: v } }))} /></Row>
              </Field>
              {limitsField}
              <Field id="smart" focus={focus} title="Suggestions">
                <Row label="Suggest a returning client's usual service"><Switch checked={draft.smartCheckin} onCheckedChange={(v) => update((d) => ({ ...d, smartCheckin: v }))} /></Row>
              </Field>
              <Field id="questions" focus={focus} title="Nail questions" about="Length, shape and design, for services set up in Catalog › Nail Config.">
                {showSwitch("questions", "Ask them after the service")}
              </Field>
            </>),
            addons: (<>
              <Field id="addon-cards" focus={focus} title="Add-ons" about="The add-ons that go with the service they picked.">
                {showSwitch("addons", "Show this screen")}
              </Field>
              {orderField}
              <Field id="extras" focus={focus} title="Kiosk Extras" about="Kiosk-only choices like a nail shape. You put them on your own screens.">
                <ExtrasPanel store={extrasStore} draft={draft} update={update} />
              </Field>
            </>),
            staff: (<>
              <Field id="staff-cards" focus={focus} title="Staff cards" about="Only staff who are clocked in and free are shown.">
                {showSwitch("provider", "Show this screen")}
              </Field>
              <Field id="staff-title" focus={focus} title="What clients call your staff" about="Used on this screen, the review and the ticket, in every language.">
                <select className={`${selectClass} w-full`} value={staffTitle} data-testid="staff-title"
                  onChange={(e) => {
                    const key = e.target.value;
                    if (key === "custom") return;
                    update((d) => {
                      const text = { ...d.text };
                      for (const k of STAFF_TEXT_KEYS) delete text[k];
                      return { ...d, text: { ...text, ...staffTextFor(key) } };
                    });
                  }}>
                  {STAFF_TITLES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                  {staffTitle === "custom" && <option value="custom">Your own words (below)</option>}
                </select>
              </Field>
              {textField("whoWouldYouLike", "Heading")}
              {textField("pickStylist", "Line under the heading")}
              {textField("nextAvailable", "The \"anyone\" card")}
              {textField("autoAssign", "Under the \"anyone\" card")}
              {orderField}
            </>),
            review: (<>
              {textField("yourStylist", "Staff label")}
            </>),
            screens: null,
            ticket: (<>
              <Field id="ticket-timer" focus={focus} title="How long this screen stays">
                <select className={`${selectClass} w-full`} value={draft.timing.ticketResetSeconds}
                  onChange={(e) => update((d) => ({ ...d, timing: { ticketResetSeconds: Number(e.target.value) } }))}>
                  {[10, 15, 20, 30, 45, 60, 90, 120].map((n) => <option key={n} value={n}>{n} seconds, then back to Welcome</option>)}
                </select>
              </Field>
              {textField("showQr", "Line under the heading")}
            </>),
          };
          return layout(renderPreview(), <>
            {panels[scr]}
            {!focus && scr !== "phone" && <p className="text-xs text-slate-500 px-1">Tip: click any part of the screen to jump to its setting.</p>}
          </>);
        })()}
      </div>

      {/* ── Put on my kiosk ── */}
      <AlertDialog open={publishOpen} onOpenChange={setPublishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{state.config.live ? "Update your kiosk?" : `Put "${state.config.name}" on your kiosk?`}</AlertDialogTitle>
            <AlertDialogDescription>
              Your kiosk switches to it the next time no one is using it. You can put another configuration back any time from your kiosk configurations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishing}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={publishing} onClick={(e) => { e.preventDefault(); void publish(); }} data-testid="kiosk-builder-publish-confirm">
              {publishing ? "Putting it on…" : state.config.live ? "Update my kiosk" : "Put on my kiosk"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <HelpGuide open={helpOpen} onOpenChange={setHelpOpen} topic={helpTopic} onTopic={setHelpTopic} />

    </AppLayout>
  );
}
