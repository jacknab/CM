import { describe, it, expect } from "vitest";
import { overlayBoard, EMPTY_BOARD } from "./offlineBoard";
import type { PatchRecord, TicketRecord, WalkinRecord } from "@/lib/nail-offline/engine";
import type { NailBoard } from "./nailApi";

const ticket = (over: Partial<TicketRecord> = {}): TicketRecord => ({
  kind: "ticket", id: -3, storeId: 2, clientId: -1, clientName: "Mai Tran", phone: "6025550101", walkinId: -2,
  service: { id: 11, name: "Gel Manicure", price: 35, duration: 45 }, addons: [], nail: null, nailLines: [], nailPriceAdjustment: 0, customLines: [],
  staff: null, status: "confirmed", startedAt: null, total: 35, duration: 45, createdAt: "2026-10-09T17:00:00.000Z", ...over,
});
const walkin = (over: Partial<WalkinRecord> = {}): WalkinRecord => ({
  kind: "walkin", id: -2, storeId: 2, clientId: -1, clientName: "Mai Tran", phone: "6025550101", status: "waiting", createdAt: "2026-10-09T16:59:00.000Z", ...over,
});
const serverBoard: NailBoard = { ...EMPTY_BOARD, tickets: [{ id: 900 } as any], markers: [{ id: 40, clientId: 7, clientName: "Ana", phone: null, ticketNumber: 12, createdAt: "x" }] };

describe("overlayBoard", () => {
  it("returns the server board untouched when nothing was made on this device", () => {
    expect(overlayBoard(serverBoard, [])).toBe(serverBoard);
  });
  it("shows a ticket and a walk-in made offline, even with no board ever loaded", () => {
    const b = overlayBoard(null, [walkin(), ticket({ walkinId: null })]);
    expect(b.tickets.map((t) => t.id)).toEqual([-3]);
    expect(b.tickets[0]).toMatchObject({ offline: true, ticketNumber: null, client: { name: "Mai Tran" } });
    expect(b.markers.map((m) => m.id)).toEqual([-2]);
  });
  it("a walk-in that became a ticket is shown once, as the ticket", () => {
    const b = overlayBoard(serverBoard, [walkin({ status: "ticketed" }), ticket()]);
    expect(b.markers.map((m) => m.id)).toEqual([40]);
    expect(b.tickets.map((t) => t.id)).toEqual([900, -3]);
  });
  it("hides a server waiting entry once a ticket was made for it on this device", () => {
    const b = overlayBoard(serverBoard, [ticket({ walkinId: 40, clientId: 7 })]);
    expect(b.markers).toHaveLength(0);
  });
  it("never shows a synced ticket twice: once the server board has it, the local copy steps aside", () => {
    const synced = ticket({ realId: 900, ticketNumber: 31 });
    expect(overlayBoard(serverBoard, [synced]).tickets.map((t) => t.id)).toEqual([900]);
    // Synced, but the board on the device is older than the sync: still shown, under its real id.
    const older = overlayBoard({ ...EMPTY_BOARD }, [synced]);
    expect(older.tickets[0]).toMatchObject({ id: 900, ticketNumber: 31, offline: false });
  });
  it("drops a synced walk-in the server now lists itself, or checked in another way", () => {
    expect(overlayBoard(serverBoard, [walkin({ synced: true, realId: 40 })]).markers.map((m) => m.id)).toEqual([40]);
    expect(overlayBoard(serverBoard, [walkin({ synced: true, realId: null })]).markers.map((m) => m.id)).toEqual([40]);
  });
  it("shows what this device did to a server ticket: started, moved to another technician, edited", () => {
    const board: NailBoard = { ...EMPTY_BOARD, tickets: [{ id: 900, status: "confirmed", startedAt: null, staff: null, total: 35 } as any] };
    const patch: PatchRecord = { kind: "patch", id: -9, storeId: 2, ticketId: 900, clientName: "Ana", status: "started", startedAt: "2026-10-09T18:00:00.000Z",
      staff: { id: 9, name: "Lan", color: null }, edit: { view: { total: 50 }, body: {} }, createdAt: "x" };
    expect(overlayBoard(board, [patch]).tickets[0]).toMatchObject({ id: 900, status: "started", staff: { id: 9 }, total: 50, offline: true });
  });
  it("takes a ticket off the floor once it is cancelled or paid in cash on this device", () => {
    const board: NailBoard = { ...EMPTY_BOARD, tickets: [{ id: 900 } as any, { id: 901 } as any] };
    const cancelled: PatchRecord = { kind: "patch", id: -9, storeId: 2, ticketId: 900, clientName: "Ana", status: "cancelled", createdAt: "x" };
    const paid: PatchRecord = { kind: "patch", id: -10, storeId: 2, ticketId: 901, clientName: "Bo", paid: { at: "x", totalPaid: 40, cash: 40, tip: 0, request: {} }, createdAt: "x" };
    expect(overlayBoard(board, [cancelled, paid]).tickets).toHaveLength(0);
    // A ticket made AND paid on this device is not on the floor either.
    expect(overlayBoard(null, [ticket({ paid: { at: "x", totalPaid: 35, cash: 35, tip: 0, request: {} } })]).tickets).toHaveLength(0);
  });

  // Reported from a salon tablet: tickets made on the tablet stayed in the Queue after being paid in full.
  it("drops a ticket the server confirmed once the server's board no longer lists it (paid or cancelled)", () => {
    const paidElsewhere = ticket({ id: -1, realId: 50, syncedAt: "2026-10-12T10:00:00.000Z" });
    const board: NailBoard = { ...EMPTY_BOARD, now: "2026-10-12T10:05:00.000Z" };
    expect(overlayBoard(board, [paidElsewhere]).tickets).toHaveLength(0);
  });

  it("still shows a just-confirmed ticket while the board on hand is older than the confirmation", () => {
    const justSent = ticket({ id: -1, realId: 50, syncedAt: "2026-10-12T10:00:00.000Z" });
    const staleBoard: NailBoard = { ...EMPTY_BOARD, now: "2026-10-12T09:59:00.000Z" };
    expect(overlayBoard(staleBoard, [justSent]).tickets).toHaveLength(1);
  });

  it("still shows a ticket the server has never been told about", () => {
    const board: NailBoard = { ...EMPTY_BOARD, now: "2026-10-12T10:05:00.000Z" };
    expect(overlayBoard(board, [ticket({ id: -1 })]).tickets).toHaveLength(1);
  });

  it("drops a confirmed check-in once the server's board no longer lists it (it became a ticket)", () => {
    const w: WalkinRecord = { kind: "walkin", id: -2, storeId: 1, clientId: 9, clientName: "Bea", phone: null, status: "waiting",
      realId: 70, synced: true, syncedAt: "2026-10-12T10:00:00.000Z", createdAt: "2026-10-12T09:50:00.000Z" };
    expect(overlayBoard({ ...EMPTY_BOARD, now: "2026-10-12T10:05:00.000Z" }, [w]).markers).toHaveLength(0);
    expect(overlayBoard({ ...EMPTY_BOARD, now: "2026-10-12T09:59:00.000Z" }, [w]).markers).toHaveLength(1);
  });
});
