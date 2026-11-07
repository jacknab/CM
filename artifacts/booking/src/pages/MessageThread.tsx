/**
 * A client's conversation with a Certxa Pro business (owner, 2026-11-07; plans/pro-messages.md): certxa.com/msg/<code>,
 * the link in the e-mails. The client reads the business's answers and writes back; it reaches the pro's inbox in the
 * app. No sign-in: the code in the link is the key (routes/proMessages.ts).
 * Live (lib/proMessagesLive.ts on the server): while the pro has the app open the page says "Online now", their answers
 * come straight in, and each side sees when the other is typing. Away, answers come by e-mail as before.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { RecaptchaNotice, recaptchaToken, useRecaptcha } from "@/lib/recaptcha";

type Message = { id?: number; sender: "client" | "pro"; body: string; createdAt: string };
type Thread = { business: string; subject: string; clientName: string; messages: Message[]; proOnline?: boolean };

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
/** The chime when the business's message comes in (owner, 2026-11-07): the Certxa Pro app's own sound. */
const CHIME_URL = "/api/public/sounds/message-chime.wav";
/** Typing goes out at most this often while the client types, and stops after this long without a key. */
const TYPING_EVERY_MS = 2_500, TYPING_IDLE_MS = 4_000;

export default function MessageThread() {
  const { token = "" } = useParams();
  const [thread, setThread] = useState<Thread | null>(null);
  const [failed, setFailed] = useState("");
  const [text, setText] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentNote, setSentNote] = useState(false);
  const [online, setOnline] = useState(false);
  const [proTyping, setProTyping] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const siteKey = useRecaptcha();
  const sock = useRef<WebSocket | null>(null);
  const typingSent = useRef(0);
  const typingStop = useRef<ReturnType<typeof setTimeout> | null>(null);
  const proTypingOff = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Browsers only play sound on a page the person has touched; any later message then chimes. Blocked: silent.
  const chime = useRef<HTMLAudioElement | null>(null);
  useEffect(() => { chime.current = new Audio(CHIME_URL); chime.current.preload = "auto"; }, []);
  const playChime = useCallback(() => {
    const a = chime.current;
    if (!a) return;
    try { a.currentTime = 0; void a.play().catch(() => undefined); } catch { /* no sound */ }
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/public/messages/${encodeURIComponent(token)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setFailed(data?.error || "This conversation could not be opened."); return; }
    setThread(data);
    setOnline(!!data.proOnline);
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [thread?.messages.length, proTyping]);

  /** A message once: by its id (live and loaded copies of the same message meet here). */
  const addMessage = useCallback((m: Message) => setThread((t) => (!t || (m.id && t.messages.some((x) => x.id === m.id)) ? t : { ...t, messages: [...t.messages, m] })), []);

  // The live connection, opened again after a drop (and when the page comes back into view).
  useEffect(() => {
    if (!token) return;
    let closed = false, tries = 0, retry: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/pro-messages?as=client&link=${encodeURIComponent(token)}`);
      sock.current = ws;
      ws.onopen = () => { tries = 0; };
      ws.onmessage = (ev) => {
        let e: any; try { e = JSON.parse(String(ev.data)); } catch { return; }
        if (e.type === "presence") setOnline(!!e.online);
        else if (e.type === "typing") {
          setProTyping(!!e.on);
          if (proTypingOff.current) clearTimeout(proTypingOff.current);
          if (e.on) proTypingOff.current = setTimeout(() => setProTyping(false), TYPING_IDLE_MS + 2_000); // if the "stopped" is lost
        } else if (e.type === "message" && e.message) { setProTyping(false); addMessage(e.message); playChime(); }
      };
      ws.onclose = (ev) => {
        if (sock.current === ws) sock.current = null;
        if (closed || ev.code === 4004) return;
        retry = setTimeout(connect, Math.min(30_000, 1_000 * 2 ** tries++));
      };
    };
    connect();
    const onVisible = () => { if (document.visibilityState === "visible" && !sock.current) { if (retry) clearTimeout(retry); tries = 0; connect(); void load(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => { closed = true; if (retry) clearTimeout(retry); document.removeEventListener("visibilitychange", onVisible); sock.current?.close(); };
  }, [token, addMessage, load, playChime]);

  const sendTyping = (on: boolean) => {
    const ws = sock.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "typing", on }));
  };
  const onType = (value: string) => {
    setText(value);
    const now = Date.now();
    if (value.trim() && now - typingSent.current > TYPING_EVERY_MS) { typingSent.current = now; sendTyping(true); }
    if (typingStop.current) clearTimeout(typingStop.current);
    typingStop.current = setTimeout(() => { typingSent.current = 0; sendTyping(false); }, TYPING_IDLE_MS);
  };

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setError(""); setSentNote(false);
    if (typingStop.current) clearTimeout(typingStop.current);
    typingSent.current = 0; sendTyping(false);
    try {
      const rc = await recaptchaToken(siteKey, "reply");
      const res = await fetch(`/api/public/messages/${encodeURIComponent(token)}/reply`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text.trim(), website, ...(rc ? { recaptchaToken: rc } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Your message could not be sent. Please try again.");
      setText(""); setSentNote(true);
      if (data?.message) addMessage(data.message); else await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your message could not be sent. Please try again.");
    } finally { setBusy(false); }
  };

  if (failed) return <main className="fixed inset-0 flex items-center justify-center bg-gray-50 px-6 text-center text-gray-700"><p>{failed}</p></main>;
  if (!thread) return <main className="fixed inset-0 flex items-center justify-center bg-gray-50"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></main>;

  return (
    <main className="fixed inset-0 flex flex-col overflow-y-auto bg-gray-50 text-gray-900">{/* fixed: the page is its own frame, no site padding */}
      <header className="border-b border-gray-200 bg-white px-5 py-4">
        <div className="mx-auto max-w-2xl">
          <p className="text-lg font-semibold" data-testid="msg-business">{thread.business}</p>
          <p className="truncate text-sm text-gray-500">{thread.subject}</p>
          {/* The pro's status (owner, 2026-11-07): the app open = online. */}
          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-gray-500" data-testid="msg-presence">
            {online
              ? <><span className="h-2 w-2 rounded-full bg-green-500" aria-hidden="true" />Online now</>
              : <><span className="h-2 w-2 rounded-full bg-gray-300" aria-hidden="true" />Away · you'll get the answer by e-mail</>}
          </p>
        </div>
      </header>
      <div className="mx-auto w-full max-w-2xl flex-1 space-y-3 px-5 py-6" data-testid="msg-list">
        {thread.messages.map((m, i) => (
          <div key={m.id ?? `i${i}`} className={`flex ${m.sender === "client" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.sender === "client" ? "bg-gray-900 text-white" : "border border-gray-200 bg-white"}`}>
              <p className={`mb-1 text-xs font-semibold ${m.sender === "client" ? "text-gray-300" : "text-gray-500"}`}>{m.sender === "client" ? "You" : thread.business} · {when(m.createdAt)}</p>
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{m.body}</p>
            </div>
          </div>
        ))}
        {proTyping && <p className="text-sm italic text-gray-500" data-testid="msg-typing">{thread.business} is typing…</p>}
        <div ref={end} />
      </div>
      <div className="sticky bottom-0 border-t border-gray-200 bg-white px-5 py-4">
        <div className="mx-auto max-w-2xl space-y-2">
          <textarea value={text} onChange={(e) => onType(e.target.value)} rows={3} maxLength={5000} placeholder={`Write to ${thread.business}`}
            className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-[15px] outline-none focus:border-gray-900" data-testid="msg-text" />
          {/* Spam trap: hidden from people; a bot fills it in. */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
            <input tabIndex={-1} autoComplete="off" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          {sentNote && <p className="text-sm text-gray-500" data-testid="msg-sent">{online ? "Sent." : `Sent. You'll get an e-mail when ${thread.business} answers.`}</p>}
          <button type="button" onClick={send} disabled={busy || !text.trim()} className="flex w-full items-center justify-center gap-2 rounded-full bg-gray-900 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50" data-testid="msg-send">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}Send
          </button>
          {siteKey && <RecaptchaNotice />}
        </div>
      </div>
    </main>
  );
}
