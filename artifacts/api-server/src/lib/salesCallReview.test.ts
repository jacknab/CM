import { describe, expect, it } from "vitest";
import { reviewReasons } from "./salesCallReview";

describe("Weekly call review", () => {
  it("flags real warning signs only", () => {
    expect(reviewReasons({ duration_seconds: 240, outcome: "ended_by_tom", fact_check_ok: true, structured_summary: { outstandingQuestions: [] },
      transcript: [{ role: "caller", text: "How much is the Professional plan?" }, { role: "tom", text: "It's ninety-nine a month." }] })).toEqual([]);
    expect(reviewReasons({ duration_seconds: 12, outcome: "account_services_caller_hung_up", fact_check_ok: null, structured_summary: null,
      transcript: [{ role: "caller", text: "I can't sign in to my account" }, { role: "caller", text: "I can't sign in to my account!" },
        { role: "caller", text: "This is ridiculous, let me talk to a real person" }] }))
      .toEqual(["Hung up within 20 seconds", "Caller repeated themselves", "Caller sounded frustrated", "Asked for a person"]);
    expect(reviewReasons({ duration_seconds: 40, outcome: "account_services_no_response", fact_check_ok: false, structured_summary: { outstandingQuestions: ["price of the M2"] }, transcript: [] }))
      .toEqual(["No response — disconnected", "Left 1 question open", "Fact check failed"]);
  });
});
