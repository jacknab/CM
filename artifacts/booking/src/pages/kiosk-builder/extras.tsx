/**
 * Kiosk Builder › Kiosk Extras (plans/kiosk-builder.md): kiosk-only items like nail shapes, free or with a price,
 * in groups where a client picks one. Add-ons underneath (/api/kiosk-builder/extras), so a pick lands on the
 * ticket and is charged at checkout.
 *
 * useKioskExtras() keeps the one list the builder uses everywhere (this section, the tap-spot and button pickers).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sameGroup, type KioskLayout } from "@shared/kiosk/layout";

/** A Kiosk Extra as the builder keeps it (GET /api/kiosk-builder/extras). */
export interface KioskExtra { id: number; name: string; price: number; duration: number; group: string | null }

export async function extrasApi<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: "include", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Something went wrong");
  return d as T;
}

export const priceText = (n: number) => (n > 0 ? `+$${n % 1 === 0 ? n : n.toFixed(2)}` : "Included");

export interface KioskExtrasStore {
  list: KioskExtra[] | null;
  groups: string[];
  create: (x: Omit<KioskExtra, "id">) => Promise<KioskExtra>;
  save: (id: number, x: Omit<KioskExtra, "id">) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

export function useKioskExtras(): KioskExtrasStore {
  const [list, setList] = useState<KioskExtra[] | null>(null);
  const load = useCallback(() => extrasApi<{ extras: KioskExtra[] }>("/api/kiosk-builder/extras").then((d) => setList(d.extras)).catch(() => setList([])), []);
  useEffect(() => { void load(); }, [load]);
  const groups = useMemo(() => [...new Set((list ?? []).map((x) => x.group).filter((g): g is string => !!g))], [list]);
  return {
    list, groups,
    create: async (x) => {
      const { extra } = await extrasApi<{ extra: KioskExtra }>("/api/kiosk-builder/extras", { method: "POST", body: JSON.stringify(x) });
      setList((cur) => [...(cur ?? []), extra]);
      return extra;
    },
    save: async (id, x) => {
      const { extra } = await extrasApi<{ extra: KioskExtra }>(`/api/kiosk-builder/extras/${id}`, { method: "PATCH", body: JSON.stringify(x) });
      setList((cur) => (cur ?? []).map((e) => (e.id === extra.id ? extra : e)));
    },
    remove: async (id) => {
      await extrasApi(`/api/kiosk-builder/extras/${id}`, { method: "DELETE" });
      setList((cur) => (cur ?? []).filter((e) => e.id !== id));
    },
  };
}

/** A form for one extra: name, price, extra minutes, group. */
export function ExtraForm(props: { initial?: Partial<KioskExtra>; groups: string[]; submitLabel: string; onSubmit: (x: Omit<KioskExtra, "id">) => Promise<void>; onCancel?: () => void }) {
  const [name, setName] = useState(props.initial?.name ?? "");
  const [price, setPrice] = useState(String(props.initial?.price ?? 0));
  const [duration, setDuration] = useState(String(props.initial?.duration ?? 0));
  const [group, setGroup] = useState(props.initial?.group ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const listId = useMemo(() => `extra-groups-${Math.random().toString(36).slice(2, 7)}`, []);
  const submit = async () => {
    setBusy(true); setError("");
    try { await props.onSubmit({ name: name.trim(), price: Number(price) || 0, duration: Math.round(Number(duration) || 0), group: group.trim() || null }); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3 bg-slate-50" data-testid="extra-form">
      <Input placeholder="Name, e.g. Coffin" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} data-testid="extra-name" />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-500">Price ($)
          <Input className="mt-1" type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} data-testid="extra-price" />
        </label>
        <label className="text-xs text-slate-500">Extra minutes
          <Input className="mt-1" type="number" min={0} max={480} step="5" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </label>
      </div>
      <label className="block text-xs text-slate-500">Group (pick one per group)
        <Input className="mt-1" list={listId} placeholder="e.g. Nail shape" maxLength={40} value={group} onChange={(e) => setGroup(e.target.value)} data-testid="extra-group" />
        <datalist id={listId}>{props.groups.map((g) => <option key={g} value={g} />)}</datalist>
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={!name.trim() || busy} onClick={() => void submit()} data-testid="extra-submit">{props.submitLabel}</Button>
        {props.onCancel && <Button size="sm" variant="ghost" onClick={props.onCancel}>Cancel</Button>}
      </div>
    </div>
  );
}

/** The Kiosk Extras section: add, edit, remove; "clients must choose one" per group. */
export function ExtrasPanel({ store, draft, update }: {
  store: KioskExtrasStore;
  draft: KioskLayout;
  update: (change: (d: KioskLayout) => KioskLayout) => void;
}) {
  const [form, setForm] = useState<null | "new" | number>(null);
  const extras = store.list;
  return (
    <div className="space-y-3" data-testid="extras-panel">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">Things clients choose only at the kiosk, like a nail shape.</p>
        {form !== "new" && <Button variant="outline" size="sm" onClick={() => setForm("new")} data-testid="extras-add">Add extra</Button>}
      </div>
      <p className="text-xs text-slate-500">
        Free or with a price. A pick goes on the client's ticket and is charged at checkout. Extras don't show on your booking site or in your
        add-ons. Put them on your screens as buttons or tap spots.
      </p>
      {form === "new" && (
        <ExtraForm groups={store.groups} submitLabel="Add" onCancel={() => setForm(null)} initial={{ group: store.groups[0] ?? "" }}
          onSubmit={async (x) => { await store.create(x); setForm(null); }} />
      )}
      <div className="space-y-1">
        {[...(extras ?? [])].sort((a, b) => (a.group ?? "￿").localeCompare(b.group ?? "￿") || a.id - b.id).map((x, i, list) => (
          <div key={x.id}>
            {(i === 0 || list[i - 1].group !== x.group) && (
              <div className="flex items-center justify-between gap-2 pt-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{x.group || "No group"}</p>
                {x.group && (() => {
                  const g = x.group;
                  const on = draft.requiredGroups.some((r) => sameGroup(r, g));
                  return (
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-600" data-testid="extra-group-required">
                      <input type="checkbox" checked={on}
                        onChange={(e) => update((d) => ({ ...d, requiredGroups: e.target.checked
                          ? [...d.requiredGroups.filter((r) => !sameGroup(r, g)), g]
                          : d.requiredGroups.filter((r) => !sameGroup(r, g)) }))} />
                      Clients must choose one
                    </label>
                  );
                })()}
              </div>
            )}
            {form === x.id ? (
              <ExtraForm groups={store.groups} submitLabel="Save" initial={x} onCancel={() => setForm(null)}
                onSubmit={async (v) => { await store.save(x.id, v); setForm(null); }} />
            ) : (
              <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-slate-50" data-testid="extra-row">
                <span className="text-sm text-slate-700 truncate">{x.name}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-slate-500">{priceText(x.price)}</span>
                  <button type="button" className="text-xs underline text-slate-500" onClick={() => setForm(x.id)}>Edit</button>
                  <button type="button" className="text-xs underline text-slate-500" onClick={async () => {
                    if (!window.confirm(`Remove "${x.name}"? Tickets that already have it keep it. Buttons and tap spots for it stop working.`)) return;
                    try { await store.remove(x.id); } catch (e: any) { window.alert(e.message); }
                  }}>Remove</button>
                </span>
              </div>
            )}
          </div>
        ))}
        {extras && !extras.length && form !== "new" && <p className="text-xs text-slate-500">None yet.</p>}
      </div>
    </div>
  );
}
