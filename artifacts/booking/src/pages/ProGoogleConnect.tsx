/**
 * Connecting Google Business Profile from the Certxa Pro app (owner, 2026-11-11): Google's sign-in, then choosing the
 * business, on Certxa's own page in the app's in-app browser (api-server routes/proGoogleConnect.ts), signed in for this
 * page only. Uses the same server steps as the website's Google Business page: auth-url → Google → callback →
 * connection-result → (locations) → connect-location → sync-reviews. When done, back to the app
 * (certxa-pro://google-business), which shows the connection and the Google reviews.
 */
import { useEffect, useState } from "react";
import { CheckCircle, Loader2 } from "lucide-react";
import { backToApp as returnToApp, useEndAppWebSessionOnClose } from "@/lib/appWebSession";

const APP_RETURN = "certxa-pro://google-business";
type Loc = { name: string; title?: string; displayName?: string; storefrontAddress?: { addressLines?: string[]; locality?: string; administrativeArea?: string }; _accountName?: string };

async function call<T = any>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(path, { method, credentials: "include", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || data?.error || "Something went wrong. Please try again.");
  return data as T;
}
const addressOf = (l: Loc) => [l.storefrontAddress?.addressLines?.join(", "), l.storefrontAddress?.locality, l.storefrontAddress?.administrativeArea].filter(Boolean).join(", ");
const ERRORS: Record<string, string> = {
  access_denied: "You didn't give Certxa access. To connect, tap Continue with Google and allow access to your Business Profile.",
  quota_exceeded: "Google is busy right now. Please try again in a few minutes.",
};

