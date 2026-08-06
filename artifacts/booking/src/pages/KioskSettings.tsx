import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QRCodeCanvas } from "qrcode.react";
import {
  Copy, Check, Tablet, Save, Loader2, ExternalLink, Upload, ImageIcon, CheckCircle2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AppLayout } from "@/components/layout/AppLayout";
import { useToast } from "@/hooks/use-toast";

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
}

const NAIL_GROUPS = [
  {
    key: "hand",
    label: "Hand Services",
    description: "Shown on the Manicures / Hand Services card",
    emoji: "💅",
  },
  {
    key: "foot",
    label: "Foot Services",
    description: "Shown on the Pedicures / Foot Services card",
    emoji: "🦶",
  },
  {
    key: "combo",
    label: "Mani-Pedi Packages",
    description: "Shown on the Combo / Mani-Pedi Packages card",
    emoji: "✨",
  },
];

export default function KioskSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
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
  });

  // Per-card upload state: { [key]: { loading, url, done } }
  const [uploadState, setUploadState] = useState<
    Record<string, { loading: boolean; url: string | null; done: boolean }>
  >({
    hand:  { loading: false, url: null, done: false },
    foot:  { loading: false, url: null, done: false },
    combo: { loading: false, url: null, done: false },
  });

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

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
      });
      // Seed upload state with any already-saved images
      if (data.categoryImages) {
        setUploadState(prev => {
          const next = { ...prev };
          for (const key of Object.keys(next)) {
            if (data.categoryImages[key]) {
              next[key] = { ...next[key], url: data.categoryImages[key], done: true };
            }
          }
          return next;
        });
      }
      setFormReady(true);
    }
  }, [data, formReady]);

  const kioskUrl = data?.bookingSlug
    ? `${window.location.origin}/kiosk/${data.bookingSlug}`
    : null;

  const handleCopy = () => {
    if (!kioskUrl) return;
    navigator.clipboard.writeText(kioskUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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

  const handleImageUpload = async (categoryKey: string, file: File) => {
    setUploadState(prev => ({
      ...prev,
      [categoryKey]: { loading: true, url: prev[categoryKey]?.url ?? null, done: false },
    }));

    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append("categoryKey", categoryKey);

      const r = await fetch("/api/kiosk-settings/category-image", {
        method: "POST",
        credentials: "include",
        body: fd,
      });

      if (!r.ok) throw new Error("Upload failed");
      const d = await r.json();

      setUploadState(prev => ({
        ...prev,
        [categoryKey]: { loading: false, url: d.url, done: true },
      }));

      qc.invalidateQueries({ queryKey: ["/api/kiosk-settings"] });
      toast({ title: `${NAIL_GROUPS.find(g => g.key === categoryKey)?.label} image uploaded!` });
    } catch {
      setUploadState(prev => ({
        ...prev,
        [categoryKey]: { ...prev[categoryKey], loading: false },
      }));
      toast({ title: "Upload failed — please try again", variant: "destructive" });
    }
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Kiosk Settings</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Configure the self check-in tablet experience for your clients.
          </p>
        </div>

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

            {/* ── Category Card Images ── */}
            <div className="hidden bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
              <div>
                <h2 className="font-semibold text-slate-700">Category Card Images</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Upload one photo per card. These appear as the large image at the top of each
                  "What brings you in today?" card on the check-in kiosk.
                </p>
              </div>

              <div className="space-y-4">
                {NAIL_GROUPS.map(group => {
                  const state = uploadState[group.key];
                  const previewUrl = state?.url ?? data?.categoryImages?.[group.key] ?? null;

                  return (
                    <div key={group.key}
                      className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50">

                      {/* Thumbnail */}
                      <div className="w-20 h-20 rounded-xl overflow-hidden border border-slate-200 bg-white flex items-center justify-center flex-shrink-0">
                        {previewUrl ? (
                          <img src={previewUrl} alt={group.label} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-3xl">{group.emoji}</span>
                        )}
                      </div>

                      {/* Info + upload */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-700 text-sm">{group.label}</p>
                          {state?.done && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{group.description}</p>
                      </div>

                      {/* Upload button */}
                      <div className="flex-shrink-0">
                        <input
                          ref={el => { fileInputRefs.current[group.key] = el; }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) handleImageUpload(group.key, file);
                            e.target.value = "";
                          }}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={state?.loading}
                          onClick={() => fileInputRefs.current[group.key]?.click()}
                        >
                          {state?.loading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : previewUrl ? (
                            <ImageIcon className="w-4 h-4" />
                          ) : (
                            <Upload className="w-4 h-4" />
                          )}
                          {state?.loading ? "Uploading…" : previewUrl ? "Replace" : "Upload"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-slate-400">
                Recommended: square or landscape photos, at least 800×600px. JPG or PNG.
              </p>
            </div>

            {/* ── Service Display ── */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
              <div>
                <h2 className="font-semibold text-slate-700">Service Display</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Control what information is shown on each service card during check-in.
                </p>
              </div>

              <div className="flex items-start justify-between gap-4 py-1">
                <div>
                  <p className="text-sm font-medium text-slate-700">Show Service Price</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Display the price on each service card on the kiosk.
                  </p>
                </div>
                <Switch
                  checked={form.showServicePrice}
                  onCheckedChange={v => setForm(f => ({ ...f, showServicePrice: v }))}
                />
              </div>

              <div className="border-t border-slate-100" />

              <div className="flex items-start justify-between gap-4 py-1">
                <div>
                  <p className="text-sm font-medium text-slate-700">Show Service Duration</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Display the estimated duration on each service card on the kiosk.
                  </p>
                </div>
                <Switch
                  checked={form.showServiceDuration}
                  onCheckedChange={v => setForm(f => ({ ...f, showServiceDuration: v }))}
                />
              </div>
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
              {form.dualScreenMode && (
                <div className="rounded-xl bg-teal-50 border border-teal-100 px-4 py-3 text-sm text-teal-700 flex items-start gap-2">
                  <span className="text-lg leading-none">💡</span>
                  <span>
                    Open this kiosk URL on the client-facing screen. When your staff opens the Walk-In
                    Checkout panel on the POS, the checkout flow will appear here automatically.
                  </span>
                </div>
              )}
            </div>

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

            {/* ── Display text ── */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
              <h2 className="font-semibold text-slate-700">Display Text</h2>

              <div>
                <label className="text-sm font-medium text-slate-600 block mb-1.5">
                  Welcome Headline
                </label>
                <Input
                  value={form.welcomeHeadline}
                  onChange={e => setForm(f => ({ ...f, welcomeHeadline: e.target.value }))}
                  placeholder={data?.storeName ?? "Check In"}
                  className="bg-slate-50 border-slate-200"
                  maxLength={60}
                />
                <p className="text-xs text-slate-400 mt-1">
                  Shown on the idle screen. Leave blank to use your store name.
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-600 block mb-1.5">
                  Welcome Sub-text
                </label>
                <Input
                  value={form.welcomeSubText}
                  onChange={e => setForm(f => ({ ...f, welcomeSubText: e.target.value }))}
                  placeholder="Your style journey starts here"
                  className="bg-slate-50 border-slate-200"
                  maxLength={80}
                />
                <p className="text-xs text-slate-400 mt-1">
                  Shown beneath the headline on the idle screen. Leave blank to use the default.
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-600 block mb-1.5">
                  Loyalty Promo Text
                </label>
                <Input
                  value={form.loyaltyPromoText}
                  onChange={e => setForm(f => ({ ...f, loyaltyPromoText: e.target.value }))}
                  placeholder="Earn points with every visit and redeem them for free services!"
                  className="bg-slate-50 border-slate-200"
                  maxLength={120}
                />
                <p className="text-xs text-slate-400 mt-1">
                  Shown in the left panel of the phone entry screen.
                </p>
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
