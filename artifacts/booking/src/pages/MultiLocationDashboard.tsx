import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelectedStore } from "@/hooks/use-store";
import {
  Building2, TrendingUp, Users, Calendar, DollarSign, BarChart3,
  Plus, X, Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UpgradeBlockModal, type UpgradeBlockPayload } from "@/components/UpgradeBlockModal";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

type UsageMetric = { id: string; used: number; limit: number | null; remaining: number | null; enabled: boolean };
type SubscriptionUsage = { planCode: string; metrics: UsageMetric[] };

type LocationSummary = {
  id: number;
  name: string;
  city?: string;
  state?: string;
  revenue: number;
  bookings: number;
  clients: number;
  fillRate: number;
};

export default function MultiLocationDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedStore } = useSelectedStore();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addName, setAddName] = useState("");
  const [addAddress, setAddAddress] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [upgradeModal, setUpgradeModal] = useState<UpgradeBlockPayload | null>(null);

  const { data: subscriptionUsage } = useQuery<SubscriptionUsage>({
    queryKey: ["/api/subscription/usage"],
    queryFn: async () => {
      const res = await fetch("/api/subscription/usage", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch usage");
      return res.json();
    },
    staleTime: 60_000,
  });

  const locationMetric = subscriptionUsage?.metrics.find((m) => m.id === "locations");
  const planLocationLimit = locationMetric?.limit ?? null;

  const { data: stores = [], isLoading: storesLoading } = useQuery<any[]>({
    queryKey: ["/api/stores"],
    queryFn: async () => {
      const res = await fetch("/api/stores");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: summaries = [], isLoading: summaryLoading } = useQuery<LocationSummary[]>({
    queryKey: ["/api/multi-location/summary"],
    queryFn: async () => {
      const res = await fetch("/api/multi-location/summary");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: stores.length > 0,
  });

  const isLoading = storesLoading || summaryLoading;

  const totalRevenue = summaries.reduce((s, l) => s + l.revenue, 0);
  const totalBookings = summaries.reduce((s, l) => s + l.bookings, 0);
  const totalClients = summaries.reduce((s, l) => s + l.clients, 0);
  const avgFillRate = summaries.length > 0
    ? summaries.reduce((s, l) => s + l.fillRate, 0) / summaries.length
    : 0;

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim()) return;

    setAddSubmitting(true);
    try {
      const res = await fetch(api.stores.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: addName.trim(),
          address: addAddress.trim() || undefined,
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (body.upgradeRequired) {
          setShowAddDialog(false);
          setUpgradeModal({ message: body.message ?? "Upgrade your plan to add more locations.", code: body.code });
        } else {
          toast({ variant: "destructive", title: "Failed to add location", description: body.message ?? "Unknown error" });
        }
        return;
      }

      toast({ title: "Location added", description: `${addName} is ready.` });
      setAddName("");
      setAddAddress("");
      setShowAddDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/multi-location/summary"] });
    } catch {
      toast({ variant: "destructive", title: "Failed to add location", description: "Network error. Please try again." });
    } finally {
      setAddSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <UpgradeBlockModal payload={upgradeModal} onClose={() => setUpgradeModal(null)} />

      {/* Add Location Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-7 flex flex-col gap-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Add New Location</h2>
                <p className="text-sm text-gray-500 mt-0.5">Create a new salon location under your account</p>
                {planLocationLimit !== null && (
                  <p className="text-xs text-muted-foreground mt-1">
                    <span className={stores.length >= planLocationLimit ? "text-red-500 font-semibold" : "text-primary font-medium"}>
                      {stores.length} of {planLocationLimit}
                    </span>
                    {" "}location{planLocationLimit === 1 ? "" : "s"} used on your plan
                  </p>
                )}
              </div>
              <button onClick={() => setShowAddDialog(false)} className="text-gray-400 hover:text-gray-600 mt-0.5">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddLocation} className="flex flex-col gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="loc-name">Location Name <span className="text-red-500">*</span></Label>
                <Input
                  id="loc-name"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g. Downtown Salon"
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loc-address">Address <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Input
                  id="loc-address"
                  value={addAddress}
                  onChange={(e) => setAddAddress(e.target.value)}
                  placeholder="123 Main St, City, State"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowAddDialog(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={addSubmitting || !addName.trim()}
                  className="flex-1 bg-primary hover:bg-primary/90 text-white"
                >
                  {addSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                  Add Location
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mb-8">
        <div className="flex items-center gap-3">
          <Building2 className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Multi-Location Dashboard</h1>
            {stores.length > 1 && (
              <p className="text-muted-foreground text-sm">
                {stores.length} locations · {format(new Date(), "MMMM yyyy")}
              </p>
            )}
          </div>
        </div>
        <Button
          onClick={() => setShowAddDialog(true)}
          className="flex items-center gap-2"
          size="sm"
        >
          <Plus className="w-4 h-4" />
          Add Location
        </Button>
      </div>

      {stores.length <= 1 ? (
        <div className="text-center py-20 border-2 border-dashed rounded-xl">
          <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg mb-1">Only one location found</h3>
          <p className="text-muted-foreground text-sm mb-4">Add more locations to use the multi-location dashboard.</p>
          <Button onClick={() => setShowAddDialog(true)} size="sm" variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            Add Location
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Total Revenue", value: `$${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 0 })}`, icon: DollarSign, color: "text-green-600 bg-green-50" },
              { label: "Total Bookings", value: totalBookings.toLocaleString(), icon: Calendar, color: "text-blue-600 bg-blue-50" },
              { label: "Total Clients", value: totalClients.toLocaleString(), icon: Users, color: "text-purple-600 bg-purple-50" },
              { label: "Avg Fill Rate", value: `${Math.round(avgFillRate)}%`, icon: TrendingUp, color: "text-amber-600 bg-amber-50" },
            ].map((stat) => (
              <div key={stat.label} className="border rounded-xl p-4 bg-card">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${stat.color}`}>
                  <stat.icon className="w-5 h-5" />
                </div>
                <div className="text-2xl font-bold mb-1">{isLoading ? "–" : stat.value}</div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>

          <div className="border rounded-xl overflow-hidden bg-card">
            <div className="px-6 py-4 border-b flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Per-Location Breakdown</h2>
            </div>
            <div className="divide-y">
              {isLoading ? (
                <div className="text-center py-10 text-muted-foreground text-sm">Loading…</div>
              ) : summaries.length === 0 ? (
                stores.map((store) => (
                  <div key={store.id} className="px-6 py-4 flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{store.name}</div>
                      <div className="text-xs text-muted-foreground">{store.city || store.address || "No address"}</div>
                    </div>
                    <div className="grid grid-cols-4 gap-8 text-right">
                      <div>
                        <div className="text-sm font-semibold">$0</div>
                        <div className="text-xs text-muted-foreground">Revenue</div>
                      </div>
                      <div>
                        <div className="text-sm font-semibold">0</div>
                        <div className="text-xs text-muted-foreground">Bookings</div>
                      </div>
                      <div>
                        <div className="text-sm font-semibold">0</div>
                        <div className="text-xs text-muted-foreground">Clients</div>
                      </div>
                      <div>
                        <div className="text-sm font-semibold">—</div>
                        <div className="text-xs text-muted-foreground">Fill Rate</div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                summaries.map((loc) => (
                  <div key={loc.id} className="px-6 py-4 flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{loc.name}</div>
                      <div className="text-xs text-muted-foreground">{loc.city || "—"}{loc.state ? `, ${loc.state}` : ""}</div>
                    </div>
                    <div className="grid grid-cols-4 gap-8 text-right">
                      <div>
                        <div className="text-sm font-semibold">${loc.revenue.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">Revenue</div>
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{loc.bookings.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">Bookings</div>
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{loc.clients.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">Clients</div>
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{loc.fillRate}%</div>
                        <div className="text-xs text-muted-foreground">Fill Rate</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
