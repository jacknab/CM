import { useState } from "react";
import { FLOATING_CARD_CSS, cardFloatStyle, cardRiseDelay, useFloatingTilt } from "./floatingCards";
import { calcTipAmount, TIP_OPTIONS } from "./tipOptions";

/**
 * The cart screen's right panel when there's nothing to redeem: same look as RewardsPanel (branding card, a summary
 * card, floating glass cards below), but for picking a tip instead — reuses the "Add a Tip?" page's own options and
 * math (frontdesk/tipOptions.ts) so both screens always agree on what a tip means. Tapping an option applies it to
 * the ticket immediately (`kiosk_checkout_tip_selected`, the same event the full-screen tip page sends) — there's
 * no separate confirm step here, since the cart on the left already shows the tip land live.
 */

interface Props {
  storeName: string;
  /** The ticket's sale total (before tip) — what a percentage is calculated on. */
  saleTotal: number;
  /** The tip already applied to this ticket, if any (e.g. staff set one manually, or a card payment already collected one) — reflected in the "Total with tip" line even before a card here is tapped. */
  currentTipAmount: number;
  onSelectTip: (pct: number, amount: number) => void;
  /** The screen's accent colour, for text on the white buttons. */
  accentDark: string;
}

const money = (n: number) => `$${n.toFixed(2)}`;

export function TipPanel({ storeName, saleTotal, currentTipAmount, onSelectTip, accentDark }: Props) {
  const { stageRef, onPointerMove, onPointerLeave } = useFloatingTilt();
  // Which option THIS screen picked, so its card lights up — the POS may already have its own tip (currentTipAmount)
  // that doesn't match any of these five percentages (a custom amount staff typed in), so it isn't reverse-guessed here.
  const [pending, setPending] = useState<number | null>(null);
  const selectedAmount = pending != null ? calcTipAmount(saleTotal, pending) : currentTipAmount;
  const brand = storeName.trim() ? `Tip ${storeName.trim()}` : "Add a Tip";

  const choose = (pct: number) => {
    setPending(pct);
    onSelectTip(pct, calcTipAmount(saleTotal, pct));
  };

  return (
    <div className="fd-rw" ref={stageRef} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} onPointerUp={onPointerLeave} data-testid="fd-tip-panel">
      <style>{FLOATING_CARD_CSS}</style>
      <span className="fd-orb a" aria-hidden />
      <span className="fd-orb b" aria-hidden />
      <span className="fd-orb c" aria-hidden />

      <div className="fd-rw-col">
        {/* ── branded, like the rewards program card ── */}
        <div className="fd-rise" style={cardRiseDelay(0)}>
          <div className="fd-float" style={cardFloatStyle(0)}>
            <div className="fd-card" style={{ display: "flex", alignItems: "center", gap: 15 }} data-testid="fd-tip-brand">
              <span className="fd-badge" aria-hidden>💝</span>
              <div style={{ minWidth: 0, textAlign: "left" }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "#0b0b12" }}>Show your appreciation</p>
                <p style={{ margin: "2px 0 0", fontSize: 23, fontWeight: 900, lineHeight: 1.15, textShadow: "0 1px 0 rgba(255,255,255,.35)" }}>{brand}</p>
                <p style={{ margin: "6px 0 0", fontSize: 15, fontWeight: 600, lineHeight: 1.4, color: "#0b0b12" }} data-testid="fd-tip-sale-total">
                  Sale total <b style={{ fontWeight: 900, background: "rgba(255,255,255,.45)", borderRadius: 8, padding: "1px 8px" }}>{money(saleTotal)}</b>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── running total, like the points-balance card ── */}
        <div className="fd-rise" style={cardRiseDelay(1)}>
          <div className="fd-float" style={cardFloatStyle(1)}>
            <div className="fd-card" data-testid="fd-tip-summary">
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#0b0b12" }}>Total with tip</span>
                <span style={{ fontSize: 40, fontWeight: 900, lineHeight: 1, fontVariantNumeric: "tabular-nums", textShadow: "0 1px 0 rgba(255,255,255,.35)" }} data-testid="fd-tip-total">
                  {money(saleTotal + selectedAmount)}
                </span>
              </div>
              <p style={{ margin: "9px 0 0", fontSize: 13.5, fontWeight: 600, color: "#0b0b12" }}>
                {pending == null ? (currentTipAmount > 0 ? <>{money(currentTipAmount)} tip added — thank you!</> : "Choose an amount below")
                  : pending === 0 ? "No tip added" : <>{money(selectedAmount)} tip ({pending}%) added — thank you!</>}
              </p>
            </div>
          </div>
        </div>

        {/* ── the tip options: cards floating above the screen ── */}
        <div className="fd-rw-scroll">
          {TIP_OPTIONS.map((opt, i) => {
            const isThis = pending === opt.pct;
            const amount = calcTipAmount(saleTotal, opt.pct);
            return (
              <div key={opt.pct} className="fd-rise" style={cardRiseDelay(i + 2)}>
                <div className="fd-float" style={cardFloatStyle(i + 2)}>
                  <div className={`fd-card ${isThis ? "fd-ready" : ""}`} data-testid={`fd-tip-${opt.pct}`}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                        <p style={{ margin: 0, fontSize: 21, fontWeight: 900, lineHeight: 1.15, textShadow: "0 1px 0 rgba(255,255,255,.35)" }}>{opt.label}</p>
                        <p style={{ margin: "3px 0 0", fontSize: 14, fontWeight: 600, color: "#0b0b12" }}>{opt.pct > 0 ? `${money(amount)} on ${money(saleTotal)}` : "Just the sale total"}</p>
                      </div>
                      <button
                        type="button"
                        className={`fd-btn ${isThis ? "done" : "on"}`}
                        style={!isThis ? { color: accentDark } : undefined}
                        onPointerDown={(e) => { e.preventDefault(); if (!isThis) choose(opt.pct); }}
                        data-testid={`fd-tip-select-${opt.pct}`}
                      >
                        {isThis ? "Selected ✓" : "Select"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
