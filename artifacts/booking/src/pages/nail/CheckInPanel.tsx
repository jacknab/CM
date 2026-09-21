import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatElapsed } from "./ticketDraft";
import type { BoardMarker, BoardTicket } from "./nailApi";

const NO_COLOR = "#454c56";
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const firstName = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] || "Guest";

type Row = { key: string; since: string; name: string; sub: string; at: string; color: string; testId: string; open: () => void; remove?: () => void };

/** Thin "who has checked in" list for the Techs tab — the calendar's Arrived list, narrower. */
export function CheckInPanel({ tickets, markers, onTicket, onMarker, onMarkerRemove, clockOffsetMs = 0 }: {
  clockOffsetMs?: number;
  tickets: BoardTicket[];
  markers: BoardMarker[];
  /** Client with a ticket: open it. */
  onTicket: (t: BoardTicket) => void;
  /** Walk-in with no ticket yet: start their ticket. */
  onMarker: (m: BoardMarker) => void;
  /** Take a walk-in off the list (checked in by mistake / left). */
  onMarkerRemove?: (m: BoardMarker) => void;
}) {
  const [tick, setTick] = useState(() => Date.now());
  const now = tick + clockOffsetMs; // server time, so every POS station shows the same waits
  useEffect(() => {
    const iv = setInterval(() => setTick(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);
  const listRef = useRef<HTMLDivElement>(null);

  // Everyone waiting to be served — kiosk check-ins without a ticket yet, plus tickets whose client is here but not in the chair.
  // Longest wait first.
  const rows = useMemo<Row[]>(() => {
    const fromMarkers = markers.map<Row>((m) => ({
      key: `m${m.id}`, since: m.createdAt, name: firstName(m.clientName), color: NO_COLOR, testId: `nail-arrived-marker-${m.id}`,
      sub: "Walk-in · tap to start ticket", at: `@ ${fmtTime(m.createdAt)}`, open: () => onMarker(m), remove: onMarkerRemove ? () => onMarkerRemove(m) : undefined,
    }));
    const fromTickets = tickets.filter((t) => t.status === "confirmed").map<Row>((t) => {
      const since = t.checkedInAt ?? t.date;
      return {
        key: `t${t.id}`, since, name: firstName(t.client.name), color: t.staff?.color || NO_COLOR, testId: `nail-arrived-${t.id}`,
        sub: `${t.staff?.name ?? "Unassigned"} · ${t.service.name}`, at: `@ ${fmtTime(since)}`, open: () => onTicket(t),
      };
    });
    return [...fromMarkers, ...fromTickets].sort((a, b) => +new Date(a.since) - +new Date(b.since));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, markers]);

  const scroll = (dy: number) => listRef.current?.scrollBy({ top: dy, behavior: "smooth" });

  return (
    <section className="ticket-panel arrived-panel" data-testid="nail-arrived" data-count={rows.length}>
      <button type="button" className="arrived-scroll" onClick={() => scroll(-240)} aria-label="Scroll up"><ChevronUp size={18} /></button>
      <div className="arrived-list" ref={listRef}>
        {rows.length === 0 ? (
          <div className="empty-ticket"><p>No clients have checked in yet today</p></div>
        ) : rows.map((r) => (
          <div key={r.key} className="arrived-row-wrap">
          <button type="button" className="arrived-row" style={{ borderLeftColor: r.color }} data-testid={r.testId} onClick={r.open}>
            <div className="arrived-copy">
              <strong>{r.name}</strong>
              <span>{r.sub}</span>
              <span>{r.at}</span>
            </div>
            <span className="arrived-timer">{formatElapsed(r.since, now)}</span>
          </button>
          {r.remove && (
            <button type="button" className="arrived-remove" aria-label={`Remove ${r.name} from the waiting list`} data-testid={`${r.testId}-remove`}
              onClick={() => { if (window.confirm(`Take ${r.name} off the waiting list?`)) r.remove?.(); }}>×</button>
          )}
          </div>
        ))}
      </div>
      <button type="button" className="arrived-scroll" onClick={() => scroll(240)} aria-label="Scroll down"><ChevronDown size={18} /></button>
    </section>
  );
}
