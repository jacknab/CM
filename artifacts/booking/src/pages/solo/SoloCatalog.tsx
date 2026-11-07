/**
 * Solo dashboard › Catalog (owner, 2026-11-06; plans/solo-web-dashboard.md): the Certxa Pro app's Catalog
 * (app/catalog/*, app/services.tsx) on the website — Categories, Services, Add-Ons, Add-on Groups, Packages, Deals and
 * Products. Each section is a list; adding or changing one opens a dialog that saves exactly what the app saves.
 */
import { useMemo, useState, type ReactNode } from "react";
import { NavLink, Navigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { soloApi } from "@/lib/soloApi";
import { SOLO_COLORS, useSolo } from "./SoloLayout";
import { money, refreshSolo } from "./soloBookings";
import {
  Checklist, ErrorText, errorText, Field, inputClass, inputStyle, minutesLabel, PhotoField, PrimaryButton, SecondaryButton, SoloModal, Toggle,
} from "./soloUi";

const SECTIONS = [
  { key: "categories", title: "Categories", hint: "Group your services" },
  { key: "services", title: "Services", hint: "Your menu, duration and rates" },
  { key: "addons", title: "Add-Ons", hint: "Extras clients add to a service" },
  { key: "addon-groups", title: "Add-on Groups", hint: "Add-ons several services share" },
  { key: "packages", title: "Packages", hint: "Services and add-ons sold together" },
  { key: "deals", title: "Deals", hint: "Vouchers for a package at a lower price" },
  { key: "products", title: "Products", hint: "Retail items you sell" },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];

export default function SoloCatalog() {
  const { section } = useParams();
  if (!section) return <Navigate to="/solo/catalog/services" replace />;
  const current = SECTIONS.find((s) => s.key === section);
  if (!current) return <Navigate to="/solo/catalog/services" replace />;
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 md:px-8 md:pt-8">
      <h1 className="text-[24px] font-semibold tracking-tight">Catalog</h1>
      <div className="mt-5 flex flex-col gap-6 md:flex-row">
        <nav className="flex gap-1 overflow-x-auto md:w-52 md:shrink-0 md:flex-col" data-testid="solo-catalog-nav">
          {SECTIONS.map((s) => (
            <NavLink key={s.key} to={`/solo/catalog/${s.key}`}
              className={({ isActive }) => `shrink-0 rounded-xl px-3 py-2 text-sm font-medium ${isActive ? "bg-[#F1ECFD] text-[#11152E]" : "text-[#6B6F86] hover:bg-white hover:text-[#11152E]"}`}>
              {s.title}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0 flex-1">
          <p className="mb-4 text-sm" style={{ color: SOLO_COLORS.muted }}>{current.hint}</p>
          {renderSection(current.key)}
        </div>
      </div>
    </div>
  );
}

function renderSection(key: SectionKey) {
  switch (key) {
    case "categories": return <Categories />;
    case "services": return <Services />;
    case "addons": return <Addons />;
    case "addon-groups": return <AddonGroups />;
    case "packages": return <Packages />;
    case "deals": return <Deals />;
    case "products": return <Products />;
  }
}

// ── Shared pieces ───────────────────────────────────────────────────────────────────────────────────────

function useList<T>(name: string, path: string, map: (rows: any[]) => T[]) {
  const { store } = useSolo();
  return useQuery<T[]>({ queryKey: ["solo", "catalog", name, store.id], queryFn: async () => map(await soloApi<any[]>(path).then((r) => (Array.isArray(r) ? r : []))) });
}

function Shell({ addLabel, onAdd, loading, error, empty, count, children }: {
  addLabel: string; onAdd: () => void; loading: boolean; error: unknown; empty: string; count: number; children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button type="button" onClick={onAdd} className="rounded-xl px-3.5 py-2 text-sm font-semibold text-white" style={{ background: SOLO_COLORS.primary }} data-testid="solo-catalog-add">{addLabel}</button>
      </div>
      {loading ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
        : error ? <p className="text-sm text-red-600">{errorText(error, "This list could not be loaded. Please try again.")}</p>
        : count === 0 ? <p className="rounded-2xl border bg-white px-4 py-6 text-center text-sm" style={{ borderColor: SOLO_COLORS.border, color: SOLO_COLORS.muted }}>{empty}</p>
        : children}
    </div>
  );
}

function Rows({ children, testId }: { children: ReactNode; testId?: string }) {
  return <ul className="divide-y overflow-hidden rounded-2xl border bg-white" style={{ borderColor: SOLO_COLORS.border }} data-testid={testId}>{children}</ul>;
}

function Row({ title, hint, right, onClick, testId, dim = false, after }: { title: string; hint?: string; right?: string; onClick: () => void; testId: string; dim?: boolean; after?: ReactNode }) {
  return (
    <li className="flex items-center" style={{ borderColor: SOLO_COLORS.border, opacity: dim ? 0.6 : 1 }}>
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left hover:bg-[#FBFAFE]" data-testid={testId}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{title}</span>
          {hint && <span className="block truncate text-xs" style={{ color: SOLO_COLORS.muted }}>{hint}</span>}
        </span>
        {right && <span className="shrink-0 text-sm font-semibold">{right}</span>}
      </button>
      {after}
    </li>
  );
}

/** A dialog's Save and Remove (drawn outside Shell: Shell hides its list area while a section is empty) , and what it says while saving. */
function EditDialog({ title, onClose, saving, error, onSave, removeLabel, onRemove, children, extra }: {
  title: string; onClose: () => void; saving: boolean; error: string; onSave: () => void; removeLabel?: string; onRemove?: () => void; children: ReactNode; extra?: ReactNode;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <SoloModal title={title} onClose={() => !saving && onClose()} wide>
      <div className="space-y-4">
        {children}
        <ErrorText>{error}</ErrorText>
        <PrimaryButton onClick={onSave} busy={saving} testId="solo-catalog-save">Save</PrimaryButton>
        {extra}
        {onRemove && removeLabel && (confirm ? (
          <div className="space-y-2 rounded-xl bg-[#F7F5FD] p-3">
            <p className="text-sm">{removeLabel}?</p>
            <SecondaryButton onClick={onRemove} busy={saving} danger testId="solo-catalog-remove-confirm">Yes, {removeLabel.toLowerCase()}</SecondaryButton>
            <button type="button" onClick={() => setConfirm(false)} className="w-full py-1 text-sm font-medium text-gray-500">Keep it</button>
          </div>
        ) : <SecondaryButton onClick={() => setConfirm(true)} disabled={saving} danger testId="solo-catalog-remove">{removeLabel}</SecondaryButton>)}
      </div>
    </SoloModal>
  );
}

/** Runs a save and refreshes every Solo list (bookings read services too). */
function useSaver() {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const run = async (work: () => Promise<unknown>, fallback: string, after?: () => void) => {
    if (saving) return;
    setSaving(true); setError("");
    try { await work(); await refreshSolo(qc); after?.(); }
    catch (e) { setError(errorText(e, fallback)); }
    finally { setSaving(false); }
  };
  return { saving, error, setError, run };
}

const decimal = (v: string) => v.replace(/[^\d.]/g, "");
const digits = (v: string) => v.replace(/\D/g, "");
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

// ── Categories ──────────────────────────────────────────────────────────────────────────────────────────

type Category = { id: number; name: string; color: string | null; imageUrl: string | null; hiddenFromPublic: boolean; sortOrder: number };
// The calendar card colours the website offers (components/services/CategoryManager.tsx).
const PALETTE: [string, string][] = [["lavender", "#c4b5fd"], ["periwinkle", "#a5b4fc"], ["sky", "#93c5fd"], ["teal", "#5eead4"], ["mint", "#6ee7b7"], ["lemon", "#fde047"], ["peach", "#fdba74"]];
const mapCategories = (rows: any[]): Category[] => rows.map((r) => ({
  id: Number(r.id), name: String(r.name ?? ""), color: r.color ?? null, imageUrl: r.imageUrl ?? null, hiddenFromPublic: Boolean(r.hiddenFromPublic), sortOrder: Number(r.sortOrder) || 0,
})).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

function Categories() {
  const qc = useQueryClient();
  const list = useList("categories", "/api/service-categories", mapCategories);
  const rows = list.data ?? [];
  const [draft, setDraft] = useState<Omit<Category, "sortOrder"> | null>(null);
  const { saving, error, setError, run } = useSaver();
  const [orderError, setOrderError] = useState("");

  const save = () => run(async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) throw new Error("Enter the name of the category.");
    const body = { name, color: draft.color, imageUrl: draft.imageUrl, hiddenFromPublic: draft.hiddenFromPublic };
    if (draft.id > 0) await soloApi(`/api/service-categories/${draft.id}`, { method: "PATCH", body });
    else await soloApi("/api/service-categories", { method: "POST", body: { ...body, sortOrder: rows.length } });
  }, "Could not save the category.", () => setDraft(null));
  const remove = () => run(() => soloApi(`/api/service-categories/${draft!.id}`, { method: "DELETE" }), "Could not remove the category.", () => setDraft(null));
  const move = async (index: number, by: -1 | 1) => {
    const next = [...rows];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved);
    setOrderError("");
    try { await soloApi("/api/service-categories/reorder", { method: "POST", body: { orderedIds: next.map((r) => r.id) } }); }
    catch (e) { setOrderError(errorText(e, "Could not change the order.")); }
    await refreshSolo(qc);
  };

  return (
    <>
    <Shell addLabel="Add category" onAdd={() => { setError(""); setDraft({ id: 0, name: "", color: null, imageUrl: null, hiddenFromPublic: false }); }}
      loading={list.isLoading} error={list.error} count={rows.length} empty="You have no categories yet. Add the first one.">
      <ErrorText>{orderError}</ErrorText>
      <Rows testId="solo-categories">
        {rows.map((r, i) => (
          <Row key={r.id} testId={`solo-category-${r.id}`} title={r.name} hint={r.hiddenFromPublic ? "Hidden from your booking site" : undefined}
            onClick={() => { setError(""); setDraft({ id: r.id, name: r.name, color: r.color, imageUrl: r.imageUrl, hiddenFromPublic: r.hiddenFromPublic }); }}
            after={
              <span className="flex shrink-0 gap-1 pr-3">
                <button type="button" aria-label={`Move ${r.name} up`} disabled={i === 0} onClick={() => void move(i, -1)} className="rounded-lg px-2 py-1 text-sm disabled:opacity-30" data-testid={`solo-category-up-${r.id}`}>↑</button>
                <button type="button" aria-label={`Move ${r.name} down`} disabled={i === rows.length - 1} onClick={() => void move(i, 1)} className="rounded-lg px-2 py-1 text-sm disabled:opacity-30" data-testid={`solo-category-down-${r.id}`}>↓</button>
              </span>
            } />
        ))}
      </Rows>
    </Shell>
      {draft && (
        <EditDialog title={draft.id > 0 ? "Edit category" : "New category"} onClose={() => setDraft(null)} saving={saving} error={error} onSave={save}
          removeLabel={draft.id > 0 ? "Remove category" : undefined} onRemove={remove}>
          <Field label="Name"><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="For example, Manicures" className={inputClass} style={inputStyle} data-testid="solo-category-name" /></Field>
          <div>
            <span className="mb-1 block text-xs font-semibold" style={{ color: SOLO_COLORS.muted }}>Calendar colour</span>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setDraft({ ...draft, color: null })} className="h-8 rounded-full border-2 bg-white px-3 text-xs" style={{ borderColor: !draft.color ? SOLO_COLORS.text : SOLO_COLORS.border }}>None</button>
              {PALETTE.map(([key, hex]) => (
                <button key={key} type="button" aria-label={key} onClick={() => setDraft({ ...draft, color: key })} className="h-8 w-8 rounded-full border-2"
                  style={{ background: hex, borderColor: draft.color === key ? SOLO_COLORS.text : "transparent" }} data-testid={`solo-category-colour-${key}`} />
              ))}
            </div>
          </div>
          <PhotoField label="Photo" uri={draft.imageUrl} onPick={(d) => setDraft({ ...draft, imageUrl: d })} onRemove={() => setDraft({ ...draft, imageUrl: null })} testId="solo-category-photo" />
          <Toggle title="Show on my booking site" value={!draft.hiddenFromPublic} onChange={(show) => setDraft({ ...draft, hiddenFromPublic: !show })} testId="solo-category-public" />
        </EditDialog>
      )}
    </>
  );
}

