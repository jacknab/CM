/**
 * ChatConnection — the support agent's live-chat connection, held by the back-office frame.
 *
 * The connection used to live inside the Live Chat page, so an agent was only "online" for chat
 * while that page was open: on Tickets or an account page the socket closed, the server marked
 * them offline, and a new chat or a new message in their own chat made no sound and showed
 * nothing. Here the socket, the sounds, the browser notifications, the unread marks and the chat
 * the agent has open all belong to the frame, so they carry across every /isTeam page. Away from
 * the Live Chat page an alert appears with a button that takes the agent to the chat.
 *
 * The Live Chat page subscribes to the same socket for what only it needs (messages on screen,
 * typing indicators) and sends through `socketRef`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Ticket, X } from "lucide-react";

type Listener = (msg: any) => void;
export type AgentStatus = "online" | "away" | "busy";

interface Alert {
  id: number;
  kind: "chat" | "message" | "ticket";
  title: string;
  line1: string;
  line2?: string;
  chatId?: string;
}

interface ChatConnectionValue {
  socketRef: MutableRefObject<WebSocket | null>;
  /** The socket is open. */
  ready: boolean;
  agentId: number | null;
  agentRole: string;
  status: AgentStatus;
  changeStatus: (status: AgentStatus) => void;
  soundEnabled: boolean;
  setSoundEnabled: (value: boolean | ((prev: boolean) => boolean)) => void;
  /** Chats with a visitor message the agent has not looked at yet. */
  unread: Set<string>;
  markRead: (chatId: string) => void;
  /** The chat open on the Live Chat page. Kept here so it is still open when the agent comes back. */
  selectedChatId: string | null;
  setSelectedChatId: (chatId: string | null) => void;
  /** Receive every message from the socket. Returns the unsubscribe function. */
  subscribe: (listener: Listener) => () => void;
  /** Chats waiting in the queue. */
  queueCount: number;
}

const ChatConnectionContext = createContext<ChatConnectionValue | null>(null);

export function useChatConnection(): ChatConnectionValue {
  const value = useContext(ChatConnectionContext);
  if (!value) throw new Error("useChatConnection must be used inside ChatConnectionProvider");
  return value;
}

const CHAT_PAGE = "/isTeam/live-chat";
const ALERT_MS = 12000;

