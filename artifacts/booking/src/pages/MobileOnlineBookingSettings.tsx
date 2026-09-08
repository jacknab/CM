import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSelectedStore } from "@/hooks/use-store";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type MobilePolicies = {
  cancellationHoursCutoff: number;
  allowOnlineCancellation: boolean;
  cancellationPolicyRequired: boolean;
  cancellationPolicyText: string;
  cancellationFeeType: "percentage" | null;
  cancellationFeeValue: number | null;
  askClientsForPronouns: boolean;
  bookingPaymentPolicy: "none" | "card_on_file" | "deposit";
  depositType: "percentage" | "fixed" | null;
  depositValue: number | null;
  lateGracePeriodMinutes: number;
  autoMarkNoShows: boolean;
};

type BanEntry = { id: number; phoneE164: string; reason: string | null };

const DEFAULT_POLICIES: MobilePolicies = {
  cancellationHoursCutoff: 24,
  allowOnlineCancellation: true,
  cancellationPolicyRequired: false,
  cancellationPolicyText: "",
  cancellationFeeType: null,
  cancellationFeeValue: null,
  askClientsForPronouns: false,
  bookingPaymentPolicy: "none",
  depositType: null,
  depositValue: null,
  lateGracePeriodMinutes: 10,
  autoMarkNoShows: false,
};

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative h-7 w-12 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c5d42a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#080808]"
      style={{ background: checked ? "#c5d42a" : "#3a3a3a" }}
    >
      <span
        className="absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform"
        style={{ left: checked ? "1.5rem" : "0.25rem" }}
      />
    </button>
  );
}

