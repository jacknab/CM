import { describe, expect, test, vi } from "vitest";
vi.mock("../db", () => ({ db: {}, pool: {} }));
import { ownerInstructionsBlock } from "../routes/aiReceptionist";

describe("owner's instructions given to Autumn on every call", () => {
  test("nothing written: no section", () => {
    expect(ownerInstructionsBlock("")).toBe("");
    expect(ownerInstructionsBlock("   ")).toBe("");
    expect(ownerInstructionsBlock(null)).toBe("");
  });
  test("the owner's text, fenced, under rules that keep the booking rules on top", () => {
    const block = ownerInstructionsBlock("  Walk-ins welcome until 6 PM.  ");
    expect(block).toContain("OWNER'S INSTRUCTIONS");
    expect(block).toContain('"""\nWalk-ins welcome until 6 PM.\n"""');
    expect(block).toMatch(/never override the booking rules/);
  });
});
