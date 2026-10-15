import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Armchair, CalendarDays, Clock, EyeOff, PersonStanding, Ticket, UserCheck, Users, X } from "lucide-react";
import { DEFAULT_SERVICE_MIN, estimateWait, formatWait, type WaitTech } from "@shared/waitEstimate";
import type { BoardDayBooking, BoardMarker, BoardTicket, SalonGlance, TurnTech } from "./nailApi";
import { EMPTY_ARRAY } from "@/lib/empty";
import { bookingsForDetail, walkInState, type DetailKind } from "./boardView";

const money = (n: number) => `$${n.toFixed(n % 1 === 0 ? 0 : 2)}`;

const firstName = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] || "Guest";
/** The client's whole name as it's on file — every card shows the same thing, waiting or in the chair. */
const fullName = (n: string | null | undefined) => (n ?? "").trim().replace(/\s+/g, " ") || "Guest";
/** A time of day in the salon's time zone (not the device's), like the day shown next to it. */
const fmtTime = (ms: number, timeZone?: string) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone });

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

/** One client card: waiting (kiosk walk-in or a ticket not started yet) or in the chair. */
type ClientRow = {
  key: string; state: "waiting" | "service"; since: string; name: string; ticketNumber: number | null; sub: string;
  subKind: "walkin" | "assigned" | "unassigned" | "service"; /** null = no technician yet */ tech: string | null; /** "" = no service yet */ service: string; open: () => void;
  assign?: () => void; /** waiting with a technician: start the service */ start?: () => void; testId: string; markerId?: number; remove?: () => void;
  /** Made or changed on this tablet while offline and not confirmed by the server yet: its place and technician are not final. */
  provisional?: boolean;
};

const PER_PAGE = 16;

const GLANCE_ICON = { "avg-wait": Clock, "checked-in": Users, "in-service": Armchair, "clocked-in": UserCheck, "walk-ins": PersonStanding, appointments: CalendarDays, "no-shows": EyeOff, "avg-ticket": Ticket } as const;

/** The salon-at-a-glance strip across the top of the Queue tab — the front desk's whole day in eight
 *  numbers. "Waiting" and "In Service" both open the client cards (one page for both); the day tiles
 *  open their lists. */
export function Glance({ waitLabel, checkedIn, inService, clockedInTechs, glance, activeView, onView, onTechs }: {
  waitLabel: string; checkedIn: number; inService: number; clockedInTechs: number; glance: SalonGlance | undefined;
  activeView?: Page["kind"];
  onView?: (view: Page["kind"]) => void;
  onTechs?: () => void;
}) {
  const tiles: { id: keyof typeof GLANCE_ICON | "completed"; label: string; value: string; tone: string; view?: Page["kind"]; action?: () => void }[] = [
    { id: "avg-wait", label: "Avg Wait", value: waitLabel, tone: "green" },
    { id: "checked-in", label: "Waiting", value: String(checkedIn), tone: "blue", view: "waiting" },
    { id: "in-service", label: "In Service", value: String(inService), tone: "indigo", view: "service" },
    { id: "clocked-in", label: "Technicians", value: String(clockedInTechs), tone: "teal", action: onTechs },
    { id: "walk-ins", label: "Walk-ins", value: glance ? String(glance.walkIns) : "—", tone: "purple", view: "walk-ins" },
    { id: "appointments", label: "Appointments", value: glance ? String(glance.appointments) : "—", tone: "orange", view: "appointments" },
    { id: "no-shows", label: "No-shows", value: glance ? String(glance.noShows) : "—", tone: "slate", view: "no-shows" },
    { id: "completed", label: "Completed", value: glance ? String(glance.completed) : "—", tone: "blue", view: "completed" },
    { id: "avg-ticket", label: "Avg Ticket", value: glance?.avgTicket != null ? money(glance.avgTicket) : "—", tone: "mint" },
  ];
  return (
    <div className="tt-glance" data-testid="nail-queue-glance">
      <div className="q-glance-row">
        {tiles.map((t) => {
          const Icon = t.id === "completed" ? UserCheck : GLANCE_ICON[t.id];
          const clickable = (!!t.view && !!onView) || !!t.action;
          const Tag = clickable ? "button" : "div";
          return (
            <Tag
              key={t.id}
              type={clickable ? "button" : undefined}
              className={`tt-tile tt-tile-${t.tone}${clickable ? " tt-tile-clickable" : ""}`}
              data-testid={`nail-queue-glance-${t.id}`}
              data-long={t.value.length > 6 ? "true" : undefined}
              data-active={t.view ? (activeView === t.view || (t.view === "service" && activeView === "waiting") ? "true" : "false") : undefined}
              onClick={t.action ?? (t.view && onView ? () => onView(t.view!) : undefined)}
            >
              <Icon size={20} strokeWidth={2} />
              <div><strong>{t.value}</strong><span>{t.label}</span></div>
            </Tag>
          );
        })}
      </div>
    </div>
  );
}

