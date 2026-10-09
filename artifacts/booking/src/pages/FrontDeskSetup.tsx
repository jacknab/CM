/**
 * FrontDeskSetup — /frontdesk with nothing after it: sets up a Customer Facing Screen.
 *
 * A screen already set up on this device goes straight to its remembered /frontdesk/:slug(/:id).
 * Otherwise:
 *   1. which salon — taken from the signed-in session (the Certxa app), or typed once
 *   2. a salon with one checkout station: done, the screen uses the salon address
 *   3. a salon with several stations: the screen shows a 4-digit code, someone types it on the POS
 *      this screen belongs to (station button → Pair customer screen), and the screen switches to
 *      that station by itself. See routes/stationPairing.ts.
 * It used to ask for a station number, which was easy to get wrong. /frontdesk?reset=1 opens this
 * again (FrontDeskDisplay also sends a screen here when its pairing has been replaced).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { kioskFetch } from "@/lib/kioskDevice";
import { getStationDeviceId } from "@/lib/stationDevice";
import KioskPairing from "@/components/kiosk/KioskPairing";

export const FRONTDESK_PATH_KEY = "certxa.frontdesk.path";
const PATH_RE = /^\/frontdesk\/([a-z0-9-]+)(?:\/(\d+))?$/;

type Step = "loading" | "slug" | "device" | "code" | "error";

export default function FrontDeskSetup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resetRequested = searchParams.get("reset") === "1";

  const [step, setStep] = useState<Step>("loading");
  const [slug, setSlug] = useState("");
  const [slugInput, setSlugInput] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTimers = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (refreshRef.current) clearTimeout(refreshRef.current);
    pollRef.current = null;
    refreshRef.current = null;
  };
  useEffect(() => stopTimers, []);

  const go = useCallback((path: string) => {
    stopTimers();
    try { localStorage.setItem(FRONTDESK_PATH_KEY, path); } catch { /* still navigate this once */ }
    navigate(path, { replace: true });
  }, [navigate]);

  /** Asks the server where this screen stands. Returns true once it has somewhere to go. */
  const checkPairing = useCallback(async (s: string): Promise<boolean | "device" | "missing" | "suspended"> => {
    const r = await kioskFetch(s, `/api/public/frontdesk/${s}/pairing?screenId=${encodeURIComponent(getStationDeviceId())}`, { cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    if (r.status === 404) return "missing";
    if (r.status === 401 && d?.code === "device_not_paired") return "device";
    if (d?.accountSuspended) return "suspended";
    if (!r.ok) throw new Error(d?.error || "Couldn't reach Certxa");
    if (!d.multiStation) { go(`/frontdesk/${s}`); return true; }
    if (d.registerId != null) { go(`/frontdesk/${s}/${d.registerId}`); return true; }
    return false;
  }, [go]);

  const showCode = useCallback(async (s: string) => {
    stopTimers();
    const r = await kioskFetch(s, `/api/public/frontdesk/${s}/pair-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ screenId: getStationDeviceId() }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.code) throw new Error(d?.error || "Couldn't get a pairing code");
    setCode(d.code);
    setStep("code");
    // Watch for the POS to enter it, and swap in a fresh code shortly before this one runs out.
    pollRef.current = setInterval(() => { checkPairing(s).catch(() => {}); }, 2500);
    refreshRef.current = setTimeout(() => { showCode(s).catch(() => {}); }, Math.max(60, (Number(d.expiresInSec) || 600) - 60) * 1000);
  }, [checkPairing]);

  const start = useCallback(async (s: string) => {
    setSlug(s);
    setError(null);
    setBusy(true);
    try {
      const state = await checkPairing(s);
      if (state === true) return;
      if (state === "missing") { setError(`No salon called "${s}" was found. Check the spelling and try again.`); setStep("slug"); return; }
      if (state === "suspended") { setError("This salon's account is suspended. Contact Certxa support before setting up this screen."); setStep("error"); return; }
      if (state === "device") { setStep("device"); return; }
      await showCode(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach Certxa. Check the connection and try again.");
      setStep("error");
    } finally {
      setBusy(false);
    }
  }, [checkPairing, showCode]);

  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(FRONTDESK_PATH_KEY); } catch { /* ignore */ }
    if (stored && !resetRequested) { navigate(stored, { replace: true }); return; }
    const remembered = stored?.match(PATH_RE)?.[1];
    if (remembered) { start(remembered); return; }
    // Signed in (the Certxa app): the salon is the signed-in one, nothing to type.
    fetch("/api/frontdesk/my-salon", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.slug) start(d.slug); else setStep("slug"); })
      .catch(() => setStep("slug"));
  }, [navigate, resetRequested, start]);

  const submitSlug = () => {
    const s = slugInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!s) { setError("Enter the salon's booking address name."); return; }
    start(s);
  };

  if (step === "loading") return <div className="min-h-screen bg-[#050C18]" />;

  if (step === "device") {
    return <KioskPairing slug={slug} onPaired={() => start(slug)} />;
  }

  const shell = (children: ReactNode) => (
    <div className="min-h-screen bg-[#050C18] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-[#1A2E4A] bg-[#0D1A2D] p-8 text-center">{children}</div>
    </div>
  );

  if (step === "code") {
    return shell(
      <>
        <h1 className="text-white text-2xl font-bold">Pair this customer screen</h1>
        <p className="text-[#8BA0BC] text-sm mt-3">
          On the POS this screen belongs to, tap its station button (for example "POS #2"), then enter this code:
        </p>
        <p className="text-white font-mono font-black text-7xl tracking-[0.25em] my-8" data-testid="frontdesk-pair-code">{code}</p>
        <p className="text-[#8BA0BC] text-xs">This screen switches over by itself once the code is entered.</p>
      </>,
    );
  }

  if (step === "error") {
    return shell(
      <>
        <h1 className="text-white text-xl font-bold">Customer screen setup</h1>
        <p className="text-[#EF4444] text-sm mt-4">{error}</p>
        <button type="button" onClick={() => (slug ? start(slug) : setStep("slug"))} className="w-full rounded-lg bg-[#4F8EF7] text-white font-bold py-3 mt-6">
          Try again
        </button>
      </>,
    );
  }

  return shell(
    <>
      <h1 className="text-white text-xl font-bold">Set up this Customer Facing Screen</h1>
      <p className="text-[#8BA0BC] text-sm mt-2 mb-8">Enter the salon's booking address name. This is only asked once on this device.</p>
      <input
        value={slugInput}
        onChange={(e) => setSlugInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !busy) submitSlug(); }}
        autoCapitalize="none"
        autoCorrect="off"
        disabled={busy}
        placeholder="e.g. bella-nails"
        className="w-full rounded-lg bg-[#122035] border border-[#243D5C] text-white px-3 py-3 mb-2 outline-none focus:border-[#4F8EF7] disabled:opacity-60 text-left"
      />
      {error && <p className="text-[#EF4444] text-sm mb-2 text-left">{error}</p>}
      <button type="button" onClick={submitSlug} disabled={busy} className="w-full rounded-lg bg-[#4F8EF7] text-white font-bold py-3 mt-4 disabled:opacity-60">
        {busy ? "Checking…" : "Continue"}
      </button>
    </>,
  );
}
