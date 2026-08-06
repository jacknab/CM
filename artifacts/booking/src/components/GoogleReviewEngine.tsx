/**
 * Google Review Management Engine — Owner Dashboard (Phase 2)
 *
 * Shows:
 *  - Engine settings (toggle auto-respond, delay, per-rating rules)
 *  - Live queue of scheduled / pending-approval / owner-notified responses
 *  - Published response history
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Star,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Bell,
  Sparkles,
  Settings,
  Calendar,
  Send,
  Edit3,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  BarChart2,
  Zap,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EngineSettings {
  storeId:                 number;
  autoRespondEnabled:      boolean;
  minResponseDelayMinutes: number;
  autoRespond5Star:        boolean;
  autoRespond4Star:        boolean;
  requireApproval3Star:    boolean;
  notifyOwner12Star:       boolean;
  maxReviewAgeDays:        number;
}

interface QueueItem {
  queue: {
    id:                     number;
    storeId:                number;
    googleReviewId:         number;
    rating:                 number;
    status:                 string;
    reviewReceivedAt:       string | null;
    eligibleAfter:          string | null;
    scheduledFor:           string | null;
    publishedAt:            string | null;
    ownerNotifiedAt:        string | null;
    generatedResponseText:  string | null;
    failureReason:          string | null;
    attempts:               number;
    createdAt:              string;
    updatedAt:              string;
  };
  review: {
    id:              number;
    customerName:    string | null;
    rating:          number;
    reviewText:      string | null;
    responseStatus:  string;
    createdAt:       string;
  } | null;
}

interface EngineStats {
  total:            number;
  scheduled:        number;
  awaitingApproval: number;
  ownerNotified:    number;
  approved:         number;
  published:        number;
  cancelled:        number;
  failed:           number;
  notFound:         number;
  byRating:         Record<string, number>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StarDisplay({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const sz = size === "md" ? "h-4 w-4" : "h-3 w-3";
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={cn(sz, s <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/25")}
        />
      ))}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; variant: string; icon: React.ReactNode }> = {
    scheduled:        { label: "Scheduled",            variant: "bg-blue-100 text-blue-800",    icon: <Clock size={11} /> },
    awaiting_approval:{ label: "Needs Approval",       variant: "bg-amber-100 text-amber-800",  icon: <AlertTriangle size={11} /> },
    owner_notified:   { label: "Owner Notified",       variant: "bg-orange-100 text-orange-800",icon: <Bell size={11} /> },
    approved:         { label: "Approved",              variant: "bg-indigo-100 text-indigo-800",icon: <CheckCircle2 size={11} /> },
    published:        { label: "Published",             variant: "bg-green-100 text-green-800", icon: <CheckCircle2 size={11} /> },
    cancelled:        { label: "Cancelled",             variant: "bg-gray-100 text-gray-600",   icon: <XCircle size={11} /> },
    failed:           { label: "Failed",                variant: "bg-red-100 text-red-800",     icon: <XCircle size={11} /> },
    not_found:        { label: "Review Deleted",        variant: "bg-slate-100 text-slate-600", icon: <XCircle size={11} /> },
    pending:          { label: "Pending",               variant: "bg-gray-100 text-gray-600",   icon: <Loader2 size={11} /> },
  };

  const cfg = configs[status] ?? { label: status, variant: "bg-gray-100 text-gray-600", icon: null };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", cfg.variant)}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ── Settings Panel ────────────────────────────────────────────────────────────

function SettingsPanel({ storeId }: { storeId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<EngineSettings>({
    queryKey: ["review-engine-settings", storeId],
    queryFn: async () => {
      const res = await axios.get(`/api/google-business/review-engine/settings/${storeId}`);
      return res.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<EngineSettings>) => {
      const res = await axios.put(`/api/google-business/review-engine/settings/${storeId}`, updates);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-engine-settings", storeId] });
      toast({ title: "Settings saved" });
    },
    onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
  });

  if (isLoading || !settings) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  const update = (key: keyof EngineSettings, value: any) =>
    updateMutation.mutate({ [key]: value });

  return (
    <div className="space-y-6">
      {/* Master toggle */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap size={16} className="text-blue-600" />
                Auto-Response Engine
              </CardTitle>
              <CardDescription className="text-sm mt-1">
                Automatically generate and schedule responses to Google reviews
              </CardDescription>
            </div>
            <Switch
              checked={settings.autoRespondEnabled}
              onCheckedChange={(v) => update("autoRespondEnabled", v)}
              disabled={updateMutation.isPending}
            />
          </div>
        </CardHeader>
      </Card>

      {settings.autoRespondEnabled && (
        <>
          {/* Delay */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock size={16} className="text-muted-foreground" />
                Minimum Response Delay
              </CardTitle>
              <CardDescription>
                How long to wait after a review is received before publishing a response.
                Current: <strong>{settings.minResponseDelayMinutes} minutes</strong>{" "}
                ({Math.floor(settings.minResponseDelayMinutes / 60)}h{" "}
                {settings.minResponseDelayMinutes % 60 > 0 ? `${settings.minResponseDelayMinutes % 60}m` : ""})
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Slider
                min={30}
                max={1440}
                step={30}
                value={[settings.minResponseDelayMinutes]}
                onValueChange={([v]) => update("minResponseDelayMinutes", v)}
                className="max-w-sm"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1 max-w-sm">
                <span>30 min</span>
                <span>12 hrs</span>
                <span>24 hrs</span>
              </div>
            </CardContent>
          </Card>

          {/* Review age cutoff */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock size={16} className="text-muted-foreground" />
                Review Age Limit
              </CardTitle>
              <CardDescription>
                Only auto-reply to reviews created within this many days. Older reviews are skipped —
                prevents mass-replying to years of history when you first connect Google Business.{" "}
                {settings.maxReviewAgeDays === 0
                  ? <strong>Currently set to unlimited — all reviews will receive auto-replies.</strong>
                  : <><strong>Replies limited to reviews from the last {settings.maxReviewAgeDays} days.</strong></>
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Slider
                min={0}
                max={365}
                step={1}
                value={[settings.maxReviewAgeDays]}
                onValueChange={([v]) => update("maxReviewAgeDays", v)}
                className="max-w-sm"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1 max-w-sm">
                <span>No limit</span>
                <span>30 days</span>
                <span>6 months</span>
                <span>1 year</span>
              </div>
              {settings.maxReviewAgeDays === 0 && (
                <p className="text-xs text-amber-600 mt-2">
                  ⚠️ With no limit, connecting Google Business will attempt to auto-reply to every review ever received.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Low-rating alert */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bell size={16} className="text-amber-500" />
                    Low-Rating Email Alert
                  </CardTitle>
                  <CardDescription className="text-sm mt-1">
                    Get notified by email whenever a 1 or 2-star review comes in — the auto-reply still goes out regardless.
                  </CardDescription>
                </div>
                <Switch
                  checked={settings.notifyOwner12Star}
                  onCheckedChange={(v) => update("notifyOwner12Star", v)}
                  disabled={updateMutation.isPending}
                />
              </div>
            </CardHeader>
          </Card>

          {/* Safety notice */}
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-4">
              <div className="flex gap-3">
                <Shield size={16} className="text-blue-600 mt-0.5 shrink-0" />
                <div className="text-sm text-blue-800 space-y-1">
                  <p className="font-medium">Built-in safety controls</p>
                  <ul className="text-xs space-y-0.5 text-blue-700 list-disc list-inside">
                    <li>Responses are only published during your configured business hours</li>
                    <li>AI is instructed never to mention private customer details</li>
                    <li>AI never makes promises or argues with customers</li>
                    <li>1–2 star reviews receive a sincere apology — no discounts or promises ever included</li>
                    <li>Anti-repetition: each response is unique</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ── Queue Item Card ───────────────────────────────────────────────────────────

function QueueItemCard({
  item,
  storeId,
}: {
  item: QueueItem;
  storeId: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded]     = useState(false);
  const [editing, setEditing]       = useState(false);
  const [editText, setEditText]     = useState(item.queue.generatedResponseText ?? "");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["review-engine-queue", storeId] });
    queryClient.invalidateQueries({ queryKey: ["review-engine-stats", storeId] });
  };

  const approveMutation = useMutation({
    mutationFn: () => axios.post(`/api/google-business/review-engine/queue/${item.queue.id}/approve`),
    onSuccess:  () => { toast({ title: "Response approved and scheduled" }); invalidate(); },
    onError:    () => toast({ title: "Failed to approve", variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => axios.post(`/api/google-business/review-engine/queue/${item.queue.id}/cancel`),
    onSuccess:  () => { toast({ title: "Response cancelled" }); invalidate(); },
    onError:    () => toast({ title: "Failed to cancel", variant: "destructive" }),
  });

  const retryMutation = useMutation({
    mutationFn: () => axios.post(`/api/google-business/review-engine/queue/${item.queue.id}/retry`),
    onSuccess:  (res) => {
      const d = res.data as { scheduledFor?: string };
      const when = d.scheduledFor ? ` — scheduled for ${format(new Date(d.scheduledFor), "MMM d, h:mm a")}` : "";
      toast({ title: `Retry queued${when}` });
      invalidate();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? "Failed to retry";
      toast({ title: msg, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: (responseText: string) =>
      axios.patch(`/api/google-business/review-engine/queue/${item.queue.id}/response`, { responseText }),
    onSuccess: () => {
      toast({ title: "Response text updated" });
      setEditing(false);
      invalidate();
    },
    onError: () => toast({ title: "Failed to update response", variant: "destructive" }),
  });

  const q = item.queue;
  const r = item.review;
  const canCancel  = !["published", "cancelled", "not_found"].includes(q.status);
  const canApprove = q.status === "awaiting_approval";
  const canEdit    = !["published", "cancelled", "not_found"].includes(q.status);
  const canRetry   = q.status === "failed";

  return (
    <Card className={cn(
      "transition-all",
      q.status === "awaiting_approval" && "border-amber-300",
      q.status === "owner_notified"    && "border-orange-300",
      q.status === "failed"            && "border-red-300",
      q.status === "not_found"         && "border-slate-200 bg-slate-50/50",
      q.status === "published"         && "border-green-200",
    )}>
      <CardContent className="pt-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <StarDisplay rating={q.rating} size="md" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {r?.customerName ?? "Anonymous"}
              </p>
              {r?.reviewText && (
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                  "{r.reviewText}"
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <StatusBadge status={q.status} />
                {q.scheduledFor && q.status !== "published" && q.status !== "cancelled" && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar size={10} />
                    {format(new Date(q.scheduledFor), "MMM d, h:mm a")}
                  </span>
                )}
                {q.publishedAt && (
                  <span className="inline-flex items-center gap-1 text-xs text-green-700">
                    <Send size={10} />
                    Published {formatDistanceToNow(new Date(q.publishedAt), { addSuffix: true })}
                  </span>
                )}
                {q.ownerNotifiedAt && (
                  <span className="inline-flex items-center gap-1 text-xs text-orange-700">
                    <Bell size={10} />
                    Notified {formatDistanceToNow(new Date(q.ownerNotifiedAt), { addSuffix: true })}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={() => setExpanded((p) => !p)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {/* Expanded content */}
        {expanded && (
          <div className="mt-4 space-y-3 border-t pt-3">
            {/* Draft response */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Sparkles size={10} />
                  AI-Generated Response
                </p>
                {canEdit && !editing && (
                  <button
                    onClick={() => { setEditing(true); setEditText(q.generatedResponseText ?? ""); }}
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <Edit3 size={11} />
                    Edit
                  </button>
                )}
              </div>

              {editing ? (
                <div className="space-y-2">
                  <Textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={4}
                    className="text-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => editMutation.mutate(editText)}
                      disabled={editMutation.isPending || !editText.trim()}
                    >
                      {editMutation.isPending ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm bg-muted/40 rounded p-3 leading-relaxed">
                  {q.generatedResponseText ?? <span className="italic text-muted-foreground">No response generated</span>}
                </p>
              )}
            </div>

            {/* Failure reason */}
            {q.failureReason && (
              <div className="text-xs text-red-700 bg-red-50 rounded p-2 border border-red-200">
                <strong>Failure:</strong> {q.failureReason}
                {q.attempts > 0 && <span className="ml-2 text-red-500">({q.attempts} attempt{q.attempts > 1 ? "s" : ""})</span>}
              </div>
            )}

            {/* Timing details */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {q.reviewReceivedAt && (
                <>
                  <span className="font-medium">Review received</span>
                  <span>{format(new Date(q.reviewReceivedAt), "MMM d, h:mm a")}</span>
                </>
              )}
              {q.eligibleAfter && (
                <>
                  <span className="font-medium">Eligible after</span>
                  <span>{format(new Date(q.eligibleAfter), "MMM d, h:mm a")}</span>
                </>
              )}
              {q.scheduledFor && (
                <>
                  <span className="font-medium">Scheduled for</span>
                  <span>{format(new Date(q.scheduledFor), "MMM d, h:mm a")}</span>
                </>
              )}
              {q.publishedAt && (
                <>
                  <span className="font-medium">Published at</span>
                  <span>{format(new Date(q.publishedAt), "MMM d, h:mm a")}</span>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 flex-wrap pt-1">
              {canApprove && (
                <Button
                  size="sm"
                  onClick={() => approveMutation.mutate()}
                  disabled={approveMutation.isPending}
                >
                  {approveMutation.isPending ? <Loader2 size={12} className="animate-spin mr-1" /> : <CheckCircle2 size={12} className="mr-1" />}
                  Approve & Schedule
                </Button>
              )}
              {canRetry && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => retryMutation.mutate()}
                  disabled={retryMutation.isPending}
                  className="text-blue-700 border-blue-200 hover:bg-blue-50"
                >
                  {retryMutation.isPending ? <Loader2 size={12} className="animate-spin mr-1" /> : <RefreshCw size={12} className="mr-1" />}
                  Retry
                </Button>
              )}
              {canCancel && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                  className="text-destructive hover:text-destructive"
                >
                  {cancelMutation.isPending ? <Loader2 size={12} className="animate-spin mr-1" /> : <XCircle size={12} className="mr-1" />}
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Stats Bar ─────────────────────────────────────────────────────────────────

function StatsBar({ storeId }: { storeId: number }) {
  const { data: stats } = useQuery<EngineStats>({
    queryKey: ["review-engine-stats", storeId],
    queryFn: async () => {
      const res = await axios.get(`/api/google-business/review-engine/stats/${storeId}`);
      return res.data;
    },
    refetchInterval: 30_000,
  });

  if (!stats || stats.total === 0) return null;

  const items = [
    { label: "Scheduled",        value: stats.scheduled,        color: "text-blue-700 bg-blue-50" },
    { label: "Needs Approval",   value: stats.awaitingApproval, color: "text-amber-700 bg-amber-50" },
    { label: "Owner Notified",   value: stats.ownerNotified,    color: "text-orange-700 bg-orange-50" },
    { label: "Published",        value: stats.published,        color: "text-green-700 bg-green-50" },
    { label: "Failed",           value: stats.failed,           color: "text-red-700 bg-red-50" },
    { label: "Cancelled",        value: stats.cancelled ?? 0,   color: "text-gray-600 bg-gray-100" },
    { label: "Review Deleted",   value: stats.notFound ?? 0,    color: "text-slate-600 bg-slate-100" },
  ].filter((i) => i.value > 0);

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => (
        <span key={i.label} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium", i.color)}>
          <BarChart2 size={11} />
          {i.value} {i.label}
        </span>
      ))}
    </div>
  );
}

// ── Queue Panel ───────────────────────────────────────────────────────────────

const STATUS_TABS = [
  { value: "active",    label: "Active",          statuses: "scheduled,awaiting_approval,owner_notified,approved" },
  { value: "published", label: "Published",        statuses: "published" },
  { value: "failed",    label: "Failed",           statuses: "failed" },
  { value: "cancelled", label: "Cancelled",        statuses: "cancelled" },
  { value: "not_found", label: "Review Deleted",   statuses: "not_found" },
  { value: "other",     label: "All",              statuses: "" },
] as const;

function QueuePanel({ storeId }: { storeId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<string>("active");

  const currentTab = STATUS_TABS.find((t) => t.value === tab) ?? STATUS_TABS[0];

  const { data, isLoading, refetch } = useQuery<QueueItem[]>({
    queryKey: ["review-engine-queue", storeId, tab],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "50" });
      if (currentTab.statuses) params.set("status", currentTab.statuses);
      const res = await axios.get(`/api/google-business/review-engine/queue/${storeId}?${params}`);
      return res.data;
    },
    refetchInterval: 30_000,
  });

  const triggerMutation = useMutation({
    mutationFn: () => axios.post(`/api/google-business/review-engine/trigger/${storeId}`),
    onSuccess: () => {
      toast({ title: "Review processing triggered" });
      queryClient.invalidateQueries({ queryKey: ["review-engine-queue", storeId] });
      queryClient.invalidateQueries({ queryKey: ["review-engine-stats", storeId] });
    },
    onError: (err: any) => toast({
      title: "Failed to trigger",
      description: err?.response?.data?.message ?? err?.message,
      variant: "destructive",
    }),
  });

  const retryFailedMutation = useMutation({
    mutationFn: () => axios.post(`/api/google-business/retry-failed-replies/${storeId}`),
    onSuccess: (res) => {
      const count = res.data?.retried ?? 0;
      const dupes = res.data?.cancelledDuplicates ?? 0;
      const dupNote = dupes > 0 ? ` (${dupes} duplicate${dupes === 1 ? "" : "s"} cancelled)` : "";
      toast({ title: count > 0 ? `${count} failed repl${count === 1 ? "y" : "ies"} queued for retry${dupNote}` : "No failed replies to retry" });
      queryClient.invalidateQueries({ queryKey: ["review-engine-queue", storeId] });
      queryClient.invalidateQueries({ queryKey: ["review-engine-stats", storeId] });
      if (count > 0) setTab("active");
    },
    onError: (err: any) => toast({
      title: "Retry failed",
      description: err?.response?.data?.message ?? err?.message,
      variant: "destructive",
    }),
  });

  const cancelOverdueMutation = useMutation({
    mutationFn: () => axios.post(`/api/google-business/cancel-overdue-queue/${storeId}`),
    onSuccess: (res) => {
      const count = res.data?.cancelled ?? 0;
      toast({ title: count > 0 ? `${count} overdue item${count === 1 ? "" : "s"} cancelled` : "No overdue items found" });
      queryClient.invalidateQueries({ queryKey: ["review-engine-queue", storeId] });
      queryClient.invalidateQueries({ queryKey: ["review-engine-stats", storeId] });
      if (count > 0) setTab("cancelled");
    },
    onError: (err: any) => toast({
      title: "Cleanup failed",
      description: err?.response?.data?.message ?? err?.message,
      variant: "destructive",
    }),
  });

  const failedCount = tab === "failed" ? (data?.length ?? 0) : 0;
  const activeCount = tab === "active" ? (data?.length ?? 0) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <StatsBar storeId={storeId} />
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            <RefreshCw size={13} className="mr-1" />
            Refresh
          </Button>
          {tab === "failed" && failedCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => retryFailedMutation.mutate()}
              disabled={retryFailedMutation.isPending}
              className="border-red-300 text-red-700 hover:bg-red-50"
            >
              {retryFailedMutation.isPending
                ? <Loader2 size={13} className="animate-spin mr-1" />
                : <RefreshCw size={13} className="mr-1" />}
              Retry All Failed
            </Button>
          )}
          {tab === "active" && activeCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => cancelOverdueMutation.mutate()}
              disabled={cancelOverdueMutation.isPending}
              className="border-gray-300 text-gray-600 hover:bg-gray-50"
              title="Cancel queue items for reviews older than your auto-reply age limit"
            >
              {cancelOverdueMutation.isPending
                ? <Loader2 size={13} className="animate-spin mr-1" />
                : <XCircle size={13} className="mr-1" />}
              Cancel Overdue
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => triggerMutation.mutate()}
            disabled={triggerMutation.isPending}
          >
            {triggerMutation.isPending ? <Loader2 size={13} className="animate-spin mr-1" /> : <Zap size={13} className="mr-1" />}
            Process Now
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {STATUS_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {STATUS_TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-muted-foreground" size={24} />
              </div>
            ) : !data || data.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Sparkles size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No {t.label.toLowerCase()} responses</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.map((item) => (
                  <QueueItemCard key={item.queue.id} item={item} storeId={storeId} />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────

export function GoogleReviewEngine({ storeId }: { storeId: number }) {
  const [view, setView] = useState<"queue" | "settings">("queue");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Sparkles size={16} className="text-blue-600" />
            Review Management Engine
          </h2>
          <p className="text-sm text-muted-foreground">
            Automatically respond to Google reviews in a natural, business-like way.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={view === "queue" ? "default" : "outline"}
            onClick={() => setView("queue")}
          >
            <Calendar size={13} className="mr-1" />
            Queue
          </Button>
          <Button
            size="sm"
            variant={view === "settings" ? "default" : "outline"}
            onClick={() => setView("settings")}
          >
            <Settings size={13} className="mr-1" />
            Settings
          </Button>
        </div>
      </div>

      {view === "queue"    && <QueuePanel    storeId={storeId} />}
      {view === "settings" && <SettingsPanel storeId={storeId} />}
    </div>
  );
}
