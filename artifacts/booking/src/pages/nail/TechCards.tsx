import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Armchair, CalendarDays, Clock, Coffee, EyeOff, Hand, Hourglass, PersonStanding, Scissors, Ticket, User } from "lucide-react";
import { GAP, computeTechLayout } from "./techLayout";
import { DEFAULT_SERVICE_MIN, estimateWait, formatWait, type WaitTech } from "@shared/waitEstimate";
import type { BoardMarker, BoardTicket, SalonGlance, TechDayStats, TurnTech } from "./nailApi";

type Status = "in-service" | "available" | "break" | "off";


const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** What the front desk needs to know about each technician, right now. */
function statusOf(t: TurnTech, current: BoardTicket | undefined, assumedIn: boolean): Status {
  if (t.clockedIn === false && !assumedIn) return "off";
  if (t.paused || t.currentStatus === "on_break") return "break";
  if (current || t.currentStatus === "busy") return "in-service";
  return "available";
}

const TIMER_LABEL: Record<Exclude<Status, "off">, string> = { available: "FREE", "in-service": "IN CHAIR", break: "ON BREAK" };

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

const money = (n: number) => `$${n.toFixed(n % 1 === 0 ? 0 : 2)}`;

const GLANCE_ICON = { waiting: Clock, "avg-wait": Hourglass, "walk-ins": PersonStanding, appointments: CalendarDays, "no-shows": EyeOff, "avg-ticket": Ticket } as const;

