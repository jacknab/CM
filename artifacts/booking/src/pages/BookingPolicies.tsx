import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useSelectedStore } from "@/hooks/use-store";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Save, Clock, AlertCircle, Shield, CalendarX, ChevronLeft, CreditCard } from "lucide-react";
import { Link } from "react-router-dom";
import { apiRequest } from "@/lib/queryClient";

type PaymentPolicy = "none" | "card_on_file" | "deposit";
type DepositType   = "percentage" | "fixed";

type Policies = {
  cancellationHoursCutoff: number;
  lateGracePeriodMinutes: number;
  autoMarkNoShows: boolean;
  bookingPaymentPolicy: PaymentPolicy;
  depositType: DepositType | null;
  depositValue: number | null;
};

const CANCEL_PRESETS = [
  { label: "1 hr", value: 1 },
  { label: "2 hrs", value: 2 },
  { label: "4 hrs", value: 4 },
  { label: "12 hrs", value: 12 },
  { label: "24 hrs", value: 24 },
  { label: "48 hrs", value: 48 },
];

const GRACE_PRESETS = [
  { label: "5 min", value: 5 },
  { label: "10 min", value: 10 },
  { label: "15 min", value: 15 },
  { label: "20 min", value: 20 },
  { label: "30 min", value: 30 },
];

