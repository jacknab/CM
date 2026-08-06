import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSelectedStore } from "@/hooks/use-store";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Percent, DollarSign, Edit2, Trash2, ToggleLeft, ToggleRight,
  Users, Settings2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

type DeductionRule = {
  id: number;
  storeId: number;
  contractorId: number | null;
  name: string;
  type: string;
  amount: string;
  appliesTo: string;
  isActive: boolean;
  createdAt: string;
};

type Contractor = { id: number; firstName: string; lastName: string; isActive: boolean };

const EMPTY_FORM = {
  name: "",
  type: "fixed" as "fixed" | "percentage",
  amount: "",
  appliesTo: "all" as "all" | "specific",
  contractorId: "",
};

function fmt$(n: string | number) {
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function RuleDialog({
  open, onClose, storeId, contractors, editing,
}: {
  open: boolean;
  onClose: () => void;
  storeId: number;
  contractors: Contractor[];
  editing: DeductionRule | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<typeof EMPTY_FORM>(() =>
    editing
      ? {
          name: editing.name,
          type: (editing.type ?? "fixed") as "fixed" | "percentage",
          amount: editing.amount,
          appliesTo: (editing.appliesTo ?? "all") as "all" | "specific",
          contractorId: editing.contractorId ? String(editing.contractorId) : "",
        }
      : { ...EMPTY_FORM }
  );

  const f = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        storeId,
        name: form.name,
        type: form.type,
        amount: form.amount,
        appliesTo: form.appliesTo,
        contractorId: form.appliesTo === "specific" && form.contractorId
          ? parseInt(form.contractorId)
          : null,
      };
      const url = editing
        ? `/api/contractor-payouts/deduction-rules/${editing.id}`
        : "/api/contractor-payouts/deduction-rules";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/deduction-rules", storeId] });
      toast({ title: editing ? "Rule updated" : "Deduction rule created" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const amountValid = !isNaN(parseFloat(form.amount)) && parseFloat(form.amount) > 0;
  const canSave = !!form.name && amountValid &&
    (form.appliesTo === "all" || !!form.contractorId);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "Outfit, sans-serif" }}>
            {editing ? "Edit Deduction Rule" : "New Deduction Rule"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs text-gray-500 mb-1">Rule Name *</Label>
            <Input
              value={form.name}
              onChange={e => f("name")(e.target.value)}
              className="rounded-xl"
              placeholder="e.g. Booth Rent, Supply Fee, Processing Fee"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1">Type *</Label>
              <Select value={form.type} onValueChange={v => f("type")(v)}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1">
                {form.type === "percentage" ? "Percentage *" : "Amount *"}
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                  {form.type === "percentage" ? "%" : "$"}
                </span>
                <Input
                  type="number"
                  min="0"
                  step={form.type === "percentage" ? "0.1" : "0.01"}
                  value={form.amount}
                  onChange={e => f("amount")(e.target.value)}
                  className="rounded-xl pl-7"
                  placeholder={form.type === "percentage" ? "e.g. 5" : "e.g. 150.00"}
                />
              </div>
            </div>
          </div>

          <div>
            <Label className="text-xs text-gray-500 mb-1">Applies To *</Label>
            <Select value={form.appliesTo} onValueChange={v => f("appliesTo")(v)}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Contractors</SelectItem>
                <SelectItem value="specific">Specific Contractor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.appliesTo === "specific" && (
            <div>
              <Label className="text-xs text-gray-500 mb-1">Contractor *</Label>
              <Select value={form.contractorId} onValueChange={f("contractorId")}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Select contractor…" />
                </SelectTrigger>
                <SelectContent>
                  {contractors.filter(c => c.isActive).map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.firstName} {c.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
            <strong>How it works:</strong> This deduction is automatically applied to every payout run.{" "}
            {form.type === "percentage"
              ? "The amount is calculated as a percentage of the contractor's gross commission earnings."
              : "A fixed dollar amount is deducted from the contractor's net payout."}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-xl">Cancel</Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!canSave || save.isPending}
            className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white"
          >
            {save.isPending ? "Saving…" : editing ? "Update Rule" : "Create Rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PayoutsDeductions() {
  const { selectedStore } = useSelectedStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DeductionRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeductionRule | null>(null);

  const { data: rules = [], isLoading } = useQuery<DeductionRule[]>({
    queryKey: ["/api/contractor-payouts/deduction-rules", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/contractor-payouts/deduction-rules?storeId=${selectedStore!.id}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const { data: contractors = [] } = useQuery<Contractor[]>({
    queryKey: ["/api/contractor-payouts/contractors", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/contractor-payouts/contractors?storeId=${selectedStore!.id}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const toggle = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await fetch(`/api/contractor-payouts/deduction-rules/${id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/deduction-rules", selectedStore?.id] });
    },
    onError: () => toast({ title: "Failed to update rule", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/contractor-payouts/deduction-rules/${id}`, {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/deduction-rules", selectedStore?.id] });
      toast({ title: "Rule deleted" });
      setDeleteTarget(null);
    },
    onError: () => toast({ title: "Failed to delete rule", variant: "destructive" }),
  });

  const contractorName = (id: number | null) => {
    if (!id) return null;
    const c = contractors.find(c => c.id === id);
    return c ? `${c.firstName} ${c.lastName}` : `Contractor #${id}`;
  };

  const activeRules = rules.filter(r => r.isActive);
  const inactiveRules = rules.filter(r => !r.isActive);

  return (
    <div className="p-6 max-w-[900px] mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>
            Deduction Rules
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Recurring deductions applied automatically during payout runs · {selectedStore?.name}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => { setEditing(null); setDialogOpen(true); }}
          className="rounded-xl gap-2 bg-teal-600 hover:bg-teal-700 text-white"
        >
          <Plus className="w-4 h-4" /> New Rule
        </Button>
      </div>

      {/* Explainer */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
        <Settings2 className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700">
          Deduction rules are applied automatically every time you run payouts.{" "}
          <strong>Fixed</strong> rules deduct a set dollar amount. <strong>Percentage</strong> rules
          deduct a percentage of each contractor's gross commission earnings. Common examples: booth rent,
          supply fees, processing fees, or product costs.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-gray-100 animate-pulse" />)}
        </div>
      ) : rules.length === 0 ? (
        <Card className="rounded-2xl border-gray-100 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center mb-4">
              <DollarSign className="w-7 h-7 text-teal-300" />
            </div>
            <p className="text-base font-medium text-gray-700" style={{ fontFamily: "Outfit, sans-serif" }}>
              No deduction rules yet
            </p>
            <p className="text-sm text-gray-400 mt-1 mb-4">
              Add rules like booth rent or supply fees to automatically deduct from contractor payouts.
            </p>
            <Button
              size="sm"
              onClick={() => { setEditing(null); setDialogOpen(true); }}
              className="rounded-xl gap-2 bg-teal-600 hover:bg-teal-700 text-white"
            >
              <Plus className="w-4 h-4" /> Create First Rule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {activeRules.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Active ({activeRules.length})
              </p>
              {activeRules.map(rule => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  contractorName={contractorName(rule.contractorId)}
                  onEdit={() => { setEditing(rule); setDialogOpen(true); }}
                  onToggle={() => toggle.mutate({ id: rule.id, isActive: false })}
                  onDelete={() => setDeleteTarget(rule)}
                  toggling={toggle.isPending}
                />
              ))}
            </div>
          )}

          {inactiveRules.length > 0 && (
            <div className="space-y-3 opacity-60">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Inactive ({inactiveRules.length})
              </p>
              {inactiveRules.map(rule => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  contractorName={contractorName(rule.contractorId)}
                  onEdit={() => { setEditing(rule); setDialogOpen(true); }}
                  onToggle={() => toggle.mutate({ id: rule.id, isActive: true })}
                  onDelete={() => setDeleteTarget(rule)}
                  toggling={toggle.isPending}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {selectedStore?.id && (
        <RuleDialog
          key={editing ? `edit-${editing.id}` : "new"}
          open={dialogOpen}
          onClose={() => { setDialogOpen(false); setEditing(null); }}
          storeId={selectedStore.id}
          contractors={contractors}
          editing={editing}
        />
      )}

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Outfit, sans-serif" }}>Delete Rule?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 py-2">
            Delete <strong>{deleteTarget?.name}</strong>? This rule will no longer be applied to future
            payout runs. Past payouts are not affected.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="rounded-xl">
              Cancel
            </Button>
            <Button
              onClick={() => deleteTarget && remove.mutate(deleteTarget.id)}
              disabled={remove.isPending}
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white"
            >
              {remove.isPending ? "Deleting…" : "Delete Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RuleCard({
  rule, contractorName, onEdit, onToggle, onDelete, toggling,
}: {
  rule: DeductionRule;
  contractorName: string | null;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  toggling: boolean;
}) {
  const isPercentage = rule.type === "percentage";
  const displayAmount = isPercentage
    ? `${Number(rule.amount).toFixed(1)}%`
    : fmt$(rule.amount);

  return (
    <Card className="rounded-2xl border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              isPercentage ? "bg-violet-50" : "bg-teal-50"
            }`}>
              {isPercentage
                ? <Percent className="w-5 h-5 text-violet-600" />
                : <DollarSign className="w-5 h-5 text-teal-600" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-900">{rule.name}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  isPercentage
                    ? "bg-violet-50 text-violet-700"
                    : "bg-teal-50 text-teal-700"
                }`}>
                  {displayAmount} {isPercentage ? "of gross" : "fixed"}
                </span>
                {!rule.isActive && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                    Inactive
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-400">
                {rule.appliesTo === "all" ? (
                  <><Users className="w-3 h-3" /> All contractors</>
                ) : (
                  <><Users className="w-3 h-3" /> {contractorName ?? `Contractor #${rule.contractorId}`}</>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onToggle}
              disabled={toggling}
              className="text-gray-400 hover:text-teal-600 transition-colors p-1"
              title={rule.isActive ? "Disable rule" : "Enable rule"}
            >
              {rule.isActive
                ? <ToggleRight className="w-5 h-5 text-teal-600" />
                : <ToggleLeft className="w-5 h-5" />
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
      </CardContent>
    </Card>
  );
}
