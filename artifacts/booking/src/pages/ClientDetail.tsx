import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useSelectedStore } from "@/hooks/use-store";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Mail, Phone, Brain, TrendingUp, Calendar,
  AlertTriangle, Send, RefreshCw, ExternalLink, Zap, Star,
  CheckCircle2, XCircle, Clock3, Ban,
} from "lucide-react";

// ─── Risk meter ───────────────────────────────────────────────────────────────

function RiskMeter({ score }: { score: number }) {
  const color =
    score >= 75 ? "#ef4444" :
    score >= 50 ? "#f97316" :
    score >= 25 ? "#f59e0b" : "#10b981";
  return (
    <div className="space-y-1">
      <div className="w-full bg-muted rounded-full h-2">
        <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${score}%`, backgroundColor: color }} />
      </div>
      <p className="text-xs text-muted-foreground text-right">{score}/100</p>
    </div>
  );
}

function ChurnBadge({ label }: { label: string }) {
  const styles: Record<string, string> = {
    low:      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
    medium:   "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
    high:     "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400",
    critical: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  };
  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize", styles[label] || styles.low)}>
      {label}
    </span>
  );
}

function ClientAvatar({ name, status, size = "lg" }: { name: string; status?: string; size?: "sm" | "lg" }) {
  const initials = name ? name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) : "?";
  const isVip = status === "vip";
  const dim = size === "lg" ? "w-16 h-16 text-xl" : "w-10 h-10 text-sm";
  return (
    <div className={cn("rounded-full flex items-center justify-center font-bold shrink-0", dim,
      isVip ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary")}>
      {initials}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const clientId = Number(id);
  const navigate = useNavigate();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"overview" | "intelligence">("overview");

  const { data: client, isLoading } = useQuery<any>({
    queryKey: ["/api/clients", clientId, storeId],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load client");
      return res.json();
    },
    enabled: !!clientId && !!storeId,
  });

  const matchedCustomerId = client?.matchedCustomerId;

  const { data: intelData, isLoading: intelLoading } = useQuery<any>({
    queryKey: ["/api/intelligence/client", matchedCustomerId, storeId],
    queryFn: async () => {
      const res = await fetch(`/api/intelligence/client/${matchedCustomerId}?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!matchedCustomerId && !!storeId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: bookings = [], isLoading: bookingsLoading } = useQuery<any[]>({
    queryKey: ["/api/clients", clientId, "appointments", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${clientId}/appointments?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!clientId && !!storeId,
  });

  const winbackMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/intelligence/winback", { storeId, customerId: matchedCustomerId });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Win-back SMS sent!", description: "The client will receive a message shortly." });
        queryClient.invalidateQueries({ queryKey: ["/api/intelligence/client", matchedCustomerId, storeId] });
      } else {
        toast({ title: "Couldn't send SMS", description: data.error || "Unknown error", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send win-back SMS", variant: "destructive" });
    },
  });

  const intel = intelData?.intel;
  const interventions: any[] = intelData?.interventions ?? [];

  const ltv12   = Number(intel?.ltv12Month ?? 0);
  const ltvAll  = Number(intel?.ltvAllTime ?? 0);
  const avgTick = Number(intel?.avgTicketValue ?? 0);
  const churnScore = Number(intel?.churnRiskScore ?? 0);
  const cadenceDays = intel?.avgVisitCadenceDays ? Math.round(Number(intel.avgVisitCadenceDays)) : null;
  const daysSinceLast = intel?.daysSinceLastVisit ?? null;
  const isOverdue = daysSinceLast !== null && cadenceDays !== null && daysSinceLast > cadenceDays * 1.25;
  const lastVisit = intel?.lastVisitDate ? new Date(intel.lastVisitDate) : null;
  const nextExpected = intel?.nextExpectedVisitDate ? new Date(intel.nextExpectedVisitDate) : null;
  const rebookingRate = Number(intel?.rebookingRate ?? 0);
  const noShowRate = Number(intel?.noShowRate ?? 0);

  const hasAlert = intel?.isAtRisk || intel?.isDrifting;

  // Stat tiles derived from client record (visits/spend already synced by migration)
  const totalVisits  = client?.totalVisits ?? 0;
  const totalSpent   = client?.totalSpentCents ? (client.totalSpentCents / 100) : 0;
  const lastVisitAt  = client?.lastVisitAt ? new Date(client.lastVisitAt) : null;
  const loyaltyPoints = client?.loyaltyPoints ?? null;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!client) {
    return (
      <AppLayout>
        <div className="text-center py-20 text-muted-foreground">Client not found.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {/* Back */}
      <button
        onClick={() => navigate("/customers")}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Clients
      </button>

      {/* Header card */}
      <div className="bg-card border rounded-2xl p-5 mb-4 flex items-start gap-4 shadow-sm">
        <ClientAvatar name={client.fullName} status={client.clientStatus} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold truncate">{client.fullName || "Unnamed Client"}</h1>
            {client.clientStatus === "vip" && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">⭐ VIP</span>
            )}
            {client.clientStatus === "inactive" && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Inactive</span>
            )}
            {hasAlert && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {intel?.isAtRisk ? "At Risk" : "Drifting"}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1 mt-1.5">
            {client.primaryEmail && (
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" /> {client.primaryEmail}
              </span>
            )}
            {client.primaryPhone && (
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" /> {client.primaryPhone}
              </span>
            )}
          </div>
          {(client.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {client.tags.map((tag: any) => (
                <span
                  key={tag.id}
                  className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
                  style={{ backgroundColor: tag.tag_color }}
                >
                  {tag.tag_name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: "Total Visits",    value: `${totalVisits}` },
          { label: "Lifetime Spend",  value: `$${totalSpent.toFixed(0)}` },
          { label: "Loyalty Points",  value: loyaltyPoints !== null ? `${loyaltyPoints} pts` : "—" },
          { label: "Last Visit",      value: lastVisitAt ? formatDistanceToNow(lastVisitAt, { addSuffix: true }) : "—" },
        ].map(stat => (
          <Card key={stat.label} className="p-4 text-center shadow-sm">
            <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
            <p className="text-lg font-bold">{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b mb-4 overflow-x-auto scrollbar-none">
        {[
          { id: "overview" as const,     label: "Overview" },
          { id: "intelligence" as const, label: "Revenue Intelligence", dot: hasAlert },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "relative px-4 pb-3 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {tab.dot && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-orange-500" />
            )}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {activeTab === "overview" && (
        <div className="space-y-4">

          {/* Notes */}
          {client.notes && client.notes.length > 0 && (
            <Card className="p-4">
              <p className="text-sm font-semibold mb-2">Notes</p>
              <div className="space-y-2">
                {client.notes.map((note: any) => (
                  <p key={note.id} className="text-sm text-muted-foreground">{note.noteContent}</p>
                ))}
              </div>
            </Card>
          )}

          {/* Intelligence quick-glance (only if data exists) */}
          {intel && !intelLoading && (
            <Card className={cn("p-4 border", hasAlert ? "border-orange-200 bg-orange-50/50 dark:bg-orange-950/20" : "")}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Brain className="w-4 h-4 text-muted-foreground" />
                  Revenue Intelligence
                </p>
                <button
                  onClick={() => setActiveTab("intelligence")}
                  className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
                >
                  Full profile <ExternalLink className="w-3 h-3" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center mb-3">
                <div>
                  <p className="text-xs text-muted-foreground">LTV 12mo</p>
                  <p className="font-bold text-base">${ltv12.toFixed(0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Churn risk</p>
                  <ChurnBadge label={intel.churnRiskLabel || "low"} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last visit</p>
                  <p className={cn("font-semibold text-sm", isOverdue ? "text-orange-600" : "")}>
                    {daysSinceLast !== null ? `${daysSinceLast}d ago` : "—"}
                  </p>
                </div>
              </div>
              {hasAlert && matchedCustomerId && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 w-full mt-1"
                  onClick={() => winbackMutation.mutate()}
                  disabled={winbackMutation.isPending}
                >
                  {winbackMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Send Win-back SMS
                </Button>
              )}
            </Card>
          )}

          {/* Booking History */}
          <Card className="p-4">
            <p className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              Booking History
              {bookings.length > 0 && (
                <span className="ml-auto text-xs font-normal text-muted-foreground">{bookings.length} bookings</span>
              )}
            </p>
            {bookingsLoading ? (
              <div className="flex items-center justify-center py-6">
                <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : bookings.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No bookings found</p>
            ) : (
              <div className="divide-y">
                {bookings.map((b: any) => {
                  const statusConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
                    completed:  { icon: CheckCircle2, color: "text-emerald-600", label: "Completed" },
                    cancelled:  { icon: XCircle,      color: "text-red-500",     label: "Cancelled" },
                    "no-show":  { icon: Ban,           color: "text-orange-500",  label: "No-show" },
                    no_show:    { icon: Ban,           color: "text-orange-500",  label: "No-show" },
                    scheduled:  { icon: Clock3,        color: "text-blue-500",    label: "Scheduled" },
                    confirmed:  { icon: Clock3,        color: "text-blue-500",    label: "Confirmed" },
                  };
                  const cfg = statusConfig[b.status] ?? { icon: Clock3, color: "text-muted-foreground", label: b.status };
                  const Icon = cfg.icon;
                  const paid = b.totalPaid ? `$${parseFloat(b.totalPaid).toFixed(2)}` : null;
                  return (
                    <div key={b.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <Icon className={cn("w-4 h-4 shrink-0", cfg.color)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {b.serviceName ?? "Service"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {b.date ? new Date(b.date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                          {b.staffName ? ` · ${b.staffName}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        {paid && <span className="text-sm font-semibold">{paid}</span>}
                        <span className={cn("text-[11px] font-medium", cfg.color)}>{cfg.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Cross-link to full intelligence page */}
          {matchedCustomerId && (
            <Link
              to="/intelligence"
              className="flex items-center justify-between p-4 rounded-xl border bg-card hover:bg-muted/30 transition-colors text-sm"
            >
              <span className="flex items-center gap-2 font-medium">
                <TrendingUp className="w-4 h-4 text-primary" />
                View in Revenue Intelligence dashboard
              </span>
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
            </Link>
          )}
        </div>
      )}

      {/* ── Intelligence tab ── */}
      {activeTab === "intelligence" && (
        <div className="space-y-4">
          {intelLoading ? (
            <div className="flex items-center justify-center h-40">
              <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : !intel ? (
            <Card className="p-8 text-center text-muted-foreground">
              <Brain className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">No intelligence data yet</p>
              <p className="text-xs mt-1">Run the Revenue Intelligence engines to generate insights for this client.</p>
              <Link to="/intelligence" className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline">
                Open Intelligence dashboard <ExternalLink className="w-3 h-3" />
              </Link>
            </Card>
          ) : (
            <>
              {/* Alert banner */}
              {hasAlert && (
                <div className={cn(
                  "rounded-xl border p-4 flex items-start gap-3",
                  intel.isAtRisk ? "bg-orange-50 border-orange-200 dark:bg-orange-950/30" : "bg-amber-50 border-amber-200 dark:bg-amber-950/30"
                )}>
                  <AlertTriangle className={cn("w-4 h-4 mt-0.5 shrink-0", intel.isAtRisk ? "text-orange-600" : "text-amber-600")} />
                  <div className="flex-1">
                    <p className={cn("text-sm font-semibold", intel.isAtRisk ? "text-orange-700 dark:text-orange-400" : "text-amber-700 dark:text-amber-400")}>
                      {intel.isAtRisk ? "Client at risk of churning" : "Client is drifting"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {daysSinceLast !== null
                        ? `Last visit ${daysSinceLast} days ago${cadenceDays ? ` — normally visits every ${cadenceDays} days` : ""}.`
                        : "Visit pattern suggests this client may be slipping away."}
                    </p>
                  </div>
                  {matchedCustomerId && (
                    <Button
                      size="sm" variant="outline"
                      className="flex-shrink-0 gap-1.5 h-8 text-xs"
                      onClick={() => winbackMutation.mutate()}
                      disabled={winbackMutation.isPending}
                    >
                      {winbackMutation.isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                      Win-back
                    </Button>
                  )}
                </div>
              )}

              {/* LTV cards */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "LTV (12mo)",    value: `$${ltv12.toFixed(0)}` },
                  { label: "Avg Ticket",    value: `$${avgTick.toFixed(0)}` },
                  { label: "All-time LTV",  value: `$${ltvAll.toFixed(0)}` },
                ].map(c => (
                  <Card key={c.label} className="p-4 text-center">
                    <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
                    <p className="text-xl font-bold">{c.value}</p>
                  </Card>
                ))}
              </div>

              {/* Churn risk */}
              <Card className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Churn Risk</p>
                  <ChurnBadge label={intel.churnRiskLabel || "low"} />
                </div>
                <RiskMeter score={churnScore} />
              </Card>

              {/* Visit cadence */}
              <Card className="p-5 space-y-3">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Visit Cadence
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { label: "Avg. visits every", value: cadenceDays ? `${cadenceDays} days` : "—" },
                    { label: "Days since last visit", value: daysSinceLast !== null ? `${daysSinceLast} days` : "—", warn: isOverdue },
                    { label: "Last visit", value: lastVisit ? lastVisit.toLocaleDateString() : "—" },
                    { label: "Next expected", value: nextExpected ? nextExpected.toLocaleDateString() : "—", warn: isOverdue },
                  ].map(item => (
                    <div key={item.label}>
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className={cn("font-semibold", item.warn ? "text-orange-600 dark:text-orange-400" : "")}>
                        {item.value}{item.warn ? " ⚠️" : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Behavior metrics */}
              <Card className="p-5 space-y-3">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  Behavior Metrics
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { label: "Rebooking rate",  value: `${(rebookingRate * 100).toFixed(0)}%` },
                    { label: "No-show rate",    value: `${(noShowRate * 100).toFixed(0)}%`, warn: noShowRate > 0.25 },
                    { label: "Total visits",    value: `${intel.totalVisits ?? 0}` },
                    { label: "Win-backs sent",  value: `${intel.winbackSentCount ?? 0}` },
                  ].map(item => (
                    <div key={item.label}>
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className={cn("font-semibold", item.warn ? "text-red-600 dark:text-red-400" : "")}>{item.value}</p>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Recent outreach */}
              {interventions.length > 0 && (
                <Card className="p-5">
                  <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Zap className="h-4 w-4 text-muted-foreground" />
                    Recent Outreach
                  </p>
                  <div className="space-y-2">
                    {interventions.map((iv: any) => (
                      <div key={iv.id} className="flex items-center justify-between text-sm">
                        <div>
                          <span className="font-medium capitalize">{iv.type?.replace(/_/g, " ")}</span>
                          <span className="text-xs text-muted-foreground ml-2">via {iv.channel}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {iv.sentAt ? new Date(iv.sentAt).toLocaleDateString() : ""}
                          </span>
                          <Badge variant="secondary" className="text-[10px] capitalize">{iv.triggeredBy}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Manual win-back */}
              {!hasAlert && matchedCustomerId && (
                <Button
                  variant="outline" size="sm" className="gap-2"
                  onClick={() => winbackMutation.mutate()}
                  disabled={winbackMutation.isPending}
                >
                  {winbackMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Send Manual Win-back SMS
                </Button>
              )}

              {/* Cross-link */}
              <Link
                to="/intelligence"
                className="flex items-center justify-between p-4 rounded-xl border bg-card hover:bg-muted/30 transition-colors text-sm"
              >
                <span className="flex items-center gap-2 font-medium">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  View all clients in Revenue Intelligence
                </span>
                <ExternalLink className="w-4 h-4 text-muted-foreground" />
              </Link>

              <p className="text-xs text-muted-foreground">
                Last computed: {intel.computedAt ? new Date(intel.computedAt).toLocaleString() : "Never"}
              </p>
            </>
          )}
        </div>
      )}

      {/* ── Sticky mobile action bar ── */}
      {client && (
        <div
          className="md:hidden fixed inset-x-0 z-40 bg-background/95 backdrop-blur-sm border-t border-border px-4 py-3 flex gap-2"
          style={{ bottom: "calc(60px + env(safe-area-inset-bottom, 0px))" }}
        >
          <Button
            className="flex-1 h-11"
            onClick={() => navigate(`/booking/new?clientId=${client.id}`)}
          >
            <Calendar className="h-4 w-4 mr-1.5" />
            Book
          </Button>
          {client.phone && (
            <Button variant="outline" className="flex-1 h-11" asChild>
              <a href={`sms:${client.phone}`}>
                <Send className="h-4 w-4 mr-1.5" />
                SMS
              </a>
            </Button>
          )}
          {client.phone && (
            <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" asChild>
              <a href={`tel:${client.phone}`} aria-label="Call client">
                <Phone className="h-4 w-4" />
              </a>
            </Button>
          )}
        </div>
      )}
    </AppLayout>
  );
}
