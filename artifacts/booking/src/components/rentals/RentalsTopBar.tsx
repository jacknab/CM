import { useQuery } from "@tanstack/react-query";
import type { Store } from "@shared/schema";

// Rentals is deliberately NOT mounted under the app-wide StoreProvider (see
// RentalsApp.tsx) — like /isTeam and /isadmin, it's a self-contained shell.
// Phase 1 assumes a single facility per account, same as resolveSessionStoreId's
// server-side fallback; a facility switcher for multi-location owners is
// deferred (see Rentals Phase 0 audit, Section I / Recommended Phase 2).
function useCurrentFacility() {
  const { data: stores } = useQuery<Store[]>({ queryKey: ["/api/stores"] });
  return stores?.[0] ?? null;
}

export default function RentalsTopBar({ title }: { title: string }) {
  const facility = useCurrentFacility();

  return (
    <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-5 md:px-6">
      <h1 className="font-[Outfit] text-[15px] font-semibold text-neutral-900">{title}</h1>
      {facility && (
        <span className="truncate text-[13px] text-neutral-500">{facility.name}</span>
      )}
    </header>
  );
}
