import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListOrdered, Save } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useSelectedStore } from "@/hooks/use-store";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type TurnSettings = {
  turnEnabled: boolean;
  autoAdvanceOnCheckout: boolean;
  turnValueThreshold: number;
  appointmentExclusionWindowMinutes: number;
  /** Which pre-configured turn system the salon runs. */
  turnMode: "dollar" | "classic";
  /** Dollar-Based Turns: what a ticket under the dollars-per-turn amount earns. */
  partialTurnValue: number;
};

/** The pre-configured turn systems a salon can choose from. */
const TURN_SYSTEMS: { mode: TurnSettings["turnMode"]; title: string; description: string }[] = [
  {
    mode: "dollar",
    title: "Dollar-Based Turns",
    description: "Each ticket earns turns by its service amount. The technician with the lowest total today is next — nobody gets the next client just for finishing first.",
  },
  {
    mode: "classic",
    title: "Counted Turns",
    description: "Each ticket at or over the turn value is one turn. A smaller ticket earns nothing and keeps the technician at the front of the line.",
  },
];

const DEFAULT_SETTINGS: TurnSettings = {
  turnEnabled: true,
  autoAdvanceOnCheckout: true,
  turnValueThreshold: 25,
  appointmentExclusionWindowMinutes: 20,
  turnMode: "classic",
  partialTurnValue: 0.5,
};

