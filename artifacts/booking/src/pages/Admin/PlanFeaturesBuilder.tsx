/**
 * PlanFeaturesBuilder — 3-panel plan feature configuration UI
 *
 * Route: /isadmin/plans/:planId/features
 *
 * LEFT   — All features in the registry. Click "+" to add to plan.
 * MIDDLE — Features currently assigned to this plan.
 * RIGHT  — Configuration panel: enabled toggle + limit value for selected feature.
 */

import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, Plus, Trash2, Save, Settings2, Loader2,
  CheckCircle, XCircle, Infinity, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Feature {
  id: string;
  name: string;
  description: string | null;
  category: string;
  isActive: boolean;
  sortOrder: number;
}

interface PlanFeatureRow {
  id: number;
  planId: number;
  featureId: string;
  enabled: boolean;
  limitValue: number | null;
  name: string;
  description: string | null;
  category: string;
  sortOrder: number;
}

interface Plan {
  id: number;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: number;
  priceYearly: number;
  isActive: boolean;
}

// ─── Category colours ─────────────────────────────────────────────────────────

const CATEGORY_COLOURS: Record<string, string> = {
  staff:     "bg-purple-900/40 text-purple-300 border-purple-700",
  booking:   "bg-blue-900/40 text-blue-300 border-blue-700",
  messaging: "bg-green-900/40 text-green-300 border-green-700",
  reporting: "bg-amber-900/40 text-amber-300 border-amber-700",
  ai:        "bg-pink-900/40 text-pink-300 border-pink-700",
  marketing: "bg-orange-900/40 text-orange-300 border-orange-700",
  website:   "bg-cyan-900/40 text-cyan-300 border-cyan-700",
  pos:       "bg-indigo-900/40 text-indigo-300 border-indigo-700",
  general:   "bg-zinc-800 text-zinc-300 border-zinc-600",
};

