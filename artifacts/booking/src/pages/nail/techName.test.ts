import { afterEach, describe, expect, it } from "vitest";
import { setTechRoster, techLabel, techLabels } from "./techName";

describe("technician names on /nail", () => {
  afterEach(() => setTechRoster(null));

  it("first name only when it is the only one in the salon", () => {
    expect(techLabels([{ id: 1, name: "Lisa Nguyen" }, { id: 2, name: "Kim Tran" }])).toEqual(new Map([[1, "Lisa"], [2, "Kim"]]));
  });

  it("adds the last initial when two share a first name", () => {
    const l = techLabels([{ id: 1, name: "Lisa Nguyen" }, { id: 2, name: "Lisa Pham" }, { id: 3, name: "Kim" }]);
    expect([l.get(1), l.get(2), l.get(3)]).toEqual(["Lisa N.", "Lisa P.", "Kim"]);
  });

  it("A, B when there is no last name to tell them apart", () => {
    const l = techLabels([{ id: 5, name: "Lisa" }, { id: 2, name: "Lisa" }, { id: 9, name: "Lisa Pham" }]);
    expect([l.get(2), l.get(5), l.get(9)]).toEqual(["Lisa A", "Lisa B", "Lisa P."]);
  });

  it("A, B when the last initials are the same too", () => {
    const l = techLabels([{ id: 1, name: "Lisa Nguyen" }, { id: 2, name: "Lisa Ngo" }]);
    expect([l.get(1), l.get(2)]).toEqual(["Lisa A", "Lisa B"]);
  });

  it("techLabel by id or by name; unchanged with no roster", () => {
    expect(techLabel("Lisa Nguyen")).toBe("Lisa Nguyen");
    setTechRoster([{ id: 1, name: "Lisa Nguyen" }, { id: 2, name: "Lisa Pham" }, { id: 3, name: "Kim Tran" }]);
    expect(techLabel("Lisa Pham")).toBe("Lisa P.");
    expect(techLabel("whatever", 3)).toBe("Kim");
    expect(techLabel("Kim Tran")).toBe("Kim");
    expect(techLabel("Anna Le")).toBe("Anna");
    expect(techLabel("Lisa Vo")).toBe("Lisa Vo");
    expect(techLabel(null)).toBe("");
  });
});
