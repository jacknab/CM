import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, DoorOpen, Users } from "lucide-react";
import RentalsTopBar from "@/components/rentals/RentalsTopBar";
import AgreementLifecycleBadge from "@/components/rentals/AgreementLifecycleBadge";
import { useToast } from "@/hooks/use-toast";
import {
  fetchLease, updateLease, terminateLease, renewLease, type AgreementWithRelations,
} from "@/lib/rentals-api";
import { RENT_FREQUENCIES, RENT_FREQUENCY_LABELS, AGREEMENT_LIFECYCLE_DESCRIPTIONS, type AgreementLifecycle } from "@shared/rentalAgreements";

function formatDate(d: string | Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}
function todayInputValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Mode = "view" | "edit" | "terminate" | "renew";

export default function LeaseDetailPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = Number(idParam);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("view");

  const { data: lease, isLoading, isError } = useQuery({
    queryKey: ["/api/rentals/leases", id],
    queryFn: () => fetchLease(id),
    enabled: Number.isFinite(id),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/rentals/leases"] });
    queryClient.invalidateQueries({ queryKey: ["/api/rentals/spaces"] });
    queryClient.invalidateQueries({ queryKey: ["/api/rentals/professionals"] });
    queryClient.invalidateQueries({ queryKey: ["/api/rentals/overview"] });
  };

  if (!Number.isFinite(id)) return <NotFoundState onBack={() => navigate("/rentals/leases")} />;

  return (
    <div className="flex h-full flex-col">
      <RentalsTopBar title="Rental Agreement" />
      <div className="flex-1 overflow-y-auto px-5 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-lg">
          <button
            onClick={() => navigate("/rentals/leases")}
            className="mb-5 flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-neutral-700"
          >
            <ArrowLeft size={14} />
            Back to Leases
          </button>

          {isLoading ? (
            <div className="h-56 animate-pulse rounded-xl bg-neutral-100" />
          ) : isError || !lease ? (
            <NotFoundState onBack={() => navigate("/rentals/leases")} />
          ) : mode === "edit" ? (
            <EditLeaseForm lease={lease} onCancel={() => setMode("view")} onSaved={() => { setMode("view"); invalidateAll(); }} />
          ) : mode === "terminate" ? (
            <TerminateLeasePanel lease={lease} onCancel={() => setMode("view")} onDone={() => { setMode("view"); invalidateAll(); }} />
          ) : mode === "renew" ? (
            <RenewLeasePanel lease={lease} onCancel={() => setMode("view")} onDone={(newId) => { invalidateAll(); navigate(`/rentals/leases/${newId}`); }} />
          ) : (
            <LeaseView lease={lease} onEdit={() => setMode("edit")} onTerminate={() => setMode("terminate")} onRenew={() => setMode("renew")} />
          )}
        </div>
      </div>
    </div>
  );
}

