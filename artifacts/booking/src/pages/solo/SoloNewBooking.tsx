/**
 * New booking and Block time on the Solo dashboard's calendar (owner, 2026-11-06), as the Certxa Pro app makes them
 * (app/booking.tsx, app/block-time.tsx): a client (or a new one), one of the owner's own services, and an open time
 * that Certxa works out (business hours, other bookings, blocked time). House calls, add-ons, extra services and
 * repeat bookings are made in the app.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { soloApi } from "@/lib/soloApi";
import { SOLO_COLORS, useSolo } from "./SoloLayout";
import { at, fromTimeValue, minutesIn, clock, type Day } from "./soloTime";
import { money, refreshSolo } from "./soloBookings";
import { ErrorText, Field, inputClass, inputStyle, PrimaryButton, SoloModal } from "./soloUi";

type Customer = { id: number; name: string | null; phone: string | null; email: string | null };
type Service = { id: number; name: string; duration: number | null; price: number | null; offeredAt?: string | null };
type Slot = { time: string; staffId: number };

/** The app holds this much extra room after a visit when it asks for open times. */
const BUFFER_MINUTES = 15;

export function useOwnServices() {
  const { store, user } = useSolo();
  const staffId = Number(user.staffId) > 0 ? Number(user.staffId) : null;
  return useQuery<Service[]>({
    queryKey: ["solo", "services", store.id, staffId],
    queryFn: async () => {
      const [rows, own] = await Promise.all([
        soloApi<Service[]>("/api/services"),
        staffId ? soloApi<{ serviceIds?: number[] }>(`/api/staff/${staffId}/services`).catch(() => null) : Promise.resolve(null),
      ]);
      const ids = Array.isArray(own?.serviceIds) ? own!.serviceIds.map(Number) : [];
      // An empty list means no restriction (the app's rule).
      return (Array.isArray(rows) ? rows : []).filter((s) => ids.length === 0 || ids.includes(Number(s.id)));
    },
  });
}

