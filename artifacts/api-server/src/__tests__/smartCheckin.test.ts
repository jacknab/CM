import { describe, it, expect, vi } from "vitest";
vi.mock("../db", () => ({ pool: {}, db: {} }));
import { classifyService, recommend, type CatalogService, type VisitRow } from "../lib/smartCheckin";

const catalog: CatalogService[] = [
  { id: 1, name: "Full Set Acrylics", category: "Acrylic Nails", price: 50, duration: 60 },
  { id: 2, name: "Acrylic Fill", category: "Acrylic Nails", price: 35, duration: 45 },
  { id: 3, name: "Pink & White Full Set", category: "Acrylic Nails", price: 65, duration: 75 },
  { id: 4, name: "Pink & White Fill", category: "Acrylic Nails", price: 45, duration: 60 },
  { id: 5, name: "Basic Manicure", category: "Manicures", price: 20, duration: 30 },
  { id: 6, name: "Deluxe Pedicure", category: "Pedicures", price: 45, duration: 50 },
  { id: 7, name: "Gel X Fill", category: "Gel X", price: 40, duration: 45 },
  { id: 8, name: "Gel X with Nail Art", category: "Gel X", price: 70, duration: 80 },
  { id: 9, name: "Acrylic Removal", category: "Acrylic Nails", price: 15, duration: 20 },
];
const visit = (serviceId: number, daysAgo: number): VisitRow => {
  const s = catalog.find((c) => c.id === serviceId)!;
  return { serviceId, serviceName: s.name, category: s.category, daysAgo };
};

describe("classifyService", () => {
  it("tells sets, fills, manicures, pedicures and removals apart", () => {
    expect(classifyService("Full Set Acrylics", "Acrylic Nails")).toEqual({ family: "acrylic", role: "full_set" });
    expect(classifyService("Acrylic Fill", "Acrylic Nails")).toEqual({ family: "acrylic", role: "fill" });
    expect(classifyService("Pink & White Fill", "Acrylic Nails")).toEqual({ family: "acrylic", role: "fill" });
    expect(classifyService("Gel X with Nail Art", "Gel X")).toEqual({ family: "gelx", role: "full_set" });
    expect(classifyService("Dip Powder Manicure", "Dip Powder")).toEqual({ family: "dip", role: "manicure" });
    expect(classifyService("Hard Gel Full Set", "Gel Nails")).toEqual({ family: "gel", role: "full_set" });
    expect(classifyService("Basic Manicure", "Manicures")).toEqual({ family: "polish", role: "manicure" });
    expect(classifyService("Spa Pedicure", "Pedicures")).toEqual({ family: "pedicure", role: "pedicure" });
    expect(classifyService("Acrylic Removal", "Acrylic Nails").role).toBe("removal");
    expect(classifyService("Eyebrow Wax", "Waxing")).toEqual({ family: "other", role: "other" });
  });
});

describe("recommend", () => {
  it("suggests a fill 21 days after a full set", () => {
    const r = recommend([visit(1, 21)], catalog)!;
    expect(r.kind).toBe("refill");
    expect(r.serviceIds).toEqual([2]);
    expect(r.basedOn).toEqual({ serviceName: "Full Set Acrylics", daysAgo: 21 });
  });
  it("matches the fill to the same line", () => {
    expect(recommend([visit(3, 20)], catalog)!.serviceIds).toEqual([4]);
  });
  it("asks fill-or-new-set once the fill window has passed, and never assumes", () => {
    const r = recommend([visit(1, 45)], catalog)!;
    expect(r.kind).toBe("choice");
    expect(r.serviceIds).toEqual([2, 1]);
  });
  it("says nothing a few days after a set, or long after", () => {
    expect(recommend([visit(1, 3)], catalog)).toBeNull();
    expect(recommend([visit(1, 90)], catalog)).toBeNull();
  });
  it("offers the same manicure or pedicure again inside its window", () => {
    expect(recommend([visit(5, 20)], catalog)).toMatchObject({ kind: "again", serviceIds: [5] });
    expect(recommend([visit(6, 30)], catalog)).toMatchObject({ kind: "again", serviceIds: [6] });
  });
  it("never suggests a removal", () => {
    expect(recommend([visit(9, 20), visit(9, 50)], catalog)).toBeNull();
  });
  it("keeps the acrylic set in mind when the latest visit was something else", () => {
    // Pedicure 2 days ago (nothing due), acrylic set 21 days ago → still the fill.
    expect(recommend([visit(6, 2), visit(1, 21)], catalog)).toMatchObject({ kind: "refill", serviceIds: [2] });
  });
  it("falls back to the client's usual service when nothing is due", () => {
    expect(recommend([visit(5, 60), visit(5, 80), visit(6, 100)], catalog)).toMatchObject({ kind: "usual", serviceIds: [5] });
  });
  it("only suggests services still in the catalog", () => {
    expect(recommend([visit(1, 21)], catalog.filter((s) => s.id !== 2 && s.id !== 4))).toBeNull();
    expect(recommend([], catalog)).toBeNull();
  });
});
