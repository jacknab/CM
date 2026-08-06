/**
 * ChatWidget — embeddable live-chat popup/slide-in
 * Used by ContactPage (slide-in) and CustomerChatPage (full-page).
 *
 * Features:
 *  • Auto-detects logged-in session via /api/live-chat/me → pre-fills name/email, skips form
 *  • Attaches accountId to the chat on start
 *  • Full queue → chat → rating flow
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  MessageCircle, Send, X, Star, Loader2, CheckCircle2,
  Clock, ChevronDown, User, AtSign, Tag, FileText,
} from "lucide-react";

interface Dept { id: number; name: string; description: string | null }
interface ChatMessage {
  role: "visitor" | "agent" | "system";
  content: string;
  agentName?: string;
  timestamp?: string;
}
type Step = "form" | "queue" | "chat" | "rating" | "done";

interface SessionInfo {
  loggedIn: boolean;
  name?: string;
  email?: string;
  accountId?: string | null;
  storeName?: string | null;
  planName?: string | null;
  city?: string | null;
  state?: string | null;
}

function wsUrl(path: string) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${path}`;
}

// ─── Pre-chat form ────────────────────────────────────────────────────────────
function IntroForm({ depts, session, onStart }: {
  depts: Dept[];
  session: SessionInfo;
  onStart: (data: { name: string; email: string; deptId: string; subject: string }) => Promise<void>;
}) {
  const [name,    setName]    = useState(session.name ?? "");
  const [email,   setEmail]   = useState(session.email ?? "");
  const [deptId,  setDeptId]  = useState("");
  const [subject, setSubject] = useState("");
  const [busy,    setBusy]    = useState(false);
  const [err,     setErr]     = useState("");

  useEffect(() => {
    if (session.name)  setName(session.name);
    if (session.email) setEmail(session.email);
  }, [session.name, session.email]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await onStart({ name: name.trim(), email: email.trim(), deptId, subject: subject.trim() }); }
    catch { setErr("Something went wrong. Please try again."); setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 w-full">
      <div className="text-center mb-1">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center mx-auto mb-3 shadow-lg">
          <MessageCircle className="w-6 h-6 text-white" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">Chat with us</h2>
        <p className="text-xs text-gray-500 mt-0.5">We typically reply in under 2 minutes.</p>
        {session.loggedIn && session.storeName && (
          <div className="mt-2 inline-flex items-center gap-1.5 bg-violet-50 border border-violet-200 rounded-full px-3 py-1 text-xs text-violet-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Signed in as {session.storeName}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="flex items-center gap-1 text-[11px] font-semibold text-gray-600 mb-1.5">
            <User className="w-3 h-3" /> Name *
          </label>
          <input required value={name} onChange={e => setName(e.target.value)}
            readOnly={session.loggedIn && !!session.name}
            className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 ${session.loggedIn && session.name ? "bg-gray-50 text-gray-500 border-gray-200" : "border-gray-200"}`}
            placeholder="Your name" />
        </div>
        <div>
          <label className="flex items-center gap-1 text-[11px] font-semibold text-gray-600 mb-1.5">
            <AtSign className="w-3 h-3" /> Email
          </label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            readOnly={session.loggedIn && !!session.email}
            className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 ${session.loggedIn && session.email ? "bg-gray-50 text-gray-500 border-gray-200" : "border-gray-200"}`}
            placeholder="you@example.com" />
        </div>
      </div>

      {depts.length > 0 && (
        <div>
          <label className="flex items-center gap-1 text-[11px] font-semibold text-gray-600 mb-1.5">
            <Tag className="w-3 h-3" /> Department
          </label>
          <div className="relative">
            <select value={deptId} onChange={e => setDeptId(e.target.value)}
              className="w-full appearance-none border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400">
              <option value="">General Support</option>
              {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      )}

      <div>
        <label className="flex items-center gap-1 text-[11px] font-semibold text-gray-600 mb-1.5">
          <FileText className="w-3 h-3" /> How can we help? *
        </label>
        <textarea required value={subject} onChange={e => setSubject(e.target.value)} rows={3}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-400"
          placeholder="Briefly describe your question or issue…" />
      </div>

      {err && <p className="text-rose-500 text-xs text-center">{err}</p>}

      <button type="submit" disabled={busy || !name.trim() || !subject.trim()}
        className="flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
        Start Chat
      </button>
    </form>
  );
}

// ─── Queue screen ─────────────────────────────────────────────────────────────
function QueueScreen({ position, estimatedWaitMin, subject }: {
  position: number; estimatedWaitMin: number | null; subject: string;
}) {
  const posLabel =
    position === 1 ? "You're next!" : position === 2 ? "2nd in line" :
    position === 3 ? "3rd in line" : `${position}th in line`;
  const waitLabel =
    estimatedWaitMin == null ? "Calculating…" :
    estimatedWaitMin <= 1 ? "Less than a minute" :
    `~${estimatedWaitMin} min`;

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center w-full">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-4 border-violet-100 border-t-violet-600 animate-spin" />
        <Clock className="w-6 h-6 text-violet-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      </div>
      <div>
        <h3 className="text-base font-bold text-gray-900">You're in the queue</h3>
        <p className="text-xs text-gray-500 mt-0.5">An agent will be with you shortly</p>
      </div>
      <div className="w-full bg-violet-50 border border-violet-100 rounded-xl px-4 py-3 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-violet-600 font-medium">Position</span><span className="font-bold text-violet-700">#{position}</span></div>
        <div className="h-px bg-violet-100" />
        <div className="flex justify-between"><span className="text-violet-600 font-medium">Wait</span><span className="font-bold text-violet-700">{waitLabel}</span></div>
        <div className="h-px bg-violet-100" />
        <div className="flex justify-between"><span className="text-violet-600 font-medium">Status</span><span className="font-bold text-emerald-600">{posLabel}</span></div>
      </div>
      {subject && (
        <div className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-left">
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-0.5">Your issue</p>
          <p className="text-xs text-gray-700 line-clamp-2">{subject}</p>
        </div>
      )}
      <p className="text-[11px] text-gray-400 leading-relaxed">Keep this open. You'll be connected automatically.</p>
    </div>
  );
}

// ─── Active chat window ───────────────────────────────────────────────────────
function ChatWindow({ messages, agentName, agentTyping, visitorName, onSend, onClose }: {
  messages: ChatMessage[]; agentName: string; agentTyping: boolean;
  visitorName: string; onSend: (text: string) => void; onClose: () => void;
}) {
  const [text,         setText]         = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, agentTyping]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSendRef.current(t);
    setText("");
  };

  return (
    <div className="flex flex-col w-full" style={{ height: 420 }}>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 bg-gradient-to-r from-violet-700 to-purple-700 rounded-t-2xl flex-shrink-0">
        <div className="relative flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-bold">
            {agentName.charAt(0).toUpperCase()}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-violet-700" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white font-semibold text-sm leading-tight">{agentName}</div>
          <div className="text-violet-200 text-[10px]">Certxa Support · Online</div>
        </div>
        <button onClick={() => setConfirmClose(true)} className="text-violet-200 hover:text-white transition p-1 rounded">
          <X className="w-4 h-4" />
        </button>
      </div>

      {confirmClose && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 rounded-2xl">
          <div className="bg-white rounded-2xl p-5 mx-4 shadow-2xl text-center">
            <h4 className="font-bold text-gray-900 mb-2 text-sm">End this chat?</h4>
            <p className="text-xs text-gray-500 mb-4">You can rate your experience after.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmClose(false)} className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-xl text-xs hover:bg-gray-50 transition">Keep chatting</button>
              <button onClick={onClose} className="flex-1 bg-rose-500 hover:bg-rose-600 text-white py-2 rounded-xl text-xs font-semibold transition">End chat</button>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-gray-50">
        {messages.map((m, i) => {
          if (m.role === "system") {
            return <div key={i} className="text-center"><span className="text-[10px] text-gray-400 bg-gray-200 rounded-full px-2.5 py-0.5">{m.content}</span></div>;
          }
          const isVisitor = m.role === "visitor";
          return (
            <div key={i} className={`flex items-end gap-1.5 ${isVisitor ? "justify-end" : "justify-start"}`}>
              {!isVisitor && (
                <div className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 text-[9px] font-bold flex-shrink-0 mb-1">
                  {agentName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${isVisitor ? "bg-violet-600 text-white rounded-br-sm" : "bg-white text-gray-800 border border-gray-200 rounded-bl-sm"}`}>
                {!isVisitor && m.agentName && (
                  <div className="text-[9px] font-semibold text-violet-500 mb-0.5">{m.agentName}</div>
                )}
                <p className="leading-relaxed whitespace-pre-wrap break-words text-[13px]">{m.content}</p>
              </div>
              {isVisitor && (
                <div className="w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 mb-1">
                  {visitorName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          );
        })}
        {agentTyping && (
          <div className="flex items-end gap-1.5">
            <div className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 text-[9px] font-bold flex-shrink-0">
              {agentName.charAt(0).toUpperCase()}
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-3 py-2">
              <div className="flex gap-1 items-center">
                {[0,1,2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-2.5 bg-white border-t border-gray-200 rounded-b-2xl flex gap-2 items-end flex-shrink-0">
        <textarea value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          rows={1} placeholder="Type a message…"
          className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 max-h-24"
          style={{ minHeight: "38px" }} />
        <button onClick={send} disabled={!text.trim()}
          className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white transition-colors">
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Rating screen ────────────────────────────────────────────────────────────
function RatingScreen({ chatId, agentName, onDone }: { chatId: string; agentName: string; onDone: () => void }) {
  const [rating,  setRating]  = useState(0);
  const [hover,   setHover]   = useState(0);
  const [comment, setComment] = useState("");
  const [saved,   setSaved]   = useState(false);
  const [busy,    setBusy]    = useState(false);
  const LABELS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

  const submit = async () => {
    if (!rating) return;
    setBusy(true);
    try {
      await fetch(`/api/live-chat/${chatId}/rate`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment }),
      });
      setSaved(true);
      setTimeout(onDone, 2000);
    } finally { setBusy(false); }
  };

  if (saved) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <CheckCircle2 className="w-14 h-14 text-emerald-500" />
        <h3 className="text-base font-bold text-gray-900">Thank you!</h3>
        <p className="text-xs text-gray-500">Your feedback helps us improve.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center w-full">
      <div>
        <h3 className="text-base font-bold text-gray-900">How did we do?</h3>
        <p className="text-xs text-gray-500 mt-0.5">Rate your chat{agentName !== "Support Agent" ? ` with ${agentName}` : ""}</p>
      </div>
      <div className="flex gap-2">
        {[1,2,3,4,5].map(n => (
          <button key={n} onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
            className={`w-10 h-10 rounded-xl transition-all ${(hover || rating) >= n ? "bg-amber-400 text-white scale-110 shadow-md" : "bg-gray-100 text-gray-300 hover:bg-amber-100"}`}>
            <Star className="w-5 h-5 mx-auto" fill={(hover || rating) >= n ? "white" : "none"} />
          </button>
        ))}
      </div>
      {(hover || rating) > 0 && <p className="text-xs font-semibold text-amber-500 -mt-1">{LABELS[hover || rating]}</p>}
      <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2}
        placeholder="Tell us more (optional)…"
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-400" />
      <div className="flex gap-2 w-full">
        <button onClick={onDone} className="flex-1 border border-gray-200 text-gray-500 text-xs py-2 rounded-xl hover:bg-gray-50 transition">Skip</button>
        <button onClick={submit} disabled={!rating || busy}
          className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold text-xs py-2 rounded-xl transition flex items-center justify-center gap-1.5">
          {busy && <Loader2 className="w-3 h-3 animate-spin" />} Submit
        </button>
      </div>
    </div>
  );
}

// ─── Main ChatWidget component ────────────────────────────────────────────────
export interface ChatWidgetProps {
  /** Called when user clicks X on the widget wrapper (parent controls visibility) */
  onClose?: () => void;
  /** Show a close (×) button in the top-right corner */
  showCloseButton?: boolean;
  /** Extra CSS class on the root container */
  className?: string;
  /** Called whenever a new agent message is received (use for unread badges) */
  onNewAgentMessage?: () => void;
}

