import { useState } from "react";
import { getStationDeviceId } from "@/lib/stationDevice";

// On the POS: pair the customer screen next to this tablet by typing the 4-digit code it shows.
// Pairing again replaces the old link (routes/stationPairing.ts). A screen that is already paired
// shows no code, so a screen on the wrong station is fixed from that station's POS: "Unpair" lets it
// go, it shows a code, and the POS it belongs to enters it.
export function PairCustomerScreen({ stationName, onDone }: { stationName: string | null; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paired, setPaired] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const digits = code.replace(/\D/g, "").slice(0, 4);

  const pair = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/frontdesk/pair", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: digits, deviceId: getStationDeviceId() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || "Couldn't pair the screen. Try again."); return; }
      setPaired(d.stationName ?? stationName ?? "this station");
      setTimeout(onDone, 1800);
    } catch {
      setError("Couldn't reach Certxa. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const unpair = async () => {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const r = await fetch("/api/frontdesk/unpair", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: getStationDeviceId() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || "Couldn't unpair the screen. Try again."); return; }
      setNote(d.unpaired
        ? "Unpaired. That screen now shows a code and can be paired with the POS it belongs to."
        : "No customer screen is paired with this station.");
    } catch {
      setError("Couldn't reach Certxa. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (paired) {
    return (
      <div className="space-y-1 text-center py-2">
        <p className="text-sm font-semibold text-emerald-700">Customer screen paired</p>
        <p className="text-xs text-slate-500">It now shows checkouts from {paired}.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-600">
        This tablet is <strong>{stationName ?? "a POS station"}</strong>. To pair its customer screen, enter the
        4-digit code showing on that screen.
      </p>
      <input
        value={digits}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && digits.length === 4 && !busy) pair(); }}
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        placeholder="0000"
        aria-label="Code on the customer screen"
        className="w-full text-center text-2xl tracking-[0.5em] font-semibold rounded-lg border-2 border-slate-200 px-3 py-2 focus:outline-none focus:border-slate-500"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      {note && <p className="text-xs text-slate-600">{note}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDone}
          className="flex-1 px-3 py-1.5 rounded-md border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={pair}
          disabled={busy || digits.length !== 4}
          data-testid="button-pair-customer-screen"
          className="flex-1 px-3 py-1.5 rounded-md bg-slate-800 text-white text-xs font-semibold hover:bg-slate-700 disabled:opacity-50"
        >
          {busy ? "Pairing…" : "Pair screen"}
        </button>
      </div>
      <button
        type="button"
        onClick={unpair}
        disabled={busy}
        data-testid="button-unpair-customer-screen"
        className="w-full text-xs font-semibold text-slate-500 hover:text-slate-700 underline disabled:opacity-50"
      >
        Unpair this station's current screen
      </button>
    </div>
  );
}

/** Full-screen version for the nail POS menu tile. */
export function PairCustomerScreenDialog({ open, stationName, onClose }: { open: boolean; stationName: string | null; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[650] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-slate-900">Pair a customer screen</h2>
        <PairCustomerScreen stationName={stationName} onDone={onClose} />
      </div>
    </div>
  );
}

/** Shown on a POS tablet when every station already belongs to another tablet. */
export function StationsFullBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[150] max-w-lg w-[calc(100%-1.5rem)] rounded-xl bg-amber-50 border border-amber-300 px-4 py-2.5 text-xs text-amber-900 shadow-lg">
      Every POS station already belongs to another tablet, so this one isn't linked to a customer screen.
      The owner can add a station or release an unused one in Settings → POS Stations.
    </div>
  );
}
