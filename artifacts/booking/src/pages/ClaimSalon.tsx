/**
 * Claiming a salon page Certxa prepared (owner, 2026-11-10): certxa.com/claim/<token>, the one-time link Tom (the sales
 * line) texts the owner. Steps: 1 Certxa calls the salon's listed phone number and reads out a code, which proves the
 * salon is theirs; 2 they create their Certxa Salon login (or use the one they're signed in with, if it has no business
 * yet); 3 the prepared account moves over to it (api-server routes/salonClaim.ts, lib/salonClaim.ts).
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle, Loader2 } from "lucide-react";

type ClaimInfo = {
  state: "ready" | "verified" | "claimed" | "expired" | "invalid";
  message?: string;
  salon?: { name: string; address: string | null; phone: string | null; pageUrl: string };
  signedIn?: { email: string; canClaim: boolean } | null;
};

async function send<T = any>(path: string, body?: unknown, method = "POST"): Promise<T> {
  const res = await fetch(path, {
    method, credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || "Something went wrong. Please try again.");
  return data as T;
}

const input = "h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-[16px] text-gray-900 outline-none focus:border-gray-900";
const primary = "flex h-12 w-full items-center justify-center rounded-full bg-gray-900 text-[15px] font-semibold text-white disabled:opacity-40";

export default function ClaimSalon() {
  const { token = "" } = useParams();
  const [info, setInfo] = useState<ClaimInfo | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [called, setCalled] = useState(false);
  const [code, setCode] = useState("");
  // The new login.
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "", phone: "" });
  const [smsSent, setSmsSent] = useState(false);
  const [smsCode, setSmsCode] = useState("");
  const [done, setDone] = useState(false);

  const load = () => fetch(`/api/salon-claim/${encodeURIComponent(token)}`, { credentials: "include", cache: "no-store" })
    .then((r) => r.json()).then(setInfo).catch(() => setInfo({ state: "invalid" }));
  useEffect(() => { void load(); }, [token]);

  const run = async (fn: () => Promise<void>) => {
    setError(""); setBusy(true);
    try { await fn(); } catch (e: any) { setError(e?.message ?? "Something went wrong. Please try again."); } finally { setBusy(false); }
  };

  const callMe = () => run(async () => { await send(`/api/salon-claim/${token}/call`); setCalled(true); });
  const checkCode = () => run(async () => { await send(`/api/salon-claim/${token}/verify`, { code }); await load(); });
  const finish = () => run(async () => { await send(`/api/salon-claim/${token}/complete`); setDone(true); });
  const textCode = () => run(async () => {
    await send("/api/auth/owner-request-otp", { phone: form.phone, email: form.email.trim() });
    setSmsSent(true);
  });
  const createLogin = () => run(async () => {
    const { phoneToken } = await send<{ phoneToken: string }>("/api/auth/owner-verify-otp", { phone: form.phone, code: smsCode.trim() });
    await send("/api/auth/register", { ...form, email: form.email.trim(), phoneToken });
    await send(`/api/salon-claim/${token}/complete`);
    setDone(true);
  });

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const formReady = form.firstName.trim() && form.lastName.trim() && form.email.includes("@") && form.password.length >= 8 && form.phone.replace(/\D/g, "").length >= 10;

  const card = (children: React.ReactNode) => <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">{children}</div>;
  const salon = info?.salon;

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#F7F5FB] px-4 py-8">{/* fixed: no site header on this page */}
      <div className="mx-auto max-w-md space-y-5">
        <h1 className="text-2xl font-semibold text-gray-900">Claim your salon's page</h1>
        {salon && (
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-[17px] font-semibold text-gray-900">{salon.name}</p>
            {salon.address && <p className="text-sm text-gray-600">{salon.address}</p>}
            <a href={salon.pageUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm text-gray-700 underline">See the page</a>
          </div>
        )}

        {!info ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : done || info.state === "claimed" ? card(<>
          <div className="flex items-center gap-3">
            <CheckCircle className="h-7 w-7 shrink-0 text-gray-900" />
            <h2 className="text-lg font-semibold text-gray-900">{done ? "It's yours" : "This page has been claimed"}</h2>
          </div>
          <p className="text-sm text-gray-700">{done
            ? "The salon's page and account are now in your Certxa Salon account, on its free trial. Set your own services, prices and hours, and turn on online booking when you're ready."
            : "If that wasn't you, contact support@certxa.com."}</p>
          {done && <button type="button" className={primary} onClick={() => { window.location.href = "/dashboard"; }}>Go to my salon</button>}
        </>) : info.state === "expired" || info.state === "invalid" ? card(<>
          <h2 className="text-lg font-semibold text-gray-900">{info.state === "expired" ? "This link has expired" : "This link isn't valid"}</h2>
          <p className="text-sm text-gray-700">Call Certxa at (888) 814-7623 for a new claim link.</p>
        </>) : info.state === "ready" ? card(<>
          <h2 className="text-lg font-semibold text-gray-900">1. Confirm it's your salon</h2>
          <p className="text-sm text-gray-700">
            We'll call the salon's phone number{salon?.phone ? <> (<strong>{salon.phone}</strong>)</> : null} and read out a 6-digit code. Answer it at the salon and enter the code here.
          </p>
          {!called ? (
            <button type="button" className={primary} disabled={busy} onClick={() => void callMe()} data-testid="claim-call">{busy ? "Calling…" : "Call the salon now"}</button>
          ) : (
            <>
              <input className={input} inputMode="numeric" maxLength={6} placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} data-testid="claim-code" />
              <button type="button" className={primary} disabled={busy || code.length !== 6} onClick={() => void checkCode()}>Confirm</button>
              <button type="button" className="w-full text-sm text-gray-700 underline" disabled={busy} onClick={() => void callMe()}>Call again</button>
            </>
          )}
        </>) : info.signedIn?.canClaim ? card(<>
          <h2 className="text-lg font-semibold text-gray-900">2. Take it over</h2>
          <p className="text-sm text-gray-700">You're signed in as <strong>{info.signedIn.email}</strong>. The salon moves into this Certxa Salon account.</p>
          <button type="button" className={primary} disabled={busy} onClick={() => void finish()}>Claim {salon?.name}</button>
        </>) : card(<>
          <h2 className="text-lg font-semibold text-gray-900">2. Create your login</h2>
          <p className="text-sm text-gray-700">Your Certxa Salon login. The salon's page, services and hours move into it.</p>
          <div className="grid grid-cols-2 gap-2">
            <input className={input} placeholder="First name" autoComplete="given-name" value={form.firstName} onChange={set("firstName")} />
            <input className={input} placeholder="Last name" autoComplete="family-name" value={form.lastName} onChange={set("lastName")} />
          </div>
          <input className={input} placeholder="Email" type="email" autoComplete="email" value={form.email} onChange={set("email")} />
          <input className={input} placeholder="Password (8 or more characters)" type="password" autoComplete="new-password" value={form.password} onChange={set("password")} />
          <input className={input} placeholder="Your mobile number" type="tel" autoComplete="tel" value={form.phone} onChange={set("phone")} disabled={smsSent} />
          {!smsSent ? (
            <button type="button" className={primary} disabled={busy || !formReady} onClick={() => void textCode()}>{busy ? "Sending…" : "Text me a code"}</button>
          ) : (
            <>
              <input className={input} inputMode="numeric" maxLength={6} placeholder="Code we texted you" value={smsCode} onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, ""))} />
              <button type="button" className={primary} disabled={busy || smsCode.length !== 6} onClick={() => void createLogin()}>{busy ? "Creating your account…" : "Create my login and claim"}</button>
              <button type="button" className="w-full text-sm text-gray-700 underline" disabled={busy} onClick={() => { setSmsSent(false); setSmsCode(""); }}>Use a different number</button>
            </>
          )}
          <p className="text-xs text-gray-500">Already have a Certxa Salon login with no business on it? <a className="underline" href={`/login?redirect=${encodeURIComponent(`/claim/${token}`)}`}>Sign in</a>, then come back to this link.</p>
          {info.signedIn && !info.signedIn.canClaim && <p className="text-xs text-gray-500">You're signed in as {info.signedIn.email}, which already has a business or is a Certxa Pro login, so the salon needs its own login.</p>}
        </>)}

        {error && <p className="text-sm font-medium text-red-700" role="alert">{error}</p>}
      </div>
    </div>
  );
}
