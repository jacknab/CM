import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ExternalLink, Send, Paperclip, Bold, Italic, Link2,
  List, Quote, MessageSquare, Lock, AlertCircle, ChevronDown, Zap,
} from "lucide-react";
import { api, type TicketDetail, type TicketMessage, type Macro } from "@/lib/api";
import { format, formatDistanceToNow } from "date-fns";
import { clsx } from "clsx";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

const PRIORITY_CFG: Record<string, { bg: string; text: string }> = {
  urgent: { bg: "bg-red-500",    text: "text-white" },
  high:   { bg: "bg-orange-500", text: "text-white" },
  normal: { bg: "bg-blue-500",   text: "text-white" },
  medium: { bg: "bg-blue-500",   text: "text-white" },
  low:    { bg: "bg-slate-400",  text: "text-white" },
};

interface Props {
  ticketId: number;
  onTicketUpdate?: () => void;
}

// ─── Message Bubble (linear, left-aligned) ────────────────────────────────────

function MessageBubble({ msg }: { msg: TicketMessage }) {
  const isSystem   = msg.author_type === "system";
  const isInternal = msg.is_internal;
  const isAgent    = msg.author_type === "agent";
  const isCustomer = msg.author_type === "customer";

  // System event: centered pill
  if (isSystem) {
    return (
      <div className="flex items-center justify-center my-2 gap-3">
        <div className="flex-1 h-px bg-slate-100" />
        <span className="text-[10px] text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-3 py-1 whitespace-nowrap">
          {msg.content}
        </span>
        <div className="flex-1 h-px bg-slate-100" />
      </div>
    );
  }

  const initials = getInitials(msg.author_name ?? "?");
  const avatarCls = isInternal  ? "bg-amber-400 text-white" :
                    isAgent     ? "bg-indigo-600 text-white" :
                                  "bg-emerald-500 text-white";
  const roleLabel = isInternal  ? "Support Agent" :
                    isAgent     ? "Support Agent" :
                                  "(Customer)";

  return (
    <div className={clsx("flex items-start gap-3 mb-5", isInternal && "opacity-95")}>
      {/* Avatar */}
      <div className={clsx("w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5 ring-2 ring-white shadow-sm", avatarCls)}>
        {initials || "?"}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className="text-xs font-semibold text-slate-800">{msg.author_name}</span>
          <span className="text-[10px] text-slate-400">{roleLabel}</span>
          {isInternal && (
            <span className="text-[9px] bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-bold">
              Internal Note
            </span>
          )}
          <span className="text-[10px] text-slate-400 ml-auto">
            {format(new Date(msg.created_at), "MMM d, yyyy h:mm aa")}
          </span>
        </div>

        {/* Message body */}
        <div className={clsx(
          "rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap break-words",
          isInternal
            ? "bg-amber-50 border border-amber-200"
            : isAgent
            ? "bg-white border border-slate-200 shadow-sm"
            : "bg-white border border-slate-200 shadow-sm"
        )}>
          {msg.content}
        </div>
      </div>
    </div>
  );
}

// ─── Composer ─────────────────────────────────────────────────────────────────