// ── Services ────────────────────────────────────────────────────────────────────────────────────────────

type OfferedAt = "place" | "client" | "any";
type Service = { id: number; name: string; duration: number; price: number; offeredAt: OfferedAt; categoryId: number | null; allowQuantity: boolean };
type ServiceDraft = { id: number; name: string; minutes: string; price: string; offeredAt: OfferedAt; categoryId: number | null; allowQuantity: boolean; groupIds: number[] };
type Group = { id: number; name: string; addonIds: number[]; serviceIds: number[] };
const mapServices = (rows: any[]): Service[] => rows.map((r) => ({
  id: Number(r.id), name: String(r.name ?? "Service"), duration: Number(r.duration) || 0, price: Number(r.price) || 0, allowQuantity: Boolean(r.allowQuantity),
  offeredAt: r.offeredAt === "place" || r.offeredAt === "client" ? r.offeredAt : "any", categoryId: r.categoryId == null ? null : Number(r.categoryId),
}));
const mapGroups = (rows: any[]): Group[] => rows.map((r) => ({ id: Number(r.id), name: String(r.name ?? ""), addonIds: (r.addonIds ?? []).map(Number), serviceIds: (r.serviceIds ?? []).map(Number) }));

function Services() {
  const { store } = useSolo();
  const services = useList("services", "/api/services", mapServices);
  const categories = useList("categories", "/api/service-categories", mapCategories);
  const groups = useList("addon-groups", "/api/addon-groups", mapGroups);
  // Only a business with its own place and house calls chooses where each service is done.
  const places = useQuery<{ eligible?: boolean; ownPlace?: string; houseCalls?: boolean }>({
    queryKey: ["solo", "work-places", store.id], queryFn: () => soloApi<any>("/api/work-places").catch(() => ({})),
  });
  const offersBoth = !!(places.data?.eligible && places.data.houseCalls && places.data.ownPlace !== "none");
  const ownPlace = places.data?.ownPlace === "home" ? "Home studio" : places.data?.ownPlace === "salon" ? "Salon" : "My place";
  const [draft, setDraft] = useState<ServiceDraft | null>(null);
  const [savedGroupIds, setSavedGroupIds] = useState<number[]>([]);
  const { saving, error, setError, run } = useSaver();
  const cats = categories.data ?? [];
  const allGroups = groups.data ?? [];

  const open = (s: Service) => {
    setError(""); setSavedGroupIds([]);
    setDraft({ id: s.id, name: s.name, minutes: String(s.duration), price: s.price.toFixed(2), offeredAt: s.offeredAt, allowQuantity: s.allowQuantity, categoryId: s.categoryId, groupIds: [] });
    if (allGroups.length === 0) return;
    soloApi<{ groupIds: number[] }>(`/api/services/${s.id}/addon-groups`).then((r) => {
      const ids = (r?.groupIds ?? []).map(Number);
      setSavedGroupIds(ids);
      setDraft((d) => (d && d.id === s.id ? { ...d, groupIds: ids } : d));
    }).catch(() => undefined);
  };
  const save = () => run(async () => {
    if (!draft) return;
    const name = draft.name.trim();
    const minutes = Number.parseInt(draft.minutes, 10);
    const price = Number(draft.price);
    if (!name) throw new Error("Enter the name of the service.");
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 720) throw new Error("Enter how long it takes, in minutes (5 to 720).");
    if (!draft.price || !Number.isFinite(price) || price < 0) throw new Error("Enter the price, for example 45 or 45.50.");
    const category = cats.find((c) => c.id === draft.categoryId);
    const body = { name, duration: minutes, price: price.toFixed(2), categoryId: category?.id ?? null, category: category?.name ?? "General", allowQuantity: draft.allowQuantity, ...(offersBoth ? { offeredAt: draft.offeredAt } : {}) };
    let id = draft.id;
    if (id > 0) await soloApi(`/api/services/${id}`, { method: "PATCH", body });
    else id = Number((await soloApi<{ id: number }>("/api/services", { method: "POST", body }))?.id) || 0;
    if (id > 0 && JSON.stringify(draft.groupIds) !== JSON.stringify(savedGroupIds)) await soloApi(`/api/services/${id}/addon-groups`, { method: "PUT", body: { groupIds: draft.groupIds } });
  }, "Could not save the service.", () => setDraft(null));
  const remove = () => run(() => soloApi(`/api/services/${draft!.id}`, { method: "DELETE" }), "Could not remove the service.", () => setDraft(null));

  const list = services.data ?? [];
  const byCategory = [
    ...cats.map((c) => ({ id: c.id, name: c.name, items: list.filter((s) => s.categoryId === c.id) })),
    { id: 0, name: "Uncategorized", items: list.filter((s) => !cats.some((c) => c.id === s.categoryId)) },
  ].filter((g) => g.items.length > 0);
  const where = (s: Service) => offersBoth && s.offeredAt === "place" ? ` · ${ownPlace} only` : offersBoth && s.offeredAt === "client" ? " · House calls only" : "";

  return (
    <>
    <Shell addLabel="Add service" onAdd={() => { setError(""); setSavedGroupIds([]); setDraft({ id: 0, name: "", minutes: "", price: "", offeredAt: "any", categoryId: null, allowQuantity: false, groupIds: [] }); }}
      loading={services.isLoading} error={services.error} count={list.length} empty="You have no services yet. Add the first one.">
      <div className="space-y-5" data-testid="solo-services">
        {byCategory.map((g) => (
          <div key={g.id}>
            {cats.length > 0 && <p className="mb-1.5 text-[11px] font-bold tracking-[0.1em]" style={{ color: SOLO_COLORS.muted }}>{g.name.toUpperCase()}</p>}
            <Rows>
              {g.items.map((s) => <Row key={s.id} testId={`solo-service-${s.id}`} title={s.name} hint={`${minutesLabel(s.duration)}${where(s)}`} right={money(Math.round(s.price * 100))} onClick={() => open(s)} />)}
            </Rows>
          </div>
        ))}
      </div>
    </Shell>
      {draft && (
        <EditDialog title={draft.id > 0 ? "Edit service" : "New service"} onClose={() => setDraft(null)} saving={saving} error={error} onSave={save}
          removeLabel={draft.id > 0 ? "Remove service" : undefined} onRemove={remove}>
          <Field label="Name"><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="For example, Gel manicure" className={inputClass} style={inputStyle} data-testid="solo-service-name" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Minutes"><input inputMode="numeric" value={draft.minutes} onChange={(e) => setDraft({ ...draft, minutes: digits(e.target.value) })} placeholder="60" className={inputClass} style={inputStyle} data-testid="solo-service-minutes" /></Field>
            <Field label="Price ($)"><input inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: decimal(e.target.value) })} placeholder="45.00" className={inputClass} style={inputStyle} data-testid="solo-service-price" /></Field>
          </div>
          {cats.length > 0 && (
            <Field label="Category">
              <select value={draft.categoryId ?? 0} onChange={(e) => setDraft({ ...draft, categoryId: Number(e.target.value) || null })} className={inputClass} style={inputStyle} data-testid="solo-service-category">
                <option value={0}>None</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          )}
          <Toggle title="Clients choose how many" hint="For anything priced per item. Clients see − 1 + on your website, up to 10." value={draft.allowQuantity} onChange={(allowQuantity) => setDraft({ ...draft, allowQuantity })} testId="solo-service-quantity" />
          {allGroups.length > 0 && (
            <div>
              <span className="mb-1 block text-xs font-semibold" style={{ color: SOLO_COLORS.muted }}>Add-on groups</span>
              <Checklist testId="solo-service-group" items={allGroups.map((g) => ({ id: g.id, title: g.name, hint: plural(g.addonIds.length, "add-on") }))} picked={draft.groupIds}
                onToggle={(id) => setDraft({ ...draft, groupIds: draft.groupIds.includes(id) ? draft.groupIds.filter((v) => v !== id) : [...draft.groupIds, id] })} empty="" />
            </div>
          )}
          {offersBoth && (
            <Field label="Where you offer it">
              <select value={draft.offeredAt} onChange={(e) => setDraft({ ...draft, offeredAt: e.target.value as OfferedAt })} className={inputClass} style={inputStyle} data-testid="solo-service-offered">
                <option value="any">{ownPlace} and house calls</option><option value="place">{ownPlace} only</option><option value="client">House calls only</option>
              </select>
            </Field>
          )}
        </EditDialog>
      )}
    </>
  );
}

