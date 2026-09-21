import { useEffect, useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { formatElapsed } from "./ticketDraft";
import type { BoardTicket, TurnTech } from "./nailApi";

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

export function TechCards({ techs, tickets, loading }: { techs: TurnTech[]; tickets: BoardTicket[]; loading: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);

  const cards = useMemo(() => {
    const nextUpId = techs.find((t) => t.eligible)?.id ?? null;
    return techs
      .map((t) => {
        const mine = tickets.filter((x) => x.staff?.id === t.id);
        const current = mine.find((x) => x.status === "started");
        const queue = mine.filter((x) => x.status === "confirmed").sort((a, b) => +new Date(a.date) - +new Date(b.date));
        return { t, current, queue, status: statusOf(t, current), nextUp: t.id === nextUpId };
      })
      // Working techs first, then the ones who aren't in — each group in TURN order.
      .sort((a, b) => Number(a.status === "off") - Number(b.status === "off"));
  }, [techs, tickets]);

  const count = (s: Status) => cards.filter((c) => c.status === s).length;
  const summary = [
    count("available") && `${count("available")} available`,
    count("in-service") && `${count("in-service")} in service`,
    count("break") && `${count("break")} on break`,
    count("off") && `${count("off")} not clocked in`,
  ].filter(Boolean).join("  ·  ");

  return (
    <section className="techs-tab" data-testid="nail-techs">
      <div className="checkin-board-header">
        <h1>Technicians</h1>
        <p>{loading ? "Loading…" : summary || "No technicians yet"}</p>
      </div>
      <div className="tech-grid">
        {cards.map(({ t, current, queue, status, nextUp }) => {
          const color = t.color || "#454c56";
          const doneAt = current ? new Date(current.startedAt ?? current.date).getTime() + current.duration * 60_000 : null;
          const next = queue[0];
          return (
            <div key={t.id} className={`tech-card tech-${status}`} data-testid={`nail-tech-card-${t.id}`} data-status={status}>
              <div className="tech-card-head" style={{ borderLeftColor: color }}>
                <span className="tech-avatar" style={{ borderColor: color }}>
                  {t.avatarUrl ? <img src={t.avatarUrl} alt="" /> : initials(t.name)}
                </span>
                <div className="tech-card-name">
                  <strong>{t.name}</strong>
                  {status !== "off" && <span>Turn {t.turnCount ?? 0} today</span>}
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
                  <div className="tech-idle">{nextUp ? <><b>NEXT UP</b> · ready for the next client</> : "Ready for a client"}</div>
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
              </div>
            </div>
          );
        })}
        {!loading && cards.length === 0 && <div className="checkin-empty"><p>No technicians yet. Add staff in Settings.</p></div>}
      </div>
    </section>
  );
}
