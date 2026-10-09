import { useState } from "react";
import { saveKioskDeviceToken } from "@/lib/kioskDevice";

// Shown on the kiosk / customer screen when this browser isn't set up for the salon yet. For the
// owner or a team member, not for customers: one code, once per device.
export default function KioskPairing({ slug, storeName, onPaired }: {
  slug: string;
  storeName?: string | null;
  onPaired: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const digits = code.replace(/\D/g, "");

  const pair = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/public/kiosk/${slug}/pair`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: digits }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.token) {
        setError(d.error || "That code didn't work.");
        return;
      }
      saveKioskDeviceToken(slug, d.token);
      onPaired();
    } catch {
      setError("Couldn't reach Certxa. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-50 px-6" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-xl p-8 space-y-5">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">Set up this device</h1>
          <p className="text-sm text-slate-500">
            {storeName ? `${storeName}: ` : ""}enter the 12-digit device code. The salon owner can find it in Certxa
            under <span className="font-semibold text-slate-700">Settings → POS Stations → Device code</span>. This is done once per device.
          </p>
        </div>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && digits.length >= 6 && !busy) pair(); }}
          inputMode="numeric"
          autoComplete="off"
          placeholder="Device code"
          className="w-full text-center text-2xl tracking-widest font-semibold rounded-2xl border-2 border-slate-200 px-4 py-4 focus:outline-none focus:border-indigo-500"
        />
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
        <button
          type="button"
          onClick={pair}
          disabled={busy || digits.length < 6}
          className="w-full rounded-2xl py-4 text-lg font-bold text-white bg-indigo-600 disabled:bg-slate-300 transition"
        >
          {busy ? "Checking…" : "Set up"}
        </button>
        <p className="text-xs text-slate-400 text-center">
          Using the Certxa app on this tablet? Sign in there instead and no code is needed.
        </p>
      </div>
    </div>
  );
}