// ── Add-Ons ─────────────────────────────────────────────────────────────────────────────────────────────

type Addon = { id: number; name: string; description: string; duration: number; price: number; hiddenFromPublic: boolean; allowQuantity: boolean; active: boolean };
const mapAddons = (rows: any[]): Addon[] => rows.map((r) => ({
  id: Number(r.id), name: String(r.name ?? ""), description: String(r.description ?? ""), duration: Number(r.duration) || 0, price: Number(r.price) || 0,
  hiddenFromPublic: Boolean(r.hiddenFromPublic), allowQuantity: Boolean(r.allowQuantity), active: r.isActive !== false,
})).sort((a, b) => a.name.localeCompare(b.name));

function Addons() {
  const addons = useList("addons", "/api/addons", mapAddons);
  const services = useList("services", "/api/services", mapServices);
  const links = useList("addon-links", "/api/service-addon-mappings", (rows) => rows.map((r) => ({ addonId: Number(r.addonId), serviceId: Number(r.serviceId) })));
  const groups = useList("addon-groups", "/api/addon-groups", mapGroups);
  const [draft, setDraft] = useState<{ id: number; name: string; description: string; minutes: string; price: string; hiddenFromPublic: boolean; allowQuantity: boolean; serviceIds: number[] } | null>(null);
  const { saving, error, setError, run } = useSaver();
  const rows = (addons.data ?? []).filter((a) => a.active);
  const svc = services.data ?? [];
  const linkList = links.data ?? [];
  // Groups given to at least one service, by add-on: "Offered with" lists only the services linked here by hand.
  const viaGroups = useMemo(() => {
    const by: Record<number, string[]> = {};
    (groups.data ?? []).filter((g) => g.serviceIds.length > 0).forEach((g) => g.addonIds.forEach((id) => (by[id] ||= []).push(g.name)));
    return by;
  }, [groups.data]);
  const serviceCount = (id: number) => linkList.filter((l) => l.addonId === id && svc.some((s) => s.id === l.serviceId)).length;

  const save = () => run(async () => {
    if (!draft) return;
    const name = draft.name.trim();
    const minutes = Number.parseInt(draft.minutes || "0", 10);
    const price = Number(draft.price);
    if (!name) throw new Error("Enter the name of the add-on.");
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 480) throw new Error("Enter the extra time in minutes (0 to 480).");
    if (!draft.price || !Number.isFinite(price) || price < 0) throw new Error("Enter the price, for example 10 or 10.50.");
    const body = { name, description: draft.description.trim() || null, duration: minutes, price: price.toFixed(2), hiddenFromPublic: draft.hiddenFromPublic, allowQuantity: draft.allowQuantity };
    const saved = draft.id > 0 ? await soloApi<{ id: number }>(`/api/addons/${draft.id}`, { method: "PATCH", body }) : await soloApi<{ id: number }>("/api/addons", { method: "POST", body });
    await soloApi(`/api/addons/${saved?.id ?? draft.id}/services`, { method: "POST", body: { serviceIds: draft.serviceIds } });
  }, "Could not save the add-on.", () => setDraft(null));
  const remove = () => run(() => soloApi(`/api/addons/${draft!.id}`, { method: "DELETE" }), "Could not remove the add-on.", () => setDraft(null));

  return (
    <>
    <Shell addLabel="Add add-on" onAdd={() => { setError(""); setDraft({ id: 0, name: "", description: "", minutes: "", price: "", hiddenFromPublic: false, allowQuantity: false, serviceIds: [] }); }}
      loading={addons.isLoading} error={addons.error} count={rows.length} empty="You have no add-ons yet. Add the first one.">
      <Rows testId="solo-addons">
        {rows.map((a) => {
          const n = serviceCount(a.id);
          const note = viaGroups[a.id] ? ` · Also through ${viaGroups[a.id].join(", ")}` : "";
          return <Row key={a.id} testId={`solo-addon-${a.id}`} title={a.name} right={money(Math.round(a.price * 100))}
            hint={`${a.duration ? `+${minutesLabel(a.duration)} · ` : ""}${n === 0 ? (note ? "No services linked here" : "Not offered with any service yet") : `With ${plural(n, "service")}`}${note}${a.hiddenFromPublic ? " · Hidden from your booking site" : ""}`}
            onClick={() => { setError(""); setDraft({ id: a.id, name: a.name, description: a.description, minutes: String(a.duration), price: a.price.toFixed(2), hiddenFromPublic: a.hiddenFromPublic, allowQuantity: a.allowQuantity, serviceIds: linkList.filter((l) => l.addonId === a.id).map((l) => l.serviceId) }); }} />;
        })}
      </Rows>
    </Shell>
      {draft && (
        <EditDialog title={draft.id > 0 ? "Edit add-on" : "New add-on"} onClose={() => setDraft(null)} saving={saving} error={error} onSave={save}
          removeLabel={draft.id > 0 ? "Remove add-on" : undefined} onRemove={remove}>
          <Field label="Name"><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="For example, French tips" className={inputClass} style={inputStyle} data-testid="solo-addon-name" /></Field>
          <Field label="Description"><textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Optional" rows={2} className={inputClass} style={inputStyle} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Extra minutes"><input inputMode="numeric" value={draft.minutes} onChange={(e) => setDraft({ ...draft, minutes: digits(e.target.value) })} placeholder="15" className={inputClass} style={inputStyle} data-testid="solo-addon-minutes" /></Field>
            <Field label="Price ($)"><input inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: decimal(e.target.value) })} placeholder="10.00" className={inputClass} style={inputStyle} data-testid="solo-addon-price" /></Field>
          </div>
          <div>
            <span className="mb-1 block text-xs font-semibold" style={{ color: SOLO_COLORS.muted }}>Offered with</span>
            {draft.id > 0 && viaGroups[draft.id] && <p className="mb-1.5 text-xs" style={{ color: SOLO_COLORS.muted }}>Also offered through {viaGroups[draft.id].length === 1 ? "group" : "groups"}: {viaGroups[draft.id].join(", ")}</p>}
            <Checklist testId="solo-addon-service" items={svc.map((s) => ({ id: s.id, title: s.name }))} picked={draft.serviceIds} empty="Add a service first."
              onToggle={(id) => setDraft({ ...draft, serviceIds: draft.serviceIds.includes(id) ? draft.serviceIds.filter((v) => v !== id) : [...draft.serviceIds, id] })} />
          </div>
          <Toggle title="Show on my booking site" value={!draft.hiddenFromPublic} onChange={(show) => setDraft({ ...draft, hiddenFromPublic: !show })} />
          <Toggle title="Clients choose how many" hint="For anything priced per item, like nail art per nail. Clients see − 1 + on your website, up to 10." value={draft.allowQuantity} onChange={(allowQuantity) => setDraft({ ...draft, allowQuantity })} />
        </EditDialog>
      )}
    </>
  );
}

