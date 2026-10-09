import { describe, expect, it } from "vitest";
import { classifySmsCancellationIntent, replaceReservedCancelPrompt } from "../lib/smsCancellationIntent";

describe("classifySmsCancellationIntent", () => {
  it.each([
    "I can't make it",
    "Sorry, I will not be able to attend tomorrow",
    "Please cancel my appointment",
    "I need to cancel because I am sick",
    "Take me off the schedule please",
    "I'm not going to make it today",
  ])("recognizes a clear cancellation request: %s", (message) => {
    expect(classifySmsCancellationIntent(message).shouldCancel).toBe(true);
  });

  it.each([
    "Don't cancel my appointment",
    "Can I cancel?",
    "What is your cancellation policy?",
    "I might be late",
    "Please change my appointment time",
    "Thanks, see you then",
  ])("does not cancel on an ambiguous or negated message: %s", (message) => {
    expect(classifySmsCancellationIntent(message).shouldCancel).toBe(false);
  });
});

describe("replaceReservedCancelPrompt", () => {
  it("removes the legacy carrier-reserved keyword instruction", () => {
    expect(replaceReservedCancelPrompt("Reminder. Reply CANCEL to cancel your appointment."))
      .toBe("Reminder. If you can't make it, reply and tell us");
  });
});
