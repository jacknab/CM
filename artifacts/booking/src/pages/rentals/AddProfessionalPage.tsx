import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import RentalsTopBar from "@/components/rentals/RentalsTopBar";
import { useToast } from "@/hooks/use-toast";
import { createProfessional } from "@/lib/rentals-api";
import { PROFESSIONAL_STATUSES, PROFESSIONAL_STATUS_LABELS } from "@shared/rentalProfessionals";

export default function AddProfessionalPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string>("active");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      createProfessional({
        name: [firstName.trim(), lastName.trim()].filter(Boolean).join(" "),
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        businessName: businessName.trim() || null,
        businessType: businessType.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        status,
        description: description.trim() || null,
        website: website.trim() || null,
        notes: notes.trim() || null,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rentals/professionals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rentals/overview"] });
      toast({ title: "Professional added", description: `${created.name} was added to your facility.` });
      navigate(`/rentals/professionals/${created.id}`);
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't add professional",
        description: err?.message?.includes("email") ? "Please check the email address." : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const canSubmit = firstName.trim().length > 0 && !mutation.isPending;

  return (
    <div className="flex h-full flex-col">
      <RentalsTopBar title="Add Professional" />
      <div className="flex-1 overflow-y-auto px-5 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-lg">
          <button
            onClick={() => navigate("/rentals/professionals")}
            className="mb-5 flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-neutral-700"
          >
            <ArrowLeft size={14} />
            Back to Professionals
          </button>

          <form onSubmit={(e) => { e.preventDefault(); if (canSubmit) mutation.mutate(); }}>
            <FormSection title="Person">
              <div className="grid grid-cols-2 gap-3">
                <Field label="First Name">
                  <input autoFocus value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
                </Field>
                <Field label="Last Name">
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
                </Field>
              </div>
            </FormSection>

            <FormSection title="Business" className="mt-5">
              <Field label="Business Name">
                <input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Luxe Nails Studio"
                  className={inputClass}
                />
              </Field>
              <Field label="Business Type" hint="e.g. Nail Technician, Hair Stylist, Esthetician">
                <input value={businessType} onChange={(e) => setBusinessType(e.target.value)} className={inputClass} />
              </Field>
            </FormSection>

            <FormSection title="Contact" className="mt-5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone">
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
                </Field>
                <Field label="Email">
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
                </Field>
              </div>
            </FormSection>

            <FormSection title="Facility" className="mt-5">
              <Field label="Status">
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
                  {PROFESSIONAL_STATUSES.map((s) => (
                    <option key={s} value={s}>{PROFESSIONAL_STATUS_LABELS[s]}</option>
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
              {detailsOpen ? "Hide details" : "Add description, website, or notes"}
            </button>

            {detailsOpen && (
              <FormSection title="Details" className="mt-3">
                <Field label="Description" hint="A short summary of their business">
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
                </Field>
                <Field label="Website">
                  <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" className={inputClass} />
                </Field>
                <Field label="Notes" hint="Private — visible only to you and your team">
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
                </Field>
              </FormSection>
            )}

            <div className="mt-8 flex items-center gap-2">
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded-md bg-neutral-900 px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {mutation.isPending ? "Adding…" : "Add Professional"}
              </button>
              <button
                type="button"
                onClick={() => navigate("/rentals/professionals")}
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
