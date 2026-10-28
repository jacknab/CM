import type { BoardWait } from "./nailApi";

/**
 * Tickets that sit (owner, 2026-10-29): the server works out WHY each waiting ticket hasn't started and since when
 * (`wait`, nailTickets.ts boardWaitReasons). A reason that needs watching turns the card orange, then red, after its
 * own number of minutes; the card says the reason. Urgent cards move to the front of the board, red first; once the
 * ticket starts (or the reason clears) it goes back to its own place.
 */
export type Urgency = "red" | "orange" | null;

export function waitUrgency(wait: BoardWait | undefined, nowMs: number): Urgency {
  if (!wait) return null;
  const waitedMin = (nowMs - Date.parse(wait.since)) / 60_000;
  if (!(waitedMin >= wait.orangeMin)) return null;
  return waitedMin >= wait.redMin ? "red" : "orange";
}

/** Red before orange. Not urgent last (keeps its own place). */
export function urgencyRank(u: Urgency): number {
  return u === "red" ? 0 : u === "orange" ? 1 : 2;
}

/** What the card says when it's urgent. `tech` = the technician's name as /nail shows it. */
export function waitReasonText(wait: BoardWait, tech: string | null): string {
  const who = (tech ?? "Technician").toUpperCase();
  switch (wait.code) {
    case "tech_free": return `${who} IS FREE · NOT STARTED`;
    case "clocked_out": return `${who} IS CLOCKED OUT`;
    case "running_over": return wait.ticket != null ? `${who} RUNNING OVER ON #${wait.ticket}` : `${who} RUNNING OVER`;
    case "not_saved": return "RINGING UP · NOT SAVED";
    case "unassigned_free": return "NO TECHNICIAN · ONE IS FREE";
    case "long_wait": return "LONG WAIT · ALL TECHS BUSY";
    // In the chair: don't let the client leave without paying.
    case "service_over": return "OVER TIME · NOT DONE";
    case "done_unpaid": return "DONE · NOT PAID";
  }
}
