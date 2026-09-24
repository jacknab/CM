import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Armchair, CalendarDays, Clock, EyeOff, Hand, PersonStanding, Scissors, Ticket, User, UserCheck, UserPlus, Users, X } from "lucide-react";
import { GAP, computeTechLayout } from "./techLayout";
import { formatElapsed } from "./ticketDraft";
import { DEFAULT_SERVICE_MIN, estimateWait, formatWait, type WaitTech } from "@shared/waitEstimate";
import type { BoardMarker, BoardTicket, SalonGlance, TurnTech } from "./nailApi";
import { EMPTY_ARRAY } from "@/lib/empty";

const money = (n: number) => `$${n.toFixed(n % 1 === 0 ? 0 : 2)}`;

const NO_COLOR = "#454c56";
const firstName = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] || "Guest";
const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** A silhouette for techs without a photo — same shape as the Techs tab uses. */
function Silhouette() {
  return (
    <svg viewBox="0 0 100 100" className="tt-silhouette" aria-hidden="true">
      <circle cx="50" cy="38" r="17" fill="#8d97ab" />
      <path d="M14 100c0-22 16-38 36-38s36 16 36 38z" fill="#8d97ab" />
    </svg>
  );
}

/**
 * HH:MM:SS since a moment the SERVER recorded — identical to the Techs tab's timer, kept as its
 * own copy here (rather than a shared import) so this file has no dependency on TechCards.tsx.
 */
