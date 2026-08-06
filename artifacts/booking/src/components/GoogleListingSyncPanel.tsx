import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, RefreshCw, CheckCircle2, AlertCircle, Clock, Globe, Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface ListingPreview {
  bookingUrl: string;
  hasSlug: boolean;
  hours: {
    dayOfWeek: number;
    dayName: string;
    openTime: string;
    closeTime: string;
    isClosed: boolean;
  }[];
  serviceCount: number;
  lastListingSyncedAt: string | null;
  lastListingBookingUrl: string | null;
}

interface GoogleListingSyncPanelProps {
  storeId: number;
}

// DB stores dayOfWeek as 0=Monday … 6=Sunday
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function GoogleListingSyncPanel({ storeId }: GoogleListingSyncPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showHours, setShowHours] = useState(false);

  const { data: preview, isLoading: previewLoading } = useQuery<ListingPreview>({
    queryKey: ["/api/google-business/listing-preview", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/google-business/listing-preview?storeId=${storeId}`);
      if (!res.ok) throw new Error("Failed to load listing preview");
      return res.json();
    },
    staleTime: 60_000,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/google-business/sync-listing`, {
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/google-business/listing-preview", storeId] });
      queryClient.invalidateQueries({ queryKey: ["/api/google-business/profile", storeId] });
      toast({
        title: "Listing synced to Google",
        description: data.message ?? "Booking URL and business hours pushed successfully.",
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

  if (previewLoading) {
    return (
      <div className="rounded-lg border border-blue-100 bg-blue-50/30 p-4 flex items-center gap-3 text-sm text-blue-600">
        <Loader2 size={15} className="animate-spin flex-shrink-0" />
        Loading listing sync preview…
      </div>
    );
  }

  if (!preview) return null;

  const alreadySynced = preview.lastListingBookingUrl === preview.bookingUrl;

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/30 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Globe size={15} className="text-indigo-600 flex-shrink-0" />
          <h4 className="text-sm font-semibold text-indigo-900">Listing Sync</h4>
          <Badge
            variant="outline"
            className={`text-xs ${alreadySynced ? "border-green-300 text-green-700 bg-green-50" : "border-amber-300 text-amber-700 bg-amber-50"}`}
          >
            {alreadySynced ? "Up to date" : "Sync needed"}
          </Badge>
        </div>
        {preview.lastListingSyncedAt && (
          <span className="text-xs text-indigo-500 flex items-center gap-1">
            <Clock size={11} />
            {new Date(preview.lastListingSyncedAt).toLocaleString()}
          </span>
        )}
      </div>

      {/* Booking URL */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-indigo-700 uppercase tracking-wide">Booking URL to push</p>
        {preview.hasSlug ? (
          <div className="flex items-center gap-2 bg-white border border-indigo-200 rounded-lg px-3 py-2">
            <span className="text-sm font-mono text-indigo-800 flex-1 truncate">{preview.bookingUrl}</span>
            <a
              href={preview.bookingUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-indigo-400 hover:text-indigo-600 flex-shrink-0"
            >
              <ExternalLink size={13} />
            </a>
          </div>
        ) : (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <AlertCircle size={15} className="mt-0.5 flex-shrink-0 text-amber-500" />
            <span>
              No booking slug set for this location. Go to <strong>Settings → Business</strong> to set a booking URL slug before syncing.
            </span>
          </div>
        )}
      </div>

      {/* Hours summary */}
      {preview.hours.length > 0 && (
        <div className="space-y-1">
          <button
            onClick={() => setShowHours(h => !h)}
            className="text-xs font-medium text-indigo-700 uppercase tracking-wide hover:text-indigo-900 transition-colors flex items-center gap-1"
          >
            Business Hours ({preview.hours.filter(h => !h.isClosed).length} days active)
            <span className="text-indigo-400">{showHours ? "▲" : "▼"}</span>
          </button>
          {showHours && (
            <div className="bg-white border border-indigo-100 rounded-lg divide-y divide-gray-50 text-xs">
              {preview.hours.map(h => (
                <div key={h.dayOfWeek} className="flex items-center justify-between px-3 py-1.5">
                  <span className="font-medium text-gray-700 w-24">{h.dayName}</span>
                  {h.isClosed ? (
                    <span className="text-gray-400">Closed</span>
                  ) : (
                    <span className="text-gray-600">{h.openTime} – {h.closeTime}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Services count */}
      {preview.serviceCount > 0 && (
        <div className="flex items-center gap-2 text-xs text-indigo-700">
          <Building2 size={12} />
          <span>{preview.serviceCount} services in your Certxa menu</span>
          <span className="text-indigo-400">(service sync: coming soon)</span>
        </div>
      )}

      {/* What gets synced */}
      <div className="text-xs text-indigo-600 space-y-0.5">
        <p>✓ <strong>Website/booking URL</strong> field on your Google listing</p>
        <p>✓ <strong>Business hours</strong> (open days and times)</p>
        <p>✗ Bookings are NOT created in Google — all booking happens in Certxa only</p>
      </div>

      {/* Sync button */}
      <Button
        onClick={() => syncMutation.mutate()}
        disabled={syncMutation.isPending || !preview.hasSlug}
        className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
        size="sm"
      >
        {syncMutation.isPending ? (
          <><Loader2 size={14} className="animate-spin" /> Syncing to Google…</>
        ) : alreadySynced ? (
          <><RefreshCw size={14} /> Re-sync to Google</>
        ) : (
          <><CheckCircle2 size={14} /> Sync Listing to Google</>
        )}
      </Button>

      {alreadySynced && (
        <p className="text-xs text-center text-indigo-500">
          Your booking URL is already live on Google. Use Re-sync if you've changed your hours.
        </p>
      )}
    </div>
  );
}
