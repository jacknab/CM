/**
 * /contact — Public-facing contact form + overlay live-chat widget
 */
import { useState, useRef, useEffect } from "react";
import {
  MessageCircle, Mail, Send, CheckCircle2,
  Loader2, Clock, ChevronRight, Zap, X, Minus,
} from "lucide-react";
import ChatWidget from "@/components/ChatWidget";

export default function ContactPage() {
  const [name,       setName]       = useState("");
  const [email,      setEmail]      = useState("");
  const [subject,    setSubject]    = useState("");
  const [message,    setMessage]    = useState("");
  const [busy,       setBusy]       = useState(false);
  const [done,       setDone]       = useState(false);
  const [error,      setError]      = useState("");
  const [chatOpen,   setChatOpen]   = useState(false);
  const [chatMin,    setChatMin]    = useState(false);
  const [unread,     setUnread]     = useState(0);

  const startedAt    = useRef(Date.now());
  const textareaRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 300)}px`;
  }, [message]);

  function openChat() {
    setChatOpen(true);
    setChatMin(false);
    setUnread(0);
  }

  function handleNewAgentMessage() {
    if (chatMin) setUnread(n => n + 1);
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || done) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:            name.trim(),
          email:           email.trim(),
          subject:         subject.trim(),
          message:         message.trim(),
          company_website: "",
          _started:        startedAt.current,
        }),
      });
      const data = await res.json().catch(() => ({ success: false }));
      if (!res.ok || !data.success) throw new Error(data.error || "Failed");
      setDone(true);
    } catch {
      setError("Something went wrong. Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950">
      {/* Nav */}
      <nav className="px-6 py-4 flex items-center justify-between border-b border-white/5">
        <a href="/" className="flex items-center gap-2 text-white font-bold text-lg tracking-tight">
          <span className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center text-xs font-black">C</span>
          Certxa
        </a>
        <a href="/auth" className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition">
          Sign in <ChevronRight className="w-3.5 h-3.5" />
        </a>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-16 grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
        {/* Left: info */}
        <div className="space-y-10">
          <div>
            <div className="inline-flex items-center gap-2 bg-violet-600/20 border border-violet-500/30 rounded-full px-4 py-1.5 text-sm text-violet-300 font-semibold mb-5">
              <MessageCircle className="w-3.5 h-3.5" /> Support
            </div>
            <h1 className="text-4xl lg:text-5xl font-black text-white leading-tight tracking-tight">
              How can we<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-purple-400">
                help you?
              </span>
            </h1>
            <p className="mt-5 text-lg text-slate-400 leading-relaxed">
              Send us a message and our support team will get back to you,
              usually within a few hours.
            </p>
          </div>

          <div className="space-y-5">
            {[
              {
                icon: <Mail className="w-5 h-5 text-violet-400" />,
                label: "Email support",
                value: "support@certxa.com",
                sub:   "We reply within 4 business hours",
              },
              {
                icon: <Clock className="w-5 h-5 text-violet-400" />,
                label: "Business hours",
                value: "Mon – Fri, 9 am – 6 pm ET",
                sub:   "Weekend responses may be delayed",
              },
              {
                icon: <MessageCircle className="w-5 h-5 text-violet-400" />,
                label: "Live chat",
                value: "Available now",
                sub:   "Fastest way to reach us",
                onClick: openChat,
              },
            ].map(item => (
              <div key={item.label}
                onClick={item.onClick}
                className={`flex items-start gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-violet-500/40 transition ${item.onClick ? "cursor-pointer" : ""}`}>
                <div className="w-10 h-10 rounded-xl bg-violet-600/20 flex items-center justify-center flex-shrink-0">
                  {item.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">{item.label}</p>
                  <p className="text-white font-semibold mt-0.5">{item.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{item.sub}</p>
                </div>
                {item.onClick && <Zap className="w-4 h-4 text-violet-400 flex-shrink-0 mt-3" />}
              </div>
            ))}
          </div>

          {/* Live chat CTA */}
          <div className="rounded-2xl bg-gradient-to-r from-violet-600/20 to-purple-600/20 border border-violet-500/30 p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-violet-500 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-black">S</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm">Need help right now?</p>
              <p className="text-slate-400 text-xs mt-0.5">Start a live chat with our team — no wait, no bots.</p>
            </div>
            <button
              onClick={openChat}
              className="flex-shrink-0 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition">
              Chat now
            </button>
          </div>
        </div>

        {/* Right: form */}
        <div className="bg-white/[0.04] backdrop-blur-sm border border-white/10 rounded-3xl p-8">
          {done ? (
            <div className="flex flex-col items-center gap-6 py-12 text-center">
              <div className="w-20 h-20 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white">Message received!</h3>
                <p className="text-slate-400 mt-2 text-sm leading-relaxed max-w-xs mx-auto">
                  We've received your message and our team will be in touch shortly.
                </p>
              </div>
              <div className="flex flex-col gap-2 w-full max-w-xs">
                <a href="/" className="bg-violet-600 hover:bg-violet-700 text-white font-semibold py-2.5 rounded-xl text-sm text-center transition">
                  Back to Certxa
                </a>
                <button onClick={() => {
                  setDone(false); setName(""); setEmail(""); setSubject(""); setMessage("");
                  startedAt.current = Date.now();
                }} className="text-slate-500 hover:text-slate-300 text-sm py-2 transition">
                  Send another message
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div className="mb-6">
                <h2 className="text-xl font-bold text-white">Send a message</h2>
                <p className="text-slate-400 text-sm mt-1">We'll follow up by email.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Name</label>
                  <input value={name} onChange={e => setName(e.target.value)} maxLength={100}
                    placeholder="Your name"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                    Email <span className="text-rose-400">*</span>
                  </label>
                  <input required type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={255}
                    placeholder="you@example.com"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Subject</label>
                <input value={subject} onChange={e => setSubject(e.target.value)} maxLength={200}
                  placeholder="What is this about?"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
                  Message <span className="text-rose-400">*</span>
                </label>
                <textarea ref={textareaRef} required value={message} onChange={e => setMessage(e.target.value)}
                  minLength={10} maxLength={5000}
                  placeholder="Describe how we can help…"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-600 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition overflow-hidden"
                  style={{ minHeight: "120px" }} />
                <div className="flex justify-end mt-1">
                  <span className={`text-xs ${message.length > 4800 ? "text-rose-400" : "text-slate-600"}`}>
                    {message.length}/5000
                  </span>
                </div>
              </div>

              <div style={{ position: "absolute", left: "-9999px", top: "-9999px" }} aria-hidden="true">
                <label>Company website (do not fill this out)</label>
                <input type="text" name="company_website" tabIndex={-1} autoComplete="off" readOnly value="" onChange={() => {}} />
              </div>

              {error && (
                <p className="text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2.5">{error}</p>
              )}

              <button type="submit" disabled={busy || !email.trim() || !message.trim() || message.trim().length < 10}
                className="w-full flex items-center justify-center gap-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors text-sm">
                {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Send className="w-4 h-4" /> Send message</>}
              </button>

              <p className="text-center text-xs text-slate-600">
                By submitting this form you agree to our{" "}
                <a href="/privacy" className="text-slate-500 hover:text-slate-300 transition underline underline-offset-2">Privacy Policy</a>.
              </p>
            </form>
          )}
        </div>
      </div>

      {/* ── Live Chat Overlay Panel ──────────────────────────────────────────── */}
      <div
        aria-hidden={!chatOpen}
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: 360,
          maxHeight: "85vh",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 25px 60px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.07)",
          transformOrigin: "bottom right",
          transform: chatOpen && !chatMin ? "scale(1)" : "scale(0.88)",
          opacity: chatOpen && !chatMin ? 1 : 0,
          pointerEvents: chatOpen && !chatMin ? "auto" : "none",
          transition: "transform 220ms cubic-bezier(.4,0,.2,1), opacity 180ms ease",
        }}
      >
        {/* Panel header — matches GlossGenius style */}
        <div
          style={{
            background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            flexShrink: 0,
          }}
        >
          {/* Avatar / icon */}
          <div style={{
            width: 34, height: 34, borderRadius: "50%",
            background: "rgba(139,92,246,0.35)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <MessageCircle style={{ width: 16, height: 16, color: "#c4b5fd" }} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: "#fff", fontSize: 14, fontWeight: 700, lineHeight: 1.2, margin: 0 }}>
              Chat with Certxa Support
            </p>
            <p style={{ color: "#a5b4fc", fontSize: 11, margin: 0, marginTop: 1 }}>
              We're here to help
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {/* Minimise */}
            <button
              onClick={() => { setChatMin(true); }}
              title="Minimise"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "rgba(255,255,255,0.55)", padding: "4px 6px", borderRadius: 6,
                display: "flex", alignItems: "center",
                transition: "color 150ms",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.55)")}
            >
              <Minus style={{ width: 15, height: 15 }} />
            </button>
            {/* Close */}
            <button
              onClick={() => setChatOpen(false)}
              title="Close"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "rgba(255,255,255,0.55)", padding: "4px 6px", borderRadius: 6,
                display: "flex", alignItems: "center",
                transition: "color 150ms",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.55)")}
            >
              <X style={{ width: 15, height: 15 }} />
            </button>
          </div>
        </div>

        {/* Chat widget body */}
        <div style={{ flex: 1, overflowY: "auto", background: "#fff" }}>
          {chatOpen && (
            <ChatWidget
              onClose={() => setChatOpen(false)}
              showCloseButton={false}
              className="!rounded-none !shadow-none border-0"
              onNewAgentMessage={handleNewAgentMessage}
            />
          )}
        </div>
      </div>

      {/* Flash keyframe injected once */}
      <style>{`
        @keyframes certxa-bubble-flash {
          0%,100% { box-shadow: 0 8px 24px rgba(109,40,217,0.55); transform: scale(1); }
          25%      { box-shadow: 0 0 0 8px rgba(167,139,250,0.35), 0 8px 24px rgba(109,40,217,0.55); transform: scale(1.07); }
          50%      { box-shadow: 0 0 0 14px rgba(167,139,250,0.12), 0 8px 24px rgba(109,40,217,0.55); transform: scale(1.04); }
          75%      { box-shadow: 0 0 0 8px rgba(167,139,250,0.22), 0 8px 24px rgba(109,40,217,0.55); transform: scale(1.07); }
        }
        @keyframes certxa-badge-pop {
          0%   { transform: scale(0.6); opacity: 0; }
          60%  { transform: scale(1.25); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {/* Minimised bubble — show when chat is open but minimised */}
      {chatOpen && chatMin && (
        <button
          onClick={() => { setChatMin(false); setUnread(0); }}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 9999,
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #6d28d9, #7c3aed)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 24px rgba(109,40,217,0.55)",
            animation: unread > 0 ? "certxa-bubble-flash 1.1s ease-in-out infinite" : "none",
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.08)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
          aria-label={unread > 0 ? `${unread} new message${unread > 1 ? "s" : ""}` : "Open chat"}
        >
          <MessageCircle style={{ width: 24, height: 24, color: "#fff" }} />

          {/* Unread badge */}
          {unread > 0 && (
            <span style={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 20,
              height: 20,
              borderRadius: 10,
              background: "#ef4444",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 5px",
              border: "2px solid #fff",
              animation: "certxa-badge-pop 300ms cubic-bezier(.4,0,.2,1) both",
              lineHeight: 1,
            }}>
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
