/**
 * Manager → Turn Rotation: which turn method the salon runs, and its amounts — chosen from the POS, behind the
 * manager PIN (owner, 2026-10-17). The same settings as Settings → Turn System (pages/TurnSystem.tsx), which keeps
 * the rarer options (brackets, skipping rules, per-category lines); this sheet saves only what it shows.
 */
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { TURN_MODES, TURN_PRESETS, formatTurns, isDollarMode, normalizeTurnRules, turnUnits, type TurnMode } from "@shared/turnRules";
import { confirm } from "@/lib/confirm";

const PREVIEW = [15, 30, 45, 60, 75, 90];
/** The turn settings belong to the salon's owner account; a tablet signed in some other way can't change them. */
const OWNER_ONLY = "This tablet isn't signed in with the salon owner's account, so the turn settings can't be changed here.";
const PARTIALS = [0.25, 0.5, 0.75, 1];
const partialLabel = (v: number) => (v === 0.25 ? "¼" : v === 0.5 ? "½" : v === 0.75 ? "¾" : "1");

export function TurnRotationSheet({ storeId, onClose, onSaved }: { storeId: number; onClose: () => void; onSaved: () => void }) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState<Record<string, any> | null>(null);
  const [mode, setMode] = useState<TurnMode>("classic");
  const [dollars, setDollars] = useState("30");
  const [partial, setPartial] = useState(0.5);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/turn/settings?storeId=${storeId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status === 403 ? OWNER_ONLY : "Could not load the turn settings"))))
      .then((s) => {
        if (!alive) return;
        const rules = normalizeTurnRules(s);
        setSaved(s); setMode(rules.mode); setDollars(String(rules.dollarsPerTurn)); setPartial(rules.partialTurnValue);
      })
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [storeId]);

  const savedMode = saved ? normalizeTurnRules(saved).mode : mode;
  const dollarsNum = Number(dollars);
  // What each amount earns under the choices on screen — the same rules the checkout uses.
  const rules = useMemo(() => normalizeTurnRules({ ...(saved ?? {}), turnMode: mode, turnValueThreshold: dollarsNum, partialTurnValue: partial }),
    [saved, mode, dollarsNum, partial]);
  const showsDollars = mode === "classic" || mode === "dollar" || mode === "proportional";

  const save = async () => {
    if (!saved || saving) return;
    if (showsDollars && !(Number.isFinite(dollarsNum) && dollarsNum > 0 && dollarsNum <= 1000)) { setError("Enter the dollars per turn, for example 30."); return; }
    if (mode !== savedMode && !(await confirm(
      "Changing the turn method starts the line again from now. Everyone counts from zero. Turns earned so far today stay in the history but no longer decide who is next.",
      { title: "Change the turn method?", confirmLabel: "Change method" },
    ))) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/turn/settings?storeId=${storeId}`, {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        // The switches the save would otherwise reset go back as they are.
        body: JSON.stringify({
          turnEnabled: saved.turnEnabled !== false, autoAdvanceOnCheckout: saved.autoAdvanceOnCheckout !== false,
          appointmentExclusionWindowMinutes: saved.appointmentExclusionWindowMinutes,
          turnMode: mode, ...(showsDollars ? { turnValueThreshold: dollarsNum } : {}), ...(mode === "dollar" ? { partialTurnValue: partial } : {}),
        }),
      });
      if (!res.ok) throw new Error(res.status === 403 ? OWNER_ONLY : (await res.json().catch(() => ({}))).error || "Could not save the turn settings");
      void queryClient.invalidateQueries({ queryKey: ["/api/turn/settings", storeId] });
      void queryClient.invalidateQueries({ queryKey: ["/api/turn/eligibility", storeId] });
      onSaved();
    } catch (e: any) {
      setError(e?.message || "Could not save the turn settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="assign-create-overlay" onClick={onClose} />
      <div className="assign-create-modal" role="dialog" aria-modal="true" aria-labelledby="nail-turn-title" data-testid="nail-turn-rotation" style={{ maxHeight: "90vh", overflowY: "auto" }}>
        <div className="assign-create-header">
          <h2 id="nail-turn-title">Turn Rotation</h2>
          <button type="button" className="assign-create-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        {!saved && !error && <p className="assign-create-hint" style={{ margin: "0 22px 18px" }}>Loading…</p>}
        {saved && (
          <div style={{ padding: "0 22px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
            {TURN_MODES.map((m) => (
              <button key={m} type="button" className={`assign-create-item ${mode === m ? "assign-create-item-sel" : ""}`} onClick={() => setMode(m)}
                data-testid={`nail-turn-mode-${m}`} style={{ flexDirection: "column", alignItems: "flex-start", gap: 2, height: "auto", padding: "10px 14px" }}>
                <span className="assign-create-name">{TURN_PRESETS[m].label}{m === savedMode ? " · in use" : ""}</span>
                <span className="assign-create-status" style={{ whiteSpace: "normal", textAlign: "left" }}>{TURN_PRESETS[m].description}</span>
              </button>
            ))}

            {showsDollars && (
              <label className="assign-create-item" style={{ cursor: "default", justifyContent: "space-between" }}>
                <span className="assign-create-name">{mode === "classic" ? "Turn value ($)" : "Dollars per turn ($)"}</span>
                <input type="number" inputMode="decimal" min="1" step="1" value={dollars} onChange={(e) => setDollars(e.target.value)}
                  className="gift-input" style={{ width: 120, height: 44, fontSize: 18, textAlign: "right", letterSpacing: 0 }} data-testid="nail-turn-dollars" aria-label="Dollars per turn" />
              </label>
            )}
            {mode === "dollar" && (
              <div className="assign-create-item" style={{ cursor: "default", justifyContent: "space-between" }}>
                <span className="assign-create-name">Partial turn</span>
                <span style={{ display: "flex", gap: 6 }}>
                  {PARTIALS.map((v) => (
                    <button key={v} type="button" onClick={() => setPartial(v)} data-testid={`nail-turn-partial-${v}`}
                      className={`assign-create-btn ${partial === v ? "assign-create-btn-ready" : ""}`} style={{ minWidth: 52, height: 40, padding: "0 10px" }}>{partialLabel(v)}</button>
                  ))}
                </span>
              </div>
            )}

            {isDollarMode(mode) && (
              <div className="assign-create-hint" data-testid="nail-turn-preview">
                {PREVIEW.map((a) => `$${a} → ${formatTurns(turnUnits(rules, a))}`).join(" · ")}
              </div>
            )}

            {error && <p className="assign-create-error">{error}</p>}
            <button type="button" className="assign-create-btn assign-create-btn-ready" disabled={saving} onClick={() => void save()} data-testid="nail-turn-save">
              {saving ? "SAVING…" : "SAVE"}
            </button>
          </div>
        )}
        {!saved && error && <p className="assign-create-error" style={{ margin: "0 22px 18px" }}>{error}</p>}
      </div>
    </>
  );
}
