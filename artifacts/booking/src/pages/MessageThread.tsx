/**
 * A client's conversation with a Certxa Pro business (owner, 2026-11-07; plans/pro-messages.md): certxa.com/msg/<code>,
 * the link in the e-mails. The client reads the business's answers and writes back; it reaches the pro's inbox in the
 * app. No sign-in: the code in the link is the key (routes/proMessages.ts).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

type Thread = { business: string; subject: string; clientName: string; messages: { sender: "client" | "pro"; body: string; createdAt: string }[] };

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function MessageThread() {
  const { token = "" } = useParams();
  const [thread, setThread] = useState<Thread | null>(null);
  const [failed, setFailed] = useState("");
  const [text, setText] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentNote, setSentNote] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/public/messages/${encodeURIComponent(token)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setFailed(data?.error || "This conversation could not be opened."); return; }
    setThread(data);
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [thread?.messages.length]);

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setError(""); setSentNote(false);
    try {
      const res = await fetch(`/api/public/messages/${encodeURIComponent(token)}/reply`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text.trim(), website }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Your message could not be sent. Please try again.");
      setText(""); setSentNote(true);
      await load();
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
        </div>
      </header>
      <div className="mx-auto w-full max-w-2xl flex-1 space-y-3 px-5 py-6" data-testid="msg-list">
        {thread.messages.map((m, i) => (
          <div key={i} className={`flex ${m.sender === "client" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.sender === "client" ? "bg-gray-900 text-white" : "border border-gray-200 bg-white"}`}>
              <p className={`mb-1 text-xs font-semibold ${m.sender === "client" ? "text-gray-300" : "text-gray-500"}`}>{m.sender === "client" ? "You" : thread.business} · {when(m.createdAt)}</p>
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{m.body}</p>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="sticky bottom-0 border-t border-gray-200 bg-white px-5 py-4">
        <div className="mx-auto max-w-2xl space-y-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={5000} placeholder={`Write to ${thread.business}`}
            className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-[15px] outline-none focus:border-gray-900" data-testid="msg-text" />
          {/* Spam trap: hidden from people; a bot fills it in. */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
            <input tabIndex={-1} autoComplete="off" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          {sentNote && <p className="text-sm text-gray-500" data-testid="msg-sent">Sent. You'll get an e-mail when {thread.business} answers.</p>}
          <button type="button" onClick={send} disabled={busy || !text.trim()} className="flex w-full items-center justify-center gap-2 rounded-full bg-gray-900 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50" data-testid="msg-send">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}Send
          </button>
        </div>
      </div>
    </main>
  );
}
