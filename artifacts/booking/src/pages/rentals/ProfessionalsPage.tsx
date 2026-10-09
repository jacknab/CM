import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Plus, Users, X } from "lucide-react";
import RentalsTopBar from "@/components/rentals/RentalsTopBar";
import ProfessionalStatusBadge from "@/components/rentals/ProfessionalStatusBadge";
import { fetchProfessionals, professionalsQueryKey } from "@/lib/rentals-api";
import { PROFESSIONAL_STATUSES, PROFESSIONAL_STATUS_LABELS, type ProfessionalStatus } from "@shared/rentalProfessionals";

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function ProfessionalsPage() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput, 300);
  const [statusFilter, setStatusFilter] = useState<ProfessionalStatus | null>(null);
  const [spaceFilter, setSpaceFilter] = useState<"" | "true" | "false">("");

  const filters = { search, status: statusFilter ?? undefined, hasSpace: spaceFilter || undefined };
  const { data: professionals, isLoading, isError } = useQuery({
    queryKey: professionalsQueryKey(filters),
    queryFn: () => fetchProfessionals(filters),
  });

  // Unfiltered counts for the summary/filter pills — independent of active filters.
  const { data: all } = useQuery({
    queryKey: professionalsQueryKey({}),
    queryFn: () => fetchProfessionals({}),
  });
  const countsByStatus: Record<string, number> = {};
  for (const p of all ?? []) countsByStatus[p.status] = (countsByStatus[p.status] ?? 0) + 1;
  const totalCount = all?.length ?? 0;

  const hasActiveFilters = !!search || !!statusFilter || !!spaceFilter;
  const hasAnyProfessionals = totalCount > 0;

  return (
    <div className="flex h-full flex-col">
      <RentalsTopBar title="Professionals" />
      <div className="flex-1 overflow-y-auto px-5 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-4xl">
          {!hasAnyProfessionals && !isLoading ? (
            <EmptyFacilityState onAdd={() => navigate("/rentals/professionals/new")} />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13px] text-neutral-500">
                  {totalCount} professional{totalCount === 1 ? "" : "s"}
                </p>
                <button
                  onClick={() => navigate("/rentals/professionals/new")}
                  className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800"
                >
                  <Plus size={15} />
                  Add Professional
                </button>
              </div>

              {/* Inventory summary, integrated as the status filter itself — not decorative KPI cards. */}
              <div className="mt-4 flex flex-wrap gap-1.5">
                <FilterPill active={statusFilter === null} label="All" count={totalCount} onClick={() => setStatusFilter(null)} />
                {PROFESSIONAL_STATUSES.map((status) => (
                  <FilterPill
                    key={status}
                    active={statusFilter === status}
                    label={PROFESSIONAL_STATUS_LABELS[status]}
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
                    placeholder="Search by name, business, contact, or space…"
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
                  value={spaceFilter}
                  onChange={(e) => setSpaceFilter(e.target.value as typeof spaceFilter)}
                  className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-700 outline-none focus:border-neutral-400"
                >
                  <option value="">Any space</option>
                  <option value="true">Has a space</option>
                  <option value="false">Unassigned</option>
                </select>
              </div>

              <div className="mt-5">
                {isLoading ? (
                  <div className="h-40 animate-pulse rounded-xl bg-neutral-100" />
                ) : isError ? (
                  <ErrorState />
                ) : !professionals || professionals.length === 0 ? (
                  <NoResultsState hasActiveFilters={hasActiveFilters} />
                ) : (
                  <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                    {professionals.map((pro) => (
                      <button
                        key={pro.id}
                        onClick={() => navigate(`/rentals/professionals/${pro.id}`)}
                        className="flex w-full items-center gap-3.5 border-b border-neutral-100 px-4 py-3.5 text-left transition last:border-b-0 hover:bg-neutral-50 md:px-5"
                      >
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[13px] font-semibold text-neutral-500">
                          {pro.name.trim().charAt(0).toUpperCase() || "?"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-neutral-800">{pro.name}</p>
                          {pro.businessName && (
                            <p className="truncate text-[12px] text-neutral-500">{pro.businessName}</p>
                          )}
                        </div>
                        <span className="hidden w-40 flex-shrink-0 truncate text-[13px] text-neutral-500 md:block">
                          {pro.currentSpace ? pro.currentSpace.name : "Unassigned"}
                        </span>
                        <ProfessionalStatusBadge status={pro.status} className="w-20 flex-shrink-0" />
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
        <Users size={20} />
      </div>
      <p className="font-[Outfit] text-[15px] font-semibold text-neutral-800">This is where you manage your professionals</p>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-neutral-500">
        Independent professionals who rent space at your facility will appear here. They run their own business —
        they're never staff, and never share your commission or payroll system.
      </p>
      <button
        onClick={onAdd}
        className="mt-5 flex items-center gap-1.5 rounded-md bg-neutral-900 px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-neutral-800"
      >
        <Plus size={15} />
        Add Professional
      </button>
    </div>
  );
}

function NoResultsState({ hasActiveFilters }: { hasActiveFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 py-14 text-center">
      <p className="text-[13px] text-neutral-500">
        {hasActiveFilters ? "No professionals match your search or filters." : "No professionals yet."}
      </p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-rose-200 bg-rose-50/50 py-14 text-center">
      <p className="text-[13px] text-rose-600">Couldn't load professionals. Try refreshing the page.</p>
    </div>
  );
}
