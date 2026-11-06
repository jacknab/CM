/**
 * Solo dashboard › Calendar (owner, 2026-11-06; plans/solo-web-dashboard.md): the Certxa Pro app's calendar on the
 * website (app/(tabs)/calendar.tsx). One person's calendar — the owner's — in the business's time zone. Month, Week
 * and Day; the day is a 24-hour timeline with blocked time behind the bookings, overlapping bookings side by side and
 * a line at the current time. Drag a booking to move it (never a paid one); click it for its details.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { soloApi } from "@/lib/soloApi";
import { SOLO_COLORS, useSolo } from "./SoloLayout";
import {
  addDays, addMonths, at, clock, dayLabel, dayNumber, monthCells, monthOf, todayIn, weekWindow, minutesIn, type Day,
} from "./soloTime";
import { refreshSolo, toBooking, type ApiAppointment, type Booking } from "./soloBookings";
import SoloBookingPanel, { NotifyToggle } from "./SoloBookingPanel";
import { BlockTimeDialog, NewBookingDialog } from "./SoloNewBooking";
import { ErrorText, PrimaryButton, SecondaryButton, SoloModal } from "./soloUi";

type ViewMode = "Month" | "Week" | "Day";
type TimeBlock = { id: number; startsAt: string; endsAt: string; allDay: boolean; note: string | null };
type BookingRequest = { id: number; status: string };

const BOOKING_COLORS = ["#ECE5FD", "#F9E1BC", "#F3D4DE", "#DEE4F4"];
const HOUR_HEIGHT = 64;
const SNAP_MINUTES = 5;
/** How far the pointer has to travel before a press becomes a drag (a shorter one is a click). */
const DRAG_START_PX = 5;

/** Bookings that share any time sit side by side: each one's column and how many its group needs (the app's rule). */
function overlapColumns(items: Booking[]) {
  const layout: Record<number, { column: number; columns: number }> = {};
  let group: { id: number; column: number }[] = [];
  let columnEnds: number[] = [];
  let groupEnd = -1;
  const close = () => { for (const g of group) layout[g.id] = { column: g.column, columns: columnEnds.length }; group = []; columnEnds = []; };
  for (const item of items) {
    const start = item.start, end = item.start + item.duration;
    if (group.length && start >= groupEnd) close();
    let column = columnEnds.findIndex((e) => e <= start);
    if (column === -1) { column = columnEnds.length; columnEnds.push(end); } else columnEnds[column] = end;
    group.push({ id: item.id, column });
    groupEnd = Math.max(groupEnd, end);
  }
  close();
  return layout;
}

