import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Loader2,
  ArrowRight,
  Info,
  Wifi,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type DiffStatus = "match" | "different" | "google_missing" | "certxa_missing";

interface HoursEntry {
  isClosed: boolean;
  openTime: string | null;
  closeTime: string | null;
}

interface DayDiff {
  dayOfWeek: number;
  dayName: string;
  certxa: HoursEntry | null;
  google: HoursEntry | null;
  status: DiffStatus;
}

interface HoursDiff {
  connected: boolean;
  days: DayDiff[];
  hasDiff: boolean;
  googleHasAny: boolean;
  certxaHasAny: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmt12(time: string | null): string {
  if (!time) return "—";
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function formatRange(entry: HoursEntry | null): string {
  if (!entry) return "No data";
  if (entry.isClosed) return "Closed";
  return `${fmt12(entry.openTime)} – ${fmt12(entry.closeTime)}`;
}

function statusBadge(status: DiffStatus) {
  switch (status) {
    case "match":
      return (
        <Badge className="bg-green-50 text-green-700 border-green-200 gap-1 font-normal text-xs">
          <CheckCircle2 size={10} /> Match
        </Badge>
      );
    case "different":
      return (
        <Badge className="bg-amber-50 text-amber-700 border-amber-200 gap-1 font-normal text-xs">
          <AlertCircle size={10} /> Different
        </Badge>
      );
    case "google_missing":
      return (
        <Badge className="bg-blue-50 text-blue-700 border-blue-200 gap-1 font-normal text-xs">
          <Info size={10} /> Not on Google
        </Badge>
      );
    case "certxa_missing":
      return (
        <Badge className="bg-slate-50 text-slate-600 border-slate-200 gap-1 font-normal text-xs">
          <Info size={10} /> Google only
        </Badge>
      );
  }
}

function rowBg(status: DiffStatus) {
  switch (status) {
    case "different":     return "bg-amber-50/60";
    case "google_missing": return "bg-blue-50/40";
    case "certxa_missing": return "bg-slate-50";
    default:              return "";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface GoogleHoursSyncProps {
  storeId: number;
}

export function GoogleHoursSync({ storeId }: GoogleHoursSyncProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [justSynced, setJustSynced] = useState(false);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<HoursDiff>({
    queryKey: ["/api/google-business/hours-diff", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/google-business/hours-diff?storeId=${storeId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to load hours comparison" }));
        throw new Error(err.message ?? "Failed to load hours comparison");
      }
      return res.json();
    },
    staleTime: 0,   // always re-fetch so the comparison reflects the latest saved hours
    retry: false,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/google-business/sync-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Sync failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setJustSynced(true);
      queryClient.invalidateQueries({ queryKey: ["/api/google-business/hours-diff", storeId] });
      queryClient.invalidateQueries({ queryKey: ["/api/google-business/listing-preview", storeId] });
      toast({
        title: "Certxa updated your Google hours.",
        description: "Your business hours are now live on Google Business Profile.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Sync failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 flex items-center justify-center gap-3 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin" />
        Comparing your Certxa hours with Google…
      </div>
    );
  }

  // ── Error / not connected ────────────────────────────────────────────────
  if (isError || !data) {
    const msg = (error as Error)?.message ?? "Could not load hours comparison.";
    const isAuth = msg.toLowerCase().includes("token") || msg.toLowerCase().includes("reconnect");
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 space-y-3">
        <div className="flex items-start gap-3">
          <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-amber-900">
              {isAuth ? "Google connection expired" : "Could not compare hours"}
            </p>
            <p className="text-sm text-amber-700">{msg}</p>
            {isAuth && (
              <p className="text-xs text-amber-600">Go to the <strong>Connection</strong> tab to reconnect your Google Business Profile.</p>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2 border-amber-300 text-amber-800 hover:bg-amber-100">
          <RefreshCw size={13} /> Try again
        </Button>
      </div>
    );
  }

  const diffDays = data.days.filter(d => d.status !== "match");
  const allMatch = !data.hasDiff;

  // ── No hours configured on Certxa ────────────────────────────────────────
  if (!data.certxaHasAny) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center space-y-3">
        <Clock size={32} className="mx-auto text-slate-300" />
        <p className="text-sm font-medium text-slate-700">No hours configured in Certxa yet</p>
        <p className="text-xs text-slate-500">
          Set your salon's open days and times in <strong>Settings → Business Hours</strong>, then come back here to sync them to Google.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className={`rounded-xl border p-5 space-y-1 ${
        allMatch
          ? "border-green-200 bg-green-50/40"
          : "border-amber-200 bg-amber-50/30"
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={16} className={allMatch ? "text-green-600" : "text-amber-600"} />
            <h3 className="text-sm font-semibold text-slate-900">Business Hours</h3>
            {allMatch ? (
              <Badge className="bg-green-100 text-green-800 border-green-200 text-xs font-normal">
                <CheckCircle2 size={10} className="mr-1" /> Google matches Certxa
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs font-normal">
                {diffDays.length} day{diffDays.length !== 1 ? "s" : ""} out of sync
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setJustSynced(false); refetch(); }}
            className="h-7 px-2 text-slate-500 hover:text-slate-700"
          >
            <RefreshCw size={13} />
          </Button>
        </div>
        {allMatch ? (
          <p className="text-xs text-green-700 pl-6">
            Your Google Business hours are up to date with Certxa.
            {justSynced && " Just updated."}
          </p>
        ) : (
          <p className="text-xs text-amber-700 pl-6">
            {!data.googleHasAny
              ? "Google has no hours set yet — Certxa can publish them for you."
              : "Some days differ between Certxa and Google. Syncing will push Certxa's schedule as the source of truth."}
          </p>
        )}
      </div>

      {/* Day-by-day comparison table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {/* Column headers */}
        <div className="grid grid-cols-[130px_1fr_20px_1fr_100px] gap-x-3 px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 uppercase tracking-wide">
          <span>Day</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
            Certxa
          </span>
          <span />
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
            Google
          </span>
          <span />
        </div>

        {/* Rows */}
        {data.days.map((day) => (
          <div
            key={day.dayOfWeek}
            className={`grid grid-cols-[130px_1fr_20px_1fr_100px] gap-x-3 items-center px-4 py-3 border-b border-slate-50 last:border-0 transition-colors ${rowBg(day.status)}`}
          >
            {/* Day name */}
            <span className="text-sm font-medium text-slate-800">{day.dayName}</span>

            {/* Certxa hours */}
            <span className={`text-sm ${day.certxa?.isClosed || !day.certxa ? "text-slate-400" : "text-slate-700"}`}>
              {formatRange(day.certxa)}
            </span>

            {/* Arrow */}
            <ArrowRight size={13} className="text-slate-300 justify-self-center" />

            {/* Google hours */}
            <span className={`text-sm ${
              day.google === null
                ? "text-slate-300 italic"
                : day.google.isClosed
                  ? "text-slate-400"
                  : "text-slate-700"
            }`}>
              {day.google === null ? "No data" : formatRange(day.google)}
            </span>

            {/* Status badge */}
            <div className="flex justify-end">
              {statusBadge(day.status)}
            </div>
          </div>
        ))}
      </div>

      {/* Sync button + explainer */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className={`gap-2 ${
            allMatch
              ? "bg-slate-600 hover:bg-slate-700 text-white"
              : "bg-indigo-600 hover:bg-indigo-700 text-white"
          }`}
          size="sm"
        >
          {syncMutation.isPending ? (
            <><Loader2 size={14} className="animate-spin" /> Updating Google…</>
          ) : allMatch ? (
            <><RefreshCw size={14} /> Re-sync to Google</>
          ) : (
            <><Wifi size={14} /> Sync hours to Google</>
          )}
        </Button>
        <p className="text-xs text-slate-500">
          {allMatch
            ? "Certxa's hours are already live on Google. Re-sync if you've recently changed them."
            : "Syncing will push Certxa's schedule to Google and overwrite any hours currently there."}
        </p>
      </div>

      {/* Legend */}
      <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-green-400" /> Match
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Different
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-400" /> Not on Google yet
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-400" /> Google only
        </div>
      </div>
    </div>
  );
}
