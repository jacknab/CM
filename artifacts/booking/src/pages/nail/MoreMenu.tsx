import { X } from "lucide-react";

export interface MoreTile {
  key: string;
  label: string;
  /** Second line, e.g. "Connected". */
  sub?: string;
  icon: React.ComponentType<{ size?: number }>;
  run: () => void;
}

/** Everything the calendar's menu has that isn't a footer button. */
export function MoreMenu({ tiles, onClose }: { tiles: MoreTile[]; onClose: () => void }) {
  return (
    <>
      <div className="assign-create-overlay" onClick={onClose} />
      <div className="more-menu" data-testid="nail-more-menu">
        <div className="assign-create-header">
          <div>
            <h2>More</h2>
            <p>Everything else the front desk needs</p>
          </div>
          <button type="button" className="assign-create-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="more-grid">
          {tiles.map(({ key, label, sub, icon: Icon, run }) => (
            <button key={key} type="button" className="checkin-dock-btn more-tile" onClick={() => { onClose(); run(); }} data-testid={`nail-more-${key}`}>
              <Icon size={22} />
              <span>{label}</span>
              {sub && <small>{sub}</small>}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