function CategoryBadge({ category }: { category: string }) {
  const cls = CATEGORY_COLOURS[category] ?? CATEGORY_COLOURS.general;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium uppercase tracking-wide ${cls}`}>
      {category}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PlanFeaturesBuilder() {
  const { planId } = useParams<{ planId: string }>();
  const planIdNum = Number(planId);
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Which feature is selected in the middle panel (shows right config panel)
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);

  // Right-panel draft state
  const [draft, setDraft] = useState<{ enabled: boolean; limitValue: string }>({
    enabled: true,
    limitValue: "",
  });

  // ── Data queries ─────────────────────────────────────────────────────────────

  const { data: plan } = useQuery<Plan>({
    queryKey: ["/api/plans", planIdNum],
    queryFn: async () => {
      const res = await fetch("/api/plans", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load plans");
      const plans: Plan[] = await res.json();
      const found = plans.find((p) => p.id === planIdNum);
      if (!found) throw new Error("Plan not found");
      return found;
    },
  });

  const { data: allFeatures = [], isLoading: loadingFeatures } = useQuery<Feature[]>({
    queryKey: ["/api/plans/features"],
    queryFn: async () => {
      const res = await fetch("/api/plans/features", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load features");
      return res.json();
    },
  });

  const { data: planFeaturesList = [], isLoading: loadingPlanFeatures } = useQuery<PlanFeatureRow[]>({
    queryKey: ["/api/plans", planIdNum, "features"],
    queryFn: async () => {
      const res = await fetch(`/api/plans/${planIdNum}/features`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load plan features");
      return res.json();
    },
    enabled: !!planIdNum,
  });

  // ── Derived state ─────────────────────────────────────────────────────────────

  const assignedIds = new Set(planFeaturesList.map((pf) => pf.featureId));

  const availableFeatures = allFeatures.filter(
    (f) => f.isActive && !assignedIds.has(f.id)
  );

  const selectedPlanFeature = planFeaturesList.find(
    (pf) => pf.featureId === selectedFeatureId
  );

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/plans", planIdNum, "features"] });
  };

  const addFeature = useMutation({
    mutationFn: async (featureId: string) => {
      const res = await fetch(`/api/plans/${planIdNum}/features/${featureId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled: true, limitValue: null }),
      });
      if (!res.ok) throw new Error("Failed to add feature");
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Feature added" });
    },
    onError: () => toast({ title: "Failed to add feature", variant: "destructive" }),
  });

  const removeFeature = useMutation({
    mutationFn: async (featureId: string) => {
      const res = await fetch(`/api/plans/${planIdNum}/features/${featureId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to remove feature");
    },
    onSuccess: (_d, featureId) => {
      invalidate();
      if (selectedFeatureId === featureId) setSelectedFeatureId(null);
      toast({ title: "Feature removed" });
    },
    onError: () => toast({ title: "Failed to remove feature", variant: "destructive" }),
  });

  const saveFeature = useMutation({
    mutationFn: async () => {
      if (!selectedFeatureId) throw new Error("No feature selected");
      const limitNum = draft.limitValue === "" ? null : parseInt(draft.limitValue, 10);
      const res = await fetch(`/api/plans/${planIdNum}/features/${selectedFeatureId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          enabled: draft.enabled,
          limitValue: isNaN(limitNum as number) ? null : limitNum,
        }),
      });
      if (!res.ok) throw new Error("Failed to save feature config");
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Feature configuration saved" });
    },
    onError: () => toast({ title: "Failed to save configuration", variant: "destructive" }),
  });

  // ── Select a feature in the middle panel ──────────────────────────────────────

  function selectFeature(pf: PlanFeatureRow) {
    setSelectedFeatureId(pf.featureId);
    setDraft({
      enabled: pf.enabled,
      limitValue: pf.limitValue != null ? String(pf.limitValue) : "",
    });
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  const isLoading = loadingFeatures || loadingPlanFeatures;

  return (
    <div className="flex flex-col h-full min-h-screen bg-zinc-950 text-white">

      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-zinc-800 bg-zinc-900">
        <Button
          variant="ghost"
          size="sm"
          className="text-zinc-400 hover:text-white"
          onClick={() => navigate("/isadmin/billing/plans")}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Plans
        </Button>
        <div className="h-4 w-px bg-zinc-700" />
        <div>
          <h1 className="text-base font-semibold text-white">
            {plan ? `${plan.name} Plan` : "Loading…"} — Feature Configuration
          </h1>
          {plan && (
            <p className="text-xs text-zinc-500 mt-0.5">
              {plan.code} · ${(plan.priceMonthly / 100).toFixed(0)}/mo
            </p>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading…
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">

          {/* ── LEFT PANEL: Available features ─────────────────────────────── */}
          <div className="w-72 border-r border-zinc-800 flex flex-col bg-zinc-900">
            <div className="px-4 py-3 border-b border-zinc-800">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                Available Features
              </h2>
              <p className="text-xs text-zinc-600 mt-0.5">
                {availableFeatures.length} not yet added
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {availableFeatures.length === 0 ? (
                <div className="px-4 py-8 text-center text-zinc-600 text-sm">
                  All features added to this plan.
                </div>
              ) : (
                availableFeatures.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-start gap-2 px-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-800/50 group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-zinc-200 truncate">{f.name}</div>
                      <div className="mt-0.5">
                        <CategoryBadge category={f.category} />
                      </div>
                    </div>
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 hover:bg-blue-500 flex items-center justify-center"
                      onClick={() => addFeature.mutate(f.id)}
                      disabled={addFeature.isPending}
                      title="Add to plan"
                    >
                      <Plus className="h-3.5 w-3.5 text-white" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ── MIDDLE PANEL: Plan features ─────────────────────────────────── */}
          <div className="w-80 border-r border-zinc-800 flex flex-col bg-zinc-950">
            <div className="px-4 py-3 border-b border-zinc-800">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                Plan Features
              </h2>
              <p className="text-xs text-zinc-600 mt-0.5">
                {planFeaturesList.length} feature{planFeaturesList.length !== 1 ? "s" : ""} configured
              </p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {planFeaturesList.length === 0 ? (
                <div className="px-4 py-8 text-center text-zinc-600 text-sm">
                  No features added yet. Add from the left panel.
                </div>
              ) : (
                planFeaturesList.map((pf) => {
                  const isSelected = selectedFeatureId === pf.featureId;
                  return (
                    <div
                      key={pf.featureId}
                      onClick={() => selectFeature(pf)}
                      className={`flex items-start gap-2 px-4 py-3 border-b border-zinc-800/50 cursor-pointer transition-colors group ${
                        isSelected
                          ? "bg-blue-950/50 border-l-2 border-l-blue-500"
                          : "hover:bg-zinc-800/40"
                      }`}
                    >
                      {/* Status icon */}
                      <div className="flex-shrink-0 mt-0.5">
                        {pf.enabled ? (
                          <CheckCircle className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-zinc-600" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-zinc-200 truncate">{pf.name}</div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <CategoryBadge category={pf.category} />
                          {pf.enabled && (
                            <span className="text-[10px] text-zinc-500">
                              {pf.limitValue != null ? `limit: ${pf.limitValue}` : "unlimited"}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 w-6 h-6 rounded hover:bg-red-900/50 flex items-center justify-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFeature.mutate(pf.featureId);
                        }}
                        disabled={removeFeature.isPending}
                        title="Remove from plan"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ── RIGHT PANEL: Feature configuration ──────────────────────────── */}
          <div className="flex-1 flex flex-col bg-zinc-950">
            {selectedFeatureId && selectedPlanFeature ? (
              <>
                <div className="px-6 py-4 border-b border-zinc-800">
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-zinc-400" />
                    <h2 className="text-sm font-semibold text-white">
                      {selectedPlanFeature.name}
                    </h2>
                    <CategoryBadge category={selectedPlanFeature.category} />
                  </div>
                  {selectedPlanFeature.description && (
                    <p className="text-xs text-zinc-500 mt-1.5 ml-6">
                      {selectedPlanFeature.description}
                    </p>
                  )}
                </div>

                <div className="flex-1 px-6 py-6 space-y-8">

                  {/* Enabled toggle */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-zinc-200">Feature enabled</div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        When off, this feature is completely hidden from stores on this plan.
                      </div>
                    </div>
                    <Switch
                      checked={draft.enabled}
                      onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v }))}
                    />
                  </div>

                  {/* Limit value */}
                  <div className={draft.enabled ? "" : "opacity-40 pointer-events-none"}>
                    <div className="text-sm font-medium text-zinc-200 mb-1">Usage limit</div>
                    <div className="text-xs text-zinc-500 mb-3">
                      Leave blank for unlimited. Enter a positive number to enforce a per-period cap
                      (e.g. 100 SMS per month, 3 staff members).
                    </div>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        min="1"
                        placeholder="Unlimited"
                        value={draft.limitValue}
                        onChange={(e) => setDraft((d) => ({ ...d, limitValue: e.target.value }))}
                        className="w-40 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600"
                      />
                      {draft.limitValue === "" ? (
                        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                          <Infinity className="h-3.5 w-3.5" />
                          Unlimited
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-500">
                          per billing period
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Hint about 'enabled false' + limit */}
                  {!draft.enabled && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-800/50 bg-amber-950/30 px-4 py-3">
                      <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-300">
                        Feature is disabled. Stores on this plan will not see or be able to use it.
                      </p>
                    </div>
                  )}

                  {/* Save */}
                  <div className="pt-2">
                    <Button
                      onClick={() => saveFeature.mutate()}
                      disabled={saveFeature.isPending}
                      className="bg-blue-600 hover:bg-blue-500 text-white"
                    >
                      {saveFeature.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Save configuration
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 gap-2">
                <Settings2 className="h-8 w-8" />
                <p className="text-sm">Select a feature from the middle panel to configure it.</p>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