export default function SoloCalendar() {
  const { store } = useSolo();
  const tz = store.timezone || "America/Los_Angeles";
  const qc = useQueryClient();

  // "Now" ticks each minute so the time line moves and "today" rolls over at midnight.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  const today = todayIn(tz);
  const [selected, setSelected] = useState<Day>(today);
  const [view, setView] = useState<ViewMode>("Day");

  const days = useMemo(() => weekWindow(selected, today), [selected, today]);
  const cells = useMemo(() => monthCells(selected), [selected]);
  // One load covers the month grid and the week window around the chosen day.
  const rangeStart = cells[0] < days[0] ? cells[0] : days[0];
  const rangeEnd = addDays(cells[41] > days[6] ? cells[41] : days[6], 1);
  const from = at(rangeStart, 0, tz).toISOString();
  const to = new Date(at(rangeEnd, 0, tz).getTime() - 1).toISOString();

  const appts = useQuery<ApiAppointment[]>({
    queryKey: ["solo", "calendar", store.id, from, to],
    queryFn: () => soloApi<ApiAppointment[]>(`/api/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    refetchInterval: 60_000,
  });
  const blocks = useQuery<TimeBlock[]>({
    queryKey: ["solo", "time-blocks", store.id, from, to],
    queryFn: () => soloApi<TimeBlock[]>(`/api/time-blocks?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  });
  const requests = useQuery<BookingRequest[]>({ queryKey: ["solo", "booking-requests", store.id], queryFn: () => soloApi<BookingRequest[]>("/api/booking-requests") });
  const openRequests = (Array.isArray(requests.data) ? requests.data : []).filter((r) => r.status === "requested").length;

  // Tickets kept off the calendar (POS quick sales, bookings held for a deposit) are not drawn.
  const all = useMemo(() => (Array.isArray(appts.data) ? appts.data : []).filter((a) => a.calendarHidden !== true).map((a) => toBooking(a, tz)), [appts.data, tz]);
  const byDay = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    // A cancelled booking leaves the calendar (its time is free again); a no-show stays, labelled.
    for (const b of [...all].filter((b) => b.status !== "cancelled").sort((a, b) => +new Date(a.dateIso) - +new Date(b.dateIso))) (map[b.day] ??= []).push(b);
    return map;
  }, [all]);
  const dayBookings = byDay[selected] ?? [];

  const [openId, setOpenId] = useState<number | null>(null);
  const opened = openId != null ? all.find((b) => b.id === openId) ?? null : null;
  const [creating, setCreating] = useState<null | { kind: "booking"; prefill?: { customerId: number | null; serviceId: number | null } } | { kind: "block" }>(null);
  const [removing, setRemoving] = useState<TimeBlock | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState("");

  const shift = (n: number) => setSelected(view === "Month" ? addMonths(selected, n) : addDays(selected, view === "Week" ? n * 7 : n));
  const title = view === "Week"
    ? `${dayLabel(days[0], { month: "short", day: "numeric" })} – ${dayLabel(days[6], { month: "short", day: "numeric" })}`
    : view === "Day" ? dayLabel(selected, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : dayLabel(selected, { month: "long", year: "numeric" });

  const removeBlock = async () => {
    if (!removing) return;
    setRemoveBusy(true); setRemoveError("");
    try { await soloApi(`/api/time-blocks/${removing.id}`, { method: "DELETE" }); await refreshSolo(qc); setRemoving(null); }
    catch (e) { setRemoveError(e instanceof Error ? e.message : "Could not remove it. Please try again."); }
    finally { setRemoveBusy(false); }
  };

  const segment = (mode: ViewMode) => `rounded-lg px-3.5 py-1.5 text-sm font-semibold ${view === mode ? "text-white" : "text-[#6B6F86] hover:text-[#11152E]"}`;

  return (
    <div className="flex h-full flex-col px-4 pt-6 md:px-8 md:pt-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-[24px] font-semibold tracking-tight">Calendar</h1>
        <div className="flex rounded-xl border bg-white p-1" style={{ borderColor: SOLO_COLORS.border }}>
          {(["Month", "Week", "Day"] as ViewMode[]).map((m) => (
            <button key={m} type="button" onClick={() => setView(m)} className={segment(m)} style={view === m ? { background: SOLO_COLORS.primary } : undefined} data-testid={`solo-view-${m.toLowerCase()}`}>{m}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setCreating({ kind: "block" })} className="rounded-xl border bg-white px-3.5 py-2 text-sm font-semibold hover:bg-gray-50" style={{ borderColor: SOLO_COLORS.border }} data-testid="solo-block-time">Block time</button>
          <button type="button" onClick={() => setCreating({ kind: "booking" })} className="rounded-xl px-3.5 py-2 text-sm font-semibold text-white" style={{ background: SOLO_COLORS.primary }} data-testid="solo-new-booking">New booking</button>
        </div>
      </div>

      {openRequests > 0 && (
        <p className="mt-4 rounded-xl border bg-white px-4 py-2.5 text-sm font-medium" style={{ borderColor: SOLO_COLORS.primary }} data-testid="solo-requests-banner">
          {openRequests === 1 ? "1 booking request is waiting for you." : `${openRequests} booking requests are waiting for you.`} Answer them in the Certxa Pro app.
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button type="button" aria-label="Previous" onClick={() => shift(-1)} className="rounded-lg p-1.5 hover:bg-white" data-testid="solo-prev"><ChevronLeft className="h-5 w-5" /></button>
        <button type="button" aria-label="Next" onClick={() => shift(1)} className="rounded-lg p-1.5 hover:bg-white" data-testid="solo-next"><ChevronRight className="h-5 w-5" /></button>
        <h2 className="text-lg font-semibold" data-testid="solo-calendar-title">{title}</h2>
        {selected !== today && <button type="button" onClick={() => setSelected(today)} className="ml-auto text-sm font-semibold" style={{ color: SOLO_COLORS.primary }}>Today</button>}
      </div>

      {appts.error && <p className="mt-3 text-sm text-red-600">Your calendar could not be loaded. Please try again.</p>}

      {view === "Month" ? (
        <MonthView cells={cells} selected={selected} today={today} byDay={byDay} onPick={(d) => { setSelected(d); setView("Day"); }} />
      ) : view === "Week" ? (
        <WeekView days={days} selected={selected} byDay={byDay} onPick={(d) => { setSelected(d); setView("Day"); }} />
      ) : (
        <>
          <div className="mt-3 grid grid-cols-7 gap-1" data-testid="solo-day-strip">
            {days.map((d) => {
              const active = d === selected, isToday = d === today, booked = (byDay[d]?.length ?? 0) > 0;
              return (
                <button key={d} type="button" onClick={() => setSelected(d)} className="flex flex-col items-center gap-1 rounded-xl py-1.5"
                  style={active ? { background: SOLO_COLORS.primary, color: "#fff" } : { color: isToday ? SOLO_COLORS.primary : SOLO_COLORS.text }}>
                  <span className="text-[11px] font-semibold opacity-80">{dayLabel(d, { weekday: "short" })}</span>
                  <span className="text-[15px] font-bold">{dayNumber(d)}</span>
                  <span className="h-1 w-1 rounded-full" style={{ background: !booked ? "transparent" : active ? "#fff" : SOLO_COLORS.primary }} />
                </button>
              );
            })}
          </div>
          <div className="mb-2 mt-2 flex items-center justify-between text-xs font-medium" style={{ color: SOLO_COLORS.muted }}>
            <span>{dayBookings.length} {dayBookings.length === 1 ? "appointment" : "appointments"}</span>
            {dayBookings.length > 0 && <span>Drag a booking to move it</span>}
          </div>
          <DayTimeline
            key={selected}
            day={selected} tz={tz} now={now} isToday={selected === today} loading={appts.isLoading}
            bookings={dayBookings} blocks={(blocks.data ?? []).filter((b) => +new Date(b.endsAt) > +at(selected, 0, tz) && +new Date(b.startsAt) < +at(selected, 1440, tz))}
            onOpen={(b) => setOpenId(b.id)} onBlock={(b) => { setRemoveError(""); setRemoving(b); }}
          />
        </>
      )}

      {opened && (
        <SoloBookingPanel booking={opened} tz={tz} onClose={() => setOpenId(null)}
          onBookAgain={(b) => { setOpenId(null); setCreating({ kind: "booking", prefill: { customerId: b.customerId, serviceId: b.serviceId } }); }} />
      )}
      {creating?.kind === "booking" && (
        <NewBookingDialog day={selected < today ? today : selected} tz={tz} prefill={creating.prefill} onClose={() => setCreating(null)}
          onBooked={(d) => { setCreating(null); setSelected(d); setView("Day"); }} />
      )}
      {creating?.kind === "block" && (
        <BlockTimeDialog day={selected} tz={tz} onClose={() => setCreating(null)} onSaved={(d) => { setCreating(null); setSelected(d); setView("Day"); }} />
      )}
      {removing && (
        <SoloModal title="Remove this blocked time?" onClose={() => !removeBusy && setRemoving(null)}>
          {removing.note && <p className="mb-4 text-sm" style={{ color: SOLO_COLORS.muted }}>{removing.note}</p>}
          <div className="space-y-2.5">
            <ErrorText>{removeError}</ErrorText>
            <SecondaryButton onClick={removeBlock} busy={removeBusy} danger testId="solo-block-remove">Remove</SecondaryButton>
            <button type="button" onClick={() => setRemoving(null)} className="w-full py-1 text-sm font-medium text-gray-500">Keep</button>
          </div>
        </SoloModal>
      )}
    </div>
  );
}

function MonthView({ cells, selected, today, byDay, onPick }: { cells: Day[]; selected: Day; today: Day; byDay: Record<string, Booking[]>; onPick: (d: Day) => void }) {
  const month = monthOf(selected);
  return (
    <div className="mt-4 min-h-0 flex-1 overflow-y-auto pb-8">
      <div className="rounded-2xl border bg-white p-3" style={{ borderColor: SOLO_COLORS.border }} data-testid="solo-month">
        <div className="grid grid-cols-7 pb-2 text-center text-[11px] font-bold" style={{ color: SOLO_COLORS.muted }}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => <span key={w}>{w}</span>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d) => {
            const items = byDay[d] ?? [];
            const active = d === selected, inMonth = monthOf(d) === month;
            return (
              <button key={d} type="button" onClick={() => onPick(d)} className="flex min-h-[64px] flex-col items-center gap-1 rounded-xl px-1 py-1.5 hover:bg-[#F7F5FD] md:min-h-[92px] md:items-stretch">
                <span className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-semibold ${active ? "text-white" : ""}`}
                  style={active ? { background: SOLO_COLORS.primary } : { color: d === today ? SOLO_COLORS.primary : inMonth ? SOLO_COLORS.text : "#B4B6C6" }}>{dayNumber(d)}</span>
                {/* Phones: a dot. Computers: the first bookings. */}
                <span className="h-1 w-1 rounded-full md:hidden" style={{ background: items.length ? SOLO_COLORS.primary : "transparent" }} />
                <span className="hidden space-y-0.5 md:block">
                  {items.slice(0, 2).map((b, i) => (
                    <span key={b.id} className="block truncate rounded px-1.5 py-0.5 text-left text-[11px] font-semibold text-[#1E2240]" style={{ background: BOOKING_COLORS[i % BOOKING_COLORS.length] }}>
                      {clock(b.start)} {b.name}
                    </span>
                  ))}
                  {items.length > 2 && <span className="block text-left text-[11px]" style={{ color: SOLO_COLORS.muted }}>+{items.length - 2} more</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WeekView({ days, selected, byDay, onPick }: { days: Day[]; selected: Day; byDay: Record<string, Booking[]>; onPick: (d: Day) => void }) {
  return (
    <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pb-8" data-testid="solo-week">
      {days.map((d) => {
        const items = byDay[d] ?? [];
        return (
          <button key={d} type="button" onClick={() => onPick(d)} className="flex w-full items-center gap-4 rounded-2xl border bg-white p-3 text-left hover:bg-[#FBFAFE]"
            style={{ borderColor: d === selected ? SOLO_COLORS.primary : SOLO_COLORS.border }}>
            <span className="w-12 shrink-0 text-center">
              <span className="block text-[11px] font-semibold" style={{ color: SOLO_COLORS.muted }}>{dayLabel(d, { weekday: "short" })}</span>
              <span className="block text-xl font-bold" style={{ color: d === selected ? SOLO_COLORS.primary : SOLO_COLORS.text }}>{dayNumber(d)}</span>
            </span>
            <span className="min-w-0 flex-1 space-y-1">
              {items.length === 0 ? <span className="text-sm" style={{ color: SOLO_COLORS.muted }}>Open schedule</span> : items.slice(0, 3).map((b, i) => (
                <span key={b.id} className="block truncate rounded-md px-2 py-1 text-xs font-semibold text-[#1E2240]" style={{ background: BOOKING_COLORS[i % BOOKING_COLORS.length] }}>
                  {clock(b.start)} · {b.name} · {b.service}
                </span>
              ))}
              {items.length > 3 && <span className="block text-xs" style={{ color: SOLO_COLORS.muted }}>+{items.length - 3} more</span>}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: SOLO_COLORS.muted }} />
          </button>
        );
      })}
    </div>
  );
}

function DayTimeline({ day, tz, now, isToday, loading, bookings, blocks, onOpen, onBlock }: {
  day: Day; tz: string; now: Date; isToday: boolean; loading: boolean; bookings: Booking[]; blocks: TimeBlock[];
  onOpen: (b: Booking) => void; onBlock: (b: TimeBlock) => void;
}) {
  const qc = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const columns = useMemo(() => overlapColumns(bookings), [bookings]);

  // Opening a day scrolls to where the action is: now (today), else the first booking, else 9 AM.
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || loading) return;
    scrolled.current = true;
    const target = isToday ? minutesIn(new Date(), tz) - 60 : bookings.length ? bookings[0].start - 30 : 9 * 60;
    scrollRef.current?.scrollTo({ top: Math.max(0, (target / 60) * HOUR_HEIGHT) });
  }, [bookings, isToday, loading, tz]);

  // ── Dragging: press on a booking and move; a press that doesn't move is a click ──
  const press = useRef<{ booking: Booking; pointerY: number; grab: number; moved: boolean } | null>(null);
  const [drag, setDrag] = useState<{ id: number; minutes: number } | null>(null);
  const [pending, setPending] = useState<{ booking: Booking; minutes: number } | null>(null);
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dropError, setDropError] = useState("");

  const minutesAt = useCallback((clientY: number, grab: number, duration: number) => {
    const top = trackRef.current?.getBoundingClientRect().top ?? 0;
    const raw = ((clientY - top - grab) / HOUR_HEIGHT) * 60;
    const snapped = Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES;
    return Math.min(1440 - duration, Math.max(0, snapped));
  }, []);

  const onPointerDown = (e: ReactPointerEvent, b: Booking) => {
    if (e.button !== 0) return;
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    press.current = { booking: b, pointerY: e.clientY, grab: e.clientY - box.top, moved: false };
    // A paid booking is locked to the calendar: it opens, it never moves.
    if (b.status !== "paid") (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const p = press.current;
    if (!p || p.booking.status === "paid") return;
    if (!p.moved && Math.abs(e.clientY - p.pointerY) < DRAG_START_PX) return;
    p.moved = true;
    // Near the top or bottom edge the timeline scrolls along.
    const view = scrollRef.current?.getBoundingClientRect();
    if (view && scrollRef.current) {
      if (e.clientY < view.top + 40) scrollRef.current.scrollTop -= 12;
      else if (e.clientY > view.bottom - 40) scrollRef.current.scrollTop += 12;
    }
    setDrag({ id: p.booking.id, minutes: minutesAt(e.clientY, p.grab, p.booking.duration) });
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (!p.moved) { setDrag(null); onOpen(p.booking); return; }
    const minutes = minutesAt(e.clientY, p.grab, p.booking.duration);
    setDrag(null);
    if (minutes !== p.booking.start) { setPending({ booking: p.booking, minutes }); setNotify(true); setDropError(""); }
  };
  const onPointerCancel = () => { press.current = null; setDrag(null); };

  const confirmDrop = async () => {
    if (!pending) return;
    setSaving(true); setDropError("");
    try {
      // Certxa refuses the move when it would land on another of the owner's bookings.
      await soloApi(`/api/appointments/${pending.booking.id}`, {
        method: "PATCH", body: { date: at(day, pending.minutes, tz).toISOString(), duration: pending.booking.duration, checkConflicts: true, ...(notify ? { notifyClient: true } : {}) },
      });
      await refreshSolo(qc);
      setPending(null);
    } catch (e) {
      setDropError(e instanceof Error ? e.message : "Could not move the booking.");
    } finally { setSaving(false); }
  };

  const dayStart = +at(day, 0, tz);
  const nowTop = (minutesIn(now, tz) / 60) * HOUR_HEIGHT;

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-t-2xl border border-b-0 bg-white" style={{ borderColor: SOLO_COLORS.border }}>
      <div ref={scrollRef} className="h-full overflow-y-auto pb-10" data-testid="solo-timeline">
        <div className="flex" style={{ height: 24 * HOUR_HEIGHT }}>
          <div className="w-[74px] shrink-0 bg-[#F7F5FD]">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="pr-2.5 pt-0.5 text-right text-[12px] font-bold text-[#3D4160]" style={{ height: HOUR_HEIGHT }}>{clock(h * 60)}</div>
            ))}
          </div>
          <div ref={trackRef} className="relative flex-1 select-none">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h}>
                <div className="absolute inset-x-0 h-px" style={{ top: h * HOUR_HEIGHT, background: SOLO_COLORS.border }} />
                <div className="absolute inset-x-0 h-px opacity-50" style={{ top: h * HOUR_HEIGHT + HOUR_HEIGHT / 2, background: SOLO_COLORS.border }} />
              </div>
            ))}
            {blocks.map((b) => {
              const startMin = Math.max(0, (+new Date(b.startsAt) - dayStart) / 60000);
              const endMin = Math.min(1440, (+new Date(b.endsAt) - dayStart) / 60000);
              if (endMin <= startMin) return null;
              return (
                <button key={`block-${b.id}`} type="button" onClick={() => onBlock(b)} data-testid={`solo-time-block-${b.id}`}
                  className="absolute left-1 right-1 rounded-[10px] border border-dashed bg-[#F2F1F7] px-2.5 pt-1 text-left text-xs font-medium"
                  style={{ top: (startMin / 60) * HOUR_HEIGHT, height: Math.max(22, ((endMin - startMin) / 60) * HOUR_HEIGHT - 3), borderColor: "#CFCBE0", color: SOLO_COLORS.muted }}>
                  {b.allDay ? "Day off" : "Blocked"}{b.note ? ` · ${b.note}` : ""}
                </button>
              );
            })}
            {bookings.map((b, i) => {
              const dragging = drag?.id === b.id;
              const minutes = dragging ? drag.minutes : b.start;
              const height = Math.max(26, (b.duration / 60) * HOUR_HEIGHT - 3);
              const place = columns[b.id] ?? { column: 0, columns: 1 };
              const label = b.status === "paid" ? `PAID · ${b.service}` : b.status === "no_show" ? `NO-SHOW · ${b.service}` : b.depositDue ? `DEPOSIT DUE · ${b.service}` : b.service;
              return (
                <div key={b.id} role="button" tabIndex={0} data-testid={`solo-booking-${b.id}`}
                  aria-label={`${b.name}, ${clock(b.start)}`}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(b); } }}
                  onPointerDown={(e) => onPointerDown(e, b)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
                  className={`absolute overflow-hidden rounded-lg border-2 border-white px-2.5 py-1 ${b.status === "paid" ? "cursor-pointer" : dragging ? "cursor-grabbing shadow-lg" : "cursor-grab"}`}
                  style={{
                    top: (minutes / 60) * HOUR_HEIGHT, height,
                    left: dragging ? 0 : `${(place.column / place.columns) * 100}%`, width: dragging ? "100%" : `${100 / place.columns}%`,
                    background: BOOKING_COLORS[i % BOOKING_COLORS.length], zIndex: dragging ? 5 : 1, opacity: dragging ? 0.95 : 1, touchAction: "none",
                  }}>
                  <p className="truncate text-[12px] font-bold leading-[15px] text-[#1E2240]">{dragging ? `${clock(minutes)} · ${b.name}` : b.name}</p>
                  {height >= 40 && <p className="mt-0.5 truncate text-[11px] font-semibold leading-[14px] text-[#1E2240]">{label}</p>}
                  {height >= 56 && <p className="mt-0.5 truncate text-[10px] font-medium text-[#5B5F78]">{clock(b.start)} · {b.duration} min</p>}
                </div>
              );
            })}
            {isToday && <div className="pointer-events-none absolute inset-x-0 h-0.5" style={{ top: nowTop, background: SOLO_COLORS.primary }} data-testid="solo-now-line" />}
          </div>
        </div>
      </div>
      {bookings.length === 0 && !loading && (
        <p className="pointer-events-none absolute inset-x-0 top-28 text-center text-sm font-medium text-[#A9ACC0]">Your schedule is open</p>
      )}
      {loading && <div className="absolute inset-x-0 top-28 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>}

      {pending && (
        <SoloModal title="Move this booking?" onClose={() => !saving && setPending(null)}>
          <p className="text-sm" style={{ color: SOLO_COLORS.muted }}>{pending.booking.name} · {pending.booking.service}</p>
          <div className="my-4 rounded-xl border bg-[#F7F5FD] p-3.5" style={{ borderColor: SOLO_COLORS.border }}>
            <p className="text-[10px] font-bold tracking-[0.1em]" style={{ color: SOLO_COLORS.muted }}>NEW TIME</p>
            <p className="mt-1 text-xl font-semibold" data-testid="solo-drop-time">{clock(pending.minutes)}</p>
          </div>
          <div className="space-y-3">
            <NotifyToggle value={notify} onChange={setNotify} />
            <ErrorText>{dropError}</ErrorText>
            <PrimaryButton onClick={confirmDrop} busy={saving} testId="solo-drop-save">Move booking</PrimaryButton>
            <button type="button" onClick={() => setPending(null)} className="w-full py-1 text-sm font-medium text-gray-500">Keep the time</button>
          </div>
        </SoloModal>
      )}
    </div>
  );
}
