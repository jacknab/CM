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

  const filteredCustomers = customers
    .filter(c => (c.loyaltyPoints || 0) > 0 || searchQuery)
    .filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.phone?.includes(searchQuery) || c.email?.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => (b.loyaltyPoints || 0) - (a.loyaltyPoints || 0));

  const totalPointsIssued = transactions.filter(t => t.points > 0).reduce((s, t) => s + t.points, 0);
  const totalPointsRedeemed = transactions.filter(t => t.points < 0).reduce((s, t) => s + Math.abs(t.points), 0);
  const totalActivePoints = customers.reduce((s, c) => s + (c.loyaltyPoints || 0), 0);

  const POINTS_PER_DOLLAR = 1;
  const REDEEM_THRESHOLD = 100;
  const REDEEM_VALUE = 5;

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

        {/* Program Overview */}
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <Star className="h-5 w-5 text-amber-500" />
              <h3 className="font-semibold">Loyalty Program Rules</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="font-medium">Earn Points</div>
                <div className="text-muted-foreground">{POINTS_PER_DOLLAR} point per $1 spent</div>
              </div>
              <div>
                <div className="font-medium">Redeem Reward</div>
                <div className="text-muted-foreground">{REDEEM_THRESHOLD} points = ${REDEEM_VALUE} off</div>
              </div>
              <div>
                <div className="font-medium">Bonus Points</div>
                <div className="text-muted-foreground">Award manually for referrals and special occasions</div>
              </div>
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
                            ≈ ${Math.floor((customer.loyaltyPoints || 0) / REDEEM_THRESHOLD) * REDEEM_VALUE} value
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
