import { useQuery } from "@tanstack/react-query";
import { supportApi, type CommunicationsData } from "@/lib/support-api";
import { format, parseISO } from "date-fns";
import { MessageSquare, ArrowDownLeft, ArrowUpRight, AlertCircle, Clock, Ticket } from "lucide-react";

function fmtDate(d: string) {
  try { return format(parseISO(d), "MMM d, yyyy h:mm a"); } catch { return d; }
}
function fmtShort(d: string) {
  try { return format(parseISO(d), "MMM d, h:mm a"); } catch { return d; }
}

const smsStatusConfig: Record<string, { color: string; bg: string }> = {
  delivered: { color: "text-emerald-700", bg: "bg-emerald-50" },
  sent:      { color: "text-emerald-700", bg: "bg-emerald-50" },
  failed:    { color: "text-red-700",     bg: "bg-red-50"     },
  queued:    { color: "text-amber-700",   bg: "bg-amber-50"   },
  undelivered: { color: "text-orange-700", bg: "bg-orange-50" },
};

const ticketStatusConfig: Record<string, { color: string; bg: string; label: string }> = {
  open:     { color: "text-blue-700",    bg: "bg-blue-50",    label: "Open"     },
  pending:  { color: "text-amber-700",   bg: "bg-amber-50",   label: "Pending"  },
  resolved: { color: "text-emerald-700", bg: "bg-emerald-50", label: "Resolved" },
  closed:   { color: "text-slate-600",   bg: "bg-slate-100",  label: "Closed"   },
};

const priorityConfig: Record<string, { color: string }> = {
  urgent: { color: "text-red-600"    },
  high:   { color: "text-orange-600" },
  medium: { color: "text-amber-600"  },
  low:    { color: "text-slate-400"  },
};

