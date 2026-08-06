import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { useSelectedStore } from "@/hooks/use-store";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Phone,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  CalendarCheck,
  Mic,
  Zap,
  Users,
  PhoneCall,
  PhoneOff,
  PhoneIncoming,
  Clock,
  RefreshCw,
  Copy,
  Link,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface ReceptionistSettings {
  enabled: boolean;
  apiKeyConfigured: boolean;
  phoneProvisioned: boolean;
  voiceWebhookUrl?: string;
}

interface CallLogEntry {
  id: number;
  callSid: string | null;
  callerPhone: string | null;
  callerName: string | null;
  outcome: string;
  appointmentId: number | null;
  durationSeconds: number | null;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
}

const OUTCOME_CONFIG: Record<string, { label: string; className: string; icon: typeof PhoneCall }> = {
  booked:       { label: "Booked",       className: "bg-green-100 text-green-800 border-green-200",   icon: CalendarCheck },
  cancelled:    { label: "Cancelled",    className: "bg-red-100 text-red-800 border-red-200",         icon: PhoneOff },
  rescheduled:  { label: "Rescheduled",  className: "bg-blue-100 text-blue-800 border-blue-200",      icon: CalendarCheck },
  inquiry:      { label: "Inquiry",      className: "bg-purple-100 text-purple-800 border-purple-200", icon: PhoneCall },
  no_action:    { label: "No action",    className: "bg-gray-100 text-gray-600 border-gray-200",      icon: PhoneCall },
  in_progress:  { label: "In progress",  className: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: PhoneIncoming },
  error:        { label: "Error",        className: "bg-red-100 text-red-700 border-red-200",         icon: XCircle },
};

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function formatPhone(phone: string | null): string {
  if (!phone) return "Unknown";
  const d = phone.replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") {
    return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return phone;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

type Tab = "overview" | "calls";

export default function AiReceptionist() {
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const [toggling, setToggling] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  const { data: settings, isLoading } = useQuery<ReceptionistSettings>({
    queryKey: ["/api/ai-receptionist/settings", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) throw new Error("No store");
      const res = await fetch("/api/ai-receptionist/settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const {
    data: callLogs,
    isLoading: logsLoading,
    refetch: refetchLogs,
    isFetching: logsFetching,
  } = useQuery<CallLogEntry[]>({
    queryKey: ["/api/ai-receptionist/call-logs", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) throw new Error("No store");
      const res = await fetch("/api/ai-receptionist/call-logs", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load call logs");
      return res.json();
    },
    enabled: !!selectedStore?.id && tab === "calls",
    refetchInterval: tab === "calls" ? 30_000 : false,
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("PATCH", "/api/ai-receptionist/settings", { enabled });
      if (!res.ok) throw new Error("Failed to update");
      return res.json() as Promise<ReceptionistSettings>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/ai-receptionist/settings", selectedStore?.id], data);
      toast({
        title: data.enabled ? "AI Receptionist enabled" : "AI Receptionist disabled",
        description: data.enabled
          ? "Inbound calls will now be handled by the AI."
          : "Inbound calls will no longer be intercepted.",
      });
    },
    onError: () => toast({ title: "Failed to update setting", variant: "destructive" }),
    onSettled: () => setToggling(false),
  });

  const handleToggle = (value: boolean) => {
    setToggling(true);
    toggleMutation.mutate(value);
  };

  const [copied, setCopied] = useState(false);

  const copyWebhook = () => {
    const url = settings?.voiceWebhookUrl;
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const enabled = settings?.enabled ?? false;
  const apiKeyConfigured = settings?.apiKeyConfigured ?? false;
  const phoneProvisioned = settings?.phoneProvisioned ?? false;
  const apiReady = apiKeyConfigured && phoneProvisioned;

  const statusBlurb = apiReady
    ? "Voice AI is configured and ready to take calls."
    : !apiKeyConfigured
      ? "Voice AI is not yet configured on the platform — contact your account manager."
      : "No phone number has been assigned to this salon yet.";

  const blockingBlurb = !apiKeyConfigured
    ? "The AI voice system needs to be set up on the platform side before it can be enabled."
    : !phoneProvisioned
      ? "A Twilio phone number must be assigned to this salon before the AI can answer calls."
      : null;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6 py-6 px-4">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Phone className="h-6 w-6" />
            AI Phone Receptionist
          </h1>
          <p className="text-muted-foreground mt-1">
            An AI answers inbound calls, collects booking details, and schedules appointments — automatically, 24/7.
          </p>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div className="flex gap-1 border-b overflow-x-auto scrollbar-none">
          {(["overview", "calls"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "overview" ? "Overview" : "Call Log"}
            </button>
          ))}
        </div>

        {/* ══ Overview tab ════════════════════════════════════════════════ */}
        {tab === "overview" && (
          <>
            {/* ── System status ───────────────────────────────────────── */}
            <Card>
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="font-medium">System status</p>
                    <p className="text-sm text-muted-foreground">{statusBlurb}</p>
                  </div>
                  {apiReady ? (
                    <Badge className="bg-green-100 text-green-800 border-green-200 flex items-center gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Ready
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="flex items-center gap-1.5">
                      <XCircle className="h-3.5 w-3.5" />
                      Not configured
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ── Main toggle ─────────────────────────────────────────── */}
            <Card className={cn(enabled && apiReady && "border-primary/40 bg-primary/5")}>
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="font-semibold text-base">Enable AI Receptionist</p>
                    <p className="text-sm text-muted-foreground">
                      {enabled
                        ? "Active — inbound calls are being answered by the AI."
                        : "Off — calls are not being intercepted."}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {toggling && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    <Switch
                      checked={enabled}
                      onCheckedChange={handleToggle}
                      disabled={!apiReady || toggling}
                      aria-label="Toggle AI Receptionist"
                    />
                  </div>
                </div>

                {enabled && apiReady && (
                  <div className="mt-4 pt-4 border-t flex items-center gap-2 text-sm text-primary font-medium">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                    </span>
                    AI is live and listening for inbound calls
                  </div>
                )}

                {blockingBlurb && (
                  <div className="mt-4 pt-4 border-t flex items-start gap-2 text-sm text-amber-700 bg-amber-50 rounded-md px-3 py-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{blockingBlurb}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Twilio setup / webhook URL ──────────────────────────── */}
            {settings?.voiceWebhookUrl && (
              <Card>
                <CardContent className="pt-5 pb-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Link className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium text-sm">Twilio Webhook URL</p>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Paste this URL as the <strong>A call comes in</strong> webhook on your Twilio phone number. Set the method to <strong>HTTP POST</strong>.
                  </p>
                  <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2">
                    <code className="text-xs flex-1 break-all text-foreground">{settings.voiceWebhookUrl}</code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 h-7 px-2 gap-1"
                      onClick={copyWebhook}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copied ? "Copied!" : "Copy"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This uses speech recognition and standard voice calls — no special Twilio features required.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* ── How it works ────────────────────────────────────────── */}
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                How it works
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { icon: Phone,         title: "Answers every call",      body: "The AI picks up inbound calls instantly — no hold music, no voicemail." },
                  { icon: Mic,           title: "Guides the conversation",  body: "It collects the caller's name, phone number, desired service, and preferred time." },
                  { icon: CalendarCheck, title: "Books the appointment",    body: "Once all details are confirmed, the appointment is recorded and the caller is given a goodbye." },
                  { icon: Zap,           title: "Ultra-low latency",        body: "Powered by OpenAI's Realtime API — responses are near-instant, conversations feel natural." },
                  { icon: Users,         title: "Remembers callers",        body: "Returning callers are greeted by first name and their upcoming appointments are referenced automatically." },
                  { icon: CheckCircle2,  title: "Always on",                body: "Works 24/7 — after hours, weekends, and holidays. Never misses a booking opportunity." },
                ].map(({ icon: Icon, title, body }) => (
                  <Card key={title} className="border bg-muted/30">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex gap-3">
                        <div className="mt-0.5 flex-shrink-0">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{body}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <p className="text-xs text-muted-foreground text-center pb-4">
              Phone routing is managed at the platform level. Contact your account manager to assign or change a phone number.
            </p>
          </>
        )}

        {/* ══ Call Log tab ════════════════════════════════════════════════ */}
        {tab === "calls" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Every inbound call handled by the AI receptionist — newest first.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchLogs()}
                disabled={logsFetching}
                className="gap-1.5"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", logsFetching && "animate-spin")} />
                Refresh
              </Button>
            </div>

            {logsLoading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !callLogs?.length ? (
              <Card>
                <CardContent className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
                  <PhoneIncoming className="h-10 w-10 opacity-30" />
                  <p className="text-sm font-medium">No calls yet</p>
                  <p className="text-xs text-center max-w-xs">
                    Once the AI receptionist starts handling inbound calls, each call will appear here with its outcome.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Time</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Caller</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Outcome</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">
                        <Clock className="h-3.5 w-3.5 inline mr-1" />Duration
                      </th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {callLogs.map((log) => {
                      const cfg = OUTCOME_CONFIG[log.outcome] ?? OUTCOME_CONFIG.no_action;
                      const Icon = cfg.icon;
                      return (
                        <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {formatTime(log.startedAt)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium leading-tight">
                              {log.callerName ?? <span className="text-muted-foreground italic">Unknown</span>}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {formatPhone(log.callerPhone)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={cn("text-xs font-medium flex items-center gap-1 w-fit", cfg.className)}>
                              <Icon className="h-3 w-3" />
                              {cfg.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                            {formatDuration(log.durationSeconds)}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell max-w-[200px] truncate">
                            {log.notes ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>
    </AppLayout>
  );
}
