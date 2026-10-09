import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Clock } from "lucide-react";
import { DEFAULT_SERVICE_MIN, estimateWait, formatWait, type WaitTech } from "@shared/waitEstimate";
import type { BoardMarker, BoardTicket, SalonGlance, TechDayStats, TurnTech } from "./nailApi";
import { Glance, type QueueView } from "./QueueTab";

type Status = "in-service" | "assigned" | "available" | "break" | "off";


const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * What the front desk needs to know about each technician, right now.
 *
 * `t.currentStatus === "busy"` alone is NOT enough to call a tech "in service": the server also
 * sets it for the Consideration Lock — a tech with a client checked in and waiting for them
 * (status "confirmed"), who hasn't actually started that service yet. Without a real `current`
 * ("started") ticket that showed up as a stuck, un-tappable "IN CHAIR" card with a running timer
 * and no assigned ticket to open — the tech had a waiting client, not one in the chair.
 */
function statusOf(t: TurnTech, current: BoardTicket | undefined, assumedIn: boolean, holding: boolean): Status {
  if (t.clockedIn === false && !assumedIn) return "off";
  // A real started ticket wins over a pause/break flag — pausing a tech from the Calendar's Turn
  // System (e.g. taking them out of the walk-in rotation) doesn't mean they've stopped serving
  // the client already in their chair. Checking `current` first keeps the card showing "IN CHAIR"
  // (and tapping it opens the ticket) instead of misreporting them as on break and offering to
  // clock them out mid-service.
  if (current) return "in-service";
  if (t.paused || t.currentStatus === "on_break") return "break";
  // A client has been given to them and is waiting for START: not free, but not in the chair either.
  if (holding) return "assigned";
  return "available";
}

const TIMER_LABEL: Record<Exclude<Status, "off">, string> = { available: "FREE", assigned: "CLIENT WAITING", "in-service": "IN CHAIR", break: "ON BREAK" };

/**
 * HH:MM:SS since a moment the SERVER recorded (so it is the same on every POS station and never restarts when a screen is
 * left and reopened). Ticks once a second on this device — no traffic — against the server's clock.
 */
