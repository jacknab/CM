import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatElapsed } from "./ticketDraft";
import type { BoardMarker, BoardTicket } from "./nailApi";

const NO_COLOR = "#454c56";
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const firstName = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] || "Guest";

type Row = { key: string; since: string; name: string; sub: string; at: string; color: string; testId: string };

/** Thin "who has checked in" list for the Techs tab — the calendar's Arrived list, narrower. */
export function CheckInPanel({ tickets, markers }: { tickets: BoardTicket[]; markers: BoardMarker[] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);
  const listRef = useRef<HTMLDivElement>(null);

  // Everyone waiting to be served — kiosk check-ins without a ticket yet, plus tickets whose client is here but not in the chair.
  // Longest wait first.
  const rows = useMemo<Row[]>(() => {
    const fromMarkers = markers.map<Row>((m) => ({
      key: `m${m.id}`, since: m.createdAt, name: firstName(m.clientName), color: NO_COLOR, testId: `nail-arrived-marker-${m.id}`,
      sub: "Kiosk · no ticket yet", at: `@ ${fmtTime(m.createdAt)}`,
    }));
    const fromTickets = tickets.filter((t) => t.status === "confirmed").map<Row>((t) => {
      const since = t.checkedInAt ?? t.date;
      return {
        key: `t${t.id}`, since, name: firstName(t.client.name), color: t.staff?.color || NO_COLOR, testId: `nail-arrived-${t.id}`,
        sub: `${t.staff?.name ?? "Unassigned"} · ${t.service.name}`, at: `@ ${fmtTime(since)}`,
      };
    });
    return [...fromMarkers, ...fromTickets].sort((a, b) => +new Date(a.since) - +new Date(b.since));
  }, [tickets, markers]);

  const scroll = (dy: number) => listRef.current?.scrollBy({ top: dy, behavior: "smooth" });
  const today = new Date().toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

  return (
    <section className="ticket-panel arrived-panel" data-testid="nail-arrived">
      <div className="ticket-client-header">
        <div className="ticket-client-main">
          <div className="ticket-client-name">Checked In</div>
          <div className="ticket-client-points">{today} · waiting</div>
        </div>
        <div className="ticket-client-num" data-testid="nail-arrived-count">{rows.length}</div>
      </div>

      <button type="button" className="arrived-scroll" onClick={() => scroll(-240)} aria-label="Scroll up"><ChevronUp size={18} /></button>
      <div className="arrived-list" ref={listRef}>
        {rows.length === 0 ? (
          <div className="empty-ticket"><p>No clients have checked in yet today</p></div>
        ) : rows.map((r) => (
          <div key={r.key} className="arrived-row" style={{ borderLeftColor: r.color }} data-testid={r.testId}>
            <div className="arrived-copy">
              <strong>{r.name}</strong>
              <span>{r.sub}</span>
              <span>{r.at}</span>
            </div>
            <span className="arrived-timer">{formatElapsed(r.since, now)}</span>
          </div>
        ))}
      </div>
      <button type="button" className="arrived-scroll" onClick={() => scroll(240)} aria-label="Scroll down"><ChevronDown size={18} /></button>
    </section>
  );
}