function Composer({ ticketId, onSent }: { ticketId: number; onSent: () => void }) {
  const [mode, setMode]       = useState<"reply" | "note">("reply");
  const [content, setContent] = useState("");
  const [showMacros, setShowMacros] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const qc = useQueryClient();

  const { data: macros = [] } = useQuery<Macro[]>({
    queryKey: ["support-macros"],
    queryFn: () => api.macros.list(),
    staleTime: 60_000,
  });

  const send = useMutation({
    mutationFn: () => api.tickets.addMessage(ticketId, content.trim(), mode === "note"),
    onSuccess: () => {
      setContent("");
      qc.invalidateQueries({ queryKey: ["support-ticket", ticketId] });
      onSent();
    },
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (content.trim()) send.mutate();
    }
  };

  return (
    <div className={clsx(
      "border-t flex-shrink-0 bg-white",
      mode === "note" ? "border-amber-300" : "border-slate-200"
    )}>
      {/* Mode tabs */}
      <div className="flex border-b border-inherit px-2">
        <button
          onClick={() => setMode("reply")}
          className={clsx(
            "px-4 py-2.5 text-xs font-semibold border-b-2 transition",
            mode === "reply" ? "border-indigo-500 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          Public Reply
        </button>
        <button
          onClick={() => setMode("note")}
          className={clsx(
            "px-4 py-2.5 text-xs font-semibold border-b-2 transition",
            mode === "note" ? "border-amber-500 text-amber-700" : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          Internal Note
        </button>
      </div>

      {/* Textarea */}
      <div className="px-4 py-3">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={e => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your response..."
          rows={4}
          className={clsx(
            "w-full text-sm resize-none focus:outline-none bg-transparent placeholder-slate-400 leading-relaxed",
            mode === "note" ? "text-amber-900" : "text-slate-700"
          )}
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 pb-3">
        <div className="flex items-center gap-0.5">
          {/* Format buttons */}
          {[
            { icon: <Bold size={13} />, title: "Bold" },
            { icon: <Italic size={13} />, title: "Italic" },
            { icon: <Link2 size={13} />, title: "Link" },
            { icon: <List size={13} />, title: "List" },
            { icon: <Quote size={13} />, title: "Quote" },
          ].map(btn => (
            <button key={btn.title} title={btn.title}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition">
              {btn.icon}
            </button>
          ))}

          <div className="w-px h-4 bg-slate-200 mx-1" />

          <button
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition"
            title="Attach file"
          >
            <Paperclip size={13} />
          </button>

          {/* Macros */}
          <div className="relative">
            <button
              onClick={() => setShowMacros(o => !o)}
              className="flex items-center gap-1 px-2 py-1.5 text-[10px] text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition"
            >
              <Zap size={11} />
              Macros
              <ChevronDown size={9} />
            </button>
            {showMacros && (
              <div className="absolute bottom-full left-0 mb-1 w-64 bg-white rounded-xl border border-slate-200 shadow-2xl z-30 max-h-56 overflow-y-auto">
                <div className="px-3 py-2 border-b border-slate-100">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Templates</p>
                </div>
                {macros.length === 0 ? (
                  <p className="text-xs text-slate-400 p-4 text-center">No templates yet</p>
                ) : (
                  macros.map(m => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setContent(c => c + (c ? "\n\n" : "") + m.content);
                        setShowMacros(false);
                        textareaRef.current?.focus();
                      }}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition border-b border-slate-50 last:border-0"
                    >
                      <p className="text-xs font-semibold text-slate-800">{m.title}</p>
                      <p className="text-[10px] text-slate-400 capitalize">{m.category}</p>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 hidden sm:block">⌘ + Enter</span>
          <button
            onClick={() => content.trim() && send.mutate()}
            disabled={!content.trim() || send.isPending}
            className={clsx(
              "flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold transition disabled:opacity-50",
              mode === "note"
                ? "bg-amber-500 hover:bg-amber-600 text-white"
                : "bg-indigo-600 hover:bg-indigo-700 text-white"
            )}
          >
            {send.isPending ? (
              <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Send size={12} />
            )}
            {mode === "note" ? "Save Note" : "Send Reply"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Activity log ────────────────────────────────────────────────────────────

function ActivityTab({ accountId }: { accountId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["support-activity-ticket", accountId],
    queryFn: () =>
      fetch(`/api/support/accounts/${accountId}/activity?range=30d&limit=50`, { credentials: "include" }).then(r => r.json()),
    staleTime: 30_000,
    enabled: !!accountId,
  });
  const events = data?.events ?? [];

  if (isLoading) return <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /></div>;
  if (!events.length) return <div className="p-6 text-center text-sm text-slate-400">No recent activity</div>;

  return (
    <div className="p-4 space-y-0">
      {events.map((ev: any, i: number) => (
        <div key={ev.id ?? i} className="flex items-start gap-3 py-2.5 border-b border-slate-50 last:border-0">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-300 mt-1.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-700 font-medium">{ev.title}</p>
            {ev.subtitle && <p className="text-[10px] text-slate-400 mt-0.5">{ev.subtitle}</p>}
          </div>
          <span className="text-[9px] text-slate-400 flex-shrink-0">{format(new Date(ev.occurred_at), "MMM d")}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Related Tickets ─────────────────────────────────────────────────────────

function RelatedTab({ ticketId }: { ticketId: number }) {
  const navigate = useNavigate();
  const { data: related = [], isLoading } = useQuery({
    queryKey: ["support-related", ticketId],
    queryFn: () => api.tickets.related(ticketId),
    staleTime: 60_000,
  });

  if (isLoading) return <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /></div>;
  if (!related.length) return <div className="p-6 text-center text-sm text-slate-400">No related tickets</div>;

  return (
    <div className="p-3 space-y-1.5">
      {related.map(t => (
        <button
          key={t.id}
          onClick={() => navigate(`/tickets/${t.id}`)}
          className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-slate-50 transition border border-slate-100 hover:border-slate-200"
        >
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[9px] font-mono text-slate-400">{t.ticket_number}</span>
          </div>
          <p className="text-xs text-slate-700 font-medium leading-snug">{t.subject}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}</p>
        </button>
      ))}
    </div>
  );
}

// ─── Notes Tab ───────────────────────────────────────────────────────────────

function NotesTab({ ticketId, notes }: { ticketId: number; notes: TicketMessage[] }) {
  const qc = useQueryClient();
  const [content, setContent] = useState("");
  const add = useMutation({
    mutationFn: () => api.tickets.addMessage(ticketId, content.trim(), true),
    onSuccess: () => { setContent(""); qc.invalidateQueries({ queryKey: ["support-ticket", ticketId] }); },
  });

  return (
    <div className="p-4 space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-xs font-bold text-amber-800 mb-2 flex items-center gap-1.5"><Lock size={11} /> Add Internal Note</p>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Notes are only visible to support agents…"
          rows={3}
          className="w-full text-sm border border-amber-200 rounded-lg p-2 resize-none focus:outline-none focus:border-amber-400 bg-white"
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={() => content.trim() && add.mutate()}
            disabled={!content.trim() || add.isPending}
            className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition"
          >
            {add.isPending ? "Saving…" : "Save Note"}
          </button>
        </div>
      </div>
      {notes.length === 0 ? (
        <div className="text-center py-6 text-sm text-slate-400">No internal notes yet</div>
      ) : (
        notes.map(m => (
          <div key={m.id} className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Lock size={11} className="text-amber-600" />
              <span className="text-xs font-bold text-amber-800">{m.author_name}</span>
              <span className="text-[10px] text-amber-500 ml-auto">{format(new Date(m.created_at), "MMM d 'at' h:mm aa")}</span>
            </div>
            <p className="text-sm text-amber-900 whitespace-pre-wrap leading-relaxed">{m.content}</p>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Customer Info Tab ───────────────────────────────────────────────────────

function CustomerInfoTab({ accountId }: { accountId: number }) {
  const { data: overview, isLoading } = useQuery({
    queryKey: ["support-account-overview", accountId],
    queryFn: () => api.accounts.overview(accountId),
    staleTime: 60_000,
    enabled: !!accountId,
  });

  if (isLoading) return <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /></div>;
  if (!overview) return <div className="p-6 text-center text-sm text-slate-400">Account not found</div>;

  const { store, owner, subscription } = overview;
  const rows = [
    { label: "Business",  value: store.name },
    { label: "Owner",     value: owner.name || "—" },
    { label: "Email",     value: owner.email || "—" },
    { label: "Phone",     value: store.phone || "—" },
    { label: "Industry",  value: store.category || "—" },
    { label: "Timezone",  value: store.timezone || "—" },
    { label: "Plan",      value: subscription?.planName ?? "No plan" },
    { label: "Status",    value: store.accountStatus ?? "—" },
  ];

  return (
    <div className="p-4">
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {rows.map((r, i) => (
          <div key={r.label} className={clsx("flex items-center gap-3 px-4 py-2.5", i < rows.length - 1 && "border-b border-slate-50")}>
            <span className="text-[10px] font-semibold text-slate-500 w-24 flex-shrink-0">{r.label}</span>
            <span className="text-xs text-slate-800 font-medium">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── TABS definition ─────────────────────────────────────────────────────────

const TABS_DEF = [
  { id: "conversation",  label: "Conversation",    countKey: "messages" },
  { id: "notes",         label: "Internal Notes",  countKey: "notes" },
  { id: "customer_info", label: "Customer Info",   countKey: null },
  { id: "activity",      label: "Activity Log",    countKey: null },
  { id: "related",       label: "Related Tickets", countKey: "related" },
  { id: "attachments",   label: "Attachments",     countKey: null },
] as const;

type TabId = typeof TABS_DEF[number]["id"];

// ─── Main Component ──────────────────────────────────────────────────────────

export default function TicketConversationPanel({ ticketId, onTicketUpdate }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>("conversation");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useQuery<TicketDetail>({
    queryKey: ["support-ticket", ticketId],
    queryFn: () => api.tickets.get(ticketId),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const ticket   = data?.ticket;
  const messages = data?.messages ?? [];
  const publicMessages  = messages.filter(m => !m.is_internal);
  const internalNotes   = messages.filter(m => m.is_internal);

  useEffect(() => {
    if (activeTab === "conversation") {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [messages.length, activeTab]);

  const handleSent = () => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 200);
    onTicketUpdate?.();
  };

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Loading ticket…</p>
      </div>
    </div>
  );

  if (error || !ticket) return (
    <div className="flex-1 flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <AlertCircle size={32} className="text-slate-200 mx-auto mb-3" />
        <p className="text-slate-500 text-sm">Ticket not found</p>
      </div>
    </div>
  );

  const accountId  = ticket.account_id;
  const pri        = PRIORITY_CFG[ticket.priority?.toLowerCase()] ?? PRIORITY_CFG.normal;

  // Tab counts
  const tabCounts: Record<string, number | null> = {
    notes:   internalNotes.length || null,
    related: null, // loaded async
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
      {/* ── Ticket Header ─────────────────────────────────────────────────── */}
      <div className="px-5 pt-4 pb-3 border-b border-slate-100 bg-white flex-shrink-0">
        {/* Priority + ticket num + created */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className={clsx("text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wide", pri.bg, pri.text)}>
            {(ticket.priority ?? "normal").toUpperCase()} PRIORITY
          </span>
          <span className="text-[10px] font-mono text-slate-500">{ticket.ticket_number}</span>
          <span className="text-[10px] text-slate-400">
            Created {format(new Date(ticket.created_at), "MMM d, yyyy h:mm aa")}
          </span>
        </div>

        {/* Subject */}
        <h2 className="text-lg font-black text-slate-900 leading-tight mb-2">{ticket.subject}</h2>

        {/* Business name link */}
        {ticket.account_name_resolved && (
          <button
            onClick={() => navigate(`/accounts/${accountId}`)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition mb-3"
          >
            {ticket.account_name_resolved}
            <ExternalLink size={11} />
          </button>
        )}

        {/* Customer info bar */}
        {ticket.account_id && (
          <div className="flex items-center gap-4 flex-wrap text-[11px] text-slate-500 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
            <span>Account ID <span className="font-semibold text-slate-700">{ticket.account_id_display ?? `ACC-${String(accountId).padStart(5,"0")}`}</span></span>
            {ticket.owner_name && <span>Owner <span className="font-semibold text-slate-700">{ticket.owner_name}</span></span>}
            {ticket.plan_name  && <span>Plan <span className="font-semibold text-slate-700">{ticket.plan_name}</span></span>}
            {ticket.account_status && (
              <span className={clsx(
                "text-[9px] font-bold px-2 py-0.5 rounded-full border",
                (ticket.account_status ?? "").toLowerCase() === "active"
                  ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                  : "bg-slate-100 text-slate-600 border-slate-200"
              )}>
                Status: {ticket.account_status}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Tab Bar ──────────────────────────────────────────────────────── */}
      <div className="flex gap-0 border-b border-slate-200 bg-white flex-shrink-0 overflow-x-auto scrollbar-none">
        {TABS_DEF.map(tab => {
          const count = tabCounts[tab.id];
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition",
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              {tab.label}
              {count != null && count > 0 && (
                <span className="bg-indigo-100 text-indigo-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ──────────────────────────────────────────────────── */}
      {activeTab === "conversation" ? (
        <>
          <div className="flex-1 overflow-y-auto scrollbar-thin p-5 bg-slate-50">
            {publicMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-center">
                <MessageSquare size={28} className="text-slate-200 mb-3" />
                <p className="text-sm text-slate-400 font-medium">No messages yet</p>
                <p className="text-xs text-slate-400 mt-1">Send the first reply below</p>
              </div>
            ) : (
              messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)
            )}
            <div ref={bottomRef} />
          </div>
          <Composer ticketId={ticketId} onSent={handleSent} />
        </>
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-thin bg-slate-50">
          {activeTab === "notes"         && <NotesTab ticketId={ticketId} notes={internalNotes} />}
          {activeTab === "customer_info" && <CustomerInfoTab accountId={accountId} />}
          {activeTab === "activity"      && <ActivityTab accountId={accountId} />}
          {activeTab === "related"       && <RelatedTab ticketId={ticketId} />}
          {activeTab === "attachments"   && (
            <div className="p-6 text-center text-sm text-slate-400">No attachments on this ticket</div>
          )}
        </div>
      )}
    </div>
  );
}

// re-export PriorityBadge for workspace header
export function PriorityBadge({ priority }: { priority: string }) {
  const pri = PRIORITY_CFG[priority?.toLowerCase()] ?? PRIORITY_CFG.normal;
  return (
    <span className={clsx("text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wide", pri.bg, pri.text)}>
      {priority?.toUpperCase() ?? "NORMAL"}
    </span>
  );
}
