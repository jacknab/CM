import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useSelectedStore } from "@/hooks/use-store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import {
  Settings, Copy, ExternalLink, Check, ArrowLeft, QrCode,
  Code2, ToggleLeft, ToggleRight, Clock, Users, Loader2,
  Navigation, MessageSquare, MapPin, CheckCircle2
} from "lucide-react";

type QueuePrefs = {
  queueEnabled: boolean;
  queueAvgServiceTime: number;
  queueMaxSize: number;
  smsTravelBuffer: number;
};

type CaptureStatus = "idle" | "capturing" | "captured" | "error";

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="rounded-xl border bg-muted/30 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/50">
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        </div>
        <button onClick={copy} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
          {copied ? <><Check className="w-3.5 h-3.5 text-green-500" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
        </button>
      </div>
      <pre className="px-4 py-3 text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
        {code}
      </pre>
    </div>
  );
}

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div>
      <label className="block text-sm font-semibold text-foreground mb-1.5">{label}</label>
      <div className="flex gap-2">
        <input
          readOnly
          value={value}
          className="flex-1 px-3 py-2 rounded-lg border bg-muted text-sm font-mono text-muted-foreground"
          onFocus={e => e.target.select()}
        />
        <button onClick={copy} className="px-3 py-2 rounded-lg border hover:bg-muted transition-colors text-sm flex items-center gap-1.5">
          {copied ? <><Check className="w-4 h-4 text-green-500" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
        </button>
        <a href={value} target="_blank" rel="noopener noreferrer"
          className="px-3 py-2 rounded-lg border hover:bg-muted transition-colors text-sm flex items-center gap-1.5">
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}

