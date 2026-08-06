import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ArrowRight,
  Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SyncSettings {
  syncEnabled: boolean;
  syncName: boolean;
  syncDescription: boolean;
  syncPrice: boolean;
  syncAddNew: boolean;
  syncRemoveDeleted: boolean;
  syncMode: "auto" | "manual";
  lastSyncedAt: string | null;
  lastSyncStatus: "success" | "failed" | null;
  lastSyncError: string | null;
  lastSyncCount: number | null;
}

interface GoogleServicesProps {
  storeId: number;
}

export function GoogleServicesSync({ storeId }: GoogleServicesProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const { data: settings, isLoading } = useQuery<SyncSettings>({
    queryKey: ["gbp-service-sync-settings", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/google-business/services/sync-settings?storeId=${storeId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load sync settings");
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (patch: Partial<SyncSettings>) => {
      const res = await fetch("/api/google-business/services/sync-settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, ...patch }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to save" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gbp-service-sync-settings", storeId] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to save settings", description: err.message, variant: "destructive" });
    },
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/google-business/services/sync", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Sync failed");
      toast({
        title: "Services synced",
        description: data.message ?? `${data.syncedCount ?? 0} service(s) pushed to Google.`,
      });
      queryClient.invalidateQueries({ queryKey: ["gbp-service-sync-settings", storeId] });
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const toggle = (field: keyof SyncSettings, value: boolean) => {
    updateMutation.mutate({ [field]: value });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  const s = settings ?? {
    syncEnabled: false,
    syncName: true,
    syncDescription: true,
    syncPrice: true,
    syncAddNew: true,
    syncRemoveDeleted: false,
    syncMode: "auto" as const,
    lastSyncedAt: null,
    lastSyncStatus: null,
    lastSyncError: null,
    lastSyncCount: null,
  };

  return (
    <div className="space-y-6">
      {/* ── Master toggle ────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">Keep Google services synchronized</CardTitle>
              <CardDescription className="mt-1">
                When enabled, Certxa is the single source of truth for your service menu.
                Changes you make here are pushed to your Google Business Profile automatically.
              </CardDescription>
            </div>
            <Switch
              checked={s.syncEnabled}
              onCheckedChange={(v) => toggle("syncEnabled", v)}
              disabled={updateMutation.isPending}
            />
          </div>
        </CardHeader>

        {/* Last sync status */}
        {(s.lastSyncedAt || s.lastSyncStatus) && (
          <CardContent className="pt-0">
            <Separator className="mb-3" />
            <div className="flex items-center gap-2 text-sm">
              {s.lastSyncStatus === "success" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              ) : s.lastSyncStatus === "failed" ? (
                <XCircle className="h-4 w-4 text-destructive shrink-0" />
              ) : (
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className="text-muted-foreground">
                {s.lastSyncStatus === "success" && s.lastSyncedAt
                  ? `Last synced ${new Date(s.lastSyncedAt).toLocaleString()} — ${s.lastSyncCount ?? 0} service(s) pushed`
                  : s.lastSyncStatus === "failed"
                  ? `Last sync failed: ${s.lastSyncError ?? "Unknown error"}`
                  : "Never synced"}
              </span>
            </div>
          </CardContent>
        )}
      </Card>

      {s.syncEnabled && (
        <>
          {/* ── What to sync ─────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">When a service changes in Certxa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <SyncToggleRow
                label="Update name"
                description="Service name on Google matches Certxa"
                checked={s.syncName}
                onChange={(v) => toggle("syncName", v)}
                disabled={updateMutation.isPending}
              />
              <Separator />
              <SyncToggleRow
                label="Update description"
                description="Description written in Certxa appears on Google"
                checked={s.syncDescription}
                onChange={(v) => toggle("syncDescription", v)}
                disabled={updateMutation.isPending}
              />
              <Separator />
              <SyncToggleRow
                label="Update price"
                description="Price label is included in the Google listing"
                checked={s.syncPrice}
                onChange={(v) => toggle("syncPrice", v)}
                disabled={updateMutation.isPending}
              />
              <Separator />
              <SyncToggleRow
                label="Add new services"
                description="Services created in Certxa are added to Google"
                checked={s.syncAddNew}
                onChange={(v) => toggle("syncAddNew", v)}
                disabled={updateMutation.isPending}
              />
              <Separator />
              <SyncToggleRow
                label="Remove deleted services from Google"
                description="Services removed in Certxa are archived on Google"
                checked={s.syncRemoveDeleted}
                onChange={(v) => toggle("syncRemoveDeleted", v)}
                disabled={updateMutation.isPending}
              />
            </CardContent>
          </Card>

          {/* ── Sync mode ────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Sync</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => updateMutation.mutate({ syncMode: "auto" })}
                  className={`flex-1 rounded-lg border px-4 py-3 text-left transition-colors ${
                    s.syncMode === "auto"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                  disabled={updateMutation.isPending}
                >
                  <div className="font-medium text-sm">Automatic</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Syncs immediately when you save a service
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => updateMutation.mutate({ syncMode: "manual" })}
                  className={`flex-1 rounded-lg border px-4 py-3 text-left transition-colors ${
                    s.syncMode === "manual"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                  disabled={updateMutation.isPending}
                >
                  <div className="font-medium text-sm">Manual</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Only syncs when you click "Sync Now"
                  </div>
                </button>
              </div>
            </CardContent>
          </Card>

          {/* ── How it works ─────────────────────────────────────── */}
          <Card className="bg-muted/40 border-dashed">
            <CardContent className="pt-4">
              <div className="flex gap-3">
                <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>
                    <span className="font-medium text-foreground">How it works:</span> Certxa uses
                    Google's free-form service item API. Each active service is matched to Google by
                    name and updated in place — no duplicate entries.
                  </p>
                  <p>
                    Services that exist on Google but not in Certxa are left untouched unless
                    "Remove deleted services" is on.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Manual sync ──────────────────────────────────────── */}
          <div className="flex items-center justify-between rounded-lg border p-4 bg-background">
            <div>
              <div className="font-medium text-sm">Sync now</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Push all active services from Certxa to Google immediately
              </div>
            </div>
            <Button
              onClick={handleSync}
              disabled={syncing}
              variant="outline"
              className="gap-2"
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {syncing ? "Syncing…" : "Sync Now"}
            </Button>
          </div>
        </>
      )}

      {!s.syncEnabled && (
        <Card className="border-dashed">
          <CardContent className="pt-6 pb-6 text-center space-y-3">
            <div className="text-sm text-muted-foreground max-w-sm mx-auto">
              Enable sync above to keep your Google Business Profile service menu
              automatically up to date with Certxa. No more logging into Google to
              add or update services.
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <span>Certxa</span>
              <ArrowRight className="h-3.5 w-3.5" />
              <span>Google Business Profile</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SyncToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