/** "Salon at a glance" — today's numbers, right above the tech cards. */
function Glance({ waiting, waitLabel, glance }: { waiting: number; waitLabel: string; glance: SalonGlance | undefined }) {
  const tiles: { id: keyof typeof GLANCE_ICON; label: string; value: string; tone: string }[] = [
    { id: "waiting", label: "Client Waiting", value: String(waiting), tone: "blue" },
    { id: "avg-wait", label: "Average Wait Time", value: waitLabel, tone: "green" },
    { id: "walk-ins", label: "Walk-ins", value: glance ? String(glance.walkIns) : "—", tone: "purple" },
    { id: "appointments", label: "Appointments", value: glance ? String(glance.appointments) : "—", tone: "orange" },
    { id: "no-shows", label: "No-shows", value: glance ? String(glance.noShows) : "—", tone: "slate" },
    { id: "avg-ticket", label: "Average Ticket", value: glance?.avgTicket != null ? money(glance.avgTicket) : "—", tone: "mint" },
  ];
  return (
    <div className="tt-glance" data-testid="nail-glance">
      <div className="tt-glance-row">
        {tiles.map((t) => {
          const Icon = GLANCE_ICON[t.id];
          return (
            <div key={t.id} className={`tt-tile tt-tile-${t.tone}`} data-testid={`nail-glance-${t.id}`} data-long={t.value.length > 6 ? "true" : undefined}>
              <Icon size={20} strokeWidth={2} />
              <div><strong>{t.value}</strong><span>{t.label}</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A silhouette for techs without a photo. */
function Silhouette() {
  return (
    <svg viewBox="0 0 100 100" className="tt-silhouette" aria-hidden="true">
      <circle cx="50" cy="38" r="17" fill="#8d97ab" />
      <path d="M14 100c0-22 16-38 36-38s36 16 36 38z" fill="#8d97ab" />
    </svg>
  );
}

const PILL: Record<Status, string> = { "in-service": "IN SERVICE", available: "AVAILABLE", break: "ON BREAK", off: "NOT CLOCKED IN" };
const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n;

/** The tech cards live on three pages you swipe between (or pick from the tab strip): clocked out · clocked in and free · in service. */
const PAGES: { key: "out" | "in" | "service"; label: string; empty: string; match: (s: Status) => boolean }[] = [
  { key: "out", label: "Clocked Out", empty: "No technicians are clocked out", match: (s) => s === "off" },
  { key: "in", label: "Clocked In", empty: "No technicians are clocked in and free", match: (s) => s === "available" || s === "break" },
  { key: "service", label: "In Service", empty: "No technicians are in service", match: (s) => s === "in-service" },
];
/** The page shown whenever the Techs tab opens. */
const HOME_PAGE = 1;

export function TechCards({ techs, tickets, markers = [], stats, glance, waiting, loading, clockOffsetMs = 0, assumedIn = [], onClockedOutTap, onClockedInTap, onTicketTap }: {
  techs: TurnTech[]; tickets: BoardTicket[]; markers?: BoardMarker[]; stats: TechDayStats[]; glance: SalonGlance | undefined; waiting: number; loading: boolean; clockOffsetMs?: number;
  /** Techs just clocked in from this screen — shown as In & Available at once, before the server's answer comes back. */
  assumedIn?: number[];
  /** A clocked-out tech's card was tapped. */
  onClockedOutTap?: (tech: TurnTech) => void;
  /** A clocked-in (free or on break) tech's card was tapped — the front desk can clock them out. */
  onClockedInTap?: (tech: TurnTech) => void;
  /** An in-service tech's card was tapped — opens the ticket they are working on. */
  onTicketTap?: (ticket: BoardTicket) => void;
}) {
  const [tick, setTick] = useState(() => Date.now());
  const now = tick + clockOffsetMs; // server time, so every POS station shows the same numbers
  useEffect(() => {
    const iv = setInterval(() => setTick(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);

  // Cards follow the TURN order (first tech in / set available is #1); techs who aren't clocked in go last.
  const cards = useMemo(() => {
    const nextUpId = techs.find((t) => t.eligible)?.id ?? null;
    return techs
      .map((t) => {
        const mine = tickets.filter((x) => x.staff?.id === t.id);
        const current = mine.find((x) => x.status === "started");
        const queue = mine.filter((x) => x.status === "confirmed").sort((a, b) => +new Date(a.date) - +new Date(b.date));
        const st = stats.find((s) => s.staffId === t.id);
        const status = statusOf(t, current, assumedIn.includes(t.id));
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
  }, [techs, tickets, stats, assumedIn]);

  // Fit the cards to the space: few techs → big cards, many → smaller, no scrolling until it stops being readable.
  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // "Avg Wait": what a client checking in right now would wait. Worked out here, from the board + turn data this screen already has
  // (nothing is asked of the server, nothing runs on a timer beyond this screen letting the minutes tick down) — see shared/waitEstimate.ts.
  const waitLabel = useMemo(() => {
    const started = tickets.filter((t) => t.status === "started");
    const waitingTickets = tickets.filter((t) => t.status === "confirmed");
    const known = [...started, ...waitingTickets].map((t) => t.duration).filter((d) => d > 0);
    const defaultServiceMin = known.length ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : DEFAULT_SERVICE_MIN;
    const waitTechs: WaitTech[] = techs.map((t) => {
      const current = started.find((x) => x.staff?.id === t.id);
      const isIn = t.clockedIn !== false || assumedIn.includes(t.id);
      return {
        id: t.id,
        clockedIn: isIn,
        paused: !!t.paused || t.currentStatus === "on_break",
        busy: !!current || t.currentStatus === "busy",
        remainingMin: current ? (+new Date(current.startedAt ?? current.date) + current.duration * 60_000 - now) / 60_000 : null,
      };
    });
    const line = [
      ...waitingTickets.map((t) => ({ durationMin: t.duration, staffId: t.staff?.id ?? null, at: +new Date(t.checkedInAt ?? t.date) })),
      ...markers.map((m) => ({ durationMin: null, staffId: null, at: +new Date(m.createdAt) })),
    ].sort((a, b) => a.at - b.at); // first come, first served
    return formatWait(estimateWait({ techs: waitTechs, waiting: line, defaultServiceMin }));
  }, [techs, tickets, markers, assumedIn, now]);

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
    if (Math.abs(dx) > (box.w || 1) * 0.18 || (quick && Math.abs(dx) > 30)) {
      setPage((cur) => Math.min(PAGES.length - 1, Math.max(0, cur + (dx < 0 ? 1 : -1))));
    }
    setDragX(0);
  };
  const pageCards = PAGES.map((pg) => cards.filter((c) => pg.match(c.status)));

  // `lean` = the Clocked In page's slimmer card: name + timer only (no status badge, clients-today or service/next-up strip).
  const renderGrid = (list: typeof cards, empty: string, lean: boolean) => {
    const layout = computeTechLayout(list.length, box.w, box.h, lean);
    if (list.length === 0) return <div className="checkin-empty"><p>{empty}</p></div>;
    return (
        <div className={`tech-grid ${layout.compact ? "tt-compact" : ""} ${lean ? "tt-lean" : ""}`} data-scale={layout.scale.toFixed(2)} data-cols={layout.cols}
          style={{ gap: GAP, gridTemplateRows: `repeat(${layout.rows}, ${layout.cardH * layout.scale}px)`, gridTemplateColumns: `repeat(${layout.cols}, ${layout.cardW * layout.scale}px)` }}>
          {list.map((c) => {
            const { t, current, queue, status, nextUp, stats: st, since } = c;
            const i = cards.indexOf(c); // position in the whole turn order, the fallback for "#N in turn"
            const doneAt = current ? new Date(current.startedAt ?? current.date).getTime() + current.duration * 60_000 : null;
            const next = queue[0];
            const done = st?.doneToday ?? 0;
            const inLine = status !== "off" && status !== "break" && (t.turnPosition ?? i) < 900 ? (t.turnPosition ?? i) + 1 : null;
            const openTicket = status === "in-service" && current && onTicketTap ? () => onTicketTap(current) : null;
            const clockOut = (status === "available" || status === "break") && onClockedInTap ? () => onClockedInTap(t) : null;
            const tappable = (status === "off" && !!onClockedOutTap) || !!openTicket || !!clockOut;
            const BoxIcon = status === "in-service" ? Armchair : status === "break" ? Coffee : Clock;
            return (
              <div key={t.id} className="tech-slot" style={{ height: layout.cardH * layout.scale }}>
                <div className={`tt-card tt-${status} ${tappable ? "tt-tappable" : ""}`} data-testid={`nail-tech-card-${t.id}`} data-status={status}
                  role={tappable ? "button" : undefined}
                  onClick={openTicket ?? clockOut ?? (tappable ? () => onClockedOutTap?.(t) : undefined)}
                  style={{ width: layout.cardW, height: layout.cardH, transform: `scale(${layout.scale})` }}>
                  <div className="tt-top">
                    <span className="tt-avatar">{t.avatarUrl ? <img src={t.avatarUrl} alt="" /> : <Silhouette />}</span>
                    <div className="tt-main">
                      <div className="tt-namerow">
                        <div className="tt-name">
                          <strong>{t.name}</strong>
                          <span>
                            {inLine != null ? `#${inLine} in turn` : status === "break" ? "On a break" : "Not in the turn order"}
                          </span>
                        </div>
                        {!lean && <span className="tt-pill" data-status={status}><i />{status === "off" ? <><span className="tt-pill-full">{PILL[status]}</span><span className="tt-pill-short">OFF</span></> : PILL[status]}</span>}
                      </div>
                      <div className="tt-clockrow">
                        {status === "available" && nextUp && <em className="tt-nextup tt-nextup-side" data-testid={`nail-tech-next-${t.id}`}>NEXT</em>}
                        {status !== "off" ? (
                          <div className="tt-clockbox" data-status={status}>
                            <BoxIcon size={38} strokeWidth={1.8} />
                            <div>
                              <span className="tt-clocklabel">{TIMER_LABEL[status]}</span>
                              <LiveTimer since={since} offsetMs={clockOffsetMs} testId={`nail-tech-timer-${t.id}`} />
                            </div>
                          </div>
                        ) : (
                          <div className="tt-clockbox" data-status="off">
                            <Clock size={38} strokeWidth={1.8} />
                            <div>
                              <span className="tt-clocklabel">NOT CLOCKED IN</span>
                              <span className="tt-tapnote">Tap to set them in</span>
                            </div>
                          </div>
                        )}
                        {!lean && (
                        <div className="tt-clientstoday">
                          {status === "off" ? <span>—</span> : done === 0 ? <span>No clients yet today</span> : <><User size={22} /><span>{done === 1 ? "1 client today" : `${done} clients today`}</span></>}
                        </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {!lean && (
                  <div className="tt-bottom">
                    <div className="tt-cell">
                      {current ? <Scissors size={26} strokeWidth={1.8} /> : <Hand size={26} strokeWidth={1.8} />}
                      <div>
                        <small>Current Service{current ? ` · ${firstName(current.client.name)}` : ""}</small>
                        <b>{current ? `${current.service.name}${current.addons.length > 0 ? ` +${current.addons.length}` : ""}${doneAt != null ? ` - done - ${fmtTime(doneAt)}` : ""}` : "—"}</b>
                      </div>
                    </div>
                    <div className="tt-cell">
                      {status === "in-service" ? <Clock size={26} strokeWidth={1.8} /> : <User size={26} strokeWidth={1.8} />}
                      <div>
                        <small>{status === "in-service" ? "Time in Chair" : "Next Up"}</small>
                        <b>
                          {status === "in-service"
                            ? <LiveTimer since={since} offsetMs={clockOffsetMs} className="tt-timer-sm" />
                            : next ? `${next.client.name} · ${fmtTime(+new Date(next.date))}${queue.length > 1 ? ` (+${queue.length - 1})` : ""}` : "—"}
                        </b>
                      </div>
                    </div>
                  </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
    );
  };

  const emptyText = (k: number) => (k === HOME_PAGE && !loading && cards.length === 0 ? "No technicians yet. Add staff in Settings." : PAGES[k].empty);

  return (
    <section className="work-area" data-testid="nail-techs">
     <div className="tt-panel">
      <Glance waiting={waiting} waitLabel={waitLabel} glance={glance} />
      <div className="tt-tabs" role="tablist" data-testid="nail-techs-tabs">
        {PAGES.map((pg, k) => (
          <button key={pg.key} type="button" role="tab" aria-selected={page === k} className={page === k ? "active" : ""} onClick={() => setPage(k)} data-testid={`nail-techs-tab-${pg.key}`}>
            {pg.label}<em>{pageCards[k].length}</em>
          </button>
        ))}
      </div>
      <div className="tech-stage tt-pager" ref={stageRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}
        onClickCapture={(e) => { if (justSwiped.current) { e.stopPropagation(); e.preventDefault(); } }} data-testid="nail-techs-pager" data-page={PAGES[page].key}>
        <div className="tt-track" style={{ transform: `translateX(calc(${(-page * 100) / PAGES.length}% + ${dragX}px))`, transition: dragX === 0 ? "transform .28s ease" : "none" }}>
          {PAGES.map((pg, k) => (
            <div key={pg.key} className="tt-page" data-testid={`nail-techs-page-${pg.key}`} aria-hidden={page !== k}>{renderGrid(pageCards[k], emptyText(k), pg.key === "in")}</div>
          ))}
        </div>
      </div>
     </div>
    </section>
  );
}