// ── Add-on Groups ───────────────────────────────────────────────────────────────────────────────────────

function AddonGroups() {
  const groups = useList("addon-groups", "/api/addon-groups", mapGroups);
  const addons = useList("addons", "/api/addons", mapAddons);
  const [draft, setDraft] = useState<{ id: number; name: string; addonIds: number[] } | null>(null);
  const [copyName, setCopyName] = useState<string | null>(null);
  const { saving, error, setError, run } = useSaver();
  const rows = groups.data ?? [];
  // Active add-ons, plus any inactive one already in the group so saving doesn't drop it unseen.
  const choices = (addons.data ?? []).filter((a) => a.active || (draft?.addonIds.includes(a.id) ?? false));

  const save = () => run(async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) throw new Error("Enter the name of the group.");
    if (draft.id > 0) await soloApi(`/api/addon-groups/${draft.id}`, { method: "PATCH", body: { name, addonIds: draft.addonIds } });
    else await soloApi("/api/addon-groups", { method: "POST", body: { name, addonIds: draft.addonIds } });
  }, "Could not save the group.", () => setDraft(null));
  const remove = () => run(() => soloApi(`/api/addon-groups/${draft!.id}`, { method: "DELETE" }), "Could not delete the group.", () => setDraft(null));
  const duplicate = () => run(async () => {
    const name = (copyName ?? "").trim();
    if (!name) throw new Error("Enter the name of the group.");
    await soloApi(`/api/addon-groups/${draft!.id}/duplicate`, { method: "POST", body: { name } });
  }, "Could not duplicate the group.", () => { setCopyName(null); setDraft(null); });

  return (
    <>
    <Shell addLabel="Add group" onAdd={() => { setError(""); setDraft({ id: 0, name: "", addonIds: [] }); }}
      loading={groups.isLoading} error={groups.error} count={rows.length} empty="You have no add-on groups yet. Put add-ons several services share in one group.">
      <Rows testId="solo-addon-groups">
        {rows.map((g) => <Row key={g.id} testId={`solo-addon-group-${g.id}`} title={g.name}
          hint={`${plural(g.addonIds.length, "add-on")} · ${g.serviceIds.length === 0 ? "Not given to any service yet" : `With ${plural(g.serviceIds.length, "service")}`}`}
          onClick={() => { setError(""); setCopyName(null); setDraft({ id: g.id, name: g.name, addonIds: g.addonIds }); }} />)}
      </Rows>
    </Shell>
      {draft && (
        <EditDialog title={draft.id > 0 ? "Edit group" : "New group"} onClose={() => setDraft(null)} saving={saving} error={error} onSave={save}
          removeLabel={draft.id > 0 ? "Delete group" : undefined} onRemove={remove}
          extra={draft.id > 0 && (copyName === null
            ? <SecondaryButton onClick={() => setCopyName(`${draft.name} Copy`)} disabled={saving} testId="solo-addon-group-duplicate">Duplicate group</SecondaryButton>
            : (
              <div className="space-y-2 rounded-xl bg-[#F7F5FD] p-3">
                <Field label="What would you like to name this duplicate group?"><input autoFocus value={copyName} maxLength={80} onChange={(e) => setCopyName(e.target.value)} className={inputClass} style={inputStyle} data-testid="solo-addon-group-copy-name" /></Field>
                <PrimaryButton onClick={duplicate} busy={saving} testId="solo-addon-group-copy-save">Duplicate</PrimaryButton>
                <button type="button" onClick={() => setCopyName(null)} className="w-full py-1 text-sm font-medium text-gray-500">Cancel</button>
              </div>
            ))}>
          <Field label="Name"><input value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="For example, Gel extras" className={inputClass} style={inputStyle} data-testid="solo-addon-group-name" /></Field>
          <div>
            <span className="mb-1 block text-xs font-semibold" style={{ color: SOLO_COLORS.muted }}>Add-ons in this group</span>
            <Checklist testId="solo-addon-group-addon" empty="Add an add-on first (Catalog › Add-Ons)." picked={draft.addonIds}
              items={choices.map((a) => ({ id: a.id, title: a.active ? a.name : `${a.name} (inactive)`, hint: `${a.duration ? `+${minutesLabel(a.duration)} · ` : ""}${money(Math.round(a.price * 100))}` }))}
              onToggle={(id) => setDraft({ ...draft, addonIds: draft.addonIds.includes(id) ? draft.addonIds.filter((v) => v !== id) : [...draft.addonIds, id] })} />
          </div>
        </EditDialog>
      )}
    </>
  );
}

