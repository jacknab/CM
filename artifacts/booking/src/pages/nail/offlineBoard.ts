/**
 * The board as staff see it while offline (and for a moment after): the last board the server sent, plus the
 * walk-ins and tickets made on this device that the server has not shown back yet.
 */
import type { LocalRecord, PatchRecord, TicketRecord, WalkinRecord } from "@/lib/nail-offline/engine";
import type { BoardMarker, BoardTicket, NailBoard } from "./nailApi";

export const EMPTY_BOARD: NailBoard = { tickets: [], markers: [], dayBookings: [], techStats: [] };

export function ticketFromRecord(t: TicketRecord): BoardTicket {
  return {
    id: t.realId ?? t.id,
    ticketNumber: t.ticketNumber ?? null,
    status: t.status,
    date: t.createdAt, checkedInAt: t.createdAt, startedAt: t.startedAt,
    duration: t.duration,
    client: { id: t.clientId, name: t.clientName, phone: t.phone, loyaltyPoints: 0 },
    service: { id: t.service.id, name: t.service.name, price: t.service.price },
    addons: t.addons,
    nail: t.nail ? {
      sizeId: t.nail.nailSizeId ?? null, shapeId: t.nail.nailShapeId ?? null,
      applicationId: t.nail.nailArtApplicationId ?? null, effectId: t.nail.nailArtEffectId ?? null,
      priceAdjustment: t.nailPriceAdjustment, lines: t.nailLines,
    } : null,
    customLines: t.customLines,
    staff: t.staff,
    total: t.total,
    offline: !t.realId,
  };
}

export function overlayBoard(board: NailBoard | null | undefined, records: LocalRecord[]): NailBoard {
  const base = board ?? EMPTY_BOARD;
  // A ticket paid in cash on this device has left the floor; it is shown under "saved on this tablet" until sent.
  const localTickets = records.filter((r): r is TicketRecord => r.kind === "ticket" && !r.paid);
  const paidLocally = new Set(records.filter((r): r is TicketRecord => r.kind === "ticket" && !!r.paid && !!r.realId).map((r) => r.realId!));
  const walkins = records.filter((r): r is WalkinRecord => r.kind === "walkin");
  const patches = new Map(records.filter((r): r is PatchRecord => r.kind === "patch").map((r) => [r.ticketId, r]));
  if (!localTickets.length && !walkins.length && !patches.size && !paidLocally.size) return base;

  // What this device changed on tickets the server already had: started, moved, edited, cancelled, paid.
  const serverTickets = base.tickets
    .filter((t) => { const p = patches.get(t.id); return !(p && (p.status === "cancelled" || p.paid)) && !paidLocally.has(t.id); })
    .map((t) => {
      const p = patches.get(t.id);
      if (!p) return t;
      return { ...t, ...(p.edit?.view as Partial<BoardTicket> | undefined), ...(p.status === "started" ? { status: "started" as const, startedAt: p.startedAt ?? t.startedAt } : {}),
        ...(p.staff ? { staff: p.staff } : {}), offline: true };
    });
  const serverTicketIds = new Set(base.tickets.map((t) => t.id));
  const tickets = [...serverTickets, ...localTickets.filter((t) => !(t.realId && serverTicketIds.has(t.realId))).map(ticketFromRecord)];

  // A waiting entry already turned into a ticket on this device is no longer waiting.
  const ticketed = new Set(localTickets.filter((t) => !t.realId).map((t) => t.walkinId).filter((id): id is number => id != null));
  const serverMarkerIds = new Set(base.markers.map((m) => m.id));
  const waiting: BoardMarker[] = walkins
    .filter((w) => w.status === "waiting" && !(w.synced && (w.realId == null || serverMarkerIds.has(w.realId))))
    .map((w) => ({ id: w.realId ?? w.id, ticketNumber: w.ticketNumber ?? null, clientId: w.clientId, clientName: w.clientName, phone: w.phone, createdAt: w.createdAt, offline: !w.synced }));
  return { ...base, tickets, markers: [...base.markers.filter((m) => !ticketed.has(m.id)), ...waiting] };
}
