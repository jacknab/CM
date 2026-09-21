import { useState } from "react";

interface Reg { id: number; name: string }

/** One-time per device: which checkout station is this tablet? Keeps its /frontdesk traffic paired with it. */
export function RegisterPicker({ registers, taken, onSelect }: {
  registers: Reg[];
  taken: Reg[];
  onSelect: (id: number, opts?: { takeover?: boolean }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (id: number, takeover = false) => {
    setError(null);
    setBusy(id);
    const r = await onSelect(id, { takeover });
    setBusy(null);
    if (!r.ok) setError(r.error ?? "Couldn't select that station.");
  };

  return (
    <div className="drawer-picker" style={{ zIndex: 600 }} data-testid="nail-register-picker">
      <div>
        <h2>Which register is this?</h2>
        <p className="picker-hint">
          {registers.length > 0
            ? "This salon has multiple checkout stations. Pick which one this terminal is — you won't be asked again on this device."
            : "Every station is marked in use. If one of them is this tablet (for example after reinstalling the app), take it over below."}
        </p>
        {registers.map((r) => (
          <button key={r.id} type="button" disabled={busy !== null} onClick={() => pick(r.id)} data-testid={`nail-register-${r.id}`}>
            {busy === r.id ? "Selecting…" : r.name}
          </button>
        ))}
        {taken.map((r) => (
          <button key={r.id} type="button" className="picker-taken" disabled={busy !== null} data-testid={`nail-register-takeover-${r.id}`}
            onClick={() => {
              if (window.confirm(`${r.name} is marked in use on another device. Take it over only if that device is this tablet's old install or is retired — two tablets on the same station will cross-talk. Continue?`)) void pick(r.id, true);
            }}>
            {busy === r.id ? "Taking over…" : r.name}
            <small>In use on another device — tap to take over</small>
          </button>
        ))}
        {error && <p className="picker-error">{error}</p>}
      </div>
    </div>
  );
}
