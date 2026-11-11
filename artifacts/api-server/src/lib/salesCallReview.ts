/**
 * The weekly call review in /isTeam › Sales Leads (owner, 2026-11-11): Tom and Marel calls worth reading, each with
 * plain reasons. Only real warning signs: a quick hang-up, a caller repeating themselves, frustration or asking for a
 * person, nobody answering, questions left open, or a failed fact check.
 */
type Turn = { role?: string; text?: string };
export type ReviewCall = {
  duration_seconds: number | null; outcome: string | null; transcript: Turn[] | null;
  structured_summary: { outstandingQuestions?: unknown[]; problems?: unknown[] } | null; fact_check_ok: boolean | null;
};

const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
const FRUSTRATED = /\b(ridiculous|frustrat\w*|annoy\w*|angry|upset|terrible|useless|stupid|not working again|this is crazy|waste of (my )?time|unacceptable|ugh)\b/i;
const WANTS_PERSON = /\b(real person|human|a person|someone real|live (agent|person)|representative|speak to (someone|somebody|a manager|an agent)|talk to (someone|somebody|a manager|an agent))\b/i;

export function reviewReasons(c: ReviewCall): string[] {
  const reasons: string[] = [];
  const caller = (Array.isArray(c.transcript) ? c.transcript : []).filter((t) => t?.role === "caller" && typeof t.text === "string" && /\p{L}/u.test(t.text));
  const outcome = String(c.outcome ?? "");
  if ((c.duration_seconds ?? 0) < 20 && /caller_hung_up/.test(outcome) && caller.length > 0) reasons.push("Hung up within 20 seconds");
  const seen = new Set<string>();
  for (const t of caller) {
    const n = norm(t.text!);
    if (n.split(" ").length >= 4 && seen.has(n)) { reasons.push("Caller repeated themselves"); break; }
    seen.add(n);
  }
  if (caller.some((t) => FRUSTRATED.test(t.text!))) reasons.push("Caller sounded frustrated");
  if (caller.some((t) => WANTS_PERSON.test(t.text!))) reasons.push("Asked for a person");
  if (/no_response/.test(outcome)) reasons.push("No response — disconnected");
  if (/ai_error|ai_timeout|ai_closed/.test(outcome)) reasons.push("The AI stopped or didn't start");
  const open = c.structured_summary?.outstandingQuestions;
  if (Array.isArray(open) && open.length) reasons.push(`Left ${open.length} question${open.length === 1 ? "" : "s"} open`);
  if (c.fact_check_ok === false) reasons.push("Fact check failed");
  return reasons;
}