// ── Packages ────────────────────────────────────────────────────────────────────────────────────────────

type Pkg = { id: number; name: string; description: string; imageUrl: string | null; fixed: boolean; fixedPrice: string; hiddenFromPublic: boolean; price: number; duration: number; serviceIds: number[]; addonIds: number[] };
const mapPackages = (rows: any[]): Pkg[] => rows.map((r) => {
  const items: any[] = Array.isArray(r.items) ? r.items : [];
  return {
    id: Number(r.id), name: String(r.name ?? ""), description: String(r.description ?? ""), imageUrl: r.imageUrl ?? null,
    fixed: r.pricingMode === "fixed", fixedPrice: r.fixedPrice != null ? Number(r.fixedPrice).toFixed(2) : "", hiddenFromPublic: Boolean(r.hiddenFromPublic),
    price: Number(r.price) || 0, duration: Number(r.duration) || 0,
    serviceIds: items.filter((i) => i.itemType === "service").map((i) => Number(i.serviceId)), addonIds: items.filter((i) => i.itemType === "addon").map((i) => Number(i.addonId)),
  };
});

function Packages() {
  const packages = useList("packages", "/api/packages", mapPackages);
  const services = useList("services", "/api/services", mapServices);
  const addons = useList("addons", "/api/addons", mapAddons);
  const [draft, setDraft] = useState<Omit<Pkg, "price" | "duration"> | null>(null);
  const { saving, error, setError, run } = useSaver();
  const rows = packages.data ?? [];
  const svc = services.data ?? [];
  const add = (addons.data ?? []).filter((a) => a.active);
  const toggle = (list: number[], id: number) => (list.includes(id) ? list.filter((v) => v !== id) : [...list, id]);
  const sum = draft ? [...draft.serviceIds.map((id) => svc.find((s) => s.id === id)), ...draft.addonIds.map((id) => add.find((a) => a.id === id))]
    .reduce((t, it) => ({ price: t.price + (it?.price ?? 0), duration: t.duration + (it?.duration ?? 0) }), { price: 0, duration: 0 }) : null;

  const save = () => run(async () => {
    if (!draft) return;
    const name = draft.name.trim();
    const fixed = Number(draft.fixedPrice);
    if (!name) throw new Error("Enter the name of the package.");
    if (draft.serviceIds.length === 0) throw new Error("A package needs at least one service.");
    if (draft.fixed && (!draft.fixedPrice || !Number.isFinite(fixed) || fixed < 0)) throw new Error("Enter the package price, for example 80 or 79.50.");
    const body = {
      name, description: draft.description.trim() || null, imageUrl: draft.imageUrl, hiddenFromPublic: draft.hiddenFromPublic,
      pricingMode: draft.fixed ? "fixed" : "sum", fixedPrice: draft.fixed ? fixed.toFixed(2) : null,
      items: [...draft.serviceIds.map((serviceId) => ({ itemType: "service", serviceId })), ...draft.addonIds.map((addonId) => ({ itemType: "addon", addonId }))],
    };
    if (draft.id > 0) await soloApi(`/api/packages/${draft.id}`, { method: "PATCH", body });
    else await soloApi("/api/packages", { method: "POST", body: { ...body, sortOrder: rows.length } });
  }, "Could not save the package.", () => setDraft(null));
  const remove = () => run(() => soloApi(`/api/packages/${draft!.id}`, { method: "DELETE" }), "Could not remove the package.", () => setDraft(null));

  return (
    <>
    <Shell addLabel="Add package" onAdd={() => { setError(""); setDraft({ id: 0, name: "", description: "", imageUrl: null, fixed: false, fixedPrice: "", hiddenFromPublic: false, serviceIds: [], addonIds: [] }); }}
      loading={packages.isLoading} error={packages.error} count={rows.length} empty="You have no packages yet. Put services together.">
      <Rows testId="solo-packages">
        {rows.map((p) => {
          const n = p.serviceIds.length + p.addonIds.length;
          return <Row key={p.id} testId={`solo-package-${p.id}`} title={p.name} right={money(Math.round(p.price * 100))}
            hint={`${minutesLabel(p.duration)} · ${plural(n, "item")}${p.hiddenFromPublic ? " · Hidden from your booking site" : ""}`}
            onClick={() => { setError(""); const { price: _p, duration: _d, ...rest } = p; setDraft(rest); }} />;
        })}
      </Rows>
    </Shell>
      {draft && sum && (
        <EditDialog title={draft.id > 0 ? "Edit package" : "New package"} onClose={() => setDraft(null)} saving={saving} error={error} onSave={save}
          removeLabel={draft.id > 0 ? "Remove package" : undefined} onRemove={remove}>
          <Field label="Name"><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="For example, Mani + pedi" className={inputClass} style={inputStyle} data-testid="solo-package-name" /></Field>
          <Field label="Description"><textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Optional" rows={2} className={inputClass} style={inputStyle} /></Field>
          <div>
            <span className="mb-1 block text-xs font-semibold" style={{ color: SOLO_COLORS.muted }}>Services</span>
            <Checklist testId="solo-package-service" items={svc.map((s) => ({ id: s.id, title: s.name, hint: money(Math.round(s.price * 100)) }))} picked={draft.serviceIds} empty="Add a service first."
              onToggle={(id) => setDraft({ ...draft, serviceIds: toggle(draft.serviceIds, id) })} />
          </div>
          <div>
            <span className="mb-1 block text-xs font-semibold" style={{ color: SOLO_COLORS.muted }}>Add-ons</span>
            <Checklist testId="solo-package-addon" items={add.map((a) => ({ id: a.id, title: a.name, hint: money(Math.round(a.price * 100)) }))} picked={draft.addonIds} empty="No add-ons yet."
              onToggle={(id) => setDraft({ ...draft, addonIds: toggle(draft.addonIds, id) })} />
          </div>
          <Toggle title="Set my own package price" hint={`Together they are ${money(Math.round(sum.price * 100))} · ${minutesLabel(sum.duration)}`} value={draft.fixed} onChange={(fixed) => setDraft({ ...draft, fixed })} testId="solo-package-fixed" />
          {draft.fixed && <Field label="Package price ($)"><input inputMode="decimal" value={draft.fixedPrice} onChange={(e) => setDraft({ ...draft, fixedPrice: decimal(e.target.value) })} placeholder="0.00" className={inputClass} style={inputStyle} data-testid="solo-package-price" /></Field>}
          <PhotoField label="Photo" uri={draft.imageUrl} onPick={(d) => setDraft({ ...draft, imageUrl: d })} onRemove={() => setDraft({ ...draft, imageUrl: null })} testId="solo-package-photo" />
          <Toggle title="Show on my booking site" value={!draft.hiddenFromPublic} onChange={(show) => setDraft({ ...draft, hiddenFromPublic: !show })} />
        </EditDialog>
      )}
    </>
  );
}