export default function QueueSettings() {
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const slug = (selectedStore as any)?.bookingSlug;
  const baseUrl = window.location.origin;
  const checkInUrl = slug ? `${baseUrl}/q/${slug}` : "";
  const displayUrl = slug ? `${baseUrl}/q/${slug}/display` : "";

  const { data: settingsData, isLoading } = useQuery<any>({
    queryKey: ["/api/queue/settings", selectedStore?.id],
    queryFn: async () => {
      const r = await fetch(`/api/queue/settings?storeId=${selectedStore?.id}`);
      return r.json();
    },
    enabled: !!selectedStore?.id,
  });

  const [prefs, setPrefs] = useState<QueuePrefs>({
    queueEnabled: true,
    queueAvgServiceTime: 20,
    queueMaxSize: 30,
    smsTravelBuffer: 5,
  });
  const [storeLatitude, setStoreLatitude] = useState<string | null>(null);
  const [storeLongitude, setStoreLongitude] = useState<string | null>(null);
  const [captureStatus, setCaptureStatus] = useState<CaptureStatus>("idle");

  useEffect(() => {
    if (settingsData) {
      setPrefs({
        queueEnabled: settingsData.queueEnabled !== false,
        queueAvgServiceTime: settingsData.queueAvgServiceTime || 20,
        queueMaxSize: settingsData.queueMaxSize || 30,
        smsTravelBuffer: settingsData.smsTravelBuffer ?? 5,
      });
      if (settingsData.storeLatitude) setStoreLatitude(settingsData.storeLatitude);
      if (settingsData.storeLongitude) setStoreLongitude(settingsData.storeLongitude);
    }
  }, [settingsData]);

  const captureStoreLocation = () => {
    if (!navigator.geolocation) { toast({ title: "Geolocation not supported by this browser", variant: "destructive" }); return; }
    setCaptureStatus("capturing");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStoreLatitude(String(pos.coords.latitude));
        setStoreLongitude(String(pos.coords.longitude));
        setCaptureStatus("captured");
        toast({ title: "Store location captured! Save settings to apply." });
      },
      (err) => {
        setCaptureStatus("error");
        toast({ title: "Location access denied. Please allow location permissions.", variant: "destructive" });
      },
      { timeout: 15000, enableHighAccuracy: true }
    );
  };

  const clearStoreLocation = () => {
    setStoreLatitude(null);
    setStoreLongitude(null);
    setCaptureStatus("idle");
  };

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/queue/settings?storeId=${selectedStore?.id}`, {
      ...prefs,
      storeLatitude,
      storeLongitude,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/queue/settings", selectedStore?.id] });
      toast({ title: "Queue settings saved" });
    },
    onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
  });

  const checkInIframe = checkInUrl
    ? `<iframe\n  src="${checkInUrl}"\n  width="100%"\n  height="600"\n  style="border:none;border-radius:16px;"\n  title="Virtual Check-In"\n></iframe>`
    : "";

  const displayIframe = displayUrl
    ? `<iframe\n  src="${displayUrl}"\n  width="100%"\n  height="100vh"\n  style="border:none;"\n  allowfullscreen\n  title="Queue Display Board"\n></iframe>`
    : "";

  const qrUrl = checkInUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(checkInUrl)}`
    : "";

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link to="/dashboard/queue">
            <button className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Queue Settings</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Configure your virtual check-in system and get embed codes</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">

            {/* Queue Settings */}
            <div className="bg-card border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Settings className="w-5 h-5 text-muted-foreground" />
                <h2 className="font-semibold text-foreground">Queue Settings</h2>
              </div>

              <div className="space-y-5">
                {/* Enable/Disable */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm text-foreground">Accept Virtual Check-Ins</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Allow clients to join the queue remotely</p>
                  </div>
                  <button
                    onClick={() => setPrefs(p => ({ ...p, queueEnabled: !p.queueEnabled }))}
                    className="transition-all"
                  >
                    {prefs.queueEnabled
                      ? <ToggleRight className="w-9 h-9 text-primary" />
                      : <ToggleLeft className="w-9 h-9 text-muted-foreground" />}
                  </button>
                </div>

                {/* Avg service time */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    Average Service Time (minutes)
                  </label>
                  <p className="text-xs text-muted-foreground mb-2">Used to estimate wait times for clients</p>
                  <div className="flex items-center gap-3">
                    {[10, 15, 20, 30, 45, 60].map(mins => (
                      <button
                        key={mins}
                        onClick={() => setPrefs(p => ({ ...p, queueAvgServiceTime: mins }))}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all ${
                          prefs.queueAvgServiceTime === mins
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-border text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        {mins}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Max queue size */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    Max Queue Size
                  </label>
                  <p className="text-xs text-muted-foreground mb-2">Stop accepting check-ins once this limit is reached</p>
                  <div className="flex items-center gap-3">
                    {[10, 20, 30, 50, 100].map(n => (
                      <button
                        key={n}
                        onClick={() => setPrefs(p => ({ ...p, queueMaxSize: n }))}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all ${
                          prefs.queueMaxSize === n
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-border text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* SMS early-alert buffer */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    SMS Head-Start Buffer (minutes)
                  </label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Send the travel alert this many minutes <em>before</em> the drive time to add a safety margin
                  </p>
                  <div className="flex items-center gap-3">
                    {[0, 3, 5, 8, 10, 15].map(n => (
                      <button
                        key={n}
                        onClick={() => setPrefs(p => ({ ...p, smsTravelBuffer: n }))}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all ${
                          prefs.smsTravelBuffer === n
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-border text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        {n === 0 ? "None" : `+${n}`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex justify-end">
                <button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
                >
                  {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Settings"}
                </button>
              </div>
            </div>

            {/* Smart SMS Dispatch — Store Location */}
            <div className="bg-card border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <Navigation className="w-5 h-5 text-muted-foreground" />
                <h2 className="font-semibold text-foreground">Smart SMS Dispatch</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-5">
                When clients share their location at check-in, the system automatically texts them
                when it's time to leave — calculated using the real drive time to your store plus how
                fast the line is moving right now.
              </p>

              <div className="space-y-4">
                {/* How it works */}
                <div className="bg-muted/40 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">How it works</p>
                  {[
                    { icon: "📍", text: "Client shares location when they join the queue" },
                    { icon: "📊", text: "System tracks real queue speed from today's completions" },
                    { icon: "🧮", text: "Calculates drive time from client's location to your store" },
                    { icon: "💬", text: "Texts them automatically when it's time to head over" },
                  ].map((step, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span>{step.icon}</span>
                      <span>{step.text}</span>
                    </div>
                  ))}
                </div>

                {/* Store location pin */}
                <div>
                  <p className="text-sm font-semibold text-foreground mb-1">
                    Step 1 — Pin Your Store Location
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Open this settings page on a device at your store location, then click below to pin it.
                    This is required for distance calculations.
                  </p>

                  {storeLatitude && storeLongitude ? (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 flex-1 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/40 rounded-xl px-4 py-3">
                        <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-green-700 dark:text-green-300">Location pinned</p>
                          <p className="text-xs text-green-600 dark:text-green-400 font-mono mt-0.5">
                            {parseFloat(storeLatitude).toFixed(5)}, {parseFloat(storeLongitude).toFixed(5)}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={captureStoreLocation}
                        disabled={captureStatus === "capturing"}
                        className="px-3 py-2.5 rounded-xl border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-60"
                      >
                        {captureStatus === "capturing" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Re-pin"}
                      </button>
                      <button
                        onClick={clearStoreLocation}
                        className="px-3 py-2.5 rounded-xl border text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={captureStoreLocation}
                      disabled={captureStatus === "capturing"}
                      className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-border hover:border-primary/50 text-sm font-medium text-muted-foreground hover:text-foreground transition-all disabled:opacity-60 w-full justify-center"
                    >
                      {captureStatus === "capturing" ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Getting location…</>
                      ) : (
                        <><Navigation className="w-4 h-4" /> Pin Store Location (use this device at your store)</>
                      )}
                    </button>
                  )}

                  {captureStatus === "error" && (
                    <p className="text-xs text-red-500 mt-2">
                      Location access was denied. Please allow location permissions in your browser settings.
                    </p>
                  )}
                </div>

                <p className="text-xs text-muted-foreground border-t pt-3">
                  <strong>Note:</strong> SMS travel alerts require Twilio to be configured and the client to have provided a phone number. The system sends at most one travel alert per queue entry.
                </p>
              </div>
            </div>

            {/* Share Links */}
            {slug ? (
              <div className="bg-card border rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <ExternalLink className="w-5 h-5 text-muted-foreground" />
                  <h2 className="font-semibold text-foreground">Share Links</h2>
                </div>
                <CopyField value={checkInUrl} label="Client Check-In URL" />
                <CopyField value={displayUrl} label="Queue Display Board URL (for TV / lobby screen)" />
              </div>
            ) : (
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-xl p-4 text-sm text-amber-700 dark:text-amber-300">
                ⚠️ Set your <strong>Booking Slug</strong> in Online Booking settings to enable check-in links.
              </div>
            )}

            {/* Embed Codes */}
            {slug && (
              <div className="bg-card border rounded-xl p-5 space-y-5">
                <div className="flex items-center gap-2">
                  <Code2 className="w-5 h-5 text-muted-foreground" />
                  <h2 className="font-semibold text-foreground">Embed Codes</h2>
                </div>
                <p className="text-sm text-muted-foreground -mt-2">
                  Paste these into your website's HTML to add the check-in form or live display board.
                </p>
                <CodeBlock code={checkInIframe} label="Check-In Widget (embed on your website)" />
                <CodeBlock code={displayIframe} label="Queue Display Board (embed or open full-screen on a TV)" />
              </div>
            )}

            {/* QR Code */}
            {slug && qrUrl && (
              <div className="bg-card border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <QrCode className="w-5 h-5 text-muted-foreground" />
                  <h2 className="font-semibold text-foreground">QR Code</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Print and display at your front desk so walk-ins can scan to join the line.
                </p>
                <div className="flex items-center gap-6">
                  <div className="p-3 bg-white border rounded-xl shadow-sm">
                    <img src={qrUrl} alt="Check-in QR Code" className="w-40 h-40" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Points to:</p>
                    <p className="text-xs font-mono text-muted-foreground">{checkInUrl}</p>
                    <a
                      href={qrUrl}
                      download="checkin-qr-code.png"
                      className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline mt-2"
                    >
                      Download QR Code
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