export default function ProGoogleConnect() {
  useEndAppWebSessionOnClose();
  const params = new URLSearchParams(window.location.search);
  const storeId = Number(params.get("storeId") || 0) || null;
  const [step, setStep] = useState<"start" | "working" | "choose" | "none" | "done" | "error" | "expired">(
    params.get("link") === "expired" ? "expired" : params.get("google_error") ? "error" : params.get("google_connected") ? "working" : "start");
  const [message, setMessage] = useState(params.get("google_error") ? (ERRORS[params.get("google_error")!] ?? "Google couldn't connect your Business Profile. Please try again.") : "");
  const [locations, setLocations] = useState<Loc[]>([]);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [connected, setConnected] = useState<string>("");

  const back = (result: string) => returnToApp(`${APP_RETURN}?result=${result}`);

  const goToGoogle = async () => {
    setStep("working");
    try {
      const { authUrl } = await call<{ authUrl: string }>(`/api/google-business/auth-url?storeId=${storeId}&returnTo=${encodeURIComponent(`/pro-google-connect?storeId=${storeId}`)}`);
      window.location.href = authUrl;
    } catch (e: any) { setMessage(e.message); setStep("error"); }
  };

  const connect = async (loc: Loc, pid: number) => {
    setStep("working");
    try {
      const businessName = loc.title ?? loc.displayName ?? null;
      await call("/api/google-business/connect-location", "POST", {
        profileId: pid, locationName: loc.name, locationId: loc.name.split("/locations/")[1] ?? loc.name.split("/").pop() ?? "",
        businessName, locationAddress: addressOf(loc) || null,
      });
      await call(`/api/google-business/sync-reviews/${storeId}`, "POST").catch(() => undefined);
      setConnected(businessName ?? "your business");
      setStep("done");
    } catch (e: any) { setMessage(e.message); setStep("error"); }
  };

  // Back from Google: the accounts and businesses the sign-in found.
  useEffect(() => {
    if (step !== "working" || !params.get("google_connected")) return;
    window.history.replaceState({}, document.title, `/pro-google-connect?storeId=${storeId}`);
    (async () => {
      try {
        const r = await call<{ accounts?: { name: string }[]; businesses?: Loc[]; profileId?: number; quotaError?: boolean }>("/api/google-business/connection-result");
        const pid = r.profileId ?? null;
        setProfileId(pid);
        let locs: Loc[] = r.businesses ?? [];
        if (!locs.length && pid && r.accounts?.length) {
          for (const a of r.accounts) {
            const got = await call<{ locations?: Loc[] }>("/api/google-business/locations", "POST", { profileId: pid, accountName: a.name }).catch(() => ({ locations: [] }));
            locs = locs.concat(got.locations ?? []);
          }
        }
        if (!pid || !locs.length) { setStep(r.quotaError ? "error" : "none"); if (r.quotaError) setMessage(ERRORS.quota_exceeded); return; }
        if (locs.length === 1) return connect(locs[0], pid);
        setLocations(locs);
        setStep("choose");
      } catch (e: any) { setMessage(e.message); setStep("error"); }
    })();
  }, []);

  const card = (children: React.ReactNode) => <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">{children}</div>;
  const primary = "flex h-12 w-full items-center justify-center rounded-full bg-gray-900 text-[15px] font-semibold text-white disabled:opacity-40";
  const secondary = "flex h-12 w-full items-center justify-center rounded-full border border-gray-200 bg-white text-[15px] font-semibold text-gray-900";

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#F7F5FB] px-4 py-8">{/* fixed: no site header on this page */}
      <div className="mx-auto max-w-md space-y-5">
        <h1 className="text-2xl font-semibold text-gray-900">Connect Google Business Profile</h1>
        {step === "start" ? card(<>
          <p className="text-sm text-gray-700">Sign in with the Google account that manages your Business Profile and allow Certxa to access it. Your Google reviews then show on your website and in the app, where you can reply to them.</p>
          <button type="button" className={primary} onClick={() => void goToGoogle()} disabled={!storeId}>Continue with Google</button>
          <button type="button" className={secondary} onClick={() => back("cancel")}>Back to Certxa Pro</button>
        </>) : step === "working" ? (
          <div className="flex flex-col items-center gap-3 py-12 text-sm text-gray-600"><Loader2 className="h-6 w-6 animate-spin text-gray-400" />Connecting…</div>
        ) : step === "choose" ? card(<>
          <h2 className="text-lg font-semibold text-gray-900">Which business is yours?</h2>
          <ul className="space-y-2">
            {locations.map((l) => (
              <li key={l.name}>
                <button type="button" className="w-full rounded-xl border border-gray-200 bg-white p-4 text-left" onClick={() => profileId && void connect(l, profileId)}>
                  <span className="block font-semibold text-gray-900">{l.title ?? l.displayName ?? "Business"}</span>
                  {addressOf(l) && <span className="block text-sm text-gray-600">{addressOf(l)}</span>}
                </button>
              </li>
            ))}
          </ul>
        </>) : step === "none" ? card(<>
          <h2 className="text-lg font-semibold text-gray-900">No Business Profile on this Google account</h2>
          <p className="text-sm text-gray-700">This Google account doesn't manage a Business Profile yet. Go back to the app and follow "I don't have one yet" to create it, or sign in with the Google account that manages it.</p>
          <button type="button" className={primary} onClick={() => void goToGoogle()}>Use a different Google account</button>
          <button type="button" className={secondary} onClick={() => back("none")}>Back to Certxa Pro</button>
        </>) : step === "done" ? card(<>
          <div className="flex items-center gap-3"><CheckCircle className="h-7 w-7 shrink-0 text-gray-900" /><h2 className="text-lg font-semibold text-gray-900">Connected</h2></div>
          <p className="text-sm text-gray-700">{connected} is connected. Your Google reviews will show on your website and in the app's Reviews.</p>
          <button type="button" className={primary} onClick={() => back("connected")}>Back to Certxa Pro</button>
        </>) : step === "expired" ? card(<>
          <h2 className="text-lg font-semibold text-gray-900">This link has expired</h2>
          <p className="text-sm text-gray-700">Open the Certxa Pro app and tap Connect again.</p>
          <button type="button" className={secondary} onClick={() => back("expired")}>Back to Certxa Pro</button>
        </>) : card(<>
          <p className="text-sm text-gray-700">{message || "Something went wrong. Please try again."}</p>
          <button type="button" className={primary} onClick={() => void goToGoogle()} disabled={!storeId}>Try again</button>
          <button type="button" className={secondary} onClick={() => back("error")}>Back to Certxa Pro</button>
        </>)}
      </div>
    </div>
  );
}
