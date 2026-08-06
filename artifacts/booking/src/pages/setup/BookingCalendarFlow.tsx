/**
 * /setup/booking — Booking & Calendar onboarding flow
 * Step 1: Appointment slot interval & buffer
 * Step 2: Online booking & advance window
 * Step 3: Cancellation policy
 * Step 4: Done
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Check, ShieldAlert } from "lucide-react";
import { FlowShell } from "./FlowShell";
import { useToast } from "@/hooks/use-toast";

const STEPS = [
  { key: "slots", label: "Appointment slots" },
  { key: "online", label: "Online booking" },
  { key: "policy", label: "Cancellation policy" },
  { key: "done", label: "All set" },
];

export default function BookingCalendarFlow() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(0);

  // Settings state
  const [slotInterval, setSlotInterval] = useState("30");
  const [bufferTime, setBufferTime] = useState("0");
  const [onlineBooking, setOnlineBooking] = useState(true);
  const [advanceDays, setAdvanceDays] = useState("60");
  const [cancellationHours, setCancellationHours] = useState("24");
  const [requireDeposit, setRequireDeposit] = useState(false);
  const [depositPct, setDepositPct] = useState("25");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load existing settings
  useEffect(() => {
    fetch("/api/calendar-settings", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        if (d.slotInterval) setSlotInterval(String(d.slotInterval));
        if (d.bufferTime !== undefined) setBufferTime(String(d.bufferTime));
        if (d.allowOnlineBooking !== undefined) setOnlineBooking(d.allowOnlineBooking);
        if (d.maxAdvanceDays) setAdvanceDays(String(d.maxAdvanceDays));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const saveStep = async (fields: Record<string, unknown>) => {
    setSaving(true);
    try {
      await fetch("/api/calendar-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(fields),
      });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not save settings." });
    } finally {
      setSaving(false);
    }
  };

  const handleStep1Next = async () => {
    await saveStep({ slotInterval: parseInt(slotInterval), bufferTime: parseInt(bufferTime) });
    setStep(1);
  };

  const handleStep2Next = async () => {
    await saveStep({ allowOnlineBooking: onlineBooking, maxAdvanceDays: parseInt(advanceDays) });
    setStep(2);
  };

  const handleStep3Next = async () => {
    // Save cancellation policy
    try {
      await fetch("/api/booking-payment-policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          cancellationHoursRequired: parseInt(cancellationHours),
          requireDeposit,
          depositPercentage: requireDeposit ? parseInt(depositPct) : 0,
        }),
      });
    } catch {/* non-critical */}
    setStep(3);
  };

  const renderStep = () => {
    if (step === 0) return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Appointment slot settings</h2>
            <p className="text-sm text-slate-500">Control how appointments are spaced on your calendar.</p>
          </div>
        </div>
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Slot interval</label>
            <p className="text-xs text-slate-400 mb-2">How often appointment start times are offered (e.g. every 30 min = 9:00, 9:30, 10:00…)</p>
            <div className="grid grid-cols-4 gap-2">
              {["15","30","45","60"].map((v) => (
                <button key={v} onClick={() => setSlotInterval(v)} className={`py-3 rounded-xl border-2 text-sm font-semibold transition-all ${slotInterval === v ? "border-[#1A0333] bg-[#1A0333] text-white" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                  {v} min
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Buffer time between appointments</label>
            <p className="text-xs text-slate-400 mb-2">Padding added after each appointment to prep for the next client.</p>
            <div className="grid grid-cols-4 gap-2">
              {["0","5","10","15"].map((v) => (
                <button key={v} onClick={() => setBufferTime(v)} className={`py-3 rounded-xl border-2 text-sm font-semibold transition-all ${bufferTime === v ? "border-[#1A0333] bg-[#1A0333] text-white" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                  {v === "0" ? "None" : `${v} min`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );

    if (step === 1) return (
      <div>
        <h2 className="text-lg font-bold text-slate-800 mb-1">Online booking settings</h2>
        <p className="text-sm text-slate-500 mb-6">Control whether clients can book appointments online and how far in advance.</p>
        <div className="space-y-5">
          <label className="flex items-center justify-between p-4 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
            <div>
              <p className="text-sm font-semibold text-slate-800">Allow online booking</p>
              <p className="text-xs text-slate-500 mt-0.5">Clients can book from your public booking page</p>
            </div>
            <div className="relative">
              <input type="checkbox" checked={onlineBooking} onChange={(e) => setOnlineBooking(e.target.checked)} className="sr-only" />
              <div onClick={() => setOnlineBooking(!onlineBooking)} className={`w-11 h-6 rounded-full cursor-pointer transition-colors ${onlineBooking ? "bg-[#1A0333]" : "bg-slate-200"}`}>
                <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform m-0.5 ${onlineBooking ? "translate-x-5" : "translate-x-0"}`} />
              </div>
            </div>
          </label>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Advance booking window</label>
            <p className="text-xs text-slate-400 mb-2">How many days ahead clients can book online.</p>
            <div className="grid grid-cols-4 gap-2">
              {["14","30","60","90"].map((v) => (
                <button key={v} onClick={() => setAdvanceDays(v)} className={`py-3 rounded-xl border-2 text-sm font-semibold transition-all ${advanceDays === v ? "border-[#1A0333] bg-[#1A0333] text-white" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                  {v} days
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );

    if (step === 2) return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Cancellation policy</h2>
            <p className="text-sm text-slate-500">Protect your time with a clear cancellation window.</p>
          </div>
        </div>
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Cancellation notice required</label>
            <div className="grid grid-cols-4 gap-2">
              {["0","12","24","48"].map((v) => (
                <button key={v} onClick={() => setCancellationHours(v)} className={`py-3 rounded-xl border-2 text-sm font-semibold transition-all ${cancellationHours === v ? "border-[#1A0333] bg-[#1A0333] text-white" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                  {v === "0" ? "None" : `${v}h`}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between p-4 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
            <div>
              <p className="text-sm font-semibold text-slate-800">Require a deposit</p>
              <p className="text-xs text-slate-500 mt-0.5">Charge a % upfront to secure online bookings</p>
            </div>
            <div onClick={() => setRequireDeposit(!requireDeposit)} className={`w-11 h-6 rounded-full cursor-pointer transition-colors ${requireDeposit ? "bg-[#1A0333]" : "bg-slate-200"}`}>
              <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform m-0.5 ${requireDeposit ? "translate-x-5" : "translate-x-0"}`} />
            </div>
          </label>
          {requireDeposit && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Deposit percentage</label>
              <div className="flex items-center gap-3">
                <input type="range" min="10" max="100" step="5" value={depositPct} onChange={(e) => setDepositPct(e.target.value)} className="flex-1 accent-[#1A0333]" />
                <span className="text-lg font-bold text-[#1A0333] w-14 text-right">{depositPct}%</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );

    return (
      <div className="text-center py-6">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <Check className="w-8 h-8 text-emerald-600 stroke-[2]" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Calendar configured! 🎉</h2>
        <p className="text-sm text-slate-500 max-w-sm mx-auto">Your booking rules, online booking settings, and cancellation policy have been saved.</p>
        <div className="mt-6">
          <button onClick={() => navigate("/calendar-settings")} className="text-sm font-semibold text-[#1A0333] border border-[#1A0333]/20 px-4 py-2 rounded-xl hover:bg-[#1A0333]/5 transition-colors">Advanced settings →</button>
        </div>
      </div>
    );
  };

  return (
    <FlowShell
      flowKey="booking_calendar"
      title="Booking & Calendar Setup"
      steps={STEPS}
      currentStep={step}
      onBack={step > 0 ? () => setStep(step - 1) : undefined}
      onNext={step === 0 ? handleStep1Next : step === 1 ? handleStep2Next : step === 2 ? handleStep3Next : undefined}
      nextLabel={saving ? "Saving…" : "Continue"}
      nextDisabled={saving}
      onComplete={() => navigate("/setup")}
    >
      {renderStep()}
    </FlowShell>
  );
}
