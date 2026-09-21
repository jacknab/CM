import { useState } from "react";
import { X } from "lucide-react";

export interface MoreTile {
  key: string;
  label: string;
  /** Second line, e.g. "Connected". */
  sub?: string;
  icon: React.ComponentType<{ size?: number }>;
  run: () => void;
  /** Ask first — for anything that would throw away what's on screen. */
  confirm?: { title: string; body: string; action: string };
}

/** Everything the calendar's menu has that isn't a footer button. Big tiles, sized to tap on a 10" tablet. */
export function MoreMenu({ tiles, onClose }: { tiles: MoreTile[]; onClose: () => void }) {
  const [asking, setAsking] = useState<MoreTile | null>(null);
  // 4 across for a normal set of tiles, 5 once there are many — the tiles share the popup's height, so nothing scrolls.
  const cols = tiles.length > 12 ? 5 : 4;
  const rows = Math.ceil(tiles.length / cols);

  return (
    <>
      <div className="assign-create-overlay" onClick={onClose} />
      <div className="more-menu" data-testid="nail-more-menu">
        <div className="more-header">
          <h2>{asking ? asking.confirm!.title : "More"}</h2>
          <button type="button" className="more-close" onClick={onClose} aria-label="Close"><X size={26} /></button>
        </div>

        {asking ? (
          <div className="more-confirm" data-testid="nail-more-confirm">
            <p>{asking.confirm!.body}</p>
            <div className="more-confirm-actions">
              <button type="button" className="more-confirm-cancel" onClick={() => setAsking(null)}>Cancel</button>
              <button type="button" className="more-confirm-go" data-testid="nail-more-confirm-go" onClick={() => { const t = asking; onClose(); t.run(); }}>{asking.confirm!.action}</button>
            </div>
          </div>
        ) : (
          <div className="more-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
            {tiles.map((t) => (
              <button key={t.key} type="button" className="more-tile" data-testid={`nail-more-${t.key}`}
                onClick={() => { if (t.confirm) setAsking(t); else { onClose(); t.run(); } }}>
                <t.icon size={36} />
                <span>{t.label}</span>
                {t.sub && <small>{t.sub}</small>}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
