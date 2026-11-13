/**
 * Kiosk Builder › Screens — the owner's own kiosk screens, edited like a POS grid (plans/kiosk-builder.md).
 *
 * A screen is one big centered button, or 1–4 columns × 1–6 rows of buttons per page, always inside the 15"
 * kiosk's portrait screen. A button is a service, or a link that opens another screen. The canvas is drawn with
 * the kiosk's own KioskMenuScreen, so it looks exactly like the kiosk: tap an empty slot to fill it, tap a
 * button to change it, drag a button onto another slot to move it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { KioskMenuScreen, servicePicture, type MenuColors, type MenuService } from "@/components/kiosk/KioskMenuScreen";
import { KioskPictureScreen } from "@/components/kiosk/KioskPictureScreen";
import { ExtraForm, priceText, type KioskExtrasStore } from "./extras";
import {
  KIOSK_MENU_LIMITS, KIOSK_PICTURE, KIOSK_PICTURE_FOOTER_PCT, KIOSK_SPOT_MIN, builderScreenKind, sameGroup, type KioskBuilderKind, menuPageCount, menuSlotsPerPage,
  type KioskLayout, type KioskMenu, type KioskNext, type KioskSpot, type KioskSpotAction, type KioskSpotFunction, type KioskTile,
} from "@shared/kiosk/layout";

export interface CatalogService extends MenuService { category: string | null; categoryId?: number | null }
export interface CatalogCategory { id: number; name: string; imageUrl: string | null }
export interface CatalogAddon { id: number; name: string; price: number; serviceIds: number[]; kioskExtra?: boolean; kioskExtraGroup?: string | null }
const FUNCTION_NAMES: Record<KioskSpotFunction, { name: string; about: string }> = {
  continue: { name: "Continue", about: "On to the next step in your order (add-ons, staff, then the review)" },
  staff: { name: "Go to Staff", about: "Straight to choosing who does it" },
  review: { name: "Finish", about: "Straight to the review, where they press Check In" },
  back: { name: "Back", about: "The screen before" },
  startOver: { name: "Start over", about: "Back to the welcome screen" },
};

/** "Then…" for a button or tap spot that chooses something, as a select value. */
const nextValue = (n: KioskNext | undefined) => (!n ? "" : n.kind === "menu" ? `menu:${n.menuId}` : n.kind);
const parseNext = (v: string): KioskNext | undefined =>
  !v ? undefined : v.startsWith("menu:") ? { kind: "menu", menuId: v.slice(5) } : { kind: v as "continue" | "staff" | "review" };

/**
 * The template for a picture screen: 1080 × 1920 (the 15" kiosk, standing), with a safe margin and a grid, made in
 * the browser and downloaded as a PNG.
 */
function downloadTemplate() {
  const { width: W, height: H } = KIOSK_PICTURE;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, W, H);
  g.strokeStyle = "#eef0f4"; g.lineWidth = 2;
  for (let x = 120; x < W; x += 120) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 120; y < H; y += 120) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.setLineDash([18, 12]); g.strokeStyle = "#94a3b8"; g.lineWidth = 3;
  g.strokeRect(48, 48, W - 96, H - 96);
  g.setLineDash([]);
  // Pixel numbers along the top and left edges, every 120 px (one grey square), to measure any part of a design.
  g.fillStyle = "#94a3b8"; g.font = "18px sans-serif";
  g.textAlign = "center";
  for (let x = 120; x < W; x += 120) g.fillText(String(x), x, 30);
  g.textAlign = "left";
  for (let y = 120; y < H; y += 120) g.fillText(String(y), 58, y - 6);
  // Example buttons at real size: the smallest a finger can tap reliably, a comfortable one, a big one.
  const examples: Array<{ x: number; w: number; h: number; name: string }> = [
    { x: 96, w: 160, h: 100, name: "Smallest" },
    { x: 296, w: 240, h: 160, name: "Comfortable" },
    { x: 576, w: 440, h: 200, name: "Big" },
  ];
  const top = 210;
  g.fillStyle = "#334155"; g.font = "bold 30px sans-serif"; g.textAlign = "left";
  g.fillText("Button sizes, shown at real size", 96, 160);
  g.fillStyle = "#64748b"; g.font = "22px sans-serif";
  g.fillText("A guide only: design over it, or keep it as a bottom layer and hide it before you save.", 96, 192);
  for (const e of examples) {
    const r = 18;
    g.beginPath();
    g.moveTo(e.x + r, top); g.arcTo(e.x + e.w, top, e.x + e.w, top + e.h, r); g.arcTo(e.x + e.w, top + e.h, e.x, top + e.h, r);
    g.arcTo(e.x, top + e.h, e.x, top, r); g.arcTo(e.x, top, e.x + e.w, top, r); g.closePath();
    g.fillStyle = "#e2e8f0"; g.fill();
    g.strokeStyle = "#475569"; g.lineWidth = 3; g.stroke();
    g.fillStyle = "#1e293b"; g.textAlign = "center";
    g.font = "bold 26px sans-serif"; g.fillText(`${e.w} × ${e.h}`, e.x + e.w / 2, top + e.h / 2 - 4);
    g.font = "22px sans-serif"; g.fillText(e.name, e.x + e.w / 2, top + e.h / 2 + 26);
  }
  // Where the kiosk footer goes when a screen shows it (Back, total, Continue): keep tap spots out of it.
  const fy = Math.round(H * (1 - KIOSK_PICTURE_FOOTER_PCT / 100));
  g.fillStyle = "rgba(148,163,184,0.25)"; g.fillRect(0, fy, W, H - fy);
  g.fillStyle = "#64748b"; g.textAlign = "center"; g.font = "28px sans-serif";
  g.fillText(`Kiosk footer area (${H - fy} px), if you turn the footer on: Back · total · Continue`, W / 2, fy + (H - fy) / 2 + 10);
  g.fillStyle = "#334155"; g.textAlign = "center";
  g.font = "bold 56px sans-serif"; g.fillText("Certxa kiosk screen", W / 2, H / 2 - 120);
  g.font = "40px sans-serif"; g.fillText("1080 × 1920 px · 15\" kiosk, standing", W / 2, H / 2 - 50);
  g.font = "30px sans-serif"; g.fillStyle = "#64748b";
  ["Design the whole screen on this canvas, then save it as JPG or PNG.", "Keep words and buttons inside the dashed line.",
    "Make each button at least 160 × 100 px (see the examples at the top).", "Each grey square is 120 × 120 px; the numbers on the edges are pixels."]
    .forEach((line, i) => g.fillText(line, W / 2, H / 2 + 40 + i * 48));
  const a = document.createElement("a");
  a.href = cv.toDataURL("image/png");
  a.download = "certxa-kiosk-screen-1080x1920.png";
  a.click();
}

/** A picture's own size, to warn when it isn't the template's shape. */
const pictureSize = (file: File) => new Promise<{ w: number; h: number } | null>((resolve) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
  img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
  img.src = url;
});

