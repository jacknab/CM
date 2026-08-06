import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSelectedStore } from "@/hooks/use-store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Gift, Plus, Search, DollarSign, CheckCircle, XCircle, Copy, BarChart3, AlertTriangle, TrendingUp, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";

type GiftCardAnalytics = {
  totalCards: number;
  activeCards: number;
  expiredOrDeactivated: number;
  expiringSoon: number;
  totalIssued: string;
  totalOutstanding: string;
  totalRedeemed: string;
  redemptionRate: string;
  avgCardValue: string;
  monthlyTrend: Array<{ month: string; issued: number; value: number }>;
};

type GiftCard = {
  id: number;
  code: string;
  originalAmount: string;
  remainingBalance: string;
  issuedToName?: string;
  issuedToEmail?: string;
  isActive: boolean;
  expiresAt?: string;
  createdAt: string;
  notes?: string;
};

function GiftCardReport() {
  const { selectedStore } = useSelectedStore();
  const { data, isLoading, refetch } = useQuery<GiftCardAnalytics>({
    queryKey: ["/api/gift-cards/analytics", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch("/api/gift-cards/analytics", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!selectedStore?.id,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Loading analytics…</div>;
  }

  if (!data) {
    return <div className="text-center py-12 text-muted-foreground">No data available</div>;
  }

  const statCards = [
    { label: "Total Issued", value: `$${parseFloat(data.totalIssued).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, sub: `${data.totalCards} cards`, color: "text-indigo-600" },
    { label: "Outstanding Balance", value: `$${parseFloat(data.totalOutstanding).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, sub: `${data.activeCards} active cards`, color: "text-amber-600" },
    { label: "Total Redeemed", value: `$${parseFloat(data.totalRedeemed).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, sub: `${data.redemptionRate}% redemption rate`, color: "text-emerald-600" },
    { label: "Avg Card Value", value: `$${parseFloat(data.avgCardValue).toFixed(2)}`, sub: `${data.expiredOrDeactivated} deactivated`, color: "text-blue-600" },
  ];

  return (
    <div className="space-y-6">
      {/* Refresh */}
      <div className="flex justify-end">
        <button onClick={() => refetch()} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-sm font-medium text-foreground mt-0.5">{s.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Expiring soon alert */}
      {data.expiringSoon > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            <strong>{data.expiringSoon} gift card{data.expiringSoon !== 1 ? "s" : ""}</strong> expire{data.expiringSoon === 1 ? "s" : ""} within the next 60 days.
            Consider reaching out to card holders.
          </p>
        </div>
      )}

      {/* Monthly trend chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-indigo-500" />
            Cards Issued — Last 6 Months
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.monthlyTrend.every(m => m.issued === 0) ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No cards issued in the last 6 months</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.monthlyTrend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value: number, name: string) =>
                    name === "issued" ? [`${value} card${value !== 1 ? "s" : ""}`, "Issued"] : [`$${value.toFixed(2)}`, "Value"]
                  }
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="issued" fill="#6366f1" radius={[4, 4, 0, 0]}>
                  {data.monthlyTrend.map((_, i) => (
                    <Cell key={i} fill={i === data.monthlyTrend.length - 1 ? "#4f46e5" : "#a5b4fc"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Liability note */}
      <div className="rounded-xl bg-muted/40 border border-border px-4 py-3 text-sm text-muted-foreground">
        <strong className="text-foreground">Liability:</strong> Your outstanding gift card balance of{" "}
        <strong className="text-foreground">${parseFloat(data.totalOutstanding).toFixed(2)}</strong> represents
        funds you hold on behalf of card holders. This should be accounted for in your financial records.
      </div>
    </div>
  );
}

export default function GiftCards() {
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [checkCode, setCheckCode] = useState("");
  const [checkedCard, setCheckedCard] = useState<GiftCard | null>(null);
  const [redeemAmount, setRedeemAmount] = useState("");

  const [form, setForm] = useState({
    amount: "",
    issuedToName: "",
    issuedToEmail: "",
    expiresAt: "",
    notes: "",
  });

  const { data: cards = [], isLoading } = useQuery<GiftCard[]>({
    queryKey: ["/api/gift-cards"],
    enabled: !!selectedStore,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/gift-cards", data);
      return res.json() as Promise<GiftCard>;
    },
    onSuccess: (card: GiftCard) => {
      queryClient.invalidateQueries({ queryKey: ["/api/gift-cards"] });
      setShowCreate(false);
      setForm({ amount: "", issuedToName: "", issuedToEmail: "", expiresAt: "", notes: "" });
      toast({ title: `Gift card created! Code: ${card.code}` });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("PUT", `/api/gift-cards/${id}`, { isActive: false });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gift-cards"] });
      toast({ title: "Gift card deactivated" });
    },
  });

  const handleCheck = async () => {
    if (!checkCode.trim()) return;
    try {
      const res = await apiRequest("GET", `/api/gift-cards/check/${checkCode.trim().toUpperCase()}`);
      setCheckedCard(await res.json() as GiftCard);
    } catch {
      setCheckedCard(null);
      toast({ title: "Card not found", variant: "destructive" });
    }
  };

  const handleRedeem = async (): Promise<void> => {
    if (!checkedCard || !redeemAmount) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    const amt = parseFloat(redeemAmount);
    if (isNaN(amt) || amt <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    if (amt > parseFloat(checkedCard.remainingBalance)) {
      toast({ title: "Insufficient balance", variant: "destructive" });
      return;
    }
    try {
      await apiRequest("POST", "/api/gift-cards/redeem", { code: checkedCard.code, amount: amt });
      queryClient.invalidateQueries({ queryKey: ["/api/gift-cards"] });
      setCheckedCard(null);
      setCheckCode("");
      setRedeemAmount("");
      toast({ title: `$${amt.toFixed(2)} redeemed successfully` });
    } catch {
      toast({ title: "Redemption failed", variant: "destructive" });
    }
  };

  const handleCreate = (): void => {
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" });
      return;
    }
    createMutation.mutate({ ...form, amount, storeId: selectedStore?.id });
  };

  const totalActive = cards.filter(c => c.isActive);
  const totalValue = totalActive.reduce((s, c) => s + parseFloat(c.remainingBalance), 0);

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Code copied!" });
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Gift Cards</h1>
            <p className="text-muted-foreground">Issue and manage gift cards for your business</p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Issue Gift Card
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-emerald-500">{totalActive.length}</div>
              <div className="text-sm text-muted-foreground">Active Cards</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-indigo-500">${totalValue.toFixed(2)}</div>
              <div className="text-sm text-muted-foreground">Outstanding Balance</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-amber-500">{cards.filter(c => !c.isActive).length}</div>
              <div className="text-sm text-muted-foreground">Used / Deactivated</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="cards">
          <TabsList>
            <TabsTrigger value="cards">All Cards</TabsTrigger>
            <TabsTrigger value="redeem">Check & Redeem</TabsTrigger>
            <TabsTrigger value="report">
              <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
              Report
            </TabsTrigger>
          </TabsList>

          <TabsContent value="report" className="mt-4">
            <GiftCardReport />
          </TabsContent>

          <TabsContent value="cards" className="space-y-3 mt-4">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : cards.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Gift className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No gift cards issued yet</p>
                  <Button className="mt-4" onClick={() => setShowCreate(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Issue First Card
                  </Button>
                </CardContent>
              </Card>
            ) : (
              cards.map(card => (
                <Card key={card.id} className={!card.isActive ? "opacity-60" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <button
                            onClick={() => copyCode(card.code)}
                            className="font-mono font-bold text-lg hover:text-primary transition-colors flex items-center gap-1"
                          >
                            {card.code}
                            <Copy className="h-3 w-3" />
                          </button>
                          <Badge variant={card.isActive ? "default" : "secondary"}>
                            {card.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground space-y-0.5">
                          <div>
                            Balance: <span className="font-semibold text-foreground">${parseFloat(card.remainingBalance).toFixed(2)}</span>
                            <span className="text-xs"> / ${parseFloat(card.originalAmount).toFixed(2)} original</span>
                          </div>
                          {card.issuedToName && <div>Issued to: {card.issuedToName} {card.issuedToEmail && `(${card.issuedToEmail})`}</div>}
                          {card.expiresAt && <div>Expires: {format(new Date(card.expiresAt), "MMM d, yyyy")}</div>}
                          {card.notes && <div className="italic">"{card.notes}"</div>}
                          <div className="text-xs">Created {format(new Date(card.createdAt), "MMM d, yyyy")}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold">
                          ${parseFloat(card.remainingBalance).toFixed(2)}
                        </div>
                        {card.isActive && (
                          <Button size="sm" variant="ghost" className="text-red-500 mt-1" onClick={() => deactivateMutation.mutate(card.id)}>
                            Deactivate
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="redeem" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Check Gift Card Balance & Redeem</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={checkCode}
                    onChange={e => setCheckCode(e.target.value.toUpperCase())}
                    placeholder="Enter gift card code (e.g. GC-ABCD1234)"
                    className="font-mono"
                    onKeyDown={e => e.key === "Enter" && handleCheck()}
                  />
                  <Button onClick={handleCheck}>
                    <Search className="h-4 w-4 mr-2" />
                    Check
                  </Button>
                </div>

                {checkedCard && (
                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      {checkedCard.isActive ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                      <span className="font-bold font-mono text-lg">{checkedCard.code}</span>
                      <Badge variant={checkedCard.isActive ? "default" : "destructive"}>
                        {checkedCard.isActive ? "Valid" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="text-3xl font-bold text-emerald-500">
                      ${parseFloat(checkedCard.remainingBalance).toFixed(2)}
                      <span className="text-sm text-muted-foreground font-normal"> remaining</span>
                    </div>
                    {checkedCard.issuedToName && (
                      <div className="text-sm text-muted-foreground">Issued to: {checkedCard.issuedToName}</div>
                    )}
                    {checkedCard.expiresAt && (
                      <div className="text-sm text-muted-foreground">
                        Expires: {format(new Date(checkedCard.expiresAt), "MMM d, yyyy")}
                      </div>
                    )}
                    {checkedCard.isActive && parseFloat(checkedCard.remainingBalance) > 0 && (
                      <div className="flex gap-2 pt-2 border-t">
                        <Input
                          type="number"
                          min="0.01"
                          step="0.01"
                          max={checkedCard.remainingBalance}
                          value={redeemAmount}
                          onChange={e => setRedeemAmount(e.target.value)}
                          placeholder="Amount to redeem"
                          className="max-w-[150px]"
                        />
                        <Button onClick={handleRedeem} className="bg-emerald-600 hover:bg-emerald-700">
                          <DollarSign className="h-4 w-4 mr-1" />
                          Redeem
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Issue Gift Card</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Amount ($) *</Label>
              <Input
                type="number"
                min="1"
                step="0.01"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="50.00"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Recipient Name</Label>
                <Input value={form.issuedToName} onChange={e => setForm(f => ({ ...f, issuedToName: e.target.value }))} placeholder="Jane Smith" />
              </div>
              <div>
                <Label>Recipient Email</Label>
                <Input value={form.issuedToEmail} onChange={e => setForm(f => ({ ...f, issuedToEmail: e.target.value }))} placeholder="jane@example.com" />
              </div>
            </div>
            <div>
              <Label>Expiry Date (optional)</Label>
              <Input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Birthday gift, etc." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Issue Gift Card"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