function LeaseView({
  lease,
  onEdit,
  onTerminate,
  onRenew,
}: {
  lease: AgreementWithRelations;
  onEdit: () => void;
  onTerminate: () => void;
  onRenew: () => void;
}) {
  const isTerminated = lease.status === "terminated";
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-[Outfit] text-[17px] font-semibold text-neutral-900">
            <span className="truncate">{lease.professional.businessName ?? lease.professional.name}</span>
            <ArrowRight size={15} className="flex-shrink-0 text-neutral-300" />
            <span className="truncate">{lease.space.name}</span>
          </div>
          <div className="mt-2">
            <AgreementLifecycleBadge lifecycle={lease.lifecycle} />
            <p className="mt-0.5 text-[12px] text-neutral-400">{AGREEMENT_LIFECYCLE_DESCRIPTIONS[lease.lifecycle]}</p>
          </div>
        </div>
        {!isTerminated && (
          <button onClick={onEdit} className="flex-shrink-0 rounded-md border border-neutral-200 px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50">
            Edit
          </button>
        )}
      </div>

      <div className="mt-5 divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
        <Row label="Professional">
          <Link to={`/rentals/professionals/${lease.professional.id}`} className="flex items-center gap-2 text-[13px] font-medium text-neutral-700 hover:text-neutral-900">
            <Users size={14} className="text-neutral-400" />
            {lease.professional.name}
          </Link>
        </Row>
        <Row label="Space">
          <Link to={`/rentals/spaces/${lease.space.id}`} className="flex items-center gap-2 text-[13px] font-medium text-neutral-700 hover:text-neutral-900">
            <DoorOpen size={14} className="text-neutral-400" />
            {lease.space.name}
          </Link>
        </Row>
        <Row label="Rent">
          <span className="text-[13px] text-neutral-700">
            {lease.rentAmount ? `$${lease.rentAmount} ${RENT_FREQUENCY_LABELS[lease.rentFrequency as keyof typeof RENT_FREQUENCY_LABELS] ?? lease.rentFrequency}` : "—"}
          </span>
        </Row>
        {lease.rentSummary && (
          <Row label="Rent Status">
            <div>
              <p className="text-[13px] font-medium text-neutral-700">
                Current balance: ${lease.rentSummary.currentBalance}
              </p>
              {lease.rentSummary.nextDue && (
                <Link to="/rentals/rent" className="mt-0.5 block text-[12px] text-neutral-400 hover:text-neutral-600">
                  Next due {new Date(lease.rentSummary.nextDue.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })} — ${lease.rentSummary.nextDue.amount}
                </Link>
              )}
            </div>
          </Row>
        )}
        <Row label="Dates">
          <span className="text-[13px] text-neutral-700">
            {formatDate(lease.startDate)} → {lease.endDate ? formatDate(lease.endDate) : "Month-to-month"}
          </span>
          {isTerminated && lease.terminatedAt && (
            <p className="mt-0.5 text-[12px] text-rose-600">Terminated effective {formatDate(lease.terminatedAt)}</p>
          )}
        </Row>
        {lease.depositAmount && (
          <Row label="Deposit"><span className="text-[13px] text-neutral-700">${lease.depositAmount}</span></Row>
        )}
        {lease.noticePeriodDays != null && (
          <Row label="Notice"><span className="text-[13px] text-neutral-700">{lease.noticePeriodDays} days</span></Row>
        )}
        {lease.notes && (
          <Row label="Notes"><span className="whitespace-pre-line text-[13px] leading-relaxed text-neutral-700">{lease.notes}</span></Row>
        )}
      </div>

      {!isTerminated && (
        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={onRenew} className="rounded-md border border-neutral-200 px-3 py-1.5 text-[13px] font-medium text-neutral-700 transition hover:bg-neutral-50">
            Renew
          </button>
          <button onClick={onTerminate} className="rounded-md border border-rose-200 px-3 py-1.5 text-[13px] font-medium text-rose-600 transition hover:bg-rose-50">
            Terminate Agreement
          </button>
        </div>
      )}
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 px-4 py-3.5 md:px-5">
      <span className="w-24 flex-shrink-0 pt-0.5 text-[12.5px] font-medium text-neutral-400">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function EditLeaseForm({
  lease,
  onCancel,
  onSaved,
}: {
  lease: AgreementWithRelations;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [noEndDate, setNoEndDate] = useState(!lease.endDate);
  const [endDate, setEndDate] = useState(lease.endDate ? String(lease.endDate).slice(0, 10) : "");
  const [rentAmount, setRentAmount] = useState(lease.rentAmount ?? "");
  const [rentFrequency, setRentFrequency] = useState(lease.rentFrequency);
  const [depositAmount, setDepositAmount] = useState(lease.depositAmount ?? "");
  const [noticePeriodDays, setNoticePeriodDays] = useState(lease.noticePeriodDays != null ? String(lease.noticePeriodDays) : "");
  const [notes, setNotes] = useState(lease.notes ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      updateLease(lease.id, {
        endDate: noEndDate ? null : endDate || null,
        rentAmount: rentAmount.trim(),
        rentFrequency: rentFrequency as any,
        depositAmount: depositAmount.trim() || null,
        noticePeriodDays: noticePeriodDays ? Number(noticePeriodDays) : null,
        notes: notes.trim() || null,
      }),
    onSuccess: () => { toast({ title: "Agreement updated" }); onSaved(); },
    onError: (err: any) => toast({ title: "Couldn't save changes", description: err?.message ?? "Please try again.", variant: "destructive" }),
  });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (rentAmount.trim()) mutation.mutate(); }}
      className="rounded-xl border border-neutral-200 bg-white p-5"
    >
      <p className="mb-1 text-[13px] font-medium text-neutral-800">
        {lease.professional.businessName ?? lease.professional.name} → {lease.space.name}
      </p>
      <p className="mb-4 text-[11.5px] text-neutral-400">
        The professional, space, and start date can't be changed here — use Renew to move to a new agreement instead.
      </p>
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="End Date">
            <input type="date" value={endDate} disabled={noEndDate} onChange={(e) => setEndDate(e.target.value)} className={`${inputClass} disabled:bg-neutral-50 disabled:text-neutral-400`} />
          </Field>
          <label className="flex items-end pb-2 gap-2 text-[12.5px] text-neutral-600">
            <input type="checkbox" checked={noEndDate} onChange={(e) => setNoEndDate(e.target.checked)} className="rounded border-neutral-300" />
            Month-to-month
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rent Amount">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-neutral-400">$</span>
              <input inputMode="decimal" value={rentAmount} onChange={(e) => setRentAmount(e.target.value.replace(/[^0-9.]/g, ""))} className={`${inputClass} pl-6`} />
            </div>
          </Field>
          <Field label="Frequency">
            <select value={rentFrequency} onChange={(e) => setRentFrequency(e.target.value)} className={inputClass}>
              {RENT_FREQUENCIES.map((f) => <option key={f} value={f}>{RENT_FREQUENCY_LABELS[f]}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Deposit">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-neutral-400">$</span>
              <input inputMode="decimal" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value.replace(/[^0-9.]/g, ""))} className={`${inputClass} pl-6`} />
            </div>
          </Field>
          <Field label="Notice (days)">
            <input inputMode="numeric" value={noticePeriodDays} onChange={(e) => setNoticePeriodDays(e.target.value.replace(/[^0-9]/g, ""))} className={inputClass} />
          </Field>
        </div>
        <Field label="Notes / Terms">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
        </Field>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button type="submit" disabled={!rentAmount.trim() || mutation.isPending} className="rounded-md bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40">
          {mutation.isPending ? "Saving…" : "Save Changes"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md px-4 py-2 text-[13px] font-medium text-neutral-500 hover:text-neutral-700">
          Cancel
        </button>
      </div>
    </form>
  );
}

