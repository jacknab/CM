/**
 * GoogleBusinessProfileSetup — streamlined onboarding wizard.
 *
 * Steps:
 *   initial        → CTA (GoogleConnectGate)
 *   loading        → spinner (OAuth redirect pending / data fetching)
 *   select-account → shown ONLY when user has 2+ business accounts
 *   select-location→ shown ONLY when account has 2+ locations; auto-skipped for 1
 *   syncing        → "Syncing your Google reviews…" (auto-runs after location connect)
 *   success        → stats + "View My Reviews" CTA
 *   connected      → returning-user state (already set up)
 */
import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { confirm } from "@/lib/confirm";
import { GoogleConnectGate } from "@/components/GoogleConnectGate";
import { GoogleListingSyncPanel } from "@/components/GoogleListingSyncPanel";
import { GoogleProfileAudit }    from "@/components/GoogleProfileAudit";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  MapPin,
  Building2,
  Star,
  ChevronRight,
  Sparkles,
  ArrowRight,
  RotateCcw,
  List,
} from "lucide-react";
import axios from "axios";
import { GoogleBusinessProfile } from "@shared/schema";

// ── Types ──────────────────────────────────────────────────────────────────────

interface StorefrontAddress {
  regionCode?: string;
  administrativeArea?: string;
  locality?: string;
  addressLines?: string[];
}

interface Location {
  name: string;
  title?: string;
  displayName?: string;
  storefrontAddress?: StorefrontAddress;
  phoneNumbers?: { primaryPhone?: string };
}

interface Account {
  name: string;
  accountName?: string;
  displayName?: string;
}

interface SyncStats {
  totalReviews: number;
  averageRating: number | string;
  lastSyncedAt: string | null;
}

type SetupStep =
  | "loading"
  | "search-form"
  | "searching"
  | "found"
  | "not-found"
  | "initial"
  | "quota-retry"
  | "select-account"
  | "select-location"
  | "syncing"
  | "success"
  | "connected";

interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  rating?: number;
  reviewCount?: number;
}

