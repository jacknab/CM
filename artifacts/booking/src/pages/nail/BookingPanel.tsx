import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, MoreHorizontal } from "lucide-react";

/** An open time: who takes it, and (two services nobody does both of) who takes the second service. */
export interface BookingSlot { time: string; staffId: number; staffName: string; extraStaffId?: number; extraStaffName?: string }

const KEYS = 18; // the same 3 × 6 grid as the service keys
const DAYS_PER_PAGE = 15;
const TIMES_PER_PAGE = 16;

/** "2026-10-18" in the salon's time zone. */
function dayKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${v("year")}-${v("month")}-${v("day")}`;
}
const dayLabel = (day: string, today: string, tomorrow: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  const sub = d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
  if (day === today) return { top: "Today", sub };
  if (day === tomorrow) return { top: "Tomorrow", sub };
  return { top: d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" }), sub };
};

async function getJson<T>(url: string, fallback: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || fallback);
  return data as T;
}

/**
 * Booking a future visit, in the right-hand panel where the service keys are: the technician first, then
 * the days that technician has room on, then that day's open times — as keys in the same grid, so the desk
 * learns nothing new. The ticket on the left keeps showing the visit being booked.
 */
export function BookingPanel(p: {
  slug: string;
  timezone: string;
  serviceId: number;
  extraServiceId: number | null;
  /** The whole visit in minutes: every service and add-on. */
  duration: number;
  slot: BookingSlot | null;
  onSlot: (slot: BookingSlot | null) => void;
  /** Back to the service keys. */
  onServices: () => void;
}) {
  const today = dayKey(new Date(), p.timezone);
  const tomorrow = dayKey(new Date(Date.now() + 86_400_000), p.timezone);
  const [view, setView] = useState<"tech" | "day" | "time">("tech");
  // undefined = not chosen yet; null = Any technician.
  const [staffId, setStaffId] = useState<number | null | undefined>(undefined);
  const [techs, setTechs] = useState<{ id: number; name: string }[] | null>(null);
  // The day pages: where each one starts (Earlier goes back one), and what the current one holds.
  const [dayStarts, setDayStarts] = useState<string[]>([today]);
  const [days, setDays] = useState<{ days: string[]; next: string | null } | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [timePage, setTimePage] = useState(0);
  const [slots, setSlots] = useState<BookingSlot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visit = useMemo(() => {
    const q = new URLSearchParams({ serviceId: String(p.serviceId), duration: String(Math.max(5, p.duration)) });
    if (p.extraServiceId) q.set("extraServiceId", String(p.extraServiceId));
    return q;
  }, [p.serviceId, p.extraServiceId, p.duration]);

  // The technicians who do this service (both services, when anyone does both).
  useEffect(() => {
    let cancelled = false;
    setTechs(null); setError(null);
    getJson<{ id: number; name: string }[]>(`/api/nail/booking-techs?${visit}`, "Could not load the technicians")
      .then((list) => { if (!cancelled) setTechs(list); })
      .catch((err) => { if (!cancelled) setError(err?.message || "Could not load the technicians. It needs a connection."); });
    return () => { cancelled = true; };
  }, [visit]);

  // The days this technician (or anyone, for Any) has an open time for the whole visit.
  const dayStart = dayStarts[dayStarts.length - 1];
  useEffect(() => {
    if (staffId === undefined) return;
    let cancelled = false;
    setDays(null); setError(null);
    const q = new URLSearchParams(visit);
    q.set("from", dayStart); q.set("limit", String(DAYS_PER_PAGE));
    if (staffId) q.set("staffId", String(staffId));
    getJson<{ days: string[]; next: string | null }>(`/api/nail/booking-days?${q}`, "Could not load the open days")
      .then((d) => { if (!cancelled) setDays(d); })
      .catch((err) => { if (!cancelled) setError(err?.message || "Could not load the open days. It needs a connection."); });
    return () => { cancelled = true; };
  }, [staffId, dayStart, visit]);

  // That day's open times — the same calculation online booking uses, asked as the salon's staff, so
  // online-only limits (minimum notice, online booking off) do not apply.
  useEffect(() => {
    if (!day || staffId === undefined) return;
    let cancelled = false;
    setSlots(null); setError(null); setTimePage(0);
    const q = new URLSearchParams(visit);
    q.set("date", day); q.set("staff", "1");
    if (staffId) q.set("staffId", String(staffId));
    getJson<BookingSlot[]>(`/api/public/store/${encodeURIComponent(p.slug)}/availability?${q}`, "Could not load the open times")
      .then((data) => { if (!cancelled) setSlots(Array.isArray(data) ? data : []); })
      .catch((err) => { if (!cancelled) setError(err?.message || "Could not load the open times. It needs a connection."); });
    return () => { cancelled = true; };
  }, [day, staffId, p.slug, visit]);

  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: p.timezone, hour: "numeric", minute: "2-digit" });
  const techName = staffId ? techs?.find((t) => t.id === staffId)?.name ?? "Technician" : "Any technician";
  const pickTech = (id: number | null) => { setStaffId(id); setDayStarts([today]); setDay(null); p.onSlot(null); setView("day"); };

  const nav = (label: string, onClick: () => void, testId: string, icon: "back" | "more" = "back") => (
    <button key={testId} type="button" className="pos-key pos-key-nav" onClick={onClick} data-testid={testId}>
      {icon === "back" ? <ArrowLeft size={24} /> : <MoreHorizontal size={24} />}<strong>{label}</strong>
    </button>
  );
  const key = (k: { id: string; top: string; sub?: string; selected?: boolean; onClick: () => void }) => (
    <button key={k.id} type="button" className={`pos-key pos-key-service ${k.selected ? "selected" : ""}`} onClick={k.onClick} aria-pressed={!!k.selected} data-testid={k.id}>
      <strong>{k.top}</strong>{k.sub && <span><small>{k.sub}</small></span>}
    </button>
  );
  const fill = (cells: React.ReactNode[]) => [...cells, ...Array.from({ length: Math.max(0, KEYS - cells.length) }, (_, i) => <div key={`e${i}`} className="pos-key pos-key-empty" aria-hidden />)];

  let cells: React.ReactNode[] = [];
  let message: string | null = null;
  if (view === "tech") {
    // Back to services, Any, then each technician who does this service.
    cells = [
      nav("Services", p.onServices, "nail-book-services"),
      key({ id: "nail-book-tech-any", top: "Any", sub: "First free", selected: staffId === null, onClick: () => pickTech(null) }),
      ...(techs ?? []).slice(0, KEYS - 2).map((t) => key({ id: `nail-book-tech-${t.id}`, top: t.name, selected: staffId === t.id, onClick: () => pickTech(t.id) })),
    ];
    message = error ? error : techs == null ? "Loading technicians…" : techs.length === 0 ? "No technician is set up to do this service." : null;
  } else if (view === "day") {
    // Back to the technician, the days they have room on (15 a page), and Earlier / Later.
    const list = days?.days ?? [];
    cells = [
      nav(staffId ? techName : "Any", () => setView("tech"), "nail-book-tech-back"),
      ...list.map((d) => { const l = dayLabel(d, today, tomorrow); return key({ id: `nail-book-day-${d}`, top: l.top, sub: l.sub, selected: d === day, onClick: () => { setDay(d); p.onSlot(null); setView("time"); } }); }),
    ];
    if (dayStarts.length > 1) cells.push(nav("Earlier", () => setDayStarts((s) => s.slice(0, -1)), "nail-book-days-earlier"));
    if (days?.next && list.length >= DAYS_PER_PAGE) cells.push(nav("Later", () => setDayStarts((s) => [...s, days.next!]), "nail-book-days-later", "more"));
    message = error ? error : days == null ? "Finding open days…" : list.length === 0 ? `${staffId ? techName : "Nobody"} has no open time for this visit${dayStarts.length > 1 ? " after these days" : " in the next 90 days"}.` : null;
  } else {
    // Back to the days, then the times (16 a page, More for the rest).
    const list = slots ?? [];
    const page = list.slice(timePage * TIMES_PER_PAGE, timePage * TIMES_PER_PAGE + TIMES_PER_PAGE);
    const l = day ? dayLabel(day, today, tomorrow) : { top: "", sub: "" };
    cells = [
      nav(`${l.top} ${l.sub}`.trim(), () => setView("day"), "nail-book-day-back"),
      ...page.map((s) => key({
        id: `nail-book-time-${s.time}`, top: fmtTime(s.time),
        sub: staffId ? undefined : s.extraStaffName && s.extraStaffName !== s.staffName ? `${s.staffName}, then ${s.extraStaffName}` : s.staffName,
        selected: p.slot?.time === s.time && p.slot?.staffId === s.staffId, onClick: () => p.onSlot(s),
      })),
    ];
    if ((timePage + 1) * TIMES_PER_PAGE < list.length) cells.push(nav("More", () => setTimePage((n) => n + 1), "nail-book-times-more", "more"));
    else if (timePage > 0) cells.push(nav("Back", () => setTimePage(0), "nail-book-times-first"));
    message = error ? error : slots == null ? "Finding open times…" : list.length === 0 ? "This day just filled up. Pick another day." : null;
  }

  return (
    <div className="catalog-panel" data-testid="nail-booking-panel" style={{ position: "relative" }}>
      <div className="pos-grid" data-testid="nail-booking-grid" data-view={view}>{fill(cells).slice(0, KEYS)}</div>
      {message && (
        <p role="status" data-testid="nail-booking-message" style={{ position: "absolute", left: 16, right: 16, bottom: 16, margin: 0, padding: "10px 14px", borderRadius: 8, background: "rgba(10,12,16,.85)", color: "#e8eaed", fontSize: 15, textAlign: "center" }}>
          {message}
        </p>
      )}
    </div>
  );
}