function LiveTimer({ since, offsetMs, testId }: { since: number | null; offsetMs: number; testId?: string }) {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    const tick = () => setNow(Date.now() + offsetMs);
    tick();
    const iv = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", tick); };
  }, [offsetMs]);
  if (since == null) return <span className="tt-timer tt-timer-unknown" data-testid={testId}>--:--:--</span>;
  const secs = Math.max(0, Math.floor((now - since) / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return <span className="tt-timer" data-testid={testId} data-seconds={secs}>{pad(Math.floor(secs / 3600))}:{pad(Math.floor((secs % 3600) / 60))}:{pad(secs % 60)}</span>;
}

type WaitRow = { key: string; since: string; name: string; sub: string; subKind: "walkin" | "assigned" | "unassigned"; service: string; open: () => void; testId: string; markerId?: number; remove?: () => void };

const GLANCE_ICON = { "avg-wait": Clock, "checked-in": Users, "in-service": Armchair, "clocked-in": UserCheck, "walk-ins": PersonStanding, appointments: CalendarDays, "no-shows": EyeOff, "avg-ticket": Ticket } as const;

/** The salon-at-a-glance strip across the top of the Queue tab — the front desk's whole day in eight numbers. */
function Glance({ waitLabel, checkedIn, inService, clockedInTechs, glance }: { waitLabel: string; checkedIn: number; inService: number; clockedInTechs: number; glance: SalonGlance | undefined }) {
  const tiles: { id: keyof typeof GLANCE_ICON; label: string; value: string; tone: string }[] = [
    { id: "avg-wait", label: "Avg Wait", value: waitLabel, tone: "green" },
    { id: "checked-in", label: "Checked In", value: String(checkedIn), tone: "blue" },
    { id: "in-service", label: "In Service", value: String(inService), tone: "indigo" },
    { id: "clocked-in", label: "Clocked In Techs", value: String(clockedInTechs), tone: "teal" },
    { id: "walk-ins", label: "Walk-ins", value: glance ? String(glance.walkIns) : "—", tone: "purple" },
    { id: "appointments", label: "Appointments", value: glance ? String(glance.appointments) : "—", tone: "orange" },
    { id: "no-shows", label: "No-shows", value: glance ? String(glance.noShows) : "—", tone: "slate" },
    { id: "avg-ticket", label: "Avg Ticket", value: glance?.avgTicket != null ? money(glance.avgTicket) : "—", tone: "mint" },
  ];
  return (
    <div className="tt-glance" data-testid="nail-queue-glance">
      <div className="q-glance-row">
        {tiles.map((t) => {
          const Icon = GLANCE_ICON[t.id];
          return (
            <div key={t.id} className={`tt-tile tt-tile-${t.tone}`} data-testid={`nail-queue-glance-${t.id}`} data-long={t.value.length > 6 ? "true" : undefined}>
              <Icon size={20} strokeWidth={2} />
              <div><strong>{t.value}</strong><span>{t.label}</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PAGES = [
  { key: "waiting", label: "Waiting" },
  { key: "service", label: "In Service" },
] as const;

/**
 * The Nail POS home tab: checked-in clients as a queue (waiting for a ticket / tech), plus — moved
 * here from the Techs tab — who is currently in the chair. Two pages, same swipe/tab pattern as the
 * Techs tab's card grid, so front desk sees one consistent design across both.
 *
 * This is the plain, honest queue view: cards are all the same style, ordered by check-in time.
 * The "spotlight" (auto-assign / skip-forward) logic discussed for this tab is a separate, later pass.
 */
export function QueueTab({ techs, tickets, markers, glance, clockOffsetMs = 0, assumedIn = EMPTY_ARRAY, onTicket, onMarker, onMarkerRemove, onTicketTap }: {
  techs: TurnTech[];
  tickets: BoardTicket[];
  markers: BoardMarker[];
  glance: SalonGlance | undefined;
  clockOffsetMs?: number;
  /** Techs just clocked in from the Techs tab this session — same optimistic list TechCards uses,
   *  so the stats tiles here don't lag a beat behind while the server catches up. */
  assumedIn?: number[];
  /** A checked-in client with a ticket: open it. */
  onTicket: (t: BoardTicket) => void;
  /** A walk-in with no ticket yet: start their ticket. */
  onMarker: (m: BoardMarker) => void;
  onMarkerRemove?: (m: BoardMarker) => void;
  /** An in-service tech's card was tapped — opens the ticket they are working on. */
  onTicketTap?: (ticket: BoardTicket) => void;
}) {
  const [tick, setTick] = useState(() => Date.now());
  const now = tick + clockOffsetMs;
  useEffect(() => {
    const iv = setInterval(() => setTick(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);

  // ── Waiting page: everyone checked in without a tech in the chair yet — kiosk walk-ins with no
  // ticket, plus tickets whose client is here but not started. Longest wait first.
  const waitRows = useMemo<WaitRow[]>(() => {
    const fromMarkers = markers.map<WaitRow>((m) => ({
      key: `m${m.id}`, since: m.createdAt, name: firstName(m.clientName), service: "Not started yet",
      sub: "WALK-IN", subKind: "walkin", open: () => onMarker(m), testId: `nail-queue-wait-marker-${m.id}`, markerId: m.id,
      remove: onMarkerRemove ? () => onMarkerRemove(m) : undefined,
    }));
    const fromTickets = tickets.filter((t) => t.status === "confirmed").map<WaitRow>((t) => {
      const since = t.checkedInAt ?? t.date;
      return {
        key: `t${t.id}`, since, name: firstName(t.client.name),
        service: `${t.service.name}${t.addons.length > 0 ? ` +${t.addons.length}` : ""}`,
        sub: t.staff ? `WITH ${firstName(t.staff.name).toUpperCase()}` : "UNASSIGNED",
        subKind: t.staff ? "assigned" : "unassigned",
        open: () => onTicket(t), testId: `nail-queue-wait-${t.id}`,
      };
    });
    return [...fromMarkers, ...fromTickets].sort((a, b) => +new Date(a.since) - +new Date(b.since));
  }, [tickets, markers, onMarker, onTicket]);

  // "Avg Wait" tile — same estimate the Techs tab shows, worked out from the board + turn data this
  // screen already has (see shared/waitEstimate.ts).
  const waitLabel = useMemo(() => {
    const started = tickets.filter((t) => t.status === "started");
    const waitingTickets = tickets.filter((t) => t.status === "confirmed");
    const known = [...started, ...waitingTickets].map((t) => t.duration).filter((d) => d > 0);
    const defaultServiceMin = known.length ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : DEFAULT_SERVICE_MIN;
    const waitTechs: WaitTech[] = techs.map((t) => {
      const current = started.find((x) => x.staff?.id === t.id);
      const isIn = t.clockedIn !== false || assumedIn.includes(t.id);
      return {
        id: t.id, clockedIn: isIn, paused: !!t.paused || t.currentStatus === "on_break",
        busy: !!current || t.currentStatus === "busy",
        remainingMin: current ? (+new Date(current.startedAt ?? current.date) + current.duration * 60_000 - now) / 60_000 : null,
        pausedForMin: t.paused && t.stateSince ? (now - +new Date(t.stateSince)) / 60_000 : null,
      };
    });
    const line = [
      ...waitingTickets.map((t) => ({ durationMin: t.duration, staffId: t.staff?.id ?? null, at: +new Date(t.checkedInAt ?? t.date) })),
      ...markers.map((m) => ({ durationMin: null, staffId: null, at: +new Date(m.createdAt) })),
    ].sort((a, b) => a.at - b.at);
    return formatWait(estimateWait({ techs: waitTechs, waiting: line, defaultServiceMin }));
  }, [techs, tickets, markers, assumedIn, now]);

  const clockedInTechCount = useMemo(
    () => techs.filter((t) => t.clockedIn !== false || assumedIn.includes(t.id)).length,
    [techs, assumedIn],
  );

  // ── "Create Next Ticket" — a shortcut for a busy front desk: instead of hunting through the
  // grid for whoever checked in earliest without a ticket yet, one tap highlights that card in
  // place. It is purely a visual focus — nothing about check-in order or who gets served next is
  // touched, so the highlighted card never moves and never loses its spot. Tapping the card still
  // starts their ticket like it always did; the front desk can also back out with no ticket created.
  const [spotlightMarkerId, setSpotlightMarkerId] = useState<number | null>(null);
  const nextMarker = useMemo(
    () => [...markers].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))[0] ?? null,
    [markers],
  );
  // If the spotlighted marker got its ticket created (or was removed) elsewhere, don't keep
  // highlighting a card that no longer exists.
  useEffect(() => {
    if (spotlightMarkerId != null && !markers.some((m) => m.id === spotlightMarkerId)) setSpotlightMarkerId(null);
  }, [markers, spotlightMarkerId]);

  // ── In Service page: moved from the Techs tab unchanged — same status/current-ticket logic, just
  // a different home. Cards follow the TURN order like they did there.
  const serviceCards = useMemo(() => {
    return techs
      .map((t) => {
        const current = tickets.find((x) => x.staff?.id === t.id && x.status === "started");
        return { t, current };
      })
      .filter((c) => !!c.current);
  }, [techs, tickets]);

  // ── pages + swipe (same pattern as the Techs tab's pager) ──────────────────────────────────
  const [page, setPage] = useState(0);
  const [dragX, setDragX] = useState(0);
  const gesture = useRef<{ x: number; y: number; id: number; horizontal: boolean; at: number } | null>(null);
  const justSwiped = useRef(false);
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
      e.currentTarget.setPointerCapture(e.pointerId);
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
    const quick = Math.abs(dx) / Math.max(1, Date.now() - g.at) > 0.5;
    if (Math.abs(dx) > (box.w || 1) * 0.18 || (quick && Math.abs(dx) > 30)) {
      setPage((cur) => Math.min(PAGES.length - 1, Math.max(0, cur + (dx < 0 ? 1 : -1))));
    }
    setDragX(0);
  };

  const renderWaiting = () => {
    const layout = computeTechLayout(waitRows.length, box.w, box.h, false);
    if (waitRows.length === 0) return <div className="checkin-empty"><p>No clients have checked in yet today</p></div>;
    return (
      <div className={`tech-grid ${layout.compact ? "tt-compact" : ""}`} style={{ gap: GAP, gridTemplateRows: `repeat(${layout.rows}, ${layout.cardH * layout.scale}px)`, gridTemplateColumns: `repeat(${layout.cols}, ${layout.cardW * layout.scale}px)` }}>
        {waitRows.map((r) => {
          const spotlighted = r.markerId != null && r.markerId === spotlightMarkerId;
          return (
            <div key={r.key} className="tech-slot" style={{ height: layout.cardH * layout.scale }}>
              <div className={`q-card ${spotlighted ? "q-card-spotlight" : ""} ${r.remove ? "q-card-has-remove" : ""}`} data-testid={r.testId} data-spotlight={spotlighted || undefined} role="button" onClick={r.open}
                style={{ width: layout.cardW, height: layout.cardH, transform: `scale(${layout.scale})` }}>
                {spotlighted && (
                  <button type="button" className="q-card-clear" aria-label={`Clear ${r.name} from the spotlight`} data-testid="nail-queue-spotlight-clear"
                    onClick={(e) => { e.stopPropagation(); setSpotlightMarkerId(null); }}>
                    <X size={16} />
                  </button>
                )}
                {r.remove && (
                  <button type="button" className="q-card-remove" aria-label={`Remove ${r.name} from the waiting list`} data-testid={`${r.testId}-remove`}
                    onClick={(e) => { e.stopPropagation(); if (window.confirm(`Take ${r.name} off the waiting list?`)) r.remove?.(); }}>
                    <X size={14} />
                  </button>
                )}
                <div className="q-top">
                  <span className="q-name">{r.name}</span>
                  <LiveTimer since={+new Date(r.since)} offsetMs={clockOffsetMs} />
                </div>
                <span className={`q-sub`} data-kind={r.subKind}>{r.sub}</span>
                <span className="q-service">{r.service}</span>
                <span className="q-since">Checked in {fmtTime(+new Date(r.since))}</span>
                {spotlighted && <span className="q-spotlight-tag">Tap to create their ticket</span>}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderService = () => {
    const layout = computeTechLayout(serviceCards.length, box.w, box.h, false);
    if (serviceCards.length === 0) return <div className="checkin-empty"><p>No technicians are in service</p></div>;
    return (
      <div className={`tech-grid ${layout.compact ? "tt-compact" : ""}`} style={{ gap: GAP, gridTemplateRows: `repeat(${layout.rows}, ${layout.cardH * layout.scale}px)`, gridTemplateColumns: `repeat(${layout.cols}, ${layout.cardW * layout.scale}px)` }}>
        {serviceCards.map(({ t, current }) => {
          const since = current ? +new Date(current.startedAt ?? current.date) : null;
          const doneAt = current && since != null ? since + current.duration * 60_000 : null;
          return (
            <div key={t.id} className="tech-slot" style={{ height: layout.cardH * layout.scale }}>
              <div className="tt-card tt-in-service tt-tappable" data-testid={`nail-queue-service-${t.id}`} role="button"
                onClick={() => current && onTicketTap?.(current)}
                style={{ width: layout.cardW, height: layout.cardH, transform: `scale(${layout.scale})` }}>
                <div className="tt-top">
                  <span className="tt-avatar">{t.avatarUrl ? <img src={t.avatarUrl} alt="" /> : <Silhouette />}</span>
                  <div className="tt-main">
                    <div className="tt-namerow">
                      <div className="tt-name"><strong>{t.name}</strong></div>
                      <span className="tt-pill" data-status="in-service"><i />IN SERVICE</span>
                    </div>
                    <div className="tt-clockrow">
                      <div className="tt-clockbox" data-status="in-service">
                        <Armchair size={38} strokeWidth={1.8} />
                        <div>
                          <span className="tt-clocklabel">IN CHAIR</span>
                          <LiveTimer since={since} offsetMs={clockOffsetMs} testId={`nail-queue-service-timer-${t.id}`} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="tt-bottom">
                  <div className="tt-cell">
                    {current ? <Scissors size={26} strokeWidth={1.8} /> : <Hand size={26} strokeWidth={1.8} />}
                    <div>
                      <small>Current Service{current ? ` · ${firstName(current.client.name)}` : ""}</small>
                      <b>{current ? `${current.service.name}${current.addons.length > 0 ? ` +${current.addons.length}` : ""}${doneAt != null ? ` - done - ${fmtTime(doneAt)}` : ""}` : "—"}</b>
                    </div>
                  </div>
                  <div className="tt-cell">
                    <User size={26} strokeWidth={1.8} />
                    <div><small>Ticket Total</small><b>{current ? `$${current.total.toFixed(2)}` : "—"}</b></div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const pageContent = [renderWaiting, renderService];

  return (
    <section className="work-area" data-testid="nail-queue">
      <div className="tt-panel">
        <Glance waitLabel={waitLabel} checkedIn={waitRows.length} inService={serviceCards.length} clockedInTechs={clockedInTechCount} glance={glance} />
        <div className="q-header">
          <div>
            <h1>Queue</h1>
            <p>{waitRows.length === 0 ? "No one is waiting right now." : `${waitRows.length} client${waitRows.length === 1 ? "" : "s"} waiting — tap one to open`}</p>
          </div>
          <button type="button" className="q-next-btn" data-testid="nail-queue-next-checkin" disabled={!nextMarker}
            onClick={() => { if (!nextMarker) return; setSpotlightMarkerId(nextMarker.id); setPage(0); setDragX(0); }}>
            <UserPlus size={18} /> Create Next Ticket
          </button>
        </div>
        <div className="tt-tabs" role="tablist" data-testid="nail-queue-tabs">
          {PAGES.map((pg, k) => (
            <button key={pg.key} type="button" role="tab" aria-selected={page === k} className={page === k ? "active" : ""} onClick={() => setPage(k)} data-testid={`nail-queue-tab-${pg.key}`}>
              {pg.label}<em>{k === 0 ? waitRows.length : serviceCards.length}</em>
            </button>
          ))}
        </div>
        <div className="tech-stage tt-pager" ref={stageRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}
          onClickCapture={(e) => { if (justSwiped.current) { e.stopPropagation(); e.preventDefault(); } }} data-testid="nail-queue-pager" data-page={PAGES[page].key}>
          <div className="tt-track" style={{ width: `${PAGES.length * 100}%`, transform: `translateX(calc(${(-page * 100) / PAGES.length}% + ${dragX}px))`, transition: dragX === 0 ? "transform .28s ease" : "none" }}>
            {PAGES.map((pg, k) => (
              <div key={pg.key} className="tt-page" style={{ width: `${100 / PAGES.length}%` }} data-testid={`nail-queue-page-${pg.key}`} aria-hidden={page !== k}>{pageContent[k]()}</div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
