/**
 * "Send a message" on a Certxa Pro business's website (owner, 2026-11-07; plans/pro-messages.md). A sheet over the site
 * in the site's own look (owner: not a separate full page): it slides up from the bottom on a phone and sits in the
 * middle on a computer, with the site dimmed behind it. Opened by any link to #message (the Contact tab and menu
 * link), so <slug>.certxa.com/#message can be shared. The message reaches the pro's inbox in the app; the client gets
 * an e-mail with a link to the conversation.
 * Spam: a hidden field people never see, the time the form was opened and Google reCAPTCHA v3 (routes/proMessages.ts).
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { StoreData } from "./types";
import { RecaptchaNotice, recaptchaToken, useRecaptcha } from "@/lib/recaptcha";

/** The Solo theme's colours (SoloTheme.tsx C); the accent is the site's own (--site-accent, SiteLook.tsx). */
const LOOK = {
  accent: "var(--site-accent, #B45309)",
  paper: "#FDFCFA",
  line: "#EDE8DF",
  ink: "#1A1814",
  soft: "#6B6560",
  heading: "'Playfair Display', Georgia, serif",
};

/** "(602) 555-0111" for a US number, else as saved. */
const phoneText = (p?: string | null) => {
  const d = String(p ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(p ?? "").trim();
};

const isOpenHash = () => typeof window !== "undefined" && window.location.hash === "#message";

export default function SiteMessage({ store, slug }: { store: StoreData; slug: string }) {
  const [open, setOpen] = useState(isOpenHash);
  useEffect(() => {
    const on = () => setOpen(isOpenHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const close = () => { setOpen(false); window.history.replaceState(null, "", window.location.pathname + window.location.search); };
  // While it's open: Esc closes it, and the site behind it doesn't scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 md:items-center md:p-6" data-testid="site-message-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div role="dialog" aria-modal="true" aria-label="Send a message" data-testid="site-message"
        className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl px-6 pb-8 pt-6 shadow-2xl md:max-w-lg md:rounded-3xl md:px-8"
        style={{ background: LOOK.paper, color: LOOK.ink }}>
        {/* A grab handle on phones, as a sheet has */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full md:hidden" style={{ background: LOOK.line }} aria-hidden="true" />
        <button type="button" onClick={close} aria-label="Close" data-testid="site-message-close"
          className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full hover:bg-black/5" style={{ color: LOOK.soft }}>
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <MessageForm store={store} slug={slug} onDone={close} />
      </div>
    </div>
  );
}

function MessageForm({ store, slug, onDone }: { store: StoreData; slug: string; onDone: () => void }) {
  const startedAt = useRef(Date.now());
  const siteKey = useRecaptcha();
  const [form, setForm] = useState({ name: "", email: "", message: "", website: "" });
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
      const token = await recaptchaToken(siteKey, "message");
      const res = await fetch(`/api/public/store/${encodeURIComponent(slug)}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, startedAt: startedAt.current, ...(token ? { recaptchaToken: token } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Your message could not be sent. Please try again.");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your message could not be sent. Please try again.");
    } finally { setBusy(false); }
  };

  const heading = "text-center text-[26px] font-semibold";
  const button = "flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-semibold text-white shadow-sm disabled:opacity-60";

  if (sent) {
    return (
      <div className="py-4 text-center" data-testid="site-message-sent">
        <h2 className={heading} style={{ fontFamily: LOOK.heading }}>Message sent</h2>
        <p className="mt-3 text-[15px] leading-relaxed" style={{ color: LOOK.soft }}>
          {store.name} will answer by e-mail. We sent a copy to <strong style={{ color: LOOK.ink }}>{form.email.trim()}</strong> with a link to your conversation.
        </p>
        <button type="button" onClick={onDone} className={`${button} mt-7`} style={{ background: LOOK.accent }}>Back to the website</button>
      </div>
    );
  }

  const input = "w-full rounded-2xl border bg-white px-4 py-3.5 text-[15px] outline-none transition-colors placeholder:text-[#8A847E] focus:border-[var(--site-accent,#B45309)]";
  const inputStyle = { borderColor: LOOK.line, color: LOOK.ink };
  return (
    <form onSubmit={send} noValidate>
      <h2 className={heading} style={{ fontFamily: LOOK.heading }}>Send a message</h2>
      <p className="mt-1 text-center text-sm" style={{ color: LOOK.soft }}>to {store.name}. You'll get the answer by e-mail.</p>
      {phoneText(store.phone) && (
        <p className="mt-2 text-center text-[15px]" style={{ color: LOOK.soft }} data-testid="site-message-phone-number">
          Or call <a href={`tel:${store.phone}`} className="font-semibold underline underline-offset-2" style={{ color: LOOK.ink }}>{phoneText(store.phone)}</a>
        </p>
      )}
      <div className="mt-6 space-y-3.5">
        {/* Three fields, the name inside each (owner, 2026-11-07). The subject is the start of the message (server). */}
        <input aria-label="Name" placeholder="Name" value={form.name} onChange={set("name")} maxLength={100} autoComplete="name" className={input} style={inputStyle} data-testid="site-message-name" />
        <input aria-label="Email" placeholder="Email" type="email" value={form.email} onChange={set("email")} maxLength={254} autoComplete="email" className={input} style={inputStyle} data-testid="site-message-email" />
        <textarea aria-label="Message" placeholder="Message" value={form.message} onChange={set("message")} maxLength={5000} rows={5} className={input} style={inputStyle} data-testid="site-message-text" />
        {/* Spam trap: hidden from people (and screen readers); a bot fills it in. */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
          <label>Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} name="website" /></label>
        </div>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <button type="submit" disabled={busy} className={`${button} mt-1`} style={{ background: LOOK.accent }} data-testid="site-message-send">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}Send message
        </button>
        {siteKey && <RecaptchaNotice />}
      </div>
    </form>
  );
}
