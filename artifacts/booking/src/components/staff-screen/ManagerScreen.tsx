/**
 * The Manager screen of every staff-screen wrapper (/nail, /barber…; owner, 2026-11-02): full screen, opened once
 * with the manager PIN. Its tiles are staffMenus()'s Manager list. A tile that used to open a popup shows its page
 * here instead, under a header with Back (to the tiles) on the left — so a manager can do several things without
 * entering the PIN again. Close (on the tiles) goes back to the front desk.
 *
 * Pages that are popups elsewhere (the station list, the PIN change, turn rotation…) are shown as they are, inside
 * `.mgr-panel`; managerScreen.css lays them out as a page (no backdrop, no close button of their own).
 */
import type { ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";
import type { StaffMenuTile } from "./staffMenus";
import "./managerScreen.css";

export function ManagerScreen({ tiles, page, onBack, onClose, testIdPrefix = "staff" }: {
  tiles: StaffMenuTile[];
  /** The page open in the Manager screen (null: the tiles). */
  page: { title: string; content: ReactNode } | null;
  /** From a page back to the tiles. */
  onBack: () => void;
  /** Leave the Manager screen. */
  onClose: () => void;
  testIdPrefix?: string;
}) {
  const cols = tiles.length > 12 ? 5 : 4;
  return (
    <div className="mgr-screen" role="dialog" aria-modal="true" aria-labelledby="mgr-title" data-testid={`${testIdPrefix}-manager-screen`}>
      <header className="mgr-header">
        {page ? (
          <button type="button" className="mgr-head-btn" onClick={onBack} data-testid={`${testIdPrefix}-manager-back`}><ArrowLeft size={30} /><span>Back</span></button>
        ) : (
          <button type="button" className="mgr-head-btn" onClick={onClose} data-testid={`${testIdPrefix}-manager-close`}><X size={30} /><span>Close</span></button>
        )}
        <h2 id="mgr-title">{page ? page.title : "Manager"}</h2>
        <span className="mgr-head-spacer" aria-hidden />
      </header>
      {page ? (
        <div className="mgr-panel" data-testid={`${testIdPrefix}-manager-page`}>{page.content}</div>
      ) : (
        <div className="mgr-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {tiles.map((t) => (
            <button key={t.key} type="button" className="mgr-tile" onClick={t.run} data-testid={`${testIdPrefix}-manager-${t.key}`}>
              <t.icon size={40} />
              <span>{t.label}</span>
              {t.sub && <small>{t.sub}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
