import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

const state = vi.hoisted(() => ({
  query: vi.fn(), createCustomer: vi.fn(),
  bookings: [] as Record<string, any>[], customers: [] as Record<string, any>[], ownStaff: null as number | null,
}));
vi.mock("../db", () => ({ pool: { query: state.query } }));
vi.mock("../storage", () => ({ storage: { createCustomer: state.createCustomer } }));
vi.mock("../auth", () => ({ isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock("../lib/sessionStore", () => ({ resolveSessionStoreId: async () => 7 }));
vi.mock("../lib/soloAuth", () => ({ verifySoloToken: () => ({ userId: "owner", type: "solo" }) }));

import router from "./certxaPro";

const date = "2026-09-29T16:00:00.000Z";
const customer = { id: 1, name: "Jane Smith", fullName: "Jane Smith", firstName: "Jane", lastName: "Smith", phone: "555-0100", email: "jane@example.com", notes: "Afternoons" };
const service = { id: 2, name: "Classic", duration: 90, price: 120 };
let server: Server;
let base: string;

async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`${base}/api${path}`, {
    method, headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}

beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use("/api", router);
  server = await new Promise(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); });
beforeEach(() => {
  state.bookings.length = 0; state.customers.length = 0; state.ownStaff = null;
  state.customers.push(customer);
  state.createCustomer.mockReset().mockImplementation(async () => ({ id: 1 }));
  state.query.mockReset().mockImplementation(async (sql: string, values: any[]) => {
    if (sql.includes("FROM users u JOIN staff s")) return { rows: state.ownStaff ? [{ id: state.ownStaff }] : [] };
    if (sql.includes("FROM calendar_settings")) return { rows: [] };
    if (sql.includes("FROM appointments o")) {
      const from = Date.parse(values[3]); const to = Date.parse(values[4]);
      return { rows: state.bookings.filter(b => b.id !== values[2] && b.status !== "cancelled" && (b.staffId ?? null) === values[1]
        && Date.parse(b.date) < to && Date.parse(b.date) + b.duration * 60000 > from).map(() => ({})) };
    }
    if (sql.includes("FROM clients c WHERE c.id=$1")) return { rows: state.customers.filter(c => c.id === values[0]) };
    if (sql.includes("FROM clients c WHERE c.store_id=$1")) return { rows: state.customers };
    if (sql.includes("FROM services WHERE store_id=$1")) return { rows: [service] };
    if (sql.includes("SELECT id FROM services")) return { rows: values[0] === service.id ? [service] : [] };
    if (sql.includes("INSERT INTO appointments")) {
      if (values[0] !== customer.id || values[1] !== service.id) return { rows: [] };
      state.bookings.push({ id: 10 + state.bookings.length, staffId: values[6] ?? null, date: values[4], duration: values[3], notes: values[5], status: "pending", customer, service, cancelledAt: null, cancellationReason: null });
      return { rows: [{ id: state.bookings[state.bookings.length - 1].id }] };
    }
    if (sql.includes("UPDATE appointments SET status='cancelled'")) {
      const row = state.bookings.find(b => b.id === values[0] && b.status !== "cancelled");
      if (row) { row.status = "cancelled"; row.cancelledAt = date; row.cancellationReason = values[2]; }
      return { rows: row ? [{ id: row.id }] : [] };
    }
    if (sql.includes("UPDATE appointments SET")) {
      const row = state.bookings.find(b => b.id === values[0]);
      if (!row) return { rows: [] };
      const matches = [...sql.matchAll(/(date|service_id|duration|status|notes)=\$(\d+)/g)];
      for (const match of matches) {
        const field = match[1] === "service_id" ? "serviceId" : match[1];
        row[field] = values[Number(match[2]) - 1];
      }
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("FROM appointments a")) {
      const rows = state.bookings.filter(b => sql.includes("a.id=$1") ? b.id === values[0] :
        (!values[1] || b.date >= values[1]) && (!values[2] || b.date <= values[2]));
      return { rows };
    }
    throw new Error("Unrecognized test query");
  });
});

describe("Certxa Pro API", () => {
  const create = { customerId: 1, serviceId: 2, duration: 90, date };
  it("creates and lists customers and services", async () => {
    expect((await request("/customers")).body[0]).toMatchObject({ name: "Jane Smith" });
    expect((await request("/services")).body[0]).toEqual(service);
    const result = await request("/customers", "POST", { name: "Jane Smith", email: "jane@example.com" });
    expect(result.status).toBe(201);
    expect(result.body.fullName).toBe("Jane Smith");
    expect(state.createCustomer).toHaveBeenCalledWith(expect.objectContaining({ storeId: 7 }));
  });
  it("creates, lists by inclusive date range, and updates an appointment", async () => {
    const created = await request("/appointments", "POST", create);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: "pending", customer, service });
    expect((await request(`/appointments?from=${date}&to=${date}`)).body).toHaveLength(1);
    expect((await request("/appointments?from=2026-09-30T00:00:00.000Z")).body).toHaveLength(0);
    const updated = await request("/appointments/10", "PATCH", { status: "confirmed", notes: "Updated" });
    expect(updated.body).toMatchObject({ status: "confirmed", notes: "Updated" });
  });
  it("refuses a booking, or a move, onto a time that is already taken", async () => {
    state.ownStaff = 5;
    expect((await request("/appointments", "POST", create)).status).toBe(201);
    // 16:00 for 90 minutes is taken: 17:00 overlaps it, 17:30 does not.
    const clash = await request("/appointments", "POST", { ...create, date: "2026-09-29T17:00:00.000Z" });
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe("TIME_TAKEN");
    expect((await request("/appointments", "POST", { ...create, date: "2026-09-29T17:30:00.000Z", staffId: 99, customLines: [{ label: "Extra", price: 10 }] })).status).toBe(201);
    expect(state.bookings.map(b => b.staffId)).toEqual([5, 5]);
    // Moving the second one back onto the first is refused; an edit that leaves the time alone is not.
    expect((await request("/appointments/11", "PATCH", { date: "2026-09-29T16:30:00.000Z", checkConflicts: true })).status).toBe(409);
    expect((await request("/appointments/11", "PATCH", { status: "confirmed" })).status).toBe(200);
    expect((await request("/appointments/11", "PATCH", { date: "2026-09-29T19:00:00.000Z", checkConflicts: true })).status).toBe(200);
  });
  it("soft cancels idempotently, retaining original booking and reason", async () => {
    await request("/appointments", "POST", create);
    const first = await request("/appointments/10/cancel", "POST", { notifyClient: true, reason: "Requested" });
    expect(first.body.notification).toEqual({ requested: true, status: "not_configured" });
    expect(first.body.appointment).toMatchObject({ date, status: "cancelled", cancellationReason: "Requested" });
    const second = await request("/appointments/10/cancel", "POST", { reason: "Different" });
    expect(second.body.appointment.cancellationReason).toBe("Requested");
    expect((await request(`/appointments?from=${date}&to=${date}`)).body[0].status).toBe("cancelled");
    expect((await request("/appointments/10", "PATCH", { status: "paid" })).status).toBe(409);
    expect((await request("/appointments/10", "PATCH", { status: "started" })).status).toBe(409);
    expect((await request("/appointments/10", "PATCH", { status: "confirmed" })).status).toBe(409);
    expect((await request("/appointments/10", "PATCH", { date })).status).toBe(409);
  });
  it("rejects invalid customers, services, dates, durations and statuses", async () => {
    expect((await request("/customers", "POST", { name: "  " })).status).toBe(400);
    expect((await request("/customers", "POST", { name: "Jane", email: "bad" })).status).toBe(400);
    expect((await request("/appointments", "POST", { ...create, customerId: 99 })).status).toBe(400);
    expect((await request("/appointments", "POST", { ...create, serviceId: 99 })).status).toBe(400);
    expect((await request("/appointments", "POST", { ...create, date: "yesterday" })).status).toBe(400);
    expect((await request("/appointments", "POST", { ...create, duration: -1 })).status).toBe(400);
    expect((await request("/appointments?from=garbage")).status).toBe(400);
    expect((await request("/appointments/10", "PATCH", { status: "bogus" })).status).toBe(400);
    expect((await request("/appointments/10", "PATCH", { serviceId: 99 })).status).toBe(404);
    expect((await request("/appointments/10/cancel", "POST", {})).status).toBe(404);
  });
  it("rejects a nonexistent service on an existing booking", async () => {
    await request("/appointments", "POST", create);
    expect((await request("/appointments/10", "PATCH", { serviceId: 99 })).status).toBe(400);
  });
});