export function NewBookingDialog({ day: firstDay, tz, prefill, onClose, onBooked }: {
  day: Day; tz: string; prefill?: { customerId: number | null; serviceId: number | null };
  onClose: () => void; onBooked: (day: Day) => void;
}) {
  const qc = useQueryClient();
  const { store, user } = useSolo();
  const staffId = Number(user.staffId) > 0 ? Number(user.staffId) : null;
  const customers = useQuery<Customer[]>({ queryKey: ["solo", "customers", store.id], queryFn: () => soloApi<Customer[]>("/api/customers") });
  const services = useOwnServices();
  // Booked at the owner's place: a house call needs the client's address and is made in the app.
  const bookable = useMemo(() => (services.data ?? []).filter((s) => s.offeredAt !== "client"), [services.data]);

  const [mode, setMode] = useState<"pick" | "new">("pick");
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(prefill?.customerId ?? null);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [serviceId, setServiceId] = useState<number | null>(prefill?.serviceId ?? null);
  const [day, setDay] = useState<Day>(firstDay);
  const [slot, setSlot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (serviceId && services.data && !bookable.some((s) => s.id === serviceId)) setServiceId(null);
  }, [bookable, serviceId, services.data]);

  const service = bookable.find((s) => s.id === serviceId) ?? null;
  const minutes = Number(service?.duration) > 0 ? Number(service!.duration) : 60;
  const chosen = (customers.data ?? []).find((c) => c.id === customerId) ?? null;
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return (customers.data ?? []).filter((c) => !q
      || (c.name ?? "").toLowerCase().includes(q)
      || (digits.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(digits))
      || (c.email ?? "").toLowerCase().includes(q)).slice(0, 8);
  }, [customers.data, search]);

  const slots = useQuery<string[]>({
    queryKey: ["solo", "open-times", store.id, serviceId, day, minutes, staffId],
    enabled: !!service && !!store.bookingSlug,
    queryFn: async () => {
      const rows = await soloApi<Slot[]>(`/api/public/store/${encodeURIComponent(store.bookingSlug!)}/availability?serviceId=${serviceId}&date=${day}&duration=${minutes + BUFFER_MINUTES}${staffId ? `&staffId=${staffId}` : ""}`);
      // Only the owner's own open times: this calendar never books another technician.
      const seen = new Set<string>();
      return (Array.isArray(rows) ? rows : [])
        .filter((r) => (!staffId || Number(r?.staffId) === staffId) && r?.time && !seen.has(r.time) && !!seen.add(r.time))
        .map((r) => r.time).sort((a, b) => +new Date(a) - +new Date(b));
    },
  });
  useEffect(() => setSlot(null), [day, serviceId]);

  const clientReady = mode === "pick" ? !!customerId : !!(newName.trim() || newPhone.trim());
  const save = async () => {
    if (!clientReady || !service || !slot) return;
    setBusy(true); setError("");
    try {
      let id = customerId;
      if (mode === "new") {
        const created = await soloApi<{ id: number }>("/api/customers", {
          method: "POST", body: { ...(newName.trim() ? { name: newName.trim() } : {}), ...(newPhone.trim() ? { phone: newPhone.trim() } : {}) },
        });
        id = created.id;
      }
      await soloApi("/api/appointments", { method: "POST", body: { customerId: id, serviceId: service.id, duration: minutes, date: slot } });
      await refreshSolo(qc);
      onBooked(day);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The booking could not be made. Please try again.");
    } finally { setBusy(false); }
  };

  const muted = { color: SOLO_COLORS.muted };
  const choice = (active: boolean) => `rounded-lg px-3 py-1.5 text-sm font-medium ${active ? "bg-[#F1ECFD] text-[#11152E]" : "text-[#6B6F86] hover:bg-gray-50"}`;

  return (
    <SoloModal title="New booking" onClose={() => !busy && onClose()} wide>
      <div className="space-y-5">
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Client</p>
            <div className="flex gap-1">
              <button type="button" className={choice(mode === "pick")} onClick={() => setMode("pick")}>Existing</button>
              <button type="button" className={choice(mode === "new")} onClick={() => setMode("new")} data-testid="solo-new-client">New client</button>
            </div>
          </div>
          {mode === "pick" ? (
            chosen ? (
              <div className="flex items-center justify-between rounded-xl border px-3 py-2" style={{ borderColor: SOLO_COLORS.border }}>
                <span className="text-sm"><span className="font-semibold">{chosen.name || chosen.phone || chosen.email}</span>{chosen.phone && chosen.name ? <span style={muted}> · {chosen.phone}</span> : null}</span>
                <button type="button" onClick={() => setCustomerId(null)} className="text-sm font-medium" style={{ color: SOLO_COLORS.primary }}>Change</button>
              </div>
            ) : (
              <>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, phone or e-mail" className={inputClass} style={inputStyle} data-testid="solo-client-search" autoFocus />
                {customers.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : matches.length === 0 ? (
                  <p className="text-sm" style={muted}>No clients found.</p>
                ) : (
                  <ul className="max-h-48 divide-y overflow-y-auto rounded-xl border" style={{ borderColor: SOLO_COLORS.border }}>
                    {matches.map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => setCustomerId(c.id)} className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50" data-testid={`solo-client-${c.id}`}>
                          <span className="font-semibold">{c.name || c.phone || c.email}</span>{c.phone && c.name ? <span style={muted}> · {c.phone}</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" className={inputClass} style={inputStyle} data-testid="solo-new-name" />
              <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Mobile number" inputMode="tel" className={inputClass} style={inputStyle} data-testid="solo-new-phone" />
            </div>
          )}
        </section>

        <section className="space-y-2">
          <p className="text-sm font-semibold">Service</p>
          {services.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : bookable.length === 0 ? (
            <p className="text-sm" style={muted}>No services to book yet. Add them in the Certxa Pro app.</p>
          ) : (
            <select value={serviceId ?? ""} onChange={(e) => setServiceId(e.target.value ? Number(e.target.value) : null)} className={inputClass} style={inputStyle} data-testid="solo-service">
              <option value="">Choose a service</option>
              {bookable.map((s) => <option key={s.id} value={s.id}>{s.name} · {Number(s.duration) || 60} min · {money(Math.round(Number(s.price ?? 0) * 100))}</option>)}
            </select>
          )}
        </section>

        <section className="space-y-2">
          <Field label="Day"><input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className={inputClass} style={inputStyle} data-testid="solo-booking-day" /></Field>
          {!service ? null : !store.bookingSlug ? (
            <p className="text-sm text-red-600">Open times are not available for this business yet.</p>
          ) : slots.isLoading ? (
            <div className="flex justify-center py-3"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
          ) : slots.error ? (
            <p className="text-sm text-red-600">Open times could not be loaded. Please try again.</p>
          ) : (slots.data ?? []).length === 0 ? (
            <p className="text-sm" style={muted}>No open times on this day.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="solo-open-times">
              {(slots.data ?? []).map((t) => (
                <button key={t} type="button" onClick={() => setSlot(t)}
                  className={`rounded-lg border px-2 py-2 text-sm font-medium ${slot === t ? "border-[#7C3AED] bg-[#F1ECFD]" : "hover:bg-gray-50"}`}
                  style={slot === t ? undefined : { borderColor: SOLO_COLORS.border }}>
                  {clock(minutesIn(t, tz))}
                </button>
              ))}
            </div>
          )}
        </section>

        <ErrorText>{error}</ErrorText>
        <PrimaryButton onClick={save} busy={busy} disabled={!clientReady || !service || !slot} testId="solo-booking-save">Book</PrimaryButton>
      </div>
    </SoloModal>
  );
}

export function BlockTimeDialog({ day: firstDay, tz, onClose, onSaved }: { day: Day; tz: string; onClose: () => void; onSaved: (day: Day) => void }) {
  const qc = useQueryClient();
  const [day, setDay] = useState<Day>(firstDay);
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState("12:00");
  const [end, setEnd] = useState("13:00");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!allDay && fromTimeValue(end) <= fromTimeValue(start)) { setError("The end time has to be after the start time."); return; }
    setBusy(true); setError("");
    try {
      const startsAt = at(day, allDay ? 0 : fromTimeValue(start), tz);
      const endsAt = at(day, allDay ? 1440 : fromTimeValue(end), tz);
      await soloApi("/api/time-blocks", { method: "POST", body: { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), allDay, ...(note.trim() ? { note: note.trim() } : {}) } });
      await refreshSolo(qc);
      onSaved(day);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The time could not be blocked. Please try again.");
    } finally { setBusy(false); }
  };

  return (
    <SoloModal title="Block time" onClose={() => !busy && onClose()}>
      <div className="space-y-3">
        <Field label="Day"><input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className={inputClass} style={inputStyle} data-testid="solo-block-day" /></Field>
        <label className="flex items-center justify-between py-1">
          <span className="text-sm font-semibold">All day</span>
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-5 w-5 accent-[#7C3AED]" data-testid="solo-block-all-day" />
        </label>
        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="From"><input type="time" step={300} value={start} onChange={(e) => e.target.value && setStart(e.target.value)} className={inputClass} style={inputStyle} data-testid="solo-block-start" /></Field>
            <Field label="To"><input type="time" step={300} value={end} onChange={(e) => e.target.value && setEnd(e.target.value)} className={inputClass} style={inputStyle} data-testid="solo-block-end" /></Field>
          </div>
        )}
        <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="e.g. Lunch" className={inputClass} style={inputStyle} data-testid="solo-block-note" /></Field>
        <ErrorText>{error}</ErrorText>
        <PrimaryButton onClick={save} busy={busy} testId="solo-block-save">Block time</PrimaryButton>
      </div>
    </SoloModal>
  );
}
