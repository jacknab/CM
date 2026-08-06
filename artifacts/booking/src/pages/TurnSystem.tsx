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
  useClockInOrder: boolean;
  allowManagerOverrides: boolean;
  turnValueThreshold: number;
  appointmentExclusionWindowMinutes: number;
};

const DEFAULT_SETTINGS: TurnSettings = {
  turnEnabled: true,
  autoAdvanceOnCheckout: true,
  useClockInOrder: true,
  allowManagerOverrides: true,
  turnValueThreshold: 25,
  appointmentExclusionWindowMinutes: 20,
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
      });
    }
  }, [settingsQuery.data]);

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
              title="Auto-Advance on Checkout"
              description="When a POS transaction at or above the turn value completes, automatically move the technician to the back of the queue."
              checked={settings.autoAdvanceOnCheckout}
              onCheckedChange={(value) => update("autoAdvanceOnCheckout", value)}
            />
            <TurnToggleRow
              title="Use Clock-in Order for Initial Queue"
              description="When a technician clocks in, their starting position is based on clock-in time (earliest = first)."
              checked={settings.useClockInOrder}
              onCheckedChange={(value) => update("useClockInOrder", value)}
            />
            <TurnToggleRow
              title="Allow Manager Overrides"
              description="Managers can manually reorder the queue or assign a specific technician to a walk-in."
              checked={settings.allowManagerOverrides}
              onCheckedChange={(value) => update("allowManagerOverrides", value)}
              hideDivider
            />
          </div>

          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Turn Value Threshold ($) <span className="text-slate-500">- min POS total to count as a full turn</span>
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
