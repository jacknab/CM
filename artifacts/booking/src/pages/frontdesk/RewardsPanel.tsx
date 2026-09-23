import { FLOATING_CARD_CSS, cardFloatStyle, cardRiseDelay, useCountUp, useFloatingTilt } from "./floatingCards";

/**
 * The customer-facing rewards panel (right side of the /frontdesk cart screen): the salon's program branding with what the client earns per
 * $1, their points balance, and the rewards as glass cards that float above the screen (see floatingCards.tsx for the shared look/motion).
 */

export interface RewardOption { id: number; name: string; pointsCost: number; dollarValue: number }

interface Props {
  storeName: string;
  /** Points earned per $1 spent — null while unknown (the branding line is simply left out). */
  pointsPerDollar: number | null;
  points: number;
  rewards: RewardOption[];
  redeemedRewardId: number | null;
  onRedeem: (r: RewardOption) => void;
  /** The screen's accent colour, for text on the white buttons. */
  accentDark: string;
}

const fmtPts = (n: number) => n.toLocaleString();
const fmtRate = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

export function RewardsPanel({ storeName, pointsPerDollar, points, rewards, redeemedRewardId, onRedeem, accentDark }: Props) {
  const shown = useCountUp(points);
  const { stageRef, onPointerMove, onPointerLeave } = useFloatingTilt();

  const sorted = [...rewards].sort((a, b) => a.pointsCost - b.pointsCost);
  const next = sorted.find((r) => r.pointsCost > points);
  const brand = storeName.trim() ? `${storeName.trim()} Rewards` : "Rewards";

  return (
    <div className="fd-rw" ref={stageRef} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} onPointerUp={onPointerLeave} data-testid="fd-rewards-panel">
      <style>{FLOATING_CARD_CSS}</style>
      <span className="fd-orb a" aria-hidden />
      <span className="fd-orb b" aria-hidden />
      <span className="fd-orb c" aria-hidden />

      <div className="fd-rw-col">
        {/* ── the program, branded ── */}
        <div className="fd-rise" style={cardRiseDelay(0)}>
          <div className="fd-float" style={cardFloatStyle(0)}>
            <div className="fd-card" style={{ display: "flex", alignItems: "center", gap: 15 }} data-testid="fd-rewards-brand">
              <span className="fd-badge" aria-hidden>💎</span>
              <div style={{ minWidth: 0, textAlign: "left" }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "#0b0b12" }}>Rewards program</p>
                <p style={{ margin: "2px 0 0", fontSize: 23, fontWeight: 900, lineHeight: 1.15, textShadow: "0 1px 0 rgba(255,255,255,.35)" }}>{brand}</p>
                {pointsPerDollar != null && pointsPerDollar > 0 && (
                  <p style={{ margin: "6px 0 0", fontSize: 15, fontWeight: 600, lineHeight: 1.4, color: "#0b0b12", textWrap: "balance" as any }} data-testid="fd-rewards-earn">
                    Earn <b style={{ fontWeight: 900, color: "#0b0b12", background: "rgba(255,255,255,.45)", borderRadius: 8, padding: "1px 8px" }}>{fmtRate(pointsPerDollar)} {pointsPerDollar === 1 ? "point" : "points"}</b> for every <b style={{ fontWeight: 900 }}>$1</b> you spend
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── the client's balance ── */}
        <div className="fd-rise" style={cardRiseDelay(1)}>
          <div className="fd-float" style={cardFloatStyle(1)}>
            <div className="fd-card" data-testid="fd-rewards-balance">
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#0b0b12" }}>Your points</span>
                <span style={{ fontSize: 40, fontWeight: 900, lineHeight: 1, fontVariantNumeric: "tabular-nums", textShadow: "0 1px 0 rgba(255,255,255,.35)" }} data-testid="fd-rewards-points">{fmtPts(shown)}</span>
              </div>
              {sorted.length > 0 && (
                <p style={{ margin: "9px 0 0", fontSize: 13.5, fontWeight: 600, color: "#0b0b12" }}>
                  {next ? <>{fmtPts(next.pointsCost - points)} more points to unlock <b style={{ fontWeight: 900 }}>{next.name}</b></> : "You've unlocked every reward 🎉"}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── the rewards: cards floating above the screen ── */}
        <div className="fd-rw-scroll">
          {rewards.length === 0 && (
            <p style={{ fontSize: 14, color: "#0b0b12", textAlign: "center", margin: "10px 0" }}>No rewards available right now.</p>
          )}
          {sorted.map((rw, i) => {
            const isThis = redeemedRewardId === rw.id;
            const canRedeem = points >= rw.pointsCost && redeemedRewardId == null;
            const pct = Math.max(0, Math.min(100, (points / rw.pointsCost) * 100));
            return (
              <div key={rw.id} className="fd-rise" style={cardRiseDelay(i + 2)}>
                <div className="fd-float" style={cardFloatStyle(i + 2)}>
                  <div className={`fd-card ${canRedeem ? "fd-ready" : ""}`} data-testid={`fd-reward-${rw.id}`}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                        <p style={{ margin: 0, fontSize: 21, fontWeight: 900, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: "0 1px 0 rgba(255,255,255,.35)" }}>{rw.name}</p>
                        <p style={{ margin: "3px 0 0", fontSize: 14, fontWeight: 600, color: "#0b0b12" }}>{fmtPts(rw.pointsCost)} pts · ${rw.dollarValue.toFixed(2)} off</p>
                      </div>
                      <button
                        type="button"
                        className={`fd-btn ${isThis ? "done" : canRedeem ? "on" : "off"}`}
                        style={canRedeem && !isThis ? { color: accentDark } : undefined}
                        onPointerDown={(e) => { e.preventDefault(); if (canRedeem) onRedeem(rw); }}
                        disabled={!canRedeem}
                        data-testid={`fd-reward-redeem-${rw.id}`}
                      >
                        {isThis ? "Redeemed ✓" : "Redeem"}
                      </button>
                    </div>
                    {!isThis && !canRedeem && (
                      <div style={{ marginTop: 12 }}>
                        <div className="fd-bar" aria-hidden><i style={{ width: `${pct}%` }} /></div>
                        <p style={{ margin: "6px 0 0", fontSize: 12.5, fontWeight: 600, color: "#0b0b12" }}>{fmtPts(rw.pointsCost - points)} pts to go</p>
                      </div>
                    )}
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
