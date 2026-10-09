/**
 * Who takes the next client while the server cannot be reached.
 *
 * Online, the server's TURN rules decide. Offline, the device still has the last turn line the server sent:
 * who is clocked in, their order, who can perform the service. This picks from that — the first technician in
 * line who is in, not on a break, able to do the service, and not already holding a client that THIS device
 * gave them while offline (so two walk-ins in a row do not both go to the same person).
 *
 * It is one device's view. Another tablet offline at the same time may pick the same technician; that is not
 * hidden or merged — each ticket is sent with the technician it was really given to, marked as assigned
 * offline, and the server either accepts it or refuses it for staff to resolve.
 */
export interface TurnLineTech {
  id: number; name: string; color?: string | null;
  eligible?: boolean; clockedIn?: boolean; paused?: boolean;
  availabilityState?: "available" | "busy" | "break" | "off";
  currentStatus?: "available" | "busy" | "on_break";
  turnPosition?: number;
}

export function pickOfflineTech(line: TurnLineTech[], heldOnThisDevice: ReadonlySet<number>): TurnLineTech | null {
  const free = line
    .filter((t) => t.eligible !== false && t.clockedIn !== false && !t.paused)
    .filter((t) => (t.availabilityState ?? "available") === "available" && (t.currentStatus ?? "available") === "available")
    .filter((t) => !heldOnThisDevice.has(t.id))
    .sort((a, b) => (a.turnPosition ?? Number.MAX_SAFE_INTEGER) - (b.turnPosition ?? Number.MAX_SAFE_INTEGER));
  return free[0] ?? null;
}
