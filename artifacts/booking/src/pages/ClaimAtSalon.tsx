/**
 * Claiming a salon page Certxa prepared, online at the salon (owner, 2026-11-11): certxa.com/claim/salon/<slug>, linked
 * from the "Is this your salon?" line on the unclaimed page. Steps:
 *   1 share your location: the server checks you're at the salon (api-server lib/salonClaim.ts claimLinkAtSalon);
 *   2 Certxa calls the salon's listed phone and reads out a 6-digit number; enter it here (the claim link's code call);
 *   3 on to the claim page (/claim/<token>, ClaimSalon.tsx) to create the Certxa Salon login and take the salon over.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, MapPin, Phone } from "lucide-react";

type Info = {
  state: "ready" | "claimed" | "unavailable" | "invalid";
  message?: string;
  salon?: { name: string; address: string | null; phone: string | null };
};

async function send<T = any>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST", credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || "Something went wrong. Please try again.");
  return data as T;
}

/** The device's location, as precise as it can get. */
function locate(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("This browser can't share your location. Open this page on your phone.")); return; }
    navigator.geolocation.getCurrentPosition(resolve, (err) => reject(new Error(
      err.code === err.PERMISSION_DENIED
        ? "Location is blocked for this page. Allow location for certxa.com in your browser's settings, then try again."
        : "We couldn't get your location. Make sure location is turned on, then try again.",
    )), { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 });
  });
}

const input = "h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-center text-[20px] tracking-[0.3em] text-gray-900 outline-none focus:border-gray-900";
const primary = "flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gray-900 text-[15px] font-semibold text-white disabled:opacity-40";

export default function ClaimAtSalon() {
  const { slug = "" } = useParams();
  const [info, setInfo] = useState<Info | null>(null);
  const [token, setToken] = useState("");
  const [called, setCalled] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"" | "locating" | "calling" | "checking">("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/salon-claim/salon/${encodeURIComponent(slug)}`, { credentials: "include", cache: "no-store" })
      .then((r) => r.json()).then(setInfo).catch(() => setInfo({ state: "invalid" }));
  }, [slug]);

  const run = async (kind: typeof busy, fn: () => Promise<void>) => {
    setError(""); setBusy(kind);
    try { await fn(); } catch (e: any) { setError(e?.message ?? "Something went wrong. Please try again."); } finally { setBusy(""); }
  };
  const shareLocation = () => run("locating", async () => {
    const pos = await locate();
    const { token: t } = await send<{ token: string }>(`/api/salon-claim/salon/${encodeURIComponent(slug)}/here`,
      { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy });
    setToken(t);
  });
  const callSalon = () => run("calling", async () => { await send(`/api/salon-claim/${token}/call`); setCalled(true); });
  const checkCode = () => run("checking", async () => {
    await send(`/api/salon-claim/${token}/verify`, { code });
    window.location.href = `/claim/${token}`; // step 2: create the login and take the salon over
  });

  const salon = info?.salon;
  const card = (children: React.ReactNode) => <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">{children}</div>;

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#F7F5FB] px-4 py-8">{/* fixed: no site header on this page */}
      <div className="mx-auto max-w-md space-y-5">
        <h1 className="text-2xl font-semibold text-gray-900">Claim your salon's page</h1>
        {salon && (
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-[17px] font-semibold text-gray-900">{salon.name}</p>
            {salon.address && <p className="text-sm text-gray-600">{salon.address}</p>}
          </div>
        )}

        {!info ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : info.state !== "ready" ? card(<>
          <h2 className="text-lg font-semibold text-gray-900">{info.state === "claimed" ? "This page has already been claimed" : "This page can't be claimed online"}</h2>
          <p className="text-sm text-gray-700">{info.state === "claimed"
            ? "If that wasn't you, contact support@certxa.com."
            : info.message ?? "Call Certxa at (888) 814-7623 and we'll help you claim it."}</p>
        </>) : !token ? card(<>
          <h2 className="text-lg font-semibold text-gray-900">1. Share your location</h2>
          <p className="text-sm text-gray-700">
            To claim {salon?.name ?? "the salon"} online you need to be at the salon. Share your location so we can check you're there.
            We only use it for this check and don't keep it.
          </p>
          <button type="button" className={primary} disabled={!!busy} onClick={() => void shareLocation()} data-testid="claim-share-location">
            {busy === "locating" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" aria-hidden="true" />}
            {busy === "locating" ? "Checking your location…" : "Share my location"}
          </button>
          <p className="text-xs text-gray-500">Not at the salon? You can also call Certxa at <a className="underline" href="tel:+18888147623">(888) 814-7623</a>.</p>
        </>) : card(<>
          <h2 className="text-lg font-semibold text-gray-900">2. Answer the salon's phone</h2>
          <p className="text-sm text-gray-700" data-testid="claim-call-explainer">
            You're at the salon. Our system will call <strong>{salon?.phone ?? "the salon's phone"}</strong> and read out a number to verify
            you're the salon owner. Please enter the number here when the call gives it to you.
          </p>
          {!called ? (
            <button type="button" className={primary} disabled={!!busy} onClick={() => void callSalon()} data-testid="claim-call-salon">
              {busy === "calling" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" aria-hidden="true" />}
              {busy === "calling" ? "Calling…" : `Call ${salon?.phone ?? "the salon"} now`}
            </button>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-900" role="status">Calling {salon?.phone ?? "the salon"} now. Enter the number you hear:</p>
              <input className={input} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} data-testid="claim-at-salon-code" aria-label="The number from the call" />
              <button type="button" className={primary} disabled={!!busy || code.length !== 6} onClick={() => void checkCode()} data-testid="claim-at-salon-verify">
                {busy === "checking" ? "Checking…" : "Verify"}
              </button>
              <button type="button" className="w-full text-sm text-gray-700 underline" disabled={!!busy} onClick={() => void callSalon()}>Call again</button>
            </>
          )}
        </>)}

        {error && <p className="text-sm font-medium text-red-700" role="alert" data-testid="claim-at-salon-error">{error}</p>}
      </div>
    </div>
  );
}
