import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, MoreHorizontal } from "lucide-react";

/** An open time: who takes it, and (two services nobody does both of) who takes the second service. */
export interface BookingSlot { time: string; staffId: number; staffName: string; extraStaffId?: number; extraStaffName?: string }

const KEYS = 18; // the same 3 × 6 grid as the service keys

/** "2026-10-18" in the salon's time zone. */
function dayKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const v = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${v("year")}-${v("month")}-${v("day")}`;
}
const dayLabel = (day: string, today: string, tomorrow: string) => {
  if (day === today) return { top: "Today", sub: new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" }) };
  if (day === tomorrow) return { top: "Tomorrow", sub: new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" }) };
  const d = new Date(`${day}T12:00:00Z`);
  return { top: d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" }), sub: d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" }) };
};

/**
 * Booking a future visit, in the right-hand panel where the service keys are: the day, then the time, then
 * (optionally) the technician — as keys in the same grid, so the desk learns nothing new. The ticket on the
 * left keeps showing the visit being booked.
 */
export function BookingPanel(p: {
  slug: string;
  timezone: string;
  serviceId: number;
  extraServiceId: number | null;
  /** The whole visit in minutes: every service and add-on. */
  duration: number;
  technicians: { id: number; name: string; color?: string | null }[];
  slot: BookingSlot | null;
  onSlot: (slot: BookingSlot | null) => void;
  /** Back to the service keys. */
  onServices: () => void;
}) {
  const today = dayKey(new Date(), p.timezone);
  const days = useMemo(() => Array.from({ length: 60 }, (_, i) => dayKey(new Date(Date.now() + i * 86_400_000), p.timezone)), [p.timezone]);
  const [view, setView] = useState<"day" | "time" | "tech">("day");
  const [dayPage, setDayPage] = useState(0);
  const [day, setDay] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<number | null>(null);
  const [timePage, setTimePage] = useState(0);
  const [slots, setSlots] = useState<BookingSlot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The open times for the chosen day (and technician), from the same calculation online booking uses —
  // asked as the salon's staff, so online-only limits (minimum notice, online booking off) do not apply.
  useEffect(() => {
    if (!day) return;
    let cancelled = false;
    setSlots(null); setError(null); setTimePage(0);
    const q = new URLSearchParams({ serviceId: String(p.serviceId), date: day, duration: String(Math.max(5, p.duration)), staff: "1" });
    if (p.extraServiceId) q.set("extraServiceId", String(p.extraServiceId));
    if (staffId) q.set("staffId", String(staffId));
    fetch(`/api/public/store/${encodeURIComponent(p.slug)}/availability?${q}`, { credentials: "include" })
      .then(async (res) => { const data = await res.json().catch(() => null); if (!res.ok) throw new Error(data?.message || "Could not load the open times"); return data; })
      .then((data) => { if (!cancelled) setSlots(Array.isArray(data) ? data : []); })
      .catch((err) => { if (!cancelled) setError(err?.message || "Could not load the open times. It needs a connection."); });
    return () => { cancelled = true; };
  }, [day, staffId, p.slug, p.serviceId, p.extraServiceId, p.duration]);

  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: p.timezone, hour: "numeric", minute: "2-digit" });
  const techName = staffId ? p.technicians.find((t) => t.id === staffId)?.name ?? "Technician" : "Any technician";

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
  if (view === "day") {
    // Back to services, the days (15 a page), and Later / Earlier.
    const perPage = 15;
    const pageDays = days.slice(dayPage * perPage, dayPage * perPage + perPage);
    cells = [
      nav("Services", p.onServices, "nail-book-services"),
      ...pageDays.map((d) => { const l = dayLabel(d, today, days[1]); return key({ id: `nail-book-day-${d}`, top: l.top, sub: l.sub, selected: d === day, onClick: () => { setDay(d); p.onSlot(null); setView("time"); } }); }),
    ];
    if (dayPage > 0) cells.push(nav("Earlier", () => setDayPage((n) => n - 1), "nail-book-days-earlier"));
    if ((dayPage + 1) * perPage < days.length) cells.push(nav("Later", () => setDayPage((n) => n + 1), "nail-book-days-later", "more"));
  } else if (view === "tech") {
    cells = [
      nav("Times", () => setView("time"), "nail-book-tech-back"),
      key({ id: "nail-book-tech-any", top: "Any", sub: "First free", selected: staffId == null, onClick: () => { setStaffId(null); p.onSlot(null); setView("time"); } }),
      ...p.technicians.slice(0, KEYS - 2).map((t) => key({ id: `nail-book-tech-${t.id}`, top: t.name, selected: staffId === t.id, onClick: () => { setStaffId(t.id); p.onSlot(null); setView("time"); } })),
    ];
  } else {
    // The day, the technician, then the times (14 a page, More for the rest).
    const perPage = 14;
    const list = slots ?? [];
    const page = list.slice(timePage * perPage, timePage * perPage + perPage);
    const l = day ? dayLabel(day, today, days[1]) : { top: "", sub: "" };
    cells = [
      nav(`${l.top} ${l.sub}`.trim(), () => setView("day"), "nail-book-day-back"),
      key({ id: "nail-book-tech", top: techName, sub: "Tap to choose", onClick: () => setView("tech") }),
      ...page.map((s) => key({
        id: `nail-book-time-${s.time}`, top: fmtTime(s.time),
        sub: staffId ? undefined : s.extraStaffName && s.extraStaffName !== s.staffName ? `${s.staffName}, then ${s.extraStaffName}` : s.staffName,
        selected: p.slot?.time === s.time && p.slot?.staffId === s.staffId, onClick: () => p.onSlot(s),
      })),
    ];
    if ((timePage + 1) * perPage < list.length) cells.push(nav("More", () => setTimePage((n) => n + 1), "nail-book-times-more", "more"));
    else if (timePage > 0) cells.push(nav("Back", () => setTimePage(0), "nail-book-times-first"));
    message = error ? error : slots == null ? "Finding open times…" : list.length === 0 ? `No open time ${staffId ? `for ${techName} ` : ""}on this day. Pick another day${staffId ? " or Any" : ""}.` : null;
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
