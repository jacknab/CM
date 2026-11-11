/**
 * The shop's Online Check-In Line page (/q/:slug; plans/online-checkin-line.md, owner 2026-11-03): the live wait, then
 * "Join the line" with a name (and the rest of the party) and a mobile number. A shop that allows it lets the client
 * pick a barber, each with their own wait. Joining opens the client's own spot (/q/:slug/s/:token), which is also
 * texted to them. Shops without the line (anything but barbershops and haircut studios) keep the older page.
 */
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchLine, joinLine, prettyPhone, savedPerson, savePerson, savedSpot, saveSpot, type PublicLine } from "./lineApi";
import "./line.css";

const OlderQueuePage = lazy(() => import("@/pages/queue/PublicCheckIn"));
const digits = (s: string) => s.replace(/\D/g, "").slice(-10);

export default function LinePage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [line, setLine] = useState<PublicLine | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "older" | "missing" | "error">("loading");
  // Remember me (owner, 2026-11-11): the last check-in on this phone fills the form (name, family, mobile).
  const remembered = savedPerson();
  const [names, setNames] = useState<string[]>(remembered?.names.length ? remembered.names : [""]);
  const [phone, setPhone] = useState(remembered?.phone ?? "");
  const [remember, setRemember] = useState(true);
  const [barber, setBarber] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const mine = savedSpot(slug);

  const load = useCallback(async () => {
    try {
      setLine(await fetchLine(slug));
      setState("ready");
    } catch (err: any) {
      // Not a shop with the line: the older check-in page (it says so itself when the slug is unknown).
      setState((s) => (err?.status === 404 ? "older" : s === "ready" ? s : "error"));
    }
  }, [slug]);
  useEffect(() => {
    void load();
    const iv = setInterval(() => void load(), 20_000);
    return () => clearInterval(iv);
  }, [load]);
  useEffect(() => { if (line) document.title = `Check in · ${line.store.name}`; }, [line]);

  if (state === "older") return <Suspense fallback={null}><OlderQueuePage /></Suspense>;
  if (state === "loading") return <div className="ln"><div className="ln-center">Loading the line…</div></div>;
  if (state === "error" || !line) return <div className="ln"><div className="ln-center">We couldn't load this shop's line. Please try again.</div></div>;

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const people = names.map((n) => n.trim()).filter(Boolean);
    if (!people.length) { setError("Please enter your name."); return; }
    if (digits(phone).length !== 10) { setError("Please enter a 10-digit mobile number so we can text you."); return; }
    setSending(true);
    try {
      const r = await joinLine(slug, { names: people, phone, preferredStaffId: barber });
      saveSpot(slug, r.token);
      savePerson(remember ? { names: people, phone } : null);
      navigate(`/q/${encodeURIComponent(slug)}/s/${r.token}`);
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong. Please try again.");
      void load();
    } finally {
      setSending(false);
    }
  };

  const nobodyIn = line.open && line.waitMin == null;
  return (
    <div className="ln">
      <main className="ln-wrap">
        <header className="ln-head">
          <h1>{line.store.name}</h1>
          {line.store.address && <p>{line.store.address}</p>}
        </header>

        {mine && (
          <button type="button" className="ln-btn ln-btn-ghost" onClick={() => navigate(`/q/${encodeURIComponent(slug)}/s/${mine}`)} data-testid="line-my-spot">
            You're in line · see your spot
          </button>
        )}

        <section className="ln-card ln-wait" aria-live="polite">
          <small>Current wait</small>
          <strong data-testid="line-wait">{line.open ? (nobodyIn ? "—" : line.waitText) : "Closed"}</strong>
          <p>
            {line.ahead === 0 ? "Nobody waiting" : `${line.ahead} ${line.ahead === 1 ? "person" : "people"} waiting`}
            {line.barbersWorking > 0 && ` · ${line.barbersWorking} ${line.barbersWorking === 1 ? "barber" : "barbers"} in`}
          </p>
          {line.open && !nobodyIn && line.estimatedAt && <p className="ln-eta" data-testid="line-eta">Estimated check-in time {line.estimatedAt}</p>}
        </section>

        {!line.open && <div className="ln-note" data-testid="line-closed">{line.closedReason ?? "Online check-in is closed right now."}</div>}
        {nobodyIn && <div className="ln-note">No barbers are in yet. Please check back shortly.</div>}

        {line.open && !nobodyIn && (
          <form className="ln-card ln-form" onSubmit={join} data-testid="line-join-form">
            {names.map((n, i) => (
              <div className="ln-row" key={i}>
                <label>
                  {i === 0 ? "Your name" : `Person ${i + 1}`}
                  <input value={n} onChange={(e) => setNames((all) => all.map((x, j) => (j === i ? e.target.value : x)))}
                    autoComplete={i === 0 ? "name" : "off"} maxLength={60} required={i === 0} data-testid={`line-name-${i}`} />
                </label>
                {i > 0 && <button type="button" className="ln-x" aria-label={`Remove person ${i + 1}`} onClick={() => setNames((all) => all.filter((_, j) => j !== i))}>Remove</button>}
              </div>
            ))}
            {names.length < 4 && <button type="button" className="ln-link" onClick={() => setNames((all) => [...all, ""])}>+ Add someone with me</button>}
            <label>
              Mobile number
              <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="(555) 555-5555" data-testid="line-phone" />
            </label>
            {line.barberChoice && line.barbers.length > 0 && (
              <div className="ln-choice" role="group" aria-label="Barber">
                <button type="button" aria-pressed={barber == null} onClick={() => setBarber(null)}>Any barber <span>{line.waitText}</span></button>
                {line.barbers.map((b) => (
                  <button type="button" key={b.id} aria-pressed={barber === b.id} onClick={() => setBarber(b.id)}>{b.name} <span>{b.waitText}</span></button>
                ))}
              </div>
            )}
            <label className="ln-remember">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} data-testid="line-remember" />
              Remember me on this phone
            </label>
            {error && <p className="ln-error" role="alert">{error}</p>}
            <button type="submit" className="ln-btn" disabled={sending} data-testid="line-join">{sending ? "Joining…" : "Join the line"}</button>
            <p className="ln-fine">
              This holds your place in line; it isn't an appointment, and the wait is an estimate. We'll text you when it's time to head
              over. Message and data rates may apply; reply STOP to opt out.{line.acceptingUntil ? ` Online check-in today until ${line.acceptingUntil}.` : ""}
            </p>
          </form>
        )}
        {line.store.phone && <p className="ln-fine">Questions? Call <a href={`tel:${line.store.phone}`}>{prettyPhone(line.store.phone)}</a></p>}
      </main>
    </div>
  );
}