export type QueueView = "waiting" | "service" | DetailKind;
type Page = { key: string; kind: QueueView; chunkIndex: number };
const DETAIL_TABS: { kind: DetailKind; label: string }[] = [
  { kind: "appointments", label: "Appointments" },
  { kind: "no-shows", label: "No Shows" },
  { kind: "walk-ins", label: "Walk-ins" },
  { kind: "completed", label: "Completed" },
];

/**
 * The Nail POS home tab: every client who is here — waiting or in the chair — as one set of cards in
 * ticket-number order, so assigning or starting a ticket never moves it to another tab. Same
 * swipe pattern as the Techs tab's card grid. TURN assigns tickets on its own (START is pressed by staff); the
 * lowest-numbered waiting client is marked UP NEXT.
 */
export function QueueTab({ techs, tickets, markers, dayBookings, upcoming, timezone, glance, appointmentsLoading = false, appointmentsError = false, clockOffsetMs = 0, assumedIn = EMPTY_ARRAY, initialView, onTicket, onAssignTicket, onStartTicket, onMarker, onMarkerRemove, onTicketTap, onTechs }: {
  techs: TurnTech[];
  tickets: BoardTicket[];
  markers: BoardMarker[];
  dayBookings: BoardDayBooking[];
  /** Booked visits still to come (today's not arrived yet, then the coming days') — the Appointments list.
   *  Until it has loaded (or with no connection) the list falls back to today's from the board. */
  upcoming?: BoardDayBooking[];
  /** The salon's time zone, for the day each upcoming visit is on. */
  timezone?: string;
  glance: SalonGlance | undefined;
  appointmentsLoading?: boolean;
  appointmentsError?: boolean;
  clockOffsetMs?: number;
  /** Techs just clocked in from the Techs tab this session — same optimistic list TechCards uses,
   *  so the stats tiles here don't lag a beat behind while the server catches up. */
  assumedIn?: number[];
  /** Metric selected on the Techs tab before returning to Queue. */
  initialView?: QueueView | null;
  /** A checked-in client with a ticket: open it. */
  onTicket: (t: BoardTicket) => void;
  /** An unassigned ticket in the spotlight: open technician assignment directly. */
  onAssignTicket: (t: BoardTicket) => void;
  /** A waiting ticket that has its technician: start the service. */
  onStartTicket?: (t: BoardTicket) => void;
  /** A walk-in with no ticket yet: start their ticket. */
  onMarker: (m: BoardMarker) => void;
  onMarkerRemove?: (m: BoardMarker) => void;
  /** An in-service tech's card was tapped — opens the ticket they are working on. */
  onTicketTap?: (ticket: BoardTicket) => void;
  /** The Technicians metric opens the dedicated clocked-in technicians tab. */
  onTechs: () => void;
}) {
  const activateOnKeyboard = (event: React.KeyboardEvent<HTMLElement>, action: () => void) => {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    action();
  };
  const [tick, setTick] = useState(() => Date.now());
  const now = tick + clockOffsetMs;
  useEffect(() => {
    const iv = setInterval(() => setTick(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);

  // ── Client cards: everyone who is here, on one set of pages — kiosk walk-ins with no ticket yet,
  // waiting tickets and tickets in the chair. They stay in TICKET NUMBER order (the # on the black
  // bar), so a card keeps its place when it's assigned or started instead of jumping to another tab.
  // Cards without a number yet go last, oldest first.
  const clientRows = useMemo<ClientRow[]>(() => {
    const fromMarkers = markers.map<ClientRow>((m) => ({
      // The marker already has the number printed with its check-in QR code, even though its
      // appointment/ticket record has not been created yet.
      // A front-desk check-in may already carry what the client came for (a category, not a service yet)
      // and the technician the turn system handed them to.
      key: `m${m.id}`, state: "waiting", since: m.createdAt, name: fullName(m.clientName), ticketNumber: m.ticketNumber, service: "",
      sub: m.requestedCategory ? m.requestedCategory.toUpperCase() : "WALK-IN",
      subKind: m.staffName ? "assigned" : "walkin", tech: m.staffName ?? null,
      open: () => onMarker(m), testId: `nail-queue-wait-marker-${m.id}`, markerId: m.id, provisional: m.offline === true,
      remove: onMarkerRemove ? () => onMarkerRemove(m) : undefined,
    }));
    const fromTickets = tickets.map<ClientRow>((t) => {
      const service = `${t.service.name}${t.addons.length > 0 ? ` +${t.addons.length}` : ""}`;
      if (t.status === "started") {
        return {
          key: `t${t.id}`, state: "service", since: t.startedAt ?? t.date, name: fullName(t.client.name), ticketNumber: t.ticketNumber ?? null,
          service, sub: "IN SERVICE", subKind: "service", tech: t.staff?.name ?? null,
          open: () => (onTicketTap ?? onTicket)(t), testId: `nail-queue-service-${t.id}`, provisional: t.offline === true,
        };
      }
      return {
        key: `t${t.id}`, state: "waiting", since: t.checkedInAt ?? t.date, name: fullName(t.client.name), ticketNumber: t.ticketNumber ?? null,
        service, sub: t.staff ? `WITH ${firstName(t.staff.name).toUpperCase()}` : "UNASSIGNED",
        subKind: t.staff ? "assigned" : "unassigned", tech: t.staff?.name ?? null,
        provisional: t.offline === true,
        open: () => onTicket(t), assign: t.staff ? undefined : () => onAssignTicket(t),
        start: t.staff && onStartTicket ? () => onStartTicket(t) : undefined, testId: `nail-queue-wait-${t.id}`,
      };
    });
    return [...fromMarkers, ...fromTickets].sort((a, b) => {
      if (a.ticketNumber != null && b.ticketNumber != null) return a.ticketNumber - b.ticketNumber;
      if (a.ticketNumber != null) return -1;
      if (b.ticketNumber != null) return 1;
      return +new Date(a.since) - +new Date(b.since);
    });
  }, [tickets, markers, onMarker, onMarkerRemove, onTicket, onTicketTap, onAssignTicket, onStartTicket]);
  const waitingCount = clientRows.filter((r) => r.state === "waiting").length;
  const inServiceCount = clientRows.length - waitingCount;
  // Up next = the lowest-numbered client still waiting, wherever their card sits.
  const upNextKey = clientRows.find((r) => r.state === "waiting")?.key ?? null;

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
        // Held for a waiting ticket that has not been started: that ticket is already in the line below with its
        // own length, so the technician must not also be counted as mid-way through an unknown service.
        remainingMin: current ? (+new Date(current.startedAt ?? current.date) + current.duration * 60_000 - now) / 60_000
          : waitingTickets.some((x) => x.staff?.id === t.id) ? 0 : null,
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

  // ── pages + swipe (same pattern as the Techs tab's pager) ──────────────────────────────────
  const [page, setPage] = useState(0);
  const [dragX, setDragX] = useState(0);
  const gesture = useRef<{ x: number; y: number; id: number; horizontal: boolean; at: number } | null>(null);
  const justSwiped = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);
  // A fixed 4 × 4 card grid; more clients than fit go on the next swipeable page.
  const clientChunks = useMemo<ClientRow[][]>(() => {
    const chunks: ClientRow[][] = [];
    for (let i = 0; i < clientRows.length; i += PER_PAGE) chunks.push(clientRows.slice(i, i + PER_PAGE));
    return chunks.length ? chunks : [[]];
  }, [clientRows]);
  const pages = useMemo<Page[]>(() => [
    ...clientChunks.map((_, i): Page => ({ key: `waiting-${i}`, kind: "waiting", chunkIndex: i })),
    ...DETAIL_TABS.map(({ kind }): Page => ({ key: kind, kind, chunkIndex: 0 })),
  ], [clientChunks]);
  // "Waiting" and "In Service" both live on the client pages now.
  const pageFor = (view: QueueView) => pages.findIndex((pg) => pg.kind === (view === "service" ? "waiting" : view));
  useEffect(() => {
    if (!initialView) return;
    const index = pageFor(initialView);
    if (index >= 0) setPage(index);
    // Only apply the navigation target when it changes; subsequent page-count changes must not
    // override a view the user selected from the Queue strip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialView]);
  // If the number of client pages shrinks (clients paid, fewer chunks needed) while looking at a
  // page that no longer exists, land on the last real page instead of a blank one.
  useEffect(() => {
    if (page > pages.length - 1) setPage(pages.length - 1);
  }, [pages.length, page]);

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
    const pastEdge = (page === 0 && dx > 0) || (page === clientChunks.length - 1 && dx < 0);
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
    if (Math.abs(dx) > (stageRef.current?.clientWidth || 1) * 0.18 || (quick && Math.abs(dx) > 30)) {
      setPage((cur) => Math.min(clientChunks.length - 1, Math.max(0, cur + (dx < 0 ? 1 : -1))));
    }
    setDragX(0);
  };

  // Same 16 fixed slots on every page, including silhouettes when there are fewer clients.
  const renderClients = (rows: ClientRow[]) => (
    <div className="q-detail-ghost-grid q-wait-grid" data-testid="nail-queue-wait-grid">
      {rows.map((r) => {
        const upNext = r.key === upNextKey;
        const inChair = r.state === "service";
        return (
          <div key={r.key} className={`q-booking-card q-unified-card q-wait-card ${upNext ? "q-up-next" : ""}`} data-testid={r.testId} data-state={r.state} role="button" tabIndex={0} aria-label={`Open ticket for ${r.name}`} onKeyDown={(event) => activateOnKeyboard(event, r.open)} onClick={r.open}>
            {r.remove && (
              <button type="button" className="q-card-remove" aria-label={`Remove ${r.name} from the waiting list`} data-testid={`${r.testId}-remove`}
                onClick={(e) => { e.stopPropagation(); if (window.confirm(`Take ${r.name} off the waiting list?`)) r.remove?.(); }}>
                <X size={14} />
              </button>
            )}
            <div className="q-booking-client q-booking-client-top q-unified-head">
              {r.provisional ? <span data-testid="nail-queue-not-sent">NOT SENT</span> : r.ticketNumber != null && <span>#{r.ticketNumber}</span>}
              <strong>{r.name}</strong>
              <em className="q-unified-pill" data-kind={r.subKind}>{upNext ? "UP NEXT" : r.sub}</em>
            </div>
            <div className="q-unified-main">
              <div className="q-unified-clock">
                <Clock size={25} strokeWidth={1.8} />
                <div><small>{inChair ? "IN CHAIR" : "WAITING"}</small><LiveTimer since={+new Date(r.since)} offsetMs={clockOffsetMs} testId={`${r.testId}-timer`} /></div>
              </div>
              {upNext ? (
                <div className="q-unified-side q-wait-actions">
                  <button type="button" onClick={(e) => { e.stopPropagation(); r.open(); }} data-testid="nail-queue-spotlight-action">{r.markerId != null ? "Create" : "Ticket"}</button>
                  {r.assign && <button type="button" onClick={(e) => { e.stopPropagation(); r.assign?.(); }} data-testid="nail-queue-spotlight-assign">Assign</button>}
                  {r.start && <button type="button" onClick={(e) => { e.stopPropagation(); r.start?.(); }} data-testid={`${r.testId}-start`}>Start</button>}
                </div>
              ) : r.start ? (
                <div className="q-unified-side q-wait-actions">
                  <button type="button" onClick={(e) => { e.stopPropagation(); r.start?.(); }} data-testid={`${r.testId}-start`}>Start</button>
                </div>
              ) : <div className="q-unified-side"><small>{inChair ? "STARTED" : "CHECKED IN"}</small><b>{fmtTime(+new Date(r.since), timezone || undefined)}</b></div>}
            </div>
            <div className="q-unified-footer">
              <div><small>Current Service</small>{r.service ? <b>{r.service}</b> : <b className="q-missing" aria-label="No service yet">___</b>}</div>
              <div><small>Technician</small>{r.tech ? <b>{r.tech}</b> : <b className="q-missing" aria-label="No technician yet">___</b>}</div>
            </div>
          </div>
        );
      })}
      {Array.from({ length: Math.max(0, PER_PAGE - rows.length) }, (_, i) => <div key={`ghost-${i}`} className="q-detail-ghost-card" aria-hidden="true" />)}
    </div>
  );

  // The day's appointment / no-show / walk-in / completed lists — 16 a screen, more on the next.
  const [detailPage, setDetailPage] = useState(0);
  // "TODAY", "TOMORROW", else "SAT, OCT 18" — in the salon's time zone.
  // The time each list is about: when a walk-in arrived, when a completed visit finished ("—" when that was
  // never recorded), otherwise the booked time.
  const detailTime = (booking: BoardDayBooking, kind: DetailKind) => {
    const iso = kind === "walk-ins" ? booking.arrivedAt ?? booking.date : kind === "completed" ? booking.completedAt : booking.date;
    return iso ? fmtTime(+new Date(iso), timezone || undefined) : "—";
  };
  const visitDay = (iso: string) => {
    const tz = timezone || undefined;
    const key = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: tz });
    const day = key(+new Date(iso));
    if (day === key(now)) return "TODAY";
    if (day === key(now + 86_400_000)) return "TOMORROW";
    return new Date(iso).toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).toUpperCase();
  };
  const renderDetailGhosts = (kind: DetailKind) => {
    const detail = DETAIL_TABS.find((tab) => tab.kind === kind)!;
    const count = kind === "appointments" ? (upcoming ? upcoming.length : glance?.appointments)
      : kind === "no-shows" ? glance?.noShows
      : kind === "walk-ins" ? glance?.walkIns
      : glance?.completed;
    // No-shows are real appointments that were missed, not an empty-state metric. Keep accepting
    // the legacy hyphenated status as well so older records remain visible on the board.
    const all = kind === "appointments" && upcoming ? upcoming : bookingsForDetail(dayBookings, kind);
    const screens = Math.max(1, Math.ceil(all.length / PER_PAGE));
    const current = Math.min(detailPage, screens - 1);
    const bookings = all.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE);
    const ghostCount = Math.max(0, PER_PAGE - bookings.length);
    return (
      <div className="q-detail-view" data-testid={`nail-queue-detail-${kind}`}>
        <div className="q-detail-tab" data-active="true">
          <span>{detail.label}</span><em>{count ?? 0}</em>
        </div>
        {screens > 1 && (
          <div className="q-page-dots" data-testid={`nail-queue-detail-dots-${kind}`}>
            {Array.from({ length: screens }, (_, i) => (
              <button key={i} type="button" className={i === current ? "active" : ""} aria-label={`${detail.label}, screen ${i + 1} of ${screens}`}
                data-testid={`nail-queue-detail-dot-${i}`} onClick={() => setDetailPage(i)} />
            ))}
          </div>
        )}
        <div className="q-detail-ghost-grid">
          {kind === "appointments" && all.length === 0 && (appointmentsLoading || appointmentsError || (count ?? 0) > 0) && (
            <p className="q-detail-message" role="status">{appointmentsError ? "Appointments could not be loaded. Please refresh the page." : appointmentsLoading ? "Loading appointments…" : "Appointment details are unavailable. Please refresh the page."}</p>
          )}
          {bookings.map((booking) => (
            <div key={booking.id} className="q-booking-card q-unified-card" data-testid={`nail-appointment-${booking.id}`}>
              <div className="q-booking-client q-booking-client-top q-unified-head">
                {booking.ticketNumber != null && <span>#{booking.ticketNumber}</span>}
                <strong>{booking.clientName}</strong>
                <em className="q-unified-pill" data-kind={kind}>{kind === "walk-ins" ? walkInState(booking.status) : detail.label}</em>
              </div>
              <div className="q-unified-main">
                <div className="q-unified-clock"><Clock size={25} strokeWidth={1.8} /><div><small>{kind === "completed" ? "COMPLETED" : kind === "no-shows" ? "MISSED" : kind === "appointments" ? visitDay(booking.date) : kind === "walk-ins" ? "WALKED IN" : "APPOINTMENT"}</small><b>{detailTime(booking, kind)}</b></div></div>
                <div className="q-unified-side"><small>DURATION</small><b>{booking.duration > 0 ? `${booking.duration} min` : "—"}</b></div>
              </div>
              <div className="q-unified-footer">
                <div><small>Current Service</small><b>{booking.serviceName || "Not selected"}</b></div>
                <div><small>Technician</small><b>{booking.staffName || (kind === "walk-ins" ? "Walk-in" : "Unassigned")}</b></div>
              </div>
            </div>
          ))}
          {Array.from({ length: ghostCount }, (_, i) => <div key={`ghost-${i}`} className="q-detail-ghost-card" aria-hidden="true" />)}
        </div>
      </div>
    );
  };

  const activeKind = pages[page]?.kind ?? "waiting";
  const onDetailPage = activeKind !== "waiting";
  const clientPageNum = onDetailPage ? 0 : pages[page].chunkIndex;
  const openView = (kind: QueueView) => {
    const index = pageFor(kind);
    if (index >= 0) { setPage(index); setDetailPage(0); }
  };

  return (
    <section className="work-area" data-testid="nail-queue">
      <div className="tt-panel">
        <Glance
          waitLabel={waitLabel} checkedIn={waitingCount} inService={inServiceCount} clockedInTechs={clockedInTechCount} glance={glance}
          activeView={activeKind} onView={openView} onTechs={onTechs}
        />
        <div className={`q-body q-body-detail${!onDetailPage ? " q-body-waiting" : ""}`}>
          {!onDetailPage && (
          <div className="q-rest q-wait-rest">
            {clientChunks.length > 1 && (
              // More clients than fit on one screen — swipe left for the next ones; the dots are the
              // "there's more" signal and are tappable too for anyone who'd rather not swipe.
              <div className="q-page-dots" data-testid="nail-queue-wait-dots">
                {clientChunks.map((_, i) => (
                  <button key={i} type="button" className={i === clientPageNum ? "active" : ""} aria-label={`Clients, screen ${i + 1} of ${clientChunks.length}`}
                    data-testid={`nail-queue-wait-dot-${i}`} onClick={() => setPage(i)} />
                ))}
                {clientPageNum < clientChunks.length - 1 && <span className="q-page-dots-hint">More clients — swipe left</span>}
              </div>
            )}
            <div className="tech-stage tt-pager" ref={stageRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}
              onClickCapture={(e) => { if (justSwiped.current) { e.stopPropagation(); e.preventDefault(); } }} data-testid="nail-queue-pager" data-page={pages[page]?.key}>
              <div className="tt-track" style={{ width: `${clientChunks.length * 100}%`, transform: `translateX(calc(${(-clientPageNum * 100) / clientChunks.length}% + ${dragX}px))`, transition: dragX === 0 ? "transform .28s ease" : "none" }}>
                {clientChunks.map((rows, k) => (
                  <div key={k} className="tt-page" style={{ width: `${100 / clientChunks.length}%` }} data-testid={`nail-queue-page-waiting-${k}`} aria-hidden={clientPageNum !== k}>{renderClients(rows)}</div>
                ))}
              </div>
            </div>
          </div>
          )}
          {onDetailPage && renderDetailGhosts(activeKind as DetailKind)}
        </div>
      </div>
    </section>
  );
}
