/**
 * Customer-facing live chat widget — floating overlay (Intercom-style)
 * Mounted globally in App.tsx; hidden on /isTeam/* and /kiosk/* paths.
 * Flow: form → queue → chat → rating → done
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import {
  MessageCircle, Send, X, Star, Loader2, CheckCircle2,
  Clock, ChevronDown, User, AtSign, Tag, FileText, Minus,
} from "lucide-react";

interface Dept    { id: number; name: string; description: string | null }
interface Message { role: "visitor" | "agent" | "system"; content: string; agentName?: string; timestamp?: string }
type Step = "form" | "queue" | "chat" | "rating" | "done";

function wsUrl(path: string) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${path}`;
}

// ─── Pre-chat form ────────────────────────────────────────────────────────────
function IntroForm({ depts, onStart }: {
  depts: Dept[];
  onStart: (d: { name: string; email: string; deptId: string; subject: string }) => Promise<void>;
}) {
  const [name,    setName]    = useState("");
  const [email,   setEmail]   = useState("");
  const [deptId,  setDeptId]  = useState("");
  const [subject, setSubject] = useState("");
  const [busy,    setBusy]    = useState(false);
  const [err,     setErr]     = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await onStart({ name: name.trim(), email: email.trim(), deptId, subject: subject.trim() }); }
    catch { setErr("Something went wrong. Please try again."); setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 h-full overflow-y-auto p-5">
      <div className="text-center mb-1">
        <p className="text-sm font-semibold text-gray-800">Start a conversation</p>
        <p className="text-xs text-gray-500 mt-0.5">We typically reply in under 2 minutes.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="flex items-center gap-1 text-[11px] font-semibold text-gray-600 mb-1">
            <User className="w-3 h-3" /> Name *
          </label>
          <input required value={name} onChange={e => setName(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            placeholder="Your name" />
        </div>
        <div>
          <label className="flex items-center gap-1 text-[11px] font-semibold text-gray-600 mb-1">
            <AtSign className="w-3 h-3" /> Email
          </label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            placeholder="you@example.com" />
        </div>
      </div>

      {depts.length > 0 && (
        <div>
          <label className="flex items-center gap-1 text-[11px] font-semibold text-gray-600 mb-1">
            <Tag className="w-3 h-3" /> Department
          </label>
          <div className="relative">
            <select value={deptId} onChange={e => setDeptId(e.target.value)}
              className="w-full appearance-none border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400">
              <option value="">General Support</option>
              {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      )}

      <div>
        <label className="flex items-center gap-1 text-[11px] font-semibold text-gray-600 mb-1">
          <FileText className="w-3 h-3" /> How can we help? *
        </label>
        <textarea required value={subject} onChange={e => setSubject(e.target.value)} rows={3}
          className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-400"
          placeholder="Briefly describe your question or issue…" />
      </div>

      {err && <p className="text-rose-500 text-xs text-center">{err}</p>}

      <button type="submit" disabled={busy || !name.trim() || !subject.trim()}
        className="flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors mt-auto">
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
  const posLabel  = position === 1 ? "You're next!" : `#${position} in queue`;
  const waitLabel = estimatedWaitMin == null ? "Calculating…"
    : estimatedWaitMin <= 1 ? "< 1 minute"
    : `~${estimatedWaitMin} min`;

  return (
    <div className="flex flex-col items-center gap-4 p-5 text-center h-full">
      <div className="relative mt-4">
        <div className="w-16 h-16 rounded-full border-4 border-violet-100 border-t-violet-600 animate-spin" />
        <Clock className="w-6 h-6 text-violet-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      </div>
      <div>
        <p className="text-sm font-bold text-gray-900">You're in the queue</p>
        <p className="text-xs text-gray-500 mt-0.5">An agent will be with you shortly</p>
      </div>
      <div className="w-full bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-violet-600 font-medium">Position</span><span className="font-bold text-violet-700">{posLabel}</span></div>
        <div className="h-px bg-violet-100" />
        <div className="flex justify-between"><span className="text-violet-600 font-medium">Est. wait</span><span className="font-bold text-violet-700">{waitLabel}</span></div>
      </div>
      {subject && (
        <div className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-left">
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">Your issue</p>
          <p className="text-xs text-gray-700 line-clamp-2">{subject}</p>
        </div>
      )}
      <p className="text-[11px] text-gray-400 leading-relaxed">Keep this window open — you'll be connected automatically.</p>
    </div>
  );
}

// ─── Active chat messages area ────────────────────────────────────────────────
function ChatMessages({ messages, agentName, agentTyping, visitorName, onSend }: {
  messages: Message[]; agentName: string; agentTyping: boolean;
  visitorName: string; onSend: (t: string) => void;
}) {
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, agentTyping]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t); setText("");
  };
  const keyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-gray-50">
        {messages.map((m, i) => {
          if (m.role === "system") {
            return (
              <div key={i} className="text-center">
                <span className="text-[11px] text-gray-400 bg-gray-200 rounded-full px-3 py-1">{m.content}</span>
              </div>
            );
          }
          const isVisitor = m.role === "visitor";
          return (
            <div key={i} className={`flex items-end gap-1.5 ${isVisitor ? "justify-end" : "justify-start"}`}>
              {!isVisitor && (
                <div className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 text-[9px] font-bold flex-shrink-0 mb-0.5">
                  {agentName.charAt(0).toUpperCase()}
                </div>
              )}
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                isVisitor ? "bg-violet-600 text-white rounded-br-sm" : "bg-white text-gray-800 border border-gray-200 rounded-bl-sm"
              }`}>
                {!isVisitor && <div className="text-[9px] font-semibold text-violet-500 mb-0.5">{m.agentName}</div>}
                <p className="leading-relaxed whitespace-pre-wrap break-words text-[13px]">{m.content}</p>
                {m.timestamp && (
                  <div className={`text-[10px] mt-0.5 ${isVisitor ? "text-violet-200" : "text-gray-400"}`}>
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                )}
              </div>
              {isVisitor && (
                <div className="w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0 mb-0.5">
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
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-3 py-2.5">
              <div className="flex gap-1 items-center">
                {[0,1,2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="p-2.5 bg-white border-t border-gray-100 flex gap-2 items-end flex-shrink-0">
        <textarea
          value={text} onChange={e => setText(e.target.value)} onKeyDown={keyDown}
          rows={1} placeholder="Type a message…"
          className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          style={{ minHeight: "38px", maxHeight: "96px" }}
        />
        <button onClick={send} disabled={!text.trim()}
          className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white transition-colors">
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </>
  );
}

// ─── Rating screen ────────────────────────────────────────────────────────────
function RatingScreen({ chatId, agentName, onDone }: {
  chatId: string; agentName: string; onDone: () => void;
}) {
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

  if (saved) return (
    <div className="flex flex-col items-center gap-4 p-6 text-center h-full justify-center">
      <CheckCircle2 className="w-14 h-14 text-emerald-500" />
      <p className="text-sm font-bold text-gray-900">Thank you for the feedback!</p>
    </div>
  );

  return (
    <div className="flex flex-col items-center gap-4 p-5 text-center h-full overflow-y-auto">
      <div className="mt-4">
        <p className="text-sm font-bold text-gray-900">How did we do?</p>
        <p className="text-xs text-gray-500 mt-0.5">Rate your chat{agentName !== "Support Agent" ? ` with ${agentName}` : ""}</p>
      </div>
      <div className="flex gap-2">
        {[1,2,3,4,5].map(n => (
          <button key={n} onClick={() => setRating(n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
            className={`w-10 h-10 rounded-xl transition-all ${(hover || rating) >= n ? "bg-amber-400 text-white scale-110 shadow-md" : "bg-gray-100 text-gray-300 hover:bg-amber-100"}`}>
            <Star className="w-5 h-5 mx-auto" fill={(hover || rating) >= n ? "white" : "none"} />
          </button>
        ))}
      </div>
      {(hover || rating) > 0 && <p className="text-xs font-semibold text-amber-500 -mt-2">{LABELS[hover || rating]}</p>}
      <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2}
        placeholder="Tell us more (optional)…"
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-400" />
      <div className="flex gap-2 w-full mt-auto">
        <button onClick={onDone} className="flex-1 border border-gray-200 text-gray-500 text-sm py-2 rounded-xl hover:bg-gray-50 transition">Skip</button>
        <button onClick={submit} disabled={!rating || busy}
          className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold text-sm py-2 rounded-xl transition flex items-center justify-center gap-1.5">
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Submit
        </button>
      </div>
    </div>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────
export default function CustomerChatPage() {
  const location = useLocation();

  // Only show on /contact — hide everywhere else
  const hidden = !location.pathname.startsWith("/contact");
  if (hidden) return null;

  return <ChatWidgetInner />;
}

function ChatWidgetInner() {
  const [open,        setOpen]        = useState(false);
  const [unread,      setUnread]      = useState(0);
  const [pulse,       setPulse]       = useState(false);

  const [step,        setStep]        = useState<Step>("form");
  const [depts,       setDepts]       = useState<Dept[]>([]);
  const [chatId,      setChatId]      = useState("");
  const [queuePos,    setQueuePos]    = useState(1);
  const [estWait,     setEstWait]     = useState<number | null>(null);
  const [messages,    setMessages]    = useState<Message[]>([]);
  const [agentName,   setAgentName]   = useState("Support Agent");
  const [agentTyping, setAgentTyping] = useState(false);
  const [subject,     setSubject]     = useState("");
  const [visitorName, setVisitorName] = useState("");
  const [confirmEnd,  setConfirmEnd]  = useState(false);

  const wsRef        = useRef<WebSocket | null>(null);
  const typingTimer  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const terminalRef  = useRef(false);
  const reconnectTmr = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const openRef      = useRef(open);
  openRef.current = open;

  // Load departments
  useEffect(() => {
    fetch("/api/live-chat/departments", { credentials: "include" })
      .then(r => r.json()).then(d => setDepts(d.departments ?? [])).catch(() => {});
  }, []);

  // Restore in-progress chat
  useEffect(() => {
    const stored = localStorage.getItem("certxa_chat");
    if (!stored) return;
    try {
      const { chatId: cid, step: s, subject: sub, visitorName: vn } = JSON.parse(stored);
      if (cid && (s === "queue" || s === "chat")) {
        setChatId(cid);
        if (sub) setSubject(sub);
        if (vn)  setVisitorName(vn);
        connectWs(cid);
        setStep(s);
        setOpen(true);
      }
    } catch {}
  }, []);

  const connectWs = useCallback((cid: string) => {
    clearTimeout(reconnectTmr.current);
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
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
          setStep(prev => {
            if (prev !== "chat") {
              setMessages(p => [...p, { role: "system", content: `${msg.agentName ?? "Support"} joined the chat` }]);
              localStorage.setItem("certxa_chat", JSON.stringify({ chatId: cid, step: "chat" }));
            }
            return "chat";
          });
        } else if (msg.type === "message") {
          setMessages(prev => [...prev, { role: "agent", content: msg.content, agentName: msg.agentName, timestamp: msg.timestamp }]);
          setAgentTyping(false);
          // Badge unread count when minimized
          if (!openRef.current) {
            setUnread(n => n + 1);
            setPulse(true);
            setTimeout(() => setPulse(false), 1200);
          }
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
          terminalRef.current = true;
          setMessages(prev => [...prev, { role: "system", content: "Chat ended by agent" }]);
          localStorage.removeItem("certxa_chat");
          setTimeout(() => setStep("rating"), 1200);
        }
      } catch {}
    };

    ws.onclose = () => {
      if (terminalRef.current) return;
      reconnectTmr.current = setTimeout(() => { if (!terminalRef.current) connectWs(cid); }, 4_000);
    };

    const hb = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
    }, 25_000);
    ws.addEventListener("close", () => clearInterval(hb));
  }, []);

  const handleStart = async ({ name, email, deptId, subject: sub }: {
    name: string; email: string; deptId: string; subject: string;
  }) => {
    const r = await fetch("/api/live-chat/start", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorName: name, visitorEmail: email, departmentId: deptId || undefined, subject: sub, pageUrl: location.href }),
    });
    if (!r.ok) throw new Error("Failed");
    const data = await r.json();
    const cid  = data.chatId;
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

  const handleEnd = () => {
    wsRef.current?.close();
    localStorage.removeItem("certxa_chat");
    setConfirmEnd(false);
    setStep("rating");
  };

  const handleOpen = () => {
    setOpen(true);
    setUnread(0);
  };

  // Allow other pages (e.g. /contact) to open this widget via a custom event
  useEffect(() => {
    const listener = () => { setOpen(true); setUnread(0); };
    window.addEventListener("certxa:open-chat", listener);
    return () => window.removeEventListener("certxa:open-chat", listener);
  }, []);

  const handleDone = () => {
    setStep("form");
    setMessages([]);
    setChatId("");
    setSubject("");
    setVisitorName("");
    terminalRef.current = false;
    setOpen(false);
  };

  const panelTitle =
    step === "queue" ? "Waiting for agent…" :
    step === "chat"  ? agentName :
    step === "rating" || step === "done" ? "Rate your experience" :
    "Certxa Support";

  const panelSubtitle =
    step === "chat"   ? "Certxa Support · Online" :
    step === "queue"  ? "Certxa Support" :
    "We're here to help";

  return (
    <>
      {/* ── Floating panel ── */}
      <div
        className="fixed bottom-[88px] right-5 z-[9999] flex flex-col bg-white rounded-2xl shadow-2xl shadow-violet-200/60 overflow-hidden border border-gray-100"
        style={{
          width: 360,
          height: 540,
          transformOrigin: "bottom right",
          transform: open ? "scale(1)" : "scale(0.85)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "transform 200ms cubic-bezier(.4,0,.2,1), opacity 180ms ease",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-violet-700 to-purple-700 flex-shrink-0">
          {step === "chat" ? (
            <div className="relative flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-sm font-bold">
                {agentName.charAt(0).toUpperCase()}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-violet-700" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-white" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold leading-tight truncate">{panelTitle}</p>
            <p className="text-violet-200 text-[11px] truncate">{panelSubtitle}</p>
          </div>
          <div className="flex items-center gap-1">
            {step === "chat" && (
              <button onClick={() => setConfirmEnd(true)} title="End chat"
                className="text-violet-200 hover:text-white transition p-1 rounded text-[11px] font-medium px-1.5">
                End
              </button>
            )}
            <button onClick={() => setOpen(false)} title="Minimize"
              className="text-violet-200 hover:text-white transition p-1 rounded">
              <Minus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* End-chat confirm overlay */}
        {confirmEnd && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl p-5 mx-4 shadow-2xl text-center max-w-xs">
              <p className="font-bold text-gray-900 mb-1">End this chat?</p>
              <p className="text-xs text-gray-500 mb-4">You'll have a chance to rate your experience.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmEnd(false)}
                  className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-xl text-sm hover:bg-gray-50 transition">
                  Keep chatting
                </button>
                <button onClick={handleEnd}
                  className="flex-1 bg-rose-500 hover:bg-rose-600 text-white py-2 rounded-xl text-sm font-semibold transition">
                  End chat
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {step === "form"   && <IntroForm depts={depts} onStart={handleStart} />}
          {step === "queue"  && <QueueScreen position={queuePos} estimatedWaitMin={estWait} subject={subject} />}
          {step === "chat"   && (
            <ChatMessages
              messages={messages} agentName={agentName} agentTyping={agentTyping}
              visitorName={visitorName || "You"} onSend={handleSend}
            />
          )}
          {step === "rating" && <RatingScreen chatId={chatId} agentName={agentName} onDone={() => setStep("done")} />}
          {step === "done"   && (
            <div className="flex flex-col items-center gap-4 p-6 text-center h-full justify-center">
              <CheckCircle2 className="w-14 h-14 text-violet-500" />
              <div>
                <p className="text-sm font-bold text-gray-900">Thanks for reaching out!</p>
                <p className="text-xs text-gray-500 mt-1">We hope we resolved your issue.</p>
              </div>
              <button onClick={handleDone}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white font-semibold py-2.5 rounded-xl text-sm transition mt-2">
                Close
              </button>
            </div>
          )}
        </div>

        {/* Powered-by footer */}
        <div className="px-4 py-1.5 bg-gray-50 border-t border-gray-100 flex-shrink-0 text-center">
          <span className="text-[10px] text-gray-400">Powered by <span className="font-semibold text-violet-500">Certxa</span></span>
        </div>
      </div>

      {/* ── Launcher button ── */}
      <button
        onClick={open ? () => setOpen(false) : handleOpen}
        className={`fixed bottom-5 right-5 z-[9999] w-14 h-14 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 hover:from-violet-700 hover:to-purple-800 text-white shadow-xl shadow-violet-400/40 flex items-center justify-center transition-all duration-200 ${pulse ? "scale-110" : "scale-100"}`}
        title={open ? "Minimize chat" : "Chat with support"}
      >
        <div
          style={{
            transform: open ? "scale(1) rotate(0deg)" : "scale(1) rotate(0deg)",
            transition: "opacity 150ms",
          }}
        >
          {open ? <Minus className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
        </div>

        {/* Unread badge */}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center px-1 shadow-lg">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </>
  );
}
