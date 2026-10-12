export type HubMessage = Record<string, unknown> & { type?: string; registerId?: number | string | null };

/** True when a message is meant for this register (or for every register). */
export function forRegister(message: HubMessage, registerId: number | null | undefined): boolean {
  return message.registerId == null || registerId == null || Number(message.registerId) === Number(registerId);
}