interface GoogleBusinessProfileSetupProps {
  storeId?: number | null;
  onConnectSuccess?: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatAddress(addr?: StorefrontAddress): string {
  if (!addr) return "";
  const parts: string[] = [];
  if (addr.addressLines?.length) parts.push(...addr.addressLines);
  if (addr.locality) parts.push(addr.locality);
  if (addr.administrativeArea) parts.push(addr.administrativeArea);
  return parts.filter(Boolean).join(", ");
}

function mapErrorToHuman(raw: string, httpStatus?: number): string {
  if (!raw) return "An unexpected error occurred. Please try again.";
  if (httpStatus === 401 || raw.toLowerCase().includes("unauthorized"))
    return "Your session has expired. Please refresh the page and try connecting again.";
  if (raw.includes("access_denied") || raw.includes("access was denied"))
    return "Google access was denied. Please try again and accept the requested permissions.";
  if (raw.includes("token") || raw.includes("credential") || raw.includes("invalid_grant") || raw.includes("expired"))
    return "Your Google access has expired. Please reconnect your account.";
  // Check 403/PERMISSION_DENIED BEFORE checking for "quota" — Google 403 error bodies
  // sometimes include the word "quota" (e.g. "PERMISSION_DENIED: quota not available"),
  // so checking status/permission first prevents misclassification.
  if (httpStatus === 403 || raw.includes("Access denied") || raw.includes("PERMISSION_DENIED") || raw.includes("denied access"))
    return "Access was denied. Please refresh the page and try connecting again, or contact support if the issue persists.";
  if (raw.includes("403") || raw.includes("Forbidden"))
    return "Access was denied (403). If this keeps happening, please sign out and sign back in, then try connecting again.";
  if (httpStatus === 429 || raw.includes("429") || raw.toLowerCase().includes("quota cooldown"))
    return "Google API daily quota reached. Your quota resets at midnight UTC — the system won't retry until then to avoid wasting quota.";
  if (raw.includes("quota"))
    return "Google API quota limit reached. Please wait a few minutes and try again.";
  if (raw.includes("404") || raw.includes("not found"))
    return "Your connected location was not found on Google. Please reconnect and reselect your location.";
  if (raw.includes("No Business Profile") || raw.includes("no Business Profile"))
    return "No Google Business Profile was found on this Google account. Please make sure you have a Business Profile at business.google.com.";
  if (raw.includes("location") && raw.includes("fetch"))
    return "Unable to fetch your business locations. Please try reconnecting.";
  if (raw.includes("sync") || raw.includes("review"))
    return "Reviews could not be synced right now. Your connection is saved — reviews will sync automatically within 6 hours.";
  return "Something went wrong. Please try reconnecting your Google Business Profile.";
}

// ── Step indicator ─────────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 justify-center mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`inline-block rounded-full transition-all duration-300 ${
            i < current
              ? "w-2 h-2 bg-blue-600"
              : i === current
              ? "w-5 h-2 bg-blue-600"
              : "w-2 h-2 bg-gray-200"
          }`}
        />
      ))}
      <span className="ml-2 text-xs text-muted-foreground">
        Step {current + 1} of {total}
      </span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function GoogleBusinessProfileSetup({
  storeId: propStoreId,
  onConnectSuccess,
}: GoogleBusinessProfileSetupProps = {}) {
  const params = useParams();
  const storeId = propStoreId ?? (params?.storeId ? Number(params.storeId) : null);

  const [profile, setProfile]                         = useState<GoogleBusinessProfile | null>(null);
  const [loading, setLoading]                         = useState(false);
  const [step, setStep]                               = useState<SetupStep>("loading");
  const [accounts, setAccounts]                       = useState<Account[]>([]);
  const [locations, setLocations]                     = useState<Location[]>([]);
  const [allPrefetchedLocations, setAllPrefetchedLocations] = useState<Location[]>([]);
  const [selectedAccount, setSelectedAccount]         = useState<string | null>(null);
  const [pendingLocation, setPendingLocation]         = useState<Location | null>(null);
  const [profileId, setProfileId]                     = useState<number | null>(null);
  const [errorMsg, setErrorMsg]                       = useState<string | null>(null);
  const [syncStats, setSyncStats]                     = useState<SyncStats | null>(null);
  const [syncedCount, setSyncedCount]                 = useState<number>(0);
  const [connectedLocationName, setConnectedLocationName] = useState<string | null>(null);
  const [connectedLocationAddr, setConnectedLocationAddr] = useState<string | null>(null);
  const [quotaCooldownSecs, setQuotaCooldownSecs]     = useState<number>(0);
  const quotaTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Pre-search flow state ──────────────────────────────────────────────────
  const [searchName, setSearchName]               = useState("");
  const [searchAddress, setSearchAddress]         = useState("");
  const [searchPhone, setSearchPhone]             = useState("");
  const [searchResults, setSearchResults]         = useState<PlaceResult[]>([]);
  const [searchResultIndex, setSearchResultIndex] = useState(0);
  const [searchLoading, setSearchLoading]         = useState(false);
  const [whyExpanded, setWhyExpanded]             = useState(false);

  // ── Step 1: Capture URL params at mount (before any effect can clear them) ──
  // Using useState lazy-init guarantees this runs exactly once, synchronously,
  // before the first render — so even if storeId is null on first render, we
  // still have the params when storeId loads later.
  const [capturedParams] = useState<{
    googleConnected: string | null;
    googleError:     string | null;
    code:            string | null;
    state:           string | null;
  }>(() => {
    const p = new URLSearchParams(window.location.search);
    return {
      googleConnected: p.get("google_connected"),
      googleError:     p.get("google_error"),
      code:            p.get("code"),
      state:           p.get("state"),
    };
  });

  // ── Step 2: Clear URL once on mount so params don't persist on back/forward ─
  useEffect(() => {
    const { googleConnected, googleError, code } = capturedParams;
    if (googleConnected || googleError || code) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []); // run once

  // Cleanup quota cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (quotaTimerRef.current) clearInterval(quotaTimerRef.current);
    };
  }, []);

  // ── Step 3: Process captured params once storeId is available ──────────────
  // Depends on [storeId, capturedParams]. capturedParams never changes (frozen at
  // mount), but including it avoids the exhaustive-deps warning.
  useEffect(() => {
    const { googleConnected, googleError, code, state: stateParm } = capturedParams;

    if (googleError) {
      const messages: Record<string, string> = {
        access_denied:   "Google access was denied. Please try again and accept the permissions.",
        csrf_mismatch:   "Security token mismatch. Please start the connection flow again.",
        missing_store:   "Could not identify which store to connect. Please try again.",
        quota_exceeded:  "Google Business Profile API quota exceeded.",
        no_access_token: "Google did not return an access token. Please try again.",
        server_error:    "An unexpected server error occurred.",
        missing_params:  "Google redirect was missing required parameters.",
        invalid_state:   "Invalid OAuth state token. Please try again.",
      };
      setErrorMsg(messages[googleError] ?? `Google authorization error: ${googleError}`);
      setStep("initial");
      return;
    }

    // Wait for storeId before doing anything that talks to the API
    if (!storeId) return;

    if (code) {
      // Direct frontend-mediated exchange using the new exchange-code endpoint
      handleExchangeCode(code, stateParm ?? undefined);
      return;
    }

    if (googleConnected === "1") {
      // Fallback: server-side flow redirected with ?google_connected=1
      // Try the session pickup first; if it fails the user can reconnect.
      handlePickupConnectionResult();
      return;
    }

    loadProfile();
  }, [storeId, capturedParams]);

  // ── Data loaders ─────────────────────────────────────────────────────────────

  const fetchStoreData = async () => {
    try {
      const res = await axios.get("/api/stores");
      const stores: any[] = res.data ?? [];
      const store = storeId ? (stores.find((s) => s.id === storeId) ?? stores[0]) : stores[0];
      if (!store) return;
      setSearchName(store.name ?? "");
      const addrParts = [store.address, store.city, store.state].filter(Boolean);
      setSearchAddress(addrParts.join(", "));
      setSearchPhone(store.phone ?? "");
    } catch {
      // non-fatal — owner can fill manually
    }
  };

  const handleSearch = async () => {
    if (!searchName.trim()) return;
    setSearchLoading(true);
    setStep("searching");
    try {
      const params = new URLSearchParams({ name: searchName.trim() });
      if (searchAddress.trim()) params.set("address", searchAddress.trim());
      if (searchPhone.trim()) params.set("phone", searchPhone.trim());
      const res = await axios.get(`/api/google-business/search?${params}`);
      const results: PlaceResult[] = res.data.results ?? [];
      setSearchResults(results);
      setSearchResultIndex(0);
      setStep(results.length > 0 ? "found" : "not-found");
    } catch {
      setStep("not-found");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleConfirmMatch = () => {
    // Owner confirmed their salon — proceed to OAuth
    handleStartAuth();
  };

  const loadProfile = async () => {
    if (!storeId) return;
    try {
      setStep("loading");
      const res = await axios.get(`/api/google-business/profile/${storeId}`);
      if (res.data.profile) {
        setProfile(res.data.profile);
        setProfileId(res.data.profile.id); // so actions in "connected" state have the profile ID
        setStep("connected");
      } else {
        await fetchStoreData();
        setStep("search-form");
      }
    } catch {
      await fetchStoreData();
      setStep("search-form");
    }
  };

  /**
   * Load accounts already stored in the DB (from previous OAuth flows) and drop
   * the user directly into the location-picker without requiring a new OAuth round-trip.
   */
  const handleSelectFromStoredAccounts = async () => {
    if (!storeId) return;
    const useProfileId = profileId ?? (profile as any)?.id ?? null;
    if (!useProfileId) {
      setErrorMsg("Could not determine the current profile. Please try reconnecting.");
      return;
    }
    try {
      setLoading(true);
      setErrorMsg(null);
      setStep("loading");

      const res = await axios.get(`/api/google-business/stored-accounts/${storeId}`);
      const accts: Account[] = (res.data.accounts ?? []).map((a: any) => ({
        name:        a.googleAccountId,
        accountName: a.accountName ?? a.displayName ?? null,
      }));

      if (!accts.length) {
        setErrorMsg(
          "No Google accounts found in the system for this store. " +
          "Please use Reconnect to go through Google sign-in again."
        );
        setStep("connected");
        setLoading(false);
        return;
      }

      setProfileId(useProfileId);
      setAccounts(accts);

      if (accts.length === 1) {
        // Single account — fetch its locations immediately
        await fetchLocationsForAccount(accts[0].name, useProfileId);
      } else {
        // Multiple accounts — let user pick one first
        setSelectedAccount(accts[0].name);
        setStep("select-account");
        setLoading(false);
      }
    } catch (err: any) {
      setErrorMsg(mapErrorToHuman(err?.response?.data?.message ?? err?.message ?? ""));
      setStep("connected");
      setLoading(false);
    }
  };

  const loadSyncStats = async () => {
    if (!storeId) return;
    try {
      const res = await axios.get(`/api/google-business/reviews-stats/${storeId}`);
      setSyncStats(res.data);
    } catch {
      // non-fatal
    }
  };

  // ── OAuth flow ────────────────────────────────────────────────────────────────

  const handleStartAuth = async () => {
    if (!storeId) return;
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await axios.get(`/api/google-business/auth-url?storeId=${storeId}`);
      window.location.href = res.data.authUrl;
    } catch (err: any) {
      setErrorMsg(mapErrorToHuman(err?.response?.data?.message ?? err?.message ?? ""));
      setLoading(false);
    }
  };

  /**
   * Called after Google redirects back with ?google_connected=1.
   * Picks up the session result (which already includes pre-fetched locations)
   * and decides which step to show. Auto-advances through single-account flows.
   */
  const handlePickupConnectionResult = async () => {
    if (!storeId) return;
    try {
      setLoading(true);
      setErrorMsg(null);
      setStep("loading");

      const res = await axios.get("/api/google-business/connection-result");
      // `businesses` = all locations already fetched during the OAuth callback
      const {
        accounts: accts = [],
        businesses: prefetchedLocs = [],
        profileId: pid,
        quotaError,
        accountsFetchStatus,
        accountsFetchMessage,
      } = res.data;

      if (!accts.length) {
        // 429 — genuine quota exhaustion: tokens are saved, user can retry without re-auth
        if (pid && quotaError) {
          setProfileId(pid);
          setStep("quota-retry");
          return;
        }

        // 403 — API not enabled or OAuth app not verified: show a clear, actionable error
        if (accountsFetchStatus === 403 || (accountsFetchMessage ?? "").includes("PERMISSION_DENIED")) {
          setErrorMsg(
            mapErrorToHuman(accountsFetchMessage ?? "403", 403)
          );
          setStep("initial");
          return;
        }

        // Any other error with a saved profileId — give a generic retry option
        if (pid && accountsFetchStatus) {
          setErrorMsg(
            mapErrorToHuman(
              accountsFetchMessage ?? `Google API error (status ${accountsFetchStatus})`,
              accountsFetchStatus
            )
          );
          setProfileId(pid);
          setStep("quota-retry");
          return;
        }

        setErrorMsg(
          "Google authentication succeeded but no Business Profile accounts were found. " +
          "Make sure your Google account has a Business Profile at business.google.com."
        );
        setStep("initial");
        return;
      }

      setProfileId(pid);
      setAccounts(accts);
      setAllPrefetchedLocations(prefetchedLocs);

      if (accts.length === 1) {
        // Single account — use pre-fetched locations if available, otherwise fall back to API
        const accountLocs: Location[] = prefetchedLocs.length > 0
          ? prefetchedLocs.filter((l: any) => l._accountName === accts[0].name || !l._accountName)
          : [];

        if (accountLocs.length > 0) {
          setLocations(accountLocs);
          setSelectedAccount(accts[0].name);
          if (accountLocs.length === 1) {
            // Only one location — connect it automatically
            await connectLocation(accountLocs[0], pid);
          } else {
            setStep("select-location");
          }
        } else {
          // No pre-fetched locations — fall back to live API call
          await fetchLocationsForAccount(accts[0].name, pid);
        }
      } else {
        // Multiple accounts — pre-select first, let user choose
        setSelectedAccount(accts[0].name);
        setStep("select-account");
      }
    } catch (err: any) {
      setErrorMsg(mapErrorToHuman(err?.response?.data?.message ?? err?.message ?? ""));
      setStep("initial");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Primary OAuth completion handler — calls the new exchange-code endpoint
   * which is fully stateless w.r.t. the session (no session stash needed).
   */
  const handleExchangeCode = async (code: string, state?: string) => {
    if (!storeId) return;
    try {
      setLoading(true);
      setErrorMsg(null);
      setStep("loading");

      const res = await axios.post("/api/google-business/exchange-code", { code, storeId, state });
      const accts: Account[]    = res.data.accounts ?? [];
      const prefetchedLocs: Location[] = res.data.businesses ?? [];
      const pid   = res.data.profileId;

      setProfileId(pid);
      setAccounts(accts);
      setAllPrefetchedLocations(prefetchedLocs);

      if (!accts.length) {
        setErrorMsg("No Business Profile accounts found.");
        setStep("initial");
        return;
      }

      if (accts.length === 1) {
        const accountLocs = prefetchedLocs.filter(
          (l: any) => l._accountName === accts[0].name || !l._accountName
        );
        if (accountLocs.length > 0) {
          setLocations(accountLocs);
          setSelectedAccount(accts[0].name);
          if (accountLocs.length === 1) {
            await connectLocation(accountLocs[0], pid);
          } else {
            setStep("select-location");
          }
        } else {
          await fetchLocationsForAccount(accts[0].name, pid);
        }
      } else {
        setSelectedAccount(accts[0].name);
        setStep("select-account");
      }
    } catch (err: any) {
      const status = err?.response?.status ?? err?.status ?? err?.code;
      setErrorMsg(mapErrorToHuman(err?.response?.data?.message ?? err?.message ?? "", status));
      setStep("initial");
    } finally {
      setLoading(false);
    }
  };

  /** Start a visible countdown from `seconds` down to 0, disabling the retry button. */
  const startQuotaCooldown = (seconds: number) => {
    if (quotaTimerRef.current) clearInterval(quotaTimerRef.current);
    setQuotaCooldownSecs(seconds);
    quotaTimerRef.current = setInterval(() => {
      setQuotaCooldownSecs((prev) => {
        if (prev <= 1) {
          clearInterval(quotaTimerRef.current!);
          quotaTimerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  /**
   * Retry fetching Business accounts using already-stored tokens.
   * Called from the quota-retry step — no re-auth needed.
   */
  const handleRetryFetchAccounts = async () => {
    if (!storeId || quotaCooldownSecs > 0) return;
    try {
      setLoading(true);
      setErrorMsg(null);
      setStep("loading");

      const res = await axios.post("/api/google-business/retry-fetch-accounts", { storeId });
      const accts: Account[]       = res.data.accounts   ?? [];
      const prefetchedLocs: Location[] = res.data.businesses ?? [];
      const pid                    = res.data.profileId;

      setProfileId(pid);
      setAccounts(accts);
      setAllPrefetchedLocations(prefetchedLocs);

      if (!accts.length) {
        setErrorMsg("Still no accounts found. Check that your Google account has a Business Profile at business.google.com.");
        setStep("quota-retry");
        return;
      }

      if (accts.length === 1) {
        const accountLocs = prefetchedLocs.filter(
          (l: any) => l._accountName === accts[0].name || !l._accountName
        );
        if (accountLocs.length > 0) {
          setLocations(accountLocs);
          setSelectedAccount(accts[0].name);
          if (accountLocs.length === 1) {
            await connectLocation(accountLocs[0], pid);
          } else {
            setStep("select-location");
          }
        } else {
          await fetchLocationsForAccount(accts[0].name, pid);
        }
      } else {
        setSelectedAccount(accts[0].name);
        setStep("select-account");
      }
    } catch (err: any) {
      const status = err?.response?.status ?? err?.status ?? err?.code;
      if (status === 429) {
        const retryAfterSecs: number = err?.response?.data?.retryAfterSecs ?? 120;
        setErrorMsg("Google API daily quota reached. Your quota resets at midnight UTC — the system won't retry until then to avoid wasting quota.");
        startQuotaCooldown(retryAfterSecs);
        setStep("quota-retry");
      } else if (status === 403) {
        setErrorMsg(mapErrorToHuman(err?.response?.data?.message ?? "403", 403));
        setStep("initial");
      } else {
        setErrorMsg(mapErrorToHuman(err?.response?.data?.message ?? err?.message ?? "", status));
        setStep("quota-retry");
      }
    } finally {
      setLoading(false);
    }
  };

  /** Legacy callback — kept for backward compat (POST /api/google-business/callback). */
  const handleLegacyCallback = async (code: string, state?: string) => {
    if (!storeId) return;
    try {
      setLoading(true);
      setErrorMsg(null);
      setStep("loading");

      const res = await axios.post("/api/google-business/callback", { code, storeId, state });
      const accts: Account[]    = res.data.accounts ?? [];
      const prefetchedLocs: Location[] = res.data.businesses ?? [];
      const pid   = res.data.profileId;

      setProfileId(pid);
      setAccounts(accts);
      setAllPrefetchedLocations(prefetchedLocs);

      if (!accts.length) {
        setErrorMsg("No Business Profile accounts found.");
        setStep("initial");
        return;
      }

      if (accts.length === 1) {
        const accountLocs = prefetchedLocs.filter(
          (l: any) => l._accountName === accts[0].name || !l._accountName
        );
        if (accountLocs.length > 0) {
          setLocations(accountLocs);
          setSelectedAccount(accts[0].name);
          if (accountLocs.length === 1) {
            await connectLocation(accountLocs[0], pid);
          } else {
            setStep("select-location");
          }
        } else {
          await fetchLocationsForAccount(accts[0].name, pid);
        }
      } else {
        setSelectedAccount(accts[0].name);
        setStep("select-account");
      }
    } catch (err: any) {
      setErrorMsg(mapErrorToHuman(err?.response?.data?.message ?? err?.message ?? ""));
      setStep("initial");
    } finally {
      setLoading(false);
    }
  };

  // ── Account → Location fetch ───────────────────────────────────────────────

  const fetchLocationsForAccount = async (accountName: string, pid?: number | null) => {
    const useProfileId = pid ?? profileId;
    if (!useProfileId) return;

    try {
      setLoading(true);
      setErrorMsg(null);

      const res = await axios.post("/api/google-business/locations", {
        profileId: useProfileId,
        accountName,
      });
      const locs: Location[] = res.data.locations ?? [];
      setLocations(locs);
      setSelectedAccount(accountName);

      if (locs.length === 0) {
        // No locations — show the select-location step which renders an empty state
        setStep("select-location");
      } else if (locs.length === 1) {
        // Auto-advance: single location → connect it immediately
        await connectLocation(locs[0], useProfileId);
      } else {
        // Multiple locations → let user choose
        setStep("select-location");
      }
    } catch (err: any) {
      setErrorMsg(mapErrorToHuman(err?.response?.data?.message ?? err?.message ?? ""));
      setStep("select-account");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAccount = () => {
    if (!selectedAccount) return;
    // Use pre-fetched locations for this account if available; otherwise hit the API
    const accountLocs: Location[] = allPrefetchedLocations.filter(
      (l: any) => l._accountName === selectedAccount || !l._accountName
    );
    if (accountLocs.length > 0) {
      setLocations(accountLocs);
      if (accountLocs.length === 1) {
        connectLocation(accountLocs[0]);
      } else {
        setStep("select-location");
      }
    } else {
      fetchLocationsForAccount(selectedAccount);
    }
  };

  // ── Location connect ───────────────────────────────────────────────────────

  const connectLocation = async (location: Location, pid?: number | null) => {
    const useProfileId = pid ?? profileId;
    if (!useProfileId || !storeId) return;

    const locationId    = location.name.split("/locations/")[1] ?? location.name.split("/").pop() ?? "";
    const businessName  = location.title ?? location.displayName ?? null;
    const address       = formatAddress(location.storefrontAddress) || null;

    setConnectedLocationName(businessName);
    setConnectedLocationAddr(address);

    try {
      setLoading(true);
      setErrorMsg(null);

      await axios.post("/api/google-business/connect-location", {
        profileId:       useProfileId,
        locationName:    location.name,
        locationId,
        businessName,
        locationAddress: address,
      });

      // ── Auto-sync immediately after connecting ─────────────────────────────
      setStep("syncing");
      setLoading(false);

      try {
        const syncRes = await axios.post(`/api/google-business/sync-reviews/${storeId}`);
        setSyncedCount(syncRes.data.synced ?? 0);
      } catch {
        // Non-fatal — connection succeeded, sync will run on the 6-hour schedule
        setSyncedCount(0);
      }

      // Load stats for success screen
      await loadSyncStats();
      setStep("success");
    } catch (err: any) {
      const status = err?.response?.status ?? err?.status ?? err?.code;
      setErrorMsg(mapErrorToHuman(err?.response?.data?.message ?? err?.message ?? "", status));
      setStep("select-location");
      setLoading(false);
    }
  };

  const handleSelectLocation = (location: Location) => {
    setPendingLocation(location);
    connectLocation(location);
  };

  // ── Disconnect ────────────────────────────────────────────────────────────

  const handleDisconnect = async () => {
    if (!profile) return;
    if (!(await confirm(
      "Disconnect your Google Business Profile? This will revoke our access and delete all synced reviews from this platform. Your reviews will remain on Google.",
      { destructive: true }
    ))) return;

    try {
      setLoading(true);
      setErrorMsg(null);
      await axios.delete(`/api/google-business/profile/${storeId}`);
      setProfile(null);
      setStep("initial");
    } catch (err: any) {
      setErrorMsg(
        err?.response?.data?.message ??
        "Failed to disconnect. Please try again or revoke access in your Google Account settings."
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const noLocAcctName = (() => {
    const acct = accounts.find((a) => a.name === selectedAccount);
    return acct?.accountName ?? acct?.displayName ?? "your Google account";
  })();

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!storeId) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="text-red-700">Invalid Store</CardTitle>
          <CardDescription className="text-red-600">
            No store ID found. Please navigate from your store settings.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // ── QUOTA RETRY ────────────────────────────────────────────────────────────

  if (step === "quota-retry") {
    return (
      <div className="space-y-4 max-w-lg mx-auto">
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="text-amber-600" size={20} />
              <CardTitle className="text-base text-amber-900">Almost there — one more step</CardTitle>
            </div>
            <CardDescription className="text-amber-700">
              Your Google account was connected and your credentials are saved. Google's API was
              temporarily busy fetching your business locations — just wait a moment and try again.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {errorMsg && (
              <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span>{errorMsg}</span>
                  <button
                    className="block mt-1 text-red-500 underline text-xs"
                    onClick={() => setErrorMsg(null)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-lg bg-white border border-amber-200 p-4 text-sm text-amber-800 space-y-1.5">
              <p className="font-semibold">What happened?</p>
              <p>
                Google limits how often apps can request business account data. Your connection is
                saved — click <strong>Try Again</strong> below and it should work.
              </p>
              <p className="text-xs text-amber-600 mt-1">
                No need to sign in with Google again.
              </p>
            </div>

            {quotaCooldownSecs > 0 && (
              <div className="flex items-center gap-3 rounded-lg bg-amber-100 border border-amber-300 p-3 text-sm text-amber-800">
                <Loader2 size={16} className="animate-spin flex-shrink-0 text-amber-600" />
                <span>
                  Quota cooldown active — retry available in{" "}
                  <strong>{quotaCooldownSecs}s</strong>
                </span>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Button
                onClick={handleRetryFetchAccounts}
                disabled={loading || quotaCooldownSecs > 0}
                className="w-full gap-2"
              >
                {loading ? (
                  <><Loader2 size={15} className="animate-spin" /> Loading your locations…</>
                ) : quotaCooldownSecs > 0 ? (
                  <><Loader2 size={15} className="animate-spin" /> Wait {quotaCooldownSecs}s…</>
                ) : (
                  <><RefreshCw size={15} /> Try Again</>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={handleStartAuth}
                disabled={loading}
                className="w-full gap-2"
              >
                <RotateCcw size={14} />
                Reconnect with Google Instead
              </Button>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              Your Google credentials are securely saved. Retrying will not require you to sign in again.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── SEARCH FORM ──────────────────────────────────────────────────────────────

  if (step === "search-form") {
    return (
      <div className="space-y-4 max-w-lg mx-auto">
        <div className="text-center pb-2">
          <h2 className="text-xl font-bold text-gray-900">Get Found on Google</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Confirm your salon's details so we can find your Google listing.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Salon Name</label>
            <input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full h-11 px-4 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:border-blue-400 transition-colors"
              placeholder="Your salon name"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Address</label>
            <input
              type="text"
              value={searchAddress}
              onChange={(e) => setSearchAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full h-11 px-4 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:border-blue-400 transition-colors"
              placeholder="123 Main Street, City, State"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              Phone <span className="text-xs text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="tel"
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-gray-200 text-gray-800 text-sm focus:outline-none focus:border-blue-400 transition-colors"
              placeholder="(555) 555-5555"
            />
          </div>
        </div>

        {/* Why do I need this? */}
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
          <button
            className="flex items-center gap-2 text-sm text-gray-600 font-medium w-full text-left"
            onClick={() => setWhyExpanded((v) => !v)}
          >
            <span className="text-base">💡</span>
            Why do I need this?
            <ChevronRight size={14} className={`ml-auto transition-transform ${whyExpanded ? "rotate-90" : ""}`} />
          </button>
          {whyExpanded && (
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
              When someone searches <em>"nail salon near me,"</em> Google decides which salons to show.
              Connecting your Google listing lets customers call you, get directions, leave reviews, and book
              appointments directly from Google Search and Maps.
            </p>
          )}
        </div>

        <Button
          onClick={handleSearch}
          disabled={!searchName.trim() || searchLoading}
          className="w-full gap-2"
          size="lg"
        >
          {searchLoading ? <Loader2 size={16} className="animate-spin" /> : null}
          Search Google
        </Button>

        <div className="text-center">
          <button
            className="text-sm text-muted-foreground underline"
            onClick={() => setStep("initial")}
          >
            Skip — connect Google account directly
          </button>
        </div>
      </div>
    );
  }

  // ── SEARCHING ────────────────────────────────────────────────────────────────

  if (step === "searching") {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-6 text-center">
        <div className="w-16 h-16 rounded-full bg-blue-50 border-2 border-blue-100 flex items-center justify-center">
          <Loader2 size={28} className="animate-spin text-blue-500" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Searching Google…</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Looking for <strong>{searchName}</strong>
          </p>
        </div>
      </div>
    );
  }

  // ── FOUND ────────────────────────────────────────────────────────────────────

  if (step === "found") {
    const result    = searchResults[searchResultIndex];
    const starRating = result?.rating ?? 0;
    const fullStars  = Math.floor(starRating);
    return (
      <div className="space-y-4 max-w-lg mx-auto">
        <div className="text-center pb-2">
          <p className="text-sm font-semibold text-emerald-600 mb-1">✓ We found your salon!</p>
          <h2 className="text-xl font-bold text-gray-900">Is this you?</h2>
        </div>

        <Card className="border-gray-200 shadow-sm">
          <CardContent className="py-5 px-5 space-y-3">
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  size={15}
                  className={i < fullStars ? "fill-yellow-400 text-yellow-400" : "text-gray-200 fill-gray-200"}
                />
              ))}
              {starRating > 0 && (
                <span className="text-sm text-gray-500 ml-1">{starRating.toFixed(1)}</span>
              )}
              {result?.reviewCount != null && result.reviewCount > 0 && (
                <span className="text-sm text-gray-400">({result.reviewCount} reviews)</span>
              )}
            </div>
            <div>
              <p className="font-bold text-gray-900 text-base">{result?.name}</p>
              {result?.address && (
                <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                  <MapPin size={12} />
                  {result.address}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2">
          <Button onClick={handleConfirmMatch} className="w-full" size="lg">
            This Is My Salon →
          </Button>
          {searchResultIndex < searchResults.length - 1 ? (
            <Button
              variant="outline"
              onClick={() => setSearchResultIndex((i) => i + 1)}
              className="w-full gap-2"
            >
              <ChevronRight size={16} />
              That's Not Me — Show Next Result
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setStep("not-found")} className="w-full">
              My salon isn't listed here
            </Button>
          )}
        </div>

        <div className="text-center">
          <button
            className="text-sm text-muted-foreground underline"
            onClick={() => setStep("search-form")}
          >
            Search again
          </button>
        </div>
      </div>
    );
  }

  // ── NOT FOUND ────────────────────────────────────────────────────────────────

  if (step === "not-found") {
    return (
      <div className="space-y-4 max-w-lg mx-auto text-center">
        <div className="py-4">
          <div className="w-14 h-14 rounded-full bg-amber-50 border-2 border-amber-100 flex items-center justify-center mx-auto mb-4">
            <MapPin size={24} className="text-amber-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">We couldn't find your salon</h2>
          <p className="text-sm text-muted-foreground mt-2">
            No worries — connect your Google account directly or create a new listing.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Button onClick={handleStartAuth} className="w-full gap-2" size="lg">
            Connect My Google Account
          </Button>
          <a
            href="https://business.google.com/create"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full block"
          >
            <Button variant="outline" className="w-full gap-2">
              <ArrowRight size={15} />
              Create a Google Listing
            </Button>
          </a>
        </div>

        <button
          className="text-sm text-muted-foreground underline"
          onClick={() => setStep("search-form")}
        >
          Try a different search
        </button>
      </div>
    );
  }

  // ── INITIAL ───────────────────────────────────────────────────────────────

  if (step === "initial") {
    return (
      <div className="space-y-4">
        {errorMsg && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium mb-1">Unable to connect</p>
              <p>{errorMsg}</p>
              <button
                className="mt-2 text-red-600 underline text-xs font-medium"
                onClick={() => setErrorMsg(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        <GoogleConnectGate
          onConnect={handleStartAuth}
          loading={loading}
          subtitle="We request Google Business Profile management access to sync your listing info and reviews. You can disconnect at any time — we never access your account without your permission."
          compact
        />
      </div>
    );
  }

  // ── SYNCING ───────────────────────────────────────────────────────────────

  if (step === "syncing") {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-6 text-center">
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-blue-50 border-2 border-blue-100 flex items-center justify-center">
            <Loader2 size={28} className="animate-spin text-blue-500" />
          </div>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Syncing your Google reviews…</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Fetching reviews for <strong>{connectedLocationName ?? "your location"}</strong>
          </p>
          <p className="text-xs text-muted-foreground mt-3">This usually takes under 10 seconds.</p>
        </div>
      </div>
    );
  }

  // ── SUCCESS ───────────────────────────────────────────────────────────────

  if (step === "success") {
    return (
      <div className="space-y-6 max-w-lg mx-auto py-4">
        {/* Hero */}
        <div className="flex flex-col items-center text-center gap-4 py-6">
          <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center">
            <CheckCircle2 size={30} className="text-emerald-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Google Business Connected!</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Your salon is live and reviews are syncing automatically.
            </p>
          </div>
        </div>

        {/* Location card */}
        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="py-4 px-5 space-y-3">
            <div className="flex items-center gap-2">
              <Building2 size={15} className="text-blue-600" />
              <span className="text-sm font-semibold text-blue-900">Connected Location</span>
            </div>
            {connectedLocationName && (
              <div>
                <p className="text-base font-bold text-blue-900">{connectedLocationName}</p>
                {connectedLocationAddr && (
                  <p className="text-sm text-blue-700 flex items-center gap-1 mt-0.5">
                    <MapPin size={12} />
                    {connectedLocationAddr}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sync stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="py-4 px-3 text-center">
              <p className="text-2xl font-bold text-gray-900">{syncedCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Reviews synced</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 px-3 text-center">
              <div className="flex items-center justify-center gap-1">
                <p className="text-2xl font-bold text-gray-900">
                  {syncStats?.averageRating ?? (syncedCount > 0 ? "—" : "—")}
                </p>
                <Star size={14} className="fill-yellow-400 text-yellow-400 mb-0.5" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Avg rating</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 px-3 text-center">
              <div className="flex items-center justify-center gap-1">
                <Sparkles size={14} className="text-emerald-500 mb-0.5" />
                <p className="text-sm font-bold text-emerald-600">Auto</p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Syncs every 6h</p>
            </CardContent>
          </Card>
        </div>

        {syncedCount === 0 && (
          <p className="text-xs text-center text-muted-foreground">
            No reviews on Google yet — they'll appear here as you receive them.
          </p>
        )}

        {/* CTA */}
        <Button
          onClick={onConnectSuccess ?? (() => loadProfile())}
          className="w-full gap-2"
          size="lg"
        >
          {onConnectSuccess ? (
            <>
              View My Reviews
              <ArrowRight size={16} />
            </>
          ) : (
            <>
              <CheckCircle2 size={16} />
              Done
            </>
          )}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          Your reviews sync automatically every 6 hours. You can also manually sync from the Reviews tab.
        </p>
      </div>
    );
  }

  // ── LOADING ───────────────────────────────────────────────────────────────

  if (step === "loading") {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-gray-400" size={28} />
      </div>
    );
  }

  // ── CONNECTED (returning user) ─────────────────────────────────────────────

  if (step === "connected" && profile) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="text-blue-600" size={22} />
              <CardTitle>Google Business Profile</CardTitle>
            </div>
            <CardDescription>
              Your Google Business Profile is connected and reviews sync automatically every 6 hours.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {errorMsg && (
              <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Status banner — green when healthy, amber when location not selected */}
            {profile.isConnected ? (
              <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle2 className="text-green-600 flex-shrink-0 mt-0.5" size={18} />
                <div>
                  <h4 className="font-medium text-green-900 text-sm">Connected</h4>
                  <p className="text-sm text-green-700 mt-0.5">
                    Reviews sync automatically every 6 hours.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={18} />
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-amber-900 text-sm">No location selected</h4>
                  <p className="text-sm text-amber-700 mt-0.5">
                    Your Google account is linked but no business location has been chosen yet.
                    If you've already signed in with Google, use <strong>Select Location</strong> to pick one instantly — no sign-in needed. Otherwise, use <strong>Reconnect</strong>.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button
                      size="sm"
                      onClick={handleSelectFromStoredAccounts}
                      disabled={loading}
                      className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      {loading
                        ? <Loader2 size={13} className="animate-spin" />
                        : <List size={13} />}
                      Select Location
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleStartAuth}
                      disabled={loading}
                      className="gap-1.5 border-amber-400 text-amber-800 hover:bg-amber-100"
                    >
                      <RotateCcw size={13} />
                      Reconnect
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Business details */}
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 space-y-3">
              <h4 className="text-sm font-semibold text-blue-900 flex items-center gap-2">
                <ShieldCheck size={15} className="text-blue-600" />
                Connected Business
              </h4>
              {profile.businessName ? (
                <div className="space-y-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-blue-600 font-medium uppercase tracking-wide">Business / Location Name</span>
                    <span className="text-sm font-semibold text-blue-900">{profile.businessName}</span>
                  </div>
                  {(profile as any).locationAddress && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-blue-600 font-medium uppercase tracking-wide">Address</span>
                      <span className="text-sm text-blue-800">{(profile as any).locationAddress}</span>
                    </div>
                  )}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-blue-600 font-medium uppercase tracking-wide">Google Location ID</span>
                    <span className="text-xs font-mono bg-white border border-blue-200 rounded px-2 py-1 text-blue-800 break-all">
                      {profile.locationId ?? profile.locationResourceName ?? "—"}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-blue-700">
                  No location selected yet.
                </p>
              )}
            </div>

            {/* Meta */}
            <div className="rounded-lg border bg-gray-50 p-4 space-y-2 text-sm">
              {profile.googleAccountEmail && (
                <div className="flex justify-between gap-4">
                  <span className="text-gray-500 shrink-0">Google Account</span>
                  <span className="font-medium text-right truncate">{profile.googleAccountEmail}</span>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <span className="text-gray-500 shrink-0">Last Synced</span>
                <span className="font-medium text-right">
                  {profile.lastSyncedAt
                    ? new Date(profile.lastSyncedAt).toLocaleString()
                    : "Not yet synced"}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500 shrink-0">Status</span>
                <Badge variant={profile.isConnected ? "default" : "outline"} className="text-xs">
                  {profile.isConnected ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>

            {/* Profile Completion Assistant */}
            {storeId && profile.isConnected && (
              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-semibold text-gray-800">Profile Completion Assistant</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    We check what's already on Google and only fill in the gaps — we never overwrite
                    data you've already set there.
                  </p>
                </div>
                <GoogleProfileAudit storeId={storeId} />

                {/* Advanced: manual full-sync */}
                <details className="group">
                  <summary className="text-xs text-muted-foreground cursor-pointer select-none hover:text-slate-600 list-none flex items-center gap-1">
                    <span className="group-open:hidden">▸</span>
                    <span className="hidden group-open:inline">▾</span>
                    Manual full sync (advanced)
                  </summary>
                  <div className="mt-2">
                    <GoogleListingSyncPanel storeId={storeId} />
                  </div>
                </details>
              </div>
            )}

            {/* Data & Permissions */}
            <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 space-y-2">
              <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <ShieldCheck size={14} className="text-gray-500" />
                Data &amp; Permissions
              </h4>
              <div className="space-y-1 text-xs text-gray-600">
                <p>✓ <strong>Certxa accesses:</strong> business listing info, public reviews, and website URL field only</p>
                <p>✗ <strong>Not accessed:</strong> Gmail, Drive, Calendar, Contacts, or any personal Google data</p>
                <p>✓ <strong>Scope:</strong> Google Business Profile management (<code className="bg-gray-100 px-1 rounded text-gray-700">business.manage</code>) — used only to operate this feature for you</p>
              </div>
              <div className="pt-1 flex flex-wrap gap-4 text-xs">
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-blue-600 hover:underline font-medium"
                >
                  Revoke Google permissions →
                </a>
                <a href="/privacy#google-api" className="text-gray-500 hover:underline">
                  Privacy Policy →
                </a>
                <a href="/google-data-policy" className="text-gray-500 hover:underline">
                  Google Data Policy →
                </a>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={loadProfile}
                disabled={loading}
                className="flex-1 gap-2 min-w-[110px]"
              >
                <RefreshCw size={14} />
                Refresh
              </Button>
              <Button
                variant="outline"
                onClick={handleSelectFromStoredAccounts}
                disabled={loading}
                className="flex-1 gap-2 min-w-[130px] border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <List size={14} />}
                Select Location
              </Button>
              <Button
                variant="outline"
                onClick={handleStartAuth}
                disabled={loading}
                className="flex-1 gap-2 min-w-[110px]"
              >
                <RotateCcw size={14} />
                Reconnect
              </Button>
              <Button
                variant="destructive"
                onClick={handleDisconnect}
                disabled={loading}
                className="flex-1 gap-2 min-w-[110px]"
              >
                <LogOut size={14} />
                Disconnect
              </Button>
            </div>

            <p className="text-xs text-gray-400 text-center">
              <strong>Select Location</strong> picks from your already-authorized accounts.{" "}
              <strong>Reconnect</strong> re-links via Google sign-in.{" "}
              <strong>Disconnect</strong> revokes access and removes all synced review data.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── SELECT ACCOUNT / SELECT LOCATION (wizard steps) ───────────────────────

  const isSelectAccount  = step === "select-account";
  const isSelectLocation = step === "select-location";

  // Step numbers: account selection is step 1 (if shown), location is step 1 or 2
  const totalSteps   = accounts.length > 1 ? 3 : 2; // account + location + sync  OR  location + sync
  const currentStep  = isSelectAccount ? 0 : isSelectLocation ? (accounts.length > 1 ? 1 : 0) : 1;

  return (
    <div className="space-y-4 max-w-lg">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-blue-600" size={20} />
            <CardTitle className="text-base">Google Business Setup</CardTitle>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* Step dots */}
          <StepDots current={currentStep} total={totalSteps} />

          {/* Error */}
          {errorMsg && (
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ── SELECT ACCOUNT ── */}
          {isSelectAccount && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-0.5">Select your business account</h3>
                <p className="text-xs text-muted-foreground">Choose the Google account that manages your salon.</p>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {accounts.map((acct) => {
                  const name = acct.accountName ?? acct.displayName ?? acct.name;
                  const selected = selectedAccount === acct.name;
                  return (
                    <button
                      key={acct.name}
                      onClick={() => setSelectedAccount(acct.name)}
                      className={`w-full text-left p-3 border rounded-xl transition-all flex items-center gap-3 ${
                        selected
                          ? "border-blue-400 bg-blue-50 ring-1 ring-blue-300"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                        selected ? "border-blue-500 bg-blue-500" : "border-gray-300"
                      }`}>
                        {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <span className="text-sm font-medium text-gray-900">{name}</span>
                    </button>
                  );
                })}
              </div>
              <Button
                onClick={handleSelectAccount}
                disabled={!selectedAccount || loading}
                className="w-full gap-2"
              >
                {loading ? (
                  <><Loader2 size={15} className="animate-spin" /> Loading locations…</>
                ) : (
                  <>Continue <ChevronRight size={15} /></>
                )}
              </Button>
            </div>
          )}

          {/* ── SELECT LOCATION ── */}
          {isSelectLocation && (
            <div className="space-y-4">
              {locations.length === 0 ? (
                <div className="py-8 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto">
                    <MapPin size={20} className="text-amber-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">No locations found</h3>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                      No locations were found under <strong>{noLocAcctName}</strong>.
                      Please add a location to your Google Business Profile at{" "}
                      <a href="https://business.google.com" target="_blank" rel="noreferrer" className="text-blue-600 underline">
                        business.google.com
                      </a>{" "}
                      and try again.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStep(accounts.length > 1 ? "select-account" : "initial")}
                  >
                    ← Go Back
                  </Button>
                </div>
              ) : (
                <>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-0.5">Select your salon location</h3>
                    <p className="text-xs text-muted-foreground">
                      {locations.length === 1
                        ? "Connecting your location…"
                        : `${locations.length} locations found. Choose the one to connect.`}
                    </p>
                  </div>

                  {loading && locations.length === 1 ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 size={22} className="animate-spin text-gray-400" />
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {locations.map((loc) => {
                        const title   = loc.title ?? loc.displayName ?? loc.name;
                        const address = formatAddress(loc.storefrontAddress);
                        const locId   = loc.name.split("/locations/")[1] ?? loc.name.split("/").pop() ?? "";
                        return (
                          <button
                            key={loc.name}
                            onClick={() => !loading && handleSelectLocation(loc)}
                            disabled={loading}
                            className="w-full text-left p-4 border border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50/40 transition-all group disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Building2 size={14} className="text-blue-500 shrink-0" />
                                  <span className="text-sm font-semibold text-gray-900 truncate">{title}</span>
                                </div>
                                {address && (
                                  <p className="text-xs text-gray-500 flex items-center gap-1 mb-1">
                                    <MapPin size={11} className="shrink-0" />
                                    {address}
                                  </p>
                                )}
                                <p className="text-xs font-mono text-gray-400">{locId}</p>
                              </div>
                              <div className="flex items-center gap-1 text-blue-600 text-xs font-semibold shrink-0 group-hover:gap-2 transition-all">
                                Select
                                <ChevronRight size={14} />
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {accounts.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStep("select-account")}
                      disabled={loading}
                      className="text-xs text-muted-foreground"
                    >
                      ← Wrong account?
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
