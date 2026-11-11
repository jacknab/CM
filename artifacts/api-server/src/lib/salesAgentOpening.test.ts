import { describe, expect, it } from "vitest";
import { SHAVEZ_SALES_AGENT, TOM_SALES_AGENT } from "./salesAgentProfiles";
import { salesAgentConnectionOpening, tomOpeningInstructions, TOM_SALES_DISCOVERY } from "./salesAgentOpening";

describe("TOM's immediate acknowledgement and guided sales opening", () => {
  it("provides a short Twilio acknowledgement without asking a question before the stream can listen", () => {
    const opening = salesAgentConnectionOpening(TOM_SALES_AGENT);
    expect(opening).toBe('<Say voice="Polly.Matthew">Thanks for calling. Connecting you to Tom.</Say>');
    expect(opening).not.toContain("?");
    expect(opening).not.toContain("<Pause");
  });

  it("leaves the other agent's connection unchanged", () => {
    expect(salesAgentConnectionOpening(SHAVEZ_SALES_AGENT)).toBe("");
  });

  it("moves directly into a name question after the phone-system acknowledgement", () => {
    const instruction = tomOpeningInstructions("Test brand", true);
    expect(instruction).toContain('Begin with: "This is Tom at Test brand. May I ask who I\'m speaking with?"');
    expect(instruction).toContain("do not repeat that acknowledgement");
    expect(instruction).not.toContain("Thanks for calling Test brand");
  });

  it("retains a full welcome when the acknowledgement parameter is absent", () => {
    expect(tomOpeningInstructions("Test brand")).toContain('Begin with: "Thanks for calling Test brand. This is Tom. May I ask who I\'m speaking with?"');
  });

  it("skips known information, answers a direct question, and protects caller memory", () => {
    const instruction = tomOpeningInstructions("Test brand", true);
    expect(instruction).toContain("If the caller has already supplied their name, do not ask it again");
    expect(instruction).toContain("respond to that first");
    expect(instruction).toContain("Complete any required identity verification before using stored caller history");
    expect(instruction).toContain('do not open with "what\'s on your mind"');
  });

  it("restores an ordered discovery sequence rather than optional passive conversation", () => {
    const topics = ["1. Name:", "2. Business type:", "3. Independent or team:", "4. Client flow:", "5. Current workflow:", "6. Main priority:"];
    const positions = topics.map((topic) => TOM_SALES_DISCOVERY.indexOf(topic));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(TOM_SALES_DISCOVERY).toContain("Do not wait passively");
    expect(TOM_SALES_DISCOVERY).toContain("Do not abandon sales discovery merely because you answered one question");
    expect(TOM_SALES_DISCOVERY).toContain("one question at a time");
  });

  it("stops unnecessary discovery and keeps product recommendations truthful and relevant", () => {
    expect(TOM_SALES_DISCOVERY).toContain("Skip anything already answered or irrelevant");
    expect(TOM_SALES_DISCOVERY).toContain("when the caller wants to start");
    expect(TOM_SALES_DISCOVERY).toContain("when they decline further questions");
    expect(TOM_SALES_DISCOVERY).toContain("Certxa Pro for an independent professional or Certxa Salon for team management");
    expect(TOM_SALES_DISCOVERY).toContain("before using any stored history");
  });
});