/** Each look's colours (KioskCheckIn.tsx palettes); the business's own colours go on top. */
const LOOK_PALETTES: Record<"classic" | "boutique", MenuColors> = {
  classic: { primary: "#e84891", bg: "#f5f3ff", surface: "#ffffff", text: "#18111a", muted: "#6b6580", border: "#e9e3f5", tint: "#f0eeff" },
  boutique: { primary: "#b9785c", bg: "#f7ede6", surface: "#fffaf6", text: "#3b2a26", muted: "#6f5a52", border: "#e2c9ba", tint: "#f6e6dd" },
};

/** The 15" kiosk Certxa sells: a standing portrait screen, 9:16. */
const KIOSK_W = 1080, KIOSK_H = 1920;

const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

const LAYOUTS: Array<{ key: string; name: string; style: KioskMenu["style"]; cols: number }> = [
  { key: "single", name: "One, centered", style: "single", cols: 1 },
  { key: "1", name: "1 across", style: "grid", cols: 1 },
  { key: "2", name: "2 across", style: "grid", cols: 2 },
  { key: "3", name: "3 across", style: "grid", cols: 3 },
  { key: "4", name: "4 across", style: "grid", cols: 4 },
];

/** Re-lays a screen's buttons in order after a layout change, so none are lost and no gaps are left. */
function relayout(m: KioskMenu, style: KioskMenu["style"], cols: number, rows: number): KioskMenu {
  const kept = m.tiles.filter((t): t is KioskTile => !!t);
  const per = style === "single" ? 1 : cols * rows;
  return { ...m, style, cols: style === "single" ? 1 : cols, rows: style === "single" ? 1 : rows, tiles: kept.slice(0, per * KIOSK_MENU_LIMITS.pages) };
}

/** Screens from the catalog: a start screen with one button per category, and a screen of services for each. */
export function screensFromCatalog(services: CatalogService[], categories: CatalogCategory[]): { menus: KioskMenu[]; start: string } {
  const groups: Array<{ name: string; imageUrl: string | null; services: CatalogService[] }> = [];
  for (const c of categories) {
    const svcs = services.filter((s) => s.categoryId === c.id);
    if (svcs.length) groups.push({ name: c.name, imageUrl: c.imageUrl, services: svcs });
  }
  const known = new Set(categories.map((c) => c.id));
  for (const s of services.filter((x) => x.categoryId == null || !known.has(x.categoryId))) {
    const name = (s.category ?? "").trim() || "Other services";
    let g = groups.find((x) => x.name === name);
    if (!g) { g = { name, imageUrl: null, services: [] }; groups.push(g); }
    g.services.push(s);
  }
  const serviceScreen = (name: string, svcs: CatalogService[]): KioskMenu => ({
    id: newId("screen"), kind: "buttons", name, title: {}, style: "grid", cols: 3, rows: 4, imageUrl: null, spots: [], footer: false,
    tiles: svcs.slice(0, 12 * KIOSK_MENU_LIMITS.pages).map((s) => ({ id: newId("btn"), kind: "service", serviceId: s.id })),
  });
  if (groups.length <= 1) {
    const only = serviceScreen("Services", groups[0]?.services ?? []);
    return { menus: [only], start: only.id };
  }
  const subs = groups.slice(0, KIOSK_MENU_LIMITS.menus - 1).map((g) => ({ g, m: serviceScreen(g.name, g.services) }));
  const cols = subs.length <= 4 ? 2 : 3;
  const home: KioskMenu = {
    id: newId("screen"), kind: "buttons", name: "Start", title: {}, style: "grid", cols, rows: Math.min(6, Math.max(2, Math.ceil(subs.length / cols))),
    imageUrl: null, spots: [], footer: false,
    tiles: subs.map(({ g, m }) => ({ id: newId("btn"), kind: "menu", menuId: m.id, ...(g.imageUrl ? { imageUrl: g.imageUrl } : {}) })),
  };
  return { menus: [home, ...subs.map((x) => x.m)], start: home.id };
}