export default function ChatWidget({ onClose, showCloseButton = false, className = "", onNewAgentMessage }: ChatWidgetProps) {
  const [step,        setStep]        = useState<Step>("form");
  const [depts,       setDepts]       = useState<Dept[]>([]);
  const [session,     setSession]     = useState<SessionInfo>({ loggedIn: false });
  const [sessionLoading, setSessionLoading] = useState(true);
  const [chatId,      setChatId]      = useState("");
  const [queuePos,    setQueuePos]    = useState(1);
  const [estWait,     setEstWait]     = useState<number | null>(null);
  const [messages,    setMessages]    = useState<ChatMessage[]>([]);
  const [agentName,   setAgentName]   = useState("Support Agent");
  const [agentTyping, setAgentTyping] = useState(false);
  const [subject,     setSubject]     = useState("");
  const [visitorName, setVisitorName] = useState("");
  const wsRef        = useRef<WebSocket | null>(null);
  const typingTimer  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Load departments + session info
  useEffect(() => {
    Promise.all([
      fetch("/api/live-chat/departments", { credentials: "include" }).then(r => r.json()).catch(() => ({})),
      fetch("/api/live-chat/me",          { credentials: "include" }).then(r => r.json()).catch(() => ({ loggedIn: false })),
    ]).then(([deptData, sessionData]) => {
      setDepts(deptData.departments ?? []);
      setSession(sessionData);
      setSessionLoading(false);
    });
  }, []);

  // Restore in-progress chat
  useEffect(() => {
    const stored = localStorage.getItem("certxa_chat");
    if (stored) {
      try {
        const { chatId: cid, step: s, subject: sub, visitorName: vn } = JSON.parse(stored);
        if (cid && (s === "queue" || s === "chat")) {
          setChatId(cid);
          if (sub) setSubject(sub);
          if (vn)  setVisitorName(vn);
          connectWs(cid);
          setStep(s);
        }
      } catch {}
    }
  }, []);

  const connectWs = useCallback((cid: string) => {
    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket(wsUrl(`/ws/live-chat?role=visitor&chatId=${cid}`));
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "queue_position") {
          setQueuePos(msg.position);
          if (msg.estimatedWaitMin != null) setEstWait(msg.estimatedWaitMin);
          setStep("queue");
        } else if (msg.type === "assigned") {
          setAgentName(msg.agentName ?? "Support Agent");
          setMessages(prev => [...prev, { role: "system", content: `${msg.agentName ?? "Support"} joined the chat` }]);
          setStep("chat");
          localStorage.setItem("certxa_chat", JSON.stringify({ chatId: cid, step: "chat" }));
        } else if (msg.type === "message") {
          setMessages(prev => [...prev, { role: "agent", content: msg.content, agentName: msg.agentName, timestamp: msg.timestamp }]);
          setAgentTyping(false);
          onNewAgentMessage?.();
        } else if (msg.type === "typing") {
          setAgentTyping(true);
          clearTimeout(typingTimer.current);
          typingTimer.current = setTimeout(() => setAgentTyping(false), 4000);
        } else if (msg.type === "typing_stop") {
          setAgentTyping(false);
        } else if (msg.type === "transferred") {
          const note = msg.agentName
            ? `Chat transferred to ${msg.agentName}`
            : `Chat transferred to ${msg.departmentName ?? "another team"}`;
          setMessages(prev => [...prev, { role: "system", content: note }]);
          if (!msg.agentName) {
            setStep("queue");
            localStorage.setItem("certxa_chat", JSON.stringify({ chatId: cid, step: "queue" }));
          } else {
            setAgentName(msg.agentName);
          }
        } else if (msg.type === "closed") {
          setMessages(prev => [...prev, { role: "system", content: "Chat ended by agent" }]);
          localStorage.removeItem("certxa_chat");
          setTimeout(() => setStep("rating"), 1200);
        }
      } catch {}
    };

    const hb = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
    }, 30_000);
    ws.onclose = () => clearInterval(hb);
  }, []);

  const handleStart = async ({ name, email, deptId, subject: sub }: {
    name: string; email: string; deptId: string; subject: string;
  }) => {
    const r = await fetch("/api/live-chat/start", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitorName: name, visitorEmail: email,
        departmentId: deptId || undefined, subject: sub,
        pageUrl: location.href,
        accountId: session.accountId ?? undefined,
      }),
    });
    if (!r.ok) throw new Error("Failed to start");
    const data = await r.json();
    const cid = data.chatId;
    setChatId(cid);
    setQueuePos(data.queuePosition ?? 1);
    if (data.estimatedWaitMin != null) setEstWait(data.estimatedWaitMin);
    setSubject(sub);
    setVisitorName(name);
    localStorage.setItem("certxa_chat", JSON.stringify({ chatId: cid, step: "queue", subject: sub, visitorName: name }));
    connectWs(cid);
    setStep("queue");
  };

  const handleSend = (text: string) => {
    setMessages(prev => [...prev, { role: "visitor", content: text, timestamp: new Date().toISOString() }]);
    wsRef.current?.send(JSON.stringify({ type: "message", content: text }));
  };

  const handleClose = () => {
    wsRef.current?.close();
    localStorage.removeItem("certxa_chat");
    setStep("rating");
  };

  const reset = () => {
    setStep("form"); setMessages([]); setChatId(""); setSubject(""); setVisitorName("");
  };

  if (sessionLoading) {
    return (
      <div className={`flex items-center justify-center py-12 ${className}`}>
        <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className={`relative bg-white rounded-2xl shadow-2xl shadow-violet-100 overflow-hidden ${className}`}>
      {showCloseButton && onClose && step !== "chat" && (
        <button onClick={onClose}
          className="absolute top-3 right-3 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition">
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      <div className="p-5">
        {step === "form"   && <IntroForm depts={depts} session={session} onStart={handleStart} />}
        {step === "queue"  && <QueueScreen position={queuePos} estimatedWaitMin={estWait} subject={subject} />}
        {step === "rating" && <RatingScreen chatId={chatId} agentName={agentName} onDone={() => setStep("done")} />}
        {step === "done"   && (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <CheckCircle2 className="w-14 h-14 text-violet-500" />
            <div>
              <h3 className="text-base font-bold text-gray-900">Thanks for reaching out!</h3>
              <p className="text-xs text-gray-500 mt-1">We hope we resolved your issue today.</p>
            </div>
            <div className="flex flex-col gap-2 w-full">
              <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 py-2 transition">Start a new chat</button>
              {onClose && <button onClick={onClose} className="bg-violet-600 hover:bg-violet-700 text-white font-semibold py-2 rounded-xl text-sm transition">Close</button>}
            </div>
          </div>
        )}
      </div>

      {step === "chat" && (
        <ChatWindow
          messages={messages} agentName={agentName} agentTyping={agentTyping}
          visitorName={visitorName || "You"} onSend={handleSend} onClose={handleClose}
        />
      )}
    </div>
  );
}
