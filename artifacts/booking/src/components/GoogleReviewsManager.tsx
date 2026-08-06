import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Star,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  BarChart2,
  MessageSquare,
  TrendingUp,
  Clock,
  CalendarClock,
  Sparkles,
  MapPin,
  Building2,
  ChevronDown,
  ChevronUp,
  WifiOff,
  Zap,
  History,
  XCircle,
} from "lucide-react";
import axios from "axios";
import { GoogleReview } from "@shared/schema";
import { ReviewResponseDialog } from "@/components/ReviewResponseDialog";
import { BulkDraftModal } from "@/components/BulkDraftModal";
import { ReviewSentimentDashboard } from "@/components/ReviewSentimentDashboard";
import { InlineReplyDrafter } from "@/components/InlineReplyDrafter";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ReviewStats {
  totalReviews: number;
  averageRating: number | string;
  respondedReviews: number;
  notRespondedReviews: number;
  ratingDistribution: { 5: number; 4: number; 3: number; 2: number; 1: number };
  lastSyncedAt: string | null;
  nextSyncAt: string | null;
}

interface ConnectedProfile {
  businessName: string | null;
  locationId: string | null;
  locationResourceName: string | null;
  locationAddress: string | null;
  googleAccountEmail: string | null;
  lastSyncedAt: string | null;
  isConnected: boolean;
}

interface SyncLog {
  id: number;
  syncType: string;
  status: "success" | "failed";
  errorMessage: string | null;
  reviewsSynced: number | null;
  syncedAt: string | null;
  locationId: number | null;
}

interface SyncResult {
  synced: number;
  inserted: number;
  updated: number;
  locationResourceName: string;
  businessName: string | null;
  durationMs: number;
  source: "new_schema" | "legacy";
  syncLogId: number | null;
}

type SyncPhase =
  | "idle"
  | "starting"
  | "fetching"
  | "processing"
  | "saving"
  | "done"
  | "error";

