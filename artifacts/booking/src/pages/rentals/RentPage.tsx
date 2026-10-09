import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Wallet, X, ArrowRight } from "lucide-react";
import RentalsTopBar from "@/components/rentals/RentalsTopBar";
import ChargeStateBadge from "@/components/rentals/ChargeStateBadge";
import { fetchRentCharges, rentChargesQueryKey } from "@/lib/rentals-api";
import { CHARGE_DISPLAY_STATES, CHARGE_DISPLAY_LABELS, toCents, centsToAmount, type ChargeDisplayState } from "@shared/rentCharges";

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/** "Due today" / "Due tomorrow" / "Due Oct 5" / "Overdue 3 days" — never a raw timestamp (Section 14). */
function formatDueLabel(dueDate: string, state: ChargeDisplayState): string {
  const due = new Date(dueDate);
  const dateStr = due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (state === "overdue") {
    const days = Math.max(1, Math.round((Date.now() - due.getTime()) / 86_400_000));
    return `Overdue ${days} day${days === 1 ? "" : "s"}`;
  }
  const todayStr = new Date().toDateString();
  const tomorrow = new Date(Date.now() + 86_400_000).toDateString();
  if (due.toDateString() === todayStr) return "Due today";
  if (due.toDateString() === tomorrow) return "Due tomorrow";
  return `Due ${dateStr}`;
}

export default function RentPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput, 300);
  // Seeds from ?status= so the Dashboard's "Overdue"/"Due" links land pre-filtered.
  const [stateFilter, setStateFilter] = useState<ChargeDisplayState | null>(
    () => (CHARGE_DISPLAY_STATES as readonly string[]).includes(searchParams.get("status") ?? "")
      ? (searchParams.get("status") as ChargeDisplayState)
      : null,
  );

  const filters = { search, status: stateFilter ?? undefined };
  const { data: charges, isLoading, isError } = useQuery({
    queryKey: rentChargesQueryKey(filters),
    queryFn: () => fetchRentCharges(filters),
  });

  const { data: all } = useQuery({
    queryKey: rentChargesQueryKey({}),
    queryFn: () => fetchRentCharges({}),
  });
  const countsByState: Record<string, number> = {};
  let totalOwedCents = 0;
  for (const c of all ?? []) {
    countsByState[c.displayState] = (countsByState[c.displayState] ?? 0) + 1;
    if (c.displayState === "due" || c.displayState === "overdue") {
      totalOwedCents += toCents(c.remainingAmount);
    }
  }
  const totalCount = all?.length ?? 0;
  const hasActiveFilters = !!search || !!stateFilter;
  const hasAnyCharges = totalCount > 0;

  return (
    <div className="flex h-full flex-col">
      <RentalsTopBar title="Rent" />
      <div className="flex-1 overflow-y-auto px-5 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-4xl">
          {!hasAnyCharges && !isLoading ? (
            <EmptyState />
          ) : (
            <>
              {/* The one operational question this page answers first: who owes money right now. */}
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <p className="font-[Outfit] text-[22px] font-semibold text-neutral-900">
                    ${centsToAmount(totalOwedCents)}
                  </p>
                  <p className="text-[13px] text-neutral-500">currently due or overdue</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                <FilterPill active={stateFilter === null} label="All" count={totalCount} onClick={() => setStateFilter(null)} />
                {CHARGE_DISPLAY_STATES.map((state) => (
                  <FilterPill
                    key={state}
                    active={stateFilter === state}
                    label={CHARGE_DISPLAY_LABELS[state]}
                    count={countsByState[state] ?? 0}
                    onClick={() => setStateFilter(state)}
                  />
                ))}
              </div>

              <div className="mt-4">
                <div className="relative max-w-md">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search by professional, business, or space…"
                    className="w-full rounded-md border border-neutral-200 bg-white py-2 pl-9 pr-8 text-[13px] text-neutral-800 placeholder-neutral-400 outline-none focus:border-neutral-400"
                  />
                  {searchInput && (
                    <button
                      onClick={() => setSearchInput("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                      aria-label="Clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-5">
                {isLoading ? (
                  <div className="h-40 animate-pulse rounded-xl bg-neutral-100" />
                ) : isError ? (
                  <ErrorState />
                ) : !charges || charges.length === 0 ? (
                  <NoResultsState hasActiveFilters={hasActiveFilters} />
                ) : (
                  <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                    {charges.map((charge) => (
                      <button
                        key={charge.id}
                        onClick={() => navigate(`/rentals/rent/${charge.id}`)}
                        className="flex w-full flex-col gap-1 border-b border-neutral-100 px-4 py-3.5 text-left transition last:border-b-0 hover:bg-neutral-50 md:px-5"
                      >
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 truncate text-[13px] font-medium text-neutral-800">
                            {charge.professional.businessName ?? charge.professional.name}
                          </span>
                          <ArrowRight size={12} className="flex-shrink-0 text-neutral-300" />
                          <span className="min-w-0 truncate text-[13px] font-medium text-neutral-700">{charge.space.name}</span>
                          <span className="flex-1" />
                          <span className="flex-shrink-0 text-[13px] font-semibold text-neutral-800">${charge.amount}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <ChargeStateBadge state={charge.displayState} />
                          <span className="text-[12px] text-neutral-400">
                            {formatDueLabel(charge.dueDate, charge.displayState)}
                          </span>
                          {charge.status === "unpaid" && charge.remainingAmount !== charge.amount && (
                            <span className="text-[12px] text-neutral-400">· ${charge.remainingAmount} remaining</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterPill({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition ${
        active
          ? "border-neutral-900 bg-neutral-900 text-white"
          : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
      }`}
    >
      {label} <span className={active ? "text-neutral-300" : "text-neutral-400"}>{count}</span>
    </button>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 py-16 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400">
        <Wallet size={20} />
      </div>
      <p className="font-[Outfit] text-[15px] font-semibold text-neutral-800">No rent charges yet</p>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-neutral-500">
        Rent charges will appear here once your active rental agreements begin generating rent.
      </p>
    </div>
  );
}

function NoResultsState({ hasActiveFilters }: { hasActiveFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 py-14 text-center">
      <p className="text-[13px] text-neutral-500">
        {hasActiveFilters ? "No charges match your search or filters." : "No charges yet."}
      </p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-rose-200 bg-rose-50/50 py-14 text-center">
      <p className="text-[13px] text-rose-600">Couldn't load rent charges. Try refreshing the page.</p>
    </div>
  );
}
