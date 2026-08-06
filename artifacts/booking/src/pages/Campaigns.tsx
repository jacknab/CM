import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useSelectedStore } from "@/hooks/use-store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Megaphone, Plus, Send, Clock, CheckCircle, Trash2, Users, MessageSquare, Mail, RefreshCw,
  BarChart2, TrendingUp, AlertCircle, ShieldCheck, Loader2, XCircle, Info, Pencil,
} from "lucide-react";
import { format } from "date-fns";

type Campaign = {
  id: number;
  name: string;
  status: string;
  channel: string;
  audience: string;
  audienceValue?: string;
  messageTemplate: string;
  scheduledAt?: string;
  sentAt?: string;
  sentCount: number;
  failedCount: number;
  rejectionReason?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
};

const AUDIENCE_OPTIONS = [
  { value: "all", label: "All Clients" },
  { value: "lapsed_30", label: "Lapsed 30+ days" },
  { value: "lapsed_60", label: "Lapsed 60+ days" },
  { value: "lapsed_90", label: "Lapsed 90+ days" },
  { value: "at_risk", label: "At-Risk" },
  { value: "drifting", label: "Drifting" },
  { value: "high_ltv", label: "High Value" },
];

const CHANNEL_OPTIONS = [
  { value: "sms", label: "SMS", icon: MessageSquare },
  { value: "email", label: "Email", icon: Mail },
  { value: "both", label: "SMS + Email", icon: RefreshCw },
];

const MERGE_TAGS = ["{{firstName}}", "{{businessName}}", "{{bookingLink}}"];

// Hard-coded message templates per audience × channel.
const CAMPAIGN_TEMPLATES: Record<string, { sms: string; email: string }> = {
  all: {
    sms:   "Hi {{firstName}}! 👋 We miss you at {{businessName}}. Book your next appointment today: {{bookingLink}}",
    email: "Hi {{firstName}},\n\nWe wanted to reach out and say hello! Whether it's been a week or a while, we'd love to see you back at {{businessName}}.\n\nBook your next appointment at your convenience:\n👉 {{bookingLink}}\n\nSee you soon!\n— The {{businessName}} Team",
  },
  lapsed_30: {
    sms:   "Hi {{firstName}}, it's been about a month! 💇 {{businessName}} has openings ready for you. Book now: {{bookingLink}}",
    email: "Hi {{firstName}},\n\nWe noticed it's been about a month since your last visit, and we'd love to welcome you back to {{businessName}}.\n\nTreat yourself — book your next appointment today:\n👉 {{bookingLink}}\n\nLooking forward to seeing you!\n— The {{businessName}} Team",
  },
  lapsed_60: {
    sms:   "Hey {{firstName}}! We haven't seen you in a couple months at {{businessName}}. Come back and treat yourself: {{bookingLink}}",
    email: "Hi {{firstName}},\n\nIt's been a couple of months since we last saw you at {{businessName}}, and we've been thinking of you!\n\nWe'd love to get you back in the chair. Book your appointment here:\n👉 {{bookingLink}}\n\nCan't wait to see you!\n— The {{businessName}} Team",
  },
  lapsed_90: {
    sms:   "Hi {{firstName}}, we've really missed you! 💛 It's been a while since your last visit to {{businessName}}. Book today: {{bookingLink}}",
    email: "Hi {{firstName}},\n\nWe've really missed you at {{businessName}}! It's been quite a while since your last visit, and we'd love to catch up.\n\nReady to come back? Book your appointment today:\n👉 {{bookingLink}}\n\nWe look forward to seeing you again soon!\n— The {{businessName}} Team",
  },
  at_risk: {
    sms:   "{{firstName}}, don't let too much time pass! ✂️ {{businessName}} would love to see you again. Book here: {{bookingLink}}",
    email: "Hi {{firstName}},\n\nWe don't want to lose you as a client! It's been some time since your last visit to {{businessName}} and we want to make sure everything's great.\n\nWhenever you're ready, rebooking is easy:\n👉 {{bookingLink}}\n\nHope to see you soon!\n— The {{businessName}} Team",
  },
  drifting: {
    sms:   "Hi {{firstName}}! Looks like it's been a little while 😊 Swing back in at {{businessName}} and book your next visit: {{bookingLink}}",
    email: "Hi {{firstName}},\n\nHey there! We noticed your visits to {{businessName}} have been a little less frequent lately — we just wanted to check in.\n\nIf you're ready to get back on schedule, booking is easy:\n👉 {{bookingLink}}\n\nSee you soon!\n— The {{businessName}} Team",
  },
  high_ltv: {
    sms:   "Hi {{firstName}}! Thank you for being one of our best clients 💫 We'd love to see you again at {{businessName}}: {{bookingLink}}",
    email: "Hi {{firstName}},\n\nWe just wanted to take a moment to say THANK YOU. You are one of our most valued clients at {{businessName}}, and we truly appreciate your loyalty.\n\nWhenever you're ready for your next appointment, we're here:\n👉 {{bookingLink}}\n\nWith gratitude,\n— The {{businessName}} Team",
  },
};

