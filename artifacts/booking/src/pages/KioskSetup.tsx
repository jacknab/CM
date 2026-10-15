/**
 * KioskSetup — /kiosk (no slug yet).
 *
 * The certxa-owner native app sends a device set up as "Kiosk" here, with no salon slug baked in.
 * On mount, checks localStorage for a previously-chosen /kiosk/:slug path — if found, replaces
 * straight there. If not, asks once for the salon's slug and remembers the answer from then on.
 *
 * Before saving, the slug is checked against the server (the same `/api/public/kiosk/:slug/config`
 * endpoint KioskCheckIn itself resolves the slug with) — a typo here used to get saved as-is and
 * only surface as a broken screen with no way back to this form, the only fix being to reinstall
 * the app. Visiting `/kiosk?reset=1` re-opens this form (pre-filled with whatever's currently set
 * up) without needing that.
 */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const STORAGE_KEY = "certxa.kiosk.path";
/** /kiosk/:slug */
const PATH_RE = /^\/kiosk\/([a-z0-9-]+)$/;

export default function KioskSetup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resetRequested = searchParams.get("reset") === "1";
  const [checked, setChecked] = useState(false);
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch { /* ignore */ }
    if (stored && !resetRequested) { navigate(stored, { replace: true }); return; }
    if (stored) {
      const m = stored.match(PATH_RE);
      if (m) setSlug(m[1]);
    }
    setChecked(true);
  }, [navigate, resetRequested]);

  const submit = async () => {
    const s = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!s) { setError("Enter the salon's slug."); return; }

    setValidating(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/kiosk/${s}/config`);
      if (res.status === 404) { setError("That salon slug wasn't found. Check the spelling and try again."); return; }
      if (!res.ok) { setError("Couldn't reach the server to check that — try again."); return; }
      const data = await res.json().catch(() => null);
      if (data?.accountSuspended) { setError(`"${s}"'s account is currently suspended — contact support before setting up this device.`); return; }

      const path = `/kiosk/${s}`;
      try { localStorage.setItem(STORAGE_KEY, path); } catch { /* ignore — still navigate this once */ }
      navigate(path, { replace: true });
    } catch {
      setError("Couldn't reach the server to check that — check the connection and try again.");
    } finally {
      setValidating(false);
    }
  };

  if (!checked) return <div className="min-h-screen bg-[#050C18]" />;

  return (
    <div className="min-h-screen bg-[#050C18] flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-[#1A2E4A] bg-[#0D1A2D] p-8">
        <h1 className="text-white text-xl font-bold text-center">Set up this Kiosk</h1>
        <p className="text-[#8BA0BC] text-sm text-center mt-2 mb-8">
          This only needs to be entered once on this device.
        </p>
        <label className="block text-[#8BA0BC] text-xs font-semibold uppercase tracking-wide mb-1">Salon Slug</label>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          disabled={validating}
          className="w-full rounded-lg bg-[#122035] border border-[#243D5C] text-white px-3 py-3 mb-2 outline-none focus:border-[#4F8EF7] disabled:opacity-60"
        />
        {error && <p className="text-[#EF4444] text-sm mb-2">{error}</p>}
        <button
          type="button"
          onClick={submit}
          disabled={validating}
          className="w-full rounded-lg bg-[#4F8EF7] text-white font-bold py-3 mt-4 disabled:opacity-60"
        >
          {validating ? "Checking…" : "Continue"}
        </button>
      </div>
    </div>
  );
}
