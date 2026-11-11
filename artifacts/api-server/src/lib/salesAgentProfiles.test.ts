import { describe, expect, it } from "vitest";
import {
  SHAVEZ_SALES_AGENT,
  TOM_SALES_AGENT,
  agentKnowledgeForPrompt,
  pickAgentGreeting,
  salesAgentFactCheckProductGuidance,
  salesAgentProductFitGuidance,
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

  it("rotates Marel's caller-facing greetings without changing internal attribution or Tom's greeting", () => {
    const greetings = new Set(Array.from({ length: SHAVEZ_SALES_AGENT.greetings.length }, (_, i) =>
      pickAgentGreeting(SHAVEZ_SALES_AGENT, () => (i + 0.25) / SHAVEZ_SALES_AGENT.greetings.length)));
    expect(greetings.size).toBe(SHAVEZ_SALES_AGENT.greetings.length);
    expect(SHAVEZ_SALES_AGENT.name).toBe("Shavez");
    expect(SHAVEZ_SALES_AGENT.spokenName).toBe("Marel");
    expect([...greetings].every((greeting) => greeting.includes("Marel") && greeting.includes("Sir-Tex-uh"))).toBe(true);
    expect([...greetings].some((greeting) => /Shavez|spell|S-H-A-V-E-Z/i.test(greeting))).toBe(false);
    expect(pickAgentGreeting(TOM_SALES_AGENT, () => 0)).toContain("Tom");
    expect(pickAgentGreeting(TOM_SALES_AGENT, () => 0)).toContain("May I ask who I'm speaking with?");
  });

  it("adapts sales knowledge wording to the active agent", () => {
    expect(agentKnowledgeForPrompt("Tom can help with this.", SHAVEZ_SALES_AGENT)).toBe("Marel can help with this.");
    expect(agentKnowledgeForPrompt("Tom can help with this.", TOM_SALES_AGENT)).toBe("Tom can help with this.");
  });

  it("routes independent professionals to Certxa Pro and keeps salon-team fit and Marel isolated", () => {
    const tomGuidance = salesAgentProductFitGuidance(TOM_SALES_AGENT);
    expect(tomGuidance).toContain("Recommend it naturally when the caller works independently");
    expect(tomGuidance).toContain("home-based, booth-renting, or mobile professional");
    expect(tomGuidance).toContain("free offering with limitations");
    expect(tomGuidance).toContain("$5/month");
    expect(tomGuidance).toContain("a request is not confirmed and does not reserve the time");
    expect(tomGuidance).toContain("approve, decline, or offer up to eight alternative times");
    expect(tomGuidance).toContain("the deposit is requested after approval");
    expect(tomGuidance).toContain("only backend-listed booking/visit notification types free");
    expect(tomGuidance).toContain("Apple's managed entitlement is currently only in the development provisioning profile");
    expect(tomGuidance).toContain("Tap to Pay has a 2.7% Stripe processing rate plus a $0.60 Certxa platform connection fee");
    expect(tomGuidance).toContain("Manually entered card payments have a 2.9% Stripe processing rate plus a $1 Certxa platform connection fee");
    expect(tomGuidance).toContain("do not apply either to M2, payment links, booking deposits, or other paths");
    expect(tomGuidance).toContain("100 for $4.99, 250 for $7.99, and 500 for $11.99");
    expect(tomGuidance).toContain("the product owner will provide the store URLs after publication");
    expect(tomGuidance).toContain("Do not automatically introduce Certxa Salon to an independent professional");
    expect(tomGuidance).toContain("Certxa Salon's main browser platform does not support Stripe card payments");
    expect(tomGuidance).toContain("requires its Android app, which is not currently available on iOS");
    expect(tomGuidance).not.toMatch(/\bSolo\b|\bFree plan\b/i);
    const factCheckGuidance = salesAgentFactCheckProductGuidance(TOM_SALES_AGENT);
    expect(factCheckGuidance).toContain("must not be flagged just because the caller did not ask about Certxa Pro first");
    expect(factCheckGuidance).toContain("Manual approval is verified");
    expect(factCheckGuidance).toContain("offer up to eight alternative times");
    expect(factCheckGuidance).toContain("Tap to Pay is 2.7% Stripe processing plus a $0.60 Certxa platform connection fee");
    expect(factCheckGuidance).toContain("manually entered card payments are 2.9% Stripe processing plus a $1 Certxa platform connection fee");
    expect(factCheckGuidance).toContain("100 for $4.99, 250 for $7.99, and 500 for $11.99");
    expect(factCheckGuidance).toContain("do not apply them to M2, payment links, booking deposits");
    expect(salesAgentProductFitGuidance(SHAVEZ_SALES_AGENT)).toBe("");
    expect(salesAgentFactCheckProductGuidance(SHAVEZ_SALES_AGENT)).toContain("legacy internal product/plan terminology");
    expect(salesAgentProductFitGuidance(SHAVEZ_SALES_AGENT, true)).toBe("");
  });
});
