import { useState } from "react";
import { changeManagerPin } from "@/lib/managerPin";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
type Step = "current" | "new" | "repeat";
const PROMPT: Record<Step, string> = { current: "Current manager PIN", new: "New 4-digit PIN", repeat: "Type the new PIN again" };

/**
 * Change the salon's manager PIN: the current one, the new one, the new one again. The server checks the
 * current PIN and keeps only a hash of the new one (lib/managerPin.ts).
 */
export function ChangeManagerPinSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<Step>("current");
  const [digits, setDigits] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const press = async (key: string) => {
    if (saving || !key) return;
    if (key === "⌫") { setDigits((d) => d.slice(0, -1)); return; }
    const value = (digits + key).slice(0, 4);
    setError(null);
    if (value.length < 4) { setDigits(value); return; }
    setDigits("");
    if (step === "current") { setCurrent(value); setStep("new"); return; }
    if (step === "new") { setNext(value); setStep("repeat"); return; }
    if (value !== next) { setError("The two new PINs did not match. Type the new PIN again."); setNext(""); setStep("new"); return; }
    setSaving(true);
    try {
      await changeManagerPin(current, value);
      onDone();
    } catch (err: any) {
      setError(err?.message || "Could not change the PIN");
      setCurrent(""); setNext(""); setStep("current");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="assign-create-overlay" onClick={onClose} />
      <div className="assign-create-modal" role="dialog" aria-modal="true" aria-labelledby="nail-pin-title" data-testid="nail-manager-pin-change">
        <div className="assign-create-header">
          <h2 id="nail-pin-title">Manager PIN</h2>
          <button type="button" className="assign-create-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p style={{ margin: "0 22px", fontSize: 15, opacity: 0.85 }}>{saving ? "Saving…" : PROMPT[step]}</p>
        <p style={{ margin: "10px 22px", fontSize: 32, letterSpacing: "0.4em", minHeight: 40 }} aria-live="polite">{"•".repeat(digits.length)}</p>
        {error && <p className="assign-create-error" data-testid="nail-pin-error">{error}</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, padding: "10px 22px 22px" }}>
          {KEYS.map((k, i) => (
            <button key={i} type="button" disabled={!k || saving} onClick={() => void press(k)} className="assign-create-item"
              style={{ height: 60, justifyContent: "center", fontSize: 22, fontWeight: 600, visibility: k ? "visible" : "hidden" }}>{k}</button>
          ))}
        </div>
      </div>
    </>
  );
}
