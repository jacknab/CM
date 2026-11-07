/**
 * "Send a message" on a Certxa Pro business's website (owner, 2026-11-07; plans/pro-messages.md). Opens as a full-screen
 * page over the site from any link to #message (like SiteLegal.tsx), so <slug>.certxa.com/#message can be shared.
 * The message reaches the pro's inbox in the app; the client gets an e-mail with a link to the conversation.
 * Spam: a hidden field people never see and the time the form was opened go with it (routes/proMessages.ts).
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { StoreData } from "./types";

const isOpenHash = () => typeof window !== "undefined" && window.location.hash === "#message";

export default function SiteMessage({ store, slug }: { store: StoreData; slug: string }) {
  const [open, setOpen] = useState(isOpenHash);
  useEffect(() => {
    const on = () => setOpen(isOpenHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  if (!open) return null;
  const close = () => { setOpen(false); window.history.replaceState(null, "", window.location.pathname + window.location.search); };
  return (
    <div role="dialog" aria-modal="true" aria-label="Send a message" data-testid="site-message" className="fixed inset-0 z-[200] overflow-y-auto bg-white text-gray-900">
      <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <span className="truncate text-sm font-semibold">{store.name}</span>
        <button type="button" onClick={close} aria-label="Close" data-testid="site-message-close" className="grid h-10 w-10 place-items-center"><X className="h-5 w-5" aria-hidden="true" /></button>
      </div>
      <div className="mx-auto w-full max-w-lg px-5 pb-16 pt-6">
        <MessageForm store={store} slug={slug} onDone={close} />
      </div>
    </div>
  );
}

function MessageForm({ store, slug, onDone }: { store: StoreData; slug: string; onDone: () => void }) {
  const startedAt = useRef(Date.now());
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => { setError(""); setForm((f) => ({ ...f, [k]: e.target.value })); };

  const send = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (busy) return;
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) { setError("Enter your name, e-mail and message."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/public/store/${encodeURIComponent(slug)}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, startedAt: startedAt.current }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Your message could not be sent. Please try again.");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your message could not be sent. Please try again.");
    } finally { setBusy(false); }
  };

  if (sent) {
    return (
      <div className="pt-6 text-center" data-testid="site-message-sent">
        <h1 className="text-2xl font-semibold">Message sent</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-gray-600">
          {store.name} will answer by e-mail. We sent a copy to <strong>{form.email.trim()}</strong> with a link to your conversation.
        </p>
        <button type="button" onClick={onDone} className="mt-8 rounded-full bg-gray-900 px-6 py-3 text-sm font-semibold text-white">Back to the website</button>
      </div>
    );
  }

  const input = "w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-[15px] outline-none focus:border-gray-900";
  return (
    <form onSubmit={send} noValidate>
      <h1 className="text-2xl font-semibold">Send a message</h1>
      <p className="mt-1 text-sm text-gray-500">to {store.name}. You'll get the answer by e-mail.</p>
      <div className="mt-6 space-y-4">
        <label className="block"><span className="mb-1 block text-sm font-medium">Your name</span>
          <input value={form.name} onChange={set("name")} maxLength={100} autoComplete="name" className={input} data-testid="site-message-name" /></label>
        <label className="block"><span className="mb-1 block text-sm font-medium">E-mail</span>
          <input type="email" value={form.email} onChange={set("email")} maxLength={254} autoComplete="email" className={input} data-testid="site-message-email" /></label>
        <label className="block"><span className="mb-1 block text-sm font-medium">Phone <span className="font-normal text-gray-400">(optional)</span></span>
          <input type="tel" value={form.phone} onChange={set("phone")} maxLength={30} autoComplete="tel" className={input} data-testid="site-message-phone" /></label>
        <label className="block"><span className="mb-1 block text-sm font-medium">Subject <span className="font-normal text-gray-400">(optional)</span></span>
          <input value={form.subject} onChange={set("subject")} maxLength={150} className={input} data-testid="site-message-subject" /></label>
        <label className="block"><span className="mb-1 block text-sm font-medium">Message</span>
          <textarea value={form.message} onChange={set("message")} maxLength={5000} rows={6} className={input} data-testid="site-message-text" /></label>
        {/* Spam trap: hidden from people (and screen readers); a bot fills it in. */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
          <label>Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} name="website" /></label>
        </div>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-full bg-gray-900 px-6 py-3 text-sm font-semibold text-white disabled:opacity-60" data-testid="site-message-send">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}Send message
        </button>
      </div>
    </form>
  );
}
