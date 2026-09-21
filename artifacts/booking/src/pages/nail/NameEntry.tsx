import { useEffect, useState } from "react";
import { ArrowUp, Delete } from "lucide-react";

const ROW1 = ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"];
const ROW2 = ["A", "S", "D", "F", "G", "H", "J", "K", "L"];
const ROW3 = ["Z", "X", "C", "V", "B", "N", "M"];

const fmtPhone = (d: string) => (d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d);

/**
 * The calendar's on-screen keyboard for a new client's name (same layout and behaviour as
 * ChooseClientPanel): capital first letter, shift drops after each letter and comes back after a
 * space, backspace, "@", space, return/Done. Buttons swallow pointerdown so the tablet's own
 * keyboard never pops up.
 */
export function NameEntry({ phone, name, onName, busy, onDone }: {
  phone: string;
  name: string;
  onName: (next: string) => void;
  busy: boolean;
  onDone: () => void;
}) {
  const [shift, setShift] = useState(name.trim() === "");
  useEffect(() => { (document.activeElement as HTMLElement | null)?.blur?.(); }, []);

  const key = (k: string) => {
    onName(name + (shift ? k.toUpperCase() : k.toLowerCase()));
    if (shift) setShift(false);
  };
  const noFocus = (e: React.PointerEvent) => e.preventDefault();
  const letter = (k: string) => (
    <button key={k} type="button" onPointerDown={noFocus} onClick={() => key(k)} data-testid={`kb-${k.toLowerCase()}`}>
      {shift ? k : k.toLowerCase()}
    </button>
  );

  return (
    <div className="name-entry" data-testid="nail-name-entry">
      <div className="name-entry-display">
        <strong data-testid="nail-name-display">{name || <em>Name</em>}</strong>
        <span>New client · {fmtPhone(phone)}</span>
      </div>
      <div className="osk">
        <div className="osk-row">{ROW1.map(letter)}</div>
        <div className="osk-row osk-indent">{ROW2.map(letter)}</div>
        <div className="osk-row">
          <button type="button" className={`osk-wide ${shift ? "osk-on" : ""}`} onPointerDown={noFocus} onClick={() => setShift((v) => !v)} data-testid="kb-shift" aria-label="Shift"><ArrowUp size={16} /></button>
          {ROW3.map(letter)}
          <button type="button" className="osk-wide" onPointerDown={noFocus} onClick={() => onName(name.slice(0, -1))} data-testid="kb-backspace" aria-label="Backspace"><Delete size={18} /></button>
        </div>
        <div className="osk-row">
          <button type="button" className="osk-side" onPointerDown={noFocus} onClick={() => key("@")} data-testid="kb-at">@</button>
          <button type="button" className="osk-space" onPointerDown={noFocus} onClick={() => { onName(name + " "); setShift(true); }} data-testid="kb-space">space</button>
          <button type="button" className="osk-side" onPointerDown={noFocus} onClick={onDone} data-testid="kb-return">return</button>
        </div>
      </div>
      <button type="button" className={`walkin-continue ${name.trim() && !busy ? "ready" : ""}`} disabled={!name.trim() || busy}
        onPointerDown={noFocus} onClick={onDone} data-testid="nail-walkin-save">
        {busy ? "SAVING…" : "DONE"}
      </button>
    </div>
  );
}

/** Saves the client exactly like the calendar does: POST /api/customers { name, phone (10 digits), storeId }. */
export async function createClient(storeId: number, name: string, phone: string): Promise<number> {
  const res = await fetch("/api/customers", {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name.trim(), phone, storeId }),
  });
  const c = await res.json().catch(() => null);
  if (!res.ok || !c?.id) throw new Error("save failed");
  return Number(c.id);
}