function SettingRow({
  title,
  description,
  children,
  onClick,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      className={`flex min-h-[74px] items-center justify-between gap-4 px-5 py-4 ${onClick ? "cursor-pointer active:bg-white/[0.04]" : ""}`}
      onClick={onClick}
    >
      <div className="min-w-0">
        <p className="text-[15px] font-semibold leading-5 text-white">{title}</p>
        {description && <p className="mt-1 text-xs leading-4 text-[#8d8d8d]">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function formatPhone(e164: string) {
  const digits = e164.replace(/\D/g, "").slice(-10);
  return digits.length === 10
    ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    : e164;
}

function MobileBanList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");

  const { data: entries = [], isLoading } = useQuery<BanEntry[]>({
    queryKey: ["/api/booking-ban-list"],
    queryFn: async () => {
      const response = await fetch("/api/booking-ban-list", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load the booking ban list");
      return response.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/booking-ban-list", {
      phone,
      reason: reason.trim() || undefined,
    })).json(),
    onSuccess: () => {
      setPhone("");
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/booking-ban-list"] });
      toast({ title: "Added to booking ban list" });
    },
    onError: (error: Error) => toast({ title: error.message || "Could not add number", variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/booking-ban-list/${id}`);
      if (!response.ok && response.status !== 204) throw new Error("Could not remove number");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/booking-ban-list"] });
      toast({ title: "Removed from booking ban list" });
    },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  });

  const canAdd = phone.replace(/\D/g, "").length === 10 && !addMutation.isPending;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <input
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="Phone number"
          inputMode="tel"
          className="h-11 w-full rounded-xl border border-white/10 bg-[#151515] px-3 text-sm text-white outline-none placeholder:text-[#666] focus:border-[#c5d42a]"
        />
        <div className="flex gap-2">
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason (optional)"
            className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#151515] px-3 text-sm text-white outline-none placeholder:text-[#666] focus:border-[#c5d42a]"
          />
          <button
            type="button"
            onClick={() => addMutation.mutate()}
            disabled={!canAdd}
            className="inline-flex h-11 shrink-0 items-center gap-1 rounded-xl bg-[#c5d42a] px-3 text-sm font-bold text-[#101010] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-3 text-sm text-[#888]"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : entries.length === 0 ? (
        <p className="py-2 text-sm text-[#777]">No clients are blocked from online booking.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-3 last:border-0">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{formatPhone(entry.phoneE164)}</p>
                {entry.reason && <p className="truncate text-xs text-[#888]">{entry.reason}</p>}
              </div>
              <button
                type="button"
                aria-label={`Remove ${formatPhone(entry.phoneE164)}`}
                onClick={() => removeMutation.mutate(entry.id)}
                className="rounded-lg p-2 text-[#888] hover:bg-white/10 hover:text-red-300"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MobileOnlineBookingSettings() {
  const navigate = useNavigate();
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<MobilePolicies>(DEFAULT_POLICIES);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [banListOpen, setBanListOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  const { data, isLoading } = useQuery<Partial<MobilePolicies>>({
    queryKey: ["/api/booking-policies", selectedStore?.id],
    queryFn: async () => {
      const response = await fetch("/api/booking-policies", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load online booking settings");
      return response.json();
    },
    enabled: !!selectedStore?.id,
  });

  useEffect(() => {
    if (data) {
      setForm({ ...DEFAULT_POLICIES, ...data });
      setDirty(false);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (body: MobilePolicies) => (await apiRequest("PUT", "/api/booking-policies", body)).json(),
    onSuccess: () => {
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["/api/booking-policies"] });
      toast({ title: "Online booking settings saved" });
    },
    onError: (error: Error) => toast({ title: error.message || "Could not save settings", variant: "destructive" }),
  });

  const update = <K extends keyof MobilePolicies>(key: K, value: MobilePolicies[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  if (!selectedStore?.id || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080808] text-[#888]">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080808] pb-[92px] text-white" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-white/[0.07] bg-[#080808]/95 px-5 backdrop-blur-md">
        <button
          type="button"
          onClick={() => navigate("/settings")}
          aria-label="Back to settings"
          className="rounded-full p-2 -ml-2 text-white active:bg-white/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-[17px] font-bold tracking-[-0.02em]">Online Booking</h1>
        <button
          type="button"
          onClick={() => saveMutation.mutate(form)}
          disabled={!dirty || saveMutation.isPending}
          className="rounded-lg px-2 py-1 text-sm font-bold text-[#c5d42a] disabled:text-[#555]"
        >
          {saveMutation.isPending ? "Saving…" : "Save"}
        </button>
      </header>

      <main className="px-4 pt-8">
        <section>
          <h2 className="mb-3 px-1 text-[28px] font-bold tracking-[-0.04em]">Cancellations</h2>
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111111] divide-y divide-white/[0.08]">
            <SettingRow title="Allow clients to cancel?" description="Clients can cancel online before their appointment.">
              <Toggle
                checked={form.allowOnlineCancellation}
                onChange={(checked) => update("allowOnlineCancellation", checked)}
                label="Allow clients to cancel online"
              />
            </SettingRow>

            <SettingRow title="Cancellation window" onClick={() => {
              const next = form.cancellationHoursCutoff >= 48 ? 24 : form.cancellationHoursCutoff >= 24 ? 48 : 24;
              update("cancellationHoursCutoff", next);
            }}>
              <div className="flex items-center gap-2 text-sm font-semibold text-[#c5d42a]">
                {form.cancellationHoursCutoff} hrs
                <ChevronRight className="h-4 w-4 text-[#777]" />
              </div>
            </SettingRow>

            <SettingRow title="Cancellation fee" onClick={() => {
              const next = form.cancellationFeeValue === 50 ? null : 50;
              update("cancellationFeeType", next == null ? null : "percentage");
              update("cancellationFeeValue", next);
            }}>
              <div className="flex items-center gap-2 text-sm font-semibold text-[#c5d42a]">
                {form.cancellationFeeValue ? `${form.cancellationFeeValue}%` : "None"}
                <ChevronRight className="h-4 w-4 text-[#777]" />
              </div>
            </SettingRow>

            <SettingRow title="Cancellation policy" onClick={() => setPolicyOpen((open) => !open)}>
              <ChevronDown className={`h-5 w-5 text-[#888] transition-transform ${policyOpen ? "rotate-180" : ""}`} />
            </SettingRow>
            {policyOpen && (
              <div className="space-y-3 bg-[#0d0d0d] px-5 pb-5">
                <label className="flex items-center justify-between gap-4 pt-1 text-sm text-[#d0d0d0]">
                  Require clients to acknowledge this policy
                  <Toggle
                    checked={form.cancellationPolicyRequired}
                    onChange={(checked) => update("cancellationPolicyRequired", checked)}
                    label="Require cancellation policy acknowledgement"
                  />
                </label>
                <textarea
                  value={form.cancellationPolicyText}
                  onChange={(event) => update("cancellationPolicyText", event.target.value)}
                  placeholder="Add the cancellation policy clients will see before booking."
                  rows={4}
                  className="w-full resize-none rounded-xl border border-white/10 bg-[#151515] p-3 text-sm leading-5 text-white outline-none placeholder:text-[#666] focus:border-[#c5d42a]"
                />
              </div>
            )}
          </div>
        </section>

        <section className="mt-9">
          <h2 className="mb-3 px-1 text-[28px] font-bold tracking-[-0.04em]">Booking form</h2>
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111111] divide-y divide-white/[0.08]">
            <SettingRow title="Ask clients for pronouns" description="Give clients the option to share how they’d like to be addressed.">
              <Toggle
                checked={form.askClientsForPronouns}
                onChange={(checked) => update("askClientsForPronouns", checked)}
                label="Ask clients for pronouns"
              />
            </SettingRow>
          </div>
        </section>

        <section className="mt-9">
          <button
            type="button"
            onClick={() => setBanListOpen((open) => !open)}
            className="mb-3 flex w-full items-center justify-between px-1 text-left"
          >
            <h2 className="text-[28px] font-bold tracking-[-0.04em]">Booking ban list</h2>
            <ChevronDown className={`h-5 w-5 text-[#888] transition-transform ${banListOpen ? "rotate-180" : ""}`} />
          </button>
          {banListOpen && (
            <div className="rounded-2xl border border-white/[0.08] bg-[#111111] p-5">
              <p className="mb-4 text-sm leading-5 text-[#8d8d8d]">Blocked phone numbers cannot create online bookings. Staff can still book them manually.</p>
              <MobileBanList />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}