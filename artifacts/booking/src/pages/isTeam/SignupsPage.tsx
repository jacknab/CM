import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { Loader2, RefreshCw } from "lucide-react";
import { supportApi, type UnfinishedSignups, type UnfinishedSignup } from "@/lib/support-api";
import { describeStep } from "@/components/isTeam/onboardingSteps";

const day = (value: string | null) => (value ? format(new Date(value), "MMM d, yyyy") : "—");
const ago = (value: string | null) => (value ? formatDistanceToNow(new Date(value), { addSuffix: true }) : "—");

function stageOf(s: UnfinishedSignup): { title: string; detail: string } {
  if (!s.tracked) {
    return { title: "Account created, no store", detail: "Signed up before steps were recorded" };
  }
  const step = describeStep(s.currentStepId);
  return {
    title: `Stopped at: ${step.label}`,
    detail: [step.phase, `${s.progressPct ?? 0}% done`, s.storeId ? "store created" : "no store yet"].filter(Boolean).join(" · "),
  };
}

export default function SignupsPage() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch, isFetching } = useQuery<UnfinishedSignups>({
    queryKey: ["support-unfinished-signups"],
    queryFn: () => supportApi.signups(),
    staleTime: 30_000,
  });

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Unfinished Signups</h1>
            <p className="text-sm text-slate-500 mt-0.5">People who started signing up and have not finished onboarding.</p>
          </div>
          <button onClick={() => refetch()} className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-lg transition bg-white">
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>

        {isLoading && <div className="flex items-center gap-2 text-slate-400 py-8"><Loader2 className="w-5 h-5 animate-spin" /> Loading signups…</div>}
        {error && <div className="text-sm text-red-600">Could not load signups.</div>}

        {data && (
          <>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700">Created an account, onboarding not finished ({data.accounts.length})</h3>
              </div>
              {data.accounts.length === 0 ? (
                <p className="p-4 text-sm text-slate-400">No unfinished signups.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-left text-slate-500">
                        <th className="px-4 py-2 font-medium">Owner</th>
                        <th className="px-4 py-2 font-medium">Signed up</th>
                        <th className="px-4 py-2 font-medium">Stage</th>
                        <th className="px-4 py-2 font-medium">Last active</th>
                        <th className="px-4 py-2 font-medium">Last login</th>
                        <th className="px-4 py-2 font-medium">Account</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.accounts.map((s) => {
                        const stage = stageOf(s);
                        return (
                          <tr key={s.userId} className="border-t border-slate-100 align-top">
                            <td className="px-4 py-2.5">
                              <div className="font-medium text-slate-800">{s.name || "—"}</div>
                              <div className="text-slate-500">{s.email}</div>
                              {s.phone && <div className="text-slate-500">{s.phone}</div>}
                            </td>
                            <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">
                              {day(s.signedUpAt)}
                              {s.googleSignup && <div className="text-slate-400">with Google</div>}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="font-medium text-slate-800">{stage.title}</div>
                              <div className="text-slate-500">{stage.detail}</div>
                            </td>
                            <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{ago(s.lastActivityAt)}</td>
                            <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{ago(s.lastLoginAt)}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              {s.storeId ? (
                                <button onClick={() => navigate(`/isTeam/accounts/${s.storeId}`)} className="text-indigo-600 hover:underline">
                                  {s.storeName || `Account #${s.storeId}`}
                                </button>
                              ) : (
                                <span className="text-slate-400">No store yet</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700">Asked for a verification code, never created an account ({data.codeOnly.length})</h3>
              </div>
              {data.codeOnly.length === 0 ? (
                <p className="p-4 text-sm text-slate-400">None.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-left text-slate-500">
                        <th className="px-4 py-2 font-medium">Email</th>
                        <th className="px-4 py-2 font-medium">Phone</th>
                        <th className="px-4 py-2 font-medium">Code requested</th>
                        <th className="px-4 py-2 font-medium">Stopped at</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.codeOnly.map((c) => (
                        <tr key={c.email} className="border-t border-slate-100">
                          <td className="px-4 py-2.5 text-slate-800">{c.email}</td>
                          <td className="px-4 py-2.5 text-slate-700">{c.phone ?? "—"}</td>
                          <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{day(c.requestedAt)} ({ago(c.requestedAt)})</td>
                          <td className="px-4 py-2.5 text-slate-700">{c.codeUsed ? "Creating a password" : "Entering the code"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
