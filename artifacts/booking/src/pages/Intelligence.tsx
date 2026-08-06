import { AppLayout } from "@/components/layout/AppLayout";
import { useSelectedStore } from "@/hooks/use-store";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  TrendingUp, TrendingDown, AlertTriangle, Users, DollarSign,
  Calendar, Zap, RefreshCw, Send, ChevronRight, BarChart3,
  Clock, Target, Activity, CheckCircle2, XCircle, ArrowUpRight,
  ArrowDownRight, Minus, Brain, LineChart, Download, Sparkles,
  Trophy, AlertCircle, Mail, BellOff, Bot, BotOff
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { safeDistanceToNow } from "@/lib/utils";
import { DemoWalkthrough } from "@/components/intelligence/DemoWalkthrough";

function GradeColor(grade: string) {
  if (grade === "A") return "text-emerald-600";
  if (grade === "B") return "text-blue-600";
  if (grade === "C") return "text-amber-600";
  if (grade === "D") return "text-orange-600";
  return "text-red-600";
}

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const size = 140;
  const r = 56;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  const strokeColor =
    score >= 85 ? "#10b981" :
    score >= 70 ? "#3b82f6" :
    score >= 55 ? "#f59e0b" :
    score >= 40 ? "#f97316" :
    "#ef4444";

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={10} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={strokeColor}
          strokeWidth={10}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-4xl font-bold ${GradeColor(grade)}`}>{grade}</span>
        <span className="text-sm text-muted-foreground">{score}/100</span>
      </div>
    </div>
  );
}

function ChurnBadge({ label }: { label: string }) {
  if (label === "critical") return <Badge variant="destructive" className="text-xs">Critical</Badge>;
  if (label === "high") return <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">High Risk</Badge>;
  if (label === "medium") return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">Medium</Badge>;
  return <Badge variant="secondary" className="text-xs">Low</Badge>;
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "up") return <ArrowUpRight className="h-4 w-4 text-emerald-500" />;
  if (trend === "down") return <ArrowDownRight className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function BookingHeatmapGrid({ data }: { data: any }) {
  const { matrix, maxCount, dayLabels } = data;

  // Build lookup: dow -> hour -> count
  const lookup = new Map<string, number>();
  for (const cell of matrix) {
    lookup.set(`${cell.dow}-${cell.hour}`, cell.count);
  }

  // Show hours 7am–9pm
  const hours = Array.from({ length: 15 }, (_, i) => i + 7);
  const days = [1, 2, 3, 4, 5, 6, 0]; // Mon–Sun

  function intensity(count: number): string {
    if (!count || maxCount === 0) return "bg-muted/30";
    const ratio = count / maxCount;
    if (ratio >= 0.8) return "bg-violet-600";
    if (ratio >= 0.6) return "bg-violet-500";
    if (ratio >= 0.4) return "bg-violet-400";
    if (ratio >= 0.2) return "bg-violet-300";
    return "bg-violet-200";
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[480px]">
        {/* Hour labels */}
        <div className="flex mb-1 ml-10">
          {hours.map(h => (
            <div key={h} className="flex-1 text-center text-[9px] text-muted-foreground">
              {h % 2 === 0 ? `${h}` : ""}
            </div>
          ))}
        </div>
        {/* Rows */}
        {days.map(dow => (
          <div key={dow} className="flex items-center gap-1 mb-1">
            <div className="w-9 text-xs text-muted-foreground text-right flex-shrink-0">
              {dayLabels[dow]}
            </div>
            {hours.map(hour => {
              const count = lookup.get(`${dow}-${hour}`) || 0;
              return (
                <TooltipProvider key={hour}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className={`flex-1 h-6 rounded-sm cursor-default transition-colors ${intensity(count)}`} />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {dayLabels[dow]} {hour}:00 — {count} booking{count !== 1 ? "s" : ""}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </div>
        ))}
        {/* Legend */}
        <div className="flex items-center gap-2 mt-3 justify-end">
          <span className="text-xs text-muted-foreground">Less</span>
          {["bg-muted/30", "bg-violet-200", "bg-violet-300", "bg-violet-400", "bg-violet-500", "bg-violet-600"].map((cls, i) => (
            <div key={i} className={`w-4 h-4 rounded-sm ${cls}`} />
          ))}
          <span className="text-xs text-muted-foreground">More</span>
        </div>
      </div>
    </div>
  );
}

const DEMO_EMAILS = [
  "nail-demo@certxa.com",
  "hair-demo@certxa.com",
  "spa-demo@certxa.com",
  "barber-demo@certxa.com",
];

function AICoachingBanner({
  storeId,
  tab,
  metrics,
  enabled = true,
}: {
  storeId: number | undefined;
  tab: string;
  metrics: Record<string, any>;
  enabled?: boolean;
}) {
  const { data, isLoading } = useQuery<{ summary: string }>({
    queryKey: ["/api/intelligence/ai-coaching", storeId, tab, JSON.stringify(metrics)],
    queryFn: async () => {
      const res = await fetch("/api/intelligence/ai-coaching", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ storeId, tab, metrics }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!storeId && enabled,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  if (!enabled && !isLoading) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20 dark:border-violet-900/40 px-4 py-3.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/40 flex-shrink-0 mt-0.5">
        <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-widest mb-1">What This Means For You</p>
        {isLoading ? (
          <div className="space-y-1.5 mt-1">
            <div className="h-3 bg-violet-200/70 dark:bg-violet-800/40 rounded-full animate-pulse w-full" />
            <div className="h-3 bg-violet-200/70 dark:bg-violet-800/40 rounded-full animate-pulse w-4/5" />
          </div>
        ) : data?.summary ? (
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{data.summary}</p>
        ) : null}
      </div>
    </div>
  );
}

export default function Intelligence() {
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => searchParams.get("tab") || "overview");
  const isDemoAccount = (user as any)?.accountType === "tester" || DEMO_EMAILS.includes(user?.email ?? "");

  // ── Demo launch button state ───────────────────────────────────────────
  type DemoStatus = "ready" | "running" | "cooldown";
  const [demoStatus, setDemoStatus] = useState<DemoStatus>("ready");
  const [demoMsLeft, setDemoMsLeft] = useState<number>(0);
  const [demoResetAt, setDemoResetAt] = useState<number | null>(null);

  // Poll the status endpoint every 6s when the demo account is active.
  // When status transitions running → cooldown, invalidate all intelligence
  // queries so the dashboard populates automatically without a manual refresh.
  const prevDemoStatus = useRef<DemoStatus>("ready");
  useEffect(() => {
    if (!isDemoAccount || !storeId) return;

    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/intelligence/demo/status?storeId=${storeId}`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        const newStatus: DemoStatus = data.status;

        // Auto-refresh all dashboard queries the moment engines finish
        if (prevDemoStatus.current === "running" && newStatus === "cooldown") {
          queryClient.invalidateQueries({ queryKey: ["/api/intelligence"] });
        }
        prevDemoStatus.current = newStatus;

        setDemoStatus(newStatus);
        if (newStatus === "cooldown" && data.resetAt) {
          setDemoResetAt(data.resetAt);
          setDemoMsLeft(Math.max(0, data.resetAt - Date.now()));
        } else {
          setDemoResetAt(null);
          setDemoMsLeft(0);
        }
      } catch { /* ignore */ }
    };

    fetchStatus();
    const poll = setInterval(fetchStatus, 6_000);
    return () => clearInterval(poll);
  }, [isDemoAccount, storeId, queryClient]);

  // Tick the countdown every second during cooldown
  useEffect(() => {
    if (demoStatus !== "cooldown" || !demoResetAt) return;
    const tick = setInterval(() => {
      const left = Math.max(0, demoResetAt - Date.now());
      setDemoMsLeft(left);
      if (left === 0) setDemoStatus("ready");
    }, 1_000);
    return () => clearInterval(tick);
  }, [demoStatus, demoResetAt]);

  function formatCountdown(ms: number): string {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  useEffect(() => {
    const tabFromUrl = searchParams.get("tab");
    if (tabFromUrl && tabFromUrl !== activeTab) setActiveTab(tabFromUrl);
  }, [searchParams]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  };

  const { data: dashboard, isLoading: dashLoading } = useQuery<any>({
    queryKey: ["/api/intelligence/dashboard", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/intelligence/dashboard?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: growthData, isLoading: growthLoading } = useQuery<any>({
    queryKey: ["/api/intelligence/growth-score", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/intelligence/growth-score?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: leakageData, isLoading: leakageLoading } = useQuery<any>({
    queryKey: ["/api/intelligence/revenue-leakage", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/intelligence/revenue-leakage?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!storeId,
    staleTime: 10 * 60 * 1000,
  });

  const { data: deadSeatsData, isLoading: deadSeatsLoading } = useQuery<any>({
    queryKey: ["/api/intelligence/dead-seats", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/intelligence/dead-seats?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!storeId && activeTab === "seats",
    staleTime: 10 * 60 * 1000,
  });

  const { data: noShowData, isLoading: noShowLoading } = useQuery<any>({
    queryKey: ["/api/intelligence/no-show-risks", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/intelligence/no-show-risks?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!storeId && activeTab === "noshow",
    staleTime: 5 * 60 * 1000,
  });

  const { data: rebookingData, isLoading: rebookingLoading } = useQuery<any>({
    queryKey: ["/api/intelligence/rebooking-rates", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/intelligence/rebooking-rates?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!storeId && activeTab === "rebooking",
    staleTime: 10 * 60 * 1000,
  });

  const { data: staffPerfData, isLoading: staffPerfLoading } = useQuery<any>({
    queryKey: ["/api/intelligence/staff-performance", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/intelligence/staff-performance?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!storeId && activeTab === "staff",
    staleTime: 10 * 60 * 1000,
  });

  const { data: forecastData, isLoading: forecastLoading } = useQuery<any>({
    queryKey: ["/api/intelligence/forecast", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/intelligence/forecast?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!storeId && activeTab === "forecast",
    staleTime: 15 * 60 * 1000,
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/intelligence/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      });
      if (!res.ok) throw new Error("Failed to refresh");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Intelligence refresh started", description: "Data will update in about 30 seconds" });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/intelligence"] });
      }, 35000);
    },
    onError: () => toast({ title: "Refresh failed", variant: "destructive" }),
  });

  const sendDigestMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/intelligence/send-weekly-digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ storeId }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Weekly digest sent!",
          description: "Check your inbox — the report is on its way.",
        });
      } else {
        toast({
          title: "Digest not sent",
          description: data.skipped || "Email may not be configured yet.",
          variant: "destructive",
        });
      }
    },
    onError: () => toast({ title: "Failed to send digest", variant: "destructive" }),
  });

  const { data: digestPrefs } = useQuery<{ optOut: boolean }>({
    queryKey: ["/api/intelligence/digest-preferences", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/intelligence/digest-preferences?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) return { optOut: false };
      return res.json();
    },
    enabled: !!storeId,
    staleTime: 60 * 1000,
  });

  // ── Autonomous Mode (auto-engage) ─────────────────────────────────────────
  const { data: autoEngageData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/intelligence/auto-engage", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/intelligence/auto-engage?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) return { enabled: true };
      return res.json();
    },
    enabled: !!storeId,
    staleTime: 60 * 1000,
  });

  const autoEngageMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch("/api/intelligence/auto-engage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ storeId, enabled }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/intelligence/auto-engage", storeId], { enabled: data.enabled });
      toast({
        title: data.enabled ? "Auto Client Outreach enabled" : "Auto Client Outreach paused",
        description: data.enabled
          ? "Certxa will now automatically text clients who are overdue, haven't rebooked, or missed an appointment."
          : "Automatic texts paused. Your insights still update — you can message clients manually anytime.",
      });
    },
    onError: () => toast({ title: "Failed to update setting", variant: "destructive" }),
  });

  const autoEngageEnabled = autoEngageData?.enabled ?? true;

  // ── SMS credit balance ────────────────────────────────────────────────────
  const { data: smsStatus } = useQuery<{
    smsAllowance: number;
    smsCredits: number;
    planMonthlyAllowance: number;
    planName: string;
  }>({
    queryKey: ["/api/billing/sms-status", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/billing/sms-status/${storeId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!storeId,
    staleTime: 60 * 1000,
  });

  const totalSmsCredits = (smsStatus?.smsAllowance ?? 0) + (smsStatus?.smsCredits ?? 0);
  const noSmsCredits = smsStatus !== undefined && smsStatus !== null && totalSmsCredits === 0;

  const digestPrefMutation = useMutation({
    mutationFn: async (optOut: boolean) => {
      const res = await fetch("/api/intelligence/digest-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ storeId, optOut }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/intelligence/digest-preferences", storeId], { optOut: data.optOut });
      toast({
        title: data.optOut ? "Weekly digest paused" : "Weekly digest re-enabled",
        description: data.optOut
          ? "You won't receive Monday emails until you turn it back on."
          : "You'll receive the digest every Monday at 9am.",
      });
    },
    onError: () => toast({ title: "Failed to update preference", variant: "destructive" }),
  });

  const winbackMutation = useMutation({
    mutationFn: async (customerId: number) => {
      const res = await fetch("/api/intelligence/winback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, customerId }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Win-back message sent!", description: "Client has been messaged" });
        queryClient.invalidateQueries({ queryKey: ["/api/intelligence/dashboard", storeId] });
      } else {
        toast({ title: "Could not send message", description: data.error, variant: "destructive" });
      }
    },
    onError: () => toast({ title: "Failed to send message", variant: "destructive" }),
  });

  const winbackCampaignMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/intelligence/winback-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: `Win-back campaign complete`,
        description: `${data.sent} messages sent, ${data.skipped} skipped`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/intelligence/dashboard", storeId] });
    },
    onError: () => toast({ title: "Campaign failed", variant: "destructive" }),
  });

  const [campaignSegment, setCampaignSegment] = useState<string | null>(null);
  const [campaignMessage, setCampaignMessage] = useState("");
  const [campaignSent, setCampaignSent] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [sentReminders, setSentReminders] = useState<Set<number>>(new Set());

  const { data: dailyDigest, isLoading: digestLoading } = useQuery<any>({
    queryKey: ["/api/intelligence/daily-digest", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/intelligence/daily-digest?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!storeId,
    staleTime: 3 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const sendReminderMutation = useMutation({
    mutationFn: async ({ appointmentId, customerId }: { appointmentId: number; customerId: number }) => {
      const res = await fetch("/api/intelligence/send-noshow-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ storeId, appointmentId, customerId }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data, variables) => {
      if (data.success) {
        setSentReminders(prev => new Set(prev).add(variables.appointmentId));
        toast({ title: "Reminder sent!", description: "Client has been messaged about their upcoming appointment." });
      } else {
        toast({ title: "Could not send reminder", description: data.error, variant: "destructive" });
      }
    },
    onError: () => toast({ title: "Failed to send reminder", variant: "destructive" }),
  });

  const { data: servicePerfData, isLoading: servicePerfLoading } = useQuery<any>({
    queryKey: ["/api/intelligence/service-performance", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/intelligence/service-performance?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!storeId && activeTab === "services",
    staleTime: 10 * 60 * 1000,
  });

  const { data: priceOptData, isLoading: priceOptLoading } = useQuery<any>({
    queryKey: ["/api/intelligence/price-optimization", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/intelligence/price-optimization?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!storeId && activeTab === "services",
    staleTime: 15 * 60 * 1000,
  });

  const { data: heatmapData, isLoading: heatmapLoading } = useQuery<any>({
    queryKey: ["/api/intelligence/booking-heatmap", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/intelligence/booking-heatmap?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!storeId && activeTab === "forecast",
    staleTime: 15 * 60 * 1000,
  });

  const { data: segmentsData, isLoading: segmentsLoading } = useQuery<any>({
    queryKey: ["/api/intelligence/campaigns/segments", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/intelligence/campaigns/segments?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!storeId && activeTab === "campaigns",
    staleTime: 5 * 60 * 1000,
  });

  const sendCampaignMutation = useMutation({
    mutationFn: async ({ segment, message }: { segment: string; message: string }) => {
      const res = await fetch("/api/intelligence/campaigns/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, segment, message }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      setCampaignSent(data);
      setCampaignMessage("");
      setCampaignSegment(null);
      toast({ title: `Campaign sent!`, description: `${data.sent} messages delivered` });
    },
    onError: () => toast({ title: "Campaign failed", variant: "destructive" }),
  });

  const score = growthData?.live;
  const summary = dashboard?.summary;

  if (!storeId) return (
    <AppLayout>
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Select a store to view intelligence data</p>
      </div>
    </AppLayout>
  );

  // ── Demo gate: if engines have never been run, show the launch prompt ──────
  if (isDemoAccount && !growthLoading && !score?.hasData) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[70vh] px-4">
          <div
            className="text-center max-w-lg"
            style={{ animation: "fadeIn 0.5s ease both" }}
          >
            <style>{`
              @keyframes fadeIn {
                from { opacity: 0; transform: translateY(20px); }
                to   { opacity: 1; transform: translateY(0); }
              }
              @keyframes pulse-glow {
                0%, 100% { box-shadow: 0 0 24px rgba(124,58,237,0.4), 0 0 48px rgba(124,58,237,0.2); }
                50%       { box-shadow: 0 0 40px rgba(124,58,237,0.6), 0 0 80px rgba(124,58,237,0.3); }
              }
            `}</style>

            {/* Icon ring */}
            <div
              className="mx-auto mb-8 w-24 h-24 rounded-full flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
                animation: "pulse-glow 2.5s ease-in-out infinite",
              }}
            >
              <Brain className="h-11 w-11 text-white" />
            </div>

            {/* Copy */}
            <p className="text-xs font-mono tracking-widest text-violet-500 uppercase mb-3">
              engines offline
            </p>
            <h2 className="text-3xl font-bold text-foreground mb-3">
              Intelligence Not Yet Active
            </h2>
            <p className="text-muted-foreground text-base mb-2">
              The Business Intelligence engines haven't been launched for this session yet.
            </p>
            <p className="text-muted-foreground text-sm mb-10">
              Run the engine sequence to scan your booking history, score every client, spot retention risks, find missing revenue, and compute your Business Health Score — then come back here to see the full dashboard.
            </p>

            {/* Launch CTA */}
            <button
              onClick={() => navigate("/intelligence/launch")}
              className="inline-flex items-center gap-3 px-10 py-4 rounded-2xl font-bold text-white text-base transition-all duration-200 active:scale-95 hover:scale-105 mb-6"
              style={{
                background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
                boxShadow: "0 0 32px rgba(124,58,237,0.5)",
                letterSpacing: "0.04em",
              }}
            >
              <Zap className="h-5 w-5" />
              Launch Intelligence Engines
              <Zap className="h-5 w-5" />
            </button>

            <p className="text-xs text-muted-foreground">
              Takes 30–60 seconds · All 8 engines run live against your demo data
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Brain className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">Business Intelligence</h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Plain-English insights that help you grow revenue and keep clients coming back
            </p>
          </div>
          <div className="flex items-center gap-2">
            {summary?.lastComputedAt && (
              <span className="text-xs text-muted-foreground hidden md:block">
                Updated {safeDistanceToNow(summary.lastComputedAt, { addSuffix: true })}
              </span>
            )}
            {isDemoAccount && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => demoStatus === "ready" && navigate("/intelligence/launch")}
                disabled={demoStatus !== "ready"}
                className={
                  demoStatus === "ready"
                    ? "gap-2 border-violet-300 text-violet-700 hover:bg-violet-50 hover:border-violet-400 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-950"
                    : demoStatus === "running"
                    ? "gap-2 border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400 cursor-not-allowed opacity-80"
                    : "gap-2 border-slate-300 text-slate-500 dark:border-slate-600 dark:text-slate-400 cursor-not-allowed opacity-80"
                }
              >
                {demoStatus === "ready" && (
                  <>
                    <Zap className="h-4 w-4" />
                    Launch Engines
                  </>
                )}
                {demoStatus === "running" && (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Engines Running…
                  </>
                )}
                {demoStatus === "cooldown" && (
                  <>
                    <Clock className="h-4 w-4" />
                    Ready in {formatCountdown(demoMsLeft)}
                  </>
                )}
              </Button>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => sendDigestMutation.mutate()}
                    disabled={sendDigestMutation.isPending || digestPrefs?.optOut}
                    className="gap-2"
                  >
                    {sendDigestMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : sendDigestMutation.isSuccess ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Mail className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">
                      {sendDigestMutation.isPending ? "Sending…" : "Send digest"}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="text-xs">
                    {digestPrefs?.optOut
                      ? "Weekly digest is paused. Re-enable it to send test emails."
                      : "Send yourself a preview of the weekly email digest right now — same report that goes out every Monday at 9am."}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={digestPrefs?.optOut ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => digestPrefMutation.mutate(!digestPrefs?.optOut)}
                    disabled={digestPrefMutation.isPending}
                    className="gap-2"
                  >
                    <BellOff className={`h-4 w-4 ${digestPrefs?.optOut ? "text-amber-500" : "text-muted-foreground"}`} />
                    <span className="hidden sm:inline text-xs">
                      {digestPrefs?.optOut ? "Paused" : "Weekly on"}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="text-xs">
                    {digestPrefs?.optOut
                      ? "Weekly digest is paused — click to re-enable Monday emails."
                      : "Click to pause your Monday 9am digest emails. You can re-enable anytime."}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* ── Autonomous Mode toggle ──────────────────────────────────────── */}
        <div className={`rounded-xl border px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 transition-colors ${
          autoEngageEnabled
            ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800"
            : "bg-muted/40 border-border"
        }`}>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              autoEngageEnabled ? "bg-emerald-100 dark:bg-emerald-900/50" : "bg-muted"
            }`}>
              {autoEngageEnabled
                ? <Bot className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                : <BotOff className="w-5 h-5 text-muted-foreground" />
              }
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm">Auto Client Outreach</p>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  autoEngageEnabled
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {autoEngageEnabled ? "Active" : "Paused"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {autoEngageEnabled
                  ? "Certxa automatically texts clients who are overdue, haven't rebooked, or recently missed an appointment — so you never have to chase them manually."
                  : "Automatic texting is paused. Your insights and scores still update — you can message clients manually anytime."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-muted-foreground hidden sm:block">
              {autoEngageEnabled ? "Turn off to pause automatic texts" : "Turn on to resume automatic texts"}
            </span>
            <Switch
              checked={autoEngageEnabled}
              onCheckedChange={(val) => autoEngageMutation.mutate(val)}
              disabled={autoEngageMutation.isPending}
              className="data-[state=checked]:bg-emerald-600"
            />
          </div>
        </div>

        {/* ── No SMS credits warning ─────────────────────────────────────── */}
        {noSmsCredits && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-amber-800 dark:text-amber-300">No SMS credits remaining</p>
                <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5 leading-relaxed">
                  Certxa won't send any automated texts until credits are topped up.
                  {autoEngageEnabled ? " Auto Client Outreach is on but paused until you add credits." : ""}
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate("/manage/billing")}
              className="shrink-0 text-sm font-semibold px-4 py-2 rounded-lg border border-amber-300 hover:bg-amber-100 text-amber-800 dark:text-amber-300 transition-colors whitespace-nowrap"
            >
              Buy SMS Credits
            </button>
          </div>
        )}

        {/* ── Low SMS credits soft warning ────────────────────────────────── */}
        {!noSmsCredits && smsStatus && totalSmsCredits > 0 && totalSmsCredits <= 20 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20 px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                <span className="font-semibold">{totalSmsCredits} SMS credit{totalSmsCredits === 1 ? "" : "s"} left</span>
                {" "}— the system will pause automated sends when they run out.
              </p>
            </div>
            <button
              onClick={() => navigate("/manage/billing")}
              className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-300 hover:bg-amber-100 text-amber-800 dark:text-amber-300 transition-colors whitespace-nowrap"
            >
              Top up
            </button>
          </div>
        )}

        {/* Demo — engines actively running banner */}
        {isDemoAccount && demoStatus === "running" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <RefreshCw className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 animate-spin" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    Intelligence engines are running…
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                    All 8 engines are computing live against your booking history. The dashboard will populate automatically when complete.
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate("/intelligence/launch")}
                className="shrink-0 text-xs font-medium text-amber-700 dark:text-amber-300 underline underline-offset-2 hover:no-underline whitespace-nowrap"
              >
                Watch live →
              </button>
            </div>
            {/* Indeterminate progress bar */}
            <div className="h-1 bg-amber-100 dark:bg-amber-900 overflow-hidden">
              <div
                className="h-full bg-amber-400 dark:bg-amber-500"
                style={{
                  width: "40%",
                  animation: "slide-indeterminate 1.6s ease-in-out infinite",
                }}
              />
            </div>
            <style>{`
              @keyframes slide-indeterminate {
                0%   { transform: translateX(-100%); }
                100% { transform: translateX(350%); }
              }
            `}</style>
          </div>
        )}

        {/* Demo session timer — only shown to demo account while engines are active */}
        {isDemoAccount && demoStatus === "cooldown" && demoMsLeft > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2.5 dark:border-violet-800 dark:bg-violet-950/40">
            <div className="flex items-center gap-2.5 min-w-0">
              <Zap className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
              <p className="text-sm text-violet-800 dark:text-violet-300 font-medium truncate">
                You're in the live demo — explore every tab. This session resets automatically after 90 minutes.
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Clock className="h-3.5 w-3.5 text-violet-500 dark:text-violet-400" />
              <span className="text-sm font-mono font-semibold text-violet-700 dark:text-violet-300 tabular-nums">
                {formatCountdown(demoMsLeft)}
              </span>
            </div>
          </div>
        )}

        {/* Top KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Clients</p>
              <p className="text-2xl font-bold">{summary?.totalClients ?? "—"}</p>
              <p className="text-xs text-muted-foreground mt-1">
                <span className="text-amber-600 font-medium">{summary?.driftingClients ?? 0}</span>{" "}
                {autoEngageEnabled ? "may not return · being messaged" : "may not return · review needed"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Needs Attention</p>
              <p className="text-2xl font-bold text-orange-600">{summary?.atRiskClients ?? "—"}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {autoEngageEnabled ? "Re-engagement texts sent" : "Ready to reach out"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Retention Rate</p>
              {summary?.totalClients > 0 ? (
                <>
                  <p className={`text-2xl font-bold ${
                    summary.totalClients > 0
                      ? Math.round(((summary.totalClients - (summary.atRiskClients || 0)) / summary.totalClients) * 100) >= 80
                        ? "text-emerald-600"
                        : Math.round(((summary.totalClients - (summary.atRiskClients || 0)) / summary.totalClients) * 100) >= 60
                          ? "text-amber-600"
                          : "text-red-600"
                      : ""
                  }`}>
                    {Math.round(((summary.totalClients - (summary.atRiskClients || 0)) / summary.totalClients) * 100)}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Clients not at risk</p>
                </>
              ) : (
                <p className="text-2xl font-bold">—</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Avg Client Value</p>
              <p className="text-2xl font-bold">
                ${summary?.avgLtv12Month ? summary.avgLtv12Month.toFixed(0) : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Per active client (12 months)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Business Health Score</p>
              <p className={`text-2xl font-bold ${score?.hasData ? GradeColor(score.grade) : ""}`}>
                {score?.hasData ? `${score.overallScore}/100` : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Grade: <span className={`font-bold ${score?.hasData ? GradeColor(score.grade) : ""}`}>{score?.hasData ? score.grade : "—"}</span>
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Demo guided walkthrough — only during active cooldown session */}
        {isDemoAccount && demoStatus === "cooldown" && (
          <DemoWalkthrough
            activeTab={activeTab}
            setActiveTab={(tab) => {
              setActiveTab(tab);
              setSearchParams({ tab }, { replace: true });
            }}
            businessType={selectedStore?.category ?? undefined}
          />
        )}

        {/* Main tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="clients">Client Retention</TabsTrigger>
            <TabsTrigger value="leakage">Missing Revenue</TabsTrigger>
            <TabsTrigger value="seats">Empty Time</TabsTrigger>
            <TabsTrigger value="noshow">No-Shows</TabsTrigger>
            <TabsTrigger value="rebooking">Rebooking</TabsTrigger>
            <TabsTrigger value="staff">Staff</TabsTrigger>
            <TabsTrigger value="forecast" className="gap-1.5">
              <LineChart className="h-3.5 w-3.5" />
              Forecast
            </TabsTrigger>
            <TabsTrigger value="campaigns" className="gap-1.5">
              <Send className="h-3.5 w-3.5" />
              Campaigns
            </TabsTrigger>
            <TabsTrigger value="services" className="gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              Services
            </TabsTrigger>
          </TabsList>

          {/* ── OVERVIEW TAB ── */}
          <TabsContent value="overview" className="space-y-6 mt-6">
            <AICoachingBanner
              storeId={storeId}
              tab="overview"
              metrics={{
                growthScore: score?.score,
                grade: score?.grade,
                atRiskClients: dashboard?.atRiskClients?.length ?? 0,
                monthlyRevenue: summary?.monthlyRevenue,
                noShowRate30dPct: summary?.noShowRate30d != null ? +(summary.noShowRate30d * 100).toFixed(1) : undefined,
              }}
              enabled={!!dashboard || !!growthData}
            />
            {/* ── TODAY'S PRIORITY ACTIONS ── */}
            {(digestLoading || dailyDigest) && (
              <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-background">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Zap className="h-5 w-5 text-primary" />
                        Today's Priority Actions
                      </CardTitle>
                      <CardDescription>
                        {dailyDigest?.totalActions > 0
                          ? `${dailyDigest.totalActions} opportunity${dailyDigest.totalActions !== 1 ? "ies" : "y"} identified — here's where to focus`
                          : "Everything looks great — no urgent actions today"}
                      </CardDescription>
                    </div>
                    {dailyDigest?.todayRevenue > 0 && (
                      <div className="text-right hidden sm:block">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide">Revenue today</p>
                        <p className="text-xl font-bold text-emerald-600">${dailyDigest.todayRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {digestLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground py-4">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Loading today's actions…</span>
                    </div>
                  ) : dailyDigest?.actions?.length > 0 ? (
                    <div className="space-y-2">
                      {dailyDigest.actions.map((action: any, i: number) => {
                        const priorityColors: Record<number, string> = {
                          1: "border-red-200 bg-red-50/60 dark:bg-red-950/10 dark:border-red-900/40",
                          2: "border-orange-200 bg-orange-50/60 dark:bg-orange-950/10 dark:border-orange-900/40",
                          3: "border-amber-200 bg-amber-50/60 dark:bg-amber-950/10 dark:border-amber-900/40",
                          4: "border-violet-200 bg-violet-50/60 dark:bg-violet-950/10 dark:border-violet-900/40",
                          5: "border-blue-200 bg-blue-50/60 dark:bg-blue-950/10 dark:border-blue-900/40",
                        };
                        const dotColors: Record<number, string> = {
                          1: "bg-red-500",
                          2: "bg-orange-500",
                          3: "bg-amber-500",
                          4: "bg-violet-500",
                          5: "bg-blue-500",
                        };
                        return (
                          <button
                            key={i}
                            className={`w-full flex items-start gap-3 rounded-xl border p-3.5 text-left hover:opacity-80 transition-opacity ${priorityColors[action.priority] || "border-muted bg-muted/20"}`}
                            onClick={() => handleTabChange(action.tab)}
                          >
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${dotColors[action.priority] || "bg-muted-foreground"}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold">{action.label}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{action.detail}</p>
                              {action.revenueAtStake > 0 && (
                                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 mt-1">
                                  ${action.revenueAtStake.toLocaleString(undefined, { maximumFractionDigits: 0 })} at stake
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                              <span className="text-xs font-medium text-primary hidden sm:block">{action.ctaLabel}</span>
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 py-4">
                      <CheckCircle2 className="h-8 w-8 text-emerald-500 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium">You're all caught up</p>
                        <p className="text-xs text-muted-foreground mt-0.5">No urgent revenue actions needed today. Keep it up!</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Quick Wins Summary */}
            {(dashboard || score) && (() => {
              const wins: { icon: React.ReactNode; color: string; action: string; value: string; tab: string }[] = [];
              if (dashboard?.atRiskClients?.length > 0) {
                wins.push({
                  icon: <Users className="h-4 w-4 text-orange-500" />,
                  color: "border-orange-200 bg-orange-50/50 dark:bg-orange-950/10",
                  action: `${dashboard.atRiskClients.length} clients need re-engagement`,
                  value: `~$${Math.round(dashboard.atRiskClients.reduce((s: number, c: any) => s + parseFloat(c.ltv12Month || "0"), 0) * 0.4).toLocaleString()} recoverable`,
                  tab: "clients",
                });
              }
              if (leakageData?.totalLeakage > 500) {
                wins.push({
                  icon: <DollarSign className="h-4 w-4 text-red-500" />,
                  color: "border-red-200 bg-red-50/50 dark:bg-red-950/10",
                  action: `$${leakageData.totalLeakage.toLocaleString()} in missed revenue (90d)`,
                  value: autoEngageEnabled
                    ? `$${leakageData.recoveryPotential.toLocaleString()} actively being recovered`
                    : `$${leakageData.recoveryPotential.toLocaleString()} recoverable`,
                  tab: "leakage",
                });
              }
              if (noShowData?.upcomingRisks?.length > 0) {
                wins.push({
                  icon: <AlertCircle className="h-4 w-4 text-amber-500" />,
                  color: "border-amber-200 bg-amber-50/50 dark:bg-amber-950/10",
                  action: `${noShowData.upcomingRisks.length} high-risk no-shows upcoming`,
                  value: autoEngageEnabled
                    ? "System monitoring · confirm slots to eliminate risk"
                    : "Confirm appointments to reduce losses",
                  tab: "noshow",
                });
              }
              if (wins.length === 0) return null;
              return (
                <Card className="border-primary/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" />
                      Quick Wins
                    </CardTitle>
                    <CardDescription>
                      {autoEngageEnabled ? "System actions in progress — plus things you can do" : "Highest-impact actions available right now"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {wins.map((win, i) => (
                        <button
                          key={i}
                          className={`w-full flex items-start gap-3 rounded-xl border p-3 text-left hover:opacity-80 transition-opacity ${win.color}`}
                          onClick={() => setActiveTab(win.tab)}
                        >
                          <div className="flex-shrink-0 mt-0.5">{win.icon}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{win.action}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{win.value}</p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Growth Score Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    Business Health Score
                  </CardTitle>
                  <CardDescription>How your business is performing across 5 key areas</CardDescription>
                </CardHeader>
                <CardContent>
                  {growthLoading ? (
                    <div className="flex items-center justify-center h-40">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : score && !score.hasData ? (
                    <div className="flex flex-col items-center justify-center h-40 gap-3 text-center">
                      <span className="text-4xl">📊</span>
                      <div>
                        <p className="text-sm font-medium">No activity yet</p>
                        <p className="text-xs text-muted-foreground mt-1">Your health score will appear here once you start booking clients and completing appointments.</p>
                      </div>
                    </div>
                  ) : score ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-6">
                        <ScoreRing score={score.overallScore} grade={score.grade} />
                        <div className="flex-1 space-y-3">
                          {Object.entries(score.components).map(([key, comp]: [string, any]) => (
                            <div key={key}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs capitalize text-muted-foreground">{key}</span>
                                <span className="text-xs font-medium">{comp.score}/100</span>
                              </div>
                              <Progress value={comp.score} className="h-1.5" />
                            </div>
                          ))}
                        </div>
                      </div>
                      {score.insights.length > 0 && (
                        <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-950/20 space-y-1.5">
                          {score.insights.map((insight: string, i: number) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                              <span className="text-amber-800 dark:text-amber-200">{insight}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      No data yet — click Refresh to run intelligence engine
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Interventions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    Recent Actions
                  </CardTitle>
                  <CardDescription>Automated and manual outreach log</CardDescription>
                </CardHeader>
                <CardContent>
                  {dashLoading ? (
                    <div className="flex items-center justify-center h-32">
                      <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : dashboard?.recentInterventions?.length > 0 ? (
                    <div className="space-y-2">
                      {dashboard.recentInterventions.map((item: any) => (
                        <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${item.status === "sent" ? "bg-emerald-500" : "bg-red-500"}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.customerName || "Unknown"}</p>
                            <p className="text-xs text-muted-foreground capitalize">{item.type.replace(/_/g, " ")} · {item.channel}</p>
                          </div>
                          <div className="text-xs text-muted-foreground flex-shrink-0">
                            {safeDistanceToNow(item.sentAt, { addSuffix: true }, "")}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      No outreach actions yet
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Client Segment Breakdown */}
            {summary && summary.totalClients > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    Client Segment Breakdown
                  </CardTitle>
                  <CardDescription>Health distribution across your {summary.totalClients} tracked clients</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {(() => {
                      const total = summary.totalClients || 1;
                      const atRisk = summary.atRiskClients || 0;
                      const drifting = summary.driftingClients || 0;
                      const healthy = Math.max(0, total - atRisk - drifting);
                      const segments = [
                        { label: "Healthy", count: healthy, color: "bg-emerald-500", textColor: "text-emerald-700", bg: "bg-emerald-50" },
                        { label: "Drifting", count: drifting, color: "bg-amber-400", textColor: "text-amber-700", bg: "bg-amber-50" },
                        { label: "At Risk", count: atRisk, color: "bg-red-500", textColor: "text-red-700", bg: "bg-red-50" },
                      ];
                      return (
                        <>
                          {/* Stacked bar */}
                          <div className="flex rounded-full overflow-hidden h-3 gap-0.5">
                            {segments.map(seg => seg.count > 0 && (
                              <div
                                key={seg.label}
                                className={`${seg.color} transition-all`}
                                style={{ width: `${(seg.count / total) * 100}%` }}
                              />
                            ))}
                          </div>
                          {/* Legend */}
                          <div className="grid grid-cols-3 gap-3">
                            {segments.map(seg => (
                              <div key={seg.label} className={`rounded-lg p-3 ${seg.bg}`}>
                                <p className={`text-lg font-bold ${seg.textColor}`}>{seg.count}</p>
                                <p className={`text-xs ${seg.textColor} opacity-80`}>{seg.label}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {total > 0 ? Math.round((seg.count / total) * 100) : 0}%
                                </p>
                              </div>
                            ))}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quick drifting clients strip */}
            {dashboard?.atRiskClients?.length > 0 && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-orange-500" />
                      Clients Needing Attention
                    </CardTitle>
                    <CardDescription>{dashboard.atRiskClients.length} clients with elevated churn risk</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="gap-1.5 border-emerald-300 text-emerald-700 bg-emerald-50 text-xs">
                      <Zap className="h-3 w-3" />
                      Auto-pilot on
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => winbackCampaignMutation.mutate()}
                      disabled={winbackCampaignMutation.isPending}
                      className="gap-2"
                    >
                      <Send className="h-4 w-4" />
                      {winbackCampaignMutation.isPending ? "Sending..." : "Run Now"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {dashboard.atRiskClients.slice(0, 5).map((client: any) => (
                      <div key={client.customerId} className="flex items-center gap-3 p-3 rounded-xl border hover:bg-muted/40 transition-colors">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 font-bold text-primary text-sm flex-shrink-0">
                          {(client.customerName || "?")[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{client.customerName}</p>
                          <p className="text-xs text-muted-foreground">
                            {client.daysSinceLast ? `${client.daysSinceLast}d since last visit` : "No visits yet"}
                            {client.ltv12Month && parseFloat(client.ltv12Month) > 0
                              ? ` · $${parseFloat(client.ltv12Month).toFixed(0)} LTV`
                              : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <ChurnBadge label={client.churnRiskLabel} />
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0"
                                  onClick={() => winbackMutation.mutate(client.customerId)}
                                  disabled={winbackMutation.isPending || !client.marketingOptIn}
                                >
                                  <Send className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {client.marketingOptIn ? "Send win-back message" : "Client opted out of marketing"}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                    ))}
                    {dashboard.atRiskClients.length > 5 && (
                      <Button variant="ghost" size="sm" className="w-full gap-1 text-muted-foreground" onClick={() => setActiveTab("clients")}>
                        View all {dashboard.atRiskClients.length} clients who need attention
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── AT-RISK CLIENTS TAB ── */}
          <TabsContent value="clients" className="mt-6 space-y-4">
            <AICoachingBanner
              storeId={storeId}
              tab="clients"
              metrics={{
                atRiskClients: dashboard?.atRiskClients?.length ?? 0,
                criticalRisk: dashboard?.atRiskClients?.filter((c: any) => c.churnRiskLabel === "critical").length ?? 0,
                highRisk: dashboard?.atRiskClients?.filter((c: any) => c.churnRiskLabel === "high").length ?? 0,
                avgLtv: dashboard?.atRiskClients?.length
                  ? Math.round(dashboard.atRiskClients.reduce((s: number, c: any) => s + (c.ltv12Month ?? 0), 0) / dashboard.atRiskClients.length)
                  : 0,
              }}
              enabled={!!dashboard}
            />
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3 flex-wrap gap-2">
                <div>
                  <CardTitle>Client Retention</CardTitle>
                  <CardDescription>Clients who may stop coming back — sorted by how much they're worth to your business</CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="gap-1.5 border-emerald-300 text-emerald-700 bg-emerald-50 text-xs">
                    <Zap className="h-3 w-3" />
                    Auto-pilot on · runs every 6h
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => window.open(`/api/intelligence/campaigns/export?storeId=${storeId}&segment=at_risk`, "_blank")}
                  >
                    <Download className="h-4 w-4" />
                    Export CSV
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => winbackCampaignMutation.mutate()}
                    disabled={winbackCampaignMutation.isPending}
                    className="gap-2"
                  >
                    <Send className="h-4 w-4" />
                    {winbackCampaignMutation.isPending ? "Sending..." : "Run Now"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {dashLoading ? (
                  <div className="flex items-center justify-center h-40">
                    <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : dashboard?.atRiskClients?.length > 0 ? (
                  <div className="space-y-2">
                    {dashboard.atRiskClients.map((client: any) => (
                      <div key={client.customerId} className="flex items-center gap-3 p-3 rounded-xl border hover:bg-muted/40 transition-colors">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-bold text-primary flex-shrink-0">
                          {(client.customerName || "?")[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-0.5">
                          <div>
                            <p className="text-sm font-medium truncate">{client.customerName}</p>
                            <p className="text-xs text-muted-foreground">{client.customerPhone || "No phone"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">LTV (12mo)</p>
                            <p className="text-sm font-medium">${parseFloat(client.ltv12Month || "0").toFixed(0)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Last Visit</p>
                            <p className="text-sm">{client.daysSinceLast ? `${client.daysSinceLast}d ago` : "Never"}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <ChurnBadge label={client.churnRiskLabel} />
                            {client.isDrifting && (
                              <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">May slip away</Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 flex-shrink-0"
                          onClick={() => winbackMutation.mutate(client.customerId)}
                          disabled={winbackMutation.isPending || !client.marketingOptIn}
                        >
                          <Send className="h-3.5 w-3.5" />
                          Win-Back
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-emerald-500 opacity-60" />
                    <p className="font-medium">All clients are healthy!</p>
                    <p className="text-sm mt-1">No clients at risk of churning right now</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── REVENUE LEAKAGE TAB ── */}
          <TabsContent value="leakage" className="mt-6 space-y-4">
            <AICoachingBanner
              storeId={storeId}
              tab="leakage"
              metrics={{
                totalLeakedDollars: leakageData?.totals?.totalLeaked,
                noShowRevenue: leakageData?.totals?.noShowRevenue,
                cancellationRevenue: leakageData?.totals?.cancellationRevenue,
                driftingClients: leakageData?.driftingClients?.length ?? 0,
              }}
              enabled={!!leakageData}
            />
            {/* Auto-pilot banner — always shown */}
            <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
              autoEngageEnabled
                ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                : "border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20"
            }`}>
              <div className={`flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0 ${
                autoEngageEnabled ? "bg-emerald-100 dark:bg-emerald-900/40" : "bg-amber-100 dark:bg-amber-900/40"
              }`}>
                {autoEngageEnabled
                  ? <Zap className="h-4 w-4 text-emerald-600" />
                  : <BotOff className="h-4 w-4 text-amber-600" />
                }
              </div>
              <div className="flex-1 min-w-0">
                {autoEngageEnabled ? (
                  <>
                    <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Auto Client Outreach is on</p>
                    <p className="text-xs text-emerald-700/70 dark:text-emerald-400/70">
                      Every 6 hours Certxa scans for no-shows, cancellations, and clients who may not return — and automatically sends personalised texts to anyone who opted in. You don't have to lift a finger.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Auto Client Outreach is paused</p>
                    <p className="text-xs text-amber-700/70 dark:text-amber-400/70">
                      Missed revenue is still tracked below — but no automated texts are being sent. Turn on Auto Client Outreach at the top of this page to start recovering it.
                    </p>
                  </>
                )}
              </div>
            </div>

            {leakageLoading ? (
              <div className="flex items-center justify-center h-40">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : leakageData ? (
              <>
                {/* KPI row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="border-red-200 dark:border-red-900/50">
                    <CardContent className="p-5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Revenue You Missed Out On (90d)</p>
                      <p className="text-3xl font-bold text-red-600">${leakageData.totalLeakage.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-1">From no-shows, cancellations & discounts</p>
                    </CardContent>
                  </Card>
                  <Card className="border-emerald-200 dark:border-emerald-900/50">
                    <CardContent className="p-5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Money We Can Still Recover</p>
                      <p className="text-3xl font-bold text-emerald-600">${leakageData.recoveryPotential.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-1">Realistic estimate — based on typical recovery rates</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Breakdown</p>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">No-shows ({leakageData.breakdown.noShowCount})</span>
                          <span className="font-medium text-red-600">${leakageData.breakdown.noShowLoss.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Cancellations ({leakageData.breakdown.cancellationCount})</span>
                          <span className="font-medium text-orange-600">${leakageData.breakdown.cancellationLoss.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Discounts given</span>
                          <span className="font-medium text-amber-600">${leakageData.breakdown.discountLoss.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Empty time slots (est.)</span>
                          <span className="font-medium text-slate-600">${leakageData.breakdown.deadSeatLoss.toLocaleString()}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* What SalonOS does automatically */}
                <Card className={`border-primary/20 ${autoEngageEnabled ? "bg-primary/5" : "bg-muted/30"}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      {autoEngageEnabled
                        ? <Zap className="h-4 w-4 text-primary" />
                        : <BotOff className="h-4 w-4 text-muted-foreground" />
                      }
                      {autoEngageEnabled ? "What Certxa is doing for you automatically" : "What Certxa will do when Auto Client Outreach is on"}
                    </CardTitle>
                    <CardDescription>
                      {autoEngageEnabled
                        ? "No action needed from you — these run every 6 hours in the background"
                        : "Turn on Auto Client Outreach above to let Certxa start recovering this revenue"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3 text-sm">
                        <div className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 ${autoEngageEnabled ? "bg-emerald-100" : "bg-muted"}`}>
                          {autoEngageEnabled
                            ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                          }
                        </div>
                        <div>
                          <p className="font-medium">No-show & cancellation win-backs</p>
                          <p className="text-muted-foreground text-xs mt-0.5">
                            {autoEngageEnabled
                              ? "Within 7 days of a no-show or cancellation, opted-in clients automatically receive a personalised message with a direct booking link. Rate-limited to once every 30 days per client."
                              : "Win-back SMS would be sent within 7 days of a no-show or cancellation, with a direct booking link."}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 text-sm">
                        <div className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 ${autoEngageEnabled ? "bg-emerald-100" : "bg-muted"}`}>
                          {autoEngageEnabled
                            ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                          }
                        </div>
                        <div>
                          <p className="font-medium">Reaching out to clients who may not return</p>
                          <p className="text-muted-foreground text-xs mt-0.5">
                            {autoEngageEnabled
                              ? "Clients who are overdue for a visit are automatically identified and texted — before they drift away and become hard to win back."
                              : "Clients overdue for a visit would be automatically identified and texted before they fully lapse."}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 text-sm">
                        <div className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 ${autoEngageEnabled ? "bg-emerald-100" : "bg-muted"}`}>
                          {autoEngageEnabled
                            ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                          }
                        </div>
                        <div>
                          <p className="font-medium">Appointment reminders for clients due soon</p>
                          <p className="text-muted-foreground text-xs mt-0.5">
                            {autoEngageEnabled
                              ? "Clients whose next expected visit is 3–7 days away and have no upcoming appointment automatically receive a friendly text with a booking link."
                              : "Clients due in 3–7 days with no upcoming booking would automatically receive a friendly text with a booking link."}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* No-shows by service */}
                {leakageData.topLeakageServices?.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">No-Shows by Service</CardTitle>
                      <CardDescription>Where you're losing the most bookings</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {leakageData.topLeakageServices.map((s: any, i: number) => (
                          <div key={i} className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                            <div className="flex-1">
                              <div className="flex justify-between mb-1">
                                <span className="text-sm">{s.serviceName}</span>
                                <span className="text-sm font-medium text-red-600">${s.estimatedLoss.toLocaleString()}</span>
                              </div>
                              <Progress value={Math.min(100, (s.noShowCount / (leakageData.breakdown.noShowCount || 1)) * 100)} className="h-1.5 bg-red-100" />
                            </div>
                            <span className="text-xs text-muted-foreground w-16 text-right">{s.noShowCount} no-shows</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Action items (was Recommendations) */}
                {leakageData.recommendations?.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Action Items</CardTitle>
                      <CardDescription>Things you can do to plug these leaks further</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {leakageData.recommendations.map((rec: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-sm">
                            <Target className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                            <span>{rec}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Annual leakage projection */}
                {leakageData.totalLeakage > 0 && (
                  <Card className="border-red-200 dark:border-red-900/30 bg-red-50/40 dark:bg-red-950/10">
                    <CardContent className="p-5 flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                        <TrendingDown className="h-5 w-5 text-red-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-sm">Estimated Annual Revenue Gap</p>
                        <p className="text-2xl font-bold text-red-600 mt-1">
                          ${Math.round(leakageData.totalLeakage * (365 / 90)).toLocaleString()}
                          <span className="text-sm font-normal text-muted-foreground ml-1">/ year</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Based on your last 90 days of ${leakageData.totalLeakage.toLocaleString()}.{" "}
                          {autoEngageEnabled ? (
                            <>
                              Auto Client Outreach is active — Certxa is already working to recover{" "}
                              <span className="font-semibold text-emerald-600">
                                ${Math.round(leakageData.recoveryPotential * (365 / 90)).toLocaleString()}/year
                              </span>{" "}of that back.
                            </>
                          ) : (
                            <>
                              Turning on Auto Client Outreach could recover an estimated{" "}
                              <span className="font-semibold text-emerald-600">
                                ${Math.round(leakageData.recoveryPotential * (365 / 90)).toLocaleString()}/year
                              </span>{" "}of that back.
                            </>
                          )}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-40">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </TabsContent>

          {/* ── DEAD SEATS TAB ── */}
          <TabsContent value="seats" className="mt-6 space-y-4">
            <AICoachingBanner
              storeId={storeId}
              tab="seats"
              metrics={{
                utilizationPct: deadSeatsData?.overallUtilization,
                lostRevenuePotential: deadSeatsData?.totalLostRevenuePotential,
                worstDay: deadSeatsData?.worstDay,
                worstHour: deadSeatsData?.worstHour,
                emptySlots: deadSeatsData?.deadSlots?.length ?? 0,
              }}
              enabled={!!deadSeatsData}
            />
            {deadSeatsLoading ? (
              <div className="flex items-center justify-center h-40">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : deadSeatsData ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">How Full Your Schedule Is</p>
                      <p className={`text-3xl font-bold ${deadSeatsData.overallUtilization >= 70 ? "text-emerald-600" : deadSeatsData.overallUtilization >= 50 ? "text-amber-600" : "text-red-600"}`}>
                        {deadSeatsData.overallUtilization}%
                      </p>
                      <Progress value={deadSeatsData.overallUtilization} className="mt-2 h-2" />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Extra Income If These Slots Were Filled</p>
                      <p className="text-3xl font-bold text-amber-600">
                        ${(deadSeatsData.totalLostRevenuePotential || 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Per month, from your emptiest time slots</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Emptiest Time</p>
                      <p className="text-xl font-bold">{deadSeatsData.worstDay || "N/A"}</p>
                      <p className="text-sm text-muted-foreground">{deadSeatsData.worstHour || "No data"}</p>
                    </CardContent>
                  </Card>
                </div>

                {deadSeatsData.deadSlots?.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Times With Empty Slots</CardTitle>
                      <CardDescription>Appointment times below 50% full — sorted by how much extra revenue you could earn</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {deadSeatsData.deadSlots.slice(0, 15).map((slot: any, i: number) => (
                          <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border">
                            <div className={`w-2 h-8 rounded-full flex-shrink-0 ${slot.severity === "high" ? "bg-red-400" : slot.severity === "medium" ? "bg-amber-400" : "bg-slate-300"}`} />
                            <div className="flex-1">
                              <div className="flex justify-between mb-1">
                                <span className="text-sm font-medium">{slot.dayName} {slot.hourLabel}</span>
                                <span className="text-sm font-medium text-amber-600">+${slot.estimatedLostRevenue}/mo potential</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Progress value={slot.utilizationPct} className="h-1.5 flex-1" />
                                <span className="text-xs text-muted-foreground w-10 text-right">{slot.utilizationPct}%</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-emerald-500 opacity-60" />
                      <p className="font-medium">Your schedule is well filled!</p>
                      <p className="text-sm mt-1">No significantly empty time slots detected</p>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>Click Refresh to analyze seat utilization</p>
              </div>
            )}
          </TabsContent>

          {/* ── NO-SHOW RISKS TAB ── */}
          <TabsContent value="noshow" className="mt-6 space-y-4">
            <AICoachingBanner
              storeId={storeId}
              tab="noshow"
              metrics={{
                noShowRatePct: noShowData?.stats?.noShowRate30d != null ? +(noShowData.stats.noShowRate30d * 100).toFixed(1) : undefined,
                noShowCount30d: noShowData?.stats?.noShowCount30d,
                lostRevenue30d: noShowData?.stats?.lostRevenue30d != null ? Math.round(noShowData.stats.lostRevenue30d) : undefined,
                highRiskTomorrow: noShowData?.risks?.length ?? 0,
              }}
              enabled={!!noShowData}
            />
            {noShowLoading ? (
              <div className="flex items-center justify-center h-40">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : noShowData ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">No-Show Rate (30d)</p>
                      <p className={`text-3xl font-bold ${noShowData.stats?.noShowRate30d > 0.15 ? "text-red-600" : "text-emerald-600"}`}>
                        {(noShowData.stats?.noShowRate30d * 100 || 0).toFixed(1)}%
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">No-Shows (30d)</p>
                      <p className="text-3xl font-bold">{noShowData.stats?.noShowCount30d || 0}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Est. Lost Revenue</p>
                      <p className="text-3xl font-bold text-red-600">${(noShowData.stats?.lostRevenue30d || 0).toFixed(0)}</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      Tomorrow's Appointments to Watch
                    </CardTitle>
                    <CardDescription>These clients are more likely to miss their appointment — consider sending a reminder</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {noShowData.risks?.length > 0 ? (
                      <div className="space-y-2">
                        {noShowData.risks.filter((r: any) => r.noShowRiskLabel !== "low").map((risk: any) => {
                          const reminded = sentReminders.has(risk.appointmentId);
                          const isSending = sendReminderMutation.isPending && sendReminderMutation.variables?.appointmentId === risk.appointmentId;
                          return (
                          <div key={risk.appointmentId} className="flex items-center gap-3 p-3 rounded-xl border">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${risk.noShowRiskLabel === "high" ? "bg-red-500" : "bg-amber-400"}`} />
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-0.5">
                                <p className="text-sm font-medium">{risk.customerName}</p>
                                <Badge className={risk.noShowRiskLabel === "high" ? "bg-red-100 text-red-700 border-red-200" : "bg-amber-100 text-amber-700 border-amber-200"} variant="outline">
                                  {risk.noShowRiskLabel === "high" ? "High Risk" : "Medium Risk"}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {risk.serviceName} · {risk.staffName}
                                {" · "}{new Date(risk.appointmentDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                              </p>
                              {risk.riskFactors.length > 0 && (
                                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{risk.riskFactors[0]}</p>
                              )}
                            </div>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant={reminded ? "secondary" : "outline"}
                                    className={`gap-1.5 flex-shrink-0 ${reminded ? "text-emerald-600 border-emerald-200" : ""}`}
                                    disabled={reminded || isSending || !risk.customerPhone}
                                    onClick={() => sendReminderMutation.mutate({ appointmentId: risk.appointmentId, customerId: risk.customerId })}
                                  >
                                    {isSending ? (
                                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                    ) : reminded ? (
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                    ) : (
                                      <Send className="h-3.5 w-3.5" />
                                    )}
                                    <span className="hidden sm:inline text-xs">
                                      {isSending ? "Sending…" : reminded ? "Sent" : "Remind"}
                                    </span>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="left">
                                  {!risk.customerPhone
                                    ? "No phone number on file"
                                    : reminded
                                    ? "Reminder already sent this session"
                                    : "Send an SMS reminder for this appointment"}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-500 opacity-60" />
                        <p>No high-risk appointments tomorrow</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>Click Refresh to analyze no-show risks</p>
              </div>
            )}
          </TabsContent>

          {/* ── FORECAST TAB ── */}
          <TabsContent value="forecast" className="mt-6 space-y-4">
            <AICoachingBanner
              storeId={storeId}
              tab="forecast"
              metrics={{
                baseline30: forecastData?.baselineForecast30,
                optimistic30: forecastData?.optimisticForecast30,
                baseline90: forecastData?.baselineForecast90,
                trend: forecastData?.trend,
                trendPct: forecastData?.trendPct,
                projectedAnnual: forecastData?.projectedAnnual,
              }}
              enabled={!!forecastData}
            />
            {forecastLoading ? (
              <div className="flex items-center justify-center h-40">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : forecastData ? (
              <>
                {/* KPI row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Next 30 Days</p>
                      <p className="text-2xl font-bold">${forecastData.baselineForecast30.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-1">Baseline forecast</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Next 90 Days</p>
                      <p className="text-2xl font-bold">${forecastData.baselineForecast90.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-1">Baseline forecast</p>
                    </CardContent>
                  </Card>
                  <Card className="border-emerald-200 dark:border-emerald-900/50">
                    <CardContent className="p-5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Optimistic 30d</p>
                      <p className="text-2xl font-bold text-emerald-600">${forecastData.optimisticForecast30.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-1">With client recovery</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Projected Annual</p>
                      <p className="text-2xl font-bold">${forecastData.projectedAnnual.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        {forecastData.trend === "growing" ? (
                          <><TrendingUp className="h-3 w-3 text-emerald-500" /><span className="text-emerald-600">+{forecastData.trendPct}% trend</span></>
                        ) : forecastData.trend === "declining" ? (
                          <><TrendingDown className="h-3 w-3 text-red-500" /><span className="text-red-600">{forecastData.trendPct}% trend</span></>
                        ) : (
                          <><Minus className="h-3 w-3" />Stable trend</>
                        )}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Revenue chart — last 12 weeks */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary" />
                      Weekly Revenue — Last 12 Weeks
                    </CardTitle>
                    <CardDescription>Actual revenue by week with trend baseline</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {forecastData.weeklyData?.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart
                          data={forecastData.weeklyData}
                          margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.25} />
                              <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis
                            dataKey="weekLabel"
                            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v}`}
                          />
                          <RechartsTooltip
                            formatter={(val: any) => [`$${Number(val).toLocaleString()}`, "Revenue"]}
                            contentStyle={{
                              background: "hsl(var(--background))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                              fontSize: "12px",
                            }}
                          />
                          {forecastData.weeklyAvgRevenue > 0 && (
                            <ReferenceLine
                              y={forecastData.weeklyAvgRevenue}
                              stroke="#f59e0b"
                              strokeDasharray="4 4"
                              label={{ value: "Avg", position: "right", fontSize: 10, fill: "#f59e0b" }}
                            />
                          )}
                          <Area
                            type="monotone"
                            dataKey="revenue"
                            stroke="#7c3aed"
                            strokeWidth={2}
                            fill="url(#revenueGrad)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        No revenue data available yet
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Uplift from recovery */}
                {forecastData.recoveryAddon > 0 && (
                  <Card className="border-emerald-200 dark:border-emerald-900/50">
                    <CardContent className="p-5 flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
                        <TrendingUp className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">
                          {autoEngageEnabled ? "Re-engagement campaign is running" : "Re-engagement revenue opportunity"}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {autoEngageEnabled ? (
                            <>
                              The Auto Client Outreach campaign is running for clients who may not return, targeting{" "}
                              <span className="font-bold text-emerald-600">${forecastData.recoveryAddon.toLocaleString()}/month</span>{" "}
                              in additional revenue by bringing back lapsed clients.
                            </>
                          ) : (
                            <>
                              Running a re-engagement campaign for clients who may not return could add{" "}
                              <span className="font-bold text-emerald-600">${forecastData.recoveryAddon.toLocaleString()}/month</span>{" "}
                              by winning back roughly 40% of them.
                            </>
                          )}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-3 gap-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                          onClick={() => setActiveTab("clients")}
                        >
                          <Users className="h-3.5 w-3.5" />
                          View Clients Who Need Attention
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Insights */}
                {forecastData.insights?.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Forecast Insights</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {forecastData.insights.map((insight: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-sm">
                            <Activity className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                            <span>{insight}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Booking Heatmap */}
                {!heatmapLoading && heatmapData?.matrix?.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Clock className="h-4 w-4 text-primary" />
                        Booking Demand Heatmap
                      </CardTitle>
                      <CardDescription>
                        When clients book — last 90 days
                        {heatmapData.peakSlot && (
                          <span className="ml-2 text-primary font-medium">
                            · Peak: {heatmapData.peakSlot.day} at {heatmapData.peakSlot.hour}:00
                          </span>
                        )}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <BookingHeatmapGrid data={heatmapData} />
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>Click Refresh to compute revenue forecast</p>
              </div>
            )}
          </TabsContent>

          {/* ── STAFF PERFORMANCE TAB ── */}
          <TabsContent value="staff" className="mt-6 space-y-4">
            <AICoachingBanner
              storeId={storeId}
              tab="staff"
              metrics={{
                topEarner: staffPerfData?.[0]?.staffName,
                topEarnerRevenue90d: staffPerfData?.[0]?.totalRevenue,
                teamSize: staffPerfData?.length ?? 0,
                lowRebookingCount: staffPerfData?.filter((m: any) => m.rebookingRatePct < 30).length ?? 0,
                highNoShowCount: staffPerfData?.filter((m: any) => m.noShowRate > 15).length ?? 0,
                avgRebookingRatePct: staffPerfData?.length
                  ? Math.round(staffPerfData.reduce((s: number, m: any) => s + (m.rebookingRatePct ?? 0), 0) / staffPerfData.length)
                  : undefined,
              }}
              enabled={!!staffPerfData?.length}
            />
            {staffPerfLoading ? (
              <div className="flex items-center justify-center h-40">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : staffPerfData?.length > 0 ? (
              <>
                {/* Smart insights for staff */}
                {(() => {
                  const topEarner = staffPerfData[0];
                  const lowRebook = staffPerfData.filter((m: any) => m.rebookingRatePct < 30);
                  const highNoShow = staffPerfData.filter((m: any) => m.noShowRate > 15);
                  const insights: { icon: React.ReactNode; color: string; text: string }[] = [];
                  if (topEarner) insights.push({ icon: <Trophy className="h-4 w-4 text-amber-500" />, color: "bg-amber-50 border-amber-200", text: `${topEarner.staffName} is your top earner — $${topEarner.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })} in 90 days.` });
                  if (lowRebook.length > 0) insights.push({ icon: <AlertCircle className="h-4 w-4 text-orange-500" />, color: "bg-orange-50 border-orange-200", text: `${lowRebook.map((m: any) => m.staffName.split(" ")[0]).join(", ")} ${lowRebook.length === 1 ? "has" : "have"} a rebooking rate below 30% — consider a coaching conversation.` });
                  if (highNoShow.length > 0) insights.push({ icon: <AlertCircle className="h-4 w-4 text-red-500" />, color: "bg-red-50 border-red-200", text: `${highNoShow.map((m: any) => m.staffName.split(" ")[0]).join(", ")} ${highNoShow.length === 1 ? "has" : "have"} above-average no-show rates. Consider requiring deposits for their bookings.` });
                  if (insights.length === 0) return null;
                  return (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          Performance Insights
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {insights.map((ins, i) => (
                            <div key={i} className={`flex items-start gap-3 rounded-lg border p-3 ${ins.color}`}>
                              <div className="flex-shrink-0 mt-0.5">{ins.icon}</div>
                              <p className="text-sm">{ins.text}</p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* Revenue summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Team Size</p>
                      <p className="text-2xl font-bold">{staffPerfData.length}</p>
                      <p className="text-xs text-muted-foreground mt-1">Active staff members</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Revenue (90d)</p>
                      <p className="text-2xl font-bold">
                        ${staffPerfData.reduce((s: number, m: any) => s + m.totalRevenue, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Across all staff</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Avg Rebooking Rate</p>
                      <p className="text-2xl font-bold">
                        {staffPerfData.length > 0
                          ? Math.round(staffPerfData.reduce((s: number, m: any) => s + (m.rebookingRatePct || 0), 0) / staffPerfData.length)
                          : 0}%
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Team average</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-5">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Appointments</p>
                      <p className="text-2xl font-bold">
                        {staffPerfData.reduce((s: number, m: any) => s + m.completedCount, 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Completed (90d)</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Staff leaderboard */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      Staff Performance Leaderboard — Last 90 Days
                    </CardTitle>
                    <CardDescription>Ranked by total revenue generated</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {staffPerfData.map((member: any, i: number) => (
                        <div key={member.staffId} className="p-4 rounded-xl border hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-3 mb-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                              i === 0 ? "bg-amber-100 text-amber-700" :
                              i === 1 ? "bg-slate-100 text-slate-600" :
                              i === 2 ? "bg-orange-100 text-orange-700" :
                              "bg-muted text-muted-foreground"
                            }`}>
                              {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <p className="font-semibold text-sm">{member.staffName}</p>
                                <p className="font-bold text-sm text-emerald-600">${member.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                              </div>
                              <p className="text-xs text-muted-foreground capitalize">{member.staffRole || "Staff"}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                            <div>
                              <p className="text-muted-foreground mb-0.5">Completed</p>
                              <p className="font-semibold">{member.completedCount}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground mb-0.5">Avg Ticket</p>
                              <p className="font-semibold">${member.avgTicket.toFixed(0)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground mb-0.5">Unique Clients</p>
                              <p className="font-semibold">{member.uniqueClients}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground mb-0.5">Rebooking</p>
                              <p className={`font-semibold ${
                                member.rebookingRatePct >= 50 ? "text-emerald-600" :
                                member.rebookingRatePct >= 30 ? "text-amber-600" :
                                "text-red-600"
                              }`}>
                                {member.rebookingRatePct}%
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground mb-0.5">No-Shows</p>
                              <p className={`font-semibold ${member.noShowRate > 15 ? "text-red-600" : "text-foreground"}`}>
                                {member.noShowCount} ({member.noShowRate}%)
                              </p>
                            </div>
                          </div>
                          {/* Rebooking bar */}
                          <div className="mt-3">
                            <div className="flex justify-between text-xs text-muted-foreground mb-1">
                              <span>Rebooking rate</span>
                              <span className="flex items-center gap-1">
                                <TrendIcon trend={member.trend} />
                                {member.rebookingRatePct}%
                              </span>
                            </div>
                            <Progress
                              value={member.rebookingRatePct}
                              className={`h-1.5 ${member.rebookingRatePct >= 50 ? "[&>div]:bg-emerald-500" : member.rebookingRatePct >= 30 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500"}`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No staff data available</p>
                <p className="text-sm mt-1">Data will appear once appointments are completed</p>
              </div>
            )}
          </TabsContent>

          {/* ── REBOOKING RATES TAB ── */}
          <TabsContent value="rebooking" className="mt-6 space-y-4">
            <AICoachingBanner
              storeId={storeId}
              tab="rebooking"
              metrics={{
                topStaff: rebookingData?.live?.[0]?.staffName,
                topRatePct: rebookingData?.live?.[0]?.rebookingRatePct,
                bottomRatePct: rebookingData?.live?.[rebookingData.live.length - 1]?.rebookingRatePct,
                bottomStaff: rebookingData?.live?.[rebookingData.live.length - 1]?.staffName,
                avgRatePct: rebookingData?.live?.length
                  ? Math.round(rebookingData.live.reduce((s: number, m: any) => s + (m.rebookingRatePct ?? 0), 0) / rebookingData.live.length)
                  : undefined,
                teamSize: rebookingData?.live?.length ?? 0,
              }}
              enabled={!!rebookingData?.live?.length}
            />
            {/* What is rebooking rate? */}
            <div className="rounded-xl border border-violet-200 bg-violet-50 dark:bg-violet-950/20 dark:border-violet-900/40 px-4 py-3 flex items-start gap-3">
              <Activity className="h-4 w-4 text-violet-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-violet-900 dark:text-violet-200">
                <span className="font-semibold">What is the rebooking rate?</span>{" "}
                It shows what percentage of a stylist's completed appointments led to the client booking again within 30 days. A high rate means clients love coming back — a rate below 30% often means there's a coaching opportunity or something to tweak.
              </div>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Rebooking Rate by Team Member</CardTitle>
                <CardDescription>% of completed appointments where the client re-booked within 30 days (last 6 months)</CardDescription>
              </CardHeader>
              <CardContent>
                {rebookingLoading ? (
                  <div className="flex items-center justify-center h-40">
                    <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : rebookingData?.live?.length > 0 ? (
                  <div className="space-y-3">
                    {rebookingData.live.map((s: any) => (
                      <div key={s.staffId} className="flex items-center gap-4 p-3 rounded-xl border">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-bold text-primary flex-shrink-0">
                          {s.staffName[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">{s.staffName}</span>
                            <div className="flex items-center gap-1.5">
                              <TrendIcon trend={s.trend} />
                              <span className={`text-sm font-bold ${s.rebookingRatePct >= 50 ? "text-emerald-600" : s.rebookingRatePct >= 30 ? "text-amber-600" : "text-red-600"}`}>
                                {s.rebookingRatePct}%
                              </span>
                            </div>
                          </div>
                          <Progress value={s.rebookingRatePct} className="h-2 mb-1" />
                          <div className="flex gap-3 text-xs text-muted-foreground">
                            <span>{s.totalCompleted} completed</span>
                            <span>{s.uniqueClients} clients</span>
                            <span>${s.avgTicket.toFixed(0)} avg ticket</span>
                            {s.noShowCount > 0 && <span className="text-red-500">{s.noShowCount} no-shows</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>No staff data available yet</p>
                    <p className="text-sm mt-1">Data populates once appointments are completed</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          {/* ── CAMPAIGNS TAB ── */}
          <TabsContent value="campaigns" className="mt-6 space-y-6">
            {/* Success banner */}
            {campaignSent && (
              <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-emerald-800">Campaign sent!</p>
                  <p className="text-sm text-emerald-700 mt-0.5">
                    {campaignSent.sent} of {campaignSent.total} messages delivered
                    {campaignSent.failed > 0 && `, ${campaignSent.failed} failed`}
                  </p>
                </div>
                <button onClick={() => setCampaignSent(null)} className="ml-auto text-emerald-400 hover:text-emerald-600">
                  <XCircle className="h-4 w-4" />
                </button>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-5 w-5 text-primary" />
                  SMS Campaigns
                </CardTitle>
                <CardDescription>
                  Send targeted messages to specific client segments. Only clients with phone numbers who haven't opted out are included.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Step 1 — Choose segment */}
                <div>
                  <p className="text-sm font-semibold mb-3">1. Choose your audience</p>
                  {segmentsLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Loading segments…</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(segmentsData?.segments || []).map((seg: any) => {
                        const colorMap: Record<string, string> = {
                          red: "border-red-200 bg-red-50 data-[selected=true]:border-red-500 data-[selected=true]:bg-red-100",
                          amber: "border-amber-200 bg-amber-50 data-[selected=true]:border-amber-500 data-[selected=true]:bg-amber-100",
                          violet: "border-violet-200 bg-violet-50 data-[selected=true]:border-violet-500 data-[selected=true]:bg-violet-100",
                          pink: "border-pink-200 bg-pink-50 data-[selected=true]:border-pink-500 data-[selected=true]:bg-pink-100",
                        };
                        const badgeMap: Record<string, string> = {
                          red: "bg-red-100 text-red-700",
                          amber: "bg-amber-100 text-amber-700",
                          violet: "bg-violet-100 text-violet-700",
                          pink: "bg-pink-100 text-pink-700",
                        };
                        return (
                          <button
                            key={seg.id}
                            data-selected={campaignSegment === seg.id}
                            onClick={() => setCampaignSegment(seg.id === campaignSegment ? null : seg.id)}
                            className={`w-full text-left rounded-xl border-2 p-4 transition-all ${colorMap[seg.color] || "border-muted bg-muted/30"}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold text-sm">{seg.label}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{seg.description}</p>
                              </div>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${badgeMap[seg.color] || "bg-muted text-muted-foreground"}`}>
                                {seg.count}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Step 2 — Write message */}
                {campaignSegment && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold mb-1">2. Write your message</p>
                      <p className="text-xs text-muted-foreground mb-2">Use <code className="bg-muted px-1 rounded">{"{name}"}</code> to personalise with the client's first name.</p>
                    </div>
                    <div className="space-y-2">
                      {/* Quick templates */}
                      <div className="flex flex-wrap gap-2">
                        {[
                          { label: "Win-back offer", text: "Hey {name}! We miss you — book this week and get 10% off. Reply STOP to opt out." },
                          { label: "Check-in", text: "Hi {name}, it's been a while! We'd love to see you again. Book at certxa.com. Reply STOP to opt out." },
                          { label: "VIP offer", text: "Hi {name}! As one of our valued clients, you get early access to our next open slots. Book now! Reply STOP to opt out." },
                        ].map((tpl) => (
                          <button
                            key={tpl.label}
                            onClick={() => setCampaignMessage(tpl.text)}
                            className="text-xs border rounded-full px-3 py-1 hover:bg-muted transition-colors"
                          >
                            {tpl.label}
                          </button>
                        ))}
                      </div>
                      <textarea
                        rows={4}
                        value={campaignMessage}
                        onChange={(e) => setCampaignMessage(e.target.value)}
                        placeholder="Type your message here…"
                        className="w-full rounded-xl border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                      />
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">{campaignMessage.length} / 160 characters</p>
                        <p className="text-xs text-muted-foreground">
                          Sending to: <span className="font-semibold text-foreground">
                            {segmentsData?.segments?.find((s: any) => s.id === campaignSegment)?.count || 0} recipients
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Send + Export buttons */}
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        onClick={() => sendCampaignMutation.mutate({ segment: campaignSegment, message: campaignMessage })}
                        disabled={!campaignMessage.trim() || sendCampaignMutation.isPending}
                        className="gap-2"
                      >
                        <Send className="h-4 w-4" />
                        {sendCampaignMutation.isPending ? "Sending…" : "Send Campaign"}
                      </Button>
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => window.open(`/api/intelligence/campaigns/export?storeId=${storeId}&segment=${campaignSegment}`, "_blank")}
                      >
                        <Download className="h-4 w-4" />
                        Export CSV
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* How Autonomous Mode campaigns work */}
            <Card className="border-violet-200 dark:border-violet-900/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="h-4 w-4 text-violet-600" />
                  How Automated Campaigns Work
                </CardTitle>
                <CardDescription>
                  What Certxa sends automatically when Auto Client Outreach is on
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    {
                      label: "Appointment Reminders",
                      color: "bg-violet-100 text-violet-700",
                      when: "3–7 days before a client's expected next visit",
                      msg: "Sent to clients whose next appointment window is coming up but haven't booked yet. Uses each client's personal visit pattern to know the right time to send.",
                    },
                    {
                      label: "Re-engagement (Overdue Clients)",
                      color: "bg-amber-100 text-amber-700",
                      when: "When a client is 20%+ overdue for their usual visit",
                      msg: "Sent to clients who are overdue based on their personal visit history. Only sent to clients with 2+ visits — one visit doesn't establish a pattern. Max once per 30 days.",
                    },
                    {
                      label: "No-Show & Cancellation Recovery",
                      color: "bg-red-100 text-red-700",
                      when: "Within 7 days of a missed or cancelled appointment",
                      msg: "Sent to clients who no-showed or cancelled recently and haven't received any automated message in 30 days. Invites them to rebook.",
                    },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-3 rounded-xl border p-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${item.color}`}>
                        {item.label}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground mb-0.5">{item.when}</p>
                        <p className="text-xs text-muted-foreground">{item.msg}</p>
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground pt-1">
                    All automated messages are only sent to clients who have opted in to marketing and have a phone number. SMS credits are consumed per message sent.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Recent automated SMS activity */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  Recent SMS Activity
                </CardTitle>
                <CardDescription>Last 10 automated and manual messages sent by the system</CardDescription>
              </CardHeader>
              <CardContent>
                {dashLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground py-4">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading…</span>
                  </div>
                ) : dashboard?.recentInterventions?.length > 0 ? (
                  <div className="space-y-2">
                    {dashboard.recentInterventions.map((item: any) => {
                      const typeLabels: Record<string, { label: string; color: string }> = {
                        winback:               { label: "Win-back",           color: "bg-amber-100 text-amber-700" },
                        rebooking_nudge:       { label: "Appointment reminder", color: "bg-violet-100 text-violet-700" },
                        no_show_winback:       { label: "No-show recovery",   color: "bg-red-100 text-red-700" },
                        cancellation_recovery: { label: "Cancel recovery",    color: "bg-orange-100 text-orange-700" },
                        campaign:              { label: "Campaign",           color: "bg-blue-100 text-blue-700" },
                      };
                      const meta = typeLabels[item.type] || { label: item.type.replace(/_/g, " "), color: "bg-muted text-muted-foreground" };
                      return (
                        <div key={item.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${item.status === "sent" ? "bg-emerald-500" : "bg-red-400"}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium truncate">{item.customerName || "Unknown client"}</p>
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${meta.color}`}>
                                {meta.label}
                              </span>
                              {item.triggeredBy === "auto" && (
                                <span className="text-[10px] text-muted-foreground border rounded-full px-1.5 py-0.5">Auto</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground capitalize">{item.channel}</p>
                          </div>
                          <p className="text-xs text-muted-foreground flex-shrink-0">
                            {safeDistanceToNow(item.sentAt, { addSuffix: true }, "")}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
                    <Send className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm font-medium text-muted-foreground">No messages sent yet</p>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      {autoEngageEnabled
                        ? "The system will start sending automated messages as clients meet the criteria above. Check back after the next engine run."
                        : "Turn on Autonomous Mode to let the system send win-back, nudge, and recovery messages automatically."}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Campaign tips */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Manual Campaign Tips</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" /> Always include an opt-out instruction (e.g. "Reply STOP to opt out")</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" /> Keep messages under 160 characters to avoid split SMS charges</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" /> Personalise with {"{"} name {"}"} for higher open rates</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" /> Best sending window: Tuesday–Thursday, 10am–2pm local time</li>
                </ul>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── SERVICES PERFORMANCE TAB ── */}
          <TabsContent value="services" className="mt-6 space-y-4">
            {/* Price Optimization Card */}
            {!priceOptLoading && priceOptData?.suggestions?.length > 0 && (
              <Card className="border-violet-200 dark:border-violet-900/40">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Target className="h-4 w-4 text-violet-600" />
                    Price Optimization Suggestions
                  </CardTitle>
                  <CardDescription>AI-powered pricing recommendations based on demand and no-show patterns</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {priceOptData.suggestions.map((sug: any) => (
                      <div key={sug.serviceId} className={`rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center gap-3 ${
                        sug.priority === "high" ? "border-red-200 bg-red-50/50 dark:bg-red-950/10" :
                        sug.priority === "medium" ? "border-amber-200 bg-amber-50/50 dark:bg-amber-950/10" :
                        "border-border bg-muted/20"
                      }`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm">{sug.serviceName}</span>
                            <Badge variant="outline" className={`text-xs ${
                              sug.priority === "high" ? "border-red-400 text-red-700" :
                              sug.priority === "medium" ? "border-amber-400 text-amber-700" :
                              "border-muted-foreground text-muted-foreground"
                            }`}>
                              {sug.priority} priority
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{sug.reasoning}</p>
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0 text-sm">
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">Current</p>
                            <p className="font-semibold">${sug.currentPrice.toFixed(0)}</p>
                          </div>
                          <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">{sug.recommendation === "Require deposit" ? "Deposit" : "Suggested"}</p>
                            <p className={`font-bold ${
                              sug.recommendation === "Promotional pricing" ? "text-emerald-600" : "text-violet-600"
                            }`}>
                              ${sug.recommendedPrice?.toFixed(0)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            {servicePerfLoading ? (
              <div className="flex items-center justify-center h-40">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : servicePerfData?.services?.length > 0 ? (
              <>
                {/* Insights */}
                {servicePerfData.insights?.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        Service Insights
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {servicePerfData.insights.map((ins: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-sm">
                            <Activity className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                            <span>{ins}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Service table */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Service Performance — Last 90 Days</CardTitle>
                    <CardDescription>Ranked by total revenue generated</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {servicePerfData.services.map((svc: any, i: number) => (
                        <div key={svc.serviceId} className="rounded-xl border p-4 hover:bg-muted/30 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${i === 0 ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"}`}>
                                #{i + 1}
                              </span>
                              <span className="font-semibold text-sm">{svc.serviceName}</span>
                            </div>
                            <span className="font-bold text-sm text-emerald-600">${svc.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                            <div>
                              <p className="text-muted-foreground mb-0.5">Bookings</p>
                              <p className="font-semibold">{svc.totalBookings}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground mb-0.5">Avg Ticket</p>
                              <p className="font-semibold">${svc.avgTicket.toFixed(0)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground mb-0.5">Completion</p>
                              <p className={`font-semibold ${svc.completionRate >= 80 ? "text-emerald-600" : svc.completionRate >= 60 ? "text-amber-600" : "text-red-600"}`}>
                                {svc.completionRate}%
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground mb-0.5">No-Shows</p>
                              <p className={`font-semibold ${svc.noShowRate > 20 ? "text-red-600" : svc.noShowRate > 10 ? "text-amber-600" : "text-foreground"}`}>
                                {svc.noShowCount} ({svc.noShowRate}%)
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground mb-0.5">$/min</p>
                              <p className="font-semibold">${svc.revenuePerMin.toFixed(2)}</p>
                            </div>
                          </div>
                          {svc.noShowRate > 20 && svc.totalBookings >= 5 && (
                            <div className="mt-2 flex items-center gap-1.5 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-2 py-1.5">
                              <AlertCircle className="h-3 w-3 flex-shrink-0" />
                              High no-show rate — deposit recommended
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No service data yet</p>
                <p className="text-sm mt-1">Complete some appointments to see service analytics</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
