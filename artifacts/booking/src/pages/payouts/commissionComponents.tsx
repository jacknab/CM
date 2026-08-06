/**
 * Shared commission structure components used by both
 * PayoutsCommissions (management page) and ContractorDetail (assignment tab).
 */
import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CommissionStructure = {
  id: number;
  storeId: number;
  name: string;
  description: string | null;
  employeePercent: string;
  housePercent: string;
  appliesTo: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  assignedContractors?: number;
  assignedStaff?: number;
};

// ─── Presets ──────────────────────────────────────────────────────────────────

export const COMMISSION_PRESETS = [
  { label: "50 / 50", emp: 50, house: 50 },
  { label: "55 / 45", emp: 55, house: 45 },
  { label: "60 / 40", emp: 60, house: 40 },
  { label: "65 / 35", emp: 65, house: 35 },
  { label: "70 / 30", emp: 70, house: 30 },
  { label: "75 / 25", emp: 75, house: 25 },
];

// ─── Split Bar ────────────────────────────────────────────────────────────────

export function SplitBar({ emp, house }: { emp: number; house: number }) {
  return (
    <div className="w-full h-2.5 rounded-full overflow-hidden flex">
      <div className="h-full bg-teal-500 transition-all duration-300" style={{ width: `${emp}%` }} />
      <div className="h-full bg-slate-200 transition-all duration-300" style={{ width: `${house}%` }} />
    </div>
  );
}

// ─── Create / Edit Dialog ─────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: "",
  description: "",
  employeePercent: "60",
  appliesTo: "both" as "employee" | "contractor" | "both",
  isDefault: false,
};

export function CommissionStructureDialog({
  open, onClose, storeId, editing, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  storeId: number;
  editing: CommissionStructure | null;
  onCreated?: (s: CommissionStructure) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fromEditing = (e: CommissionStructure) => ({
    name: e.name,
    description: e.description ?? "",
    employeePercent: String(Math.round(Number(e.employeePercent))),
    appliesTo: e.appliesTo as typeof EMPTY_FORM["appliesTo"],
    isDefault: e.isDefault,
  });

  const [form, setForm] = useState<typeof EMPTY_FORM>(
    editing ? fromEditing(editing) : { ...EMPTY_FORM }
  );

  // Reset form whenever the dialog opens or switches between create/edit
  useEffect(() => {
    if (open) {
      setForm(editing ? fromEditing(editing) : { ...EMPTY_FORM });
    }
  }, [open, editing?.id]);

  const empVal   = Math.min(100, Math.max(0, Number(form.employeePercent) || 0));
  const houseVal = 100 - empVal;
  const f = (k: keyof typeof form) => (v: string | boolean) => setForm(p => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        storeId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        employeePercent: empVal,
        housePercent: houseVal,
        appliesTo: form.appliesTo,
        isDefault: form.isDefault,
      };
      const url = editing
        ? `/api/contractor-payouts/commission-structures/${editing.id}`
        : "/api/contractor-payouts/commission-structures";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      return res.json() as Promise<CommissionStructure>;
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/commission-structures", storeId] });
      toast({ title: editing ? "Structure updated" : "Commission structure created" });
      onCreated?.(created);
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const canSave = form.name.trim().length > 0 && empVal >= 0 && empVal <= 100;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "Outfit, sans-serif" }}>
            {editing ? "Edit Commission Structure" : "New Commission Structure"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Structure Name *</Label>
            <Input
              value={form.name}
              onChange={e => f("name")(e.target.value)}
              className="rounded-xl"
              placeholder="e.g. Senior Stylist 60/40, Booth Renter 70/30"
            />
          </div>

          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Description (optional)</Label>
            <Input
              value={form.description}
              onChange={e => f("description")(e.target.value)}
              className="rounded-xl"
              placeholder="e.g. Standard split for full-time employees"
            />
          </div>

          <div>
            <Label className="text-xs text-gray-500 mb-2 block">Quick Presets</Label>
            <div className="flex flex-wrap gap-2">
              {COMMISSION_PRESETS.map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => f("employeePercent")(String(p.emp))}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                    empVal === p.emp
                      ? "bg-teal-600 text-white border-teal-600"
                      : "bg-white text-gray-700 border-gray-200 hover:border-teal-400 hover:text-teal-700"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs text-gray-500 mb-2 block">Commission Split *</Label>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <p className="text-[11px] font-medium text-teal-600 mb-1">Employee / Contractor %</p>
                <div className="relative">
                  <Input
                    type="number" min={0} max={100}
                    value={form.employeePercent}
                    onChange={e => f("employeePercent")(e.target.value)}
                    className="rounded-xl pr-8"
                  />
                  <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-500 mb-1">House / Owner %</p>
                <div className="relative">
                  <Input
                    type="number" value={houseVal} readOnly
                    className="rounded-xl pr-8 bg-slate-50 text-slate-500 cursor-default"
                  />
                  <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>
            <SplitBar emp={empVal} house={houseVal} />
            <div className="flex justify-between text-[11px] mt-1.5">
              <span className="text-teal-600 font-medium">Employee {empVal}%</span>
              <span className="text-slate-400 font-medium">House {houseVal}%</span>
            </div>
          </div>

          <div>
            <Label className="text-xs text-gray-500 mb-1.5 block">Applies To</Label>
            <Select value={form.appliesTo} onValueChange={v => f("appliesTo")(v)}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="both">Employees & Contractors</SelectItem>
                <SelectItem value="employee">Employees Only</SelectItem>
                <SelectItem value="contractor">Contractors Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              className={cn("w-10 h-5 rounded-full relative transition-colors", form.isDefault ? "bg-teal-500" : "bg-slate-200")}
              onClick={() => f("isDefault")(!form.isDefault)}
            >
              <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform", form.isDefault && "translate-x-5")} />
            </div>
            <span className="text-sm font-medium text-gray-700">Set as default structure</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-xl">Cancel</Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!canSave || save.isPending}
            className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white"
          >
            {save.isPending ? "Saving…" : editing ? "Update" : "Create Structure"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
