import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare, ArrowUpRight, ArrowDownLeft,
  XCircle, CheckCircle2, Clock, Mail, Send,
  AlertTriangle, Ticket, ChevronRight,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface CommsData {
  smsLog: {
    id: number;
    sent_at: string;
    message_type: "inbound" | "outbound" | string;
    phone: string | null;
    status: string | null;
    sms_source: string | null;
    message_body: string | null;
  }[];
  tickets: {
    id: number;
    ticket_number: string;
    subject: string;
    status: string;
    priority: string;
    channel: string | null;
    created_at: string;
    message_count: number;
  }[];
  smsStats: {
    total: number;
    inbound: number;
    outbound: number;
    failed: number;
    last_30d: number;
  };
}

const SMS_STATUS: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  sent:      { label: "Sent",      icon: <CheckCircle2 size={10} />, cls: "text-emerald-600" },
  delivered: { label: "Delivered", icon: <CheckCircle2 size={10} />, cls: "text-emerald-600" },
  failed:    { label: "Failed",    icon: <XCircle size={10} />,      cls: "text-red-600" },
  queued:    { label: "Queued",    icon: <Clock size={10} />,        cls: "text-amber-600" },
  received:  { label: "Received",  icon: <CheckCircle2 size={10} />, cls: "text-indigo-600" },
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "text-red-600", high: "text-orange-600", normal: "text-slate-500", low: "text-slate-400",
};