export default function TurnSystem() {
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<TurnSettings>(DEFAULT_SETTINGS);

  const settingsQuery = useQuery<TurnSettings>({
    queryKey: ["/api/turn/settings", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch(`/api/turn/settings?storeId=${selectedStore?.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load turn settings");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setSettings({
        ...DEFAULT_SETTINGS,
        ...settingsQuery.data,
        turnValueThreshold: Number(settingsQuery.data.turnValueThreshold ?? 25),
        appointmentExclusionWindowMinutes: Number(settingsQuery.data.appointmentExclusionWindowMinutes ?? 20),
        turnMode: settingsQuery.data.turnMode === "dollar" ? "dollar" : "classic",
        partialTurnValue: Number(settingsQuery.data.partialTurnValue ?? 0.5),
      });
    }
  }, [settingsQuery.data]);

  const turnValue = Number(settings.turnValueThreshold) > 0 ? Number(settings.turnValueThreshold) : 30;
  const partialLabel = settings.partialTurnValue === 0.25 ? "¼" : settings.partialTurnValue === 0.75 ? "¾" : settings.partialTurnValue === 1 ? "1" : "½";

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/turn/settings?storeId=${selectedStore?.id}`, settings);
      return res.json();
    },
    onSuccess: (data: TurnSettings) => {
      setSettings({ ...DEFAULT_SETTINGS, ...data });
      queryClient.invalidateQueries({ queryKey: ["/api/turn/settings", selectedStore?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility", selectedStore?.id] });
      toast({ title: "Turn settings saved" });
    },
    onError: () => {
      toast({ title: "Unable to save turn settings", variant: "destructive" });
    },
  });

  const update = <K extends keyof TurnSettings>(key: K, value: TurnSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-5xl px-0 py-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="flex gap-3">
              <ListOrdered className="mt-1 h-5 w-5 text-teal-500" />
              <div>
                <h1 className="text-lg font-bold text-slate-800">Technician Turn System</h1>
                <p className="mt-1 max-w-xl text-sm leading-5 text-slate-500">
                  Manages walk-in distribution between technicians based on clock-in order and
                  POS revenue. Walk-ins only - scheduled appointments are unaffected.
                </p>
              </div>
            </div>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !selectedStore?.id}
              className="gap-2 rounded-xl bg-teal-500 px-4 hover:bg-teal-600"
            >
              <Save className="h-4 w-4" />
              Save
            </Button>
          </div>

          <div className="space-y-0">
            <TurnToggleRow
              title="Enable Technician Turn System"
              description="When ON, walk-ins are assigned by queue position + revenue threshold. When OFF, everything works exactly as before - no changes to booking or POS."
              checked={settings.turnEnabled}
              onCheckedChange={(value) => update("turnEnabled", value)}
            />
            <TurnToggleRow
              title="Hand Waiting Clients to Free Technicians"
              description="When a technician becomes free (a checkout, a clock-in, a break ending), automatically give them the longest-waiting client they are qualified for."
              checked={settings.autoAdvanceOnCheckout}
              onCheckedChange={(value) => update("autoAdvanceOnCheckout", value)}
              hideDivider
            />
          </div>

          <div className="mt-5">
            <p className="mb-2 text-sm font-medium text-slate-700">Turn system</p>
            <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label="Turn system">
              {TURN_SYSTEMS.map((system) => {
                const selected = settings.turnMode === system.mode;
                return (
                  <button
                    key={system.mode}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => update("turnMode", system.mode)}
                    data-testid={`turn-system-${system.mode}`}
                    className={`rounded-xl border p-4 text-left transition-colors ${selected ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                  >
                    <span className="block text-sm font-semibold text-slate-900">{system.title}</span>
                    <span className="mt-1 block text-sm text-slate-600">{system.description}</span>
                  </button>
                );
              })}
            </div>
            {settings.turnMode === "dollar" && (
              <p className="mt-3 text-sm text-slate-600" data-testid="turn-system-example">
                With these rules: a ${Math.max(1, Math.round(turnValue * 0.67))} service earns {partialLabel} turn, a ${Math.round(turnValue * 1.5)} service earns 1 turn, and a ${Math.round(turnValue * 2.2)} service earns 2 turns. Tips, retail and tax never count.
              </p>
            )}
          </div>

          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                {settings.turnMode === "dollar"
                  ? <>Dollars per turn ($) <span className="text-slate-500">- each full amount of service is one turn</span></>
                  : <>Turn Value Threshold ($) <span className="text-slate-500">- min service amount to count as a full turn</span></>}
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={settings.turnValueThreshold}
                onChange={(event) => update("turnValueThreshold", Number(event.target.value))}
                className="h-10 rounded-xl border-slate-200 bg-slate-50"
              />
            </div>

            <div>
              <div className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <label className="text-sm font-medium leading-5 text-slate-700">
                  Appointment Exclusion Window (minutes)
                </label>
                <span className="h-px w-10 bg-slate-300" />
                <span className="text-xs leading-4 text-slate-500">
                  block walk-in assignment before appointment
                </span>
              </div>
              <Input
                type="number"
                min="1"
                step="1"
                value={settings.appointmentExclusionWindowMinutes}
                onChange={(event) => update("appointmentExclusionWindowMinutes", Number(event.target.value))}
                className="h-10 rounded-xl border-slate-200 bg-slate-50"
              />
            </div>
            {settings.turnMode === "dollar" && (
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Turn for a smaller ticket <span className="text-slate-500">- what a service under that amount earns</span>
                </label>
                <select
                  value={String(settings.partialTurnValue)}
                  onChange={(event) => update("partialTurnValue", Number(event.target.value))}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
                  data-testid="turn-partial-value"
                >
                  <option value="0.25">¼ turn</option>
                  <option value="0.5">½ turn</option>
                  <option value="0.75">¾ turn</option>
                  <option value="1">1 turn</option>
                </select>
              </div>
            )}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function TurnToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
  hideDivider = false,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  hideDivider?: boolean;
}) {
  return (
    <div className={hideDivider ? "py-4" : "border-b border-slate-200 py-4"}>
      <div className="flex items-start justify-between gap-5">
        <div className="max-w-xl">
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
          <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>
        </div>
        <Switch
          checked={checked}
          onCheckedChange={onCheckedChange}
          className="mt-0.5 data-[state=checked]:bg-teal-500"
        />
      </div>
    </div>
  );
}
