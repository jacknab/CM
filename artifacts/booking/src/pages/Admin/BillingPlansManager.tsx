/**
 * BillingPlansManager — Admin page for managing subscription plans.
 * Uses the new /api/plans endpoint backed by the subscription_plans table.
 * Each plan links to the 3-panel PlanFeaturesBuilder for feature configuration.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Edit2, ToggleLeft, ToggleRight, Trash2, Loader2,
  Save, X, DollarSign, Settings2, CheckCircle, XCircle, Tag, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Plan {
  id: number;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  stripePriceIdMonthly: string | null;
  stripePriceIdYearly: string | null;
  isActive: boolean;
  isPublic: boolean;
  sortOrder: number;
  createdAt: string;
}

type PlanFormData = {
  code: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  stripePriceIdMonthly: string;
  stripePriceIdYearly: string;
  isPublic: boolean;
  sortOrder: number;
};

const BLANK_FORM: PlanFormData = {
  code: "",
  name: "",
  description: "",
  priceMonthly: 0,
  priceYearly: 0,
  stripePriceIdMonthly: "",
  stripePriceIdYearly: "",
  isPublic: true,
  sortOrder: 0,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  if (!cents) return "Free";
  return `$${(cents / 100).toFixed(0)}/mo`;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, { credentials: "include", ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ─── Plan Form ────────────────────────────────────────────────────────────────

function PlanForm({
  initial,
  onSave,
  onCancel,
  isLoading,
}: {
  initial: PlanFormData;
  onSave: (data: PlanFormData) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [form, setForm] = useState<PlanFormData>(initial);

  function set<K extends keyof PlanFormData>(key: K, value: PlanFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1 font-medium">Plan Code *</label>
          <Input
            value={form.code}
            onChange={(e) => set("code", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            placeholder="e.g. pro"
            className="bg-white border-gray-300 text-gray-900"
          />
          <p className="text-xs text-gray-400 mt-0.5">Lowercase letters/numbers/underscores only.</p>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1 font-medium">Display Name *</label>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Pro"
            className="bg-white border-gray-300 text-gray-900"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-500 block mb-1 font-medium">Description</label>
        <Input
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Short tagline shown in pricing UI"
          className="bg-white border-gray-300 text-gray-900"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1 font-medium">Monthly price (cents)</label>
          <Input
            type="number"
            min="0"
            value={form.priceMonthly}
            onChange={(e) => set("priceMonthly", parseInt(e.target.value) || 0)}
            placeholder="0"
            className="bg-white border-gray-300 text-gray-900"
          />
          <p className="text-xs text-gray-400 mt-0.5">e.g. 2900 = $29</p>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1 font-medium">Yearly price (cents)</label>
          <Input
            type="number"
            min="0"
            value={form.priceYearly}
            onChange={(e) => set("priceYearly", parseInt(e.target.value) || 0)}
            placeholder="0"
            className="bg-white border-gray-300 text-gray-900"
          />
          <p className="text-xs text-gray-400 mt-0.5">e.g. 29000 = $290/yr</p>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1 font-medium">Sort order</label>
          <Input
            type="number"
            value={form.sortOrder}
            onChange={(e) => set("sortOrder", parseInt(e.target.value) || 0)}
            className="bg-white border-gray-300 text-gray-900"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1 font-medium">Stripe Monthly Price ID</label>
          <Input
            value={form.stripePriceIdMonthly}
            onChange={(e) => set("stripePriceIdMonthly", e.target.value)}
            placeholder="price_xxxx (optional)"
            className="bg-white border-gray-300 text-gray-900"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1 font-medium">Stripe Yearly Price ID</label>
          <Input
            value={form.stripePriceIdYearly}
            onChange={(e) => set("stripePriceIdYearly", e.target.value)}
            placeholder="price_xxxx (optional)"
            className="bg-white border-gray-300 text-gray-900"
          />
        </div>
      </div>

      {(form.priceMonthly > 0 && !form.stripePriceIdMonthly) || (form.priceYearly > 0 && !form.stripePriceIdYearly) ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 space-y-1">
          <div className="flex items-center gap-2 text-amber-700 font-medium text-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            Missing Stripe price ID
          </div>
          {form.priceMonthly > 0 && !form.stripePriceIdMonthly && (
            <p className="text-amber-600 text-xs pl-6">
              Monthly price is set but <strong>Stripe Monthly Price ID</strong> is empty — owners won't be able to subscribe monthly until this is filled in.
            </p>
          )}
          {form.priceYearly > 0 && !form.stripePriceIdYearly && (
            <p className="text-amber-600 text-xs pl-6">
              Yearly price is set but <strong>Stripe Yearly Price ID</strong> is empty — owners won't be able to subscribe yearly until this is filled in.
            </p>
          )}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Switch
          checked={form.isPublic}
          onCheckedChange={(v) => set("isPublic", v)}
        />
        <span className="text-sm text-gray-700">Show on public pricing page</span>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button
          className="bg-violet-600 hover:bg-violet-500 text-white"
          onClick={() => onSave(form)}
          disabled={isLoading || !form.code || !form.name}
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
          Save Plan
        </Button>
        <Button variant="ghost" className="text-gray-500 hover:text-gray-700" onClick={onCancel}>
          <X className="w-4 h-4 mr-1" /> Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── Plan Row ─────────────────────────────────────────────────────────────────

function PlanRow({
  plan,
  onEdit,
  onToggle,
  onDelete,
  isTogglingId,
}: {
  plan: Plan;
  onEdit: (plan: Plan) => void;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
  isTogglingId: number | null;
}) {
  const navigate = useNavigate();
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  return (
    <Card className={`bg-white border border-gray-200 shadow-sm ${!plan.isActive ? "opacity-60" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-2 ${plan.isActive ? "bg-emerald-500" : "bg-gray-300"}`} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-gray-900 font-semibold">{plan.name}</span>
              <code className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono border border-gray-200">{plan.code}</code>
              {!plan.isActive && (
                <span className="text-xs text-gray-400 border border-gray-200 bg-gray-50 px-1.5 py-0.5 rounded">Inactive</span>
              )}
              {!plan.isPublic && (
                <span className="text-xs text-gray-400 border border-gray-200 bg-gray-50 px-1.5 py-0.5 rounded">Hidden</span>
              )}
            </div>

            {plan.description && (
              <p className="text-gray-500 text-sm mt-0.5">{plan.description}</p>
            )}

            <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
              <span className="flex items-center gap-1 font-medium text-gray-700">
                <DollarSign className="w-3 h-3" />
                {formatCents(plan.priceMonthly)}
                {plan.priceYearly > 0 && (
                  <span className="text-gray-400 ml-1">· ${(plan.priceYearly / 100).toFixed(0)}/yr</span>
                )}
              </span>
              {plan.stripePriceIdMonthly ? (
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle className="w-3 h-3" />
                  Stripe linked
                </span>
              ) : (
                <span className="flex items-center gap-1 text-amber-500">
                  <XCircle className="w-3 h-3" />
                  No Stripe ID
                </span>
              )}
              {plan.priceYearly > 0 && !plan.stripePriceIdYearly && (
                <span className="flex items-center gap-1 text-amber-500">
                  <XCircle className="w-3 h-3" />
                  No yearly Stripe ID
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-8 px-2 text-xs gap-1"
              onClick={() => navigate(`/isadmin/plans/${plan.id}/features`)}
              title="Configure features"
            >
              <Settings2 className="w-3.5 h-3.5" />
              Features
            </Button>

            <Button
              size="sm"
              variant="ghost"
              className="text-gray-500 hover:text-gray-800 hover:bg-gray-100 h-8 px-2"
              onClick={() => onEdit(plan)}
              title="Edit plan"
            >
              <Edit2 className="w-4 h-4" />
            </Button>

            <Button
              size="sm"
              variant="ghost"
              className={`h-8 px-2 ${plan.isActive ? "text-gray-400 hover:text-amber-500 hover:bg-amber-50" : "text-gray-300 hover:text-emerald-600 hover:bg-emerald-50"}`}
              onClick={() => onToggle(plan.id)}
              disabled={isTogglingId === plan.id}
              title={plan.isActive ? "Deactivate plan" : "Activate plan"}
            >
              {isTogglingId === plan.id
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : plan.isActive
                ? <ToggleRight className="w-4 h-4" />
                : <ToggleLeft className="w-4 h-4" />
              }
            </Button>

            {!deleteConfirm ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-gray-300 hover:text-red-500 hover:bg-red-50 h-8 px-2"
                onClick={() => setDeleteConfirm(true)}
                title="Delete plan"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            ) : (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 px-2 text-xs"
                  onClick={() => { onDelete(plan.id); setDeleteConfirm(false); }}
                >
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-gray-500"
                  onClick={() => setDeleteConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function BillingPlansManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const { data: plans = [], isLoading } = useQuery<Plan[]>({
    queryKey: ["/api/plans"],
    queryFn: () => apiFetch("/api/plans"),
  });

  const createMutation = useMutation({
    mutationFn: (formData: PlanFormData) =>
      apiFetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
      setShowCreateForm(false);
      toast({ title: "Plan created" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<PlanFormData> }) =>
      apiFetch(`/api/plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
      setEditingPlan(null);
      toast({ title: "Plan updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, current }: { id: number; current: boolean }) =>
      apiFetch(`/api/plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !current }),
      }),
    onMutate: ({ id }) => setTogglingId(id),
    onSettled: () => setTogglingId(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/plans"] }),
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/plans/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plans"] });
      toast({ title: "Plan deactivated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const activePlans = plans.filter((p) => p.isActive);
  const inactivePlans = plans.filter((p) => !p.isActive);

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subscription Plans</h1>
          <p className="text-gray-500 text-sm mt-1">
            {activePlans.length} active · {inactivePlans.length} inactive
          </p>
        </div>
        <Button
          className="bg-violet-600 hover:bg-violet-500 text-white"
          onClick={() => { setShowCreateForm(true); setEditingPlan(null); }}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          New Plan
        </Button>
      </div>

      {showCreateForm && (
        <Card className="bg-white border border-violet-200 shadow-sm">
          <CardHeader className="pb-3 border-b border-gray-100">
            <CardTitle className="text-gray-900 text-base">Create New Plan</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <PlanForm
              initial={BLANK_FORM}
              onSave={(formData) => createMutation.mutate(formData)}
              onCancel={() => setShowCreateForm(false)}
              isLoading={createMutation.isPending}
            />
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
        </div>
      ) : plans.length === 0 ? (
        <Card className="bg-white border border-gray-200 shadow-sm">
          <CardContent className="p-8 text-center">
            <Tag className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No plans yet</p>
            <p className="text-gray-400 text-sm mt-1">Create a plan above to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {activePlans.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold px-1">Active Plans</p>
              {activePlans.map((plan) =>
                editingPlan?.id === plan.id ? (
                  <Card key={plan.id} className="bg-white border border-violet-200 shadow-sm">
                    <CardHeader className="pb-3 border-b border-gray-100">
                      <CardTitle className="text-gray-900 text-sm">Editing: {plan.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <PlanForm
                        initial={{
                          code: plan.code,
                          name: plan.name,
                          description: plan.description ?? "",
                          priceMonthly: plan.priceMonthly,
                          priceYearly: plan.priceYearly,
                          stripePriceIdMonthly: plan.stripePriceIdMonthly ?? "",
                          stripePriceIdYearly: plan.stripePriceIdYearly ?? "",
                          isPublic: plan.isPublic,
                          sortOrder: plan.sortOrder,
                        }}
                        onSave={(formData) => updateMutation.mutate({ id: plan.id, data: formData })}
                        onCancel={() => setEditingPlan(null)}
                        isLoading={updateMutation.isPending}
                      />
                    </CardContent>
                  </Card>
                ) : (
                  <PlanRow
                    key={plan.id}
                    plan={plan}
                    onEdit={setEditingPlan}
                    onToggle={(id) => toggleMutation.mutate({ id, current: plan.isActive })}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    isTogglingId={togglingId}
                  />
                )
              )}
            </div>
          )}

          {inactivePlans.length > 0 && (
            <div className="space-y-2 mt-4">
              <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold px-1">Inactive Plans</p>
              {inactivePlans.map((plan) =>
                editingPlan?.id === plan.id ? (
                  <Card key={plan.id} className="bg-white border border-gray-200 shadow-sm">
                    <CardHeader className="pb-3 border-b border-gray-100">
                      <CardTitle className="text-gray-900 text-sm">Editing: {plan.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <PlanForm
                        initial={{
                          code: plan.code,
                          name: plan.name,
                          description: plan.description ?? "",
                          priceMonthly: plan.priceMonthly,
                          priceYearly: plan.priceYearly,
                          stripePriceIdMonthly: plan.stripePriceIdMonthly ?? "",
                          stripePriceIdYearly: plan.stripePriceIdYearly ?? "",
                          isPublic: plan.isPublic,
                          sortOrder: plan.sortOrder,
                        }}
                        onSave={(formData) => updateMutation.mutate({ id: plan.id, data: formData })}
                        onCancel={() => setEditingPlan(null)}
                        isLoading={updateMutation.isPending}
                      />
                    </CardContent>
                  </Card>
                ) : (
                  <PlanRow
                    key={plan.id}
                    plan={plan}
                    onEdit={setEditingPlan}
                    onToggle={(id) => toggleMutation.mutate({ id, current: plan.isActive })}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    isTogglingId={togglingId}
                  />
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