// ── Deals ───────────────────────────────────────────────────────────────────────────────────────────────

type DealStatus = "active" | "paused" | "archived";
type Deal = { id: number; packageId: number; title: string; description: string; dealPrice: number; listPrice: number; capacity: number; sold: number; startsAt: string; endsAt: string; status: DealStatus; expiryDays: number };
const mapDeals = (rows: any[]): Deal[] => rows.map((r) => ({
  id: Number(r.id), packageId: Number(r.packageId), title: String(r.title ?? ""), description: String(r.marketingDescription ?? ""),
  dealPrice: Number(r.dealPrice) || 0, listPrice: Number(r.listPrice) || 0, capacity: Number(r.capacity) || 0, sold: Number(r.purchasedCount) || 0,
  startsAt: String(r.startsAt), endsAt: String(r.endsAt), status: r.status === "paused" || r.status === "archived" ? r.status : "active", expiryDays: Number(r.expiryDays) || 30,
}));
/** A <input type="date"> value ↔ the start of that day on this computer (the app uses the phone's day the same way). */
const dateValue = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromDateValue = (v: string) => { const [y, m, d] = v.split("-").map(Number); return y && m && d ? new Date(y, m - 1, d) : null; };
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });

function Deals() {
  const deals = useList("deals", "/api/deals", mapDeals);
  const packages = useList("packages", "/api/packages", mapPackages);
  const [draft, setDraft] = useState<{ id: number; packageId: number; title: string; description: string; dealPrice: string; capacity: string; starts: string; ends: string; expiryDays: number } | null>(null);
  const { saving, error, setError, run } = useSaver();
  const rows = deals.data ?? [];
  const pkgs = packages.data ?? [];
  const editing = draft && draft.id > 0 ? rows.find((r) => r.id === draft.id) : undefined;
  const statusText: Record<DealStatus, string> = { active: "On sale", paused: "Paused", archived: "Archived" };

  const save = () => run(async () => {
    if (!draft) return;
    const title = draft.title.trim();
    const price = Number(draft.dealPrice);
    const capacity = Number.parseInt(draft.capacity, 10);
    const starts = fromDateValue(draft.starts), ends = fromDateValue(draft.ends);
    const pkg = pkgs.find((p) => p.id === draft.packageId);
    if (draft.id === 0 && !pkg) throw new Error("Choose the package this deal is for.");
    if (!title) throw new Error("Give the deal a title.");
    if (!draft.dealPrice || !Number.isFinite(price) || price <= 0 || (pkg && price > pkg.price)) throw new Error(`Enter a deal price above $0${pkg ? ` and no more than ${money(Math.round(pkg.price * 100))}` : ""}.`);
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error("Enter how many vouchers are available (at least 1).");
    if (!starts || !ends) throw new Error("Choose the dates the deal is on sale.");
    if (starts >= ends) throw new Error("The end date must be after the start date.");
    const body = { title, marketingDescription: draft.description.trim() || null, dealPrice: price.toFixed(2), capacity, startsAt: starts.toISOString(), endsAt: ends.toISOString(), expiryDays: draft.expiryDays };
    if (draft.id > 0) await soloApi(`/api/deals/${draft.id}`, { method: "PATCH", body });
    else await soloApi("/api/deals", { method: "POST", body: { ...body, packageId: draft.packageId, status: "active" } });
  }, "Could not save the deal.", () => setDraft(null));
  const setStatus = (status: DealStatus) => run(() => soloApi(`/api/deals/${draft!.id}`, { method: "PATCH", body: { status } }), "Could not change the deal.", () => setDraft(null));

  const row = (d: Deal) => (
    <Row key={d.id} testId={`solo-deal-${d.id}`} dim={d.status !== "active"} title={d.title} right={money(Math.round(d.dealPrice * 100))}
      hint={`${statusText[d.status]} · ${d.sold} of ${d.capacity} sold · until ${shortDate(d.endsAt)}`}
      onClick={() => { setError(""); setDraft({ id: d.id, packageId: d.packageId, title: d.title, description: d.description, dealPrice: d.dealPrice.toFixed(2), capacity: String(d.capacity), starts: dateValue(new Date(d.startsAt)), ends: dateValue(new Date(d.endsAt)), expiryDays: d.expiryDays }); }} />
  );
  const current = rows.filter((r) => r.status !== "archived");
  const archived = rows.filter((r) => r.status === "archived");
  const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

  return (
    <>
    <Shell addLabel="Add deal" onAdd={() => { setError(""); setDraft({ id: 0, packageId: 0, title: "", description: "", dealPrice: "", capacity: "25", starts: dateValue(new Date()), ends: dateValue(inDays(30)), expiryDays: 30 }); }}
      loading={deals.isLoading} error={deals.error} count={rows.length} empty="You have no deals yet. Sell a package at a deal price.">
      {current.length > 0 && <Rows testId="solo-deals">{current.map(row)}</Rows>}
      {archived.length > 0 && <><p className="mb-1.5 mt-5 text-[11px] font-bold tracking-[0.1em]" style={{ color: SOLO_COLORS.muted }}>ARCHIVED</p><Rows>{archived.map(row)}</Rows></>}
    </Shell>
      {draft && (
        <EditDialog title={draft.id > 0 ? "Edit deal" : "New deal"} onClose={() => setDraft(null)} saving={saving} error={error} onSave={save}
          extra={editing && (
            <>
              {editing.status === "active" && <SecondaryButton onClick={() => setStatus("paused")} disabled={saving} testId="solo-deal-pause">Pause deal</SecondaryButton>}
              {editing.status === "paused" && <SecondaryButton onClick={() => setStatus("active")} disabled={saving} testId="solo-deal-resume">Put back on sale</SecondaryButton>}
              {editing.status !== "archived" && <SecondaryButton onClick={() => setStatus("archived")} disabled={saving} danger testId="solo-deal-archive">Archive deal</SecondaryButton>}
            </>
          )}>
          <div>
            <span className="mb-1 block text-xs font-semibold" style={{ color: SOLO_COLORS.muted }}>Package</span>
            {draft.id > 0 ? (
              <p className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: SOLO_COLORS.border }}>
                {pkgs.find((p) => p.id === draft.packageId)?.name ?? "Package"}{editing ? <span style={{ color: SOLO_COLORS.muted }}> · was {money(Math.round(editing.listPrice * 100))}</span> : null}
              </p>
            ) : pkgs.length === 0 ? <p className="text-sm" style={{ color: SOLO_COLORS.muted }}>Make a package first (Catalog › Packages).</p> : (
              <select value={draft.packageId || ""} onChange={(e) => setDraft({ ...draft, packageId: Number(e.target.value) || 0 })} className={inputClass} style={inputStyle} data-testid="solo-deal-package">
                <option value="">Choose a package</option>
                {pkgs.map((p) => <option key={p.id} value={p.id}>{p.name} · {money(Math.round(p.price * 100))}</option>)}
              </select>
            )}
          </div>
          <Field label="Title"><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="For example, Spring mani + pedi" className={inputClass} style={inputStyle} data-testid="solo-deal-title" /></Field>
          <Field label="Description"><textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Optional" rows={2} className={inputClass} style={inputStyle} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Deal price ($)"><input inputMode="decimal" value={draft.dealPrice} onChange={(e) => setDraft({ ...draft, dealPrice: decimal(e.target.value) })} placeholder="0.00" className={inputClass} style={inputStyle} data-testid="solo-deal-price" /></Field>
            <Field label="Vouchers available"><input inputMode="numeric" value={draft.capacity} onChange={(e) => setDraft({ ...draft, capacity: digits(e.target.value) })} placeholder="25" className={inputClass} style={inputStyle} data-testid="solo-deal-capacity" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="On sale from"><input type="date" value={draft.starts} onChange={(e) => setDraft({ ...draft, starts: e.target.value })} className={inputClass} style={inputStyle} data-testid="solo-deal-starts" /></Field>
            <Field label="Until"><input type="date" value={draft.ends} onChange={(e) => setDraft({ ...draft, ends: e.target.value })} className={inputClass} style={inputStyle} data-testid="solo-deal-ends" /></Field>
          </div>
          <Field label="Voucher can be used for">
            <select value={draft.expiryDays} onChange={(e) => setDraft({ ...draft, expiryDays: Number(e.target.value) })} className={inputClass} style={inputStyle} data-testid="solo-deal-expiry">
              {[30, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          </Field>
        </EditDialog>
      )}
    </>
  );
}

