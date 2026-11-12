import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { getHairstyle, type HairstyleDetails, type HairstyleImage } from "./haircutFormulaApi";
import { LcfPortal } from "./lcfSheet";
import "./lastCut.css";

/**
 * Hairstyle reference images (Phase 3): the style's approved pictures by view — Front, Left, Right, Back, Detail.
 * Only what the server returns (it sends approved images only). Every picture is marked as an illustrative reference
 * of the style, never a photo of this client. A view with no approved image is shown as not available yet.
 */
export const VIEWS: HairstyleImage["view"][] = ["front", "left", "right", "back", "detail"];
const VIEW_LABEL: Record<HairstyleImage["view"], string> = { front: "Front", left: "Left", right: "Right", back: "Back", detail: "Detail" };

export function ReferencesView({ style, error, view, onView, onClose }: {
  style: HairstyleDetails | null; error?: string | null; view: HairstyleImage["view"] | null;
  onView: (v: HairstyleImage["view"]) => void; onClose: () => void;
}) {
  const byView = (v: HairstyleImage["view"]) => style?.images.filter((i) => i.view === v) ?? [];
  const current = view ?? VIEWS.find((v) => byView(v).length > 0) ?? "front";
  const images = byView(current);
  return (
    <LcfPortal>
    <div className="lcf-sheet" role="dialog" aria-modal="true" aria-labelledby="lcf-refs-title" data-testid="lcf-references" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="lcf-sheet-card lcf-refs" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="lcf-close" onClick={onClose} aria-label="Close"><X size={28} /></button>
        <p className="lcf-eyebrow">Hairstyle reference</p>
        <h2 id="lcf-refs-title" className="lcf-sheet-title">{style?.name ?? "Loading…"}</h2>
        <p className="lcf-ref-note" data-testid="lcf-ref-illustrative">Illustrative reference of the style — not a photo of this client.</p>
        {error && <p className="lcf-error" role="alert">{error}</p>}
        {style && (
          <>
            <div className="lcf-views" role="tablist" aria-label="Views">
              {VIEWS.map((v) => {
                const has = byView(v).length > 0;
                return (
                  <button key={v} type="button" role="tab" aria-selected={current === v} disabled={!has} className={current === v ? "on" : ""}
                    onClick={() => onView(v)} data-testid={`lcf-view-${v}`}>{VIEW_LABEL[v]}{has ? "" : " · none yet"}</button>
                );
              })}
            </div>
            <div className="lcf-ref-images">
              {images.length > 0
                ? images.map((i) => (
                  <figure key={i.url} className="lcf-ref-figure">
                    <img src={i.url} alt={i.altText || `${style.name}, ${VIEW_LABEL[i.view].toLowerCase()} view (illustration)`} loading="lazy" />
                    <figcaption>{VIEW_LABEL[i.view]} · reference illustration</figcaption>
                  </figure>
                ))
                : <p className="lcf-muted" data-testid="lcf-ref-none">No approved reference images for this style yet.</p>}
            </div>
          </>
        )}
      </div>
    </div>
    </LcfPortal>
  );
}

export function HairstyleReferences({ templateId, onClose }: { templateId: number; onClose: () => void }) {
  const [style, setStyle] = useState<HairstyleDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<HairstyleImage["view"] | null>(null);
  useEffect(() => {
    let live = true;
    getHairstyle(templateId).then((s) => { if (live) setStyle(s); }, (e) => { if (live) setError(e?.status === 404 ? "This style is no longer in the library." : e?.message || "Could not load the references."); });
    return () => { live = false; };
  }, [templateId]);
  return <ReferencesView style={style} error={error} view={view} onView={setView} onClose={onClose} />;
}
