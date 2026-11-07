/**
 * Solo dashboard › Clients (owner, 2026-11-06; plans/solo-web-dashboard.md): the Certxa Pro app's Clients tab
 * (app/(tabs)/clients.tsx). Search by name, phone or e-mail; filter by the website's status rule
 * (shared/clientStatus.ts) plus Upcoming; add a client; each row opens the client's profile.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatInTimeZone } from "date-fns-tz";
import { Loader2, Search } from "lucide-react";
import { clientStatusOf, type ClientStatus } from "@shared/clientStatus";
import { soloApi } from "@/lib/soloApi";
import { SOLO_COLORS, useSolo } from "./SoloLayout";
import { refreshSolo } from "./soloBookings";
import { ErrorText, errorText, inputClass, inputStyle, PrimaryButton, SoloModal } from "./soloUi";

export type SoloCustomer = {
  id: number; name: string | null; phone: string | null; email: string | null; avatarUrl?: string | null; isVip?: boolean | null;
  visits?: number | null; lastVisitAt?: string | null; lastService?: string | null; nextAppointmentAt?: string | null;
};

type Filter = "all" | "upcoming" | ClientStatus;
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All clients" }, { key: "upcoming", label: "Upcoming" }, { key: "new", label: "New" }, { key: "regular", label: "Regular" },
  { key: "at_risk", label: "At risk" }, { key: "inactive", label: "Inactive" }, { key: "vip", label: "VIP" },
];
export const STATUS_LABEL: Record<ClientStatus, string> = { new: "New", regular: "Regular", vip: "VIP", at_risk: "At risk", inactive: "Inactive" };

export function statusOf(c: SoloCustomer): ClientStatus {
  const days = c.lastVisitAt ? Math.max(0, Math.floor((Date.now() - new Date(c.lastVisitAt).getTime()) / 86_400_000)) : null;
  return clientStatusOf({ isVip: !!c.isVip, visits: Number(c.visits ?? 0), daysSinceLastVisit: days });
}

export const initialsOf = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";

export function useSoloCustomers() {
  const { store } = useSolo();
  return useQuery<SoloCustomer[]>({ queryKey: ["solo", "customers", store.id], queryFn: () => soloApi<SoloCustomer[]>("/api/customers") });
}

export default function SoloClients() {
  const { store } = useSolo();
  const tz = store.timezone || "America/Los_Angeles";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const customers = useSoloCustomers();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const rows = useMemo(() => (customers.data ?? []).map((c) => ({ c, status: statusOf(c) })), [customers.data]);
  const matches = (key: Filter, r: (typeof rows)[number]) => key === "all" ? true : key === "upcoming" ? !!r.c.nextAppointmentAt : r.status === key;
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, rows.filter((r) => matches(f.key, r)).length])), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => {
    const words = search.trim().toLowerCase();
    const digits = search.replace(/\D/g, "");
    return rows.filter((r) => matches(filter, r)).filter(({ c }) => !words
      || (c.name ?? "").toLowerCase().includes(words)
      || (c.email ?? "").toLowerCase().includes(words)
      || (digits.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(digits)))
      .sort((a, b) => filter === "upcoming" ? +new Date(a.c.nextAppointmentAt ?? 0) - +new Date(b.c.nextAppointmentAt ?? 0) : 0);
  }, [rows, filter, search]); // eslint-disable-line react-hooks/exhaustive-deps

  const date = (iso: string) => formatInTimeZone(new Date(iso), tz, "MMM d, yyyy");
  const subtitle = (c: SoloCustomer) => c.nextAppointmentAt ? `Next visit ${date(c.nextAppointmentAt)}`
    : c.lastVisitAt ? `Last visit ${date(c.lastVisitAt)}${c.lastService ? ` · ${c.lastService}` : ""}` : "No visits yet";

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true); setError("");
    try {
      const digits = phone.replace(/\D/g, "");
      const created = await soloApi<{ id: number }>("/api/customers", { method: "POST", body: { name: name.trim(), ...(digits ? { phone: digits } : {}) } });
      await refreshSolo(qc);
      setAdding(false); setName(""); setPhone("");
      navigate(`/solo/clients/${created.id}`);
    } catch (e) { setError(errorText(e, "Could not save the client.")); }
    finally { setSaving(false); }
  };

  const muted = { color: SOLO_COLORS.muted };
  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-6 md:px-8 md:pt-8">
      <div className="flex items-center gap-3">
        <h1 className="mr-auto text-[24px] font-semibold tracking-tight">Clients</h1>
        <button type="button" onClick={() => { setError(""); setAdding(true); }} className="rounded-xl px-3.5 py-2 text-sm font-semibold text-white" style={{ background: SOLO_COLORS.primary }} data-testid="solo-add-client">Add client</button>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={muted} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, phone or e-mail" className={`${inputClass} pl-9`} style={inputStyle} data-testid="solo-clients-search" />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className={`${inputClass} sm:w-56`} style={inputStyle} data-testid="solo-clients-filter">
          {FILTERS.filter((f) => f.key === "all" || counts[f.key] > 0 || f.key === filter).map((f) => <option key={f.key} value={f.key}>{f.label} ({counts[f.key] ?? 0})</option>)}
        </select>
      </div>

      <div className="mb-2 mt-5 flex items-baseline justify-between">
        <h2 className="text-base font-semibold">{FILTERS.find((f) => f.key === filter)?.label}</h2>
        <span className="text-sm" style={muted} data-testid="solo-clients-count">{shown.length}</span>
      </div>

      {customers.isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
      ) : customers.error ? (
        <p className="text-sm text-red-600">Your clients could not be loaded. Please try again.</p>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border bg-white p-8 text-center" style={{ borderColor: SOLO_COLORS.border }}>
          <p className="text-sm font-semibold">No clients found</p>
          <p className="mt-1 text-sm" style={muted}>Try another search or filter, or add a new client.</p>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-white" style={{ borderColor: SOLO_COLORS.border }} data-testid="solo-clients-list">
          {shown.map(({ c, status }) => {
            const label = c.name || c.phone || c.email || "Client";
            return (
              <li key={c.id} style={{ borderColor: SOLO_COLORS.border }}>
                <button type="button" onClick={() => navigate(`/solo/clients/${c.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#FBFAFE]" data-testid={`solo-client-row-${c.id}`}>
                  {c.avatarUrl ? <img src={c.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                    : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1ECFD] text-sm font-bold" style={{ color: SOLO_COLORS.primary }}>{initialsOf(label)}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{label}</span>
                    <span className="block truncate text-xs" style={muted}>{subtitle(c)}</span>
                  </span>
                  {status !== "regular" && <span className="shrink-0 rounded-full bg-[#F2F1F7] px-2.5 py-0.5 text-[11px] font-semibold text-[#6B6F86]">{STATUS_LABEL[status]}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {adding && (
        <SoloModal title="Add a client" onClose={() => !saving && setAdding(false)}>
          <div className="space-y-3">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" className={inputClass} style={inputStyle} data-testid="solo-add-client-name"
              onKeyDown={(e) => { if (e.key === "Enter") void save(); }} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number (optional)" inputMode="tel" className={inputClass} style={inputStyle} data-testid="solo-add-client-phone"
              onKeyDown={(e) => { if (e.key === "Enter") void save(); }} />
            <ErrorText>{error}</ErrorText>
            <PrimaryButton onClick={save} busy={saving} disabled={!name.trim()} testId="solo-add-client-save">Save client</PrimaryButton>
          </div>
        </SoloModal>
      )}
    </div>
  );
}
