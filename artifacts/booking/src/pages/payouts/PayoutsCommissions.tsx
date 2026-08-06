import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSelectedStore } from "@/hooks/use-store";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit2, Trash2, Users, Star, ToggleLeft, ToggleRight, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  type CommissionStructure,
  COMMISSION_PRESETS,
  SplitBar,
  CommissionStructureDialog,
} from "./commissionComponents";

// ─── Structure Card ───────────────────────────────────────────────────────────

function StructureCard({
  s, onEdit, onDelete, onToggle, onSetDefault, toggling,
}: {
  s: CommissionStructure;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onSetDefault: () => void;
  toggling: boolean;
}) {
  const emp   = Number(s.employeePercent);
  const house = Number(s.housePercent);
  const totalAssigned = (s.assignedContractors ?? 0) + (s.assignedStaff ?? 0);

  const APPLIES_LABEL: Record<string, string> = {
    both: "Employees & Contractors",
    employee: "Employees only",
    contractor: "Contractors only",
  };

  return (
    <Card className={cn(
      "rounded-2xl border shadow-sm transition-shadow hover:shadow-md relative overflow-hidden",
      s.isDefault ? "border-teal-300 ring-1 ring-teal-200" : "border-gray-100"
    )}>
      <button
        onClick={onSetDefault}
        disabled={s.isDefault}
        title={s.isDefault ? "Default structure" : "Set as default"}
        className={cn(
          "absolute top-0 right-0 flex items-center gap-1 px-2.5 py-1 rounded-bl-xl text-[10px] font-bold uppercase tracking-wide transition-all",
          s.isDefault
            ? "bg-teal-500 text-white cursor-default"
            : "bg-gray-100 text-gray-400 hover:bg-amber-400 hover:text-white cursor-pointer"
        )}
      >
        <Star className="w-3 h-3" />
        {s.isDefault ? "Default" : "Set Default"}
      </button>

      <CardContent className="p-5 pt-8">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900 text-[15px]" style={{ fontFamily: "Outfit, sans-serif" }}>
                {s.name}
              </h3>
              {!s.isActive && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                  Inactive
                </span>
              )}
            </div>
            {s.description && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">{s.description}</p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onToggle}
              disabled={toggling}
              title={s.isActive ? "Disable" : "Enable"}
              className="p-1.5 rounded-lg hover:bg-slate-50 transition-colors"
            >
              {s.isActive
                ? <ToggleRight className="w-5 h-5 text-teal-500" />
                : <ToggleLeft className="w-5 h-5 text-gray-300" />
              }
            </button>
            <button
              onClick={onEdit}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-700"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg hover:bg-red-50 transition-colors text-gray-400 hover:text-red-500"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-3">
          <div className="flex-1">
            <div className="flex justify-between text-[13px] font-semibold mb-1.5">
              <span className="text-teal-700">{emp}% Employee</span>
              <span className="text-slate-500">{house}% House</span>
            </div>
            <SplitBar emp={emp} house={house} />
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>
              {emp}/{house}
            </p>
            <p className="text-[10px] text-gray-400 -mt-0.5">split</p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-400 pt-3 border-t border-gray-50">
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {totalAssigned === 0
              ? "Unassigned"
              : `${totalAssigned} assigned${(s.assignedContractors ?? 0) > 0 ? ` (${s.assignedContractors} contractor${s.assignedContractors !== 1 ? "s" : ""})` : ""}${(s.assignedStaff ?? 0) > 0 ? ` (${s.assignedStaff} staff)` : ""}`
            }
          </span>
          <span className="text-gray-200">·</span>
          <span>{APPLIES_LABEL[s.appliesTo] ?? s.appliesTo}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PayoutsCommissions() {
  const { selectedStore } = useSelectedStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStructure, setEditingStructure] = useState<CommissionStructure | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CommissionStructure | null>(null);

  const { data: structures = [], isLoading } = useQuery<CommissionStructure[]>({
    queryKey: ["/api/contractor-payouts/commission-structures", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/contractor-payouts/commission-structures?storeId=${selectedStore!.id}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const toggle = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await fetch(`/api/contractor-payouts/commission-structures/${id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/commission-structures", selectedStore?.id] }),
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const setDefault = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/contractor-payouts/commission-structures/${id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/commission-structures", selectedStore?.id] });
      toast({ title: "Default structure updated" });
    },
    onError: () => toast({ title: "Failed to set default", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/contractor-payouts/commission-structures/${id}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/commission-structures", selectedStore?.id] });
      toast({ title: "Structure deleted" });
      setDeleteTarget(null);
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const active   = structures.filter(s => s.isActive);
  const inactive = structures.filter(s => !s.isActive);

  return (
    <div className="p-6 max-w-[960px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>
            Commission Structures
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Define reusable split templates — assign them to team members directly from their profile · {selectedStore?.name}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => { setEditingStructure(null); setDialogOpen(true); }}
          className="rounded-xl gap-2 bg-teal-600 hover:bg-teal-700 text-white shrink-0"
        >
          <Plus className="w-4 h-4" /> New Structure
        </Button>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700">
          A commission structure defines how service revenue is split between the team member and
          the house. For example, a <strong>60/40</strong> structure means the worker keeps <strong>60%</strong>{" "}
          and the salon keeps <strong>40%</strong>. Create as many as you need, then assign them from each
          team member's <strong>Commission</strong> tab.
        </p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[1,2,3].map(i => <div key={i} className="h-40 rounded-2xl bg-gray-100 animate-pulse" />)}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && structures.length === 0 && (
        <Card className="rounded-2xl border-gray-100 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-teal-50 flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-teal-300" />
            </div>
            <p className="text-base font-semibold text-gray-700 mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>
              No commission structures yet
            </p>
            <p className="text-sm text-gray-400 mb-5 max-w-xs">
              Create your first split template — like a 60/40 structure — and assign it to your team from their profile.
            </p>
            <div className="flex flex-wrap gap-2 justify-center mb-5">
              {COMMISSION_PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => { setEditingStructure(null); setDialogOpen(true); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-50 border border-gray-200 hover:border-teal-400 hover:text-teal-700 transition-colors"
                >
                  {p.label} split
                </button>
              ))}
            </div>
            <Button
              size="sm"
              onClick={() => { setEditingStructure(null); setDialogOpen(true); }}
              className="rounded-xl gap-2 bg-teal-600 hover:bg-teal-700 text-white"
            >
              <Plus className="w-4 h-4" /> Create First Structure
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Active structures */}
      {!isLoading && active.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Active ({active.length})
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {active.map(s => (
              <StructureCard
                key={s.id}
                s={s}
                toggling={toggle.isPending}
                onEdit={() => { setEditingStructure(s); setDialogOpen(true); }}
                onDelete={() => setDeleteTarget(s)}
                onToggle={() => toggle.mutate({ id: s.id, isActive: false })}
                onSetDefault={() => setDefault.mutate(s.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Inactive structures */}
      {!isLoading && inactive.length > 0 && (
        <div className="space-y-3 opacity-60">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Inactive ({inactive.length})
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {inactive.map(s => (
              <StructureCard
                key={s.id}
                s={s}
                toggling={toggle.isPending}
                onEdit={() => { setEditingStructure(s); setDialogOpen(true); }}
                onDelete={() => setDeleteTarget(s)}
                onToggle={() => toggle.mutate({ id: s.id, isActive: true })}
                onSetDefault={() => setDefault.mutate(s.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Create / Edit dialog */}
      {selectedStore?.id && (
        <CommissionStructureDialog
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setEditingStructure(null); }}
          storeId={selectedStore.id}
          editing={editingStructure}
        />
      )}

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Outfit, sans-serif" }}>Delete Structure?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 py-2">
            Delete <strong>{deleteTarget?.name}</strong>?
            {((deleteTarget?.assignedContractors ?? 0) + (deleteTarget?.assignedStaff ?? 0)) > 0
              ? ` This structure is assigned to ${(deleteTarget?.assignedContractors ?? 0) + (deleteTarget?.assignedStaff ?? 0)} people — they will be unlinked (flat commission rate still applies).`
              : " This cannot be undone."}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="rounded-xl">Cancel</Button>
            <Button
              onClick={() => deleteTarget && remove.mutate(deleteTarget.id)}
              disabled={remove.isPending}
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white"
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
