import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import RentalsTopBar from "@/components/rentals/RentalsTopBar";
import AmenityPicker from "@/components/rentals/AmenityPicker";
import { useToast } from "@/hooks/use-toast";
import { createSpace } from "@/lib/rentals-api";
import { SPACE_TYPES, SPACE_TYPE_LABELS, SPACE_STATUSES, SPACE_STATUS_LABELS } from "@shared/rentalSpaces";

export default function AddSpacePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [type, setType] = useState<string>("suite");
  const [status, setStatus] = useState<string>("available");
  const [monthlyRate, setMonthlyRate] = useState("");
  const [baseRatePeriodDays, setBaseRatePeriodDays] = useState(30);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [amenities, setAmenities] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: () =>
      createSpace({
        name: name.trim(),
        type,
        status,
        monthlyRate: monthlyRate.trim() || null,
        baseRatePeriodDays,
        description: description.trim() || null,
        notes: notes.trim() || null,
        amenities,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rentals/spaces"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rentals/overview"] });
      toast({ title: "Space created", description: `${created.name} was added to your facility.` });
      navigate(`/rentals/spaces/${created.id}`);
    },
    onError: () => {
      toast({ title: "Couldn't create space", description: "Please try again.", variant: "destructive" });
    },
  });

  const canSubmit = name.trim().length > 0 && !mutation.isPending;

  return (
    <div className="flex h-full flex-col">
      <RentalsTopBar title="Add Space" />
      <div className="flex-1 overflow-y-auto px-5 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-lg">
          <button
            onClick={() => navigate("/rentals/spaces")}
            className="mb-5 flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-neutral-700"
          >
            <ArrowLeft size={14} />
            Back to Spaces
          </button>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) mutation.mutate();
            }}
          >
            <FormSection title="Space">
              <Field label="Name / Number">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Suite 4"
                  className={inputClass}
                />
              </Field>
              <Field label="Type">
                <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
                  {SPACE_TYPES.map((t) => (
                    <option key={t} value={t}>{SPACE_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </Field>
            </FormSection>

            <FormSection title="Rental">
              <Field label="Base Rate" hint="Amount charged every X days, before any agreement-specific terms">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-neutral-400">$</span>
                  <input
                    inputMode="decimal"
                    value={monthlyRate}
                    onChange={(e) => setMonthlyRate(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="0.00"
                    className={`${inputClass} pl-6`}
                  />
                </div>
              </Field>
              <Field label="Every" hint="Number of days between base-rate charges (e.g., 7 = weekly, 14 = biweekly, 30 = monthly)">
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={baseRatePeriodDays}
                  onChange={(e) => setBaseRatePeriodDays(Math.max(1, Math.min(365, parseInt(e.target.value) || 30)))}
                  className={inputClass}
                />
              </Field>
              <Field label="Availability">
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
                  {SPACE_STATUSES.map((s) => (
                    <option key={s} value={s}>{SPACE_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </Field>
            </FormSection>

            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              className="mt-6 flex items-center gap-1.5 text-[13px] font-medium text-neutral-500 hover:text-neutral-700"
            >
              {detailsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {detailsOpen ? "Hide details" : "Add description, amenities, or notes"}
            </button>

            {detailsOpen && (
              <FormSection title="Details" className="mt-3">
                <Field label="Description" hint="A short summary of the space">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className={`${inputClass} resize-none`}
                  />
                </Field>
                <Field label="Amenities">
                  <AmenityPicker value={amenities} onChange={setAmenities} />
                </Field>
                <Field label="Notes" hint="Private — visible only to you and your team">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className={`${inputClass} resize-none`}
                  />
                </Field>
              </FormSection>
            )}

            <div className="mt-8 flex items-center gap-2">
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded-md bg-neutral-900 px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {mutation.isPending ? "Creating…" : "Create Space"}
              </button>
              <button
                type="button"
                onClick={() => navigate("/rentals/spaces")}
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
