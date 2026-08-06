/**
 * /isTeam/live-chat — Agent live-chat dashboard
 * Amazon-style: queue, active chats, internal notes, inline canned shortcuts,
 * agent availability, typing indicators, sound + browser notifications.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  MessageCircle, Send, X, User, Clock, ChevronRight,
  UserCheck, ArrowRightLeft, Zap, Star, Plus, Trash2,
  Loader2, CheckCircle2, Radio, Settings2,
  MessageSquare, Inbox, BarChart2, StickyNote,
  Globe, Bell, BellOff, Circle, Lock, Tag, Users, Ticket,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface QueuedChat {
  id: string; visitor_name: string; visitor_email: string | null;
  subject: string | null; started_at: string; department_name: string | null;
  page_url?: string | null;
}
interface ActiveChat extends QueuedChat {
  agent_id: number | null; agent_name: string | null; accepted_at: string | null;
}
interface ChatMessage {
  id: string; sender_type: "visitor" | "agent" | "system" | "note";
  sender_name: string | null; content: string; created_at: string;
}
interface Dept { id: number; name: string; description: string | null; is_active: boolean; routing_keywords: string | null }
interface AllAgent { id: number; name: string; role: string; online: boolean; status: string }
interface AgentDeptAssignment { agent_id: number; department_id: number; agent_name: string; department_name: string }
interface CannedResponse { id: number; shortcut: string; title: string; content: string }
interface Stats {
  queued: number; active: number; closed_today: number;
  missed_today: number; avg_wait_min: number | null; avg_rating_7d: number | null;
}

function wsUrl(path: string) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${path}`;
}
async function api<T = any>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(path, { credentials: "include", ...opts });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `${r.status}`); }
  return r.json();
}

// ─── Sound helper (Web Audio API — no file needed) ────────────────────────────
function playNotificationSound(type: "new_chat" | "new_message") {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    if (type === "new_chat") {
      // Two-tone ascending ding
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } else {
      // Single soft ping
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch {}
}

function requestBrowserNotification(title: string, body: string) {
  if (Notification.permission === "granted") {
    new Notification(title, { body, icon: "/favicon.ico" });
  } else if (Notification.permission === "default") {
    Notification.requestPermission();
  }
}

// ─── Availability badge ───────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  online: "bg-emerald-400",
  away:   "bg-amber-400",
  busy:   "bg-rose-400",
};
const STATUS_LABELS: Record<string, string> = {
  online: "Online",
  away:   "Away",
  busy:   "Busy",
};

// ─── Stats bar ────────────────────────────────────────────────────────────────
function StatsBar({ stats }: { stats: Stats | undefined }) {
  if (!stats) return null;
  return (
    <div className="flex items-center gap-6 px-5 py-2.5 bg-slate-800/50 border-b border-slate-700 text-xs">
      {[
        { label: "Queue",        val: stats.queued,        color: "text-amber-400"   },
        { label: "Active",       val: stats.active,        color: "text-emerald-400" },
        { label: "Closed today", val: stats.closed_today,  color: "text-slate-300"   },
        { label: "Missed today", val: stats.missed_today,  color: "text-rose-400"    },
        { label: "Avg wait",     val: stats.avg_wait_min != null ? `${stats.avg_wait_min}m` : "—", color: "text-slate-400" },
        { label: "Avg rating",   val: stats.avg_rating_7d != null ? `${stats.avg_rating_7d}★` : "—", color: "text-amber-400" },
      ].map(s => (
        <div key={s.label} className="flex items-center gap-1.5">
          <span className="text-slate-500">{s.label}:</span>
          <span className={`font-bold ${s.color}`}>{s.val}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Chat row ─────────────────────────────────────────────────────────────────
function ChatRow({ chat, isSelected, isUnread, isLocked, onClick }: {
  chat: QueuedChat | ActiveChat; isSelected: boolean; isUnread?: boolean; isLocked?: boolean; onClick: () => void;
}) {
  const elapsed = Math.floor((Date.now() - new Date(chat.started_at).getTime()) / 60000);
  return (
    <button onClick={onClick} className={`w-full text-left px-3 py-2.5 rounded-lg transition-all border ${
      isSelected
        ? "bg-indigo-600/20 border-indigo-500/40 text-white"
        : "border-transparent hover:bg-slate-700/50 text-slate-300"
    }`}>
      <div className="flex items-start gap-2">
        <div className="relative w-7 h-7 flex-shrink-0 mt-0.5">
          <div className="w-7 h-7 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 text-xs font-bold">
            {(chat.visitor_name?.[0] ?? "?").toUpperCase()}
          </div>
          {isLocked && (
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Lock className="w-2 h-2 text-amber-400" />
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-semibold truncate">{chat.visitor_name || "Anonymous"}</span>
            <div className="flex items-center gap-1 flex-shrink-0">
              {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />}
              <span className="text-[10px] text-slate-500">{elapsed}m</span>
            </div>
          </div>
          {chat.subject && <p className="text-[11px] text-slate-500 truncate mt-0.5">{chat.subject}</p>}
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {chat.department_name && (
              <span className="text-[10px] bg-slate-700 text-slate-400 rounded px-1 py-0.5 inline-block">
                {chat.department_name}
              </span>
            )}
            {isLocked && (chat as ActiveChat).agent_name && (
              <span className="text-[10px] text-amber-500/70 inline-block">
                → {(chat as ActiveChat).agent_name}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function Bubble({ msg }: { msg: ChatMessage }) {
  if (msg.sender_type === "system") {
    return (
      <div className="text-center py-1">
        <span className="text-[11px] text-slate-500 bg-slate-700/50 rounded-full px-3 py-1">{msg.content}</span>
      </div>
    );
  }
  if (msg.sender_type === "note") {
    return (
      <div className="flex justify-center py-1">
        <div className="max-w-[82%] bg-amber-900/30 border border-amber-700/40 rounded-xl px-3.5 py-2.5 text-sm">
          <div className="flex items-center gap-1.5 mb-1">
            <StickyNote className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] font-semibold text-amber-400">Internal note — {msg.sender_name}</span>
          </div>
          <p className="text-amber-100/80 text-xs leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
          <div className="text-[10px] mt-1 text-amber-700">
            {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>
    );
  }
  const isAgent = msg.sender_type === "agent";
  return (
    <div className={`flex ${isAgent ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[72%] rounded-2xl px-3.5 py-2.5 text-sm ${
        isAgent
          ? "bg-indigo-600 text-white rounded-br-sm"
          : "bg-slate-700 text-slate-100 rounded-bl-sm"
      }`}>
        {!isAgent && <div className="text-[10px] text-indigo-300 font-semibold mb-1">{msg.sender_name}</div>}
        <p className="leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
        <div className={`text-[10px] mt-1 ${isAgent ? "text-indigo-200" : "text-slate-500"}`}>
          {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

// ─── Transfer modal ───────────────────────────────────────────────────────────
function TransferModal({ chatId, depts, onDone, onClose }: {
  chatId: string; depts: Dept[];
  onDone: () => void; onClose: () => void;
}) {
  const [deptId, setDeptId] = useState("");
  const [busy,   setBusy]   = useState(false);
  const [err,    setErr]    = useState("");

  const submit = async () => {
    if (!deptId) return;
    setBusy(true); setErr("");
    try {
      await api(`/api/support/live-chat/${chatId}/transfer`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: Number(deptId) }),
      });
      onDone();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-80 shadow-2xl">
        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-indigo-400" /> Transfer Chat
        </h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 font-semibold mb-1 block">Transfer to department</label>
            <select value={deptId} onChange={e => setDeptId(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white">
              <option value="">Select…</option>
              {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          {err && <p className="text-rose-400 text-xs">{err}</p>}
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 border border-slate-600 text-slate-300 text-sm py-2 rounded-lg hover:bg-slate-700 transition">
              Cancel
            </button>
            <button onClick={submit} disabled={!deptId || busy}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg transition flex items-center justify-center gap-1.5">
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Transfer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Inline canned response picker (shows when "/" typed) ─────────────────────
function SlashPicker({ query, canned, onPick, onDismiss }: {
  query: string; canned: CannedResponse[];
  onPick: (text: string) => void; onDismiss: () => void;
}) {
  const filtered = canned.filter(c =>
    c.shortcut.startsWith(query) || c.title.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 6);

  if (!filtered.length) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl overflow-hidden z-10">
      <div className="px-3 py-1.5 border-b border-slate-700 flex items-center gap-1.5">
        <Zap className="w-3 h-3 text-indigo-400" />
        <span className="text-[10px] text-slate-400 font-semibold">Canned responses</span>
        <span className="ml-auto text-[10px] text-slate-600">ESC to dismiss</span>
      </div>
      {filtered.map((c, i) => (
        <button key={c.id} onMouseDown={() => onPick(c.content)}
          className="w-full text-left px-3 py-2 hover:bg-slate-700 transition flex items-start gap-2.5 group">
          <code className="text-[10px] bg-indigo-600/30 text-indigo-300 px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0">/{c.shortcut}</code>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-200">{c.title}</p>
            <p className="text-[10px] text-slate-500 truncate group-hover:text-slate-400">{c.content}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function LiveChatPage() {
  const qc = useQueryClient();
  const wsRef    = useRef<WebSocket | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef= useRef<HTMLDivElement>(null);
  const typingDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [text,           setText]           = useState("");
  const [wsReady,        setWsReady]        = useState(false);
  const [unread,         setUnread]         = useState<Set<string>>(new Set());
  const [visitorTyping,  setVisitorTyping]  = useState<Record<string, boolean>>({});
  const [localMsgs,      setLocalMsgs]      = useState<Record<string, ChatMessage[]>>({});
  const [showTransfer,   setShowTransfer]   = useState(false);
  const [rightTab,       setRightTab]       = useState<"info"|"canned"|"settings">("info");
  const [sideTab,        setSideTab]        = useState<"queue"|"active"|"history">("queue");
  const [noteMode,       setNoteMode]       = useState(false);
  const [myStatus,       setMyStatus]       = useState<"online"|"away"|"busy">("online");
  const [soundEnabled,   setSoundEnabled]   = useState(true);
  const [slashQuery,     setSlashQuery]     = useState<string | null>(null);
  const [slashWarning,   setSlashWarning]   = useState(false);
  const slashWarnTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [myAgentId,      setMyAgentId]      = useState<number | null>(null);
  const [myAgentRole,    setMyAgentRole]    = useState<string>("agent");
  const [ticketToast,    setTicketToast]    = useState<{ ticketNumber: string; subject: string; senderName: string } | null>(null);
  const ticketToastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const navigate = useNavigate();

  // ── Queries ────────────────────────────────────────────────────────────────
  // Account info for the selected chat (only fetched when a chat is selected)
  const { data: queueData,  refetch: refetchQueue }  = useQuery({
    queryKey: ["lc-queue"],  queryFn: () => api("/api/support/live-chat/queue"),  refetchInterval: 15000,
  });
  const { data: activeData, refetch: refetchActive } = useQuery({
    queryKey: ["lc-active"], queryFn: () => api("/api/support/live-chat/active"), refetchInterval: 15000,
  });
  const { data: historyData } = useQuery({
    queryKey: ["lc-history"], queryFn: () => api("/api/support/live-chat/history"),
    enabled: sideTab === "history",
  });
  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ["lc-stats"], queryFn: () => api("/api/support/live-chat/stats"), refetchInterval: 30000,
  });
  const { data: deptData }   = useQuery({ queryKey: ["lc-depts"],  queryFn: () => api("/api/support/live-chat/departments") });
  const { data: cannedData } = useQuery({ queryKey: ["lc-canned"], queryFn: () => api("/api/support/live-chat/canned") });
  const { data: allAgentsData } = useQuery({ queryKey: ["lc-all-agents"], queryFn: () => api("/api/support/live-chat/all-agents") });
  const { data: agentDeptsData, refetch: refetchAgentDepts } = useQuery({ queryKey: ["lc-agent-depts"], queryFn: () => api("/api/support/live-chat/agent-departments") });
  const { data: msgData, refetch: refetchMsgs } = useQuery({
    queryKey: ["lc-msgs", selectedChatId],
    queryFn:  () => selectedChatId ? api(`/api/support/live-chat/${selectedChatId}/messages`) : null,
    enabled:  !!selectedChatId,
  });
  const { data: accountData } = useQuery({
    queryKey: ["lc-account", selectedChatId],
    queryFn:  () => selectedChatId ? api(`/api/support/live-chat/${selectedChatId}/account`) : null,
    enabled:  !!selectedChatId,
    staleTime: 60_000,
  });

  const queue      = (queueData?.queue   ?? []) as QueuedChat[];
  const active     = (activeData?.active ?? []) as ActiveChat[];
  const history    = (historyData?.history ?? []) as ActiveChat[];
  const depts      = (deptData?.departments ?? []) as Dept[];
  const canned     = (cannedData?.canned ?? []) as CannedResponse[];
  const stats      = statsData as Stats | undefined;
  const allAgents  = ((allAgentsData as any)?.agents ?? []) as AllAgent[];
  const agentDepts = ((agentDeptsData as any)?.assignments ?? []) as AgentDeptAssignment[];
  const chatAccount = (accountData as any)?.account as null | {
    id: number; storeName: string; city: string | null; state: string | null;
    email: string | null; phone: string | null; accountStatus: string | null;
    planName: string | null; ownerEmail: string | null; ownerName: string | null;
  };

  // Merge server + local messages (optimistic updates)
  const serverMsgs = (msgData?.messages ?? []) as ChatMessage[];
  const allMsgs = selectedChatId
    ? [
        ...serverMsgs,
        ...(localMsgs[selectedChatId] ?? []).filter(m =>
          !serverMsgs.some(s => s.content === m.content && Math.abs(new Date(s.created_at).getTime() - new Date(m.created_at).getTime()) < 5000)
        ),
      ]
    : [];

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [allMsgs, visitorTyping]);

  // ── WebSocket ──────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    try {
      const { token } = await api("/api/support/live-chat/ws-token");
      const ws = new WebSocket(wsUrl(`/ws/live-chat?role=agent&token=${token}`));
      wsRef.current = ws;

      ws.onopen  = () => setWsReady(true);
      ws.onclose = () => {
        setWsReady(false);
        // After reconnect, reload messages for whichever chat was open so the
        // agent doesn't miss anything that arrived while the socket was down.
        setTimeout(() => {
          connect();
          refetchMsgs();
        }, 5000);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          switch (msg.type) {
            case "authenticated":
              setMyAgentId(msg.agentId);
              setMyAgentRole(msg.role ?? "agent");
              break;
            case "queue_update":
              refetchQueue(); refetchStats(); break;
            case "new_chat":
              refetchQueue(); refetchStats();
              if (soundEnabled) playNotificationSound("new_chat");
              requestBrowserNotification("New chat in queue", msg.visitorName ?? "A visitor needs help");
              break;
            case "chat_assigned":
              refetchQueue(); refetchActive(); refetchStats(); break;
            case "chat_closed":
            case "chat_transferred":
            case "chat_requeued":
              refetchQueue(); refetchActive(); refetchStats();
              if (msg.chatId === selectedChatId) setSelectedChatId(null);
              break;
            case "visitor_message":
            case "visitor_message_broadcast": {
              const cid = msg.chatId;
              const newMsg: ChatMessage = {
                id: crypto.randomUUID(), sender_type: "visitor",
                sender_name: msg.visitorName ?? "Visitor",
                content: msg.content, created_at: msg.timestamp ?? new Date().toISOString(),
              };
              setLocalMsgs(prev => ({ ...prev, [cid]: [...(prev[cid] ?? []), newMsg] }));
              if (cid !== selectedChatId) {
                setUnread(prev => { const s = new Set(prev); s.add(cid); return s; });
                if (soundEnabled) playNotificationSound("new_message");
              }
              break;
            }
            case "agent_message_broadcast": {
              // Another agent sent a message to a chat we're watching
              const cid = msg.chatId;
              if (cid === selectedChatId) refetchMsgs();
              break;
            }
            case "note_broadcast": {
              const cid = msg.chatId;
              if (cid === selectedChatId) {
                const noteMsg: ChatMessage = {
                  id: crypto.randomUUID(), sender_type: "note",
                  sender_name: msg.agentName,
                  content: msg.content, created_at: msg.timestamp ?? new Date().toISOString(),
                };
                setLocalMsgs(prev => ({ ...prev, [cid]: [...(prev[cid] ?? []), noteMsg] }));
              }
              break;
            }
            case "visitor_typing":
              setVisitorTyping(prev => ({ ...prev, [msg.chatId]: true }));
              clearTimeout(typingTimers.current[msg.chatId]);
              typingTimers.current[msg.chatId] = setTimeout(() =>
                setVisitorTyping(prev => ({ ...prev, [msg.chatId]: false })), 4000);
              break;
            case "visitor_typing_stop":
              setVisitorTyping(prev => ({ ...prev, [msg.chatId]: false }));
              break;
            case "assign_ok":
              refetchQueue(); refetchActive();
              setSelectedChatId(msg.chatId);
              break;
            case "message_sent": {
              // Clear the optimistic copy for this chat before the server data arrives,
              // so there's never a window where both coexist (prevents double-render).
              const sentChatId = msg.chatId as string | undefined;
              if (sentChatId) {
                setLocalMsgs(prev => { const next = { ...prev }; delete next[sentChatId]; return next; });
              }
              refetchMsgs();
              break;
            }
            case "note_saved":
              setTimeout(() => refetchMsgs(), 200); break;
            case "new_ticket":
              // Invalidate ticket list so sidebar badge + TicketsPage both update immediately
              qc.invalidateQueries({ queryKey: ["support-tickets-list"] });
              qc.invalidateQueries({ queryKey: ["support-open-ticket-count"] });
              // Show in-app toast notification
              clearTimeout(ticketToastTimer.current);
              setTicketToast({ ticketNumber: msg.ticketNumber, subject: msg.subject, senderName: msg.senderName });
              ticketToastTimer.current = setTimeout(() => setTicketToast(null), 8000);
              // Browser notification if agent has granted permission
              if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                new Notification(`New ticket #${msg.ticketNumber}`, { body: `${msg.senderName}: ${msg.subject}`, icon: "/favicon.ico" });
              }
              if (soundEnabled) playNotificationSound("new_chat");
              break;
          }
        } catch {}
      };
    } catch { setTimeout(connect, 5000); }
  }, [selectedChatId, refetchQueue, refetchActive, refetchStats, refetchMsgs, soundEnabled]);

  useEffect(() => { connect(); return () => wsRef.current?.close(); }, []);

  // ── Typing detection ───────────────────────────────────────────────────────
  const handleInputChange = (val: string) => {
    setText(val);

    // Slash picker
    const lastSlash = val.lastIndexOf("/");
    if (lastSlash !== -1 && lastSlash === val.length - 1 - (val.length - 1 - lastSlash)) {
      // check if "/" is the last trigger
    }
    if (val.startsWith("/") || val.includes("\n/") || (val.length > 0 && val[val.length - 1] === "/" && val.trim() === "/")) {
      // simple: if input starts with "/"
    }
    // Show slash picker when text starts with "/"
    if (val === "/" || (val.startsWith("/") && !val.includes(" "))) {
      setSlashQuery(val.slice(1));
    } else {
      setSlashQuery(null);
    }

    // Send typing event to visitor
    if (!selectedChatId || noteMode) return;
    if (val.trim()) {
      wsRef.current?.send(JSON.stringify({ type: "typing", chatId: selectedChatId }));
      if (typingDebounce.current) clearTimeout(typingDebounce.current);
      typingDebounce.current = setTimeout(() => {
        wsRef.current?.send(JSON.stringify({ type: "typing_stop", chatId: selectedChatId }));
      }, 2500);
    } else {
      wsRef.current?.send(JSON.stringify({ type: "typing_stop", chatId: selectedChatId }));
    }
  };

  // ── Actions ────────────────────────────────────────────────────────────────
  const assignChat = (chatId: string) => {
    wsRef.current?.send(JSON.stringify({ type: "assign", chatId }));
    // Auto-send greet canned response after assignment
    setTimeout(() => {
      const greet = canned.find(c =>
        c.shortcut === "greet" ||
        c.title?.toLowerCase() === "greet" ||
        c.title?.toLowerCase().includes("greet")
      );
      if (greet?.content && wsRef.current?.readyState === WebSocket.OPEN) {
        const text = greet.content;
        wsRef.current.send(JSON.stringify({ type: "message", chatId, content: text }));
        const optimistic: ChatMessage = {
          id: crypto.randomUUID(), sender_type: "agent", sender_name: "You",
          content: text, created_at: new Date().toISOString(),
        };
        setLocalMsgs(prev => ({ ...prev, [chatId]: [...(prev[chatId] ?? []), optimistic] }));
      }
    }, 800);
  };

  const sendMessage = () => {
    const t = text.trim();
    if (!t || !selectedChatId || !wsReady) return;

    // Block sending raw slash-commands to the client — they must be expanded first
    if (!noteMode && t.startsWith("/")) {
      clearTimeout(slashWarnTimer.current);
      setSlashWarning(true);
      slashWarnTimer.current = setTimeout(() => setSlashWarning(false), 3000);
      return;
    }

    if (noteMode) {
      // Internal note
      const optimistic: ChatMessage = {
        id: crypto.randomUUID(), sender_type: "note", sender_name: "You",
        content: t, created_at: new Date().toISOString(),
      };
      setLocalMsgs(prev => ({ ...prev, [selectedChatId]: [...(prev[selectedChatId] ?? []), optimistic] }));
      wsRef.current?.send(JSON.stringify({ type: "note", chatId: selectedChatId, content: t }));
    } else {
      // Regular message
      const optimistic: ChatMessage = {
        id: crypto.randomUUID(), sender_type: "agent", sender_name: "You",
        content: t, created_at: new Date().toISOString(),
      };
      setLocalMsgs(prev => ({ ...prev, [selectedChatId]: [...(prev[selectedChatId] ?? []), optimistic] }));
      wsRef.current?.send(JSON.stringify({ type: "message", chatId: selectedChatId, content: t }));
      // Stop typing indicator
      wsRef.current?.send(JSON.stringify({ type: "typing_stop", chatId: selectedChatId }));
    }
    setText("");
    setSlashQuery(null);
    inputRef.current?.focus();
  };

  const closeChat = async () => {
    if (!selectedChatId) return;
    wsRef.current?.send(JSON.stringify({ type: "close", chatId: selectedChatId }));
    setSelectedChatId(null);
  };

  const selectChat = (chatId: string) => {
    setSelectedChatId(chatId);
    setUnread(prev => { const s = new Set(prev); s.delete(chatId); return s; });
    setLocalMsgs(prev => { const next = { ...prev }; delete next[chatId]; return next; });
    setNoteMode(false);
    setSlashQuery(null);
  };

  const changeStatus = (status: "online" | "away" | "busy") => {
    setMyStatus(status);
    wsRef.current?.send(JSON.stringify({ type: "status_change", status }));
  };

  const currentChat = [...queue, ...active].find(c => c.id === selectedChatId)
    ?? history.find(c => c.id === selectedChatId);
  const isCurrentActive = active.some(c => c.id === selectedChatId);
  const isCurrentQueued = queue.some(c => c.id === selectedChatId);
  const isCurrentOwner  = isCurrentActive && (
    (currentChat as ActiveChat)?.agent_id === myAgentId || myAgentRole === "admin"
  );

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200 overflow-hidden">
      {/* New-ticket toast — appears top-right, auto-dismisses after 8s */}
      {ticketToast && (
        <div className="absolute top-4 right-4 z-50 w-80 bg-white border border-slate-200 rounded-xl shadow-2xl shadow-slate-900/30 overflow-hidden animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600">
            <Ticket className="w-3.5 h-3.5 text-white flex-shrink-0" />
            <span className="text-white text-xs font-bold flex-1">New ticket #{ticketToast.ticketNumber}</span>
            <button onClick={() => setTicketToast(null)} className="text-indigo-200 hover:text-white transition">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="px-4 py-3">
            <p className="text-sm font-semibold text-slate-800 leading-snug truncate">{ticketToast.subject}</p>
            <p className="text-xs text-slate-500 mt-0.5">From: {ticketToast.senderName}</p>
            <button
              onClick={() => { setTicketToast(null); navigate("/isTeam/tickets"); }}
              className="mt-2.5 w-full text-center text-xs text-indigo-600 font-semibold hover:text-indigo-800 transition"
            >
              View ticket →
            </button>
          </div>
        </div>
      )}

      {/* Stats bar */}
      <StatsBar stats={stats} />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: Sidebar ──────────────────────────────────────────────── */}
        <div className="w-64 flex-shrink-0 border-r border-slate-700 flex flex-col">
          {/* Agent status + sound */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700">
            <div className="relative flex-shrink-0">
              <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">A</div>
              <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${STATUS_COLORS[myStatus]}`} />
            </div>
            <div className="flex-1 min-w-0">
              <select value={myStatus} onChange={e => changeStatus(e.target.value as any)}
                className="w-full bg-transparent text-xs text-slate-300 font-semibold focus:outline-none cursor-pointer">
                <option value="online">Online</option>
                <option value="away">Away</option>
                <option value="busy">Busy</option>
              </select>
            </div>
            <button onClick={() => setSoundEnabled(v => !v)}
              className="text-slate-500 hover:text-slate-300 transition p-1 rounded"
              title={soundEnabled ? "Mute sounds" : "Enable sounds"}>
              {soundEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-700">
            {([
              { id: "queue",   label: "Queue",   badge: queue.length },
              { id: "active",  label: "Active",  badge: active.length },
              { id: "history", label: "History", badge: 0 },
            ] as const).map(t => (
              <button key={t.id} onClick={() => setSideTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-semibold transition border-b-2 ${
                  sideTab === t.id
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}>
                {t.label}
                {t.badge > 0 && (
                  <span className={`rounded-full text-[10px] font-bold px-1.5 py-0.5 min-w-[18px] text-center ${
                    t.id === "queue" ? "bg-amber-500 text-white" : "bg-indigo-600/60 text-indigo-200"
                  }`}>{t.badge > 99 ? "99+" : t.badge}</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sideTab === "queue" && (
              queue.length === 0
                ? <p className="text-slate-600 text-xs text-center py-8 flex flex-col items-center gap-2">
                    <Inbox className="w-8 h-8 opacity-40" /> Queue is empty
                  </p>
                : queue.map(c => (
                    <ChatRow key={c.id} chat={c} isSelected={selectedChatId === c.id}
                      isUnread={unread.has(c.id)} onClick={() => selectChat(c.id)} />
                  ))
            )}
            {sideTab === "active" && (
              active.length === 0
                ? <p className="text-slate-600 text-xs text-center py-8 flex flex-col items-center gap-2">
                    <MessageSquare className="w-8 h-8 opacity-40" /> No active chats
                  </p>
                : active.map(c => (
                    <ChatRow key={c.id} chat={c} isSelected={selectedChatId === c.id}
                      isUnread={unread.has(c.id)}
                      isLocked={(c as ActiveChat).agent_id !== myAgentId && myAgentRole !== "admin"}
                      onClick={() => selectChat(c.id)} />
                  ))
            )}
            {sideTab === "history" && (
              history.length === 0
                ? <p className="text-slate-600 text-xs text-center py-8">No recent history</p>
                : history.map(c => (
                    <div key={c.id} className="px-3 py-2 rounded-lg hover:bg-slate-700/50 cursor-pointer"
                      onClick={() => setSelectedChatId(c.id)}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium truncate">{c.visitor_name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          (c as any).status === "missed" ? "bg-rose-500/20 text-rose-400" : "bg-slate-700 text-slate-400"
                        }`}>{(c as any).status}</span>
                      </div>
                      {c.subject && <p className="text-[11px] text-slate-500 truncate">{c.subject}</p>}
                      {(c as any).rating && (
                        <div className="flex items-center gap-0.5 mt-0.5">
                          {Array.from({ length: (c as any).rating }).map((_: any, i: number) => (
                            <Star key={i} className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                          ))}
                        </div>
                      )}
                    </div>
                  ))
            )}
          </div>
        </div>

        {/* ── Center: Chat window ────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedChatId ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
              <div className="w-20 h-20 rounded-3xl bg-indigo-600/10 flex items-center justify-center">
                <MessageCircle className="w-10 h-10 text-indigo-400 opacity-60" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-300">Live Chat Dashboard</h3>
                <p className="text-sm text-slate-500 mt-1">
                  {queue.length > 0
                    ? `${queue.length} visitor${queue.length === 1 ? "" : "s"} waiting — pick one from the queue`
                    : "Queue is empty. Waiting for new conversations."}
                </p>
              </div>
              {queue.length > 0 && (
                <div className="flex flex-col gap-2 w-48">
                  {queue.slice(0, 3).map(c => (
                    <button key={c.id} onClick={() => assignChat(c.id)}
                      className="flex items-center gap-2 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 rounded-xl px-4 py-2.5 text-sm text-indigo-300 transition font-medium">
                      <UserCheck className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{c.visitor_name || "Anonymous"}</span>
                      <ChevronRight className="w-3.5 h-3.5 ml-auto flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700 bg-slate-800/60 flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 text-xs font-bold flex-shrink-0">
                  {(currentChat?.visitor_name?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white truncate">
                      {currentChat?.visitor_name || "Anonymous"}
                    </span>
                    {isCurrentQueued && (
                      <span className="text-[10px] bg-amber-500/20 text-amber-400 rounded-full px-2 py-0.5 font-semibold">Queued</span>
                    )}
                    {isCurrentActive && (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 rounded-full px-2 py-0.5 font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Active
                      </span>
                    )}
                  </div>
                  {currentChat?.subject && (
                    <p className="text-xs text-slate-500 truncate">{currentChat.subject}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {isCurrentQueued && (
                    <button onClick={() => assignChat(selectedChatId)}
                      className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition">
                      <UserCheck className="w-3.5 h-3.5" /> Take chat
                    </button>
                  )}
                  {isCurrentActive && (
                    <>
                      <button onClick={() => setShowTransfer(true)}
                        className="flex items-center gap-1.5 border border-slate-600 text-slate-300 hover:bg-slate-700 text-xs px-2.5 py-1.5 rounded-lg transition">
                        <ArrowRightLeft className="w-3.5 h-3.5" /> Transfer
                      </button>
                      <button onClick={closeChat}
                        className="flex items-center gap-1.5 border border-rose-700 text-rose-400 hover:bg-rose-900/30 text-xs px-2.5 py-1.5 rounded-lg transition">
                        <X className="w-3.5 h-3.5" /> End
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                {allMsgs.length === 0 && (
                  <p className="text-center text-slate-600 text-sm py-8">No messages yet</p>
                )}
                {allMsgs.map((m, i) => <Bubble key={m.id ?? i} msg={m} />)}
                {visitorTyping[selectedChatId] && (
                  <div className="flex justify-start">
                    <div className="bg-slate-700 rounded-2xl rounded-bl-sm px-4 py-3">
                      <div className="flex gap-1.5">
                        {[0,1,2].map(i => (
                          <span key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
                            style={{ animationDelay: `${i * 150}ms` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input area */}
              {isCurrentActive && (
                <div className="border-t border-slate-700 bg-slate-800/40 flex-shrink-0">
                  {/* Note/Message toggle */}
                  <div className="flex items-center gap-1 px-3 pt-2">
                    <button onClick={() => setNoteMode(false)}
                      className={`flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-md transition ${
                        !noteMode ? "bg-indigo-600/30 text-indigo-300" : "text-slate-500 hover:text-slate-300"
                      }`}>
                      <MessageCircle className="w-3 h-3" /> Reply
                    </button>
                    <button onClick={() => setNoteMode(true)}
                      className={`flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-md transition ${
                        noteMode ? "bg-amber-600/30 text-amber-300" : "text-slate-500 hover:text-slate-300"
                      }`}>
                      <StickyNote className="w-3 h-3" /> Note
                    </button>
                    {!noteMode && (
                      <span className="ml-auto text-[10px] text-slate-600">Type <kbd className="bg-slate-700 px-1 rounded text-slate-400">/</kbd> for canned responses</span>
                    )}
                  </div>

                  {/* Slash-command warning */}
                  {slashWarning && (
                    <div className="mx-3 mb-1 flex items-center gap-2 text-[11px] text-amber-300 bg-amber-900/30 border border-amber-700/40 rounded-lg px-3 py-1.5">
                      <span>⚠️</span>
                      <span>Select a canned response from the picker — slash commands are not sent directly to the client.</span>
                    </div>
                  )}

                  {/* Textarea + send */}
                  <div className="relative p-3 flex gap-2 items-end">
                    {slashQuery !== null && !noteMode && (
                      <SlashPicker
                        query={slashQuery}
                        canned={canned}
                        onPick={t => { setText(t); setSlashQuery(null); inputRef.current?.focus(); }}
                        onDismiss={() => setSlashQuery(null)}
                      />
                    )}
                    <textarea ref={inputRef} value={text}
                      onChange={e => handleInputChange(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Escape") { setSlashQuery(null); return; }
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
                      }}
                      rows={1} placeholder={noteMode ? "Add internal note… (not visible to visitor)" : "Type a message… (Enter to send, Shift+Enter for newline)"}
                      className={`flex-1 border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 max-h-28 ${
                        noteMode
                          ? "bg-amber-900/20 border-amber-700/50 text-amber-100 placeholder-amber-800/80 focus:ring-amber-600"
                          : "bg-slate-700/70 border-slate-600 text-white placeholder-slate-500 focus:ring-indigo-500"
                      }`}
                      style={{ minHeight: "42px" }} />
                    <button onClick={sendMessage} disabled={!text.trim() || !wsReady}
                      className={`w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl disabled:opacity-40 text-white transition ${
                        noteMode ? "bg-amber-600 hover:bg-amber-700" : "bg-indigo-600 hover:bg-indigo-700"
                      }`}>
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Right panel ────────────────────────────────────────────────── */}
        <div className="w-60 flex-shrink-0 border-l border-slate-700 flex flex-col">
          <div className="flex border-b border-slate-700">
            {([
              { id: "info",     icon: <User className="w-3.5 h-3.5" />,      label: "Info"   },
              { id: "canned",   icon: <Zap className="w-3.5 h-3.5" />,       label: "Canned" },
              { id: "settings", icon: <Settings2 className="w-3.5 h-3.5" />, label: "Depts"  },
            ] as const).map(t => (
              <button key={t.id} onClick={() => setRightTab(t.id)}
                className={`flex-1 flex flex-col items-center py-2 transition text-[10px] font-semibold border-b-2 gap-0.5 ${
                  rightTab === t.id
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-slate-600 hover:text-slate-400"
                }`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {/* Info tab */}
          {rightTab === "info" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {currentChat ? (
                <>
                  <div>
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Visitor</h4>
                    <div className="space-y-2 text-xs">
                      <div><span className="text-slate-500">Name:</span> <span className="text-slate-200 ml-1">{currentChat.visitor_name || "—"}</span></div>
                      <div><span className="text-slate-500">Email:</span> <span className="text-slate-200 ml-1 break-all">{currentChat.visitor_email || "—"}</span></div>
                      <div><span className="text-slate-500">Dept:</span> <span className="text-slate-200 ml-1">{currentChat.department_name || "General"}</span></div>
                      {isCurrentActive && (
                        <div>
                          <span className="text-slate-500">Agent:</span>
                          <span className="text-slate-200 ml-1">
                            {(currentChat as ActiveChat).agent_name || "—"}
                            {(currentChat as ActiveChat).agent_id === myAgentId && (
                              <span className="ml-1 text-[9px] bg-emerald-700/40 text-emerald-300 rounded px-1 py-0.5">you</span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  {currentChat.subject && (
                    <div>
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Issue</h4>
                      <p className="text-xs text-slate-300 leading-relaxed">{currentChat.subject}</p>
                    </div>
                  )}

                  {/* Account info — shown when chat has an attached account */}
                  {chatAccount && (
                    <div>
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <BarChart2 className="w-3 h-3" /> Account
                      </h4>
                      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-2.5 space-y-1.5">
                        <div className="flex items-start gap-1.5">
                          <span className="text-[10px] text-slate-500 font-semibold w-12 flex-shrink-0 pt-0.5">Store</span>
                          <span className="text-[11px] text-slate-200 font-semibold leading-tight">{chatAccount.storeName}</span>
                        </div>
                        {(chatAccount.city || chatAccount.state) && (
                          <div className="flex items-start gap-1.5">
                            <span className="text-[10px] text-slate-500 font-semibold w-12 flex-shrink-0 pt-0.5">Location</span>
                            <span className="text-[11px] text-slate-300">{[chatAccount.city, chatAccount.state].filter(Boolean).join(", ")}</span>
                          </div>
                        )}
                        {chatAccount.planName && (
                          <div className="flex items-start gap-1.5">
                            <span className="text-[10px] text-slate-500 font-semibold w-12 flex-shrink-0 pt-0.5">Plan</span>
                            <span className="text-[11px] text-indigo-300 font-semibold">{chatAccount.planName}</span>
                          </div>
                        )}
                        {chatAccount.accountStatus && (
                          <div className="flex items-start gap-1.5">
                            <span className="text-[10px] text-slate-500 font-semibold w-12 flex-shrink-0 pt-0.5">Status</span>
                            <span className={`text-[11px] font-semibold capitalize ${
                              chatAccount.accountStatus === "active" ? "text-emerald-400" :
                              chatAccount.accountStatus === "suspended" ? "text-rose-400" : "text-slate-400"
                            }`}>{chatAccount.accountStatus}</span>
                          </div>
                        )}
                        {chatAccount.ownerName && (
                          <div className="flex items-start gap-1.5">
                            <span className="text-[10px] text-slate-500 font-semibold w-12 flex-shrink-0 pt-0.5">Owner</span>
                            <span className="text-[11px] text-slate-300">{chatAccount.ownerName}</span>
                          </div>
                        )}
                        {chatAccount.ownerEmail && (
                          <div className="flex items-start gap-1.5">
                            <span className="text-[10px] text-slate-500 font-semibold w-12 flex-shrink-0 pt-0.5">Email</span>
                            <span className="text-[11px] text-slate-400 break-all">{chatAccount.ownerEmail}</span>
                          </div>
                        )}
                        {chatAccount.phone && (
                          <div className="flex items-start gap-1.5">
                            <span className="text-[10px] text-slate-500 font-semibold w-12 flex-shrink-0 pt-0.5">Phone</span>
                            <span className="text-[11px] text-slate-300">{chatAccount.phone}</span>
                          </div>
                        )}
                        <div className="pt-1">
                          <a href={`/admin/accounts/${chatAccount.id}`} target="_blank" rel="noopener noreferrer"
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 transition flex items-center gap-1">
                            <Globe className="w-2.5 h-2.5" /> View account →
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                  {(currentChat as any).page_url && (
                    <div>
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Page</h4>
                      <a href={(currentChat as any).page_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-start gap-1.5 text-[11px] text-indigo-400 hover:text-indigo-300 break-all transition">
                        <Globe className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        {(currentChat as any).page_url}
                      </a>
                    </div>
                  )}
                  <div>
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Timeline</h4>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-slate-500 flex-shrink-0" />
                        <span className="text-slate-400">Started {new Date(currentChat.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      {(currentChat as ActiveChat).accepted_at && (
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                          <span className="text-slate-400">Accepted {new Date((currentChat as ActiveChat).accepted_at!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Quick actions */}
                  {isCurrentQueued && (
                    <button onClick={() => assignChat(selectedChatId!)}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 rounded-lg transition flex items-center justify-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5" /> Take this chat
                    </button>
                  )}
                  {isCurrentActive && (
                    <div className="space-y-2">
                      {!isCurrentOwner && (
                        <div className="flex items-center gap-1.5 text-[10px] text-amber-400/90 bg-amber-900/20 border border-amber-700/30 rounded-lg px-2.5 py-2">
                          <Lock className="w-3 h-3 flex-shrink-0" />
                          <span>Owned by {(currentChat as ActiveChat)?.agent_name || "another agent"}</span>
                        </div>
                      )}
                      <button onClick={() => setShowTransfer(true)}
                        disabled={!isCurrentOwner}
                        title={!isCurrentOwner ? "Only the assigned agent can transfer" : undefined}
                        className="w-full border border-slate-600 text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs py-2 rounded-lg transition flex items-center justify-center gap-1.5">
                        <ArrowRightLeft className="w-3.5 h-3.5" /> Transfer
                      </button>
                      <button onClick={closeChat}
                        disabled={!isCurrentOwner}
                        title={!isCurrentOwner ? "Only the assigned agent can end this chat" : undefined}
                        className="w-full border border-rose-800 text-rose-400 hover:bg-rose-900/20 disabled:opacity-40 disabled:cursor-not-allowed text-xs py-2 rounded-lg transition flex items-center justify-center gap-1.5">
                        <X className="w-3.5 h-3.5" /> End Chat
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-slate-600 text-xs text-center py-8">Select a chat to see details</p>
              )}
            </div>
          )}

          {/* Canned responses tab */}
          {rightTab === "canned" && (
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="px-3 py-2 border-b border-slate-700 text-[10px] text-slate-500">
                Click to insert, or type <kbd className="bg-slate-700 px-1 rounded">/</kbd> in the message box
              </div>
              <CannedPanel canned={canned}
                onPick={t => { setText(t); setRightTab("info"); inputRef.current?.focus(); }}
                onAdded={() => qc.invalidateQueries({ queryKey: ["lc-canned"] })} />
            </div>
          )}

          {/* Departments + Routing tab */}
          {rightTab === "settings" && (
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              <div>
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Departments</h4>
                <div className="space-y-1.5">
                  {depts.map(d => (
                    <div key={d.id} className="px-2 py-1.5 rounded-lg bg-slate-800/50">
                      <p className="text-xs font-medium text-slate-300">{d.name}</p>
                      {d.description && <p className="text-[10px] text-slate-600">{d.description}</p>}
                    </div>
                  ))}
                </div>
                <AddDeptForm onAdded={() => qc.invalidateQueries({ queryKey: ["lc-depts"] })} />
              </div>
              <RoutingSettingsPanel
                depts={depts}
                allAgents={allAgents}
                agentDepts={agentDepts}
                onChanged={() => { qc.invalidateQueries({ queryKey: ["lc-depts"] }); refetchAgentDepts(); }}
              />
            </div>
          )}
        </div>
      </div>

      {/* WS status */}
      <div className={`fixed bottom-4 right-4 flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full transition-opacity ${
        wsReady ? "bg-emerald-900/80 text-emerald-300" : "bg-rose-900/80 text-rose-300"
      }`}>
        <Radio className="w-3 h-3" />
        {wsReady ? "Connected" : "Reconnecting…"}
      </div>

      {/* Transfer modal */}
      {showTransfer && selectedChatId && (
        <TransferModal
          chatId={selectedChatId}
          depts={depts}
          onDone={() => { setShowTransfer(false); setSelectedChatId(null); refetchActive(); refetchQueue(); }}
          onClose={() => setShowTransfer(false)}
        />
      )}
    </div>
  );
}

// ─── Canned panel ─────────────────────────────────────────────────────────────
function CannedPanel({ canned, onPick, onAdded }: {
  canned: CannedResponse[]; onPick: (text: string) => void; onAdded: () => void;
}) {
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [newShortcut, setNewShortcut] = useState("");
  const [newTitle,    setNewTitle]    = useState("");
  const [newContent,  setNewContent]  = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = filter
    ? canned.filter(c => c.shortcut.includes(filter) || c.title.toLowerCase().includes(filter.toLowerCase()))
    : canned;

  const addCanned = async () => {
    if (!newShortcut.trim() || !newTitle.trim() || !newContent.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/support/live-chat/canned", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shortcut: newShortcut.trim(), title: newTitle.trim(), content: newContent.trim() }),
      });
      setAdding(false); setNewShortcut(""); setNewTitle(""); setNewContent("");
      onAdded();
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-700">
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search…"
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none" />
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.map(c => (
          <button key={c.id} onClick={() => onPick(c.content)}
            className="w-full text-left p-2.5 rounded-lg hover:bg-slate-700 transition group">
            <div className="flex items-center gap-1.5 mb-0.5">
              <code className="text-[10px] bg-indigo-600/30 text-indigo-300 px-1.5 py-0.5 rounded">/{c.shortcut}</code>
              <span className="text-xs font-medium text-slate-300">{c.title}</span>
            </div>
            <p className="text-[11px] text-slate-500 line-clamp-2 group-hover:text-slate-400">{c.content}</p>
          </button>
        ))}
        {!filtered.length && <p className="text-slate-600 text-xs text-center py-4">No matches</p>}
      </div>
      <div className="p-2 border-t border-slate-700">
        {!adding ? (
          <button onClick={() => setAdding(true)}
            className="w-full flex items-center justify-center gap-1.5 text-[11px] text-slate-500 hover:text-indigo-400 py-1.5 transition">
            <Plus className="w-3 h-3" /> Add response
          </button>
        ) : (
          <div className="space-y-1.5">
            <input value={newShortcut} onChange={e => setNewShortcut(e.target.value)} placeholder="Shortcut (e.g. hello)"
              className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white placeholder-slate-600 focus:outline-none" />
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Title"
              className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white placeholder-slate-600 focus:outline-none" />
            <textarea value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="Response text" rows={2}
              className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-white placeholder-slate-600 resize-none focus:outline-none" />
            <div className="flex gap-1.5">
              <button onClick={() => setAdding(false)} className="flex-1 text-[11px] text-slate-500 hover:text-slate-300 py-1">Cancel</button>
              <button onClick={addCanned} disabled={busy}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[11px] font-semibold py-1 rounded transition flex items-center justify-center gap-1">
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Routing Settings Panel ───────────────────────────────────────────────────
function RoutingSettingsPanel({ depts, allAgents, agentDepts, onChanged }: {
  depts: Dept[];
  allAgents: AllAgent[];
  agentDepts: AgentDeptAssignment[];
  onChanged: () => void;
}) {
  const [editingKeywords, setEditingKeywords] = useState<Record<number, string>>({});
  const [savingKeywords,  setSavingKeywords]  = useState<Record<number, boolean>>({});
  const [addingAgent,     setAddingAgent]     = useState<Record<number, string>>({});
  const [busyAssign,      setBusyAssign]      = useState<Record<number, boolean>>({});

  const agentsByDept = (deptId: number) =>
    agentDepts.filter(a => a.department_id === deptId);

  const saveKeywords = async (deptId: number, keywords: string) => {
    setSavingKeywords(p => ({ ...p, [deptId]: true }));
    try {
      await fetch(`/api/support/live-chat/departments/${deptId}/keywords`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords }),
      });
      onChanged();
      setEditingKeywords(p => { const n = { ...p }; delete n[deptId]; return n; });
    } finally { setSavingKeywords(p => ({ ...p, [deptId]: false })); }
  };

  const assignAgent = async (deptId: number, agentId: string) => {
    if (!agentId) return;
    setBusyAssign(p => ({ ...p, [deptId]: true }));
    try {
      await fetch("/api/support/live-chat/agent-departments", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: Number(agentId), departmentId: deptId }),
      });
      onChanged();
      setAddingAgent(p => ({ ...p, [deptId]: "" }));
    } finally { setBusyAssign(p => ({ ...p, [deptId]: false })); }
  };

  const removeAgent = async (agentId: number, deptId: number) => {
    await fetch(`/api/support/live-chat/agent-departments/${agentId}/${deptId}`, {
      method: "DELETE", credentials: "include",
    });
    onChanged();
  };

  if (!depts.length) return null;

  return (
    <div>
      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
        <Tag className="w-3 h-3" /> Smart Routing
      </h4>
      <p className="text-[10px] text-slate-600 mb-3 leading-relaxed">
        Keywords auto-route new chats to the right dept. Agents with no dept assignment see all chats.
      </p>
      <div className="space-y-4">
        {depts.filter(d => d.is_active).map(d => {
          const currentKw = editingKeywords[d.id] ?? d.routing_keywords ?? "";
          const deptAgents = agentsByDept(d.id);
          const unassigned = allAgents.filter(a => !deptAgents.some(da => da.agent_id === a.id));

          return (
            <div key={d.id} className="bg-slate-800/60 rounded-xl p-3 space-y-2.5">
              <p className="text-xs font-semibold text-slate-200">{d.name}</p>

              {/* Routing keywords */}
              <div>
                <label className="text-[10px] text-slate-500 font-semibold mb-1 block flex items-center gap-1">
                  <Tag className="w-2.5 h-2.5" /> Keywords (comma-separated)
                </label>
                <div className="flex gap-1">
                  <input
                    value={currentKw}
                    onChange={e => setEditingKeywords(p => ({ ...p, [d.id]: e.target.value }))}
                    placeholder="billing, invoice, payment…"
                    className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-[11px] text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  {editingKeywords[d.id] !== undefined && (
                    <button
                      onClick={() => saveKeywords(d.id, currentKw)}
                      disabled={savingKeywords[d.id]}
                      className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[10px] font-semibold rounded-lg transition">
                      {savingKeywords[d.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                    </button>
                  )}
                </div>
              </div>

              {/* Assigned agents */}
              <div>
                <label className="text-[10px] text-slate-500 font-semibold mb-1 block flex items-center gap-1">
                  <Users className="w-2.5 h-2.5" /> Assigned agents
                </label>
                <div className="space-y-1 mb-1.5">
                  {deptAgents.length === 0 && (
                    <p className="text-[10px] text-slate-600 italic">All agents see this dept</p>
                  )}
                  {deptAgents.map(a => (
                    <div key={a.agent_id} className="flex items-center justify-between gap-1 bg-slate-700/60 rounded-lg px-2 py-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-4 h-4 rounded-full bg-indigo-500/30 flex items-center justify-center text-indigo-300 text-[9px] font-bold flex-shrink-0">
                          {a.agent_name[0].toUpperCase()}
                        </div>
                        <span className="text-[11px] text-slate-300 truncate">{a.agent_name}</span>
                      </div>
                      <button onClick={() => removeAgent(a.agent_id, d.id)}
                        className="text-slate-600 hover:text-rose-400 transition flex-shrink-0">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                {unassigned.length > 0 && (
                  <div className="flex gap-1">
                    <select
                      value={addingAgent[d.id] ?? ""}
                      onChange={e => setAddingAgent(p => ({ ...p, [d.id]: e.target.value }))}
                      className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none">
                      <option value="">Add agent…</option>
                      {unassigned.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name}{a.online ? " 🟢" : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => assignAgent(d.id, addingAgent[d.id] ?? "")}
                      disabled={!addingAgent[d.id] || busyAssign[d.id]}
                      className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg transition">
                      {busyAssign[d.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddDeptForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await fetch("/api/support/live-chat/departments", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      setName(""); onAdded();
    } finally { setBusy(false); }
  };
  return (
    <div className="mt-4 pt-3 border-t border-slate-700 flex gap-1.5">
      <input value={name} onChange={e => setName(e.target.value)}
        placeholder="New dept…" onKeyDown={e => e.key === "Enter" && add()}
        className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none" />
      <button onClick={add} disabled={busy || !name.trim()}
        className="w-7 h-7 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-lg flex items-center justify-center transition">
        {busy ? <Loader2 className="w-3 h-3 animate-spin text-white" /> : <Plus className="w-3 h-3 text-white" />}
      </button>
    </div>
  );
}
