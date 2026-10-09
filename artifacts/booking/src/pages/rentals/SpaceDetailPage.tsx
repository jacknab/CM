import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Users } from "lucide-react";
import RentalsTopBar from "@/components/rentals/RentalsTopBar";
import SpaceStatusBadge from "@/components/rentals/SpaceStatusBadge";
import AmenityPicker from "@/components/rentals/AmenityPicker";
import { useToast } from "@/hooks/use-toast";
import { fetchSpace, updateSpace, changeSpaceStatus, type SpaceDetail } from "@/lib/rentals-api";
import {
  SPACE_TYPES, SPACE_TYPE_LABELS, SPACE_STATUS_LABELS, SPACE_STATUS_DESCRIPTIONS,
  SPACE_STATUS_TRANSITIONS, type SpaceStatus,
} from "@shared/rentalSpaces";
import { RENT_FREQUENCY_LABELS, type RentFrequency } from "@shared/rentalAgreements";

export default function SpaceDetailPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = Number(idParam);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);

  const { data: space, isLoading, isError } = useQuery({
    queryKey: ["/api/rentals/spaces", id],
    queryFn: () => fetchSpace(id),
    enabled: Number.isFinite(id),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/rentals/spaces"] });
    queryClient.invalidateQueries({ queryKey: ["/api/rentals/overview"] });
  };

  const statusMutation = useMutation({
    mutationFn: (status: SpaceStatus) => changeSpaceStatus(id, status),
    onSuccess: (updated) => {
      queryClient.setQueryData(["/api/rentals/spaces", id], (prev: SpaceDetail | undefined) =>
        prev ? { ...prev, ...updated } : prev);
      invalidateAll();
      toast({ title: `Marked ${SPACE_STATUS_LABELS[updated.status as SpaceStatus]}` });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't change status",
        description: err?.message?.includes(":") ? err.message.split(":").slice(1).join(":").trim() : "Please try again.",
        variant: "destructive",
      });
    },
  });

  if (!Number.isFinite(id)) return <NotFoundState onBack={() => navigate("/rentals/spaces")} />;

  return (
    <div className="flex h-full flex-col">
      <RentalsTopBar title={space?.name ?? "Space"} />
      <div className="flex-1 overflow-y-auto px-5 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-lg">
          <button
            onClick={() => navigate("/rentals/spaces")}
            className="mb-5 flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-neutral-700"
          >
            <ArrowLeft size={14} />
            Back to Spaces
          </button>

          {isLoading ? (
            <div className="h-48 animate-pulse rounded-xl bg-neutral-100" />
          ) : isError || !space ? (
            <NotFoundState onBack={() => navigate("/rentals/spaces")} />
          ) : editing ? (
            <EditSpaceForm
              space={space}
              onCancel={() => setEditing(false)}
              onSaved={() => { setEditing(false); invalidateAll(); }}
            />
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-[Outfit] text-[19px] font-semibold text-neutral-900">{space.name}</h2>
                  <p className="mt-1 text-[13px] text-neutral-500">
                    {SPACE_TYPE_LABELS[space.type as keyof typeof SPACE_TYPE_LABELS] ?? space.type}
                  </p>
                </div>
                <button
                  onClick={() => setEditing(true)}
                  className="flex-shrink-0 rounded-md border border-neutral-200 px-3 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  Edit Space
                </button>
              </div>

              <div className="mt-5 divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
                <Row label="Status">
                  <div>
                    <SpaceStatusBadge status={space.status} />
                    <p className="mt-0.5 text-[12px] text-neutral-400">
                      {SPACE_STATUS_DESCRIPTIONS[space.status as SpaceStatus]}
                    </p>
                  </div>
                </Row>
                <Row label="Base Rate">
                  <span className="text-[13px] text-neutral-700">
                    {space.monthlyRate
                      ? `$${space.monthlyRate} every ${space.baseRatePeriodDays ?? 30} days`
                      : "Not set"}
                  </span>
                </Row>
                <Row label="Professional">
                  {space.currentProfessional && space.agreement ? (
                    <div>
                      <Link
                        to={`/rentals/leases/${space.agreement.id}`}
                        className="flex items-center gap-2 text-[13px] font-medium text-neutral-700 hover:text-neutral-900"
                      >
                        <Users size={14} className="text-neutral-400" />
                        {space.currentProfessional.businessName ?? space.currentProfessional.name}
                      </Link>
                      {space.agreement.rentAmount && (
                        <p className="mt-0.5 text-[12px] text-neutral-400">
                          ${space.agreement.rentAmount} {RENT_FREQUENCY_LABELS[space.agreement.rentFrequency as RentFrequency] ?? space.agreement.rentFrequency}
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="text-[13px] text-neutral-400">
                      {space.status === "available" || space.status === "reserved" ? "Available for rent" : "No professional assigned"}
                    </span>
                  )}
                </Row>
                {space.description && (
                  <Row label="Description">
                    <span className="text-[13px] leading-relaxed text-neutral-700">{space.description}</span>
                  </Row>
                )}
                <Row label="Amenities">
                  {space.amenities && space.amenities.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {space.amenities.map((a) => (
                        <span key={a} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11.5px] font-medium text-neutral-600">
                          {a}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[13px] text-neutral-400">No amenities listed</span>
                  )}
                </Row>
                {space.notes && (
                  <Row label="Notes">
                    <span className="text-[13px] leading-relaxed text-neutral-700">{space.notes}</span>
                  </Row>
                )}
              </div>

              <StatusActions
                space={space}
                pending={statusMutation.isPending}
                onChange={(status) => statusMutation.mutate(status)}
              />
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

function StatusActions({
  space,
  pending,
  onChange,
}: {
  space: SpaceDetail;
  pending: boolean;
  onChange: (status: SpaceStatus) => void;
}) {
  const status = space.status as SpaceStatus;

  // Primary actions per status, per the Phase 2 spec — deliberately narrower
  // than every backend-permitted transition (see shared/rentalSpaces.ts):
  // ending an Occupied space isn't a primary action here since that's really
  // an agreement-lifecycle decision, not built yet.
  const primary: { label: string; status: SpaceStatus }[] =
    status === "available" ? [
      { label: "Mark Reserved", status: "reserved" },
      { label: "Mark Maintenance", status: "maintenance" },
      { label: "Mark Inactive", status: "inactive" },
    ] : status === "reserved" ? [
      { label: "Mark Available", status: "available" },
      { label: "Mark Occupied", status: "occupied" },
      { label: "Mark Maintenance", status: "maintenance" },
      { label: "Mark Inactive", status: "inactive" },
    ] : status === "maintenance" ? [
      { label: "Mark Available", status: "available" },
      { label: "Mark Inactive", status: "inactive" },
    ] : status === "inactive" ? [
      { label: "Mark Available", status: "available" },
    ] : [];

  return (
    <div className="mt-5">
      {status === "occupied" ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled
            title="Professional profiles are coming in a future phase"
            className="cursor-not-allowed rounded-md border border-neutral-200 px-3 py-1.5 text-[13px] font-medium text-neutral-400"
          >
            View Professional
          </button>
          {/* Not a primary workflow yet (see SPACE_STATUS_TRANSITIONS comment) — offered
              as a quiet correction path, guarded server-side against an active agreement. */}
          <button
            disabled={pending}
            onClick={() => onChange("available")}
            className="text-[12.5px] text-neutral-400 underline decoration-dotted hover:text-neutral-600 disabled:opacity-50"
          >
            Mark Available
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {primary.map((action) => (
            <button
              key={action.status}
              disabled={pending}
              onClick={() => onChange(action.status)}
              className="rounded-md border border-neutral-200 px-3 py-1.5 text-[13px] font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EditSpaceForm({
  space,
  onCancel,
  onSaved,
}: {
  space: SpaceDetail;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(space.name);
  const [type, setType] = useState(space.type);
  const [monthlyRate, setMonthlyRate] = useState(space.monthlyRate ?? "");
  const [baseRatePeriodDays, setBaseRatePeriodDays] = useState(space.baseRatePeriodDays ?? 30);
  const [description, setDescription] = useState(space.description ?? "");
  const [notes, setNotes] = useState(space.notes ?? "");
  const [amenities, setAmenities] = useState<string[]>(space.amenities ?? []);

  useEffect(() => {
    setName(space.name);
    setType(space.type);
    setMonthlyRate(space.monthlyRate ?? "");
    setBaseRatePeriodDays(space.baseRatePeriodDays ?? 30);
    setDescription(space.description ?? "");
    setNotes(space.notes ?? "");
    setAmenities(space.amenities ?? []);
  }, [space]);

  const mutation = useMutation({
    mutationFn: () =>
      updateSpace(space.id, {
        name: name.trim(),
        type,
        monthlyRate: monthlyRate.trim() || null,
        baseRatePeriodDays,
        description: description.trim() || null,
        notes: notes.trim() || null,
        amenities,
      }),
    onSuccess: () => {
      toast({ title: "Space updated" });
      onSaved();
    },
    onError: () => toast({ title: "Couldn't save changes", description: "Please try again.", variant: "destructive" }),
  });

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (name.trim()) mutation.mutate(); }}
      className="rounded-xl border border-neutral-200 bg-white p-5"
    >
      <div className="space-y-3.5">
        <Field label="Name / Number">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
            {SPACE_TYPES.map((t) => (
              <option key={t} value={t}>{SPACE_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </Field>
        <Field label="Base Rate">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-neutral-400">$</span>
            <input
              inputMode="decimal"
              value={monthlyRate}
              onChange={(e) => setMonthlyRate(e.target.value.replace(/[^0-9.]/g, ""))}
              className={`${inputClass} pl-6`}
            />
          </div>
        </Field>
        <Field label="Description">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
        </Field>
        <Field label="Amenities">
          <AmenityPicker value={amenities} onChange={setAmenities} />
        </Field>
        <Field label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
        </Field>
      </div>
      <p className="mt-4 text-[11.5px] text-neutral-400">
        Status isn't changed here — use the status actions on the space's page instead.
      </p>
      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          disabled={!name.trim() || mutation.isPending}
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
      <p className="text-[13px] text-neutral-500">This space couldn't be found.</p>
      <button onClick={onBack} className="mt-3 text-[13px] font-medium text-neutral-700 underline">
        Back to Spaces
      </button>
    </div>
  );
}
