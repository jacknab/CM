import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelectedStore } from "@/hooks/use-store";
import { format } from "date-fns";
import {
  ArrowDownLeft, ArrowUpRight, Download, Search,
  BookOpen, DollarSign, MinusCircle, RefreshCw,
  TrendingUp, Loader2, Plus, X, SlidersHorizontal,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type LedgerEntry = {
  id: string;
  date: string;
  type: "earning" | "deduction" | "adjustment" | "payout";
  category: string;
  contractorId: number;
  contractorName: string;
  description: string;
  amount: number;
  runningBalance?: number;
};

type LedgerSummary = {
  totalEarnings: number;
  totalDeductions: number;
  totalPayouts: number;
  totalAdjustments: number;
  netBalance: number;
};

type LedgerData = {
  entries: LedgerEntry[];
  total: number;
  summary: LedgerSummary;
  contractors: Array<{ id: number; name: string }>;
};

const TYPE_CONFIG = {
  earning:    { icon: ArrowUpRight,  color: "text-emerald-600", bg: "bg-emerald-50", label: "Earning",    badge: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  deduction:  { icon: ArrowDownLeft, color: "text-red-500",     bg: "bg-red-50",     label: "Deduction",  badge: "bg-red-50 text-red-600 ring-1 ring-red-200" },
  adjustment: { icon: RefreshCw,     color: "text-violet-600",  bg: "bg-violet-50",  label: "Adjustment", badge: "bg-violet-50 text-violet-700 ring-1 ring-violet-200" },
  payout:     { icon: TrendingUp,    color: "text-blue-600",    bg: "bg-blue-50",    label: "Payout",     badge: "bg-blue-50 text-blue-700 ring-1 ring-blue-200" },
} as const;

function fmt$(n: number) {
  return `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string) {
  try { return format(new Date(d + "T00:00:00"), "MMM d"); } catch { return d; }
}

const TYPE_FILTERS = ["All Types", "Earnings", "Deductions", "Adjustments", "Payouts"] as const;
const TYPE_MAP: Record<string, string | null> = {
  "All Types":  null,
  "Earnings":   "earning",
  "Deductions": "deduction",
  "Adjustments":"adjustment",
  "Payouts":    "payout",
};

function downloadLedgerCSV(entries: LedgerEntry[], storeName: string) {
  const rows = [
    ["Entry ID", "Date", "Type", "Category", "Contractor", "Description", "Amount", "Running Balance"],
    ...entries.map(e => [
      e.id,
      e.date,
      e.type,
      e.category,
      e.contractorName,
      e.description,
      e.amount >= 0 ? e.amount.toFixed(2) : e.amount.toFixed(2),
      e.runningBalance != null ? e.runningBalance.toFixed(2) : "",
    ]),
  ];
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ledger-${storeName.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function AdjustmentDialog({
  open,
  onClose,
  contractors,
  storeId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  contractors: Array<{ id: number; name: string }>;
  storeId: number;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [contractorId, setContractorId] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Manual Adjustment");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contractorId || !amount || !description || !date) {
      toast({ title: "All fields are required", variant: "destructive" }); return;
    }
    const num = parseFloat(amount);
    if (isNaN(num) || num === 0) {
      toast({ title: "Enter a non-zero amount (positive = credit, negative = deduction)", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const r = await fetch(`/api/contractor-payouts/ledger/adjustment?storeId=${storeId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractorId: Number(contractorId), amount: num, category, description, date, storeId }),
      });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: "Adjustment recorded" });
      onSuccess();
      onClose();
      setContractorId(""); setAmount(""); setCategory("Manual Adjustment");
      setDescription(""); setDate(new Date().toISOString().split("T")[0]);
    } catch (err: any) {
      toast({ title: "Failed to record adjustment", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Manual Adjustment</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-1">
            <Label>Contractor</Label>
            <Select value={contractorId} onValueChange={setContractorId}>
              <SelectTrigger>
                <SelectValue placeholder="Select contractor…" />
              </SelectTrigger>
              <SelectContent>
                {contractors.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Amount</Label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="Positive = credit  ·  Negative = deduction"
            />
            <p className="text-xs text-muted-foreground">e.g. +50.00 for a booth rent credit, -25.00 for a supply charge</p>
          </div>

          <div className="space-y-1">
            <Label>Category</Label>
            <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Booth Rent Credit" />
          </div>

          <div className="space-y-1">
            <Label>Description</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Reason for this adjustment…" />
          </div>

          <div className="space-y-1">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-violet-600 hover:bg-violet-700 text-white">
              {saving ? "Saving…" : "Record Adjustment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function PayoutsLedger() {
  const { selectedStore } = useSelectedStore();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("All Types");
  const [contractorFilter, setContractorFilter] = useState<string>("all");
  const [displayLimit, setDisplayLimit] = useState(50);
  const [showAdjDialog, setShowAdjDialog] = useState(false);

  useEffect(() => { setDisplayLimit(50); }, [search, typeFilter, contractorFilter]);

  const { data, isLoading } = useQuery<LedgerData>({
    queryKey: ["/api/contractor-payouts/ledger", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/contractor-payouts/ledger?storeId=${selectedStore!.id}&limit=500`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch ledger");
      return res.json();
    },
    enabled: !!selectedStore?.id,
    refetchInterval: 60_000,
  });

  const summary = data?.summary;

  const filtered = (data?.entries ?? []).filter(e => {
    const q = search.toLowerCase();
    const matchQ = !q ||
      e.contractorName.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q) ||
      e.id.toLowerCase().includes(q);
    const matchType = !TYPE_MAP[typeFilter] || e.type === TYPE_MAP[typeFilter];
    const matchContractor = contractorFilter === "all" || String(e.contractorId) === contractorFilter;
    return matchQ && matchType && matchContractor;
  });

  const displayed = filtered.slice(0, displayLimit);

  const adjTotal = summary?.totalAdjustments ?? 0;
  const summaryCards = [
    { label: "Total Earnings",   value: fmt$(summary?.totalEarnings ?? 0),        icon: DollarSign,       color: "text-emerald-600", bg: "bg-emerald-50", positive: true },
    { label: "Total Deductions", value: `-${fmt$(summary?.totalDeductions ?? 0)}`, icon: MinusCircle,      color: "text-red-500",     bg: "bg-red-50",     positive: false },
    { label: "Disbursed",        value: fmt$(summary?.totalPayouts ?? 0),          icon: TrendingUp,       color: "text-blue-600",    bg: "bg-blue-50",    positive: false },
    { label: "Adjustments",      value: (adjTotal >= 0 ? "+" : "") + fmt$(adjTotal), icon: SlidersHorizontal, color: adjTotal >= 0 ? "text-violet-600" : "text-orange-500", bg: adjTotal >= 0 ? "bg-violet-50" : "bg-orange-50", positive: adjTotal >= 0 },
    { label: "Net Balance",      value: fmt$(summary?.netBalance ?? 0),             icon: BookOpen,         color: "text-teal-600",    bg: "bg-teal-50",    positive: true },
  ];

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>
            Earnings Ledger
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Append-only source of truth · {selectedStore?.name}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={() => setShowAdjDialog(true)}
            className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl gap-2"
            disabled={!data?.contractors?.length}
          >
            <Plus className="w-4 h-4" /> New Adjustment
          </Button>
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search entries…"
              className="pl-9 rounded-xl border-gray-200 bg-white w-52"
            />
          </div>
          <Button variant="outline" size="sm"
            onClick={() => downloadLedgerCSV(filtered, selectedStore?.name ?? "ledger")}
            disabled={filtered.length === 0}
            className="rounded-xl gap-2">
            <Download className="w-4 h-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summaryCards.map(s => (
          <Card key={s.label} className="rounded-2xl border-gray-100 shadow-sm">
            <CardContent className="p-5">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.bg} mb-3`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div className="text-xl font-bold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>
                {isLoading ? <span className="text-gray-300">—</span> : s.value}
              </div>
              <div className="text-sm text-gray-500 mt-0.5">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters row */}
      <div className="flex items-center gap-3 flex-wrap">
        {TYPE_FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setTypeFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              typeFilter === f
                ? "bg-teal-600 text-white shadow-sm"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {f}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-400">Contractor:</span>
          <Select value={contractorFilter} onValueChange={setContractorFilter}>
            <SelectTrigger className="w-44 rounded-xl border-gray-200 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">All contractors</SelectItem>
              {(data?.contractors ?? []).map(c => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Adjustment dialog */}
      {selectedStore?.id && (
        <AdjustmentDialog
          open={showAdjDialog}
          onClose={() => setShowAdjDialog(false)}
          contractors={data?.contractors ?? []}
          storeId={selectedStore.id}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/contractor-payouts/ledger", selectedStore?.id] })}
        />
      )}

      {/* Immutability banner */}
      <div className="bg-teal-50 border border-teal-200 rounded-2xl px-5 py-3 flex items-center gap-3">
        <BookOpen className="w-4 h-4 text-teal-600 shrink-0" />
        <p className="text-sm font-medium text-teal-700">
          This ledger is append-only. Records are never deleted or modified — corrections are made via new Adjustment entries. Use the <strong>New Adjustment</strong> button above to record booth rent credits, manual deductions, or other corrections.
        </p>
      </div>

      {/* Ledger table */}
      <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-sm">Loading ledger…</p>
          </div>
        ) : filtered.length === 0 ? (
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center mb-4">
              <BookOpen className="w-7 h-7 text-teal-300" />
            </div>
            <p className="text-sm text-gray-500">No ledger entries yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Entries appear here when payout runs are created and approved.
            </p>
          </CardContent>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-medium text-gray-400 uppercase tracking-wide bg-gray-50/60 border-b border-gray-100">
                  <th className="text-left px-6 py-3">Entry ID</th>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Contractor</th>
                  <th className="text-left px-4 py-3">Description</th>
                  <th className="text-right px-4 py-3">Amount</th>
                  <th className="text-right px-6 py-3">Running Balance</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(e => {
                  const cfg = TYPE_CONFIG[e.type] ?? TYPE_CONFIG.earning;
                  const Icon = cfg.icon;
                  const initials = e.contractorName.split(" ").map(s => s[0]).join("").slice(0, 2);
                  return (
                    <tr key={e.id} className="border-t border-gray-50 hover:bg-gray-50/40 transition-colors">
                      <td className="px-6 py-3.5">
                        <span className="font-mono text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded">{e.id}</span>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-500 whitespace-nowrap">
                        {fmtDate(e.date)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.badge}`}>
                          <Icon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                            {initials}
                          </div>
                          <span className="text-sm text-gray-700 whitespace-nowrap">{e.contractorName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-500 max-w-[280px] truncate">
                        {e.description}
                      </td>
                      <td className={`px-4 py-3.5 text-right font-semibold tabular-nums ${e.amount >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {e.amount >= 0 ? "+" : ""}
                        {e.amount >= 0 ? fmt$(e.amount) : `-${fmt$(e.amount)}`}
                      </td>
                      <td className="px-6 py-3.5 text-right font-mono text-sm text-gray-700">
                        {e.runningBalance != null ? fmt$(e.runningBalance) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                Showing {displayed.length} of {filtered.length} entries
              </span>
              {filtered.length > displayed.length && (
                <button
                  onClick={() => setDisplayLimit(l => l + 50)}
                  className="text-sm font-medium text-teal-600 hover:underline"
                >
                  Load more →
                </button>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
