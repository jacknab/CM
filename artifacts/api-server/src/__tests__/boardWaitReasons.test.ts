import { describe, expect, it } from "vitest";
import { boardWaitReasons, type BoardTicket, type BoardWaitingMarker, type TechDayStats } from "../lib/nailTickets";

const T0 = Date.parse("2026-10-29T15:00:00Z");
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();

const ticket = (id: number, over: Partial<BoardTicket> = {}): BoardTicket => ({
  id, ticketNumber: id, status: "confirmed", date: at(0), checkedInAt: at(0), startedAt: null, duration: 30,
  client: { id: 100 + id, name: `Client ${id}`, phone: null, loyaltyPoints: 0 }, service: { id: 1, name: "Manicure", price: 25 },
  addons: [], nail: null, customLines: [], staff: null, total: 25, ...over,
} as BoardTicket);
const lan = { id: 1, name: "Lan", color: null };
const kim = { id: 2, name: "Kim", color: null };
const stats = (entries: Partial<TechDayStats>[]) =>
  new Map(entries.map((e) => [e.staffId!, { doneToday: 0, lastFinishedAt: null, clockedInAt: null, ...e } as TechDayStats]));

describe("why a waiting ticket hasn't started", () => {
  it("assigned to a free technician: tech_free, timed from the later of assignment and their last client", () => {
    const t = ticket(1, { staff: lan, staffAssignedAt: at(2) });
    boardWaitReasons([t], [], stats([{ staffId: 1, clockedInAt: at(-60), lastFinishedAt: at(4) }]), new Set([1]));
    expect(t.wait).toMatchObject({ code: "tech_free", since: at(4), orangeMin: 5, redMin: 10 });
  });

  it("assigned to a technician who isn't clocked in: clocked_out, red at once", () => {
    const t = ticket(1, { staff: lan, staffAssignedAt: at(1) });
    boardWaitReasons([t], [], stats([]), new Set([1]));
    expect(t.wait).toMatchObject({ code: "clocked_out", orangeMin: 0, redMin: 0 });
  });

  it("assigned to a busy technician: running_over from when their current service should have ended", () => {
    const busy = ticket(7, { status: "started", startedAt: at(0), duration: 30, staff: lan });
    const t = ticket(8, { staff: lan, staffAssignedAt: at(1) });
    boardWaitReasons([busy, t], [], stats([{ staffId: 1, clockedInAt: at(-60) }]), new Set([1]));
    expect(t.wait).toMatchObject({ code: "running_over", since: at(45), ticket: 7 });
  });

  it("nobody has it while a technician is free: unassigned_free; every technician busy: long_wait", () => {
    const busy = ticket(7, { status: "started", startedAt: at(0), staff: lan });
    const t = ticket(9, { checkedInAt: at(3) });
    boardWaitReasons([busy, t], [], stats([{ staffId: 1, clockedInAt: at(-60) }, { staffId: 2, clockedInAt: at(-60) }]), new Set([1, 2]));
    expect(t.wait).toMatchObject({ code: "unassigned_free", since: at(3) });
    const t2 = ticket(10);
    boardWaitReasons([busy, t2], [], stats([{ staffId: 1, clockedInAt: at(-60) }]), new Set([1]));
    expect(t2.wait).toMatchObject({ code: "long_wait", orangeMin: 30, redMin: 45 });
  });

  it("a technician who doesn't take turns isn't counted as free", () => {
    const t = ticket(9);
    boardWaitReasons([t], [], stats([{ staffId: 2, clockedInAt: at(-60) }]), new Set([1]));
    expect(t.wait?.code).toBe("long_wait");
  });

  it("being rung up and never saved: not_saved", () => {
    const t = ticket(1, { ringingUp: true, ringingUpSince: at(6) });
    boardWaitReasons([t], [], stats([]), new Set());
    expect(t.wait).toMatchObject({ code: "not_saved", since: at(6) });
  });

  it("a normal wait gets nothing: client in a chair on another ticket, or the visit's first service not done", () => {
    const inChair = ticket(1, { status: "started", startedAt: at(0), staff: kim, client: { id: 500, name: "A", phone: null, loyaltyPoints: 0 } });
    const second = ticket(2, { staff: lan, client: { id: 500, name: "A", phone: null, loyaltyPoints: 0 } });
    const follow = ticket(3, { waitsForTicket: 1 });
    boardWaitReasons([inChair, second, follow], [], stats([{ staffId: 1, clockedInAt: at(-60) }]), new Set([1, 2]));
    expect(second.wait).toBeUndefined();
    expect(follow.wait).toBeUndefined();
  });

  it("a kiosk check-in with no ticket yet is watched too", () => {
    const m = { id: 1, ticketNumber: 4, clientId: null, clientName: "Walk", phone: null, createdAt: at(1), staffId: null, staffName: null,
      requestedCategory: null, requestedCategoryId: null } as BoardWaitingMarker;
    boardWaitReasons([], [m], stats([{ staffId: 1, clockedInAt: at(-60) }]), new Set([1]));
    expect(m.wait).toMatchObject({ code: "unassigned_free", since: at(1) });
  });

  it("in the chair: past the service's time without DONE, and DONE but not paid", () => {
    const over = ticket(1, { status: "started", startedAt: at(0), duration: 45, staff: lan });
    const done = ticket(2, { status: "started", startedAt: at(0), doneAt: at(50), staff: kim });
    boardWaitReasons([over, done], [], stats([{ staffId: 1, clockedInAt: at(-60) }]), new Set([1, 2]));
    expect(over.wait).toMatchObject({ code: "service_over", since: at(45), orangeMin: 15, redMin: 30 });
    expect(done.wait).toMatchObject({ code: "done_unpaid", since: at(50), orangeMin: 10, redMin: 20 });
  });
});
