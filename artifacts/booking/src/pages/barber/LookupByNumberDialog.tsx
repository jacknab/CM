import { useState } from "react";
import { Delete, Hash, X } from "lucide-react";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

/**
 * The fallback for a busy salon (lots of techs, lots of clients checked in) when a check-in
 * slip's QR won't scan — staff types the "# 123" ticket number printed next to the client's name
 * instead of hunting through the board. Resolves through the exact same lookup the QR uses (see
 * NailHome.tsx's lookupByNumber / applyLookupResult), so it opens the identical screen a
 * successful scan would have.
 */
export function LookupByNumberDialog({ onLookup, onClose }: {
  onLookup: (ticketNumber: number) => Promise<boolean>;
  onClose: () => void;
}) {
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const press = (k: string) => {
    setError(null);
    if (k === "back") { setDigits((d) => d.slice(0, -1)); return; }
    if (digits.length >= 6) return;
    setDigits((d) => d + k);
  };

  const submit = async () => {
    const n = Number(digits);
    if (!digits || !Number.isFinite(n) || n <= 0) { setError("Enter the ticket number."); return; }
    setBusy(true);
    setError(null);
    const found = await onLookup(n);
    setBusy(false);
    if (!found) setError(`No ticket found with # ${digits}.`);
  };

  return (
    <>
      <div className="checkin-overlay" onClick={onClose} />
      <div className="checkin-modal-wrapper" onClick={onClose}>
        <div className="checkin-modal-card" onClick={(e) => e.stopPropagation()} data-testid="barber-lookup-by-number">
          <button type="button" className="checkin-modal-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
          <div style={{ padding: "28px 24px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <Hash size={28} style={{ marginBottom: 8, opacity: 0.7 }} />
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Look Up by Ticket Number</h2>
            <p style={{ fontSize: 13, opacity: 0.65, marginBottom: 20, textAlign: "center" }}>
              Enter the "#" number printed on the client's check-in slip.
            </p>
            <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: 4, minHeight: 52, fontVariantNumeric: "tabular-nums" }} data-testid="barber-lookup-display">
              {digits || <span style={{ opacity: 0.3 }}>——</span>}
            </div>
            {error && <p style={{ color: "#ef4444", fontSize: 13, marginTop: 8 }}>{error}</p>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 20, width: 260 }}>
              {KEYS.map((k, i) => k === "" ? <span key={i} /> : (
                <button
                  key={i}
                  type="button"
                  onClick={() => press(k)}
                  disabled={busy}
                  data-testid={k === "back" ? "barber-lookup-key-back" : `barber-lookup-key-${k}`}
                  style={{
                    height: 56, borderRadius: 10, border: "1px solid var(--border, #333)",
                    background: "var(--card, #1a1a1a)", fontSize: 22, fontWeight: 600,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {k === "back" ? <Delete size={22} /> : k}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={busy || !digits}
              data-testid="barber-lookup-submit"
              style={{
                marginTop: 20, width: 260, height: 52, borderRadius: 10, border: "none",
                background: busy || !digits ? "#3b3b3b" : "#2563eb", color: "#fff",
                fontSize: 16, fontWeight: 700,
              }}
            >
              {busy ? "Looking up…" : "Look Up"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
