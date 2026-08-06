/**
 * /setup — Full-page onboarding hub (Stripe-style)
 * Shows the complete checklist with all 8 flows.
 */
import { AppLayout } from "@/components/layout/AppLayout";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { useSetupProgress, countCompleted } from "@/hooks/use-setup-progress";
import { Sparkles } from "lucide-react";

export default function SetupHub() {
  const { data } = useSetupProgress();

  const completed = data ? countCompleted(data.flows) : 0;
  const total = data?.flows.length ?? 8;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Page header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1A0333] to-[#3B0764] flex items-center justify-center shadow">
              <Sparkles className="w-4.5 h-4.5 text-[#C97B2B]" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">Setup Guide</h1>
          </div>
          <p className="text-slate-500 text-sm">
            Complete these steps to get Certxa fully configured for your salon.{" "}
            {data && (
              <span className="font-semibold text-[#1A0333]">
                {completed} of {total} complete.
              </span>
            )}
          </p>
        </div>

        {/* The full checklist (not compact — no dismiss button) */}
        <OnboardingChecklist compact={false} />

        {/* Footer note */}
        <p className="text-xs text-slate-400 text-center mt-6">
          All steps can be revisited at any time. Required steps must be completed before clients
          can book online.
        </p>
      </div>
    </AppLayout>
  );
}
