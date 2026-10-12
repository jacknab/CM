import { describe, it, expect } from "vitest";
import { commonTechnician } from "./nailTickets";

describe("one technician for a visit of several services", () => {
  it("picks the first in turn order who can do every service", () => {
    // Turn order for the manicure is 7, 3, 9; only 3 and 9 can also take the pedicure.
    expect(commonTechnician([[7, 3, 9], [9, 3]])).toBe(3);
  });

  it("is the next in line when the visit has one service", () => {
    expect(commonTechnician([[4, 2]])).toBe(4);
  });

  it("finds nobody when no one can do all of them", () => {
    expect(commonTechnician([[1, 2], [3]])).toBeNull();
    expect(commonTechnician([[], [3]])).toBeNull();
    expect(commonTechnician([])).toBeNull();
  });

  it("needs the technician to be eligible for all three of three services", () => {
    expect(commonTechnician([[1, 2, 3], [2, 3], [3, 1]])).toBe(3);
  });
});
