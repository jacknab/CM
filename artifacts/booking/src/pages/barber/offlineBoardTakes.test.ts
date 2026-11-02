import { describe, it, expect } from "vitest";
import type { LocalRecord } from "@/lib/nail-offline/engine";
import { overlayBoard } from "./offlineBoard";
import type { NailBoard } from "./barberApi";

const marker = (id: number, name: string) => ({ id, ticketNumber: id, clientId: 50, clientName: name, phone: null, createdAt: "2026-11-02T15:00:00.000Z", staffId: null, staffName: null });
const board = (now: string): NailBoard => ({ tickets: [], markers: [marker(700, "Ana")], dayBookings: [], techStats: [], now });
const leo = { id: 9, name: "Leo Park", color: null };

describe("the /barber board with clients taken on this tablet", () => {
  it("shows a client taken offline as with that barber", () => {
    const recs: LocalRecord[] = [{ kind: "take", id: -1, storeId: 38, markerId: 700, clientName: "Ana", staff: leo, createdAt: "2026-11-02T15:05:00.000Z" }];
    expect(overlayBoard(board("2026-11-02T15:00:00.000Z"), recs).markers[0]).toMatchObject({ staffId: 9, staffName: "Leo Park", offline: true });
  });

  it("shows a walk-in checked in and taken offline, before and after the walk-in reached the server", () => {
    const walkin: LocalRecord = { kind: "walkin", id: -2, storeId: 38, clientId: 51, clientName: "Bo", phone: null, status: "waiting", createdAt: "2026-11-02T15:01:00.000Z", ticketNumber: 14 };
    const take: LocalRecord = { kind: "take", id: -3, storeId: 38, markerId: -2, clientName: "Bo", staff: leo, createdAt: "2026-11-02T15:02:00.000Z" };
    const offline = overlayBoard(null, [walkin, take]);
    expect(offline.markers).toEqual([expect.objectContaining({ id: -2, clientName: "Bo", staffId: 9 })]);

    // The walk-in reached the server (id 801) and is on its board; the take hasn't been sent yet.
    const sent = { ...walkin, realId: 801, synced: true, syncedAt: "2026-11-02T15:03:00.000Z" } as LocalRecord;
    const b = { ...board("2026-11-02T15:04:00.000Z"), markers: [marker(801, "Bo")] };
    expect(overlayBoard(b, [sent, take]).markers).toEqual([expect.objectContaining({ id: 801, staffId: 9 })]);
  });

  it("leaves it to the server's board once a board newer than the confirmation arrives", () => {
    const recs: LocalRecord[] = [{ kind: "take", id: -1, storeId: 38, markerId: 700, clientName: "Ana", staff: leo, createdAt: "2026-11-02T15:05:00.000Z", syncedAt: "2026-11-02T15:06:00.000Z" }];
    // The server says Ana is waiting again (the barber put her back): the device no longer overrides it.
    expect(overlayBoard(board("2026-11-02T15:07:00.000Z"), recs).markers[0]).toMatchObject({ staffId: null });
  });
});
