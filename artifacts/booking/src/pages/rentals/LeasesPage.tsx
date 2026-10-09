import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Plus, FileText, X, ArrowRight } from "lucide-react";
import RentalsTopBar from "@/components/rentals/RentalsTopBar";
import AgreementLifecycleBadge from "@/components/rentals/AgreementLifecycleBadge";
import { fetchLeases, leasesQueryKey } from "@/lib/rentals-api";
import { AGREEMENT_LIFECYCLE_STATES, AGREEMENT_LIFECYCLE_LABELS, RENT_FREQUENCY_LABELS, type AgreementLifecycle } from "@shared/rentalAgreements";

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function formatDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// "Draft" is reserved vocabulary — nothing in this phase produces it, so it's
// not offered as a filter (Section 17: "every filter should help answer a
// real operational question").
const FILTERABLE_LIFECYCLES = AGREEMENT_LIFECYCLE_STATES.filter((s) => s !== "draft");

export default function LeasesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput, 300);
  // Seeds from ?status= so the Dashboard's "Ending Soon"/"Upcoming" links land pre-filtered.
  const [lifecycleFilter, setLifecycleFilter] = useState<AgreementLifecycle | null>(
    () => (AGREEMENT_LIFECYCLE_STATES as readonly string[]).includes(searchParams.get("status") ?? "")
      ? (searchParams.get("status") as AgreementLifecycle)
      : null,
  );

  const filters = { search, status: lifecycleFilter ?? undefined };
  const { data: leases, isLoading, isError } = useQuery({
    queryKey: leasesQueryKey(filters),
    queryFn: () => fetchLeases(filters),
  });

  const { data: all } = useQuery({
    queryKey: leasesQueryKey({}),
    queryFn: () => fetchLeases({}),
  });
  const countsByLifecycle: Record<string, number> = {};
  for (const a of all ?? []) countsByLifecycle[a.lifecycle] = (countsByLifecycle[a.lifecycle] ?? 0) + 1;
  const totalCount = all?.length ?? 0;

  const hasActiveFilters = !!search || !!lifecycleFilter;
  const hasAnyLeases = totalCount > 0;

  return (
    <div className="flex h-full flex-col">
      <RentalsTopBar title="Leases" />
      <div className="flex-1 overflow-y-auto px-5 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-4xl">
          {!hasAnyLeases && !isLoading ? (
            <EmptyState onAdd={() => navigate("/rentals/leases/new")} />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13px] text-neutral-500">
                  {totalCount} agreement{totalCount === 1 ? "" : "s"}
                </p>
                <button
                  onClick={() => navigate("/rentals/leases/new")}
                  className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800"
                >
                  <Plus size={15} />
                  Create Rental Agreement
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                <FilterPill active={lifecycleFilter === null} label="All" count={totalCount} onClick={() => setLifecycleFilter(null)} />
                {FILTERABLE_LIFECYCLES.map((state) => (
                  <FilterPill
                    key={state}
                    active={lifecycleFilter === state}
                    label={AGREEMENT_LIFECYCLE_LABELS[state]}
                    count={countsByLifecycle[state] ?? 0}
                    onClick={() => setLifecycleFilter(state)}
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
                ) : !leases || leases.length === 0 ? (
                  <NoResultsState hasActiveFilters={hasActiveFilters} />
                ) : (
                  <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                    {leases.map((lease) => (
                      <button
                        key={lease.id}
                        onClick={() => navigate(`/rentals/leases/${lease.id}`)}
                        className="flex w-full flex-col gap-1 border-b border-neutral-100 px-4 py-3.5 text-left transition last:border-b-0 hover:bg-neutral-50 md:px-5"
                      >
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 truncate text-[13px] font-medium text-neutral-800">
                            {lease.professional.businessName ?? lease.professional.name}
                          </span>
                          <ArrowRight size={12} className="flex-shrink-0 text-neutral-300" />
                          <span className="min-w-0 truncate text-[13px] font-medium text-neutral-700">{lease.space.name}</span>
                          <span className="flex-1" />
                          <AgreementLifecycleBadge lifecycle={lease.lifecycle} className="flex-shrink-0" />
                        </div>
                        <p className="text-[12px] text-neutral-500">
                          {lease.rentAmount ? `$${lease.rentAmount}/${RENT_FREQUENCY_LABELS[lease.rentFrequency as keyof typeof RENT_FREQUENCY_LABELS]?.toLowerCase() ?? lease.rentFrequency}` : "—"}
                          {" · "}
                          {formatDate(lease.startDate as unknown as string)} → {lease.endDate ? formatDate(lease.endDate as unknown as string) : "Month-to-month"}
                        </p>
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

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 py-16 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400">
        <FileText size={20} />
      </div>
      <p className="font-[Outfit] text-[15px] font-semibold text-neutral-800">No rental agreements yet</p>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-neutral-500">
        Connect a professional to a space by creating their first rental agreement.
      </p>
      <button
        onClick={onAdd}
        className="mt-5 flex items-center gap-1.5 rounded-md bg-neutral-900 px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-neutral-800"
      >
        <Plus size={15} />
        Create Rental Agreement
      </button>
    </div>
  );
}

function NoResultsState({ hasActiveFilters }: { hasActiveFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 py-14 text-center">
      <p className="text-[13px] text-neutral-500">
        {hasActiveFilters ? "No agreements match your search or filters." : "No agreements yet."}
      </p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-rose-200 bg-rose-50/50 py-14 text-center">
      <p className="text-[13px] text-rose-600">Couldn't load rental agreements. Try refreshing the page.</p>
    </div>
  );
}
