/**
 * The shop's lobby screen for the Online Check-In Line (/q/:slug/display; plans/online-checkin-line.md): the current
 * wait, who is next (first name and last initial, HERE or ON THE WAY), who is in a chair, and the link to check in.
 * No phone numbers. Shops without the line keep the older display.
 */
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchLine, type PublicLine } from "./lineApi";
import "./line.css";

const OlderDisplay = lazy(() => import("@/pages/queue/QueueDisplay"));

export default function LineDisplay() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [line, setLine] = useState<PublicLine | null>(null);
  const [older, setOlder] = useState(false);
  const load = useCallback(async () => {
    try { setLine(await fetchLine(slug)); } catch (err: any) { if (err?.status === 404) setOlder(true); }
  }, [slug]);
  useEffect(() => {
    void load();
    const iv = setInterval(() => void load(), 15_000);
    return () => clearInterval(iv);
  }, [load]);

  if (older) return <Suspense fallback={null}><OlderDisplay /></Suspense>;
  if (!line) return <div className="ln-tv" />;
  const link = `${window.location.host}/q/${slug}`;
  return (
    <div className="ln-tv" data-testid="line-display">
      <section>
        <h1>{line.store.name}</h1>
        <div className="ln-tv-sub">Current wait</div>
        <div className="ln-tv-wait">{line.open && line.waitMin != null ? line.waitText : "—"}</div>
        <div className="ln-tv-sub">
          {line.ahead} waiting · {line.barbersWorking} {line.barbersWorking === 1 ? "barber" : "barbers"} in
        </div>
        {line.inChair.length > 0 && (
          <div style={{ marginTop: "2.5vw" }}>
            <div className="ln-tv-sub" style={{ marginBottom: ".8vw" }}>In the chair</div>
            <ol>{line.inChair.map((c, i) => <li key={i}>{c.name}<em>{c.barber}</em></li>)}</ol>
          </div>
        )}
        <div className="ln-tv-qr">{line.open ? <>Skip the wait: check in from your phone at <b>{link}</b></> : line.closedReason}</div>
      </section>
      <section>
        <div className="ln-tv-sub" style={{ marginBottom: ".8vw" }}>Up next</div>
        {line.line.length === 0 ? <div className="ln-tv-sub">Nobody waiting</div> : (
          <ol>
            {line.line.map((p, i) => (
              <li key={i}>
                <span>{p.ticketNumber != null ? `#${p.ticketNumber} ` : ""}{p.name}</span>
                {!p.here && <em>On the way</em>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