function getTemplate(audience: string, channel: string): string {
  const t = CAMPAIGN_TEMPLATES[audience];
  if (!t) return "";
  return channel === "email" ? t.email : t.sms;
}

function statusBadge(status: string) {
  switch (status) {
    case "sent":
      return <Badge className="bg-green-100 text-green-800 border-green-200 gap-1"><CheckCircle className="w-3 h-3" />Sent</Badge>;
    case "scheduled":
      return <Badge className="bg-blue-100 text-blue-800 border-blue-200 gap-1"><Clock className="w-3 h-3" />Scheduled</Badge>;
    case "sending":
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 gap-1"><Loader2 className="w-3 h-3 animate-spin" />Sending…</Badge>;
    case "pending_review":
      return <Badge className="bg-purple-100 text-purple-800 border-purple-200 gap-1"><ShieldCheck className="w-3 h-3" />Under Review</Badge>;
    case "rejected":
      return <Badge className="bg-red-100 text-red-800 border-red-200 gap-1"><XCircle className="w-3 h-3" />Rejected</Badge>;
    default:
      return <Badge variant="outline" className="gap-1"><Info className="w-3 h-3" />Draft</Badge>;
  }
}

function deliveryRate(sent: number, failed: number) {
  const total = sent + failed;
  if (total === 0) return null;
  return Math.round((sent / total) * 100);
}

function audienceLabel(value: string) {
  return AUDIENCE_OPTIONS.find(a => a.value === value)?.label ?? value;
}

// ── Performance Tab ─────────────────────────────────────────────────────────────