function wsUrl(path: string) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${path}`;
}

async function api<T = any>(path: string): Promise<T> {
  const r = await fetch(path, { credentials: "include" });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

// Web Audio API — no sound file needed.
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

function browserNotification(title: string, body: string) {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") new Notification(title, { body, icon: "/favicon.ico" });
    else if (Notification.permission === "default") Notification.requestPermission();
  } catch {}
}

export function ChatConnectionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const socketRef = useRef<WebSocket | null>(null);
  const listeners = useRef(new Set<Listener>());
  // Bumped whenever the provider stops (sign-out, unmount). A connection attempt or socket from an
  // earlier generation must not open, reconnect or deliver anything.
  const generation = useRef(0);
  const alertSeq = useRef(0);

  const [ready, setReady] = useState(false);
  const [agentId, setAgentId] = useState<number | null>(null);
  const [agentRole, setAgentRole] = useState("agent");
  const [status, setStatus] = useState<AgentStatus>("online");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [unread, setUnread] = useState<Set<string>>(new Set());
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  // The socket handler is created once per connection, so it reads the latest values through refs.
  const onChatPage = location.pathname.startsWith(CHAT_PAGE);
  const live = useRef({ onChatPage, selectedChatId, soundEnabled, status });
  live.current = { onChatPage, selectedChatId, soundEnabled, status };

  const { data: queueData } = useQuery<{ queue?: unknown[] }>({
    queryKey: ["lc-queue"],
    queryFn: () => api("/api/support/live-chat/queue"),
    refetchInterval: 15000,
  });
  const queueCount = queueData?.queue?.length ?? 0;

  const dismiss = useCallback((id: number) => setAlerts((prev) => prev.filter((a) => a.id !== id)), []);

  const raise = useCallback((alert: Omit<Alert, "id">) => {
    const id = ++alertSeq.current;
    setAlerts((prev) => [...prev.slice(-2), { ...alert, id }]);
    setTimeout(() => dismiss(id), ALERT_MS);
  }, [dismiss]);

  const refresh = useCallback((...keys: string[]) => {
    for (const key of keys) qc.invalidateQueries({ queryKey: [key] });
  }, [qc]);

  const connect = useCallback(async () => {
    const mine = generation.current;
    try {
      const { token } = await api("/api/support/live-chat/ws-token");
      if (mine !== generation.current) return;
      const ws = new WebSocket(wsUrl(`/ws/live-chat?role=agent&token=${token}`));
      socketRef.current = ws;

      ws.onopen = () => setReady(true);
      ws.onclose = () => {
        if (mine !== generation.current) return;
        setReady(false);
        setTimeout(connect, 5000);
      };

      ws.onmessage = (ev) => {
        if (mine !== generation.current) return;
        let msg: any;
        try { msg = JSON.parse(ev.data); } catch { return; }
        const now = live.current;
        try {
          switch (msg.type) {
            case "authenticated":
              setAgentId(msg.agentId);
              setAgentRole(msg.role ?? "agent");
              // A fresh socket starts as "online" on the server: put back what the agent had chosen.
              if (now.status !== "online") ws.send(JSON.stringify({ type: "status_change", status: now.status }));
              break;
            case "queue_update":
              refresh("lc-queue", "lc-stats");
              break;
            case "visitors":
              qc.setQueryData(["lc-visitors"], { visitors: msg.visitors ?? [] });
              break;
            case "new_chat":
              refresh("lc-queue", "lc-stats");
              if (now.soundEnabled) playNotificationSound("new_chat");
              browserNotification("New chat in queue", msg.visitorName ?? "A visitor needs help");
              if (!now.onChatPage) {
                raise({ kind: "chat", title: "New chat waiting", line1: msg.visitorName ?? "A visitor needs help", chatId: msg.chatId });
              }
              break;
            case "chat_assigned":
              refresh("lc-queue", "lc-active", "lc-stats");
              break;
            // The visitor ended an ongoing chat or their page went away (or came back): the Active list shows it.
            case "visitor_left":
            case "visitor_returned":
              refresh("lc-active");
              break;
            case "chat_closed":
            case "chat_transferred":
            case "chat_requeued":
              refresh("lc-queue", "lc-active", "lc-stats");
              if (msg.chatId === now.selectedChatId) setSelectedChatId(null);
              setUnread((prev) => {
                if (!prev.has(msg.chatId)) return prev;
                const next = new Set(prev); next.delete(msg.chatId); return next;
              });
              break;
            case "visitor_message":
            case "visitor_message_broadcast": {
              const chatId = msg.chatId as string;
              const onScreen = now.onChatPage && now.selectedChatId === chatId;
              if (!onScreen) {
                setUnread((prev) => { const next = new Set(prev); next.add(chatId); return next; });
                if (now.soundEnabled) playNotificationSound("new_message");
                // "visitor_message" goes to the agent who owns the chat; the broadcast goes to everyone else.
                if (!now.onChatPage && msg.type === "visitor_message") {
                  const content = String(msg.content ?? "");
                  raise({
                    kind: "message", title: "New chat message", line1: msg.visitorName ?? "Visitor",
                    line2: content.length > 120 ? content.slice(0, 120) + "…" : content, chatId,
                  });
                  browserNotification(`Chat: ${msg.visitorName ?? "Visitor"}`, content);
                }
              }
              break;
            }
            case "assign_ok":
              refresh("lc-queue", "lc-active");
              setSelectedChatId(msg.chatId);
              break;
            case "new_ticket":
              refresh("support-tickets-list", "support-open-ticket-count");
              raise({ kind: "ticket", title: `New ticket #${msg.ticketNumber}`, line1: msg.subject ?? "", line2: `From: ${msg.senderName ?? ""}` });
              try {
                if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                  new Notification(`New ticket #${msg.ticketNumber}`, { body: `${msg.senderName}: ${msg.subject}`, icon: "/favicon.ico" });
                }
              } catch {}
              if (now.soundEnabled) playNotificationSound("new_chat");
              break;
          }
        } catch {}
        for (const listener of listeners.current) {
          try { listener(msg); } catch {}
        }
      };
    } catch {
      if (mine === generation.current) setTimeout(connect, 5000);
    }
  }, [qc, raise, refresh]);

  useEffect(() => {
    connect();
    return () => { generation.current++; socketRef.current?.close(); setReady(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeStatus = useCallback((next: AgentStatus) => {
    setStatus(next);
    try { socketRef.current?.send(JSON.stringify({ type: "status_change", status: next })); } catch {}
  }, []);

  const markRead = useCallback((chatId: string) => {
    setUnread((prev) => {
      if (!prev.has(chatId)) return prev;
      const next = new Set(prev); next.delete(chatId); return next;
    });
  }, []);

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => { listeners.current.delete(listener); };
  }, []);

  const open = (alert: Alert) => {
    dismiss(alert.id);
    if (alert.kind === "ticket") { navigate("/isTeam/tickets"); return; }
    if (alert.chatId) { setSelectedChatId(alert.chatId); markRead(alert.chatId); }
    navigate(CHAT_PAGE);
  };

  const value = useMemo<ChatConnectionValue>(() => ({
    socketRef, ready, agentId, agentRole, status, changeStatus, soundEnabled, setSoundEnabled,
    unread, markRead, selectedChatId, setSelectedChatId, subscribe, queueCount,
  }), [ready, agentId, agentRole, status, changeStatus, soundEnabled, unread, markRead, selectedChatId, subscribe, queueCount]);

  return (
    <ChatConnectionContext.Provider value={value}>
      {children}
      {alerts.length > 0 && (
        <div className="fixed top-16 right-4 z-50 w-80 space-y-2">
          {alerts.map((alert) => (
            <div key={alert.id} className="bg-white border border-slate-200 rounded-xl shadow-2xl shadow-slate-900/30 overflow-hidden">
              <div className={`flex items-center gap-2 px-4 py-2.5 ${alert.kind === "ticket" ? "bg-indigo-600" : "bg-emerald-600"}`}>
                {alert.kind === "ticket"
                  ? <Ticket className="w-3.5 h-3.5 text-white flex-shrink-0" />
                  : <MessageCircle className="w-3.5 h-3.5 text-white flex-shrink-0" />}
                <span className="text-white text-xs font-bold flex-1">{alert.title}</span>
                <button onClick={() => dismiss(alert.id)} className="text-white/70 hover:text-white transition">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="px-4 py-3">
                <p className="text-sm font-semibold text-slate-800 leading-snug truncate">{alert.line1}</p>
                {alert.line2 && <p className="text-xs text-slate-500 mt-0.5 break-words">{alert.line2}</p>}
                <button
                  onClick={() => open(alert)}
                  className="mt-2.5 w-full text-center text-xs text-indigo-600 font-semibold hover:text-indigo-800 transition"
                >
                  {alert.kind === "ticket" ? "View ticket →" : "Open chat →"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </ChatConnectionContext.Provider>
  );
}