export default function CommunicationsTab({
  accountId,
  ownerEmail,
  ownerFirstName,
}: {
  accountId: number;
  ownerEmail: string;
  ownerFirstName: string;
}) {
  const qc = useQueryClient();
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailForm, setEmailForm] = useState({ subject: "", message: "" });
  const [emailSent, setEmailSent] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<CommsData>({
    queryKey: ["communications-tab", accountId],
    queryFn: () => api.accounts.communications(accountId),
    staleTime: 30_000,
  });

  const sendEmail = useMutation({
    mutationFn: () => api.accounts.sendEmail(accountId, emailForm.subject, emailForm.message),
    onSuccess: (d: any) => {
      setEmailSent(d.email ?? ownerEmail);
      setEmailForm({ subject: "", message: "" });
      setShowEmailForm(false);
      qc.invalidateQueries({ queryKey: ["communications-tab", accountId] });
      setTimeout(() => setEmailSent(null), 5000);
    },
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-48">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error || !data) return (
    <div className="flex items-center justify-center h-48 text-sm text-slate-400">
      Failed to load communications data
    </div>
  );

  const { smsLog, tickets, smsStats } = data;

  return (
    <div className="p-6 max-w-6xl space-y-5">

      {/* ── Email Success ─────────────────────────────────────────────────────── */}
      {emailSent && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
          <p className="text-sm text-emerald-700">Email sent to <strong>{emailSent}</strong></p>
        </div>
      )}

      {/* ── KPI Strip ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total SMS",       value: smsStats.total,    icon: <MessageSquare size={14} />, color: "text-indigo-600", bg: "bg-indigo-50" },
          { label: "Outbound (all)",  value: smsStats.outbound, icon: <ArrowUpRight size={14} />,  color: "text-sky-600",    bg: "bg-sky-50" },
          { label: "Inbound (all)",   value: smsStats.inbound,  icon: <ArrowDownLeft size={14} />, color: "text-violet-600", bg: "bg-violet-50" },
          { label: "Failed",          value: smsStats.failed,   icon: <XCircle size={14} />,       color: "text-red-600",    bg: "bg-red-50" },
          { label: "Last 30 Days",    value: smsStats.last_30d, icon: <Clock size={14} />,          color: "text-teal-600",   bg: "bg-teal-50" },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-xl border border-slate-200 p-4 flex gap-3 items-start">
            <div className={`w-7 h-7 rounded-lg ${m.bg} flex items-center justify-center ${m.color} flex-shrink-0`}>
              {m.icon}
            </div>
            <div>
              <div className="text-lg font-bold text-slate-800">{m.value.toLocaleString()}</div>
              <div className="text-[11px] text-slate-400">{m.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Send Email ──────────────────────────────────────────────────────── */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-sky-500" />
                <h3 className="text-sm font-semibold text-slate-700">Send Email</h3>
              </div>
              <button
                onClick={() => setShowEmailForm(f => !f)}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                {showEmailForm ? "Cancel" : "Compose"}
              </button>
            </div>

            {showEmailForm ? (
              <div className="p-4 space-y-3">
                <div className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                  To: <strong className="text-slate-700">{ownerEmail}</strong>
                </div>
                <input
                  type="text"
                  value={emailForm.subject}
                  onChange={e => setEmailForm(f => ({ ...f, subject: e.target.value }))}
                  placeholder="Subject…"
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400"
                />
                <textarea
                  value={emailForm.message}
                  onChange={e => setEmailForm(f => ({ ...f, message: e.target.value }))}
                  placeholder={`Hi ${ownerFirstName || "there"},\n\nMessage…`}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-400 resize-none"
                  rows={5}
                />
                <button
                  onClick={() => sendEmail.mutate()}
                  disabled={!emailForm.subject.trim() || !emailForm.message.trim() || sendEmail.isPending}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition"
                >
                  {sendEmail.isPending ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send size={13} />
                  )}
                  {sendEmail.isPending ? "Sending…" : "Send to Owner"}
                </button>
                {sendEmail.isError && (
                  <p className="text-xs text-red-600 text-center">{(sendEmail.error as Error)?.message ?? "Failed to send"}</p>
                )}
              </div>
            ) : (
              <div className="p-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="w-8 h-8 bg-sky-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Mail size={14} className="text-sky-600" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-700">{ownerEmail}</p>
                    <p className="text-[10px] text-slate-400">Account owner</p>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 mt-3 text-center">
                  Compose and send a system email directly to the account owner.
                </p>
              </div>
            )}
          </div>

          {/* Recent Tickets */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mt-4">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <Ticket size={14} className="text-violet-500" />
              <h3 className="text-sm font-semibold text-slate-700">Recent Tickets</h3>
              {tickets.length > 0 && (
                <span className="text-[10px] bg-violet-100 text-violet-700 rounded-full px-1.5 py-0.5 font-medium">{tickets.length}</span>
              )}
            </div>
            <div className="divide-y divide-slate-50 max-h-[300px] overflow-y-auto scrollbar-thin">
              {tickets.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <Ticket size={20} className="text-slate-200 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">No tickets found</p>
                </div>
              ) : tickets.map(t => (
                <div key={t.id} className="px-4 py-2.5 hover:bg-slate-50 transition">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[10px] font-bold uppercase ${PRIORITY_COLORS[t.priority] ?? ""}`}>{t.priority}</span>
                    <StatusBadge status={t.status} size="xs" />
                    {t.channel && (
                      <span className="text-[10px] text-slate-400 capitalize">{t.channel}</span>
                    )}
                  </div>
                  <p className="text-xs font-medium text-slate-700 truncate">{t.subject}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                    <span>{t.ticket_number}</span>
                    <span>·</span>
                    <span>{t.message_count} message{t.message_count !== 1 ? "s" : ""}</span>
                    <span>·</span>
                    <span>{format(parseISO(t.created_at), "MMM d, yyyy")}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── SMS Log ──────────────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare size={14} className="text-indigo-500" />
              <h3 className="text-sm font-semibold text-slate-800">SMS Log</h3>
              <span className="text-[10px] bg-slate-100 text-slate-600 rounded-full px-1.5 py-0.5 font-medium">
                Last 30
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><ArrowUpRight size={10} className="text-sky-500" /> Outbound</span>
              <span className="flex items-center gap-1"><ArrowDownLeft size={10} className="text-violet-500" /> Inbound</span>
            </div>
          </div>
          {smsLog.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <MessageSquare size={32} className="text-slate-200 mb-3" />
              <p className="text-sm text-slate-400">No SMS history found</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto scrollbar-thin">
              <table className="w-full text-left">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Phone</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Message</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Source</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-2.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {smsLog.map(sms => {
                    const isOut = sms.message_type === "outbound";
                    const statusCfg = SMS_STATUS[sms.status ?? ""] ?? { label: sms.status ?? "—", icon: null, cls: "text-slate-500" };
                    return (
                      <tr key={sms.id} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-2.5">
                          <div className={`flex items-center gap-1 text-[10px] font-semibold ${isOut ? "text-sky-600" : "text-violet-600"}`}>
                            {isOut ? <ArrowUpRight size={11} /> : <ArrowDownLeft size={11} />}
                            {isOut ? "Out" : "In"}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-xs font-mono text-slate-600 whitespace-nowrap">
                          {sms.phone ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 max-w-[200px]">
                          <p className="text-xs text-slate-700 truncate" title={sms.message_body ?? ""}>
                            {sms.message_body ?? <span className="text-slate-400 italic">No content</span>}
                          </p>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-[10px] text-slate-500 capitalize">{sms.sms_source ?? "—"}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`flex items-center gap-1 text-[10px] font-medium ${statusCfg.cls}`}>
                            {statusCfg.icon}
                            {statusCfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-[11px] text-slate-400 whitespace-nowrap">
                          {format(parseISO(sms.sent_at), "MMM d, h:mm a")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