function TerminateLeasePanel({
  lease,
  onCancel,
  onDone,
}: {
  lease: AgreementWithRelations;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [effectiveDate, setEffectiveDate] = useState(todayInputValue());
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: () => terminateLease(lease.id, effectiveDate, reason.trim() || undefined),
    onSuccess: () => { toast({ title: "Agreement terminated" }); onDone(); },
    onError: (err: any) => toast({ title: "Couldn't terminate agreement", description: err?.message ?? "Please try again.", variant: "destructive" }),
  });

  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-5">
      <p className="font-[Outfit] text-[14px] font-semibold text-neutral-900">Terminate this agreement?</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-600">
        {lease.professional.businessName ?? lease.professional.name}'s agreement for {lease.space.name} will be marked
        Terminated as of the date below. The full agreement record — dates, rent, and terms — is kept for history; it
        is never deleted.
      </p>
      <div className="mt-4 space-y-3">
        <Field label="Effective Date">
          <input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Reason (optional)">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className={`${inputClass} resize-none`} placeholder="e.g. Professional moved out early" />
        </Field>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="rounded-md bg-rose-600 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-rose-700 disabled:opacity-50"
        >
          {mutation.isPending ? "Terminating…" : "Confirm Termination"}
        </button>
        <button onClick={onCancel} className="rounded-md px-4 py-2 text-[13px] font-medium text-neutral-500 hover:text-neutral-700">
          Cancel
        </button>
      </div>
    </div>
  );
}