// ── Products ────────────────────────────────────────────────────────────────────────────────────────────

type Product = { id: number; name: string; brand: string; price: number; stock: number };
const mapProducts = (rows: any[]): Product[] => rows.map((r) => ({
  id: Number(r.id), name: String(r.name ?? ""), brand: String(r.brand ?? ""), price: Number(r.price) || 0, stock: Number(r.stock) || 0,
})).sort((a, b) => a.name.localeCompare(b.name));

function Products() {
  const products = useList("products", "/api/products", mapProducts);
  const [draft, setDraft] = useState<{ id: number; name: string; brand: string; price: string; stock: string } | null>(null);
  const { saving, error, setError, run } = useSaver();
  const rows = products.data ?? [];

  const save = () => run(async () => {
    if (!draft) return;
    const name = draft.name.trim();
    const price = Number(draft.price);
    const stock = Number.parseInt(draft.stock || "0", 10);
    if (!name) throw new Error("Enter the name of the product.");
    if (!draft.price || !Number.isFinite(price) || price < 0) throw new Error("Enter the price, for example 24 or 24.99.");
    if (!Number.isInteger(stock) || stock < 0) throw new Error("Enter how many you have in stock.");
    const body = { name, brand: draft.brand.trim() || null, price: price.toFixed(2), stock };
    if (draft.id > 0) await soloApi(`/api/products/${draft.id}`, { method: "PATCH", body });
    else await soloApi("/api/products", { method: "POST", body });
  }, "Could not save the product.", () => setDraft(null));
  const remove = () => run(() => soloApi(`/api/products/${draft!.id}`, { method: "DELETE" }), "Could not remove the product.", () => setDraft(null));

  return (
    <>
    <Shell addLabel="Add product" onAdd={() => { setError(""); setDraft({ id: 0, name: "", brand: "", price: "", stock: "" }); }}
      loading={products.isLoading} error={products.error} count={rows.length} empty="You have no products yet. Add the first one.">
      <Rows testId="solo-products">
        {rows.map((p) => <Row key={p.id} testId={`solo-product-${p.id}`} title={p.name} hint={`${p.brand ? `${p.brand} · ` : ""}${p.stock} in stock`} right={money(Math.round(p.price * 100))}
          onClick={() => { setError(""); setDraft({ id: p.id, name: p.name, brand: p.brand, price: p.price.toFixed(2), stock: String(p.stock) }); }} />)}
      </Rows>
    </Shell>
      {draft && (
        <EditDialog title={draft.id > 0 ? "Edit product" : "New product"} onClose={() => setDraft(null)} saving={saving} error={error} onSave={save}
          removeLabel={draft.id > 0 ? "Remove product" : undefined} onRemove={remove}>
          <Field label="Product name"><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="For example, Cuticle oil" className={inputClass} style={inputStyle} data-testid="solo-product-name" /></Field>
          <Field label="Brand"><input value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} placeholder="Optional" className={inputClass} style={inputStyle} data-testid="solo-product-brand" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price ($)"><input inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: decimal(e.target.value) })} placeholder="24.99" className={inputClass} style={inputStyle} data-testid="solo-product-price" /></Field>
            <Field label="In stock"><input inputMode="numeric" value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: digits(e.target.value) })} placeholder="10" className={inputClass} style={inputStyle} data-testid="solo-product-stock" /></Field>
          </div>
        </EditDialog>
      )}
    </>
  );
}
