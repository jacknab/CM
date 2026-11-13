import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QRCodeCanvas } from "qrcode.react";
import {
  Copy, Check, Tablet, Save, Loader2, ExternalLink,
  Wifi, RotateCcw, ShieldCheck, ShieldAlert,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { AppLayout } from "@/components/layout/AppLayout";
import { useInSettingsShell } from "@/lib/settings-shell-context";
import { useToast } from "@/hooks/use-toast";
import { getDeviceId } from "@/lib/device-id";

interface KioskSettingsData {
  bookingSlug: string | null;
  storeName: string | null;
  kioskEnabled: boolean;
  welcomeHeadline: string;
  welcomeSubText: string;
  loyaltyPromoText: string;
  categoryImages: Record<string, string>;
  showServicePrice: boolean;
  showServiceDuration: boolean;
  dualScreenMode: boolean;
  smartCheckin: boolean;
}

interface NetworkStatus {
  enabled: boolean;
  established: boolean;
  trustedIp: string | null;
  updatedAt: string | null;
  isThisDeviceAnchor: boolean;
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// Restricts /kiosk and /frontdesk to the salon's own network. Separate from
// the main kiosk-settings form above — this reads/writes locations.restrict_
// kiosk_network + store_network_trust directly (see lib/salonNetworkGuard.ts
// on the server), not the kioskSettings JSON blob.
function NetworkRestrictionSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deviceId = getDeviceId();

  const { data: status, isLoading } = useQuery<NetworkStatus>({
    queryKey: [`/api/store-network/status?deviceId=${deviceId}`],
    queryFn: async () => {
      const r = await fetch(`/api/store-network/status?deviceId=${deviceId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load network status");
      return r.json();
    },
    staleTime: 30_000,
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const r = await fetch("/api/store-network/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!r.ok) throw new Error("Failed to update setting");
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/store-network/status?deviceId=${deviceId}`] }),
    onError: () => toast({ title: "Failed to update setting", variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/store-network/reset", { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error("Failed to reset");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/store-network/status?deviceId=${deviceId}`] });
      toast({ title: "Trusted network cleared", description: "The next device to open /calendar will establish a new one." });
    },
    onError: () => toast({ title: "Failed to reset trusted network", variant: "destructive" }),
  });

  const handleReset = () => {
    if (!window.confirm("Clear the trusted network? Kiosk/front-desk access will be unrestricted until the next device opens /calendar and establishes a new one.")) return;
    resetMutation.mutate();
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-slate-700 flex items-center gap-2">
            <Wifi className="w-4 h-4 text-teal-500" />
            Restrict to Salon Network
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            When on, the check-in kiosk and front-desk tablet(s) only load from your salon's own WiFi — anyone
            trying the URL from outside your network sees a blank page. The trusted network is learned
            automatically from the first device that opens <code className="text-xs">/calendar</code>.
          </p>
        </div>
        <Switch
          checked={!!status?.enabled}
          disabled={isLoading || toggleMutation.isPending}
          onCheckedChange={(v) => toggleMutation.mutate(v)}
        />
      </div>

      {status?.enabled && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm space-y-2">
          {status.established ? (
            <>
              <div className="flex items-center gap-2 text-slate-700 font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                Trusted network locked in
              </div>
              <p className="text-slate-500 text-xs pl-6">
                {status.updatedAt ? `Confirmed ${relativeTime(status.updatedAt)}` : ""}
                {status.isThisDeviceAnchor ? " · this device" : " · a different device"}
              </p>
            </>
          ) : (
            <div className="flex items-center gap-2 text-slate-700">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              Not established yet — open <code className="text-xs">/calendar</code> on the salon's own WiFi
              to lock it in. Until then, kiosk/front-desk access is unrestricted.
            </div>
          )}
          <div className="pl-6 pt-1">
            <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={handleReset} disabled={resetMutation.isPending}>
              <RotateCcw className="w-3.5 h-3.5" />
              Reset trusted network
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function KioskSettings() {
  const { toast } = useToast();
  const inShell = useInSettingsShell();
  const [copied, setCopied] = useState(false);
  const [formReady, setFormReady] = useState(false);
  const [form, setForm] = useState({
    kioskEnabled: true,
    welcomeHeadline: "",
    welcomeSubText: "",
    loyaltyPromoText: "",
    showServicePrice: true,
    showServiceDuration: true,
    dualScreenMode: false,
    smartCheckin: true,
  });

  const { data, isLoading } = useQuery<KioskSettingsData>({
    queryKey: ["/api/kiosk-settings"],
    queryFn: async () => {
      const r = await fetch("/api/kiosk-settings", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load kiosk settings");
      return r.json();
    },
  });

  useEffect(() => {
    if (data && !formReady) {
      setForm({
        kioskEnabled: data.kioskEnabled,
        welcomeHeadline: data.welcomeHeadline,
        welcomeSubText: data.welcomeSubText,
        loyaltyPromoText: data.loyaltyPromoText,
        showServicePrice: data.showServicePrice,
        showServiceDuration: data.showServiceDuration,
        dualScreenMode: data.dualScreenMode,
        smartCheckin: data.smartCheckin !== false,
      });
      setFormReady(true);
    }
  }, [data, formReady]);

  const kioskUrl = data?.bookingSlug
    ? `${window.location.origin}/kiosk/${data.bookingSlug}`
    : null;
  // Dual Screen POS Mode is driven by a DIFFERENT route than the self
  // check-in kiosk above — the client-facing tablet needs THIS URL, not
  // kioskUrl (see POS Stations settings for additional stations).
  const frontdeskUrl = data?.bookingSlug
    ? `${window.location.origin}/frontdesk/${data.bookingSlug}`
    : null;

  const handleCopy = () => {
    if (!kioskUrl) return;
    navigator.clipboard.writeText(kioskUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const [frontdeskCopied, setFrontdeskCopied] = useState(false);
  const handleFrontdeskCopy = () => {
    if (!frontdeskUrl) return;
    navigator.clipboard.writeText(frontdeskUrl).then(() => {
      setFrontdeskCopied(true);
      setTimeout(() => setFrontdeskCopied(false), 2000);
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/kiosk-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error("Failed to save");
      return r.json();
    },
    onSuccess: () => toast({ title: "Kiosk settings saved" }),
    onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
  });

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 space-y-8">
        {!inShell && (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Check-in Kiosk</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Configure the self check-in tablet experience for your clients.
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

            {/* ── Kiosk URL ── */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <Tablet className="w-5 h-5 text-teal-500" />
                <h2 className="font-semibold text-slate-700">Your Kiosk URL</h2>
              </div>
              {kioskUrl ? (
                <>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 font-mono truncate">
                      {kioskUrl}
                    </code>
                    <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={handleCopy}>
                      {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      {copied ? "Copied!" : "Copy"}
                    </Button>
                    <Button variant="outline" size="sm" className="shrink-0"
                      onClick={() => window.open(kioskUrl, "_blank")} title="Open kiosk">
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex flex-col items-center gap-3 pt-2">
                    <p className="text-xs text-slate-400 uppercase tracking-widest font-medium">
                      Scan to open on a tablet
                    </p>
                    <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm inline-block">
                      <QRCodeCanvas value={kioskUrl} size={180} level="M" includeMargin={false} />
                    </div>
                    <p className="text-xs text-slate-400">
                      Open this URL on an iPad or Android tablet to launch the kiosk.
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-500">
                  Kiosk URL is not available — make sure your store has a booking slug set in Business Settings.
                </p>
              )}
            </div>

            {/* ── Kiosk Builder ── */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-3">
              <div>
                <h2 className="font-semibold text-slate-700">Kiosk design</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  The look, welcome picture, steps, rules and words of your check-in kiosk, with a live preview.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to="/kiosk-builder">Open Kiosk Builder</Link>
              </Button>
            </div>

            {/* ── Dual Screen POS ── */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-slate-700">Dual Screen POS Mode</h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Enable when this kiosk is loaded on the client-facing screen of a dual-display POS setup.
                    The kiosk will show the client their cart, a tip selection screen, and a thank-you screen
                    — all triggered automatically when the staff completes a sale in the POS.
                  </p>
                </div>
                <Switch
                  checked={form.dualScreenMode}
                  onCheckedChange={v => setForm(f => ({ ...f, dualScreenMode: v }))}
                />
              </div>
              {form.dualScreenMode && frontdeskUrl && (
                <div className="rounded-xl bg-teal-50 border border-teal-100 px-4 py-3 text-sm text-teal-700 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-lg leading-none">💡</span>
                    <span>
                      Open this URL on the client-facing screen — not the kiosk URL above. When your staff
                      opens the Walk-In Checkout panel on the POS, the checkout flow will appear here automatically.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pl-6">
                    <code className="flex-1 bg-white border border-teal-200 rounded-lg px-3 py-2 text-xs text-teal-900 font-mono truncate">
                      {frontdeskUrl}
                    </code>
                    <Button variant="outline" size="sm" className="shrink-0 gap-1.5 h-8" onClick={handleFrontdeskCopy}>
                      {frontdeskCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      {frontdeskCopied ? "Copied!" : "Copy"}
                    </Button>
                  </div>
                  <p className="pl-6 text-xs text-teal-600">
                    Running more than one checkout station? Set them up individually in{" "}
                    <a href="/settings/registers" className="underline font-medium">POS Stations</a>.
                  </p>
                </div>
              )}
            </div>

            {/* ── Restrict to Salon Network ── */}
            <NetworkRestrictionSection />

            {/* ── Enable toggle ── */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-slate-700">Enable Kiosk</h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    When disabled, clients who visit your kiosk URL see a "Check-in is closed" screen.
                  </p>
                </div>
                <Switch
                  checked={form.kioskEnabled}
                  onCheckedChange={v => setForm(f => ({ ...f, kioskEnabled: v }))}
                />
              </div>
            </div>

            {/* ── Save ── */}
            <div className="flex justify-end">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="bg-teal-600 hover:bg-teal-500 text-white gap-1.5"
              >
                {saveMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Save className="w-4 h-4" />}
                Save changes
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
