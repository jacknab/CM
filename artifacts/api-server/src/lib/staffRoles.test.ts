import { describe, expect, it } from "vitest";
import { defaultRole, defaultTakesTurns, displayRole, rolesForBusinessType } from "@shared/staffRoles";

describe("staff roles per business type", () => {
  it("offers each business type its own roles, main service role first", () => {
    expect(rolesForBusinessType("Nail Salon")).toEqual(["Nail Technician", "Front Desk", "Manager"]);
    expect(rolesForBusinessType("Barbershop")).toEqual(["Barber", "Front Desk", "Manager"]);
    expect(rolesForBusinessType("Hair Salon")).toEqual(["Stylist", "Colorist", "Front Desk", "Manager"]);
    expect(rolesForBusinessType("Spa")[0]).toBe("Massage Therapist");
    expect(rolesForBusinessType("Tattoo Studio")[0]).toBe("Tattoo Artist");
    expect(rolesForBusinessType(null)).toEqual(["Service Provider", "Front Desk", "Manager"]);
    expect(defaultRole("Nail Salon")).toBe("Nail Technician");
  });

  it("keeps front desk out of the turn line by default, everyone else in", () => {
    expect(defaultTakesTurns("Front Desk")).toBe(false);
    expect(defaultTakesTurns("Nail Technician")).toBe(true);
    expect(defaultTakesTurns("Manager")).toBe(true);
  });

  it("shows the old built-in values as the business type's titles", () => {
    expect(displayRole("stylist", "Nail Salon")).toBe("Nail Technician");
    expect(displayRole("staff", "Barbershop")).toBe("Barber");
    expect(displayRole("manager", "Nail Salon")).toBe("Manager");
    expect(displayRole("receptionist", "Nail Salon")).toBe("Front Desk");
    expect(displayRole("Wax Specialist", "Nail Salon")).toBe("Wax Specialist");
    expect(displayRole(null, "Hair Salon")).toBe("Stylist");
  });
});
