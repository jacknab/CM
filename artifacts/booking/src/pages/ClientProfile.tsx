
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSelectedStore } from "@/hooks/use-store";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { formatInTz } from "@/lib/timezone";
import { ArrowLeft, Phone, Mail, ChevronRight, Calendar, Clock, FileText, CreditCard, ShoppingBag, X, Star, Copy, AlertTriangle, Brain, TrendingUp, Zap, Send, RefreshCw, Camera, ImageIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Customer, AppointmentWithDetails, Review } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type ProfileSection = "overview" | "next" | "past" | "deposits" | "notes" | "purchases" | "reviews" | "intelligence";

function ChurnBadge({ label }: { label: string }) {
  const styles: Record<string, string> = {
    low: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
    medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
    high: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400",
    critical: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  };
  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize", styles[label] || styles.low)}>
      {label}
    </span>
  );
}

function RiskMeter({ score }: { score: number }) {
  const color =
    score >= 75 ? "#ef4444" :
    score >= 50 ? "#f97316" :
    score >= 25 ? "#f59e0b" :
    "#10b981";
  return (
    <div className="space-y-1">
      <div className="w-full bg-muted rounded-full h-2">
        <div
          className="h-2 rounded-full transition-all duration-500"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <p className="text-xs text-muted-foreground text-right">{score}/100</p>
    </div>
  );
}

