/**
 * A client's own spot in a shop's Online Check-In Line (/q/:slug/s/:token, texted to them when they join): their place,
 * their wait, "I'm here" and "Leave the line". Updates by itself every 15 seconds.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchSpot, imHere, leaveLine, prettyPhone, saveSpot, type Spot } from "./lineApi";
import "./line.css";

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export default function SpotPage() {
  const { slug = "", token = "" } = useParams<{ slug: string; token: string }>();
  const [spot, setSpot] = useState<Spot | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await fetchSpot(token);
      setSpot(s);
      // Finished with this spot: coming back to the shop's page offers a new check-in.
      if (!["waiting", "held", "up"].includes(s.status)) saveSpot(slug, null);
      else saveSpot(slug, token);
    } catch (err: any) {
      if (err?.status === 404) setMissing(true);
    }
  }, [token, slug]);
  useEffect(() => {
    void load();
    const iv = setInterval(() => void load(), 15_000);
    return () => clearInterval(iv);
  }, [load]);
  useEffect(() => { if (spot) document.title = `Your spot · ${spot.store.name}`; }, [spot]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); await load(); } catch (err: any) { setError(err?.message ?? "Something went wrong. Please try again."); } finally { setBusy(false); }
  };

  if (missing) return <div className="ln"><div className="ln-center">This spot wasn't found. <br /><Link to={`/q/${encodeURIComponent(slug)}`}>See the line</Link></div></div>;
  if (!spot) return <div className="ln"><div className="ln-center">Loading your spot…</div></div>;

  const open = spot.status === "waiting" || spot.status === "held" || spot.status === "up";
  const again = <Link className="ln-btn" style={{ textAlign: "center", textDecoration: "none" }} to={`/q/${encodeURIComponent(spot.store.slug)}`}>Check in again</Link>;
  return (
    <div className="ln">
      <main className="ln-wrap">
        <header className="ln-head">
          <h1>{spot.store.name}</h1>
          {spot.store.address && <p>{spot.store.address}</p>}
        </header>

        <section className="ln-card" aria-live="polite" data-testid="spot-card" data-status={spot.status}>
          <div className="ln-spot-num">{spot.name ? `${spot.name} · ` : ""}{spot.ticketNumber != null ? `Ticket #${spot.ticketNumber}` : "Your spot"}</div>
          {spot.status === "waiting" && (
            <>
              <div className="ln-big" data-testid="spot-wait">{spot.waitText ?? "—"}</div>
              <p className="ln-status">{spot.ahead === 0 ? "You're next" : `${spot.ahead} ${spot.ahead === 1 ? "person" : "people"} ahead of you`}</p>
              {spot.estimatedAt && <p className="ln-eta" data-testid="spot-eta">Estimated check-in time {spot.estimatedAt}</p>}
              {/* Progress toward the chair (owner, 2026-11-11): from the wait promised on joining down to their turn. */}
              {spot.promisedMin != null && spot.promisedMin > 0 && spot.waitMin != null && (() => {
                const done = Math.max(0.05, Math.min(1, 1 - spot.waitMin / spot.promisedMin));
                return (
                  <div data-testid="spot-progress">
                    <div className="ln-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(done * 100)} aria-label="Your progress in line">
                      <span style={{ width: `${Math.round(done * 100)}%` }} />
                    </div>
                    <div className="ln-progress-ends"><span>Checked in</span><span>Your turn</span></div>
                  </div>
                );
              })()}
              <p className="ln-fine" style={{ marginTop: 8 }}>{spot.here ? "You're checked in at the shop." : "We'll text you when it's time to head over."}</p>
            </>
          )}
          {spot.status === "held" && (
            <>
              <p className="ln-status" style={{ marginTop: 8 }}>It's your turn</p>
              <p className="ln-fine" style={{ marginTop: 6 }}>{spot.heldUntil ? `We're holding your spot until ${clock(spot.heldUntil)}.` : "We're holding your spot for a few minutes."} Tap "I'm here" when you arrive.</p>
            </>
          )}
          {spot.status === "up" && <p className="ln-status" style={{ marginTop: 8 }}>You're up{spot.barber ? ` with ${spot.barber}` : ""}. {spot.here ? "" : "Please come in now."}</p>}
          {spot.status === "served" && <p className="ln-status" style={{ marginTop: 8 }}>You're in the chair. Enjoy your cut!</p>}
          {spot.status === "removed" && (
            <p className="ln-status" style={{ marginTop: 8 }}>
              {spot.removedReason === "late" ? "We missed you, so you were taken off today's line." : spot.removedReason === "left" ? "You left the line." : "You're no longer in the line."}
            </p>
          )}
          {spot.status === "expired" && <p className="ln-status" style={{ marginTop: 8 }}>This check-in has ended.</p>}
        </section>

        {spot.party.length > 0 && (
          <section className="ln-card">
            <small className="ln-spot-num">With you</small>
            <ul className="ln-list">{spot.party.map((p, i) => <li key={i}>{p.name || "Guest"}<span>{p.ticketNumber != null ? `#${p.ticketNumber}` : ""}</span></li>)}</ul>
          </section>
        )}

        {error && <p className="ln-error" role="alert">{error}</p>}
        {open && !spot.here && (
          <button type="button" className="ln-btn" disabled={busy} onClick={() => void act(() => imHere(token))} data-testid="spot-here">I'm here</button>
        )}
        {open && spot.status !== "up" && (
          <button type="button" className="ln-btn ln-btn-ghost" disabled={busy}
            onClick={() => { if (window.confirm(spot.party.length ? "Leave the line? Everyone checked in with you leaves too." : "Leave the line?")) void act(() => leaveLine(token)); }}
            data-testid="spot-leave">Leave the line</button>
        )}
        {!open && again}
        {spot.store.phone && <p className="ln-fine">Running late or have a question? Call <a href={`tel:${spot.store.phone}`}>{prettyPhone(spot.store.phone)}</a></p>}
      </main>
    </div>
  );
}
