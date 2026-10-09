import { useState } from "react";
import { ArrowLeft, X } from "lucide-react";

export interface MoreTile {
  key: string;
  label: string;
  /** Second line, e.g. "Connected". */
  sub?: string;
  icon: React.ComponentType<{ size?: number }>;
  run: () => void;
  /** A switch (e.g. Lock Screen on / off): the popup stays open so the new state can be seen. */
  keepOpen?: boolean;
  /** Ask first — for anything that would throw away what's on screen. */
  confirm?: { title: string; body: string; action: string };
}

/** Everything the calendar's menu has that isn't a footer button. Big tiles, sized to tap on a 10" tablet. */
export function MoreMenu({ tiles, onClose, title = "More", onBack }: {
  tiles: MoreTile[]; onClose: () => void;
  /** The Manager tab uses the same popup with its own tiles: its name, and the way back to More. */
  title?: string; onBack?: () => void;
}) {
  const [askingTile, setAsking] = useState<MoreTile | null>(null);
  // A tile that disappears while its question is open (Hard Refresh when the connection drops) closes the question too.
  const asking = askingTile && tiles.some((t) => t.key === askingTile.key) ? askingTile : null;
  // 4 across for a normal set of tiles, 5 once there are many — the tiles share the popup's height, so nothing scrolls.
  const cols = tiles.length > 12 ? 5 : 4;
  const rows = Math.ceil(tiles.length / cols);

  return (
    <>
      <div className="assign-create-overlay" onClick={onClose} />
      <div className="more-menu" data-testid="nail-more-menu" data-view={title.toLowerCase()}>
        <div className="more-header">
          {onBack && !asking && <button type="button" className="more-close more-back" onClick={onBack} aria-label="Back to More" data-testid="nail-more-back"><ArrowLeft size={26} /></button>}
          <h2>{asking ? asking.confirm!.title : title}</h2>
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
                onClick={() => { if (t.confirm) setAsking(t); else if (t.keepOpen) t.run(); else { onClose(); t.run(); } }}>
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
