import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../db", () => ({ db: { insert: () => ({ values: async () => undefined }) } }));

import { SilenceWatchdog } from "../lib/silenceWatchdog";

/** What the watchdog asked Autumn to do, by kind. */
let sent: string[] = [];
let dog: SilenceWatchdog;
const kinds = () => sent.map((c) => (/holding line/.test(c) ? "hold" : /still here/.test(c) ? "reask-again" : /ask your last question again/.test(c) ? "reask" : "other"));

/** Autumn says something: audio is generated and played out over `ms`. */
function autumnSays(text: string, ms = 1_500) {
  dog.onAutumnText(text);
  dog.onAiAudioDelta();
  for (let t = 0; t < ms; t += 100) { dog.onAiPlayback(); vi.advanceTimersByTime(100); }
}
/** The caller says something. */
function callerSays(ms = 1_000) {
  for (let t = 0; t < ms; t += 100) { dog.onCallerSound(); dog.onCallerWords(); vi.advanceTimersByTime(100); }
}

beforeEach(() => {
  vi.useFakeTimers();
  sent = [];
  dog = new SilenceWatchdog();
  dog.start({ callSid: "CA-test", storeId: 1, callLogId: null, send: (m: any) => sent.push(String(m.content ?? "")) });
  dog.onSessionReady();
});
afterEach(() => { dog.stop(); vi.useRealTimers(); });

describe("no dead air on a call", () => {
  test("Autumn asks, the caller says nothing: she asks again after 5 seconds, then once more, then stops", () => {
    autumnSays("What day works best for you?");
    vi.advanceTimersByTime(4_500);
    expect(kinds()).toEqual([]);
    vi.advanceTimersByTime(1_000);
    expect(kinds()).toEqual(["reask"]);
    autumnSays("Sorry, are you still there? I was asking what day works for you.");
    vi.advanceTimersByTime(6_000);
    expect(kinds()).toEqual(["reask", "reask-again"]);
    autumnSays("I'm still here whenever you're ready — what day works?");
    vi.advanceTimersByTime(30_000);
    expect(kinds()).toEqual(["reask", "reask-again"]);
  });

  test("a caller who answers is never asked again", () => {
    autumnSays("What day works best for you?");
    vi.advanceTimersByTime(3_000);
    callerSays();
    autumnSays("Great, Friday it is. Morning or afternoon?");
    callerSays();
    vi.advanceTimersByTime(2_000);
    expect(kinds().filter((k) => k.startsWith("reask"))).toEqual([]);
  });

  test("silence after a goodbye is the call ending: no re-ask", () => {
    autumnSays("You're all set for Friday at 10. Have a great day!");
    vi.advanceTimersByTime(15_000);
    expect(kinds()).toEqual([]);
  });

  test("the caller spoke and nothing comes back: one short holding line after 3.5 seconds, once", () => {
    autumnSays("How can I help?");
    callerSays();
    vi.advanceTimersByTime(3_000);
    expect(kinds()).toEqual([]);
    vi.advanceTimersByTime(1_000);
    expect(kinds()).toEqual(["hold"]);
    vi.advanceTimersByTime(10_000);
    expect(kinds()).toEqual(["hold"]);
  });

  test("after the holding line, a slow answer is not met with \"are you still there?\"", () => {
    autumnSays("How can I help?");
    callerSays();
    vi.advanceTimersByTime(4_000);
    expect(kinds()).toEqual(["hold"]);
    autumnSays("Okay, one moment.", 800);   // the holding line
    vi.advanceTimersByTime(8_000);          // still working out the answer
    expect(kinds()).toEqual(["hold"]);
    autumnSays("Tom works tomorrow from 9:30 to 7. Would you like to book with him?");
    vi.advanceTimersByTime(5_500);          // now the question is hers and the caller is quiet
    expect(kinds()).toEqual(["hold", "reask"]);
  });

  test("while a lookup is running, no re-ask", () => {
    autumnSays("Sure.");
    dog.onToolStart();
    vi.advanceTimersByTime(8_000);
    expect(kinds().filter((k) => k.startsWith("reask"))).toEqual([]);
  });
});
