/**
 * /setup/payments — POS & Payments onboarding flow
 * Step 1: Connect Stripe
 * Step 2: Tax settings
 * Step 3: Tips configuration
 * Step 4: Done
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CreditCard, Percent, Check, ExternalLink } from "lucide-react";
import { FlowShell } from "./FlowShell";
import { useToast } from "@/hooks/use-toast";

const STEPS = [
  { key: "stripe", label: "Connect Stripe" },
  { key: "tax", label: "Tax settings" },
  { key: "tips", label: "Tips" },
  { key: "done", label: "All set" },
];

export default function POSPaymentsFlow() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(0);

  // Stripe status
  const [stripeConnected, setStripeConnected] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(true);

  // Tax settings
  const [taxRate, setTaxRate] = useState("0");
  const [taxServices, setTaxServices] = useState(true);
  const [taxProducts, setTaxProducts] = useState(true);
  const [taxAddons, setTaxAddons] = useState(true);
  const [saving, setSaving] = useState(false);

  // Tips
  const [tipsEnabled, setTipsEnabled] = useState(true);
  const [tipPresets, setTipPresets] = useState([10, 15, 20]);

  useEffect(() => {
    fetch("/api/payments/status", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.connected || d?.status === "active") setStripeConnected(true); })
      .catch(() => {})
      .finally(() => setStripeLoading(false));
  }, []);

  const saveTaxSettings = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ taxRate: parseFloat(taxRate) || 0, taxServices, taxProducts, taxAddons }),
      });
      setStep(2);
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not save tax settings." });
    } finally {
      setSaving(false);
    }
  };

  const saveTipSettings = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tipsEnabled, tipPresets }),
      });
      setStep(3);
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not save tip settings." });
    } finally {
      setSaving(false);
    }
  };

  const togglePreset = (val: number) =>
    setTipPresets((p) => p.includes(val) ? p.filter((v) => v !== val) : [...p, val].sort((a, b) => a - b));

  const renderStep = () => {
    if (step === 0) return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Connect your Stripe account</h2>
            <p className="text-sm text-slate-500">Accept credit & debit card payments from clients.</p>
          </div>
        </div>

        {stripeConnected ? (
          <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
              <Check className="w-4 h-4 text-emerald-600 stroke-[2.5]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-800">Stripe is connected</p>
              <p className="text-xs text-emerald-600 mt-0.5">Your account is ready to accept card payments.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-5 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-sm text-slate-600 leading-relaxed">
                Certxa uses <strong>Stripe</strong> to securely process payments. Connecting takes about 5 minutes and doesn't require a bank account upfront.
              </p>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-500">
                {["No monthly fees", "2.9% + 30¢ per transaction", "Next-day payouts", "PCI compliant"].map((f) => (
                  <div key={f} className="flex items-center gap-1.5"><Check className="w-3 h-3 text-emerald-500" />{f}</div>
                ))}
              </div>
            </div>
            <a
              href="/manage/payment-settings"
              className="flex items-center justify-center gap-2 bg-[#635BFF] hover:bg-[#5249D7] text-white text-sm font-semibold px-6 py-3.5 rounded-xl transition-colors shadow-sm w-full"
            >
              <CreditCard className="w-4 h-4" />
              Connect with Stripe
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <p className="text-xs text-slate-400 text-center">You'll be redirected to Stripe's secure OAuth flow.</p>
          </div>
        )}
      </div>
    );

    if (step === 1) return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
            <Percent className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Configure sales tax</h2>
            <p className="text-sm text-slate-500">Set your local tax rate and which items it applies to.</p>
          </div>
        </div>
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tax rate (%)</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                placeholder="0.00"
                min="0"
                max="30"
                step="0.01"
                className="w-32 px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#1A0333]/20 text-sm font-semibold"
              />
              <span className="text-slate-500 text-sm">% sales tax</span>
            </div>
            <p className="text-xs text-slate-400 mt-1.5">Enter 0 if you don't charge sales tax.</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Apply tax to</p>
            <div className="space-y-2">
              {[
                { label: "Services", state: taxServices, set: setTaxServices },
                { label: "Products", state: taxProducts, set: setTaxProducts },
                { label: "Add-ons", state: taxAddons, set: setTaxAddons },
              ].map(({ label, state, set }) => (
                <label key={label} className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                  <span className="text-sm font-medium text-slate-700">{label}</span>
                  <input type="checkbox" checked={state} onChange={(e) => set(e.target.checked)} className="rounded accent-[#1A0333]" />
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    );

    if (step === 2) return (
      <div>
        <h2 className="text-lg font-bold text-slate-800 mb-1">Tips configuration</h2>
        <p className="text-sm text-slate-500 mb-5">Set tip prompts that appear on the checkout screen.</p>
        <div className="space-y-5">
          <label className="flex items-center justify-between p-4 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
            <div>
              <p className="text-sm font-semibold text-slate-800">Enable tip prompts</p>
              <p className="text-xs text-slate-500 mt-0.5">Show tip options at checkout</p>
            </div>
            <div onClick={() => setTipsEnabled(!tipsEnabled)} className={`w-11 h-6 rounded-full cursor-pointer transition-colors ${tipsEnabled ? "bg-[#1A0333]" : "bg-slate-200"}`}>
              <div className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform m-0.5 ${tipsEnabled ? "translate-x-5" : "translate-x-0"}`} />
            </div>
          </label>
          {tipsEnabled && (
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">Quick-select tip presets</p>
              <div className="flex gap-2 flex-wrap">
                {[10, 15, 18, 20, 25].map((v) => (
                  <button key={v} onClick={() => togglePreset(v)} className={`px-5 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${tipPresets.includes(v) ? "border-[#1A0333] bg-[#1A0333] text-white" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                    {v}%
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2">Clients also get a "Custom" option to enter any amount.</p>
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
        <h2 className="text-xl font-bold text-slate-800 mb-2">POS ready! 🎉</h2>
        <p className="text-sm text-slate-500 max-w-sm mx-auto">Payment settings, taxes, and tips are configured. Your checkout is ready to use.</p>
        <div className="mt-6 flex gap-3 justify-center flex-wrap">
          <button onClick={() => navigate("/manage/payment-settings")} className="text-sm font-semibold text-[#1A0333] border border-[#1A0333]/20 px-4 py-2 rounded-xl hover:bg-[#1A0333]/5 transition-colors">Payment settings →</button>
          <button onClick={() => navigate("/pos-settings")} className="text-sm font-semibold text-slate-500 border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-50 transition-colors">POS settings →</button>
        </div>
      </div>
    );
  };

  return (
    <FlowShell
      flowKey="pos_payments"
      title="POS & Payments Setup"
      steps={STEPS}
      currentStep={step}
      onBack={step > 0 ? () => setStep(step - 1) : undefined}
      onNext={step === 0 ? () => setStep(1) : step === 1 ? saveTaxSettings : step === 2 ? saveTipSettings : undefined}
      nextLabel={saving ? "Saving…" : step === 0 ? (stripeConnected ? "Continue" : "Skip for now →") : "Continue"}
      nextDisabled={saving}
      onComplete={() => navigate("/setup")}
    >
      {renderStep()}
    </FlowShell>
  );
}
