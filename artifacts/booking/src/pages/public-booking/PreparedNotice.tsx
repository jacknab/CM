import type { StoreData } from "./types";

/**
 * A salon page Certxa prepared that its owner hasn't claimed yet (owner, 2026-11-10; server lib/preparedSalon.ts):
 * a thin line at the top saying so, with Certxa's number for the owner to claim it. Nothing for any other salon.
 */
export function PreparedNotice({ store }: { store: StoreData }) {
  if (!store.unclaimedPrepared || !store.claimLine) return null;
  return (
    <aside className="border-b border-stone-200 bg-stone-50 px-4 py-2 text-center text-[13px] leading-snug text-stone-700" aria-label="About this page" data-testid="prepared-notice">
      {store.claimLine}
    </aside>
  );
}