function LiveTimer({ since, offsetMs, testId, className = "tt-timer" }: { since: number | null; offsetMs: number; testId?: string; className?: string }) {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    const tick = () => setNow(Date.now() + offsetMs);
    tick();
    const iv = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick); // a tablet that slept shows the right time the moment it wakes
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", tick); };
  }, [offsetMs]);
  if (since == null) return <span className={`${className} tt-timer-unknown`} data-testid={testId}>--:--:--</span>;
  const secs = Math.max(0, Math.floor((now - since) / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return <span className={className} data-testid={testId} data-seconds={secs}>{pad(Math.floor(secs / 3600))}:{pad(Math.floor((secs % 3600) / 60))}:{pad(secs % 60)}</span>;
}

const PILL: Record<Status, string> = { "in-service": "IN SERVICE", assigned: "ASSIGNED", available: "AVAILABLE", break: "ON BREAK", off: "NOT CLOCKED IN" };
const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n;

/** The tech cards live on two pages you swipe between (or pick from the tab strip): clocked out · clocked in and free.
 *  The third page this used to have — In Service — now lives on the Queue tab instead, alongside the checked-in queue. */
const PAGES: { key: "out" | "in"; label: string; empty: string; match: (s: Status) => boolean }[] = [
  { key: "out", label: "Clocked Out", empty: "No technicians are clocked out", match: (s) => s === "off" },
  { key: "in", label: "Clocked In", empty: "No technicians are clocked in and free", match: (s) => s === "available" || s === "assigned" || s === "break" },
];
/** The page shown whenever the Techs tab opens. */
const HOME_PAGE = 1;

export function TechCards({ techs, tickets, markers, glance, stats, loading, clockOffsetMs = 0, assumedIn = [], onClockedOutTap, onClockedInTap, onTicketTap, onQueueView }: {
  techs: TurnTech[]; tickets: BoardTicket[]; stats: TechDayStats[]; loading: boolean; clockOffsetMs?: number;
  markers: BoardMarker[];
  glance: SalonGlance | undefined;
  /** Techs just clocked in from this screen — shown as In & Available at once, before the server's answer comes back. */
  assumedIn?: number[];
  /** A clocked-out tech's card was tapped. */
  onClockedOutTap?: (tech: TurnTech) => void;
  /** A clocked-in (free or on break) tech's card was tapped — the front desk can clock them out. */
  onClockedInTap?: (tech: TurnTech) => void;
  /** A technician holding an assigned client that hasn't been started was tapped — opens that client's ticket. */
  onTicketTap?: (ticket: BoardTicket) => void;
  /** Open a metric's detail page on the Queue tab. */
  onQueueView: (view: QueueView) => void;
}) {
  const [metricTick, setMetricTick] = useState(() => Date.now());
  const metricNow = metricTick + clockOffsetMs;
  useEffect(() => {
    const iv = setInterval(() => setMetricTick(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);

  // Keep this strip numerically identical to Queue: both tabs use the same board records,
  // TURN availability, optimistic clock-ins, and shared wait estimator.
  const waitingTickets = useMemo(() => tickets.filter((t) => t.status === "confirmed"), [tickets]);
  const startedTickets = useMemo(() => tickets.filter((t) => t.status === "started"), [tickets]);
  const waitLabel = useMemo(() => {
    const known = [...startedTickets, ...waitingTickets].map((t) => t.duration).filter((d) => d > 0);
    const defaultServiceMin = known.length ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : DEFAULT_SERVICE_MIN;
    const waitTechs: WaitTech[] = techs.map((t) => {
      const current = startedTickets.find((x) => x.staff?.id === t.id);
      return {
        id: t.id,
        clockedIn: t.clockedIn !== false || assumedIn.includes(t.id),
        paused: !!t.paused || t.currentStatus === "on_break",
        busy: !!current || t.currentStatus === "busy",
        // Held for a waiting ticket that has not been started: that ticket is already in the line below with its
        // own length, so the technician must not also be counted as mid-way through an unknown service.
        remainingMin: current ? (+new Date(current.startedAt ?? current.date) + current.duration * 60_000 - metricNow) / 60_000
          : waitingTickets.some((x) => x.staff?.id === t.id) ? 0 : null,
        pausedForMin: t.paused && t.stateSince ? (metricNow - +new Date(t.stateSince)) / 60_000 : null,
      };
    });
    const line = [
      ...waitingTickets.map((t) => ({ durationMin: t.duration, staffId: t.staff?.id ?? null, at: +new Date(t.checkedInAt ?? t.date) })),
      ...markers.map((m) => ({ durationMin: null, staffId: null, at: +new Date(m.createdAt) })),
    ].sort((a, b) => a.at - b.at);
    return formatWait(estimateWait({ techs: waitTechs, waiting: line, defaultServiceMin }));
  }, [techs, startedTickets, waitingTickets, markers, assumedIn, metricNow]);
  const clockedInTechCount = useMemo(
    () => techs.filter((t) => t.clockedIn !== false || assumedIn.includes(t.id)).length,
    [techs, assumedIn],
  );

  // Cards follow the TURN order (first tech in / set available is #1); techs who aren't clocked in go last.
  const cards = useMemo(() => {
    const nextUpId = techs.find((t) => t.eligible)?.id ?? null;
    return techs
      .map((t) => {
        const mine = tickets.filter((x) => x.staff?.id === t.id);
        const current = mine.find((x) => x.status === "started");
        const queue = mine.filter((x) => x.status === "confirmed").sort((a, b) => +new Date(a.date) - +new Date(b.date));
        const st = stats.find((s) => s.staffId === t.id);
        // Held for a waiting ticket (or a front-desk check-in) that hasn't started. A ticket merely queued behind
        // nothing-in-particular does not count: the turn system must be holding them for it.
        const holding = t.currentStatus === "busy" && (queue.length > 0 || markers.some((m) => m.staffId === t.id));
        const status = statusOf(t, current, assumedIn.includes(t.id), holding);
        const stateSince = t.stateSince ? +new Date(t.stateSince) : null;
        // The server's stored time wins. Before it has one (first minute after a change, older data): the ticket's start,
        // else the day's clock-in / last checkout, else — for a tech we just set in on this screen — right now.
        const since =
          status === "in-service" ? (current ? +new Date(current.startedAt ?? current.date) : stateSince)
          : status === "off" ? null
          : stateSince ?? (status === "available" && (st?.lastFinishedAt || st?.clockedInAt)
              ? Math.max(st?.lastFinishedAt ? +new Date(st.lastFinishedAt) : 0, st?.clockedInAt ? +new Date(st.clockedInAt) : 0)
              : assumedIn.includes(t.id) ? Date.now() + clockOffsetMs : null);
        return { t, current, queue, status, nextUp: t.id === nextUpId, stats: st, since };
      })
      .sort((a, b) => Number(a.status === "off") - Number(b.status === "off"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [techs, tickets, markers, stats, assumedIn]);

  const stageRef = useRef<HTMLDivElement>(null);
  // ── pages + swipe ─────────────────────────────────────────────────────────
  const [page, setPage] = useState(HOME_PAGE);
  const [dragX, setDragX] = useState(0);
  const gesture = useRef<{ x: number; y: number; id: number; horizontal: boolean; at: number } | null>(null);
  const justSwiped = useRef(false);
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    gesture.current = { x: e.clientX, y: e.clientY, id: e.pointerId, horizontal: false, at: Date.now() };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.horizontal) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy)) return;
      g.horizontal = true;
      e.currentTarget.setPointerCapture(e.pointerId); // from here on the swipe belongs to the pager, not to the card under the finger
    }
    const pastEdge = (page === 0 && dx > 0) || (page === PAGES.length - 1 && dx < 0);
    setDragX(pastEdge ? dx / 3 : dx);
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || !g.horizontal) return;
    justSwiped.current = true;
    setTimeout(() => { justSwiped.current = false; }, 0);
    const dx = e.clientX - g.x;
    const quick = Math.abs(dx) / Math.max(1, Date.now() - g.at) > 0.5; // a fast flick counts even when it is short
    if (Math.abs(dx) > (stageRef.current?.clientWidth || 1) * 0.18 || (quick && Math.abs(dx) > 30)) {
      setPage((cur) => Math.min(PAGES.length - 1, Math.max(0, cur + (dx < 0 ? 1 : -1))));
    }
    setDragX(0);
  };
  const pageCards = PAGES.map((pg) => cards.filter((c) => pg.match(c.status)));

  // Technicians use In Service's fixed 4 × 4 card grid, not an expanding/scaled layout.
  const renderGrid = (list: typeof cards, empty: string) => {
    return (
        <div className="q-detail-ghost-grid q-tech-grid" data-testid="nail-tech-fixed-grid">
          {list.length === 0 && !loading && <p className="q-detail-message" role="status">{empty}</p>}
          {list.map((c) => {
            const { t, current, queue, status, nextUp, stats: st, since } = c;
            const i = cards.indexOf(c); // position in the whole turn order, the fallback for "#N in turn"
            const next = queue[0];
            const done = st?.doneToday ?? 0;
            const inLine = status !== "off" && status !== "break" && (t.turnPosition ?? i) < 900 ? (t.turnPosition ?? i) + 1 : null;
            const clockOut = (status === "available" || status === "break") && onClockedInTap ? () => onClockedInTap(t) : null;
            const openWaiting = status === "assigned" && next && onTicketTap ? () => onTicketTap(next) : null;
            const tappable = (status === "off" && !!onClockedOutTap) || !!clockOut || !!openWaiting;
            return (
                <div key={t.id} className={`q-booking-card q-unified-card q-tech-card ${tappable ? "tt-tappable" : ""}`} data-testid={`nail-tech-card-${t.id}`} data-status={status}
                  role={tappable ? "button" : undefined} tabIndex={tappable ? 0 : undefined}
                  onClick={openWaiting ?? clockOut ?? (tappable ? () => onClockedOutTap?.(t) : undefined)}
                  onKeyDown={tappable ? (event) => {
                    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
                    event.preventDefault();
                    (openWaiting ?? clockOut ?? (() => onClockedOutTap?.(t)))();
                  } : undefined}>
                  <div className="q-booking-client q-booking-client-top q-unified-head">
                    {t.avatarUrl && <img className="q-tech-avatar" src={t.avatarUrl} alt="" />}
                    <strong>{t.name}</strong>
                    {status === "available" && nextUp && <em className="q-tech-next" data-testid={`nail-tech-next-${t.id}`}>NEXT</em>}
                    <em className="q-unified-pill" data-kind={status}>{PILL[status]}</em>
                  </div>
                  <div className="q-unified-main">
                    <div className="q-unified-clock"><Clock size={25} strokeWidth={1.8} /><div>
                      <small>{status === "off" ? "NOT CLOCKED IN" : TIMER_LABEL[status]}</small>
                      {status === "off" ? <b>Tap to clock in</b> : <LiveTimer since={since} offsetMs={clockOffsetMs} testId={`nail-tech-timer-${t.id}`} />}
                    </div>
                    </div>
                    <div className="q-unified-side"><small>CLIENTS TODAY</small><b>{status === "off" ? "—" : done}</b></div>
                  </div>
                  <div className="q-unified-footer">
                    <div><small>Current Service</small><b>{current ? `${current.service.name} · ${firstName(current.client.name)}` : inLine != null ? `#${inLine} in turn` : "—"}</b></div>
                    <div><small>Next Up</small><b>{next ? `${next.client.name} · ${fmtTime(+new Date(next.date))}${queue.length > 1 ? ` (+${queue.length - 1})` : ""}` : "—"}</b></div>
                  </div>
                </div>
            );
          })}
          {Array.from({ length: Math.max(0, 16 - list.length) }, (_, i) => <div key={`ghost-${i}`} className="q-detail-ghost-card" aria-hidden="true" />)}
        </div>
    );
  };

  const emptyText = (k: number) => (k === HOME_PAGE && !loading && cards.length === 0 ? "No technicians yet. Add staff in Settings." : PAGES[k].empty);

  return (
    <section className="work-area" data-testid="nail-techs">
     <div className="tt-panel">
      <Glance
        waitLabel={waitLabel}
        checkedIn={waitingTickets.length + markers.length}
        inService={startedTickets.length}
        clockedInTechs={clockedInTechCount}
        glance={glance}
        onView={onQueueView}
        onTechs={() => setPage(HOME_PAGE)}
      />
      <div className="tt-tabs" role="tablist" data-testid="nail-techs-tabs">
        {PAGES.map((pg, k) => (
          <button key={pg.key} type="button" role="tab" aria-selected={page === k} className={page === k ? "active" : ""} onClick={() => setPage(k)} data-testid={`nail-techs-tab-${pg.key}`}>
            {pg.label}<em>{pageCards[k].length}</em>
          </button>
        ))}
      </div>
      <div className="tech-stage tt-pager" ref={stageRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}
        onClickCapture={(e) => { if (justSwiped.current) { e.stopPropagation(); e.preventDefault(); } }} data-testid="nail-techs-pager" data-page={PAGES[page].key}>
        <div className="tt-track" style={{ width: `${PAGES.length * 100}%`, transform: `translateX(calc(${(-page * 100) / PAGES.length}% + ${dragX}px))`, transition: dragX === 0 ? "transform .28s ease" : "none" }}>
          {PAGES.map((pg, k) => (
            <div key={pg.key} className="tt-page" style={{ width: `${100 / PAGES.length}%` }} data-testid={`nail-techs-page-${pg.key}`} aria-hidden={page !== k}>{renderGrid(pageCards[k], emptyText(k))}</div>
          ))}
        </div>
      </div>
     </div>
    </section>
  );
}
