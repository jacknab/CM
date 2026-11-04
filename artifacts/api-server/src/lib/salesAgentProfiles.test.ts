import { describe, expect, it } from "vitest";
import {
  SHAVEZ_SALES_AGENT,
  TOM_SALES_AGENT,
  agentKnowledgeForPrompt,
  pickAgentGreeting,
} from "./salesAgentProfiles";

describe("independent Certxa sales-agent profiles", () => {
  it("keeps agent IDs, webhook paths, stream paths, and one-time pass kinds isolated", () => {
    expect(TOM_SALES_AGENT.id).toBe("tom");
    expect(SHAVEZ_SALES_AGENT.id).toBe("shavez");
    expect(SHAVEZ_SALES_AGENT.webhookPath).not.toBe(TOM_SALES_AGENT.webhookPath);
    expect(SHAVEZ_SALES_AGENT.streamBase).not.toBe(TOM_SALES_AGENT.streamBase);
    expect(SHAVEZ_SALES_AGENT.streamKind).not.toBe(TOM_SALES_AGENT.streamKind);
  });

  it("selects Shavez's voice independently from Tom's voice", () => {
    expect(SHAVEZ_SALES_AGENT.voice).not.toBe(TOM_SALES_AGENT.voice);
    expect(["ash", "echo", "onyx", "marin"]).toContain(SHAVEZ_SALES_AGENT.voice);
    expect(SHAVEZ_SALES_AGENT.voice).toBe("marin");
  });

  it("rotates Maril's caller-facing greetings without changing internal attribution or Tom's greeting", () => {
    const greetings = new Set(Array.from({ length: SHAVEZ_SALES_AGENT.greetings.length }, (_, i) =>
      pickAgentGreeting(SHAVEZ_SALES_AGENT, () => (i + 0.25) / SHAVEZ_SALES_AGENT.greetings.length)));
    expect(greetings.size).toBe(SHAVEZ_SALES_AGENT.greetings.length);
    expect(SHAVEZ_SALES_AGENT.name).toBe("Shavez");
    expect(SHAVEZ_SALES_AGENT.spokenName).toBe("Maril");
    expect([...greetings].every((greeting) => greeting.includes("Maril") && greeting.includes("Sir Text uh"))).toBe(true);
    expect([...greetings].some((greeting) => /Shavez|spell|S-H-A-V-E-Z/i.test(greeting))).toBe(false);
    expect(pickAgentGreeting(TOM_SALES_AGENT, () => 0)).toContain("Tom");
  });

  it("adapts sales knowledge wording to the active agent", () => {
    expect(agentKnowledgeForPrompt("Tom can help with this.", SHAVEZ_SALES_AGENT)).toBe("Maril can help with this.");
    expect(agentKnowledgeForPrompt("Tom can help with this.", TOM_SALES_AGENT)).toBe("Tom can help with this.");
  });
});
