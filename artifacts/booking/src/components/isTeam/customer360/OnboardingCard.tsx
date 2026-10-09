import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { supportApi, type AccountOnboarding } from "@/lib/support-api";
import { describeStep } from "@/components/isTeam/onboardingSteps";

const flowStatus: Record<string, { label: string; color: string; dot: string }> = {
  complete:    { label: "Complete",    color: "text-emerald-700", dot: "bg-emerald-500" },
  in_progress: { label: "In progress", color: "text-amber-700",   dot: "bg-amber-400" },
  skipped:     { label: "Skipped",     color: "text-slate-500",   dot: "bg-slate-300" },
  not_started: { label: "Not started", color: "text-slate-500",   dot: "bg-slate-300" },
};

const day = (value: string | null) => (value ? format(new Date(value), "MMM d, yyyy") : "—");

function Essential({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${ok ? "bg-emerald-50" : "bg-red-50"}`}>
      <span className="text-xs text-slate-700 font-medium">{label}</span>
      <div className="flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`} />
        <span className={`text-[11px] font-medium ${ok ? "text-emerald-700" : "text-red-700"}`}>{value}</span>
      </div>
    </div>
  );
}

function SignupStatus({ signup }: { signup: AccountOnboarding["signup"] }) {
  if (signup.completedAt) {
    return (
      <div className="px-3 py-2 rounded-lg bg-emerald-50">
        <div className="text-xs font-semibold text-emerald-700">Onboarding finished</div>
        <div className="text-[11px] text-slate-500 mt-0.5">Finished {day(signup.completedAt)}</div>
      </div>
    );
  }
  if (!signup.tracked) {
    return (
      <div className="px-3 py-2 rounded-lg bg-slate-50">
        <div className="text-xs font-semibold text-slate-600">Onboarding steps not recorded</div>
        <div className="text-[11px] text-slate-500 mt-0.5">This account signed up before step tracking, or used the classic setup.</div>
      </div>
    );
  }
  const step = describeStep(signup.currentStepId);
  return (
    <div className="px-3 py-2 rounded-lg bg-amber-50">
      <div className="text-xs font-semibold text-amber-700">Onboarding not finished</div>
      <div className="text-[11px] text-slate-600 mt-0.5">
        Stopped at: <span className="font-medium">{step.label}</span>{step.phase ? ` (${step.phase})` : ""}
      </div>
      <div className="text-[11px] text-slate-500 mt-0.5">
        {signup.progressPct ?? 0}% done
        {signup.lastActivityAt ? ` · last active ${formatDistanceToNow(new Date(signup.lastActivityAt), { addSuffix: true })}` : ""}
      </div>
    </div>
  );
}

export default function OnboardingCard({ accountId }: { accountId: number }) {
  const { data, isLoading, error } = useQuery<AccountOnboarding>({
    queryKey: ["support-account-onboarding", accountId],
    queryFn: () => supportApi.accounts.onboarding(accountId),
    enabled: !!accountId,
    staleTime: 60_000,
  });

  const done = data ? data.flows.filter((f) => f.status === "complete").length : 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Signup &amp; Setup</h3>
        {data && <span className="text-xs text-slate-500">{done} of {data.flows.length} setup tasks</span>}
      </div>
      <div className="p-4">
        {isLoading && <p className="text-xs text-slate-400">Loading…</p>}
        {error && <p className="text-xs text-red-600">Could not load signup and setup progress.</p>}
        {data && (
          <div className="space-y-4">
            <div>
              <SignupStatus signup={data.signup} />
              <p className="text-[11px] text-slate-500 mt-1.5">Signed up {day(data.signup.signedUpAt)}</p>
            </div>

            <div className="space-y-1.5">
              <Essential label="Business hours" ok={data.essentials.hoursSet} value={data.essentials.hoursSet ? `${data.essentials.openDays} open days` : "Not set"} />
              <Essential label="Services" ok={data.essentials.services > 0} value={data.essentials.services > 0 ? `${data.essentials.services} active` : "None"} />
              <Essential label="Staff" ok={data.essentials.staff > 0} value={data.essentials.staff > 0 ? `${data.essentials.staff} active` : "None"} />
              <Essential label="Website" ok={data.essentials.websitePublished} value={data.essentials.websitePublished ? "Published" : "Not published"} />
            </div>

            <div className="space-y-1">
              {data.flows.map((f) => {
                const cfg = flowStatus[f.status] ?? flowStatus.not_started;
                return (
                  <div key={f.key} className="flex items-center justify-between py-1">
                    <span className="text-xs text-slate-700">{f.title}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0 pl-3">
                      <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      <span className={`text-[11px] font-medium ${cfg.color}`}>{cfg.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
