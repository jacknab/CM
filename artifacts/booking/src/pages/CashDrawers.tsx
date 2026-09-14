import { useState } from "react";
import { DollarSign, Trash2, Loader2, Pencil, Plus, Landmark } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import type { CashDrawer, Register } from "@shared/schema";

const NO_REGISTER = "none";

function DrawerRow({ drawer, registerOptions }: { drawer: CashDrawer; registerOptions: Register[] }) {
  const { toast } = useToast();
  const updateDrawer = useUpdateCashDrawer();
  const deleteDrawer = useDeleteCashDrawer();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(drawer.name);
  const [targetFloat, setTargetFloat] = useState(drawer.targetFloat ?? "");

  const handleRename = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === drawer.name) { setEditing(false); setName(drawer.name); return; }
    updateDrawer.mutate({ id: drawer.id, name: trimmed }, {
      onSuccess: () => setEditing(false),
      onError: () => { toast({ title: "Failed to rename drawer", variant: "destructive" }); setName(drawer.name); },
    });
  };

  const handleFloatBlur = () => {
    const trimmed = targetFloat.trim();
    const current = drawer.targetFloat ?? "";
    if (trimmed === current) return;
    updateDrawer.mutate(
      { id: drawer.id, targetFloat: trimmed === "" ? null : Number(trimmed).toFixed(2) },
      { onError: () => toast({ title: "Failed to update target float", variant: "destructive" }) },
    );
  };

  const handleRegisterChange = (value: string) => {
    updateDrawer.mutate(
      { id: drawer.id, registerId: value === NO_REGISTER ? null : Number(value) },
      { onError: () => toast({ title: "Failed to update linked register", variant: "destructive" }) },
    );
  };

  const handleDelete = () => {
    if (!window.confirm(`Remove "${drawer.name}"? Its open/closed session history is kept, just unlinked.`)) return;
    deleteDrawer.mutate(drawer.id, {
      onError: () => toast({ title: "Failed to delete cash drawer", variant: "destructive" }),
    });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
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
            <Landmark className="w-5 h-5 text-teal-500" />
            <h3 className="font-semibold text-slate-700">{drawer.name}</h3>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(true)} title="Rename">
              <Pencil className="w-3.5 h-3.5 text-slate-400" />
            </Button>
          </div>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
          onClick={handleDelete} disabled={deleteDrawer.isPending} title="Remove drawer">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Linked register (optional)</label>
          <Select value={drawer.registerId ? String(drawer.registerId) : NO_REGISTER} onValueChange={handleRegisterChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_REGISTER}>No specific register</SelectItem>
              {registerOptions.map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Target float (optional)</label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <Input
              className="pl-8"
              placeholder="Store default"
              value={targetFloat}
              onChange={(e) => setTargetFloat(e.target.value)}
              onBlur={handleFloatBlur}
              inputMode="decimal"
            />
          </div>
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

  const drawerList = allDrawers ?? [];
  const registerOptions = allRegisters ?? [];

  const handleAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    createDrawer.mutate({ name: trimmed }, {
      onSuccess: () => setNewName(""),
      onError: () => toast({ title: "Failed to add cash drawer", variant: "destructive" }),
    });
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 space-y-8">
        {!inShell && (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Cash Drawers</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Set up multiple physical cash drawers, each with its own Day Close and target float.
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
            {drawerList.length === 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-sm text-slate-600">
                You're running a single shared cash drawer today — no setup needed. Add a drawer here only if
                your salon uses more than one physical cash box (drawer count doesn't need to match your
                number of registers — e.g. two checkout stations can still share one drawer).
              </div>
            )}

            {drawerList.map((d) => (
              <DrawerRow key={d.id} drawer={d} registerOptions={registerOptions} />
            ))}

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Input
                  placeholder='e.g. "Main Drawer" or "Drawer 2"'
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                />
                <Button onClick={handleAdd} disabled={!newName.trim() || createDrawer.isPending} className="gap-1.5 shrink-0">
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
