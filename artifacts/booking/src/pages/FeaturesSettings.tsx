import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useSelectedStore } from "@/hooks/use-store";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, Lock } from "lucide-react";
import { isNailSalonBiz } from "@/hooks/use-features";

type FeatureFlags = {
  turnSystem:         boolean;
  timeclock:          boolean;
  waitlist:           boolean;
  pos:                boolean;
  rewardPoints:       boolean;
  autoClockOutFloor:  string;
  kioskEnabled:       boolean;
  staffPortalEnabled: boolean;
};

const DEFAULT_FLAGS: FeatureFlags = {
  turnSystem:         true,
  timeclock:          true,
  waitlist:           true,
  pos:                true,
  rewardPoints:       true,
  autoClockOutFloor:  "01:00",
  kioskEnabled:       true,
  staffPortalEnabled: true,
};

const FLOOR_OPTIONS = [
  { value: "00:00", label: "12:00 AM (midnight)" },
  { value: "01:00", label: "1:00 AM" },
  { value: "02:00", label: "2:00 AM" },
  { value: "03:00", label: "3:00 AM" },
  { value: "04:00", label: "4:00 AM" },
  { value: "05:00", label: "5:00 AM" },
];

export default function FeaturesSettings() {
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const isNailSalon = isNailSalonBiz(selectedStore?.category);

  const { data: features, isLoading } = useQuery<FeatureFlags>({
    queryKey: ["/api/settings/features", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) throw new Error("No store");
      const res = await fetch(`/api/settings/features?storeId=${selectedStore.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const mutation = useMutation({
    mutationFn: async ({ updates, storeId }: { updates: Partial<FeatureFlags>; storeId: number }) => {
      const res = await apiRequest("PATCH", `/api/settings/features?storeId=${storeId}`, updates);
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onMutate: async ({ updates, storeId }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/settings/features", storeId] });
      const previous = queryClient.getQueryData<FeatureFlags>(["/api/settings/features", storeId]);
      queryClient.setQueryData<FeatureFlags>(["/api/settings/features", storeId], (old) => ({
        ...(old ?? DEFAULT_FLAGS),
        ...updates,
      }));
      return { previous };
    },
    onSuccess: (data, { updates, storeId }) => {
      const serverFlags: FeatureFlags | null = data && typeof data === "object" && "turnSystem" in data ? data as FeatureFlags : null;
      queryClient.setQueryData<FeatureFlags>(["/api/settings/features", storeId], (old) =>
        serverFlags ?? { ...(old ?? DEFAULT_FLAGS), ...updates }
      );
      queryClient.invalidateQueries({ queryKey: ["/api/settings/features", storeId] });
      toast({ title: "Feature setting saved" });
    },
    onError: (_err, { updates, storeId }, context) => {
      queryClient.setQueryData(["/api/settings/features", storeId], context?.previous ?? DEFAULT_FLAGS);
      toast({ title: "Error", description: "Failed to save setting.", variant: "destructive" });
    },
  });

  const current = features ?? DEFAULT_FLAGS;

  function toggle(key: keyof FeatureFlags, value: boolean) {
    if (!selectedStore?.id) return;
    mutation.mutate({ updates: { [key]: value }, storeId: selectedStore.id });
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="sticky top-0 z-20 bg-background border-b px-6 py-4 -mx-6 -mt-6 mb-6">
        <h1 className="text-xl font-display font-bold">Features</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Enable or disable the features available to your salon.</p>
      </div>

      <div className="space-y-6 max-w-2xl">

        {/* ── Queue & Scheduling ── */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 px-1">Queue & Scheduling</p>
          <div className="space-y-3">

            {/* Turn System */}
            {isNailSalon ? (
              <Card>
                <CardContent className="p-5">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      checked={!!current.turnSystem}
                      onCheckedChange={(checked) => toggle("turnSystem", checked === true)}
                      disabled={mutation.isPending}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="flex items-center gap-2 mb-0.5">
                        <span className="block text-sm font-medium">Turn System</span>
                      </span>
                      <span className="block text-xs text-muted-foreground mt-1 leading-relaxed">
                        Manages a rotating walk-in queue so staff take clients in fair order. Staff availability is controlled via the toggle on each staff member's column in the calendar. Visible in the sidebar under Clients.
                      </span>
                    </span>
                  </label>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed opacity-60">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <Lock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <span>
                      <span className="block text-sm font-medium mb-0.5">Turn System</span>
                      <span className="block text-xs text-muted-foreground leading-relaxed">
                        The Turn System is available exclusively for Nail Salon businesses. It manages a rotating walk-in queue so staff take clients in fair order.
                      </span>
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Timeclock */}
            <Card>
              <CardContent className="p-5">
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={!!current.timeclock}
                    onCheckedChange={(checked) => toggle("timeclock", checked === true)}
                    disabled={mutation.isPending}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium mb-0.5">Timeclock</span>
                    <span className="block text-xs text-muted-foreground mt-1 leading-relaxed">
                      Lets staff clock in and out via a PIN pad. When disabled, staff availability falls back to the hours set in each staff member's profile.
                    </span>
                  </span>
                </label>
              </CardContent>
            </Card>

            {/* Waitlist */}
            <Card>
              <CardContent className="p-5">
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={!!current.waitlist}
                    onCheckedChange={(checked) => toggle("waitlist", checked === true)}
                    disabled={mutation.isPending}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium mb-0.5">Waitlist</span>
                    <span className="block text-xs text-muted-foreground mt-1 leading-relaxed">
                      Lets you add walk-in clients to a waitlist when all staff are busy. Visible in the sidebar under Clients.
                    </span>
                  </span>
                </label>
              </CardContent>
            </Card>

          </div>
        </div>

        {/* ── Check-In Kiosk ── */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 px-1">Check-In Kiosk</p>
          <div className="space-y-3">
            <Card>
              <CardContent className="p-5">
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={!!current.kioskEnabled}
                    onCheckedChange={(checked) => toggle("kioskEnabled", checked === true)}
                    disabled={mutation.isPending}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium mb-0.5">Enable Kiosk Check-In</span>
                    <span className="block text-xs text-muted-foreground mt-1 leading-relaxed">
                      When enabled, clients can check in from a tablet at <span className="font-mono">certxa.com/kiosk/your-slug</span>. Disabling this shows a "closed" screen on any active kiosk devices.
                    </span>
                  </span>
                </label>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Staff Portal ── */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 px-1">Staff Portal</p>
          <div className="space-y-3">
            <Card>
              <CardContent className="p-5">
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={!!current.staffPortalEnabled}
                    onCheckedChange={(checked) => toggle("staffPortalEnabled", checked === true)}
                    disabled={mutation.isPending}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium mb-0.5">Enable Staff Portal Access</span>
                    <span className="block text-xs text-muted-foreground mt-1 leading-relaxed">
                      When enabled, your staff can log in to the Certxa Staff Portal app using their phone number and a one-time SMS code. When disabled, all login attempts from staff will be blocked with a message explaining that your salon has turned off portal access.
                    </span>
                  </span>
                </label>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── POS & Loyalty ── */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 px-1">POS & Loyalty</p>
          <div className="space-y-3">

            {/* Point of Sale */}
            <Card>
              <CardContent className="p-5">
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={!!current.pos}
                    onCheckedChange={(checked) => toggle("pos", checked === true)}
                    disabled={mutation.isPending}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium mb-0.5">Enable built-in POS</span>
                    <span className="block text-xs text-muted-foreground mt-1 leading-relaxed">
                      When enabled, completed appointments go through a checkout flow for payment collection, tips, and discounts. Financial reports and analytics are also available. Disable this if you handle payments externally and only need appointment tracking.
                    </span>
                  </span>
                </label>
              </CardContent>
            </Card>

            {/* Reward Points */}
            <Card>
              <CardContent className="p-5">
                <label className="flex items-start gap-3 cursor-pointer">
                  <Checkbox
                    checked={!!current.rewardPoints}
                    onCheckedChange={(checked) => toggle("rewardPoints", checked === true)}
                    disabled={mutation.isPending}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium mb-0.5">Reward Points</span>
                    <span className="block text-xs text-muted-foreground mt-1 leading-relaxed">
                      Allows clients to earn and redeem points on every visit through your loyalty program.
                    </span>
                  </span>
                </label>
              </CardContent>
            </Card>

          </div>
        </div>

      </div>
    </AppLayout>
  );
}
