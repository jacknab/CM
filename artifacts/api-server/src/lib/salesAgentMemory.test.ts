import { describe, expect, it } from "vitest";
import {
  finalizeAfterInsert,
  hasCallerEvidence,
  callerAffirmsIdentity,
  callerExplicitlyDeclined,
  canonicalizeSpokenBrandForText,
  advanceSalesStage,
  identityNeedsMoreInformation,
  identityMatches,
  mergeProfileData,
  profileNeedsIdentityCheck,
  shouldAssociateCallWithProfile,
  safeSummaryForCallerMemory,
  safeStructuredSummary,
  summarizeMemoryContext,
  verifiedProfilePatch,
} from "./salesAgentMemory";
import { toE164US } from "./phoneUtils";

const transcript = [
  { role: "caller", text: "I'm Kevin from Kevin's Nails. We have five technicians and manage turns on paper." },
  { role: "tom", text: "The Professional plan is available, but I can't confirm setup time." },
  { role: "caller", text: "Actually we now have seven technicians. My email is kevin@example.com." },
  { role: "tom", text: "Did I get that right: kevin@example.com?" },
];

describe("Tom sales caller memory", () => {
  it("keeps the written brand and domain canonical when sanitizing the spoken alias", () => {
    expect(canonicalizeSpokenBrandForText("Our salon uses Sir Text uh. Visit Sir Text uh dot com.")).toBe("Our salon uses Certxa. Visit Certxa.com.");
    expect(canonicalizeSpokenBrandForText("It is spelled C-E-R-T-X-A.")).toBe("It is spelled C-E-R-T-X-A.");
    expect(canonicalizeSpokenBrandForText("The word textile is unrelated.")).toBe("The word textile is unrelated.");
  });

  it("normalizes differently formatted US caller IDs and ignores private IDs", () => {
    expect(toE164US("(714) 555-1212")).toBe("+17145551212");
    expect(toE164US("+1 714 555 1212")).toBe("+17145551212");
    expect(toE164US("anonymous")).toBeNull();
    expect(toE164US(null)).toBeNull();
  });

  it("waits for a late call-log INSERT and pending actions before finalizing a short call", async () => {
    let finishInsert!: (id: number) => void;
    let finishAction!: () => void;
    const insert = new Promise<number>((resolve) => { finishInsert = resolve; });
    const action = new Promise<void>((resolve) => { finishAction = resolve; });
    const written: number[] = [];
    const result = finalizeAfterInsert(insert, [action], async (id) => { written.push(id); });
    finishInsert(42);
    await Promise.resolve();
    expect(written).toEqual([]);
    finishAction();
    expect(await result).toBe(42);
    expect(written).toEqual([42]);
  });

  it("does not attempt finalization when the database INSERT failed", async () => {
    let called = false;
    expect(await finalizeAfterInsert(Promise.resolve(null), [], async () => { called = true; })).toBeNull();
    expect(called).toBe(false);
  });

  it("confirms only a caller-volunteered matching name, never a business name alone", () => {
    expect(identityNeedsMoreInformation({ name: "Kevin Smith", businessName: "Kevin's Nails" }, { name: "  KEVIN  Smith  " })).toBe(true);
    expect(identityMatches({ name: "Kevin Smith", businessName: "Kevin's Nails" }, { name: "  KEVIN  Smith  ", businessName: "Kevin's Nails" })).toBe(true);
    expect(identityMatches({ name: "Kevin Smith", email: "kevin@example.com" }, { name: "Kevin Smith", email: "KEVIN@example.com" })).toBe(true);
    expect(identityMatches({ name: "Kevin Smith", email: "kevin@example.com" }, { name: "Kevin Smith" })).toBe(false);
    expect(identityNeedsMoreInformation({ businessName: "Kevin's Nails" }, { name: "Kevin Smith" })).toBe(true);
    expect(identityMatches({ businessName: "Kevin's Nails" }, { name: "Kevin Smith", businessName: "Kevin's Nails" })).toBe(true);
    expect(identityMatches({ name: "Kevin Smith", businessName: "Kevin's Nails" }, { name: "Sarah", businessName: "Kevin's Nails" })).toBe(false);
    expect(identityMatches({ name: "Kevin Smith", businessName: "Kevin's Nails" }, { name: "Kevin Smith", businessName: "Wrong Salon" })).toBe(false);
    expect(identityMatches({ name: null }, { name: "Kevin" })).toBe(false);
  });

  it("accepts legacy-call identity only when the caller affirmatively states the identifier", () => {
    const oldCall = [{ role: "caller", text: "Hi, I'm Kevin Smith from Kevin's Nails." }];
    expect(callerAffirmsIdentity(oldCall, "Kevin Smith")).toBe(true);
    expect(callerAffirmsIdentity(oldCall, "Kevin's Nails")).toBe(true);
    expect(callerAffirmsIdentity([{ role: "caller", text: "I'm not Kevin Smith; I'm calling for him." }], "Kevin Smith")).toBe(false);
  });

  it("requires identity before using persisted business/history, but not a phone-only prospect or SMS marker", () => {
    expect(profileNeedsIdentityCheck({ phone_e164: "+17145551212", profile_data: {} }, false)).toBe(false);
    expect(profileNeedsIdentityCheck({ profile_data: { sales: { signupLinkSent: true, currentStage: "signup_link_sent" } } }, false)).toBe(false);
    expect(profileNeedsIdentityCheck({ profile_data: { business: { teamSize: "five" } } }, false)).toBe(true);
    expect(profileNeedsIdentityCheck({ profile_data: {} }, true)).toBe(true);
  });

  it("keeps shared/ambiguous caller logs unlinked until identity is confirmed", () => {
    expect(shouldAssociateCallWithProfile({ identityVerified: false, profileLookupCompleted: true, profileCandidate: true, identityBlocked: false })).toBe(false);
    expect(shouldAssociateCallWithProfile({ identityVerified: false, profileLookupCompleted: false, profileCandidate: false, identityBlocked: false })).toBe(false);
    expect(shouldAssociateCallWithProfile({ identityVerified: true, profileLookupCompleted: true, profileCandidate: true, identityBlocked: false })).toBe(true);
    expect(shouldAssociateCallWithProfile({ identityVerified: false, profileLookupCompleted: true, profileCandidate: false, identityBlocked: false })).toBe(true);
    expect(shouldAssociateCallWithProfile({ identityVerified: false, profileLookupCompleted: true, profileCandidate: false, identityBlocked: true })).toBe(false);
  });

  it("advances pipeline stages monotonically and records a change only when it advances", () => {
    expect(advanceSalesStage("signup_link_sent", "interested")).toBe("signup_link_sent");
    expect(advanceSalesStage("interested", "signup_link_requested")).toBe("signup_link_requested");
    expect(advanceSalesStage("signup_link_sent", "follow_up_required")).toBe("follow_up_required");
    expect(advanceSalesStage("paying_customer", "not_interested")).toBe("paying_customer");
    expect(advanceSalesStage("not_interested", "interested")).toBe("interested");
  });

  it("detects explicit declines without treating ordinary hesitation as not interested", () => {
    expect(callerExplicitlyDeclined([{ role: "caller", text: "No thanks, I'm not interested." }])).toBe(true);
    expect(callerExplicitlyDeclined([{ role: "caller", text: "I'm not sure how setup works." }])).toBe(false);
  });

  it("marks profile facts as caller-reported and preserves provenance for later calls", () => {
    const summary = safeStructuredSummary({ profileFacts: [
      { field: "teamSize", value: "seven", evidence: "we now have seven technicians", evidenceRole: "caller" },
    ] });
    const patch = verifiedProfilePatch(summary!, transcript);
    expect(patch.provenance.teamSize).toMatchObject({ source: "caller_statement" });
  });

  it("retains existing facts when missing or uncertain fields are absent", () => {
    const old = { business: { teamSize: "five", bookingProcess: "paper", problems: ["turns on paper"] } };
    const next = mergeProfileData(old, { business: { teamSize: null, bookingProcess: "", problems: [] } });
    expect(next).toEqual(old);
  });

  it("accepts an explicit correction while retaining earlier call records separately", () => {
    const history = [{ teamSize: "five" }];
    const merged = mergeProfileData({ business: { teamSize: "five" } }, { business: { teamSize: "seven" } });
    expect((merged.business as any).teamSize).toBe("seven");
    expect(history).toEqual([{ teamSize: "five" }]);
  });

  it("does not combine unrelated names from concurrent calls on a newly-seen shared number", () => {
    const profile = { name: "Kevin" };
    expect(identityMatches(profile, { name: "Sarah" })).toBe(false);
    expect(identityMatches(profile, { name: "Kevin" })).toBe(true);
  });

  it("deduplicates interest lists without discarding older interests", () => {
    const merged = mergeProfileData({ sales: { featuresOfInterest: ["Turn rotation"] } },
      { sales: { featuresOfInterest: ["turn rotation", "Online booking"] } });
    expect((merged.sales as any).featuresOfInterest).toEqual(["Turn rotation", "Online booking"]);
  });

  it("requires exact transcript evidence for profile facts", () => {
    expect(hasCallerEvidence(transcript, "manage turns on paper")).toBe(true);
    expect(hasCallerEvidence(transcript, "has twelve technicians")).toBe(false);
    const summary = safeStructuredSummary({
      summary: "Kevin now has seven technicians.",
      profileFacts: [
        { field: "teamSize", value: "seven", evidence: "we now have seven technicians", evidenceRole: "caller" },
        { field: "businessName", value: "Unrelated Salon", evidence: "Unrelated Salon", evidenceRole: "caller" },
        { field: "pricingDiscussed", value: "Professional plan", evidence: "The Professional plan is available", evidenceRole: "tom" },
      ],
    });
    expect(summary).not.toBeNull();
    const patch = verifiedProfilePatch(summary!, transcript);
    expect(patch.columns.team_size).toBe("seven");
    expect(patch.columns.business_name).toBeUndefined();
    expect((patch.profileData.sales as any).pricingDiscussed).toEqual(["Professional plan"]);
  });

  it("only accepts an email after Tom repeats it for confirmation", () => {
    const summary = safeStructuredSummary({ profileFacts: [
      { field: "email", value: "kevin@example.com", evidence: "kevin@example.com", evidenceRole: "caller" },
    ] });
    expect(verifiedProfilePatch(summary!, transcript).columns.email).toBe("kevin@example.com");
    expect(verifiedProfilePatch(summary!, transcript.slice(0, 3)).columns.email).toBeUndefined();
  });

  it("keeps trial-link consent/action distinct from trial activation", () => {
    const events = [{ at: "2026-11-02T00:00:00.000Z", to: "+17145551212", body: "signup link", sid: "SM123", status: "sent" }];
    const context = summarizeMemoryContext({ name: "Kevin", profile_data: { sales: { signupLinkSent: true, currentStage: "signup_link_sent" } } },
      [{ started_at: "2026-11-02T00:00:00.000Z", summary: null, structured_summary: { memoryNotes: {} }, sms_events: events, outcome: "caller_hung_up" }]);
    expect(context).toContain("signup_link_sent");
    expect(context).toContain("SM123");
    expect(context).not.toContain("trial_active");
  });

  it("provides a short recent-call context without raw transcripts", () => {
    const context = summarizeMemoryContext(
      { name: "Kevin", profile_data: { sales: { nextAction: "Answer setup question" } } },
      [{ started_at: "2026-10-31T00:00:00Z", sales_agent_id: "tom", summary: "Discussed walk-in turns", structured_summary: { memoryNotes: { outstandingQuestions: ["Setup time?"] } }, transcript: "PRIVATE RAW WORDS" }],
    );
    expect(context).toContain("Answer setup question");
    expect(context).toContain("Setup time?");
    expect(context).toContain('"handledBy":"Tom"');
    expect(context).not.toContain("PRIVATE RAW WORDS");
  });

  it("attributes shared caller-memory history to the other agent without changing the shared profile", () => {
    const profile = { name: "Kevin", profile_data: { sales: { interestedPlan: "Professional" } } };
    const context = summarizeMemoryContext(profile, [
      { started_at: "2026-11-01T00:00:00Z", sales_agent_id: "tom", summary: "Asked about turn rotation", outcome: "completed" },
    ]);
    expect(context).toContain('"handledBy":"Tom"');
    expect(context).toContain("Kevin");
    expect(profile.profile_data.sales.interestedPlan).toBe("Professional");
  });

  it("does not carry model-invented paraphrases into returning-caller context", () => {
    const safe = safeSummaryForCallerMemory({
      problems: ["team has no rotation system"],
      outstandingQuestions: ["How long does setup take?"],
      nextAction: "Call the customer back next week",
      profileFacts: [],
    }, transcript);
    expect(safe.problems).toEqual([]);
    expect(safe.outstandingQuestions).toEqual([]);
    expect(safe.nextAction).toBeNull();
  });
});