interface GoogleReviewsManagerProps {
  storeId?: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

function formatAbsoluteTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const PHASE_LABELS: Record<SyncPhase, string> = {
  idle:       "",
  starting:   "Starting sync…",
  fetching:   "Fetching from Google…",
  processing: "Processing reviews…",
  saving:     "Saving to database…",
  done:       "Sync complete",
  error:      "Sync failed",
};

// ── Component ──────────────────────────────────────────────────────────────────

export function GoogleReviewsManager({ storeId: propStoreId }: GoogleReviewsManagerProps = {}) {
  const params = useParams();
  const storeId = propStoreId ?? (params?.storeId ? Number(params.storeId) : null);

  const [reviews, setReviews]                   = useState<GoogleReview[]>([]);
  const [stats, setStats]                       = useState<ReviewStats | null>(null);
  const [connectedProfile, setConnectedProfile] = useState<ConnectedProfile | null>(null);
  const [syncLogs, setSyncLogs]                 = useState<SyncLog[]>([]);
  const [loading, setLoading]                   = useState(true);
  const [syncPhase, setSyncPhase]               = useState<SyncPhase>("idle");
  const [syncResult, setSyncResult]             = useState<SyncResult | null>(null);
  const [syncError, setSyncError]               = useState<string | null>(null);
  const [showSyncHistory, setShowSyncHistory]   = useState(false);
  const [filterRating, setFilterRating]         = useState<number | null>(null);
  const [filterStatus, setFilterStatus]         = useState<string | null>(null);
  const [filterDays, setFilterDays]             = useState<number | null>(null);
  const [selectedReview, setSelectedReview]     = useState<GoogleReview | null>(null);
  const [showBulkDraft, setShowBulkDraft]       = useState(false);
  const [activeInlineDraft, setActiveInlineDraft] = useState<number | null>(null);
  const [cooldownSecsLeft, setCooldownSecsLeft] = useState<number>(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const COOLDOWN_SECS = 300; // 5 minutes
  const cooldownKey = storeId ? `google_sync_cooldown_${storeId}` : null;

  const syncing = syncPhase !== "idle" && syncPhase !== "done" && syncPhase !== "error";
  const inCooldown = cooldownSecsLeft > 0;

  // Restore cooldown from localStorage on mount
  useEffect(() => {
    if (!cooldownKey) return;
    const stored = localStorage.getItem(cooldownKey);
    if (stored) {
      const remaining = Math.ceil((Number(stored) - Date.now()) / 1000);
      if (remaining > 0) startCooldownTimer(remaining);
      else localStorage.removeItem(cooldownKey);
    }
  }, [cooldownKey]);

  function startCooldownTimer(secs: number) {
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current);
    setCooldownSecsLeft(secs);
    cooldownTimerRef.current = setInterval(() => {
      setCooldownSecsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownTimerRef.current!);
          cooldownTimerRef.current = null;
          if (cooldownKey) localStorage.removeItem(cooldownKey);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function formatCooldown(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
  }

  useEffect(() => {
    if (storeId) {
      loadAll();
    }
  }, [storeId, filterRating, filterStatus]);

  // ── Data loaders ─────────────────────────────────────────────────────────────

  const loadAll = async () => {
    await Promise.all([loadReviews(), loadStats(), loadProfile(), loadSyncLogs()]);
  };

  const loadProfile = async () => {
    if (!storeId) return;
    try {
      const response = await axios.get(`/api/google-business/profile/${storeId}`);
      if (response.data.profile) setConnectedProfile(response.data.profile);
    } catch {
      // Non-fatal — connection status may simply not be set up yet
    }
  };

  const loadReviews = async () => {
    if (!storeId) return;
    try {
      setLoading(true);
      const p: Record<string, any> = { limit: 50 };
      if (filterRating) p.rating = filterRating;
      if (filterStatus) p.status = filterStatus;
      const response = await axios.get(`/api/google-business/reviews/${storeId}`, { params: p });
      setReviews(response.data.reviews);
    } catch {
      // keep existing reviews
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    if (!storeId) return;
    try {
      const response = await axios.get(`/api/google-business/reviews-stats/${storeId}`);
      setStats(response.data);
    } catch {
      // keep existing stats
    }
  };

  const loadSyncLogs = async () => {
    if (!storeId) return;
    try {
      const response = await axios.get(`/api/google-business/sync-logs/${storeId}?limit=10`);
      setSyncLogs(response.data.logs ?? []);
    } catch {
      // non-fatal
    }
  };

  // ── Sync handler ──────────────────────────────────────────────────────────────

  const handleSyncReviews = async () => {
    if (!storeId || syncing || inCooldown) return;

    setSyncResult(null);
    setSyncError(null);
    setSyncPhase("starting");

    // Animate phases on a timer — the real work happens in the POST
    const phaseTimer = setTimeout(() => setSyncPhase("fetching"), 600);
    const phaseTimer2 = setTimeout(() => setSyncPhase("processing"), 2500);

    try {
      const response = await axios.post(`/api/google-business/sync-reviews/${storeId}`);
      clearTimeout(phaseTimer);
      clearTimeout(phaseTimer2);

      setSyncPhase("saving");
      const result: SyncResult = response.data;

      // Small pause on "saving" so the user sees it briefly
      await new Promise<void>((r) => setTimeout(r, 400));
      setSyncResult(result);
      setSyncPhase("done");

      // Start cooldown to prevent rapid re-syncing
      if (cooldownKey) localStorage.setItem(cooldownKey, String(Date.now() + COOLDOWN_SECS * 1000));
      startCooldownTimer(COOLDOWN_SECS);

      // Refresh all data after sync
      await Promise.all([loadReviews(), loadStats(), loadProfile(), loadSyncLogs()]);

      // Reset to idle after 6 seconds
      setTimeout(() => {
        setSyncPhase("idle");
        setSyncResult(null);
      }, 6000);
    } catch (err: any) {
      clearTimeout(phaseTimer);
      clearTimeout(phaseTimer2);

      const httpStatus = err?.response?.status ?? err?.status ?? err?.code ?? 0;
      const raw = err?.response?.data?.message ?? err?.message ?? "Failed to sync reviews.";

      // Translate technical errors into specific, actionable messages.
      // Order matters: check HTTP status codes FIRST (most reliable), then raw text.
      let friendly = raw;
      if (httpStatus === 403) {
        // Keep the exact backend/Google detail when available.
        // This now includes Google API error text so users know exactly what to enable/fix.
        friendly = raw || "Google denied access (403).";
      } else if (raw.includes("PERMISSION_DENIED") || raw.includes("API") && raw.includes("enabled")) {
        friendly = "Google denied access. Check your Google Cloud API enablement and OAuth app configuration.";
      } else if (httpStatus === 429 || raw.toLowerCase().includes("quota cooldown") || raw.toLowerCase().includes("quota")) {
        // Pass through the actual API message — it may include an actionable quota-increase link.
        // Fall back to a generic message only if the raw text is empty or unhelpfully terse.
        friendly = raw && raw.length > 20 ? raw : "Google API quota limit reached. Please wait a few minutes and try again.";
      } else if (raw.includes("No active location") || raw.includes("No location connected")) {
        friendly = "No active Google Business location is selected. Go to the Connection tab and select a location.";
      } else if (raw.includes("token") || raw.includes("credential") || raw.includes("auth")) {
        friendly = "Unable to authenticate with Google. Please reconnect your Google Business Profile.";
      } else if (raw.includes("404") || raw.includes("not found")) {
        friendly = "Your connected location was not found on Google. Please reconnect and reselect your location.";
      }

      setSyncError(friendly);
      setSyncPhase("error");

      // Start a shorter cooldown on error (2 minutes) to prevent hammering on failure
      const errorCooldown = 120;
      if (cooldownKey) localStorage.setItem(cooldownKey, String(Date.now() + errorCooldown * 1000));
      startCooldownTimer(errorCooldown);

      // Reload sync logs — the failed attempt was logged
      await loadSyncLogs();

      setTimeout(() => {
        setSyncPhase("idle");
        setSyncError(null);
      }, 12000);
    }
  };

  // ── Sub-renders ───────────────────────────────────────────────────────────────

  const renderStarRating = (rating: number) => (
    <div className="flex items-center gap-1">
      {[...Array(5)].map((_, i) => (
        <Star key={i} size={16} className={i < rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"} />
      ))}
      <span className="ml-2 text-sm font-medium">{rating}/5</span>
    </div>
  );

  const renderStarLabel = (rating: number) => (
    <div className="flex items-center gap-0.5">
      {[...Array(5)].map((_, i) => (
        <Star key={i} size={12} className={i < rating ? "fill-yellow-400 text-yellow-400" : "text-gray-200"} />
      ))}
    </div>
  );

  const renderConnectionStatus = () => {
    if (!connectedProfile) return null;

    if (!connectedProfile.isConnected || !connectedProfile.locationResourceName) {
      return (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="py-3 px-4">
            <div className="flex items-start gap-3">
              <WifiOff size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">No active Google Business location selected</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Go to the <strong>Connection</strong> tab and connect your Google Business Profile, then select a location.
                  Reviews cannot be synced until a location is active.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    const health = (() => {
      if (!connectedProfile.lastSyncedAt) return "warning";
      const ms = Date.now() - new Date(connectedProfile.lastSyncedAt).getTime();
      if (ms < 7 * 60 * 60 * 1000) return "healthy";   // synced within 7h
      if (ms < 24 * 60 * 60 * 1000) return "warning";  // synced within 24h
      return "stale";
    })();

    const healthDot: Record<string, string> = {
      healthy: "bg-green-500",
      warning: "bg-amber-400",
      stale:   "bg-red-400",
    };
    const healthLabel: Record<string, string> = {
      healthy: "Syncing normally",
      warning: "Sync overdue",
      stale:   "Sync stale — check connection",
    };

    return (
      <Card className="border-green-200 bg-green-50/40">
        <CardContent className="py-3 px-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <Building2 size={16} className="text-green-700" />
              <span className="text-sm font-semibold text-green-900">Connected Business</span>
              <span className="flex items-center gap-1 text-xs text-green-700">
                <span className={`inline-block w-2 h-2 rounded-full ${healthDot[health]}`} />
                {healthLabel[health]}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              {connectedProfile.businessName && (
                <span className="font-medium text-green-900">{connectedProfile.businessName}</span>
              )}
              {connectedProfile.googleAccountEmail && (
                <span className="text-xs text-green-700">{connectedProfile.googleAccountEmail}</span>
              )}
              {connectedProfile.locationAddress && (
                <span className="flex items-center gap-1 text-green-700">
                  <MapPin size={13} />
                  {connectedProfile.locationAddress}
                </span>
              )}
              {connectedProfile.locationId && (
                <span className="text-xs font-mono text-green-600 bg-white border border-green-200 rounded px-1.5 py-0.5">
                  ID: {connectedProfile.locationId}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderSyncFeedback = () => {
    if (syncPhase === "idle") return null;

    if (syncPhase === "error" && syncError) {
      const isQuotaError = syncError.toLowerCase().includes("quota") || syncError.toLowerCase().includes("cooldown");
      return (
        <div className="flex flex-col gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <div className="flex items-start gap-3">
            <XCircle size={16} className="flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium mb-0.5">Sync failed</p>
              <p>{syncError}</p>
              {syncError.includes("support.google.com") && (
                <a
                  href="https://support.google.com/business/contact/api_default_quota_increase"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-1.5 text-xs font-semibold text-blue-700 underline underline-offset-2"
                >
                  Request a Google quota increase →
                </a>
              )}
            </div>
          </div>
          {isQuotaError && (
            <button
              onClick={async () => {
                try {
                  await fetch("/api/google-business/clear-quota-cooldown", { method: "POST" });
                  setSyncPhase("idle");
                  setSyncError(null);
                } catch { /* silent */ }
              }}
              className="self-start ml-6 text-xs font-semibold text-red-600 underline underline-offset-2 hover:text-red-800 transition-colors"
            >
              Clear quota lock and try again
            </button>
          )}
        </div>
      );
    }

    if (syncPhase === "done" && syncResult) {
      const newBadge = syncResult.inserted > 0
        ? <span className="text-emerald-700 font-semibold">{syncResult.inserted} new</span>
        : null;
      const updBadge = syncResult.updated > 0
        ? <span className="text-blue-700 font-semibold">{syncResult.updated} updated</span>
        : null;
      const noneMsg = syncResult.synced === 0
        ? <span className="text-gray-500">No reviews found on Google yet</span>
        : null;

      return (
        <div className="flex items-start gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
          <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5 text-emerald-600" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold">
              Sync complete —{" "}
              {noneMsg ?? (
                <>
                  {syncResult.synced} review{syncResult.synced !== 1 ? "s" : ""} synced
                  {(newBadge || updBadge) && (
                    <span className="font-normal text-xs ml-1 text-emerald-700">
                      ({[newBadge, updBadge].filter(Boolean).map((b, i) => (
                        <span key={i}>{i > 0 ? ", " : ""}{b}</span>
                      ))})
                    </span>
                  )}
                </>
              )}
            </p>
            <p className="text-xs text-emerald-600 mt-0.5">
              {syncResult.durationMs}ms · source: {syncResult.source === "new_schema" ? "new schema" : "legacy profile"}
              {syncResult.syncLogId ? ` · log #${syncResult.syncLogId}` : ""}
            </p>
          </div>
        </div>
      );
    }

    if (syncing) {
      return (
        <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <Loader2 size={16} className="animate-spin flex-shrink-0 text-blue-600" />
          <span className="font-medium">{PHASE_LABELS[syncPhase]}</span>
        </div>
      );
    }

    return null;
  };

  const renderSyncHistory = () => {
    if (syncLogs.length === 0 && !showSyncHistory) return null;

    return (
      <Card className="border-white/10 bg-white/5">
        <CardHeader
          className="py-3 px-4 cursor-pointer select-none"
          onClick={() => setShowSyncHistory((v) => !v)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History size={14} className="text-muted-foreground" />
              <CardTitle className="text-sm font-semibold">Sync History</CardTitle>
              {syncLogs.length > 0 && (
                <Badge variant="outline" className="text-xs h-5 px-1.5">
                  {syncLogs.length}
                </Badge>
              )}
            </div>
            {showSyncHistory ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
          </div>
          {!showSyncHistory && syncLogs.length > 0 && (
            <CardDescription className="text-xs mt-0.5">
              Last sync: {formatRelativeTime(syncLogs[0]?.syncedAt ?? null)} —{" "}
              <span className={syncLogs[0]?.status === "success" ? "text-emerald-600" : "text-red-500"}>
                {syncLogs[0]?.status === "success"
                  ? `${syncLogs[0].reviewsSynced ?? 0} reviews synced`
                  : "failed"}
              </span>
            </CardDescription>
          )}
        </CardHeader>

        {showSyncHistory && (
          <CardContent className="pt-0 pb-4 px-4">
            {syncLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sync attempts recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {syncLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`flex items-start gap-3 rounded-lg px-3 py-2 text-sm border ${
                      log.status === "success"
                        ? "bg-emerald-50/60 border-emerald-100"
                        : "bg-red-50/60 border-red-100"
                    }`}
                  >
                    {log.status === "success" ? (
                      <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-medium ${log.status === "success" ? "text-emerald-800" : "text-red-700"}`}>
                          {log.status === "success" ? "Success" : "Failed"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatAbsoluteTime(log.syncedAt)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({formatRelativeTime(log.syncedAt)})
                        </span>
                        {log.reviewsSynced !== null && log.status === "success" && (
                          <Badge variant="outline" className="text-xs h-4 px-1.5 text-emerald-700 border-emerald-200">
                            {log.reviewsSynced} reviews
                          </Badge>
                        )}
                        {log.locationId && (
                          <span className="text-xs font-mono text-muted-foreground">loc #{log.locationId}</span>
                        )}
                      </div>
                      {log.errorMessage && (
                        <p className="text-xs text-red-600 mt-1 break-words">{log.errorMessage}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    );
  };

  // ── Response rate ─────────────────────────────────────────────────────────────

  const responseRate =
    stats && stats.totalReviews > 0
      ? Math.round((stats.respondedReviews / stats.totalReviews) * 100)
      : 0;

  // Client-side date filtering
  const now = Date.now();
  const filterDayMs = filterDays !== null ? filterDays * 24 * 60 * 60 * 1000 : null;
  const displayedReviews = reviews.filter((r) => {
    if (filterDayMs === null) return true;
    if (!r.reviewCreateTime) return false;
    return now - new Date(r.reviewCreateTime).getTime() <= filterDayMs;
  });

  // Draft Replies button count — always capped at 30 days max
  const thirtyDayMs = 30 * 24 * 60 * 60 * 1000;
  const bulkDraftCount = reviews.filter(
    (r) =>
      r.responseStatus !== "responded" &&
      r.reviewCreateTime &&
      now - new Date(r.reviewCreateTime).getTime() <= thirtyDayMs,
  ).length;

  if (!storeId) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="text-red-700">Invalid Store</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Connection status */}
      {renderConnectionStatus()}

      {/* Sync feedback (phases / result / error) */}
      {renderSyncFeedback()}

      {/* Sync Control Bar */}
      <Card className="border-blue-100 bg-blue-50/50">
        <CardContent className="py-3 px-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            {/* Last sync info */}
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-sm text-blue-800">
                <Clock size={14} className="shrink-0" />
                <span className="font-medium">Last synced:</span>
                <span
                  className="text-blue-700"
                  title={stats?.lastSyncedAt ? formatAbsoluteTime(stats.lastSyncedAt) : undefined}
                >
                  {stats ? formatRelativeTime(stats.lastSyncedAt) : "—"}
                </span>
                {stats?.lastSyncedAt && (
                  <span className="text-blue-500 text-xs hidden sm:inline">
                    ({formatAbsoluteTime(stats.lastSyncedAt)})
                  </span>
                )}
              </div>

              {stats?.nextSyncAt && (
                <div className="flex items-center gap-1.5 text-sm text-blue-700">
                  <CalendarClock size={14} className="shrink-0" />
                  <span className="font-medium">Next auto-sync:</span>
                  <span className="text-blue-600 text-xs hidden sm:inline">
                    {formatAbsoluteTime(stats.nextSyncAt)}
                  </span>
                  <span className="text-blue-600 text-xs sm:hidden">
                    {formatRelativeTime(stats.nextSyncAt)}
                  </span>
                </div>
              )}

              {!stats?.lastSyncedAt && stats !== null && (
                <span className="text-sm text-blue-600 flex items-center gap-1">
                  <Zap size={12} />
                  Auto-syncs every 6 hours — click Sync Now to pull reviews immediately.
                </span>
              )}
            </div>

            {/* Sync button + Bulk draft button */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                onClick={handleSyncReviews}
                disabled={syncing || inCooldown}
                size="sm"
                variant="outline"
                className={`gap-1.5 ${inCooldown ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed" : "border-blue-300 bg-white text-blue-800 hover:bg-blue-50"}`}
                title={inCooldown ? `Available again in ${formatCooldown(cooldownSecsLeft)}` : "Pull latest reviews from Google now"}
              >
                {syncing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {PHASE_LABELS[syncPhase].replace("…", "")}…
                  </>
                ) : inCooldown ? (
                  <>
                    <RefreshCw size={14} />
                    {formatCooldown(cooldownSecsLeft)}
                  </>
                ) : (
                  <>
                    <RefreshCw size={14} />
                    Sync Now
                  </>
                )}
              </Button>
              {bulkDraftCount > 0 && (
                <Button
                  onClick={() => setShowBulkDraft(true)}
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-violet-300 bg-white text-violet-700 hover:bg-violet-50"
                  title="Drafts AI replies for reviews from the last 30 days only"
                >
                  <Sparkles size={14} />
                  Draft {bulkDraftCount} Repl{bulkDraftCount === 1 ? "y" : "ies"}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary stat cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Total Reviews</p>
              <p className="text-3xl font-bold">{stats.totalReviews}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Average Rating</p>
              <div className="flex items-end gap-2">
                <p className="text-3xl font-bold">{stats.averageRating}</p>
                <Star size={18} className="fill-yellow-400 text-yellow-400 mb-1" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Response Rate</p>
              <div className="flex items-end gap-2">
                <p className="text-3xl font-bold">{responseRate}%</p>
                <TrendingUp size={16} className="text-emerald-500 mb-1" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.respondedReviews} of {stats.totalReviews} responded
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Awaiting Response</p>
              <div className="flex items-end gap-2">
                <p className="text-3xl font-bold text-amber-500">{stats.notRespondedReviews}</p>
                <MessageSquare size={16} className="text-amber-500 mb-1" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Rating distribution + compliance panel */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <BarChart2 size={16} className="text-muted-foreground" />
                <CardTitle className="text-sm font-semibold">Rating Distribution</CardTitle>
              </div>
              <CardDescription className="text-xs">All reviews shown — no filtering or suppression</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {([5, 4, 3, 2, 1] as const).map((star) => {
                const count = stats.ratingDistribution[star] ?? 0;
                const pct = stats.totalReviews > 0 ? (count / stats.totalReviews) * 100 : 0;
                return (
                  <div key={star} className="flex items-center gap-3">
                    {renderStarLabel(star)}
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-yellow-400 transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-6 text-right">{count}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-emerald-200 bg-emerald-50/50">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-600" />
                <CardTitle className="text-sm font-semibold text-emerald-800">Google Policy Compliance</CardTitle>
              </div>
              <CardDescription className="text-xs text-emerald-700">
                This integration follows Google's Business Profile API policies
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                "All reviews displayed as-is — no suppression or hiding",
                "Ratings are read-only — never modified or manipulated",
                "Reviews are never automatically deleted",
                "Responses require manual review and publishing by you",
                "Sync pulls all reviews regardless of rating",
                "You can disconnect and remove all data at any time",
              ].map((item) => (
                <div key={item} className="flex items-start gap-2">
                  <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                  <span className="text-xs text-emerald-800">{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sentiment Dashboard */}
      {stats && stats.totalReviews > 0 && storeId && (
        <ReviewSentimentDashboard storeId={storeId} />
      )}

      {/* Review filters */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        {/* Date filter pills */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground mr-1">Show:</span>
          {([3, 7, 30, null] as (number | null)[]).map((d) => {
            const label = d === null ? "All" : `${d} days`;
            const active = filterDays === d;
            return (
              <button
                key={String(d)}
                onClick={() => setFilterDays(d)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? "bg-violet-600 border-violet-600 text-white"
                    : "bg-white border-gray-300 text-gray-600 hover:border-violet-400 hover:text-violet-700"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Status + Rating selects */}
        <div className="flex gap-2">
          <select
            value={filterStatus || ""}
            onChange={(e) => setFilterStatus(e.target.value || null)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="">All Statuses</option>
            <option value="responded">Responded</option>
            <option value="not_responded">Not Responded</option>
          </select>

          <select
            value={filterRating || ""}
            onChange={(e) => setFilterRating(e.target.value ? Number(e.target.value) : null)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="">All Ratings</option>
            <option value="5">5 Stars</option>
            <option value="4">4 Stars</option>
            <option value="3">3 Stars</option>
            <option value="2">2 Stars</option>
            <option value="1">1 Star</option>
          </select>
        </div>
      </div>

      {(filterRating !== null || filterDays !== null) && (
        <p className="text-xs text-muted-foreground">
          {[
            filterDays !== null && `Showing reviews from the last ${filterDays} days.`,
            filterRating !== null && `Filtered to ${filterRating}-star reviews.`,
          ]
            .filter(Boolean)
            .join(" ")}{" "}
          Filters only change your view — all reviews remain on Google and are never hidden or suppressed.
        </p>
      )}

      {/* Reviews List */}
      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin" />
          </CardContent>
        </Card>
      ) : displayedReviews.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-2 text-center">
            <Star size={32} className="text-gray-300" />
            <p className="font-medium text-gray-600">No reviews found</p>
            <p className="text-sm text-muted-foreground">
              {filterRating || filterStatus || filterDays !== null
                ? "Try adjusting your filters to see more reviews."
                : "Use the Sync Now button above to pull in your latest reviews."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {displayedReviews.map((review) => (
            <div key={review.id}>
              <Card
                className="hover:bg-gray-50 transition cursor-pointer"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("[data-inline-drafter]")) return;
                  setSelectedReview(review);
                }}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        {renderStarRating(review.rating)}
                        <Badge
                          variant={review.responseStatus === "responded" ? "default" : "outline"}
                          className="ml-auto"
                        >
                          {review.responseStatus === "responded" ? (
                            <>
                              <CheckCircle2 size={14} className="mr-1" />
                              Responded
                            </>
                          ) : (
                            <>
                              <AlertCircle size={14} className="mr-1" />
                              No Response
                            </>
                          )}
                        </Badge>
                      </div>
                      <CardTitle className="text-lg">{review.customerName}</CardTitle>
                      <CardDescription className="text-sm">
                        {review.reviewCreateTime
                          ? new Date(review.reviewCreateTime).toLocaleDateString()
                          : "Date unknown"}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <p className="text-gray-700">
                    {review.reviewText || (
                      <span className="text-muted-foreground italic">No written review</span>
                    )}
                  </p>

                  {review.reviewImageUrls && (
                    <div className="flex gap-2 flex-wrap">
                      {(() => {
                        try {
                          const urls = JSON.parse(review.reviewImageUrls);
                          return urls.map((url: string, i: number) => (
                            <img key={i} src={url} alt="Review" className="w-20 h-20 object-cover rounded" />
                          ));
                        } catch { return null; }
                      })()}
                    </div>
                  )}

                  <div
                    className="flex items-center justify-between gap-2 pt-1"
                    data-inline-drafter
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="text-xs text-muted-foreground">Click card to view full details</p>

                    {review.responseStatus !== "responded" && storeId && (
                      activeInlineDraft === review.id ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setActiveInlineDraft(null)}
                          className="gap-1.5 text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                        >
                          Hide drafter
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setActiveInlineDraft(review.id)}
                          className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50 shrink-0"
                        >
                          <Sparkles size={13} />
                          Draft Reply
                        </Button>
                      )
                    )}
                  </div>

                  {activeInlineDraft === review.id && storeId && (
                    <div data-inline-drafter onClick={(e) => e.stopPropagation()}>
                      <InlineReplyDrafter
                        storeId={storeId}
                        googleReviewId={review.id}
                        reviewText={review.reviewText}
                        rating={review.rating}
                        customerName={review.customerName}
                        onDraftSaved={() => { loadReviews(); loadStats(); }}
                        onClose={() => setActiveInlineDraft(null)}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}

      {/* Sync History */}
      {renderSyncHistory()}

      {/* Dialogs */}
      {selectedReview && storeId && (
        <ReviewResponseDialog
          review={selectedReview}
          storeId={storeId}
          onClose={() => setSelectedReview(null)}
          onRefresh={() => { loadReviews(); loadStats(); }}
        />
      )}

      {showBulkDraft && stats && (
        <BulkDraftModal
          storeId={storeId}
          unrespondedCount={bulkDraftCount}
          maxDays={30}
          onClose={() => setShowBulkDraft(false)}
          onComplete={() => { loadReviews(); loadStats(); }}
        />
      )}
    </div>
  );
}