export default function BookingPolicies() {
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const [form, setForm] = useState<Policies>({
    cancellationHoursCutoff: 24,
    lateGracePeriodMinutes: 10,
    autoMarkNoShows: false,
    bookingPaymentPolicy: "none",
    depositType: null,
    depositValue: null,
  });
  const [dirty, setDirty] = useState(false);

  const { data, isLoading } = useQuery<Policies>({
    queryKey: ["/api/booking-policies", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch("/api/booking-policies", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  useEffect(() => {
    if (data) {
      setForm(data);
      setDirty(false);
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: async (body: Policies) => {
      const res = await apiRequest("PUT", "/api/booking-policies", body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Booking policies saved" });
      setDirty(false);
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const update = <K extends keyof Policies>(key: K, value: Policies[K]) => {
    setForm(f => ({ ...f, [key]: value }));
    setDirty(true);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24 text-muted-foreground">Loading…</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Link to="/settings" className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Booking Policies
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Set cancellation windows, grace periods, and no-show rules.
            </p>
          </div>
          <Button
            onClick={() => mutation.mutate(form)}
            disabled={mutation.isPending || !dirty}
            className="bg-[#1a1f36] hover:bg-[#2d3452] text-white"
          >
            <Save className="h-4 w-4 mr-2" />
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </div>

        {/* Cancellation Policy */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarX className="h-4 w-4 text-orange-500" />
              Cancellation Window
            </CardTitle>
            <CardDescription>
              How far in advance clients must cancel or reschedule. Appointments cancelled after this cutoff
              can be flagged for a late-cancel fee.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Minimum notice required</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {CANCEL_PRESETS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => update("cancellationHoursCutoff", p.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                      form.cancellationHoursCutoff === p.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-border hover:border-primary/50"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Label className="text-sm text-muted-foreground shrink-0">Or enter custom hours:</Label>
                <input
                  type="number"
                  min={0}
                  max={168}
                  value={form.cancellationHoursCutoff}
                  onChange={e => update("cancellationHoursCutoff", parseInt(e.target.value) || 0)}
                  className="w-20 text-sm border border-border rounded-md px-2.5 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="text-sm text-muted-foreground">hours</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2 flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
                Currently set to <strong>{form.cancellationHoursCutoff} hours</strong> before the appointment.
                Online bookings respect this window automatically.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Late Grace Period */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-blue-500" />
              Late Arrival Grace Period
            </CardTitle>
            <CardDescription>
              How many minutes after the scheduled time an appointment is still considered "on time" before
              it may be marked late or rescheduled.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Grace period</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {GRACE_PRESETS.map(p => (
                  <button
                    key={p.value}
                    onClick={() => update("lateGracePeriodMinutes", p.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                      form.lateGracePeriodMinutes === p.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-border hover:border-primary/50"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Label className="text-sm text-muted-foreground shrink-0">Or enter custom minutes:</Label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={form.lateGracePeriodMinutes}
                  onChange={e => update("lateGracePeriodMinutes", parseInt(e.target.value) || 0)}
                  className="w-20 text-sm border border-border rounded-md px-2.5 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="text-sm text-muted-foreground">minutes</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* No-Show Policy */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4 text-red-500" />
              No-Show Handling
            </CardTitle>
            <CardDescription>
              Automatically flag appointments as no-shows when clients don't arrive by the grace period end.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auto-mark no-shows</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  After the grace period, automatically update status to "No Show" on the calendar.
                </p>
              </div>
              <Switch
                checked={form.autoMarkNoShows}
                onCheckedChange={checked => update("autoMarkNoShows", checked)}
              />
            </div>
            {form.autoMarkNoShows && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                <strong>Active:</strong> Appointments will be auto-marked as no-shows{" "}
                {form.lateGracePeriodMinutes} minutes after their scheduled start time.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Online Booking Deposit */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4 text-violet-500" />
              Online Booking Deposit
            </CardTitle>
            <CardDescription>
              When enabled, clients pay a deposit when booking online. Requires a connected Stripe account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Master toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Require deposit for online bookings</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Client pays upfront; remaining balance is collected at checkout.
                </p>
              </div>
              <Switch
                checked={form.bookingPaymentPolicy === "deposit"}
                onCheckedChange={checked => {
                  update("bookingPaymentPolicy", checked ? "deposit" : "none");
                  if (!checked) {
                    update("depositType", null);
                    update("depositValue", null);
                  } else if (!form.depositType) {
                    update("depositType", "fixed");
                  }
                }}
              />
            </div>

            {/* Sub-cards: only visible when deposit is on */}
            {form.bookingPaymentPolicy === "deposit" && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                {/* Type picker */}
                <div
                  className="rounded-xl border bg-muted/30 p-4 space-y-2.5"
                >
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Deposit type</p>
                  <div className="flex flex-col gap-2">
                    {([
                      { value: "fixed" as DepositType, symbol: "$", label: "Fixed amount" },
                      { value: "percentage" as DepositType, symbol: "%", label: "% of service" },
                    ] as const).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          update("depositType", opt.value);
                          update("depositValue", null);
                        }}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                          form.depositType === opt.value
                            ? "border-violet-500 bg-violet-50 text-violet-700"
                            : "border-border bg-background text-foreground hover:border-violet-300"
                        }`}
                      >
                        <span className={`w-6 h-6 rounded-md flex items-center justify-center text-sm font-bold ${
                          form.depositType === opt.value ? "bg-violet-500 text-white" : "bg-muted text-muted-foreground"
                        }`}>
                          {opt.symbol}
                        </span>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Value input */}
                <div className="rounded-xl border bg-muted/30 p-4 space-y-2.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {form.depositType === "percentage" ? "Percentage" : "Amount"}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-semibold text-muted-foreground w-5 text-center select-none">
                      {form.depositType === "percentage" ? "%" : "$"}
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={3}
                      value={form.depositValue != null ? String(form.depositValue) : ""}
                      onChange={e => {
                        // Strip anything that isn't a digit — no injection vector
                        const raw = e.target.value.replace(/[^0-9]/g, "").slice(0, 3);
                        if (raw === "") { update("depositValue", null); return; }
                        const n = parseInt(raw, 10);
                        if (isNaN(n)) { update("depositValue", null); return; }
                        if (form.depositType === "percentage") {
                          update("depositValue", Math.min(100, Math.max(1, n)));
                        } else {
                          update("depositValue", Math.min(999, Math.max(1, n)));
                        }
                      }}
                      placeholder={form.depositType === "percentage" ? "30" : "25"}
                      className="w-full text-2xl font-bold bg-transparent border-0 border-b-2 border-violet-300 focus:border-violet-500 outline-none text-foreground py-1 text-center transition-colors"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug">
                    {form.depositType === "percentage"
                      ? "Enter 1–100. e.g. 30 = 30% of the total."
                      : "Enter 1–999. e.g. 25 = $25 flat deposit."}
                  </p>
                  {/* Live preview */}
                  {form.depositValue != null && (
                    <p className="text-xs font-medium text-violet-600">
                      {form.depositType === "percentage"
                        ? `${form.depositValue}% of each booking's total`
                        : `${form.depositValue} per booking`}
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Save bar for mobile */}
        {dirty && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-background border border-border shadow-xl rounded-2xl px-6 py-3 flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Unsaved changes</span>
            <Button
              onClick={() => mutation.mutate(form)}
              disabled={mutation.isPending}
              size="sm"
              className="bg-[#1a1f36] hover:bg-[#2d3452] text-white"
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {mutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