export function ScreensEditor(props: {
  draft: KioskLayout;
  update: (change: (d: KioskLayout) => KioskLayout) => void;
  services: CatalogService[];
  categories: CatalogCategory[];
  addons: CatalogAddon[];
  storeName: string;
  uploadImage: (file: File) => Promise<string | null>;
  /** The live kiosk preview (the Settings tab's), with extra buttons in its bar. */
  renderPreview: (extraButtons?: React.ReactNode) => React.ReactNode;
  view: "edit" | "preview";
  onView: (v: "edit" | "preview") => void;
  /** Sends the live preview to one of these screens. */
  previewScreen: (menuId: string) => void;
  /** The Kiosk Extras (one list for the whole builder). */
  extras: KioskExtrasStore;
  /** Opens the built-in guide on a topic (./help.ts). */
  onHelp?: (topic: "builders" | "easy" | "picture" | "recipe-shapes") => void;
  /** Where the page puts the two parts: the settings panel, and the canvas (null: show the live preview). */
  children: (parts: { panel: React.ReactNode; canvas: React.ReactNode | null }) => React.ReactNode;
}) {
  const { draft, update, services, categories } = props;
  const [menuId, setMenuId] = useState<string | null>(draft.startMenuId ?? draft.menus[0]?.id ?? null);
  const [page, setPage] = useState(0);
  const [extraPages, setExtraPages] = useState(0);
  const [slot, setSlot] = useState<number | null>(null);
  const [pickTab, setPickTab] = useState<"service" | "extra" | "screen">("service");
  // Kiosk Extras: kiosk-only items (nail shapes…), add-ons underneath so they land on the ticket and are charged.
  const extras = props.extras.list;
  const extraGroups = props.extras.groups;
  const createExtra = props.extras.create;
  const [extraForm, setExtraForm] = useState<null | "spot" | "tile">(null);
  // The chosen button / tap spot's card sits at the top of the panel: bring it into view when one is chosen.
  const selectionRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [spotId, setSpotId] = useState<string | null>(null);
  const [spotTab, setSpotTab] = useState<"service" | "addon" | "function" | "menu">("service");
  const [pictureWarning, setPictureWarning] = useState<string | null>(null);
  const canvasBox = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);

  const menu = draft.menus.find((m) => m.id === menuId) ?? null;
  // Regular add-ons (from the catalog) and the Kiosk Extras (kept here, so new ones show at once).
  const plainAddons = useMemo(() => props.addons.filter((a) => !a.kioskExtra), [props.addons]);
  const addons = useMemo<CatalogAddon[]>(() => [
    ...plainAddons,
    ...(extras ?? []).map((x) => ({ id: x.id, name: x.name, price: x.price, serviceIds: [], kioskExtra: true, kioskExtraGroup: x.group })),
  ], [plainAddons, extras]);
  const addonMap = useMemo(() => new Map(addons.map((a) => [a.id, { id: a.id, name: a.name, price: a.price }])), [addons]);
  const svcById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const menusById = useMemo(() => new Map(draft.menus.map((m) => [m.id, m])), [draft.menus]);
  const palette = { ...LOOK_PALETTES[draft.theme.look] };
  const own = draft.theme.colors;
  if (own.primary) palette.primary = own.primary;
  if (own.background) palette.bg = own.background;
  if (own.surface) palette.surface = own.surface;
  if (own.text) palette.text = own.text;

  useEffect(() => { if (!menu && draft.menus[0]) setMenuId(draft.menus[0].id); }, [menu, draft.menus]);
  useEffect(() => { setPage(0); setExtraPages(0); setSlot(null); setSpotId(null); setPictureWarning(null); }, [menuId]);
  useEffect(() => {
    if (slot != null || spotId) selectionRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [slot, spotId]);
  useEffect(() => {
    const box = canvasBox.current;
    if (!box) return;
    const fit = () => setScale(Math.min(box.clientWidth / KIOSK_W, box.clientHeight / KIOSK_H));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [menu?.id]);

  const changeMenu = (id: string, change: (m: KioskMenu) => KioskMenu) =>
    update((d) => ({ ...d, menus: d.menus.map((m) => (m.id === id ? change(m) : m)) }));
  const setTile = (at: number, tile: KioskTile | null) => menu && changeMenu(menu.id, (m) => {
    const tiles = [...m.tiles];
    while (tiles.length <= at) tiles.push(null);
    tiles[at] = tile;
    while (tiles.length && tiles[tiles.length - 1] == null) tiles.pop();
    return { ...m, tiles };
  });
  const moveTile = (from: number, to: number) => menu && changeMenu(menu.id, (m) => {
    const tiles = [...m.tiles];
    while (tiles.length <= Math.max(from, to)) tiles.push(null);
    [tiles[from], tiles[to]] = [tiles[to], tiles[from]];
    while (tiles.length && tiles[tiles.length - 1] == null) tiles.pop();
    return { ...m, tiles };
  });

  const addScreen = (name = "New screen", kind: KioskMenu["kind"] = builderScreenKind(draft.builder)): string => {
    const m: KioskMenu = { id: newId("screen"), kind, name, title: {}, style: "grid", cols: 3, rows: 4, tiles: [], imageUrl: null, spots: [], footer: false };
    update((d) => ({ ...d, menus: [...d.menus, m], startMenuId: d.startMenuId ?? m.id }));
    return m.id;
  };
  const deleteScreen = (id: string) => {
    update((d) => {
      const menus = d.menus.filter((m) => m.id !== id)
        // and every button that opened it
        .map((m) => ({ ...m, tiles: m.tiles.map((t) => (t?.kind === "menu" && t.menuId === id ? null : t)),
          spots: m.spots.filter((sp) => !(sp.action.kind === "menu" && sp.action.menuId === id)) }));
      const startMenuId = d.startMenuId === id ? menus[0]?.id ?? null : d.startMenuId;
      return { ...d, menus, startMenuId, menuMode: startMenuId ? d.menuMode : "catalog" };
    });
    setMenuId(null);
  };
  const buildFromCatalog = () => {
    const { menus, start } = screensFromCatalog(services, categories);
    update((d) => ({ ...d, menus: [...d.menus, ...menus].slice(0, KIOSK_MENU_LIMITS.menus), startMenuId: d.startMenuId ?? start }));
    setMenuId(start);
  };
  const fillFromCategory = (key: string) => {
    if (!menu || !key) return;
    const picked = services.filter((s) => (key.startsWith("id:") ? `id:${s.categoryId}` === key : `name:${(s.category ?? "").trim()}` === key));
    const already = new Set(menu.tiles.filter((t) => t?.kind === "service").map((t) => t!.serviceId));
    const add = picked.filter((s) => !already.has(s.id));
    changeMenu(menu.id, (m) => {
      const tiles = [...m.tiles];
      const max = menuSlotsPerPage(m) * KIOSK_MENU_LIMITS.pages;
      let i = 0;
      for (const s of add) {
        while (i < max && tiles[i]) i++;
        if (i >= max) break;
        tiles[i] = { id: newId("btn"), kind: "service", serviceId: s.id };
      }
      return { ...m, tiles };
    });
  };

  // ── Picture screens: tap spots ──
  const changeSpots = (change: (spots: KioskSpot[]) => KioskSpot[]) => menu && changeMenu(menu.id, (m) => ({ ...m, spots: change(m.spots) }));
  const spot = menu?.kind === "picture" ? menu.spots.find((sp) => sp.id === spotId) ?? null : null;
  const addSpot = (action: KioskSpotAction = { kind: "function", fn: "continue" }) => {
    if (!menu || menu.spots.length >= KIOSK_MENU_LIMITS.spots) return;
    const sp: KioskSpot = { id: newId("spot"), x: 35, y: 45, w: 30, h: 10, action };
    changeSpots((list) => [...list, sp]);
    setSpotId(sp.id); setSpotTab("service");
  };
  const setSpotAction = (action: KioskSpotAction) => spot && changeSpots((list) => list.map((x) => (x.id === spot.id ? { ...x, action } : x)));
  const nudge = (dx: number, dy: number, grow: boolean) => spot && changeSpots((list) => list.map((x) => {
    if (x.id !== spot.id) return x;
    const w = grow ? Math.min(100 - x.x, Math.max(KIOSK_SPOT_MIN.w, x.w + dx)) : x.w;
    const h = grow ? Math.min(100 - x.y, Math.max(KIOSK_SPOT_MIN.h, x.h + dy)) : x.h;
    return { ...x, w, h, x: grow ? x.x : Math.min(100 - w, Math.max(0, x.x + dx)), y: grow ? x.y : Math.min(100 - h, Math.max(0, x.y + dy)) };
  }));
  const spotName = (sp: KioskSpot) => {
    const a = sp.action;
    if (a.kind === "service") return svcById.get(a.serviceId)?.name ?? "A service no longer on your menu";
    if (a.kind === "addon") return `+ ${addons.find((x) => x.id === a.addonId)?.name ?? "An add-on no longer on your menu"}`;
    if (a.kind === "menu") return `Opens "${menusById.get(a.menuId)?.name ?? "a deleted screen"}"`;
    return FUNCTION_NAMES[a.fn].name;
  };
  const uploadPicture = async (file: File) => {
    if (!menu) return;
    const size = await pictureSize(file);
    const ratio = size ? size.h / size.w : 16 / 9;
    setPictureWarning(size && Math.abs(ratio - 16 / 9) > 0.03
      ? `This picture is ${size.w} × ${size.h} px, not the template's shape (1080 × 1920), so it is stretched to fill the screen. Make it from the template to keep it sharp and in proportion.`
      : null);
    setUploading(true);
    try {
      const url = await props.uploadImage(file);
      if (url) changeMenu(menu.id, (m) => ({ ...m, imageUrl: url }));
    } finally { setUploading(false); }
  };
  const pictureProblems = (m: KioskMenu): string[] => {
    if (m.kind !== "picture") return [];
    const out: string[] = [];
    if (!m.imageUrl) out.push("Upload the picture for this screen.");
    if (m.footer) {
      // The footer has its own Back and Continue; a spot under it can't be tapped.
      if (m.spots.some((sp) => sp.y + sp.h > 100 - KIOSK_PICTURE_FOOTER_PCT + 0.01))
        out.push("A tap spot reaches into the footer at the bottom; that part can't be tapped. Move it up.");
      return out;
    }
    const picks = m.spots.some((sp) => sp.action.kind === "service" || sp.action.kind === "addon");
    const moves = m.spots.some((sp) => (sp.action.kind === "function" && ["continue", "staff", "review"].includes(sp.action.fn)) || !!sp.next);
    if (picks && !moves) out.push("Clients can choose services here but can't move on: give a tap spot \"Then… Continue\", add a Continue spot, or turn on the footer.");
    if (!m.spots.some((sp) => sp.action.kind === "function" && (sp.action.fn === "back" || sp.action.fn === "startOver")))
      out.push("Add a Back or Start over tap spot, or turn on the footer, so clients aren't stuck on this screen.");
    return out;
  };

  // ── The builder: Easy or Picture, never both in one kiosk (owner, 2026-11-13) ──
  const switchBuilder = (b: KioskBuilderKind) => {
    if (b === draft.builder) return;
    if (draft.menus.length && !window.confirm(
      `Switch to the ${b === "picture" ? "Picture" : "Easy"} builder? Your ${draft.menus.length} ${draft.menus.length === 1 ? "screen is" : "screens are"} removed from this draft `
      + "(the two builders can't be mixed) and your kiosk goes back to its category cards until you make new screens. "
      + "To keep them, save this design under Configurations first.")) return;
    update((d) => ({ ...d, builder: b, menus: [], startMenuId: null, menuMode: "catalog" }));
    setMenuId(null);
  };
  const builderChoice = (
    <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2" data-testid="builder-choice">
      <p className="text-sm font-medium text-slate-800">Builder</p>
      <div className="grid grid-cols-2 gap-2">
        {([["easy", "Easy builder", "Grids of buttons made from your services. Prices and names stay up to date by themselves."],
           ["picture", "Picture builder", "Design every screen yourself as a picture, then place tap spots on it."]] as const).map(([key, name, about]) => (
          <button key={key} type="button" onClick={() => switchBuilder(key)} data-testid={`builder-${key}`}
            className={`text-left rounded-xl border p-3 ${draft.builder === key ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200 hover:bg-slate-50"}`}>
            <p className="text-sm font-medium text-slate-800">{name}</p>
            <p className="text-xs text-slate-500 mt-0.5">{about}</p>
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        A kiosk uses one builder. Switching starts the screens over.{" "}
        {props.onHelp && <button type="button" className="underline text-slate-700" onClick={() => props.onHelp!("builders")} data-testid="help-builders">Which should I choose?</button>}
      </p>
    </section>
  );

  if (!draft.menus.length) {
    return <>{props.children({ canvas: null, panel: (
      <div className="space-y-4">
        {builderChoice}
        {draft.builder === "easy" ? (
          <>
            <p className="text-sm text-slate-600">
              Design the screens clients tap through to pick their services, like the buttons on a POS: choose how many buttons go
              across and down, and put a service or a link to another screen on each one. Until you switch them on, your kiosk keeps
              its category cards and service list.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={buildFromCatalog} disabled={!services.length} data-testid="screens-build-from-catalog">Build screens from my catalog</Button>
              <Button variant="outline" onClick={() => setMenuId(addScreen())} data-testid="screens-new-buttons">Start with a blank screen</Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              Design each screen as one picture ({KIOSK_PICTURE.width} × {KIOSK_PICTURE.height} px, from the template), upload it and place tap
              spots over the parts clients tap: a service, an extra like a nail shape, Continue or Back, or another screen.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setMenuId(addScreen("Picture screen"))} data-testid="screens-new-picture">Start with a picture screen</Button>
              <Button variant="outline" onClick={downloadTemplate}>Download template</Button>
            </div>
          </>
        )}
      </div>
    ) })}</>;
  }

  const per = menu ? menuSlotsPerPage(menu) : 1;
  const pages = menu ? Math.min(KIOSK_MENU_LIMITS.pages, menuPageCount(menu) + extraPages) : 1;
  const shownPage = Math.min(page, pages - 1);
  const tile = menu && slot != null ? menu.tiles[slot] ?? null : null;
  const layoutKey = menu ? (menu.style === "single" ? "single" : String(menu.cols)) : "";
  const categoryChoices = [
    ...categories.filter((c) => services.some((s) => s.categoryId === c.id)).map((c) => ({ key: `id:${c.id}`, name: c.name })),
    ...[...new Set(services.filter((s) => s.categoryId == null || !categories.some((c) => c.id === s.categoryId)).map((s) => (s.category ?? "").trim()))]
      .filter(Boolean).map((n) => ({ key: `name:${n}`, name: n })),
  ];
  const q = search.trim().toLowerCase();
  const pickable = services.filter((s) => !q || s.name.toLowerCase().includes(q) || (s.category ?? "").toLowerCase().includes(q));
  // A page with the editor's empty slots on it, even past the last button.
  const canvasMenu: KioskMenu | null = menu
    ? { ...menu, tiles: [...menu.tiles, ...Array(Math.max(0, pages * per - menu.tiles.length)).fill(null)] }
    : null;

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const url = await props.uploadImage(file);
      if (url && tile && slot != null) setTile(slot, { ...tile, imageUrl: url });
    } finally { setUploading(false); }
  };

  /** "Then…": what happens after a button or tap spot chooses a service, add-on or extra. */
  const thenField = (value: KioskNext | undefined, onChange: (n: KioskNext | undefined) => void) => (
    <label className="block rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600" data-testid="then-field">
      <span className="block text-sm font-semibold text-slate-900 mb-1">Then…</span>
      <select className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800" value={nextValue(value)} data-testid="then-select"
        onChange={(e) => onChange(parseNext(e.target.value))}>
        <option value="">Stay on this screen (they can choose more)</option>
        <option value="continue">Continue to the next step</option>
        <option value="staff">Go to choosing staff</option>
        <option value="review">Finish (go to the review)</option>
        {draft.menus.filter((m) => m.id !== menu?.id).map((m) => <option key={m.id} value={`menu:${m.id}`}>Open the screen "{m.name}"</option>)}
      </select>
      <span className="block mt-1">What happens after a client taps it and it's chosen.</span>
    </label>
  );
  const panel = (
    <div className="space-y-4">
      {/* The chosen tap spot or button: edited here, at the top of the panel. */}
      <div ref={selectionRef} className="empty:hidden">
      {props.view === "edit" && menu && menu.kind === "picture" && spot && (
        <div className="bg-white border-2 border-slate-900 rounded-2xl p-4 space-y-3" data-testid="picture-spot-panel">
          <p className="text-sm font-semibold text-slate-800">Tap spot: {spotName(spot)}</p>
          <p className="text-xs text-slate-500">What it does when tapped:</p>
          <div className="grid grid-cols-4 gap-1 rounded-md border border-slate-200 p-0.5">
            {(["service", "addon", "function", "menu"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setSpotTab(k)}
                className={`h-8 text-xs rounded ${spotTab === k ? "bg-slate-900 text-white" : "text-slate-600"}`}>
                {k === "service" ? "Service" : k === "addon" ? "Add-on" : k === "function" ? "Function" : "Screen"}
              </button>
            ))}
          </div>
          {spotTab === "service" && (
            <>
              <Input placeholder="Search services" value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="max-h-[45vh] overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg">
                {pickable.map((s2) => {
                  const on = spot.action.kind === "service" && spot.action.serviceId === s2.id;
                  return (
                    <button key={s2.id} type="button" className={`w-full text-left px-3 py-2 ${on ? "bg-slate-100" : "hover:bg-slate-50"}`} data-testid="spot-pick-service"
                      onClick={() => setSpotAction({ kind: "service", serviceId: s2.id })}>
                      <span className="block text-sm text-slate-800">{s2.name}{on ? " ✓" : ""}</span>
                      <span className="block text-xs text-slate-500">{s2.category || "No category"} · ${s2.price} · {s2.duration} min</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {spotTab === "addon" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Kiosk Extras</p>
                {extraForm !== "spot" && <Button size="sm" variant="outline" onClick={() => setExtraForm("spot")} data-testid="spot-new-extra">New extra</Button>}
              </div>
              {extraForm === "spot" && (
                <ExtraForm groups={extraGroups} submitLabel="Add and use" onCancel={() => setExtraForm(null)}
                  initial={{ group: spot.action.kind === "addon" ? (extras ?? []).find((x) => x.id === (spot.action as { addonId: number }).addonId)?.group ?? "" : extraGroups[0] ?? "" }}
                  onSubmit={async (x) => { const e = await createExtra(x); setSpotAction({ kind: "addon", addonId: e.id }); setExtraForm(null); }} />
              )}
              <div className="max-h-[30vh] overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg">
                {(extras ?? []).map((x) => {
                  const on = spot.action.kind === "addon" && spot.action.addonId === x.id;
                  return (
                    <button key={x.id} type="button" className={`w-full text-left px-3 py-2 ${on ? "bg-slate-100" : "hover:bg-slate-50"}`} data-testid="spot-pick-extra"
                      onClick={() => setSpotAction({ kind: "addon", addonId: x.id })}>
                      <span className="block text-sm text-slate-800">{x.name}{on ? " ✓" : ""}</span>
                      <span className="block text-xs text-slate-500">{priceText(x.price)}{x.group ? ` · ${x.group}` : ""}</span>
                    </button>
                  );
                })}
                {extras && !extras.length && <p className="px-3 py-3 text-sm text-slate-500">No extras yet. Add one, like a nail shape.</p>}
              </div>
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide pt-1">Add-ons</p>
            <div className="max-h-[30vh] overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg">
              {plainAddons.map((a) => {
                const on = spot.action.kind === "addon" && spot.action.addonId === a.id;
                return (
                  <button key={a.id} type="button" className={`w-full text-left px-3 py-2 ${on ? "bg-slate-100" : "hover:bg-slate-50"}`}
                    onClick={() => setSpotAction({ kind: "addon", addonId: a.id })}>
                    <span className="block text-sm text-slate-800">{a.name}{on ? " ✓" : ""}</span>
                    <span className="block text-xs text-slate-500">${a.price}{a.serviceIds.length ? ` · with ${a.serviceIds.length} ${a.serviceIds.length === 1 ? "service" : "services"}` : " · with any service"}</span>
                  </button>
                );
              })}
              {!plainAddons.length && <p className="px-3 py-4 text-sm text-slate-500">You have no add-ons yet.</p>}
            </div>
              <p className="text-xs text-slate-500">Clients choose a service first; extras and add-ons are added to it. In a group, choosing one replaces the other.</p>
            </div>
          )}
          {spotTab === "function" && (
            <div className="space-y-1">
              {(Object.keys(FUNCTION_NAMES) as KioskSpotFunction[]).map((fn) => {
                const on = spot.action.kind === "function" && spot.action.fn === fn;
                return (
                  <button key={fn} type="button" className={`w-full text-left px-3 py-2 rounded-lg border ${on ? "border-slate-900 bg-slate-50" : "border-slate-100 hover:bg-slate-50"}`}
                    onClick={() => setSpotAction({ kind: "function", fn })} data-testid={`spot-fn-${fn}`}>
                    <span className="block text-sm text-slate-800">{FUNCTION_NAMES[fn].name}{on ? " ✓" : ""}</span>
                    <span className="block text-xs text-slate-500">{FUNCTION_NAMES[fn].about}</span>
                  </button>
                );
              })}
            </div>
          )}
          {spotTab === "menu" && (
            <div className="space-y-1">
              {draft.menus.filter((m) => m.id !== menu.id).map((m) => {
                const on = spot.action.kind === "menu" && spot.action.menuId === m.id;
                return (
                  <button key={m.id} type="button" className={`w-full text-left px-3 py-2 rounded-lg text-sm border ${on ? "border-slate-900 bg-slate-50" : "border-slate-100 hover:bg-slate-50"}`}
                    onClick={() => setSpotAction({ kind: "menu", menuId: m.id })}>
                    {m.name}{on ? " ✓" : ""}
                  </button>
                );
              })}
              <Button variant="outline" size="sm" disabled={draft.menus.length >= KIOSK_MENU_LIMITS.menus}
                onClick={() => { const id = addScreen(); setSpotAction({ kind: "menu", menuId: id }); }}>New screen for this spot</Button>
            </div>
          )}
          {(spot.action.kind === "service" || spot.action.kind === "addon") && thenField(spot.next,
            (n) => changeSpots((list) => list.map((x) => (x.id === spot.id ? (n ? { ...x, next: n } : (({ next: _drop, ...rest }) => rest)(x)) : x))))}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => {
              if (menu.spots.length >= KIOSK_MENU_LIMITS.spots) return;
              const copy: KioskSpot = { ...spot, id: newId("spot"), x: Math.min(100 - spot.w, spot.x + 3), y: Math.min(100 - spot.h, spot.y + 3) };
              changeSpots((list) => [...list, copy]); setSpotId(copy.id);
            }}>Duplicate</Button>
            <Button variant="outline" size="sm" onClick={() => { changeSpots((list) => list.filter((x) => x.id !== spot.id)); setSpotId(null); }} data-testid="spot-delete">Delete</Button>
            <Button variant="ghost" size="sm" onClick={() => setSpotId(null)}>Done</Button>
          </div>
        </div>
      )}
      {props.view === "edit" && menu && menu.kind !== "picture" && slot != null && (
        <div className="bg-white border-2 border-slate-900 rounded-2xl p-4 space-y-3" data-testid="screens-slot-panel">
          {tile ? (
            <>
              <p className="text-sm font-semibold text-slate-800">
                {tile.kind === "service" ? (svcById.get(tile.serviceId!)?.name ?? "A service no longer on your menu")
                  : tile.kind === "addon" ? `+ ${addonMap.get(tile.addonId!)?.name ?? "An extra no longer on your menu"}`
                  : `Opens "${menusById.get(tile.menuId!)?.name ?? "a deleted screen"}"`}
              </p>
              <label className="block text-xs text-slate-500">
                Button name
                <Input className="mt-1" value={tile.label ?? ""} maxLength={KIOSK_MENU_LIMITS.label}
                  placeholder={tile.kind === "service" ? svcById.get(tile.serviceId!)?.name : tile.kind === "addon" ? addonMap.get(tile.addonId!)?.name : menusById.get(tile.menuId!)?.name}
                  onChange={(e) => setTile(slot, { ...tile, label: e.target.value || undefined })} />
              </label>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-lg border border-slate-200 bg-slate-100 overflow-hidden shrink-0">
                  {(tile.imageUrl || servicePicture(svcById.get(tile.serviceId ?? -1))) &&
                    <img src={(tile.imageUrl || servicePicture(svcById.get(tile.serviceId ?? -1)))!} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="flex flex-col items-start gap-1.5">
                  <label className="inline-flex items-center gap-1.5 text-sm border border-slate-200 rounded-md px-3 h-8 cursor-pointer bg-white hover:bg-slate-50">
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Picture
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploading}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
                  </label>
                  {tile.imageUrl && (
                    <button type="button" className="text-xs text-slate-500 underline" onClick={() => setTile(slot, { ...tile, imageUrl: undefined })}>
                      {tile.kind === "service" ? "Use the service's picture" : "No picture"}
                    </button>
                  )}
                </div>
              </div>
              {tile.kind === "menu" && tile.menuId && menusById.has(tile.menuId) && (
                <Button variant="outline" size="sm" onClick={() => setMenuId(tile.menuId!)}>Edit that screen</Button>
              )}
              {tile.kind !== "menu" && thenField(tile.next, (n) => setTile(slot, n ? { ...tile, next: n } : (({ next: _drop, ...rest }) => rest)(tile)))}
              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setTile(slot, null)} data-testid="screens-remove-button">Remove button</Button>
                <Button variant="ghost" size="sm" onClick={() => setSlot(null)}>Done</Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-slate-800">Add a button</p>
              <div className="inline-flex rounded-md border border-slate-200 p-0.5">
                {(["service", "extra", "screen"] as const).map((k) => (
                  <button key={k} type="button" onClick={() => setPickTab(k)}
                    className={`px-3 h-8 text-sm rounded ${pickTab === k ? "bg-slate-900 text-white" : "text-slate-600"}`}>
                    {k === "service" ? "A service" : k === "extra" ? "An extra" : "Open a screen"}
                  </button>
                ))}
              </div>
              {pickTab === "extra" ? (
                <div className="space-y-2">
                  {extraForm === "tile" ? (
                    <ExtraForm groups={extraGroups} submitLabel="Add and use" onCancel={() => setExtraForm(null)} initial={{ group: extraGroups[0] ?? "" }}
                      onSubmit={async (x) => { const e = await createExtra(x); setTile(slot, { id: newId("btn"), kind: "addon", addonId: e.id }); setExtraForm(null); setSlot(null); }} />
                  ) : <Button size="sm" variant="outline" onClick={() => setExtraForm("tile")}>New extra</Button>}
                  <div className="max-h-[45vh] overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg">
                    {[...(extras ?? []).map((x) => ({ id: x.id, name: x.name, sub: `${priceText(x.price)}${x.group ? ` · ${x.group}` : ""}` })),
                      ...plainAddons.map((a) => ({ id: a.id, name: a.name, sub: `Add-on · $${a.price}` }))].map((a) => (
                      <button key={a.id} type="button" className="w-full text-left px-3 py-2 hover:bg-slate-50"
                        onClick={() => { setTile(slot, { id: newId("btn"), kind: "addon", addonId: a.id }); setSlot(null); }}>
                        <span className="block text-sm text-slate-800">{a.name}</span>
                        <span className="block text-xs text-slate-500">{a.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : pickTab === "service" ? (
                <>
                  <Input placeholder="Search services" value={search} onChange={(e) => setSearch(e.target.value)} />
                  <div className="max-h-[50vh] overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-lg">
                    {pickable.map((s) => (
                      <button key={s.id} type="button" className="w-full text-left px-3 py-2 hover:bg-slate-50" data-testid="screens-pick-service"
                        onClick={() => { setTile(slot, { id: newId("btn"), kind: "service", serviceId: s.id }); setSlot(null); }}>
                        <span className="block text-sm text-slate-800">{s.name}</span>
                        <span className="block text-xs text-slate-500">{s.category || "No category"} · ${s.price} · {s.duration} min</span>
                      </button>
                    ))}
                    {!pickable.length && <p className="px-3 py-4 text-sm text-slate-500">No services match.</p>}
                  </div>
                </>
              ) : (
                <div className="space-y-1">
                  {draft.menus.filter((m) => m.id !== menu.id).map((m) => (
                    <button key={m.id} type="button" className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50 border border-slate-100"
                      onClick={() => { setTile(slot, { id: newId("btn"), kind: "menu", menuId: m.id }); setSlot(null); }}>
                      {m.name}
                    </button>
                  ))}
                  <Button variant="outline" size="sm" disabled={draft.menus.length >= KIOSK_MENU_LIMITS.menus}
                    onClick={() => { const id = addScreen(); setTile(slot, { id: newId("btn"), kind: "menu", menuId: id }); setSlot(null); }}>
                    New screen for this button
                  </Button>
                </div>
              )}
              <Button variant="ghost" size="sm" onClick={() => setSlot(null)}>Cancel</Button>
            </>
          )}
        </div>
      )}
      </div>
        <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-800">Use my own screens</p>
              <p className="text-xs text-slate-500">Off: the kiosk keeps its category cards and service list.</p>
            </div>
            <Switch checked={draft.menuMode === "screens"} aria-label="Use my own screens" data-testid="screens-mode"
              onCheckedChange={(v) => update((d) => ({ ...d, menuMode: v && d.startMenuId ? "screens" : "catalog" }))} />
          </div>
          <label className="block text-xs text-slate-500">
            Clients start on
            <select className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800"
              value={draft.startMenuId ?? ""} onChange={(e) => update((d) => ({ ...d, startMenuId: e.target.value || null }))}>
              {draft.menus.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
          <p className="text-sm font-medium text-slate-800">Screens</p>
          <div className="space-y-1">
            {draft.menus.map((m) => {
              const on = m.id === menu?.id;
              return (
                <div key={m.id} className={`flex items-stretch rounded-lg ${on ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"}`} data-testid="screen-row">
                  <button type="button" onClick={() => setMenuId(m.id)} className="flex-1 min-w-0 text-left px-3 py-2 text-sm">
                    <span className="block truncate">{m.name}{m.id === draft.startMenuId ? " · start" : ""}</span>
                    <span className={`block text-xs ${on ? "text-slate-300" : "text-slate-500"}`}>
                      {m.kind === "picture" ? `Picture · ${m.spots.length} tap spots` : `${m.style === "single" ? "One, centered" : `${m.cols} × ${m.rows}`} · ${m.tiles.filter(Boolean).length} buttons`}
                    </span>
                  </button>
                  <button type="button" aria-label={`Delete ${m.name}`} title="Delete this screen" data-testid="screen-delete"
                    className={`shrink-0 px-2.5 rounded-r-lg ${on ? "text-slate-300 hover:text-white" : "text-slate-400 hover:text-slate-700"}`}
                    onClick={() => { if (window.confirm(`Delete "${m.name}"? Buttons and tap spots that open it are removed too.`)) deleteScreen(m.id); }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {draft.builder === "easy" ? (
              <>
                <Button variant="outline" size="sm" disabled={draft.menus.length >= KIOSK_MENU_LIMITS.menus} onClick={() => setMenuId(addScreen())} data-testid="screens-new-buttons">New screen</Button>
                <Button variant="outline" size="sm" disabled={!services.length || draft.menus.length >= KIOSK_MENU_LIMITS.menus} onClick={buildFromCatalog}>Add screens from my catalog</Button>
              </>
            ) : (
              <Button variant="outline" size="sm" disabled={draft.menus.length >= KIOSK_MENU_LIMITS.menus} onClick={() => setMenuId(addScreen("Picture screen"))}
                data-testid="screens-new-picture">New picture screen</Button>
            )}
          </div>
        </section>


        {menu && menu.kind === "picture" && (
          <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3" data-testid="picture-settings">
            <label className="block text-xs text-slate-500">
              Screen name (for you)
              <Input className="mt-1" value={menu.name} maxLength={KIOSK_MENU_LIMITS.name}
                onChange={(e) => changeMenu(menu.id, (m) => ({ ...m, name: e.target.value }))} />
            </label>
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-800">Your picture</p>
              <p className="text-xs text-slate-500">
                Design the whole screen as one picture, {KIOSK_PICTURE.width} × {KIOSK_PICTURE.height} px. Start from the template so it fits the 15" kiosk exactly.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={downloadTemplate} data-testid="picture-template">Download template</Button>
                <label className="inline-flex items-center gap-1.5 text-sm border border-slate-200 rounded-md px-3 h-8 cursor-pointer bg-white hover:bg-slate-50">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {menu.imageUrl ? "Replace picture" : "Upload picture"}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploading} data-testid="picture-upload"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPicture(f); e.target.value = ""; }} />
                </label>
              </div>
              {pictureWarning && <p className="text-xs text-amber-700">{pictureWarning}</p>}
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-800">Show the kiosk footer</p>
                <p className="text-xs text-slate-500">Back, what the client chose, the total and Continue, over the bottom {KIOSK_PICTURE_FOOTER_PCT}% of your picture (the strip marked on the template).</p>
              </div>
              <Switch checked={menu.footer} aria-label="Show the kiosk footer" data-testid="picture-footer"
                onCheckedChange={(v) => changeMenu(menu.id, (m) => ({ ...m, footer: v }))} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-800">Tap spots</p>
                <Button size="sm" variant="outline" disabled={menu.spots.length >= KIOSK_MENU_LIMITS.spots} onClick={() => addSpot()} data-testid="picture-add-spot">Add tap spot</Button>
              </div>
              <p className="text-xs text-slate-500">
                A tap spot is an invisible button. Place it over a part of your picture and choose what it does.{" "}
                {props.onHelp && <button type="button" className="underline text-slate-700" onClick={() => props.onHelp!("picture")}>Show me how</button>}
              </p>
              <div className="space-y-1">
                {menu.spots.map((sp) => (
                  <button key={sp.id} type="button" onClick={() => setSpotId(sp.id)}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-sm truncate ${sp.id === spotId ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50 border border-slate-100"}`}>
                    {spotName(sp)}
                  </button>
                ))}
              </div>
            </div>
            {pictureProblems(menu).map((msg) => <p key={msg} className="text-xs text-amber-700" data-testid="picture-problem">{msg}</p>)}
            <button type="button" className="inline-flex items-center gap-1.5 text-xs text-slate-500 underline"
              onClick={() => { if (window.confirm(`Delete "${menu.name}"? Buttons and tap spots that open it are removed too.`)) deleteScreen(menu.id); }}>
              <Trash2 className="w-3.5 h-3.5" /> Delete this screen
            </button>
          </section>
        )}
        {menu && menu.kind !== "picture" && (
          <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
            <label className="block text-xs text-slate-500">
              Screen name (for you)
              <Input className="mt-1" value={menu.name} maxLength={KIOSK_MENU_LIMITS.name}
                onChange={(e) => changeMenu(menu.id, (m) => ({ ...m, name: e.target.value }))} />
            </label>
            <label className="block text-xs text-slate-500">
              Heading on the screen
              <Input className="mt-1" value={menu.title.en ?? ""} maxLength={60} placeholder="Hi {name}! What brings you in today?"
                onChange={(e) => changeMenu(menu.id, (m) => ({ ...m, title: { ...m.title, en: e.target.value } }))} />
              <span className="block mt-1">Empty: the kiosk's own greeting, in every language. {"{name}"} is the client's first name.</span>
            </label>
            <div>
              <p className="text-xs text-slate-500 mb-1.5">
                Layout{props.onHelp && <> · <button type="button" className="underline text-slate-700" onClick={() => props.onHelp!("easy")}>How layouts work</button></>}
              </p>
              <div className="grid grid-cols-5 gap-1.5">
                {LAYOUTS.map((l) => (
                  <button key={l.key} type="button" data-testid={`screens-layout-${l.key}`}
                    onClick={() => { changeMenu(menu.id, (m) => relayout(m, l.style, l.cols, m.style === "single" ? 3 : m.rows)); setPage(0); setExtraPages(0); setSlot(null); }}
                    className={`rounded-lg border p-1.5 flex flex-col items-center gap-1 ${layoutKey === l.key ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200"}`}>
                    <span className="w-6 h-10 rounded-sm border border-slate-300 p-0.5 grid gap-px"
                      style={{ gridTemplateColumns: `repeat(${l.cols}, 1fr)`, gridTemplateRows: l.style === "single" ? "1fr" : "repeat(3, 1fr)" }}>
                      {Array.from({ length: l.style === "single" ? 1 : l.cols * 3 }, (_, i) => (
                        <span key={i} className="bg-slate-300 rounded-[1px]" style={l.style === "single" ? { margin: "3px 1px" } : undefined} />
                      ))}
                    </span>
                    <span className="text-[10px] leading-tight text-slate-600 text-center">{l.name}</span>
                  </button>
                ))}
              </div>
              {menu.style === "grid" && (
                <label className="flex items-center justify-between mt-2 text-sm text-slate-700">
                  Rows on a page
                  <select className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm" value={menu.rows} data-testid="screens-rows"
                    onChange={(e) => { changeMenu(menu.id, (m) => relayout(m, "grid", m.cols, Number(e.target.value))); setPage(0); setExtraPages(0); setSlot(null); }}>
                    {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              )}
              <p className="text-xs text-slate-500 mt-1.5">
                {per} {per === 1 ? "button" : "buttons"} a page. The buttons always fill the 15" screen; more go on the next page.
              </p>
            </div>
            {categoryChoices.length > 0 && (
              <label className="block text-xs text-slate-500">
                Fill empty slots with a category's services
                <select className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800" value=""
                  onChange={(e) => fillFromCategory(e.target.value)} data-testid="screens-fill-category">
                  <option value="">Choose a category…</option>
                  {categoryChoices.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
                </select>
              </label>
            )}
            <button type="button" className="inline-flex items-center gap-1.5 text-xs text-slate-500 underline"
              onClick={() => { if (window.confirm(`Delete "${menu.name}"? Buttons that open it are removed too.`)) deleteScreen(menu.id); }}>
              <Trash2 className="w-3.5 h-3.5" /> Delete this screen
            </button>
          </section>
        )}
      {/* Rarely changed once chosen: last. */}
      {builderChoice}
    </div>
  );
  const canvas = (
    <div className="flex-1 min-w-0 h-full min-h-0 flex flex-col items-center gap-2 p-2">
        <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 self-center" data-testid="screens-view">
          {([["edit", "Edit screen"], ["preview", "Live preview"]] as const).map(([k, name]) => (
            <button key={k} type="button" data-testid={`screens-view-${k}`}
              onClick={() => { props.onView(k); if (k === "preview" && menu) props.previewScreen(menu.id); }}
              className={`px-3 h-8 text-sm rounded ${props.view === k ? "bg-slate-900 text-white" : "text-slate-600"}`}>{name}</button>
          ))}
        </div>
        {props.view === "preview" ? (
          <div className="w-full flex-1 min-h-0 flex">
            {props.renderPreview(menu ? (
              <button type="button" onClick={() => props.previewScreen(menu.id)} data-testid="preview-this-screen"
                className="px-2.5 h-8 text-xs rounded-md border border-slate-900 bg-white text-slate-900 hover:bg-slate-50">This screen</button>
            ) : null)}
          </div>
        ) : (<>
        {menu && menu.kind === "picture" && (
          <>
            <p className="text-sm text-slate-600">15" kiosk · your picture fills the whole screen</p>
            <div ref={canvasBox} className="flex-1 min-h-0 w-full flex justify-center outline-none" tabIndex={0} data-testid="picture-canvas-box"
              onKeyDown={(e) => {
                if (!spot) return;
                const step = e.shiftKey ? 2 : 0.5;
                const map: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
                if (map[e.key]) { e.preventDefault(); nudge(map[e.key][0], map[e.key][1], e.altKey); }
                if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); changeSpots((list) => list.filter((x) => x.id !== spot.id)); setSpotId(null); }
              }}>
              <div style={{ width: KIOSK_W * scale, height: KIOSK_H * scale }} className="rounded-[18px] border-[6px] border-slate-800 bg-slate-800 shadow-md overflow-hidden" data-testid="screens-canvas">
                <KioskPictureScreen menu={menu} mode="editor" colors={{ primary: palette.primary, bg: palette.bg, surface: palette.surface, text: palette.text, muted: palette.muted, border: palette.border }}
                  footer={{ backLabel: "← Back", continueLabel: "Continue →", summary: "What the client chose", total: draft.services.showPrice ? "$0" : null }}
                  activeSpotId={spotId} onSelectSpot={(id) => { setSpotId(id); if (id) canvasBox.current?.focus(); }}
                  onChangeSpot={(id, rect) => changeSpots((list) => list.map((x) => (x.id === id ? { ...x, ...rect } : x)))}
                  spotLabel={spotName} emptyText="Upload your picture (1080 × 1920). Download the template to start." />
              </div>
            </div>
            <p className="text-xs text-slate-500">Drag a tap spot to move it, drag its corners to size it. Arrow keys nudge it (Shift: more, Alt: size). Delete removes it.</p>
          </>
        )}
        {menu && menu.kind !== "picture" && canvasMenu && (
          <>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span>15" kiosk · page</span>
              {Array.from({ length: pages }, (_, i) => (
                <button key={i} type="button" onClick={() => { setPage(i); setSlot(null); }}
                  className={`w-7 h-7 rounded-md text-xs ${i === shownPage ? "bg-slate-900 text-white" : "border border-slate-200 bg-white"}`}>{i + 1}</button>
              ))}
              {pages < KIOSK_MENU_LIMITS.pages && (
                <button type="button" className="text-xs underline" onClick={() => { setExtraPages((n) => n + 1); setPage(pages); setSlot(null); }}>Add page</button>
              )}
            </div>
            <div ref={canvasBox} className="flex-1 min-h-0 w-full flex justify-center">
              <div style={{ width: KIOSK_W * scale, height: KIOSK_H * scale }} className="rounded-[18px] border-[6px] border-slate-800 bg-slate-800 shadow-md overflow-hidden" data-testid="screens-canvas">
                <KioskMenuScreen
                  menu={canvasMenu} page={shownPage} onPage={(pg) => { setPage(pg); setSlot(null); }}
                  services={svcById} menus={menusById} addons={addonMap}
                  heading={menu.title.en?.trim() ? menu.title.en.replace("{name}", "Alex") : "Hi Alex! What brings you in today?"}
                  eyebrow={`Check-in — ${props.storeName}`}
                  colors={palette} serif={draft.theme.look === "boutique"}
                  showPrice={draft.services.showPrice} showDuration={draft.services.showDuration}
                  mode="editor" activeSlot={slot}
                  onTile={(_, at) => setSlot(at)}
                  onEmptySlot={(at) => { setSlot(at); setPickTab("service"); setSearch(""); }}
                  onMoveTile={(from, to) => { moveTile(from, to); setSlot(to); }}
                  footer={
                    <div style={{ flexShrink: 0, height: "8cqmin", borderTop: `1px solid ${palette.border}`, background: palette.surface, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4cqmin", color: palette.muted, fontSize: "2.4cqmin" }}>
                      <span>← Back</span><span>Continue →</span>
                    </div>
                  }
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">Tap a slot to fill it, tap a button to change it, drag a button to move it.</p>
          </>
        )}
        </>)}
    </div>
  );
  return <>{props.children({ panel, canvas })}</>;
}
