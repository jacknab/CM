/**
 * "Repeat Formula" (owner, 2026-11-12): tapped on a client's last-visit card, their last cut's picks are filled into
 * Quick Notes when this client's current visit is checked out. Kept for this screen session only.
 */
const pending = new Set<number>();
export const markRepeatFormula = (clientId: number | null | undefined) => { if (Number(clientId) > 0) pending.add(Number(clientId)); };
export const isRepeatFormulaMarked = (clientId: number | null | undefined) => pending.has(Number(clientId));
/** Used once: true if the client's last cut should be filled in now. */
export const takeRepeatFormula = (clientId: number | null | undefined) => pending.delete(Number(clientId));
