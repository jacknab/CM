import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// The salon's device code, on Settings → POS Stations. A tablet that opens the check-in kiosk or the
// customer screen in a web browser (not the Certxa app, which is signed in already) asks for it once
// on its "Set up this device" screen. See api-server routes/kioskDevice.ts.
export default function DeviceCodeCard() {
  const [copied, setCopied] = useState(false);
  const { data, isLoading, error } = useQuery<{ activationCode: string }>({
    queryKey: ["/api/registers/default-code"],
    queryFn: async () => {
      const r = await fetch("/api/registers/default-code", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load the device code");
      return r.json();
    },
    staleTime: 5 * 60_000,
  });

  const code = data?.activationCode ?? "";
  const shown = code.replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ");

  const copy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-800">Device code</h2>
      </div>
      <p className="text-sm text-slate-600">
        For a tablet that opens the check-in kiosk or the customer screen in a web browser instead of the
        Certxa app: enter this code on its "Set up this device" screen, once. Tablets running the Certxa app
        are signed in and don't need it.
      </p>
      {isLoading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : error || !code ? (
        <p className="text-sm text-red-600">Couldn't load the device code. Refresh the page to try again.</p>
      ) : (
        <div className="flex items-center gap-3">
          <code className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-lg font-mono tracking-wider text-slate-800">
            {shown}
          </code>
          <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={copy}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Keep it private: anyone with this code can set up a device for your salon.
      </p>
    </div>
  );
}
