export type HubMessage = Record<string, unknown> & { type?: string; registerId?: number | string | null };

/**
 * True when a message is meant for this register (or for every register).
 * A register id of 0 means "not known": a salon with a single station often has none set on its customer
 * screen, so 0 on either side never rules a message out.
 */
export function forRegister(message: HubMessage, registerId: number | null | undefined): boolean {
  const theirs = Number(message.registerId ?? 0);
  const mine = Number(registerId ?? 0);
  return !theirs || !mine || theirs === mine;
}
