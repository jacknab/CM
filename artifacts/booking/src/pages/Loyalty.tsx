import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useSelectedStore } from "@/hooks/use-store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Star, Award, TrendingUp, Plus, ArrowUp, ArrowDown, Gift } from "lucide-react";
import { format } from "date-fns";

type Customer = {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  loyaltyPoints: number;
};

type LoyaltyTransaction = {
  id: number;
  customerId: number;
  type: string;
  points: number;
  description?: string;
  createdAt: string;
  customer?: { name: string };
};

export default function Loyalty() {
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAdjust, setShowAdjust] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [adjustPoints, setAdjustPoints] = useState("");
  const [adjustType, setAdjustType] = useState<"earn" | "redeem" | "bonus">("bonus");
  const [adjustNote, setAdjustNote] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    enabled: !!selectedStore,
  });

  const { data: transactions = [] } = useQuery<LoyaltyTransaction[]>({
    queryKey: ["/api/loyalty/transactions"],
    enabled: !!selectedStore,
  });

  const adjustMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/loyalty/adjust", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty/transactions"] });
      setShowAdjust(false);
      setAdjustPoints("");
      setAdjustNote("");
      setSelectedCustomer(null);
      toast({ title: "Points adjusted successfully" });
    },
  });

  const handleAdjust = (): void => {
    const pts = parseInt(adjustPoints);
    if (!selectedCustomer || isNaN(pts) || pts <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    adjustMutation.mutate({
      customerId: selectedCustomer.id,
      storeId: selectedStore?.id,
      type: adjustType,
      points: adjustType === "redeem" ? -pts : pts,
      description: adjustNote || `Manual ${adjustType} adjustment`,
    });
  };

  const openAdjust = (customer: Customer) => {
    setSelectedCustomer(customer);
    setShowAdjust(true);
  };

  // ── Program settings: earning rate ──────────────────────────────────────
  const { data: config } = useQuery<{ enabled: boolean; pointsPerDollar: number }>({
    queryKey: ["/api/loyalty/config"],
    enabled: !!selectedStore,
  });
  const [rateDraft, setRateDraft] = useState<string>("");
  const effectiveRate = rateDraft !== "" ? rateDraft : String(config?.pointsPerDollar ?? 1);
  const saveConfig = useMutation({
    mutationFn: (data: { enabled: boolean; pointsPerDollar: number }) =>
      apiRequest("PUT", "/api/loyalty/config", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty/config"] });
      setRateDraft("");
      toast({ title: "Earning rate saved" });
    },
    onError: (e: any) => toast({ title: e?.message || "Could not save", variant: "destructive" }),
  });

  // ── Rewards catalogue ──────────────────────────────────────────────────
  type Reward = { id: number; name: string; pointsCost: number; dollarValue: number; isActive: boolean; sortOrder: number };
  const { data: rewards = [] } = useQuery<Reward[]>({
    queryKey: ["/api/loyalty/rewards"],
    enabled: !!selectedStore,
  });
  const [newReward, setNewReward] = useState({ name: "", pointsCost: "", dollarValue: "" });
  const invalidateRewards = () => queryClient.invalidateQueries({ queryKey: ["/api/loyalty/rewards"] });
  const createReward = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/loyalty/rewards", data),
    onSuccess: () => { invalidateRewards(); setNewReward({ name: "", pointsCost: "", dollarValue: "" }); toast({ title: "Reward added" }); },
    onError: (e: any) => toast({ title: e?.message || "Could not add reward", variant: "destructive" }),
  });
  const updateReward = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/loyalty/rewards/${id}`, data),
    onSuccess: invalidateRewards,
    onError: (e: any) => toast({ title: e?.message || "Could not update", variant: "destructive" }),
  });
  const deleteReward = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/loyalty/rewards/${id}`),
    onSuccess: () => { invalidateRewards(); toast({ title: "Reward removed" }); },
  });
  const handleAddReward = () => {
    const pc = parseInt(newReward.pointsCost, 10);
    const dv = parseFloat(newReward.dollarValue);
    if (!newReward.name.trim() || !(pc > 0) || !(dv > 0)) {
      toast({ title: "Fill in name, points, and $ value", variant: "destructive" });
      return;
    }
    createReward.mutate({ name: newReward.name.trim(), pointsCost: pc, dollarValue: dv });
  };
  // Highest $ reward this customer can currently afford.
  const bestRewardValue = (points: number) =>
    rewards
      .filter((r) => r.isActive && points >= r.pointsCost)
      .reduce((max, r) => Math.max(max, r.dollarValue), 0);

  const filteredCustomers = customers
    .filter(c => (c.loyaltyPoints || 0) > 0 || searchQuery)
    .filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.phone?.includes(searchQuery) || c.email?.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => (b.loyaltyPoints || 0) - (a.loyaltyPoints || 0));

  const totalPointsIssued = transactions.filter(t => t.points > 0).reduce((s, t) => s + t.points, 0);
  const totalPointsRedeemed = transactions.filter(t => t.points < 0).reduce((s, t) => s + Math.abs(t.points), 0);
  const totalActivePoints = customers.reduce((s, c) => s + (c.loyaltyPoints || 0), 0);

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Loyalty Program</h1>
            <p className="text-muted-foreground">Reward your clients and keep them coming back</p>
          </div>
          <Button onClick={() => setShowAdjust(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Adjust Points
          </Button>
        </div>

        {/* Earning rate */}
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <Star className="h-5 w-5 text-amber-500" />
              <h3 className="font-semibold">Earning Rate</h3>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="ppd">Points earned per $1 spent</Label>
                <Input
                  id="ppd"
                  type="number"
                  min="0"
                  step="0.5"
                  className="w-32"
                  value={effectiveRate}
                  onChange={(e) => setRateDraft(e.target.value)}
                />
              </div>
              <Button
                onClick={() => saveConfig.mutate({ enabled: config?.enabled !== false, pointsPerDollar: parseFloat(effectiveRate) || 1 })}
                disabled={saveConfig.isPending || rateDraft === "" || !(parseFloat(effectiveRate) > 0)}
              >
                {saveConfig.isPending ? "Saving…" : "Save"}
              </Button>
              <p className="text-sm text-muted-foreground">
                A $80 sale earns <span className="font-medium text-foreground">{Math.round(80 * (parseFloat(effectiveRate) || 1))}</span> points.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Rewards catalogue */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gift className="h-4 w-4 text-primary" /> Rewards
            </CardTitle>
            <p className="text-sm text-muted-foreground">Customers redeem points for money off their ticket. You choose the point cost and the discount.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {rewards.length === 0 && (
              <p className="text-sm text-muted-foreground py-2">No rewards yet — add one below.</p>
            )}
            {rewards.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <div className="flex-1 min-w-[160px]">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {r.pointsCost.toLocaleString()} points → ${r.dollarValue.toFixed(2)} off
                  </div>
                </div>
                <Button
                  variant={r.isActive ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => updateReward.mutate({ id: r.id, isActive: !r.isActive })}
                >
                  {r.isActive ? "Active" : "Inactive"}
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteReward.mutate(r.id)}>
                  Remove
                </Button>
              </div>
            ))}

            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed p-3">
              <div className="space-y-1 flex-1 min-w-[160px]">
                <Label htmlFor="rw-name">Reward name</Label>
                <Input id="rw-name" placeholder="e.g. $10 off" value={newReward.name}
                  onChange={(e) => setNewReward({ ...newReward, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rw-pts">Points cost</Label>
                <Input id="rw-pts" type="number" min="1" className="w-28" placeholder="200" value={newReward.pointsCost}
                  onChange={(e) => setNewReward({ ...newReward, pointsCost: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rw-val">$ off</Label>
                <Input id="rw-val" type="number" min="0" step="0.01" className="w-28" placeholder="10.00" value={newReward.dollarValue}
                  onChange={(e) => setNewReward({ ...newReward, dollarValue: e.target.value })} />
              </div>
              <Button onClick={handleAddReward} disabled={createReward.isPending}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-amber-500">{totalActivePoints.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Active Points</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-emerald-500">{totalPointsIssued.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Points Issued</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-indigo-500">{totalPointsRedeemed.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Points Redeemed</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="leaderboard">
          <TabsList>
            <TabsTrigger value="leaderboard">Client Leaderboard</TabsTrigger>
            <TabsTrigger value="history">Transaction History</TabsTrigger>
          </TabsList>

          <TabsContent value="leaderboard" className="mt-4 space-y-3">
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search clients..."
            />
            {filteredCustomers.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Award className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No clients with loyalty points yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Points are earned automatically when appointments are completed</p>
                </CardContent>
              </Card>
            ) : (
              filteredCustomers.map((customer, i) => (
                <Card key={customer.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                          style={{ background: i === 0 ? "#f59e0b22" : i === 1 ? "#9ca3af22" : "#cd7f3222", color: i === 0 ? "#f59e0b" : i === 1 ? "#6b7280" : "#cd7f32" }}>
                          {i + 1}
                        </div>
                        <div>
                          <div className="font-medium">{customer.name}</div>
                          <div className="text-xs text-muted-foreground">{customer.phone || customer.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="font-bold text-amber-500">{(customer.loyaltyPoints || 0).toLocaleString()} pts</div>
                          <div className="text-xs text-muted-foreground">
                            {bestRewardValue(customer.loyaltyPoints || 0) > 0
                              ? `can redeem $${bestRewardValue(customer.loyaltyPoints || 0).toFixed(2)}`
                              : "no reward yet"}
                          </div>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => openAdjust(customer)}>
                          Adjust
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4 space-y-2">
            {transactions.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No transactions yet</p>
                </CardContent>
              </Card>
            ) : (
              transactions.slice(0, 100).map(t => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-full ${t.points > 0 ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"}`}>
                      {t.points > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{(t.customer as any)?.fullName || t.customer?.name || "Unknown"}</div>
                      <div className="text-xs text-muted-foreground">{t.description}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${t.points > 0 ? "text-emerald-500" : "text-red-500"}`}>
                      {t.points > 0 ? "+" : ""}{t.points} pts
                    </div>
                    <div className="text-xs text-muted-foreground">{format(new Date(t.createdAt), "MMM d, yyyy")}</div>
                  </div>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Adjust Dialog */}
      <Dialog open={showAdjust} onOpenChange={(o) => { if (!o) { setShowAdjust(false); setSelectedCustomer(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Adjust Loyalty Points</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!selectedCustomer && (
              <div>
                <Label>Select Client</Label>
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by name or phone..."
                />
                {searchQuery && (
                  <div className="border rounded-lg mt-1 max-h-40 overflow-y-auto">
                    {customers.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 8).map(c => (
                      <button
                        key={c.id}
                        className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                        onClick={() => { setSelectedCustomer(c); setSearchQuery(""); }}
                      >
                        {c.name} · {c.loyaltyPoints || 0} pts
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {selectedCustomer && (
              <div className="bg-muted rounded-lg p-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">{selectedCustomer.name}</div>
                  <div className="text-sm text-muted-foreground">Current: {selectedCustomer.loyaltyPoints || 0} pts</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedCustomer(null)}>Change</Button>
              </div>
            )}
            <div>
              <Label>Adjustment Type</Label>
              <div className="flex gap-2 mt-1">
                {(["earn", "bonus", "redeem"] as const).map(t => (
                  <Button key={t} size="sm" variant={adjustType === t ? "default" : "outline"} onClick={() => setAdjustType(t)} className="capitalize flex-1">
                    {t}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label>Points</Label>
              <Input type="number" min="1" value={adjustPoints} onChange={e => setAdjustPoints(e.target.value)} placeholder="100" />
            </div>
            <div>
              <Label>Note</Label>
              <Input value={adjustNote} onChange={e => setAdjustNote(e.target.value)} placeholder="e.g., Referral reward, Special occasion" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdjust(false); setSelectedCustomer(null); }}>Cancel</Button>
            <Button onClick={handleAdjust} disabled={!selectedCustomer || adjustMutation.isPending}>
              {adjustMutation.isPending ? "Adjusting..." : "Apply Adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