function PerformanceTab({ campaigns }: { campaigns: Campaign[] }) {
  const sent = campaigns.filter(c => c.status === "sent");
  const totalDelivered = sent.reduce((s, c) => s + c.sentCount, 0);
  const totalFailed = sent.reduce((s, c) => s + c.failedCount, 0);
  const totalMessages = totalDelivered + totalFailed;
  const overallRate = totalMessages > 0 ? Math.round((totalDelivered / totalMessages) * 100) : null;

  const audienceMap: Record<string, { delivered: number; failed: number }> = {};
  for (const c of sent) {
    if (!audienceMap[c.audience]) audienceMap[c.audience] = { delivered: 0, failed: 0 };
    audienceMap[c.audience].delivered += c.sentCount;
    audienceMap[c.audience].failed += c.failedCount;
  }
  const audienceRows = Object.entries(audienceMap)
    .map(([aud, { delivered, failed }]) => ({
      audience: aud,
      label: audienceLabel(aud),
      delivered,
      failed,
      rate: delivered + failed > 0 ? Math.round((delivered / (delivered + failed)) * 100) : null,
    }))
    .sort((a, b) => (b.delivered + b.failed) - (a.delivered + a.failed));

  const channelMap: Record<string, { delivered: number; failed: number }> = {};
  for (const c of sent) {
    if (!channelMap[c.channel]) channelMap[c.channel] = { delivered: 0, failed: 0 };
    channelMap[c.channel].delivered += c.sentCount;
    channelMap[c.channel].failed += c.failedCount;
  }

  if (sent.length === 0) {
    return (
      <div className="text-center py-20 border-2 border-dashed rounded-xl">
        <BarChart2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="font-semibold text-lg mb-1">No performance data yet</h3>
        <p className="text-muted-foreground text-sm">Send your first campaign to see delivery stats here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Campaigns Sent", value: sent.length.toString(), color: "text-primary", bg: "bg-primary/5 border-primary/20" },
          { label: "Overall Delivery Rate", value: overallRate != null ? `${overallRate}%` : "—", color: overallRate != null && overallRate >= 90 ? "text-green-600" : "text-amber-600", bg: "bg-green-50 border-green-200" },
          { label: "Total Delivered", value: totalDelivered.toLocaleString(), color: "text-green-600", bg: "bg-green-50 border-green-200" },
          { label: "Total Failed", value: totalFailed.toLocaleString(), color: "text-red-500", bg: "bg-red-50 border-red-200" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`rounded-xl border p-4 ${bg}`}>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-muted-foreground mt-1 font-medium">{label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-card">
        <div className="p-4 border-b">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Campaign Results
          </h3>
        </div>
        <div className="divide-y">
          {sent.map((c) => {
            const rate = deliveryRate(c.sentCount, c.failedCount);
            const total = c.sentCount + c.failedCount;
            return (
              <div key={c.id} className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm truncate">{c.name}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {CHANNEL_OPTIONS.find(ch => ch.value === c.channel)?.label ?? c.channel}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                    <Users className="w-3 h-3" />
                    <span>{audienceLabel(c.audience)}</span>
                    {c.sentAt && <span>· {format(new Date(c.sentAt), "MMM d, yyyy")}</span>}
                  </div>
                  {rate != null && (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${rate >= 90 ? "bg-green-500" : rate >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                      <span className={`text-xs font-semibold w-10 text-right ${rate >= 90 ? "text-green-600" : rate >= 70 ? "text-amber-600" : "text-red-500"}`}>
                        {rate}%
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-green-600">{c.sentCount.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">of {total.toLocaleString()}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card">
          <div className="p-4 border-b">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              By Audience Segment
            </h3>
          </div>
          <div className="divide-y">
            {audienceRows.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground">No data</p>
            ) : audienceRows.map(row => (
              <div key={row.audience} className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{row.label}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 bg-muted rounded-full h-1 overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: row.rate != null ? `${row.rate}%` : "0%" }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-10 text-right">
                      {row.rate != null ? `${row.rate}%` : "—"}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-semibold text-green-600">{row.delivered.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">delivered</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-card">
          <div className="p-4 border-b">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              By Channel
            </h3>
          </div>
          <div className="divide-y">
            {Object.entries(channelMap).length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground">No data</p>
            ) : Object.entries(channelMap).map(([ch, { delivered, failed }]) => {
              const total = delivered + failed;
              const rate = total > 0 ? Math.round((delivered / total) * 100) : null;
              const option = CHANNEL_OPTIONS.find(o => o.value === ch);
              const Icon = option?.icon ?? MessageSquare;
              return (
                <div key={ch} className="p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{option?.label ?? ch}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 bg-muted rounded-full h-1 overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: rate != null ? `${rate}%` : "0%" }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-10 text-right">
                        {rate != null ? `${rate}%` : "—"}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold">{total.toLocaleString()} sent</p>
                    {failed > 0 && <p className="text-[10px] text-red-500">{failed} failed</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────────

const BLANK_FORM = {
  name: "",
  channel: "sms",
  audience: "all",
  audienceValue: "",
  messageTemplate: getTemplate("all", "sms"),
  scheduledAt: "",
};

export default function Campaigns() {
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [activeTab, setActiveTab] = useState<"campaigns" | "performance">("campaigns");
  const [form, setForm] = useState(BLANK_FORM);

  const isEditing = editingCampaign !== null;
  const dialogOpen = showCreate || isEditing;

  function openCreate() {
    setEditingCampaign(null);
    setForm(BLANK_FORM);
    setShowCreate(true);
  }

  function openEdit(c: Campaign) {
    setShowCreate(false);
    setForm({
      name: c.name,
      channel: c.channel,
      audience: c.audience,
      audienceValue: c.audienceValue ?? "",
      messageTemplate: c.messageTemplate,
      scheduledAt: c.scheduledAt ? new Date(c.scheduledAt).toISOString().slice(0, 16) : "",
    });
    setEditingCampaign(c);
  }

  function closeDialog() {
    setShowCreate(false);
    setEditingCampaign(null);
    setForm(BLANK_FORM);
  }

  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) return [];
      const res = await fetch(`/api/campaigns?storeId=${selectedStore.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedStore?.id,
    // Poll every 5 s while any campaign is pending_review or sending
    refetchInterval: (query) => {
      const data = query.state.data as Campaign[] | undefined;
      if (data?.some(c => c.status === "pending_review" || c.status === "sending")) return 5000;
      return false;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, storeId: selectedStore?.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Campaign saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", selectedStore?.id] });
      closeDialog();
    },
    onError: (e: any) => toast({ title: "Failed to create campaign", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof form }) => {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, storeId: selectedStore?.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Campaign updated", description: "Submit & Send to put it through compliance review again." });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", selectedStore?.id] });
      closeDialog();
    },
    onError: (e: any) => toast({ title: "Failed to update campaign", description: e.message, variant: "destructive" }),
  });

  const sendMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/campaigns/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: selectedStore?.id }),
      });
      const json = await res.json().catch(() => ({}));

      if (res.status === 202) {
        // Pre-flight passed but AI review is queued — not an error.
        return { ...json, pending: true };
      }

      if (!res.ok) {
        // 422 = rejected by pre-flight or AI; other codes = server error.
        throw Object.assign(
          new Error(json.reason || json.message || "Failed to send"),
          { rejected: json.rejected, reason: json.reason }
        );
      }

      return json;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", selectedStore?.id] });
      if (data.pending) {
        toast({
          title: "Campaign queued for review",
          description: data.message ?? "Your campaign is under AI compliance review and will be sent automatically once approved.",
        });
      } else {
        toast({
          title: "Campaign sent!",
          description: `${data.sentCount} message${data.sentCount !== 1 ? "s" : ""} delivered${data.failedCount > 0 ? `, ${data.failedCount} failed` : ""}.`,
        });
      }
    },
    onError: (e: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", selectedStore?.id] });
      toast({
        title: e.rejected ? "Campaign rejected" : "Failed to send",
        description: e.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/campaigns/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: selectedStore?.id }),
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      toast({ title: "Campaign deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", selectedStore?.id] });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const insertTag = (tag: string) => {
    setForm((f) => ({ ...f, messageTemplate: f.messageTemplate + tag }));
  };

  const canSubmit = (status: string) => ["draft", "rejected"].includes(status);

  return (
    <AppLayout>
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-primary" />
            Campaigns
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Send targeted messages to your clients</p>
        </div>
        {activeTab === "campaigns" && (
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            New Campaign
          </Button>
        )}
      </div>

      {/* Compliance notice */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 mb-6">
        <ShieldCheck className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-700">
          <span className="font-semibold">Compliance review required.</span>{" "}
          All campaigns go through an automated pre-flight check and AI compliance review before sending. Campaigns that violate messaging guidelines (TCPA, CTIA, FCC) will be rejected with a reason shown below.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b overflow-x-auto scrollbar-none">
        {([
          { key: "campaigns", label: "Campaigns", icon: Megaphone },
          { key: "performance", label: "Performance", icon: BarChart2 },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {key === "performance" && campaigns.filter(c => c.status === "sent").length > 0 && (
              <span className="ml-1 text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 font-semibold">
                {campaigns.filter(c => c.status === "sent").length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Performance tab */}
      {activeTab === "performance" && (
        <PerformanceTab campaigns={campaigns} />
      )}

      {/* Campaigns tab */}
      {activeTab === "campaigns" && (
        isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading campaigns…</div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed rounded-xl">
            <Megaphone className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-1">No campaigns yet</h3>
            <p className="text-muted-foreground text-sm mb-4">Create your first campaign to re-engage clients</p>
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Create Campaign
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c) => (
              <div
                key={c.id}
                className={`border rounded-xl p-4 bg-card flex items-start gap-4 ${c.status === "rejected" ? "border-red-200 bg-red-50/30" : ""}`}
              >
                <div className="mt-1">
                  {c.channel === "sms" ? <MessageSquare className="w-5 h-5 text-primary" /> :
                   c.channel === "email" ? <Mail className="w-5 h-5 text-blue-500" /> :
                   <RefreshCw className="w-5 h-5 text-purple-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{c.name}</span>
                    {statusBadge(c.status)}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{c.messageTemplate}</p>

                  {/* Rejection reason banner */}
                  {c.status === "rejected" && c.rejectionReason && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 mb-2">
                      <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-red-700 mb-0.5">Rejection reason</p>
                        <p className="text-xs text-red-600 leading-relaxed">{c.rejectionReason}</p>
                        <p className="text-[10px] text-red-400 mt-1">Click <strong>Edit</strong> to fix your message and resubmit.</p>
                      </div>
                    </div>
                  )}

                  {/* Under-review notice */}
                  {c.status === "pending_review" && (
                    <div className="flex items-start gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 mb-2">
                      <Loader2 className="w-3.5 h-3.5 text-purple-500 animate-spin shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-purple-700">Running pre-flight and AI compliance checks…</p>
                        <p className="text-[10px] text-purple-500 mt-0.5">Need to change something? Click <strong>Edit</strong> — this will reset the campaign to draft and you can resubmit.</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {AUDIENCE_OPTIONS.find(a => a.value === c.audience)?.label || c.audience}
                    </span>
                    {c.sentAt && (
                      <span className="flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-green-500" />
                        Sent {format(new Date(c.sentAt), "MMM d, yyyy")} · {c.sentCount} delivered
                        {c.failedCount > 0 && ` · ${c.failedCount} failed`}
                      </span>
                    )}
                    {c.scheduledAt && c.status === "scheduled" && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-blue-500" />
                        Scheduled {format(new Date(c.scheduledAt), "MMM d, h:mm a")}
                      </span>
                    )}
                    {c.reviewedAt && c.status !== "rejected" && (
                      <span className="flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3 text-green-500" />
                        Reviewed {format(new Date(c.reviewedAt), "MMM d")}
                      </span>
                    )}
                  </div>

                  {/* Delivery rate bar for sent campaigns */}
                  {c.status === "sent" && c.sentCount + c.failedCount > 0 && (() => {
                    const rate = deliveryRate(c.sentCount, c.failedCount)!;
                    return (
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 max-w-[120px] bg-muted rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${rate >= 90 ? "bg-green-500" : rate >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                        <span className={`text-[10px] font-semibold ${rate >= 90 ? "text-green-600" : rate >= 70 ? "text-amber-600" : "text-red-500"}`}>
                          {rate}% delivery
                        </span>
                      </div>
                    );
                  })()}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {canSubmit(c.status) && (
                    <Button
                      size="sm"
                      onClick={() => sendMutation.mutate(c.id)}
                      disabled={sendMutation.isPending}
                      variant={c.status === "rejected" ? "outline" : "default"}
                      className={c.status === "rejected" ? "border-orange-300 text-orange-700 hover:bg-orange-50" : ""}
                    >
                      {sendMutation.isPending ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Send className="w-3 h-3 mr-1" />
                      )}
                      {c.status === "rejected" ? "Resubmit" : "Submit & Send"}
                    </Button>
                  )}
                  {/* Edit button — available for any non-sent campaign */}
                  {!["sent", "sending", "scheduled"].includes(c.status) && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-muted-foreground hover:text-foreground"
                      title="Edit campaign"
                      onClick={() => openEdit(c)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  )}
                  {/* Delete — always available except while actively sending */}
                  {c.status !== "sending" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate(c.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Create / Edit campaign dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Campaign" : "Create Campaign"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Compliance hint */}
            {isEditing && editingCampaign?.status === "pending_review" ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5">
                <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700">
                  Saving changes will <strong>reset this campaign to draft</strong> and remove it from the review queue. You'll need to click <em>Submit &amp; Send</em> again to put it back through compliance.
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5">
                <ShieldCheck className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700">
                  {isEditing
                    ? "Your updated message will go through compliance review again when you resubmit. Avoid prohibited content (profanity, adult material, misleading claims)."
                    : "Your campaign will be reviewed for compliance before sending. Avoid prohibited content (cannabis, gambling, adult material, misleading claims) to pass review."}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Campaign Name</Label>
              <Input
                placeholder="e.g. Summer Re-engagement"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Channel</Label>
                <Select
                  value={form.channel}
                  onValueChange={(v) => setForm((f) => ({
                    ...f,
                    channel: v,
                    messageTemplate: isEditing ? f.messageTemplate : getTemplate(f.audience, v),
                  }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHANNEL_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Audience</Label>
                <Select
                  value={form.audience}
                  onValueChange={(v) => setForm((f) => ({
                    ...f,
                    audience: v,
                    messageTemplate: isEditing ? f.messageTemplate : getTemplate(v, f.channel),
                  }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AUDIENCE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Message</Label>
                <div className="flex items-center gap-2">
                  {form.channel === "sms" && (
                    <span className={`text-[10px] tabular-nums font-medium ${form.messageTemplate.length > 640 ? "text-destructive" : form.messageTemplate.length > 320 ? "text-amber-500" : "text-muted-foreground"}`}>
                      {form.messageTemplate.length}/640
                    </span>
                  )}
                  {!isEditing && form.messageTemplate === getTemplate(form.audience, form.channel) && form.messageTemplate && (
                    <span className="text-[10px] text-primary font-medium bg-primary/8 border border-primary/20 rounded px-2 py-0.5">
                      ✦ Template pre-filled
                    </span>
                  )}
                </div>
              </div>
              <Textarea
                value={form.messageTemplate}
                onChange={(e) => setForm((f) => ({ ...f, messageTemplate: e.target.value }))}
                rows={form.channel === "email" ? 8 : 4}
                className="text-sm font-mono leading-relaxed"
              />
              <div className="flex gap-2 flex-wrap">
                {MERGE_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => insertTag(tag)}
                    className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80 font-mono"
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Tags are replaced with real values when the message is sent.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Schedule (optional)</Label>
              <Input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Leave blank to save as draft and submit manually.</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button
                onClick={() => {
                  if (isEditing && editingCampaign) {
                    updateMutation.mutate({ id: editingCampaign.id, data: form });
                  } else {
                    createMutation.mutate(form);
                  }
                }}
                disabled={
                  !form.name.trim() ||
                  !form.messageTemplate.trim() ||
                  createMutation.isPending ||
                  updateMutation.isPending
                }
              >
                {(createMutation.isPending || updateMutation.isPending)
                  ? "Saving…"
                  : isEditing ? "Save Changes" : "Save Campaign"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </AppLayout>
  );
}
