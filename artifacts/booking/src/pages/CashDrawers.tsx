import { useState } from "react";
import { DollarSign, Trash2, Loader2, Pencil, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AppLayout } from "@/components/layout/AppLayout";
import { useInSettingsShell } from "@/lib/settings-shell-context";
import { useToast } from "@/hooks/use-toast";
import { useSelectedStore } from "@/hooks/use-store";
import { useRegisters } from "@/hooks/use-registers";
import {
  useCashDrawers,
  useCreateCashDrawer,
  useUpdateCashDrawer,
  useDeleteCashDrawer,
} from "@/hooks/use-cash-drawers";
import { Checkbox } from "@/components/ui/checkbox";
import type { CashDrawerWithStations } from "@/hooks/use-cash-drawers";

/**
 * Settings › Cash Drawers (owner, 2026-10-29). A salon sets up its cash drawer with its starting cash (set once; the
 * drawer is counted at Day Close) and ticks the POS stations that use it — several stations can share one drawer,
 * each station uses one. A POS station without a drawer can't take cash. A salon with no station rows has one
 * built-in station, "Main POS station" (the drawer's mainStation flag). Stations change only after the drawer's Day Close.
 */
const MAIN = "main";

type StationOption = { value: string; label: string };

/** "409: {"message":"..."}" → the message. */
const serverMessage = (err: unknown, fallback: string) => {
  const raw = String((err as Error)?.message ?? "");
  try { return JSON.parse(raw.slice(raw.indexOf(":") + 1)).message || fallback; } catch { return fallback; }
};

/** The stations a drawer is on, as option values. */
const stationValues = (d: Pick<CashDrawerWithStations, "registerIds" | "mainStation">) =>
  [...d.registerIds.map(String), ...(d.mainStation ? [MAIN] : [])];
/** The ticked option values → what the server takes. */
const stationsPatch = (values: string[]) => ({
  registerIds: values.filter((v) => v !== MAIN).map(Number),
  mainStation: values.includes(MAIN),
});

/** A tick box per POS station; one used by another drawer can't be ticked. */
function StationPicks({ stations, value, takenBy, onChange, testId }: {
  stations: StationOption[]; value: string[]; takenBy: Map<string, string>; onChange: (next: string[]) => void; testId: string;
}) {
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      {stations.map((s) => {
        const other = takenBy.get(s.value);
        const taken = !!other && !value.includes(s.value);
        const on = value.includes(s.value);
        return (
          <label key={s.value} className={`flex items-center gap-2 text-sm ${taken ? "text-slate-400" : "text-slate-700"}`}>
            <Checkbox checked={on} disabled={taken} data-testid={`${testId}-${s.value}`}
              onCheckedChange={(c) => onChange(c ? [...value, s.value] : value.filter((v) => v !== s.value))} />
            {s.label}{taken ? ` · uses ${other}` : ""}
          </label>
        );
      })}
    </div>
  );
}
const validAmount = (v: string) => v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= 0;

