import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Mail, Phone, Globe, DoorOpen } from "lucide-react";
import RentalsTopBar from "@/components/rentals/RentalsTopBar";
import ProfessionalStatusBadge from "@/components/rentals/ProfessionalStatusBadge";
import { useToast } from "@/hooks/use-toast";
import {
  fetchProfessional, updateProfessional, changeProfessionalStatus,
  type ProfessionalDetail,
} from "@/lib/rentals-api";
import {
  PROFESSIONAL_STATUSES, PROFESSIONAL_STATUS_LABELS, PROFESSIONAL_STATUS_DESCRIPTIONS,
  type ProfessionalStatus,
} from "@shared/rentalProfessionals";
import { RENT_FREQUENCY_LABELS, type RentFrequency } from "@shared/rentalAgreements";

export default function ProfessionalDetailPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = Number(idParam);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);

  const { data: pro, isLoading, isError } = useQuery({
    queryKey: ["/api/rentals/professionals", id],
    queryFn: () => fetchProfessional(id),
    enabled: Number.isFinite(id),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/rentals/professionals"] });
    queryClient.invalidateQueries({ queryKey: ["/api/rentals/overview"] });
  };

  const statusMutation = useMutation({
    mutationFn: (status: ProfessionalStatus) => changeProfessionalStatus(id, status),
    onSuccess: (updated) => {
      queryClient.setQueryData(["/api/rentals/professionals", id], (prev: ProfessionalDetail | undefined) =>
        prev ? { ...prev, ...updated } : prev);
      invalidateAll();
      toast({ title: `Marked ${PROFESSIONAL_STATUS_LABELS[updated.status as ProfessionalStatus]}` });
    },
    onError: () => toast({ title: "Couldn't change status", description: "Please try again.", variant: "destructive" }),
  });

  if (!Number.isFinite(id)) return <NotFoundState onBack={() => navigate("/rentals/professionals")} />;

  return (
    <div className="flex h-full flex-col">
      <RentalsTopBar title={pro?.name ?? "Professional"} />
      <div className="flex-1 overflow-y-auto px-5 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-lg">
          <button
            onClick={() => navigate("/rentals/professionals")}
            className="mb-5 flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-neutral-700"
          >
            <ArrowLeft size={14} />
            Back to Professionals
          </button>

          {isLoading ? (
            <div className="h-48 animate-pulse rounded-xl bg-neutral-100" />
          ) : isError || !pro ? (
            <NotFoundState onBack={() => navigate("/rentals/professionals")} />
          ) : editing ? (
            <EditProfessionalForm pro={pro} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); invalidateAll(); }} />
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[17px] font-semibold text-neutral-500">
                    {pro.name.trim().charAt(0).toUpperCase() || "?"}
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate font-[Outfit] text-[18px] font-semibold text-neutral-900">{pro.name}</h2>
                    {pro.businessName && <p className="truncate text-[13px] text-neutral-500">{pro.businessName}</p>}
                  </div>
                </div>
                <button
                  onClick={() => setEditing(true)}
                  className="flex-shrink-0 rounded-md border border-neutral-200 px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Edit
                </button>
              </div>

              <div className="mt-4">
                <ProfessionalStatusBadge status={pro.status} />
                <p className="mt-0.5 text-[12px] text-neutral-400">{PROFESSIONAL_STATUS_DESCRIPTIONS[pro.status as ProfessionalStatus]}</p>
              </div>

              <div className="mt-5 divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
                {pro.businessType && (
                  <Row label="Business Type"><span className="text-[13px] text-neutral-700">{pro.businessType}</span></Row>
                )}
                {(pro.phone || pro.email) && (
                  <Row label="Contact">
                    <div className="space-y-1">
                      {pro.phone && (
                        <div className="flex items-center gap-2 text-[13px] text-neutral-700">
                          <Phone size={13} className="text-neutral-400" />
                          {pro.phone}
                        </div>
                      )}
                      {pro.email && (
                        <div className="flex items-center gap-2 text-[13px] text-neutral-700">
                          <Mail size={13} className="text-neutral-400" />
                          {pro.email}
                        </div>
                      )}
                    </div>
                  </Row>
                )}
                <Row label="Space">
                  {pro.currentSpace && pro.agreement ? (
                    <div>
                      <Link
                        to={`/rentals/leases/${pro.agreement.id}`}
                        className="flex items-center gap-2 text-[13px] font-medium text-neutral-700 hover:text-neutral-900"
                      >
                        <DoorOpen size={14} className="text-neutral-400" />
                        {pro.currentSpace.name}
                      </Link>
                      {pro.agreement.rentAmount && (
                        <p className="mt-0.5 text-[12px] text-neutral-400">
                          ${pro.agreement.rentAmount} {RENT_FREQUENCY_LABELS[pro.agreement.rentFrequency as RentFrequency] ?? pro.agreement.rentFrequency}
                          {" · "}
                          {new Date(pro.agreement.startDate as string).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                          {" → "}
                          {pro.agreement.endDate ? new Date(pro.agreement.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Month-to-month"}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <span className="text-[13px] text-neutral-400">No space assigned</span>
                      <Link to="/rentals/leases/new" className="mt-0.5 block text-[11.5px] text-neutral-500 underline">
                        Create a rental agreement
                      </Link>
                    </div>
                  )}
                </Row>
                {pro.description && (
                  <Row label="About"><span className="text-[13px] leading-relaxed text-neutral-700">{pro.description}</span></Row>
                )}
                {(pro.website || (pro.socialLinks && pro.socialLinks.length > 0)) && (
                  <Row label="Online">
                    <div className="space-y-1">
                      {pro.website && (
                        <a
                          href={pro.website}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 text-[13px] text-neutral-700 hover:text-neutral-900"
                        >
                          <Globe size={13} className="text-neutral-400" />
                          {pro.website}
                        </a>
                      )}
                      {pro.socialLinks?.map((link) => (
                        <a
                          key={link.url}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-[13px] text-neutral-700 hover:text-neutral-900"
                        >
                          {link.platform}
                        </a>
                      ))}
                    </div>
                  </Row>
                )}
                {pro.notes && (
                  <Row label="Notes"><span className="text-[13px] leading-relaxed text-neutral-700">{pro.notes}</span></Row>
                )}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {PROFESSIONAL_STATUSES.filter((s) => s !== pro.status).map((s) => (
                  <button
                    key={s}
                    disabled={statusMutation.isPending}
                    onClick={() => statusMutation.mutate(s)}
                    className="rounded-md border border-neutral-200 px-3 py-1.5 text-[13px] font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
                  >
                    Mark {PROFESSIONAL_STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
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

function EditProfessionalForm({
  pro,
  onCancel,
  onSaved,
}: {
  pro: ProfessionalDetail;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [firstName, setFirstName] = useState(pro.firstName ?? "");
  const [lastName, setLastName] = useState(pro.lastName ?? "");
  const [businessName, setBusinessName] = useState(pro.businessName ?? "");
  const [businessType, setBusinessType] = useState(pro.businessType ?? "");
  const [phone, setPhone] = useState(pro.phone ?? "");
  const [email, setEmail] = useState(pro.email ?? "");
  const [description, setDescription] = useState(pro.description ?? "");
  const [website, setWebsite] = useState(pro.website ?? "");
  const [notes, setNotes] = useState(pro.notes ?? "");

  useEffect(() => {
    setFirstName(pro.firstName ?? "");
    setLastName(pro.lastName ?? "");
    setBusinessName(pro.businessName ?? "");
    setBusinessType(pro.businessType ?? "");
    setPhone(pro.phone ?? "");
    setEmail(pro.email ?? "");
    setDescription(pro.description ?? "");
    setWebsite(pro.website ?? "");
    setNotes(pro.notes ?? "");
  }, [pro]);

  const mutation = useMutation({
    mutationFn: () =>
      updateProfessional(pro.id, {
        name: [firstName.trim(), lastName.trim()].filter(Boolean).join(" ") || pro.name,
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        businessName: businessName.trim() || null,
        businessType: businessType.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        description: description.trim() || null,
        website: website.trim() || null,
        notes: notes.trim() || null,
      }),
    onSuccess: () => { toast({ title: "Professional updated" }); onSaved(); },
    onError: () => toast({ title: "Couldn't save changes", description: "Please try again.", variant: "destructive" }),
  });

  const canSubmit = firstName.trim().length > 0 || pro.name.trim().length > 0;

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (canSubmit) mutation.mutate(); }}
      className="rounded-xl border border-neutral-200 bg-white p-5"
    >
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First Name"><input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} /></Field>
          <Field label="Last Name"><input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} /></Field>
        </div>
        <Field label="Business Name"><input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className={inputClass} /></Field>
        <Field label="Business Type"><input value={businessType} onChange={(e) => setBusinessType(e.target.value)} className={inputClass} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} /></Field>
          <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} /></Field>
        </div>
        <Field label="About"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${inputClass} resize-none`} /></Field>
        <Field label="Website"><input value={website} onChange={(e) => setWebsite(e.target.value)} className={inputClass} /></Field>
        <Field label="Notes"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputClass} resize-none`} /></Field>
      </div>
      <p className="mt-4 text-[11.5px] text-neutral-400">
        Status isn't changed here — use the status actions on the professional's page instead.
      </p>
      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          disabled={!canSubmit || mutation.isPending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {mutation.isPending ? "Saving…" : "Save Changes"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md px-4 py-2 text-[13px] font-medium text-neutral-500 hover:text-neutral-700">
          Cancel
        </button>
      </div>
    </form>
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
      <p className="text-[13px] text-neutral-500">This professional couldn't be found.</p>
      <button onClick={onBack} className="mt-3 text-[13px] font-medium text-neutral-700 underline">
        Back to Professionals
      </button>
    </div>
  );
}
