import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, DoorOpen, Users } from "lucide-react";
import RentalsTopBar from "@/components/rentals/RentalsTopBar";
import ChargeStateBadge from "@/components/rentals/ChargeStateBadge";
import { useToast } from "@/hooks/use-toast";
import { fetchRentCharge, recordManualPayment, voidRentCharge } from "@/lib/rentals-api";
import { CHARGE_DISPLAY_DESCRIPTIONS, type ChargeDisplayState } from "@shared/rentCharges";

function formatDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}
function todayInputValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Mode = "view" | "pay" | "void";

export default function RentChargeDetailPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = Number(idParam);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("view");

  const { data: charge, isLoading, isError } = useQuery({
    queryKey: ["/api/rentals/rent/charges", id],
    queryFn: () => fetchRentCharge(id),
    enabled: Number.isFinite(id),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/rentals/rent/charges"] });
    queryClient.invalidateQueries({ queryKey: ["/api/rentals/leases"] });
    queryClient.invalidateQueries({ queryKey: ["/api/rentals/overview"] });
  };

  if (!Number.isFinite(id)) return <NotFoundState onBack={() => navigate("/rentals/rent")} />;

  return (
    <div className="flex h-full flex-col">
      <RentalsTopBar title="Rent Charge" />
      <div className="flex-1 overflow-y-auto px-5 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-lg">
          <button
            onClick={() => navigate("/rentals/rent")}
            className="mb-5 flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-neutral-700"
          >
            <ArrowLeft size={14} />
            Back to Rent
          </button>

          {isLoading ? (
            <div className="h-56 animate-pulse rounded-xl bg-neutral-100" />
          ) : isError || !charge ? (
            <NotFoundState onBack={() => navigate("/rentals/rent")} />
          ) : mode === "pay" ? (
            <RecordPaymentPanel charge={charge} onCancel={() => setMode("view")} onDone={() => { setMode("view"); invalidateAll(); }} />
          ) : mode === "void" ? (
            <VoidChargePanel charge={charge} onCancel={() => setMode("view")} onDone={() => { setMode("view"); invalidateAll(); }} />
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-[Outfit] text-[17px] font-semibold text-neutral-900">
                    <span className="truncate">{charge.professional.businessName ?? charge.professional.name}</span>
                    <ArrowRight size={15} className="flex-shrink-0 text-neutral-300" />
                    <span className="truncate">{charge.space.name}</span>
                  </div>
                  <div className="mt-2">
                    <ChargeStateBadge state={charge.displayState} />
                    <p className="mt-0.5 text-[12px] text-neutral-400">
                      {CHARGE_DISPLAY_DESCRIPTIONS[charge.displayState as ChargeDisplayState]}
                    </p>
                  </div>
                </div>
                <p className="flex-shrink-0 font-[Outfit] text-[20px] font-semibold text-neutral-900">${charge.amount}</p>
              </div>

              <div className="mt-5 divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
                <Row label="Professional">
                  <Link to={`/rentals/professionals/${charge.professional.id}`} className="flex items-center gap-2 text-[13px] font-medium text-neutral-700 hover:text-neutral-900">
                    <Users size={14} className="text-neutral-400" />
                    {charge.professional.name}
                  </Link>
                </Row>
                <Row label="Space">
                  <Link to={`/rentals/spaces/${charge.space.id}`} className="flex items-center gap-2 text-[13px] font-medium text-neutral-700 hover:text-neutral-900">
                    <DoorOpen size={14} className="text-neutral-400" />
                    {charge.space.name}
                  </Link>
                </Row>
                <Row label="Period">
                  <span className="text-[13px] text-neutral-700">{formatDate(charge.periodStart)} – {formatDate(charge.periodEnd)}</span>
                </Row>
                <Row label="Due">
                  <span className="text-[13px] text-neutral-700">{formatDate(charge.dueDate)}</span>
                </Row>
                {charge.status === "unpaid" && charge.remainingAmount !== charge.amount && (
                  <Row label="Remaining">
                    <span className="text-[13px] font-medium text-neutral-700">${charge.remainingAmount}</span>
                  </Row>
                )}
                {charge.status === "voided" && charge.voidedReason && (
                  <Row label="Void Reason">
                    <span className="text-[13px] text-neutral-700">{charge.voidedReason}</span>
                  </Row>
                )}
                <Row label="Payments">
                  {charge.payments.length === 0 ? (
                    <span className="text-[13px] text-neutral-400">No payments recorded yet</span>
                  ) : (
                    <div className="space-y-2">
                      {charge.payments.map((p) => (
                        <div key={p.id} className="text-[13px] text-neutral-700">
                          <span className="font-medium">${p.amount}</span> via {p.method}
                          {p.reference && ` (${p.reference})`}
                          <span className="text-neutral-400"> — {formatDate(p.paidAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Row>
              </div>

              {charge.status === "unpaid" && (
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    onClick={() => setMode("pay")}
                    className="rounded-md bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800"
                  >
                    Record Payment
                  </button>
                  <button
                    onClick={() => setMode("void")}
                    className="rounded-md border border-neutral-200 px-3 py-2 text-[13px] font-medium text-neutral-500 transition hover:bg-neutral-50"
                  >
                    Void Charge
                  </button>
                </div>
              )}
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

function RecordPaymentPanel({
  charge,
  onCancel,
  onDone,
}: {
  charge: Awaited<ReturnType<typeof fetchRentCharge>>;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState(charge.remainingAmount);
  const [method, setMethod] = useState<"cash" | "check" | "other">("cash");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(todayInputValue());
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: () => recordManualPayment(charge.id, { amount, method, reference: reference.trim() || null, paidAt, notes: notes.trim() || null }),
    onSuccess: () => { toast({ title: "Payment recorded" }); onDone(); },
    onError: (err: any) => toast({ title: "Couldn't record payment", description: err?.message ?? "Please try again.", variant: "destructive" }),
  });

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <p className="font-[Outfit] text-[14px] font-semibold text-neutral-900">
        Record payment — {charge.professional.businessName ?? charge.professional.name}
      </p>
      <p className="mt-1 text-[12px] text-neutral-400">Remaining balance: ${charge.remainingAmount}</p>
      <div className="mt-4 space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-neutral-400">$</span>
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} className={`${inputClass} pl-6`} />
            </div>
          </Field>
          <Field label="Method">
            <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className={inputClass}>
              <option value="cash">Cash</option>
              <option value="check">Check</option>
              <option value="other">Other</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date Received">
            <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Reference" hint="e.g. check number">
            <input value={reference} onChange={(e) => setReference(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
        </Field>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => mutation.mutate()}
          disabled={!amount.trim() || mutation.isPending}
          className="rounded-md bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {mutation.isPending ? "Recording…" : "Record Payment"}
        </button>
        <button onClick={onCancel} className="rounded-md px-4 py-2 text-[13px] font-medium text-neutral-500 hover:text-neutral-700">
          Cancel
        </button>
      </div>
    </div>
  );
}

function VoidChargePanel({
  charge,
  onCancel,
  onDone,
}: {
  charge: Awaited<ReturnType<typeof fetchRentCharge>>;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: () => voidRentCharge(charge.id, reason.trim() || undefined),
    onSuccess: () => { toast({ title: "Charge voided" }); onDone(); },
    onError: (err: any) => toast({ title: "Couldn't void charge", description: err?.message ?? "Please try again.", variant: "destructive" }),
  });

  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-5">
      <p className="font-[Outfit] text-[14px] font-semibold text-neutral-900">Void this charge?</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-600">
        The ${charge.amount} charge for {charge.professional.businessName ?? charge.professional.name} will be marked
        Voided and no longer counted as owed. The record is kept for history — it is never deleted.
      </p>
      <div className="mt-4">
        <Field label="Reason (optional)">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className={`${inputClass} resize-none`} placeholder="e.g. Charged in error" />
        </Field>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="rounded-md bg-rose-600 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-rose-700 disabled:opacity-50"
        >
          {mutation.isPending ? "Voiding…" : "Confirm Void"}
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-neutral-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-neutral-400">{hint}</span>}
    </label>
  );
}

function NotFoundState({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 py-16 text-center">
      <p className="text-[13px] text-neutral-500">This rent charge couldn't be found.</p>
      <button onClick={onBack} className="mt-3 text-[13px] font-medium text-neutral-700 underline">
        Back to Rent
      </button>
    </div>
  );
}
