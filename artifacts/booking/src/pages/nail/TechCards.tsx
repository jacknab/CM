import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { formatElapsed } from "./ticketDraft";
import { BASE_H, BASE_W, GAP, computeTechGrid } from "./techLayout";
import type { BoardTicket, TechDayStats, TurnTech } from "./nailApi";

type Status = "in-service" | "available" | "break" | "off";

const LABEL: Record<Status, string> = { "in-service": "IN SERVICE", available: "AVAILABLE", break: "ON BREAK", off: "NOT CLOCKED IN" };

const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

/** What the front desk needs to know about each technician, right now. */
function statusOf(t: TurnTech, current: BoardTicket | undefined): Status {
  if (t.clockedIn === false) return "off";
  if (t.paused || t.currentStatus === "on_break") return "break";
  if (current || t.currentStatus === "busy") return "in-service";
  return "available";
}

/** "Free for 12 min" — measured from their last finished client, or from clock-in if they haven't had one. */
function freeFor(stats: TechDayStats | undefined, now: number): string {
  const since = Math.max(
    stats?.lastFinishedAt ? +new Date(stats.lastFinishedAt) : 0,
    stats?.clockedInAt ? +new Date(stats.clockedInAt) : 0,
  );
  if (!since) return "Ready for a client";
  const mins = Math.max(0, Math.floor((now - since) / 60_000));
  if (mins < 1) return "Just became free";
  return `Free for ${formatElapsed(new Date(since).toISOString(), now)}`;
}

export function TechCards({ techs, tickets, stats, loading }: { techs: TurnTech[]; tickets: BoardTicket[]; stats: TechDayStats[]; loading: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30_000);
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
        return { t, current, queue, status: statusOf(t, current), nextUp: t.id === nextUpId, stats: stats.find((s) => s.staffId === t.id) };
      })
      .sort((a, b) => Number(a.status === "off") - Number(b.status === "off"));
  }, [techs, tickets, stats]);

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
  const grid = computeTechGrid(cards.length, box.w, box.h);

  const count = (s: Status) => cards.filter((c) => c.status === s).length;
  const summary = [
    count("available") && `${count("available")} available`,
    count("in-service") && `${count("in-service")} in service`,
    count("break") && `${count("break")} on break`,
    count("off") && `${count("off")} not clocked in`,
  ].filter(Boolean).join("  ·  ");

  return (
    <section className="work-area" data-testid="nail-techs">
     <div className="tech-panel">
      <div className="checkin-board-header">
        <h1>Technicians</h1>
        <p>{loading ? "Loading…" : summary || "No technicians yet"}</p>
      </div>
      <div className="tech-stage" ref={stageRef}>
        <div className="tech-grid" data-cols={grid.cols} data-scale={grid.scale.toFixed(2)}
          style={{ gridTemplateColumns: `repeat(${grid.cols}, ${BASE_W * grid.scale}px)`, gap: GAP }}>
          {cards.map(({ t, current, queue, status, nextUp, stats: st }, i) => {
            const color = t.color || "#454c56";
            const doneAt = current ? new Date(current.startedAt ?? current.date).getTime() + current.duration * 60_000 : null;
            const next = queue[0];
            const done = st?.doneToday ?? 0;
            const inLine = status !== "off" && status !== "break" ? (t.turnPosition ?? i) + 1 : null;
            return (
              <div key={t.id} className="tech-slot" style={{ width: BASE_W * grid.scale, height: BASE_H * grid.scale }}>
                <div className={`tech-card tech-${status}`} data-testid={`nail-tech-card-${t.id}`} data-status={status}
                  style={{ width: BASE_W, height: BASE_H, transform: `scale(${grid.scale})` }}>
                  <div className="tech-card-head" style={{ borderLeftColor: color }}>
                    <span className="tech-avatar" style={{ borderColor: color }}>
                      {t.avatarUrl ? <img src={t.avatarUrl} alt="" /> : initials(t.name)}
                    </span>
                    <div className="tech-card-name">
                      <strong>{t.name}</strong>
                      {inLine != null && <span>#{inLine} in turn</span>}
                    </div>
                    <span className="tech-pill" data-status={status}>{LABEL[status]}</span>
                  </div>

                  <div className="tech-card-body">
                    {current ? (
                      <>
                        <div className="tech-now">
                          <strong>{current.client.name}</strong>
                          <span>{current.service.name}{current.addons.length > 0 ? ` +${current.addons.length}` : ""}</span>
                        </div>
                        <div className="tech-meta">
                          <Clock size={12} /> In chair {formatElapsed(current.startedAt ?? current.date, now)}
                          {doneAt != null && <> · done ~{fmtTime(doneAt)}</>}
                        </div>
                      </>
                    ) : status === "available" ? (
                      <div className="tech-free">
                        <strong>{freeFor(st, now)}</strong>
                        {nextUp && <span className="tech-nextup">NEXT UP</span>}
                      </div>
                    ) : status === "break" ? (
                      <div className="tech-idle">Skipped in the turn order until back</div>
                    ) : status === "off" ? (
                      <div className="tech-idle">Clock in to join the turn order</div>
                    ) : (
                      <div className="tech-idle">With a client</div>
                    )}

                    {next && (
                      <div className="tech-queue">
                        <span>{queue.length === 1 ? "1 waiting" : `${queue.length} waiting`}</span>
                        <em>Next: {next.client.name} · {fmtTime(+new Date(next.date))}</em>
                      </div>
                    )}

                    {status !== "off" && (
                      <div className="tech-done">{done === 0 ? "No clients yet today" : done === 1 ? "1 client today" : `${done} clients today`}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {!loading && cards.length === 0 && <div className="checkin-empty"><p>No technicians yet. Add staff in Settings.</p></div>}
        </div>
      </div>
     </div>
    </section>
  );
}
