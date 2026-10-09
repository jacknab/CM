import { describe, expect, it } from "vitest";
import { checkinCategories, type CatalogCategory, type CheckinService } from "./ServiceCheckin";

const svc = (id: number, name: string, categoryId: number | null, category: string | null = null): CheckinService => ({ id, name, categoryId, category, price: 30, duration: 30 });
const MANI: CatalogCategory = { id: 1, name: "Manicures", imageUrl: "mani.webp" };
const PEDI: CatalogCategory = { id: 2, name: "Pedicures", imageUrl: "pedi.webp" };
const WAX: CatalogCategory = { id: 3, name: "Waxing", imageUrl: null };

describe("front desk check-in category cards", () => {
  it("shows one card per catalog category that has a service, in catalog order, with its own name and photo", () => {
    const cards = checkinCategories([svc(10, "Spa Pedicure", 2), svc(11, "Classic Manicure", 1), svc(12, "Gel Manicure", 1)], [MANI, PEDI]);
    expect(cards.map((c) => c.label)).toEqual(["Manicures", "Pedicures"]);
    expect(cards.map((c) => c.imageUrl)).toEqual(["mani.webp", "pedi.webp"]);
    expect(cards[0].services.map((s) => s.id)).toEqual([11, 12]);
  });

  it("adds a Waxing card only when the salon has an active waxing service", () => {
    const base = [svc(11, "Classic Manicure", 1), svc(10, "Spa Pedicure", 2)];
    // the category exists but has no active service → no card
    expect(checkinCategories(base, [MANI, PEDI, WAX]).map((c) => c.label)).toEqual(["Manicures", "Pedicures"]);
    expect(checkinCategories([...base, svc(13, "Eyebrow Wax", 3)], [MANI, PEDI, WAX]).map((c) => c.label)).toEqual(["Manicures", "Pedicures", "Waxing"]);
  });

  it("drops a category the salon has hidden from clients (it is not in the catalog list it is given)", () => {
    // hidden categories and their services are removed by the server before this runs
    expect(checkinCategories([svc(11, "Classic Manicure", 1)], [MANI]).map((c) => c.label)).toEqual(["Manicures"]);
  });

  it("uses the catalog's name for the card even when a service carries older category text", () => {
    const cards = checkinCategories([svc(20, "Acrylic Fill", 4, "Acrylic Nails")], [{ id: 4, name: "Acrylics", imageUrl: "acrylics.webp" }]);
    expect(cards).toHaveLength(1);
    expect(cards[0].label).toBe("Acrylics");
    expect(cards[0].imageUrl).toBe("acrylics.webp");
  });

  it("supports any further category, and groups services with no catalog category by their own text", () => {
    const cards = checkinCategories(
      [svc(11, "Classic Manicure", 1), svc(30, "Lash Lift", null, "Lashes"), svc(31, "Polish Change", null, null), svc(32, "Nail Repair", null, "  ")],
      [MANI], { Lashes: "lashes.webp" });
    expect(cards.map((c) => c.label)).toEqual(["Manicures", "Lashes", "Other services"]);
    expect(cards[1].imageUrl).toBe("lashes.webp");
    expect(cards[2].services.map((s) => s.id)).toEqual([31, 32]);
  });

  it("shows no cards when the salon has no client-visible services", () => {
    expect(checkinCategories([], [MANI, PEDI])).toEqual([]);
  });
});