export default function ClientProfile() {
  const navigate = useNavigate();
  const params = useParams();
  const clientId = Number(params.id);
  const { selectedStore } = useSelectedStore();
  const timezone = selectedStore?.timezone || "UTC";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeSection, setActiveSection] = useState<ProfileSection>("overview");
  const [photoUploading, setPhotoUploading] = useState(false);

  const { data: client, isLoading: clientLoading } = useQuery<Customer>({
    queryKey: ["/api/customers", clientId],
    enabled: !!clientId,
  });

  const storeId = selectedStore?.id;

  const { data: allAppointments } = useQuery<AppointmentWithDetails[]>({
    queryKey: [`/api/appointments?customerId=${clientId}&storeId=${storeId}`, clientId, storeId],
    enabled: !!clientId && !!storeId,
  });

  const { data: clientReviews = [] } = useQuery<Review[]>({
    queryKey: ["/api/reviews", storeId, "client", clientId],
    queryFn: async () => {
      const res = await fetch(`/api/reviews?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) return [];
      const all: Review[] = await res.json();
      return all.filter(r => r.customerId === clientId);
    },
    enabled: !!storeId && !!clientId,
  });

  const { data: intelligenceData, isLoading: intelLoading } = useQuery<any>({
    queryKey: ["/api/intelligence/client", clientId, storeId],
    queryFn: async () => {
      const res = await fetch(`/api/intelligence/client/${clientId}?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!clientId && !!storeId,
    staleTime: 5 * 60 * 1000,
  });

  const winbackMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/intelligence/winback", { storeId, customerId: clientId });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Win-back SMS sent!", description: "The client will receive a message shortly." });
        queryClient.invalidateQueries({ queryKey: ["/api/intelligence/client", clientId, storeId] });
      } else {
        toast({ title: "Couldn't send SMS", description: data.error || "Unknown error", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send win-back SMS", variant: "destructive" });
    },
  });

  const now = new Date();

  const pastAppointments = useMemo(() => {
    if (!allAppointments) return [];
    return allAppointments
      .filter(a => new Date(a.date) < now)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allAppointments, now]);

  const nextAppointments = useMemo(() => {
    if (!allAppointments) return [];
    return allAppointments
      .filter(a => new Date(a.date) >= now && a.status !== "cancelled")
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [allAppointments, now]);

  const totalSpend = useMemo(() => {
    if (!allAppointments) return 0;
    return allAppointments
      .filter(a => a.status === "completed" || a.status === "pending" || a.status === "confirmed")
      .reduce((sum, a) => {
        const svcPrice = a.service ? Number(a.service.price) : 0;
        const addonPrice = a.appointmentAddons
          ? a.appointmentAddons.reduce((s, aa) => s + (aa.addon ? Number(aa.addon.price) : 0), 0)
          : 0;
        return sum + svcPrice + addonPrice;
      }, 0);
  }, [allAppointments]);

  const noShows = useMemo(() => {
    if (!allAppointments) return 0;
    // Appointments are stored with status "no_show"; older/edge data may use "no-show".
    return allAppointments.filter(a => a.status === "no_show" || a.status === "no-show").length;
  }, [allAppointments]);

  const cancellations = useMemo(() => {
    if (!allAppointments) return 0;
    return allAppointments.filter(a => a.status === "cancelled").length;
  }, [allAppointments]);

  const intel = intelligenceData?.intel;
  const interventions = intelligenceData?.interventions || [];

  const sections: { id: ProfileSection; label: string; count?: number; icon: typeof Calendar; dot?: boolean }[] = [
    { id: "overview", label: "Overview", icon: FileText },
    { id: "next", label: "Next Appointments", count: nextAppointments.length, icon: Calendar },
    { id: "past", label: "Past Appointments", count: pastAppointments.length, icon: Clock },
    { id: "deposits", label: "Deposits", icon: CreditCard },
    { id: "notes", label: "Notes", count: client?.notes ? 1 : 0, icon: FileText },
    { id: "purchases", label: "Purchases", count: 0, icon: ShoppingBag },
    { id: "reviews", label: "Reviews", count: clientReviews.length, icon: Star },
    { id: "intelligence", label: "Revenue Intelligence", icon: Brain, dot: intel?.isAtRisk || intel?.isDrifting },
  ];

  const initials = client?.name
    ? client.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  const renderAppointmentCard = (apt: AppointmentWithDetails) => {
    const dateLabel = formatInTz(apt.date, timezone, "dd MMM, yyyy, h:mm a");
    const statusColors: Record<string, string> = {
      completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      no_show: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
      "no-show": "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
      started: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    };
    const statusLabel = (apt.status || "pending").replace(/_/g, " ");

    const svcPrice = apt.service ? Number(apt.service.price) : 0;
    const addonTotal = apt.appointmentAddons
      ? apt.appointmentAddons.reduce((s, aa) => s + (aa.addon ? Number(aa.addon.price) : 0), 0)
      : 0;
    const aptTotal = svcPrice + addonTotal;

    return (
      <Card key={apt.id} className="p-4 space-y-3" data-testid={`appointment-card-${apt.id}`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground" data-testid={`appointment-date-${apt.id}`}>
            {dateLabel}
          </span>
          <Badge
            variant="secondary"
            className={cn("no-default-active-elevate text-xs capitalize", statusColors[apt.status || "pending"])}
            data-testid={`appointment-status-${apt.id}`}>
            {statusLabel}
          </Badge>
        </div>
        <div>
          <h4 className="font-semibold text-base">{apt.service?.name || "Service"}</h4>
          <p className="text-sm text-muted-foreground">
            {apt.service?.name || "Service"}
          </p>
          <p className="text-sm text-muted-foreground">
            {apt.staff?.name || "Staff"} | $ {aptTotal.toFixed(2)} | {apt.duration} mins
          </p>
        </div>
        {apt.appointmentAddons && apt.appointmentAddons.length > 0 && (
          <div className="pl-3 border-l-2 border-muted space-y-1">
            {apt.appointmentAddons.map(aa => (
              <p key={aa.id} className="text-xs text-muted-foreground">
                + {aa.addon?.name} (${aa.addon ? Number(aa.addon.price).toFixed(2) : "0.00"})
              </p>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-sm font-medium">Total:</span>
          <span className="font-bold" data-testid={`appointment-total-${apt.id}`}>$ {aptTotal.toFixed(2)}</span>
        </div>
      </Card>
    );
  };

  const renderIntelligenceSection = () => {
    if (intelLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }

    if (!intel) {
      return (
        <div className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Brain className="h-5 w-5 text-violet-500" />
            Revenue Intelligence
          </h2>
          <Card className="p-6 text-center">
            <p className="text-muted-foreground text-sm mb-2">No intelligence data yet for this client.</p>
            <p className="text-xs text-muted-foreground">Data is computed automatically every 6 hours. Make sure the client has at least one completed appointment.</p>
          </Card>
        </div>
      );
    }

    const cadenceDays = intel.avgVisitCadenceDays ? Math.round(parseFloat(intel.avgVisitCadenceDays)) : null;
    const lastVisit = intel.lastVisitDate ? new Date(intel.lastVisitDate) : null;
    const nextExpected = intel.nextExpectedVisitDate ? new Date(intel.nextExpectedVisitDate) : null;
    const ltv12 = parseFloat(intel.ltv12Month || "0");
    const ltvAll = parseFloat(intel.ltvAllTime || "0");
    const avgTicket = parseFloat(intel.avgTicketValue || "0");
    const churnScore = intel.churnRiskScore || 0;
    const noShowRate = parseFloat(intel.noShowRate || "0");
    const rebookingRate = parseFloat(intel.rebookingRate || "0");

    const daysSinceLast = intel.daysSinceLastVisit;
    const isOverdue = daysSinceLast !== null && nextExpected && new Date() > nextExpected;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Brain className="h-5 w-5 text-violet-500" />
            Revenue Intelligence
          </h2>
          {(intel.isDrifting || intel.isAtRisk) && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              {intel.isAtRisk ? "At Risk" : "Drifting"}
            </div>
          )}
        </div>

        {/* Alert banner */}
        {(intel.isDrifting || intel.isAtRisk) && (
          <div className={cn(
            "rounded-xl px-4 py-3 flex items-start gap-3",
            intel.isAtRisk
              ? "bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800"
              : "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"
          )}>
            <AlertTriangle className={cn("h-4 w-4 mt-0.5 flex-shrink-0", intel.isAtRisk ? "text-orange-500" : "text-amber-500")} />
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
            <Button
              size="sm"
              variant="outline"
              className="flex-shrink-0 gap-1.5 h-8 text-xs"
              onClick={() => winbackMutation.mutate()}
              disabled={winbackMutation.isPending}
            >
              {winbackMutation.isPending ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
              Send Win-back
            </Button>
          </div>
        )}

        {/* KPI Row */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">LTV (12mo)</p>
            <p className="text-xl font-bold text-foreground">${ltv12.toFixed(0)}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Avg Ticket</p>
            <p className="text-xl font-bold text-foreground">${avgTicket.toFixed(0)}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">All-time LTV</p>
            <p className="text-xl font-bold text-foreground">${ltvAll.toFixed(0)}</p>
          </Card>
        </div>

        {/* Churn Risk */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Churn Risk</p>
            <ChurnBadge label={intel.churnRiskLabel || "low"} />
          </div>
          <RiskMeter score={churnScore} />
        </Card>

        {/* Visit Cadence */}
        <Card className="p-5 space-y-3">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            Visit Cadence
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Avg. visits every</p>
              <p className="font-semibold">{cadenceDays ? `${cadenceDays} days` : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Days since last visit</p>
              <p className={cn("font-semibold", isOverdue ? "text-orange-600 dark:text-orange-400" : "text-foreground")}>
                {daysSinceLast !== null ? `${daysSinceLast} days` : "—"}
                {isOverdue && " ⚠️"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last visit</p>
              <p className="font-semibold">{lastVisit ? lastVisit.toLocaleDateString() : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Next expected</p>
              <p className={cn("font-semibold", isOverdue ? "text-orange-600 dark:text-orange-400" : "text-foreground")}>
                {nextExpected ? nextExpected.toLocaleDateString() : "—"}
              </p>
            </div>
          </div>
        </Card>

        {/* Behavior Metrics */}
        <Card className="p-5 space-y-3">
          <p className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Behavior Metrics
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Rebooking rate</p>
              <p className="font-semibold">{(rebookingRate * 100).toFixed(0)}%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">No-show rate</p>
              <p className={cn("font-semibold", noShowRate > 0.25 ? "text-red-600 dark:text-red-400" : "text-foreground")}>
                {(noShowRate * 100).toFixed(0)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total visits</p>
              <p className="font-semibold">{intel.totalVisits || 0}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Win-backs sent</p>
              <p className="font-semibold">{intel.winbackSentCount || 0}</p>
            </div>
          </div>
        </Card>

        {/* Recent Interventions */}
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
                    <span className="font-medium capitalize">{iv.type.replace(/_/g, " ")}</span>
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

        {/* Manual Win-back */}
        {!intel.isDrifting && !intel.isAtRisk && (
          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => winbackMutation.mutate()}
              disabled={winbackMutation.isPending}
            >
              {winbackMutation.isPending ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Send Manual Win-back SMS
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Last computed: {intel.computedAt ? new Date(intel.computedAt).toLocaleString() : "Never"}
        </p>
      </div>
    );
  };

  const renderContent = () => {
    switch (activeSection) {
      case "overview":
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-bold">Overview</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-sm text-muted-foreground">Total Spend:</span>
                <span className="font-semibold" data-testid="stat-total-spend">$ {totalSpend.toFixed(2)}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm text-muted-foreground">Deposit:</span>
                <span className="font-semibold" data-testid="stat-deposit">$ 0.00</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm text-muted-foreground">No-Shows:</span>
                <span className="font-semibold" data-testid="stat-no-shows">{noShows}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-sm text-muted-foreground">Cancellations:</span>
                <span className="font-semibold" data-testid="stat-cancellations">{cancellations}</span>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Recent Appointments</h3>
              {allAppointments && allAppointments.length > 0 ? (
                <div className="space-y-3">
                  {allAppointments
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .slice(0, 5)
                    .map(renderAppointmentCard)}
                  {allAppointments.length > 5 && (
                    <button
                      className="text-sm text-muted-foreground font-medium hover-elevate px-2 py-1 rounded"
                      onClick={() => setActiveSection("past")}
                      data-testid="button-view-more"
                    >
                      VIEW MORE
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No appointments yet</p>
              )}
            </div>
          </div>
        );

      case "next":
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Next Appointments</h2>
            {nextAppointments.length > 0 ? (
              <div className="space-y-3">
                {nextAppointments.map(renderAppointmentCard)}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No upcoming appointments</p>
            )}
          </div>
        );

      case "past":
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Past Appointments</h2>
            {pastAppointments.length > 0 ? (
              <div className="space-y-3">
                {pastAppointments.map(renderAppointmentCard)}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No past appointments</p>
            )}
          </div>
        );

      case "deposits":
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Deposits</h2>
            <p className="text-sm text-muted-foreground">No deposits recorded</p>
          </div>
        );

      case "notes":
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Notes</h2>
            {client?.notes ? (
              <Card className="p-4">
                <p className="text-sm" data-testid="client-notes">{client.notes}</p>
              </Card>
            ) : (
              <p className="text-sm text-muted-foreground">No notes</p>
            )}
          </div>
        );

      case "purchases":
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Purchases</h2>
            <p className="text-sm text-muted-foreground">No purchases recorded</p>
          </div>
        );

      case "reviews":
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Reviews</h2>
            {clientReviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reviews from this client yet</p>
            ) : (
              <div className="space-y-3">
                {clientReviews.map((review) => (
                  <Card key={review.id} className="p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={cn(
                              "h-4 w-4",
                              s <= review.rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"
                            )}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {review.createdAt ? new Date(review.createdAt).toLocaleDateString() : ""}
                      </span>
                    </div>
                    {review.comment && (
                      <p className="text-sm">&ldquo;{review.comment}&rdquo;</p>
                    )}
                    {(review.serviceName || review.staffName) && (
                      <p className="text-xs text-muted-foreground">
                        {review.serviceName}{review.staffName ? ` · with ${review.staffName}` : ""}
                      </p>
                    )}
                    {review.appointmentId && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 h-7 text-xs"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/review/${review.appointmentId}`);
                        }}
                      >
                        <Copy className="h-3 w-3" />
                        Copy Review Link
                      </Button>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        );

      case "intelligence":
        return renderIntelligenceSection();

      default:
        return null;
    }
  };

  if (clientLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background gap-4">
        <p className="text-muted-foreground">Client not found</p>
        <Button variant="outline" onClick={() => navigate("/customers")}>Back to Clients</Button>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex bg-background">
      <div className="w-[320px] flex-shrink-0 border-r bg-card flex flex-col">
        <div className="p-4 border-b flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/customers")} data-testid="button-back-clients">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className="font-semibold text-lg">Clients</span>
        </div>

        <div className="p-6 flex flex-col items-center text-center border-b">
          <div className="relative group mb-3">
            <Avatar className="w-16 h-16">
              {(client as any).avatarUrl && <AvatarImage src={(client as any).avatarUrl} alt={client.name} />}
              <AvatarFallback className="text-xl font-bold bg-primary/10 text-primary" data-testid="client-avatar">
                {initials}
              </AvatarFallback>
            </Avatar>
            <label
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              title="Upload photo"
            >
              {photoUploading ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Camera className="w-5 h-5 text-white" />}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 2 * 1024 * 1024) {
                    toast({ title: "Photo too large", description: "Please choose an image under 2MB", variant: "destructive" });
                    return;
                  }
                  setPhotoUploading(true);
                  const reader = new window.FileReader();
                  reader.onload = async (ev) => {
                    const dataUrl = ev.target?.result as string;
                    try {
                      const res = await fetch(`/api/customers/${clientId}/photo`, {
                        method: "POST",
                        credentials: "include",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ photoDataUrl: dataUrl }),
                      });
                      if (res.ok) {
                        queryClient.invalidateQueries({ queryKey: ["/api/customers", clientId] });
                        toast({ title: "Photo updated!" });
                      } else {
                        toast({ title: "Upload failed", variant: "destructive" });
                      }
                    } catch {
                      toast({ title: "Upload failed", variant: "destructive" });
                    } finally {
                      setPhotoUploading(false);
                    }
                  };
                  reader.readAsDataURL(file);
                }}
              />
            </label>
          </div>
          <h2 className="text-lg font-bold" data-testid="client-name">{client.name}</h2>
          {client.phone && (
            <div className="flex items-center gap-1.5 mt-2 text-sm text-muted-foreground">
              <Phone className="w-3.5 h-3.5" />
              <span data-testid="client-phone">{client.phone}</span>
            </div>
          )}
          {client.email && (
            <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
              <Mail className="w-3.5 h-3.5" />
              <span className="truncate max-w-[200px]" data-testid="client-email">{client.email}</span>
            </div>
          )}
          {(client as any).allergies && (
            <div className="mt-3 w-full flex items-start gap-1.5 rounded-md border border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800 px-3 py-2 text-xs font-medium text-orange-700 dark:text-orange-400 text-left" data-testid="allergy-alert-banner">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span><span className="font-bold">Allergy alert:</span> {(client as any).allergies}</span>
            </div>
          )}
          <div className="flex items-center gap-2 mt-4">
            <Button
              className="bg-primary text-primary-foreground"
              size="sm"
              onClick={() => navigate("/booking/new")}
              data-testid="button-book-now"
            >
              Book Now
            </Button>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={cn(
                "w-full flex items-center justify-between gap-2 px-5 py-3.5 text-sm font-medium transition-colors",
                activeSection === section.id
                  ? "text-primary bg-primary/5"
                  : "text-muted-foreground"
              )}
              data-testid={`section-${section.id}`}
            >
              <div className="flex items-center gap-2">
                <span>{section.label}</span>
                {section.dot && (
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {section.count !== undefined && (
                  <Badge variant="secondary" className="no-default-active-elevate text-xs min-w-[24px] justify-center">
                    {section.count}
                  </Badge>
                )}
                <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
              </div>
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {renderContent()}
      </div>
    </div>
  );
}
