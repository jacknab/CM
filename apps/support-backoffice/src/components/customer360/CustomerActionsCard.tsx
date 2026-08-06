import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Zap, UserX, UserCheck, RotateCcw, Mail, Shield, ChevronRight,
  AlertTriangle, Key, Link2, LogOut, DollarSign, Cpu, Send,
} from "lucide-react";
import { api, type AccountOverview } from "@/lib/api";

type Props = {
  accountId: number;
  store: AccountOverview["store"];
  owner: AccountOverview["owner"];
  subscription: AccountOverview["subscription"];
};

type ActionId =
  | "extend-trial" | "suspend" | "unsuspend" | "reset-sms" | "reset-ai"
  | "send-email" | "impersonate" | "reset-password" | "magic-link"
  | "force-logout" | "issue-credit";

interface SendEmailForm { subject: string; message: string; }

export default function CustomerActionsCard({ accountId, store, owner, subscription }: Props) {
  const qc = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<ActionId | null>(null);
  const [trialDays, setTrialDays] = useState(14);
  const [creditAmount, setCreditAmount] = useState(29);
  const [creditReason, setCreditReason] = useState("");
  const [magicLink, setMagicLink] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [emailForm, setEmailForm] = useState<SendEmailForm>({ subject: "", message: "" });

  const done = (msg: string) => {
    setSuccess(msg);
    setConfirmAction(null);
    qc.invalidateQueries({ queryKey: ["support-account-overview", accountId] });
    setTimeout(() => setSuccess(null), 3500);
  };

  const suspend       = useMutation({ mutationFn: () => api.accounts.suspend(accountId),      onSuccess: () => done("Account suspended") });
  const unsuspend     = useMutation({ mutationFn: () => api.accounts.unsuspend(accountId),    onSuccess: () => done("Account unsuspended") });
  const extendTrial   = useMutation({ mutationFn: () => api.accounts.extendTrial(accountId, trialDays), onSuccess: () => done(`Trial extended by ${trialDays} days`) });
  const resetSms      = useMutation({ mutationFn: () => api.accounts.resetSms(accountId),     onSuccess: () => done("SMS usage reset") });
  const resetAi       = useMutation({ mutationFn: () => api.accounts.resetAi(accountId),      onSuccess: () => done("AI usage reset") });
  const resetPassword = useMutation({ mutationFn: () => api.accounts.resetPassword(accountId), onSuccess: (d: any) => done(`Password reset sent to ${d.email}`) });
  const forceLogout   = useMutation({ mutationFn: () => api.accounts.forceLogout(accountId),  onSuccess: () => done("All sessions terminated") });
  const issueCreditM  = useMutation({
    mutationFn: () => api.accounts.issueCredit(accountId, creditAmount * 100, creditReason),
    onSuccess: () => done(`$${creditAmount} credit issued`),
  });
  const magicLinkM    = useMutation({
    mutationFn: () => api.accounts.magicLink(accountId),
    onSuccess: (d: { link: string }) => { setMagicLink(d.link); done("Magic link generated — copy it below"); },
  });
  const sendEmailM    = useMutation({
    mutationFn: () => api.accounts.sendEmail(accountId, emailForm.subject, emailForm.message),
    onSuccess: (d: any) => done(`Email sent to ${d.email ?? owner.email}`),
  });

  const isSuspended = store.accountStatus === "Suspended";

  const actions: { id: ActionId; label: string; desc: string; icon: React.ReactNode; bg: string }[] = [
    {
      id: "impersonate",
      label: "Login as Customer",
      desc: "View account as owner",
      icon: <Shield size={14} className="text-indigo-500" />,
      bg: "hover:bg-indigo-50 hover:border-indigo-200",
    },
    {
      id: "reset-password",
      label: "Password Reset",
      desc: "Send reset email to owner",
      icon: <Key size={14} className="text-sky-500" />,
      bg: "hover:bg-sky-50 hover:border-sky-200",
    },
    {
      id: "magic-link",
      label: "Send Magic Login Link",
      desc: "Generate a one-time login URL",
      icon: <Link2 size={14} className="text-violet-500" />,
      bg: "hover:bg-violet-50 hover:border-violet-200",
    },
    {
      id: isSuspended ? "unsuspend" : "suspend",
      label: isSuspended ? "Unsuspend Account" : "Suspend Account",
      desc: isSuspended ? "Re-enable this account" : "Temporarily disable account",
      icon: isSuspended
        ? <UserCheck size={14} className="text-emerald-500" />
        : <UserX size={14} className="text-red-500" />,
      bg: isSuspended ? "hover:bg-emerald-50 hover:border-emerald-200" : "hover:bg-red-50 hover:border-red-200",
    },
    {
      id: "extend-trial",
      label: "Extend Trial",
      desc: "Add more trial days",
      icon: <Zap size={14} className="text-amber-500" />,
      bg: "hover:bg-amber-50 hover:border-amber-200",
    },
    {
      id: "issue-credit",
      label: "Issue Credit",
      desc: "Apply account credit",
      icon: <DollarSign size={14} className="text-emerald-500" />,
      bg: "hover:bg-emerald-50 hover:border-emerald-200",
    },
    {
      id: "reset-sms",
      label: "Reset SMS Usage",
      desc: "Restore monthly SMS allowance",
      icon: <RotateCcw size={14} className="text-violet-500" />,
      bg: "hover:bg-violet-50 hover:border-violet-200",
    },
    {
      id: "reset-ai",
      label: "Reset AI Usage",
      desc: "Restore AI receptionist quota",
      icon: <Cpu size={14} className="text-indigo-400" />,
      bg: "hover:bg-indigo-50 hover:border-indigo-200",
    },
    {
      id: "send-email",
      label: "Send System Email",
      desc: "Send notification to owner",
      icon: <Mail size={14} className="text-sky-500" />,
      bg: "hover:bg-sky-50 hover:border-sky-200",
    },
    {
      id: "force-logout",
      label: "Force Logout Sessions",
      desc: "Terminate all active sessions",
      icon: <LogOut size={14} className="text-rose-500" />,
      bg: "hover:bg-rose-50 hover:border-rose-200",
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-700">Customer Actions</h3>
      </div>

      <div className="p-3 space-y-1.5">
        {success && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-700 font-medium mb-2">
            ✓ {success}
          </div>
        )}

        {magicLink && (
          <div className="bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 mb-2">
            <p className="text-[10px] font-semibold text-violet-700 mb-1">Magic Login Link (expires in 15 min)</p>
            <div className="flex gap-1.5">
              <input
                readOnly
                value={magicLink}
                className="flex-1 text-[10px] bg-white border border-violet-200 rounded px-2 py-1 font-mono text-slate-700 truncate"
              />
              <button
                onClick={() => { navigator.clipboard.writeText(magicLink); }}
                className="text-[10px] bg-violet-600 hover:bg-violet-700 text-white px-2 py-1 rounded transition font-medium"
              >
                Copy
              </button>
            </div>
          </div>
        )}

        {/* Confirm: Extend Trial */}
        {confirmAction === "extend-trial" && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-2 space-y-2">
            <p className="text-xs font-medium text-amber-800">Extend trial period?</p>
            <div className="flex items-center gap-2">
              <label className="text-xs text-amber-700">Days:</label>
              <input
                type="number" value={trialDays} min={1} max={90}
                onChange={e => setTrialDays(parseInt(e.target.value) || 7)}
                className="w-16 text-xs border border-amber-300 rounded px-2 py-1 focus:outline-none bg-white"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmAction(null)} className="text-xs text-slate-600 px-2 py-1 rounded hover:bg-white transition">Cancel</button>
              <button onClick={() => extendTrial.mutate()} disabled={extendTrial.isPending}
                className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded transition font-medium disabled:opacity-50">
                {extendTrial.isPending ? "Extending…" : "Extend"}
              </button>
            </div>
          </div>
        )}

        {/* Confirm: Suspend / Unsuspend */}
        {(confirmAction === "suspend" || confirmAction === "unsuspend") && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-2 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle size={13} className="text-red-500" />
              <p className="text-xs font-medium text-red-800">
                {confirmAction === "suspend" ? "Suspend this account?" : "Unsuspend this account?"}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmAction(null)} className="text-xs text-slate-600 px-2 py-1 rounded hover:bg-white transition">Cancel</button>
              <button
                onClick={() => (confirmAction === "suspend" ? suspend : unsuspend).mutate()}
                disabled={suspend.isPending || unsuspend.isPending}
                className={`text-xs text-white px-3 py-1 rounded transition font-medium disabled:opacity-50 ${confirmAction === "suspend" ? "bg-red-500 hover:bg-red-600" : "bg-emerald-500 hover:bg-emerald-600"}`}
              >
                {suspend.isPending || unsuspend.isPending ? "Processing…" : "Confirm"}
              </button>
            </div>
          </div>
        )}

        {/* Confirm: Reset SMS */}
        {confirmAction === "reset-sms" && (
          <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 mb-2 space-y-2">
            <p className="text-xs font-medium text-violet-800">Reset SMS usage to full allowance?</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmAction(null)} className="text-xs text-slate-600 px-2 py-1 rounded hover:bg-white transition">Cancel</button>
              <button onClick={() => resetSms.mutate()} disabled={resetSms.isPending}
                className="text-xs bg-violet-600 hover:bg-violet-700 text-white px-3 py-1 rounded transition font-medium disabled:opacity-50">
                {resetSms.isPending ? "Resetting…" : "Reset"}
              </button>
            </div>
          </div>
        )}

        {/* Confirm: Reset AI */}
        {confirmAction === "reset-ai" && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-2 space-y-2">
            <p className="text-xs font-medium text-indigo-800">Reset AI receptionist usage to full monthly allowance?</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmAction(null)} className="text-xs text-slate-600 px-2 py-1 rounded hover:bg-white transition">Cancel</button>
              <button onClick={() => resetAi.mutate()} disabled={resetAi.isPending}
                className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded transition font-medium disabled:opacity-50">
                {resetAi.isPending ? "Resetting…" : "Reset"}
              </button>
            </div>
          </div>
        )}

        {/* Confirm: Password Reset */}
        {confirmAction === "reset-password" && (
          <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 mb-2 space-y-2">
            <p className="text-xs font-medium text-sky-800">Send password reset email to <strong>{owner.email}</strong>?</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmAction(null)} className="text-xs text-slate-600 px-2 py-1 rounded hover:bg-white transition">Cancel</button>
              <button onClick={() => resetPassword.mutate()} disabled={resetPassword.isPending}
                className="text-xs bg-sky-600 hover:bg-sky-700 text-white px-3 py-1 rounded transition font-medium disabled:opacity-50">
                {resetPassword.isPending ? "Sending…" : "Send Reset Email"}
              </button>
            </div>
          </div>
        )}

        {/* Confirm: Magic Link */}
        {confirmAction === "magic-link" && (
          <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 mb-2 space-y-2">
            <p className="text-xs font-medium text-violet-800">Generate a one-time login link for this account?</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmAction(null)} className="text-xs text-slate-600 px-2 py-1 rounded hover:bg-white transition">Cancel</button>
              <button onClick={() => magicLinkM.mutate()} disabled={magicLinkM.isPending}
                className="text-xs bg-violet-600 hover:bg-violet-700 text-white px-3 py-1 rounded transition font-medium disabled:opacity-50">
                {magicLinkM.isPending ? "Generating…" : "Generate Link"}
              </button>
            </div>
          </div>
        )}

        {/* Confirm: Impersonate / Login as Customer */}
        {confirmAction === "impersonate" && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-2 space-y-2">
            <p className="text-xs font-medium text-indigo-800">
              Log in as <strong>{owner.firstName} {owner.lastName}</strong>?
            </p>
            <p className="text-[10px] text-indigo-600">
              This generates a one-time magic link granting full access to their account. The link expires in 15 minutes.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmAction(null)} className="text-xs text-slate-600 px-2 py-1 rounded hover:bg-white transition">Cancel</button>
              <button onClick={() => magicLinkM.mutate()} disabled={magicLinkM.isPending}
                className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded transition font-medium disabled:opacity-50">
                {magicLinkM.isPending ? "Generating…" : "Generate Login Link"}
              </button>
            </div>
          </div>
        )}

        {/* Confirm: Send Email */}
        {confirmAction === "send-email" && (
          <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 mb-2 space-y-2">
            <p className="text-xs font-medium text-sky-800">Send email to <strong>{owner.email}</strong></p>
            <input
              type="text"
              value={emailForm.subject}
              onChange={e => setEmailForm(f => ({ ...f, subject: e.target.value }))}
              placeholder="Subject…"
              className="w-full text-xs border border-sky-200 rounded px-2 py-1.5 focus:outline-none bg-white"
            />
            <textarea
              value={emailForm.message}
              onChange={e => setEmailForm(f => ({ ...f, message: e.target.value }))}
              placeholder={`Hi ${owner.firstName || "there"},\n\nMessage…`}
              className="w-full text-xs border border-sky-200 rounded px-2 py-1.5 focus:outline-none bg-white resize-none"
              rows={4}
            />
            <div className="flex gap-2">
              <button onClick={() => setConfirmAction(null)} className="text-xs text-slate-600 px-2 py-1 rounded hover:bg-white transition">Cancel</button>
              <button
                onClick={() => sendEmailM.mutate()}
                disabled={sendEmailM.isPending || !emailForm.subject.trim() || !emailForm.message.trim()}
                className="flex items-center gap-1.5 text-xs bg-sky-600 hover:bg-sky-700 text-white px-3 py-1 rounded transition font-medium disabled:opacity-50"
              >
                <Send size={11} />
                {sendEmailM.isPending ? "Sending…" : "Send Email"}
              </button>
            </div>
            {sendEmailM.isError && (
              <p className="text-[10px] text-red-600">{(sendEmailM.error as Error)?.message ?? "Failed to send"}</p>
            )}
          </div>
        )}

        {/* Confirm: Force Logout */}
        {confirmAction === "force-logout" && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 mb-2 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle size={13} className="text-rose-500" />
              <p className="text-xs font-medium text-rose-800">Force logout all active sessions for this account?</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmAction(null)} className="text-xs text-slate-600 px-2 py-1 rounded hover:bg-white transition">Cancel</button>
              <button onClick={() => forceLogout.mutate()} disabled={forceLogout.isPending}
                className="text-xs bg-rose-600 hover:bg-rose-700 text-white px-3 py-1 rounded transition font-medium disabled:opacity-50">
                {forceLogout.isPending ? "Processing…" : "Force Logout"}
              </button>
            </div>
          </div>
        )}

        {/* Confirm: Issue Credit */}
        {confirmAction === "issue-credit" && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-2 space-y-2">
            <p className="text-xs font-medium text-emerald-800">Issue account credit</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-emerald-700">$</span>
              <input
                type="number" value={creditAmount} min={1} max={9999}
                onChange={e => setCreditAmount(parseFloat(e.target.value) || 0)}
                className="w-20 text-xs border border-emerald-300 rounded px-2 py-1 focus:outline-none bg-white"
              />
            </div>
            <input
              type="text" value={creditReason} placeholder="Reason (required)…"
              onChange={e => setCreditReason(e.target.value)}
              className="w-full text-xs border border-emerald-300 rounded px-2 py-1 focus:outline-none bg-white"
            />
            <div className="flex gap-2">
              <button onClick={() => setConfirmAction(null)} className="text-xs text-slate-600 px-2 py-1 rounded hover:bg-white transition">Cancel</button>
              <button onClick={() => issueCreditM.mutate()} disabled={issueCreditM.isPending || !creditReason.trim()}
                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded transition font-medium disabled:opacity-50">
                {issueCreditM.isPending ? "Issuing…" : `Issue $${creditAmount} Credit`}
              </button>
            </div>
          </div>
        )}

        {actions.map(a => (
          <button
            key={a.id}
            onClick={() => setConfirmAction(a.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-transparent transition text-left group ${a.bg}`}
          >
            <div className="w-7 h-7 rounded-lg bg-slate-50 group-hover:bg-white flex items-center justify-center flex-shrink-0 transition">
              {a.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-slate-700">{a.label}</div>
              <div className="text-[10px] text-slate-400">{a.desc}</div>
            </div>
            <ChevronRight size={13} className="text-slate-300 group-hover:text-slate-500 transition flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
