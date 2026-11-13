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
import {
  KIOSK_MENU_LIMITS, menuPageCount, menuSlotsPerPage, type KioskLayout, type KioskMenu, type KioskTile,
} from "@shared/kiosk/layout";

export interface CatalogService extends MenuService { category: string | null; categoryId?: number | null }
export interface CatalogCategory { id: number; name: string; imageUrl: string | null }

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
    id: newId("screen"), name, title: {}, style: "grid", cols: 3, rows: 4,
    tiles: svcs.slice(0, 12 * KIOSK_MENU_LIMITS.pages).map((s) => ({ id: newId("btn"), kind: "service", serviceId: s.id })),
  });
  if (groups.length <= 1) {
    const only = serviceScreen("Services", groups[0]?.services ?? []);
    return { menus: [only], start: only.id };
  }
  const subs = groups.slice(0, KIOSK_MENU_LIMITS.menus - 1).map((g) => ({ g, m: serviceScreen(g.name, g.services) }));
  const cols = subs.length <= 4 ? 2 : 3;
  const home: KioskMenu = {
    id: newId("screen"), name: "Start", title: {}, style: "grid", cols, rows: Math.min(6, Math.max(2, Math.ceil(subs.length / cols))),
    tiles: subs.map(({ g, m }) => ({ id: newId("btn"), kind: "menu", menuId: m.id, ...(g.imageUrl ? { imageUrl: g.imageUrl } : {}) })),
  };
  return { menus: [home, ...subs.map((x) => x.m)], start: home.id };
}

export function ScreensEditor(props: {
  draft: KioskLayout;
  update: (change: (d: KioskLayout) => KioskLayout) => void;
  services: CatalogService[];
  categories: CatalogCategory[];
  storeName: string;
  uploadImage: (file: File) => Promise<string | null>;
}) {
  const { draft, update, services, categories } = props;
  const [menuId, setMenuId] = useState<string | null>(draft.startMenuId ?? draft.menus[0]?.id ?? null);
  const [page, setPage] = useState(0);
  const [extraPages, setExtraPages] = useState(0);
  const [slot, setSlot] = useState<number | null>(null);
  const [pickTab, setPickTab] = useState<"service" | "screen">("service");
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const canvasBox = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);

  const menu = draft.menus.find((m) => m.id === menuId) ?? null;
  const svcById = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const menusById = useMemo(() => new Map(draft.menus.map((m) => [m.id, m])), [draft.menus]);
  const palette = { ...LOOK_PALETTES[draft.theme.look] };
  const own = draft.theme.colors;
  if (own.primary) palette.primary = own.primary;
  if (own.background) palette.bg = own.background;
  if (own.surface) palette.surface = own.surface;
  if (own.text) palette.text = own.text;

  useEffect(() => { if (!menu && draft.menus[0]) setMenuId(draft.menus[0].id); }, [menu, draft.menus]);
  useEffect(() => { setPage(0); setExtraPages(0); setSlot(null); }, [menuId]);
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

  const addScreen = (name = "New screen"): string => {
    const m: KioskMenu = { id: newId("screen"), name, title: {}, style: "grid", cols: 3, rows: 4, tiles: [] };
    update((d) => ({ ...d, menus: [...d.menus, m], startMenuId: d.startMenuId ?? m.id }));
    return m.id;
  };
  const deleteScreen = (id: string) => {
    update((d) => {
      const menus = d.menus.filter((m) => m.id !== id)
        // and every button that opened it
        .map((m) => ({ ...m, tiles: m.tiles.map((t) => (t?.kind === "menu" && t.menuId === id ? null : t)) }));
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

  if (!draft.menus.length) {
    return (
      <div className="max-w-xl mx-auto p-8 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Your own screens</h2>
        <p className="text-sm text-slate-600">
          Design the screens clients tap through to pick their services, like the buttons on a POS: choose how many buttons go
          across and down, and put a service or a link to another screen on each one. Until you switch them on, your kiosk keeps
          its category cards and service list.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={buildFromCatalog} disabled={!services.length} data-testid="screens-build-from-catalog">Build screens from my catalog</Button>
          <Button variant="outline" onClick={() => setMenuId(addScreen())}>Start with a blank screen</Button>
        </div>
      </div>
    );
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

  return (
    <div className="h-full min-h-0 flex flex-col lg:flex-row">
      {/* ── Screens and their settings ── */}
      <div className="lg:w-[340px] shrink-0 overflow-y-auto p-4 space-y-4 border-r border-slate-200">
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
            {draft.menus.map((m) => (
              <button key={m.id} type="button" onClick={() => setMenuId(m.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm ${m.id === menu?.id ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"}`}>
                {m.name}{m.id === draft.startMenuId ? " · start" : ""}
                <span className={`block text-xs ${m.id === menu?.id ? "text-slate-300" : "text-slate-500"}`}>
                  {m.style === "single" ? "One, centered" : `${m.cols} × ${m.rows}`} · {m.tiles.filter(Boolean).length} buttons
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" disabled={draft.menus.length >= KIOSK_MENU_LIMITS.menus} onClick={() => setMenuId(addScreen())}>New screen</Button>
            <Button variant="outline" size="sm" disabled={!services.length || draft.menus.length >= KIOSK_MENU_LIMITS.menus} onClick={buildFromCatalog}>Add screens from my catalog</Button>
          </div>
        </section>

        {menu && (
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
              <p className="text-xs text-slate-500 mb-1.5">Layout</p>
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
      </div>

      {/* ── The 15" kiosk canvas ── */}
      <div className="flex-1 min-w-0 min-h-[560px] flex flex-col items-center p-4 gap-2">
        {menu && canvasMenu && (
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
                  services={svcById} menus={menusById}
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
      </div>

      {/* ── The chosen slot ── */}
      {menu && slot != null && (
        <div className="lg:w-[320px] shrink-0 overflow-y-auto p-4 border-l border-slate-200 bg-white space-y-3" data-testid="screens-slot-panel">
          {tile ? (
            <>
              <p className="text-sm font-semibold text-slate-800">
                {tile.kind === "service" ? (svcById.get(tile.serviceId!)?.name ?? "A service no longer on your menu") : `Opens "${menusById.get(tile.menuId!)?.name ?? "a deleted screen"}"`}
              </p>
              <label className="block text-xs text-slate-500">
                Button name
                <Input className="mt-1" value={tile.label ?? ""} maxLength={KIOSK_MENU_LIMITS.label}
                  placeholder={tile.kind === "service" ? svcById.get(tile.serviceId!)?.name : menusById.get(tile.menuId!)?.name}
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
              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setTile(slot, null)} data-testid="screens-remove-button">Remove button</Button>
                <Button variant="ghost" size="sm" onClick={() => setSlot(null)}>Done</Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-slate-800">Add a button</p>
              <div className="inline-flex rounded-md border border-slate-200 p-0.5">
                {(["service", "screen"] as const).map((k) => (
                  <button key={k} type="button" onClick={() => setPickTab(k)}
                    className={`px-3 h-8 text-sm rounded ${pickTab === k ? "bg-slate-900 text-white" : "text-slate-600"}`}>
                    {k === "service" ? "A service" : "Open a screen"}
                  </button>
                ))}
              </div>
              {pickTab === "service" ? (
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
  );
}
