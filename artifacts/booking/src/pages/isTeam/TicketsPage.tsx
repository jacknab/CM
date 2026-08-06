import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { appAlert } from "@/lib/confirm";
import {
  MessageSquare, RefreshCw, ChevronDown, Filter, SlidersHorizontal,
  FileText, MoreHorizontal, ExternalLink,
  User, Clock, Tag, Link2, LogIn, Zap, Lock, Activity,
  Mail, Phone, Globe, MessageCircle, ChevronRight, ChevronLeft,
  AlertTriangle, CheckCircle, StickyNote, X, Wifi, WifiOff, Info,
  Send, Reply, Search,
} from "lucide-react";
import { clsx } from "clsx";
import { safeDistanceToNow, safeFormat } from "@/lib/utils";
import { supportApi, type TicketListItem, type TicketDetail, type TicketMessage, type EmailSyncStatus } from "@/lib/support-api";

// ─── Badge helpers ────────────────────────────────────────────────────────────
const CHANNEL_CONFIG: Record<string, { icon: React.ReactNode; bg: string; text: string; label: string }> = {
  EMAIL:   { icon: <Mail size={9} />,          bg: "bg-blue-100",   text: "text-blue-700",   label: "EMAIL" },
  CHAT:    { icon: <MessageCircle size={9} />,  bg: "bg-teal-100",   text: "text-teal-700",   label: "CHAT" },
  VOICE:   { icon: <Phone size={9} />,          bg: "bg-violet-100", text: "text-violet-700", label: "VOICE" },
  WEB:     { icon: <Globe size={9} />,          bg: "bg-sky-100",    text: "text-sky-700",    label: "WEB" },
  MANUAL:  { icon: <FileText size={9} />,       bg: "bg-slate-100",  text: "text-slate-500",  label: "MANUAL" },
};

