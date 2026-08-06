import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSelectedStore } from "@/hooks/use-store";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  AlertTriangle, Users, DollarSign, ChevronLeft, Calendar,
  ArrowRight, MessageSquare, TrendingDown,
} from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";

type AtRiskClient = {
  id: number;
  fullName: string;
  totalSpentCents: number;
  totalSpent: string;
  totalVisits: number;
  lastVisitAt: string | null;
  daysSinceLast: number | null;
};

const FILTER_OPTIONS = [
  { label: "30+ days", value: 30 },
  { label: "60+ days", value: 60 },
  { label: "90+ days", value: 90 },
  { label: "120+ days", value: 120 },
];

function riskBadge(days: number | null) {
  if (days === null || days >= 120) return { label: "Lapsed", color: "bg-red-100 text-red-700" };
  if (days >= 90) return { label: "High Risk", color: "bg-orange-100 text-orange-700" };
  if (days >= 60) return { label: "At Risk", color: "bg-amber-100 text-amber-700" };
  return { label: "Drifting", color: "bg-yellow-100 text-yellow-700" };
}

export default function ClientAtRisk() {
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [daysSince, setDaysSince] = useState(60);
  const [smsSending, setSmsSending] = useState<number | null>(null);

  const { data: clients = [], isLoading } = useQuery<AtRiskClient[]>({
    queryKey: ["/api/clients/at-risk", selectedStore?.id, daysSince],
    queryFn: async () => {
      const res = await fetch(`/api/clients/at-risk?daysSince=${daysSince}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const totalLostRevenue = clients.reduce((sum, c) => sum + (c.totalSpentCents / 100), 0);
  const avgSpend = clients.length > 0 ? totalLostRevenue / clients.length : 0;

  const sendWinBack = async (client: AtRiskClient) => {
    setSmsSending(client.id);
    try {
      const message = `Hi ${client.fullName.split(" ")[0]}, we miss you! It's been a while since your last visit. Book your next appointment: ${window.location.origin}/book`;
      await apiRequest("POST", "/api/sms/send", {
        clientId: client.id,
        message,
        storeId: selectedStore?.id,
      });
      toast({ title: `Win-back message sent to ${client.fullName}` });
    } catch {
      toast({ title: "SMS not available — check SMS settings", variant: "destructive" });
    } finally {
      setSmsSending(null);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6 max-w-4xl">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link to="/customers" className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-orange-500" />
              At-Risk Clients
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Clients who haven't visited in a while — reach out before they churn.
            </p>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {FILTER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setDaysSince(opt.value)}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                daysSince === opt.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:border-primary/40"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Summary cards */}
        {!isLoading && clients.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="h-4 w-4 text-orange-500" />
                  <span className="text-sm text-muted-foreground">At-Risk Clients</span>
                </div>
                <div className="text-2xl font-bold">{clients.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-4 w-4 text-red-500" />
                  <span className="text-sm text-muted-foreground">Revenue at Stake</span>
                </div>
                <div className="text-2xl font-bold">${totalLostRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="h-4 w-4 text-blue-500" />
                  <span className="text-sm text-muted-foreground">Avg Lifetime Spend</span>
                </div>
                <div className="text-2xl font-bold">${avgSpend.toFixed(0)}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Win-back tip banner */}
        {!isLoading && clients.length > 0 && (
          <div className="rounded-xl bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 px-5 py-4 flex items-center gap-4">
            <AlertTriangle className="h-5 w-5 text-violet-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-violet-900">
                Win-back campaigns can recover 15–30% of lapsed clients.
              </p>
              <p className="text-xs text-violet-600 mt-0.5">
                Use the SMS button to send a personal win-back message, or go to Campaigns to send a bulk SMS.
              </p>
            </div>
            <Link
              to="/campaigns"
              className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors shrink-0"
            >
              Campaigns
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}

        {/* Client list */}
        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading…</div>
        ) : clients.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Users className="h-12 w-12 text-emerald-400 mx-auto mb-4" />
              <p className="font-semibold text-foreground">No at-risk clients</p>
              <p className="text-sm text-muted-foreground mt-1">
                All your clients have visited within the last {daysSince} days. Great retention!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {clients.map(client => {
              const badge = riskBadge(client.daysSinceLast);
              return (
                <Card key={client.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-100 to-red-100 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-orange-700">
                          {client.fullName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                        </span>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground truncate">{client.fullName}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.color}`}>
                            {badge.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {client.lastVisitAt
                              ? `Last visit: ${format(new Date(client.lastVisitAt), "MMM d, yyyy")}`
                              : "Never visited"}
                          </span>
                          {client.daysSinceLast !== null && (
                            <span className="font-medium text-orange-600">
                              {client.daysSinceLast} days ago
                            </span>
                          )}
                          <span>{client.totalVisits} visit{client.totalVisits !== 1 ? "s" : ""}</span>
                          <span className="flex items-center gap-0.5">
                            <DollarSign className="h-3 w-3" />
                            {parseFloat(client.totalSpent).toFixed(0)} lifetime
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => sendWinBack(client)}
                          disabled={smsSending === client.id}
                          className="flex items-center gap-1.5 text-xs"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          {smsSending === client.id ? "Sending…" : "Win-back SMS"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => navigate(`/clients/${client.id}`)}
                          className="text-xs"
                        >
                          View
                          <ArrowRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
