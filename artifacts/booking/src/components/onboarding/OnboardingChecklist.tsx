/**
 * Stripe-style onboarding checklist card.
 * Embeds in the /manage dashboard. Auto-hides when dismissed or all flows complete.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronDown, ChevronRight, X, Clock, Sparkles } from "lucide-react";
import {
  useSetupProgress,
  useDismissChecklist,
  useUpdateFlowStatus,
  countCompleted,
  getNextFlow,
  flowToPath,
  type FlowProgress,
} from "@/hooks/use-setup-progress";

// ── Category badge ────────────────────────────────────────────────────────────
function CategoryBadge({ category }: { category: FlowProgress["category"] }) {
  if (category === "required") {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
        Required
      </span>
    );
  }
  if (category === "recommended") {
    return (
      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
        Recommended
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-full">
      Optional
    </span>
  );
}

// ── Status circle ─────────────────────────────────────────────────────────────
function StatusCircle({
  index,
  status,
  isOpen,
}: {
  index: number;
  status: FlowProgress["status"];
  isOpen: boolean;
}) {
  if (status === "complete" || status === "skipped") {
    return (
      <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
        <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[2.5]" />
      </div>
    );
  }
  if (isOpen) {
    return (
      <div className="w-7 h-7 rounded-full bg-[#1A0333] flex items-center justify-center flex-shrink-0 shadow-sm">
        <span className="text-[11px] font-bold text-white">{index + 1}</span>
      </div>
    );
  }
  return (
    <div className="w-7 h-7 rounded-full border-2 border-slate-200 flex items-center justify-center flex-shrink-0">
      <span className="text-[11px] font-bold text-slate-400">{index + 1}</span>
    </div>
  );
}

// ── Single checklist item ─────────────────────────────────────────────────────
function ChecklistItem({
  flow,
  index,
  isOpen,
  onToggle,
}: {
  flow: FlowProgress;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const navigate = useNavigate();
  const updateFlow = useUpdateFlowStatus();
  const isDone = flow.status === "complete" || flow.status === "skipped";

  const handleStart = () => {
    if (!isDone) {
      updateFlow.mutate({ flowKey: flow.key, status: "in_progress" });
    }
    navigate(flowToPath(flow.key));
  };

  return (
    <div className="border-b border-slate-100 last:border-0">
      {/* Row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors text-left"
      >
        <StatusCircle index={index} status={flow.status} isOpen={isOpen} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800">
              {flow.title}
            </span>
            <CategoryBadge category={flow.category} />
          </div>
          {isDone && (
            <p className="text-xs text-emerald-600 font-medium mt-0.5">Completed ✓</p>
          )}
        </div>

        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
        )}
      </button>

      {/* Expanded content */}
      {isOpen && (
        <div className="mx-6 mb-4 bg-slate-50 rounded-xl p-5 border border-slate-100">
          <p className="text-sm text-slate-600 leading-relaxed mb-4">{flow.description}</p>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">~{flow.estimatedMinutes} min</span>
            </div>
            <button
              onClick={handleStart}
              className="inline-flex items-center gap-2 bg-[#1A0333] hover:bg-[#2d0554] text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors shadow-sm"
            >
              {isDone ? "Revisit" : flow.status === "in_progress" ? "Continue" : "Start"} →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main checklist component ──────────────────────────────────────────────────
export function OnboardingChecklist({ compact = false }: { compact?: boolean }) {
  const { data, isLoading } = useSetupProgress();
  const dismiss = useDismissChecklist();
  const navigate = useNavigate();
  const [openKey, setOpenKey] = useState<string | null>(null);

  if (isLoading) return null;
  if (!data) return null;
  if (data.dismissed && compact) return null;

  const flows = data.flows;
  const completed = countCompleted(flows);
  const total = flows.length;
  const pct = Math.round((completed / total) * 100);
  const allRequiredDone = flows
    .filter((f) => f.category === "required")
    .every((f) => f.status === "complete" || f.status === "skipped");

  // On the dashboard (compact), hide once everything required is done AND dismissed
  if (compact && data.dismissed) return null;

  const nextFlow = getNextFlow(flows);

  const handleToggle = (key: string) => {
    setOpenKey((prev) => (prev === key ? null : key));
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
      {/* ── Header ── */}
      <div className="px-6 pt-6 pb-5 border-b border-slate-100">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1A0333] to-[#3B0764] flex items-center justify-center shadow-sm flex-shrink-0">
              <Sparkles className="w-5 h-5 text-[#C97B2B]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                {completed === total
                  ? "Your salon is ready! 🎉"
                  : "Finish setting up Certxa"}
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {completed === total
                  ? "All setup steps are complete."
                  : `${completed} of ${total} steps complete`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {!compact && nextFlow && completed < total && (
              <button
                onClick={() => navigate(flowToPath(nextFlow.key))}
                className="text-sm font-semibold text-[#1A0333] hover:text-[#3B0764] transition-colors hidden sm:block"
              >
                Continue →
              </button>
            )}
            {compact && (
              <button
                onClick={() => navigate("/setup")}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors hidden sm:block"
              >
                View all
              </button>
            )}
            {(allRequiredDone || completed === total) && compact && (
              <button
                onClick={() => dismiss.mutate()}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#1A0333] to-[#C97B2B] rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-1.5 font-medium">{pct}% complete</p>
        </div>
      </div>

      {/* ── Flow list ── */}
      <div>
        {flows.map((flow, i) => (
          <ChecklistItem
            key={flow.key}
            flow={flow}
            index={i}
            isOpen={openKey === flow.key}
            onToggle={() => handleToggle(flow.key)}
          />
        ))}
      </div>

      {/* ── Footer (compact only) ── */}
      {compact && (
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {total - completed} step{total - completed !== 1 ? "s" : ""} remaining
          </span>
          <button
            onClick={() => navigate("/setup")}
            className="text-xs font-semibold text-[#1A0333] hover:text-[#3B0764] transition-colors"
          >
            View full setup guide →
          </button>
        </div>
      )}
    </div>
  );
}
