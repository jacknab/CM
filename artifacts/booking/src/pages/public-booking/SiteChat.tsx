/**
 * The chat bubble on a Certxa Pro business's website (owner, 2026-11-07; plans/pro-messages.md): bottom right, above the
 * sticky booking bar, shown while the pro has "Available for live chat" on in the app. It opens a chat with the pro:
 * name, e-mail and the first message, then the live conversation (components/chat/ChatThread.tsx — Online now / Away,
 * typing, the chime). This browser remembers the conversation, so a visitor coming back carries on where they were.
 * Spam: the same protections as the message form (hidden field, timer, reCAPTCHA — routes/proMessages.ts).
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, X } from "lucide-react";
import ChatThread from "@/components/chat/ChatThread";
import { RecaptchaNotice, recaptchaToken, useRecaptcha } from "@/lib/recaptcha";
import type { StoreData } from "./types";

const ACCENT = "var(--site-accent, #B45309)";
const keyFor = (slug: string) => `certxa.chat.${slug}`;
const readLink = (slug: string) => { try { return localStorage.getItem(keyFor(slug)); } catch { return null; } };
const saveLink = (slug: string, link: string | null) => { try { if (link) localStorage.setItem(keyFor(slug), link); else localStorage.removeItem(keyFor(slug)); } catch { /* private mode */ } };

export default function SiteChat({ store, slug, raised }: { store: StoreData; slug: string; raised: boolean }) {
  const [status, setStatus] = useState<{ available: boolean; online: boolean } | null>(null);
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(() => readLink(slug));

  // Whether to show the bubble (the pro's switch) and the green dot; checked again every minute.
  useEffect(() => {
    let live = true;
    const check = () => fetch(`/api/public/store/${encodeURIComponent(slug)}/chat`).then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (live && s) setStatus({ available: !!s.available, online: !!s.online }); }).catch(() => undefined);
    void check();
    const t = setInterval(check, 60_000);
    return () => { live = false; clearInterval(t); };
  }, [slug]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // A conversation already going stays reachable even if the pro turns the switch off meanwhile.
  if (!status?.available && !link) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Chat with ${store.name}`}
          data-testid="site-chat-bubble"
          className="fixed right-4 z-[90] grid h-14 w-14 place-items-center rounded-full text-white shadow-lg transition-transform hover:scale-105"
          style={{ background: ACCENT, bottom: raised ? 96 : 20 }}
        >
          <MessageCircle className="h-6 w-6" aria-hidden="true" />
          {status?.online && <span className="absolute right-0.5 top-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-green-500" data-testid="site-chat-online" />}
        </button>
      )}
      {open && (
        <div
          role="dialog"
          aria-label={`Chat with ${store.name}`}
          data-testid="site-chat-panel"
          // Computers: a box in the corner, kept above the booking bar like the bubble. Phones: a sheet from the bottom.
          className={`fixed inset-x-0 bottom-0 z-[95] flex h-[85vh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl md:inset-x-auto md:right-4 md:h-[600px] md:w-[380px] md:rounded-2xl ${raised ? "md:bottom-24 md:max-h-[calc(100vh-7rem)]" : "md:bottom-4 md:max-h-[calc(100vh-2rem)]"}`}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 text-white" style={{ background: ACCENT }}>
            <span className="truncate text-sm font-semibold">Chat with {store.name}</span>
            <div className="flex shrink-0 items-center gap-1">
              {link && (
                <button type="button" onClick={() => { saveLink(slug, null); setLink(null); }} className="rounded-full px-2.5 py-1 text-xs font-medium hover:bg-white/15" data-testid="site-chat-new">
                  New chat
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} aria-label="Close chat" className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/15" data-testid="site-chat-close">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            {link
              ? <ChatThread token={link} variant="panel" />
              : <StartChat store={store} slug={slug} online={!!status?.online} onStarted={(l) => { saveLink(slug, l); setLink(l); }} />}
          </div>
        </div>
      )}
    </>
  );
}

function StartChat({ store, slug, online, onStarted }: { store: StoreData; slug: string; online: boolean; onStarted: (link: string) => void }) {
  const startedAt = useRef(Date.now());
  const siteKey = useRecaptcha();
  const [form, setForm] = useState({ name: "", email: "", message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentWithoutChat, setSentWithoutChat] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => { setError(""); setForm((f) => ({ ...f, [k]: e.target.value })); };

  const send = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (busy) return;
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) { setError("Enter your name, e-mail and message."); return; }
    setBusy(true); setError("");
    try {
      const token = await recaptchaToken(siteKey, "message");
      const res = await fetch(`/api/public/store/${encodeURIComponent(slug)}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, startedAt: startedAt.current, ...(token ? { recaptchaToken: token } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Your message could not be sent. Please try again.");
      if (typeof data?.link === "string") onStarted(data.link);
      else setSentWithoutChat(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your message could not be sent. Please try again.");
    } finally { setBusy(false); }
  };

  if (sentWithoutChat) {
    return <p className="p-6 text-center text-sm text-gray-600" data-testid="site-chat-sent">Message sent. {store.name} will answer by e-mail.</p>;
  }
  const input = "w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-gray-900";
  return (
    <form onSubmit={send} noValidate className="flex h-full flex-col overflow-y-auto bg-gray-50 p-4" data-testid="site-chat-start">
      <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500" data-testid="site-chat-presence">
        {online
          ? <><span className="h-2 w-2 rounded-full bg-green-500" aria-hidden="true" />Online now</>
          : <><span className="h-2 w-2 rounded-full bg-gray-300" aria-hidden="true" />Away · you'll get the answer by e-mail</>}
      </p>
      <p className="mt-2 text-sm text-gray-700">Hi! Send {store.name} a message{online ? " and chat right here." : "."}</p>
      <div className="mt-4 space-y-3">
        <input aria-label="Name" placeholder="Name" value={form.name} onChange={set("name")} maxLength={100} autoComplete="name" className={input} data-testid="site-chat-name" />
        <input aria-label="Email" placeholder="Email" type="email" value={form.email} onChange={set("email")} maxLength={254} autoComplete="email" className={input} data-testid="site-chat-email" />
        <textarea aria-label="Message" placeholder="Message" value={form.message} onChange={set("message")} maxLength={5000} rows={4} className={input} data-testid="site-chat-text" />
        {/* Spam trap: hidden from people (and screen readers); a bot fills it in. */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
          <input tabIndex={-1} autoComplete="off" name="website" value={form.website} onChange={set("website")} />
        </div>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white disabled:opacity-60" style={{ background: ACCENT }} data-testid="site-chat-send">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}Start chat
        </button>
        {siteKey && <RecaptchaNotice />}
      </div>
    </form>
  );
}
