import { describe, expect, it } from "vitest";
import { quickNameProblem } from "./quickName";

describe("Quick Check-in name", () => {
  it("refuses keyboard mash", () => {
    for (const n of ["mmm", "mmw", "wmw", "wmm", "Mmm", "aaa", "xx", "", "  ", "m m m"]) expect(quickNameProblem(n)).not.toBeNull();
  });
  it("takes real names, short ones too", () => {
    for (const n of ["Bob", "Ann", "Lee", "Mai Tran", "Nguyen", "Lynn", "Ty Do"]) expect(quickNameProblem(n)).toBeNull();
  });
});
