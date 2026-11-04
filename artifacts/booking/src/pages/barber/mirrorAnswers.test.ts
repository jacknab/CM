import { describe, it, expect, vi } from "vitest";
import { normalizeNailConfig } from "./barberTicketDraft";

// A salon's copy: rows as the server stores them.
const H = 3_600_000;
const soon = (h: number) => new Date(Date.now() + h * H).toISOString();
const copy: Record<string, any[]> = {
  clients: [{ id: 1, full_name: "Ana Lee", loyalty_points: 320, allergies: "Acetone" }, { id: 2, full_name: "Gone", archived_at: "2026-01-01" }],
  client_phones: [{ id: 1, client_id: 1, phone_number_e164: "+15205551234", display_phone: "(520) 555-1234", is_primary: true },
    { id: 2, client_id: 2, phone_number_e164: "+15205550000", is_primary: true }],
  client_emails: [{ id: 1, client_id: 1, email_address: "ana@x.com", is_primary: true }],
  services: [{ id: 5, name: "Gel Manicure", price: "35.00" }, { id: 6, name: "Skin Fade", price: "30.00" }, { id: 7, name: "Old", price: "9.00", is_active: false }],
  staff: [{ id: 9, name: "Tom", pricing_level_id: 1 }, { id: 10, name: "Ann", pricing_level_id: 2 }, { id: 11, name: "Gone", status: "removed" }],
  staff_services: [{ id: 1, staff_id: 9, service_id: 5, price_override: null }, { id: 2, staff_id: 9, service_id: 6, price_override: "44.00" },
    { id: 3, staff_id: 10, service_id: 6, price_override: null }, { id: 4, staff_id: 9, service_id: 7 }, { id: 5, staff_id: 11, service_id: 6 }],
  pricing_levels: [{ id: 1, name: "Master", is_active: true }, { id: 2, name: "Retired level", is_active: false }],
  service_level_prices: [{ id: 1, pricing_level_id: 1, service_id: 5, price: "50.00" }, { id: 2, pricing_level_id: 2, service_id: 6, price: "99.00" }],
  nail_service_configs: [{ id: 1, service_id: 5, is_enabled: true, length_required: true, shape_required: false, art_required: false }],
  service_nail_sizes: [{ id: 11, service_id: 5, nail_size_id: 100, price_adjustment: "5.00", duration_adjustment: 10, is_default: true, is_enabled: true, sort_order: 1 }],
  nail_sizes: [{ id: 100, name: "Long" }],
  service_nail_shapes: [], service_nail_art_applications: [], service_nail_art_effects: [],
  appointments: [
    // Booked for tomorrow, made last week: upcoming.
    { id: 20, customer_id: 1, service_id: 5, staff_id: 9, status: "pending", date: soon(24), created_at: soon(-24 * 7), ticket_number: 70 },
    // A walk-in (made at its own time): not on the list.
    { id: 21, customer_id: 1, service_id: 5, status: "confirmed", date: soon(1), created_at: soon(1), ticket_number: 71 },
    // Already arrived, and a past visit: not on the list.
    { id: 22, customer_id: 1, status: "confirmed", date: soon(2), created_at: soon(-48), checked_in_at: soon(0) },
    { id: 23, customer_id: 1, status: "pending", date: soon(-48), created_at: soon(-100) },
  ],
};
vi.mock("@/lib/salon-mirror", () => ({
  hasSalonMirror: async () => true,
  mirrorAll: async (_s: number, t: string) => copy[t] ?? [],
  mirrorGet: async (_s: number, t: string, id: any) => (copy[t] ?? []).find((r) => String(r.id) === String(id)) ?? null,
  mirrorFind: async (_s: number, t: string, f: string, v: any) => (copy[t] ?? []).filter((r) => r[f] === v),
}));
const { answerFromMirror, mirrorClientIdByPhone } = await import("./mirrorAnswers");

describe("offline answers from the salon's copy", () => {
  it("find a client by phone, never an archived one", async () => {
    expect(await mirrorClientIdByPhone(2, "5205551234")).toBe(1);
    expect(await mirrorClientIdByPhone(2, "5205550000")).toBeNull();
  });

  it("give a client with their points, email and allergies", async () => {
    expect(await answerFromMirror(2, "/api/customers/1")).toMatchObject({ id: 1, name: "Ana Lee", loyaltyPoints: 320, email: "ana@x.com", allergies: "Acetone", phone: "(520) 555-1234" });
  });

  it("give a service's nail options in the shape the ticket screen reads", async () => {
    const cfg = normalizeNailConfig(await answerFromMirror(2, "/api/services/5/nail-config"));
    expect(cfg).toMatchObject({ lengthRequired: true, sizes: [{ id: 100, name: "Long", priceAdjustment: 5, durationAdjustment: 10, isDefault: true }] });
  });

  it("list upcoming bookings, not walk-ins, arrivals or past visits", async () => {
    const list = (await answerFromMirror(2, "/api/barber/upcoming")) as any[];
    expect(list.map((b) => b.id)).toEqual([20]);
    expect(list[0]).toMatchObject({ clientName: "Ana Lee", serviceName: "Gel Manicure", staffName: "Tom", ticketNumber: 70 });
  });

  it("leave other reads to what the tablet saved", async () => {
    expect(await answerFromMirror(2, "/api/barber/board")).toBeUndefined();
  });

  it("price each barber's services offline as the server does: own price, else their level's, else the standard price", async () => {
    const r = await answerFromMirror(2, "/api/public/store/floyds/pro-pricing") as { prices: unknown[] };
    expect(r.prices).toEqual([
      { staffId: 9, serviceId: 5, price: 50 },   // the Master level's price
      { staffId: 9, serviceId: 6, price: 44 },   // Tom's own price wins over the level
      { staffId: 10, serviceId: 6, price: 30 },  // an inactive level: the standard price
    ]);
  });
});
