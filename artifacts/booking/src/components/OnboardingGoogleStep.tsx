/**
 * OnboardingGoogleStep
 *
 * Full 8-state Google Discovery & Verification workflow for the onboarding wizard.
 * Reuses all existing /api/google-business/* endpoints — no new API needed.
 *
 * Stages:
 *   landing       → Benefits CTA ("Get Found on Google")
 *   searching     → Auto-searching Google with salon data already collected
 *   found-one     → Single result confirmation card
 *   found-many    → Selectable list of results
 *   not-found     → No match, offer to continue
 *   listed        → "Your salon is already on Google — prove ownership"
 *   verify-guide  → Guided 4-step before OAuth redirect
 *   oauth-start   → Loading while redirecting to Google
 *   select-account → Multiple Google accounts to choose
 *   select-location → Multiple locations to choose
 *   syncing       → "Setting up your Google profile…"
 *   success       → All done
 *   postcard      → Google mailing a verification code
 *   error         → Recoverable error state
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, Check, Star, MapPin, ChevronDown, ChevronRight } from "lucide-react";
import axios from "axios";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  rating?: number;
  reviewCount?: number;
  photoUrl?: string;
}

interface GAccount {
  name: string;
  accountName?: string;
  displayName?: string;
}

interface GLocation {
  name: string;
  title?: string;
  displayName?: string;
  storefrontAddress?: {
    regionCode?: string;
    administrativeArea?: string;
    locality?: string;
    addressLines?: string[];
  };
}

type Stage =
  | "landing"
  | "searching"
  | "found-one"
  | "found-many"
  | "not-found"
  | "listed"
  | "verify-guide"
  | "oauth-start"
  | "select-account"
  | "select-location"
  | "syncing"
  | "success"
  | "postcard"
  | "error";

export interface OnboardingGoogleStepProps {
  storeId: number;
  salonName: string;
  salonAddress: string;
  salonPhone: string;
  /** Google Places ID collected during address lookup.
   *  - Non-empty string → a GBP was found; skip to "listed"
   *  - Empty string ""  → lookup ran but found nothing; skip to "not-found"
   *  - undefined        → lookup never ran; fall through to normal search landing
   */
  placeId?: string;
  onSkip: () => void;
  onComplete: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAddr(loc?: GLocation["storefrontAddress"]): string {
  if (!loc) return "";
  const p: string[] = [];
  if (loc.addressLines?.length) p.push(...loc.addressLines);
  if (loc.locality) p.push(loc.locality);
  if (loc.administrativeArea) p.push(loc.administrativeArea);
  return p.filter(Boolean).join(", ");
}

function mapErr(raw: string, status?: number): string {
  if (!raw) return "An unexpected error occurred. Please try again.";
  if (status === 401 || raw.includes("unauthorized"))
    return "Your session has expired. Please refresh and try again.";
  if (raw.includes("access_denied"))
    return "Google access was denied. Please try again and accept the requested permissions.";
  if (status === 429 || raw.includes("quota"))
    return "Google's API is temporarily busy. Please wait a moment and try again.";
  if (status === 403 || raw.includes("PERMISSION_DENIED"))
    return "Access was denied. Please try reconnecting your Google account.";
  return "Something went wrong. Please try again.";
}

// ── Shared UI atoms ───────────────────────────────────────────────────────────

