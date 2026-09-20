import { useEffect, useState } from "react";
import { Clock, Phone, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration, formatElapsed } from "./ticketDraft";
import type { BoardMarker, BoardTicket } from "./nailApi";

interface Props {
  tickets: BoardTicket[];
  markers: BoardMarker[];
  busy: boolean;
  onStart: (t: BoardTicket) => void;
  onCheckout: (t: BoardTicket) => void;
  onReassign: (t: BoardTicket) => void;
  onEdit: (t: BoardTicket) => void;
  onCancel: (t: BoardTicket) => void;
  onMarkerTicket: (m: BoardMarker) => void;
  onMarkerRemove: (m: BoardMarker) => void;
}

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function Column({ title, count, children, testId }: { title: string; count: number; children: React.ReactNode; testId: string }) {
  return (
    <div className="flex-1 min-w-0 flex flex-col min-h-0 border-r border-border last:border-r-0" data-testid={testId}>
      <div className="flex items-center gap-2 px-4 h-12 border-b border-border shrink-0">
        <h2 className="text-[12px] font-bold tracking-wider text-muted-foreground">{title.toUpperCase()}</h2>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold">{count}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">{children}</div>
    </div>
  );
}

export function CheckInBoard(p: Props) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [openMarker, setOpenMarker] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, []);

  const waiting = p.tickets.filter((t) => t.status === "confirmed");
  const inService = p.tickets.filter((t) => t.status === "started");
  const open = p.tickets.find((t) => t.id === openId) ?? null;
  const marker = p.markers.find((m) => m.id === openMarker) ?? null;

  const card = (t: BoardTicket) => {
    const since = t.status === "started" ? t.startedAt ?? t.date : t.checkedInAt ?? t.date;
    const future = t.status === "confirmed" && new Date(t.date).getTime() - now > 60_000;
    return (
      <button key={t.id} type="button" onClick={() => setOpenId(t.id)} data-testid={`nail-card-${t.id}`}
        className="w-full text-left rounded-lg border border-border bg-card hover:bg-secondary/60 transition-colors overflow-hidden"
        style={{ borderLeft: `4px solid ${t.staff?.color || "hsl(var(--cx-surface-4))"}` }}>
        <div className="px-3 py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[14px] font-bold truncate">{t.client.name}</span>
            <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">#{t.ticketNumber ?? t.id}</span>
          </div>
          <div className="mt-0.5 text-[12px] text-muted-foreground truncate">
            {t.service.name}{t.addons.length > 0 ? ` +${t.addons.length}` : ""} · {t.staff?.name ?? "Unassigned"}
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">
              {future ? `Next up ~${fmtTime(t.date)}` : `${t.status === "started" ? "In chair" : "Waiting"} ${formatElapsed(since, now)}`}
            </span>
            <span className="font-bold tabular-nums">${t.total.toFixed(2)}</span>
          </div>
        </div>
      </button>
    );
  };

  const dock: { label: string; action: () => void; primary?: boolean; danger?: boolean }[] = open
    ? open.status === "confirmed"
      ? [
          { label: "START", action: () => p.onStart(open), primary: true },
          { label: "REASSIGN", action: () => p.onReassign(open) },
          { label: "TICKET", action: () => p.onEdit(open) },
          { label: "CANCEL", action: () => p.onCancel(open), danger: true },
        ]
      : [
          { label: "CHECKOUT", action: () => p.onCheckout(open), primary: true },
          { label: "REASSIGN", action: () => p.onReassign(open) },
          { label: "TICKET", action: () => p.onEdit(open) },
        ]
    : [];

  return (
    <section className="flex-1 min-h-0 flex flex-col" data-testid="nail-board">
      <div className="px-5 py-3 border-b border-border shrink-0">
        <h1 className="text-[17px] font-bold">Checked-in clients</h1>
        <p className="text-[12px] text-muted-foreground">Tap a card to manage the client.</p>
      </div>
      <div className="flex-1 min-h-0 flex">
        <Column title="Waiting" count={waiting.length + p.markers.length} testId="nail-col-waiting">
          {p.markers.map((m) => (
            <button key={`m${m.id}`} type="button" onClick={() => setOpenMarker(m.id)} data-testid={`nail-marker-${m.id}`}
              className="w-full text-left rounded-lg border border-dashed border-border bg-card/50 hover:bg-secondary/60 px-3 py-2.5">
              <div className="text-[14px] font-bold truncate">{m.clientName || "Guest"}</div>
              <div className="text-[12px] text-muted-foreground">Checked in at the kiosk · no ticket yet</div>
              <div className="mt-1 text-[11px] text-muted-foreground">Waiting {formatElapsed(m.createdAt, now)}</div>
            </button>
          ))}
          {waiting.map(card)}
          {waiting.length === 0 && p.markers.length === 0 && <p className="text-[13px] text-muted-foreground px-1 py-6 text-center">Nobody waiting.</p>}
        </Column>
        <Column title="In service" count={inService.length} testId="nail-col-service">
          {inService.map(card)}
          {inService.length === 0 && <p className="text-[13px] text-muted-foreground px-1 py-6 text-center">No clients in service.</p>}
        </Column>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-[110] bg-black/60" onClick={() => setOpenId(null)} />
          <div className="fixed z-[120] left-1/2 top-[14vh] -translate-x-1/2 w-[min(94vw,520px)] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden" data-testid="nail-ticket-modal">
            <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-border" style={{ borderLeft: `4px solid ${open.staff?.color || "transparent"}` }}>
              <div>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-[18px] font-bold">{open.client.name}</h2>
                  <span className="text-[12px] tabular-nums text-muted-foreground">#{open.ticketNumber ?? open.id}</span>
                </div>
                {open.client.phone && <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground"><Phone className="w-3 h-3" />{open.client.phone}</div>}
              </div>
              <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider", open.status === "started" ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground")}>
                {open.status === "started" ? "IN SERVICE" : "WAITING"}
              </span>
            </div>
            <div className="px-5 py-3 space-y-2 text-[13px]">
              <div className="flex justify-between"><span className="text-muted-foreground">Service</span><span className="font-semibold">{open.service.name}</span></div>
              {open.addons.map((a) => <div key={a.id} className="flex justify-between text-[12px]"><span className="text-muted-foreground pl-3">+ {a.name}</span><span>${a.price.toFixed(2)}</span></div>)}
              {open.nail?.lines.map((l) => <div key={l.label} className="flex justify-between text-[12px]"><span className="text-muted-foreground pl-3">+ {l.label}</span><span>${l.price.toFixed(2)}</span></div>)}
              <div className="flex justify-between"><span className="text-muted-foreground">Technician</span><span className="font-semibold">{open.staff?.name ?? "Not assigned"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />Duration</span><span>{formatDuration(open.duration)}</span></div>
              <div className="flex justify-between pt-2 border-t border-border"><span className="font-semibold">Total</span><span className="font-bold tabular-nums">${open.total.toFixed(2)}</span></div>
            </div>
            <div className="grid grid-cols-4 gap-2 p-3 border-t border-border" onClick={(e) => e.stopPropagation()}>
              {dock.map((b) => (
                <button key={b.label} type="button" disabled={p.busy} onClick={() => { b.action(); setOpenId(null); }} data-testid={`nail-dock-${b.label.toLowerCase()}`}
                  className={cn(
                    "h-12 rounded-md text-[12px] font-bold tracking-wide border disabled:opacity-40",
                    b.primary ? "bg-primary text-primary-foreground border-primary" : b.danger ? "border-destructive/50 text-destructive hover:bg-destructive/10" : "border-border hover:bg-secondary",
                  )}>
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {marker && (
        <>
          <div className="fixed inset-0 z-[110] bg-black/60" onClick={() => setOpenMarker(null)} />
          <div className="fixed z-[120] left-1/2 top-[20vh] -translate-x-1/2 w-[min(94vw,420px)] rounded-2xl border border-border bg-card shadow-2xl p-5 space-y-3" data-testid="nail-marker-modal">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[17px] font-bold">{marker.clientName || "Guest"}</h2>
                {marker.phone && <div className="text-[12px] text-muted-foreground">{marker.phone}</div>}
              </div>
              <button type="button" onClick={() => setOpenMarker(null)} aria-label="Close" className="p-1 text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-[12px] text-muted-foreground">They checked in at the kiosk but don't have a ticket yet.</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { p.onMarkerRemove(marker); setOpenMarker(null); }}
                className="h-12 rounded-md border border-destructive/50 text-destructive text-[12px] font-bold hover:bg-destructive/10">REMOVE</button>
              <button type="button" onClick={() => { p.onMarkerTicket(marker); setOpenMarker(null); }} data-testid="nail-marker-create"
                className="h-12 rounded-md bg-primary text-primary-foreground text-[12px] font-bold">CREATE TICKET</button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
