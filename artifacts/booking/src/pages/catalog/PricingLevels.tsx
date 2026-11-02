/**
 * Catalog › Pricing Levels — barbershops and hair salons (owner, 2026-11-02; api-server routes/pricingLevels.ts).
 *
 * The owner makes their own levels (Standard, Senior, Master…), puts each professional on one, sets each service's
 * price per level, and can give one professional their own price for a service. Booking and checkout use, in order:
 * the professional's own price, their level's price, the service's standard price. Prices already booked never change.
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { confirm } from "@/lib/confirm";

interface Level { id: number; name: string; description: string | null; sortOrder: number; active: boolean }
interface Data {
  levels: Level[];
  services: { id: number; name: string; category: string; price: number }[];
  levelPrices: { serviceId: number; levelId: number; price: number }[];
  staff: { id: number; name: string; levelId: number | null }[];
  staffServices: { staffId: number; serviceId: number; price: number | null }[];
  missing: { staffId: number; staffName: string; levelName: string; serviceId: number; serviceName: string; standardPrice: number }[];
}

const KEY = ["/api/pricing-levels"];
const money = (n: number) => `$${n.toFixed(2).replace(/\.00$/, "")}`;

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || "That didn't save. Try again.");
  return data;
}

export default function PricingLevels() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery<Data>({ queryKey: KEY, queryFn: () => fetch("/api/pricing-levels", { credentials: "include" }).then(async (r) => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.message || "Could not load the pricing levels");
    return d;
  }) });
  const reload = () => qc.invalidateQueries({ queryKey: KEY });
  const run = async (fn: () => Promise<unknown>, done?: string) => {
    try { await fn(); await reload(); if (done) toast({ title: done }); }
    catch (err: any) { toast({ title: "Not saved", description: err?.message, variant: "destructive" }); }
  };

  // ── levels ──
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const addLevel = () => {
    if (!newName.trim()) return;
    void run(() => send("/api/pricing-levels", "POST", { name: newName.trim(), description: newDesc.trim() || undefined }), "Level added").then(() => { setNewName(""); setNewDesc(""); });
  };
  const moveLevel = (lv: Level, dir: -1 | 1) => {
    const list = [...(data?.levels ?? [])];
    const i = list.findIndex((x) => x.id === lv.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    void run(async () => { for (let k = 0; k < list.length; k++) if (list[k].sortOrder !== k) await send(`/api/pricing-levels/${list[k].id}`, "PATCH", { sortOrder: k }); });
  };
  const deleteLevel = async (lv: Level) => {
    if (!(await confirm(`Delete the ${lv.name} level? Its prices are removed. Appointments already booked keep their prices.`, { title: "Delete level", confirmLabel: "Delete", destructive: true }))) return;
    void run(() => send(`/api/pricing-levels/${lv.id}`, "DELETE"), "Level deleted");
  };

  // ── prices per level (edited here, saved per level) ──
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => { setDraft({}); }, [data]);
  const levelPrice = useMemo(() => new Map((data?.levelPrices ?? []).map((p) => [`${p.serviceId}:${p.levelId}`, p.price])), [data]);
  const cell = (serviceId: number, levelId: number) => {
    const k = `${serviceId}:${levelId}`;
    return k in draft ? draft[k] : levelPrice.has(k) ? String(levelPrice.get(k)) : "";
  };
  const changedFor = (levelId: number) => Object.keys(draft).filter((k) => k.endsWith(`:${levelId}`));
  const saveLevelPrices = (lv: Level) => {
    const keys = changedFor(lv.id);
    const prices = keys.map((k) => {
      const v = draft[k].trim();
      return { serviceId: Number(k.split(":")[0]), price: v === "" ? null : Number(v) };
    });
    if (prices.some((p) => p.price != null && (!Number.isFinite(p.price) || p.price < 0))) { toast({ title: "Prices must be $0 or more", variant: "destructive" }); return; }
    void run(() => send(`/api/pricing-levels/${lv.id}/prices`, "PUT", { prices }), `${lv.name} prices saved`);
  };

  // ── own prices ──
  const [ownStaff, setOwnStaff] = useState<number | "">("");
  const [ownService, setOwnService] = useState<number | "">("");
  const [ownPrice, setOwnPrice] = useState("");
  const setOwn = (staffId: number, serviceId: number, price: number | null, done: string) =>
    run(() => send(`/api/staff/${staffId}/service-price`, "PUT", { serviceId, price }), done);

  if (isLoading) return <AppLayout><p className="text-muted-foreground">Loading…</p></AppLayout>;
  if (error || !data) return <AppLayout><p className="text-muted-foreground">{(error as Error)?.message ?? "Could not load the pricing levels"}</p></AppLayout>;

  const activeLevels = data.levels.filter((l) => l.active);
  const levelName = (id: number | null) => data.levels.find((l) => l.id === id)?.name ?? null;
  const serviceName = (id: number) => data.services.find((s) => s.id === id)?.name ?? "Service";
  const staffName = (id: number) => data.staff.find((s) => s.id === id)?.name ?? "Team member";
  const own = data.staffServices.filter((x) => x.price != null);
  const servicesOf = (staffId: number) => data.staffServices.filter((x) => x.staffId === staffId).map((x) => x.serviceId);
  const categories = [...new Set(data.services.map((s) => s.category))];

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-display font-bold">Pricing Levels</h1>
        <p className="text-muted-foreground max-w-3xl">Charge different prices for the same service depending on who does it. Put each team member on a level and set each level's prices. A team member's own price, if you set one, comes first. Appointments already booked keep the price they were booked at.</p>
      </div>

      {data.missing.length > 0 && (
        <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" data-testid="pricing-missing">
          <p className="font-semibold">{data.missing.length} price{data.missing.length === 1 ? " is" : "s are"} missing</p>
          <p className="mb-2">These team members are on a level with no price for a service they do, so the service's standard price is used until you set one.</p>
          <ul className="list-disc pl-5 space-y-0.5">
            {data.missing.slice(0, 12).map((m) => <li key={`${m.staffId}:${m.serviceId}`}>{m.staffName} ({m.levelName}) · {m.serviceName} — standard {money(m.standardPrice)}</li>)}
            {data.missing.length > 12 && <li>…and {data.missing.length - 12} more</li>}
          </ul>
        </div>
      )}

      {/* Levels */}
      <section className="mb-6 bg-card border rounded-md p-6" data-testid="pricing-levels">
        <h2 className="text-lg font-semibold mb-1">Levels</h2>
        <p className="text-sm text-muted-foreground mb-4">For example Standard, Senior, Master. Switch a level off to stop using it without losing its prices.</p>
        {data.levels.length === 0 && <p className="text-sm text-muted-foreground mb-4">No levels yet. Everyone charges each service's standard price.</p>}
        <div className="space-y-2 mb-4">
          {data.levels.map((lv, i) => {
            const members = data.staff.filter((s) => s.levelId === lv.id);
            return (
              <div key={lv.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3" data-testid={`pricing-level-${lv.id}`}>
                <div className="flex flex-col">
                  <Button variant="ghost" size="sm" disabled={i === 0} onClick={() => moveLevel(lv, -1)} aria-label={`Move ${lv.name} up`}>▲</Button>
                  <Button variant="ghost" size="sm" disabled={i === data.levels.length - 1} onClick={() => moveLevel(lv, 1)} aria-label={`Move ${lv.name} down`}>▼</Button>
                </div>
                <Input className="w-44" defaultValue={lv.name} aria-label="Level name"
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== lv.name) void run(() => send(`/api/pricing-levels/${lv.id}`, "PATCH", { name: v }), "Level renamed"); }} />
                <Input className="flex-1 min-w-48" defaultValue={lv.description ?? ""} placeholder="Description (optional)" aria-label="Level description"
                  onBlur={(e) => { const v = e.target.value.trim(); if (v !== (lv.description ?? "")) void run(() => send(`/api/pricing-levels/${lv.id}`, "PATCH", { description: v || null })); }} />
                <span className="text-sm text-muted-foreground min-w-40">{members.length ? members.map((m) => m.name).join(", ") : "Nobody on this level"}</span>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={lv.active} onCheckedChange={(on) => void run(() => send(`/api/pricing-levels/${lv.id}`, "PATCH", { active: on }), on ? "Level switched on" : "Level switched off")} />
                  {lv.active ? "On" : "Off"}
                </label>
                <Button variant="ghost" size="sm" className="text-red-600" onClick={() => void deleteLevel(lv)}>Delete</Button>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input className="w-44" placeholder="New level name" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} data-testid="pricing-new-name" />
          <Input className="flex-1 min-w-48" placeholder="Description (optional)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} maxLength={200} />
          <Button onClick={addLevel} disabled={!newName.trim()} data-testid="pricing-add-level">Add level</Button>
        </div>
      </section>

      {/* Team */}
      <section className="mb-6 bg-card border rounded-md p-6">
        <h2 className="text-lg font-semibold mb-1">Team members</h2>
        <p className="text-sm text-muted-foreground mb-4">Choose each person's level. "No level" charges each service's standard price.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.staff.map((s) => (
            <label key={s.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
              <span className="font-medium">{s.name}</span>
              <select className="h-9 rounded-md border bg-background px-2" value={s.levelId ?? ""} data-testid={`pricing-staff-${s.id}`}
                onChange={(e) => void run(() => send(`/api/staff/${s.id}/pricing-level`, "PUT", { levelId: e.target.value ? Number(e.target.value) : null }), `${s.name} moved to ${levelName(e.target.value ? Number(e.target.value) : null) ?? "no level"}`)}>
                <option value="">No level</option>
                {data.levels.map((l) => <option key={l.id} value={l.id}>{l.name}{l.active ? "" : " (off)"}</option>)}
              </select>
            </label>
          ))}
        </div>
      </section>

      {/* Prices */}
      <section className="mb-6 bg-card border rounded-md p-6 overflow-x-auto">
        <h2 className="text-lg font-semibold mb-1">Prices</h2>
        <p className="text-sm text-muted-foreground mb-4">Each service's price on each level. Leave a box empty to use the standard price.</p>
        {activeLevels.length === 0 ? <p className="text-sm text-muted-foreground">Add a level first.</p> : (
          <table className="w-full text-sm" data-testid="pricing-grid">
            <thead>
              <tr className="text-left">
                <th className="py-2 pr-4">Service</th>
                <th className="py-2 pr-4 text-muted-foreground">Standard</th>
                {activeLevels.map((l) => <th key={l.id} className="py-2 pr-4">{l.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <Fragment key={cat}>
                  <tr><td colSpan={2 + activeLevels.length} className="pt-4 pb-1 text-xs font-semibold uppercase text-muted-foreground">{cat}</td></tr>
                  {data.services.filter((s) => s.category === cat).map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="py-1.5 pr-4">{s.name}</td>
                      <td className="py-1.5 pr-4 text-muted-foreground">{money(s.price)}</td>
                      {activeLevels.map((l) => (
                        <td key={l.id} className="py-1.5 pr-4">
                          <Input className="h-8 w-24" inputMode="decimal" placeholder={money(s.price)} value={cell(s.id, l.id)} aria-label={`${s.name} on ${l.name}`}
                            onChange={(e) => setDraft((d) => ({ ...d, [`${s.id}:${l.id}`]: e.target.value.replace(/[^\d.]/g, "") }))} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
              <tr>
                <td colSpan={2} />
                {activeLevels.map((l) => (
                  <td key={l.id} className="pt-3 pr-4">
                    <Button size="sm" disabled={changedFor(l.id).length === 0} onClick={() => saveLevelPrices(l)} data-testid={`pricing-save-${l.id}`}>Save {l.name}</Button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
      </section>

      {/* Own prices */}
      <section className="mb-6 bg-card border rounded-md p-6">
        <h2 className="text-lg font-semibold mb-1">A team member's own price</h2>
        <p className="text-sm text-muted-foreground mb-4">One person charges a different price for a service than their level does. Their own price comes first.</p>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={ownStaff} onChange={(e) => { setOwnStaff(e.target.value ? Number(e.target.value) : ""); setOwnService(""); }}>
            <option value="">Team member…</option>
            {data.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={ownService} disabled={ownStaff === ""} onChange={(e) => setOwnService(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Service…</option>
            {ownStaff !== "" && servicesOf(ownStaff).map((id) => <option key={id} value={id}>{serviceName(id)}</option>)}
          </select>
          <Input className="w-28" inputMode="decimal" placeholder="Price" value={ownPrice} onChange={(e) => setOwnPrice(e.target.value.replace(/[^\d.]/g, ""))} />
          <Button disabled={ownStaff === "" || ownService === "" || ownPrice === ""}
            onClick={() => void setOwn(ownStaff as number, ownService as number, Number(ownPrice), "Price saved").then(() => setOwnPrice(""))}>Set price</Button>
        </div>
        {own.length === 0 ? <p className="text-sm text-muted-foreground">Nobody has their own price.</p> : (
          <ul className="space-y-1 text-sm">
            {own.map((o) => (
              <li key={`${o.staffId}:${o.serviceId}`} className="flex items-center gap-3">
                <span>{staffName(o.staffId)} · {serviceName(o.serviceId)} · <strong>{money(o.price!)}</strong></span>
                <Button variant="ghost" size="sm" onClick={() => void setOwn(o.staffId, o.serviceId, null, "Own price removed")}>Remove</Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppLayout>
  );
}
