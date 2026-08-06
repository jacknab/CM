/**
 * Shared shell for all onboarding flow wizard pages.
 * Provides: back nav, step sidebar, progress bar, step content, next/back/complete buttons.
 */
import { useNavigate } from "react-router-dom";
import { Check, ArrowLeft, ChevronRight } from "lucide-react";
import { useUpdateFlowStatus } from "@/hooks/use-setup-progress";

export interface FlowStep {
  key: string;
  label: string;
}

interface FlowShellProps {
  flowKey: string;
  title: string;
  subtitle?: string;
  steps: FlowStep[];
  currentStep: number;          // 0-based
  onBack?: () => void;
  onNext?: () => void;
  onComplete?: () => void;
  nextLabel?: string;
  completeLabel?: string;
  nextDisabled?: boolean;
  children: React.ReactNode;
}

export function FlowShell({
  flowKey,
  title,
  subtitle,
  steps,
  currentStep,
  onBack,
  onNext,
  onComplete,
  nextLabel = "Continue",
  completeLabel = "Complete Setup",
  nextDisabled = false,
  children,
}: FlowShellProps) {
  const navigate = useNavigate();
  const updateFlow = useUpdateFlowStatus();

  const isLastStep = currentStep === steps.length - 1;
  const pct = Math.round(((currentStep + 1) / steps.length) * 100);

  const handleComplete = () => {
    updateFlow.mutate(
      { flowKey, status: "complete" },
      {
        onSuccess: () => {
          if (onComplete) {
            onComplete();
          } else {
            navigate("/setup");
          }
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* ── Top bar ── */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 h-14 flex items-center justify-between sticky top-0 z-20">
        <button
          onClick={() => navigate("/setup")}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Setup
        </button>

        <span className="text-sm font-semibold text-slate-800 hidden sm:block">{title}</span>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i < currentStep
                  ? "w-2 h-2 bg-emerald-500"
                  : i === currentStep
                  ? "w-2.5 h-2.5 bg-[#1A0333]"
                  : "w-2 h-2 bg-slate-200"
              }`}
            />
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8 gap-8">
        {/* Sidebar */}
        <aside className="hidden lg:flex flex-col gap-2 w-56 flex-shrink-0 pt-2">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
            Steps
          </p>
          {steps.map((step, i) => (
            <div
              key={step.key}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                i === currentStep ? "bg-[#1A0333]/8" : ""
              }`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                  i < currentStep
                    ? "bg-emerald-100"
                    : i === currentStep
                    ? "bg-[#1A0333]"
                    : "border-2 border-slate-200"
                }`}
              >
                {i < currentStep ? (
                  <Check className="w-3 h-3 text-emerald-600 stroke-[2.5]" />
                ) : (
                  <span
                    className={`text-[10px] font-bold ${
                      i === currentStep ? "text-white" : "text-slate-400"
                    }`}
                  >
                    {i + 1}
                  </span>
                )}
              </div>
              <span
                className={`text-sm font-medium ${
                  i === currentStep
                    ? "text-[#1A0333]"
                    : i < currentStep
                    ? "text-emerald-700"
                    : "text-slate-400"
                }`}
              >
                {step.label}
              </span>
            </div>
          ))}
        </aside>

        {/* Step content */}
        <main className="flex-1 min-w-0">
          {/* Mobile: step indicator */}
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-5 lg:hidden">
            <span className="font-semibold text-slate-800">
              Step {currentStep + 1} of {steps.length}
            </span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span>{steps[currentStep]?.label}</span>
          </div>

          {/* Progress bar (mobile) */}
          <div className="h-1 bg-slate-100 rounded-full overflow-hidden mb-6 lg:hidden">
            <div
              className="h-full bg-[#1A0333] rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Step content card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 sm:px-8 py-8">{children}</div>

            {/* Navigation buttons */}
            <div className="px-6 sm:px-8 py-5 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-4">
              <button
                onClick={onBack ?? (() => navigate("/setup"))}
                className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
              >
                ← {currentStep === 0 ? "Back to Setup" : "Back"}
              </button>

              {isLastStep ? (
                <button
                  onClick={handleComplete}
                  disabled={updateFlow.isPending || nextDisabled}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors shadow-sm"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  {updateFlow.isPending ? "Saving…" : completeLabel}
                </button>
              ) : (
                <button
                  onClick={onNext}
                  disabled={nextDisabled}
                  className="inline-flex items-center gap-2 bg-[#1A0333] hover:bg-[#2d0554] disabled:opacity-40 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors shadow-sm"
                >
                  {nextLabel} →
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
