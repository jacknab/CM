import { useCallback, useEffect, useState } from "react";
import { salonTimeZone } from "@/lib/salonClock";
import { sinceVisit } from "./sinceVisit";
import { formulaRows } from "./formulaView";
import {
  FormulaApiError, getCheckinFormula, getHairstyle, getHistory, getTicketFormula, type FormulaVersion, type HairstyleImage,
} from "./haircutFormulaApi";
import "./lastCut.css";

/**
 * Last Cut Formula panel (Phase 3) — READ-ONLY (owner, 2026-11-12): the client's previous haircut as the barber reads
 * it in the Queue and Ticket popups — hairstyle, sides guard, fade, top, neckline, sideburns, beard (when there is
 * one), barber notes, the date of the last haircut, and the style's approved reference images. No repeat, edit, save
 * or formula choice here: a haircut is recorded after the service, in Quick Notes.
 * Fills the height it is given (the right side of the popup); its body scrolls.
 *
 *   useLastCut()   loads it: a waiting check-in (for-checkin), or a client's history (newest visit first; this
 *                  ticket's own record is today's, not the previous one, so it is skipped).
 *   LastCutView    shows it (also used by tests and the screenshot harness).
 */

export type LastCutSource = { clientId: number | null; checkinId?: number | null; appointmentId?: number | null };
export type LastCutState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; clientId: number | null; latest: FormulaVersion | null; today: FormulaVersion | null; images: HairstyleImage[] };

const NOTHING = { status: "ready" as const, clientId: null, latest: null, today: null, images: [] };

export function useLastCut(src: LastCutSource) {
  const [state, setState] = useState<LastCutState>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    (async (): Promise<LastCutState> => {
      const clientId = Number(src.clientId) > 0 ? Number(src.clientId) : null;
      if (src.checkinId) {
        const r = await getCheckinFormula(src.checkinId); // the server sends the style's approved images with it
        return { status: "ready", clientId: r.clientId, latest: r.latest, today: null, images: r.images };
      }
      if (!clientId) {
        if (!src.appointmentId) return NOTHING;
        const r = await getTicketFormula(src.appointmentId); // a name-only walk-in's own record for this ticket (today's)
        return { ...NOTHING, today: r.latest };
      }
      const h = await getHistory(clientId, { limit: 10 });
      const mine = (v: FormulaVersion) => src.appointmentId != null && v.appointmentId === src.appointmentId;
      const latest = h.versions.find((v) => !mine(v)) ?? null;
      const images = latest?.templateId ? await getHairstyle(latest.templateId).then((d) => d.images, () => []) : [];
      return { status: "ready", clientId, latest, today: h.versions.find(mine) ?? null, images };
    })().then(
      (st) => { if (live) setState(st); },
      // Another store's (or a deleted) client answers 404: that is "nothing saved here", not an error.
      (e) => { if (live) setState(e instanceof FormulaApiError && e.status === 404 ? NOTHING : { status: "error", message: e?.message || "Could not load the last haircut." }); },
    );
    return () => { live = false; };
  }, [src.clientId, src.checkinId, src.appointmentId, nonce]);
  return { state, reload };
}

const fmtVisit = (iso: string) => new Date(iso).toLocaleString("en-US", { timeZone: salonTimeZone(), weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

export function FormulaRows({ version, testId }: { version: FormulaVersion; testId?: string }) {
  const rows = formulaRows(version.spec, { hairstyleName: version.hairstyleName, notes: version.notes });
  return (
    <div className="lcf-rows" data-testid={testId}>
      {rows.filter((r) => r.key !== "style").map((r) => (
        <div key={r.key} className="lcf-row" data-testid={`lcf-row-${r.key}`}>
          <span className="lcf-row-label">{r.label}</span>
          {r.text ? <p className="lcf-row-text">{r.text}</p> : <div className="lcf-pills">{r.tags.map((t) => <span key={t} className="lcf-pill">{t}</span>)}</div>}
        </div>
      ))}
    </div>
  );
}

const VIEW_NAME: Record<HairstyleImage["view"], string> = { front: "Front", left: "Left", right: "Right", back: "Back", detail: "Detail" };

export function LastCutView({ state, onViewReferences, onRetry }: {
  state: LastCutState;
  /** Opens the larger reference viewer (view only). */
  onViewReferences?: (v: FormulaVersion) => void;
  onRetry?: () => void;
}) {
  const shown = state.status === "ready" ? state.latest : null; // the previous haircut only, never today's record
  const style = shown ? shown.hairstyleName ?? shown.spec.style?.name ?? null : null;
  const images = state.status === "ready" ? state.images : [];
  return (
    <section className="lcf-panel" aria-label="Last Cut Formula" data-testid="lcf-panel">
      <header className="lcf-head"><p className="lcf-title">Last Cut Formula</p></header>
      <div className="lcf-body">
        {state.status === "loading" && <p className="lcf-muted" data-testid="lcf-loading">Loading the last haircut…</p>}
        {state.status === "error" && (
          <div className="lcf-empty" role="alert" data-testid="lcf-error">
            <p>{state.message}</p>
            {onRetry && <button type="button" className="lcf-btn" onClick={onRetry}>Try again</button>}
          </div>
        )}
        {state.status === "ready" && !shown && (
          <div className="lcf-empty" data-testid="lcf-empty"><p className="lcf-empty-title">No previous haircut formula.</p></div>
        )}
        {shown && (
          <>
            {style && <p className="lcf-style" data-testid="lcf-style">{style}</p>}
            <p className="lcf-meta" data-testid="lcf-meta">
              <span className="lcf-meta-label">Last haircut </span>{fmtVisit(shown.visitAt)}<span>{` · ${sinceVisit(new Date(shown.visitAt))}`}{shown.staffName ? ` · ${shown.staffName}` : ""}</span>
            </p>
            <FormulaRows version={shown} testId="lcf-latest" />
            {images.length > 0 && (
              <div className="lcf-refs-inline" data-testid="lcf-ref-strip">
                <p className="lcf-row-label">Hairstyle reference</p>
                <div className="lcf-ref-thumbs">
                  {images.map((i) => (
                    <button key={i.url} type="button" className="lcf-ref-thumb" onClick={() => onViewReferences?.(shown)} aria-label={`${VIEW_NAME[i.view]} view, larger`}>
                      <img src={i.url} alt={i.altText || `${style ?? "Hairstyle"}, ${VIEW_NAME[i.view].toLowerCase()} view (illustration)`} loading="lazy" />
                      <span>{VIEW_NAME[i.view]}</span>
                    </button>
                  ))}
                </div>
                <p className="lcf-ref-note" data-testid="lcf-ref-illustrative-inline">Illustrative reference of the style — not a photo of this client.</p>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/** The read-only panel with its own loading, for a client / check-in / ticket. */
export function LastCutPanel({ source, onViewReferences }: { source: LastCutSource; onViewReferences?: (v: FormulaVersion) => void }) {
  const { state, reload } = useLastCut(source);
  return <LastCutView state={state} onViewReferences={onViewReferences} onRetry={reload} />;
}
