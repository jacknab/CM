import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, LayoutGrid, Users } from "lucide-react";
import RentalsTopBar from "@/components/rentals/RentalsTopBar";
import { useToast } from "@/hooks/use-toast";
import { fetchProfessionals, professionalsQueryKey, fetchSpacesForDates, createLease } from "@/lib/rentals-api";
import { RENT_FREQUENCIES, RENT_FREQUENCY_LABELS } from "@shared/rentalAgreements";

function todayInputValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AddLeasePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: professionals, isLoading: loadingPros } = useQuery({
    queryKey: professionalsQueryKey({}),
    queryFn: () => fetchProfessionals({}),
  });

  const [professionalId, setProfessionalId] = useState<string>("");
  const [spaceId, setSpaceId] = useState<string>("");
  const [startDate, setStartDate] = useState(todayInputValue());
  const [noEndDate, setNoEndDate] = useState(true);
  const [endDate, setEndDate] = useState("");
  const [rentAmount, setRentAmount] = useState("");
  const [rentFrequency, setRentFrequency] = useState<string>("monthly");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [noticePeriodDays, setNoticePeriodDays] = useState("");
  const [notes, setNotes] = useState("");

  const effectiveEndDate = noEndDate ? null : endDate || null;

  const { data: spacesForDates, isLoading: loadingSpaces } = useQuery({
    queryKey: ["/api/rentals/spaces-for-dates", startDate, effectiveEndDate ?? ""],
    queryFn: () => fetchSpacesForDates(startDate, effectiveEndDate),
    enabled: !!startDate,
  });

  const selectedProfessional = useMemo(
    () => professionals?.find((p) => String(p.id) === professionalId),
    [professionals, professionalId],
  );
  const selectedSpace = useMemo(
    () => spacesForDates?.find((s) => String(s.id) === spaceId),
    [spacesForDates, spaceId],
  );

  const mutation = useMutation({
    mutationFn: () =>
      createLease({
        professionalId: Number(professionalId),
        spaceId: Number(spaceId),
        startDate,
        endDate: effectiveEndDate,
        rentAmount: rentAmount.trim(),
        rentFrequency: rentFrequency as any,
        depositAmount: depositAmount.trim() || null,
        noticePeriodDays: noticePeriodDays ? Number(noticePeriodDays) : null,
        notes: notes.trim() || null,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rentals/leases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rentals/spaces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rentals/professionals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rentals/overview"] });
      toast({ title: "Rental agreement created" });
      navigate(`/rentals/leases/${created.id}`);
    },
    onError: (err: any) => {
      toast({ title: "Couldn't create agreement", description: err?.message ?? "Please try again.", variant: "destructive" });
    },
  });

  const canSubmit =
    !!professionalId && !!spaceId && !!startDate && rentAmount.trim().length > 0 &&
    !selectedSpace?.conflict && !mutation.isPending;

  if (!loadingPros && (!professionals || professionals.length === 0)) {
    return <PrerequisiteMissing icon={Users} title="Add a professional first" description="You'll need at least one professional before you can create a rental agreement." to="/rentals/professionals/new" cta="Add Professional" />;
  }
  if (!loadingSpaces && spacesForDates && spacesForDates.length === 0) {
    return <PrerequisiteMissing icon={LayoutGrid} title="Add a space first" description="You'll need at least one space before you can create a rental agreement." to="/rentals/spaces/new" cta="Add Space" />;
  }

  return (
    <div className="flex h-full flex-col">
      <RentalsTopBar title="Create Rental Agreement" />
      <div className="flex-1 overflow-y-auto px-5 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-lg">
          <button
            onClick={() => navigate("/rentals/leases")}
            className="mb-5 flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-neutral-700"
          >
            <ArrowLeft size={14} />
            Back to Leases
          </button>

          <form onSubmit={(e) => { e.preventDefault(); if (canSubmit) mutation.mutate(); }}>
            <FormSection title="Who">
              <Field label="Professional">
                <select value={professionalId} onChange={(e) => setProfessionalId(e.target.value)} className={inputClass} required>
                  <option value="" disabled>Select a professional…</option>
                  {professionals?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.businessName ? ` — ${p.businessName}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            </FormSection>

            <FormSection title="When" className="mt-5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start Date">
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} required />
                </Field>
                <Field label="End Date">
                  <input
                    type="date"
                    value={endDate}
                    disabled={noEndDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={`${inputClass} disabled:bg-neutral-50 disabled:text-neutral-400`}
                  />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-[12.5px] text-neutral-600">
                <input type="checkbox" checked={noEndDate} onChange={(e) => setNoEndDate(e.target.checked)} className="rounded border-neutral-300" />
                No end date (month-to-month)
              </label>
            </FormSection>

            <FormSection title="Space" className="mt-5">
              <Field label="Space" hint={loadingSpaces ? "Checking availability…" : undefined}>
                <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)} className={inputClass} required>
                  <option value="" disabled>Select a space…</option>
                  {spacesForDates?.map((s) => (
                    <option key={s.id} value={s.id} disabled={!!s.conflict}>
                      {s.name}
                      {s.conflict ? ` — Unavailable (rented by ${s.conflict.professionalName})` : s.monthlyRate ? ` — $${s.monthlyRate} base` : ""}
                    </option>
                  ))}
                </select>
                {selectedSpace?.conflict && (
                  <p className="mt-1.5 text-[12px] text-rose-600">
                    This space is already rented by {selectedSpace.conflict.professionalName} during part of these dates.
                    Choose another space or adjust the dates.
                  </p>
                )}
                {!loadingSpaces && spacesForDates && spacesForDates.length === 0 && (
                  <p className="mt-1.5 text-[12px] text-neutral-400">No spaces exist yet.</p>
                )}
              </Field>
            </FormSection>

            <FormSection title="Rent" className="mt-5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Rent Amount">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-neutral-400">$</span>
                    <input
                      inputMode="decimal"
                      value={rentAmount}
                      onChange={(e) => setRentAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder="0.00"
                      className={`${inputClass} pl-6`}
                      required
                    />
                  </div>
                </Field>
                <Field label="Frequency">
                  <select value={rentFrequency} onChange={(e) => setRentFrequency(e.target.value)} className={inputClass}>
                    {RENT_FREQUENCIES.map((f) => (
                      <option key={f} value={f}>{RENT_FREQUENCY_LABELS[f]}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </FormSection>

            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              className="mt-6 flex items-center gap-1.5 text-[13px] font-medium text-neutral-500 hover:text-neutral-700"
            >
              {detailsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {detailsOpen ? "Hide terms" : "Add deposit, notice period, or notes"}
            </button>

            {detailsOpen && (
              <FormSection title="Terms" className="mt-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Deposit">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-neutral-400">$</span>
                      <input
                        inputMode="decimal"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                        className={`${inputClass} pl-6`}
                      />
                    </div>
                  </Field>
                  <Field label="Notice Period (days)">
                    <input
                      inputMode="numeric"
                      value={noticePeriodDays}
                      onChange={(e) => setNoticePeriodDays(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="30"
                      className={inputClass}
                    />
                  </Field>
                </div>
                <Field label="Notes / Terms">
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
                </Field>
              </FormSection>
            )}

            {selectedProfessional && selectedSpace && rentAmount && (
              <div className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
                <p className="flex items-center gap-1.5 text-[13px] font-medium text-neutral-800">
                  {selectedProfessional.businessName ?? selectedProfessional.name}
                  <ArrowRight size={12} className="text-neutral-400" />
                  {selectedSpace.name}
                </p>
                <p className="mt-1 text-[12px] text-neutral-500">
                  ${rentAmount || "0"}/{RENT_FREQUENCY_LABELS[rentFrequency as keyof typeof RENT_FREQUENCY_LABELS]?.toLowerCase()} · starting{" "}
                  {new Date(startDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  {effectiveEndDate ? ` → ${new Date(effectiveEndDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : " · month-to-month"}
                </p>
              </div>
            )}

            <div className="mt-6 flex items-center gap-2">
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded-md bg-neutral-900 px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {mutation.isPending ? "Creating…" : "Create Agreement"}
              </button>
              <button
                type="button"
                onClick={() => navigate("/rentals/leases")}
                className="rounded-md px-4 py-2.5 text-[13px] font-medium text-neutral-500 hover:text-neutral-700"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function PrerequisiteMissing({
  icon: Icon,
  title,
  description,
  to,
  cta,
}: {
  icon: typeof Users;
  title: string;
  description: string;
  to: string;
  cta: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col">
      <RentalsTopBar title="Create Rental Agreement" />
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400">
          <Icon size={20} />
        </div>
        <p className="font-[Outfit] text-[15px] font-semibold text-neutral-800">{title}</p>
        <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-neutral-500">{description}</p>
        <button
          onClick={() => navigate(to)}
          className="mt-5 rounded-md bg-neutral-900 px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-neutral-800"
        >
          {cta}
        </button>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-800 outline-none focus:border-neutral-400";

function FormSection({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="font-[Outfit] text-[12px] font-semibold uppercase tracking-wide text-neutral-400">{title}</p>
      <div className="mt-2.5 space-y-3.5">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-neutral-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-neutral-400">{hint}</span>}
    </label>
  );
}