function DrawerRow({ drawer, stations, takenBy }: { drawer: CashDrawerWithStations; stations: StationOption[]; takenBy: Map<string, string> }) {
  const { toast } = useToast();
  const updateDrawer = useUpdateCashDrawer();
  const deleteDrawer = useDeleteCashDrawer();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(drawer.name);
  const [amount, setAmount] = useState(drawer.targetFloat ?? "");

  const handleRename = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === drawer.name) { setEditing(false); setName(drawer.name); return; }
    updateDrawer.mutate({ id: drawer.id, name: trimmed }, {
      onSuccess: () => setEditing(false),
      onError: (err) => { toast({ title: serverMessage(err, "Couldn't rename the drawer"), variant: "destructive" }); setName(drawer.name); },
    });
  };

  const handleAmountBlur = () => {
    if (amount.trim() === (drawer.targetFloat ?? "")) return;
    if (!validAmount(amount)) {
      toast({ title: "Enter the drawer's starting cash", variant: "destructive" });
      setAmount(drawer.targetFloat ?? "");
      return;
    }
    updateDrawer.mutate({ id: drawer.id, targetFloat: Number(amount).toFixed(2) }, {
      onError: (err) => toast({ title: serverMessage(err, "Couldn't save the starting cash"), variant: "destructive" }),
    });
  };

  const handleStations = (values: string[]) => {
    updateDrawer.mutate({ id: drawer.id, ...stationsPatch(values) }, {
      onError: (err) => toast({ title: serverMessage(err, "Couldn't change the POS stations"), variant: "destructive" }),
    });
  };

  const handleDelete = () => {
    if (!window.confirm(`Remove "${drawer.name}"? Its POS stations won't be able to take cash until they have a drawer again.`)) return;
    deleteDrawer.mutate(drawer.id, {
      onError: (err) => toast({ title: serverMessage(err, "Couldn't remove the drawer"), variant: "destructive" }),
    });
  };

  const current = stationValues(drawer);
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4" data-testid={`cash-drawer-${drawer.id}`}>
      <div className="flex items-center justify-between gap-2">
        {editing ? (
          <div className="flex items-center gap-2 flex-1">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") { setEditing(false); setName(drawer.name); } }}
              autoFocus
              className="max-w-xs"
            />
            <Button size="sm" onClick={handleRename} disabled={updateDrawer.isPending}>Save</Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-700">{drawer.name}</h3>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(true)} title="Rename">
              <Pencil className="w-3.5 h-3.5 text-slate-400" />
            </Button>
          </div>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-slate-700"
          onClick={handleDelete} disabled={deleteDrawer.isPending} title="Remove drawer">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Starting cash</label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input className="pl-8" value={amount} onChange={(e) => setAmount(e.target.value)} onBlur={handleAmountBlur}
              inputMode="decimal" placeholder="0.00" data-testid={`cash-drawer-amount-${drawer.id}`} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">POS stations that use it</label>
          <StationPicks stations={stations} value={current} takenBy={takenBy} onChange={handleStations} testId={`cash-drawer-stations-${drawer.id}`} />
        </div>
      </div>
    </div>
  );
}

export default function CashDrawers() {
  const { toast } = useToast();
  const inShell = useInSettingsShell();
  const { selectedStore } = useSelectedStore();
  const { data: allDrawers, isLoading } = useCashDrawers(selectedStore?.id);
  const { data: allRegisters } = useRegisters(selectedStore?.id);
  const createDrawer = useCreateCashDrawer();
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newStations, setNewStations] = useState<string[]>([]);

  const drawerList = allDrawers ?? [];
  const activeStations = (allRegisters ?? []).filter((r) => r.isActive);
  // A salon with no station rows runs one built-in station.
  const stations: StationOption[] = activeStations.length
    ? activeStations.map((r) => ({ value: String(r.id), label: r.name }))
    : [{ value: MAIN, label: "Main POS station" }];
  const takenBy = new Map<string, string>();
  for (const d of drawerList) for (const v of stationValues(d)) takenBy.set(v, d.name);

  const canAdd = !!newName.trim() && validAmount(newAmount) && !createDrawer.isPending;
  const handleAdd = () => {
    if (!canAdd) return;
    createDrawer.mutate(
      { name: newName.trim(), targetFloat: Number(newAmount).toFixed(2), ...stationsPatch(newStations) },
      {
        onSuccess: () => { setNewName(""); setNewAmount(""); setNewStations([]); },
        onError: (err) => toast({ title: serverMessage(err, "Couldn't add the cash drawer"), variant: "destructive" }),
      },
    );
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 space-y-8">
        {!inShell && (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Cash Drawers</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Set up your cash drawer with its starting cash and the POS stations that use it.
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-slate-400 py-12 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading…
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-sm text-slate-600" data-testid="cash-drawers-intro">
              A POS station needs a cash drawer to take cash. Enter the cash the drawer starts each day with, then tick
              the POS stations that use it — several stations can share one drawer. The drawer is counted at Day
              Close, and its stations can be changed after its Day Close.
            </div>

            {drawerList.map((d) => (
              <DrawerRow key={d.id} drawer={d} stations={stations} takenBy={takenBy} />
            ))}

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4" data-testid="cash-drawer-new">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Drawer name</label>
                  <Input placeholder='e.g. "Front Desk Drawer"' value={newName} onChange={(e) => setNewName(e.target.value)}
                    data-testid="cash-drawer-new-name" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Starting cash</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <Input className="pl-8" placeholder="0.00" inputMode="decimal" value={newAmount}
                      onChange={(e) => setNewAmount(e.target.value)} data-testid="cash-drawer-new-amount" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">POS stations that use it</label>
                  <StationPicks stations={stations} value={newStations} takenBy={takenBy} onChange={setNewStations} testId="cash-drawer-new-stations" />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleAdd} disabled={!canAdd} className="gap-1.5" data-testid="cash-drawer-add">
                  <Plus className="w-4 h-4" />
                  Add Drawer
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
