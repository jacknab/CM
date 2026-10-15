import { describe, expect, it, vi } from "vitest";
vi.mock("@/components/layout/AppLayout", () => ({ AppLayout: () => null }));
import { placeAnswer } from "./AiReceptionistInstructions";

const Q = "Do you take walk-ins?";
describe("answers placed into the instructions box", () => {
  it("adds an answer at the end, after what the owner already wrote", () => {
    expect(placeAnswer("We are a family salon.", Q, undefined, "Yes, until 6 PM")).toBe("We are a family salon.\n\nDo you take walk-ins?\nYes, until 6 PM");
  });
  it("answering again replaces the earlier answer in place", () => {
    const text = "Intro\n\nDo you take walk-ins?\nYes, until 6 PM\n\nOther notes";
    expect(placeAnswer(text, Q, "Yes, until 6 PM", "Yes, until 7 PM")).toBe("Intro\n\nDo you take walk-ins?\nYes, until 7 PM\n\nOther notes");
  });
  it("clearing an answer removes its block", () => {
    expect(placeAnswer("Intro\n\nDo you take walk-ins?\nYes\n\nOther", Q, "Yes", "")).toBe("Intro\n\nOther");
  });
  it("an answer the owner rewrote in the box is left alone; the new one is added", () => {
    expect(placeAnswer("Walk-ins welcome any time", Q, "Yes", "No")).toBe("Walk-ins welcome any time\n\nDo you take walk-ins?\nNo");
  });
  it("a blank answer adds nothing", () => {
    expect(placeAnswer("Intro", Q, undefined, "  ")).toBe("Intro");
  });
});