export default function CommunicationsTab({ accountId }: { accountId: number }) {
  const { data, isLoading, error } = useQuery<CommunicationsData>({
    queryKey: ["support-communications", accountId],
    queryFn: () => supportApi.accounts.communications(accountId),
    staleTime: 60_000,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error || !data) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-slate-400 text-sm">Failed to load communications data.</p>
    </div>
  );

  const { smsLog, tickets, smsStats } = data;

  const kpis = [
    { icon: MessageSquare, label: "Total SMS",   value: smsStats.total,    color: "text-indigo-600",  bg: "bg-indigo-50"  },
    { icon: ArrowDownLeft, label: "Received",    value: smsStats.inbound,  color: "text-emerald-600", bg: "bg-emerald-50" },
    { icon: ArrowUpRight,  label: "Sent",        value: smsStats.outbound, color: "text-blue-600",    bg: "bg-blue-50"    },
    { icon: AlertCircle,   label: "Failed",      value: smsStats.failed,   color: "text-red-600",     bg: "bg-red-50"     },
    { icon: Clock,         label: "Last 30 Days",value: smsStats.last_30d, color: "text-violet-600",  bg: "bg-violet-50"  },
  ];

  return (
    <div className="p-6 space-y-5">

      {/* Phone (Certxa Pro app): how this account takes calls, its calls, and texts on its number. */}
      {data.phone && <PhoneSection data={data} />}

      {/* SMS KPI strip */}
      <div className="grid grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map(k => (
          <div key={k.label} className={`rounded-xl ${k.bg} p-3 flex flex-col gap-1`}>
            <k.icon size={14} className={k.color} />
            <div className={`text-lg font-bold ${k.color}`}>{k.value.toLocaleString()}</div>
            <div className="text-[10px] text-slate-500 leading-tight">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* SMS log */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare size={13} className="text-slate-400" />
              <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">SMS Log (last 30)</h3>
            </div>
          </div>
          {smsLog.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-xs text-slate-400">No SMS messages on record</p>
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[480px] divide-y divide-slate-50">
              {smsLog.map((msg) => {
                const statusCfg = smsStatusConfig[msg.status] ?? { color: "text-slate-600", bg: "bg-slate-50" };
                const isInbound = msg.message_type === "inbound";
                return (
                  <div key={msg.id} className="px-4 py-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        {isInbound
                          ? <ArrowDownLeft size={11} className="text-emerald-500" />
                          : <ArrowUpRight  size={11} className="text-blue-500" />
                        }
                        <span className="text-xs font-medium text-slate-700">{msg.phone}</span>
                        {msg.sms_source && (
                          <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {msg.sms_source}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusCfg.bg} ${statusCfg.color}`}>
                          {msg.status}
                        </span>
                        <span className="text-[10px] text-slate-400">{fmtShort(msg.sent_at)}</span>
                      </div>
                    </div>
                    {msg.message_body && (
                      <p className="text-xs text-slate-500 truncate pl-4">{msg.message_body}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Support tickets */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <Ticket size={13} className="text-slate-400" />
            <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Support Tickets (last 10)</h3>
          </div>
          {tickets.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-xs text-slate-400">No tickets on record</p>
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[480px] divide-y divide-slate-50">
              {tickets.map((t) => {
                const statusCfg  = ticketStatusConfig[t.status]   ?? { color: "text-slate-600", bg: "bg-slate-100", label: t.status };
                const priorityCfg = priorityConfig[t.priority]    ?? { color: "text-slate-400" };
                return (
                  <div key={t.id} className="px-4 py-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[10px] text-slate-400 font-mono">{t.ticket_number}</span>
                          {t.channel && (
                            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded capitalize">{t.channel}</span>
                          )}
                        </div>
                        <p className="text-xs font-medium text-slate-800 truncate">{t.subject}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {t.message_count} message{t.message_count !== 1 ? "s" : ""} · {fmtDate(t.created_at)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusCfg.bg} ${statusCfg.color}`}>
                          {statusCfg.label}
                        </span>
                        <span className={`text-[10px] font-medium capitalize ${priorityCfg.color}`}>
                          {t.priority}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

const pretty = (n: string) => { const d = (n ?? "").replace(/\D/g, "").slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : n; };
const CALL_STATUS: Record<string, { label: string; color: string }> = {
  answered:    { label: "Answered",  color: "text-emerald-700" },
  missed:      { label: "Missed",    color: "text-red-700" },
  "no-answer": { label: "No answer", color: "text-amber-700" },
  failed:      { label: "Failed",    color: "text-red-700" },
  ringing:     { label: "Ringing",   color: "text-slate-500" },
};

/** The Certxa Pro app's phone: Business Phone number or Plus calling, recent calls, and texts with clients. */
function PhoneSection({ data }: { data: CommunicationsData }) {
  const phone = data.phone!;
  const calls = data.calls ?? [];
  const conversations = data.conversations ?? [];
  const phoneTexts = data.phoneTexts ?? [];
  const billing = phone.mode === "line"
    ? phone.billingStatus === "free" ? "No charge (test line)"
      : phone.billingStatus === "held" ? "Paused: payment failed"
      : phone.billingStatus === "past_due" ? "Payment failed, retrying"
      : `$10/month${phone.paidUntil ? ` · ${phone.cancelAtPeriodEnd ? "ends" : "renews"} ${fmtShort(phone.paidUntil)}` : ""}`
    : "Included with Plus";
  const card = "bg-white rounded-xl border border-slate-200 overflow-hidden";
  const head = (title: string) => (
    <div className="px-4 py-3 border-b border-slate-100"><h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">{title}</h3></div>
  );
  return (
    <div className="space-y-5" data-testid="support-phone">
      <div className={card}>
        {head(phone.mode === "line" ? "Business Phone" : "Plus calling")}
        <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div><div className="text-slate-500">{phone.mode === "line" ? "Business number" : "Shared Plus number"}</div><div className="font-semibold text-slate-800">{pretty(phone.number)}</div></div>
          <div><div className="text-slate-500">Rings the app</div><div className="font-semibold text-slate-800">{phone.ring === "always" ? "Any time" : "During business hours"}</div></div>
          <div><div className="text-slate-500">Billing</div><div className="font-semibold text-slate-800">{billing}</div></div>
          <div><div className="text-slate-500">Who can call</div><div className="font-semibold text-slate-800">{phone.mode === "line" ? "Anyone (except blocked numbers)" : "Only the pro's clients"}</div></div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className={card}>
          {head(`Calls (last ${calls.length})`)}
          {calls.length === 0 ? <p className="px-4 py-6 text-center text-xs text-slate-400">No calls yet.</p> : (
            <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
              {calls.map((c) => {
                const st = CALL_STATUS[c.status] ?? { label: c.status, color: "text-slate-600" };
                return (
                  <div key={c.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      {c.direction === "incoming" ? <ArrowDownLeft size={12} className="text-slate-400 shrink-0" /> : <ArrowUpRight size={12} className="text-slate-400 shrink-0" />}
                      <div className="min-w-0">
                        <div className="text-slate-800 truncate">{c.client_name || pretty(c.other_number)}</div>
                        <div className="text-slate-400">{c.direction === "incoming" ? "Incoming" : "Outgoing"} · {fmtShort(c.started_at)}</div>
                      </div>
                    </div>
                    <div className={`shrink-0 font-medium ${st.color}`}>{st.label}{c.status === "answered" && c.duration_seconds ? ` · ${Math.max(1, Math.round(c.duration_seconds / 60))} min` : ""}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className={card}>
          {head(`Texts with clients (last ${conversations.length + phoneTexts.length})`)}
          {conversations.length + phoneTexts.length === 0 ? <p className="px-4 py-6 text-center text-xs text-slate-400">No texts with clients yet.</p> : (
            <div className="divide-y divide-slate-50 max-h-96 overflow-y-auto">
              {[
                ...conversations.map((m) => ({ key: `c${m.id}`, who: m.client_name || pretty(m.client_phone), inbound: m.direction === "inbound", body: m.body, at: m.created_at, where: phone.mode === "plus" ? "Messages" : "Two-way texting" })),
                ...phoneTexts.map((t) => ({ key: `p${t.id}`, who: pretty(t.from_number), inbound: true, body: t.body || (t.media_count ? "Sent a photo" : ""), at: t.received_at, where: "Business Phone" })),
              ].sort((a, b) => b.at.localeCompare(a.at)).map((m) => (
                <div key={m.key} className="px-4 py-2.5 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-slate-800 font-medium">
                      {m.inbound ? <ArrowDownLeft size={12} className="text-slate-400" /> : <ArrowUpRight size={12} className="text-slate-400" />}{m.inbound ? m.who : `To ${m.who}`}
                    </span>
                    <span className="text-slate-400 shrink-0">{fmtShort(m.at)} · {m.where}</span>
                  </div>
                  <p className="text-slate-600 mt-0.5 line-clamp-2">{m.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

