import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Plus, LayoutGrid, X } from "lucide-react";
import RentalsTopBar from "@/components/rentals/RentalsTopBar";
import SpaceStatusBadge from "@/components/rentals/SpaceStatusBadge";
import { fetchSpaces, spacesQueryKey } from "@/lib/rentals-api";
import { SPACE_STATUSES, SPACE_STATUS_LABELS, SPACE_TYPES, SPACE_TYPE_LABELS, type SpaceStatus } from "@shared/rentalSpaces";

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function SpacesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput, 300);
  // Seeds from ?status= so the Dashboard's "Available Spaces" link lands pre-filtered.
  const [statusFilter, setStatusFilter] = useState<SpaceStatus | null>(
    () => (SPACE_STATUSES as readonly string[]).includes(searchParams.get("status") ?? "")
      ? (searchParams.get("status") as SpaceStatus)
      : null,
  );
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const filters = { search, status: statusFilter ?? undefined, type: typeFilter ?? undefined };
  const { data: spaces, isLoading, isError } = useQuery({
    queryKey: spacesQueryKey(filters),
    queryFn: () => fetchSpaces(filters),
  });

  // Unfiltered counts for the summary/filter pills — fetched once, independent
  // of the active filters, so the pills don't reshuffle as you filter.
  const { data: allSpaces } = useQuery({
    queryKey: spacesQueryKey({}),
    queryFn: () => fetchSpaces({}),
  });
  const countsByStatus: Record<string, number> = {};
  for (const s of allSpaces ?? []) countsByStatus[s.status] = (countsByStatus[s.status] ?? 0) + 1;
  const totalCount = allSpaces?.length ?? 0;

  const hasActiveFilters = !!search || !!statusFilter || !!typeFilter;
  const hasAnySpaces = totalCount > 0;

  return (
    <div className="flex h-full flex-col">
      <RentalsTopBar title="Spaces" />
      <div className="flex-1 overflow-y-auto px-5 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-4xl">
          {!hasAnySpaces && !isLoading ? (
            <EmptyFacilityState onAdd={() => navigate("/rentals/spaces/new")} />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13px] text-neutral-500">
                  {totalCount} space{totalCount === 1 ? "" : "s"}
                </p>
                <button
                  onClick={() => navigate("/rentals/spaces/new")}
                  className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800"
                >
                  <Plus size={15} />
                  Add Space
                </button>
              </div>

              {/* Inventory summary, integrated as the status filter itself — not decorative KPI cards. */}
              <div className="mt-4 flex flex-wrap gap-1.5">
                <FilterPill
                  active={statusFilter === null}
                  label="All"
                  count={totalCount}
                  onClick={() => setStatusFilter(null)}
                />
                {SPACE_STATUSES.map((status) => (
                  <FilterPill
                    key={status}
                    active={statusFilter === status}
                    label={SPACE_STATUS_LABELS[status]}
                    count={countsByStatus[status] ?? 0}
                    onClick={() => setStatusFilter(status)}
                  />
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search by space or professional…"
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
                <select
                  value={typeFilter ?? ""}
                  onChange={(e) => setTypeFilter(e.target.value || null)}
                  className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-700 outline-none focus:border-neutral-400"
                >
                  <option value="">All types</option>
                  {SPACE_TYPES.map((type) => (
                    <option key={type} value={type}>{SPACE_TYPE_LABELS[type]}</option>
                  ))}
                </select>
              </div>

              <div className="mt-5">
                {isLoading ? (
                  <div className="h-40 animate-pulse rounded-xl bg-neutral-100" />
                ) : isError ? (
                  <ErrorState />
                ) : !spaces || spaces.length === 0 ? (
                  <NoResultsState hasActiveFilters={hasActiveFilters} />
                ) : (
                  <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                    {spaces.map((space) => (
                      <button
                        key={space.id}
                        onClick={() => navigate(`/rentals/spaces/${space.id}`)}
                        className="flex w-full items-center gap-4 border-b border-neutral-100 px-4 py-3.5 text-left transition last:border-b-0 hover:bg-neutral-50 md:px-5"
                      >
                        <span className="min-w-0 flex-[1.2] truncate text-[13px] font-medium text-neutral-800">
                          {space.name}
                        </span>
                        <span className="hidden w-32 flex-shrink-0 text-[13px] text-neutral-500 sm:block">
                          {SPACE_TYPE_LABELS[space.type as keyof typeof SPACE_TYPE_LABELS] ?? space.type}
                        </span>
                        <SpaceStatusBadge status={space.status} className="w-24 flex-shrink-0" />
                        <span className="hidden min-w-0 flex-1 truncate text-[13px] text-neutral-500 md:block">
                          {space.currentProfessional
                            ? space.currentProfessional.businessName ?? space.currentProfessional.name
                            : "—"}
                        </span>
                        <span className="w-20 flex-shrink-0 text-right text-[13px] text-neutral-500">
                          {space.monthlyRate ? `$${space.monthlyRate}` : "—"}
                        </span>
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

function EmptyFacilityState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 py-16 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400">
        <LayoutGrid size={20} />
      </div>
      <p className="font-[Outfit] text-[15px] font-semibold text-neutral-800">This is where you manage your spaces</p>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-neutral-500">
        Spaces are the suites, booths, and treatment rooms you rent to independent professionals.
      </p>
      <button
        onClick={onAdd}
        className="mt-5 flex items-center gap-1.5 rounded-md bg-neutral-900 px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-neutral-800"
      >
        <Plus size={15} />
        Add Space
      </button>
    </div>
  );
}

function NoResultsState({ hasActiveFilters }: { hasActiveFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 py-14 text-center">
      <p className="text-[13px] text-neutral-500">
        {hasActiveFilters ? "No spaces match your search or filters." : "No spaces yet."}
      </p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-rose-200 bg-rose-50/50 py-14 text-center">
      <p className="text-[13px] text-rose-600">Couldn't load spaces. Try refreshing the page.</p>
    </div>
  );
}