function ChannelBadge({ channel }: { channel?: string }) {
  const key = (channel ?? "MANUAL").toUpperCase();
  const cfg = CHANNEL_CONFIG[key] ?? CHANNEL_CONFIG.MANUAL;
  return (
    <span className={clsx("flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded", cfg.bg, cfg.text)}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

const PRIORITY_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  high:   { bg: "bg-rose-100",   text: "text-rose-700",   label: "HIGH" },
  medium: { bg: "bg-amber-100",  text: "text-amber-700",  label: "MEDIUM" },
  low:    { bg: "bg-sky-100",    text: "text-sky-700",    label: "LOW" },
  normal: { bg: "bg-slate-100",  text: "text-slate-600",  label: "NORMAL" },
};

const STATUS_CONFIG: Record<string, { bg: string; text: string }> = {
  open:    { bg: "bg-emerald-100", text: "text-emerald-700" },
  pending: { bg: "bg-amber-100",   text: "text-amber-700" },
  closed:  { bg: "bg-slate-100",   text: "text-slate-600" },
  resolved:{ bg: "bg-blue-100",    text: "text-blue-700" },
};

const FILTER_OPTIONS = [
  { value: "my_open",       label: "My Open Tickets" },
  { value: "open",          label: "All Open Tickets" },
  { value: "pending",       label: "Pending Tickets" },
  { value: "high_priority", label: "High Priority" },
  { value: "all",           label: "All Tickets" },
];

function PriorityBadge({ priority }: { priority: string }) {
  const cfg = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.normal;
  return <span className={clsx("text-[10px] font-bold px-1.5 py-0.5 rounded", cfg.bg, cfg.text)}>{cfg.label}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.open;
  return <span className={clsx("text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase", cfg.bg, cfg.text)}>{status}</span>;
}

// ─── Ticket list row ──────────────────────────────────────────────────────────
function TicketRow({ ticket, isSelected, onClick }: { ticket: TicketListItem; isSelected: boolean; onClick: () => void }) {
  const initials = (ticket.account_name ?? "??").split(" ").slice(0, 2).map((w: string) => w[0] ?? "").join("").toUpperCase();
  const colors = ["bg-indigo-500","bg-violet-500","bg-sky-500","bg-emerald-500","bg-rose-500","bg-amber-500","bg-teal-500"];
  const colorSeed = ticket.account_id ?? (ticket.account_name ?? "").charCodeAt(0) ?? 0;
  const color = colors[colorSeed % colors.length];

  return (
    <button
      onClick={onClick}
      className={clsx(
        "w-full text-left px-3 py-3 border-b border-slate-100 hover:bg-slate-50 transition group",
        isSelected && "bg-indigo-50 border-l-2 border-l-indigo-500"
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className={clsx("w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 mt-0.5", color)}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            <PriorityBadge priority={ticket.priority} />
            {ticket.channel && ticket.channel !== "MANUAL" && <ChannelBadge channel={ticket.channel} />}
            <span className={clsx(
              "text-[10px] font-mono font-medium px-1.5 py-0.5 rounded",
              PRIORITY_CONFIG[ticket.priority]?.bg ?? "bg-slate-100",
              PRIORITY_CONFIG[ticket.priority]?.text ?? "text-slate-600"
            )}>#{ticket.ticket_number}</span>
            <span className="text-[10px] text-slate-400 ml-auto">{safeDistanceToNow(ticket.updated_at)} ago</span>
          </div>
          <p className="text-xs font-semibold text-slate-800 leading-snug truncate">{ticket.subject}</p>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[10px] text-slate-500 truncate">{ticket.account_name}</span>
            {ticket.message_count > 0 && (
              <span className="flex items-center gap-1 text-[10px] text-slate-400 flex-shrink-0">
                <MessageSquare size={10} />{ticket.message_count}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Email sync status panel ──────────────────────────────────────────────────
function EmailStatusPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery<EmailSyncStatus>({
    queryKey: ["email-sync-status"],
    queryFn: () => supportApi.tickets.emailStatus(),
    staleTime: 10_000,
    refetchInterval: 20_000,
  });

  const rescanMut = useMutation({
    mutationFn: () => supportApi.tickets.rescanInbox(30),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-tickets-list"] });
      refetch();
    },
  });

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-start justify-between gap-2 py-1 border-b border-slate-100 last:border-0">
      <span className="text-[10px] text-slate-500 flex-shrink-0">{label}</span>
      <span className="text-[10px] font-medium text-slate-800 text-right break-all">{value}</span>
    </div>
  );

  return (
    <div className="border border-slate-200 rounded-lg bg-white shadow-lg mx-3 mt-2 mb-1 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-1.5">
          <Mail size={11} className="text-indigo-500" />
          <span className="text-xs font-semibold text-slate-700">Email Sync Status</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => refetch()} className="p-1 text-slate-400 hover:text-slate-600 rounded transition" title="Refresh status">
            <RefreshCw size={10} className={isLoading ? "animate-spin" : ""} />
          </button>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded transition">
            <X size={10} />
          </button>
        </div>
      </div>
      <div className="px-3 py-2">
        {isLoading && <p className="text-[11px] text-slate-400 text-center py-2">Loading…</p>}
        {error && <p className="text-[11px] text-rose-500 text-center py-2">Failed to load status</p>}
        {data && (
          <>
            <div className="flex items-center gap-1.5 mb-2">
              {data.connected
                ? <><Wifi size={11} className="text-emerald-500" /><span className="text-[11px] font-semibold text-emerald-600">Connected</span></>
                : <><WifiOff size={11} className="text-rose-500" /><span className="text-[11px] font-semibold text-rose-600">Disconnected</span></>
              }
              {!data.imapPasswordSet && (
                <span className="ml-auto text-[10px] bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded font-semibold">IMAP_PASSWORD not set</span>
              )}
            </div>
            {row("IMAP account", data.imapUser || "—")}
            {row("Polling every", `${data.pollIntervalMs / 1000}s`)}
            {row("Total polls run", data.pollCount)}
            {row("Last poll", data.lastPollAt ? safeDistanceToNow(data.lastPollAt) + " ago" : "never")}
            {row("Tickets created (session)", data.totalProcessed)}
            {row("Email tickets in DB", data.emailTicketsInDb)}
            {row("Processed email log", typeof data.processedEmailsTableRows === "number" ? data.processedEmailsTableRows + " rows" : <span className="text-rose-500">table missing!</span>)}
            {data.lastPollError && (
              <div className="mt-1.5 p-2 bg-rose-50 rounded text-[10px] text-rose-600 font-mono break-all">
                ⚠ Poll error: {data.lastPollError}
              </div>
            )}
            {data.recentMessageErrors?.length > 0 && (
              <div className="mt-1.5">
                <p className="text-[10px] font-semibold text-rose-600 mb-1">Recent message errors:</p>
                {data.recentMessageErrors.map((e, i) => (
                  <div key={i} className="p-1.5 bg-rose-50 rounded text-[9px] text-rose-700 font-mono break-all mb-1">{e}</div>
                ))}
              </div>
            )}
            {data.schemaCheck && !data.schemaCheck.ok && (
              <div className="mt-1.5 p-2 bg-amber-50 rounded border border-amber-200">
                <p className="text-[10px] font-bold text-amber-700 mb-1">⚠ Schema problems detected</p>
                {data.schemaCheck.missingTicketCols.length > 0 && (
                  <p className="text-[9px] text-amber-700">support_tickets missing: {data.schemaCheck.missingTicketCols.join(", ")}</p>
                )}
                {data.schemaCheck.missingMsgCols.length > 0 && (
                  <p className="text-[9px] text-amber-700">support_ticket_messages missing: {data.schemaCheck.missingMsgCols.join(", ")}</p>
                )}
                {data.schemaCheck.issueIsNotNull && (
                  <p className="text-[9px] text-amber-700">issue column is NOT NULL — run migration 0064</p>
                )}
              </div>
            )}
            {data.schemaCheck?.ok && (
              <p className="text-[10px] text-emerald-600 mt-1">✓ Schema OK — all required columns present</p>
            )}
            <button
              onClick={() => rescanMut.mutate()}
              disabled={rescanMut.isPending || !data.connected}
              className="mt-2 w-full text-[11px] py-1.5 bg-indigo-600 text-white rounded-md font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              {rescanMut.isPending ? "Rescanning…" : "Rescan Last 30 Days"}
            </button>
            {rescanMut.isSuccess && (
              <p className="text-[10px] text-emerald-600 text-center mt-1">✓ Done — {(rescanMut.data as any)?.scanned ?? 0} emails scanned</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Ticket list panel ────────────────────────────────────────────────────────
function TicketListPanel({ selectedId, onSelect }: { selectedId: number | null; onSelect: (id: number) => void }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [showFilterDrop, setShowFilterDrop] = useState(false);
  const [showEmailStatus, setShowEmailStatus] = useState(false);
  const filterLabel = FILTER_OPTIONS.find(f => f.value === filter)?.label ?? "Tickets";

  const { data, isLoading } = useQuery({
    queryKey: ["support-tickets-list", filter, search],
    queryFn: () => supportApi.tickets.list(filter, search),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  const tickets = data?.tickets ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="w-72 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
      <div className="px-3 py-3 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-slate-900">Tickets</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowEmailStatus(s => !s)}
              title="Email sync status & inbox rescan"
              className={clsx("p-1.5 rounded transition", showEmailStatus ? "text-indigo-600 bg-indigo-50" : "text-slate-400 hover:text-indigo-600")}
            >
              <Mail size={12} />
            </button>
            <button onClick={() => qc.invalidateQueries({ queryKey: ["support-tickets-list"] })} className="p-1.5 text-slate-400 hover:text-slate-600 rounded transition">
              <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowFilterDrop(d => !d)}
            className="w-full flex items-center justify-between px-2.5 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:border-indigo-300 transition bg-slate-50"
          >
            <span>{filterLabel}</span>
            <ChevronDown size={12} />
          </button>
          {showFilterDrop && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 overflow-hidden">
              {FILTER_OPTIONS.map(f => (
                <button key={f.value} onClick={() => { setFilter(f.value); setShowFilterDrop(false); }}
                  className={clsx("w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition", filter === f.value && "text-indigo-600 font-medium bg-indigo-50")}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {showEmailStatus && <EmailStatusPanel onClose={() => setShowEmailStatus(false)} />}

      <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
        <button className="flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-[11px] text-slate-600 hover:bg-slate-50 transition">
          <Filter size={11} />Filters
        </button>
        <button className="flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-[11px] text-slate-600 hover:bg-slate-50 transition ml-auto">
          <SlidersHorizontal size={11} />Sort: Updated
        </button>
      </div>

      {total > 0 && (
        <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100">
          <span className="text-[10px] text-slate-500">{total} ticket{total !== 1 ? "s" : ""}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <div className="flex items-center justify-center h-32"><div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <MessageSquare size={28} className="text-slate-200 mb-2" />
            <p className="text-xs text-slate-500 font-medium">No tickets found</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Try changing the filter</p>
          </div>
        ) : (
          <>
            {tickets.map(t => (
              <TicketRow key={t.id} ticket={t} isSelected={selectedId === t.id} onClick={() => onSelect(t.id)} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Email-style message ──────────────────────────────────────────────────────
function EmailMessage({ msg, senderEmail, defaultExpanded }: {
  msg: TicketMessage;
  senderEmail?: string;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? true);
  const isInternal = msg.is_internal;
  const isAgent    = msg.author_type === "agent" || msg.author_type === "system";
  const isInbound  = msg.direction === "inbound";

  if (isInternal) {
    return (
      <div className="mx-5 my-3 border border-amber-200 rounded-xl bg-amber-50/60 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-amber-200 bg-amber-50">
          <Lock size={11} className="text-amber-600 flex-shrink-0" />
          <span className="text-[11px] font-semibold text-amber-700">Internal Note</span>
          <span className="text-[11px] text-amber-600 ml-1">— {msg.author_name}</span>
          <span className="text-[10px] text-amber-500 ml-auto">{safeFormat(msg.created_at, "MMM d, yyyy h:mm a")}</span>
        </div>
        <div className="px-4 py-3 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{msg.content}</div>
      </div>
    );
  }

  const initials = msg.author_name.split(" ").slice(0, 2).map(w => w[0] ?? "").join("").toUpperCase() || "?";
  const avatarColor = isAgent ? "bg-indigo-600" : isInbound ? "bg-slate-400" : "bg-blue-500";

  return (
    <div className={clsx("border-b border-slate-100 last:border-b-0", !expanded && "hover:bg-slate-50/50 transition")}>
      {/* Collapsible header row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left group"
      >
        <div className={clsx("w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0", avatarColor)}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800">{msg.author_name}</span>
            {isAgent && !isInbound && (
              <span className="text-[11px] text-slate-400">via Support Team</span>
            )}
            {isInbound && senderEmail && (
              <span className="text-[11px] text-slate-400">&lt;{senderEmail}&gt;</span>
            )}
          </div>
          {!expanded && (
            <p className="text-xs text-slate-400 truncate mt-0.5 max-w-sm">
              {msg.content.slice(0, 100)}{msg.content.length > 100 ? "…" : ""}
            </p>
          )}
        </div>
        <span className="text-[10px] text-slate-400 flex-shrink-0 ml-2">
          {safeFormat(msg.created_at, "MMM d, yyyy h:mm a")}
        </span>
        <ChevronDown size={13} className={clsx("text-slate-300 flex-shrink-0 transition-transform", expanded && "rotate-180")} />
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-5 pb-5 ml-11">
          <div className="text-[11px] text-slate-400 mb-3 space-y-0.5">
            {isInbound ? (
              <div><span className="font-medium text-slate-500">To:</span> support@certxa.com</div>
            ) : (
              <div><span className="font-medium text-slate-500">To:</span> {senderEmail ?? "Client"}</div>
            )}
          </div>
          <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{msg.content}</div>
        </div>
      )}
    </div>
  );
}

// ─── Reply Composer — sends outbound email or saves internal note ──────────────
function ReplyComposer({ ticketId, ticket, onSent }: {
  ticketId: number;
  ticket: TicketDetail;
  onSent: () => void;
}) {
  const [content, setContent] = useState("");
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const qc = useQueryClient();

  const send = useMutation({
    mutationFn: () => supportApi.tickets.addMessage(
      ticketId, content,
      mode === "note",
      mode === "reply",
    ),
    onSuccess: (data: any) => {
      setContent("");
      setResult({
        ok: true,
        msg: mode === "reply"
          ? (data.emailSent ? `Reply sent to ${ticket.customer_email ?? "client"}` : "Reply saved (email unavailable — no SMTP)")
          : "Internal note saved",
      });
      qc.invalidateQueries({ queryKey: ["support-ticket-detail", ticketId] });
      qc.invalidateQueries({ queryKey: ["support-tickets-list"] });
      onSent();
      setTimeout(() => setResult(null), 5000);
    },
    onError: (err: Error) => {
      setResult({ ok: false, msg: err.message });
      setTimeout(() => setResult(null), 6000);
    },
  });

  const senderEmail = ticket.customer_email ?? ticket.owner_email;

  return (
    <div className="flex-shrink-0 border-t border-slate-200 bg-white">
      {/* Mode toggle */}
      <div className="flex items-center gap-1 px-5 pt-3">
        <button
          onClick={() => setMode("reply")}
          className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-md transition ${
            mode === "reply" ? "bg-indigo-100 text-indigo-700" : "text-slate-400 hover:text-slate-600"
          }`}
        >
          <Reply size={11} /> Reply
        </button>
        <button
          onClick={() => setMode("note")}
          className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-md transition ${
            mode === "note" ? "bg-amber-100 text-amber-700" : "text-slate-400 hover:text-slate-600"
          }`}
        >
          <StickyNote size={11} /> Internal Note
        </button>
        {mode === "reply" && senderEmail && (
          <span className="ml-auto text-[10px] text-slate-400">
            To: <span className="font-medium text-slate-600">{senderEmail}</span>
          </span>
        )}
        {mode === "note" && (
          <span className="ml-auto text-[10px] text-amber-600 font-medium">Not visible to client</span>
        )}
      </div>

      {/* Textarea */}
      <div className="px-5 pt-2 pb-3">
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder={mode === "reply"
            ? (senderEmail ? `Reply to ${senderEmail}…` : "Compose reply… (no client email on file)")
            : "Add internal note…"
          }
          rows={4}
          className={`w-full text-sm border rounded-xl p-3 resize-none focus:outline-none focus:ring-2 transition ${
            mode === "note"
              ? "border-amber-200 bg-amber-50/40 focus:ring-amber-300"
              : "border-slate-200 bg-white focus:ring-indigo-300"
          }`}
        />

        {/* Footer */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex-1 min-w-0">
            {result && (
              <p className={`text-[11px] font-medium truncate ${result.ok ? "text-emerald-600" : "text-rose-600"}`}>
                {result.ok ? "✓" : "✗"} {result.msg}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {mode === "reply" && !senderEmail && (
              <span className="text-[10px] text-amber-600">No client email — will save without sending</span>
            )}
            <button
              onClick={() => content.trim() && send.mutate()}
              disabled={!content.trim() || send.isPending}
              className={`flex items-center gap-1.5 px-4 py-1.5 disabled:opacity-50 text-white text-[11px] font-semibold rounded-lg transition ${
                mode === "note"
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {send.isPending
                ? "Sending…"
                : mode === "reply"
                  ? <><Send size={11} /> Send Reply</>
                  : "Save Note"
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Link-account modal ────────────────────────────────────────────────────────
function LinkAccountModal({ ticketId, onLinked, onClose }: {
  ticketId: number;
  onLinked: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<{ id: number; businessName: string; ownerEmail: string; planName: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState(false);
  const qc = useQueryClient();

  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const data = await supportApi.search(q.trim());
      setResults(data.map((r: any) => ({ id: r.id, businessName: r.businessName, ownerEmail: r.ownerEmail, planName: r.planName })));
    } catch { setResults([]); }
    setBusy(false);
  };

  const link = async (accountId: number) => {
    setLinking(true);
    try {
      await supportApi.tickets.linkAccount(ticketId, accountId);
      qc.invalidateQueries({ queryKey: ["support-ticket-detail", ticketId] });
      onLinked();
      onClose();
    } catch (e: any) {
      void appAlert(e.message, "Error");
    }
    setLinking(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800">Link to Account</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
        <div className="p-4">
          <div className="flex gap-2 mb-3">
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === "Enter" && search()}
              placeholder="Search by business name or email…"
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <button
              onClick={search}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition"
            >
              {busy ? "…" : <><Search size={12} /> Search</>}
            </button>
          </div>
          <div className="space-y-1 max-h-60 overflow-y-auto scrollbar-thin">
            {results.length === 0 && q && !busy && (
              <p className="text-xs text-slate-400 text-center py-4">No results — try a different term</p>
            )}
            {results.map(r => (
              <button
                key={r.id}
                onClick={() => link(r.id)}
                disabled={linking}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100 hover:bg-indigo-50 hover:border-indigo-200 transition text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                  {r.businessName[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">{r.businessName}</p>
                  <p className="text-[10px] text-slate-500 truncate">{r.ownerEmail} · {r.planName}</p>
                </div>
                <span className="text-[10px] text-indigo-600 font-medium flex-shrink-0">Link</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Inline note composer (replaces ReplyBox for internal notes only) ─────────
function InlineNoteComposer({ ticketId, onSaved }: { ticketId: number; onSaved: () => void }) {
  const [content, setContent] = useState("");
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: () => supportApi.tickets.addMessage(ticketId, content, true, false),
    onSuccess: () => {
      setContent("");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["support-ticket-detail", ticketId] });
      qc.invalidateQueries({ queryKey: ["support-tickets-list"] });
      onSaved();
    },
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 border border-amber-200 bg-amber-50 hover:bg-amber-100 rounded-lg text-[11px] text-amber-700 font-medium transition"
      >
        <StickyNote size={11} />Add Internal Note
      </button>
    );
  }

  return (
    <div className="mx-5 mb-4 border border-amber-200 rounded-xl bg-amber-50/60 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-amber-200 bg-amber-50">
        <Lock size={11} className="text-amber-600" />
        <span className="text-[11px] font-semibold text-amber-700">Internal Note</span>
        <span className="text-[10px] text-amber-500 ml-1">(not visible to client)</span>
        <button onClick={() => { setOpen(false); setContent(""); }} className="ml-auto text-amber-400 hover:text-amber-600">
          <X size={13} />
        </button>
      </div>
      <div className="p-3">
        <textarea
          autoFocus
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Add an internal note…"
          rows={3}
          className="w-full text-sm border border-amber-200 bg-white rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-amber-300"
        />
        <div className="flex justify-end mt-2 gap-2">
          <button onClick={() => { setOpen(false); setContent(""); }} className="px-3 py-1.5 text-[11px] text-slate-500 hover:text-slate-700 transition">
            Cancel
          </button>
          <button
            onClick={() => content.trim() && save.mutate()}
            disabled={!content.trim() || save.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-[11px] font-semibold rounded-lg transition"
          >
            {save.isPending ? "Saving…" : "Save Note"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Right sidebar ────────────────────────────────────────────────────────────
function DetailSidebar({ ticket, onUpdate }: { ticket: TicketDetail; onUpdate: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showLinkModal, setShowLinkModal] = useState(false);

  const update = useMutation({
    mutationFn: (data: any) => supportApi.tickets.update(ticket.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-ticket-detail", ticket.id] });
      qc.invalidateQueries({ queryKey: ["support-tickets-list"] });
      onUpdate();
    },
  });

  const rows = [
    { label: "Status",         value: <StatusBadge status={ticket.status} /> },
    { label: "Priority",       value: <PriorityBadge priority={ticket.priority} /> },
    { label: "Category",       value: <span className="text-xs text-slate-700">{ticket.category ?? "General"}</span> },
    { label: "Subcategory",    value: <span className="text-xs text-slate-700">{ticket.subcategory ?? "—"}</span> },
    { label: "Source",         value: <span className="text-xs text-slate-700 capitalize">{ticket.source ?? "email"}</span> },
    { label: "First Response", value: <span className="text-xs text-slate-700">{safeDistanceToNow(ticket.first_response_at, {}, "—")}</span> },
    { label: "Last Response",  value: <span className="text-xs text-slate-700">{safeDistanceToNow(ticket.last_response_at, {}, "—")}</span> },
  ];

  const linkedRows = [
    { label: "Account",      value: ticket.account_name_resolved },
    { label: "Subscription", value: ticket.plan_name ?? "—" },
  ];

  const STATUS_OPTIONS = ["open", "pending", "resolved", "closed"];

  return (
    <div className="w-60 flex-shrink-0 border-l border-slate-200 bg-white overflow-y-auto scrollbar-thin">
      <div className="p-3 border-b border-slate-100">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Assigned To</p>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
            {(ticket.assigned_agent_full_name ?? "—").split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-800 truncate">{ticket.assigned_agent_full_name ?? "Unassigned"}</p>
            <p className="text-[10px] text-slate-400">Support Agent</p>
          </div>
        </div>
      </div>

      <div className="p-3 border-b border-slate-100">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Ticket Details</p>
        <div className="space-y-1.5">
          {rows.map(r => (
            <div key={r.label} className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-500 flex-shrink-0 w-24">{r.label}</span>
              <span className="flex-shrink-0">{r.value}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-1.5 flex-wrap">
          {STATUS_OPTIONS.filter(s => s !== ticket.status).map(s => (
            <button key={s} onClick={() => update.mutate({ status: s })}
              className="text-[10px] px-2 py-1 border border-slate-200 rounded hover:bg-slate-50 text-slate-600 transition capitalize">
              Mark {s}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Client</p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowLinkModal(true)}
              className="text-[10px] text-slate-500 hover:text-indigo-600 font-medium flex items-center gap-0.5"
              title="Link this ticket to a different account"
            >
              <Link2 size={9} /> Link
            </button>
            <span className="text-slate-300">|</span>
            <button onClick={() => navigate(`/isTeam/accounts/${ticket.account_id}`)} className="text-[10px] text-indigo-600 hover:text-indigo-800 font-medium">View 360</button>
          </div>
        </div>
        {showLinkModal && (
          <LinkAccountModal
            ticketId={ticket.id}
            onLinked={onUpdate}
            onClose={() => setShowLinkModal(false)}
          />
        )}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
            {(ticket.account_name_resolved ?? "?")[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-800 truncate">{ticket.account_name_resolved}</p>
            <StatusBadge status={(ticket.account_status ?? "active").toLowerCase()} />
          </div>
        </div>
        <div className="space-y-1 text-[10px]">
          {ticket.business_phone && <div className="flex items-center gap-1.5 text-slate-600"><span>📞</span>{ticket.business_phone}</div>}
          {ticket.customer_email && <div className="flex items-center gap-1.5 text-slate-600"><Mail size={9} />{ticket.customer_email}</div>}
          {ticket.owner_email && ticket.owner_email !== ticket.customer_email && <div className="flex items-center gap-1.5 text-slate-600"><span>✉</span>{ticket.owner_email}</div>}
          {ticket.plan_name && <div className="flex items-center gap-1.5 text-slate-600"><span>💳</span>{ticket.plan_name} Plan</div>}
          <div className="flex items-center gap-1.5 text-slate-600"><span>🆔</span>Account ID: {ticket.account_id}</div>
        </div>
      </div>

      <div className="p-3 border-b border-slate-100">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Linked To</p>
        <div className="space-y-1.5">
          {linkedRows.map(r => (
            <div key={r.label} className="flex items-start justify-between gap-2">
              <span className="text-[10px] text-slate-500 flex-shrink-0">{r.label}</span>
              <span className="text-[10px] text-slate-700 font-medium text-right truncate">{r.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Quick Actions</p>
        <div className="space-y-1.5">
          {[
            { icon: <LogIn size={11} />, label: "Login as Client", action: undefined },
            { icon: <Zap size={11} />, label: "Send Magic Login Link", action: undefined },
            { icon: <Lock size={11} />, label: "Password Reset", action: undefined },
            { icon: <Activity size={11} />, label: "View Account Activity", action: () => navigate(`/isTeam/accounts/${ticket.account_id}`) },
          ].map(a => (
            <button key={a.label} onClick={a.action} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition text-left">
              <span className="text-indigo-500">{a.icon}</span>{a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Ticket detail — email-style thread view ──────────────────────────────────
function TicketDetailView({
  ticketId, tickets, onSelect, onClose,
}: {
  ticketId: number;
  tickets: TicketListItem[];
  onSelect: (id: number) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["support-ticket-detail", ticketId],
    queryFn: () => supportApi.tickets.get(ticketId),
    staleTime: 30_000,
  });

  const update = useMutation({
    mutationFn: (payload: any) => supportApi.tickets.update(ticketId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-ticket-detail", ticketId] });
      qc.invalidateQueries({ queryKey: ["support-tickets-list"] });
    },
  });

  const [junkConfirm, setJunkConfirm] = useState(false);

  const currentIndex = tickets.findIndex(t => t.id === ticketId);
  const nextTicket   = tickets[currentIndex + 1] ?? tickets[currentIndex - 1] ?? null;

  function goNext() {
    if (nextTicket) onSelect(nextTicket.id);
    else onClose();
  }

  function markJunk() {
    if (!junkConfirm) { setJunkConfirm(true); return; }
    update.mutate({ status: "closed", category: "junk" }, { onSuccess: goNext });
    setJunkConfirm(false);
  }

  function markResolved() {
    update.mutate({ status: "resolved" }, { onSuccess: goNext });
  }

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < tickets.length - 1;

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!data) return (
    <div className="flex-1 flex items-center justify-center text-sm text-slate-400">Ticket not found.</div>
  );

  const { ticket, messages } = data;
  const priorityCfg = PRIORITY_CONFIG[ticket.priority] ?? PRIORITY_CONFIG.normal;
  const ownerName   = [ticket.owner_first, ticket.owner_last].filter(Boolean).join(" ") || "—";
  const senderEmail = ticket.customer_email ?? ticket.owner_email;

  const publicMessages   = messages.filter(m => !m.is_internal);
  const internalMessages = messages.filter(m => m.is_internal);

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">

        {/* ── Email header ── */}
        <div className="bg-white border-b border-slate-200 px-5 py-4 flex-shrink-0">
          {/* Navigation + primary actions */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1">
              <button
                onClick={() => hasPrev && onSelect(tickets[currentIndex - 1].id)}
                disabled={!hasPrev}
                className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 disabled:opacity-30 transition"
                title="Previous ticket"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => hasNext && onSelect(tickets[currentIndex + 1].id)}
                disabled={!hasNext}
                className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 disabled:opacity-30 transition"
                title="Next ticket"
              >
                <ChevronRight size={14} />
              </button>
              <span className="text-[10px] text-slate-400 ml-1">
                {currentIndex + 1} of {tickets.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Internal note button */}
              <InlineNoteComposer
                ticketId={ticket.id}
                onSaved={() => qc.invalidateQueries({ queryKey: ["support-ticket-detail", ticketId] })}
              />

              {/* Resolve & next */}
              <button
                onClick={markResolved}
                disabled={update.isPending || ticket.status === "resolved"}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[11px] font-semibold rounded-lg transition"
              >
                <CheckCircle size={12} />
                Resolve & Next
              </button>

              {/* Mark as Junk */}
              {junkConfirm ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-rose-600 font-medium">Confirm junk?</span>
                  <button
                    onClick={markJunk}
                    disabled={update.isPending}
                    className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold rounded-lg transition"
                  >
                    Yes, Junk it
                  </button>
                  <button onClick={() => setJunkConfirm(false)} className="px-2 py-1.5 text-[11px] text-slate-500 hover:text-slate-700 transition">
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={markJunk}
                  disabled={update.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-slate-600 hover:text-rose-600 text-[11px] font-medium rounded-lg transition"
                >
                  <AlertTriangle size={12} />
                  Mark as Junk
                </button>
              )}

              <button className="p-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 transition">
                <MoreHorizontal size={14} />
              </button>
            </div>
          </div>

          {/* Subject line */}
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-xl font-bold text-slate-900 leading-tight">{ticket.subject ?? "(no subject)"}</h1>
            {ticket.channel && <ChannelBadge channel={ticket.channel} />}
            <span className={clsx("text-[10px] font-bold px-2 py-0.5 rounded ml-1", priorityCfg.bg, priorityCfg.text)}>
              {priorityCfg.label}
            </span>
          </div>

          {/* Metadata row */}
          <div className="flex items-center gap-3 flex-wrap text-[11px]">
            <span className="font-mono text-slate-400 font-medium">#{ticket.ticket_number}</span>
            <StatusBadge status={ticket.status} />
            {ticket.account_name_resolved && (
              <span className="flex items-center gap-1 text-slate-500">
                <User size={10} />
                <span className="font-medium text-slate-700">{ticket.account_name_resolved}</span>
              </span>
            )}
            {senderEmail && (
              <span className="flex items-center gap-1 text-slate-500">
                <Mail size={10} />{senderEmail}
              </span>
            )}
            {ticket.plan_name && (
              <span className="text-slate-400">Plan: <span className="text-slate-600 font-medium">{ticket.plan_name}</span></span>
            )}
            <span className="text-slate-400 ml-auto">
              <Clock size={10} className="inline mr-1" />
              {safeFormat(ticket.created_at, "MMM d, yyyy h:mm a")}
            </span>
          </div>
        </div>

        {/* ── Email thread body ── */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="max-w-3xl mx-auto py-4">

            {/* Original message (description) — shown as first email if no messages */}
            {ticket.description && publicMessages.length === 0 && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mx-5 mb-3 shadow-sm">
                <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100">
                  <div className="w-8 h-8 rounded-full bg-slate-400 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                    {ownerName.split(" ").slice(0, 2).map((n: string) => n[0]).join("").toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{ownerName}</span>
                      {senderEmail && <span className="text-[11px] text-slate-400">&lt;{senderEmail}&gt;</span>}
                    </div>
                    <div className="text-[11px] text-slate-400">To: support@certxa.com</div>
                  </div>
                  <span className="text-[10px] text-slate-400">{safeFormat(ticket.created_at, "MMM d, yyyy h:mm a")}</span>
                </div>
                <div className="px-5 py-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{ticket.description}</div>
              </div>
            )}

            {/* Email thread */}
            {publicMessages.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mx-5 mb-3 shadow-sm">
                {/* Show description as first collapsed message if present */}
                {ticket.description && (
                  <div className="border-b border-slate-100">
                    <button
                      onClick={() => {}}
                      className="w-full flex items-center gap-3 px-5 py-3.5 text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-slate-400 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                        {ownerName.split(" ").slice(0, 2).map((n: string) => n[0]).join("").toUpperCase() || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-800">{ownerName}</span>
                          {senderEmail && <span className="text-[11px] text-slate-400">&lt;{senderEmail}&gt;</span>}
                        </div>
                        <p className="text-xs text-slate-400 truncate mt-0.5 max-w-sm">
                          {ticket.description.slice(0, 100)}{ticket.description.length > 100 ? "…" : ""}
                        </p>
                      </div>
                      <span className="text-[10px] text-slate-400 ml-2">{safeFormat(ticket.created_at, "MMM d, yyyy h:mm a")}</span>
                    </button>
                  </div>
                )}

                {publicMessages.map((msg, i) => (
                  <EmailMessage
                    key={msg.id}
                    msg={msg}
                    senderEmail={senderEmail}
                    defaultExpanded={i === publicMessages.length - 1}
                  />
                ))}
              </div>
            )}

            {/* Internal notes — separate card below the thread */}
            {internalMessages.length > 0 && (
              <div className="space-y-1 mb-3">
                {internalMessages.map(msg => (
                  <EmailMessage key={msg.id} msg={msg} senderEmail={senderEmail} defaultExpanded />
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        <ReplyComposer
          ticketId={ticket.id}
          ticket={ticket}
          onSent={() => qc.invalidateQueries({ queryKey: ["support-ticket-detail", ticketId] })}
        />
      </div>

      <DetailSidebar ticket={ticket} onUpdate={() => qc.invalidateQueries({ queryKey: ["support-ticket-detail", ticketId] })} />
    </div>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────────
export default function TicketsPage() {
  const [searchParams] = useSearchParams();
  const initialTicketId = searchParams.get("ticketId") ? parseInt(searchParams.get("ticketId")!) : null;
  const [selectedId, setSelectedId] = useState<number | null>(initialTicketId);
  const [filter] = useState("open");
  const [search] = useState("");

  // Auto-open ticket from URL param (e.g. navigated from Customer360 Tickets tab)
  useEffect(() => {
    const id = searchParams.get("ticketId");
    if (id) setSelectedId(parseInt(id));
  }, [searchParams]);

  const { data } = useQuery({
    queryKey: ["support-tickets-list", filter, search],
    queryFn: () => supportApi.tickets.list(filter, search),
    staleTime: 30_000,
  });

  const tickets = data?.tickets ?? [];

  return (
    <div className="flex h-full overflow-hidden">
      <TicketListPanel selectedId={selectedId} onSelect={setSelectedId} />
      {selectedId ? (
        <TicketDetailView
          key={selectedId}
          ticketId={selectedId}
          tickets={tickets}
          onSelect={setSelectedId}
          onClose={() => setSelectedId(null)}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 text-center">
          <Mail size={48} className="text-slate-200 mb-4" />
          <p className="text-base font-semibold text-slate-600">Select a ticket</p>
          <p className="text-sm text-slate-400 mt-1">Choose a ticket from the list to read the thread</p>
        </div>
      )}
    </div>
  );
}