function RenewLeasePanel({
  lease,
  onCancel,
  onDone,
}: {
  lease: AgreementWithRelations;
  onCancel: () => void;
  onDone: (newId: number) => void;
}) {
  const { toast } = useToast();
  const prevEnd = lease.endDate ? new Date(lease.endDate) : null;
  const defaultStart = prevEnd ? new Date(prevEnd.getTime() + 86_400_000) : new Date();
  const [startDate, setStartDate] = useState(
    `${defaultStart.getFullYear()}-${String(defaultStart.getMonth() + 1).padStart(2, "0")}-${String(defaultStart.getDate()).padStart(2, "0")}`,
  );
  const [noEndDate, setNoEndDate] = useState(true);
  const [endDate, setEndDate] = useState("");
  const [rentAmount, setRentAmount] = useState(lease.rentAmount ?? "");
  const [rentFrequency, setRentFrequency] = useState(lease.rentFrequency);

  const mutation = useMutation({
    mutationFn: () =>
      renewLease(lease.id, {
        startDate,
        endDate: noEndDate ? null : endDate || null,
        rentAmount: rentAmount.trim(),
        rentFrequency: rentFrequency as any,
        depositAmount: lease.depositAmount,
        noticePeriodDays: lease.noticePeriodDays,
      }),
    onSuccess: (created) => { toast({ title: "Agreement renewed" }); onDone(created.id); },
    onError: (err: any) => toast({ title: "Couldn't renew agreement", description: err?.message ?? "Please try again.", variant: "destructive" }),
  });

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <p className="font-[Outfit] text-[14px] font-semibold text-neutral-900">
        Renew: {lease.professional.businessName ?? lease.professional.name} → {lease.space.name}
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">
        Creates a new agreement with these terms. The current one stays on record — it isn't overwritten.
      </p>
      <div className="mt-4 space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start Date">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          </Field>
          <Field label="End Date">
            <input type="date" value={endDate} disabled={noEndDate} onChange={(e) => setEndDate(e.target.value)} className={`${inputClass} disabled:bg-neutral-50 disabled:text-neutral-400`} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-[12.5px] text-neutral-600">
          <input type="checkbox" checked={noEndDate} onChange={(e) => setNoEndDate(e.target.checked)} className="rounded border-neutral-300" />
          No end date (month-to-month)
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rent Amount">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-neutral-400">$</span>
              <input inputMode="decimal" value={rentAmount} onChange={(e) => setRentAmount(e.target.value.replace(/[^0-9.]/g, ""))} className={`${inputClass} pl-6`} />
            </div>
          </Field>
          <Field label="Frequency">
            <select value={rentFrequency} onChange={(e) => setRentFrequency(e.target.value)} className={inputClass}>
              {RENT_FREQUENCIES.map((f) => <option key={f} value={f}>{RENT_FREQUENCY_LABELS[f]}</option>)}
            </select>
          </Field>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => mutation.mutate()}
          disabled={!startDate || !rentAmount.trim() || mutation.isPending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {mutation.isPending ? "Renewing…" : "Create Renewal"}
        </button>
        <button onClick={onCancel} className="rounded-md px-4 py-2 text-[13px] font-medium text-neutral-500 hover:text-neutral-700">
          Cancel
        </button>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-800 outline-none focus:border-neutral-400";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-neutral-700">{label}</span>
      {children}
    </label>
  );
}

function NotFoundState({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 py-16 text-center">
      <p className="text-[13px] text-neutral-500">This rental agreement couldn't be found.</p>
      <button onClick={onBack} className="mt-3 text-[13px] font-medium text-neutral-700 underline">
        Back to Leases
      </button>
    </div>
  );
}
