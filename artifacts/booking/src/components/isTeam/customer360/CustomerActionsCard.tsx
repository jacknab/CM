import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Zap, UserX, UserCheck, RotateCcw, Mail, Shield, Link, LogOut,
  ChevronRight, AlertTriangle, Info, Copy, Check, KeyRound,
} from "lucide-react";
import { supportApi, type AccountOverview } from "@/lib/support-api";

type Props = {
  accountId: number;
  store: AccountOverview["store"];
  owner: AccountOverview["owner"];
  subscription: AccountOverview["subscription"];
};

export default function CustomerActionsCard({ accountId, store, owner }: Props) {
  const qc = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [trialDays, setTrialDays] = useState(14);
  const [emailSubject, setEmailSubject] = useState("Message from Certxa Support");
  const [emailMessage, setEmailMessage] = useState("");
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [magicLink, setMagicLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["support-account-overview", accountId] });
    setTimeout(() => setSuccess(null), 4000);
  };
  const handleError = (msg: string) => { setError(msg); setTimeout(() => setError(null), 5000); };

  const suspend     = useMutation({ mutationFn: () => supportApi.accounts.suspend(accountId),    onSuccess: () => { setSuccess("Account suspended");                 setConfirmAction(null); invalidate(); }, onError: (e: any) => handleError(e.message) });
  const unsuspend   = useMutation({ mutationFn: () => supportApi.accounts.unsuspend(accountId),  onSuccess: () => { setSuccess("Account unsuspended");               setConfirmAction(null); invalidate(); }, onError: (e: any) => handleError(e.message) });
  const extendTrial = useMutation({ mutationFn: () => supportApi.accounts.extendTrial(accountId, trialDays), onSuccess: () => { setSuccess(`Trial extended by ${trialDays} days`); setConfirmAction(null); invalidate(); }, onError: (e: any) => handleError(e.message) });
  const resetSms    = useMutation({ mutationFn: () => supportApi.accounts.resetSms(accountId),   onSuccess: () => { setSuccess("SMS allowance restored");            setConfirmAction(null); invalidate(); }, onError: (e: any) => handleError(e.message) });
  const sendEmail   = useMutation({ mutationFn: () => supportApi.accounts.sendEmail(accountId, emailSubject, emailMessage), onSuccess: () => { setSuccess("Email sent to " + owner.email); setConfirmAction(null); setEmailMessage(""); }, onError: (e: any) => handleError(e.message) });
  const resetPw     = useMutation({ mutationFn: () => supportApi.accounts.resetPassword(accountId), onSuccess: (d: any) => { setSuccess(`Password reset email sent to ${d.email}`); setConfirmAction(null); }, onError: (e: any) => handleError(e.message) });
  const forceLogout = useMutation({ mutationFn: () => supportApi.accounts.forceLogout(accountId),  onSuccess: () => { setSuccess("All sessions invalidated");          setConfirmAction(null); }, onError: (e: any) => handleError(e.message) });
  const genMagicLink= useMutation({
    mutationFn: () => supportApi.accounts.magicLink(accountId),
    onSuccess: (d: any) => { setMagicLink(d.link); setConfirmAction("magic-link-result"); },
    onError: (e: any) => handleError(e.message),
  });

  const copyLink = () => {
    if (!magicLink) return;
    navigator.clipboard.writeText(magicLink).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const isSuspended = store.accountStatus === "Suspended";

  const actions = [
    { id: "extend-trial",  label: "Extend Trial",        desc: "Add more trial days",            icon: <Zap size={14} className="text-amber-500" />,    bg: "hover:bg-amber-50 hover:border-amber-200" },
    { id: isSuspended ? "unsuspend" : "suspend",
      label: isSuspended ? "Unsuspend Account" : "Suspend Account",
      desc:  isSuspended ? "Re-enable this account"      : "Temporarily disable account",
      icon:  isSuspended ? <UserCheck size={14} className="text-emerald-500" /> : <UserX size={14} className="text-red-500" />,
      bg:    isSuspended ? "hover:bg-emerald-50 hover:border-emerald-200" : "hover:bg-red-50 hover:border-red-200" },
    { id: "reset-sms",     label: "Reset SMS Allowance",  desc: "Restore monthly SMS quota",      icon: <RotateCcw size={14} className="text-violet-500" />, bg: "hover:bg-violet-50 hover:border-violet-200" },
    { id: "send-email",    label: "Send System Email",    desc: "Email a message to owner",       icon: <Mail size={14} className="text-sky-500" />,         bg: "hover:bg-sky-50 hover:border-sky-200" },
    { id: "magic-link",    label: "Generate Magic Link",  desc: "One-click login link (15 min)",  icon: <Link size={14} className="text-indigo-500" />,      bg: "hover:bg-indigo-50 hover:border-indigo-200" },
    { id: "reset-password",label: "Reset Password",       desc: "Send password reset email",      icon: <KeyRound size={14} className="text-orange-500" />, bg: "hover:bg-orange-50 hover:border-orange-200" },
    { id: "force-logout",  label: "Force Logout",         desc: "Invalidate all active sessions", icon: <LogOut size={14} className="text-rose-500" />,     bg: "hover:bg-rose-50 hover:border-rose-200" },
    { id: "impersonate",   label: "Login as Customer",    desc: "View account as owner",          icon: <Shield size={14} className="text-slate-400" />,    bg: "hover:bg-slate-50 hover:border-slate-200" },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-700">Account Actions</h3>
      </div>
      <div className="p-3 space-y-1.5">
        {success && <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-700 font-medium">✓ {success}</div>}
        {error   && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 font-medium">✗ {error}</div>}

        {/* Extend Trial */}
        {confirmAction === "extend-trial" && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-amber-800">Extend trial period?</p>
            <div className="flex items-center gap-2">
              <label className="text-xs text-amber-700">Days:</label>
              <input type="number" value={trialDays} onChange={e => setTrialDays(parseInt(e.target.value) || 7)} min={1} max={90}
                className="w-16 text-xs border border-amber-300 rounded px-2 py-1 focus:outline-none bg-white" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmAction(null)} className="text-xs text-slate-600 px-2 py-1 rounded hover:bg-white">Cancel</button>
              <button onClick={() => extendTrial.mutate()} disabled={extendTrial.isPending}
                className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded font-medium disabled:opacity-50">
                {extendTrial.isPending ? "Extending…" : "Extend"}
              </button>
            </div>
          </div>
        )}

        {/* Suspend / Unsuspend */}
        {(confirmAction === "suspend" || confirmAction === "unsuspend") && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle size={13} className="text-red-500" />
              <p className="text-xs font-medium text-red-800">{confirmAction === "suspend" ? "Suspend this account?" : "Unsuspend this account?"}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmAction(null)} className="text-xs text-slate-600 px-2 py-1 rounded hover:bg-white">Cancel</button>
              <button onClick={() => (confirmAction === "suspend" ? suspend : unsuspend).mutate()}
                disabled={suspend.isPending || unsuspend.isPending}
                className={`text-xs text-white px-3 py-1 rounded font-medium disabled:opacity-50 ${confirmAction === "suspend" ? "bg-red-500 hover:bg-red-600" : "bg-emerald-500 hover:bg-emerald-600"}`}>
                {suspend.isPending || unsuspend.isPending ? "Processing…" : "Confirm"}
              </button>
            </div>
          </div>
        )}

        {/* Reset SMS */}
        {confirmAction === "reset-sms" && (
          <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-violet-800">Restore full monthly SMS allowance?</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmAction(null)} className="text-xs text-slate-600 px-2 py-1 rounded hover:bg-white">Cancel</button>
              <button onClick={() => resetSms.mutate()} disabled={resetSms.isPending}
                className="text-xs bg-violet-600 hover:bg-violet-700 text-white px-3 py-1 rounded font-medium disabled:opacity-50">
                {resetSms.isPending ? "Resetting…" : "Reset"}
              </button>
            </div>
          </div>
        )}

        {/* Send Email */}
        {confirmAction === "send-email" && (
          <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-sky-800">Email to {owner.email}</p>
            <div>
              <label className="block text-[10px] text-sky-700 mb-1">Subject</label>
              <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)}
                className="w-full text-xs border border-sky-200 rounded px-2 py-1.5 focus:outline-none focus:border-sky-400 bg-white" />
            </div>
            <div>
              <label className="block text-[10px] text-sky-700 mb-1">Message</label>
              <textarea value={emailMessage} onChange={e => setEmailMessage(e.target.value)} rows={3}
                placeholder="Type your message…"
                className="w-full text-xs border border-sky-200 rounded px-2 py-1.5 focus:outline-none focus:border-sky-400 bg-white resize-none" />
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-sky-600"><Info size={10} />Sent via platform transactional email.</div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmAction(null)} className="text-xs text-slate-600 px-2 py-1 rounded hover:bg-white">Cancel</button>
              <button onClick={() => sendEmail.mutate()} disabled={sendEmail.isPending || !emailSubject || !emailMessage}
                className="text-xs bg-sky-500 hover:bg-sky-600 text-white px-3 py-1 rounded font-medium disabled:opacity-50">
                {sendEmail.isPending ? "Sending…" : "Send Email"}
              </button>
            </div>
          </div>
        )}

        {/* Magic Link */}
        {confirmAction === "magic-link" && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-indigo-800">Generate one-click login link?</p>
            <p className="text-[10px] text-indigo-600 leading-relaxed">
              Creates a 15-minute magic link for {owner.name || owner.email}. The link will be logged.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmAction(null)} className="text-xs text-slate-600 px-2 py-1 rounded hover:bg-white">Cancel</button>
              <button onClick={() => genMagicLink.mutate()} disabled={genMagicLink.isPending}
                className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded font-medium disabled:opacity-50">
                {genMagicLink.isPending ? "Generating…" : "Generate Link"}
              </button>
            </div>
          </div>
        )}

        {/* Magic Link Result */}
        {confirmAction === "magic-link-result" && magicLink && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-indigo-800">Magic link ready — expires in 15 minutes</p>
            <div className="flex items-center gap-1.5 bg-white border border-indigo-200 rounded px-2 py-1.5">
              <span className="text-[10px] text-slate-500 truncate flex-1 font-mono">{magicLink}</span>
              <button onClick={copyLink} className="flex-shrink-0 text-indigo-600 hover:text-indigo-800 transition">
                {copied ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </div>
            <button onClick={() => { setConfirmAction(null); setMagicLink(null); }}
              className="text-xs text-slate-500 hover:text-slate-700">Done</button>
          </div>
        )}

        {/* Reset Password */}
        {confirmAction === "reset-password" && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-orange-800">Send password reset to {owner.email}?</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmAction(null)} className="text-xs text-slate-600 px-2 py-1 rounded hover:bg-white">Cancel</button>
              <button onClick={() => resetPw.mutate()} disabled={resetPw.isPending}
                className="text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-1 rounded font-medium disabled:opacity-50">
                {resetPw.isPending ? "Sending…" : "Send Reset Email"}
              </button>
            </div>
          </div>
        )}

        {/* Force Logout */}
        {confirmAction === "force-logout" && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle size={13} className="text-rose-500" />
              <p className="text-xs font-medium text-rose-800">Force logout all sessions?</p>
            </div>
            <p className="text-[10px] text-rose-600">The owner will need to log in again on all devices.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmAction(null)} className="text-xs text-slate-600 px-2 py-1 rounded hover:bg-white">Cancel</button>
              <button onClick={() => forceLogout.mutate()} disabled={forceLogout.isPending}
                className="text-xs bg-rose-600 hover:bg-rose-700 text-white px-3 py-1 rounded font-medium disabled:opacity-50">
                {forceLogout.isPending ? "Processing…" : "Force Logout"}
              </button>
            </div>
          </div>
        )}

        {/* Impersonate */}
        {confirmAction === "impersonate" && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Info size={13} className="text-slate-500" />
              <p className="text-xs font-medium text-slate-700">Login as {owner.name || "customer"}</p>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Full impersonation is not yet available. Use <strong>Generate Magic Link</strong> to access the account, or contact engineering for a direct session token.
            </p>
            <button onClick={() => setConfirmAction(null)} className="text-xs text-indigo-600 hover:underline">Close</button>
          </div>
        )}

        {actions.map(a => (
          <button key={a.id} onClick={() => setConfirmAction(a.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-transparent transition text-left group ${a.bg}`}>
            <div className="w-7 h-7 rounded-lg bg-slate-50 group-hover:bg-white flex items-center justify-center flex-shrink-0 transition">{a.icon}</div>
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