function PurpleBtn({
  children, onClick, disabled = false, loading = false, secondary = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  secondary?: boolean;
}) {
  if (secondary) {
    return (
      <button
        onClick={onClick}
        disabled={disabled || loading}
        className="w-full py-3.5 text-sm font-semibold rounded-xl border-2 border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {children}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full py-3.5 text-sm font-bold rounded-xl bg-[#3B0764] text-white hover:bg-[#2d0552] disabled:opacity-40 transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#3B0764]/20"
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}

function StarRow({ rating = 0, count }: { rating?: number; count?: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${i < Math.floor(rating) ? "fill-amber-400 text-amber-400" : "fill-gray-100 text-gray-200"}`}
        />
      ))}
      {rating > 0 && <span className="text-sm font-semibold text-gray-700 ml-1">{rating.toFixed(1)}</span>}
      {count != null && count > 0 && <span className="text-sm text-gray-400">({count} reviews)</span>}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function OnboardingGoogleStep({
  storeId,
  salonName,
  salonAddress,
  salonPhone,
  placeId,
  onSkip,
  onComplete,
}: OnboardingGoogleStepProps) {
  // Derive the opening stage from the placeId we already collected earlier:
  //   known placeId  → GBP was found; jump straight to "listed"
  //   empty string   → lookup ran, nothing found; jump straight to "not-found"
  //   undefined      → never searched; fall back to the normal landing + search
  const [stage, setStage] = useState<Stage>(() => {
    if (placeId === undefined) return "landing";
    return placeId ? "listed" : "not-found";
  });
  const [whyOpen, setWhyOpen]       = useState(false);
  const [results, setResults]       = useState<PlaceResult[]>([]);
  const [resultIdx, setResultIdx]   = useState(0);
  const [confirmed, setConfirmed]   = useState<PlaceResult | null>(() =>
    placeId ? { placeId, name: salonName, address: salonAddress } : null
  );
  const [selectedResult, setSelectedResult] = useState(0);
  const [accounts, setAccounts]     = useState<GAccount[]>([]);
  const [locations, setLocations]   = useState<GLocation[]>([]);
  const [allLocs, setAllLocs]       = useState<GLocation[]>([]);
  const [selAccount, setSelAccount] = useState<string | null>(null);
  const [profileId, setProfileId]   = useState<number | null>(null);
  const [syncedCount, setSyncedCount] = useState(0);
  const [syncStats, setSyncStats]   = useState<{ averageRating?: number | string } | null>(null);
  const [connName, setConnName]     = useState<string | null>(null);
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);
  const [syncItems, setSyncItems]   = useState<string[]>([]);
  const [pendingLoc, setPendingLoc] = useState<GLocation | null>(null);
  const syncTimer                   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Captured at mount — URL params from Google OAuth redirect
  const [captured] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return {
      code:  p.get("code"),
      state: p.get("state"),
      googleConnected: p.get("google_connected"),
      googleError:     p.get("google_error"),
    };
  });

  // Clear URL params once on mount
  useEffect(() => {
    if (captured.code || captured.googleConnected || captured.googleError) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // When we already know the outcome from the earlier address step, record it
  // on the backend so the onboarding-state table stays consistent.
  useEffect(() => {
    if (!storeId) return;
    if (placeId === undefined) return; // normal search flow — nothing to pre-record
    if (placeId) {
      // We confirmed a GBP during address lookup
      void axios.patch(`/api/google-business/onboarding-state/${storeId}`, {
        status: "profile_found",
        placeId,
        businessName: salonName,
        locationAddress: salonAddress,
      });
    }
    // placeId === "" means no GBP found — the address step already recorded "failed",
    // so we don't need to patch again here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // Handle OAuth return when storeId is available
  useEffect(() => {
    if (!storeId) return;
    if (captured.googleError) {
      const messages: Record<string, string> = {
        access_denied: "Google access was denied. Please try again.",
        csrf_mismatch: "Security mismatch. Please start again.",
        quota_exceeded: "Google API quota reached — try again in a few minutes.",
      };
      setErrorMsg(messages[captured.googleError] ?? `Google error: ${captured.googleError}`);
      setStage("error");
      return;
    }
    if (captured.code) {
      doExchangeCode(captured.code, captured.state ?? undefined);
    } else if (captured.googleConnected === "1") {
      doPickupResult();
    }
  }, [storeId]);

  // ── API functions ──────────────────────────────────────────────────────────

  const doSearch = async () => {
    setStage("searching");
    void axios.patch(`/api/google-business/onboarding-state/${storeId}`, { status: "searching" });
    try {
      const p = new URLSearchParams({ name: salonName.trim() });
      p.set("storeId", String(storeId));
      if (salonAddress.trim()) p.set("address", salonAddress.trim());
      if (salonPhone.trim()) p.set("phone", salonPhone.replace(/\D/g, ""));
      const res = await axios.get(`/api/google-business/search?${p}`);
      const list: PlaceResult[] = res.data.results ?? [];
      setResults(list);
      setResultIdx(0);
      setSelectedResult(0);
      const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
      const exact = list.find((item) =>
        normalize(item.name) === normalize(salonName) &&
        (!salonAddress || normalize(item.address).includes(normalize(salonAddress)))
      );
      if (exact) {
        setConfirmed(exact);
        void recordState("profile_found", { placeId: exact.placeId, businessName: exact.name, locationAddress: exact.address });
        setStage("listed");
      } else if (list.length === 0) {
        void axios.patch(`/api/google-business/onboarding-state/${storeId}`, {
          status: "failed",
          error: "No matching Google listing was found",
        });
        setStage("not-found");
      }
      else if (list.length === 1) setStage("found-one");
      else setStage("found-many");
    } catch {
      void axios.patch(`/api/google-business/onboarding-state/${storeId}`, {
        status: "failed",
        error: "Google listing search was unavailable",
      });
      setStage("not-found");
    }
  };

  const recordState = async (
    status: "profile_found" | "awaiting_owner_verification" | "postcard_sent" | "verification_pending" | "failed",
    extra: Record<string, unknown> = {},
  ) => {
    try {
      await axios.patch(`/api/google-business/onboarding-state/${storeId}`, { status, ...extra });
    } catch {
      // Tracking must never block the owner-facing flow.
    }
  };

  const skipGoogleSetup = () => {
    void axios.patch(`/api/google-business/onboarding-state/${storeId}`, {
      status: "not_started",
      abandoned: true,
    }).finally(onSkip);
  };

  useEffect(() => {
    if (stage === "postcard") {
      void recordState("postcard_sent", { postcardAddress: confirmed?.address ?? salonAddress });
    }
  }, [stage]);

  const doStartAuth = async () => {
    setStage("oauth-start");
    try {
      const returnTo = `${window.location.pathname}?mode=chat`;
      const res = await axios.get(`/api/google-business/auth-url?storeId=${storeId}&returnTo=${encodeURIComponent(returnTo)}`);
      window.location.href = res.data.authUrl;
    } catch (err: any) {
      setErrorMsg(mapErr(err?.response?.data?.message ?? err?.message ?? ""));
      setStage("error");
    }
  };

  const doExchangeCode = async (code: string, state?: string) => {
    setStage("syncing");
    try {
      const res = await axios.post("/api/google-business/exchange-code", { code, storeId, state });
      await afterOAuth(res.data);
    } catch (err: any) {
      const s = err?.response?.status;
      setErrorMsg(mapErr(err?.response?.data?.message ?? err?.message ?? "", s));
      setStage("error");
    }
  };

  const doPickupResult = async () => {
    setStage("syncing");
    try {
      const res = await axios.get("/api/google-business/connection-result");
      await afterOAuth(res.data);
    } catch (err: any) {
      setErrorMsg(mapErr(err?.response?.data?.message ?? err?.message ?? ""));
      setStage("error");
    }
  };

  const afterOAuth = async (data: any) => {
    const accts: GAccount[] = data.accounts ?? [];
    const locs: GLocation[] = data.businesses ?? [];
    const pid: number | undefined = data.profileId;
    if (pid) setProfileId(pid);
    setAccounts(accts);
    setAllLocs(locs);

    if (!accts.length) {
      setErrorMsg("No Google Business Profile account found. Make sure your Google account has a Business Profile at business.google.com.");
      setStage("error");
      return;
    }

    if (accts.length === 1) {
      const accountLocs = locs.filter((l: any) => l._accountName === accts[0].name || !l._accountName);
      setSelAccount(accts[0].name);
      if (accountLocs.length > 0) {
        setLocations(accountLocs);
        if (accountLocs.length === 1) {
          await doConnectLocation(accountLocs[0], pid);
        } else {
          setStage("select-location");
        }
      } else {
        await doFetchLocations(accts[0].name, pid);
      }
    } else {
      setSelAccount(accts[0].name);
      setLocations([]);
      setStage("select-account");
    }
  };

  const doFetchLocations = async (accountName: string, pid?: number | null) => {
    const usePid = pid ?? profileId;
    if (!usePid) return;
    try {
      const res = await axios.post("/api/google-business/locations", {
        profileId: usePid,
        accountName,
      });
      const locs: GLocation[] = res.data.locations ?? [];
      setLocations(locs);
      setSelAccount(accountName);
      if (locs.length === 0) {
        setErrorMsg("No business locations found on this Google account. Please make sure your location is listed at business.google.com.");
        setStage("error");
      } else if (locs.length === 1) {
        await doConnectLocation(locs[0], usePid);
      } else {
        setStage("select-location");
      }
    } catch (err: any) {
      setErrorMsg(mapErr(err?.response?.data?.message ?? err?.message ?? ""));
      setStage("error");
    }
  };

  const doConnectLocation = async (location: GLocation, pid?: number | null) => {
    const usePid = pid ?? profileId;
    if (!usePid || !storeId) return;
    const locationId   = location.name.split("/locations/")[1] ?? location.name.split("/").pop() ?? "";
    const businessName = location.title ?? location.displayName ?? null;
    const address      = fmtAddr(location.storefrontAddress) || null;
    setConnName(businessName);
    setStage("syncing");
    setSyncItems([]);

    // Animate sync items appearing progressively
    const items = [
      "Importing your reviews",
      "Importing business information",
      "Importing business hours",
      "Connecting your booking link",
      "Setting up automatic sync",
    ];
    items.forEach((item, i) => {
      const t = setTimeout(() => setSyncItems(prev => [...prev, item]), 800 + i * 700);
      syncTimer.current = t;
    });

    try {
      await axios.post("/api/google-business/connect-location", {
        profileId:       usePid,
        locationName:    location.name,
        locationId,
        businessName,
        locationAddress: address,
      });

      // Sync reviews
      try {
        const syncRes = await axios.post(`/api/google-business/sync-reviews/${storeId}`);
        setSyncedCount(syncRes.data.synced ?? 0);
      } catch {
        setSyncedCount(0);
      }

      // Load stats
      try {
        const statsRes = await axios.get(`/api/google-business/reviews-stats/${storeId}`);
        setSyncStats(statsRes.data);
      } catch { /* non-fatal */ }

      // Small delay so user sees the progress
      await new Promise(r => setTimeout(r, 1200));
      setStage("success");
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? "";
      if (msg.toLowerCase().includes("verif") || msg.toLowerCase().includes("postcard")) {
        setStage("postcard");
      } else {
        setErrorMsg(mapErr(msg, err?.response?.status));
        setStage("error");
      }
    }
  };

  const doSelectAccount = () => {
    if (!selAccount) return;
    const accountLocs = allLocs.filter((l: any) => l._accountName === selAccount || !l._accountName);
    if (accountLocs.length > 0) {
      setLocations(accountLocs);
      if (accountLocs.length === 1) doConnectLocation(accountLocs[0]);
      else setStage("select-location");
    } else {
      doFetchLocations(selAccount);
    }
  };

  // ── LANDING ────────────────────────────────────────────────────────────────

  if (stage === "landing") {
    return (
      <div className="space-y-5">
        {/* Headline */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#3B0764] to-[#7c3aed] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-[#3B0764]/20">
            <span className="text-3xl">🌐</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Get found by more customers</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            I'll check Google using your salon name, address, and phone, then guide you through connecting it.
          </p>
        </div>

        {/* Benefits */}
        <div className="bg-gradient-to-br from-[#3B0764]/5 to-purple-50 rounded-2xl p-4 space-y-2.5">
          {[
            { icon: "📍", text: "Help customers find your salon" },
            { icon: "📅", text: "Let customers book appointments" },
            { icon: "⭐", text: "Import your Google reviews" },
            { icon: "🔄", text: "Keep your Google information updated automatically" },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <Check className="w-3.5 h-3.5 text-green-600" />
              </div>
              <span className="text-sm text-gray-700 font-medium">{text}</span>
            </div>
          ))}
        </div>

        {/* Why? accordion */}
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <button
            onClick={() => setWhyOpen(v => !v)}
            className="flex items-center justify-between w-full px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <span className="font-medium">💡 Why does this matter?</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${whyOpen ? "rotate-180" : ""}`} />
          </button>
          {whyOpen && (
            <div className="px-4 pb-4 space-y-3 bg-gray-50">
              <p className="text-sm text-gray-600 leading-relaxed">
                When customers search for <em className="text-gray-800 font-medium">"nail salon near me,"</em> Google decides which salons appear.
                Connecting your salon allows customers to:
              </p>
              <div className="space-y-1.5">
                {["Receive more calls", "Get more directions requests", "Collect Google reviews", "Book appointments directly through Certxa"].map(b => (
                  <div key={b} className="flex items-center gap-2 text-sm text-gray-700">
                    <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    {b}
                  </div>
                ))}
              </div>
              <p className="text-xs font-semibold text-[#3B0764]">More visibility means more appointments.</p>
            </div>
          )}
        </div>

        {/* CTAs */}
        <div className="space-y-2.5">
          <PurpleBtn onClick={doSearch}>
            Let's set it up
          </PurpleBtn>
        </div>

      </div>
    );
  }

  // ── SEARCHING ─────────────────────────────────────────────────────────────

  if (stage === "searching") {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-5 text-center">
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#3B0764] to-[#7c3aed] flex items-center justify-center shadow-lg shadow-[#3B0764]/25">
            <span className="text-4xl">🔍</span>
          </div>
          <div className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-white border-2 border-white shadow-sm flex items-center justify-center">
            <Loader2 className="w-4 h-4 text-[#3B0764] animate-spin" />
          </div>
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">Searching Google for your salon…</h3>
          <p className="text-sm text-gray-500 mt-1">
            Looking for <strong className="text-gray-700">{salonName}</strong>
          </p>
        </div>
        <div className="flex gap-1.5 mt-2">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-[#3B0764] animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  // ── FOUND ONE ─────────────────────────────────────────────────────────────

  if (stage === "found-one") {
    const r = results[resultIdx];
    return (
      <div className="space-y-4">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 text-sm font-semibold px-3 py-1.5 rounded-full mb-3">
            <Check className="w-3.5 h-3.5" />
            We found your salon on Google!
          </div>
          <h2 className="text-xl font-bold text-gray-900">We found your salon on Google 🎉</h2>
        </div>

        {/* Result card */}
        <div className="border-2 border-[#3B0764]/20 rounded-2xl p-5 bg-gradient-to-br from-[#3B0764]/3 to-purple-50/50">
          {r?.photoUrl && <img src={r.photoUrl} alt={r.name} className="mb-3 h-32 w-full rounded-xl object-cover" />}
          <StarRow rating={r?.rating} count={r?.reviewCount} />
          <p className="text-lg font-bold text-gray-900 mt-2">{r?.name}</p>
          {r?.address && (
            <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-1">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              {r.address}
            </p>
          )}
        </div>

        <div className="space-y-2.5">
          <PurpleBtn onClick={() => { setConfirmed(r); void recordState("profile_found", { placeId: r.placeId, businessName: r.name, locationAddress: r.address }); setStage("listed"); }}>
            Connect Google
          </PurpleBtn>
          {resultIdx < results.length - 1 ? (
            <PurpleBtn secondary onClick={() => setResultIdx(i => i + 1)}>
              This Isn't My Salon — Show Next Result
            </PurpleBtn>
          ) : (
            <PurpleBtn secondary onClick={() => setStage("not-found")}>
              My Salon Isn't Listed Here
            </PurpleBtn>
          )}
        </div>
      </div>
    );
  }

  // ── FOUND MANY ────────────────────────────────────────────────────────────

  if (stage === "found-many") {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Which salon is yours?</h2>
          <p className="text-sm text-gray-500">We found a few matches on Google.</p>
        </div>

        <div className="space-y-2">
          {results.map((r, i) => (
            <button
              key={r.placeId}
              onClick={() => setSelectedResult(i)}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                selectedResult === i
                  ? "border-[#3B0764] bg-[#3B0764]/5"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                  selectedResult === i ? "border-[#3B0764] bg-[#3B0764]" : "border-gray-300"
                }`}>
                  {selectedResult === i && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm ${selectedResult === i ? "text-[#3B0764]" : "text-gray-800"}`}>
                    {r.name}
                  </p>
                  {r.address && (
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5 truncate">
                      <MapPin className="w-3 h-3 shrink-0" />
                      {r.address}
                    </p>
                  )}
                  {r.rating != null && r.rating > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      <StarRow rating={r.rating} count={r.reviewCount} />
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={() => setStage("not-found")}
          className="text-sm text-gray-400 hover:text-gray-600 w-full text-center py-1 transition-colors"
        >
          My salon isn't in this list
        </button>

        <PurpleBtn onClick={() => { const match = results[selectedResult]; setConfirmed(match); void recordState("profile_found", { placeId: match?.placeId, businessName: match?.name, locationAddress: match?.address }); setStage("listed"); }}>
          Continue →
        </PurpleBtn>
      </div>
    );
  }

  // ── NOT FOUND ─────────────────────────────────────────────────────────────

  if (stage === "not-found") {
    return (
      <div className="space-y-5 text-center">
        <div>
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border-2 border-amber-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🗺️</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">I couldn't find a Google listing for your salon yet.</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            No problem! We can help you create one so customers can find your salon on Google Maps.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-left space-y-2">
          <p className="text-sm font-semibold text-blue-800">You can set this up after onboarding:</p>
          <div className="space-y-1">
            {["Go to Settings → Google", "Click Get Found on Google", "We'll walk you through it"].map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-blue-700">
                <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-800 text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                {s}
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2.5">
          <PurpleBtn onClick={() => {
            window.open("https://business.google.com/create", "_blank", "noopener,noreferrer");
            void recordState("awaiting_owner_verification");
            setStage("verify-guide");
          }}>
            Create My Google Listing
          </PurpleBtn>
          <PurpleBtn secondary onClick={doSearch}>
            Try Searching Again
          </PurpleBtn>
        </div>
      </div>
    );
  }

  // ── LISTED (business found — "prove you're the owner") ────────────────────

  if (stage === "listed") {
    return (
      <div className="space-y-5">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 text-sm font-semibold px-3 py-1.5 rounded-full mb-3">
            <Check className="w-3.5 h-3.5" />
            Great news!
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Your salon is already listed on Google
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Customers can already find you. The only thing left is proving you're the owner — this usually only takes a few minutes.
          </p>
        </div>

        {/* Confirmed business card */}
        {confirmed && (
          <div className="border border-green-200 bg-green-50 rounded-xl p-4">
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">Your salon</p>
            <StarRow rating={confirmed.rating} count={confirmed.reviewCount} />
            <p className="font-bold text-gray-900 mt-1.5">{confirmed.name}</p>
            {confirmed.address && (
              <p className="text-sm text-gray-600 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                {confirmed.address}
              </p>
            )}
          </div>
        )}

        {/* What happens */}
        <div className="bg-gray-50 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">What Certxa will do for you</p>
          <div className="space-y-1.5">
            {[
              "Import your Google reviews",
              "Import your business information",
              "Import your business hours",
              "Add your Certxa booking link",
              "Keep your profile synchronized automatically",
            ].map(item => (
              <div key={item} className="flex items-center gap-2 text-sm text-gray-700">
                <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </div>

        <PurpleBtn onClick={() => { void recordState("awaiting_owner_verification"); setStage("verify-guide"); }}>
          Connect Google
        </PurpleBtn>

      </div>
    );
  }

  // ── VERIFY GUIDE ─────────────────────────────────────────────────────────

  if (stage === "verify-guide") {
    const steps = [
      { n: 1, icon: "🔐", label: "Sign into Google", sub: "Use your existing Google account" },
      { n: 2, icon: "📍", label: "Select your salon", sub: "We'll help you find it" },
      { n: 3, icon: "✅", label: "Verify ownership", sub: "Google may ask a quick question" },
      { n: 4, icon: "🚀", label: "Back to Certxa", sub: "We'll take it from there" },
    ];
    return (
      <div className="space-y-5">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Here's what happens next</h2>
          <p className="text-sm text-gray-500">Certxa will guide you through every step.</p>
        </div>

        <div className="space-y-3">
          {steps.map((s, i) => (
            <div key={s.n} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <div className="w-10 h-10 rounded-xl bg-[#3B0764]/8 border border-[#3B0764]/15 flex items-center justify-center shrink-0 text-xl">
                  {s.icon}
                </div>
                {i < steps.length - 1 && (
                  <div className="w-0.5 h-4 bg-gray-200 mt-1" />
                )}
              </div>
              <div className="pt-1.5">
                <p className="text-sm font-semibold text-gray-800">Step {s.n}: {s.label}</p>
                <p className="text-xs text-gray-500">{s.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Why link */}
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <button
            onClick={() => setWhyOpen(v => !v)}
            className="flex items-center justify-between w-full px-4 py-3 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <span>Why do I need to verify?</span>
            <ChevronRight className={`w-4 h-4 transition-transform ${whyOpen ? "rotate-90" : ""}`} />
          </button>
          {whyOpen && (
            <div className="px-4 pb-4 bg-gray-50">
              <p className="text-sm text-gray-600 leading-relaxed">
                When customers search <em>"nail salon near me,"</em> Google decides which salons appear. 
                Verifying that you own your listing lets customers:
              </p>
              <div className="mt-2 space-y-1">
                {["Get more calls", "Get more directions requests", "Leave Google reviews", "Book appointments directly through Certxa"].map(b => (
                  <div key={b} className="flex items-center gap-2 text-sm text-gray-700">
                    <Check className="w-3 h-3 text-green-500 shrink-0" />
                    {b}
                  </div>
                ))}
              </div>
              <p className="text-xs font-semibold text-[#3B0764] mt-2">More visibility = more appointments.</p>
            </div>
          )}
        </div>

        {/* stage is narrowed to "verify-guide" here — auth pending is tracked by the
            immediate setStage("oauth-start") call inside doStartAuth which exits this
            render branch on the next tick, so loading is never observable here.       */}
        <PurpleBtn loading={false} onClick={doStartAuth}>
          Sign into Google →
        </PurpleBtn>

      </div>
    );
  }

  // ── OAUTH STARTING ────────────────────────────────────────────────────────

  if (stage === "oauth-start") {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-5 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#3B0764] flex items-center justify-center shadow-lg shadow-[#3B0764]/25">
          <Loader2 className="w-7 h-7 text-white animate-spin" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">Opening Google…</h3>
          <p className="text-sm text-gray-500 mt-1">You'll be redirected to sign in with Google.</p>
        </div>
      </div>
    );
  }

  // ── SELECT ACCOUNT ────────────────────────────────────────────────────────

  if (stage === "select-account") {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Select your Google account</h2>
          <p className="text-sm text-gray-500">You have multiple accounts — choose the one with your salon.</p>
        </div>

        <div className="space-y-2">
          {accounts.map(a => (
            <button
              key={a.name}
              onClick={() => setSelAccount(a.name)}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                selAccount === a.name
                  ? "border-[#3B0764] bg-[#3B0764]/5"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                  selAccount === a.name ? "border-[#3B0764] bg-[#3B0764]" : "border-gray-300"
                }`}>
                  {selAccount === a.name && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <span className="font-medium text-sm text-gray-800">
                  {a.accountName ?? a.displayName ?? a.name}
                </span>
              </div>
            </button>
          ))}
        </div>

        <PurpleBtn onClick={doSelectAccount} disabled={!selAccount}>
          Continue →
        </PurpleBtn>
      </div>
    );
  }

  // Auto-initialize pendingLoc when locations list arrives
  useEffect(() => {
    if (locations.length > 0 && !pendingLoc) {
      setPendingLoc(locations[0]);
    }
  }, [locations]);

  // ── SELECT LOCATION ───────────────────────────────────────────────────────

  if (stage === "select-location") {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Select your salon location</h2>
          <p className="text-sm text-gray-500">
            {locations.length === 0 ? "No locations found on this account." : "Choose the location that matches your salon."}
          </p>
        </div>

        {locations.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-sm text-gray-400">
              No business locations were found. Make sure your Google account has a Business Profile at{" "}
              <a href="https://business.google.com" target="_blank" rel="noreferrer" className="text-[#3B0764] underline">business.google.com</a>.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {locations.map(loc => {
              const name = loc.title ?? loc.displayName ?? "Unknown Location";
              const addr = fmtAddr(loc.storefrontAddress);
              const isSelected = pendingLoc?.name === loc.name;
              return (
                <button
                  key={loc.name}
                  onClick={() => setPendingLoc(loc)}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                    isSelected ? "border-[#3B0764] bg-[#3B0764]/5" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                      isSelected ? "border-[#3B0764] bg-[#3B0764]" : "border-gray-300"
                    }`}>
                      {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <div>
                      <p className={`font-semibold text-sm ${isSelected ? "text-[#3B0764]" : "text-gray-800"}`}>{name}</p>
                      {addr && <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{addr}</p>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {locations.length > 0 && (
          <PurpleBtn onClick={() => pendingLoc && doConnectLocation(pendingLoc)} disabled={!pendingLoc}>
            Connect This Location →
          </PurpleBtn>
        )}
      </div>
    );
  }

  // ── SYNCING ───────────────────────────────────────────────────────────────

  if (stage === "syncing") {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-6 text-center">
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#3B0764] to-[#7c3aed] flex items-center justify-center shadow-lg shadow-[#3B0764]/25">
            <span className="text-4xl">🔄</span>
          </div>
          <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-white border-2 border-white shadow flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-[#3B0764] animate-spin" />
          </div>
        </div>

        <div>
          <h3 className="text-lg font-bold text-gray-900">Setting up your Google profile…</h3>
          <p className="text-sm text-gray-500 mt-1">
            {connName ? `Connecting ${connName}` : "Connecting your salon to Google"} — estimated time: 30 seconds
          </p>
        </div>

        {syncItems.length > 0 && (
          <div className="w-full max-w-xs space-y-2">
            {syncItems.map(item => (
              <div key={item} className="flex items-center gap-2.5 text-sm text-gray-700 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 text-green-600" />
                </div>
                {item}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── SUCCESS ───────────────────────────────────────────────────────────────

  if (stage === "success") {
    return (
      <div className="space-y-5 text-center">
        <div>
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green-500/20">
            <span className="text-4xl">🎉</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">🎉 Your salon is connected!</h2>
          <p className="text-sm text-gray-500">Certxa can now help you get more reviews and help more customers discover your salon.</p>
        </div>

        {/* What's being done */}
        <div className="bg-gradient-to-br from-[#3B0764]/5 to-purple-50 rounded-2xl p-4 text-left space-y-2">
          <p className="text-xs font-semibold text-[#3B0764] uppercase tracking-wider">Certxa is now:</p>
          {[
            "⭐ Get more 5-star reviews",
            "🤖 Automatically respond to reviews",
            "📸 Show your best reviews on your booking website",
            "📈 Help more customers discover your salon",
          ].map(item => (
            <div key={item} className="flex items-center gap-2.5 text-sm text-gray-700">
              <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <Check className="w-3 h-3 text-green-600" />
              </div>
              {item}
            </div>
          ))}
        </div>

        {/* Stats */}
        {syncedCount > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-gray-200 rounded-xl p-3">
              <p className="text-2xl font-bold text-gray-900">{syncedCount}</p>
              <p className="text-xs text-gray-500 mt-0.5">Reviews imported</p>
            </div>
            {syncStats?.averageRating && (
              <div className="bg-white border border-gray-200 rounded-xl p-3">
                <div className="flex items-center gap-1">
                  <p className="text-2xl font-bold text-gray-900">{syncStats.averageRating}</p>
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400 mb-1" />
                </div>
                <p className="text-xs text-gray-500 mt-0.5">Average rating</p>
              </div>
            )}
          </div>
        )}

        <p className="text-xs text-gray-400">Reviews sync automatically every 6 hours.</p>

        <PurpleBtn onClick={() => { void recordState("verification_pending"); onComplete(); }}>
          Continue to Dashboard →
        </PurpleBtn>
      </div>
    );
  }

  // ── POSTCARD ─────────────────────────────────────────────────────────────

  if (stage === "postcard") {
    return (
      <div className="space-y-5 text-center">
        <div>
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border-2 border-amber-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">📬</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Verification in Progress</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Google will mail a verification postcard to your salon address. It usually arrives within 7–10 business days. When it arrives, enter the code to finish connecting your salon.
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold text-amber-800">Estimated arrival</span>
            <span className="text-sm font-bold text-amber-900">7–10 business days</span>
          </div>
          <p className="text-xs text-amber-700">
            We'll remind you automatically when it's time to enter your code.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-left space-y-2">
          <p className="text-sm font-semibold text-blue-800">What to do when it arrives:</p>
          {["Look for a postcard from Google", "Find the 6-digit verification code", "Come back to Certxa → Settings → Google", "Enter the code — we'll do the rest"].map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-blue-700">
              <span className="w-5 h-5 rounded-full bg-blue-200 text-blue-800 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              {s}
            </div>
          ))}
        </div>

        <PurpleBtn onClick={onComplete}>
          Continue to Dashboard →
        </PurpleBtn>
      </div>
    );
  }

  // ── ERROR ─────────────────────────────────────────────────────────────────

  if (stage === "error") {
    return (
      <div className="space-y-5 text-center">
        <div>
          <div className="w-16 h-16 rounded-2xl bg-red-50 border-2 border-red-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">⚠️</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
          {errorMsg && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 leading-relaxed">
              {errorMsg}
            </p>
          )}
        </div>

        <div className="space-y-2.5">
          <PurpleBtn onClick={() => { setErrorMsg(null); setStage("landing"); }}>
            Try Again
          </PurpleBtn>
          <PurpleBtn secondary onClick={skipGoogleSetup}>
            Skip for Now
          </PurpleBtn>
        </div>
      </div>
    );
  }

  return null;
}
